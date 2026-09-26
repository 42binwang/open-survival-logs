// Coverage for FEATURES.md sections G–N (food, farming, crafting, electricity, traps, weather, crises,
// exploration): rows that were implemented but had no test of their own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { tick, getSystems } from '../src/sim/tick.js';
import { enqueue } from '../src/sim/actions.js';
import '../src/sim/furnActions.js';
import { furnitureFunctions, startFurnitureFunction } from '../src/sim/furnActions.js';
import { installFurniture, homeFurniture, allSlots, canInstall, dismantle, furnitureAt, removeFurniture, homeFloors, createFurniture } from '../src/sim/home.js';
import { addItem, count, instWeightG, dims, insert, makeInstance } from '../src/sim/inventory.js';
import { addEffect, hasEffect } from '../src/sim/stats.js';
import { dayStartT } from '../src/sim/time.js';
import { getMods } from '../src/sim/modifiers.js';
import { getObjectives } from '../src/sim/objectives.js';
import { foodSat } from '../src/sim/social.js';
import { bestFood } from '../src/sim/suggest.js';
import { tickSpoilage, disinfect } from '../src/sim/spoilage.js';
import { CELL, cellAt } from '../src/sim/scene.js';
import { item, recipe, plant, plantCfg, furn, furniture, cookCfg, codex, CAT } from '../src/data/db.js';
import { on } from '../src/engine/bus.js';
import { eatItem, itemOps, useItemAction, useDurationMin, canUseNow } from '../src/sim/itemuse.js';
import { wishPool } from '../src/sim/wishes.js';
import {
  matchRecipe,
  cookerConfig,
  cookerState,
  cookSeconds,
  qualityRoll,
  addIngredient,
  addFuel,
  isCookFuel,
  isIngredient,
  fuelHeat,
  fuelHours,
  allowedRecipes,
  cookbook,
  fillRecipe,
  startCooking,
  tickCooking,
} from '../src/sim/cooking.js';
import { queueFarm, queuePlanting, validateFarmOp, cropRate, planterEnv, planterCfg, capacityOf, harvestYield, ivyDefense } from '../src/sim/farming.js';
import { plantLevelRow } from '../src/sim/proficiency.js';
import { RECIPE_ORDER, recipeDef, findWorkbench, ensureWorkbench, organizeSurface, isRecipeCraftable } from '../src/sim/crafting.js';
import { fuelInventory, fuelSlotCount, setBurner, storageCapacity, rodentSlots, feedCapacity, fillRodents, feedCage, cageFeed, powerOverview, setApplianceOn, powerRole, RODENT_SLOTS } from '../src/sim/power.js';
import { placeTrap, trapSlots, catchChancePerHour, rollCatch, removeTrap, TRAP_TYPES, trapFits } from '../src/sim/traps.js';
import { indoorTemp, advanceWeather, nextColdWave, weatherSunFactor, SUN_FACTOR, survivorTemp, clothingWarmth } from '../src/sim/weather.js';
import { openingsInfo, spawnZombie as spawnHomeZombie } from '../src/sim/horde.js';
import { startExploration, exploreRun, travelTime, travelStamina, searchContainer, fixtureOptions, timeLeft } from '../src/sim/explore.js';
import '../src/ui/explorePanel.js';
import { homeView, buildView } from '../src/ui/view.js';

const HOUR = 3600;

function post(opts = {}, day = 2, hour = 12) {
  const s = newGame({ seed: 77, ...opts });
  s.phase = 'post';
  s.clock.t = dayStartT(s.clock, day) + hour * HOUR;
  s.run.day = day;
  return s;
}

const bp = (s) => s.inventories[s.player.backpack];
function give(s, id, n = 1, inv = bp(s)) {
  let last = null;
  for (let i = 0; i < n; i++) {
    last = addItem(s, inv, id, { allowOverweight: true });
    assert.ok(last, `room for ${id}`);
  }
  return last;
}
const starter = (s, cfg) => homeFurniture(s).find((f) => f.cfg === cfg);
const keepAlive = (s) => Object.assign(s.player.stats, { sat: 80, sta: 90, mor: 80, life: 100 });

// Install into a free slot on `floor` (same slot type first), clearing starter clutter if needed.
function install(s, cfg, floor = '1F') {
  const type = furn(cfg).slot;
  const find = () => {
    const ok = allSlots(s).filter((sl) => sl.floor === floor && !sl.trap && canInstall(s, cfg, sl.id).ok);
    return ok.find((sl) => sl.type === type) || ok[0];
  };
  let slot = find();
  for (const f of homeFurniture(s)) {
    if (slot) break;
    if (f.floor === floor && (f.data?.clutter || (typeof f.cfg === 'string' && !['workbench', 'radio'].includes(f.cfg)))) {
      dismantle(s, f.uid);
      slot = find();
    }
  }
  assert.ok(slot, `no free slot on ${floor} for ${cfg}`);
  const r = installFurniture(s, cfg, slot.id);
  assert.ok(r.ok, `install ${cfg} into ${slot.id}: ${r.reason}`);
  return r.f;
}

function installAt(s, cfg, slotId) {
  const old = furnitureAt(s, slotId);
  if (old) removeFurniture(s, old.uid);
  const r = installFurniture(s, cfg, slotId);
  assert.ok(r.ok, `install ${cfg} at ${slotId}: ${r.reason}`);
  return r.f;
}

// Pin the outdoor temperature by flattening yesterday's, today's and tomorrow's curves.
function setOutdoor(s, temp, kind = 'cloudy') {
  const w = s.weather;
  for (const d of [w.history[w.history.length - 1], w.today, w.tomorrow]) if (d) Object.assign(d, { mean: temp, low: temp, high: temp });
  w.today.kind = kind;
}

const system = (id) => getSystems().find((x) => x.id === id);

// ================================================================================================ G. Food and cooking
test('G01: the 173 codex foods carry satiety, morale, shelf life, weight, size, trade value, taste and wish power; eating and wishes use them', () => {
  assert.equal(codex.food.length, 173);
  for (const id of codex.food) {
    const cfg = item(id);
    assert.equal(cfg.cat, CAT.FOOD, `${id} is food`);
    for (const k of ['sat', 'mor', 'life', 'g', 'price', 'trade', 'taste', 'wish']) assert.equal(typeof cfg[k], 'number', `${id}.${k}`);
    assert.equal(cfg.size.length, 2, `${id}.size`);
  }
  const s = post();
  const cfg = item(2105); // instant noodles
  const inst = give(s, 2105);
  assert.equal(instWeightG(inst), cfg.g, 'weight from the config');
  assert.deepEqual([...dims(inst)].sort(), [...cfg.size].sort(), 'grid size from the config');
  Object.assign(s.player.stats, { sat: 10, mor: 50 });
  eatItem(s, bp(s), inst);
  assert.ok(Math.abs(s.player.stats.sat - (10 + cfg.sat)) < 1e-6, 'satiety restored');
  assert.ok(Math.abs(s.player.stats.mor - (50 + cfg.mor)) < 1e-6, 'morale changed');
  const pool = wishPool();
  assert.ok(pool.length > 10 && pool.every((it) => it.wish > 0 && it.cat === CAT.FOOD), 'wish power decides which foods can be wished for');
});

test('G02: raw ingredients can be eaten directly (raw meat risks an upset stomach, cooked dishes do not); eating takes time', () => {
  const s = post();
  const dumplings = give(s, 2104); // frozen dumplings: an ingredient that can also be eaten as is
  assert.ok(isIngredient(item(2104)));
  assert.ok(itemOps(s, dumplings).some((o) => o.op === 'eat'), 'frozen ready meals can be eaten directly');
  const a = useItemAction(s, s.player.backpack, dumplings.uid, 'eat');
  assert.equal(a.kind, 'useItem');
  assert.equal(a.op, 'eat', 'shown as eating, not cooking');
  assert.equal(a.dur, useDurationMin(item(2104)) * 60);
  assert.equal(useDurationMin(item(2136)), 5, 'drinks go down quickly');
  assert.equal(useDurationMin(item(2530)), 10, 'a snack-sized bite');
  assert.equal(useDurationMin(item(recipe(1002).out[0])), 20, 'a big meal takes longer');
  enqueue(s, a);
  tick(s, 60);
  assert.equal(count(bp(s), 2104) >= 1, true, 'still eating after a minute');
  tick(s, 30 * 60);
  assert.equal(count(bp(s), 2104), 0, 'eaten');

  let upset = 0;
  for (let i = 0; i < 40; i++) {
    delete s.player.effects['1101'];
    s.player.stats.sat = 0;
    bp(s).items = [];
    eatItem(s, bp(s), give(s, 2305)); // frozen steak, raw
    if (hasEffect(s, '1101')) upset++;
  }
  assert.ok(upset > 0 && upset < 40, `raw meat sometimes upsets the stomach (${upset}/40)`);
  delete s.player.effects['1101'];
  const stew = recipe(7001).out[1];
  for (let i = 0; i < 40; i++) {
    s.player.stats.sat = 0;
    bp(s).items = [];
    eatItem(s, bp(s), give(s, stew));
  }
  assert.equal(hasEffect(s, '1101'), false, 'a fresh cooked dish is safe');
});

test('G03: every cooker reads its FurnitureCook row: food slots, fuel slots, starting fuel, speed and quality bonus', () => {
  const cookers = Object.values(furniture).filter((f) => f.cook);
  assert.ok(cookers.length >= 13);
  for (const f of cookers) assert.equal(cookerConfig({ cfg: f.id }), cookCfg(f.cook), `${f.id} ${f.zh}`);
  const s = post();
  const stove = starter(s, 801); // fuel stove: 4 food, 3 fuel, speed 1, no bonus
  const big = starter(s, 55000); // large gas stove: 5 food, 5 fuel, speed 1.2, +5 quality
  const a = cookerConfig(stove);
  const b = cookerConfig(big);
  assert.equal(cookSeconds(a, recipe(7001)), recipe(7001).time);
  assert.equal(cookSeconds(b, recipe(7001)), Math.round(recipe(7001).time / 1.2), 'the gas stove cooks faster');
  assert.equal(qualityRoll(s, b, []).center - qualityRoll(s, a, []).center, 5, 'and better');
  for (const id of [2530, 2530, 2528, 2527]) assert.ok(addIngredient(s, stove.uid, s.player.backpack, give(s, id).uid).ok);
  const extra = addIngredient(s, stove.uid, s.player.backpack, give(s, 2530).uid);
  assert.equal(extra.ok, false, 'the fuel stove holds four ingredients');
  assert.match(extra.reason, /slot/i);
  for (let i = 0; i < 3; i++) assert.ok(addFuel(s, stove.uid, s.player.backpack, give(s, 8001).uid).ok);
  assert.equal(addFuel(s, stove.uid, s.player.backpack, give(s, 8001).uid).ok, false, 'and three fuel items');
  const gas = install(s, 433);
  const d = cookerState(s, gas);
  assert.deepEqual(s.inventories[d.fuel].items.map((i) => i.id), [8001, 8001], 'the gas stove comes with two canisters');
  assert.equal(allowedRecipes(cookerConfig(gas)).size, cookerConfig(gas).AllowedRecipes.length);
});

test('G04: gas canisters, alcohols, diesel and wood fuel a stove with their heat values; food, liquor and documents do not', () => {
  for (const id of [8001, 15504, 15505, 15506, 40000, 20005, 20106]) assert.ok(isCookFuel(item(id)), `${id} burns`);
  for (const id of [2157, 2137, 9041]) assert.equal(isCookFuel(item(id)), false, `${id} is not fuel`);
  const s = post();
  const stove = starter(s, 801);
  const cfg = cookerConfig(stove);
  assert.ok(addFuel(s, stove.uid, s.player.backpack, give(s, 40000).uid).ok);
  assert.ok(addFuel(s, stove.uid, s.player.backpack, give(s, 15506).uid).ok);
  assert.ok(addFuel(s, stove.uid, s.player.backpack, give(s, 20106).uid).ok);
  const d = cookerState(s, stove);
  assert.equal(fuelHeat(s, d), item(40000).burn + item(15506).burn + item(20106).burn);
  assert.ok(Math.abs(fuelHours(cfg, item(40000).burn) - item(40000).burn / cfg.FuelRate / HOUR) < 1e-9, 'hours of cooking per fuel item');
  assert.ok(fuelHours(cfg, item(40000).burn) > fuelHours(cfg, item(8001).burn), 'diesel outlasts a gas canister');
});

test('G05: seasonings join tag combos and their price grades the dish', () => {
  const low = matchRecipe([2513, 2150]); // white beech mushroom $5 + iodized salt $10
  assert.equal(low.special, false);
  assert.equal(low.recipe.id, 7006);
  assert.equal(low.tier, 3);
  const mid = matchRecipe([2516, 2150]); // king oyster mushroom $14
  assert.equal(mid.recipe.id, 5006);
  assert.equal(mid.tier, 2);
  const high = matchRecipe([2513, 2146]); // honey $70 lifts the whole dish
  assert.equal(high.recipe.id, 6006);
  assert.equal(high.tier, 1);
  for (const m of [low, mid, high]) assert.deepEqual([...m.recipe.tags].sort((a, b) => a - b), [8, 11], 'mushroom + seasoning');
});

test('G07: cookbook entries mark near matches and undiscovered recipes until they are cooked', () => {
  const s = post();
  const stove = starter(s, 801);
  give(s, 2530);
  let book = cookbook(s, stove.uid);
  const spinach = book.entries.find((e) => e.recipe.id === 4044);
  assert.equal(spinach.status, 'ready');
  assert.equal(spinach.discovered, false, 'the Not-cooked-yet filter shows it');
  const cabbage = book.entries.find((e) => e.recipe.id === 4043);
  assert.equal(cabbage.status, 'near', 'one ingredient short');
  assert.deepEqual(cabbage.missing, [{ id: 2528 }]);
  const mw = install(s, 50001);
  assert.ok(allowedRecipes(cookerConfig(mw)).has(4044));
  assert.ok(fillRecipe(s, mw.uid, 4044).ok);
  const r = startCooking(s, mw.uid);
  assert.ok(r.ok, r.reason);
  tickCooking(s, r.job.dur);
  book = cookbook(s, stove.uid);
  assert.equal(book.entries.find((e) => e.recipe.id === 4044).discovered, true);
});

test('G08 (servings): multi-serving foods lose one serving per meal and weigh less as they go', () => {
  const s = post();
  const biscuits = give(s, 2101); // compressed biscuits, 10 servings
  const full = instWeightG(biscuits);
  s.player.stats.sat = 0;
  eatItem(s, bp(s), biscuits);
  assert.equal(biscuits.uses, item(2101).uses - 1);
  assert.equal(count(bp(s), 2101), 1, 'the rest stays in the backpack');
  assert.ok(Math.abs(s.player.stats.sat - item(2101).sat) < 1e-6, 'one serving of satiety');
  assert.ok(instWeightG(biscuits) < full);
});

test('G12: the kettle boils a cup of hot water once a day; hot drinks and soups drive off Cold', () => {
  const s = post({ character: 'student' });
  const kettle = starter(s, 50002);
  const boil = furnitureFunctions(s, kettle).find((f) => f.key === 1707);
  assert.ok(boil?.enabled, boil?.reason);
  startFurnitureFunction(s, kettle.uid, 1707);
  tick(s, 45 * 60);
  const cup = bp(s).items.find((i) => i.id === 2913);
  assert.ok(cup, 'a cup of hot water');
  assert.equal(furnitureFunctions(s, kettle).find((f) => f.key === 1707).enabled, false, 'once a day');
  addEffect(s, 'cold', 6);
  eatItem(s, bp(s), cup);
  assert.equal(hasEffect(s, 'cold'), false);
  assert.ok(hasEffect(s, 'warm'), 'warmed up for a while');
  delete s.player.effects.warm;
  addEffect(s, 'cold', 6);
  eatItem(s, bp(s), give(s, recipe(3001).out[1])); // a bowl of soup
  assert.equal(hasEffect(s, 'cold'), false, 'soup works too');
});

// ================================================================================================ H. Farming
function research(s) {
  s.farm.researched = true;
}

// Large pot where the Wage Slave's wood pile stood.
function bigPot(s) {
  dismantle(s, furnitureAt(s, '1F:l4').uid);
  return installAt(s, 60002, '1F:l4');
}

function sow(s, f, seedId, n = 1) {
  give(s, seedId, n);
  queuePlanting(s, f.uid, seedId, { count: n });
  tick(s, 2 * HOUR);
  assert.equal(f.data.crops.length, n, `seeds ${seedId} went into the pot`);
  return f.data.crops;
}

// Fill a pot with `n` copies of its first crop (the anomaly and perfect rolls are per crop).
function massCrops(f, n, extra) {
  const base = f.data.crops[0];
  f.data.crops = Array.from({ length: n }, (_, i) => ({ ...base, id: 90000 + i, pest: false, weed: false, dry: false, anomaly: false, ...extra }));
  return f.data.crops;
}

test('H01: every planter reads its FurniturePlant row: capacity, passive heat, powered light/heat, growth boost and pest control', () => {
  const planters = Object.values(furniture).filter((f) => f.plant);
  assert.ok(planters.length >= 25);
  for (const f of planters) assert.ok(plantCfg(f.plant), `${f.id} ${f.zh}`);
  const s = post({}, 3, 12);
  s.home.unlocked.B1 = true;
  const at = {};
  for (const cfg of [60000, 60001, 60002, 60015, 60016, 60017, 60019, 60012]) at[cfg] = install(s, cfg, 'B1');
  for (const [cfg, f] of Object.entries(at)) {
    assert.equal(planterCfg(f), plantCfg(furn(Number(cfg)).plant));
    assert.equal(capacityOf(f), plantCfg(furn(Number(cfg)).plant).Capacity);
  }
  assert.deepEqual([capacityOf(at[60000]), capacityOf(at[60001]), capacityOf(at[60002])], [1, 2, 4], 'small, medium, large pots');
  const plain = planterEnv(s, at[60002]);
  const clay = planterEnv(s, at[60015]);
  assert.equal(plain.heated, false);
  assert.equal(clay.heated, true, 'clay insulates');
  assert.equal(clay.temp - plain.temp, 5);
  assert.ok(Math.abs(planterEnv(s, at[60016]).boost - 0.3) < 1e-6, 'fertile pot grows 30% faster');
  assert.ok(Math.abs(planterEnv(s, at[60019]).boost - 0.2) < 1e-6, 'fine pot grows 20% faster');
  const box = at[60012]; // thermostatic box: needs power for its heating element
  const on = planterEnv(s, box);
  assert.equal(on.running, true);
  assert.equal(on.temp - plain.temp, 5 + 20);
  box.powered = false;
  const off = planterEnv(s, box);
  assert.equal(off.running, false);
  assert.equal(off.boost, 0);
  assert.equal(off.temp - plain.temp, 5, 'only the insulated shell is left');

  research(s);
  const farming = system('farming');
  const pests = (f) => {
    sow(s, f, 15007);
    massCrops(f, 200, { growth: 0.99, rollG: 0 });
    farming.onHour(s);
    return f.data.crops.filter((c) => c.pest).length;
  };
  const normal = pests(at[60002]);
  const proof = pests(at[60017]);
  assert.ok(normal > 60 && proof < normal / 2.5, `pest-proof pot: ${proof} vs ${normal} infested`);
});

test('H02: 34 codex plants with growth, light, cold, anomaly odds, yields, perfect yield/rate, seed return and withering', () => {
  const list = codex.plant.map((id) => plant(id));
  assert.equal(list.length, 34);
  for (const p of list) {
    assert.ok(p.grow > 0 && p.decay > 0, `${p.id} grow/decay`);
    for (const k of ['light', 'cold', 'pest', 'weed', 'dry', 'pRate', 'seedRate']) assert.equal(typeof p[k], 'number', `${p.id}.${k}`);
    assert.ok(p.gain.length > 0 && Array.isArray(p.pGain) && Array.isArray(p.seed) && Array.isArray(p.wither), `${p.id} yields`);
  }
  const s = post();
  const spinach = plant(22);
  assert.deepEqual(harvestYield(s, spinach, true).slice(0, spinach.pGain.length), spinach.pGain, 'perfect crops use the perfect yield');
  getMods(s).seedRate = 1;
  assert.ok(harvestYield(s, spinach, false).includes(spinach.seed[0]), 'seed return');
  getMods(s).seedRate = -1;
  assert.equal(harvestYield(s, spinach, false).includes(spinach.seed[0]), false);
});

test('H03: compound and advanced organic fertilizer speed growth more than basic; a pot can be upgraded but not fertilized twice', () => {
  const s = post();
  research(s);
  const pot = bigPot(s);
  give(s, 15007);
  give(s, 15501, 2);
  give(s, 15502);
  give(s, 15503);
  queuePlanting(s, pot.uid, 15007, { fertId: 15501 });
  tick(s, 3 * HOUR);
  const [c] = pot.data.crops;
  Object.assign(c, { pest: false, weed: false, dry: false, water: 1 });
  const rate = (fert) => cropRate(s, pot, { ...c, fert });
  assert.ok(Math.abs(cropRate(s, pot, c) / rate(0) - 1.3) < 1e-6, 'basic: +30%');
  assert.equal(validateFarmOp(s, pot.uid, 'fertilize', { fertId: 15501 }), 'Already fertilized.');
  assert.equal(validateFarmOp(s, pot.uid, 'fertilize', { fertId: 15502 }), true, 'a stronger fertilizer can still go on');
  queueFarm(s, pot.uid, 'fertilize', { fertId: 15503 });
  tick(s, HOUR);
  assert.equal(c.fertilizer, 15503);
  assert.equal(count(bp(s), 15503), 0);
  assert.ok(Math.abs(cropRate(s, pot, c) / rate(0) - 2) < 1e-6, 'advanced organic: +100%');
  assert.ok(Math.abs(rate(item(15502).plantFast) / rate(0) - 1.5) < 1e-6, 'compound: +50%');
});

test('H04: a toilet trip turns paper into basic fertilizer; the compost bin rots food into fertilizer five times faster', () => {
  const s = post();
  const toilet = starter(s, 21001);
  give(s, 20001);
  startFurnitureFunction(s, toilet.uid, 212);
  tick(s, HOUR);
  assert.equal(count(bp(s), 20001), 0, 'toilet paper used');
  assert.equal(count(bp(s), 15501), 1, 'basic fertilizer');
  const bin = install(s, 66000);
  const shelf = s.inventories[starter(s, 10001).inv];
  const compost = s.inventories[bin.inv];
  assert.equal(compost.special, 'compost');
  give(s, 2125, 1, compost); // banana, 5-day shelf life
  give(s, 2125, 1, shelf);
  tickSpoilage(s, 2 * 86400);
  assert.equal(count(compost, 2125), 0);
  assert.equal(count(compost, 15501), 1, 'composted into fertilizer');
  assert.equal(count(shelf, 2125), 1, 'the same banana on a shelf is still fine');
});

test('H05: the Student’s balcony gets full sun and her sunroom lets daylight in; indoor pots get none', () => {
  const s = post({ character: 'student' }, 3, 12);
  s.home.unlocked['2F'] = true;
  Object.assign(s.weather.today, { kind: 'sunny', sun: 1 });
  const balcony = installAt(s, 60001, '2F:p3');
  const sunroom = installAt(s, 60002, '2F:g1');
  const inside = starter(s, 60000); // the living-room pot
  const b = planterEnv(s, balcony);
  const g = planterEnv(s, sunroom);
  assert.equal(b.outdoor, true);
  assert.equal(b.light, 2, 'full sun on the balcony at noon');
  assert.equal(g.outdoor, false, 'the sunroom is indoors');
  assert.equal(g.light, 2, 'but the glass lets the sun in');
  assert.equal(planterEnv(s, inside).light, 0);
  const tomato = { plantId: 24, growth: 0, ready: false, withered: false };
  assert.ok(cropRate(s, sunroom, tomato) > cropRate(s, inside, tomato) * 4, 'light-hungry crops thrive in the sunroom');
});

test('H07: planting Lv2+ cuts anomaly odds, raises the perfect chance and shows the plant overview card', () => {
  const run = (lv) => {
    const s = post();
    research(s);
    s.progress.prof.plant.lv = lv;
    const pot = bigPot(s);
    sow(s, pot, 15007);
    const card = getObjectives(s).some((o) => o.id === 'farm.overview');
    massCrops(pot, 200, { growth: 0.99, rollG: 0 });
    system('farming').onHour(s);
    const anomalies = pot.data.crops.filter((c) => c.anomaly).length;
    massCrops(pot, 200, { growth: 0.99999, rollG: 0.99999, ready: false, perfect: false });
    system('farming').tick(s, 60);
    const perfect = pot.data.crops.filter((c) => c.ready && c.perfect).length;
    return { card, anomalies, perfect, row: plantLevelRow(s) };
  };
  const novice = run(1);
  const master = run(5);
  assert.equal(novice.card, false, 'no overview card below Lv2');
  assert.equal(run(2).card, true, 'Lv2 unlocks the plant overview card');
  assert.equal(master.row.pest_rate_reduction > 0 && master.row.perfect_grow_rate > 0, true);
  assert.ok(master.anomalies < novice.anomalies * 0.8, `anomalies ${master.anomalies} vs ${novice.anomalies}`);
  assert.ok(master.perfect > novice.perfect + 30, `perfect crops ${master.perfect} vs ${novice.perfect}`);
});

test('H09: mature Boston Ivy on the Student’s balcony softens zombie hits on the openings', () => {
  const s = post({ character: 'student' }, 3, 12);
  s.home.unlocked['2F'] = true;
  research(s);
  const pot = installAt(s, 60001, '2F:p3');
  const win = furnitureAt(s, '1F:win1');
  const bare = openingsInfo(s).find((o) => o.slot === '1F:win1').defRed;
  const [c] = sow(s, pot, 15040);
  Object.assign(c, { growth: 1, ready: true, readyAt: s.clock.t });
  tick(s, 60);
  assert.ok(ivyDefense(s) > 0);
  const ivy = openingsInfo(s).find((o) => o.slot === '1F:win1').defRed;
  assert.ok(Math.abs(1 - ivy - (1 - bare) * (1 - ivyDefense(s))) < 1e-9, 'the horde system applies the ivy cover');
  const fl = homeFloors(s.home.id)['1F'];
  const [ax, ay] = [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([dx, dy]) => [win.x + dx, win.y + dy]).find(([x, y]) => cellAt(fl, x, y) === CELL.YARD);
  const z = spawnHomeZombie(s, { target: '1F:win1', x: ax, y: ay, hpMult: 50, patience: 5 * HOUR });
  const hp = win.hp;
  for (let i = 0; i < 20 && win.hp === hp; i++) tick(s, 30);
  assert.ok(Math.abs(hp - win.hp - z.dmg * (1 - ivy)) < 1e-6, `one hit takes ${hp - win.hp} instead of ${z.dmg}`);
});

// ================================================================================================ I. Crafting
test('I01: the broken workbench is fixed with its manual; without it, studying opens up later; Organize packs the work surface', () => {
  const s = post({}, 3, 10);
  const wb = findWorkbench(s);
  assert.equal(wb.broken, true);
  // the bench's buttons by what they do (the config bench's Repair Workbench 220 and Study Its Structure 249)
  // (Fix the Vice 247 is a repair too, with a tin sheet: the manual's repair is picked by its id)
  const fns = () => Object.fromEntries(furnitureFunctions(s, wb).filter((f) => f.key !== 247).map((f) => [f.spec.kind, f]));
  assert.equal(fns().studyWorkbench.enabled, false);
  assert.match(fns().studyWorkbench.reason, /Day 6/);
  assert.equal(fns().repairWorkbench.enabled, false, 'needs the manual');
  give(s, 9020);
  assert.equal(fns().repairWorkbench.enabled, true);
  startFurnitureFunction(s, wb.uid, fns().repairWorkbench.key);
  tick(s, 2 * HOUR);
  assert.equal(wb.broken, false);
  assert.equal(count(bp(s), 9020), 0, 'the manual is used up');
  assert.equal(fns().repairWorkbench, undefined, 'a working bench offers crafting only');

  const t = post({}, 7, 10);
  const bench = findWorkbench(t);
  const study = furnitureFunctions(t, bench).find((f) => f.spec.kind === 'studyWorkbench');
  assert.ok(study.enabled, study.reason);
  startFurnitureFunction(t, bench.uid, study.key);
  tick(t, 4 * HOUR);
  assert.equal(bench.broken, false, 'figured it out without the manual');

  const d = ensureWorkbench(s, wb);
  const surface = s.inventories[d.surface];
  for (const [x, y] of [
    [9, 3],
    [5, 2],
  ]) {
    const inst = makeInstance(s, 20004);
    assert.ok(insert(surface, inst, { x, y }));
  }
  assert.deepEqual(organizeSurface(s, wb.uid), []);
  assert.deepEqual(
    surface.items.map((i) => [i.x, i.y]).sort(),
    [
      [0, 0],
      [1, 0],
    ],
    'packed into the corner'
  );
});

test('I02: official craft recipes carry materials, products, perfect rate/outputs, failed outputs and a level; the codex list is craftable', () => {
  assert.ok(RECIPE_ORDER.length >= 124);
  for (const id of RECIPE_ORDER) {
    const r = recipeDef(id);
    assert.ok(r.mat.length > 0 && r.out.length > 0, `${id} materials and product`);
    assert.ok(r.mat.every((m) => item(m)) && r.out.every((o) => item(o)), `${id} items exist`);
    assert.ok(Array.isArray(r.pOut) && Array.isArray(r.fail), `${id} perfect and failed outputs`);
    assert.equal(typeof r.pRate, 'number');
    assert.equal(typeof r.lv, 'number');
  }
  for (const id of codex.craft) assert.ok(recipeDef(id), `codex recipe ${id} is on the official list`);
});

test('I07: dismantling a config furniture piece returns its RemoveGet materials', () => {
  const s = post();
  const tv = starter(s, 70000);
  const fn = furnitureFunctions(s, tv).find((f) => f.spec.kind === 'dismantle');
  assert.ok(fn?.enabled);
  startFurnitureFunction(s, tv.uid, fn.key);
  tick(s, HOUR);
  assert.equal(furnitureAt(s, tv.slot), null);
  const dropped = s.floorBoxes.flatMap((b) => s.inventories[b.inv]?.items.map((i) => i.id) || []);
  for (const id of furn(70000).rmGet) assert.ok(dropped.includes(id), `material ${id}`);
  assert.equal(s.progress.counters['furniture.dismantle'], 1);
});

// ================================================================================================ J. Electricity
test('J02: every generator size reads FurnitureElectrical: solar 6/12/24 W, fuel generators with 3/5/8 slots and burn rates, manual gens, rat cages', () => {
  const s = post({}, 8, 12);
  s.home.unlocked['2F'] = true;
  s.home.unlocked.B1 = true;
  tick(s, 30);
  Object.assign(s.weather.today, { kind: 'sunny', sun: 1 });
  for (const cfg of [40000, 40001, 40002]) install(s, cfg, '2F');
  const gens = [42000, 42001, 42002].map((cfg) => install(s, cfg, 'B1'));
  for (const g of gens) {
    const inv = fuelInventory(s, g);
    addItem(s, inv, 40000);
    assert.equal(setBurner(s, g.uid, true), true);
  }
  tick(s, 600);
  assert.ok(Math.abs(s.power.solarW - 42) < 1e-9, `solar ${s.power.solarW} W`);
  assert.equal(s.power.fuelW, 40 + 80 + 160);
  assert.deepEqual(
    gens.map((g) => fuelSlotCount(s, g)),
    [3, 5, 8]
  );
  const burned = gens.map((g) => item(40000).burn - g.data.heat);
  assert.deepEqual(
    burned.map((b) => Math.round(b)),
    [336, 600, 1100],
    'FuelRate heat per 10 minutes'
  );
  assert.equal(powerRole({ cfg: 70004 }), 'manualGen', 'the treadmill is a manual generator');
  assert.equal(powerRole({ cfg: 41000 }), 'manualGen');
  for (const [cfg, n] of Object.entries(RODENT_SLOTS)) {
    const f = { cfg: Number(cfg) };
    assert.equal(powerRole(f), 'ratGen');
    assert.equal(rodentSlots(f), n);
  }
  assert.deepEqual(
    [42010, 42011, 42012, 42009].map((cfg) => feedCapacity({ cfg })),
    [2, 4, 8, 16],
    'feed storage by cage size'
  );
});

test('J03: lead-acid battery, UPS, home station and XL storage hold 1000/2000/4000/8000 Wh and add up', () => {
  const s = post({}, 3, 12);
  s.home.unlocked.B1 = true;
  for (const cfg of [45000, 45001, 45002, 45003]) install(s, cfg, 'B1');
  assert.equal(storageCapacity(s), 15000);
  tick(s, 3600);
  assert.equal(s.power.capacity, 15000);
  assert.ok(s.power.stored > 0, 'the grid tops the batteries up');
});

test('J04: the power overview lists sources, batteries, appliances and heaters with draw, generation, battery level and stop reasons', () => {
  const s = post({}, 8, 23);
  s.home.unlocked.B1 = true;
  s.home.unlocked['2F'] = true;
  const panel = install(s, 40000, '2F');
  const gen = install(s, 42000, 'B1');
  install(s, 45000, 'B1');
  const heater = install(s, 65001, 'B1');
  const fridge = starter(s, 15000);
  s.power.stored = 500;
  tick(s, 60);
  const ov = powerOverview(s);
  const row = (list, f) => list.find((r) => r.f.uid === f.uid);
  assert.equal(row(ov.sources, panel).status.reason, 'night');
  assert.equal(row(ov.sources, gen).status.reason, 'noFuel');
  assert.equal(ov.batteries.length, 1);
  assert.equal(row(ov.heaters, heater).status.reason, 'noFuel');
  const fr = row(ov.appliances, fridge);
  assert.equal(fr.status.rated, furn(15000).pw);
  assert.equal(fr.status.w, furn(15000).pw, 'the battery runs the fridge');
  assert.ok(s.power.draw >= furn(15000).pw);
  assert.equal(s.power.gen, 0);
  assert.ok(s.power.stored < 500 && s.power.capacity === 1000, 'battery level drops');
  setApplianceOn(s, fridge.uid, false);
  tick(s, 60);
  assert.equal(row(powerOverview(s).appliances, fridge).status.reason, 'off', 'per-appliance switch');
});

// ================================================================================================ K. Traps and rodents
test('K01: the four trap types have their own durability; bait must have satiety; a worn-out trap stops and is not returned', () => {
  const s = post();
  s.home.unlocked['2F'] = true;
  s.home.unlocked.B1 = true;
  const expect = { 25001: 10, 25000: 15, 25003: 12, 25004: 20 };
  const traps = Object.entries(expect).map(([id, dur]) => {
    const g = id === '25001' ? s : post();
    Object.assign(g.home.unlocked, { '2F': true, B1: true });
    const slot = trapSlots(g).find((x) => !g.home.slots[x.id] && trapFits(g, Number(id), x));
    const f = placeTrap(g, Number(id), slot.id);
    assert.equal(f.data.maxDurability, dur, `${id} durability`);
    assert.equal(TRAP_TYPES[item(Number(id)).trap].durability, dur);
    return f;
  });
  const mousetrap = traps.find((f) => f.data.trapItem === 25001);
  give(s, 20001, 1, s.inventories[mousetrap.data.bait]);
  assert.equal(catchChancePerHour(s, mousetrap), 0, 'paper is no bait');
  give(s, 2102, 1, s.inventories[mousetrap.data.bait]);
  assert.ok(catchChancePerHour(s, mousetrap) > 0);
  mousetrap.data.durability = 0;
  assert.equal(catchChancePerHour(s, mousetrap), 0, 'worn out');
  const carried = count(bp(s), 25001);
  removeTrap(s, mousetrap.uid);
  assert.equal(count(bp(s), 25001), carried, 'a broken trap is thrown away');
});

test('K02: all 19 codex prey can be caught; common prey outnumber rare ones and location shifts the odds', () => {
  const prey = new Set(Object.values(TRAP_TYPES).flatMap((t) => t.prey));
  assert.deepEqual([...prey].sort(), [...codex.prey].sort());
  const catches = (floor) => {
    const s = post();
    s.home.unlocked.B1 = true;
    const slot = trapSlots(s, floor).find((x) => !x.outdoor);
    const f = placeTrap(s, 25000, slot.id); // live trap: mice, rats, a snake, guinea pigs, weasels, toads
    const tally = {};
    for (let i = 0; i < 400; i++) {
      f.data.durability = 99;
      s.inventories[f.data.hold].items = [];
      give(s, 2102, 1, s.inventories[f.data.bait]);
      const id = rollCatch(s, f);
      tally[id] = (tally[id] || 0) + 1;
    }
    return tally;
  };
  const indoor = catches('1F');
  const basement = catches('B1');
  const rare = (t) => [30001, 30021, 30016].reduce((n, id) => n + (t[id] || 0), 0);
  assert.ok(indoor[30000] > rare(indoor), 'the common house mouse beats the rare catches indoors');
  assert.ok(indoor[30000] > (indoor[30003] || 0) * 2, 'indoors: mostly house mice');
  assert.ok((basement[30003] || 0) + (basement[30008] || 0) > (basement[30000] || 0) * 1.5, 'the basement is rat country');
});

test('K03: mouse cages S/M/L/XL take mice, guinea pigs and lab mice, produce 6 W per fed rodent and report deaths', () => {
  const s = post({}, 3, 12);
  s.home.unlocked.B1 = true;
  const cage = install(s, 42011, 'B1'); // medium: four places
  for (const id of [30000, 30021, 30022]) give(s, id);
  give(s, 30001); // a snake does not run the wheel
  assert.equal(fillRodents(s, cage.uid), 3);
  assert.equal(count(bp(s), 30001), 1);
  give(s, 2105);
  assert.equal(feedCage(s, cage.uid), 1, 'one-click feeding');
  tick(s, 60);
  assert.equal(s.power.ratW, 18);
  const died = [];
  const toasts = [];
  const offA = on('ratDied', (e) => died.push(e.id));
  const offB = on('toast', (e) => toasts.push(e.text));
  cageFeed(s, cage).items = [];
  cage.data.bowl = 0;
  tick(s, 60);
  cage.data.hungrySince = s.clock.t - 25 * HOUR;
  tick(s, 60);
  offA();
  offB();
  assert.equal(died.length, 1, 'one rodent starved');
  assert.ok(toasts.some((t) => /starved/.test(t)), 'death notification');
});

// ================================================================================================ L. Weather and environment
test('L02: an electric heater warms its floor while powered', () => {
  const s = post({}, 3, 12);
  tick(s, 30);
  setOutdoor(s, -15, 'snow');
  tick(s, 30);
  const cold = indoorTemp(s, '1F');
  const heater = install(s, 65000, '1F');
  tick(s, 60);
  assert.equal(heater.powered, true);
  assert.ok(indoorTemp(s, '1F') > cold + 3, `${cold} -> ${indoorTemp(s, '1F')} °C`);
  assert.ok(s.power.draw >= furn(65000).pw, 'heating draws power');
});

test('L03: a cold wave switches heating on (power draw spikes) and starves the solar panels', () => {
  const s = post({}, 3, 12);
  const heater = install(s, 65000, '1F');
  tick(s, 30);
  setOutdoor(s, 20, 'sunny');
  tick(s, 60);
  assert.equal(s.power.units[heater.uid].reason, 'thermostat', 'idle on a mild day');
  const mild = s.power.draw;
  setOutdoor(s, -18, 'coldWave');
  tick(s, 60);
  assert.equal(s.power.units[heater.uid].w, furn(65000).pw);
  assert.ok(s.power.draw >= mild + furn(65000).pw, 'draw rises with the cold');
  assert.ok(SUN_FACTOR.coldWave < SUN_FACTOR.sunny);
  const t = post({}, 10, 12);
  const wave = nextColdWave(t);
  advanceWeather(t, wave.start);
  assert.equal(t.weather.today.kind, 'coldWave');
  assert.ok(weatherSunFactor(t) <= SUN_FACTOR.coldWave * 1.15 + 1e-9, `solar factor ${weatherSunFactor(t)}`);
});

test('L04 (view model): rain and snow reach the renderer outside the basement, lights at night with power, a dark basement and a flashlight at dark sites', () => {
  const s = post({}, 3, 22);
  tick(s, 60);
  s.weather.today.kind = 'rain';
  s.ui.viewFloor = '1F';
  let v = homeView(s);
  assert.equal(v.weather.kind, 'rain');
  assert.equal(v.lightsOn, true, 'powered lights at night');
  s.weather.today.kind = 'snow';
  assert.equal(homeView(s).weather.kind, 'snow');
  s.ui.viewFloor = 'B1';
  v = homeView(s);
  assert.equal(v.weather, null, 'no weather in the basement');
  assert.equal(v.indoorDark, false);
  s.power.homePowered = false;
  assert.equal(homeView(s).indoorDark, true, 'a dark basement without power');

  const e = post({}, 20, 9);
  assert.ok(startExploration(e, 'supermarket').ok);
  tick(e, travelTime(e, 'supermarket') + 60);
  const sv = buildView(e);
  assert.ok(sv.flashlight && sv.flashlight.x === e.player.x, 'a flashlight beam follows the survivor');
  assert.equal(sv.indoorDark, true);
  const d = post({}, 3, 9);
  startExploration(d, 'streets');
  tick(d, travelTime(d, 'streets') + 60);
  assert.equal(buildView(d).flashlight, null, 'daylight at the streets');
});

// ================================================================================================ M. Crises, hordes, defense
function fightThrough(s, maxHours = 12) {
  for (let i = 0; i < maxHours * 12 && s.crises.horde; i++) {
    tick(s, 300);
    for (const z of s.zombies) if (z.home) z.hp = 0;
    keepAlive(s);
  }
}

test('M06: beating the Day 15 and Day 25 hordes hands over the electric net and chainsaw blueprints', () => {
  const s = post({}, 15, 20);
  assert.equal(isRecipeCraftable(s, 402), false);
  tick(s, 2 * HOUR + 600);
  assert.equal(s.crises.horde?.id, 'story-15');
  fightThrough(s);
  assert.equal(s.crises.horde, null);
  assert.ok(s.run.unlockedRecipes.includes(402), 'electric net blueprint');
  assert.ok(isRecipeCraftable(s, 402));
  s.clock.t = dayStartT(s.clock, 25) + 20 * HOUR;
  tick(s, 2 * HOUR + 600);
  assert.equal(s.crises.horde?.id, 'story-25');
  fightThrough(s);
  assert.ok(s.run.unlockedRecipes.includes(403), 'chainsaw blueprint');
});

test('M11: mold spreading in a container escalates into a Mold Crisis that disinfectant spray clears', () => {
  const s = post();
  const shelf = starter(s, 10001);
  const inv = s.inventories[shelf.inv];
  give(s, 2125, 1, inv);
  inv.moldy = true;
  const crises = [];
  const off = on('crisis', (e) => crises.push(e.type));
  tickSpoilage(s, 3 * 86400);
  off();
  assert.ok(inv.moldLevel > 0.5);
  assert.ok(s.crises.mold, 'Mold Crisis');
  assert.ok(crises.includes('mold'));
  const spray = give(s, 2166);
  startFurnitureFunction(s, shelf.uid, 2006);
  tick(s, HOUR);
  assert.equal(spray.uses, item(2166).uses - 1, 'one use of the spray');
  assert.equal(inv.moldy, false);
  assert.equal(s.crises.mold, null, 'crisis over');
  const t = post();
  const other = s.inventories[starter(t, 10001).inv];
  other.moldy = true;
  other.moldLevel = 0.9;
  disinfect(t, other, 1);
  assert.equal(other.moldy, true, 'a weak spray only knocks it back');
});

// ================================================================================================ N. Exploration
function arriveAt(s, id) {
  const r = startExploration(s, id);
  assert.ok(r.ok, r.reason);
  tick(s, travelTime(s, id) + 60);
  const run = exploreRun(s);
  assert.equal(run.phase, 'site');
  return run;
}

test('N02: sites with opening hours count down to dark; noise and nightfall bring surges of zombies', () => {
  const s = post({}, 3, 9);
  const run = arriveAt(s, 'streets');
  run.zombies = [];
  const left = timeLeft(s);
  assert.ok(left > 9 * HOUR && left < 11 * HOUR, `closes at 20:00 (${left / HOUR} h left)`);
  run.exposure = 45;
  assert.ok(searchContainer(s, 'S1').ok);
  assert.ok(run.exposure >= 50);
  assert.equal(run.zombies.length, 1, 'the noise drew one more');
  assert.equal(run.zombies[0].mode, 'chase');
  run.zombies = [];
  s.clock.t = run.closesAt + 1;
  tick(s, 30);
  assert.equal(run.warned.closed, true);
  assert.ok(run.zombies.length >= 3, 'nightfall swarm');
  assert.ok(run.exposure >= 75);
});

test('N05: exploration proficiency cuts travel stamina and search time; the Warehouse Manager sees hidden stashes marked', () => {
  const s = post({}, 5, 9);
  const sta1 = travelStamina(s, 'hardware');
  const run = arriveAt(s, 'hardware');
  run.zombies = [];
  const sec1 = fixtureOptions(s, 'S1')[0].sec;
  s.progress.prof.explore.lv = 5;
  assert.ok(travelStamina(s, 'hardware') < sta1 * 0.85, 'less tiring to travel');
  assert.ok(fixtureOptions(s, 'S1')[0].sec < sec1 * 0.8, 'faster searching');
  const marked = (character) => {
    const t = post({ character }, 5, 9);
    const r = arriveAt(t, 'hardware');
    r.zombies = [];
    r.fixtures.find((f) => f.id === 'S1').hidden = true;
    return buildView(t).furniture.find((f) => f.uid === 'x:S1').exclaim;
  };
  assert.equal(marked('warehouse'), true);
  assert.equal(marked('wage'), false);
});

test('I01: on the morning of Day 6 the study button and the action agree', () => {
  const s = post({}, 6, 10);
  const bench = findWorkbench(s);
  const study = furnitureFunctions(s, bench).find((f) => f.spec.kind === 'studyWorkbench');
  assert.ok(study.enabled, study.reason);
  startFurnitureFunction(s, bench.uid, study.key);
  tick(s, 4 * HOUR);
  assert.equal(bench.broken, false);
});

test('K02: traps only work in their habitat — the bird net on a terrace, the mousetrap under a roof', () => {
  const s = post();
  s.home.unlocked['2F'] = true;
  const indoor = trapSlots(s).find((x) => !x.outdoor);
  const terrace = trapSlots(s).find((x) => x.outdoor);
  assert.equal(placeTrap(s, 25003, indoor.id), null, 'no bird net indoors');
  assert.equal(placeTrap(s, 25001, terrace.id), null, 'no mousetrap on the terrace');
  const net = placeTrap(s, 25003, terrace.id);
  assert.ok(net);
  give(s, 2102, 1, s.inventories[net.data.bait]);
  assert.ok(catchChancePerHour(s, net) > 0);
  net.data.habitat = 'indoor'; // a net set indoors by an older save
  assert.equal(catchChancePerHour(s, net), 0);
  for (const character of ['wage', 'student']) {
    const t = post({ character });
    Object.assign(t.home.unlocked, { '2F': true, B1: true });
    assert.ok(trapSlots(t).some((x) => trapFits(t, 25003, x)), `${character} has a terrace spot for a bird net`);
  }
});

test('H04: rotten meat left in the compost bin becomes basic fertilizer after a few days', () => {
  const s = post();
  const bin = install(s, 66000);
  const compost = s.inventories[bin.inv];
  const shelf = s.inventories[starter(s, 10001).inv];
  give(s, 26008, 1, compost);
  give(s, 26010, 1, compost);
  give(s, 26008, 1, shelf);
  tickSpoilage(s, 2.5 * 86400);
  assert.equal(count(compost, 26008), 0, 'the strip is compost');
  assert.equal(count(compost, 26010), 1, 'the steak takes longer');
  assert.equal(count(compost, 15501), 1);
  tickSpoilage(s, 2 * 86400);
  assert.equal(count(compost, 15501), 2);
  assert.equal(count(shelf, 26008), 1, 'on a shelf it just stays rotten');
});

test('H05: a switched-on, powered LED grow light lights the planters next to it', () => {
  const s = post({}, 3, 12);
  const pot = starter(s, 60000);
  assert.equal(planterEnv(s, pot).light, 0, 'no light indoors');
  const lamp = install(s, 64000, pot.floor);
  Object.assign(lamp, { x: pot.x + 1, y: pot.y, on: true });
  assert.equal(planterEnv(s, pot).light, 2);
  lamp.powered = false;
  assert.equal(planterEnv(s, pot).light, 0, 'no power, no light');
  Object.assign(lamp, { powered: true, on: false });
  assert.equal(planterEnv(s, pot).light, 0, 'switched off');
  Object.assign(lamp, { on: true, x: pot.x + 8 });
  assert.equal(planterEnv(s, pot).light, 0, 'too far away');
});

test('I07: recycling breaks a piece down into its materials; "recover part of the materials" keeps some', () => {
  const s = post();
  const paper = install(s, 310);
  const fn = furnitureFunctions(s, paper).find((f) => f.spec.kind === 'recycle');
  assert.ok(fn?.enabled, fn?.reason);
  const sta = s.player.stats.sta;
  const before = furn(310).rmGet.map((id) => count(bp(s), id));
  startFurnitureFunction(s, paper.uid, fn.key);
  tick(s, HOUR);
  assert.equal(s.furniture[paper.uid], undefined, 'the piece is gone');
  furn(310).rmGet.forEach((id, i) => assert.ok(count(bp(s), id) > before[i], `got ${id}`));
  assert.ok(s.player.stats.sta < sta);
  assert.equal(s.progress.counters['furniture.recycle'], 1);
  const monitor = createFurniture(s, 66087, paper.slot); // scenery found in homes and sites, not sold
  const fn2 = furnitureFunctions(s, monitor).find((f) => f.spec.kind === 'recycle');
  assert.equal(fn2.spec.partial, true);
  const n0 = bp(s).items.length;
  startFurnitureFunction(s, monitor.uid, fn2.key);
  tick(s, HOUR);
  const got = bp(s).items.length - n0;
  assert.ok(got >= 1 && got <= furn(66087).rmGet.length, `kept ${got} of ${furn(66087).rmGet.length}`);
});

test('M11: the Mold Crisis shows on the crisis bar with an objective, and clearing it counts as a survived crisis', () => {
  const s = post();
  const shelf = starter(s, 10001);
  const inv = s.inventories[shelf.inv];
  give(s, 2125, 1, inv);
  inv.moldy = true;
  tickSpoilage(s, 3 * 86400);
  assert.ok(s.crises.active.some((c) => c.type === 'mold'), 'on the crisis bar');
  const obj = getObjectives(s).find((o) => o.id === 'mold');
  assert.ok(obj?.urgent, 'an urgent objective');
  assert.match(obj.text, /disinfect/i);
  const survived = s.progress.crisesSurvived || 0;
  give(s, 2166);
  startFurnitureFunction(s, shelf.uid, 2006);
  tick(s, HOUR);
  assert.ok(!s.crises.active.some((c) => c.type === 'mold'), 'gone from the bar');
  assert.equal(s.progress.crisesSurvived, survived + 1);
  assert.ok(!getObjectives(s).some((o) => o.id === 'mold'));
});

test('L02: the hand-knitted scarf keeps the survivor one level warmer for the rest of the run', () => {
  const s = post({}, 3, 12);
  tick(s, 30);
  const scarf = give(s, 24114);
  const op = itemOps(s, scarf).find((o) => o.op === 'use');
  assert.equal(op.label, 'Wear');
  enqueue(s, useItemAction(s, s.player.backpack, scarf.uid, 'use'));
  tick(s, 15 * 60);
  assert.equal(count(bp(s), 24114), 0, 'the scarf is worn, not carried');
  assert.equal(s.player.worn.scarf, true);
  assert.equal(clothingWarmth(s), 6);
  tick(s, 60);
  assert.ok(Math.abs(s.weather.felt - (survivorTemp(s) + 6)) < 0.2, `felt ${s.weather.felt} vs ${survivorTemp(s)}`);
  const second = give(s, 24114);
  assert.notEqual(canUseNow(s, second), true, 'one scarf is enough');
});

test('L02 (keepsakes): the neighbour girl’s keepsakes do what their config text says', () => {
  const s = post({}, 3, 12);
  tick(s, 30);
  const use = (/** @type {number} */ id, /** @type {string} */ op) => {
    const it = give(s, id);
    assert.ok(itemOps(s, it).some((o) => o.op === op), `${id} offers ${op}`);
    enqueue(s, useItemAction(s, s.player.backpack, it.uid, op));
    tick(s, 15 * 60);
    return it;
  };
  // the charm: reusable, morale recovers faster for about 3 hours
  s.player.stats.mor = 40;
  use(24111, 'use');
  assert.equal(count(bp(s), 24111), 1, 'the charm is kept (uses -1)');
  assert.ok(hasEffect(s, 'soothed'));
  // the dried bouquet: morale up at once (config mor 20), used up
  s.player.stats.mor = 40;
  use(24112, 'use');
  assert.equal(count(bp(s), 24112), 0);
  assert.ok(s.player.stats.mor >= 58, `morale ${s.player.stats.mor}`);
  // the paper crane: a wish, then Life slowly recovers
  s.player.stats.life = 50;
  use(24113, 'use');
  assert.ok(hasEffect(s, 'blessed'));
  const life = s.player.stats.life;
  tick(s, 2 * 3600);
  assert.ok(s.player.stats.life > life + 1, `life ${life} → ${s.player.stats.life}`);
  // taken apart for the materials the text names; the small flower leaves two basic fertilizer
  for (const [id, product, n] of [[24115, 15501, 2], [24116, 20001, 1], [24119, 20001, 1], [24118, 20004, 1], [24124, 20004, 1], [24120, 20003, 1], [24125, 20003, 1], [24121, 20002, 1], [24126, 20002, 1]]) {
    const before = count(bp(s), product);
    use(id, 'use');
    assert.equal(count(bp(s), id), 0, `${id} is used up`);
    assert.equal(count(bp(s), product), before + n, `${id} → ${n} × ${product}`);
  }
});

test('G08 (big dishes): a big dish is eaten until full and the rest keeps for the next meal', () => {
  const s = post();
  const bucket = give(s, 12317); // Family Bucket, 170 satiety
  const full = instWeightG(bucket);
  s.player.stats.sat = 20;
  eatItem(s, bp(s), bucket);
  const first = s.player.stats.sat - 20;
  assert.ok(s.player.stats.sat >= 99, 'full');
  assert.equal(count(bp(s), 12317), 1, 'leftovers stay in the backpack');
  assert.ok(bucket.left > 0.4 && bucket.left < 0.6, `about half left (${bucket.left})`);
  assert.ok(instWeightG(bucket) < full, 'and weigh less');
  assert.ok(foodSat(bucket) < item(12317).sat, 'stock counts only what is left');
  s.player.stats.sat = 0;
  eatItem(s, bp(s), bucket);
  assert.equal(count(bp(s), 12317), 0, 'finished');
  const total = first + s.player.stats.sat;
  assert.ok(Math.abs(total - 170 * getMods(s).eatSat) < 3, `no satiety wasted (${total})`);
  const small = give(s, 2102); // crackers: small snacks are eaten whole
  s.player.stats.sat = 99;
  eatItem(s, bp(s), small);
  assert.equal(count(bp(s), 2102), 0);
});

test('G01 (taste): the survivor reaches for the tastier of two equal foods, and finishes leftovers first', () => {
  const s = post();
  const shelf = s.inventories[starter(s, 10001).inv];
  shelf.items = [];
  give(s, 9030, 1, shelf); // canned tuna: 20 satiety, taste 3
  give(s, 9032, 1, shelf); // chocolate bar: 20 satiety, taste 4
  assert.equal(bestFood(s).inst.id, 9032);
  const bucket = give(s, 12317, 1, shelf);
  bucket.left = 0.3;
  assert.equal(bestFood(s).inst.uid, bucket.uid, 'leftovers first');
});

test('I08: tool pliers halve the time to take furniture apart and recover every material', () => {
  const s = post();
  const paper = install(s, 310);
  const key = furnitureFunctions(s, paper).find((f) => f.spec.kind === 'recycle').key;
  const slow = startFurnitureFunction(s, paper.uid, key);
  const plain = slow.dur;
  s.actions.queue = [];
  s.actions.current = null;
  give(s, 20350);
  const fast = startFurnitureFunction(s, paper.uid, key);
  assert.equal(fast.dur, plain / 2);
});

test('G12: a cup of brewed tea warms the survivor up like hot water', () => {
  const s = post();
  addEffect(s, 'cold', 6);
  const tea = give(s, 2003);
  enqueue(s, useItemAction(s, s.player.backpack, tea.uid, 'use'));
  tick(s, 15 * 60);
  assert.equal(count(bp(s), 2003), 0);
  assert.equal(hasEffect(s, 'cold'), false);
  assert.ok(hasEffect(s, 'warm'));
});
