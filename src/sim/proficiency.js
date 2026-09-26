// Five proficiency systems plus the defense level (Config_PlantLv / Config_ProductionLv thresholds;
// cooking, trapping, exploration and defense use comparable curves).
import { plantLevels, productionLevels } from '../data/db.js';
import { emit } from '../engine/bus.js';
import { getMods } from './modifiers.js';

const plantExp = plantLevels().map((r) => r.EXP); // Lv0..Lv5 exp to next
const craftExp = [0, ...productionLevels().map((r) => r.EXP)]; // Lv0..Lv5

export const PROF = {
  cook: { name: { en: 'Cooking', zh: '烹饪' }, need: [120, 600, 1800, 4500, 11000, 0], max: 5 },
  plant: { name: { en: 'Planting', zh: '种植' }, need: plantExp, max: 5 },
  craft: { name: { en: 'Crafting', zh: '制造' }, need: craftExp.map((v, i) => (i === 0 ? 100 : v)), max: 5 },
  trap: { name: { en: 'Trapping', zh: '陷阱' }, need: [100, 500, 1500, 4000, 9000, 0], max: 5 },
  explore: { name: { en: 'Exploration', zh: '探索' }, need: [100, 500, 1500, 4000, 9000, 0], max: 5 },
  defense: { name: { en: 'Defense', zh: '防御' }, need: [60, 300, 900, 2400, 6000, 0], max: 5 },
};

export const FIVE_SYSTEMS = ['cook', 'plant', 'craft', 'trap', 'explore'];

export function profLevel(state, key) {
  return state.progress.prof[key]?.lv ?? 0;
}

export function addProfExp(state, key, exp) {
  const p = state.progress.prof[key];
  const def = PROF[key];
  if (!p || !def || exp <= 0) return;
  const mult = key === 'plant' ? 1 + (getMods(state).plantExp || 0) : 1;
  p.exp += exp * mult;
  while (p.lv < def.max && def.need[p.lv] > 0 && p.exp >= def.need[p.lv]) {
    p.exp -= def.need[p.lv];
    p.lv += 1;
    emit('profUp', { key, lv: p.lv });
  }
  if (p.lv >= def.max) p.exp = 0;
  checkAllMax(state);
}

export function addProfLevels(state, key, n) {
  const p = state.progress.prof[key];
  const def = PROF[key];
  if (!p || !def) return;
  p.lv = Math.min(def.max, p.lv + n);
  p.exp = 0;
  emit('profUp', { key, lv: p.lv });
  checkAllMax(state);
}

function checkAllMax(state) {
  if (FIVE_SYSTEMS.every((k) => profLevel(state, k) >= PROF[k].max)) {
    state.progress.counters['prof.allmax'] = 1;
  }
}

export function plantLevelRow(state) {
  return plantLevels()[Math.min(5, profLevel(state, 'plant'))];
}

export function craftLevelRow(state) {
  const lv = Math.max(1, profLevel(state, 'craft'));
  return productionLevels()[Math.min(4, lv - 1)];
}
