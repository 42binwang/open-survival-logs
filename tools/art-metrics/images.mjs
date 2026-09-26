// @ts-check
// Texture decoding for the art metrics: PNG through tools/lib/png.mjs, Basis Universal KTX2 through the libktx_read
// WebAssembly of tools/materials/checks.mjs, and uncompressed KTX2 (8-bit, half and float RGBA, optionally zstd or
// zlib supercompressed), which lightmaps and test fixtures use. Everything comes out as RGBA, 8-bit or float.
import { readFileSync } from 'node:fs';
import { inflateSync, zstdDecompressSync } from 'node:zlib';
import { decodePng } from '../lib/png.mjs';
import { decodeLevel0, loadTranscoder, parseKtx2 } from '../materials/checks.mjs';

/**
 * @typedef {object} Texture
 * @property {number} width
 * @property {number} height
 * @property {Uint8Array | Float32Array} rgba  4 values per texel; 0 … 255 when `float` is false
 * @property {boolean} float
 * @property {'srgb' | 'linear' | 'unknown'} transfer
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];
const KTX2_SIGNATURE = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb];

/** @param {Uint8Array} b @param {number[]} sig */
const starts = (b, sig) => sig.every((v, i) => b[i] === v);

/** @param {Uint8Array} bytes */
export const isPng = (bytes) => starts(bytes, PNG_SIGNATURE);
/** @param {Uint8Array} bytes */
export const isKtx2 = (bytes) => starts(bytes, KTX2_SIGNATURE);

/**
 * Width and height from the file header, without decoding.
 * @param {Uint8Array} bytes
 * @returns {{ width: number, height: number, format: 'png' | 'ktx2' }}
 */
export function imageSize(bytes) {
  if (isPng(bytes)) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: dv.getUint32(16), height: dv.getUint32(20), format: 'png' };
  }
  if (isKtx2(bytes)) {
    const { header } = parseKtx2(bytes);
    return { width: header.width, height: header.height, format: 'ktx2' };
  }
  throw new Error('neither PNG nor KTX2');
}

/** vkFormat -> [channels, bytes per channel, float, srgb] for the uncompressed formats read here */
const RAW_FORMATS = /** @type {Record<number, [number, number, boolean, boolean]>} */ ({
  9: [1, 1, false, false], // R8_UNORM
  15: [1, 1, false, true], // R8_SRGB
  16: [2, 1, false, false], // R8G8_UNORM
  23: [3, 1, false, false], // R8G8B8_UNORM
  29: [3, 1, false, true], // R8G8B8_SRGB
  37: [4, 1, false, false], // R8G8B8A8_UNORM
  43: [4, 1, false, true], // R8G8B8A8_SRGB
  76: [1, 2, true, false], // R16_SFLOAT
  90: [3, 2, true, false], // R16G16B16_SFLOAT
  97: [4, 2, true, false], // R16G16B16A16_SFLOAT
  100: [1, 4, true, false], // R32_SFLOAT
  106: [3, 4, true, false], // R32G32B32_SFLOAT
  109: [4, 4, true, false], // R32G32B32A32_SFLOAT
});

/** @param {number} h IEEE 754 half */
function halfToFloat(h) {
  const s = h & 0x8000 ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const f = h & 0x3ff;
  if (e === 0) return s * 2 ** -14 * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * 2 ** (e - 15) * (1 + f / 1024);
}

/**
 * One level of an uncompressed KTX2 file.
 * @param {Uint8Array} bytes
 * @param {number} [level]
 * @returns {Texture}
 */
function decodeRawKtx2(bytes, level = 0) {
  const { header: h0, levelIndex, dfd } = parseKtx2(bytes);
  const header = { ...h0, width: Math.max(1, h0.width >> level), height: Math.max(1, h0.height >> level) };
  const fmt = RAW_FORMATS[header.vkFormat];
  if (!fmt) throw new Error(`KTX2 vkFormat ${header.vkFormat} is not supported by the art metrics`);
  const [ch, size, float, srgb] = fmt;
  const lvl = levelIndex[level];
  if (!lvl) throw new Error(`KTX2 has no level ${level}`);
  let data = bytes.subarray(lvl.byteOffset, lvl.byteOffset + lvl.byteLength);
  if (header.supercompression === 'zstd') data = new Uint8Array(zstdDecompressSync(data));
  else if (header.supercompression === 'zlib') data = new Uint8Array(inflateSync(data));
  else if (header.supercompression !== 'none') throw new Error(`KTX2 supercompression ${header.supercompression} is not supported here`);
  const n = header.width * header.height;
  if (data.length < n * ch * size) throw new Error(`KTX2 level ${level} is shorter than its size`);
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const rgba = float ? new Float32Array(n * 4) : new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 4; c++) {
      let v;
      if (c < ch) {
        const o = (i * ch + c) * size;
        v = size === 1 ? data[o] : size === 2 ? halfToFloat(dv.getUint16(o, true)) : dv.getFloat32(o, true);
      } else v = c === 3 ? (float ? 1 : 255) : ch === 1 ? rgba[i * 4] : 0;
      rgba[i * 4 + c] = v;
    }
  }
  const transfer = srgb || dfd.transfer === 'srgb' ? 'srgb' : 'linear';
  return { width: header.width, height: header.height, rgba, float, transfer };
}

/**
 * Decodes level 0 of a PNG or KTX2 file to RGBA.
 * @param {Uint8Array} bytes
 * @returns {Promise<Texture>}
 */
export async function decodeImage(bytes) {
  if (isPng(bytes)) {
    const img = decodePng(bytes);
    return { width: img.width, height: img.height, rgba: img.data, float: false, transfer: 'unknown' };
  }
  if (!isKtx2(bytes)) throw new Error('neither PNG nor KTX2');
  const { header, dfd } = parseKtx2(bytes);
  if (header.vkFormat === 0) {
    const t = await decodeLevel0(bytes);
    return { width: t.width, height: t.height, rgba: t.rgba, float: false, transfer: dfd.transfer === 'srgb' ? 'srgb' : 'linear' };
  }
  return decodeRawKtx2(bytes);
}

/** @param {string} file */
export const decodeImageFile = (file) => decodeImage(new Uint8Array(readFileSync(file)));

/**
 * Every stored mip level of a KTX2 file (a PNG has only its one level), 8-bit RGBA.
 * @param {Uint8Array} bytes
 * @returns {Promise<{ width: number, height: number, rgba: Uint8Array }[]>}
 */
export async function decodeLevels(bytes) {
  if (isPng(bytes)) {
    const t = await decodeImage(bytes);
    return [{ width: t.width, height: t.height, rgba: /** @type {Uint8Array} */ (t.rgba) }];
  }
  const { header } = parseKtx2(bytes);
  const levels = Math.max(1, header.levels);
  if (header.vkFormat !== 0) {
    const out = [];
    for (let l = 0; l < levels; l++) {
      const t = decodeRawKtx2(bytes, l);
      if (t.float) return [];
      out.push({ width: t.width, height: t.height, rgba: /** @type {Uint8Array} */ (t.rgba) });
    }
    return out;
  }
  const ktx = await loadTranscoder();
  const tex = new ktx.ktxTexture(bytes);
  try {
    const rc = tex.transcodeBasis(ktx.TranscodeTarget.RGBA8888, 0);
    const code = typeof rc === 'object' && rc !== null && 'value' in rc ? rc.value : rc;
    if (code !== 0) throw new Error(`transcode failed (${code})`);
    const out = [];
    for (let l = 0; l < levels; l++) {
      const w = Math.max(1, tex.baseWidth >> l);
      const h = Math.max(1, tex.baseHeight >> l);
      out.push({ width: w, height: h, rgba: new Uint8Array(tex.getImage(l, 0, 0)) });
    }
    return out;
  } finally {
    tex.delete();
  }
}

/**
 * An uncompressed KTX2 file (no supercompression): for fixtures and tools that need a raw texture. `mips` are the
 * 8-bit levels 1, 2, … (each half the size of the one before).
 * @param {{ width: number, height: number, rgba: Uint8Array | Float32Array, float?: boolean, srgb?: boolean, mips?: Uint8Array[] }} t
 * @returns {Uint8Array}
 */
export function encodeRawKtx2({ width, height, rgba, float = false, srgb = false, mips = [] }) {
  const vkFormat = float ? 109 : srgb ? 43 : 37;
  const bytesPerTexel = float ? 16 : 4;
  const nLevels = 1 + mips.length;
  const dfdSize = 4 + 24 + 16 * 4;
  const dfdOffset = 80 + 24 * nLevels;
  const dataOffset = Math.ceil((dfdOffset + dfdSize) / 16) * 16;
  const levelBytes = width * height * bytesPerTexel;
  const mipBytes = mips.map((m) => m.length);
  const out = new Uint8Array(dataOffset + levelBytes + mipBytes.reduce((a, b) => a + b, 0));
  out.set([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
  const dv = new DataView(out.buffer);
  const u32 = (/** @type {number} */ o, /** @type {number} */ v) => dv.setUint32(o, v, true);
  u32(12, vkFormat);
  u32(16, float ? 4 : 1);
  u32(20, width);
  u32(24, height);
  u32(28, 0);
  u32(32, 0);
  u32(36, 1);
  u32(40, nLevels);
  u32(44, 0);
  u32(48, dfdOffset);
  u32(52, dfdSize);
  u32(56, 0);
  u32(60, 0);
  dv.setBigUint64(64, 0n, true);
  dv.setBigUint64(72, 0n, true);
  dv.setBigUint64(80, BigInt(dataOffset), true);
  dv.setBigUint64(88, BigInt(levelBytes), true);
  dv.setBigUint64(96, BigInt(levelBytes), true);
  let at = dataOffset + levelBytes;
  mips.forEach((m, k) => {
    const o = 80 + 24 * (k + 1);
    dv.setBigUint64(o, BigInt(at), true);
    dv.setBigUint64(o + 8, BigInt(m.length), true);
    dv.setBigUint64(o + 16, BigInt(m.length), true);
    out.set(m, at);
    at += m.length;
  });
  // data format descriptor: one basic block, RGBSDA model, four samples
  u32(dfdOffset, dfdSize);
  const b = dfdOffset + 4;
  u32(b, 0);
  dv.setUint16(b + 4, 2, true);
  dv.setUint16(b + 6, 24 + 16 * 4, true);
  out[b + 8] = 1; // KHR_DF_MODEL_RGBSDA
  out[b + 9] = 1; // BT.709 primaries
  out[b + 10] = srgb ? 2 : 1;
  out[b + 11] = 0;
  for (let c = 0; c < 4; c++) {
    const s = b + 24 + c * 16;
    const bits = float ? 32 : 8;
    dv.setUint16(s, c * bits, true);
    out[s + 2] = bits - 1;
    out[s + 3] = (c === 3 ? 15 : c) | (float ? 0x80 | 0x40 : 0);
  }
  if (float) {
    const f = new Float32Array(out.buffer, dataOffset, width * height * 4);
    f.set(rgba);
  } else out.set(/** @type {Uint8Array} */ (rgba), dataOffset);
  return out;
}

// ------------------------------------------------------------------------------------------ colour helpers

/** sRGB code 0 … 255 -> linear 0 … 1 */
export const SRGB_TO_LINEAR = Float64Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

/** @param {number} y linear 0 … 1 -> sRGB code 0 … 255 */
export const linearToSrgb = (y) => 255 * (y <= 0.0031308 ? y * 12.92 : 1.055 * y ** (1 / 2.4) - 0.055);

/**
 * Linear Rec. 709 luminance per texel of an 8-bit sRGB base color, with an optional linear tint and a mask of the
 * texels to keep (alpha above half, for cut-out textures).
 * @param {Uint8Array} rgba
 * @param {{ tint?: number[], tintByAlpha?: boolean, opaqueOnly?: boolean }} [opts]
 * @returns {Float64Array}
 */
export function linearLuminance(rgba, { tint, tintByAlpha = false, opaqueOnly = false } = {}) {
  const n = rgba.length / 4;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3];
    if (opaqueOnly && a < 128) continue;
    let r = SRGB_TO_LINEAR[rgba[i * 4]];
    let g = SRGB_TO_LINEAR[rgba[i * 4 + 1]];
    let b = SRGB_TO_LINEAR[rgba[i * 4 + 2]];
    if (tint) {
      const w = tintByAlpha ? a / 255 : 1;
      r *= 1 - w + w * tint[0];
      g *= 1 - w + w * tint[1];
      b *= 1 - w + w * tint[2];
    }
    out.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
  }
  return Float64Array.from(out);
}

/** '#rrggbb' -> linear RGB */
export function hexToLinear(/** @type {string} */ hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => SRGB_TO_LINEAR[parseInt(h.slice(i, i + 2), 16)]);
}

/**
 * Percentiles (0 … 100) of a sample, linear interpolation between order statistics.
 * @param {ArrayLike<number>} values
 * @param {number[]} ps
 */
export function percentiles(values, ps) {
  const a = Float64Array.from(values).sort();
  if (!a.length) return ps.map(() => NaN);
  return ps.map((p) => {
    const x = (p / 100) * (a.length - 1);
    const lo = Math.floor(x);
    const hi = Math.min(a.length - 1, lo + 1);
    return a[lo] + (a[hi] - a[lo]) * (x - lo);
  });
}

/**
 * CIELAB (D65) of an sRGB colour given as linear RGB.
 * @param {number[]} lin
 * @returns {[number, number, number]}
 */
export function linearToLab([r, g, b]) {
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (/** @type {number} */ t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
