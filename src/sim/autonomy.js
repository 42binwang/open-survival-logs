// When left idle the survivor looks after themselves (eats, sleeps, finds some leisure) unless Tense
// (patch 08-21: tense survivors stop eating, sleeping and entertaining themselves automatically).
import { registerSystem } from './tick.js';
import { isIdle, enqueue } from './actions.js';
import { hasEffect, effectiveMax } from './stats.js';
import { bestFood, furnitureWith } from './suggest.js';
import { startFurnitureFunction } from './furnActions.js';
import { useItemAction } from './itemuse.js';
import { isNight } from './time.js';
import { emit } from '../engine/bus.js';
import { pickLang } from '../engine/i18n.js';

export const IDLE_BEFORE_AUTONOMY = 90 * 60;

export function autonomousChoice(state) {
  const s = state.player.stats;
  if (s.sat < effectiveMax(state, 'sat') * 0.25) {
    const food = bestFood(state);
    if (food) return { kind: 'eat', food };
  }
  if (s.sta < effectiveMax(state, 'sta') * 0.12 || (isNight(state.clock) && s.sta < effectiveMax(state, 'sta') * 0.35)) {
    const bed = furnitureWith(state, 'sleep') || furnitureWith(state, 'nap');
    if (bed) return { kind: 'rest', bed };
  }
  if (s.mor < effectiveMax(state, 'mor') * 0.2) {
    const fun = furnitureWith(state, 'radio') || furnitureWith(state, 'stat', (f, fn) => (fn.spec.gain?.mor || 0) >= 5 && !(fn.spec.cost?.sta > 8));
    if (fun) return { kind: 'fun', fun };
  }
  return null;
}

registerSystem({
  id: 'autonomy',
  order: 90,
  tick(state, dt) {
    if (state.phase !== 'post' || state.player.scene !== 'home' || state.ui.autonomy === false) return;
    if (!isIdle(state) || state.player.sleeping || hasEffect(state, 'tense')) {
      state.run.idleT = 0;
      return;
    }
    state.run.idleT = (state.run.idleT || 0) + dt;
    if (state.run.idleT < IDLE_BEFORE_AUTONOMY) return;
    state.run.idleT = 0;
    const c = autonomousChoice(state);
    if (!c) return;
    if (c.kind === 'eat') enqueue(state, useItemAction(state, c.food.invId, c.food.inst.uid, 'eat'));
    else if (c.kind === 'rest') startFurnitureFunction(state, c.bed.f.uid, c.bed.fn.key);
    else startFurnitureFunction(state, c.fun.f.uid, c.fun.fn.key);
    emit('toast', { text: pickLang({ eat: { en: 'Hungry — grabbing a bite.', zh: '饿了，随便吃点东西。' }, rest: { en: 'Too tired — lying down.', zh: '太累了，去躺一会儿。' }, fun: { en: 'Need a break — taking my mind off things.', zh: '需要喘口气，找点事分散注意力。' } }[c.kind]) });
  },
});
