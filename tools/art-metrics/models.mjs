// @ts-check
// Meshes (`kind: 'model'`, `'character'`, `'animation'`), measured in the glTF: triangle budgets and LODs, bone
// influences, required clips, texel density per UV island (baked atlases and embedded textures), meter UVs of
// parts dressed in library materials, and the normal and base-color maps they ship.
import { LOD_MAX_RATIO, MAX_INFLUENCES, METER_UV, REQUIRED_CLIPS, TEXEL_DENSITY, TRIANGLES, TRIANGLE_CLASS_DEFAULTS } from './standard.mjs';
import { exempt, fail, fmt, pass, pct, skip, verdict } from './findings.mjs';
import { decodeLevels, imageSize, linearLuminance } from './images.mjs';
import { uvIslands } from './gltf.mjs';
import { albedoByMetalness, densityClass, metalnessFinding, metalnessPerTexel, normalLevelsFinding, roughnessSaturation, textFinding } from './materials.mjs';
import { coverage } from './lightmaps.mjs';

/** @typedef {import('./findings.mjs').Finding} Finding */
/** @typedef {import('./findings.mjs').Context} Context */
/** @typedef {import('../../src/contracts/assets.js').AssetEntry} AssetEntry */
/** @typedef {import('./gltf.mjs').GltfFacts} GltfFacts */

/** @param {unknown} v @returns {Record<string, any>} */
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? /** @type {Record<string, any>} */ (v) : {});

/**
 * Per-island density of a UV set against a texture size (px/m, or UV units per m for w = h = 1). With `atlas`, islands
 * that would hold fewer than `minIslandTexels` at `classDensity` or are narrower than `minIslandWidthTexels` in the
 * texture are left out and counted in `small`.
 * @param {GltfFacts} g
 * @param {number} set
 * @param {number} w
 * @param {number} h
 * @param {{ only?: (prim: import('./gltf.mjs').Primitive) => boolean, classDensity?: number, atlas?: boolean, floor?: boolean }} [opts]
 *   floor: leave out islands under `minIslandTexels` at `classDensity` (on for atlases)
 */
export function islandDensities(g, set, w, h, { only = () => true, classDensity = 0, atlas = false, floor = atlas } = {}) {
  const out = [];
  let small = 0;
  let smallArea = 0;
  let total = 0;
  for (const prim of g.primitives) {
    if (!only(prim)) continue;
    for (const isl of uvIslands(prim, set)) {
      const texels = isl.uvArea * w * h;
      const long = Math.max((isl.uvBox[2] - isl.uvBox[0]) * w, (isl.uvBox[3] - isl.uvBox[1]) * h);
      const tooSmall = isl.worldArea * classDensity ** 2 < TEXEL_DENSITY.minIslandTexels;
      const tooThin = atlas && long > 0 && texels / long < TEXEL_DENSITY.minIslandWidthTexels;
      total += Math.max(0, isl.worldArea);
      if (isl.worldArea <= 0 || (floor && tooSmall) || tooThin) {
        small++;
        smallArea += Math.max(0, isl.worldArea);
        continue;
      }
      out.push({ part: prim.material || prim.mesh, pxPerM: Math.sqrt(texels / isl.worldArea), area: isl.worldArea, center: isl.center, boxScale: isl.boxScale });
    }
  }
  return Object.assign(out, { small, smallShare: total > 0 ? smallArea / total : 0 });
}

/**
 * @param {string} id
 * @param {{ part: string, pxPerM: number, area: number }[]} islands
 * @param {number} target
 * @param {number} tol
 * @param {string} what
 * @returns {Finding}
 */
function densityFinding(id, islands, target, tol, what) {
  if (!islands.length) return fail('texel-density', id, `${what}: no UV islands to measure`);
  const off = islands.map((i) => ({ ...i, off: i.pxPerM / target - 1 }));
  const bad = off.filter((i) => Math.abs(i.off) > tol + 1e-9);
  const area = off.reduce((a, i) => a + i.area, 0);
  const mean = Math.sqrt(off.reduce((a, i) => a + i.pxPerM ** 2 * i.area, 0) / area);
  const worst = off.reduce((a, b) => (Math.abs(b.off) > Math.abs(a.off) ? b : a));
  const badArea = bad.reduce((a, i) => a + i.area, 0);
  const { small: nSmall = 0, smallShare = 0 } = /** @type {any} */ (islands);
  const small = nSmall ? `; ${nSmall} islands under ${TEXEL_DENSITY.minIslandTexels} texels or ${TEXEL_DENSITY.minIslandWidthTexels} texels across not judged (${fmt(smallShare * 100, 1)} % of the area)` : '';
  const limit = /_hair\b/.test(what) ? TEXEL_DENSITY.maxUnjudgedHairShare : TEXEL_DENSITY.maxUnjudgedAreaShare;
  if (smallShare > limit) return fail('texel-density', id, `${what}: the islands too small to judge cover ${fmt(smallShare * 100, 1)} % of the area (limit ${limit * 100} %)${bad.length ? `, and ${bad.length} of ${off.length} judged islands are outside ±${tol * 100} % of ${target}` : ''}`);
  if (!bad.length) return pass('texel-density', id, `${what}: ${off.length} islands within ±${tol * 100} % of ${target} (mean ${fmt(mean, 1)}, worst ${pct(worst.off)}${small})`);
  return fail(
    'texel-density',
    id,
    `${what}: ${bad.length} of ${off.length} islands (${fmt((badArea / area) * 100, 0)} % of the area) outside ±${tol * 100} % of ${target}; mean ${fmt(mean, 1)}, worst ${fmt(worst.pxPerM, 1)} on '${worst.part}' (${pct(worst.off)}${small})`
  );
}

/**
 * Checks one mesh entry.
 * @param {AssetEntry} entry
 * @param {Context} ctx
 * @returns {Promise<Finding[]>}
 */
export async function checkModel(entry, ctx) {
  const id = entry.id;
  const params = obj(entry.params);
  const meta = obj(entry.meta);
  /** @type {Finding[]} */
  const out = [];
  if (!ctx.exists(entry.path)) return [fail('triangle-budget', id, `${entry.path} is missing`)];
  /** @type {GltfFacts} */
  let g;
  try {
    g = await ctx.gltf(entry.path);
  } catch (err) {
    return [fail('triangle-budget', id, `${entry.path} does not load: ${/** @type {Error} */ (err).message}`)];
  }

  // ------------------------------------------------------------------------ triangles and LODs
  if (entry.kind === 'animation') out.push(skip('triangle-budget', id, 'animation-only glTF'));
  else {
    const cls = typeof params.class === 'string' ? params.class : /** @type {Record<string, string>} */ (TRIANGLE_CLASS_DEFAULTS)[entry.kind];
    const budget = cls ? TRIANGLES[cls] : undefined;
    const claimed = typeof meta.triangles === 'number' ? meta.triangles : null;
    const honest = claimed == null || claimed === g.triangles;
    const note = honest ? '' : `; the manifest says ${claimed}`;
    if (!cls) out.push(fail('triangle-budget', id, `${g.triangles} triangles, but no params.class (one of ${Object.keys(TRIANGLES).join(', ')}) names its budget${note}`));
    else if (!budget) out.push(fail('triangle-budget', id, `${g.triangles} triangles; class '${cls}' has no budget (${Object.keys(TRIANGLES).join(', ')})${note}`));
    else out.push(verdict('triangle-budget', id, g.triangles <= budget.max && honest, `${g.triangles} triangles vs the ${cls} budget ${budget.max}${note}`));
  }
  if (entry.lods?.length) {
    let prev = g.triangles;
    const bad = [];
    const counts = [];
    for (const lod of entry.lods) {
      if (!ctx.exists(lod.path)) {
        bad.push(`LOD ${lod.level} ${lod.path} is missing`);
        continue;
      }
      const lg = await ctx.gltf(lod.path);
      counts.push(`LOD ${lod.level} ${lg.triangles}`);
      if (lg.triangles > LOD_MAX_RATIO * prev) bad.push(`LOD ${lod.level} has ${lg.triangles} triangles, ${fmt((lg.triangles / prev) * 100, 0)} % of ${prev} (at most ${LOD_MAX_RATIO * 100} %)`);
      if (typeof lod.triangles === 'number' && lod.triangles !== lg.triangles) bad.push(`LOD ${lod.level}: the manifest says ${lod.triangles}, the file has ${lg.triangles}`);
      prev = lg.triangles;
    }
    out.push(verdict('lod-triangles', id, !bad.length, bad.length ? bad.join('; ') : `LOD 0 ${g.triangles}, ${counts.join(', ')}`));
  } else if (entry.kind !== 'animation') out.push(skip('lod-triangles', id, 'no LODs'));

  // ------------------------------------------------------------------------ skinning and clips
  if (g.joints > 0 || g.maxInfluences > 0) {
    out.push(verdict('bone-influences', id, g.maxInfluences <= MAX_INFLUENCES, `${g.maxInfluences} influences at most (limit ${MAX_INFLUENCES}), ${g.joints} joints`));
  } else if (entry.kind === 'character') out.push(fail('bone-influences', id, 'a character with no skin'));
  const required = /** @type {Record<string, readonly string[]>} */ (REQUIRED_CLIPS)[entry.kind];
  if (required) {
    const missing = required.filter((c) => !g.clips.includes(c));
    out.push(verdict('required-clips', id, !missing.length, missing.length ? `missing ${missing.join(', ')} (has ${g.clips.join(', ') || 'none'})` : `has ${required.join(', ')} (${g.clips.length} clips)`));
  } else if (entry.kind === 'animation') out.push(verdict('required-clips', id, g.clips.length > 0, `${g.clips.length} clips`));

  // ------------------------------------------------------------------------ texel density
  if (entry.kind !== 'animation') {
    const cls = densityClass(entry);
    const bake = obj(params.bake);
    const bakeFile = Object.values(entry.files || {}).find((p) => /\.(ktx2|png)$/i.test(p));
    if (!cls) out.push(fail('texel-density', id, `no texel-density class: params.tier must be one of ${Object.keys(TEXEL_DENSITY.classes).join(', ')}`));
    else if (typeof bake.uv === 'number' && bakeFile) {
      if (!ctx.exists(bakeFile)) out.push(fail('texel-density', id, `baked map ${bakeFile} is missing`));
      else {
        const { width, height } = imageSize(ctx.read(bakeFile));
        out.push(densityFinding(id, islandDensities(g, bake.uv, width, height, { classDensity: cls.pxPerM, atlas: true }), cls.pxPerM, TEXEL_DENSITY.tolerance, `baked atlas ${width}×${height} on UV${bake.uv}, ${cls.name} class px/m`));
      }
    } else if (g.textures.length) {
      for (const [mat, tex] of pickTextures(g)) {
        const isl = islandDensities(g, tex.texCoord, tex.width, tex.height, { only: (p) => p.material === mat, classDensity: cls.pxPerM, atlas: true });
        out.push(densityFinding(id, isl, cls.pxPerM, TEXEL_DENSITY.tolerance, `'${mat}' ${tex.slot} ${tex.width}×${tex.height} on UV${tex.texCoord}, ${cls.name} class px/m`));
      }
    } else if (!entry.materials) out.push(fail('texel-density', id, 'no baked atlas (params.bake.uv + files), no embedded textures and no library materials: nothing to measure'));
    else out.push(exempt('texel-density', id, 'dressed only in library materials (their density is checked on the material; UV0 scale under meter-uv)'));
  }

  // ------------------------------------------------------------------------ meter UVs for library materials
  const parts = Object.keys(entry.materials || {});
  if (parts.length) {
    const names = new Set(g.primitives.map((p) => p.material));
    const unknown = parts.filter((p) => !names.has(p));
    const cls = densityClass(entry);
    const isl = islandDensities(g, 0, 1, 1, { only: (p) => parts.includes(p.material), classDensity: cls?.pxPerM ?? TEXEL_DENSITY.classes.regular, floor: true });
    const tol = METER_UV.tolerance + 1e-9;
    const fits = (/** @type {{ pxPerM: number, boxScale: number }} */ i) => Math.abs(i.pxPerM / METER_UV.scale - 1) <= tol || (i.boxScale > 0 && Math.abs(i.pxPerM / i.boxScale - 1) <= tol);
    const stray = isl.filter((i) => !fits(i));
    const bad = [];
    if (!isl.length) bad.push('no UV0 islands on the library-material parts');
    if (stray.length) {
      const area = isl.reduce((a, i) => a + i.area, 0);
      const w = stray.reduce((a, b) => (b.area > a.area ? b : a));
      bad.push(
        `${stray.length} of ${isl.length} UV0 islands (${fmt((stray.reduce((a, i) => a + i.area, 0) / area) * 100, 1)} % of the area) are neither metres nor world-planar ±${METER_UV.tolerance * 100} %; largest on '${w.part}' reads ${fmt(w.pxPerM, 2)} where box projection gives ${fmt(w.boxScale, 2)}`
      );
    }
    if (unknown.length) bad.push(`material part(s) ${unknown.join(', ')} are not glTF material names in ${entry.path}`);
    const small = isl.small ? `; ${isl.small} islands under ${TEXEL_DENSITY.minIslandTexels} texels not judged` : '';
    out.push(verdict('meter-uv', id, !bad.length, `${bad.length ? bad.join('; ') : `${isl.length} UV0 islands of ${parts.length} part(s) in metres or world-planar ±${METER_UV.tolerance * 100} %`}${small}`));
  }

  // ------------------------------------------------------------------------ shipped maps
  const set = typeof obj(params.bake).uv === 'number' ? obj(params.bake).uv : 0;
  const normalPath = entry.files?.normal;
  if (normalPath && /\.(ktx2|png)$/i.test(normalPath)) {
    if (!ctx.exists(normalPath)) out.push(fail('normal-length', id, `${normalPath} is missing`));
    else out.push(normalLevelsFinding(id, await decodeLevels(ctx.read(normalPath)), (_l, w, h) => coverage(g.primitives, set, w, h)));
  }
  const baked = entry.files?.baseColor;
  if (baked && /\.(ktx2|png)$/i.test(baked) && ctx.exists(baked)) {
    const t = await ctx.texture(baked);
    if (!t.float) out.push(textFinding(id, hideOutside(/** @type {Uint8Array} */ (t.rgba), coverage(g.primitives, set, t.width, t.height)), t.width, t.height, params));
  }
  /** @type {Map<string, Map<string, import('./gltf.mjs').TextureUse>>} */
  const byMat = new Map();
  for (const tex of g.textures) {
    if (!byMat.has(tex.material)) byMat.set(tex.material, new Map());
    /** @type {Map<string, any>} */ (byMat.get(tex.material)).set(tex.slot, tex);
  }
  /** @param {import('./gltf.mjs').TextureUse} tex */
  const decode = async (tex) => {
    try {
      const d = await ctx.decodeBytes(tex.bytes);
      return d.float ? null : d;
    } catch (err) {
      out.push(fail(tex.slot === 'normal' ? 'normal-length' : tex.slot === 'metallicRoughness' ? 'roughness-saturation' : 'albedo-range', id, `'${tex.material}' ${tex.slot} does not decode: ${/** @type {Error} */ (err).message}`));
      return null;
    }
  };
  for (const [mat, slots] of byMat) {
    const prims = g.primitives.filter((p) => p.material === mat);
    const f = g.factors?.[mat] || { metallic: 1, roughness: 1, transmissive: false };
    const nrm = slots.get('normal');
    if (nrm) {
      const levels = /image\/ktx2/.test(nrm.mimeType) ? await decodeLevels(nrm.bytes) : await decode(nrm).then((d) => (d ? [{ width: d.width, height: d.height, rgba: /** @type {Uint8Array} */ (d.rgba) }] : []));
      const r = normalLevelsFinding(id, levels, (_l, w, h) => coverage(prims, nrm.texCoord, w, h));
      out.push({ ...r, detail: `'${mat}': ${r.detail}` });
    }
    const mr = slots.get('metallicRoughness');
    const mrImg = mr ? await decode(mr) : null;
    if (mr && mrImg) {
      const keep = coverage(prims, mr.texCoord, mrImg.width, mrImg.height);
      const rgba = /** @type {Uint8Array} */ (mrImg.rgba);
      const r = roughnessSaturation(id, packKept(rgba, keep));
      out.push({ ...r, detail: `'${mat}': ${r.detail}` });
      const metal = metalnessPerTexel(mrImg.width, mrImg.height, { width: mrImg.width, height: mrImg.height, rgba }, f.metallic);
      const m = metalnessFinding(id, metal, keep);
      out.push({ ...m, detail: `'${mat}': ${m.detail}` });
    } else if (!f.transmissive) {
      const m = f.metallic <= 0.1 || f.metallic >= 0.9;
      out.push(verdict('metalness', id, m, `'${mat}': no metallic-roughness map; metallicFactor ${fmt(f.metallic, 2)}`));
      out.push(verdict('roughness-saturation', id, f.roughness > 0 && f.roughness < 1, `'${mat}': no metallic-roughness map; roughnessFactor ${fmt(f.roughness, 2)} (0 and 1 are clipped)`));
    }
    const bc = slots.get('baseColor');
    const bcImg = bc ? await decode(bc) : null;
    if (bc && bcImg) {
      const rgba = /** @type {Uint8Array} */ (bcImg.rgba);
      const cover = coverage(prims, bc.texCoord, bcImg.width, bcImg.height);
      if (f.transmissive) out.push(exempt('albedo-range', id, `'${mat}' is transmissive: its base color is a transmission tint`));
      else {
        const metal = metalnessPerTexel(bcImg.width, bcImg.height, mrImg ? { width: mrImg.width, height: mrImg.height, rgba: /** @type {Uint8Array} */ (mrImg.rgba) } : null, f.metallic);
        const keep = Uint8Array.from(cover, (c, i) => (c && rgba[i * 4 + 3] >= 128 ? 1 : 0));
        const a = albedoByMetalness(linearLuminance(rgba), metal, keep);
        out.push(verdict('albedo-range', id, !a.bad.length, `'${mat}' base color by texel metalness, opaque texels inside the UV islands: ${a.bad.length ? a.bad.join('; ') : a.detail}`));
      }
      const t = textFinding(id, hideOutside(rgba, cover), bcImg.width, bcImg.height, params);
      out.push({ ...t, detail: `'${mat}': ${t.detail}` });
    }
  }
  return out;
}

/**
 * One texture per material to measure density with: the base color, else the first texture it samples.
 * @param {GltfFacts} g
 * @returns {[string, import('./gltf.mjs').TextureUse][]}
 */
function pickTextures(g) {
  /** @type {Map<string, import('./gltf.mjs').TextureUse>} */
  const by = new Map();
  for (const t of g.textures) {
    const cur = by.get(t.material);
    if (!cur || (t.slot === 'baseColor' && cur.slot !== 'baseColor')) by.set(t.material, t);
  }
  return [...by.entries()];
}

/**
 * An RGBA copy with the texels outside a coverage mask made transparent (text search sees only the islands).
 * @param {Uint8Array} rgba
 * @param {Uint8Array} mask
 */
function hideOutside(rgba, mask) {
  const out = Uint8Array.from(rgba);
  for (let i = 0; i < mask.length; i++) if (!mask[i]) out[i * 4 + 3] = 0;
  return out;
}

/**
 * The kept texels of an RGBA image, packed.
 * @param {Uint8Array} rgba
 * @param {Uint8Array} mask
 */
function packKept(rgba, mask) {
  const idx = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) idx.push(i);
  const out = new Uint8Array(idx.length * 4);
  idx.forEach((k, j) => out.set(rgba.subarray(k * 4, k * 4 + 4), j * 4));
  return out;
}
