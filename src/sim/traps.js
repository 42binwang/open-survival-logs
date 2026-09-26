// Traps and hunting (dev log 06-03, patches 08-14/08-15/08-17/08-18/08-31).
// Trap items (Config_Item cat 12, item.trap = type) are placed in trap slots; bait is food with satiety.
import { item, CAT } from '../data/db.js';
import { registerKind, enqueue } from './actions.js';
import { registerSystem } from './tick.js';
import { createInventory, removeUid, insert, makeInstance, locateUid } from './inventory.js';
import { slotDef, allSlots, slotUsable, createFurniture, removeFurniture, dropToFloor } from './home.js';
import { addProfExp, profLevel } from './proficiency.js';
import { markCodex } from './itemuse.js';
import { getMods } from './modifiers.js';
import { rand, weighted } from '../engine/rng.js';
import { emit } from '../engine/bus.js';
import { pickLang } from '../engine/i18n.js';
import { itemName } from '../data/db.js';

export const TRAP_TYPES = {
  1: { durability: 10, prey: [30000, 30007, 30009, 30022], habitats: ['indoor', 'basement', 'warehouse'] },
  2: { durability: 15, prey: [30003, 30008, 30001, 30021, 30016, 30010, 30000, 30007], habitats: ['indoor', 'basement', 'warehouse', 'outdoor'] },
  3: { durability: 12, prey: [30011, 30004, 30012, 30013, 30005, 30002], habitats: ['outdoor'] },
  4: { durability: 20, prey: [30014, 30015, 30006, 30016, 30010, 30005], habitats: ['outdoor', 'warehouse'] },
};

// Habitat shifts odds toward realistic prey per location.
const HABITAT_BONUS = {
  basement: { 30003: 2, 30008: 2, 30007: 1.5, 30010: 1.5, 30001: 1.2 },
  indoor: { 30000: 2, 30009: 1.5, 30022: 1.2, 30002: 0.5 },
  outdoor: { 30011: 2, 30004: 1.8, 30012: 1.4, 30006: 1.5, 30014: 1.3, 30002: 1.2 },
  warehouse: { 30003: 1.8, 30008: 1.6, 30016: 2, 30021: 1.5, 30014: 1.2 },
};

export const RAT_IDS = new Set([30000, 30003, 30007, 30008, 30022]);

export function isTrapItem(id) {
  return item(id)?.cat === CAT.TRAP;
}

export function trapSlots(state, floor) {
  return allSlots(state).filter((s) => s.trap && (!floor || s.floor === floor) && slotUsable(state, s));
}

export function habitatOf(state, slot) {
  if (slot.outdoor) return 'outdoor';
  if (slot.floor === 'B1') return 'basement';
  if (state.home.id === 'warehouse') return 'warehouse';
  return 'indoor';
}

export const HABITAT_NAMES = {
  indoor: { en: 'Indoors', zh: '室内' },
  basement: { en: 'Basement', zh: '地下室' },
  warehouse: { en: 'Warehouse floor', zh: '仓库' },
  outdoor: { en: 'Terrace / balcony', zh: '露台' },
};

// Bird nets only work on a terrace, mousetraps only under a roof (config descriptions).
export function trapFits(state, trapItemId, slot) {
  const t = TRAP_TYPES[item(trapItemId)?.trap] || TRAP_TYPES[1];
  return !!slot && t.habitats.includes(habitatOf(state, slot));
}

export function trapHabitats(trapItemId) {
  return (TRAP_TYPES[item(trapItemId)?.trap] || TRAP_TYPES[1]).habitats;
}

export function placeTrap(state, trapItemId, slotId) {
  const slot = slotDef(state, slotId);
  if (!slot?.trap || state.home.slots[slotId] || !trapFits(state, trapItemId, slot)) return null;
  const t = TRAP_TYPES[item(trapItemId).trap] || TRAP_TYPES[1];
  const f = createFurniture(state, 'trap', slotId);
  const bait = createInventory(state, { kind: 'bait', w: 2, h: 2, owner: f.uid });
  const hold = createInventory(state, { kind: 'trapHold', w: 3, h: 3, owner: f.uid });
  f.data = { trapItem: trapItemId, type: item(trapItemId).trap, durability: t.durability, maxDurability: t.durability, bait: bait.id, hold: hold.id, habitat: habitatOf(state, slot) };
  state.progress.counters['trap.place'] = (state.progress.counters['trap.place'] || 0) + 1;
  return f;
}

export function removeTrap(state, uid) {
  const f = state.furniture[uid];
  if (!f || f.cfg !== 'trap') return;
  const bp = state.inventories[state.player.backpack];
  for (const invId of [f.data.bait, f.data.hold]) {
    const inv = state.inventories[invId];
    for (const it of inv?.items || []) if (!insert(bp, it, { allowOverweight: true })) dropToFloor(state, it, f.floor, f.x, f.y);
    delete state.inventories[invId];
  }
  if (f.data.durability > 0) {
    const inst = makeInstance(state, f.data.trapItem);
    if (!insert(bp, inst, { allowOverweight: true })) dropToFloor(state, inst, f.floor, f.x, f.y);
  }
  removeFurniture(state, uid);
}

function baitQuality(state, f) {
  const inv = state.inventories[f.data.bait];
  let sat = 0;
  for (const it of inv?.items || []) sat += Math.max(0, item(it.id)?.sat || 0);
  return sat;
}

function consumeBait(state, f) {
  const inv = state.inventories[f.data.bait];
  const it = inv?.items[0];
  if (!it) return;
  const cfg = item(it.id);
  if (cfg.uses > 1 && (it.uses ?? cfg.uses) > 1) it.uses = (it.uses ?? cfg.uses) - 1;
  else removeUid(inv, it.uid);
}

export function catchChancePerHour(state, f) {
  if (f.data.durability <= 0) return 0;
  if (!(TRAP_TYPES[f.data.type] || TRAP_TYPES[1]).habitats.includes(f.data.habitat)) return 0;
  const bait = baitQuality(state, f);
  if (bait <= 0) return 0;
  const lv = profLevel(state, 'trap');
  const base = 0.045 * (1 + Math.min(bait, 20) / 20) * (1 + lv * 0.08) * (getMods(state).trapOdds || 1);
  const holdFull = (state.inventories[f.data.hold]?.items.length || 0) >= 3;
  return holdFull ? 0 : base;
}

export function rollCatch(state, f) {
  const t = TRAP_TYPES[f.data.type] || TRAP_TYPES[1];
  const bonus = HABITAT_BONUS[f.data.habitat] || {};
  const entries = t.prey.filter((id) => item(id)).map((id) => [id, (4 - (item(id).prey || 1)) * (bonus[id] || 0.6)]);
  const prey = weighted(state, entries);
  if (!prey) return null;
  const hold = state.inventories[f.data.hold];
  const inst = makeInstance(state, prey);
  if (!insert(hold, inst, { allowOverweight: true })) return null;
  consumeBait(state, f);
  f.data.durability -= 1;
  f.exclaim = true;
  const c = state.progress.counters;
  c['trap.catch'] = (c['trap.catch'] || 0) + 1;
  if (RAT_IDS.has(prey)) c.ratCatch = (c.ratCatch || 0) + 1;
  const first = !state.progress.codexRun.prey.includes(prey);
  markCodex(state, 'prey', prey);
  markCodex(state, 'food', prey);
  addProfExp(state, 'trap', (item(prey).capExp || 50) + (first ? item(prey).discExp || 30 : 0));
  emit('trapCaught', { uid: f.uid, prey });
  emit('toast', { text: pickLang({ en: `The trap caught a ${itemName(prey)}!`, zh: `陷阱抓到了${itemName(prey)}！` }), kind: 'good' });
  return prey;
}

registerSystem({
  id: 'traps',
  order: 60,
  onHour(state) {
    if (state.phase !== 'post') return;
    for (const f of Object.values(state.furniture)) {
      if (f.cfg !== 'trap' || state.home.slots[f.slot] !== f.uid) continue;
      if (rand(state) < catchChancePerHour(state, f)) rollCatch(state, f);
    }
  },
});

registerKind('placeTrap', {
  canStart(state, a) {
    if (state.home.slots[a.slotId]) return pickLang({ en: 'That spot is taken.', zh: '这个位置被占用了。' });
    const loc = locateUid(state, a.uid);
    if (!loc) return pickLang({ en: 'The trap is gone.', zh: '陷阱不见了。' });
    return trapFits(state, loc.inst.id, slotDef(state, a.slotId)) ? true : pickLang({ en: 'This trap does not work in that spot.', zh: '这种陷阱不能放在这里。' });
  },
  complete(state, a) {
    const loc = locateUid(state, a.uid);
    if (!loc) return;
    if (placeTrap(state, loc.inst.id, a.slotId)) removeUid(loc.inv, a.uid);
  },
});

registerKind('trapRemove', {
  complete(state, a) {
    removeTrap(state, a.furn);
  },
});

registerKind('trapOpen', {
  complete(state, a) {
    const f = state.furniture[a.furn];
    if (f) f.exclaim = false;
    emit('openPanel', { panel: 'trap', furn: a.furn });
  },
});

export function queuePlaceTrap(state, uid, slotId) {
  return enqueue(state, {
    kind: 'placeTrap',
    label: pickLang({ en: 'Set a trap', zh: '布置陷阱' }),
    target: { slot: slotId },
    uid,
    slotId,
    dur: 15 * 60,
    cost: { sta: 5 },
  });
}
