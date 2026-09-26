// Cooking (dev log 06-03, patches 07-10 … 09-17): Config_CookingRecipe matching, cookers from Config_FurnitureCook
// running as jobs on the furniture, the electric hot pot, the brewing barrel, the ration press and cooking proficiency.
// Matching follows the game: an exact SpecificItems multiset wins; otherwise the TagCombo of ingredient sub-categories
// picks a generic dish whose tier comes from ingredient prices; anything else is Dark Cuisine.
import { item, itemName, recipe, recipes, tierRules, furn, cookCfg, dishOutput, CAT, SUB, ELEC } from '../data/db.js';
import { registerSystem } from './tick.js';
import { registerKind, enqueue, finish, cancelAction } from './actions.js';
import { createInventory, destroyInventory, insert, makeInstance, removeUid, findUid, moveItem } from './inventory.js';
import { homeFurniture, dropToFloor, furnLabel } from './home.js';
import { addProfExp, profLevel } from './proficiency.js';
import { markCodex, placeWaste, WASTE } from './itemuse.js';
import { addStat, addEffect, removeEffect, effectiveMax } from './stats.js';
import { getMods } from './modifiers.js';
import { hourOfDay, HOUR } from './time.js';
import { isExpired, lifeLeftDays } from './spoilage.js';
import { registerSuggestions } from './suggest.js';
import { rand } from '../engine/rng.js';
import { emit, on } from '../engine/bus.js';
import { pickLang, loc } from '../engine/i18n.js';

export const DARK_RECIPE = 100;
export const COOK_TYPE = { FUEL: 1, ELECTRIC: 2, SPECIAL: 3 };
export const COOK_MODE = { NORMAL: 0, HOTPOT: 1, PRESS: 2 };
// Guide 3790003439: only the College Student can cook these, after recalling them at night.
export const STUDENT_RECIPES = [2012, 1003, 4018, 2002, 2016, 7141];
// Patch 09-09: crafted coffee, latte, cappuccino and honey coffee give Caffeine for 8 hours.
export const COFFEE_RECIPES = [4039, 3036, 4086, 4087];
export const BREW = { line: 60, hours: 48, poor: 15505, average: 15504, strong: 15506, exp: 20 };
// Furniture 70008: "keeps six tenths of the nutrition"; four fragments press back into one block (patch 08-23).
export const RATION = { block: 30, keep: 0.6, fragment: 41016, rat: 41017, minutes: 30, perPiece: 10 };
export const HOTPOT = { satMult: 1.3, mor: 8, eatPerHour: 90, keepHours: 24, exp: 40 };
const RATION_FLAVOR = {
  [SUB.STAPLE]: 41009,
  [SUB.MEAT]: 41010,
  [SUB.FISH]: 41010,
  [SUB.CUSTARD]: 41011,
  [SUB.VEGETABLE]: 41012,
  [SUB.FRUIT]: 41013,
  [SUB.SNACK]: 41014,
  [SUB.MUSHROOM]: 41015,
};
const RODENTS = new Set([30000, 30003, 30006, 30007, 30008, 30017, 30018, 30019, 30020, 30021, 30022, 30023]);
const RATION_SAT = { [RATION.fragment]: RATION.block / 4, [RATION.rat]: RATION.block };
for (const id of Object.values(RATION_FLAVOR)) RATION_SAT[id] = RATION.block;

const keyOf = (list) => [...list].sort((a, b) => a - b).join(',');
const TIER_RULES = new Map(tierRules.map((r) => [r.sub, r]));
const SPECIAL = new Map();
const GENERIC = new Map();
for (const r of Object.values(recipes).sort((a, b) => a.id - b.id)) {
  const [index, list] = r.items.length ? [SPECIAL, r.items] : [GENERIC, r.tags];
  if (!list.length) continue;
  const k = keyOf(list);
  if (!index.has(k)) index.set(k, []);
  index.get(k).push(r);
}
const dishesOf = (ids) => new Set(ids.flatMap((id) => recipe(id).out));
const COFFEE_DISHES = dishesOf(COFFEE_RECIPES);
const WARM_DISHES = dishesOf([...Object.values(recipes).filter((r) => /汤|粥|煲|炖|羹/.test(r.zh)).map((r) => r.id), ...COFFEE_RECIPES]);

let current = null;

const say = (en, zh) => pickLang({ en, zh });
const bump = (state, key, n = 1) => (state.progress.counters[key] = (state.progress.counters[key] || 0) + n);
const fail = (reason) => ({ ok: false, reason });

// ------------------------------------------------------------------------------------------ ingredients & fuel
export function isIngredient(cfg) {
  return !!cfg && cfg.cat === CAT.FOOD && !!cfg.cook;
}

// Cooking wine and other liquor foods are ingredients, never fuel (patch 08-14); story documents are never burned.
export function isCookFuel(cfg) {
  return !!cfg && cfg.burn > 0 && cfg.cat !== CAT.FOOD && !cfg.story;
}

export function ingredientProblem(cfg) {
  if (!cfg || cfg.cat !== CAT.FOOD) return say('Only food goes into the pot.', '只能放入食材。');
  if (cfg.cut) return say('Too big: cut it into pieces first.', '太大了，需要先切分。');
  if (!cfg.cook) return say('Ready to eat; it cannot be cooked.', '这个即食，无法下锅烹饪。');
  return null;
}

function fuelProblem(cfg) {
  if (isCookFuel(cfg)) return null;
  if (cfg?.cat === CAT.FOOD && cfg.burn > 0) return say('Cooking wine is an ingredient, not fuel.', '料酒是食材，不能当燃料。');
  return say('That does not burn.', '这个不能当燃料。');
}

// 1 = high, 2 = mid, 3 = low; null for sub-categories without a price rule (staples, snacks, drinks).
export function ingredientTier(cfg) {
  const rule = cfg && TIER_RULES.get(cfg.sub);
  if (!rule) return null;
  return cfg.price >= rule.high ? 1 : cfg.price >= rule.midLow ? 2 : 3;
}

export function resolveTier(ids) {
  let best = null;
  for (const id of ids) {
    const t = ingredientTier(item(id));
    if (t != null && (best == null || t < best)) best = t;
  }
  return best;
}

// ------------------------------------------------------------------------------------------ recipe matching
// ids: ingredient item ids (one per slot). Returns { recipe, tier, special, dark } or null when nothing is allowed.
// `level` (the cook's level): an exact recipe above it gives way to the tag combination the cook can make, so a
// Lv1 cook's premium cut (short ribs 2202, a whole turkey 2308: exact recipes from Lv2–3) comes out as the
// Lv1 high-grade Charcoal Grill Platter 6002, the one dish of a single high-grade meat (BUG-0006). With nothing
// within the level, the exact recipe still wins, so the pot reports the level it needs.
export function matchRecipe(ids, { allowed = null, usable = null, level = null } = {}) {
  if (!ids?.length) return null;
  const ok = (r) => (!allowed || allowed.has(r.id)) && (!usable || usable(r));
  const known = (r) => level == null || level >= (r.minLv || 0);
  const tier = resolveTier(ids);
  if (ids.every((id) => isIngredient(item(id)))) {
    const specials = (SPECIAL.get(keyOf(ids)) || []).filter(ok);
    const group = tier == null ? [] : (GENERIC.get(keyOf(ids.map((id) => item(id).sub))) || []).filter((r) => r.tier === tier && ok(r));
    const special = specials.find(known);
    if (special) return { recipe: special, tier, special: true, dark: false };
    const generic = group.find(known);
    if (generic) return { recipe: generic, tier, special: false, dark: false };
    if (specials.length) return { recipe: specials[0], tier, special: true, dark: false };
    if (group.length) return { recipe: group[0], tier, special: false, dark: false };
  }
  if (allowed && !allowed.has(DARK_RECIPE)) return null;
  return { recipe: recipe(DARK_RECIPE), tier, special: false, dark: true };
}

export function recipeUsable(state, r) {
  if (!STUDENT_RECIPES.includes(r.id)) return true;
  return state.meta.character === 'student' && !!state.cooking?.unlocked.includes(r.id);
}

// QualityMap [0, normal, good, perfect] lower bounds -> output index (0 perfect, 1 good, 2 normal, 3 fail).
export function qualityIndex(score, q) {
  for (let i = 3; i >= 1; i--) if (score >= q[i]) return 3 - i;
  return 3;
}

// Single ingredients cook steadily; bigger combinations swing between great and failed (dev log 06-03).
// Spoiled ingredients cost 10 each, and at least 30 × their share of the pot: a dish that is one expired cut is
// spoiled through (−30), so even the Lv2–3 single-cut recipes (4002 short ribs …) can come out Failed, the Fail
// output the config gives them (BUG-0007). Pots of three or more ingredients keep the flat 10 per spoiled one.
export function spoiledPenalty(expired, n) {
  return n > 0 ? Math.max(10 * expired, (30 * expired) / n) : 0;
}

export function qualityRoll(state, cfg, items) {
  const expired = items.filter((inst) => isExpired(inst)).length;
  const center = 35 + 10 * profLevel(state, 'cook') + (cfg?.QualityBonus || 0) + (getMods(state).cookQuality || 0) - spoiledPenalty(expired, items.length);
  return { center, spread: 12 + 8 * Math.max(0, items.length - 1) };
}

export function qualityChances(roll, q, dark = false) {
  if (dark) return [0, 0, 0, 1];
  const above = (t) => Math.max(0, Math.min(1, (roll.center + roll.spread - t) / (2 * roll.spread)));
  return [above(q[3]), above(q[2]) - above(q[3]), above(q[1]) - above(q[2]), 1 - above(q[1])];
}

// ------------------------------------------------------------------------------------------ cookers
export function cookerConfig(f) {
  if (!f || typeof f.cfg !== 'number') return null;
  const id = furn(f.cfg)?.cook;
  return (id && cookCfg(id)) || null;
}

const allowedCache = new Map();
export function allowedRecipes(cfg) {
  if (!allowedCache.has(cfg.ID)) allowedCache.set(cfg.ID, new Set(cfg.AllowedRecipes || []));
  return allowedCache.get(cfg.ID);
}

export function needsPower(f) {
  return typeof f?.cfg === 'number' && furn(f.cfg)?.elec === ELEC.CONSUMER;
}

export function isPowered(f) {
  return !needsPower(f) || f.powered !== false;
}

export function cookSeconds(cfg, r) {
  return Math.round(r.time / (cfg.SpeedRate || 1));
}

export function heatFor(cfg, seconds) {
  return cfg.CookType === COOK_TYPE.FUEL ? Math.ceil(cfg.FuelRate * seconds) : 0;
}

// Hours of cooking one fuel item lasts on a cooker.
export function fuelHours(cfg, burn) {
  return cfg?.FuelRate > 0 ? burn / cfg.FuelRate / HOUR : 0;
}

function newInv(state, f, w, h, label) {
  const inv = createInventory(state, { kind: 'cooker', w, h, owner: f.uid, label });
  inv.at = { floor: f.floor, x: f.x, y: f.y };
  return inv.id;
}

// The pot holds Config_FurnitureCook.MaxFoodCount ingredients (3–5), whatever their size: the config counts
// ingredients, not cells. Its grid is sized so every config recipe's ingredient set fits (the largest: 7271's rice,
// salmon and tuna, and 4012's 6 × 5 suckling pig 2320); a 6 × 4 grid left 13 recipes uncookable (BUG-0005).
export const POT_W = 8;
export const POT_H = 6;

// f.data.cook = { pot, fuel, out (inventory ids), heat (left from burned fuel), job, hotpot, from {instUid: invId} }
export function cookerState(state, f) {
  const cfg = cookerConfig(f);
  if (!cfg || cfg.CookMode === COOK_MODE.PRESS) return null;
  const d = (f.data.cook ||= { pot: null, fuel: null, out: null, heat: 0, job: null, hotpot: null, from: {} });
  if (!state.inventories[d.pot]) d.pot = newInv(state, f, POT_W, POT_H, 'pot');
  const pot = state.inventories[d.pot];
  if (pot.w < POT_W || pot.h < POT_H) Object.assign(pot, { w: Math.max(pot.w, POT_W), h: Math.max(pot.h, POT_H) }); // saves with the old pot
  if (cfg.CookMode === COOK_MODE.NORMAL && !state.inventories[d.out]) d.out = newInv(state, f, 6, 3, 'output');
  if (cfg.FuelSlotCount > 0 && !state.inventories[d.fuel]) {
    d.fuel = newInv(state, f, cfg.FuelSlotCount, 2, 'fuel');
    for (const id of cfg.InitialFuel || []) insert(state.inventories[d.fuel], makeInstance(state, id));
  }
  return d;
}

export function fuelHeat(state, d) {
  let heat = d?.heat || 0;
  for (const inst of (d?.fuel && state.inventories[d.fuel]?.items) || []) if (isCookFuel(item(inst.id))) heat += item(inst.id).burn;
  return heat;
}

function burnFuel(state, d, need) {
  const fuel = state.inventories[d.fuel];
  while (d.heat < need && fuel?.items.length) {
    const inst = fuel.items[0];
    d.heat += item(inst.id).burn;
    removeUid(fuel, inst.uid);
  }
  d.heat = Math.max(0, d.heat - need);
}

// ------------------------------------------------------------------------------------------ sources
function isFridge(f, inv) {
  if (inv.coldRoom) return true;
  const cold = inv.cold || (typeof f.cfg === 'number' ? furn(f.cfg)?.cold : 0) || 0;
  return cold > 0 && cold < 1;
}

export function fridgeInventories(state) {
  const out = [];
  for (const f of homeFurniture(state)) {
    const inv = f.inv && state.inventories[f.inv];
    if (inv && isFridge(f, inv)) out.push(inv.id);
  }
  return out;
}

// Cooking Lv2 unlocks taking ingredients straight from the fridges (patch 08-14).
export function canUseFridge(state) {
  return profLevel(state, 'cook') >= 2;
}

export function cookSources(state) {
  return [state.player.backpack, ...(canUseFridge(state) ? fridgeInventories(state) : [])];
}

// The ration press only draws from the backpack and fridges, never the tool cabinet (patch 08-23).
export function pressSources(state) {
  return [state.player.backpack, ...fridgeInventories(state)];
}

function giveBack(state, inst) {
  const bp = state.inventories[state.player.backpack];
  if (!insert(bp, inst, { allowOverweight: true })) dropToFloor(state, inst, state.player.floor, state.player.x, state.player.y);
}

// Return an item from a cooker slot to where it came from (or the backpack, or the floor).
function putBack(state, d, inv, inst) {
  removeUid(inv, inst.uid);
  const home = state.inventories[d.from?.[inst.uid]];
  if (d.from) delete d.from[inst.uid];
  if (home && home !== inv && insert(home, inst, { allowOverweight: true })) return;
  giveBack(state, inst);
}

// Validate a set of slot inventories after the UI moved items around: remember where new items came from,
// reroute or return what does not belong. rules: [{ inv, accept(cfg) -> reason|null, limit }]
function tidySlots(state, d, sourceId, rules) {
  d.from ||= {};
  const rejected = [];
  for (const rule of rules) {
    const inv = state.inventories[rule.inv];
    if (!inv) continue;
    let n = 0;
    for (const inst of [...inv.items]) {
      if (rule.reroute?.(inst)) continue;
      if (sourceId && !(inst.uid in d.from)) d.from[inst.uid] = sourceId;
      const why = rule.accept(item(inst.id), inst) || (n >= (rule.limit ?? Infinity) ? NO_SLOT() : null);
      if (!why) {
        n++;
        continue;
      }
      putBack(state, d, inv, inst);
      rejected.push({ uid: inst.uid, id: inst.id, reason: why });
    }
  }
  const live = new Set(rules.flatMap((r) => state.inventories[r.inv]?.items.map((i) => String(i.uid)) || []));
  for (const k of Object.keys(d.from)) if (!live.has(k)) delete d.from[k];
  return rejected;
}

export function tidyCooker(state, uid, sourceId = state.player.backpack) {
  const f = state.furniture[uid];
  const cfg = cookerConfig(f);
  const d = cookerState(state, f);
  if (!d) return [];
  const fuel = d.fuel && state.inventories[d.fuel];
  const toFuel = (inst) => !!fuel && !d.job && isCookFuel(item(inst.id)) && moveItem(state, state.inventories[d.pot], inst.uid, fuel, null, null, { allowOverweight: true }).ok;
  return tidySlots(state, d, sourceId, [
    { inv: d.pot, accept: ingredientProblem, limit: cfg.MaxFoodCount, reroute: toFuel },
    { inv: d.fuel, accept: fuelProblem, limit: cfg.FuelSlotCount },
  ]);
}

const NO_SLOT = () => say('No free slot left.', '没有空槽位了。');

function moveInto(state, d, from, inst, invId, limit) {
  const target = state.inventories[invId];
  if (target.items.length >= limit) return fail(NO_SLOT());
  if (!moveItem(state, from, inst.uid, target, null, null, { allowOverweight: true }).ok) return fail(say('Not enough room.', '放不下了。'));
  (d.from ||= {})[inst.uid] = from.id;
  return { ok: true };
}

function addTo(state, uid, fromId, instUid, key) {
  const f = state.furniture[uid];
  const cfg = cookerConfig(f);
  const d = cookerState(state, f);
  const from = state.inventories[fromId];
  const inst = from && findUid(from, instUid);
  if (!d?.[key] || !inst) return fail(say('That item is gone.', '物品不见了。'));
  if (d.job) return fail(say('The cooker is busy.', '炊具正在使用中。'));
  const c = item(inst.id);
  const slot = key === 'pot' && d.fuel && isCookFuel(c) ? 'fuel' : key;
  const why = slot === 'fuel' ? fuelProblem(c) : ingredientProblem(c);
  if (why) return fail(why);
  return moveInto(state, d, from, inst, d[slot], slot === 'fuel' ? cfg.FuelSlotCount : cfg.MaxFoodCount);
}

export function addIngredient(state, uid, fromId, instUid) {
  return addTo(state, uid, fromId, instUid, 'pot');
}

export function addFuel(state, uid, fromId, instUid) {
  return addTo(state, uid, fromId, instUid, 'fuel');
}

export function clearPot(state, uid) {
  const d = cookerState(state, state.furniture[uid]);
  if (!d || d.job) return 0;
  const pot = state.inventories[d.pot];
  const n = pot.items.length;
  for (const inst of [...pot.items]) putBack(state, d, pot, inst);
  return n;
}

// One portion of each pot item goes into the dish; leftover portions of multi-use packs go back.
function takeIngredients(state, d) {
  const pot = state.inventories[d.pot];
  const used = [];
  for (const inst of [...pot.items]) {
    const cfg = item(inst.id);
    const left = cfg.uses > 1 ? inst.uses ?? cfg.uses : 1;
    if (left > 1) {
      inst.uses = left - 1;
      used.push(makeInstance(state, inst.id, { age: inst.age, uses: 1 }));
      putBack(state, d, pot, inst);
    } else {
      removeUid(pot, inst.uid);
      used.push(inst);
    }
  }
  d.from = {};
  return used;
}

export function collectOutput(state, uid) {
  const f = state.furniture[uid];
  const out = state.inventories[f?.data.cook?.out || f?.data.press?.out];
  if (!out) return 0;
  const bp = state.inventories[state.player.backpack];
  let moved = 0;
  for (const inst of [...out.items]) if (moveItem(state, out, inst.uid, bp, null, null, { allowOverweight: true }).ok) moved++;
  if (out.items.length) emit('toast', { text: say('No room left in the backpack.', '背包放不下了。'), kind: 'bad' });
  return moved;
}

// ------------------------------------------------------------------------------------------ cooking jobs
export function predictDish(state, uid) {
  const f = state.furniture[uid];
  const cfg = cookerConfig(f);
  const d = cookerState(state, f);
  if (!d || cfg.CookMode !== COOK_MODE.NORMAL) return null;
  const items = state.inventories[d.pot].items;
  const match = matchRecipe(
    items.map((i) => i.id),
    { allowed: allowedRecipes(cfg), usable: (r) => recipeUsable(state, r), level: profLevel(state, 'cook') }
  );
  const seconds = match ? cookSeconds(cfg, match.recipe) : 0;
  const roll = qualityRoll(state, cfg, items);
  const plan = {
    f,
    cfg,
    d,
    items,
    match,
    seconds,
    roll,
    heatNeed: heatFor(cfg, seconds),
    heat: fuelHeat(state, d),
    chances: match ? qualityChances(roll, match.recipe.q, match.dark) : null,
    isNew: !!match && !state.progress.codexRun.dish.includes(match.recipe.id),
  };
  plan.problem = cookProblem(state, plan);
  return plan;
}

function cookProblem(state, { f, cfg, d, items, match, heatNeed, heat }) {
  if (d.job) return say('Something is already cooking.', '正在烹饪中。');
  if (!items.length) return say('Put ingredients in first.', '先放入食材。');
  if (items.length > cfg.MaxFoodCount) return say(`At most ${cfg.MaxFoodCount} ingredients.`, `最多放入${cfg.MaxFoodCount}份食材。`);
  if (!match) return say('This cooker cannot make anything from these.', '这台炊具做不了这些食材。');
  if (profLevel(state, 'cook') < match.recipe.minLv) return say(`Requires Cooking Lv${match.recipe.minLv}.`, `需要烹饪等级${match.recipe.minLv}。`);
  if (!isPowered(f)) return say('No power.', '没有电。');
  if (heat < heatNeed) return say(`Not enough fuel (heat ${Math.floor(heat)} / ${heatNeed}).`, `燃料不足（热值${Math.floor(heat)} / ${heatNeed}）。`);
  return null;
}

export function startCooking(state, uid) {
  const plan = predictDish(state, uid);
  if (!plan) return fail(say('This is not a cooker.', '这不是炊具。'));
  if (plan.problem) return fail(plan.problem);
  const { f, cfg, d, match } = plan;
  burnFuel(state, d, plan.heatNeed);
  const quality = match.dark ? 3 : qualityIndex(plan.roll.center + (rand(state) * 2 - 1) * plan.roll.spread, match.recipe.q);
  d.job = {
    kind: 'dish',
    recipe: match.recipe.id,
    special: match.special,
    dark: match.dark,
    quality,
    out: match.recipe.out[quality],
    items: takeIngredients(state, d),
    heat: plan.heatNeed,
    dur: plan.seconds,
    done: 0,
    startedAt: state.clock.t,
    endsAt: state.clock.t + plan.seconds,
    // Only the microwave, oven and other electric cookers run unattended; a stove needs the survivor.
    tend: cfg.CookType === COOK_TYPE.FUEL,
  };
  f.data.cooking = true;
  if (d.job.tend) queueTend(state, f);
  emit('cookStarted', { furn: uid, recipe: match.recipe.id });
  return { ok: true, job: d.job };
}

export function cancelCooking(state, uid) {
  const f = state.furniture[uid];
  const d = f?.data.cook;
  if (!d?.job) return false;
  const pot = state.inventories[d.pot];
  for (const inst of d.job.items || []) if (!pot || !insert(pot, inst, { allowOverweight: true })) giveBack(state, inst);
  d.heat += d.job.heat || 0;
  d.job = null;
  f.data.cooking = false;
  const a = tendAction(state, uid);
  if (a) cancelAction(state, a.id);
  emit('cookCancelled', { furn: uid });
  return true;
}

function tendAction(state, uid) {
  return [state.actions.current, ...state.actions.queue].find((a) => a?.kind === 'cookTend' && a.furn === uid) || null;
}

function queueTend(state, f) {
  const job = f.data.cook?.job;
  if (!job?.tend || tendAction(state, f.uid)) return null;
  return enqueue(state, {
    kind: 'cookTend',
    label: say(`Cooking ${loc(recipe(job.recipe).zh)}`, `烹饪${recipe(job.recipe).zh}`),
    target: { furn: f.uid },
    furn: f.uid,
    dur: Math.max(1, job.dur - job.done),
    noSlow: true,
    cost: { sta: 2 },
  });
}

export function resumeCooking(state, uid) {
  const f = state.furniture[uid];
  return f ? queueTend(state, f) : null;
}

export function isTended(state, uid) {
  const a = state.actions.current;
  return a?.kind === 'cookTend' && a.furn === uid && a.phase === 'work';
}

registerKind('cookTend', {
  canStart(state, a) {
    return state.furniture[a.furn]?.data.cook?.job?.tend ? true : say('Nothing is cooking.', '锅里没有东西。');
  },
  begin(state, a) {
    const job = state.furniture[a.furn]?.data.cook?.job;
    if (job) a.dur = Math.max(1, job.dur - job.done);
  },
  progress(state, a, dt) {
    const job = state.furniture[a.furn]?.data.cook?.job;
    if (!job) return;
    job.done += dt;
    job.tendedAt = state.clock.t;
    job.endsAt = state.clock.t + job.dur - job.done;
  },
  complete(state, a) {
    const f = state.furniture[a.furn];
    const job = f?.data.cook?.job;
    if (job && job.done >= job.dur - 0.5) finishJob(state, f);
  },
});

function isMidnight(state) {
  const h = hourOfDay(state.clock);
  return h >= 2.5 && h < 3.5;
}

// Codex, achievement counters and proficiency for one finished dish.
function recordDish(state, r, quality) {
  const first = !state.progress.codexRun.dish.includes(r.id);
  markCodex(state, 'dish', r.id);
  const dark = r.id === DARK_RECIPE;
  const success = !dark && quality !== 3;
  if (success) bump(state, 'cook.count');
  if (success && quality === 0) bump(state, 'cook.perfect');
  if (!dark && isMidnight(state)) bump(state, 'cook.midnight');
  addProfExp(state, 'cook', (success ? r.exp : r.exp / 2) + (first ? r.discExp : 0));
}

function finishJob(state, f) {
  const d = f.data.cook;
  const job = d.job;
  d.job = null;
  f.data.cooking = false;
  if (job.kind === 'hotpot') return serveHotPot(state, f, job);
  for (const it of job.items || []) if (WASTE[it.id] && !(item(it.id).uses > 1)) placeWaste(state, null, WASTE[it.id]);
  const r = recipe(job.recipe);
  const inst = makeInstance(state, job.out);
  const out = state.inventories[d.out];
  const placed = !!out && insert(out, inst, { allowOverweight: true });
  if (!placed) dropToFloor(state, inst, f.floor, f.x, f.y);
  recordDish(state, r, job.quality);
  emit('cooked', { furn: f.uid, recipe: r.id, item: job.out, quality: job.quality });
  const where = placed ? furnLabel(f) : say('a box on the floor', '地上的纸箱');
  emit('toast', { text: say(`${itemName(job.out)} is ready (${where}).`, `${itemName(job.out)}做好了（${where}）。`), kind: job.quality === 3 ? 'bad' : 'good' });
}

// ------------------------------------------------------------------------------------------ hot pot (CookMode 1)
export function hotPotPreview(state, uid) {
  const f = state.furniture[uid];
  const cfg = cookerConfig(f);
  const d = cookerState(state, f);
  if (!d || cfg.CookMode !== COOK_MODE.HOTPOT) return null;
  const items = state.inventories[d.pot].items;
  let sat = 0;
  let mor = HOTPOT.mor;
  let hp = 0;
  for (const inst of items) {
    const c = item(inst.id);
    sat += c.sat * HOTPOT.satMult;
    mor += Math.max(0, c.mor) + 1;
    hp += Math.max(0, c.hp || 0);
  }
  const p = { f, cfg, d, items, sat, mor, hp, seconds: cfg.HotPotCookTime || HOUR };
  if (d.job) p.problem = say('The pot is already on.', '锅已经煮上了。');
  else if (d.hotpot?.sat > 0) p.problem = say('Finish what is left in the pot first.', '先把锅里的吃完。');
  else if (!items.length) p.problem = say('Put ingredients in first.', '先放入食材。');
  else if (!isPowered(f)) p.problem = say('No power.', '没有电。');
  return p;
}

export function startHotPot(state, uid) {
  const p = hotPotPreview(state, uid);
  if (!p) return fail(say('This is not a hot pot.', '这不是火锅。'));
  if (p.problem) return fail(p.problem);
  const t = state.clock.t;
  p.d.job = { kind: 'hotpot', items: takeIngredients(state, p.d), sat: p.sat, mor: p.mor, hp: p.hp, heat: 0, dur: p.seconds, done: 0, startedAt: t, endsAt: t + p.seconds, tend: false };
  p.f.data.cooking = true;
  emit('cookStarted', { furn: uid, hotpot: true });
  return { ok: true, job: p.d.job };
}

function serveHotPot(state, f, job) {
  f.data.cook.hotpot = { sat: job.sat, mor: job.mor, hp: job.hp, total: job.sat, cookedAt: state.clock.t };
  bump(state, 'cook.count');
  if (isMidnight(state)) bump(state, 'cook.midnight');
  addProfExp(state, 'cook', HOTPOT.exp);
  emit('hotpotReady', { furn: f.uid });
  emit('toast', { text: say('The hot pot is bubbling. Time to eat!', '火锅煮开了，开吃吧！'), kind: 'good' });
}

export function eatHotPot(state, uid) {
  const pot = state.furniture[uid]?.data.cook?.hotpot;
  if (!pot || pot.sat <= 0.01) return fail(say('The pot is empty.', '锅里空了。'));
  const a = enqueue(state, { kind: 'hotpotEat', label: say('Eat hot pot', '享用火锅'), target: { furn: uid }, furn: uid, dur: 6 * HOUR, noSlow: true, continuous: true });
  return { ok: true, action: a };
}

registerKind('hotpotEat', {
  canStart(state, a) {
    if (!(state.furniture[a.furn]?.data.cook?.hotpot?.sat > 0.01)) return say('The pot is empty.', '锅里空了。');
    if (effectiveMax(state, 'sat') - state.player.stats.sat < 1) return say('You are already full.', '已经吃饱了。');
    return true;
  },
  progress(state, a, dt) {
    const pot = state.furniture[a.furn]?.data.cook?.hotpot;
    const mult = getMods(state).eatSat || 1;
    const room = (effectiveMax(state, 'sat') - state.player.stats.sat) / mult;
    if (!pot || pot.sat <= 0.01 || room <= 0.5) return finish(state, a);
    const bite = Math.min(pot.sat, room, (HOTPOT.eatPerHour * dt) / HOUR);
    const share = bite / pot.sat;
    addStat(state, 'sat', bite * mult, 'hotpot');
    addStat(state, 'mor', pot.mor * share, 'hotpot');
    if (pot.hp) addStat(state, 'life', pot.hp * share, 'hotpot');
    pot.mor -= pot.mor * share;
    pot.hp -= pot.hp * share;
    pot.sat -= bite;
    a.ate = (a.ate || 0) + bite;
  },
  complete(state, a) {
    const d = state.furniture[a.furn]?.data.cook;
    if (d?.hotpot && d.hotpot.sat <= 0.01) d.hotpot = null;
    if (!a.ate) return;
    removeEffect(state, 'cold');
    addEffect(state, 'warm', 3);
    bump(state, 'food.eaten');
  },
});

// ------------------------------------------------------------------------------------------ brewing barrel (66001)
export function isBrewable(cfg) {
  return !!cfg && cfg.cat === CAT.FOOD && !!cfg.brew && cfg.sat > 0;
}

function portionsOf(inst, cfg) {
  return cfg.uses > 1 ? inst.uses ?? cfg.uses : inst.qty || 1;
}

export function foodSat(inst) {
  const cfg = item(inst.id);
  return (cfg?.sat || 0) * portionsOf(inst, cfg);
}

// "The better the ingredients, the stronger the alcohol": fruit, grain and sugar ferment best.
function brewValue(inst, cfg) {
  if (isExpired(inst, cfg)) return 0;
  if (dishOutput[cfg.id]) return 1;
  if (cfg.sub === SUB.FRUIT || cfg.sub === SUB.STAPLE || cfg.sub === SUB.SEASONING) return 3;
  if (cfg.sub === SUB.VEGETABLE || cfg.sub === SUB.SNACK || cfg.sub === SUB.SOFT_DRINK) return 2;
  return 1;
}

function alcoholFor(score) {
  return score >= 2.5 ? BREW.strong : score >= 1.5 ? BREW.average : BREW.poor;
}

// Portions consumed to reach `target` satiety; the rest stays in the barrel (patch 08-15).
function brewPlan(items, target) {
  const take = [];
  let sat = 0;
  let weighted = 0;
  for (const inst of items) {
    if (sat >= target - 1e-9) break;
    const cfg = item(inst.id);
    if (!isBrewable(cfg)) continue;
    const k = Math.min(portionsOf(inst, cfg), Math.ceil((target - sat) / cfg.sat - 1e-9));
    take.push([inst, k]);
    sat += k * cfg.sat;
    weighted += k * cfg.sat * brewValue(inst, cfg);
  }
  return { take, sat, out: alcoholFor(sat ? weighted / sat : 0) };
}

function consumePortions(inv, inst, k) {
  const cfg = item(inst.id);
  if (cfg.uses > 1) {
    inst.uses = (inst.uses ?? cfg.uses) - k;
    if (inst.uses <= 0) removeUid(inv, inst.uid);
  } else if ((inst.qty || 1) > k) inst.qty -= k;
  else removeUid(inv, inst.uid);
}

export function brewStatus(state, uid) {
  const f = state.furniture[uid];
  const inv = f?.inv && state.inventories[f.inv];
  if (!inv || inv.special !== 'brew') return null;
  const d = (f.data.brew ||= { job: null, from: {} });
  const total = inv.items.reduce((s, inst) => s + (isBrewable(item(inst.id)) ? foodSat(inst) : 0), 0);
  const bottles = Math.floor(total / BREW.line + 1e-9);
  const plan = brewPlan(inv.items, Math.max(1, bottles) * BREW.line);
  return { f, d, inv, job: d.job, total, bottles, need: Math.max(0, BREW.line - total), out: plan.out, left: d.job ? Math.max(0, d.job.endsAt - state.clock.t) : 0 };
}

export function tidyBarrel(state, uid, sourceId = state.player.backpack) {
  const st = brewStatus(state, uid);
  if (!st || st.job) return [];
  const accept = (cfg) => (isBrewable(cfg) ? null : say('Only grain, fruit and vegetables ferment.', '只有粮食、果蔬能酿酒。'));
  return tidySlots(state, st.d, sourceId, [{ inv: st.inv.id, accept }]);
}

export function startBrewing(state, uid) {
  const st = brewStatus(state, uid);
  if (!st) return fail(say('This is not a brewing barrel.', '这不是酿酒桶。'));
  if (st.job) return fail(say('Already fermenting.', '正在发酵中。'));
  if (st.bottles < 1) {
    const need = Math.ceil(st.need);
    return fail(say(`Below the brewing line: add ${need} more Satiety of ingredients.`, `还没到酿造线，还需要${need}点饱腹值的食材。`));
  }
  const plan = brewPlan(st.inv.items, st.bottles * BREW.line);
  for (const [inst, k] of plan.take) consumePortions(st.inv, inst, k);
  st.d.job = { out: plan.out, n: st.bottles, sat: plan.sat, startedAt: state.clock.t, endsAt: state.clock.t + BREW.hours * HOUR };
  st.inv.brewing = true;
  return { ok: true, job: st.d.job };
}

function finishBrew(state, f) {
  const job = f.data.brew.job;
  f.data.brew.job = null;
  const inv = state.inventories[f.inv];
  if (inv) inv.brewing = false;
  for (let i = 0; i < job.n; i++) {
    const inst = makeInstance(state, job.out);
    if (!inv || !insert(inv, inst, { allowOverweight: true })) dropToFloor(state, inst, f.floor, f.x, f.y);
  }
  bump(state, 'brew.count', job.n);
  addProfExp(state, 'cook', BREW.exp * job.n);
  emit('brewed', { furn: f.uid, item: job.out, n: job.n });
  emit('toast', { text: say(`Fermentation done: ${job.n}× ${itemName(job.out)}.`, `发酵完成：${itemName(job.out)}×${job.n}。`), kind: 'good' });
}

// ------------------------------------------------------------------------------------------ ration press (70008)
export function rationFlavor(cfg) {
  if (!cfg) return null;
  return RODENTS.has(cfg.id) ? RATION.rat : RATION_FLAVOR[cfg.sub] || null;
}

export function isPressable(cfg) {
  if (!cfg || cfg.cat !== CAT.FOOD) return false;
  return cfg.id === RATION.fragment || (cfg.sat > 0 && !RATION_SAT[cfg.id] && !!rationFlavor(cfg));
}

// Satiety a ration piece adds on top of its flavor bonus from the config.
export function rationSatiety(id) {
  return RATION_SAT[id] || 0;
}

export function pressState(state, f) {
  if (cookerConfig(f)?.CookMode !== COOK_MODE.PRESS) return null;
  const d = (f.data.press ||= { slot: null, out: null, job: null, from: {} });
  if (!state.inventories[d.slot]) d.slot = newInv(state, f, 6, 4, 'press');
  if (!state.inventories[d.out]) d.out = newInv(state, f, 6, 2, 'rations');
  return d;
}

export function tidyPress(state, uid, sourceId = state.player.backpack) {
  const d = pressState(state, state.furniture[uid]);
  if (!d || d.job) return [];
  const accept = (cfg) => (isPressable(cfg) ? null : say('That cannot be pressed into rations.', '这个压不成口粮。'));
  return tidySlots(state, d, sourceId, [{ inv: d.slot, accept }]);
}

export function addToPress(state, uid, fromId, instUid) {
  const d = pressState(state, state.furniture[uid]);
  const from = state.inventories[fromId];
  const inst = from && findUid(from, instUid);
  if (!d || !inst) return fail(say('That item is gone.', '物品不见了。'));
  if (d.job) return fail(say('The press is busy.', '压制机正在工作。'));
  if (!isPressable(item(inst.id))) return fail(say('That cannot be pressed into rations.', '这个压不成口粮。'));
  return moveInto(state, d, from, inst, d.slot, Infinity);
}

// Each flavor presses into 30-satiety blocks from 60% of its food's satiety; remainders become quarter-block
// fragments. Fragments poured back in keep their full value and join the main flavor.
export function pressPreview(state, uid) {
  const f = state.furniture[uid];
  const d = pressState(state, f);
  if (!d) return null;
  const items = state.inventories[d.slot].items;
  const sat = {};
  let fragments = 0;
  for (const inst of items) {
    const cfg = item(inst.id);
    if (cfg.id === RATION.fragment) fragments += inst.qty || 1;
    else if (isPressable(cfg)) sat[rationFlavor(cfg)] = (sat[rationFlavor(cfg)] || 0) + foodSat(inst) * RATION.keep;
  }
  const flavors = Object.keys(sat).map(Number);
  const main = flavors.sort((a, b) => sat[b] - sat[a] || a - b)[0] ?? RATION_FLAVOR[SUB.STAPLE];
  sat[main] = (sat[main] || 0) + fragments * RATION_SAT[RATION.fragment];
  const out = [];
  let rest = 0;
  for (const id of Object.keys(sat).map(Number).sort((a, b) => a - b)) {
    const n = Math.floor(sat[id] / RATION.block + 1e-9);
    if (n) out.push([id, n]);
    rest += sat[id] - n * RATION.block;
  }
  const frags = Math.floor(rest / RATION_SAT[RATION.fragment] + 1e-9);
  if (frags) out.push([RATION.fragment, frags]);
  const pieces = out.reduce((s, [, n]) => s + n, 0);
  const p = { f, d, items, out, pieces, seconds: pieces ? (RATION.minutes + RATION.perPiece * pieces) * 60 : 0, sat: Object.values(sat).reduce((a, b) => a + b, 0) };
  if (d.job) p.problem = say('The press is running.', '压制机正在工作。');
  else if (!items.length) p.problem = say('Pour some food into the press slot.', '先把食物倒进压制槽。');
  else if (!pieces) p.problem = say('Not enough food for a single piece.', '食物太少，压不出一块。');
  else if (!isPowered(f)) p.problem = say('No power.', '没有电。');
  return p;
}

export function startPress(state, uid) {
  const p = pressPreview(state, uid);
  if (!p) return fail(say('This is not a ration press.', '这不是口粮压制机。'));
  if (p.problem) return fail(p.problem);
  const slot = state.inventories[p.d.slot];
  slot.items = slot.items.filter((inst) => !isPressable(item(inst.id)));
  p.d.from = {};
  p.d.job = { out: p.out, dur: p.seconds, done: 0, startedAt: state.clock.t, endsAt: state.clock.t + p.seconds };
  p.f.data.busy = true;
  return { ok: true, job: p.d.job };
}

function finishPress(state, f) {
  const d = f.data.press;
  const job = d.job;
  d.job = null;
  f.data.busy = false;
  const out = state.inventories[d.out];
  for (const [id, n] of job.out) {
    for (let i = 0; i < n; i++) {
      const inst = makeInstance(state, id);
      if (!out || !insert(out, inst, { allowOverweight: true })) dropToFloor(state, inst, f.floor, f.x, f.y);
    }
  }
  bump(state, 'ration.pressed', job.out.reduce((s, [id, n]) => s + (id === RATION.fragment ? 0 : n), 0));
  emit('pressed', { furn: f.uid, out: job.out });
  emit('toast', { text: say('The ration press is done.', '口粮压好了。'), kind: 'good' });
}

// ------------------------------------------------------------------------------------------ cookbook
function stockOf(state, invIds) {
  const ids = new Map();
  for (const invId of invIds) {
    for (const inst of state.inventories[invId]?.items || []) {
      if (!ingredientProblem(item(inst.id))) ids.set(inst.id, (ids.get(inst.id) || 0) + 1);
    }
  }
  return ids;
}

function tagCounts(tags) {
  const m = new Map();
  for (const t of tags) m.set(t, (m.get(t) || 0) + 1);
  return m;
}

// Tier-rule ingredients may not be better than the dish tier, and one of them must match it exactly.
function fitsTier(cfg, tier) {
  const t = ingredientTier(cfg);
  return t == null || t >= tier;
}

// What is still missing for a recipe: [{ id }] for exact dishes, [{ sub, n }] / [{ tier }] for generic ones.
function missingFor(r, stock) {
  if (r.items.length) return r.items.filter((id) => !stock.get(id)).map((id) => ({ id }));
  const missing = [];
  let anchor = false;
  for (const [sub, n] of tagCounts(r.tags)) {
    let have = 0;
    for (const [id, k] of stock) {
      const cfg = item(id);
      if (cfg.sub !== sub || !fitsTier(cfg, r.tier)) continue;
      have += k;
      if (ingredientTier(cfg) === r.tier) anchor = true;
    }
    if (have < n) missing.push({ sub, n: n - have });
  }
  if (!missing.length && !anchor) missing.push({ tier: r.tier });
  return missing;
}

function isKnown(state, r) {
  return state.progress.codexRun.dish.includes(r.id) || (r.showLv > 0 && profLevel(state, 'cook') >= r.showLv);
}

const STATUS_RANK = { ready: 0, near: 1, missing: 2, level: 3 };

// Recipe book for a cooker: known recipes in a fixed order within each status (patch 09-17), plus the number of
// recipes still hidden. Hidden recipes appear once cooked or once cooking proficiency reaches their show level.
export function cookbook(state, uid) {
  const f = state.furniture[uid];
  const cfg = cookerConfig(f);
  const d = cookerState(state, f);
  if (!d) return { entries: [], hidden: 0 };
  const stock = stockOf(state, [d.pot, ...cookSources(state)]);
  const lv = profLevel(state, 'cook');
  const entries = [];
  let hidden = 0;
  for (const id of [...allowedRecipes(cfg)].sort((a, b) => a - b)) {
    const r = recipe(id);
    if (!r || id === DARK_RECIPE || !recipeUsable(state, r)) continue;
    if (!isKnown(state, r)) {
      hidden++;
      continue;
    }
    const missing = missingFor(r, stock);
    const status = lv < r.minLv ? 'level' : !missing.length ? 'ready' : missing.length === 1 ? 'near' : 'missing';
    entries.push({ recipe: r, status, missing, discovered: state.progress.codexRun.dish.includes(id) });
  }
  entries.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.recipe.id - b.recipe.id);
  return { entries, hidden };
}

// `list` minus `remove` as multisets; null when `remove` is not fully contained in `list`.
function withoutAll(list, remove) {
  const rest = [...list];
  for (const x of remove) {
    const i = rest.indexOf(x);
    if (i < 0) return null;
    rest.splice(i, 1);
  }
  return rest;
}

// "Add X to make Y" hints for what is in the pot now (known recipes only).
export function potHints(state, uid, max = 3) {
  const plan = predictDish(state, uid);
  if (!plan || plan.d.job || !plan.items.length || plan.items.length >= plan.cfg.MaxFoodCount) return [];
  const have = plan.items.map((i) => i.id);
  const hints = [];
  for (const id of [...allowedRecipes(plan.cfg)].sort((a, b) => a - b)) {
    const r = recipe(id);
    if (!r || id === DARK_RECIPE || id === plan.match?.recipe.id || !recipeUsable(state, r) || !isKnown(state, r)) continue;
    if (r.items.length) {
      const rest = withoutAll(r.items, have);
      if (rest?.length === 1) hints.push({ recipe: r, missing: [{ id: rest[0] }] });
    } else if (r.tags.length === have.length + 1 && plan.items.every((i) => isIngredient(item(i.id)))) {
      const counts = tagCounts(r.tags);
      for (const x of have) counts.set(item(x).sub, (counts.get(item(x).sub) || 0) - 1);
      const extra = [...counts].filter(([, n]) => n !== 0);
      const t = resolveTier(have);
      if (extra.length !== 1 || extra[0][1] !== 1 || (t != null && t < r.tier)) continue;
      const sub = extra[0][0];
      if (t === r.tier) hints.push({ recipe: r, missing: [{ sub, n: 1 }] });
      else if (TIER_RULES.has(sub)) hints.push({ recipe: r, missing: [{ sub, n: 1, tier: r.tier }] });
    }
    if (hints.length >= max) break;
  }
  return hints;
}

function pickGeneric(r, stock, opts) {
  const slots = [...r.tags].sort((a, b) => a - b);
  const byTier = (a, b) => (ingredientTier(item(b)) ?? 0) - (ingredientTier(item(a)) ?? 0) || a - b;
  const cands = new Map(slots.map((sub) => [sub, [...stock.keys()].filter((id) => item(id).sub === sub && fitsTier(item(id), r.tier)).sort(byTier)]));
  const left = new Map(stock);
  const chosen = [];
  let budget = 4000;
  const visit = (i) => {
    if (budget-- <= 0) return false;
    if (i === slots.length) return matchRecipe(chosen, opts)?.recipe.id === r.id;
    for (const id of cands.get(slots[i])) {
      if (!left.get(id) || (i > 0 && slots[i] === slots[i - 1] && byTier(id, chosen[i - 1]) < 0)) continue;
      left.set(id, left.get(id) - 1);
      chosen.push(id);
      if (visit(i + 1)) return true;
      chosen.pop();
      left.set(id, left.get(id) + 1);
    }
    return false;
  };
  return visit(0) ? chosen : null;
}

// Cookbook "Fill": return what is in the pot, then pull a working ingredient set from the pot's sources,
// freshest-to-spoil first.
export function fillRecipe(state, uid, recipeId) {
  const f = state.furniture[uid];
  const cfg = cookerConfig(f);
  const d = cookerState(state, f);
  const r = recipe(recipeId);
  if (!d || !r) return fail(say('Unknown recipe.', '未知菜谱。'));
  if (d.job) return fail(say('The cooker is busy.', '炊具正在使用中。'));
  clearPot(state, uid);
  const sources = cookSources(state);
  const stock = stockOf(state, sources);
  const ids = r.items.length ? (r.items.every((id) => stock.get(id)) ? [...r.items] : null) : pickGeneric(r, stock, { allowed: allowedRecipes(cfg), usable: (x) => recipeUsable(state, x), level: profLevel(state, 'cook') });
  if (!ids) return fail(say('Missing ingredients.', '食材不足。'));
  const pot = state.inventories[d.pot];
  for (const id of ids) {
    let best = null;
    for (const invId of sources) {
      for (const inst of state.inventories[invId]?.items || []) {
        if (inst.id !== id) continue;
        if (!best || lifeLeftDays(inst) < lifeLeftDays(best.inst)) best = { invId, inst };
      }
    }
    if (!best || !moveItem(state, state.inventories[best.invId], best.inst.uid, pot, null, null, { allowOverweight: true }).ok) {
      clearPot(state, uid);
      return fail(say('Not enough room in the pot.', '锅里放不下。'));
    }
    d.from[best.inst.uid] = best.invId;
  }
  return { ok: true };
}

// ------------------------------------------------------------------------------------------ pre-disaster trial
// "Try cooking" (Config_FurnitureFunc 1710): a guided look at the stove before the disaster.
export function trialCooking(state) {
  state.cooking.trials = (state.cooking.trials || 0) + 1;
  if (state.cooking.trials === 1) addProfExp(state, 'cook', 30);
}

// ------------------------------------------------------------------------------------------ system
function advance(state, f, job, dt) {
  if (job.tend) {
    if (job.tendedAt !== state.clock.t) job.endsAt += dt;
    return false;
  }
  if (!isPowered(f)) {
    job.endsAt += dt;
    return false;
  }
  job.done += dt;
  return job.done >= job.dur - 0.5;
}

export function tickCooking(state, dt) {
  for (const f of Object.values(state.furniture)) {
    const { cook, brew, press } = f.data || {};
    if (cook?.job && advance(state, f, cook.job, dt)) finishJob(state, f);
    if (brew?.job && state.clock.t >= brew.job.endsAt) finishBrew(state, f);
    if (press?.job && advance(state, f, press.job, dt)) finishPress(state, f);
  }
}

function ensureCooking(state) {
  state.cooking ||= { unlocked: [], trials: 0, fridgeTold: false };
  if (profLevel(state, 'cook') >= 2) state.cooking.fridgeTold = true;
}

function recallStudentRecipe(state) {
  if (state.meta.character !== 'student' || state.phase !== 'post') return;
  const next = STUDENT_RECIPES.find((id) => !state.cooking.unlocked.includes(id));
  if (next == null) return;
  state.cooking.unlocked.push(next);
  const name = recipe(next).zh;
  emit('recipeUnlocked', { recipe: next });
  emit('toast', { text: say(`Late at night you remember how to make ${loc(name)}. New recipe!`, `深夜里，你想起了${name}的做法。解锁新食谱！`), kind: 'good' });
}

function hourly(state, hour) {
  if (hour === 22) recallStudentRecipe(state);
  for (const f of homeFurniture(state)) {
    const pot = f.data.cook?.hotpot;
    if (pot && state.clock.t - pot.cookedAt > HOTPOT.keepHours * HOUR) {
      f.data.cook.hotpot = null;
      emit('toast', { text: say('The leftover hot pot went bad.', '剩下的火锅放坏了。'), kind: 'bad' });
    }
  }
  for (const inv of Object.values(state.inventories)) {
    if (inv.kind !== 'cooker' || state.furniture[inv.owner]) continue;
    const at = inv.at || state.player;
    for (const inst of [...inv.items]) dropToFloor(state, inst, at.floor, at.x, at.y);
    destroyInventory(state, inv.id);
  }
}

registerSystem({
  id: 'cooking',
  order: 45,
  init(state) {
    current = state;
    ensureCooking(state);
  },
  ensure(state) {
    current = state;
    ensureCooking(state);
  },
  tick(state, dt) {
    current = state;
    tickCooking(state, dt);
  },
  onHour(state, hour) {
    hourly(state, hour);
  },
});

on('ate', ({ id }) => {
  const state = current;
  if (!state) return;
  if (RATION_SAT[id]) addStat(state, 'sat', RATION_SAT[id] * (getMods(state).eatSat || 1), 'ration');
  if (COFFEE_DISHES.has(id)) {
    addEffect(state, 'caffeine', 8);
    addStat(state, 'sta', 5, 'coffee');
  }
  if (WARM_DISHES.has(id)) {
    removeEffect(state, 'cold');
    addEffect(state, 'warm', 3);
  }
});

on('profUp', ({ key, lv }) => {
  const state = current;
  if (key !== 'cook' || lv < 2 || !state?.cooking || state.cooking.fridgeTold) return;
  state.cooking.fridgeTold = true;
  emit('toast', { text: say('Cooking Lv2: cookers can now take ingredients straight from your fridges.', '烹饪等级2：炊具可以直接取用冰箱里的食材了。'), kind: 'good' });
});

registerKind('cookCollect', {
  complete(state, a) {
    collectOutput(state, a.furn);
  },
});

registerSuggestions((state) => {
  if (state.player.scene !== 'home') return null;
  const out = [];
  const ready = homeFurniture(state).find((f) => state.inventories[f.data.cook?.out || f.data.press?.out]?.items.length);
  if (ready) {
    const first = state.inventories[ready.data.cook?.out || ready.data.press?.out].items[0];
    out.push({
      id: 'collectDish',
      label: say(`Collect ${itemName(first.id)}`, `取出${itemName(first.id)}`),
      run: () => enqueue(state, { kind: 'cookCollect', label: say('Collect', '收取'), target: { furn: ready.uid }, furn: ready.uid, dur: 60 }),
    });
  }
  const hungry = state.player.stats.sat < effectiveMax(state, 'sat') * 0.45;
  const pot = hungry && homeFurniture(state).find((f) => f.data.cook?.hotpot?.sat > 1);
  if (pot) out.push({ id: 'hotpot', label: say('Eat hot pot', '享用火锅'), run: () => eatHotPot(state, pot.uid) });
  return out;
});
