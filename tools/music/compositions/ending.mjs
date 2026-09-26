// @ts-check
// Ending — the siege is over. D minor opening into D major, 72 BPM, 18 bars with a ritardando, one-shot (about
// 65 s with the tail). The night lament returns on violins, then in major on horns and violins over full strings;
// the last chord rings under glockenspiel, a timpani roll and a cymbal swell.

import { Score } from '../score.mjs';
import { midi as k, voice } from '../theory.mjs';

const s = new Score({ title: 'Ending', bpm: 72, bars: 18, loop: false, tail: 5, seed: 7201 });
const B = (/** @type {number} */ n, plus = 0) => s.bar(n, plus);
s.tempo(B(17), 66).tempo(B(17, 2), 60).tempo(B(18), 54);

const pno = s.track('piano', { volume: 104, pan: -0.12, reverb: 62, humanize: { timing: 0.02, velocity: 4 } });
const rh = s.track('piano#rh', { volume: 112, pan: -0.05, reverb: 60, humanize: { timing: 0.02, velocity: 4 } });
const vn = s.track('violins-sus', { volume: 122, pan: -0.32, reverb: 78, expression: 92, humanize: { timing: 0.02, velocity: 3, late: 0.03 } });
const va = s.track('violas-sus', { volume: 120, pan: 0.08, reverb: 76, expression: 90, humanize: { timing: 0.02, velocity: 3, late: 0.03 } });
const vc = s.track('celli-sus', { volume: 118, pan: 0.28, reverb: 72, expression: 92, humanize: { timing: 0.02, velocity: 3, late: 0.03 } });
const cb = s.track('basses-sus', { volume: 116, pan: 0.38, reverb: 64, expression: 92, humanize: { timing: 0.02, velocity: 3, late: 0.03 } });
const hn = s.track('horn-sus', { volume: 108, pan: -0.15, reverb: 70, expression: 90, humanize: { timing: 0.015, velocity: 3 } });
const roll = s.track('timpani-roll', { volume: 110, pan: 0.05, reverb: 60, expression: 30, humanize: { timing: 0.005, velocity: 2 } });
const cym = s.track('cymbal', { volume: 100, pan: -0.2, reverb: 80, humanize: { timing: 0.005, velocity: 2 } });
const gl = s.track('glockenspiel', { volume: 96, pan: -0.4, reverb: 78, humanize: { timing: 0.01, velocity: 3 } });

const CHORDS = [
  ['Dm', 'D2'], ['Bbmaj7', 'Bb1'], ['Gm', 'G1'], ['A7sus4', 'A1'],
  ['Dm', 'D2'], ['Bbmaj7', 'Bb1'], ['F', 'F2'], ['C', 'C2'],
  ['G', 'G1'], ['D', 'F#2'], ['Em7', 'E2'], ['A', 'A1'],
  ['D', 'D2'], ['A', 'C#2'], ['Bm', 'B1'], ['G', 'G1'],
  ['A7sus4', 'A1'], ['D', 'D2'],
];

CHORDS.forEach(([sym, bass], i) => {
  const bar = i + 1;
  const t = voice(sym, { low: k('D3'), high: k('A4') });
  const b = k(bass);
  const big = bar >= 13;
  const line = [b, b + 7, t[0], t[1], t[Math.min(3, t.length - 1)], t[1], t[0], b + 7];
  if (bar < 18) line.forEach((key, j) => pno.note(key, B(bar, j * 0.5), j === 0 ? 3.9 : 1.4, [44, 28, 30, 28, 34, 27, 28, 25][j] + (big ? 8 : 0)));
  pno.pedal(B(bar, 0.02), B(bar + 1, -0.04));
  rh.cc(B(bar, 0.02), 64, 127).cc(B(bar + 1, -0.04), 64, 0);
  if (bar >= 5) {
    const pad = voice(sym, { low: k('F3'), high: k('D4') });
    va.note(pad[pad.length - 1], B(bar), bar === 18 ? 8 : 3.96, 62);
    vc.chord(voice(sym, { low: k('C3'), high: k('A3') }).slice(-2), B(bar), bar === 18 ? 8 : 3.96, 60);
    cb.note(b, B(bar), bar === 18 ? 8 : 3.96, 58);
  }
  if (bar >= 9 && bar <= 12) hn.chord(voice(sym, { low: k('A3'), high: k('E4') }).slice(-2), B(bar), 3.9, 70);
});
// Final chord.
pno.chord(['D1', 'D2', 'A2', 'F#3', 'A3', 'D4'], B(18), 8, 50, { roll: 0.05 });
rh.play('F#4:w', B(18), { vel: 50 });

// Melodies: the lament in minor (violins), a counter-line (9-12), the lament in major (horns + violins, 13-18).
rh.play('r:h A5:h F5:h. E5:q D5:h Bb4:h C#5:w', B(1), { vel: 50 });
vn.play('A4:h. G4:e F4:e E4:h D4:q E4:q F4:h. E4:e D4:e E4:w', B(5), { vel: 64 });
vn.play('B4:h D5:h A4:h F#4:h G4:h B4:h C#5:w', B(9), { vel: 66 });
const MAJOR = 'A4:h. G4:e F#4:e E4:h D4:q E4:q F#4:h. G4:e A4:e B4:w A4:h G4:h F#4:w';
vn.play(MAJOR, B(13), { vel: 74, transpose: 12 });
hn.play(MAJOR, B(13), { vel: 84 });
rh.play('D5:h. r:q C#5:h. r:q D5:h. r:q D5:w r:w', B(13), { vel: 44 });
for (const t of [vn, va, vc, cb]) t.ramp(11, B(5), B(8), 80, 104, 1).ramp(11, B(9), B(12, 3), 96, 118, 1).ramp(11, B(13), B(16, 3), 104, 124, 1).ramp(11, B(17), B(18, 4), 118, 70, 0.8);
hn.ramp(11, B(13), B(16, 3), 96, 120, 1).ramp(11, B(17), B(18, 3), 116, 60, 0.8);

roll.note('D2', B(16), 8, 104, { tight: true });
roll.ramp(11, B(16), B(18, -0.1), 24, 118, 1.6).cc(B(18), 11, 0);
cym.note(54, B(18) - (4 * 60) / 54 + 0.2, 4, 98, { tight: true });
gl.play('F#6:q A6:q D7:h', B(18), { vel: 70 });

/** @type {import('../build.mjs').Composition} */
export default {
  id: 'ending',
  title: 'Ending',
  layer: 'ending',
  score: s,
  mix: {
    tracks: {
      piano: { eq: [{ type: 'highpass', freq: 40 }, { type: 'lowshelf', freq: 220, gain: -3 }, { type: 'lowpass', freq: 6000 }], width: 0.9, level: -28 },
      'piano#rh': { eq: [{ type: 'highpass', freq: 120 }, { type: 'peaking', freq: 2600, q: 0.9, gain: 2 }], width: 0.7, level: -27 },
      'violins-sus': { eq: [{ type: 'highpass', freq: 220 }, { type: 'highshelf', freq: 7000, gain: -1.5 }], level: -25 },
      'violas-sus': { eq: [{ type: 'highpass', freq: 130 }, { type: 'peaking', freq: 400, q: 1, gain: -2 }], level: -31 },
      'celli-sus': { eq: [{ type: 'highpass', freq: 60 }, { type: 'peaking', freq: 300, q: 1, gain: -2 }], level: -29 },
      'basses-sus': { eq: [{ type: 'highpass', freq: 35 }, { type: 'lowpass', freq: 4000 }], level: -30 },
      'horn-sus': { eq: [{ type: 'highpass', freq: 90 }], level: -26 },
      cymbal: { eq: [{ type: 'highpass', freq: 300 }], level: -32 },
      glockenspiel: { eq: [{ type: 'highpass', freq: 500 }], level: -30 },
      'timpani-roll': { level: -28 },
    },
    reverbReturnDb: -3,
    master: [{ type: 'peaking', freq: 280, q: 0.8, gain: -1.5 }, { type: 'highshelf', freq: 4500, gain: 2 }],
  },
};
