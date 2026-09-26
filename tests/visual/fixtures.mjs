// @ts-check
// Fixture builders for the WP-P0-11 tool tests: images from a pixel function, glTF files from triangles, and
// throwaway checkout roots with asset manifests.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { encodePng } from '../../tools/lib/png.mjs';

/**
 * An RGBA PNG from a pixel function.
 * @param {number} w
 * @param {number} h
 * @param {(x: number, y: number) => number[]} px  [r, g, b, a?] 0 … 255
 */
export function png(w, h, px) {
  return encodePng({ width: w, height: h, channels: 4, data: rgba(w, h, px) });
}

/**
 * RGBA bytes from a pixel function.
 * @param {number} w
 * @param {number} h
 * @param {(x: number, y: number) => number[]} px
 */
export function rgba(w, h, px) {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a = 255] = px(x, y);
      data.set([r, g, b, a].map((v) => Math.max(0, Math.min(255, Math.round(v)))), (y * w + x) * 4);
    }
  }
  return data;
}

/** A deterministic value noise in 0 … 1 (a hash of the integer coordinates). @param {number} x @param {number} y @param {number} [seed] */
export function noise(x, y, seed = 1) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * A throwaway checkout: writes the given files (strings, bytes or JSON-able values) under a temp dir.
 * @param {Record<string, string | Uint8Array | object>} files  repo path -> content
 */
export function tempRoot(files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'p011-'));
  for (const [rel, content] of Object.entries(files)) put(root, rel, content);
  return { root, put: (/** @type {string} */ rel, /** @type {string | Uint8Array | object} */ c) => put(root, rel, c), done: () => rmSync(root, { recursive: true, force: true }) };
}

/** @param {string} root @param {string} rel @param {string | Uint8Array | object} content */
function put(root, rel, content) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, typeof content === 'string' || content instanceof Uint8Array ? content : `${JSON.stringify(content, null, 2)}\n`);
}

/**
 * @typedef {object} MeshSpec
 * @property {string} material  glTF material name (a manifest part)
 * @property {number[]} positions  3 per vertex, metres
 * @property {number[]} indices
 * @property {number[][]} [uvs]  TEXCOORD_n, 2 per vertex
 * @property {number[]} [normals]
 */

/**
 * A .glb from meshes, with optional skin, named animation clips, and PNG textures and PBR factors on every material.
 * @param {MeshSpec[]} meshes
 * @param {{ skin?: { influences: number }, clips?: string[], textures?: { baseColor?: Uint8Array, metallicRoughness?: Uint8Array, normal?: Uint8Array, texCoord?: number }, metallic?: number, roughness?: number }} [opts]
 * @returns {Promise<Uint8Array>}
 */
export async function glb(meshes, opts = {}) {
  const doc = new Document();
  const buf = doc.createBuffer();
  const scene = doc.createScene('scene');
  const mesh = doc.createMesh('mesh');
  for (const m of meshes) {
    const prim = doc.createPrimitive();
    prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(m.positions)).setBuffer(buf));
    if (m.normals) prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(m.normals)).setBuffer(buf));
    (m.uvs || []).forEach((uv, k) => prim.setAttribute(`TEXCOORD_${k}`, doc.createAccessor().setType('VEC2').setArray(new Float32Array(uv)).setBuffer(buf)));
    prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(m.indices)).setBuffer(buf));
    const mat = doc.createMaterial(m.material);
    if (opts.metallic != null) mat.setMetallicFactor(opts.metallic);
    if (opts.roughness != null) mat.setRoughnessFactor(opts.roughness);
    const t = opts.textures || {};
    const tc = t.texCoord ?? 0;
    const tex = (/** @type {string} */ name, /** @type {Uint8Array} */ bytes) => doc.createTexture(name).setImage(bytes).setMimeType('image/png');
    if (t.baseColor) mat.setBaseColorTexture(tex('baseColor', t.baseColor)).getBaseColorTextureInfo()?.setTexCoord(tc);
    if (t.metallicRoughness) mat.setMetallicRoughnessTexture(tex('metallicRoughness', t.metallicRoughness)).getMetallicRoughnessTextureInfo()?.setTexCoord(tc);
    if (t.normal) mat.setNormalTexture(tex('normal', t.normal)).getNormalTextureInfo()?.setTexCoord(tc);
    prim.setMaterial(mat);
    const n = m.positions.length / 3;
    if (opts.skin) {
      const k = opts.skin.influences;
      const joints = new Uint16Array(n * 4);
      const weights = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) for (let j = 0; j < Math.min(4, k); j++) weights[i * 4 + j] = 1 / Math.min(4, k);
      prim.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(joints).setBuffer(buf));
      prim.setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(weights).setBuffer(buf));
      if (k > 4) {
        const w1 = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) for (let j = 0; j < k - 4; j++) w1[i * 4 + j] = 0.01;
        prim.setAttribute('JOINTS_1', doc.createAccessor().setType('VEC4').setArray(new Uint16Array(n * 4)).setBuffer(buf));
        prim.setAttribute('WEIGHTS_1', doc.createAccessor().setType('VEC4').setArray(w1).setBuffer(buf));
      }
    }
    mesh.addPrimitive(prim);
  }
  const node = doc.createNode('body').setMesh(mesh);
  scene.addChild(node);
  if (opts.skin) {
    const joint = doc.createNode('root');
    scene.addChild(joint);
    const ibm = doc.createAccessor().setType('MAT4').setArray(new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])).setBuffer(buf);
    node.setSkin(doc.createSkin('skin').addJoint(joint).setInverseBindMatrices(ibm));
    for (const name of opts.clips || []) {
      const input = doc.createAccessor().setType('SCALAR').setArray(new Float32Array([0, 1])).setBuffer(buf);
      const output = doc.createAccessor().setType('VEC3').setArray(new Float32Array([0, 0, 0, 0, 0.1, 0])).setBuffer(buf);
      const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
      const channel = doc.createAnimationChannel().setTargetNode(joint).setTargetPath('translation').setSampler(sampler);
      doc.createAnimation(name).addSampler(sampler).addChannel(channel);
    }
  }
  return new NodeIO().writeBinary(doc);
}

/**
 * A flat grid of quads on the floor plane (y = 0): `n × n` cells over `size` metres, two triangles each, with UV0 in
 * metres times `uvScale` and UV1 over [0, uv1Extent]².
 * @param {{ n?: number, size?: number, uvScale?: number, uv1Extent?: number, material?: string }} [o]
 * @returns {MeshSpec}
 */
export function grid({ n = 1, size = 1, uvScale = 1, uv1Extent = 1, material = 'body' } = {}) {
  const positions = [];
  const uv0 = [];
  const uv1 = [];
  const normals = [];
  const indices = [];
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * size;
      const z = (j / n) * size;
      positions.push(x, 0, z);
      normals.push(0, 1, 0);
      uv0.push(x * uvScale, z * uvScale);
      uv1.push((i / n) * uv1Extent, (j / n) * uv1Extent);
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      indices.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
    }
  }
  return { material, positions, indices, uvs: [uv0, uv1], normals };
}
