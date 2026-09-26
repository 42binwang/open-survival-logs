import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { tick } from '../src/sim/tick.js';
import { enqueue, isIdle } from '../src/sim/actions.js';
import '../src/sim/furnActions.js';
import { furnitureFunctions, startFurnitureFunction } from '../src/sim/furnActions.js';
import { useItemAction } from '../src/sim/itemuse.js';
import { furnitureAt } from '../src/sim/home.js';
import { addItem, count } from '../src/sim/inventory.js';
import { saveGame, loadGame, listSaves, _resetStorage } from '../src/engine/save.js';
import { tickSpoilage } from '../src/sim/spoilage.js';

function postDisaster(seed = 11) {
  const s = newGame({ seed });
  s.phase = 'post';
  s.clock.t = s.clock.outbreakAt + 3 * 3600; // 21:00 on Day 1
  s.run.day = 1;
  return s;
}

test('walking to the bed and sleeping restores stamina', () => {
  const s = postDisaster();
  s.player.stats.sta = 20;
  const bed = furnitureAt(s, '1F:r1');
  const funcs = furnitureFunctions(s, bed);
  const sleep = funcs.find((f) => f.spec.kind === 'sleep');
  assert.ok(sleep, 'bed offers sleep');
  startFurnitureFunction(s, bed.uid, sleep.key);
  tick(s, 60 * 60);
  assert.equal(s.player.sleeping, true);
  tick(s, 7 * 3600);
  assert.equal(s.player.sleeping, false);
  assert.ok(s.player.stats.sta > 80, `stamina restored (${s.player.stats.sta})`);
  assert.ok(isIdle(s));
});

test('eating food from the backpack takes time and restores satiety', () => {
  const s = postDisaster(12);
  s.player.stats.sat = 30;
  const inst = addItem(s, s.inventories[s.player.backpack], 2105); // instant noodles
  enqueue(s, useItemAction(s, s.player.backpack, inst.uid, 'eat'));
  tick(s, 60);
  assert.equal(count(s.inventories[s.player.backpack], 2105), 1, 'still eating');
  tick(s, 30 * 60);
  assert.equal(count(s.inventories[s.player.backpack], 2105), 0);
  assert.ok(s.player.stats.sat > 30);
  assert.ok(s.progress.codexRun.food.includes(2105));
});

test('fixing the door costs stamina and restores durability', () => {
  const s = postDisaster(13);
  const door = furnitureAt(s, '1F:door');
  door.hp = 400;
  const fix = furnitureFunctions(s, door).find((f) => f.spec.kind === 'repair' && f.spec.amount === 100);
  assert.ok(fix);
  const sta = s.player.stats.sta;
  startFurnitureFunction(s, door.uid, fix.key);
  tick(s, 2 * 3600);
  assert.equal(door.hp, 500);
  assert.ok(s.player.stats.sta < sta);
});

test('food spoils into fertilizer, fridge slows it down', () => {
  const s = postDisaster(14);
  const bp = s.inventories[s.player.backpack];
  addItem(s, bp, 2125); // banana, 5 day life
  const fridge = furnitureAt(s, '1F:k1');
  addItem(s, s.inventories[fridge.inv], 2125);
  tickSpoilage(s, 8 * 86400);
  assert.equal(count(bp, 2125), 0, 'banana rotted in the backpack');
  assert.equal(count(bp, 15501), 1, 'into basic fertilizer');
  assert.equal(count(s.inventories[fridge.inv], 2125), 1, 'banana still fresh in the fridge');
  assert.equal(s.progress.taboo.foodRot, true);
});

test('save and load round-trips the whole state', () => {
  _resetStorage();
  const s = postDisaster(15);
  addItem(s, s.inventories[s.player.backpack], 2101);
  saveGame('slot1', s);
  const loaded = loadGame('slot1');
  assert.ok(loaded);
  assert.equal(loaded.state.meta.id, s.meta.id);
  assert.equal(count(loaded.state.inventories[loaded.state.player.backpack], 2101), 1);
  assert.equal(listSaves().length, 1);
});
