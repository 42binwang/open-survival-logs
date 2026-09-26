// @ts-check
// Characters: each figure draws its own model from assets/characters (the character pipeline, WP-P0-09): the
// survivor the model of the playable character (the view's `character`: wage, college, manager), zombies one of the
// zombie variants picked by their sim id (big ones the big variant). Neighbours and raiders, and any figure whose own
// model is still loading or failed, are tinted clones of the Wage Slave. Every model shares the skeleton and the clip
// set, so the clips, the zombie posture and the procedural poses work on all of them. Clips play in place (the
// manifest's root-motion convention): the actor moves by the view's positions and the playback rate follows its
// speed. Before any model has loaded, a simple stand-in is drawn.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { cyl, mesh } from './geom.js';
import { CELL, cellAt } from '../contracts/view.js';
import { instanceSeed } from '../contracts/assets.js';
import { nextFloat, seedRng } from '../engine/rng.js';

/** The character models (assets/characters/manifest.json ids); the first is the fallback every kind can tint. */
export const MODELS = ['wage', 'college', 'manager', 'zombie_a', 'zombie_b', 'zombie_big'];
const FALLBACK = 'wage';
/** @param {string} id */
const modelUrl = (id) => `assets/characters/${id}/${id}.glb`;
/** The playable characters' models (src/content/characters.js ids). */
const CHARACTER_MODEL = /** @type {Record<string, string>} */ ({ wage: 'wage', student: 'college', warehouse: 'manager' });
/** The ordinary zombies' variants (the big kind has its own). */
const ZOMBIE_MODELS = ['zombie_a', 'zombie_b'];

/**
 * The model a figure draws: the survivor's playable character, a zombie variant picked by the zombie's sim id (a stable
 * hash, so a zombie keeps its look), the big variant for big zombies, and the Wage Slave (tinted) for the rest.
 * @param {string} kind  entity kind
 * @param {{ character?: string, id?: string | number }} [e]
 * @param {number} [fallbackSeed]  picks the variant of a zombie without an id
 */
export function modelFor(kind, e = {}, fallbackSeed = 0) {
  if (kind === 'player') return CHARACTER_MODEL[e.character || ''] || FALLBACK;
  if (kind === 'big') return 'zombie_big';
  if (kind === 'zombie') return ZOMBIE_MODELS[(e.id != null ? instanceSeed(e.id, 'zombie') : fallbackSeed >>> 0) % ZOMBIE_MODELS.length];
  return FALLBACK;
}
const WALK_MPS = 1.18;
const RUN_MPS = 4.42;

/** Clothes of the dead: faded work and street colours. */
const ZOMBIE_CLOTH = ['#5f6352', '#6b5a4a', '#4f5a66', '#7a7466'];

/** Tints per kind: skin and cloth multipliers (linear), size. */
const KIND = {
  player: { skin: null, cloth: null, hair: null, scale: 1 },
  npc: { skin: '#ffe0cc', cloth: '#9fb3c9', hair: '#6b4a2f', scale: 0.96 },
  raider: { skin: '#e8c8b0', cloth: '#5a4a3a', hair: '#222222', scale: 1.02 },
  zombie: { skin: '#9fae8f', cloth: '#6f6457', hair: '#3a3a30', scale: 1 },
  big: { skin: '#8f9c80', cloth: '#51483f', hair: '#2a2a22', scale: 1.32 },
};
/**
 * Scale of a figure drawn with its own model: the big variant is a heavy labourer's build at a normal height (its clips
 * are foot-locked for that body), drawn larger so it looms over the others.
 */
const OWN_SCALE = /** @type {Record<string, number>} */ ({ big: 1.18 });

/**
 * @typedef {object} Actor
 * @property {THREE.Object3D} root
 * @property {THREE.AnimationMixer | null} mixer
 * @property {Record<string, THREE.AnimationAction>} actions
 * @property {string} clip
 * @property {THREE.Vector3} pos
 * @property {THREE.Vector3} last
 * @property {number} yaw
 * @property {number} speed  smoothed m/s
 * @property {string} kind
 * @property {string} want  the model this figure should draw (modelFor)
 * @property {string} modelId  the model it draws now ('' for the stand-in; the fallback while its own loads)
 * @property {string | number} [id]  the sim's id of the figure, when the view gives one
 * @property {boolean} model  a model instance (not a stand-in)
 * @property {THREE.Sprite | null} bar
 * @property {number} phase
 * @property {number} [hp]  last seen hit points
 * @property {number} [maxHp]
 * @property {number} [hitAt]  when it last lost hit points (seconds)
 * @property {number} [diedAt]
 * @property {string} [posture]
 */

/**
 * The zombie posture on top of the walk: hunched, head hung and tilted, arms reaching forward, a lurch in the step.
 * Applied after the mixer each frame, as small rotations of the animated bones.
 * @param {Record<string, THREE.Bone>} b
 * @param {number} t
 * @param {number} speed
 */
function zombiePose(b, t, speed) {
  let top = /** @type {THREE.Object3D} */ (b.pelvis);
  if (!top) return;
  while (top.parent && top.parent.name !== 'actors') top = top.parent;
  top.getWorldQuaternion(_tq);
  const right = _right.set(1, 0, 0).applyQuaternion(_tq);
  const fwd = _fwd.set(0, 0, 1).applyQuaternion(_tq);
  const sway = Math.sin(t * 2.1) * 0.08;
  const reach = 1.2 + Math.min(1, speed) * 0.1;
  rotateWorld(b.spine_01, right, 0.2);
  rotateWorld(b.spine_02, right, 0.15);
  rotateWorld(b.neck_01, right, 0.25);
  rotateWorld(b.head, fwd, 0.3 + sway);
  rotateWorld(b.upperarm_l, right, reach + Math.sin(t * 1.7) * 0.08);
  rotateWorld(b.upperarm_r, right, reach - 0.1 + Math.sin(t * 1.7 + 1) * 0.08);
}

/** A visual capture (tools/visual/capture.mjs) poses figures from the clock alone, so a shot repeats. */
const CAPTURE = !!(/** @type {any} */ (globalThis).__visualCapture);

/** Clips that play once and hold their last frame (the rest loop). */
const ONE_SHOT = new Set(['pickup', 'hit', 'death']);

/** @param {THREE.AnimationMixer} mixer @param {THREE.AnimationClip[]} clips */
function actionsFor(mixer, clips) {
  /** @type {Record<string, THREE.AnimationAction>} */
  const out = {};
  for (const clip of clips) {
    const act = mixer.clipAction(clip);
    if (ONE_SHOT.has(clip.name)) {
      act.setLoop(THREE.LoopOnce, 1);
      act.clampWhenFinished = true;
    }
    out[clip.name] = act;
  }
  return out;
}

/**
 * The posture for the survivor's current action kind (src/sim/actions.js kinds): the clip names the character asset
 * provides (or will): work (crouched, hands low), use (hands at counter height), eat, sit, sleep, pickup.
 * @param {string} kind
 */
export function postureFor(kind) {
  const k = String(kind || '');
  if (/sleep|nap|bed/.test(k)) return 'sleep';
  if (/eat|drink|meal|snack/.test(k)) return 'eat';
  if (/sit|relax|tv|record|music|read|study|rest|phone|game/.test(k)) return 'sit';
  if (/cook|craft|wash|brew|press|workbench|use|mix|fill|pour/.test(k)) return 'use';
  if (/pick|take|grab|collect/.test(k)) return 'pickup';
  return 'work';
}

/**
 * A pose built from bone rotations where the model has no clip for the posture yet (world-space turns about the
 * character's own axes, on top of the idle clip).
 * @param {Actor} a
 * @param {string} posture
 * @param {number} t
 */
function procedural(a, posture, t) {
  const b = a.root.userData.bones || (a.root.userData.bones = boneMap(a.root));
  a.root.getWorldQuaternion(_tq);
  const right = _right.set(1, 0, 0).applyQuaternion(_tq);
  const leg = (/** @type {number} */ th) => {
    // thighs forward and calves back by the same angle: the hips drop by (thigh + calf)(1 − cos θ)
    rotateWorld(b.thigh_l, right, th);
    rotateWorld(b.thigh_r, right, th);
    rotateWorld(b.calf_l, right, -2 * th);
    rotateWorld(b.calf_r, right, -2 * th);
    a.root.position.y -= 0.88 * (1 - Math.cos(th));
  };
  const s = Math.sin(t * 5);
  switch (posture) {
    case 'work':
      leg(0.95);
      rotateWorld(b.spine_01, right, 0.45);
      rotateWorld(b.upperarm_l, right, 0.9 + s * 0.12);
      rotateWorld(b.upperarm_r, right, 0.9 - s * 0.12);
      break;
    case 'pickup':
      leg(0.7);
      rotateWorld(b.spine_01, right, 0.6);
      rotateWorld(b.upperarm_l, right, 0.8);
      rotateWorld(b.upperarm_r, right, 0.8);
      break;
    case 'use':
      rotateWorld(b.spine_01, right, 0.12);
      rotateWorld(b.upperarm_l, right, 0.55 + s * 0.08);
      rotateWorld(b.upperarm_r, right, 0.55 - s * 0.08);
      rotateWorld(b.lowerarm_l, right, 0.9);
      rotateWorld(b.lowerarm_r, right, 0.9);
      break;
    case 'eat':
      rotateWorld(b.upperarm_r, right, 0.5);
      rotateWorld(b.lowerarm_r, right, 1.7 + Math.max(0, Math.sin(t * 2.4)) * 0.4);
      break;
    case 'sit':
      rotateWorld(b.thigh_l, right, Math.PI / 2);
      rotateWorld(b.thigh_r, right, Math.PI / 2);
      rotateWorld(b.calf_l, right, -Math.PI / 2);
      rotateWorld(b.calf_r, right, -Math.PI / 2);
      a.root.position.y -= 0.42;
      break;
    case 'attack': {
      // zombies already reach forward (zombiePose): the attack adds the clawing swing and a lunge
      const swing = Math.sin(t * 7);
      const base = a.root.userData.zombieBones ? -0.15 : 1.1;
      rotateWorld(b.spine_01, right, 0.2 + Math.max(0, swing) * 0.2);
      rotateWorld(b.upperarm_l, right, base + swing * 0.4);
      rotateWorld(b.upperarm_r, right, base - swing * 0.4);
      break;
    }
    default:
  }
}

/** A flinch: the upper body thrown back and recovering. @param {Actor} a @param {number} f  0 … 1 through it */
function flinch(a, f) {
  const b = a.root.userData.bones || (a.root.userData.bones = boneMap(a.root));
  a.root.getWorldQuaternion(_tq);
  const right = _right.set(1, 0, 0).applyQuaternion(_tq);
  rotateWorld(b.spine_02, right, -0.45 * Math.sin(f * Math.PI));
}

/** @param {THREE.Object3D} root @returns {Record<string, THREE.Bone>} */
function boneMap(root) {
  /** @type {Record<string, THREE.Bone>} */
  const out = {};
  root.traverse((o) => {
    if (/** @type {THREE.Bone} */ (o).isBone) out[o.name] = /** @type {THREE.Bone} */ (o);
  });
  return out;
}

const _tq = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _q = new THREE.Quaternion();
const _right = new THREE.Vector3();
const _fwd = new THREE.Vector3();

/**
 * Rotates a bone about an axis given in world space (the rig's bone-local axes differ bone by bone).
 * @param {THREE.Bone | undefined} bone
 * @param {THREE.Vector3} axis
 * @param {number} angle
 */
function rotateWorld(bone, axis, angle) {
  if (!bone || !bone.parent) return;
  bone.parent.updateWorldMatrix(true, false);
  bone.parent.getWorldQuaternion(_pq);
  _q.setFromAxisAngle(axis, angle);
  bone.quaternion.premultiply(_pq.clone().invert().multiply(_q).multiply(_pq));
  bone.updateMatrixWorld(true);
}

/**
 * Grime and dried blood on a zombie's clothes and skin: object-space value noise darkens the albedo and stains it a
 * brownish red where the noise runs high.
 * @param {THREE.MeshStandardMaterial} m
 * @param {number} amount  0 … 1
 */
function stains(m, amount) {
  if (amount <= 0) return;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.zAmount = { value: amount };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 zPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nzPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 zPos;
uniform float zAmount;
float zHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float zNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(zHash(i + vec3(0,0,0)), zHash(i + vec3(1,0,0)), f.x), mix(zHash(i + vec3(0,1,0)), zHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(zHash(i + vec3(0,0,1)), zHash(i + vec3(1,0,1)), f.x), mix(zHash(i + vec3(0,1,1)), zHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  float n = zNoise(zPos * 9.0) * 0.6 + zNoise(zPos * 23.0) * 0.4;
  float grime = smoothstep(0.35, 0.75, n) * zAmount;
  diffuseColor.rgb *= 1.0 - 0.45 * grime;
  float blood = smoothstep(0.68, 0.8, zNoise(zPos * 6.0 + 3.1)) * zAmount;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22, 0.03, 0.02), blood * 0.85);
}`,
      );
  };
  m.customProgramCacheKey = () => `zombie-stains-${amount}`;
}

export class ActorLayer {
  /** The zombie posture (replaceable for look checks from the console). */
  static pose = zombiePose;

  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {import('./materials.js').MaterialLibrary} lib
   */
  constructor(renderer, lib) {
    this.lib = lib;
    this.group = new THREE.Group();
    this.group.name = 'actors';
    /** @type {import('./furniture.js').FurnitureLayer | null} the beds and seats the lying and sitting clips go on */
    this.furniture = null;
    /** @type {((x: number, z: number, pool: boolean) => void) | null} a hit (a splat) or a death (a pool) at a point */
    this.onBlood = null;
    /** @type {Actor[]} */
    this.actors = [];
    /** @type {Actor[]} figures killed this scene, falling and lying a while */
    this.corpses = [];
    /** @type {Map<string, { scene: THREE.Object3D, clips: THREE.AnimationClip[] }>} loaded models by id */
    this.models = new Map();
    /** @type {Map<string, Map<THREE.Material, THREE.Material>>} */
    this.tinted = new Map();
    /** phases and variants of figures the view gives no id (deterministic, src/engine/rng.js) */
    this.rng = seedRng(0x5eed);
    const loader = new GLTFLoader();
    loader.setKTX2Loader(lib.ktx2);
    loader.setMeshoptDecoder(MeshoptDecoder);
    // the fallback loads first and the scene is ready with it; the other models follow one after another (in
    // parallel they shared the bandwidth, and the fallback, and the texture transcoder queued behind them, arrived
    // last). Each figure switches to its own model as soon as it arrives (the fallback clone until then)
    /** @param {string} id */
    const load = (id) =>
      loader
        .loadAsync(modelUrl(id))
        .then((gltf) => {
          gltf.scene.traverse((o) => {
            const m = /** @type {THREE.Mesh} */ (o);
            if (m.isMesh) {
              m.castShadow = true;
              m.receiveShadow = true;
              m.frustumCulled = false;
              const mat = /** @type {THREE.MeshStandardMaterial} */ (m.material);
              if (mat.name.endsWith('_hair')) {
                mat.alphaTest = 0.35;
                mat.alphaToCoverage = true;
              }
            }
          });
          this.models.set(id, { scene: gltf.scene, clips: gltf.animations });
          for (const a of this.actors) if (a.modelId !== a.want) this.#upgrade(a);
        })
        .catch((err) => console.warn(`character model ${id} failed to load; ${id === FALLBACK ? 'using stand-ins' : 'using the tinted fallback'}`, err));
    this.ready = load(FALLBACK);
    this.ready.then(() => MODELS.filter((id) => id !== FALLBACK).reduce((chain, id) => chain.then(() => load(id)), Promise.resolve()));
  }

  /** The first loaded model (kept for callers that ask whether any model is in). */
  get model() {
    return this.models.get(FALLBACK) || null;
  }

  /** @param {string} kind */
  #materialsFor(kind) {
    let map = this.tinted.get(kind);
    if (!map) {
      map = new Map();
      this.tinted.set(kind, map);
    }
    return map;
  }

  /**
   * A model instance for a figure: its own model when loaded, else a tinted clone of the fallback, else null.
   * @param {string} kind @param {string} want @param {number} seed  the figure's variation seed
   * @returns {{ root: THREE.Object3D, id: string, clips: THREE.AnimationClip[] } | null}
   */
  #instance(kind, want, seed) {
    const own = this.models.get(want);
    const src = own || this.models.get(FALLBACK);
    if (!src) return null;
    const id = own ? want : FALLBACK;
    const root = SkeletonUtils.clone(src.scene);
    const undead = kind === 'zombie' || kind === 'big';
    // a figure with a model of its own wears it as built; the rest are the survivor, tinted and scaled per kind
    const t = KIND[/** @type {keyof typeof KIND} */ (kind)] || KIND.npc;
    const tinted = !(own && want !== FALLBACK) && kind !== 'player';
    if (tinted) {
      const variant = undead ? seed % ZOMBIE_CLOTH.length : 0;
      const cache = this.#materialsFor(`${kind}:${variant}`);
      root.traverse((o) => {
        const m = /** @type {THREE.Mesh} */ (o);
        if (!m.isMesh) return;
        const srcMat = /** @type {THREE.MeshStandardMaterial} */ (m.material);
        const tint = srcMat.name.includes('skin') ? t.skin : srcMat.name.includes('hair') ? t.hair : t.cloth;
        if (!tint) return;
        let mat = cache.get(srcMat);
        if (!mat) {
          const c = /** @type {THREE.MeshStandardMaterial} */ (srcMat.clone());
          c.color.multiply(new THREE.Color(tint));
          if (undead && !srcMat.name.includes('skin') && !srcMat.name.includes('hair')) {
            // the survivor's charcoal hoodie is too dark to tint: dull, stained clothes of their own
            c.map = null;
            c.color.set(ZOMBIE_CLOTH[variant]);
          }
          if (undead) {
            c.roughness = Math.min(1, c.roughness + 0.1);
            stains(c, srcMat.name.includes('hair') ? 0 : srcMat.name.includes('skin') ? 0.55 : 1);
          }
          cache.set(srcMat, c);
          mat = c;
        }
        m.material = mat;
      });
      root.scale.setScalar(t.scale);
    } else root.scale.setScalar(OWN_SCALE[kind] ?? 1);
    if (undead) {
      /** @type {Record<string, THREE.Bone>} */
      const bones = {};
      root.traverse((o) => {
        if (/** @type {THREE.Bone} */ (o).isBone) bones[o.name] = /** @type {THREE.Bone} */ (o);
      });
      root.userData.zombieBones = bones;
      root.userData.lurch = ((seed >>> 8) % 6283) / 1000;
    }
    root.userData.model = id;
    return { root, id, clips: src.clips };
  }

  /** @param {string} kind */
  #standIn(kind) {
    const g = new THREE.Group();
    const col = { player: '#3b3f45', zombie: '#6f7a5f', big: '#5f684f', npc: '#8aa0b8', raider: '#5a4a3a' }[kind] || '#777777';
    const body = mesh(cyl(0.18, 0.2, 1.3, 14), this.lib.get(col), 0, 0, 0);
    const head = mesh(new THREE.SphereGeometry(0.13, 16, 12), this.lib.get('#d9b99a'), 0, 1.45, 0);
    g.add(body, head);
    if (kind === 'big') g.scale.setScalar(1.3);
    return g;
  }

  /** The figure's variation seed: its sim id hashed, else a draw fixed at spawn. @param {Actor} a */
  #seed(a) {
    return a.id != null ? instanceSeed(a.id, 'actor') : /** @type {number} */ (a.root.userData.seed ?? 0);
  }

  /** Swaps a figure to the best model available for it (its own, else the fallback). @param {Actor} a */
  #upgrade(a) {
    const inst = this.#instance(a.kind, a.want, this.#seed(a));
    if (!inst || inst.id === a.modelId) return;
    const seed = a.root.userData.seed;
    this.group.remove(a.root);
    a.mixer?.stopAllAction();
    inst.root.position.copy(a.root.position);
    inst.root.rotation.copy(a.root.rotation);
    inst.root.userData.seed = seed;
    inst.root.traverse((o) => (o.userData.actor = a.kind));
    a.root = inst.root;
    a.model = true;
    a.modelId = inst.id;
    a.mixer = new THREE.AnimationMixer(inst.root);
    a.actions = actionsFor(a.mixer, inst.clips);
    a.clip = '';
    this.group.add(inst.root);
    if (a.bar) inst.root.add(a.bar);
  }

  /** @param {string} kind @param {import('../contracts/view.js').ViewEntity} e */
  #spawn(kind, e) {
    const draw = Math.floor(nextFloat(this.rng) * 0x7fffffff);
    const want = modelFor(kind, e, draw);
    const seed = e.id != null ? instanceSeed(e.id, 'actor') : draw;
    const inst = this.#instance(kind, want, seed);
    /** @type {Actor} */
    const a = {
      root: inst ? inst.root : this.#standIn(kind),
      mixer: null,
      actions: {},
      clip: '',
      pos: new THREE.Vector3(e.x + 0.5, 0, e.y + 0.5),
      last: new THREE.Vector3(e.x + 0.5, 0, e.y + 0.5),
      yaw: 0,
      speed: 0,
      kind,
      want,
      modelId: inst ? inst.id : '',
      id: e.id,
      model: !!inst,
      bar: null,
      phase: ((seed >>> 4) % 10000) / 1000,
    };
    a.root.userData.seed = draw;
    a.root.position.copy(a.pos);
    if (inst) {
      a.mixer = new THREE.AnimationMixer(inst.root);
      a.actions = actionsFor(a.mixer, inst.clips);
    }
    a.root.traverse((o) => (o.userData.actor = kind));
    this.group.add(a.root);
    return a;
  }

  /** @param {Actor} a @param {string} name @param {number} rate */
  #play(a, name, rate) {
    if (!a.mixer) return;
    const next = a.actions[name] || a.actions.idle;
    if (!next) return;
    next.timeScale = rate;
    if (a.clip === name) return;
    const prev = a.actions[a.clip];
    next.reset().setEffectiveWeight(1).play();
    // in a visual capture a change of clip is a cut: a crossfade's weights depend on the frame it began on
    if (prev && CAPTURE) prev.stop();
    else if (prev) next.crossFadeFrom(prev, 0.25, true);
    // a looping clip starts at the clock's time (plus the figure's phase), so its pose does not depend on the frame the
    // model finished loading in or the posture changed on; a one-shot plays from its start
    if (!ONE_SHOT.has(name) || !prev) next.time = ONE_SHOT.has(name) ? 0 : (performance.now() / 1000 + a.phase) % Math.max(1e-3, next.getClip().duration);
    a.clip = name;
  }

  /**
   * @param {import('../contracts/view.js').SceneView} view
   * @param {number} dt  real seconds
   * @param {number} gameDt  game seconds this frame (for speeds in the sim's clock)
   */
  update(view, dt, gameDt) {
    const ents = view.entities || [];
    const now = performance.now() / 1000;
    // match entities to actors by kind and nearest position (the view has no stable entity ids yet), so a figure keeps
    // its actor as others come and go, and one that leaves can be told apart
    /** @type {Record<string, Actor[]>} */
    const pools = {};
    for (const a of this.actors) (pools[a.kind] ||= []).push(a);
    /** @type {Map<import('../contracts/view.js').ViewEntity, Actor>} */
    const match = new Map();
    /** @type {Record<string, import('../contracts/view.js').ViewEntity[]>} */
    const byKind = {};
    for (const e of ents) (byKind[e.kind in KIND ? e.kind : 'npc'] ||= []).push(e);
    // figures the view names keep their actor by id; the rest are matched by nearest position
    const taken0 = new Set();
    for (const e of ents) {
      if (e.id == null) continue;
      const a = this.actors.find((x) => x.id === e.id && x.kind === (e.kind in KIND ? e.kind : 'npc'));
      if (a) {
        match.set(e, a);
        taken0.add(a);
      }
    }
    for (const [kind, list0] of Object.entries(byKind)) {
      const list = list0.filter((e) => !match.has(e));
      const free = (pools[kind] || []).filter((a) => !taken0.has(a) && (a.id == null || !ents.some((e) => e.id === a.id)));
      /** @type {[number, import('../contracts/view.js').ViewEntity, Actor][]} */
      const pairs = [];
      for (const e of list) for (const a of free) pairs.push([Math.hypot(a.pos.x - (e.x + 0.5), a.pos.z - (e.y + 0.5)), e, a]);
      pairs.sort((x, y) => x[0] - y[0]);
      const taken = new Set();
      for (const [d, e, a] of pairs) {
        if (match.has(e) || taken.has(a) || d > 3) continue;
        match.set(e, a);
        taken.add(a);
      }
    }
    // doors and windows a zombie can stand at and batter
    const openings = (view.furniture || []).filter((f) => !f.w || !f.h).map((f) => [f.x + 0.5, f.y + 0.5]);
    const player = ents.find((e) => e.kind === 'player');
    /** @type {Actor[]} */
    const used = [];
    for (const e of ents) {
      const kind = e.kind in KIND ? e.kind : 'npc';
      let a = match.get(e);
      if (!a) a = this.#spawn(kind, e);
      if (e.id != null && a.id !== e.id) {
        // a position match that now has a name: its look follows the name
        a.id = e.id;
        a.want = modelFor(kind, e);
      }
      if (kind === 'player' && a.want !== modelFor(kind, e)) a.want = modelFor(kind, e);
      if (a.modelId !== a.want && this.models.has(a.want)) this.#upgrade(a);
      used.push(a);
      const target = new THREE.Vector3(e.x + 0.5, 0, e.y + 0.5);
      if (a.pos.distanceTo(target) > 3) a.pos.copy(target);
      // ease toward the view position (the sim steps zombies tile by tile)
      const k = kind === 'player' ? 1 : Math.min(1, dt * 8);
      a.pos.lerp(target, k);
      const moved = a.pos.distanceTo(a.last);
      const v = dt > 0 ? moved / dt : 0;
      a.speed += (v - a.speed) * Math.min(1, dt * 10);
      if (moved > 0.002) {
        const yaw = Math.atan2(a.pos.x - a.last.x, a.pos.z - a.last.z);
        let d = yaw - a.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        a.yaw += d * Math.min(1, dt * 12);
      } else if (e.heading && e.moving) {
        a.yaw = Math.atan2(e.heading[0], e.heading[1]);
      }
      a.last.copy(a.pos);
      a.root.position.copy(a.pos);
      a.root.rotation.set(0, a.yaw, 0);
      // shadows only where the key light reaches (outside); indoors the floors above block it
      const cell = cellAt(view.floor, Math.floor(a.pos.x), Math.floor(a.pos.z));
      const outside = cell === CELL.OUTDOOR || cell === CELL.YARD || cell === CELL.VOID;
      if (a.root.userData.outside !== outside) {
        a.root.userData.outside = outside;
        a.root.traverse((o) => {
          if (/** @type {THREE.Mesh} */ (o).isMesh) o.castShadow = outside;
        });
      }
      // hit reactions when health drops
      if (e.hp != null) {
        if (a.hp != null && e.hp < a.hp) {
          a.hitAt = now;
          this.onBlood?.(a.pos.x, a.pos.z, false);
        }
        a.hp = e.hp;
        a.maxHp = e.maxHp ?? a.maxHp;
      }
      const undead = kind === 'zombie' || kind === 'big';
      const still = a.speed < 0.25;
      // what the figure is doing
      let posture = still ? 'idle' : a.speed > 2.4 ? 'run' : 'walk';
      if (e.sleeping) posture = 'sleep';
      else if (kind === 'player' && e.action?.phase === 'work') posture = postureFor(e.action.kind);
      else if (undead && still) {
        const near = (/** @type {number} */ x, /** @type {number} */ z, /** @type {number} */ r) => Math.hypot(a.pos.x - x, a.pos.z - z) < r;
        const target2 = openings.find(([x, z]) => near(x, z, 1.25)) || (player && near(player.x + 0.5, player.y + 0.5, 1.2) ? [player.x + 0.5, player.y + 0.5] : null);
        if (target2) {
          posture = 'attack';
          a.yaw = Math.atan2(target2[0] - a.pos.x, target2[1] - a.pos.z);
          a.root.rotation.set(0, a.yaw, 0);
        }
      }
      // lying and sitting clips need the furniture under them: the sleep clip lies on its back on the floor with its
      // head toward −Z, the sit clip sits 0.44 m up with its feet on the floor
      if (posture === 'sleep' && a.actions.sleep) {
        const bed = this.furniture?.rest(a.pos.x, a.pos.z, ['bed', 'sofa'], 1.6);
        if (bed) {
          const [hx, hz] = bed.head;
          a.root.position.set(bed.cx + hx * 0.1, bed.top, bed.cz + hz * 0.1);
          a.root.rotation.set(0, Math.atan2(-hx, -hz), 0);
        }
      } else if (posture === 'sit') {
        const seat = a.actions.sit ? this.furniture?.rest(a.pos.x, a.pos.z, ['chair', 'sofa', 'armchair'], 1.3) : null;
        if (seat) {
          a.root.position.set(seat.cx, THREE.MathUtils.clamp(seat.top - 0.44, -0.1, 0.15), seat.cz);
          a.root.rotation.set(0, seat.rot, 0);
        } else posture = 'idle';
      }
      a.posture = posture;
      if (posture === 'run') this.#play(a, 'run', THREE.MathUtils.clamp(a.speed / RUN_MPS, 0.5, 1.6));
      else if (posture === 'walk') this.#play(a, 'walk', THREE.MathUtils.clamp(a.speed / WALK_MPS, 0.5, 2.2) * (undead ? 0.8 : 1));
      else if (a.actions[posture]) this.#play(a, posture, 1);
      else this.#play(a, 'idle', posture === 'sleep' ? 0.2 : undead ? 0.6 : 1);
      if (!a.model) a.root.position.y = Math.abs(Math.sin(performance.now() / 150)) * Math.min(0.05, a.speed * 0.02);
      // in a visual capture the pose is a function of the clock alone (the current clip at the clock's time)
      if (CAPTURE && a.mixer && !ONE_SHOT.has(a.clip)) a.mixer.setTime(performance.now() / 1000 + a.phase);
      else a.mixer?.update(dt);
      if (a.root.userData.zombieBones) ActorLayer.pose(a.root.userData.zombieBones, now + a.root.userData.lurch, a.speed);
      // a pose where the model has no clip for the posture yet
      if (a.model && !a.actions[posture]) procedural(a, posture, now);
      if (posture === 'sleep' && !a.actions.sleep) {
        a.root.rotation.set(-Math.PI / 2, a.yaw, 0, 'YXZ');
        a.root.position.y = 0.55;
      }
      if (a.model && a.hitAt != null && now - a.hitAt < 0.45) flinch(a, (now - a.hitAt) / 0.45);
      this.#healthBar(a, e);
    }
    // figures that left: the dead fall where they stood, the rest just go
    for (const a of this.actors) {
      if (used.includes(a)) continue;
      const killed = (a.kind === 'zombie' || a.kind === 'big' || a.kind === 'raider') && a.hp != null && a.maxHp != null && a.hp < a.maxHp;
      if (killed && a.model) {
        a.diedAt = now;
        if (a.bar) a.bar.visible = false;
        if (a.actions.death) {
          const act = a.actions.death;
          act.setLoop(THREE.LoopOnce, 1);
          act.clampWhenFinished = true;
          this.#play(a, 'death', 1);
        }
        this.corpses.push(a);
        this.onBlood?.(a.pos.x, a.pos.z, true);
      } else {
        this.group.remove(a.root);
        a.mixer?.stopAllAction();
      }
    }
    // the dead: a fall (the death clip or a topple), a while on the floor, then they sink away
    this.corpses = this.corpses.filter((a) => {
      const t = now - /** @type {number} */ (a.diedAt);
      a.mixer?.update(dt);
      if (!a.actions.death) {
        const f = Math.min(1, t / 0.7);
        a.root.rotation.set((-Math.PI / 2) * f * f, a.yaw, 0, 'YXZ');
        a.root.position.y = 0.12 * f;
      }
      if (t > 6) a.root.position.y -= dt * 0.4;
      if (t > 8) {
        this.group.remove(a.root);
        a.mixer?.stopAllAction();
        return false;
      }
      return true;
    });
    this.actors = used;
    void gameDt;
  }

  /** A small hit-point bar over hurt zombies and raiders. @param {Actor} a @param {import('../contracts/view.js').ViewEntity} e */
  #healthBar(a, e) {
    const show = e.hp != null && e.maxHp && e.hp < e.maxHp && a.kind !== 'player';
    if (!show) {
      if (a.bar) a.bar.visible = false;
      return;
    }
    if (!a.bar) {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 8;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, toneMapped: false }));
      spr.scale.set(0.6, 0.075, 1);
      spr.position.y = 2.0 / (KIND[/** @type {keyof typeof KIND} */ (a.kind)]?.scale || 1);
      spr.renderOrder = 10;
      spr.userData.canvas = canvas;
      spr.userData.last = -1;
      a.bar = spr;
      a.root.add(spr);
    }
    a.bar.visible = true;
    const frac = Math.max(0, Math.min(1, /** @type {number} */ (e.hp) / /** @type {number} */ (e.maxHp)));
    if (Math.abs(a.bar.userData.last - frac) > 0.01) {
      const c = /** @type {HTMLCanvasElement} */ (a.bar.userData.canvas);
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#300';
        ctx.fillRect(0, 0, 64, 8);
        ctx.fillStyle = '#e05a4a';
        ctx.fillRect(1, 1, 62 * frac, 6);
      }
      const map = /** @type {THREE.SpriteMaterial} */ (a.bar.material).map;
      if (map) map.needsUpdate = true;
      a.bar.userData.last = frac;
    }
  }

  /** The survivor's world position (for the flashlight). */
  player() {
    return this.actors.find((a) => a.kind === 'player') || null;
  }
}
