// @ts-check
// Weather, synthesized. Rain: a filtered-noise wash, thousands of drop impacts per second split into bands, bubble
// "plinks" (drops on puddles: a decaying sine that chirps upwards) and heavy drips from gutters and sills.
// Thunder: a tortuous lightning channel (a 3D random walk with branches); every segment emits an N-wave that reaches
// the listener at its own distance and time, low-passed by the air on the way, so the roll, the claps and the crack
// of a near strike all come out of the geometry.

import { SR, biquad, runBiquad, pinkNoise, smoothRandom, brownNoise, makeLoop, saturate } from '../lib/dsp.mjs';
import { convolveChannels } from '../lib/fft.mjs';
import { Rng } from '../lib/rng.mjs';
import { makeIR } from '../spaces.mjs';

/**
 * A decaying sine with an upward chirp added into `out` (a raindrop on water, a Minnaert bubble).
 * @param {Float32Array} out
 * @param {number} at  frame
 * @param {number} f0
 * @param {number} rise  relative pitch rise over the decay
 * @param {number} tau  seconds
 * @param {number} amp
 */
function bubble(out, at, f0, rise, tau, amp) {
  const n = Math.min(out.length - at, Math.round(tau * 5 * SR));
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = f0 * (1 + rise * (1 - Math.exp(-t / tau)));
    ph += (2 * Math.PI * f) / SR;
    out[at + i] += amp * Math.sin(ph) * Math.exp(-t / tau) * Math.min(1, i / 8);
  }
}

/**
 * Seamless stereo rain loop.
 * @param {{ seconds: number, intensity: number, seed: string }} o  intensity 0 … 1
 */
export function rain(o) {
  const rng = new Rng(o.seed);
  const xf = 1.5;
  const n = Math.round((o.seconds + xf) * SR);
  const I = o.intensity;
  const out = [new Float32Array(n), new Float32Array(n)];
  for (let c = 0; c < 2; c++) {
    const r = rng.fork(`ch${c}`);
    // Wash.
    const wash = pinkNoise(n, () => r.next());
    runBiquad(wash, biquad({ type: 'highpass', freq: 280 }));
    runBiquad(wash, biquad({ type: 'lowpass', freq: 8500 }));
    runBiquad(wash, biquad({ type: 'peaking', freq: 3200, q: 0.7, gain: 3 }));
    const drift = smoothRandom(n, 1.7, () => r.next());
    // Drop impacts, three bands.
    const bands = [
      { f: 1600, q: 1.1, rate: 900 },
      { f: 3600, q: 1.3, rate: 1400 },
      { f: 7200, q: 1.2, rate: 1100 },
    ].map((b) => {
      const buf = new Float32Array(n);
      const rate = b.rate * (0.35 + 0.65 * I);
      let t = 0;
      for (;;) {
        t += -Math.log(1 - r.next()) / rate;
        const i = Math.floor(t * SR);
        if (i >= n) break;
        const a = r.next() ** 3 * (r.chance(0.5) ? 1 : -1);
        buf[i] += a;
        if (i + 1 < n) buf[i + 1] -= a * 0.6;
      }
      const bp = biquad({ type: 'bandpass', freq: b.f, q: b.q });
      runBiquad(buf, bp);
      runBiquad(buf, bp);
      return buf;
    });
    // Plinks on puddles and heavy drips.
    const plink = new Float32Array(n);
    let t = 0;
    const plinkRate = 18 + 50 * I;
    for (;;) {
      t += -Math.log(1 - r.next()) / plinkRate;
      const i = Math.floor(t * SR);
      if (i >= n) break;
      bubble(plink, i, r.range(1100, 4200), r.range(0.1, 0.35), r.range(0.004, 0.012), r.range(0.02, 0.09));
    }
    t = r.range(0, 0.5);
    for (;;) {
      t += r.range(0.25, 1.4) / (0.5 + I);
      const i = Math.floor(t * SR);
      if (i >= n) break;
      bubble(plink, i, r.range(380, 900), r.range(0.15, 0.5), r.range(0.015, 0.04), r.range(0.05, 0.14));
      const splash = Math.round(0.012 * SR);
      for (let k = 0; k < splash && i + k < n; k++) plink[i + k] += (r.next() * 2 - 1) * 0.05 * Math.exp(-k / (0.003 * SR));
    }
    // Low body: the rain on the whole street.
    const body = brownNoise(n, () => r.next());
    runBiquad(body, biquad({ type: 'lowpass', freq: 520 }));
    runBiquad(body, biquad({ type: 'highpass', freq: 60 }));
    const ch = out[c];
    for (let i = 0; i < n; i++) {
      const d = 1 + 0.18 * drift[i];
      ch[i] = (wash[i] * 0.16 * (0.5 + 0.5 * I) + (bands[0][i] * 0.9 + bands[1][i] * 1.2 + bands[2][i] * 0.8) * 1.4 + plink[i] * 0.8 + body[i] * 0.05 * I) * d;
    }
  }
  return makeLoop(out, xf);
}

/**
 * One thunder strike, with the street's acoustics baked in (thunder is never heard dry).
 * @param {{ distance: number, seed: string, bearing?: number }} o  distance in metres to the nearest channel point
 */
export function thunder(o) {
  const rng = new Rng(o.seed);
  const c = 343;
  const bearing = o.bearing ?? rng.range(-1.2, 1.2);
  // Channel: from ground at `distance` up to the cloud base, a random walk with branches.
  /** @type {{ p: [number, number, number], len: number }[]} */
  const segs = [];
  let taper = 0;
  const top = rng.range(2200, 3800);
  /** @param {[number, number, number]} start @param {[number, number, number]} dir @param {number} length @param {number} depth */
  const walk = (start, dir, length, depth) => {
    const fadeLen = taper;
    let p = start;
    let d = dir;
    let done = 0;
    while (done < length) {
      const step = rng.range(4, 16);
      // Tortuous but persistent: each step turns up to ~40° yet keeps heading along the channel's direction.
      d = [d[0] * 0.6 + dir[0] * 0.4 + rng.gauss() * 0.4, d[1] * 0.6 + dir[1] * 0.4 + rng.gauss() * 0.4, d[2] * 0.6 + dir[2] * 0.4 + rng.gauss() * 0.3];
      const nrm = Math.hypot(d[0], d[1], d[2]);
      d = [d[0] / nrm, d[1] / nrm, d[2] / nrm];
      const q = /** @type {[number, number, number]} */ ([p[0] + d[0] * step, p[1] + d[1] * step, Math.max(0, p[2] + d[2] * step)]);
      segs.push({ p: q, len: step * (depth ? 0.45 : 1) * (fadeLen ? Math.exp((-2.4 * done) / fadeLen) : 1) });
      p = q;
      done += step;
      if (depth === 0 && rng.chance(0.004)) walk(p, [rng.gauss(), rng.gauss(), -0.3 + rng.gauss() * 0.3], rng.range(150, 700), 1);
    }
  };
  const ground = /** @type {[number, number, number]} */ ([Math.sin(bearing) * o.distance, Math.cos(bearing) * o.distance, 0]);
  walk(ground, [0, 0, 1], top, 0);
  // The in-cloud discharge along the cloud base: kilometres of horizontal channel, the source of the long roll.
  const head = segs[segs.length - 1].p;
  const away = rng.range(-0.6, 0.6) + bearing;
  taper = rng.range(1800, 4200);
  walk(head, [Math.sin(away), Math.cos(away), 0.02], taper, 0);
  const dists = segs.map((s) => Math.hypot(s.p[0], s.p[1], s.p[2] - 1.7));
  const dmin = Math.min(...dists);
  const dmax = Math.max(...dists);
  const lead = 0.12;
  const n = Math.round(((dmax - dmin) / c + lead + 2.5) * SR);
  // Distance bins, each low-passed by the air.
  const bins = 10;
  const bufs = Array.from({ length: bins }, () => new Float32Array(n));
  segs.forEach((s, i) => {
    const r = dists[i];
    const b = Math.min(bins - 1, Math.floor(((r - dmin) / (dmax - dmin + 1e-9)) * bins));
    const at = Math.round(((r - dmin) / c + lead) * SR);
    const tau = rng.range(0.0015, 0.006) * (1 + r / 3000);
    const w = Math.max(2, Math.round(tau * SR));
    const a = (s.len * rng.range(0.4, 1.6)) / Math.max(50, r);
    for (let k = 0; k < w && at + k < n; k++) bufs[b][at + k] += a * (1 - (2 * k) / w);
  });
  const mono = new Float32Array(n);
  for (let b = 0; b < bins; b++) {
    const r = dmin + ((b + 0.5) / bins) * (dmax - dmin);
    const fc = 150 + 11000 * Math.exp(-r / 650);
    const lp = biquad({ type: 'lowpass', freq: fc });
    runBiquad(bufs[b], lp);
    runBiquad(bufs[b], lp);
    for (let i = 0; i < n; i++) mono[i] += bufs[b][i];
  }
  // Rumble body following the envelope, and the crack of a near strike.
  const env = new Float32Array(n);
  let e = 0;
  const k = Math.exp(-1 / (0.08 * SR));
  for (let i = 0; i < n; i++) {
    e = Math.max(Math.abs(mono[i]), e * k);
    env[i] = e;
  }
  const rum = brownNoise(n, () => rng.next());
  runBiquad(rum, biquad({ type: 'lowpass', freq: 110 }));
  runBiquad(rum, biquad({ type: 'highpass', freq: 28 }));
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(mono[i]));
  for (let i = 0; i < n; i++) mono[i] = mono[i] / peak + rum[i] * (env[i] / peak) * 0.9;
  if (o.distance < 1200) {
    const at = Math.round(lead * SR);
    const len = Math.round(0.06 * SR);
    const crack = new Float32Array(len);
    for (let i = 0; i < len; i++) crack[i] = (rng.next() * 2 - 1) * Math.exp(-i / (0.012 * SR));
    runBiquad(crack, biquad({ type: 'highpass', freq: 900 }));
    const g = 1.4 * (1 - o.distance / 1200);
    for (let i = 0; i < len; i++) mono[at + i] += crack[i] * g;
  }
  // The roll dies away rather than stopping when the farthest segment has arrived.
  const fadeFrom = Math.round(n * 0.45);
  for (let i = fadeFrom; i < n; i++) mono[i] *= Math.exp((-3.2 * (i - fadeFrom)) / (n - fadeFrom));
  saturate(mono, 1.6);
  // Stereo by bearing, then the street.
  const pan = Math.sin(bearing) * 0.6;
  const dry = [mono.map((v) => v * Math.cos(((pan + 1) * Math.PI) / 4)), mono.map((v) => v * Math.sin(((pan + 1) * Math.PI) / 4))];
  const wet = convolveChannels(dry, makeIR('outdoors'));
  return dry.map((ch, ci) => {
    const o2 = new Float32Array(n);
    for (let i = 0; i < n; i++) o2[i] = ch[i] * 0.75 + wet[ci][i] * 1.1;
    return o2;
  });
}
