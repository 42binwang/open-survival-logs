import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { tick, getSystems } from '../src/sim/tick.js';
import { cancelAll, isIdle } from '../src/sim/actions.js';
import { startFurnitureFunction } from '../src/sim/furnActions.js';
import { installFurniture, homeFurniture, allSlots, canInstall, dismantle, createFurniture, furnDef } from '../src/sim/home.js';
import { addItem, count } from '../src/sim/inventory.js';
import { bumpMods } from '../src/sim/modifiers.js';
import { dayStartT, dayNumber } from '../src/sim/time.js';
import { on } from '../src/engine/bus.js';
import {
  gridUp,
  fuelInventory,
  fuelSlotCount,
  setBurner,
  setAutoStart,
  setApplianceOn,
  setLights,
  fillRodents,
  feedCage,
  cageRodents,
  damageCircuit,
  queueRepair,
} from '../src/sim/power.js';

// Post-disaster state at `hour` on `day`, with the Wage Slave basement opened.
function post(seed, day = 2, hour = 12, opts = {}) {
  const s = newGame({ seed, ...opts });
  s.phase = 'post';
  s.clock.t = dayStartT(s.clock, day) + hour * 3600;
  s.run.day = day;
  s.home.unlocked.B1 = true;
  return s;
}

// Install into the first free slot on `floor` that takes the piece, clearing starter clutter if needed.
function install(s, cfg, floor = '1F') {
  const find = () => allSlots(s).find((sl) => sl.floor === floor && !sl.trap && canInstall(s, cfg, sl.id).ok);
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

const starter = (s, cfg) => homeFurniture(s).find((f) => f.cfg === cfg);
const at = (s, day, hour) => dayStartT(s.clock, day) + hour * 3600;

test('grid power until the Day 7 blackout, then only own sources', () => {
  const s = post(41, 6, 12);
  const fridge = starter(s, 15000);
  tick(s, 60);
  assert.equal(s.power.gridCutDay, 7);
  assert.equal(gridUp(s), true);
  assert.equal(fridge.powered, true);
  assert.equal(s.power.homePowered, true);
  s.clock.t = at(s, 7, 1);
  tick(s, 60);
  assert.equal(s.power.grid, false);
  assert.ok(s.power.blackoutAt > 0);
  assert.equal(fridge.powered, false, 'nothing powers the fridge after the blackout');
  assert.equal(s.power.homePowered, false);
  assert.ok(s.crises.active.some((c) => c.type === 'blackout'));
  assert.ok(s.loop.memories.some((m) => m.id === 'blackout'), 'the blackout is remembered for the next loop');
});

test('the grid only flickers on Days 4-6 before the blackout', () => {
  const power = getSystems().find((x) => x.id === 'power');
  let flickers = 0;
  for (const seed of [42, 43, 44, 45, 46]) {
    const s = post(seed, 1, 12);
    for (let day = 2; day <= 9; day++) {
      s.power.flicker = null;
      power.onDay(s, day);
      const fl = s.power.flicker;
      if (!fl) continue;
      flickers++;
      assert.ok(day >= 4 && day < 7, `flicker on day ${day}`);
      assert.equal(dayNumber({ ...s.clock, t: fl.from }), day);
      s.clock.t = fl.from + 60;
      assert.equal(gridUp(s), false, 'grid down during the flicker');
      s.clock.t = fl.until + 60;
      assert.equal(gridUp(s), true, 'grid back afterwards');
    }
  }
  assert.ok(flickers > 0);
});

test('solar output follows daylight and the weather; panels only go on the terrace', () => {
  const s = post(47, 8, 12);
  s.home.unlocked['2F'] = true;
  const panel = install(s, 40000, '2F'); // small solar panel, 6 W peak, on the terrace
  const indoor = allSlots(s).find((sl) => sl.floor === '1F' && !s.home.slots[sl.id] && !sl.trap && sl.type === furnDef(40000).slot);
  assert.equal(canInstall(s, 40000, indoor.id).reason, 'outdoorOnly');
  const cellar = createFurniture(s, 40000, allSlots(s).find((sl) => sl.floor === 'B1' && !s.home.slots[sl.id] && !sl.trap).id); // an older save
  tick(s, 30);
  Object.assign(s.weather.today, { kind: 'sunny', sun: 1 });
  tick(s, 60);
  assert.equal(s.power.solarEff, 1);
  assert.ok(Math.abs(s.power.solarW - 6) < 1e-9, `solar ${s.power.solarW}`);
  assert.equal(s.power.units[cellar.uid].reason, 'basement');
  Object.assign(s.weather.today, { kind: 'cloudy', sun: 0.35 });
  tick(s, 60);
  assert.ok(Math.abs(s.power.solarW - 2.1) < 1e-9);
  assert.equal(s.power.units[panel.uid].reason, 'overcast');
  s.clock.t = at(s, 8, 23);
  tick(s, 60);
  assert.equal(s.power.solarW, 0);
  assert.equal(s.power.solarEff, 0);
  assert.equal(s.power.units[panel.uid].reason, 'night');
});

test('a fuel generator burns diesel from its fuel slots and powers the fridge', () => {
  const s = post(48, 8, 12);
  const fridge = starter(s, 15000);
  const gen = install(s, 42000);
  const slots = fuelInventory(s, gen);
  assert.equal(gen.on, false, 'new generators start switched off');
  assert.equal(slots.slots, 3);
  assert.equal(setBurner(s, gen.uid, true), 'Insufficient fuel');
  addItem(s, slots, 40000); // diesel, 48000 heat
  assert.equal(setBurner(s, gen.uid, true), true);
  tick(s, 600);
  assert.equal(s.power.fuelW, 40);
  assert.equal(fridge.powered, true);
  assert.equal(count(slots, 40000), 0, 'the diesel went into the burner');
  assert.ok(Math.abs(gen.data.heat - (48000 - 336)) < 1e-6, 'burns FuelRate heat per 10 minutes');
  tick(s, 24 * 3600);
  assert.equal(gen.on, false, 'stops when the fuel runs out (~24 h per diesel)');
  assert.equal(s.power.units[gen.uid].reason, 'noFuel');
  assert.equal(fridge.powered, false);
  s.run.cards.push('capacity1', 'capacity2');
  bumpMods(s);
  assert.equal(fuelSlotCount(s, gen), 5, 'Capacity Upgrade adds fuel slots');
  tick(s, 30);
  assert.equal(fuelInventory(s, gen).w, 5);
});

test('batteries store surplus power and cover the draw once the generator stops', () => {
  const s = post(49, 8, 10);
  const fridge = starter(s, 15000);
  const gen = install(s, 42000);
  install(s, 45000); // lead-acid battery, 1000 Wh
  addItem(s, fuelInventory(s, gen), 40000);
  setBurner(s, gen.uid, true);
  tick(s, 3 * 3600);
  assert.equal(s.power.capacity, 1000);
  const charged = s.power.stored;
  assert.ok(charged > 60 && charged < 120, `charged ${charged} Wh`);
  assert.equal(s.progress.counters['power.own'], 1, 'Power Up: the home runs on its own generator and battery');
  setBurner(s, gen.uid, false);
  tick(s, 3 * 3600);
  assert.ok(s.power.stored < charged && s.power.stored > 0, `discharged to ${s.power.stored} Wh`);
  assert.equal(fridge.powered, true, 'the battery keeps the fridge running');
  s.loop.abilities.energyStorage = 2;
  bumpMods(s);
  tick(s, 30);
  assert.equal(s.power.capacity, 1400, 'Energy Storage raises battery capacity');
});

test('a brownout cuts appliances by priority and reports the change', () => {
  const s = post(50, 8, 12);
  const fridge = starter(s, 15000);
  const tv = starter(s, 70000);
  s.home.unlocked['2F'] = true;
  install(s, 40000, '2F'); // 6 W of sun vs fridge 2 W + basement lights 6 W
  tick(s, 30);
  Object.assign(s.weather.today, { kind: 'sunny', sun: 1 });
  let changes = 0;
  const off = on('powerChanged', () => changes++);
  tick(s, 60);
  assert.equal(s.power.brownout, true);
  assert.equal(fridge.powered, true, 'fridges are kept first');
  assert.equal(s.power.lightsPowered, false, 'lights go first');
  assert.equal(tv.powered, false, 'no spare power to switch the TV on');
  assert.equal(s.power.homePowered, false);
  assert.ok(s.power.outageSince != null);
  setLights(s, false);
  tick(s, 60);
  assert.equal(s.power.brownout, false, 'switching the lights off ends the shortage');
  assert.equal(s.power.homePowered, true);
  s.clock.t = at(s, 8, 22);
  tick(s, 60);
  assert.equal(fridge.powered, false, 'no sun at night and no battery');
  setApplianceOn(s, fridge.uid, false);
  tick(s, 60);
  assert.equal(s.power.draw, 0);
  assert.ok(changes > 0);
  off();
});

test('a manual generator injects energy into the batteries', () => {
  const s = post(51, 8, 9);
  setApplianceOn(s, starter(s, 15000).uid, false);
  setLights(s, false);
  const gen = install(s, 41000, 'B1'); // hand-crank generator, 100 Wh per 10 minutes
  startFurnitureFunction(s, gen.uid, 1703);
  tick(s, 3600);
  assert.ok(isIdle(s), 'without a battery there is nowhere to store the power');
  assert.equal(s.power.stored, 0);
  install(s, 45000);
  const sat = s.player.stats.sat;
  startFurnitureFunction(s, gen.uid, 1703);
  tick(s, 2 * 3600);
  assert.equal(Math.round(s.power.stored), 600, 'one hour of pedaling = 6 × InjectPower');
  assert.ok(s.player.stats.sat < sat - 9, 'costs satiety');
  s.power.stored = 0;
  startFurnitureFunction(s, gen.uid, 1748); // continuous pedaling in 10-minute cycles
  tick(s, 45 * 60);
  const pedaled = s.power.stored;
  assert.ok(pedaled >= 300 && Math.round(pedaled) % 100 === 0, `continuous mode stored ${pedaled} Wh`);
  cancelAll(s);
  tick(s, 30 * 60);
  assert.equal(s.power.stored, pedaled, 'continuous mode ends when cancelled');
});

test('a rat cage generates power while fed, then the rodents starve', () => {
  const s = post(52, 8, 12);
  const cage = install(s, 42010); // small cage: 2 rodents, 6 W each
  const bp = s.inventories[s.player.backpack];
  addItem(s, bp, 30000); // house mouse
  addItem(s, bp, 30022); // lab mouse
  addItem(s, bp, 30001); // a snake does not run the wheel
  assert.equal(fillRodents(s, cage.uid), 2);
  assert.equal(count(bp, 30001), 1);
  addItem(s, bp, 2105); // instant noodles, 25 satiety
  assert.equal(feedCage(s, cage.uid), 1);
  tick(s, 60);
  assert.equal(s.power.ratW, 12);
  tick(s, 25 * 3600); // two rodents eat 25 satiety in 24 h
  assert.equal(s.power.ratW, 0);
  assert.equal(s.power.units[cage.uid].reason, 'noFood');
  tick(s, 25 * 3600);
  assert.equal(cageRodents(s, cage).length, 1, 'a rodent starved after a day without food');
  assert.equal(count(bp, 30017), 1, 'its body ends up in the backpack');
  dismantle(s, cage.uid);
  tick(s, 30);
  assert.ok(
    s.floorBoxes.some((b) => count(s.inventories[b.inv], 30022) === 1),
    'the surviving rodent is left next to the dismantled cage'
  );
});

test('Auto Start runs the generator below the threshold and stops it at full', () => {
  const s = post(53, 8, 12);
  const gen = install(s, 42000);
  install(s, 45000);
  const slots = fuelInventory(s, gen);
  addItem(s, slots, 40000);
  addItem(s, slots, 40000);
  s.power.stored = 100;
  setAutoStart(s, gen.uid, true, 50);
  tick(s, 60);
  assert.equal(gen.on, true, 'starts below 50% stored');
  s.power.stored = 1000;
  tick(s, 60);
  assert.equal(gen.on, false, 'auto-shutdown at full power');
  assert.equal(gen.data.auto, true);
  s.power.stored = 400;
  tick(s, 60);
  assert.equal(gen.on, true, 'restarts below the threshold');
  setBurner(s, gen.uid, false, { manual: true });
  assert.equal(gen.data.auto, false, 'a manual shutdown unchecks Auto Start');
});

test('True Electrician: solar, fuel generator, battery and rat cage with no outage for a day', () => {
  const s = post(54, 8, 12);
  s.home.unlocked['2F'] = true;
  install(s, 40000, '2F');
  const gen = install(s, 42000);
  install(s, 45000);
  install(s, 42010, 'B1');
  const slots = fuelInventory(s, gen);
  addItem(s, slots, 40000);
  addItem(s, slots, 40000);
  setBurner(s, gen.uid, true);
  tick(s, 12 * 3600);
  assert.equal(s.progress.counters['power.allTypes'], undefined, 'needs a full day without outage');
  tick(s, 13 * 3600);
  assert.equal(s.progress.counters['power.allTypes'], 1);
  assert.equal(s.progress.counters['power.own'], 1);
});

test('storm damage cuts the circuit until it is repaired with wire', () => {
  const s = post(55, 3, 12);
  const fridge = starter(s, 15000);
  const bp = s.inventories[s.player.backpack];
  addItem(s, bp, 20104);
  damageCircuit(s);
  tick(s, 60);
  assert.equal(fridge.powered, false, 'even grid power cannot pass a broken circuit');
  assert.equal(s.power.homePowered, false);
  queueRepair(s, true);
  tick(s, 3600);
  assert.equal(s.power.damaged, false);
  assert.equal(count(bp, 20104), 0, 'the wire was used');
  assert.equal(fridge.powered, true);
});

test('Warehouse Manager cold storage: sealed chill, then refrigeration on power', () => {
  const s = post(56, 2, 10, { character: 'warehouse' });
  const unit = starter(s, 42056);
  assert.ok(unit, 'the cold storage has a refrigeration unit');
  tick(s, 60);
  const chilled = homeFurniture(s).filter((f) => f.inv && s.inventories[f.inv].coldRoom);
  assert.ok(chilled.length > 0, 'the locked room keeps its chill');
  assert.ok(homeFurniture(s).some((f) => f.inv && !chilled.includes(f)), 'storage outside the cold room is not chilled');
  s.home.unlocked.coldStorage = true;
  tick(s, 60);
  assert.ok(chilled.every((f) => !s.inventories[f.inv].coldRoom), 'opened, but the unit is off');
  assert.ok(startFurnitureFunction(s, unit.uid, 1725));
  tick(s, 3600);
  assert.equal(unit.on, true);
  assert.equal(unit.powered, true);
  assert.ok(chilled.every((f) => s.inventories[f.inv].coldRoom), 'refrigeration keeps the room cold');
  assert.ok(s.power.draw >= 30, 'refrigeration draws 30 W');
});
