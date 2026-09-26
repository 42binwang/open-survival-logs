import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { tick } from '../src/sim/tick.js';
import { isIdle } from '../src/sim/actions.js';
import '../src/sim/furnActions.js';
import { eatItem } from '../src/sim/itemuse.js';
import { homeFurniture, installFurniture, interactionTile } from '../src/sim/home.js';
import { slotsFor } from '../src/sim/planning.js';
import { addItem, count } from '../src/sim/inventory.js';
import { hasEffect } from '../src/sim/stats.js';
import { getMods } from '../src/sim/modifiers.js';
import { addProfExp } from '../src/sim/proficiency.js';
import { item, recipe, packageToFurniture } from '../src/data/db.js';
import { on } from '../src/engine/bus.js';
import {
  BREW,
  STUDENT_RECIPES,
  matchRecipe,
  resolveTier,
  ingredientTier,
  qualityIndex,
  qualityRoll,
  qualityChances,
  cookerConfig,
  cookerState,
  allowedRecipes,
  recipeUsable,
  heatFor,
  addIngredient,
  addFuel,
  predictDish,
  startCooking,
  cancelCooking,
  tickCooking,
  cookSources,
  fridgeInventories,
  cookbook,
  potHints,
  fillRecipe,
  startHotPot,
  eatHotPot,
  brewStatus,
  startBrewing,
  pressState,
  pressSources,
  pressPreview,
  addToPress,
  startPress,
} from '../src/sim/cooking.js';

function postDisaster(opts = {}) {
  const s = newGame({ seed: 21, ...opts });
  s.phase = 'post';
  s.clock.t = s.clock.outbreakAt + 3 * 3600; // 21:00 on Day 1
  s.run.day = 1;
  return s;
}

const backpack = (s) => s.inventories[s.player.backpack];
const give = (s, id) => addItem(s, backpack(s), id, { allowOverweight: true });

function fill(s, f, ids) {
  for (const id of ids) {
    const r = addIngredient(s, f.uid, s.player.backpack, give(s, id).uid);
    assert.ok(r.ok, `${id}: ${r.reason}`);
  }
}

function fuelUp(s, f, id = 8001) {
  const r = addFuel(s, f.uid, s.player.backpack, give(s, id).uid);
  assert.ok(r.ok, r.reason);
}

// Starter furniture by config id (Wage Slave: fuel stove 801, side-by-side fridge 15000).
const starter = (s, cfg) => homeFurniture(s).find((f) => f.cfg === cfg);

function install(s, cfg) {
  s.home.unlocked['2F'] = true;
  const [slot] = slotsFor(s, cfg);
  assert.ok(slot, `a free slot for ${cfg}`);
  const r = installFurniture(s, cfg, slot.id);
  assert.ok(r.ok, `install ${cfg} at ${slot.id}: ${r.reason}`);
  return r.f;
}

// The survivor stands at the cooker, as after opening its panel.
function standAt(s, f) {
  s.player.floor = f.floor;
  [s.player.x, s.player.y] = interactionTile(s, f, s.player);
}

test('an exact ingredient set makes the special dish even when a tag combo would also fit', () => {
  const special = matchRecipe([2202, 2536, 2527]); // short ribs + corn + potato
  assert.equal(special.recipe.id, 2009);
  assert.equal(special.special, true);
  assert.equal(matchRecipe([2527, 2202, 2536]).recipe.id, 2009, 'order does not matter');
  const generic = matchRecipe([2202, 2536, 2530]); // same tags (meat, veg, veg) with spinach instead
  assert.equal(generic.recipe.id, 6015);
  assert.equal(generic.special, false);
  assert.equal(generic.tier, 1);
});

test('tag-combo dishes take their tier from ingredient prices', () => {
  assert.equal(matchRecipe([2114, 2530]).recipe.id, 7001, 'ham sausage ($5) + spinach: low-grade stew');
  assert.equal(matchRecipe([2115, 2530]).recipe.id, 5001, 'luncheon meat ($30): mid-grade stew');
  assert.equal(matchRecipe([2202, 2530]).recipe.id, 6001, 'short ribs ($150): high-grade stew');
  assert.equal(ingredientTier(item(2530)), 3);
  assert.equal(ingredientTier(item(2528)), 2, 'cabbage $20 is above the vegetable mid line (16)');
  assert.equal(ingredientTier(item(2535)), 1, 'pumpkin $70 is above the vegetable high line (30)');
  assert.equal(resolveTier([2502, 2103]), null, 'staples have no price tier');
  assert.equal(resolveTier([2530, 2202]), 1, 'the best ingredient decides');
});

test('ingredients that fit no recipe become Dark Cuisine, and cookers restrict recipes', () => {
  const dark = matchRecipe([2150, 2153]); // salt + sugar
  assert.equal(dark.recipe.id, 100);
  assert.equal(dark.dark, true);
  assert.equal(dark.recipe.out[3], 8100);
  const s = postDisaster();
  const stove = cookerConfig(starter(s, 801));
  assert.equal(matchRecipe([2539], { allowed: allowedRecipes(stove) }).recipe.id, 100, 'no watermelon juice on a stove');
  const juicer = cookerConfig(install(s, 50004));
  assert.equal(matchRecipe([2539], { allowed: allowedRecipes(juicer) }).recipe.id, 4037);
  assert.equal(matchRecipe([2114, 2530], { allowed: allowedRecipes(juicer) }).recipe.id, 100);
});

test('a fuel stove needs fuel, and cooking wine is not fuel', () => {
  const s = postDisaster();
  const stove = starter(s, 801);
  const d = cookerState(s, stove);
  fill(s, stove, [2114, 2530]);
  assert.match(predictDish(s, stove.uid).problem, /fuel/i);
  assert.equal(startCooking(s, stove.uid).ok, false);
  const wine = give(s, 2157);
  const r = addFuel(s, stove.uid, s.player.backpack, wine.uid);
  assert.equal(r.ok, false);
  assert.match(r.reason, /cooking wine/i);
  assert.equal(count(backpack(s), 2157), 1, 'the wine goes back to the backpack');
  fuelUp(s, stove);
  const plan = predictDish(s, stove.uid);
  assert.equal(plan.problem, null);
  assert.equal(plan.heat, item(8001).burn);
  assert.equal(plan.heatNeed, heatFor(plan.cfg, recipe(7001).time));
  assert.ok(startCooking(s, stove.uid).ok);
  assert.equal(s.inventories[d.fuel].items.length, 0, 'the canister was burned');
  assert.equal(d.heat, item(8001).burn - plan.heatNeed, 'leftover heat stays in the stove');
});

test('electric cookers need power and run on their own', () => {
  const s = postDisaster();
  const mw = install(s, 50001);
  fill(s, mw, [2114, 2530]);
  mw.powered = false;
  const r = startCooking(s, mw.uid);
  assert.equal(r.ok, false);
  assert.match(r.reason, /power/i);
  mw.powered = true;
  const { job } = startCooking(s, mw.uid);
  assert.equal(job.tend, false);
  assert.ok(isIdle(s), 'the survivor is free while the microwave works');
  mw.powered = false;
  tickCooking(s, 3600);
  assert.equal(job.done, 0, 'a blackout pauses the microwave');
  mw.powered = true;
  tickCooking(s, 3600);
  assert.equal(job.done, 3600);
});

test('stove cooking completes over time and puts the dish in the cooker output', () => {
  const s = postDisaster();
  const stove = starter(s, 801);
  const d = cookerState(s, stove);
  standAt(s, stove);
  fill(s, stove, [2114, 2530]);
  fuelUp(s, stove);
  const { job } = startCooking(s, stove.uid);
  assert.equal(job.recipe, 7001);
  assert.equal(job.tend, true, 'a stove needs the survivor beside it');
  assert.equal(s.inventories[d.pot].items.length, 0, 'ingredients are in the pot');
  tick(s, 3600);
  assert.ok(Math.abs(job.done - 3600) < 1, `tended for an hour (${job.done})`);
  tick(s, job.dur);
  assert.equal(d.job, null);
  const out = s.inventories[d.out].items;
  assert.equal(out.length, 1);
  assert.equal(out[0].id, recipe(7001).out[job.quality]);
  assert.ok(isIdle(s));
});

test('cancelling returns the ingredients and the heat', () => {
  const s = postDisaster();
  const stove = starter(s, 801);
  const d = cookerState(s, stove);
  fill(s, stove, [2114, 2530]);
  fuelUp(s, stove);
  startCooking(s, stove.uid);
  assert.equal(s.actions.queue[0]?.kind, 'cookTend');
  assert.ok(cancelCooking(s, stove.uid));
  assert.deepEqual(s.inventories[d.pot].items.map((i) => i.id).sort(), [2114, 2530]);
  assert.equal(d.heat, item(8001).burn);
  assert.equal(s.actions.queue.length, 0);
});

test('quality follows the recipe QualityMap and cooking proficiency', () => {
  const q = recipe(5001).q; // [0, 30, 70, 90]
  assert.equal(qualityIndex(95, q), 0);
  assert.equal(qualityIndex(75, q), 1);
  assert.equal(qualityIndex(40, q), 2);
  assert.equal(qualityIndex(10, q), 3);
  assert.equal(qualityIndex(99, recipe(100).q), 3, 'Dark Cuisine is always a failure');
  const s = postDisaster();
  const cfg = cookerConfig(starter(s, 801));
  const one = [give(s, 2530)];
  const three = [give(s, 2202), give(s, 2536), give(s, 2530)];
  const single = qualityChances(qualityRoll(s, cfg, one), q);
  assert.equal(single[3], 0, 'a single ingredient cannot fail at Lv1');
  const combo = qualityChances(qualityRoll(s, cfg, three), q);
  assert.ok(combo[3] > 0, 'a three-ingredient dish can fail');
  assert.ok(Math.abs(combo.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  s.progress.prof.cook.lv = 5;
  const expert = qualityChances(qualityRoll(s, cfg, three), q);
  assert.ok(expert[0] > combo[0], 'proficiency raises the Perfect chance');
  assert.deepEqual(qualityChances(qualityRoll(s, cfg, one), q, true), [0, 0, 0, 1]);
});

test('finished dishes count for achievements, the codex and cooking proficiency', () => {
  const s = postDisaster();
  const mw = install(s, 50001);
  getMods(s).cookQuality = 200;
  const cookOnce = () => {
    fill(s, mw, [2114, 2530]);
    const { job } = startCooking(s, mw.uid);
    tickCooking(s, job.dur);
    return job;
  };
  const job = cookOnce();
  assert.equal(job.quality, 0);
  assert.equal(s.progress.counters['cook.count'], 1);
  assert.equal(s.progress.counters['cook.perfect'], 1);
  assert.equal(s.progress.counters['cook.midnight'], undefined);
  assert.ok(s.progress.codexRun.dish.includes(7001));
  const r = recipe(7001);
  assert.equal(s.progress.prof.cook.exp, r.exp + r.discExp, 'first time pays the discovery bonus');
  s.clock.t += 6 * 3600 - (s.clock.t % 3600); // 03:00 the next morning
  cookOnce();
  assert.equal(s.progress.prof.cook.exp, 2 * r.exp + r.discExp, 'no discovery bonus the second time');
  assert.equal(s.progress.counters['cook.count'], 2);
  assert.equal(s.progress.counters['cook.midnight'], 1, 'Midnight Kitchen');
  const dark = postDisaster();
  const mw2 = install(dark, 50001);
  fill(dark, mw2, [2150, 2153]);
  tickCooking(dark, startCooking(dark, mw2.uid).job.dur);
  assert.equal(dark.inventories[mw2.data.cook.out].items[0].id, 8100);
  assert.equal(dark.progress.counters['cook.count'], undefined, 'Dark Cuisine is not a successful dish');
});

test('multi-use ingredients give one portion; large ones must be cut first', () => {
  const s = postDisaster();
  const stove = starter(s, 801);
  const turkey = give(s, 2324);
  const r = addIngredient(s, stove.uid, s.player.backpack, turkey.uid);
  assert.equal(r.ok, false);
  assert.match(r.reason, /cut/i);
  assert.equal(count(backpack(s), 2324), 1);
  fill(s, stove, [2301, 2530]); // pork chop pack (5 uses) + spinach
  fuelUp(s, stove);
  assert.ok(startCooking(s, stove.uid).ok);
  const pack = backpack(s).items.find((i) => i.id === 2301);
  assert.equal(pack?.uses, 4, 'the rest of the pack is returned');
});

test('Cooking Lv2 lets cookers take ingredients straight from the fridge', () => {
  const s = postDisaster();
  const fridge = starter(s, 15000);
  assert.deepEqual(cookSources(s), [s.player.backpack]);
  const toasts = [];
  const off = on('toast', (t) => toasts.push(t.text));
  addProfExp(s, 'cook', 600);
  off();
  assert.equal(s.progress.prof.cook.lv, 2);
  assert.ok(cookSources(s).includes(fridge.inv));
  assert.ok(toasts.some((t) => /fridge/i.test(t)), 'the player is told');
  addItem(s, s.inventories[fridge.inv], 2530);
  const stove = starter(s, 801);
  assert.ok(fillRecipe(s, stove.uid, 4044).ok, 'spinach pulled from the fridge');
  assert.equal(count(s.inventories[fridge.inv], 2530), 0);
});

test('the cookbook keeps a stable order, reports missing ingredients and fills the pot', () => {
  const s = postDisaster();
  const stove = starter(s, 801);
  const before = cookbook(s, stove.uid);
  assert.deepEqual(
    before.entries.map((e) => e.recipe.id).sort(),
    [4043, 4044, 5002, 5003, 5006],
    'Lv1 shows the basic recipes'
  );
  assert.ok(before.hidden > 400, 'the rest wait to be discovered');
  assert.deepEqual(before.entries.find((e) => e.recipe.id === 4043).missing, [{ id: 2528 }]);
  give(s, 2530);
  const after = cookbook(s, stove.uid);
  assert.equal(after.entries[0].recipe.id, 4044);
  assert.equal(after.entries[0].status, 'ready');
  const rest = (book) => book.entries.map((e) => e.recipe.id).filter((id) => id !== 4044);
  assert.deepEqual(rest(after), rest(before), 'unchanged recipes keep their order');
  s.progress.codexRun.dish.push(7001);
  assert.ok(fillRecipe(s, stove.uid, 4044).ok);
  assert.deepEqual(potHints(s, stove.uid).map((x) => x.recipe.id), [7001], 'spinach + a low-grade meat makes a simple stew');
});

test('student-only recipes unlock at night for the College Student', () => {
  const wage = postDisaster();
  const kungPao = [2310, 2534, 2138];
  assert.notEqual(matchRecipe(kungPao, { usable: (r) => recipeUsable(wage, r) }).recipe.id, 2002);
  const s = postDisaster({ character: 'student' });
  assert.equal(recipeUsable(s, recipe(2002)), false);
  s.clock.t = s.clock.outbreakAt + 3.5 * 3600; // 21:30
  tick(s, 3600);
  assert.deepEqual(s.cooking.unlocked, [STUDENT_RECIPES[0]]);
  s.cooking.unlocked = [...STUDENT_RECIPES];
  assert.equal(matchRecipe(kungPao, { usable: (r) => recipeUsable(s, r) }).recipe.id, 2002);
  assert.equal(recipeUsable(wage, recipe(2002)), false, 'still locked for other characters');
});

test('coffee from the coffee machine gives Caffeine', () => {
  const s = postDisaster();
  const machine = cookerConfig(install(s, 50005));
  assert.equal(matchRecipe([2526], { allowed: allowedRecipes(machine) }).recipe.id, 4039);
  assert.equal(matchRecipe([2526, 2118], { allowed: allowedRecipes(machine) }).recipe.id, 3036);
  const cup = give(s, 12425);
  eatItem(s, backpack(s), cup);
  assert.ok(hasEffect(s, 'caffeine'));
  assert.ok(s.player.effects.caffeine.until - s.clock.t >= 8 * 3600 - 1, 'lasts 8 hours');
});

test('the hot pot cooks a shared pot and the survivor eats until full', () => {
  const s = postDisaster();
  const pot = install(s, 50003);
  standAt(s, pot);
  fill(s, pot, [2301, 2530, 2528]);
  assert.ok(startHotPot(s, pot.uid).ok);
  tickCooking(s, 3600);
  const served = pot.data.cook.hotpot;
  assert.ok(served.sat > 29.5, `the pot holds more than the raw food (${served.sat})`);
  assert.equal(s.progress.counters['cook.count'], 1);
  s.player.stats.sat = 40;
  assert.ok(eatHotPot(s, pot.uid).ok);
  tick(s, 2 * 3600);
  assert.equal(pot.data.cook.hotpot, null, 'the pot is empty');
  assert.ok(s.player.stats.sat > 70, `satiety ${s.player.stats.sat}`);
  assert.ok(hasEffect(s, 'warm'));
});

test('the brewing barrel ferments food past the brewing line into alcohol', () => {
  const s = postDisaster();
  const barrel = install(s, 66001);
  const inv = s.inventories[barrel.inv];
  addItem(s, inv, 2125); // banana, 5 satiety
  const r = startBrewing(s, barrel.uid);
  assert.equal(r.ok, false);
  assert.match(r.reason, /55 more Satiety/);
  addItem(s, inv, 2539); // watermelon, 60 satiety
  assert.equal(brewStatus(s, barrel.uid).out, BREW.strong, 'fruit makes strong alcohol');
  const { job } = startBrewing(s, barrel.uid);
  assert.equal(job.n, 1);
  assert.equal(inv.items.length, 0, 'the mash is sealed away: nothing left to eat');
  assert.equal(inv.brewing, true);
  s.clock.t += 47 * 3600;
  tickCooking(s, 30);
  assert.equal(count(inv, BREW.strong), 0, 'still fermenting');
  s.clock.t += 2 * 3600;
  tickCooking(s, 30);
  assert.equal(count(inv, BREW.strong), 1);
  assert.equal(inv.brewing, false);
  addItem(s, inv, 2535);
  addItem(s, inv, 2535);
  assert.equal(brewStatus(s, barrel.uid).out, BREW.average, 'vegetables make average alcohol');
  inv.items.forEach((i) => (i.age = 30));
  assert.equal(brewStatus(s, barrel.uid).out, BREW.poor, 'spoiled food makes poor alcohol');
});

test('the ration press compresses food into flavored blocks, fragments and rat rations', () => {
  const s = postDisaster();
  const press = install(s, packageToFurniture[14096]);
  assert.equal(press.cfg, 70008);
  const d = pressState(s, press);
  const fridges = fridgeInventories(s);
  const shelf = homeFurniture(s).find((f) => f.inv && !fridges.includes(f.inv));
  assert.ok(!pressSources(s).includes(shelf.inv), 'shelves and cabinets are not sources');
  assert.ok(pressSources(s).includes(starter(s, 15000).inv), 'the fridge is');
  const add = (id) => assert.ok(addToPress(s, press.uid, s.player.backpack, give(s, id).uid).ok);
  add(2301); // 5 x 15 satiety of pork chops -> 45 after pressing
  assert.deepEqual(pressPreview(s, press.uid).out, [
    [41010, 1],
    [41016, 2],
  ]);
  press.powered = false;
  assert.match(startPress(s, press.uid).reason, /power/i);
  press.powered = true;
  const { job } = startPress(s, press.uid);
  tickCooking(s, job.dur);
  const out = s.inventories[d.out];
  assert.equal(count(out, 41010), 1);
  assert.equal(count(out, 41016), 2);
  for (let i = 0; i < 3; i++) add(30006); // squirrels are rodents
  assert.deepEqual(pressPreview(s, press.uid).out, [[41017, 1]]);
  s.inventories[d.slot].items = [];
  for (let i = 0; i < 4; i++) add(41016);
  assert.deepEqual(pressPreview(s, press.uid).out, [[41009, 1]], 'four fragments press back into a block');
  s.player.stats.sat = 20;
  const block = out.items.find((i) => i.id === 41010);
  eatItem(s, out, block);
  assert.equal(s.player.stats.sat, 50, 'a block is very filling');
});

test('cooking with a tin leaves the washed empty can once the dish is done, not when it is cancelled', () => {
  const s = postDisaster();
  const stove = starter(s, 801);
  standAt(s, stove);
  fill(s, stove, [2115, 2530]);
  fuelUp(s, stove);
  const { job } = startCooking(s, stove.uid);
  assert.equal(count(backpack(s), 24118), 0, 'nothing yet');
  tick(s, job.dur + 3600);
  assert.equal(cookerState(s, stove).job, null);
  assert.equal(count(backpack(s), 24118), 1, 'the empty can');
  fill(s, stove, [2115, 2530]);
  fuelUp(s, stove);
  startCooking(s, stove.uid);
  cancelCooking(s, stove.uid);
  assert.equal(count(backpack(s), 24118), 1, 'a cancelled dish leaves no can');
});
