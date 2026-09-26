// @ts-check
// Structural similarity (Wang, Bovik, Sheikh and Simoncelli 2004): an 11 × 11 Gaussian window (sigma 1.5),
// K1 0.01, K2 0.03, population covariances, averaged over the pixels whose window lies inside the image. This is
// scikit-image's `structural_similarity(gaussian_weights=True, sigma=1.5, use_sample_covariance=False)` and the
// reference fixture test holds it to that implementation within 1e-3. Shared by tools/asset-lock.mjs and the visual
// regression tools (WP-P0-11).
import { channel } from './png.mjs';

export const SIGMA = 1.5;
export const RADIUS = 5; // scikit-image: int(truncate 3.5 * sigma + 0.5)

const KERNEL = (() => {
  const k = Float64Array.from({ length: 2 * RADIUS + 1 }, (_, i) => Math.exp(-((i - RADIUS) ** 2) / (2 * SIGMA * SIGMA)));
  const sum = k.reduce((a, b) => a + b, 0);
  return k.map((v) => v / sum);
})();

/**
 * Gaussian-weighted local means of a plane, valid region only: (w − 2r) × (h − 2r).
 * @param {Float64Array} src
 * @param {number} w
 * @param {number} h
 */
function blur(src, w, h) {
  const ow = w - 2 * RADIUS;
  const oh = h - 2 * RADIUS;
  const tmp = new Float64Array(ow * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < ow; x++) {
      let s = 0;
      for (let k = 0; k <= 2 * RADIUS; k++) s += KERNEL[k] * src[row + x + k];
      tmp[y * ow + x] = s;
    }
  }
  const out = new Float64Array(ow * oh);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      let s = 0;
      for (let k = 0; k <= 2 * RADIUS; k++) s += KERNEL[k] * tmp[(y + k) * ow + x];
      out[y * ow + x] = s;
    }
  }
  return out;
}

/**
 * Mean SSIM of two planes of the same size.
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @param {number} w
 * @param {number} h
 * @param {number} [dataRange]  255 for 8-bit data
 */
export function ssimPlane(a, b, w, h, dataRange = 255) {
  if (a.length !== w * h || b.length !== w * h) throw new Error('planes do not match the size');
  if (w <= 2 * RADIUS || h <= 2 * RADIUS) throw new Error(`SSIM needs images larger than ${2 * RADIUS + 1} × ${2 * RADIUS + 1}`);
  const c1 = (0.01 * dataRange) ** 2;
  const c2 = (0.03 * dataRange) ** 2;
  const n = w * h;
  const aa = new Float64Array(n);
  const bb = new Float64Array(n);
  const ab = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    aa[i] = a[i] * a[i];
    bb[i] = b[i] * b[i];
    ab[i] = a[i] * b[i];
  }
  const [ma, mb, maa, mbb, mab] = [a, b, aa, bb, ab].map((p) => blur(p, w, h));
  let sum = 0;
  for (let i = 0; i < ma.length; i++) {
    const va = maa[i] - ma[i] * ma[i];
    const vb = mbb[i] - mb[i] * mb[i];
    const cov = mab[i] - ma[i] * mb[i];
    sum += ((2 * ma[i] * mb[i] + c1) * (2 * cov + c2)) / ((ma[i] * ma[i] + mb[i] * mb[i] + c1) * (va + vb + c2));
  }
  return sum / ma.length;
}

/**
 * SSIM of two 8-bit images with the same size and channel count, per channel and their mean and minimum.
 * @param {import('./png.mjs').Image} a
 * @param {import('./png.mjs').Image} b
 * @returns {{ mean: number, min: number, channels: number[] }}
 */
export function ssim(a, b) {
  if (a.width !== b.width || a.height !== b.height || a.channels !== b.channels) {
    throw new Error(`images differ in size: ${a.width}×${a.height}×${a.channels} vs ${b.width}×${b.height}×${b.channels}`);
  }
  const channels = [];
  for (let c = 0; c < a.channels; c++) channels.push(ssimPlane(channel(a, c), channel(b, c), a.width, a.height));
  return { mean: channels.reduce((s, v) => s + v, 0) / channels.length, min: Math.min(...channels), channels };
}
