// @ts-check
// Horde — the dead at the door. D minor with Phrygian Eb, 128 BPM, 16 bars (30 s), seamless loop; two horde bars
// fill one night bar, so the layer enters on the night grid. A 3+3+2 spiccato ostinato in celli and basses, bass drum
// and toms like a battering ram, anvil and brake drum on the backbeat, timpani on D and A. The brass arrives as
// chords (bars 5-8), turns into stabs (9-12) and states the descending horde theme (13-16) while the violins move
// from tremolo to a spiccato figure. Bar 16 swells back into bar 1.

import { Score } from '../score.mjs';
import { midi as k } from '../theory.mjs';

const s = new Score({ title: 'Horde', bpm: 128, bars: 16, loop: true, seed: 12801 });
const B = (/** @type {number} */ n, plus = 0) => s.bar(n, plus);
const S = (/** @type {number} */ step) => step / 4; // 16th steps to beats

const tight = { timing: 0.004, velocity: 5 };
const vc = s.track('celli-spic', { volume: 118, pan: 0.22, reverb: 44, humanize: tight });
const cb = s.track('basses-spic', { volume: 116, pan: 0.32, reverb: 40, humanize: tight });
const va = s.track('violas-spic', { volume: 112, pan: 0.05, reverb: 48, humanize: tight });
const vn = s.track('violins-spic', { volume: 110, pan: -0.3, reverb: 52, humanize: tight });
const trem = s.track('violins-trem', { volume: 104, pan: -0.36, reverb: 62, expression: 80, humanize: { timing: 0.01, velocity: 3 } });
const hn = s.track('horn-sus', { volume: 112, pan: -0.15, reverb: 60, expression: 96, humanize: { timing: 0.01, velocity: 4 } });
const tb = s.track('trombone-sus', { volume: 108, pan: 0.18, reverb: 56, expression: 96, humanize: { timing: 0.01, velocity: 4 } });
const hnS = s.track('horn-stac', { volume: 116, pan: -0.15, reverb: 52, humanize: tight });
const tbS = s.track('trombone-stac', { volume: 114, pan: 0.18, reverb: 50, humanize: tight });
const tuS = s.track('tuba-stac', { volume: 112, pan: 0.25, reverb: 44, humanize: tight });
const timp = s.track('timpani', { volume: 120, pan: 0.05, reverb: 50, humanize: tight });
const roll = s.track('timpani-roll', { volume: 112, pan: 0.05, reverb: 50, expression: 60, humanize: tight });
const bd = s.track('bass-drum', { volume: 124, pan: 0, reverb: 46, humanize: tight });
const toms = s.track('toms', { volume: 118, pan: -0.08, reverb: 46, humanize: tight });
const metal = s.track('anvil', { volume: 98, pan: 0.4, reverb: 54, humanize: tight });
const brake = s.track('brake-drum', { volume: 104, pan: -0.42, reverb: 50, humanize: tight });
const snare = s.track('snare', { volume: 104, pan: 0.1, reverb: 50, humanize: tight });
const cym = s.track('cymbal', { volume: 110, pan: -0.2, reverb: 70, humanize: tight });
const pno = s.track('piano', { volume: 116, pan: -0.05, reverb: 56, humanize: tight });

/** Bass root per bar and the chord the brass voices. */
const ROOTS = ['D', 'D', 'D', 'D', 'D', 'Bb', 'Eb', 'A', 'D', 'D', 'Bb', 'A', 'D', 'Eb', 'Bb', 'A'];
const CHORDS = /** @type {Record<string, string[]>} */ ({
  D: ['D4', 'F4', 'A4'],
  Bb: ['Bb3', 'D4', 'F4'],
  Eb: ['Eb4', 'G4', 'Bb4'],
  A: ['C#4', 'E4', 'A4'],
});
/** Low octave of a root (celli D3 / Bb2 / Eb3 / A2). @param {string} r */
const low = (r) => k(`${r}${r === 'D' || r === 'Eb' ? 3 : 2}`);

// Ostinato: sixteenths in 3+3+2 groups; the turnaround bars bend up through F and Eb.
const ACC = new Set([0, 3, 6, 8, 11, 14]);
ROOTS.forEach((r, i) => {
  const bar = i + 1;
  const root = low(r);
  const turn = bar % 4 === 0;
  const build = bar >= 9 ? 6 : bar >= 5 ? 3 : 0;
  for (let st = 0; st < 16; st++) {
    let key = root;
    if (turn && st === 14) key = root + 3;
    if (turn && st === 15) key = root + 1;
    const acc = ACC.has(st);
    vc.note(key, B(bar, S(st)), 0.22, acc ? 108 + build : 72 + build, { tight: true });
    if (acc) cb.note(key - 12, B(bar, S(st)), 0.3, 104 + build, { tight: true });
    if (bar >= 9 && acc) va.note(key + 12, B(bar, S(st)), 0.22, 100 + build, { tight: true });
  }
});

// Violins: tremolo fifths that swell (5-8), then a spiccato figure in eighths (9-16).
for (const bar of [5, 7]) {
  trem.note('D5', B(bar), 8, 92).note('A5', B(bar), 8, 88);
  trem.ramp(11, B(bar), B(bar + 2, -0.5), 58, 124, 1.6).cc(B(bar + 2, -0.25), 11, 70);
}
const FIG = /** @type {Record<string, string>} */ ({
  D: 'D5 D5 A5 D5 F5 D5 E5 C5',
  Bb: 'D5 D5 F5 D5 Bb5 F5 D5 C5',
  Eb: 'Eb5 Eb5 G5 Eb5 Bb5 G5 F5 D5',
  A: 'C#5 C#5 E5 C#5 A5 E5 D5 C#5',
});
for (let bar = 9; bar <= 16; bar++) {
  FIG[ROOTS[bar - 1]].split(' ').forEach((n, j) => vn.note(n, B(bar, j * 0.5), 0.22, j % 2 ? 88 : 104, { tight: true }));
}

// Brass chords (5-8), stabs (9-12), theme in octaves (13-16).
for (let bar = 5; bar <= 8; bar++) {
  const r = ROOTS[bar - 1];
  hn.chord(CHORDS[r], B(bar), 3.9, 92);
  tb.chord([k(CHORDS[r][0]) - 12, k(CHORDS[r][2]) - 12], B(bar), 3.9, 90);
  tuS.note(low(r) - 12, B(bar), 0.5, 104, { tight: true });
}
hn.ramp(11, B(5), B(9), 78, 118, 1.2).cc(B(9), 11, 104);
tb.ramp(11, B(5), B(9), 78, 116, 1.2).cc(B(9), 11, 104);
const STAB = [0, 3, 6, 10, 12];
for (let bar = 9; bar <= 12; bar++) {
  const r = ROOTS[bar - 1];
  for (const st of STAB) {
    const v = st === 0 ? 122 : 108;
    hnS.chord(CHORDS[r], B(bar, S(st)), 0.3, v, { tight: true });
    tbS.chord([k(CHORDS[r][0]) - 12, k(CHORDS[r][1]) - 12], B(bar, S(st)), 0.3, v, { tight: true });
    tuS.note(low(r) - 12, B(bar, S(st)), 0.3, v, { tight: true });
  }
}
const THEME = 'D4:q. E4:e F4:q A4:q G4:h. F4:e Eb4:e D4:q. Eb4:e D4:q Bb3:q C#4:h. D4:e E4:e';
hn.play(THEME, B(13), { vel: 104 });
tb.play(THEME, B(13), { vel: 100, transpose: -12 });
hn.ramp(11, B(13), B(16, 3), 100, 124, 1).cc(B(16, 3.9), 11, 96);
tuS.play('D2:q r:h. Eb2:q r:h. Bb1:q r:h. A1:q r:q A1:q A1:q', B(13), { vel: 110, tight: true });

// Percussion.
for (let bar = 1; bar <= 16; bar++) {
  const r = ROOTS[bar - 1];
  const fill = bar % 8 === 0;
  bd.note(36, B(bar), 1, 118, { tight: true }).note(36, B(bar, S(8)), 1, 110, { tight: true });
  bd.note(36, B(bar, S(3)), 1, 82, { tight: true }).note(36, B(bar, S(11)), 1, 80, { tight: true });
  if (!fill) {
    toms.note(43, B(bar, S(6)), 0.5, 96, { tight: true }).note(47, B(bar, S(14)), 0.5, 90, { tight: true });
  } else {
    for (let st = 8; st < 16; st++) toms.note(st % 2 ? 43 : 47, B(bar, S(st)), 0.25, 80 + st * 3, { tight: true });
    for (let st = 8; st < 16; st++) snare.note(38, B(bar, S(st)), 0.2, 50 + (st - 8) * 9, { tight: true });
  }
  const tk = r === 'Bb' ? k('Bb1') : r === 'Eb' ? k('Eb2') : r === 'A' ? k('A1') : k('D2');
  if (bar >= 5) timp.note(tk, B(bar), 1, 108, { tight: true }).note(k('A1'), B(bar, 2), 1, 96, { tight: true });
  else timp.note(k('D2'), B(bar), 1, 100, { tight: true });
  if (bar >= 5) {
    metal.note(76, B(bar, 1), 0.3, 96, { tight: true }).note(76, B(bar, 3), 0.3, 100, { tight: true });
  }
  brake.note(bar % 2 ? 77 : 78, B(bar, 1), 0.3, bar >= 5 ? 100 : 84, { tight: true }).note(78, B(bar, 3), 0.3, bar >= 5 ? 104 : 88, { tight: true });
  if (bar % 4 === 1) pno.chord(['D1', 'D2', 'A2'], B(bar), 1.5, bar === 1 || bar === 9 ? 112 : 100, { tight: true });
}
// Timpani rolls and cymbal swells into bars 9 and 1 (the loop point), crashes on 1 and 9.
for (const bar of [8, 16]) {
  roll.note('D2', B(bar), 3.9, 110, { tight: true });
  roll.ramp(11, B(bar), B(bar, 3.9), 40, 127, 1.8).cc(B(bar + 1), 11, 60);
  cym.note(53, B(bar, 4 - (2.0 * 128) / 60), 2.2, 112, { tight: true });
}
cym.note(49, B(1), 2, 118, { tight: true }).note(49, B(9), 2, 124, { tight: true });
cym.note(49, B(5), 2, 96, { tight: true }).note(49, B(13), 2, 110, { tight: true });

s.marker(B(1), 'ostinato');
s.marker(B(5), 'brass chords');
s.marker(B(9), 'stabs');
s.marker(B(13), 'horde theme');

const perc = [{ type: /** @type {const} */ ('highpass'), freq: 35 }];
/** @type {import('../build.mjs').Composition} */
export default {
  id: 'horde',
  title: 'Horde',
  layer: 'horde',
  score: s,
  mix: {
    tracks: {
      'celli-spic': { eq: [{ type: 'highpass', freq: 55 }, { type: 'peaking', freq: 250, q: 1, gain: -2 }, { type: 'peaking', freq: 2500, q: 1, gain: 2 }], level: -22 },
      'basses-spic': { eq: [{ type: 'highpass', freq: 32 }, { type: 'lowpass', freq: 5000 }], level: -24 },
      'violas-spic': { eq: [{ type: 'highpass', freq: 150 }], level: -27 },
      'violins-spic': { eq: [{ type: 'highpass', freq: 250 }], level: -24 },
      'violins-trem': { eq: [{ type: 'highpass', freq: 250 }], level: -27 },
      'horn-sus': { eq: [{ type: 'highpass', freq: 90 }], level: -23 },
      'trombone-sus': { eq: [{ type: 'highpass', freq: 60 }], level: -25 },
      'horn-stac': { eq: [{ type: 'highpass', freq: 90 }], level: -24 },
      'trombone-stac': { eq: [{ type: 'highpass', freq: 60 }], level: -25 },
      'tuba-stac': { eq: [{ type: 'highpass', freq: 30 }, { type: 'lowpass', freq: 3000 }], level: -26 },
      timpani: { eq: perc, level: -25 },
      'timpani-roll': { eq: perc, level: -27 },
      'bass-drum': { eq: [...perc, { type: 'peaking', freq: 60, q: 1, gain: 3 }], level: -20 },
      toms: { eq: perc, level: -24 },
      anvil: { eq: [{ type: 'highpass', freq: 300 }, { type: 'lowpass', freq: 9000 }], level: -30 },
      'brake-drum': { eq: [{ type: 'highpass', freq: 250 }], level: -29 },
      snare: { eq: [{ type: 'highpass', freq: 120 }], level: -29 },
      cymbal: { eq: [{ type: 'highpass', freq: 300 }], level: -28 },
      piano: { eq: [{ type: 'highpass', freq: 30 }, { type: 'lowpass', freq: 3500 }], level: -25 },
    },
    reverbReturnDb: -6,
  },
};
