// Using items from inventories: eating, drinking, medicine, reading, sundries, opening packs, cutting, and
// picking things up from cardboard boxes on the floor.
import { item, itemName, CAT, SUB, isMeat, isAnimalProduct, dishOutput } from '../data/db.js';
import { MEDICINE, BOOKS, SUNDRIES, PACKS, PACK_POOLS, RECYCLE } from '../content/itemEffects.js';
import { addStat, raiseMax, addEffect, removeEffect, rollOverdueDebuff, bumpDaily, dailyCount, hasEffect, effectiveMax } from './stats.js';
import { getMods } from './modifiers.js';
import { findUid, removeUid, insert, makeInstance, moveItem, destroyInventory } from './inventory.js';
import { addProfExp, addProfLevels } from './proficiency.js';
import { rand, pick } from '../engine/rng.js';
import { emit } from '../engine/bus.js';
import { registerKind, isWalkableHome } from './actions.js';
import { tr, pickLang } from '../engine/i18n.js';
import { dropToFloor } from './home.js';
import { isExpired } from './spoilage.js';

// What is left over once a food is finished. Only the tinned foods ("…罐头") are listed: the config has no empty
// bottle or jar item, and the Washed Empty Can (24118) is the only waste item.
export const WASTE = {
  2115: 24118, // Canned Luncheon Meat
  2123: 24118, // Canned Yellow Peaches
  2149: 24118, // Canned Herring
  9030: 24118, // Canned Tuna
};

export function useDurationMin(cfg) {
  if (!cfg) return 5;
  switch (cfg.cat) {
    case CAT.FOOD:
      if (cfg.sub === SUB.SOFT_DRINK || cfg.sub === SUB.LIQUOR) return 5;
      return cfg.sat >= 25 ? 20 : 10;
    case CAT.MEDICINE:
      return 5;
    case CAT.BOOK:
      return BOOKS[cfg.id]?.dur ?? (isDocument(cfg) ? 3 : 60);
    case CAT.DAILY:
    case CAT.CONSOLE:
      return SUNDRIES[cfg.id]?.dur ?? 10;
    default:
      return 5;
  }
}

// What can the player do with an item? Returns list of { op, label }.
export function itemOps(state, inst) {
  const cfg = item(inst.id);
  const ops = [];
  if (!cfg) return ops;
  if (cfg.cut) ops.push({ op: 'cut', label: tr('ui.cut') });
  if (cfg.cat === CAT.FOOD && !cfg.noUse) ops.push({ op: 'eat', label: tr('ui.eat') });
  if (cfg.cat === CAT.MEDICINE && !cfg.id.toString().startsWith('216')) ops.push({ op: 'use', label: tr('ui.use') });
  if (cfg.cat === CAT.BOOK && (BOOKS[cfg.id] || cfg.story || cfg.id >= 9010)) ops.push({ op: 'read', label: tr('ui.read') });
  if ((cfg.cat === CAT.DAILY || cfg.cat === CAT.CONSOLE) && SUNDRIES[cfg.id]) ops.push({ op: 'use', label: SUNDRIES[cfg.id].wear ? pickLang({ en: 'Wear', zh: '穿戴' }) : tr('ui.use') });
  if (PACKS[cfg.id] || cfg.cat === CAT.PACK) ops.push({ op: 'open', label: tr('ui.open') });
  // taking a keepsake apart is its use (the config's uses 1)
  if (RECYCLE[cfg.id]) ops.push({ op: 'use', label: cfg.id === 24115 ? pickLang({ en: 'Bury in a Pot', zh: '埋进花盆' }) : pickLang({ en: 'Recycle', zh: '回收' }) });
  if (cfg.cat === CAT.TRAP && state.phase !== 'pre') ops.push({ op: 'placeTrap', label: tr('ui.setTrap'), panel: 'trapPlace' });
  return ops;
}

export function canUseNow(state, inst) {
  const cfg = item(inst.id);
  if (!cfg) return 'Unknown item';
  const lim = SUNDRIES[cfg.id]?.daily || MEDICINE[cfg.id]?.daily || cfg.daily;
  if (lim && dailyCount(state, `use:${cfg.id}`) >= lim) return tr('ui.dailyLimit') === 'ui.dailyLimit' ? 'Already used today.' : tr('ui.dailyLimit');
  const wear = SUNDRIES[cfg.id]?.wear;
  if (wear && state.player.worn?.[wear]) return pickLang({ en: 'You are already wearing one.', zh: '已经穿戴上了。' });
  return true;
}

// Uses up one serving or unit. Returns true when a whole unit is gone (its container is empty).
function consumeOne(state, inv, inst) {
  const cfg = item(inst.id);
  if (cfg.uses > 1) {
    inst.uses = (inst.uses ?? cfg.uses) - 1;
    if (inst.uses <= 0) removeUid(inv, inst.uid);
    return inst.uses <= 0;
  }
  if (cfg.uses === -1) return false; // reusable (e.g. dumbbells, luxury watch)
  if ((inst.qty || 1) > 1) inst.qty -= 1;
  else removeUid(inv, inst.uid);
  return true;
}

// Patch 08-18: waste goes into the backpack rather than staying in the furniture the food came from; when the
// backpack is full it stays in that container, and failing that it lands at the survivor's feet.
export function placeWaste(state, from, id) {
  const inst = makeInstance(state, id);
  const bp = state.inventories[state.player.backpack];
  if (bp && insert(bp, inst)) {
    emit('gotItem', { id, waste: true });
    return 'backpack';
  }
  if (from && from !== bp && insert(from, inst)) return 'container';
  dropToFloor(state, inst, state.player.floor, state.player.x, state.player.y);
  return 'floor';
}

// Big dishes (patch 07-14) are eaten over several sittings: eat until full and leave the rest on the plate.
export const BIG_DISH_SAT = 60;

export function eatItem(state, inv, inst) {
  const cfg = item(inst.id);
  const mods = getMods(state);
  const expired = isExpired(inst, cfg);
  const buff = (hasEffect(state, 'gourmet') ? 1.3 : 1) * (hasEffect(state, 'gameCook') && (cfg.sub === SUB.MEAT || cfg.sub === SUB.FISH) ? 1.5 : 1);
  const left = inst.left ?? 1;
  const whole = cfg.sat * mods.eatSat * buff;
  const room = Math.max(0, effectiveMax(state, 'sat') - state.player.stats.sat);
  let portion = left;
  if (!(cfg.uses > 1) && cfg.sat >= BIG_DISH_SAT && whole * left > room + 5) portion = Math.min(left, Math.max(0.25, room / whole));
  const satGained = addStat(state, 'sat', whole * portion, 'eat');
  state.progress.counters['food.sat'] = (state.progress.counters['food.sat'] || 0) + Math.max(0, satGained);
  addStat(state, 'mor', cfg.mor * portion, 'eat');
  if (cfg.sta) addStat(state, 'sta', cfg.sta * portion, 'eat');
  if (cfg.hp) addStat(state, 'life', cfg.hp * portion, 'eat');
  if (cfg.v4) raiseMax(state, 'sta', 0, 'eat');
  if (expired) rollOverdueDebuff(state, cfg, () => rand(state));
  else if (cfg.cook && (cfg.sub === SUB.MEAT || cfg.sub === SUB.FISH) && !dishOutput[cfg.id] && rand(state) < 0.25) {
    addEffect(state, '1101', 6);
  }
  if (cfg.sub === SUB.SOFT_DRINK && [2136, 2526, 7].includes(cfg.id)) addEffect(state, 'caffeine', 4);
  if (cfg.id === 2913) {
    removeEffect(state, 'cold');
    addEffect(state, 'warm', 3);
  }
  const dish = dishOutput[cfg.id];
  if (dish && dish.quality <= 1) addEffect(state, 'wellFed', 6);
  if (isMeat(cfg) || isAnimalProduct(cfg)) state.progress.taboo.meat = true;
  state.progress.counters['food.eaten'] = (state.progress.counters['food.eaten'] || 0) + 1;
  markCodex(state, 'food', cfg.id);
  if (cfg.prey) markCodex(state, 'prey', cfg.id);
  if (left - portion > 0.05) inst.left = Math.round((left - portion) * 100) / 100;
  else if (consumeOne(state, inv, inst) && WASTE[cfg.id]) placeWaste(state, inv, WASTE[cfg.id]);
  emit('ate', { id: cfg.id, expired, portion });
  checkWish(state, cfg.id);
}

export function markCodex(state, cat, id) {
  const list = state.progress.codexRun[cat];
  if (list && !list.includes(id)) {
    list.push(id);
    emit('codex', { cat, id });
  }
}

function checkWish(state, id) {
  const w = state.run.wish;
  if (w && !w.done && w.items.includes(id)) {
    w.done = true;
    addStat(state, 'mor', 15, 'wish');
    state.loop.planningPoints += 10;
    emit('toast', { text: tr('wish.fulfilled'), kind: 'good' });
  }
}

function applyStatsBlock(state, blk) {
  if (!blk) return;
  if (blk.stats) for (const [k, v] of Object.entries(blk.stats)) addStat(state, k, v, 'item');
  if (blk.max) for (const [k, v] of Object.entries(blk.max)) raiseMax(state, k, v, 'item');
  if (blk.cure) for (const id of blk.cure) removeEffect(state, id);
  if (blk.add) for (const [id, h] of blk.add) addEffect(state, id, h);
}

export function useMedicine(state, inv, inst) {
  const cfg = item(inst.id);
  const eff = MEDICINE[cfg.id] || { stats: { life: cfg.hp || 5 } };
  applyStatsBlock(state, eff);
  bumpDaily(state, `use:${cfg.id}`);
  consumeOne(state, inv, inst);
}

// Story documents (clues, stubs, letters, notes) are a quick read, unlike skill books and novels.
export function isDocument(cfg) {
  return !!cfg && cfg.cat === CAT.BOOK && !BOOKS[cfg.id] && (cfg.id >= 9010 || !!cfg.story);
}

export function readBook(state, inv, inst) {
  const cfg = item(inst.id);
  const eff = BOOKS[cfg.id] || {};
  if (!eff.free && !isDocument(cfg)) addStat(state, 'sta', -10, 'read');
  applyStatsBlock(state, eff);
  if (eff.prof) for (const [k, v] of Object.entries(eff.prof)) addProfExp(state, k, v);
  if (eff.profLv) for (const [k, v] of Object.entries(eff.profLv)) addProfLevels(state, k, v);
  if (cfg.id >= 9010 || eff.story) emit('document', { id: cfg.id, state });
  state.progress.counters['book.read'] = (state.progress.counters['book.read'] || 0) + 1;
  // skill notes and story documents are consumed; novels are kept for re-reading until uses run out
  if (cfg.uses > 0 || eff.profLv || eff.prof) consumeOne(state, inv, inst);
}

export function useSundry(state, inv, inst) {
  const cfg = item(inst.id);
  const eff = SUNDRIES[cfg.id] || {};
  applyStatsBlock(state, eff);
  if (eff.wear) (state.player.worn ||= {})[eff.wear] = true;
  if (eff.points) state.loop.planningPoints += eff.points;
  if (eff.effect) addEffect(state, eff.effect[0], eff.effect[1]);
  bumpDaily(state, `use:${cfg.id}`);
  if (cfg.uses !== -1) consumeOne(state, inv, inst);
}

/** Takes a keepsake apart for the materials its config text names (RECYCLE). */
export function recycleItem(state, inv, inst) {
  const out = RECYCLE[inst.id];
  if (!out) return;
  consumeOne(state, inv, inst);
  for (const [id, n] of out) for (let i = 0; i < n; i++) placeWaste(state, inv, id);
}

export function openPack(state, inv, inst) {
  const cfg = item(inst.id);
  const pack = PACKS[cfg.id] || { rolls: 4, pool: 'material' };
  const out = [];
  for (const [id, n] of pack.give || []) for (let i = 0; i < n; i++) out.push(id);
  for (let i = 0; i < pack.rolls; i++) out.push(pick(state, PACK_POOLS[pack.pool]));
  removeUid(inv, inst.uid);
  for (const id of out) {
    const it = makeInstance(state, id);
    if (!insert(inv, it, { allowOverweight: true })) dropToFloor(state, it, state.player.floor, state.player.x, state.player.y);
  }
  return out;
}

export function cutItem(state, inv, inst) {
  const cfg = item(inst.id);
  const product = cfg.cut;
  const pieces = Math.max(2, Math.round(cfg.g / (item(product)?.g || 1000)));
  removeUid(inv, inst.uid);
  const out = [];
  for (let i = 0; i < pieces; i++) {
    const it = makeInstance(state, product, { age: inst.age });
    if (!insert(inv, it, { allowOverweight: true })) dropToFloor(state, it, state.player.floor, state.player.x, state.player.y);
    out.push(it);
  }
  return out;
}

// Action wrapper so item use takes game time.
registerKind('useItem', {
  canStart(state, a) {
    const inv = state.inventories[a.inv];
    const inst = inv && findUid(inv, a.uid);
    if (!inst) return 'Item is gone.';
    return canUseNow(state, inst);
  },
  complete(state, a) {
    const inv = state.inventories[a.inv];
    const inst = inv && findUid(inv, a.uid);
    if (!inst) return;
    switch (a.op) {
      case 'eat':
        return eatItem(state, inv, inst);
      case 'use': {
        const cfg = item(inst.id);
        if (RECYCLE[cfg.id]) return recycleItem(state, inv, inst);
        return cfg.cat === CAT.MEDICINE ? useMedicine(state, inv, inst) : useSundry(state, inv, inst);
      }
      case 'read':
        return readBook(state, inv, inst);
      case 'open':
        return openPack(state, inv, inst);
      case 'cut':
        return cutItem(state, inv, inst);
    }
  },
});

export function useItemAction(state, invId, uid, op) {
  const inst = findUid(state.inventories[invId], uid);
  const cfg = item(inst.id);
  const minutes = op === 'cut' ? 10 : op === 'open' || RECYCLE[cfg.id] ? 3 : useDurationMin(cfg);
  return { kind: 'useItem', inv: invId, uid, op, dur: minutes * 60, noWalk: true, label: `${op}` };
}

// ------------------------------------------------------------------------------ floor boxes
function floorBox(state, boxId) {
  return (state.floorBoxes || []).find((b) => b.id === boxId) || null;
}

// Where to stand to reach a floor box: its own tile when free, otherwise the nearest free tile around it.
function boxStandTile(state, box) {
  const around = [
    [0, 0],
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ];
  for (const [dx, dy] of around) {
    if (isWalkableHome(state, box.floor, box.x + dx, box.y + dy)) return { floor: box.floor, x: box.x + dx, y: box.y + dy };
  }
  return { floor: box.floor, x: box.x, y: box.y };
}

// Patch 08-16: whatever fits goes into the backpack and the rest stays in the box. An emptied box is gone.
export function pickUpFromBox(state, boxId, uid = null) {
  const box = floorBox(state, boxId);
  const inv = box && state.inventories[box.inv];
  const bp = state.inventories[state.player.backpack];
  if (!inv || !bp) return { moved: 0, left: 0 };
  const uids = uid != null ? [uid] : inv.items.map((it) => it.uid);
  let moved = 0;
  for (const u of uids) if (moveItem(state, inv, u, bp, null, null).ok) moved++;
  const left = uid != null ? uids.length - moved : inv.items.length;
  if (!inv.items.length) {
    state.floorBoxes = state.floorBoxes.filter((b) => b !== box);
    destroyInventory(state, box.inv);
  }
  return { moved, left };
}

// Walk to a floor box, then take one item (uid) or everything from it.
export function pickUpAction(state, box, uid = null) {
  const inst = uid != null ? findUid(state.inventories[box.inv], uid) : null;
  return {
    kind: 'pickUp',
    box: box.id,
    uid,
    target: boxStandTile(state, box),
    dur: inst ? 20 : 60,
    label: inst ? `${pickLang({ en: 'Pick up', zh: '拾取' })} ${itemName(inst.id)}` : pickLang({ en: 'Pick up the box', zh: '拾取纸箱' }),
  };
}

registerKind('pickUp', {
  canStart(state, a) {
    const inv = state.inventories[floorBox(state, a.box)?.inv];
    if (!inv?.items.length || (a.uid != null && !findUid(inv, a.uid))) return pickLang({ en: 'Nothing left there.', zh: '那里已经没有东西了。' });
    return true;
  },
  complete(state, a) {
    const r = pickUpFromBox(state, a.box, a.uid);
    if (r.left) emit('toast', { text: pickLang({ en: `The backpack is full: ${r.left} item(s) stay in the box.`, zh: `背包装不下了：还有${r.left}件留在纸箱里。` }), kind: 'bad' });
  },
});
