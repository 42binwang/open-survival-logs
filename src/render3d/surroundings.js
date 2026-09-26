// @ts-check
// The neighbourhood around a home or site: houses on either side and across the street, trees, parked cars, street
// lamps, bins and lane markings. Pure dressing outside the play grid, laid out deterministically from the scene id so
// it never shifts between visits; window panes of the neighbours glow at night.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, cyl, mesh } from './geom.js';
import { buildProp, rng } from './props.js';
import { mergeStatic } from './furniture.js';

/**
 * @param {import('../contracts/view.js').SceneView} view
 * @param {import('./materials.js').MaterialLibrary} lib
 */
export function buildSurroundings(view, lib) {
  const fl = view.floor;
  const g = new THREE.Group();
  g.name = 'surroundings';
  /** @type {THREE.MeshStandardMaterial[]} */
  const windowMats = [];
  /** @type {THREE.Vector3[]} */
  const lamps = [];
  if (view.basement || /^B\d$/.test(String(view.floorId))) return { group: g, windows: windowMats, lamps };
  let seed = 0;
  for (const ch of `${view.floorId}|${view.home || ''}`) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const r = rng(seed || 7);
  const pick = (/** @type {any[]} */ a) => a[Math.floor(r() * a.length) % a.length];

  const W = fl.w;
  const H = fl.h;
  const streetZ = H + 6; // centre line of the road in front
  // road markings
  const paint = lib.get('#d8d2c0', { roughness: 0.8 });
  for (let x = -30; x < W + 30; x += 3) g.add(mesh(box(1.6, 0.01, 0.12), paint, x, -0.225, streetZ));
  // far kerb and pavement across the street
  const pavement = lib.get('tile_ceramic', { tint: 'charcoal', secondary: 'dark', outdoor: true });
  const across = mesh(box(W + 60, 0.14, 4), pavement, W / 2, -0.24, streetZ + 5.5);
  across.castShadow = false;
  g.add(across);

  /**
   * A neighbour's house: a box with plaster walls, a slab roof and windows.
   * @param {number} x0 @param {number} z0 @param {number} w @param {number} d @param {number} floors
   */
  const house = (x0, z0, w, d, floors) => {
    const h = floors * 3.3;
    const wall = lib.get(pick(['plaster_painted', 'concrete', 'wallpaper_woodchip']), { tint: pick(['greige', 'warm', 'sealed_grey', 'terracotta', 'sage', 'cool']) });
    g.add(mesh(box(w, h, d), wall, x0 + w / 2, -0.1, z0 + d / 2));
    g.add(mesh(box(w + 0.3, 0.25, d + 0.3), lib.get('concrete', { tint: 'sealed_grey', outdoor: true }), x0 + w / 2, h - 0.1, z0 + d / 2));
    const glassDay = lib.get('#20272c', { roughness: 0.15 });
    const glowMat = lib.get('#20272c', { emissive: 1, emissiveColor: '#ffcf8a' });
    windowMats.push(glowMat);
    /** @type {THREE.BufferGeometry[]} */
    const dark = [];
    /** @type {THREE.BufferGeometry[]} */
    const lit = [];
    for (let f = 0; f < floors; f++) {
      for (let wx = x0 + 1; wx < x0 + w - 1; wx += 2.2) {
        const gl = box(1.1, 1.3, 0.05).translate(wx + 0.55, f * 3.3 + 1.0, z0 + d + 0.02);
        (r() < 0.35 ? lit : dark).push(gl);
        const gs = box(0.05, 1.3, 1.1).translate(x0 - 0.02, f * 3.3 + 1.0, z0 + ((wx - x0) / w) * d);
        (r() < 0.35 ? lit : dark).push(gs);
        const ge = gs.clone().translate(w + 0.04, 0, 0);
        (r() < 0.35 ? lit : dark).push(ge);
      }
    }
    /** @type {[THREE.BufferGeometry[], THREE.Material][]} */
    const sets = [
      [dark, glassDay],
      [lit, glowMat],
    ];
    for (const [list, m] of sets) {
      const merged = list.length ? mergeGeometries(list, false) : null;
      list.forEach((x) => x.dispose());
      if (merged) g.add(mesh(merged, m));
    }
  };

  // neighbours to the west and east of the plot, and a row across the street
  house(-14, -2, 9, H - 2, 2);
  house(W + 5, -1, 10, H - 3, 3);
  for (let x = -20; x < W + 20; x += 9 + Math.floor(r() * 4)) house(x, streetZ + 8, 7 + Math.floor(r() * 3), 8, 1 + Math.floor(r() * 3));
  // behind the building: a fence line and a row of trees (a house there fills the top of the frame)
  const fence = lib.get('wood_floor_pine', { tint: 'dark' });
  for (let x = -6; x < W + 6; x += 2.5) {
    g.add(mesh(box(0.1, 1.6, 0.1), fence, x, -0.1, -3.2));
    g.add(mesh(box(2.5, 0.12, 0.04), fence, x + 1.25, 0.5, -3.2));
    g.add(mesh(box(2.5, 0.12, 0.04), fence, x + 1.25, 1.2, -3.2));
  }

  // trees along the pavement across the street and in the gaps
  const bark = lib.get('bark', { tint: 'natural' });
  const leaves = [lib.get('fabric_curtain', { tint: '#40602f', doubleSide: true }), lib.get('fabric_curtain', { tint: '#56733a', doubleSide: true }), lib.get('fabric_curtain', { tint: '#34502a', doubleSide: true })];
  const tree = (/** @type {number} */ x, /** @type {number} */ z) => {
    const h = 2.4 + r() * 1.6;
    g.add(mesh(cyl(0.12, 0.18, h, 10), bark, x, -0.1, z));
    for (let i = 0; i < 7; i++) {
      const s = 0.8 + r() * 0.8;
      const l = mesh(new THREE.IcosahedronGeometry(s, 1), pick(leaves), x + (r() - 0.5) * 1.6, h + (r() - 0.2) * 1.2, z + (r() - 0.5) * 1.6);
      l.scale.y = 0.8;
      g.add(l);
    }
  };
  for (let x = -18; x < W + 18; x += 6 + r() * 4) tree(x, streetZ + 4.5);
  tree(-3.5, H + 1);
  tree(W + 3.5, H + 1.5);
  for (let x = -8; x < W + 8; x += 3.5 + r() * 2.5) tree(x, -5 - r() * 2);

  // garden verges on both sides of the plot and behind it (the source's homes stand in overgrown gardens: grass,
  // shrubs and long grass right up to the walls)
  const grass = lib.get('#48572f', { roughness: 0.95 });
  const blade = [lib.get('#5d6d38', { roughness: 0.9, doubleSide: true }), lib.get('#6f7a40', { roughness: 0.9, doubleSide: true }), lib.get('#4a5a2c', { roughness: 0.9, doubleSide: true })];
  const bloom = [lib.get('#c9b25a', { roughness: 0.8 }), lib.get('#e3e0d6', { roughness: 0.8 }), lib.get('#a8574a', { roughness: 0.8 })];
  /** @param {number} x0 @param {number} z0 @param {number} x1 @param {number} z1 */
  const verge = (x0, z0, x1, z1) => {
    const bed = mesh(box(x1 - x0, 0.06, z1 - z0), grass, (x0 + x1) / 2, -0.12, (z0 + z1) / 2);
    bed.castShadow = false;
    g.add(bed);
    const area = (x1 - x0) * (z1 - z0);
    // shrubs: clusters of leafy lumps
    for (let i = 0; i < area / 5; i++) {
      const x = x0 + 0.4 + r() * (x1 - x0 - 0.8);
      const z = z0 + 0.4 + r() * (z1 - z0 - 0.8);
      const s = 0.35 + r() * 0.35;
      for (let k = 0; k < 3; k++) {
        const l = mesh(new THREE.IcosahedronGeometry(s * (0.7 + r() * 0.4), 1), pick(leaves), x + (r() - 0.5) * s, -0.05 + s * 0.7 + r() * 0.15, z + (r() - 0.5) * s);
        l.scale.y = 0.75;
        g.add(l);
      }
    }
    // tufts of long grass, a few with a flower head
    for (let i = 0; i < area * 1.6; i++) {
      const x = x0 + r() * (x1 - x0);
      const z = z0 + r() * (z1 - z0);
      const h = 0.18 + r() * 0.35;
      const t = mesh(new THREE.ConeGeometry(0.05 + r() * 0.05, h, 4), pick(blade), x, -0.09 + h / 2, z);
      t.rotation.z = (r() - 0.5) * 0.4;
      t.castShadow = false;
      g.add(t);
      if (r() < 0.12) g.add(mesh(new THREE.SphereGeometry(0.035, 6, 4), pick(bloom), x, -0.09 + h + 0.02, z));
    }
  };
  verge(-3.4, -3, -0.2, H - 0.3);
  verge(W + 0.2, -3, W + 3.4, H - 0.3);
  verge(-0.2, -3, W + 0.2, -0.25);

  // parked cars along the far kerb, street lamps, bins
  const noF = /** @type {any} */ ({ uid: 'car', cfg: 0, x: 0, y: 0, w: 2, h: 4, data: {} });
  for (let x = -12; x < W + 12; x += 7 + r() * 6) {
    if (r() < 0.35) continue;
    const car = buildProp('car', { W: 1.9, D: 4.3, lib, rnd: r, name: pick(['轿车', 'SUV', '小汽车']), key: '', f: noF, slot: 3 });
    car.rotation.y = Math.PI / 2 + (r() - 0.5) * 0.06;
    car.position.set(x, -0.23, streetZ + 2.3);
    g.add(car);
  }
  const pole = lib.get('metal_painted', { tint: 'black' });
  for (let x = -10; x < W + 12; x += 12) {
    g.add(mesh(cyl(0.06, 0.09, 5, 10), pole, x, -0.1, H + 2.6));
    g.add(mesh(box(0.9, 0.08, 0.12), pole, x + 0.4, 4.85, H + 2.6));
    const head = lib.get('#1a1a1a', { emissive: 1, emissiveColor: '#ffd9a0' });
    windowMats.push(head);
    g.add(mesh(box(0.35, 0.1, 0.22), head, x + 0.8, 4.75, H + 2.6));
    lamps.push(new THREE.Vector3(x + 0.8, 4.6, H + 2.6));
  }
  const bin = lib.get('metal_painted', { tint: 'green' });
  for (let i = 0; i < 3; i++) g.add(mesh(box(0.7, 1.1, 0.7, { round: 0.05 }), bin, -2.2 - i * 0.8, -0.1, H + 0.6));

  // one mesh per material for the whole neighbourhood; only the houses and trees cast shadows onto the plot
  mergeStatic(g);
  g.traverse((o) => {
    o.userData.noPick = true;
    const m = /** @type {THREE.Mesh} */ (o);
    if (m.isMesh) m.castShadow = windowMats.includes(/** @type {any} */ (m.material)) ? false : m.castShadow;
  });
  return { group: g, windows: [...new Set(windowMats)], lamps };
}
