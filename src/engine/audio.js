// Audio (A14): WebAudio-synthesized music and sound effects, no external files. Music is generated per mood:
// title, pre-disaster rush, each character's home (darker at night), exploration, hordes (tense) and the record
// player's nine tracks. SFX follow bus events (doors, zombies, chainsaws, electric nets, drone, thunder, cooking,
// the phone ringing or vibrating, achievements); rain is ambience. Volumes follow game.settings
// (volume / music / sfx); the context starts on the first user gesture.
import { on } from './bus.js';
import { game } from '../game.js';
import { isNight } from '../sim/time.js';
import { musicPlaying } from '../meta/profile.js';
import { initSampler, playFamily, loopFamily, playMusic, preloadMusic, setSpace, samplerStatus } from './sampler.js';
import { homeDef } from '../sim/home.js';
import { furn, ELEC } from '../data/db.js';
import { nextFloat, seedRng } from './rng.js';

// sound draws its own random numbers: sharing Math.random with the renderer made what is drawn depend on when
// the audio context started running (a real-time event), and a capture could not repeat
const audioRng = seedRng(0xa0d10);
const rand = () => nextFloat(audioRng);

const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;

let ctx = null;
let master = null;
let musicBus = null;
let sfxBus = null;
let ambBus = null;
let noiseBuf = null;
let rainGain = null;
let started = false;

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];

const MOODS = {
  title: { bpm: 62, root: 57, scale: MINOR, prog: [0, 5, 3, 4], pad: 'triangle', lead: 'sine', cutoff: 1500, arp: 0.35, bass: true, perc: 0, padGain: 0.07, seed: 1 },
  pre: { bpm: 104, root: 60, scale: DORIAN, prog: [0, 3, 4, 3], pad: 'triangle', lead: 'square', cutoff: 1800, arp: 0.55, bass: true, perc: 0.35, padGain: 0.04, seed: 2 },
  wage: { bpm: 76, root: 55, scale: DORIAN, prog: [0, 3, 4, 3], pad: 'sawtooth', lead: 'triangle', cutoff: 1100, arp: 0.4, bass: true, perc: 0.15, padGain: 0.045, seed: 3 },
  student: { bpm: 84, root: 60, scale: LYDIAN, prog: [0, 5, 3, 4], pad: 'triangle', lead: 'triangle', cutoff: 2200, arp: 0.55, bass: true, perc: 0.1, padGain: 0.06, seed: 4 },
  warehouse: { bpm: 68, root: 50, scale: MINOR, prog: [0, 0, 5, 6], pad: 'sawtooth', lead: 'sine', cutoff: 800, arp: 0.25, bass: true, drone: true, perc: 0.2, padGain: 0.05, seed: 5 },
  explore: { bpm: 100, root: 52, scale: MINOR, prog: [0, 6, 5, 6], pad: 'sawtooth', lead: 'triangle', cutoff: 1000, arp: 0.5, bass: true, perc: 0.5, padGain: 0.04, seed: 6 },
  horde: { bpm: 132, root: 45, scale: PHRYGIAN, prog: [0, 1, 0, 6], pad: 'sawtooth', lead: 'square', cutoff: 950, arp: 0.7, bass: true, pulse: true, perc: 1, snare: true, padGain: 0.04, seed: 7 },
  death: { bpm: 48, root: 48, scale: MINOR, prog: [0, 5], pad: 'triangle', lead: 'sine', cutoff: 700, arp: 0.1, bass: true, perc: 0, padGain: 0.06, seed: 8 },
  ending: { bpm: 72, root: 60, scale: MAJOR, prog: [0, 4, 5, 3], pad: 'triangle', lead: 'triangle', cutoff: 2400, arp: 0.5, bass: true, perc: 0, padGain: 0.06, seed: 9 },
};

// One mood per record (items 11014-11022, in order).
const RECORD_MOODS = [
  { bpm: 72, root: 57, scale: MINOR, prog: [0, 5, 2, 6] },
  { bpm: 58, root: 50, scale: MINOR, prog: [0, 3, 5, 4] },
  { bpm: 80, root: 60, scale: MAJOR, prog: [0, 4, 5, 3] },
  { bpm: 66, root: 52, scale: PHRYGIAN, prog: [0, 1, 3, 1] },
  { bpm: 92, root: 62, scale: MAJOR, prog: [0, 3, 4, 0] },
  { bpm: 70, root: 64, scale: LYDIAN, prog: [0, 5, 3, 4] },
  { bpm: 76, root: 48, scale: DORIAN, prog: [0, 6, 5, 6] },
  { bpm: 112, root: 45, scale: MINOR, prog: [0, 0, 6, 5] },
  { bpm: 68, root: 55, scale: MAJOR, prog: [0, 5, 3, 4] },
];

const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);
const scaleNote = (scale, i) => scale[((i % 7) + 7) % 7] + 12 * Math.floor(i / 7);

function hash(a, b, c) {
  let x = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 1274126177)) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

// ------------------------------------------------------------------------------------------ setup
function ensure() {
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    musicBus = ctx.createGain();
    sfxBus = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    ambBus = ctx.createGain();
    musicBus.connect(master);
    sfxBus.connect(master);
    ambBus.connect(master);
    master.connect(comp);
    comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = rand() * 2 - 1;
    applyVolumes();
    startRain();
    // recorded sound (assets/audio): asked first by every cue, the music and the ambience
    // ambience, reverbs and music load once the scene has (they held a cold start back sharing its bandwidth); the
    // synthesized voices cover anything asked for before
    const sceneLoaded = Promise.resolve(game.ui?.renderer?.ready);
    initSampler(ctx, { music: musicBus, sfx: sfxBus, ambience: ambBus, ui: sfxBus }, sceneLoaded);
    sceneLoaded.then(() => setTimeout(() => preloadMusic(['music-pre-outbreak', 'music-day', 'music-night', 'music-horde', 'music-night-to-horde', 'music-horde-end', 'music-ending']), 1000));
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function applyVolumes() {
  if (!ctx) return;
  const s = game.settings || {};
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(num(s.volume, 0.6), t, 0.05);
  musicBus.gain.setTargetAtTime(num(s.music, 0.4) * 0.8, t, 0.1);
  sfxBus.gain.setTargetAtTime(num(s.sfx, 0.7), t, 0.05);
  ambBus?.gain.setTargetAtTime(num(s.sfx, 0.7) * 0.8, t, 0.05);
}

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);

// ------------------------------------------------------------------------------------------ voices
function tone({ time, f, dur, type = 'sine', gain = 0.1, attack = 0.01, release = 0.1, cutoff = 0, bus = musicBus, slideTo = 0, detune = 0 }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, time);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), time + dur);
  if (detune) o.detune.value = detune;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.linearRampToValueAtTime(gain, time + attack);
  g.gain.setValueAtTime(gain, time + Math.max(attack, dur - release));
  g.gain.linearRampToValueAtTime(0.0001, time + dur);
  let node = o;
  if (cutoff) {
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = cutoff;
    o.connect(fl);
    node = fl;
  }
  node.connect(g);
  g.connect(bus);
  o.start(time);
  o.stop(time + dur + 0.05);
  return o;
}

function noise({ time, dur, gain = 0.1, type = 'highpass', f = 3000, q = 0.7, attack = 0.005, bus = sfxBus, sweepTo = 0 }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, time);
  if (sweepTo) fl.frequency.exponentialRampToValueAtTime(sweepTo, time + dur);
  fl.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.linearRampToValueAtTime(gain, time + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  src.connect(fl);
  fl.connect(g);
  g.connect(bus);
  src.start(time, rand());
  src.stop(time + dur + 0.05);
}

function startRain() {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2600;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 500;
  rainGain = ctx.createGain();
  rainGain.gain.value = 0;
  src.connect(lp);
  lp.connect(hp);
  hp.connect(rainGain);
  rainGain.connect(sfxBus);
  src.start();
}

// ------------------------------------------------------------------------------------------ sound effects
const SFX = {
  click(t) {
    tone({ time: t, f: 1500, dur: 0.035, type: 'square', gain: 0.03, attack: 0.002, release: 0.025, bus: sfxBus });
  },
  door(t) {
    tone({ time: t, f: 120, slideTo: 42, dur: 0.28, type: 'sine', gain: 0.45, attack: 0.003, release: 0.2, bus: sfxBus });
    noise({ time: t, dur: 0.22, gain: 0.25, type: 'lowpass', f: 500 });
    noise({ time: t, dur: 0.07, gain: 0.12, type: 'bandpass', f: 1900, q: 2 });
  },
  groan(t) {
    const base = 80 + rand() * 45;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base * 1.15, t);
    o.frequency.exponentialRampToValueAtTime(base * 0.8, t + 1.4);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5 + rand() * 3;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = base * 0.06;
    lfo.connect(lfoGain);
    lfoGain.connect(o.frequency);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420 + rand() * 200;
    bp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    o.connect(bp);
    bp.connect(g);
    g.connect(sfxBus);
    o.start(t);
    lfo.start(t);
    o.stop(t + 1.55);
    lfo.stop(t + 1.55);
  },
  chainsaw(t) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(92, t);
    o.frequency.linearRampToValueAtTime(118, t + 0.3);
    o.frequency.linearRampToValueAtTime(104, t + 0.9);
    const trem = ctx.createOscillator();
    trem.frequency.value = 32;
    const tremGain = ctx.createGain();
    tremGain.gain.value = 0.04;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.05);
    g.gain.setValueAtTime(0.07, t + 0.75);
    g.gain.linearRampToValueAtTime(0.0001, t + 0.95);
    trem.connect(tremGain);
    tremGain.connect(g.gain);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 1.2;
    o.connect(bp);
    bp.connect(g);
    g.connect(sfxBus);
    o.start(t);
    trem.start(t);
    o.stop(t + 1);
    trem.stop(t + 1);
  },
  drone(t) {
    for (const d of [0, 7]) tone({ time: t, f: 230 + d, slideTo: 250 + d, dur: 1.4, type: 'sawtooth', gain: 0.025, attack: 0.3, release: 0.5, cutoff: 1400, bus: sfxBus });
  },
  thunder(t) {
    noise({ time: t, dur: 0.12, gain: 0.3, type: 'highpass', f: 1800 });
    noise({ time: t + 0.05, dur: 2.8, gain: 0.55, type: 'lowpass', f: 320, sweepTo: 90, attack: 0.08 });
  },
  sizzle(t) {
    noise({ time: t, dur: 1.6, gain: 0.07, type: 'highpass', f: 3500, attack: 0.1 });
    for (let i = 0; i < 10; i++) noise({ time: t + rand() * 1.4, dur: 0.03, gain: 0.08, type: 'highpass', f: 5000 });
  },
  hammer(t) {
    for (let i = 0; i < 3; i++) {
      const k = t + i * 0.22;
      tone({ time: k, f: 190, slideTo: 90, dur: 0.09, type: 'sine', gain: 0.25, attack: 0.002, release: 0.07, bus: sfxBus });
      noise({ time: k, dur: 0.06, gain: 0.1, type: 'bandpass', f: 1100, q: 1.5 });
    }
  },
  jingle(t) {
    [72, 76, 79, 84].forEach((m, i) => tone({ time: t + i * 0.09, f: freq(m), dur: 0.5, type: 'triangle', gain: 0.12, attack: 0.005, release: 0.4, bus: sfxBus }));
    tone({ time: t + 0.36, f: freq(91), dur: 0.7, type: 'sine', gain: 0.05, attack: 0.005, release: 0.6, bus: sfxBus });
  },
  siren(t) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(480, t);
    for (let i = 0; i < 3; i++) {
      o.frequency.linearRampToValueAtTime(880, t + i + 0.5);
      o.frequency.linearRampToValueAtTime(480, t + i + 1);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.08, t + 0.3);
    g.gain.setValueAtTime(0.08, t + 2.6);
    g.gain.linearRampToValueAtTime(0.0001, t + 3);
    o.connect(g);
    g.connect(sfxBus);
    o.start(t);
    o.stop(t + 3.05);
  },
  death(t) {
    [45, 48, 52].forEach((m) => tone({ time: t, f: freq(m), dur: 2.5, type: 'triangle', gain: 0.08, attack: 0.05, release: 2, cutoff: 900, bus: sfxBus }));
  },
  crackle(t) {
    noise({ time: t, dur: 0.02, gain: 0.02, type: 'highpass', f: 4000 });
  },
  zap(t) {
    noise({ time: t, dur: 0.2, gain: 0.12, type: 'bandpass', f: 2600, q: 5 });
    tone({ time: t, f: 110, dur: 0.2, type: 'square', gain: 0.04, attack: 0.002, release: 0.12, cutoff: 1800, bus: sfxBus });
  },
  ring(t) {
    for (let i = 0; i < 2; i++) {
      const k = t + i * 0.45;
      tone({ time: k, f: 1320, dur: 0.12, type: 'triangle', gain: 0.07, attack: 0.004, release: 0.05, bus: sfxBus });
      tone({ time: k + 0.14, f: 1760, dur: 0.16, type: 'triangle', gain: 0.07, attack: 0.004, release: 0.08, bus: sfxBus });
    }
  },
  vibrate(t) {
    for (let i = 0; i < 2; i++) {
      const k = t + i * 0.5;
      tone({ time: k, f: 140, dur: 0.32, type: 'sawtooth', gain: 0.06, attack: 0.01, release: 0.05, cutoff: 380, bus: sfxBus });
      noise({ time: k, dur: 0.3, gain: 0.04, type: 'bandpass', f: 220, q: 4 });
    }
  },
};

const MIN_GAP = { click: 0.03, door: 0.25, groan: 0.6, chainsaw: 0.8, drone: 1.5, thunder: 4, sizzle: 1.5, hammer: 0.5, jingle: 0.8, siren: 5, zap: 0.5, ring: 2.5, vibrate: 2 };
const lastAt = {};

// Cues requested by game events, newest last; recorded even without an AudioContext (Node tests read it).
export const sfxLog = [];
const SFX_LOG_MAX = 50;

function cue(name) {
  sfxLog.push(name);
  if (sfxLog.length > SFX_LOG_MAX) sfxLog.shift();
  return playSfx(name);
}

/** Synth cues that have a recorded family (assets/audio/manifest.json), with the options they play it with. */
const CUE_FAMILY = {
  door: ['door-bang'],
  groan: ['zombie-groan'],
  thunder: ['thunder'],
  sizzle: ['cooking-sizzle', { maxDur: 3 }],
  click: ['ui-click'],
  jingle: ['ui-confirm'],
  error: ['ui-error'],
  pickup: ['pickup'],
  knock: ['door-knock'],
};

export function playSfx(name) {
  if (!ctx || ctx.state !== 'running') return false;
  const rec = CUE_FAMILY[name];
  if (rec && playFamily(rec[0], rec[1])) return true;
  if (!SFX[name]) return false;
  const t = ctx.currentTime;
  if (lastAt[name] != null && t - lastAt[name] < (MIN_GAP[name] || 0)) return false;
  lastAt[name] = t;
  try {
    SFX[name](t + 0.01);
  } catch (err) {
    console.warn('sfx failed', name, err);
  }
  return true;
}

// ------------------------------------------------------------------------------------------ music
function hordeActive(s) {
  return (s.crises?.active || []).some((c) => c.type === 'horde' && (c.phase === 'attack' || c.phase === 'active' || c.attacking));
}

export function currentMood(s = game.state) {
  if (!s) return 'title';
  if (s.phase === 'dead') return 'death';
  if (s.phase === 'ending') return 'ending';
  const rec = s.player?.scene === 'home' ? musicPlaying(s) : null;
  if (rec) return `record:${rec.data.track || 0}`;
  if (hordeActive(s)) return 'horde';
  if (s.phase === 'pre') return 'pre';
  if (s.player?.scene && s.player.scene !== 'home') return 'explore';
  const ch = MOODS[s.meta?.character] ? s.meta.character : 'wage';
  return s.clock && isNight(s.clock) ? `${ch}:night` : ch;
}

function moodDef(mood) {
  if (mood.startsWith('record:')) {
    const i = (Number(mood.slice(7)) || 0) % RECORD_MOODS.length;
    return { ...RECORD_MOODS[i], pad: 'triangle', lead: 'triangle', cutoff: 2600, arp: 0.75, bass: true, perc: 0.25, padGain: 0.05, seed: 100 + i, record: true };
  }
  const [base, night] = mood.split(':');
  const d = { ...(MOODS[base] || MOODS.wage) };
  if (night === 'night') {
    d.cutoff *= 0.55;
    d.bpm = Math.round(d.bpm * 0.85);
    d.scale = base === 'student' ? DORIAN : MINOR;
    d.arp *= 0.6;
    d.perc *= 0.5;
    d.seed += 50;
  }
  return d;
}

const seq = { mood: null, def: null, next: 0, step: 0, bar: 0, chord: [] };

function chordFor(def, bar) {
  const deg = def.prog[bar % def.prog.length];
  return [0, 2, 4].map((k) => def.root + scaleNote(def.scale, deg + k));
}

function barStart(t, def, stepLen) {
  const chord = (seq.chord = chordFor(def, seq.bar));
  const barLen = stepLen * 8;
  chord.forEach((m, i) =>
    tone({ time: t, f: freq(m), dur: barLen * 1.05, type: def.pad, gain: def.padGain / chord.length, attack: barLen * 0.25, release: barLen * 0.4, cutoff: def.cutoff, detune: i === 1 ? 6 : -4 })
  );
  if (def.drone) tone({ time: t, f: freq(def.root - 24), dur: barLen * 1.05, type: 'sine', gain: 0.05, attack: barLen * 0.3, release: barLen * 0.3 });
}

function stepNotes(t, def, stepLen) {
  const s = seq.step;
  const chord = seq.chord;
  const loopBar = seq.bar % 8;
  if (def.bass && (def.pulse || s % 4 === 0)) {
    tone({ time: t, f: freq(chord[0] - 12), dur: stepLen * (def.pulse ? 0.8 : 1.8), type: 'triangle', gain: def.pulse ? 0.08 : 0.1, attack: 0.01, release: stepLen * 0.5, cutoff: 500 });
  }
  const r = hash(def.seed, loopBar, s);
  if (r < def.arp) {
    const pick = hash(def.seed + 1, loopBar, s);
    const up = pick > 0.85 ? 19 : 12;
    const m = chord[Math.floor(pick * 3) % 3] + up;
    tone({ time: t, f: freq(m), dur: stepLen * (def.record ? 1.4 : 0.9), type: def.lead, gain: def.record ? 0.055 : 0.04, attack: 0.005, release: stepLen * 0.6, cutoff: def.cutoff * 1.6 });
  }
  if (def.perc > 0) {
    if (s === 0 || s === 4) tone({ time: t, f: 150, slideTo: 45, dur: 0.14, type: 'sine', gain: 0.22 * def.perc, attack: 0.002, release: 0.1 });
    if (s % 2 === 1) noise({ time: t, dur: 0.035, gain: 0.035 * def.perc, type: 'highpass', f: 7000, bus: musicBus });
    if (def.snare && (s === 2 || s === 6)) noise({ time: t, dur: 0.12, gain: 0.08 * def.perc, type: 'bandpass', f: 1800, q: 0.8, bus: musicBus });
  }
  if (def.record && hash(def.seed + 2, seq.bar, s) < 0.3) SFX.crackle(t + stepLen * 0.5);
}

/** The recorded track for a mood (assets/audio/music), or null where only the synth has one. */
function moodTrack(mood) {
  if (mood === 'pre') return 'music-pre-outbreak';
  if (mood === 'horde') return 'music-horde';
  if (mood === 'ending') return 'music-ending';
  if (mood === 'explore' || mood === 'wage' || mood === 'student' || mood === 'warehouse') return 'music-day';
  if (/:night$/.test(mood)) return 'music-night';
  return null;
}

let lastTrackMood = null;

/** Recorded music for the current mood; true while it plays (the synth then stays quiet). */
function recordedMusic() {
  const mood = currentMood();
  const track = moodTrack(mood);
  const prev = lastTrackMood;
  lastTrackMood = mood;
  const cur = samplerStatus().music;
  if (!track) {
    if (cur) playMusic(null);
    return false;
  }
  // transitions: night into the horde, and the horde's end into what follows
  if (track === 'music-horde' && cur === 'music-night') return playMusic('music-night-to-horde', { then: 'music-horde' });
  if (cur === 'music-night-to-horde' && track === 'music-horde') return true;
  if (prev === 'horde' && mood !== 'horde' && cur === 'music-horde') return playMusic('music-horde-end', { then: track });
  if (cur === 'music-horde-end') return true;
  return playMusic(track);
}

function scheduleMusic() {
  if (!ctx || ctx.state !== 'running') return;
  if (num(game.settings?.music, 0.4) <= 0.001 || num(game.settings?.volume, 0.6) <= 0.001) return;
  if (recordedMusic()) {
    seq.next = ctx.currentTime + 0.05;
    return;
  }
  const ahead = ctx.currentTime + 0.3;
  if (seq.next < ctx.currentTime) seq.next = ctx.currentTime + 0.05;
  let guard = 0;
  while (seq.next < ahead && guard++ < 32) {
    if (seq.step === 0) {
      const mood = currentMood();
      if (mood !== seq.mood) {
        seq.mood = mood;
        seq.def = moodDef(mood);
        seq.bar = 0;
      }
    }
    const def = seq.def;
    const stepLen = 60 / def.bpm / 2;
    if (seq.step === 0) barStart(seq.next, def, stepLen);
    stepNotes(seq.next, def, stepLen);
    seq.next += stepLen;
    seq.step = (seq.step + 1) % 8;
    if (seq.step === 0) seq.bar++;
  }
}

// ------------------------------------------------------------------------------------------ ambience
function rainLevel(s) {
  const kind = String(s.weather?.today?.kind || s.weather?.kind || '').toLowerCase();
  if (!kind) return 0;
  if (/thunder|storm|heavy/.test(kind)) return 0.5;
  if (/rain|drizzle|shower/.test(kind)) return 0.28;
  if (/snow|cold|freez|blizzard/.test(kind)) return 0.1;
  return 0;
}

function ambience() {
  if (!ctx || ctx.state !== 'running') return;
  const s = game.state;
  const t = ctx.currentTime;
  let rain = 0;
  if (s && s.phase !== 'dead' && s.phase !== 'ending') {
    rain = rainLevel(s) * (s.ui?.viewFloor === 'B1' ? 0.35 : 1);
    const running = s.clock?.speed > 0 && !s.ui?.modalPause;
    if (running) {
      if (hordeActive(s)) {
        if (rand() < 0.35) playSfx('groan');
      } else if (s.phase === 'post' && isNight(s.clock) && rand() < 0.03) {
        playSfx('groan');
      }
    }
  }
  // recorded loops where they exist; the synthesized rain only while its recording loads
  const inGame = s && s.phase !== 'dead' && s.phase !== 'ending';
  const home = inGame && s.player?.scene === 'home';
  const night = inGame && s.clock && isNight(s.clock);
  const horde = inGame && hordeActive(s);
  const recordedRain = loopFamily('rain', rain * 1.3);
  rainGain?.gain.setTargetAtTime(recordedRain ? 0 : rain * 0.35, t, 1.2);
  loopFamily('amb-roomtone', home ? 0.35 : 0);
  loopFamily('amb-night-street', inGame && night && s.phase === 'post' ? 0.45 : 0);
  loopFamily('amb-horde-crowd', horde ? 0.7 : 0);
  const gen = home && Object.values(s.furniture || {}).some((f) => {
    const cfg = typeof f.cfg === 'number' ? furn(f.cfg) : null;
    return f.on && cfg && (cfg.elec === ELEC.FUEL_GEN || cfg.elec === ELEC.MANUAL_GEN) && s.home?.slots?.[f.slot] === f.uid;
  });
  loopFamily('generator', gen ? 0.5 : 0);
  const scene = s?.player?.scene || 'home';
  setSpace(scene === 'home' ? (s?.ui?.viewFloor === 'B1' || s?.player?.floor === 'B1' ? 'basement' : 'apartment') : scene.startsWith('shop') ? 'shop' : 'outdoors');
}

// ------------------------------------------------------------------------------------------ footsteps
let stepAt = 0;
/** Footsteps while the survivor walks: tile in kitchens, bathrooms and away from home, wood elsewhere. */
function footsteps() {
  if (!ctx || ctx.state !== 'running') return;
  const s = game.state;
  const cur = s?.actions?.current;
  if (!s || !cur || cur.phase !== 'walk' || !(s.clock?.speed > 0) || s.ui?.modalPause) return;
  const now = ctx.currentTime;
  const period = 0.42 / Math.max(1, Math.min(3, s.clock.speed));
  if (now - stepAt < period) return;
  stepAt = now;
  let tile = s.player.scene !== 'home';
  if (!tile) {
    const rooms = homeDef(s.home?.id)?.floors?.[s.player.floor]?.rooms || [];
    const x = s.player.px ?? s.player.x;
    const y = s.player.py ?? s.player.y;
    const room = rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    tile = !!room && /kitchen|bath|cold|store|garage|cellar/.test(room.id);
  }
  playFamily(tile ? 'footstep-tile' : 'footstep-wood', { gain: 0.6 });
}

// ------------------------------------------------------------------------------------------ wiring
function start() {
  if (started || !ensure()) return;
  started = true;
  setInterval(scheduleMusic, 100);
  setInterval(ambience, 1000);
  setInterval(footsteps, 60);
}

if (typeof window !== 'undefined') {
  const unlock = () => {
    start();
    if (ctx?.state === 'suspended') ctx.resume();
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  document.addEventListener(
    'click',
    (e) => {
      if (e.target?.closest?.('button')) playSfx('click');
    },
    true
  );
}

on('settings', applyVolumes);
on('gotItem', () => cue('pickup'));
on('achievement', () => cue('jingle'));
on('codexMilestone', () => cue('jingle'));
on('characterUnlocked', () => cue('jingle'));
on('outbreak', () => cue('siren'));
on('death', () => cue('death'));
on('thunder', () => cue('thunder'));
on('phoneMessage', (p) => {
  if (!p?.silent) cue(p?.sound === 'vibrate' || p?.vibrate ? 'vibrate' : 'ring');
});
for (const ev of ['openingHit', 'breach', 'zombieAttack', 'defenseBroken']) on(ev, () => cue('door'));
for (const ev of ['hordeStart', 'hordeArrived', 'hordeWave', 'zombieSpawned']) on(ev, () => cue('groan'));
on('chainsawHit', () => cue('chainsaw'));
const DEVICE_SFX = { chainsaw: 'chainsaw', net: 'zap' };
on('defenseHit', (p) => cue((p?.by !== 'zombie' && DEVICE_SFX[p?.device]) || 'door'));
for (const ev of ['droneDispatched', 'droneReturned']) on(ev, () => cue('drone'));
for (const ev of ['cookStarted', 'cooked']) on(ev, () => cue('sizzle'));
on('actionStarted', (a) => {
  const k = String(a?.kind || '');
  if (/cook/i.test(k)) cue('sizzle');
  else if (k === 'drone') cue('drone');
});
on('actionDone', (a) => {
  const k = String(a?.kind || '');
  if (k === 'repair' || k === 'reinforce' || k === 'install' || k === 'dismantle') cue('hammer');
});

export function audioStatus() {
  return { running: ctx?.state === 'running', mood: seq.mood, started, recorded: samplerStatus() };
}
