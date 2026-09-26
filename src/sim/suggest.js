// Smart Action Suggestions (dev log 06-03): three one-click actions based on the survivor's state.
import { homeFurniture } from './home.js';
import { furnitureFunctions, startFurnitureFunction, homeSources } from './furnActions.js';
import { item, CAT } from '../data/db.js';
import { useItemAction } from './itemuse.js';
import { enqueue, isIdle } from './actions.js';
import { isExpired, lifeLeftDays } from './spoilage.js';
import { pickLang } from '../engine/i18n.js';
import { itemName } from '../data/db.js';
import { isNight } from './time.js';
import { effectiveMax, hasEffect } from './stats.js';
import { effectiveMaxHp } from './home.js';

const extra = [];
export function registerSuggestions(fn) {
  extra.push(fn);
}

export function bestFood(state) {
  let best = null;
  for (const invId of homeSources(state)) {
    const inv = state.inventories[invId];
    if (!inv) continue;
    for (const it of inv.items) {
      const cfg = item(it.id);
      if (!cfg || cfg.cat !== CAT.FOOD || cfg.sat <= 0 || cfg.noUse) continue;
      if (cfg.cook && cfg.sub === 2) continue; // raw meat: cook it instead
      const expired = isExpired(it, cfg);
      // tastier food first, and leftovers get finished before a fresh dish is started
      const score = cfg.sat + cfg.mor * 0.5 + (cfg.taste || 0) * 2 + (it.left < 1 ? 15 : 0) - (expired ? 40 : 0) + Math.max(0, 5 - lifeLeftDays(it, cfg)) * 2;
      if (!best || score > best.score) best = { invId, inst: it, score };
    }
  }
  return best;
}

export function furnitureWith(state, kind, filter) {
  for (const f of homeFurniture(state)) {
    for (const fn of furnitureFunctions(state, f)) {
      if (fn.spec.kind === kind && fn.enabled && (!filter || filter(f, fn))) return { f, fn };
    }
  }
  return null;
}

export function suggestions(state) {
  const out = [];
  if (state.player.scene !== 'home') {
    for (const fn of extra) {
      try {
        const r = fn(state);
        if (r) out.push(...r);
      } catch (err) {
        console.error(err);
      }
    }
    return out.slice(0, 3);
  }
  const s = state.player.stats;
  const tense = hasEffect(state, 'tense');
  if (state.phase === 'pre') {
    out.push({ id: 'map', label: pickLang({ en: 'Open the city map (M)', zh: '打开城市地图 (M)' }), run: () => ({ panel: 'map' }) });
  }
  if (!tense && s.sat < effectiveMax(state, 'sat') * 0.45) {
    const food = bestFood(state);
    if (food) {
      out.push({
        id: 'eat',
        label: pickLang({ en: `Eat ${itemName(food.inst.id)}`, zh: `吃${itemName(food.inst.id)}` }),
        run: () => enqueue(state, useItemAction(state, food.invId, food.inst.uid, 'eat')),
      });
    }
  }
  if (!tense && (s.sta < effectiveMax(state, 'sta') * 0.3 || (isNight(state.clock) && s.sta < effectiveMax(state, 'sta') * 0.6))) {
    const bed = furnitureWith(state, 'sleep') || furnitureWith(state, 'nap');
    if (bed) out.push({ id: 'sleep', label: bed.fn.label, run: () => startFurnitureFunction(state, bed.f.uid, bed.fn.key) });
  }
  const damaged = homeFurniture(state).find((f) => (f.maxHp || 0) > 0 && f.hp < effectiveMaxHp(f) * 0.6 && furnitureFunctions(state, f).some((fn) => fn.spec.kind === 'repair' && fn.enabled));
  if (damaged) {
    const fn = furnitureFunctions(state, damaged).find((x) => x.spec.kind === 'repair' && x.enabled);
    out.push({ id: 'repair', label: fn.label, run: () => startFurnitureFunction(state, damaged.uid, fn.key) });
  }
  for (const fn of extra) {
    try {
      const r = fn(state);
      if (r) out.push(...r);
    } catch (err) {
      console.error(err);
    }
  }
  if (!tense && s.mor < effectiveMax(state, 'mor') * 0.4) {
    const fun = furnitureWith(state, 'radio') || furnitureWith(state, 'stat', (f, fn) => (fn.spec.gain?.mor || 0) >= 5);
    if (fun) out.push({ id: 'fun', label: fun.fn.label, run: () => startFurnitureFunction(state, fun.f.uid, fun.fn.key) });
  }
  return out.slice(0, 3);
}

export { isIdle };
