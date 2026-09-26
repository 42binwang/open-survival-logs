// @ts-check
// Achievements earned at home after the outbreak (S03; https://steamcommunity.com/stats/4164790/achievements), each by playing to its condition
// through the sim's own actions: cooking on the camping stove (src/sim/cooking.js), and the live achievement wiring
// awarding what the sim counted. Where a run is long, the survivor is kept fed and the openings patched between game
// hours; that is only done in runs whose achievements count what the survivor made (a config counter), never where
// the condition reads the survivor's stats or the house.
import test from 'node:test';
import assert from 'node:assert/strict';
import { S, begin, give, until, awarded, settle, HOUR } from './fixtures/play.mjs';

const C = S.cooking;

/** A run past the outbreak (Finish Preparation), at the Wage Slave's apartment. @param {number} seed @param {string} [character] */
function afterOutbreak(seed, character = 'wage') {
  const s = begin({ seed, character });
  assert.ok(S.predisaster.finishPreparation(s));
  assert.equal(s.phase, 'post');
  return s;
}

/** Fed, rested, the openings at full strength (only for runs whose achievements count what the survivor makes). @param {any} s */
function keepUp(s) {
  Object.assign(s.player.stats, { sat: 90, sta: 95, mor: 90, life: 100 });
  for (const f of S.home.doorAndWindows(s)) f.hp = S.home.effectiveMaxHp(f);
}

/** Put the ingredients in the pot and the gas it needs under it, then light it. @param {any} s @param {any} stove @param {number[]} ids */
function cook(s, stove, ids) {
  for (const id of ids) assert.ok(C.addIngredient(s, stove.uid, s.player.backpack, give(s, id)[0].uid).ok, `${id} goes into the pot`);
  for (let k = 0; k < 4 && /fuel/i.test(C.predictDish(s, stove.uid).problem || ''); k++) C.addFuel(s, stove.uid, s.player.backpack, give(s, 8001)[0].uid);
  const r = C.startCooking(s, stove.uid);
  assert.ok(r.ok, r.reason);
  return r.job;
}

const campingStove = (/** @type {any} */ s) => S.home.homeFurniture(s).find((/** @type {any} */ f) => f.cfg === 801);

test('a ham sausage grilled over the camping stove after midnight, done at a quarter to three: Fire It Up and Midnight Kitchen', async () => {
  const s = afterOutbreak(9006);
  const stove = campingStove(s);
  assert.ok(until(s, () => S.time.dayNumber(s.clock) === 2 && S.time.hourOfDay(s.clock) >= 0.2, { step: 300 }), 'past midnight');
  cook(s, stove, [2114]);
  assert.ok(until(s, () => !stove.data.cook.job, { step: 300, max: 6 * HOUR }), 'the dish is done');
  const h = S.time.hourOfDay(s.clock);
  assert.ok(h >= 2.5 && h < 3.5, `done at ${h.toFixed(2)} h, around 3 AM`);
  until(s, () => false, { max: HOUR });
  await settle();
  assert.ok(awarded(2101), 'Fire It Up: the first dish');
  assert.ok(awarded(9006), 'Midnight Kitchen: a meal cooked at 3 AM');
});

test('a month at the camping stove, from grilled sausages to the Farm Breakfast: Home-Style Cooking, A Good Meal and Perfectionism', async () => {
  const s = afterOutbreak(2101);
  const stove = campingStove(s);
  const perfect = () => s.progress.counters['cook.perfect'] || 0;
  for (let n = 0; n < 300 && perfect() < 30 && s.phase === 'post'; n++) {
    // the Farm Breakfast (1004, four ingredients) from Cooking Lv2; a single sausage before that
    cook(s, stove, S.proficiency.profLevel(s, 'cook') >= 2 ? [2117, 2118, 2502, 2114] : [2114]);
    for (let i = 0; i < 100 && stove.data.cook.job; i++) {
      keepUp(s);
      S.tick.tick(s, 600);
    }
  }
  until(s, () => false, { max: HOUR });
  await settle();
  assert.ok(s.progress.counters['cook.count'] >= 30);
  assert.ok(perfect() >= 30, `${perfect()} perfect dishes`);
  assert.ok(awarded(2102), 'Home-Style Cooking: 30 dishes this loop');
  assert.ok(awarded(1212), 'A Good Meal: 10 perfect dishes');
  assert.ok(awarded(2103), 'Perfectionism: 30 perfect dishes this loop');
});

/** Tick until the survivor has worked through the queue, kept up while waiting (see keepUp). @param {any} s @param {number} [max] */
function work(s, max = 6 * HOUR) {
  for (let t = 0; t < max && !S.actions.isIdle(s) && s.phase === 'post'; t += 600) {
    keepUp(s);
    S.tick.tick(s, 600);
  }
  return S.actions.isIdle(s);
}

/** Have a furniture package delivered and installed through the planning queue. @param {any} s @param {number} pkg */
function install(s, pkg) {
  const [inst] = give(s, pkg);
  const cfg = S.db.packageToFurniture[pkg];
  const slot = S.planning.slotsFor(s, cfg)[0];
  assert.ok(slot, `a free slot for ${cfg}`);
  assert.ok(S.planning.queueInstall(s, s.player.backpack, inst.uid, slot.id), `install ${cfg}`);
  assert.ok(work(s), `${cfg} installed`);
  return S.home.homeFurniture(s).find((/** @type {any} */ f) => f.cfg === cfg && f.slot === slot.id);
}

test('two hydroponic stations in the warehouse, spinach and cosmos from seed to harvest: Touch of Green, Balcony Farmer, Flawless Growth and A Room Full of Flowers', async () => {
  const F = S.farming;
  const s = afterOutbreak(2104, 'warehouse');
  // Full-Spectrum Hydroponic Station (60009): no pests, weeds or drought, so a Perfect crop is also a flawless one
  const pots = [install(s, 14019), install(s, 14019)];
  F.queueFarm(s, pots[0].uid, 'research');
  assert.ok(work(s) && F.plantResearched(s), 'planting researched');
  const c = s.progress.counters;
  const done = () => (c['plant.harvest'] || 0) >= 50 && (c['plant.perfect'] || 0) >= 10 && (c['plant.harvest.flower'] || 0) >= 10;
  const SEEDS = [15024, 15037]; // Spinach, Cosmos
  let k = 0;
  for (let h = 0; h < 24 * 90 && !done() && s.phase === 'post'; h++) {
    keepUp(s);
    S.tick.tick(s, HOUR);
    if (!S.actions.isIdle(s)) continue;
    for (const f of pots) {
      const op = F.farmSmartOp(s, f.uid);
      if (op && op !== 'plant') {
        F.queueFarm(s, f.uid, op);
        work(s, 2 * HOUR);
      }
      if (F.freeCapacity(f) > 0) {
        const seed = SEEDS[k++ % SEEDS.length];
        give(s, seed);
        if (F.queuePlanting(s, f.uid, seed, { count: 1 })) work(s, 2 * HOUR);
      }
    }
  }
  until(s, () => false, { max: HOUR });
  await settle();
  assert.ok(done(), `harvests ${c['plant.harvest']}, flawless Perfect ${c['plant.perfect']}, flowers ${c['plant.harvest.flower']}`);
  assert.ok(awarded(2104), 'Touch of Green: the first harvest of your own crops');
  assert.ok(awarded(2105), 'Balcony Farmer: 50 harvests this loop');
  assert.ok(awarded(2106), 'Flawless Growth: 10 Perfect harvests with no anomalies');
  assert.ok(awarded(9003), 'A Room Full of Flowers: 10 flowers harvested');
});

test('the workbench repaired with its manual, then a hundred Door Patch Kits: Tinkerer', async () => {
  const K = S.crafting;
  const s = afterOutbreak(2109);
  const bench = S.home.homeFurniture(s).find((/** @type {any} */ f) => K.isWorkbench(f));
  assert.ok(bench?.broken, 'the starter workbench is broken');
  give(s, 9020);
  assert.ok(S.furnActions.startFurnitureFunction(s, bench.uid, 220));
  assert.ok(work(s) && !bench.broken, 'repaired');
  const DOOR_PATCH = 100;
  assert.ok(K.isRecipeCraftable(s, DOOR_PATCH));
  for (let n = 0; n < 150 && (s.progress.counters['craft.total'] || 0) < 100 && s.phase === 'post'; n++) {
    for (const [id, k] of K.recipeNeeds(DOOR_PATCH)) give(s, id, k);
    assert.ok(K.craftOnce(s, DOOR_PATCH), 'the craft is queued');
    assert.ok(work(s, 4 * HOUR), 'crafted');
  }
  until(s, () => false, { max: HOUR });
  await settle();
  assert.ok(s.progress.counters['craft.total'] >= 100);
  assert.ok(awarded(2109), 'Tinkerer: 100 items crafted');
});

test('mousetraps baited with ham sausage in every free trap spot, emptied and reset for weeks: A-Hunting We Will Go, Indoor Hunter and Rat Catcher', async () => {
  const T = S.traps;
  const s = afterOutbreak(2107);
  const bp = s.inventories[s.player.backpack];
  const MOUSETRAP = 25001;
  const BAIT = 2114;
  const spots = T.trapSlots(s).filter((/** @type {any} */ slot) => !s.home.slots[slot.id] && T.trapFits(s, MOUSETRAP, slot));
  assert.ok(spots.length >= 2, `${spots.length} free trap spots`);
  const c = s.progress.counters;
  const done = () => (c['trap.catch'] || 0) >= 30 && (c.ratCatch || 0) >= 8;
  for (let day = 0; day < 90 && !done() && s.phase === 'post'; day++) {
    for (const slot of spots) {
      let f = S.home.furnitureAt(s, slot.id);
      if (f && f.data.durability <= 0) {
        assert.ok(S.furnActions.startFurnitureFunction(s, f.uid, 'trapRemove'), 'take the worn-out trap back');
        work(s);
        f = null;
      }
      if (!f) {
        T.queuePlaceTrap(s, give(s, MOUSETRAP)[0].uid, slot.id);
        assert.ok(work(s), 'the trap is set');
        f = S.home.furnitureAt(s, slot.id);
        assert.equal(f?.cfg, 'trap');
      }
      // take out the catch, and bait it again
      const hold = s.inventories[f.data.hold];
      for (const it of [...hold.items]) S.inventory.moveItem(s, hold, it.uid, bp, null, null, { allowOverweight: true });
      const bait = s.inventories[f.data.bait];
      if (!bait.items.length) assert.ok(S.inventory.moveItem(s, bp, give(s, BAIT)[0].uid, bait).ok, 'baited');
    }
    for (let h = 0; h < 24; h++) {
      keepUp(s);
      S.tick.tick(s, HOUR);
    }
  }
  until(s, () => false, { max: HOUR });
  await settle();
  assert.ok(done(), `${c['trap.catch']} catches, ${c.ratCatch} rats`);
  assert.ok(awarded(2107), 'A-Hunting We Will Go: the first trap set');
  assert.ok(awarded(2108), 'Indoor Hunter: 30 prey caught');
  assert.ok(awarded(2208), 'Rat Catcher: 8 rats caught');
});
