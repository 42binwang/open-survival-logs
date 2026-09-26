// @ts-check
// The WP-P0-11 gate checks judge the phase the run is judged by (tools/gate/checks.mjs gatePhase: the --signoff
// phase, else STATUS.md's), passed to each tool as --phase; the release check runs only for --final and the P5
// signoff, at P5 at least.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECKS, gatePhase } from '../tools/gate/checks.mjs';

const check = (/** @type {string} */ id) => {
  const c = CHECKS.find((x) => x.id === id);
  if (!c) throw new Error(`no gate check '${id}'`);
  return c;
};

test('gate --signoff P1 with STATUS.md at P0: rubric and art-metrics judge P1, release judges P5', async () => {
  const p1 = gatePhase({ signoff: 1 }, { id: 'P0' });
  assert.equal(p1, 'P1');
  const rubric = await check('rubric').run({ quick: false, phase: p1 });
  assert.equal(rubric.state, 'fail', 'no P1 scores yet');
  assert.match(rubric.summary, /^P1:/, 'the signoff phase, not the STATUS.md phase');
  const art = await check('art-metrics').run({ quick: false, phase: p1 });
  assert.match(art.summary, /^P1:/, 'the content of P1 (every survivor, home and floor)');
  const release = await check('release').run({ quick: false, phase: gatePhase({ final: true }, { id: 'P0' }) });
  assert.match(release.summary, /^P5:/, '--final judges the release at P5');
  assert.equal(check('release').finalOnly, true);
  assert.deepEqual([check('rubric').requiredFrom, check('release').requiredFrom, check('ledgers').quick], [1, 5, true]);
});
