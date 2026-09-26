// @ts-check
// Short bursts at a piece of furniture, from sim events main.js forwards (renderer.effect): sparks off the electric
// net, the chainsaw's grinding, splinters when a trap or barricade takes a hit, debris when one breaks, a puff of dust
// when something is repaired or installed. Two point pools (additive sparks, lit debris and dust), one draw call
// each. And the trading drone: it lifts off the roof and flies out of sight, and comes back the same way.
import * as THREE from 'three';
import { rng } from './props.js';
import { box, cyl, mesh } from './geom.js';

const MAX = 600;

/** @typedef {'zap' | 'saw' | 'hit' | 'break' | 'dust'} BurstKind */

/**
 * Per kind: particle count, colours, speed (m/s), upward bias, gravity, life (s), additive glow (the point size is
 * the pool's: sparks, debris, dust).
 * @type {Record<BurstKind, { n: number, colors: string[], speed: number, up: number, g: number, life: number, glow: boolean }>}
 */
const KINDS = {
  zap: { n: 26, colors: ['#cfe8ff', '#8fc4ff', '#ffffff'], speed: 3.2, up: 1.2, g: 6, life: 0.35, glow: true },
  saw: { n: 14, colors: ['#ffc46b', '#ff8a3d', '#fff0c0'], speed: 4, up: 1.5, g: 9, life: 0.45, glow: true },
  hit: { n: 8, colors: ['#7a5a3a', '#5e4630', '#9a7a55'], speed: 2, up: 1.5, g: 9.8, life: 0.7, glow: false },
  break: { n: 40, colors: ['#7a5a3a', '#5e4630', '#8a8a86', '#4d4a45'], speed: 3.2, up: 2.2, g: 9.8, life: 1.3, glow: false },
  dust: { n: 18, colors: ['#8f897d', '#7b766c', '#9d978a'], speed: 0.5, up: 0.5, g: -0.2, life: 1.4, glow: false },
};

/** A soft round sprite. */
function dotTexture() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d');
  if (!g) return null;
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.8)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

class Pool {
  /**
   * @param {boolean} glow
   * @param {number} size  point size, metres
   * @param {string} name
   * @param {number} [opacity]
   */
  constructor(glow, size, name, opacity = 1) {
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    /** remaining life and full life, gravity, per particle */
    this.life = new Float32Array(MAX);
    this.full = new Float32Array(MAX);
    this.g = new Float32Array(MAX);
    this.base = new Float32Array(MAX * 3);
    this.next = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const tex = dotTexture();
    this.material = new THREE.PointsMaterial({
      size,
      map: tex,
      vertexColors: true,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
      sizeAttenuation: true,
      alphaTest: glow ? 0 : 0.05,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.name = `fx:${name}`;
    this.live = 0;
    // parked far below the floor while dead
    for (let i = 0; i < MAX; i++) this.pos[i * 3 + 1] = -1000;
  }

  /**
   * @param {THREE.Vector3} at
   * @param {(typeof KINDS)[BurstKind]} k
   * @param {() => number} r
   * @param {number} spread  half-width of the piece, metres
   */
  emit(at, k, r, spread) {
    const c = new THREE.Color();
    for (let n = 0; n < k.n; n++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const a = r() * Math.PI * 2;
      const s = k.speed * (0.4 + r() * 0.6);
      this.pos.set([at.x + (r() - 0.5) * spread, at.y + (r() - 0.5) * 0.3, at.z + (r() - 0.5) * spread], i * 3);
      this.vel.set([Math.cos(a) * s, k.up * (0.5 + r()), Math.sin(a) * s], i * 3);
      this.life[i] = this.full[i] = k.life * (0.6 + r() * 0.6);
      this.g[i] = k.g;
      c.set(k.colors[Math.floor(r() * k.colors.length)]).convertSRGBToLinear();
      if (k.glow) c.multiplyScalar(4);
      this.base.set([c.r, c.g, c.b], i * 3);
    }
    this.live = MAX;
  }

  /** @param {number} dt */
  update(dt) {
    if (!this.live) return;
    let alive = 0;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const j = i * 3;
      if (this.life[i] <= 0) {
        this.pos[j + 1] = -1000;
        continue;
      }
      alive++;
      this.vel[j + 1] -= this.g[i] * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      // settle on the floor: debris stops, sparks die
      if (this.pos[j + 1] < 0.01 && this.vel[j + 1] < 0) {
        this.pos[j + 1] = 0.01;
        this.vel[j] *= 0.3;
        this.vel[j + 2] *= 0.3;
        this.vel[j + 1] = 0;
      }
      const f = Math.min(1, (this.life[i] / this.full[i]) * 2);
      this.col[j] = this.base[j] * f;
      this.col[j + 1] = this.base[j + 1] * f;
      this.col[j + 2] = this.base[j + 2] * f;
    }
    this.live = alive;
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

/** A small quadcopter: body, four arms, rotors that spin, a red and a green light. */
function droneModel() {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: '#2b2d31', roughness: 0.5, metalness: 0.3 });
  const grey = new THREE.MeshStandardMaterial({ color: '#8b8f96', roughness: 0.4, metalness: 0.5 });
  g.add(mesh(box(0.22, 0.07, 0.3, { centered: true }), dark));
  /** @type {THREE.Object3D[]} */
  const rotors = [];
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const arm = mesh(box(0.26, 0.025, 0.03, { centered: true }), grey, x * 0.12, 0.01, z * 0.12);
    arm.rotation.y = x * z > 0 ? -Math.PI / 4 : Math.PI / 4;
    g.add(arm);
    const rotor = mesh(cyl(0.1, 0.1, 0.006, 16), new THREE.MeshStandardMaterial({ color: '#1b1b1b', transparent: true, opacity: 0.45 }), x * 0.2, 0.04, z * 0.2);
    rotors.push(rotor);
    g.add(rotor);
  }
  const red = new THREE.MeshStandardMaterial({ color: '#ff3b30', emissive: '#ff3b30', emissiveIntensity: 3 });
  const green = new THREE.MeshStandardMaterial({ color: '#34c759', emissive: '#34c759', emissiveIntensity: 3 });
  g.add(mesh(box(0.03, 0.03, 0.03, { centered: true }), red, -0.1, 0, 0.15));
  g.add(mesh(box(0.03, 0.03, 0.03, { centered: true }), green, 0.1, 0, 0.15));
  g.userData.rotors = rotors;
  g.scale.setScalar(1.3);
  return g;
}

export class EffectsLayer {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'effects';
    this.sparks = new Pool(true, 0.06, 'sparks');
    this.debris = new Pool(false, 0.09, 'debris');
    // points are unlit: dust is drawn dim and thin so it reads as haze in a lamp-lit room, not as cotton wool
    this.dust = new Pool(false, 0.3, 'dust', 0.5);
    this.group.add(this.sparks.points, this.debris.points, this.dust.points);
    this.seed = 1;
    /** @type {{ obj: THREE.Group, from: THREE.Vector3, to: THREE.Vector3, t: number, out: boolean } | null} */
    this.drone = null;
    /** @type {THREE.Group | null} built on the first flight, then reused */
    this.droneObj = null;
  }

  /**
   * A burst at a point.
   * @param {BurstKind} kind
   * @param {THREE.Vector3} at
   * @param {number} [spread]
   */
  burst(kind, at, spread = 0.6) {
    const k = KINDS[kind];
    if (!k) return;
    const r = rng(this.seed++ * 0x2545f491);
    (k.glow ? this.sparks : kind === 'dust' ? this.dust : this.debris).emit(at, k, r, spread);
    // debris kicks up a little dust too
    if (kind === 'break') this.dust.emit(at, KINDS.dust, r, spread);
  }

  /**
   * The drone leaves (out) or comes home (back) at a point on the house.
   * @param {boolean} out
   * @param {THREE.Vector3} home  where it lands, on the roof or the yard
   */
  fly(out, home) {
    if (this.drone) {
      this.group.remove(this.drone.obj);
      this.drone = null;
    }
    const obj = (this.droneObj ||= droneModel());
    const away = home.clone().add(new THREE.Vector3(-14, 9, -14));
    this.drone = { obj, from: out ? home.clone() : away, to: out ? away : home.clone(), t: 0, out };
    obj.position.copy(this.drone.from);
    this.group.add(obj);
  }

  /** @param {number} dt real seconds */
  update(dt) {
    this.sparks.update(dt);
    this.debris.update(dt);
    this.dust.update(dt);
    const d = this.drone;
    if (!d) return;
    d.t += dt / 6;
    const t = Math.min(1, d.t);
    // out: straight up first, then away; back: in along the same path, then down
    const lift = d.out ? Math.min(1, t / 0.25) : Math.max(0, (t - 0.75) / 0.25);
    const along = d.out ? Math.max(0, (t - 0.2) / 0.8) : Math.min(1, t / 0.8);
    const e = along * along * (3 - 2 * along);
    const home = d.out ? d.from : d.to;
    const far = d.out ? d.to : d.from;
    const x = home.x + (far.x - home.x) * (d.out ? e : 1 - e);
    const z = home.z + (far.z - home.z) * (d.out ? e : 1 - e);
    const cruise = home.y + 2.5 + (far.y - home.y) * (d.out ? e : 1 - e);
    const y = home.y + (cruise - home.y) * (d.out ? lift : 1 - lift);
    d.obj.position.set(x, y, z);
    d.obj.rotation.set(0.25 * Math.sin(t * Math.PI), Math.atan2(far.x - home.x, far.z - home.z) + (d.out ? 0 : Math.PI), 0);
    for (const rt of /** @type {THREE.Object3D[]} */ (d.obj.userData.rotors)) rt.rotation.y += dt * 60;
    if (t >= 1) {
      this.group.remove(d.obj);
      this.drone = null;
    }
  }
}
