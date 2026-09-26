// @ts-check
// The 60-second audio test as a cue sheet: apartment at night -> rain -> a zombie at the door -> the horde -> quiet.
// Written to assets/audio/test/audio-test-60s.json, rendered offline by tools/audio/mix.mjs and played live by
// pages/audio-test.html, so both hear the same script. Variant, pitch and gain of every repeated sound are drawn
// here with the family's variation rules (no immediate repeat, pitch and gain ranges from the manifest) from a fixed
// seed; music cues sit on the shared bar grid (3.75 s: one night bar, two horde bars).
//
// Coordinates: metres, listener at the origin facing -z (the front door), +x to the right, +y up.

import { Rng } from './lib/rng.mjs';
import { BUSES, DUCKING, MASTER_EQ, SPACES } from './chain.mjs';
import { SPACE_MODELS } from './spaces.mjs';

export const SCENE_SCHEMA = 'survival-logs/audio-scene@1';
const BAR = 3.75;

/**
 * @typedef {[number, number, number]} Vec3
 * @typedef {{ t: number, gainDb: number, ramp: number }} Automation
 * @typedef {{ t: number, kind: 'music' | 'loop' | 'sfx' | 'ui', asset: string, variant?: string, bus: 'music' | 'sfx' | 'ambience' | 'ui',
 *   gainDb: number, pitch?: number, position?: Vec3, space?: string, sends?: Record<string, number>, offset?: number,
 *   end?: number, fadeIn?: number, fadeOut?: number, automation?: Automation[], tags?: string[], note?: string }} Cue
 * @typedef {{ variants: Record<string, unknown>, params: { pitchCents: number, gainDb: number } }} FamilyInfo
 */

/**
 * @param {Record<string, FamilyInfo>} families  manifest entries by asset id
 * @returns {object}
 */
export function buildScene(families) {
  const rng = new Rng('audio-test-60s');
  /** @type {Record<string, string[]>} */
  const bags = {};
  /** @type {Record<string, string>} */
  const last = {};
  /** No immediate repeats: a shuffled bag per family, refilled without putting the last variant first. @param {string} asset */
  const pick = (asset) => {
    const fam = families[asset];
    if (!fam) throw new Error(`scene: ${asset} is not in the manifest`);
    if (!bags[asset]?.length) {
      const all = Object.keys(fam.variants);
      for (let i = all.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        [all[i], all[j]] = [all[j], all[i]];
      }
      if (all[0] === last[asset] && all.length > 1) [all[0], all[1]] = [all[1], all[0]];
      bags[asset] = all;
    }
    const v = /** @type {string} */ (bags[asset].shift());
    last[asset] = v;
    return v;
  };
  /** Pitch and gain variation within the family's ranges. @param {string} asset */
  const vary = (asset) => {
    const p = families[asset].params;
    return { pitch: Math.round(2 ** (rng.range(-p.pitchCents, p.pitchCents) / 1200) * 10000) / 10000, gainDb: Math.round(rng.range(-p.gainDb, p.gainDb) * 100) / 100 };
  };
  /** @type {Cue[]} */
  const cues = [];
  /**
   * A one-shot with variation.
   * @param {number} t
   * @param {string} family
   * @param {Partial<Cue>} [o]
   */
  const shot = (t, family, o = {}) => {
    const asset = `audio/${family}`;
    const v = vary(asset);
    const kind = family.startsWith('ui-') ? 'ui' : 'sfx';
    cues.push({ t: Math.round(t * 1000) / 1000, kind, asset, variant: pick(asset), bus: kind === 'ui' ? 'ui' : 'sfx', pitch: v.pitch, ...o, gainDb: Math.round(((o.gainDb ?? 0) + v.gainDb) * 100) / 100 });
  };
  /**
   * Footsteps along a line.
   * @param {number} t0
   * @param {number} interval
   * @param {Vec3} from
   * @param {Vec3} to
   * @param {number} count
   * @param {'footstep-wood' | 'footstep-tile'} floor
   * @param {number} [gainDb]
   */
  const walk = (t0, interval, from, to, count, floor, gainDb = 3) => {
    for (let i = 0; i < count; i++) {
      const u = count === 1 ? 0 : i / (count - 1);
      const side = i % 2 ? 0.12 : -0.12;
      const p = /** @type {Vec3} */ ([from[0] + (to[0] - from[0]) * u + side, 0.05, from[2] + (to[2] - from[2]) * u]);
      shot(t0 + i * interval + rng.range(-0.02, 0.02), floor, { position: /** @type {Vec3} */ (p.map((x) => Math.round(x * 100) / 100)), space: 'apartment', gainDb });
    }
  };

  const DOOR = /** @type {Vec3} */ ([0.3, 1.2, -4.5]);
  const WINDOW = /** @type {Vec3} */ ([-3.8, 1.4, -1.0]);
  const STOVE = /** @type {Vec3} */ ([2.8, 0.9, 1.2]);
  const GENERATOR = /** @type {Vec3} */ ([-1.6, 0.5, 5.5]);
  /** A zombie behind the door, somewhere on the landing. @param {number} [spread] */
  const landing = (spread = 1) => /** @type {Vec3} */ ([Math.round((0.3 + rng.range(-1.2, 1.2) * spread) * 100) / 100, 1.6, Math.round(rng.range(-5.2, -6.8) * 100) / 100]);
  const doorImpact = { position: DOOR, space: 'apartment', sends: { stairwell: -10 }, tags: ['impact'] };
  const groan = { space: 'stairwell', tags: ['voice'] };

  // --- Music (bar grid of 3.75 s).
  cues.push({ t: 0, kind: 'music', asset: 'audio/music-night', bus: 'music', gainDb: -1, fadeIn: 2.5, end: 7 * BAR + 2.2, fadeOut: 2.0, note: 'night layer, bars 1-8' });
  cues.push({ t: 7 * BAR, kind: 'music', asset: 'audio/music-night-to-horde', bus: 'music', gainDb: 0, note: 'riser; its hit lands on 30.0 s' });
  cues.push({ t: 8 * BAR, kind: 'music', asset: 'audio/music-horde', bus: 'music', gainDb: 1.5, end: 12 * BAR, fadeOut: 0.06, tags: ['horde'], note: 'horde layer, 8 bars' });
  cues.push({ t: 12 * BAR, kind: 'music', asset: 'audio/music-horde-end', bus: 'music', gainDb: 0, note: 'the last blow' });
  cues.push({ t: 13 * BAR, kind: 'music', asset: 'audio/music-night', bus: 'music', gainDb: -7, fadeIn: 3, end: 60, fadeOut: 4.5, note: 'night layer returns, quiet' });

  // --- Beds and loops.
  cues.push({ t: 0, kind: 'loop', asset: 'audio/amb-roomtone', variant: '01', bus: 'ambience', gainDb: 3, fadeIn: 1.5, end: 60, fadeOut: 2.5, space: 'apartment' });
  cues.push({ t: 0.2, kind: 'loop', asset: 'audio/generator', variant: '01', bus: 'sfx', gainDb: -5, fadeIn: 2, end: 60, fadeOut: 4, position: GENERATOR, space: 'outdoors', note: 'on the balcony' });
  cues.push({ t: 0.5, kind: 'loop', asset: 'audio/amb-night-street', variant: '02', bus: 'ambience', gainDb: 0, fadeIn: 3, end: 60, fadeOut: 3, space: 'outdoors' });
  cues.push({ t: 7.8, kind: 'loop', asset: 'audio/cooking-sizzle', variant: '02', bus: 'sfx', gainDb: -5, fadeIn: 0.25, end: 26.4, fadeOut: 1.2, position: STOVE, space: 'apartment', note: 'cooking on the stove' });
  cues.push({
    t: 9.5,
    kind: 'loop',
    asset: 'audio/rain',
    variant: '02',
    bus: 'ambience',
    gainDb: 0,
    fadeIn: 5,
    end: 60,
    fadeOut: 3.5,
    space: 'outdoors',
    automation: [
      { t: 15, gainDb: 6, ramp: 7 },
      { t: 45, gainDb: 3, ramp: 4 },
      { t: 49, gainDb: -2, ramp: 8 },
    ],
    note: 'rain on the street, through the closed window',
  });
  cues.push({ t: 13.5, kind: 'loop', asset: 'audio/rain', variant: '03', bus: 'ambience', gainDb: -2, fadeIn: 6, end: 47, fadeOut: 6, space: 'outdoors', note: 'heavier layer' });
  cues.push({ t: 29.6, kind: 'loop', asset: 'audio/amb-horde-crowd', variant: '02', bus: 'ambience', gainDb: -2, fadeIn: 2.2, end: 47.5, fadeOut: 5, space: 'outdoors', note: 'the horde in the street' });

  // --- Section 1: apartment at night (0-10 s).
  walk(1.2, 0.56, [-2.3, 0, -1.4], [1.7, 0, 0.3], 6, 'footstep-wood');
  walk(4.62, 0.52, [2.1, 0, 0.7], [2.5, 0, 1.1], 2, 'footstep-tile');
  shot(6.3, 'pickup', { gainDb: -2 });
  shot(6.95, 'ui-click');
  shot(7.35, 'ui-confirm');

  // --- Section 2: rain (10-20 s).
  shot(12.4, 'thunder', { variant: '05', bus: 'ambience', space: 'outdoors', gainDb: 0 });
  shot(14.9, 'ui-click');
  shot(15.4, 'ui-error');
  walk(16.3, 0.55, [2.4, 0, 1.0], [2.2, 0, 0.6], 2, 'footstep-tile');
  walk(17.4, 0.58, [1.6, 0, 0.2], [0.4, 0, -1.2], 3, 'footstep-wood');
  shot(18.3, 'thunder', { variant: '03', bus: 'ambience', space: 'outdoors', gainDb: 0 });

  // --- Section 3: a zombie at the door (20-30 s).
  shot(20.2, 'zombie-groan', { variant: '06', position: landing(0.3), ...groan, gainDb: -2 });
  shot(21.9, 'door-knock', { variant: '04', ...doorImpact, gainDb: 0 });
  shot(23.1, 'zombie-groan', { variant: '01', position: landing(0.3), ...groan, gainDb: 0 });
  shot(24.5, 'door-bang', { ...doorImpact, gainDb: -1 });
  shot(25.2, 'ui-click');
  shot(25.55, 'ui-confirm');
  walk(25.7, 0.34, [0.6, 0, -1.3], [0.35, 0, -3.1], 3, 'footstep-wood', 4);
  shot(26.8, 'door-bang', { ...doorImpact, gainDb: 0 });
  shot(27.6, 'zombie-groan', { variant: '04', position: landing(0.5), ...groan, gainDb: 1 });
  shot(28.35, 'thunder', { variant: '01', bus: 'ambience', space: 'outdoors', gainDb: -1 });
  shot(29.1, 'door-bang', { ...doorImpact, gainDb: 0 });

  // --- Section 4: the horde (30-45 s).
  for (const t of [30.45, 31.95, 33.2, 34.55, 35.95, 37.35, 39.2, 40.45, 41.9, 43.3, 44.3]) shot(t, 'door-bang', { ...doorImpact, gainDb: rng.range(-3, 0) });
  for (const t of [30.9, 32.4, 33.8, 35.2, 36.7, 38.3, 39.9, 41.4, 42.8, 44.0]) shot(t, 'zombie-groan', { position: landing(1), ...groan, gainDb: rng.range(-3, 1) });
  shot(34.9, 'thunder', { variant: '02', bus: 'ambience', space: 'outdoors', gainDb: -2 });
  shot(33.55, 'ui-error');
  shot(36.4, 'ui-click');
  shot(36.75, 'ui-confirm');
  shot(38.0, 'pickup', { gainDb: -1 });
  walk(38.6, 0.33, [0.9, 0, -0.8], [0.4, 0, -3.0], 5, 'footstep-wood', 4);

  // --- Section 5: quiet (45-60 s).
  shot(46.6, 'zombie-groan', { variant: '03', position: [1.4, 1.6, -7.5], ...groan, gainDb: -7 });
  shot(49.6, 'zombie-groan', { variant: '02', position: [-1.8, 1.6, -9], ...groan, gainDb: -12 });
  walk(50.4, 0.72, [0.3, 0, -2.6], [-0.8, 0, -0.4], 3, 'footstep-wood', 1);
  shot(53.2, 'thunder', { variant: '04', bus: 'ambience', space: 'outdoors', gainDb: -3 });
  shot(55.4, 'pickup', { gainDb: -4 });
  shot(56.3, 'ui-click', { gainDb: -2 });

  cues.sort((a, b) => a.t - b.t || a.asset.localeCompare(b.asset));
  return {
    schema: SCENE_SCHEMA,
    id: 'audio-test-60s',
    title: 'Survival Log — 60-second audio test',
    duration: 60,
    sampleRate: 48000,
    listener: { space: 'apartment', position: [0, 1.6, 0], forward: [0, 0, -1], up: [0, 1, 0] },
    panner: { panningModel: 'equalpower', distanceModel: 'inverse', refDistance: 1.2, maxDistance: 60, rolloffFactor: 1 },
    buses: Object.fromEntries(Object.entries(BUSES).map(([k, v]) => [k, { gainDb: v.gainDb }])),
    masterGainDb: 0,
    masterEq: MASTER_EQ,
    ducking: DUCKING,
    spaces: Object.fromEntries(Object.entries(SPACES).map(([k, v]) => [k, { ...v, ir: `assets/audio/ir/${k}.wav`, rt60: SPACE_MODELS[k].rt60 }])),
    emitters: { door: DOOR, window: WINDOW, stove: STOVE, generator: GENERATOR },
    sections: [
      { t: 0, title: 'Apartment at night' },
      { t: 10, title: 'Rain' },
      { t: 20, title: 'A zombie at the door' },
      { t: 30, title: 'The horde' },
      { t: 45, title: 'Quiet' },
    ],
    cues,
  };
}
