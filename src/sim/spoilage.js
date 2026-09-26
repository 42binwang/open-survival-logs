// Shelf life, spoilage, rot products and mold (patches 07-17, 08-13, 08-23, 08-25, 08-26, 09-17).
import { item, CAT } from '../data/db.js';
import { getMods } from './modifiers.js';
import { makeInstance, dims } from './inventory.js';
import { isOutdoorTile } from './home.js';
import { emit } from '../engine/bus.js';
import { rand } from '../engine/rng.js';
import { pickLang } from '../engine/i18n.js';

export const DAY_S = 86400;

export function lifeLeftDays(inst, cfg = item(inst.id)) {
  if (!cfg || cfg.life <= 0) return Infinity;
  return cfg.life - (inst.age || 0);
}

export function isExpired(inst, cfg = item(inst.id)) {
  return lifeLeftDays(inst, cfg) <= 0;
}

export function isExpiringSoon(inst, cfg = item(inst.id)) {
  const left = lifeLeftDays(inst, cfg);
  return left > 0 && left !== Infinity && (left <= 1 || left <= cfg.life * 0.2);
}

export function rotAtDays(cfg) {
  return cfg.life + Math.max(0.5, cfg.rotT || 1);
}

// Preservation multiplier for a container (1 = room temperature).
export function containerRate(state, inv) {
  const mods = getMods(state);
  const base = mods.decay || 1;
  if (inv.special === 'brew' && inv.brewing) return 0;
  if (inv.special === 'compost') return base * 5;
  if (inv.cold > 0) {
    const f = inv.owner ? state.furniture[inv.owner] : null;
    const powered = !f || f.powered !== false;
    if (powered && (!f || f.on !== false)) return base * inv.cold * mods.fridgeMult;
    return base * mods.roomSpoil;
  }
  if (inv.coldRoom && inv.sealed) return 0;
  if (inv.coldRoom) return base * 0.25 * mods.fridgeMult;
  if (inv.outdoor || outdoorFurniture(state, inv)) return base * TERRACE_SPOIL * mods.roomSpoil;
  return base * mods.roomSpoil;
}

// Food kept out on the terrace spoils a little faster (patch 08-25 toned this down).
export const TERRACE_SPOIL = 1.25;

function outdoorFurniture(state, inv) {
  const f = inv.kind === 'furniture' && inv.owner ? state.furniture[inv.owner] : null;
  return !!f && isOutdoorTile(state, f.floor, f.x, f.y);
}

// Advance spoilage for all inventories by dt game seconds.
// Patch 09-12: rotten meat left in the compost bin turns into basic fertilizer after a few days.
export const COMPOST_MEAT_DAYS = { 26008: 2, 26009: 3, 26010: 4 };
const BASIC_FERTILIZER = 15501;

export function tickSpoilage(state, dt) {
  const dtDays = dt / DAY_S;
  for (const inv of Object.values(state.inventories)) {
    if (inv.kind === 'shop' || inv.kind === 'trade') continue;
    // nothing to age (the homes' many storage pieces are mostly empty)
    if (!inv.items.length && !inv.moldy) continue;
    const rate = containerRate(state, inv);
    if (rate === 0) continue;
    for (const inst of [...inv.items]) {
      const cfg = item(inst.id);
      if (!cfg) continue;
      if (inv.special === 'compost' && COMPOST_MEAT_DAYS[inst.id]) {
        inst.age = (inst.age || 0) + dtDays;
        if (inst.age >= COMPOST_MEAT_DAYS[inst.id]) compostMeat(state, inv, inst);
        continue;
      }
      if (cfg.life <= 0) continue;
      inst.age = (inst.age || 0) + dtDays * rate * (inst.mold > 0 ? 1.5 : 1);
      if (inst.age >= rotAtDays(cfg)) rotItem(state, inv, inst, cfg);
    }
    if (inv.moldy) spreadMold(state, inv, dtDays);
  }
}

function compostMeat(state, inv, inst) {
  const idx = inv.items.indexOf(inst);
  if (idx < 0) return;
  const r = makeInstance(state, BASIC_FERTILIZER);
  r.x = inst.x;
  r.y = inst.y;
  inv.items.splice(idx, 1, r);
}

function rotItem(state, inv, inst, cfg) {
  const idx = inv.items.indexOf(inst);
  if (idx < 0) return;
  const product = cfg.rot?.[0];
  inv.items.splice(idx, 1);
  if (product && item(product)) {
    const r = makeInstance(state, product);
    r.x = inst.x;
    r.y = inst.y;
    inv.items.push(r);
  }
  if (cfg.cat === CAT.FOOD) {
    state.progress.taboo.foodRot = true;
    state.progress.counters['food.rot'] = (state.progress.counters['food.rot'] || 0) + 1;
    // rotting food in a closed container can start mold
    if (inv.kind === 'furniture' && inv.special !== 'compost' && rand(state) < 0.12) inv.moldy = true;
  }
}

function spreadMold(state, inv, dtDays) {
  inv.moldLevel = Math.min(1, (inv.moldLevel || 0) + dtDays * 0.25);
  for (const inst of inv.items) {
    const cfg = item(inst.id);
    if (cfg?.cat === CAT.FOOD && rand(state) < dtDays * 0.4) inst.mold = 1;
  }
  if (!state.crises.mold && inv.moldLevel > 0.5) {
    state.crises.mold = { since: state.clock.t };
    const active = (state.crises.active ||= []);
    if (!active.some((c) => c.type === 'mold')) active.push({ id: 'mold', owner: 'spoilage', type: 'mold', label: pickLang({ en: 'Mold Crisis', zh: '霉菌危机' }), phase: 'active', since: state.clock.t });
    emit('crisis', { type: 'mold' });
    emit('toast', { text: pickLang({ en: 'Mold is spreading through your stores! Disinfect the moldy container before the food goes bad.', zh: '霉菌在储藏里蔓延！趁食物还没坏，赶紧给发霉的容器消毒。' }), kind: 'bad' });
  }
}

// Disinfectant spray: clean a container (and moldy food in it).
export function disinfect(state, inv, strength = 1) {
  inv.moldLevel = Math.max(0, (inv.moldLevel || 0) - 0.6 * strength);
  if (inv.moldLevel <= 0.05) {
    inv.moldy = false;
    inv.moldLevel = 0;
  }
  for (const inst of inv.items) inst.mold = 0;
  const anyMold = Object.values(state.inventories).some((i) => i.moldy);
  if (!anyMold && state.crises.mold) {
    const cr = state.crises;
    cr.history?.push({ type: 'mold', from: cr.mold.since, to: state.clock.t });
    cr.mold = null;
    cr.active = (cr.active || []).filter((c) => c.type !== 'mold');
    state.progress.crisesSurvived = (state.progress.crisesSurvived || 0) + 1;
    state.progress.counters['crisis.survived'] = (state.progress.counters['crisis.survived'] || 0) + 1;
    emit('toast', { text: pickLang({ en: 'The mold is gone.', zh: '霉菌清理干净了。' }), kind: 'good' });
  }
}

export function freshnessLabel(inst) {
  const cfg = item(inst.id);
  if (!cfg || cfg.life <= 0) return null;
  const left = lifeLeftDays(inst, cfg);
  if (left <= 0) return 'expired';
  if (isExpiringSoon(inst, cfg)) return 'soon';
  return 'fresh';
}

export { dims };
