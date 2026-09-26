#!/usr/bin/env node
// @ts-check
// Label art for the icon subjects (WP-P0-12), drawn for this game from shapes, colour blocks and pictograms with
// the vector rasteriser in vector.mjs. Labels carry no lettering at all: no glyphs, no pseudo-text, nothing that
// could read as garbled writing at any size (tests/icons.test.js scans them). Each label is sized from the
// container dimensions in catalog.json, so a wrap label spans exactly its container's printable band.
//
//   node tools/blender/icons/labels.mjs [--out tools/blender/icons/work/labels] [--only luncheon,noodle_cup]
//
// Writes <id>.png (sRGB colour, alpha = printed coverage) and <id>.mask.png (R metalness, G roughness, B clear
// coat) per label, for every label unless --only.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { encodePng } from '../../lib/png.mjs';
import { Canvas, bezierShape, circle, cubic as cubicPts, ellipse, hole, linear, place, poly, radial, rect, ring, rng, star, stroke, wave, waveBand } from './vector.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
/** @type {{ seed: number, icons: any[] }} */
export const CATALOG = JSON.parse(readFileSync(join(HERE, 'catalog.json'), 'utf8'));
const byLabel = (/** @type {string} */ id) => {
  const icon = CATALOG.icons.find((i) => (i.labels || []).includes(id));
  if (!icon) throw new Error(`no catalog icon uses label ${id}`);
  return icon;
};

/** Perimeter of a rounded rectangle (mm). @param {number} w @param {number} d @param {number} r */
const roundedPerimeter = (w, d, r) => 2 * (w - 2 * r) + 2 * (d - 2 * r) + 2 * Math.PI * r;

const GOLD = { metal: 1, rough: 0.3, coat: 0.4 };
/** @typedef {import('./vector.mjs').Contour} Contour */
/** @typedef {import('./vector.mjs').Pt} Pt */

// ------------------------------------------------------------------------------------------ pictograms

/** @param {Canvas} c @param {number} cx @param {number} cy @param {number} s @param {string} col */
function pig(c, cx, cy, s, col) {
  const shapes = [
    ...ellipse(cx, cy, 0.46 * s, 0.28 * s),
    ...circle(cx + 0.42 * s, cy - 0.1 * s, 0.2 * s),
    ...poly([[cx + 0.3 * s, cy - 0.25 * s], [cx + 0.36 * s, cy - 0.44 * s], [cx + 0.46 * s, cy - 0.27 * s]]),
    ...rect(cx - 0.34 * s, cy + 0.12 * s, 0.1 * s, 0.26 * s, 0.03 * s),
    ...rect(cx - 0.16 * s, cy + 0.14 * s, 0.1 * s, 0.26 * s, 0.03 * s),
    ...rect(cx + 0.08 * s, cy + 0.14 * s, 0.1 * s, 0.26 * s, 0.03 * s),
    ...rect(cx + 0.26 * s, cy + 0.12 * s, 0.1 * s, 0.26 * s, 0.03 * s),
    ...ellipse(cx + 0.63 * s, cy - 0.05 * s, 0.07 * s, 0.09 * s),
  ];
  c.fill(shapes, col);
  c.fill(stroke([[cx - 0.45 * s, cy - 0.05 * s], [cx - 0.56 * s, cy - 0.14 * s], [cx - 0.52 * s, cy - 0.24 * s], [cx - 0.6 * s, cy - 0.26 * s]], 0.045 * s), col);
}

/** A block of luncheon meat seen from above-front, with fat speckle. @param {Canvas} c @param {() => number} rnd @param {number} x @param {number} y @param {number} w @param {number} h @param {number} depth */
function meatBlock(c, rnd, x, y, w, h, depth) {
  const top = poly([[x, y], [x + w, y], [x + w + depth, y - depth * 0.8], [x + depth, y - depth * 0.8]]);
  const side = poly([[x + w, y], [x + w + depth, y - depth * 0.8], [x + w + depth, y + h - depth * 0.8], [x + w, y + h]]);
  const front = rect(x, y, w, h, 0.6);
  c.fill(front, linear(0, y, 0, y + h, [[0, '#e8998b'], [1, '#cf7466']]));
  c.fill(top, '#f2b8aa');
  c.fill(side, '#c2685a');
  for (const [shape, col] of /** @type {[Contour[], string][]} */ ([[front, '#f7d5ca'], [top, '#fbe3da'], [side, '#e3a293']])) {
    c.clip(shape);
    c.speckle(rnd, { x: x - 1, y: y - depth - 1, w: w + depth + 2, h: h + depth + 2 }, 70, [0.18, 0.5], col);
    c.unclip();
  }
}

/** A slice of luncheon meat with a seared rim. @param {Canvas} c @param {() => number} rnd @param {number} cx @param {number} cy @param {number} w @param {number} h @param {number} rot */
function meatSlice(c, rnd, cx, cy, w, h, rot) {
  const outer = place(rect(-w / 2, -h / 2, w, h, 1.6), { x: cx, y: cy, rot });
  const inner = place(rect(-w / 2 + 0.9, -h / 2 + 0.9, w - 1.8, h - 1.8, 1.2), { x: cx, y: cy, rot });
  c.fill(outer, '#b9644f');
  c.fill(inner, radial(cx - w * 0.15, cy - h * 0.2, w * 0.7, [[0, '#f0a898'], [1, '#dc8676']]));
  c.clip(inner);
  c.speckle(rnd, { x: cx - w, y: cy - w, w: 2 * w, h: 2 * w }, 45, [0.16, 0.42], '#f8dbd1');
  c.unclip();
}

/** @param {Canvas} c @param {number} x @param {number} y @param {number} s @param {number} rot */
function parsley(c, x, y, s, rot) {
  const leaves = [
    [0, -0.55, 0.2, 0.32, -10],
    [-0.34, -0.3, 0.19, 0.28, -52],
    [0.34, -0.3, 0.19, 0.28, 40],
    [-0.2, 0.02, 0.15, 0.22, -80],
    [0.22, 0.04, 0.15, 0.22, 70],
  ];
  const stem = place([[[0, 0.55], [0.03, 0.55], [0.02, -0.4], [-0.01, -0.4]]], { x, y, rot, s });
  c.fill(stem, '#4f7f2c');
  for (const [lx, ly, rx, ry, r] of leaves) c.fill(place(ellipse(lx, ly, rx, ry, r), { x, y, rot, s }), linear(x - s / 2, y - s / 2, x + s / 2, y + s / 2, [[0, '#7fb24a'], [1, '#4c8a2c']]));
}

/** A bowl of noodle soup. @param {Canvas} c @param {() => number} rnd @param {number} cx @param {number} cy @param {number} w */
function noodleBowl(c, rnd, cx, cy, w) {
  const rx = w / 2;
  const ry = w * 0.13;
  const depth = w * 0.42;
  // bowl body: the lower half of an ellipse below the rim line, and a foot
  /** @type {Pt[]} */
  const body = [];
  for (let i = 0; i <= 48; i++) {
    const t = Math.PI * (i / 48);
    body.push([cx + rx * Math.cos(t), cy + depth * Math.sin(t)]);
  }
  c.fill(rect(cx - w * 0.16, cy + depth * 0.86, w * 0.32, depth * 0.2, 1), '#c9bfae');
  c.fill([body], linear(cx - rx, cy, cx + rx, cy, [[0, '#fbf8f1'], [0.55, '#efe9dd'], [1, '#c8bfae']]));
  c.clip([body]);
  c.fill(rect(cx - rx, cy + depth * 0.18, w, depth * 0.07), '#b8322a');
  c.fill(rect(cx - rx, cy + depth * 0.3, w, depth * 0.025), '#b8322a');
  c.unclip();
  // rim and soup surface
  c.fill(ellipse(cx, cy, rx, ry), '#e8e1d3');
  const soup = ellipse(cx, cy + ry * 0.12, rx * 0.93, ry * 0.8);
  c.fill(soup, radial(cx - rx * 0.2, cy - ry * 0.3, rx, [[0, '#c46a2c'], [1, '#8f3f17']]));
  c.clip(soup);
  for (let i = 0; i < 7; i++) {
    const y = cy - ry * 0.7 + (i * ry * 1.5) / 6;
    c.fill(stroke(wave(cx - rx, cx + rx, y, ry * 0.12, w * 0.12, i * 1.7), w * 0.022), '#f2cb62');
  }
  const beef = [[-0.28, 0.05, 20], [0.05, -0.25, -15], [0.28, 0.2, 35]];
  for (const [bx, by, r] of beef) {
    c.fill(place(rect(-w * 0.07, -ry * 0.28, w * 0.14, ry * 0.56, 1.2), { x: cx + bx * rx, y: cy + by * ry, rot: r }), '#6a2d12');
    c.fill(place(rect(-w * 0.06, -ry * 0.26, w * 0.12, ry * 0.18, 0.8), { x: cx + bx * rx, y: cy + by * ry, rot: r }), '#8e4a26');
  }
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * 0.8;
    c.fill(ring(cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, w * 0.022, w * 0.012), '#6db33c');
  }
  c.unclip();
}

/** @param {Canvas} c @param {number} cx @param {number} top @param {number} h @param {number} spread */
function steam(c, cx, top, h, spread) {
  for (const dx of [-spread, 0, spread]) {
    /** @type {Pt[]} */
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      pts.push([cx + dx + Math.sin(t * Math.PI * 2 + dx) * h * 0.08, top + h * (1 - t)]);
    }
    c.fill(stroke(pts, h * 0.07), { hex: '#fff6e8', alpha: 0.75 });
  }
}

/** @param {number} cx @param {number} cy @param {number} s */
const heartShape = (cx, cy, s) =>
  place(
    bezierShape([0, 0.45], [
      [[-0.1, 0.35], [-0.5, 0.1], [-0.5, -0.12]],
      [[-0.5, -0.4], [-0.08, -0.45], [0, -0.2]],
      [[0.08, -0.45], [0.5, -0.4], [0.5, -0.12]],
      [[0.5, 0.1], [0.1, 0.35], [0, 0.45]],
    ]),
    { x: cx, y: cy, s }
  );

/** @param {number} cx @param {number} cy @param {number} s */
const dropShape = (cx, cy, s) =>
  place(
    bezierShape([0, -0.55], [
      [[0.12, -0.3], [0.38, -0.05], [0.38, 0.15]],
      [[0.38, 0.4], [0.2, 0.55], [0, 0.55]],
      [[-0.2, 0.55], [-0.38, 0.4], [-0.38, 0.15]],
      [[-0.38, -0.05], [-0.12, -0.3], [0, -0.55]],
    ]),
    { x: cx, y: cy, s }
  );

/** A lens-shaped leaf from (x, y) along rot, optionally serrated. @param {number} x @param {number} y @param {number} len @param {number} wid @param {number} rot @param {boolean} [serrate] @returns {Contour[]} */
function leafShape(x, y, len, wid, rot, serrate = false) {
  /** @type {Pt[]} */
  const pts = [];
  const n = 40;
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i <= n; i++) {
      const t = side ? 1 - i / n : i / n;
      let h = wid * Math.sin(Math.PI * t) ** 0.8 * (side ? -1 : 1);
      if (serrate && i % 4 === 2) h *= 1.18;
      pts.push([t * len, h]);
    }
  }
  return place([pts], { x, y, rot });
}

/** @param {Canvas} c @param {number} cx @param {number} cy @param {number} r @param {boolean} [back] */
function tomato(c, cx, cy, r, back = false) {
  /** @type {Pt[]} */
  const pts = [];
  for (let i = 0; i < 160; i++) {
    const a = (2 * Math.PI * i) / 160;
    const rr = r * (1 + 0.018 * Math.cos(6 * a) - 0.05 * Math.max(0, -Math.sin(a)) ** 6);
    pts.push([cx + rr * Math.cos(a), cy + rr * 0.9 * Math.sin(a)]);
  }
  c.fill([pts], radial(cx - r * 0.35, cy - r * 0.35, r * 1.5, back ? [[0, '#d2463a'], [1, '#86190f']] : [[0, '#f2644c'], [0.55, '#d6301f'], [1, '#931a10']]));
  c.fill(ellipse(cx - r * 0.38, cy - r * 0.4, r * 0.24, r * 0.13, -30), { hex: '#ffffff', alpha: back ? 0.25 : 0.45 });
  c.fill(star(cx, cy - r * 0.78, r * 0.42, r * 0.12, 6, -90), '#4e8b2c');
  c.fill(rect(cx - r * 0.05, cy - r * 1.05, r * 0.1, r * 0.3, r * 0.04), '#3f6f25');
}

/** @param {Canvas} c @param {number} x @param {number} y @param {number} s */
function sprout(c, x, y, s) {
  c.fill(stroke([[x, y], [x, y - s * 0.55]], s * 0.08), '#7cbf4a');
  c.fill(leafShape(x, y - s * 0.5, s * 0.5, s * 0.16, -145), '#8fce55');
  c.fill(leafShape(x, y - s * 0.5, s * 0.5, s * 0.16, -35), '#6fb13a');
}

/**
 * A rice plant: a stem that rises and droops under a head of grains, and two blades.
 * @param {Canvas} c @param {number} x @param {number} y @param {number} s
 * @param {{ stem: string, blade: string, blade2: string, grain: [string, string], grainScale?: number }} [ink]
 */
function ricePlant(c, x, y, s, ink = { stem: '#8a9a3c', blade: '#5f8f33', blade2: '#6f9f3b', grain: ['#f3d98f', '#c99a3d'] }) {
  const gs = ink.grainScale ?? 1;
  c.fill(leafShape(x, y, s * 0.85, s * 0.05, -104), ink.blade);
  c.fill(leafShape(x, y, s * 0.7, s * 0.045, -58), ink.blade2);
  /** @type {Pt[]} */
  const stem = [];
  const top = /** @type {Pt} */ ([x + s * 0.08, y - s * 0.95]);
  for (const p of [...cubicPts([x, y], [x - s * 0.02, y - s * 0.5], [x, y - s * 0.9], top, 16), ...cubicPts(top, [x + s * 0.2, y - s * 1.02], [x + s * 0.38, y - s * 0.9], [x + s * 0.44, y - s * 0.62], 16).slice(1)]) stem.push(p);
  c.fill(stroke(stem, s * 0.022), ink.stem);
  for (let i = 14; i < stem.length - 1; i += 2) {
    const [px, py] = stem[i];
    const [qx, qy] = stem[i + 1];
    const ang = (Math.atan2(qy - py, qx - px) * 180) / Math.PI;
    for (const side of [-1, 1]) {
      const g = place(ellipse(0, 0, s * 0.045 * gs, s * 0.02 * gs), { x: px + side * s * 0.035 * gs, y: py + s * 0.01, rot: ang + side * 38 + 90 });
      c.fill(g, radial(px, py, s * 0.06, [[0, ink.grain[0]], [1, ink.grain[1]]]));
    }
  }
}

/** @param {Canvas} c @param {number} cx @param {number} cy @param {number} s @param {string} col @param {number} [alpha] */
function mouse(c, cx, cy, s, col, alpha = 1) {
  const shapes = [
    ...ellipse(cx, cy, 0.36 * s, 0.22 * s, -8),
    ...circle(cx + 0.32 * s, cy - 0.1 * s, 0.14 * s),
    ...circle(cx + 0.24 * s, cy - 0.27 * s, 0.1 * s),
    ...circle(cx + 0.42 * s, cy - 0.25 * s, 0.08 * s),
    ...poly([[cx + 0.4 * s, cy - 0.13 * s], [cx + 0.56 * s, cy - 0.04 * s], [cx + 0.4 * s, cy + 0.02 * s]]),
  ];
  c.fill(shapes, { hex: col, alpha });
  c.fill(stroke([[cx - 0.34 * s, cy + 0.05 * s], [cx - 0.5 * s, cy + 0.14 * s], [cx - 0.58 * s, cy + 0.02 * s], [cx - 0.66 * s, cy - 0.1 * s]], 0.04 * s), { hex: col, alpha });
}

/** A green first-aid square with a white cross (ISO 7010 style). @param {Canvas} c @param {number} cx @param {number} cy @param {number} s */
function firstAid(c, cx, cy, s) {
  c.fill(rect(cx - s / 2, cy - s / 2, s, s, s * 0.18), '#1f9a5c');
  c.fill([...rect(cx - s * 0.12, cy - s * 0.34, s * 0.24, s * 0.68, s * 0.04), ...rect(cx - s * 0.34, cy - s * 0.12, s * 0.68, s * 0.24, s * 0.04)], '#fbfaf5');
}

// ------------------------------------------------------------------------------------------ labels

/**
 * @typedef {object} LabelSpec
 * @property {string} title
 * @property {() => { w: number, h: number }} size  millimetres
 * @property {number} ppmm
 * @property {string | null} bg
 * @property {import('./vector.mjs').Finish} finish
 * @property {(c: Canvas, rnd: () => number, size: { w: number, h: number }) => void} draw
 */

/** @type {Record<string, LabelSpec>} */
export const LABELS = {
  luncheon: {
    title: 'Luncheon-meat tin wrap: red and cream litho, a plate of luncheon meat on the front, pig roundels on the ends',
    size: () => {
      const t = byLabel('luncheon').tin;
      return { w: roundedPerimeter(t.w, t.d, t.r), h: t.band[1] - t.band[0] };
    },
    ppmm: 6,
    bg: '#efe2bf',
    finish: { rough: 0.3, coat: 0.55 },
    draw(c, rnd, { w, h }) {
      c.fill(rect(0, 0, w, 12), linear(0, 0, 0, 12, [[0, '#b52520'], [1, '#931915']]));
      c.fill(rect(0, h - 11, w, 11), linear(0, h - 11, 0, h, [[0, '#931915'], [1, '#7a120f']]));
      c.fill(rect(0, 12, w, 1.4), '#d8b45c', GOLD);
      c.fill(rect(0, h - 12.4, w, 1.4), '#d8b45c', GOLD);
      const t = byLabel('luncheon').tin;
      const hx = t.w / 2 - t.r;
      for (const fc of [w / 2, 0, w]) {
        // plate with a luncheon block, two slices and parsley
        c.fill(ellipse(fc, 37.5, 34, 15.5), '#aebdcc');
        c.fill(ellipse(fc, 37.5, 32.2, 14.1), radial(fc - 8, 33, 34, [[0, '#ffffff'], [1, '#e4dfd3']]));
        c.fill(ellipse(fc, 38.5, 24, 9.5), { hex: '#d9d2c2', alpha: 0.6 });
        meatBlock(c, rnd, fc - 21, 31, 24, 13, 6);
        meatSlice(c, rnd, fc + 12, 40, 15, 11, 14);
        meatSlice(c, rnd, fc + 20, 43.5, 15, 11, 28);
        parsley(c, fc - 23, 44, 8, -30);
        c.fill(star(fc - hx + 6, 21, 2.6, 1.1, 5), '#c89b3e', GOLD);
        c.fill(star(fc + hx - 6, 21, 2.6, 1.1, 5), '#c89b3e', GOLD);
      }
      for (const sc of [w * 0.25, w * 0.75]) {
        c.fill(circle(sc, 36, 12.5), '#d8b45c', GOLD);
        c.fill(circle(sc, 36, 11.2), radial(sc - 3, 33, 13, [[0, '#c02a24'], [1, '#8e1814']]));
        pig(c, sc - 1, 37, 14, '#f6ead0');
      }
    },
  },
  noodle_cup: {
    title: 'Instant noodle cup wrap: red with a gold rim band, a bowl of beef noodle soup on a sunburst, front and back',
    size: () => {
      const cup = byLabel('noodle_cup').cup;
      const zm = (cup.band[0] + cup.band[1]) / 2;
      const rm = cup.bottom / 2 + ((cup.top - cup.bottom) / 2) * (zm / cup.h);
      return { w: 2 * Math.PI * rm, h: cup.band[1] - cup.band[0] };
    },
    ppmm: 6,
    bg: '#c4221a',
    finish: { rough: 0.4, coat: 0.2 },
    draw(c, rnd, { w, h }) {
      c.fill(rect(0, 0, w, h), linear(0, 0, 0, h, [[0, '#d42a1f'], [1, '#c02119']]));
      c.fill(rect(0, 0, w, 9), linear(0, 0, 0, 9, [[0, '#f7c64a'], [1, '#e8a526']]));
      c.fill(rect(0, 9, w, 1), '#fff2d8');
      c.fill(rect(0, h - 6, w, 6), '#b3241a');
      c.fill(rect(0, h - 7, w, 0.8), '#e8a526');
      for (const fc of [w / 2, 0, w]) {
        c.fill(star(fc, 37, 29, 25, 18), radial(fc, 37, 29, [[0, '#ffd866'], [1, '#f2ad2c']]));
        steam(c, fc, 14, 12, 7);
        noodleBowl(c, rnd, fc, 33, 44);
        c.fill(leafShape(fc + 21, 53, 11, 2.2, -20), '#5fae3a');
        c.fill(leafShape(fc + 22, 54, 9, 1.8, 15), '#4c9a30');
      }
    },
  },
  water_band: {
    title: 'Sparkling water wrap: white to sky gradient, blue mountains, waves, rising bubbles and a drop',
    size: () => {
      const b = byLabel('water_band').bottle;
      return { w: 2 * Math.PI * (b.r + 0.4), h: b.band[1] - b.band[0] };
    },
    ppmm: 7,
    bg: '#ffffff',
    finish: { rough: 0.18, coat: 0.5 },
    draw(c, rnd, { w, h }) {
      c.fill(rect(0, 0, w, h), linear(0, 0, 0, h, [[0, '#ffffff'], [1, '#cfe8f7']]));
      for (const fc of [w / 2, 0, w]) {
        const base = h * 0.7;
        c.fill(poly([[fc - 32, base], [fc - 13, h * 0.3], [fc + 1, base - 12], [fc + 14, h * 0.2], [fc + 36, base]]), linear(0, h * 0.2, 0, base, [[0, '#4b8fcf'], [1, '#1f5c9c']]));
        c.fill(poly([[fc - 13, h * 0.3], [fc - 17, h * 0.3 + 6], [fc - 13, h * 0.3 + 4.4], [fc - 9.6, h * 0.3 + 6.2]]), '#ffffff');
        c.fill(poly([[fc + 14, h * 0.2], [fc + 9, h * 0.2 + 7], [fc + 13.4, h * 0.2 + 5.2], [fc + 18.6, h * 0.2 + 7.6]]), '#ffffff');
        c.fill(dropShape(fc - 40, h * 0.42, 17), linear(fc - 44, h * 0.3, fc - 36, h * 0.6, [[0, '#7cc0ee'], [1, '#2a78c0']]));
        c.fill(ellipse(fc - 42.5, h * 0.44, 1.4, 3.2, 15), { hex: '#ffffff', alpha: 0.8 });
        for (let i = 0; i < 16; i++) {
          const bx = fc + 24 + rnd() * 16;
          const by = h * 0.08 + rnd() * h * 0.5;
          const r = 0.7 + rnd() * 1.9;
          c.fill(ring(bx, by, r, 0.45), '#4f9ad6');
          c.fill(circle(bx - r * 0.35, by - r * 0.35, r * 0.22), { hex: '#ffffff', alpha: 0.9 });
        }
      }
      c.fill(waveBand(0, w, h * 0.74, 1.8, 34, 0, h), '#2e78bd');
      c.fill(waveBand(0, w, h * 0.82, 1.6, 27, 1.4, h), '#1c5494');
    },
  },
  bandage_band: {
    title: 'Bandage wrapper band: pale paper, green edge stripes, two first-aid squares (green is the one cross colour of the medical category: ISO 7010 first aid; the red cross is a protected emblem)',
    size: () => {
      const r = byLabel('bandage_band').roll;
      return { w: 2 * Math.PI * (r.r + 0.5), h: r.band };
    },
    ppmm: 8,
    bg: '#dcd9cf',
    finish: { rough: 0.72, coat: 0 },
    draw(c, _rnd, { w, h }) {
      c.fill(rect(0, 1.4, w, 1.5), '#1f9a5c');
      c.fill(rect(0, h - 2.9, w, 1.5), '#1f9a5c');
      for (const x of [w * 0.25, w * 0.75]) {
        firstAid(c, x, h / 2, h * 0.62);
      }
    },
  },
  seed_tomato: {
    title: 'Tomato seed packet front, the source\'s kraft packet: kraft paper with fibres, a crimped darker top band, a pale window with a large tomato on leaves, a green stripe with a sprout below',
    size: () => {
      const p = byLabel('seed_tomato').packet;
      return { w: p.w, h: p.h };
    },
    ppmm: 8,
    bg: '#a47c4b',
    finish: { rough: 0.75, coat: 0 },
    draw(c, rnd, { w, h }) {
      c.speckle(rnd, { x: 0, y: 0, w, h }, 900, [0.15, 0.45], { hex: '#7d5a32', alpha: 0.35 });
      c.speckle(rnd, { x: 0, y: 0, w, h }, 500, [0.15, 0.4], { hex: '#c7a576', alpha: 0.35 });
      c.fill(rect(0, 0, w, 15), linear(0, 0, 0, 15, [[0, '#8a6538'], [1, '#98703f']]));
      c.fill(stroke([[0, 15.4], [w, 15.4]], 0.8), { hex: '#6d4e2a', alpha: 0.7 });
      c.fill(rect(9, 22, w - 18, 76, 4), linear(0, 22, 0, 98, [[0, '#e1d7bd'], [1, '#d3c6a6']]));
      c.fill(leafShape(w * 0.2, h * 0.5, 30, 8, -30, true), '#4f8a33');
      c.fill(leafShape(w * 0.55, h * 0.36, 26, 7, -12, true), '#5a9538');
      c.fill(leafShape(w * 0.5, h * 0.62, 24, 6.5, 30, true), '#467d2e');
      tomato(c, w * 0.66, h * 0.44, 15, true);
      tomato(c, w * 0.42, h * 0.5, 23);
      c.fill(rect(9, 104, w - 18, 9, 2), '#3f7a34');
      sprout(c, w / 2, 124, 11);
    },
  },
  book_cover: {
    title: 'First-aid manual cover: deep teal board, gold frame, a cream plate with heart, cross and plaster pictograms, a large cross roundel',
    size: () => {
      const b = byLabel('book_cover').book;
      return { w: b.w, h: b.h };
    },
    ppmm: 4,
    bg: '#1f5566',
    finish: { rough: 0.5, coat: 0.06 },
    draw(c, _rnd, { w, h }) {
      c.fill(rect(0, 0, w, h), linear(0, 0, w * 0.3, h, [[0, '#256577'], [1, '#163c49']]));
      const frame = rect(8, 8, w - 16, h - 16, 3);
      c.fill([...frame, ...hole(rect(9, 9, w - 18, h - 18, 2.4))], '#d6b25a', GOLD);
      c.fill(rect(20, 24, w - 40, 42, 5), linear(0, 24, 0, 66, [[0, '#f4ead0'], [1, '#e6d8b5']]));
      c.fill(heartShape(w * 0.3, 45, 22), '#c8352c');
      firstAid(c, w * 0.5, 45, 22);
      c.fill(place(rect(-14, -5, 28, 10, 4.5), { x: w * 0.7, y: 45, rot: -35 }), '#d9b48a');
      c.fill(place(rect(-5, -4, 10, 8, 1.5), { x: w * 0.7, y: 45, rot: -35 }), '#efe0c8');
      c.fill(circle(w / 2, 128, 37), '#d6b25a', GOLD);
      c.fill(circle(w / 2, 128, 35), radial(w / 2 - 10, 118, 40, [[0, '#ffffff'], [1, '#e8e4da']]));
      c.fill([...rect(w / 2 - 7.5, 128 - 23, 15, 46, 2.5), ...rect(w / 2 - 23, 128 - 7.5, 46, 15, 2.5)], '#1f9a5c');
      c.fill(rect(14, h - 26, w - 28, 1.2), '#d6b25a', GOLD);
      c.fill(rect(14, h - 22.5, w - 28, 1.2), '#d6b25a', GOLD);
    },
  },
  rice_ear: {
    title: 'Rice sack emblem, printed in dark brown and ochre on hessian: a large drooping rice ear with two blades inside an oval ring, a blank ribbon below',
    size: () => ({ w: 170, h: 170 }),
    ppmm: 4,
    bg: null,
    finish: { rough: 0.9, coat: 0 },
    draw(c, _rnd, { w, h }) {
      const ink = { hex: '#43331d', alpha: 0.92 };
      c.fill([...ellipse(w / 2, h * 0.44, w * 0.42, h * 0.38), ...hole(ellipse(w / 2, h * 0.44, w * 0.42 - 4, h * 0.38 - 4))], ink);
      c.fill([...ellipse(w / 2, h * 0.44, w * 0.42 - 7, h * 0.38 - 7), ...hole(ellipse(w / 2, h * 0.44, w * 0.42 - 8.6, h * 0.38 - 8.6))], ink);
      ricePlant(c, w * 0.36, h * 0.79, 100, { stem: '#43331d', blade: '#3f4a22', blade2: '#56602c', grain: ['#d9a54c', '#7a5220'], grainScale: 1.9 });
      const band = bezierShape([w * 0.16, h * 0.86], [
        [[w * 0.35, h * 0.8], [w * 0.65, h * 0.8], [w * 0.84, h * 0.86]],
        [[w * 0.86, h * 0.93], [w * 0.86, h * 0.93], [w * 0.84, h * 0.97]],
        [[w * 0.65, h * 0.91], [w * 0.35, h * 0.91], [w * 0.16, h * 0.97]],
        [[w * 0.14, h * 0.93], [w * 0.14, h * 0.93], [w * 0.16, h * 0.86]],
      ]);
      c.fill(band, { hex: '#9a2a1c', alpha: 0.9 });
    },
  },
  carton_marks: {
    title: 'Builder demo, shipping carton print: handling marks (this way up arrows, a fragile glass, keep dry umbrella) in black ink',
    size: () => ({ w: 120, h: 80 }),
    ppmm: 6,
    bg: null,
    finish: { rough: 0.8, coat: 0 },
    draw(c, _rnd, { w, h }) {
      const ink = { hex: '#1f1d1a', alpha: 0.9 };
      c.fill([...rect(8, 8, 42, 42, 3), ...hole(rect(9.5, 9.5, 39, 39, 2.2))], ink);
      for (const x of [20, 38]) {
        c.fill(poly([[x, 14], [x + 6, 22], [x + 2.2, 22], [x + 2.2, 40], [x - 2.2, 40], [x - 2.2, 22], [x - 6, 22]]), ink);
      }
      c.fill(rect(14, 43, 30, 2), ink);
      c.fill([...rect(56, 8, 26, 42, 3), ...hole(rect(57.5, 9.5, 23, 39, 2.2))], ink);
      c.fill(poly([[61, 14], [77, 14], [75, 26], [70.5, 29], [70.5, 40], [74, 42], [64, 42], [67.5, 40], [67.5, 29], [63, 26]]), ink);
      c.fill([...rect(88, 8, 26, 42, 3), ...hole(rect(89.5, 9.5, 23, 39, 2.2))], ink);
      c.fill(bezierShape([90.5, 26], [[[92, 14], [110, 14], [111.5, 26]], [[106, 24], [96, 24], [90.5, 26]]]), ink);
      c.fill(stroke([[101, 25], [101, 38], [98.5, 40], [96.5, 38]], 1.4), ink);
      c.fill(rect(8, h - 20, w - 16, 10, 2), { hex: '#b3261e', alpha: 0.85 });
    },
  },
  pillow_crisps: {
    title: 'Builder demo, crisps pillow pack: glossy red film, a yellow burst holding a heap of potato crisps',
    size: () => ({ w: 180, h: 240 }),
    ppmm: 3,
    bg: '#c9241b',
    finish: { rough: 0.2, coat: 0.6 },
    draw(c, rnd, { w, h }) {
      c.fill(rect(0, 0, w, h), linear(0, 0, w, h, [[0, '#dd3322'], [1, '#9c160f']]));
      c.fill(rect(0, 0, w, 20), '#8a120c');
      c.fill(rect(0, h - 20, w, 20), '#8a120c');
      c.fill(star(w / 2, h / 2, 70, 58, 20), radial(w / 2, h / 2, 70, [[0, '#ffe07a'], [1, '#f3a92c']]));
      for (let i = 0; i < 14; i++) {
        const a = rnd() * Math.PI * 2;
        const d = rnd() * 38;
        c.fill(place(ellipse(0, 0, 14, 10), { x: w / 2 + Math.cos(a) * d, y: h / 2 + Math.sin(a) * d * 0.7, rot: rnd() * 180 }), radial(w / 2, h / 2, 60, [[0, '#f9d77a'], [1, '#dca444']]));
      }
    },
  },
  trap_stamp: {
    title: 'Mousetrap base stamp: a red ink roundel with a mouse (ink on pine)',
    size: () => ({ w: 36, h: 36 }),
    ppmm: 10,
    bg: null,
    finish: { rough: 0.7, coat: 0 },
    draw(c, _rnd, { w }) {
      const m = w / 2;
      c.fill(ring(m, m, m - 2.5, 1.8), { hex: '#b3261e', alpha: 0.92 });
      c.fill(ring(m, m, m - 5.2, 0.7), { hex: '#b3261e', alpha: 0.92 });
      mouse(c, m - 0.5, m + 1.5, 19, '#b3261e', 0.92);
    },
  },
};

/** @param {string} id */
function seedOf(id) {
  let h = CATALOG.seed >>> 0;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h;
}

/**
 * Draws one label.
 * @param {string} id
 * @returns {{ color: import('../../lib/png.mjs').Image, mask: import('../../lib/png.mjs').Image, sizeMm: { w: number, h: number }, ppmm: number }}
 */
export function renderLabel(id) {
  const spec = LABELS[id];
  if (!spec) throw new Error(`no label '${id}'`);
  const size = spec.size();
  const c = new Canvas(size.w, size.h, spec.ppmm, { bg: spec.bg, finish: spec.finish });
  spec.draw(c, rng(seedOf(id)), size);
  const { color, mask } = c.images();
  return { color, mask, sizeMm: size, ppmm: spec.ppmm };
}

/** The labels the catalog uses, in catalog order (the others dress the builder demos in demo.py). */
export const LABEL_IDS = [...new Set(CATALOG.icons.flatMap((i) => i.labels || []))];

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { out: { type: 'string', default: join(HERE, 'work', 'labels') }, only: { type: 'string' } } });
  const out = resolve(values.out);
  const only = values.only ? values.only.split(',') : Object.keys(LABELS);
  for (const id of only) if (!LABELS[id]) throw new Error(`no label '${id}' (have ${Object.keys(LABELS).join(', ')})`);
  mkdirSync(out, { recursive: true });
  for (const id of only) {
    const t0 = performance.now();
    const { color, mask } = renderLabel(id);
    writeFileSync(join(out, `${id}.png`), encodePng(color));
    writeFileSync(join(out, `${id}.mask.png`), encodePng(mask));
    console.log(`label ${id}: ${color.width} x ${color.height} px in ${Math.round(performance.now() - t0)} ms`);
  }
}
