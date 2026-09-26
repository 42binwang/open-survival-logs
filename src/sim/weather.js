// Weather, temperature and cold (dev log 06-03; patches 08-13, 08-16, 08-18, 08-23, 08-25, 08-31).
// A run drifts from autumn into winter: temperatures sink over ~100 days, the first cold wave hits
// around Day 26–35 after a few days of warning and ramps from moderate to severe, later cold snaps
// follow and the late game brings long overcast stretches. Tomorrow's forecast is always right.
import { registerSystem } from './tick.js';
import { registerObjectives } from './objectives.js';
import { furn, ELEC } from '../data/db.js';
import { homeDef, homeFloors, homeFurniture, isFloorUnlocked, isRoomUnlocked } from './home.js';
import { CELL, cellAt } from './scene.js';
import { addEffect, hasEffect } from './stats.js';
import { getMods } from './modifiers.js';
import { dayNumber, dayStartT, hourOfDay, DAY, HOUR } from './time.js';
import { logEvent } from './state.js';
import { seedRng, nextFloat, rand } from '../engine/rng.js';
import { emit } from '../engine/bus.js';
import { pickLang } from '../engine/i18n.js';

export const WEATHER_KINDS = ['sunny', 'cloudy', 'rain', 'heavyRain', 'storm', 'snow', 'freezingRain', 'coldWave'];

// Share of full sunlight that reaches solar panels.
export const SUN_FACTOR = { sunny: 1, cloudy: 0.35, rain: 0.2, heavyRain: 0.12, storm: 0.08, snow: 0.25, freezingRain: 0.12, coldWave: 0.3 };
// Stamina multiplier for activity outdoors (exploration).
const OUTDOOR_STAMINA = { sunny: 1, cloudy: 1, rain: 1.15, heavyRain: 1.3, storm: 1.4, snow: 1.35, freezingRain: 1.5, coldWave: 2 };
const WET = new Set(['rain', 'heavyRain', 'storm', 'freezingRain']);

export const COLD_BELOW = 8; // °C felt by the survivor before Cold sets in
export const THERMOSTAT = 18; // electric heaters only run while the unheated room is colder than this
const HEAT_TARGET = 22; // electric heating stops raising the temperature here
const HEAT_PER_UNIT = 8; // °C one HeatOutput unit adds to a floor it fully covers
const HEAT_RANGE = 60; // floor tiles one HeatOutput unit covers
const INSULATION = { B1: 11 }; // walls keep the air warmer than outside; the basement more so
const DEFAULT_INSULATION = 8;
const PASSIVE_MAX = 22; // walls only hold heat in; they never warm a room past this
const WARN_DAYS = 3;
const FEVER_AFTER = 12 * HOUR;
const FIREPLACE_FUNC = 1776;
const THUNDER_GAP = [15 * 60, 50 * 60]; // game seconds between thunderclaps on a thunderstorm day

// Daily mean temperature through the story: [day, °C].
const SEASON = [
  [1, 17],
  [10, 14],
  [20, 10],
  [30, 6],
  [45, 1],
  [60, -3],
  [75, -6],
  [100, -8],
];

const round1 = (v) => Math.round(v * 10) / 10;

export function seasonalMean(day) {
  // Endless runs keep going: the year turns back towards summer and into the next winter.
  if (day > 100) return 5 - 13 * Math.cos((2 * Math.PI * (day - 100)) / 120);
  for (let i = 1; i < SEASON.length; i++) {
    const [d1, t1] = SEASON[i];
    if (day <= d1) {
      const [d0, t0] = SEASON[i - 1];
      return t0 + ((t1 - t0) * (day - d0)) / (d1 - d0);
    }
  }
  return SEASON[SEASON.length - 1][1];
}

function extremeLevel(state) {
  return Math.max(0, getMods(state).weatherExtreme ?? 1);
}

// ------------------------------------------------------------------------------ daily rolls
function kindWeights(day, mean, prevKind, ext) {
  const late = Math.min(1, Math.max(0, (day - 40) / 40));
  const calm = 1 / Math.max(0.25, ext); // low extreme-weather settings make sunny days common
  const wet = mean > 1;
  return {
    sunny: (42 - 26 * late) * calm,
    cloudy: 28 + 22 * late + (prevKind === 'cloudy' ? 20 + 40 * late : 0), // late game: long overcast stretches
    rain: wet ? 14 * (1 - 0.5 * late) : 0,
    heavyRain: wet ? 5 * ext : 0,
    storm: mean > 5 ? 4 * ext : 0,
    snow: mean <= 1.5 ? (14 + 16 * late) * Math.sqrt(Math.max(0.3, ext)) : 0,
    freezingRain: mean > -4 && mean <= 1.5 ? 4 * ext : 0,
    coldWave: 0,
  };
}

function pickKind(weights, r) {
  let total = 0;
  for (const k of WEATHER_KINDS) total += weights[k];
  let x = r() * total;
  for (const k of WEATHER_KINDS) {
    x -= weights[k];
    if (x < 0 && weights[k] > 0) return k;
  }
  return 'cloudy';
}

function makeDay(day, kind, mean, sun) {
  const amp = kind === 'sunny' ? 4.5 : kind === 'cloudy' ? 3 : 2;
  return { day, kind, mean: round1(mean), low: round1(mean - amp), high: round1(mean + amp), sun: Math.round(sun * 100) / 100, temp: round1(mean) };
}

function rollDay(state, day, prev) {
  const w = state.weather;
  const r = () => nextFloat(w.rng);
  let mean = seasonalMean(day) + (r() + r() + r() - 1.5) * 2.4;
  const wave = waveOn(w, day);
  let kind;
  if (wave) {
    kind = 'coldWave';
    mean += waveOffset(wave, day);
  } else {
    kind = pickKind(kindWeights(day, mean, prev?.kind, extremeLevel(state)), r);
  }
  const sun = Math.min(1, SUN_FACTOR[kind] * (0.85 + r() * 0.3));
  return makeDay(day, kind, mean, sun);
}

// ------------------------------------------------------------------------------ cold waves
// w.coldWaves: [{ id, start (day), days, peak (°C drop at full strength), first }]
function addColdWave(state) {
  const w = state.weather;
  const r = () => nextFloat(w.rng);
  const ext = extremeLevel(state);
  const strength = 0.6 + 0.4 * Math.min(2, ext);
  const prev = w.coldWaves[w.coldWaves.length - 1];
  if (!prev) {
    w.coldWaves.push({ id: 1, start: 26 + Math.floor(r() * 10), days: 4 + Math.floor(r() * 3), peak: round1((14 + r() * 6) * strength), first: true });
    return;
  }
  let start = prev.start + prev.days + 10 + Math.floor(r() * 10);
  const odds = Math.min(0.95, 0.25 + 0.55 * ext); // calm settings skip cold snaps
  while (r() > odds) start += 6 + Math.floor(r() * 6);
  const n = w.coldWaves.length;
  w.coldWaves.push({ id: n + 1, start, days: 3 + Math.floor(r() * 3), peak: round1((10 + r() * 6) * strength * (1 + Math.min(0.3, n * 0.08))), first: false });
}

// Keep waves planned far enough ahead that warnings and forecasts can see them.
function planColdWaves(state, day) {
  const w = state.weather;
  let last = w.coldWaves[w.coldWaves.length - 1];
  while (!last || last.start + last.days <= day + WARN_DAYS) {
    addColdWave(state);
    last = w.coldWaves[w.coldWaves.length - 1];
  }
}

function waveOn(w, day) {
  return w.coldWaves?.find((c) => day >= c.start && day < c.start + c.days) || null;
}

// The first cold wave eases in from moderate to severe (patch 08-13); later ones hit harder at once.
function waveOffset(wave, day) {
  const i = day - wave.start;
  const last = i === wave.days - 1 && wave.days > 2;
  const rise = wave.first ? 0.35 + (0.65 * i) / Math.max(1, wave.days - 2) : i === 0 ? 0.7 : 1;
  return -wave.peak * Math.min(1, rise) * (last ? 0.6 : 1);
}

export function coldWaveAt(state, day = dayNumber(state.clock)) {
  return state.weather ? waveOn(state.weather, day) : null;
}

export function nextColdWave(state) {
  const day = dayNumber(state.clock);
  return state.weather?.coldWaves?.find((c) => c.start + c.days > day) || null;
}

// ------------------------------------------------------------------------------ state
function initWeather(state) {
  const day = dayNumber(state.clock);
  const w = {
    rng: seedRng(((state.meta?.seed ?? 1) ^ 0x5ea5e) >>> 0),
    today: null,
    tomorrow: null,
    history: [],
    coldWaves: [],
    indoorTemp: {},
    felt: null,
    coldExposure: 0,
  };
  state.weather = w;
  planColdWaves(state, day + 1);
  // The day of the outbreak is sunny and mild.
  w.today = day <= 1 ? makeDay(day, 'sunny', 18, 1) : rollDay(state, day, null);
  w.tomorrow = rollDay(state, day + 1, w.today);
  refreshTemps(state);
  return w;
}

// Roll forward so that `today` is `day` (handles skipped days after fast-forwards).
export function advanceWeather(state, day) {
  const w = state.weather?.today ? state.weather : initWeather(state);
  w.history ||= [];
  w.coldWaves ||= [];
  while (w.today.day < day && w.rng) {
    const { day: d, kind, mean, low, high, sun } = w.today;
    w.history.push({ day: d, kind, mean, low, high, sun });
    if (w.history.length > 120) w.history.shift();
    const next = w.today.day + 1;
    planColdWaves(state, next + 1);
    w.today = w.tomorrow?.day === next ? w.tomorrow : rollDay(state, next, w.today);
    w.tomorrow = rollDay(state, next + 1, w.today);
  }
  return w;
}

export function forecast(state) {
  return { today: state.weather?.today || null, tomorrow: state.weather?.tomorrow || null };
}

export function weatherSunFactor(state) {
  const d = state.weather?.today;
  if (!d || state.phase === 'pre') return 1;
  return d.sun ?? SUN_FACTOR[d.kind] ?? 1;
}

export function isRaining(state) {
  return WET.has(state.weather?.today?.kind);
}

export function isSnowing(state) {
  const k = state.weather?.today?.kind;
  return k === 'snow' || k === 'coldWave';
}

// ------------------------------------------------------------------------------ temperatures
const ease = (a, b, f) => a + ((b - a) * (1 - Math.cos(Math.PI * f))) / 2;

// Current outside temperature: lows around 03:00, highs around 15:00, blended across midnight.
export function outdoorTemp(state) {
  const w = state.weather;
  if (!w?.today) return 15;
  const d = w.today;
  if (!hasCurve(d)) return d.temp ?? d.mean ?? 15;
  const h = hourOfDay(state.clock);
  if (h >= 3 && h < 15) return round1(ease(d.low, d.high, (h - 3) / 12));
  const t = hasCurve(w.tomorrow) ? w.tomorrow : d;
  if (h >= 15) return round1(ease(d.high, t.low, (h - 15) / 12));
  const y = w.history?.[w.history.length - 1];
  return round1(ease(hasCurve(y) ? y.high : d.high, d.low, (h + 9) / 12));
}

function hasCurve(d) {
  return typeof d?.low === 'number' && typeof d?.high === 'number';
}

// Indoor temperature before heating: outside plus what the walls keep in.
function passiveTemp(out, floor) {
  return Math.min(out + (INSULATION[floor] ?? DEFAULT_INSULATION), Math.max(out, PASSIVE_MAX));
}

export function baseIndoorTemp(state, floor) {
  return passiveTemp(outdoorTemp(state), floor);
}

const areaCache = new Map();
function floorArea(state, floor) {
  const key = `${state.home.id}:${floor}`;
  if (!areaCache.has(key)) {
    const fl = homeFloors(state.home.id)[floor];
    let n = 0;
    if (fl) for (let y = 0; y < fl.innerH; y++) for (let x = 0; x < fl.w; x++) if (cellAt(fl, x, y) === CELL.FLOOR) n++;
    areaCache.set(key, Math.max(20, n));
  }
  return areaCache.get(key);
}

export function isFuelHeater(def) {
  return !!def && (def.elec === ELEC.FUEL_HEATER || def.funcs.includes(FIREPLACE_FUNC));
}

// Heat sources per floor: electric heaters/AC that are switched on and powered, fuel heaters that burn.
export function heatingByFloor(state) {
  const out = {};
  for (const f of homeFurniture(state)) {
    if (typeof f.cfg !== 'number') continue;
    const d = furn(f.cfg);
    if (!d?.heat || !isFloorUnlocked(state, f.floor) || !isRoomUnlocked(state, f.floor, f.x, f.y)) continue;
    const e = (out[f.floor] ||= { electric: 0, fuel: 0, heaters: 0 });
    e.heaters++;
    if (isFuelHeater(d)) {
      if (f.data?.lit) e.fuel += d.heat;
    } else if (d.elec === ELEC.CONSUMER && f.on !== false && f.powered !== false) {
      e.electric += d.heat;
    }
  }
  return out;
}

function floorTemp(state, floor, out, heat) {
  const base = passiveTemp(out, floor);
  if (!heat) return base;
  const area = floorArea(state, floor);
  const cover = (units) => units * HEAT_PER_UNIT * Math.min(1, (units * HEAT_RANGE) / area);
  const electric = base < THERMOSTAT ? heat.electric : 0;
  let t = base + cover(electric + heat.fuel);
  if (electric > 0) t = Math.min(t, Math.max(HEAT_TARGET, base + cover(heat.fuel)));
  return t;
}

export function indoorTemp(state, floor) {
  if (!state.weather) return 18;
  return round1(floorTemp(state, floor, outdoorTemp(state), heatingByFloor(state)[floor]));
}

// What the survivor feels: outdoors on the terrace or while exploring, otherwise their floor.
export function survivorTemp(state) {
  const p = state.player;
  if (p.scene && p.scene !== 'home') return outdoorTemp(state);
  const fl = homeFloors(state.home.id)[p.floor];
  const c = fl ? cellAt(fl, p.x, p.y) : CELL.FLOOR;
  if (c === CELL.OUTDOOR || c === CELL.YARD) return outdoorTemp(state);
  return state.weather?.indoorTemp?.[p.floor] ?? indoorTemp(state, p.floor);
}

export function outdoorStaminaMult(state) {
  const d = state.weather?.today;
  if (!d) return 1;
  const m = OUTDOOR_STAMINA[d.kind] ?? 1;
  return outdoorTemp(state) < -10 ? m * 1.2 : m;
}

function refreshTemps(state) {
  const w = state.weather;
  const out = outdoorTemp(state);
  if (hasCurve(w.today)) w.today.temp = out;
  const heat = heatingByFloor(state);
  w.indoorTemp = {};
  for (const floor of Object.keys(homeDef(state.home.id).floors)) w.indoorTemp[floor] = round1(floorTemp(state, floor, out, heat[floor]));
}

// ------------------------------------------------------------------------------ survivor
// Warm clothing raises the felt temperature by one level (the scarf lasts the rest of the run).
export const CLOTHING_WARMTH = { scarf: 6 };

export function clothingWarmth(state) {
  return Object.keys(state.player.worn || {}).reduce((sum, k) => sum + (CLOTHING_WARMTH[k] || 0), 0);
}

function feelCold(state, dt) {
  const w = state.weather;
  const t = survivorTemp(state) + clothingWarmth(state);
  w.felt = round1(t);
  if (t < COLD_BELOW && !hasEffect(state, 'warm')) {
    addEffect(state, 'cold', 1);
    const e = state.player.effects.cold;
    if (e) e.power = t < -5 ? 2 : t < 2 ? 1.5 : 1;
    w.coldExposure = (w.coldExposure || 0) + dt;
  } else {
    w.coldExposure = Math.max(0, (w.coldExposure || 0) - dt * 2);
  }
}

// Thunder for the audio system. Its own RNG stream: drawing from the weather or game RNG would change the forecast
// and every other roll.
function thunder(state) {
  const w = state.weather;
  if (w.today?.kind !== 'storm') return;
  const th = (w.thunder ||= { rng: seedRng(((state.meta?.seed ?? 1) ^ 0x7d00) >>> 0), day: null, at: 0 });
  const t = state.clock.t;
  const gap = () => THUNDER_GAP[0] + nextFloat(th.rng) * (THUNDER_GAP[1] - THUNDER_GAP[0]);
  if (th.day !== w.today.day) {
    th.day = w.today.day;
    th.at = t + gap();
    return;
  }
  if (t < th.at) return;
  th.at = t + gap();
  emit('thunder', { day: w.today.day });
}

function rollFever(state) {
  const w = state.weather;
  if ((w.coldExposure || 0) < FEVER_AFTER || !hasEffect(state, 'cold') || hasEffect(state, 'fever')) return;
  const power = state.player.effects.cold?.power || 1;
  if (rand(state) < 0.05 * power) {
    addEffect(state, 'fever', 24);
    emit('toast', { text: pickLang({ en: 'Hours in the cold have given you a fever.', zh: '冻了太久，发烧了。' }), kind: 'bad' });
  }
}

// ------------------------------------------------------------------------------ crisis bar
function waveLabel(state, wave, active) {
  if (!active) return pickLang({ en: `Cold Wave (−${Math.round(wave.peak)}°C)`, zh: `寒潮（降温${Math.round(wave.peak)}°C）` });
  const i = dayNumber(state.clock) - wave.start + 1;
  return pickLang({ en: `Cold Wave · day ${i}/${wave.days} · ${Math.round(outdoorTemp(state))}°C`, zh: `寒潮 · 第${i}/${wave.days}天 · ${Math.round(outdoorTemp(state))}°C` });
}

function remember(state, id, day, text) {
  const mem = (state.loop.memories ||= []);
  if (mem.some((m) => m?.id === id)) return;
  mem.push({ id, day, text });
}

function syncCrises(state) {
  const w = state.weather;
  const cr = state.crises;
  cr.upcoming ||= [];
  cr.active ||= [];
  cr.history ||= [];
  const t = state.clock.t;
  for (const wave of w.coldWaves || []) {
    const id = `coldWave:${wave.id}`;
    const start = dayStartT(state.clock, wave.start);
    const end = dayStartT(state.clock, wave.start + wave.days);
    const up = cr.upcoming.findIndex((c) => c.id === id);
    const act = cr.active.findIndex((c) => c.id === id);
    if (t >= start - WARN_DAYS * DAY && t < start) {
      if (up < 0) {
        cr.upcoming.push({ id, owner: 'weather', type: 'coldWave', label: waveLabel(state, wave, false), at: start });
        emit('toast', { text: pickLang({ en: 'Radio: a cold wave is coming in a few days. Set up heating and stock fuel.', zh: '广播：几天后寒潮来袭，请提前准备取暖设备和燃料。' }), kind: 'bad' });
        logEvent(state, pickLang({ en: `Cold wave warning for Day ${wave.start}.`, zh: `寒潮预警：第${wave.start}天。` }), 'warn');
      } else {
        cr.upcoming[up].label = waveLabel(state, wave, false);
      }
    } else if (up >= 0) {
      cr.upcoming.splice(up, 1);
    }
    if (t >= start && t < end) {
      if (act < 0) {
        cr.active.push({ id, owner: 'weather', type: 'coldWave', label: waveLabel(state, wave, true), phase: 'active', since: start, until: end });
        emit('crisis', { type: 'coldWave' });
        emit('toast', { text: pickLang({ en: 'The cold wave has arrived. Stay indoors and keep warm.', zh: '寒潮来了，待在屋里注意保暖。' }), kind: 'bad' });
        logEvent(state, pickLang({ en: 'A cold wave hit the city.', zh: '寒潮袭击了城市。' }), 'bad');
        if (wave.first) remember(state, 'coldWave', wave.start, { en: `The first cold wave hits around Day ${wave.start}.`, zh: `第一次寒潮在第${wave.start}天左右来袭。` });
      } else {
        cr.active[act].label = waveLabel(state, wave, true);
      }
    } else if (act >= 0) {
      cr.active.splice(act, 1);
      cr.history.push({ type: 'coldWave', id, from: start, to: end });
      state.progress.crisesSurvived = (state.progress.crisesSurvived || 0) + 1;
      emit('toast', { text: pickLang({ en: 'The cold wave is over.', zh: '寒潮过去了。' }), kind: 'good' });
    }
  }
}

// While a cold wave is announced or raging: keep the survivor's floor above the Cold threshold.
registerObjectives((state) => {
  if (state.phase !== 'post' || !state.weather) return null;
  const cr = state.crises || {};
  const wave = (cr.active || []).find((c) => c.type === 'coldWave') || (cr.upcoming || []).find((c) => c.type === 'coldWave');
  if (!wave) return null;
  const floor = state.player.floor;
  const temp = state.weather.indoorTemp?.[floor];
  const label = pickLang(homeDef(state.home.id).floors[floor]?.label) || floor;
  return [
    {
      id: 'coldWave',
      text: pickLang({ en: `Cold wave: keep the house above ${COLD_BELOW} °C with a heater, AC or fireplace`, zh: `寒潮：用暖炉、空调或取暖器让室温保持在${COLD_BELOW}°C以上` }),
      prog: temp != null ? `${label} ${Math.round(temp)}°C` : null,
      urgent: temp == null || temp < COLD_BELOW,
    },
  ];
});

// ------------------------------------------------------------------------------ system
registerSystem({
  id: 'weather',
  order: 20,
  init(state) {
    initWeather(state);
  },
  ensure(state) {
    const w = state.weather;
    if (!w?.today) {
      initWeather(state);
      return;
    }
    w.rng ||= seedRng(((state.meta?.seed ?? 1) ^ 0x5ea5e) >>> 0);
    w.history ||= [];
    w.coldWaves ||= [];
    w.indoorTemp ||= {};
    planColdWaves(state, w.today.day + 1);
  },
  tick(state, dt) {
    const w = state.weather?.today ? state.weather : initWeather(state);
    const day = dayNumber(state.clock);
    if (w.today.day < day) advanceWeather(state, day);
    refreshTemps(state);
    if (state.phase !== 'post') return;
    syncCrises(state);
    feelCold(state, dt);
    thunder(state);
  },
  onHour(state) {
    if (state.phase === 'post' && state.weather) rollFever(state);
  },
  onDay(state, day) {
    advanceWeather(state, day);
  },
});
