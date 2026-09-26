import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { tick } from '../src/sim/tick.js';
import '../src/sim/furnActions.js';
import { startFurnitureFunction } from '../src/sim/furnActions.js';
import {
  queueFarm,
  queuePlanting,
  queueVase,
  validateFarmOp,
  canQueuePlanting,
  plantResearched,
  farmSmartOp,
  startFarmSmartAction,
  cropRate,
  planterEnv,
  countLivePlants,
  ivyDefense,
  harvestLeft,
} from '../src/sim/farming.js';
import { plant } from '../src/data/db.js';
import { furnitureAt, dismantle, installFurniture, removeFurniture } from '../src/sim/home.js';
import { addItem, count } from '../src/sim/inventory.js';
import { addEffect, hasEffect } from '../src/sim/stats.js';
import { absSeconds, dayStartT } from '../src/sim/time.js';
import { on } from '../src/engine/bus.js';

function postDisaster(seed, character = 'wage') {
  const s = newGame({ seed, character });
  s.phase = 'post';
  s.clock.t = s.clock.outbreakAt + 3 * 3600; // 21:00 on Day 1
  s.run.day = 1;
  return s;
}

const bp = (s) => s.inventories[s.player.backpack];

function give(s, id, n = 1) {
  for (let i = 0; i < n; i++) addItem(s, bp(s), id);
}

function keepAlive(s) {
  Object.assign(s.player.stats, { sat: 80, sta: 80, mor: 70, life: 100 });
}

function install(s, cfg, slot) {
  const old = furnitureAt(s, slot);
  if (old) removeFurniture(s, old.uid);
  const r = installFurniture(s, cfg, slot);
  assert.ok(r.ok, `install ${cfg} at ${slot}: ${r.reason}`);
  return r.f;
}

// Large pot where the Wage Slave's wood pile stood.
function bigPot(s) {
  dismantle(s, furnitureAt(s, '1F:l4').uid);
  return install(s, 60002, '1F:l4');
}

// Upstairs unlocked and the junk pile in front of the terrace entrance cleared.
function openTerrace(s) {
  s.home.unlocked['2F'] = true;
  dismantle(s, furnitureAt(s, '2F:p1').uid);
}

function research(s) {
  s.farm.researched = true;
}

// Sow through the real action queue (till + plant) and let the survivor finish.
function sow(s, f, seedId, n = 1) {
  give(s, seedId, n);
  queuePlanting(s, f.uid, seedId, { count: n });
  tick(s, 2 * 3600);
  assert.equal(f.data.crops.length, n, `seeds ${seedId} went into the pot`);
  return f.data.crops;
}

// Advance to the next full hour so hourly anomaly rolls land at the very end of each tick() call.
function alignHour(s) {
  const r = 3600 - (absSeconds(s.clock) % 3600);
  if (r > 0 && r < 3600) tick(s, r);
}

// Tick hour by hour while tending every pot, so random anomalies never get to slow growth.
function tendHours(s, hours, until) {
  for (let i = 1; i <= hours; i++) {
    tick(s, 3600);
    keepAlive(s);
    for (const f of Object.values(s.furniture)) for (const c of f.data?.crops || []) Object.assign(c, { pest: false, weed: false, dry: false, water: 1 });
    if (until?.()) return i;
  }
  return hours;
}

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('planting needs one round of research at planting Lv0 (H07)', () => {
  const s = postDisaster(21);
  const pot = bigPot(s);
  give(s, 15007);
  assert.equal(plantResearched(s), false);
  assert.match(String(canQueuePlanting(s, pot.uid, 15007)), /Research/);
  assert.match(String(validateFarmOp(s, pot.uid, 'plant', { seedId: 15007 })), /Research/);
  queueFarm(s, pot.uid, 'research');
  tick(s, 3600);
  assert.equal(plantResearched(s), true);
  assert.equal(s.progress.prof.plant.exp, 50, 'research grants PlantLv0 research_exp');
  assert.equal(canQueuePlanting(s, pot.uid, 15007), true);
  assert.equal(validateFarmOp(s, pot.uid, 'research'), 'Already researched.');
  assert.equal(plantResearched(postDisaster(22, 'student')), true, 'the Student starts at planting Lv2');
});

test('seeds go into tilled soil, grow to ripe and harvest into the backpack with exp, codex and counters (H02, H03)', () => {
  const s = postDisaster(23);
  research(s);
  const pot = bigPot(s);
  give(s, 15007, 2);
  const queued = queuePlanting(s, pot.uid, 15007, { count: 2 });
  assert.deepEqual(
    queued.map((a) => a.op),
    ['till', 'plant'],
    'a fresh pot is tilled before sowing'
  );
  tick(s, 2 * 3600);
  assert.equal(pot.data.soil, 'tilled');
  assert.equal(pot.data.crops.length, 2, 'two size-1 mushrooms share the four-unit pot');
  assert.equal(count(bp(s), 15007), 0, 'seeds consumed');
  assert.equal(pot.data.plant.count, 2, 'renderer summary');
  alignHour(s);
  const hours = tendHours(s, 60, () => pot.data.crops.every((c) => c.ready));
  assert.ok(hours >= 45 && hours <= 48, `White Beech Mushroom (48 h) ripened after ${hours} h`);
  assert.equal(pot.data.plant.ready, true);
  assert.equal(farmSmartOp(s, pot.uid), 'harvest');
  queueFarm(s, pot.uid, 'harvest');
  tick(s, 3600);
  assert.ok(count(bp(s), 2513) >= 4, 'two mushrooms per crop');
  assert.equal(s.progress.counters['plant.harvest'], 2);
  assert.ok(s.progress.codexRun.plant.includes(5), 'plant codex entry');
  assert.ok(s.progress.prof.plant.lv >= 1, 'harvest and discovery exp level planting up');
  assert.equal(pot.data.crops.length, 0);
  assert.equal(pot.data.soil, 'untilled', 'an emptied pot must be tilled again');
  assert.equal(pot.data.plant, null);
});

test('perfect crops use the perfect yield; only anomaly-free ones count toward Flawless Growth (S03)', () => {
  const s = postDisaster(24);
  research(s);
  const pot = bigPot(s);
  const [clean, troubled] = sow(s, pot, 15007, 2);
  Object.assign(clean, { growth: 1, ready: true, readyAt: s.clock.t, perfect: true, anomaly: false });
  Object.assign(troubled, { growth: 1, ready: true, readyAt: s.clock.t, perfect: true, anomaly: true });
  queueFarm(s, pot.uid, 'harvest');
  tick(s, 3600);
  assert.equal(s.progress.counters['plant.harvest'], 2);
  assert.equal(s.progress.counters['plant.perfect'], 1, 'the crop that had problems does not count');
  assert.ok(count(bp(s), 15007) >= 2, 'the perfect yield includes a seed for each crop');
});

test('fertilizer is taken from home storage and speeds growth by its bonus (H03, H04)', () => {
  const s = postDisaster(25);
  research(s);
  const fed = bigPot(s);
  const plain = install(s, 60000, '1F:l9');
  const shelf = furnitureAt(s, '1F:l3');
  addItem(s, s.inventories[shelf.inv], 15501);
  give(s, 15007, 2);
  const queued = queuePlanting(s, fed.uid, 15007, { fertId: 15501 });
  assert.deepEqual(
    queued.map((a) => a.op),
    ['till', 'plant', 'fertilize']
  );
  queuePlanting(s, plain.uid, 15007);
  tick(s, 3 * 3600);
  const [a] = fed.data.crops;
  const [b] = plain.data.crops;
  assert.equal(a.fertilizer, 15501);
  assert.equal(count(s.inventories[shelf.inv], 15501), 0, 'basic fertilizer came off the shelf');
  assert.equal(validateFarmOp(s, fed.uid, 'fertilize', { fertId: 15502 }), 'Not enough fertilizer');
  for (const c of [a, b]) Object.assign(c, { pest: false, weed: false, dry: false, water: 1 });
  assert.ok(near(cropRate(s, fed, a) / cropRate(s, plain, b), 1.3, 1e-6), 'basic fertilizer: +30% speed');
  alignHour(s);
  a.growth = 0;
  b.growth = 0;
  tendHours(s, 20);
  assert.ok(near(a.growth / b.growth, 1.3, 1e-6), `growth ratio ${a.growth / b.growth}`);
});

test('light-hungry crops need sun by day or powered grow lights (H05)', () => {
  const s = postDisaster(26);
  openTerrace(s);
  const indoor = bigPot(s);
  const terrace = install(s, 60002, '2F:p2');
  const lampBox = install(s, 60008, '2F:p5'); // plant-light cultivation box: ElectricLight 2, +30% growth
  const tomato = { plantId: 24, growth: 0, ready: false, withered: false };
  const noon = dayStartT(s.clock, 2) + 12 * 3600;
  const midnight = dayStartT(s.clock, 2);
  const rel = (f, t) => cropRate(s, f, tomato, planterEnv(s, f, { t })) * 435000;
  s.weather = { today: { kind: 'sunny', temp: 20 } };
  assert.ok(near(rel(indoor, noon), 0.2), 'no light indoors slows growth strongly');
  assert.ok(near(rel(terrace, noon), 1), 'full sun at noon on the terrace');
  assert.ok(near(rel(terrace, midnight), 0.2), 'no sun at night');
  s.weather.today.kind = 'cloudy';
  assert.ok(near(rel(terrace, noon), 0.6), 'clouds halve the sun');
  assert.ok(near(rel(lampBox, midnight), 1.3, 1e-6), 'powered grow lights work through the night');
  lampBox.powered = false;
  assert.ok(near(rel(lampBox, midnight), 0.2), 'without power the box is just a pot');
  s.story.route = 'greenhouse';
  assert.ok(near(rel(indoor, midnight), 1), 'the Greenhouse commitment fits every pot with lighting');
  assert.equal(planterEnv(s, indoor).heated, true, 'and a thermostat');
});

test('cold stops frost-tender crops; a cold wave kills them outdoors unless heated or indoors (H06, L03)', () => {
  const s = postDisaster(27);
  research(s);
  openTerrace(s);
  s.weather = { today: { kind: 'sunny', temp: 2 } };
  const bare = install(s, 60002, '2F:p9');
  const clay = install(s, 60015, '2F:p5'); // clay pot: AddHeat 1
  const warmed = install(s, 60002, '2F:p2');
  const heater = install(s, 65000, '2F:p7'); // heating device next to the p2 pot
  const inside = bigPot(s);
  const crops = [bare, clay, warmed, inside].map((f) => sow(s, f, 15008)[0]); // Straw Mushroom: ColdResistance 0
  alignHour(s);
  for (const c of crops) c.growth = 0;
  tendHours(s, 3);
  const [b, c, w, i] = crops;
  assert.equal(b.growth, 0, 'too cold to grow on the bare terrace pot');
  assert.ok(c.growth > 0 && w.growth > 0 && i.growth > 0, 'heated or indoor pots keep growing');
  s.weather = { today: { kind: 'coldWave', temp: -15 } };
  tendHours(s, 7);
  assert.equal(b.withered, true, 'froze in the cold wave');
  assert.equal(b.witherCause, 'cold');
  assert.equal(c.withered, false, 'clay pot insulates');
  assert.equal(w.withered, false, 'the powered heater keeps nearby planters warm');
  assert.equal(i.withered, false, 'indoor pot rides it out');
  assert.equal(countLivePlants(s), 3);
  assert.equal(s.progress.counters.PlantPotCount, 3);
  addEffect(s, 'cold', 6);
  queueFarm(s, heater.uid, 'warm');
  tick(s, 3600);
  assert.equal(hasEffect(s, 'cold'), false, 'warming up at the heater removes Cold');
});

test('rain waters outdoor planters and ends drought; indoor pots still need watering (H06)', () => {
  const s = postDisaster(28);
  research(s);
  openTerrace(s);
  const terrace = install(s, 60002, '2F:p2');
  const inside = bigPot(s);
  const [t] = sow(s, terrace, 15007);
  const [i] = sow(s, inside, 15007);
  for (const c of [t, i]) Object.assign(c, { pest: false, weed: false, water: 0, dry: true });
  s.weather = { today: { kind: 'rain', temp: 14 } };
  tick(s, 60);
  assert.equal(t.water, 1);
  assert.equal(t.dry, false);
  assert.equal(i.dry, true);
  assert.equal(farmSmartOp(s, inside.uid), 'water');
  queueFarm(s, inside.uid, 'water');
  tick(s, 1800);
  assert.equal(i.dry, false);
  assert.ok(i.water > 0.95);
});

test('pests, weeds and drought roll from plant odds; planter controls prevent them (H01, H02)', () => {
  const s = postDisaster(35);
  research(s);
  const plain = bigPot(s);
  const station = install(s, 60009, '1F:l1'); // full-spectrum hydroponic station replaces the workbench
  sow(s, plain, 15007, 4);
  sow(s, station, 15007, 4);
  const hits = { [plain.uid]: 0, [station.uid]: 0 };
  const off = on('cropAnomaly', (e) => (hits[e.furn] = (hits[e.furn] || 0) + 1));
  alignHour(s);
  tendHours(s, 30);
  off();
  assert.ok(hits[plain.uid] > 0, 'an ordinary pot runs into trouble');
  assert.equal(hits[station.uid], 0, 'the hydroponic station blocks pests, weeds and drought');
  assert.ok(station.data.crops[0].growth > plain.data.crops[0].growth * 1.4, 'and grows 50% faster');
});

test('E smart action picks pests > weeds > water > harvest; queued ops skip pots that changed (H03)', () => {
  const s = postDisaster(29);
  research(s);
  const pot = bigPot(s);
  const [c] = sow(s, pot, 15007);
  Object.assign(c, { pest: true, weed: true, water: 0.1 });
  assert.equal(farmSmartOp(s, pot.uid), 'pest');
  c.pest = false;
  assert.equal(farmSmartOp(s, pot.uid), 'weed');
  c.weed = false;
  assert.equal(farmSmartOp(s, pot.uid), 'water');
  Object.assign(c, { water: 1, growth: 1, ready: true, readyAt: s.clock.t });
  assert.equal(farmSmartOp(s, pot.uid), 'harvest');
  Object.assign(c, { ready: false, growth: 0.5, rollG: 0.5, pest: true });
  const done = [];
  const offDone = on('actionDone', (a) => a.kind === 'farm' && done.push(a.op));
  startFarmSmartAction(s, pot.uid);
  queueFarm(s, pot.uid, 'pest');
  tick(s, 1800);
  offDone();
  assert.equal(c.pest, false);
  assert.deepEqual(done, ['pest'], 'the second de-pest was skipped instead of costing stamina again');
  const opened = [];
  const offOpen = on('openPanel', (e) => opened.push(e.panel));
  queueFarm(s, pot.uid, 'remove');
  tick(s, 1800);
  assert.equal(pot.data.crops.length, 0);
  startFarmSmartAction(s, pot.uid);
  startFurnitureFunction(s, pot.uid, 1610);
  tick(s, 1);
  offOpen();
  assert.deepEqual(opened, ['plant', 'plant'], 'E and the Plant function open the planting panel on an empty pot');
});

test('the starter pot holds a houseplant: water it for morale, pull it out to plant (H03, C03)', () => {
  const s = postDisaster(30);
  research(s);
  const pot = furnitureAt(s, '1F:l8');
  assert.equal(pot.data.decorPlant, true);
  assert.equal(pot.data.plant.decor, true, 'renderer shows the houseplant');
  give(s, 15007);
  assert.match(String(canQueuePlanting(s, pot.uid, 15007)), /decorative/);
  assert.equal(farmSmartOp(s, pot.uid), 'water');
  const maxMor = s.player.max.mor;
  queueFarm(s, pot.uid, 'water');
  tick(s, 1800);
  assert.equal(s.player.max.mor, maxMor + 2, 'daily watering raises max morale');
  assert.equal(validateFarmOp(s, pot.uid, 'water'), 'Already watered today.');
  queueFarm(s, pot.uid, 'removeDecor');
  tick(s, 1800);
  assert.equal(pot.data.decorPlant, false);
  assert.equal(pot.data.plant, null);
  queuePlanting(s, pot.uid, 15007);
  tick(s, 2 * 3600);
  assert.equal(pot.data.crops.length, 1);
});

test('ripe crops keep for HarvestTime, go overripe, wither after DecayTime and leave fertilizer when cleared (H02)', () => {
  const s = postDisaster(31);
  research(s);
  const pot = bigPot(s);
  const [c] = sow(s, pot, 15007);
  const p = plant(c.plantId);
  Object.assign(c, { growth: 1, ready: true, readyAt: s.clock.t });
  const live = (seconds) => {
    for (let left = seconds; left > 0; left -= 6 * 3600) {
      Object.assign(s.player.stats, { sat: 90, sta: 90, mor: 90, life: 100 });
      tick(s, Math.min(6 * 3600, left));
    }
  };
  live(p.window - 3600);
  assert.equal(c.withered, false, 'still fresh within the harvest window');
  assert.ok(harvestLeft(s, c).fresh);
  live(2 * 3600);
  assert.equal(c.withered, false);
  assert.equal(c.overripe, true, 'overripe after the harvest window');
  assert.equal(harvestLeft(s, c).fresh, false);
  live(p.decay);
  assert.equal(c.withered, true);
  assert.equal(c.witherCause, 'decay');
  assert.equal(pot.data.plant.withered, true);
  assert.equal(farmSmartOp(s, pot.uid), 'clear');
  const before = count(bp(s), 15501);
  queueFarm(s, pot.uid, 'clear');
  tick(s, 3600);
  assert.equal(count(bp(s), 15501), before + 1, 'withered remains become basic fertilizer');
  assert.equal(s.progress.counters['plant.harvest'] || 0, 0, 'clearing is not a harvest');
  assert.equal(pot.data.soil, 'untilled');
});

test('flower harvests count for House of Flowers; a vase gives morale while fresh (H08)', () => {
  const s = postDisaster(32);
  research(s);
  openTerrace(s);
  const pot = install(s, 60002, '2F:p2');
  const [c] = sow(s, pot, 15034); // daisy
  Object.assign(c, { growth: 1, ready: true, readyAt: s.clock.t, perfect: false });
  queueFarm(s, pot.uid, 'harvest');
  tick(s, 3600);
  assert.equal(s.progress.counters['plant.harvest.flower'], 1);
  assert.equal(count(bp(s), 2541), 1);
  const vase = install(s, 67000, '1F:lt1'); // living-room tabletop, in place of the radio
  queueVase(s, vase.uid, 2541);
  tick(s, 3600);
  assert.equal(vase.data.flower.id, 2541);
  assert.equal(count(bp(s), 2541), 0);
  alignHour(s);
  s.player.stats.mor = 50;
  const gains = [];
  const off = on('stat', (e) => e.source === 'vase' && gains.push(e.delta));
  tick(s, 3 * 3600);
  assert.equal(gains.length, 3);
  assert.ok(near(gains[0], 0.4, 1e-6), 'daisy: +0.4 morale per hour');
  s.clock.t = vase.data.flower.until + 1;
  tick(s, 3600);
  off();
  assert.equal(vase.data.flower.wilted, true);
  assert.equal(gains.length, 3, 'a wilted flower gives nothing');
  startFurnitureFunction(s, vase.uid, 2108);
  tick(s, 1800);
  assert.equal(vase.data.flower, null);
});

test('mature Boston Ivy on an outdoor planter guards the windows and keeps climbing (H09)', () => {
  const s = postDisaster(33);
  research(s);
  openTerrace(s);
  const pot = install(s, 60001, '2F:p3');
  const [c] = sow(s, pot, 15040);
  assert.equal(ivyDefense(s), 0);
  Object.assign(c, { growth: 1, ready: true, readyAt: s.clock.t });
  tick(s, 60);
  assert.equal(s.run.ivy, 1);
  assert.ok(ivyDefense(s) > 0 && ivyDefense(s) <= 0.5);
  assert.equal(s.run.ivyDefense, ivyDefense(s), 'published for the horde system');
  tendHours(s, 48);
  assert.equal(c.withered, false, 'ivy does not wither on the wall');
  assert.notEqual(farmSmartOp(s, pot.uid), 'harvest', 'E does not rip the ivy off the wall');
});

test('PlantPotCount follows planters with living crops and farm state survives a save round trip (S03)', () => {
  const s = postDisaster(34);
  research(s);
  const a = bigPot(s);
  const b = install(s, 60000, '1F:l9');
  sow(s, a, 15007);
  sow(s, b, 15007);
  assert.equal(countLivePlants(s), 2);
  assert.equal(s.progress.counters.PlantPotCount, 2);
  b.data.crops[0].withered = true;
  tick(s, 60);
  assert.equal(s.progress.counters.PlantPotCount, 1);
  assert.equal(s.progress.counters['PlantPotCount.best'], 2);
  const copy = JSON.parse(JSON.stringify(s));
  assert.deepEqual(copy.furniture[a.uid].data.crops, a.data.crops);
  assert.equal(copy.farm.researched, true);
});
