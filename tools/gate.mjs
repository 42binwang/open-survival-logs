#!/usr/bin/env node
// @ts-check
// The gate: runs the check registry (tools/gate/checks.mjs) and reports.
//   node tools/gate.mjs                every built check at full depth; pending checks are listed, not failed
//   node tools/gate.mjs --quick        the quick tier, run for every merge; pending checks are listed, not failed
//   node tools/gate.mjs --signoff P0   every check; one the phase requires fails the signoff when it fails or is pending
//   node tools/gate.mjs --final        every check must be built and pass
//   node tools/gate.mjs --status       phase, check states (last results) and ledgers; runs nothing
// Options: --only <id,id> (quick or full runs), --json (one JSON report on stdout), --verbose (full tool output).
// Exit code: 0 pass, 1 fail, 2 bad usage. Results are kept in test-results/gate/last.json for --status.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { CHECKS, gatePhase } from './gate/checks.mjs';
import { exec } from './gate/exec.mjs';
import { ledgers, phase } from './gate/ledgers.mjs';
import { ROOT, currentBranch, devPort } from './gate/port.mjs';

const RESULTS = join(ROOT, 'test-results', 'gate', 'last.json');
/** @type {Record<string, string>} */
const MARK = { pass: '✔', fail: '✖', pending: '○', skipped: '–', ready: '·' };

/** @param {string} msg @returns {never} */
function usage(msg) {
  console.error(`gate: ${msg}\nusage: node tools/gate.mjs [--quick | --signoff P<n> | --final | --status] [--only <id,id>] [--json] [--verbose]`);
  process.exit(2);
}

/** @type {{ quick?: boolean, status?: boolean, signoff?: string, final?: boolean, only?: string, json?: boolean, verbose?: boolean, help?: boolean }} */
let args = {};
try {
  args = parseArgs({
    options: {
      quick: { type: 'boolean' },
      status: { type: 'boolean' },
      signoff: { type: 'string' },
      final: { type: 'boolean' },
      only: { type: 'string' },
      json: { type: 'boolean' },
      verbose: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  }).values;
} catch (err) {
  usage(/** @type {Error} */ (err).message);
}
if (args.help) {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(2, 11).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(0);
}
if (['quick', 'status', 'signoff', 'final'].filter((k) => /** @type {any} */ (args)[k]).length > 1) usage('pick one of --quick, --signoff, --final, --status');
const signoff = args.signoff == null ? null : Number(/^P(\d+)$/i.exec(args.signoff)?.[1] ?? NaN);
if (Number.isNaN(signoff)) usage(`--signoff takes a phase such as P0, not '${args.signoff}'`);
if (args.only && (signoff != null || args.final || args.status)) usage('--only works with --quick or a full run, not with a signoff, --final or --status');
const only = args.only ? args.only.split(',').map((s) => s.trim()) : null;
const unknown = only?.filter((id) => !CHECKS.some((c) => c.id === id));
if (unknown?.length) usage(`no such check: ${unknown.join(', ')} (have ${CHECKS.map((c) => c.id).join(', ')})`);

const git = async (/** @type {string[]} */ a) => (await exec('git', a)).stdout.trim();
const commit = (await git(['rev-parse', '--short', 'HEAD'])) || '?';
const dirty = (await git(['status', '--porcelain'])) !== '';
const branch = currentBranch() || '?';
const ph = phase();
const phaseText = ph ? `${ph.id} ${ph.name}` : 'phase unknown';
const where = `${branch} @ ${commit}${dirty ? ' (uncommitted changes)' : ''}`;
const secs = (/** @type {number} */ ms) => `${(ms / 1000).toFixed(1)} s`;
const idWidth = Math.max(...CHECKS.map((c) => c.id.length)) + 2;
/** local "YYYY-MM-DD HH:MM" of an ISO time */
const when = (/** @type {string} */ iso) => new Date(iso).toLocaleString('sv-SE').slice(0, 16);

/** @returns {Record<string, { state: string, summary: string, at: string, commit: string, dirty: boolean, mode: string }>} */
function lastResults() {
  try {
    return JSON.parse(readFileSync(RESULTS, 'utf8'));
  } catch {
    return {};
  }
}

// ------------------------------------------------------------------------------------------ --status
if (args.status) {
  const last = lastResults();
  const port = devPort();
  const rows = CHECKS.map((c) => {
    const pending = c.pending();
    const r = last[c.id];
    const stale = r && (r.commit !== commit || r.dirty || dirty);
    const state = pending ? 'pending' : r ? r.state : 'ready';
    const detail = pending ? pending : r ? `${r.summary} · ${when(r.at)} @${r.commit}${r.dirty ? '+' : ''} ${r.mode}${stale ? ' (stale)' : ''}` : 'built, not run yet';
    return { id: c.id, title: c.title, owner: c.owner, requiredFrom: c.requiredFrom, quick: c.quick, state, detail };
  });
  const required = (/** @type {number} */ n) => rows.filter((r) => r.requiredFrom <= n);
  const current = ph ? Number(ph.id.slice(1)) : 0;
  const need = required(current);
  const notReady = need.filter((r) => r.state !== 'pass');
  if (args.json) {
    console.log(JSON.stringify({ phase: ph, branch, commit, dirty, port: port.port, checks: rows, ledgers: ledgers() }, null, 2));
    process.exit(0);
  }
  console.log(`Survival Log gate: status\nPhase     ${ph ? `${ph.id} — ${ph.name}` : 'unknown'} (docs/wp/STATUS.md)\nCheckout  ${where}; dev server port ${port.port} (${port.why})\n`);
  console.log('Checks (state, then the last result)');
  for (const r of rows) console.log(`  ${MARK[r.state] || '?'} ${r.id.padEnd(idWidth)}${r.state.padEnd(9)}${r.detail}`);
  console.log(
    `\nSignoff ${ph?.id ?? 'P0'} requires ${need.length} checks: ${need.length - notReady.length} passing at their last run${
      notReady.length ? `; not yet: ${notReady.map((r) => `${r.id} (${r.state})`).join(', ')}` : ''
    }`
  );
  console.log('\nLedgers');
  for (const l of ledgers()) console.log(`  ${l.ledger.padEnd(28)}${l.state}`);
  process.exit(0);
}

// ------------------------------------------------------------------------------------------ runs
const modeName = args.quick ? 'quick' : args.final ? 'final' : signoff != null ? `signoff P${signoff}` : 'full';
// the phase checks judge by (coverage prints before P3 and requires 100% from P3): the signoff's, else the current one
const runPhase = gatePhase({ signoff, final: !!args.final }, ph);
const log = (/** @type {string} */ s) => !args.json && console.log(s);
log(`gate ${modeName} · ${phaseText} · ${where}`);

/** @typedef {{ id: string, title: string, owner: string, requiredFrom: number, state: string, summary: string, output?: string, ms?: number }} Row */
/** @type {Row[]} */
const rows = [];
const t0 = performance.now();
for (const c of CHECKS) {
  if (only && !only.includes(c.id)) continue;
  const meta = { id: c.id, title: c.title, owner: c.owner, requiredFrom: c.requiredFrom };
  const pending = c.pending();
  /** @type {Row} */
  let row;
  if (pending) row = { ...meta, state: 'pending', summary: pending };
  else if (args.quick && !c.quick) row = { ...meta, state: 'skipped', summary: 'not in --quick' };
  else if (c.finalOnly && !args.final && !(signoff != null && signoff >= c.requiredFrom)) row = { ...meta, state: 'skipped', summary: `only for --final and the P${c.requiredFrom} signoff` };
  else {
    const start = performance.now();
    try {
      row = { ...meta, ...(await c.run({ quick: !!args.quick, phase: runPhase })) };
    } catch (err) {
      row = { ...meta, state: 'fail', summary: `the check crashed: ${/** @type {Error} */ (err).message}`, output: /** @type {Error} */ (err).stack };
    }
    row.ms = performance.now() - start;
  }
  rows.push(row);
  const time = row.ms != null ? `  (${secs(row.ms)})` : '';
  log(`  ${MARK[row.state]} ${c.id.padEnd(idWidth)}${row.state === 'pass' || row.state === 'fail' ? '' : `${row.state}: `}${row.summary}${time}`);
  if (row.output && (row.state === 'fail' || args.verbose)) log(row.output.replace(/^/gm, '      '));
}

// verdict
const needed = (/** @type {Row} */ r) => (args.final ? true : signoff != null ? r.requiredFrom <= signoff : false);
const blocking = rows.filter((r) => r.state === 'fail' || (needed(r) && r.state !== 'pass'));
const advisory = signoff != null ? rows.filter((r) => !needed(r) && r.state === 'fail') : [];
const ok = blocking.length === 0;
const count = (/** @type {string} */ s) => rows.filter((r) => r.state === s).length;
const tally = `${count('pass')} passed, ${count('fail')} failed, ${count('pending')} pending${count('skipped') ? `, ${count('skipped')} skipped` : ''}`;
const why = ok ? '' : ` — ${blocking.map((r) => `${r.id} ${r.state}`).join(', ')}`;
log(`${ok ? 'PASS' : 'FAIL'} ${modeName}: ${tally} (${secs(performance.now() - t0)})${why}${advisory.length ? `; advisory failures: ${advisory.map((r) => r.id).join(', ')}` : ''}`);

// remember the results for --status
const last = lastResults();
const at = new Date().toISOString();
for (const r of rows) if (r.state === 'pass' || r.state === 'fail') last[r.id] = { state: r.state, summary: r.summary, at, commit, dirty, mode: modeName };
mkdirSync(dirname(RESULTS), { recursive: true });
writeFileSync(RESULTS, `${JSON.stringify(last, null, 2)}\n`);
if (args.json) console.log(JSON.stringify({ mode: modeName, phase: ph, branch, commit, dirty, ok, checks: rows }, null, 2));
if (!existsSync(RESULTS)) console.error('gate: could not record results');
process.exit(ok ? 0 : 1);
