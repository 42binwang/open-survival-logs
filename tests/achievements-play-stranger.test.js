// @ts-check
// The Stranger route (S01; https://steamcommunity.com/stats/4164790/achievements) earned by a whole story run the defender plays on its own
// (tools/balance/defender.mjs): on Normal the Wage Slave has a word with the people in the hardware store and the
// renovation company before the outbreak, stocks food for more than one, answers every help request by drone in the
// days before the Day 71 check so the network has more than six members alive, commits with the Military Repair Kit
// the Day 66 horde leaves, and flies supply drops to the outposts until twelve have gone out. The test starts the run
// from the title screen and only advances the sim; nothing here writes the survivor, the network, the house or a
// counter. It lets the sim run on while the survivor is in the middle of an action (defenderPace).
import test from 'node:test';
import assert from 'node:assert/strict';
import { S, begin, awarded, settle } from './fixtures/play.mjs';
import { defenderStep, defenderPace } from '../tools/balance/defender.mjs';

S.weather ??= await import('../src/sim/weather.js');

test('the survivor feeds a network of strangers by drone and builds the camp on Normal: Net, Web Weaver', async () => {
  const s = begin({ seed: 1026, character: 'wage', difficulty: 'normal' });
  for (let guard = 0; guard < 120 * 144 && s.phase !== 'dead' && s.phase !== 'ending'; guard++) {
    defenderStep(S, s, { route: 'stranger' });
    S.tick.tick(s, defenderPace(s));
  }
  await settle();
  assert.equal(s.phase, 'ending', `the run ended on Day ${S.time.dayNumber(s.clock)} (${s.phase === 'dead' ? S.rebirth.deathCause(s) : ''})`);
  assert.equal(s.run.ending, 'stranger');
  assert.ok(awarded(1103), 'Net: the Stranger ending');
  assert.ok(awarded(1202), `Web Weaver: 12 outpost deliveries after choosing the stranger path (${s.progress.counters['camp.prep.supply'] || 0})`);
  assert.ok(awarded(1006), 'My Choice: an ending commitment');
});
