// @ts-check
// Room impulse responses for the spaces of the game, synthesized from a small acoustic model: image-source early
// reflections of a shoebox room (darker with every bounce), a late tail of decorrelated noise decaying per octave band
// at the space's RT60, axial room modes for the small rooms, flutter echo between the stairwell's parallel walls and
// facade slap-backs outdoors. IRs are stereo, 48 kHz, normalized to unit energy (the send level sets the amount).

import { SR, biquad, runBiquad } from './lib/dsp.mjs';
import { Rng } from './lib/rng.mjs';

/**
 * @typedef {{
 *   title: string, dims: [number, number, number], rt60: number[], absorption: number, predelay: number,
 *   source?: [number, number, number], listener?: [number, number, number], erOrder?: number, erGainDb?: number,
 *   modes?: number, flutter?: { period: number, decay: number, gainDb: number }, slaps?: { t: number, db: number, pan: number }[],
 *   width?: number, lowcut?: number, highcut?: number, length?: number
 * }} SpaceModel  rt60 per octave band 125 … 8000 Hz
 */

export const BANDS = [125, 250, 500, 1000, 2000, 4000, 8000];

/** @type {Record<string, SpaceModel>} */
export const SPACE_MODELS = {
  apartment: {
    title: 'Apartment living room (furnished, 5.2 × 4.0 × 2.6 m)',
    dims: [5.2, 4.0, 2.6],
    rt60: [0.62, 0.55, 0.48, 0.44, 0.4, 0.34, 0.26],
    absorption: 0.28,
    predelay: 0.003,
    erOrder: 3,
    erGainDb: 0,
    modes: 0.45,
    width: 0.8,
    lowcut: 60,
    highcut: 11000,
  },
  stairwell: {
    title: 'Concrete stairwell (3 × 6 m, 12 m high)',
    dims: [3.0, 6.0, 12.0],
    rt60: [2.4, 2.7, 2.6, 2.4, 2.1, 1.7, 1.2],
    absorption: 0.05,
    predelay: 0.006,
    erOrder: 3,
    erGainDb: -1,
    flutter: { period: 2 * 3.0 / 343, decay: 0.32, gainDb: -8 },
    width: 1,
    lowcut: 80,
    highcut: 12000,
  },
  shop: {
    title: 'Corner shop (16 × 11 × 3.6 m, shelving)',
    dims: [16, 11, 3.6],
    rt60: [1.05, 1.0, 0.92, 0.86, 0.8, 0.7, 0.55],
    absorption: 0.18,
    predelay: 0.009,
    erOrder: 2,
    erGainDb: -3,
    width: 1,
    lowcut: 70,
    highcut: 10000,
  },
  basement: {
    title: 'Concrete basement (9 × 7 m, 2.3 m ceiling)',
    dims: [9, 7, 2.3],
    rt60: [1.7, 1.55, 1.35, 1.15, 0.95, 0.75, 0.52],
    absorption: 0.08,
    predelay: 0.004,
    erOrder: 3,
    erGainDb: 0,
    modes: 1,
    width: 0.9,
    lowcut: 45,
    highcut: 8000,
  },
  outdoors: {
    title: 'Street between apartment blocks',
    dims: [40, 18, 30],
    rt60: [0.9, 0.8, 0.7, 0.55, 0.45, 0.35, 0.25],
    absorption: 0.6,
    predelay: 0.012,
    erOrder: 1,
    erGainDb: -4,
    slaps: [
      { t: 0.052, db: -4, pan: -0.5 },
      { t: 0.118, db: -7, pan: 0.6 },
      { t: 0.171, db: -10, pan: -0.2 },
      { t: 0.262, db: -13, pan: 0.4 },
      { t: 0.39, db: -18, pan: -0.6 },
    ],
    width: 1,
    lowcut: 90,
    highcut: 7000,
    length: 1.6,
  },
  hall: {
    title: 'Scoring stage (music only; not shipped)',
    dims: [28, 19, 11],
    rt60: [2.5, 2.3, 2.1, 2.0, 1.85, 1.55, 1.15],
    absorption: 0.12,
    predelay: 0.024,
    erOrder: 2,
    erGainDb: -5,
    width: 1,
    lowcut: 40,
    highcut: 12500,
  },
};

/**
 * @param {string} name
 * @param {number} [seed]
 * @returns {Float32Array[]} stereo IR
 */
export function makeIR(name, seed = 7) {
  const m = SPACE_MODELS[name];
  if (!m) throw new Error(`unknown space ${name}`);
  const rng = new Rng(`${name}:${seed}`);
  const maxRt = Math.max(...m.rt60);
  const len = Math.round((m.length ?? Math.min(3.6, maxRt * 1.25 + 0.1)) * SR);
  const L = new Float32Array(len);
  const R = new Float32Array(len);
  const c = 343;
  const [X, Y, Z] = m.dims;
  const S = m.source ?? [X * 0.62, Y * 0.55, Math.min(1.6, Z * 0.5)];
  const Lp = m.listener ?? [X * 0.34, Y * 0.4, Math.min(1.6, Z * 0.5)];
  const direct = Math.hypot(S[0] - Lp[0], S[1] - Lp[1], S[2] - Lp[2]);

  // Early reflections (image sources), one buffer per order so each order gets its own darkening.
  const order = m.erOrder ?? 2;
  const erBufs = Array.from({ length: order + 1 }, () => [new Float32Array(len), new Float32Array(len)]);
  const beta = Math.sqrt(1 - m.absorption);
  for (let nx = -order; nx <= order; nx++) {
    for (let ny = -order; ny <= order; ny++) {
      for (let nz = -order; nz <= order; nz++) {
        const k = Math.abs(nx) + Math.abs(ny) + Math.abs(nz);
        if (k === 0 || k > order) continue;
        const ix = nx % 2 === 0 ? nx * X + S[0] : nx * X + (X - S[0]);
        const iy = ny % 2 === 0 ? ny * Y + S[1] : ny * Y + (Y - S[1]);
        const iz = nz % 2 === 0 ? nz * Z + S[2] : nz * Z + (Z - S[2]);
        const dx = ix - Lp[0];
        const dy = iy - Lp[1];
        const d = Math.hypot(dx, dy, iz - Lp[2]);
        const t = m.predelay + (d - direct) / c;
        const idx = Math.round(t * SR);
        if (idx < 0 || idx >= len) continue;
        const amp = (beta ** k * direct) / d;
        const az = Math.atan2(dx, dy); // listener faces +y; positive x is to the right
        const pan = Math.sin(az) * (m.width ?? 1);
        const gl = Math.cos(((pan + 1) * Math.PI) / 4);
        const gr = Math.sin(((pan + 1) * Math.PI) / 4);
        const jitter = rng.range(0.85, 1.15);
        erBufs[k][0][idx] += amp * gl * jitter * (rng.chance(0.5) ? 1 : -1);
        erBufs[k][1][idx] += amp * gr * jitter * (rng.chance(0.5) ? 1 : -1);
      }
    }
  }
  const erGain = 10 ** ((m.erGainDb ?? 0) / 20);
  for (let k = 1; k <= order; k++) {
    const lp = biquad({ type: 'lowpass', freq: Math.max(1800, 12000 / k ** 1.3) });
    for (const ch of erBufs[k]) runBiquad(ch, lp);
    for (let i = 0; i < len; i++) {
      L[i] += erBufs[k][0][i] * erGain;
      R[i] += erBufs[k][1][i] * erGain;
    }
  }

  // Facade slap-backs (outdoors).
  for (const s of m.slaps ?? []) {
    const idx = Math.round((m.predelay + s.t) * SR);
    const g = 10 ** (s.db / 20);
    const burst = Math.round(0.004 * SR);
    const bl = new Float32Array(burst * 4);
    for (let i = 0; i < burst; i++) bl[i] = (rng.next() * 2 - 1) * (1 - i / burst);
    runBiquad(bl, biquad({ type: 'lowpass', freq: 2500 }));
    for (let i = 0; i < bl.length && idx + i < len; i++) {
      L[idx + i] += bl[i] * g * Math.cos(((s.pan + 1) * Math.PI) / 4) * 1.4;
      R[idx + i] += bl[i] * g * Math.sin(((s.pan + 1) * Math.PI) / 4) * 1.4;
    }
  }

  // Flutter echo between parallel walls (stairwell): a decaying, band-limited pulse train.
  if (m.flutter) {
    const f = m.flutter;
    const fl = [new Float32Array(len), new Float32Array(len)];
    for (let t = m.predelay + f.period, n = 1; t < f.decay * 3; t += f.period, n++) {
      const idx = Math.round(t * SR);
      if (idx >= len) break;
      const g = 10 ** (f.gainDb / 20) * Math.exp((-6.91 * (t - m.predelay)) / f.decay);
      fl[0][idx] += g * (n % 2 ? 1 : 0.8);
      fl[1][idx] += g * (n % 2 ? 0.8 : 1);
    }
    const bp = biquad({ type: 'bandpass', freq: 2200, q: 0.8 });
    for (const ch of fl) runBiquad(ch, bp);
    for (let i = 0; i < len; i++) {
      L[i] += fl[0][i];
      R[i] += fl[1][i];
    }
  }

  // Late reverb: decorrelated noise per octave band with its own exponential decay; fades in over the mixing time.
  const volume = X * Y * Z;
  const tMix = Math.min(0.08, Math.sqrt(volume) / 1000 + 0.004);
  const onset = m.predelay + 0.002;
  const late = [new Float32Array(len), new Float32Array(len)];
  for (let b = 0; b < BANDS.length; b++) {
    const rt = m.rt60[b];
    const bp = biquad({ type: 'bandpass', freq: BANDS[b], q: 1.41 });
    for (let c2 = 0; c2 < 2; c2++) {
      const nz = new Float32Array(len);
      for (let i = 0; i < len; i++) nz[i] = rng.gauss();
      runBiquad(nz, bp);
      runBiquad(nz, bp);
      for (let i = 0; i < len; i++) {
        const t = i / SR - onset;
        if (t < 0) continue;
        late[c2][i] += nz[i] * Math.exp((-6.91 * t) / rt);
      }
    }
  }
  // Energy of the tail relative to the early part: more for large, live rooms.
  const lateGain = 0.55 * Math.sqrt(Math.max(0.2, maxRt / 0.5)) / Math.sqrt(1 + 40 * m.absorption);
  for (let i = 0; i < len; i++) {
    const t = i / SR - onset;
    const ramp = t <= 0 ? 0 : t >= tMix ? 1 : 0.5 - 0.5 * Math.cos((Math.PI * t) / tMix);
    L[i] += late[0][i] * ramp * lateGain * 0.05;
    R[i] += late[1][i] * ramp * lateGain * 0.05;
  }

  // Axial room modes (small rooms): resonances that ring at the low-frequency RT60.
  if (m.modes) {
    const modes = [];
    for (const dim of m.dims) for (let n = 1; n <= 3; n++) modes.push((n * c) / (2 * dim));
    for (const f of modes.filter((f) => f > 30 && f < 220)) {
      const rt = m.rt60[0] * 1.1;
      const amp = 0.012 * m.modes * rng.range(0.6, 1.2);
      const ph = rng.range(0, Math.PI * 2);
      for (let i = Math.round(onset * SR); i < len; i++) {
        const t = i / SR - onset;
        const v = amp * Math.sin(2 * Math.PI * f * t + ph) * Math.exp((-6.91 * t) / rt) * Math.min(1, t / 0.01);
        L[i] += v;
        R[i] += v * 0.9;
      }
    }
  }

  // Band limits, stereo width, unit energy, and a fade to silence at the end.
  const hp = biquad({ type: 'highpass', freq: m.lowcut ?? 50 });
  const lp = biquad({ type: 'lowpass', freq: m.highcut ?? 12000 });
  for (const ch of [L, R]) {
    runBiquad(ch, hp);
    runBiquad(ch, lp);
  }
  const w = m.width ?? 1;
  let e = 0;
  for (let i = 0; i < len; i++) {
    const mid = (L[i] + R[i]) / 2;
    const side = ((L[i] - R[i]) / 2) * w;
    L[i] = mid + side;
    R[i] = mid - side;
    e += L[i] * L[i] + R[i] * R[i];
  }
  const g = 1 / Math.sqrt(e || 1);
  const fadeN = Math.round(0.05 * SR);
  for (let i = 0; i < len; i++) {
    const f = i >= len - fadeN ? (len - i) / fadeN : 1;
    L[i] *= g * f;
    R[i] *= g * f;
  }
  return [L, R];
}
