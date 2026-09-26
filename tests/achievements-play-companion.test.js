// @ts-check
// The Companionship route (S01, https://steamcommunity.com/stats/4164790/achievements) earned by a whole story run the defender plays on its own
// (tools/balance/defender.mjs): a student on Normal looks after the neighbor across the rooftops through the hanging
// basket and commits to staying with her, with the Military Repair Kit the Day 66 horde leaves. The test starts the
// run from the title screen and only advances the sim; nothing here writes the survivor, the neighbor, the house or a
// counter. It lets the sim run on while the survivor is in the middle of an action (defenderPace).
import test from 'node:test';
import assert from 'node:assert/strict';
import { S, begin, awarded, settle } from './fixtures/play.mjs';
import { defenderStep, defenderPace } from '../tools/balance/defender.mjs';

S.weather ??= await import('../src/sim/weather.js');

test('a student commits to the neighbor on Normal: Companionship', async () => {
  const s = begin({ seed: 1026, character: 'student', difficulty: 'normal' });
  for (let guard = 0; guard < 120 * 144 && s.phase !== 'dead' && s.phase !== 'ending'; guard++) {
    defenderStep(S, s, { route: 'companion' });
    S.tick.tick(s, defenderPace(s));
  }
  await settle();
  assert.equal(s.phase, 'ending', `the run ended on Day ${S.time.dayNumber(s.clock)} (${s.phase === 'dead' ? S.rebirth.deathCause(s) : ''})`);
  assert.equal(s.run.ending, 'companion');
  assert.ok(awarded(1107), 'Companionship: the ending as the College Student');
  assert.ok(awarded(1006), 'My Choice: an ending commitment');
});
