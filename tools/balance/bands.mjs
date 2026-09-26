// @ts-check
// The balance bands of docs/BALANCE.md, as the balance runner checks them. Every band states where its number comes
// from (`source`: a research file and line, or the sim constant it follows) and the first phase whose balance run must
// hold it (`from`). A band that is outside, or cannot be measured (its bot did not play, too few runs reached the
// event), is a problem: the run fails. A band changes only with an approved line in docs/balance/bands-log.jsonl
// (tools/balance/check.mjs ledgers checks the two agree and that the log only grows). Frozen after P0 like every gate
// threshold (docs/QUALITY.md §3).
import { DIFFICULTIES as CONFIG } from '../../src/content/difficulty.js';

export const DIFFICULTIES = Object.freeze(['relaxed', 'normal', 'hard', 'outOfAmmo']);
/** Satiety a day costs the survivor: 2 per waking hour for 16 hours, 1 asleep for 8 (src/sim/stats.js:13-14). */
export const SAT_PER_DAY = 40;
/** Fewer runs than this reaching an event leave a share band unmeasured. */
export const MIN_RUNS = 10;
/** The phases in order, for `from`. */
const PHASE = (/** @type {string} */ p) => Number(p.slice(1));

/**
 * @typedef {import('./summary.mjs').Summary} Summary
 * @typedef {Record<string, Record<string, Summary>>} ByBot  bot -> difficulty -> summary
 * @typedef {{ value: number | null, detail: string }} Measured  value null = unmeasured, detail says why
 * @typedef {object} Band
 * @property {string} id
 * @property {string} what
 * @property {string} from  'P0', 'P1', …
 * @property {string} source  file:line (or lines) of the evidence
 * @property {number} min
 * @property {number} max
 * @property {(by: ByBot) => Measured} measure
 */

/** @param {ByBot} by @param {string} bot @param {string} d @returns {Summary | null} */
const s = (by, bot, d) => by[bot]?.[d] ?? null;
/** @param {string} bot @param {string} d */
const missing = (bot, d) => ({ value: null, detail: `no ${bot} sessions on ${d}` });

/**
 * A share of runs, unmeasured when fewer than MIN_RUNS runs reached the event.
 * @param {{ n: number, k: number } | null | undefined} x
 * @param {string} what
 */
const share = (x, what) => (!x || x.n < MIN_RUNS ? { value: null, detail: `only ${x?.n ?? 0} run(s) reached ${what} (need ${MIN_RUNS})` } : { value: x.k / x.n, detail: `${x.k} of ${x.n}` });

/** @param {string} bot @param {string} d @param {number} day @param {number} min */
const hordeBand = (bot, d, day, min, source = 'https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359', from = 'P0') => ({
  id: `${bot}-horde${day}-${d}`,
  what: `${bot}, ${d}: share of runs facing the Day ${day} horde that survive it`,
  from,
  source,
  min,
  max: 1,
  measure: (/** @type {ByBot} */ by) => {
    const x = s(by, bot, d);
    return x ? share(x.hordes[day] && { n: x.hordes[day].faced, k: x.hordes[day].survived }, `the Day ${day} horde`) : missing(bot, d);
  },
});

/** @type {readonly Band[]} */
export const BANDS = Object.freeze([
  // ---------------------------------------------------------------------------------- P0: what the P0 bots test
  ...DIFFICULTIES.map((d) => ({
    id: `idle-first-week-${d}`,
    what: `idle, ${d}: median days survived (doing nothing ends within the first week)`,
    from: 'P0',
    source: 'decided (WP-P0-11): the starting pantry is empty and doing nothing buys no food, so autonomy alone starves within a week',
    min: 0,
    max: 7,
    measure: (/** @type {ByBot} */ by) => (s(by, 'idle', d) ? { value: s(by, 'idle', d)?.days.median ?? null, detail: 'median' } : missing('idle', d)),
  })),
  ...['prepper', 'forager'].map((bot) => ({
    id: `${bot}-difficulty-order`,
    what: `${bot}: the smallest gap between the median days of Relaxed > Normal > Hard > Out of Ammo and Food`,
    from: 'P0',
    source: 'https://store.steampowered.com/news/app/4164790',
    min: 2,
    max: Infinity,
    measure: (/** @type {ByBot} */ by) => {
      const med = DIFFICULTIES.map((d) => s(by, bot, d)?.days.median);
      if (med.some((m) => m == null)) return missing(bot, 'every difficulty');
      const gaps = med.slice(1).map((m, i) => /** @type {number} */ (med[i]) - /** @type {number} */ (m));
      return { value: Math.min(...gaps), detail: `medians ${med.join(' > ')}` };
    },
  })),
  ...['relaxed', 'hard', 'outOfAmmo'].map((d) => ({
    id: `prepper-food-follows-funds-${d}`,
    what: `prepper, ${d}: Day-1 food relative to Normal, divided by the funds relative to Normal, minus 1`,
    from: 'P0',
    source: 'src/content/difficulty.js (funds)',
    min: -0.1,
    max: 0.1,
    measure: (/** @type {ByBot} */ by) => {
      const a = s(by, 'prepper', d)?.food[1];
      const n = s(by, 'prepper', 'normal')?.food[1];
      if (a == null || n == null || !n) return missing('prepper', `${d} and normal`);
      const want = /** @type {any} */ (CONFIG)[d].funds / CONFIG.normal.funds;
      return { value: a / n / want - 1, detail: `food ×${(a / n).toFixed(2)} vs funds ×${want.toFixed(2)}` };
    },
  })),
  {
    id: 'prepper-food-draw-normal',
    what: 'prepper, Normal: median daily draw on the food at home, in days of satiety (1 = what the survivor needs)',
    from: 'P0',
    source: 'src/sim/stats.js:13-14',
    min: 0.9,
    max: 1.5,
    measure: (by) => {
      const x = s(by, 'prepper', 'normal');
      return x ? (Number.isFinite(x.draw) ? { value: x.draw / SAT_PER_DAY, detail: `${x.draw.toFixed(0)} satiety a day` } : { value: null, detail: 'no two consecutive days with food' }) : missing('prepper', 'normal');
    },
  },
  // Out of Ammo and Food is left to the defender (P1): its funds and daily draw hold a pure hoard to 21–23 days, and
  // no research says a hoarder reaches the Day 25 horde there
  // the forager's Hard floor is its own (docs/balance/forager.md): line 77's door repairs hold for it as for the
  // prepper, and the source gives no survival rate for a survivor who has spent Life at the sites (owner decision)
  ...['prepper', 'forager'].flatMap((bot) => [hordeBand(bot, 'relaxed', 25, 0.9), hordeBand(bot, 'normal', 25, 0.9), hordeBand(bot, 'hard', 25, bot === 'forager' ? 0.5 : 0.75)]),
  ...DIFFICULTIES.map((d) => ({
    id: `forager-gain-${d}`,
    what: `${d}: forager median days survived minus the prepper's (scavenging feeds, it does not replace farming)`,
    from: 'P0',
    source: 'https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359',
    // line 81 (a pile of food at the supermarket) predates patch 8/13; line 82: since then scavenging yields "greatly
    // reduced" and the author feeds by trading. On the harsh difficulties the source supports only "does not cost days"
    min: d === 'hard' || d === 'outOfAmmo' ? -1 : 2,
    max: 14,
    measure: (/** @type {ByBot} */ by) => {
      const f = s(by, 'forager', d)?.days.median;
      const p = s(by, 'prepper', d)?.days.median;
      return f == null || p == null ? missing('forager and prepper', d) : { value: f - p, detail: `${f} vs ${p}` };
    },
  })),
  {
    id: 'cold-first-wave-day',
    what: 'every session: median start day of the first cold wave ("around Day 35"; one run records Day 26)',
    from: 'P0',
    source: 'https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359; https://steamcommunity.com/sharedfiles/filedetails/?id=3794377867',
    min: 26,
    max: 40,
    measure: (by) => {
      const x = s(by, 'prepper', 'normal');
      return x && Number.isFinite(x.cold.startMedian) ? { value: x.cold.startMedian, detail: 'prepper, Normal' } : missing('prepper', 'normal');
    },
  },
  ...['normal', 'relaxed'].map((d) => ({
    id: `cold-unheated-${d}`,
    what: `prepper (no heating), ${d}: share of runs alive when the first cold wave starts that get cold during it`,
    from: 'P0',
    source: 'https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359; https://steamcommunity.com/sharedfiles/filedetails/?id=3786657132',
    min: 0.5,
    max: 1,
    measure: (/** @type {ByBot} */ by) => {
      const x = s(by, 'prepper', d);
      return x ? share({ n: x.cold.alive, k: x.cold.gotCold }, 'the first cold wave alive') : missing('prepper', d);
    },
  })),
  ...['relaxed', 'hard', 'outOfAmmo'].map((d) => ({
    id: `prepper-points-follow-mult-${d}`,
    what: `prepper, ${d}: planning points per day relative to Normal, divided by the points multiplier relative to Normal, minus 1`,
    from: 'P0',
    source: 'src/content/difficulty.js (pointsMult)',
    min: -0.2,
    max: 0.2,
    measure: (/** @type {ByBot} */ by) => {
      const a = s(by, 'prepper', d)?.pointsPerDay;
      const n = s(by, 'prepper', 'normal')?.pointsPerDay;
      if (a == null || n == null || !n) return missing('prepper', `${d} and normal`);
      const want = /** @type {any} */ (CONFIG)[d].pointsMult / CONFIG.normal.pointsMult;
      return { value: a / n / want - 1, detail: `points a day ×${(a / n).toFixed(2)} vs multiplier ×${want.toFixed(2)}` };
    },
  })),
  // ---------------------------------------------------------------------------------- P1: the full strategy
  // Steam global achievement rates (https://steamcommunity.com/stats/4164790/achievements) as conditional survival, a floor 0.15 under the
  // players' rate and no ceiling (players also stop playing, and a competent bot should beat their average), for a
  // bot that cooks, farms, trades, sets traps, upgrades doors and heats (the `defender`, a P1 deliverable).
  ...[
    ['30-50', 30, 50, 'https://steamcommunity.com/stats/4164790/achievements', 0.82],
    ['50-70', 50, 70, 'https://steamcommunity.com/stats/4164790/achievements', 0.82],
    ['70-88', 70, 88, 'https://steamcommunity.com/stats/4164790/achievements', 0.7],
  ].map(([name, a, b, source, rate]) => ({
    id: `defender-reach-${name}-normal`,
    what: `defender, Normal: share of runs alive on Day ${a} still alive on Day ${b}`,
    from: 'P1',
    source: /** @type {string} */ (source),
    min: Math.round((Number(rate) - 0.15) * 100) / 100,
    max: 1,
    measure: (/** @type {ByBot} */ by) => {
      const x = s(by, 'defender', 'normal');
      return x ? share(x.reach(Number(a), Number(b)), `Day ${a}`) : missing('defender', 'normal');
    },
  })),
  hordeBand('defender', 'normal', 25, 0.9, 'https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359', 'P1'),
  hordeBand('defender', 'outOfAmmo', 25, 0.75, 'https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359', 'P1'),
  hordeBand('defender', 'normal', 35, 0.75, 'https://steamcommunity.com/stats/4164790/achievements', 'P1'),
  hordeBand('defender', 'normal', 49, 0.75, 'https://steamcommunity.com/stats/4164790/achievements; https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359', 'P1'),
  hordeBand('defender', 'normal', 87, 0.55, 'https://steamcommunity.com/stats/4164790/achievements', 'P1'),
  ...[
    ['zombies', 0.3, 1, 'https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359'],
    ['illness', 0, 0.2, 'https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359'],
    ['cold', 0, 0.1, 'decided (WP-P0-11): the defender heats the house through every cold wave (its strategy), so cold kills it rarely'],
  ].map(([cause, min, max, source]) => ({
    id: `defender-deaths-${cause}-normal`,
    what: `defender, Normal: share of deaths by ${cause}`,
    from: 'P1',
    source: /** @type {string} */ (source),
    min: Number(min),
    max: Number(max),
    measure: (/** @type {ByBot} */ by) => {
      const x = s(by, 'defender', 'normal');
      return x ? share({ n: x.deaths, k: x.causes[/** @type {string} */ (cause)] || 0 }, 'a death') : missing('defender', 'normal');
    },
  })),
]);

/**
 * Every band the phase requires, measured.
 * @param {ByBot} by
 * @param {string} phase
 */
export function evaluateBands(by, phase) {
  return BANDS.map((b) => {
    const required = PHASE(b.from) <= PHASE(phase);
    const m = b.measure(by);
    const state = m.value == null ? 'unmeasured' : m.value >= b.min && m.value <= b.max ? 'inside' : 'outside';
    return { id: b.id, what: b.what, from: b.from, source: b.source, min: b.min, max: b.max, value: m.value, detail: m.detail, state, required };
  });
}
