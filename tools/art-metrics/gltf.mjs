// @ts-check
// glTF facts measured from the file (gltf-transform, with the meshopt decoder), never taken from a manifest:
// triangles per mesh instance, world-space triangles with their UV sets, animation clip names, skin joints and the
// most bone influences on any vertex, and the textures each material samples (with their size and UV set).
import { readFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { imageSize } from './images.mjs';

/** @type {Promise<NodeIO> | null} */
let ioPromise = null;

function io() {
  if (!ioPromise) {
    ioPromise = MeshoptDecoder.ready.then(() => new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }));
  }
  return ioPromise;
}

/**
 * @typedef {object} TextureUse
 * @property {string} material
 * @property {'baseColor' | 'normal' | 'metallicRoughness' | 'occlusion' | 'emissive'} slot
 * @property {number} texCoord
 * @property {number} width
 * @property {number} height
 * @property {string} mimeType
 * @property {Uint8Array} bytes
 *
 * @typedef {object} MaterialFactors
 * @property {number} metallic
 * @property {number} roughness
 * @property {boolean} transmissive  KHR_materials_transmission above 0 or alpha-blended glass
 *
 * @typedef {object} Primitive
 * @property {string} mesh
 * @property {string} material
 * @property {number} triangles
 * @property {Float64Array} positions  world space, 3 per vertex
 * @property {Float32Array | null} normals  world space, 3 per vertex
 * @property {Uint32Array} indices  3 per triangle
 * @property {(Float32Array | null)[]} uvs  TEXCOORD_n, 2 per vertex
 *
 * @typedef {object} GltfFacts
 * @property {number} triangles  over every mesh instance in the default scene
 * @property {Primitive[]} primitives
 * @property {string[]} clips
 * @property {number} joints  the most joints of any skin
 * @property {number} maxInfluences  the most non-zero weights on one vertex
 * @property {TextureUse[]} textures
 * @property {Record<string, MaterialFactors>} factors  by material name
 */

/** @param {number} mode @param {number} count */
function trianglesOf(mode, count) {
  if (mode === 4) return Math.floor(count / 3);
  if (mode === 5 || mode === 6) return Math.max(0, count - 2);
  return 0;
}

/**
 * Triangle list indices of a primitive in any triangle mode.
 * @param {number} mode
 * @param {ArrayLike<number>} idx
 */
function triangleList(mode, idx) {
  if (mode === 4) return Uint32Array.from(idx);
  const out = [];
  for (let i = 2; i < idx.length; i++) {
    if (mode === 5) out.push(...(i % 2 ? [idx[i - 1], idx[i - 2], idx[i]] : [idx[i - 2], idx[i - 1], idx[i]]));
    else if (mode === 6) out.push(idx[0], idx[i - 1], idx[i]);
  }
  return Uint32Array.from(out);
}

/**
 * @param {number[]} m column-major 4 × 4
 * @param {ArrayLike<number>} p
 * @param {number} i
 * @param {Float64Array} out
 */
function transformPoint(m, p, i, out) {
  const x = p[i * 3];
  const y = p[i * 3 + 1];
  const z = p[i * 3 + 2];
  out[i * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
  out[i * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
  out[i * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
}

/**
 * Reads a .glb / .gltf and measures it.
 * @param {string} file
 * @returns {Promise<GltfFacts>}
 */
export async function readGltf(file) {
  // a .gltf reads its .bin and images from the paths it references, next to it
  const doc = /\.gltf$/i.test(file) ? await (await io()).read(file) : await (await io()).readBinary(new Uint8Array(readFileSync(file)));
  const root = doc.getRoot();
  const scene = root.getDefaultScene() || root.listScenes()[0];
  /** @type {Primitive[]} */
  const primitives = [];
  let triangles = 0;
  let maxInfluences = 0;
  /** @param {import('@gltf-transform/core').Node} node */
  const visit = (node) => {
    const mesh = node.getMesh();
    if (mesh) {
      const skinned = !!node.getSkin();
      const m = skinned ? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] : Array.from(node.getWorldMatrix());
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        if (!pos) continue;
        const idxAcc = prim.getIndices();
        const count = idxAcc ? idxAcc.getCount() : pos.getCount();
        const mode = prim.getMode();
        triangles += trianglesOf(mode, count);
        const n = pos.getCount();
        const local = new Float64Array(n * 3);
        const el = [0, 0, 0];
        for (let i = 0; i < n; i++) local.set(pos.getElement(i, el), i * 3);
        const positions = new Float64Array(n * 3);
        for (let i = 0; i < n; i++) transformPoint(m, local, i, positions);
        const nrmAcc = prim.getAttribute('NORMAL');
        /** @type {Float32Array | null} */
        let normals = null;
        if (nrmAcc) {
          normals = new Float32Array(n * 3);
          const tmp = [0, 0, 0];
          for (let i = 0; i < n; i++) {
            nrmAcc.getElement(i, tmp);
            const x = m[0] * tmp[0] + m[4] * tmp[1] + m[8] * tmp[2];
            const y = m[1] * tmp[0] + m[5] * tmp[1] + m[9] * tmp[2];
            const z = m[2] * tmp[0] + m[6] * tmp[1] + m[10] * tmp[2];
            const l = Math.hypot(x, y, z) || 1;
            normals.set([x / l, y / l, z / l], i * 3);
          }
        }
        const idx = idxAcc ? /** @type {ArrayLike<number>} */ (idxAcc.getArray()) : Uint32Array.from({ length: count }, (_, i) => i);
        /** @type {(Float32Array | null)[]} */
        const uvs = [];
        for (let k = 0; k < 4; k++) {
          const acc = prim.getAttribute(`TEXCOORD_${k}`);
          if (!acc) {
            uvs.push(null);
            continue;
          }
          const uv = new Float32Array(acc.getCount() * 2);
          const tmp = [0, 0];
          for (let i = 0; i < acc.getCount(); i++) {
            acc.getElement(i, tmp);
            uv[i * 2] = tmp[0];
            uv[i * 2 + 1] = tmp[1];
          }
          uvs.push(uv);
        }
        const weightSets = [0, 1, 2, 3].map((j) => prim.getAttribute(`WEIGHTS_${j}`)).filter((a) => a != null);
        const w4 = [0, 0, 0, 0];
        for (let i = 0; weightSets.length && i < n; i++) {
          let used = 0;
          for (const s of weightSets) used += s.getElement(i, w4).filter((v) => v > 1e-6).length;
          maxInfluences = Math.max(maxInfluences, used);
        }
        primitives.push({
          mesh: mesh.getName() || node.getName() || `mesh${primitives.length}`,
          material: prim.getMaterial()?.getName() || '',
          triangles: trianglesOf(mode, count),
          positions,
          normals,
          indices: triangleList(mode, idx),
          uvs,
        });
      }
    }
    for (const child of node.listChildren()) visit(child);
  };
  for (const node of scene ? scene.listChildren() : []) visit(node);

  /** @type {TextureUse[]} */
  const textures = [];
  /** @type {Record<string, MaterialFactors>} */
  const factors = {};
  for (const mat of root.listMaterials()) {
    const tr = /** @type {any} */ (mat.getExtension('KHR_materials_transmission'));
    factors[mat.getName()] = { metallic: mat.getMetallicFactor(), roughness: mat.getRoughnessFactor(), transmissive: !!(tr && tr.getTransmissionFactor() > 0) };
    /** @type {[TextureUse['slot'], import('@gltf-transform/core').Texture | null, import('@gltf-transform/core').TextureInfo | null][]} */
    const slots = [
      ['baseColor', mat.getBaseColorTexture(), mat.getBaseColorTextureInfo()],
      ['normal', mat.getNormalTexture(), mat.getNormalTextureInfo()],
      ['metallicRoughness', mat.getMetallicRoughnessTexture(), mat.getMetallicRoughnessTextureInfo()],
      ['occlusion', mat.getOcclusionTexture(), mat.getOcclusionTextureInfo()],
      ['emissive', mat.getEmissiveTexture(), mat.getEmissiveTextureInfo()],
    ];
    for (const [slot, tex, info] of slots) {
      const bytes = tex?.getImage();
      if (!tex || !bytes) continue;
      let size = { width: 0, height: 0 };
      try {
        size = imageSize(bytes);
      } catch {}
      textures.push({ material: mat.getName(), slot, texCoord: info?.getTexCoord() ?? 0, width: size.width, height: size.height, mimeType: tex.getMimeType(), bytes });
    }
  }
  const joints = Math.max(0, ...root.listSkins().map((s) => s.listJoints().length));
  return { triangles, primitives, clips: root.listAnimations().map((a) => a.getName()), joints, maxInfluences, textures, factors };
}

// ------------------------------------------------------------------------------------------ UV islands

/**
 * Connected UV islands of a primitive's UV set (triangles that share a vertex index): world area in m², UV area in
 * UV units², UV bounding box, the world position of its centroid, and `boxScale`, the UV-per-metre scale a
 * world-planar box projection would give it (√(Σ area · cos θ / Σ area), θ the angle of each face to its dominant axis).
 * @param {Primitive} prim
 * @param {number} set  TEXCOORD index
 * @returns {{ worldArea: number, uvArea: number, triangles: number, center: [number, number, number], uvBox: [number, number, number, number], boxScale: number }[]}
 */
export function uvIslands(prim, set) {
  const uv = prim.uvs[set];
  if (!uv) return [];
  const nv = prim.positions.length / 3;
  const parent = Int32Array.from({ length: nv }, (_, i) => i);
  const find = (/** @type {number} */ x) => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]];
    return x;
  };
  const { indices: ix, positions: p } = prim;
  for (let t = 0; t < ix.length; t += 3) {
    const a = find(ix[t]);
    parent[find(ix[t + 1])] = a;
    parent[find(ix[t + 2])] = a;
  }
  /** @type {Map<number, { worldArea: number, uvArea: number, triangles: number, cx: number, cy: number, cz: number, proj: number, box: number[] }>} */
  const islands = new Map();
  for (let t = 0; t < ix.length; t += 3) {
    const [i0, i1, i2] = [ix[t], ix[t + 1], ix[t + 2]];
    const ax = p[i1 * 3] - p[i0 * 3];
    const ay = p[i1 * 3 + 1] - p[i0 * 3 + 1];
    const az = p[i1 * 3 + 2] - p[i0 * 3 + 2];
    const bx = p[i2 * 3] - p[i0 * 3];
    const by = p[i2 * 3 + 1] - p[i0 * 3 + 1];
    const bz = p[i2 * 3 + 2] - p[i0 * 3 + 2];
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    const world = 0.5 * Math.hypot(nx, ny, nz);
    const cosDominant = world > 0 ? Math.max(Math.abs(nx), Math.abs(ny), Math.abs(nz)) / (2 * world) : 0;
    const du1 = uv[i1 * 2] - uv[i0 * 2];
    const dv1 = uv[i1 * 2 + 1] - uv[i0 * 2 + 1];
    const du2 = uv[i2 * 2] - uv[i0 * 2];
    const dv2 = uv[i2 * 2 + 1] - uv[i0 * 2 + 1];
    const uvA = 0.5 * Math.abs(du1 * dv2 - du2 * dv1);
    const key = find(i0);
    const isl = islands.get(key) || { worldArea: 0, uvArea: 0, triangles: 0, cx: 0, cy: 0, cz: 0, proj: 0, box: [Infinity, Infinity, -Infinity, -Infinity] };
    isl.worldArea += world;
    isl.uvArea += uvA;
    isl.proj += world * cosDominant;
    isl.triangles++;
    for (const i of [i0, i1, i2]) {
      isl.box[0] = Math.min(isl.box[0], uv[i * 2]);
      isl.box[1] = Math.min(isl.box[1], uv[i * 2 + 1]);
      isl.box[2] = Math.max(isl.box[2], uv[i * 2]);
      isl.box[3] = Math.max(isl.box[3], uv[i * 2 + 1]);
    }
    isl.cx += ((p[i0 * 3] + p[i1 * 3] + p[i2 * 3]) / 3) * world;
    isl.cy += ((p[i0 * 3 + 1] + p[i1 * 3 + 1] + p[i2 * 3 + 1]) / 3) * world;
    isl.cz += ((p[i0 * 3 + 2] + p[i1 * 3 + 2] + p[i2 * 3 + 2]) / 3) * world;
    islands.set(key, isl);
  }
  return [...islands.values()].map((i) => ({
    worldArea: i.worldArea,
    uvArea: i.uvArea,
    triangles: i.triangles,
    center: /** @type {[number, number, number]} */ ([i.cx, i.cy, i.cz].map((v) => (i.worldArea > 0 ? v / i.worldArea : 0))),
    uvBox: /** @type {[number, number, number, number]} */ (i.box),
    boxScale: i.worldArea > 0 ? Math.sqrt(i.proj / i.worldArea) : 0,
  }));
}
