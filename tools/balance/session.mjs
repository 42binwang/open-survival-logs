// @ts-check
// One balance session: a seeded run of the real sim on one difficulty, a bot playing it in 10-minute steps from the
// first hour of preparation until the survivor dies, the story ends or Day 100 is over. Along the way it records the
// food at home every morning, every horde and settlement, and checks save/load round trips at two points, three
// hours into the preparation (mid-trip, across the outbreak) and on a day drawn from the seed (5 … 24): the state is
// saved and loaded the way Continue does it (serialize, parse, bumpMods, ensureSystems), the original and the loaded
// copy play the same 24 hours, and their saved states must be identical. The session continues on the loaded copy.
// Any exception is a crash: the session ends and reports it.
import { createHash } from 'node:crypto';
import { BOTS } from './bots.mjs';
import { loadSim } from './sim.mjs';

export const STEP_SEC = 600;

/**
 * @typedef {object} SessionResult
 * @property {string} bot
 * @property {string} difficulty
 * @property {number} seed
 * @property {string} character
 * @property {number} days  days survived, as the survival record counts them: the day of death, else the last day played
 * @property {string} end  'dead' | 'ending' | 'alive' | 'crash'
 * @property {string | null} cause  deathCause() of src/sim/rebirth.js
 * @property {number[]} foodSat  satiety in food at home each morning, Day 1 on
 * @property {{ day: number, total: number, killed: number, breaches: number, doorMin: number, survived: boolean, final: boolean }[]} hordes
 * @property {number} points  planning points earned this loop
 * @property {{ at: string, ok: boolean, detail: string }[]} roundTrips
 * @property {{ start: number, days: number, alive: boolean, gotCold: boolean } | null} coldWave  the first cold wave of the run
 * @property {string | null} crash
 * @property {number} ms
 * @property {Record<string, unknown>} botNotes
 */

/** @param {Record<string, any>} S @param {any} state */
function foodAtHome(S, state) {
  let sat = 0;
  for (const id of S.furnActions.homeSources(state)) {
    for (const it of state.inventories[id]?.items || []) {
      const cfg = S.db.item(it.id);
      if (!cfg || cfg.cat !== S.db.CAT.FOOD || cfg.sat <= 0) continue;
      const servings = cfg.uses > 1 ? (it.uses ?? cfg.uses) : 1;
      sat += cfg.sat * servings * (it.qty || 1) * (it.left ?? 1);
    }
  }
  return Math.round(sat);
}

/** @param {Record<string, any>} S @param {any} state */
function hashState(S, state) {
  const s = JSON.parse(S.save.serialize(state));
  delete s.modsVer;
  return createHash('sha256').update(JSON.stringify(s)).digest('hex').slice(0, 16);
}

/** A save and Continue, as src/game.js adoptState does it. @param {Record<string, any>} S @param {any} state */
function reload(S, state) {
  const copy = JSON.parse(S.save.serialize(state));
  S.modifiers.bumpMods(copy);
  S.state.ensureSystems(copy);
  return copy;
}

/**
 * @param {{ bot: string, difficulty: string, seed: number, character?: string, days?: number }} opts
 * @returns {Promise<SessionResult>}
 */
export async function runSession({ bot: botId, difficulty, seed, character = 'wage', days = 100 }) {
  const t0 = performance.now();
  const S = await loadSim();
  const bot = /** @type {Record<string, import('./bots.mjs').Bot>} */ (BOTS)[botId];
  if (!bot) throw new Error(`no bot '${botId}'`);
  /** @type {SessionResult} */
  const res = { bot: botId, difficulty, seed, character, days: 0, end: 'alive', cause: null, foodSat: [], hordes: [], points: 0, roundTrips: [], coldWave: null, crash: null, ms: 0, botNotes: {} };
  let state = S.state.newGame({ seed, id: `balance-${difficulty}-${seed}`, character, difficulty, skipPrologue: true });
  state.meta.created = 0;
  state.ui.autonomy = true;
  const first = state.weather?.coldWaves?.find((/** @type {any} */ c) => c.first);
  if (first) res.coldWave = { start: first.start, days: first.days, alive: false, gotCold: false };
  const rtDay = 5 + (seed % 20);
  const start = state.clock.t;
  const day = () => S.time.dayNumber(state.clock);
  /** plays one step on a state */
  const step = (/** @type {any} */ st) => {
    bot.step(S, st);
    S.tick.tick(st, STEP_SEC);
  };
  /** saves, loads, plays both copies 24 h and compares; the session goes on with the loaded copy @param {string} at */
  const roundTrip = (at) => {
    const loaded = reload(S, state);
    for (let i = 0; i < 144; i++) {
      step(state);
      step(loaded);
    }
    const a = hashState(S, state);
    const b = hashState(S, loaded);
    res.roundTrips.push({ at, ok: a === b, detail: a === b ? `identical after 24 h (${a})` : `differs after 24 h: ${a} vs ${b}` });
    state = loaded;
  };
  let lastDay = -1;
  try {
    for (let guard = 0; guard < 200 * 144; guard++) {
      if (state.phase === 'dead' || state.phase === 'ending') break;
      if (state.phase === 'post' && day() > days) break;
      if (!res.roundTrips.length && state.clock.t - start >= 3 * 3600) {
        roundTrip('preparation +3 h');
        continue;
      }
      const cw = res.coldWave;
      if (cw && state.phase === 'post') {
        const d = day();
        if (d === cw.start) cw.alive = true;
        if (d >= cw.start && d < cw.start + cw.days && state.player.effects.cold) cw.gotCold = true;
      }
      if (state.phase === 'post' && day() !== lastDay) {
        lastDay = day();
        res.foodSat.push(foodAtHome(S, state));
        if (lastDay === rtDay && res.roundTrips.length < 2) {
          roundTrip(`Day ${rtDay}`);
          continue;
        }
      }
      step(state);
    }
  } catch (err) {
    res.end = 'crash';
    res.crash = `${/** @type {Error} */ (err).stack || err}`.split('\n').slice(0, 6).join('\n');
  }
  if (res.end !== 'crash') res.end = state.phase === 'dead' ? 'dead' : state.phase === 'ending' ? 'ending' : 'alive';
  res.cause = state.phase === 'dead' ? S.rebirth.deathCause(state) : null;
  res.days = state.phase === 'dead' ? state.run.deathDay ?? 0 : state.phase === 'pre' ? 0 : Math.min(days, day());
  for (const h of state.crises?.history || []) {
    if (h.type !== 'horde') continue;
    res.hordes.push({ day: h.day, total: h.total ?? 0, killed: h.killed ?? 0, breaches: h.breaches ?? 0, doorMin: h.doorMin ?? 1, survived: !!h.survived, final: !!h.final });
  }
  res.points = Math.round(state.run?.pointsEarned || 0);
  res.botNotes = state.run?.bot || {};
  res.ms = Math.round(performance.now() - t0);
  return res;
}
