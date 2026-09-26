// Electricity (dev logs #1 and 06-03; patches 08-15 … 09-12). The city grid works until the Day 7
// blackout and flickers from Day 4; after that the home runs on its own sources: solar panels
// (daylight × weather), fuel generators (fuel slots, auto start/stop), manual generators (stamina),
// rat-cage generators (fed rodents) and batteries. Every tick generation is balanced against the
// draw of switched-on appliances; once the batteries run dry, low-priority appliances are shed.
// Units: generation and draw in W (Config_Furniture.PowerCost, FurnitureElectrical.BasePower),
// storage in Wh (FurnitureElectrical.Capacity); FuelRate is heat burned per 10 game minutes.
import { registerSystem } from './tick.js';
import { registerKind, enqueue } from './actions.js';
import { furn, item, itemName, elecCfg, ELEC, CAT, SUB, SLOT, dishOutput } from '../data/db.js';
import { FUNC_SPECS } from '../content/funcSpecs.js';
import { homeDef, homeFurniture, allSlots, slotDef, furnLabel, isFloorUnlocked, isRoomUnlocked, createFurniture, dropToFloor } from './home.js';
import { createInventory, insert, removeUid, findUid, organize, makeInstance } from './inventory.js';
import { homeSources, hasItems, consumeItems, startFurnitureFunction } from './furnActions.js';
import { registerSuggestions } from './suggest.js';
import { lifeLeftDays } from './spoilage.js';
import { getMods } from './modifiers.js';
import { hasEffect } from './stats.js';
import { daylight, dayNumber, dayStartT, isNight, HOUR } from './time.js';
import { weatherSunFactor, baseIndoorTemp, THERMOSTAT } from './weather.js';
import { logEvent } from './state.js';
import { rand } from '../engine/rng.js';
import { emit } from '../engine/bus.js';
import { pickLang } from '../engine/i18n.js';

export const GRID_CUT_DAY = 7;
export const LIGHT_W = 6; // main lighting per unlocked floor (at night; the basement always)
const GRID_CHARGE = 0.1; // share of battery capacity the grid refills per hour
const TEN_MIN = 600;
const STORM_DAMAGE = 0.03; // chance per stormy hour that lightning damages the wiring
const STARVE_GRACE = 24 * HOUR;
const STARVE_EVERY = 12 * HOUR;
const COLD_UNIT = 42056; // cold storage refrigeration unit (Warehouse Manager)
const FIREPLACE_FUNC = 1776;
const GENERATOR_PANEL_FUNC = 1755;
const RAT_CAGE_PANEL_FUNC = 1790;
const WIRE = 20104;

// Rodent places per cage size (small / medium / large / extra large); the config Capacity is feed storage.
export const RODENT_SLOTS = { 42010: 2, 42011: 4, 42012: 6, 42009: 8 };
// Live rodents that run a cage wheel (patch 08-17 added guinea pigs and lab mice) -> their corpse.
export const LIVE_RODENTS = { 30000: 30017, 30003: 30018, 30007: 30019, 30008: 30020, 30021: 30023, 30022: 30024 };
const HEATER_MATERIALS = new Set([20001, 20005, 20101, 20106, 20107, 2505, 2506, 3024]);
const NOT_FEED_SUBS = new Set([SUB.SEASONING, SUB.SOFT_DRINK, SUB.LIQUOR]);

const ROLE = {
  [ELEC.CONSUMER]: 'consumer',
  [ELEC.SOLAR]: 'solar',
  [ELEC.FUEL_GEN]: 'fuelGen',
  [ELEC.MANUAL_GEN]: 'manualGen',
  [ELEC.BATTERY]: 'battery',
  [ELEC.RAT_GEN]: 'ratGen',
  [ELEC.FUEL_HEATER]: 'heater',
};

// the role follows from the config row alone, so it is worked out once per config id (tickPower asks every sub-step)
/** @type {Map<number, string | null>} */
const roleByCfg = new Map();

export function powerRole(f) {
  if (!f || typeof f.cfg !== 'number') return null;
  let role = roleByCfg.get(f.cfg);
  if (role === undefined) {
    const d = furn(f.cfg);
    role = !d ? null : d.funcs.includes(FIREPLACE_FUNC) ? 'heater' : ROLE[d.elec] || null;
    roleByCfg.set(f.cfg, role);
  }
  return role;
}

function cfgOf(f) {
  return elecCfg(furn(f.cfg)?.elecCfg) || null;
}

function inOpenArea(state, f) {
  return isFloorUnlocked(state, f.floor) && isRoomUnlocked(state, f.floor, f.x, f.y);
}

function ensurePower(state) {
  const p = (state.power ||= {});
  p.grid ??= true;
  p.gridCutDay ??= GRID_CUT_DAY;
  p.stored ??= 0;
  p.capacity ??= 0;
  p.homePowered ??= true;
  p.brownout ??= false;
  p.damaged ??= false;
  p.lightsOff ??= false;
  p.lightsPowered ??= true;
  p.flicker ??= null;
  p.blackoutAt ??= null;
  p.outageSince ??= null;
  p.noOutageSince ??= 0;
  p.allTypesSince ??= null;
  p.units ??= {};
  p.coldRooms ??= {};
  p.notices ??= {};
  p.history ??= [];
  p.log ??= [];
  return p;
}

function notice(state, key, text, kind = 'info', cooldown = 2 * HOUR) {
  const p = state.power;
  const last = p.notices[key];
  if (last != null && state.clock.t - last < cooldown) return;
  p.notices[key] = state.clock.t;
  emit('toast', { text, kind });
}

function remember(state, id, day, text) {
  const mem = (state.loop.memories ||= []);
  if (mem.some((m) => m?.id === id)) return;
  mem.push({ id, day, text });
}

// Give an item back to the survivor, or leave it next to the furniture when they are away or full.
function giveBack(state, inst, f) {
  const bp = state.inventories[state.player.backpack];
  if (state.player.scene === 'home' && bp && insert(bp, inst, { allowOverweight: true })) return;
  dropToFloor(state, inst, f.floor, f.x, f.y);
}

// ------------------------------------------------------------------------------ grid
export function gridUp(state) {
  const p = ensurePower(state);
  if (state.phase === 'pre') return true;
  if (dayNumber(state.clock) >= p.gridCutDay) return false;
  const fl = p.flicker;
  return !(fl && state.clock.t >= fl.from && state.clock.t < fl.until);
}

function noteGridChange(state, p, grid) {
  if (grid === p.grid) return;
  const t = state.clock.t;
  if (grid) {
    notice(state, 'gridBack', pickLang({ en: 'Grid power is back — for now.', zh: '电网恢复供电了……暂时。' }), 'good', 0);
  } else if (dayNumber(state.clock) >= p.gridCutDay) {
    p.blackoutAt = t;
    const cr = state.crises;
    cr.upcoming = (cr.upcoming || []).filter((c) => c.id !== 'blackout');
    (cr.active ||= []).push({ id: 'blackout', owner: 'power', type: 'blackout', label: pickLang({ en: 'City Blackout', zh: '全城停电' }), phase: 'active', until: t + 12 * HOUR });
    emit('crisis', { type: 'blackout' });
    notice(state, 'blackout', pickLang({ en: 'The city grid went dark. From now on you live on your own power.', zh: '全城停电了。从现在起只能靠自己发电。' }), 'bad', 0);
    logEvent(state, pickLang({ en: 'City-wide blackout.', zh: '全城大停电。' }), 'bad');
    remember(state, 'blackout', dayNumber(state.clock), { en: `The city-wide blackout comes on Day ${p.gridCutDay}.`, zh: `第${p.gridCutDay}天全城停电。` });
  } else {
    notice(state, 'flicker', pickLang({ en: 'The lights flicker and die. The grid is getting unstable.', zh: '灯闪了几下灭了，电网越来越不稳定。' }), 'bad', 0);
  }
  p.grid = grid;
}

function expireBlackoutCrisis(state) {
  const act = state.crises?.active;
  const i = act ? act.findIndex((c) => c.id === 'blackout') : -1;
  if (i < 0 || state.clock.t < act[i].until) return;
  act.splice(i, 1);
  (state.crises.history ||= []).push({ type: 'blackout', at: state.power.blackoutAt });
}

// ------------------------------------------------------------------------------ batteries
export function batteryCapacity(state, f) {
  return (cfgOf(f)?.Capacity || 0) * (getMods(state).batteryMult || 1);
}

export function storageCapacity(state) {
  let cap = 0;
  for (const f of homeFurniture(state)) if (powerRole(f) === 'battery' && inOpenArea(state, f)) cap += batteryCapacity(state, f);
  return cap;
}

// Manual generators push energy straight into the batteries. Returns the Wh actually stored.
export function injectEnergy(state, wh) {
  const p = ensurePower(state);
  p.capacity = storageCapacity(state);
  const before = p.stored;
  p.stored = Math.min(p.capacity, p.stored + Math.max(0, wh));
  return p.stored - before;
}

// ------------------------------------------------------------------------------ solar
export function solarEfficiency(state) {
  return daylight(state.clock) * weatherSunFactor(state);
}

function solarStep(state, f, eff) {
  const peak = cfgOf(f)?.BasePower || 0;
  if (f.floor === 'B1') return { w: 0, peak, reason: 'basement' };
  if (!slotDef(state, f.slot)?.outdoor) return { w: 0, peak, reason: 'indoors' };
  let reason = null;
  if (daylight(state.clock) <= 0) reason = 'night';
  else if (weatherSunFactor(state) < 0.5) reason = 'overcast';
  return { w: peak * eff, peak, reason };
}

// ------------------------------------------------------------------------------ fuel burners
export function isGeneratorFuel(cfg) {
  return !!cfg && cfg.cat === CAT.FUEL && cfg.burn > 0;
}

export function isHeaterFuel(cfg) {
  return !!cfg && cfg.burn > 0 && (cfg.cat === CAT.FUEL || HEATER_MATERIALS.has(cfg.id));
}

function fuelFilter(f) {
  return powerRole(f) === 'heater' ? isHeaterFuel : isGeneratorFuel;
}

export function fuelSlotCount(state, f) {
  const base = cfgOf(f)?.FuelSlotCount || 0;
  return powerRole(f) === 'fuelGen' ? base + (getMods(state).fuelSlots || 0) : base;
}

// The fuel slots of a generator or heater (f.data.fuel); a new burner starts switched off.
export function fuelInventory(state, f) {
  const slots = Math.max(1, fuelSlotCount(state, f));
  let inv = f.data.fuel && state.inventories[f.data.fuel];
  if (!inv) {
    inv = createInventory(state, { kind: 'powerFuel', w: slots, h: 2, owner: f.uid });
    inv.power = true;
    f.data.fuel = inv.id;
    f.data.heat ??= 0;
    f.data.auto ??= false;
    f.data.autoPct ??= 30;
    f.on = false;
  }
  inv.slots = slots;
  inv.at = { floor: f.floor, x: f.x, y: f.y };
  if (inv.w !== slots) {
    inv.w = slots;
    for (const it of organize(inv)) giveBack(state, it, f);
  }
  return inv;
}

// Keep only accepted items, one per slot. Returns how many items were handed back.
function tidySlots(state, f, inv, accept, limit) {
  const keep = [];
  const out = [];
  for (const it of inv.items) (accept(item(it.id)) && keep.length < limit ? keep : out).push(it);
  if (!out.length) return 0;
  inv.items = keep;
  for (const it of out) giveBack(state, it, f);
  return out.length;
}

export function tidyFuel(state, uid) {
  const f = state.furniture[uid];
  if (!f || !powerRole(f)) return 0;
  const inv = fuelInventory(state, f);
  return tidySlots(state, f, inv, fuelFilter(f), inv.slots);
}

export function fuelHeat(state, f) {
  const inv = fuelInventory(state, f);
  const accept = fuelFilter(f);
  let heat = f.data.heat || 0;
  for (const it of inv.items) if (accept(item(it.id))) heat += item(it.id).burn * (it.qty || 1);
  return heat;
}

// Hours the loaded fuel lasts while burning.
export function fuelHoursLeft(state, f) {
  const rate = cfgOf(f)?.FuelRate || 0;
  return rate > 0 ? (fuelHeat(state, f) / rate) * (TEN_MIN / HOUR) : 0;
}

function takeFuel(inv, accept) {
  const it = [...inv.items].sort((a, b) => a.y - b.y || a.x - b.x).find((i) => accept(item(i.id)));
  if (!it) return 0;
  if ((it.qty || 1) > 1) it.qty -= 1;
  else removeUid(inv, it.uid);
  return item(it.id).burn;
}

// Burn fuel for dt seconds; returns the share of dt that had fuel.
function burn(state, f, dt) {
  const rate = cfgOf(f)?.FuelRate || 0;
  if (rate <= 0) return 1;
  const inv = fuelInventory(state, f);
  const accept = fuelFilter(f);
  const total = (rate * dt) / TEN_MIN;
  let need = total;
  while (need > 0) {
    const heat = f.data.heat || 0;
    if (heat >= need) {
      f.data.heat = heat - need;
      need = 0;
      break;
    }
    need -= heat;
    f.data.heat = takeFuel(inv, accept);
    if (!f.data.heat) break;
  }
  return 1 - need / total;
}

// Start/stop a generator or light/extinguish a heater. A manual shutdown also unchecks Auto Start.
export function setBurner(state, uid, on, { manual = true } = {}) {
  const f = state.furniture[uid];
  if (!f || !['fuelGen', 'heater'].includes(powerRole(f))) return false;
  fuelInventory(state, f);
  f.data.stopped = null;
  if (on) {
    if (fuelHeat(state, f) <= 0) return pickLang({ en: 'Insufficient fuel', zh: '燃料不足' });
    f.on = true;
  } else {
    f.on = false;
    f.data.lit = false;
    if (manual) f.data.auto = false;
  }
  emit('powerChanged', { furn: uid });
  return true;
}

export function setAutoStart(state, uid, auto, pct) {
  const f = state.furniture[uid];
  if (!f || powerRole(f) !== 'fuelGen') return false;
  fuelInventory(state, f);
  f.data.auto = !!auto;
  if (pct != null) f.data.autoPct = Math.max(5, Math.min(95, Math.round(pct)));
  return true;
}

function generatorStep(state, f, ctx, dt) {
  const peak = cfgOf(f)?.BasePower || 0;
  const inv = fuelInventory(state, f);
  tidySlots(state, f, inv, isGeneratorFuel, inv.slots);
  const d = f.data;
  const hasFuel = (d.heat || 0) > 0 || inv.items.length > 0;
  const full = ctx.capacity > 0 && ctx.stored >= ctx.capacity - 0.01;
  const wanted = ctx.capacity > 0 ? ctx.stored < (ctx.capacity * d.autoPct) / 100 : !ctx.grid && ctx.deficit > 0;
  if (d.auto && f.on !== true && hasFuel && wanted) {
    f.on = true;
    d.stopped = null;
  }
  // auto-shutdown at full power; without batteries Auto Start also stops when nothing needs power
  const idle = d.auto && ctx.capacity <= 0 && (ctx.grid || ctx.deficit <= 0);
  if (f.on === true && (full || idle)) {
    f.on = false;
    d.lit = false;
    d.stopped = full ? 'full' : null;
  }
  if (f.on !== true) {
    d.lit = false;
    return { w: 0, peak, reason: !hasFuel ? 'noFuel' : d.auto ? 'standby' : d.stopped || 'off' };
  }
  const share = burn(state, f, dt);
  d.lit = share > 0;
  if (share < 1) {
    f.on = false;
    d.lit = false;
    notice(state, `noFuel:${f.uid}`, pickLang({ en: `${furnLabel(f)} ran out of fuel.`, zh: `${furnLabel(f)}燃料耗尽了。` }), 'bad', 0);
    return { w: peak * share, peak, reason: 'noFuel' };
  }
  return { w: peak, peak, reason: ctx.grid ? 'grid' : null };
}

function heaterStep(state, f, dt) {
  const inv = fuelInventory(state, f);
  tidySlots(state, f, inv, isHeaterFuel, inv.slots);
  const d = f.data;
  if (f.on !== true) {
    d.lit = false;
    return { w: 0, reason: (d.heat || 0) > 0 || inv.items.length ? 'off' : 'noFuel' };
  }
  const share = burn(state, f, dt);
  d.lit = share > 0;
  if (share < 1) {
    f.on = false;
    d.lit = false;
    notice(state, `noFuel:${f.uid}`, pickLang({ en: `${furnLabel(f)} burned out. Add fuel to keep warm.`, zh: `${furnLabel(f)}的火灭了，添些燃料才能继续取暖。` }), 'bad', 0);
    return { w: 0, reason: 'noFuel' };
  }
  return { w: 0, reason: null, heat: furn(f.cfg).heat };
}

// Burnables for a heater from the backpack and home storage: scrap first, real fuel last.
function heaterFuelSources(state) {
  const out = [];
  for (const invId of homeSources(state)) {
    const inv = state.inventories[invId];
    for (const it of inv?.items || []) if (isHeaterFuel(item(it.id))) out.push({ inv, it });
  }
  const rank = (cfg) => (cfg.cat === CAT.FUEL ? 1 : 0) * 1e6 + cfg.burn;
  return out.sort((a, b) => rank(item(a.it.id)) - rank(item(b.it.id)));
}

export function loadHeaterFuel(state, uid) {
  const f = state.furniture[uid];
  if (!f || powerRole(f) !== 'heater') return 0;
  const inv = fuelInventory(state, f);
  let moved = 0;
  for (const { inv: from, it } of heaterFuelSources(state)) {
    if (inv.items.length >= inv.slots) break;
    removeUid(from, it.uid);
    if (insert(inv, it)) moved++;
    else if (!insert(from, it, { allowOverweight: true })) giveBack(state, it, f);
  }
  return moved;
}

// ------------------------------------------------------------------------------ rat cages
export function rodentSlots(f) {
  return RODENT_SLOTS[f.cfg] || 2;
}

export function feedCapacity(f) {
  return cfgOf(f)?.Capacity || 2;
}

export function isLiveRodent(id) {
  return !!LIVE_RODENTS[id];
}

// Food a rodent will eat: anything with satiety except live animals.
function edible(cfg) {
  return !!cfg && cfg.cat === CAT.FOOD && cfg.sat > 0 && !cfg.prey;
}

const byShelfLife = (a, b) => Math.min(lifeLeftDays(a), 1e9) - Math.min(lifeLeftDays(b), 1e9);

// What One-Click Feeding picks: plain food, never dishes, drinks or seasonings.
export function isRatFeed(cfg) {
  return edible(cfg) && !dishOutput[cfg.id] && !NOT_FEED_SUBS.has(cfg.sub) && !cfg.noUse && !cfg.story;
}

// The cage's feed storage (f.data.feed); the rodents themselves live in `inv.rats` so they neither
// spoil nor get lost when the cage is dismantled.
export function cageFeed(state, f) {
  let inv = f.data.feed && state.inventories[f.data.feed];
  if (!inv) {
    const cap = feedCapacity(f);
    const w = Math.min(8, Math.max(2, cap));
    inv = createInventory(state, { kind: 'ratFeed', w, h: Math.max(2, Math.ceil((cap * 2) / w)), owner: f.uid });
    inv.power = true;
    inv.rats = [];
    f.data.feed = inv.id;
    f.data.bowl ??= 0;
  }
  inv.rats ||= [];
  inv.at = { floor: f.floor, x: f.x, y: f.y };
  return inv;
}

export function cageRodents(state, f) {
  return cageFeed(state, f).rats;
}

export function tidyFeed(state, uid) {
  const f = state.furniture[uid];
  if (!f || powerRole(f) !== 'ratGen') return 0;
  return tidySlots(state, f, cageFeed(state, f), edible, feedCapacity(f));
}

export function putRodent(state, uid, fromInvId, instUid) {
  const f = state.furniture[uid];
  if (!f || powerRole(f) !== 'ratGen') return false;
  const cage = cageFeed(state, f);
  if (cage.rats.length >= rodentSlots(f)) return pickLang({ en: 'The cage is full.', zh: '笼子满了。' });
  const from = state.inventories[fromInvId];
  const inst = from && findUid(from, instUid);
  if (!inst || !isLiveRodent(inst.id)) return pickLang({ en: 'Only live mice, rats, guinea pigs and lab mice can run the wheel.', zh: '只有活的老鼠、豚鼠和小白鼠才能踩轮发电。' });
  removeUid(from, instUid);
  cage.rats.push(inst);
  emit('powerChanged', { furn: uid });
  return true;
}

export function takeRodent(state, uid, index) {
  const f = state.furniture[uid];
  if (!f || powerRole(f) !== 'ratGen') return false;
  const cage = cageFeed(state, f);
  const [inst] = cage.rats.splice(index, 1);
  if (!inst) return false;
  giveBack(state, inst, f);
  emit('powerChanged', { furn: uid });
  return true;
}

// One-click mouse insertion (patch 08-16): fill every empty place with live rodents from the backpack.
export function fillRodents(state, uid) {
  const f = state.furniture[uid];
  if (!f || powerRole(f) !== 'ratGen') return 0;
  const bp = state.inventories[state.player.backpack];
  let n = 0;
  for (const it of [...bp.items]) {
    if (cageRodents(state, f).length >= rodentSlots(f)) break;
    if (isLiveRodent(it.id) && putRodent(state, uid, bp.id, it.uid) === true) n++;
  }
  return n;
}

// One-click feeding (patch 08-17): fill the feed storage from the backpack and fridges, shortest
// remaining shelf life first.
export function feedCage(state, uid) {
  const f = state.furniture[uid];
  if (!f || powerRole(f) !== 'ratGen') return 0;
  const cage = cageFeed(state, f);
  const sources = [state.player.backpack, ...homeSources(state).filter((id) => state.inventories[id]?.cold > 0)];
  const food = [];
  for (const invId of sources) for (const it of state.inventories[invId]?.items || []) if (isRatFeed(item(it.id))) food.push({ inv: state.inventories[invId], it });
  food.sort((a, b) => byShelfLife(a.it, b.it));
  let n = 0;
  for (const { inv, it } of food) {
    if (cage.items.length >= feedCapacity(f)) break;
    removeUid(inv, it.uid);
    if (insert(cage, it)) n++;
    else insert(inv, it, { allowOverweight: true });
  }
  if (n) {
    f.data.notified = false;
    emit('powerChanged', { furn: uid });
  }
  return n;
}

export function feedSatiety(state, f) {
  let sat = f.data.bowl || 0;
  for (const it of cageFeed(state, f).items) {
    const cfg = item(it.id);
    if (edible(cfg)) sat += cfg.sat * Math.max(1, cfg.uses > 1 ? (it.uses ?? cfg.uses) : (it.qty || 1)) * (it.left ?? 1);
  }
  return sat;
}

// Hours the stored feed lasts for the rodents in the cage.
export function feedHoursLeft(state, f) {
  const n = cageRodents(state, f).length;
  const rate = cfgOf(f)?.FuelRate || 0;
  return n && rate ? ((feedSatiety(state, f) / (rate * n)) * TEN_MIN) / HOUR : 0;
}

function takeFeed(cage) {
  const food = cage.items.filter((it) => edible(item(it.id))).sort(byShelfLife);
  const it = food[0];
  if (!it) return 0;
  const cfg = item(it.id);
  if (cfg.uses > 1) {
    it.uses = (it.uses ?? cfg.uses) - 1;
    if (it.uses <= 0) removeUid(cage, it.uid);
  } else if ((it.qty || 1) > 1) {
    it.qty -= 1;
  } else {
    removeUid(cage, it.uid);
  }
  return cfg.sat;
}

function starve(state, f, cage) {
  const hungry = state.clock.t - f.data.hungrySince;
  if (hungry < STARVE_GRACE) return;
  const deaths = Math.floor((hungry - STARVE_GRACE) / STARVE_EVERY) + 1;
  while ((f.data.starved || 0) < deaths && cage.rats.length) {
    const rat = cage.rats.shift();
    f.data.starved = (f.data.starved || 0) + 1;
    const corpse = LIVE_RODENTS[rat.id];
    if (corpse && item(corpse)) giveBack(state, makeInstance(state, corpse), f);
    state.progress.counters['rat.starved'] = (state.progress.counters['rat.starved'] || 0) + 1;
    emit('ratDied', { furn: f.uid, id: rat.id });
    emit('toast', { text: pickLang({ en: `A ${itemName(rat.id)} starved to death in ${furnLabel(f)}.`, zh: `${furnLabel(f)}里的${itemName(rat.id)}饿死了。` }), kind: 'bad' });
  }
}

function ratStep(state, f, dt) {
  const each = cfgOf(f)?.BasePower || 0;
  const peak = each * rodentSlots(f);
  const cage = cageFeed(state, f);
  tidySlots(state, f, cage, edible, feedCapacity(f));
  const d = f.data;
  const n = cage.rats.length;
  if (!n) {
    d.hungrySince = null;
    return { w: 0, peak, reason: 'empty' };
  }
  const rate = cfgOf(f)?.FuelRate || 0;
  const total = (rate * n * dt) / TEN_MIN;
  let need = total;
  while (need > 0) {
    if ((d.bowl || 0) >= need) {
      d.bowl -= need;
      need = 0;
      break;
    }
    need -= d.bowl || 0;
    d.bowl = takeFeed(cage);
    if (!d.bowl) break;
  }
  const fed = total > 0 ? 1 - need / total : 1;
  if (fed >= 1) {
    d.hungrySince = null;
    d.starved = 0;
    d.notified = false;
    return { w: each * n, peak, reason: null };
  }
  d.hungrySince ??= state.clock.t;
  if (!d.notified) {
    d.notified = true;
    emit('toast', { text: pickLang({ en: `${furnLabel(f)} ran out of food and stopped generating power.`, zh: `${furnLabel(f)}没有食物了，停止发电。` }), kind: 'bad' });
  }
  starve(state, f, cage);
  return { w: each * cage.rats.length * fed, peak, reason: 'noFood' };
}

// Hand back contents of fuel slots and cages whose furniture was dismantled or packed up.
function collectOrphans(state) {
  for (const inv of Object.values(state.inventories)) {
    if (!inv.power) continue;
    const f = state.furniture[inv.owner];
    const key = inv.kind === 'ratFeed' ? 'feed' : 'fuel';
    if (f && state.home.slots[f.slot] === f.uid && f.data?.[key] === inv.id) continue;
    const at = inv.at || { floor: state.player.floor, x: state.player.x, y: state.player.y };
    for (const it of [...inv.items, ...(inv.rats || [])]) dropToFloor(state, it, at.floor, at.x, at.y);
    delete state.inventories[inv.id];
  }
}

// ------------------------------------------------------------------------------ consumers
function inUse(state, f) {
  const a = state.actions?.current;
  if (a && a.phase === 'work' && (a.furn === f.uid || a.target?.furn === f.uid)) return true;
  return !!(f.data?.cooking || f.data?.crafting || f.data?.busy);
}

function desiredDraw(state, f, d, ctx) {
  if (f.on === false) return 0;
  if (f.cfg === COLD_UNIT || d.cold > 0) return d.pw;
  if (d.heat > 0) return ctx.base[f.floor] < THERMOSTAT ? d.pw : 0;
  if (d.slot === SLOT.DEFENSE) return ctx.horde ? d.pw : 0;
  if (d.pwMode === 1) return inUse(state, f) ? d.pw : 0;
  return d.pw;
}

// Lower number = kept longer in a shortage: fridges first, lights last.
function priority(f, d) {
  if (d.cold > 0) return 0;
  if (f.cfg === COLD_UNIT) return 1;
  if (d.slot === SLOT.DEFENSE) return 2;
  if (d.heat > 0) return 3;
  if (d.pwMode === 1) return 5;
  return 4;
}

function idleReason(f, d, ctx) {
  if (f.on === false) return 'off';
  if (d.heat > 0) return 'thermostat';
  if (d.slot === SLOT.DEFENSE && !ctx.horde) return 'noHorde';
  return 'idle';
}

function lightDraw(state, p) {
  if (p.lightsOff) return 0;
  const night = isNight(state.clock);
  let w = 0;
  for (const floor of Object.keys(homeDef(state.home.id).floors)) if (isFloorUnlocked(state, floor) && (night || floor === 'B1')) w += LIGHT_W;
  return w;
}

export function setApplianceOn(state, uid, on) {
  const f = state.furniture[uid];
  if (!f || powerRole(f) !== 'consumer') return false;
  f.on = !!on;
  emit('powerChanged', { furn: uid });
  return true;
}

export function setLights(state, on) {
  ensurePower(state).lightsOff = !on;
  emit('powerChanged', {});
}

// Shortage: hand out generation by priority; whatever is left recharges the batteries.
function allocate(loads, lightW, genW) {
  const list = loads.filter((l) => l.w > 0).map((l) => ({ key: l.f.uid, w: l.w, prio: l.prio }));
  if (lightW > 0) list.push({ key: 'lights', w: lightW, prio: 6 });
  list.sort((a, b) => a.prio - b.prio);
  let spare = genW;
  const on = new Set();
  for (const l of list) {
    if (l.w <= spare + 1e-9) {
      spare -= l.w;
      on.add(l.key);
    }
  }
  return { on, spare };
}

// ------------------------------------------------------------------------------ circuit damage
export function damageCircuit(state, cause = 'storm') {
  const p = ensurePower(state);
  if (p.damaged) return;
  p.damaged = true;
  emit('powerChanged', { damaged: true });
  emit('toast', { text: cause === 'storm' ? pickLang({ en: 'Lightning damaged the wiring! Repair the circuit to get power back.', zh: '雷击损坏了电路！修好电路才能恢复供电。' }) : pickLang({ en: 'The wiring is damaged. Repair the circuit.', zh: '电路受损了，需要修理。' }), kind: 'bad' });
  logEvent(state, pickLang({ en: 'The home circuit was damaged.', zh: '家里的电路受损。' }), 'bad');
}

export function repairCircuit(state) {
  const p = ensurePower(state);
  if (!p.damaged) return;
  p.damaged = false;
  state.progress.counters['power.repair'] = (state.progress.counters['power.repair'] || 0) + 1;
  emit('powerChanged', { damaged: false });
  emit('toast', { text: pickLang({ en: 'Circuit repaired. Power is flowing again.', zh: '电路修好了，恢复供电。' }), kind: 'good' });
}

// Repair from the power panel: plain (1 h) or quick with wire (Config_FurnitureFunc 43 / 223).
export function queueRepair(state, withWire = false) {
  const key = withWire ? 223 : 43;
  const spec = FUNC_SPECS[key];
  return enqueue(state, {
    kind: 'repairPower',
    label: withWire ? pickLang({ en: 'Repair Circuit (Wire)', zh: '用铁丝修理电路' }) : pickLang({ en: 'Repair Power', zh: '修复电力' }),
    funcKey: key,
    spec,
    dur: spec.min * 60,
    cost: spec.cost,
    noWalk: true,
  });
}

// ------------------------------------------------------------------------------ cold storage
function coldRooms(state) {
  const out = [];
  for (const [floor, def] of Object.entries(homeDef(state.home.id).floors)) {
    for (const room of def.rooms || []) if (room.cold) out.push({ floor, room });
  }
  return out;
}

const inRoom = (f, floor, r) => f.floor === floor && f.x >= r.x && f.x < r.x + r.w && f.y >= r.y && f.y < r.y + r.h;

// The Warehouse Manager's cold storage needs a refrigeration unit; place one if the home has none.
function ensureColdUnits(state) {
  if (!state.home) return;
  for (const { floor, room } of coldRooms(state)) {
    if (homeFurniture(state).some((f) => f.cfg === COLD_UNIT && inRoom(f, floor, room))) continue;
    const free = allSlots(state).filter((s) => s.floor === floor && !state.home.slots[s.id] && !s.trap && s.x >= room.x && s.x < room.x + room.w && s.y >= room.y && s.y < room.y + room.h);
    const slot = free[free.length - 1];
    if (!slot) continue;
    const f = createFurniture(state, COLD_UNIT, slot.id, { fixed: true });
    f.on = false;
  }
}

// A sealed (still locked) cold room keeps its chill; once opened it needs the unit running on power.
function updateColdStorage(state) {
  const p = state.power;
  const rooms = coldRooms(state);
  p.coldRooms = {};
  for (const { floor, room } of rooms) {
    const sealed = !!room.lock && !state.home.unlocked[room.lock];
    const unit = homeFurniture(state).find((f) => f.cfg === COLD_UNIT && inRoom(f, floor, room));
    const running = !sealed && !!unit && unit.on !== false && unit.powered !== false;
    p.coldRooms[room.id] = { sealed, running, unit: unit?.uid ?? null };
  }
  if (!rooms.length) return;
  for (const f of homeFurniture(state)) {
    const inv = f.inv && state.inventories[f.inv];
    if (!inv) continue;
    const r = rooms.find(({ floor, room }) => inRoom(f, floor, room));
    const st = r ? p.coldRooms[r.room.id] : null;
    inv.coldRoom = !!st && (st.sealed || st.running);
    inv.sealed = !!st?.sealed;
  }
}

// ------------------------------------------------------------------------------ the balance
export function tickPower(state, dt) {
  const p = ensurePower(state);
  const t = state.clock.t;
  const hours = dt / HOUR;
  collectOrphans(state);
  expireBlackoutCrisis(state);

  const u = { consumer: [], solar: [], fuelGen: [], manualGen: [], battery: [], ratGen: [], heater: [] };
  for (const f of homeFurniture(state)) {
    const role = powerRole(f);
    if (!role) continue;
    if (role === 'consumer' && !inOpenArea(state, f)) {
      f.powered = false;
      continue;
    }
    u[role].push(f);
  }
  const status = {};
  p.capacity = u.battery.reduce((s, f) => s + batteryCapacity(state, f), 0);
  p.stored = Math.max(0, Math.min(p.stored, p.capacity));
  const grid = gridUp(state);
  noteGridChange(state, p, grid);

  // demand
  const ctx = { horde: (state.crises?.active || []).some((c) => c.type === 'horde'), base: {} };
  const loads = [];
  for (const f of u.consumer) {
    const d = furn(f.cfg);
    if (d.heat > 0 && ctx.base[f.floor] == null) ctx.base[f.floor] = baseIndoorTemp(state, f.floor);
    loads.push({ f, d, w: desiredDraw(state, f, d, ctx), prio: priority(f, d) });
  }
  const lightW = lightDraw(state, p);
  const drawW = lightW + loads.reduce((s, l) => s + l.w, 0);

  // generation
  const eff = solarEfficiency(state);
  let solarW = 0;
  for (const f of u.solar) {
    status[f.uid] = solarStep(state, f, eff);
    solarW += status[f.uid].w;
  }
  let ratW = 0;
  for (const f of u.ratGen) {
    status[f.uid] = ratStep(state, f, dt);
    ratW += status[f.uid].w;
  }
  let fuelW = 0;
  const gen = { grid, capacity: p.capacity, stored: p.stored, deficit: drawW - solarW - ratW };
  for (const f of u.fuelGen) {
    status[f.uid] = generatorStep(state, f, gen, dt);
    fuelW += status[f.uid].w;
    gen.deficit -= status[f.uid].w;
  }
  for (const f of u.heater) status[f.uid] = heaterStep(state, f, dt);
  for (const f of u.manualGen) status[f.uid] = { w: 0, peak: (cfgOf(f)?.InjectPower || 0) * (HOUR / TEN_MIN), reason: 'manual' };
  for (const f of u.battery) status[f.uid] = { w: 0, cap: batteryCapacity(state, f), reason: null };
  const genW = solarW + ratW + fuelW;

  // balance
  let alloc = null;
  if (p.damaged) {
    p.stored = Math.min(p.capacity, p.stored + genW * hours);
  } else if (grid) {
    p.brownout = false;
    p.stored = Math.min(p.capacity, p.stored + (genW + p.capacity * GRID_CHARGE) * hours);
  } else {
    const net = genW - drawW;
    const need = -net * hours;
    const reserve = Math.max(p.capacity * 0.05, drawW * 0.5);
    if (net >= 0) {
      p.brownout = false;
      p.stored = Math.min(p.capacity, p.stored + net * hours);
    } else if (!p.brownout && p.stored >= need) {
      p.stored -= need;
    } else if (p.brownout && p.stored >= need + reserve) {
      p.brownout = false;
      p.stored -= need;
    } else {
      p.brownout = true;
      alloc = allocate(loads, lightW, genW);
      p.stored = Math.min(p.capacity, p.stored + alloc.spare * hours);
    }
  }

  let usedW = 0;
  for (const l of loads) {
    let powered;
    if (p.damaged) powered = false;
    else if (!alloc) powered = true;
    else if (l.w > 0) powered = alloc.on.has(l.f.uid);
    else powered = l.d.pw <= alloc.spare;
    l.f.powered = powered;
    if (powered) usedW += l.w;
    const reason = p.damaged ? 'damaged' : !powered ? 'shortage' : l.w > 0 ? null : idleReason(l.f, l.d, ctx);
    status[l.f.uid] = { w: powered ? l.w : 0, want: l.w, rated: l.d.pw, reason };
  }
  p.lightsPowered = !p.damaged && (!alloc || alloc.on.has('lights'));
  if (p.lightsPowered) usedW += lightW;
  p.homePowered = !p.damaged && (grid || (!p.brownout && (genW > 0 || p.stored > 0)));
  updateColdStorage(state);

  // outages and notifications
  const outage = p.damaged || p.brownout;
  if (outage && p.outageSince == null) {
    p.outageSince = t;
    if (p.brownout) notice(state, 'shortage', pickLang({ en: 'Power shortage! Appliances are shutting down.', zh: '电力不足！部分电器已断电。' }), 'bad');
  } else if (!outage && p.outageSince != null) {
    p.outageSince = null;
    p.noOutageSince = t;
    notice(state, 'restored', pickLang({ en: 'Power restored.', zh: '恢复供电。' }), 'good');
  }
  const sig = `${p.damaged}|${p.homePowered}|${p.lightsPowered}|${loads.filter((l) => !l.f.powered).map((l) => l.f.uid).join(',')}`;
  if (sig !== p._sig) {
    if (p._sig != null) emit('powerChanged', { homePowered: p.homePowered });
    p._sig = sig;
  }

  // achievements: Power Up (own generator + battery) and True Electrician (all four source types, no outage for a day)
  const c = state.progress.counters;
  const ownSource = u.solar.length + u.fuelGen.length + u.ratGen.length + u.manualGen.length > 0;
  if (!grid && !outage && u.battery.length && ownSource && drawW > 0 && (genW > 0 || p.stored > 0)) c['power.own'] = 1;
  const allTypes = u.solar.length && u.fuelGen.length && u.battery.length && u.ratGen.length;
  if (!allTypes) p.allTypesSince = null;
  else p.allTypesSince ??= t;
  if (allTypes && !outage && t - Math.max(p.allTypesSince, p.noOutageSince || 0) >= 24 * HOUR) c['power.allTypes'] = 1;

  // readouts for the panel, the renderer (homePowered / lightsOff) and story checks (daily history)
  Object.assign(p, { grid, gen: genW, draw: drawW, used: usedW, solarW, fuelW, ratW, solarEff: eff, units: status });
  const pct = p.capacity > 0 ? p.stored / p.capacity : null;
  const day = state.phase === 'pre' ? 0 : dayNumber(state.clock);
  if (p.today?.day !== day) {
    if (p.today) p.history.push(p.today);
    if (p.history.length > 30) p.history.shift();
    p.today = { day, minPct: pct, outageMin: 0, genWh: 0, drawWh: 0 };
  }
  const rec = p.today;
  if (pct != null) rec.minPct = rec.minPct == null ? pct : Math.min(rec.minPct, pct);
  rec.outageMin += outage ? dt / 60 : 0;
  rec.genWh += genW * hours;
  rec.drawWh += usedW * hours;
}

// ------------------------------------------------------------------------------ system
registerSystem({
  id: 'power',
  order: 30,
  init(state) {
    ensurePower(state);
    ensureColdUnits(state);
  },
  ensure(state) {
    ensurePower(state);
    ensureColdUnits(state);
  },
  tick(state, dt) {
    tickPower(state, dt);
  },
  onHour(state) {
    if (state.phase !== 'post') return;
    const p = ensurePower(state);
    const ext = Math.max(0.3, getMods(state).weatherExtreme ?? 1);
    if (!p.damaged && state.weather?.today?.kind === 'storm' && rand(state) < STORM_DAMAGE * ext) damageCircuit(state, 'storm');
  },
  onDay(state, day) {
    const p = ensurePower(state);
    if (day >= 4 && day < p.gridCutDay && !p.blackoutAt && rand(state) < 0.6) {
      const from = dayStartT(state.clock, day) + (7 + rand(state) * 14) * HOUR;
      p.flicker = { from, until: from + (20 + rand(state) * 70) * 60 };
    }
    // a survivor who remembers the blackout sees it coming
    const cr = state.crises;
    if (!p.blackoutAt && day >= p.gridCutDay - 2 && day < p.gridCutDay && (state.loop.memories || []).some((m) => m?.id === 'blackout')) {
      cr.upcoming ||= [];
      if (!cr.upcoming.some((x) => x.id === 'blackout')) cr.upcoming.push({ id: 'blackout', owner: 'power', type: 'blackout', label: pickLang({ en: 'City Blackout', zh: '全城停电' }), at: dayStartT(state.clock, p.gridCutDay) });
    }
  },
});

// ------------------------------------------------------------------------------ action kinds
const burnerOf = (state, a) => {
  const f = state.furniture[a.furn];
  return f && ['fuelGen', 'heater'].includes(powerRole(f)) ? f : null;
};

registerKind('generator', {
  canStart(state, a) {
    const f = burnerOf(state, a);
    if (!f) return pickLang({ en: 'Nothing to start.', zh: '没有可启动的设备。' });
    if (a.spec?.on && fuelHeat(state, f) <= 0) return pickLang({ en: 'Insufficient fuel', zh: '燃料不足' });
    return true;
  },
  complete(state, a) {
    const f = burnerOf(state, a);
    if (!f) return;
    const r = setBurner(state, f.uid, !!a.spec?.on, { manual: true });
    if (r !== true) emit('toast', { text: r, kind: 'bad' });
    else if (a.spec?.on && gridUp(state)) emit('toast', { text: pickLang({ en: 'Grid power is still on; the generator only charges the batteries.', zh: '电网仍在供电，发电机只会给蓄电池充电。' }) });
  },
});

// 1703: one hour on the generator; 1748: 10-minute cycles that repeat until cancelled.
registerKind('manualGen', {
  canStart(state) {
    const cap = storageCapacity(state);
    if (cap <= 0) return pickLang({ en: 'Needs a battery to store the power.', zh: '需要蓄电池来储存电力。' });
    if (ensurePower(state).stored >= cap - 0.5) return pickLang({ en: 'The batteries are full.', zh: '蓄电池已经充满了。' });
    return true;
  },
  complete(state, a) {
    const f = state.furniture[a.furn];
    if (!f) return;
    const wh = (cfgOf(f)?.InjectPower || 0) * Math.max(1, Math.round((a.dur || TEN_MIN) / TEN_MIN));
    injectEnergy(state, wh);
    state.progress.counters['power.manual'] = (state.progress.counters['power.manual'] || 0) + 1;
    emit('powerChanged', { furn: f.uid });
    if (!a.continuous) return;
    const s = state.player.stats;
    const cost = a.cost || {};
    if (s.sta <= (cost.sta || 0) + 1 || s.sat <= (cost.sat || 0) + 1) {
      emit('toast', { text: pickLang({ en: 'Too exhausted to keep pedaling.', zh: '太累了，踩不动了。' }), kind: 'bad' });
      return;
    }
    if (ensurePower(state).stored >= storageCapacity(state) - 0.5) {
      emit('toast', { text: pickLang({ en: 'The batteries are full.', zh: '蓄电池已经充满了。' }), kind: 'good' });
      return;
    }
    const { kind, label, target, furn: uid, funcKey, dur, spec, cost: c2, continuous } = a;
    enqueue(state, { kind, label, target, furn: uid, funcKey, dur, spec, cost: c2, continuous, noWalk: true }, { front: true });
  },
});

registerKind('repairPower', {
  canStart(state, a) {
    if (!ensurePower(state).damaged) return pickLang({ en: 'The wiring is fine.', zh: '电路完好。' });
    if (a.spec?.need && !hasItems(state, a.spec.need)) return pickLang({ en: `Needs ${itemName(a.spec.need[0][0])}`, zh: `需要${itemName(a.spec.need[0][0])}` });
    return true;
  },
  complete(state, a) {
    consumeItems(state, a.spec?.need);
    repairCircuit(state);
  },
});

registerKind('coldStorage', {
  canStart(state, a) {
    const f = state.furniture[a.furn];
    if (f && !inOpenArea(state, f)) return pickLang({ en: 'The cold storage is locked.', zh: '冷库还锁着。' });
    return true;
  },
  complete(state, a) {
    const f = state.furniture[a.furn];
    if (!f) return;
    f.on = true;
    emit('powerChanged', { furn: f.uid });
    const powered = f.powered !== false && (gridUp(state) || state.power.homePowered);
    emit('toast', {
      text: powered ? pickLang({ en: 'The refrigeration unit hums. The cold storage is chilling again.', zh: '制冷机组运转起来了，冷库重新降温。' }) : pickLang({ en: 'Refrigeration switched on. It will run once there is power.', zh: '制冷机组已合闸，有电时就会运转。' }),
      kind: powered ? 'good' : 'info',
    });
  },
});

// 1776: add fuel from the backpack/storage and light the heater (works without power).
registerKind('fireplace', {
  canStart(state, a) {
    const f = burnerOf(state, a);
    if (!f) return pickLang({ en: 'Nothing to light.', zh: '没有可以点燃的东西。' });
    if (fuelHeat(state, f) > 0 || heaterFuelSources(state).length) return true;
    return pickLang({ en: 'No fuel to burn.', zh: '没有可以烧的燃料。' });
  },
  complete(state, a) {
    const f = burnerOf(state, a);
    if (!f) return;
    loadHeaterFuel(state, f.uid);
    const r = setBurner(state, f.uid, true, { manual: true });
    if (r !== true) emit('toast', { text: r, kind: 'bad' });
    else emit('toast', { text: pickLang({ en: `${furnLabel(f)} is burning.`, zh: `${furnLabel(f)}烧起来了。` }), kind: 'good' });
  },
});

// ------------------------------------------------------------------------------ smart suggestions
function anyItem(state, invIds, test) {
  return invIds.some((id) => state.inventories[id]?.items.some((it) => test(item(it.id))));
}

registerSuggestions((state) => {
  const p = state.power;
  if (!p || state.phase !== 'post' || state.player.scene !== 'home') return null;
  const out = [];
  if (p.damaged) out.push({ id: 'repairPower', label: pickLang({ en: 'Repair the circuit', zh: '修理电路' }), run: () => queueRepair(state, hasItems(state, [[WIRE, 1]])) });
  const fridges = [state.player.backpack, ...homeSources(state).filter((id) => state.inventories[id]?.cold > 0)];
  for (const f of homeFurniture(state)) {
    const reason = p.units[f.uid]?.reason;
    const role = powerRole(f);
    if (role === 'ratGen' && reason === 'noFood' && anyItem(state, fridges, isRatFeed)) {
      out.push({ id: `feed:${f.uid}`, label: pickLang({ en: `Feed the ${furnLabel(f)}`, zh: `喂${furnLabel(f)}` }), run: () => startFurnitureFunction(state, f.uid, RAT_CAGE_PANEL_FUNC) });
    } else if (role === 'fuelGen' && reason === 'noFuel' && p.brownout && anyItem(state, homeSources(state), isGeneratorFuel)) {
      out.push({ id: `refuel:${f.uid}`, label: pickLang({ en: `Refuel the ${furnLabel(f)}`, zh: `给${furnLabel(f)}加燃料` }), run: () => startFurnitureFunction(state, f.uid, GENERATOR_PANEL_FUNC) });
    } else if (role === 'heater' && !f.data.lit && f.floor === state.player.floor && hasEffect(state, 'cold') && heaterFuelSources(state).length) {
      out.push({ id: `heat:${f.uid}`, label: pickLang({ en: `Light the ${furnLabel(f)}`, zh: `点燃${furnLabel(f)}` }), run: () => startFurnitureFunction(state, f.uid, FIREPLACE_FUNC) });
    }
  }
  return out.slice(0, 2);
});

// ------------------------------------------------------------------------------ panel data
// Every electrical piece at home, grouped for the Power Overview Panel.
export function powerOverview(state) {
  const p = ensurePower(state);
  const out = { sources: [], batteries: [], appliances: [], heaters: [] };
  for (const f of homeFurniture(state)) {
    const role = powerRole(f);
    if (!role) continue;
    const st = p.units[f.uid] || { w: 0, reason: role === 'consumer' && !inOpenArea(state, f) ? 'locked' : null };
    const row = { f, role, status: st, label: furnLabel(f) };
    if (role === 'consumer') out.appliances.push(row);
    else if (role === 'battery') out.batteries.push(row);
    else if (role === 'heater') out.heaters.push(row);
    else out.sources.push(row);
  }
  return out;
}
