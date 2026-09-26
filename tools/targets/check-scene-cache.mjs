// @ts-check
// Scripted check for the scene-score cache in fetch-targets.mjs (WP-P0-04): on a 3 s synthetic clip, a complete
// cache is reused, and a truncated cache, a changed input and --force each recompute it. Needs ffmpeg and ffprobe.
//
//   node tools/targets/check-scene-cache.mjs

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { probe, sceneScores } from './fetch-targets.mjs';

const run = promisify(execFile);
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

/** @param {string} file @param {number} seconds */
async function clip(file, seconds) {
  await run(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc2=size=1920x1080:rate=30:duration=${seconds}`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file]);
}

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scene-cache-'));
const mp4 = path.join(dir, 'clip.mp4');
const txt = path.join(dir, 'clip.inner.scenes.txt');
/** @type {string[]} */
const failures = [];
const expect = (/** @type {boolean} */ ok, /** @type {string} */ what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures.push(what); };
try {
  await clip(mp4, 3);
  let info = await probe(mp4);
  let r = await sceneScores(mp4, info);
  expect(r.regenerated && r.frames.length === info.frames, `first run computes ${info.frames} scores (${r.reason})`);
  r = await sceneScores(mp4, info);
  expect(!r.regenerated, `complete cache is reused (${r.reason})`);

  const text = await fs.readFile(txt, 'utf8');
  const lines = text.split('\n');
  await fs.writeFile(txt, lines.slice(0, Math.floor(lines.length / 2)).join('\n'));
  r = await sceneScores(mp4, info);
  expect(r.regenerated && r.frames.length === info.frames, `truncated cache is detected and recomputed (${r.reason})`);

  await fs.writeFile(txt, lines.slice(1).join('\n'));
  r = await sceneScores(mp4, info);
  expect(r.regenerated, `cache without the input header is recomputed (${r.reason})`);

  await clip(mp4, 4);
  info = await probe(mp4);
  r = await sceneScores(mp4, info);
  expect(r.regenerated && r.frames.length === info.frames, `changed input invalidates the cache (${r.reason})`);

  r = await sceneScores(mp4, info, { force: true });
  expect(r.regenerated && r.reason === 'forced', 'force recomputes');
  const left = (await fs.readdir(dir)).filter((f) => f.includes('.tmp-'));
  expect(left.length === 0, 'no temporary files left behind');
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
process.exit(failures.length ? 1 : 0);
