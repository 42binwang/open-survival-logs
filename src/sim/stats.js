// Survivor attributes: Satiety, Stamina, Morale, Life (+ trainable max caps) and status effects.
import { EFFECTS, OVERDUE_HOURS } from '../content/effects.js';
import { HOUR } from './time.js';
import { emit } from '../engine/bus.js';
import { getMods } from './modifiers.js';
import { weightKg } from './inventory.js';
import { pickLang } from '../engine/i18n.js';

export const STAT_KEYS = ['sat', 'sta', 'mor', 'life'];

// Base passive change per game hour.
export const BASE_RATES = {
  awake: { sat: -2.0, sta: -1.2, mor: -0.8, life: 0 },
  asleep: { sat: -1.0, sta: 0, mor: -0.2, life: 0 },
};

// Life regenerates only while Satiety is above this (and Stamina and Morale above 15, with nothing draining Life).
export const REGEN_SAT = 30;

export function createPlayer(character) {
  return {
    character,
    stats: { sat: 80, sta: 90, mor: 70, life: 100 },
    max: { sat: 100, sta: 100, mor: 100, life: 100 },
    effects: {},
    sleeping: false,
    daily: {},
    money: 0,
  };
}

export function effectiveMax(state, key) {
  const p = state.player;
  let m = p.max[key] + (getMods(state).maxAdd[key] || 0);
  for (const id of Object.keys(p.effects)) {
    const def = EFFECTS[id];
    if (def?.maxMod?.[key]) m += def.maxMod[key];
  }
  return Math.max(10, m);
}

export function clampStats(state) {
  const p = state.player;
  for (const k of STAT_KEYS) p.stats[k] = Math.max(0, Math.min(effectiveMax(state, k), p.stats[k]));
}

// Change a stat. Positive gains are scaled by effect gain multipliers (e.g. Mental Block).
export function addStat(state, key, delta, source = '') {
  const p = state.player;
  if (delta > 0) {
    for (const id of Object.keys(p.effects)) {
      const g = EFFECTS[id]?.gainMult?.[key];
      if (g != null) delta *= g;
    }
  }
  const before = p.stats[key];
  p.stats[key] = Math.max(0, Math.min(effectiveMax(state, key), before + delta));
  const real = p.stats[key] - before;
  if (key === 'life' && real < 0 && source && state.run) state.run.lastHurt = { source, t: state.clock.t };
  if (real !== 0) emit('stat', { key, delta: real, source });
  return real;
}

export function raiseMax(state, key, amount, source = '') {
  const p = state.player;
  p.max[key] = Math.round((p.max[key] + amount) * 100) / 100;
  emit('maxRaised', { key, amount, value: p.max[key], source });
  if (state.progress) {
    const over = STAT_KEYS.filter((k) => effectiveMax(state, k) > 150).length;
    state.progress.maxOver150 = Math.max(state.progress.maxOver150 || 0, over);
  }
}

export function hasEffect(state, id) {
  return !!state.player.effects[id];
}

export function addEffect(state, id, hours = -1, power = 1) {
  const p = state.player;
  const until = hours < 0 ? -1 : state.clock.t + hours * HOUR;
  const cur = p.effects[id];
  if (cur && cur.until !== -1 && until !== -1) cur.until = Math.max(cur.until, until);
  else if (!cur) {
    p.effects[id] = { until, power };
  }
}

export function removeEffect(state, id) {
  if (state.player.effects[id]) {
    delete state.player.effects[id];
  }
}

export function removeEffects(state, ids) {
  for (const id of ids) removeEffect(state, id);
}

// Automatic threshold effects (Hungry / Starving / Tired / Exhausted / Depressed / Breakdown).
function refreshAutoEffects(state) {
  const s = state.player.stats;
  const set = (id, on) => (on ? addEffect(state, id) : removeEffect(state, id));
  set('starving', s.sat <= 0);
  set('hungry', s.sat > 0 && s.sat < 20);
  set('exhausted', s.sta <= 0);
  set('tired', s.sta > 0 && s.sta < 15);
  set('breakdown', s.mor <= 0);
  set('depressed', s.mor > 0 && s.mor < 15);
  const bp = state.inventories?.[state.player.backpack];
  set('encumbered', !!bp && bp.maxKg != null && weightKg(bp) > bp.maxKg + 1e-9);
}

// A breakdown that drags on for hours leaves a Mental Block behind.
export const MENTAL_BLOCK = { afterHours: 4, hours: 24 };

function trackBreakdown(state, hours) {
  const p = state.player;
  if (!hasEffect(state, 'breakdown')) {
    p.breakdownH = 0;
    return;
  }
  p.breakdownH = (p.breakdownH || 0) + hours;
  if (p.breakdownH >= MENTAL_BLOCK.afterHours && !hasEffect(state, 'mentalBlock')) {
    addEffect(state, 'mentalBlock', MENTAL_BLOCK.hours);
    p.breakdownH = 0;
    emit('toast', { text: pickLang({ en: 'The breakdown has left a Mental Block: morale recovers at half speed.', zh: '崩溃留下了心理阻滞：心态恢复减半。' }), kind: 'bad' });
  }
}

export function actionTimeMult(state) {
  let m = 1;
  for (const id of Object.keys(state.player.effects)) {
    const a = EFFECTS[id]?.actMult;
    if (a) m *= a;
  }
  return m;
}

export function moveSpeedMult(state) {
  let m = 1;
  for (const id of Object.keys(state.player.effects)) {
    const a = EFFECTS[id]?.moveMult;
    if (a) m *= a;
  }
  return m;
}

// Passive tick. dt in game seconds.
export function tickStats(state, dt) {
  const p = state.player;
  const hours = dt / HOUR;
  const mods = getMods(state);
  const base = p.sleeping ? BASE_RATES.asleep : BASE_RATES.awake;
  const rate = { ...base };
  rate.sat *= mods.satDecay;
  rate.mor *= mods.morDecay;
  rate.sta *= mods.staDecay;
  if (state.phase === 'pre') {
    // Before the outbreak life is normal: slower drain, no morale pressure.
    rate.sat *= 0.6;
    rate.mor = 0;
  }
  for (const [id, e] of Object.entries(p.effects)) {
    const def = EFFECTS[id];
    if (def?.rate) for (const [k, v] of Object.entries(def.rate)) rate[k] = (rate[k] || 0) + v * (e.power || 1);
  }
  for (const id of Object.keys(p.effects)) {
    const def = EFFECTS[id];
    if (def?.mult) for (const [k, m] of Object.entries(def.mult)) if (rate[k] < 0) rate[k] *= m;
  }
  // natural life regeneration when well kept
  const s = p.stats;
  const lifeHurt = Object.keys(p.effects).some((id) => EFFECTS[id]?.rate?.life < 0);
  if (!lifeHurt && s.sat > REGEN_SAT && s.sta > 15 && s.mor > 15) rate.life += p.sleeping ? 1.2 : 0.4;
  for (const k of STAT_KEYS) {
    if (rate[k]) addStat(state, k, rate[k] * hours, 'passive');
  }
  // expire timed effects
  for (const [id, e] of Object.entries(p.effects)) {
    if (e.until !== -1 && state.clock.t >= e.until) removeEffect(state, id);
  }
  refreshAutoEffects(state);
  trackBreakdown(state, hours);
  // challenge taboo: Life under 20%
  if (s.life < effectiveMax(state, 'life') * 0.2 && state.progress) state.progress.taboo.lowVitality = true;
}

export function isDead(state) {
  return state.player.stats.life <= 0;
}

// Eating an expired item may give one of its overdue debuffs.
export function rollOverdueDebuff(state, cfg, rng) {
  if (!cfg.od?.length) return null;
  const entries = cfg.od.map((id, i) => [id, cfg.odPow?.[i] ?? 1]);
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  for (const [id, w] of entries) {
    r -= w;
    if (r < 0) {
      addEffect(state, String(id), OVERDUE_HOURS[id] || 8);
      return id;
    }
  }
  return null;
}

export function resetDaily(state) {
  state.player.daily = {};
}

export function bumpDaily(state, key, n = 1) {
  state.player.daily[key] = (state.player.daily[key] || 0) + n;
  return state.player.daily[key];
}

export function dailyCount(state, key) {
  return state.player.daily[key] || 0;
}
