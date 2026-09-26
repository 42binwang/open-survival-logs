// @ts-check
// Scanned prop models (assets/models/manifest.json: CC0 Poly Haven furniture, WP-P1-models). A furniture family
// that has models draws one of them, picked per piece by its seed and fitted to the piece's footprint; families whose
// look carries game state (doors, windows, crops, cooking, power) stay procedural (src/render3d/props.js). Until the
// manifest and a model have loaded, the procedural prop stands in, and the furniture layer rebuilds the piece when
// the model arrives (`version`).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const MANIFEST = 'assets/models/manifest.json';

/**
 * @typedef {object} ModelEntry
 * @property {string} id
 * @property {string} path
 * @property {string} family
 * @property {string} title
 * @property {{ min: number[], max: number[] }} bounds
 * @property {number} frontYawDeg
 */

/**
 * Which model families a prop family may draw, and how a piece's name narrows the choice.
 * @type {Record<string, (name: string, slot: number) => { family: string, ids?: string[] } | null>}
 */
const ROUTES = {
  sofa: (n) => (/懒人/.test(n) ? null : { family: 'sofa' }),
  armchair: () => ({ family: 'armchair' }),
  rack: (n) => (/衣架|晾衣|花架|红酒/.test(n) ? null : { family: 'rack', ids: ['steel_frame_shelves_01', 'steel_frame_shelves_02', 'worn_metal_rack'] }),
  bookshelf: () => ({ family: 'bookshelf' }),
  cabinet: (n) => (/保险|配电|冷|冰/.test(n) ? null : /床头|矮柜|抽屉/.test(n) ? { family: 'cabinet', ids: ['painted_wooden_nightstand', 'classicnightstand_01', 'vintage_wooden_drawer_01'] } : { family: 'cabinet' }),
  table: (n) => (/茶几/.test(n) ? { family: 'coffeetable' } : /课桌/.test(n) ? { family: 'desk', ids: ['schooldesk_01'] } : /工具|检验|医疗|器械|实验/.test(n) ? { family: 'desk', ids: ['metal_office_desk'] } : { family: 'table' }),
  desk: () => ({ family: 'desk' }),
  chair: (n) => (/凳/.test(n) ? { family: 'chair', ids: ['wooden_stool_01', 'metal_stool_02', 'painted_wooden_stool'] } : { family: 'chair' }),
  bed: () => ({ family: 'bed' }),
  tv: (n, slot) => (slot === 4 ? null : { family: 'tv' }),
  generator: (n) => (/人力/.test(n) ? null : { family: 'generator' }),
  crate: () => ({ family: 'crate' }),
  barrel: () => ({ family: 'barrel' }),
  bucket: (n) => (/垃圾/.test(n) ? { family: 'exterior', ids: ['metal_trash_can'] } : { family: 'bucket' }),
  houseplant: () => ({ family: 'plant', ids: ['potted_plant_01', 'potted_plant_02', 'potted_plant_04'] }),
  appliance: (n) =>
    /微波/.test(n) ? { family: 'appliance', ids: ['vintage_microwave'] } : /收音|对讲/.test(n) ? { family: 'appliance', ids: ['vintage_radio_transceiver', 'boombox'] } : /收银/.test(n) ? { family: 'appliance', ids: ['cashregister_01'] } : /电脑|笔记本/.test(n) ? { family: 'appliance', ids: ['classic_laptop'] } : /热水壶|水壶/.test(n) ? { family: 'appliance', ids: ['vintage_electric_kettle'] } : /音响|唱片/.test(n) ? { family: 'appliance', ids: ['boombox', 'cassette_player'] } : null,
  lamp: (n) => (/台灯/.test(n) ? { family: 'lamp', ids: ['desk_lamp_arm_01'] } : null),
  wallArt: (n) => (/飞镖/.test(n) ? { family: 'wall', ids: ['dartboard'] } : /时钟/.test(n) ? { family: 'wall', ids: ['wall_clock'] } : /画|相框|照片|海报/.test(n) ? { family: 'wall', ids: ['hanging_picture_frame_01', 'hanging_picture_frame_02', 'fancy_picture_frame_01'] } : null),
  heater: (n) => (/空调/.test(n) ? { family: 'heater', ids: ['exterior_aircon_unit'] } : /暖炉|炉/.test(n) ? { family: 'heater', ids: ['barrel_stove'] } : null),
};

/** The largest side a scanned model's texture keeps on the GPU: a prop covers 100–200 px at the game's camera. */
const MODEL_TEX_MAX = 512;
/** @type {WeakSet<THREE.Texture>} */
const shrunk = new WeakSet();

/**
 * Draws a model texture down to MODEL_TEX_MAX (uncompressed 1K scans are 5.6 MB each on the GPU; a quarter at 512).
 * Only for images the browser decoded (a JPEG or PNG fallback): the manifest's models load their KTX2, which are
 * block-compressed levels already sized for their texel density (tools/models/fetch.mjs) and cannot be redrawn.
 * @param {THREE.Texture} t
 */
function shrink(t) {
  if (shrunk.has(t) || typeof document === 'undefined' || /** @type {any} */ (t).isCompressedTexture) return;
  shrunk.add(t);
  const img = /** @type {any} */ (t.image);
  const w = img?.width || 0;
  const h = img?.height || 0;
  if (!w || !h || Math.max(w, h) <= MODEL_TEX_MAX) return;
  const k = MODEL_TEX_MAX / Math.max(w, h);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  const g = c.getContext('2d');
  if (!g) return;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, c.width, c.height);
  img.close?.();
  t.image = c;
  t.needsUpdate = true;
}

export class ModelLibrary {
  /** @param {import('./materials.js').MaterialLibrary} lib */
  constructor(lib) {
    this.loader = new GLTFLoader();
    this.loader.setKTX2Loader(lib.ktx2);
    /** @type {Map<string, ModelEntry[]>} */
    this.byFamily = new Map();
    /** @type {Map<string, ModelEntry>} */
    this.byId = new Map();
    /** @type {Map<string, Promise<THREE.Object3D | null>>} */
    this.loading = new Map();
    /** @type {Map<string, THREE.Object3D>} */
    this.loaded = new Map();
    /** Bumped whenever the manifest or a model finishes loading, so pieces waiting for it rebuild. */
    this.version = 0;
    /** The manifest has been read (or found missing): `choose` answers for good. */
    this.settled = false;
    this.ready = this.#load();
    /** Model downloads wait for this (the renderer sets it to its first-frame readiness). */
    this.gate = Promise.resolve();
  }

  async #load() {
    try {
      const res = await fetch(MANIFEST);
      if (!res.ok) return;
      const m = await res.json();
      for (const a of m.assets || []) {
        const p = a.params || {};
        if (!a.path || !p.family) continue;
        // a triangle budget per piece: the 70k–176k scans (potted plants, the vintage cabinet) cost more than a room;
        // the manifest marks them (params.skip, tools/models/models.json `runtime`)
        if (p.skip) continue;
        const b = p.boundsM || p.bounds;
        /** @type {ModelEntry} */
        const e = { id: String(a.id).replace(/^models\//, '').toLowerCase(), path: a.path, family: p.family, title: p.title || a.id, bounds: b && b.min && b.max ? b : { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] }, frontYawDeg: p.frontYawDeg || 0 };
        this.byId.set(e.id, e);
        if (!this.byFamily.has(e.family)) this.byFamily.set(e.family, []);
        this.byFamily.get(e.family)?.push(e);
      }
    } catch {
      // no model lane yet: procedural props only
    }
    this.settled = true;
    this.version++;
  }

  /**
   * The model a piece should draw, or null (procedural).
   * @param {string} fam  prop family (src/render3d/props.js)
   * @param {string} name  config name
   * @param {number} slot
   * @param {() => number} rnd
   * @returns {ModelEntry | null}
   */
  choose(fam, name, slot, rnd) {
    const route = ROUTES[fam]?.(name, slot);
    if (!route) return null;
    let list = this.byFamily.get(route.family) || [];
    if (route.ids) {
      const narrowed = route.ids.map((id) => this.byId.get(id)).filter((e) => !!e);
      if (narrowed.length) list = /** @type {ModelEntry[]} */ (narrowed);
    }
    if (!list.length) return null;
    return list[Math.floor(rnd() * list.length) % list.length];
  }

  /**
   * A fitted instance of a model, or null while it loads (the load then bumps `version`).
   * @param {ModelEntry} e
   * @param {number} W  footprint width, metres (local x)
   * @param {number} D  footprint depth, metres (local z)
   * @param {{ maxH?: number, wall?: boolean, turn?: boolean }} [o]  turn: the piece has no front (a bed, a table):
   *   turn it a quarter when that fits the footprint better
   */
  instance(e, W, D, o = {}) {
    const src = this.loaded.get(e.id);
    if (!src) {
      this.#fetch(e);
      return null;
    }
    const inner = src.clone(true);
    inner.rotation.y = THREE.MathUtils.degToRad(e.frontYawDeg);
    const holder = new THREE.Group();
    holder.add(inner);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inner);
    const size = box.getSize(new THREE.Vector3());
    if (o.turn) {
      const k0 = Math.min(W / Math.max(1e-3, size.x), D / Math.max(1e-3, size.z));
      const k90 = Math.min(W / Math.max(1e-3, size.z), D / Math.max(1e-3, size.x));
      if (k90 > k0 * 1.05) {
        inner.rotation.y += Math.PI / 2;
        holder.updateMatrixWorld(true);
        box.setFromObject(inner);
        box.getSize(size);
      }
    }
    // fit inside the footprint (never upscale small props by more than a little), keep proportions
    let k = Math.min(W / Math.max(1e-3, size.x), D / Math.max(1e-3, size.z));
    if (o.wall) k = Math.min(1.15, W / Math.max(1e-3, size.x));
    if (o.maxH) k = Math.min(k, o.maxH / Math.max(1e-3, size.y));
    k = Math.min(k, 1.25);
    inner.scale.setScalar(k);
    holder.updateMatrixWorld(true);
    const fitted = new THREE.Box3().setFromObject(inner);
    const c = fitted.getCenter(new THREE.Vector3());
    inner.position.set(-c.x, -fitted.min.y, o.wall ? -fitted.min.z : -c.z);
    return holder;
  }

  /**
   * Loads a set of models by id; resolves when all have arrived (or failed). The dressing waits on its clutter set.
   * @param {string[]} ids
   */
  async preload(ids) {
    await this.ready;
    await Promise.all(
      ids.map((id) => {
        const e = this.byId.get(id);
        if (!e) return null;
        this.#fetch(e);
        return this.loading.get(e.id);
      }),
    );
  }

  /**
   * A model at its authored size, standing on y = 0 and centred on its footprint, its front to +z; null while it
   * loads or when the id is unknown.
   * @param {string} id
   */
  natural(id) {
    const e = this.byId.get(id);
    const src = e && this.loaded.get(e.id);
    if (!e || !src) return null;
    const inner = src.clone(true);
    inner.rotation.y = THREE.MathUtils.degToRad(e.frontYawDeg);
    const holder = new THREE.Group();
    holder.add(inner);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inner);
    const c = box.getCenter(new THREE.Vector3());
    inner.position.set(-c.x, -box.min.y, -c.z);
    holder.userData.size = box.getSize(new THREE.Vector3());
    return holder;
  }

  /** @param {ModelEntry} e */
  #fetch(e) {
    if (this.loading.has(e.id)) return;
    const p = this.gate
      .then(() => this.loader.loadAsync(e.path))
      .then((gltf) => {
        gltf.scene.traverse((o) => {
          const m = /** @type {THREE.Mesh} */ (o);
          if (!m.isMesh) return;
          m.castShadow = true;
          m.receiveShadow = true;
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats) {
            const sm = /** @type {THREE.MeshStandardMaterial} */ (mat);
            for (const t of [sm.map, sm.normalMap, sm.roughnessMap, sm.metalnessMap, sm.aoMap]) {
              if (!t) continue;
              t.anisotropy = 8;
              shrink(t);
            }
            // a transmissive material (the generator's gauge glass) makes three render every opaque object a second
            // time into a transmission buffer: plain alpha glass reads the same at the game's camera distance
            const pm = /** @type {THREE.MeshPhysicalMaterial} */ (mat);
            if (pm.transmission > 0) {
              pm.transmission = 0;
              pm.transparent = true;
              pm.opacity = Math.min(pm.opacity, 0.35);
              pm.depthWrite = false;
            }
          }
        });
        this.loaded.set(e.id, gltf.scene);
        this.version++;
        return gltf.scene;
      })
      .catch((err) => {
        console.warn(`model ${e.id} failed to load`, err);
        return null;
      });
    this.loading.set(e.id, p);
  }
}
