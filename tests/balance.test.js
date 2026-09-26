// @ts-check
// Balance (tools/balance/): the bands against docs/BALANCE.md, short sessions of the bots on the real sim with their
// save/load round trips, the aggregation against the bands, and the CLI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { BANDS, MIN_RUNS, evaluateBands } from '../tools/balance/bands.mjs';
import { runSession } from '../tools/balance/session.mjs';
import { aggregate, markdown, summarize } from '../tools/balance/report.mjs';
import { tempRoot } from './visual/fixtures.mjs';

const run = promisify(execFile);
const REPO = new URL('..', import.meta.url).pathname;

test('the bands of tools/balance/bands.mjs are the table of docs/BALANCE.md, each with a source that exists', () => {
  const md = readFileSync(join(REPO, 'docs/BALANCE.md'), 'utf8');
  const at = md.indexOf('## Bands');
  const rows = md
    .slice(at)
    .split('\n')
    .filter((l) => /^\| `[A-Za-z0-9-]+` \|/.test(l))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
  const range = (/** @type {number} */ min, /** @type {number} */ max) => `${min} – ${Number.isFinite(max) ? max : '∞'}`;
  const fromDoc = rows.map(([id, from, band, source]) => `${id.replace(/`/g, '')} ${from} ${band} ${source}`);
  const fromCode = BANDS.map((b) => `${b.id} ${b.from} ${range(b.min, b.max)} ${b.source}`);
  assert.deepEqual(fromDoc, fromCode);
  for (const b of BANDS) {
    if (/^decided \(WP-P0-11\): .{30,}/.test(b.source)) continue;
    // a public page (the Steam guides, news and achievement stats) is cited by its URL
    if (/^https:\/\/(steamcommunity\.com|store\.steampowered\.com)\/\S+$/.test(b.source.split('; ')[0])) continue;
    const m = /^(src\/[^: ]+|docs\/[^: ]+)/.exec(b.source);
    assert.ok(m, `${b.id}: the source names a file, or says 'decided (WP-P0-11): <reason>' (${b.source})`);
    const file = /** @type {RegExpExecArray} */ (m)[1];
    assert.ok(readFileSync(join(REPO, file), 'utf8').length > 0, `${b.id}: ${file} exists`);
    const line = /:(\d+)/.exec(b.source);
    if (line) assert.ok(readFileSync(join(REPO, file), 'utf8').split('\n').length >= Number(line[1]), `${b.id}: ${b.source} is a line of ${file}`);
  }
  assert.equal(new Set(BANDS.map((b) => b.id)).size, BANDS.length, 'band ids are unique');
});

test('a short prepper session shops, stores food, and its save/load round trip holds', async () => {
  const r = await runSession({ bot: 'prepper', difficulty: 'normal', seed: 5, days: 2 });
  assert.equal(r.crash, null);
  assert.equal(r.end, 'alive');
  assert.equal(r.days, 2);
  assert.ok(r.roundTrips.length >= 1 && r.roundTrips.every((t) => t.ok), JSON.stringify(r.roundTrips));
  assert.ok(r.foodSat[0] > 400, `food at home on Day 1: ${r.foodSat[0]}`);
  assert.ok(Number(r.botNotes.trips) >= 1 && Number(r.botNotes.spent) > 0, JSON.stringify(r.botNotes));
});

test('an idle session starves within the first week', async () => {
  const r = await runSession({ bot: 'idle', difficulty: 'normal', seed: 5, days: 10 });
  assert.equal(r.end, 'dead');
  assert.equal(r.cause, 'starvation');
  assert.ok(r.days >= 2 && r.days <= 6, `${r.days}`);
});

/** @param {boolean} survived @param {number} day */
const horde = (day, survived) => ({ day, total: 28, killed: survived ? 28 : 10, breaches: survived ? 0 : 2, doorMin: 0.5, survived, final: false });
/** @param {Partial<import('../tools/balance/session.mjs').SessionResult>} o @returns {import('../tools/balance/session.mjs').SessionResult} */
const session = (o) => ({ bot: 'prepper', difficulty: 'normal', seed: 1, character: 'wage', days: 30, end: 'dead', cause: 'starvation', foodSat: [1100, 1060, 1020], hordes: [horde(7, true), horde(15, true), horde(25, true)], points: 700, roundTrips: [{ at: 'Day 5', ok: true, detail: '' }], coldWave: null, crash: null, ms: 1, botNotes: {}, ...o });
/** @param {number} n @param {Partial<import('../tools/balance/session.mjs').SessionResult>} o */
const many = (n, o) => Array.from({ length: n }, (_, i) => session({ seed: i + 1, ...o }));
/** @param {ReturnType<typeof aggregate>} a @param {string} id */
const bandOf = (a, id) => /** @type {any} */ (a.bands.find((b) => b.id === id));

test('bands: inside holds, outside fails, too few runs is unmeasured; a band is required from its phase on', () => {
  const inside = aggregate(many(MIN_RUNS + 2, {}), 'P0');
  assert.equal(bandOf(inside, 'prepper-horde25-normal').state, 'inside', 'every run survives the Day 25 horde (band ≥ 0.9)');
  const lost = aggregate(many(MIN_RUNS + 2, { hordes: [horde(7, true), horde(15, true), horde(25, false)], days: 25, cause: 'zombies' }), 'P0');
  assert.equal(bandOf(lost, 'prepper-horde25-normal').state, 'outside');
  const few = aggregate(many(MIN_RUNS - 1, {}), 'P0');
  assert.equal(bandOf(few, 'prepper-horde25-normal').state, 'unmeasured', `${MIN_RUNS - 1} runs are too few`);
  assert.equal(bandOf(inside, 'prepper-horde25-hard').state, 'unmeasured', 'no Hard sessions');
  assert.equal(bandOf(inside, 'prepper-horde25-hard').required, true);
  assert.equal(bandOf(inside, 'defender-horde25-normal').required, false, 'the defender bands start at P1');
  const p1 = aggregate(many(MIN_RUNS + 2, {}), 'P1');
  const d = bandOf(p1, 'defender-horde25-normal');
  assert.deepEqual([d.state, d.required], ['unmeasured', true], 'at P1 an unplayed strategy fails as unmeasured');
  assert.match(d.detail, /no defender sessions/);
});

test('bands anchored to relations: the difficulty order needs a 2-day gap, the forager must gain on the prepper', () => {
  const at = (/** @type {string} */ bot, /** @type {Record<string, number>} */ days) => Object.entries(days).flatMap(([difficulty, d]) => many(MIN_RUNS, { bot, difficulty, days: d }));
  const ordered = aggregate(at('prepper', { relaxed: 40, normal: 36, hard: 32, outOfAmmo: 29 }), 'P0');
  assert.equal(bandOf(ordered, 'prepper-difficulty-order').state, 'inside', 'gaps 4, 4, 3');
  const flat = aggregate(at('prepper', { relaxed: 40, normal: 39, hard: 32, outOfAmmo: 29 }), 'P0');
  assert.equal(bandOf(flat, 'prepper-difficulty-order').state, 'outside', 'Relaxed only 1 day over Normal');
  const both = aggregate([...at('prepper', { normal: 30 }), ...at('forager', { normal: 36 })], 'P0');
  assert.equal(bandOf(both, 'forager-gain-normal').state, 'inside', '+6 days');
  const none = aggregate([...at('prepper', { normal: 30 }), ...at('forager', { normal: 30 })], 'P0');
  assert.equal(bandOf(none, 'forager-gain-normal').state, 'outside', '+0 days is under +2');
  const toomuch = aggregate([...at('prepper', { normal: 30 }), ...at('forager', { normal: 50 })], 'P0');
  assert.equal(bandOf(toomuch, 'forager-gain-normal').state, 'outside', '+20 days is over +14');
});

test('aggregation: crashes and failed round trips are counted; the report marks failing bands', () => {
  const broken = aggregate([session({ end: 'crash', crash: 'TypeError: x' }), session({ seed: 2, roundTrips: [{ at: 'Day 5', ok: false, detail: 'differs' }] }), session({ seed: 3, roundTrips: [] })]);
  assert.equal(broken.crashes.length, 1);
  assert.equal(broken.roundTrips.failed.length, 1);
  assert.equal(broken.roundTrips.unchecked.length, 1);
  const md = markdown(broken, { phase: 'P0', command: 'x', when: '2026-09-23', where: 'w', sessions: 3, workers: 1, secs: 1, seeds: 3, days: 100 });
  assert.match(md, /\| crashes .* \| 1 in 3 sessions \|/);
  assert.match(md, /Round trips that differ/);
  assert.match(md, /✖ unmeasured/);
  assert.equal(evaluateBands({ prepper: { normal: summarize(many(MIN_RUNS, {})) } }, 'P0').find((b) => b.id === 'prepper-horde25-normal')?.state, 'inside');
});

test('balance CLI: a quick run writes its report and fails on the bands it cannot measure; bad arguments exit 2', async () => {
  const r = tempRoot({});
  try {
    const out = join(r.root, 'report.md');
    const quick = await run(process.execPath, ['tools/balance/run.mjs', '--seeds', '1', '--bots', 'idle', '--difficulties', 'normal', '--days', '3', '--out', out, '--json'], { cwd: REPO }).catch((e) => e);
    const j = JSON.parse(String(quick.stdout).trim().split('\n').at(-1) || '{}');
    assert.equal(quick.code, 1, 'one seed measures no band: the run fails');
    assert.equal(j.ok, false);
    assert.ok(j.problems.some((/** @type {string} */ p) => /^band prepper-horde25-normal: unmeasured/.test(p)), 'a bot that did not play leaves its bands unmeasured');
    assert.ok(!j.problems.some((/** @type {string} */ p) => /crash|round trip/.test(p)), 'no crash, every round trip identical');
    assert.match(readFileSync(out, 'utf8'), /# Balance report — P0/);
    const facts = JSON.parse(readFileSync(join(r.root, 'report.json'), 'utf8'));
    assert.deepEqual([facts.phase, facts.crashes, facts.roundTrips.ok === facts.roundTrips.checked], ['P0', 0, true]);
    assert.ok(facts.bandsFailing.includes('prepper-horde25-normal'));
    const p1 = await run(process.execPath, ['tools/balance/run.mjs', '--seeds', '1', '--bots', 'idle', '--difficulties', 'normal', '--days', '3', '--out', '-', '--json'], { cwd: REPO, env: { ...process.env, GATE_PHASE: 'P1' } }).catch((e) => e);
    const j1 = JSON.parse(String(p1.stdout).trim().split('\n').at(-1) || '{}');
    assert.ok(j1.problems.some((/** @type {string} */ p) => /^band defender-horde25-normal: unmeasured/.test(p)), 'GATE_PHASE=P1 requires the P1 bands');
    const bad = await run(process.execPath, ['tools/balance/run.mjs', '--seeds', '0'], { cwd: REPO }).catch((e) => e);
    assert.equal(bad.code, 2);
    const nobot = await run(process.execPath, ['tools/balance/run.mjs', '--seeds', '1', '--bots', 'wizard'], { cwd: REPO }).catch((e) => e);
    assert.equal(nobot.code, 2);
  } finally {
    r.done();
  }
});
