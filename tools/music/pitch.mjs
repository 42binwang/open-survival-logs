// @ts-check
// YIN fundamental-frequency estimation, used to check the note names of the library samples and to find the pitch of
// the timpani, whose files carry drum numbers instead of notes.

import { SR } from '../audio/lib/dsp.mjs';

/**
 * Median YIN estimate over the steady part of a recording (Hz), or null when nothing is periodic.
 * @param {Float32Array} x  mono
 * @param {{ from?: number, to?: number, fmin?: number, fmax?: number, threshold?: number }} [o]  from/to in seconds
 */
export function detectPitch(x, o = {}) {
  const fmin = o.fmin ?? 30;
  const fmax = o.fmax ?? 2000;
  const tauMax = Math.floor(SR / fmin);
  const tauMin = Math.max(2, Math.floor(SR / fmax));
  const W = Math.max(2048, tauMax * 2);
  const start = Math.round((o.from ?? 0.15) * SR);
  const end = Math.min(x.length - W - tauMax, Math.round((o.to ?? 1.2) * SR));
  /** @type {number[]} */
  const found = [];
  const d = new Float64Array(tauMax + 1);
  for (let s = start; s < end; s += Math.round(0.05 * SR)) {
    let energy = 0;
    for (let i = 0; i < W; i++) energy += x[s + i] * x[s + i];
    if (energy / W < 1e-7) continue;
    d.fill(0);
    for (let tau = 1; tau <= tauMax; tau++) {
      let sum = 0;
      for (let i = 0; i < W; i++) {
        const diff = x[s + i] - x[s + i + tau];
        sum += diff * diff;
      }
      d[tau] = sum;
    }
    // Cumulative mean normalized difference.
    let run = 0;
    let best = -1;
    for (let tau = 1; tau <= tauMax; tau++) {
      run += d[tau];
      const cm = run > 0 ? (d[tau] * tau) / run : 1;
      d[tau] = cm;
    }
    for (let tau = tauMin; tau < tauMax; tau++) {
      if (d[tau] < (o.threshold ?? 0.15)) {
        while (tau + 1 < tauMax && d[tau + 1] < d[tau]) tau++;
        best = tau;
        break;
      }
    }
    if (best < 0) continue;
    const a = d[best - 1];
    const b = d[best];
    const c = d[best + 1];
    const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
    found.push(SR / (best + (Number.isFinite(shift) ? shift : 0)));
  }
  if (!found.length) return null;
  found.sort((p, q) => p - q);
  return found[Math.floor(found.length / 2)];
}
