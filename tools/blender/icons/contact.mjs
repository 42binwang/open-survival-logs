#!/usr/bin/env node
// @ts-check
// Contact sheets of the icon set (WP-P0-12) for review: every icon of assets/icons/manifest.json in an
// inventory-style slot, captioned with its config item id, at each shipped size on the dark UI panel colour
// (docs/ART.md §8 --ui-panel #232522) and on a light UI surface (--ui-text #e1e1df), and a sheet of the builder
// demos (demo.py) when they have been rendered.
// Review images only: not shipped, not in the manifest.
//
//   node tools/blender/icons/contact.mjs [--out docs/art/icons]
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { decodePng, encodePng } from '../../lib/png.mjs';
import { digitsWidth, drawDigits } from './imaging.mjs';
import { Canvas, linear, rect } from './vector.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
export const BACKGROUNDS = /** @type {const} */ ({
  dark: { sheet: '#232522', slot: ['#30332f', '#262825'], border: '#40443e', caption: [176, 179, 172] },
  light: { sheet: '#e1e1df', slot: ['#f5f5f2', '#e6e6e1'], border: '#c4c4bd', caption: [88, 90, 85] },
});
const COLUMNS = 6;

/** @param {import('../../lib/png.mjs').Image} dst @param {import('../../lib/png.mjs').Image} src @param {number} x0 @param {number} y0 */
function blit(dst, src, x0, y0) {
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
    const s = (y * src.width + x) * 4;
    const d = ((y0 + y) * dst.width + x0 + x) * 4;
    const a = src.data[s + 3] / 255;
    for (let c = 0; c < 3; c++) dst.data[d + c] = Math.round(src.data[s + c] * a + dst.data[d + c] * (1 - a));
    dst.data[d + 3] = 255;
  }
}

/**
 * One sheet: a grid of slots holding the images, each captioned.
 * @param {{ img: import('../../lib/png.mjs').Image, caption: string }[]} cells @param {number} size @param {keyof typeof BACKGROUNDS} bgName
 */
export function sheet(cells, size, bgName) {
  const bg = BACKGROUNDS[bgName];
  const scale = size >= 256 ? 3 : 2;
  const pad = Math.round(size * 0.12) + 6;
  const capH = 5 * scale + 8;
  const cols = Math.min(COLUMNS, cells.length);
  const rows = Math.ceil(cells.length / cols);
  const cw = size + pad;
  const ch = size + pad + capH;
  const W = cols * cw + pad;
  const H = rows * ch + pad;
  const c = new Canvas(W, H, 1, { bg: bg.sheet });
  cells.forEach((_, i) => {
    const x = pad + (i % cols) * cw - pad / 4;
    const y = pad + Math.floor(i / cols) * ch - pad / 4;
    const s = size + pad / 2;
    c.fill(rect(x - 1, y - 1, s + 2, s + 2, s * 0.07), bg.border);
    c.fill(rect(x, y, s, s, s * 0.065), linear(0, y, 0, y + s, [[0, bg.slot[0]], [1, bg.slot[1]]]));
  });
  const out = c.images().color;
  cells.forEach(({ img, caption }, i) => {
    const x = pad + (i % cols) * cw;
    const y = pad + Math.floor(i / cols) * ch;
    blit(out, img, x, y);
    drawDigits(out, caption, x + Math.round((size - digitsWidth(caption, scale)) / 2), y + size + pad / 4 + 4, scale, [...bg.caption]);
  });
  return out;
}

function main() {
  const { values } = parseArgs({ options: { out: { type: 'string', default: join(ROOT, 'docs', 'art', 'icons') } } });
  const outDir = resolve(values.out);
  mkdirSync(outDir, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(ROOT, 'assets/icons/manifest.json'), 'utf8'));
  const load = (/** @type {string} */ p) => decodePng(readFileSync(join(ROOT, p)));
  for (const size of [64, 128, 256]) {
    const cells = manifest.assets.map((/** @type {any} */ e) => ({ img: load(e.files[String(size)]), caption: String(e.params.item) }));
    for (const bgName of /** @type {(keyof typeof BACKGROUNDS)[]} */ (Object.keys(BACKGROUNDS))) {
      const file = join(outDir, `contact-${size}-${bgName}.png`);
      writeFileSync(file, encodePng(sheet(cells, size, bgName)));
      console.log(`wrote ${file.slice(ROOT.length + 1)}`);
    }
  }
  const demo = join(HERE, 'work', 'demo');
  if (existsSync(demo)) {
    const files = readdirSync(demo).filter((f) => f.endsWith('.png')).sort();
    const cells = files.map((f, i) => ({ img: decodePng(readFileSync(join(demo, f))), caption: String(i + 1) }));
    for (const bgName of /** @type {(keyof typeof BACKGROUNDS)[]} */ (Object.keys(BACKGROUNDS))) {
      const file = join(outDir, `builders-${bgName}.png`);
      writeFileSync(file, encodePng(sheet(cells, 256, bgName)));
      console.log(`wrote ${file.slice(ROOT.length + 1)} (${files.map((f) => f.slice(3, -4)).join(', ')})`);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
