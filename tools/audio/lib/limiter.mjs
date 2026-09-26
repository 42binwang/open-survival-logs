// @ts-check
// Offline true-peak limiter and loudness normalization. The whole signal is known, so the gain curve is computed in
// two passes: backwards (the gain starts falling `attack` seconds before a peak) and forwards (hold, then an
// exponential release). Both passes only ever lower the gain below what each true-peak sample needs, so the result
// never exceeds the ceiling on the oversampled estimate; normalize() iterates until the target is met.

import { SR, dbToGain, scale } from './dsp.mjs';
import { integratedLoudness, truePeak, truePeakEnvelope } from './loudness.mjs';

/**
 * @param {Float32Array[]} chans  modified in place
 * @param {{ ceilingDb?: number, attack?: number, hold?: number, release?: number, sr?: number }} [o]
 * @returns {{ maxReductionDb: number }}
 */
export function limit(chans, o = {}) {
  const sr = o.sr ?? SR;
  const c = dbToGain(o.ceilingDb ?? -1.5);
  const env = truePeakEnvelope(chans);
  const n = env.length;
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) need[i] = env[i] > c ? c / env[i] : 1;
  const ka = Math.exp(-1 / ((o.attack ?? 0.002) * sr));
  const back = new Float32Array(n);
  let a = 1;
  for (let i = n - 1; i >= 0; i--) {
    a = Math.min(need[i], 1 - (1 - a) * ka);
    back[i] = a;
  }
  const kr = Math.exp(-1 / ((o.release ?? 0.12) * sr));
  const holdN = Math.round((o.hold ?? 0.01) * sr);
  let g = 1;
  let hold = 0;
  let minG = 1;
  for (let i = 0; i < n; i++) {
    if (back[i] < g) {
      g = back[i];
      hold = holdN;
    } else if (hold > 0) {
      hold--;
    } else {
      g = Math.min(back[i], 1 - (1 - g) * kr);
    }
    if (g < minG) minG = g;
    for (const ch of chans) ch[i] *= g;
  }
  return { maxReductionDb: 20 * Math.log10(minG) };
}

/**
 * Limits a seamless loop as the circle it is: the end is limited knowing the start follows and vice versa (the
 * loop is padded with its own tail and head, limited, and the middle kept), so the gain never steps at the seam.
 * @param {Float32Array[]} chans  modified in place
 * @param {{ ceilingDb?: number, attack?: number, hold?: number, release?: number, sr?: number }} [o]
 */
export function limitCircular(chans, o = {}) {
  const sr = o.sr ?? SR;
  const n = chans[0].length;
  const pad = Math.min(n, Math.round(0.6 * sr));
  const ext = chans.map((ch) => {
    const x = new Float32Array(n + 2 * pad);
    x.set(ch.subarray(n - pad), 0);
    x.set(ch, pad);
    x.set(ch.subarray(0, pad), pad + n);
    return x;
  });
  const r = limit(ext, o);
  chans.forEach((ch, c) => ch.set(ext[c].subarray(pad, pad + n)));
  return r;
}

/**
 * Finds the input gain for which gain -> true-peak limiter lands on an integrated loudness target (secant search on
 * the untouched input, since the limiter eats part of every gain step), and applies it.
 * @param {Float32Array[]} chans  modified in place
 * @param {{ lufs: number, ceilingDb?: number, tolerance?: number, sr?: number, attack?: number, release?: number,
 *   circular?: boolean }} o  circular: the signal is a seamless loop
 * @returns {{ lufs: number, truePeakDb: number, gainDb: number, maxReductionDb: number }}
 */
export function normalize(chans, o) {
  const sr = o.sr ?? SR;
  const ceilingDb = o.ceilingDb ?? -1.5;
  const tol = o.tolerance ?? 0.05;
  const src = chans.map((c) => c.slice());
  const l0 = integratedLoudness(src, sr);
  if (!Number.isFinite(l0)) return { lufs: l0, truePeakDb: -Infinity, gainDb: 0, maxReductionDb: 0 };
  /** @param {number} g */
  const attempt = (g) => {
    const y = src.map((c) => c.slice());
    scale(y, dbToGain(g));
    const lo = { ceilingDb, sr, attack: o.attack, release: o.release };
    const r = o.circular ? limitCircular(y, lo) : limit(y, lo);
    return { y, l: integratedLoudness(y, sr), red: r.maxReductionDb };
  };
  let g0 = o.lufs - l0;
  let a = attempt(g0);
  let g1 = g0 + (o.lufs - a.l);
  let best = { g: g0, ...a };
  for (let i = 0; i < 8 && Math.abs(best.l - o.lufs) > tol; i++) {
    const b = attempt(g1);
    if (Math.abs(b.l - o.lufs) < Math.abs(best.l - o.lufs)) best = { g: g1, ...b };
    const slope = Math.abs(b.l - a.l) > 1e-6 ? (g1 - g0) / (b.l - a.l) : 1;
    const next = g1 + (o.lufs - b.l) * Math.max(0.5, Math.min(4, slope));
    g0 = g1;
    a = b;
    g1 = next;
  }
  for (let c = 0; c < chans.length; c++) chans[c].set(best.y[c]);
  return {
    lufs: best.l,
    truePeakDb: 20 * Math.log10(Math.max(1e-12, truePeak(chans))),
    gainDb: best.g,
    maxReductionDb: best.red,
  };
}
