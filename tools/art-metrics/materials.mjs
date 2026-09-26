// @ts-check
// PBR validity, tiling and texel density of material entries (the library's `kind: 'material'`) and of tiled
// single textures, measured on the decoded maps. The per-texel statistics are tools/materials/checks.mjs (P0-05);
// the limits are docs/ART.md through ./standard.mjs. A library material needs all three maps (base color, normal,
// ORM) and a banded family: what a check cannot measure fails.
import { normalStats, seamMetric, seamOk } from '../materials/checks.mjs';
import { ALBEDO, FAMILY_BANDS, METALNESS, NORMALS, ROUGHNESS_SATURATION, TEXEL_DENSITY, TEXT, TILING } from './standard.mjs';
import { exempt, fail, fmt, pct, skip, verdict } from './findings.mjs';
import { SRGB_TO_LINEAR, decodeLevels, hexToLinear, linearLuminance, percentiles } from './images.mjs';
import { findTextRows } from './text.mjs';

/** @typedef {import('./findings.mjs').Finding} Finding */
/** @typedef {import('./findings.mjs').Context} Context */
/** @typedef {import('../../src/contracts/assets.js').AssetEntry} AssetEntry */

/** @param {unknown} v @returns {Record<string, any>} */
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? /** @type {Record<string, any>} */ (v) : {});

/**
 * The density class an entry declares (`params.tier`), resolved through the aliases, or the kind's default.
 * @param {AssetEntry} entry
 * @returns {{ name: string, pxPerM: number } | null}
 */
export function densityClass(entry) {
  const declared = obj(entry.params).tier;
  const fallback = /** @type {Record<string, string>} */ (TEXEL_DENSITY.defaults)[entry.kind];
  const raw = typeof declared === 'string' ? declared : fallback;
  if (!raw) return null;
  const name = /** @type {Record<string, string>} */ (TEXEL_DENSITY.aliases)[raw] || raw;
  const px = /** @type {Record<string, number>} */ (TEXEL_DENSITY.classes)[name];
  return px ? { name, pxPerM: px } : null;
}

/**
 * The tint a material shows by default: its `params.tint.default` preset (or hex), and whether the tint mask is the
 * base color's alpha.
 * @param {Record<string, any>} params
 * @param {string} [pick]  a preset name or hex; the default when absent
 * @returns {{ tint: number[] | undefined, byAlpha: boolean, name: string }}
 */
export function tintOf(params, pick) {
  const t = obj(params.tint);
  const presets = obj(t.presets);
  const want = pick ?? t.default;
  const hex = typeof want === 'string' ? (presets[want] || (/^#[0-9a-f]{6}$/i.test(want) ? want : null)) : null;
  return { tint: hex ? hexToLinear(hex) : undefined, byAlpha: t.mask === 'alpha', name: typeof want === 'string' ? want : 'untinted' };
}

/**
 * Linear luminance of every base-color texel as shown: texel × tint × baseColorFactor (alpha ignored).
 * @param {Uint8Array} rgba
 * @param {Record<string, any>} params
 * @param {string} [pick]
 */
function shownLuminance(rgba, params, pick) {
  const { tint, byAlpha } = tintOf(params, pick);
  const f = Array.isArray(obj(params.pbr).baseColorFactor) ? obj(params.pbr).baseColorFactor : [1, 1, 1, 1];
  const factor = 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  const lum = linearLuminance(rgba, { tint, tintByAlpha: byAlpha });
  if (factor !== 1) for (let i = 0; i < lum.length; i++) lum[i] *= factor;
  return lum;
}

/**
 * Per-texel metalness of a base color from a metalness map (blue channel) of any size, nearest sample, times the
 * factor; a missing map gives the factor everywhere.
 * @param {number} w  base-color width
 * @param {number} h
 * @param {{ width: number, height: number, rgba: Uint8Array } | null} map
 * @param {number} factor
 */
export function metalnessPerTexel(w, h, map, factor) {
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!map) {
        out[y * w + x] = factor;
        continue;
      }
      const mx = Math.min(map.width - 1, Math.floor((x * map.width) / w));
      const my = Math.min(map.height - 1, Math.floor((y * map.height) / h));
      out[y * w + x] = (map.rgba[(my * map.width + mx) * 4 + 2] / 255) * factor;
    }
  }
  return out;
}

/**
 * Albedo limits per texel by its metalness: metal texels against the F0 range, the rest against the dielectric
 * limits, each class judged on its percentiles when it holds at least 1 % of the texels.
 * @param {Float64Array} lum
 * @param {Float64Array} metal
 * @param {boolean[] | Uint8Array | null} [keep]  texels to judge (UV coverage, opacity)
 */
export function albedoByMetalness(lum, metal, keep = null) {
  /** @type {number[]} */
  const di = [];
  /** @type {number[]} */
  const me = [];
  for (let i = 0; i < lum.length; i++) {
    if (keep && !keep[i]) continue;
    (metal[i] > 0.5 ? me : di).push(lum[i]);
  }
  const total = di.length + me.length;
  const bad = [];
  const parts = [];
  for (const [name, vals, lim] of /** @type {[string, number[], { min: number, max: number }][]} */ ([
    ['dielectric', di, ALBEDO.dielectric],
    ['metal F0', me, ALBEDO.metal],
  ])) {
    if (!vals.length || vals.length < 0.01 * total) continue;
    const [lo, hi] = percentiles(vals, [ALBEDO.percentiles[0], ALBEDO.percentiles[1]]);
    parts.push(`${name} ${fmt(lo)}–${fmt(hi)} (${lim.min}–${lim.max})`);
    if (lo < lim.min || hi > lim.max) bad.push(`${name} texels p0.5–p99.5 ${fmt(lo)}–${fmt(hi)} outside ${lim.min}–${lim.max}`);
  }
  return { bad, detail: parts.join(', ') || 'no texels' };
}

/**
 * The metalness switch: the share of texels near 0 or 1.
 * @param {string} id
 * @param {Float64Array} metal
 * @param {boolean[] | Uint8Array | null} [keep]
 * @returns {Finding}
 */
export function metalnessFinding(id, metal, keep = null) {
  let n = 0;
  let clean = 0;
  for (let i = 0; i < metal.length; i++) {
    if (keep && !keep[i]) continue;
    n++;
    if (metal[i] <= METALNESS.nearZero || metal[i] >= METALNESS.nearOne) clean++;
  }
  const share = n ? clean / n : 0;
  return verdict('metalness', id, n > 0 && share >= METALNESS.minShare, `${fmt(share * 100, 1)} % of texels within ${METALNESS.nearZero} of 0 or 1 (at least ${METALNESS.minShare * 100} %)`);
}

/**
 * Repetition: the largest deviation of a block mean from the tile mean, blocks × blocks over the tile.
 * @param {Float64Array} lum  row-major w × h
 * @param {number} w
 * @param {number} h
 * @param {number} blocks
 */
export function blockDeviation(lum, w, h, blocks) {
  const sums = new Float64Array(blocks * blocks);
  const counts = new Float64Array(blocks * blocks);
  let total = 0;
  for (let y = 0; y < h; y++) {
    const by = Math.min(blocks - 1, Math.floor((y * blocks) / h));
    for (let x = 0; x < w; x++) {
      const v = lum[y * w + x];
      const k = by * blocks + Math.min(blocks - 1, Math.floor((x * blocks) / w));
      sums[k] += v;
      counts[k]++;
      total += v;
    }
  }
  const mean = total / (w * h);
  let worst = 0;
  let at = [0, 0];
  for (let k = 0; k < sums.length; k++) {
    const d = Math.abs(sums[k] / counts[k] - mean) / (mean || 1e-9);
    if (d > worst) {
      worst = d;
      at = [k % blocks, Math.floor(k / blocks)];
    }
  }
  return { worst, at, mean };
}

/**
 * @param {Uint8Array} rgba
 * @param {number} c
 */
const channelOf = (rgba, c) => Float64Array.from({ length: rgba.length / 4 }, (_, i) => rgba[i * 4 + c]);

/**
 * Normals on every stored mip level of a map (a PNG stores one).
 * @param {string} id
 * @param {{ width: number, height: number, rgba: Uint8Array }[]} levels
 * @param {(level: number, w: number, h: number) => Uint8Array | null} [maskOf]  UV coverage per level (atlases)
 * @returns {Finding}
 */
export function normalLevelsFinding(id, levels, maskOf) {
  if (!levels.length) return fail('normal-length', id, 'no 8-bit levels to decode');
  let worst = null;
  for (let l = 0; l < levels.length; l++) {
    const lv = levels[l];
    if (lv.width < 4 || lv.height < 4) break;
    const f = normalFinding(id, masked(lv.rgba, maskOf ? maskOf(l, lv.width, lv.height) : null));
    if (f.state === 'fail') return { ...f, detail: `mip ${l} (${lv.width}×${lv.height}): ${f.detail}` };
    worst = f;
  }
  return worst ? { ...worst, detail: `${levels.length} mip level(s): ${worst.detail.replace(/^.*?length/, 'length')}` } : fail('normal-length', id, 'no level of 4 × 4 or more');
}

/**
 * Checks one `kind: 'material'` entry.
 * @param {AssetEntry} entry
 * @param {Context} ctx
 * @returns {Promise<Finding[]>}
 */
export async function checkMaterial(entry, ctx) {
  const id = entry.id;
  const params = obj(entry.params);
  const files = entry.files || {};
  /** @type {Finding[]} */
  const out = [];
  /** @param {string} key @returns {Promise<import('./images.mjs').Texture | null>} */
  const load = async (key) => {
    const p = files[key];
    if (!p || !ctx.exists(p)) return null;
    try {
      return await ctx.texture(p);
    } catch {
      return null;
    }
  };
  const base = await load('baseColor');
  const normal = await load('normal');
  const ormTex = await load('orm');
  for (const [key, t] of /** @type {[string, any][]} */ ([['baseColor', base], ['normal', normal], ['orm', ormTex]])) {
    if (!t || t.float) out.push(fail(key === 'normal' ? 'normal-length' : key === 'orm' ? 'roughness-saturation' : 'albedo-range', id, files[key] ? `${files[key]} is missing, unreadable or not 8-bit` : `no ${key} map: a library material has base color, normal and ORM`));
  }
  const baseRgba = base && !base.float ? /** @type {Uint8Array} */ (base.rgba) : null;
  const orm = ormTex && !ormTex.float ? /** @type {Uint8Array} */ (ormTex.rgba) : null;
  const family = typeof params.family === 'string' ? params.family : null;
  const band = family ? FAMILY_BANDS[family] : undefined;
  const mFactor = typeof obj(params.pbr).metalnessFactor === 'number' ? obj(params.pbr).metalnessFactor : 1;

  // ------------------------------------------------------------------------ albedo, per texel by metalness
  if (baseRgba && base) {
    const metal = metalnessPerTexel(base.width, base.height, ormTex && orm ? { width: ormTex.width, height: ormTex.height, rgba: orm } : null, band?.metal ? 1 : mFactor);
    if (orm) out.push(metalnessFinding(id, metal));
    if (band?.transmissive) {
      out.push(exempt('albedo-range', id, `${family} is transmissive: its base color is a transmission tint, not an albedo`));
      out.push(exempt('albedo-band', id, `${family} has no albedo band (transmissive)`));
    } else {
      const bad = [];
      const first = albedoByMetalness(shownLuminance(baseRgba, params), metal);
      bad.push(...first.bad.map((b) => `${tintOf(params).name}: ${b}`));
      const presets = Object.keys(obj(obj(params.tint).presets));
      for (const name of presets) bad.push(...albedoByMetalness(shownLuminance(baseRgba, params, name), metal).bad.map((b) => `tint '${name}': ${b}`));
      out.push(verdict('albedo-range', id, !bad.length, bad.length ? bad.join('; ') : `${first.detail} (${presets.length} tints)`));
      if (!family) out.push(fail('albedo-band', id, 'no params.family, so no ART.md band can apply'));
      else if (!band?.albedo) out.push(fail('albedo-band', id, `unbanded: ART.md §7.2 gives no albedo band for '${family}' (a band there, or a banded family, is needed)`));
      else {
        const [bmin, bmax] = band.albedo;
        const [umed] = percentiles(shownLuminance(baseRgba, { ...params, tint: undefined }), [50]);
        out.push(verdict('albedo-band', id, umed >= bmin && umed <= bmax, `untinted median ${fmt(umed)} vs ${band.label} ${bmin}–${bmax}`));
      }
    }
  } else out.push(fail('albedo-band', id, 'no readable baseColor map'));

  // ------------------------------------------------------------------------ roughness
  if (orm) {
    out.push(roughnessSaturation(id, orm));
    const factor = typeof obj(params.pbr).roughnessFactor === 'number' ? obj(params.pbr).roughnessFactor : 1;
    const rough = Float64Array.from({ length: orm.length / 4 }, (_, i) => (orm[i * 4 + 1] / 255) * factor);
    if (!family) out.push(fail('roughness-band', id, 'no params.family, so no ART.md band can apply'));
    else if (!band?.roughness) out.push(fail('roughness-band', id, `unbanded: ART.md §7.2 gives no roughness for '${family}'`));
    else {
      const [rmed] = percentiles(rough, [50]);
      const [rmin, rmax] = band.roughness;
      out.push(verdict('roughness-band', id, rmed >= rmin && rmed <= rmax, `median ${fmt(rmed, 2)} vs ${band.label} ${rmin}–${rmax}`));
    }
  } else out.push(fail('roughness-band', id, 'no orm map'));

  // ------------------------------------------------------------------------ normals, every stored mip
  if (normal && !normal.float && files.normal) out.push(normalLevelsFinding(id, await decodeLevels(ctx.read(files.normal))));

  // ------------------------------------------------------------------------ tiling and density
  const sizeM = Array.isArray(params.sizeM) ? params.sizeM : typeof params.sizeM === 'number' ? [params.sizeM, params.sizeM] : null;
  if (!sizeM) {
    for (const c of ['tile-seams', 'tile-repetition', 'tile-size']) out.push(fail(c, id, 'no params.sizeM: a library material tiles'));
    out.push(fail('texel-density', id, 'no params.sizeM, so its texel density is unknown'));
  } else {
    const okSize = sizeM.every((s) => TILING.sizesM.includes(s));
    const pattern = base ? patternPx(params.patternM, sizeM, base.width, base.height, params.family) : null;
    const copy = base && baseRgba ? selfCopy(baseRgba, base.width, base.height, pattern && 'px' in pattern ? pattern.px : null) : null;
    const sizeText = `repeats every ${sizeM.join(' × ')} m (ART.md §3: ${TILING.sizesM.join(' or ')} m)`;
    out.push(
      copy
        ? fail('tile-size', id, `${sizeText}, but the texture equals itself shifted by ${copy.fraction} of the tile along ${copy.axis} (mean difference ${fmt(copy.diff, 2)} codes, against ${fmt(copy.reference, 2)} at an unrelated shift): it repeats every ${fmt(sizeM[copy.axis === 'x' ? 0 : 1] * copy.fraction, 2)} m`)
        : verdict('tile-size', id, okSize, sizeText)
    );
    if (base && baseRgba) {
      const seams = [];
      /** @type {[string, Float64Array, number, number][]} */
      const planes = [['baseColor', linearLuminance(baseRgba), base.width, base.height]];
      if (normal && !normal.float) planes.push(['normalX', channelOf(/** @type {Uint8Array} */ (normal.rgba), 0), normal.width, normal.height], ['normalY', channelOf(/** @type {Uint8Array} */ (normal.rgba), 1), normal.width, normal.height]);
      if (orm && ormTex) planes.push(['roughness', channelOf(orm, 1), ormTex.width, ormTex.height]);
      let worst = 0;
      for (const [name, plane, w, h] of planes) {
        const m = seamMetric(plane, w, h);
        worst = Math.max(worst, m.x.z, m.y.z);
        if (!seamOk(m, TILING.seam)) seams.push(`${name} (z ${fmt(Math.max(m.x.z, m.y.z), 1)}, ${fmt(Math.max(m.x.ratio, m.y.ratio), 2)}× p99)`);
      }
      out.push(verdict('tile-seams', id, !seams.length, seams.length ? `wrap seam in ${seams.join(', ')}` : `${planes.length} maps wrap cleanly (worst z ${fmt(worst, 1)})`));
      out.push(repetitionFinding(id, shownLuminance(baseRgba, params), base.width, base.height, patternPx(params.patternM, sizeM, base.width, base.height, params.family)));
      const cls = densityClass(entry);
      if (!cls) out.push(fail('texel-density', id, `no texel-density class: params.tier must be one of ${Object.keys(TEXEL_DENSITY.classes).join(', ')}`));
      else {
        const dens = [base.width / sizeM[0], base.height / sizeM[1]];
        const off = dens.map((d) => d / cls.pxPerM - 1);
        const worstOff = off.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);
        out.push(
          verdict(
            'texel-density',
            id,
            off.every((o) => Math.abs(o) <= TEXEL_DENSITY.tolerance + 1e-9),
            `${fmt(dens[0], 0)} px/m (${base.width} px over ${sizeM[0]} m) is ${pct(worstOff)} from the ${cls.name} class (${cls.pxPerM} px/m ± ${TEXEL_DENSITY.tolerance * 100} %)`
          )
        );
      }
    } else for (const c of ['tile-seams', 'tile-repetition', 'texel-density']) out.push(fail(c, id, 'no readable baseColor map'));
  }

  // ------------------------------------------------------------------------ printed text in the scan
  if (baseRgba && base) out.push(textFinding(id, baseRgba, base.width, base.height, params));
  return out;
}

/**
 * The period in texels of a material's declared pattern (`params.patternM`: the checker cell pair, brick course or
 * plank module in metres, one number or [x, y]), or null when it declares none; a problem when the family is not a
 * patterned one, or the period does not fit a whole number of times, and at least TILING.repetition.minPeriods times,
 * into each side of the tile.
 * @param {unknown} patternM
 * @param {number[]} sizeM
 * @param {number} w
 * @param {number} h
 * @param {unknown} [family]
 * @returns {{ px: [number, number] } | { problem: string } | null}
 */
export function patternPx(patternM, sizeM, w, h, family) {
  if (patternM == null) return null;
  if (!TILING.repetition.patternedFamilies.includes(/** @type {string} */ (family))) return { problem: `params.patternM is only for the patterned families (${TILING.repetition.patternedFamilies.join(', ')}), not '${family}'` };
  const m = Array.isArray(patternM) ? patternM : [patternM, patternM];
  if (m.length !== 2 || !m.every((v) => typeof v === 'number' && v > 0)) return { problem: `params.patternM ${JSON.stringify(patternM)} is not a length in metres (or [x, y])` };
  const px = /** @type {[number, number]} */ ([Math.round((m[0] / sizeM[0]) * w), Math.round((m[1] / sizeM[1]) * h)]);
  const fits = [(m[0] / sizeM[0]) * w, (m[1] / sizeM[1]) * h].every((p, i) => Math.abs(p - px[i]) < 0.01 && px[i] >= 2 && [w, h][i] % px[i] === 0);
  if (!fits) return { problem: `params.patternM ${m.join(' × ')} m is not a whole number of texels that divides the ${w} × ${h} tile` };
  const periods = [w / px[0], h / px[1]];
  if (periods.some((n) => n < TILING.repetition.minPeriods)) return { problem: `params.patternM ${m.join(' × ')} m repeats ${periods.join(' × ')} times across the tile (at least ${TILING.repetition.minPeriods} per side)` };
  return { px };
}

/**
 * The smallest shift (half, then a quarter of the tile, along x or y) under which the base color equals itself
 * within TILING.selfCopy.maxMeanCodes, or null. Shifts that are whole multiples of a declared pattern period are
 * skipped.
 * @param {Uint8Array} rgba
 * @param {number} w
 * @param {number} h
 * @param {[number, number] | null} period
 * @returns {{ axis: 'x' | 'y', fraction: number, diff: number, reference: number } | null}
 */
export function selfCopy(rgba, w, h, period) {
  const meanShift = (/** @type {number} */ dx, /** @type {number} */ dy) => {
    let sum = 0;
    let n = 0;
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const i = (y * w + x) * 4;
        const j = (((y + dy) % h) * w + ((x + dx) % w)) * 4;
        sum += Math.abs(rgba[i] - rgba[j]) + Math.abs(rgba[i + 1] - rgba[j + 1]) + Math.abs(rgba[i + 2] - rgba[j + 2]);
        n += 3;
      }
    }
    return sum / n;
  };
  const C = TILING.selfCopy;
  const ref = { x: meanShift(Math.round(w * 0.37), 0), y: meanShift(0, Math.round(h * 0.37)) };
  let found = null;
  for (const fraction of C.fractions) {
    for (const axis of /** @type {const} */ (['x', 'y'])) {
      const d = Math.round((axis === 'x' ? w : h) * fraction);
      if (d < 1 || (period && d % period[axis === 'x' ? 0 : 1] === 0) || ref[axis] < C.minReferenceCodes) continue;
      const diff = axis === 'x' ? meanShift(d, 0) : meanShift(0, d);
      if (diff <= C.maxMeanCodes && diff <= C.maxShareOfReference * ref[axis]) found = { axis, fraction, diff, reference: ref[axis] };
    }
  }
  return found;
}

/**
 * Removes a declared pattern: every texel minus the mean of the texels at the same position in every period, plus
 * the tile mean. What the pattern repeats cancels; a stain in one period stays.
 * @param {Float64Array} lum
 * @param {number} w
 * @param {number} h
 * @param {[number, number]} period
 */
export function removePattern(lum, w, h, [px, py]) {
  const sum = new Float64Array(px * py);
  const cnt = new Float64Array(px * py);
  let total = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = (y % py) * px + (x % px);
      sum[k] += lum[y * w + x];
      cnt[k]++;
      total += lum[y * w + x];
    }
  }
  const mean = total / (w * h);
  return Float64Array.from(lum, (v, i) => v - sum[((Math.floor(i / w) % py) * px) + ((i % w) % px)] / cnt[((Math.floor(i / w) % py) * px) + ((i % w) % px)] + mean);
}

/**
 * The three repetition scales of TILING.repetition. A material with a declared pattern is measured with the
 * pattern removed (`removePattern`), so a checker, brick bond or plank module is not read as repetition.
 * @param {string} id
 * @param {Float64Array} lum
 * @param {number} w
 * @param {number} h
 * @param {{ px: [number, number] } | { problem: string } | null} [pattern]
 * @returns {Finding}
 */
export function repetitionFinding(id, lum, w, h, pattern = null) {
  if (pattern && 'problem' in pattern) return fail('tile-repetition', id, pattern.problem);
  const plane = pattern ? removePattern(lum, w, h, pattern.px) : lum;
  if (pattern) {
    let sum = 0;
    let sq = 0;
    for (const v of plane) {
      sum += v;
      sq += v * v;
    }
    const mean = sum / plane.length;
    const rel = Math.sqrt(Math.max(0, sq / plane.length - mean * mean)) / (mean || 1e-9);
    if (rel < TILING.repetition.minResidualStd) return fail('tile-repetition', id, `the declared ${pattern.px.join(' × ')} px pattern explains the whole texture: ${fmt(rel * 100, 2)} % left after removing it (at least ${TILING.repetition.minResidualStd * 100} %)`);
  }
  const bad = [];
  const parts = [];
  for (const [blocks, max] of TILING.repetition.levels) {
    const r = blockDeviation(plane, w, h, blocks);
    parts.push(`${blocks}×${blocks} ${pct(r.worst)}`);
    if (r.worst > max) bad.push(`${blocks}×${blocks} block (${r.at.join(', ')}) ${pct(r.worst)} from the tile mean (limit ${pct(max)})`);
  }
  const note = pattern ? ` (its ${pattern.px.join(' × ')} px pattern removed)` : '';
  return verdict('tile-repetition', id, !bad.length, bad.length ? `${bad.join('; ')}${note}` : `largest block deviation ${parts.join(', ')}${note}`);
}

/**
 * @param {string} id
 * @param {Uint8Array} orm  RGBA with roughness in green
 * @returns {Finding}
 */
export function roughnessSaturation(id, orm) {
  const n = orm.length / 4;
  let clipped = 0;
  for (let i = 0; i < n; i++) {
    const g = orm[i * 4 + 1];
    if (g <= ROUGHNESS_SATURATION.low || g >= ROUGHNESS_SATURATION.high) clipped++;
  }
  const share = n ? clipped / n : 1;
  return verdict('roughness-saturation', id, n > 0 && share <= ROUGHNESS_SATURATION.maxFraction, `${fmt(share * 100, 2)} % of texels clipped (limit ${ROUGHNESS_SATURATION.maxFraction * 100} %)`);
}

/**
 * The texels of an RGBA image a mask keeps (UV coverage of an atlas), as a packed RGBA array.
 * @param {Uint8Array} rgba
 * @param {Uint8Array | null} [mask]
 */
export function masked(rgba, mask) {
  if (!mask) return rgba;
  let n = 0;
  for (let i = 0; i < mask.length; i++) n += mask[i];
  const out = new Uint8Array(n * 4);
  for (let i = 0, j = 0; i < mask.length; i++) if (mask[i]) out.set(rgba.subarray(i * 4, i * 4 + 4), 4 * j++);
  return out;
}

/**
 * @param {string} id
 * @param {Uint8Array} rgba  texels to judge (masked to the UV islands for atlases)
 * @returns {Finding}
 */
export function normalFinding(id, rgba) {
  if (!rgba.length) return fail('normal-length', id, 'no texels inside the UV islands');
  const st = normalStats(rgba);
  let back = 0;
  for (let i = 2; i < rgba.length; i += 4) if (rgba[i] < 127.5) back++;
  const share = back / (rgba.length / 4);
  const ok = st.lengthErrMean <= NORMALS.meanLengthError && st.lengthErrP99 <= NORMALS.p99LengthError && share <= NORMALS.maxBackFacingShare;
  return verdict(
    'normal-length',
    id,
    ok,
    `length error mean ${fmt(st.lengthErrMean, 4)} / p99 ${fmt(st.lengthErrP99, 4)} (limits ${NORMALS.meanLengthError} / ${NORMALS.p99LengthError}); ${fmt(share * 100, 3)} % back-facing (limit ${NORMALS.maxBackFacingShare * 100} %)`
  );
}

/**
 * Text-like rows against the lines the entry declares in `params.labelText` (none by default): no more rows than
 * lines, and each row's glyph count within ±30 % of a declared line's letters.
 * @param {string} id
 * @param {Uint8Array} rgba
 * @param {number} w
 * @param {number} h
 * @param {Record<string, any>} params
 * @returns {Finding}
 */
export function textFinding(id, rgba, w, h, params) {
  const rows = findTextRows(rgba, w, h, TEXT);
  const raw = params.labelText;
  const lines = (Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []).filter((l) => typeof l === 'string' && l.trim());
  const letters = lines.map((l) => l.replace(/\s/g, '').length);
  const free = [...letters];
  const unexplained = rows.filter((r) => {
    const k = free.findIndex((n) => Math.abs(r.glyphs - n) <= 0.3 * n);
    if (k < 0) return true;
    free.splice(k, 1);
    return false;
  });
  const where = unexplained.slice(0, 3).map((r) => `${r.glyphs} glyphs at (${r.x}, ${r.y}) ${r.w}×${r.h} px`);
  const declared = lines.length ? ` (${lines.length} declared label line(s))` : '';
  return verdict('text-artifacts', id, unexplained.length === 0, unexplained.length ? `${unexplained.length} text-like glyph row(s) no declared label line explains${declared}: ${where.join('; ')}` : `${rows.length} text-like row(s), all declared${declared}`);
}

/**
 * Tiled single textures (`kind: 'texture'` with params.sizeM): the wrap seam on every channel.
 * @param {AssetEntry} entry
 * @param {Context} ctx
 * @returns {Promise<Finding[]>}
 */
export async function checkTexture(entry, ctx) {
  const params = obj(entry.params);
  if (!params.sizeM) return [skip('tile-seams', entry.id, 'not tiled (no params.sizeM)')];
  if (!ctx.exists(entry.path)) return [fail('tile-seams', entry.id, `${entry.path} is missing`)];
  const t = await ctx.texture(entry.path);
  if (t.float) return [skip('tile-seams', entry.id, 'float texture')];
  const rgba = /** @type {Uint8Array} */ (t.rgba);
  const bad = [];
  for (const [c, name] of ['r', 'g', 'b', 'a'].entries()) {
    const m = seamMetric(channelOf(rgba, c), t.width, t.height);
    if (!seamOk(m, TILING.seam)) bad.push(`${name} (z ${fmt(Math.max(m.x.z, m.y.z), 1)})`);
  }
  return [verdict('tile-seams', entry.id, !bad.length, bad.length ? `wrap seam in channel ${bad.join(', ')}` : '4 channels wrap cleanly')];
}

export { SRGB_TO_LINEAR };
