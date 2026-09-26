// @ts-check
// WCAG 2.x contrast on display colours (docs/UI.md §2.4). The kit's rule: normal text ≥ 4.5 : 1 against the colour it
// actually sits on, large text (≥ 24 px, or ≥ 18.66 px at weight ≥ 700) ≥ 3 : 1; disabled controls are exempt.
// Browsers blend CSS alpha in sRGB, so `over` does too.

export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;

/** @typedef {{ r: number, g: number, b: number, a: number }} RGBA  channels 0 … 255, alpha 0 … 1 */

/**
 * Parses `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb(r g b / a)` and `rgba(r, g, b, a)`.
 * @param {string} css
 * @returns {RGBA}
 */
export function parseColor(css) {
  const s = css.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    const n = (/** @type {number} */ i) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  const fn = /^rgba?\(([^)]+)\)$/.exec(s);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean);
    const ch = (/** @type {string} */ p) => (p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p));
    const alpha = parts[3] == null ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    return { r: ch(parts[0]), g: ch(parts[1]), b: ch(parts[2]), a: alpha };
  }
  throw new Error(`unsupported colour '${css}'`);
}

/** @param {number} c  0 … 255 */
function linear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/**
 * Relative luminance of an opaque colour.
 * @param {RGBA} c
 */
export function luminance(c) {
  return 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b);
}

/**
 * `fg` composited over an opaque `bg`, as the browser blends it.
 * @param {RGBA} fg
 * @param {RGBA} bg
 * @returns {RGBA}
 */
export function over(fg, bg) {
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}

/**
 * Contrast ratio of two opaque colours, 1 … 21.
 * @param {RGBA} a
 * @param {RGBA} b
 */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * WCAG large text: 24 px and up, or 18.66 px (14 pt) and up in bold.
 * @param {number} px
 * @param {number} weight
 */
export function isLargeText(px, weight) {
  return px >= 24 || (px >= 18.66 && weight >= 700);
}

/**
 * The AA threshold for a text run.
 * @param {number} px
 * @param {number} weight
 */
export function requiredContrast(px, weight) {
  return isLargeText(px, weight) ? AA_LARGE : AA_NORMAL;
}

/**
 * @param {RGBA} c
 * @returns {string} `#rrggbb`
 */
export function toHex(c) {
  return `#${[c.r, c.g, c.b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
}

// ---- CIELAB (D65), for darkening a measured fill without shifting its hue --------------------------------------
const D65 = [0.95047, 1, 1.08883];
/** @param {number} t */
const labF = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (t * 24389) / 27 / 116 + 16 / 116);
/** @param {number} t */
const labFInv = (t) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
/** @param {number} l  linear 0 … 1 */
const encode = (l) => {
  const c = Math.min(1, Math.max(0, l));
  return 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
};

/** @param {RGBA} c @returns {{ L: number, a: number, b: number }} */
export function toLab(c) {
  const [r, g, b] = [linear(c.r), linear(c.g), linear(c.b)];
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / D65[0];
  const y = (0.2126729 * r + 0.7151522 * g + 0.072175 * b) / D65[1];
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / D65[2];
  return { L: 116 * labF(y) - 16, a: 500 * (labF(x) - labF(y)), b: 200 * (labF(y) - labF(z)) };
}

/** @param {{ L: number, a: number, b: number }} lab @returns {RGBA} */
export function fromLab(lab) {
  const fy = (lab.L + 16) / 116;
  const x = labFInv(fy + lab.a / 500) * D65[0];
  const y = labFInv(fy) * D65[1];
  const z = labFInv(fy - lab.b / 200) * D65[2];
  return {
    r: encode(3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
    g: encode(-0.969266 * x + 1.8760108 * y + 0.041556 * z),
    b: encode(0.0556434 * x - 0.2040259 * y + 1.0572252 * z),
    a: 1,
  };
}

/**
 * The lightest version of a measured `fill` (same a*, b*; L* lowered in 0.05 steps) on which `label` reaches
 * `target`, so a source colour that falls just short of AA keeps its hue (docs/UI.md §2.3). Returns the fill itself
 * when it already passes.
 * @param {string} fill
 * @param {string} label
 * @param {number} [target]
 * @returns {{ hex: string, dL: number, ratio: number }}
 */
export function darkenToContrast(fill, label, target = AA_NORMAL) {
  const lab = toLab(parseColor(fill));
  const text = parseColor(label);
  for (let dL = 0; dL <= 40; dL += 0.05) {
    const c = fromLab({ L: lab.L - dL, a: lab.a, b: lab.b });
    const q = { r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b), a: 1 };
    const ratio = contrast(q, text);
    if (ratio >= target) return { hex: toHex(q), dL: Math.round(dL * 100) / 100, ratio: Math.round(ratio * 100) / 100 };
  }
  throw new Error(`darkenToContrast: ${fill} cannot reach ${target} : 1 against ${label}`);
}
