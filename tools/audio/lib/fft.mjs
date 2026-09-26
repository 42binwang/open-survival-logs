// @ts-check
// Radix-2 FFT and FFT convolution (overlap-add) for the room reverbs. Convolution follows ConvolverNode with
// normalize = false: a mono input feeds both IR channels, a stereo input is convolved channel by channel.

/** @type {Map<number, { cos: Float64Array, sin: Float64Array, rev: Uint32Array }>} */
const plans = new Map();

/** @param {number} n power of two */
function plan(n) {
  const hit = plans.get(n);
  if (hit) return hit;
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = Math.sin((2 * Math.PI * i) / n);
  }
  const bits = Math.log2(n);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r = (r << 1) | ((i >> b) & 1);
    rev[i] = r;
  }
  const p = { cos, sin, rev };
  plans.set(n, p);
  return p;
}

/**
 * In-place complex FFT. inverse = true computes the unscaled inverse (divide by n yourself).
 * @param {Float64Array} re
 * @param {Float64Array} im
 * @param {boolean} [inverse]
 */
export function fft(re, im, inverse = false) {
  const n = re.length;
  if (n & (n - 1)) throw new Error(`fft size ${n} is not a power of two`);
  const { cos, sin, rev } = plan(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) {
      let t = re[i];
      re[i] = re[j];
      re[j] = t;
      t = im[i];
      im[i] = im[j];
      im[j] = t;
    }
  }
  const sign = inverse ? 1 : -1;
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * step];
        const wi = sign * sin[k * step];
        const a = start + k;
        const b = a + half;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
    }
  }
}

/** @param {number} n */
export const nextPow2 = (n) => 2 ** Math.ceil(Math.log2(Math.max(2, n)));

/**
 * Linear convolution of x with h (overlap-add, FFT). Returns x.length + h.length - 1 samples.
 * @param {Float32Array} x
 * @param {Float32Array} h
 */
export function convolve(x, h) {
  const outLen = x.length + h.length - 1;
  const out = new Float32Array(outLen);
  if (!x.length || !h.length) return out;
  const N = Math.max(1 << 14, nextPow2(2 * h.length));
  const block = N - h.length + 1;
  const hr = new Float64Array(N);
  const hi = new Float64Array(N);
  for (let i = 0; i < h.length; i++) hr[i] = h[i];
  fft(hr, hi);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let start = 0; start < x.length; start += block) {
    re.fill(0);
    im.fill(0);
    const end = Math.min(x.length, start + block);
    let any = false;
    for (let i = start; i < end; i++) {
      re[i - start] = x[i];
      if (x[i] !== 0) any = true;
    }
    if (!any) continue;
    fft(re, im);
    for (let k = 0; k < N; k++) {
      const r = re[k] * hr[k] - im[k] * hi[k];
      const m = re[k] * hi[k] + im[k] * hr[k];
      re[k] = r;
      im[k] = m;
    }
    fft(re, im, true);
    const lim = Math.min(N, outLen - start);
    for (let i = 0; i < lim; i++) out[start + i] += re[i] / N;
  }
  return out;
}

/**
 * ConvolverNode-style convolution (normalize = false) of a mono or stereo signal with a mono or stereo IR.
 * @param {Float32Array[]} input
 * @param {Float32Array[]} ir
 * @returns {Float32Array[]} stereo when either side is stereo
 */
export function convolveChannels(input, ir) {
  if (input.length === 1 && ir.length === 1) return [convolve(input[0], ir[0])];
  if (input.length === 1) return [convolve(input[0], ir[0]), convolve(input[0], ir[1] ?? ir[0])];
  if (ir.length === 1) return [convolve(input[0], ir[0]), convolve(input[1], ir[0])];
  return [convolve(input[0], ir[0]), convolve(input[1], ir[1])];
}
