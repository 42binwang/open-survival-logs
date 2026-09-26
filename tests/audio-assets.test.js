// @ts-check
// WP-P0-06 acceptance: the 60-second audio test and the assets behind it. Loudness and true peak are measured with
// ffmpeg's ebur128 filter; nothing here needs the download cache (assets/cache/), only committed files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, openSync, readSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAssetManifest } from '../src/contracts/assets.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const at = (/** @type {string} */ p) => join(ROOT, p);
const readJson = (/** @type {string} */ p) => JSON.parse(readFileSync(at(p), 'utf8'));

const MANIFEST = 'assets/audio/manifest.json';
const LOCK = 'assets/sources.lock.json';
const CREDITS = 'assets/CREDITS.md';
/** The package whose entries in LOCK and section of CREDITS this file checks. */
const WP = 'WP-P0-06';
/** Every source WP-P0-06 locked: VSCO 2 CE and VCSL instruments at pinned commits, and the Kenney packs. */
const LOCKED_IDS = [
  'kenney/impact-sounds',
  'kenney/interface-sounds',
  'kenney/rpg-audio',
  'kenney/ui-audio',
  'vcsl/anvil',
  'vcsl/bass-drum',
  'vcsl/bowed-vibraphone',
  'vcsl/brake-drum',
  'vcsl/cymbal',
  'vcsl/gong',
  'vcsl/piano',
  'vcsl/piano-pedal',
  'vcsl/toms',
  'vsco2ce/basses-pizz',
  'vsco2ce/basses-spic',
  'vsco2ce/basses-sus',
  'vsco2ce/bassoon-stac',
  'vsco2ce/celli-pizz',
  'vsco2ce/celli-spic',
  'vsco2ce/celli-sus',
  'vsco2ce/celli-trem',
  'vsco2ce/clarinet-stac',
  'vsco2ce/clarinet-sus',
  'vsco2ce/claves',
  'vsco2ce/flute-sus',
  'vsco2ce/glockenspiel',
  'vsco2ce/harp',
  'vsco2ce/horn-stac',
  'vsco2ce/horn-sus',
  'vsco2ce/marimba',
  'vsco2ce/snare',
  'vsco2ce/timpani',
  'vsco2ce/timpani-roll',
  'vsco2ce/trombone-stac',
  'vsco2ce/trombone-sus',
  'vsco2ce/tuba-stac',
  'vsco2ce/violas-spic',
  'vsco2ce/violas-sus',
  'vsco2ce/violins-pizz',
  'vsco2ce/violins-spic',
  'vsco2ce/violins-sus',
  'vsco2ce/violins-trem',
  'vsco2ce/xylophone',
];
const SCENE = 'assets/audio/test/audio-test-60s.json';
const RENDER = 'assets/audio/test/audio-test-60s.ogg';
const PAGE = 'pages/audio-test.html';

/** Repeated sounds the package must vary (docs/wp/WP-P0-06.md). */
const REPEATED = [
  'footstep-wood',
  'footstep-tile',
  'door-knock',
  'door-bang',
  'zombie-groan',
  'cooking-sizzle',
  'rain',
  'thunder',
  'generator',
  'ui-click',
  'ui-confirm',
  'ui-error',
  'pickup',
];
const LICENSES = ['CC0-1.0', 'LicenseRef-Original', 'LicenseRef-Sonniss-GDC'];
const HOSTS = ['github.com', 'kenney.nl'];
/** Every music layer the package ships, and the ones that loop. */
const STEMS = ['day', 'ending', 'horde', 'horde-end', 'night', 'night-to-horde', 'pre-outbreak'];
const LOOPS = ['day', 'horde', 'night', 'pre-outbreak'];

/**
 * @typedef {{ id: string, kind: string, path: string, license: string, sources?: string[], files?: Record<string, string>,
 *   variants?: Record<string, { path: string }>, params?: Record<string, any>, meta?: Record<string, any> }} Entry
 */

/** @returns {{ schema: string, wp: string, assets: Entry[] }} */
const manifest = () => readJson(MANIFEST);
/** @param {string} id */
const entry = (id) => {
  const e = manifest().assets.find((x) => x.id === id);
  assert.ok(e, `${id} is missing from ${MANIFEST}`);
  return /** @type {Entry} */ (e);
};

/** Fails clearly when a binary is still a Git LFS pointer (clone without `git lfs pull`). @param {string} p */
function assertBinary(p) {
  assert.ok(existsSync(at(p)), `${p} does not exist`);
  const fd = openSync(at(p), 'r');
  const head = Buffer.alloc(40);
  readSync(fd, head, 0, 40, 0);
  closeSync(fd);
  assert.ok(!head.toString('utf8').startsWith('version https://git-lfs'), `${p} is a Git LFS pointer: run git lfs pull`);
}

/** @param {string[]} args */
function ffmpeg(args) {
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.error) assert.fail(`ffmpeg is required for the loudness checks (${r.error.message})`);
  assert.equal(r.status, 0, `ffmpeg ${args.join(' ')} failed: ${r.stderr.slice(-300)}`);
  return r.stderr;
}

/** EBU R128 integrated loudness and true peak of a file, from ffmpeg's ebur128 summary. @param {string} p */
function ebur128(p) {
  assertBinary(p);
  const text = ffmpeg(['-nostats', '-hide_banner', '-i', at(p), '-filter_complex', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-']);
  const summary = text.slice(text.lastIndexOf('Summary:'));
  const num = (/** @type {RegExp} */ re) => Number(re.exec(summary)?.[1]);
  return { integrated: num(/I:\s+(-?[\d.]+)\s+LUFS/), truePeak: num(/Peak:\s+(-?[\d.]+|-inf)\s+dBFS/) };
}

/** Duration in seconds (ffprobe). @param {string} p */
function seconds(p) {
  assertBinary(p);
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', at(p)], { encoding: 'utf8' });
  if (r.error) assert.fail(`ffprobe is required (${r.error.message})`);
  return Number(r.stdout.trim());
}

const sha = (/** @type {string} */ p) => createHash('sha256').update(readFileSync(at(p))).digest('hex');

test('the 60-second audio test renders to 60 s ± 1 at -16 LUFS ± 1 and never clips (true peak <= -1 dBTP)', () => {
  const d = seconds(RENDER);
  assert.ok(Math.abs(d - 60) <= 1, `render is ${d} s`);
  const m = ebur128(RENDER);
  assert.ok(m.truePeak <= -1, `render true peak ${m.truePeak} dBTP`);
  assert.ok(Math.abs(m.integrated - -16) <= 1, `render integrated ${m.integrated} LUFS`);
});

test('music stems measure -16 LUFS ± 1 integrated with true peak <= -1 dBTP (ffmpeg ebur128)', () => {
  const stems = manifest().assets.filter((e) => e.params?.category === 'music');
  assert.deepEqual(stems.map((e) => e.id).sort(), STEMS.map((x) => `audio/music-${x}`), 'the music stems');
  assert.deepEqual(stems.filter((e) => e.params?.loop === true).map((e) => e.id).sort(), LOOPS.map((x) => `audio/music-${x}`), 'the looping stems');
  const layers = new Set(stems.map((e) => e.params?.layer));
  for (const l of ['pre-outbreak', 'day', 'night', 'horde', 'ending', 'transition']) assert.ok(layers.has(l), `no ${l} music layer`);
  for (const e of stems) {
    const m = ebur128(e.path);
    assert.ok(Math.abs(m.integrated - -16) <= 1, `${e.id}: ${m.integrated} LUFS`);
    assert.ok(m.truePeak <= -1, `${e.id}: true peak ${m.truePeak} dBTP`);
    const d = seconds(e.path);
    assert.ok(Math.abs(d - e.meta?.durationSec) < 0.05, `${e.id}: ${d} s, manifest says ${e.meta?.durationSec}`);
    const bars = Number(e.params?.bars);
    const barSeconds = Number(e.params?.barSeconds);
    assert.ok(bars > 0 && barSeconds > 0, `${e.id}: no bar grid`);
    const expected = e.params?.loop === true ? bars * barSeconds : null;
    assert.ok(expected === null || Math.abs(d - expected) < 0.01, `${e.id}: loop of ${d} s is not ${bars} bars`);
  }
});

test('the night and horde layers share the bar grid, and the transition hit lands on a horde downbeat', () => {
  const night = /** @type {Record<string, any>} */ (entry('audio/music-night').params);
  const horde = /** @type {Record<string, any>} */ (entry('audio/music-horde').params);
  assert.ok(night.barSeconds > 0 && horde.barSeconds > 0, 'night and horde carry their bar length');
  assert.equal(night.barSeconds, 2 * horde.barSeconds, 'one night bar must hold two horde bars');
  const scene = readJson(SCENE);
  const cue = (/** @type {string} */ id) => scene.cues.find((/** @type {any} */ c) => c.asset === id);
  const riser = cue('audio/music-night-to-horde');
  const loop = cue('audio/music-horde');
  assert.ok(riser && loop, 'the scene plays the transition and the horde layer');
  const hitAt = riser.t + /** @type {number} */ (entry('audio/music-night-to-horde').params?.bars) * horde.barSeconds;
  assert.ok(Math.abs(hitAt - loop.t) < 1e-6, `transition hit at ${hitAt} s, horde layer at ${loop.t} s`);
  assert.ok(Math.abs(loop.t / night.barSeconds - Math.round(loop.t / night.barSeconds)) < 1e-6, 'the horde enters on a bar line');
});

test('every repeated sound has at least 3 distinct variants with pitch and volume variation', () => {
  for (const f of REPEATED) {
    const e = entry(`audio/${f}`);
    const vs = Object.values(e.variants ?? {});
    assert.ok(vs.length >= 3, `${f}: ${vs.length} variants`);
    const hashes = new Set();
    for (const v of vs) {
      assert.ok(seconds(v.path) > 0.005, `${v.path} has no audio`);
      hashes.add(sha(v.path));
    }
    assert.equal(hashes.size, vs.length, `${f}: variants are not all different files`);
    assert.ok(e.params?.pitchCents > 0, `${f}: no pitch variation`);
    assert.ok(e.params?.gainDb > 0, `${f}: no volume variation`);
    assert.equal(e.params?.noRepeat, true, `${f}: repeats are not prevented`);
    assert.ok(e.params?.maxVoices >= 1, `${f}: no voice limit`);
  }
});

test('every source is pinned in the asset lock and credited', () => {
  const ledger = readJson(LOCK);
  const mine = (/** @type {any[] | undefined} */ list) => (list ?? []).filter((x) => x.wp === WP);
  const lock = { schema: ledger.schema, sources: mine(ledger.sources), attempts: mine(ledger.attempts) };
  assert.deepEqual(lock.sources.map((/** @type {{ id: string }} */ s) => s.id).sort(), [...LOCKED_IDS].sort(), `the ${LOCK} entries with wp ${WP} are exactly the sources it locked`);
  assert.equal(lock.schema, 1);
  /** @type {Map<string, Set<string>>} */
  const files = new Map();
  assert.ok(lock.sources.length > 0, `${LOCK} locks no sources`);
  for (const s of lock.sources) {
    assert.match(s.id, /^[a-z0-9]+\/[a-z0-9.-]+$/, `lock id ${s.id}`);
    assert.equal(s.license, 'CC0-1.0', `${s.id}: license ${s.license}`);
    assert.ok(s.files.length > 0, `${s.id}: no files`);
    assert.ok(s.usedFor.length > 0, `${s.id}: not used by anything`);
    for (const f of s.files) {
      const u = new URL(f.url);
      assert.equal(u.protocol, 'https:', `${f.url}`);
      assert.ok(HOSTS.includes(u.hostname), `${f.url}: host is not an allowed source`);
      assert.match(f.sha256, /^[0-9a-f]{64}$/, `${s.id}/${f.path}: sha256`);
      assert.ok(f.bytes > 0, `${s.id}/${f.path}: size`);
      // Pinned: GitHub files at a commit, Kenney packs at their versioned media path with every audio member hashed.
      const pin = u.hostname === 'github.com' ? /^\/sgossner\/[\w-]+\/raw\/[0-9a-f]{40}\// : /^\/media\/pages\/assets\/[a-z-]+\/[0-9a-f]+-\d+\/[\w.-]+\.zip$/;
      assert.match(u.pathname, pin, `${f.url}: not pinned to a version`);
      const members = Object.entries(f.members ?? {});
      assert.equal(members.length > 0, u.hostname === 'kenney.nl', `${s.id}/${f.path}: zip members are hashed exactly for Kenney zips`);
      for (const [m, h] of members) assert.match(String(h), /^[0-9a-f]{64}$/, `${s.id}:${m}`);
    }
    files.set(s.id, new Set(s.files.map((/** @type {{ path: string }} */ f) => f.path)));
  }
  const sourced = manifest().assets.filter((e) => e.sources);
  for (const f of ['audio/footstep-wood', 'audio/door-bang', 'audio/ui-click', 'audio/pickup', ...STEMS.map((x) => `audio/music-${x}`)]) {
    assert.ok(sourced.some((e) => e.id === f && /** @type {string[]} */ (e.sources).length > 0), `${f} names no locked sources`);
  }
  for (const e of sourced) for (const s of /** @type {string[]} */ (e.sources)) assert.ok(files.has(s), `${e.id}: source ${s} is not in ${LOCK}`);
  // Every sample the music stems play is a locked file.
  const music = readJson('assets/audio/music/music.json');
  assert.deepEqual(music.stems.map((/** @type {{ id: string }} */ x) => x.id).sort(), STEMS, 'music.json covers every stem');
  for (const stem of music.stems) {
    assert.ok(stem.samples.length > 0, `${stem.id}: no samples recorded`);
    for (const p of stem.samples) {
      const parts = p.split('/');
      const id = parts.slice(2, 4).join('/');
      assert.ok(files.get(id)?.has(parts[parts.length - 1]), `${stem.id}: ${p} is not locked`);
    }
  }
  const allCredits = readFileSync(at(CREDITS), 'utf8');
  const from = allCredits.indexOf(`\n## ${WP}\n`);
  assert.ok(from >= 0, `${CREDITS} has no ## ${WP} section`);
  const next = allCredits.indexOf('\n## ', from + 1);
  const credits = allCredits.slice(from, next < 0 ? undefined : next);
  for (const s of lock.sources) assert.ok(credits.includes(`\`${s.id}\``), `the ${WP} section of ${CREDITS} does not credit ${s.id}`);
  assert.ok(lock.attempts?.some((/** @type {{ url: string }} */ a) => a.url.includes('sonniss.com')), 'the Sonniss attempt is not recorded');
});

test('the audio manifest follows the asset-manifest contract', () => {
  const m = manifest();
  assert.equal(m.assets.length, 29, 'the audio manifest ships 29 entries');
  assert.equal(m.schema, 'survival-logs/asset-manifest@1');
  const ids = new Set();
  for (const e of m.assets) {
    assert.match(e.id, /^audio\/[a-z0-9][a-z0-9._-]*$/, e.id);
    assert.ok(!ids.has(e.id), `duplicate ${e.id}`);
    ids.add(e.id);
    assert.equal(e.kind, 'audio', e.id);
    assert.ok(LICENSES.includes(e.license), `${e.id}: license ${e.license}`);
    for (const p of [e.path, ...Object.values(e.files ?? {}), ...Object.values(e.variants ?? {}).map((v) => v.path)]) {
      assert.ok(p.startsWith('assets/audio/'), `${e.id}: ${p}`);
      assert.ok(existsSync(at(p)), `${e.id}: ${p} does not exist`);
    }
  }
  // The shared contract validator (src/contracts/assets.js), with every path checked on disk.
  const problems = checkAssetManifest(/** @type {any} */ (m), { exists: (/** @type {string} */ p) => existsSync(at(p)) });
  assert.deepEqual(problems, [], `${MANIFEST} breaks the asset-manifest contract:\n${problems.join('\n')}`);
});

test('every audio entry names its rebuild recipe and the SHA-256 of each file it ships', () => {
  const m = /** @type {{ rebuild?: Record<string, { entry: string, cost: number, tools: Record<string, string> }>, assets: Entry[] }} */ (manifest());
  assert.ok(m.rebuild, 'the manifest declares no rebuild recipes');
  const recipes = m.rebuild;
  for (const r of ['music', 'sfx', 'ir', 'test']) assert.ok(recipes[r], `no '${r}' rebuild recipe`);
  for (const r of Object.values(recipes)) {
    assert.ok(existsSync(at(r.entry)), `${r.entry} does not exist`);
    assert.ok(r.cost > 0 && r.tools.ffmpeg && r.tools.sox, `${r.entry}: cost and pinned tools`);
  }
  assert.equal(m.assets.length, 29, 'the audio manifest ships 29 entries');
  for (const e of m.assets) {
    const recipe = /** @type {{ rebuild?: unknown, digests?: Record<string, string> }} */ (e).rebuild;
    const digests = /** @type {{ digests?: Record<string, string> }} */ (e).digests ?? {};
    assert.ok(typeof recipe === 'string' && recipes[recipe], `${e.id}: no rebuild recipe`);
    const files = new Set([e.path, ...Object.values(e.files ?? {}), ...Object.values(e.variants ?? {}).map((v) => v.path)]);
    assert.deepEqual(Object.keys(digests).sort(), [...files].sort(), `${e.id}: a digest per shipped file`);
    for (const [p, h] of Object.entries(digests)) {
      assertBinary(p);
      assert.equal(sha(p), h, `${e.id}: ${p} does not match its digest`);
    }
  }
});

test('the scene scripts night, rain, a zombie at the door, the horde and quiet, over five buses with ducking', () => {
  const s = readJson(SCENE);
  assert.equal(s.schema, 'survival-logs/audio-scene@1');
  assert.equal(s.duration, 60);
  assert.deepEqual(
    s.sections.map((/** @type {{ title: string }} */ x) => x.title),
    ['Apartment at night', 'Rain', 'A zombie at the door', 'The horde', 'Quiet'],
  );
  assert.deepEqual(Object.keys(s.buses).sort(), ['ambience', 'master', 'music', 'sfx', 'ui']);
  assert.ok(s.ducking.length > 0 && Object.keys(s.duck.curves).includes('music'), 'no ducking');
  assert.ok(Number.isFinite(s.masterGainDb));
  const assets = new Set(manifest().assets.map((e) => e.id));
  for (const c of s.cues) {
    assert.ok(assets.has(c.asset), `cue at ${c.t} s: ${c.asset} is not in the manifest`);
    assert.ok(c.t >= 0 && c.t < 60, `cue at ${c.t} s`);
    assert.ok(Object.keys(s.buses).includes(c.bus), `cue at ${c.t} s: bus ${c.bus}`);
  }
  assert.ok(s.cues.length >= 80, `the scene has ${s.cues.length} cues`);
  const used = new Set(s.cues.map((/** @type {{ asset: string }} */ c) => c.asset));
  for (const a of ['audio/music-night', 'audio/music-night-to-horde', 'audio/music-horde', 'audio/rain', 'audio/door-bang', 'audio/zombie-groan', 'audio/thunder']) assert.ok(used.has(a), `the scene never plays ${a}`);
  assert.ok(s.cues.some((/** @type {{ position?: number[] }} */ c) => c.position), 'no in-world (spatialized) sources');
  assert.deepEqual(Object.keys(s.spaces).sort(), ['apartment', 'basement', 'outdoors', 'shop', 'stairwell']);
  for (const sp of Object.values(s.spaces)) assertBinary(/** @type {{ ir: string }} */ (sp).ir);
});

test('room impulse responses exist for every space', () => {
  for (const space of ['apartment', 'stairwell', 'shop', 'basement', 'outdoors']) {
    const p = `assets/audio/ir/${space}.wav`;
    assertBinary(p);
    const head = readFileSync(at(p)).subarray(0, 12).toString('latin1');
    assert.ok(head.startsWith('RIFF') && head.endsWith('WAVE'), `${p} is not a WAV file`);
    assert.ok(seconds(p) > 0.3, `${p} is too short`);
  }
});

test('the music is composed as Standard MIDI Files that the renderer reads', () => {
  const stems = manifest().assets.filter((x) => x.params?.category === 'music');
  assert.equal(stems.length, STEMS.length, 'every stem has its score');
  for (const e of stems) {
    const mid = e.files?.midi;
    assert.ok(mid, `${e.id}: no MIDI file`);
    const b = readFileSync(at(mid));
    assert.equal(b.toString('latin1', 0, 4), 'MThd', `${mid}: not a MIDI file`);
    assert.ok(b.readUInt16BE(10) >= 2, `${mid}: needs a conductor track and instrument tracks`);
  }
});

test('the live page plays the scene through Web Audio with panners, room reverbs, bus faders and ducking', () => {
  const html = readFileSync(at(PAGE), 'utf8');
  for (const needle of ['createPanner', 'createConvolver', 'setValueCurveAtTime', 'createDynamicsCompressor', 'audio/test-60s', 'assets/audio/manifest.json']) {
    assert.ok(html.includes(needle), `${PAGE} does not use ${needle}`);
  }
  assert.match(html, /BUSES = \['master', 'music', 'sfx', 'ambience', 'ui'\]/, 'the page has no fader per bus');
});
