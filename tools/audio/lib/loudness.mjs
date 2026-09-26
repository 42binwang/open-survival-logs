// @ts-check
// ITU-R BS.1770-4 loudness (K-weighting, 400 ms blocks with 75 % overlap, absolute and relative gates) and true peak
// (4x oversampling with the Annex 2 interpolation filter). Used while rendering to hit targets quickly; the shipped
// numbers and the tests measure with ffmpeg's ebur128 filter, which this agrees with to about 0.1 LU.

import { SR } from './dsp.mjs';

/** K-weighting biquads for a sample rate (the libebur128 design, exact at 48 kHz). @param {number} rate */
function kWeighting(rate) {
  let f0 = 1681.974450955533;
  const G = 3.999843853973347;
  let Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / rate);
  const Vh = 10 ** (G / 20);
  const Vb = Vh ** 0.4996667741545416;
  let a0 = 1 + K / Q + K * K;
  const pb = [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0];
  const pa = [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0];
  f0 = 38.13547087602444;
  Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / rate);
  a0 = 1 + K / Q + K * K;
  const rb = [1, -2, 1];
  const ra = [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0];
  return { pb, pa, rb, ra };
}

/**
 * K-weighted per-channel squared signal summed over channels (weights 1 for L/R).
 * @param {Float32Array[]} chans
 * @param {number} rate
 */
function weightedPower(chans, rate) {
  const { pb, pa, rb, ra } = kWeighting(rate);
  const n = chans[0].length;
  const pow = new Float64Array(n);
  for (const ch of chans) {
    const k = biquadDirect(biquadDirect(ch, pb, pa), rb, ra);
    for (let i = 0; i < n; i++) pow[i] += k[i] * k[i];
  }
  return pow;
}

/**
 * Direct form I biquad in double precision.
 * @param {ArrayLike<number>} x
 * @param {number[]} b
 * @param {number[]} a
 */
function biquadDirect(x, b, a) {
  const n = x.length;
  const y = new Float64Array(n);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < n; i++) {
    const v = x[i];
    const o = b[0] * v + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1;
    x1 = v;
    y2 = y1;
    y1 = o;
    y[i] = o;
  }
  return y;
}

/** @param {number} ms */
const toLufs = (ms) => (ms > 0 ? -0.691 + 10 * Math.log10(ms) : -Infinity);

/**
 * Mean square of each gating block.
 * @param {Float64Array} pow
 * @param {number} rate
 * @param {number} blockSec
 * @param {number} hopSec
 */
function blocks(pow, rate, blockSec, hopSec) {
  const bl = Math.round(blockSec * rate);
  const hop = Math.round(hopSec * rate);
  const prefix = new Float64Array(pow.length + 1);
  for (let i = 0; i < pow.length; i++) prefix[i + 1] = prefix[i] + pow[i];
  /** @type {number[]} */
  const out = [];
  for (let s = 0; s + bl <= pow.length; s += hop) out.push((prefix[s + bl] - prefix[s]) / bl);
  return out;
}

/**
 * @typedef {{ integrated: number, momentaryMax: number, shortTermMax: number, lra: number, truePeakDb: number,
 *   samplePeakDb: number, momentary: number[], shortTerm: number[] }} LoudnessReport  curves at 10 Hz
 */

/**
 * Full BS.1770-4 / EBU R128 report for a signal.
 * @param {Float32Array[]} chans
 * @param {number} [rate]
 * @returns {LoudnessReport}
 */
export function loudness(chans, rate = SR) {
  const pow = weightedPower(chans, rate);
  const mom = blocks(pow, rate, 0.4, 0.1);
  const abs = mom.filter((z) => toLufs(z) > -70);
  let integrated = -Infinity;
  if (abs.length) {
    const ungated = abs.reduce((a, b) => a + b, 0) / abs.length;
    const rel = toLufs(ungated) - 10;
    const gated = abs.filter((z) => toLufs(z) > rel);
    if (gated.length) integrated = toLufs(gated.reduce((a, b) => a + b, 0) / gated.length);
  }
  const st = blocks(pow, rate, 3, 0.1);
  const stAbs = st.map(toLufs).filter((l) => l > -70);
  let lra = 0;
  if (stAbs.length) {
    const msAbs = st.filter((z) => toLufs(z) > -70);
    const rel = toLufs(msAbs.reduce((a, b) => a + b, 0) / msAbs.length) - 20;
    const g = stAbs.filter((l) => l > rel).sort((a, b) => a - b);
    if (g.length > 1) lra = g[Math.floor(0.95 * (g.length - 1))] - g[Math.floor(0.1 * (g.length - 1))];
  }
  let sp = 0;
  for (const ch of chans) for (let i = 0; i < ch.length; i++) sp = Math.max(sp, Math.abs(ch[i]));
  return {
    integrated,
    momentaryMax: Math.max(-Infinity, ...mom.map(toLufs)),
    shortTermMax: st.length ? Math.max(...st.map(toLufs)) : -Infinity,
    lra,
    truePeakDb: 20 * Math.log10(Math.max(1e-12, truePeak(chans))),
    samplePeakDb: 20 * Math.log10(Math.max(1e-12, sp)),
    momentary: mom.map(toLufs),
    shortTerm: st.map(toLufs),
  };
}

/** Integrated loudness only (LUFS). @param {Float32Array[]} chans @param {number} [rate] */
export function integratedLoudness(chans, rate = SR) {
  const pow = weightedPower(chans, rate);
  const mom = blocks(pow, rate, 0.4, 0.1);
  const abs = mom.filter((z) => toLufs(z) > -70);
  if (!abs.length) return -Infinity;
  const rel = toLufs(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const gated = abs.filter((z) => toLufs(z) > rel);
  return gated.length ? toLufs(gated.reduce((a, b) => a + b, 0) / gated.length) : -Infinity;
}

/** Maximum momentary (400 ms) loudness, the level used for short one-shot sounds. @param {Float32Array[]} chans */
export function momentaryMax(chans, rate = SR) {
  const pow = weightedPower(chans, rate);
  const bl = Math.round(0.4 * rate);
  if (pow.length < bl) {
    // Shorter than a block: pad with silence as a meter would.
    let s = 0;
    for (let i = 0; i < pow.length; i++) s += pow[i];
    return toLufs(s / bl);
  }
  return Math.max(...blocks(pow, rate, 0.4, 0.01).map(toLufs));
}

// BS.1770-4 Annex 2: 48-tap, 4-phase interpolation filter for true-peak estimation.
const TP_PHASES = [
  [0.001708984375, 0.010986328125, -0.0196533203125, 0.033203125, -0.0594482421875, 0.1373291015625, 0.97216796875, -0.102294921875, 0.047607421875, -0.026611328125, 0.014892578125, -0.00830078125],
  [-0.0291748046875, 0.029296875, -0.0517578125, 0.089111328125, -0.16650390625, 0.465087890625, 0.77978515625, -0.2003173828125, 0.1015625, -0.0582275390625, 0.0330810546875, -0.0189208984375],
  [-0.0189208984375, 0.0330810546875, -0.0582275390625, 0.1015625, -0.2003173828125, 0.77978515625, 0.465087890625, -0.16650390625, 0.089111328125, -0.0517578125, 0.029296875, -0.0291748046875],
  [-0.00830078125, 0.014892578125, -0.026611328125, 0.047607421875, -0.102294921875, 0.97216796875, 0.1373291015625, -0.0594482421875, 0.033203125, -0.0196533203125, 0.010986328125, 0.001708984375],
];

/**
 * Per-sample true-peak envelope: the largest |value| among the 4 interpolated points around each sample,
 * maximized over channels.
 * @param {Float32Array[]} chans
 */
export function truePeakEnvelope(chans) {
  const n = chans[0].length;
  const env = new Float32Array(n);
  for (const ch of chans) {
    for (let i = 0; i < n; i++) {
      let m = Math.abs(ch[i]);
      for (let p = 0; p < 4; p++) {
        const c = TP_PHASES[p];
        let acc = 0;
        for (let k = 0; k < 12; k++) {
          const j = i - k + 6;
          if (j >= 0 && j < n) acc += c[k] * ch[j];
        }
        const a = Math.abs(acc);
        if (a > m) m = a;
      }
      if (m > env[i]) env[i] = m;
    }
  }
  return env;
}

/** Linear true peak over all channels. @param {Float32Array[]} chans */
export function truePeak(chans) {
  const env = truePeakEnvelope(chans);
  let m = 0;
  for (let i = 0; i < env.length; i++) if (env[i] > m) m = env[i];
  return m;
}
