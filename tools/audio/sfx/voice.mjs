// @ts-check
// Zombie voices by source-filter synthesis. The source is a glottal pulse train (Rosenberg pulses, differentiated)
// with jitter, shimmer and period doubling (the growl), sliding into vocal fry at the edges; breath noise is gated
// by the glottal open phase; wet throat bubbles are mixed into the excitation. The tract is a parallel bank of five
// formant resonators moving between vowel targets, scaled down for a larger, slack throat. Saturation and an
// amplitude envelope with ragged micro-variation finish it; some takes start with a rasping inhale.

import { SR, biquad, saturate, smoothRandom } from '../lib/dsp.mjs';
import { Rng } from '../lib/rng.mjs';

/** Formant frequencies (Hz) and bandwidths of adult male vowels (Peterson & Barney style averages). */
const VOWELS = /** @type {Record<string, { f: number[], bw: number[] }>} */ ({
  u: { f: [300, 870, 2240, 3300, 4300], bw: [70, 100, 140, 250, 300] },
  o: { f: [500, 800, 2450, 3300, 4300], bw: [80, 100, 140, 250, 300] },
  aw: { f: [570, 840, 2410, 3300, 4300], bw: [80, 100, 150, 250, 300] },
  a: { f: [730, 1090, 2440, 3400, 4400], bw: [90, 110, 160, 250, 300] },
  uh: { f: [640, 1190, 2390, 3400, 4400], bw: [85, 110, 160, 250, 300] },
  er: { f: [490, 1350, 1690, 3000, 4200], bw: [80, 120, 150, 250, 300] },
  ae: { f: [660, 1720, 2410, 3300, 4400], bw: [90, 120, 160, 250, 300] },
  h: { f: [700, 1250, 2500, 3500, 4500], bw: [250, 300, 350, 400, 450] },
});
const FORMANT_GAIN = [1, 0.62, 0.32, 0.16, 0.07];

/**
 * @typedef {{ seconds: number, seed: string, f0: [number, number][], vowels: [number, string][], breath: number,
 *   growl: number, wet: number, fry: [number, number][], tract: number, drive: number, inhale?: number,
 *   attack?: number, release?: number }} VoiceSpec  times in f0 / vowels / fry are fractions of the duration
 */

/** @param {[number, number][]} pts @param {number} x */
function lerpPts(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
    }
  }
  return pts[pts.length - 1][1];
}

/** Fry weight at x: 1 inside a fry span (with 8 % soft edges). @param {[number, number][]} spans @param {number} x */
function fryAt(spans, x) {
  let w = 0;
  for (const [a, b] of spans) {
    const edge = 0.08;
    if (x >= a - edge && x <= b + edge) w = Math.max(w, Math.min(1, (x - (a - edge)) / edge, (b + edge - x) / edge));
  }
  return Math.max(0, Math.min(1, w));
}

/**
 * Parallel formant bank with coefficients updated every 64 samples.
 * @param {Float32Array} x
 * @param {(t: number) => { f: number[], bw: number[] }} at  t: fraction of the duration
 */
function formants(x, at) {
  const n = x.length;
  const out = new Float32Array(n);
  const z = FORMANT_GAIN.map(() => [0, 0]);
  const block = 64;
  for (let s = 0; s < n; s += block) {
    const v = at(s / n);
    const cs = v.f.map((f, j) => biquad({ type: 'bandpass', freq: Math.min(f, SR * 0.45), q: f / v.bw[j] }));
    const e = Math.min(n, s + block);
    for (let j = 0; j < cs.length; j++) {
      const { b0, b1, b2, a1, a2 } = cs[j];
      let [z1, z2] = z[j];
      const g = FORMANT_GAIN[j];
      for (let i = s; i < e; i++) {
        const y = b0 * x[i] + z1;
        z1 = b1 * x[i] - a1 * y + z2;
        z2 = b2 * x[i] - a2 * y;
        out[i] += y * g;
      }
      z[j] = [z1, z2];
    }
  }
  return out;
}

/**
 * A rasping inhale ("hhhk"): noise through a wide open tract with fry pulses.
 * @param {number} seconds
 * @param {Rng} rng
 */
function inhale(seconds, rng) {
  const n = Math.round(seconds * SR);
  const exc = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    ph += rng.range(26, 48) / SR;
    const pulse = ph >= 1 ? 1 : 0;
    if (ph >= 1) ph -= 1;
    exc[i] = (rng.next() * 2 - 1) * (0.5 + 0.5 * Math.sin(Math.PI * t)) + pulse * rng.range(0.5, 1.5);
  }
  const y = formants(exc, () => VOWELS.h);
  for (let i = 0; i < n; i++) y[i] *= Math.sin((Math.PI * i) / n) ** 0.7 * 0.5;
  return y;
}

/**
 * @param {VoiceSpec} v
 * @returns {Float32Array}  mono
 */
export function zombieVoice(v) {
  const rng = new Rng(v.seed);
  const n = Math.round(v.seconds * SR);
  const wobble = smoothRandom(n, 0.11, () => rng.next());
  const wetMod = smoothRandom(n, 1 / 13, () => rng.next());
  const exc = new Float32Array(n);
  let phase = 0;
  let k = 0;
  let amp = 1;
  let jit = 1;
  let prevG = 0;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    const fry = fryAt(v.fry, x);
    const base = lerpPts(v.f0, x) * (1 + 0.035 * wobble[i]);
    const f = (base * (1 - fry) + rng.range(30, 46) * fry) * jit;
    phase += f / SR;
    if (phase >= 1) {
      phase -= 1;
      k++;
      amp = 1 + 0.22 * rng.gauss() * 0.6;
      jit = 1 + (0.035 + 0.12 * fry) * rng.gauss() * 0.6 + (k % 2 ? v.growl * 0.06 : -v.growl * 0.06);
      if (k % 2) amp *= 1 - v.growl * 0.65;
      if (fry > 0.5 && rng.chance(0.25)) amp *= 0.4;
    }
    const oq = 0.6 - 0.25 * fry;
    const tp = oq * 0.66;
    const g = phase < tp ? 0.5 * (1 - Math.cos((Math.PI * phase) / tp)) : phase < oq ? Math.cos((Math.PI * (phase - tp)) / (2 * (oq - tp))) : 0;
    const d = (g - prevG) * SR * 0.0012;
    prevG = g;
    const breath = (rng.next() * 2 - 1) * (0.25 + 0.75 * g) * v.breath * 0.35;
    exc[i] = d * amp + breath;
  }
  // Wet throat: bubbles through the tract.
  if (v.wet > 0) {
    let t = 0;
    for (;;) {
      t += -Math.log(1 - rng.next()) / (4 + 22 * v.wet);
      const at = Math.floor(t * SR);
      if (at >= n) break;
      const f0 = rng.range(280, 950);
      const tau = rng.range(0.004, 0.014);
      const len = Math.min(n - at, Math.round(tau * 5 * SR));
      let ph = 0;
      for (let i = 0; i < len; i++) {
        ph += (2 * Math.PI * f0 * (1 + 0.4 * (i / len))) / SR;
        exc[at + i] += Math.sin(ph) * Math.exp(-i / (tau * SR)) * 0.25 * v.wet;
      }
    }
  }
  const y = formants(exc, (x) => {
    const pts = v.vowels;
    let a = pts[0];
    let b = pts[pts.length - 1];
    for (let i = 1; i < pts.length; i++) {
      if (x <= pts[i][0]) {
        a = pts[i - 1];
        b = pts[i];
        break;
      }
    }
    const u = b[0] > a[0] ? Math.max(0, Math.min(1, (x - a[0]) / (b[0] - a[0]))) : 0;
    const s = 0.5 - 0.5 * Math.cos(Math.PI * u);
    const A = VOWELS[a[1]];
    const B = VOWELS[b[1]];
    const wetBw = 1 + 0.6 * v.wet;
    return { f: A.f.map((f, j) => (f + (B.f[j] - f) * s) * v.tract), bw: A.bw.map((w, j) => (w + (B.bw[j] - w) * s) * wetBw) };
  });
  // Envelope with ragged micro-variation, wet amplitude modulation, saturation.
  const att = Math.round((v.attack ?? 0.12) * SR);
  const rel = Math.round((v.release ?? 0.3) * SR);
  for (let i = 0; i < n; i++) {
    let e = 1;
    if (i < att) e = 0.5 - 0.5 * Math.cos((Math.PI * i) / att);
    if (i > n - rel) e *= 0.5 + 0.5 * Math.cos((Math.PI * (i - (n - rel))) / rel);
    const m = 1 - v.wet * 0.45 * (0.5 + 0.5 * wetMod[i]);
    y[i] *= e * m * (1 + 0.12 * wobble[i]);
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(y[i]));
  for (let i = 0; i < n; i++) y[i] /= peak || 1;
  saturate(y, v.drive);
  if (!v.inhale) return y;
  const pre = inhale(v.inhale, rng);
  const gap = Math.round(rng.range(0.05, 0.12) * SR);
  const out = new Float32Array(pre.length + gap + n);
  out.set(pre, 0);
  out.set(y, pre.length + gap);
  return out;
}

/** The groan takes of the zombie-groan family. */
export const GROANS = /** @type {VoiceSpec[]} */ ([
  { seconds: 2.4, seed: 'groan-moan', f0: [[0, 80], [0.3, 88], [0.7, 76], [1, 62]], vowels: [[0, 'u'], [0.35, 'uh'], [0.75, 'a'], [1, 'uh']], breath: 0.3, growl: 0.35, wet: 0.25, fry: [[0, 0.1], [0.88, 1]], tract: 0.88, drive: 2.4, inhale: 0.4 },
  { seconds: 0.95, seed: 'groan-grunt', f0: [[0, 105], [0.5, 98], [1, 70]], vowels: [[0, 'uh'], [1, 'aw']], breath: 0.4, growl: 0.6, wet: 0.15, fry: [[0, 0.15], [0.8, 1]], tract: 0.86, drive: 3.2, attack: 0.05, release: 0.2 },
  { seconds: 1.9, seed: 'groan-rise', f0: [[0, 68], [0.5, 96], [1, 72]], vowels: [[0, 'u'], [0.4, 'o'], [0.7, 'a'], [1, 'uh']], breath: 0.32, growl: 0.4, wet: 0.2, fry: [[0, 0.12], [0.85, 1]], tract: 0.9, drive: 2.6 },
  { seconds: 1.35, seed: 'groan-snarl', f0: [[0, 118], [0.4, 132], [1, 94]], vowels: [[0, 'ae'], [0.5, 'a'], [1, 'er']], breath: 0.6, growl: 0.75, wet: 0.1, fry: [[0.85, 1]], tract: 0.92, drive: 4, attack: 0.06 },
  { seconds: 1.7, seed: 'groan-gurgle', f0: [[0, 62], [0.5, 70], [1, 55]], vowels: [[0, 'o'], [0.5, 'uh'], [1, 'u']], breath: 0.22, growl: 0.5, wet: 0.75, fry: [[0, 0.2], [0.8, 1]], tract: 0.85, drive: 2.8, inhale: 0.3 },
  { seconds: 2.7, seed: 'groan-breathy', f0: [[0, 74], [0.4, 84], [1, 66]], vowels: [[0, 'uh'], [0.5, 'aw'], [1, 'u']], breath: 0.55, growl: 0.25, wet: 0.3, fry: [[0.9, 1]], tract: 0.9, drive: 2.0, inhale: 0.45, attack: 0.25, release: 0.5 },
]);
