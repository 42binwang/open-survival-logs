// @ts-check
// A trip between scenes is not watched in real time: once the survivor is out of the door, one frame of the game
// loop (src/game.js step) takes the trip's minutes off the clock and puts the survivor at the destination.
import test from 'node:test';
import assert from 'node:assert/strict';
import { game, startRun, step } from '../src/game.js';
import { startTravel, travelSeconds } from '../src/sim/predisaster.js';
import { tick } from '../src/sim/tick.js';

test('a trip to the market takes one frame of real time and its minutes off the clock', () => {
  const s = /** @type {any} */ (startRun({ character: 'wage', seed: 4242, difficulty: 'normal', skipPrologue: true, slot: 'trip-skip-test' }));
  game.paused = false;
  s.clock.speed = 1;
  const dest = 'market';
  const trip = travelSeconds(s, s.pre.location || 'home', dest);
  assert.ok(trip >= 10 * 60, `a real trip (${trip / 60} min)`);
  assert.ok(startTravel(s, dest), 'set out');
  // the walk to the front door plays out as usual
  for (let i = 0; i < 2000 && s.actions.current?.phase !== 'work'; i++) tick(s, 1);
  assert.equal(s.actions.current?.phase, 'work', 'out of the door');
  const before = s.clock.t;
  step(1 / 60);
  assert.equal(s.pre.location, dest, 'arrived after one frame');
  assert.ok(s.player.scene.startsWith('shop:'), 'in the shop');
  const spent = s.clock.t - before;
  assert.ok(spent >= trip - 60 && spent <= trip + 120, `the trip's time is taken off the clock (${spent / 60} of ${trip / 60} min)`);
});

test('an ordinary action still runs at game speed', () => {
  const s = /** @type {any} */ (startRun({ character: 'wage', seed: 4243, difficulty: 'normal', skipPrologue: true, slot: 'trip-skip-test-2' }));
  game.paused = false;
  s.clock.speed = 1;
  const before = s.clock.t;
  step(0.1);
  assert.ok(s.clock.t - before <= 0.1 * 60 + 1e-6, 'a tenth of a real second is six game seconds at speed 1');
});
