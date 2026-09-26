// @ts-check
// Image operations for the icon set (WP-P0-12): linear-light Lanczos downsampling with premultiplied alpha, "over"
// compositing, the soft drop shadow under each icon, and a 3 x 5 pixel digit font for the contact-sheet captions.
// Pure arithmetic on 8-bit RGBA images (tools/lib/png.mjs), so results repeat exactly.

/** @typedef {import('../../lib/png.mjs').Image} Image */

const TO_LINEAR = Float64Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

/** @param {number} v linear 0..1 */
function toSrgb8(v) {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
}

/** @param {number} x */
function lanczos3(x) {
  if (x === 0) return 1;
  if (Math.abs(x) >= 3) return 0;
  const px = Math.PI * x;
  return (3 * Math.sin(px) * Math.sin(px / 3)) / (px * px);
}

/**
 * Filter taps for resampling n samples to m (m < n): for each output sample, the first input index and weights.
 * @param {number} n @param {number} m
 */
function taps(n, m) {
  const scale = n / m;
  const support = 3 * scale;
  /** @type {{ start: number, w: Float64Array }[]} */
  const out = [];
  for (let i = 0; i < m; i++) {
    const centre = (i + 0.5) * scale - 0.5;
    const start = Math.ceil(centre - support);
    const end = Math.floor(centre + support);
    const w = new Float64Array(end - start + 1);
    let sum = 0;
    for (let k = start; k <= end; k++) {
      const v = lanczos3((k - centre) / scale);
      w[k - start] = v;
      sum += v;
    }
    for (let k = 0; k < w.length; k++) w[k] /= sum;
    out.push({ start, w });
  }
  return out;
}

/**
 * Downsamples an RGBA image in linear light with premultiplied alpha (Lanczos 3); pixels outside the image are
 * transparent, which is what an icon's border is.
 * @param {Image} img @param {number} size  output width and height
 * @returns {Image}
 */
export function downsample(img, size) {
  const { width: W, height: H, data } = img;
  if (img.channels !== 4) throw new Error('downsample expects RGBA');
  const src = new Float64Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const a = data[i * 4 + 3] / 255;
    src[i * 4] = TO_LINEAR[data[i * 4]] * a;
    src[i * 4 + 1] = TO_LINEAR[data[i * 4 + 1]] * a;
    src[i * 4 + 2] = TO_LINEAR[data[i * 4 + 2]] * a;
    src[i * 4 + 3] = a;
  }
  const tx = taps(W, size);
  const ty = taps(H, size);
  const mid = new Float64Array(size * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < size; x++) {
      const { start, w } = tx[x];
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < w.length; k++) {
        const sx = start + k;
        if (sx < 0 || sx >= W) continue;
        const o = (y * W + sx) * 4;
        r += src[o] * w[k];
        g += src[o + 1] * w[k];
        b += src[o + 2] * w[k];
        a += src[o + 3] * w[k];
      }
      const o = (y * size + x) * 4;
      mid[o] = r;
      mid[o + 1] = g;
      mid[o + 2] = b;
      mid[o + 3] = a;
    }
  }
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const { start, w } = ty[y];
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < w.length; k++) {
        const sy = start + k;
        if (sy < 0 || sy >= H) continue;
        const o = (sy * size + x) * 4;
        r += mid[o] * w[k];
        g += mid[o + 1] * w[k];
        b += mid[o + 2] * w[k];
        a += mid[o + 3] * w[k];
      }
      a = Math.max(0, Math.min(1, a));
      const o = (y * size + x) * 4;
      const a8 = Math.round(a * 255);
      out[o + 3] = a8;
      if (a8 === 0) continue;
      const k = 1 / a;
      out[o] = toSrgb8(Math.max(0, Math.min(1, r * k)));
      out[o + 1] = toSrgb8(Math.max(0, Math.min(1, g * k)));
      out[o + 2] = toSrgb8(Math.max(0, Math.min(1, b * k)));
    }
  }
  return { width: size, height: size, channels: 4, data: out };
}

/**
 * The canonical form of a straight-alpha image: colour zeroed where it is fully transparent (renderers leave
 * arbitrary values there), so equal-looking images are equal bytes.
 * @param {Image} img
 * @returns {Image}
 */
export function canonical(img) {
  const data = Uint8Array.from(img.data);
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] === 0) data[i] = data[i + 1] = data[i + 2] = 0;
  return { ...img, data };
}

/**
 * Composites `top` over `base` (both straight-alpha sRGB RGBA, same size) in sRGB space, as a browser does.
 * @param {Image} base @param {Image} top
 * @returns {Image}
 */
export function over(base, top) {
  if (base.width !== top.width || base.height !== top.height) throw new Error('over: sizes differ');
  const n = base.width * base.height;
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const ta = top.data[i * 4 + 3] / 255;
    const ba = base.data[i * 4 + 3] / 255;
    const oa = ta + ba * (1 - ta);
    out[i * 4 + 3] = Math.round(oa * 255);
    if (oa <= 0) continue;
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round((top.data[i * 4 + c] * ta + base.data[i * 4 + c] * ba * (1 - ta)) / oa);
  }
  return { width: base.width, height: base.height, channels: 4, data: out };
}

/**
 * Flattens an RGBA image onto an opaque colour.
 * @param {Image} img @param {[number, number, number]} bg sRGB 0..255
 * @returns {Image} RGB
 */
export function flatten(img, bg) {
  const n = img.width * img.height;
  const out = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = img.data[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round(img.data[i * 4 + c] * a + bg[c] * (1 - a));
  }
  return { width: img.width, height: img.height, channels: 3, data: out };
}

// ------------------------------------------------------------------------------------------ drop shadow

/**
 * The icon's soft contact shadow, the source icons' convention (a darker patch below-right of every item on the
 * slot): the alpha moved by (dx, dy), blurred by a Gaussian of `sigma`, black at `opacity`. Sizes are shares of the
 * image side.
 * @param {Image} img straight-alpha RGBA
 * @param {{ dx: number, dy: number, sigma: number, opacity: number }} s
 * @returns {Image} black RGBA layer to composite under the icon
 */
export function dropShadow(img, s) {
  const { width: w, height: h } = img;
  const dx = Math.round(s.dx * w);
  const dy = Math.round(s.dy * h);
  const sig = s.sigma * w;
  const r = Math.ceil(3 * sig);
  const k = Float64Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sig * sig)));
  const ks = k.reduce((a, b) => a + b, 0);
  for (let i = 0; i < k.length; i++) k[i] /= ks;
  const a = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x - dx;
    const sy = y - dy;
    if (sx >= 0 && sy >= 0 && sx < w && sy < h) a[y * w + x] = img.data[(sy * w + sx) * 4 + 3] / 255;
  }
  const t = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    for (let i = -r; i <= r; i++) {
      const X = x + i;
      if (X >= 0 && X < w) v += a[y * w + X] * k[i + r];
    }
    t[y * w + x] = v;
  }
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    for (let i = -r; i <= r; i++) {
      const Y = y + i;
      if (Y >= 0 && Y < h) v += t[Y * w + x] * k[i + r];
    }
    data[(y * w + x) * 4 + 3] = Math.round(Math.min(1, v) * s.opacity * 255);
  }
  return { width: w, height: h, channels: 4, data };
}

// ------------------------------------------------------------------------------------------ digits for captions

const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];

/**
 * Draws a number in a 3 x 5 pixel font (each font pixel `scale` px) onto an RGB or RGBA image.
 * @param {Image} img @param {string} text digits only @param {number} x @param {number} y @param {number} scale @param {number[]} rgb
 */
export function drawDigits(img, text, x, y, scale, rgb) {
  let cx = Math.round(x);
  y = Math.round(y);
  for (const ch of text) {
    const g = DIGITS[Number(ch)];
    if (g === undefined) throw new Error(`drawDigits: '${ch}' is not a digit`);
    for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 3; gx++) {
      if (g[gy * 3 + gx] !== '1') continue;
      for (let py = 0; py < scale; py++) for (let px = 0; px < scale; px++) {
        const X = cx + gx * scale + px;
        const Y = y + gy * scale + py;
        if (X < 0 || Y < 0 || X >= img.width || Y >= img.height) continue;
        const o = (Y * img.width + X) * img.channels;
        for (let c = 0; c < 3; c++) img.data[o + c] = rgb[c];
        if (img.channels === 4) img.data[o + 3] = 255;
      }
    }
    cx += 4 * scale;
  }
}

/** Width in pixels of a number drawn by drawDigits. @param {string} text @param {number} scale */
export const digitsWidth = (text, scale) => text.length * 4 * scale - scale;
