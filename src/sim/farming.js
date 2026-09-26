// Farming (FEATURES H01–H09): planters from Config_FurniturePlant, plants from Config_Plant, care actions, growth under
// light / temperature / weather, anomalies, harvests, planting proficiency, vases and Boston Ivy.
//
// Planter state lives in f.data:
//   soil        'untilled' | 'tilled'. Planting needs loosened soil; a pot that has been emptied must be tilled again.
//   crops       [crop]. Seeds need 1/2/4 units of space and a planter holds Capacity units, so a large pot takes one size-4
//               crop, two size-2 crops or four size-1 crops. Care actions (water, pests, weeds, fertilizer, harvest) act on
//               every crop in the pot.
//   plant       summary of the first crop for the renderer ({ growth, ready, withered, pest, weed, dry, ... }) or null.
//   decorPlant  starter pots hold a decorative plant that has to be pulled out before anything can be planted.
// crop: { id, plantId, seedId, size, plantedAt, growth 0..1, fertilizer, fert, water 0..1, pest, weed, dry, anomaly,
//         ready, readyAt, withered, witherCause, perfect, chill, rollG }
// Vases (Config_Furniture.vase) keep f.data.flower = { id, at, until, mor, wilted }; the shared 'vase' kind clears it.
import { furn, item, plant, plantCfg, plantLevels, seedToPlant, func, itemName, CAT, ELEC } from '../data/db.js';
import { parsePreview, opFunc } from '../content/funcSpecs.js';
import { registerKind, enqueue, cancelCurrent } from './actions.js';
import { registerSystem } from './tick.js';
import { registerObjectives } from './objectives.js';
import { registerSuggestions } from './suggest.js';
import { homeSources } from './furnActions.js';
import { homeFurniture, allSlots, dropToFloor, removeFurniture, createFurniture, furnLabel } from './home.js';
import { countIn, takeFrom, insert, makeInstance, newUid } from './inventory.js';
import { addProfExp, profLevel, plantLevelRow } from './proficiency.js';
import { addStat, addEffect, removeEffect, hasEffect, bumpDaily, dailyCount } from './stats.js';
import { markCodex } from './itemuse.js';
import { getMods } from './modifiers.js';
import { daylight, dayNumber, formatDuration, HOUR, DAY } from './time.js';
import { rand } from '../engine/rng.js';
import { emit } from '../engine/bus.js';
import { loc, pickLang } from '../engine/i18n.js';

export const BOSTON_IVY = 38;
export const FERTILIZERS = [15501, 15502, 15503];
export const WATER_LOW = 0.3;

const WATER_SECONDS = 3 * DAY; // a watered pot dries out after three days
const LIGHT_MIN = 0.2; // share of the growth rate left for a crop that gets none of the light it needs
const CHILL_SECONDS = 6 * HOUR; // cold-wave exposure that kills a cold-sensitive crop
const HEATER_RANGE = 3; // tiles around a heater whose planters it keeps warm
const INDOOR_TEMP = 18;
const OUTDOOR_TEMP = 15;
const ANOMALY_SLOW = { pest: 0.5, weed: 0.6, dry: 0.4 };
const SUN = { sunny: 1, cloudy: 0.5, rain: 0.3, heavyRain: 0.3, storm: 0.3, snow: 0.3, freezingRain: 0.3, coldWave: 0.5 };
const RAIN = ['rain', 'heavyRain', 'storm'];
const DECOR_REMOVE_FUNCS = [80026, 80028, 80029];
const EMPTY_POT = { 0: 60000, 1: 60000, 2: 60001, 3: 60002 };
const SUGGEST_RANK = { harvest: 0, pest: 1, weed: 2, water: 3 };

// Duration (game minutes) and stamina of each farm op when queued from the planting panel or the E smart action.
export const FARM_OPS = {
  research: { min: 30, cost: { sta: 5 }, label: { en: 'Research the planter', zh: '研究种植设施' } },
  till: { min: 20, cost: { sta: 6 }, label: { en: 'Till', zh: '翻土' } },
  plant: { min: 20, cost: { sta: 4 }, label: { en: 'Plant', zh: '种植' } },
  fertilize: { min: 10, cost: { sta: 2 }, label: { en: 'Fertilize', zh: '施肥' } },
  pest: { min: 15, cost: { sta: 5 }, label: { en: 'Remove pests', zh: '除虫' } },
  weed: { min: 15, cost: { sta: 5 }, label: { en: 'Weed', zh: '除草' } },
  water: { min: 10, cost: { sta: 3 }, label: { en: 'Water', zh: '浇水' } },
  clear: { min: 10, cost: { sta: 3 }, label: { en: 'Clear withered', zh: '清理' } },
  harvest: { min: 15, cost: { sta: 4 }, label: { en: 'Harvest', zh: '收获' } },
  remove: { min: 10, cost: { sta: 3 }, label: { en: 'Uproot', zh: '铲除植物' } },
  warm: { min: 10, cost: {}, label: { en: 'Warm up', zh: '驱寒' } },
  removeDecor: { min: 10, cost: { sta: 5 }, label: { en: 'Pull out the plant', zh: '拔掉绿植' } },
};

const TEXT = {
  gone: { en: 'That is no longer here.', zh: '东西已经不在了。' },
  pre: { en: 'Farming starts after the outbreak.', zh: '灾变之后才能开始种植。' },
  notPlanter: { en: 'This is not a planter.', zh: '这不是种植设施。' },
  researched: { en: 'Already researched.', zh: '已经研究过了。' },
  researchFirst: { en: 'Research a planting facility once first.', zh: '需先研究一次种植设施。' },
  researchDone: { en: 'You figured out how the planter works. Planting unlocked!', zh: '摸清了种植设施的门道，可以开始种植了！' },
  decorFirst: { en: 'Pull out the decorative plant first.', zh: '先拔掉盆里的绿植。' },
  noDecor: { en: 'There is nothing to pull out.', zh: '没有可以拔掉的绿植。' },
  cropsFirst: { en: 'Harvest or uproot the crops first.', zh: '先收获或铲除作物。' },
  tilled: { en: 'The soil is already loose.', zh: '土已经翻松了。' },
  tillFirst: { en: 'Till the soil first.', zh: '需要先翻土。' },
  pickSeed: { en: 'Choose a seed.', zh: '请选择种子。' },
  noSeed: { en: 'No seeds of that kind at home.', zh: '家里没有这种种子。' },
  noSpace: { en: 'Not enough space in this planter.', zh: '花盆空间不足。' },
  noFert: { en: 'Not enough fertilizer', zh: '肥料不足' },
  fertilized: { en: 'Already fertilized.', zh: '已经施过肥了。' },
  nothingGrowing: { en: 'Nothing is growing here.', zh: '这里没有正在生长的作物。' },
  noPests: { en: 'No pests.', zh: '没有虫害。' },
  noWeeds: { en: 'No weeds.', zh: '没有杂草。' },
  wet: { en: 'The soil is still moist.', zh: '土壤还很湿润。' },
  wateredToday: { en: 'Already watered today.', zh: '今天已经浇过水了。' },
  nothingToClear: { en: 'Nothing withered to clear.', zh: '没有需要清理的枯萎植物。' },
  notRipe: { en: 'Nothing is ripe yet.', zh: '还没有成熟的作物。' },
  empty: { en: 'The planter is empty.', zh: '花盆是空的。' },
  noPower: { en: 'No power', zh: '没有电' },
  notHeater: { en: 'This does not give off heat.', zh: '这个不能取暖。' },
  pickFlower: { en: 'Choose a flower.', zh: '请选择一枝花。' },
  noFlower: { en: 'No such flower at home.', zh: '家里没有这种花。' },
  objResearch: { en: 'Research a planter to start farming', zh: '研究一次种植设施，开始种植' },
  objResearchTip: { en: 'Open a planter and choose Research (30 min).', zh: '打开花盆，选择「研究种植设施」（30分钟）。' },
};

const ANOMALY_TOAST = {
  pest: { en: 'Pests on the {plant}!', zh: '{plant}长虫了！' },
  weed: { en: 'Weeds are choking the {plant}.', zh: '{plant}里长草了。' },
  dry: { en: 'The {plant} is suffering from drought.', zh: '{plant}缺水干旱了。' },
};

const say = (key) => pickLang(TEXT[key]);
const opOf = (a) => a.op || a.spec?.op;

function bump(state, key, n = 1) {
  state.progress.counters[key] = (state.progress.counters[key] || 0) + n;
}

export function plantName(plantId) {
  return loc(plant(plantId)?.zh) || `#${plantId}`;
}

export function farmOpLabel(op) {
  return pickLang(FARM_OPS[op]?.label || { en: op, zh: op });
}

// ------------------------------------------------------------------------------ planters
export function planterCfg(f) {
  if (!f || typeof f.cfg !== 'number') return null;
  const id = furn(f.cfg)?.plant;
  return id ? plantCfg(id) || null : null;
}

export function isPlanter(f) {
  return !!planterCfg(f);
}

export function isVase(f) {
  return !!f && typeof f.cfg === 'number' && !!furn(f.cfg)?.vase;
}

// Config decorative plants: watering them is a daily morale habit; some can be pulled out to leave an empty pot.
function isDecorFurniture(f) {
  if (!f || typeof f.cfg !== 'number' || isPlanter(f)) return false;
  const funcs = furn(f.cfg)?.funcs || [];
  return funcs.includes(202) || funcs.some((k) => DECOR_REMOVE_FUNCS.includes(k));
}

export function isDecor(f) {
  return !!f?.data?.decorPlant || isDecorFurniture(f);
}

function isHeater(f) {
  return !!f && typeof f.cfg === 'number' && (furn(f.cfg)?.heat || 0) > 0;
}

function atHome(state, f) {
  return !!f && !!f.slot && state.home?.slots[f.slot] === f.uid;
}

export function homePlanters(state) {
  return homeFurniture(state).filter(isPlanter);
}

function potData(f) {
  const d = f.data || (f.data = {});
  if (!Array.isArray(d.crops)) d.crops = [];
  if (!d.soil) d.soil = 'untilled';
  return d;
}

export function capacityOf(f) {
  return planterCfg(f)?.Capacity || 0;
}

export function usedCapacity(f) {
  return (f.data?.crops || []).reduce((n, c) => n + (c.size || 1), 0);
}

export function freeCapacity(f) {
  return Math.max(0, capacityOf(f) - usedCapacity(f));
}

export const isLive = (c) => !c.withered;
export const isGrowing = (c) => !c.ready && !c.withered;
export const isRipe = (c) => !!c.ready && !c.withered;

// Seconds until a ripe crop withers (null while growing); `fresh` is false once it is overripe.
export function harvestLeft(state, c) {
  const p = plant(c.plantId);
  if (!p || !isRipe(c) || c.plantId === BOSTON_IVY) return null;
  const since = state.clock.t - (c.readyAt ?? state.clock.t);
  return { left: Math.max(0, (p.window || 0) + (p.decay || 0) - since), fresh: since < (p.window || 0) };
}

// Planting proficiency Lv0 ("not mastered") needs one round of research on a planting facility.
export function plantResearched(state) {
  const p = state.progress.prof.plant;
  return !!state.farm?.researched || (p?.lv ?? 0) >= 1 || (p?.exp ?? 0) > 0;
}

const slotIndex = new Map();
function slotOf(state, f) {
  let idx = slotIndex.get(state.home.id);
  if (!idx) {
    idx = new Map(allSlots(state).map((s) => [s.id, s]));
    slotIndex.set(state.home.id, idx);
  }
  return idx.get(f.slot) || null;
}

// ------------------------------------------------------------------------------ environment
function heaterActive(state, f) {
  if (f.on === false) return false;
  if (furn(f.cfg).elec === ELEC.FUEL_HEATER) {
    const d = f.data || {};
    return !!(d.lit || d.burning || d.fuel > 0 || d.burnUntil > state.clock.t);
  }
  return f.powered !== false;
}

export function activeHeaters(state, all = homeFurniture(state)) {
  return all.filter((f) => isHeater(f) && heaterActive(state, f));
}

function tileGap(a, b) {
  const dx = Math.max(0, b.x - (a.x + Math.max(1, a.w) - 1), a.x - (b.x + Math.max(1, b.w) - 1));
  const dy = Math.max(0, b.y - (a.y + Math.max(1, a.h) - 1), a.y - (b.y + Math.max(1, b.h) - 1));
  return Math.max(dx, dy);
}

// LED grow lights and the basement daylight lamp light nearby planting facilities while switched on and powered.
export const GROW_LIGHTS = new Set([64000, 340, 396, 397, 398, 399, 400, 80162]);
const GROW_LIGHT_LEVEL = 2;

function nearbyLight(state, f) {
  for (const l of homeFurniture(state)) {
    if (!GROW_LIGHTS.has(l.cfg) || l.floor !== f.floor || l.on === false || l.powered === false) continue;
    if (tileGap(f, l) <= HEATER_RANGE) return GROW_LIGHT_LEVEL;
  }
  return 0;
}

function nearbyHeat(f, heaters) {
  let heat = 0;
  for (const h of heaters) if (h.uid !== f.uid && h.floor === f.floor && tileGap(f, h) <= HEATER_RANGE) heat += furn(h.cfg).heat;
  return heat;
}

export function coldWaveActive(state) {
  return state.weather?.today?.kind === 'coldWave' || (state.crises?.active || []).some((c) => c.type === 'coldWave');
}

// Committing to the Greenhouse route fits every pot with lighting and a thermostat (Config_FurnitureFunc 2120).
export function greenhouseConverted(state) {
  return state.story?.route === 'greenhouse';
}

export function planterEnv(state, f, { t = state.clock.t, heaters } = {}) {
  const cfg = planterCfg(f) || {};
  const slot = slotOf(state, f) || {};
  const today = state.weather?.today;
  const kind = today?.kind || 'sunny';
  const outdoor = !!slot.outdoor;
  const sunlit = outdoor || !!slot.sunny;
  const powered = f.powered !== false && f.on !== false;
  const running = !cfg.NeedPower || powered;
  const greenhouse = greenhouseConverted(state);
  const sun = sunlit ? 2 * (SUN[kind] ?? 1) * daylight({ ...state.clock, t }) : 0;
  const lamp = Math.max(running ? cfg.ElectricLight || 0 : 0, nearbyLight(state, f));
  const light = Math.max(sun, lamp, cfg.AddLight || 0, greenhouse ? 2 : 0);
  const indoor = state.weather?.indoorTemp?.[f.floor];
  const ambient = outdoor ? (Number.isFinite(today?.temp) ? today.temp : OUTDOOR_TEMP) : Number.isFinite(indoor) ? indoor : INDOOR_TEMP;
  const nearby = nearbyHeat(f, heaters || activeHeaters(state));
  const elecHeat = running ? cfg.ElectricHeat || 0 : 0;
  const heated = (cfg.AddHeat || 0) > 0 || elecHeat > 0 || nearby > 0 || greenhouse;
  let temp = ambient + (cfg.AddHeat || 0) * 5 + elecHeat * 10 + nearby * 10;
  if (greenhouse) temp = Math.max(temp, INDOOR_TEMP);
  return {
    cfg,
    outdoor,
    sunlit,
    sun,
    lamp,
    light,
    ambient,
    temp,
    heated,
    powered,
    running,
    boost: running ? cfg.GrowthFaster || 0 : 0,
    raining: outdoor && RAIN.includes(kind),
    coldWave: coldWaveActive(state),
  };
}

// ColdResistance 0 crops stop below 5°C; each level of resistance tolerates 5°C more cold.
export function minGrowTemp(p) {
  return 5 - 5 * (p?.cold || 0);
}

export function lightFactor(need, avail) {
  if (!need) return 1;
  return LIGHT_MIN + (1 - LIGHT_MIN) * Math.min(1, avail / need);
}

// Growth per game second (0..1 scale).
export function cropRate(state, f, crop, env = planterEnv(state, f)) {
  if (!isGrowing(crop)) return 0;
  const p = plant(crop.plantId);
  if (!p?.grow || env.temp < minGrowTemp(p)) return 0;
  const mods = getMods(state);
  let r = (1 + env.boost) * (1 + (crop.fert || 0)) * Math.max(0.1, mods.growMult ?? 1) * (1 + (plantLevelRow(state)?.growth_speed_bonus || 0));
  r *= lightFactor(p.light, env.light);
  for (const k of ['pest', 'weed', 'dry']) if (crop[k]) r *= ANOMALY_SLOW[k];
  return r / p.grow;
}

// Seconds until a growing crop ripens at its average rate over the next day, if today's weather and its current
// problems persist.
export function estimateRipeIn(state, f, crop, heaters = activeHeaters(state)) {
  if (!isGrowing(crop)) return 0;
  let r = 0;
  for (let i = 0; i < 12; i++) r += cropRate(state, f, crop, planterEnv(state, f, { t: state.clock.t + (2 * i + 1) * HOUR, heaters })) / 12;
  return r > 0 ? (1 - crop.growth) / r : Infinity;
}

// ------------------------------------------------------------------------------ crop lifecycle
function newCrop(state, plantId, seedId) {
  const p = plant(plantId);
  return {
    id: newUid(state),
    plantId,
    seedId,
    size: p.size || 1,
    plantedAt: state.clock.t,
    growth: 0,
    fertilizer: 0,
    fert: 0,
    water: 1,
    pest: false,
    weed: false,
    dry: false,
    anomaly: false,
    ready: false,
    readyAt: null,
    withered: false,
    witherCause: null,
    perfect: false,
    chill: 0,
    rollG: 0,
  };
}

function setAnomaly(state, f, c, kind) {
  c[kind] = true;
  c.anomaly = true;
  if (kind === 'dry') c.water = 0;
  emit('cropAnomaly', { furn: f.uid, plantId: c.plantId, kind });
  emit('toast', { text: pickLang(ANOMALY_TOAST[kind]).replace('{plant}', plantName(c.plantId)), kind: 'bad' });
}

function ripen(state, f, c) {
  const p = plant(c.plantId);
  Object.assign(c, { growth: 1, ready: true, readyAt: state.clock.t, pest: false, weed: false, dry: false });
  c.perfect = rand(state) < (p.pRate || 0) + (plantLevelRow(state)?.perfect_grow_rate || 0) + (getMods(state).plantPerfect || 0);
  emit('toast', { text: pickLang({ en: `${plantName(c.plantId)} is ready to harvest.`, zh: `${plantName(c.plantId)}成熟了，可以收获。` }), kind: 'good' });
}

function wither(state, f, c, cause) {
  Object.assign(c, { withered: true, ready: false, witherCause: cause, pest: false, weed: false, dry: false });
  const text =
    cause === 'cold'
      ? { en: `The ${plantName(c.plantId)} froze in the cold wave.`, zh: `${plantName(c.plantId)}在寒潮中冻死了。` }
      : { en: `The ${plantName(c.plantId)} withered before it was picked.`, zh: `${plantName(c.plantId)}没来得及收获，枯萎了。` };
  emit('toast', { text: pickLang(text), kind: 'bad' });
}

function tickPlanter(state, f, dt, heaters) {
  const d = potData(f);
  const env = planterEnv(state, f, { heaters });
  const t = state.clock.t;
  if (env.raining) d.rainDay = dayNumber(state.clock);
  const drain = env.raining ? 0 : (dt / WATER_SECONDS) * Math.max(0, 1 + (env.cfg.DryControl || 0));
  for (const c of d.crops) {
    if (c.withered) continue;
    const p = plant(c.plantId);
    if (!p) continue;
    if (env.coldWave && !p.cold && !env.heated && env.temp < 5) {
      c.chill = (c.chill || 0) + dt / CHILL_SECONDS;
      if (c.chill >= 1) {
        wither(state, f, c, 'cold');
        continue;
      }
    } else if (c.chill) {
      c.chill = Math.max(0, c.chill - dt / (2 * CHILL_SECONDS));
    }
    if (env.raining) Object.assign(c, { water: 1, dry: false });
    if (isGrowing(c)) {
      c.water = Math.max(0, (c.water ?? 1) - drain);
      if (c.water <= 0 && !c.dry) setAnomaly(state, f, c, 'dry');
      c.growth = Math.min(1, c.growth + cropRate(state, f, c, env) * dt);
      if (c.growth >= 1) ripen(state, f, c);
    } else if (c.plantId !== BOSTON_IVY && isRipe(c)) {
      // Ripe crops stay fresh for HarvestTime, go overripe, then wither after DecayTime.
      // Boston Ivy keeps climbing the wall once grown instead of going over.
      const since = t - (c.readyAt ?? t);
      c.overripe = since >= (p.window || 0);
      if (since >= (p.window || 0) + (p.decay || 0)) wither(state, f, c, 'decay');
    }
  }
  summarize(f);
}

// Hourly pest / weed / drought rolls. The per-hour odds scale with the growth made that hour so that the chance over a
// whole growth cycle equals the config probability, reduced by planter controls and PlantLv pest_rate_reduction.
function rollAnomalies(state) {
  const cut = plantLevelRow(state)?.pest_rate_reduction || 0;
  const today = dayNumber(state.clock);
  for (const f of homePlanters(state)) {
    const d = f.data;
    if (!d?.crops?.length) continue;
    const cfg = planterCfg(f);
    const rainedOn = !!slotOf(state, f)?.outdoor && d.rainDay === today;
    for (const c of d.crops) {
      if (!isGrowing(c)) continue;
      const dg = Math.max(0, c.growth - (c.rollG || 0));
      c.rollG = c.growth;
      const p = plant(c.plantId);
      if (dg <= 0 || !p) continue;
      const odds = [
        ['pest', p.pest, cfg.PestControl],
        ['weed', p.weed, cfg.WeedControl],
        ['dry', p.dry, cfg.DryControl],
      ];
      for (const [kind, base, control] of odds) {
        if (c[kind] || (kind === 'dry' && rainedOn)) continue;
        const pr = Math.min(1, Math.max(0, (base || 0) * (1 + (control || 0)) * (1 - cut)));
        if (pr > 0 && rand(state) < 1 - (1 - pr) ** dg) setAnomaly(state, f, c, kind);
      }
    }
    summarize(f);
  }
}

function summarize(f) {
  const d = potData(f);
  if (d.decorPlant) {
    d.plant = { decor: true, growth: 1, ready: false, withered: false, pest: false, weed: false, dry: false, soil: d.soil, count: 0 };
    return;
  }
  const crops = d.crops;
  if (!crops.length) {
    d.plant = null;
    return;
  }
  const c = crops[0];
  d.plant = {
    plantId: c.plantId,
    plantedAt: c.plantedAt,
    growth: c.growth,
    soil: d.soil,
    fertilizer: c.fertilizer,
    water: c.water,
    pest: crops.some((x) => x.pest),
    weed: crops.some((x) => x.weed),
    dry: crops.some((x) => x.dry),
    anomaly: crops.some((x) => x.anomaly),
    ready: crops.some(isRipe),
    withered: crops.every((x) => x.withered),
    perfect: !!c.perfect,
    count: crops.length,
  };
}

// ------------------------------------------------------------------------------ harvest
export function harvestYield(state, p, perfect) {
  const mods = getMods(state);
  const out = [...(perfect && p.pGain?.length ? p.pGain : p.gain)];
  const extra = p.gain.length * Math.max(0, (mods.plantYield ?? 1) - 1);
  const n = Math.floor(extra) + (rand(state) < extra % 1 ? 1 : 0);
  for (let i = 0; i < n; i++) out.push(p.gain[i % p.gain.length]);
  if (p.seed?.length && rand(state) < (p.seedRate || 0) + (mods.seedRate || 0)) out.push(...p.seed);
  return out;
}

function collectCrop(state, c) {
  const p = plant(c.plantId);
  const items = harvestYield(state, p, c.perfect);
  const flawless = !!c.perfect && !c.anomaly;
  bump(state, 'plant.harvest');
  if (flawless) bump(state, 'plant.perfect');
  const flowers = items.filter((id) => item(id)?.cat === CAT.FLOWER).length;
  if (flowers) bump(state, 'plant.harvest.flower', flowers);
  addProfExp(state, 'plant', p.hExp || 0);
  if (p.codex && !state.progress.codexRun.plant?.includes(p.id)) {
    addProfExp(state, 'plant', p.discExp || 0);
    markCodex(state, 'plant', p.id);
  }
  return { items, flawless };
}

const witherGain = (c) => plant(c.plantId)?.wither || [];

// Harvested items go to the backpack; whatever does not fit is left in a cardboard box on the floor.
function giveOut(state, ids, f) {
  const bp = state.inventories[state.player.backpack];
  const [x, y] = state.player.floor === f.floor ? [state.player.x, state.player.y] : [f.x, f.y];
  let dropped = 0;
  for (const id of ids) {
    if (!item(id)) continue;
    const inst = makeInstance(state, id);
    if (!insert(bp, inst, { allowOverweight: true })) {
      dropToFloor(state, inst, f.floor, x, y);
      dropped++;
    }
    emit('gotItem', { id });
  }
  return dropped;
}

function itemsText(ids) {
  const counts = new Map();
  for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
  return [...counts].map(([id, n]) => `${itemName(id)} ×${n}`).join(' · ');
}

// ------------------------------------------------------------------------------ home stock
function itemsAtHome(state, pred) {
  const counts = new Map();
  for (const invId of homeSources(state)) {
    for (const it of state.inventories[invId]?.items || []) {
      const cfg = item(it.id);
      if (cfg && pred(cfg)) counts.set(it.id, (counts.get(it.id) || 0) + (it.qty || 1));
    }
  }
  return [...counts].map(([id, n]) => ({ id, n })).sort((a, b) => a.id - b.id);
}

export function seedsAtHome(state) {
  return itemsAtHome(state, (cfg) => cfg.cat === CAT.SEED && !!seedToPlant[cfg.id]);
}

export function flowersAtHome(state) {
  return itemsAtHome(state, (cfg) => cfg.cat === CAT.FLOWER);
}

export function fertilizersAtHome(state) {
  const sources = homeSources(state);
  return FERTILIZERS.map((id) => ({ id, n: countIn(state, sources, id), bonus: item(id)?.plantFast || 0 }));
}

// The requested fertilizer, or the cheapest one at home when none was picked.
function pickFertilizer(state, preferred) {
  const sources = homeSources(state);
  if (preferred) return countIn(state, sources, preferred) > 0 ? preferred : 0;
  return FERTILIZERS.find((id) => countIn(state, sources, id) > 0) || 0;
}

// ------------------------------------------------------------------------------ actions
const decorKey = (f) => `farm:decorWater:${f.uid}`;

function heaterCheck(f) {
  if (!isHeater(f)) return say('notHeater');
  if (furn(f.cfg).elec === ELEC.CONSUMER && f.powered === false) return say('noPower');
  return true;
}

// true, or the reason the op cannot run on this furniture right now (queued ops re-check this when they start).
export function validateFarmOp(state, uid, op, a = {}) {
  const f = state.furniture[uid];
  if (!f || !atHome(state, f)) return say('gone');
  if (state.phase === 'pre') return say('pre');
  if (op === 'warm') return heaterCheck(f);
  if (op === 'research') {
    if (!isPlanter(f)) return say('notPlanter');
    return plantResearched(state) ? say('researched') : true;
  }
  if (op === 'removeDecor') return isDecor(f) ? true : say('noDecor');
  if (op === 'water' && isDecor(f)) return f.data?.decorPlant && dailyCount(state, decorKey(f)) >= 1 ? say('wateredToday') : true;
  if (!isPlanter(f)) return say('notPlanter');
  const d = potData(f);
  if (d.decorPlant) return say('decorFirst');
  const crops = d.crops;
  switch (op) {
    case 'till':
      if (crops.some(isLive)) return say('cropsFirst');
      return d.soil === 'tilled' && !crops.length ? say('tilled') : true;
    case 'plant': {
      if (!plantResearched(state)) return say('researchFirst');
      const p = plant(seedToPlant[a.seedId]);
      if (!p) return say('pickSeed');
      const n = Math.max(1, a.count || 1);
      if (countIn(state, homeSources(state), a.seedId) < n) return say('noSeed');
      if (d.soil !== 'tilled') return say('tillFirst');
      return freeCapacity(f) >= (p.size || 1) * n ? true : say('noSpace');
    }
    case 'fertilize': {
      const id = pickFertilizer(state, a.fertId);
      if (!id) return say('noFert');
      const bonus = item(id).plantFast || 0;
      if (crops.some((c) => isGrowing(c) && (c.fert || 0) < bonus)) return true;
      return crops.some(isGrowing) ? say('fertilized') : say('nothingGrowing');
    }
    case 'pest':
      return crops.some((c) => isLive(c) && c.pest) ? true : say('noPests');
    case 'weed':
      return crops.some((c) => isLive(c) && c.weed) ? true : say('noWeeds');
    case 'water':
      if (crops.some((c) => isGrowing(c) && (c.dry || c.water < 0.95))) return true;
      return crops.some(isGrowing) ? say('wet') : say('nothingGrowing');
    case 'clear':
      return crops.some((c) => c.withered) ? true : say('nothingToClear');
    case 'harvest':
      if (crops.some((c) => isRipe(c) || c.withered)) return true;
      return crops.length ? say('notRipe') : say('empty');
    case 'remove':
      return crops.length ? true : say('empty');
    default:
      return say('notPlanter');
  }
}

// Whether the planting panel may queue seeds into this pot (tilling / clearing is queued automatically when needed).
export function canQueuePlanting(state, uid, seedId, count = 1) {
  const f = state.furniture[uid];
  if (!f || !atHome(state, f)) return say('gone');
  if (state.phase === 'pre') return say('pre');
  if (!isPlanter(f)) return say('notPlanter');
  if (f.data?.decorPlant) return say('decorFirst');
  if (!plantResearched(state)) return say('researchFirst');
  const p = plant(seedToPlant[seedId]);
  if (!p) return say('pickSeed');
  if (countIn(state, homeSources(state), seedId) < count) return say('noSeed');
  const living = (f.data?.crops || []).filter(isLive).reduce((n, c) => n + (c.size || 1), 0);
  return capacityOf(f) - living >= (p.size || 1) * count ? true : say('noSpace');
}

export function farmAction(state, uid, op, extra = {}) {
  const def = FARM_OPS[op];
  const n = op === 'plant' ? Math.max(1, extra.count || 1) : 1;
  const scale = 1 + 0.5 * (n - 1);
  const what = op === 'plant' && extra.seedId ? ` ${plantName(seedToPlant[extra.seedId])}${n > 1 ? ` ×${n}` : ''}` : '';
  const cost = Object.fromEntries(Object.entries(def.cost).map(([k, v]) => [k, Math.round(v * scale * 10) / 10]));
  return {
    kind: 'farm',
    op,
    label: `${farmOpLabel(op)}${what} · ${furnLabel(state.furniture[uid])}`,
    target: { furn: uid },
    furn: uid,
    dur: Math.round(def.min * 60 * scale),
    cost,
    // the config function this is (Config_FurnitureFunc): the pot's own, else the one the config has for the op
    funcKey: opFunc(state.furniture[uid]?.cfg, 'farm', op),
    ...extra,
  };
}

export function queueFarm(state, uid, op, extra = {}, opts) {
  return enqueue(state, farmAction(state, uid, op, extra), opts);
}

// Planting panel confirm: loosen the soil (or clear withered plants) when needed, sow, then fertilize if asked.
export function queuePlanting(state, uid, seedId, { count = 1, fertId = 0 } = {}) {
  const f = state.furniture[uid];
  const d = potData(f);
  const out = [];
  const living = d.crops.some(isLive);
  if (!living && (d.soil !== 'tilled' || d.crops.length)) out.push(queueFarm(state, uid, 'till'));
  else if (d.crops.some((c) => c.withered)) out.push(queueFarm(state, uid, 'clear'));
  out.push(queueFarm(state, uid, 'plant', { seedId, count }));
  if (fertId) out.push(queueFarm(state, uid, 'fertilize', { fertId }));
  return out;
}

function prepare(state, a, op, f) {
  if (op === 'water' && isDecor(f)) {
    const pv = parsePreview(func(202)?.preview);
    Object.assign(a, { cost: pv.cost, gain: pv.gain, max: pv.max });
    return;
  }
  if (a.cost == null) a.cost = { ...FARM_OPS[op].cost };
}

function tend(state, f, kind) {
  for (const c of potData(f).crops) c[kind] = false;
  addProfExp(state, 'plant', 2);
}

const DO = {
  research(state) {
    state.farm.researched = true;
    addProfExp(state, 'plant', plantLevels()[0]?.research_exp || 50);
    emit('toast', { text: say('researchDone'), kind: 'good' });
  },
  till(state, f) {
    const d = potData(f);
    const remains = d.crops.filter((c) => c.withered).flatMap(witherGain);
    d.crops = d.crops.filter(isLive);
    d.soil = 'tilled';
    giveOut(state, remains, f);
  },
  plant(state, f, a) {
    const d = potData(f);
    const plantId = seedToPlant[a.seedId];
    const p = plant(plantId);
    if (!p || d.soil !== 'tilled') return;
    const sources = homeSources(state);
    const n = Math.min(Math.max(1, a.count || 1), Math.floor(freeCapacity(f) / (p.size || 1)), countIn(state, sources, a.seedId));
    if (n <= 0) return;
    takeFrom(state, sources, a.seedId, n);
    for (let i = 0; i < n; i++) d.crops.push(newCrop(state, plantId, a.seedId));
    bump(state, 'plant.sow', n);
  },
  fertilize(state, f, a) {
    const id = pickFertilizer(state, a.fertId);
    if (!id) return;
    const bonus = item(id).plantFast || 0;
    const targets = potData(f).crops.filter((c) => isGrowing(c) && (c.fert || 0) < bonus);
    if (!targets.length) return;
    takeFrom(state, homeSources(state), id, 1);
    for (const c of targets) Object.assign(c, { fertilizer: id, fert: bonus });
  },
  pest(state, f) {
    tend(state, f, 'pest');
  },
  weed(state, f) {
    tend(state, f, 'weed');
  },
  water(state, f) {
    if (f.data?.decorPlant) {
      bumpDaily(state, decorKey(f));
      return;
    }
    if (!isPlanter(f)) return;
    for (const c of potData(f).crops) if (isLive(c)) Object.assign(c, { water: 1, dry: false });
  },
  clear(state, f) {
    const d = potData(f);
    const remains = d.crops.filter((c) => c.withered).flatMap(witherGain);
    d.crops = d.crops.filter(isLive);
    if (!d.crops.length) d.soil = 'untilled';
    giveOut(state, remains, f);
  },
  harvest(state, f) {
    const d = potData(f);
    const items = [];
    const keep = [];
    let crops = 0;
    let perfect = 0;
    let flawless = 0;
    for (const c of d.crops) {
      if (isRipe(c)) {
        const r = collectCrop(state, c);
        items.push(...r.items);
        crops++;
        if (c.perfect) perfect++;
        if (r.flawless) flawless++;
      } else if (c.withered) {
        items.push(...witherGain(c));
      } else {
        keep.push(c);
      }
    }
    d.crops = keep;
    if (!keep.length) d.soil = 'untilled';
    const dropped = giveOut(state, items, f);
    emit('harvested', { furn: f.uid, items, crops, perfect, flawless, dropped });
    if (items.length) {
      const head = perfect ? pickLang({ en: 'Perfect harvest! ', zh: '完美收获！' }) : '';
      const tail = dropped ? pickLang({ en: ' (some left on the floor)', zh: '（部分放在了地上）' }) : '';
      emit('toast', { text: `${head}${itemsText(items)}${tail}`, kind: 'good' });
    }
  },
  remove(state, f) {
    const d = potData(f);
    d.crops = [];
    d.soil = 'untilled';
  },
  warm(state, f) {
    removeEffect(state, 'cold');
    addEffect(state, 'warm', 2);
    for (const pot of homePlanters(state)) {
      if (pot.floor !== f.floor || tileGap(pot, f) > HEATER_RANGE) continue;
      for (const c of pot.data?.crops || []) c.chill = 0;
    }
  },
  removeDecor(state, f) {
    if (f.data?.decorPlant) {
      f.data.decorPlant = false;
      potData(f).soil = 'untilled';
    } else {
      const slot = f.slot;
      removeFurniture(state, f.uid);
      createFurniture(state, EMPTY_POT[furn(f.cfg)?.slot] || 60000, slot);
    }
  },
};

registerKind('farm', {
  canStart(state, a) {
    const op = opOf(a);
    const f = state.furniture[a.furn];
    if (op === 'plant' && !a.seedId) {
      // The config "Plant" function (and E on an empty pot) opens the planting panel right away.
      if (!f) return say('gone');
      Object.assign(a, { openPanel: true, noWalk: true, dur: 0, cost: {} });
      return true;
    }
    const why = validateFarmOp(state, a.furn, op, a);
    if (why !== true) return why;
    prepare(state, a, op, f);
    return true;
  },
  // Re-check on arrival: pots that changed while the survivor walked over are skipped (patch 08-21).
  begin(state, a) {
    if (a.openPanel || state.actions.current !== a) return;
    const why = validateFarmOp(state, a.furn, opOf(a), a);
    if (why !== true) {
      emit('toast', { text: why, kind: 'bad' });
      cancelCurrent(state);
    }
  },
  complete(state, a) {
    if (a.openPanel) {
      emit('openPanel', { panel: 'plant', furn: a.furn });
      return;
    }
    const op = opOf(a);
    const f = state.furniture[a.furn];
    if (!f || !DO[op]) return;
    DO[op](state, f, a);
    if (isPlanter(f) && state.furniture[f.uid]) summarize(f);
    updateCounters(state);
  },
  // For furniture menus: true or the reason a farm function is unavailable.
  available(state, f, spec) {
    return spec.op === 'plant' ? true : validateFarmOp(state, f.uid, spec.op);
  },
});

// ------------------------------------------------------------------------------ E smart action
// Most useful farm op for a pot (pests > weeds > water > harvest); 'plant' means "open the planting panel".
export function farmSmartOp(state, uid) {
  const f = state.furniture[uid];
  if (!f) return null;
  if (isDecor(f)) {
    if (validateFarmOp(state, uid, 'water') === true) return 'water';
    return isPlanter(f) ? 'plant' : null;
  }
  if (!isPlanter(f)) return null;
  const crops = f.data?.crops || [];
  const outdoor = !!slotOf(state, f)?.outdoor;
  if (crops.some((c) => isLive(c) && c.pest)) return 'pest';
  if (crops.some((c) => isLive(c) && c.weed)) return 'weed';
  if (crops.some((c) => isGrowing(c) && (c.dry || c.water < WATER_LOW))) return 'water';
  if (crops.some((c) => isRipe(c) && !(outdoor && c.plantId === BOSTON_IVY))) return 'harvest';
  if (crops.some((c) => c.withered)) return 'clear';
  return freeCapacity(f) > 0 ? 'plant' : null;
}

export function startFarmSmartAction(state, uid) {
  const op = farmSmartOp(state, uid);
  if (!op || op === 'plant') {
    emit('openPanel', { panel: 'plant', furn: uid });
    return null;
  }
  return queueFarm(state, uid, op);
}

// ------------------------------------------------------------------------------ vases
export function vaseLifeSeconds(cfg) {
  const v = cfg?.vaseLife || 0;
  return v > 1000 ? v : (v || 3) * DAY;
}

export function validateVase(state, uid, flowerId) {
  const f = state.furniture[uid];
  if (!f || !atHome(state, f) || !isVase(f)) return say('gone');
  if (item(flowerId)?.cat !== CAT.FLOWER) return say('pickFlower');
  return countIn(state, homeSources(state), flowerId) > 0 ? true : say('noFlower');
}

export function queueVase(state, uid, flowerId) {
  return enqueue(state, {
    kind: 'vaseArrange',
    label: `${pickLang({ en: 'Arrange', zh: '插花' })} ${itemName(flowerId)} · ${furnLabel(state.furniture[uid])}`,
    target: { furn: uid },
    furn: uid,
    flowerId,
    dur: 5 * 60,
    cost: { sta: 1 },
  });
}

registerKind('vaseArrange', {
  canStart: (state, a) => validateVase(state, a.furn, a.flowerId),
  complete(state, a) {
    if (validateVase(state, a.furn, a.flowerId) !== true) return;
    const f = state.furniture[a.furn];
    const cfg = item(a.flowerId);
    const t = state.clock.t;
    takeFrom(state, homeSources(state), a.flowerId, 1);
    f.data.flower = { id: a.flowerId, at: t, until: t + vaseLifeSeconds(cfg), mor: cfg.vaseMor || 0.3, wilted: false };
    bump(state, 'vase.arrange');
  },
});

// Fresh flowers lift morale every hour the survivor spends at home.
function tickVases(state) {
  const home = (state.player.scene || 'home') === 'home';
  for (const f of homeFurniture(state)) {
    const fl = isVase(f) ? f.data?.flower : null;
    if (!fl || fl.wilted) continue;
    if (state.clock.t >= fl.until) {
      fl.wilted = true;
      emit('toast', { text: pickLang({ en: `The ${itemName(fl.id)} in the vase has wilted.`, zh: `花瓶里的${itemName(fl.id)}枯萎了。` }) });
    } else if (home) {
      addStat(state, 'mor', fl.mor, 'vase');
    }
  }
}

// ------------------------------------------------------------------------------ counters, ivy, overview
export function countLivePlants(state) {
  return homePlanters(state).filter((f) => (f.data?.crops || []).some(isLive)).length;
}

export function countPlanters(state) {
  return homePlanters(state).length;
}

// PlantPotCount: planters holding a living crop right now (Green Thumb wants 24 at once).
function updateCounters(state, all = homeFurniture(state)) {
  let live = 0;
  let ivy = 0;
  for (const f of all) {
    const crops = f.data?.crops;
    if (!crops?.length || !isPlanter(f)) continue;
    if (crops.some(isLive)) live++;
    if (slotOf(state, f)?.outdoor) ivy += crops.filter((c) => c.plantId === BOSTON_IVY && isRipe(c)).length;
  }
  const counters = state.progress.counters;
  counters.PlantPotCount = live;
  if (live > (counters['PlantPotCount.best'] || 0)) counters['PlantPotCount.best'] = live;
  state.run.ivy = ivy;
  state.run.ivyDefense = ivyDefense(state);
}

// Mature Boston Ivy on outdoor planters covers the walls: share of window damage the horde system cancels
// (sim/horde.js reads state.run.ivyDefense).
export function ivyDefense(state) {
  return Math.min(0.5, 0.1 * (state.run?.ivy || 0));
}

export function plantOverview(state) {
  const o = { planters: 0, live: 0, growing: 0, ready: 0, care: 0, withered: 0, nextReadyIn: null };
  const heaters = activeHeaters(state);
  for (const f of homePlanters(state)) {
    o.planters++;
    const crops = f.data?.crops || [];
    if (crops.some(isLive)) o.live++;
    for (const c of crops) {
      if (isGrowing(c)) {
        o.growing++;
        const eta = estimateRipeIn(state, f, c, heaters);
        if (eta < Infinity && (o.nextReadyIn == null || eta < o.nextReadyIn)) o.nextReadyIn = eta;
      }
      if (isRipe(c)) o.ready++;
      if (c.withered) o.withered++;
      if (isLive(c) && (c.pest || c.weed || c.dry)) o.care++;
    }
  }
  return o;
}

function queued(state, uid, op) {
  const same = (a) => a && a.kind === 'farm' && a.furn === uid && opOf(a) === op;
  return same(state.actions.current) || state.actions.queue.some(same);
}

registerSuggestions((state) => {
  if (state.phase !== 'post' || (state.player.scene || 'home') !== 'home' || hasEffect(state, 'tense')) return [];
  let best = null;
  for (const f of homePlanters(state)) {
    const op = farmSmartOp(state, f.uid);
    if (!(op in SUGGEST_RANK) || isDecor(f) || queued(state, f.uid, op)) continue;
    if (!best || SUGGEST_RANK[op] < SUGGEST_RANK[best.op]) best = { f, op };
  }
  if (!best) return [];
  const { f, op } = best;
  const crop = (f.data?.crops || []).find(isLive);
  return [{ id: `farm:${op}`, label: `${farmOpLabel(op)} ${crop ? plantName(crop.plantId) : furnLabel(f)}`, run: () => queueFarm(state, f.uid, op) }];
});

// Plant overview card (unlocked at planting Lv2) and the Lv0 research hint.
registerObjectives((state) => {
  if (state.phase !== 'post') return [];
  const planters = homePlanters(state);
  if (!planters.length) return [];
  const out = [];
  if (!plantResearched(state) && seedsAtHome(state).length) {
    out.push({ id: 'farm.research', text: say('objResearch'), tip: say('objResearchTip'), onClick: () => emit('openPanel', { panel: 'plant', furn: planters[0].uid }) });
  }
  const o = profLevel(state, 'plant') >= 2 ? plantOverview(state) : null;
  if (o && (o.live || o.withered)) {
    const focus = planters.find((f) => (f.data?.crops || []).some(isRipe)) || planters.find((f) => f.data?.crops?.length) || planters[0];
    const next = o.nextReadyIn != null ? pickLang({ en: ` · next in ${formatDuration(o.nextReadyIn)}`, zh: ` · 下一批${formatDuration(o.nextReadyIn)}后` }) : '';
    out.push({
      id: 'farm.overview',
      text: pickLang({ en: `🌱 Plants: ${o.live}/${o.planters} planters in use`, zh: `🌱 植物总览：${o.live}/${o.planters}个花盆在种` }),
      prog: pickLang({ en: `${o.ready} ripe · ${o.care} need care · ${o.withered} withered`, zh: `${o.ready}株成熟 · ${o.care}株需照料 · ${o.withered}株枯萎` }) + next,
      urgent: o.ready > 0 || o.care > 0 || o.withered > 0,
      onClick: () => emit('openPanel', { panel: 'plant', furn: focus.uid }),
    });
  }
  return out;
});

// ------------------------------------------------------------------------------ system
function ensureFarm(state) {
  if (!state.farm) state.farm = { researched: false };
  for (const f of homeFurniture(state)) if (isPlanter(f)) summarize(f);
}

registerSystem({
  id: 'farming',
  order: 45,
  init: ensureFarm,
  ensure: ensureFarm,
  tick(state, dt) {
    const all = homeFurniture(state);
    let heaters = null;
    for (const f of all) {
      if (!f.data?.crops?.length || !isPlanter(f)) continue;
      if (!heaters) heaters = activeHeaters(state, all);
      tickPlanter(state, f, dt, heaters);
    }
    updateCounters(state, all);
  },
  onHour(state) {
    rollAnomalies(state);
    tickVases(state);
  },
});
