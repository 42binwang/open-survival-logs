// @ts-check
// Night -> horde transition: a two-bar riser at 128 BPM (one night bar, 3.75 s) whose hit lands on the downbeat
// where the horde loop starts. Tremolo strings and a timpani roll crescendo from nothing, a cymbal swell and a brass
// cluster grow in the second bar; the hit is the whole orchestra on D. The file keeps the ringing tail after the hit.
// The hit is at exactly lengthSeconds (3.75 s) from the start of the file.

import { Score } from '../score.mjs';

const s = new Score({ title: 'Night to horde', bpm: 128, bars: 2, loop: false, tail: 3.5, seed: 12802 });
const B = (/** @type {number} */ n, plus = 0) => s.bar(n, plus);
const HIT = B(3);
const tight = { timing: 0.003, velocity: 3 };

const vcT = s.track('celli-trem', { volume: 120, pan: 0.25, reverb: 60, expression: 20, humanize: tight });
const vnT = s.track('violins-trem', { volume: 118, pan: -0.3, reverb: 66, expression: 20, humanize: tight });
const roll = s.track('timpani-roll', { volume: 118, pan: 0.05, reverb: 52, expression: 20, humanize: tight });
const hn = s.track('horn-sus', { volume: 114, pan: -0.15, reverb: 60, expression: 30, humanize: tight });
const tb = s.track('trombone-sus', { volume: 112, pan: 0.18, reverb: 56, expression: 30, humanize: tight });
const cym = s.track('cymbal', { volume: 112, pan: -0.2, reverb: 72, humanize: tight });
const bd = s.track('bass-drum', { volume: 126, pan: 0, reverb: 50, humanize: tight });
const timp = s.track('timpani', { volume: 124, pan: 0.05, reverb: 52, humanize: tight });
const hnS = s.track('horn-stac', { volume: 120, pan: -0.15, reverb: 56, humanize: tight });
const tbS = s.track('trombone-stac', { volume: 118, pan: 0.18, reverb: 54, humanize: tight });
const tuS = s.track('tuba-stac', { volume: 116, pan: 0.25, reverb: 48, humanize: tight });
const vc = s.track('celli-spic', { volume: 120, pan: 0.22, reverb: 48, humanize: tight });
const cb = s.track('basses-spic', { volume: 120, pan: 0.32, reverb: 44, humanize: tight });
const pno = s.track('piano', { volume: 118, pan: -0.05, reverb: 60, humanize: tight });

// The riser.
vcT.chord(['D3', 'A3'], B(1), 7.95, 100, { tight: true });
vnT.chord(['D5', 'Eb5', 'A5'], B(1), 7.95, 96, { tight: true });
vcT.ramp(11, B(1), HIT - 0.05, 18, 127, 2.2);
vnT.ramp(11, B(1), HIT - 0.05, 14, 127, 2.4);
roll.note('D2', B(1), 7.95, 116, { tight: true });
roll.ramp(11, B(1), HIT - 0.05, 12, 127, 2);
hn.chord(['D4', 'Eb4', 'A4'], B(2), 3.95, 100, { tight: true });
tb.chord(['D3', 'A3'], B(2), 3.95, 100, { tight: true });
hn.ramp(11, B(2), HIT - 0.05, 24, 127, 1.6);
tb.ramp(11, B(2), HIT - 0.05, 24, 127, 1.6);
cym.note(53, HIT - (2.0 * 128) / 60, 2.2, 116, { tight: true });

// The hit.
bd.note(36, HIT, 2, 127, { tight: true });
timp.note('D2', HIT, 2, 127, { tight: true }).note('A1', HIT, 2, 110, { tight: true });
cym.note(49, HIT, 3, 127, { tight: true });
hnS.chord(['D4', 'F4', 'A4'], HIT, 0.5, 127, { tight: true });
tbS.chord(['D3', 'A3'], HIT, 0.5, 127, { tight: true });
tuS.note('D2', HIT, 0.5, 127, { tight: true });
vc.note('D3', HIT, 0.3, 127, { tight: true });
cb.note('D2', HIT, 0.3, 127, { tight: true });
pno.chord(['D1', 'D2', 'A2', 'D3'], HIT, 2.5, 118, { tight: true });

s.marker(HIT, 'hit');

/** @type {import('../build.mjs').Composition} */
export default {
  id: 'night-to-horde',
  title: 'Night to horde',
  layer: 'transition',
  score: s,
  mix: {
    tracks: {
      'celli-trem': { eq: [{ type: 'highpass', freq: 60 }], level: -24 },
      'violins-trem': { eq: [{ type: 'highpass', freq: 250 }], level: -25 },
      'bass-drum': { eq: [{ type: 'highpass', freq: 30 }, { type: 'peaking', freq: 60, q: 1, gain: 3 }], level: -20 },
      cymbal: { eq: [{ type: 'highpass', freq: 300 }], level: -26 },
      piano: { eq: [{ type: 'highpass', freq: 30 }, { type: 'lowpass', freq: 3500 }], level: -22 },
      'tuba-stac': { eq: [{ type: 'lowpass', freq: 3000 }], level: -24 },
      'timpani-roll': { level: -24 },
      'horn-sus': { level: -25 },
      'trombone-sus': { level: -26 },
      timpani: { level: -22 },
      'horn-stac': { level: -22 },
      'trombone-stac': { level: -23 },
      'celli-spic': { level: -24 },
      'basses-spic': { level: -25 },
    },
    reverbReturnDb: -5,
  },
};
