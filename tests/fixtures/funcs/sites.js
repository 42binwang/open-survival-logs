// @ts-check
// Furniture functions at the exploration sites: a visit to a site (a crowbar, lockpicks and a tin-can noisemaker in
// the backpack, the dead lured away), then every interaction the site offers on a piece, each on its own copy of the
// visit, run the way the player queues it (queueFixture) until the action completes. The record names the function
// the completed action carried (funcKey) and what it did.
import { tick } from '../../../src/sim/tick.js';
import { isIdle } from '../../../src/sim/actions.js';
import * as X from '../../../src/sim/explore.js';
import { ITEM } from '../../../src/content/sites.js';
import { dayStartT } from '../../../src/sim/time.js';
import { on } from '../../../src/engine/bus.js';
import { run, give, keepAlive, countItems, HOUR, CHARACTERS } from './harness.js';

/** Tick until idle; a quiet visit: the dead that shamble in are kept off the survivor. @param {any} s @param {number} max */
function runUntilIdle(s, max) {
  for (let t = 0; t < max && !isIdle(s) && s.phase !== 'dead'; t += 60) {
    const r = X.exploreRun(s);
    if (r) r.zombies = r.zombies.filter((/** @type {any} */ z) => z.human);
    tick(s, 60);
    if (s.player.stats.sta < 30 || s.player.stats.sat < 30) keepAlive(s);
  }
  return isIdle(s);
}

/**
 * Arrive at a site. @param {string} site @param {number} [seed]
 * @returns {any} the run at the site
 */
export function arrive(site, seed = 1) {
  const s = run(CHARACTERS[seed % CHARACTERS.length], 'post', 4000 + seed * 31 + site.length);
  const day = Math.max(2, X.exploreState(s).unlockDay[site]);
  s.clock.t = dayStartT(s.clock, day) + 9 * HOUR;
  s.run.day = day;
  keepAlive(s);
  give(s, ITEM.crowbar, 8);
  give(s, ITEM.lockpick, 8);
  give(s, X.NOISEMAKER, 1);
  const start = /** @type {any} */ (X.startExploration(s, site));
  if (!start.ok) throw new Error(`could not leave for ${site}: ${start.reason}`);
  for (let t = 0; t < 4 * HOUR && X.exploreRun(s)?.phase !== 'site'; t += 60) tick(s, 60);
  if (X.exploreRun(s)?.phase !== 'site') throw new Error(`never arrived at ${site}`);
  if (X.canThrowLure(s) === true) X.throwLure(s);
  runUntilIdle(s, HOUR);
  return s;
}

/**
 * Every interaction on the site's pieces, obstacles first (each pushed aside in the visit itself, the reachable ones
 * first), the rest each on a copy of the visit.
 * @param {any} s  a run at the site (arrive)
 * @param {Set<number>} [pieces]  only these config pieces (obstacles are pushed aside all the same)
 * @returns {{ cfg: number, fixture: string, mode: string, done: any, funcs: number[], up: number[], down: number[], stats: any[] }[]}
 */
export function useEveryFixture(s, pieces) {
  const r = X.exploreRun(s);
  const out = [];
  const pending = r.fixtures.filter((/** @type {any} */ fx) => fx.kind === 'block');
  const rest = r.fixtures.filter((/** @type {any} */ fx) => fx.kind !== 'block');
  const next = () => {
    if (!pending.length) return rest.shift();
    const i = pending.findIndex((/** @type {any} */ fx) => X.approachTile(s, fx.id));
    return pending.splice(Math.max(0, i), 1)[0];
  };
  for (let fx = next(); fx; fx = next()) {
    if (typeof fx.cfg !== 'number') continue;
    if (pieces && fx.kind !== 'block' && !pieces.has(fx.cfg)) continue;
    for (const opt of X.fixtureOptions(s, fx.id)) {
      const t = fx.kind === 'block' ? s : structuredClone(s);
      out.push({ cfg: fx.cfg, fixture: fx.id, mode: opt.mode, ...interact(t, fx.id, opt.mode) });
      if (opt.mode !== 'take' && fx.kind === 'box') {
        // what the survivor could not carry stays in the container: taken afterwards
        const left = X.fixtureOptions(t, fx.id).find((o) => o.mode === 'take');
        if (left) out.push({ cfg: fx.cfg, fixture: fx.id, mode: 'take', ...interact(t, fx.id, 'take') });
      }
    }
  }
  return out;
}

/** @param {any} t @param {string} fid @param {string} mode */
function interact(t, fid, mode) {
  /** @type {any} */
  let done = null;
  /** @type {number[]} */
  const funcs = [];
  /** @type {any[]} */
  const stats = [];
  const before = countItems(t);
  const offs = [on('actionDone', (/** @type {any} */ a) => {
      if (a?.fixture !== fid) return;
      done ||= a;
      if (typeof a.funcKey === 'number') funcs.push(a.funcKey);
    }), on('stat', (/** @type {any} */ e) => stats.push(e))];
  try {
    // a zombie that grabs the survivor drops the action: shake it off and go again
    for (let attempt = 0; attempt < 4 && !done; attempt++) {
      keepAlive(t);
      if (!X.queueFixture(t, fid, mode)) break;
      runUntilIdle(t, 2 * HOUR);
    }
  } finally {
    for (const off of offs) off();
  }
  const after = countItems(t);
  return {
    done,
    funcs,
    up: [...after].filter(([id, n]) => n > (before.get(id) || 0)).map(([id]) => id),
    down: [...before].filter(([id, n]) => n > (after.get(id) || 0)).map(([id]) => id),
    stats,
  };
}
