// @ts-check
// WP-P1-models: the Poly Haven furniture and prop models under assets/models/ (1k glTF, CC0) conform to the asset
// contract, match their digests and their locked sources, carry the placement params the 3D renderer reads
// (family, boundsM, frontYawDeg) and the budgets the art metrics judge them by (class, tier), ship every texture as
// KTX2 with the locked JPEG as its fallback, are credited, and rebuild byte for byte (tools/models/fetch.mjs --verify).
//
// Every check runs every time: a missing file fails the test (docs/wp/README.md, no conditional passes).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSET_MANIFEST_SCHEMA, assetOutputs, checkAssetManifest, rebuildOf } from '../src/contracts/assets.js';
import { frontAxis, ktx2Header, levelsFor } from '../tools/models/fetch.mjs';
import { TEXEL_DENSITY, TRIANGLES } from '../tools/art-metrics/standard.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WP = 'WP-P1-models';
const MANIFEST = 'assets/models/manifest.json';
const LIST = 'tools/models/models.json';
const LFS_POINTER = 'version https://git-lfs.github.com/spec/v1';
/** The families the 3D renderer maps models to (WP-P1-models). */
const FAMILIES = ['sofa', 'armchair', 'rack', 'bookshelf', 'cabinet', 'table', 'coffeetable', 'desk', 'chair', 'bed', 'tv', 'stove', 'generator', 'crate',
  'barrel', 'bucket', 'plant', 'workbench', 'appliance', 'lamp', 'wall', 'heater', 'exterior', 'misc'];

/** @param {string} rel */
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
/** @param {string} rel */
const sha = (rel) => createHash('sha256').update(readFileSync(join(ROOT, rel))).digest('hex');
const manifest = readJson(MANIFEST);
const list = readJson(LIST);
/** @type {any[]} */
const entries = manifest.assets;
const ledger = readJson('assets/sources.lock.json');
/** @type {Map<string, any>} */
const locked = new Map(ledger.sources.filter((/** @type {any} */ s) => s.wp === WP).map((/** @type {any} */ s) => [s.id, s]));
const allCredits = readFileSync(join(ROOT, 'assets/CREDITS.md'), 'utf8');
const creditsAt = allCredits.indexOf(`\n## ${WP}\n`);
const creditsEnd = allCredits.indexOf('\n## ', creditsAt + 1);
const credits = creditsAt < 0 ? '' : allCredits.slice(creditsAt, creditsEnd < 0 ? undefined : creditsEnd);

test('the models manifest conforms to the asset contract, with every path on disk', () => {
  assert.equal(manifest.schema, ASSET_MANIFEST_SCHEMA);
  assert.equal(manifest.wp, WP);
  assert.deepEqual(checkAssetManifest(manifest, { exists: (p) => existsSync(join(ROOT, p)) }), []);
});

test('one entry per pinned model, in list order: id models/<lowercase Poly Haven id>, kind model, CC0, a rebuild recipe', () => {
  assert.equal(list.models.length, 97, 'the pinned list of WP-P1-models');
  assert.deepEqual(
    entries.map((e) => e.id),
    list.models.map((/** @type {any} */ m) => `models/${m.id.toLowerCase()}`)
  );
  for (const e of entries) {
    assert.equal(e.kind, 'model', e.id);
    assert.equal(e.license, 'CC0-1.0', e.id);
    assert.match(e.path, new RegExp(`^assets/models/${e.id.split('/')[1]}/[^/]+_1k\\.gltf$`), e.id);
    const r = rebuildOf(manifest, e);
    assert.ok(r, `${e.id} names a rebuild recipe`);
    assert.equal(r.recipe.entry, 'tools/models/fetch.mjs');
    assert.deepEqual(r.args, ['--only', e.id.split('/')[1]]);
    assert.ok(r.recipe.shared?.includes('assets/cache/'), 'the recipe restores sources into the shared download cache');
  }
});

test('every shipped file exists, is not an LFS pointer and matches its digest; digests cover exactly the outputs', () => {
  let files = 0;
  for (const e of entries) {
    const outputs = assetOutputs(e).sort();
    assert.deepEqual(Object.keys(e.digests).sort(), outputs, `${e.id}: a digest per shipped file`);
    for (const p of outputs) {
      assert.ok(existsSync(join(ROOT, p)), `${p} exists`);
      assert.notEqual(readFileSync(join(ROOT, p)).subarray(0, LFS_POINTER.length).toString('latin1'), LFS_POINTER, `${p} is an LFS pointer: run git lfs pull`);
      assert.equal(sha(p), e.digests[p], `${p} matches its digest`);
      files++;
    }
  }
  assert.ok(files >= entries.length * 4, `${files} files`);
});

test('each .gltf references exactly the entry files (the .bin and the textures), by relative path', () => {
  for (const e of entries) {
    const gltf = readJson(e.path);
    const dir = e.path.slice(0, e.path.lastIndexOf('/') + 1);
    const refs = [...(gltf.buffers || []), ...(gltf.images || [])].map((/** @type {any} */ x) => `${dir}${decodeURI(x.uri)}`).sort();
    assert.deepEqual([...new Set(refs)], Object.values(e.files).sort(), `${e.id}: referenced files`);
    assert.equal(gltf.asset?.version, '2.0', `${e.id}: glTF 2.0`);
    assert.ok(!(gltf.extensionsRequired || []).length, `${e.id}: no required extensions`);
    assert.ok(!(gltf.extensionsUsed || []).includes('KHR_texture_transform'), `${e.id}: no texture transforms`);
  }
});

test('every entry has the renderer params: title, family, mount, boundsM in metres, triangles, frontYawDeg and frontAxis', () => {
  const seen = new Set();
  for (const e of entries) {
    const p = e.params;
    const spec = list.models.find((/** @type {any} */ m) => `models/${m.id.toLowerCase()}` === e.id);
    assert.equal(typeof p.title, 'string', `${e.id}: title`);
    assert.ok(FAMILIES.includes(p.family), `${e.id}: family '${p.family}'`);
    assert.equal(p.family, spec.family, `${e.id}: the family of the pinned list`);
    assert.ok(typeof manifest.families[p.family] === 'string', `${e.id}: the manifest describes family ${p.family}`);
    seen.add(p.family);
    assert.ok(['floor', 'surface', 'wall', 'ceiling'].includes(p.mount), `${e.id}: mount '${p.mount}'`);
    const { min, max } = p.boundsM;
    assert.ok(Array.isArray(min) && Array.isArray(max) && min.length === 3 && max.length === 3, `${e.id}: boundsM {min, max}`);
    for (let i = 0; i < 3; i++) {
      assert.ok(Number.isFinite(min[i]) && Number.isFinite(max[i]) && max[i] > min[i], `${e.id}: boundsM axis ${i}`);
    }
    const extent = Math.max(...max.map((/** @type {number} */ v, /** @type {number} */ i) => v - min[i]));
    assert.ok(extent > 0.05 && extent < 3, `${e.id}: the largest extent ${extent} m is a furniture or prop size (a scale slip shows here)`);
    assert.ok(Number.isInteger(p.triangles) && p.triangles > 0 && p.triangles === e.meta.triangles, `${e.id}: triangles`);
    assert.ok(Number.isFinite(p.frontYawDeg) && p.frontYawDeg % 90 === 0 && p.frontYawDeg > -180 && p.frontYawDeg <= 180, `${e.id}: frontYawDeg`);
    assert.equal(p.frontYawDeg, spec.frontYawDeg, `${e.id}: the yaw of the pinned list`);
    assert.equal(p.frontAxis, frontAxis(p.frontYawDeg), `${e.id}: frontAxis`);
    assert.equal(p.front, undefined, `${e.id}: params.front is the contract's '+z' slot field; these models give frontYawDeg`);
    assert.equal(p.scale ?? 1, spec.scale ?? 1, `${e.id}: scale`);
  }
  assert.deepEqual([...seen].sort(), [...FAMILIES].sort(), 'every family has a model');
});

test('every texture has a KTX2 (Basis Universal) as its KHR_texture_basisu source, its JPEG as the fallback', () => {
  for (const e of entries) {
    const gltf = readJson(e.path);
    const dir = e.path.slice(0, e.path.lastIndexOf('/') + 1);
    assert.ok((gltf.extensionsUsed || []).includes('KHR_texture_basisu'), `${e.id}: KHR_texture_basisu is used`);
    for (const t of gltf.textures || []) {
      const fallback = gltf.images[t.source];
      const k = t.extensions?.KHR_texture_basisu?.source;
      assert.ok(Number.isInteger(k), `${e.id}: texture of ${fallback.uri} has a KHR_texture_basisu source`);
      const ktx = gltf.images[k];
      assert.equal(ktx.mimeType, 'image/ktx2', `${e.id}: ${ktx.uri} is image/ktx2`);
      assert.match(fallback.uri, /\.jpe?g$/i, `${e.id}: the fallback ${fallback.uri} is the locked JPEG`);
      const info = e.meta.textures[`${dir}${decodeURI(ktx.uri)}`];
      assert.ok(info, `${e.id}: meta.textures describes ${ktx.uri}`);
      assert.equal(info.source, `${dir}${decodeURI(fallback.uri)}`, `${e.id}: ${ktx.uri} is encoded from its fallback`);
    }
    for (const [p, info] of Object.entries(e.meta.textures)) {
      const h = ktx2Header(readFileSync(join(ROOT, p)));
      const [w, hh] = info.size;
      assert.deepEqual([h.width, h.height, h.levels], [w, hh, info.levels], `${p}: size and levels`);
      // every level whose sides are whole 4 × 4 blocks, unless a normal chain stops early (a recorded correction)
      assert.equal(info.levels, info.encode.correction?.levelsKept ?? levelsFor(w, hh), `${p}: levels`);
      assert.ok(Math.max(w, hh) <= 1024 && w % 4 === 0 && hh % 4 === 0, `${p}: at most the 1k source, whole 4 × 4 blocks`);
      // UASTC + zstd for normals; ETC1S (BasisLZ) for color and data, UASTC + zstd where ETC1S cannot hold the limits
      // (the material library's codecs)
      if (info.role === 'normal') assert.equal(info.encode.codec, 'uastc', `${p}: normals are UASTC`);
      else if (info.encode.codec === 'uastc') assert.ok(info.encode.correction?.encoderArgs?.includes('uastc'), `${p}: UASTC only as a recorded correction`);
      else assert.equal(info.encode.codec, 'etc1s', `${p}: ${info.role} codec`);
      assert.equal(h.supercompression, info.encode.codec === 'uastc' ? 2 : 1, `${p}: supercompression of ${info.encode.codec}`);
      assert.equal(info.encode.transfer, info.role === 'baseColor' || info.role === 'color' ? 'srgb' : 'linear', `${p}: transfer`);
    }
  }
});

test('every entry names its triangle class and texel-density tier; the models the renderer skips say so', () => {
  const rt = list.runtime;
  for (const e of entries) {
    const p = e.params;
    assert.ok(p.class in TRIANGLES, `${e.id}: params.class '${p.class}' is a budget of tools/art-metrics`);
    assert.ok(['furniture', 'prop'].includes(p.class), `${e.id}: furniture or prop`);
    assert.ok(p.tier in TEXEL_DENSITY.classes, `${e.id}: params.tier '${p.tier}' is a texel-density class`);
    assert.equal(p.class === 'prop', list.classes.prop.includes(p.family) && Math.max(...p.boundsM.max.map((/** @type {number} */ v, /** @type {number} */ i) => v - p.boundsM.min[i])) <= list.classes.propMaxM, `${e.id}: class by family and size`);
    const skipped = p.triangles > rt.maxTriangles && !rt.exceptFamilies.includes(p.family);
    assert.equal(typeof p.skip === 'string', skipped, `${e.id}: params.skip exactly when over ${rt.maxTriangles} triangles`);
  }
});

test('frontAxis names the axis that frontYawDeg turns to +Z', () => {
  for (const [yaw, axis] of /** @type {[number, [number, number]][]} */ ([
    [0, [0, 1]],
    [90, [-1, 0]],
    [180, [0, -1]],
    [-90, [1, 0]],
  ])) {
    // three.js rotation.y by θ maps (x, z) to (x cos θ + z sin θ, −x sin θ + z cos θ)
    const t = (yaw * Math.PI) / 180;
    const z = -axis[0] * Math.sin(t) + axis[1] * Math.cos(t);
    assert.ok(Math.abs(z - 1) < 1e-9, `yaw ${yaw} turns ${axis} to +Z`);
    assert.equal(frontAxis(yaw), `${axis[0] ? (axis[0] > 0 ? '+' : '-') + 'x' : (axis[1] > 0 ? '+' : '-') + 'z'}`);
  }
});

test(`the ledger locks one ${WP} Poly Haven source per model, with the shipped files at their SHA-256`, () => {
  assert.equal(locked.size, entries.length);
  for (const e of entries) {
    assert.equal(e.sources.length, 1, e.id);
    const s = locked.get(e.sources[0]);
    assert.ok(s, `${e.sources[0]} is in assets/sources.lock.json under ${WP}`);
    assert.match(s.id, /^polyhaven\/[A-Za-z0-9_]+@1k$/);
    assert.equal(s.provider, 'Poly Haven');
    assert.equal(s.license, 'CC0-1.0');
    assert.equal(s.licenseUrl, 'https://polyhaven.com/license');
    assert.equal(s.kind, 'model');
    assert.equal(s.page, `https://polyhaven.com/a/${s.id.slice('polyhaven/'.length, -'@1k'.length)}`);
    assert.ok(s.authors.length && s.authors.every((/** @type {unknown} */ a) => typeof a === 'string' && a), `${s.id}: authors`);
    assert.match(s.retrieved, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(s.usedFor.includes(`${e.id} (${e.params.family})`), `${s.id}: usedFor`);
    const dir = e.path.slice(0, e.path.lastIndexOf('/') + 1);
    // every locked file is shipped; the only other outputs are the KTX2 the build encodes from the locked JPEGs
    const lockedFiles = s.files.map((/** @type {any} */ f) => `${dir}${f.path}`);
    const built = Object.keys(e.meta.textures).sort();
    assert.deepEqual([...lockedFiles, ...built].sort(), assetOutputs(e).sort(), `${s.id}: the shipped files are the locked files and their KTX2`);
    assert.equal(lockedFiles[0], e.path, `${s.id}: the locked .gltf is the entry's path`);
    assert.deepEqual(built.map((p) => e.meta.textures[p].source).sort(), lockedFiles.filter((/** @type {string} */ p) => /\.(jpe?g|png)$/i.test(p)).sort(), `${s.id}: one KTX2 per locked image`);
    for (const f of s.files) {
      assert.match(f.url, /^https:\/\/dl\.polyhaven\.org\/file\/ph-assets\/Models\//, f.url);
      assert.match(f.md5, /^[0-9a-f]{32}$/);
      // the .gltf is rewritten to name the KTX2 (tools/models/fetch.mjs --verify checks it is what a rebuild writes)
      if (`${dir}${f.path}` === e.path) continue;
      assert.equal(e.digests[`${dir}${f.path}`], f.sha256, `${dir}${f.path}: shipped unchanged from the locked download`);
      assert.equal(readFileSync(join(ROOT, dir, f.path)).length, f.bytes, `${dir}${f.path}: bytes`);
    }
  }
});

test(`assets/CREDITS.md has a ## ${WP} section crediting every model with its authors and downloads`, () => {
  assert.ok(credits, `assets/CREDITS.md has a ## ${WP} section`);
  for (const s of locked.values()) {
    assert.ok(credits.includes(`(\`${s.id}\`)`), `the section credits ${s.id}`);
    for (const a of s.authors) assert.ok(credits.includes(a), `the section names ${a}`);
    for (const f of s.files) assert.ok(credits.includes(f.sha256), `the section lists the SHA-256 of ${f.url}`);
  }
});

test('tools/models/fetch.mjs --verify: the shipped files and the manifest are what a rebuild writes', () => {
  const out = execFileSync(process.execPath, ['tools/models/fetch.mjs', '--verify'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /97\/97 model\(s\) verified/);
});
