// @ts-check
// The building shell of one floor, built from the view's tile grid (src/contracts/view.js FloorGrid):
// floors per room surface, walls on the centre lines of wall tiles with ART.md §1.3's cutaway (camera-facing walls
// cut to 0.9 m when a room of this floor lies behind them), window and door openings with frames and glass, the
// yard and the street, and invisible key-light blockers over the rooms (ART.md §4.4 R1/R3: no sun patches indoors).
// World axes as in src/contracts/look.js: x = east = tile x, z = south = tile y, y up, 1 unit = 1 m = 1 tile.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL, cellAt } from '../contracts/view.js';
import { CAMERA } from '../contracts/look.js';
import { box, mesh } from './geom.js';
import { mergeStatic } from './furniture.js';

export const WALL_H = 3.1; // clear ceiling height (ART.md §2: 3.3 floor-to-floor − 0.2 slab)
export const CUT_H = CAMERA.cutWallHeight;
const EXT_T = 0.3;
const INT_T = 0.16;
const SILL = 0.9;
const PARAPET_H = 1.1;
/** Floor-to-floor height (ART.md §2). */
export const STOREY_H = 3.3;

/**
 * How many storeys above the street a floor stands (the street and the neighbourhood drop by that much).
 * @param {import('../contracts/view.js').SceneView} view
 */
export function storeyOf(view) {
  const m = /^(\d)F$/.exec(String(view.floorId));
  return m ? Math.max(0, Number(m[1]) - 1) : 0;
}
const HEAD = 2.2;
const OPEN_W = 0.9;

/** @typedef {{ name: string, tint?: string, secondary?: string, outdoor?: boolean }} Surf */
/** @typedef {{ floor: Surf, wall: Surf, wainscot?: Surf, skirting?: Surf }} RoomSurface */

/**
 * The surfaces of a room, chosen by its id (homes, shops and sites share the vocabulary).
 * @param {import('../contracts/view.js').Room | undefined} room
 * @param {import('../contracts/view.js').SceneView} view
 * @returns {RoomSurface}
 */
export function roomSurface(room, view) {
  const id = (room?.id || '').toLowerCase();
  const skirting = { name: 'wood_floor_oak', tint: 'smoked' };
  if (room?.cold || /cold|freezer/.test(id)) return { floor: { name: 'concrete', tint: 'cool' }, wall: { name: 'metal_painted', tint: 'white' } };
  // the warehouse's halls are bare industrial floor, not a lobby's tile
  if (/^hall[ab]$|warehouse/.test(id)) return { floor: { name: 'concrete', tint: 'raw' }, wall: { name: 'concrete', tint: 'sealed_grey' } };
  if (view.basement || /cellar|basement|garage|gen|storage|store|stock|dock|electrical|server/.test(id)) return { floor: { name: 'concrete', tint: 'raw' }, wall: { name: 'concrete', tint: 'warm' } };
  if (/bath/.test(id)) return { floor: { name: 'tile_ceramic', tint: 'white', secondary: 'grey' }, wall: { name: 'plaster_painted', tint: 'white' }, wainscot: { name: 'tile_ceramic', tint: 'blue', secondary: 'white' } };
  if (/kitchen/.test(id)) return { floor: { name: 'tile_ceramic', tint: 'cream', secondary: 'grey' }, wall: { name: 'plaster_painted', tint: 'warm_white' }, wainscot: { name: 'tile_ceramic', tint: 'white', secondary: 'grey' } };
  // rooftops and terraces: the source's roofs are pale, sun-bleached concrete (the roof-day pair, t0 14:40)
  if (/terrace|balcony|roof/.test(id)) return { floor: { name: 'concrete', tint: 'raw', outdoor: true }, wall: { name: 'concrete', tint: 'sealed_grey', outdoor: true } };
  if (/bed|loft|cabin/.test(id)) return { floor: { name: 'wood_floor_oak', tint: 'honey' }, wall: { name: 'wallpaper_woodchip', tint: 'cream' }, skirting };
  if (/class|lab|office|exec|records|archive|staff|security/.test(id)) return { floor: { name: 'laminate', tint: 'ash_grey' }, wall: { name: 'plaster_painted', tint: 'sage' }, skirting };
  if (/shop|lobby|appliances|decor|hall|corridor|passage|stairs|open/.test(id)) return { floor: { name: 'tile_ceramic', tint: 'white', secondary: 'dark' }, wall: { name: 'plaster_painted', tint: 'white' } };
  // shops and sites without rooms of their own: shop floors are pale tile, sites bare concrete
  if (!room && /^S|^shop/.test(String(view.floorId))) return { floor: { name: 'tile_ceramic', tint: 'white', secondary: 'grey' }, wall: { name: 'plaster_painted', tint: 'white' } };
  if (!room && /^site:/.test(String(view.floorId))) return { floor: { name: 'concrete', tint: 'warm' }, wall: { name: 'plaster_painted', tint: 'greige' } };
  if (/sunroom/.test(id)) return { floor: { name: 'tile_ceramic', tint: 'terracotta', secondary: 'grey' }, wall: { name: 'plaster_painted', tint: 'warm_white' }, skirting };
  // the tint pulls the reddish oak scan to the source's golden-hour floor (t035: hue 30°, S 0.58, V 0.37; ours
  // measured 28°, 0.60, 0.33 with it; it was 20°, 0.83, 0.23)
  return { floor: { name: 'wood_floor_oak', tint: '#c6ddd0' }, wall: { name: 'plaster_painted', tint: 'warm_white' }, skirting };
}

const EXTERIOR = /** @type {Surf} */ ({ name: 'concrete', tint: 'sealed_grey' });
const CAP = /** @type {Surf} */ ({ name: 'concrete', tint: '#8f8a84', outdoor: true });
const YARD = /** @type {Surf} */ ({ name: 'tile_ceramic', tint: 'charcoal', secondary: 'dark', outdoor: true });
const STREET = /** @type {Surf} */ ({ name: 'concrete', tint: '#5d5d5f', outdoor: true });
/** a site's ground and roads: worn, pale concrete and asphalt (the source's streets read light grey, not tiled) */
const SITE_GROUND = /** @type {Surf} */ ({ name: 'concrete', tint: 'raw', outdoor: true });
const SITE_ROAD = /** @type {Surf} */ ({ name: 'concrete', tint: '#b3b2ae', outdoor: true });
const FRAME = /** @type {Surf} */ ({ name: 'metal_painted', tint: '#4a4b4c' });

/** @param {number} c */
const wallish = (c) => c === CELL.WALL || c === CELL.WINDOW || c === CELL.DOOR;
/** @param {number} c */
const roomish = (c) => c === CELL.FLOOR || c === CELL.STAIRS_UP || c === CELL.STAIRS_DOWN || c === CELL.OUTDOOR;

/**
 * @typedef {object} ShellBuild
 * @property {THREE.Group} group
 * @property {THREE.Object3D[]} ground  meshes the floor pick rays hit
 * @property {{ x: number, z: number, room: string }[]} lamps  ceiling lamp spots, one per room
 * @property {{ minX: number, maxX: number, minZ: number, maxZ: number }} bounds
 */

/**
 * @param {import('../contracts/view.js').SceneView} view
 * @param {import('./materials.js').MaterialLibrary} lib
 * @returns {ShellBuild}
 */
export function buildShell(view, lib) {
  const fl = view.floor;
  const group = new THREE.Group();
  group.name = `shell:${view.floorId}`;
  /** @param {Surf} s */
  const mat = (s) => lib.get(s.name, { tint: s.tint, secondary: s.secondary, outdoor: !!s.outdoor });
  const at = (/** @type {number} */ x, /** @type {number} */ y) => cellAt(fl, x, y);

  // the room whose surfaces a tile shows (walls: the nearest room around it)
  /** @type {(x: number, y: number) => import('../contracts/view.js').Room | undefined} */
  const roomOf = (x, y) => view.roomAt?.(x, y);
  /** @param {number} x @param {number} y @returns {RoomSurface | null} */
  const surfAt = (x, y) => {
    const c = at(x, y);
    if (c === CELL.VOID || c === CELL.YARD) return null;
    if (c === CELL.OUTDOOR && !roomOf(x, y)) return roomSurface({ id: 'terrace', x, y, w: 1, h: 1 }, view);
    if (wallish(c)) return null;
    return roomSurface(roomOf(x, y), view);
  };

  // ------------------------------------------------------------------ floors
  /** @type {Map<string, { surf: Surf, quads: number[][] }>} */
  const floors = new Map();
  const addQuad = (/** @type {Surf} */ s, /** @type {number[]} */ q) => {
    const k = `${s.name}|${s.tint}|${s.secondary}`;
    if (!floors.has(k)) floors.set(k, { surf: s, quads: [] });
    floors.get(k)?.quads.push(q);
  };
  for (let y = 0; y < fl.h; y++) {
    for (let x = 0; x < fl.w; x++) {
      const c = at(x, y);
      if (c === CELL.VOID || c === CELL.YARD) continue;
      if (wallish(c)) {
        // under a wall: each quarter takes the floor of one neighbour beside it (the horizontal one first). One quad
        // per quarter: two rooms' halves overlapping in a corner (where a wall ends between a tiled and a wooden
        // room) are coplanar and z-fight, which reads as a twinkling saw-tooth along the join.
        for (const sx of [-1, 1]) {
          for (const sy of [-1, 1]) {
            const s = surfAt(x + sx, y) || surfAt(x, y + sy);
            if (!s) continue;
            const x0 = sx === 1 ? x + 0.5 : x;
            const y0 = sy === 1 ? y + 0.5 : y;
            addQuad(s.floor, [x0, y0, x0 + 0.5, y0 + 0.5]);
          }
        }
        continue;
      }
      const s = surfAt(x, y);
      if (s) addQuad(s.floor, [x, y, x + 1, y + 1]);
    }
  }
  /** @type {THREE.Object3D[]} */
  const ground = [];
  for (const { surf, quads } of floors.values()) {
    const pos = [];
    const uv = [];
    const idx = [];
    for (const [x0, z0, x1, z1] of quads) {
      const b = pos.length / 3;
      pos.push(x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1);
      uv.push(x0, -z0, x1, -z0, x1, -z1, x0, -z1);
      idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat(surf));
    m.receiveShadow = true;
    m.name = `floor:${surf.name}`;
    group.add(m);
    ground.push(m);
  }

  // slab under the building (seen at the cut front and in the stair holes)
  const inner = { x0: fl.w, x1: 0, z0: fl.h, z1: 0 };
  for (let y = 0; y < fl.h; y++) {
    for (let x = 0; x < fl.w; x++) {
      const c = at(x, y);
      if (c === CELL.VOID || c === CELL.YARD) continue;
      inner.x0 = Math.min(inner.x0, x);
      inner.x1 = Math.max(inner.x1, x + 1);
      inner.z0 = Math.min(inner.z0, y);
      inner.z1 = Math.max(inner.z1, y + 1);
    }
  }
  if (inner.x1 > inner.x0) {
    const slab = mesh(box(inner.x1 - inner.x0, 0.3, inner.z1 - inner.z0), mat(CAP), (inner.x0 + inner.x1) / 2, -0.305, (inner.z0 + inner.z1) / 2);
    slab.castShadow = false;
    group.add(slab);
  }

  // ------------------------------------------------------------------ yard and street
  const hasYard = fl.cells.includes(CELL.YARD);
  const storey = storeyOf(view);
  // the street level: this floor's own on the ground floor, storeys below on the floors above
  const street0 = new THREE.Group();
  street0.name = 'street';
  street0.position.y = -STOREY_H * storey;
  group.add(street0);
  if (storey > 0) {
    // the storeys below: the building's facade down to the street, with window bands
    const fx = inner.x1 - inner.x0;
    const fz = inner.z1 - inner.z0;
    const facade = mesh(box(fx - 0.2, STOREY_H * storey - 0.3, fz - 0.2), mat(EXTERIOR), (inner.x0 + inner.x1) / 2, -STOREY_H * storey, (inner.z0 + inner.z1) / 2);
    group.add(facade);
    const glass = lib.get('#20272c', { roughness: 0.15 });
    for (let k = 0; k < storey; k++) {
      for (let x = inner.x0 + 1; x < inner.x1 - 1; x += 2.5) group.add(mesh(box(1.2, 1.3, 0.04), glass, x + 0.6, -STOREY_H * (storey - k) + 0.9, inner.z1 - 0.08));
      for (let z = inner.z0 + 1; z < inner.z1 - 1; z += 2.5) group.add(mesh(box(0.04, 1.3, 1.2), glass, inner.x1 - 0.08, -STOREY_H * (storey - k) + 0.9, z + 0.6));
    }
  }
  if (!view.basement) {
    const pad = 40;
    const site = /^site:/.test(String(view.floorId));
    const street = mesh(box(fl.w + pad * 2, 0.1, fl.h + pad * 2), mat(site ? SITE_ROAD : STREET), fl.w / 2, -0.28, fl.h / 2);
    street.castShadow = false;
    street0.add(street);
    if (storey === 0) ground.push(street);
    // pavement around the building: the 25 cm tile scan at twice the scale reads as 50 cm pavers
    const pg = box(fl.w + 6, 0.12, fl.h + 6);
    const puv = pg.getAttribute('uv');
    for (let i = 0; i < puv.count; i++) puv.setXY(i, puv.getX(i) * 0.5, puv.getY(i) * 0.5);
    const pav = mesh(pg, mat(site ? SITE_GROUND : YARD), fl.w / 2, -0.14, fl.h / 2);
    pav.castShadow = false;
    street0.add(pav);
    if (storey === 0) ground.push(pav);
    // a planted verge along the street side and the far sides
    const soil = lib.get('soil', { tint: 'peat', outdoor: true });
    const leaf = [lib.get('fabric_curtain', { tint: '#46663a', doubleSide: true }), lib.get('fabric_curtain', { tint: '#5a7a40', doubleSide: true }), lib.get('fabric_curtain', { tint: '#3b5732', doubleSide: true })];
    let seed = fl.w * 131 + fl.h * 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    /** @param {number} x0 @param {number} z0 @param {number} w @param {number} d */
    const verge = (x0, z0, w, d) => {
      const v = mesh(box(w, 0.1, d), soil, x0 + w / 2, -0.12, z0 + d / 2);
      v.castShadow = false;
      street0.add(v);
      const n = Math.round((w * d) / 1.2);
      for (let i = 0; i < n; i++) {
        const r = 0.25 + rnd() * 0.35;
        const b = mesh(new THREE.IcosahedronGeometry(r, 1), leaf[Math.floor(rnd() * 3)], x0 + rnd() * w, r * 0.55, z0 + rnd() * d);
        b.scale.y = 0.75;
        street0.add(b);
      }
    };
    verge(-3, fl.h + 3, fl.w + 6, 1.2);
    verge(-4.2, -3, 1.2, fl.h + 7.2);
    verge(fl.w + 3, -3, 1.2, fl.h + 7.2);
    mergeStatic(street0);
    street0.traverse((o) => {
      if (/** @type {THREE.Mesh} */ (o).isMesh) o.castShadow = false;
    });
    // the merged street surfaces are what the floor rays hit on the ground floor
    if (storey === 0) street0.traverse((o) => {
      if (/** @type {THREE.Mesh} */ (o).isMesh && !ground.includes(o)) ground.push(o);
    });
  }
  if (hasYard) {
    for (let y = 0; y < fl.h; y++) {
      for (let x = 0; x < fl.w; x++) {
        if (at(x, y) !== CELL.YARD) continue;
        // kerb stones every other tile along the far edge of the yard
        if (y === fl.h - 1 && x % 2 === 0) {
          const k = mesh(box(1.9, 0.15, 0.25), mat({ name: 'concrete', tint: 'cool' }), x + 1, -0.02, y + 1.1);
          group.add(k);
        }
      }
    }
  }

  // ------------------------------------------------------------------ walls
  /** @param {number} x @param {number} y */
  const exterior = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
    const c = at(x + dx, y + dy);
    return c === CELL.VOID || c === CELL.YARD || (c === CELL.OUTDOOR && !roomOf(x + dx, y + dy));
  });
  // ART.md §1.3: a segment is cut when a room of this floor lies behind its camera-facing face
  // (camera to the south-east: horizontal runs face south, vertical runs face east)
  /** @param {number} x @param {number} y @param {'h' | 'v'} dir */
  const cut = (x, y, dir) => {
    const [bx, by] = dir === 'h' ? [x, y - 1] : [x - 1, y];
    return roomish(at(bx, by)) && !view.locked?.(bx, by);
  };
  /** @param {number} x @param {number} y @returns {Surf} */
  const faceSurf = (x, y) => {
    const s = surfAt(x, y);
    return s ? s.wall : EXTERIOR;
  };

  /** @type {THREE.BufferGeometry[]} */
  const walls = [];
  /** @type {THREE.Material[]} */
  const wallMats = [];
  /** @type {Map<THREE.Material, THREE.BufferGeometry[]>} */
  const byMat = new Map();
  const push = (/** @type {THREE.BufferGeometry} */ g, /** @type {THREE.Material} */ m) => {
    if (!byMat.has(m)) byMat.set(m, []);
    byMat.get(m)?.push(g);
  };
  const capM = mat(CAP);

  /**
   * A wall piece: an axis box whose side faces take the surface of the space they face.
   * @param {number} x0 @param {number} x1 @param {number} z0 @param {number} z1 @param {number} y0 @param {number} y1
   * @param {{ px: Surf, nx: Surf, pz: Surf, nz: Surf, capped?: boolean }} faces
   */
  const piece = (x0, x1, z0, z1, y0, y1, faces) => {
    const w = x1 - x0;
    const d = z1 - z0;
    const h = y1 - y0;
    if (w <= 1e-3 || d <= 1e-3 || h <= 1e-3) return;
    const g = box(w, h, d);
    g.translate((x0 + x1) / 2, y0, (z0 + z1) / 2);
    // shift UVs by the world position so neighbouring pieces continue the pattern
    const uv = g.getAttribute('uv');
    const groups = g.groups;
    const shifts = [[z0, y0], [-z1, y0], [x0, -z1], [x0, z0], [x0, y0], [-x1, y0]];
    for (let gi = 0; gi < groups.length; gi++) {
      const grp = groups[gi];
      const index = g.getIndex();
      const seen = new Set();
      for (let i = grp.start; i < grp.start + grp.count; i++) {
        const v = index ? index.getX(i) : i;
        if (seen.has(v)) continue;
        seen.add(v);
        uv.setXY(v, uv.getX(v) + shifts[gi][0], uv.getY(v) + shifts[gi][1]);
      }
    }
    const mats = [mat(faces.px), mat(faces.nx), capM, capM, mat(faces.pz), mat(faces.nz)];
    // split the box into single-material geometries so the whole floor merges into a few draw calls
    for (let gi = 0; gi < groups.length; gi++) {
      const grp = groups[gi];
      const sub = g.clone();
      sub.setIndex(Array.from({ length: grp.count }, (_, i) => /** @type {THREE.BufferAttribute} */ (g.getIndex()).getX(grp.start + i)));
      sub.clearGroups();
      push(sub, mats[gi]);
    }
    g.dispose();
  };

  /** @type {{ x: number, z: number, dir: 'h' | 'v', kind: number, cutWall: boolean, t: number }[]} */
  const openings = [];

  for (let y = 0; y < fl.h; y++) {
    for (let x = 0; x < fl.w; x++) {
      const c = at(x, y);
      if (!wallish(c)) continue;
      const E = wallish(at(x + 1, y));
      const W = wallish(at(x - 1, y));
      const S = wallish(at(x, y + 1));
      const N = wallish(at(x, y - 1));
      const t = exterior(x, y) ? EXT_T : INT_T;
      const cx = x + 0.5;
      const cz = y + 0.5;
      const horiz = E || W || !(N || S);
      const vert = N || S;
      // a wall with open terrace on one side and nothing indoors around it is a parapet
      const around = [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)];
      const parapet = around.includes(CELL.OUTDOOR) && !around.some((c2) => c2 === CELL.FLOOR || c2 === CELL.STAIRS_UP || c2 === CELL.STAIRS_DOWN);
      const full = parapet ? PARAPET_H : WALL_H;
      const hH = cut(x, y, 'h') ? Math.min(CUT_H, full) : full;
      const vH = cut(x, y, 'v') ? Math.min(CUT_H, full) : full;
      const hFaces = { px: CAP, nx: CAP, pz: faceSurf(x, y + 1), nz: faceSurf(x, y - 1) };
      const vFaces = { px: faceSurf(x + 1, y), nx: faceSurf(x - 1, y), pz: CAP, nz: CAP };

      if (c === CELL.DOOR || c === CELL.WINDOW) {
        const dir = horiz ? 'h' : 'v';
        const H = dir === 'h' ? hH : vH;
        const faces = dir === 'h' ? hFaces : vFaces;
        openings.push({ x, z: y, dir, kind: c, cutWall: H < WALL_H, t });
        const side = (1 - OPEN_W) / 2;
        const bottom = c === CELL.WINDOW ? Math.min(SILL, H) : 0;
        if (dir === 'h') {
          piece(x, x + side, cz - t / 2, cz + t / 2, 0, H, faces);
          piece(x + 1 - side, x + 1, cz - t / 2, cz + t / 2, 0, H, faces);
          if (bottom > 0) piece(x + side, x + 1 - side, cz - t / 2, cz + t / 2, 0, bottom, faces);
          if (H > HEAD) piece(x + side, x + 1 - side, cz - t / 2, cz + t / 2, HEAD, H, faces);
        } else {
          piece(cx - t / 2, cx + t / 2, y, y + side, 0, H, faces);
          piece(cx - t / 2, cx + t / 2, y + 1 - side, y + 1, 0, H, faces);
          if (bottom > 0) piece(cx - t / 2, cx + t / 2, y + side, y + 1 - side, 0, bottom, faces);
          if (H > HEAD) piece(cx - t / 2, cx + t / 2, y + side, y + 1 - side, HEAD, H, faces);
        }
        continue;
      }

      if (horiz) {
        const x0 = W ? x : cx - t / 2;
        const x1 = E ? x + 1 : cx + t / 2;
        piece(x0, x1, cz - t / 2, cz + t / 2, 0, hH, hFaces);
      }
      if (vert) {
        const z0 = N ? y : cz - t / 2;
        const z1 = S ? y + 1 : cz + t / 2;
        if (horiz) {
          if (N) piece(cx - t / 2, cx + t / 2, z0, cz - t / 2, 0, vH, vFaces);
          if (S) piece(cx - t / 2, cx + t / 2, cz + t / 2, z1, 0, vH, vFaces);
          if (vH > hH) piece(cx - t / 2, cx + t / 2, cz - t / 2, cz + t / 2, hH, vH, vFaces);
        } else piece(cx - t / 2, cx + t / 2, z0, z1, 0, vH, vFaces);
      }

      // wainscot tiles and skirting boards on room faces
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const s = surfAt(x + dx, y + dy);
        if (!s || (!s.wainscot && !s.skirting)) continue;
        const along = dy !== 0 ? horiz : vert;
        if (!along) continue;
        const H = dy !== 0 ? hH : vH;
        const top = s.wainscot ? Math.min(1.4, H) : Math.min(0.09, H);
        const th = s.wainscot ? 0.012 : 0.018;
        const surf = s.wainscot || /** @type {Surf} */ (s.skirting);
        const m = mat(surf);
        if (dy !== 0) {
          const x0 = W ? x : cx - t / 2;
          const x1 = E ? x + 1 : cx + t / 2;
          const zf = cz + (dy * t) / 2 + (dy * th) / 2;
          const g = box(x1 - x0, top, th);
          g.translate((x0 + x1) / 2, 0, zf);
          push(g, m);
        } else {
          const z0 = N ? y : cz - t / 2;
          const z1 = S ? y + 1 : cz + t / 2;
          const xf = cx + (dx * t) / 2 + (dx * th) / 2;
          const g = box(th, top, z1 - z0);
          g.translate(xf, 0, (z0 + z1) / 2);
          push(g, m);
        }
      }
    }
  }
  for (const [m, list] of byMat) {
    const merged = mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    if (!merged) continue;
    const w = new THREE.Mesh(merged, m);
    w.castShadow = true;
    w.receiveShadow = true;
    w.name = 'walls';
    walls.push(merged);
    wallMats.push(m);
    group.add(w);
  }

  // ------------------------------------------------------------------ frames and glass
  const frameM = mat(FRAME);
  const glassM = lib.get('glass', { opacity: 0.22 });
  // window pieces of furniture draw their own glass (broken, boarded); bare window cells get a plain pane
  const glazed = new Set((view.furniture || []).filter((f) => !f.w && at(f.x, f.y) === CELL.WINDOW).map((f) => `${f.x},${f.y}`));
  for (const o of openings) {
    const g = new THREE.Group();
    g.position.set(o.x + 0.5, 0, o.z + 0.5);
    if (o.dir === 'v') g.rotation.y = Math.PI / 2;
    const ft = 0.12;
    const top = o.kind === CELL.DOOR ? HEAD : HEAD;
    const bottom = o.kind === CELL.WINDOW ? SILL : 0;
    const fw = 0.06;
    g.add(mesh(box(fw, top - bottom, ft), frameM, -OPEN_W / 2 + fw / 2, bottom, 0));
    g.add(mesh(box(fw, top - bottom, ft), frameM, OPEN_W / 2 - fw / 2, bottom, 0));
    g.add(mesh(box(OPEN_W, fw, ft), frameM, 0, top - fw, 0));
    if (o.kind === CELL.WINDOW) {
      g.add(mesh(box(OPEN_W + 0.1, 0.04, o.t + 0.06), mat(CAP), 0, bottom - 0.02, 0));
      g.add(mesh(box(OPEN_W - 2 * fw, 0.04, 0.05), frameM, 0, (bottom + top) / 2, 0));
    }
    if (o.kind === CELL.WINDOW && !glazed.has(`${o.x},${o.z}`)) {
      const pane = new THREE.Mesh(box(OPEN_W - 2 * fw, top - bottom - fw, 0.01), glassM);
      pane.position.set(0, bottom, 0);
      pane.renderOrder = 2;
      g.add(pane);
    }
    group.add(g);
  }

  // ------------------------------------------------------------------ stairs
  for (let y = 0; y < fl.h; y++) {
    for (let x = 0; x < fl.w; x++) {
      const c = at(x, y);
      if (c !== CELL.STAIRS_UP && c !== CELL.STAIRS_DOWN) continue;
      const m = lib.get('wood_floor_oak', { tint: 'honey' });
      const steps = 5;
      for (let i = 0; i < steps; i++) {
        if (c === CELL.STAIRS_UP) {
          const s = mesh(box(0.9, 0.18 * (i + 1), 1 / steps), m, x + 0.5, 0, y + 1 - (i + 0.5) / steps);
          group.add(s);
        } else {
          const hole = mesh(box(0.9, 0.02, 0.9), lib.get('#0b0a09'), x + 0.5, 0.001, y + 0.5);
          hole.receiveShadow = false;
          if (i === 0) group.add(hole);
        }
      }
      if (c === CELL.STAIRS_UP) {
        const rail = mesh(box(0.04, 0.9, 1), frameM, x + 0.95, 0.9, y + 0.5);
        group.add(rail);
      }
    }
  }

  // ------------------------------------------------------------------ locked areas
  const lockedTiles = [];
  for (let y = 0; y < fl.h; y++) for (let x = 0; x < fl.w; x++) if (!wallish(at(x, y)) && at(x, y) !== CELL.VOID && view.locked?.(x, y)) lockedTiles.push([x, y]);
  if (lockedTiles.length) {
    const gs = lockedTiles.map(([x, y]) => box(1, 0.02, 1).translate(x + 0.5, 0.005, y + 0.5));
    const merged = mergeGeometries(gs, false);
    gs.forEach((g) => g.dispose());
    if (merged) {
      const shade = new THREE.Mesh(merged, lib.get('#050506', { opacity: 0.82 }));
      shade.renderOrder = 3;
      group.add(shade);
    }
  }

  // ------------------------------------------------------------------ key-light blockers (the floors above)
  if (!view.basement) {
    const rows = [];
    // the walls as they stand in the world, full height with openings closed: the cutaway and the windows are a
    // view of the building, not holes in it (ART.md §4.4 R3: no sun or moon patches indoors)
    for (let y = 0; y < fl.h; y++) {
      for (let x = 0; x < fl.w; x++) {
        if (!wallish(at(x, y))) continue;
        rows.push(box(1, WALL_H + 0.2, 1).translate(x + 0.5, 0, y + 0.5));
      }
    }
    for (let y = 0; y < fl.h; y++) {
      let run = -1;
      for (let x = 0; x <= fl.w; x++) {
        const c = x < fl.w ? at(x, y) : CELL.VOID;
        // open sky over the yard, outdoor cells outside any room, and rooms marked outdoor (terraces, balconies): the
        // sun lands there; every other cell has a roof or a floor above it
        const rm = roomOf(x, y);
        const covered = c !== CELL.VOID && c !== CELL.YARD && !rm?.outdoor && !(c === CELL.OUTDOOR && !rm);
        if (covered && run < 0) run = x;
        if (!covered && run >= 0) {
          rows.push(box(x - run, 0.2, 1).translate((run + x) / 2, WALL_H + 0.05, y + 0.5));
          run = -1;
        }
      }
    }
    const merged = rows.length ? mergeGeometries(rows, false) : null;
    rows.forEach((g) => g.dispose());
    if (merged) {
      const blocker = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
      blocker.castShadow = true;
      blocker.receiveShadow = false;
      blocker.name = 'keyBlocker';
      blocker.userData.noPick = true;
      group.add(blocker);
    }
  }

  // ------------------------------------------------------------------ lamps
  const lamps = (fl.rooms || []).filter((r) => !r.outdoor).map((r) => ({ x: r.x + r.w / 2, z: r.y + r.h / 2, room: r.id }));

  return { group, ground, lamps, bounds: { minX: 0, maxX: fl.w, minZ: 0, maxZ: fl.h } };
}

/**
 * A key for the grid and lock state, so the shell is rebuilt only when either changes.
 * @param {import('../contracts/view.js').SceneView} view
 */
export function shellKey(view) {
  const fl = view.floor;
  let locked = '';
  if (view.locked) for (let y = 0; y < fl.h; y++) for (let x = 0; x < fl.w; x++) locked += view.locked(x, y) ? '1' : '0';
  return `${view.floorId}|${view.home || ''}|${fl.w}x${fl.h}|${fl.cells.join('')}|${locked}|${view.basement ? 1 : 0}`;
}
