// @ts-check
// Lighting rigs from ART.md §4.3: dawn, day, dusk and night keys, blended linearly over 45 game-minutes around each
// boundary, the sun's azimuth moving monotonically (dawn 75° → day 15° → dusk 285°) and the moon taking over at night.
// Intensities are in the scene units ART.md uses (E: irradiance on the normal / horizontal), which three.js takes
// directly as light intensities. Interiors are lit by sky and bounce (the floors above block the key light, R1/R3);
// at night the lamps of powered rooms add warm point lights; weather dims the key and cools the sky.
import * as THREE from 'three';
import { hourOfDay } from '../sim/time.js';

/**
 * A black-body colour (Tanner Helland's fit), linear sRGB, normalised to its largest channel.
 * @param {number} k  Kelvin
 */
export function kelvin(k) {
  const t = k / 100;
  let r;
  let g;
  let b;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  const c = new THREE.Color().setRGB(clamp01(r / 255), clamp01(g / 255), clamp01(b / 255), THREE.SRGBColorSpace);
  const m = Math.max(c.r, c.g, c.b) || 1;
  return c.multiplyScalar(1 / m);
}
/** Sky and bounce fill over the ART.md rig values, fitted to the side-by-side pairs (docs/quality/side-by-side.json). */
export const FILL = 1.6;

/** A shaded bulb's intensity (ART.md §4.5 starts at 0.284; scaled by FILL like the sky, and tuned by eye to t033). */
export const LAMP_I = 0.284 * 3;
/** The flashlight (ART.md §4.5: I 710 puts the pool centre at the clip on a 0.40 floor). */
export const TORCH_I = 710;

/** @param {number} v */
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * @typedef {object} Rig
 * @property {number} keyK  key light colour temperature
 * @property {number} keyE  key irradiance on the normal
 * @property {number} az  key azimuth, degrees clockwise from north (may run negative to keep it monotonic)
 * @property {number} el  key elevation, degrees
 * @property {number} skyK
 * @property {number} skyE  sky irradiance on the horizontal (exterior)
 * @property {number} groundK
 * @property {number} groundE
 * @property {number} interiorE  sky and bounce reaching the rooms (bake target, ART.md §4.3 column 4)
 * @property {number} shadows  0 … 1 key shadow strength
 * @property {number} night  0 day … 1 night (lamps, window glow)
 */

/** @type {Record<string, Rig>} */
const RIGS = {
  night: { keyK: 7000, keyE: 0.138, az: 15 - 360, el: 45, skyK: 8000, skyE: 0.042, groundK: 6000, groundE: 0.012, interiorE: 0.101, shadows: 1, night: 1 },
  dawn: { keyK: 3500, keyE: 0.4, az: 75, el: 8, skyK: 6500, skyE: 0.521, groundK: 4500, groundE: 0.1, interiorE: 0.142, shadows: 0.4, night: 0.3 },
  day: { keyK: 5500, keyE: 2.227, az: 15, el: 60, skyK: 7500, skyE: 0.291, groundK: 4000, groundE: 0.087, interiorE: 0.419, shadows: 1, night: 0 },
  dusk: { keyK: 2600, keyE: 1.26, az: -75, el: 12, skyK: 8000, skyE: 0.165, groundK: 4000, groundE: 0.05, interiorE: 0.197, shadows: 1, night: 0.5 },
};

/** Plateaus and 45-minute transitions (hours), wrapping at 24. @type {[number, string][]} */
const KEYS = [
  [5.125, 'night'],
  [5.875, 'dawn'],
  [7.625, 'dawn'],
  [8.375, 'day'],
  [15.625, 'day'],
  [16.375, 'dusk'],
  [18.625, 'dusk'],
  [19.375, 'night'],
];

/** @param {number} h  hour of day, fractional */
export function rigAt(h) {
  const hh = ((h % 24) + 24) % 24;
  const n = KEYS.length;
  // the segment [a, b) holding hh, wrapping past midnight
  let i = KEYS.findIndex(([t], k) => hh >= t && hh < (k + 1 < n ? KEYS[k + 1][0] : KEYS[0][0] + 24));
  let at = KEYS[i < 0 ? n - 1 : i][0];
  if (i < 0) {
    i = n - 1;
    at -= 24;
  }
  const a = KEYS[i];
  const b = KEYS[(i + 1) % n];
  const bt = i + 1 < n ? b[0] : b[0] + 24;
  const t = bt === at ? 0 : (hh - at) / (bt - at);
  const A = RIGS[a[1]];
  const B = RIGS[b[1]];
  /** @type {any} */
  const out = {};
  for (const k of Object.keys(A)) out[k] = A[/** @type {keyof Rig} */ (k)] + (B[/** @type {keyof Rig} */ (k)] - A[/** @type {keyof Rig} */ (k)]) * t;
  // the moon and the sun are separate bodies: at the night boundaries the key fades out and back in rather than swinging round
  if ((a[1] === 'night') !== (b[1] === 'night')) {
    const night = a[1] === 'night' ? A : B;
    const day = a[1] === 'night' ? B : A;
    const w = a[1] === 'night' ? t : 1 - t; // weight of the day body
    const dayKey = w;
    out.az = w > 0.5 ? day.az : night.az;
    out.el = w > 0.5 ? day.el : night.el;
    out.keyK = w > 0.5 ? day.keyK : night.keyK;
    out.keyE = Math.abs(dayKey - 0.5) * 2 * (w > 0.5 ? day.keyE : night.keyE);
  }
  return /** @type {Rig} */ (out);
}

/** Weather multipliers: key, sky, sky temperature shift, shadows. @param {string | undefined} kind @param {number | undefined} sun */
function weatherMod(kind, sun) {
  const base = { key: 1, sky: 1, skyK: 0, interior: 1, shadows: 1 };
  switch (kind) {
    case 'cloudy':
      return { key: 0.35, sky: 1.25, skyK: -500, interior: 0.95, shadows: 0.5 };
    case 'rain':
      return { key: 0.12, sky: 1.2, skyK: -800, interior: 0.85, shadows: 0.2 };
    case 'heavyRain':
    case 'storm':
      return { key: 0.05, sky: 1.05, skyK: -500, interior: 0.8, shadows: 0 };
    case 'snow':
    case 'coldWave':
    case 'freezingRain':
      return { key: 0.05, sky: 1.5, skyK: -1000, interior: 1.05, shadows: 0 };
    default:
      if (sun != null && sun < 1) return { ...base, key: 0.3 + 0.7 * sun };
      return base;
  }
}

/** The sun's direction moves in steps of this many degrees (about two game minutes), see Lighting.update. */
const SUN_STEP_DEG = 0.5;

export class Lighting {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.key = new THREE.DirectionalLight(0xffffff, 1);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.02;
    this.key.shadow.radius = 3;
    scene.add(this.key, this.key.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.3);
    scene.add(this.hemi);
    this.flash = 0;
    this.flashUntil = 0;
    /** @type {THREE.PointLight[]} */
    this.lamps = [];
    this.lampGroup = new THREE.Group();
    this.lampGroup.name = 'lamps';
    scene.add(this.lampGroup);
    // the survivor's flashlight (ART.md §4.5): 6500 K, 22°, penumbra 0.35, decay 2, distance 10, I 710
    this.torch = new THREE.SpotLight(kelvin(6500), 0, 10, THREE.MathUtils.degToRad(22), 0.35, 2);
    this.torch.castShadow = true;
    this.torch.shadow.mapSize.set(512, 512);
    scene.add(this.torch, this.torch.target);
    /** @type {THREE.PointLight[]} */
    this.fires = [];
    // lamp fixtures (ART.md §4.5): a table or floor lamp is two spots (down 55°, up 40°) around its shaded bulb, a
    // wall lamp one spot aimed down; 2700 K. A pool of eight fixtures goes to the ones nearest the camera.
    /** @type {{ down: THREE.SpotLight, up: THREE.SpotLight }[]} */
    this.fixtures = [];
    const lampColor = new THREE.Color('#ffad59');
    for (let i = 0; i < 8; i++) {
      const down = new THREE.SpotLight(lampColor, 0, 6, THREE.MathUtils.degToRad(55), 0.5, 2);
      const up = new THREE.SpotLight(lampColor, 0, 6, THREE.MathUtils.degToRad(40), 0.5, 2);
      this.lampGroup.add(down, down.target, up, up.target);
      this.fixtures.push({ down, up });
    }
    /** @type {{ pos: THREE.Vector3, dir?: THREE.Vector3 }[]} */
    this.fixtureSpots = [];
    this.rig = rigAt(12);
    this.exterior = 0;
  }

  /**
   * The lamp fixtures of the scene: furniture lamps (no direction: a shaded bulb) and wall lamps (aimed).
   * @param {{ pos: THREE.Vector3, dir?: THREE.Vector3 }[]} list
   */
  setFixtures(list) {
    this.fixtureSpots = list;
  }

  /**
   * @param {{ x: number, z: number, room: string }[]} spots
   */
  setLampSpots(spots) {
    for (const l of this.lamps) {
      this.lampGroup.remove(l);
      l.dispose();
    }
    this.lamps = spots.slice(0, 10).map((s) => {
      const l = new THREE.PointLight(kelvin(2900), 0, 9, 2);
      l.position.set(s.x, 2.7, s.z);
      this.lampGroup.add(l);
      return l;
    });
  }

  /**
   * @param {import('../contracts/view.js').SceneView} view
   * @param {THREE.Vector3} focus  the camera's look-at point
   * @param {THREE.Vector3 | null} player
   * @param {number} extent  half-size of the shadow frustum, metres
   * @param {THREE.Vector3} [shadowAt]  the centre of the shadow frustum (the floor's centre; the focus if not given)
   */
  update(view, focus, player, extent, shadowAt = focus) {
    const h = this.debugHour ?? hourOfDay(view.clock);
    const rig = rigAt(h);
    this.rig = rig;
    const indoors = !!(view.basement || view.indoorDark);
    const w = weatherMod(view.weather?.kind, view.weather?.sun);
    const now = performance.now();
    const flash = view.weather?.kind === 'storm' && now < this.flashUntil ? Math.max(0, (this.flashUntil - now) / 150) : 0;

    // key light
    // Stable shadows: the sun turns in SUN_STEP_DEG steps rather than every frame, and the shadow camera sits on a
    // whole shadow-map texel, so shadow edges and self-shadowing on walls do not crawl ("twinkle") between frames
    // while the clock runs or the camera follows the survivor.
    const az = THREE.MathUtils.degToRad(Math.round(rig.az / SUN_STEP_DEG) * SUN_STEP_DEG);
    const el = THREE.MathUtils.degToRad(Math.round(rig.el / SUN_STEP_DEG) * SUN_STEP_DEG);
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    const texel = (2 * extent) / this.key.shadow.mapSize.x;
    const right = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
    const up = dir.clone().cross(right).normalize();
    const snap = (/** @type {THREE.Vector3} */ axis) => Math.round(shadowAt.dot(axis) / texel) * texel - shadowAt.dot(axis);
    const anchor = shadowAt.clone().addScaledVector(right, snap(right)).addScaledVector(up, snap(up));
    this.key.position.copy(anchor).addScaledVector(dir, 30);
    this.key.target.position.copy(anchor);
    this.key.color.copy(kelvin(rig.keyK));
    this.key.intensity = indoors ? 0 : rig.keyE * w.key + flash * 3;
    this.key.castShadow = !indoors && rig.shadows * w.shadows > 0.15;
    const cam = this.key.shadow.camera;
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent;
    cam.bottom = -extent;
    cam.near = 1;
    cam.far = 70;
    cam.updateProjectionMatrix();

    // sky and bounce: the interior target lights the rooms; exteriors also get the key
    const skyK = rig.skyK + w.skyK;
    this.hemi.color.copy(kelvin(skyK));
    this.hemi.groundColor.copy(kelvin(rig.groundK)).multiplyScalar(0.55);
    // FILL: the source lifts its shadows far above a physical sky term (side-by-side pairs: its p10 sits 20–40 codes
    // above a bare ART.md rig), so sky and bounce are scaled up by one measured factor
    let e = rig.interiorE * w.interior * FILL;
    if (view.basement) e = 0.06;
    if (view.indoorDark) e = 0.012;
    this.hemi.intensity = e + flash * 0.8;

    // lamps: electric light at night in powered rooms (the view's lamp facts, or the Canvas rule)
    const powered = view.lightsPowered ?? view.powered ?? view.lightsOn;
    const on = !!(view.lightsOn || (powered && !view.lightsSwitchedOff && (rig.night > 0.35 || view.basement)));
    const lampE = on ? (view.basement ? 8 : 7) * (view.basement ? 1 : Math.min(1, rig.night * 1.4)) : 0;
    // lamp fixtures carry the light where a room has them; the room-centre fill stays for rooms without any
    const fixtures = on ? [...this.fixtureSpots].sort((p, q) => p.pos.distanceToSquared(focus) - q.pos.distanceToSquared(focus)) : [];
    const lampI = on ? LAMP_I * (view.basement ? 1 : Math.min(1, rig.night * 1.4)) : 0;
    this.fixtures.forEach((fx, i) => {
      const spot = fixtures[i];
      if (!spot) {
        fx.down.intensity = 0;
        fx.up.intensity = 0;
        return;
      }
      fx.down.position.copy(spot.pos);
      fx.up.position.copy(spot.pos);
      if (spot.dir) {
        // a wall lamp: one spot along its aim
        fx.down.target.position.copy(spot.pos).addScaledVector(spot.dir, 2);
        fx.down.angle = THREE.MathUtils.degToRad(50);
        fx.down.penumbra = 0.6;
        fx.down.distance = 8;
        fx.down.intensity = lampI;
        fx.up.intensity = 0;
      } else {
        fx.down.target.position.copy(spot.pos).add(new THREE.Vector3(0, -2, 0));
        fx.up.target.position.copy(spot.pos).add(new THREE.Vector3(0, 2, 0));
        fx.down.angle = THREE.MathUtils.degToRad(55);
        fx.down.penumbra = 0.5;
        fx.down.distance = 6;
        fx.down.intensity = lampI;
        fx.up.intensity = lampI * 0.6;
      }
    });
    const lit = new Set(fixtures.slice(0, this.fixtures.length).map((f) => `${Math.floor(f.pos.x)},${Math.floor(f.pos.z)}`));
    for (const l of this.lamps) {
      // a room whose centre has a fixture within reach keeps a softer fill
      const near = [...lit].some((k) => {
        const [x, z] = k.split(',').map(Number);
        return Math.hypot(x + 0.5 - l.position.x, z + 0.5 - l.position.z) < 3.5;
      });
      l.intensity = lampE * (near ? 0.45 : 1);
    }

    // the survivor's torch where the view asks for one
    if (view.flashlight && player) {
      // held at 1.3 m, aimed 35° down along the survivor's facing (ART.md §4.5)
      const yaw = this.torchYaw || 0;
      const reach = 1.3 / Math.tan(THREE.MathUtils.degToRad(35));
      this.torch.intensity = TORCH_I;
      this.torch.position.set(player.x + Math.sin(yaw) * 0.25, 1.3, player.z + Math.cos(yaw) * 0.25);
      this.torch.target.position.set(player.x + Math.sin(yaw) * reach, 0, player.z + Math.cos(yaw) * reach);
    } else this.torch.intensity = 0;

    // fires
    const fires = view.fires || [];
    while (this.fires.length < fires.length) {
      const l = new THREE.PointLight(kelvin(1900), 0, 7, 2);
      this.scene.add(l);
      this.fires.push(l);
    }
    this.fires.forEach((l, i) => {
      const f = fires[i];
      if (!f) {
        l.intensity = 0;
        return;
      }
      l.position.set(f.x + 0.5, 0.6, f.y + 0.5);
      // flicker from the clock (two beating sines), so a capture repeats
      const tt = performance.now() / 1000 + i * 1.7;
      l.intensity = 6 * (1 + 0.12 * Math.sin(tt * 11.3) + 0.08 * Math.sin(tt * 23.9)) * (f.r || 1);
    });
    // only lights that shine count in the shaders: unused ones are hidden rather than set to zero
    for (const fx of this.fixtures) {
      fx.down.visible = fx.down.intensity > 0;
      fx.up.visible = fx.up.intensity > 0;
    }
    for (const l of this.lamps) l.visible = l.intensity > 0;
    for (const l of this.fires) l.visible = l.intensity > 0;
    this.torch.visible = this.torch.intensity > 0;
    return rig;
  }

  /** @param {number} ms */
  lightning(ms) {
    this.flashUntil = performance.now() + ms;
  }

  /** @type {number | undefined} */
  torchYaw = 0;

  /** Hour override for look checks from the console (null: the game clock). @type {number | null} */
  debugHour = null;
}
