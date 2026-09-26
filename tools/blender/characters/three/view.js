// @ts-nocheck
// The shipped character (assets/characters/wage/wage.glb) in three.js, as the game shows it: GLTFLoader with the
// meshopt decoder and KTX2Loader, AgX tone mapping at exposure 1.0, the game camera from src/contracts/look.js, and the
// ART.md interior rigs (§4.2-4.4: no direct sun indoors; characters take probe light, here a HemisphereLight whose
// intensity is the rig's horizontal E). A 0.18 grey card on the floor checks the rig: the rig's intensity is scaled
// until the card reads its ART.md code (intensities are adjusted, never the exposure).
// Driven by render-three.mjs through window.view (Playwright); also opens in a browser from the dev server.
/* global window, document -- a browser page (three/view.html) */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { CAMERA, cameraOffset } from '/src/contracts/look.js';

const W = 1920;
const H = 1080;
// ART.md §4.1 blackbody colours (sRGB hex)
const PLANCK = { 2600: 0xffa952, 2700: 0xffad59, 4000: 0xffd3a5, 5500: 0xffede1, 7500: 0xebecff, 8000: 0xe3e7ff };
const FLOOR_ALBEDO = 0.34; // ART.md §7: t069 wood, the floor beside the survivor
const CARD_ALBEDO = 0.18;

/** linear RGB of a blackbody colour, luminance 1 */
function planck(k) {
  const c = new THREE.Color(PLANCK[k]);
  return c.multiplyScalar(1 / (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b));
}

/** mix of blackbody colours by weight, luminance 1 */
function mix(parts) {
  const v = new THREE.Color(0, 0, 0);
  for (const [k, w] of parts) v.add(planck(k).multiplyScalar(w));
  return v.multiplyScalar(1 / (0.2126 * v.r + 0.7152 * v.g + 0.0722 * v.b));
}

// The interior rigs (docs/ART.md §4.2-4.4, tools/targets/out/rigs.json). Indoors the key light's direct term does not
// reach (the source shows no sun patches in rooms); the light is the key's indirect share (86.9 % of the exterior
// horizontal E, sun_share_of_horizontal_E) plus the sky's, and the floor bounce from below.
const RIGS = {
  day: {
    label: 'day interior (ART.md §4.2: E 0.419, 0.18 card 43)',
    E: 0.419,
    card: 43,
    sky: mix([[5500, 0.869], [7500, 0.131]]),
    ground: planck(4000),
  },
  dusk: {
    label: 'dusk interior with lamps (ART.md §4.2: E 0.237, 0.18 card 26)',
    E: 0.237,
    card: 26,
    // DUSK set 0.197 + LAMPS 0.040 (2700 K). ART.md gives no split of the DUSK set's colour indoors; the exterior's
    // 86.9 % sun share at 2600 K turns every surface orange, where the source's dusk frame (ss_04) reads neutral, so
    // the set is taken as 40 % sun indirect (2600 K) and 60 % sky (8000 K) here
    sky: mix([[2600, 0.197 * 0.4], [8000, 0.197 * 0.6], [2700, 0.04]]),
    ground: mix([[2600, 0.5], [2700, 0.5]]),
  },
};

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(CAMERA.vfovDefault, W / H, CAMERA.near, CAMERA.far);
const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
scene.add(hemi);

/** a colour of luminance `albedo` (linear) with the given hue */
function albedoColor(albedo, hue = [1, 1, 1]) {
  const y = 0.2126 * hue[0] + 0.7152 * hue[1] + 0.0722 * hue[2];
  return new THREE.Color(hue[0] * albedo / y, hue[1] * albedo / y, hue[2] * albedo / y);
}

// floor: wood-toned, mean albedo 0.34, with faint 1 m tile lines (foot slide reads against them)
function floorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgb(200,200,200)';
  g.fillRect(0, 0, 256, 3);
  g.fillRect(0, 0, 3, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(40, 40);
  t.anisotropy = 8;
  return t;
}
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: albedoColor(FLOOR_ALBEDO / 0.985, [1.0, 0.93, 0.84]), map: floorTexture(), roughness: 0.8, metalness: 0 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const card = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshStandardMaterial({ color: albedoColor(CARD_ALBEDO), roughness: 1, metalness: 0 }));
card.rotation.x = -Math.PI / 2;
scene.add(card);

let gltf = null;
const actors = [];

async function load(url) {
  const ktx2 = new KTX2Loader().setTranscoderPath('/node_modules/three/examples/jsm/libs/basis/').detectSupport(renderer);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx2);
  gltf = await loader.loadAsync(url);
  gltf.scene.traverse((o) => {
    if (o.isMesh) {
      o.frustumCulled = false;
      // the manifest's renderer recommendation for the alpha-tested hair cards (MSAA is on)
      if (o.material.alphaTest > 0) o.material.alphaToCoverage = true;
    }
  });
  const clips = Object.fromEntries(gltf.animations.map((c) => [c.name, { duration: c.duration, extras: c.userData }]));
  const textures = [];
  gltf.scene.traverse((o) => {
    if (o.isMesh) for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap']) if (o.material[k]) textures.push({ material: o.material.name, slot: k, width: o.material[k].image?.width, height: o.material[k].image?.height, compressed: !!o.material[k].isCompressedTexture });
  });
  return { clips, extras: gltf.parser.json.extras, textures, extensionsRequired: gltf.parser.json.extensionsRequired };
}

/** One character on the floor: clip, time, position (x east, z south) and heading (radians; 0 faces +Z = south). */
function actor() {
  const root = cloneSkinned(gltf.scene);
  scene.add(root);
  const mixer = new THREE.AnimationMixer(root);
  const a = { root, mixer, action: null, clip: '' };
  actors.push(a);
  return a;
}

function pose(a, clip, t, x, z, heading) {
  if (a.clip !== clip) {
    a.mixer.stopAllAction();
    a.action = a.mixer.clipAction(gltf.animations.find((c) => c.name === clip), a.root).play();
    a.clip = clip;
  }
  a.action.time = t % a.action.getClip().duration;
  a.mixer.update(0);
  a.root.position.set(x, 0, z);
  a.root.rotation.set(0, heading, 0);
  a.root.updateMatrixWorld(true);
}

function setCamera(target, fov) {
  const [ox, oy, oz] = cameraOffset();
  camera.fov = fov;
  camera.position.set(target.x + ox, target.y + oy, target.z + oz);
  camera.lookAt(target.x, target.y, target.z);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

function setRig(name, scale = 1) {
  const r = RIGS[name];
  hemi.color.copy(r.sky);
  hemi.groundColor.copy(r.ground).multiplyScalar(FLOOR_ALBEDO);
  hemi.intensity = r.E * scale;
}

function pixels() {
  const gl = renderer.getContext();
  const buf = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  return buf;
}

const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (l) => (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055);

/** mean colour of a pixel window around a screen point: [r, g, b] codes and the display luminance code */
function sample(buf, sx, sy, r = 2) {
  const acc = [0, 0, 0];
  let n = 0;
  for (let y = Math.round(sy) - r; y <= Math.round(sy) + r; y++) {
    for (let x = Math.round(sx) - r; x <= Math.round(sx) + r; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = ((H - 1 - y) * W + x) * 4; // readPixels rows run bottom-up
      for (let k = 0; k < 3; k++) acc[k] += toLin(buf[i + k] / 255);
      n++;
    }
  }
  const lin = acc.map((v) => v / n);
  const Y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  const rgb = lin.map((v) => Math.round(toSrgb(v) * 255));
  return { rgb, hex: `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`, lum: Math.round(toSrgb(Y) * 2550) / 10 };
}

function project(v) {
  const p = v.clone().project(camera);
  return { x: (p.x * 0.5 + 0.5) * W, y: (0.5 - p.y * 0.5) * H };
}

const bone = (a, name) => a.root.getObjectByName(name).getWorldPosition(new THREE.Vector3());

/** character height on screen (px): from the lowest to the highest projected skinned vertex */
function screenHeight(a) {
  let lo = Infinity;
  let hi = -Infinity;
  const v = new THREE.Vector3();
  a.root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const pos = o.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i += 7) {
      o.getVertexPosition(i, v);
      v.applyMatrix4(o.matrixWorld);
      const p = project(v);
      lo = Math.min(lo, p.y);
      hi = Math.max(hi, p.y);
    }
  });
  return Math.round(hi - lo);
}

/**
 * The still: two survivors (idle facing the camera three-quarter, walking away three-quarter like the source's
 * frames), the grey card beside them. Returns the frame's PNG and the measurements.
 */
function still({ rig, fov, calibrate = true }) {
  const target = new THREE.Vector3(0, 0, 0);
  setCamera(target, fov);
  const toCam = Math.atan2(cameraOffset()[0], cameraOffset()[2]);
  // camera-right on the floor
  const right = new THREE.Vector3(Math.cos(toCam), 0, -Math.sin(toCam));
  const a = actors[0];
  const b = actors[1];
  const pa = right.clone().multiplyScalar(-0.55);
  const pb = right.clone().multiplyScalar(0.55);
  pose(a, 'idle', 1.3, pa.x, pa.z, toCam + 0.6);
  pose(b, 'walk', 0.35, pb.x, pb.z, toCam + Math.PI - 0.45);
  const cardPos = right.clone().multiplyScalar(1.7).add(new THREE.Vector3(0, 0.004, 0));
  card.position.copy(cardPos);
  const cardPx = project(cardPos);
  let scale = 1;
  let cardRead = null;
  const iters = [];
  for (let it = 0; it < (calibrate ? 5 : 1); it++) {
    setRig(rig, scale);
    renderer.render(scene, camera);
    cardRead = sample(pixels(), cardPx.x, cardPx.y, 6);
    iters.push({ scale: Math.round(scale * 1e4) / 1e4, card: cardRead.lum });
    const want = RIGS[rig].card;
    if (!calibrate || Math.abs(cardRead.lum - want) < 0.5) break;
    // the tone curve is monotonic: scale by the ratio of linear display luminance
    scale *= toLin(want / 255) / toLin(cardRead.lum / 255);
  }
  const buf = pixels();
  const fwdA = new THREE.Vector3(Math.sin(toCam + 0.6), 0, Math.cos(toCam + 0.6));
  const head = bone(a, 'head');
  const regions = {
    hoodie: project(bone(a, 'spine_03').add(fwdA.clone().multiplyScalar(0.05))),
    hoodieBack: project(bone(b, 'spine_03')),
    jeans: project(bone(a, 'thigh_l').lerp(bone(a, 'calf_l'), 0.55)),
    jeansBack: project(bone(b, 'thigh_r').lerp(bone(b, 'calf_r'), 0.5)),
    hair: project(head.clone().add(new THREE.Vector3(0, 0.14, 0)).addScaledVector(fwdA, -0.03)),
    hairBack: project(bone(b, 'head').add(new THREE.Vector3(0, 0.12, 0))),
    face: project(head.clone().add(new THREE.Vector3(0, 0.035, 0)).addScaledVector(fwdA, 0.09)),
    floor: project(right.clone().multiplyScalar(-1.8)),
  };
  const samples = Object.fromEntries(Object.entries(regions).map(([k, p]) => [k, { px: [Math.round(p.x), Math.round(p.y)], ...sample(buf, p.x, p.y, k === 'floor' ? 6 : 1) }]));
  const centre = project(new THREE.Vector3(0, 0.9, 0));
  return {
    png: renderer.domElement.toDataURL('image/png'),
    rig,
    rigLabel: RIGS[rig].label,
    fov,
    hemisphere: { skyHex: `#${hemi.color.getHexString()}`, groundHex: `#${hemi.groundColor.getHexString()}`, intensity: Math.round(hemi.intensity * 1e4) / 1e4, nominalE: RIGS[rig].E, scale: Math.round(scale * 1e4) / 1e4 },
    card: { want: RIGS[rig].card, read: cardRead.lum, rgb: cardRead.rgb, iterations: iters },
    samples,
    heightPx: { idle: screenHeight(a), walk: screenHeight(b) },
    centre: [Math.round(centre.x), Math.round(centre.y)],
  };
}

/** A frame following one survivor (the game camera tracks its target): clip at time t, travelling along its heading at
 * the clip's root-motion speed. Returns the PNG of a crop w x h around the survivor at native pixel scale. */
function follow({ rig, scale, fov, clip, t, heading, travel, w, h, groundTrack = true, centerY = 0.85 }) {
  setRig(rig, scale);
  const a = actors[0];
  actors[1].root.visible = false;
  card.visible = false;
  const x = Math.sin(heading) * travel;
  const z = Math.cos(heading) * travel;
  pose(a, clip, t, x, z, heading);
  setCamera(groundTrack ? new THREE.Vector3(x, 0, z) : new THREE.Vector3(0, 0, 0), fov);
  const c = project(new THREE.Vector3(x, centerY, z));
  camera.setViewOffset(W, H, Math.round(c.x - w / 2), Math.round(c.y - h / 2), w, h);
  renderer.setSize(w, h);
  renderer.render(scene, camera);
  const png = renderer.domElement.toDataURL('image/png');
  camera.clearViewOffset();
  renderer.setSize(W, H);
  actors[1].root.visible = true;
  card.visible = true;
  return png;
}

window.view = {
  async init(url) {
    const info = await load(url);
    actor();
    actor();
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    info.gl = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    info.camera = { ...CAMERA, offset: cameraOffset() };
    info.three = THREE.REVISION;
    return info;
  },
  still,
  follow,
};
window.viewReady = true;
