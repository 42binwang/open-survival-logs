#!/usr/bin/env node
// @ts-check
// Writes the room impulse responses (assets/audio/ir/<space>.wav, stereo float 48 kHz) and their manifest entries.
//
//   node tools/audio/build-ir.mjs [space | ir-<space> ...]    all five spaces when none is named

import { join } from 'node:path';
import { SR } from './lib/dsp.mjs';
import { ROOT, rel, writeWav } from './lib/io.mjs';
import { makeIR, SPACE_MODELS } from './spaces.mjs';
import { updateManifest } from './manifest.mjs';

export const SPACES = ['apartment', 'stairwell', 'shop', 'basement', 'outdoors'];

/**
 * Renders one IR to its file and returns its manifest entry.
 * @param {string} space
 * @returns {import('./manifest.mjs').AudioEntry}
 */
export function writeIR(space) {
  const ir = makeIR(space);
  const p = join(ROOT, 'assets', 'audio', 'ir', `${space}.wav`);
  writeWav(p, ir, SR, 'f32');
  return {
    id: `audio/ir-${space}`,
    kind: 'audio',
    path: rel(p),
    license: 'LicenseRef-Original',
    params: { title: `Room impulse response: ${SPACE_MODELS[space].title}`, category: 'ir', space, rt60Bands: [125, 250, 500, 1000, 2000, 4000, 8000], rt60: SPACE_MODELS[space].rt60 },
    meta: { durationSec: Math.round((ir[0].length / SR) * 1000) / 1000, sampleRate: SR, channels: 2, normalization: 'unit energy' },
  };
}

/** Writes the named spaces (all by default) and their entries. @param {string[]} names */
export function buildIRs(names) {
  const spaces = names.length ? names.map((n) => n.replace(/^ir-/, '')) : SPACES;
  for (const s of spaces) if (!SPACES.includes(s)) throw new Error(`unknown space ${s}`);
  const entries = spaces.map(writeIR);
  const ids = new Set(entries.map((e) => e.id));
  updateManifest(entries, (id) => ids.has(id), 'ir');
  return entries;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  for (const e of buildIRs(process.argv.slice(2).filter((a) => !a.startsWith('--')))) console.log(`${e.id}: ${e.path}`);
}
