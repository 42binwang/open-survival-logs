// @ts-check
// Material library (WP-P0-05): every material in assets/materials/library.json is decoded from its shipped KTX2
// files and checked for PBR validity (value bands, roughness not saturated, metalness class, unit normals),
// seamless tiling, sizes and texel density. Bands and thresholds come from tools/materials/{bands,targets}.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { checkAssetManifest } from '../src/contracts/assets.js';
import { execFileSync } from 'node:child_process';
import {
  ROOT,
  baseColorStats,
  decodeLevel0,
  familyLimits,
  hexToLinear,
  linearLuminance,
  loadConfig,
  normalStats,
  ormStats,
  parseKtx2,
  percentiles,
  presetUseProblem,
  readJson,
  repetition,
  seamChannels,
  seamMetric,
  seamOk,
  seedOffset,
  periodRecurrence,
  selfCopy,
} from '../tools/materials/checks.mjs';

const { library, targets, bands } = loadConfig();
const checks = targets.checks;
// WP-P0-05's part of the merged ledgers: its entries in assets/sources.lock.json and its section of assets/CREDITS.md.
const WP = 'WP-P0-05';
const ledger = readJson('assets/sources.lock.json');
const lock = { sources: ledger.sources.filter((/** @type {any} */ s) => s.wp === WP) };
const allCredits = readFileSync(join(ROOT, 'assets/CREDITS.md'), 'utf8');
const creditsAt = allCredits.indexOf(`\n## ${WP}\n`);
const creditsEnd = allCredits.indexOf('\n## ', creditsAt + 1);
const credits = creditsAt < 0 ? '' : allCredits.slice(creditsAt, creditsEnd < 0 ? undefined : creditsEnd);
/** Every source WP-P0-05 locked: the material scans, the preview HDRI and the two KTX-Software downloads. */
const LOCKED_IDS = [
  'ambientcg/Metal009@2K-PNG',
  'ambientcg/PaintedPlaster017@2K-PNG',
  'ambientcg/Paper005@2K-PNG',
  'ambientcg/Rubber004@2K-PNG',
  'ambientcg/SurfaceImperfections013@2K-PNG',
  'ambientcg/Wallpaper001A@2K-PNG',
  'polyhaven/concrete_floor_02@2k',
  'polyhaven/green_metal_rust@2k',
  'polyhaven/hessian_380@2k',
  'polyhaven/leather_white@2k',
  'polyhaven/oak_veneer_05@2k',
  'polyhaven/oak_wood_planks@2k',
  'polyhaven/poly_wool_herringbone@2k',
  'polyhaven/scuffed_cement@2k',
  'polyhaven/stained_pine@2k',
  'polyhaven/studio_small_09@2k',
  'polyhaven/tiled_floor_001@2k',
  'tools/ktx-software-libktx_read@4.4.2',
  'tools/ktx-software@4.4.2-darwin-arm64',
];
// WP-P0-05b's new sources: its ledger entries and its assets/CREDITS.md section, like WP-P0-05's above.
const WP_B = 'WP-P0-05b';
const lockB = { sources: ledger.sources.filter((/** @type {any} */ s) => s.wp === WP_B) };
const creditsBAt = allCredits.indexOf(`\n## ${WP_B}\n`);
const creditsBEnd = allCredits.indexOf('\n## ', creditsBAt + 1);
const creditsB = creditsBAt < 0 ? '' : allCredits.slice(creditsBAt, creditsBEnd < 0 ? undefined : creditsBEnd);
/** The sources WP-P0-05b locked: the scans of the five materials the furniture lane lacked. */
const LOCKED_IDS_B = ['ambientcg/Paper001@2K-PNG', 'ambientcg/Plastic001@2K-PNG', 'ambientcg/Wicker013@2K-PNG', 'polyhaven/bark_brown_01@2k', 'polyhaven/brown_mud@2k'];
// WP-P0-05c's source (the cardboard scan): its ledger entries and its assets/CREDITS.md section, like WP-P0-05b's.
const WP_C = 'WP-P0-05c';
const lockC = { sources: ledger.sources.filter((/** @type {any} */ s) => s.wp === WP_C) };
const creditsCAt = allCredits.indexOf(`\n## ${WP_C}\n`);
const creditsCEnd = allCredits.indexOf('\n## ', creditsCAt + 1);
const creditsC = creditsCAt < 0 ? '' : allCredits.slice(creditsCAt, creditsCEnd < 0 ? undefined : creditsCEnd);
/** The source WP-P0-05c locked: a kraft paper scan with real color variation (Paper005's color map is flat). */
const LOCKED_IDS_C = ['ambientcg/Paper004@2K-PNG'];
const allLocked = [...lock.sources, ...lockB.sources, ...lockC.sources];
const materials = library.assets.filter((/** @type {any} */ a) => a.kind === 'material');
const variation = library.assets.find((/** @type {any} */ a) => a.id === 'materials/variation');
const graph = readJson('tools/materials/graph.json');
const graphIds = graph.materials.map((/** @type {any} */ m) => m.id);
/** @param {string} id */
const graphTileM = (id) => graph.materials.find((/** @type {any} */ g) => g.id === id).tiling.tileM ?? targets.tileM;
// Golden value (WP-P0-05c): only ceramic tile repeats by design; it declares params.patternM for its tile module and
// needs at least 4 periods per side (WP-P0-11c's rule).
const PATTERN_IDS = { tile_ceramic: 0.25 };
/** @param {string} id */
const graphNode = (id) => graph.materials.find((/** @type {any} */ g) => g.id === id);
const MAPS = ['baseColor', 'normal', 'orm'];
/** @param {string} p */
const onDisk = (p) => existsSync(join(ROOT, p));

/** @param {string} rel */
const bytesOf = (rel) => new Uint8Array(readFileSync(join(ROOT, rel)));
/** @param {Uint8Array} b */
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
/** @param {any} m */
const shortId = (m) => m.id.split('/')[1];

/** @type {Map<string, Promise<{ baseColor: Uint8Array, normal: Uint8Array, orm: Uint8Array, size: number }>>} */
const decoded = new Map();
/** @param {any} m */
function decodeMaterial(m) {
  if (!decoded.has(m.id)) {
    decoded.set(
      m.id,
      (async () => {
        const out = /** @type {any} */ ({});
        for (const k of Object.keys(m.files)) {
          const img = await decodeLevel0(bytesOf(m.files[k]));
          out[k] = img.rgba;
          out.size = img.width;
        }
        return out;
      })(),
    );
  }
  return /** @type {Promise<any>} */ (decoded.get(m.id));
}

// Golden values (WP-P0-05b): the woodchip wallpaper is judged as plaster_paint (ART.md §7.2 'plaster walls' is the
// on-screen wall family) and the stained pine as wood_stained (ART.md §7.2 'Stained accents 0.10-0.20'); plastic,
// bark, soil, newsprint and rattan are the materials the furniture lane lacked (WP-P0-05b scope).
/** Materials with a close-up detail normal map (WP-P0-05b: fabric, leather, cardboard). */
const DETAIL_IDS = ['fabric_sofa', 'fabric_curtain', 'leather', 'cardboard'];

const REQUIRED_FAMILIES = {
  plaster_paint: 2,
  // golden value (WP-P0-05c art check): wood_floor 1 -> 2, wood_stained 1 -> none: the pine is a floor (rooms bed2,
  // store) and now sits in the ART.md §7.2 floor band 0.25-0.39 instead of the stained-accent band 0.10-0.20
  wood_floor: 2,
  tile_ceramic: 1,
  grout: 1,
  concrete: 1,
  fabric: 2,
  leather: 1,
  laminate: 1,
  metal_bare: 1,
  metal_painted: 1,
  glass: 1,
  rubber: 1,
  cardboard: 1,
  plastic: 1,
  bark: 1,
  soil: 1,
  newsprint: 1,
  rattan: 1,
};

test('library.json is an asset manifest (src/contracts/assets.js) covering the spike-room material list', async () => {
  assert.equal(library.schema, 'survival-logs/asset-manifest@1');
  assert.equal(library.library.schema, 'survival-logs/material-library@1');
  const problems = checkAssetManifest(library, { exists: onDisk });
  assert.deepEqual(problems, [], `checkAssetManifest problems:\n${problems.join('\n')}`);
  const idPattern = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)+$/;
  const ids = library.assets.map((/** @type {any} */ a) => a.id);
  assert.equal(new Set(ids).size, ids.length, 'asset ids are unique');
  for (const a of library.assets) {
    assert.match(a.id, idPattern, `${a.id} is '<family>/<name>' in lowercase`);
    assert.ok(a.id.startsWith('materials/'));
    assert.ok(['material', 'texture'].includes(a.kind));
    assert.ok(['CC0-1.0', 'LicenseRef-Original'].includes(a.license));
  }
  /** @type {Record<string, number>} */
  const count = {};
  for (const m of materials) count[m.params.family] = (count[m.params.family] ?? 0) + 1;
  for (const [family, n] of Object.entries(REQUIRED_FAMILIES)) {
    assert.ok((count[family] ?? 0) >= n, `family ${family}: ${count[family] ?? 0} material(s), need ${n}`);
  }
  for (const m of materials) {
    assert.ok(bands.families[m.params.family], `${m.id}: family ${m.params.family} has a value band`);
    assert.ok(targets.tiers[m.params.tier], `${m.id}: tier ${m.params.tier} is defined`);
    assert.equal(m.path, `assets/materials/${shortId(m)}/`);
    assert.equal(m.params.variation.texture, variation.id, 'materials point at the shared variation mask');
  }
});

test('the manifest check runs on disk: a renamed texture path is reported missing', () => {
  const broken = structuredClone(library);
  const entry = broken.assets.find((/** @type {any} */ a) => a.kind === 'material');
  assert.ok(entry, 'the manifest has a material to break');
  const renamed = entry.files.normal.replace('normal.ktx2', 'normal-renamed.ktx2');
  // renamed consistently, as build.py would write it: the digests are keyed by the file paths
  assert.ok(entry.digests?.[entry.files.normal], 'the entry has a digest for its normal map');
  entry.digests[renamed] = entry.digests[entry.files.normal];
  delete entry.digests[entry.files.normal];
  entry.files.normal = renamed;
  const problems = checkAssetManifest(broken, { exists: onDisk });
  assert.equal(problems.length, 1, `exactly one problem expected, got:\n${problems.join('\n')}`);
  assert.match(problems[0], /files\.normal: '.*normal-renamed\.ktx2' does not exist/);
});

test('library.json lists exactly the materials of tools/materials/graph.json', () => {
  // golden value 16 -> 21: WP-P0-05b adds plastic, bark, soil, newsprint and rattan
  assert.equal(graphIds.length, 21, 'graph.json defines the 21 library materials');
  assert.deepEqual(materials.map(shortId), graphIds, 'one manifest entry per graph node, in order');
  assert.ok(variation, 'the shared variation mask is in the manifest');
  assert.equal(library.assets.length, graphIds.length + 1, 'no other entries');
});

for (const m of materials) {
  const id = shortId(m);
  test(`material ${id}`, async (t) => {
    const p = m.params;
    const meta = m.meta;
    const tier = targets.tiers[p.tier];
    // golden value (WP-P0-05c): tier resolution 512 -> texelDensity x the material's tile (256 px over 1 m, 512 over 2 m)
    const tierRes = tier.texelDensity * p.sizeM[0];
    const fam = familyLimits(bands, p.family);

    await t.test('files match the manifest (hash, size) and are valid KTX2 with the right codec', () => {
      const expect = {
        baseColor: { model: 'etc1s', sc: 'basis-lz', tf: 'srgb' },
        normal: { model: 'uastc', sc: 'zstd', tf: 'linear' },
        orm: { model: 'etc1s', sc: 'basis-lz', tf: 'linear' },
      };
      if (p.detail) Object.assign(expect, { detailNormal: { model: 'uastc', sc: 'zstd', tf: 'linear' } });
      assert.deepEqual(Object.keys(m.files).sort(), Object.keys(expect).sort(), `files: ${Object.keys(expect).join(', ')}`);
      for (const [k, e] of Object.entries(expect)) {
        const file = m.files[k];
        const fm = meta.maps[k];
        assert.equal(file, `assets/materials/${id}/${k}.ktx2`);
        const b = bytesOf(file);
        assert.equal(b.length, fm.bytes, `${k} byte size`);
        assert.equal(sha256(b), fm.sha256, `${k} sha256`);
        const { header, dfd, levelIndex } = parseKtx2(b);
        assert.equal(header.vkFormat, 0, `${k}: Basis Universal payload (VK_FORMAT_UNDEFINED)`);
        assert.equal(dfd.colorModel, e.model, `${k} codec`);
        assert.equal(header.supercompression, e.sc, `${k} supercompression`);
        assert.equal(dfd.transfer, e.tf, `${k} transfer function`);
        assert.equal(p.maps[k].codec, e.model);
        const size = k === 'detailNormal' ? targets.detail.resolution : tierRes;
        assert.equal(header.width, size, `${k} width = ${k === 'detailNormal' ? 'detail resolution' : `${p.tier} density x ${p.sizeM[0]} m`}`);
        assert.equal(header.height, size, `${k} height`);
        assert.equal(header.levels, Math.log2(size) + 1, `${k} has a full mip chain`);
        assert.equal(levelIndex.length, header.levels);
        for (const lv of levelIndex) assert.ok(lv.byteLength > 0 && lv.byteOffset + lv.byteLength <= b.length, `${k} level in bounds`);
        if (k === 'baseColor') assert.equal(dfd.samples === 2, p.maps.baseColor.channels === 'rgba', 'alpha plane matches the tint mask');
      }
      assert.equal(meta.sizeBytes, Object.values(meta.maps).reduce((n, /** @type {any} */ x) => n + x.bytes, 0));
    });

    await t.test('sizes and texel density', () => {
      const res = tierRes;
      assert.ok(Number.isInteger(Math.log2(res)), 'power-of-two resolution');
      assert.equal(p.sizeM[0], p.sizeM[1], 'square tile');
      // golden value 2 m -> the material's true size, 1 m or 2 m (WP-P0-05c): the 2 m tiles of 1 m scans were 2 x 2
      // copies. ART.md §3 'Tiled materials repeat at 1 m or 2 m'.
      assert.ok([1, 2].includes(p.sizeM[0]), `ART.md §3: 1 m or 2 m tiles (got ${p.sizeM[0]} m)`);
      assert.equal(p.sizeM[0], graphTileM(id), 'the tile size tools/materials/graph.json declares');
      assert.equal(meta.texelDensity, tier.texelDensity, `${p.tier} density ${tier.texelDensity} px/m (ART.md §3)`);
      assert.ok(Math.abs(meta.texelDensity - res / p.sizeM[0]) < 0.5, 'texelDensity = resolution / sizeM');
      const rel = Math.abs(meta.texelDensity / tier.texelDensity - 1);
      assert.ok(rel <= targets.texelDensityTolerance, `texel density ${meta.texelDensity} px/m within ±${targets.texelDensityTolerance * 100}% of ${tier.texelDensity}`);
      assert.equal(meta.source.tiling.scale.length, 2, 'scale recorded per axis');
      assert.equal(meta.source.tiling.sourcePxPerTexel.length, 2, 'source density recorded per axis');
      for (const s of meta.source.tiling.scale) assert.ok(Math.abs(s - 1) <= targets.maxScaleChange + 1e-6, `physical scale change ${s} within ±${targets.maxScaleChange}`);
      for (const s of meta.source.tiling.sourcePxPerTexel) assert.ok(s >= 1 - 1e-6, 'no upsampling of the source');
    });

    await t.test('base color sits in its value band', async () => {
      // golden values: sRGB mean-luminance placeholders -> docs/ART.md §7.2 linear albedo medians and hard limits
      // (dielectric 0.013-0.90, metal F0 0.50-1.00); tools/materials/bands.json logs each change with its reason
      const d = await decodeMaterial(m);
      const s = baseColorStats(d.baseColor);
      const [lo, hi] = fam.albedo;
      assert.ok(s.albedoMedian >= lo && s.albedoMedian <= hi, `median albedo ${s.albedoMedian.toFixed(3)} in [${lo}, ${hi}] (${fam.source})`);
      if (!fam.transmissive) {
        assert.ok(s.albedoP005 >= fam.min, `0.5th percentile ${s.albedoP005.toFixed(4)} >= ${fam.min}`);
        assert.ok(s.albedoP995 <= fam.max, `99.5th percentile ${s.albedoP995.toFixed(4)} <= ${fam.max}`);
        // new (WP-P0-05c re-check): not one decoded texel outside the hard limits (a ceramic texel reached 0.939)
        const l = linearLuminance(d.baseColor, [1, 1, 1], false);
        let lo2 = Infinity;
        let hi2 = -Infinity;
        for (const v of l) [lo2, hi2] = [Math.min(lo2, v), Math.max(hi2, v)];
        assert.ok(lo2 >= fam.min && hi2 <= fam.max, `decoded texels ${lo2.toFixed(4)}-${hi2.toFixed(4)} inside ${fam.min}-${fam.max}`);
      }
      assert.ok(Math.abs(s.albedoMedian - meta.stats.baseColor.albedoMedian) < 0.005, 'manifest stats match the shipped file');
    });

    await t.test('roughness is in range and not saturated; metalness matches the family', async () => {
      const d = await decodeMaterial(m);
      const o = ormStats(d.orm, checks.roughnessSaturation);
      const [rlo, rhi] = fam.roughness;
      assert.ok(o.roughnessSaturated <= checks.roughnessSaturation.maxFraction, `saturated roughness on ${(o.roughnessSaturated * 100).toFixed(2)}% of texels`);
      assert.ok(o.roughnessMean >= rlo - 0.03 && o.roughnessMean <= rhi + 0.03, `roughness mean ${o.roughnessMean.toFixed(3)} in [${rlo}, ${rhi}]`);
      assert.ok(o.roughnessMedian >= rlo && o.roughnessMedian <= rhi, `roughness median ${o.roughnessMedian.toFixed(3)} in [${rlo}, ${rhi}] (${fam.source})`);
      // the band describes the tint-masked region where there is one (tile faces without grout, paint without rust)
      const masked = p.tint.mask === 'alpha';
      const rough = [];
      for (let i = 0; i < d.orm.length / 4; i++) if (!masked || d.baseColor[i * 4 + 3] > 127) rough.push(d.orm[i * 4 + 1] / 255);
      assert.ok(rough.length > 0.5 * (d.orm.length / 4), 'the banded region covers most of the tile');
      const [r01, r99] = percentiles(rough, [1, 99]);
      assert.ok(r01 >= rlo - 0.06 && r99 <= rhi + 0.06, `roughness 1..99% ${r01.toFixed(2)}..${r99.toFixed(2)}${masked ? ' (tint-masked region)' : ''}`);
      assert.ok(o.roughnessStd >= checks.roughnessMinStd, `roughness varies (std ${o.roughnessStd.toFixed(4)})`);
      assert.ok(o.aoMean > 0.3 && o.aoMean <= 1, `AO mean ${o.aoMean.toFixed(3)}`);
      if (fam.metal === 'none') {
        assert.equal(p.pbr.metalnessFactor, 0, 'dielectric: metalnessFactor 0');
        assert.ok(o.metallicMean < 0.03, `dielectric metalness channel ${o.metallicMean.toFixed(3)}`);
      } else if (fam.metal === 'full') {
        assert.equal(p.pbr.metalnessFactor, 1);
        assert.ok(o.metallicMean > 0.9, `metal: metalness ${o.metallicMean.toFixed(3)}`);
      } else {
        assert.equal(p.pbr.metalnessFactor, 1);
        assert.ok(o.metallicMean > 0 && o.metallicMean < 0.5, `partial metal: ${o.metallicMean.toFixed(3)}`);
      }
    });

    await t.test('normals are unit length and face outward', async () => {
      const d = await decodeMaterial(m);
      const n = normalStats(d.normal);
      assert.ok(n.lengthErrMean <= checks.normals.meanLengthError, `mean |n|-1 = ${n.lengthErrMean.toFixed(4)}`);
      assert.ok(n.lengthErrP99 <= checks.normals.p99LengthError, `99th percentile |n|-1 = ${n.lengthErrP99.toFixed(4)}`);
      assert.ok(n.minZ >= checks.normals.minZ, `min z ${n.minZ.toFixed(3)}`);
    });

    await t.test('tiles seamlessly (base color, normal X/Y, roughness)', async () => {
      const d = await decodeMaterial(m);
      const chans = seamChannels(d);
      assert.deepEqual(Object.keys(chans), ['baseColor', 'normalX', 'normalY', 'roughness'], 'all four channels are checked');
      for (const [name, img] of Object.entries(chans)) {
        const s = seamMetric(img, d.size, d.size);
        assert.ok(seamOk(s, checks.seam), `${name} wrap seam: x z=${s.x.z.toFixed(2)} ratio=${s.x.ratio.toFixed(2)}, y z=${s.y.z.toFixed(2)} ratio=${s.y.ratio.toFixed(2)}`);
      }
    });

    await t.test('tint presets keep the tinted base color in band; presets are the variants', async () => {
      const tint = p.tint;
      assert.ok(tint && tint.presets && Object.keys(tint.presets).length > 0, 'the material has tint presets');
      assert.ok(m.variants, 'the manifest entry has variants');
      assert.deepEqual(Object.keys(m.variants), Object.keys(tint.presets), 'one variant per tint preset');
      assert.ok(tint.presets[tint.default], `default preset ${tint.default} exists`);
      for (const [name, hex] of Object.entries(tint.presets)) {
        assert.match(/** @type {string} */ (hex), /^#[0-9a-f]{6}$/i, `${name} is a hex color`);
        assert.equal(m.variants[name].params.tint, hex);
        assert.deepEqual(m.variants[name].params.use, tint.presetUse?.[name], `${name}: the variant carries its presetUse`);
      }
      // new (WP-P0-05c re-check): a floor family's presets allowed on floors keep their median in the floor band
      for (const [name, uses] of Object.entries(tint.presetUse ?? {})) {
        assert.ok(name in tint.presets && name !== tint.default, `presetUse '${name}' is a non-default preset`);
        assert.ok(Array.isArray(uses) && uses.length > 0 && uses.every((u) => checks.presetUse.uses.includes(u)), `presetUse '${name}': ${uses}`);
      }
      if (checks.presetUse.floorFamilies.includes(p.family)) {
        const dd = await decodeMaterial(m);
        for (const [name, hex] of Object.entries(tint.presets)) {
          if (presetUseProblem(m, name, 'floor')) continue;
          const [med] = percentiles(linearLuminance(dd.baseColor, hexToLinear(/** @type {any} */ (hex)), tint.mask === 'alpha'), [50]);
          assert.ok(med >= fam.albedo[0] && med <= fam.albedo[1], `${name} may go on floors: median ${med.toFixed(3)} in [${fam.albedo}]`);
        }
      }
      const d = await decodeMaterial(m);
      if (p.family === 'glass') {
        // A transmission tint, not an albedo: it must stay a light multiplier so the glass stays clear.
        for (const [name, hex] of Object.entries(tint.presets)) {
          const lin = hexToLinear(/** @type {any} */ (hex));
          assert.ok(Math.min(...lin) >= 0.25, `${name}: glass tint stays a light multiplier (${lin.map((v) => v.toFixed(2))})`);
        }
        return;
      }
      // golden value: every preset's texels stay inside the ART.md §7.2 hard limits (dielectric 0.013-0.90; metal
      // F0 0.50-1.00), replacing the sRGB 30-240 placeholder
      const alphaMask = tint.mask === 'alpha';
      for (const [name, hex] of Object.entries(tint.presets)) {
        const l = linearLuminance(d.baseColor, hexToLinear(/** @type {any} */ (hex)), alphaMask);
        const [p005, p995] = percentiles(l, [0.5, 99.5]);
        assert.ok(p005 >= fam.min && p995 <= fam.max, `${name}: texels p0.5-p99.5 ${p005.toFixed(4)}-${p995.toFixed(4)} inside ${fam.min}-${fam.max}`);
      }
    });

    await t.test('no block of the tile stands out (repetition, as tools/art-metrics.mjs measures it)', async () => {
      const d = await decodeMaterial(m);
      const tint = p.tint.presets[p.tint.default];
      const lum = linearLuminance(d.baseColor, hexToLinear(/** @type {any} */ (tint)), p.tint.mask === 'alpha');
      const levels = checks.repetition;
      assert.ok(levels.length === 3, 'three block scales');
      const got = repetition(lum, d.size, d.size, levels.map((/** @type {number[]} */ l) => l[0]));
      for (const [blocks, limit] of levels) assert.ok(got[blocks] <= limit, `${blocks}x${blocks}: a block is ${(got[blocks] * 100).toFixed(1)} % from the tile mean (limit ${limit * 100} %)`);
    });

    await t.test('no exact period: the base color differs from itself shifted by 1/2 ... 1/8 of the tile', async () => {
      // new (WP-P0-05c): three 2 m tiles were a 1 m texture tiled 2 x 2 (0.00 codes between opposite quadrants)
      const want = PATTERN_IDS[/** @type {keyof typeof PATTERN_IDS} */ (id)];
      if (want === undefined) assert.equal(p.patternM, undefined, 'no declared pattern: only ceramic tile repeats by design');
      else {
        assert.equal(p.patternM, want, `declares its ${want} m tile module`);
        const periods = p.sizeM[0] / p.patternM;
        assert.ok(Number.isInteger(periods) && periods >= 4, `${periods} periods per side (at least 4, a whole number)`);
        assert.ok(Number.isInteger(tierRes / periods), 'the period is a whole number of texels');
      }
      const d = await decodeMaterial(m);
      const cfg = checks.selfCopy;
      assert.ok(cfg.fractions.includes(0.5) && cfg.fractions.includes(0.25), 'checks half and quarter shifts (WP-P0-11c)');
      const patternPx = want === undefined ? null : Math.round(tierRes * (p.patternM / p.sizeM[0]));
      const s = selfCopy(d.baseColor, d.size, d.size, cfg.fractions, patternPx);
      assert.ok(s.minDiffCodes > cfg.minMeanCodes, `shifted by ${s.at}: ${s.minDiffCodes.toFixed(2)} codes (must exceed ${cfg.minMeanCodes})`);
      assert.ok(s.ratio > cfg.maxRatio, `shifted by ${s.at}: ${s.ratio.toFixed(3)} of an unrelated shift (must exceed ${cfg.maxRatio})`);
      assert.ok(Math.abs(s.minDiffCodes - meta.stats.selfCopy.minDiffCodes) < 0.05, 'manifest stats match the shipped file');
    });

    await t.test('knot-scale detail does not recur every metre (2 m tiles; wood floors are 2 m)', async () => {
      // new (WP-P0-05c art check): the 1 m woods put every knot on a 1 m lattice (a 6 x 3 m floor showed the grid)
      const cfg = checks.periodRecurrence;
      if (p.family === 'wood_floor') assert.equal(p.sizeM[0], 2, 'wood floors are 2 m tiles laid from whole boards');
      if (p.sizeM[0] === cfg.periodM) {
        assert.notEqual(p.family, 'wood_floor');
        return;
      }
      const d = await decodeMaterial(m);
      const per = Math.round(d.size * (cfg.periodM / p.sizeM[0]));
      const [lo, hi] = cfg.bandM.map((/** @type {number} */ v) => Math.max(1, Math.round(v * meta.texelDensity)));
      const r = periodRecurrence(d.baseColor, d.size, d.size, per, lo, hi);
      assert.ok(r.spots >= 50, `${r.spots} knot-scale spots to judge`);
      assert.ok(Math.abs(r.corrX) <= cfg.maxCorrelation && Math.abs(r.corrY) <= cfg.maxCorrelation, `band correlation one metre along x ${r.corrX.toFixed(3)}, y ${r.corrY.toFixed(3)} (limit ${cfg.maxCorrelation})`);
      assert.ok(r.recurring <= r.chance + cfg.maxExcessOverChance, `${(r.recurring * 100).toFixed(1)} % of dark spots recur one metre on (chance ${(r.chance * 100).toFixed(1)} %)`);
    });

    await t.test('art check (WP-P0-05c): grout band, speck ceiling, floor presets', async () => {
      const node = graphNode(id);
      const d = await decodeMaterial(m);
      const n = d.size * d.size;
      /** @param {number} i */
      const lumAt = (i) => linearLuminance(d.baseColor.subarray(i * 4, i * 4 + 4), [1, 1, 1], false)[0];
      if (id === 'tile_ceramic') {
        // new: grout reads in the ART.md §7.2 grout band and the tile rim beside it is not brighter than the faces
        const [glo, ghi] = familyLimits(bands, 'grout').albedo;
        const grout = [];
        const rim = [];
        const face = [];
        for (let i = 0; i < n; i++) {
          const x = i % d.size;
          const y = Math.floor(i / d.size);
          const g = (/** @type {number} */ xx, /** @type {number} */ yy) => d.baseColor[(((yy + d.size) % d.size) * d.size + ((xx + d.size) % d.size)) * 4 + 3] < 128;
          if (g(x, y)) grout.push(lumAt(i));
          else if (g(x + 1, y) || g(x - 1, y) || g(x, y + 1) || g(x, y - 1)) rim.push(lumAt(i));
          else face.push(lumAt(i));
        }
        const [gm] = percentiles(grout, [50]);
        const [rm] = percentiles(rim, [50]);
        const [fm] = percentiles(face, [50]);
        assert.ok(gm >= glo && gm <= ghi, `grout median ${gm.toFixed(3)} in the grout band [${glo}, ${ghi}]`);
        assert.ok(rm <= fm * 1.01, `rim median ${rm.toFixed(3)} not brighter than the faces ${fm.toFixed(3)}`);
      }
      if (node.albedo?.ceiling) {
        // new: isolated bright specks stop at the declared ceiling (plastic reached 0.74 at its white preset)
        const l = linearLuminance(d.baseColor, [1, 1, 1], false);
        const [med, top] = percentiles(l, [50, 100]);
        assert.ok(top <= node.albedo.ceiling.ratioToMedian * med * 1.04, `brightest texel ${top.toFixed(3)} <= ${node.albedo.ceiling.ratioToMedian} x median ${med.toFixed(3)}`);
      }
      if (id === 'wood_floor_pine') {
        // new: a floor, so every preset's median stays inside the floor band
        const [flo, fhi] = fam.albedo;
        for (const [name, hex] of Object.entries(p.tint.presets)) {
          const [med] = percentiles(linearLuminance(d.baseColor, hexToLinear(/** @type {any} */ (hex)), false), [50]);
          assert.ok(med >= flo && med <= fhi, `${name}: median ${med.toFixed(3)} in the floor band [${flo}, ${fhi}]`);
        }
      }
    });

    await t.test('detail map (fabric, leather, cardboard): unit normals, tiles, close-up scale', async () => {
      const wants = DETAIL_IDS.includes(id);
      assert.equal(Boolean(p.detail), wants, wants ? 'has a detail map (WP-P0-05b scope)' : 'no detail map');
      if (!wants) return;
      assert.equal(p.detail.texture, 'detailNormal');
      assert.equal(p.detail.sizeM, targets.detail.sizeM, `repeats every ${targets.detail.sizeM} m`);
      assert.equal(p.detail.blend, 'whiteout');
      assert.equal(p.detail.fadeM.length, 2);
      assert.ok(p.detail.fadeM[0] < p.detail.fadeM[1], 'fades out with distance');
      const d = await decodeMaterial(m);
      const dn = /** @type {Uint8Array} */ (d.detailNormal);
      const n = normalStats(dn);
      assert.ok(n.lengthErrMean <= checks.normals.meanLengthError && n.lengthErrP99 <= checks.normals.p99LengthError && n.minZ >= checks.normals.minZ, `detail normals ${JSON.stringify(n)}`);
      const res = targets.detail.resolution;
      for (const c of [0, 1]) {
        const ch = Float64Array.from({ length: res * res }, (_, i) => dn[i * 4 + c]);
        const sm = seamMetric(ch, res, res);
        assert.ok(seamOk(sm, checks.seam), `detail normal ${'XY'[c]} tiles`);
      }
    });

    await t.test('encoding quality meets the PSNR floor', () => {
      assert.deepEqual(Object.keys(meta.quality.minPsnr).sort(), [...MAPS].sort(), 'a PSNR floor for every map');
      for (const [k, floor] of Object.entries(meta.quality.minPsnr)) {
        assert.equal(typeof meta.maps[k].psnr, 'number', `${k} PSNR recorded`);
        assert.ok(meta.maps[k].psnr >= floor, `${k} PSNR ${meta.maps[k].psnr} >= ${floor}`);
      }
    });

    await t.test('source is locked, CC0 and credited; preview render exists', () => {
      assert.equal(m.sources.length, 1);
      const src = allLocked.find((/** @type {any} */ s) => s.id === m.sources[0]);
      assert.ok(src, `${m.sources[0]} is in assets/sources.lock.json under ${WP}, ${WP_B} or ${WP_C}`);
      assert.equal(src.license, 'CC0-1.0');
      assert.equal(m.license, 'CC0-1.0');
      assert.ok(src.usedFor.includes(id), `lock entry lists ${id} in usedFor`);
      assert.ok(src.files.length > 0, 'the source has locked files');
      for (const f of src.files) assert.match(f.sha256, /^[0-9a-f]{64}$/);
      assert.ok(credits.includes(src.id) || creditsB.includes(src.id) || creditsC.includes(src.id), `the ${WP}, ${WP_B} or ${WP_C} section of assets/CREDITS.md names the source`);
      assert.equal(meta.preview, `docs/art/materials/${id}.png`);
      assert.ok(existsSync(join(ROOT, meta.preview)), `preview ${meta.preview}`);
      assert.ok(statSync(join(ROOT, meta.preview)).size > 10_000, 'preview is a real render');
    });
  });
}

test('shared variation mask tiles and is uniformly distributed', async () => {
  assert.ok(variation, 'materials/variation is in the manifest');
  assert.equal(variation.kind, 'texture');
  assert.equal(variation.license, 'LicenseRef-Original');
  const b = bytesOf(variation.path);
  assert.equal(sha256(b), variation.meta.sha256);
  const { header, dfd } = parseKtx2(b);
  assert.equal(dfd.colorModel, 'uastc');
  assert.equal(dfd.transfer, 'linear');
  assert.equal(header.width, targets.shared.variationResolution);
  assert.equal(header.levels, Math.log2(header.width) + 1);
  const img = await decodeLevel0(b);
  const n = img.width * img.height;
  for (let c = 0; c < 4; c++) {
    const ch = Float64Array.from({ length: n }, (_, i) => img.rgba[i * 4 + c]);
    let sum = 0;
    for (const x of ch) sum += x;
    assert.ok(Math.abs(sum / n / 255 - 0.5) < 0.03, `channel ${'rgba'[c]} mean ${(sum / n / 255).toFixed(3)} ~ 0.5`);
    const s = seamMetric(ch, img.width, img.height);
    assert.ok(seamOk(s, checks.seam), `channel ${'rgba'[c]} tiles`);
  }
});

test('committed KTX transcoder (tools/bin/ktx-wasm) matches its locked download', () => {
  const src = lock.sources.find((/** @type {any} */ s) => s.id === 'tools/ktx-software-libktx_read@4.4.2');
  assert.ok(src, 'transcoder download is locked');
  const members = src.files[0].members;
  assert.equal(sha256(bytesOf('tools/bin/ktx-wasm/libktx_read.cjs')), members['libktx_read.js']);
  assert.equal(sha256(bytesOf('tools/bin/ktx-wasm/libktx_read.wasm')), members['libktx_read.wasm']);
});

test('locked sources are complete', () => {
  assert.ok(credits, `assets/CREDITS.md has a ## ${WP} section`);
  const lockedIds = lock.sources.map((/** @type {any} */ s) => s.id);
  assert.deepEqual([...lockedIds].sort(), [...LOCKED_IDS].sort(), `the ledger entries with wp ${WP} are exactly the sources it locked`);
  for (const m of materials) {
    const src = m.sources[0];
    const by = LOCKED_IDS_C.includes(src) ? WP_C : LOCKED_IDS_B.includes(src) ? WP_B : WP;
    const pool = { [WP]: lock, [WP_B]: lockB, [WP_C]: lockC }[by].sources;
    assert.ok(pool.some((/** @type {any} */ x) => x.id === src), `${m.id}: source ${src} is locked by ${by}`);
  }
  assert.ok(lockedIds.includes('polyhaven/studio_small_09@2k'), 'the preview HDRI is locked');
  assert.ok(lockedIds.includes('tools/ktx-software@4.4.2-darwin-arm64'), 'the KTX-Software package is locked');
  assert.ok(lockedIds.includes('tools/ktx-software-libktx_read@4.4.2'), 'the KTX transcoder download is locked');
  for (const s of lock.sources) {
    assert.ok(s.files.length > 0, `${s.id} has locked files`);
    assert.ok(s.title && s.provider && s.license && s.authors?.length, `${s.id} has title, provider, license, authors`);
    assert.ok(s.usedFor.length > 0, `${s.id} says what it is used for`);
    for (const f of s.files) {
      assert.match(f.url, /^https:\/\//);
      assert.match(f.sha256, /^[0-9a-f]{64}$/);
      assert.ok(f.bytes > 0);
      assert.ok(credits.includes(f.sha256), `credits list the SHA-256 of ${f.path}`);
    }
  }
});

test('WP-P0-05b sources: the new sources are locked, CC0 and credited', () => {
  assert.ok(creditsB, `assets/CREDITS.md has a ## ${WP_B} section`);
  const ids = lockB.sources.map((/** @type {any} */ x) => x.id);
  assert.deepEqual([...ids].sort(), [...LOCKED_IDS_B].sort(), `the ledger entries with wp ${WP_B} are exactly the new scans`);
  for (const x of lockB.sources) {
    assert.equal(x.license, 'CC0-1.0', `${x.id} is CC0`);
    assert.ok(x.title && x.provider && x.authors?.length && x.creationMethod, `${x.id} has title, provider, authors, how it was made`);
    assert.ok(x.usedFor.length > 0 && materials.some((/** @type {any} */ m) => m.sources[0] === x.id), `${x.id} is used by a material`);
    assert.ok(x.files.length > 0, `${x.id} has locked files`);
    for (const f of x.files) {
      assert.match(f.url, /^https:\/\/(ambientcg\.com|dl\.polyhaven\.org)\//, `${f.path} comes from an allowed source`);
      assert.match(f.sha256, /^[0-9a-f]{64}$/);
      assert.ok(creditsB.includes(f.sha256), `the ${WP_B} section of assets/CREDITS.md lists the SHA-256 of ${f.path}`);
    }
    assert.ok(creditsB.includes(x.id), `the ${WP_B} section of assets/CREDITS.md names ${x.id}`);
  }
  for (const x of lockB.sources) assert.ok(!lock.sources.some((/** @type {any} */ y) => y.id === x.id), `${x.id} is not also locked by ${WP}`);
});

test('WP-P0-05c source: the cardboard scan is locked, CC0 and credited', () => {
  assert.ok(creditsC, `assets/CREDITS.md has a ## ${WP_C} section`);
  assert.deepEqual(lockC.sources.map((/** @type {any} */ x) => x.id).sort(), [...LOCKED_IDS_C].sort(), `the ledger entries with wp ${WP_C} are exactly the new scan`);
  for (const x of lockC.sources) {
    assert.equal(x.license, 'CC0-1.0', `${x.id} is CC0`);
    assert.ok(x.title && x.provider && x.authors?.length && x.creationMethod, `${x.id} has title, provider, authors, how it was made`);
    assert.ok(x.usedFor.length > 0 && x.usedFor.every((/** @type {string} */ u) => materials.some((/** @type {any} */ m) => shortId(m) === u && m.sources[0] === x.id)), `${x.id} is used by the materials it lists`);
    assert.ok(x.files.length > 0, `${x.id} has locked files`);
    for (const f of x.files) {
      assert.match(f.url, /^https:\/\/(ambientcg\.com|dl\.polyhaven\.org)\//, `${f.path} comes from an allowed source`);
      assert.match(f.sha256, /^[0-9a-f]{64}$/);
      assert.ok(creditsC.includes(f.sha256), `the ${WP_C} section of assets/CREDITS.md lists the SHA-256 of ${f.path}`);
    }
    assert.ok(creditsC.includes(x.id), `the ${WP_C} section of assets/CREDITS.md names ${x.id}`);
    assert.ok(![...lock.sources, ...lockB.sources].some((/** @type {any} */ y) => y.id === x.id), `${x.id} is not also locked by ${WP} or ${WP_B}`);
  }
});

// The seed bug (WP-P0-05b): tools/blender/materials/library.py multiplied the raw instance seed in the shader, which
// lost the fraction above 2^24 in float32 and broke the variation lookup; the offset is now frac(seed * phi) mod 1,
// formed in float64 on the CPU.
const SEEDS = [0, 2 ** 20, 2 ** 32 - 1];

test('seed offsets wrap mod 1 in float64 for seeds 0, 2^20 and 2^32-1', () => {
  assert.deepEqual(seedOffset(0), [0, 0]);
  for (const seed of SEEDS) {
    const [u, v] = seedOffset(seed);
    for (const x of [u, v]) assert.ok(x >= 0 && x < 1, `seed ${seed}: offset ${x} in [0, 1)`);
    // seed * phi stays below 2^32 in float64, which leaves 21 fraction bits: the wrap is exact to about 5e-7
    const exact = (/** @type {number} */ f) => seed * f - Math.floor(seed * f);
    assert.equal(u, exact(0.6180339887498949), `seed ${seed}: u is frac(seed * phi)`);
    assert.equal(v, exact(0.4142135623730951), `seed ${seed}: v is frac(seed * (sqrt 2 - 1))`);
  }
  assert.throws(() => seedOffset(2 ** 32), RangeError);
  assert.throws(() => seedOffset(-1), RangeError);
  assert.match(library.library.conventions.variation, /mod 1/, 'library.conventions.variation states the wrap');
});

test('Blender renders metal_brushed at seeds 0, 2^20 and 2^32-1 like seed 0 (CPU, as the icon rig)', () => {
  const out = execFileSync('bash', [join(ROOT, 'tools/blender/run.sh'), join(ROOT, 'tools/blender/materials/seed_check.py'), '--material', 'metal_brushed', '--seeds', SEEDS.join(','), '--device', 'CPU'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 300_000,
    maxBuffer: 1 << 26,
  });
  const line = out.split('\n').find((l) => l.startsWith('SEEDCHECK '));
  assert.ok(line, 'seed_check.py printed its result');
  const { results } = JSON.parse(line.slice('SEEDCHECK '.length));
  assert.deepEqual(results.map((/** @type {any} */ r) => r.seed), SEEDS);
  const base = results[0].mean;
  assert.ok(base > 0.1, `seed 0 renders lit (mean ${base.toFixed(3)})`);
  for (const r of results) {
    assert.ok(Math.abs(r.mean / base - 1) <= 0.1, `seed ${r.seed}: mean ${r.mean.toFixed(4)} within 10 % of seed 0 (${base.toFixed(4)})`);
    const [u, v] = seedOffset(r.seed);
    assert.ok(Math.abs(r.offset[0] - u) < 1e-9 && Math.abs(r.offset[1] - v) < 1e-9, `seed ${r.seed}: Blender stores the same offset as seedOffset()`);
  }
});

// Unknown names fail loudly (WP-P0-05b review): an unknown tint preset, primary or secondary, raised nothing and baked
// white; graph.json names that do not resolve now stop the build before anything is written.
const PY_CHECK = String.raw`
import json, sys
sys.path[:0] = [sys.argv[1] + '/tools/blender', sys.argv[1] + '/tools/materials']
from materials.tints import resolve_tint, srgb_hex_to_linear, UnknownTint, PresetUse, check_use
from slmat import graphcheck
root = sys.argv[1]
lib = json.load(open(root + '/assets/materials/library.json'))
E = {a['id']: a for a in lib['assets']}
def tint(e, t=None, secondary=False):
    try:
        return {'ok': True, 'rgb': list(resolve_tint(E[e], t, secondary))}
    except UnknownTint as err:
        return {'ok': False, 'error': str(err)}
def use(e, t, u):
    try:
        check_use(E[e], t, u)
        return {'ok': True}
    except (PresetUse, ValueError) as err:
        return {'ok': False, 'error': str(err), 'presetUse': isinstance(err, PresetUse)}
def load(p):
    return json.load(open(root + '/' + p))
graph, bands, targets = load('tools/materials/graph.json'), load('tools/materials/bands.json'), load('tools/materials/targets.json')
sources = {s['id']: s for s in load('assets/sources.lock.json')['sources']}
def broken(fn):
    g = json.loads(json.dumps(graph))
    fn({m['id']: m for m in g['materials']})
    return graphcheck.validate(g, bands, targets, sources)
out = {
    'steel': tint('materials/metal_brushed', 'steel'),
    'default': tint('materials/metal_brushed'),
    'brass': tint('materials/metal_brushed', 'brass'),
    'hex': tint('materials/metal_brushed', '#808080'),
    'tuple': tint('materials/metal_brushed', (0.5, 0.25, 0.125)),
    'groutDark': tint('materials/tile_ceramic', 'dark', True),
    'groutTeal': tint('materials/tile_ceramic', 'teal', True),
    'noSecondary': tint('materials/metal_brushed', None, True),
    'steelHex': list(srgb_hex_to_linear(E['materials/metal_brushed']['params']['tint']['presets']['steel'])),
    'graph': graphcheck.validate(graph, bands, targets, sources),
    'badDefault': broken(lambda M: M['metal_brushed']['tint'].update(default='brass')),
    'badSecondary': broken(lambda M: M['tile_ceramic']['tint']['secondary'].update(default='teal')),
    'badFamily': broken(lambda M: M['rubber'].update(family='vinyl')),
    'badSource': broken(lambda M: M['bark'].update(source='polyhaven/nope@2k')),
    'badDirt': broken(lambda M: M['soil']['dirt'].pop('color')),
    'smokedFloor': use('materials/wood_floor_oak', 'smoked', 'floor'),
    'smokedFurniture': use('materials/wood_floor_oak', 'smoked', 'furniture'),
    'naturalFloor': use('materials/wood_floor_oak', None, 'floor'),
    'badUse': broken(lambda M: M['wood_floor_oak']['tint'].update(presetUse={'smoked': ['ceiling'], 'ebony': ['floor']})),
}
print(json.dumps(out))
`;

test('tint presets and graph names resolve or fail loudly (pure Python: tints.py, graphcheck.py)', () => {
  const r = JSON.parse(execFileSync('python3', ['-c', PY_CHECK, ROOT], { encoding: 'utf8' }));
  assert.deepEqual(r.steel, { ok: true, rgb: r.steelHex }, 'a known preset resolves to its colour');
  assert.deepEqual(r.default, r.steel, 'no tint means the default preset');
  assert.equal(r.brass.ok, false, 'an unknown preset raises');
  assert.match(r.brass.error, /materials\/metal_brushed: unknown tint preset 'brass'; available: \['aluminium', 'steel'\]/);
  assert.equal(r.hex.ok, true, 'an explicit hex stays allowed');
  assert.deepEqual(r.tuple, { ok: true, rgb: [0.5, 0.25, 0.125] }, 'an RGB tuple stays allowed');
  assert.equal(r.groutDark.ok, true, 'a known secondary preset resolves');
  assert.equal(r.groutTeal.ok, false);
  assert.match(r.groutTeal.error, /materials\/tile_ceramic: unknown secondary tint preset 'teal'; available: \['dark', 'grey', 'white'\]/);
  assert.deepEqual(r.noSecondary, { ok: true, rgb: [1, 1, 1] }, 'a material without a secondary tint layer is neutral');
  assert.deepEqual(r.graph, [], `graph.json resolves: ${r.graph.join('; ')}`);
  assert.ok(r.badDefault.some((/** @type {string} */ p) => /metal_brushed: default tint preset 'brass'/.test(p)), r.badDefault.join('; '));
  assert.ok(r.badSecondary.some((/** @type {string} */ p) => /tile_ceramic: default secondary tint preset 'teal'/.test(p)), r.badSecondary.join('; '));
  assert.ok(r.badFamily.some((/** @type {string} */ p) => /rubber: family 'vinyl' has no band/.test(p)), r.badFamily.join('; '));
  assert.ok(r.badSource.some((/** @type {string} */ p) => /bark: source 'polyhaven\/nope@2k' is not in the asset lock/.test(p)), r.badSource.join('; '));
  assert.ok(r.badDirt.some((/** @type {string} */ p) => /soil: dirt\.color is missing/.test(p)), r.badDirt.join('; '));
  assert.equal(r.smokedFloor.ok, false, 'a floor binding of oak smoked raises');
  assert.equal(r.smokedFloor.presetUse, true);
  assert.match(r.smokedFloor.error, /wood_floor_oak: tint preset 'smoked' is for \['furniture', 'accent'\], not floor/);
  assert.deepEqual(r.smokedFurniture, { ok: true });
  assert.deepEqual(r.naturalFloor, { ok: true });
  assert.ok(r.badUse.some((/** @type {string} */ p) => /presetUse 'smoked' must be a non-empty list/.test(p)), r.badUse.join('; '));
  assert.ok(r.badUse.some((/** @type {string} */ p) => /presetUse names 'ebony'/.test(p)), r.badUse.join('; '));
});

test('presetUse: oak "smoked" is rejected for floor bindings, allowed for furniture and accents (WP-P0-05c re-check)', () => {
  const oak = materials.find((/** @type {any} */ a) => a.id === 'materials/wood_floor_oak');
  assert.deepEqual(oak.params.tint.presetUse, { smoked: ['furniture', 'accent'] });
  assert.match(String(presetUseProblem(oak, 'smoked', 'floor')), /wood_floor_oak: tint preset 'smoked' is for furniture, accent, not floor/);
  assert.equal(presetUseProblem(oak, 'smoked', 'furniture'), null);
  assert.equal(presetUseProblem(oak, 'smoked', 'accent'), null);
  for (const name of ['natural', 'honey', 'whitewash']) assert.equal(presetUseProblem(oak, name, 'floor'), null, `${name} may go on floors`);
  assert.equal(presetUseProblem(oak, undefined, 'floor'), null, 'the default preset may go on floors');
  assert.match(String(presetUseProblem(oak, 'smoked', 'ceiling')), /unknown use 'ceiling'/);
  assert.match(String(presetUseProblem(oak, 'ebony', 'floor')), /unknown tint preset 'ebony'/);
});

test('Blender: assign() with an unknown tint preset raises, a known one assigns', () => {
  const out = execFileSync('bash', [join(ROOT, 'tools/blender/run.sh'), join(ROOT, 'tools/blender/materials/tint_check.py')], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 });
  const line = out.split('\n').find((l) => l.startsWith('TINTCHECK '));
  assert.ok(line, 'tint_check.py printed its result');
  const r = JSON.parse(line.slice('TINTCHECK '.length));
  assert.equal(r.known.ok, true, 'steel assigns');
  assert.equal(r.hex.ok, true, 'a hex assigns');
  assert.equal(r.unknown.ok, false, 'brass raises');
  assert.match(r.unknown.error, /metal_brushed.*'brass'.*aluminium.*steel/);
  assert.equal(r.unknownSecondary.ok, false, 'an unknown secondary preset raises');
  assert.match(r.unknownSecondary.error, /tile_ceramic.*secondary.*'teal'/);
});
