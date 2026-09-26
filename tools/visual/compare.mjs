// @ts-check
// Screenshot comparison for the visual regression check: SSIM (tools/lib/ssim.mjs) per RGB channel, judged on the
// lowest channel, over the whole shot and over each tile of a 16 × 9 grid (120 × 120 px at 1920 × 1080), so a local
// change a whole-image mean would dilute still fails; and a difference heat map for the report. Alpha is left out:
// screenshots are opaque, and a constant channel would score 1 and lift the mean.
import { decodePng, encodePng } from '../lib/png.mjs';
import { ssim } from '../lib/ssim.mjs';

/** The tile grid and the SSIM every tile must reach (the whole shot must reach the list's threshold, ≥ 0.98). */
export const TILES = Object.freeze({ cols: 16, rows: 9, threshold: 0.95 });

/** @typedef {import('../lib/png.mjs').Image} Image */

/**
 * The RGB channels of an image.
 * @param {Image} img
 * @returns {Image}
 */
export function toRgb(img) {
  if (img.channels === 3) return img;
  const n = img.width * img.height;
  const data = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) data[i * 3 + c] = img.data[i * img.channels + Math.min(c, img.channels - 1)];
  }
  return { width: img.width, height: img.height, channels: 3, data };
}

/**
 * @param {Image} img  RGB
 * @param {number} x0
 * @param {number} y0
 * @param {number} w
 * @param {number} h
 * @returns {Image}
 */
function crop(img, x0, y0, w, h) {
  const data = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) data.set(img.data.subarray(((y0 + y) * img.width + x0) * 3, ((y0 + y) * img.width + x0 + w) * 3), y * w * 3);
  return { width: w, height: h, channels: 3, data };
}

/**
 * SSIM of every tile (lowest channel): the worst tile, where it is, and how many fall under the tile threshold.
 * @param {Image} a  RGB
 * @param {Image} b  RGB, same size
 * @returns {{ worst: number, at: [number, number], below: number, tiles: number }}
 */
export function tileSsim(a, b) {
  const tw = Math.floor(a.width / TILES.cols);
  const th = Math.floor(a.height / TILES.rows);
  let worst = 1;
  /** @type {[number, number]} */
  let at = [0, 0];
  let below = 0;
  for (let r = 0; r < TILES.rows; r++) {
    for (let c = 0; c < TILES.cols; c++) {
      const v = ssim(crop(a, c * tw, r * th, tw, th), crop(b, c * tw, r * th, tw, th)).min;
      if (v < TILES.threshold) below++;
      if (v < worst) {
        worst = v;
        at = [c, r];
      }
    }
  }
  return { worst, at, below, tiles: TILES.cols * TILES.rows };
}

/**
 * @param {Uint8Array} baselinePng
 * @param {Uint8Array} actualPng
 * @returns {{ ssim: number, channels: number[], size: string | null, tiles: ReturnType<typeof tileSsim> | null }}  size: why the sizes differ, else null
 */
export function comparePngs(baselinePng, actualPng) {
  const a = toRgb(decodePng(baselinePng));
  const b = toRgb(decodePng(actualPng));
  if (a.width !== b.width || a.height !== b.height) return { ssim: 0, channels: [], size: `baseline ${a.width}×${a.height}, capture ${b.width}×${b.height}`, tiles: null };
  const r = ssim(a, b);
  const tiles = a.width >= TILES.cols * 11 && a.height >= TILES.rows * 11 ? tileSsim(a, b) : null;
  return { ssim: r.min, channels: r.channels, size: null, tiles };
}

/**
 * A heat map of the per-pixel difference (max over RGB), dark where equal, red where the capture differs.
 * @param {Uint8Array} baselinePng
 * @param {Uint8Array} actualPng
 * @returns {Buffer | null}
 */
export function diffPng(baselinePng, actualPng) {
  const a = toRgb(decodePng(baselinePng));
  const b = toRgb(decodePng(actualPng));
  if (a.width !== b.width || a.height !== b.height) return null;
  const n = a.width * a.height;
  const out = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    let d = 0;
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a.data[i * 3 + c] - b.data[i * 3 + c]));
    const base = (a.data[i * 3] + a.data[i * 3 + 1] + a.data[i * 3 + 2]) / 12;
    out[i * 3] = Math.min(255, base + d * 4);
    out[i * 3 + 1] = base;
    out[i * 3 + 2] = base;
  }
  return encodePng({ width: a.width, height: a.height, channels: 3, data: out });
}
