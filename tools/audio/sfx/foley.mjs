// @ts-check
// Foley built from Kenney recordings. Knocks and bangs: the recorded impact is the knuckle or the fist; a bank of
// door-panel modes (a hollow-core apartment door) rings behind it, and a bang adds the frame rattling, the hinges
// creaking and a low thump through the floor. Footsteps: the recorded steps, one creaking floorboard layer for the
// wooden floor, a ceramic tick for the kitchen tiles. Pickups: cloth and the object that is picked up.

import { SR, biquad, runBiquad, dbToGain, trimSilence, varispeed } from '../lib/dsp.mjs';
import { Rng } from '../lib/rng.mjs';

/**
 * Rings a bank of damped modes with an excitation.
 * @param {Float32Array} x
 * @param {{ f: number, decay: number, gain: number }[]} modes  decay: seconds to -60 dB
 * @param {number} length  output frames
 */
export function modes(x, modes, length) {
  const out = new Float32Array(length);
  for (const m of modes) {
    const y = new Float32Array(length);
    y.set(x.subarray(0, Math.min(x.length, length)));
    const q = (Math.PI * m.f * m.decay) / 6.91;
    runBiquad(y, biquad({ type: 'bandpass', freq: m.f, q }));
    for (let i = 0; i < length; i++) out[i] += y[i] * m.gain;
  }
  return out;
}

/** Modes of a hollow-core door, jittered per take. @param {Rng} rng @param {number} [heavy] */
function doorModes(rng, heavy = 0) {
  const base = [
    [74, 0.16, 1],
    [112, 0.14, 0.9],
    [161, 0.12, 0.8],
    [228, 0.1, 0.6],
    [297, 0.08, 0.45],
    [385, 0.07, 0.35],
    [478, 0.06, 0.25],
    [602, 0.05, 0.15],
  ];
  return base.map(([f, d, g]) => ({ f: f * rng.range(0.93, 1.07), decay: d * (1 + heavy * 0.5) * rng.range(0.85, 1.15), gain: g * (f < 150 ? 1 + heavy : 1) }));
}

/**
 * @param {Float32Array} dst
 * @param {Float32Array} src
 * @param {number} at  seconds
 * @param {number} gain
 */
function place(dst, src, at, gain) {
  const s = Math.round(at * SR);
  for (let i = 0; i < src.length && s + i < dst.length; i++) if (s + i >= 0) dst[s + i] += src[i] * gain;
}

/**
 * A knock on the apartment door: a pattern of raps, each ringing the door panel.
 * @param {{ raps: [number, number][], takes: Float32Array[], latch: Float32Array, seed: string }} o  raps: [time s, velocity 0..1]
 */
export function knock(o) {
  const rng = new Rng(o.seed);
  const end = o.raps[o.raps.length - 1][0] + 0.6;
  const out = new Float32Array(Math.round(end * SR));
  for (const [t, v] of o.raps) {
    const take = varispeed([rng.pick(o.takes)], rng.range(0.92, 1.06))[0];
    const hp = take.slice();
    runBiquad(hp, biquad({ type: 'highpass', freq: 90 }));
    const ex = take.slice(0, Math.round(0.012 * SR));
    const body = modes(ex, doorModes(rng), Math.round(0.5 * SR));
    place(out, hp, t, 0.8 * v);
    place(out, body, t, 1.6 * v);
    if (v > 0.8) place(out, o.latch, t + rng.range(0.006, 0.02), 0.12 * v);
  }
  return out;
}

/**
 * A heavy bang against the door: fist or shoulder, the panel booming, the frame and chain rattling.
 * @param {{ hits: [number, number][], heavy: Float32Array[], punch: Float32Array[], rattle: Float32Array[], creak: Float32Array[], seed: string }} o
 */
export function bang(o) {
  const rng = new Rng(o.seed);
  const end = o.hits[o.hits.length - 1][0] + 1.1;
  const out = new Float32Array(Math.round(end * SR));
  for (const [t, v] of o.hits) {
    const imp = varispeed([rng.pick(o.heavy)], rng.range(0.85, 1.0))[0];
    const punch = varispeed([rng.pick(o.punch)], rng.range(0.7, 0.85))[0];
    runBiquad(imp, biquad({ type: 'highpass', freq: 60 }));
    const ex = imp.slice(0, Math.round(0.02 * SR));
    const body = modes(ex, doorModes(rng, 1), Math.round(0.9 * SR));
    place(out, imp, t, 0.9 * v);
    place(out, punch, t + 0.002, 0.55 * v);
    place(out, body, t, 2.2 * v);
    // Thump through the floor.
    const th = new Float32Array(Math.round(0.14 * SR));
    const f = rng.range(48, 62);
    for (let i = 0; i < th.length; i++) th[i] = Math.sin((2 * Math.PI * f * i) / SR) * Math.exp(-i / (0.035 * SR));
    place(out, th, t, 0.35 * v);
    const rattle = varispeed([rng.pick(o.rattle)], rng.range(0.9, 1.15))[0];
    runBiquad(rattle, biquad({ type: 'highpass', freq: 700 }));
    place(out, rattle, t + rng.range(0.012, 0.035), 0.3 * v);
    if (rng.chance(0.6)) {
      const cr = rng.pick(o.creak);
      const part = cr.slice(0, Math.min(cr.length, Math.round(0.45 * SR)));
      for (let i = 0; i < part.length; i++) part[i] *= Math.min(1, (part.length - i) / (0.1 * SR));
      place(out, part, t + rng.range(0.05, 0.12), 0.18 * v);
    }
  }
  return out;
}

/**
 * A footstep with optional layers (a creaking board, a ceramic tick).
 * @param {{ step: Float32Array, layer?: Float32Array, layerGainDb?: number, layerDelay?: number, eq: import('../lib/dsp.mjs').FilterSpec[] }} o
 */
export function footstep(o) {
  const [s] = trimSilence([o.step], { thresholdDb: -50, preRoll: 0.002, tail: 0.05 });
  const len = Math.max(s.length, o.layer ? Math.round((o.layerDelay ?? 0) * SR) + o.layer.length : 0);
  const out = new Float32Array(len + Math.round(0.05 * SR));
  out.set(s);
  if (o.layer) place(out, o.layer, o.layerDelay ?? 0, dbToGain(o.layerGainDb ?? -12));
  for (const f of o.eq) runBiquad(out, biquad(f));
  return out;
}

/**
 * Layers several one-shots (a pickup: cloth and the item).
 * @param {{ parts: { x: Float32Array, at?: number, gainDb?: number, hp?: number }[] }} o
 */
export function layered(o) {
  const len = Math.max(...o.parts.map((p) => Math.round((p.at ?? 0) * SR) + p.x.length));
  const out = new Float32Array(len);
  for (const p of o.parts) {
    const x = p.x.slice();
    if (p.hp) runBiquad(x, biquad({ type: 'highpass', freq: p.hp }));
    place(out, x, p.at ?? 0, dbToGain(p.gainDb ?? 0));
  }
  return out;
}
