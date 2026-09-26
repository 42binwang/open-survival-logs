// @ts-check
// WP-P0-12, the icon rig: the icon set the UI tile needs (assets/icons/, keyed by config item id) exists at 64, 128
// and 256 px with alpha, conforms to the asset-manifest contract with matching digests, stays perceptually distinct
// within each config category, follows the source's icon conventions (object at about two thirds of the slot, a
// soft drop shadow, no baked tier badges, light clear plastic), carries no text-like marks on its labels, and
// re-bakes through the asset lock at SSIM >= 0.99. Every input is read unconditionally: a missing file, tool or
// render fails the test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetOutputs, checkAssetManifest } from '../src/contracts/assets.js';
import { CAMERA } from '../src/contracts/look.js';
import { CAT, dishOutput, item, itemName } from '../src/data/db.js';
import { setLang } from '../src/engine/i18n.js';
import { decodePng } from '../tools/lib/png.mjs';
import { lockedSources } from '../tools/asset-lock/manifests.mjs';
import { sample, seedFor } from '../tools/asset-lock/sample.mjs';
import { hamming, phash, textLines, tooClose } from '../tools/blender/icons/checks.mjs';
import { iconBox, recipe, iconFiles, SIZES } from '../tools/blender/icons/finish.mjs';
import * as imaging from '../tools/blender/icons/imaging.mjs';

const { downsample, drawDigits, over } = imaging;
import { CATALOG, LABELS, LABEL_IDS, renderLabel } from '../tools/blender/icons/labels.mjs';
import { Canvas, rng, star, stroke } from '../tools/blender/icons/vector.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MANIFEST = 'assets/icons/manifest.json';
const manifest = JSON.parse(readFileSync(join(ROOT, MANIFEST), 'utf8'));
const rig = JSON.parse(readFileSync(join(ROOT, 'tools/blender/icons/rig.json'), 'utf8'));
/** @type {Map<string, any>} */
const byId = new Map(manifest.assets.map((/** @type {any} */ e) => [e.id, e]));
const LFS_POINTER = 'version https://git-lfs.github.com/spec/v1';

/** The icons the UI tile needs (WP-P0-12 scope), by config item id. */
const REQUIRED = {
  'canned luncheon meat': 2115,
  'instant noodles': 2105,
  bread: 2502,
  rice: 2103,
  'a bottle of water': 2142,
  'first-aid bandage': 2400,
  planks: 20106,
  'cooked dish, perfect': 13540,
  'cooked dish, good': 13541,
  'cooked dish, normal': 13542,
  'cooked dish, failed': 13543,
  'seed packet': 15026,
  trap: 25001,
  'book / note': 3022,
};
/** Within one config category, two distinct icon renders' 64-bit perceptual hashes differ in at least this many
 * bits. Config ids that share one render (bindings to one entry) are one icon, not a pair. */
const MIN_CATEGORY_DISTANCE = 12;
const outputs = /** @type {Record<number, { recipe: number, quality: number }>} */ (dishOutput);
/** The CIELAB L* of an sRGB colour. @param {number} r @param {number} g @param {number} b */
function lstar(r, g, b) {
  const lin = (/** @type {number} */ c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const y = 0.2126729 * lin(r) + 0.7151522 * lin(g) + 0.072175 * lin(b);
  return y > (6 / 29) ** 3 ? 116 * Math.cbrt(y) - 16 : (116 * y) / (3 * (6 / 29) ** 2);
}
/** The UI backgrounds icons sit on: docs/ART.md §8 --ui-panel and a light surface (--ui-text). */
const UI_BACKGROUNDS = /** @type {[number, number, number][]} */ ([[0x23, 0x25, 0x22], [0xe1, 0xe1, 0xdf]]);

const bytesOf = (/** @type {string} */ p) => readFileSync(join(ROOT, p));
const png = (/** @type {string} */ p) => decodePng(bytesOf(p));
const same = (/** @type {import('../tools/lib/png.mjs').Image} */ a, /** @type {import('../tools/lib/png.mjs').Image} */ b) =>
  a.width === b.width && a.height === b.height && Buffer.from(a.data).equals(Buffer.from(b.data));

test('the manifest covers the icon set the UI tile needs, keyed by config item id, named and categorised as in the config', () => {
  assert.equal(manifest.wp, 'WP-P0-12');
  for (const [what, cfgId] of Object.entries(REQUIRED)) {
    const b = manifest.bindings[String(cfgId)];
    assert.ok(b, `${what}: config id ${cfgId} is not bound to an icon`);
    const e = byId.get(b.asset);
    assert.ok(e, `${what}: binding to missing ${b.asset}`);
    const cfg = item(cfgId);
    assert.ok(cfg, `${what}: ${cfgId} is not a config item`);
    assert.equal(e.kind, 'icon');
    assert.ok(e.params.serves.includes(cfgId), `${what}: ${e.id} lists ${cfgId} among the ids it serves`);
    assert.equal(item(e.params.item).cat, cfg.cat, `${what}: same category as the icon's own item`);
  }
  for (const e of manifest.assets) {
    const cfg = item(e.params.item);
    assert.equal(e.id, `icons/${e.params.item}`);
    assert.equal(e.params.category, cfg.cat, `${e.id}: category`);
    assert.equal(e.params.footprint.join(), cfg.size.join(), `${e.id}: footprint`);
    setLang('en');
    assert.equal(e.params.name, itemName(e.params.item), `${e.id}: English name`);
    setLang('zh');
    assert.equal(e.params.nameZh, itemName(e.params.item), `${e.id}: Chinese name`);
    setLang('en');
  }
  assert.deepEqual(manifest.assets.map((/** @type {any} */ e) => e.params.item), CATALOG.icons.map((i) => i.id), 'the manifest lists the catalog, in order');
  const served = manifest.assets.flatMap((/** @type {any} */ e) => e.params.serves.map((/** @type {number} */ c) => [String(c), e.id]));
  assert.deepEqual(Object.entries(manifest.bindings).map(([k, v]) => [k, /** @type {any} */ (v).asset]).sort(), served.sort(), 'one binding per served config id');
});

test('dish tiers ship plain, as in the source: one render serves Perfect, Good and Normal, Failed has its own, no badges', () => {
  const tiers = [13540, 13541, 13542, 13543].map((c) => outputs[c]);
  assert.ok(tiers.every((t) => t && t.recipe === tiers[0].recipe), 'the four are tiers of one recipe');
  assert.deepEqual(tiers.map((t) => t.quality), [0, 1, 2, 3]);
  const [p, g, n, f] = [13540, 13541, 13542, 13543].map((c) => manifest.bindings[String(c)].asset);
  assert.ok(p === g && g === n, 'Perfect, Good and Normal share one icon');
  assert.notEqual(f, p, 'Failed has its own burnt render');
  assert.equal(byId.get(f).params.cooking, 'failed');
  for (const e of manifest.assets) {
    assert.equal(e.variants, undefined, `${e.id}: no badged / plain variants`);
    assert.equal(e.params.badge, undefined, `${e.id}: no baked badge`);
  }
  assert.equal(/** @type {any} */ (imaging).badge, undefined, 'the finishing step has no badge overlay to bake');
});

test('the manifest passes checkAssetManifest with its files on disk, and every digest matches its committed file', () => {
  const problems = checkAssetManifest(manifest, { exists: (p) => existsSync(join(ROOT, p)) });
  assert.deepEqual(problems, []);
  const r = manifest.rebuild.icons;
  assert.deepEqual(r, recipe(), 'the recipe is the one tools/blender/icons/finish.mjs writes');
  assert.equal(r.entry, 'tools/blender/icons/build.sh');
  assert.deepEqual(r.args, ['--only', '{name}']);
  assert.ok(Number.isInteger(r.cycles.seed) && Number.isInteger(r.cycles.samples) && r.cycles.samples >= 64, 'a fixed Cycles seed and sample count');
  assert.equal(r.tools.blender, '5.2.2');
  assert.ok(r.cost > 0);
  const locked = lockedSources(ROOT);
  for (const e of manifest.assets) {
    assert.equal(e.rebuild, 'icons', `${e.id}: names its recipe`);
    assert.equal(e.license, 'LicenseRef-Original', `${e.id}: made here`);
    for (const s of e.sources) assert.ok(locked.has(s), `${e.id}: source ${s} is in the asset lock`);
    const outputs = assetOutputs(e);
    assert.deepEqual(Object.keys(e.digests).sort(), [...outputs].sort(), `${e.id}: one digest per file`);
    for (const p of outputs) {
      const buf = bytesOf(p);
      assert.notEqual(buf.subarray(0, LFS_POINTER.length).toString('latin1'), LFS_POINTER, `${p} is an LFS pointer (git lfs pull)`);
      assert.equal(createHash('sha256').update(buf).digest('hex'), e.digests[p], `${p} matches its digest`);
    }
  }
});

test('every icon exists at 64, 128 and 256 px with a real alpha channel: transparent around, opaque subject, nothing clipped', () => {
  for (const e of manifest.assets) {
    for (const files of [e.files]) {
      assert.deepEqual(Object.keys(files).map(Number).sort((x, y) => x - y), [...SIZES], `${e.id}: files at ${SIZES.join(', ')}`);
      for (const size of SIZES) {
        const p = files[String(size)];
        assert.equal(bytesOf(p)[25], 6, `${p}: PNG colour type RGBA`);
        const img = png(p);
        assert.deepEqual([img.width, img.height], [size, size], `${p}: ${size} x ${size}`);
        let clear = 0;
        let covered = 0;
        let solid = 0;
        for (let i = 3; i < img.data.length; i += 4) {
          if (img.data[i] === 0) clear++;
          if (img.data[i] > 16) covered++;
          if (img.data[i] === 255) solid++;
        }
        const n = size * size;
        assert.ok(clear / n > 0.1, `${p}: ${((100 * clear) / n).toFixed(1)} % transparent, the backdrop-free alpha shows around the subject`);
        assert.ok(covered / n > 0.15, `${p}: ${((100 * covered) / n).toFixed(1)} % covered, the subject fills the tile`);
        assert.ok(solid / n > 0.02, `${p}: ${((100 * solid) / n).toFixed(1)} % fully opaque`);
        for (let k = 0; k < size; k++) {
          for (const [x, y] of [[k, 0], [k, size - 1], [0, k], [size - 1, k]]) assert.equal(img.data[(y * size + x) * 4 + 3], 0, `${p}: the subject touches the edge at (${x}, ${y})`);
        }
      }
    }
  }
});

test('the 128 and 64 px icons are the 256 px master downsampled, not separate renders', () => {
  for (const e of manifest.assets) {
    const master = png(e.files['256']);
    for (const size of [64, 128]) assert.ok(same(downsample(master, size), png(e.files[String(size)])), `${e.id}: ${e.files[String(size)]} is the 256 px master downsampled`);
  }
});

test('icon box: the subject fills about two thirds of the side, a soft shadow falls below-right, and the manifest records both', () => {
  const box = iconBox();
  assert.ok(box.fill >= 0.62 && box.fill <= 0.72, `fill ${box.fill}: the source's object / slot side is 0.57-0.78 (median 0.65)`);
  assert.ok(box.shadow.dx > 0 && box.shadow.dy > 0 && box.shadow.opacity > 0 && box.shadow.opacity <= 0.5 && box.shadow.baked);
  const fills = [];
  for (const e of manifest.assets) {
    assert.deepEqual(e.params.box, box, `${e.id}: the icon box is recorded`);
    const img = png(e.files['256']);
    let x0 = 256, y0 = 256, x1 = -1, y1 = -1, ox = 0, oy = 0, on = 0, sx = 0, sy = 0, sn = 0;
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const o = (y * 256 + x) * 4;
      const a = img.data[o + 3];
      if (a >= 128) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        ox += x; oy += y; on++;
      } else if (a > 0 && a <= Math.ceil(box.shadow.opacity * 255) && img.data[o] + img.data[o + 1] + img.data[o + 2] === 0) {
        sx += x; sy += y; sn++;
      }
    }
    const fill = Math.max(x1 - x0 + 1, y1 - y0 + 1) / 256;
    fills.push(fill);
    assert.ok(fill <= box.fill + 0.04, `${e.id}: the subject spans ${fill.toFixed(2)} of the side, more than the box`);
    assert.ok(sn > 256 * 256 * 0.01, `${e.id}: a drop shadow is baked in (${sn} shadow-only px)`);
    assert.ok(sx / sn > ox / on && sy / sn > oy / on, `${e.id}: the shadow lies below-right of the subject`);
  }
  fills.sort((a, b) => a - b);
  const med = fills[Math.floor(fills.length / 2)];
  assert.ok(med >= box.fill - 0.08, `median subject span ${med.toFixed(2)} against the box fill ${box.fill}`);
});

test('clear plastic and glass follow the clear-body rule: the water bottle is opaque, light and cool, and stands off the dark panel', () => {
  const img = png(byId.get('icons/2142').files['256']);
  const panel = lstar(0x23, 0x25, 0x22);
  const ls = [];
  let opaque = 0;
  let interior = 0;
  let edge = 0;
  let edgeClose = 0;
  for (let y = 2; y < 254; y++) for (let x = 2; x < 254; x++) {
    const o = (y * 256 + x) * 4;
    const a = img.data[o + 3];
    if (a < 128) continue;
    const inner = [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, -2], [2, -2], [-2, 2]].every(([dx, dy]) => img.data[((y + dy) * 256 + x + dx) * 4 + 3] >= 128);
    if (inner) {
      interior++;
      if (a === 255) opaque++;
    }
    const L = lstar(img.data[o], img.data[o + 1], img.data[o + 2]);
    ls.push(L);
    const outline = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => img.data[((y + dy) * 256 + x + dx) * 4 + 3] < 128);
    if (outline) {
      edge++;
      if (Math.abs(L - panel) < 10) edgeClose++;
    }
  }
  ls.sort((a, b) => a - b);
  const med = ls[Math.floor(ls.length / 2)];
  assert.ok(opaque / interior > 0.99, `${((100 * opaque) / interior).toFixed(1)} % of the bottle's interior is opaque: nothing behind it shows through`);
  assert.ok(med >= 60 && med <= 75, `the bottle's median L* is ${med.toFixed(1)} (a light body: 60-75)`);
  assert.ok(edgeClose / edge < 0.15, `${((100 * edgeClose) / edge).toFixed(1)} % of the outline is within 10 L* of --ui-panel`);
});

test('perceptual hash: a lightly changed copy of an icon hashes the same, a different icon does not', () => {
  const a = png(byId.get('icons/2115').files['256']);
  const noisy = { ...a, data: Uint8Array.from(a.data, (v, i) => (i % 4 === 3 ? v : Math.max(0, Math.min(255, v + ((i * 7919) % 9) - 4)))) };
  const shifted = { ...a, data: new Uint8Array(a.data.length) };
  for (let y = 0; y < 256; y++) shifted.data.set(a.data.subarray(y * 1024, y * 1024 + 1020), y * 1024 + 4);
  for (const bg of UI_BACKGROUNDS) {
    assert.ok(hamming(phash(a, bg), phash(noisy, bg)) <= 4, 'noise of +-4 codes keeps the hash');
    assert.ok(hamming(phash(a, bg), phash(shifted, bg)) <= 6, 'a 1 px shift keeps the hash');
    assert.ok(hamming(phash(a, bg), phash(png(byId.get('icons/2105').files['256']), bg)) >= MIN_CATEGORY_DISTANCE, 'another icon differs');
  }
});

test(`icons in a config category are perceptually distinct: pHash distance >= ${MIN_CATEGORY_DISTANCE} bits at every size on dark and light tiles`, () => {
  /** @type {Map<number, any[]>} */
  const byCat = new Map();
  for (const e of manifest.assets) {
    const cat = item(e.params.item).cat;
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)?.push(e);
  }
  assert.ok((byCat.get(CAT.FOOD) || []).length >= 6, 'the food category holds most of the set');
  const n = manifest.assets.length;
  assert.equal(new Set(manifest.assets.map((/** @type {any} */ e) => e.files['256'])).size, n, 'every entry is its own render');
  let pairs = 0;
  for (const size of SIZES) {
    for (const bg of UI_BACKGROUNDS) {
      const icons = manifest.assets.map((/** @type {any} */ e) => ({ id: e.id, category: item(e.params.item).cat, files: e.files[String(size)], hash: phash(png(e.files[String(size)]), bg) }));
      const close = tooClose(icons, MIN_CATEGORY_DISTANCE);
      assert.deepEqual(close, [], `@${size} on #${bg.map((v) => v.toString(16).padStart(2, '0')).join('')}: ${close.map((c) => `${c.a} and ${c.b} differ by only ${c.bits} bits`).join('; ')}`);
      for (const list of byCat.values()) pairs += (list.length * (list.length - 1)) / 2;
    }
  }
  const tiers = [13540, 13543].map((c) => manifest.bindings[String(c)].asset);
  assert.notEqual(tiers[0], tiers[1]);
  assert.equal(outputs[13540].recipe, outputs[13543].recipe, 'Perfect and Failed are tiers of one recipe with distinct renders, and are compared');
  assert.ok(pairs >= 21 * 6, `${pairs} pairs compared`);
});

test('distinctness fixture: two tiers of one recipe with different renders that hash too close fail; one shared render is one icon', () => {
  const a = png(byId.get('icons/13540').files['256']);
  const near = { ...a, data: Uint8Array.from(a.data, (v, i) => (i % 4 === 3 ? v : Math.max(0, Math.min(255, v + ((i * 7919) % 7) - 3)))) };
  const [ha, hn] = [phash(a), phash(near)];
  assert.ok(hamming(ha, hn) < MIN_CATEGORY_DISTANCE, 'the fixture pair hashes too close');
  assert.equal(outputs[13541].recipe, outputs[13542].recipe, 'the fixture ids are tiers of one recipe');
  const distinct = [
    { id: 'fixture/13541', category: 1, files: 'assets/icons/13541-fixture.png', hash: ha },
    { id: 'fixture/13542', category: 1, files: 'assets/icons/13542-fixture.png', hash: hn },
  ];
  assert.equal(tooClose(distinct, MIN_CATEGORY_DISTANCE).length, 1, 'same-recipe tiers with their own renders are compared, and fail');
  const shared = distinct.map((d) => ({ ...d, files: 'assets/icons/13540.png' }));
  assert.equal(tooClose(shared, MIN_CATEGORY_DISTANCE).length, 0, 'ids bound to one render are one icon');
  assert.equal(tooClose([distinct[0], { ...distinct[1], category: 2 }], MIN_CATEGORY_DISTANCE).length, 0, 'other categories are not compared');
});

/** Glyph sizes (mm) that would read as lettering on a package. */
const labelWindow = (/** @type {number} */ ppmm) => ({ minH: Math.round(1.2 * ppmm), maxH: Math.round(9 * ppmm) });

/**
 * Draws rows of random glyph-like strokes, as an image model's garbled lettering looks.
 * @param {import('../tools/lib/png.mjs').Image} img @param {number} glyph height in px @param {number} seed
 */
function pseudoText(img, glyph, seed) {
  const c = new Canvas(img.width, img.height, 1, { bg: null });
  const rnd = rng(seed);
  for (let row = 0; row < 2; row++) {
    let x = img.width * 0.15;
    const y = img.height * (0.35 + 0.2 * row);
    for (let k = 0; k < 9; k++) {
      const gw = glyph * (0.45 + 0.35 * rnd());
      for (let s = 0, n = 2 + Math.floor(rnd() * 3); s < n; s++) {
        const kind = Math.floor(rnd() * 4);
        /** @type {[number, number][]} */
        let pts;
        if (kind === 0) pts = [[x + gw * rnd(), y], [x + gw * rnd(), y + glyph]];
        else if (kind === 1) pts = [[x, y + glyph * rnd()], [x + gw, y + glyph * rnd()]];
        else if (kind === 2) pts = [[x + gw * 0.5, y], [x + gw * rnd(), y + glyph]];
        else {
          const a0 = rnd() * 6;
          pts = Array.from({ length: 9 }, (_, t) => /** @type {[number, number]} */ ([x + gw / 2 + (gw / 2) * Math.cos(a0 + t * 0.35), y + glyph / 2 + (glyph / 2) * Math.sin(a0 + t * 0.35)]));
        }
        c.fill(stroke(pts, Math.max(1.2, glyph * 0.12)), '#1e1e1e');
      }
      x += gw + glyph * 0.3 + (k === 4 ? glyph * 0.6 : 0);
    }
  }
  return over(img, c.images().color);
}

test('text detector: it flags garbled pseudo-text and real digits on a label and on an icon, and passes a row of identical ornaments', () => {
  const label = renderLabel('luncheon');
  const win = labelWindow(label.ppmm);
  assert.equal(textLines(label.color, win).lines.length, 0);
  assert.ok(textLines(pseudoText(label.color, 5 * label.ppmm, 11), win).lines.length > 0, 'pseudo-text on a label is found');
  const icon = png(byId.get('icons/15026').files['256']);
  assert.equal(textLines(icon).lines.length, 0);
  assert.ok(textLines(pseudoText(icon, 12, 12)).lines.length > 0, 'pseudo-text on an icon is found');
  const sticker = new Canvas(256, 256, 1, { bg: null });
  sticker.fill([[[30, 108], [140, 108], [140, 138], [30, 138]]], '#f6f4ee');
  const digits = over(icon, sticker.images().color);
  drawDigits(digits, '21052502', 38, 116, 3, [25, 25, 25]);
  assert.ok(textLines(digits).lines.length > 0, 'real digits on a price sticker are found');
  const ornaments = new Canvas(256, 256, 1, { bg: '#efe2bf' });
  for (let k = 0; k < 10; k++) ornaments.fill(star(20 + k * 22, 128, 7, 3, 5), '#303030');
  assert.equal(textLines(ornaments.images().color).lines.length, 0, 'a row of identical stars is ornament, not text');
});

test('no text artifacts: no label and no icon shows a text-like row of glyphs', () => {
  for (const id of LABEL_IDS) assert.ok(Object.hasOwn(LABELS, id), `catalog label ${id} is drawn by labels.mjs`);
  for (const id of Object.keys(LABELS)) {
    const l = renderLabel(id);
    const found = textLines(l.color, labelWindow(l.ppmm)).lines;
    assert.deepEqual(found, [], `label ${id} has text-like rows: ${JSON.stringify(found)}`);
  }
  for (const e of manifest.assets) {
    for (const bg of UI_BACKGROUNDS) {
      for (const size of [128, 256]) {
        const found = textLines(png(e.files[String(size)]), { bg }).lines;
        assert.deepEqual(found, [], `${e.id} @${size} has text-like rows: ${JSON.stringify(found)}`);
      }
    }
  }
});

test('one fixed rig renders every icon: the game camera pitch, three area lights, CPU Cycles with a fixed seed and samples', () => {
  assert.equal(rig.camera.pitchDeg, CAMERA.pitchDeg, 'the icon camera looks down at the game camera pitch (src/contracts/look.js)');
  assert.deepEqual(Object.keys(rig.lights).sort(), ['fill', 'key', 'rim']);
  const ratio = rig.lights.key.power / rig.lights.fill.power;
  assert.ok(ratio >= 2.7 && ratio <= 3.3, `key:fill ${ratio.toFixed(2)}:1 (about 3:1, the source keeps dark shadow sides)`);
  assert.equal(rig.cycles.device, 'CPU');
  assert.equal(rig.cycles.adaptiveSampling, false);
  assert.equal(rig.resolution, 256);
  assert.deepEqual(manifest.rebuild.icons.cycles, { seed: rig.cycles.seed, samples: rig.cycles.samples });
  const perIcon = new Set(['id', 'builder', 'title', 'labels', 'pose', 'quality', 'serves', 'tin', 'cup', 'loaf', 'sack', 'bottle', 'dish', 'roll', 'planks', 'packet', 'trap', 'book']);
  for (const i of CATALOG.icons) for (const k of Object.keys(i)) assert.ok(perIcon.has(k), `catalog icon ${i.id} sets '${k}': only the subject and its pose vary per icon`);
  for (const e of manifest.assets) assert.deepEqual(e.files, iconFiles(e.params.item), `${e.id}: files named assets/icons/<id>.png, <id>@128.png, <id>@64.png`);
});

test('asset lock: node tools/asset-lock.mjs --asset icons/<id> re-bakes a seeded icon at SSIM >= 0.99', () => {
  /** @type {string | null} */
  let commit;
  try {
    commit = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    commit = null;
  }
  const pool = manifest.assets.map((/** @type {any} */ e) => ({ id: e.id, family: 'icons' }));
  const [id] = sample(pool, seedFor(commit));
  const r = spawnSync(process.execPath, [join(ROOT, 'tools/asset-lock.mjs'), '--json', '--asset', id], { cwd: ROOT, encoding: 'utf8', timeout: 900_000 });
  const report = JSON.parse(r.stdout.trim().split('\n').at(-1) || '{}');
  assert.equal(r.status, 0, `asset-lock failed for ${id}: ${report.summary}\n${(report.problems || []).join('\n')}\n${r.stderr}`);
  assert.deepEqual(report.sampled, [id]);
  assert.equal(report.results.length, assetOutputs(byId.get(id)).length, 'every file of the icon was re-baked and compared');
  for (const res of report.results) assert.ok(res.ssim >= 0.99, `${res.file}: SSIM ${res.ssim}`);
});
