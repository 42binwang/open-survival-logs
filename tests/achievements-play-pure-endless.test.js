// @ts-check
// Pure Endless (S03, https://steamcommunity.com/stats/4164790/achievements): a survivor started from the title screen's Endless Mode with only
// the endless starter kit, played by the defender (tools/balance/defender.mjs) through the sim's own actions until
// thirty days are behind it. The test only advances the sim; nothing here writes the survivor, the house or a
// counter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { S, begin, awarded, settle } from './fixtures/play.mjs';
import { defenderStep, defenderPace } from '../tools/balance/defender.mjs';

S.weather ??= await import('../src/sim/weather.js');

test('the defender holds out thirty days in Pure Endless: Hold Out for Thirty Days', async () => {
  const s = begin({ seed: 5, character: 'wage', mode: 'pureEndless' });
  for (let guard = 0; guard < 40 * 144 && s.phase === 'post' && S.time.dayNumber(s.clock) <= 31; guard++) {
    defenderStep(S, s, {});
    S.tick.tick(s, defenderPace(s));
  }
  await settle();
  assert.equal(s.phase, 'post', `alive on Day ${S.time.dayNumber(s.clock)} (${s.phase === 'dead' ? S.rebirth.deathCause(s) : ''})`);
  assert.ok(awarded(2401), 'Limit Break: Endless Mode');
  assert.ok(awarded(2403), `Hold Out for Thirty Days in Pure Endless (Day ${S.time.dayNumber(s.clock)})`);
});
