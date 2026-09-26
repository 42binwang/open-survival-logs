import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { tick } from '../src/sim/tick.js';
import '../src/sim/furnActions.js';
import { placeTrap, trapSlots, rollCatch, catchChancePerHour, queuePlaceTrap, removeTrap, RAT_IDS } from '../src/sim/traps.js';
import { offerWishes, chooseWish, isWished, useMentalToughness } from '../src/sim/wishes.js';
import { eatItem } from '../src/sim/itemuse.js';
import { addItem, count } from '../src/sim/inventory.js';
import { furnitureAt } from '../src/sim/home.js';
import { bumpMods } from '../src/sim/modifiers.js';

function post(seed) {
  const s = newGame({ seed });
  s.phase = 'post';
  s.clock.t = s.clock.outbreakAt + 3600;
  s.run.day = 1;
  return s;
}

test('placing a trap from the backpack, baiting it and catching prey', () => {
  const s = post(31);
  const bp = s.inventories[s.player.backpack];
  const trap = addItem(s, bp, 25001);
  const slot = trapSlots(s, '1F')[0];
  queuePlaceTrap(s, trap.uid, slot.id);
  tick(s, 3600);
  const f = furnitureAt(s, slot.id);
  assert.ok(f && f.cfg === 'trap');
  assert.equal(count(bp, 25001), 0);
  assert.equal(s.progress.counters['trap.place'], 1);
  assert.equal(catchChancePerHour(s, f), 0, 'no bait, no catch');
  addItem(s, s.inventories[f.data.bait], 2102);
  assert.ok(catchChancePerHour(s, f) > 0);
  const prey = rollCatch(s, f);
  assert.ok(prey);
  assert.equal(s.progress.counters['trap.catch'], 1);
  assert.ok(s.progress.codexRun.prey.includes(prey));
  if (RAT_IDS.has(prey)) assert.equal(s.progress.counters.ratCatch, 1);
  assert.equal(f.data.durability, f.data.maxDurability - 1);
  assert.equal(count(s.inventories[f.data.bait], 2102), 0, 'bait consumed');
  removeTrap(s, f.uid);
  assert.equal(furnitureAt(s, slot.id), null);
  assert.ok(count(bp, prey) === 1 && count(bp, 25001) === 1, 'catch and trap returned');
});

test('traps catch over time with bait; bird nets only work outdoors', () => {
  const s = post(32);
  s.home.unlocked['2F'] = true;
  const f = placeTrap(s, 25001, trapSlots(s, '1F')[0].id);
  for (let i = 0; i < 6; i++) addItem(s, s.inventories[f.data.bait], 2102);
  tick(s, 3 * 86400);
  assert.ok((s.progress.counters['trap.catch'] || 0) >= 1, 'caught something in 3 days');
  const outdoor = trapSlots(s, '2F').find((x) => x.outdoor);
  const net = placeTrap(s, 25003, outdoor.id);
  assert.equal(net.data.habitat, 'outdoor');
});

test('daily wish offer, choosing, fulfilling, and mental toughness', () => {
  const s = post(33);
  const ids = offerWishes(s);
  assert.equal(ids.length, 3);
  chooseWish(s, ids[0]);
  assert.ok(isWished(s, ids[0]));
  const pp = s.loop.planningPoints;
  const inst = addItem(s, s.inventories[s.player.backpack], ids[0]);
  eatItem(s, s.inventories[s.player.backpack], inst);
  assert.equal(s.run.wish.done, true);
  assert.equal(s.loop.planningPoints, pp + 10);
  assert.equal(useMentalToughness(s), false, 'needs the ability');
  s.loop.abilities.mentalToughness = 1;
  bumpMods(s);
  s.player.stats.mor = 10;
  assert.equal(useMentalToughness(s), true);
  assert.ok(s.player.stats.mor >= 40);
  assert.equal(useMentalToughness(s), false, 'once per day');
});
