#!/usr/bin/env node
// @ts-check
// Coverage: every entity of the game config (src/data/gen) checked by probes that drive the simulation headless.
//   node tools/coverage.mjs                    the per-family table and total on stdout
//   node tools/coverage.mjs --json             one JSON verdict on stdout: { ok, summary, problems, families, … }
//   node tools/coverage.mjs --phase P3         from P3 on, a family below 100% fails (exit 1); before that it prints
//   node tools/coverage.mjs --md <file>        also write the Markdown report (per-family table, gaps with entity ids)
// Options: --only <family,…> (items, furniture, funcs, cooking, crafting, plants, achievements, news),
//   --workers <n> (0 runs every driver in this thread), --no-trace (skip the traced test run), --verbose.
// Exit code: 0 pass (in P0–P2 unless a probe crashed or the self-check found a check no probe can pass), 1 fail, 2 bad usage.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { FAMILIES, runCoverage } from './coverage/run.mjs';
import { markdown, table, verdict } from './coverage/report.mjs';
import { ROOT } from './coverage/sim.mjs';

/** @param {string} msg @returns {never} */
function usage(msg) {
  console.error(`coverage: ${msg}\nusage: node tools/coverage.mjs [--json] [--phase P<n>] [--md <file>] [--only <family,…>] [--workers <n>] [--no-trace] [--verbose]`);
  process.exit(2);
}

/** @type {{ json?: boolean, phase?: string, md?: string, only?: string, workers?: string, 'no-trace'?: boolean, verbose?: boolean, help?: boolean }} */
let args = {};
try {
  args = parseArgs({
    options: {
      json: { type: 'boolean' },
      phase: { type: 'string' },
      md: { type: 'string' },
      only: { type: 'string' },
      workers: { type: 'string' },
      'no-trace': { type: 'boolean' },
      verbose: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  }).values;
} catch (err) {
  usage(/** @type {Error} */ (err).message);
}
if (args.help) {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(2, 10).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(0);
}
const families = args.only ? args.only.split(',').map((s) => s.trim()) : FAMILIES;
const unknown = families.filter((f) => !FAMILIES.includes(f));
if (unknown.length) usage(`no such family: ${unknown.join(', ')} (have ${FAMILIES.join(', ')})`);
let phase = null;
if (args.phase != null) {
  const m = /^P(\d+)$/i.exec(args.phase);
  if (!m) usage(`--phase takes a phase such as P3, not '${args.phase}'`);
  phase = Number(m[1]);
}
const workers = args.workers == null ? undefined : Number(args.workers);
if (workers != null && !(Number.isInteger(workers) && workers >= 0)) usage(`--workers takes a count, not '${args.workers}'`);

// the phase in docs/wp/STATUS.md names the report when --phase is not given; it never makes coverage required
const shownPhase = phase ?? (() => {
  try {
    const m = /^Phase:\s*\*\*P(\d+)/m.exec(readFileSync(join(ROOT, 'docs/wp/STATUS.md'), 'utf8'));
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
})();
const git = (/** @type {string[]} */ a) => {
  try {
    return execFileSync('git', a, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '?';
  }
};
const where = `${git(['rev-parse', '--abbrev-ref', 'HEAD'])} @ ${git(['rev-parse', '--short', 'HEAD'])}`;
const progress = (/** @type {string} */ m) => !args.json && process.stderr.write(`  · ${m}\n`);

const run = await runCoverage({ families, workers, trace: !args['no-trace'], progress });
const v = verdict(run.families, { phase, problems: run.problems, warnings: run.warnings, impossible: run.impossible });
if (phase == null && shownPhase != null) {
  v.phase = `P${shownPhase}`;
  v.summary = v.summary.replace(/$/, v.required ? '' : ` · ${v.phase}: printed`);
}
if (args.md) {
  const md = markdown(v, run.families, {
    ms: run.ms,
    where,
    date: new Date().toISOString().slice(0, 10),
    workers: workers ?? (await import('./coverage/pool.mjs')).defaultWorkers(),
    tasks: run.tasks,
    trace: run.trace,
    command: `node tools/coverage.mjs --md ${args.md}${args.only ? ` --only ${args.only}` : ''}`,
  });
  writeFileSync(resolve(process.cwd(), args.md), `${md}\n`);
}
if (args.json) {
  process.stdout.write(`${JSON.stringify({ ...v, ms: Math.round(run.ms), where })}\n`);
} else {
  console.log(table(v, { ms: run.ms, where }));
  if (args.verbose) for (const w of v.warnings) console.log(`  · ${w}`);
  if (args.md) console.log(`\nReport written to ${args.md}`);
}
// stdout on a pipe is written asynchronously: exit once the report has been flushed (process.exit() right away cut the
// --json report the gate reads at 64 KB)
process.stdout.write('', () => process.exit(v.ok ? 0 : 1));
