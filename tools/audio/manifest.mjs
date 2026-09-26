// @ts-check
// assets/audio/manifest.json: the audio family's asset manifest (schema survival-logs/asset-manifest@1, see
// src/contracts/assets.js). Each builder merges the entries it owns: build-sfx.mjs the SFX, UI and ambience families,
// tools/music/build.mjs the music stems, build-ir.mjs the room IRs, mix.mjs the test render. Every write also sets
// the rebuild recipes (the rebuild contract: tools/asset-lock.mjs re-bakes a sample with them in a sandbox) and the
// SHA-256 of every file an entry ships, so a rebuild rewrites the manifest identically.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT } from './lib/io.mjs';

export const MANIFEST = join(ROOT, 'assets', 'audio', 'manifest.json');
export const SCHEMA = 'survival-logs/asset-manifest@1';

/** Versions the builds were made with (Homebrew ffmpeg / sox with libvorbis, Node). */
const TOOLS = { node: '24.15.0', ffmpeg: '9.0.2', sox: '14.4.2', libvorbis: '1.3.7' };
/** The shared DSP and I/O modules every audio build imports. */
const AUDIO_LIB = ['tools/audio/lib/', 'tools/audio/manifest.mjs', 'tools/audio/spaces.mjs'];
/** The source cache and the decoded-sample cache (a pure function of the locked sources), linked, never compared. */
const SHARED = ['assets/cache', 'tools/audio/.build/decoded'];
/** 305419896: the TPDF dither seed of the WAV writer; synthesized takes seed from FNV-1a of their fixed names. */
const DITHER = 0x12345678;

/**
 * The rebuild recipes of the audio manifest. Costs: the slowest measured re-bake of the recipe in the asset-lock
 * sandbox (node tools/asset-lock.mjs over all audio entries, cold decoded-sample cache), with headroom.
 * @type {Record<string, import('../../src/contracts/assets.js').RebuildRecipe>}
 */
export const RECIPES = {
  music: {
    entry: 'tools/music/build.mjs',
    args: ['{name}'],
    inputs: [
      ...AUDIO_LIB,
      'tools/audio/fetch.mjs',
      'tools/audio/lock.mjs',
      'tools/music/build.mjs',
      'tools/music/instruments.mjs',
      'tools/music/midi.mjs',
      'tools/music/pitch.mjs',
      'tools/music/sampler.mjs',
      'tools/music/score.mjs',
      'tools/music/sfz.mjs',
      'tools/music/theory.mjs',
      'tools/music/catalog.json',
      'tools/music/compositions/',
      'assets/lock/',
      'assets/sources.lock.json',
      'assets/audio/music/music.json',
    ],
    shared: SHARED,
    tools: TOOLS,
    seeds: { 'score.pre-outbreak': 12001, 'score.day': 8001, 'score.night': 6401, 'score.horde': 12801, 'score.night-to-horde': 12802, 'score.horde-end': 12803, 'score.ending': 7201, 'sampler.track': 1, 'wav.dither': DITHER },
    cost: 20,
    timeoutSec: 600,
  },
  sfx: {
    entry: 'tools/audio/build-sfx.mjs',
    args: ['{name}'],
    inputs: [...AUDIO_LIB, 'tools/audio/build-sfx.mjs', 'tools/audio/chain.mjs', 'tools/audio/fetch.mjs', 'tools/audio/lock.mjs', 'tools/audio/sources.mjs', 'tools/audio/sfx/', 'assets/lock/', 'assets/sources.lock.json'],
    shared: SHARED,
    tools: TOOLS,
    seeds: { 'take.fnv1a-basis': 2166136261, 'wav.dither': DITHER },
    cost: 8,
  },
  ir: {
    entry: 'tools/audio/build-ir.mjs',
    args: ['{name}'],
    inputs: [...AUDIO_LIB, 'tools/audio/build-ir.mjs'],
    shared: SHARED,
    tools: TOOLS,
    seeds: { 'ir.space': 7 },
    cost: 2,
  },
  test: {
    entry: 'tools/audio/mix.mjs',
    inputs: [
      ...AUDIO_LIB,
      'tools/audio/build-ir.mjs',
      'tools/audio/chain.mjs',
      'tools/audio/mix.mjs',
      'tools/audio/scene.mjs',
      'assets/audio/music/',
      'assets/audio/sfx/',
      'assets/audio/ui/',
      'assets/audio/amb/',
    ],
    shared: SHARED,
    tools: TOOLS,
    seeds: { scene: 224136742, 'ir.space': 7, 'wav.dither': DITHER },
    cost: 15,
    timeoutSec: 300,
  },
};

/**
 * @typedef {{ id: string, kind: 'audio', path: string, license: 'CC0-1.0' | 'LicenseRef-Original', sources?: string[],
 *   files?: Record<string, string>, variants?: Record<string, { path: string, params?: Record<string, unknown> }>,
 *   rebuild?: string, digests?: Record<string, string>, params?: Record<string, unknown>, meta?: Record<string, unknown> }} AudioEntry
 * @typedef {{ schema: string, wp: string, rebuild?: Record<string, unknown>, assets: AudioEntry[] }} AudioManifest
 */

/** @returns {AudioManifest} */
export function readManifest() {
  if (!existsSync(MANIFEST)) return { schema: SCHEMA, wp: 'WP-P0-06', assets: [] };
  return JSON.parse(readFileSync(MANIFEST, 'utf8'));
}

/** Every file an entry ships (as assetOutputs of src/contracts/assets.js). @param {AudioEntry} e */
function outputs(e) {
  const out = new Set([e.path, ...Object.values(e.files ?? {}), ...Object.values(e.variants ?? {}).map((v) => v.path)]);
  return [...out].sort();
}

/**
 * Replaces the entries a builder owns, with their recipe and the digests of the files they ship.
 * @param {AudioEntry[]} entries
 * @param {(id: string) => boolean} owns
 * @param {string} recipe  the RECIPES key that rebuilds these entries
 */
export function updateManifest(entries, owns, recipe) {
  const m = readManifest();
  const done = entries.map((e) => ({
    ...e,
    rebuild: recipe,
    digests: Object.fromEntries(outputs(e).map((p) => [p, createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex')])),
  }));
  const next = { schema: SCHEMA, wp: 'WP-P0-06', rebuild: RECIPES, assets: [...m.assets.filter((e) => !owns(e.id)), ...done].sort((a, b) => a.id.localeCompare(b.id)) };
  mkdirSync(dirname(MANIFEST), { recursive: true });
  writeFileSync(MANIFEST, `${JSON.stringify(next, null, 1)}\n`);
}
