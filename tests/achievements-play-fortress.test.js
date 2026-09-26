// @ts-check
// The Fortress route (S01, https://steamcommunity.com/stats/4164790/achievements) earned by a whole story run the defender plays on its own
// (tools/balance/defender.mjs): on Normal it fits the titanium door and a bulletproof window in every window,
// reinforces them, sets up four each of the spike barrier, the electric net and the mechanical chainsaw (their
// blueprints from the Day 15 and Day 25 hordes), keeps a home UPS charged with the manual generator through Days
// 60–69, and commits with the Military Repair Kit the Day 66 horde leaves. The test starts the run from the title
// screen and only advances the sim; nothing here writes the survivor, the house or a counter. It lets the sim run on
// while the survivor is in the middle of an action (defenderPace).
import test from 'node:test';
import assert from 'node:assert/strict';
import { S, begin, awarded, settle } from './fixtures/play.mjs';
import { defenderStep, defenderPace } from '../tools/balance/defender.mjs';

S.weather ??= await import('../src/sim/weather.js');

test('the survivor turns the house into a fortress and holds it through the final horde on Normal: Safe House', async () => {
  const s = begin({ seed: 1026, character: 'wage', difficulty: 'normal' });
  for (let guard = 0; guard < 120 * 144 && s.phase !== 'dead' && s.phase !== 'ending'; guard++) {
    defenderStep(S, s, { route: 'fortress' });
    S.tick.tick(s, defenderPace(s));
  }
  await settle();
  assert.equal(s.phase, 'ending', `the run ended on Day ${S.time.dayNumber(s.clock)} (${s.phase === 'dead' ? S.rebirth.deathCause(s) : ''})`);
  assert.equal(s.run.ending, 'fortress');
  assert.ok(awarded(1104), 'Safe House: the Fortress ending');
  assert.ok(awarded(1006), 'My Choice: an ending commitment');
});
