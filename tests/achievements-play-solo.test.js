// @ts-check
// Going Solo (S03, https://steamcommunity.com/stats/4164790/achievements) earned by a whole story run the defender plays on its own
// (tools/balance/defender.mjs): on Relaxed it never trades with a trading post (its drone only scavenges), lives on
// what it bought before the outbreak, what the drone brings back and, once its food runs low, what it finds on
// morning outings to the supermarket and the other sites, and holds the house to Day 101. The test starts
// the run from the title screen and only advances the sim; nothing here writes the survivor, the house or a counter.
// It lets the sim run on while the survivor is in the middle of an action (defenderPace).
import test from 'node:test';
import assert from 'node:assert/strict';
import { S, begin, awarded, settle } from './fixtures/play.mjs';
import { defenderStep, defenderPace } from '../tools/balance/defender.mjs';

S.weather ??= await import('../src/sim/weather.js');

test('the survivor never trades with a stranger and holds the house on Relaxed to Day 101: Going Solo', async () => {
  const s = begin({ seed: 1026, character: 'wage', difficulty: 'relaxed' });
  for (let guard = 0; guard < 120 * 144 && s.phase !== 'dead' && s.phase !== 'ending'; guard++) {
    defenderStep(S, s, { solo: true });
    S.tick.tick(s, defenderPace(s));
  }
  await settle();
  assert.equal(s.phase, 'ending', `the run ended on Day ${S.time.dayNumber(s.clock)} (${s.phase === 'dead' ? S.rebirth.deathCause(s) : ''})`);
  assert.equal(s.run.ending, 'lastOne');
  assert.equal(s.progress.counters['trade.active.dealcount'] || 0, 0, 'no trade with a trading post');
  assert.ok(awarded(3006), `Going Solo: the ending without trading with strangers (held: ${s.run.challenges.join(', ')})`);
});
