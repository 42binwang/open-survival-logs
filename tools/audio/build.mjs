#!/usr/bin/env node
// @ts-check
// Builds everything the audio lane ships, in order:
//
//   node tools/audio/build.mjs            music stems, SFX / UI / ambience families, room IRs and the 60-second test,
//                                         then the credits fragment
//   node tools/audio/build.mjs --frozen   the same, but refuses to download anything that is not in the lock
//
// Sources are fetched into assets/cache/ on demand and pinned in assets/lock/WP-P0-06.json (tools/audio/fetch.mjs).

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/io.mjs';
import { USAGE_LOG } from './fetch.mjs';
import { pruneLock, readLock, writeCredits } from './lock.mjs';
import { readManifest } from './manifest.mjs';

const pass = process.argv.includes('--frozen') ? ['--frozen'] : [];
const run = (/** @type {string} */ script, /** @type {string[]} */ args = []) => {
  console.log(`\n$ node ${script} ${args.join(' ')}`);
  execFileSync(process.execPath, [join(ROOT, script), ...args, ...pass], { stdio: 'inherit', cwd: ROOT, env: { ...process.env, AUDIO_TRACK_USAGE: '1' } });
};
rmSync(USAGE_LOG, { force: true });

run('tools/music/build.mjs');
run('tools/audio/build-sfx.mjs');
run('tools/audio/mix.mjs');

if (existsSync(USAGE_LOG)) {
  const usage = readFileSync(USAGE_LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  console.log(`\nlock: pruned ${pruneLock(usage)} entries the build no longer uses`);
}

const manifest = readManifest();
writeCredits(
  readLock(),
  manifest.assets.map((e) => {
    const p = /** @type {Record<string, any>} */ (e.params ?? {});
    const from = e.sources?.length ? e.sources.join(', ') : p.category === 'ir' ? 'acoustic model (tools/audio/spaces.mjs)' : p.category === 'test' ? 'the assets it mixes' : 'synthesis (tools/audio/sfx/)';
    return { id: e.id, what: String(p.title ?? e.id), from };
  }),
);
console.log('\ncredits: assets/credits/WP-P0-06.md');
