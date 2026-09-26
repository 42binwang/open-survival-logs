// @ts-check
// The material library at run time: assets/materials/library.json (WP-P0-05) turned into three.js materials.
// Every mesh carries metre UVs (src/render3d/geom.js), so a map repeats every `sizeM` metres. A material is asked for
// by library name plus an optional tint preset (or a hex colour); textures load once per library entry and are
// shared by every tinted instance. Two library conventions are applied in the shader:
// - tint: baseColor.rgb *= mix(secondaryTint, tint, mask), mask = 1 ('full') or baseColor alpha ('alpha');
// - variation: the shared periodic mask sampled in world space (uv_m / scaleM + seed offset) varies value and
//   roughness, which breaks up the visible repeat of the scans across a floor or a wall.
import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

const LIBRARY_URL = 'assets/materials/library.json';
const PHI = 0.6180339887498949;
const SQRT2M1 = 0.4142135623730951;

/**
 * @typedef {object} LibEntry
 * @property {string} id  'materials/<name>'
 * @property {string} path
 * @property {Record<string, any>} params
 */

/**
 * @typedef {object} MatOptions
 * @property {string} [tint]  a preset name of the entry or a '#rrggbb' colour
 * @property {string} [secondary]  the secondary (grout) preset or colour, for 'alpha' masked entries
 * @property {number} [roughness]  multiplies the roughness
 * @property {number} [seed]  variation offset seed
 * @property {boolean} [doubleSide]
 * @property {number} [emissive]  emissive intensity with `emissiveColor`
 * @property {string} [emissiveColor]
 * @property {number} [opacity]  < 1: transparent
 * @property {boolean} [outdoor]  out in the weather: wet in rain, snow-covered where it faces up
 */

/** The weather on outdoor surfaces, shared by every outdoor material: 0 … 1 each, set by the renderer per frame. */
export const WEATHER_UNIFORMS = { slWet: { value: 0 }, slSnow: { value: 0 } };

/** Plain fallback colours, used for a family until (or if) its textures load. */
const FALLBACK = {
  plaster_painted: '#e9e3d8',
  wallpaper_woodchip: '#ebe4d6',
  wood_floor_oak: '#9b7650',
  wood_floor_pine: '#b58d5f',
  tile_ceramic: '#e2e0da',
  grout: '#9a968f',
  concrete: '#8f8b85',
  fabric_sofa: '#8d8d8d',
  fabric_curtain: '#d8cfbd',
  leather: '#7a4c30',
  laminate: '#b89a78',
  metal_brushed: '#9ea2a6',
  metal_painted: '#6a8566',
  glass: '#dfe6e2',
  rubber: '#2a2a2a',
  cardboard: '#a98457',
  plastic: '#4f4f4f',
  bark: '#6d5a48',
  soil: '#4b3a2b',
  newsprint: '#d9d5cb',
  rattan: '#b08d5e',
};

export class MaterialLibrary {
  /** @param {THREE.WebGLRenderer} renderer */
  constructor(renderer) {
    this.ktx2 = new KTX2Loader().setTranscoderPath('vendor/basis/').detectSupport(renderer);
    /** @type {Map<string, LibEntry>} */
    this.entries = new Map();
    /** @type {Map<string, Promise<Record<string, THREE.Texture>>>} */
    this.textures = new Map();
    /** @type {Map<string, THREE.Material>} */
    this.cache = new Map();
    /** @type {THREE.Texture | null} */
    this.variation = null;
    this.variationUniform = { value: /** @type {THREE.Texture | null} */ (null) };
    this.ready = this.#load();
  }

  async #load() {
    try {
      const res = await fetch(LIBRARY_URL);
      const lib = await res.json();
      for (const a of lib.assets || []) if (a.kind === 'material') this.entries.set(a.id.replace(/^materials\//, ''), a);
      const tex = await this.ktx2.loadAsync('assets/materials/_shared/variation.ktx2');
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.NoColorSpace;
      this.variation = tex;
      this.variationUniform.value = tex;
      for (const m of this.cache.values()) m.needsUpdate = true;
    } catch (err) {
      console.warn('material library: falling back to flat colours', err);
    }
  }

  /**
   * The texture set of a library entry (baseColor, normal, orm, detailNormal when present), loaded once.
   * @param {string} name
   */
  #maps(name) {
    let p = this.textures.get(name);
    if (p) return p;
    p = (async () => {
      await this.ready;
      const e = this.entries.get(name);
      if (!e) return {};
      const dir = e.path.replace(/[^/]*$/, '');
      const [sx, sy] = e.params.sizeM || [1, 1];
      /** @type {Record<string, THREE.Texture>} */
      const out = {};
      const files = ['baseColor', 'normal', 'orm'];
      await Promise.all(
        files.map(async (k) => {
          try {
            const t = await this.ktx2.loadAsync(`${dir}${k}.ktx2`);
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.repeat.set(1 / sx, 1 / sy);
            t.colorSpace = k === 'baseColor' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
            t.anisotropy = 8;
            out[k] = t;
          } catch (err) {
            console.warn(`material ${name}: ${k} failed to load`, err);
          }
        }),
      );
      return out;
    })();
    this.textures.set(name, p);
    return p;
  }

  /**
   * The resolved colour of a tint preset or hex value.
   * @param {string} name
   * @param {string | undefined} tint
   * @param {'tint' | 'secondary'} [which]
   */
  tintColor(name, tint, which = 'tint') {
    if (tint && tint.startsWith('#')) return new THREE.Color(tint);
    const e = this.entries.get(name);
    const t = which === 'tint' ? e?.params.tint : e?.params.tint?.secondary;
    const hex = t?.presets?.[tint || t?.default] ?? t?.presets?.[t?.default];
    return new THREE.Color(hex || '#ffffff');
  }

  /**
   * A material for a library entry. Cached by name and options, so identical requests share one material.
   * @param {string} name  library name ('plaster_painted') or a plain '#rrggbb' colour for untextured parts
   * @param {MatOptions} [opt]
   * @returns {THREE.MeshStandardMaterial}
   */
  get(name, opt = {}) {
    const key = `${name}|${opt.tint || ''}|${opt.secondary || ''}|${opt.roughness ?? ''}|${opt.seed ?? ''}|${opt.doubleSide ? 1 : 0}|${opt.emissive ?? ''}|${opt.emissiveColor || ''}|${opt.opacity ?? ''}|${opt.outdoor ? 1 : 0}`;
    const hit = this.cache.get(key);
    if (hit) return /** @type {THREE.MeshStandardMaterial} */ (hit);
    const plain = name.startsWith('#');
    const glass = name === 'glass';
    const mat = glass
      ? new THREE.MeshPhysicalMaterial({ color: 0xdfe6e2, roughness: 0.05, metalness: 0, transmission: 0, transparent: true, opacity: opt.opacity ?? 0.28, depthWrite: false })
      : new THREE.MeshStandardMaterial({ color: plain ? name : FALLBACK[/** @type {keyof typeof FALLBACK} */ (name)] || '#888888', roughness: 0.8, metalness: 0 });
    if (opt.doubleSide) mat.side = THREE.DoubleSide;
    if (opt.opacity != null && opt.opacity < 1 && !glass) {
      mat.transparent = true;
      mat.opacity = opt.opacity;
      mat.depthWrite = false;
    }
    if (opt.emissive) {
      mat.emissive = new THREE.Color(opt.emissiveColor || '#ffffff');
      mat.emissiveIntensity = opt.emissive;
    }
    this.cache.set(key, mat);
    if (plain || glass) return mat;

    const seed = opt.seed ?? hashString(key);
    const uniforms = {
      slTint: { value: new THREE.Color(1, 1, 1) },
      slSecondary: { value: new THREE.Color(1, 1, 1) },
      slMask: { value: 0 },
      slVariation: this.variationUniform,
      slVarOn: { value: 0 },
      slVarScale: { value: 1 / 8 },
      slVarOffset: { value: new THREE.Vector2(frac(seed * PHI), frac(seed * SQRT2M1)) },
      slVarValue: { value: 0.05 },
      slVarRough: { value: 0.05 },
      slRoughMul: { value: opt.roughness ?? 1 },
      slOutdoor: { value: opt.outdoor ? 1 : 0 },
      slWet: WEATHER_UNIFORMS.slWet,
      slSnow: WEATHER_UNIFORMS.slSnow,
    };
    mat.userData.sl = uniforms;
    mat.onBeforeCompile = (shader) => patchShader(shader, uniforms);
    mat.customProgramCacheKey = () => 'sl-lib-v1';

    this.ready.then(() => {
      const e = this.entries.get(name);
      if (!e) return;
      const p = e.params;
      const pbr = p.pbr || {};
      uniforms.slTint.value.copy(this.tintColor(name, opt.tint));
      uniforms.slSecondary.value.copy(p.tint?.secondary ? this.tintColor(name, opt.secondary, 'secondary') : new THREE.Color(1, 1, 1));
      uniforms.slMask.value = p.tint?.mask === 'alpha' ? 1 : 0;
      uniforms.slVarScale.value = 1 / (p.variation?.scaleM || 8);
      uniforms.slVarValue.value = p.variation?.value ?? 0.05;
      uniforms.slVarRough.value = p.variation?.roughness ?? 0.05;
      mat.roughness = pbr.roughnessFactor ?? 1;
      mat.metalness = pbr.metalnessFactor ?? 0;
      if (pbr.normalScale) mat.normalScale.set(pbr.normalScale, pbr.normalScale);
      mat.aoMapIntensity = pbr.aoIntensity ?? 1;
      mat.color.set('#ffffff');
      mat.needsUpdate = true;
      this.#maps(name).then((maps) => {
        if (maps.baseColor) mat.map = maps.baseColor;
        if (maps.normal) mat.normalMap = maps.normal;
        if (maps.orm) {
          mat.roughnessMap = maps.orm;
          mat.metalnessMap = maps.orm;
          mat.aoMap = maps.orm;
        }
        if (!maps.baseColor) mat.color.copy(uniforms.slTint.value).multiply(new THREE.Color(FALLBACK[/** @type {keyof typeof FALLBACK} */ (name)] || '#888'));
        uniforms.slVarOn.value = this.variation ? 1 : 0;
        mat.needsUpdate = true;
      });
    });
    return mat;
  }

  dispose() {
    for (const m of this.cache.values()) m.dispose();
    this.textures.forEach((p) => p.then((maps) => Object.values(maps).forEach((t) => t.dispose())));
    this.variation?.dispose();
    this.ktx2.dispose();
  }
}

/** @param {number} x */
const frac = (x) => x - Math.floor(x);

/** @param {string} s */
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Tint, macro variation and a world-position varying on top of MeshStandardMaterial.
 * @param {any} shader
 * @param {Record<string, { value: any }>} uniforms
 */
function patchShader(shader, uniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 slWorldPos;')
    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nslWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
varying vec3 slWorldPos;
uniform vec3 slTint;
uniform vec3 slSecondary;
uniform float slMask;
uniform sampler2D slVariation;
uniform float slVarOn;
uniform float slVarScale;
uniform vec2 slVarOffset;
uniform float slVarValue;
uniform float slVarRough;
uniform float slRoughMul;
uniform float slOutdoor;
uniform float slWet;
uniform float slSnow;
vec4 slVar;
float slUp;`,
    )
    .replace(
      '#include <map_fragment>',
      `slVar = vec4(0.5);
if (slVarOn > 0.5) {
  // world-planar on the dominant axis, so walls and floors both vary
  vec3 an = abs(normalize(cross(dFdx(slWorldPos), dFdy(slWorldPos))));
  vec2 wp = an.y > 0.5 ? slWorldPos.xz : (an.x > an.z ? slWorldPos.zy : slWorldPos.xy);
  slVar = texture2D(slVariation, wp * slVarScale + slVarOffset);
}
#ifdef USE_MAP
  vec4 slTexel = texture2D(map, vMapUv);
  vec3 slTintMix = mix(vec3(1.0), mix(slSecondary, slTint, slTexel.a), slMask);
  vec3 slTintFull = mix(slTint, vec3(1.0), slMask);
  diffuseColor.rgb *= slTexel.rgb * slTintMix * slTintFull;
#else
  diffuseColor.rgb *= slTint;
#endif
diffuseColor.rgb *= 1.0 + slVarValue * (2.0 * slVar.r - 1.0) * 2.0;
// the weather on outdoor surfaces: rain darkens and (in the roughness step) glosses, pooling where the variation
// mask dips; snow settles on what faces up
slUp = 0.0;
if (slOutdoor > 0.5) {
  vec3 wn = normalize(cross(dFdx(slWorldPos), dFdy(slWorldPos)));
  slUp = smoothstep(0.55, 0.9, abs(wn.y));
  float puddle = smoothstep(0.52, 0.42, slVar.g) * slUp;
  diffuseColor.rgb *= 1.0 - slWet * (0.35 + 0.25 * puddle);
  float cover = slSnow * slUp * smoothstep(0.25, 0.6, slSnow + (slVar.r - 0.5) * 0.6);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.88, 0.9), cover);
}`,
    )
    .replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor * slRoughMul * (1.0 + slVarRough * (2.0 * slVar.g - 1.0) * 2.0), 0.02, 1.0);
if (slOutdoor > 0.5) {
  float puddle = smoothstep(0.52, 0.42, slVar.g) * slUp;
  roughnessFactor = mix(roughnessFactor, 0.08 + 0.2 * (1.0 - puddle), slWet * slUp);
  roughnessFactor = mix(roughnessFactor, 0.85, slSnow * slUp);
}`,
    );
}
