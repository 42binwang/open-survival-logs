// @ts-check
// Visual regression (tools/visual/): the SSIM comparison, the baseline change log, the shot list, the committed
// baselines, and the CLI capturing a fixture page in Chromium against its approved baseline.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { TILES, comparePngs } from '../tools/visual/compare.mjs';
import { LOG_FILE, approve, auditAgainstMaster, baselinePath, baselineProblem, latest, readLog, sha256, signAdded } from '../tools/visual/baselines.mjs';
import { SHOTS_SCHEMA, checkShots } from '../tools/visual/shots.mjs';
import { SETUP_NAMES } from '../tools/visual/setups.mjs';
import { serveStatic } from '../tools/budgets/serve.mjs';
import { noise, png, tempRoot } from './visual/fixtures.mjs';

const run = promisify(execFile);
const REPO = new URL('..', import.meta.url).pathname;

/** A 64 × 48 test picture: bands and noise; `shift` moves a bright bar. @param {number} [shift] */
const picture = (shift = 0) => png(64, 48, (x, y) => [80 + (x * 2) % 90 + 20 * noise(x, y), 60 + y * 2, (x - shift + 64) % 64 < 8 ? 250 : 40]);

test('SSIM comparison: the same picture scores 1, a changed one falls under 0.98, another size fails', () => {
  const a = picture();
  assert.equal(comparePngs(a, a).ssim, 1);
  const moved = comparePngs(a, picture(20));
  assert.ok(moved.ssim < 0.98, `a moved bar scores ${moved.ssim}`);
  assert.equal(moved.channels.length, 3, 'judged per RGB channel, alpha left out');
  const other = comparePngs(a, png(32, 32, () => [0, 0, 0]));
  assert.equal(other.ssim, 0);
  assert.match(String(other.size), /64×48/);
});

test('SSIM per tile: a local change the whole-image score dilutes still fails its 120 × 120 tile', () => {
  const W = 1920;
  const H = 1080;
  const field = (/** @type {number} */ x, /** @type {number} */ y) => [90 + 40 * noise(x >> 2, y >> 2), 80 + (y % 64), 70 + (x % 50)];
  const base = png(W, H, field);
  const same = comparePngs(base, base);
  assert.deepEqual([same.tiles?.below, same.tiles?.tiles, same.tiles?.worst], [0, TILES.cols * TILES.rows, 1]);
  const patched = png(W, H, (x, y) => (x >= 600 && x < 700 && y >= 360 && y < 460 ? [240, 30, 30] : field(x, y)));
  const r = comparePngs(base, patched);
  assert.ok(r.ssim >= 0.98, `the whole shot still scores ${r.ssim.toFixed(4)}`);
  assert.ok(Number(r.tiles?.below) >= 1, 'but the tile holding the patch is under 0.95');
  assert.deepEqual(r.tiles?.at, [5, 3], 'tile column 5, row 3 (600–720, 360–480)');
});

/** A STATUS.md with the branch wp/T built by 1234abcd, a second builder 2222bbbb, and the reviewers 99ffee00 and 5678ef90. */
const STATUS = '| WP | branch | agent |\n| --- | --- | --- |\n| T | wp/T | 1234abcd |\n| U | wp/U | 2222bbbb |\n\n## Reviewers\n\n| agent | role |\n| --- | --- |\n| 99ffee00 | reviewer |\n| 5678ef90 | reviewer |\n';

/**
 * A git checkout of `root` on master with its files committed, then on `branch`.
 * @param {string} root
 * @param {string} [branch]
 */
function gitRepo(root, branch = 'wp/T') {
  const g = (/** @type {string[]} */ a) => execFileSync('git', a, { cwd: root, stdio: 'ignore' });
  g(['init', '-q', '-b', 'master']);
  g(['-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A']);
  g(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'master', '--allow-empty']);
  g(['checkout', '-q', '-b', branch]);
  return (/** @type {string} */ msg) => {
    g(['-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A']);
    g(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', msg, '--allow-empty']);
  };
}

test('baselines against master: the log only grows, each added line has an approver who is not the branch agent, master shots stay', () => {
  const shots = { schema: SHOTS_SCHEMA, shots: [{ id: 'a' }, { id: 'b' }] };
  const line = (/** @type {string} */ shot, /** @type {string | null} */ by) => `${JSON.stringify({ shot, sha256: 'f'.repeat(64), previous: null, ssimToPrevious: null, reason: 'fixture line', approvedBy: by, at: '2026-09-01T00:00:00Z', commit: 'x', env: {} })}\n`;
  const r = tempRoot({ 'tests/visual/shots.json': shots, [LOG_FILE]: line('a', 'review:99ffee00'), 'docs/wp/STATUS.md': STATUS });
  try {
    const commit = gitRepo(r.root);
    assert.deepEqual(auditAgainstMaster(r.root), [], 'nothing added yet');
    writeFileSync(join(r.root, LOG_FILE), line('a', 'review:99ffee00') + line('b', null));
    assert.match(auditAgainstMaster(r.root).join(), /the b baseline .*no approver/);
    assert.match(signAdded(r.root, 'review:1234abcd').problems.join(), /branch's own agent/, 'the branch agent may not sign');
    assert.equal(signAdded(r.root, 'review:99ffee00').signed, 1);
    assert.deepEqual(auditAgainstMaster(r.root), [], 'signed by a reviewer');
    assert.match(readFileSync(join(r.root, LOG_FILE), 'utf8').split('\n')[0], /"approvedBy":"review:99ffee00"/, "master's line untouched");
    writeFileSync(join(r.root, LOG_FILE), line('b', 'review:99ffee00'));
    assert.match(auditAgainstMaster(r.root).join(), /append-only/, "master's line removed");
    writeFileSync(join(r.root, LOG_FILE), line('a', 'review:99ffee00') + line('b', 'review:1234abcd'));
    assert.match(auditAgainstMaster(r.root).join(), /branch's own agent/);
    writeFileSync(join(r.root, LOG_FILE), line('a', 'review:99ffee00') + line('b', 'review:0badc0de'));
    assert.match(auditAgainstMaster(r.root).join(), /not a reviewer listed/, 'a builder typing a made-up reviewer id');
    assert.match(signAdded(r.root, 'review:0badc0de').problems.join(), /not a reviewer listed/);
    writeFileSync(join(r.root, LOG_FILE), line('a', 'review:99ffee00') + line('b', 'review:2222bbbb'));
    assert.match(auditAgainstMaster(r.root).join(), /built a work package/, 'another builder is no reviewer');
    writeFileSync(join(r.root, LOG_FILE), line('a', 'review:99ffee00') + line('b', 'integrator'));
    commit('INT (T merge): sign the baseline');
    assert.match(auditAgainstMaster(r.root).join(), /'integrator' is no approver/, "'integrator' is refused, even in a commit titled INT (any agent can write that subject)");
    assert.match(signAdded(r.root, 'integrator').problems.join(), /'integrator' is no approver/);
    writeFileSync(join(r.root, LOG_FILE), line('a', 'review:99ffee00'));
    writeFileSync(join(r.root, 'tests/visual/shots.json'), JSON.stringify({ ...shots, shots: [{ id: 'b' }] }));
    assert.match(auditAgainstMaster(r.root).join(), /master's shot\(s\) a were removed/);
  } finally {
    r.done();
  }
});

test('baselines: a shot needs a baseline, and the change log must account for its bytes', () => {
  const r = tempRoot({});
  try {
    assert.match(String(baselineProblem(r.root, 'x', new Map())), /no baseline/);
    const png1 = picture();
    const entry = approve(r.root, { shot: 'x', png: png1, reason: 'first', commit: 'abc1234', env: { browser: 'b', platform: 'p' }, ssimToPrevious: null });
    assert.equal(entry.previous, null);
    const { entries, problems } = readLog(r.root);
    assert.deepEqual(problems, []);
    assert.equal(baselineProblem(r.root, 'x', latest(entries)), null);
    writeFileSync(baselinePath(r.root, 'x'), picture(5));
    assert.match(String(baselineProblem(r.root, 'x', latest(entries))), /not the file the log approved/);
    const second = approve(r.root, { shot: 'x', png: picture(5), reason: 'moved', commit: 'abc1234', env: {}, ssimToPrevious: 0.5 });
    assert.equal(second.previous, sha256(picture(5)), 'the log records the file it replaced');
    assert.equal(baselineProblem(r.root, 'x', latest(readLog(r.root).entries)), null);
    writeFileSync(join(r.root, LOG_FILE), '{"shot":"x"}\n');
    assert.ok(readLog(r.root).problems.length, 'a log line without its hash and reason');
  } finally {
    r.done();
  }
});

test('shot list: tests/visual/shots.json is valid; empty lists, lax thresholds, missing seeds, 3D shots without a camera and unknown setups are not', () => {
  const list = JSON.parse(readFileSync(join(REPO, 'tests/visual/shots.json'), 'utf8'));
  assert.deepEqual(checkShots(list, SETUP_NAMES), []);
  assert.ok(list.shots.length >= 10, 'the key screens of the game');
  const base = { schema: SHOTS_SCHEMA, viewport: [1920, 1080], threshold: 0.98, clock: '2026-06-01T09:00:00Z', settleFrames: 10 };
  const shot = { id: 'a', title: 'A', url: '/?render=2d&seed=1', seed: 1, steps: [] };
  assert.match(checkShots({ ...base, shots: [] }, SETUP_NAMES).join(), /empty/);
  assert.match(checkShots({ ...base, threshold: 0.9, shots: [shot] }, SETUP_NAMES).join(), /0\.98/);
  assert.match(checkShots({ ...base, viewport: [1280, 720], shots: [shot] }, SETUP_NAMES).join(), /1920/);
  assert.match(checkShots({ ...base, shots: [{ ...shot, url: '/?render=2d' }] }, SETUP_NAMES).join(), /seed=1/);
  assert.match(checkShots({ ...base, shots: [{ ...shot, url: '/?render=3d&seed=1' }] }, SETUP_NAMES).join(), /look-at/);
  assert.deepEqual(checkShots({ ...base, shots: [{ ...shot, url: '/?render=3d&seed=1', camera: { lookAt: [7, 5.5] } }] }, SETUP_NAMES), []);
  assert.match(checkShots({ ...base, shots: [{ ...shot, steps: [{ setup: 'teleport' }] }] }, SETUP_NAMES).join(), /teleport/);
  assert.match(checkShots({ ...base, shots: [shot, shot] }, SETUP_NAMES).join(), /duplicate/);
});

test('every shot of tests/visual/shots.json has a baseline the change log approved', () => {
  const list = JSON.parse(readFileSync(join(REPO, 'tests/visual/shots.json'), 'utf8'));
  const { entries, problems } = readLog(REPO);
  assert.deepEqual(problems, []);
  const last = latest(entries);
  for (const s of list.shots) assert.equal(baselineProblem(REPO, s.id, last), null, s.id);
  for (const e of entries) assert.ok(e.reason.length >= 10, `${e.shot}: the log gives a reason`);
});

/** A page that draws with Math.random on a canvas: the seed decides the picture. @param {string} variant */
const page = (variant) => `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#15171a">
<div class="title-logo" style="position:absolute;top:40px;left:40px;color:#e1e1df;font:40px sans-serif">Fixture</div>
<canvas id="c" width="1920" height="1080"></canvas>
<script>
const g = document.getElementById('c').getContext('2d');
for (let i = 0; i < 60; i++) { g.fillStyle = 'hsl(' + Math.floor(Math.random() * 360) + ',40%,45%)'; g.fillRect(Math.random() * 1800, 120 + Math.random() * 900, 120, 80); }
${variant === 'b' ? "g.fillStyle = '#f8ad34'; g.fillRect(200, 200, 1400, 600);" : ''}
${variant === 'noisy' ? "const r = new Uint32Array(1); crypto.getRandomValues(r); g.fillStyle = '#e04040'; g.fillRect(100 + (r[0] % 1500), 300, 200, 200);" : ''}
${variant === 'ticking' ? "setTimeout(() => { g.fillStyle = '#40e040'; g.fillRect(600, 300, 400, 300); }, 400);" : ''}
</script>`;

test('visual CLI in Chromium: an approved page matches; a changed page, a shot without a baseline and --approve without --reason fail', async () => {
  const site = tempRoot({ 'index.html': page('a') });
  const r = tempRoot({
    'tests/visual/shots.json': { schema: SHOTS_SCHEMA, viewport: [1920, 1080], threshold: 0.98, clock: '2026-06-01T09:00:00.000Z', settleFrames: 5, shots: [{ id: 'fixture-page', title: 'A fixture page', url: '/?render=2d&seed=7', seed: 7, steps: [{ waitFor: '.title-logo' }] }] },
    'docs/wp/STATUS.md': STATUS,
  });
  gitRepo(r.root);
  const server = await serveStatic(site.root);
  const cli = async (/** @type {string[]} */ extra) => {
    const out = await run(process.execPath, ['tools/visual/run.mjs', '--json', '--root', r.root, '--url', server.url, ...extra], { cwd: REPO }).catch((e) => e);
    const last = String(out.stdout || '').trim().split('\n').at(-1);
    return { code: out.code ?? 0, json: last ? JSON.parse(last) : null, stderr: String(out.stderr || '') };
  };
  try {
    const none = await cli([]);
    assert.equal(none.code, 1, 'no baseline yet');
    assert.match(none.json.problems.join(), /no baseline/);
    const lax = await cli(['--approve', 'fixture-page', '--by', 'review:5678ef90']);
    assert.equal(lax.code, 2, '--approve needs a reason');
    assert.equal((await cli(['--approve', 'fixture-page', '--reason', 'fixture baseline for the test', '--by', 'integrator'])).code, 2, 'integrator is no approver');
    assert.equal((await cli(['--approve', 'fixture-page', '--reason', 'fixture baseline for the test'])).code, 2, '--approve needs --by');
    assert.equal((await cli(['--approve', 'fixture-page', '--reason', 'fixture baseline for the test', '--by', 'review:1234abcd'])).code, 2, 'not the branch agent');
    assert.equal((await cli(['--approve', 'fixture-page', '--reason', 'fixture baseline for the test', '--by', 'me'])).code, 2, 'review:<id> only');
    const ok = await cli(['--approve', 'fixture-page', '--reason', 'fixture baseline for the test', '--by', 'review:5678ef90']);
    assert.equal(ok.code, 0, ok.stderr);
    assert.ok(existsSync(join(r.root, 'tests/visual/baselines/fixture-page.png')));
    const same = await cli([]);
    assert.equal(same.code, 0, JSON.stringify(same.json));
    assert.equal(same.json.shots[0].ssim, 1, 'seeded Math.random and the fixed clock make the capture repeat exactly');
    writeFileSync(join(site.root, 'index.html'), page('b'));
    const changed = await cli([]);
    assert.equal(changed.code, 1);
    assert.ok(changed.json.shots[0].ssim < 0.98, `the changed page scores ${changed.json.shots[0].ssim}`);
    assert.ok(existsSync(join(REPO, 'test-results/visual/fixture-page/diff.png')), 'a difference map for the failure');
    writeFileSync(join(site.root, 'index.html'), page('noisy'));
    const noisy = await cli([]);
    assert.equal(noisy.code, 1);
    assert.match(noisy.json.problems.join(), /fixture-page: non-deterministic: two captures of the same shot differ/, 'a page that draws from real randomness');
    assert.equal((await cli(['--approve', 'fixture-page', '--reason', 'a non-deterministic page', '--by', 'review:5678ef90'])).code, 1, 'and it cannot be approved');
    writeFileSync(join(site.root, 'index.html'), page('ticking'));
    const t1 = await cli(['--approve', 'fixture-page', '--reason', 'a page with a 400 ms timer', '--by', 'review:5678ef90']);
    assert.equal(t1.code, 0, 'a timer on the page clock repeats exactly: nothing advances it but the steps and the settle');
    assert.equal((await cli([])).json.shots[0].ssim, 1);
  } finally {
    await server.close();
    site.done();
    r.done();
  }
});

test('side-by-side shots reach their frames: each pair captured, its day, time, weather and scene read from the game', async () => {
  const { captureShot, launch, startDevServer } = await import('../tools/visual/capture.mjs');
  const doc = JSON.parse(readFileSync(join(REPO, 'docs/quality/side-by-side.json'), 'utf8'));
  const list = /** @type {any} */ ({ viewport: [1920, 1080], clock: '2026-06-01T09:00:00.000Z', settleFrames: 10, threshold: 0.98, shots: [] });
  const server = await startDevServer(REPO);
  // the pairs are three.js shots: hardware WebGL where the platform offers it
  const browser = await launch({ gpu: true });
  try {
    for (const p of doc.pairs) {
      const shot = /** @type {any} */ ({ id: p.id, title: p.id, url: p.shot.url, seed: p.shot.seed, steps: p.shot.steps, storage: p.shot.storage, camera: p.shot.camera });
      const cap = await captureShot(browser, server.url, list, shot);
      assert.deepEqual(cap.errors, [], `${p.id}: no page errors`);
      const st = /** @type {NonNullable<typeof cap.state>} */ (cap.state);
      assert.ok(st, `${p.id}: a run`);
      const c = p.conditions;
      const phaseOf = (/** @type {string} */ ph) => (ph === 'pre' ? 'pre' : 'post');
      for (const k of ['day', 'weather', 'scene', 'character']) if (c[k] !== undefined) assert.equal(/** @type {any} */ (st)[k], c[k], `${p.id}: ${k}`);
      if (c.phase !== undefined) assert.equal(phaseOf(st.phase), c.phase, `${p.id}: before or after the outbreak`);
      if (c.hour !== undefined) {
        const off = (Number(st.hour) * 60 + Number(st.minute)) - (c.hour * 60 + (c.minute ?? 0));
        assert.ok(off >= 0 && off <= 20, `${p.id}: ${st.hour}:${String(st.minute).padStart(2, '0')} is within 20 minutes after ${c.hour}:${String(c.minute ?? 0).padStart(2, '0')}`);
      }
      assert.notEqual(st.phase, 'dead', `${p.id}: the survivor is alive`);
      assert.deepEqual([st.windows, st.toasts], [0, 0], `${p.id}: no window or toast over the scene (the settlement pop-up)`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
});
