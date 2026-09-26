import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { tick } from '../src/sim/tick.js';
import '../src/sim/furnActions.js';
import '../src/sim/autonomy.js';
import { autonomousChoice } from '../src/sim/autonomy.js';
import { addItem, count } from '../src/sim/inventory.js';
import { addEffect } from '../src/sim/stats.js';

function post(seed) {
  const s = newGame({ seed });
  s.phase = 'post';
  s.clock.t = s.clock.outbreakAt + 3600;
  s.run.day = 1;
  return s;
}

test('an idle hungry survivor eats on their own', () => {
  const s = post(41);
  const bp = s.inventories[s.player.backpack];
  addItem(s, bp, 2105);
  s.player.stats.sat = 10;
  assert.equal(autonomousChoice(s).kind, 'eat');
  tick(s, 3 * 3600);
  assert.equal(count(bp, 2105), 0, 'ate the noodles');
});

test('a tense survivor does not act on their own; the setting can disable it', () => {
  const s = post(42);
  const bp = s.inventories[s.player.backpack];
  addItem(s, bp, 2105);
  s.player.stats.sat = 10;
  addEffect(s, 'tense', 10);
  tick(s, 3 * 3600);
  assert.equal(count(bp, 2105), 1, 'tense: no automatic eating');
  const s2 = post(43);
  addItem(s2, s2.inventories[s2.player.backpack], 2105);
  s2.player.stats.sat = 10;
  s2.ui.autonomy = false;
  tick(s2, 3 * 3600);
  assert.equal(count(s2.inventories[s2.player.backpack], 2105), 1, 'autonomy off');
});
