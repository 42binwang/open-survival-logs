// @ts-check
// Ending achievements earned by a whole story run the defender plays on its own (tools/balance/defender.mjs; S03,
// https://steamcommunity.com/stats/4164790/achievements). The test starts the run from the title screen and only advances the sim: the defender
// acts through the sim's own actions (shopping, travel, installs, repairs, crafts, trades, the rescue beacon), and
// nothing here writes the survivor's stats, the house or any counter. The run is long, so the test lets the sim run
// on while the survivor is in the middle of an action (defenderPace), which changes nothing the sim computes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { S, begin, awarded, settle } from './fixtures/play.mjs';
import { defenderStep, defenderPace } from '../tools/balance/defender.mjs';
import { continueAfterEnding } from '../src/sim/endings.js';

S.weather ??= await import('../src/sim/weather.js');

/**
 * Let the defender play until the run ends, or until `done()`.
 * @param {any} s @param {import('../tools/balance/defender.mjs').DefenderOptions} opts @param {() => boolean} [done]
 */
function play(s, opts, done = () => false) {
  for (let guard = 0; guard < 200 * 144 && s.phase !== 'dead' && s.phase !== 'ending' && !done(); guard++) {
    defenderStep(S, s, opts);
    S.tick.tick(s, defenderPace(s));
  }
}

test('on Hard, the Wage Slave builds the rescue beacon, commits to Evacuate and is flown out on Day 101: Evacuate, My Choice, four challenge endings, Meat Grinder, Breakthrough, Extraordinary; then Refusing to Take a Bow and Threat Level 8', async () => {
  const s = begin({ seed: 3044, character: 'wage', difficulty: 'hard' });
  play(s, { route: 'evacuate' });
  await settle();
  assert.equal(s.phase, 'ending', `the run ended on Day ${S.time.dayNumber(s.clock)} (${s.phase === 'dead' ? S.rebirth.deathCause(s) : ''})`);
  assert.equal(s.run.ending, 'evacuate');
  assert.equal(s.story.route, 'evacuate');
  assert.ok(awarded(1006), 'My Choice: committed to a route');
  assert.ok(awarded(1101), 'Evacuate: the Rescue ending');
  // the challenge endings this run held: no rebirth, never out of the house, never the neighbor's storyline, Life
  // never under 20 %
  for (const id of [3001, 3002, 3007, 3008]) assert.ok(awarded(id), `challenge ending ${id} (held: ${s.run.challenges.join(', ')})`);
  // the spike barriers and the counterattacks through the door kill most of Hard's bigger hordes
  assert.ok(awarded(2202), `Meat Grinder: 400 zombies killed in the loop (${s.progress.kills})`);
  // daily washing, baths and push-ups, and the books the School Shelter trades, raise the maxima past 150
  assert.ok(awarded(2011), 'Breakthrough: a maximum above 150');
  assert.ok(awarded(2012), `Extraordinary: three maxima above 150 (${JSON.stringify(s.player.max)})`);
  // the ending screen's "keep holding the house": Story Endless
  assert.ok(continueAfterEnding(s));
  await settle();
  assert.ok(awarded(2401), 'Limit Break: Endless Mode');
  assert.ok(awarded(2402), 'Refusing to Take a Bow: Story Endless after an ending');
  // the house holds on through the endless hordes, each one raising the threat level
  play(s, { route: 'evacuate' }, () => (s.crises.threat || 0) >= 8);
  await settle();
  assert.equal(s.phase, 'post', `still holding out on Day ${S.time.dayNumber(s.clock)} (${s.phase === 'dead' ? S.rebirth.deathCause(s) : ''})`);
  assert.ok(awarded(2404), `Threat Level 8 in Endless Mode (threat ${s.crises.threat} on Day ${S.time.dayNumber(s.clock)})`);
});
