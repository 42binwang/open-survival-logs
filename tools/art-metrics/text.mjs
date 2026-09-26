// @ts-check
// Text-artifact detection: rows of glyph-like blobs. Ink is local contrast against a box-blurred mean (dark on light
// and light on dark, opaque texels only); blobs are 8-connected components whose size and fill look like letters;
// a row is a run of such blobs of similar height on one baseline, close together, with varied widths (periodic
// weaves, tiles and dots have equal widths and do not count). No OCR: garbled pseudo-text counts as much as words.
import { TEXT } from './standard.mjs';

/**
 * @typedef {{ x: number, y: number, w: number, h: number, n: number, stroke: number }} Blob  stroke: 2 × area / boundary texels, a stroke-width estimate
 * @typedef {{ x: number, y: number, w: number, h: number, glyphs: number }} TextRow
 */

/**
 * @param {Uint8Array} rgba
 * @param {number} w
 * @param {number} h
 * @param {typeof TEXT} [opts]
 * @returns {TextRow[]}
 */
export function findTextRows(rgba, w, h, opts = TEXT) {
  const n = w * h;
  const lum = new Float64Array(n);
  const opaque = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    lum[i] = (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255;
    opaque[i] = rgba[i * 4 + 3] >= 128 ? 1 : 0;
  }
  const side = Math.min(w, h);
  const r = Math.max(2, Math.round(side / 32));
  // integral image of luminance over opaque texels
  const sum = new Float64Array((w + 1) * (h + 1));
  const cnt = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rs = 0;
    let rc = 0;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      rs += opaque[i] ? lum[i] : 0;
      rc += opaque[i];
      sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + rs;
      cnt[(y + 1) * (w + 1) + x + 1] = cnt[y * (w + 1) + x + 1] + rc;
    }
  }
  const box = (/** @type {Float64Array} */ t, /** @type {number} */ x0, /** @type {number} */ y0, /** @type {number} */ x1, /** @type {number} */ y1) =>
    t[y1 * (w + 1) + x1] - t[y0 * (w + 1) + x1] - t[y1 * (w + 1) + x0] + t[y0 * (w + 1) + x0];
  const dark = new Uint8Array(n);
  const light = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!opaque[i]) continue;
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const c = box(cnt, x0, y0, x1, y1);
      const mean = c ? box(sum, x0, y0, x1, y1) / c : lum[i];
      if (lum[i] < mean - opts.contrast) dark[i] = 1;
      else if (lum[i] > mean + opts.contrast) light[i] = 1;
    }
  }
  const minH = opts.minGlyphPx;
  const maxH = Math.max(minH + 1, Math.round(side * opts.maxGlyphHeightShare));
  const all = [...rowsOf(glyphs(dark, w, h, minH, maxH), opts), ...rowsOf(glyphs(light, w, h, minH, maxH), opts)];
  // the counters inside a row's letters (the holes of B, O, e) form rows of the other polarity inside its box
  const inside = (/** @type {TextRow} */ a, /** @type {TextRow} */ b) => a !== b && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
  const rows = all.filter((r) => !all.some((o) => inside(r, o)));
  return rows.sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Glyph-like connected components of a mask.
 * @param {Uint8Array} mask
 * @param {number} w
 * @param {number} h
 * @param {number} minH
 * @param {number} maxH
 * @returns {Blob[]}
 */
function glyphs(mask, w, h, minH, maxH) {
  const seen = new Uint8Array(w * h);
  /** @type {Blob[]} */
  const out = [];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || seen[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    let count = 0;
    let edge = 0;
    while (top) {
      const i = stack[--top];
      const x = i % w;
      const y = (i - x) / w;
      count++;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w]) edge++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w || (!dx && !dy)) continue;
          const j = yy * w + xx;
          if (mask[j] && !seen[j]) {
            seen[j] = 1;
            stack[top++] = j;
          }
        }
      }
    }
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const fill = count / (bw * bh);
    const touches = minX === 0 || minY === 0 || maxX === w - 1 || maxY === h - 1;
    if (!touches && bh >= minH && bh <= maxH && bw >= 0.15 * bh && bw <= 1.6 * bh && fill >= 0.12 && fill <= 0.9) out.push({ x: minX, y: minY, w: bw, h: bh, n: count, stroke: (2 * count) / Math.max(1, edge) });
  }
  return out;
}

/**
 * Chains blobs into rows and keeps the text-like ones.
 * @param {Blob[]} blobs
 * @param {typeof TEXT} opts
 * @returns {TextRow[]}
 */
function rowsOf(blobs, opts) {
  /** @type {Blob[][]} */
  const rows = [];
  for (const g of [...blobs].sort((a, b) => a.x - b.x)) {
    let placed = false;
    for (const row of rows) {
      const last = row[row.length - 1];
      const hMean = row.reduce((a, b) => a + b.h, 0) / row.length;
      const bottom = row.reduce((a, b) => a + b.y + b.h, 0) / row.length;
      const gap = g.x - (last.x + last.w);
      if (Math.abs(g.h - hMean) / hMean > opts.heightTolerance) continue;
      if (Math.abs(g.y + g.h - bottom) > 0.25 * hMean) continue;
      if (gap < -0.2 * hMean || gap > opts.maxGapRatio * hMean) continue;
      row.push(g);
      placed = true;
      break;
    }
    if (!placed) rows.push([g]);
  }
  /** @type {TextRow[]} */
  const out = [];
  for (const row of rows) {
    const hRow = row.reduce((a, b) => a + b.h, 0) / row.length;
    const short = hRow < opts.shortRowPx;
    if (row.length < (short ? opts.minGlyphsShort : opts.minGlyphs)) continue;
    const strokes = row.map((b) => b.stroke / b.h).sort((a, b) => a - b);
    const midStroke = (strokes[(strokes.length - 1) >> 1] + strokes[strokes.length >> 1]) / 2;
    if (short && midStroke > opts.maxStrokeShare) continue;
    const widths = row.map((b) => b.w);
    const mean = widths.reduce((a, b) => a + b, 0) / widths.length;
    const sd = Math.sqrt(widths.reduce((a, b) => a + (b - mean) ** 2, 0) / widths.length);
    if (sd / mean < opts.minWidthVariation) continue;
    const x0 = Math.min(...row.map((b) => b.x));
    const y0 = Math.min(...row.map((b) => b.y));
    const x1 = Math.max(...row.map((b) => b.x + b.w));
    const y1 = Math.max(...row.map((b) => b.y + b.h));
    out.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, glyphs: row.length });
  }
  return out;
}
