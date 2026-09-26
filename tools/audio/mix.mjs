#!/usr/bin/env node
// @ts-check
// Renders the 60-second audio test offline, exactly as pages/audio-test.html builds it live:
//
//   voice ─ gain envelope (fades, automation) ┬─ portal (other room) ─ PannerNode (equal-power, inverse distance) ─ bus
//                                              └─ send (pre-panner) ─ high-pass ─ ConvolverNode <space> ─ portal ─ bus
//   bus ─ fader ─ duck (voice-activity ducking curve) ─ master ─ static gain ─ limiter
//
// Writes the room IRs (assets/audio/ir/<space>.wav), the scene (assets/audio/test/audio-test-60s.json, with the
// ducking curves and the master gain), the render (assets/audio/test/audio-test-60s.ogg, -16 LUFS, <= -1 dBTP) and
// their manifest entries.
//
//   node tools/audio/mix.mjs [test-60s] [--stems]    --stems also writes the bus stems to tools/audio/.build/ for inspection

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SR, biquad, dbToGain, filterChannels, runBiquad, varispeed, makeChannels, BUTTER_Q } from './lib/dsp.mjs';
import { convolveChannels } from './lib/fft.mjs';
import { BUILD, ROOT, decode, rel, writeWav, measure, duration } from './lib/io.mjs';
import { loudness } from './lib/loudness.mjs';
import { masterToOgg } from './lib/master.mjs';
import { TARGETS } from './chain.mjs';
import { makeIR } from './spaces.mjs';
import { buildIRs } from './build-ir.mjs';
import { buildScene } from './scene.mjs';
import { readManifest, updateManifest } from './manifest.mjs';

const TEST_DIR = join(ROOT, 'assets', 'audio', 'test');
export const CURVE_RATE = 100;

/**
 * @typedef {import('./scene.mjs').Cue} Cue
 * @typedef {import('./scene.mjs').Vec3} Vec3
 */

/** @param {Vec3} a @param {Vec3} b */
const sub = (a, b) => /** @type {Vec3} */ ([a[0] - b[0], a[1] - b[1], a[2] - b[2]]);
/** @param {Vec3} a @param {Vec3} b */
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** @param {Vec3} a @param {Vec3} b */
const cross = (a, b) => /** @type {Vec3} */ ([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]);
/** @param {Vec3} a */
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return /** @type {Vec3} */ ([a[0] / l, a[1] / l, a[2] / l]);
};

/**
 * PannerNode (panningModel 'equalpower', distanceModel 'inverse', omnidirectional cone) gains for a mono source, per
 * the Web Audio specification.
 * @param {Vec3} src
 * @param {{ position: Vec3, forward: Vec3, up: Vec3 }} lis
 * @param {{ refDistance: number, maxDistance: number, rolloffFactor: number }} p
 * @returns {[number, number]}
 */
export function pannerGains(src, lis, p) {
  const rel3 = sub(src, lis.position);
  const dist = Math.hypot(rel3[0], rel3[1], rel3[2]);
  let azimuth = 0;
  if (dist > 1e-6) {
    const s = norm(rel3);
    const fwd = norm(lis.forward);
    const right = norm(cross(fwd, lis.up));
    const up = cross(right, fwd);
    const upProj = dot(s, up);
    const proj = norm(sub(s, [up[0] * upProj, up[1] * upProj, up[2] * upProj]));
    azimuth = (180 / Math.PI) * Math.acos(Math.max(-1, Math.min(1, dot(proj, right))));
    if (dot(proj, fwd) < 0) azimuth = 360 - azimuth;
    azimuth = azimuth >= 0 && azimuth <= 270 ? 90 - azimuth : 450 - azimuth;
  }
  if (azimuth < -90) azimuth = -180 - azimuth;
  else if (azimuth > 90) azimuth = 180 - azimuth;
  const x = (azimuth + 90) / 180;
  const d = Math.max(p.refDistance, Math.min(dist, p.maxDistance));
  const g = p.refDistance / (p.refDistance + p.rolloffFactor * (d - p.refDistance));
  return [Math.cos((x * Math.PI) / 2) * g, Math.sin((x * Math.PI) / 2) * g];
}

/**
 * Gain of a cue over its frames: base level, fades and automation, all linear in amplitude as the page's
 * linearRampToValueAtTime.
 * @param {Cue} c
 * @param {number} len
 */
export function envelope(c, len) {
  const env = new Float32Array(len);
  const base = dbToGain(c.gainDb);
  const pts = [...(c.automation ?? [])].sort((a, b) => a.t - b.t);
  const fi = Math.round((c.fadeIn ?? 0) * SR);
  const fo = Math.round((c.fadeOut ?? 0) * SR);
  for (let i = 0; i < len; i++) {
    const t = c.t + i / SR;
    let g = base;
    for (let k = 0, from = base; k < pts.length; k++) {
      const a = pts[k];
      const to = dbToGain(a.gainDb);
      if (t < a.t) break;
      g = t >= a.t + a.ramp ? to : from + ((to - from) * (t - a.t)) / (a.ramp || 1e-9);
      from = to;
    }
    let f = 1;
    if (fi && i < fi) f *= i / fi;
    if (fo && i > len - fo) f *= (len - i) / fo;
    env[i] = g * f;
  }
  return env;
}

/**
 * @param {string} path
 * @param {Map<string, Float32Array[]>} cache
 */
function load(path, cache) {
  let x = cache.get(path);
  if (!x) {
    x = decode(join(ROOT, path));
    cache.set(path, x);
  }
  return x;
}

/**
 * Renders a scene; returns the master mix before normalization, the bus signals and the ducking curves.
 * @param {any} scene
 * @param {Map<string, any>} assets  manifest entries by id
 */
export function renderScene(scene, assets) {
  const N = Math.round(scene.duration * SR);
  const cache = new Map();
  /** @type {Record<string, Float32Array[]>} */
  const buses = { music: makeChannels(N), sfx: makeChannels(N), ambience: makeChannels(N), ui: makeChannels(N) };
  /** @type {Map<string, Float32Array>} bus:space -> mono reverb input */
  const sends = new Map();
  /** @type {{ bus: string, tags: string[], t0: number, t1: number }[]} */
  const active = [];
  const lis = scene.listener;
  /** @param {string | undefined} space */
  const portalOf = (space) => (space && space !== lis.space ? scene.spaces[space]?.portal : null);
  /** @param {Float32Array[]} chans @param {{ lowpass: number, gainDb: number } | null} portal */
  const applyPortal = (chans, portal) => {
    if (!portal) return;
    const c = biquad({ type: 'lowpass', freq: portal.lowpass, q: BUTTER_Q });
    const g = dbToGain(portal.gainDb);
    for (const ch of chans) {
      runBiquad(ch, c);
      for (let i = 0; i < ch.length; i++) ch[i] *= g;
    }
  };
  for (const c of /** @type {Cue[]} */ (scene.cues)) {
    const a = assets.get(c.asset);
    if (!a) throw new Error(`mix: unknown asset ${c.asset}`);
    const file = c.variant ? a.variants[c.variant].path : a.path;
    let src = load(file, cache);
    if (c.pitch && c.pitch !== 1) src = varispeed(src, c.pitch);
    const srcLen = src[0].length;
    const t0 = Math.round(c.t * SR);
    const looping = c.kind === 'loop' || (c.kind === 'music' && a.params.loop);
    const endT = c.end ?? (looping ? scene.duration : c.t + srcLen / SR);
    const len = Math.max(0, Math.min(N - t0, Math.round((endT - c.t) * SR), looping ? Infinity : srcLen - Math.round((c.offset ?? 0) * SR)));
    if (!len) continue;
    const off = Math.round((c.offset ?? 0) * SR);
    const env = envelope(c, len);
    const voice = src.map((ch) => {
      const y = new Float32Array(len);
      for (let i = 0; i < len; i++) y[i] = ch[looping ? (off + i) % srcLen : off + i] * env[i];
      return y;
    });
    active.push({ bus: c.bus, tags: c.tags ?? [], t0: c.t, t1: c.t + len / SR });
    const bus = buses[c.bus];
    if (c.position) {
      const mono = voice.length === 1 ? voice[0] : voice[0].map((v, i) => (v + voice[1][i]) / 2);
      const sendMap = { ...(c.space ? { [c.space]: scene.spaces[c.space].wetDb } : {}), ...(c.sends ?? {}) };
      for (const [space, db] of Object.entries(sendMap)) {
        const key = `${c.bus}:${space}`;
        if (!sends.has(key)) sends.set(key, new Float32Array(N));
        const s = /** @type {Float32Array} */ (sends.get(key));
        const g = dbToGain(db);
        for (let i = 0; i < len; i++) s[t0 + i] += mono[i] * g;
      }
      const dry = [mono.slice()];
      applyPortal(dry, portalOf(c.space));
      const [gl, gr] = pannerGains(c.position, lis, scene.panner);
      for (let i = 0; i < len; i++) {
        bus[0][t0 + i] += dry[0][i] * gl;
        bus[1][t0 + i] += dry[0][i] * gr;
      }
    } else {
      const st = voice.length === 1 ? [voice[0], voice[0].slice()] : voice;
      applyPortal(st, portalOf(c.space));
      for (let ch = 0; ch < 2; ch++) for (let i = 0; i < len; i++) bus[ch][t0 + i] += st[ch][i];
    }
  }
  // Room reverbs: one convolver per bus and space, returned through the space's portal.
  /** @type {Record<string, Float32Array[]>} */
  const irs = {};
  for (const [key, input] of sends) {
    const [busName, space] = key.split(':');
    irs[space] ??= makeIR(space);
    const hp = biquad({ type: 'highpass', freq: scene.spaces[space].sendHighpass ?? 20, q: BUTTER_Q });
    runBiquad(input, hp);
    const wet = convolveChannels([input], irs[space]);
    const out = wet.map((ch) => ch.slice(0, N));
    applyPortal(out, portalOf(space));
    for (let ch = 0; ch < 2; ch++) for (let i = 0; i < N; i++) buses[busName][ch][i] += out[ch][i];
  }
  // Voice-activity ducking curves (dB, CURVE_RATE Hz), the deepest rule per target bus.
  const frames = Math.ceil(scene.duration * CURVE_RATE) + 1;
  /** @type {Record<string, number[]>} */
  const duck = {};
  for (const rule of scene.ducking) {
    const curve = new Float64Array(frames);
    let cur = 0;
    for (let k = 0; k < frames; k++) {
      const t = k / CURVE_RATE;
      const on = active.some((v) => v.bus === rule.trigger && v.tags.includes(rule.tag) && t >= v.t0 && t < v.t1);
      const target = on ? rule.depthDb : 0;
      const tau = target < cur ? rule.attack : rule.release;
      cur = target + (cur - target) * Math.exp(-1 / (tau * CURVE_RATE));
      curve[k] = cur;
    }
    const prev = duck[rule.target];
    duck[rule.target] = Array.from(curve, (v, k) => Math.round(Math.min(v, prev ? prev[k] : 0) * 100) / 100);
  }
  // Faders and ducking, then the master sum.
  const mix = makeChannels(N);
  for (const [name, bus] of Object.entries(buses)) {
    const fader = dbToGain(scene.buses[name].gainDb);
    const curve = duck[name];
    for (let i = 0; i < N; i++) {
      let g = fader;
      if (curve) {
        const x = (i / SR) * CURVE_RATE;
        const k = Math.floor(x);
        const d = curve[k] + ((curve[Math.min(curve.length - 1, k + 1)] ?? curve[k]) - curve[k]) * (x - k);
        g *= dbToGain(d);
      }
      bus[0][i] *= g;
      bus[1][i] *= g;
      mix[0][i] += bus[0][i];
      mix[1][i] += bus[1][i];
    }
  }
  filterChannels(mix, scene.masterEq ?? []);
  const master = dbToGain(scene.buses.master.gainDb);
  for (const ch of mix) for (let i = 0; i < N; i++) ch[i] *= master;
  return { mix, buses, duck };
}

async function main() {
  const t0 = Date.now();
  const manifest = readManifest();
  const assets = new Map(manifest.assets.map((e) => [e.id, e]));
  buildIRs([]);
  const scene = /** @type {any} */ (buildScene(Object.fromEntries(manifest.assets.map((e) => [e.id, /** @type {any} */ (e)]))));
  const { mix, buses, duck } = renderScene(scene, assets);
  if (process.argv.includes('--stems')) {
    for (const [name, b] of Object.entries(buses)) writeWav(join(BUILD, `test-bus-${name}.wav`), b, SR, 'f32');
    writeWav(join(BUILD, 'test-premaster.wav'), mix, SR, 'f32');
  }
  mkdirSync(TEST_DIR, { recursive: true });
  const ogg = join(TEST_DIR, 'audio-test-60s.ogg');
  const rep = masterToOgg(ogg, mix, { lufs: TARGETS.testMixLufs, maxTruePeak: TARGETS.maxTruePeak, quality: 6, comment: ['TITLE=Survival Log - 60-second audio test', 'ARTIST=Survival Logs audio lane (WP-P0-06)'] });
  const m = measure(ogg);
  scene.masterGainDb = Math.round(rep.gainDb * 100) / 100;
  scene.duck = { rate: CURVE_RATE, curves: duck };
  scene.render = { file: rel(ogg), durationSec: duration(ogg), lufs: m.integrated, truePeak: m.truePeak, lra: m.lra };
  const busLoud = Object.fromEntries(Object.entries(buses).map(([k, b]) => [k, Math.round(loudness(b).integrated * 10) / 10]));
  scene.render.busLufs = busLoud;
  const scenePath = join(TEST_DIR, 'audio-test-60s.json');
  writeFileSync(scenePath, `${JSON.stringify(scene, null, 1)}\n`);
  const used = [...new Set(scene.cues.map((/** @type {Cue} */ c) => c.asset))].sort();
  updateManifest(
    [
      {
        id: 'audio/test-60s',
        kind: 'audio',
        path: rel(ogg),
        license: 'LicenseRef-Original',
        files: { scene: rel(scenePath) },
        params: { title: scene.title, category: 'test', sections: scene.sections, uses: used },
        meta: { durationSec: scene.render.durationSec, lufs: m.integrated, truePeak: m.truePeak, lra: m.lra, target: { lufs: TARGETS.testMixLufs }, busLufs: busLoud },
      },
    ],
    (id) => id === 'audio/test-60s',
    'test',
  );
  console.log(`audio-test-60s: ${scene.render.durationSec.toFixed(2)} s, ${m.integrated} LUFS, TP ${m.truePeak} dBTP, LRA ${m.lra} LU, master ${scene.masterGainDb} dB, ${scene.cues.length} cues, buses ${JSON.stringify(busLoud)}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) await main();
