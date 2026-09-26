// Daily wishes (lottery pick at the bottom of the screen) and the Mental Toughness ability button.
import { items as ITEMS, CAT } from '../data/db.js';
import { registerSystem } from './tick.js';
import { hourOfDay } from './time.js';
import { weighted } from '../engine/rng.js';
import { emit } from '../engine/bus.js';
import { getMods } from './modifiers.js';
import { addStat, dailyCount, bumpDaily } from './stats.js';
import { pickLang } from '../engine/i18n.js';

// Military supply food is too hard to get (patch 08-26), so wishes skip it.
const EXCLUDED = new Set([2101, 2107, 11008]);

export function wishPool() {
  return Object.values(ITEMS).filter((it) => it.cat === CAT.FOOD && it.wish > 0 && it.codex && !EXCLUDED.has(it.id));
}

export function offerWishes(state) {
  const pool = wishPool().map((it) => [it.id, it.wish]);
  const picks = new Set();
  let guard = 0;
  while (picks.size < 3 && guard++ < 50) picks.add(weighted(state, pool));
  state.run.wishOffers = { day: state.run.day, ids: [...picks] };
  emit('wishOffer', { ids: [...picks] });
  return [...picks];
}

export function chooseWish(state, id) {
  state.run.wish = { items: [id], done: false, day: state.run.day };
  state.run.wishOffers = null;
}

export function isWished(state, id) {
  const w = state.run.wish;
  return !!w && !w.done && w.day === state.run.day && w.items.includes(id);
}

registerSystem({
  id: 'wishes',
  order: 70,
  onHour(state, hour) {
    if (state.phase !== 'post') return;
    if (hour === 8 && state.run.wishOffers?.day !== state.run.day && state.run.wish?.day !== state.run.day) offerWishes(state);
    if (hour === 13 && state.run.wishOffers?.day === state.run.day) chooseWish(state, state.run.wishOffers.ids[0]);
  },
});

export function canUseMentalToughness(state) {
  return !!getMods(state).mentalToughness && dailyCount(state, 'mentalToughness') < 1;
}

export function useMentalToughness(state) {
  if (!canUseMentalToughness(state)) return false;
  bumpDaily(state, 'mentalToughness');
  addStat(state, 'mor', 30, 'mentalToughness');
  emit('toast', { text: pickLang({ en: 'You pull yourself together. +30 Morale', zh: '你振作起来。心态+30' }), kind: 'good' });
  return true;
}

export { hourOfDay };
