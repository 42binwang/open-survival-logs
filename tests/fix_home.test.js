import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { tick } from '../src/sim/tick.js';
import { dayStartT } from '../src/sim/time.js';
import '../src/sim/furnActions.js';
import { furnitureFunctions, startFurnitureFunction, reinforceCap } from '../src/sim/furnActions.js';
import { replaceTargets, queueReplaceOpening, slotsFor } from '../src/sim/planning.js';
import { addItem, count } from '../src/sim/inventory.js';
import { hasEffect, MENTAL_BLOCK } from '../src/sim/stats.js';
import { containerRate, TERRACE_SPOIL } from '../src/sim/spoilage.js';
import { furnitureAt, createFurniture, dropToFloor, effectiveMaxHp, allSlots } from '../src/sim/home.js';
import { makeInstance } from '../src/sim/inventory.js';

const HOUR = 3600;
const bp = (s) => s.inventories[s.player.backpack];

function post(opts = {}, day = 3, hour = 10) {
  const s = newGame({ seed: 88, ...opts });
  s.phase = 'post';
  s.clock.t = dayStartT(s.clock, day) + hour * HOUR;
  s.run.day = day;
  return s;
}

test('an overloaded backpack makes the survivor Encumbered until the load comes off', () => {
  const s = post();
  const pack = bp(s);
  tick(s, 60);
  assert.equal(hasEffect(s, 'encumbered'), false);
  pack.maxKg = 1;
  addItem(s, pack, 2103, { allowOverweight: true }); // a sack of rice
  tick(s, 60);
  assert.equal(hasEffect(s, 'encumbered'), true, 'over the carry limit');
  pack.items = [];
  tick(s, 60);
  assert.equal(hasEffect(s, 'encumbered'), false);
});

test('a breakdown that lasts for hours leaves a Mental Block behind', () => {
  const s = post();
  for (let h = 0; h < MENTAL_BLOCK.afterHours + 1; h++) {
    Object.assign(s.player.stats, { mor: 0, life: 100, sat: 80, sta: 80 });
    tick(s, HOUR);
  }
  assert.equal(hasEffect(s, 'mentalBlock'), true);
});

test('food kept on the terrace spoils a little faster than indoors, in furniture and floor boxes alike', () => {
  const s = post();
  s.home.unlocked['2F'] = true;
  const terrace = allSlots(s).find((sl) => sl.floor === '2F' && sl.outdoor && !s.home.slots[sl.id] && !sl.trap);
  const indoor = createFurniture(s, 10001, allSlots(s).find((sl) => sl.floor === '1F' && !s.home.slots[sl.id] && !sl.trap && sl.type === 2)?.id || '1F:l7');
  const outdoor = createFurniture(s, 10001, terrace.id);
  const rIn = containerRate(s, s.inventories[indoor.inv]);
  const rOut = containerRate(s, s.inventories[outdoor.inv]);
  assert.ok(Math.abs(rOut / rIn - TERRACE_SPOIL) < 1e-9, `${rOut} vs ${rIn}`);
  const box = dropToFloor(s, makeInstance(s, 2125), '2F', terrace.x, terrace.y + 1);
  assert.equal(s.inventories[box.inv].outdoor, true);
  const inside = dropToFloor(s, makeInstance(s, 2125), '1F', s.player.x, s.player.y);
  assert.ok(!s.inventories[inside.inv].outdoor);
});

test('an upgraded door replaces the front door in place; the old upgrade comes back as a package', () => {
  const s = post();
  const door = furnitureAt(s, '1F:door');
  const pkg = addItem(s, bp(s), 14039); // Titanium Alloy Door package
  const cfg = 30002;
  assert.equal(slotsFor(s, cfg).length, 0, 'no empty door slot');
  assert.deepEqual(replaceTargets(s, cfg).map((x) => x.id), ['1F:door']);
  assert.ok(queueReplaceOpening(s, s.player.backpack, pkg.uid, '1F:door'));
  tick(s, 3 * HOUR);
  const titan = furnitureAt(s, '1F:door');
  assert.equal(titan.cfg, cfg);
  assert.equal(titan.hp, effectiveMaxHp(titan), 'fresh at full durability');
  assert.equal(s.furniture[door.uid], undefined, 'the starter door is scrapped');
  assert.equal(count(bp(s), 14039), 0);
  const sec = addItem(s, bp(s), 14007); // Security Door package
  assert.ok(queueReplaceOpening(s, s.player.backpack, sec.uid, '1F:door'));
  tick(s, 3 * HOUR);
  assert.equal(furnitureAt(s, '1F:door').cfg, 30001);
  assert.equal(count(bp(s), 14039), 1, 'the titanium door is packed back up');
});

test('reinforcing near the cap never pushes durability past the maximum', () => {
  const s = post();
  s.story.tags.advancedReinforce = true;
  const door = furnitureAt(s, '1F:door');
  const reinforce = furnitureFunctions(s, door).find((f) => f.spec.kind === 'reinforce' && f.spec.amount === 400);
  assert.ok(reinforce, 'enhanced reinforcement');
  door.reinforce = reinforceCap(s, door, reinforce.spec) - 100; // room for only 100 more
  addItem(s, bp(s), reinforce.spec.need[0][0]);
  door.hp = effectiveMaxHp(door);
  const before = door.hp;
  startFurnitureFunction(s, door.uid, reinforce.key);
  tick(s, 2 * HOUR);
  assert.equal(door.reinforce, reinforceCap(s, door, reinforce.spec));
  assert.equal(door.hp, before + 100, 'durability grows by what the cap allowed');
  assert.equal(door.hp, effectiveMaxHp(door));
});
