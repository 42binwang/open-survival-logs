// @ts-check
// Night — the apartment after dark. D minor, 64 BPM, 16 bars (60 s), seamless loop. A felt-soft upright piano
// lament over hushed section strings; a bowed vibraphone glints at the phrase starts and a slow timpani heartbeat
// sits under the dominant bars. Bars 1-2 are sparse so the layer can re-enter quietly (the "quiet" of the test).
// The bar grid (3.75 s) is shared with the horde layer (128 BPM: two horde bars per night bar).

import { Score } from '../score.mjs';
import { midi as k, voice } from '../theory.mjs';

const s = new Score({ title: 'Night', bpm: 64, bars: 16, loop: true, seed: 6401 });
const B = (/** @type {number} */ n, plus = 0) => s.bar(n, plus);

const piano = s.track('piano', { volume: 108, pan: -0.14, reverb: 60, humanize: { timing: 0.025, velocity: 4 } });
const rh = s.track('piano#rh', { volume: 118, pan: -0.04, reverb: 58, humanize: { timing: 0.02, velocity: 4 } });
const celli = s.track('celli-sus', { volume: 118, pan: 0.3, reverb: 72, expression: 96, humanize: { timing: 0.02, velocity: 3, late: 0.03 } });
const violas = s.track('violas-sus', { volume: 124, pan: 0.08, reverb: 74, expression: 96, humanize: { timing: 0.02, velocity: 3, late: 0.03 } });
const basses = s.track('basses-sus', { volume: 116, pan: 0.4, reverb: 62, expression: 96, humanize: { timing: 0.02, velocity: 3, late: 0.03 } });
const violins = s.track('violins-sus', { volume: 122, pan: -0.35, reverb: 84, expression: 90, humanize: { timing: 0.02, velocity: 3, late: 0.04 } });
const vibes = s.track('bowed-vibraphone', { volume: 104, pan: -0.45, reverb: 96, humanize: { timing: 0.01, velocity: 2 } });
const timp = s.track('timpani', { volume: 122, pan: 0.12, reverb: 64, humanize: { timing: 0.005, velocity: 3 } });

/** One chord per bar: symbol and bass note. */
const CHORDS = [
  ['Dm(add9)', 'D2'],
  ['Dm(add9)', 'C2'],
  ['Bbmaj7', 'Bb1'],
  ['Gm6', 'G1'],
  ['Dm', 'A1'],
  ['A7sus4', 'A1'],
  ['Bbadd#11', 'Bb1'],
  ['A7', 'A1'],
  ['Dm(add9)', 'D2'],
  ['Bbmaj7', 'D2'],
  ['Gm9', 'G1'],
  ['Ebmaj7#11', 'Eb2'],
  ['Dm', 'A1'],
  ['A7b9', 'A1'],
  ['Dm(add9)', 'D2'],
  ['A7sus4', 'A1'],
];

// Piano left hand: a slow broken chord in eighths, pedalled bar by bar.
CHORDS.forEach(([sym, bass], i) => {
  const bar = i + 1;
  const t = voice(sym, { low: k('D3'), high: k('A4') });
  const b = k(bass);
  const fifth = b + 7;
  const line = [b, fifth, t[0], t[1], t[Math.min(3, t.length - 1)], t[1], t[0], fifth];
  const vels = [40, 24, 27, 25, 31, 24, 25, 22];
  const quiet = bar <= 2 || bar >= 15 ? -3 : 0;
  line.forEach((key, j) => piano.note(key, B(bar, j * 0.5), j === 0 ? 3.9 : 1.4, vels[j] + quiet));
  piano.pedal(B(bar, 0.02), B(bar + 1, -0.04));
  rh.cc(B(bar, 0.02), 64, 127).cc(B(bar + 1, -0.04), 64, 0);
});
// bar 6 turns A7sus4 into A7 on beat 3; the left hand follows.
piano.note('C#4', B(6, 2), 1.8, 26);

// Right hand: sparse glints in the intro, then the lament and its answer an octave higher.
rh.play('r:h A5:h', B(1), { vel: 46 });
rh.play('F5:h. E5:q', B(2), { vel: 42 });
rh.play('A4:h. G4:e F4:e E4:h D4:q E4:q F4:h. E4:e D4:e D4:h C#4:h D4:q E4:q F4:q A4:q G4:h. F4:e E4:e', B(3), { vel: 64 });
rh.play('A5:h. G5:e F5:e E5:h D5:q E5:q F5:h. E5:e D5:e D5:h Bb4:q. A4:e A4:q D5:q F5:q E5:q C#5:h Bb4:q. A4:e', B(9), { vel: 68 });
rh.play('D5:w r:h A4:h', B(15), { vel: 52 });
// A soft lower third under the answering phrase.
rh.play('F5:h. r:q C5:h Bb4:h D5:h. r:q Bb4:h G4:h', B(9), { vel: 40, transpose: -12 });

// Strings: the chord held softly, swelling with each two-bar phrase.
CHORDS.forEach(([sym, bass], i) => {
  const bar = i + 1;
  const c = voice(sym, { low: k('C3'), high: k('A3') });
  const v = voice(sym, { low: k('F3'), high: k('D4') });
  if (bar >= 2) {
    celli.note(c[Math.max(0, c.length - 2)], B(bar), 3.96, 58);
    celli.note(c[c.length - 1], B(bar), 3.96, 54);
  }
  if (bar >= 3) violas.note(v[v.length - 1], B(bar), 3.96, 56);
  basses.note(k(bass), B(bar), 3.96, bar <= 2 ? 46 : 54);
  if (bar >= 9 && bar <= 15) {
    const top = voice(sym, { low: k('A4'), high: k('F5') });
    violins.note(top[top.length - 1], B(bar), 3.96, 50);
  }
});
for (let bar = 1; bar <= 16; bar += 2) {
  for (const tr of [celli, violas, basses]) tr.ramp(11, B(bar), B(bar + 1, 2), 82, 114, 1.3).ramp(11, B(bar + 1, 2), B(bar + 2), 114, 90);
}
violins.ramp(11, B(9), B(12), 72, 110, 1.2).ramp(11, B(12), B(16), 110, 70);

// Bowed vibraphone at the phrase starts.
vibes.play('D5:w', B(1), { vel: 64 });
vibes.play('A4:w', B(5), { vel: 58 });
vibes.play('F5:w', B(9), { vel: 60 });
vibes.play('D5:w', B(12), { vel: 56 });
vibes.play('A4:w', B(15), { vel: 54 });

// Heartbeat: lub-dub on the low D under the dominant bars.
for (const bar of [5, 6, 7, 8, 13, 14]) {
  for (const beat of [0, 2]) {
    const v = bar === 8 || bar === 14 ? 10 : bar === 7 || bar === 13 ? 5 : 0;
    timp.note('D2', B(bar, beat), 0.3, 58 + v, { tight: true });
    timp.note('D2', B(bar, beat + 0.36), 0.3, 44 + v, { tight: true });
  }
}

s.marker(B(1), 'A: intro');
s.marker(B(3), 'A: lament');
s.marker(B(9), 'B: answer');
s.marker(B(15), 'coda');

/** @type {import('../build.mjs').Composition} */
export default {
  id: 'night',
  title: 'Night',
  layer: 'night',
  score: s,
  mix: {
    tracks: {
      piano: { eq: [{ type: 'highpass', freq: 40 }, { type: 'lowshelf', freq: 220, gain: -3 }, { type: 'lowpass', freq: 5500 }], width: 0.9, level: -27.5 },
      'piano#rh': { eq: [{ type: 'highpass', freq: 120 }, { type: 'peaking', freq: 2600, q: 0.9, gain: 2.5 }, { type: 'lowpass', freq: 13000 }], width: 0.7, level: -24 },
      'celli-sus': { eq: [{ type: 'highpass', freq: 60 }, { type: 'peaking', freq: 300, q: 1, gain: -2.5 }, { type: 'peaking', freq: 1800, q: 1, gain: 1.5 }], level: -29 },
      'violas-sus': { eq: [{ type: 'highpass', freq: 130 }, { type: 'peaking', freq: 400, q: 1, gain: -2 }], level: -31 },
      'basses-sus': { eq: [{ type: 'highpass', freq: 35 }, { type: 'lowpass', freq: 4000 }], level: -31 },
      'violins-sus': { eq: [{ type: 'highpass', freq: 220 }, { type: 'highshelf', freq: 7000, gain: -2 }], level: -30 },
      'bowed-vibraphone': { eq: [{ type: 'highpass', freq: 250 }], level: -32 },
      timpani: { eq: [{ type: 'highpass', freq: 40 }, { type: 'lowpass', freq: 2500 }], level: -33 },
    },
    reverbReturnDb: -3,
    master: [{ type: 'peaking', freq: 280, q: 0.8, gain: -2 }, { type: 'highshelf', freq: 4500, gain: 3 }],
  },
};
