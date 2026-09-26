// @ts-check
// Post-processing in ART.md §5.3's order: scene → ambient occlusion → bloom (scene-linear) → outlines (hover and
// highlight) → AgX output → grade LUT v2 → vignette and ±0.5 LSB dither. `quality` 'low' drops the AO.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { LUTPass } from 'three/examples/jsm/postprocessing/LUTPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { LUTCubeLoader } from 'three/examples/jsm/loaders/LUTCubeLoader.js';

const LUT_URL = 'assets/targets/lut/survival-log-grade-v2.cube';

const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    corner: { value: 0.71 },
    aspect: { value: 16 / 9 },
    frame: { value: 0 },
    fade: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float corner;
    uniform float aspect;
    uniform float frame;
    uniform float fade;
    varying vec2 vUv;
    float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423) + frame * 0.618); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      // display-linear vignette V(r) = 1 - (1 - corner) r^2, r = 1 at the frame corner (aspect-aware)
      vec2 d = (vUv - 0.5) * 2.0;
      d.x *= aspect / sqrt(aspect * aspect + 1.0) * sqrt(2.0);
      d.y *= 1.0 / sqrt(aspect * aspect + 1.0) * sqrt(2.0);
      float r2 = clamp(dot(d, d) / 2.0, 0.0, 1.0);
      vec3 lin = pow(c.rgb, vec3(2.2)) * (1.0 - (1.0 - corner) * r2) * (1.0 - fade);
      vec3 enc = pow(lin, vec3(1.0 / 2.2));
      // ±0.5 LSB luminance dither
      enc += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
      gl_FragColor = vec4(enc, c.a);
    }`,
};

export class Post {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {THREE.PerspectiveCamera} camera
   * @param {'high' | 'low'} quality
   */
  constructor(renderer, scene, camera, quality) {
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    // the scene pass keeps its depth (the composer's second buffer gets its own copy): ambient occlusion reads it
    const target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, {
      type: THREE.HalfFloatType,
      samples: quality === 'high' ? 4 : 0,
      depthTexture: quality === 'high' ? new THREE.DepthTexture(size.x * pr, size.y * pr) : null,
    });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    /** @type {GTAOPass | null} */
    this.ao = null;
    if (quality === 'high') {
      this.ao = new GTAOPass(scene, camera, size.x / 2, size.y / 2);
      // ambient occlusion at half resolution: soft by nature, and a quarter of the fill cost
      const setAoSize = this.ao.setSize.bind(this.ao);
      this.ao.setSize = (w, h) => setAoSize(Math.max(1, Math.floor(w / 2)), Math.max(1, Math.floor(h / 2)));
      this.ao.blendIntensity = 0.85;
      this.ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.5, thickness: 1.2, scale: 1.0, samples: 12 });
      this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      // normals from the scene pass's depth instead of a second render of the whole scene (the pass's own normal
      // render doubled the draw calls). setGBuffer after construction: a depth texture given to the constructor
      // trips on the normal target it then never makes.
      const ao = this.ao;
      ao.setGBuffer(/** @type {THREE.DepthTexture} */ (target.depthTexture));
      ao.gtaoMaterial.needsUpdate = true;
      ao.pdMaterial.needsUpdate = true;
      const aoRender = ao.render.bind(ao);
      ao.render = (r, write, read, dt, mask) => {
        // the composer swaps its two buffers, so the scene's depth is whichever one it just drew into
        const depth = read.depthTexture;
        if (depth && ao.gtaoMaterial.uniforms.tDepth.value !== depth) {
          ao.depthTexture = depth;
          ao.gtaoMaterial.uniforms.tDepth.value = depth;
          ao.pdMaterial.uniforms.tDepth.value = depth;
        }
        aoRender(r, write, read, dt, mask);
      };
      this.composer.addPass(this.ao);
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.25, 0.35, 1.0);
    this.composer.addPass(this.bloom);
    this.hover = new OutlinePass(new THREE.Vector2(size.x, size.y), scene, camera);
    this.hover.edgeStrength = 4;
    this.hover.edgeThickness = 1;
    this.hover.edgeGlow = 0;
    this.hover.visibleEdgeColor.set('#ffffff');
    this.hover.hiddenEdgeColor.set('#6d6d6d');
    this.composer.addPass(this.hover);
    this.highlight = new OutlinePass(new THREE.Vector2(size.x, size.y), scene, camera);
    this.highlight.edgeStrength = 5;
    this.highlight.edgeThickness = 1.5;
    this.highlight.edgeGlow = 0.4;
    this.highlight.visibleEdgeColor.set('#ffd166');
    this.highlight.hiddenEdgeColor.set('#8a6a20');
    this.composer.addPass(this.highlight);
    this.composer.addPass(new OutputPass());
    this.lut = new LUTPass({ intensity: 1 });
    this.lut.enabled = false;
    this.composer.addPass(this.lut);
    new LUTCubeLoader()
      .loadAsync(LUT_URL)
      .then((res) => {
        this.lut.lut = res.texture3D;
        this.lut.enabled = true;
      })
      .catch((err) => console.warn('grade LUT unavailable', err));
    this.finish = new ShaderPass(FinishShader);
    this.composer.addPass(this.finish);
  }

  /** @param {number} w @param {number} h @param {number} pr */
  setSize(w, h, pr) {
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.finish.uniforms.aspect.value = w / Math.max(1, h);
  }

  /** Starts a fade in from black (a floor or scene change). */
  fadeIn() {
    this.finish.uniforms.fade.value = 1;
  }

  /** @param {number} [dt] real seconds since the last frame (the fade in takes 0.4 s) */
  render(dt = 0) {
    const f = this.finish.uniforms.fade;
    if (f.value > 0) f.value = Math.max(0, f.value - dt / 0.4);
    this.finish.uniforms.frame.value = (this.finish.uniforms.frame.value + 1) % 1024;
    this.composer.render();
  }

  dispose() {
    this.composer.dispose();
  }
}
