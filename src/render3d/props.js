// @ts-check
// Procedural prop models: every furniture family of the game config, built from textured parts with the material
// library. A builder gets the footprint in metres (front facing +z, width along x, depth along z, centred on the
// origin, base at y = 0) and returns a group. Families are chosen from the config's Chinese name (the same way the
// Canvas renderer picks its colours), so the ~1,250 config rows all get a fitting model.
import * as THREE from 'three';
import { box, cyl, mesh } from './geom.js';
import { plants as PLANTS_BY_ID } from '../data/db.js';

/**
 * @typedef {object} PropCtx
 * @property {number} W  footprint width, metres (along local x)
 * @property {number} D  footprint depth, metres (along local z)
 * @property {import('./materials.js').MaterialLibrary} lib
 * @property {() => number} rnd  seeded 0..1
 * @property {string} name  the config's Chinese name ('' for scenery keys)
 * @property {string} key  the scenery key or '' for config rows
 * @property {import('../contracts/view.js').ViewFurniture} f
 * @property {number} slot
 * @property {boolean} [cut]  wall pieces: the wall around them is cut down (ART.md §1.3)
 * @property {number} [side]  wall pieces: 1 when the room lies on the local +z side, -1 on the −z side
 */

/** @param {number} seed */
export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @template T @param {() => number} r @param {T[]} list @returns {T} */
const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];

// ------------------------------------------------------------------------------------------ shared parts

/** @param {PropCtx} c */
const M = (c) => ({
  wood: (tint = 'natural') => c.lib.get('wood_floor_oak', { tint }),
  pine: (tint = 'natural') => c.lib.get('wood_floor_pine', { tint }),
  lam: (tint = 'natural') => c.lib.get('laminate', { tint }),
  paint: (tint = 'grey') => c.lib.get('metal_painted', { tint }),
  steel: () => c.lib.get('metal_brushed', { tint: 'steel' }),
  plastic: (tint = 'black') => c.lib.get('plastic', { tint }),
  fabric: (tint = 'grey') => c.lib.get('fabric_sofa', { tint }),
  cloth: (tint = 'cream') => c.lib.get('fabric_curtain', { tint }),
  leather: (tint = 'brown') => c.lib.get('leather', { tint }),
  card: (tint = 'kraft') => c.lib.get('cardboard', { tint }),
  paper: (tint = 'fresh') => c.lib.get('newsprint', { tint }),
  ceramic: () => c.lib.get('plastic', { tint: 'white', roughness: 0.25 }),
  rubber: () => c.lib.get('rubber', { tint: 'black' }),
  soil: () => c.lib.get('soil', { tint: 'natural' }),
  bark: () => c.lib.get('bark', { tint: 'natural' }),
  concrete: (tint = 'raw') => c.lib.get('concrete', { tint }),
  rattan: () => c.lib.get('rattan', { tint: 'natural' }),
  glass: () => c.lib.get('glass', { opacity: 0.3 }),
  flat: (/** @type {string} */ hex) => c.lib.get(hex),
  glow: (/** @type {string} */ hex, k = 2) => c.lib.get('#111111', { emissive: k, emissiveColor: hex }),
});

/**
 * Four legs at the corners of a w × d rectangle.
 * @param {THREE.Group} g @param {number} w @param {number} d @param {number} h @param {number} t @param {THREE.Material} m
 */
function legs(g, w, d, h, t, m, inset = 0.04) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(box(t, h, t), m, sx * (w / 2 - inset - t / 2), 0, sz * (d / 2 - inset - t / 2)));
}

/**
 * A small cardboard box / tin / bottle cluster to dress shelves and tables.
 * @param {PropCtx} c @param {THREE.Group} g @param {number} x0 @param {number} x1 @param {number} y @param {number} z @param {number} depth @param {number} maxH
 */
export function dress(c, g, x0, x1, y, z, depth, maxH) {
  const m = M(c);
  // shop-shelf colours: printed packaging, tins, jars and jerrycans, packed with few gaps (the source's racks are full)
  const PACK = ['#c8412f', '#e07a2a', '#e8c23a', '#3f8a4a', '#2f6aa8', '#e9e4d8', '#7a3e8a', '#d85a7a', '#5aa8b8'];
  let x = x0 + 0.01;
  while (x < x1 - 0.06) {
    const kind = c.rnd();
    if (kind < 0.05) {
      x += 0.04 + c.rnd() * 0.08;
      continue;
    }
    if (kind < 0.3) {
      // cardboard cartons
      const bw = Math.min(x1 - x - 0.01, 0.2 + c.rnd() * 0.25);
      const bh = Math.min(maxH, 0.14 + c.rnd() * 0.22);
      const bd = Math.min(depth, 0.22 + c.rnd() * 0.18);
      if (bw < 0.07) break;
      const b = mesh(box(bw, bh, bd), m.card(pick(c.rnd, ['kraft', 'light', 'dark'])), x + bw / 2, y, z + (c.rnd() - 0.5) * 0.04);
      b.rotation.y = (c.rnd() - 0.5) * 0.1;
      g.add(b);
      // a second carton on top when there is room
      if (bh * 2 + 0.02 < maxH && c.rnd() < 0.4) g.add(mesh(box(bw * 0.9, bh * 0.8, bd * 0.9), m.card('light'), x + bw / 2, y + bh, z));
      x += bw + 0.01;
    } else if (kind < 0.55) {
      // printed product boxes in a row
      const n = 2 + Math.floor(c.rnd() * 4);
      const col = pick(c.rnd, PACK);
      const bw = 0.06 + c.rnd() * 0.05;
      const bh = Math.min(maxH, 0.12 + c.rnd() * 0.12);
      const pm = c.lib.get('plastic', { tint: col, roughness: 0.55 });
      for (let i = 0; i < n && x + bw < x1; i++) {
        g.add(mesh(box(bw, bh, Math.min(depth, 0.16)), pm, x + bw / 2, y, z + (c.rnd() - 0.5) * 0.03));
        x += bw + 0.004;
      }
      x += 0.015;
    } else if (kind < 0.75) {
      // tins, stacked two high sometimes
      const n = 2 + Math.floor(c.rnd() * 5);
      const r = 0.035 + c.rnd() * 0.015;
      const h = Math.min(maxH / 2, 0.09 + c.rnd() * 0.05);
      const tin = c.rnd() < 0.5 ? c.lib.get('metal_painted', { tint: pick(c.rnd, ['red', 'green', 'cream', 'blue', 'white']) }) : m.steel();
      const two = h * 2 + 0.01 < maxH && c.rnd() < 0.5;
      for (let i = 0; i < n && x + 2 * r < x1; i++) {
        g.add(mesh(cyl(r, r, h, 12), tin, x + r, y, z + (i % 2 ? 0.06 : -0.06)));
        if (two) g.add(mesh(cyl(r, r, h, 12), tin, x + r, y + h, z + (i % 2 ? 0.06 : -0.06)));
        x += 2 * r + 0.004;
      }
      x += 0.02;
    } else if (kind < 0.88) {
      // bottles and jars
      const n = 2 + Math.floor(c.rnd() * 4);
      const jar = c.rnd() < 0.4;
      const col = pick(c.rnd, jar ? ['#e9e4d8', '#d8b45a', '#b8452f'] : ['#2e5e3a', '#6b3a1f', '#d8d4c8', '#3a4d6b', '#b8452f']);
      for (let i = 0; i < n && x + 0.08 < x1; i++) {
        const h = Math.min(maxH, jar ? 0.12 : 0.22 + c.rnd() * 0.08);
        g.add(mesh(jar ? cyl(0.035, 0.035, h, 12) : cyl(0.012, 0.035, h, 10), c.lib.get('plastic', { tint: col, roughness: 0.25 }), x + 0.04, y, z + (c.rnd() - 0.5) * 0.08));
        x += 0.075;
      }
      x += 0.02;
    } else {
      // a jerrycan or a cool box
      const w = Math.min(x1 - x - 0.01, 0.3);
      const h = Math.min(maxH, 0.34);
      if (w < 0.15) break;
      const col = pick(c.rnd, ['#c8412f', '#3f8a4a', '#2f6aa8', '#e9e4d8']);
      g.add(mesh(box(w, h, Math.min(depth, 0.18), { round: 0.03 }), c.lib.get('plastic', { tint: col, roughness: 0.5 }), x + w / 2, y, z));
      x += w + 0.02;
    }
  }
}

/** Books on a shelf. @param {PropCtx} c @param {THREE.Group} g @param {number} x0 @param {number} x1 @param {number} y @param {number} z @param {number} maxH */
export function books(c, g, x0, x1, y, z, maxH) {
  let x = x0 + 0.01;
  const cols = ['#7a2f28', '#2f4a6b', '#3d5a3a', '#c9b48a', '#5a3d58', '#a36a2a', '#2b2b2b', '#d9d2c1'];
  while (x < x1 - 0.03) {
    if (c.rnd() < 0.08) {
      x += 0.05 + c.rnd() * 0.1;
      continue;
    }
    const t = 0.02 + c.rnd() * 0.035;
    const h = Math.min(maxH, 0.17 + c.rnd() * 0.12);
    const b = mesh(box(t, h, 0.16 + c.rnd() * 0.06), c.lib.get('leather', { tint: pick(c.rnd, cols) }), x + t / 2, y, z);
    if (c.rnd() < 0.08) b.rotation.z = 0.25;
    g.add(b);
    x += t + 0.002;
  }
}

// ------------------------------------------------------------------------------------------ builders

/** @type {Record<string, (c: PropCtx) => THREE.Group>} */
const B = {
  cabinet(c) {
    const g = new THREE.Group();
    const m = M(c);
    const n = c.name;
    const metal = /铁|金属|工具|文件|保险|储物柜|药|器械|配电|消防|机柜/.test(n);
    const H = /衣柜|立式大橱|大储物柜|储物柜|书柜|红酒柜|药品柜|器械柜|工具柜|文件柜|消防柜|机柜/.test(n) ? 1.9 : /床头柜|矮柜|抽屉柜|玄关/.test(n) ? 0.6 : /保险/.test(n) ? 0.8 : /配电/.test(n) ? 1.2 : 1.0;
    const W = c.W;
    const D = Math.min(c.D, 0.6);
    const body = metal ? m.paint(pick(c.rnd, ['grey', 'green', 'cream', 'blue'])) : m.lam(pick(c.rnd, ['natural', 'walnut', 'ash_grey', 'cherry']));
    g.add(mesh(box(W, H - 0.06, D), body, 0, 0.06, 0));
    g.add(mesh(box(W - 0.04, 0.06, D - 0.06), m.flat('#1c1a18'), 0, 0, 0.0));
    g.add(mesh(box(W + 0.02, 0.03, D + 0.02), body, 0, H - 0.03, 0));
    const doors = Math.max(1, Math.round(W / 0.5));
    const drawers = /抽屉|床头|文件|工具柜/.test(n);
    const dw = (W - 0.04) / doors;
    const handle = m.steel();
    if (drawers) {
      const rows = Math.max(2, Math.round((H - 0.1) / 0.28));
      const rh = (H - 0.12) / rows;
      for (let i = 0; i < rows; i++) {
        g.add(mesh(box(W - 0.05, rh - 0.02, 0.02), body, 0, 0.08 + i * rh, D / 2));
        g.add(mesh(box(0.14, 0.02, 0.025), handle, 0, 0.08 + i * rh + rh / 2, D / 2 + 0.02));
      }
    } else {
      for (let i = 0; i < doors; i++) {
        const x = -W / 2 + 0.02 + dw * (i + 0.5);
        g.add(mesh(box(dw - 0.015, H - 0.14, 0.02), body, x, 0.08, D / 2));
        const hx = x + (i % 2 ? -1 : 1) * (dw / 2 - 0.06);
        g.add(mesh(box(0.02, Math.min(0.3, H * 0.25), 0.03), handle, doors === 1 ? dw / 2 - 0.08 : hx, H * 0.45, D / 2 + 0.025));
      }
    }
    if (/保险/.test(n)) g.add(mesh(cyl(0.05, 0.05, 0.03, 16).rotateX(Math.PI / 2), handle, 0, H * 0.55, D / 2 + 0.02));
    if (H < 0.9 && c.rnd() < 0.7) dress(c, g, -W / 2 + 0.05, W / 2 - 0.05, H, 0, D * 0.6, 0.3);
    return g;
  },

  rack(c) {
    const g = new THREE.Group();
    const m = M(c);
    const n = c.name;
    const H = /小型|收纳架|小/.test(n) ? 1.2 : /超大|大型/.test(n) ? 2.2 : 2.0;
    const W = c.W;
    const D = Math.min(c.D, 0.55);
    const post = m.paint(pick(c.rnd, ['grey', 'blue', 'green']));
    const shelf = c.rnd() < 0.5 ? m.steel() : m.lam('ash_grey');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(box(0.035, H, 0.035), post, sx * (W / 2 - 0.02), 0, sz * (D / 2 - 0.02)));
    const levels = Math.max(3, Math.round(H / 0.45));
    for (let i = 0; i < levels; i++) {
      const y = 0.1 + (i * (H - 0.15)) / (levels - 1);
      g.add(mesh(box(W - 0.01, 0.025, D - 0.01), shelf, 0, y, 0));
      g.add(mesh(box(W, 0.04, 0.012), post, 0, y - 0.01, D / 2));
      g.add(mesh(box(W, 0.04, 0.012), post, 0, y - 0.01, -D / 2));
      if (i < levels - 1 && c.rnd() < 0.85) dress(c, g, -W / 2 + 0.03, W / 2 - 0.03, y + 0.025, 0, D - 0.1, (H - 0.15) / (levels - 1) - 0.06);
    }
    return g;
  },

  // 衣架 / 晾衣架 / 衣帽架: a rail on two T-feet with clothes on hangers (the College Student's 2F rack), not shelving
  clothesrack(c) {
    const g = new THREE.Group();
    const m = M(c);
    const W = Math.min(c.W, 1.4);
    const H = /衣帽架/.test(c.name) ? 1.75 : 1.55;
    const tube = m.steel();
    for (const s of [-1, 1]) {
      g.add(mesh(cyl(0.015, 0.015, H, 10), tube, (s * (W - 0.1)) / 2, 0, 0));
      g.add(mesh(box(0.04, 0.03, 0.42), tube, (s * (W - 0.1)) / 2, 0, 0));
    }
    g.add(mesh(cyl(0.013, 0.013, W - 0.08, 10).rotateZ(Math.PI / 2), tube, 0, H - 0.013, 0));
    const tints = ['#8a3b3b', '#2f4a66', '#d8d2c4', '#4b5a3a', '#6b5b73', '#c9a36a', '#303030'];
    const n = 4 + Math.floor(c.rnd() * 5);
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + 0.12 + ((W - 0.24) * (i + 0.5)) / n + (c.rnd() - 0.5) * 0.04;
      const long = c.rnd() < 0.35;
      const h = long ? 0.95 + c.rnd() * 0.2 : 0.6 + c.rnd() * 0.15;
      g.add(mesh(box(0.012, 0.08, 0.012), tube, x, H - 0.1, 0));
      const cloth = c.lib.get('fabric_curtain', { tint: pick(c.rnd, tints), doubleSide: true });
      const garment = mesh(box(0.05, h, 0.44, { round: 0.02 }), cloth, x, H - 0.1 - h, 0);
      garment.rotation.y = (c.rnd() - 0.5) * 0.12;
      g.add(garment);
    }
    return g;
  },

  // 花架 / 花盆架: a stepped stand of potted plants
  plantstand(c) {
    const g = new THREE.Group();
    const m = M(c);
    const W = Math.min(c.W, 1.2);
    const D = Math.min(c.D, 0.5);
    const wood = /铁|金属/.test(c.name) ? m.paint('black') : m.pine('natural');
    const steps = 3;
    for (let i = 0; i < steps; i++) {
      const y = 0.3 + i * 0.3;
      const z = D / 2 - ((i + 0.5) * D) / steps;
      g.add(mesh(box(W, 0.03, D / steps + 0.02), wood, 0, y, z));
      for (const s of [-1, 1]) g.add(mesh(box(0.03, y, 0.03), wood, s * (W / 2 - 0.03), 0, z));
      const pots = Math.max(2, Math.round(W / 0.28));
      for (let k = 0; k < pots; k++) {
        const x = -W / 2 + ((k + 0.5) * W) / pots;
        const r = 0.07 + c.rnd() * 0.03;
        g.add(mesh(cyl(r, r * 0.78, r * 1.5, 14), c.lib.get('plastic', { tint: pick(c.rnd, ['#b56a45', '#e6e0d4', '#9a5436']), roughness: 0.7 }), x, y + 0.03, z));
        const leaf = c.lib.get('fabric_curtain', { tint: pick(c.rnd, ['#4f7a3e', '#3f6b35', '#5c8a45', '#6d8a3c']), doubleSide: true });
        for (let j = 0; j < 4; j++) {
          const l = mesh(new THREE.IcosahedronGeometry(r * (0.9 + c.rnd() * 0.5), 1), leaf, x + (c.rnd() - 0.5) * r, y + 0.03 + r * 1.9 + c.rnd() * r, z + (c.rnd() - 0.5) * r);
          l.scale.y = 0.75;
          g.add(l);
        }
        if (c.rnd() < 0.4) g.add(mesh(new THREE.SphereGeometry(0.025, 8, 6), c.lib.get(pick(c.rnd, ['#d9534f', '#f0c040', '#e8e0f0']), { roughness: 0.8 }), x, y + 0.03 + r * 2.6, z));
      }
    }
    return g;
  },

  bookshelf(c) {
    const g = new THREE.Group();
    const m = M(c);
    const H = 1.9;
    const W = c.W;
    const D = Math.min(c.D, 0.35);
    const wood = m.lam(pick(c.rnd, ['walnut', 'natural', 'cherry']));
    g.add(mesh(box(0.03, H, D), wood, -W / 2 + 0.015, 0, 0));
    g.add(mesh(box(0.03, H, D), wood, W / 2 - 0.015, 0, 0));
    g.add(mesh(box(W, H, 0.015), wood, 0, 0, -D / 2 + 0.008));
    const levels = 5;
    for (let i = 0; i <= levels; i++) {
      const y = i === 0 ? 0 : (i * (H - 0.03)) / levels;
      g.add(mesh(box(W - 0.06, 0.03, D), wood, 0, y, 0));
      if (i < levels) books(c, g, -W / 2 + 0.035, W / 2 - 0.035, y + 0.03, 0.01, (H - 0.03) / levels - 0.05);
    }
    return g;
  },

  fridge(c) {
    const g = new THREE.Group();
    const m = M(c);
    const n = c.name;
    const wide = /双门|双开门|豪华/.test(n) || c.W > 1.2;
    const W = Math.min(c.W, wide ? 0.95 : 0.7);
    const D = Math.min(c.D, 0.7);
    const H = /食堂|医用/.test(n) ? 1.9 : 1.75;
    const body = /豪华/.test(n) ? m.steel() : m.paint(pick(c.rnd, ['white', 'white', 'cream', 'grey']));
    g.add(mesh(box(W, H - 0.05, D - 0.04, { round: 0.03 }), body, 0, 0.05, -0.02));
    g.add(mesh(box(W - 0.06, 0.05, D - 0.1), m.flat('#161514'), 0, 0, 0));
    const handle = m.steel();
    if (wide) {
      for (const s of [-1, 1]) {
        g.add(mesh(box(W / 2 - 0.012, H - 0.1, 0.03, { round: 0.01 }), body, (s * W) / 4, 0.07, D / 2 - 0.04));
        g.add(mesh(box(0.02, 0.5, 0.03), handle, s * 0.035, H * 0.5, D / 2 - 0.005));
      }
    } else {
      g.add(mesh(box(W - 0.01, H * 0.36, 0.03, { round: 0.01 }), body, 0, H * 0.62, D / 2 - 0.04));
      g.add(mesh(box(W - 0.01, H * 0.54, 0.03, { round: 0.01 }), body, 0, 0.07, D / 2 - 0.04));
      g.add(mesh(box(0.02, 0.25, 0.03), handle, W / 2 - 0.07, H * 0.68, D / 2 - 0.005));
      g.add(mesh(box(0.02, 0.35, 0.03), handle, W / 2 - 0.07, H * 0.38, D / 2 - 0.005));
    }
    if (c.f.powered !== false && c.f.on !== false) g.add(mesh(box(0.05, 0.02, 0.005), m.glow('#8fd3ff', 1.5), -W / 2 + 0.1, H * 0.85, D / 2 - 0.02));
    // things kept on top of a fridge
    dress(c, g, -W / 2 + 0.04, W / 2 - 0.04, H, -0.05, D * 0.6, 0.28);
    return g;
  },

  freezer(c) {
    const g = new THREE.Group();
    const m = M(c);
    // a shop's freezers are glass-topped displays of their stock; a home's is a closed chest
    const display = /冷柜|冷饮|热柜|鲜果|时蔬/.test(c.name) || String(c.f?.uid ?? '').startsWith('fx:');
    const W = c.W;
    const D = Math.min(c.D, 0.85);
    const H = display ? 0.95 : 0.88;
    const body = m.paint(display ? pick(c.rnd, ['white', 'blue']) : 'white');
    g.add(mesh(box(W - 0.08, 0.06, D - 0.08), m.flat('#1a1918'), 0, 0, 0));
    if (display) {
      // an open tub: the body stops below the rim, four rim walls round a lit well of stock, glass over it
      const well = 0.3;
      const t = 0.05;
      g.add(mesh(box(W, H - 0.06 - well, D, { round: 0.03 }), body, 0, 0.06, 0));
      for (const sz of [-1, 1]) g.add(mesh(box(W, well, t), body, 0, H - well, sz * (D / 2 - t / 2)));
      for (const sx of [-1, 1]) g.add(mesh(box(t, well, D - 2 * t), body, sx * (W / 2 - t / 2), H - well, 0));
      g.add(mesh(box(W - 2 * t, 0.01, D - 2 * t), m.glow('#d8f0ff', 0.5), 0, H - well, 0));
      dress(c, g, -W / 2 + 0.08, W / 2 - 0.08, H - well + 0.01, 0, D - 0.16, 0.22);
      g.add(mesh(box(W - 0.06, 0.015, D - 0.06), m.glass(), 0, H - 0.015, 0));
    } else {
      g.add(mesh(box(W, H - 0.08, D, { round: 0.03 }), body, 0, 0.06, 0));
      g.add(mesh(box(W + 0.01, 0.07, D + 0.01, { round: 0.02 }), body, 0, H - 0.05, 0));
      g.add(mesh(box(0.3, 0.03, 0.03), m.steel(), 0, H - 0.08, D / 2 + 0.015));
    }
    return g;
  },

  stove(c) {
    const g = new THREE.Group();
    const m = M(c);
    const W = c.W;
    const D = Math.min(c.D, 0.62);
    const H = 0.9;
    const body = m.lam(pick(c.rnd, ['ash_grey', 'natural', 'walnut']));
    g.add(mesh(box(W, H - 0.08, D - 0.05), body, 0, 0.08, -0.02));
    g.add(mesh(box(W - 0.05, 0.08, D - 0.1), m.flat('#171513'), 0, 0, -0.02));
    g.add(mesh(box(W + 0.02, 0.04, D + 0.02), m.steel(), 0, H - 0.04, 0));
    const doors = Math.max(1, Math.round(W / 0.5));
    for (let i = 0; i < doors; i++) {
      const x = -W / 2 + (W / doors) * (i + 0.5);
      g.add(mesh(box(W / doors - 0.02, H - 0.2, 0.02), body, x, 0.1, D / 2 - 0.03));
      g.add(mesh(box(0.14, 0.02, 0.025), m.steel(), x, H - 0.2, D / 2 - 0.01));
    }
    const burners = W > 1.2 ? 4 : 2;
    const hot = c.f.data?.cooking;
    for (let i = 0; i < burners; i++) {
      const bx = (i % 2 ? 1 : -1) * Math.min(0.25, W / 4) + (burners === 4 ? (i < 2 ? -W / 4 : W / 4) * 0.6 : 0);
      const bz = burners === 4 ? (i % 2 ? 0.12 : -0.12) : 0;
      g.add(mesh(cyl(0.11, 0.11, 0.015, 20), m.flat('#1d1d1d'), bx, H, bz));
      g.add(mesh(cyl(0.045, 0.045, 0.02, 16), hot ? m.glow('#ff7a2a', 3) : m.flat('#333333'), bx, H + 0.01, bz));
    }
    if (hot) g.add(mesh(cyl(0.13, 0.12, 0.16, 20), m.steel(), -Math.min(0.25, W / 4), H + 0.02, 0));
    else {
      // a pot on one burner, a kettle on another, a pan hung over the edge
      g.add(mesh(cyl(0.12, 0.11, 0.14, 20), m.steel(), -Math.min(0.25, W / 4), H + 0.02, burners === 4 ? -0.12 : 0));
      g.add(mesh(cyl(0.125, 0.125, 0.012, 20), m.steel(), -Math.min(0.25, W / 4), H + 0.16, burners === 4 ? -0.12 : 0));
      const kettle = c.lib.get('metal_painted', { tint: pick(c.rnd, ['red', 'cream', 'black']) });
      g.add(mesh(cyl(0.06, 0.085, 0.16, 16), kettle, Math.min(0.25, W / 4), H + 0.02, burners === 4 ? 0.12 : 0));
      g.add(mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 12, Math.PI), m.plastic('black'), Math.min(0.25, W / 4), H + 0.18, burners === 4 ? 0.12 : 0));
      if (W > 1) {
        g.add(mesh(box(0.35, 0.015, 0.25, { round: 0.005 }), c.lib.get('wood_floor_oak', { tint: 'honey' }), W / 2 - 0.25, H, -0.05));
        g.add(mesh(box(0.2, 0.006, 0.03), m.steel(), W / 2 - 0.25, H + 0.016, -0.05));
      }
    }
    for (let i = 0; i < 4; i++) g.add(mesh(cyl(0.018, 0.018, 0.03, 10).rotateX(Math.PI / 2), m.plastic('black'), -W / 2 + 0.15 + i * 0.1, H - 0.12, D / 2));
    return g;
  },

  campStove(c) {
    const g = new THREE.Group();
    const m = M(c);
    g.add(mesh(box(0.34, 0.12, 0.28, { round: 0.02 }), m.paint('red'), 0, 0, 0));
    g.add(mesh(cyl(0.09, 0.09, 0.02, 16), m.flat('#222222'), 0, 0.12, 0));
    if (c.f.data?.cooking) {
      g.add(mesh(cyl(0.04, 0.05, 0.03, 12), m.glow('#ff8a3a', 3), 0, 0.13, 0));
      g.add(mesh(cyl(0.11, 0.1, 0.12, 20), m.steel(), 0, 0.15, 0));
    }
    return g;
  },

  counter(c) {
    const g = new THREE.Group();
    const m = M(c);
    const W = c.W;
    const D = Math.min(c.D, 0.65);
    const H = /讲台/.test(c.name) ? 1.1 : 0.92;
    const body = m.lam(pick(c.rnd, ['walnut', 'natural', 'ash_grey']));
    g.add(mesh(box(W, H - 0.04, D - 0.04), body, 0, 0, -0.02));
    g.add(mesh(box(W + 0.02, 0.04, D), m.lam('ash_grey'), 0, H - 0.04, 0));
    if (/收银/.test(c.name)) g.add(mesh(box(0.35, 0.18, 0.3), m.plastic('grey'), W / 4, H, 0));
    else dress(c, g, -W / 2 + 0.05, W / 2 - 0.05, H, -0.05, D - 0.2, 0.35);
    return g;
  },

  sink(c) {
    const g = new THREE.Group();
    const m = M(c);
    const W = Math.min(c.W, 0.9);
    const D = Math.min(c.D, 0.55);
    const bath = /洗手|小便/.test(c.name) || c.slot === 1;
    if (bath) {
      g.add(mesh(cyl(0.07, 0.09, 0.78, 16), m.ceramic(), 0, 0, -0.1));
      g.add(mesh(box(0.55, 0.14, 0.42, { round: 0.05 }), m.ceramic(), 0, 0.72, -0.02));
      g.add(mesh(box(0.42, 0.02, 0.3, { round: 0.008 }), m.flat('#b8c2c6'), 0, 0.855, 0));
      g.add(mesh(cyl(0.015, 0.015, 0.15, 10), m.steel(), 0, 0.86, -0.17));
      g.add(mesh(box(0.02, 0.02, 0.12), m.steel(), 0, 0.99, -0.12));
      g.add(mesh(cyl(0.02, 0.025, 0.14, 10), c.lib.get('plastic', { tint: pick(c.rnd, ['#e9e4d8', '#5aa8b8', '#d85a7a']), roughness: 0.3 }), 0.2, 0.86, -0.12));
      g.add(mesh(cyl(0.03, 0.03, 0.09, 10), c.lib.get('glass', { opacity: 0.5 }), -0.2, 0.86, -0.12));
      g.add(mesh(box(0.14, 0.01, 0.02), c.lib.get('plastic', { tint: '#2f6aa8' }), -0.2, 0.95, -0.12));
      return g;
    }
    const body = m.lam(pick(c.rnd, ['natural', 'ash_grey']));
    g.add(mesh(box(W, 0.84, D - 0.04), body, 0, 0.04, -0.02));
    g.add(mesh(box(W + 0.02, 0.04, D), m.lam('ash_grey'), 0, 0.88, 0));
    g.add(mesh(box(W * 0.6, 0.025, D * 0.6), m.steel(), 0, 0.9, 0.02));
    g.add(mesh(box(W * 0.54, 0.01, D * 0.52), m.flat('#56595c'), 0, 0.905, 0.02));
    g.add(mesh(cyl(0.015, 0.015, 0.25, 10), m.steel(), 0, 0.92, -D / 2 + 0.08));
    g.add(mesh(box(0.02, 0.02, 0.16), m.steel(), 0, 1.16, -D / 2 + 0.15));
    // washing-up liquid, a sponge and a stack of plates beside the basin
    g.add(mesh(cyl(0.025, 0.032, 0.2, 10), c.lib.get('plastic', { tint: pick(c.rnd, ['#3f8a4a', '#e8c23a', '#2f6aa8']), roughness: 0.3 }), W * 0.38, 0.9, -0.12));
    g.add(mesh(box(0.09, 0.03, 0.06), c.lib.get('plastic', { tint: '#e8c23a', roughness: 0.9 }), W * 0.38, 0.9, 0.05));
    for (let i = 0; i < 4; i++) g.add(mesh(cyl(0.1, 0.08, 0.015, 18), m.ceramic(), -W * 0.38, 0.9 + i * 0.016, 0.02));
    return g;
  },

  toilet(c) {
    const g = new THREE.Group();
    const m = M(c);
    if (/小便/.test(c.name)) {
      g.add(mesh(box(0.38, 0.6, 0.3, { round: 0.1 }), m.ceramic(), 0, 0.5, -0.1));
      return g;
    }
    g.add(mesh(cyl(0.15, 0.12, 0.38, 20).scale(1, 1, 1.3), m.ceramic(), 0, 0, 0.05));
    g.add(mesh(cyl(0.19, 0.19, 0.04, 24).scale(1, 1, 1.25), m.ceramic(), 0, 0.38, 0.06));
    g.add(mesh(box(0.42, 0.4, 0.18, { round: 0.04 }), m.ceramic(), 0, 0.38, -0.22));
    g.add(mesh(box(0.44, 0.03, 0.2, { round: 0.01 }), m.ceramic(), 0, 0.78, -0.22));
    g.add(mesh(cyl(0.055, 0.055, 0.1, 14).rotateZ(Math.PI / 2).translate(0.05, 0.055, 0), c.lib.get('newsprint', { tint: 'fresh' }), 0.08, 0.81, -0.22));
    return g;
  },

  bathtub(c) {
    const g = new THREE.Group();
    const m = M(c);
    const W = c.W;
    const D = Math.min(c.D, 0.8);
    g.add(mesh(box(W, 0.55, D, { round: 0.06 }), m.ceramic(), 0, 0, 0));
    g.add(mesh(box(W - 0.14, 0.02, D - 0.14, { round: 0.005 }), m.flat('#b5c4c9'), 0, 0.535, 0));
    g.add(mesh(cyl(0.02, 0.02, 0.2, 10), m.steel(), -W / 2 + 0.1, 0.55, 0));
    const towel = c.lib.get('fabric_curtain', { tint: pick(c.rnd, ['#e9e4d8', '#5aa8b8', '#d8a0a0']) });
    g.add(mesh(box(0.4, 0.3, 0.02, { round: 0.008 }), towel, W / 4, 0.28, D / 2 + 0.01));
    g.add(mesh(box(0.4, 0.02, 0.12, { round: 0.008 }), towel, W / 4, 0.56, D / 2 - 0.05));
    g.add(mesh(cyl(0.03, 0.035, 0.16, 10), c.lib.get('plastic', { tint: '#d85a7a', roughness: 0.3 }), W / 2 - 0.12, 0.55, -D / 2 + 0.12));
    return g;
  },

  shower(c) {
    const g = new THREE.Group();
    const m = M(c);
    const W = Math.min(c.W, 0.95);
    const D = Math.min(c.D, 0.95);
    g.add(mesh(box(W, 0.06, D), m.ceramic(), 0, 0, 0));
    g.add(mesh(box(W, 1.95, 0.01), m.glass(), 0, 0.06, D / 2));
    g.add(mesh(box(0.01, 1.95, D), m.glass(), W / 2, 0.06, 0));
    g.add(mesh(cyl(0.012, 0.012, 1.9, 8), m.steel(), -W / 2 + 0.08, 0.06, -D / 2 + 0.08));
    g.add(mesh(cyl(0.08, 0.08, 0.02, 16), m.steel(), -W / 2 + 0.16, 1.95, -D / 2 + 0.16));
    return g;
  },

  bed(c) {
    const g = new THREE.Group();
    const m = M(c);
    const n = c.name;
    const metal = /铁|病床/.test(n);
    const W = Math.min(c.W, /双人/.test(n) ? 1.6 : c.W);
    const D = c.D;
    const frame = metal ? m.paint(pick(c.rnd, ['white', 'grey', 'black'])) : m.wood(pick(c.rnd, ['natural', 'honey', 'smoked']));
    // local: long side along z (head at -z)
    if (metal) {
      legs(g, W, D, 0.35, 0.04, frame, 0.02);
      g.add(mesh(box(W, 0.05, D), frame, 0, 0.3, 0));
      g.add(mesh(box(W, 0.55, 0.04), frame, 0, 0.35, -D / 2 + 0.02));
      for (let i = 0; i < 5; i++) g.add(mesh(box(0.025, 0.5, 0.025), frame, -W / 2 + 0.1 + (i * (W - 0.2)) / 4, 0.35, -D / 2 + 0.02));
    } else {
      g.add(mesh(box(W, 0.3, D), frame, 0, 0, 0));
      g.add(mesh(box(W + 0.04, 0.9, 0.06), frame, 0, 0, -D / 2 - 0.01));
    }
    const top = metal ? 0.35 : 0.3;
    g.add(mesh(box(W - 0.06, 0.18, D - 0.08, { round: 0.05 }), m.cloth('cream'), 0, top, 0.01));
    const blanket = m.cloth(pick(c.rnd, ['sage', 'blue', 'rose', 'ochre', 'grey']));
    g.add(mesh(box(W - 0.02, 0.06, D * 0.62, { round: 0.03 }), blanket, 0, top + 0.15, D * 0.18));
    const pw = W > 1.2 ? (W - 0.2) / 2 : W - 0.2;
    for (let i = 0; i < (W > 1.2 ? 2 : 1); i++) {
      const p = mesh(box(pw - 0.05, 0.12, 0.32, { round: 0.05 }), m.cloth('cream'), W > 1.2 ? (i ? 1 : -1) * (pw / 2 + 0.03) : 0, top + 0.15, -D / 2 + 0.25);
      p.rotation.x = -0.15;
      g.add(p);
    }
    if (c.f.data && /** @type {any} */ (c.f).sleeping) g.userData.sleeping = true;
    return g;
  },

  sofa(c) {
    const g = new THREE.Group();
    const m = M(c);
    const n = c.name;
    if (/懒人/.test(n)) {
      const b = mesh(new THREE.SphereGeometry(0.42, 24, 16).scale(1, 0.6, 1), m.fabric(pick(c.rnd, ['mustard', 'rust', 'olive'])), 0, 0.25, 0);
      g.add(b);
      return g;
    }
    const rattan = /藤/.test(n);
    const W = c.W;
    const D = Math.min(c.D, 0.9);
    const cover = rattan ? m.rattan() : /旧/.test(n) ? m.fabric('olive') : m.fabric(pick(c.rnd, ['grey', 'charcoal', 'navy', 'olive', 'rust', 'beige']));
    const cushion = rattan ? m.fabric('beige') : cover;
    g.add(mesh(box(W, 0.12, D - 0.05), m.flat('#1d1a17'), 0, 0, 0));
    g.add(mesh(box(W, 0.3, D - 0.05, { round: 0.04 }), cover, 0, 0.1, 0));
    g.add(mesh(box(W, 0.45, 0.22, { round: 0.06 }), cover, 0, 0.35, -D / 2 + 0.12));
    for (const s of [-1, 1]) g.add(mesh(box(0.2, 0.3, D - 0.05, { round: 0.06 }), cover, s * (W / 2 - 0.1), 0.35, 0));
    const seats = Math.max(1, Math.round((W - 0.4) / 0.6));
    const sw = (W - 0.42) / seats;
    for (let i = 0; i < seats; i++) g.add(mesh(box(sw - 0.02, 0.14, D - 0.3, { round: 0.05 }), cushion, -W / 2 + 0.21 + sw * (i + 0.5), 0.38, 0.08));
    if (!rattan && c.rnd() < 0.7) {
      const p = mesh(box(0.38, 0.36, 0.12, { round: 0.05 }), m.cloth(pick(c.rnd, ['ochre', 'rose', 'sage'])), -W / 2 + 0.45, 0.5, -D / 2 + 0.32);
      p.rotation.x = -0.3;
      p.rotation.z = 0.15;
      g.add(p);
    }
    return g;
  },

  armchair(c) {
    const g = new THREE.Group();
    const m = M(c);
    const cover = /按摩/.test(c.name) ? m.leather('black') : m.leather(pick(c.rnd, ['cognac', 'brown', 'oxblood']));
    const W = Math.min(c.W, 0.9);
    const D = Math.min(c.D, 0.9);
    g.add(mesh(box(W, 0.42, D, { round: 0.06 }), cover, 0, 0, 0));
    g.add(mesh(box(W, 0.6, 0.2, { round: 0.08 }), cover, 0, 0.4, -D / 2 + 0.1));
    for (const s of [-1, 1]) g.add(mesh(box(0.16, 0.24, D, { round: 0.06 }), cover, s * (W / 2 - 0.08), 0.4, 0));
    return g;
  },

  table(c) {
    const g = new THREE.Group();
    const m = M(c);
    const n = c.name;
    const low = /茶几/.test(n);
    const metal = /工具|检验|医疗|器械|实验/.test(n);
    const H = low ? 0.42 : /课桌/.test(n) ? 0.72 : 0.75;
    const W = c.W;
    const D = Math.min(c.D, low ? 0.6 : 0.85);
    const top = metal ? m.steel() : low ? m.lam(pick(c.rnd, ['walnut', 'natural'])) : m.wood(pick(c.rnd, ['natural', 'honey', 'smoked']));
    const legM = metal ? m.paint('grey') : top;
    g.add(mesh(box(W, 0.04, D), top, 0, H - 0.04, 0));
    legs(g, W, D, H - 0.04, low ? 0.05 : 0.045, legM);
    if (low) g.add(mesh(box(W - 0.12, 0.02, D - 0.12), top, 0, 0.12, 0));
    else g.add(mesh(box(W - 0.12, 0.06, 0.02), legM, 0, H - 0.1, -D / 2 + 0.06));
    if (/课桌椅|桌椅|餐桌/.test(n)) {
      for (const s of [-1, 1]) {
        const ch = B.chair({ ...c, W: 0.45, D: 0.45 });
        ch.position.set(s * W * 0.25, 0, D / 2 + 0.15);
        ch.rotation.y = Math.PI;
        g.add(ch);
      }
    }
    if (c.rnd() < 0.8) dress(c, g, -W / 2 + 0.1, W / 2 - 0.1, H, (c.rnd() - 0.5) * 0.1, D * 0.5, 0.25);
    return g;
  },

  chair(c) {
    const g = new THREE.Group();
    const m = M(c);
    const wood = m.wood(pick(c.rnd, ['natural', 'honey', 'smoked']));
    const stool = /凳/.test(c.name);
    legs(g, 0.42, 0.42, 0.44, 0.035, wood, 0.02);
    g.add(mesh(box(0.44, 0.04, 0.44), wood, 0, 0.44, 0));
    if (!stool) {
      g.add(mesh(box(0.42, 0.42, 0.03), wood, 0, 0.48, -0.2));
    }
    return g;
  },

  desk(c) {
    const g = B.table(c);
    const m = M(c);
    const H = 0.75;
    g.add(mesh(box(0.4, 0.25, 0.04), m.plastic('black'), 0, H + 0.05, -0.15));
    g.add(mesh(box(0.38, 0.22, 0.01), c.f.powered === false ? m.flat('#0c0c0c') : m.glow('#9ec8e6', 0.6), 0, H + 0.065, -0.128));
    g.add(mesh(box(0.08, 0.05, 0.08), m.plastic('black'), 0, H, -0.15));
    g.add(mesh(box(0.42, 0.015, 0.14), m.plastic('grey'), 0, H, 0.08));
    return g;
  },

  tv(c) {
    const g = new THREE.Group();
    const m = M(c);
    const on = c.f.on && c.f.powered !== false;
    const stand = c.slot !== 4;
    const y0 = stand ? 0.5 : 1.1;
    if (stand) {
      g.add(mesh(box(Math.max(1.0, c.W), 0.45, 0.42), m.lam('walnut'), 0, 0, 0));
    }
    g.add(mesh(box(0.98, 0.58, 0.05, { round: 0.01 }), m.plastic('black'), 0, y0, stand ? -0.05 : -c.D / 2 + 0.03));
    g.add(mesh(box(0.92, 0.52, 0.005), on ? m.glow('#6fa3c7', 1.2) : m.flat('#0d0e0f'), 0, y0 + 0.03, stand ? -0.02 : -c.D / 2 + 0.058));
    if (stand) g.add(mesh(box(0.3, 0.05, 0.2), m.plastic('black'), 0, 0.45, -0.05));
    return g;
  },

  planter(c) {
    const g = new THREE.Group();
    const m = M(c);
    const n = c.name;
    const W = c.W;
    const D = c.D;
    const elec = /植物灯|培育|恒温|LED|水培|全光谱/.test(n);
    const clay = /陶土|花盆/.test(n) && W < 1.1;
    const H = elec ? 0.5 : clay ? 0.4 : 0.45;
    let soilY = H - 0.05;
    if (clay && W <= 1 && D <= 1) {
      g.add(mesh(cyl(W * 0.32, W * 0.24, H, 24), c.lib.get('plastic', { tint: '#b56a45', roughness: 0.8 }), 0, 0, 0));
      g.add(mesh(cyl(W * 0.34, W * 0.34, 0.05, 24), c.lib.get('plastic', { tint: '#a85f3d', roughness: 0.8 }), 0, H - 0.05, 0));
      g.add(mesh(cyl(W * 0.3, W * 0.3, 0.02, 24), m.soil(), 0, H - 0.07, 0));
    } else {
      const wall = elec ? m.paint('white') : /石/.test(n) ? m.concrete('warm') : m.pine('dark');
      const t = 0.05;
      g.add(mesh(box(W, H, t), wall, 0, 0, D / 2 - t / 2));
      g.add(mesh(box(W, H, t), wall, 0, 0, -D / 2 + t / 2));
      g.add(mesh(box(t, H, D - 2 * t), wall, W / 2 - t / 2, 0, 0));
      g.add(mesh(box(t, H, D - 2 * t), wall, -W / 2 + t / 2, 0, 0));
      g.add(mesh(box(W - 2 * t, 0.02, D - 2 * t), m.soil(), 0, H - 0.07, 0));
      if (elec) {
        for (const s of [-1, 1]) g.add(mesh(box(0.03, 0.9, 0.03), m.steel(), s * (W / 2 - 0.02), H, 0));
        g.add(mesh(box(W, 0.04, 0.12), m.paint('white'), 0, H + 0.88, 0));
        if (c.f.powered !== false) g.add(mesh(box(W - 0.1, 0.01, 0.08), m.glow('#ff5ad9', 2.5), 0, H + 0.875, 0));
      }
      soilY = H - 0.05;
    }
    const p = c.f.data?.plant;
    if (p) plant(c, g, p, W, D, soilY);
    else if (c.f.data?.soil === 'tilled') for (let i = 0; i < 3; i++) g.add(mesh(box(W - 0.2, 0.03, 0.06), m.soil(), 0, soilY, -D / 3 + (i * D) / 3));
    return g;
  },

  houseplant(c) {
    const g = new THREE.Group();
    const m = M(c);
    const big = /景观树|树/.test(c.name) || c.slot === 3;
    const potR = big ? 0.26 : 0.16;
    g.add(mesh(cyl(potR, potR * 0.8, potR * 1.6, 20), c.lib.get('plastic', { tint: pick(c.rnd, ['#b56a45', '#e6e0d4', '#4d4f52']), roughness: 0.7 }), 0, 0, 0));
    g.add(mesh(cyl(potR * 0.92, potR * 0.92, 0.02, 20), m.soil(), 0, potR * 1.5, 0));
    const leaf = c.lib.get('fabric_curtain', { tint: pick(c.rnd, ['#4f7a3e', '#3f6b35', '#5c8a45']), doubleSide: true });
    const h = big ? 1.4 : 0.6;
    if (big) g.add(mesh(cyl(0.03, 0.04, h * 0.7, 8), m.bark(), 0, potR * 1.5, 0));
    const n = big ? 14 : 9;
    for (let i = 0; i < n; i++) {
      const a = c.rnd() * Math.PI * 2;
      const r = (big ? 0.35 : 0.15) * c.rnd();
      const s = (big ? 0.28 : 0.14) * (0.7 + c.rnd() * 0.6);
      const l = mesh(new THREE.IcosahedronGeometry(s, 1), leaf, Math.cos(a) * r, potR * 1.5 + h * (0.45 + 0.55 * c.rnd()), Math.sin(a) * r);
      l.scale.set(1, 0.7, 1);
      g.add(l);
    }
    return g;
  },

  crate(c) {
    const g = new THREE.Group();
    const m = M(c);
    const n = c.name;
    const wood = /木|板条|弹药/.test(n);
    const plastic = /塑料|收纳箱/.test(n);
    const W = Math.min(c.W, 0.9);
    const D = Math.min(c.D, 0.9);
    const H = /大/.test(n) ? 0.7 : 0.5;
    if (wood) {
      const w = /弹药/.test(n) ? m.paint('green') : m.pine('faded');
      g.add(mesh(box(W * 0.9, H, D * 0.8), w, 0, 0, 0));
      for (const y of [0.04, H - 0.08]) g.add(mesh(box(W * 0.92, 0.07, D * 0.82), m.pine('dark'), 0, y, 0));
    } else if (plastic) {
      g.add(mesh(box(W * 0.85, H * 0.8, D * 0.7, { round: 0.02 }), m.plastic(pick(c.rnd, ['grey', 'cream', 'black'])), 0, 0, 0));
    } else {
      const n2 = /堆|一堆/.test(n) ? 3 + Math.floor(c.rnd() * 3) : 1;
      for (let i = 0; i < n2; i++) {
        const bw = W * (0.5 + c.rnd() * 0.35);
        const bh = 0.3 + c.rnd() * 0.25;
        const b = mesh(box(bw, bh, D * (0.5 + c.rnd() * 0.3)), m.card(pick(c.rnd, ['kraft', 'light', 'dark'])), (c.rnd() - 0.5) * (W - bw), i === 0 || i === 3 ? 0 : 0.3 * (i % 2) + 0.28, (c.rnd() - 0.5) * 0.15);
        b.rotation.y = (c.rnd() - 0.5) * 0.4;
        g.add(b);
        if (n2 === 1) g.add(mesh(box(0.06, 0.002, D * 0.8), c.lib.get('plastic', { tint: '#c9a86a', roughness: 0.4 }), b.position.x, bh, b.position.z));
      }
    }
    return g;
  },

  pallet(c) {
    const g = new THREE.Group();
    const m = M(c);
    const W = c.W;
    const D = c.D;
    g.add(mesh(box(W, 0.12, D), m.pine('faded'), 0, 0, 0));
    const cols = Math.max(1, Math.round(W / 0.45));
    const rows = Math.max(1, Math.round(D / 0.45));
    const layers = 1 + Math.floor(c.rnd() * 3);
    for (let l = 0; l < layers; l++)
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < rows; j++) {
          if (c.rnd() < 0.15 * l) continue;
          const bw = W / cols - 0.03;
          const bd = D / rows - 0.03;
          const b = mesh(box(bw, 0.38, bd), m.card(pick(c.rnd, ['kraft', 'light', 'kraft'])), -W / 2 + (i + 0.5) * (W / cols), 0.12 + l * 0.39, -D / 2 + (j + 0.5) * (D / rows));
          b.rotation.y = (c.rnd() - 0.5) * 0.05;
          g.add(b);
        }
    return g;
  },

  pile(c) {
    const g = new THREE.Group();
    const m = M(c);
    const n = c.name + c.key;
    const W = c.W;
    const D = c.D;
    const count = Math.round(6 + W * D * 5);
    const rubble = /rubble|砖|建材|障碍|路障/.test(n);
    const trash = /垃圾|发霉|junk/.test(n);
    for (let i = 0; i < count; i++) {
      const k = c.rnd();
      const x = (c.rnd() - 0.5) * (W - 0.3);
      const z = (c.rnd() - 0.5) * (D - 0.3);
      const y = c.rnd() * 0.25;
      /** @type {THREE.Mesh} */
      let o;
      if (rubble) {
        o = k < 0.6 ? mesh(new THREE.DodecahedronGeometry(0.1 + c.rnd() * 0.15, 0), m.concrete(pick(c.rnd, ['raw', 'warm', 'cool'])), x, y, z) : mesh(box(0.22, 0.07, 0.11), c.lib.get('plastic', { tint: '#9a4f35', roughness: 0.9 }), x, y, z);
      } else if (k < 0.35) o = mesh(box(0.2 + c.rnd() * 0.3, 0.12 + c.rnd() * 0.25, 0.2 + c.rnd() * 0.25), m.card(pick(c.rnd, ['kraft', 'dark'])), x, y, z);
      else if (k < 0.55) o = mesh(box(0.6 + c.rnd() * 0.5, 0.03, 0.1), m.pine(pick(c.rnd, ['faded', 'dark'])), x, y, z);
      else if (k < 0.7) o = mesh(cyl(0.06, 0.06, 0.15, 10), m.steel(), x, y, z);
      else if (k < 0.85 && trash) o = mesh(new THREE.SphereGeometry(0.18 + c.rnd() * 0.1, 10, 8), m.plastic('black'), x, y + 0.12, z);
      else o = mesh(box(0.25, 0.25, 0.25), m.paint(pick(c.rnd, ['grey', 'red', 'green'])), x, y, z);
      o.rotation.set((c.rnd() - 0.5) * 0.8, c.rnd() * Math.PI, (c.rnd() - 0.5) * 0.8);
      g.add(o);
    }
    return g;
  },

  woodpile(c) {
    const g = new THREE.Group();
    const m = M(c);
    const W = c.W;
    const D = c.D;
    const r = 0.07;
    const rows = 4;
    for (let l = 0; l < rows; l++) {
      const n = Math.floor((W - 0.2) / (2 * r)) - l;
      for (let i = 0; i < n; i++) {
        const log = mesh(cyl(r * (0.85 + c.rnd() * 0.3), r, D - 0.2 - c.rnd() * 0.15, 10).rotateX(Math.PI / 2), m.bark(), -((n - 1) * r) + i * 2 * r, l * r * 1.7, (c.rnd() - 0.5) * 0.08);
        log.position.y += 0;
        g.add(log);
      }
    }
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.4, 14), m.pine('dark'), W / 2 - 0.3, 0.2, D / 2 - 0.3));
    return g;
  },

  newspapers(c) {
    const g = new THREE.Group();
    const m = M(c);
    const W = c.W;
    const D = c.D;
    const stacks = Math.max(2, Math.round(W * D * 3));
    for (let i = 0; i < stacks; i++) {
      const h = 0.1 + c.rnd() * 0.4;
      const s = mesh(box(0.42, h, 0.3), m.paper(pick(c.rnd, ['fresh', 'yellowed', 'grey'])), (c.rnd() - 0.5) * (W - 0.5), 0, (c.rnd() - 0.5) * (D - 0.4));
      s.rotation.y = (c.rnd() - 0.5) * 0.5;
      g.add(s);
      g.add(mesh(box(0.02, h + 0.005, 0.31), c.lib.get('plastic', { tint: '#c9b17a' }), s.position.x, 0, s.position.z).rotateY(s.rotation.y));
    }
    return g;
  },

  generator(c) {
    const g = new THREE.Group();
    const m = M(c);
    const W = Math.min(c.W, 1.2);
    const D = Math.min(c.D, 0.8);
    const H = /超大/.test(c.name) ? 1.1 : /人力/.test(c.name) ? 0.9 : 0.7;
    const frame = m.paint('black');
    for (const sx of [-1, 1]) {
      g.add(mesh(box(0.035, H, 0.035), frame, sx * (W / 2 - 0.03), 0, D / 2 - 0.03));
      g.add(mesh(box(0.035, H, 0.035), frame, sx * (W / 2 - 0.03), 0, -D / 2 + 0.03));
    }
    g.add(mesh(box(W, 0.035, 0.035), frame, 0, H - 0.035, D / 2 - 0.03));
    g.add(mesh(box(W, 0.035, 0.035), frame, 0, H - 0.035, -D / 2 + 0.03));
    g.add(mesh(box(W * 0.8, H * 0.35, D * 0.7, { round: 0.03 }), m.paint(pick(c.rnd, ['red', 'green', 'blue'])), 0, H * 0.6, 0));
    g.add(mesh(box(W * 0.45, H * 0.45, D * 0.6), m.steel(), -W * 0.12, 0.05, 0));
    g.add(mesh(cyl(0.08, 0.08, 0.1, 14).rotateZ(Math.PI / 2), m.steel(), W * 0.3, H * 0.3, 0));
    g.add(mesh(cyl(0.04, 0.04, 0.05, 12), m.plastic('black'), W * 0.2, H * 0.95, 0));
    if (c.f.on) g.add(mesh(box(0.04, 0.02, 0.01), m.glow('#5bff7a', 2), W * 0.35, H * 0.5, D * 0.36));
    return g;
  },

  solar(c) {
    const g = new THREE.Group();
    const m = M(c);
    const W = c.W;
    const D = c.D;
    const frame = m.steel();
    const tilt = 0.5;
    const panel = new THREE.Group();
    panel.add(mesh(box(W - 0.1, 0.04, D - 0.1), frame, 0, 0, 0));
    const cellsX = Math.max(2, Math.round((W - 0.15) / 0.18));
    const cellsZ = Math.max(2, Math.round((D - 0.15) / 0.18));
    const cellM = c.lib.get('#1a2b48');
    cellM.roughness = 0.2;
    cellM.metalness = 0.4;
    for (let i = 0; i < cellsX; i++)
      for (let j = 0; j < cellsZ; j++) panel.add(mesh(box((W - 0.15) / cellsX - 0.012, 0.01, (D - 0.15) / cellsZ - 0.012), cellM, -W / 2 + 0.075 + ((i + 0.5) * (W - 0.15)) / cellsX, 0.04, -D / 2 + 0.075 + ((j + 0.5) * (D - 0.15)) / cellsZ));
    panel.rotation.x = -tilt;
    panel.position.y = 0.2 + (Math.sin(tilt) * D) / 2;
    g.add(panel);
    g.add(mesh(box(0.04, 0.2 + Math.sin(tilt) * D, 0.04), frame, -W / 2 + 0.1, 0, -D / 2 + 0.15));
    g.add(mesh(box(0.04, 0.2 + Math.sin(tilt) * D, 0.04), frame, W / 2 - 0.1, 0, -D / 2 + 0.15));
    g.add(mesh(box(0.04, 0.2, 0.04), frame, -W / 2 + 0.1, 0, D / 2 - 0.15));
    g.add(mesh(box(0.04, 0.2, 0.04), frame, W / 2 - 0.1, 0, D / 2 - 0.15));
    return g;
  },

  battery(c) {
    const g = new THREE.Group();
    const m = M(c);
    const W = Math.min(c.W, 0.9);
    const D = Math.min(c.D, 0.6);
    const H = /超大|储电站|储电装置/.test(c.name) ? 1.2 : 0.45;
    g.add(mesh(box(W * 0.8, H, D * 0.7, { round: 0.02 }), m.paint(H > 1 ? 'white' : 'black'), 0, 0, 0));
    g.add(mesh(box(W * 0.3, 0.06, 0.01), m.glow('#62ff8f', 1.5), 0, H * 0.7, D * 0.35 + 0.002));
    for (const s of [-1, 1]) g.add(mesh(cyl(0.025, 0.025, 0.04, 10), s < 0 ? m.paint('red') : m.plastic('black'), s * W * 0.25, H, 0));
    return g;
  },

  ratgen(c) {
    const g = new THREE.Group();
    const m = M(c);
    const W = Math.min(c.W, 1.2);
    const D = Math.min(c.D, 0.8);
    const H = /超大/.test(c.name) ? 1.2 : /大型/.test(c.name) ? 0.9 : 0.6;
    g.add(mesh(box(W, 0.06, D), m.pine('dark'), 0, 0, 0));
    const bar = m.steel();
    const n = Math.round(W / 0.06);
    for (let i = 0; i <= n; i++) {
      g.add(mesh(box(0.008, H, 0.008), bar, -W / 2 + (i * W) / n, 0.06, D / 2 - 0.01));
      g.add(mesh(box(0.008, H, 0.008), bar, -W / 2 + (i * W) / n, 0.06, -D / 2 + 0.01));
    }
    g.add(mesh(box(W, 0.01, D), bar, 0, H + 0.06, 0));
    const wheel = mesh(new THREE.TorusGeometry(H * 0.32, 0.015, 8, 24), bar, 0, H * 0.45, 0);
    g.add(wheel);
    g.userData.spin = wheel;
    return g;
  },

  heater(c) {
    const g = new THREE.Group();
    const m = M(c);
    const n = c.name;
    if (/空调/.test(n)) {
      const W = Math.min(c.W, 0.9);
      g.add(mesh(box(W * 0.9, 0.62, 0.4, { round: 0.03 }), m.paint('white'), 0, 0, 0));
      g.add(mesh(cyl(0.2, 0.2, 0.01, 24).rotateX(Math.PI / 2), m.flat('#3a3a3a'), -W * 0.1, 0.31, 0.2));
      return g;
    }
    g.add(mesh(cyl(0.22, 0.25, 0.7, 20), m.paint('black'), 0, 0, 0));
    g.add(mesh(cyl(0.05, 0.05, 1.3, 10), m.steel(), 0, 0.7, -0.05));
    const lit = c.f.on && c.f.powered !== false;
    g.add(mesh(box(0.16, 0.12, 0.01), lit ? m.glow('#ff8a3a', 3) : m.flat('#141414'), 0, 0.25, 0.235));
    return g;
  },

  appliance(c) {
    const g = new THREE.Group();
    const m = M(c);
    const n = c.name;
    if (/洗衣机/.test(n)) {
      g.add(mesh(box(0.6, 0.85, 0.6, { round: 0.03 }), m.paint('white'), 0, 0, 0));
      g.add(mesh(cyl(0.2, 0.2, 0.03, 24).rotateX(Math.PI / 2), m.glass(), 0, 0.45, 0.3));
      g.add(mesh(new THREE.TorusGeometry(0.21, 0.025, 8, 24), m.steel(), 0, 0.45, 0.31));
      return g;
    }
    if (/饮水机/.test(n)) {
      g.add(mesh(box(0.34, 1.0, 0.34, { round: 0.02 }), m.paint('white'), 0, 0, 0));
      g.add(mesh(cyl(0.14, 0.14, 0.42, 20), c.lib.get('glass', { opacity: 0.45 }), 0, 1.0, 0));
      return g;
    }
    const table = c.slot === 6 || /微波|烤箱|电脑|打印|咖啡|榨汁|唱片|收音|电火锅|热水壶/.test(n);
    const y = table ? 0.75 : 0;
    if (table) {
      const t = B.table({ ...c, W: Math.max(0.6, c.W), D: Math.max(0.5, c.D), name: '小桌' });
      t.children.splice(6);
      g.add(t);
    }
    if (/收音|radio/.test(n + c.key)) {
      g.add(mesh(box(0.34, 0.2, 0.12, { round: 0.02 }), m.lam('walnut'), 0, y, 0));
      g.add(mesh(box(0.18, 0.14, 0.01), m.flat('#2d2a26'), -0.06, y + 0.03, 0.061));
      g.add(mesh(cyl(0.004, 0.004, 0.4, 6), m.steel(), 0.13, y + 0.2, 0));
    } else if (/唱片/.test(n)) {
      g.add(mesh(box(0.42, 0.1, 0.34), m.lam('walnut'), 0, y, 0));
      g.add(mesh(cyl(0.15, 0.15, 0.01, 24), m.flat('#111111'), -0.03, y + 0.1, 0));
    } else if (/电脑|显示器/.test(n)) {
      g.add(mesh(box(0.5, 0.32, 0.04), m.plastic('black'), 0, y + 0.08, -0.05));
      g.add(mesh(box(0.47, 0.28, 0.005), c.f.powered === false ? m.flat('#0b0b0b') : m.glow('#9ec8e6', 0.6), 0, y + 0.1, -0.028));
    } else {
      g.add(mesh(box(0.48, 0.28, 0.36, { round: 0.02 }), m.paint(pick(c.rnd, ['white', 'black', 'grey'])), 0, y, 0));
      g.add(mesh(box(0.3, 0.2, 0.005), m.flat('#1d2224'), -0.05, y + 0.04, 0.181));
    }
    return g;
  },

  lamp(c) {
    const g = new THREE.Group();
    const m = M(c);
    const lit = c.f.on !== false && c.f.powered !== false;
    const floor = /落地/.test(c.name);
    const H = floor ? 1.55 : 0.45;
    const base = floor ? 0 : 0.75;
    if (!floor && c.slot !== 4) {
      const t = B.table({ ...c, W: 0.5, D: 0.45, name: '小桌' });
      t.children.splice(6);
      g.add(t);
    }
    g.add(mesh(cyl(0.1, 0.12, 0.03, 16), m.steel(), 0, base, 0));
    g.add(mesh(cyl(0.012, 0.012, H - 0.2, 8), m.steel(), 0, base + 0.03, 0));
    g.add(mesh(cyl(0.1, 0.17, 0.2, 18, ), lit ? c.lib.get('fabric_curtain', { tint: 'cream', emissive: 1.4, emissiveColor: '#ffc27a' }) : m.cloth('cream'), 0, base + H - 0.2, 0));
    g.userData.lamp = { y: base + H - 0.1, on: lit };
    return g;
  },

  sandbags(c) {
    const g = new THREE.Group();
    const W = c.W;
    const bag = c.lib.get('fabric_curtain', { tint: '#b19a6c' });
    for (let l = 0; l < 3; l++) {
      const n = Math.max(1, Math.round(W / 0.5));
      for (let i = 0; i < n; i++) {
        const b = mesh(box(0.52, 0.16, 0.3, { round: 0.07 }), bag, -W / 2 + 0.27 + i * ((W - 0.54) / Math.max(1, n - 1)) + (l % 2) * 0.12 - 0.06, l * 0.15, (c.rnd() - 0.5) * 0.05);
        b.rotation.y = (c.rnd() - 0.5) * 0.15;
        g.add(b);
      }
    }
    return g;
  },

  spikes(c) {
    const g = new THREE.Group();
    const m = M(c);
    const W = c.W;
    const wood = m.pine('dark');
    const n = Math.max(2, Math.round(W / 0.3));
    for (let i = 0; i < n; i++) {
      const s = mesh(cyl(0.001, 0.035, 0.9, 6), wood, -W / 2 + 0.15 + (i * (W - 0.3)) / Math.max(1, n - 1), 0.05, 0);
      s.rotation.x = (i % 2 ? 1 : -1) * 0.6;
      g.add(s);
    }
    g.add(mesh(box(W, 0.08, 0.08), wood, 0, 0.1, 0));
    return g;
  },

  elecnet(c) {
    const g = new THREE.Group();
    const m = M(c);
    const W = c.W;
    for (const s of [-1, 1]) g.add(mesh(box(0.06, 1.3, 0.06), m.paint('black'), s * (W / 2 - 0.05), 0, 0));
    const live = c.f.powered !== false && c.f.on !== false;
    for (let i = 0; i < 5; i++) g.add(mesh(box(W - 0.1, 0.008, 0.008), live ? m.glow('#bfe8ff', 0.8) : m.steel(), 0, 0.2 + i * 0.24, 0));
    g.add(mesh(box(0.2, 0.2, 0.1), m.paint('red'), -W / 2 + 0.2, 0.9, 0.05));
    return g;
  },

  chainsaw(c) {
    const g = new THREE.Group();
    const m = M(c);
    const W = c.W;
    g.add(mesh(box(W - 0.1, 0.35, 0.4), m.paint('grey'), 0, 0, 0));
    const running = c.f.powered !== false && c.f.on !== false;
    for (let i = 0; i < 3; i++) {
      const blade = mesh(cyl(0.18, 0.18, 0.02, 24).rotateX(Math.PI / 2), m.steel(), -W / 3 + (i * W) / 3, 0.45, 0);
      // teeth, so the spin shows
      for (let k = 0; k < 8; k++) blade.add(mesh(box(0.04, 0.03, 0.022), m.steel(), Math.cos((k / 8) * Math.PI * 2) * 0.18, Math.sin((k / 8) * Math.PI * 2) * 0.18, 0));
      if (running) {
        blade.userData.spin = blade;
        blade.userData.spinRate = 14;
      }
      g.add(blade);
    }
    return g;
  },

  workbench(c) {
    const g = new THREE.Group();
    const m = M(c);
    const W = c.W;
    const D = Math.min(c.D, 0.8);
    const top = m.wood('honey');
    g.add(mesh(box(W, 0.07, D), top, 0, 0.83, 0));
    legs(g, W, D, 0.83, 0.08, m.pine('dark'), 0.05);
    g.add(mesh(box(W - 0.1, 0.03, D - 0.1), m.pine('dark'), 0, 0.2, 0));
    g.add(mesh(box(W, 1.0, 0.03), c.lib.get('cardboard', { tint: 'grey_board' }), 0, 0.9, -D / 2 + 0.02));
    // tools on the pegboard
    const tool = [m.steel(), m.paint('red'), m.paint('blue'), m.plastic('black')];
    for (let i = 0; i < 7; i++) {
      const tl = mesh(box(0.04 + c.rnd() * 0.05, 0.18 + c.rnd() * 0.2, 0.02), pick(c.rnd, tool), -W / 2 + 0.15 + (i * (W - 0.3)) / 6, 1.2 + c.rnd() * 0.3, -D / 2 + 0.05);
      tl.rotation.z = (c.rnd() - 0.5) * 0.4;
      g.add(tl);
    }
    // vise and scattered tools
    g.add(mesh(box(0.14, 0.12, 0.2), m.paint('blue'), W / 2 - 0.15, 0.9, D / 2 - 0.1));
    g.add(mesh(box(0.35, 0.1, 0.2), m.paint('red'), -W / 4, 0.9, 0.05));
    g.add(mesh(box(0.25, 0.015, 0.05), m.steel(), 0.1, 0.9, 0.15));
    if (c.f.data?.crafting) g.add(mesh(box(0.05, 0.02, 0.05), m.glow('#ffd166', 3), 0, 0.92, 0));
    return g;
  },

  vending(c) {
    const g = new THREE.Group();
    const m = M(c);
    const W = Math.min(c.W, 1.0);
    g.add(mesh(box(W, 1.85, 0.8, { round: 0.02 }), m.paint(pick(c.rnd, ['red', 'blue', 'white'])), 0, 0, 0));
    g.add(mesh(box(W * 0.6, 1.3, 0.01), c.f.powered === false ? m.flat('#101214') : m.glow('#d9eef5', 0.9), -W * 0.1, 0.4, 0.401));
    dress(c, g, -W * 0.38, W * 0.18, 1.0, 0.3, 0.1, 0.2);
    return g;
  },

  car(c) {
    const g = new THREE.Group();
    const m = M(c);
    const n = c.name;
    const suv = /SUV|货车|叉车/.test(n);
    const wreck = /废弃|旧|锈|熄火/.test(n);
    // a real car's proportions (4.2 × 1.8 m), scaled down uniformly when the footprint is smaller
    const L = 4.2;
    const Wc = 1.8;
    const long = Math.max(c.W, c.D);
    const short = Math.min(c.W, c.D);
    const k = Math.min(1, long / L, short / Wc);
    const car = new THREE.Group();
    const paint = c.lib.get('metal_painted', { tint: pick(c.rnd, ['red', 'blue', 'white', 'grey', 'black', 'green']), roughness: wreck ? 0.8 : 0.45 });
    const glass = c.lib.get('#1b2226', { roughness: 0.1 });
    const trim = m.plastic('black');
    const h0 = 0.28;
    car.add(mesh(box(Wc, 0.62, L, { round: 0.14 }), paint, 0, h0, 0));
    const cabL = L * (suv ? 0.62 : 0.5);
    const cabH = suv ? 0.72 : 0.55;
    car.add(mesh(box(Wc - 0.16, cabH, cabL, { round: 0.12 }), paint, 0, h0 + 0.55, suv ? -0.2 : -0.1));
    car.add(mesh(box(Wc - 0.12, cabH - 0.14, cabL - 0.2), glass, 0, h0 + 0.62, suv ? -0.2 : -0.1));
    for (const z of [L / 2 - 0.02, -L / 2 + 0.02]) car.add(mesh(box(Wc - 0.1, 0.18, 0.08), trim, 0, h0 + 0.05, z));
    for (const sx of [-1, 1]) {
      car.add(mesh(box(0.28, 0.1, 0.03), c.lib.get('#fff4d6', { roughness: 0.2 }), sx * 0.6, h0 + 0.42, L / 2 + 0.01));
      car.add(mesh(box(0.28, 0.1, 0.03), c.lib.get('#8a1a12', { roughness: 0.3 }), sx * 0.6, h0 + 0.42, -L / 2 - 0.01));
      for (const sz of [-1, 1]) car.add(mesh(cyl(0.33, 0.33, 0.24, 18).rotateZ(Math.PI / 2).translate(0.12 * sx, 0, 0), m.rubber(), sx * (Wc / 2 - 0.1), 0.33, sz * (L / 2 - 0.75)));
    }
    if (wreck) {
      car.rotation.z = (c.rnd() - 0.5) * 0.06;
      for (let i = 0; i < 3; i++) car.add(mesh(box(0.3 + c.rnd() * 0.4, 0.01, 0.2 + c.rnd() * 0.3), c.lib.get('#3a2a1e', { roughness: 0.9 }), (c.rnd() - 0.5) * 1.4, h0 + 0.62, (c.rnd() - 0.5) * 3));
    }
    car.scale.setScalar(k);
    if (c.W > c.D) car.rotation.y = Math.PI / 2;
    g.add(car);
    return g;
  },

  barrel(c) {
    const g = new THREE.Group();
    const m = M(c);
    const n = /堆|货堆/.test(c.name) ? Math.max(2, Math.round(c.W * c.D * 3)) : 1;
    const paint = m.paint(pick(c.rnd, ['blue', 'red', 'green', 'grey']));
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 0 : (c.rnd() - 0.5) * (c.W - 0.6);
      const z = n === 1 ? 0 : (c.rnd() - 0.5) * (c.D - 0.6);
      g.add(mesh(cyl(0.28, 0.28, 0.88, 22), paint, x, 0, z));
      for (const y of [0.28, 0.6]) g.add(mesh(cyl(0.29, 0.29, 0.03, 22), paint, x, y, z));
    }
    return g;
  },

  bucket(c) {
    const g = new THREE.Group();
    const m = M(c);
    g.add(mesh(cyl(0.16, 0.13, 0.32, 18), m.plastic(pick(c.rnd, ['grey', 'cream', 'black'])), 0, 0, 0));
    return g;
  },

  tent(c) {
    const g = new THREE.Group();
    const W = c.W;
    const D = c.D;
    const cloth = c.lib.get('fabric_curtain', { tint: pick(c.rnd, ['#6b7d5a', '#c78a3e', '#4f6275']), doubleSide: true });
    const shape = new THREE.CylinderGeometry(0.001, Math.min(W, D) * 0.6, 1.4, 4, 1, true);
    shape.rotateY(Math.PI / 4);
    shape.translate(0, 0.7, 0);
    const t = mesh(shape, cloth);
    t.scale.set(W / Math.min(W, D), 1, D / Math.min(W, D));
    g.add(t);
    return g;
  },

  wallArt(c) {
    const g = new THREE.Group();
    const m = M(c);
    const n = c.name;
    if (/时钟/.test(n)) {
      g.add(mesh(cyl(0.18, 0.18, 0.04, 28).rotateX(Math.PI / 2), m.paint('white'), 0, 1.9, 0.02));
      g.add(mesh(box(0.012, 0.13, 0.01), m.flat('#111111'), 0, 1.9, 0.045));
      g.add(mesh(box(0.1, 0.012, 0.01), m.flat('#111111'), 0.05, 1.9, 0.045));
      return g;
    }
    if (/黑板/.test(n)) {
      g.add(mesh(box(1.4, 0.9, 0.03), m.flat('#23312a'), 0, 1.1, 0.015));
      g.add(mesh(box(1.46, 0.05, 0.06), m.wood('honey'), 0, 1.07, 0.03));
      return g;
    }
    if (/飞镖/.test(n)) {
      g.add(mesh(cyl(0.22, 0.22, 0.04, 28).rotateX(Math.PI / 2), m.flat('#1a1a1a'), 0, 1.6, 0.02));
      g.add(mesh(cyl(0.12, 0.12, 0.045, 28).rotateX(Math.PI / 2), m.paint('red'), 0, 1.6, 0.02));
      return g;
    }
    if (/配电/.test(n)) {
      g.add(mesh(box(0.45, 0.6, 0.15), m.paint('grey'), 0, 1.3, 0.075));
      return g;
    }
    if (/水管/.test(n)) {
      g.add(mesh(cyl(0.04, 0.04, 2.8, 12), m.paint('grey'), 0, 0.1, 0.05));
      return g;
    }
    const w = 0.5 + c.rnd() * 0.4;
    const h = 0.4 + c.rnd() * 0.3;
    if (c.slot !== 4) for (const s of [-1, 1]) g.add(mesh(box(0.03, 1.5, 0.03), m.wood('smoked'), s * (w / 2 - 0.05), 0, -0.05));
    g.add(mesh(box(w + 0.06, h + 0.06, 0.03), m.wood(pick(c.rnd, ['smoked', 'honey'])), 0, 1.45, 0.015));
    g.add(mesh(new THREE.PlaneGeometry(w, h), painting(c.rnd), 0, 1.48 + h / 2, 0.034));
    return g;
  },

  door(c) {
    const g = new THREE.Group();
    const m = M(c);
    const n = c.name;
    const f = c.f;
    const ratio = f.hpRatio ?? 1;
    if (f.broken || ratio <= 0 || f.data?.breached) {
      const leaf = mesh(box(0.86, 0.04, 2.0), m.lam('walnut'), 0.1, 0.02, 0.9);
      leaf.rotation.y = 0.2;
      g.add(leaf);
      return g;
    }
    const heavy = /防盗|钛合金|金属|仓库/.test(n);
    const leafM = heavy ? m.paint(/钛合金/.test(n) ? 'grey' : 'green') : m.lam(pick(c.rnd, ['walnut', 'natural', 'cherry']));
    const leaf = mesh(box(0.84, 2.12, 0.05), leafM, 0, 0.02, 0);
    g.add(leaf);
    if (!heavy) {
      g.add(mesh(box(0.6, 0.7, 0.01), leafM, 0, 1.2, 0.03));
      g.add(mesh(box(0.6, 0.7, 0.01), leafM, 0, 0.3, 0.03));
    } else for (const y of [0.4, 1.0, 1.6]) g.add(mesh(box(0.8, 0.05, 0.02), m.steel(), 0, y, 0.035));
    for (const s of [-1, 1]) g.add(mesh(box(0.12, 0.03, 0.03), m.steel(), 0.32, 1.02, s * 0.04));
    if ((f.reinforce || 0) > 0 || /加固/.test(n)) {
      for (const [y, r] of [[0.5, 0.35], [1.2, -0.3], [1.75, 0.1]]) {
        const p = mesh(box(1.05, 0.12, 0.035), m.pine('faded'), 0, y, 0.06);
        p.rotation.z = r;
        g.add(p);
      }
    }
    if (ratio < 0.6) {
      for (let i = 0; i < 4; i++) g.add(mesh(box(0.1 + c.rnd() * 0.2, 0.02, 0.06), m.flat('#1a120c'), (c.rnd() - 0.5) * 0.6, 0.4 + c.rnd() * 1.4, 0.0).rotateZ(c.rnd() * 3));
    }
    // a door that is not boarded up swings on its hinge (the furniture layer opens it as someone passes)
    if (!((f.reinforce || 0) > 0 || /加固/.test(n))) {
      const pivot = new THREE.Group();
      pivot.position.x = -0.42;
      for (const part of [...g.children]) {
        g.remove(part);
        part.position.x += 0.42;
        pivot.add(part);
      }
      g.add(pivot);
      g.userData.doorPivot = pivot;
    }
    return g;
  },

  window(c) {
    const g = new THREE.Group();
    const m = M(c);
    const f = c.f;
    const ratio = f.hpRatio ?? 1;
    const broken = f.broken || ratio <= 0 || f.data?.breached;
    if (!broken) {
      const pane = new THREE.Mesh(box(0.78, 1.24, 0.01), c.lib.get('glass', { opacity: ratio < 0.5 ? 0.45 : 0.22 }));
      pane.position.set(0, 0.93, 0);
      pane.renderOrder = 2;
      g.add(pane);
    } else {
      for (let i = 0; i < 5; i++) g.add(mesh(box(0.08 + c.rnd() * 0.12, 0.01, 0.06 + c.rnd() * 0.1), c.lib.get('glass', { opacity: 0.5 }), (c.rnd() - 0.5) * 0.8, 0.005, 0.4 + c.rnd() * 0.5));
    }
    const heavy = /防盗|防弹/.test(c.name);
    if (heavy) for (let i = 0; i < 6; i++) g.add(mesh(box(0.02, 1.28, 0.02), m.paint('black'), -0.35 + i * 0.14, 0.92, 0.08));
    if ((f.reinforce || 0) > 0 || /加固/.test(c.name)) {
      for (const [y, r] of [[1.2, 0.15], [1.55, -0.1], [1.85, 0.05]]) {
        const p = mesh(box(1.05, 0.13, 0.03), m.pine('faded'), 0, y, 0.09);
        p.rotation.z = r;
        g.add(p);
      }
    }
    // curtains inside, where the wall stands full height
    if (!c.cut) {
      const cur = m.cloth(pick(c.rnd, ['cream', 'sage', 'blue', 'ochre']));
      for (const s of [-1, 1]) g.add(mesh(box(0.25, 1.9, 0.04, { round: 0.015 }), cur, s * 0.55, 0.55, 0.2));
    }
    return g;
  },

  mirror(c) {
    const g = new THREE.Group();
    const m = M(c);
    g.add(mesh(box(0.5, 1.5, 0.04), m.wood('smoked'), 0, 0.1, 0));
    const glass = c.lib.get('#c8d0d4');
    glass.roughness = 0.05;
    glass.metalness = 1;
    g.add(mesh(box(0.44, 1.42, 0.005), glass, 0, 0.14, 0.022));
    return g;
  },

  fitness(c) {
    const g = new THREE.Group();
    const m = M(c);
    g.add(mesh(box(c.W * 0.8, 0.2, Math.max(0.6, c.D * 0.9)), m.rubber(), 0, 0, 0));
    g.add(mesh(box(0.06, 1.2, 0.06), m.steel(), -0.25, 0.2, -c.D * 0.35));
    g.add(mesh(box(0.06, 1.2, 0.06), m.steel(), 0.25, 0.2, -c.D * 0.35));
    g.add(mesh(box(0.6, 0.12, 0.2), m.plastic('black'), 0, 1.35, -c.D * 0.35));
    return g;
  },

  basket(c) {
    const g = new THREE.Group();
    const m = M(c);
    if (!/吊篮/.test(c.name)) {
      g.add(mesh(cyl(0.22, 0.17, 0.3, 16), m.rattan(), 0, 0, 0));
      dress(c, g, -0.15, 0.15, 0.22, 0, 0.2, 0.15);
      return g;
    }
    // the rope-and-basket line to the neighbour: a post with a pulley on the roof, a rope that sags away over the
    // parapet toward her building, the basket hung under it on four cords. Broken: the rope hangs cut from the
    // pulley and the basket lies tipped on the roof
    const steel = m.steel();
    const rope = c.lib.get('rattan', { tint: '#b99a6a' });
    const post = 1.7;
    g.add(mesh(box(0.3, 0.04, 0.3), steel, 0, 0, 0));
    g.add(mesh(cyl(0.035, 0.04, post, 10), steel, 0, 0.04, 0));
    const wheel = mesh(cyl(0.09, 0.09, 0.03, 16).rotateX(Math.PI / 2), steel, 0, post + 0.04, 0.06);
    g.add(wheel);
    const tube = (/** @type {THREE.Vector3[]} */ pts, /** @type {number} */ r) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, r, 6), rope);
    if (c.f.broken) {
      g.add(tube([new THREE.Vector3(0, post + 0.04, 0.12), new THREE.Vector3(0.05, post - 0.5, 0.18), new THREE.Vector3(0.02, post - 1.1, 0.2)], 0.012));
      const b = mesh(cyl(0.22, 0.17, 0.3, 16), m.rattan(), 0.45, 0.17, 0.35);
      b.rotation.z = Math.PI / 2.3;
      g.add(b);
      return g;
    }
    // the line leaves toward -z (away from the camera side), sagging over 9 m
    const top = new THREE.Vector3(0, post + 0.13, 0.06);
    const far = new THREE.Vector3(-1.5, post + 1.8, -9);
    const mid = top.clone().lerp(far, 0.5).add(new THREE.Vector3(0, -0.6, 0));
    const hang = top.clone().lerp(far, 0.1).add(new THREE.Vector3(0, -0.12, 0));
    g.add(tube([top, hang, mid, far], 0.012));
    const bx = hang.x;
    const bz = hang.z;
    const by = hang.y - 0.85;
    const b = mesh(cyl(0.22, 0.17, 0.3, 16), m.rattan(), bx, by, bz);
    g.add(b);
    dress(c, g, bx - 0.14, bx + 0.14, by + 0.22, bz, 0.2, 0.12);
    for (const [dx, dz] of [[0.18, 0], [-0.18, 0], [0, 0.18], [0, -0.18]]) g.add(tube([new THREE.Vector3(bx + dx, by + 0.3, bz + dz), new THREE.Vector3(bx, hang.y - 0.02, bz)], 0.006));
    return g;
  },

  cart(c) {
    const g = new THREE.Group();
    const m = M(c);
    const n = c.name;
    const W = Math.min(c.W, 0.9);
    const D = Math.min(c.D, 0.8);
    if (/液压|拖车/.test(n)) {
      g.add(mesh(box(W * 0.6, 0.08, D), m.paint('red'), 0, 0.08, 0));
      g.add(mesh(box(0.04, 1.1, 0.04), m.paint('red'), 0, 0.16, -D / 2 + 0.05).rotateX(-0.2));
      for (const sx of [-1, 1]) g.add(mesh(cyl(0.07, 0.07, 0.05, 12).rotateZ(Math.PI / 2), m.rubber(), sx * W * 0.3, 0.0, D / 2 - 0.1));
      return g;
    }
    const wire = /购物/.test(n);
    const body = wire ? m.steel() : m.paint(pick(c.rnd, ['blue', 'grey', 'green']));
    const bh = wire ? 0.45 : 0.08;
    const y0 = wire ? 0.45 : 0.25;
    if (wire) {
      const bars = 8;
      for (let i = 0; i <= bars; i++) {
        g.add(mesh(box(0.008, bh, D * 0.9), body, -W * 0.4 + (i * W * 0.8) / bars, y0, 0));
        g.add(mesh(box(W * 0.8, 0.008, 0.008), body, 0, y0 + (i * bh) / bars, D * 0.45));
        g.add(mesh(box(W * 0.8, 0.008, 0.008), body, 0, y0 + (i * bh) / bars, -D * 0.45));
      }
      g.add(mesh(box(W * 0.8, 0.01, D * 0.9), body, 0, y0, 0));
    } else {
      for (const y of [0.25, 0.7]) g.add(mesh(box(W * 0.85, 0.04, D * 0.85), body, 0, y, 0));
      if (c.rnd() < 0.8) dress(c, g, -W * 0.4, W * 0.4, 0.74, 0, D * 0.6, 0.25);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      g.add(mesh(box(0.025, y0 + (wire ? 0 : 0.47), 0.025), m.steel(), sx * W * 0.38, 0.06, sz * D * 0.4));
      g.add(mesh(cyl(0.05, 0.05, 0.03, 12).rotateZ(Math.PI / 2), m.rubber(), sx * W * 0.38, 0.0, sz * D * 0.4));
    }
    g.add(mesh(box(W * 0.8, 0.03, 0.03), m.plastic('black'), 0, y0 + (wire ? bh + 0.15 : 0.55), -D * 0.5));
    return g;
  },

  stairs(c) {
    const g = new THREE.Group();
    const m = M(c);
    const W = c.W;
    const D = c.D;
    const n = 8;
    const wood = m.wood('honey');
    for (let i = 0; i < n; i++) g.add(mesh(box(W, 0.2 * (i + 1), D / n), wood, 0, 0, D / 2 - (i + 0.5) * (D / n)));
    g.add(mesh(box(0.04, 0.9, D), m.steel(), W / 2 - 0.02, 1.6, 0).rotateX(0));
    return g;
  },

  extinguisher(c) {
    const g = new THREE.Group();
    const m = M(c);
    const red = c.lib.get('metal_painted', { tint: 'red', roughness: 0.6 });
    g.add(mesh(cyl(0.08, 0.08, 0.5, 16), red, 0, 0, 0));
    g.add(mesh(new THREE.SphereGeometry(0.08, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), red, 0, 0.5, 0));
    g.add(mesh(box(0.05, 0.08, 0.12), m.plastic('black'), 0, 0.57, 0.03));
    return g;
  },

  smallItems(c) {
    const g = new THREE.Group();
    const m = M(c);
    const W = Math.min(c.W, 0.8);
    const D = Math.min(c.D, 0.6);
    const t = B.table({ ...c, W, D, name: '小桌' });
    t.children.splice(6);
    g.add(t);
    const n = c.name;
    if (/地球仪/.test(n)) {
      g.add(mesh(new THREE.SphereGeometry(0.14, 20, 14), c.lib.get('plastic', { tint: '#5f86a8', roughness: 0.4 }), 0, 0.93, 0));
      g.add(mesh(cyl(0.05, 0.07, 0.04, 12), m.wood('smoked'), 0, 0.75, 0));
    } else if (/雕像|工艺|摆件|花瓶|杯|茶/.test(n)) {
      g.add(mesh(cyl(0.06, 0.08, 0.26, 14), c.lib.get('plastic', { tint: pick(c.rnd, ['#e6e0d4', '#6b86a3', '#b56a45']), roughness: 0.35 }), 0, 0.75, 0));
    } else if (/笔记本|地图|备忘|日志|纸|办公|文件/.test(n)) {
      for (let i = 0; i < 3; i++) {
        const p = mesh(box(0.21, 0.01 + c.rnd() * 0.02, 0.29), m.paper(pick(c.rnd, ['fresh', 'yellowed'])), (c.rnd() - 0.5) * 0.2, 0.75 + i * 0.012, (c.rnd() - 0.5) * 0.1);
        p.rotation.y = (c.rnd() - 0.5) * 0.6;
        g.add(p);
      }
    } else if (/电话|记录仪|信标/.test(n)) {
      g.add(mesh(box(0.2, 0.08, 0.18, { round: 0.02 }), m.plastic(pick(c.rnd, ['cream', 'black', 'grey'])), 0, 0.75, 0));
    } else dress(c, g, -W / 2 + 0.05, W / 2 - 0.05, 0.75, 0, D * 0.5, 0.25);
    return g;
  },

  machine(c) {
    const g = new THREE.Group();
    const m = M(c);
    const W = Math.min(c.W, 1.4);
    const D = Math.min(c.D, 1.0);
    const H = /冷库|制冷|屋顶|设施/.test(c.name) ? 1.2 : /笼/.test(c.name) ? 1.6 : 0.9;
    if (/笼/.test(c.name)) {
      const bar = m.steel();
      for (let i = 0; i <= 8; i++) {
        g.add(mesh(box(0.02, H, 0.02), bar, -W / 2 + (i * W) / 8, 0, D / 2));
        g.add(mesh(box(0.02, H, 0.02), bar, -W / 2 + (i * W) / 8, 0, -D / 2));
      }
      g.add(mesh(box(W, 0.04, D), bar, 0, H, 0));
      g.add(mesh(box(W, 0.06, D), m.pine('faded'), 0, 0, 0));
      dress(c, g, -W / 2 + 0.05, W / 2 - 0.05, 0.06, 0, D * 0.7, 0.5);
      return g;
    }
    g.add(mesh(box(W * 0.9, H, D * 0.8, { round: 0.02 }), m.paint(pick(c.rnd, ['grey', 'white', 'blue'])), 0, 0, 0));
    g.add(mesh(cyl(W * 0.25, W * 0.25, 0.02, 24).rotateX(Math.PI / 2), m.flat('#2a2b2c'), -W * 0.15, H * 0.55, D * 0.4 + 0.005));
    g.add(mesh(box(0.2, 0.12, 0.02), m.plastic('black'), W * 0.25, H * 0.75, D * 0.4 + 0.005));
    g.add(mesh(box(0.05, 0.02, 0.005), m.glow(c.f.powered === false ? '#ff4a3a' : '#5bff7a', 1.5), W * 0.25, H * 0.75, D * 0.4 + 0.02));
    return g;
  },

  fence(c) {
    const g = new THREE.Group();
    const m = M(c);
    const W = Math.max(c.W, c.D);
    const posts = Math.max(2, Math.round(W / 0.8) + 1);
    const wood = m.pine('dark');
    for (let i = 0; i < posts; i++) g.add(mesh(box(0.08, 1.1, 0.08), wood, -W / 2 + (i * W) / (posts - 1), 0, 0));
    for (const y of [0.3, 0.8]) g.add(mesh(box(W, 0.1, 0.03), wood, 0, y, 0.05));
    return g;
  },

  ladder(c) {
    const g = new THREE.Group();
    const m = M(c);
    const al = m.steel();
    const lean = new THREE.Group();
    for (const s of [-1, 1]) lean.add(mesh(box(0.04, 2.0, 0.06), al, s * 0.2, 0, 0));
    for (let i = 1; i < 7; i++) lean.add(mesh(box(0.4, 0.03, 0.05), al, 0, i * 0.28, 0));
    lean.rotation.x = -0.25;
    lean.position.z = 0.2;
    g.add(lean);
    return g;
  },

  ball(c) {
    const g = new THREE.Group();
    const n = /篮球车/.test(c.name) ? 6 : 1;
    const orange = c.lib.get('leather', { tint: '#c8642a' });
    for (let i = 0; i < n; i++) g.add(mesh(new THREE.SphereGeometry(0.12, 18, 12), orange, (i % 3) * 0.25 - 0.25, 0.12 + Math.floor(i / 3) * 0.24, 0));
    return g;
  },

  cat(c) {
    const g = new THREE.Group();
    const n = c.name;
    if (/爬架/.test(n)) {
      const carpet = c.lib.get('fabric_sofa', { tint: 'beige' });
      g.add(mesh(box(0.55, 0.06, 0.55), carpet, 0, 0, 0));
      g.add(mesh(cyl(0.06, 0.06, 1.3, 12), c.lib.get('rattan'), 0, 0.06, 0));
      for (const y of [0.55, 1.0, 1.36]) g.add(mesh(box(0.42, 0.05, 0.42), carpet, (y > 0.8 ? 0.08 : -0.08), y, 0));
      return g;
    }
    // a cat sitting up, facing +z: haunches, chest, forelegs, head with ears and eyes, a tail curled round its feet.
    // The tail sways and the chest breathes (userData.animate, run by the furniture layer's spinners)
    const coat = pick(c.rnd, ['#7a5a3a', '#3a3a3a', '#c9a27a', '#e8e0d0', '#8a8580']);
    // fur: matte with a sheen, which gives the soft rim of a coat in lamplight
    const furOf = (/** @type {string} */ col) =>
      new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.95, sheen: 0.5, sheenRoughness: 0.7, sheenColor: new THREE.Color(col).lerp(new THREE.Color('#ffffff'), 0.4) });
    const fur = furOf(coat);
    const pale = furOf(new THREE.Color(coat).lerp(new THREE.Color('#efe6d6'), 0.35).getStyle());
    const sphere = (/** @type {number} */ r) => new THREE.SphereGeometry(r, 18, 12);
    const live = new THREE.Group();
    const haunch = mesh(sphere(0.085).scale(1, 0.95, 1.25), fur, 0, 0.08, -0.045);
    const back = mesh(sphere(0.062).scale(1, 1, 1.7), fur, 0, 0.15, 0.0);
    back.rotation.x = -0.75;
    const chest = mesh(sphere(0.058).scale(1, 1.3, 1), pale, 0, 0.2, 0.055);
    live.add(haunch, back, chest);
    for (const sx of [-1, 1]) {
      const leg = mesh(cyl(0.016, 0.02, 0.17, 8), fur, sx * 0.03, 0, 0.075);
      const paw = mesh(sphere(0.022).scale(1, 0.6, 1.3), pale, sx * 0.03, 0.01, 0.088);
      live.add(leg, paw);
    }
    const head = new THREE.Group();
    head.position.set(0, 0.305, 0.075);
    head.add(mesh(sphere(0.058).scale(1.08, 0.92, 0.95), fur, 0, 0, 0));
    head.add(mesh(sphere(0.026).scale(1.2, 0.8, 1), pale, 0, -0.02, 0.043));
    head.add(mesh(sphere(0.006), c.lib.get('plastic', { tint: '#c98a8a' }), 0, -0.01, 0.068));
    const eye = new THREE.MeshStandardMaterial({ color: '#b8c43a', emissive: '#8a9420', emissiveIntensity: 0.4, roughness: 0.1 });
    for (const sx of [-1, 1]) {
      head.add(mesh(sphere(0.01), eye, sx * 0.023, 0.01, 0.049));
      const ear = mesh(new THREE.ConeGeometry(0.022, 0.05, 4), fur, sx * 0.034, 0.05, -0.005);
      ear.rotation.z = -sx * 0.35;
      head.add(ear);
    }
    live.add(head);
    // the tail: a chain of segments round the right side to the front paws
    /** @type {THREE.Object3D[]} */
    const tail = [];
    let joint = new THREE.Group();
    joint.position.set(0.02, 0.03, -0.17);
    joint.rotation.y = 1.9;
    live.add(joint);
    for (let i = 0; i < 7; i++) {
      const seg = mesh(cyl(0.017, 0.02, 0.055, 8), i > 4 ? pale : fur, 0, 0, 0);
      seg.rotation.x = Math.PI / 2;
      seg.position.z = 0.0275;
      joint.add(seg);
      tail.push(joint);
      const next = new THREE.Group();
      next.position.z = 0.05;
      next.rotation.y = -0.34;
      joint.add(next);
      joint = next;
    }
    const phase = c.rnd() * 10;
    live.userData.spin = live;
    live.userData.animate = (/** @type {number} */ t) => {
      const u = t + phase;
      chest.scale.y = 1 + 0.03 * Math.sin(u * 2.2);
      haunch.scale.x = 1 + 0.02 * Math.sin(u * 2.2);
      // a lazy sway that travels down the tail, and now and then a flick of the tip
      const flick = Math.max(0, Math.sin(u * 0.37)) ** 8;
      tail.forEach((j, i) => (j.rotation.y = (i ? -0.34 : 1.9) + Math.sin(u * 1.4 - i * 0.6) * 0.05 * (i + 1) * 0.5 + (i > 4 ? flick * 0.6 : 0)));
      head.rotation.y = Math.sin(u * 0.23) * 0.35;
    };
    g.add(live);
    return g;
  },

  telescope(c) {
    // a refractor on a surveyor's tripod, tilted up at the sky
    const g = new THREE.Group();
    const m = M(c);
    const leg = m.steel();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const l = mesh(cyl(0.012, 0.016, 1.05, 8), leg, Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22);
      l.rotation.set(Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22);
      g.add(l);
    }
    g.add(mesh(cyl(0.05, 0.05, 0.06, 12), leg, 0, 1.0, 0));
    const tube = new THREE.Group();
    tube.position.set(0, 1.1, 0);
    tube.rotation.x = -0.6;
    const body = m.paint(pick(c.rnd, ['white', 'black', 'blue']));
    tube.add(mesh(cyl(0.055, 0.055, 0.9, 16).rotateX(Math.PI / 2), body, 0, 0, -0.1));
    tube.add(mesh(cyl(0.065, 0.065, 0.12, 16).rotateX(Math.PI / 2), m.flat('#1b1b1b'), 0, 0, 0.36));
    tube.add(mesh(cyl(0.018, 0.018, 0.18, 8).rotateX(Math.PI / 2), m.flat('#1b1b1b'), 0, 0.07, -0.25));
    g.add(tube);
    return g;
  },

  generic(c) {
    const g = new THREE.Group();
    const m = M(c);
    const H = c.slot === 6 ? 0.3 : c.slot === 1 ? 0.6 : c.slot === 3 ? 1.1 : 0.9;
    g.add(mesh(box(c.W * 0.85, H, c.D * 0.75, { round: 0.02 }), m.paint(pick(c.rnd, ['grey', 'cream', 'green'])), 0, 0, 0));
    return g;
  },
};

// ------------------------------------------------------------------------------------------ paintings

/** @type {THREE.MeshStandardMaterial[]} */
const PAINTINGS = [];

/**
 * One of a handful of procedural landscapes (sky, hills, a sun or moon, a field), painted once onto canvases and
 * shared; a plain print where there is no canvas (tests in Node).
 * @param {() => number} rnd
 */
function painting(rnd) {
  if (typeof document === 'undefined') return new THREE.MeshStandardMaterial({ color: '#b9a58a', roughness: 0.8 });
  if (!PAINTINGS.length) {
    for (let i = 0; i < 6; i++) {
      const cv = document.createElement('canvas');
      cv.width = 128;
      cv.height = 96;
      const ctx = cv.getContext('2d');
      if (!ctx) break;
      const hue = [205, 30, 190, 45, 260, 15][i];
      const sky = ctx.createLinearGradient(0, 0, 0, 60);
      sky.addColorStop(0, `hsl(${hue}, 45%, ${i % 2 ? 70 : 55}%)`);
      sky.addColorStop(1, `hsl(${(hue + 30) % 360}, 50%, 82%)`);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, 128, 96);
      ctx.fillStyle = i % 3 === 1 ? '#f4efe0' : '#ffd98a';
      ctx.beginPath();
      ctx.arc(30 + i * 13, 24, 9, 0, Math.PI * 2);
      ctx.fill();
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = `hsl(${100 + k * 15 + i * 7}, ${30 + k * 8}%, ${38 - k * 7}%)`;
        ctx.beginPath();
        ctx.moveTo(0, 96);
        for (let x = 0; x <= 128; x += 8) ctx.lineTo(x, 52 + k * 12 + Math.sin(x / (14 + k * 5) + i + k) * (8 - k * 2));
        ctx.lineTo(128, 96);
        ctx.fill();
      }
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      PAINTINGS.push(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
    }
  }
  return PAINTINGS[Math.floor(rnd() * PAINTINGS.length) % PAINTINGS.length];
}

// ------------------------------------------------------------------------------------------ plants

/**
 * Crop archetypes by the plant's config name: how each looks as it grows and when it is ripe.
 * @param {string} zh
 */
function cropKind(zh) {
  if (/菇|灵芝|松茸/.test(zh)) return 'mushroom';
  if (/胡萝卜|甜菜|土豆|大蒜|洋葱/.test(zh)) return 'root';
  if (/卷心菜|花椰菜/.test(zh)) return 'head';
  if (/菠菜|韭菜/.test(zh)) return 'leafy';
  if (/西红柿|黄瓜|茄子|彩椒/.test(zh)) return 'vine';
  if (/草莓/.test(zh)) return 'berry';
  if (/南瓜|西瓜/.test(zh)) return 'melon';
  if (/玉米/.test(zh)) return 'corn';
  if (/向日葵/.test(zh)) return 'sunflower';
  if (/咖啡/.test(zh)) return 'shrub';
  if (/爬山虎/.test(zh)) return 'ivy';
  if (/雏菊|三色堇|金盏菊|波斯菊|矮牵牛/.test(zh)) return 'flower';
  return 'leafy';
}

/** The colour of what a crop yields (fruit, root, bloom, cap). @param {string} zh */
function cropColor(zh) {
  /** @type {[RegExp, string][]} */
  const table = [
    [/胡萝卜/, '#e0762a'],
    [/甜菜/, '#7a1f3a'],
    [/土豆/, '#b9955e'],
    [/大蒜|洋葱/, '#e8dcc6'],
    [/西红柿/, '#d6352a'],
    [/黄瓜/, '#4f7f35'],
    [/茄子/, '#4a2657'],
    [/彩椒/, '#e8b22a'],
    [/草莓/, '#d8302f'],
    [/南瓜/, '#e0822a'],
    [/西瓜/, '#3f6b30'],
    [/花椰菜/, '#efe9d6'],
    [/卷心菜/, '#9cc27a'],
    [/咖啡/, '#b3261e'],
    [/雏菊/, '#f4f1e6'],
    [/三色堇/, '#6a3fa0'],
    [/金盏菊/, '#f09a1c'],
    [/波斯菊/, '#e87aa8'],
    [/矮牵牛/, '#c02a8a'],
    [/灵芝/, '#8a3a1c'],
    [/松茸|杏鲍菇|茶树菇|鸡腿菇/, '#b99a72'],
    [/菇/, '#ece6d8'],
  ];
  return (table.find(([re]) => re.test(zh)) || [null, '#d8302f'])[1];
}

/**
 * Crop in a planter, from the sim's plant summary: its archetype's shape at its growth, the yield showing when ripe,
 * browned when withered or dry, weeds when weedy.
 * @param {PropCtx} c @param {THREE.Group} g @param {import('../contracts/view.js').PlantView} p @param {number} W @param {number} D @param {number} y
 */
function plant(c, g, p, W, D, y) {
  const growth = Math.max(0.08, Math.min(1, p.growth || 0));
  const zh = (p.plantId != null && /** @type {Record<number, { zh: string }>} */ (/** @type {unknown} */ (PLANTS_BY_ID))[p.plantId]?.zh) || '';
  const kind = cropKind(zh);
  const leafTint = p.withered ? '#7a6a45' : p.dry ? '#8a9a52' : kind === 'ivy' ? '#3f6b35' : '#4f8a3e';
  const leaf = c.lib.get('fabric_curtain', { tint: leafTint, doubleSide: true });
  const fruit = c.lib.get('plastic', { tint: p.withered ? '#6b5a3a' : cropColor(zh), roughness: 0.35 });
  const stem = c.lib.get('fabric_curtain', { tint: '#5a7a3a' });
  const n = Math.max(1, Math.min(6, p.count || Math.round((W * D) / 0.25)));
  const cols = Math.ceil(Math.sqrt(n * (W / D)));
  const rows = Math.ceil(n / cols);
  const ripe = p.ready || growth > 0.95;
  /** a leaf: a flattened sphere turned about */
  const leafAt = (/** @type {number} */ x, /** @type {number} */ yy, /** @type {number} */ z, /** @type {number} */ sz, /** @type {number} */ a, /** @type {number} */ tilt = 0.35) => {
    const l = mesh(new THREE.SphereGeometry(sz, 8, 6), leaf, x, yy, z);
    l.scale.set(1.4, 0.3, 0.6);
    l.rotation.set(0, a, tilt);
    g.add(l);
  };
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + ((i % cols) + 0.5) * (W / cols);
    const z = -D / 2 + (Math.floor(i / cols) + 0.5) * (D / rows);
    const r = c.rnd() * Math.PI;
    switch (kind) {
      case 'mushroom': {
        const caps = 3 + Math.floor(growth * 4);
        for (let k = 0; k < caps; k++) {
          const cx = x + (c.rnd() - 0.5) * 0.18;
          const cz = z + (c.rnd() - 0.5) * 0.18;
          const h = 0.04 + growth * 0.08 * (0.6 + c.rnd() * 0.6);
          g.add(mesh(cyl(0.012, 0.016, h, 6), c.lib.get('plastic', { tint: '#ece6d8', roughness: 0.8 }), cx, y, cz));
          const cap = mesh(new THREE.SphereGeometry(0.03 + growth * 0.03, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), fruit, cx, y + h, cz);
          cap.scale.y = 0.6;
          g.add(cap);
        }
        break;
      }
      case 'root':
        for (let k = 0; k < 6; k++) {
          const blade = mesh(cyl(0.004, 0.008, 0.08 + growth * 0.22, 4), leaf, x, y, z);
          blade.rotation.set((c.rnd() - 0.5) * 0.7, 0, (c.rnd() - 0.5) * 0.7);
          g.add(blade);
        }
        if (ripe) {
          const top = mesh(new THREE.SphereGeometry(0.035, 10, 8), fruit, x, y + 0.01, z);
          top.scale.y = 0.7;
          g.add(top);
        }
        break;
      case 'head': {
        const hs = 0.05 + growth * 0.08;
        for (let k = 0; k < 6; k++) leafAt(x + Math.cos(r + k) * hs, y + 0.03, z + Math.sin(r + k) * hs, hs * 0.9, r + k, 0.6);
        if (growth > 0.4) g.add(mesh(new THREE.SphereGeometry(hs * 0.9, 12, 10), fruit, x, y + hs * 0.8, z));
        break;
      }
      case 'leafy':
        for (let k = 0; k < 4 + Math.floor(growth * 5); k++) {
          const blade = mesh(cyl(0.003, 0.012, 0.06 + growth * 0.18, 4), leaf, x + (c.rnd() - 0.5) * 0.08, y, z + (c.rnd() - 0.5) * 0.08);
          blade.rotation.set((c.rnd() - 0.5) * 0.8, 0, (c.rnd() - 0.5) * 0.8);
          g.add(blade);
        }
        break;
      case 'vine': {
        const h = 0.15 + growth * 0.55;
        g.add(mesh(cyl(0.006, 0.006, h + 0.1, 5), c.lib.get('wood_floor_pine', { tint: 'natural' }), x + 0.05, y, z));
        for (let k = 0; k < 3 + Math.floor(growth * 6); k++) leafAt(x + Math.cos(k * 2.1) * 0.06, y + (k / 8) * h, z + Math.sin(k * 2.1) * 0.06, 0.035 + growth * 0.02, k * 2.1);
        if (ripe || growth > 0.7) {
          const long = /黄瓜|茄子/.test(zh);
          for (let k = 0; k < 3; k++) {
            const f = mesh(long ? cyl(0.018, 0.022, 0.12, 8) : new THREE.SphereGeometry(0.035, 10, 8), fruit, x + (c.rnd() - 0.5) * 0.12, y + h * (0.3 + c.rnd() * 0.5), z + (c.rnd() - 0.5) * 0.12);
            if (long) f.rotation.z = Math.PI;
            g.add(f);
          }
        }
        break;
      }
      case 'berry':
        for (let k = 0; k < 5; k++) leafAt(x + Math.cos(r + k * 1.3) * 0.05, y + 0.03, z + Math.sin(r + k * 1.3) * 0.05, 0.03 + growth * 0.02, r + k * 1.3, 0.4);
        if (ripe || growth > 0.6) for (let k = 0; k < 4; k++) g.add(mesh(new THREE.ConeGeometry(0.014, 0.03, 8).rotateX(Math.PI), fruit, x + (c.rnd() - 0.5) * 0.14, y + 0.02, z + (c.rnd() - 0.5) * 0.14));
        break;
      case 'melon': {
        for (let k = 0; k < 5; k++) leafAt(x + Math.cos(r + k * 1.25) * 0.1, y + 0.02, z + Math.sin(r + k * 1.25) * 0.1, 0.06, r + k * 1.25, 0.2);
        if (growth > 0.35) {
          const fr = 0.04 + growth * 0.1;
          const m = mesh(new THREE.SphereGeometry(fr, 14, 10), fruit, x, y + fr * 0.7, z);
          if (/西瓜/.test(zh)) m.scale.set(1.2, 0.9, 1);
          g.add(m);
        }
        break;
      }
      case 'corn': {
        const h = 0.2 + growth * 0.9;
        g.add(mesh(cyl(0.01, 0.014, h, 6), stem, x, y, z));
        for (let k = 0; k < 5; k++) {
          const b = mesh(box(0.2, 0.004, 0.03), leaf, x, y + h * (0.2 + k * 0.15), z);
          b.rotation.set(0, k * 1.9, -0.4);
          g.add(b);
        }
        if (ripe) g.add(mesh(cyl(0.02, 0.025, 0.12, 8), c.lib.get('plastic', { tint: '#e8c23a', roughness: 0.6 }), x + 0.03, y + h * 0.55, z));
        break;
      }
      case 'sunflower': {
        const h = 0.2 + growth * 0.8;
        g.add(mesh(cyl(0.01, 0.014, h, 6), stem, x, y, z));
        for (let k = 0; k < 3; k++) leafAt(x, y + h * (0.3 + k * 0.2), z, 0.05, k * 2.1, 0.3);
        if (growth > 0.5) {
          const head = new THREE.Group();
          head.add(mesh(cyl(0.07, 0.07, 0.015, 16).rotateX(Math.PI / 2), c.lib.get('plastic', { tint: ripe ? '#f0c020' : '#9ab04a' }), 0, 0, 0));
          head.add(mesh(cyl(0.035, 0.035, 0.02, 12).rotateX(Math.PI / 2), c.lib.get('plastic', { tint: '#4a2e18' }), 0, 0, 0.005));
          head.position.set(x, y + h, z + 0.02);
          head.rotation.x = -0.3;
          g.add(head);
        }
        break;
      }
      case 'shrub':
        for (let k = 0; k < 6; k++) leafAt(x + (c.rnd() - 0.5) * 0.1, y + 0.05 + growth * 0.25 * c.rnd(), z + (c.rnd() - 0.5) * 0.1, 0.04, c.rnd() * 6, 0.3);
        if (ripe) for (let k = 0; k < 6; k++) g.add(mesh(new THREE.SphereGeometry(0.012, 6, 5), fruit, x + (c.rnd() - 0.5) * 0.14, y + 0.08 + c.rnd() * growth * 0.2, z + (c.rnd() - 0.5) * 0.14));
        break;
      case 'ivy':
        for (let k = 0; k < 10; k++) leafAt(x + (c.rnd() - 0.5) * 0.3, y + c.rnd() * growth * 0.25, z + (c.rnd() - 0.5) * 0.3, 0.03, c.rnd() * 6, 0.1);
        break;
      default: {
        // flowers: a small bush, blooms when grown
        for (let k = 0; k < 5; k++) leafAt(x + Math.cos(r + k) * 0.04, y + 0.03 + growth * 0.05, z + Math.sin(r + k) * 0.04, 0.03, r + k, 0.5);
        if (growth > 0.5) for (let k = 0; k < 4; k++) g.add(mesh(new THREE.SphereGeometry(0.022, 8, 6), fruit, x + (c.rnd() - 0.5) * 0.1, y + 0.08 + growth * 0.1, z + (c.rnd() - 0.5) * 0.1));
      }
    }
  }
  if (p.weed) for (let k = 0; k < 4; k++) g.add(mesh(new THREE.ConeGeometry(0.02, 0.12, 5), c.lib.get('fabric_curtain', { tint: '#6f8f3a' }), (c.rnd() - 0.5) * (W - 0.2), y + 0.06, (c.rnd() - 0.5) * (D - 0.2)));
  if (p.pest) for (let k = 0; k < 6; k++) g.add(mesh(new THREE.SphereGeometry(0.008, 5, 4), c.lib.get('#1c1c1c'), (c.rnd() - 0.5) * (W - 0.2), y + 0.05 + c.rnd() * 0.1, (c.rnd() - 0.5) * (D - 0.2)));
}

// ------------------------------------------------------------------------------------------ classification

/**
 * The builder family for a piece, from its config name (or scenery key) and slot.
 * @param {string} name
 * @param {string} key
 * @param {number} slot
 * @param {any} cfg  the config row (plant, cook, elec flags)
 */
export function family(name, key, slot, cfg) {
  if (key) return { workbench: 'workbench', radio: 'appliance', newspapers: 'newspapers', woodpile: 'woodpile', junkpile: 'pile', rubble: 'pile', woodDoor: 'door', woodWindow: 'window' }[key] || 'pile';
  const n = name;
  if (slot === 8 || /门$/.test(n)) return 'door';
  if (slot === 9 || /窗子|窗户$/.test(n)) return 'window';
  if (/楼梯|地下室入口/.test(n)) return 'stairs';
  if (/推车|购物车|液压车|转运车|拖车|花车|篮球车/.test(n)) return /篮球车/.test(n) ? 'ball' : 'cart';
  if (slot === 10) return /沙包/.test(n) ? 'sandbags' : /尖刺/.test(n) ? 'spikes' : /电网/.test(n) ? 'elecnet' : 'chainsaw';
  if (slot === 4) return /电视/.test(n) ? 'tv' : 'wallArt';
  if (cfg?.plant || /种植|培育|花坛|水培|花盆/.test(n) && !/展架|柜台|架/.test(n)) return /盆栽|绿植/.test(n) ? 'houseplant' : 'planter';
  if (cfg?.elec === 2 || /太阳能/.test(n)) return 'solar';
  if (cfg?.elec === 3 || cfg?.elec === 4 || /发电机/.test(n)) return 'generator';
  if (cfg?.elec === 5 || /蓄电|储电|UPS/.test(n)) return 'battery';
  if (cfg?.elec === 6 || /老鼠笼/.test(n)) return 'ratgen';
  if (/燃料炉/.test(n)) return 'campStove';
  if (/燃气灶|灶头|煤气炉|烤箱|嵌入式/.test(n) || (cfg?.cook && slot !== 6)) return 'stove';
  if (/冰箱|冷藏/.test(n)) return 'fridge';
  if (/冰柜|冷冻|冷柜|冷饮柜|热柜|鲜果|时蔬/.test(n)) return 'freezer';
  if (/贩卖机|售货机|饮料机/.test(n)) return 'vending';
  if (/床/.test(n) && !/床头/.test(n) || slot === 7) return 'bed';
  if (/懒人沙发|沙发/.test(n)) return 'sofa';
  if (/按摩椅/.test(n)) return 'armchair';
  if (/马桶|小便/.test(n)) return 'toilet';
  if (/浴缸/.test(n)) return 'bathtub';
  if (/淋浴/.test(n)) return 'shower';
  if (/水池|水斗|洗手|水槽/.test(n)) return 'sink';
  if (/电视/.test(n)) return 'tv';
  if (/书架|书柜|杂物书架/.test(n)) return 'bookshelf';
  if (/衣架|晾衣架|衣帽架/.test(n)) return 'clothesrack';
  if (/花架|花盆架/.test(n)) return 'plantstand';
  if (/置物架|货架|收纳架|展架|零件架|药品架|物资架|补给架|速食架|糖果架|杂物架|储物架|衣架|晾衣架|红酒架|花架|手拉架/.test(n)) return 'rack';
  if (/柜台|收银台|讲台|橱柜/.test(n)) return 'counter';
  if (/空调|暖炉|加热|取暖/.test(n) || cfg?.elec === 7) return 'heater';
  if (/柜|橱|保险箱|配电箱/.test(n)) return 'cabinet';
  if (/台式电脑|笔记本|电脑/.test(n) && slot !== 6) return 'desk';
  if (/工作台|工具台|自制工具台|维修设施/.test(n)) return 'workbench';
  if (/桌|茶几|检验台|玄关台|医疗器械台|操作台/.test(n)) return 'table';
  if (/椅|凳/.test(n)) return 'chair';
  if (/台灯|落地灯|壁灯|日光灯|煤油灯|钓鱼灯/.test(n)) return 'lamp';
  if (/汽车|轿车|SUV|货车|叉车|摩托|自行车|取款机/.test(n)) return 'car';
  if (/油桶|瓦斯罐/.test(n)) return 'barrel';
  if (/水桶|清洁桶|垃圾桶|水壶|水缸|酿酒桶/.test(n)) return 'bucket';
  if (/帐篷/.test(n)) return 'tent';
  if (/托盘|货堆|家具包裹/.test(n)) return 'pallet';
  if (/报纸|书堆|书本|文件|传单|杂志/.test(n)) return 'newspapers';
  if (/木柴|木料/.test(n)) return 'woodpile';
  if (/箱|盒|筐|包|袋/.test(n) && !/背包堆/.test(n)) return 'crate';
  if (/堆|杂物|垃圾|障碍|路障|建材|砖/.test(n)) return 'pile';
  if (/镜子/.test(n)) return 'mirror';
  if (/跑步机|哑铃|瑜伽/.test(n)) return 'fitness';
  if (/篮子|吊篮|衣物蓝/.test(n)) return 'basket';
  if (/盆栽|绿植|植物|景观树|植被|植株|假山|喷泉/.test(n)) return 'houseplant';
  if (/灭火器/.test(n)) return 'extinguisher';
  if (/猫/.test(n)) return 'cat';
  if (/望远镜/.test(n)) return 'telescope';
  if (/篮球/.test(n)) return 'ball';
  if (/梯子/.test(n)) return 'ladder';
  if (/围栏/.test(n)) return 'fence';
  if (/医疗|器械|实验|仪器|献血/.test(n)) return 'table';
  if (/黑板|屏幕|装饰画|相框|飞镖|时钟|灯牌|警示牌/.test(n)) return 'wallArt';
  if (/铁笼|设施|设备|制冷|压缩机|粉碎机|打气泵|机器人/.test(n)) return 'machine';
  if (/烧烤/.test(n)) return 'campStove';
  if (/车辆/.test(n)) return 'car';
  if (/挂板/.test(n)) return 'workbench';
  if (/特价|食品架|衣帽架|花盆架/.test(n)) return 'rack';
  if (/材料|工具/.test(n)) return 'crate';
  if (/退伍军人/.test(n)) return 'bed';
  if (/饮水区/.test(n)) return 'appliance';
  if (/微波|洗衣机|饮水机|电脑|收音机|唱片|咖啡|榨汁|打印|音响|电火锅|热水壶|照相|手机|对讲机|游戏机|无人机|卫星电话|显示器|电器/.test(n)) return 'appliance';
  if (/纸巾|杯|钥匙|胸牌|饮料|食材|易拉罐|罐头|摆件|厨具|汤锅|刀具|茶|笔记本|地图|备忘|日志|花瓶|纪念|玩具|遗留|物品|工艺|雕像|地球仪|信标|记录仪|电话|沥水|餐盘|办公|吉他/.test(n)) return 'smallItems';
  return 'generic';
}

/**
 * Builds a prop.
 * @param {string} fam
 * @param {PropCtx} ctx
 */
export function buildProp(fam, ctx) {
  const fn = B[fam] || B.generic;
  const g = fn(ctx);
  g.userData.family = fam;
  return g;
}
