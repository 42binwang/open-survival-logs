// @ts-check
// Icons (`kind: 'icon'`, files keyed by size): every size present, square, with a transparent backdrop; no text-like
// glyph rows; and within a category every pair of icons perceptually distinct, by a 64-bit DCT hash of the
// luminance over mid-grey or by the CIEDE2000 distance of the mean opaque colour, which must hold under protanopia
// and deuteranopia too. The category is the config category of the item bound to the icon; `params.category` may
// only narrow it (`<config category>/<sub>`).
import { ICONS } from './standard.mjs';
import { exempt, fail, fmt, verdict } from './findings.mjs';
import { SRGB_TO_LINEAR, linearToLab } from './images.mjs';
import { textFinding } from './materials.mjs';

/** @typedef {import('./findings.mjs').Finding} Finding */
/** @typedef {import('./findings.mjs').Context} Context */
/** @typedef {import('../../src/contracts/assets.js').AssetEntry} AssetEntry */

const N = 32;
const COS = Float64Array.from({ length: N * N }, (_, i) => Math.cos(((2 * (i % N) + 1) * Math.floor(i / N) * Math.PI) / (2 * N)));

/**
 * The 64-bit DCT perceptual hash (32 × 32 box-downsampled luminance, the 8 × 8 lowest frequencies against the median
 * of the 63 AC terms) of an RGBA image composited over mid-grey.
 * @param {Uint8Array} rgba
 * @param {number} w
 * @param {number} h
 * @returns {Uint8Array} 64 bits, one per byte
 */
export function perceptualHash(rgba, w, h) {
  const small = new Float64Array(N * N);
  const cnt = new Float64Array(N * N);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(N - 1, Math.floor((y * N) / h));
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = rgba[i + 3] / 255;
      const l = 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
      const k = sy * N + Math.min(N - 1, Math.floor((x * N) / w));
      small[k] += l * a + 128 * (1 - a);
      cnt[k]++;
    }
  }
  for (let k = 0; k < small.length; k++) small[k] /= cnt[k] || 1;
  const coef = new Float64Array(64);
  for (let v = 0; v < 8; v++) {
    for (let u = 0; u < 8; u++) {
      let s = 0;
      for (let y = 0; y < N; y++) {
        const cy = COS[v * N + y];
        for (let x = 0; x < N; x++) s += small[y * N + x] * COS[u * N + x] * cy;
      }
      coef[v * 8 + u] = s;
    }
  }
  const ac = Array.from(coef.subarray(1)).sort((a, b) => a - b);
  const median = (ac[31] + ac[32]) / 2;
  return Uint8Array.from(coef, (c) => (c > median ? 1 : 0));
}

/** @param {Uint8Array} a @param {Uint8Array} b */
export const hammingDistance = (a, b) => a.reduce((d, bit, i) => d + (bit !== b[i] ? 1 : 0), 0);

/**
 * Colour-vision deficiency in linear RGB, full severity (Machado, Oliveira & Fernandes 2009, table 1).
 * @type {Readonly<Record<'protanopia' | 'deuteranopia', number[][]>>}
 */
export const CVD = Object.freeze({
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
});

/**
 * Mean linear colour of the opaque texels.
 * @param {Uint8Array} rgba
 */
export function meanOpaqueLinear(rgba) {
  const s = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    for (let c = 0; c < 3; c++) s[c] += SRGB_TO_LINEAR[rgba[i + c]];
    n++;
  }
  return s.map((v) => v / (n || 1));
}

/**
 * Mean colour of the opaque texels in CIELAB, as seen normally or under a simulated deficiency.
 * @param {Uint8Array} rgba
 * @param {keyof typeof CVD} [vision]
 */
export function meanOpaqueLab(rgba, vision) {
  const lin = meanOpaqueLinear(rgba);
  if (!vision) return linearToLab(lin);
  const m = CVD[vision];
  return linearToLab(m.map((row) => Math.min(1, Math.max(0, row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]))));
}

/**
 * CIEDE2000 colour difference (Sharma, Wu & Dalal 2005), kL = kC = kH = 1.
 * @param {number[]} lab1
 * @param {number[]} lab2
 */
export function deltaE(lab1, lab2) {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hue = (/** @type {number} */ b, /** @type {number} */ a) => (a === 0 && b === 0 ? 0 : ((Math.atan2(b, a) / rad) + 360) % 360);
  const h1p = hue(b1, a1p);
  const h2p = hue(b2, a2p);
  const dL = L2 - L1;
  const dC = C2p - C1p;
  let dh = 0;
  if (C1p * C2p !== 0) {
    dh = h2p - h1p;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh / 2) * rad);
  const Lm = (L1 + L2) / 2;
  const Cmp = (C1p + C2p) / 2;
  let hm = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hm += h1p + h2p < 360 ? 360 : -360;
    hm /= 2;
  }
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hm - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2);
  const Sc = 1 + 0.045 * Cmp;
  const Sh = 1 + 0.015 * Cmp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}

/**
 * Checks the icon entries of all manifests together (distinctness compares icons across entries).
 * @param {AssetEntry[]} icons
 * @param {Context} ctx
 * @returns {Promise<Finding[]>}
 */
export async function checkIcons(icons, ctx) {
  /** @type {Finding[]} */
  const out = [];
  /** @type {{ id: string, category: string, hash: Uint8Array, lab: number[], cvd: number[][] }[]} */
  const sigs = [];
  for (const entry of icons) {
    const files = entry.files || {};
    const problems = [];
    /** @type {{ rgba: Uint8Array, w: number, h: number } | null} */
    let largest = null;
    for (const size of ICONS.sizes) {
      const p = files[String(size)];
      if (!p) {
        problems.push(`no ${size} px file`);
        continue;
      }
      if (!ctx.exists(p)) {
        problems.push(`${p} is missing`);
        continue;
      }
      const t = await ctx.texture(p);
      if (t.float) {
        problems.push(`${p} is not an 8-bit image`);
        continue;
      }
      const rgba = /** @type {Uint8Array} */ (t.rgba);
      if (t.width !== size || t.height !== size) problems.push(`${p} is ${t.width}×${t.height}, not ${size}×${size}`);
      let clear = 0;
      for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 8) clear++;
      const share = clear / (rgba.length / 4);
      if (share < ICONS.minTransparent) problems.push(`${size} px: only ${fmt(share * 100, 1)} % transparent (needs a backdrop-free alpha, ≥ ${ICONS.minTransparent * 100} %)`);
      if (!largest || t.width > largest.w) largest = { rgba, w: t.width, h: t.height };
    }
    out.push(verdict('icon-sizes', entry.id, !problems.length, problems.length ? problems.join('; ') : `${ICONS.sizes.join(' / ')} px with alpha`));
    if (!largest) {
      out.push(fail('text-artifacts', entry.id, 'no readable icon file'));
      out.push(fail('icon-distinct', entry.id, 'no readable icon file'));
      continue;
    }
    out.push(textFinding(entry.id, largest.rgba, largest.w, largest.h, /** @type {Record<string, any>} */ (entry.params || {})));
    const cat = categoryOf(entry, ctx);
    if ('problem' in cat) {
      out.push(fail('icon-distinct', entry.id, cat.problem));
      continue;
    }
    const rgba = largest.rgba;
    sigs.push({ id: entry.id, category: cat.category, hash: perceptualHash(rgba, largest.w, largest.h), lab: meanOpaqueLab(rgba), cvd: [meanOpaqueLab(rgba, 'protanopia'), meanOpaqueLab(rgba, 'deuteranopia')] });
  }
  /** @type {Map<string, typeof sigs>} */
  const byCat = new Map();
  for (const s of sigs) byCat.set(s.category, [...(byCat.get(s.category) || []), s]);
  for (const s of sigs) {
    const peers = (byCat.get(s.category) || []).filter((o) => o !== s);
    if (!peers.length) {
      out.push(exempt('icon-distinct', s.id, `the only icon in category '${s.category}'`));
      continue;
    }
    const close = peers
      .map((o) => ({ id: o.id, bits: hammingDistance(s.hash, o.hash), dE: deltaE(s.lab, o.lab), cvd: Math.min(...s.cvd.map((c, k) => deltaE(c, o.cvd[k]))) }))
      .filter((o) => o.bits < ICONS.minHashBits && (o.dE < ICONS.minColorDeltaE || o.cvd < ICONS.minCvdDeltaE));
    const nearest = peers.map((o) => hammingDistance(s.hash, o.hash)).reduce((a, b) => Math.min(a, b), 64);
    out.push(
      verdict(
        'icon-distinct',
        s.id,
        !close.length,
        close.length
          ? `too close to ${close.map((c) => `${c.id} (${c.bits} bits, ΔE2000 ${fmt(c.dE, 1)}, colour-blind ${fmt(c.cvd, 1)})`).join(', ')} in '${s.category}' (needs ≥ ${ICONS.minHashBits} bits, or ΔE2000 ≥ ${ICONS.minColorDeltaE} and ≥ ${ICONS.minCvdDeltaE} under protanopia and deuteranopia)`
          : `distinct from ${peers.length} icon(s) in '${s.category}' (nearest hash ${nearest} bits)`
      )
    );
  }
  return out;
}

/**
 * The category an icon is grouped in: the config category of the items bound to it, narrowed by `params.category`
 * when that reads `<config category>/<sub>` (or repeats it, by name or numeric config code). An unbound icon,
 * bindings in two categories, or a declared category that is not a narrowing are problems.
 * @param {AssetEntry} entry
 * @param {Context} ctx
 * @returns {{ category: string } | { problem: string }}
 */
export function categoryOf(entry, ctx) {
  const cats = new Set();
  /** @type {number | null} */
  let code = null;
  for (const b of ctx.bindings.values()) {
    if (b.asset !== entry.id) continue;
    const cat = ctx.configCategory(b.cfg);
    cats.add(cat || `unknown config id ${b.cfg}`);
    code = ctx.configCategoryCode?.(b.cfg) ?? code;
  }
  if (!cats.size) return { problem: 'not bound to a config item, so it has no category to be distinct within' };
  if (cats.size > 1) return { problem: `bound to items of ${cats.size} config categories (${[...cats].join(', ')})` };
  const bound = /** @type {string} */ ([...cats][0]);
  const declared = /** @type {Record<string, any>} */ (entry.params || {}).category;
  if (declared == null || declared === bound || (code != null && String(declared) === String(code))) return { category: bound };
  if (typeof declared === 'string' && declared.startsWith(`${bound}/`) && declared.length > bound.length + 1) return { category: declared };
  return { problem: `params.category '${declared}' does not narrow the config category '${bound}' (use '${bound}/<sub>')` };
}
