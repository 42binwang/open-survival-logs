// @ts-check
// A small deterministic vector rasteriser for the icon label art (WP-P0-12): closed contours filled by scanline
// with exact horizontal and 5-row vertical antialiasing, solid and gradient paints, clip masks, and a material mask
// per fill (metalness, roughness, clear coat) that the Blender label shader reads. Coordinates are millimetres on
// the label, y down; the canvas maps them to pixels at `ppmm`.

/** @typedef {[number, number]} Pt */
/** @typedef {Pt[]} Contour */
/** @typedef {{ metal?: number, rough?: number, coat?: number }} Finish */
/** @typedef {string | { hex: string, alpha?: number } | Gradient} Paint */
/** @typedef {{ kind: 'linear' | 'radial', x0: number, y0: number, x1: number, y1: number, r?: number, stops: [number, string][] }} Gradient */

const SUB_ROWS = 5;

/** @param {string} hex @returns {[number, number, number]} sRGB 0..1 */
export function rgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`bad colour ${hex}`);
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Mulberry32: a seeded PRNG returning [0, 1). @param {number} seed */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------------------------------ shapes (contours in mm)

/** @param {number} cx @param {number} cy @param {number} rx @param {number} ry @param {number} [rotDeg] @param {number} [n] @returns {Contour[]} */
export function ellipse(cx, cy, rx, ry, rotDeg = 0, n = 0) {
  const k = n || Math.max(32, Math.min(360, Math.ceil(Math.max(rx, ry) * 6)));
  const a = (rotDeg * Math.PI) / 180;
  const [ca, sa] = [Math.cos(a), Math.sin(a)];
  /** @type {Contour} */
  const c = [];
  for (let i = 0; i < k; i++) {
    const t = (2 * Math.PI * i) / k;
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    c.push([cx + x * ca - y * sa, cy + x * sa + y * ca]);
  }
  return [c];
}

/** @param {number} cx @param {number} cy @param {number} r */
export const circle = (cx, cy, r) => ellipse(cx, cy, r, r);

/** A rounded rectangle. @param {number} x @param {number} y @param {number} w @param {number} h @param {number} [r] @returns {Contour[]} */
export function rect(x, y, w, h, r = 0) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (r === 0) return [[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]];
  /** @type {Contour} */
  const c = [];
  const seg = Math.max(4, Math.ceil(r * 2));
  const corners = [
    [x + w - r, y + r, -Math.PI / 2],
    [x + w - r, y + h - r, 0],
    [x + r, y + h - r, Math.PI / 2],
    [x + r, y + r, Math.PI],
  ];
  for (const [cx, cy, a0] of corners) for (let i = 0; i <= seg; i++) {
    const a = a0 + (Math.PI / 2) * (i / seg);
    c.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return [c];
}

/** @param {Pt[]} pts @returns {Contour[]} */
export const poly = (pts) => [pts.map((p) => /** @type {Pt} */ ([p[0], p[1]]))];

/** An n-pointed star. @param {number} cx @param {number} cy @param {number} r1 @param {number} r2 @param {number} n @param {number} [rotDeg] */
export function star(cx, cy, r1, r2, n, rotDeg = -90) {
  /** @type {Contour} */
  const c = [];
  for (let i = 0; i < 2 * n; i++) {
    const a = ((rotDeg + (180 * i) / n) * Math.PI) / 180;
    const r = i % 2 ? r2 : r1;
    c.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return [c];
}

/** A ring: outer contour and a reversed inner one (a hole under the nonzero rule). @param {number} cx @param {number} cy @param {number} r @param {number} w */
export function ring(cx, cy, r, w) {
  const [outer] = circle(cx, cy, r + w / 2);
  const [inner] = circle(cx, cy, Math.max(0.01, r - w / 2));
  return [outer, inner.slice().reverse()];
}

/** Reverses contours (to cut holes in a shape drawn in the same fill). @param {Contour[]} cs */
export const hole = (cs) => cs.map((c) => c.slice().reverse());

/**
 * A stroked polyline: a quad per segment and a disc per joint, all counter-clockwise, so the nonzero rule unions them.
 * @param {Pt[]} pts @param {number} w @param {boolean} [closed]
 * @returns {Contour[]}
 */
export function stroke(pts, w, closed = false) {
  const h = w / 2;
  /** @type {Contour[]} */
  const out = [];
  const n = pts.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    const nx = (-dy / len) * h;
    const ny = (dx / len) * h;
    out.push(ccw([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]));
  }
  for (let i = 0; i < n; i++) out.push(ccw(ellipse(pts[i][0], pts[i][1], h, h, 0, Math.max(12, Math.ceil(h * 12)))[0]));
  return out;
}

/** @param {Contour} c */
function area(c) {
  let s = 0;
  for (let i = 0; i < c.length; i++) {
    const [x0, y0] = c[i];
    const [x1, y1] = c[(i + 1) % c.length];
    s += x0 * y1 - x1 * y0;
  }
  return s / 2;
}

/** @param {Contour} c */
const ccw = (c) => (area(c) < 0 ? c.slice().reverse() : c);

/** Samples a cubic Bézier. @param {Pt} p0 @param {Pt} p1 @param {Pt} p2 @param {Pt} p3 @param {number} [n] @returns {Pt[]} */
export function cubic(p0, p1, p2, p3, n = 24) {
  /** @type {Pt[]} */
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
}

/** A closed path through Bézier segments: start, then [c1, c2, end] triples. @param {Pt} start @param {[Pt, Pt, Pt][]} segs @returns {Contour[]} */
export function bezierShape(start, segs) {
  /** @type {Pt[]} */
  let pts = [start];
  let p = start;
  for (const [c1, c2, e] of segs) {
    pts = pts.concat(cubic(p, c1, c2, e).slice(1));
    p = e;
  }
  return [pts];
}

/** A sine wave polyline. @param {number} x0 @param {number} x1 @param {number} y @param {number} amp @param {number} period @param {number} [phase] */
export function wave(x0, x1, y, amp, period, phase = 0) {
  /** @type {Pt[]} */
  const pts = [];
  const n = Math.max(8, Math.ceil(Math.abs(x1 - x0) / (period / 16)));
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    pts.push([x, y + amp * Math.sin(((x - x0) / period) * 2 * Math.PI + phase)]);
  }
  return pts;
}

/**
 * The area between a wave and a straight edge at y = edge.
 * @param {number} x0 @param {number} x1 @param {number} y @param {number} amp @param {number} period @param {number} phase @param {number} edge
 * @returns {Contour[]}
 */
export function waveBand(x0, x1, y, amp, period, phase, edge) {
  const top = wave(x0, x1, y, amp, period, phase);
  return [[...top, [x1, edge], [x0, edge]]];
}

/** Moves, rotates (degrees, about the origin before moving) and scales contours. @param {Contour[]} cs @param {{ x?: number, y?: number, rot?: number, s?: number, sx?: number, sy?: number }} t */
export function place(cs, t) {
  const a = ((t.rot || 0) * Math.PI) / 180;
  const [ca, sa] = [Math.cos(a), Math.sin(a)];
  const sx = (t.sx ?? 1) * (t.s ?? 1);
  const sy = (t.sy ?? 1) * (t.s ?? 1);
  return cs.map((c) => {
    const m = c.map(([x, y]) => /** @type {Pt} */ ([(x * sx) * ca - (y * sy) * sa + (t.x || 0), (x * sx) * sa + (y * sy) * ca + (t.y || 0)]));
    return sx * sy < 0 ? m.reverse() : m;
  });
}

// ------------------------------------------------------------------------------------------ canvas

export class Canvas {
  /**
   * @param {number} wMm @param {number} hMm @param {number} ppmm pixels per millimetre
   * @param {{ bg?: string | null, finish?: Finish }} [opts]  bg null = transparent
   */
  constructor(wMm, hMm, ppmm, opts = {}) {
    this.ppmm = ppmm;
    this.wMm = wMm;
    this.hMm = hMm;
    this.w = Math.round(wMm * ppmm);
    this.h = Math.round(hMm * ppmm);
    const n = this.w * this.h;
    this.color = new Float32Array(n * 3);
    this.alpha = new Float32Array(n);
    this.mask = new Float32Array(n * 3);
    /** @type {Float32Array[]} */
    this.clips = [];
    const f = { metal: 0, rough: 0.5, coat: 0, ...(opts.finish || {}) };
    for (let i = 0; i < n; i++) {
      this.mask[i * 3] = f.metal;
      this.mask[i * 3 + 1] = f.rough;
      this.mask[i * 3 + 2] = f.coat;
    }
    if (opts.bg !== null && opts.bg !== undefined) {
      const c = rgb(opts.bg);
      for (let i = 0; i < n; i++) {
        this.color.set(c, i * 3);
        this.alpha[i] = 1;
      }
    }
    /** default finish for fills */
    this.finish = f;
  }

  /**
   * Coverage of contours (nonzero rule) over the pixel rows/columns they touch.
   * @param {Contour[]} cs
   * @returns {{ x0: number, y0: number, w: number, h: number, cov: Float32Array } | null}
   */
  coverage(cs) {
    const s = this.ppmm;
    /** @type {number[][]} */
    const edges = [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const c of cs) {
      for (let i = 0; i < c.length; i++) {
        const a = c[i];
        const b = c[(i + 1) % c.length];
        const ax = a[0] * s;
        const ay = a[1] * s;
        const bx = b[0] * s;
        const by = b[1] * s;
        minX = Math.min(minX, ax);
        maxX = Math.max(maxX, ax);
        minY = Math.min(minY, ay);
        maxY = Math.max(maxY, ay);
        if (ay === by) continue;
        edges.push(ay < by ? [ax, ay, bx, by, 1] : [bx, by, ax, ay, -1]);
      }
    }
    const x0 = Math.max(0, Math.floor(minX));
    const y0 = Math.max(0, Math.floor(minY));
    const x1 = Math.min(this.w, Math.ceil(maxX) + 1);
    const y1 = Math.min(this.h, Math.ceil(maxY) + 1);
    if (x1 <= x0 || y1 <= y0) return null;
    const w = x1 - x0;
    const h = y1 - y0;
    const cov = new Float32Array(w * h);
    /** @type {[number, number][]} */
    const xs = [];
    const wgt = 1 / SUB_ROWS;
    for (let py = y0; py < y1; py++) {
      const row = (py - y0) * w;
      for (let k = 0; k < SUB_ROWS; k++) {
        const y = py + (k + 0.5) / SUB_ROWS;
        xs.length = 0;
        for (const e of edges) if (y >= e[1] && y < e[3]) xs.push([e[0] + ((y - e[1]) / (e[3] - e[1])) * (e[2] - e[0]), e[4]]);
        if (xs.length < 2) continue;
        xs.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
        let wind = 0;
        for (let i = 0; i < xs.length - 1; i++) {
          wind += xs[i][1];
          if (wind === 0) continue;
          const a = Math.max(xs[i][0], x0) - x0;
          const b = Math.min(xs[i + 1][0], x1) - x0;
          if (b <= a) continue;
          const ia = Math.floor(a);
          const ib = Math.floor(b);
          if (ia === ib) {
            if (ia < w) cov[row + ia] += (b - a) * wgt;
            continue;
          }
          cov[row + ia] += (ia + 1 - a) * wgt;
          for (let x = ia + 1; x < ib; x++) cov[row + x] += wgt;
          if (ib < w) cov[row + ib] += (b - ib) * wgt;
        }
      }
    }
    for (let i = 0; i < cov.length; i++) if (cov[i] > 1) cov[i] = 1;
    return { x0, y0, w, h, cov };
  }

  /** Restricts later fills to the contours (nested clips multiply). @param {Contour[]} cs */
  clip(cs) {
    const full = new Float32Array(this.w * this.h);
    const c = this.coverage(cs);
    if (c) for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) full[(c.y0 + y) * this.w + c.x0 + x] = c.cov[y * c.w + x];
    const prev = this.clips.at(-1);
    if (prev) for (let i = 0; i < full.length; i++) full[i] *= prev[i];
    this.clips.push(full);
  }

  unclip() {
    this.clips.pop();
  }

  /**
   * Fills contours with a paint and a finish (the material mask).
   * @param {Contour[]} cs @param {Paint} paint @param {Finish & { alpha?: number }} [finish]
   */
  fill(cs, paint, finish = {}) {
    const c = this.coverage(cs);
    if (!c) return;
    const f = { ...this.finish, ...finish };
    const alphaMul = finish.alpha ?? 1;
    const clipMask = this.clips.at(-1);
    const s = this.ppmm;
    /** @type {(x: number, y: number) => [number, number, number, number]} */
    const at = paintFn(paint);
    for (let y = 0; y < c.h; y++) {
      for (let x = 0; x < c.w; x++) {
        let a = c.cov[y * c.w + x];
        if (a <= 0) continue;
        const px = c.x0 + x;
        const py = c.y0 + y;
        const i = py * this.w + px;
        if (clipMask) a *= clipMask[i];
        if (a <= 0) continue;
        const [r, g, b, pa] = at((px + 0.5) / s, (py + 0.5) / s);
        a *= pa * alphaMul;
        if (a <= 0) continue;
        const A = this.alpha[i];
        const outA = a + A * (1 - a);
        const k = A * (1 - a);
        this.color[i * 3] = (r * a + this.color[i * 3] * k) / outA;
        this.color[i * 3 + 1] = (g * a + this.color[i * 3 + 1] * k) / outA;
        this.color[i * 3 + 2] = (b * a + this.color[i * 3 + 2] * k) / outA;
        this.alpha[i] = outA;
        this.mask[i * 3] += (f.metal - this.mask[i * 3]) * a;
        this.mask[i * 3 + 1] += (f.rough - this.mask[i * 3 + 1]) * a;
        this.mask[i * 3 + 2] += (f.coat - this.mask[i * 3 + 2]) * a;
      }
    }
  }

  /**
   * Scatters small dots (speckle) inside the current clip or a box.
   * @param {() => number} rnd @param {{ x: number, y: number, w: number, h: number }} box @param {number} count
   * @param {[number, number]} rRange @param {Paint} paint @param {Finish & { alpha?: number }} [finish]
   */
  speckle(rnd, box, count, rRange, paint, finish) {
    for (let i = 0; i < count; i++) {
      const x = box.x + rnd() * box.w;
      const y = box.y + rnd() * box.h;
      const r = rRange[0] + rnd() * (rRange[1] - rRange[0]);
      this.fill(ellipse(x, y, r, r * (0.6 + 0.4 * rnd()), rnd() * 180, 12), paint, finish);
    }
  }

  /** @returns {{ color: { width: number, height: number, channels: number, data: Uint8Array }, mask: { width: number, height: number, channels: number, data: Uint8Array } }} */
  images() {
    const n = this.w * this.h;
    const color = new Uint8Array(n * 4);
    const mask = new Uint8Array(n * 3);
    const q = (/** @type {number} */ v) => Math.max(0, Math.min(255, Math.round(v * 255)));
    for (let i = 0; i < n; i++) {
      color[i * 4] = q(this.color[i * 3]);
      color[i * 4 + 1] = q(this.color[i * 3 + 1]);
      color[i * 4 + 2] = q(this.color[i * 3 + 2]);
      color[i * 4 + 3] = q(this.alpha[i]);
      mask[i * 3] = q(this.mask[i * 3]);
      mask[i * 3 + 1] = q(this.mask[i * 3 + 1]);
      mask[i * 3 + 2] = q(this.mask[i * 3 + 2]);
    }
    return { color: { width: this.w, height: this.h, channels: 4, data: color }, mask: { width: this.w, height: this.h, channels: 3, data: mask } };
  }
}

/**
 * A per-pixel paint function (sRGB 0..1 and alpha).
 * @param {Paint} paint
 * @returns {(x: number, y: number) => [number, number, number, number]}
 */
function paintFn(paint) {
  if (typeof paint === 'string') {
    const c = rgb(paint);
    return () => [c[0], c[1], c[2], 1];
  }
  if ('hex' in paint) {
    const c = rgb(paint.hex);
    const a = paint.alpha ?? 1;
    return () => [c[0], c[1], c[2], a];
  }
  const stops = paint.stops.map(([t, h]) => /** @type {[number, [number, number, number]]} */ ([t, rgb(h)]));
  const lerp = (/** @type {number} */ t) => {
    if (t <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const [t0, c0] = stops[i - 1];
        const [t1, c1] = stops[i];
        const k = (t - t0) / (t1 - t0 || 1);
        return /** @type {[number, number, number]} */ ([c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k]);
      }
    }
    return stops[stops.length - 1][1];
  };
  if (paint.kind === 'linear') {
    const dx = paint.x1 - paint.x0;
    const dy = paint.y1 - paint.y0;
    const l2 = dx * dx + dy * dy || 1;
    return (x, y) => {
      const c = lerp(((x - paint.x0) * dx + (y - paint.y0) * dy) / l2);
      return [c[0], c[1], c[2], 1];
    };
  }
  const r = paint.r || 1;
  return (x, y) => {
    const c = lerp(Math.hypot(x - paint.x0, y - paint.y0) / r);
    return [c[0], c[1], c[2], 1];
  };
}

/** @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 @param {[number, string][]} stops @returns {Gradient} */
export const linear = (x0, y0, x1, y1, stops) => ({ kind: 'linear', x0, y0, x1, y1, stops });
/** @param {number} cx @param {number} cy @param {number} r @param {[number, string][]} stops @returns {Gradient} */
export const radial = (cx, cy, r, stops) => ({ kind: 'radial', x0: cx, y0: cy, x1: cx, y1: cy, r, stops });
