// @ts-check
// The quality ledgers: docs/bugs.jsonl, docs/quality/scores.jsonl and its side-by-side pairs, the playtest session
// lines, and the thresholds docs/QUALITY.md states against the tools that enforce them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { MAX_OPEN_S3, PERSONAS, bugChanges, openBySeverity, parseBugs, parseSessions, playtestBlockers } from '../tools/balance/ledgers.mjs';
import { AXES, EVIDENCE, PAIR_TOLERANCES, decreases, pairProblems, parseScores, readScores, signoffProblems } from '../tools/art-metrics/scores.mjs';
import { BUDGETS, formatValue } from '../tools/budgets/budgets.mjs';
import { BANDS_LOG, ledgersCheck, releaseCheck, rubricCheck } from '../tools/balance/check.mjs';
import { approverProblem, parseRoster, readRoster } from '../tools/balance/git.mjs';
import { tempRoot } from './visual/fixtures.mjs';

const run = promisify(execFile);

const REPO = new URL('..', import.meta.url).pathname;
const read = (/** @type {string} */ rel) => readFileSync(join(REPO, rel), 'utf8');

test('docs/bugs.jsonl follows the schema and holds the known issues', () => {
  const { bugs, problems } = parseBugs(read('docs/bugs.jsonl'));
  assert.deepEqual(problems, []);
  const first = bugs.find((b) => b.id === 'BUG-0001');
  assert.equal(first?.status, 'fixed');
  assert.equal(first?.fixedIn, 'b8b8a2d', 'the action-id collision fix of merge #1');
  assert.ok(bugs.some((b) => /2121/.test(b.title) && b.severity === 'S2'), 'the hidden basket button');
  assert.ok(bugs.some((b) => /endless\.js/.test(b.title)), 'meta importing UI code');
  assert.ok(bugs.filter((b) => b.foundBy.includes('WP-P0-03')).length >= 20, 'the coverage gaps of WP-P0-03');
  assert.ok(bugs.every((b) => b.rootCause.length > 10), 'one root cause per bug');
  for (const band of ['forager-gain', 'forager-horde25', 'horde25-outOfAmmo']) assert.ok(bugs.some((b) => b.foundBy.startsWith('tool:balance') && b.links.join(' ').includes(band)), `the failing ${band} band is a bug`);
  assert.equal(bugs.find((b) => /reports no stats\(\)/.test(b.title))?.severity, 'S2', 'an unmeasured budget is a budget miss: S2');
});

test('bug schema: bad severities, duplicate ids, fixes without a commit and unknown fields are rejected; open S1, S2 or too many S3 block a release', () => {
  const ok = { id: 'BUG-0001', severity: 'S3', status: 'open', title: 't', area: 'sim/x', rootCause: 'the cause', repro: 'r', foundBy: 'agent:x', links: [], phase: 'P0', opened: '2026-09-23' };
  const lines = (/** @type {object[]} */ ...l) => l.map((x) => JSON.stringify(x)).join('\n');
  assert.deepEqual(parseBugs(lines(ok)).problems, []);
  assert.match(parseBugs(lines({ ...ok, severity: 'S5' })).problems.join(), /severity/);
  assert.match(parseBugs(lines(ok, ok)).problems.join(), /unique/);
  assert.match(parseBugs(lines({ ...ok, status: 'fixed' })).problems.join(), /fixedIn/);
  assert.match(parseBugs(lines({ ...ok, owner: 'me' })).problems.join(), /no field 'owner'/);
  assert.match(parseBugs('{').problems.join(), /not JSON/);
  const many = Array.from({ length: MAX_OPEN_S3 + 1 }, (_, i) => ({ ...ok, id: `BUG-${String(i + 1).padStart(4, '0')}` }));
  assert.deepEqual(openBySeverity(parseBugs(lines(...many.slice(0, MAX_OPEN_S3))).bugs).blockers, []);
  assert.match(openBySeverity(parseBugs(lines(...many)).bugs).blockers.join(), /21 open S3/);
  assert.match(openBySeverity(parseBugs(lines({ ...ok, severity: 'S1' })).bugs).blockers.join(), /open S1/);
  const { rootCause: _, ...noCause } = ok;
  assert.match(parseBugs(lines(noCause)).problems.join(), /rootCause/, 'one root cause per bug, stated');
});

test('bug closures and severity changes need an approver who is not the branch agent; master ids stay and fixed fields do not change', () => {
  const ok = { id: 'BUG-0001', severity: 'S2', status: 'open', title: 't', area: 'sim/x', rootCause: 'the cause', repro: 'r', foundBy: 'agent:x', links: [], phase: 'P0', opened: '2026-09-23' };
  const one = (/** @type {object} */ b, agent = 'abcd1234') => parseBugs(JSON.stringify(b), { agent });
  assert.match(one({ ...ok, status: 'wontfix', notes: 'by design' }).problems.join(), /approvedBy for closing an S2 as wontfix/);
  assert.match(one({ ...ok, status: 'wontfix', notes: 'by design', approvedBy: 'review:abcd1234' }).problems.join(), /branch's own agent/);
  assert.deepEqual(one({ ...ok, status: 'wontfix', notes: 'by design', approvedBy: 'review:99990000' }).problems, []);
  assert.deepEqual(one({ ...ok, severity: 'S3', status: 'wontfix', notes: 'cosmetic' }).problems, [], 'an S3 may close without one');
  assert.match(one({ ...ok, status: 'duplicate', links: ['BUG-0002'] }).problems.join(), /approvedBy for closing an S2 as duplicate/);
  const hist = (/** @type {object[]} */ h, sev = 'S3') => one({ ...ok, severity: sev, severityHistory: h });
  const step = { from: 'S2', to: 'S3', reason: 'a workaround exists (the drawer)', approvedBy: 'review:99990000', at: '2026-09-24' };
  assert.deepEqual(hist([step]).problems, []);
  assert.match(hist([{ ...step, reason: '' }]).problems.join(), /severityHistory entries/);
  assert.match(hist([{ ...step, approvedBy: 'review:abcd1234' }]).problems.join(), /branch's own agent/);
  assert.match(hist([step], 'S2').problems.join(), /last severityHistory 'to'/);
  assert.match(hist([step, { ...step, from: 'S2', to: 'S4' }], 'S4').problems.join(), /follow on/);
  const b0 = /** @type {any} */ (ok);
  assert.deepEqual(bugChanges([b0], [{ ...b0, status: 'fixed', fixedIn: 'abc1234', links: ['abc1234'], notes: 'n' }]), [], 'status, fix commit, links and notes change in place');
  assert.match(bugChanges([b0], []).join(), /removed/);
  assert.match(bugChanges([b0], [{ ...b0, title: 'another' }]).join(), /'title' changed in place/);
  assert.match(bugChanges([b0], [{ ...b0, rootCause: 'another' }]).join(), /'rootCause' changed in place/);
  assert.match(bugChanges([b0], [{ ...b0, severity: 'S3' }]).join(), /without a severityHistory entry/);
  assert.deepEqual(bugChanges([b0], [{ ...b0, severity: 'S3', severityHistory: [step] }]), []);
  assert.match(bugChanges([{ ...b0, severity: 'S3', severityHistory: [step] }], [{ ...b0, severity: 'S3', severityHistory: [{ ...step, reason: 'other' }] }]).join(), /rewritten/);
});

/** An evidence file for every pattern of every axis, in a fixture root. */
const EVIDENCE_FILES = {
  match: ['docs/quality/side-by-side/apartment.png', 'docs/quality/P1/framing.md', 'docs/quality/P1/art-metrics.json'],
  lighting: ['docs/quality/P1/rig-day.png', 'docs/quality/P1/greycard.md', 'docs/quality/P1/dusk-night.webm', 'docs/quality/P1/lamps.md'],
  materials: ['docs/quality/P1/art-metrics.json', 'docs/quality/P1/oak-close.png', 'docs/quality/P1/oak-wide.png', 'docs/quality/P1/contact-sheet.png'],
  models: ['docs/quality/P1/coverage.md', 'docs/quality/P1/art-metrics.json', 'docs/quality/P1/turntable-sofa.png', 'docs/quality/P1/floor-1f.png'],
  characters: ['docs/quality/P1/actions.md', 'docs/quality/P1/walk.webm', 'docs/quality/P1/art-metrics.json'],
  vfx: ['docs/quality/P1/fire.webm', 'docs/quality/P1/budgets.json'],
  ui: ['docs/quality/P1/shots/hud.png', 'docs/quality/P1/overflow.md', 'docs/quality/P1/contrast.md'],
  feel: ['docs/quality/P1/feel.json', 'docs/quality/P1/inputs.webm', 'docs/quality/P1/placeholders.json'],
  onboarding: ['docs/playtests/P1/first-timer-01.md'],
  audio: ['docs/quality/P1/loudness.json', 'docs/quality/P1/mix.ogg', 'docs/quality/P1/listening.md'],
  writing: ['docs/quality/P1/strings.json', 'docs/quality/P1/glossary.md', 'docs/quality/P1/sample.md'],
  stability: ['docs/quality/P1/budgets.json', 'docs/balance/P1.md', 'docs/quality/P1/e2e.json'],
  'side-by-side': ['docs/quality/side-by-side/apartment.png'],
};

test('the scores ledger: fresh reviewers, committed evidence per axis, one line per axis per review; decreases block until lifted; due pairs by phase', () => {
  const { pairs, lines, problems } = readScores(REPO);
  assert.deepEqual(problems, []);
  assert.deepEqual(lines, [], 'no review yet at P0');
  for (const [axis, files] of Object.entries(EVIDENCE_FILES)) {
    for (const re of /** @type {Record<string, RegExp[]>} */ (EVIDENCE)[axis] || []) assert.ok(files.some((f) => re.test(f)), `the fixture evidence of ${axis} matches ${re}`);
  }
  const r = tempRoot(Object.fromEntries(Object.values(EVIDENCE_FILES).flat().map((f) => [f, 'x'])));
  try {
    const line = (/** @type {Record<string, any>} */ o) => ({ review: 'P1-r1', phase: 'P1', axis: 'lighting', score: 4, reviewer: 'agent:fresh01', fresh: true, date: '2026-10-01', commit: 'abc1234', evidence: EVIDENCE_FILES[/** @type {keyof typeof EVIDENCE_FILES} */ (o.axis || 'lighting')], notes: 'all rigs within ±5 codes', ...o });
    const ids = pairs.map((p) => p.id);
    const parse = (/** @type {object[]} */ l, /** @type {any} */ opts = {}) => parseScores(l.map((x) => JSON.stringify(x)).join('\n'), { root: r.root, pairs: ids, builders: ['1519b40a'], ...opts });
    assert.deepEqual(parse([line({})]).problems, []);
    assert.match(parse([line({ score: 6 })]).problems.join(), /score/);
    assert.match(parse([line({ axis: 'vibes' })]).problems.join(), /axis/);
    assert.match(parse([line({ evidence: ['docs/quality/nope.png'] })]).problems.join(), /nope\.png committed/);
    assert.match(parse([line({ evidence: ['docs/quality/P1/rig-day.png'] })]).problems.join(), /greycard/, 'lighting evidence needs every artefact of its kind');
    assert.match(parse([line({})], { committed: () => false }).problems.join(), /committed/, 'evidence that is not committed');
    assert.match(parse([line({ reviewer: 'agent:1519b40a' })]).problems.join(), /fresh reviewer/, 'a builder cannot score');
    assert.match(parse([line({ fresh: false })]).problems.join(), /fresh true/);
    assert.match(parse([line({}), line({ score: 5 })]).problems.join(), /one line per axis/, 'no duplicate axis in one review');
    assert.match(parse([line({ axis: 'side-by-side', pair: 'nowhere' })]).problems.join(), /pair/);
    const pair = ids[0];
    assert.match(parse([line({ axis: 'side-by-side', pair }), line({ axis: 'side-by-side', pair })]).problems.join(), /one line per axis or pair/);
    const all = [...AXES.map((axis) => line({ axis })), ...pairs.map((p) => line({ axis: 'side-by-side', pair: p.id }))];
    assert.deepEqual(parse(all).problems, []);
    assert.deepEqual(signoffProblems(parse(all).lines, 'P1', pairs), []);
    const p1only = [...AXES.map((axis) => line({ axis })), ...pairs.filter((p) => p.from === 'P1').map((p) => line({ axis: 'side-by-side', pair: p.id }))];
    assert.deepEqual(signoffProblems(parse(p1only).lines, 'P1', pairs), [], 'P3 pairs are not due at P1');
    assert.match(signoffProblems(parse(p1only.map((l) => ({ ...l, review: 'P3-r1', phase: 'P3' }))).lines, 'P3', pairs).join(), /side-by-side:site-streets: no P3 score/, 'but they are at P3');
    const low = all.map((l) => (l.axis === 'audio' ? { ...l, score: 3 } : l));
    assert.match(signoffProblems(parse(low).lines, 'P1', pairs).join(), /audio: 3 in P1-r1, below 4/);
    assert.match(signoffProblems(parse(all.filter((l) => l.axis !== 'vfx')).lines, 'P1', pairs).join(), /vfx: no P1 score/);
    const dropped = parse([line({ score: 5 }), line({ review: 'P1-r2', score: 4 })]).lines;
    assert.match(decreases(dropped).join(), /lighting: P1-r2 scores 4, below 5/);
    const lifted = parse([line({ score: 5 }), line({ review: 'P1-r2', score: 4 }), line({ review: 'P1-r3', score: 5 })]).lines;
    assert.deepEqual(decreases(lifted), [], 'a later review that lifts it back clears the block');
  } finally {
    r.done();
  }
});

test('side-by-side pairs: every home and site is paired with a native frame that shows it, or unpaired with why; each pair is judged on measured descriptors', async () => {
  const doc = JSON.parse(read('docs/quality/side-by-side.json'));
  assert.deepEqual(pairProblems(doc, (p) => existsSync(join(REPO, p))), []);
  const { HOMES } = await import('../src/content/homes.js');
  const { SITES } = await import('../src/content/sites.js');
  const targets = new Set([...doc.pairs.map((/** @type {any} */ p) => p.target), ...doc.unpaired.map((/** @type {any} */ u) => u.target)]);
  for (const h of Object.keys(HOMES)) assert.ok(doc.pairs.some((/** @type {any} */ p) => p.target === h), `home ${h} has a pair`);
  for (const s of SITES) assert.ok(targets.has(s.id), `site ${s.id} is paired or unpaired with why`);
  const art = read('docs/ART.md');
  const punchIns = ['t025', 't026', 't028', 't049', 't067', 't080', 't036'];
  for (const p of doc.pairs) {
    assert.ok(!punchIns.includes(p.ref), `${p.id}: ${p.ref} is a punch-in`);
    if (p.space === 'site' && !p.nearest) assert.ok(new RegExp(`\\| ${p.ref} ${p.target} \\|`).test(art), `${p.id}: ART.md §1.1 lists ${p.ref} as a ${p.target} view`);
    if (p.space === 'site') assert.ok(!['t069', 't074', 'ss_04'].includes(p.ref), `${p.id}: a storeroom frame is no site`);
  }
  const golden = doc.pairs.find((/** @type {any} */ p) => p.ref === 't035');
  assert.deepEqual(golden.judge, ['camera', 'relativeAlbedo'], 't035 anchors relative albedo only');
  const good = doc.pairs[1];
  const bad = (/** @type {Record<string, any>} */ o, /** @type {Record<string, any>} */ top = {}) => pairProblems({ ...doc, ...top, pairs: [{ ...good, ...o }] }, () => true).join();
  assert.equal(bad({}), '');
  assert.match(bad({ from: 'P2' }), /from P1 or P3/);
  assert.match(bad({ shot: { ...good.shot, camera: { ...good.shot.camera, lookAt: 'site centre' } } }), /lookAt two numbers/);
  assert.match(bad({ shot: { ...good.shot, steps: [] } }), /shot with a url and steps/);
  assert.match(bad({ judge: ['light'], measured: { ...good.measured, light: null } }), /measured\.light/);
  assert.match(bad({ judge: ['vibes'] }), /judge 'vibes'/);
  assert.match(bad({ conditions: undefined }), /conditions with the day, weather and scene/, 'a pair must say what its shot reaches');
  assert.equal(bad({ conditions: { ...good.conditions, phase: 'pre' } }), '', 'an optional phase: before the outbreak');
  assert.match(bad({ conditions: { ...good.conditions, phase: 'day' } }), /conditions\.phase 'pre'/);
  assert.match(bad({ shot: { ...good.shot, camera: { ...good.shot.camera, lookZoom: 1.5 } } }), /lookZoom/);
  assert.match(bad({ descriptors: { requires: [], mayShow: [] } }), /descriptors\.requires/);
  assert.match(bad({}, { tolerances: { ...PAIR_TOLERANCES, paletteDeltaE2000: 12 } }), /paletteDeltaE2000 must be 8/);
  assert.match(pairProblems({ ...doc, unpaired: [{ target: 'office' }] }, () => true).join(), /unpaired office says why/);
  assert.match(pairProblems({ ...doc, unpaired: [{ ...doc.unpaired[0], evidence: ['docs/quality/P3/unpaired/office-day.png'] }] }, () => true).join(), /names its evidence/, 'an unpaired site without a grey-card reading and a night capture');
  assert.equal(new Set(doc.pairs.map((/** @type {any} */ p) => p.id)).size, doc.pairs.length);
});

test('docs/QUALITY.md states the axes, thresholds and budgets the tools enforce', () => {
  const q = read('docs/QUALITY.md');
  for (const a of AXES) assert.ok(q.includes(`(\`${a}\`)`), `axis ${a}`);
  assert.equal((q.match(/^### 1\.\d+ /gm) || []).length, 12, 'twelve axes');
  assert.ok(q.includes('SSIM ≥ 0.98'));
  assert.ok(q.includes('| every rubric axis | ≥ 4 |'));
  assert.ok(q.includes(`at most ${MAX_OPEN_S3} S3`));
  const want = {
    frameP95: '| frame time p95 | ≤ 16.7 ms |',
    frameWorst: '| worst frame | ≤ 33 ms |',
    drawCalls: '| draw calls | ≤ 500 |',
    gpuMemory: '| GPU memory | ≤ 512 MB |',
    initialDownload: '| initial download | ≤ 5 MB |',
    coldInteractive: '| cold first-interactive | ≤ 8 s |',
    warmInteractive: '| warm first-interactive | ≤ 3 s |',
    shippedAssets: '| shipped size | ≤ 2 GB |',
    sim100: '| 100-day headless sim | ≤ 60 s |',
  };
  for (const b of BUDGETS) {
    assert.ok(q.includes(/** @type {Record<string, string>} */ (want)[b.id]), `${b.id} in docs/QUALITY.md`);
    const shown = formatValue(b.max, b.unit);
    assert.ok(shown.length > 0);
  }
  assert.equal(BUDGETS.find((b) => b.id === 'frameP95')?.max, 1, '16.7 ms is one 60 Hz display frame');
  assert.equal(BUDGETS.find((b) => b.id === 'frameWorst')?.max, 2, '33 ms is two');
  assert.equal(BUDGETS.find((b) => b.id === 'gpuMemory')?.max, 512 * 1024 * 1024);
  assert.equal(BUDGETS.find((b) => b.id === 'sim100')?.max, 60000);
});

test('playtest session lines: valid ones pass; bad personas, speeds and missing reports are rejected', () => {
  const s = { phase: 'P1', persona: 'veteran', session: 3, seed: 1203, devSpeed: 4, commit: 'a1b2c3d', url: '/?seed=1203&devSpeed=4', trace: 'docs/playtests/README.md', character: 'wage', difficulty: 'hard', minutes: 60, days: 31, end: 'dead', crashes: 0, pageErrors: 0, stalls: 0, bugs: ['BUG-0031'], report: 'docs/playtests/README.md' };
  const parse = (/** @type {object} */ o) => parseSessions(JSON.stringify(o), 'sessions.jsonl', (p) => existsSync(join(REPO, p)));
  assert.deepEqual(parse(s).problems, []);
  assert.match(parse({ ...s, url: '/?seed=1203&devSpeed=4&render=2d' }).problems.join(), /only \?seed= and \?devSpeed= \(has render\)/);
  assert.match(parse({ ...s, url: '/?seed=99&devSpeed=4' }).problems.join(), /url \?seed=1203/);
  assert.match(parse({ ...s, trace: 'docs/playtests/P1/none.zip' }).problems.join(), /trace/);
  assert.match(parse({ ...s, pageErrors: 2 }).problems.join(), /crashes = page errors \+ 5 s stalls/, 'the passive logger counts page errors as crashes');
  assert.deepEqual(parse({ ...s, pageErrors: 1, stalls: 1, crashes: 2 }).problems, []);
  const { url: _u, ...noUrl } = s;
  assert.match(parse(noUrl).problems.join(), /url/);
  assert.match(parse({ ...s, persona: 'speedrunner' }).problems.join(), /persona/);
  assert.match(parse({ ...s, devSpeed: 20 }).problems.join(), /devSpeed/);
  assert.match(parse({ ...s, report: 'docs/playtests/P1/none.md' }).problems.join(), /report/);
  assert.match(parse({ ...s, end: 'crash' }).problems.join(), /crashes ≥ 1/);
  const readme = read('docs/playtests/README.md');
  for (const p of PERSONAS) assert.ok(readme.includes(`\`${p}\``), `persona ${p} in docs/playtests/README.md`);
  assert.ok(readme.includes('`?seed=<integer>`') && readme.includes('`?devSpeed=<1–8>`'));
  const full = PERSONAS.flatMap((persona, k) => Array.from({ length: 5 }, (_, i) => ({ ...s, persona, session: k * 5 + i + 1 })));
  assert.deepEqual(playtestBlockers(full), [], '20 sessions, 5 per persona, no crash');
  assert.match(playtestBlockers(full.slice(1)).join(), /19 playtest sessions \(at least 20\)/);
  assert.match(playtestBlockers(full.slice(1)).join(), /4 first-timer sessions/);
  assert.match(playtestBlockers(full.map((x, i) => (i ? x : { ...x, crashes: 1, pageErrors: 1 }))).join(), /1 playtest crash/);
});

/**
 * A git checkout on master holding `files`, then on branch wp/T (agent 1234abcd in its STATUS.md).
 * @param {Record<string, string | object>} files
 */
function repo(files) {
  const r = tempRoot({ 'docs/wp/STATUS.md': 'Phase: **P0 — Foundations**\n\n| WP | branch | agent |\n| --- | --- | --- |\n| T | wp/T | 1234abcd |\n| U | wp/U | 2222bbbb |\n\n## Reviewers\n\n| agent | role |\n| --- | --- |\n| 72d20848 | reviewer |\n', ...files });
  const g = (/** @type {string[]} */ a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: r.root, stdio: 'ignore' });
  g(['init', '-q', '-b', 'master']);
  g(['add', '-A']);
  g(['commit', '-qm', 'master']);
  g(['checkout', '-q', '-b', 'wp/T']);
  return { ...r, commit: () => (g(['add', '-A']), g(['commit', '-qm', 'branch', '--allow-empty'])), head: () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: r.root, encoding: 'utf8' }).trim() };
}

/** The repo's band log with every line signed, and a bug ledger of one bug. */
const signedLog = () => read(BANDS_LOG).split('\n').filter(Boolean).map((l) => JSON.stringify({ ...JSON.parse(l), approvedBy: 'review:72d20848' })).join('\n') + '\n';
const BUG = JSON.stringify({ id: 'BUG-0001', severity: 'S3', status: 'open', title: 't', area: 'sim/x', rootCause: 'the cause', repro: 'r', foundBy: 'agent:x', links: [], phase: 'P0', opened: '2026-09-23' });

test('gate check ledgers: formats, and against master the ledgers only grow and the branch signs what it adds', () => {
  const r = repo({ 'docs/bugs.jsonl': `${BUG}\n`, [BANDS_LOG]: signedLog(), 'docs/quality/side-by-side.json': read('docs/quality/side-by-side.json'), 'docs/quality/scores.jsonl': '' });
  try {
    for (const p of JSON.parse(read('docs/quality/side-by-side.json')).pairs) r.put(p.source, 'jpg');
    r.commit();
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'branch', '-f', 'master', 'HEAD'], { cwd: r.root });
    assert.deepEqual(ledgersCheck(r.root).problems, []);
    const bug2 = BUG.replace('BUG-0001', 'BUG-0002');
    writeFileSync(join(r.root, 'docs/bugs.jsonl'), `${bug2}\n`);
    assert.match(ledgersCheck(r.root).problems.join(), /BUG-0001: removed/);
    writeFileSync(join(r.root, 'docs/bugs.jsonl'), `${BUG}\n${bug2}\n`);
    assert.deepEqual(ledgersCheck(r.root).problems, [], 'a new bug is fine');
    const log = read(BANDS_LOG).split('\n').filter(Boolean);
    const last = JSON.parse(/** @type {string} */ (log.at(-1)));
    writeFileSync(join(r.root, BANDS_LOG), `${signedLog()}${JSON.stringify({ ...last, reason: 'again', approvedBy: null })}\n`);
    assert.match(ledgersCheck(r.root).problems.join(), /needs an approver/, 'an unsigned band line');
    writeFileSync(join(r.root, BANDS_LOG), `${signedLog()}${JSON.stringify({ ...last, reason: 'again', approvedBy: 'review:1234abcd' })}\n`);
    assert.match(ledgersCheck(r.root).problems.join(), /branch's own agent/);
    writeFileSync(join(r.root, BANDS_LOG), `${signedLog()}${JSON.stringify({ ...last, reason: 'again', approvedBy: 'review:0badc0de' })}\n`);
    assert.match(ledgersCheck(r.root).problems.join(), /review:0badc0de is not a reviewer listed/, 'a builder signs with a made-up reviewer id');
    writeFileSync(join(r.root, BANDS_LOG), `${signedLog()}${JSON.stringify({ ...last, reason: 'again', approvedBy: 'review:2222bbbb' })}\n`);
    assert.match(ledgersCheck(r.root).problems.join(), /built a work package/);
    writeFileSync(join(r.root, BANDS_LOG), `${signedLog()}${JSON.stringify({ ...last, reason: 'again', approvedBy: 'integrator' })}\n`);
    assert.match(ledgersCheck(r.root).problems.join(), /'integrator' is no approver/, 'integrator is no approver at all');
    writeFileSync(join(r.root, BANDS_LOG), `${signedLog()}${JSON.stringify({ ...last, reason: 'again', approvedBy: 'review:72d20848' })}\n`);
    assert.deepEqual(ledgersCheck(r.root).problems, [], 'a listed reviewer');
    const closed = (/** @type {string} */ by) => JSON.stringify({ ...JSON.parse(BUG), severity: 'S2', status: 'wontfix', notes: 'by design', approvedBy: by });
    writeFileSync(join(r.root, 'docs/bugs.jsonl'), `${BUG}\n${closed('review:0badc0de').replace('BUG-0001', 'BUG-0003')}\n`);
    assert.match(ledgersCheck(r.root).problems.join(), /not a reviewer listed/, 'an S2 closed by a made-up reviewer');
    writeFileSync(join(r.root, 'docs/bugs.jsonl'), `${BUG}\n${closed('review:72d20848').replace('BUG-0001', 'BUG-0003')}\n`);
    assert.deepEqual(ledgersCheck(r.root).problems, []);
    writeFileSync(join(r.root, 'docs/bugs.jsonl'), `${BUG}\n`);
    writeFileSync(join(r.root, BANDS_LOG), `${signedLog()}${JSON.stringify({ ...last, min: last.min + 1, approvedBy: 'review:72d20848' })}\n`);
    assert.match(ledgersCheck(r.root).problems.join(), /bands\.mjs has/, 'the log and bands.mjs disagree');
    writeFileSync(join(r.root, BANDS_LOG), signedLog().split('\n').slice(1).join('\n'));
    assert.match(ledgersCheck(r.root).problems.join(), /append-only/, "master's band lines removed");
  } finally {
    r.done();
  }
});

test('gate checks rubric and release: nothing due at P0; release counts bugs, playtests, the balance run and the budgets run at HEAD', async () => {
  const r = repo({ 'docs/bugs.jsonl': `${BUG}\n`, 'docs/quality/side-by-side.json': read('docs/quality/side-by-side.json'), 'docs/quality/scores.jsonl': '' });
  try {
    for (const p of JSON.parse(read('docs/quality/side-by-side.json')).pairs) r.put(p.source, 'jpg');
    r.commit();
    assert.deepEqual(rubricCheck(r.root, 'P0').problems, [], 'no rubric at P0');
    assert.match(rubricCheck(r.root, 'P1').problems.join(), /match: no P1 score/);
    const head = r.head();
    const balance = { phase: 'P0', commit: head, seeds: 50, days: 100, sessions: 404, botSessions: 400, crashes: 0, roundTrips: { checked: 799, ok: 799, unchecked: 0 }, bands: [], bandsFailing: [] };
    r.put('docs/balance/P0.json', balance);
    r.put('test-results/budgets/last.json', { commit: head, dirty: false, ok: true, summary: 'all met' });
    const sessions = PERSONAS.flatMap((persona, k) => Array.from({ length: 5 }, (_, i) => JSON.stringify({ phase: 'P0', persona, session: k * 5 + i + 1, seed: 7, devSpeed: 1, commit: 'a1b2c3d', url: '/?seed=7', trace: 'docs/bugs.jsonl', character: 'wage', difficulty: 'normal', minutes: 60, days: 20, end: 'dead', crashes: 0, pageErrors: 0, stalls: 0, bugs: [], report: 'docs/bugs.jsonl' })));
    r.put('docs/playtests/P0/sessions.jsonl', `${sessions.join('\n')}\n`);
    assert.deepEqual(releaseCheck(r.root, 'P0').problems, [], 'every release criterion met');
    r.put('docs/bugs.jsonl', `${BUG.replace('"S3"', '"S2"')}\n`);
    assert.match(releaseCheck(r.root, 'P0').problems.join(), /1 open S2/);
    r.put('docs/bugs.jsonl', `${BUG}\n`);
    r.put('docs/balance/P0.json', { ...balance, botSessions: 150, crashes: 1, roundTrips: { checked: 10, ok: 9, unchecked: 1 }, bandsFailing: ['forager-gain-normal'] });
    const rel = releaseCheck(r.root, 'P0').problems.join();
    for (const want of [/150 bot sessions .* \(at least 200\)/, /1 bot crash/, /9\/10 round trips identical, 1 sessions unchecked/, /bands failing: forager-gain-normal/]) assert.match(rel, want);
    r.put('docs/balance/P0.json', balance);
    r.put('test-results/budgets/last.json', { commit: 'f'.repeat(40), dirty: false, ok: true, summary: 'all met' });
    assert.match(releaseCheck(r.root, 'P0').problems.join(), /last budgets run is not of this commit/);
    r.put('test-results/budgets/last.json', { commit: head, dirty: false, ok: false, summary: '7 of 9 budgets met' });
    assert.match(releaseCheck(r.root, 'P0').problems.join(), /budgets: 7 of 9/);
    r.put('docs/playtests/P0/sessions.jsonl', `${sessions.slice(1).join('\n')}\n`);
    assert.match(releaseCheck(r.root, 'P0').problems.join(), /19 playtest sessions/);
    const cli = await run(process.execPath, ['tools/balance/check.mjs', 'release', '--json', '--root', r.root, '--phase', 'P0'], { cwd: REPO }).catch((e) => e);
    assert.equal(cli.code, 1);
    assert.equal(JSON.parse(String(cli.stdout).trim()).ok, false);
    const status = await run(process.execPath, ['tools/balance/check.mjs', 'rubric', '--json', '--root', r.root], { cwd: REPO }).catch((e) => e);
    assert.equal(status.code ?? 0, 0, 'without --phase, rubric checks the STATUS.md phase (P0: nothing due)');
    assert.match(JSON.parse(String(status.stdout).trim()).summary, /^P0:/);
    const signoff = await run(process.execPath, ['tools/balance/check.mjs', 'rubric', '--json', '--root', r.root], { cwd: REPO, env: { ...process.env, GATE_PHASE: 'P1' } }).catch((e) => e);
    assert.equal(signoff.code, 1, 'GATE_PHASE=P1 (gate --signoff P1) judges P1 although STATUS.md says P0');
    assert.match(JSON.parse(String(signoff.stdout).trim()).summary, /^P1:/);
    const final = await run(process.execPath, ['tools/balance/check.mjs', 'release', '--json', '--root', r.root], { cwd: REPO, env: { ...process.env, GATE_PHASE: 'P5' } }).catch((e) => e);
    assert.match(JSON.parse(String(final.stdout).trim()).summary, /^P5:/, 'and --final (P5) judges the release');
    const usage = await run(process.execPath, ['tools/balance/check.mjs', 'rubric', '--phase', 'one', '--root', r.root], { cwd: REPO }).catch((e) => e);
    assert.equal(usage.code, 2, 'a bad --phase is a usage error');
  } finally {
    r.done();
  }
});

test('the approver roster: reviewers come from the Reviewers section of STATUS.md, never a builder', () => {
  const roster = parseRoster('| WP | agent |\n| --- | --- |\n| A | 1111aaaa |\n| B | 3333cccc |\n\n## Reviewers\n\n| agent | role |\n| --- | --- |\n| 72d20848 | reviewer (standards) |\n| 3333cccc | reviewer |\n| 4444dddd | builder |\n\n## Notes\n\n| 5555eeee | reviewer |\n');
  assert.deepEqual(roster.reviewers, ['72d20848'], '3333cccc builds B, 5555eeee is outside the section');
  assert.deepEqual([...roster.builders].sort(), ['1111aaaa', '3333cccc', '4444dddd', '5555eeee']);
  assert.equal(approverProblem('review:72d20848', '1111aaaa', roster), null);
  assert.match(String(approverProblem('review:0badc0de', '1111aaaa', roster)), /not a reviewer listed/);
  assert.match(String(approverProblem('review:3333cccc', '1111aaaa', roster)), /built a work package/);
  assert.match(String(approverProblem('integrator', '1111aaaa', roster)), /'integrator' is no approver/);
  assert.match(String(approverProblem('integrator', '1111aaaa', null)), /'integrator' is no approver/, 'not even in a format-only check');
  assert.match(String(approverProblem('review:abc', null, roster)), /8-hex/);
  const bullets = parseRoster('| WP | agent |\n| --- | --- |\n| A | 1111aaaa |\n\n## Reviewers\n\nApprovals are valid only from these ids.\n\n- **Reviewers:**\n  - 0340a9c5 (art: ART.md, shell)\n  - 72d20848 (quality standards)\n- **Builders (never approvers):** 831eaea5, 1519b40a,\n  1111aaaa.\n- **Integrator:** 0f6c2113.\n\n## Notes\n\n- 9999ffff reviewer notes\n');
  assert.deepEqual(bullets.reviewers, ['0340a9c5', '72d20848'], 'the registry format of docs/wp/STATUS.md');
  for (const id of ['831eaea5', '1519b40a', '1111aaaa', '0f6c2113']) assert.ok(bullets.builders.includes(id), `${id} never approves`);
  assert.match(String(approverProblem('review:0f6c2113', '1519b40a', bullets)), /built a work package/, 'the integrator is no reviewer');
  assert.match(String(approverProblem('review:9999ffff', '1519b40a', bullets)), /not a reviewer listed/, 'outside the registry');
});

test("the roster is master's: a branch that lists itself as a reviewer is still refused; no master, no approvals", () => {
  const status = (/** @type {string} */ reviewers) => `| WP | branch | agent |\n| --- | --- | --- |\n| T | wp/T | 1234abcd |\n\n## Reviewers\n\n- **Reviewers:**\n${reviewers}- **Builders (never approvers):** 1234abcd.\n`;
  const r = repo({ 'docs/wp/STATUS.md': status('  - 72d20848 (quality standards)\n') });
  try {
    writeFileSync(join(r.root, 'docs/wp/STATUS.md'), status('  - 72d20848 (quality standards)\n  - 0badc0de (added on the branch)\n'));
    r.commit();
    assert.deepEqual(readRoster(r.root).reviewers, ['72d20848'], "the branch's own STATUS.md is not read");
    assert.match(String(approverProblem('review:0badc0de', '1234abcd', readRoster(r.root))), /not a reviewer listed/);
    assert.equal(approverProblem('review:72d20848', '1234abcd', readRoster(r.root)), null);
  } finally {
    r.done();
  }
  const bare = tempRoot({ 'docs/wp/STATUS.md': status('  - 72d20848 (quality standards)\n') });
  try {
    const roster = readRoster(bare.root);
    assert.match(String(roster.problem), /cannot read/, 'no git, no master');
    assert.match(String(approverProblem('review:72d20848', null, roster)), /cannot read/, 'the working copy is never read instead');
  } finally {
    bare.done();
  }
});
