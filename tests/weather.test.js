import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { tick } from '../src/sim/tick.js';
import { startFurnitureFunction } from '../src/sim/furnActions.js';
import { installFurniture, homeFurniture, allSlots, canInstall, dismantle } from '../src/sim/home.js';
import { addItem, count } from '../src/sim/inventory.js';
import { hasEffect, addEffect, removeEffect } from '../src/sim/stats.js';
import { dayStartT, dayNumber } from '../src/sim/time.js';
import { setApplianceOn } from '../src/sim/power.js';
import {
  WEATHER_KINDS,
  advanceWeather,
  seasonalMean,
  nextColdWave,
  outdoorTemp,
  indoorTemp,
  weatherSunFactor,
  outdoorStaminaMult,
} from '../src/sim/weather.js';

function post(seed, day = 2, hour = 12, opts = {}) {
  const s = newGame({ seed, ...opts });
  s.phase = 'post';
  s.clock.t = dayStartT(s.clock, day) + hour * 3600;
  s.run.day = day;
  return s;
}

const at = (s, day, hour) => dayStartT(s.clock, day) + hour * 3600;

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

// Pin the outdoor temperature by flattening yesterday's, today's and tomorrow's curves.
function setOutdoor(s, temp, kind = 'cloudy') {
  const w = s.weather;
  for (const d of [w.history[w.history.length - 1], w.today, w.tomorrow]) if (d) Object.assign(d, { mean: temp, low: temp, high: temp });
  w.today.kind = kind;
}

test('weather rolls are deterministic per seed; the outbreak day is sunny and mild', () => {
  const a = newGame({ seed: 61 });
  const b = newGame({ seed: 61 });
  assert.equal(a.weather.today.kind, 'sunny');
  assert.ok(a.weather.today.mean >= 15);
  assert.deepEqual(a.weather.tomorrow, b.weather.tomorrow);
  advanceWeather(a, 60);
  advanceWeather(b, 60);
  assert.equal(a.weather.history.length, 59);
  assert.deepEqual(a.weather.history, b.weather.history);
  assert.deepEqual(a.weather.coldWaves, b.weather.coldWaves);
  for (const d of a.weather.history) assert.ok(WEATHER_KINDS.includes(d.kind), d.kind);
  const c = newGame({ seed: 62 });
  advanceWeather(c, 60);
  assert.notDeepEqual(
    c.weather.history.map((d) => d.kind),
    a.weather.history.map((d) => d.kind)
  );
});

test("tomorrow's forecast becomes today's weather", () => {
  const s = post(63, 3, 23);
  tick(s, 60);
  const tomorrow = { ...s.weather.tomorrow };
  assert.equal(tomorrow.day, 4);
  tick(s, 3600);
  assert.equal(dayNumber(s.clock), 4);
  assert.equal(s.weather.today.day, 4);
  assert.equal(s.weather.today.kind, tomorrow.kind);
  assert.equal(s.weather.today.mean, tomorrow.mean);
  assert.equal(s.weather.today.sun, tomorrow.sun);
  assert.equal(s.weather.history[s.weather.history.length - 1].day, 3);
  assert.equal(s.weather.tomorrow.day, 5);
});

test('autumn turns into winter, and calm difficulty brings more sunny days', () => {
  assert.ok(seasonalMean(1) > seasonalMean(30) && seasonalMean(30) > seasonalMean(80));
  let calm = 0;
  let harsh = 0;
  for (const seed of [71, 72, 73]) {
    const a = newGame({ seed, difficulty: 'relaxed' });
    const b = newGame({ seed, difficulty: 'outOfAmmo' });
    advanceWeather(a, 90);
    advanceWeather(b, 90);
    const avg = (w, from, to) => {
      const days = w.history.filter((d) => d.day >= from && d.day <= to);
      return days.reduce((sum, d) => sum + d.mean, 0) / days.length;
    };
    assert.ok(avg(a.weather, 70, 89) < avg(a.weather, 2, 20) - 10, 'winter is much colder');
    calm += a.weather.history.filter((d) => d.kind === 'sunny').length;
    harsh += b.weather.history.filter((d) => d.kind === 'sunny').length;
  }
  assert.ok(calm > harsh * 1.4, `sunny days relaxed ${calm} vs hardest ${harsh}`);
});

test('the first cold wave is announced days ahead, ramps up and leaves the crisis bar', () => {
  const s = post(64, 10, 12);
  tick(s, 60);
  const wave = nextColdWave(s);
  assert.ok(wave.first && wave.start >= 26 && wave.start <= 35, `first cold wave on day ${wave.start}`);
  s.clock.t = at(s, wave.start - 2, 12);
  tick(s, 60);
  const warning = s.crises.upcoming.find((c) => c.type === 'coldWave');
  assert.ok(warning, 'warning in the crisis bar');
  assert.equal(warning.at, dayStartT(s.clock, wave.start));
  s.clock.t = at(s, wave.start - 1, 12);
  tick(s, 60);
  assert.equal(s.weather.tomorrow.kind, 'coldWave', 'the forecast shows it coming');
  s.clock.t = at(s, wave.start, 12);
  tick(s, 60);
  assert.equal(s.weather.today.kind, 'coldWave');
  assert.ok(!s.crises.upcoming.some((c) => c.type === 'coldWave'));
  assert.ok(s.crises.active.some((c) => c.type === 'coldWave'));
  const firstDay = s.weather.today.mean;
  assert.ok(firstDay < seasonalMean(wave.start), 'colder than the season');
  s.clock.t = at(s, wave.start + wave.days - 2, 12);
  tick(s, 60);
  assert.ok(s.weather.today.mean < firstDay - 3, 'moderate at first, severe at its peak');
  s.clock.t = at(s, wave.start + wave.days, 12);
  tick(s, 60);
  assert.ok(!s.crises.active.some((c) => c.type === 'coldWave'));
  assert.ok(s.crises.history.some((c) => c.type === 'coldWave'));
  assert.ok(s.loop.memories.some((m) => m.id === 'coldWave'));
});

test('indoor temperature: insulation per floor, and heat from a powered AC stays on its floor', () => {
  const s = post(65, 3, 12);
  s.home.unlocked.B1 = true;
  tick(s, 30);
  setOutdoor(s, -15, 'snow');
  tick(s, 30);
  assert.equal(outdoorTemp(s), -15);
  assert.equal(indoorTemp(s, '1F'), -7, 'walls keep 8 °C in');
  assert.equal(indoorTemp(s, 'B1'), -4, 'the basement keeps more');
  const ac = install(s, 21007); // air conditioner, HeatOutput 2, 11 W
  tick(s, 60);
  assert.equal(ac.powered, true);
  const warm = indoorTemp(s, '1F');
  assert.ok(warm > 1, `the AC warms the floor (${warm} °C)`);
  assert.equal(s.weather.indoorTemp['1F'], warm);
  assert.equal(indoorTemp(s, 'B1'), -4, 'heat stays on its floor');
  assert.ok(s.power.draw >= 11, 'heating draws power');
  setApplianceOn(s, ac.uid, false);
  tick(s, 60);
  assert.equal(indoorTemp(s, '1F'), -7);
  setOutdoor(s, 20, 'sunny');
  setApplianceOn(s, ac.uid, true);
  tick(s, 60);
  assert.equal(s.power.units[ac.uid].reason, 'thermostat', 'no heating needed on a warm day');
  assert.ok(indoorTemp(s, '1F') <= 22, 'walls alone never overheat a room');
});

test('a fuel heater burns fuel for warmth without power', () => {
  const s = post(66, 9, 12);
  tick(s, 30);
  assert.equal(s.power.grid, false);
  setOutdoor(s, -10);
  const heater = install(s, 65001);
  const bp = s.inventories[s.player.backpack];
  for (let i = 0; i < 4; i++) addItem(s, bp, 20005); // wood chips, 1500 heat each
  const cold = indoorTemp(s, '1F');
  assert.ok(startFurnitureFunction(s, heater.uid, 1776));
  tick(s, 1800);
  assert.equal(heater.on, true);
  assert.equal(heater.data.lit, true);
  assert.equal(count(bp, 20005), 0, 'the wood went into the heater');
  assert.ok(indoorTemp(s, '1F') > cold + 3, `warmer: ${cold} -> ${indoorTemp(s, '1F')}`);
});

test('the cold gives Cold, Warm protects, prolonged cold brings a fever', () => {
  const s = post(67, 20, 12);
  tick(s, 30);
  setOutdoor(s, -20, 'coldWave');
  tick(s, 60);
  assert.ok(hasEffect(s, 'cold'), 'Cold sets in below 8 °C');
  assert.ok(s.player.effects.cold.power >= 1.5, 'harsher when it is freezing');
  removeEffect(s, 'cold');
  addEffect(s, 'warm', 3);
  tick(s, 60);
  assert.equal(hasEffect(s, 'cold'), false, 'Warm keeps Cold away');
  removeEffect(s, 'warm');
  let fever = false;
  for (let hour = 0; hour < 96 && !fever; hour++) {
    Object.assign(s.player.stats, { sat: 80, sta: 80, mor: 80, life: 100 });
    setOutdoor(s, -20, 'coldWave');
    tick(s, 3600);
    fever = hasEffect(s, 'fever');
  }
  assert.ok(s.weather.coldExposure >= 12 * 3600);
  assert.ok(fever, 'prolonged cold brings a fever');
});

test('snow makes outdoor activity harder; overcast skies starve solar panels', () => {
  const s = post(68, 5, 12);
  tick(s, 30);
  Object.assign(s.weather.today, { kind: 'snow', sun: 0.25 });
  assert.ok(outdoorStaminaMult(s) >= 1.3);
  assert.equal(weatherSunFactor(s), 0.25);
  setOutdoor(s, 12, 'sunny');
  s.weather.today.sun = 1;
  assert.equal(outdoorStaminaMult(s), 1);
  assert.equal(weatherSunFactor(s), 1);
});
