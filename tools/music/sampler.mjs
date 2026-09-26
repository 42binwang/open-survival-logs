// @ts-check
// The offline sampler: plays MIDI tracks through SFZ instruments. Per note it picks the regions whose key and velocity
// ranges match (velocity crossfades between layers), advances each region's round-robin counter, reads the sample
// at the pitch ratio with a windowed-sinc interpolator, shapes it with the amplitude envelope (and the sustain pedal),
// loops sustained samples with a cross-faded loop when a note outlasts the recording, and filters by velocity.

import { SR, biquad, dbToGain, resampleStep, runBiquad } from '../audio/lib/dsp.mjs';
import { decode } from '../audio/lib/io.mjs';
import { Rng } from '../audio/lib/rng.mjs';
import { parseSfz } from './sfz.mjs';

/**
 * @typedef {import('./sfz.mjs').Region} Region
 * @typedef {{ t0: number, t1: number, key: number, vel: number }} NoteSpan  seconds
 * @typedef {{ t: number, cc: number, value: number }} CcPoint
 * @typedef {{ data: Float32Array[], attack: number, loop: { start: number, end: number, xf: number } | null, ext: Float32Array[] | null }} SampleData
 */

/** @type {Map<string, SampleData>} */
const samples = new Map();

/**
 * Loads a sample (48 kHz stereo) and analyses its attack point and a loop for sustained playback.
 * @param {string} path
 * @param {Region} r
 */
function sample(path, r) {
  const hit = samples.get(path);
  if (hit) return hit;
  let data = decode(path);
  if (data.length === 1) data = [data[0], data[0].slice()];
  const n = data[0].length;
  let peak = 0;
  for (const ch of data) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(ch[i]));
  const thr = peak * 10 ** (-42 / 20);
  let attack = 0;
  while (attack < n && Math.abs(data[0][attack]) < thr && Math.abs(data[1][attack]) < thr) attack++;
  attack = Math.max(0, attack - Math.round(0.002 * SR));
  /** @type {SampleData} */
  const s = { data, attack, loop: null, ext: null };
  if (r.loopMode === 'loop_continuous' || r.loopMode === 'loop_sustain') s.loop = findLoop(data, attack, r);
  samples.set(path, s);
  return s;
}

/**
 * A loop inside the sustain: after the attack settles, before the level falls into the release.
 * @param {Float32Array[]} data
 * @param {number} attack
 * @param {Region} r
 */
function findLoop(data, attack, r) {
  const n = data[0].length;
  if (r.loopStart != null && r.loopEnd != null) return { start: r.loopStart, end: r.loopEnd, xf: Math.round(r.loopCrossfade * SR) };
  const hop = Math.round(0.02 * SR);
  /** @type {number[]} */
  const env = [];
  for (let s = 0; s + hop <= n; s += hop) {
    let e = 0;
    for (let i = s; i < s + hop; i++) e += data[0][i] * data[0][i] + data[1][i] * data[1][i];
    env.push(Math.sqrt(e / (2 * hop)));
  }
  const mid = env.slice(Math.floor(env.length * 0.25), Math.floor(env.length * 0.6)).sort((a, b) => a - b);
  const sus = mid[Math.floor(mid.length / 2)] || 0;
  let endIdx = env.length - 1;
  while (endIdx > 0 && env[endIdx] < sus * 0.6) endIdx--;
  const end = Math.max(0, endIdx * hop - Math.round(0.08 * SR));
  let startIdx = Math.floor(attack / hop);
  while (startIdx < env.length && env[startIdx] < sus * 0.8) startIdx++;
  const start = Math.min(end, startIdx * hop + Math.round(0.35 * SR));
  const xf = Math.min(Math.round(r.loopCrossfade * SR), Math.floor((end - start) / 2), start);
  if (end - start < 0.6 * SR || xf < 0.05 * SR) return null;
  return { start, end, xf };
}

/**
 * The sample extended by repeating its loop (equal-power cross-fade at each seam) to at least `need` frames.
 * @param {SampleData} s
 * @param {number} need
 */
function extended(s, need) {
  if (!s.loop || need <= s.data[0].length) return s.data;
  if (s.ext && s.ext[0].length >= need) return s.ext;
  const { start, end, xf } = s.loop;
  const body = end - start;
  const total = Math.ceil(need / body) * body + end + xf;
  s.ext = s.data.map((ch) => {
    const out = new Float32Array(total);
    out.set(ch.subarray(0, end), 0);
    let p = end;
    while (p < total) {
      for (let i = 0; i < xf && p - xf + i < total; i++) {
        const t = i / xf;
        out[p - xf + i] = ch[end - xf + i] * Math.cos((t * Math.PI) / 2) + ch[start - xf + i] * Math.sin((t * Math.PI) / 2);
      }
      const len = Math.min(body, total - p);
      out.set(ch.subarray(start, start + len), p);
      p += len;
    }
    return out;
  });
  return s.ext;
}

export class Instrument {
  /** @param {string} sfzPath */
  constructor(sfzPath) {
    this.path = sfzPath;
    this.regions = parseSfz(sfzPath);
    /** @type {Map<number, number>} round-robin counters by region id */
    this.counters = new Map();
  }

  /**
   * Regions a note-on triggers, advancing round-robin counters.
   * @param {number} key
   * @param {number} vel
   */
  pick(key, vel) {
    /** @type {{ r: Region, gain: number }[]} */
    const out = [];
    for (const r of this.regions) {
      if (r.trigger !== 'attack' || key < r.lokey || key > r.hikey || vel < r.lovel || vel > r.hivel) continue;
      const c = this.counters.get(r.id) ?? 0;
      this.counters.set(r.id, c + 1);
      if (r.seqLength > 1 && c % r.seqLength !== r.seqPosition - 1) continue;
      let g = 1;
      if (r.xfin) g *= Math.sin((Math.max(0, Math.min(1, (vel - r.xfin[0]) / Math.max(1, r.xfin[1] - r.xfin[0]))) * Math.PI) / 2);
      if (r.xfout) g *= Math.cos((Math.max(0, Math.min(1, (vel - r.xfout[0]) / Math.max(1, r.xfout[1] - r.xfout[0]))) * Math.PI) / 2);
      if (g > 1e-4) out.push({ r, gain: g });
    }
    return out;
  }

  /** CC-triggered regions for a controller value. @param {number} cc @param {number} value */
  pickCc(cc, value) {
    /** @type {Region[]} */
    const out = [];
    for (const r of this.regions) {
      if (r.trigger !== 'cc' || !r.onCc || r.onCc.cc !== cc || value < r.onCc.lo || value > r.onCc.hi) continue;
      const c = this.counters.get(r.id) ?? 0;
      this.counters.set(r.id, c + 1);
      if (r.seqLength > 1 && c % r.seqLength !== r.seqPosition - 1) continue;
      out.push(r);
    }
    return out;
  }
}

/**
 * Renders one voice into a stereo buffer.
 * @param {Float32Array[]} out
 * @param {Region} r
 * @param {{ at: number, key: number, vel: number, releaseAt: number | null, gain: number, rng: Rng, used: Set<string> }} v
 *   at / releaseAt in output frames
 */
function voice(out, r, v) {
  const s = sample(r.sample, r);
  v.used.add(r.sample);
  const semis = ((v.key - r.keycenter) * r.keytrack) / 100 + r.transpose + r.tune / 100 + (r.pitchRandom ? (r.pitchRandom / 100) * (v.rng.next() - 0.5) : 0);
  const step = 2 ** (semis / 12);
  const start = r.offset + (r.offsetAuto ? s.attack : 0);
  const velCurve = (v.vel / 127) ** 2;
  const vt = r.veltrack / 100;
  const gain = v.gain * dbToGain(r.volume + (r.ampRandom ? r.ampRandom * (v.rng.next() - 0.5) : 0)) * (1 - vt + vt * velCurve);
  const oneShot = r.loopMode === 'one_shot';
  const relN = Math.max(1, Math.round(r.env.release * SR));
  const natural = Math.floor((s.data[0].length - start) / step);
  let len;
  if (oneShot || v.releaseAt == null) len = natural;
  else {
    const held = Math.max(0, v.releaseAt - v.at);
    len = held + relN;
    if (!s.loop) len = Math.min(len, natural);
  }
  len = Math.min(len, out[0].length - v.at);
  if (len <= 0) return;
  const src = extended(s, Math.ceil(start + len * step) + 64);
  const env = new Float32Array(len);
  const d = Math.round(r.env.delay * SR);
  const a = Math.max(1, Math.round(r.env.attack * SR));
  const h = Math.round(r.env.hold * SR);
  const dec = Math.max(1, Math.round(r.env.decay * SR));
  const relAt = oneShot || v.releaseAt == null ? Infinity : Math.max(0, v.releaseAt - v.at);
  let relFrom = 0;
  const relK = Math.exp(Math.log(0.001) / relN); // -60 dB after `release` seconds
  for (let i = 0; i < len; i++) {
    let level;
    if (i < relAt) {
      if (i < d) level = 0;
      else if (i < d + a) level = (i - d) / a;
      else if (i < d + a + h) level = 1;
      else if (r.env.decay > 0) level = r.env.sustain + (1 - r.env.sustain) * Math.exp((-(i - d - a - h) / dec) * 4.6);
      else level = r.env.sustain;
      relFrom = level;
    } else {
      relFrom *= relK;
      level = relFrom;
    }
    env[i] = level;
  }
  // Short fade at the natural end so a truncated sample never clicks.
  const tail = Math.min(len, Math.round(0.004 * SR));
  for (let i = 0; i < tail; i++) env[len - 1 - i] *= i / tail;
  let fc = null;
  if (r.filter) {
    const cutoff = Math.min(0.45 * SR, r.filter.cutoff * 2 ** ((r.filter.veltrack * (v.vel / 127)) / 1200));
    if (cutoff < 0.44 * SR) fc = biquad({ type: r.filter.type.startsWith('hpf') ? 'highpass' : 'lowpass', freq: cutoff, q: r.filter.resonance - 3.01 });
  }
  const pan = Math.max(-1, Math.min(1, r.pan / 100));
  const pg = [pan > 0 ? 1 - pan : 1, pan < 0 ? 1 + pan : 1];
  for (let c = 0; c < 2; c++) {
    const seg = step === 1 ? src[c].slice(start, start + len) : resampleStep(src[c], step, len, start);
    if (fc) runBiquad(seg, fc);
    const o = out[c];
    const g = gain * pg[c];
    const n = Math.min(seg.length, len);
    for (let i = 0; i < n; i++) o[v.at + i] += seg[i] * env[i] * g;
  }
}

/**
 * Renders a track (notes + controllers) into a stereo buffer of `frames` frames.
 * @param {Instrument} inst
 * @param {NoteSpan[]} notes
 * @param {CcPoint[]} ccs
 * @param {number} frames
 * @param {{ seed?: number, used?: Set<string>, loopAt?: number }} [o]  loopAt: seconds where a repeat of the same
 *   events begins; round-robin counters and random draws restart there so both passes are identical
 */
export function renderTrack(inst, notes, ccs, frames, o = {}) {
  const out = [new Float32Array(frames), new Float32Array(frames)];
  let rng = new Rng(o.seed ?? 1);
  let restarted = o.loopAt == null;
  const used = o.used ?? new Set();
  const pedal = ccs.filter((c) => c.cc === 64).sort((a, b) => a.t - b.t);
  /** @param {number} t */
  const pedalDown = (t) => {
    let down = false;
    for (const p of pedal) {
      if (p.t > t) break;
      down = p.value >= 64;
    }
    return down;
  };
  /** @param {number} t */
  const pedalUpAfter = (t) => pedal.find((p) => p.t > t && p.value < 64)?.t ?? null;
  const sorted = [...notes].sort((a, b) => a.t0 - b.t0 || a.key - b.key);
  for (const n of sorted) {
    if (!restarted && n.t0 >= /** @type {number} */ (o.loopAt) - 1e-6) {
      inst.counters.clear();
      rng = new Rng(o.seed ?? 1);
      restarted = true;
    }
    let rel = n.t1;
    if (pedalDown(n.t1)) rel = pedalUpAfter(n.t1) ?? frames / SR;
    const at = Math.round(n.t0 * SR);
    if (at >= frames) continue;
    for (const { r, gain } of inst.pick(n.key, n.vel)) voice(out, r, { at, key: n.key, vel: n.vel, releaseAt: Math.round(rel * SR), gain, rng, used });
  }
  let prev = 0;
  for (const p of pedal) {
    const val = p.value;
    if ((val >= 64) !== (prev >= 64)) {
      const at = Math.round(p.t * SR);
      for (const r of inst.pickCc(64, val)) if (at < frames) voice(out, r, { at, key: r.keycenter, vel: 80, releaseAt: null, gain: 1, rng, used });
    }
    prev = val;
  }
  // Channel volume (CC7) and expression (CC11) as a smoothed gain curve.
  const vol = curve(ccs, 7, 100, frames);
  const expr = curve(ccs, 11, 127, frames);
  const k = Math.exp(-1 / (0.01 * SR));
  let g = ((vol[0] / 127) ** 2) * ((expr[0] / 127) ** 2);
  for (let i = 0; i < frames; i++) {
    const target = ((vol[i] / 127) ** 2) * ((expr[i] / 127) ** 2);
    g = target + (g - target) * k;
    out[0][i] *= g;
    out[1][i] *= g;
  }
  return out;
}

/**
 * Step curve of a controller over the frames (value holds until the next event).
 * @param {CcPoint[]} ccs
 * @param {number} cc
 * @param {number} dflt
 * @param {number} frames
 */
function curve(ccs, cc, dflt, frames) {
  const pts = ccs.filter((c) => c.cc === cc).sort((a, b) => a.t - b.t);
  const out = new Float32Array(frames).fill(pts.length && pts[0].t <= 0 ? pts[0].value : dflt);
  for (let i = 0; i < pts.length; i++) {
    const from = Math.max(0, Math.round(pts[i].t * SR));
    const to = i + 1 < pts.length ? Math.min(frames, Math.round(pts[i + 1].t * SR)) : frames;
    out.fill(pts[i].value, from, to);
  }
  return out;
}

/** Forgets cached sample data (between compositions, to bound memory). */
export function clearSampleCache() {
  samples.clear();
}
