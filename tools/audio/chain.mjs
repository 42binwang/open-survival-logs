// @ts-check
// The shared processing chain: every sound of the lane goes through these stages, offline (tools/audio/build-sfx.mjs,
// tools/music/build.mjs, tools/audio/mix.mjs) and live (pages/audio-test.html reads the same numbers from the
// manifest and the scene file).
//
//   1. clean      DC / rumble high-pass at 20 Hz, silence trimmed (one-shots), raised-cosine edge fades
//   2. EQ         the family's biquad chain (Web Audio BiquadFilterNode formulas)
//   3. space      room reverb per space: the IR of assets/audio/ir/<space>.wav at the space's wet level; sounds in
//                 another space than the listener's reach it through a portal (low-pass + attenuation)
//   4. loudness   one-shots to a momentary-max target (LUFS-M, dual-mono equivalent for mono files), loops and beds
//                 to an integrated target, music stems to -16 LUFS integrated; true peak <= -1 dBTP on the encoded
//                 file, checked with ffmpeg ebur128
//
// Assets ship dry (stages 1, 2, 4); the space is applied by the mixer, except for sounds that only exist in a space
// (thunder, the crowd outside), which bake it in.

import { writeOgg, measure } from './lib/io.mjs';
import { SR, dbToGain, filterChannels, scale, fade } from './lib/dsp.mjs';
import { limit, limitCircular } from './lib/limiter.mjs';
import { momentaryMax } from './lib/loudness.mjs';
import { masterToOgg } from './lib/master.mjs';

/**
 * @typedef {import('./lib/dsp.mjs').FilterSpec} FilterSpec
 * @typedef {{ title: string, wetDb: number, sendHighpass: number, portal: { lowpass: number, gainDb: number } | null }} SpaceMix
 *   wetDb: send level into the space's reverb; sendHighpass: the send is high-passed so low end never booms in the
 *   tail; portal: how the space is heard from the apartment (null: the listener's own space)
 */

/** Mixing parameters of the spaces (acoustics in tools/audio/spaces.mjs). */
export const SPACES = /** @type {Record<string, SpaceMix>} */ ({
  apartment: { title: 'Apartment', wetDb: -14, sendHighpass: 160, portal: null },
  stairwell: { title: 'Stairwell (behind the front door)', wetDb: -4, sendHighpass: 220, portal: { lowpass: 1100, gainDb: -9 } },
  shop: { title: 'Corner shop', wetDb: -10, sendHighpass: 180, portal: null },
  basement: { title: 'Basement', wetDb: -8, sendHighpass: 120, portal: { lowpass: 700, gainDb: -14 } },
  outdoors: { title: 'Street outside (through the closed window)', wetDb: -10, sendHighpass: 200, portal: { lowpass: 3000, gainDb: -5 } },
});

/**
 * Buses, their default levels, and the ducking rules (voice-activity ducking: while a voice tagged `duck` plays on the
 * trigger bus, the target bus is pulled down by depthDb with the given attack and release, as Wwise auto-ducking).
 */
export const BUSES = /** @type {const} */ ({
  master: { gainDb: 0 },
  music: { gainDb: -5 },
  sfx: { gainDb: 2 },
  ambience: { gainDb: -1.5 },
  ui: { gainDb: -3 },
});
export const DUCKING = [
  { target: 'music', trigger: 'sfx', tag: 'impact', depthDb: -4, attack: 0.02, release: 0.35 },
  { target: 'music', trigger: 'sfx', tag: 'voice', depthDb: -2, attack: 0.08, release: 0.5 },
  { target: 'ambience', trigger: 'music', tag: 'horde', depthDb: -3, attack: 0.5, release: 2.0 },
  { target: 'music', trigger: 'ui', tag: 'ui', depthDb: -1.5, attack: 0.02, release: 0.25 },
];

/** Loudness targets by category (see docs/AUDIO.md). */
/** The test mix's bus EQ (applied before the master gain, live and offline). */
export const MASTER_EQ = /** @type {import('./lib/dsp.mjs').FilterSpec[]} */ ([{ type: 'lowshelf', freq: 110, gain: -2.5 }]);

export const TARGETS = {
  musicStemLufs: -16,
  testMixLufs: -16,
  maxTruePeak: -1,
};

/**
 * Stage 1-2 for a one-shot: DC high-pass, EQ, short fades.
 * @param {Float32Array[]} chans
 * @param {FilterSpec[]} eq
 */
export function cleanAndEq(chans, eq) {
  filterChannels(chans, [{ type: 'highpass', freq: 20 }, ...eq]);
  const n = chans[0].length;
  fade(chans, Math.min(Math.round(0.001 * SR), Math.floor(n * 0.05)), Math.min(Math.round(0.012 * SR), Math.floor(n * 0.2)));
  return chans;
}

/**
 * Stage 4 for a one-shot: momentary-max normalization (mono measured as dual mono), true-peak limiting, Vorbis encode,
 * checked with ffmpeg; the ceiling is lowered until the encoded file meets maxTruePeak.
 * @param {string} path
 * @param {Float32Array[]} chans  not modified
 * @param {{ lufsM: number, maxTruePeak?: number, quality?: number, comment?: string[] }} o
 */
export function masterOneShot(path, chans, o) {
  const maxTp = o.maxTruePeak ?? TARGETS.maxTruePeak;
  const probe = chans.length === 1 ? [chans[0], chans[0]] : chans;
  const m = momentaryMax(probe);
  let ceiling = maxTp - 0.8;
  /** @type {{ momentary: number, truePeak: number, passes: number }} */
  let rep = { momentary: m, truePeak: 0, passes: 0 };
  for (let pass = 1; pass <= 5; pass++) {
    const y = chans.map((c) => c.slice());
    scale(y, dbToGain(o.lufsM - m));
    limit(y, { ceilingDb: ceiling, attack: 0.001, release: 0.05 });
    writeOgg(path, y, { quality: o.quality ?? 5, comment: o.comment });
    const r = measure(path);
    const my = momentaryMax(y.length === 1 ? [y[0], y[0]] : y);
    rep = { momentary: my, truePeak: r.truePeak, passes: pass };
    if (r.truePeak <= maxTp - 0.15) break;
    ceiling -= r.truePeak - (maxTp - 0.15) + 0.1;
  }
  return rep;
}

/**
 * Stage 4 for a loop or bed: integrated normalization with circular limiting, checked with ffmpeg.
 * @param {string} path
 * @param {Float32Array[]} chans
 * @param {{ lufs: number, quality?: number, comment?: string[] }} o
 */
export function masterLoop(path, chans, o) {
  const y = filterCircular(chans, [{ type: 'highpass', freq: 20 }]);
  return masterToOgg(path, y, { lufs: o.lufs, maxTruePeak: TARGETS.maxTruePeak, quality: o.quality ?? 5, comment: o.comment, loop: true });
}

/**
 * Filters a seamless loop without breaking the seam: the loop is filtered twice in a row and the second pass kept, so
 * the filter state at the start equals its state at the end.
 * @param {Float32Array[]} chans
 * @param {FilterSpec[]} specs
 */
export function filterCircular(chans, specs) {
  return chans.map((ch) => {
    const n = ch.length;
    const two = [new Float32Array(2 * n)];
    two[0].set(ch, 0);
    two[0].set(ch, n);
    filterChannels(two, specs);
    return two[0].slice(n);
  });
}

export { limitCircular };
