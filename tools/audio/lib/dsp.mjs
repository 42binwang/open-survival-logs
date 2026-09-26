// @ts-check
// DSP building blocks shared by the music sampler, the SFX builder and the offline mixer. Filters use the exact
// BiquadFilterNode formulas of the Web Audio spec (lowpass / highpass Q in dB, shelves with S = 1), so a chain
// defined once renders the same offline and live in pages/audio-test.html.

export const SR = 48000;

/** @param {number} db */
export const dbToGain = (db) => 10 ** (db / 20);
/** @param {number} g */
export const gainToDb = (g) => (g > 0 ? 20 * Math.log10(g) : -Infinity);

/**
 * @typedef {'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'allpass' | 'peaking' | 'lowshelf' | 'highshelf'} BiquadType
 * @typedef {{ type: BiquadType, freq: number, q?: number, gain?: number }} FilterSpec  q and gain as on BiquadFilterNode
 * @typedef {{ b0: number, b1: number, b2: number, a1: number, a2: number }} BiquadCoeffs  normalized (a0 = 1)
 */

/** Q (in dB, the Web Audio lowpass/highpass convention) of the sections of a Butterworth filter of this order. @param {number} order */
export function butterworthQdB(order) {
  /** @type {number[]} */
  const out = [];
  for (let k = 0; k < Math.floor(order / 2); k++) {
    const q = 1 / (2 * Math.sin(((2 * k + 1) * Math.PI) / (2 * order)));
    out.push(20 * Math.log10(q));
  }
  return out;
}

/** Butterworth Q (dB) of a single second-order section. */
export const BUTTER_Q = 20 * Math.log10(Math.SQRT1_2);

/**
 * @param {FilterSpec} f
 * @param {number} [sr]
 * @returns {BiquadCoeffs}
 */
export function biquad(f, sr = SR) {
  const nyq = sr / 2;
  const f0 = Math.max(1, Math.min(f.freq, nyq * 0.999));
  const w0 = (2 * Math.PI * f0) / sr;
  const cw = Math.cos(w0);
  const sw = Math.sin(w0);
  const G = f.gain ?? 0;
  const A = 10 ** (G / 40);
  const Q = f.q ?? (f.type === 'lowpass' || f.type === 'highpass' ? BUTTER_Q : 1);
  const aQ = sw / (2 * Q);
  const aQdB = sw / (2 * 10 ** (Q / 20));
  const aS = (sw / 2) * Math.SQRT2;
  let b0;
  let b1;
  let b2;
  let a0;
  let a1;
  let a2;
  switch (f.type) {
    case 'lowpass':
      b0 = (1 - cw) / 2;
      b1 = 1 - cw;
      b2 = (1 - cw) / 2;
      a0 = 1 + aQdB;
      a1 = -2 * cw;
      a2 = 1 - aQdB;
      break;
    case 'highpass':
      b0 = (1 + cw) / 2;
      b1 = -(1 + cw);
      b2 = (1 + cw) / 2;
      a0 = 1 + aQdB;
      a1 = -2 * cw;
      a2 = 1 - aQdB;
      break;
    case 'bandpass':
      b0 = aQ;
      b1 = 0;
      b2 = -aQ;
      a0 = 1 + aQ;
      a1 = -2 * cw;
      a2 = 1 - aQ;
      break;
    case 'notch':
      b0 = 1;
      b1 = -2 * cw;
      b2 = 1;
      a0 = 1 + aQ;
      a1 = -2 * cw;
      a2 = 1 - aQ;
      break;
    case 'allpass':
      b0 = 1 - aQ;
      b1 = -2 * cw;
      b2 = 1 + aQ;
      a0 = 1 + aQ;
      a1 = -2 * cw;
      a2 = 1 - aQ;
      break;
    case 'peaking':
      b0 = 1 + aQ * A;
      b1 = -2 * cw;
      b2 = 1 - aQ * A;
      a0 = 1 + aQ / A;
      a1 = -2 * cw;
      a2 = 1 - aQ / A;
      break;
    case 'lowshelf': {
      const s = 2 * aS * Math.sqrt(A);
      b0 = A * (A + 1 - (A - 1) * cw + s);
      b1 = 2 * A * (A - 1 - (A + 1) * cw);
      b2 = A * (A + 1 - (A - 1) * cw - s);
      a0 = A + 1 + (A - 1) * cw + s;
      a1 = -2 * (A - 1 + (A + 1) * cw);
      a2 = A + 1 + (A - 1) * cw - s;
      break;
    }
    case 'highshelf': {
      const s = 2 * aS * Math.sqrt(A);
      b0 = A * (A + 1 + (A - 1) * cw + s);
      b1 = -2 * A * (A - 1 + (A + 1) * cw);
      b2 = A * (A + 1 + (A - 1) * cw - s);
      a0 = A + 1 - (A - 1) * cw + s;
      a1 = 2 * (A - 1 - (A + 1) * cw);
      a2 = A + 1 - (A - 1) * cw - s;
      break;
    }
    default:
      throw new Error(`unknown filter type ${/** @type {any} */ (f).type}`);
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/**
 * Filters x in place (transposed direct form II).
 * @param {Float32Array} x
 * @param {BiquadCoeffs} c
 * @param {number} [from]
 * @param {number} [to]
 */
export function runBiquad(x, c, from = 0, to = x.length) {
  let z1 = 0;
  let z2 = 0;
  const { b0, b1, b2, a1, a2 } = c;
  for (let i = from; i < to; i++) {
    const v = x[i];
    const y = b0 * v + z1;
    z1 = b1 * v - a1 * y + z2;
    z2 = b2 * v - a2 * y;
    x[i] = y;
  }
  return x;
}

/**
 * Applies a filter chain in place to every channel.
 * @param {Float32Array[]} chans
 * @param {FilterSpec[]} specs
 * @param {number} [sr]
 */
export function filterChannels(chans, specs, sr = SR) {
  for (const s of specs) {
    const c = biquad(s, sr);
    for (const ch of chans) runBiquad(ch, c);
  }
  return chans;
}

/**
 * A biquad whose parameters change over time: coefficients are recomputed every `block` samples.
 * @param {Float32Array} x
 * @param {(t: number) => FilterSpec} specAt  t in seconds
 * @param {number} [sr]
 * @param {number} [block]
 */
export function runBiquadVarying(x, specAt, sr = SR, block = 64) {
  let z1 = 0;
  let z2 = 0;
  for (let start = 0; start < x.length; start += block) {
    const { b0, b1, b2, a1, a2 } = biquad(specAt(start / sr), sr);
    const end = Math.min(x.length, start + block);
    for (let i = start; i < end; i++) {
      const v = x[i];
      const y = b0 * v + z1;
      z1 = b1 * v - a1 * y + z2;
      z2 = b2 * v - a2 * y;
      x[i] = y;
    }
  }
  return x;
}

/** One-pole lowpass smoothing coefficient for a time constant in seconds. */
export const onePoleCoeff = (/** @type {number} */ tau, sr = SR) => (tau <= 0 ? 0 : Math.exp(-1 / (tau * sr)));

// ------------------------------------------------------------------------------------------------ buffers

/** @param {number} n @param {number} [ch] */
export const makeChannels = (n, ch = 2) => Array.from({ length: ch }, () => new Float32Array(Math.max(0, Math.ceil(n))));

/** @param {Float32Array[]} chans */
export function peakAbs(chans) {
  let p = 0;
  for (const ch of chans) for (let i = 0; i < ch.length; i++) p = Math.max(p, Math.abs(ch[i]));
  return p;
}

/** @param {Float32Array[]} chans @param {number} g */
export function scale(chans, g) {
  for (const ch of chans) for (let i = 0; i < ch.length; i++) ch[i] *= g;
  return chans;
}

/**
 * Adds src into dst starting at dst sample `at`, times gain.
 * @param {Float32Array} dst
 * @param {Float32Array} src
 * @param {number} at
 * @param {number} [gain]
 */
export function addInto(dst, src, at, gain = 1) {
  const start = Math.max(0, at);
  const end = Math.min(dst.length, at + src.length);
  for (let i = start; i < end; i++) dst[i] += src[i - at] * gain;
}

/**
 * Raised-cosine fades in place.
 * @param {Float32Array[]} chans
 * @param {number} inSamples
 * @param {number} outSamples
 */
export function fade(chans, inSamples, outSamples) {
  for (const ch of chans) {
    const n = ch.length;
    const fi = Math.min(n, Math.round(inSamples));
    const fo = Math.min(n, Math.round(outSamples));
    for (let i = 0; i < fi; i++) ch[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fi);
    for (let i = 0; i < fo; i++) ch[n - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fo);
  }
  return chans;
}

/**
 * Cuts leading and trailing silence below `thresholdDb` (with pre-roll and tail kept).
 * @param {Float32Array[]} chans
 * @param {{ thresholdDb?: number, preRoll?: number, tail?: number, sr?: number }} [o]
 */
export function trimSilence(chans, o = {}) {
  const thr = dbToGain(o.thresholdDb ?? -60);
  const sr = o.sr ?? SR;
  const n = chans[0].length;
  let first = n;
  let last = -1;
  for (const ch of chans) {
    for (let i = 0; i < n; i++) if (Math.abs(ch[i]) > thr) {
      first = Math.min(first, i);
      break;
    }
    for (let i = n - 1; i >= 0; i--) if (Math.abs(ch[i]) > thr) {
      last = Math.max(last, i);
      break;
    }
  }
  if (last < first) return chans.map(() => new Float32Array(0));
  const a = Math.max(0, first - Math.round((o.preRoll ?? 0.002) * sr));
  const b = Math.min(n, last + Math.round((o.tail ?? 0.02) * sr));
  return chans.map((ch) => ch.slice(a, b));
}

/**
 * Makes a seamless loop: the last `xfade` seconds are cross-faded (equal power) into the head and cut off.
 * @param {Float32Array[]} chans
 * @param {number} xfade  seconds
 * @param {number} [sr]
 */
export function makeLoop(chans, xfade, sr = SR) {
  const x = Math.round(xfade * sr);
  return chans.map((ch) => {
    const n = ch.length - x;
    const out = ch.slice(0, n);
    for (let i = 0; i < x; i++) {
      const t = i / x;
      out[i] = out[i] * Math.sin((Math.PI / 2) * t) + ch[n + i] * Math.cos((Math.PI / 2) * t);
    }
    return out;
  });
}

/** @param {Float32Array[]} chans */
export const toMono = (chans) => {
  if (chans.length === 1) return [chans[0].slice()];
  const out = new Float32Array(chans[0].length);
  for (const ch of chans) for (let i = 0; i < out.length; i++) out[i] += ch[i] / chans.length;
  return [out];
};

// ------------------------------------------------------------------------------------------------ noise

/**
 * @param {number} n
 * @param {() => number} rnd  uniform [0, 1)
 */
export function whiteNoise(n, rnd) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rnd() * 2 - 1;
  return out;
}

/** Pink noise (Paul Kellet's refined filter), roughly unit RMS scaled to peak ~1. @param {number} n @param {() => number} rnd */
export function pinkNoise(n, rnd) {
  const out = new Float32Array(n);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = rnd() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return out;
}

/** Brown (red) noise, leaky-integrated white. @param {number} n @param {() => number} rnd */
export function brownNoise(n, rnd) {
  const out = new Float32Array(n);
  let v = 0;
  for (let i = 0; i < n; i++) {
    v = 0.998 * v + (rnd() * 2 - 1) * 0.05;
    out[i] = v * 3.5;
  }
  return out;
}

/**
 * Smooth random control signal: uniform random targets every `period` seconds, cosine-interpolated. Range [-1, 1].
 * @param {number} n
 * @param {number} period
 * @param {() => number} rnd
 * @param {number} [sr]
 */
export function smoothRandom(n, period, rnd, sr = SR) {
  const out = new Float32Array(n);
  const step = Math.max(1, Math.round(period * sr));
  let a = rnd() * 2 - 1;
  let b = rnd() * 2 - 1;
  for (let i = 0; i < n; i++) {
    const k = i % step;
    if (k === 0 && i > 0) {
      a = b;
      b = rnd() * 2 - 1;
    }
    const t = k / step;
    out[i] = a + (b - a) * (0.5 - 0.5 * Math.cos(Math.PI * t));
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ resampling

/** Modified Bessel function of the first kind, order 0. @param {number} x */
function besselI0(x) {
  let sum = 1;
  let term = 1;
  const q = (x * x) / 4;
  for (let k = 1; k < 64; k++) {
    term *= q / (k * k);
    sum += term;
    if (term < sum * 1e-12) break;
  }
  return sum;
}

const HALF = 12; // taps each side
const PHASES = 512;
const BETA = 8.0;
/** @type {Map<number, Float32Array>} */
const kernelCache = new Map();

/** Polyphase windowed-sinc table for a cutoff (fraction of the input Nyquist). @param {number} cutoff */
function kernelTable(cutoff) {
  const key = Math.round(cutoff * 200) / 200;
  const hit = kernelCache.get(key);
  if (hit) return hit;
  const taps = 2 * HALF;
  const t = new Float32Array((PHASES + 1) * taps);
  const i0b = besselI0(BETA);
  for (let p = 0; p <= PHASES; p++) {
    const frac = p / PHASES;
    let sum = 0;
    for (let k = 0; k < taps; k++) {
      const x = k - (HALF - 1) - frac; // tap offset relative to the fractional position
      const s = x === 0 ? 1 : Math.sin(Math.PI * key * x) / (Math.PI * key * x);
      const r = x / HALF;
      const w = Math.abs(r) >= 1 ? 0 : besselI0(BETA * Math.sqrt(1 - r * r)) / i0b;
      const v = key * s * w;
      t[p * taps + k] = v;
      sum += v;
    }
    for (let k = 0; k < taps; k++) t[p * taps + k] /= sum; // unity DC gain per phase
  }
  kernelCache.set(key, t);
  return t;
}

/**
 * Reads `src` at fractional positions start + i * step (in source samples) into a new buffer of `outLen` samples,
 * with a Kaiser-windowed sinc; step > 1 lowers the cutoff so pitching up does not alias.
 * @param {Float32Array} src
 * @param {number} step
 * @param {number} outLen
 * @param {number} [start]
 */
export function resampleStep(src, step, outLen, start = 0) {
  const out = new Float32Array(Math.max(0, outLen));
  const cutoff = Math.min(0.97, 0.97 / step);
  const tab = kernelTable(cutoff);
  const taps = 2 * HALF;
  const n = src.length;
  let pos = start;
  for (let i = 0; i < out.length; i++, pos += step) {
    const ip = Math.floor(pos);
    if (ip - HALF > n) break;
    const frac = pos - ip;
    const ph = frac * PHASES;
    const p0 = Math.floor(ph);
    const pf = ph - p0;
    const base0 = p0 * taps;
    const base1 = base0 + taps;
    let acc = 0;
    const first = ip - (HALF - 1);
    if (first >= 0 && first + taps <= n) {
      for (let k = 0; k < taps; k++) {
        const c = tab[base0 + k] + (tab[base1 + k] - tab[base0 + k]) * pf;
        acc += src[first + k] * c;
      }
    } else {
      for (let k = 0; k < taps; k++) {
        const j = first + k;
        if (j < 0 || j >= n) continue;
        const c = tab[base0 + k] + (tab[base1 + k] - tab[base0 + k]) * pf;
        acc += src[j] * c;
      }
    }
    out[i] = acc;
  }
  return out;
}

/**
 * Pitch-shifts by resampling (tape-style: duration changes with pitch).
 * @param {Float32Array[]} chans
 * @param {number} ratio  frequency ratio (2 = one octave up)
 */
export function varispeed(chans, ratio) {
  if (Math.abs(ratio - 1) < 1e-6) return chans.map((c) => c.slice());
  const outLen = Math.floor(chans[0].length / ratio);
  return chans.map((c) => resampleStep(c, ratio, outLen));
}

/**
 * Sample-rate conversion.
 * @param {Float32Array[]} chans
 * @param {number} from
 * @param {number} to
 */
export function resampleRate(chans, from, to) {
  if (from === to) return chans;
  const step = from / to;
  const outLen = Math.floor(chans[0].length / step);
  return chans.map((c) => resampleStep(c, step, outLen));
}

// ------------------------------------------------------------------------------------------------ dynamics

/**
 * Feed-forward compressor (peak or RMS detector, soft knee), in place, linked across channels.
 * @param {Float32Array[]} chans
 * @param {{ thresholdDb: number, ratio: number, attack?: number, release?: number, kneeDb?: number, makeupDb?: number,
 *   rms?: number, sidechain?: Float32Array, sr?: number }} o
 * @returns {Float32Array} the gain applied per sample
 */
export function compress(chans, o) {
  const sr = o.sr ?? SR;
  const n = chans[0].length;
  const att = onePoleCoeff(o.attack ?? 0.01, sr);
  const rel = onePoleCoeff(o.release ?? 0.15, sr);
  const knee = o.kneeDb ?? 6;
  const rmsC = onePoleCoeff(o.rms ?? 0, sr);
  const makeup = dbToGain(o.makeupDb ?? 0);
  const gains = new Float32Array(n);
  let env = 0;
  let ms = 0;
  for (let i = 0; i < n; i++) {
    let lvl = 0;
    if (o.sidechain) lvl = Math.abs(o.sidechain[i]);
    else for (const ch of chans) lvl = Math.max(lvl, Math.abs(ch[i]));
    if (o.rms) {
      ms = rmsC * ms + (1 - rmsC) * lvl * lvl;
      lvl = Math.sqrt(ms);
    }
    env = lvl > env ? att * env + (1 - att) * lvl : rel * env + (1 - rel) * lvl;
    const xDb = env > 1e-9 ? 20 * Math.log10(env) : -180;
    const over = xDb - o.thresholdDb;
    let grDb;
    if (2 * over <= -knee) grDb = 0;
    else if (2 * Math.abs(over) < knee) grDb = ((1 / o.ratio - 1) * (over + knee / 2) ** 2) / (2 * knee);
    else grDb = (1 / o.ratio - 1) * over;
    const g = dbToGain(grDb) * makeup;
    gains[i] = g;
    for (const ch of chans) ch[i] *= g;
  }
  return gains;
}

/** Soft saturation, gain-compensated for small signals. @param {Float32Array} x @param {number} drive */
export function saturate(x, drive) {
  const k = Math.tanh(drive);
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(drive * x[i]) / k;
  return x;
}

// ------------------------------------------------------------------------------------------------ panning

/**
 * Equal-power stereo gains for a pan in [-1, 1] (StereoPannerNode law for mono input).
 * @param {number} pan
 * @returns {[number, number]}
 */
export function panGains(pan) {
  const x = (Math.max(-1, Math.min(1, pan)) + 1) / 2;
  return [Math.cos((x * Math.PI) / 2), Math.sin((x * Math.PI) / 2)];
}
