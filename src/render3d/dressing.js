// @ts-check
// Set dressing that makes a floor look lived in (and, after the outbreak, lived through), after the source's rooms
// (t035, ss_04): on full-height walls, conduit runs with breaker panels, split air conditioners, wall lamps, shelves
// of goods, hoses and pegboards, pictures and clocks; along the walls, clutter clusters (carton stacks, pallets,
// crates, jerrycans, barrels, buckets); rugs on the largest free patch of living rooms and bedrooms; bins and bags in
// the yard; litter once the outbreak has come. Laid out from the scene's own seed so it never shifts, only on tiles
// no piece of furniture occupies, and floor clutter keeps to the outer part of its tile (the survivor walks tile
// centres). One mesh per material, never picked.
import * as THREE from 'three';
import { CELL, cellAt } from '../contracts/view.js';
import { box, cyl, mesh } from './geom.js';
import { buildProp, dress, rng } from './props.js';
import { mergeStatic } from './furniture.js';
import { CAMERA } from '../contracts/look.js';
import { SHOP_FLOOR } from '../content/shops.js';
import { pickLang } from '../engine/i18n.js';

/** Scanned models the clutter draws from (assets/models), loaded before the dressing is built. */
export const CLUTTER_MODELS = ['cardboard_box_01', 'wooden_crate_01', 'plastic_crate_01', 'plastic_crate_02', 'metal_jerrycan', 'metal_jerrycan_green', 'plastic_jerrycan', 'barrel_01', 'barrel_02', 'wicker_basket_01', 'wooden_bucket_02', 'metal_toolbox', 'all_purpose_cleaner', 'wooden_military_crate'];

/** @param {number} c */
const wallish = (c) => c === CELL.WALL || c === CELL.WINDOW || c === CELL.DOOR;
/** @param {number} c */
const roomish = (c) => c === CELL.FLOOR || c === CELL.OUTDOOR || c === CELL.STAIRS_UP || c === CELL.STAIRS_DOWN;

/**
 * @typedef {object} WallSpot
 * @property {number} x  wall tile
 * @property {number} y
 * @property {'n' | 'w'} side  the room lies south of a north wall, east of a west wall
 * @property {number} face  the wall face's coordinate (z for a north wall, x for a west wall)
 */

/**
 * @param {import('../contracts/view.js').SceneView} view
 * @param {import('./materials.js').MaterialLibrary} lib
 * @param {import('./models.js').ModelLibrary | null} [models]
 * @returns {{ group: THREE.Group, glow: THREE.MeshStandardMaterial[], lamps: { pos: THREE.Vector3, dir: THREE.Vector3 }[] }}
 */
export function buildDressing(view, lib, models = null) {
  const fl = view.floor;
  const g = new THREE.Group();
  g.name = 'dressing';
  /** @type {THREE.MeshStandardMaterial[]} */
  const glow = [];
  let seed = 0;
  for (const ch of `${view.floorId}|${view.home || ''}|dress`) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const r = rng(seed || 11);
  const pick = (/** @type {any[]} */ a) => a[Math.floor(r() * a.length) % a.length];
  const site = /^site:/.test(String(view.floorId));
  const after = site || (view.clock?.outbreakAt != null && view.clock.t >= view.clock.outbreakAt);
  const at = (/** @type {number} */ x, /** @type {number} */ y) => cellAt(fl, x, y);
  /** @param {string} name @param {import('./materials.js').MatOptions} [o] */
  const M = (name, o) => lib.get(name, o);
  const ctx = (/** @type {number} */ W, /** @type {number} */ D) => /** @type {import('./props.js').PropCtx} */ ({ W, D, lib, rnd: r, name: '', key: '', f: /** @type {any} */ ({ uid: 'dress', cfg: 0, x: 0, y: 0, w: 1, h: 1, data: {} }), slot: 2 });

  // tiles taken by furniture (and the wall tiles that carry a wall piece)
  const taken = new Set();
  const wallTaken = new Set();
  for (const f of view.furniture || []) {
    if (!f.w || !f.h) {
      wallTaken.add(`${f.x},${f.y}`);
      continue;
    }
    for (let dx = 0; dx < f.w; dx++) for (let dy = 0; dy < f.h; dy++) taken.add(`${f.x + dx},${f.y + dy}`);
  }
  for (const b of view.boxes || []) taken.add(`${b.x},${b.y}`);
  const free = (/** @type {number} */ x, /** @type {number} */ y) => at(x, y) === CELL.FLOOR && !taken.has(`${x},${y}`) && !view.locked?.(x, y);
  /** next to a door or stairs: the way in stays clear */
  const nearDoor = (/** @type {number} */ x, /** @type {number} */ y) =>
    [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]].some(([dx, dy]) => {
      const c = at(x + dx, y + dy);
      return c === CELL.DOOR || c === CELL.STAIRS_UP || c === CELL.STAIRS_DOWN;
    });
  /** a wall tile's thickness, as the shell builds it */
  const thick = (/** @type {number} */ x, /** @type {number} */ y) =>
    [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const c = at(x + dx, y + dy);
      return c === CELL.VOID || c === CELL.YARD || (c === CELL.OUTDOOR && !view.roomAt?.(x + dx, y + dy));
    })
      ? 0.3
      : 0.16;

  /**
   * The full-height wall tiles along a room's north and west sides (the cutaway leaves the others at 0.9 m).
   * @param {import('../contracts/view.js').Room} room
   * @returns {WallSpot[]}
   */
  const wallSpots = (room) => {
    /** @type {WallSpot[]} */
    const out = [];
    const yN = room.y - 1;
    for (let x = room.x; x < room.x + room.w; x++) {
      if (at(x, yN) !== CELL.WALL || wallTaken.has(`${x},${yN}`) || roomish(at(x, yN - 1))) continue;
      if (!(wallish(at(x - 1, yN)) || wallish(at(x + 1, yN)))) continue;
      out.push({ x, y: yN, side: 'n', face: yN + 0.5 + thick(x, yN) / 2 });
    }
    const xW = room.x - 1;
    for (let y = room.y; y < room.y + room.h; y++) {
      if (at(xW, y) !== CELL.WALL || wallTaken.has(`${xW},${y}`) || roomish(at(xW - 1, y))) continue;
      if (!(wallish(at(xW, y - 1)) || wallish(at(xW, y + 1)))) continue;
      out.push({ x: xW, y, side: 'w', face: xW + 0.5 + thick(xW, y) / 2 });
    }
    return out;
  };
  /**
   * Puts a fixture built with its back on z = 0 and its front to +z onto a wall spot.
   * @param {THREE.Object3D} o @param {WallSpot} s @param {number} [along]  offset along the wall, metres
   */
  const onWall = (o, s, along = 0) => {
    if (s.side === 'n') {
      o.position.set(s.x + 0.5 + along, 0, s.face);
      o.rotation.y = 0;
    } else {
      o.position.set(s.face, 0, s.y + 0.5 + along);
      o.rotation.y = Math.PI / 2;
    }
    g.add(o);
  };

  // ------------------------------------------------------------------ wall fixtures
  const plasticDark = M('plastic', { tint: '#3a3b3d', roughness: 0.6 });
  const paintGrey = M('metal_painted', { tint: 'grey' });
  const white = M('plastic', { tint: 'white', roughness: 0.35 });
  const lampGlow = M('#f3e2c0', { emissive: 1, emissiveColor: '#ffc27a' });
  glow.push(lampGlow);

  /** conduit: two cables along a run at 2.5 m, with a drop to a breaker panel */
  const conduit = (/** @type {number} */ len, /** @type {boolean} */ panel) => {
    const o = new THREE.Group();
    // a cylinder turned along x spans [-len, 0]: shifted to centre on the group's origin
    for (const dy of [0, 0.07]) o.add(mesh(cyl(0.022, 0.022, len, 8).rotateZ(Math.PI / 2), plasticDark, len / 2, 2.5 + dy, 0.035));
    if (panel) {
      const px = (r() - 0.5) * Math.max(0, len - 0.6);
      o.add(mesh(cyl(0.022, 0.022, 0.75, 8), plasticDark, px - 0.05, 1.8, 0.035));
      o.add(mesh(cyl(0.022, 0.022, 0.75, 8), plasticDark, px + 0.05, 1.8, 0.035));
      o.add(mesh(box(0.42, 0.52, 0.12, { round: 0.01 }), paintGrey, px, 1.28, 0.06));
      o.add(mesh(box(0.36, 0.08, 0.02), plasticDark, px, 1.62, 0.125));
      o.add(mesh(box(0.14, 0.18, 0.1), paintGrey, px + 0.4, 1.35, 0.05));
    }
    return o;
  };
  /** a split air conditioner high on the wall */
  const aircon = () => {
    const o = new THREE.Group();
    o.add(mesh(box(0.86, 0.28, 0.2, { round: 0.05 }), white, 0, 2.35, 0.1));
    o.add(mesh(box(0.8, 0.02, 0.02), M('#9aa0a4'), 0, 2.4, 0.205));
    o.add(mesh(cyl(0.015, 0.015, 0.5, 6), white, 0.38, 1.88, 0.03));
    return o;
  };
  /** a wall lamp: bracket and a warm shade that lights with the house */
  const sconce = () => {
    const o = new THREE.Group();
    o.add(mesh(box(0.08, 0.12, 0.05), paintGrey, 0, 2.05, 0.025));
    o.add(mesh(cyl(0.012, 0.012, 0.22, 6).rotateX(Math.PI / 2), paintGrey, 0, 2.1, 0.12));
    o.add(mesh(cyl(0.06, 0.13, 0.13, 16), M('metal_painted', { tint: pick(['black', 'green', 'cream']) }), 0, 2.02, 0.24));
    o.add(mesh(new THREE.SphereGeometry(0.045, 10, 8), lampGlow, 0, 2.04, 0.24));
    // where the wall lamp's light leaves (ART.md §4.5: 1.9 m high, aimed 35° down, out from the wall)
    o.userData.lampSpot = true;
    return o;
  };
  /** a shelf of goods */
  const wallShelf = (/** @type {number} */ w) => {
    const o = new THREE.Group();
    const wood = M('wood_floor_pine', { tint: pick(['natural', 'dark']) });
    o.add(mesh(box(w, 0.03, 0.26), wood, 0, 1.62, 0.13));
    for (const sx of [-1, 1]) o.add(mesh(box(0.03, 0.18, 0.2), paintGrey, sx * (w / 2 - 0.1), 1.45, 0.1));
    dress(ctx(w, 0.26), o, -w / 2 + 0.03, w / 2 - 0.03, 1.65, 0.12, 0.2, 0.3);
    return o;
  };
  /** a coiled hose or rope on a hook */
  const coil = () => {
    const o = new THREE.Group();
    const col = pick(['#d8661e', '#3f8a4a', '#c8a44a']);
    for (let i = 0; i < 3; i++) o.add(mesh(new THREE.TorusGeometry(0.2 - i * 0.015, 0.018, 6, 20), M('rubber', { tint: col }), 0, 1.55 - i * 0.01, 0.05 + i * 0.03));
    o.add(mesh(box(0.04, 0.04, 0.1), paintGrey, 0, 1.76, 0.05));
    return o;
  };
  /** a pegboard with tools */
  const pegboard = () => {
    const o = new THREE.Group();
    o.add(mesh(box(0.9, 0.7, 0.02), M('cardboard', { tint: 'grey_board' }), 0, 1.2, 0.01));
    const tools = [M('metal_brushed', { tint: 'steel' }), M('metal_painted', { tint: 'red' }), M('metal_painted', { tint: 'blue' }), plasticDark];
    for (let i = 0; i < 6; i++) {
      const t = mesh(box(0.03 + r() * 0.05, 0.15 + r() * 0.2, 0.02), pick(tools), -0.36 + i * 0.14, 1.3 + r() * 0.25, 0.03);
      t.rotation.z = (r() - 0.5) * 0.3;
      o.add(t);
    }
    return o;
  };
  /** a picture or a clock (the prop family draws them on a wall tile's centre; moved to the face) */
  const art = () => {
    const o = buildProp('wallArt', { ...ctx(0.9, 0.3), name: pick(['装饰画', '相框', '时钟', '装饰画']), slot: 4 });
    o.position.z = -0.14;
    const h = new THREE.Group();
    h.add(o);
    return h;
  };

  // ------------------------------------------------------------------ floor clutter
  /** A model at its authored size (or null when it is not loaded). @param {string} id */
  const model = (id) => models?.natural(id) || null;
  const card = [M('cardboard', { tint: 'kraft' }), M('cardboard', { tint: 'light' }), M('cardboard', { tint: 'dark' })];
  /** @param {number} w @param {number} h @param {number} d */
  const carton = (w, h, d) => {
    const o = mesh(box(w, h, d), pick(card));
    o.add(mesh(box(0.06, 0.003, d), M('plastic', { tint: '#c9a86a', roughness: 0.4 }), 0, h, 0));
    return o;
  };
  const pallet = () => {
    const o = new THREE.Group();
    const wood = M('wood_floor_pine', { tint: 'faded' });
    for (let i = 0; i < 5; i++) o.add(mesh(box(1.1, 0.022, 0.12), wood, 0, 0.1, -0.38 + i * 0.19));
    for (const z of [-0.36, 0, 0.36]) o.add(mesh(box(1.1, 0.08, 0.09), wood, 0, 0.02, z));
    return o;
  };
  /**
   * One cluster of clutter in the wall-side half of a tile, built in local space (wall at z = 0, room to +z).
   * @param {string} kind  the room's id
   */
  const cluster = (kind) => {
    const o = new THREE.Group();
    const store = /storage|store|stock|garage|gen|cellar|basement|dock|storeroom/.test(kind) || site;
    const roll = r();
    if (store && roll < 0.3) {
      // a pallet stack with a carton on top
      const n = 2 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) {
        const p = pallet();
        p.position.set((r() - 0.5) * 0.06, i * 0.13, 0.42);
        p.rotation.y = (r() - 0.5) * 0.08;
        p.scale.set(0.8, 1, 0.7);
        o.add(p);
      }
      if (r() < 0.6) {
        const c = carton(0.5, 0.35, 0.4);
        c.position.set(0, n * 0.13, 0.4);
        o.add(c);
      }
      return o;
    }
    if (roll < 0.55) {
      // a stack of cartons
      const n = 1 + Math.floor(r() * 3);
      let y = 0;
      for (let i = 0; i < n; i++) {
        const m = r() < 0.6 ? model('cardboard_box_01') : null;
        const w = 0.35 + r() * 0.2;
        const h = 0.25 + r() * 0.15;
        const c = m || carton(w, h, 0.3 + r() * 0.12);
        c.position.set((r() - 0.5) * 0.25, y, 0.24 + (r() - 0.5) * 0.06);
        c.rotation.y = (r() - 0.5) * 0.5;
        o.add(c);
        y += (m ? /** @type {THREE.Vector3} */ (m.userData.size).y : h) * 0.98;
        if (y > 1.1) break;
      }
      return o;
    }
    // one or two containers from the scanned set
    const pool = store
      ? ['wooden_crate_01', 'plastic_crate_01', 'plastic_crate_02', 'metal_jerrycan', 'metal_jerrycan_green', 'barrel_01', 'barrel_02', 'wooden_military_crate', 'metal_toolbox']
      : /kitchen/.test(kind)
        ? ['plastic_crate_01', 'wicker_basket_01', 'wooden_bucket_02', 'plastic_jerrycan', 'all_purpose_cleaner']
        : /bath/.test(kind)
          ? ['wooden_bucket_02', 'all_purpose_cleaner', 'wicker_basket_01']
          : ['wicker_basket_01', 'plastic_crate_02', 'cardboard_box_01', 'wooden_crate_01', 'plastic_jerrycan'];
    const n = 1 + (r() < 0.5 ? 1 : 0);
    let x = -0.3;
    for (let i = 0; i < n; i++) {
      const m = model(pick(pool));
      if (!m) {
        const c = carton(0.4, 0.3, 0.32);
        c.position.set(x + 0.2, 0, 0.22);
        o.add(c);
        x += 0.45;
        continue;
      }
      const size = /** @type {THREE.Vector3} */ (m.userData.size);
      if (size.x > 0.95 || size.z > 0.6) m.scale.setScalar(Math.min(0.95 / size.x, 0.6 / size.z));
      m.position.set(x + (size.x * m.scale.x) / 2, 0, 0.05 + (size.z * m.scale.z) / 2);
      m.rotation.y = (r() - 0.5) * 0.3;
      o.add(m);
      x += size.x * m.scale.x + 0.05;
      if (x > 0.45) break;
    }
    return o;
  };

  for (const room of fl.rooms || []) {
    const id = room.id.toLowerCase();
    const cold = room.cold || /cold|freezer/.test(id);
    // a rug on the largest free rectangle (at least 2 × 2) of living rooms and bedrooms
    if (/living|bed|loft|office|sunroom|lobby|hall/.test(id)) {
      let best = null;
      for (let y = room.y; y < room.y + room.h; y++)
        for (let x = room.x; x < room.x + room.w; x++)
          for (const [w, h] of [[4, 3], [3, 3], [3, 2], [2, 3], [2, 2]]) {
            if (x + w > room.x + room.w || y + h > room.y + room.h) continue;
            let ok = true;
            for (let dy = 0; dy < h && ok; dy++) for (let dx = 0; dx < w && ok; dx++) ok = free(x + dx, y + dy);
            if (ok && (!best || w * h > best.w * best.h)) best = { x, y, w, h };
          }
      if (best) {
        const rug = M('fabric_sofa', { tint: pick(['#8a5a44', '#5f6b7a', '#7a6a4a', '#6b4a52', 'beige']) });
        const border = M('fabric_sofa', { tint: pick(['#3e3530', '#c9b48a', '#2f3a44']) });
        if (r() < 0.4) {
          const rad = Math.min(best.w, best.h) / 2 - 0.25;
          g.add(mesh(new THREE.CylinderGeometry(rad, rad, 0.014, 40), rug, best.x + best.w / 2, 0, best.y + best.h / 2));
        } else {
          g.add(mesh(box(best.w - 0.5, 0.012, best.h - 0.5), border, best.x + best.w / 2, 0.001, best.y + best.h / 2));
          g.add(mesh(box(best.w - 0.8, 0.014, best.h - 0.8), rug, best.x + best.w / 2, 0.001, best.y + best.h / 2));
        }
        for (let dy = 0; dy < best.h; dy++) for (let dx = 0; dx < best.w; dx++) taken.add(`${best.x + dx},${best.y + dy}`);
      }
    }
    if (cold && !view.locked?.(room.x + Math.floor(room.w / 2), room.y + Math.floor(room.h / 2))) {
      // frost: a rime sheet over the floor, heavier toward the walls, and icicles along the full-height walls' tops
      const tex = frostTexture(r);
      if (tex) {
        const sheet = new THREE.Mesh(
          new THREE.PlaneGeometry(room.w, room.h).rotateX(-Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: '#eef6ff', alphaMap: tex, transparent: true, opacity: 0.7, depthWrite: false, roughness: 0.2, polygonOffset: true, polygonOffsetFactor: -1 })
        );
        sheet.position.set(room.x + room.w / 2, 0.003, room.y + room.h / 2);
        g.add(sheet);
      }
      const ice = M('#dcecf5', { roughness: 0.08, opacity: 0.85 });
      for (const sp of wallSpots(room)) {
        const o = new THREE.Group();
        for (let i = 0; i < 5; i++) {
          const len = 0.05 + r() * 0.18;
          const icicle = mesh(new THREE.ConeGeometry(0.012 + r() * 0.01, len, 5).rotateX(Math.PI), ice, -0.4 + i * 0.2 + (r() - 0.5) * 0.08, 2.62 - len / 2, 0.03);
          o.add(icicle);
        }
        onWall(o, sp);
      }
    }
    if (room.outdoor || cold) continue;

    // wall fixtures on the full-height walls, by the kind of room
    const spots = wallSpots(room);
    const store = /storage|store|stock|garage|gen|cellar|basement|dock|storeroom|electrical|server/.test(id) || !!view.basement;
    // conduit along the north wall: one run per contiguous stretch of full-height tiles on the same face
    if (store || /kitchen|living|office/.test(id) || r() < 0.5) {
      const north = spots.filter((s2) => s2.side === 'n').sort((a, b) => a.x - b.x);
      /** @type {WallSpot[][]} */
      const runs = [];
      for (const s2 of north) {
        const last = runs.at(-1);
        if (last && s2.x === last[last.length - 1].x + 1 && Math.abs(s2.face - last[0].face) < 1e-6) last.push(s2);
        else runs.push([s2]);
      }
      for (const run of runs) {
        if (run.length < 2) continue;
        const x0 = run[0].x;
        const x1 = run[run.length - 1].x + 1;
        const o = conduit(x1 - x0 - 0.1, store || r() < 0.5);
        o.position.set((x0 + x1) / 2, 0, run[0].face);
        g.add(o);
      }
    }
    const kitchen = /kitchen/.test(id);
    const bath = /bath/.test(id);
    /** @type {(() => THREE.Object3D)[]} */
    const menu = store ? [pegboard, coil, () => wallShelf(0.9), () => wallShelf(0.9), sconce] : kitchen ? [() => wallShelf(0.8), () => wallShelf(0.8), sconce] : bath ? [() => wallShelf(0.6)] : [sconce, () => wallShelf(0.8), aircon, art, art, coil];
    const pool = [...spots];
    const count = Math.min(pool.length, Math.round(pool.length * (store ? 0.7 : 0.5)) + (r() < 0.5 ? 1 : 0));
    let hasAircon = false;
    for (let i = 0; i < count; i++) {
      const s = pool.splice(Math.floor(r() * pool.length), 1)[0];
      let make = pick(menu);
      if (make === aircon) {
        if (hasAircon) make = sconce;
        hasAircon = true;
      }
      onWall(make(), s, (r() - 0.5) * 0.2);
    }

    // clutter along the walls
    const p = store ? 0.75 : kitchen ? 0.4 : bath ? 0.25 : /bed/.test(id) ? 0.4 : 0.55;
    for (let y = room.y; y < room.y + room.h; y++)
      for (let x = room.x; x < room.x + room.w; x++) {
        if (!free(x, y) || nearDoor(x, y)) continue;
        // the wall the cluster leans on: north or west (full height) first, then south or east (cut, still seen)
        /** @type {[number, number, number, number][]} x, z of the wall line and the turn of local +z */
        const sides = [];
        if (at(x, y - 1) === CELL.WALL) sides.push([x + 0.5, y, 0, 0]);
        if (at(x - 1, y) === CELL.WALL) sides.push([x, y + 0.5, Math.PI / 2, 0]);
        if (at(x, y + 1) === CELL.WALL) sides.push([x + 0.5, y + 1, Math.PI, 1]);
        if (at(x + 1, y) === CELL.WALL) sides.push([x + 1, y + 0.5, -Math.PI / 2, 1]);
        if (!sides.length || r() > p) continue;
        const [wx, wz, turn] = sides[0];
        const o = cluster(id);
        o.position.set(wx, 0, wz);
        o.rotation.y = turn;
        g.add(o);
        taken.add(`${x},${y}`);
      }
  }

  // ------------------------------------------------------------------ the yard: bins and bags by the front wall
  const binCols = ['#3f6b45', '#3a4d6b', '#4a4b4c'];
  for (let x = 0; x < fl.w; x++) {
    for (let y = 1; y < fl.h; y++) {
      if (at(x, y) !== CELL.YARD || !wallish(at(x, y - 1))) continue;
      if ([-1, 0, 1].some((d) => at(x + d, y - 1) === CELL.DOOR) || r() > 0.35) continue;
      const o = new THREE.Group();
      if (r() < 0.6) {
        const bin = M('plastic', { tint: pick(binCols), roughness: 0.6 });
        o.add(mesh(box(0.58, 0.95, 0.7, { round: 0.04 }), bin, 0, 0, 0.45));
        o.add(mesh(box(0.62, 0.06, 0.74, { round: 0.02 }), bin, 0, 0.95, 0.45));
      }
      for (let i = 0; i < 1 + Math.floor(r() * 3); i++) {
        const bag = mesh(new THREE.SphereGeometry(0.24, 12, 9), M('plastic', { tint: '#1c1c1e', roughness: 0.3 }), (r() - 0.5) * 0.7, 0.18, 0.35 + r() * 0.3);
        bag.scale.set(1, 0.8 + r() * 0.3, 1.1);
        o.add(bag);
      }
      o.position.set(x + 0.5, 0, y);
      g.add(o);
    }
  }

  // ------------------------------------------------------------------ litter after the outbreak
  if (after) {
    const paper = [M('newsprint', { tint: 'yellowed' }), M('newsprint', { tint: 'grey' })];
    const can = [M('metal_painted', { tint: 'red' }), M('metal_brushed', { tint: 'steel' })];
    const rag = M('fabric_curtain', { tint: '#6b604e' });
    const stain = M('#4a3526', { roughness: 0.95, opacity: 0.55 });
    for (let y = 0; y < fl.h; y++)
      for (let x = 0; x < fl.w; x++) {
        const c = at(x, y);
        const ground = c === CELL.FLOOR || c === CELL.OUTDOOR || c === CELL.YARD;
        if (!ground || taken.has(`${x},${y}`) || r() > (site ? 0.22 : 0.08)) continue;
        const k = r();
        const px = x + 0.15 + r() * 0.7;
        const pz = y + 0.15 + r() * 0.7;
        /** @type {THREE.Mesh} */
        let o;
        if (k < 0.45) o = mesh(box(0.21, 0.004, 0.29), pick(paper), px, 0.002, pz);
        else if (k < 0.65) o = mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 10).rotateZ(Math.PI / 2), pick(can), px, 0.033, pz);
        else if (k < 0.85) o = mesh(box(0.35, 0.02, 0.25, { round: 0.008 }), rag, px, 0.001, pz);
        else if (k < 0.93) o = mesh(new THREE.CircleGeometry(0.1 + r() * 0.15, 12).rotateX(-Math.PI / 2), stain, px, 0.004, pz);
        else continue;
        o.rotation.y = r() * Math.PI * 2;
        g.add(o);
      }
  }

  // ------------------------------------------------------------------ streets at the sites
  // Road cells (YARD at a site) get their markings: edge lines and a dashed centre line along each band of road,
  // a zebra crossing where the entrance meets it, a curb where the sidewalk steps down to it; cones and tyres left
  // in the lanes; leaves blown over everything.
  if (site) {
    const road = (/** @type {number} */ x, /** @type {number} */ y) => at(x, y) === CELL.YARD;
    const paint = M('#b9b4a6', { roughness: 0.85 });
    const yellow = M('#c9a227', { roughness: 0.8 });
    const curb = M('concrete', { tint: 'light' });
    // bands of rows that are mostly road
    /** @type {{ y0: number, y1: number, x0: number, x1: number }[]} */
    const bands = [];
    for (let y = 0; y < fl.h; y++) {
      let x0 = -1;
      let x1 = -1;
      let n = 0;
      for (let x = 0; x < fl.w; x++)
        if (road(x, y)) {
          n++;
          if (x0 < 0) x0 = x;
          x1 = x;
        }
      const wide = n >= Math.max(4, (fl.w - 2) * 0.6);
      const last = bands[bands.length - 1];
      if (wide && last && last.y1 === y - 1) {
        last.y1 = y;
        last.x0 = Math.min(last.x0, x0);
        last.x1 = Math.max(last.x1, x1);
      } else if (wide) bands.push({ y0: y, y1: y, x0, x1 });
    }
    for (const b of bands) {
      const h = b.y1 - b.y0 + 1;
      if (h < 2) continue;
      const len = b.x1 - b.x0 + 1;
      const cx = b.x0 + len / 2;
      for (const z of [b.y0 + 0.15, b.y1 + 0.85]) g.add(mesh(box(len - 0.2, 0.004, 0.1), paint, cx, 0.003, z));
      if (h >= 3) for (let x = b.x0 + 0.3; x < b.x1 + 0.7; x += 1.6) g.add(mesh(box(0.9, 0.004, 0.1), yellow, x + 0.45, 0.003, b.y0 + h / 2));
      // a zebra crossing at the entrance's column (or a quarter of the way along)
      const door = (() => {
        for (let x = 0; x < fl.w; x++) for (const y of [0, fl.h - 1]) if (at(x, y) === CELL.DOOR) return x;
        return -1;
      })();
      const zx = door >= b.x0 && door <= b.x1 ? door + 0.5 : b.x0 + len / 4;
      for (let i = 0; i < 5; i++) g.add(mesh(box(0.35, 0.004, h - 0.5), paint, zx - 1 + i * 0.5, 0.004, b.y0 + h / 2));
    }
    // the curb: road cells against sidewalk
    for (let y = 0; y < fl.h; y++)
      for (let x = 0; x < fl.w; x++) {
        if (!road(x, y)) continue;
        if (at(x, y - 1) === CELL.OUTDOOR) g.add(mesh(box(1, 0.12, 0.14), curb, x + 0.5, 0, y + 0.07));
        if (at(x, y + 1) === CELL.OUTDOOR) g.add(mesh(box(1, 0.12, 0.14), curb, x + 0.5, 0, y + 0.93));
        if (at(x - 1, y) === CELL.OUTDOOR) g.add(mesh(box(0.14, 0.12, 1), curb, x + 0.07, 0, y + 0.5));
        if (at(x + 1, y) === CELL.OUTDOOR) g.add(mesh(box(0.14, 0.12, 1), curb, x + 0.93, 0, y + 0.5));
      }
    // cones and tyres left in the lanes
    const cone = M('plastic', { tint: '#e0621c', roughness: 0.5 });
    const band = M('#e8e6de', { roughness: 0.5 });
    const tyre = M('rubber', { tint: '#1d1d1f' });
    for (let y = 0; y < fl.h; y++)
      for (let x = 0; x < fl.w; x++) {
        if (!road(x, y) || taken.has(`${x},${y}`) || r() > 0.06) continue;
        const o = new THREE.Group();
        if (r() < 0.6) {
          o.add(mesh(box(0.34, 0.03, 0.34), cone, 0, 0, 0));
          o.add(mesh(cyl(0.03, 0.13, 0.5, 12), cone, 0, 0.03, 0));
          o.add(mesh(cyl(0.085, 0.1, 0.08, 12), band, 0, 0.22, 0));
          if (r() < 0.4) o.rotation.x = Math.PI / 2 - 0.1;
        } else {
          const t = mesh(new THREE.TorusGeometry(0.28, 0.1, 8, 18).rotateX(Math.PI / 2), tyre, 0, 0.1, 0);
          o.add(t);
        }
        o.position.set(x + 0.3 + r() * 0.4, 0, y + 0.3 + r() * 0.4);
        o.rotation.y = r() * Math.PI * 2;
        g.add(o);
        taken.add(`${x},${y}`);
      }
    // leaves: drifts along the curbs and walls, a scatter elsewhere
    const leafM = [M('#7a4a1c', { roughness: 0.9 }), M('#9a6424', { roughness: 0.9 }), M('#5a4a22', { roughness: 0.9 }), M('#a0742e', { roughness: 0.9 })];
    for (let y = 0; y < fl.h; y++)
      for (let x = 0; x < fl.w; x++) {
        const c = at(x, y);
        if (c !== CELL.YARD && c !== CELL.OUTDOOR) continue;
        const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(x + dx, y + dy) !== c);
        const n = Math.floor(r() * (edge ? 9 : 3));
        for (let i = 0; i < n; i++) {
          const leaf = mesh(box(0.07 + r() * 0.05, 0.003, 0.045 + r() * 0.03), pick(leafM), x + r(), 0.004 + r() * 0.004, y + r());
          leaf.rotation.y = r() * Math.PI * 2;
          g.add(leaf);
        }
      }
  }

  // wall lamps, before the merge dissolves their groups
  // ------------------------------------------------------------------ shops before the disaster
  // The source's stores (t019): department signs hung over the aisles, yellow tape round the displays, stocked
  // gondolas along the back and side walls, promotion pallets in the open floor.
  if (view.floorId === SHOP_FLOOR) {
    /** @type {any[]} */
    const fixtures = (view.furniture || []).filter((f) => String(f.uid).startsWith('fx:'));
    const shopId = String(fixtures[0]?.uid || '').split(':')[1] || '';
    const tape = M('#e6b52a', { roughness: 0.7 });
    // tape round every display and counter, 0.2 m out
    for (const f of fixtures) {
      if (!f.w || !f.h || f.kind === 'riot' || f.kind === 'cart') continue;
      const [x0, z0, x1, z1] = [f.x - 0.2, f.y - 0.2, f.x + f.w + 0.2, f.y + f.h + 0.2];
      g.add(mesh(box(x1 - x0, 0.004, 0.05), tape, (x0 + x1) / 2, 0.002, z0));
      g.add(mesh(box(x1 - x0, 0.004, 0.05), tape, (x0 + x1) / 2, 0.002, z1));
      g.add(mesh(box(0.05, 0.004, z1 - z0), tape, x0, 0.002, (z0 + z1) / 2));
      g.add(mesh(box(0.05, 0.004, z1 - z0), tape, x1, 0.002, (z0 + z1) / 2));
    }
    // department signs over the largest displays, at least 4 m apart, turned to the camera
    const shelves = fixtures.filter((f) => f.kind === 'shelf' && f.w * f.h >= 2).sort((a, b) => b.w * b.h - a.w * a.h || a.y - b.y || a.x - b.x);
    /** @type {[number, number][]} */
    const hung = [];
    const rod = M('metal_brushed', { tint: 'steel' });
    for (const f of shelves) {
      const cx = f.x + f.w / 2;
      const cz = f.y + f.h / 2;
      if (hung.some(([x, z]) => Math.hypot(x - cx, z - cz) < 4) || hung.length >= 4) continue;
      const text = signText(shopId, f);
      if (!text) continue;
      hung.push([cx, cz]);
      const o = new THREE.Group();
      o.position.set(cx, 0, cz);
      o.rotation.y = (CAMERA.yawDeg * Math.PI) / 180;
      o.add(mesh(box(1.7, 0.5, 0.03, { centered: true }), M('metal_painted', { tint: '#2f6db3' }), 0, 2.55, 0));
      // the face on a plane of its own (box UVs are in metres; the sign is one picture)
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.66, 0.46), signMaterial(text));
      face.position.set(0, 2.55, 0.017);
      o.add(face);
      o.add(mesh(box(1.74, 0.05, 0.05, { centered: true }), rod, 0, 2.82, 0));
      for (const sx of [-0.7, 0.7]) o.add(mesh(cyl(0.012, 0.012, 0.8, 6), rod, sx, 2.84, 0));
      g.add(o);
    }
    // stocked gondolas along the back (north) and west walls, in runs of free tiles
    const gondola = (/** @type {number} */ w) => {
      const o = new THREE.Group();
      const frame = M('metal_painted', { tint: pick(['grey', 'white', 'blue']) });
      o.add(mesh(box(w, 1.7, 0.05), frame, 0, 0, 0.03));
      for (const sx of [-1, 1]) o.add(mesh(box(0.04, 1.7, 0.45), frame, sx * (w / 2 - 0.02), 0, 0.25));
      for (const y of [0.12, 0.55, 0.98, 1.41]) {
        o.add(mesh(box(w - 0.06, 0.025, 0.42), frame, 0, y, 0.26));
        dress(ctx(w, 0.42), o, -w / 2 + 0.06, w / 2 - 0.06, y + 0.025, 0.25, 0.36, 0.34);
      }
      return o;
    };
    const rooms = fl.rooms?.length ? fl.rooms : [{ x: 1, y: 1, w: fl.w - 2, h: fl.h - 2 }];
    for (const room of rooms) {
      /** @type {(number[])[]} */
      const runs = [];
      let run = /** @type {number[]} */ ([]);
      for (let x = room.x; x <= room.x + room.w; x++) {
        // only where a wall stands behind (a show wing's open edge gets none)
        const ok = x < room.x + room.w && free(x, room.y) && !nearDoor(x, room.y) && at(x, room.y - 1) === CELL.WALL;
        if (ok) run.push(x);
        else if (run.length) (runs.push(run), (run = []));
      }
      for (const rn of runs) {
        const w = rn.length;
        const o = gondola(w - 0.1);
        o.position.set(rn[0] + w / 2, 0, room.y + 0.02);
        g.add(o);
        for (const x of rn) taken.add(`${x},${room.y}`);
      }
      run = [];
      for (let y = room.y; y <= room.y + room.h; y++) {
        const ok = y < room.y + room.h && free(room.x, y) && !nearDoor(room.x, y) && at(room.x - 1, y) === CELL.WALL;
        if (ok) run.push(y);
        else if (run.length) {
          if (run.length >= 2) {
            const o = gondola(run.length - 0.1);
            o.position.set(room.x + 0.02, 0, run[0] + run.length / 2);
            o.rotation.y = Math.PI / 2;
            g.add(o);
            for (const yy of run) taken.add(`${room.x},${yy}`);
          }
          run = [];
        }
      }
    }
    // promotion pallets on open floor away from the door: a stack of cartons or a pyramid of tins
    let placed = 0;
    for (let y = fl.h - 2; y >= 1 && placed < 3; y--)
      for (let x = 2; x < fl.w - 2 && placed < 3; x += 3) {
        const xx = x + Math.floor(r() * 2);
        if (!free(xx, y) || nearDoor(xx, y) || !free(xx, y - 1) || !free(xx + 1, y) || !free(xx - 1, y)) continue;
        const o = pallet();
        o.position.set(xx + 0.5, 0, y + 0.5);
        if (r() < 0.5) {
          for (let i = 0; i < 4; i++) {
            const c = carton(0.5, 0.32, 0.36);
            c.position.set((i % 2) * 0.52 - 0.26, 0.14 + Math.floor(i / 2) * 0.33, 0);
            o.add(c);
          }
        } else {
          const tin = M('metal_painted', { tint: pick(['red', 'green', 'blue', 'yellow']) });
          for (let row = 0; row < 3; row++)
            for (let i = 0; i < 4 - row; i++)
              for (let j = 0; j < 3 - row; j++) o.add(mesh(cyl(0.07, 0.07, 0.12, 10), tin, -0.3 + i * 0.16 + row * 0.08, 0.14 + row * 0.125, -0.2 + j * 0.16 + row * 0.08));
        }
        // a price card on a stick
        o.add(mesh(cyl(0.008, 0.008, 0.9, 6), rod, 0.45, 0.1, 0.32));
        o.add(mesh(box(0.3, 0.2, 0.01, { centered: true }), M('plastic', { tint: '#e2372b', roughness: 0.5 }), 0.45, 1.0, 0.33));
        o.rotation.y = r() < 0.5 ? 0 : Math.PI / 2;
        g.add(o);
        taken.add(`${xx},${y}`);
        placed++;
      }
  }

  /** @type {{ pos: THREE.Vector3, dir: THREE.Vector3 }[]} */
  const lamps = [];
  g.updateMatrixWorld(true);
  g.traverse((o) => {
    if (!o.userData.lampSpot) return;
    const pos = new THREE.Vector3(0, 2.0, 0.26).applyMatrix4(o.matrixWorld);
    const dir = new THREE.Vector3(0, -Math.sin((35 * Math.PI) / 180), Math.cos((35 * Math.PI) / 180)).transformDirection(o.matrixWorld);
    lamps.push({ pos, dir });
  });
  mergeStatic(g);
  g.traverse((o) => {
    o.userData.noPick = true;
    if (/** @type {THREE.Mesh} */ (o).isMesh) {
      o.castShadow = false;
      o.receiveShadow = true;
    }
  });
  return { group: g, glow, lamps };
}

/** What the dressing depends on besides the grid: furniture footprints and wall pieces, and the outbreak. @param {import('../contracts/view.js').SceneView} view */
export function dressingKey(view) {
  const after = view.clock?.outbreakAt != null && view.clock.t >= view.clock.outbreakAt;
  return `${after ? 1 : 0}|${(view.furniture || []).map((f) => `${f.x},${f.y},${f.w},${f.h}`).join(';')}`;
}

/** Department names over a shop's displays, by fixture id. */
const SIGNS = /** @type {Record<string, { en: string, zh: string }>} */ ({
  staples: { en: 'Staples', zh: '粮油主食' },
  snacks: { en: 'Snacks & Drinks', zh: '零食饮料' },
  deli: { en: 'Deli', zh: '熟食' },
  medicine: { en: 'Pharmacy', zh: '药品' },
  freezer: { en: 'Frozen', zh: '冷冻' },
  bigFreezer: { en: 'Frozen', zh: '冷冻' },
  condiments: { en: 'Condiments', zh: '调味品' },
  produce: { en: 'Fresh Produce', zh: '生鲜蔬果' },
  fruit: { en: 'Fruit', zh: '水果' },
  bestseller: { en: 'Best Sellers', zh: '热销' },
  nearExpiry: { en: 'Clearance', zh: '临期特价' },
  vip: { en: 'Wine & Spirits', zh: '烟酒' },
  food: { en: 'Groceries', zh: '食品' },
  specials: { en: 'Specials', zh: '特价' },
  magazines: { en: 'Magazines', zh: '杂志' },
  basic: { en: 'Materials', zh: '建材' },
  advanced: { en: 'Hardware', zh: '五金' },
  parts: { en: 'Parts', zh: '零件' },
  smallTools: { en: 'Hand Tools', zh: '手动工具' },
  largeTools: { en: 'Power Tools', zh: '电动工具' },
  fuel: { en: 'Fuel', zh: '燃料' },
  flowers: { en: 'Flowers', zh: '花卉' },
  smallSeeds: { en: 'Seeds', zh: '种子' },
  mediumSeeds: { en: 'Seeds', zh: '种子' },
  largeSeeds: { en: 'Seeds', zh: '种子' },
  mushrooms: { en: 'Mushrooms', zh: '菌菇' },
  fertilizer: { en: 'Garden', zh: '园艺' },
  traps: { en: 'Pest Control', zh: '捕鼠' },
  planters: { en: 'Planters', zh: '花盆' },
  canned: { en: 'Canned Food', zh: '罐头' },
  living: { en: 'Furniture', zh: '家具' },
  kitchenBath: { en: 'Kitchen & Bath', zh: '厨卫' },
  appliances: { en: 'Appliances', zh: '电器' },
  decor: { en: 'Decor', zh: '装饰' },
  security: { en: 'Security', zh: '安防' },
  autoParts: { en: 'Auto Parts', zh: '汽配' },
});

/** @param {string} shopId @param {any} f */
function signText(shopId, f) {
  const s = SIGNS[f.id];
  void shopId;
  return s ? pickLang(s) : null;
}

/**
 * A department board: blue with a yellow block and a white cart mark at the left, the name in white, chevrons at
 * the right (t019's signs). Lit a little from within so it reads in a dim store.
 * @param {string} text
 */
function signMaterial(text) {
  if (typeof document === 'undefined') return new THREE.MeshStandardMaterial({ color: '#2f6db3', roughness: 0.5 });
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 150;
  const x = c.getContext('2d');
  if (x) {
    x.fillStyle = '#2f6db3';
    x.fillRect(0, 0, 512, 150);
    x.fillStyle = '#f2c318';
    x.fillRect(0, 0, 120, 150);
    // a cart
    x.strokeStyle = '#ffffff';
    x.lineWidth = 7;
    x.beginPath();
    x.moveTo(22, 42);
    x.lineTo(38, 42);
    x.lineTo(50, 92);
    x.lineTo(96, 92);
    x.lineTo(102, 58);
    x.lineTo(44, 58);
    x.stroke();
    x.fillStyle = '#ffffff';
    for (const cx of [56, 90]) {
      x.beginPath();
      x.arc(cx, 108, 7, 0, Math.PI * 2);
      x.fill();
    }
    x.fillStyle = '#ffffff';
    let size = 64;
    x.font = `bold ${size}px "Arial Black", "Helvetica Neue", Arial, "Noto Sans SC", sans-serif`;
    while (x.measureText(text).width > 330 && size > 28) x.font = `bold ${(size -= 4)}px "Arial Black", "Helvetica Neue", Arial, "Noto Sans SC", sans-serif`;
    x.textBaseline = 'middle';
    x.fillText(text, 140, 78);
    x.font = 'bold 40px Arial, sans-serif';
    x.fillText('»', 478, 118);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.3 });
}

/**
 * A rime mask for a cold room's floor: specks and crystals everywhere, thicker toward the edges (the walls).
 * @param {() => number} r
 */
function frostTexture(r) {
  if (typeof document === 'undefined') return null;
  const n = 256;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  const x = c.getContext('2d');
  if (!x) return null;
  // an alpha map is read from the green channel: grey levels on black, not white at an alpha
  x.fillStyle = '#000';
  x.fillRect(0, 0, n, n);
  x.filter = 'blur(0.6px)';
  for (let i = 0; i < 9000; i++) {
    const px = r() * n;
    const py = r() * n;
    const edge = Math.min(px, py, n - px, n - py) / (n / 2);
    const a = (1 - edge) ** 3 * 0.6 + 0.04;
    if (r() > a * 1.4) continue;
    const v = Math.round(255 * Math.min(0.7, a + r() * 0.15));
    x.fillStyle = `rgb(${v},${v},${v})`;
    const s = 0.4 + r() * (edge < 0.15 ? 2.2 : 1.1);
    x.beginPath();
    x.arc(px, py, s, 0, Math.PI * 2);
    x.fill();
  }
  // a few feathery crystals
  x.strokeStyle = 'rgb(80,80,80)';
  x.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    let px = r() * n;
    let py = r() * n;
    let a = r() * Math.PI * 2;
    x.beginPath();
    x.moveTo(px, py);
    for (let k = 0; k < 6; k++) {
      a += (r() - 0.5) * 0.8;
      px += Math.cos(a) * 6;
      py += Math.sin(a) * 6;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  return new THREE.CanvasTexture(c);
}
