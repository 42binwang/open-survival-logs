// @ts-check
// Test evidence: runs the Node test suite once with the tracer preloaded (trace/register.mjs) and returns, for every
// furniture function id and every achievement id, the tests during which the function's action completed or game
// code awarded the achievement on a state the sim advanced past it (the state as the test first ticked it did not
// meet it yet). The coverage tool's own tests are left out: its fixtures drive the sim too.
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from './sim.mjs';

export const OWN_TESTS = 'coverage-tool.test.js';

/**
 * @typedef {object} Trace
 * @property {number} files  test files run
 * @property {string[]} tests  every test that ran ("tests/x.test.js › name")
 * @property {Record<string, string[]>} func  Config_FurnitureFunc id -> tests
 * @property {Record<string, string[]>} achievement  achievement id -> tests during which game code awarded it on a state the sim advanced past it
 * @property {Record<string, string[]>} undriven  achievement id -> tests that awarded it on a state set up by hand
 * @property {Record<string, string[]>} [baseline]  achievement id -> tests that awarded it on a state (and history) that met it before the test first ticked the state
 * @property {Record<string, string[]>} [tainted]  achievement id -> tests that awarded it on a state or history whose achievement fields the test's own code wrote
 * @property {{ passed: number, failed: number }} results
 * @property {string[]} problems  why the evidence may be incomplete
 */

/**
 * The whole-run story tests (tests/storyrun.test.js, the achievement play-throughs) take minutes under the tracer,
 * so the run gets 9 minutes (the gate gives the coverage tool 10; the drivers run beside it).
 * @param {{ root?: string, files?: string[], timeoutMs?: number }} [opts]
 * @returns {Promise<Trace>}
 */
export async function traceTests({ root = ROOT, files, timeoutMs = 9 * 60_000 } = {}) {
  const list =
    files ||
    readdirSync(join(root, 'tests'))
      .filter((f) => f.endsWith('.test.js') && f !== OWN_TESTS)
      .sort()
      .map((f) => `tests/${f}`);
  const dir = mkdtempSync(join(tmpdir(), 'coverage-trace-'));
  const register = new URL('./trace/register.mjs', import.meta.url).href;
  try {
    // a run started from inside a test (the tool's own tests) must not report to that test's runner
    /** @type {NodeJS.ProcessEnv} */
    const env = { ...process.env, COVERAGE_TRACE_DIR: dir, NO_COLOR: '1' };
    delete env.NODE_TEST_CONTEXT;
    const r = await new Promise((resolve) => {
      const child = spawn(process.execPath, ['--import', register, '--test', '--test-reporter=tap', ...list], {
        cwd: root,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '';
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (out += d));
      const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code, out });
      });
    });
    /** @type {Trace} */
    const trace = { files: list.length, tests: [], func: {}, achievement: {}, undriven: {}, baseline: {}, tainted: {}, results: { passed: 0, failed: 0 }, problems: [] };
    const num = (/** @type {string} */ k) => Number(new RegExp(`^# ${k} (\\d+)$`, 'm').exec(r.out)?.[1] ?? NaN);
    trace.results = { passed: num('pass'), failed: num('fail') };
    if (r.code !== 0) trace.problems.push(`the traced test run exited with ${r.code} (${trace.results.failed} failed)`);
    const tests = new Set();
    let processes = 0;
    for (const f of readdirSync(dir)) {
      const rec = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (!rec.argv?.some((/** @type {string} */ a) => /\.test\.m?js$/.test(a))) continue;
      processes++;
      for (const t of rec.tests) tests.add(t);
      for (const kind of /** @type {const} */ (['func', 'achievement', 'undriven', 'baseline', 'tainted'])) {
        const into = /** @type {Record<string, string[]>} */ (trace[kind]);
        for (const [id, ts] of Object.entries(/** @type {Record<string, string[]>} */ (rec[kind] || {}))) into[id] = [...new Set([...(into[id] || []), ...ts])].sort();
      }
    }
    trace.tests = [...tests].sort();
    if (processes < list.length) trace.problems.push(`only ${processes} of ${list.length} test files reported a trace`);
    if (!trace.tests.length) trace.problems.push('no test reported its name: the node:test wrapper did not load');
    return trace;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
