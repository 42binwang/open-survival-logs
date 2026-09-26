#!/usr/bin/env node
// @ts-check
// Code coverage of src/ by the Node tests, judged two ways (docs/QUALITY.md §7):
//
//   1. new code is covered: every line and branch under src/ that this branch adds or changes (against its merge
//      base with master, working tree included) is run by a test. A file listed in `exempt` is judged by what its
//      entry names instead (the visual shots, e2e).
//   2. nothing loses coverage: no file's line, branch or function coverage falls below its entry in the baseline
//      (docs/quality/code-coverage.json), and no branch lowers master's baseline.
//
//   node tools/code-coverage.mjs                  run the tests with coverage, then judge (about 5 minutes)
//   node tools/code-coverage.mjs --v8 DIR        judge the raw V8 coverage a test run wrote (the gate's tests check)
//   node tools/code-coverage.mjs --lcov FILE      judge an lcov report instead
//   node tools/code-coverage.mjs --json           the result as JSON (for tools/gate.mjs)
//   node tools/code-coverage.mjs --update         raise the baseline to today's numbers (it never lowers one)
//   node tools/code-coverage.mjs --update --rebase  re-record it from scratch after a change of METHOD (integrator)
//   node tools/code-coverage.mjs --base REF       judge the changes since REF instead of the merge base with master
//
// The coverage comes from V8 itself (NODE_V8_COVERAGE: one JSON file per test process), merged here: a line, branch
// or function is covered when any test process ran it. Node's own --experimental-test-coverage merge is not used: a
// process that loads a module but never calls a function reports that function's whole range at count 0, and Node's
// merge let that zero win over a process that did call it (dom.js's openWindow read as never run, BUG-0112).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASELINE = 'docs/quality/code-coverage.json';
/** How the numbers are measured. A baseline recorded another way is re-recorded, not compared (docs/QUALITY.md §7). */
export const METHOD = 'v8-merged-1';
/** Where the gate's tests check has V8 write its per-process coverage. */
export const V8_DIR = 'test-results/coverage/v8';
/** Coverage wobbles this much (percentage points) between runs of the same code (tests that run until a condition take
 * slightly different branches), so it does not count as a drop. */
const TOLERANCE = 0.5;

/**
 * @typedef {{ lines: Map<number, number>, branches: Map<string, { line: number, taken: number }>, fns: Map<string, number> }} FileCov
 * @typedef {{ lines: number, branches: number, functions: number }} Pct
 * @typedef {{ method?: string, files: Record<string, Pct>, exempt: Record<string, string> }} Baseline
 */

/**
 * Parse an lcov report, merging the records of each file.
 * @param {string} text @param {string} root
 * @returns {Map<string, FileCov>}
 */
export function parseLcov(text, root = ROOT) {
  /** @type {Map<string, FileCov>} */
  const out = new Map();
  /** @type {FileCov | null} */
  let cur = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('SF:')) {
      const file = relative(root, line.slice(3)).split(sep).join('/');
      if (!out.has(file)) out.set(file, { lines: new Map(), branches: new Map(), fns: new Map() });
      cur = out.get(file) || null;
    } else if (!cur) continue;
    else if (line.startsWith('DA:')) {
      const [n, hits] = line.slice(3).split(',').map(Number);
      cur.lines.set(n, Math.max(cur.lines.get(n) || 0, hits));
    } else if (line.startsWith('BRDA:')) {
      const [n, block, branch, taken] = line.slice(5).split(',');
      const key = `${n},${block},${branch}`;
      const t = taken === '-' ? 0 : Number(taken);
      cur.branches.set(key, { line: Number(n), taken: Math.max(cur.branches.get(key)?.taken || 0, t) });
    } else if (line.startsWith('FNDA:')) {
      const [hits, ...name] = line.slice(5).split(',');
      const key = name.join(',');
      cur.fns.set(key, Math.max(cur.fns.get(key) || 0, Number(hits)));
    } else if (line.startsWith('FN:')) {
      const key = line.slice(3).split(',').slice(1).join(',');
      if (!cur.fns.has(key)) cur.fns.set(key, 0);
    } else if (line === 'end_of_record') cur = null;
  }
  return out;
}

/**
 * @typedef {{ startOffset: number, endOffset: number, count: number }} Range
 * @typedef {{ url: string, functions: { functionName: string, isBlockCoverage?: boolean, ranges: Range[] }[] }} ScriptCov
 */

/**
 * The count V8 gives each offset: that of the innermost range containing it (ranges nest). One sweep over the ranges
 * sorted outer-first; `offsets` ascending.
 * @param {Range[]} ranges @param {number[]} offsets @returns {number[]}
 */
function innermostCounts(ranges, offsets) {
  const sorted = [...ranges].sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
  /** @type {Range[]} */
  const stack = [];
  const out = [];
  let i = 0;
  for (const off of offsets) {
    while (i < sorted.length && sorted[i].startOffset <= off) stack.push(sorted[i++]);
    // drop what ends before this offset; what is left on top is the innermost range around it
    for (let k = stack.length - 1; k >= 0; k--) if (stack[k].endOffset <= off) stack.splice(k, 1);
    out.push(stack.length ? stack[stack.length - 1].count : 0);
  }
  return out;
}

/**
 * Merge V8 coverage of one source file from many processes. Lines are the non-blank lines, each counted at its first
 * non-blank character; branches are the block ranges any process reports (by start offset), taken when any process
 * ran that offset; functions likewise by start offset.
 * @param {string} source @param {ScriptCov[]} scripts  this file's entry from each process that loaded it
 * @returns {FileCov}
 */
export function mergeV8(source, scripts) {
  /** @type {{ n: number, off: number }[]} */
  const lineStarts = [];
  let pos = 0;
  source.split('\n').forEach((text, i) => {
    const lead = text.search(/\S/);
    if (lead >= 0) lineStarts.push({ n: i + 1, off: pos + lead });
    pos += text.length + 1;
  });
  const lineOf = (/** @type {number} */ off) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid].off <= off) lo = mid;
      else hi = mid - 1;
    }
    return lineStarts[lo]?.n ?? 1;
  };
  /** @type {Map<number, string>} */
  const fnStarts = new Map();
  /** @type {Set<number>} */
  const blockStarts = new Set();
  for (const s of scripts) {
    s.functions.forEach((f, i) => {
      const [whole, ...blocks] = f.ranges;
      // the first entry is the module's own top level, not a function of it
      if (whole && i > 0) fnStarts.set(whole.startOffset, f.functionName || '(anonymous)');
      for (const b of blocks) blockStarts.add(b.startOffset);
    });
  }
  const lineOffs = lineStarts.map((l) => l.off);
  const blockOffs = [...blockStarts].sort((a, b) => a - b);
  const fnOffs = [...fnStarts.keys()].sort((a, b) => a - b);
  const lineHits = new Array(lineOffs.length).fill(0);
  const blockHits = new Array(blockOffs.length).fill(0);
  const fnHits = new Array(fnOffs.length).fill(0);
  for (const s of scripts) {
    const ranges = s.functions.flatMap((f) => f.ranges);
    innermostCounts(ranges, lineOffs).forEach((c, i) => (lineHits[i] = Math.max(lineHits[i], c)));
    innermostCounts(ranges, blockOffs).forEach((c, i) => (blockHits[i] = Math.max(blockHits[i], c)));
    innermostCounts(ranges, fnOffs).forEach((c, i) => (fnHits[i] = Math.max(fnHits[i], c)));
  }
  return {
    lines: new Map(lineStarts.map((l, i) => [l.n, lineHits[i]])),
    branches: new Map(blockOffs.map((off, i) => [`${off}`, { line: lineOf(off), taken: blockHits[i] }])),
    fns: new Map(fnOffs.map((off, i) => [`${fnStarts.get(off)}@${lineOf(off)}`, fnHits[i]])),
  };
}

/**
 * Read a NODE_V8_COVERAGE directory and merge the src/ files.
 * @param {string} dir @param {string} root @returns {Map<string, FileCov>}
 */
export function readV8Dir(dir, root = ROOT) {
  const prefix = `${pathToFileURL(root).href.replace(/\/$/, '')}/src/`;
  /** @type {Map<string, ScriptCov[]>} */
  const byFile = new Map();
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    /** @type {{ result?: ScriptCov[] }} */
    const json = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    for (const s of json.result || []) {
      if (!s.url.startsWith(prefix) || !s.url.endsWith('.js')) continue;
      const file = `src/${s.url.slice(prefix.length)}`;
      if (!byFile.has(file)) byFile.set(file, []);
      byFile.get(file)?.push(s);
    }
  }
  /** @type {Map<string, FileCov>} */
  const out = new Map();
  for (const [file, scripts] of byFile) out.set(file, mergeV8(readFileSync(join(root, file), 'utf8'), scripts));
  return out;
}

/** @param {FileCov} c @returns {Pct} */
export function percent(c) {
  const pct = (/** @type {number} */ hit, /** @type {number} */ all) => (all ? Math.round((1000 * hit) / all) / 10 : 100);
  const lines = [...c.lines.values()];
  const branches = [...c.branches.values()];
  const fns = [...c.fns.values()];
  return {
    lines: pct(lines.filter((h) => h > 0).length, lines.length),
    branches: pct(branches.filter((b) => b.taken > 0).length, branches.length),
    functions: pct(fns.filter((h) => h > 0).length, fns.length),
  };
}

/**
 * The lines of each src/ file this branch adds or changes: `git diff -U0 base` (working tree included).
 * @param {string} base @param {string} root
 * @returns {Map<string, number[]>}
 */
export function changedLines(base, root = ROOT) {
  const diff = execFileSync('git', ['diff', '-U0', '--no-color', base, '--', 'src'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
  /** @type {Map<string, number[]>} */
  const out = new Map();
  let file = '';
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) file = line.startsWith('+++ b/') ? line.slice(6) : '';
    const m = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (m && file.endsWith('.js')) {
      const start = Number(m[1]);
      const count = m[2] == null ? 1 : Number(m[2]);
      if (!out.has(file)) out.set(file, []);
      for (let i = 0; i < count; i++) out.get(file)?.push(start + i);
    }
  }
  // files git does not track yet are new in full
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', 'src'], { cwd: root, encoding: 'utf8' });
  for (const f of untracked.split('\n').filter((x) => x.endsWith('.js'))) {
    const n = readFileSync(join(root, f), 'utf8').split('\n').length;
    out.set(f, Array.from({ length: n }, (_, i) => i + 1));
  }
  return out;
}

/**
 * Judge a coverage report.
 * @param {{ cov: Map<string, FileCov>, baseline: Baseline, master: Baseline | null, changed: Map<string, number[]> }} input
 * @returns {{ problems: string[], files: Record<string, Pct>, newLines: number, uncoveredNew: number }}
 */
export function judge({ cov, baseline, master, changed }) {
  /** @type {string[]} */
  const problems = [];
  /** @type {Record<string, Pct>} */
  const files = {};
  for (const [f, c] of cov) if (f.startsWith('src/')) files[f] = percent(c);
  const exempt = { ...(master?.exempt || {}), ...baseline.exempt };

  // 1. new code is covered
  let newLines = 0;
  let uncoveredNew = 0;
  for (const [f, lines] of changed) {
    if (exempt[f]) continue;
    const c = cov.get(f);
    if (!c) {
      problems.push(`${f}: changed, but no test loads it (every changed line of src/ needs a test)`);
      uncoveredNew += lines.length;
      continue;
    }
    const want = new Set(lines);
    const missed = lines.filter((n) => c.lines.has(n) && !(/** @type {number} */ (c.lines.get(n)) > 0));
    newLines += lines.filter((n) => c.lines.has(n)).length;
    const branches = [...c.branches.entries()].filter(([, b]) => want.has(b.line) && b.taken === 0);
    uncoveredNew += missed.length;
    if (missed.length) problems.push(`${f}: ${missed.length} changed line(s) no test runs: ${ranges(missed)}`);
    if (branches.length) problems.push(`${f}: ${branches.length} branch(es) on changed lines no test takes, on line(s) ${ranges([...new Set(branches.map(([, b]) => b.line))])}`);
  }

  // 2. nothing loses coverage
  for (const [f, was] of Object.entries(baseline.files)) {
    const now = files[f];
    if (!now) {
      if (existsSync(join(ROOT, f))) problems.push(`${f}: no test loads it any more (baseline ${was.lines}% of lines)`);
      continue;
    }
    for (const k of /** @type {(keyof Pct)[]} */ (['lines', 'branches', 'functions'])) {
      if (now[k] + TOLERANCE < was[k]) problems.push(`${f}: ${k} coverage fell from ${was[k]}% to ${now[k]}%`);
    }
  }
  if (baseline.method !== METHOD) problems.push(`${BASELINE}: recorded with method ${baseline.method || '(none)'}, this tool measures ${METHOD}: re-record it (node tools/code-coverage.mjs --update --rebase)`);
  // master's numbers are comparable only when measured the same way; a new method is the integrator's re-recording
  if (master && master.method === baseline.method) {
    for (const [f, m] of Object.entries(master.files)) {
      const b = baseline.files[f];
      if (!b) {
        if (existsSync(join(ROOT, f))) problems.push(`${BASELINE}: ${f} was dropped from the baseline (master has it)`);
        continue;
      }
      for (const k of /** @type {(keyof Pct)[]} */ (['lines', 'branches', 'functions'])) {
        if (b[k] < m[k]) problems.push(`${BASELINE}: ${f} ${k} lowered from master's ${m[k]}% to ${b[k]}% (a baseline is only ever raised)`);
      }
    }
    for (const f of Object.keys(baseline.exempt)) if (!master.exempt[f]) problems.push(`${BASELINE}: ${f} newly exempt: an exemption is the integrator's to add, on master`);
  }
  for (const [f, why] of Object.entries(baseline.exempt)) if (!why || why.length < 20) problems.push(`${BASELINE}: exemption for ${f} needs a reason naming what covers it instead`);
  return { problems, files, newLines, uncoveredNew };
}

/** @param {number[]} ns */
function ranges(ns) {
  const s = [...ns].sort((a, b) => a - b);
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(i === j ? `${s[i]}` : `${s[i]}-${s[j]}`);
    i = j;
  }
  return out.length > 12 ? `${out.slice(0, 12).join(', ')}, …` : out.join(', ');
}

/** An empty V8 coverage directory for a test run, and the environment that fills it. */
export function coverageEnv(root = ROOT) {
  const dir = join(root, V8_DIR);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return { NODE_V8_COVERAGE: dir };
}

/** Run the Node tests with V8 coverage. */
export function runTests(root = ROOT) {
  const files = readdirSync(join(root, 'tests'))
    .filter((f) => f.endsWith('.test.js'))
    .sort()
    .map((f) => `tests/${f}`);
  return spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...files], { cwd: root, encoding: 'utf8', maxBuffer: 256 << 20, env: { ...process.env, ...coverageEnv(root) } });
}

/** @param {string} ref @returns {Baseline | null} */
function baselineAt(ref) {
  try {
    return JSON.parse(execFileSync('git', ['show', `${ref}:${BASELINE}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    return null;
  }
}

/** @param {string[]} cmd */
const git = (...cmd) => execFileSync('git', cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

async function main() {
  const { values: args } = parseArgs({ options: { json: { type: 'boolean' }, lcov: { type: 'string' }, v8: { type: 'string' }, update: { type: 'boolean' }, rebase: { type: 'boolean' }, base: { type: 'string' } } });
  const fail = (/** @type {string} */ summary) => {
    console.log(args.json ? JSON.stringify({ ok: false, summary, problems: [] }) : summary);
    process.exit(1);
  };
  let v8 = args.v8;
  if (!v8 && !args.lcov) {
    const r = runTests();
    if (r.status !== 0) fail(`the tests failed (exit code ${r.status}); coverage is judged on a passing run`);
    v8 = V8_DIR;
  }
  const input = join(ROOT, /** @type {string} */ (v8 || args.lcov));
  if (!existsSync(input)) fail(`${v8 || args.lcov} not found: run the tests with coverage first (node tools/code-coverage.mjs)`);
  const cov = v8 ? readV8Dir(input) : parseLcov(readFileSync(input, 'utf8'));
  /** @type {Baseline} */
  const baseline = existsSync(join(ROOT, BASELINE)) ? JSON.parse(readFileSync(join(ROOT, BASELINE), 'utf8')) : { files: {}, exempt: {} };
  const onMaster = (() => {
    try {
      return git('rev-parse', 'HEAD') === git('rev-parse', 'master');
    } catch {
      return false;
    }
  })();
  let base = args.base || '';
  if (!base) {
    try {
      base = git('merge-base', 'HEAD', 'master');
    } catch {
      base = 'HEAD';
    }
  }
  const master = onMaster ? null : baselineAt('master');
  const changed = changedLines(base);
  const result = judge({ cov, baseline, master, changed });

  if (args.update) {
    /** @type {Record<string, Pct>} */
    const files = {};
    for (const [f, now] of Object.entries(result.files)) {
      const was = args.rebase ? null : baseline.files[f];
      files[f] = was ? { lines: Math.max(was.lines, now.lines), branches: Math.max(was.branches, now.branches), functions: Math.max(was.functions, now.functions) } : now;
    }
    const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(join(ROOT, BASELINE), `${JSON.stringify({ method: METHOD, exempt: baseline.exempt, files: sorted }, null, 2)}\n`);
  }

  const all = Object.values(result.files);
  const mean = (/** @type {keyof Pct} */ k) => (all.length ? Math.round((10 * all.reduce((a, p) => a + p[k], 0)) / all.length) / 10 : 0);
  const summary = `${all.length} files of src/ loaded by tests (mean ${mean('lines')}% lines, ${mean('branches')}% branches); ${result.newLines - result.uncoveredNew} of ${result.newLines} changed line(s) covered${result.problems.length ? `; ${result.problems.length} problem(s)` : ''}`;
  const ok = result.problems.length === 0;
  if (args.json) console.log(JSON.stringify({ ok, summary, problems: result.problems }));
  else {
    console.log(summary);
    for (const p of result.problems) console.log(`  ✖ ${p}`);
  }
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
