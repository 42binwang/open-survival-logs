// @ts-check
// Objective material checks on shipped KTX2 textures: container validation, decoding (KTX-Software libktx_read
// WebAssembly committed in tools/bin/ktx-wasm, no npm dependencies), PBR validity, seamless tiling and texel density.
// Used by tests/materials.test.js; tools/art-metrics.mjs can import the same functions.
// Mirrors tools/materials/slmat/stats.py, which the build runs before writing library.json.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..', '..');
const WASM_DIR = join(ROOT, 'tools', 'bin', 'ktx-wasm');

// ------------------------------------------------------------------------------------------ KTX2 container

const KTX2_ID = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
export const SUPERCOMPRESSION = { 0: 'none', 1: 'basis-lz', 2: 'zstd', 3: 'zlib' };
export const COLOR_MODEL = { 163: 'etc1s', 166: 'uastc' };
export const TRANSFER = { 1: 'linear', 2: 'srgb' };

/**
 * Parses the KTX2 header, level index, data format descriptor and key/value data.
 * @param {Uint8Array} bytes
 */
export function parseKtx2(bytes) {
  for (let i = 0; i < KTX2_ID.length; i++) if (bytes[i] !== KTX2_ID[i]) throw new Error('not a KTX2 file');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (/** @type {number} */ o) => dv.getUint32(o, true);
  const u64 = (/** @type {number} */ o) => Number(dv.getBigUint64(o, true));
  const header = {
    vkFormat: u32(12),
    typeSize: u32(16),
    width: u32(20),
    height: u32(24),
    depth: u32(28),
    layers: u32(32),
    faces: u32(36),
    levels: u32(40),
    supercompression: SUPERCOMPRESSION[/** @type {0|1|2|3} */ (u32(44))] ?? `unknown(${u32(44)})`,
  };
  const dfdOffset = u32(48);
  const kvdOffset = u32(56);
  const kvdLength = u32(60);
  const levelIndex = [];
  for (let i = 0; i < Math.max(1, header.levels); i++) {
    const o = 80 + i * 24;
    levelIndex.push({ byteOffset: u64(o), byteLength: u64(o + 8), uncompressedByteLength: u64(o + 16) });
  }
  const block = dfdOffset + 4;
  const descriptorBlockSize = dv.getUint16(block + 6, true);
  const model = bytes[block + 8];
  const samples = (descriptorBlockSize - 24) / 16;
  const dfd = {
    colorModel: COLOR_MODEL[/** @type {163|166} */ (model)] ?? `model(${model})`,
    primaries: bytes[block + 9],
    transfer: TRANSFER[/** @type {1|2} */ (bytes[block + 10])] ?? `tf(${bytes[block + 10]})`,
    samples,
    channelIds: Array.from({ length: samples }, (_, s) => (bytes[block + 24 + s * 16 + 3] & 0x0f)),
  };
  /** @type {Record<string, string>} */
  const kvd = {};
  let p = kvdOffset;
  while (p < kvdOffset + kvdLength) {
    const len = u32(p);
    const entry = bytes.subarray(p + 4, p + 4 + len);
    const nul = entry.indexOf(0);
    kvd[new TextDecoder().decode(entry.subarray(0, nul))] = new TextDecoder().decode(entry.subarray(nul + 1)).replace(/\0+$/, '');
    p += 4 + len + ((4 - (len % 4)) % 4);
  }
  return { header, levelIndex, dfd, kvd };
}

// ---------------------------------------------------------------------------------------------- decoding

/** @type {Promise<any> | null} */
let ktxModule = null;

/** Loads the libktx_read WebAssembly module (KTX-Software 4.4.2, Apache-2.0) from tools/bin/ktx-wasm. */
export function loadTranscoder() {
  if (!ktxModule) {
    const require = createRequire(import.meta.url);
    // A computed path keeps type checkers out of the emscripten output.
    const create = require(join(WASM_DIR, 'libktx_read.cjs'));
    ktxModule = create({ wasmBinary: readFileSync(join(WASM_DIR, 'libktx_read.wasm')) });
  }
  return ktxModule;
}

/**
 * Decodes level 0 of a Basis Universal KTX2 file to RGBA8.
 * @param {Uint8Array} bytes
 * @returns {Promise<{ width: number, height: number, rgba: Uint8Array }>}
 */
export async function decodeLevel0(bytes) {
  const ktx = await loadTranscoder();
  const tex = new ktx.ktxTexture(bytes);
  try {
    if (!tex.needsTranscoding) throw new Error('not a Basis Universal KTX2 file (nothing to transcode)');
    const rc = tex.transcodeBasis(ktx.TranscodeTarget.RGBA8888, 0);
    const code = typeof rc === 'object' && rc !== null && 'value' in rc ? rc.value : rc;
    if (code !== 0) throw new Error(`transcode failed (${code})`);
    const img = tex.getImage(0, 0, 0);
    return { width: tex.baseWidth, height: tex.baseHeight, rgba: new Uint8Array(img) };
  } finally {
    tex.delete();
  }
}

// ------------------------------------------------------------------------------------------------ math

const SRGB_TO_LIN = new Float64Array(256).map((_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

/** @param {number} y linear 0..1 */
export const linToSrgb255 = (y) => 255 * (y <= 0.0031308 ? y * 12.92 : 1.055 * y ** (1 / 2.4) - 0.055);

/** @param {number} hex like '#aabbcc' */
export function hexToLinear(hex) {
  const h = String(hex).replace('#', '');
  return [0, 2, 4].map((i) => SRGB_TO_LIN[parseInt(h.slice(i, i + 2), 16)]);
}

/** @param {ArrayLike<number>} values @param {number[]} ps percentiles 0..100 */
export function percentiles(values, ps) {
  const a = Float64Array.from(values).sort();
  return ps.map((p) => {
    const x = (p / 100) * (a.length - 1);
    const lo = Math.floor(x);
    const hi = Math.min(a.length - 1, lo + 1);
    return a[lo] + (a[hi] - a[lo]) * (x - lo);
  });
}

/** @param {ArrayLike<number>} a */
function meanStd(a) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  const mean = s / a.length;
  let v = 0;
  for (let i = 0; i < a.length; i++) v += (a[i] - mean) ** 2;
  return { mean, std: Math.sqrt(v / a.length) };
}

// ----------------------------------------------------------------------------------------------- stats

/**
 * Per-pixel luminance (Rec. 709 on linear RGB) re-encoded to sRGB 0-255, optionally after a linear tint.
 * @param {Uint8Array} rgba @param {number[]} [tint] linear RGB multiplier @param {boolean} [alphaMask]
 */
export function luminanceSrgb(rgba, tint, alphaMask = false) {
  const n = rgba.length / 4;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let r = SRGB_TO_LIN[rgba[i * 4]];
    let g = SRGB_TO_LIN[rgba[i * 4 + 1]];
    let b = SRGB_TO_LIN[rgba[i * 4 + 2]];
    if (tint) {
      const w = alphaMask ? rgba[i * 4 + 3] / 255 : 1;
      r *= 1 - w + w * tint[0];
      g *= 1 - w + w * tint[1];
      b *= 1 - w + w * tint[2];
    }
    out[i] = linToSrgb255(0.2126 * r + 0.7152 * g + 0.0722 * b);
  }
  return out;
}

/**
 * Per-pixel linear luminance (Rec. 709 on linear RGB), optionally after a linear tint (docs/ART.md §7.2 units).
 * @param {Uint8Array} rgba @param {number[]} [tint] @param {boolean} [alphaMask]
 */
export function linearLuminance(rgba, tint, alphaMask = false) {
  const n = rgba.length / 4;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const w = tint ? (alphaMask ? rgba[i * 4 + 3] / 255 : 1) : 0;
    const t = tint || [1, 1, 1];
    out[i] =
      0.2126 * SRGB_TO_LIN[rgba[i * 4]] * (1 - w + w * t[0]) +
      0.7152 * SRGB_TO_LIN[rgba[i * 4 + 1]] * (1 - w + w * t[1]) +
      0.0722 * SRGB_TO_LIN[rgba[i * 4 + 2]] * (1 - w + w * t[2]);
  }
  return out;
}

/**
 * Largest block-mean deviation from the tile mean, blocks × blocks over the tile, for each block count
 * (tools/art-metrics.mjs tile-repetition).
 * @param {ArrayLike<number>} lum row-major @param {number} w @param {number} h @param {number[]} blockCounts
 */
export function repetition(lum, w, h, blockCounts) {
  /** @type {Record<string, number>} */
  const out = {};
  let total = 0;
  for (let i = 0; i < lum.length; i++) total += lum[i];
  const mean = total / lum.length || 1e-9;
  for (const b of blockCounts) {
    const sums = new Float64Array(b * b);
    const counts = new Float64Array(b * b);
    for (let y = 0; y < h; y++) {
      const by = Math.min(b - 1, Math.floor((y * b) / h));
      for (let x = 0; x < w; x++) {
        const k = by * b + Math.min(b - 1, Math.floor((x * b) / w));
        sums[k] += lum[y * w + x];
        counts[k]++;
      }
    }
    let worst = 0;
    for (let k = 0; k < sums.length; k++) worst = Math.max(worst, Math.abs(sums[k] / counts[k] - mean) / mean);
    out[b] = worst;
  }
  return out;
}

/**
 * Mean absolute RGB difference (sRGB codes) between an RGBA image and itself cyclically shifted by (dx, dy).
 * @param {Uint8Array} rgba @param {number} w @param {number} h @param {number} dx @param {number} dy
 */
function shiftDiff(rgba, w, h, dx, dy) {
  let sum = 0;
  for (let y = 0; y < h; y++) {
    const sy = (y + dy) % h;
    for (let x = 0; x < w; x++) {
      const a = (y * w + x) * 4;
      const b = (sy * w + ((x + dx) % w)) * 4;
      sum += Math.abs(rgba[a] - rgba[b]) + Math.abs(rgba[a + 1] - rgba[b + 1]) + Math.abs(rgba[a + 2] - rgba[b + 2]);
    }
  }
  return sum / (w * h * 3);
}

/**
 * Is the base color a copy of itself shifted by a fraction of the tile along x or y (tools/materials/slmat/stats.py
 * self_copy)? minDiffCodes is the smallest mean RGB difference over those shifts; ratio is that over the difference
 * at an unrelated shift (0.37, 0.61 of the tile). Shifts that are whole pattern periods are skipped.
 * @param {Uint8Array} rgba @param {number} w @param {number} h @param {number[]} fractions
 * @param {number | null} [patternPx]
 */
export function selfCopy(rgba, w, h, fractions, patternPx = null) {
  const ref = shiftDiff(rgba, w, h, Math.trunc(0.37 * w), Math.trunc(0.61 * h)) + 1e-6;
  let best = Infinity;
  let at = '';
  for (const f of fractions) {
    for (const [axis, n] of /** @type {const} */ ([['x', w], ['y', h]])) {
      const d = Math.round(n * f);
      if (d < 1 || (patternPx && d % patternPx === 0)) continue;
      const diff = axis === 'x' ? shiftDiff(rgba, w, h, d, 0) : shiftDiff(rgba, w, h, 0, d);
      if (diff < best) [best, at] = [diff, `${axis} 1/${Math.round(1 / f)}`];
    }
  }
  return { minDiffCodes: best, ratio: best / ref, at };
}

/**
 * Periodic box blur of a row-major image, radius r along x then y.
 * @param {Float64Array} img @param {number} w @param {number} h @param {number} r
 */
function boxBlur(img, w, h, r) {
  const tmp = new Float64Array(w * h);
  const out = new Float64Array(w * h);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += img[y * w + ((k + w) % w)];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = s / n;
      s += img[y * w + ((x + r + 1) % w)] - img[y * w + ((x - r + w) % w)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[((k + h) % h) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / n;
      s += tmp[((y + r + 1) % h) * w + x] - tmp[((y - r + h) % h) * w + x];
    }
  }
  return out;
}

/**
 * Does knot-scale detail recur at a fixed period? The base color's log luminance is band-passed to knot size
 * (a box difference, radii rLo..rHi texels); returns the correlation between that band and itself shifted by the
 * period along x and along y, and the fraction of knot-like dark spots (band below -3 std, local minima) that
 * reappear (below -1.5 std within 1 texel) one period to the right, and at an unrelated shift along the same rows
 * (0.37 of the tile) for the chance level.
 * @param {Uint8Array} rgba @param {number} w @param {number} h @param {number} periodPx @param {number} rLo @param {number} rHi
 */
export function periodRecurrence(rgba, w, h, periodPx, rLo, rHi) {
  const lum = linearLuminance(rgba, [1, 1, 1], false);
  const L = Float64Array.from(lum, (v) => Math.log(Math.max(v, 1e-4)));
  const a = boxBlur(L, w, h, rLo);
  const b = boxBlur(L, w, h, rHi);
  const band = Float64Array.from(a, (v, i) => v - b[i]);
  let m = 0;
  for (const v of band) m += v;
  m /= band.length;
  let s2 = 0;
  for (let i = 0; i < band.length; i++) s2 += (band[i] -= m) ** 2;
  const sd = Math.sqrt(s2 / band.length) || 1e-9;
  /** @param {number} dx @param {number} dy */
  const corr = (dx, dy) => {
    let s = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) s += band[y * w + x] * band[((y + dy) % h) * w + ((x + dx) % w)];
    return s / band.length / (sd * sd);
  };
  let spots = 0;
  let again = 0;
  let chance = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = band[y * w + x];
      if (v > -3 * sd) continue;
      let isMin = true;
      for (let dy = -2; dy <= 2 && isMin; dy++) for (let dx = -2; dx <= 2; dx++) if (band[((y + dy + h) % h) * w + ((x + dx + w) % w)] < v) { isMin = false; break; }
      if (!isMin) continue;
      spots++;
      /** @param {number} ox @param {number} oy */
      const dark = (ox, oy) => {
        let min = Infinity;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) min = Math.min(min, band[((y + oy + dy + h) % h) * w + ((x + ox + dx) % w)]);
        return min < -1.5 * sd;
      };
      if (dark(periodPx, 0)) again++;
      if (dark(Math.trunc(0.37 * w), 0)) chance++;
    }
  }
  return { corrX: corr(periodPx % w, 0), corrY: corr(0, periodPx % h), spots, recurring: spots ? again / spots : 0, chance: spots ? chance / spots : 0 };
}

/** The uses a tint preset can be restricted to (params.tint.presetUse; tools/blender/materials/tints.py USES). */
export const PRESET_USES = ['floor', 'wall', 'furniture', 'accent'];

/**
 * Why a library material's tint preset may not be bound to a use, or null when it may: params.tint.presetUse maps a
 * preset to the uses it is allowed for; a preset without an entry (or a hex colour) is allowed everywhere.
 * @param {any} entry a library.json material entry @param {string | undefined} preset (undefined: the default)
 * @param {string} use
 * @returns {string | null}
 */
export function presetUseProblem(entry, preset, use) {
  if (!PRESET_USES.includes(use)) return `unknown use '${use}'; one of ${PRESET_USES.join(', ')}`;
  const tint = entry.params.tint ?? {};
  const name = preset ?? tint.default;
  if (typeof name === 'string' && name.startsWith('#')) return null;
  if (!tint.presets || !(name in tint.presets)) return `${entry.id}: unknown tint preset '${name}'`;
  const allowed = tint.presetUse?.[name];
  return allowed && !allowed.includes(use) ? `${entry.id}: tint preset '${name}' is for ${allowed.join(', ')}, not ${use}` : null;
}

/**
 * The shared variation mask's offset for an instance seed, mod 1 (library.conventions.variation): float64 products
 * wrapped to [0, 1), identical to tools/blender/materials/library.py seed_offset().
 * @param {number} seed integer 0..2^32-1
 * @returns {[number, number]}
 */
export function seedOffset(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 2 ** 32 - 1) throw new RangeError(`seed ${seed} outside 0..2^32-1`);
  return [(seed * 0.6180339887498949) % 1, (seed * 0.4142135623730951) % 1];
}

/** @param {Uint8Array} rgba */
export function baseColorStats(rgba) {
  const lin = linearLuminance(rgba);
  const [albedoP005, albedoMedian, albedoP995] = percentiles(lin, [0.5, 50, 99.5]);
  const l = luminanceSrgb(rgba);
  const [p005, median, p995] = percentiles(l, [0.5, 50, 99.5]);
  let cmin = 255;
  let cmax = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      cmin = Math.min(cmin, rgba[i + c]);
      cmax = Math.max(cmax, rgba[i + c]);
    }
  }
  return { albedoMedian, albedoP005, albedoP995, lumMean: meanStd(l).mean, lumP005: p005, lumMedian: median, lumP995: p995, channelMin: cmin, channelMax: cmax };
}

/** @param {Uint8Array} rgba @param {{ low: number, high: number }} sat */
export function ormStats(rgba, sat) {
  const n = rgba.length / 4;
  const rough = new Float64Array(n);
  let ao = 0;
  let metal = 0;
  let saturated = 0;
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4 + 1];
    rough[i] = r / 255;
    ao += rgba[i * 4] / 255;
    metal += rgba[i * 4 + 2] / 255;
    if (r <= sat.low || r >= sat.high) saturated++;
  }
  const { mean, std } = meanStd(rough);
  const [p01, roughnessMedian, p99] = percentiles(rough, [1, 50, 99]);
  return { roughnessMedian, aoMean: ao / n, roughnessMean: mean, roughnessStd: std, roughnessP01: p01, roughnessP99: p99, roughnessSaturated: saturated / n, metallicMean: metal / n };
}

/** @param {Uint8Array} rgba */
export function normalStats(rgba) {
  const n = rgba.length / 4;
  const err = new Float64Array(n);
  let minZ = Infinity;
  for (let i = 0; i < n; i++) {
    const x = rgba[i * 4] / 127.5 - 1;
    const y = rgba[i * 4 + 1] / 127.5 - 1;
    const z = rgba[i * 4 + 2] / 127.5 - 1;
    err[i] = Math.abs(Math.hypot(x, y, z) - 1);
    minZ = Math.min(minZ, z);
  }
  const [p99] = percentiles(err, [99]);
  return { lengthErrMean: meanStd(err).mean, lengthErrP99: p99, minZ };
}

/**
 * Wrap-seam discontinuity vs interior adjacent-pixel steps (both axes) for one channel.
 * @param {ArrayLike<number>} img row-major values @param {number} w @param {number} h
 */
export function seamMetric(img, w, h) {
  const cols = new Float64Array(w);
  const rows = new Float64Array(h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = img[y * w + x];
      cols[x] += Math.abs(img[y * w + ((x + 1) % w)] - v);
      rows[y] += Math.abs(img[((y + 1) % h) * w + x] - v);
    }
  }
  /** @param {Float64Array} e @param {number} n */
  const score = (e, n) => {
    const interior = e.subarray(0, e.length - 1);
    const seam = e[e.length - 1] / n;
    const { mean, std } = meanStd(Array.from(interior, (v) => v / n));
    const [p99] = percentiles(Array.from(interior, (v) => v / n), [99]);
    return { z: (seam - mean) / (std + 1e-9), ratio: seam / (p99 + 1e-9) };
  };
  return { x: score(cols, h), y: score(rows, w) };
}

/** @param {{ x: { z: number, ratio: number }, y: { z: number, ratio: number } }} m @param {{ maxZ: number, maxRatioToP99: number }} cfg */
export const seamOk = (m, cfg) => [m.x, m.y].every((v) => v.z <= cfg.maxZ || v.ratio <= cfg.maxRatioToP99);

/**
 * Channels whose wrap seams are checked.
 * @param {{ baseColor: Uint8Array, normal: Uint8Array, orm: Uint8Array }} d
 */
export function seamChannels(d) {
  const n = d.orm.length / 4;
  const pick = (/** @type {Uint8Array} */ a, /** @type {number} */ c) => Float64Array.from({ length: n }, (_, i) => a[i * 4 + c]);
  const lum = Float64Array.from(luminanceSrgb(d.baseColor), (v) => v);
  return { baseColor: lum, normalX: pick(d.normal, 0), normalY: pick(d.normal, 1), roughness: pick(d.orm, 1) };
}

// ------------------------------------------------------------------------------------------- config

/** @param {string} rel */
export const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));

export function loadConfig() {
  return {
    library: readJson('assets/materials/library.json'),
    targets: readJson('tools/materials/targets.json'),
    bands: readJson('tools/materials/bands.json'),
  };
}

/**
 * Value limits for a family: dielectric / metal defaults, overridable per family.
 * @param {any} bands @param {string} family
 */
export function familyLimits(bands, family) {
  const fam = bands.families[family];
  const cls = fam.metal === 'full' ? bands.metal : bands.dielectric;
  return { ...fam, min: fam.min ?? cls.min, max: fam.max ?? cls.max };
}
