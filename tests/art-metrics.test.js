// @ts-check
// The art metrics (tools/art-metrics.mjs): each check on a fixture that passes and one that fails, the standard
// against docs/ART.md, and the CLI over whole fixture checkouts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { ALBEDO, FAMILY_BANDS, TEXEL_DENSITY, TEXT, TILING } from '../tools/art-metrics/standard.mjs';
import { contentFindings, createContext, requiredFindings } from '../tools/art-metrics/run.mjs';
import { checkMaterial } from '../tools/art-metrics/materials.mjs';
import { checkModel } from '../tools/art-metrics/models.mjs';
import { checkIcons, deltaE, hammingDistance, perceptualHash } from '../tools/art-metrics/icons.mjs';
import { checkLightmap } from '../tools/art-metrics/lightmaps.mjs';
import { findTextRows } from '../tools/art-metrics/text.mjs';
import { decodeImage, encodeRawKtx2 } from '../tools/art-metrics/images.mjs';
import { glb, grid, noise, png, rgba, tempRoot } from './visual/fixtures.mjs';

const run = promisify(execFile);
const SCHEMA = 'survival-logs/asset-manifest@1';

/** @param {import('../tools/art-metrics/findings.mjs').Finding[]} fs */
const byCheck = (fs) => {
  /** @type {Record<string, string>} */
  const out = {};
  for (const f of fs) out[f.check] = out[f.check] === 'fail' ? 'fail' : f.state;
  return out;
};

// ------------------------------------------------------------------------------------------ the standard

test('the art-metrics standard states the numbers docs/ART.md decides (§3 texel density, §7.2 albedo and roughness)', () => {
  const art = readFileSync(new URL('../docs/ART.md', import.meta.url), 'utf8');
  const has = (/** @type {string} */ needle, /** @type {string} */ what) => assert.ok(art.includes(needle), `docs/ART.md should say ${JSON.stringify(needle)} (${what})`);
  has(`linear **${ALBEDO.dielectric.min}–${ALBEDO.dielectric.max.toFixed(2)}**`, 'the hard albedo limits');
  has('bare steel `metalness 1`, F0 0.56; aluminium F0 0.91', 'the metal F0 values the metal range widens');
  const c = TEXEL_DENSITY.classes;
  has(`| **regular** (floors, walls, furniture, clutter) | **${c.regular} px/m**`, 'the regular class');
  has(`| **tall partition** (\`keepFullHeight\` partition faces above 2.2 m) | **${c.tall} px/m**`, 'the tall-partition class');
  has(`| **hero** (characters, inspected furniture, doors, interactables) | **${c.hero} px/m**`, 'the hero class');
  has(`| distant exterior (more than 12 m from any playable floor) | ${c.distant} px/m`, 'the distant class');
  has(`±${TEXEL_DENSITY.tolerance * 100} % per UV island mean`, 'the tolerance');
  has(`Tiled materials repeat at ${TILING.sizesM[0]} m or ${TILING.sizesM[1]} m`, 'the tile sizes');
  const b = FAMILY_BANDS;
  has(`**0.60** (${b.plaster_paint.albedo?.join('–')} allowed)`, 'plaster');
  has(`| ${b.plaster_paint.roughness?.[0]}–${b.plaster_paint.roughness?.[1]} |`, 'plaster roughness');
  has(`**${b.wood_floor.albedo?.[0]}–${b.wood_floor.albedo?.[1]}**`, 'wood floors');
  has(`${b.wood_floor.roughness?.[0]}–${b.wood_floor.roughness?.[1]} (satin varnish)`, 'wood-floor roughness');
  has(`**${b.fabric.albedo?.[0]}–${b.fabric.albedo?.[1]}**`, 'fabric');
  has(`**${b.foliage.albedo?.[0]}–${b.foliage.albedo?.[1]}**`, 'foliage');
  has(`Grout ${b.grout.albedo?.[0].toFixed(2)}–${b.grout.albedo?.[1].toFixed(2)} decided`, 'grout');
  has('| 0.15–0.30 (glazed) |', 'tile roughness');
  has(`garments ${b.cloth.albedo?.[0].toFixed(2)}–${b.cloth.albedo?.[1].toFixed(2)}, sRGB 89–149`, 'the survivor clothing band');
  has(`Roughness ${b.cloth.roughness?.[0]}–${b.cloth.roughness?.[1].toFixed(1)} (cloth), ${b.cloth_leather.roughness?.[0]}–${b.cloth_leather.roughness?.[1]}`, 'clothing roughness');
});

// ------------------------------------------------------------------------------------------ materials

/**
 * A fabric material whose maps come from pixel functions, checked on its own.
 * @param {{ base?: (x: number, y: number) => number[], orm?: ((x: number, y: number) => number[]) | null, normal?: (x: number, y: number) => number[], normalKtx?: Uint8Array, size?: number, params?: Record<string, unknown> }} o
 *   orm null: no ORM map; normalKtx: the normal map as this KTX2 file instead of a PNG
 */
async function material(o = {}) {
  const n = o.size ?? 256;
  const base = o.base ?? ((x, y) => [150 + 16 * noise(x, y) - 8, 138 + 16 * noise(x, y, 2) - 8, 120 + 16 * noise(x, y, 3) - 8]);
  const orm = o.orm === null ? null : (o.orm ?? ((x, y) => [240, 0.9 * 255 + 10 * noise(x, y, 4) - 5, 0]));
  const normal = o.normal ?? ((x, y) => {
    const dx = (noise(x, y, 5) - 0.5) * 0.1;
    const dy = (noise(x, y, 6) - 0.5) * 0.1;
    const z = Math.sqrt(1 - dx * dx - dy * dy);
    return [(dx * 0.5 + 0.5) * 255, (dy * 0.5 + 0.5) * 255, (z * 0.5 + 0.5) * 255];
  });
  const entry = {
    id: 'materials/test',
    kind: 'material',
    path: 'assets/materials/test/',
    license: 'LicenseRef-Original',
    files: { baseColor: 'assets/materials/test/baseColor.png', normal: `assets/materials/test/normal.${o.normalKtx ? 'ktx2' : 'png'}`, ...(orm ? { orm: 'assets/materials/test/orm.png' } : {}) },
    params: { family: 'fabric', tier: 'regular', sizeM: [1, 1], pbr: { roughnessFactor: 1, metalnessFactor: 0 }, ...o.params },
  };
  const r = tempRoot({
    'assets/materials/test/baseColor.png': png(n, n, base),
    ...(o.normalKtx ? { 'assets/materials/test/normal.ktx2': o.normalKtx } : { 'assets/materials/test/normal.png': png(n, n, normal) }),
    ...(orm ? { 'assets/materials/test/orm.png': png(n, n, orm) } : {}),
  });
  try {
    const manifest = { schema: SCHEMA, assets: [entry] };
    const ctx = await createContext(r.root, [{ manifest: /** @type {any} */ (manifest) }]);
    return byCheck(await checkMaterial(/** @type {any} */ (entry), ctx));
  } finally {
    r.done();
  }
}

test('material checks: a fabric inside ART.md passes every one', async () => {
  const c = await material();
  for (const k of ['albedo-range', 'albedo-band', 'roughness-saturation', 'roughness-band', 'metalness', 'normal-length', 'tile-seams', 'tile-repetition', 'tile-size', 'texel-density', 'text-artifacts']) {
    assert.equal(c[k], 'pass', `${k} should pass: ${JSON.stringify(c)}`);
  }
});

test('material checks: each fails on its own defect', async () => {
  const bright = await material({ base: () => [252, 250, 248] });
  assert.equal(bright['albedo-range'], 'fail', 'albedo above the 0.90 hard limit');
  const pale = await material({ base: (x, y) => [205 + 8 * noise(x, y), 200, 195] });
  assert.equal(pale['albedo-range'], 'pass');
  assert.equal(pale['albedo-band'], 'fail', 'a fabric at 0.6 is above the 0.22–0.46 band');
  const clipped = await material({ orm: (x, y) => [240, (x + y) % 10 === 0 ? 255 : 230, 0] });
  assert.equal(clipped['roughness-saturation'], 'fail', '10 % of the roughness texels at 255');
  const glossy = await material({ orm: (x, y) => [240, 0.3 * 255 + 6 * noise(x, y), 0] });
  assert.equal(glossy['roughness-band'], 'fail', 'fabric roughness 0.3 is outside 0.85–1.0');
  const flat = await material({ normal: () => [128, 128, 128] });
  assert.equal(flat['normal-length'], 'fail', 'unnormalised normals');
  const ramp = await material({ base: (x) => [110 + x * 0.25, 110 + x * 0.25, 100 + x * 0.25] });
  assert.equal(ramp['tile-seams'], 'fail', 'a ramp jumps at the wrap');
  const blotch = await material({ base: (x, y) => (x < 64 && y < 64 ? [70, 66, 60] : [150 + 8 * noise(x, y), 138, 120]) });
  assert.equal(blotch['tile-repetition'], 'fail', 'a dark quarter-tile blotch repeats at every tile');
  const odd = await material({ size: 384, params: { sizeM: [1.5, 1.5] } });
  assert.equal(odd['tile-size'], 'fail', 'a 1.5 m repeat');
  assert.equal(odd['texel-density'], 'pass', '384 px over 1.5 m is 256 px/m');
  const dense = await material({ size: 512 });
  assert.equal(dense['texel-density'], 'fail', '512 px/m for the regular class');
  const printed = await material({ base: (x, y) => (inGlyphRow(x, y, 40, 100) ? [40, 36, 30] : [150 + 8 * noise(x, y), 138, 120]) });
  assert.equal(printed['text-artifacts'], 'fail', 'a row of glyphs printed on the scan');
});

test('material checks: metalness per texel, the maps a library material needs, unbanded families', async () => {
  const fabric = (/** @type {number} */ x, /** @type {number} */ y) => [150 + 16 * noise(x, y) - 8, 138, 120];
  const halfMetal = await material({ base: (x, y) => (x < 128 ? [250, 250, 250] : fabric(x, y)), orm: (x, y) => [240, 0.9 * 255 + 4 * noise(x, y), x < 128 ? 255 : 0], params: { family: 'metal_painted', pbr: { roughnessFactor: 1, metalnessFactor: 1 } } });
  assert.equal(halfMetal['albedo-range'], 'pass', 'the metal half is judged against F0, the paint half against the dielectric limits');
  assert.equal(halfMetal.metalness, 'pass', 'every texel is 0 or 1');
  const darkMetal = await material({ base: () => [60, 60, 60], orm: (x, y) => [240, 0.3 * 255 + 4 * noise(x, y), 255], params: { family: 'metal_bare' } });
  assert.equal(darkMetal['albedo-range'], 'fail', 'metal texels at 0.045 are below F0 0.50 (fine for a dielectric)');
  const blend = await material({ orm: (x, y) => [240, 0.9 * 255 + 4 * noise(x, y), 128], params: { pbr: { roughnessFactor: 1, metalnessFactor: 1 } } });
  assert.equal(blend.metalness, 'fail', 'every texel at metalness 0.5');
  const noOrm = await material({ orm: null });
  assert.equal(noOrm['roughness-saturation'], 'fail', 'no ORM map');
  assert.equal(noOrm['roughness-band'], 'fail', 'no ORM map');
  const unknown = await material({ params: { family: 'unobtainium' } });
  assert.equal(unknown['albedo-band'], 'fail', 'a family ART.md does not band');
  assert.equal(unknown['roughness-band'], 'fail');
  const rust = await material({ base: () => [120, 70, 50], params: { family: 'rust' } });
  assert.equal(rust['roughness-band'], 'fail', 'rust has an albedo band but no roughness in ART.md');
  const glass = await material({ params: { family: 'glass' }, orm: (x, y) => [240, 0.15 * 255 + 4 * noise(x, y), 0] });
  assert.equal(glass['albedo-range'], 'skip', 'transmissive: exempt');
  assert.equal(glass['roughness-band'], 'pass');
});

test('material checks: repetition at 4 × 4, 8 × 8 and 16 × 16, and normals on every mip', async () => {
  const fabric = (/** @type {number} */ x, /** @type {number} */ y) => [150 + 16 * noise(x, y) - 8, 138, 120];
  const knot = await material({ base: (x, y) => (x >= 100 && x < 116 && y >= 100 && y < 116 ? [40, 36, 30] : fabric(x, y)) });
  assert.equal(knot['tile-repetition'], 'fail', 'a 16 px knot: small at 4 × 4 and 8 × 8, standing out at 16 × 16');
  const faint = await material({ base: (x, y) => (x >= 100 && x < 116 && y >= 100 && y < 116 ? [140, 130, 114] : fabric(x, y)) });
  assert.equal(faint['tile-repetition'], 'pass', 'a faint 16 px patch');
  const up = (/** @type {number} */ s) => rgba(s, s, () => [128, 128, 255]);
  const flatMip = await material({ normalKtx: encodeRawKtx2({ width: 256, height: 256, rgba: up(256), mips: [rgba(128, 128, () => [128, 128, 128]), up(64)] }) });
  assert.equal(flatMip['normal-length'], 'fail', 'mip 1 is unnormalised');
  const goodMips = await material({ normalKtx: encodeRawKtx2({ width: 256, height: 256, rgba: up(256), mips: [up(128), up(64)] }) });
  assert.equal(goodMips['normal-length'], 'pass');
});

test('text artifacts: declared label lines explain matching rows, and nothing else', async () => {
  const printed = (/** @type {number} */ x, /** @type {number} */ y) => (inGlyphRow(x, y, 40, 100) ? [40, 36, 30] : [150 + 8 * noise(x, y), 138, 120]);
  assert.equal((await material({ base: printed, params: { labelText: ['BISCUIT'] } }))['text-artifacts'], 'pass', '7 glyphs, a 7-letter label line');
  assert.equal((await material({ base: printed, params: { labelText: ['OK'] } }))['text-artifacts'], 'fail', 'a 2-letter line does not explain 7 glyphs');
  assert.equal((await material({ base: printed, params: { labelText: 'BISCUIT' } }))['text-artifacts'], 'pass', 'a single string is one line');
});

test('repetition with a declared pattern: a clean checker at ART.md 0.75 / 0.38 passes, a repeated stain still fails', async () => {
  // ART.md §7.2 checker: light 0.75, dark 0.38 (linear) -> sRGB codes 225 and 166; 32 px cells, a 64 px (0.25 m) pattern
  const cell = (/** @type {number} */ x, /** @type {number} */ y) => ((Math.floor(x / 32) + Math.floor(y / 32)) % 2 ? 166 : 225);
  const checker = (/** @type {number} */ x, /** @type {number} */ y) => {
    const v = cell(x, y) + 4 * noise(x, y) - 2;
    return [v, v, v];
  };
  const bare = await material({ base: checker, params: { family: 'tile_checker_dark' } });
  assert.equal(bare['tile-repetition'], 'fail', 'without patternM the checker reads as 33 % blocks');
  const declared = await material({ base: checker, params: { family: 'tile_checker_dark', patternM: 0.25 } });
  assert.equal(declared['tile-repetition'], 'pass', 'with its pattern removed the checker is clean');
  const stained = await material({ base: (x, y) => (x >= 100 && x < 140 && y >= 100 && y < 140 ? checker(x, y).map((v) => v * 0.55) : checker(x, y)), params: { family: 'tile_checker_dark', patternM: 0.25 } });
  assert.equal(stained['tile-repetition'], 'fail', 'a stain in one place repeats with every tile');
  const odd = await material({ base: checker, params: { family: 'tile_checker_dark', patternM: 0.3 } });
  assert.equal(odd['tile-repetition'], 'fail', 'a 0.3 m pattern does not divide a 1 m tile of 256 px');
});

test('repetition cannot be switched off: patternM only for patterned families, at least 4 periods, a residual floor; a 2 × 2 copy fails tile-size', async () => {
  const fabric = (/** @type {number} */ x, /** @type {number} */ y) => [150 + 16 * noise(x, y) - 8, 138, 120];
  const cell = (/** @type {number} */ x, /** @type {number} */ y) => ((Math.floor(x / 32) + Math.floor(y / 32)) % 2 ? 166 : 225);
  const whole = await material({ base: (x, y) => [cell(x, y), cell(x, y), cell(x, y)], params: { family: 'tile_checker_dark', patternM: 1 } });
  assert.equal(whole['tile-repetition'], 'fail', 'patternM equal to the whole tile (1 period per side)');
  const two = await material({ base: (x, y) => [cell(x, y), cell(x, y), cell(x, y)], params: { family: 'tile_checker_dark', patternM: 0.5 } });
  assert.equal(two['tile-repetition'], 'fail', '2 periods per side are too few');
  const concrete = await material({ base: fabric, params: { family: 'fabric', patternM: 0.25 } });
  assert.equal(concrete['tile-repetition'], 'fail', 'fabric is no patterned family');
  const flat = await material({ base: (x, y) => { const v = cell(x, y); return [v, v, v]; }, params: { family: 'tile_ceramic', patternM: 0.25 } });
  assert.equal(flat['tile-repetition'], 'fail', 'a pattern that explains the whole texture leaves nothing to judge');
  // the oak floor of the recalibrated library: one 1 m tile copied 2 × 2 and filed as the 256 px tile
  const oak = (/** @type {number} */ x, /** @type {number} */ y) => [120 + 30 * noise(x % 128, y % 128) - 15, 90, 60];
  const copied = await material({ base: oak, params: { family: 'wood_floor' } });
  assert.equal(copied['tile-size'], 'fail', 'equal to itself shifted by half the tile: it repeats at half the declared size');
  const quarter = await material({ base: (x, y) => [120 + 30 * noise(x % 64, y) - 15, 90, 60], params: { family: 'wood_floor' } });
  assert.equal(quarter['tile-size'], 'fail', 'a quarter-tile copy along x');
  const real = await material({ base: (x, y) => [120 + 30 * noise(x, y) - 15, 90, 60], params: { family: 'wood_floor' } });
  assert.equal(real['tile-size'], 'pass', 'a tile that does not repeat inside itself');
  const plain = await material({ base: () => [150, 138, 120], params: { family: 'fabric' } });
  assert.equal(plain['tile-size'], 'pass', 'a flat tile has no structure to repeat (glass, cardboard)');
  const checker = await material({ base: (x, y) => { const v = cell(x, y) + 4 * noise(x, y) - 2; return [v, v, v]; }, params: { family: 'tile_checker_dark', patternM: 0.25 } });
  assert.deepEqual([checker['tile-size'], checker['tile-repetition']], ['pass', 'pass'], "a checker's own period is no copy");
});

// ------------------------------------------------------------------------------------------ text artifacts

/** Outlined blobs of varied widths on one baseline, 2 px strokes, like letters. @param {number} x @param {number} y @param {number} x0 @param {number} y0 */
function inGlyphRow(x, y, x0, y0) {
  const widths = [10, 14, 8, 12, 15, 9, 11];
  let cx = x0;
  for (const w of widths) {
    if (x >= cx && x < cx + w && y >= y0 && y < y0 + 20) return x < cx + 2 || x >= cx + w - 2 || y < y0 + 2 || y >= y0 + 18 || (y >= y0 + 9 && y < y0 + 11);
    cx += w + 4;
  }
  return false;
}

test('text detection: short rows need 4 thin-stroked glyphs, so gravel is not text; no library material shows any', async () => {
  const W = 256;
  // five 12 px letters with 1-2 px strokes, of varied widths
  const small = (/** @type {number} */ x, /** @type {number} */ y) => {
    const widths = [7, 9, 6, 8, 10];
    let cx = 40;
    for (const w of widths) {
      if (x >= cx && x < cx + w && y >= 100 && y < 112) return x < cx + 2 || y < 101 || y >= 111 || (y >= 105 && y < 107);
      cx += w + 3;
    }
    return false;
  };
  assert.ok(findTextRows(rgba(W, W, (x, y) => (small(x, y) ? [30, 30, 30] : [220, 215, 205])), W, W).length >= 1, 'a 12 px word is still text');
  // four 13 px solid pebbles of varied widths on a baseline: the old rule (3 glyphs, no stroke test) read them as text
  const speck = (/** @type {number} */ x, /** @type {number} */ y) => {
    let cx = 50;
    for (const rx of [4, 7, 5, 8]) {
      cx += rx;
      if (((x - cx) / rx) ** 2 + ((y - 120) / 6.5) ** 2 < 1 + 0.2 * noise(x, y, 9)) return true;
      cx += rx + 3;
    }
    return false;
  };
  const gravel = rgba(W, W, (x, y) => (speck(x, y) ? [40, 40, 40] : [200, 200, 200]));
  assert.equal(findTextRows(gravel, W, W, /** @type {any} */ ({ ...TEXT, minGlyphsShort: 3, maxStrokeShare: 9 })).length, 1, 'the old rule finds a row');
  assert.equal(findTextRows(gravel, W, W).length, 0, 'solid pebbles are not text');
  const three = (/** @type {number} */ x, /** @type {number} */ y) => {
    const widths = [7, 9, 6];
    let cx = 40;
    for (const w of widths) {
      if (x >= cx && x < cx + w && y >= 100 && y < 112) return x < cx + 2 || y < 101 || y >= 111;
      cx += w + 3;
    }
    return false;
  };
  assert.equal(findTextRows(rgba(W, W, (x, y) => (three(x, y) ? [30, 30, 30] : [220, 215, 205])), W, W).length, 0, 'three short glyphs are too few');
  const lib = JSON.parse(readFileSync(new URL('../assets/materials/library.json', import.meta.url), 'utf8'));
  for (const a of lib.assets) {
    if (!a.files?.baseColor) continue;
    const t = await decodeImage(new Uint8Array(readFileSync(new URL(`../${a.files.baseColor}`, import.meta.url))));
    if (!t.float) assert.deepEqual(findTextRows(/** @type {Uint8Array} */ (t.rgba), t.width, t.height), [], `${a.id}: no text-like rows`);
  }
});

test('text-artifact detection finds a row of glyphs, and not noise or a periodic weave', () => {
  const W = 256;
  const text = rgba(W, W, (x, y) => (inGlyphRow(x, y, 30, 120) ? [30, 30, 30] : [220, 215, 205]));
  assert.ok(findTextRows(text, W, W).length >= 1, 'the glyph row');
  const plain = rgba(W, W, (x, y) => [150 + 20 * noise(x, y), 140, 130]);
  assert.equal(findTextRows(plain, W, W).length, 0, 'noise');
  const weave = rgba(W, W, (x, y) => (x % 16 < 10 && y % 16 < 10 && (x % 16 < 3 || x % 16 > 6 || y % 16 < 3 || y % 16 > 6) ? [60, 60, 60] : [200, 200, 200]));
  assert.equal(findTextRows(weave, W, W).length, 0, 'identical blobs on a grid are a weave, not text');
});

// ------------------------------------------------------------------------------------------ models

/**
 * A model entry over one glb, checked on its own.
 * @param {{ mesh?: import('./visual/fixtures.mjs').MeshSpec, extra?: import('./visual/fixtures.mjs').MeshSpec[], lod?: import('./visual/fixtures.mjs').MeshSpec, atlas?: number, normalPx?: (x: number, y: number) => number[], params?: Record<string, unknown>, meta?: Record<string, unknown>, materials?: boolean, kind?: string, skin?: { influences: number }, clips?: string[], textures?: { baseColor?: Uint8Array, metallicRoughness?: Uint8Array, normal?: Uint8Array }, metallic?: number }} o
 */
async function model(o = {}) {
  return byCheck(await modelFindings(o));
}

/** @param {Parameters<typeof model>[0]} o */
async function modelFindings(o = {}) {
  const mesh = o.mesh ?? grid({ n: 4, size: 1 });
  const atlas = o.atlas ?? 256;
  /** @type {Record<string, Uint8Array>} */
  const files = {
    'assets/furniture/test/test.glb': await glb([mesh, ...(o.extra || [])], { skin: o.skin, clips: o.clips, textures: o.textures, metallic: o.metallic }),
    'assets/furniture/test/normal.png': png(atlas, atlas, o.normalPx ?? (() => [128, 128, 255])),
    'assets/materials/good/baseColor.png': png(8, 8, () => [140, 130, 120]),
  };
  if (o.lod) files['assets/furniture/test/test_lod1.glb'] = await glb([o.lod]);
  const entry = {
    id: 'furniture/test',
    kind: o.kind ?? 'model',
    path: 'assets/furniture/test/test.glb',
    license: 'LicenseRef-Original',
    files: { normal: 'assets/furniture/test/normal.png' },
    ...(o.lod ? { lods: [{ level: 1, path: 'assets/furniture/test/test_lod1.glb' }] } : {}),
    ...(o.materials === false ? {} : { materials: { body: { material: 'materials/good' } } }),
    params: { class: 'prop', tier: 'regular', bake: { uv: 1 }, ...o.params },
    meta: { ...o.meta },
  };
  const lib = { id: 'materials/good', kind: 'material', path: 'assets/materials/good/', license: 'LicenseRef-Original', files: { baseColor: 'assets/materials/good/baseColor.png' } };
  const r = tempRoot(files);
  try {
    const ctx = await createContext(r.root, [{ manifest: /** @type {any} */ ({ schema: SCHEMA, assets: [entry, lib] }) }]);
    const fs = await checkModel(/** @type {any} */ (entry), ctx);
    return [...fs, ...requiredFindings([/** @type {any} */ (entry)], fs)];
  } finally {
    r.done();
  }
}

test('model checks: a prop inside its budgets, density and meter UVs passes', async () => {
  const c = await model({ lod: grid({ n: 2, size: 1 }), meta: { triangles: 32 } });
  for (const k of ['triangle-budget', 'lod-triangles', 'texel-density', 'meter-uv', 'normal-length']) assert.equal(c[k], 'pass', `${k}: ${JSON.stringify(c)}`);
});

test('model checks: each fails on its own defect', async () => {
  assert.equal((await model({ mesh: grid({ n: 30, size: 1 }) }))['triangle-budget'], 'fail', '1800 triangles for a 1500 prop');
  assert.equal((await model({ meta: { triangles: 10 } }))['triangle-budget'], 'fail', 'the manifest says 10, the file has 32');
  assert.equal((await model({ params: { class: 'spaceship' } }))['triangle-budget'], 'fail', 'a class with no budget');
  assert.equal((await model({ lod: grid({ n: 6, size: 1 }) }))['lod-triangles'], 'fail', 'LOD 1 with more triangles than LOD 0');
  assert.equal((await model({ mesh: grid({ n: 5, size: 1 }), lod: grid({ n: 4, size: 1 }) }))['lod-triangles'], 'fail', 'LOD 1 keeps 32 of 50 triangles (64 %, limit 60 %)');
  assert.equal((await model({ mesh: grid({ n: 5, size: 1 }), lod: grid({ n: 3, size: 1 }) }))['lod-triangles'], 'pass', 'LOD 1 keeps 18 of 50 (36 %)');
  assert.equal((await model({ extra: [confetti(300)] }))['texel-density'], 'fail', '300 islands too small to judge cover 11 % of the area (limit 10 %)');
  assert.equal((await model({ extra: [confetti(20)] }))['texel-density'], 'pass', '20 of them cover 0.8 %');
  assert.equal((await model({ mesh: grid({ n: 4, size: 1, uv1Extent: 0.5 }) }))['texel-density'], 'fail', '128 px/m on the regular class');
  assert.equal((await model({ mesh: grid({ n: 4, size: 1, uvScale: 0.5 }) }))['meter-uv'], 'fail', 'UV0 at half a unit per metre');
  assert.equal((await model({ normalPx: () => [128, 128, 64] }))['normal-length'], 'fail', 'back-facing baked normals');
});

/**
 * `k` disconnected 2 cm quads beside the grid, each its own UV1 island under the 64-texel floor.
 * @param {number} k
 * @returns {import('./visual/fixtures.mjs').MeshSpec}
 */
function confetti(k) {
  const positions = [];
  const uv0 = [];
  const uv1 = [];
  const indices = [];
  const q = 0.02;
  for (let i = 0; i < k; i++) {
    const x = 2 + (i % 20) * 0.05;
    const z = Math.floor(i / 20) * 0.05;
    const u = 0.001 + (i % 20) * 0.002;
    const v = 0.001 + Math.floor(i / 20) * 0.002;
    const b = i * 4;
    positions.push(x, 0, z, x + q, 0, z, x + q, 0, z + q, x, 0, z + q);
    uv0.push(x, z, x + q, z, x + q, z + q, x, z + q);
    uv1.push(u, v, u + 0.001, v, u + 0.001, v + 0.001, u, v + 0.001);
    indices.push(b, b + 3, b + 1, b + 1, b + 3, b + 2);
  }
  return { material: 'body', positions, indices, uvs: [uv0, uv1], normals: Array.from({ length: k * 4 }, () => [0, 1, 0]).flat() };
}

/** Textures of a character that meets the standard (64 px, over UV0 in metres). */
const CHAR_TEX = () => ({
  baseColor: png(64, 64, (x, y) => [150 + 16 * noise(x, y) - 8, 120, 100]),
  metallicRoughness: png(64, 64, (x, y) => [0, 0.85 * 255 + 8 * noise(x, y), 0]),
  normal: png(64, 64, () => [128, 128, 255]),
});

test('character checks: bone influences and the required clips', async () => {
  const good = await model({ kind: 'character', skin: { influences: 4 }, clips: ['idle', 'walk', 'run'], params: { tier: 'regular' } });
  assert.equal(good['bone-influences'], 'pass');
  assert.equal(good['required-clips'], 'pass');
  assert.equal(good['triangle-budget'], 'pass', 'characters default to the 15k character budget');
  const heavy = await model({ kind: 'character', skin: { influences: 6 }, clips: ['idle', 'walk', 'run'] });
  assert.equal(heavy['bone-influences'], 'fail', '6 influences');
  const stiff = await model({ kind: 'character', skin: { influences: 2 }, clips: ['idle'] });
  assert.equal(stiff['required-clips'], 'fail', 'no walk clip');
  const walker = await model({ kind: 'character', skin: { influences: 2 }, clips: ['idle', 'walk'] });
  assert.equal(walker['required-clips'], 'fail', 'no run clip (WP-P0-09: idle, walk, run)');
  const unrigged = await model({ kind: 'character', clips: [] });
  assert.equal(unrigged['bone-influences'], 'fail', 'a character with no skin');
});

test('character checks: embedded maps judged by texel metalness, and the checks a character requires', async () => {
  const base = { kind: 'character', skin: { influences: 4 }, clips: ['idle', 'walk', 'run'], params: { tier: 'regular' } };
  const good = await model({ ...base, textures: CHAR_TEX() });
  for (const k of ['albedo-range', 'roughness-saturation', 'metalness', 'normal-length', 'text-artifacts', 'texel-density', 'triangle-budget']) assert.equal(good[k], 'pass', `${k}: ${JSON.stringify(good)}`);
  const bare = await model(base);
  for (const k of ['albedo-range', 'metalness', 'text-artifacts']) assert.equal(bare[k], 'fail', `a character without a base color or metallic-roughness map fails ${k}`);
  const buckle = await model({ ...base, textures: { ...CHAR_TEX(), baseColor: png(64, 64, () => [250, 250, 250]), metallicRoughness: png(64, 64, () => [0, 100, 255]) } });
  assert.equal(buckle['albedo-range'], 'pass', 'bright texels that are metal');
  const chalk = await model({ ...base, textures: { ...CHAR_TEX(), baseColor: png(64, 64, () => [250, 250, 250]) } });
  assert.equal(chalk['albedo-range'], 'fail', 'the same brightness as a dielectric is above 0.90');
  const blend = await model({ ...base, textures: { ...CHAR_TEX(), metallicRoughness: png(64, 64, () => [0, 200, 128]) } });
  assert.equal(blend.metalness, 'fail', 'metalness 0.5 everywhere');
  const clipped = await model({ ...base, textures: { ...CHAR_TEX(), metallicRoughness: png(64, 64, () => [0, 255, 0]) } });
  assert.equal(clipped['roughness-saturation'], 'fail', 'roughness pinned at 1');
  const inked = await model({ ...base, textures: { ...CHAR_TEX(), baseColor: png(256, 256, (x, y) => (inGlyphRow(x, y, 40, 100) ? [40, 36, 30] : [150, 120, 100])) } });
  assert.equal(inked['text-artifacts'], 'fail', 'glyphs on the character atlas');
});

// ------------------------------------------------------------------------------------------ icons

/** @param {(x: number, y: number, s: number) => number[]} shape  pixel at (x, y) of an s × s icon */
function iconFiles(/** @type {string} */ name, shape, sizes = [64, 128, 256]) {
  /** @type {Record<string, Uint8Array>} */
  const files = {};
  for (const s of sizes) files[`assets/icons/${name}_${s}.png`] = png(s, s, (x, y) => shape(x, y, s));
  return files;
}
const disc = (/** @type {number[]} */ c) => (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ s) => (Math.hypot(x - s / 2, y - s / 2) < s * 0.35 ? [...c, 255] : [0, 0, 0, 0]);
const box = (/** @type {number[]} */ c) => (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ s) => (x > s * 0.2 && x < s * 0.8 && y > s * 0.35 && y < s * 0.65 ? [...c, 255] : [0, 0, 0, 0]);
const ring = (/** @type {number[]} */ c) => (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ s) => {
  const d = Math.hypot(x - s / 2, y - s / 3);
  return d < s * 0.25 && d > s * 0.12 ? [...c, 255] : [0, 0, 0, 0];
};

/** Food items of the game config (src/data/db.js: 1 Biscuits, 2 Hamburger, 3 Candy, 7 Coffee), bound in order. */
const FOODS = ['1', '2', '3', '7'];

/**
 * @param {Record<string, (x: number, y: number, s: number) => number[]>} icons
 * @param {Record<string, number[]>} [only] sizes per icon
 * @param {{ bind?: Record<string, string | null>, category?: Record<string, string | number> }} [o]  config id per icon (null: unbound; default the next food), params.category per icon
 */
async function icons(icons, only = {}, o = {}) {
  /** @type {Record<string, Uint8Array>} */
  const files = {};
  const entries = [];
  /** @type {Record<string, { asset: string }>} */
  const bindings = {};
  let k = 0;
  for (const [name, shape] of Object.entries(icons)) {
    const sizes = only[name] || [64, 128, 256];
    Object.assign(files, iconFiles(name, shape, sizes));
    const cat = o.category?.[name];
    entries.push({ id: `icons/${name}`, kind: 'icon', path: 'assets/icons/', license: 'LicenseRef-Original', files: Object.fromEntries(sizes.map((s) => [String(s), `assets/icons/${name}_${s}.png`])), ...(cat ? { params: { category: cat } } : {}) });
    const cfg = o.bind && name in o.bind ? o.bind[name] : FOODS[k++];
    if (cfg) bindings[cfg] = { asset: `icons/${name}` };
  }
  const r = tempRoot(files);
  try {
    const ctx = await createContext(r.root, [{ manifest: /** @type {any} */ ({ schema: SCHEMA, assets: entries, bindings }) }]);
    const f = await checkIcons(/** @type {any} */ (entries), ctx);
    return Object.fromEntries(entries.map((e) => [e.id.split('/')[1], byCheck(f.filter((x) => x.entry === e.id))]));
  } finally {
    r.done();
  }
}

test('icon checks: sizes with alpha, and distinct icons within a category', async () => {
  const good = await icons({ can: box([200, 60, 40]), apple: disc([60, 170, 60]), donut: ring([220, 180, 90]) });
  for (const [name, c] of Object.entries(good)) {
    assert.equal(c['icon-sizes'], 'pass', name);
    assert.equal(c['icon-distinct'], 'pass', `${name}: ${JSON.stringify(c)}`);
    assert.equal(c['text-artifacts'], 'pass', name);
  }
  const bad = await icons({ can: box([200, 60, 40]), tin: box([202, 62, 42]), plate: () => [180, 180, 180, 255] }, { plate: [64, 256] });
  assert.equal(bad.can['icon-distinct'], 'fail', 'two near-identical cans');
  assert.equal(bad.tin['icon-distinct'], 'fail');
  assert.equal(bad.plate['icon-sizes'], 'fail', 'no 128 px file and no transparent backdrop');
});

test('icon checks: categories come from the bound config item, narrowed only; colour distinctness holds under colour-blindness', async () => {
  const cats = await icons({ can: box([200, 60, 40]), apple: disc([60, 170, 60]), pill: ring([220, 220, 240]), snack: ring([220, 180, 90]) }, {}, { bind: { pill: null }, category: { apple: 'food', snack: 'food/snacks' } });
  assert.equal(cats.pill['icon-distinct'], 'fail', 'an unbound icon has no category');
  assert.equal(cats.apple['icon-distinct'], 'pass', "'food' repeats the bound category");
  assert.equal(cats.snack['icon-distinct'], 'skip', "'food/snacks' narrows it, and it is the only snack");
  const wrong = await icons({ can: box([200, 60, 40]), apple: disc([60, 170, 60]) }, {}, { category: { apple: 'medicine' } });
  assert.equal(wrong.apple['icon-distinct'], 'fail', "'medicine' is not a narrowing of 'food'");
  const coded = await icons({ can: box([200, 60, 40]), apple: disc([60, 170, 60]), tin: ring([220, 180, 90]) }, {}, { category: { apple: 1, can: 1, tin: 2 } });
  assert.equal(coded.apple['icon-distinct'], 'pass', 'category 1 is the food code (src/data/db.js CAT.FOOD)');
  assert.equal(coded.can['icon-distinct'], 'pass');
  assert.equal(coded.tin['icon-distinct'], 'fail', 'category 2 (medicine) on a food item');
  const cvd = await icons({ orange: box([170, 100, 70]), olive: box([120, 130, 60]) });
  assert.equal(cvd.orange['icon-distinct'], 'fail', 'ΔE2000 31 apart, 1.4 under deuteranopia');
  const rb = await icons({ red: box([200, 60, 40]), blue: box([40, 70, 200]) });
  assert.equal(rb.red['icon-distinct'], 'pass', 'red and blue stay apart under both deficiencies');
  assert.ok(Math.abs(deltaE([50, 2.6772, -79.7751], [50, 0, -82.7485]) - 2.0425) < 1e-4, 'CIEDE2000 on Sharma et al. pair 1');
});

test('perceptual hash: identical pictures 0 bits apart, different shapes far apart', () => {
  const s = 64;
  const a = rgba(s, s, (x, y) => disc([90, 90, 90])(x, y, s));
  const b = rgba(s, s, (x, y) => box([90, 90, 90])(x, y, s));
  assert.equal(hammingDistance(perceptualHash(a, s, s), perceptualHash(a, s, s)), 0);
  assert.ok(hammingDistance(perceptualHash(a, s, s), perceptualHash(b, s, s)) >= 11);
});

// ------------------------------------------------------------------------------------------ lightmaps

/** Two quads sharing the edge x = 1 in 3D, packed as two UV1 islands with a gap between them. */
function twoIslands() {
  const positions = [0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 2, 0, 0, 2, 0, 1, 1, 0, 1];
  const uv0 = [0, 0, 1, 0, 1, 1, 0, 1, 1, 0, 2, 0, 2, 1, 1, 1];
  const uv1 = [0.1, 0.1, 0.4, 0.1, 0.4, 0.9, 0.1, 0.9, 0.6, 0.1, 0.9, 0.1, 0.9, 0.9, 0.6, 0.9];
  const normals = Array.from({ length: 8 }, () => [0, 1, 0]).flat();
  return { material: 'floor', positions, indices: [0, 3, 1, 1, 3, 2, 4, 7, 5, 5, 7, 6], uvs: [uv0, uv1], normals };
}

/** @param {(x: number, y: number) => number[]} px  the 64 × 64 lightmap @param {'png' | 'ktx2'} [ext] */
async function lightmap(px, ext = 'png') {
  const file = `assets/homes/test/day.${ext}`;
  const r = tempRoot({ 'assets/homes/test/shell.glb': await glb([twoIslands()]), [file]: ext === 'png' ? png(64, 64, px) : encodeRawKtx2({ width: 64, height: 64, rgba: rgba(64, 64, px) }) });
  try {
    const shell = { id: 'homes/test-shell', kind: 'model', path: 'assets/homes/test/shell.glb', license: 'LicenseRef-Original' };
    const lm = { id: 'homes/test-lightmap', kind: 'lightmap', path: 'assets/homes/test/', license: 'LicenseRef-Original', files: { day: file }, params: { model: 'homes/test-shell', uv: 1 } };
    const ctx = await createContext(r.root, [{ manifest: /** @type {any} */ ({ schema: SCHEMA, assets: [shell, lm] }) }]);
    return byCheck(await checkLightmap(/** @type {any} */ (lm), ctx));
  } finally {
    r.done();
  }
}

test('lightmap checks: continuous light across a UV seam with dilated padding passes; a step or bare padding fails', async () => {
  const even = await lightmap(() => [150, 150, 150]);
  assert.deepEqual([even['lightmap-seams'], even['lightmap-padding']], ['pass', 'pass']);
  const step = await lightmap((x) => (x < 32 ? [150, 150, 150] : [80, 80, 80]));
  assert.equal(step['lightmap-seams'], 'fail', 'the two islands of one floor differ by 60 %');
  const bare = await lightmap((x, y) => {
    const u = (x + 0.5) / 64;
    const v = (y + 0.5) / 64;
    const inside = v >= 0.1 && v <= 0.9 && ((u >= 0.1 && u <= 0.4) || (u >= 0.6 && u <= 0.9));
    return inside ? [150, 150, 150] : [0, 0, 0];
  });
  assert.equal(bare['lightmap-seams'], 'pass');
  assert.equal(bare['lightmap-padding'], 'fail', 'no dilation around the islands');
  assert.equal((await lightmap((x) => (x < 32 ? [150, 150, 150] : [140, 140, 140])))['lightmap-seams'], 'fail', 'a 7 % step (p95 limit 5 %)');
  assert.equal((await lightmap((x) => (x < 32 ? [150, 150, 150] : [146, 146, 146])))['lightmap-seams'], 'pass', 'a 3 % step');
  assert.equal((await lightmap((x, y) => (x >= 32 && y >= 29 && y <= 30 ? [100, 100, 100] : [150, 150, 150])))['lightmap-seams'], 'fail', 'two texels along the seam 40 % apart: p95 fine, the largest step over 10 %');
  const pad3 = (/** @type {number} */ x, /** @type {number} */ y) => {
    const u = (x + 0.5) / 64;
    const v = (y + 0.5) / 64;
    const d = 3 / 64;
    const near = v >= 0.1 - d && v <= 0.9 + d && ((u >= 0.1 - d && u <= 0.4 + d) || (u >= 0.6 - d && u <= 0.9 + d));
    return near ? [150, 150, 150] : [0, 0, 0];
  };
  assert.equal((await lightmap(pad3))['lightmap-padding'], 'pass', '3 texels of padding in a PNG (needs 2)');
  assert.equal((await lightmap(pad3, 'ktx2'))['lightmap-padding'], 'fail', '3 texels of padding in a KTX2 (needs 4, one block)');
});

test('uncompressed KTX2 (8-bit and float) decodes to the same texels', async () => {
  const data = rgba(4, 2, (x, y) => [x * 60, y * 100, 7, 255]);
  const t8 = await decodeImage(encodeRawKtx2({ width: 4, height: 2, rgba: data }));
  assert.deepEqual([t8.width, t8.height, t8.float], [4, 2, false]);
  assert.deepEqual(Array.from(t8.rgba), Array.from(data));
  const f = Float32Array.from(data, (v) => v / 255);
  const tf = await decodeImage(encodeRawKtx2({ width: 4, height: 2, rgba: f, float: true }));
  assert.equal(tf.float, true);
  assert.ok(Array.from(tf.rgba).every((v, i) => Math.abs(v - f[i]) < 1e-6));
});

// ------------------------------------------------------------------------------------------ the CLI

/** Every art family with entries that meet the standard, holding the P0 content. */
async function goodCheckout() {
  const n = 256;
  const base = (/** @type {number} */ x, /** @type {number} */ y) => [150 + 16 * noise(x, y) - 8, 138 + 16 * noise(x, y, 2) - 8, 120 + 16 * noise(x, y, 3) - 8];
  const tex = CHAR_TEX();
  const sets = ['day', 'dusk', 'night', 'overcast', 'lamps'];
  const files = {
    'assets/materials/good/baseColor.png': png(n, n, base),
    'assets/materials/good/normal.png': png(n, n, () => [128, 128, 255]),
    'assets/materials/good/orm.png': png(n, n, (x, y) => [240, 0.9 * 255 + 10 * noise(x, y, 4) - 5, 0]),
    'assets/models/box/box.glb': await glb([grid({ n: 4, size: 1 })]),
    'assets/models/box/normal.png': png(256, 256, () => [128, 128, 255]),
    'assets/characters/wage/wage.glb': await glb([grid({ n: 4, size: 1 })], { skin: { influences: 4 }, clips: ['idle', 'walk', 'run'], textures: tex }),
    'assets/characters/wage/normal.png': png(512, 512, () => [128, 128, 255]),
    'assets/homes/apartment/shell.glb': await glb([twoIslands()]),
    ...Object.fromEntries(sets.map((k) => [`assets/homes/apartment/${k}.png`, png(64, 64, () => [150, 150, 150])])),
    ...iconFiles('can', box([200, 60, 40])),
    ...iconFiles('apple', disc([60, 170, 60])),
  };
  const lib = { id: 'materials/good', kind: 'material', path: 'assets/materials/good/', license: 'LicenseRef-Original', files: { baseColor: 'assets/materials/good/baseColor.png', normal: 'assets/materials/good/normal.png', orm: 'assets/materials/good/orm.png' }, params: { family: 'fabric', tier: 'regular', sizeM: [1, 1] } };
  const icon = (/** @type {string} */ name) => ({ id: `icons/${name}`, kind: 'icon', path: 'assets/icons/', license: 'LicenseRef-Original', files: Object.fromEntries([64, 128, 256].map((s) => [String(s), `assets/icons/${name}_${s}.png`])) });
  const manifests = {
    'assets/materials/library.json': { schema: SCHEMA, library: { schema: 'survival-logs/material-library@1' }, assets: [lib] },
    'assets/models/manifest.json': { schema: SCHEMA, assets: [{ id: 'models/box', kind: 'model', path: 'assets/models/box/box.glb', license: 'LicenseRef-Original', files: { normal: 'assets/models/box/normal.png' }, materials: { body: { material: 'materials/good' } }, params: { class: 'prop', tier: 'regular', bake: { uv: 1 } }, meta: { triangles: 32 } }] },
    'assets/characters/manifest.json': { schema: SCHEMA, assets: [{ id: 'characters/wage', kind: 'character', path: 'assets/characters/wage/wage.glb', license: 'LicenseRef-Original', files: { normal: 'assets/characters/wage/normal.png' }, params: { tier: 'hero', bake: { uv: 1 } } }] },
    'assets/homes/apartment/manifest.json': {
      schema: SCHEMA,
      assets: [
        { id: 'homes/apartment-1f', kind: 'model', path: 'assets/homes/apartment/shell.glb', license: 'LicenseRef-Original', materials: { floor: { material: 'materials/good' } }, params: { class: 'shell', tier: 'regular', home: 'apartment', floor: '1F' } },
        { id: 'homes/apartment-1f-lightmaps', kind: 'lightmap', path: 'assets/homes/apartment/', license: 'LicenseRef-Original', files: Object.fromEntries(sets.map((k) => [k, `assets/homes/apartment/${k}.png`])), params: { model: 'homes/apartment-1f' } },
      ],
    },
    'assets/icons/manifest.json': { schema: SCHEMA, assets: [icon('can'), icon('apple')], bindings: { 1: { asset: 'icons/can' }, 2: { asset: 'icons/apple' } } },
  };
  return tempRoot({ ...files, ...manifests });
}

/** @param {string} root @param {string[]} [extra] */
async function cli(root, extra = ['--phase', 'P0']) {
  const r = await run(process.execPath, ['tools/art-metrics.mjs', '--json', '--root', root, ...extra], { cwd: new URL('..', import.meta.url).pathname }).catch((e) => e);
  return { code: r.code ?? 0, json: JSON.parse(String(r.stdout).trim().split('\n').at(-1) || 'null') };
}

test('art-metrics CLI: a checkout whose every family meets the standard passes; a missing family fails the check', async () => {
  const r = await goodCheckout();
  try {
    const good = await cli(r.root);
    assert.equal(good.code, 0, JSON.stringify(good.json.problems));
    assert.equal(good.json.ok, true);
    assert.deepEqual(good.json.missing, []);
    assert.match(good.json.summary, /every check passes/);
    r.put('assets/icons/manifest.json', { schema: SCHEMA, assets: [] });
    const noIcons = await cli(r.root);
    assert.equal(noIcons.code, 1, 'an icon manifest with no entries passes nothing');
    assert.ok(noIcons.json.problems.includes('icons: its manifest has no judged entries (audio, LUTs and probes do not count) (WP-P0-12 writes assets/icons/manifest.json)'), JSON.stringify(noIcons.json.problems));
    r.put('assets/icons/manifest.json', '');
    const broken = await cli(r.root);
    assert.equal(broken.code, 1);
    assert.ok(broken.json.problems.some((/** @type {string} */ p) => p.includes('not JSON')));
  } finally {
    r.done();
  }
  const empty = tempRoot({});
  try {
    const none = await cli(empty.root);
    assert.equal(none.code, 1);
    assert.equal(none.json.ok, false);
    assert.equal(none.json.missing.length, 4, 'all four art families reported missing (materials, characters, models, icons)');
    assert.ok(none.json.problems.includes('no asset manifest under assets/'));
    assert.equal((await cli(empty.root, ['--phase', 'P1x'])).code, 2, 'a bad --phase is a usage error');
  } finally {
    empty.done();
  }
});

test('art-metrics CLI: the content a phase needs, and families of only unjudged kinds', async () => {
  const r = await goodCheckout();
  try {
    const viaGate = await run(process.execPath, ['tools/art-metrics.mjs', '--json', '--root', r.root], { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, GATE_PHASE: 'P1' } }).catch((e) => e);
    assert.match(JSON.parse(String(viaGate.stdout).trim().split('\n').at(-1) || 'null').summary, /^P1:/, 'GATE_PHASE (gate --signoff P1) sets the content phase');
    const p1 = await cli(r.root, ['--phase', 'P1']);
    assert.equal(p1.code, 1, 'P1 needs every survivor');
    for (const want of ['characters/student: content', 'characters/warehouse: content']) assert.ok(p1.json.problems.some((/** @type {string} */ p) => p.startsWith(want)), `${want}: ${JSON.stringify(p1.json.problems)}`);
    // the shells are procedural and lit in real time (ART.md §4.4, decided 2026-09-24): no phase needs a shell model
    assert.ok(!p1.json.problems.some((/** @type {string} */ p) => p.startsWith('homes/')), JSON.stringify(p1.json.problems));
    r.put('assets/characters/manifest.json', { schema: SCHEMA, assets: [{ id: 'characters/wage-voice', kind: 'audio', path: 'assets/characters/wage.ogg', license: 'LicenseRef-Original' }] });
    const audioOnly = await cli(r.root);
    assert.ok(audioOnly.json.problems.some((/** @type {string} */ p) => p.startsWith('characters: its manifest has no judged entries')), 'audio alone does not make the family present');
    assert.ok(audioOnly.json.problems.some((/** @type {string} */ p) => p.startsWith('characters/wage: content')), 'and the survivor has no character');
  } finally {
    r.done();
  }
});

test('content and required checks, directly', async () => {
  const ctx = await createContext('/nonexistent', []);
  const f = await contentFindings('P0', [], ctx);
  assert.deepEqual(f.map((x) => `${x.entry}:${x.state}`), ['characters/wage:fail', 'icons:fail'], 'P0 needs the survivor and bound icons; no shell (procedural)');
  const req = requiredFindings([/** @type {any} */ ({ id: 'materials/x', kind: 'material' })], [{ check: 'albedo-range', entry: 'materials/x', state: 'skip', detail: 'no reason' }]);
  assert.ok(req.some((x) => x.check === 'albedo-range' && x.state === 'fail'), 'a skip without an exemption fails');
  assert.ok(req.some((x) => x.check === 'metalness' && x.state === 'fail'), 'a required check that never ran fails');
  const ok = requiredFindings([/** @type {any} */ ({ id: 'materials/g', kind: 'material' })], [{ check: 'albedo-range', entry: 'materials/g', state: 'skip', detail: 'glass', exempt: true }]);
  assert.ok(!ok.some((x) => x.check === 'albedo-range'), 'an exempt skip stands');
});
