// @ts-check
// The Girl Next Door route (S01, https://steamcommunity.com/stats/4164790/achievements) earned by a whole story run the defender plays on its own
// (tools/balance/defender.mjs): on Normal it repairs the hanging basket across the rooftops, keeps the neighbor fed
// and sends what she asks for until she trusts the survivor, and commits with the Military Repair Kit the Day 66 horde
// leaves. The test starts the run from the title screen and only advances the sim; nothing here writes the survivor,
// the neighbor, the house or a counter. It lets the sim run on while the survivor is in the middle of an action
// (defenderPace).
import test from 'node:test';
import assert from 'node:assert/strict';
import { S, begin, awarded, settle } from './fixtures/play.mjs';
import { defenderStep, defenderPace } from '../tools/balance/defender.mjs';

S.weather ??= await import('../src/sim/weather.js');

test('the survivor keeps the neighbor alive across the rooftops and leaves with her on Normal: Side By Side, The Person Next Door', async () => {
  const s = begin({ seed: 2035, character: 'wage', difficulty: 'normal' });
  for (let guard = 0; guard < 120 * 144 && s.phase !== 'dead' && s.phase !== 'ending'; guard++) {
    defenderStep(S, s, { route: 'girl' });
    S.tick.tick(s, defenderPace(s));
  }
  await settle();
  assert.equal(s.phase, 'ending', `the run ended on Day ${S.time.dayNumber(s.clock)} (${s.phase === 'dead' ? S.rebirth.deathCause(s) : ''})`);
  assert.equal(s.run.ending, 'girl');
  assert.ok(awarded(1102), 'Side By Side: the Girl Next Door ending as the Wage Slave');
  assert.ok(awarded(1213), 'The Person Next Door: a true bond with the neighbor');
  assert.ok(awarded(1006), 'My Choice: an ending commitment');
});
