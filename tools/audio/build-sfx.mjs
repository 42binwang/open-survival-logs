#!/usr/bin/env node
// @ts-check
// Builds the SFX, UI and ambience families: renders every variant (Kenney recordings reworked, or synthesized),
// runs it through the shared chain (tools/audio/chain.mjs), encodes Ogg Vorbis, checks loudness and true peak on the
// encoded file with ffmpeg and writes the family entries of assets/audio/manifest.json.
//
//   node tools/audio/build-sfx.mjs [family ...]
//
// Every family has >= 3 variants; the manifest carries the playback variation rules (pitch and gain ranges, no
// immediate repeats, voice limit, cooldown) that the mixer and the page apply.

import { join } from 'node:path';
import { SR, compress, scale, toMono, varispeed } from './lib/dsp.mjs';
import { ROOT, rel, measure, duration } from './lib/io.mjs';
import { cleanAndEq, filterCircular, masterLoop, masterOneShot } from './chain.mjs';
import { updateManifest, readManifest } from './manifest.mjs';
import { kenney, recordSonnissAttempt } from './sources.mjs';
import { knock, bang, footstep, layered } from './sfx/foley.mjs';
import { zombieVoice, GROANS } from './sfx/voice.mjs';
import { rain, thunder } from './sfx/weather.mjs';
import { sizzle, generator } from './sfx/machines.mjs';
import { roomTone, nightStreet, hordeCrowd } from './sfx/ambience.mjs';

/**
 * @typedef {import('./lib/dsp.mjs').FilterSpec} FilterSpec
 * @typedef {{ chans: Float32Array[], recipe: string, target?: number }} Take
 * @typedef {{
 *   id: string, dir: 'sfx' | 'ui' | 'amb', bus: 'sfx' | 'ui' | 'ambience', title: string, spatial: boolean, loop: boolean,
 *   target: number, eq: FilterSpec[], vary: { pitchCents: number, gainDb: number }, maxVoices: number, cooldown: number,
 *   tags?: string[], space?: string, sources: string[], make: () => Promise<Take[]>,
 *   compress?: { thresholdDb: number, ratio: number, attack: number, release: number }
 * }} Family
 */

const D = (/** @type {number[]} */ ...xs) => xs;
const pad = (/** @type {number} */ i) => String(i + 1).padStart(2, '0');

/** @type {Family[]} */
const FAMILIES = [
  {
    id: 'footstep-wood',
    dir: 'sfx',
    bus: 'sfx',
    title: 'Footsteps on the wooden floor (indoor shoes)',
    spatial: true,
    loop: false,
    target: -26,
    eq: [{ type: 'highpass', freq: 70 }, { type: 'peaking', freq: 200, q: 1, gain: 2 }, { type: 'peaking', freq: 3000, q: 1, gain: -2 }, { type: 'lowpass', freq: 11000 }],
    vary: { pitchCents: 80, gainDb: 2.5 },
    maxVoices: 4,
    cooldown: 0.08,
    space: 'apartment',
    sources: ['kenney/impact-sounds', 'kenney/rpg-audio'],
    async make() {
      const names = [0, 1, 2, 3, 4].map((i) => `footstep_wood_00${i}.ogg`);
      const k = await kenney('impact-sounds', names, 'sfx:footstep-wood');
      const cr = await kenney('rpg-audio', ['creak1.ogg', 'creak2.ogg', 'creak3.ogg'], 'sfx:footstep-wood');
      /** @param {Float32Array} x @param {number} from */
      const board = (x, from) => {
        const a = Math.round(from * x.length);
        const part = x.slice(a, a + Math.round(0.2 * SR));
        for (let i = 0; i < part.length; i++) part[i] *= Math.sin((Math.PI * i) / part.length);
        return part;
      };
      /** @type {Take[]} */
      const takes = names.map((n) => ({ chans: [footstep({ step: k[n], eq: [] })], recipe: `kenney/impact-sounds ${n}` }));
      [[0, 'creak1.ogg', 0.2], [2, 'creak2.ogg', 0.35], [4, 'creak3.ogg', 0.5]].forEach(([i, c, from]) => {
        takes.push({
          chans: [footstep({ step: k[names[/** @type {number} */ (i)]], layer: board(cr[/** @type {string} */ (c)], /** @type {number} */ (from)), layerGainDb: -15, layerDelay: 0.03, eq: [] })],
          recipe: `kenney/impact-sounds ${names[/** @type {number} */ (i)]} + floorboard creak from kenney/rpg-audio ${c}`,
        });
      });
      return takes;
    },
  },
  {
    id: 'footstep-tile',
    dir: 'sfx',
    bus: 'sfx',
    title: 'Footsteps on the kitchen tiles',
    spatial: true,
    loop: false,
    target: -25,
    eq: [{ type: 'highpass', freq: 110 }, { type: 'peaking', freq: 350, q: 1, gain: -2 }, { type: 'peaking', freq: 4500, q: 1, gain: 3 }],
    vary: { pitchCents: 70, gainDb: 2.5 },
    maxVoices: 4,
    cooldown: 0.08,
    space: 'apartment',
    sources: ['kenney/impact-sounds'],
    async make() {
      const steps = [0, 1, 2, 3, 4].map((i) => `footstep_concrete_00${i}.ogg`);
      const ticks = [0, 1, 2, 3, 4].map((i) => `impactPlate_light_00${i}.ogg`);
      const k = await kenney('impact-sounds', [...steps, ...ticks], 'sfx:footstep-tile');
      /** @param {Float32Array} x */
      const tick = (x) => {
        const p = x.slice(0, Math.round(0.06 * SR));
        for (let i = 0; i < p.length; i++) p[i] *= Math.exp(-i / (0.012 * SR));
        return p;
      };
      /** @type {Take[]} */
      const takes = steps.map((n, i) => ({ chans: [footstep({ step: k[n], layer: tick(k[ticks[i]]), layerGainDb: -13, layerDelay: 0.004, eq: [{ type: 'highpass', freq: 60 }] })], recipe: `kenney/impact-sounds ${n} + ceramic tick ${ticks[i]}` }));
      takes.push({ chans: [varispeed([footstep({ step: k[steps[1]], layer: tick(k[ticks[3]]), layerGainDb: -10, layerDelay: 0.006, eq: [] })], 1.06)[0]], recipe: `kenney/impact-sounds ${steps[1]} + ${ticks[3]}, +1 semitone` });
      return takes;
    },
  },
  {
    id: 'door-knock',
    dir: 'sfx',
    bus: 'sfx',
    title: 'Knocking on the apartment door',
    spatial: true,
    loop: false,
    target: -18,
    tags: ['impact'],
    eq: [{ type: 'highpass', freq: 60 }],
    vary: { pitchCents: 50, gainDb: 2 },
    maxVoices: 2,
    cooldown: 0.4,
    space: 'stairwell',
    sources: ['kenney/impact-sounds', 'kenney/rpg-audio'],
    async make() {
      const light = [0, 1, 2, 3, 4].map((i) => `impactWood_light_00${i}.ogg`);
      const med = [0, 1, 2].map((i) => `impactWood_medium_00${i}.ogg`);
      const k = await kenney('impact-sounds', [...light, ...med], 'sfx:door-knock');
      const r = await kenney('rpg-audio', ['metalLatch.ogg'], 'sfx:door-knock');
      const L = light.map((n) => k[n]);
      const M = med.map((n) => k[n]);
      /** @type {[string, [number, number][], Float32Array[]][]} */
      const patterns = [
        ['three even knocks', [[0, 0.85], [0.19, 0.8], [0.38, 0.9]], L],
        ['two knocks', [[0, 0.9], [0.17, 0.85]], L],
        ['four quick knocks', [[0, 0.75], [0.14, 0.7], [0.28, 0.8], [0.43, 0.85]], L],
        ['two slow heavy thuds', [[0, 1], [0.58, 0.95]], M],
        ['knock-knock, pause, knock-knock', [[0, 0.8], [0.15, 0.75], [0.62, 0.85], [0.77, 0.8]], L],
      ];
      return patterns.map(([what, raps, takes], i) => ({ chans: [knock({ raps, takes, latch: r['metalLatch.ogg'], seed: `knock-${i}` })], recipe: `${what}: Kenney wood impacts ringing a modal hollow-core door` }));
    },
  },
  {
    id: 'door-bang',
    dir: 'sfx',
    bus: 'sfx',
    title: 'A zombie banging against the door',
    spatial: true,
    loop: false,
    target: -15,
    tags: ['impact'],
    eq: [{ type: 'highpass', freq: 50 }, { type: 'lowshelf', freq: 120, gain: -2 }],
    vary: { pitchCents: 60, gainDb: 2.5 },
    maxVoices: 3,
    cooldown: 0.25,
    space: 'stairwell',
    sources: ['kenney/impact-sounds', 'kenney/rpg-audio'],
    async make() {
      const heavy = [0, 1, 2, 3, 4].map((i) => `impactWood_heavy_00${i}.ogg`);
      const punch = [0, 1, 2, 3, 4].map((i) => `impactPunch_heavy_00${i}.ogg`);
      const metal = [0, 1, 2].map((i) => `impactMetal_light_00${i}.ogg`);
      const k = await kenney('impact-sounds', [...heavy, ...punch, ...metal], 'sfx:door-bang');
      const r = await kenney('rpg-audio', ['metalLatch.ogg', 'metalClick.ogg', 'creak1.ogg', 'creak2.ogg', 'creak3.ogg'], 'sfx:door-bang');
      const o = {
        heavy: heavy.map((n) => k[n]),
        punch: punch.map((n) => k[n]),
        rattle: [...metal.map((n) => k[n]), r['metalLatch.ogg'], r['metalClick.ogg']],
        creak: [r['creak1.ogg'], r['creak2.ogg'], r['creak3.ogg']],
      };
      /** @type {[string, [number, number][]][]} */
      const hits = [
        ['one heavy blow', [[0, 1]]],
        ['a blow and a second one', [[0, 1], [0.4, 0.8]]],
        ['a shoulder against the door', [[0, 0.95]]],
        ['three blows', [[0, 1], [0.26, 0.7], [0.55, 0.9]]],
        ['one heavy blow, frame rattling', [[0, 1]]],
      ];
      return hits.map(([what, h], i) => ({ chans: [bang({ hits: h, ...o, seed: `bang-${i}` })], recipe: `${what}: Kenney heavy wood and punch impacts, modal door panel, frame rattle and creak` }));
    },
  },
  {
    id: 'zombie-groan',
    dir: 'sfx',
    bus: 'sfx',
    title: 'Zombie groans (synthesized voice)',
    spatial: true,
    loop: false,
    target: -18,
    tags: ['voice'],
    eq: [{ type: 'highpass', freq: 70 }, { type: 'peaking', freq: 220, q: 0.9, gain: 2.5 }, { type: 'lowpass', freq: 7500 }],
    vary: { pitchCents: 150, gainDb: 3 },
    maxVoices: 4,
    cooldown: 0.6,
    space: 'stairwell',
    sources: [],
    async make() {
      return GROANS.map((g) => ({ chans: [zombieVoice(g)], recipe: `source-filter voice '${g.seed}': f0 ${g.f0.map((p) => p[1]).join('>')} Hz, vowels ${g.vowels.map((v) => v[1]).join('>')}, growl ${g.growl}, wet ${g.wet}` }));
    },
  },
  {
    id: 'cooking-sizzle',
    dir: 'sfx',
    bus: 'sfx',
    title: 'Food sizzling in a pan (loop)',
    spatial: true,
    loop: true,
    target: -26,
    eq: [{ type: 'highpass', freq: 250 }],
    vary: { pitchCents: 60, gainDb: 2 },
    maxVoices: 1,
    cooldown: 0,
    space: 'apartment',
    sources: [],
    async make() {
      return D(0.45, 0.65, 0.85).map((I, i) => ({ chans: sizzle({ seconds: 8, intensity: I, seed: `sizzle-${i}` }), recipe: `synth sizzle, intensity ${I}` }));
    },
  },
  {
    id: 'rain',
    dir: 'amb',
    bus: 'ambience',
    title: 'Rain on the street (stereo loop)',
    spatial: false,
    loop: true,
    target: -24,
    eq: [],
    vary: { pitchCents: 40, gainDb: 1.5 },
    maxVoices: 2,
    cooldown: 0,
    space: 'outdoors',
    sources: [],
    async make() {
      return D(0.55, 0.7, 0.85).map((I, i) => ({ chans: rain({ seconds: 20, intensity: I, seed: `rain-${i}` }), recipe: `synth rain, intensity ${I}` }));
    },
  },
  {
    id: 'thunder',
    dir: 'amb',
    bus: 'ambience',
    title: 'Thunder, near to distant (street acoustics baked in)',
    spatial: false,
    loop: false,
    target: -14,
    eq: [{ type: 'highpass', freq: 30 }, { type: 'lowshelf', freq: 90, gain: -4 }],
    vary: { pitchCents: 100, gainDb: 2 },
    maxVoices: 2,
    cooldown: 4,
    space: 'outdoors',
    sources: [],
    async make() {
      /** @type {[number, number][]} */
      const d = [[650, -14], [1100, -15], [2400, -17], [4200, -19], [7000, -21]];
      return d.map(([m, t], i) => ({ chans: thunder({ distance: m, seed: `thunder-${i}` }), recipe: `synth thunder, channel ${m} m away`, target: t }));
    },
  },
  {
    id: 'generator',
    dir: 'sfx',
    bus: 'sfx',
    title: 'Petrol generator running (loop)',
    spatial: true,
    loop: true,
    target: -24,
    eq: [{ type: 'highpass', freq: 70 }],
    vary: { pitchCents: 40, gainDb: 1.5 },
    maxVoices: 1,
    cooldown: 0,
    space: 'outdoors',
    sources: [],
    async make() {
      /** @type {[number, number][]} */
      const v = [[3600, 0.5], [3450, 0.85], [3720, 0.25]];
      return v.map(([rpm, load], i) => ({ chans: generator({ seconds: 8, rpm, load, seed: `gen-${i}` }), recipe: `synth single-cylinder generator, ${rpm} rpm, load ${load}` }));
    },
  },
  {
    id: 'ui-click',
    dir: 'ui',
    bus: 'ui',
    title: 'Interface click',
    spatial: false,
    loop: false,
    target: -24,
    tags: ['ui'],
    eq: [{ type: 'highpass', freq: 150 }],
    vary: { pitchCents: 40, gainDb: 1.5 },
    maxVoices: 2,
    cooldown: 0.03,
    sources: ['kenney/ui-audio'],
    async make() {
      const names = [1, 2, 3, 4, 5].map((i) => `click${i}.ogg`);
      const k = await kenney('ui-audio', names, 'ui:ui-click');
      return names.map((n) => ({ chans: [k[n]], recipe: `kenney/ui-audio ${n}` }));
    },
  },
  {
    id: 'ui-confirm',
    dir: 'ui',
    bus: 'ui',
    title: 'Interface confirm',
    spatial: false,
    loop: false,
    target: -21,
    tags: ['ui'],
    eq: [{ type: 'highpass', freq: 150 }],
    vary: { pitchCents: 30, gainDb: 1 },
    maxVoices: 1,
    cooldown: 0.1,
    sources: ['kenney/interface-sounds'],
    async make() {
      const names = [1, 2, 3, 4].map((i) => `confirmation_00${i}.ogg`);
      const k = await kenney('interface-sounds', names, 'ui:ui-confirm');
      return names.map((n) => ({ chans: [k[n]], recipe: `kenney/interface-sounds ${n}` }));
    },
  },
  {
    id: 'ui-error',
    dir: 'ui',
    bus: 'ui',
    title: 'Interface error',
    spatial: false,
    loop: false,
    target: -21,
    tags: ['ui'],
    eq: [{ type: 'highpass', freq: 150 }, { type: 'lowpass', freq: 9000 }],
    vary: { pitchCents: 30, gainDb: 1 },
    maxVoices: 1,
    cooldown: 0.2,
    sources: ['kenney/interface-sounds'],
    async make() {
      const names = [2, 4, 6, 8].map((i) => `error_00${i}.ogg`);
      const k = await kenney('interface-sounds', names, 'ui:ui-error');
      return names.map((n) => ({ chans: [k[n]], recipe: `kenney/interface-sounds ${n}` }));
    },
  },
  {
    id: 'pickup',
    dir: 'sfx',
    bus: 'sfx',
    title: 'Picking up an item',
    spatial: false,
    loop: false,
    target: -22,
    eq: [{ type: 'highpass', freq: 120 }],
    vary: { pitchCents: 60, gainDb: 2 },
    maxVoices: 2,
    cooldown: 0.05,
    sources: ['kenney/rpg-audio', 'kenney/impact-sounds'],
    async make() {
      const r = await kenney('rpg-audio', ['cloth1.ogg', 'cloth2.ogg', 'cloth3.ogg', 'handleSmallLeather.ogg', 'handleCoins.ogg'], 'sfx:pickup');
      const k = await kenney('impact-sounds', ['impactGeneric_light_000.ogg', 'impactTin_medium_000.ogg', 'impactPlank_medium_000.ogg'], 'sfx:pickup');
      return [
        { chans: [layered({ parts: [{ x: r['cloth1.ogg'] }, { x: k['impactGeneric_light_000.ogg'], at: 0.05, gainDb: -8 }] })], recipe: 'cloth1 + impactGeneric_light_000 (a bag)' },
        { chans: [layered({ parts: [{ x: r['handleSmallLeather.ogg'] }] })], recipe: 'handleSmallLeather (a pouch)' },
        { chans: [layered({ parts: [{ x: r['cloth3.ogg'], gainDb: -3 }, { x: k['impactTin_medium_000.ogg'], at: 0.04, gainDb: -6 }] })], recipe: 'cloth3 + impactTin_medium_000 (a tin can)' },
        { chans: [layered({ parts: [{ x: r['handleCoins.ogg'], gainDb: -2 }] })], recipe: 'handleCoins (small metal items)' },
        { chans: [layered({ parts: [{ x: r['cloth2.ogg'], gainDb: -3 }, { x: k['impactPlank_medium_000.ogg'], at: 0.05, gainDb: -7, hp: 150 }] })], recipe: 'cloth2 + impactPlank_medium_000 (a wooden board)' },
      ];
    },
  },
  {
    id: 'amb-roomtone',
    dir: 'amb',
    bus: 'ambience',
    title: 'Apartment room tone at night (stereo loop)',
    spatial: false,
    loop: true,
    target: -40,
    eq: [],
    vary: { pitchCents: 0, gainDb: 1 },
    maxVoices: 1,
    cooldown: 0,
    space: 'apartment',
    sources: [],
    async make() {
      return D(0.6, 0.85, 0.4).map((f, i) => ({ chans: roomTone({ seconds: 20, fridge: f, seed: `room-${i}` }), recipe: `synth room tone, fridge hum ${f}` }));
    },
  },
  {
    id: 'amb-night-street',
    dir: 'amb',
    bus: 'ambience',
    title: 'The street at night: wind and far-off moans (stereo loop)',
    spatial: false,
    loop: true,
    target: -30,
    eq: [],
    vary: { pitchCents: 0, gainDb: 1 },
    maxVoices: 1,
    cooldown: 0,
    space: 'outdoors',
    sources: [],
    async make() {
      return [0, 1, 2].map((i) => ({ chans: nightStreet({ seconds: 20, seed: `street-${i}` }), recipe: 'synth wind gusts + distant synthesized moans in street acoustics' }));
    },
  },
  {
    id: 'amb-horde-crowd',
    dir: 'amb',
    bus: 'ambience',
    title: 'The horde outside: a crowd of zombies (stereo loop)',
    spatial: false,
    loop: true,
    target: -22,
    tags: ['horde'],
    eq: [{ type: 'highpass', freq: 50 }],
    vary: { pitchCents: 0, gainDb: 1.5 },
    maxVoices: 2,
    cooldown: 0,
    space: 'outdoors',
    sources: [],
    async make() {
      return D(12, 16, 20).map((v, i) => ({ chans: hordeCrowd({ seconds: 16, voices: v, seed: `crowd-${i}` }), recipe: `synth crowd of ${v} zombie voices at 4-30 m, shuffling, street acoustics` }));
    },
  },
];

/** @param {Family} f */
async function buildFamily(f) {
  const t0 = Date.now();
  const takes = await f.make();
  if (takes.length < 3) throw new Error(`${f.id}: ${takes.length} variants (needs >= 3)`);
  /** @type {Record<string, { path: string, params?: Record<string, unknown> }>} */
  const variants = {};
  /** @type {Record<string, unknown>[]} */
  const measured = [];
  for (const [i, t] of takes.entries()) {
    let chans = t.chans.map((c) => c.slice());
    if (f.spatial && chans.length > 1) chans = toMono(chans);
    const path = join(ROOT, 'assets', 'audio', f.dir, f.id, `${f.id}-${pad(i)}.ogg`);
    const comment = [`TITLE=${f.title} ${pad(i)}`, 'ARTIST=Survival Logs audio lane (WP-P0-06)', `DESCRIPTION=${t.recipe}`];
    let rep;
    if (f.loop) {
      chans = f.eq.length ? filterCircular(chans, f.eq) : chans;
      rep = masterLoop(path, chans, { lufs: t.target ?? f.target, comment });
    } else {
      cleanAndEq(chans, f.eq);
      if (f.compress) {
        const pk = Math.max(...chans.map((c) => c.reduce((m, v) => Math.max(m, Math.abs(v)), 0)));
        scale(chans, 1 / (pk || 1));
        compress(chans, { ...f.compress, kneeDb: 4 });
      }
      rep = masterOneShot(path, chans, { lufsM: t.target ?? f.target, comment });
    }
    const m = measure(path);
    const dur = duration(path);
    variants[pad(i)] = { path: rel(path), ...(t.target != null && t.target !== f.target ? { params: { levelDb: t.target - f.target } } : {}) };
    measured.push({ variant: pad(i), seconds: Math.round(dur * 1000) / 1000, channels: chans.length, truePeak: m.truePeak, ...(f.loop ? { lufs: m.integrated } : { lufsM: Math.round(/** @type {{ momentary: number }} */ (rep).momentary * 10) / 10 }), recipe: t.recipe });
  }
  console.log(`${f.id}: ${takes.length} variants, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  /** @type {import('./manifest.mjs').AudioEntry} */
  const entry = {
    id: `audio/${f.id}`,
    kind: 'audio',
    path: variants['01'].path,
    license: 'LicenseRef-Original',
    ...(f.sources.length ? { sources: f.sources } : {}),
    variants,
    params: {
      title: f.title,
      category: f.dir === 'amb' ? 'ambience' : f.dir,
      bus: f.bus,
      spatial: f.spatial,
      loop: f.loop,
      space: f.space ?? null,
      tags: f.tags ?? [],
      pitchCents: f.vary.pitchCents,
      gainDb: f.vary.gainDb,
      noRepeat: true,
      maxVoices: f.maxVoices,
      cooldown: f.cooldown,
    },
    meta: { target: f.loop ? { lufs: f.target } : { lufsM: f.target }, sampleRate: SR, takes: measured },
  };
  return entry;
}

async function main() {
  const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  recordSonnissAttempt();
  const todo = only.length ? FAMILIES.filter((f) => only.includes(f.id)) : FAMILIES;
  const entries = [];
  for (const f of todo) entries.push(await buildFamily(f));
  const ids = new Set(todo.map((f) => `audio/${f.id}`));
  updateManifest(entries, (id) => ids.has(id), 'sfx');
  console.log(`manifest: ${readManifest().assets.length} entries`);
}

export { FAMILIES };
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) await main();
