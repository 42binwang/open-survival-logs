// @ts-check
// Blood on the floor: a splat where a figure takes a hit, a pool that spreads under the dead. One instanced mesh with
// one generated splat texture (a draw call for all of them); each instance has its own turn, size and shade. Splats
// darken as they dry and shrink away after a while; the oldest go first past the cap. Cleared on a scene change.
import * as THREE from 'three';
import { rng } from './props.js';

const MAX = 64;
/** Seconds a splat stays before it starts to fade, and how long the fade takes. */
const STAY = 90;
const FADE = 12;
/** A pool spreads to full size over this many seconds. */
const SPREAD = 3.5;

/** A splat mask: a dense core, lobes and droplets around it (white on transparent). */
function splatTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (!g) return null;
  const r = rng(0x5b1d);
  g.fillStyle = '#fff';
  const blob = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ rad) => {
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  };
  blob(64, 64, 26);
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2;
    const d = 14 + r() * 18;
    blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 8 + r() * 12);
  }
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2;
    const d = 40 + r() * 20;
    blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 1.5 + r() * 3.5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export class BloodLayer {
  constructor() {
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.22,
      metalness: 0,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const tex = splatTexture();
    if (tex) mat.alphaMap = tex;
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.name = 'blood';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
    /** @type {{ x: number, y: number, z: number, turn: number, size: number, born: number, pool: boolean, shade: number }[]} */
    this.splats = [];
    this.key = '';
    this.seed = 1;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.col = new THREE.Color();
  }

  /**
   * A splat (a hit) or a pool (a death) at a floor point.
   * @param {number} x
   * @param {number} z
   * @param {{ pool?: boolean, y?: number, now: number }} o
   */
  add(x, z, o) {
    const r = rng(this.seed++ * 0x9e3779b1);
    const pool = !!o.pool;
    // a hit throws the blood a little off the figure
    const off = pool ? 0.1 : 0.25 + r() * 0.35;
    const a = r() * Math.PI * 2;
    this.splats.push({
      x: x + Math.cos(a) * off,
      y: (o.y ?? 0) + 0.004 + this.splats.length * 0.0002,
      z: z + Math.sin(a) * off,
      turn: r() * Math.PI * 2,
      size: pool ? 1.1 + r() * 0.4 : 0.35 + r() * 0.3,
      born: o.now,
      pool,
      shade: 0.85 + r() * 0.3,
    });
    if (this.splats.length > MAX) this.splats.shift();
  }

  /**
   * @param {string} key  the scene (a change clears the floor)
   * @param {number} now  seconds
   */
  update(key, now) {
    if (key !== this.key) {
      this.key = key;
      this.splats = [];
    }
    this.splats = this.splats.filter((s) => now - s.born < STAY + FADE);
    const up = new THREE.Vector3(0, 1, 0);
    let i = 0;
    for (const s of this.splats) {
      const age = now - s.born;
      const grow = s.pool ? Math.min(1, 0.25 + (0.75 * age) / SPREAD) : Math.min(1, 0.6 + age * 4);
      const fade = age > STAY ? Math.max(0, 1 - (age - STAY) / FADE) : 1;
      const k = s.size * grow * (0.4 + 0.6 * fade);
      this.q.setFromAxisAngle(up, s.turn);
      this.m.compose(new THREE.Vector3(s.x, s.y, s.z), this.q, new THREE.Vector3(k, 1, k));
      this.mesh.setMatrixAt(i, this.m);
      // fresh blood is a deep glossy red; it browns and darkens as it dries
      const dry = Math.min(1, age / 40);
      this.col.setRGB(0.3 - 0.14 * dry, 0.018, 0.012 + 0.004 * dry).multiplyScalar(s.shade * (0.3 + 0.7 * fade));
      this.mesh.setColorAt(i, this.col);
      i++;
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
