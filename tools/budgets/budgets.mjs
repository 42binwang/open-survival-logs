// @ts-check
// The performance and size budgets (docs/QUALITY.md "Budgets", measured at 1920 × 1080 with 4× CPU throttling) and
// how a measurement is judged. A budget the runner could not measure is `unmeasured`, which fails the check like a
// miss: nothing passes without a number.

const MB = 1024 * 1024;
const GB = 1024 * MB;

/**
 * Frame times are counted in display frames at 60 Hz: an interval of `v` ms spans ceil((v − 1) / 16.667) vsync
 * periods, at least 1, so timestamp jitter up to 1 ms over a period (16.6–17.6 ms) never reads as a miss while
 * anything longer does. The §10 frame budgets are those counts: p95 ≤ 16.7 ms is one display frame, worst ≤ 33 ms
 * is two.
 */
export const DISPLAY_HZ = 60;
const PERIOD_MS = 1000 / DISPLAY_HZ;
export const JITTER_MS = 1;

/** @param {number} v  one rAF interval in ms @returns {number} display frames */
export const framesOf = (v) => Math.max(1, Math.ceil((v - JITTER_MS) / PERIOD_MS));

/**
 * @param {number[]} intervals  rAF intervals in ms
 * @returns {{ p95: number, worst: number, missed: number, hz: number }}  p95 and worst in display frames
 */
export function displayFrames(intervals) {
  const n = intervals.map(framesOf);
  const med = percentile(intervals, 50);
  return { p95: percentile(n, 95), worst: n.length ? Math.max(...n) : NaN, missed: n.filter((k) => k > 1).length, hz: 1000 / med };
}

/**
 * @typedef {{ id: string, label: string, max: number, unit: 'ms' | 'frames' | 'calls' | 'bytes', how: string }} Budget
 * @typedef {{ id: string, value: number | null, detail: string }} Measurement
 * @typedef {Budget & { value: number | null, status: 'pass' | 'fail' | 'unmeasured', detail: string }} Result
 */

/** @type {readonly Budget[]} */
export const BUDGETS = Object.freeze([
  { id: 'frameP95', label: 'frame time p95', max: 1, unit: 'frames', how: '≤ 16.7 ms: rAF intervals in 60 Hz display frames, the worst scenario' },
  { id: 'frameWorst', label: 'worst frame', max: 2, unit: 'frames', how: '≤ 33 ms: the longest rAF interval in display frames, the worst scenario' },
  { id: 'drawCalls', label: 'draw calls per frame', max: 500, unit: 'calls', how: 'renderer.stats().drawCalls sampled every frame, the largest in any scenario' },
  { id: 'gpuMemory', label: 'GPU memory', max: 512 * MB, unit: 'bytes', how: 'renderer.stats().gpuBytes (WP-P0-14b) sampled every frame, the largest in any scenario' },
  { id: 'initialDownload', label: 'initial download', max: 5 * MB, unit: 'bytes', how: 'bytes received (encoded) at 10 Mbit/s until the title screen shows, fresh profile' },
  { id: 'coldInteractive', label: 'cold first-interactive', max: 8000, unit: 'ms', how: 'navigation to the first home-scene frame after renderer.ready (New Game and Start clicked when enabled), fresh profile, 10 Mbit/s, 40 ms RTT' },
  { id: 'warmInteractive', label: 'warm first-interactive', max: 3000, unit: 'ms', how: 'the same, the persistent profile relaunched' },
  { id: 'shippedAssets', label: 'shipped size (dist/)', max: 2 * GB, unit: 'bytes', how: 'every file of the production build' },
  { id: 'sim100', label: '100-day headless sim', max: 60000, unit: 'ms', how: 'node tools/budgets/sim100.mjs wall time' },
]);

/** @param {number} v @param {Budget['unit']} unit */
export function formatValue(v, unit) {
  if (unit === 'bytes') return v >= GB ? `${(v / GB).toFixed(2)} GB` : v >= MB ? `${(v / MB).toFixed(2)} MB` : `${(v / 1024).toFixed(0)} KB`;
  if (unit === 'ms') return v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${v.toFixed(1)} ms`;
  if (unit === 'frames') return `${v} frame${v === 1 ? '' : 's'} (${(v * PERIOD_MS).toFixed(1)} ms)`;
  return String(Math.round(v));
}

/**
 * p-th percentile (0 … 100), nearest rank.
 * @param {number[]} values
 * @param {number} p
 */
export function percentile(values, p) {
  if (!values.length) return NaN;
  const a = [...values].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.max(0, Math.ceil((p / 100) * a.length) - 1))];
}

/**
 * The draw-call and GPU-memory measurements from the scenarios' per-frame `stats()` samples. Every scenario must
 * report a positive number: a scenario with no stats(), or whose largest value is 0 (what the contract says a renderer
 * that cannot measure reports), leaves the budget unmeasured, even when another scenario reports one.
 * @param {{ id: string, renderer?: string, statsFrames: number, drawCalls: number | null, gpuBytes: number | null }[]} frames
 * @param {string} [blocked]  why the scenarios cannot stand (then both are unmeasured)
 * @returns {Measurement[]}
 */
export function statsMeasurements(frames, blocked = '') {
  if (blocked) return [{ id: 'drawCalls', value: null, detail: blocked }, { id: 'gpuMemory', value: null, detail: blocked }];
  if (!frames.length) return [{ id: 'drawCalls', value: null, detail: 'no scenario ran' }, { id: 'gpuMemory', value: null, detail: 'no scenario ran' }];
  /** @type {Measurement[]} */
  const out = [];
  for (const [id, key, what] of /** @type {const} */ ([['drawCalls', 'drawCalls', 'draw calls'], ['gpuMemory', 'gpuBytes', 'GPU bytes']])) {
    const none = frames.filter((f) => !f.statsFrames);
    const zero = frames.filter((f) => f.statsFrames && !(Number(f[key]) > 0));
    if (none.length) out.push({ id, value: null, detail: `the '${none[0].renderer}' renderer reported no stats() in ${none.map((f) => f.id).join(', ')} (stats() is optional in src/contracts/render.js and the Canvas renderer has none; the three.js renderer must implement it)` });
    else if (zero.length) out.push({ id, value: null, detail: `stats() reported 0 ${what} in every frame of ${zero.map((f) => f.id).join(', ')}: 0 is no measurement` });
    else {
      const worst = frames.reduce((a, b) => (Number(b[key]) > Number(a[key]) ? b : a));
      out.push({ id, value: Number(worst[key]), detail: `largest in any frame of ${frames.length} scenarios: ${worst.id}` });
    }
  }
  return out;
}

/**
 * Judges measurements against the budgets.
 * @param {Measurement[]} measured
 * @returns {{ ok: boolean, results: Result[], summary: string, problems: string[] }}
 */
export function evaluate(measured) {
  const by = new Map(measured.map((m) => [m.id, m]));
  /** @type {Result[]} */
  const results = BUDGETS.map((b) => {
    const m = by.get(b.id);
    if (!m || m.value == null || !Number.isFinite(m.value)) return { ...b, value: null, status: 'unmeasured', detail: m?.detail || 'not measured' };
    if ((b.unit === 'calls' || b.unit === 'bytes') && m.value <= 0) return { ...b, value: null, status: 'unmeasured', detail: `${m.detail}: reported ${m.value}, which is no measurement` };
    return { ...b, value: m.value, status: m.value <= b.max ? 'pass' : 'fail', detail: m.detail };
  });
  const problems = results
    .filter((r) => r.status !== 'pass')
    .map((r) => (r.status === 'unmeasured' ? `${r.label}: unmeasured (${r.detail})` : `${r.label}: ${formatValue(/** @type {number} */ (r.value), r.unit)} over the ${formatValue(r.max, r.unit)} budget (${r.detail})`));
  const n = (/** @type {string} */ s) => results.filter((r) => r.status === s).length;
  const parts = results.map((r) => `${r.id} ${r.value == null ? 'unmeasured' : formatValue(r.value, r.unit)}${r.status === 'fail' ? ' ✖' : ''}`);
  const summary = `${n('pass')} of ${results.length} budgets met, ${n('fail')} missed, ${n('unmeasured')} unmeasured: ${parts.join(', ')}`;
  return { ok: problems.length === 0, results, summary, problems };
}
