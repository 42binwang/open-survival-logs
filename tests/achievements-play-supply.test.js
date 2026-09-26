// @ts-check
// The Supply Station route (S01, https://steamcommunity.com/stats/4164790/achievements) earned by a whole story run the defender plays on its own
// (tools/balance/defender.mjs): a warehouse worker on Normal holds the house, answers the Supply Point broadcast,
// stocks the house past the station's check (Satiety, items, storage) and commits with the Military Repair Kit the
// Day 66 horde leaves. The test starts the run from the title screen and only advances the sim; nothing here writes
// the survivor, the house or a counter. It lets the sim run on while the survivor is in the middle of an action
// (defenderPace).
import test from 'node:test';
import assert from 'node:assert/strict';
import { S, begin, awarded, settle } from './fixtures/play.mjs';
import { defenderStep, defenderPace } from '../tools/balance/defender.mjs';

S.weather ??= await import('../src/sim/weather.js');

test('a warehouse worker stocks the house and commits to the Supply Station on Normal: Supply Station, Name on the Delivery Slip', async () => {
  const s = begin({ seed: 1026, character: 'warehouse', difficulty: 'normal' });
  for (let guard = 0; guard < 120 * 144 && s.phase !== 'dead' && s.phase !== 'ending'; guard++) {
    defenderStep(S, s, { route: 'supply' });
    S.tick.tick(s, defenderPace(s));
  }
  await settle();
  assert.equal(s.phase, 'ending', `the run ended on Day ${S.time.dayNumber(s.clock)} (${s.phase === 'dead' ? S.rebirth.deathCause(s) : ''})`);
  assert.equal(s.run.ending, 'supply');
  assert.ok(awarded(1108), 'Supply Station: the Iron Barrel Hub ending as the Warehouse Manager');
  assert.ok(awarded(1223), 'Name on the Delivery Slip: three slip clues and the supply station route');
  assert.ok(awarded(1006), 'My Choice: an ending commitment');
});
