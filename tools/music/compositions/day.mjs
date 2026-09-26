// @ts-check
// Day — the quiet routine at home. F major, 80 BPM, 16 bars (48 s), seamless loop. Piano and harp arpeggios under a
// clarinet tune that the flute answers an octave up; violas and celli hold the harmony, a glockenspiel glints at
// the phrase starts. Warm, a little wistful.

import { Score } from '../score.mjs';
import { midi as k, voice } from '../theory.mjs';

const s = new Score({ title: 'Day', bpm: 80, bars: 16, loop: true, seed: 8001 });
const B = (/** @type {number} */ n, plus = 0) => s.bar(n, plus);

const pno = s.track('piano', { volume: 106, pan: -0.12, reverb: 58, humanize: { timing: 0.02, velocity: 4 } });
const harp = s.track('harp', { volume: 110, pan: 0.35, reverb: 66, humanize: { timing: 0.01, velocity: 4 } });
const cl = s.track('clarinet-sus', { volume: 118, pan: 0.05, reverb: 62, expression: 100, humanize: { timing: 0.015, velocity: 3 } });
const fl = s.track('flute-sus', { volume: 116, pan: -0.2, reverb: 66, expression: 100, humanize: { timing: 0.015, velocity: 3 } });
const va = s.track('violas-sus', { volume: 120, pan: 0.12, reverb: 70, expression: 92, humanize: { timing: 0.02, velocity: 3, late: 0.03 } });
const vc = s.track('celli-sus', { volume: 116, pan: 0.28, reverb: 68, expression: 92, humanize: { timing: 0.02, velocity: 3, late: 0.03 } });
const cb = s.track('basses-pizz', { volume: 112, pan: 0.36, reverb: 50, humanize: { timing: 0.01, velocity: 3 } });
const gl = s.track('glockenspiel', { volume: 92, pan: -0.4, reverb: 70, humanize: { timing: 0.01, velocity: 3 } });

const CHORDS = [
  ['F', 'F2'],
  ['Am', 'E2'],
  ['Dm', 'D2'],
  ['Bbmaj7', 'Bb1'],
  ['F', 'A1'],
  ['Gm7', 'G1'],
  ['C', 'C2'],
  ['C7', 'C2'],
  ['Dm', 'D2'],
  ['Am', 'A1'],
  ['Bb', 'Bb1'],
  ['F', 'A1'],
  ['Gm7', 'G1'],
  ['C', 'C2'],
  ['F', 'F2'],
  ['Csus4', 'C2'],
];

CHORDS.forEach(([sym, bass], i) => {
  const bar = i + 1;
  const t = voice(sym, { low: k('A3'), high: k('G5') });
  const b = k(bass) + 12;
  const line = [b, b + 7, t[0], t[1], t[2], t[1], t[0], b + 7];
  line.forEach((key, j) => pno.note(key, B(bar, j * 0.5), j === 0 ? 3.8 : 1.3, [52, 34, 38, 36, 42, 34, 35, 32][j]));
  pno.pedal(B(bar, 0.02), B(bar + 1, -0.05));
  if (bar % 2 === 1) harp.chord(voice(sym, { low: k('F3'), high: k('C6') }), B(bar), 3.5, 66, { roll: 0.09, velStep: 2 });
  else harp.chord(voice(sym, { low: k('C5'), high: k('C6') }), B(bar, 2), 1.8, 56, { roll: 0.06 });
  const pad = voice(sym, { low: k('A3'), high: k('F4') });
  va.note(pad[pad.length - 1], B(bar), 3.95, 60);
  vc.note(voice(sym, { low: k('C3'), high: k('A3') })[0], B(bar), 3.95, 58);
  cb.note(k(bass), B(bar), 1, 70);
  if (bar % 4 === 1) gl.note(bar === 9 ? 'A5' : 'C6', B(bar), 2, bar === 1 ? 70 : 64);
});
for (let bar = 1; bar <= 16; bar += 4) for (const t of [va, vc]) t.ramp(11, B(bar), B(bar + 2), 84, 108, 1.2).ramp(11, B(bar + 2), B(bar + 4), 108, 88);

cl.play('C5:q. A4:e F4:q G4:q A4:h. C5:q D5:q. C5:e A4:q F4:q A4:h. G4:q F4:q. G4:e A4:q C5:q Bb4:q. A4:e G4:q F4:q E4:q. F4:e G4:q C5:q Bb4:h. r:q', B(1), { vel: 74, legato: 0.96 });
cl.play('F4:w E4:w F4:w F4:w D4:w E4:w C4:w r:w', B(9), { vel: 56 });
fl.play('A5:q. G5:e F5:q D5:q E5:h. C5:q D5:q. F5:e Bb5:q A5:q A5:h. G5:q F5:q. G5:e Bb5:q A5:q G5:q. F5:e E5:q C5:q F5:w r:h G5:q F5:q', B(9), { vel: 70, legato: 0.96 });
cl.ramp(11, B(1), B(8), 96, 112, 1).cc(B(9), 11, 90);
fl.ramp(11, B(9), B(15), 92, 112, 1).ramp(11, B(15), B(17), 112, 90);

/** @type {import('../build.mjs').Composition} */
export default {
  id: 'day',
  title: 'Day',
  layer: 'day',
  score: s,
  mix: {
    tracks: {
      piano: { eq: [{ type: 'highpass', freq: 50 }, { type: 'lowshelf', freq: 220, gain: -3 }, { type: 'peaking', freq: 2800, q: 0.9, gain: 1.5 }], width: 0.85, level: -28 },
      harp: { eq: [{ type: 'highpass', freq: 90 }], level: -29 },
      'clarinet-sus': { eq: [{ type: 'highpass', freq: 140 }, { type: 'peaking', freq: 2500, q: 1, gain: 1.5 }], level: -26 },
      'flute-sus': { eq: [{ type: 'highpass', freq: 250 }], level: -25 },
      'violas-sus': { eq: [{ type: 'highpass', freq: 130 }, { type: 'peaking', freq: 400, q: 1, gain: -2 }], level: -32 },
      'celli-sus': { eq: [{ type: 'highpass', freq: 60 }, { type: 'peaking', freq: 300, q: 1, gain: -2 }], level: -31 },
      'basses-pizz': { eq: [{ type: 'highpass', freq: 35 }, { type: 'lowpass', freq: 3000 }], level: -31 },
      glockenspiel: { eq: [{ type: 'highpass', freq: 500 }], level: -32 },
    },
    reverbReturnDb: -4,
    master: [{ type: 'peaking', freq: 300, q: 0.8, gain: -1.5 }, { type: 'highshelf', freq: 5000, gain: 2 }],
  },
};
