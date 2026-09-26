import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { createInventory, addItem, moveItem, count, weightKg, organize, takeFrom } from '../src/sim/inventory.js';
import { dayNumber, hourOfDay, formatClock, secondsUntilOutbreak } from '../src/sim/time.js';
import { tickStats, addEffect, hasEffect, effectiveMax } from '../src/sim/stats.js';
import { homeFloors, furnitureAt, blockedCells, interactionTile, canInstall, dismantle, homeFurniture } from '../src/sim/home.js';
import { findPath } from '../src/sim/scene.js';
import { item, itemName, recipes, plants, crafts, furniture, codex } from '../src/data/db.js';

test('config data is complete', () => {
  assert.equal(Object.keys(recipes).length, 496);
  assert.equal(Object.keys(plants).length, 38);
  assert.equal(Object.keys(crafts).length, 148);
  assert.equal(Object.keys(furniture).length, 1249);
  assert.equal(codex.food.length, 173);
  assert.equal(codex.dish.length, 493);
  assert.equal(codex.furniture.length, 87);
  assert.equal(item(2101).sat, 20);
  assert.ok(itemName(2101).length > 0);
});

test('new game creates a playable pre-disaster state for every character', () => {
  for (const character of ['wage', 'student', 'warehouse']) {
    const s = newGame({ character, seed: 7 });
    assert.equal(s.phase, 'pre');
    assert.equal(s.clock.outbreakAt, 10 * 3600);
    assert.equal(formatClock(s.clock), '08:00');
    assert.equal(secondsUntilOutbreak(s), 36000);
    assert.ok(s.player.money >= 1000);
    assert.ok(homeFurniture(s).length > 10, `${character} has starter furniture`);
    assert.ok(furnitureAt(s, '1F:door'), 'front door installed');
  }
});

test('clock: outbreak evening is Day 1, midnight starts Day 2', () => {
  const s = newGame({ seed: 1 });
  s.clock.t = s.clock.outbreakAt;
  assert.equal(dayNumber(s.clock), 1);
  assert.equal(hourOfDay(s.clock), 18);
  s.clock.t += 6 * 3600;
  assert.equal(dayNumber(s.clock), 2);
});

test('grid inventory places, swaps, merges and respects size', () => {
  const s = newGame({ seed: 2 });
  const inv = createInventory(s, { kind: 'box', w: 4, h: 3, maxKg: 10 });
  const big = addItem(s, inv, 2101); // 4x3 compressed biscuits
  assert.ok(big);
  assert.equal(addItem(s, inv, 2102), null, 'no room left');
  const inv2 = createInventory(s, { kind: 'box', w: 4, h: 4 });
  const a = addItem(s, inv2, 2102);
  const b = addItem(s, inv2, 2125);
  assert.ok(a && b);
  const r = moveItem(s, inv2, a.uid, inv2, b.x, b.y);
  assert.ok(r.ok && r.swapped, 'same-size items swap');
  assert.equal(count(inv2, 2102), 1);
  assert.ok(weightKg(inv) > 3.9);
  assert.equal(takeFrom(s, [inv2.id], 2125, 1), 1);
  assert.equal(count(inv2, 2125), 0);
  addItem(s, inv2, 2118);
  addItem(s, inv2, 2102);
  assert.deepEqual(organize(inv2), []);
});

test('stats decay, effects and max caps', () => {
  const s = newGame({ seed: 3 });
  s.phase = 'post';
  const advance = (sec) => {
    s.clock.t += sec;
    tickStats(s, sec);
  };
  const before = s.player.stats.sat;
  advance(3600 * 5);
  assert.ok(s.player.stats.sat < before);
  addEffect(s, 'bleeding', 2);
  const life = s.player.stats.life;
  advance(3600);
  assert.ok(s.player.stats.life < life);
  advance(3600 * 2);
  assert.equal(hasEffect(s, 'bleeding'), false);
  addEffect(s, 'anemia', 10);
  assert.equal(effectiveMax(s, 'sta'), 75);
});

test('home grid pathfinding reaches furniture interaction tiles', () => {
  const s = newGame({ seed: 4 });
  const floors = homeFloors(s.home.id);
  const f = furnitureAt(s, '1F:r1');
  const [tx, ty] = interactionTile(s, f, s.player);
  const path = findPath(floors['1F'], s.player.x, s.player.y, tx, ty, blockedCells(s, '1F'));
  assert.ok(path && path.length > 0, 'path to bed');
});

test('dismantling starter junk yields materials; install checks slot types', () => {
  const s = newGame({ seed: 5 });
  const pile = furnitureAt(s, '1F:l4');
  assert.equal(pile.data.clutter, true, 'the scene clutter of the living room');
  const mats = dismantle(s, pile.uid);
  assert.ok(mats.length >= 2);
  assert.deepEqual([...mats].sort(), [...furniture[pile.cfg].rmGet].sort(), 'its Config_Furniture RemoveGet');
  assert.equal(furnitureAt(s, '1F:l4'), null);
  assert.equal(canInstall(s, 10000, '1F:l4').ok, true);
  assert.equal(canInstall(s, 30002, '1F:l4').ok, false, 'a door does not fit a large slot');
});
