// @ts-check
// Shared set-up of the achievement play-throughs (tests/achievements-play-*.test.js): a run started the way the title
// screen starts one (src/game.js startRun: it becomes game.state, so the live achievement wiring of
// src/meta/achievements.js evaluates it every game hour and on game events against a fresh global history), and small
// helpers that only advance the clock through the sim's own tick. Nothing here writes a field an achievement reads.
import { loadSim } from '../../tools/coverage/sim.mjs';

export const S = await loadSim();
// the balance bots (tools/balance/bots.mjs) also ask autonomy's food choice
S.suggest ??= await import('../../src/sim/suggest.js');
/** @type {any} */
export const G = await import('../../src/game.js');
export const HOUR = 3600;

/**
 * A new run through the title screen's New Game, with a fresh global history.
 * @param {{ character?: string, seed?: number, difficulty?: string, mode?: string }} [opts]
 * @returns {any}
 */
export function begin(opts = {}) {
  S.save._resetStorage();
  G.game.history = S.save.loadHistory();
  return G.startRun({ character: 'wage', seed: 7, difficulty: 'normal', skipPrologue: true, slot: `slot-play-${opts.seed ?? 7}`, ...opts });
}

/**
 * Tick the sim in `step` game seconds until `done()` or `max` game seconds have passed.
 * @param {any} s @param {() => boolean} done @param {{ step?: number, max?: number }} [o]
 */
export function until(s, done, { step = 600, max = 48 * HOUR } = {}) {
  for (let t = 0; t < max && !done() && s.phase !== 'dead' && s.phase !== 'ending'; t += step) S.tick.tick(s, step);
  return done();
}

/** Has game code awarded the achievement in the global history? @param {number} id */
export const awarded = (id) => !!G.game.history.achievements?.[id];

/** Let the achievement check that game events schedule (a zero timeout) run. */
export const settle = () => new Promise((r) => setTimeout(r, 0));

/**
 * Items for the survivor, put into the backpack by the sim's own inventory code (supplies the play-through needs,
 * not the achievement's condition).
 * @param {any} s @param {number} id @param {number} [n]
 * @returns {any[]}
 */
export function give(s, id, n = 1) {
  const bp = s.inventories[s.player.backpack];
  const out = [];
  for (let i = 0; i < n; i++) out.push(S.inventory.addItem(s, bp, id, { allowOverweight: true }));
  return out;
}
