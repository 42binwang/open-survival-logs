// @ts-check
// Pre-outbreak — ten hours to hoard. D minor turning to F, 120 BPM, 16 bars (32 s), seamless loop. A claves clock
// ticks in eighths under pizzicato oom-pah, marimba arpeggios and a hurried clarinet tune the xylophone takes up an
// octave higher; bassoon staccato keeps count. Busy, a little comic, never relaxed.

import { Score } from '../score.mjs';
import { midi as k, voice } from '../theory.mjs';

const s = new Score({ title: 'Pre-outbreak', bpm: 120, bars: 16, loop: true, seed: 12001 });
const B = (/** @type {number} */ n, plus = 0) => s.bar(n, plus);
const hum = { timing: 0.008, velocity: 5 };

const clock = s.track('claves', { volume: 104, pan: 0.45, reverb: 40, humanize: { timing: 0.002, velocity: 3 } });
const vcP = s.track('celli-pizz', { volume: 118, pan: 0.25, reverb: 48, humanize: hum });
const vnP = s.track('violins-pizz', { volume: 112, pan: -0.3, reverb: 52, humanize: hum });
const mar = s.track('marimba', { volume: 108, pan: -0.12, reverb: 50, humanize: hum });
const cl = s.track('clarinet-stac', { volume: 116, pan: 0.1, reverb: 50, humanize: hum });
const bn = s.track('bassoon-stac', { volume: 112, pan: 0.3, reverb: 46, humanize: hum });
const xy = s.track('xylophone', { volume: 104, pan: -0.25, reverb: 54, humanize: hum });
const sn = s.track('snare', { volume: 96, pan: 0.05, reverb: 44, humanize: { timing: 0.004, velocity: 6 } });
const gl = s.track('glockenspiel', { volume: 96, pan: -0.4, reverb: 64, humanize: hum });

const CHORDS = ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'Dm', 'Gm', 'A7', 'F', 'C', 'Dm', 'A', 'Bb', 'C', 'Dm', 'A7'];
const ROOT = /** @type {Record<string, string>} */ ({ Dm: 'D3', Bb: 'Bb2', C: 'C3', Gm: 'G2', A7: 'A2', A: 'A2', F: 'F2' });

CHORDS.forEach((sym, i) => {
  const bar = i + 1;
  for (let e = 0; e < 8; e++) clock.note(75, B(bar, e * 0.5), 0.2, e % 2 ? 58 : 84, { tight: true });
  const r = k(ROOT[sym]);
  vcP.note(r, B(bar), 0.5, 100).note(r + 7, B(bar, 1.5), 0.5, 80).note(r + 12, B(bar, 2), 0.5, 92).note(r + 7, B(bar, 3.5), 0.5, 78);
  const up = voice(sym, { low: k('F4'), high: k('E5') });
  for (const off of [0.5, 1.5, 2.5, 3.5]) vnP.chord(up.slice(0, 2), B(bar, off), 0.4, off === 2.5 ? 92 : 80);
  const arp = voice(sym, { low: k('D4'), high: k('C6') });
  if (bar <= 4) for (let e = 0; e < 8; e++) mar.note(arp[e % arp.length], B(bar, e * 0.5), 0.45, e % 2 ? 62 : 74);
  else {
    for (let st = 0; st < 16; st++) {
      const n = arp[(st * (st % 4 === 3 ? 2 : 1)) % arp.length];
      mar.note(n + (st >= 8 && n < k('C6') ? 12 : 0), B(bar, st / 4), 0.24, st % 4 === 0 ? 80 : 60);
    }
  }
  if (bar >= 9) {
    const low = k(ROOT[sym]);
    [low + 12, low + 19, low + 15, low + 12, low + 7, low + 12].forEach((x, j) => bn.note(x, B(bar, 0.5 + j * 0.5), 0.3, j % 2 ? 72 : 86));
    for (let st = 0; st < 16; st++) if (st % 4 !== 0) sn.note(38, B(bar, st / 4), 0.1, 22 + ((st * 7) % 11), { tight: true });
    sn.note(38, B(bar, 3.5), 0.2, bar % 4 === 0 ? 92 : 64, { tight: true });
  }
});
// Clarinet tune (5-12), xylophone variation an octave up (13-16).
cl.play('A4:e D5:e E5:e F5:e A5:q F5:q E5:e F5:e E5:e D5:e C#5:q A4:q Bb4:e D5:e G5:e D5:e Bb5:q G5:q A5:e G5:e F5:e E5:e C#5:q E5:q', B(5), { vel: 92, legato: 0.8 });
cl.play('F5:e A5:e C6:e A5:e F5:q C5:q E5:e G5:e C6:e G5:e E5:q C5:q D5:e F5:e A5:e F5:e D5:q A4:q C#5:e E5:e A5:e E5:e C#5:q E5:q', B(9), { vel: 96, legato: 0.8 });
xy.play('D6:e F5:e Bb5:e F5:e D6:q Bb5:q E6:e G5:e C6:e G5:e E6:q C6:q F6:e D6:e A5:e F5:e D6:q A5:q E6:e C#6:e A5:e G5:e E5:q C#5:q', B(13), { vel: 96 });
cl.play('D5:q r:q Bb4:q r:q E5:q r:q C5:q r:q F5:q r:q D5:q r:q E5:q C#5:q A4:q r:q', B(13), { vel: 80, legato: 0.6 });
for (const bar of [1, 9, 13]) gl.note(bar === 9 ? 'C6' : 'A5', B(bar), 2, 84);

/** @type {import('../build.mjs').Composition} */
export default {
  id: 'pre-outbreak',
  title: 'Pre-outbreak',
  layer: 'pre-outbreak',
  score: s,
  mix: {
    tracks: {
      claves: { eq: [{ type: 'highpass', freq: 400 }], level: -33 },
      'celli-pizz': { eq: [{ type: 'highpass', freq: 50 }], level: -26 },
      'violins-pizz': { eq: [{ type: 'highpass', freq: 200 }], level: -29 },
      marimba: { eq: [{ type: 'highpass', freq: 120 }], level: -28 },
      'clarinet-stac': { eq: [{ type: 'highpass', freq: 150 }], level: -24 },
      'bassoon-stac': { eq: [{ type: 'highpass', freq: 50 }], level: -28 },
      xylophone: { eq: [{ type: 'highpass', freq: 300 }], level: -25 },
      snare: { eq: [{ type: 'highpass', freq: 150 }], level: -33 },
      glockenspiel: { eq: [{ type: 'highpass', freq: 500 }], level: -32 },
    },
    reverbReturnDb: -7,
  },
};
