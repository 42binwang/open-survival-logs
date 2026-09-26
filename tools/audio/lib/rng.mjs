// @ts-check
// Seeded randomness for the audio tools: every render (music humanization, SFX synthesis, variant picks in the test
// scene) is reproducible from its seed, so a rebuild produces the same files.

/**
 * 32-bit FNV-1a hash of a string, used to derive seeds from names ('groan-03' -> seed).
 * @param {string} s
 */
export function hashSeed(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export class Rng {
  /** @param {number | string} seed */
  constructor(seed) {
    this.state = (typeof seed === 'string' ? hashSeed(seed) : seed >>> 0) || 0x9e3779b9;
    /** @type {number | null} */
    this.spare = null;
  }

  /** Uniform in [0, 1) (mulberry32). */
  next() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** @param {number} a @param {number} b */
  range(a, b) {
    return a + (b - a) * this.next();
  }

  /** Integer in [a, b]. @param {number} a @param {number} b */
  int(a, b) {
    return a + Math.floor(this.next() * (b - a + 1));
  }

  /** @param {number} p */
  chance(p) {
    return this.next() < p;
  }

  /** @template T @param {readonly T[]} arr @returns {T} */
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Standard normal (Box-Muller). */
  gauss() {
    if (this.spare !== null) {
      const s = this.spare;
      this.spare = null;
      return s;
    }
    let u = 0;
    while (u <= 1e-12) u = this.next();
    const v = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    this.spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  }

  /** A child generator with an independent stream. @param {string | number} salt */
  fork(salt) {
    return new Rng((this.state ^ (typeof salt === 'string' ? hashSeed(salt) : salt * 0x9e3779b1)) >>> 0);
  }
}
