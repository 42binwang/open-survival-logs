// @ts-check
// The furniture layer: one prop per view piece (src/render3d/props.js), placed on its footprint and turned to face
// away from the wall it stands against. A piece is rebuilt only when something it draws changes (config, footprint,
// wear bucket, power, crop stage, …), so a steady scene costs nothing per frame beyond the draw.
import * as THREE from 'three';
import { CELL, cellAt } from '../contracts/view.js';
import { furn, SLOT } from '../data/db.js';
import { SCENERY } from '../content/homes.js';
import { buildProp, family, rng, dress, books } from './props.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, mesh } from './geom.js';

/** @param {number} c */
const wallish = (c) => c === CELL.WALL || c === CELL.WINDOW || c === CELL.DOOR;

/** @param {string | number} v */
function hash(v) {
  const s = String(v);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * What a piece draws, as a string: a change rebuilds it.
 * @param {import('../contracts/view.js').ViewFurniture} f
 */
function signature(f) {
  const p = f.data?.plant;
  const plant = p ? `${Math.round((p.growth || 0) * 8)}${p.ready ? 'r' : ''}${p.withered ? 'w' : ''}${p.dry ? 'd' : ''}${p.weed ? 'g' : ''}${p.pest ? 'p' : ''}${p.count || ''}` : '';
  return [f.cfg, f.x, f.y, f.w, f.h, f.broken ? 1 : 0, Math.round((f.hpRatio ?? 1) * 4), f.reinforce ? 1 : 0, f.on ? 1 : 0, f.powered === false ? 0 : 1, plant, f.data?.soil || '', f.data?.cooking ? 1 : 0, f.data?.crafting ? 1 : 0, f.data?.breached ? 1 : 0].join('|');
}

/**
 * Rotation that turns the prop's +z front away from the wall behind its footprint.
 * @param {import('../contracts/view.js').ViewFurniture} f
 * @param {import('../contracts/view.js').FloorGrid} fl
 */
function facing(f, fl) {
  const w = f.w || 1;
  const h = f.h || 1;
  let n = 0;
  let s = 0;
  let wv = 0;
  let e = 0;
  for (let i = 0; i < w; i++) {
    if (wallish(cellAt(fl, f.x + i, f.y - 1))) n++;
    if (wallish(cellAt(fl, f.x + i, f.y + h))) s++;
  }
  for (let j = 0; j < h; j++) {
    if (wallish(cellAt(fl, f.x - 1, f.y + j))) wv++;
    if (wallish(cellAt(fl, f.x + w, f.y + j))) e++;
  }
  // prefer the long side against a wall
  const nN = n / w;
  const nS = s / w;
  const nW = wv / h;
  const nE = e / h;
  const best = Math.max(nN, nS, nW, nE);
  if (best === 0) return 0;
  if (nN === best && (w >= h || nN > Math.max(nW, nE))) return 0;
  if (nW === best) return Math.PI / 2;
  if (nE === best) return -Math.PI / 2;
  if (nS === best) return Math.PI;
  return 0;
}

/**
 * For pieces drawn on a wall tile (doors, windows, wall decor): the run direction and the room side.
 * @param {import('../contracts/view.js').ViewFurniture} f
 * @param {import('../contracts/view.js').FloorGrid} fl
 */
function wallPlacement(f, fl) {
  const at = (/** @type {number} */ x, /** @type {number} */ y) => cellAt(fl, x, y);
  const horiz = wallish(at(f.x - 1, f.y)) || wallish(at(f.x + 1, f.y));
  const room = (/** @type {number} */ c) => c === CELL.FLOOR || c === CELL.OUTDOOR || c === CELL.STAIRS_UP || c === CELL.STAIRS_DOWN;
  // the side a room lies on (wall decor hangs there; doors and windows open into it)
  if (horiz) {
    const south = room(at(f.x, f.y + 1)) && !(at(f.x, f.y + 1) === CELL.OUTDOOR && room(at(f.x, f.y - 1)));
    const north = room(at(f.x, f.y - 1));
    return { rot: north && !south ? Math.PI : 0, side: north && !south ? -1 : 1, horiz };
  }
  const east = room(at(f.x + 1, f.y));
  const west = room(at(f.x - 1, f.y));
  return { rot: west && !east ? -Math.PI / 2 : Math.PI / 2, side: west && !east ? -1 : 1, horiz };
}

/** Height caps for fitted models, per prop family (metres). */
const MODEL_MAX_H = { rack: 2.2, bookshelf: 2.1, cabinet: 2.0, table: 0.85, desk: 0.85, chair: 1.1, sofa: 1.0, armchair: 1.1, bed: 1.3, tv: 0.75, generator: 0.9, crate: 0.8, barrel: 1.0, bucket: 0.6, houseplant: 1.7, appliance: 0.45, lamp: 0.6, heater: 1.0, wallArt: 0.9 };

export class FurnitureLayer {
  /**
   * @param {import('./materials.js').MaterialLibrary} lib
   * @param {import('./models.js').ModelLibrary} [models]
   */
  constructor(lib, models) {
    this.lib = lib;
    this.models = models || null;
    /** @type {Set<string | number>} pieces drawn procedurally while their model loads */
    this.waiting = new Set();
    this.modelVersion = 0;
    this.group = new THREE.Group();
    this.group.name = 'furniture';
    /** @type {Map<string | number, { sig: string, obj: THREE.Object3D }>} */
    this.items = new Map();
    /** @type {Map<string, { sig: string, obj: THREE.Object3D }>} */
    this.boxes = new Map();
    this.boxGroup = new THREE.Group();
    this.boxGroup.name = 'boxes';
    this.group.add(this.boxGroup);
    /** @type {{ obj: THREE.Object3D, y: number }[]} */
    this.lamps = [];
    /** @type {THREE.Object3D[]} */
    this.spinners = [];
    /** @type {{ pivot: THREE.Object3D, x: number, z: number }[]} */
    this.doors = [];
    /** @type {number | undefined} */
    this.lastT = undefined;
  }

  clear() {
    this.doors = [];
    for (const { obj } of this.items.values()) this.group.remove(obj);
    for (const { obj } of this.boxes.values()) this.boxGroup.remove(obj);
    this.items.clear();
    this.boxes.clear();
    this.lamps = [];
    this.spinners = [];
  }

  /**
   * @param {import('../contracts/view.js').SceneView} view
   * @param {number} t  seconds, for small animations
   */
  update(view, t) {
    const fl = view.floor;
    const seen = new Set();
    const modelsMoved = !!this.models && this.models.version !== this.modelVersion;
    if (this.models) this.modelVersion = this.models.version;
    for (const f of view.furniture || []) {
      seen.add(f.uid);
      const sig = signature(f);
      const cur = this.items.get(f.uid);
      if (cur && cur.sig === sig && !(modelsMoved && this.waiting.has(f.uid))) continue;
      this.waiting.delete(f.uid);
      if (cur) {
        this.group.remove(cur.obj);
        disposeTree(cur.obj);
      }
      const obj = this.#build(f, fl);
      if (!this.waiting.has(f.uid)) mergeStatic(obj);
      // indoors the floors above block the key light (shell.js), so a piece's shadow would never be seen: it skips
      // the shadow pass; pieces on the terrace or in the yard keep theirs
      const c0 = cellAt(fl, f.x, f.y);
      const outside = c0 === CELL.OUTDOOR || c0 === CELL.YARD;
      obj.traverse((o) => {
        o.userData.uid = f.uid;
        if (/** @type {THREE.Mesh} */ (o).isMesh) o.castShadow = outside;
      });
      this.group.add(obj);
      this.items.set(f.uid, { sig, obj });
      this.#index();
    }
    for (const [uid, it] of this.items) {
      if (seen.has(uid)) continue;
      this.group.remove(it.obj);
      disposeTree(it.obj);
      this.items.delete(uid);
      this.#index();
    }
    // floor boxes (cardboard boxes dropped on the floor, cart cargo)
    const seenB = new Set();
    (view.boxes || []).forEach((b, i) => {
      const key = b.id != null ? `box:${b.id}` : `cargo:${i}`;
      seenB.add(key);
      const sig = `${b.x}|${b.y}`;
      const cur = this.boxes.get(key);
      if (cur && cur.sig === sig) return;
      if (cur) this.boxGroup.remove(cur.obj);
      const r = rng(hash(key));
      const obj = mesh(box(0.5, 0.36, 0.42), this.lib.get('cardboard', { tint: r() < 0.5 ? 'kraft' : 'light' }), b.x + 0.5, 0, b.y + 0.5);
      obj.rotation.y = (r() - 0.5) * 0.6;
      obj.add(mesh(box(0.06, 0.003, 0.42), this.lib.get('plastic', { tint: '#c9a86a', roughness: 0.4 }), 0, 0.36, 0));
      obj.userData.box = b.id;
      obj.traverse((o) => (o.userData.box = b.id));
      this.boxGroup.add(obj);
      this.boxes.set(key, { sig, obj });
    });
    for (const [k, it] of this.boxes) if (!seenB.has(k)) {
      this.boxGroup.remove(it.obj);
      this.boxes.delete(k);
    }
    // animated parts: a turn about z (wheels, blades), or their own animate(t) (the cat's tail and breathing)
    for (const s of this.spinners) {
      if (s.userData.animate) s.userData.animate(t);
      else s.rotation.z = t * (s.userData.spinRate || 3);
    }
    // doors swing open while someone stands at them, and close behind
    const dt = Math.min(0.1, Math.max(0, t - (this.lastT ?? t)));
    this.lastT = t;
    for (const d of this.doors) {
      const near = (view.entities || []).some((e) => Math.hypot(e.x + 0.5 - d.x, e.y + 0.5 - d.z) < 0.95);
      const want = near ? -1.35 : 0;
      d.pivot.rotation.y += (want - d.pivot.rotation.y) * Math.min(1, dt * 6);
    }
  }

  #index() {
    this.lamps = [];
    this.spinners = [];
    this.doors = [];
    for (const { obj } of this.items.values()) {
      obj.updateMatrixWorld(true);
      obj.traverse((o) => {
        if (o.userData.doorPivot) {
          const p = o.getWorldPosition(new THREE.Vector3());
          this.doors.push({ pivot: o.userData.doorPivot, x: p.x, z: p.z });
        }
        if (o.userData.lamp?.on) this.lamps.push({ obj: o, y: o.userData.lamp.y });
        if (o.userData.spin) this.spinners.push(o.userData.spin);
      });
    }
  }

  /**
   * @param {import('../contracts/view.js').ViewFurniture} f
   * @param {import('../contracts/view.js').FloorGrid} fl
   */
  #build(f, fl) {
    const key = typeof f.cfg === 'string' ? f.cfg : '';
    const cfg = typeof f.cfg === 'number' ? furn(f.cfg) : null;
    const scenery = key ? SCENERY[/** @type {keyof typeof SCENERY} */ (key)] : null;
    const name = cfg?.zh || '';
    const slot = cfg?.slot ?? (scenery ? /** @type {any} */ (scenery).slot : SLOT.MEDIUM) ?? SLOT.MEDIUM;
    const fam = family(name, key, slot, cfg);
    const r = rng(hash(`${f.uid}:${f.cfg}`));
    const outer = new THREE.Group();
    outer.name = `furn:${f.uid}:${fam}`;

    if (!f.w || !f.h) {
      // on a wall tile: doors, windows, wall decor
      const p = wallPlacement(f, fl);
      // the shell's cutaway rule (src/render3d/shell.js): a room of this floor behind the camera-facing face
      const [bx, by] = p.horiz ? [f.x, f.y - 1] : [f.x - 1, f.y];
      const bc = cellAt(fl, bx, by);
      const cut = bc === CELL.FLOOR || bc === CELL.OUTDOOR || bc === CELL.STAIRS_UP || bc === CELL.STAIRS_DOWN;
      const entry = fam === 'wallArt' ? this.models?.choose(fam, name, slot, rng(hash(`m:${f.uid}`))) : null;
      if (fam === 'wallArt' && this.models && !this.models.settled) this.waiting.add(f.uid);
      const model = entry ? this.models?.instance(entry, 0.8, 0.2, { wall: true, maxH: 0.9 }) : null;
      if (entry && !model) this.waiting.add(f.uid);
      if (model) {
        model.position.set(0, /飞镖/.test(name) ? 1.45 : /时钟/.test(name) ? 1.85 : 1.25, 0.16);
        outer.position.set(f.x + 0.5, 0, f.y + 0.5);
        outer.rotation.y = p.rot;
        outer.add(model);
        return outer;
      }
      const prop = buildProp(fam, { W: 0.9, D: 0.3, lib: this.lib, rnd: r, name, key, f, slot, cut, side: 1 });
      outer.position.set(f.x + 0.5, 0, f.y + 0.5);
      outer.rotation.y = p.rot;
      if (fam !== 'door' && fam !== 'window') {
        // decor hangs on the room face of the wall
        prop.position.z = 0.16;
        if (fam === 'tv') prop.position.z = 0.2;
      }
      outer.add(prop);
      return outer;
    }

    const rot = facing(f, fl);
    const quarter = Math.abs(Math.sin(rot)) > 0.5;
    const W = (quarter ? f.h : f.w) - 0.1;
    const D = (quarter ? f.w : f.h) - 0.1;
    const entry = this.models?.choose(fam, name, slot, rng(hash(`m:${f.uid}`))) || null;
    if (this.models && !this.models.settled) this.waiting.add(f.uid);
    const onTable = slot === SLOT.TABLETOP || fam === 'appliance' || fam === 'lamp';
    const maxH = /床头|矮柜|抽屉/.test(name) ? 0.75 : MODEL_MAX_H[/** @type {keyof typeof MODEL_MAX_H} */ (fam)];
    const turn = ['bed', 'table', 'desk', 'crate', 'barrel', 'bucket', 'generator', 'houseplant'].includes(fam);
    const model = entry && !f.broken ? this.models?.instance(entry, onTable ? Math.min(W, 0.6) : W, onTable ? Math.min(D, 0.5) : D, { maxH, turn }) : null;
    if (entry && !model && !f.broken) this.waiting.add(f.uid);
    if (model) {
      dressModel(model, fam, entry?.id || '', { W, D, lib: this.lib, rnd: rng(hash(`d:${f.uid}`)), name, key, f, slot });
      if (onTable) {
        const t = buildProp('table', { W: Math.min(W, 0.8), D: Math.min(D, 0.6), lib: this.lib, rnd: rng(hash(f.uid)), name: '小桌', key: '', f, slot: SLOT.SMALL });
        t.children.splice(6);
        outer.add(t);
        model.position.y = 0.75;
      }
      outer.add(model);
      outer.position.set(f.x + f.w / 2, 0, f.y + f.h / 2);
      outer.rotation.y = rot;
      return outer;
    }
    const prop = buildProp(fam, { W, D, lib: this.lib, rnd: r, name, key, f, slot });
    // table-top pieces (a camping stove, a kettle) stand on a small table of their own
    if (slot === SLOT.TABLETOP && !['appliance', 'lamp', 'tv', 'desk'].includes(fam)) {
      const t = buildProp('table', { W: Math.min(W, 0.8), D: Math.min(D, 0.6), lib: this.lib, rnd: rng(hash(f.uid)), name: '小桌', key: '', f, slot: SLOT.SMALL });
      t.children.splice(6);
      outer.add(t);
      prop.position.y = 0.75;
    }
    if (f.broken && !['door', 'window'].includes(fam)) {
      prop.rotation.z = 0.08;
      prop.position.y -= 0.03;
    }
    outer.add(prop);
    outer.position.set(f.x + f.w / 2, 0, f.y + f.h / 2);
    outer.rotation.y = rot;
    return outer;
  }

  /**
   * The nearest piece of one of these families within `r` metres of (x, z), for a figure to lie or sit on: its centre,
   * its turn, the height of its top at the centre (a raycast down onto the model: the mattress, the seat) and the
   * direction along its long axis to its taller end (a bed's headboard, where the pillow is).
   * @param {number} x
   * @param {number} z
   * @param {string[]} fams
   * @param {number} r
   * @returns {{ fam: string, cx: number, cz: number, rot: number, top: number, head: [number, number] } | null}
   */
  rest(x, z, fams, r) {
    /** @type {THREE.Object3D | null} */
    let best = null;
    let bestD = r;
    for (const o of this.group.children) {
      const fam = o.name.split(':')[2];
      if (!fam || !fams.includes(fam)) continue;
      const box = (o.userData.restBox ||= new THREE.Box3().setFromObject(o));
      const c = box.getCenter(new THREE.Vector3());
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    if (!best) return null;
    if (best.userData.rest) return best.userData.rest;
    const o = best;
    const box = /** @type {THREE.Box3} */ (o.userData.restBox);
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const ray = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const topAt = (/** @type {number} */ px, /** @type {number} */ pz) => {
      ray.set(new THREE.Vector3(px, box.max.y + 0.5, pz), down);
      return ray.intersectObject(o, true)[0]?.point.y ?? box.min.y;
    };
    const alongX = size.x >= size.z;
    const len = alongX ? size.x : size.z;
    const wid = alongX ? size.z : size.x;
    const ax = alongX ? 1 : 0;
    const az = alongX ? 0 : 1;
    // the highest of a grid of rays over each end (one ray slips between the bars of an iron frame)
    const endTop = (/** @type {number} */ s) => {
      let top = -Infinity;
      for (const f of [0.34, 0.4, 0.46, 0.49])
        for (const g of [-0.3, 0, 0.3]) {
          const along = s * f * len;
          const across = g * wid;
          top = Math.max(top, topAt(c.x + ax * along + az * across, c.z + az * along + ax * across));
        }
      return top;
    };
    const endA = endTop(1);
    const endB = endTop(-1);
    const sign = endA >= endB ? 1 : -1;
    const rest = { fam: o.name.split(':')[2], cx: c.x, cz: c.z, rot: o.rotation.y, top: topAt(c.x, c.z), head: /** @type {[number, number]} */ ([ax * sign, az * sign]) };
    o.userData.rest = rest;
    return rest;
  }

  /** The object of a piece, for outlines and picking. @param {string | number} uid */
  object(uid) {
    return this.items.get(uid)?.obj || null;
  }

  /** @param {string | number} id */
  boxObject(id) {
    return this.boxes.get(`box:${id}`)?.obj || null;
  }
}

/**
 * Stocks a fitted model the way the game's pieces look in use: every shelf level of a rack or bookcase found by
 * casting rays down through the model (upward-facing surfaces with room above them), clutter on tables, and a
 * mattress on a bare bed frame.
 * @param {THREE.Group} holder
 * @param {string} fam
 * @param {string} id  model id
 * @param {import('./props.js').PropCtx} c
 */
function dressModel(holder, fam, id, c) {
  const stock = ['rack', 'bookshelf', 'table', 'desk', 'cabinet'].includes(fam);
  if (fam === 'bed' && id === 'old_bed_frame') {
    holder.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(holder);
    const size = b.getSize(new THREE.Vector3());
    const long = size.x > size.z;
    const top = b.min.y + size.y * 0.42;
    const mat = mesh(box(long ? size.x * 0.94 : size.x * 0.86, 0.16, long ? size.z * 0.86 : size.z * 0.94, { round: 0.05 }), c.lib.get('fabric_curtain', { tint: 'cream' }), (b.min.x + b.max.x) / 2, top, (b.min.z + b.max.z) / 2);
    holder.add(mat);
    const blanket = mesh(box(long ? size.x * 0.6 : size.x * 0.9, 0.05, long ? size.z * 0.9 : size.z * 0.6, { round: 0.02 }), c.lib.get('fabric_curtain', { tint: ['sage', 'blue', 'rose', 'ochre'][Math.floor(c.rnd() * 4)] }), long ? b.min.x + size.x * 0.64 : (b.min.x + b.max.x) / 2, top + 0.15, long ? (b.min.z + b.max.z) / 2 : b.min.z + size.z * 0.64);
    holder.add(blanket);
    return;
  }
  if (!stock) return;
  holder.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(holder);
  const size = b.getSize(new THREE.Vector3());
  const ray = new THREE.Raycaster();
  const cx = (b.min.x + b.max.x) / 2;
  const cz = (b.min.z + b.max.z) / 2;
  ray.set(new THREE.Vector3(cx, b.max.y + 0.2, cz), new THREE.Vector3(0, -1, 0));
  const hits = ray.intersectObject(holder, true).filter((h) => {
    if (!h.face) return false;
    const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
    return n.y > 0.7;
  });
  /** @type {number[]} */
  const levels = [];
  for (const h of hits) if (!levels.some((y) => Math.abs(y - h.point.y) < 0.06)) levels.push(h.point.y);
  levels.sort((a, b2) => a - b2);
  const long = size.x >= size.z;
  const span = (long ? size.x : size.z) * 0.86;
  const depth = (long ? size.z : size.x) * 0.6;
  levels.forEach((y, i) => {
    const above = i + 1 < levels.length ? levels[i + 1] - y : fam === 'rack' || fam === 'bookshelf' ? 0 : 0.35;
    if (above < 0.14 || y < b.min.y + 0.05) return;
    if ((fam === 'table' || fam === 'desk' || fam === 'cabinet') && (i < levels.length - 1 || c.rnd() < 0.35)) return;
    const g = new THREE.Group();
    const maxH = Math.min(0.4, above - 0.04);
    if (fam === 'bookshelf') books(c, g, -span / 2, span / 2, y, 0, maxH);
    else dress(c, g, -span / 2, span / 2, y, 0, depth, maxH);
    g.position.set(cx, 0, cz);
    if (!long) g.rotation.y = Math.PI / 2;
    holder.add(g);
  });
}

/**
 * Merges a procedural prop's meshes into one mesh per material (a prop is built from up to ~40 boxes; each would
 * be a draw call in the main, shadow and outline passes). Animated parts (userData.spin) and model instances (their
 * materials are their own) stay as they are.
 * @param {THREE.Group} root
 */
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  /** @type {Map<THREE.Material, THREE.BufferGeometry[]>} */
  const byMat = new Map();
  /** @type {THREE.Mesh[]} */
  const merged = [];
  let skip = false;
  root.traverse((o) => {
    if (o.userData.spin || o.userData.lamp || o.userData.doorPivot) skip = true;
  });
  if (skip) return;
  root.traverse((o) => {
    const m = /** @type {THREE.Mesh} */ (o);
    if (!m.isMesh || Array.isArray(m.material) || /** @type {any} */ (m).isSkinnedMesh) return;
    if (m.material.transparent) return;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.getAttribute('uv') || !g.getAttribute('normal')) {
      g.dispose();
      return;
    }
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    if (!byMat.has(m.material)) byMat.set(m.material, []);
    byMat.get(m.material)?.push(g);
    merged.push(m);
  });
  if (merged.length < 4) {
    for (const list of byMat.values()) list.forEach((g) => g.dispose());
    return;
  }
  for (const m of merged) {
    m.parent?.remove(m);
    m.geometry.dispose();
  }
  // drop groups emptied by the merge
  root.traverse((o) => {
    for (const c of [...o.children]) if (c.type === 'Group' && c.children.length === 0) o.remove(c);
  });
  for (const [mat, list] of byMat) {
    const g = mergeGeometries(list, false);
    list.forEach((x) => x.dispose());
    if (!g) continue;
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  }
}

/** Frees geometries (materials are shared through the library). @param {THREE.Object3D} o */
export function disposeTree(o) {
  o.traverse((c) => {
    const m = /** @type {THREE.Mesh} */ (c);
    if (m.isMesh) m.geometry.dispose();
  });
}
