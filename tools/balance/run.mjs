#!/usr/bin/env node
// @ts-check
// Balance runs: headless bots (tools/balance/bots.mjs) play the real sim, `--seeds` seeds per difficulty and bot
// (one for a bot whose outcome does not depend on the seed), each session in a fresh worker thread; the report
// compares what they reach with the bands of docs/BALANCE.md and counts crashes and save/load round trips (the
// release criteria of docs/QUALITY.md).
//   node tools/balance/run.mjs --seeds 50                 every bot on every difficulty, writes docs/balance/P0.md
//   node tools/balance/run.mjs --seeds 5 --bots prepper --difficulties normal --out -   a quick look, report on stdout
// Options: --days <n> (default 100), --workers <n>, --phase P<n> (the report's name; default GATE_PHASE, else the STATUS.md phase),
// --json (one line { ok, summary, problems }).
// Exit code: 0 when no session crashed, every round trip was identical and every band the phase requires holds; 1
// when a band is outside or unmeasured (its bot did not play, too few runs reached the event), a session crashed or
// a round trip differed; 2 bad usage.
import { mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Worker } from 'node:worker_threads';
import { execFileSync } from 'node:child_process';
import { DIFFICULTIES } from './bands.mjs';
import { BOTS } from './bots.mjs';
import { aggregate, markdown } from './report.mjs';
import { phase as statusPhase } from '../gate/ledgers.mjs';
import { gatePhase } from './git.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const USAGE = 'usage: node tools/balance/run.mjs --seeds <n> [--bots idle,prepper,forager] [--difficulties relaxed,normal,hard,outOfAmmo] [--days 100] [--workers <n>] [--phase P0] [--out <file>|-] [--json]';

/** @param {string} msg @returns {never} */
function usage(msg) {
  console.error(`balance: ${msg}\n${USAGE}`);
  process.exit(2);
}

/** @type {Record<string, string | boolean | undefined>} */
let a = {};
try {
  a = parseArgs({
    options: {
      seeds: { type: 'string' },
      bots: { type: 'string' },
      difficulties: { type: 'string' },
      days: { type: 'string', default: '100' },
      workers: { type: 'string' },
      phase: { type: 'string' },
      out: { type: 'string' },
      json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  }).values;
} catch (err) {
  usage(/** @type {Error} */ (err).message);
}
if (a.help) {
  console.log(USAGE);
  process.exit(0);
}
const seeds = Number(a.seeds);
if (!Number.isInteger(seeds) || seeds < 1) usage('--seeds takes a positive integer');
const days = Number(a.days);
if (!Number.isInteger(days) || days < 1) usage('--days takes a positive integer');
const bots = a.bots ? String(a.bots).split(',') : Object.keys(BOTS);
const badBot = bots.filter((b) => !(b in BOTS));
if (badBot.length) usage(`no bot ${badBot.join(', ')} (have ${Object.keys(BOTS).join(', ')})`);
const diffs = a.difficulties ? String(a.difficulties).split(',') : [...DIFFICULTIES];
const badDiff = diffs.filter((d) => !DIFFICULTIES.includes(d));
if (badDiff.length) usage(`no difficulty ${badDiff.join(', ')} (have ${DIFFICULTIES.join(', ')})`);
const workers = a.workers ? Number(a.workers) : Math.max(1, Math.min(16, availableParallelism() - 2));
if (!Number.isInteger(workers) || workers < 1) usage('--workers takes a positive integer');
const phaseId = typeof a.phase === 'string' ? a.phase : gatePhase() || statusPhase()?.id || 'P0';
if (!/^P\d+$/.test(phaseId)) usage('--phase takes P<n>');
const outFile = a.out === '-' ? null : resolve(REPO, typeof a.out === 'string' ? a.out : join('docs', 'balance', `${phaseId}.md`));
const log = (/** @type {string} */ s) => !a.json && console.error(s);

/** @type {{ bot: string, difficulty: string, seed: number, days: number }[]} */
const jobs = [];
for (const bot of bots) {
  const n = /** @type {any} */ (BOTS)[bot].oneSeed ? 1 : seeds;
  for (const difficulty of diffs) for (let s = 1; s <= n; s++) jobs.push({ bot, difficulty, seed: s * 1009 + 17, days });
}

const t0 = performance.now();
/** @type {import('./session.mjs').SessionResult[]} */
const sessions = [];
let next = 0;
let done = 0;
await new Promise((finish) => {
  const launch = () => {
    if (next >= jobs.length) {
      if (done === jobs.length) finish(undefined);
      return;
    }
    const job = jobs[next++];
    const w = new Worker(new URL('./worker.mjs', import.meta.url), { workerData: job });
    let got = false;
    w.once('message', (r) => {
      got = true;
      sessions.push(r);
    });
    w.once('error', (err) => {
      got = true;
      sessions.push({ ...job, character: 'wage', days: 0, end: 'crash', cause: null, foodSat: [], hordes: [], points: 0, roundTrips: [], coldWave: null, crash: String(err.stack || err).split('\n').slice(0, 6).join('\n'), ms: 0, botNotes: {} });
    });
    w.once('exit', (code) => {
      if (!got) sessions.push({ ...job, character: 'wage', days: 0, end: 'crash', cause: null, foodSat: [], hordes: [], points: 0, roundTrips: [], coldWave: null, crash: `the worker exited with code ${code} before reporting`, ms: 0, botNotes: {} });
      done++;
      if (done % 50 === 0 || done === jobs.length) log(`balance: ${done}/${jobs.length} sessions`);
      launch();
    });
  };
  for (let i = 0; i < Math.min(workers, jobs.length); i++) launch();
});
const secs = (performance.now() - t0) / 1000;
sessions.sort((x, y) => x.bot.localeCompare(y.bot) || diffs.indexOf(x.difficulty) - diffs.indexOf(y.difficulty) || x.seed - y.seed);

const agg = aggregate(sessions, phaseId);
let where = '?';
try {
  const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
  const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
  where = `${branch} @ ${commit}`;
} catch {}
const command = `node tools/balance/run.mjs --seeds ${seeds}${a.bots ? ` --bots ${a.bots}` : ''}${a.difficulties ? ` --difficulties ${a.difficulties}` : ''}${days !== 100 ? ` --days ${days}` : ''}`;
const md = markdown(agg, { phase: phaseId, command, when: new Date().toISOString().slice(0, 10), where, sessions: sessions.length, workers, secs, seeds, days });
const failingIds = agg.bands.filter((b) => b.required && b.state !== 'inside').map((b) => b.id);
if (outFile) {
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, md);
  // what tools/balance/check.mjs release reads: the run's commit, its sessions, crashes, round trips and failing bands
  const summaryFile = outFile.replace(/\.md$/, '') + '.json';
  const commitFull = (() => {
    try {
      return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
    } catch {
      return '?';
    }
  })();
  const summaryJson = {
    phase: phaseId,
    commit: commitFull,
    seeds,
    days,
    sessions: sessions.length,
    botSessions: sessions.filter((x) => !(/** @type {any} */ (BOTS)[x.bot]?.oneSeed)).length,
    crashes: agg.crashes.length,
    roundTrips: { checked: agg.roundTrips.checked, ok: agg.roundTrips.ok, unchecked: agg.roundTrips.unchecked.length },
    bands: agg.bands.map(({ id, state, required, value }) => ({ id, state, required, value })),
    bandsFailing: failingIds,
  };
  writeFileSync(summaryFile, `${JSON.stringify(summaryJson, null, 2)}\n`);
  mkdirSync(join(REPO, 'test-results'), { recursive: true });
  writeFileSync(join(REPO, 'test-results', 'balance-last.json'), JSON.stringify({ sessions }, null, 0));
} else if (!a.json) process.stdout.write(md);

const failing = agg.bands.filter((b) => b.required && b.state !== 'inside');
const problems = [
  ...failing.map((b) => `band ${b.id}: ${b.state}${b.value == null ? '' : ` ${Math.round(b.value * 1000) / 1000}`} (band ${b.min}–${b.max}; ${b.detail}; ${b.source})`),
  ...agg.crashes.map((c) => `crash: ${c.bot} ${c.difficulty} seed ${c.seed}: ${(c.crash || '').split('\n')[0]}`),
  ...agg.roundTrips.failed.map((r) => `round trip: ${r.bot} ${r.difficulty} seed ${r.seed} at ${r.at}: ${r.detail}`),
  ...agg.roundTrips.unchecked.map((r) => `round trip: ${r.bot} ${r.difficulty} seed ${r.seed} ended before any save/load check`),
];
const required = agg.bands.filter((b) => b.required).length;
const summary = `${sessions.length} sessions in ${secs.toFixed(0)} s: ${agg.crashes.length} crashes, ${agg.roundTrips.ok}/${agg.roundTrips.checked} round trips identical, ${required - failing.length}/${required} ${phaseId} bands hold${failing.length ? ` (failing: ${failing.map((b) => b.id).join(', ')})` : ''}${outFile ? `; ${outFile.slice(REPO.length)}` : ''}`;
if (a.json) console.log(JSON.stringify({ ok: problems.length === 0, summary, problems }));
else log(`balance: ${summary}`);
process.exit(problems.length ? 1 : 0);
