// @ts-check
// Stage 'compress': the raw Blender export (PNG textures) -> the shipped glb. Textures become KTX2 (KTX-Software
// `ktx create`, encoder settings per texture role), geometry and animation get EXT_meshopt_compression, materials get
// their alpha / double-sided flags (and no metalness), clips get their loop, root-motion and stride extras and lose
// the channels that never change (folded into the joints' rest transforms); the result is read back through the
// meshopt decoder and measured (the numbers the manifest and tests/characters.test.js check).
//
//   node tools/blender/characters/compress.mjs <raw.glb> <clips_report.json> <recipe.json> <out.glb> <stats.json>
//
// Dependencies resolve from the repository's node_modules or from tools/blender/characters/node_modules, which
// build.py links to .work/node (the same pinned versions). The ktx CLI comes from $KTX, tools/bin/ktx (WP-P0-05's
// install-ktx.sh) or .work/ktx/ktx.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRTextureBasisu } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');

/** @returns {string} */
function ktxBin() {
  for (const p of [process.env.KTX, join(ROOT, 'tools', 'bin', 'ktx'), join(HERE, '.work', 'ktx', 'ktx')]) {
    if (p && existsSync(p)) return p;
  }
  return 'ktx';
}

// Encoder settings. Normal and ORM maps use the material library's presets (WP-P0-05, tools/materials/targets.json);
// the skin and hair base colors use UASTC (faces and alpha cutouts show ETC1S block artifacts first).
const ENCODE = {
  normal: ['--encode', 'uastc', '--uastc-quality', '4', '--uastc-rdo', '--uastc-rdo-l', '0.4', '--uastc-rdo-m', '--zstd', '18'],
  orm: ['--encode', 'basis-lz', '--clevel', '4', '--qlevel', '255', '--no-endpoint-rdo', '--no-selector-rdo'],
  baseColor: ['--encode', 'basis-lz', '--clevel', '4', '--qlevel', '255'],
  baseColorHero: ['--encode', 'uastc', '--uastc-quality', '3', '--uastc-rdo', '--uastc-rdo-l', '0.5', '--uastc-rdo-m', '--zstd', '18'],
};

/**
 * @param {Uint8Array} png
 * @param {{ srgb: boolean, alpha: boolean, encode: string[] }} opts
 * @returns {{ data: Uint8Array, psnr: number | null }}
 */
function toKtx2(png, opts) {
  const dir = mkdtempSync(join(tmpdir(), 'wage-ktx-'));
  try {
    const src = join(dir, 'in.png');
    const out = join(dir, 'out.ktx2');
    writeFileSync(src, png);
    const format = opts.srgb ? (opts.alpha ? 'R8G8B8A8_SRGB' : 'R8G8B8_SRGB') : opts.alpha ? 'R8G8B8A8_UNORM' : 'R8G8B8_UNORM';
    const args = ['create', '--format', format, '--assign-tf', opts.srgb ? 'srgb' : 'linear', '--assign-primaries', opts.srgb ? 'bt709' : 'none',
      '--generate-mipmap', '--threads', '8', '--testrun', '--compare-psnr', ...opts.encode, src, out];
    const log = execFileSync(ktxBin(), args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const m = /Level 0:\s*PSNR:\s*([0-9.]+)/.exec(log);
    return { data: new Uint8Array(readFileSync(out)), psnr: m ? Number(m[1]) : null };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** @param {Uint8Array} b */
function ktx2Header(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { vkFormat: dv.getUint32(12, true), width: dv.getUint32(20, true), height: dv.getUint32(24, true), levels: dv.getUint32(40, true), supercompression: dv.getUint32(44, true) };
}

async function main() {
  const [rawPath, reportPath, recipePath, outPath, statsPath] = process.argv.slice(2);
  if (!statsPath) throw new Error('usage: compress.mjs <raw.glb> <clips_report.json> <recipe.json> <out.glb> <stats.json>');
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const recipe = JSON.parse(readFileSync(recipePath, 'utf8'));
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  const doc = await io.read(rawPath);
  const root = doc.getRoot();
  // quantization moves positions into a normalized grid (the skin's inverse bind matrices undo it), so the standing
  // height is measured on the raw export
  const heightM = measure(doc).heightM;

  // materials: skin opaque single-sided, cloth double-sided (open collar, cuffs and hems show their inside),
  // hair / brows / lashes alpha-tested cards
  for (const mat of root.listMaterials()) {
    const role = mat.getName().split('_').pop();
    mat.setMetallicFactor(0).setRoughnessFactor(1);
    if (role === 'hair') mat.setAlphaMode('MASK').setAlphaCutoff(0.35).setDoubleSided(true);
    else mat.setAlphaMode('OPAQUE').setDoubleSided(role === 'cloth');
  }

  // textures -> KTX2
  /** @type {Record<string, unknown>[]} */
  const textures = [];
  for (const tex of root.listTextures()) {
    const mats = tex.listParents().filter((p) => p.propertyType === 'Material');
    /** @type {'baseColor' | 'normal' | 'orm'} */
    let slot = 'orm';
    let role = '';
    for (const p of mats) {
      const mat = /** @type {import('@gltf-transform/core').Material} */ (/** @type {unknown} */ (p));
      role = mat.getName().split('_').pop() || '';
      if (mat.getBaseColorTexture() === tex) slot = 'baseColor';
      else if (mat.getNormalTexture() === tex) slot = 'normal';
    }
    const png = tex.getImage();
    if (!png) throw new Error(`texture ${tex.getName()} has no image`);
    const alpha = slot === 'baseColor' && role === 'hair';
    const encode = slot === 'baseColor' ? (role === 'cloth' ? ENCODE.baseColor : ENCODE.baseColorHero) : ENCODE[slot];
    const { data, psnr } = toKtx2(png, { srgb: slot === 'baseColor', alpha, encode });
    const head = ktx2Header(data);
    tex.setImage(data).setMimeType('image/ktx2').setURI(`${tex.getName() || `${role}_${slot}`}.ktx2`);
    textures.push({ name: tex.getName(), material: role, slot, codec: encode[1], width: head.width, height: head.height, levels: head.levels, bytes: data.byteLength, pngBytes: png.byteLength, psnr });
    console.log(`[compress] ${tex.getName()} (${role} ${slot}) ${head.width}x${head.height} ${encode[1]} ${(data.byteLength / 1024).toFixed(0)} KiB, PSNR ${psnr ?? '?'} dB`);
  }
  // required: the textures exist only as KTX2 (three.js: KTX2Loader); the asset-lock mesh fingerprint
  // (tools/asset-lock/render_mesh.py) imports such files without it
  doc.createExtension(KHRTextureBasisu).setRequired(true);

  // clips: loop flag and kind (loop / oneShot / hold), what the game plays it for, source, the extracted root motion
  // (glTF +Z is the character's forward), the stride, and the pose facts the renderer places it by (pelvis height,
  // seat height, and whether the first / last frame lies, with head direction and pelvis position)
  for (const anim of root.listAnimations()) {
    const r = report[anim.getName()];
    if (!r) throw new Error(`animation ${anim.getName()} is not in the clips report`);
    anim.setExtras({
      loop: r.loop, kind: r.kind, use: r.use, source: r.source, title: r.title, durationSec: r.durationSec, speed: r.speed,
      rootMotion: r.rootMotion, stride: r.stride, soleSlideMps: r.soleSlide ? r.soleSlide.afterLock : null,
      loopContinuity: r.loopContinuity ?? null, pose: r.pose,
    });
  }
  root.getAsset().generator = 'SurvivalLogs tools/blender/characters (MPFB 2.0.17 + CMU mocap, Blender 5.2, glTF-Transform 4.5)';
  root.setExtras({ character: recipe.id, title: recipe.title, heightM: Math.round(heightM * 1000) / 1000, forward: [0, 0, 1], up: [0, 1, 0], locomotion: locomotion(report) });

  await doc.transform(dedup(), resample({ tolerance: 1e-4 }));
  const stripped = stripConstantChannels(doc);
  console.log(`[compress] constant channels folded into the rest pose: ${stripped.folded} joints/paths, ${stripped.removed} channels removed`);
  await doc.transform(prune({ keepExtras: true }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  mkdirSync(dirname(outPath), { recursive: true });
  await io.write(outPath, doc);

  // read back and measure
  const back = await io.read(outPath);
  const stats = measure(back);
  stats.heightM = heightM;
  stats.bytes = statSync(outPath).size;
  stats.rawBytes = statSync(rawPath).size;
  stats.textures = textures;
  stats.file = relative(ROOT, outPath);
  stats.locomotion = back.getRoot().getExtras().locomotion;
  writeFileSync(statsPath, `${JSON.stringify(stats, null, 2)}\n`);
  console.log(`[compress] ${basename(outPath)}: ${(stats.bytes / 1024 / 1024).toFixed(2)} MiB (raw ${(stats.rawBytes / 1024 / 1024).toFixed(2)} MiB), ${stats.triangles} triangles, ${stats.joints} joints, max ${stats.maxInfluences} influences, clips ${Object.keys(stats.clips).join(', ')}`);
}

/**
 * The game's locomotion data (WP-P0-08): the moving clip's speed, stride and the playback-rate rule.
 * @param {any} report clips report (with _locomotion from clips.json)
 */
function locomotion(report) {
  const l = report._locomotion;
  const move = report[l.moveClip];
  const rate = (/** @type {number} */ v) => Math.min(l.rateClamp[1], Math.max(l.rateClamp[0], v / move.rootMotion.speedMps));
  const sim = l.simSpeedMps;
  const speeds = { normal: sim, encumbered: sim * l.speedMultipliers.encumbered, caffeine: sim * l.speedMultipliers.caffeine };
  return {
    ...l,
    clipSpeedMps: move.rootMotion.speedMps,
    strideM: move.stride.strideM,
    cycleSec: move.stride.cycleSec,
    ratesAt: Object.fromEntries(Object.entries(speeds).map(([k, v]) => [k, { simSpeedMps: Math.round(v * 1000) / 1000, rate: Math.round(rate(v) * 1000) / 1000, clamped: rate(v) !== v / move.rootMotion.speedMps }])),
  };
}

/**
 * Channels whose value never changes: where every clip holds the same constant for a joint's rotation /
 * translation / scale, the value becomes the joint's rest transform and the channels go; a clip's constant channel
 * equal to the rest transform goes too. (three.js keeps a property a clip does not animate at its rest value.)
 * @param {import('@gltf-transform/core').Document} doc
 */
function stripConstantChannels(doc) {
  const root = doc.getRoot();
  const eps = 2e-5;
  /** @param {import('@gltf-transform/core').AnimationChannel} ch */
  const constant = (ch) => {
    const out = ch.getSampler()?.getOutput();
    if (!out) return null;
    /** @type {number[]} */
    const first = [];
    /** @type {number[]} */
    const el = [];
    out.getElement(0, first);
    const rot = ch.getTargetPath() === 'rotation';
    for (let i = 1; i < out.getCount(); i++) {
      out.getElement(i, el);
      const s = rot && el.reduce((a, x, k) => a + x * first[k], 0) < 0 ? -1 : 1;
      if (el.some((x, k) => Math.abs(s * x - first[k]) > eps)) return null;
    }
    return first;
  };
  /** @param {number[]} a @param {number[]} b @param {boolean} rot */
  const same = (a, b, rot) => {
    const s = rot && a.reduce((acc, x, k) => acc + x * b[k], 0) < 0 ? -1 : 1;
    return a.every((x, k) => Math.abs(x - s * b[k]) <= eps);
  };
  /** @type {Map<string, { node: any, path: string, entries: { anim: any, ch: any, value: number[] | null }[] }>} */
  const groups = new Map();
  const anims = root.listAnimations();
  for (const anim of anims) {
    for (const ch of anim.listChannels()) {
      const node = ch.getTargetNode();
      const path = ch.getTargetPath();
      if (!node || !path || path === 'weights') continue;
      const key = `${node.getName()}|${path}`;
      if (!groups.has(key)) groups.set(key, { node, path, entries: [] });
      groups.get(key)?.entries.push({ anim, ch, value: constant(ch) });
    }
  }
  let folded = 0;
  let removed = 0;
  /** @param {any} anim @param {any} ch */
  const drop = (anim, ch) => {
    const sampler = ch.getSampler();
    anim.removeChannel(ch);
    ch.dispose();
    if (sampler && !anim.listChannels().some((/** @type {any} */ c) => c.getSampler() === sampler)) {
      anim.removeSampler(sampler);
      sampler.dispose();
    }
    removed++;
  };
  for (const { node, path, entries } of groups.values()) {
    const rot = path === 'rotation';
    const rest = path === 'rotation' ? node.getRotation() : path === 'translation' ? node.getTranslation() : node.getScale();
    const everyClip = entries.length === anims.length && entries.every((e) => e.value && same(/** @type {number[]} */ (e.value), /** @type {number[]} */ (entries[0].value), rot));
    if (everyClip) {
      const v = /** @type {number[]} */ (entries[0].value);
      if (path === 'rotation') node.setRotation(/** @type {any} */ (v));
      else if (path === 'translation') node.setTranslation(/** @type {any} */ (v));
      else node.setScale(/** @type {any} */ (v));
      for (const e of entries) drop(e.anim, e.ch);
      folded++;
      continue;
    }
    for (const e of entries) if (e.value && same(e.value, rest, rot)) drop(e.anim, e.ch);
  }
  return { folded, removed };
}

/**
 * Budgets and clip facts of a loaded document.
 * @param {import('@gltf-transform/core').Document} doc
 */
function measure(doc) {
  const root = doc.getRoot();
  let triangles = 0;
  let vertices = 0;
  let maxInfluences = 0;
  let worstWeightSum = 0;
  let maxY = -Infinity;
  let minY = Infinity;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      triangles += (idx ? idx.getCount() : pos.getCount()) / 3;
      vertices += pos.getCount();
      if (prim.getAttribute('JOINTS_1') || prim.getAttribute('WEIGHTS_1')) maxInfluences = Math.max(maxInfluences, 8);
      const w = prim.getAttribute('WEIGHTS_0');
      /** @type {number[]} */
      const el = [];
      for (let i = 0; w && i < w.getCount(); i++) {
        w.getElement(i, el);
        maxInfluences = Math.max(maxInfluences, el.filter((x) => x > 1e-4).length);
        worstWeightSum = Math.max(worstWeightSum, Math.abs(el.reduce((a, b) => a + b, 0) - 1));
      }
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, el);
        maxY = Math.max(maxY, el[1]);
        minY = Math.min(minY, el[1]);
      }
    }
  }
  const skins = root.listSkins();
  /** @type {Record<string, { durationSec: number, channels: number, keys: number, loopError: number }>} */
  const clips = {};
  for (const anim of root.listAnimations()) {
    let duration = 0;
    let keys = 0;
    let loopError = 0;
    for (const ch of anim.listChannels()) {
      const s = ch.getSampler();
      const input = s?.getInput();
      const output = s?.getOutput();
      if (!input || !output) continue;
      const n = input.getCount();
      keys = Math.max(keys, n);
      duration = Math.max(duration, input.getMax([])[0]);
      /** @type {number[]} */
      const a = [];
      /** @type {number[]} */
      const b = [];
      output.getElement(0, a);
      output.getElement(output.getCount() - 1, b);
      const sign = ch.getTargetPath() === 'rotation' && a.reduce((acc, x, i) => acc + x * b[i], 0) < 0 ? -1 : 1;
      loopError = Math.max(loopError, ...a.map((x, i) => Math.abs(x - sign * b[i])));
    }
    clips[anim.getName()] = { durationSec: duration, channels: anim.listChannels().length, keys, loopError };
  }
  return {
    triangles,
    vertices,
    joints: skins.length ? skins[0].listJoints().length : 0,
    maxInfluences,
    worstWeightSumError: worstWeightSum,
    heightM: maxY - minY,
    materials: root.listMaterials().map((m) => m.getName()),
    clips,
    extensionsUsed: root.listExtensionsUsed().map((e) => e.extensionName),
    /** @type {number} */ bytes: 0,
    /** @type {number} */ rawBytes: 0,
    /** @type {Record<string, unknown>[]} */ textures: [],
    file: '',
    /** @type {unknown} */ locomotion: null,
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
