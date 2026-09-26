// @ts-check
// A small score DSL. Time is in beats (quarter notes); bar(n) is the first beat of bar n (1-based). Melodies are
// written as token strings:
//
//   'A4:q F4:e E4:e D4:h+q r:q [D4 F4 A4]:w C5:e.@90 Bb4:s>'
//
// durations w h q e s (whole … sixteenth), t = triplet eighth, tq = triplet quarter, a trailing '.' dots, '+' ties,
// '@v' sets the velocity, '>' accents, 'r' rests, [ ] is a chord. Mix settings travel in the MIDI file as CC7
// (volume), CC10 (pan) and CC91 (reverb send) at tick 0; CC64 is the sustain pedal, CC11 expression.

import { midi as keyOf } from './theory.mjs';
import { Rng } from '../audio/lib/rng.mjs';

/** @typedef {import('./midi.mjs').MidiEvent} MidiEvent */

const DUR = /** @type {Record<string, number>} */ ({ w: 4, h: 2, q: 1, e: 0.5, s: 0.25, t: 1 / 3, tq: 2 / 3, ts: 1 / 6 });

/** @param {string} d */
function parseDur(d) {
  return d.split('+').reduce((sum, part) => {
    let dotted = 1;
    let p = part;
    while (p.endsWith('.')) {
      dotted *= 1.5;
      p = p.slice(0, -1);
    }
    const v = DUR[p] ?? Number(p);
    if (!Number.isFinite(v) || v <= 0) throw new Error(`bad duration '${part}'`);
    return sum + v * dotted;
  }, 0);
}

/**
 * @typedef {{ key: number, beat: number, dur: number, vel: number, tight?: boolean }} ScoreNote
 * @typedef {{ beat: number, cc: number, value: number }} ScoreCc
 * @typedef {{ timing?: number, velocity?: number, late?: number, durJitter?: number }} Humanize  timing in beats
 */

export class Track {
  /**
   * @param {string} name  instrument id (tools/music/instruments.mjs)
   * @param {number} ch
   * @param {{ volume?: number, pan?: number, reverb?: number, humanize?: Humanize, expression?: number }} o
   */
  constructor(name, ch, o) {
    this.name = name;
    this.ch = ch;
    /** @type {ScoreNote[]} */
    this.notes = [];
    /** @type {ScoreCc[]} */
    this.ccs = [];
    this.humanize = o.humanize ?? { timing: 0.01, velocity: 5 };
    this.ccs.push({ beat: 0, cc: 7, value: o.volume ?? 100 }, { beat: 0, cc: 10, value: Math.round(64 + (o.pan ?? 0) * 63) }, { beat: 0, cc: 91, value: o.reverb ?? 40 });
    if (o.expression != null) this.ccs.push({ beat: 0, cc: 11, value: o.expression });
  }

  /**
   * @param {number | string} key
   * @param {number} beat
   * @param {number} dur  beats
   * @param {number} vel
   * @param {{ tight?: boolean }} [o]  tight: no timing humanization (ostinati locked to the grid)
   */
  note(key, beat, dur, vel, o = {}) {
    const k = typeof key === 'string' ? keyOf(key) : key;
    this.notes.push({ key: k, beat, dur, vel, tight: o.tight });
    return this;
  }

  /**
   * @param {(number | string)[]} keys
   * @param {number} beat
   * @param {number} dur
   * @param {number} vel
   * @param {{ roll?: number, velStep?: number, tight?: boolean }} [o]  roll: beats between successive notes (upwards)
   */
  chord(keys, beat, dur, vel, o = {}) {
    keys.forEach((k, i) => this.note(k, beat + i * (o.roll ?? 0), dur - i * (o.roll ?? 0), vel + i * (o.velStep ?? 0), { tight: o.tight }));
    return this;
  }

  /**
   * Plays a token string from `beat`; returns the beat after it.
   * @param {string} text
   * @param {number} beat
   * @param {{ vel?: number, transpose?: number, legato?: number, tight?: boolean }} [o]  legato: sounding share of each duration
   */
  play(text, beat, o = {}) {
    let t = beat;
    const re = /(\[[^\]]+\]|[A-Ga-gr][#b]?-?\d*):([0-9a-z.+/]+)(@\d+)?(>)?/g;
    let m;
    while ((m = re.exec(text))) {
      const dur = parseDur(m[2]);
      const vel = (m[3] ? Number(m[3].slice(1)) : (o.vel ?? 70)) + (m[4] ? 14 : 0);
      if (m[1] !== 'r') {
        const names = m[1].startsWith('[') ? m[1].slice(1, -1).trim().split(/\s+/) : [m[1]];
        for (const n of names) this.note(keyOf(n) + (o.transpose ?? 0), t, dur * (o.legato ?? 0.98), Math.min(127, vel), { tight: o.tight });
      }
      t += dur;
    }
    return t;
  }

  /** @param {number} beat @param {number} cc @param {number} value */
  cc(beat, cc, value) {
    this.ccs.push({ beat, cc, value });
    return this;
  }

  /**
   * A controller ramp (shaped: 1 linear, >1 slow start, <1 fast start).
   * @param {number} cc
   * @param {number} from
   * @param {number} to
   * @param {number} v0
   * @param {number} v1
   * @param {number} [shape]
   */
  ramp(cc, from, to, v0, v1, shape = 1) {
    const steps = Math.max(2, Math.round((to - from) * 16));
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) ** shape;
      this.ccs.push({ beat: from + ((to - from) * i) / steps, cc, value: v0 + (v1 - v0) * x });
    }
    return this;
  }

  /** Sustain pedal down over [from, to). @param {number} from @param {number} to */
  pedal(from, to) {
    this.ccs.push({ beat: from, cc: 64, value: 127 }, { beat: to, cc: 64, value: 0 });
    return this;
  }
}

export class Score {
  /**
   * @param {{ title: string, bpm: number, meter?: [number, number], bars: number, seed?: number, ppq?: number,
   *   loop?: boolean, tail?: number }} o  loop: the file is a seamless loop of `bars` bars; tail: seconds of release
   *   rendered after the last bar of a one-shot
   */
  constructor(o) {
    this.title = o.title;
    this.bpm = o.bpm;
    this.meter = o.meter ?? [4, 4];
    this.bars = o.bars;
    this.ppq = o.ppq ?? 480;
    this.seed = o.seed ?? 1;
    this.loop = o.loop ?? false;
    this.tail = o.tail ?? 4;
    /** @type {Track[]} */
    this.tracks = [];
    /** @type {{ beat: number, bpm: number }[]} */
    this.tempos = [{ beat: 0, bpm: o.bpm }];
    /** @type {{ beat: number, text: string }[]} */
    this.markers = [];
  }

  get beatsPerBar() {
    return (this.meter[0] * 4) / this.meter[1];
  }

  get lengthBeats() {
    return this.bars * this.beatsPerBar;
  }

  /** First beat of a bar (1-based), plus an offset in beats. @param {number} n @param {number} [plus] */
  bar(n, plus = 0) {
    return (n - 1) * this.beatsPerBar + plus;
  }

  /**
   * @param {string} name
   * @param {{ volume?: number, pan?: number, reverb?: number, humanize?: Humanize, expression?: number, ch?: number }} [o]
   */
  track(name, o = {}) {
    const used = new Set(this.tracks.map((t) => t.ch));
    let ch = o.ch ?? 0;
    while (o.ch == null && (used.has(ch) || ch === 9)) ch++;
    const t = new Track(name, ch % 16, o);
    this.tracks.push(t);
    return t;
  }

  /** @param {number} beat @param {number} bpm */
  tempo(beat, bpm) {
    this.tempos.push({ beat, bpm });
    return this;
  }

  /** @param {number} beat @param {string} text */
  marker(beat, text) {
    this.markers.push({ beat, text });
    return this;
  }

  /** Seconds at a beat (piecewise-constant tempo). @param {number} beat */
  secondsAt(beat) {
    const ts = [...this.tempos].sort((a, b) => a.beat - b.beat);
    let sec = 0;
    for (let i = 0; i < ts.length; i++) {
      const end = i + 1 < ts.length ? Math.min(beat, ts[i + 1].beat) : beat;
      if (end <= ts[i].beat) break;
      sec += ((end - ts[i].beat) * 60) / ts[i].bpm;
    }
    return sec;
  }

  get lengthSeconds() {
    return this.secondsAt(this.lengthBeats);
  }

  /** @returns {import('./midi.mjs').MidiFile} */
  toMidi() {
    const rng = new Rng(this.seed);
    const tick = (/** @type {number} */ b) => Math.max(0, Math.round(b * this.ppq));
    /** @type {MidiEvent[]} */
    const conductor = [
      { tick: 0, type: 'meter', num: this.meter[0], den: this.meter[1] },
      ...this.tempos.map((t) => /** @type {MidiEvent} */ ({ tick: tick(t.beat), type: 'tempo', usPerQuarter: Math.round(60e6 / t.bpm) })),
      ...this.markers.map((m) => /** @type {MidiEvent} */ ({ tick: tick(m.beat), type: 'marker', text: m.text })),
    ];
    if (this.loop) conductor.push({ tick: tick(this.lengthBeats), type: 'marker', text: 'loop-end' });
    const tracks = [{ name: this.title, events: conductor }];
    for (const t of this.tracks) {
      const hr = rng.fork(t.name);
      const h = t.humanize;
      /** @type {MidiEvent[]} */
      const ev = [];
      for (const c of t.ccs) ev.push({ tick: tick(c.beat), type: 'cc', ch: t.ch, cc: c.cc, value: c.value });
      for (const n of t.notes) {
        const dt = n.tight ? 0 : (h.late ?? 0) + (h.timing ?? 0) * hr.gauss() * 0.6;
        const dv = Math.round((h.velocity ?? 0) * hr.gauss() * 0.6);
        const start = Math.max(0, n.beat + dt);
        const dur = Math.max(0.05, n.dur * (1 + (h.durJitter ?? 0) * hr.gauss() * 0.5));
        ev.push({ tick: tick(start), type: 'on', ch: t.ch, key: n.key, vel: Math.max(1, Math.min(127, n.vel + dv)) });
        ev.push({ tick: tick(start + dur), type: 'off', ch: t.ch, key: n.key, vel: 0 });
      }
      tracks.push({ name: t.name, events: ev });
    }
    return { ppq: this.ppq, tracks };
  }
}
