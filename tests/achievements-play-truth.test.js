// @ts-check
// The Truth route (S01, S03; https://steamcommunity.com/stats/4164790/achievements) earned by a whole story run the defender plays on its own
// (tools/balance/defender.mjs): on Normal it holds the house and, on quiet mornings, walks to the Abandoned Hospital
// for the three record fragments and the old recorder (pushing the stairwell obstacle aside, paying off raiders,
// leaving when a big one comes), then to the Office Ruins for the torn patient register; it sets the recorder up at
// home and commits with the Military Repair Kit the Day 66 horde leaves. The test starts the run from the title
// screen and only advances the sim; nothing here writes the survivor, the house or a counter. It lets the sim run on
// while the survivor is in the middle of an action (defenderPace).
import test from 'node:test';
import assert from 'node:assert/strict';
import { S, begin, awarded, settle } from './fixtures/play.mjs';
import { defenderStep, defenderPace } from '../tools/balance/defender.mjs';

S.weather ??= await import('../src/sim/weather.js');

test('the survivor brings the hospital records and the recorder home and reads the answer on Normal: The Truth, Deep in the Hospital, Puzzle', async () => {
  const s = begin({ seed: 1026, character: 'wage', difficulty: 'normal' });
  for (let guard = 0; guard < 120 * 144 * 2 && s.phase !== 'dead' && s.phase !== 'ending'; guard++) {
    defenderStep(S, s, { route: 'truth' });
    S.tick.tick(s, defenderPace(s));
  }
  await settle();
  assert.equal(s.phase, 'ending', `the run ended on Day ${S.time.dayNumber(s.clock)} (${s.phase === 'dead' ? S.rebirth.deathCause(s) : ''})`);
  assert.equal(s.run.ending, 'truth');
  assert.ok(awarded(2304), 'Deep in the Hospital: the three hospital clues');
  assert.ok(awarded(1203), 'Puzzle: all four truth clues');
  assert.ok(awarded(1105), 'The Truth: the ending');
  assert.ok(awarded(1006), 'My Choice: an ending commitment');
});
