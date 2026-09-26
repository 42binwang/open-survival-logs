// @ts-check
// The measured values of one bot on one difficulty, from its sessions (what the bands in ./bands.mjs read).

/** @typedef {import('./session.mjs').SessionResult} SessionResult */
/** @typedef {ReturnType<typeof summarize>} Summary */

import { SAT_PER_DAY } from './bands.mjs';

/** Horde days of the story schedule (src/sim/horde.js STORY_HORDES) and Day 100. */
export const MILESTONES = Object.freeze([7, 15, 25, 35, 49, 58, 66, 76, 87, 100]);
export const FOOD_DAYS = [1, 7, 14, 21, 28, 35, 49];

/** @param {number[]} v @param {number} p nearest-rank percentile, 0 … 100 */
export function pct(v, p) {
  if (!v.length) return NaN;
  const a = [...v].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.max(0, Math.ceil((p / 100) * a.length) - 1))];
}
/** @param {number[]} v */
const median = (v) => {
  if (!v.length) return NaN;
  const a = [...v].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/**
 * The measured values of one bot on one difficulty.
 * @param {SessionResult[]} runs
 */
export function summarize(runs) {
  const days = runs.map((r) => r.days);
  const deaths = runs.filter((r) => r.end === 'dead');
  /** @type {Record<string, number>} */
  const causes = {};
  for (const r of deaths) causes[r.cause || '?'] = (causes[r.cause || '?'] || 0) + 1;
  /** @param {number} d */
  const horde = (d) => {
    const reached = runs.filter((r) => r.days >= d || r.hordes.some((h) => h.day === d));
    const faced = reached.map((r) => r.hordes.find((h) => h.day === d)).filter((h) => h != null);
    return { reached: reached.length, faced: faced.length, survived: faced.filter((h) => h.survived).length, breached: faced.filter((h) => h.breaches > 0).length };
  };
  const hordes = Object.fromEntries(MILESTONES.filter((d) => d < 100).map((d) => [d, horde(d)]));
  const food = Object.fromEntries(FOOD_DAYS.map((d) => [d, median(runs.filter((r) => r.foodSat.length >= d).map((r) => r.foodSat[d - 1] / SAT_PER_DAY))]));
  // the day-to-day draw on the food at home while there is food on both mornings (purchases and loot excluded)
  const draws = runs
    .map((r) => median(r.foodSat.slice(1).map((v, i) => r.foodSat[i] - v).filter((x, i) => x >= 0 && r.foodSat[i] > 0 && r.foodSat[i + 1] > 0)))
    .filter(Number.isFinite);
  const waves = runs.map((r) => r.coldWave).filter((c) => c != null);
  return {
    n: runs.length,
    days: { min: Math.min(...days), p10: pct(days, 10), median: median(days), p90: pct(days, 90), max: Math.max(...days) },
    alive: Object.fromEntries(MILESTONES.map((d) => [d, runs.filter((r) => r.days >= d && !(r.days === d && r.end === 'dead')).length / (runs.length || 1)])),
    deaths: deaths.length,
    causes,
    food,
    hordes,
    points: { p10: pct(runs.map((r) => r.points), 10), median: median(runs.map((r) => r.points)), p90: pct(runs.map((r) => r.points), 90) },
    roundTrips: { checked: runs.reduce((a, r) => a + r.roundTrips.length, 0), ok: runs.reduce((a, r) => a + r.roundTrips.filter((t) => t.ok).length, 0) },
    crashes: runs.filter((r) => r.end === 'crash').length,
    ms: median(runs.map((r) => r.ms)),
    draw: median(draws),
    pointsPerDay: median(runs.map((r) => r.points / Math.max(1, r.days))),
    cold: {
      startMedian: median(waves.map((c) => c.start)),
      alive: waves.filter((c) => c.alive).length,
      gotCold: waves.filter((c) => c.alive && c.gotCold).length,
    },
    /** runs alive on Day a (or still playing), and how many of them are alive on Day b @param {number} a @param {number} b */
    reach: (a, b) => {
      const at = runs.filter((r) => r.days > a || (r.days === a && r.end !== 'dead'));
      return { n: at.length, k: at.filter((r) => r.days > b || (r.days === b && r.end !== 'dead')).length };
    },
  };
}

