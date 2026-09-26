// @ts-check
// Recorded audio at run time (WP-P0-06's assets/audio/manifest.json): one-shot families with their variant rules
// (no-repeat, pitch and gain jitter, voice limits, cooldowns), looped layers with fades (ambience, rain, the
// generator), music tracks with crossfades that land on bar lines, and a convolution send per room space. The
// synthesized engine (src/engine/audio.js) asks this module first and keeps its own voices where no recording exists.

import { nextFloat, seedRng } from './rng.js';

const MANIFEST = 'assets/audio/manifest.json';
// sound draws its own random numbers: sharing Math.random with the renderer made what is drawn depend on when the
// audio context started running (a real-time event), and a capture could not repeat
const noise = seedRng(0x5a3d1e);
const rand = () => nextFloat(noise);

/**
 * @typedef {object} Family
 * @property {string} id
 * @property {string[]} paths
 * @property {Record<string, any>} params
 */

/** @type {AudioContext | null} */
let ctx = null;
/** @type {Record<string, AudioNode>} */
let buses = {};
/** @type {Map<string, Family>} */
const families = new Map();
/** @type {Map<string, Promise<AudioBuffer | null>>} */
const buffers = new Map();
/** @type {Map<string, AudioBuffer>} */
const ready = new Map();
/** @type {Map<string, { last: number, voices: number, at: number }>} */
const playState = new Map();
/** @type {Map<string, { src: AudioBufferSourceNode, gain: GainNode }>} */
const loops = new Map();
/** @type {Map<string, ConvolverNode>} */
const rooms = new Map();
/** @type {GainNode | null} */
let wet = null;
let space = 'apartment';
let loaded = false;
/** The scene has loaded: ambience loops and reverbs may download now. */
let open = false;

/** @type {{ track: string | null, src: AudioBufferSourceNode | null, gain: GainNode | null, started: number, barSeconds: number }} */
const music = { track: null, src: null, gain: null, started: 0, barSeconds: 4 };

/**
 * Starts loading the manifest and the one-shot sounds; music and loops load on first use.
 * @param {AudioContext} context
 * @param {{ music: AudioNode, sfx: AudioNode, ambience: AudioNode, ui: AudioNode }} out
 * @param {Promise<unknown>} [after]  what the ambience and reverbs wait for (the scene's first frame)
 */
export function initSampler(context, out, after = Promise.resolve()) {
  if (ctx) return;
  ctx = context;
  buses = out;
  wet = ctx.createGain();
  wet.gain.value = 0.22;
  wet.connect(out.sfx);
  fetch(MANIFEST)
    .then((r) => (r.ok ? r.json() : { assets: [] }))
    .then((m) => {
      for (const a of m.assets || []) {
        if (a.kind !== 'audio') continue;
        const vs = a.variants ? Object.values(a.variants).map((v) => /** @type {any} */ (v).path).filter(Boolean) : [];
        families.set(a.id.replace(/^audio\//, ''), { id: a.id, paths: vs.length ? vs : [a.path], params: a.params || {} });
      }
      loaded = true;
      // one-shots of the interface and effects load now (they must play the moment they are asked for); ambience and
      // the room reverbs wait for `after` (the scene's first frame), so they do not share its bandwidth
      for (const f of families.values()) if (!f.params.loop && (f.params.category === 'sfx' || f.params.category === 'ui')) f.paths.forEach(load);
      after.then(() => {
        open = true;
        for (const f of families.values()) if (!f.params.loop && f.params.category === 'ambience') f.paths.forEach(load);
        setSpace(space);
      });
    })
    .catch((err) => console.warn('audio manifest unavailable; synthesized sound only', err));
}

/** @param {string} path @returns {Promise<AudioBuffer | null>} */
function load(path) {
  let p = buffers.get(path);
  if (p) return p;
  p = fetch(path)
    .then((r) => r.arrayBuffer())
    .then((b) => /** @type {AudioContext} */ (ctx).decodeAudioData(b))
    .then((buf) => {
      ready.set(path, buf);
      return buf;
    })
    .catch((err) => {
      console.warn(`audio ${path} failed to load`, err);
      return null;
    });
  buffers.set(path, p);
  return p;
}

/** Whether a family exists in the manifest (loaded or not). @param {string} name */
export function hasFamily(name) {
  return families.has(name);
}

/** The room the sound plays in: apartment, stairwell, shop, basement or outdoors (the recorded impulse responses). @param {string} name */
export function setSpace(name) {
  space = name;
  if (!ctx || !loaded || !open || rooms.has(name)) return;
  const ir = families.get(`ir-${name}`);
  if (!ir) return;
  load(ir.paths[0]).then((buf) => {
    if (!buf || !ctx || !wet) return;
    const conv = ctx.createConvolver();
    conv.buffer = buf;
    conv.connect(wet);
    rooms.set(name, conv);
  });
}

/** @param {number} db */
const dbToGain = (db) => 10 ** (db / 20);

/**
 * Plays one take of a family, following its variant rules. Returns false when the family has no loaded take yet
 * (the caller falls back to synthesis) or the rules hold it back.
 * @param {string} name  family id without the 'audio/' prefix
 * @param {{ gain?: number, maxDur?: number }} [opt]
 */
export function playFamily(name, opt = {}) {
  const f = families.get(name);
  if (!ctx || !f) return false;
  const p = f.params;
  const st = playState.get(name) || { last: -1, voices: 0, at: -1e9 };
  playState.set(name, st);
  const now = ctx.currentTime;
  if (p.cooldown && now - st.at < p.cooldown) return true;
  if (p.maxVoices && st.voices >= p.maxVoices) return true;
  const takes = f.paths.map((path, i) => ({ path, i })).filter((t) => ready.has(t.path) && !(p.noRepeat && f.paths.length > 1 && t.i === st.last));
  if (!takes.length) {
    f.paths.forEach(load);
    return false;
  }
  const take = takes[Math.floor(rand() * takes.length)];
  const src = ctx.createBufferSource();
  src.buffer = /** @type {AudioBuffer} */ (ready.get(take.path));
  if (p.pitchCents) src.detune.value = (rand() * 2 - 1) * p.pitchCents;
  const g = ctx.createGain();
  g.gain.value = (opt.gain ?? 1) * (p.gainDb ? dbToGain((rand() * 2 - 1) * p.gainDb) : 1);
  src.connect(g);
  const bus = buses[p.bus || (p.category === 'ui' ? 'ui' : 'sfx')] || buses.sfx;
  g.connect(bus);
  const room = p.category === 'sfx' ? rooms.get(space) : null;
  if (room) g.connect(room);
  src.start(now + 0.005);
  if (opt.maxDur) {
    g.gain.setValueAtTime(g.gain.value, now + opt.maxDur - 0.3);
    g.gain.linearRampToValueAtTime(0.0001, now + opt.maxDur);
    src.stop(now + opt.maxDur + 0.05);
  }
  st.last = take.i;
  st.at = now;
  st.voices++;
  src.onended = () => (st.voices = Math.max(0, st.voices - 1));
  return true;
}

/**
 * Holds a looped family at a level (0 fades it out and stops it). Returns false while it has not loaded.
 * @param {string} name
 * @param {number} level  linear gain
 */
export function loopFamily(name, level) {
  const f = families.get(name);
  if (!ctx || !f || !open) return false;
  const cur = loops.get(name);
  const now = ctx.currentTime;
  if (level <= 0.001) {
    if (cur) {
      cur.gain.gain.setTargetAtTime(0, now, 0.6);
      cur.src.stop(now + 3);
      loops.delete(name);
    }
    return true;
  }
  if (cur) {
    cur.gain.gain.setTargetAtTime(level, now, 0.8);
    return true;
  }
  const path = f.paths[Math.floor(rand() * f.paths.length)];
  const buf = ready.get(path);
  if (!buf) {
    load(path);
    return false;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setTargetAtTime(level, now, 0.8);
  src.connect(g);
  g.connect(buses[f.params.bus] || buses.ambience);
  src.start(now + 0.01, rand() * buf.duration);
  loops.set(name, { src, gain: g });
  return true;
}

/**
 * Plays a music track, crossfading from the current one on its next bar line. null fades the music out (the synth
 * takes over). A transition track ('then') plays once before the loop it leads into.
 * @param {string | null} name  family id ('music-night'), or null
 * @param {{ then?: string }} [opt]
 * @returns {boolean} whether recorded music is (or will shortly be) playing
 */
export function playMusic(name, opt = {}) {
  if (!ctx) return false;
  if (name === music.track) return true;
  const f = name ? families.get(name) : null;
  if (name && !f) return false;
  const buf = f ? ready.get(f.paths[0]) : null;
  if (f && !buf) {
    // before the scene has loaded the synthesized music plays; the recording downloads after
    if (open) load(f.paths[0]);
    return false;
  }
  const now = ctx.currentTime;
  // the next bar line of the playing track
  const bar = music.barSeconds || 4;
  const since = music.src ? (now - music.started) % bar : bar;
  const at = music.src ? now + Math.min(bar - since, 2) : now + 0.05;
  if (music.src && music.gain) {
    music.gain.gain.setValueAtTime(music.gain.gain.value, at);
    music.gain.gain.linearRampToValueAtTime(0.0001, at + 1.5);
    music.src.stop(at + 1.6);
  }
  music.track = name;
  music.src = null;
  music.gain = null;
  if (!f || !buf) return false;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = !!f.params.loop;
  if (src.loop && f.params.loopEndSample) src.loopEnd = f.params.loopEndSample / buf.sampleRate;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(1, at + 1.5);
  src.connect(g);
  g.connect(buses.music);
  src.start(at);
  music.src = src;
  music.gain = g;
  music.started = at;
  music.barSeconds = f.params.barSeconds || 4;
  if (!src.loop && opt.then) {
    const next = opt.then;
    src.onended = () => {
      if (music.src === src) {
        music.track = null;
        playMusic(next);
      }
    };
  }
  return true;
}

/** Loads the music tracks ahead of use. @param {string[]} names */
export function preloadMusic(names) {
  for (const n of names) {
    const f = families.get(n);
    if (f) load(f.paths[0]);
  }
}

/** What is playing, for tests and the debug console. */
export function samplerStatus() {
  return { loaded, families: families.size, buffers: ready.size, music: music.track, loops: [...loops.keys()], space };
}
