// @ts-check
// The three.js renderer (`?render=3d`): implements src/contracts/render.js over the same view model as the Canvas
// renderer. Camera by src/contracts/look.js (ART.md §1.2: pitch 40°, yaw 30°, 10.47 m, FOV 60° → 50° on zoom),
// the shell by src/render3d/shell.js, props by furniture.js, characters by actors.js, rigs by lighting.js, and the
// pass chain by post.js.
import * as THREE from 'three';
import { game } from '../game.js';
import { CAMERA, cameraOffset, zoomFov } from '../contracts/look.js';
import { screenToIso, isoToScreen, gpuBytes } from '../contracts/render.js';
import { MaterialLibrary, WEATHER_UNIFORMS } from './materials.js';
import { buildShell, shellKey, storeyOf, STOREY_H } from './shell.js';
import { FurnitureLayer, disposeTree } from './furniture.js';
import { EffectsLayer } from './effects.js';
import { BloodLayer } from './blood.js';
import { rng } from './props.js';
import { ActorLayer } from './actors.js';
import { Lighting } from './lighting.js';
import { Post } from './post.js';
import { ModelLibrary } from './models.js';
import { Overlays } from './overlays.js';
import { buildSurroundings } from './surroundings.js';
import { buildDressing, dressingKey, CLUTTER_MODELS } from './dressing.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * The render quality: `?quality=low|high`, else low on a software rasteriser (SwiftShader, llvmpipe: headless
 * browsers and machines without a GPU), where the AO pass and 4x MSAA cost seconds per frame.
 * @param {THREE.WebGLRenderer} gl
 * @returns {'high' | 'low'}
 */
function pickQuality(gl) {
  const q = new URLSearchParams(globalThis.location?.search || '').get('quality');
  if (q === 'low' || q === 'high') return q;
  // the Graphics setting (src/game.js settings.graphics)
  const setting = game.settings?.graphics;
  if (setting === 'low' || setting === 'high') return setting;
  try {
    const ctx = gl.getContext();
    const ext = ctx.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER));
    if (/swiftshader|llvmpipe|software|basic render/i.test(name)) return 'low';
  } catch {
    // unknown device: high
  }
  return 'high';
}

/** The wheel's zoom factor per notch, and the notches from 60° to 50° at 2.5° each (ART.md §1.2) */
const ZOOM_STEP = 1.1;
const ZOOM_NOTCHES = (CAMERA.vfovDefault - CAMERA.vfovMin) / 2.5;
/** The swivel limit, degrees (ART.md §1.2: −0.32 rad, taken as 18°) */
const SWIVEL_DEG = 18;

export class ThreeRenderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    /** @type {import('../contracts/render.js').Camera} */
    this.cam = { x: 0, y: 0, zoom: 1, follow: true };
    /** cam.zoom's range here (the wheel keeps to it): zoomed out at 60°, four notches in at 50° */
    this.zoomLimits = [1, ZOOM_STEP ** ZOOM_NOTCHES];
    this.snapFov = true;
    this.frameDt = 0;
    /** @type {import('../contracts/render.js').Hover | null} */
    this.hover = null;
    /** @type {Set<number | string>} */
    this.highlight = new Set();
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.AgXToneMapping;
    this.gl.toneMappingExposure = 1.1;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    // count every pass of a frame (post-processing renders several times per frame)
    this.gl.info.autoReset = false;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0d0e10');
    this.camera = new THREE.PerspectiveCamera(CAMERA.vfovDefault, 16 / 9, CAMERA.near, CAMERA.far);
    // a neutral room for reflections (metals, glass, glossy tiles); its strength follows the rig
    const pmrem = new THREE.PMREMGenerator(this.gl);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.lib = new MaterialLibrary(this.gl);
    this.models = new ModelLibrary(this.lib);
    /** the clutter models have loaded (the dressing is rebuilt once with them) */
    this.clutterReady = false;
    this.furniture = new FurnitureLayer(this.lib, this.models);
    this.actors = new ActorLayer(this.gl, this.lib);
    this.actors.furniture = this.furniture;
    this.blood = new BloodLayer();
    this.effects = new EffectsLayer();
    /** @type {import('../contracts/view.js').SceneView | null} the last view drawn (effects find their piece in it) */
    this.lastView = null;
    this.actors.onBlood = (x, z, pool) => this.blood.add(x, z, { pool, now: this.timer.getElapsed() });
    this.lighting = new Lighting(this.scene);
    this.scene.add(this.furniture.group, this.actors.group, this.blood.mesh, this.effects.group);
    this.quality = pickQuality(this.gl);
    if (this.quality === 'low') this.lighting.key.shadow.mapSize.set(1024, 1024);
    this.post = new Post(this.gl, this.scene, this.camera, this.quality);
    /** @type {{ key: string, group: THREE.Group, ground: THREE.Object3D[], extent: number, cx: number, cz: number } | null} */
    this.shell = null;
    this.focus = new THREE.Vector3();
    /** @type {{ key: string, group: THREE.Group, glow: THREE.MeshStandardMaterial[], lamps: { pos: THREE.Vector3, dir: THREE.Vector3 }[] } | null} */
    this.dressing = null;
    /** @type {THREE.MeshStandardMaterial[]} emissive materials of the surroundings that light up at night */
    this.glowing = [];
    this.raycaster = new THREE.Raycaster();
    /** @type {{ cx: number, cy: number, wx: number, wy: number } | null} */
    this.lastRay = null;
    this.timer = new THREE.Timer();
    this.lastT = 0;
    this.weather = new Weather(this.scene);
    this.overlays = new Overlays(this.scene);
    this.ready = Promise.all([this.lib.ready, this.actors.ready]).then(() => undefined);
    // what the first frame does not need waits for it: the scanned props (procedural ones stand in) and the clutter
    // models shared the bandwidth with the materials and the survivor and held a cold start back by seconds
    this.models.gate = this.ready;
    this.ready.then(() => this.models.preload(CLUTTER_MODELS)).then(() => (this.clutterReady = true));
    this.frameStats = { drawCalls: 0, triangles: 0, gpuBytes: 0 };
    /** @type {number | undefined} eased fog density */
    this.fogDensity = undefined;
    /** Camera distance multiplier for close inspection from the console (1 = ART.md's 10.47 m). */
    this.debugDistance = 1;
    /** @type {number | undefined} smoothed frame time, ms */
    this.frameMs = undefined;
    /** @type {number | undefined} seconds since the governor last changed something */
    this.govT = undefined;
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    // render scale: full resolution up to 1080p-class canvases, capped on HiDPI (post targets are 4x MSAA half-float)
    const pr = Math.min(this.quality === 'high' ? 1.5 : 1, globalThis.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    this.gl.setPixelRatio(pr);
    this.gl.setSize(w, h, false);
    this.post.setSize(w, h, pr);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Points the camera at the look-at point in camera units (src/contracts/render.js). */
  #placeCamera() {
    const [tx, ty] = screenToIso(this.cam.x, this.cam.y);
    this.focus.set(tx, 0, ty);
    // the swivel input runs to ±0.35 while a rotate key is held: ART.md §1.2's 18° limit at full turn
    const yaw = CAMERA.yawDeg + (Math.max(-0.35, Math.min(0.35, this.cam.swivel || 0)) / 0.35) * SWIVEL_DEG;
    const [ox, oy, oz] = cameraOffset(yaw);
    const k = this.debugDistance;
    this.camera.position.set(this.focus.x + ox * k, oy * k, this.focus.z + oz * k);
    this.camera.lookAt(this.focus);
    // zoom is FOV only, 60° → 50°: each wheel notch (× 1.1 on cam.zoom) moves the target 2.5°, eased over ~0.25 s
    const notches = Math.log(Math.max(1, this.cam.zoom)) / Math.log(ZOOM_STEP);
    const want = zoomFov(notches / ZOOM_NOTCHES);
    const fov = this.snapFov ? want : this.camera.fov + (want - this.camera.fov) * (1 - Math.exp(-this.frameDt / 0.08));
    this.snapFov = false;
    if (Math.abs(this.camera.fov - fov) > 1e-3) {
      this.camera.fov = Math.abs(fov - want) < 0.01 ? want : fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld();
  }

  /**
   * look.js's zoom amount (0 zoomed out … 1 zoomed in, FOV 60° → 50°) as the contract's cam.zoom.
   * @param {number} t
   */
  setLookZoom(t) {
    this.cam.zoom = ZOOM_STEP ** (ZOOM_NOTCHES * Math.min(1, Math.max(0, t)));
    this.snapFov = true;
  }

  /** @param {number} x @param {number} y */
  centerOn(x, y) {
    const [sx, sy] = isoToScreen(x, y);
    this.cam.x = sx;
    this.cam.y = sy;
  }

  /**
   * Client px → world point on the floor plane.
   * @param {number} cx @param {number} cy
   */
  toWorld(cx, cy) {
    this.#placeCamera();
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ok = this.raycaster.ray.intersectPlane(plane, hit);
    const wx = ok ? hit.x : this.focus.x;
    const wy = ok ? hit.z : this.focus.z;
    this.lastRay = { cx, cy, wx, wy };
    return [wx, wy];
  }

  /** World point on the floor plane → canvas px. @param {number} x @param {number} y */
  toCanvas(x, y) {
    this.#placeCamera();
    const v = new THREE.Vector3(x, 0, y).project(this.camera);
    const pr = this.gl.getPixelRatio();
    const r = this.canvas.getBoundingClientRect();
    return [((v.x + 1) / 2) * r.width * pr, ((1 - v.y) / 2) * r.height * pr];
  }

  /**
   * Hit test: the ray from the last `toWorld` call when it matches the point (the usual mouse path), else a
   * vertical ray down at the world point.
   * @param {import('../contracts/view.js').View} view @param {number} wx @param {number} wy
   * @returns {import('../contracts/render.js').PickResult}
   */
  pick(view, wx, wy) {
    const tile = [Math.floor(wx), Math.floor(wy)];
    if (!view.floor) return { furn: null, box: null, tile };
    const sv = /** @type {import('../contracts/view.js').SceneView} */ (view);
    if (!(this.lastRay && Math.abs(this.lastRay.wx - wx) < 1e-6 && Math.abs(this.lastRay.wy - wy) < 1e-6)) {
      this.raycaster.set(new THREE.Vector3(wx, 20, wy), new THREE.Vector3(0, -1, 0));
    }
    const hits = this.raycaster.intersectObjects([this.furniture.group], true);
    for (const h of hits) {
      if (!h.object.visible) continue;
      const box = h.object.userData.box;
      if (box != null) {
        const b = (sv.boxes || []).find((x) => x.id === box) || null;
        if (b) return { furn: null, box: b, tile };
      }
      const uid = h.object.userData.uid;
      if (uid != null) {
        const f = (sv.furniture || []).find((x) => x.uid === uid) || null;
        if (f) return { furn: f, box: null, tile };
      }
    }
    // footprint fallback (thin pieces, doors seen edge-on)
    for (const f of sv.furniture || []) {
      const w = f.w || 1;
      const d = f.h || 1;
      if (wx >= f.x && wx < f.x + w && wy >= f.y && wy < f.y + d) return { furn: f, box: null, tile };
    }
    return { furn: null, box: null, tile };
  }

  /**
   * A short burst at a piece of furniture, or the drone's flight (src/contracts/render.js `effect`).
   * @param {string} kind  zap, saw, hit, break, dust; droneOut, droneBack
   * @param {{ uid?: number | string, slot?: string }} [at]
   */
  effect(kind, at = {}) {
    const sv = this.lastView;
    const uid = at.uid ?? (at.slot != null ? sv?.furniture?.find((f) => f.slot === at.slot)?.uid : undefined);
    const obj = uid != null ? this.furniture.object(uid) : null;
    const where = new THREE.Vector3();
    let spread = 0.6;
    if (obj) {
      const b = new THREE.Box3().setFromObject(obj);
      b.getCenter(where);
      const size = b.getSize(new THREE.Vector3());
      spread = Math.min(1.2, Math.max(0.3, Math.max(size.x, size.z) / 2));
      where.y = Math.min(where.y, 1);
    }
    if (kind === 'droneOut' || kind === 'droneBack') {
      // from the drone's own piece, or from beside the survivor
      const p = this.actors.player();
      if (!obj) where.copy(p ? p.pos : this.focus);
      where.y = obj ? where.y + 0.4 : 0.5;
      this.effects.fly(kind === 'droneOut', where);
      return;
    }
    if (!obj) return;
    this.effects.burst(/** @type {import('./effects.js').BurstKind} */ (kind), where, spread);
  }

  /** @param {number} [ms] */
  lightning(ms = 220) {
    this.lighting.lightning(ms);
  }

  /** @param {import('../contracts/view.js').View} view */
  draw(view) {
    this.gl.info.reset();
    this.timer.update();
    const dt = Math.min(0.1, this.timer.getDelta());
    this.frameDt = dt;
    const t = this.timer.getElapsed();
    if (!view.floor) {
      this.gl.setClearColor('#0d0e10');
      this.gl.clear();
      return;
    }
    const sv = /** @type {import('../contracts/view.js').SceneView} */ (view);
    const key = shellKey(sv);
    if (!this.shell || this.shell.key !== key) this.#rebuildShell(sv, key);
    this.furniture.update(sv, t);
    const dk = `${key}|${dressingKey(sv)}|${this.clutterReady ? 1 : 0}`;
    if (!this.dressing || this.dressing.key !== dk) {
      if (this.dressing) {
        this.scene.remove(this.dressing.group);
        disposeTree(this.dressing.group);
      }
      const d = buildDressing(sv, this.lib, this.models);
      this.dressing = { key: dk, group: d.group, glow: d.glow, lamps: d.lamps };
      this.scene.add(d.group);
    }
    // lamp fixtures: furniture lamps (shaded bulbs) and the dressing's wall lamps
    this.lighting.setFixtures([
      ...this.furniture.lamps.map((l) => ({ pos: l.obj.getWorldPosition(new THREE.Vector3()).setY(l.y) })),
      ...(this.dressing?.lamps || []),
    ]);
    this.overlays.update(sv, (uid) => this.furniture.object(uid), t);
    const gameDt = sv.clock.t - this.lastT;
    this.lastT = sv.clock.t;
    this.actors.update(sv, dt, gameDt);
    this.blood.update(key, t);
    this.effects.update(dt);
    this.lastView = sv;
    this.#placeCamera();
    const p = this.actors.player();
    this.lighting.torchYaw = p ? /** @type {any} */ (p).yaw : 0;
    // the sun's shadow map covers the floor around its centre, not the camera's look-at point, so it stays put while the
    // camera pans or follows the survivor
    const shadowAt = this.shell ? new THREE.Vector3(this.shell.cx, this.focus.y, this.shell.cz) : this.focus;
    const rig = this.lighting.update(sv, this.focus, p ? p.pos : null, this.shell?.extent || 16, shadowAt);
    this.scene.background = skyColor(rig, sv);
    this.#weatherLook(sv, dt);
    this.scene.environmentIntensity = this.lighting.hemi.intensity * 0.15;
    // neighbours' windows and the street lamps light up after dusk
    const glow = Math.max(0, Math.min(1, (rig.night - 0.7) / 0.3)) * 1.2;
    for (const m of this.glowing) m.emissiveIntensity = glow;
    // wall lamps light with the house lights
    const lampsOn = this.lighting.lamps.some((l) => l.intensity > 0);
    for (const m of this.dressing?.glow || []) m.emissiveIntensity = lampsOn ? 2.2 : 0;
    this.weather.update(sv, this.focus, dt);
    this.#outlines();
    this.post.render(dt);
    this.#govern(dt);
    const info = this.gl.info;
    this.frameStats.drawCalls = info.render.calls;
    this.frameStats.triangles = info.render.triangles;
  }

  /**
   * The weather on the scene: fog (ART.md §6: storm FogExp2 0.012, cold wave 0.008; lighter for rain and snow), wet
   * ground in rain, snow cover in snow and cold waves, all eased so a change of weather is not a cut.
   * @param {import('../contracts/view.js').SceneView} view
   * @param {number} dt
   */
  #weatherLook(view, dt) {
    const kind = view.weather && !view.noWeather && !view.basement ? view.weather.kind : '';
    const fog = kind === 'storm' ? 0.012 : kind === 'coldWave' ? 0.008 : kind === 'heavyRain' || kind === 'snow' ? 0.006 : kind === 'rain' || kind === 'freezingRain' ? 0.004 : 0;
    const wet = kind === 'storm' || kind === 'heavyRain' ? 1 : kind === 'rain' ? 0.8 : kind === 'freezingRain' ? 0.6 : 0;
    const snow = kind === 'snow' || kind === 'coldWave' ? 0.9 : kind === 'freezingRain' ? 0.3 : 0;
    const k = Math.min(1, dt * 0.5);
    WEATHER_UNIFORMS.slWet.value += (wet - WEATHER_UNIFORMS.slWet.value) * k;
    WEATHER_UNIFORMS.slSnow.value += (snow - WEATHER_UNIFORMS.slSnow.value) * k;
    this.fogDensity = (this.fogDensity ?? 0) + (fog - (this.fogDensity ?? 0)) * k;
    if (this.fogDensity > 0.0005) {
      const col = /** @type {THREE.Color} */ (this.scene.background).clone().lerp(new THREE.Color('#8a8f94'), 0.35);
      if (!(this.scene.fog instanceof THREE.FogExp2)) this.scene.fog = new THREE.FogExp2(col, this.fogDensity);
      this.scene.fog.color.copy(col);
      /** @type {THREE.FogExp2} */ (this.scene.fog).density = this.fogDensity;
    } else if (this.scene.fog) this.scene.fog = null;
  }

  /**
   * Keeps the frame rate: the ambient-occlusion pass re-renders the whole scene for its normals, so in crowded scenes
   * (a horde, a large site) it goes off while frames run long and comes back once there is headroom again.
   * @param {number} dt
   */
  #govern(dt) {
    const ao = this.post.ao;
    if (!ao || dt <= 0) return;
    this.frameMs = (this.frameMs ?? 16) * 0.95 + dt * 1000 * 0.05;
    this.govT = (this.govT ?? 0) + dt;
    if (this.govT < 1.5) return;
    if (ao.enabled && this.frameMs > 19) {
      ao.enabled = false;
      this.govT = 0;
    } else if (!ao.enabled && this.frameMs < 12) {
      ao.enabled = true;
      this.govT = 0;
    }
  }

  /** @param {import('../contracts/view.js').SceneView} view @param {string} key */
  #rebuildShell(view, key) {
    if (this.shell) {
      this.scene.remove(this.shell.group);
      disposeTree(this.shell.group);
    }
    if (!this.shell || !this.shell.key.startsWith(`${view.floorId}|`)) {
      this.furniture.clear();
      // another floor or scene: come in from black rather than cut
      if (this.shell) this.post.fadeIn();
    }
    // a new scene gets the full pass chain again; the governor drops AO if this one is crowded
    if (this.post.ao) this.post.ao.enabled = true;
    this.govT = 0;
    const s = buildShell(view, this.lib);
    const around = buildSurroundings(view, this.lib);
    around.group.position.y = -STOREY_H * storeyOf(view);
    s.group.add(around.group);
    this.glowing = around.windows;
    this.scene.add(s.group);
    const fl = view.floor;
    this.shell = { key, group: s.group, ground: s.ground, extent: Math.max(fl.w, fl.h) / 2 + 4, cx: fl.w / 2, cz: fl.h / 2 };
    this.lighting.setLampSpots(s.lamps);
  }

  #outlines() {
    /** @type {THREE.Object3D[]} */
    const hov = [];
    const h = this.hover;
    if (h && 'furn' in h) {
      const o = this.furniture.object(h.furn);
      if (o) hov.push(o);
    } else if (h && 'box' in h) {
      const o = this.furniture.boxObject(h.box);
      if (o) hov.push(o);
    }
    this.post.hover.selectedObjects = hov;
    /** @type {THREE.Object3D[]} */
    const hl = [];
    for (const k of this.highlight) {
      const o = typeof k === 'string' && k.startsWith('box:') ? this.furniture.boxObject(k.slice(4)) || this.furniture.boxObject(Number(k.slice(4))) : this.furniture.object(k);
      if (o) hl.push(o);
    }
    this.post.highlight.selectedObjects = hl;
  }

  /** @returns {import('../contracts/render.js').RenderStats} */
  stats() {
    /** @type {import('../contracts/render.js').GpuInventory} */
    const inv = { textures: [], renderTargets: [], buffers: [] };
    const seenTex = new Set();
    const seenGeo = new Set();
    this.scene.traverse((o) => {
      const m = /** @type {THREE.Mesh} */ (o);
      if (!m.isMesh) return;
      if (!seenGeo.has(m.geometry)) {
        seenGeo.add(m.geometry);
        for (const a of Object.values(m.geometry.attributes)) inv.buffers?.push({ bytes: /** @type {any} */ (a).array?.byteLength || 0 });
        if (m.geometry.index) inv.buffers?.push({ bytes: m.geometry.index.array.byteLength });
      }
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        for (const v of Object.values(mat)) {
          const tex = /** @type {THREE.Texture} */ (v);
          if (!tex || !tex.isTexture || seenTex.has(tex)) continue;
          seenTex.add(tex);
          const img = /** @type {any} */ (tex.image) || {};
          const w = img.width || 1;
          const hgt = img.height || 1;
          const compressed = /** @type {any} */ (tex).isCompressedTexture;
          inv.textures?.push({ format: compressed ? 'bc7' : 'rgba8', width: Math.max(4, w), height: Math.max(4, hgt), levels: Math.max(1, tex.mipmaps?.length || Math.floor(Math.log2(Math.max(w, hgt))) + 1) });
        }
      }
    });
    const size = this.gl.getDrawingBufferSize(new THREE.Vector2());
    inv.renderTargets?.push({ width: size.x, height: size.y, color: ['rgba16f'], depth: 'depth24', samples: 4 });
    inv.renderTargets?.push({ width: size.x, height: size.y, color: ['rgba16f'], depth: 'depth24' });
    inv.renderTargets?.push({ width: 2048, height: 2048, color: [], depth: 'depth32f' });
    this.frameStats.gpuBytes = gpuBytes(inv);
    return { ...this.frameStats };
  }

  dispose() {
    this.post.dispose();
    this.lib.dispose();
    this.gl.dispose();
  }
}

/** The clear colour behind the scene: the sky's colour at the current rig. @param {import('./lighting.js').Rig} rig @param {import('../contracts/view.js').SceneView} view */
function skyColor(rig, view) {
  if (view.basement || view.indoorDark) return new THREE.Color('#050506');
  const day = new THREE.Color('#34383c');
  const night = new THREE.Color('#0b0d12');
  return night.lerp(day, 1 - rig.night);
}

/** Rain and snow as falling points in a box around the camera's look-at point. */
class Weather {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    const n = 2400;
    const pos = new Float32Array(n * 3);
    // seeded, not Math.random, so a capture repeats
    const r = rng(0x5eed);
    this.rnd = r;
    for (let i = 0; i < n; i++) pos.set([(r() - 0.5) * 40, r() * 14, (r() - 0.5) * 40], i * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(this.#streaks(pos), new THREE.LineBasicMaterial({ color: 0xaec3d6, transparent: true, opacity: 0.35, depthWrite: false }));
    this.snow = new THREE.Points(this.geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, transparent: true, opacity: 0.85, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.snow.frustumCulled = false;
    this.rain.visible = false;
    this.snow.visible = false;
    scene.add(this.rain, this.snow);
    this.n = n;
  }

  /** @param {Float32Array} pos */
  #streaks(pos) {
    const g = new THREE.BufferGeometry();
    const seg = new Float32Array(pos.length * 2);
    g.setAttribute('position', new THREE.BufferAttribute(seg, 3));
    return g;
  }

  /** @param {import('../contracts/view.js').SceneView} view @param {THREE.Vector3} focus @param {number} dt */
  update(view, focus, dt) {
    const kind = view.weather && !view.noWeather && !view.basement ? view.weather.kind : '';
    const rain = kind === 'rain' || kind === 'heavyRain' || kind === 'storm' || kind === 'freezingRain';
    const snow = kind === 'snow' || kind === 'coldWave';
    this.rain.visible = rain;
    this.snow.visible = snow;
    if (!rain && !snow) return;
    const count = kind === 'rain' ? 1200 : rain ? this.n : 1600;
    const p = /** @type {THREE.BufferAttribute} */ (this.geo.getAttribute('position'));
    const a = /** @type {Float32Array} */ (p.array);
    const fall = rain ? 14 : 0.9;
    for (let i = 0; i < this.n; i++) {
      a[i * 3 + 1] -= fall * dt * (0.8 + (i % 7) * 0.05);
      if (snow) a[i * 3] += Math.sin(a[i * 3 + 1] + i) * dt * 0.3;
      if (a[i * 3 + 1] < 0) {
        a[i * 3 + 1] += 14;
        a[i * 3] = (this.rnd() - 0.5) * 40;
        a[i * 3 + 2] = (this.rnd() - 0.5) * 40;
      }
    }
    p.needsUpdate = true;
    if (snow) {
      this.snow.position.set(focus.x, 0, focus.z);
      this.geo.setDrawRange(0, count);
    } else {
      const seg = /** @type {THREE.BufferAttribute} */ (this.rain.geometry.getAttribute('position'));
      const s = /** @type {Float32Array} */ (seg.array);
      for (let i = 0; i < count; i++) {
        s.set([a[i * 3], a[i * 3 + 1], a[i * 3 + 2], a[i * 3] - 0.03, a[i * 3 + 1] + 0.45, a[i * 3 + 2]], i * 6);
      }
      seg.needsUpdate = true;
      this.rain.geometry.setDrawRange(0, count * 2);
      this.rain.position.set(focus.x, 0, focus.z);
    }
  }
}

/** Whether this device can run the three.js renderer. */
export function webgl2Supported() {
  try {
    if (typeof WebGL2RenderingContext === 'undefined') return false;
    const c = document.createElement('canvas');
    return c.getContext('webgl2') instanceof WebGL2RenderingContext;
  } catch {
    return false;
  }
}
