// @ts-check
// WP-P0-09: every character model (assets/characters/<id>/<id>.glb: the Wage Slave, the College Student, the
// Warehouse Manager and the three zombie variants, all from tools/blender/characters with the same skeleton and clip
// set) is a well-formed skinned glTF with looping, in-place `idle`, `walk` and `run` clips, within the hero budgets
// (<= 15k triangles, <= 4 joint influences), described by assets/characters/manifest.json and shown by the renders in docs/art/characters/. The action clips: looping `work`,
// `use`, `eat`, `sit`, `attack` and `sleep`, one-shot `pickup`, `hit` and `death` (in place; sleep and death's end
// lie on the back along Z, head toward -Z, face up).
//
// Every check runs every time: a missing file or module fails the test (docs/wp/README.md, no conditional passes).
// The decoded checks read the file through glTF-Transform and meshoptimizer; the motion checks play it in three.js
// (GLTFLoader, meshopt decoder, AnimationMixer, CPU skinning of the shoe soles).
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveObjectURL } from 'node:buffer';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder as ThreeMeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { checkAssetManifest } from '../src/contracts/assets.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Skin bands: the living (ART.md §7.2's light band) and the dead (darker, desaturated grey-green). */
const LIVING = { albedo: /** @type {[number, number]} */ ([0.3, 0.4]), hsvS: /** @type {[number, number]} */ ([0.35, 0.5]) };
const DEAD = { albedo: /** @type {[number, number]} */ ([0.15, 0.3]), hsvS: /** @type {[number, number]} */ ([0.05, 0.35]), green: true };
/**
 * The character models and what each is checked against beyond the shared checks: the garment regions whose baked
 * albedo sits in ART.md §7.2's clothing band (0.10-0.30), and the skin's albedo and saturation band (the living: the
 * light band; the dead: a darker, desaturated grey-green), and its atlas sizes where they differ from the Wage Slave's
 * (skin 512, cloth 1024, hair 256: the ponytail's cards and the big zombie's skin need more texels at 512 px/m).
 * @typedef {{ id: string, glb: string, garments: string[], skin: { albedo: [number, number], hsvS: [number, number], green?: boolean }, atlas: { skin: number, cloth: number, hair: number } }} CharacterSpec
 * @type {CharacterSpec[]}
 */
const CHARACTERS = [
  { id: 'wage', garments: ['hoodie', 'jeans'], skin: LIVING },
  { id: 'college', garments: ['hoodie', 'jeans', 'backpack'], skin: LIVING, atlas: { hair: 512 } },
  { id: 'manager', garments: ['vest', 'jacket', 'shirt', 'trousers'], skin: LIVING },
  { id: 'zombie_a', garments: ['shirt', 'trousers'], skin: DEAD },
  { id: 'zombie_b', garments: ['overalls'], skin: DEAD },
  { id: 'zombie_big', garments: ['tee', 'jeans'], skin: DEAD, atlas: { skin: 1024 } },
].map((c) => ({ ...c, atlas: { skin: 512, cloth: 1024, hair: 256, ...c.atlas }, glb: join(ROOT, `assets/characters/${c.id}/${c.id}.glb`) }));
const MANIFEST = join(ROOT, 'assets/characters/manifest.json');
const LOCK = join(ROOT, 'assets/sources.lock.json');
/** The package whose entries in LOCK the character's sources must be. */
const WP = 'WP-P0-09';
const RENDERS = join(ROOT, 'docs/art/characters');
const MAX_TRIANGLES = 15000;
const MAX_INFLUENCES = 4;
/** The locomotion clips (idle, walk, run). */
const CLIPS = ['idle', 'walk', 'run'];
/** The action clips: looping ones and one-shots (played once, held on the last frame). */
const ACTION_LOOPS = ['work', 'use', 'eat', 'sit', 'attack', 'sleep'];
const ONE_SHOTS = ['pickup', 'hit', 'death'];
const LOOPS = [...CLIPS, ...ACTION_LOOPS];
const ALL_CLIPS = [...LOOPS, ...ONE_SHOTS];
/** Clips whose feet stay planted on the floor (both soles pinned) for the whole clip. */
const PLANTED = ['work', 'use', 'eat', 'sit', 'attack', 'pickup', 'hit'];
/** Duration bounds (s) of the action clips. */
const ACTION_DURATION = { work: [2, 6], use: [1.5, 6], eat: [2, 6], sit: [1.5, 6], attack: [0.8, 2], sleep: [2, 8], pickup: [0.8, 1.6], hit: [0.3, 0.8], death: [1.5, 2.5] };
const REQUIRED = ['EXT_meshopt_compression', 'KHR_mesh_quantization', 'KHR_texture_basisu'];
const KTX2_ID = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
const RENDER_FILES = ['wage_turntable.jpg', 'wage_closeup.jpg', 'wage_three_day_60.png', 'wage_three_day_50.png', 'wage_three_dusk_60.png',
  'wage_three_dusk_50.png', 'wage_board.png', 'wage_walk_strip.png', 'wage_run_strip.png'];

/**
 * @typedef {{ json: any, bin: Buffer }} Glb
 * @param {string} path
 * @returns {Glb}
 */
function readGlb(path) {
  const buf = readFileSync(path);
  if (buf.subarray(0, 24).toString('latin1').startsWith('version https://git-lfs')) throw new Error(`${path} is a git LFS pointer: run git lfs pull`);
  assert.equal(buf.readUInt32LE(0), 0x46546c67, 'glTF magic');
  assert.equal(buf.readUInt32LE(4), 2, 'container version 2');
  assert.equal(buf.readUInt32LE(8), buf.length, 'declared length is the file length');
  const jsonLen = buf.readUInt32LE(12);
  assert.equal(buf.readUInt32LE(16), 0x4e4f534a, 'first chunk is JSON');
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const at = 20 + jsonLen;
  assert.equal(buf.readUInt32LE(at + 4), 0x004e4942, 'second chunk is BIN');
  return { json, bin: buf.subarray(at + 8, at + 8 + buf.readUInt32LE(at)) };
}

/** @param {CharacterSpec} c @returns {number} the character's standing height (m, the manifest's meta.heightM) */
const standingHeight = (c) => JSON.parse(readFileSync(MANIFEST, 'utf8')).assets.find((/** @type {any} */ a) => a.id === `characters/${c.id}`).meta.heightM;

/** @type {Map<string, Glb>} */
const glbCache = new Map();
/** @param {CharacterSpec} c */
const glbOf = (c) => {
  if (!glbCache.has(c.id)) glbCache.set(c.id, readGlb(c.glb));
  return /** @type {Glb} */ (glbCache.get(c.id));
};

/** @param {any} j @param {number} i */
const accessor = (j, i) => {
  const a = j.accessors[i];
  assert.ok(a, `accessor ${i} exists`);
  return a;
};

/** @type {Map<string, Promise<any>>} */
const threeCache = new Map();
/**
 * The glb loaded by three.js's GLTFLoader with the meshopt decoder; KTX2 images go through a stand-in for KTX2Loader
 * (no GPU in Node) that checks the container and hands back a compressed texture of its size.
 * @param {CharacterSpec} c
 * @returns {Promise<{ gltf: any, ktx: { width: number, height: number, levels: number }[] }>}
 */
function loadThree(c) {
  if (!threeCache.has(c.id)) threeCache.set(c.id, (async () => {
    await ThreeMeshoptDecoder.ready;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(ThreeMeshoptDecoder);
    /** @type {{ width: number, height: number, levels: number }[]} */
    const ktx = [];
    const ktx2 = {
      /** @param {string} url @param {(t: any) => void} onLoad @param {unknown} _p @param {(e: unknown) => void} onError */
      load(url, onLoad, _p, onError) {
        const blob = resolveObjectURL(url);
        if (!blob) return onError(new Error(`no blob for ${url}`));
        blob.arrayBuffer().then((ab) => {
          const b = new Uint8Array(ab);
          if (!KTX2_ID.every((x, i) => b[i] === x)) return onError(new Error('not a KTX2 file'));
          const dv = new DataView(ab);
          const info = { width: dv.getUint32(20, true), height: dv.getUint32(24, true), levels: dv.getUint32(40, true) };
          ktx.push(info);
          onLoad(new THREE.CompressedTexture([], info.width, info.height));
        }, onError);
      },
    };
    loader.setKTX2Loader(/** @type {any} */ (ktx2));
    const data = readFileSync(c.glb);
    // GLTFLoader reads embedded images through self.URL.createObjectURL (Node has URL, not self)
    const g = /** @type {any} */ (globalThis);
    const hadSelf = 'self' in g;
    if (!hadSelf) g.self = globalThis;
    try {
      const gltf = await loader.parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
      return { gltf, ktx };
    } finally {
      if (!hadSelf) delete g.self;
    }
  })());
  return /** @type {Promise<any>} */ (threeCache.get(c.id));
}

for (const C of CHARACTERS) {
  test(`${C.id}.glb is a well-formed glTF 2.0 binary: buffers, views, meshopt streams and required KTX2 images in range`, () => {
    const { json: j, bin } = glbOf(C);
    assert.equal(j.asset.version, '2.0');
    assert.deepEqual([...(j.extensionsRequired || [])].sort(), REQUIRED, 'meshopt, quantization and KTX2 are required (the renderer must decode them)');
    const real = j.buffers.map((/** @type {any} */ b) => !b.extensions?.EXT_meshopt_compression?.fallback);
    assert.deepEqual(real.map((/** @type {boolean} */ r, /** @type {number} */ i) => r && i), [0, ...real.slice(1).map(() => false)], 'the only real buffer is the BIN chunk');
    assert.ok(j.buffers[0].byteLength <= bin.length, 'buffer 0 fits in the BIN chunk');
    j.bufferViews.forEach((/** @type {any} */ v, /** @type {number} */ i) => {
      assert.ok((v.byteOffset ?? 0) + v.byteLength <= j.buffers[v.buffer].byteLength, `bufferView ${i} inside buffer ${v.buffer}`);
      const m = v.extensions?.EXT_meshopt_compression;
      if (m) {
        assert.ok(real[m.buffer], `bufferView ${i}: compressed stream reads a real buffer`);
        assert.ok((m.byteOffset ?? 0) + m.byteLength <= j.buffers[m.buffer].byteLength, `bufferView ${i}: compressed stream in range`);
        assert.ok(['ATTRIBUTES', 'TRIANGLES', 'INDICES'].includes(m.mode) && m.count > 0 && m.byteStride > 0, `bufferView ${i}: meshopt mode/count/stride`);
        assert.ok(m.count * m.byteStride <= v.byteLength, `bufferView ${i}: decoded size fits the view`);
      } else {
        assert.ok(real[v.buffer], `bufferView ${i} without meshopt reads real data`);
      }
    });
    j.accessors.forEach((/** @type {any} */ a, /** @type {number} */ i) => {
      assert.ok(a.count > 0, `accessor ${i} has elements`);
      if (a.bufferView !== undefined) assert.ok(j.bufferViews[a.bufferView], `accessor ${i} view exists`);
    });
    assert.equal(j.images.length, 9, 'color, normal and ORM atlases for skin, cloth and hair');
    for (const img of j.images) {
      assert.equal(img.mimeType, 'image/ktx2', `${img.name} is KTX2`);
      const v = j.bufferViews[img.bufferView];
      assert.deepEqual([...bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + 12)], KTX2_ID, `${img.name} starts with the KTX2 identifier`);
    }
    for (const tex of j.textures) {
      assert.ok(j.images[tex.extensions?.KHR_texture_basisu?.source], 'texture has a KTX2 source');
      assert.equal(tex.source, undefined, 'no PNG fallback: KTX2 only');
    }
    for (const m of j.materials) {
      assert.equal(m.pbrMetallicRoughness.metallicFactor, 0, `${m.name}: dielectric (metallicFactor 0)`);
    }
  });

  test(`${C.id}.glb holds the hero budgets: at most 15k triangles, 4 joint influences, 512 px/m atlases`, () => {
    const { json: j, bin } = glbOf(C);
    assert.equal(j.skins.length, 1, 'one skin');
    const joints = j.skins[0].joints.length;
    let triangles = 0;
    for (const mesh of j.meshes) {
      for (const p of mesh.primitives) {
        assert.ok(p.mode === undefined || p.mode === 4, 'triangle lists');
        triangles += accessor(j, p.indices).count / 3;
        assert.ok(p.attributes.JOINTS_0 !== undefined && p.attributes.WEIGHTS_0 !== undefined, 'every primitive is skinned');
        assert.equal(p.attributes.JOINTS_1, undefined, 'no second joint set (more than 4 influences)');
        assert.equal(p.attributes.WEIGHTS_1, undefined, 'no second weight set (more than 4 influences)');
      }
    }
    assert.ok(triangles > 5000, `${triangles} triangles: a full character`);
    assert.ok(triangles <= MAX_TRIANGLES, `${triangles} triangles is within ${MAX_TRIANGLES}`);
    assert.ok(j.nodes.filter((/** @type {any} */ n) => n.mesh !== undefined).every((/** @type {any} */ n) => n.skin === 0), 'mesh nodes bind the skin');
    assert.ok(joints >= 20 && joints <= 64, `${joints} joints`);
    const names = j.skins[0].joints.map((/** @type {number} */ i) => j.nodes[i].name);
    for (const bone of ['pelvis', 'spine_01', 'neck_01', 'head', 'clavicle_l', 'upperarm_l', 'lowerarm_r', 'hand_l', 'thigh_r', 'calf_l', 'foot_r', 'ball_l']) assert.ok(names.includes(bone), `humanoid bone ${bone}`);
    // atlas sizes: ART.md §3 hero class 512 px/m, packed skin 512, cloth 1024, hair 256
    /** @type {Record<string, number>} */
    const size = {};
    for (const m of j.materials) {
      const tex = j.textures[m.pbrMetallicRoughness.baseColorTexture.index];
      const img = j.images[tex.extensions.KHR_texture_basisu.source];
      const v = j.bufferViews[img.bufferView];
      size[m.name] = bin.readUInt32LE((v.byteOffset ?? 0) + 20);
    }
    assert.deepEqual(size, { [`${C.id}_skin`]: C.atlas.skin, [`${C.id}_cloth`]: C.atlas.cloth, [`${C.id}_hair`]: C.atlas.hair });
  });

  test(`${C.id}.glb has looping, in-place idle, walk and run clips with root motion, stride and the locomotion rule`, () => {
    const { json: j } = glbOf(C);
    const joints = new Set(j.skins[0].joints);
    /** @type {Record<string, any>} */
    const byName = Object.fromEntries(j.animations.map((/** @type {any} */ a) => [a.name, a]));
    assert.deepEqual(Object.keys(byName).sort(), [...ALL_CLIPS].sort());
    for (const name of CLIPS) {
      const a = byName[name];
      assert.ok(a.channels.length >= 20, `${name} animates the body`);
      let duration = 0;
      for (const ch of a.channels) {
        assert.ok(joints.has(ch.target.node), `${name}: channels target joints`);
        const input = accessor(j, a.samplers[ch.sampler].input);
        assert.equal(input.min[0], 0, `${name} starts at 0`);
        duration = Math.max(duration, input.max[0]);
      }
      assert.equal(a.extras?.loop, true, `${name} is marked looping`);
      const rm = a.extras?.rootMotion;
      assert.deepEqual(rm.forward, [0, 0, 1], 'root motion runs along +Z (the character faces +Z)');
      assert.ok(a.extras.loopContinuity.ratio <= 2, `${name}: angular acceleration across the wrap ${a.extras.loopContinuity.ratio}x the typical (build report)`);
      if (name === 'idle') {
        assert.ok(duration >= 4 && duration <= 8, `idle loop ${duration} s is within 4-8 s`);
        assert.equal(rm.speedMps, 0, 'idle stays put');
      } else {
        assert.equal(rm.mode, 'extract');
        assert.ok(Math.abs(rm.distanceM - rm.speedMps * duration) < 0.02, `${name}: distance per loop = speed x duration`);
        assert.ok(Math.abs(a.extras.stride.strideM - rm.distanceM) < 1e-3 && Math.abs(a.extras.stride.cycleSec - duration) < 1e-3, `${name}: stride = one loop`);
      }
      if (name === 'walk') {
        assert.ok(duration >= 0.8 && duration <= 1.6, `walk cycle ${duration} s`);
        assert.ok(rm.speedMps > 0.9 && rm.speedMps < 1.8, `walk speed ${rm.speedMps} m/s`);
      }
      if (name === 'run') {
        assert.ok(duration >= 0.5 && duration <= 0.9, `run cycle ${duration} s`);
        assert.ok(rm.speedMps >= 5 / 1.35 && rm.speedMps <= 5 / 0.75, `run speed ${rm.speedMps} m/s: the sim's 5 m/s plays it inside 0.75-1.35x`);
      }
    }
    const loco = j.extras.locomotion;
    assert.equal(loco.moveClip, 'run');
    assert.equal(loco.idleClip, 'idle');
    assert.equal(loco.simSpeedMps, 5);
    assert.deepEqual(loco.speedMultipliers, { encumbered: 0.7, caffeine: 1.25 });
    assert.deepEqual(loco.rateClamp, [0.75, 1.35]);
    assert.equal(loco.crossfadeSec, 0.2);
    assert.equal(loco.clipSpeedMps, byName.run.extras.rootMotion.speedMps);
    for (const [k, v] of Object.entries(loco.ratesAt)) {
      const raw = v.simSpeedMps / loco.clipSpeedMps;
      assert.ok(Math.abs(v.rate - Math.min(1.35, Math.max(0.75, raw))) < 1e-3, `${k}: rate = clamp(sim speed / clip speed)`);
    }
    assert.equal(loco.ratesAt.normal.clamped, false, `the sim's 5 m/s plays the run at ${loco.ratesAt.normal.rate}x, inside the clamp`);
  });

  test(`the character manifest describes ${C.id}.glb and its locked sources, and passes the asset contract`, () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    assert.deepEqual(checkAssetManifest(manifest, { exists: (/** @type {string} */ p) => existsSync(join(ROOT, p)) }), []);
    const entry = manifest.assets.find((/** @type {any} */ a) => a.id === `characters/${C.id}`);
    assert.ok(entry, `entry characters/${C.id}`);
    assert.equal(entry.kind, 'character');
    assert.equal(entry.path, `assets/characters/${C.id}/${C.id}.glb`);
    const { json: j } = glbOf(C);
    const triangles = j.meshes.flatMap((/** @type {any} */ m) => m.primitives).reduce((/** @type {number} */ s, /** @type {any} */ p) => s + accessor(j, p.indices).count / 3, 0);
    assert.equal(entry.meta.triangles, triangles, 'meta.triangles is measured');
    assert.equal(entry.meta.bones, j.skins[0].joints.length, 'meta.bones is measured');
    assert.ok(entry.meta.maxInfluences <= MAX_INFLUENCES);
    assert.deepEqual(Object.keys(entry.meta.clips).sort(), [...ALL_CLIPS].sort());
    for (const name of ALL_CLIPS) {
      const c = entry.meta.clips[name];
      assert.equal(c.loop, !ONE_SHOTS.includes(name), `meta.clips.${name}.loop`);
      assert.match(c.source, /^CMU \d+_\d{2}$/, `meta.clips.${name}.source names the CMU trial`);
      assert.ok(entry.sources.includes(`cmu/${c.source.slice(4).split('_')[0].padStart(2, '0')}`), `${name}: its CMU subject is a locked source`);
      assert.ok(c.pose && typeof c.pose.end.lying === 'boolean', `meta.clips.${name}.pose describes the end frame`);
    }
    assert.ok(Math.abs(entry.meta.clips.sit.pose.seatHeightM - 0.44) <= 0.02, `sit: seat height ${entry.meta.clips.sit.pose.seatHeightM} m (chairs and sofas, 0.44 m)`);
    assert.equal(entry.meta.sizeBytes, statSync(C.glb).size, 'meta.sizeBytes is the shipped file');
    assert.equal(entry.digests[entry.path], createHash('sha256').update(readFileSync(C.glb)).digest('hex'), 'digests hold the shipped file\'s SHA-256');
    assert.deepEqual(entry.meta.locomotion, j.extras.locomotion, 'the manifest publishes the glb\'s locomotion data');
    assert.match(entry.params.renderer[`${C.id}_hair`], /alphaToCoverage/, 'the hair cards carry the alphaToCoverage recommendation');
    for (const [k, v] of Object.entries(entry.meta.texelDensity)) if (typeof v === 'number') assert.ok(Math.abs(v - 512) <= 51, `${k} atlas at 512 px/m ±10% (${v})`);
    const recipe = manifest.rebuild[entry.rebuild];
    assert.ok(recipe, `rebuild recipe '${entry.rebuild}' is in the manifest`);
    assert.ok(existsSync(join(ROOT, recipe.entry)), `recipe entry ${recipe.entry} exists`);
    assert.ok(Number.isInteger(recipe.cycles.seed), 'the Cycles bakes have a fixed seed');
    const lock = JSON.parse(readFileSync(LOCK, 'utf8'));
    const locked = new Map(lock.sources.filter((/** @type {any} */ s) => s.wp === WP).map((/** @type {any} */ s) => [s.id, s]));
    for (const id of entry.sources) {
      const s = locked.get(id);
      assert.ok(s, `source ${id} is in assets/sources.lock.json under wp ${WP}`);
      assert.ok(['CC0-1.0', 'LicenseRef-CMU-Mocap'].includes(s.license), `${id}: allowed license ${s.license}`);
      for (const f of s.files) assert.match(f.sha256, /^[0-9a-f]{64}$/, `${id}/${f.path} pinned by SHA-256`);
    }
    // albedo calibration (ART.md §7.2): garments in the clothing band, skin in the light band, nothing outside the hard limits
    const al = entry.meta.albedo;
    for (const k of C.garments) assert.ok(al[k] && al[k].after >= 0.1 && al[k].after <= 0.3, `${k} albedo ${al[k]?.after} in the clothing band 0.10-0.30`);
    const [lo, hi] = C.skin.albedo;
    const [slo, shi] = C.skin.hsvS;
    assert.ok(al.skin.after >= lo && al.skin.after <= hi && al.skin.hsvS >= slo && al.skin.hsvS <= shi, `skin albedo ${al.skin.after} in ${lo}-${hi}, S ${al.skin.hsvS} in ${slo}-${shi}`);
    if (C.skin.green) assert.ok(al.skin.meanSRGB[1] > al.skin.meanSRGB[0] && al.skin.meanSRGB[1] > al.skin.meanSRGB[2], `the dead's skin is grey-green (mean sRGB ${al.skin.meanSRGB})`);
    for (const [k, v] of Object.entries(al)) assert.ok(/** @type {any} */ (v).p005 >= 0.0129 && /** @type {any} */ (v).p995 <= 0.9, `${k}: texels within linear 0.013-0.90`);
  });

  test(`${C.id}: decoded: weights normalised within 4 influences, every looping clip closes its loop, standing height 1.6-1.85 m`, async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    const doc = await io.read(C.glb);
    const root = doc.getRoot();
    const skin = root.listSkins()[0];
    const nJoints = skin.listJoints().length;
    /** @type {number[]} */
    const w = [];
    /** @type {number[]} */
    const jn = [];
    /** @type {number[]} */
    const v = [];
    let minY = Infinity;
    let maxY = -Infinity;
    // bind pose: every joint's world matrix times its inverse bind matrix is the same (dequantizing) transform
    const ibm = skin.getInverseBindMatrices();
    assert.ok(ibm, 'inverse bind matrices');
    /** @type {number[]} */
    const m = [];
    ibm.getElement(0, m);
    const bind = mul(worldMatrix(skin.listJoints()[0]), m);
    for (const prim of root.listMeshes().flatMap((mesh) => mesh.listPrimitives())) {
      const weights = prim.getAttribute('WEIGHTS_0');
      const jointsAttr = prim.getAttribute('JOINTS_0');
      const pos = prim.getAttribute('POSITION');
      assert.ok(weights && jointsAttr && pos);
      for (let i = 0; i < weights.getCount(); i++) {
        weights.getElement(i, w);
        jointsAttr.getElement(i, jn);
        const sum = w.reduce((a, b) => a + b, 0);
        assert.ok(Math.abs(sum - 1) < 0.02, `vertex ${i}: weights sum to 1 (${sum})`);
        assert.ok(w.filter((x) => x > 1e-3).length <= MAX_INFLUENCES);
        jn.forEach((k, c) => assert.ok(w[c] === 0 || k < nJoints, 'joint index in range'));
        pos.getElement(i, v);
        const y = bind[1] * v[0] + bind[5] * v[1] + bind[9] * v[2] + bind[13];
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    assert.ok(maxY - minY > 1.6 && maxY - minY < 1.85, `standing height ${(maxY - minY).toFixed(3)} m`);
    assert.ok(Math.abs(minY) < 0.03, `soles on the ground (lowest point ${minY.toFixed(3)} m)`);
    const names = root.listAnimations().map((a) => a.getName());
    assert.deepEqual([...names].sort(), [...ALL_CLIPS].sort());
    for (const anim of root.listAnimations()) {
      // one-shots play once and hold their last frame: they have no loop to close (their own checks are below)
      if (ONE_SHOTS.includes(anim.getName())) continue;
      for (const ch of anim.listChannels()) {
        const out = ch.getSampler()?.getOutput();
        assert.ok(out);
        /** @type {number[]} */
        const a = [];
        /** @type {number[]} */
        const b = [];
        out.getElement(0, a);
        out.getElement(out.getCount() - 1, b);
        const s = ch.getTargetPath() === 'rotation' && a.reduce((acc, x, i) => acc + x * b[i], 0) < 0 ? -1 : 1;
        const err = Math.max(...a.map((x, i) => Math.abs(x - s * b[i])));
        assert.ok(err < 2e-3, `${anim.getName()} ${ch.getTargetNode()?.getName()}.${ch.getTargetPath()}: last key repeats the first (${err})`);
        if (ch.getTargetNode()?.getName() === 'pelvis' && ch.getTargetPath() === 'translation') {
          /** @type {number[]} */
          const e = [];
          let lo = Infinity;
          let hi = -Infinity;
          for (let i = 0; i < out.getCount(); i++) {
            out.getElement(i, e);
            lo = Math.min(lo, e[2]);
            hi = Math.max(hi, e[2]);
          }
          assert.ok(hi - lo < 0.2, `${anim.getName()}: the pelvis sways but does not travel (${(hi - lo).toFixed(3)} m along the path)`);
        }
      }
    }
  });

  test(`${C.id}: loads in three.js: GLTFLoader with the meshopt decoder builds the skinned meshes and plays every clip`, async () => {
    const { gltf, ktx } = await loadThree(C);
    /** @type {any[]} */
    const skinned = [];
    gltf.scene.traverse((/** @type {any} */ o) => o.isSkinnedMesh && skinned.push(o));
    assert.equal(skinned.length, 3, 'skin, cloth and hair primitives');
    const bones = skinned[0].skeleton.bones;
    assert.ok(bones.length >= 20);
    let tris = 0;
    for (const s of skinned) {
      tris += s.geometry.index.count / 3;
      assert.equal(s.geometry.getAttribute('skinIndex').itemSize, 4);
      assert.ok(s.material.map?.isCompressedTexture && s.material.normalMap && s.material.roughnessMap, `${s.material.name}: baked maps`);
      assert.equal(s.material.metalness, 0, `${s.material.name}: metalness 0`);
    }
    assert.ok(tris <= MAX_TRIANGLES);
    assert.ok(ktx.length === 9 && ktx.every((s) => s.width >= 256 && s.levels > 1), 'mipmapped atlases');
    const clips = Object.fromEntries(gltf.animations.map((/** @type {any} */ c) => [c.name, c]));
    const mixer = new THREE.AnimationMixer(gltf.scene);
    assert.ok(clips.run.userData.rootMotion.speedMps > 0, 'the run speed reaches three.js as clip.userData.rootMotion');
    for (const name of ALL_CLIPS) {
      const thigh = gltf.scene.getObjectByName('thigh_l');
      const rest = thigh.quaternion.clone();
      const action = mixer.clipAction(clips[name]).play();
      mixer.update(clips[name].duration * 0.37);
      assert.ok(thigh.quaternion.angleTo(rest) > 1e-3, `${name} moves the thigh`);
      action.stop();
    }
  });

  /**
   * Local rotations of every joint sampled through three.js at `fps` over one loop of a clip.
   * @param {any} gltf @param {string} name @param {number} fps
   * @returns {{ q: THREE.Quaternion[][], n: number }}  q[bone][k], k = 0..n-1 (the loop without its repeated end)
   */
  function sampleRotations(gltf, name, fps) {
    const clip = gltf.animations.find((/** @type {any} */ c) => c.name === name);
    const mixer = new THREE.AnimationMixer(gltf.scene);
    const action = mixer.clipAction(clip).play();
    const bones = /** @type {any[]} */ ([]);
    gltf.scene.traverse((/** @type {any} */ o) => o.isBone && bones.push(o));
    const n = Math.round(clip.duration * fps);
    const q = bones.map(() => /** @type {THREE.Quaternion[]} */ ([]));
    for (let k = 0; k < n; k++) {
      action.time = (k / n) * clip.duration;
      mixer.update(0);
      bones.forEach((b, i) => q[i].push(b.quaternion.clone()));
    }
    action.stop();
    mixer.uncacheRoot(gltf.scene);
    return { q, n };
  }

  test(`${C.id}: loops are seamless: across every clip's wrap, each bone's angular acceleration stays within 2x its own typical value`, async () => {
    const { gltf } = await loadThree(C);
    const fps = 30;
    // bones that barely move get a floor of 1 rad/s² as their typical value (1 rad/s² is 0.06°/frame² at 30 fps)
    const floor = 1;
    for (const name of LOOPS) {
      const { q, n } = sampleRotations(gltf, name, fps);
      const bones = /** @type {any[]} */ ([]);
      gltf.scene.traverse((/** @type {any} */ o) => o.isBone && bones.push(o));
      q.forEach((seq, b) => {
        // acc[k] = |w(k+1) - w(k)| * fps, w = angular velocity between keys; acc[n - 1] compares the velocity into the
        // loop point with the velocity out of it
        /** @type {THREE.Vector3[]} */
        const w = [];
        for (let k = 0; k < n; k++) {
          const d = seq[(k + 1) % n].clone().multiply(seq[k].clone().invert());
          if (d.w < 0) d.set(-d.x, -d.y, -d.z, -d.w);
          const ang = 2 * Math.acos(Math.min(1, d.w));
          const s = Math.hypot(d.x, d.y, d.z) || 1;
          w.push(new THREE.Vector3(d.x / s, d.y / s, d.z / s).multiplyScalar(ang * fps));
        }
        const acc = w.map((wk, k) => w[(k + 1) % n].clone().sub(wk).length() * fps);
        const typical = Math.max(floor, [...acc].sort((a, c) => a - c)[Math.floor(n / 2)]);
        const wrap = acc[n - 1];
        assert.ok(wrap <= 2 * typical, `${name} ${bones[b].name}: ${wrap.toFixed(1)} rad/s² across the wrap vs its typical ${typical.toFixed(1)} (${(wrap / typical).toFixed(2)}x)`);
      });
    }
  });

  test(`${C.id}: planted feet stay put: every shoe-sole vertex stays on or above the floor, and planted soles barely slide`, async () => {
    const { gltf } = await loadThree(C);
    /** @type {any[]} */
    const meshes = [];
    gltf.scene.traverse((/** @type {any} */ o) => o.isSkinnedMesh && meshes.push(o));
    const cloth = meshes.find((m) => m.material.name === `${C.id}_cloth`);
    assert.ok(cloth, 'the cloth primitive (the shoes)');
    const bones = cloth.skeleton.bones.map((/** @type {any} */ b) => b.name);
    const footBones = new Set(['foot_l', 'ball_l', 'foot_r', 'ball_r'].map((n) => bones.indexOf(n)));
    gltf.scene.updateMatrixWorld(true);
    cloth.skeleton.update();
    // sole vertices: bound mostly to a foot and within 3 cm of the lowest shoe vertex at rest (the sole and its sidewall)
    const idx = cloth.geometry.getAttribute('skinIndex');
    const wgt = cloth.geometry.getAttribute('skinWeight');
    const v = new THREE.Vector3();
    const cand = [];
    let lowest = Infinity;
    for (let i = 0; i < idx.count; i++) {
      let wf = 0;
      for (let c = 0; c < 4; c++) if (footBones.has(idx.getComponent(i, c))) wf += wgt.getComponent(i, c);
      if (wf < 0.5) continue;
      cloth.getVertexPosition(i, v).applyMatrix4(cloth.matrixWorld);
      cand.push({ i, y: v.y });
      lowest = Math.min(lowest, v.y);
    }
    const sole = cand.filter((c) => c.y < lowest + 0.03).map((c) => ({ ...c, side: (() => { cloth.getVertexPosition(c.i, v).applyMatrix4(cloth.matrixWorld); return v.x > 0 ? 'l' : 'r'; })() }));
    assert.ok(sole.length > 100, `${sole.length} sole vertices`);
    const fps = 60;
    // per clip: median / 90th-percentile slide speed of planted sole vertices, and the largest slide over one planted
    // stretch (a step) of any sole vertex
    const limits = { idle: { median: 0.02, p90: 0.05, step: 0.005 }, walk: { median: 0.08, p90: 0.25, step: 0.02 }, run: { median: 0.15, p90: 0.4, step: 0.02 } };
    for (const name of CLIPS) {
      const clip = gltf.animations.find((/** @type {any} */ c) => c.name === name);
      const speed = clip.userData.rootMotion.speedMps;
      const mixer = new THREE.AnimationMixer(gltf.scene);
      const action = mixer.clipAction(clip).play();
      const n = Math.round(clip.duration * fps);
      /** @type {number[][][]} */
      const track = sole.map(() => []);
      let minY = Infinity;
      // two loops, so steps that cross the wrap are whole
      for (let k = 0; k <= 2 * n; k++) {
        const t = (k / n) * clip.duration;
        action.time = t % clip.duration;
        mixer.update(0);
        gltf.scene.updateMatrixWorld(true);
        cloth.skeleton.update();
        sole.forEach((s, j) => {
          cloth.getVertexPosition(s.i, v).applyMatrix4(cloth.matrixWorld);
          // the clip plays in place: the character travels along +Z at the root-motion speed
          track[j].push([v.x, v.y, v.z + speed * t]);
          minY = Math.min(minY, v.y);
        });
      }
      action.stop();
      mixer.uncacheRoot(gltf.scene);
      // the floor is y = 0: no sole vertex below it, and each foot's lowest sole vertex comes within 2 mm of it (no
      // hovering: contact shadows would show a gap)
      assert.ok(minY >= -0.0002, `${name}: no sole vertex below the floor (lowest ${minY.toFixed(4)} m; bind pose ${lowest.toFixed(4)} m)`);
      for (const sd of ['l', 'r']) {
        let footMin = Infinity;
        sole.forEach((s0, j) => { if (s0.side === sd) for (const p of track[j]) footMin = Math.min(footMin, p[1]); });
        assert.ok(footMin <= 0.002, `${name}: the ${sd} foot comes within 2 mm of the floor (closest ${(footMin * 1000).toFixed(2)} mm)`);
      }
      // planted: within 3 mm of the floor
      const planted = 0.003;
      const speeds = [];
      let worstStep = 0;
      for (const tr of track) {
        let s0 = -1;
        for (let k = 0; k <= 2 * n; k++) {
          const on = tr[k][1] < planted;
          if (on && k < 2 * n && tr[k + 1][1] < planted) speeds.push(Math.hypot(tr[k + 1][0] - tr[k][0], tr[k + 1][2] - tr[k][2]) * fps);
          if (on && s0 < 0) s0 = k;
          if ((!on || k === 2 * n) && s0 >= 0) {
            const e = on ? k : k - 1;
            if (s0 > 0 && on === false) worstStep = Math.max(worstStep, Math.hypot(tr[e][0] - tr[s0][0], tr[e][2] - tr[s0][2]));
            s0 = -1;
          }
        }
      }
      speeds.sort((a, b) => a - b);
      const median = speeds[Math.floor(speeds.length / 2)];
      const p90 = speeds[Math.floor(speeds.length * 0.9)];
      assert.ok(speeds.length > 20, `${name}: planted sole samples (${speeds.length})`);
      const limit = limits[/** @type {'idle' | 'walk' | 'run'} */ (name)];
      assert.ok(median <= limit.median, `${name}: planted soles slide ${median.toFixed(3)} m/s (median), limit ${limit.median}`);
      assert.ok(p90 <= limit.p90, `${name}: planted soles slide ${p90.toFixed(3)} m/s (90th percentile), limit ${limit.p90}`);
      assert.ok(worstStep <= limit.step, `${name}: a sole vertex slides ${(worstStep * 100).toFixed(2)} cm over one planted stretch, limit ${limit.step * 100} cm`);
    }
  });

  test(`${C.id}: nothing hangs behind the head: cloth more than 8 cm behind the neck stays within 2 cm above the neck joint`, async () => {
    // the hood lies flat on the upper back and the shoulders stay down: in the leaning run, a hood standing off the
    // nape, a shrugged far shoulder or a high backswing would show behind the head at the game camera's pitch
    const { gltf } = await loadThree(C);
    /** @type {any[]} */
    const meshes = [];
    gltf.scene.traverse((/** @type {any} */ o) => o.isSkinnedMesh && meshes.push(o));
    const cloth = meshes.find((m) => m.material.name === `${C.id}_cloth`);
    const neck = gltf.scene.getObjectByName('neck_01');
    const v = new THREE.Vector3();
    const n0 = new THREE.Vector3();
    const count = cloth.geometry.getAttribute('position').count;
    for (const name of CLIPS) {
      const clip = gltf.animations.find((/** @type {any} */ c) => c.name === name);
      const mixer = new THREE.AnimationMixer(gltf.scene);
      const action = mixer.clipAction(clip).play();
      const n = Math.round(clip.duration * 30);
      let top = -Infinity;
      for (let k = 0; k < n; k++) {
        action.time = (k / n) * clip.duration;
        mixer.update(0);
        gltf.scene.updateMatrixWorld(true);
        cloth.skeleton.update();
        neck.getWorldPosition(n0);
        // the character faces +Z: behind the neck is z below the neck joint's
        for (let i = 0; i < count; i++) {
          cloth.getVertexPosition(i, v).applyMatrix4(cloth.matrixWorld);
          if (v.z < n0.z - 0.08) top = Math.max(top, v.y - n0.y);
        }
      }
      action.stop();
      mixer.uncacheRoot(gltf.scene);
      assert.ok(top <= 0.02, `${name}: cloth behind the head reaches ${(top * 100).toFixed(1)} cm above the neck joint`);
    }
  });

  test(`${C.id}: the idle stands relaxed: knees at most 10 degrees bent, ankles hip width apart (±4 cm)`, async () => {
    const { gltf } = await loadThree(C);
    const clip = gltf.animations.find((/** @type {any} */ c) => c.name === 'idle');
    const mixer = new THREE.AnimationMixer(gltf.scene);
    const action = mixer.clipAction(clip).play();
    const at = (/** @type {string} */ n) => gltf.scene.getObjectByName(n).getWorldPosition(new THREE.Vector3());
    gltf.scene.updateMatrixWorld(true);
    let worstKnee = 0;
    let spacingLo = Infinity;
    let spacingHi = -Infinity;
    let hipW = 0;
    const n = Math.round(clip.duration * 30);
    for (let k = 0; k < n; k++) {
      action.time = (k / n) * clip.duration;
      mixer.update(0);
      gltf.scene.updateMatrixWorld(true);
      for (const s of ['l', 'r']) {
        const hip = at(`thigh_${s}`);
        const knee = at(`calf_${s}`);
        const ankle = at(`foot_${s}`);
        worstKnee = Math.max(worstKnee, THREE.MathUtils.radToDeg(knee.clone().sub(hip).angleTo(ankle.clone().sub(knee))));
      }
      const d = at('foot_l').sub(at('foot_r'));
      const spacing = Math.hypot(d.x, d.z);
      spacingLo = Math.min(spacingLo, spacing);
      spacingHi = Math.max(spacingHi, spacing);
      const h = at('thigh_l').sub(at('thigh_r'));
      hipW = Math.max(hipW, Math.hypot(h.x, h.z));
    }
    action.stop();
    mixer.uncacheRoot(gltf.scene);
    assert.ok(worstKnee <= 10, `knees bend at most ${worstKnee.toFixed(1)}° through the idle`);
    assert.ok(spacingLo >= hipW - 0.04 && spacingHi <= hipW + 0.04, `ankles ${spacingLo.toFixed(3)}-${spacingHi.toFixed(3)} m apart, hips ${hipW.toFixed(3)} m`);
  });

  test(`${C.id}: action clips: loops and one-shots with sane durations, in place, from CMU captures, with the pose facts the renderer needs`, () => {
    const { json: j } = glbOf(C);
    /** @type {Record<string, any>} */
    const byName = Object.fromEntries(j.animations.map((/** @type {any} */ a) => [a.name, a]));
    for (const name of [...ACTION_LOOPS, ...ONE_SHOTS]) {
      const a = byName[name];
      assert.ok(a, `clip ${name}`);
      assert.ok(a.channels.length >= 20, `${name} animates the body`);
      let duration = 0;
      for (const ch of a.channels) {
        const input = accessor(j, a.samplers[ch.sampler].input);
        assert.equal(input.min[0], 0, `${name} starts at 0`);
        duration = Math.max(duration, input.max[0]);
      }
      const [lo, hi] = ACTION_DURATION[/** @type {keyof typeof ACTION_DURATION} */ (name)];
      assert.ok(duration >= lo && duration <= hi, `${name}: ${duration.toFixed(2)} s is within ${lo}-${hi} s`);
      const x = a.extras;
      assert.equal(x.loop, ACTION_LOOPS.includes(name), `${name} is ${ACTION_LOOPS.includes(name) ? '' : 'not '}marked looping`);
      assert.equal(x.kind, name === 'sleep' ? 'hold' : ACTION_LOOPS.includes(name) ? 'loop' : 'oneShot', `${name}: kind ${x.kind}`);
      assert.match(x.source, /^CMU \d+_\d{2}$/, `${name}: source ${x.source}`);
      assert.ok(typeof x.use === 'string' && x.use.length > 5, `${name}: says what the game plays it for`);
      assert.deepEqual(x.rootMotion.forward, [0, 0, 1], `${name}: +Z forward`);
      assert.equal(x.rootMotion.speedMps, 0, `${name} plays in place (no root motion to apply)`);
      if (x.loop) assert.ok(x.loopContinuity.ratio <= 2, `${name}: angular acceleration across the wrap ${x.loopContinuity.ratio}x the typical (build report)`);
      assert.ok(Math.abs(x.pose.start.pelvisM[0]) < 0.05 && Math.abs(x.pose.start.pelvisM[2]) < 0.1, `${name}: starts with the pelvis over the origin (${x.pose.start.pelvisM})`);
    }
    // lying: sleep throughout and the end of death, on the back along the clip's Z axis, head toward -Z, face up
    for (const [name, frame] of [['sleep', 'start'], ['sleep', 'end'], ['death', 'end']]) {
      const p = byName[name].extras.pose[frame];
      assert.equal(p.lying, true, `${name} ${frame} lies`);
      assert.ok(p.headDir[2] < -0.9, `${name} ${frame}: head toward -Z (${p.headDir})`);
      assert.ok(p.faceDir[1] > 0.7, `${name} ${frame}: face up (${p.faceDir})`);
      assert.ok(p.pelvisM[1] < 0.3, `${name} ${frame}: pelvis ${p.pelvisM[1]} m above the floor`);
    }
    assert.equal(byName.death.extras.pose.start.lying, false, 'death starts standing');
    assert.ok(byName.death.extras.pose.start.headM[1] > 1.4, 'death starts with the head at standing height');
    for (const name of ['work', 'use', 'eat', 'sit', 'attack', 'pickup', 'hit']) assert.equal(byName[name].extras.pose.end.lying, false, `${name} does not lie`);
  });

  /**
   * World-space positions of every skinned vertex at time t of a clip, and of a few joints.
   * @param {any} gltf @param {any} mixer @param {any} action @param {number} t
   */
  function skinnedAt(gltf, mixer, action, t) {
    action.time = t;
    mixer.update(0);
    gltf.scene.updateMatrixWorld(true);
    /** @type {any[]} */
    const meshes = [];
    gltf.scene.traverse((/** @type {any} */ o) => o.isSkinnedMesh && meshes.push(o));
    let minY = Infinity;
    let maxY = -Infinity;
    const v = new THREE.Vector3();
    for (const m of meshes) {
      m.skeleton.update();
      const count = m.geometry.getAttribute('position').count;
      for (let i = 0; i < count; i++) {
        m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld);
        minY = Math.min(minY, v.y);
        maxY = Math.max(maxY, v.y);
      }
    }
    const at = (/** @type {string} */ n) => gltf.scene.getObjectByName(n).getWorldPosition(new THREE.Vector3());
    return { minY, maxY, head: at('head'), pelvis: at('pelvis'), footL: at('foot_l'), footR: at('foot_r') };
  }

  test(`${C.id}: action clips in three.js: nothing sinks through the floor, planted feet stay put, sleep and death lie on the back along Z`, async () => {
    const { gltf } = await loadThree(C);
    const fps = 15;
    for (const name of [...ACTION_LOOPS, ...ONE_SHOTS]) {
      const clip = gltf.animations.find((/** @type {any} */ c) => c.name === name);
      const mixer = new THREE.AnimationMixer(gltf.scene);
      const action = mixer.clipAction(clip).play();
      const n = Math.max(2, Math.round(clip.duration * fps));
      let lowest = Infinity;
      let highest = -Infinity;
      /** @type {THREE.Vector3[][]} */
      const feet = [[], []];
      /** @type {any} */
      let first = null;
      /** @type {any} */
      let last = null;
      for (let k = 0; k <= n; k++) {
        const s = skinnedAt(gltf, mixer, action, Math.min(clip.duration, (k / n) * clip.duration));
        lowest = Math.min(lowest, s.minY);
        highest = Math.max(highest, s.maxY);
        feet[0].push(s.footL);
        feet[1].push(s.footR);
        if (k === 0) first = s;
        last = s;
      }
      action.stop();
      mixer.uncacheRoot(gltf.scene);
      // the soles rest on y = 0; hands or the back may brush the floor, never more than 1.5 cm into it
      assert.ok(lowest >= -0.015, `${name}: lowest vertex ${lowest.toFixed(4)} m (nothing sinks through the floor)`);
      assert.ok(lowest <= 0.01, `${name}: the body rests on the floor (lowest vertex ${lowest.toFixed(4)} m)`);
      if (PLANTED.includes(name)) {
        for (const f of feet) {
          const drift = Math.max(...f.map((p) => Math.hypot(p.x - f[0].x, p.z - f[0].z)));
          assert.ok(drift <= 0.01, `${name}: a planted ankle moves ${(drift * 100).toFixed(2)} cm over the clip`);
        }
      }
      if (name === 'sleep' || name === 'death') {
        const s = /** @type {any} */ (last);
        assert.ok(s.maxY < 0.55, `${name}: lying at the end (top of the body ${s.maxY.toFixed(2)} m)`);
        assert.ok(s.head.z < s.pelvis.z - 0.4, `${name}: head toward -Z (head z ${s.head.z.toFixed(2)}, pelvis z ${s.pelvis.z.toFixed(2)})`);
        assert.ok(Math.abs(s.pelvis.x) < 0.15 && Math.abs(s.pelvis.z) < 0.25, `${name}: pelvis near the origin (${s.pelvis.x.toFixed(2)}, ${s.pelvis.z.toFixed(2)})`);
      }
      // standing: the top of the body at 1.6 m, or 97 % of a shorter character's standing height (the College Student)
      if (name === 'death') assert.ok(/** @type {any} */ (first).maxY > Math.min(1.6, 0.97 * standingHeight(C)), `death starts standing (top ${first.maxY.toFixed(2)} m)`);
      if (name === 'sit') {
        const s = /** @type {any} */ (first);
        assert.ok(s.pelvis.y > 0.5 && s.pelvis.y < 0.7, `sit: pelvis ${s.pelvis.y.toFixed(2)} m (seated at 0.44 m)`);
        assert.ok(s.footL.z > s.pelvis.z + 0.2 && s.footR.z > s.pelvis.z + 0.2, 'sit: the feet are ahead of the seat');
      }
      if (['work', 'use', 'eat', 'attack'].includes(name)) assert.ok(highest > 1.3, `${name}: standing or bent over, not lying (top ${highest.toFixed(2)} m)`);
    }
  });
}

test('renders: look-dev, three.js game views under the ART.md rigs, the side-by-side board, strips and the motion capture', () => {
  for (const f of RENDER_FILES) {
    const b = readFileSync(join(RENDERS, f));
    assert.ok(b.length > 20_000, `${f} is a real image`);
    const size = f.endsWith('.png') ? [b.readUInt32BE(16), b.readUInt32BE(20)] : jpegSize(b);
    assert.ok(size[0] >= 480 && size[1] >= 200, `${f} is ${size.join('x')}`);
  }
  for (const f of ['wage_three_day_60.png', 'wage_three_day_50.png', 'wage_three_dusk_60.png', 'wage_three_dusk_50.png']) {
    const b = readFileSync(join(RENDERS, f));
    assert.deepEqual([b.readUInt32BE(16), b.readUInt32BE(20)], [1920, 1080], `${f} is a full 1080p frame`);
  }
  const mp4 = readFileSync(join(RENDERS, 'wage_motion_50.mp4'));
  assert.equal(mp4.subarray(4, 8).toString('latin1'), 'ftyp', 'the motion capture is an MP4');
  assert.ok(mp4.length > 100_000, 'the motion capture holds real frames');
  const measure = JSON.parse(readFileSync(join(RENDERS, 'wage_three_measure.json'), 'utf8'));
  assert.deepEqual([...measure.extensionsRequired].sort(), REQUIRED, 'the renders load the shipped, KTX2-requiring file');
  for (const [k, s] of Object.entries(measure.stills)) {
    const st = /** @type {any} */ (s);
    assert.ok(Math.abs(st.card.read - st.card.want) <= 5, `${k}: the 0.18 card reads ${st.card.read}, ART.md ${st.card.want} ±5`);
    assert.ok(st.fov === 60 || st.fov === 50, `${k}: the game's zoomed-out / zoomed-in FOV`);
    if (st.rig === 'day') {
      // the source's hair reads darker than the hoodie in every frame (t069 51 vs 58)
      for (const [hair, hoodie] of [['hair', 'hoodie'], ['hairBack', 'hoodieBack']]) {
        assert.ok(st.samples[hair].lum <= 0.85 * st.samples[hoodie].lum, `${k}: ${hair} ${st.samples[hair].lum} is at most 0.85x ${hoodie} ${st.samples[hoodie].lum}`);
      }
    }
  }
});

test('every character has its look-dev renders (turntable and close-up, render.py) in docs/art/characters', () => {
  for (const C of CHARACTERS) {
    for (const f of [`${C.id}_turntable.jpg`, `${C.id}_closeup.jpg`]) {
      const b = readFileSync(join(RENDERS, f));
      assert.ok(b.length > 20_000, `${f} is a real image`);
      const size = jpegSize(b);
      assert.ok(size[0] >= 480 && size[1] >= 200, `${f} is ${size.join('x')}`);
    }
  }
});

test('the 3D renderer draws every model: the playable characters, both zombie variants (picked by id, stable) and the big one', async () => {
  const { MODELS, modelFor } = await import('../src/render3d/actors.js');
  const { CHARACTER_ORDER } = await import('../src/content/characters.js');
  assert.deepEqual([...MODELS].sort(), CHARACTERS.map((c) => c.id).sort(), 'the renderer loads exactly the shipped character models');
  const players = CHARACTER_ORDER.map((ch) => modelFor('player', { character: ch }));
  assert.deepEqual(players, ['wage', 'college', 'manager'], 'wage, student and warehouse draw their own models');
  assert.equal(modelFor('player', {}), 'wage', 'a view without the character falls back to the Wage Slave');
  assert.equal(modelFor('big', { id: 'z3' }), 'zombie_big');
  const picks = Array.from({ length: 40 }, (_, i) => modelFor('zombie', { id: `z${i}` }));
  assert.deepEqual(new Set(picks), new Set(['zombie_a', 'zombie_b']), 'ordinary zombies spread over both variants');
  assert.deepEqual(Array.from({ length: 40 }, (_, i) => modelFor('zombie', { id: `z${i}` })), picks, 'a zombie keeps its variant (hashed from its id)');
  assert.equal(modelFor('npc', {}), 'wage');
  assert.equal(modelFor('raider', { id: 'r1' }), 'wage');
});

/** @param {Buffer} b @returns {[number, number]} */
function jpegSize(b) {
  assert.equal(b.readUInt16BE(0), 0xffd8, 'JPEG');
  let i = 2;
  while (i < b.length) {
    const marker = b.readUInt16BE(i);
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xffc0 && marker <= 0xffc3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  throw new Error('no JPEG frame header');
}

/**
 * World matrix (column-major) of a glTF-Transform node.
 * @param {any} node
 * @returns {number[]}
 */
function worldMatrix(node) {
  /** @type {number[]} */
  let m = node.getMatrix();
  for (let p = node.getParentNode(); p; p = p.getParentNode()) m = mul(p.getMatrix(), m);
  return m;
}

/** @param {number[]} a @param {number[]} b column-major 4x4 */
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
