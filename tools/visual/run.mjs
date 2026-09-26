#!/usr/bin/env node
// @ts-check
// Visual regression (the gate's visual check): captures every shot of tests/visual/shots.json in Chromium and
// captures it twice (the two must be byte-identical, or the shot fails as non-deterministic), and
// compares it with its approved baseline in tests/visual/baselines/ by SSIM (tools/lib/ssim.mjs, lowest RGB channel)
// at the list's threshold (≥ 0.98) over the shot and ≥ 0.95 on every tile of a 16 × 9 grid. A shot without a
// baseline, or whose baseline the change log does not account for, fails; so does a shot whose page throws, a log
// that does not extend master's, a log line the branch added without an approver, and a master shot id gone from the
// list. Nothing passes without being compared.
//   node tools/visual/run.mjs [--json] [--only <id,id>]
//   node tools/visual/run.mjs --approve <id,id|all> --reason "<why the picture changed>" --by review:<id>
//   node tools/visual/run.mjs --sign --by review:<id>   approves the branch's unsigned log lines
// The approver is never the branch's agent (docs/wp/STATUS.md).
// Options: --root <dir> (another checkout: the fixture tests), --url <base> (a running server instead of a fresh
// Vite dev server). Captures, baselines and difference maps of failures go to test-results/visual/<shot>/.
// Exit code: 0 pass, 1 fail, 2 bad usage.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { SHOTS_FILE, approve, auditAgainstMaster, baselinePath, baselineProblem, branchAgent, latest, readLog, signAdded } from './baselines.mjs';
import { approverProblem, readRoster } from '../balance/git.mjs';
import { captureShot, launch, lookFingerprint, startDevServer } from './capture.mjs';
import { TILES, comparePngs, diffPng } from './compare.mjs';
import { checkShots } from './shots.mjs';
import { SETUP_NAMES } from './setups.mjs';
import { decodePng } from '../lib/png.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const USAGE = 'usage: node tools/visual/run.mjs [--json] [--only <id,id>] [--approve <id,id|all> --reason "<why>" --by review:<id>] [--sign --by review:<id>] [--root <dir>] [--url <base>]';

/** @param {string} msg @returns {never} */
function usage(msg) {
  console.error(`visual: ${msg}\n${USAGE}`);
  process.exit(2);
}

/** @type {{ json?: boolean, only?: string, approve?: string, reason?: string, by?: string, sign?: boolean, root?: string, url?: string, help?: boolean }} */
let args = {};
try {
  args = parseArgs({
    options: { json: { type: 'boolean' }, only: { type: 'string' }, approve: { type: 'string' }, reason: { type: 'string' }, by: { type: 'string' }, sign: { type: 'boolean' }, root: { type: 'string' }, url: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
  }).values;
} catch (err) {
  usage(/** @type {Error} */ (err).message);
}
if (args.help) {
  console.log(USAGE);
  process.exit(0);
}
if (args.approve && !args.reason?.trim()) usage('--approve needs --reason: every baseline change is logged with why');
if (args.reason && !args.approve) usage('--reason goes with --approve');
if (args.approve && args.only) usage('pick the shots with --approve <id,id>, not --only');
if ((args.approve || args.sign) && !args.by) usage('--approve and --sign need --by review:<id> of a reviewer listed on master (docs/wp/STATUS.md): the integrator records the reviewer verdict');
if (args.by && !args.approve && !args.sign) usage('--by goes with --approve or --sign');

const root = args.root ? resolve(args.root) : REPO;
if (args.by) {
  const why = approverProblem(args.by, branchAgent(root), readRoster(root));
  if (why) usage(why);
}
if (args.sign) {
  const r = signAdded(root, /** @type {string} */ (args.by));
  if (args.json) console.log(JSON.stringify({ ok: !r.problems.length, summary: `${r.signed} log line(s) signed by ${args.by}`, problems: r.problems }));
  else console.log(`${r.problems.length ? 'FAIL' : 'PASS'} visual --sign: ${r.signed} log line(s) signed by ${args.by}${r.problems.length ? `: ${r.problems.join('; ')}` : ''}`);
  process.exit(r.problems.length ? 1 : 0);
}
const log = (/** @type {string} */ s) => !args.json && console.log(s);

/** @param {string} summary @param {string[]} problems @param {unknown[]} [shots] @returns {never} */
function finish(summary, problems, shots = []) {
  const ok = problems.length === 0;
  if (args.json) console.log(JSON.stringify({ ok, summary, problems, shots }));
  else {
    for (const p of problems) console.log(`✖ ${p}`);
    console.log(`${ok ? 'PASS' : 'FAIL'} visual: ${summary}`);
  }
  process.exit(ok ? 0 : 1);
}

const listFile = join(root, SHOTS_FILE);
if (!existsSync(listFile)) finish(`${SHOTS_FILE} is missing`, [`${SHOTS_FILE} is missing: the shot list decides what is compared`]);
/** @type {import('./shots.mjs').ShotList} */
let list;
try {
  list = JSON.parse(readFileSync(listFile, 'utf8'));
} catch (err) {
  finish(`${SHOTS_FILE} is not JSON`, [`${SHOTS_FILE}: ${/** @type {Error} */ (err).message}`]);
}
const listProblems = checkShots(list, SETUP_NAMES);
if (listProblems.length) finish(`${SHOTS_FILE} has ${listProblems.length} problem(s)`, listProblems);

const ids = list.shots.map((s) => s.id);
const pick = args.approve ?? args.only;
const wanted = !pick || pick === 'all' ? ids : pick.split(',').map((s) => s.trim());
const unknown = wanted.filter((id) => !ids.includes(id));
if (unknown.length) usage(`no such shot: ${unknown.join(', ')} (have ${ids.join(', ')})`);
const shots = list.shots.filter((s) => wanted.includes(s.id));

const { entries, problems: logProblems } = readLog(root);
const last = latest(entries);
let commit = '?';
try {
  commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch {}

const server = args.url ? { url: args.url, close: async () => {} } : await startDevServer(root);
/**
 * Whether two captures differ only by GPU rasterisation noise: at most 0.01 % of pixels off by more than 15 levels.
 * @param {Buffer} a @param {Buffer} b
 */
function withinNoise(a, b) {
  const pa = decodePng(a);
  const pb = decodePng(b);
  if (pa.width !== pb.width || pa.height !== pb.height) return false;
  let off = 0;
  for (let i = 0; i < pa.data.length; i += 4) {
    const d = Math.max(Math.abs(pa.data[i] - pb.data[i]), Math.abs(pa.data[i + 1] - pb.data[i + 1]), Math.abs(pa.data[i + 2] - pb.data[i + 2]));
    if (d > 15) off++;
  }
  return off <= (pa.width * pa.height) / 10000;
}

const browser = await launch();
// 3D shots render on the hardware GPU (GPU_ARGS in capture.mjs): SwiftShader takes minutes a frame and picks the low
// quality tier, which is not the look being approved. The 2D shots stay on the default path.
const is3d = (/** @type {{ url: string }} */ s) => /[?&]render=3d\b/.test(s.url);
const gpuBrowser = shots.some(is3d) ? await launch({ gpu: true }) : null;
const env = { browser: `chromium ${browser.version()}`, platform: `${process.platform}-${process.arch}`, node: process.version };
const outDir = join(REPO, 'test-results', 'visual');
/** @type {{ id: string, state: string, ssim: number | null, detail: string }[]} */
const results = [];
const problems = [...logProblems, ...(args.approve ? [] : auditAgainstMaster(root))];
try {
  for (const shot of shots) {
    const t0 = performance.now();
    let cap;
    let again;
    try {
      const b = is3d(shot) && gpuBrowser ? gpuBrowser : browser;
      cap = await captureShot(b, server.url, list, shot);
      again = await captureShot(b, server.url, list, shot);
    } catch (err) {
      const detail = `capture failed: ${/** @type {Error} */ (err).message.split('\n')[0]}`;
      results.push({ id: shot.id, state: 'fail', ssim: null, detail });
      problems.push(`${shot.id}: ${detail}`);
      continue;
    }
    const dir = join(outDir, shot.id);
    mkdirSync(dir, { recursive: true });
    // a 3D shot on the GPU repeats within rasterisation noise (the driver's MSAA and AO are not bit-exact from run
    // to run): at most 0.01 % of its pixels may differ, each by more than 15 levels; a 2D shot repeats byte for byte
    if (!cap.png.equals(again.png) && !(is3d(shot) && gpuBrowser && withinNoise(cap.png, again.png))) {
      writeFileSync(join(dir, 'actual.png'), cap.png);
      writeFileSync(join(dir, 'actual-2.png'), again.png);
      const d = comparePngs(cap.png, again.png);
      const detail = `non-deterministic: two captures of the same shot differ (SSIM ${d.size ? 'n/a' : d.ssim.toFixed(4)}${d.tiles ? `, worst tile ${d.tiles.worst.toFixed(4)}` : ''}); a shot must repeat byte for byte`;
      results.push({ id: shot.id, state: 'fail', ssim: null, detail });
      problems.push(`${shot.id}: ${detail}`);
      log(`  ✖ ${shot.id.padEnd(28)} ${detail}`);
      continue;
    }
    writeFileSync(join(dir, 'actual.png'), cap.png);
    const secs = `${((performance.now() - t0) / 1000).toFixed(1)} s`;
    const shotEnv = new URLSearchParams(shot.url.split('?')[1]).get('render') === '3d' ? { ...env, look: lookFingerprint() } : env;
    if (cap.errors.length) {
      const detail = `the page reported ${cap.errors.length} error(s): ${cap.errors.slice(0, 3).join(' | ')}`;
      results.push({ id: shot.id, state: 'fail', ssim: null, detail });
      problems.push(`${shot.id}: ${detail}`);
      continue;
    }
    const base = baselinePath(root, shot.id);
    if (args.approve) {
      const before = existsSync(base) ? comparePngs(readFileSync(base), cap.png) : null;
      const entry = approve(root, { shot: shot.id, png: cap.png, reason: /** @type {string} */ (args.reason).trim(), commit, env: shotEnv, ssimToPrevious: before ? before.ssim : null, approvedBy: args.by });
      const detail = `approved (${before ? `SSIM ${before.ssim.toFixed(4)} to the previous baseline` : 'first baseline'}; sha256 ${entry.sha256.slice(0, 12)})`;
      results.push({ id: shot.id, state: 'approved', ssim: before?.ssim ?? null, detail });
      log(`  ✔ ${shot.id.padEnd(28)} ${detail} (${secs})`);
      continue;
    }
    const why = baselineProblem(root, shot.id, last);
    if (why) {
      results.push({ id: shot.id, state: 'fail', ssim: null, detail: why });
      problems.push(why);
      continue;
    }
    const baseBytes = readFileSync(base);
    const cmp = comparePngs(baseBytes, cap.png);
    const was = last.get(shot.id)?.env;
    const envNote = was && (was.browser !== shotEnv.browser || was.platform !== shotEnv.platform || (/** @type {any} */ (was).look ?? '') !== (/** @type {any} */ (shotEnv).look ?? ''))
      ? `; baseline captured with ${was.browser} on ${was.platform}${/** @type {any} */ (was).look !== /** @type {any} */ (shotEnv).look ? ' and other look constants' : ''}, this capture with ${shotEnv.browser} on ${shotEnv.platform}`
      : '';
    const tilesOk = !!cmp.tiles && cmp.tiles.below === 0;
    const ok = !cmp.size && cmp.ssim >= list.threshold && tilesOk;
    const [r, g, b] = cmp.channels.map((c) => c.toFixed(4));
    const t = cmp.tiles;
    const tileText = t ? `; worst tile (${t.at.join(', ')}) ${t.worst.toFixed(4)}${t.below ? `, ${t.below} of ${t.tiles} tiles under ${TILES.threshold}` : ''}` : `; no ${TILES.cols} × ${TILES.rows} tiles (the shot is too small)`;
    const detail = cmp.size ? `size differs: ${cmp.size}` : `SSIM ${cmp.ssim.toFixed(4)} (R ${r} G ${g} B ${b}) vs ${list.threshold}${tileText}${ok ? '' : envNote}`;
    results.push({ id: shot.id, state: ok ? 'pass' : 'fail', ssim: cmp.ssim, detail });
    if (!ok) {
      problems.push(`${shot.id}: ${detail}`);
      writeFileSync(join(dir, 'baseline.png'), baseBytes);
      const d = diffPng(baseBytes, cap.png);
      if (d) writeFileSync(join(dir, 'diff.png'), d);
    }
    log(`  ${ok ? '✔' : '✖'} ${shot.id.padEnd(28)} ${detail} (${secs})`);
  }
} finally {
  await browser.close();
  await gpuBrowser?.close();
  await server.close();
}

const passed = results.filter((r) => r.state === 'pass').length;
const approved = results.filter((r) => r.state === 'approved').length;
const scores = results.filter((r) => r.ssim != null).map((r) => /** @type {number} */ (r.ssim));
const minText = scores.length ? `, lowest SSIM ${Math.min(...scores).toFixed(4)}` : '';
const summary = args.approve
  ? `${approved} of ${shots.length} shot(s) approved as baselines${problems.length ? `, ${problems.length} problem(s)` : ''}`
  : `${passed} of ${shots.length} shot(s) match their baselines at SSIM ≥ ${list.threshold}${minText}`;
finish(summary, problems, results);
