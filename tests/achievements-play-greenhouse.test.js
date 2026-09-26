// @ts-check
// The Doomsday Greenhouse route (S01; https://steamcommunity.com/stats/4164790/achievements) earned by a whole story run the defender plays on
// its own (tools/balance/defender.mjs): on Normal the College Student buys grow-lamp boxes, a few pots and seeds at the
// farmers market, a UPS, a manual generator and two electric heaters at the renovation company; after the outbreak
// she makes the rest of two dozen planters at the workbench from waste plastic it trades for, clears the basement and
// takes apart furniture it has no use for to set them up, sows flowers under the lamps and mushrooms in the dark, keeps
// the lamps powered and every floor warm, and commits with the Military Repair Kit the Day 66 horde leaves (the drone
// fetches it from the yard). The test starts the run from the title screen and only advances the sim; nothing here
// writes the survivor, the house, a planter or a counter. It lets the sim run on while the survivor is in the middle
// of an action (defenderPace).
import test from 'node:test';
import assert from 'node:assert/strict';
import { S, begin, awarded, settle } from './fixtures/play.mjs';
import { defenderStep, defenderPace } from '../tools/balance/defender.mjs';

S.weather ??= await import('../src/sim/weather.js');

test('the College Student turns the house into a greenhouse through the winter on Normal: Greenhouse', async () => {
  const s = begin({ seed: 1026, character: 'student', difficulty: 'normal' });
  for (let guard = 0; guard < 120 * 144 && s.phase !== 'dead' && s.phase !== 'ending'; guard++) {
    defenderStep(S, s, { route: 'greenhouse' });
    S.tick.tick(s, defenderPace(s));
  }
  await settle();
  assert.equal(s.phase, 'ending', `the run ended on Day ${S.time.dayNumber(s.clock)} (${s.phase === 'dead' ? S.rebirth.deathCause(s) : ''})`);
  assert.equal(s.run.ending, 'greenhouse');
  assert.ok(S.farming.homePlanters(s).length >= 24, `${S.farming.homePlanters(s).length} planters at home`);
  assert.ok(awarded(1106), 'Greenhouse: the Doomsday Greenhouse ending as the College Student');
  assert.ok(awarded(1006), 'My Choice: an ending commitment');
});
