// @ts-check
// Kitchen and machine sounds, synthesized. Sizzle: a hiss bed, a Poisson crackle of tiny bursts and bubble pops, and
// the occasional spit of fat. Generator: a four-stroke single cylinder (one firing every second revolution) whose
// exhaust pulses ring the muffler's resonances, with valve ticks, rotation hum, alternator whine, fan noise and a
// sheet-metal rattle excited by every firing.

import { SR, biquad, runBiquad, pinkNoise, smoothRandom, makeLoop, saturate } from '../lib/dsp.mjs';
import { Rng } from '../lib/rng.mjs';

/**
 * Seamless mono sizzle loop.
 * @param {{ seconds: number, intensity: number, seed: string }} o
 */
export function sizzle(o) {
  const rng = new Rng(o.seed);
  const xf = 0.8;
  const n = Math.round((o.seconds + xf) * SR);
  const I = o.intensity;
  const hiss = pinkNoise(n, () => rng.next());
  runBiquad(hiss, biquad({ type: 'highpass', freq: 2200 }));
  runBiquad(hiss, biquad({ type: 'highpass', freq: 2200 }));
  runBiquad(hiss, biquad({ type: 'lowpass', freq: 12000 }));
  const surge = smoothRandom(n, 0.35, () => rng.next());
  const crack = new Float32Array(n);
  const rate = 180 + 520 * I;
  let t = 0;
  for (;;) {
    t += -Math.log(1 - rng.next()) / rate;
    const at = Math.floor(t * SR);
    if (at >= n) break;
    const a = rng.next() ** 2.5 * (rng.chance(0.5) ? 1 : -1);
    const len = Math.round(rng.range(0.0002, 0.0012) * SR);
    for (let i = 0; i < len && at + i < n; i++) crack[at + i] += a * (rng.next() * 2 - 1) * Math.exp(-i / (len * 0.35));
  }
  const cb = biquad({ type: 'bandpass', freq: 5200, q: 0.6 });
  runBiquad(crack, cb);
  // Bubbles in the oil and spits of fat.
  const pops = new Float32Array(n);
  t = 0;
  for (;;) {
    t += -Math.log(1 - rng.next()) / (25 + 60 * I);
    const at = Math.floor(t * SR);
    if (at >= n) break;
    const f = rng.range(900, 3200);
    const tau = rng.range(0.001, 0.004);
    const len = Math.min(n - at, Math.round(tau * 6 * SR));
    const a = rng.range(0.05, 0.25);
    for (let i = 0; i < len; i++) pops[at + i] += a * Math.sin((2 * Math.PI * f * i) / SR) * Math.exp(-i / (tau * SR));
  }
  t = rng.range(0.1, 0.8);
  for (;;) {
    t += rng.range(0.3, 1.6) / (0.4 + I);
    const at = Math.floor(t * SR);
    if (at >= n) break;
    const len = Math.round(rng.range(0.02, 0.05) * SR);
    const spit = new Float32Array(len);
    for (let i = 0; i < len; i++) spit[i] = (rng.next() * 2 - 1) * Math.exp(-i / (len * 0.25));
    runBiquad(spit, biquad({ type: 'bandpass', freq: rng.range(1200, 2600), q: 1.2 }));
    const a = rng.range(0.4, 0.9);
    for (let i = 0; i < len && at + i < n; i++) pops[at + i] += spit[i] * a;
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = hiss[i] * (0.2 + 0.1 * I) * (1 + 0.35 * surge[i]) + crack[i] * 2.2 + pops[i] * 0.6;
  return makeLoop([out], xf);
}

/**
 * Seamless mono generator loop.
 * @param {{ seconds: number, rpm: number, load: number, seed: string }} o  load 0 … 1 (more exhaust, less whine)
 */
export function generator(o) {
  const rng = new Rng(o.seed);
  const xf = 0.6;
  const n = Math.round((o.seconds + xf) * SR);
  const rev = o.rpm / 60;
  const fire = rev / 2;
  const wander = smoothRandom(n, 0.9, () => rng.next());
  // Exhaust pulses into the muffler's resonances.
  const pulses = new Float32Array(n);
  const valve = new Float32Array(n);
  let t = 0.01;
  while (t < n / SR) {
    const at = Math.floor(t * SR);
    const misfire = rng.chance(0.004);
    const a = misfire ? 0.15 : 1 + 0.12 * rng.gauss();
    pulses[at] += a;
    if (at + 1 < n) pulses[at + 1] += a * 0.5;
    const vt = at + Math.round((0.35 / fire) * SR);
    if (vt < n) valve[vt] += rng.range(0.5, 1);
    const period = (1 / fire) * (1 + 0.012 * rng.gauss() + 0.01 * wander[Math.min(n - 1, at)]);
    t += period;
  }
  const exhaust = new Float32Array(n);
  for (const [f, q, g] of [
    [fire * 3, 4, 0.9],
    [180 + 40 * o.load, 3, 1],
    [420, 2.5, 0.55],
    [950, 2, 0.25],
  ]) {
    const b = pulses.slice();
    runBiquad(b, biquad({ type: 'bandpass', freq: f, q }));
    for (let i = 0; i < n; i++) exhaust[i] += b[i] * g * (1 + 0.6 * o.load);
  }
  const burst = pulses.slice();
  runBiquad(burst, biquad({ type: 'lowpass', freq: 1400 }));
  const nz = new Float32Array(n);
  let env = 0;
  for (let i = 0; i < n; i++) {
    env = Math.max(Math.abs(burst[i]), env * Math.exp(-1 / (0.006 * SR)));
    nz[i] = (rng.next() * 2 - 1) * env;
  }
  runBiquad(nz, biquad({ type: 'lowpass', freq: 2500 }));
  runBiquad(valve, biquad({ type: 'bandpass', freq: 4200, q: 1.5 }));
  // Rattle: a sheet-metal resonance driven by the firings, clipped into a buzz.
  const rattle = pulses.slice();
  runBiquad(rattle, biquad({ type: 'bandpass', freq: 310, q: 12 }));
  saturate(rattle, 6);
  runBiquad(rattle, biquad({ type: 'highpass', freq: 500 }));
  const fan = pinkNoise(n, () => rng.next());
  runBiquad(fan, biquad({ type: 'bandpass', freq: 900, q: 0.5 }));
  const out = new Float32Array(n);
  let ph1 = 0;
  let ph2 = 0;
  for (let i = 0; i < n; i++) {
    const w = 1 + 0.01 * wander[i];
    ph1 += (2 * Math.PI * rev * w) / SR;
    ph2 += (2 * Math.PI * 8 * rev * w) / SR;
    const hum = Math.sin(ph1) * 0.25 + Math.sin(2 * ph1) * 0.12;
    const whine = Math.sin(ph2) * 0.03 * (1.2 - o.load) + Math.sin(2 * ph2 + 0.3) * 0.012;
    out[i] = exhaust[i] * 0.9 + nz[i] * 0.5 + valve[i] * 0.35 + rattle[i] * 0.06 + fan[i] * 0.05 * (1 + Math.sin(ph2 / 8) * 0.2) + hum * 0.2 + whine;
  }
  runBiquad(out, biquad({ type: 'highpass', freq: 35 }));
  saturate(out, 1.3);
  return makeLoop([out], xf);
}
