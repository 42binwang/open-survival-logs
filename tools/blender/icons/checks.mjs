// @ts-check
// Perceptual checks for the icon set (WP-P0-12), used by tests/icons.test.js:
//   phash / hamming   a 64-bit DCT perceptual hash (the pHash of Zauner 2010 as the imagehash library computes it:
//                     32 x 32 luma, 2-D DCT-II, the 8 x 8 lowest frequencies against their median), for "icons in a
//                     category are perceptually distinct"
//   textLines         finds text-like marks: rows of four or more glyph-sized, high-contrast marks that sit on a
//                     common line, are similar in height, closely spaced and differ in shape from one another (text
//                     does; a row of identical dots or stars does not), for "no text artifacts on labels"

/** @typedef {import('../../lib/png.mjs').Image} Image */

/**
 * Luma (Rec. 601, 0..255) of an image composited over an opaque background.
 * @param {Image} img @param {[number, number, number]} bg
 */
export function luma(img, bg) {
  const n = img.width * img.height;
  const out = new Float64Array(n);
  const ch = img.channels;
  for (let i = 0; i < n; i++) {
    const a = ch === 4 ? img.data[i * 4 + 3] / 255 : ch === 2 ? img.data[i * 2 + 1] / 255 : 1;
    const g = (/** @type {number} */ k) => img.data[i * ch + (ch >= 3 ? k : 0)] * a + bg[k] * (1 - a);
    out[i] = 0.299 * g(0) + 0.587 * g(1) + 0.114 * g(2);
  }
  return out;
}

/**
 * Box-averages a plane to size x size (the source sides must be multiples of size).
 * @param {Float64Array} plane @param {number} w @param {number} h @param {number} size
 */
function shrink(plane, w, h, size) {
  if (w % size || h % size) throw new Error(`phash: ${w} x ${h} is not a multiple of ${size}`);
  const fx = w / size;
  const fy = h / size;
  const out = new Float64Array(size * size);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[Math.floor(y / fy) * size + Math.floor(x / fx)] += plane[y * w + x];
  for (let i = 0; i < out.length; i++) out[i] /= fx * fy;
  return out;
}

const N = 32;
const COS = Float64Array.from({ length: N * N }, (_, i) => Math.cos((Math.PI * (2 * (i % N) + 1) * Math.floor(i / N)) / (2 * N)));

/**
 * The 64-bit perceptual hash of an image over a background, as a BigInt.
 * @param {Image} img @param {[number, number, number]} [bg]
 */
export function phash(img, bg = [128, 128, 128]) {
  const small = shrink(luma(img, bg), img.width, img.height, N);
  const rows = new Float64Array(N * N);
  for (let y = 0; y < N; y++) for (let u = 0; u < N; u++) {
    let s = 0;
    for (let x = 0; x < N; x++) s += small[y * N + x] * COS[u * N + x];
    rows[y * N + u] = s;
  }
  const low = [];
  for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) {
    let s = 0;
    for (let y = 0; y < N; y++) s += rows[y * N + u] * COS[v * N + y];
    low.push(s);
  }
  const sorted = [...low].sort((a, b) => a - b);
  const med = (sorted[31] + sorted[32]) / 2;
  let h = 0n;
  for (let i = 0; i < 64; i++) if (low[i] > med) h |= 1n << BigInt(i);
  return h;
}

/** Bits that differ between two hashes. @param {bigint} a @param {bigint} b */
export function hamming(a, b) {
  let x = a ^ b;
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

// ------------------------------------------------------------------------------------------ text-like marks

/**
 * @typedef {{ x0: number, y0: number, x1: number, y1: number, area: number, pixels: number[] }} Mark
 * @typedef {{ y: number, x0: number, x1: number, glyphs: number, height: number, variety: number }} TextLine
 */

/** Mean of a plane over (2r + 1)^2 windows, from an integral image. @param {Float64Array} p @param {number} w @param {number} h @param {number} r */
function boxMean(p, w, h, r) {
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += p[y * w + x];
      I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row;
    }
  }
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = Math.max(0, x - r);
    const b = Math.max(0, y - r);
    const c = Math.min(w, x + r + 1);
    const d = Math.min(h, y + r + 1);
    out[y * w + x] = (I[d * (w + 1) + c] - I[b * (w + 1) + c] - I[d * (w + 1) + a] + I[b * (w + 1) + a]) / ((c - a) * (d - b));
  }
  return out;
}

/** 8-connected components of a mask. @param {Uint8Array} mask @param {number} w @param {number} h @returns {Mark[]} */
function components(mask, w, h) {
  const seen = new Uint8Array(w * h);
  /** @type {Mark[]} */
  const out = [];
  const stack = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || seen[i]) continue;
    const m = { x0: w, y0: h, x1: -1, y1: -1, area: 0, pixels: /** @type {number[]} */ ([]) };
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const j = /** @type {number} */ (stack.pop());
      const x = j % w;
      const y = (j - x) / w;
      m.area++;
      if (m.pixels.length < 4096) m.pixels.push(j);
      if (x < m.x0) m.x0 = x;
      if (x > m.x1) m.x1 = x;
      if (y < m.y0) m.y0 = y;
      if (y > m.y1) m.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx;
        const Y = y + dy;
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const k = Y * w + X;
        if (mask[k] && !seen[k]) {
          seen[k] = 1;
          stack.push(k);
        }
      }
    }
    out.push(m);
  }
  return out;
}

/** A mark's coverage on a 6 x 8 grid over its bounding box (its shape, size-free). @param {Mark} m @param {number} w */
function shape(m, w) {
  const gw = 6;
  const gh = 8;
  const f = new Float64Array(gw * gh);
  const bw = m.x1 - m.x0 + 1;
  const bh = m.y1 - m.y0 + 1;
  for (const j of m.pixels) {
    const x = j % w;
    const y = (j - x) / w;
    f[Math.min(gh - 1, Math.floor(((y - m.y0) / bh) * gh)) * gw + Math.min(gw - 1, Math.floor(((x - m.x0) / bw) * gw))] += 1;
  }
  const cell = (bw * bh) / (gw * gh);
  for (let i = 0; i < f.length; i++) f[i] = Math.min(1, f[i] / cell);
  return f;
}

/**
 * Text-like rows in an image.
 * @param {Image} img
 * @param {{ minH?: number, maxH?: number, contrast?: number, bg?: [number, number, number], minGlyphs?: number, minVariety?: number }} [opts]
 *   minH / maxH: glyph heights in pixels to look for (default 2 % and 12 % of the shorter side); contrast: how far a
 *   mark must stand out from its surroundings (0..255, default 28); bg: what transparent pixels show (mid grey)
 * @returns {{ lines: TextLine[], marks: number }}
 */
export function textLines(img, opts = {}) {
  const { width: w, height: h } = img;
  const side = Math.min(w, h);
  const minH = opts.minH ?? Math.max(4, Math.round(side * 0.02));
  const maxH = opts.maxH ?? Math.max(minH + 2, Math.round(side * 0.12));
  const t = opts.contrast ?? 28;
  const minGlyphs = opts.minGlyphs ?? 4;
  const minVariety = opts.minVariety ?? 0.2;
  const L = luma(img, opts.bg ?? [128, 128, 128]);
  const mean = boxMean(L, w, h, maxH);
  /** @type {Mark[]} */
  const marks = [];
  for (const sign of [-1, 1]) {
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) mask[i] = sign * (L[i] - mean[i]) > t ? 1 : 0;
    for (const m of components(mask, w, h)) {
      const bw = m.x1 - m.x0 + 1;
      const bh = m.y1 - m.y0 + 1;
      const fill = m.area / (bw * bh);
      if (bh >= minH && bh <= maxH && bw >= Math.max(1, 0.12 * bh) && bw <= 1.5 * bh && fill >= 0.12 && fill <= 0.85 && m.area >= 6) marks.push(m);
    }
  }
  marks.sort((a, b) => a.x0 - b.x0);
  const parent = marks.map((_, i) => i);
  const find = (/** @type {number} */ i) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  for (let i = 0; i < marks.length; i++) {
    const a = marks[i];
    const ha = a.y1 - a.y0 + 1;
    const cya = (a.y0 + a.y1) / 2;
    for (let j = i + 1; j < marks.length; j++) {
      const b = marks[j];
      if (b.x0 - a.x1 > 0.9 * ha) break;
      const hb = b.y1 - b.y0 + 1;
      const gap = b.x0 - a.x1;
      if (gap < -0.15 * ha) continue;
      if (Math.abs((b.y0 + b.y1) / 2 - cya) > 0.3 * Math.max(ha, hb)) continue;
      if (Math.max(ha, hb) / Math.min(ha, hb) > 1.5) continue;
      if (Math.abs(b.y1 - a.y1) > 0.35 * Math.max(ha, hb)) continue;
      parent[find(j)] = find(i);
    }
  }
  /** @type {Map<number, Mark[]>} */
  const groups = new Map();
  marks.forEach((m, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)?.push(m);
  });
  /** @type {TextLine[]} */
  const lines = [];
  for (const g of groups.values()) {
    if (g.length < minGlyphs) continue;
    const hs = g.map((m) => m.y1 - m.y0 + 1).sort((a, b) => a - b);
    const hMed = hs[Math.floor(hs.length / 2)];
    const x0 = Math.min(...g.map((m) => m.x0));
    const x1 = Math.max(...g.map((m) => m.x1));
    if (x1 - x0 + 1 < 2.5 * hMed) continue;
    const shapes = g.map((m) => shape(m, w));
    let sum = 0;
    let pairs = 0;
    for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++) {
      let d = 0;
      for (let k = 0; k < shapes[i].length; k++) d += Math.abs(shapes[i][k] - shapes[j][k]);
      sum += d / shapes[i].length;
      pairs++;
    }
    const variety = pairs ? sum / pairs : 0;
    if (variety < minVariety) continue;
    lines.push({ y: Math.round(g.reduce((s, m) => s + (m.y0 + m.y1) / 2, 0) / g.length), x0, x1, glyphs: g.length, height: hMed, variety: Math.round(variety * 1000) / 1000 });
  }
  return { lines, marks: marks.length };
}

/**
 * Pairs of icons in one category whose hashes differ in fewer than `minBits`. Only a pair that is the same render
 * (the same files, as config ids bound to one manifest entry are) is exempt; two distinct renders always count,
 * whether or not they are tiers of one recipe.
 * @param {{ id: string, category: string | number, files: string, hash: bigint }[]} icons  files: a key of the entry's files
 * @param {number} minBits
 * @returns {{ a: string, b: string, bits: number }[]}
 */
export function tooClose(icons, minBits) {
  /** @type {{ a: string, b: string, bits: number }[]} */
  const out = [];
  for (let i = 0; i < icons.length; i++) for (let j = i + 1; j < icons.length; j++) {
    const [p, q] = [icons[i], icons[j]];
    if (p.category !== q.category || p.files === q.files) continue;
    const bits = hamming(p.hash, q.hash);
    if (bits < minBits) out.push({ a: p.id, b: q.id, bits });
  }
  return out;
}
