// @ts-check
// Horde end: the last blow and the silence after it. A tam-tam, bass drum, timpani and low brass hit on beat 1 (the
// start of the file), then the brass chord and low strings fade out under the ringing gong. The mixer cuts the horde
// loop on the same downbeat.

import { Score } from '../score.mjs';

const s = new Score({ title: 'Horde end', bpm: 128, bars: 1, loop: false, tail: 6.2, seed: 12803 });
const tight = { timing: 0.002, velocity: 2 };

const gong = s.track('gong', { volume: 120, pan: 0.1, reverb: 70, humanize: tight });
const bd = s.track('bass-drum', { volume: 126, pan: 0, reverb: 54, humanize: tight });
const timp = s.track('timpani', { volume: 124, pan: 0.05, reverb: 56, humanize: tight });
const cym = s.track('cymbal', { volume: 108, pan: -0.25, reverb: 76, humanize: tight });
const hn = s.track('horn-sus', { volume: 116, pan: -0.15, reverb: 66, expression: 122, humanize: tight });
const tb = s.track('trombone-sus', { volume: 114, pan: 0.18, reverb: 62, expression: 122, humanize: tight });
const tuS = s.track('tuba-stac', { volume: 118, pan: 0.25, reverb: 50, humanize: tight });
const vc = s.track('celli-sus', { volume: 120, pan: 0.25, reverb: 66, expression: 118, humanize: tight });
const cb = s.track('basses-sus', { volume: 120, pan: 0.35, reverb: 60, expression: 118, humanize: tight });
const pno = s.track('piano', { volume: 118, pan: -0.05, reverb: 64, humanize: tight });

gong.note(57, 0, 6, 127, { tight: true });
bd.note(36, 0, 2, 127, { tight: true });
timp.note('D2', 0, 2, 127, { tight: true }).note('A1', 0, 2, 112, { tight: true });
cym.note(49, 0, 3, 120, { tight: true });
hn.chord(['D4', 'F4', 'A4'], 0, 5, 110, { tight: true });
tb.chord(['D3', 'A3'], 0, 5, 110, { tight: true });
tuS.note('D2', 0, 0.5, 127, { tight: true });
vc.chord(['D3', 'A3'], 0, 6, 100, { tight: true });
cb.note('D2', 0, 6, 104, { tight: true });
pno.chord(['D1', 'D2', 'A2', 'D3', 'F3'], 0, 8, 116, { tight: true });
pno.pedal(0.01, 12);
for (const t of [hn, tb]) t.ramp(11, 0.4, 5, 122, 8, 0.6);
for (const t of [vc, cb]) t.ramp(11, 0.4, 7, 118, 6, 0.7);

/** @type {import('../build.mjs').Composition} */
export default {
  id: 'horde-end',
  title: 'Horde end',
  layer: 'transition',
  score: s,
  mix: {
    tracks: {
      gong: { eq: [{ type: 'highpass', freq: 40 }], level: -20 },
      'bass-drum': { eq: [{ type: 'highpass', freq: 30 }, { type: 'peaking', freq: 60, q: 1, gain: 3 }], level: -21 },
      cymbal: { eq: [{ type: 'highpass', freq: 300 }], level: -27 },
      piano: { eq: [{ type: 'highpass', freq: 30 }, { type: 'lowpass', freq: 4000 }], level: -24 },
      'tuba-stac': { eq: [{ type: 'lowpass', freq: 3000 }], level: -24 },
      timpani: { level: -22 },
      'horn-sus': { level: -24 },
      'trombone-sus': { level: -25 },
      'celli-sus': { level: -25 },
      'basses-sus': { level: -26 },
    },
    reverbReturnDb: -4,
    glue: false,
  },
};
