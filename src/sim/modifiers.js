// Aggregates every multiplier that shapes the simulation: abilities (Survival Log), planning cards,
// character traits and difficulty. Cached per state and invalidated with bumpMods(state).
import { ABILITY_BY_ID } from '../content/abilities.js';
import { CARD_BY_ID } from '../content/planningCards.js';
import { CHARACTERS } from '../content/characters.js';

export function baseMods() {
  return {
    satDecay: 1,
    morDecay: 1,
    staDecay: 1,
    staCost: 1,
    eatSat: 1,
    restGain: 1,
    sleepDay: 1,
    sleepNight: 1,
    maxAdd: { sat: 0, sta: 0, mor: 0, life: 0 },
    settlementDiscount: 0,
    bulkDiscount: 0,
    shopDiscount: 0,
    carryKg: 0,
    pointsPerDay: 0,
    startMoney: 0,
    prepHours: 0,
    fridgeMult: 1,
    roomSpoil: 1,
    batteryMult: 1,
    moveMult: 1,
    lightSleeper: 0,
    mentalToughness: 0,
    craftPerfect: 0,
    craftStamina: 1,
    cookQuality: 0,
    growMult: 1,
    plantYield: 1,
    plantPerfect: 0,
    repairMult: 1,
    searchSpeed: 1,
    lootMult: 1,
    tradeQuota: 0,
    scavengeQuota: 0,
    fuelSlots: 0,
    storageMult: 1,
    trapOdds: 1,
    zombieHp: 1,
    zombieCount: 1,
    decay: 1,
    supply: 1,
    weatherExtreme: 1,
    highlightLoot: 0,
    molotov: 0,
    recipes: [],
  };
}

function applyDelta(m, delta, times = 1) {
  for (const [k, v] of Object.entries(delta)) {
    if (k === 'maxAdd') {
      for (const [s, n] of Object.entries(v)) m.maxAdd[s] = (m.maxAdd[s] || 0) + n * times;
    } else if (k === 'recipes') {
      m.recipes.push(...v);
    } else if (typeof v === 'number') {
      m[k] = (m[k] ?? 0) + v * times;
    } else {
      m[k] = v;
    }
  }
}

export function computeMods(state) {
  const m = baseMods();
  const abil = state.loop?.abilities || {};
  for (const [id, lv] of Object.entries(abil)) {
    const def = ABILITY_BY_ID[id];
    if (def && lv > 0) applyDelta(m, def.per, lv);
  }
  for (const id of state.run?.cards || []) {
    const def = CARD_BY_ID[id];
    if (def?.mods) applyDelta(m, def.mods, 1);
  }
  const ch = CHARACTERS[state.meta?.character];
  if (ch?.mods) applyDelta(m, ch.mods, 1);
  const diff = state.meta?.difficulty;
  if (diff) {
    m.zombieHp *= diff.zombieStrength ?? 1;
    m.zombieCount *= diff.zombieStrength ?? 1;
    m.decay *= diff.decay ?? 1;
    m.supply *= diff.supply ?? 1;
    m.weatherExtreme *= diff.extremeWeather ?? 1;
  }
  m.satDecay = Math.max(0.2, m.satDecay);
  m.morDecay = Math.max(0.2, m.morDecay);
  m.staCost = Math.max(0.3, m.staCost);
  m.fridgeMult = Math.max(0.2, m.fridgeMult);
  m.roomSpoil = Math.max(0.3, m.roomSpoil);
  return m;
}

export function getMods(state) {
  if (!state._mods || state._modsVer !== state.modsVer) {
    state._mods = computeMods(state);
    state._modsVer = state.modsVer;
  }
  return state._mods;
}

export function bumpMods(state) {
  state.modsVer = (state.modsVer || 0) + 1;
}
