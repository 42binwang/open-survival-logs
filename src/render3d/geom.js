// @ts-check
// Geometry with metre UVs (the material library's convention: texture uv = uv_m / sizeM, the repeat is on the
// texture), and small helpers for building props out of parts.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Scales a geometry's UVs so one unit is one metre, per face group, for BoxGeometry-like layouts.
 * @param {THREE.BufferGeometry} g
 * @param {[number, number][]} spans  per group: the face's extent in metres along u and v
 */
function scaleGroups(g, spans) {
  const uv = g.getAttribute('uv');
  for (let gi = 0; gi < g.groups.length; gi++) {
    const grp = g.groups[gi];
    const [su, sv] = spans[gi] || [1, 1];
    const index = g.getIndex();
    const seen = new Set();
    for (let i = grp.start; i < grp.start + grp.count; i++) {
      const v = index ? index.getX(i) : i;
      if (seen.has(v)) continue;
      seen.add(v);
      uv.setXY(v, uv.getX(v) * su, uv.getY(v) * sv);
    }
  }
  uv.needsUpdate = true;
  return g;
}

/**
 * A box w × h × d metres (x, y, z) with metre UVs, its base at y = 0 unless `centered`.
 * @param {number} w
 * @param {number} h
 * @param {number} d
 * @param {{ centered?: boolean, round?: number }} [o]  round: corner radius (a rounded box)
 */
export function box(w, h, d, o = {}) {
  /** @type {THREE.BufferGeometry} */
  let g;
  if (o.round && o.round > 0) {
    const r = Math.min(o.round, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
    g = new RoundedBoxGeometry(w, h, d, 2, r);
    worldPlanarUV(g);
  } else {
    g = new THREE.BoxGeometry(w, h, d);
    // groups: +x, -x, +y, -y, +z, -z
    scaleGroups(g, [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]);
  }
  if (!o.centered) g.translate(0, h / 2, 0);
  return g;
}

/**
 * A cylinder (or cone frustum) with metre UVs around and along it, its base at y = 0.
 * @param {number} rTop
 * @param {number} rBottom
 * @param {number} h
 * @param {number} [seg]
 */
export function cyl(rTop, rBottom, h, seg = 20) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg);
  const r = Math.max(rTop, rBottom);
  scaleGroups(g, [[2 * Math.PI * r, h], [2 * r, 2 * r], [2 * r, 2 * r]]);
  g.translate(0, h / 2, 0);
  return g;
}

/**
 * Box-projected UVs in metres from vertex positions (for rounded or merged geometry).
 * @param {THREE.BufferGeometry} g
 */
export function worldPlanarUV(g) {
  const pos = g.getAttribute('position');
  g.computeVertexNormals();
  const nor = g.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (ny >= nx && ny >= nz) uv.set([x, z], i * 2);
    else if (nx >= nz) uv.set([z, y], i * 2);
    else uv.set([x, y], i * 2);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/**
 * A mesh that casts and receives shadows.
 * @param {THREE.BufferGeometry} g
 * @param {THREE.Material | THREE.Material[]} m
 * @param {number} [x]
 * @param {number} [y]
 * @param {number} [z]
 */
export function mesh(g, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}
