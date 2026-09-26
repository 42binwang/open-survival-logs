// @ts-check
// Lightmap seams and padding (`kind: 'lightmap'`, one file per lighting state). The entry names the mesh it maps in
// `params.model` (an asset id) or `params.mesh` (a path), and its UV set in `params.uv` (default 1 = TEXCOORD_1).
// - Seams: every mesh edge shared by two triangles of a continuous surface (face normals within 30°) whose UVs
//   differ is a UV seam; the irradiance one texel inside each side is sampled along it (bilinear), and the p95 of
//   the relative step may not exceed 10 %.
// - Padding: texels within 2 of an island that belong to no island must be dilated from it (within 10 % of their
//   nearest island texel), or bilinear filtering and mips pull a foreign value into the island's edge.
import { LIGHTMAP } from './standard.mjs';
import { fail, fmt, verdict } from './findings.mjs';
import { percentiles } from './images.mjs';

/** @typedef {import('./findings.mjs').Finding} Finding */
/** @typedef {import('./findings.mjs').Context} Context */
/** @typedef {import('./images.mjs').Texture} Texture */
/** @typedef {import('./gltf.mjs').Primitive} Primitive */

/**
 * @typedef {object} SeamEdge
 * @property {[number, number, number]} at  world position of the edge midpoint
 * @property {number[][]} sides  per side [u0, v0, u1, v1, ux, vy]: the edge's UVs and the UV of the triangle's third vertex
 */

/**
 * UV seams of continuous surfaces.
 * @param {Primitive[]} prims
 * @param {number} set
 * @param {number} w  lightmap width (for the texel tolerance)
 * @param {number} h
 * @returns {SeamEdge[]}
 */
export function seamEdges(prims, set, w, h) {
  const q = (/** @type {number} */ v) => Math.round(v * 1e4);
  const cosMax = Math.cos((LIGHTMAP.maxNormalAngleDeg * Math.PI) / 180);
  /** @type {Map<string, { n: number[], a: number[], b: number[], ua: number[], ub: number[], uc: number[] }[]>} */
  const edges = new Map();
  for (const prim of prims) {
    const uv = prim.uvs[set];
    if (!uv) continue;
    const p = prim.positions;
    const ix = prim.indices;
    const P = (/** @type {number} */ i) => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
    const U = (/** @type {number} */ i) => [uv[i * 2], uv[i * 2 + 1]];
    for (let t = 0; t < ix.length; t += 3) {
      const v = [ix[t], ix[t + 1], ix[t + 2]];
      const [p0, p1, p2] = v.map(P);
      const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
      const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
      const nx = e1[1] * e2[2] - e1[2] * e2[1];
      const ny = e1[2] * e2[0] - e1[0] * e2[2];
      const nz = e1[0] * e2[1] - e1[1] * e2[0];
      const len = Math.hypot(nx, ny, nz);
      if (len < 1e-12) continue;
      const n = [nx / len, ny / len, nz / len];
      for (let k = 0; k < 3; k++) {
        const ia = v[k];
        const ib = v[(k + 1) % 3];
        const ic = v[(k + 2) % 3];
        const a = P(ia);
        const b = P(ib);
        const ka = a.map(q).join(',');
        const kb = b.map(q).join(',');
        const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        const rec = ka < kb ? { n, a, b, ua: U(ia), ub: U(ib), uc: U(ic) } : { n, a: b, b: a, ua: U(ib), ub: U(ia), uc: U(ic) };
        const list = edges.get(key);
        if (list) list.push(rec);
        else edges.set(key, [rec]);
      }
    }
  }
  /** @type {SeamEdge[]} */
  const out = [];
  const tol = (/** @type {number[]} */ x, /** @type {number[]} */ y) => Math.abs((x[0] - y[0]) * w) > 0.5 || Math.abs((x[1] - y[1]) * h) > 0.5;
  for (const list of edges.values()) {
    if (list.length !== 2) continue;
    const [s, t] = list;
    if (s.n[0] * t.n[0] + s.n[1] * t.n[1] + s.n[2] * t.n[2] < cosMax) continue;
    if (!tol(s.ua, t.ua) && !tol(s.ub, t.ub)) continue;
    out.push({
      at: [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2, (s.a[2] + s.b[2]) / 2],
      sides: [s, t].map((r) => [...r.ua, ...r.ub, ...r.uc]),
    });
  }
  return out;
}

/**
 * Luminance of a texture, bilinear at a UV (glTF: origin top left), clamped at the borders.
 * @param {Texture} t
 * @param {number} u
 * @param {number} v
 */
export function sampleLum(t, u, v) {
  const x = u * t.width - 0.5;
  const y = v * t.height - 0.5;
  const x0 = Math.max(0, Math.min(t.width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(t.height - 1, Math.floor(y)));
  const x1 = Math.min(t.width - 1, x0 + 1);
  const y1 = Math.min(t.height - 1, y0 + 1);
  const fx = Math.max(0, Math.min(1, x - x0));
  const fy = Math.max(0, Math.min(1, y - y0));
  const L = (/** @type {number} */ xx, /** @type {number} */ yy) => {
    const i = (yy * t.width + xx) * 4;
    return 0.2126 * t.rgba[i] + 0.7152 * t.rgba[i + 1] + 0.0722 * t.rgba[i + 2];
  };
  return (L(x0, y0) * (1 - fx) + L(x1, y0) * fx) * (1 - fy) + (L(x0, y1) * (1 - fx) + L(x1, y1) * fx) * fy;
}

/**
 * The relative irradiance step across each seam edge (p95 along the edge, and the largest sample), one texel inside
 * each side.
 * @param {SeamEdge[]} seams
 * @param {Texture} t
 */
export function seamSteps(seams, t) {
  const lumAll = [];
  for (let i = 0; i < t.rgba.length; i += 16) lumAll.push(0.2126 * t.rgba[i] + 0.7152 * t.rgba[i + 1] + 0.0722 * t.rgba[i + 2]);
  const [p99] = percentiles(lumAll, [99]);
  const floor = Math.max(1e-9, LIGHTMAP.darkFloor * p99);
  return seams.map((s) => {
    const texels = Math.max(...s.sides.map(([u0, v0, u1, v1]) => Math.hypot((u1 - u0) * t.width, (v1 - v0) * t.height)));
    const k = Math.max(2, Math.min(64, Math.round(texels)));
    const steps = [];
    for (let i = 0; i < k; i++) {
      const f = (i + 0.5) / k;
      const vals = s.sides.map(([u0, v0, u1, v1, uc, vc]) => {
        const u = u0 + (u1 - u0) * f;
        const v = v0 + (v1 - v0) * f;
        const du = (uc - u) * t.width;
        const dv = (vc - v) * t.height;
        const d = Math.hypot(du, dv) || 1;
        return sampleLum(t, u + du / d / t.width, v + dv / d / t.height);
      });
      steps.push(Math.abs(vals[0] - vals[1]) / Math.max((vals[0] + vals[1]) / 2, floor));
    }
    const [p] = percentiles(steps, [LIGHTMAP.stepPercentile]);
    return { at: s.at, step: p, max: Math.max(...steps) };
  });
}

/**
 * Texels covered by the UV triangles (texel centres inside a triangle).
 * @param {Primitive[]} prims
 * @param {number} set
 * @param {number} w
 * @param {number} h
 */
export function coverage(prims, set, w, h) {
  const mask = new Uint8Array(w * h);
  for (const prim of prims) {
    const uv = prim.uvs[set];
    if (!uv) continue;
    const ix = prim.indices;
    for (let t = 0; t < ix.length; t += 3) {
      const pts = [ix[t], ix[t + 1], ix[t + 2]].map((i) => [uv[i * 2] * w, uv[i * 2 + 1] * h]);
      const [a, b, c] = pts;
      const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
      if (Math.abs(area) < 1e-12) continue;
      const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
      const maxX = Math.min(w - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
      const maxY = Math.min(h - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      const eps = 1e-6 * Math.abs(area);
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5;
          const py = y + 0.5;
          const w0 = ((b[0] - px) * (c[1] - py) - (c[0] - px) * (b[1] - py)) * Math.sign(area);
          const w1 = ((c[0] - px) * (a[1] - py) - (a[0] - px) * (c[1] - py)) * Math.sign(area);
          const w2 = ((a[0] - px) * (b[1] - py) - (b[0] - px) * (a[1] - py)) * Math.sign(area);
          if (w0 >= -eps && w1 >= -eps && w2 >= -eps) mask[y * w + x] = 1;
        }
      }
    }
  }
  return mask;
}

/**
 * Share of the padding ring (texels within `pad` of an island, outside every island) that was not dilated: its
 * irradiance differs from its nearest island texel by more than the seam limit, so bilinear filtering and mips pull
 * a foreign value into the island's edge.
 * @param {Uint8Array} mask
 * @param {Texture} t
 * @param {number} pad
 */
export function unpaddedShare(mask, t, pad) {
  const { width: w, height: h } = t;
  const L = (/** @type {number} */ i) => 0.2126 * t.rgba[i * 4] + 0.7152 * t.rgba[i * 4 + 1] + 0.0722 * t.rgba[i * 4 + 2];
  /** nearest covered texel of each texel, by breadth-first rings (Chebyshev distance), up to pad */
  const src = new Int32Array(w * h).fill(-1);
  let front = [];
  for (let i = 0; i < w * h; i++) {
    if (mask[i]) {
      src[i] = i;
      front.push(i);
    }
  }
  /** @type {number[]} */
  const ring = [];
  for (let d = 1; d <= pad && front.length; d++) {
    /** @type {number[]} */
    const next = [];
    for (const i of front) {
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (src[j] >= 0) continue;
          src[j] = src[i];
          next.push(j);
          ring.push(j);
        }
      }
    }
    front = next;
  }
  const lumAll = [];
  for (let i = 0; i < w * h; i += 4) lumAll.push(L(i));
  const [p99] = percentiles(lumAll, [99]);
  const floor = Math.max(1e-9, LIGHTMAP.darkFloor * p99);
  let bare = 0;
  for (const j of ring) {
    const a = L(j);
    const b = L(src[j]);
    if (Math.abs(a - b) / Math.max((a + b) / 2, floor) > LIGHTMAP.maxStepAnywhere) bare++;
  }
  return { share: ring.length ? bare / ring.length : 0, ring: ring.length };
}

/**
 * Checks one lightmap entry: every state file against the mesh it maps.
 * @param {import('../../src/contracts/assets.js').AssetEntry} entry
 * @param {Context} ctx
 * @returns {Promise<Finding[]>}
 */
export async function checkLightmap(entry, ctx) {
  const id = entry.id;
  const params = /** @type {Record<string, any>} */ (entry.params || {});
  const set = Number.isInteger(params.uv) ? params.uv : 1;
  const model = typeof params.model === 'string' ? ctx.assets.get(params.model) : undefined;
  const meshPath = typeof params.mesh === 'string' ? params.mesh : model?.path;
  if (!meshPath) {
    const why = params.model ? `params.model '${params.model}' is not an asset of any manifest` : 'the entry does not name the mesh it maps (params.model or params.mesh)';
    return [fail('lightmap-seams', id, why), fail('lightmap-padding', id, why)];
  }
  if (!ctx.exists(meshPath)) return [fail('lightmap-seams', id, `${meshPath} is missing`), fail('lightmap-padding', id, `${meshPath} is missing`)];
  const g = await ctx.gltf(meshPath);
  const states = Object.entries(entry.files || (entry.path.endsWith('/') ? {} : { map: entry.path }));
  if (!states.length) return [fail('lightmap-seams', id, 'no lightmap files'), fail('lightmap-padding', id, 'no lightmap files')];
  if (!g.primitives.some((p) => p.uvs[set])) return [fail('lightmap-seams', id, `${meshPath} has no TEXCOORD_${set}`), fail('lightmap-padding', id, `${meshPath} has no TEXCOORD_${set}`)];
  const seamBad = [];
  const padBad = [];
  let seamCount = 0;
  let worst = 0;
  let worstPad = 0;
  for (const [state, path] of states) {
    if (!ctx.exists(path)) {
      seamBad.push(`${state}: ${path} is missing`);
      padBad.push(`${state}: ${path} is missing`);
      continue;
    }
    const t = await ctx.texture(path);
    const seams = seamEdges(g.primitives, set, t.width, t.height);
    seamCount = seams.length;
    const steps = seamSteps(seams, t);
    const over = steps.filter((s) => s.step > LIGHTMAP.maxRelativeStep || s.max > LIGHTMAP.maxStepAnywhere);
    for (const s of steps) worst = Math.max(worst, s.step);
    if (over.length) {
      const top = over.sort((a, b) => b.max - a.max)[0];
      seamBad.push(`${state}: ${over.length} of ${steps.length} seam edges step more than ${LIGHTMAP.maxRelativeStep * 100} % (p95) or ${LIGHTMAP.maxStepAnywhere * 100} % anywhere (worst p95 ${fmt(top.step * 100, 0)} %, max ${fmt(top.max * 100, 0)} % at ${top.at.map((v) => fmt(v, 2)).join(', ')} m)`);
    }
    const padTexels = /\.ktx2$/i.test(path) ? LIGHTMAP.paddingTexelsKtx2 : LIGHTMAP.paddingTexels;
    const pad = unpaddedShare(coverage(g.primitives, set, t.width, t.height), t, padTexels);
    worstPad = Math.max(worstPad, pad.share);
    if (pad.share > LIGHTMAP.maxUnpaddedShare) padBad.push(`${state}: ${fmt(pad.share * 100, 1)} % of the ${pad.ring} texels in the ${padTexels}-texel padding ring differ from their island by more than ${LIGHTMAP.maxStepAnywhere * 100} % (not dilated)`);
  }
  return [
    verdict('lightmap-seams', id, !seamBad.length, seamBad.length ? seamBad.join('; ') : `${states.length} state(s), ${seamCount} seam edges, worst step ${fmt(worst * 100, 1)} %`),
    verdict('lightmap-padding', id, !padBad.length, padBad.length ? padBad.join('; ') : `${states.length} state(s), unpadded share ${fmt(worstPad * 100, 2)} %`),
  ];
}
