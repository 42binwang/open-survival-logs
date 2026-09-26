// @ts-check
// The gate hands the coverage tool the phase it judges by, so a P3 signoff fails while coverage is below 100%.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { CHECKS, coverageArgs, gatePhase, tool } from '../tools/gate/checks.mjs';
import { ROOT } from '../tools/gate/port.mjs';

test('gate phase: a signoff judges by its own phase, --final by at least P3, a plain run by the current phase', () => {
  assert.equal(gatePhase({ signoff: 3 }, { id: 'P0' }), 'P3');
  assert.equal(gatePhase({ signoff: 0 }, { id: 'P2' }), 'P0');
  assert.equal(gatePhase({ final: true }, { id: 'P1' }), 'P3');
  assert.equal(gatePhase({ final: true }, { id: 'P4' }), 'P4');
  assert.equal(gatePhase({}, { id: 'P2' }), 'P2');
  assert.equal(gatePhase({}, null), 'P0');
});

test('the coverage check passes the phase to tools/coverage.mjs', () => {
  assert.deepEqual(coverageArgs({ quick: false, phase: 'P3' }), ['--json', '--phase', 'P3']);
  const cov = CHECKS.find((c) => c.id === 'coverage');
  assert.ok(cov, 'the registry has the coverage check');
  assert.equal(cov.quick, false);
});

test('a P3 signoff fails the coverage check below 100%; before P3 it passes', async () => {
  const stub = tool({ id: 'coverage', title: 'stub', owner: 'test', entry: 'tests/fixtures/gate/coverage-stub.mjs', args: coverageArgs });
  const p3 = await stub.run({ quick: false, phase: gatePhase({ signoff: 3 }, { id: 'P0' }) });
  assert.equal(p3.state, 'fail');
  assert.match(p3.summary, /P3 requires 100%/);
  const p0 = await stub.run({ quick: false, phase: gatePhase({ signoff: 0 }, { id: 'P0' }) });
  assert.equal(p0.state, 'pass');
});

test('tools/coverage.mjs itself fails with --phase P3 below 100% and passes with --phase P0', () => {
  // achievements without the traced test run are at 0%: a family below 100% without running the whole tool
  const run = (/** @type {string} */ phase) => spawnSync(process.execPath, ['tools/coverage.mjs', ...coverageArgs({ quick: false, phase }), '--only', 'achievements', '--no-trace'], { cwd: ROOT, encoding: 'utf8' });
  const p3 = run('P3');
  assert.equal(p3.status, 1, p3.stderr);
  const v = JSON.parse(p3.stdout.trim());
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((/** @type {string} */ p) => /^achievements: .*P3 requires 100%/.test(p)), v.problems.join('\n'));
  assert.equal(run('P0').status, 0);
});
