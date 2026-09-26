// @ts-check
// Challenge-ending achievements (S03, https://steamcommunity.com/stats/4164790/achievements) earned by a whole story run the defender plays on
// its own (tools/balance/defender.mjs): on Relaxed, spending at most half its money before the outbreak and never
// eating meat, fish, eggs or dairy, it holds every door and window above 70 % through all nine hordes. The test
// starts the run from the title screen and only advances the sim; nothing here writes the survivor, the house or a
// counter. It lets the sim run on while the survivor is in the middle of an action (defenderPace).
import test from 'node:test';
import assert from 'node:assert/strict';
import { S, begin, awarded, settle } from './fixtures/play.mjs';
import { defenderStep, defenderPace } from '../tools/balance/defender.mjs';

S.weather ??= await import('../src/sim/weather.js');

test('a frugal vegetarian holds the house on Relaxed to Day 101: Minimal Budget, Flawless, Vegetarianism, Zero Breach', async () => {
  const s = begin({ seed: 2035, character: 'wage', difficulty: 'relaxed' });
  for (let guard = 0; guard < 120 * 144 && s.phase !== 'dead' && s.phase !== 'ending'; guard++) {
    defenderStep(S, s, { frugal: true, vegetarian: true });
    S.tick.tick(s, defenderPace(s));
  }
  await settle();
  assert.equal(s.phase, 'ending', `the run ended on Day ${S.time.dayNumber(s.clock)} (${s.phase === 'dead' ? S.rebirth.deathCause(s) : ''})`);
  assert.equal(s.run.ending, 'lastOne');
  const held = s.run.challenges.join(', ');
  assert.ok(awarded(3003), `Minimal Budget: at most half the money spent before the outbreak (spent ${s.pre.spent} of ${s.pre.budget}; held: ${held})`);
  assert.ok(awarded(3004), `Flawless: doors and windows above 70 % all loop (held: ${held})`);
  assert.ok(awarded(3005), `Vegetarianism: no meat eaten (held: ${held})`);
  const final = s.crises.history.find((/** @type {any} */ h) => h.type === 'horde' && h.final);
  assert.ok(awarded(2207), `Zero Breach: the final horde held above 70 % with 40 kills (${final?.killed} killed, door at ${Math.round((final?.doorMin ?? 0) * 100)} %)`);
});
