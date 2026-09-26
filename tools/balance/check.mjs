#!/usr/bin/env node
// @ts-check
// The quality ledgers as gate checks (docs/QUALITY.md §3, §5, §6):
//   node tools/balance/check.mjs ledgers [--json]            formats of docs/bugs.jsonl, docs/quality/scores.jsonl,
//        docs/playtests/*/sessions.jsonl and docs/balance/bands-log.jsonl; what changed against master may (bugs only
//        in status, fix, links and notes, severity with an approved history; the other three append-only); the band
//        log agrees with tools/balance/bands.mjs and every line the branch adds has an approver
//   node tools/balance/check.mjs rubric [--phase P<n>] [--json] every axis and due side-by-side pair ≥ 4 in the phase
//        (default: the docs/wp/STATUS.md phase), none below its earlier best
//   node tools/balance/check.mjs release [--phase P<n>] [--json]  (default phase: STATUS.md) no open S1 or S2, at most 20 open S3; the phase's
//        playtests (≥ 20 sessions, ≥ 5 per persona, 0 crashes); its balance run (≥ 200 bot sessions, 0 crashes, every
//        round trip identical, every band held, not older than the sim); the budgets at this commit met
//   node tools/balance/check.mjs log-bands --reason "<why>" [--by <approver>]
//        appends a band-log line for every band of bands.mjs that differs from its last logged value
//   node tools/balance/check.mjs sign-bands --by review:<id> [--ids a,b]   signs the branch's unsigned
//        band-log lines (only those bands with --ids)
// Options: --root <dir> (another checkout: the fixture tests). Exit code: 0 pass, 1 fail, 2 bad usage.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { BANDS } from './bands.mjs';
import { BUGS_FILE, bugChanges, openBySeverity, parseBugs, parseSessions, playtestBlockers } from './ledgers.mjs';
import { agentOf, appended, approverProblem, baseCommit, branchOf, fileAt, gatePhase, readRoster } from './git.mjs';
import { SCORES_FILE, readScores, signoffProblems } from '../art-metrics/scores.mjs';
import { phase as statusPhase } from '../gate/ledgers.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
export const BANDS_LOG = 'docs/balance/bands-log.jsonl';
const USAGE = 'usage: node tools/balance/check.mjs <ledgers|rubric|release|log-bands|sign-bands> [--phase P<n>] [--reason <why>] [--by <approver>] [--ids a,b] [--root <dir>] [--json]';

/** @param {string} msg @returns {never} */
function usage(msg) {
  console.error(`check: ${msg}\n${USAGE}`);
  process.exit(2);
}

/** A band's value as the log writes it (∞ as null). @param {{ min: number, max: number, source: string }} b */
const logged = (b) => ({ min: b.min, max: b.max === Infinity ? null : b.max, source: b.source });

/**
 * @param {string} root
 * @returns {{ lines: any[], problems: string[] }}
 */
function readBandLog(root) {
  const file = join(root, BANDS_LOG);
  if (!existsSync(file)) return { lines: [], problems: [`${BANDS_LOG} is missing`] };
  /** @type {any[]} */
  const lines = [];
  /** @type {string[]} */
  const problems = [];
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((raw, i) => {
      if (!raw.trim()) return;
      try {
        const l = JSON.parse(raw);
        if (typeof l.id !== 'string' || typeof l.min !== 'number' || !(typeof l.max === 'number' || l.max === null) || typeof l.source !== 'string' || typeof l.reason !== 'string' || !l.reason.trim()) throw new Error('needs id, min, max, source and reason');
        lines.push(l);
      } catch (err) {
        problems.push(`${BANDS_LOG}:${i + 1}: ${/** @type {Error} */ (err).message}`);
      }
    });
  return { lines, problems };
}

/**
 * The band log agrees with bands.mjs, only grows against master, and the branch signed every line it added.
 * @param {string} root
 * @param {string} base
 * @param {string | null} agent
 */
export function bandLogProblems(root, base, agent) {
  const { lines, problems } = readBandLog(root);
  /** @type {Map<string, any>} */
  const last = new Map();
  for (const l of lines) last.set(l.id, l);
  for (const b of BANDS) {
    const l = last.get(b.id);
    const want = logged(b);
    if (!l) problems.push(`band ${b.id}: not in ${BANDS_LOG} (a band enters with a logged, approved line)`);
    else if (l.min !== want.min || l.max !== want.max || l.source !== want.source) problems.push(`band ${b.id}: bands.mjs has ${want.min}–${want.max ?? '∞'} (${want.source}), the log last approved ${l.min}–${l.max ?? '∞'} (${l.source})`);
  }
  if (existsSync(join(root, BANDS_LOG))) {
    const now = readFileSync(join(root, BANDS_LOG), 'utf8');
    const a = appended(fileAt(root, base, BANDS_LOG), now, BANDS_LOG);
    problems.push(...a.problems);
    for (const raw of a.added) {
      let l;
      try {
        l = JSON.parse(raw);
      } catch {
        continue;
      }
      const why = approverProblem(l.approvedBy, agent, readRoster(root));
      if (why) problems.push(`${BANDS_LOG}: the line for ${l.id} added on this branch needs an approver (${why}); node tools/balance/check.mjs sign-bands --by review:<id>`);
    }
  }
  return problems;
}

/**
 * The phase a gate run judges (GATE_PHASE, set by `gate --signoff`), else the one docs/wp/STATUS.md of a checkout names (`Phase: **P<n> — …**`), P0 when it names none: the phase a
 * signoff run checks.
 * @param {string} root
 */
export function phaseOf(root) {
  const g = gatePhase();
  if (g) return g;
  if (root === REPO) return statusPhase()?.id || 'P0';
  const file = join(root, 'docs/wp/STATUS.md');
  const m = existsSync(file) ? /^Phase:\s*\*\*(P\d+)/m.exec(readFileSync(file, 'utf8')) : null;
  return m ? m[1] : 'P0';
}

/** Every sessions.jsonl of the playtest phases. @param {string} root */
function sessionFiles(root) {
  const dir = join(root, 'docs/playtests');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^P\d+$/.test(e.name) && existsSync(join(dir, e.name, 'sessions.jsonl')))
    .map((e) => `docs/playtests/${e.name}/sessions.jsonl`);
}

/** @param {string} root */
function context(root) {
  const branch = branchOf(root) || '?';
  const agent = agentOf(root, branch);
  const base = baseCommit(root);
  /** @type {Set<string>} */
  let tracked = new Set();
  try {
    tracked = new Set(execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n'));
  } catch {}
  const roster = readRoster(root);
  return { branch, agent, base, committed: (/** @type {string} */ p) => tracked.has(p), builders: roster.builders, roster };
}

/** @param {string} root */
export function ledgersCheck(root) {
  const ctx = context(root);
  /** @type {string[]} */
  const problems = [];
  const bugsText = existsSync(join(root, BUGS_FILE)) ? readFileSync(join(root, BUGS_FILE), 'utf8') : null;
  if (bugsText == null) problems.push(`${BUGS_FILE} is missing`);
  const bugs = bugsText == null ? { bugs: [], problems: [] } : parseBugs(bugsText, { agent: ctx.agent, roster: ctx.roster });
  problems.push(...bugs.problems);
  const oldBugs = fileAt(root, ctx.base, BUGS_FILE);
  if (oldBugs != null && bugsText != null) problems.push(...bugChanges(parseBugs(oldBugs).bugs, bugs.bugs));
  const scores = readScores(root, { committed: ctx.committed, builders: ctx.builders });
  problems.push(...scores.problems);
  if (existsSync(join(root, SCORES_FILE))) problems.push(...appended(fileAt(root, ctx.base, SCORES_FILE), readFileSync(join(root, SCORES_FILE), 'utf8'), SCORES_FILE).problems);
  let sessions = 0;
  for (const f of sessionFiles(root)) {
    const text = readFileSync(join(root, f), 'utf8');
    const r = parseSessions(text, f, (p) => existsSync(join(root, p)) && ctx.committed(p));
    sessions += r.sessions.length;
    problems.push(...r.problems, ...appended(fileAt(root, ctx.base, f), text, f).problems);
  }
  problems.push(...bandLogProblems(root, ctx.base, ctx.agent));
  const summary = `${bugs.bugs.length} bugs, ${scores.lines.length} score lines, ${sessions} playtest sessions, ${BANDS.length} bands logged; against ${ctx.base.slice(0, 7)}${problems.length ? `; ${problems.length} problem(s)` : ''}`;
  return { ok: problems.length === 0, summary, problems };
}

/** @param {string} root @param {string} phase */
export function rubricCheck(root, phase) {
  const ctx = context(root);
  const scores = readScores(root, { committed: ctx.committed, builders: ctx.builders });
  const problems = [...scores.problems, ...signoffProblems(scores.lines, phase, scores.pairs)];
  return { ok: problems.length === 0, summary: `${phase}: ${scores.lines.filter((s) => s.phase === phase).length} score lines${problems.length ? `, ${problems.length} blocking` : ', every axis and due pair ≥ 4'}`, problems };
}

/** @param {string} root @param {string} phase */
export function releaseCheck(root, phase) {
  /** @type {string[]} */
  const problems = [];
  const bugsText = existsSync(join(root, BUGS_FILE)) ? readFileSync(join(root, BUGS_FILE), 'utf8') : '';
  const bugs = parseBugs(bugsText);
  problems.push(...bugs.problems, ...openBySeverity(bugs.bugs).blockers);
  const sf = `docs/playtests/${phase}/sessions.jsonl`;
  const sessions = existsSync(join(root, sf)) ? parseSessions(readFileSync(join(root, sf), 'utf8'), sf, (p) => existsSync(join(root, p))) : { sessions: [], problems: [] };
  problems.push(...sessions.problems, ...playtestBlockers(sessions.sessions));
  const bf = `docs/balance/${phase}.json`;
  if (!existsSync(join(root, bf))) problems.push(`${bf} is missing: run node tools/balance/run.mjs --seeds 50 --phase ${phase}`);
  else {
    const b = JSON.parse(readFileSync(join(root, bf), 'utf8'));
    if (b.botSessions < 200) problems.push(`${b.botSessions} bot sessions in ${bf} (at least 200)`);
    if (b.crashes) problems.push(`${b.crashes} bot crash(es) in ${bf}`);
    if (b.roundTrips.ok !== b.roundTrips.checked || b.roundTrips.unchecked) problems.push(`${bf}: ${b.roundTrips.ok}/${b.roundTrips.checked} round trips identical, ${b.roundTrips.unchecked} sessions unchecked`);
    if (b.bandsFailing?.length) problems.push(`${bf}: bands failing: ${b.bandsFailing.join(', ')}`);
    try {
      const changed = execFileSync('git', ['diff', '--name-only', b.commit, 'HEAD', '--', 'src/', 'tools/balance/'], { cwd: root, encoding: 'utf8' }).trim();
      if (changed) problems.push(`${bf} was run at ${b.commit}; the sim or the bots changed since (${changed.split('\n').length} files)`);
    } catch {
      problems.push(`${bf}: its commit ${b.commit} is unknown here`);
    }
  }
  const lf = join(root, 'test-results/budgets/last.json');
  let head = '?';
  try {
    head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {}
  if (!existsSync(lf)) problems.push('no budgets run: node tools/budgets/run.mjs at this commit');
  else {
    const l = JSON.parse(readFileSync(lf, 'utf8'));
    if (l.commit !== head || l.dirty) problems.push(`the last budgets run is not of this commit (${String(l.commit).slice(0, 7)}${l.dirty ? ', uncommitted changes' : ''})`);
    else if (!l.ok) problems.push(`budgets: ${l.summary}`);
  }
  const open = openBySeverity(bugs.bugs).open;
  return { ok: problems.length === 0, summary: `${phase}: open S1 ${open.S1}, S2 ${open.S2}, S3 ${open.S3}; ${sessions.sessions.length} playtest sessions${problems.length ? `; ${problems.length} blocking` : '; release criteria met'}`, problems };
}

// ------------------------------------------------------------------------------------------ the CLI
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  /** @type {Record<string, any>} */
  let a = {};
  /** @type {string[]} */
  let pos = [];
  try {
    const r = parseArgs({ allowPositionals: true, options: { phase: { type: 'string' }, reason: { type: 'string' }, by: { type: 'string' }, ids: { type: 'string' }, root: { type: 'string' }, json: { type: 'boolean' } } });
    a = r.values;
    pos = r.positionals;
  } catch (err) {
    usage(/** @type {Error} */ (err).message);
  }
  const mode = pos[0];
  const root = a.root ? resolve(a.root) : REPO;
  if (a.phase && !/^P\d+$/.test(a.phase)) usage('--phase takes P<n>');
  const phase = a.phase || phaseOf(root);
  /** @param {{ ok: boolean, summary: string, problems: string[] }} r */
  const out = (r) => {
    if (a.json) console.log(JSON.stringify(r));
    else {
      for (const p of r.problems) console.log(`✖ ${p}`);
      console.log(`${r.ok ? 'PASS' : 'FAIL'} ${mode}: ${r.summary}`);
    }
    process.exit(r.ok ? 0 : 1);
  };
  if (mode === 'ledgers') out(ledgersCheck(root));
  else if (mode === 'rubric') out(rubricCheck(root, phase)); else if (mode === 'release') out(releaseCheck(root, phase));
  else if (mode === 'log-bands') {
    if (!a.reason?.trim()) usage('log-bands needs --reason: every band change says why');
    const c = a.by ? context(root) : null;
    const bad = a.by && c ? approverProblem(a.by, c.agent, c.roster) : null;
    if (bad) usage(bad);
    const { lines } = readBandLog(root);
    /** @type {Map<string, any>} */
    const last = new Map();
    for (const l of lines) last.set(l.id, l);
    const at = new Date().toISOString();
    let n = 0;
    for (const b of BANDS) {
      const l = last.get(b.id);
      const want = logged(b);
      if (l && l.min === want.min && l.max === want.max && l.source === want.source) continue;
      appendFileSync(join(root, BANDS_LOG), `${JSON.stringify({ id: b.id, ...want, from: b.from, reason: a.reason.trim(), approvedBy: a.by || null, at })}\n`);
      n++;
    }
    console.log(`log-bands: ${n} line(s) appended to ${BANDS_LOG}${a.by ? '' : ' (unsigned: sign-bands --by <approver>)'}`);
    process.exit(0);
  } else if (mode === 'sign-bands') {
    const ctx = context(root);
    const why = approverProblem(a.by, ctx.agent, ctx.roster);
    if (why) usage(why);
    const file = join(root, BANDS_LOG);
    const before = fileAt(root, ctx.base, BANDS_LOG) || '';
    const now = readFileSync(file, 'utf8');
    if (!now.startsWith(before)) usage(`${BANDS_LOG} does not extend master's copy; restore master's lines first`);
    const only = typeof a.ids === 'string' ? a.ids.split(',').map((x) => x.trim()) : null;
    let signed = 0;
    const tail = now
      .slice(before.length)
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => {
        const x = JSON.parse(l);
        if (x.approvedBy || (only && !only.includes(x.id))) return l;
        signed++;
        return JSON.stringify({ ...x, approvedBy: a.by });
      });
    writeFileSync(file, before + tail.map((l) => `${l}\n`).join(''));
    console.log(`sign-bands: ${signed} of ${tail.length} line(s) on this branch signed by ${a.by}`);
    process.exit(0);
  } else usage(mode ? `no mode '${mode}'` : 'which check?');
}
