// Workbench crafting (Config_ProductionList + Config_ProductionLv), the workbench drawer and surface,
// tool cabinets and the shredder (patches 08-15, 08-18, 08-19, 08-26, 08-31, 09-08, 09-09).
import { crafts, item, furn, CAT } from '../data/db.js';
import { MILESTONES } from '../content/milestones.js';
import { PLANNING_CARDS, CARD_BY_ID } from '../content/planningCards.js';
import { registerKind, enqueue, cancelCurrent } from './actions.js';
import { registerSystem } from './tick.js';
import { homeSources, giveItems } from './furnActions.js';
import { createInventory, destroyInventory, count, countIn, takeFrom, moveItem, findUid, removeUid, insert, makeInstance, organize } from './inventory.js';
import { homeFurniture, dropToFloor } from './home.js';
import { addProfExp, profLevel, craftLevelRow, PROF } from './proficiency.js';
import { markCodex } from './itemuse.js';
import { getMods } from './modifiers.js';
import { rand } from '../engine/rng.js';
import { emit } from '../engine/bus.js';
import { loc, pickLang, tr } from '../engine/i18n.js';

export const TOOL_CABINET = 70006;
const CRAFT_FUNC = 37;
const SHRED_FUNC = 80030;
const STAMINA_PER_MIN = 0.12;
const FAIL_PER_LEVEL = 0.12; // crafting above your level risks the recipe's "failed" salvage output
const DRAWER_SIZE = [6, 4];
const SURFACE_SIZE = [10, 4]; // fits the largest recipe (34 cells)
const HOPPER_SIZE = [6, 4];
const BIN_SIZE = [8, 5];

// NoteCategory groups of the recipe list.
export const NOTE_GROUPS = [
  [1, { en: 'Materials', zh: '材料' }],
  [2, { en: 'Tools & Story', zh: '工具与剧情' }],
  [3, { en: 'Traps', zh: '陷阱' }],
  [4, { en: 'Planting', zh: '种植' }],
  [5, { en: 'Power', zh: '电力' }],
  [6, { en: 'Defense', zh: '防御' }],
  [7, { en: 'Furniture & Misc', zh: '家具与杂物' }],
];

// Patch 09-08 closed the development-phase recipes (IsUseable = false); 09-09 put three back on the
// official list: Electronic Components with a new recipe (Plastic Sheet + Wire + Container), Playing
// Cards and Bandage, all visible by default and craftable at Lv1. The Live Trap keeps its official recipe.
const OFFICIAL_FIXES = {
  12: { use: true, showLv: 0, craftLv: 1 },
  15: { use: true, showLv: 0, craftLv: 1, lv: 1, mat: [20103, 20104, 20102], fail: [], pOut: [20103, 20104, 20102] },
  19: { use: true, showLv: 0, craftLv: 1 },
  202: { mat: [20003, 20004, 20004] },
};
const DEV_TEXT = /测试|暂未启用/;

const MOLOTOVS = new Set([404, 405, 406]);
const HOME_ONLY = { 324: 'warehouse', 326: 'warehouse', 388: 'warehouse' }; // keys for the warehouse's locks

// Codex-milestone souvenirs (guide G2): recipes unlocked for every save once a codex count is reached.
const SOUVENIR_GOALS = Object.fromEntries(MILESTONES.filter((m) => m.craft).map((m) => [m.craft, [m.cat, m.count]]));
const GOAL_TEXT = {
  food: { en: 'taste {n} different foods', zh: '品尝{n}种食物' },
  dish: { en: 'cook {n} different dishes', zh: '烹饪{n}种菜肴' },
  plant: { en: 'grow {n} different plants', zh: '种出{n}种植物' },
  prey: { en: 'catch {n} kinds of prey', zh: '捕获{n}种猎物' },
  craft: { en: 'craft {n} different items', zh: '制造{n}种物品' },
  furniture: { en: 'install {n} different furniture', zh: '安装{n}种家具' },
};

// ------------------------------------------------------------------------------------------ recipes
function isOfficial(r) {
  if (!r.use || DEV_TEXT.test(r.zh)) return false;
  return [...r.out, ...r.mat].every((id) => item(id) && !DEV_TEXT.test(item(id).zh));
}

const RECIPES = {};
for (const raw of Object.values(crafts)) {
  const r = { ...raw, ...OFFICIAL_FIXES[raw.id] };
  if (isOfficial(r)) RECIPES[r.id] = r;
}

// Stable list order: note group, then config order (patch 08-31: the list no longer jumps around).
export const RECIPE_ORDER = Object.values(RECIPES)
  .sort((a, b) => a.note - b.note || a.id - b.id)
  .map((r) => r.id);

const CODEX_RECIPES = new Set(RECIPE_ORDER.filter((id) => RECIPES[id].codex));

export function recipeDef(id) {
  return RECIPES[id] || null;
}

export function recipeName(id) {
  const r = RECIPES[id];
  return r ? loc(r.zh) : `#${id}`;
}

export function tally(ids) {
  const m = new Map();
  for (const id of ids) m.set(id, (m.get(id) || 0) + 1);
  return [...m];
}

export function recipeNeeds(id) {
  const r = RECIPES[id];
  return r ? tally(r.mat) : [];
}

export function craftExp(id) {
  return Math.round(RECIPES[id]?.lifeMin || 0);
}

export function craftDurationSec(state, id) {
  return (RECIPES[id]?.lifeMin || 0) * 60;
}

// Stamina before global multipliers; the action applies staCost and the craftStamina modifier (a.craft).
function baseStamina(state, id) {
  const cut = craftLevelRow(state)?.stamina_reduction || 0;
  return Math.round((RECIPES[id]?.lifeMin || 0) * STAMINA_PER_MIN * (1 - cut) * 10) / 10;
}

// What the survivor actually pays for one craft.
export function craftStaminaCost(state, id) {
  const mods = getMods(state);
  return Math.round(baseStamina(state, id) * mods.staCost * mods.craftStamina * 10) / 10;
}

export function perfectChance(state, id) {
  const r = RECIPES[id];
  if (!r?.pOut.length) return 0;
  const p = r.pRate + (craftLevelRow(state)?.perfect_craft_rate || 0) + (getMods(state).craftPerfect || 0);
  return Math.max(0, Math.min(1, p));
}

export function failChance(state, id) {
  const r = RECIPES[id];
  if (!r?.fail.length) return 0;
  return Math.max(0, Math.min(0.5, (r.lv - profLevel(state, 'craft')) * FAIL_PER_LEVEL));
}

// ------------------------------------------------------------------------------------------ unlocks
export function unlockedRecipeIds(state) {
  const out = new Set(getMods(state).recipes || []);
  for (const cardId of state.run?.cards || []) for (const id of CARD_BY_ID[cardId]?.recipes || []) out.add(id);
  for (const id of state.run?.unlockedRecipes || []) out.add(id);
  for (const id of state.run?.souvenirRecipes || []) out.add(id);
  return out;
}

function restriction(state, r) {
  if (MOLOTOVS.has(r.id) && !getMods(state).molotov) {
    return pickLang({ en: 'Only the Wage Slave and the Warehouse Manager know how to make Molotovs.', zh: '只有打工仔和仓库管理员会做燃烧瓶。' });
  }
  const home = HOME_ONLY[r.id];
  if (home && state.home?.id !== home) return pickLang({ en: 'Only needed at the Supply Warehouse.', zh: '只在物资仓库用得上。' });
  return null;
}

const levelText = (lv) => pickLang({ en: `Requires Crafting Lv${lv}`, zh: `需要制造等级${lv}` });

export function unlockHint(state, id) {
  const r = RECIPES[id];
  if (!r) return '';
  const blocked = restriction(state, r);
  if (blocked) return blocked;
  const ways = [];
  if (r.craftLv > 0) ways.push(levelText(r.craftLv));
  const cards = PLANNING_CARDS.filter((c) => c.recipes?.includes(id) && (!c.character || c.character.includes(state.meta.character)));
  if (cards.length) {
    const names = cards.map((c) => pickLang(c.name));
    ways.push(pickLang({ en: `Planning card “${names.join('” / “')}”`, zh: `规划卡「${names.join('」/「')}」` }));
  }
  const goal = SOUVENIR_GOALS[id];
  if (goal) {
    const txt = GOAL_TEXT[goal[0]];
    ways.push(pickLang({ en: `Codex milestone: ${txt.en.replace('{n}', goal[1])}`, zh: `图鉴里程碑：${txt.zh.replace('{n}', goal[1])}` }));
  }
  if (!ways.length) ways.push(pickLang({ en: 'Learned from events, notes or rewards', zh: '通过事件、笔记或奖励习得' }));
  return ways.join(pickLang({ en: ' or ', zh: '，或' }));
}

function levelContext(state) {
  return { lv: profLevel(state, 'craft'), unlocked: unlockedRecipeIds(state) };
}

// Visibility and craftability ignoring materials. showLv 0 = visible by default; craftLv 0 = needs an unlock.
function evaluate(state, r, ctx) {
  const blocked = restriction(state, r);
  if (blocked) return { visible: false, craftable: false, reason: blocked };
  const unlocked = ctx.unlocked.has(r.id);
  const visible = unlocked || r.showLv === 0 || ctx.lv >= r.showLv;
  const craftable = unlocked || (r.craftLv > 0 && ctx.lv >= r.craftLv);
  return { visible, craftable, reason: craftable ? '' : unlockHint(state, r.id) };
}

export function isRecipeVisible(state, id) {
  const r = RECIPES[id];
  return !!r && evaluate(state, r, levelContext(state)).visible;
}

export function isRecipeCraftable(state, id) {
  const r = RECIPES[id];
  if (!r) return false;
  const e = evaluate(state, r, levelContext(state));
  return e.visible && e.craftable;
}

function availableIds(state) {
  const ctx = levelContext(state);
  const ok = (id) => {
    const e = evaluate(state, RECIPES[id], ctx);
    return e.visible && e.craftable;
  };
  return new Set(RECIPE_ORDER.filter(ok));
}

// ------------------------------------------------------------------------------------------ furniture
export function isWorkbench(f) {
  if (!f) return false;
  if (f.cfg === 'workbench') return true;
  return typeof f.cfg === 'number' && !!furn(f.cfg)?.funcs.includes(CRAFT_FUNC);
}

export function isToolCabinet(f) {
  return f?.cfg === TOOL_CABINET;
}

// worked out once per config id: the shredders are looked for every sub-step
/** @type {Map<number, boolean>} */
const shredderCfg = new Map();

export function isShredder(f) {
  if (typeof f?.cfg !== 'number') return false;
  let yes = shredderCfg.get(f.cfg);
  if (yes === undefined) {
    yes = !!furn(f.cfg)?.funcs.includes(SHRED_FUNC);
    shredderCfg.set(f.cfg, yes);
  }
  return yes;
}

const installed = (state, f) => !!f && state.home.slots[f.slot] === f.uid;

export function findWorkbench(state) {
  const all = homeFurniture(state).filter(isWorkbench);
  return all.find((f) => !f.broken) || all[0] || null;
}

export function toolCabinets(state) {
  return homeFurniture(state).filter(isToolCabinet);
}

function craftData(state) {
  if (!state.crafting) state.crafting = { made: {}, fresh: [] };
  return state.crafting;
}

// The workbench drawer is the piece's own storage (so the Drawer function and homeSources see it);
// the work surface holding materials for the next craft is a separate inventory in f.data.craft.
export function ensureWorkbench(state, f) {
  if (!f.inv) f.inv = createInventory(state, { kind: 'furniture', w: DRAWER_SIZE[0], h: DRAWER_SIZE[1], owner: f.uid, label: 'drawer' }).id;
  if (!f.data.craft) f.data.craft = { surface: null, last: null, origin: {}, result: null };
  const d = f.data.craft;
  if (!state.inventories[d.surface]) {
    d.surface = createInventory(state, { kind: 'workbench', w: SURFACE_SIZE[0], h: SURFACE_SIZE[1], owner: f.uid, label: 'workbench' }).id;
  }
  return d;
}

// Surface first, then what the survivor carries, the drawers, every tool cabinet and the rest of home storage.
export function craftSources(state, uid) {
  const f = uid != null ? state.furniture[uid] : null;
  const ids = [];
  const add = (id) => {
    if (id && state.inventories[id] && !ids.includes(id)) ids.push(id);
  };
  add(f?.data?.craft?.surface);
  add(state.player.backpack);
  add(f?.inv);
  for (const w of homeFurniture(state)) if (isWorkbench(w)) add(w.inv);
  for (const t of toolCabinets(state)) add(t.inv);
  for (const id of homeSources(state)) add(id);
  return ids;
}

function stock(state, invIds) {
  const m = new Map();
  for (const invId of invIds) {
    const inv = state.inventories[invId];
    if (!inv) continue;
    for (const it of inv.items) m.set(it.id, (m.get(it.id) || 0) + (it.qty || 1));
  }
  return m;
}

function statusContext(state, uid) {
  const f = uid != null ? state.furniture[uid] : findWorkbench(state);
  const surface = f?.data?.craft?.surface;
  return {
    ...levelContext(state),
    all: stock(state, craftSources(state, f?.uid)),
    hand: stock(state, [surface, state.player.backpack, f?.inv]),
    surface: stock(state, [surface]),
  };
}

// { visible, craftable, reason, haveAll, missing: [[itemId, n]], gathered (surface + backpack + drawer
// hold everything), onSurface, need }
export function recipeStatus(state, id, uid = null, ctx = statusContext(state, uid)) {
  const r = RECIPES[id];
  if (!r) return { id, visible: false, craftable: false, reason: '', haveAll: false, missing: [], need: [] };
  const need = tally(r.mat);
  const missing = [];
  let gathered = true;
  let onSurface = true;
  for (const [iid, n] of need) {
    const have = ctx.all.get(iid) || 0;
    if (have < n) missing.push([iid, n - have]);
    if ((ctx.hand.get(iid) || 0) < n) gathered = false;
    if ((ctx.surface.get(iid) || 0) < n) onSurface = false;
  }
  const haveAll = missing.length === 0;
  return { id, note: r.note, ...evaluate(state, r, ctx), need, missing, haveAll, gathered: haveAll && gathered, onSurface: haveAll && onSurface };
}

// Every official recipe in list order with its status (callers filter on `visible`).
export function listRecipes(state, uid = null) {
  const ctx = statusContext(state, uid);
  return RECIPE_ORDER.map((id) => recipeStatus(state, id, uid, ctx));
}

export function missingText(missing) {
  const parts = missing.map(([id, n]) => `${loc(item(id)?.zh)} ×${n}`).join(', ');
  return pickLang({ en: `Missing ${parts}`, zh: `缺少${parts}` });
}

// ------------------------------------------------------------------------------------------ surface
function moveUnits(state, from, inst, to, n) {
  const qty = inst.qty || 1;
  if (qty <= n) return moveItem(state, from, inst.uid, to, null, null, { allowOverweight: true }).ok ? { uid: inst.uid, qty } : null;
  const part = makeInstance(state, inst.id, { age: inst.age, qty: n });
  if (!insert(to, part, { allowOverweight: true })) return null;
  inst.qty -= n;
  return { uid: part.uid, qty: n };
}

const cells = (id) => (item(id)?.size || [1, 1]).reduce((a, b) => a * b, 1);

// Move the materials a recipe still lacks onto the work surface (patch 08-31: only missing ones).
export function autoFill(state, uid, id) {
  const f = state.furniture[uid];
  const r = RECIPES[id];
  if (!f || !r) return { moved: 0, missing: [] };
  const d = ensureWorkbench(state, f);
  const surface = state.inventories[d.surface];
  const sources = craftSources(state, uid).filter((x) => x !== d.surface);
  const needs = tally(r.mat).sort((a, b) => cells(b[0]) - cells(a[0]));
  let moved = 0;
  const missing = [];
  for (const [iid, n] of needs) {
    let left = n - count(surface, iid);
    for (const src of sources) {
      const inv = state.inventories[src];
      for (const inst of inv.items.filter((it) => it.id === iid)) {
        if (left <= 0) break;
        const got = moveUnits(state, inv, inst, surface, left);
        if (!got) break;
        d.origin[got.uid] = src;
        left -= got.qty;
        moved += got.qty;
      }
      if (left <= 0) break;
    }
    if (left > 0) missing.push([iid, left]);
  }
  return { moved, missing };
}

// "Clear": return everything on the surface to where it came from (or the backpack).
export function clearSurface(state, uid) {
  const f = state.furniture[uid];
  if (!f) return 0;
  const d = ensureWorkbench(state, f);
  const surface = state.inventories[d.surface];
  const bp = state.inventories[state.player.backpack];
  const home = new Set(homeSources(state));
  let n = 0;
  for (const inst of [...surface.items]) {
    n += inst.qty || 1;
    const origin = d.origin[inst.uid];
    if (home.has(origin) && moveItem(state, surface, inst.uid, state.inventories[origin], null, null).ok) continue;
    if (moveItem(state, surface, inst.uid, bp, null, null, { allowOverweight: true }).ok) continue;
    removeUid(surface, inst.uid);
    dropToFloor(state, inst, f.floor, f.x, f.y);
  }
  d.origin = {};
  return n;
}

export function organizeSurface(state, uid) {
  const d = state.furniture[uid]?.data?.craft;
  const surface = d && state.inventories[d.surface];
  return surface ? organize(surface) : [];
}

// ------------------------------------------------------------------------------------------ crafting
export function canCraft(state, uid, id, { ignoreStamina = false } = {}) {
  const f = uid != null ? state.furniture[uid] : null;
  if (!isWorkbench(f) || !installed(state, f)) return pickLang({ en: 'There is no workbench.', zh: '没有工作台。' });
  if (f.broken) return pickLang({ en: 'The workbench is broken. Repair it first.', zh: '工作台坏了，需要先修好。' });
  if (state.phase === 'pre') return pickLang({ en: 'The workbench can be used after the outbreak.', zh: '灾变之后才能使用工作台。' });
  if (state.player.scene !== 'home') return pickLang({ en: 'You need to be at home.', zh: '需要在家里。' });
  const st = recipeStatus(state, id, uid);
  if (!st.visible || !st.craftable) return st.reason || pickLang({ en: 'Unknown recipe.', zh: '未知配方。' });
  if (!st.haveAll) return missingText(st.missing);
  if (!ignoreStamina && state.player.stats.sta < craftStaminaCost(state, id)) return pickLang({ en: 'Not enough Stamina.', zh: '精力不足。' });
  return true;
}

const roll = (state, p) => p > 0 && rand(state) < p;
const bump = (state, key) => (state.progress.counters[key] = (state.progress.counters[key] || 0) + 1);

function performCraft(state, uid, id) {
  const why = canCraft(state, uid, id, { ignoreStamina: true });
  if (why !== true) return { ok: false, reason: why };
  const r = RECIPES[id];
  const d = ensureWorkbench(state, state.furniture[uid]);
  const log = craftData(state);
  const before = availableIds(state);
  const sources = craftSources(state, uid);
  for (const [iid, n] of tally(r.mat)) takeFrom(state, sources, iid, n);
  const surface = state.inventories[d.surface];
  for (const key of Object.keys(d.origin)) if (!findUid(surface, Number(key))) delete d.origin[key];

  const failed = roll(state, failChance(state, id));
  const perfect = !failed && roll(state, perfectChance(state, id));
  const products = failed ? [] : tally(r.out);
  const bonus = perfect ? tally(r.pOut) : [];
  const salvage = failed ? tally(r.fail) : [];
  giveItems(state, [...products, ...bonus, ...salvage]);

  const first = !failed && !log.made[id];
  const lvBefore = profLevel(state, 'craft');
  const exp = failed ? Math.round(craftExp(id) / 2) : craftExp(id) + (first ? r.discExp : 0);
  addProfExp(state, 'craft', exp);
  if (failed) {
    bump(state, 'craft.fail');
  } else {
    log.made[id] = (log.made[id] || 0) + 1;
    bump(state, 'craft.total');
    if (perfect) bump(state, 'craft.perfect');
    if (r.defExp) addProfExp(state, 'defense', r.defExp);
    if (r.codex) markCodex(state, 'craft', id);
  }
  const unlocked = [...availableIds(state)].filter((x) => !before.has(x));
  log.fresh = [...new Set([...log.fresh, ...unlocked])];
  const p = state.progress.prof.craft;
  const result = {
    ok: true,
    id,
    furn: uid,
    products,
    bonus,
    salvage,
    perfect,
    failed,
    first,
    exp,
    defExp: failed ? 0 : r.defExp,
    lv: p.lv,
    levelUp: p.lv > lvBefore,
    profExp: p.exp,
    profNeed: PROF.craft.need[p.lv] || 0,
    unlocked,
    t: state.clock.t,
  };
  d.last = id;
  d.result = result;
  emit('crafted', result);
  return result;
}

// power.js keeps pwMode-1 loads (the shredder) running and iso.js shows ⏳ while f.data.crafting is set.
function setBusy(state, uid, on) {
  const f = state.furniture[uid];
  if (f) f.data.crafting = on;
}

registerKind('craft', {
  canStart(state, a) {
    return canCraft(state, a.furn, a.craftId);
  },
  begin(state, a) {
    autoFill(state, a.furn, a.craftId);
    setBusy(state, a.furn, true);
  },
  progress(state, a) {
    const sources = craftSources(state, a.furn);
    const lost = recipeNeeds(a.craftId).filter(([iid, n]) => countIn(state, sources, iid) < n);
    if (!lost.length) return;
    cancelCurrent(state);
    emit('toast', { text: missingText(lost), kind: 'bad' });
  },
  cancel(state, a) {
    setBusy(state, a.furn, false);
  },
  complete(state, a) {
    setBusy(state, a.furn, false);
    const res = performCraft(state, a.furn, a.craftId);
    if (!res.ok) emit('toast', { text: res.reason, kind: 'bad' });
  },
});

// Queue a craft at a workbench: gathers the materials, walks there and works for LifeMin minutes.
export function startCraft(state, uid, id) {
  const why = canCraft(state, uid, id);
  if (why !== true) {
    emit('toast', { text: why, kind: 'bad' });
    return null;
  }
  const d = ensureWorkbench(state, state.furniture[uid]);
  autoFill(state, uid, id);
  d.last = id;
  return enqueue(state, {
    kind: 'craft',
    label: `${tr('ui.craft')}: ${recipeName(id)}`,
    target: { furn: uid },
    furn: uid,
    craftId: id,
    dur: craftDurationSec(state, id),
    cost: { sta: baseStamina(state, id) },
    craft: true,
  });
}

export function craftAgain(state, uid) {
  const last = state.furniture[uid]?.data?.craft?.last;
  return last != null ? startCraft(state, uid, last) : null;
}

// Instant craft without time or stamina (tests and automation). Returns the result or { ok: false, reason }.
export function craftOnce(state, id, { uid = findWorkbench(state)?.uid } = {}) {
  return performCraft(state, uid, id);
}

export function isCraftingAt(state, uid) {
  const a = state.actions.current;
  return a?.kind === 'craft' && a.furn === uid ? a : null;
}

export function freshRecipes(state) {
  return craftData(state).fresh;
}

export function markRecipeSeen(state, id) {
  const log = craftData(state);
  log.fresh = log.fresh.filter((x) => x !== id);
}

// Blueprint Collector (A:2113): all 125 InCodex recipes crafted.
export function blueprintProgress(state) {
  const seen = state.progress.codexRun.craft || [];
  return { have: seen.filter((id) => CODEX_RECIPES.has(id)).length, total: CODEX_RECIPES.size };
}

export function craftProfInfo(state) {
  const p = state.progress.prof.craft;
  const row = craftLevelRow(state);
  return {
    lv: p.lv,
    exp: p.exp,
    need: PROF.craft.need[p.lv] || 0,
    max: p.lv >= PROF.craft.max,
    staminaCut: row?.stamina_reduction || 0,
    perfectBonus: row?.perfect_craft_rate || 0,
  };
}

// ------------------------------------------------------------------------------------------ shredder
// Material products break back down into their recipe's materials, full refund (Config_Item 14095).
const BREAKDOWN = {};
for (const id of RECIPE_ORDER) {
  const r = RECIPES[id];
  const out = r.out[0];
  if (r.out.length !== 1 || out < 20000 || item(out)?.cat !== CAT.MATERIAL || BREAKDOWN[out]) continue;
  BREAKDOWN[out] = id;
}

export function breakdownOf(itemId) {
  const id = BREAKDOWN[itemId];
  return id ? recipeNeeds(id) : null;
}

export function isShreddable(itemId) {
  return BREAKDOWN[itemId] != null;
}

export function shredTimeSec(itemId) {
  const r = RECIPES[BREAKDOWN[itemId]];
  return r ? Math.max(10, Math.round(r.lifeMin / 2)) * 60 : 0;
}

export function shreddableItems() {
  return Object.keys(BREAKDOWN).map(Number);
}

// The collection bin is the shredder's own storage (usable as a crafting source); the hopper is separate.
export function ensureShredder(state, f) {
  if (!f.inv) f.inv = createInventory(state, { kind: 'furniture', w: BIN_SIZE[0], h: BIN_SIZE[1], owner: f.uid, label: 'bin' }).id;
  if (!f.data.shred) f.data.shred = { hopper: null, job: null, status: 'idle', working: false };
  const d = f.data.shred;
  if (!state.inventories[d.hopper]) d.hopper = createInventory(state, { kind: 'hopper', w: HOPPER_SIZE[0], h: HOPPER_SIZE[1], owner: f.uid, label: 'hopper' }).id;
  return d;
}

const isPowered = (f) => f.powered !== false && f.on !== false;

export function addToShredder(state, uid, fromInvId, instUid) {
  const f = state.furniture[uid];
  if (!isShredder(f)) return { ok: false, reason: 'missing' };
  const d = ensureShredder(state, f);
  return moveItem(state, state.inventories[fromInvId], instUid, state.inventories[d.hopper], null, null);
}

export function collectBin(state, uid) {
  const f = state.furniture[uid];
  const bin = f?.inv && state.inventories[f.inv];
  if (!bin) return 0;
  let n = 0;
  for (const it of [...bin.items]) if (moveItem(state, bin, it.uid, state.inventories[state.player.backpack], null, null, { allowOverweight: true }).ok) n++;
  return n;
}

function finishShred(state, f, d, hopper) {
  const inst = findUid(hopper, d.job.uid);
  const bin = state.inventories[f.inv];
  const parts = breakdownOf(inst.id);
  const placed = [];
  for (const [id, n] of parts) {
    for (let i = 0; i < n; i++) {
      const it = makeInstance(state, id);
      if (!insert(bin, it)) {
        for (const p of placed) removeUid(bin, p.uid);
        return false;
      }
      placed.push(it);
    }
  }
  if ((inst.qty || 1) > 1) inst.qty -= 1;
  else removeUid(hopper, inst.uid);
  bump(state, 'shred.count');
  emit('shredded', { furn: f.uid, id: d.job.id, out: parts });
  d.job = null;
  return true;
}

// Items in the hopper are processed one by one, in the order they were put in, while powered.
function runShredder(state, f, dt) {
  const d = ensureShredder(state, f);
  const hopper = state.inventories[d.hopper];
  d.working = false;
  if (!isPowered(f)) {
    d.status = hopper.items.length ? 'noPower' : 'idle';
    return;
  }
  let budget = dt;
  while (budget > 0) {
    if (!d.job || !findUid(hopper, d.job.uid)) {
      const next = hopper.items.find((it) => isShreddable(it.id));
      if (!next) {
        d.job = null;
        d.status = hopper.items.length ? 'stuck' : 'idle';
        return;
      }
      d.job = { uid: next.uid, id: next.id, done: 0, need: shredTimeSec(next.id) };
    }
    const use = Math.min(budget, d.job.need - d.job.done);
    d.job.done += use;
    budget -= use;
    d.status = 'working';
    d.working = true;
    if (d.job.done < d.job.need) return;
    if (!finishShred(state, f, d, hopper)) {
      d.status = 'binFull';
      d.working = false;
      return;
    }
  }
}

export function tickShredders(state, dt) {
  for (const f of homeFurniture(state)) {
    if (!isShredder(f)) continue;
    runShredder(state, f, dt);
    setBusy(state, f.uid, f.data.shred.working);
  }
}

// { status: idle | working | noPower | binFull | stuck, powered, job: { id, pct, left } | null, queued, blocked }
export function shredderStatus(state, uid) {
  const f = state.furniture[uid];
  if (!isShredder(f)) return null;
  const d = ensureShredder(state, f);
  const hopper = state.inventories[d.hopper];
  const job = d.job && findUid(hopper, d.job.uid) ? d.job : null;
  return {
    status: isPowered(f) ? d.status : hopper.items.length ? 'noPower' : 'idle',
    powered: isPowered(f),
    job: job ? { id: job.id, pct: job.done / job.need, left: job.need - job.done } : null,
    queued: hopper.items.filter((it) => isShreddable(it.id)).reduce((n, it) => n + (it.qty || 1), 0),
    blocked: hopper.items.filter((it) => !isShreddable(it.id)).length,
  };
}

// ------------------------------------------------------------------------------------------ system
// Surfaces and hoppers of furniture that was packed up or dismantled go back to the survivor.
function releaseOrphans(state) {
  for (const inv of Object.values(state.inventories)) {
    if (inv.kind !== 'workbench' && inv.kind !== 'hopper') continue;
    if (installed(state, state.furniture[inv.owner])) continue;
    const bp = state.inventories[state.player.backpack];
    for (const it of [...inv.items]) {
      removeUid(inv, it.uid);
      if (!insert(bp, it, { allowOverweight: true })) dropToFloor(state, it, state.player.floor, state.player.x, state.player.y);
    }
    destroyInventory(state, inv.id);
  }
}

function setup(state) {
  craftData(state);
  if (!state.home) return;
  for (const f of homeFurniture(state)) {
    if (isWorkbench(f)) ensureWorkbench(state, f);
    if (isShredder(f)) ensureShredder(state, f);
  }
  releaseOrphans(state);
}

registerSystem({
  id: 'crafting',
  order: 60,
  init: setup,
  ensure: setup,
  onHour: setup,
  tick(state, dt) {
    if (state.home) tickShredders(state, dt);
  },
});
