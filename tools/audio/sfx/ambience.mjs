// @ts-check
// Ambience beds. Apartment room tone: the refrigerator compressor's 50 Hz family with a slow duty cycle, a faint
// air-handling hiss and the building settling now and then. Night outside: wind in gusts over the street, far-off
// moans. The horde: a crowd of zombie voices at many distances and bearings, shuffling feet, in the street's
// acoustics.

import { SR, biquad, runBiquad, pinkNoise, brownNoise, smoothRandom, makeLoop, varispeed } from '../lib/dsp.mjs';
import { convolveChannels } from '../lib/fft.mjs';
import { Rng } from '../lib/rng.mjs';
import { makeIR } from '../spaces.mjs';
import { zombieVoice, GROANS } from './voice.mjs';

/**
 * Seamless stereo room tone.
 * @param {{ seconds: number, seed: string, fridge: number }} o  fridge: level of the compressor hum 0 … 1
 */
export function roomTone(o) {
  const rng = new Rng(o.seed);
  const xf = 2;
  const n = Math.round((o.seconds + xf) * SR);
  const out = [new Float32Array(n), new Float32Array(n)];
  const cycle = smoothRandom(n, 6, () => rng.next());
  let ph = rng.range(0, 6.28);
  for (let c = 0; c < 2; c++) {
    const air = pinkNoise(n, () => rng.next());
    runBiquad(air, biquad({ type: 'lowpass', freq: 1800 }));
    runBiquad(air, biquad({ type: 'highpass', freq: 90 }));
    const rumble = brownNoise(n, () => rng.next());
    runBiquad(rumble, biquad({ type: 'lowpass', freq: 90 }));
    for (let i = 0; i < n; i++) out[c][i] = air[i] * 0.05 + rumble[i] * 0.03;
  }
  for (let i = 0; i < n; i++) {
    ph += (2 * Math.PI * 50) / SR;
    const duty = 0.55 + 0.45 * cycle[i];
    const hum = (Math.sin(2 * ph) * 0.5 + Math.sin(3 * ph) * 0.18 + Math.sin(4 * ph) * 0.1 + Math.sin(6 * ph) * 0.05) * 0.03 * o.fridge * duty;
    out[0][i] += hum;
    out[1][i] += hum * 0.9;
  }
  // The building settling: a few soft ticks and creaks.
  let t = rng.range(1, 4);
  while (t < o.seconds) {
    const at = Math.floor(t * SR);
    const len = Math.round(rng.range(0.02, 0.12) * SR);
    const f = rng.range(600, 2400);
    const c = rng.int(0, 1);
    for (let i = 0; i < len && at + i < n; i++) out[c][at + i] += Math.sin((2 * Math.PI * f * i) / SR) * Math.exp(-i / (len * 0.2)) * 0.012 * (rng.next() * 0.6 + 0.4);
    t += rng.range(3, 9);
  }
  return makeLoop(out, xf);
}

/**
 * Seamless stereo night street: wind gusts and distant moans.
 * @param {{ seconds: number, seed: string }} o
 */
export function nightStreet(o) {
  const rng = new Rng(o.seed);
  const xf = 2;
  const n = Math.round((o.seconds + xf) * SR);
  const out = [new Float32Array(n), new Float32Array(n)];
  const gust = smoothRandom(n, 2.6, () => rng.next());
  for (let c = 0; c < 2; c++) {
    const w = pinkNoise(n, () => rng.next());
    runBiquad(w, biquad({ type: 'highpass', freq: 120 }));
    const lp = new Float32Array(n);
    // A wind whose brightness follows the gusts.
    let z1 = 0;
    for (let i = 0; i < n; i++) {
      const g = 0.5 + 0.5 * gust[i];
      const a = Math.exp((-2 * Math.PI * (300 + 1500 * g)) / SR);
      z1 = (1 - a) * w[i] + a * z1;
      lp[i] = z1 * (0.35 + 0.65 * g);
    }
    for (let i = 0; i < n; i++) out[c][i] = lp[i] * 0.5;
  }
  const moans = [new Float32Array(n), new Float32Array(n)];
  let t = rng.range(2, 5);
  while (t < o.seconds - 3) {
    const spec = { ...rng.pick(GROANS), seed: `${o.seed}-moan-${t.toFixed(2)}` };
    const v = varispeed([zombieVoice(spec)], rng.range(0.8, 1.05))[0];
    runBiquad(v, biquad({ type: 'lowpass', freq: 1200 }));
    const at = Math.floor(t * SR);
    const pan = rng.range(-0.9, 0.9);
    const g = rng.range(0.06, 0.14);
    for (let i = 0; i < v.length && at + i < n; i++) {
      moans[0][at + i] += v[i] * g * Math.cos(((pan + 1) * Math.PI) / 4);
      moans[1][at + i] += v[i] * g * Math.sin(((pan + 1) * Math.PI) / 4);
    }
    t += rng.range(4, 9);
  }
  const wet = convolveChannels(moans, makeIR('outdoors'));
  for (let c = 0; c < 2; c++) for (let i = 0; i < n; i++) out[c][i] += moans[c][i] * 0.3 + wet[c][i] * 1.2;
  return makeLoop(out, xf);
}

/**
 * Seamless stereo horde crowd outside.
 * @param {{ seconds: number, seed: string, voices: number }} o
 */
export function hordeCrowd(o) {
  const rng = new Rng(o.seed);
  const xf = 2;
  const n = Math.round((o.seconds + xf) * SR);
  const dry = [new Float32Array(n), new Float32Array(n)];
  for (let v = 0; v < o.voices; v++) {
    let t = rng.range(-1, 1.5);
    const pan = rng.range(-1, 1);
    const dist = rng.range(4, 30);
    const g = 1.4 / dist;
    const lp = biquad({ type: 'lowpass', freq: 9000 * Math.exp(-dist / 18) + 600 });
    const pitch = rng.range(0.82, 1.12);
    while (t < o.seconds + xf) {
      const spec = { ...rng.pick(GROANS), seed: `${o.seed}-v${v}-${t.toFixed(2)}`, inhale: 0 };
      const y = varispeed([zombieVoice(spec)], pitch * rng.range(0.96, 1.04))[0];
      runBiquad(y, lp);
      const at = Math.floor(t * SR);
      for (let i = 0; i < y.length; i++) {
        const j = at + i;
        if (j < 0 || j >= n) continue;
        dry[0][j] += y[i] * g * Math.cos(((pan + 1) * Math.PI) / 4);
        dry[1][j] += y[i] * g * Math.sin(((pan + 1) * Math.PI) / 4);
      }
      t += y.length / SR + rng.range(0.4, 3.5);
    }
  }
  // Shuffling feet and bodies against things: low thuds and scrapes.
  const feet = brownNoise(n, () => rng.next());
  const shuffle = smoothRandom(n, 0.25, () => rng.next());
  runBiquad(feet, biquad({ type: 'bandpass', freq: 220, q: 0.7 }));
  for (let i = 0; i < n; i++) {
    const s = Math.max(0, shuffle[i]) ** 2;
    dry[0][i] += feet[i] * s * 0.12;
    dry[1][i] += feet[i] * s * 0.1;
  }
  const wet = convolveChannels(dry, makeIR('outdoors'));
  const out = dry.map((ch, c) => {
    const o2 = new Float32Array(n);
    for (let i = 0; i < n; i++) o2[i] = ch[i] * 0.55 + wet[c][i] * 1.4;
    return o2;
  });
  return makeLoop(out, xf);
}
