#!/usr/bin/env node
// @ts-check
// Art metrics over every asset manifest under assets/ (the gate's art-metrics check): PBR validity, tiling and
// repetition, texel density, triangle budgets, bone influences, required clips, icon sizes and distinctness, text
// artifacts and lightmap seams, each measured in the shipped files against docs/ART.md (tools/art-metrics/standard.mjs).
// A family whose manifest does not exist yet (or holds no entry) is listed and fails the check.
//   node tools/art-metrics.mjs              a table of failing checks, then the verdict
//   node tools/art-metrics.mjs --json       one line { ok, summary, problems, families, checks }
//   node tools/art-metrics.mjs --verbose    every finding, passing ones included
//   --root <dir>  judge another checkout (the fixture tests use it)
//   --phase P<n>  the content the phase needs (default GATE_PHASE, set by gate --signoff, else the STATUS.md phase)
// Exit code: 0 pass, 1 fail, 2 bad usage. The full findings go to test-results/art-metrics/last.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { REPO, runArtMetrics } from './art-metrics/run.mjs';
import { phase as statusPhase } from './gate/ledgers.mjs';
import { gatePhase } from './balance/git.mjs';

/** @type {{ json?: boolean, verbose?: boolean, root?: string, phase?: string, help?: boolean }} */
let args = {};
try {
  args = parseArgs({ options: { json: { type: 'boolean' }, verbose: { type: 'boolean' }, root: { type: 'string' }, phase: { type: 'string' }, help: { type: 'boolean', short: 'h' } } }).values;
} catch (err) {
  console.error(`art-metrics: ${/** @type {Error} */ (err).message}\nusage: node tools/art-metrics.mjs [--json] [--verbose] [--root <dir>] [--phase P<n>]`);
  process.exit(2);
}
if (args.help) {
  console.log('usage: node tools/art-metrics.mjs [--json] [--verbose] [--root <dir>] [--phase P<n>]');
  process.exit(0);
}

if (args.phase != null && !/^P\d+$/.test(args.phase)) {
  console.error(`art-metrics: --phase must be P<n>, not '${args.phase}'`);
  process.exit(2);
}
const root = args.root ? resolve(args.root) : REPO;
const r = await runArtMetrics({ root, phase: args.phase || gatePhase() || statusPhase()?.id || 'P0' });
const out = join(REPO, 'test-results', 'art-metrics');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'last.json'), `${JSON.stringify({ root, ...r }, null, 2)}\n`);

if (args.json) {
  const { ok, summary, problems, families, missing, checks } = r;
  console.log(JSON.stringify({ ok, summary, problems, families, missing, checks }));
} else {
  for (const f of r.findings) {
    if (f.state === 'fail' || args.verbose) console.log(`${f.state === 'fail' ? '✖' : f.state === 'skip' ? '–' : '✔'} ${f.entry.padEnd(30)} ${f.check.padEnd(21)} ${f.detail}`);
  }
  for (const m of r.missing) console.log(`✖ ${m.family.padEnd(30)} ${'manifest'.padEnd(21)} ${m.why} (${m.owner} writes ${m.manifest})`);
  console.log(`\n${r.ok ? 'PASS' : 'FAIL'} art-metrics: ${r.summary}`);
}
process.exitCode = r.ok ? 0 : 1; // not process.exit: a large --json report must flush to a pipe first
