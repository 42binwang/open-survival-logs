// Section P (story, events, endings) through the systems that feed it: each survivor's 100-day storyline,
// random-event pacing, the commitment across a save, the final-horde calendar, and every ending route driven
// by the real social rescues, survivor network, drone drops, promise events, power samples and harvest counters.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { tick, getSystems } from '../src/sim/tick.js';
import { dayNumber, hourOfDay, dayStartT, DAY } from '../src/sim/time.js';
import '../src/sim/furnActions.js';
import { homeSources } from '../src/sim/furnActions.js';
import '../src/sim/planning.js';
import '../src/sim/horde.js';
import { readBook } from '../src/sim/itemuse.js';
import {
  social,
  neighborState,
  repairBasket,
  sendBasket,
  basketInventory,
  activeRescue,
  activeRequest,
  addNeighborAffinity,
  listDrones,
  droneBusy,
  requestHelp,
  respondHelp,
  deliverSupplies,
  aliveNetworkSurvivors,
  veteranState,
  giveVeteran,
} from '../src/sim/social.js';
import {
  activeEvent,
  resolveEvent,
  presentNext,
  fireEvent,
  eventDef,
  drainEvents,
  routeStatus,
  updateRouteAvailability,
  canCommit,
  commitRoute,
  finalWaveDay,
  runQuestAction,
  heaterCount,
  warmth,
  query,
  documentList,
} from '../src/sim/story.js';
import { markFinalWaveSurvived, dueEnding, continueAfterEnding, safehouseTally, survivalScore } from '../src/sim/endings.js';
import { ROUTES, ROUTE_ORDER, ENDINGS, KIT_ITEM } from '../src/content/endings.js';
import { CLUES, LORE, ENVELOPE, EVENTS, QUESTS } from '../src/content/events.js';
import { SITES } from '../src/content/sites.js';
import { VETERAN } from '../src/content/people.js';
import { pickLang } from '../src/engine/i18n.js';
import { addItem, countIn, makeInstance } from '../src/sim/inventory.js';
import { createFurniture, removeFurniture, furnitureAt, homeFurniture, installFurniture, dismantle, doorAndWindows, effectiveMaxHp } from '../src/sim/home.js';
import { item, packageToFurniture } from '../src/data/db.js';
import { emit } from '../src/engine/bus.js';
import { saveGame, loadGame, _resetStorage, defaultHistory } from '../src/engine/save.js';
import { checkAchievement } from '../src/meta/achievements.js';
import { endlessStateOf, ENDLESS_STORY } from '../src/meta/endless.js';

const bp = (s) => s.inventories[s.player.backpack];
const giveKit = (s) => addItem(s, bp(s), KIT_ITEM);

function atDay(character, day, hour = 12, seed = 3) {
  const s = newGame({ seed, character });
  s.phase = 'post';
  s.clock.t = dayStartT(s.clock, day) + hour * 3600;
  s.run.day = day;
  return s;
}

// No sieges: these runs test the calendar and the wiring between systems, not the defense line.
function calm(s) {
  s.crises.disabled = true;
  return s;
}

function jumpTo(s, day, hour) {
  s.clock.t = dayStartT(s.clock, day) + hour * 3600;
}

function keepAlive(s) {
  Object.assign(s.player.stats, { sat: 90, sta: 95, mor: 90, life: 100 });
  s.player.effects = {};
}

function runHours(s, n, seen = [], pickFor = null) {
  for (let i = 0; i < n && s.phase === 'post'; i++) {
    keepAlive(s);
    tick(s, 3600);
    for (let a = activeEvent(s); a; a = presentNext(s)) {
      seen.push(`${dayNumber(s.clock)}:${a.id}`);
      resolveEvent(s, pickFor ? pickFor(a) : null);
    }
  }
  return seen;
}

function runUntil(s, day, hour = 0, seen = [], pickFor = null) {
  let guard = 0;
  while (s.phase === 'post' && guard++ < 24 * 120 && (dayNumber(s.clock) < day || (dayNumber(s.clock) === day && hourOfDay(s.clock) < hour))) runHours(s, 1, seen, pickFor);
  return seen;
}

function place(s, cfg, slot) {
  const old = furnitureAt(s, slot);
  if (old) removeFurniture(s, old.uid);
  return createFurniture(s, cfg, slot);
}

function fortressHome(s, powerHeld = true) {
  const door = place(s, 30002, '1F:door');
  door.reinforce = 300;
  const wins = ['1F:win1', '1F:win2', '1F:win3'].filter((id) => furnitureAt(s, id)).map((id) => place(s, 35002, id));
  wins[0].reinforce = 300;
  const defense = [36002, 36003, 36004];
  for (let i = 0; i < 12; i++) place(s, defense[i % 3], `1F:d${i + 1}`);
  if (powerHeld) for (let d = 60; d <= 69; d++) s.story.powerChecks[d] = 1;
}

function give(s, id, n = 1) {
  const picks = [];
  for (let i = 0; i < n; i++) picks.push({ inv: bp(s).id, uid: addItem(s, bp(s), id, { allowOverweight: true }).uid });
  return picks;
}

// ------------------------------------------------------------------------------------ P01 / P03
const OWN_BEATS = {
  wage: { w_rooftop: 3, w_payday: 9, w_network: 16 },
  student: { st_rooftop: 3, st_seedlings: 5, st_vase: 20, st_garden3: 45 },
  warehouse: { wm_coldRoom: 2, wm_driver: 12, wm_binder: 18, wm_winter: 28 },
};
const SPINE = { s_firstNight: 1, s_morning: 2, s_hospital: 14, s_blueprint: 30, s_halfway: 50, s_kitSafety: 69, s_reckoning: 70, s_route71: 71, s_lastCall: 74, s_windowClosed: 75, s_day100: 100 };
const RESPONSES = ['r_military', 'r_door', 'r_neighbor', 'r_network', 'r_recorder', 'r_garden', 'r_hub', 'r_choice'];
const RESPONSES_FOR = {
  wage: ['r_military', 'r_door', 'r_neighbor', 'r_network', 'r_recorder', 'r_choice'],
  student: ['r_military', 'r_door', 'r_neighbor', 'r_recorder', 'r_garden', 'r_choice'],
  warehouse: ['r_military', 'r_recorder', 'r_hub', 'r_choice'],
};

for (const character of Object.keys(OWN_BEATS)) {
  test(`P01/P03 ${character}: a storyline of its own from Day 1 to Day 101, with the Day 70 responses for this survivor`, () => {
    const s = calm(newGame({ seed: 5, character }));
    s.clock.t = s.clock.outbreakAt - 60;
    tick(s, 120);
    assert.equal(s.phase, 'post');
    runUntil(s, 102);
    assert.equal(s.run.ending, 'lastOne');
    assert.equal(s.run.endingDay, 101);
    const day = (id) => s.story.events[id]?.day;
    for (const [id, d] of Object.entries({ ...SPINE, ...OWN_BEATS[character] })) assert.equal(day(id), d, `${id} on Day ${d}`);
    for (const [other, beats] of Object.entries(OWN_BEATS)) {
      if (other !== character) for (const id of Object.keys(beats)) assert.equal(day(id), undefined, `no ${id} for the ${character}`);
    }
    for (const id of RESPONSES) assert.equal(day(id), RESPONSES_FOR[character].includes(id) ? 70 : undefined, `${id} on the Day of Reckoning`);
    assert.equal(s.story.tags.TAG_RECKONING, true);
    assert.equal(s.story.route, null, 'nothing is committed without a choice');
    assert.ok(s.story.quests.holdOut, 'after Day 74 the story asks to hold out until Day 101');
  });
}

// ------------------------------------------------------------------------------------ P02
test('P02 random events roll on more days from Day 10, and a cap increase is listed in the reward popup data', () => {
  const story = getSystems().find((x) => x.id === 'story');
  const rolled = { early: [0, 0], late: [0, 0] };
  for (let seed = 1; seed <= 30; seed++) {
    const s = atDay('wage', 2, 1, seed);
    for (let d = 2; d <= 40; d++) {
      story.onDay(s, d);
      const bucket = rolled[d < 10 ? 'early' : 'late'];
      bucket[0] += s.story.random ? 1 : 0;
      bucket[1] += 1;
    }
  }
  const early = rolled.early[0] / rolled.early[1];
  const late = rolled.late[0] / rolled.late[1];
  assert.ok(early < 0.5 && late > 0.55 && late > early + 0.1, `early ${early.toFixed(2)}, late ${late.toFixed(2)}`);

  const s = calm(atDay('wage', 12, 7));
  const max = s.player.max.sta;
  assert.ok(fireEvent(s, 'r_stretch'));
  const res = resolveEvent(s, null);
  assert.deepEqual(
    res.rewards.find((r) => r.kind === 'max'),
    { kind: 'max', key: 'sta', value: 1 }
  );
  assert.equal(s.player.max.sta, max + 1);
});

// ------------------------------------------------------------------------------------ P03
test('P03 the commitment survives a save and load: the next kit cannot buy a second route', () => {
  _resetStorage();
  const s = calm(atDay('wage', 72));
  fortressHome(s);
  giveKit(s);
  assert.equal(commitRoute(s, 'fortress'), true);
  assert.ok(saveGame('p03-route', s));
  const loaded = loadGame('p03-route').state;
  assert.equal(loaded.story.route, 'fortress');
  assert.equal(finalWaveDay(loaded), 85);
  loaded.home.unlocked['2F'] = true;
  place(loaded, 9296, '2F:s3');
  giveKit(loaded);
  assert.equal(routeStatus(loaded, 'evacuate').ok, true, 'the beacon path is open');
  assert.match(String(canCommit(loaded, 'evacuate')), /already/);
  assert.notEqual(commitRoute(loaded, 'evacuate'), true);
  assert.deepEqual(updateRouteAvailability(loaded), {});
  assert.equal(countIn(loaded, homeSources(loaded), KIT_ITEM), 1, 'the second kit is not spent');
});

// ------------------------------------------------------------------------------------ P04
const KEEP_PROMISE = {
  evacuate: (s) => {
    s.home.unlocked['2F'] = true;
    place(s, 9296, '2F:s3');
    s.story.tags.TAG_LINE_RESCUE_READY = true;
  },
  girl: (s) => (s.story.tags.TAG_NEIGHBOR_RESCUE3_COMPLETE = true),
  stranger: (s) => (s.story.tags.TAG_LINE_STRANGER_CAMP_DONE = true),
  fortress: (s) => (s.story.tags.TAG_LINE_SHELTER_HELD = true),
  truth: (s) => (s.story.tags.TAG_LINE_TRUTH_EXPLORED = true),
  greenhouse: (s) => (s.story.tags.TAG_LINE_GREENHOUSE_DONE = true),
  companion: (s) => (s.story.tags.TAG_COMPANION_RESCUE3_COMPLETE = true),
  supply: (s) => (s.story.tags.TAG_LINE_SUPPLY_HELD = true),
};

test('P04 every route ending waits for the final wave; without it only the Day 101 default is left', () => {
  assert.deepEqual(Object.keys(KEEP_PROMISE).sort(), [...ROUTE_ORDER].sort());
  for (const route of ROUTE_ORDER) {
    const r = ROUTES[route];
    const s = calm(atDay(r.characters?.[0] || 'wage', r.endingDay, 9));
    Object.assign(s.story, { route, committedDay: 72, finalWaveDay: r.finalWaveDay });
    KEEP_PROMISE[route](s);
    assert.equal(dueEnding(s), r.endingDay === 101 ? 'lastOne' : null, `${route}: promise kept, final wave not survived`);
    assert.equal(s.story.flags.routeFailed, undefined, `${route}: not failed either`);
    s.story.tags.TAG_FINAL_WAVE_SURVIVED = true;
    assert.equal(dueEnding(s), route);
  }
});

test('P04 the final horde is on the Day 87 calendar and moves to the night before a committed route’s ending day at the next midnight', () => {
  const cases = [
    ['fortress', 'wage', (s) => fortressHome(s), 85],
    [
      'truth',
      'student',
      (s) => {
        s.story.tags.TAG_LINE_TRUTH_EXPLORED = true;
        place(s, 9297, '1F:kt3');
      },
      83,
    ],
    [
      'evacuate',
      'wage',
      (s) => {
        s.home.unlocked['2F'] = true;
        place(s, 9296, '2F:s3');
      },
      87,
    ],
  ];
  for (const [route, character, setup, day] of cases) {
    const s = atDay(character, 72, 12);
    const fin = () => s.crises.schedule.find((e) => e.type === 'horde' && e.kind === 'story' && e.final);
    assert.equal(fin().day, 87);
    assert.equal(fin().at, dayStartT(s.clock, 87) + 22 * 3600);
    setup(s);
    giveKit(s);
    assert.equal(commitRoute(s, route), true, route);
    assert.equal(finalWaveDay(s), day);
    runHours(s, 13);
    assert.equal(fin().day, day, `${route}: the final horde comes on Day ${day}`);
    assert.equal(fin().at, dayStartT(s.clock, day) + 22 * 3600);
    assert.equal(fin().warnAt, fin().at - 3 * DAY, 'announced three days ahead');
    assert.equal(fin().status, 'pending');
    if (ROUTES[route].endingDay < 101) assert.equal(day + 1, ROUTES[route].endingDay, `${route}: its horde ends on the morning of the ending day`);
  }
});

// ------------------------------------------------------------------------------------ P05
test('P05 Evacuate: the committed beacon is inspected on three different days, then the Day 101 extraction comes', () => {
  const s = calm(atDay('wage', 72, 8));
  s.home.unlocked['2F'] = true;
  place(s, 9296, '2F:s3');
  giveKit(s);
  assert.equal(commitRoute(s, 'evacuate'), true);
  drainEvents(s);
  assert.ok(s.story.quests.promise_evacuate);
  for (let d = 0; d < 3; d++) {
    assert.ok(runQuestAction(s, 'promise_evacuate'), `inspection ${d + 1} queued`);
    runHours(s, 2);
    if (d === 0) {
      assert.ok(runQuestAction(s, 'promise_evacuate'));
      runHours(s, 2);
      assert.equal(s.story.flags.beaconChecks, 2);
      assert.equal(s.story.promise.inspections, 1, 'a second inspection on the same day does not count');
    }
    runUntil(s, 73 + d, 8);
  }
  assert.equal(s.story.promise.inspections, 3);
  assert.equal(s.story.quests.promise_evacuate.done, true);
  assert.equal(s.story.tags.TAG_LINE_RESCUE_READY, true);
  jumpTo(s, 88, 6);
  markFinalWaveSurvived(s, 10);
  jumpTo(s, 101, 6);
  runHours(s, 1);
  assert.equal(s.phase, 'post', 'the helicopters come in the morning');
  runHours(s, 2);
  assert.equal(s.run.ending, 'evacuate');
  assert.equal(s.run.endingDay, 101);
});

// ------------------------------------------------------------------------------------ P06 / P11
const REQUEST_ITEM = { fever: 2406, bandage: 2400, sweet: 2132, veg: 2504, protein: 2162, drink: 2130, book: 3001, hygiene: 11011, staple: 2102 };

function sendFood(s, id, n) {
  const inv = basketInventory(s);
  inv.items.length = 0;
  for (let i = 0; i < n; i++) assert.ok(addItem(s, inv, id), `item ${id} fits the basket`);
  return sendBasket(s);
}

for (const [route, character, line] of [
  ['girl', 'wage', 'NEIGHBOR'],
  ['companion', 'student', 'COMPANION'],
]) {
  test(`P06/P11 ${ENDINGS[route].title.en}: basket rescues and five hearts open it, the kit starts the winter rescue, the ending follows the final wave`, () => {
    const s = calm(atDay(character, 70, 8, 41));
    runHours(s, 1);
    const n = neighborState(s);
    assert.equal(n.id, character === 'wage' ? 'student' : 'wage');
    assert.ok(repairBasket(s));
    let guard = 0;
    while (!n.tasks.some((t) => t.id === 'rescue2' && t.done) && guard++ < 20) assert.ok(sendFood(s, 2107, 8).ok);
    assert.equal(s.story.tags[`TAG_${line}_RESCUE2_COMPLETE`], true);
    if (n.hearts < 5) assert.equal(routeStatus(s, route).ok, false, 'five hearts first');
    addNeighborAffinity(s, 600);
    assert.equal(n.hearts, 5);
    assert.equal(routeStatus(s, route).ok, true);
    giveKit(s);
    assert.equal(commitRoute(s, route), true);
    assert.equal(activeRescue(s), null, 'the winter rescue starts with the next day');
    runUntil(s, 71, 1);
    const r3 = activeRescue(s);
    assert.equal(r3?.id, 'rescue3');
    assert.ok(sendFood(s, 2161, 5).ok);
    for (guard = 0; guard < 12 && !s.story.tags[`TAG_${line}_RESCUE3_COMPLETE`]; guard++) {
      n.foodDays = 20;
      for (let h = 0; h < 30 && !activeRequest(s); h++) runHours(s, 1);
      const req = activeRequest(s);
      assert.ok(req, 'a text request across the roof');
      assert.ok(sendFood(s, REQUEST_ITEM[req.req], 1).ok);
    }
    assert.equal(r3.reqDone, 3);
    assert.equal(s.story.tags[`TAG_${line}_RESCUE3_COMPLETE`], true);
    runHours(s, 1);
    assert.equal(s.story.quests[`promise_${route}`].done, true);
    assert.equal(s.story.promise.rescue, 300);
    jumpTo(s, 85, 20);
    n.foodDays = 20;
    runHours(s, 6);
    assert.equal(s.phase, 'post', 'no ending before the final wave');
    markFinalWaveSurvived(s, 12);
    runHours(s, 1);
    assert.equal(s.run.ending, route);
  });
}

// ------------------------------------------------------------------------------------ P07
function installDrone(s, slot = '1F:lt1') {
  const old = furnitureAt(s, slot);
  if (old) dismantle(s, old.uid);
  const r = installFurniture(s, packageToFurniture[14023], slot);
  assert.ok(r.ok, `drone installs into ${slot}`);
  return listDrones(s).find((d) => d.uid === r.f.uid);
}

function flyBack(s, d) {
  for (let h = 0; h < 6 && droneBusy(s, d); h++) runHours(s, 1);
  s.inventories[d.cargo].items.length = 0;
}

test('P07 Net: six survivors fed by drone and alive at the Day 71 check open it; drone drops and a camp run keep the promise', () => {
  const s = calm(atDay('wage', 20, 9, 47));
  const d = installDrone(s);
  runHours(s, 1);
  const people = social(s).survivors.filter((x) => !x.unknown).slice(0, 6);
  assert.equal(people.length, 6);
  for (const sv of people) {
    assert.ok(requestHelp(s, sv.id));
    const r = respondHelp(s, { drone: d.uid, survivor: sv.id, give: give(s, 2161) });
    assert.ok(r.ok, r.reason);
    sv.food = 30;
    flyBack(s, d);
  }
  assert.equal(aliveNetworkSurvivors(s), 6);
  assert.equal(routeStatus(s, 'stranger').ok, false, 'checked from Day 71');
  jumpTo(s, 70, 22);
  runHours(s, 4);
  assert.equal(s.story.tags.TAG_STRANGER_NETWORK_OK, true, 'six alive at the Day 71 check');
  assert.equal(updateRouteAvailability(s).stranger, true);
  people[0].alive = false;
  assert.equal(routeStatus(s, 'stranger').ok, true, 'the Day 71 result holds');
  giveKit(s);
  assert.equal(commitRoute(s, 'stranger'), true);
  drainEvents(s);
  for (const sv of people.slice(1, 4)) {
    const drop = deliverSupplies(s, { drone: d.uid, survivor: sv.id, give: give(s, 2161, 2) });
    assert.ok(drop.ok, drop.reason);
    flyBack(s, d);
  }
  assert.equal(s.progress.counters['camp.prep.supply'], 3);
  assert.notEqual(s.story.tags.TAG_LINE_STRANGER_CAMP_DONE, true);
  give(s, 2161, 2);
  drainEvents(s);
  assert.ok(fireEvent(s, 'p_campRun'));
  resolveEvent(s, 0);
  assert.equal(s.progress.counters['camp.prep.supply'], 4);
  runHours(s, 1);
  assert.equal(s.story.quests.promise_stranger.done, true);
  assert.equal(s.story.tags.TAG_LINE_STRANGER_CAMP_DONE, true);
  jumpTo(s, 87, 10);
  markFinalWaveSurvived(s, 6);
  runHours(s, 1);
  assert.equal(s.run.ending, 'stranger');
});

// ------------------------------------------------------------------------------------ P08
test('P08 Fortress: the Days 60–69 power check samples the battery reserve at noon and 23:00', () => {
  for (const dip of [null, 65]) {
    const s = calm(atDay('wage', 59, 20));
    fortressHome(s, false);
    Object.assign(s.power, { capacity: 1000, stored: 900 });
    while (dayNumber(s.clock) < 70) {
      const d = dayNumber(s.clock);
      const h = Math.floor(hourOfDay(s.clock));
      s.power.stored = d === dip && h === 22 ? 700 : 900;
      runHours(s, 1);
      for (const f of doorAndWindows(s)) f.hp = effectiveMaxHp(f);
      if (d === 66 && h === 10) {
        s.power.stored = 500;
        assert.equal(routeStatus(s, 'fortress').ok, false, 'a low battery inside the window shows at once');
      }
    }
    assert.deepEqual(Object.keys(s.story.powerChecks).map(Number), [60, 61, 62, 63, 64, 65, 66, 67, 68, 69]);
    assert.equal(s.story.powerChecks[65], dip ? 0.7 : 0.9);
    assert.equal(routeStatus(s, 'fortress').ok, !dip, dip ? 'one weak evening fails the check' : 'the reserve held');
  }
});

// ------------------------------------------------------------------------------------ P10
test('P10 Greenhouse: after the commitment it takes 24 flowers, 36 produce and real heat on every open floor', () => {
  const s = calm(atDay('student', 71, 9));
  s.progress.counters.PlantPotCount = 24;
  s.progress.counters['plant.harvest.flower'] = 30;
  s.progress.counters['plant.harvest.produce'] = 50;
  assert.equal(updateRouteAvailability(s).greenhouse, true);
  giveKit(s);
  assert.equal(commitRoute(s, 'greenhouse'), true);
  s.home.unlocked['2F'] = true;
  s.home.unlocked.B1 = true;
  runHours(s, 1);
  const quest = () => s.story.quests.promise_greenhouse;
  const prog = () => pickLang(QUESTS.promise_greenhouse.prog(s, query(s)));
  assert.equal(quest().progress, 0, 'harvests before the commitment do not count');
  assert.deepEqual(warmth(s), { floors: 3, warm: 0, cold: ['1F', '2F', 'B1'] }, 'a Day 71 house without heating is cold');
  s.progress.counters['plant.harvest.flower'] += 24;
  emit('harvested', { furn: 0, items: Array.from({ length: 36 }, () => 2125) });
  runHours(s, 1);
  assert.equal(quest().progress, 2);
  assert.ok(installFurniture(s, 65000, '1F:l2').ok, 'electric heater downstairs');
  const fire = installFurniture(s, 65001, '2F:b5').f;
  const ac = installFurniture(s, 21007, 'B1:s5').f;
  ac.powered = false;
  runHours(s, 1);
  assert.equal(heaterCount(s), 3, 'a heater stands on every floor');
  assert.deepEqual(warmth(s).cold, ['2F', 'B1'], 'an unlit fire and an unpowered AC give no heat');
  assert.notEqual(quest().done, true);
  assert.match(prog(), /Warm floors 1\/3 \(cold: Loft, Storage Level\)/);
  fire.data.lit = true;
  runHours(s, 1);
  assert.deepEqual(warmth(s).cold, ['B1']);
  assert.notEqual(quest().done, true, 'the basement is still cold');
  ac.powered = true;
  runHours(s, 1);
  assert.equal(quest().done, true);
  assert.equal(s.story.tags.TAG_LINE_GREENHOUSE_DONE, true);
  jumpTo(s, 86, 6);
  markFinalWaveSurvived(s, 3);
  runHours(s, 1);
  assert.equal(s.run.ending, 'greenhouse');
});

// ------------------------------------------------------------------------------------ P12
test('P12 Supply Station: the special trading point, three delivery slips and 40 kills in the final wave', () => {
  const s = calm(atDay('warehouse', 71, 8));
  const shelf = homeFurniture(s).find((f) => f.inv && !s.inventories[f.inv].cold);
  const put = (id, qty) => {
    const it = makeInstance(s, id);
    it.qty = qty;
    s.inventories[shelf.inv].items.push(it);
  };
  put(2107, 32);
  put(20001, 151);
  assert.equal(updateRouteAvailability(s).supply, true);
  giveKit(s);
  assert.equal(commitRoute(s, 'supply'), true);
  const seen = runUntil(s, 77, 0, [], (a) => (a.id === 'p_supplyPoint' ? 0 : null));
  assert.ok(seen.includes('72:p_supplyPoint'), 'the courier signals the day after the commitment');
  assert.equal(s.story.tags.TAG_SUPPLY_SPECIAL_TRADE, true);
  assert.equal(s.progress.taboo.trade, true, 'the special trade breaks Going Solo');
  assert.ok(seen.includes('74:p_supplyStub2') && seen.includes('76:p_supplyStub3'));
  for (const id of [9065, 9066, 9067]) assert.ok(s.story.clues.includes(id), `slip ${id}`);
  assert.equal(s.progress.counters['clue.slip'], 3);
  assert.equal(checkAchievement(1223, s, defaultHistory()), true, 'Name on the Delivery Slip');
  assert.equal(s.story.quests.promise_supply.progress, 2);
  runUntil(s, 79, 0, seen);
  assert.ok(seen.includes('78:p_supplyStub4'), 'the fourth stub follows the third');
  assert.ok(s.story.clues.includes(9068));
  assert.equal(s.progress.counters['clue.slip'], 4);
  assert.equal(s.story.quests.promise_supply.progress, 2, 'still three steps: the trade, the slips, the final wave');
  markFinalWaveSurvived(s, 44);
  assert.equal(s.story.tags.TAG_LINE_SUPPLY_HELD, true);
  jumpTo(s, 86, 6);
  runHours(s, 1);
  assert.equal(s.run.ending, 'supply');
});

// ------------------------------------------------------------------------------------ P14 / P15
test('P14/P15 the ending keeps its record; Refusing to Take a Bow turns the run into Story Endless with endless hordes', () => {
  const s = atDay('wage', 101, 7);
  runHours(s, 2);
  assert.equal(s.run.ending, 'lastOne');
  assert.deepEqual(s.run.record, { tally: safehouseTally(s), score: survivalScore(s).total });
  assert.equal(continueAfterEnding(s), true);
  assert.equal(endlessStateOf(s), ENDLESS_STORY);
  assert.equal(s.meta.endlessStartDay, 101);
  assert.equal(s.story.tags.TAG_REFUSE_CURTAIN, true);
  assert.equal(checkAchievement(2402, s, defaultHistory()), true, 'Refusing to Take a Bow');
  runHours(s, 30);
  assert.equal(s.phase, 'post');
  assert.equal(s.run.ending, 'lastOne', 'no second ending');
  const next = s.crises.schedule.find((e) => e.type === 'horde' && e.kind === 'endless');
  assert.ok(next && next.day > 101, 'an endless horde is on the calendar');
});

// ------------------------------------------------------------------------------------ P16
test('P16 story documents: every clue is a titled document; the veteran’s letter and the records room count as truth clues', () => {
  for (const [id, c] of Object.entries(CLUES)) {
    assert.equal(eventDef(`clue_${id}`)?.itemTitle, Number(id), `clue_${id} is titled with the document`);
    assert.ok(c.text.en && c.text.zh, `${id} has bilingual text`);
    assert.equal(item(Number(id)).cat, 3, `${id} is a document`);
  }

  const w = calm(atDay('warehouse', 5, 22));
  runHours(w, 3);
  assert.ok(veteranState(w), 'the veteran turns up on Day 6');
  const crate = makeInstance(w, 2107);
  crate.qty = 30;
  bp(w).items.push(crate);
  const fed = giveVeteran(w, [{ inv: bp(w).id, uid: crate.uid }]);
  assert.ok(fed.ok);
  assert.ok(fed.rewards.some(([id]) => id === 9047), 'he leaves his letter');
  const seen = runHours(w, 1);
  assert.ok(w.story.clues.includes(9047));
  assert.ok(seen.some((x) => x.endsWith(':clue_9047')), 'shown as a clue document');
  assert.equal(w.progress.counters['clue.truth'], 1);

  const s = calm(atDay('wage', 72, 8));
  for (const id of [9041, 9042, 9043, 9049]) addItem(s, bp(s), id);
  runHours(s, 1);
  assert.equal(s.story.tags.TAG_LINE_TRUTH_EXPLORED, true);
  place(s, 9297, '1F:kt3');
  giveKit(s);
  assert.equal(commitRoute(s, 'truth'), true);
  runUntil(s, 75, 12, [], (a) => (a.id === 'p_truthFinal' ? 0 : null));
  assert.equal(s.story.tags.TAG_LINE_TRUTH_FINAL, true);
  assert.equal(countIn(s, homeSources(s), 9047), 1, "the soldier's letter from the records room");
  assert.equal(s.progress.counters['clue.truth'], 4, 'Puzzle: three hospital records and the letter');
  assert.equal(checkAchievement(1203, s, defaultHistory()), true);
  assert.equal(s.story.quests.promise_truth.done, true);
});

function effectItems(eff, out) {
  if (!eff) return;
  for (const [id] of eff.items || []) out.add(id);
  effectItems(eff.chance?.effects, out);
  effectItems(eff.chance?.else, out);
}

test('P16 every written document has bilingual text and a way into the backpack: sites, events, the veteran, the prologue envelope', () => {
  const sources = new Set([ENVELOPE.item, ...ENVELOPE.notes]);
  for (const site of SITES) {
    for (const id of site.lore || []) sources.add(id);
    for (const fx of Object.values(site.legend)) for (const find of fx.story || []) sources.add(find.item);
  }
  for (const e of EVENTS) for (const c of e.choices || []) effectItems(c.effects, sources);
  for (const q of Object.values(QUESTS)) effectItems(q.reward, sources);
  for (const stage of VETERAN.stages) for (const [id] of stage.give) sources.add(id);
  for (const id of [...Object.keys(CLUES), ...Object.keys(LORE)].map(Number)) {
    assert.ok(sources.has(id), `${id} (${item(id).zh}) can be obtained`);
    assert.equal(item(id).cat, 3, `${id} is a document`);
  }
  for (const [id, d] of Object.entries(LORE)) assert.ok(d.text.en && d.text.zh, `${id} has bilingual text`);
  for (const site of SITES) for (const id of site.lore || []) assert.ok(LORE[id], `${site.id} lore ${id} has text`);
  for (const id of [9010, 9011, 9012, 9013, 9063, 9064, 9068]) assert.ok(LORE[id] || CLUES[id], `${id} is written`);
});

test('P16 the prologue envelope waits in the backpack; opening it gives three sticky notes, and read documents stay in the Documents list', () => {
  const s = newGame({ seed: 8, character: 'student' });
  assert.equal(s.phase, 'pre');
  const inBackpack = (id) => countIn(s, [s.player.backpack], id);
  const read = (id) => readBook(s, bp(s), bp(s).items.find((it) => it.id === id));
  assert.equal(inBackpack(ENVELOPE.item), 1, 'on the morning of the loop');
  read(ENVELOPE.item);
  assert.equal(inBackpack(ENVELOPE.item), 0, 'opened');
  for (const id of ENVELOPE.notes) assert.equal(inBackpack(id), 1, `sticky note ${id}`);
  read(9012);
  assert.equal(inBackpack(9012), 1, 'a note is kept after reading');
  read(ENVELOPE.notes[0]);
  assert.deepEqual(documentList(s), [ENVELOPE.item, 9012, 9011], 'in reading order, once each');

  s.phase = 'post';
  s.clock.t = dayStartT(s.clock, 30) + 9 * 3600;
  addItem(s, bp(s), 9041);
  addItem(s, bp(s), 9055);
  runHours(s, 1);
  assert.ok(documentList(s).includes(9041), 'a clue joins the list with its popup');
  assert.ok(!documentList(s).includes(9055), 'lore joins once it is read');
  read(9055);
  assert.equal(documentList(s).at(-1), 9055);
  read(ENVELOPE.notes[0]);
  assert.equal(documentList(s).filter((id) => id === 9011).length, 1);

  const pure = newGame({ seed: 8, mode: 'pureEndless' });
  assert.equal(countIn(pure, [pure.player.backpack], ENVELOPE.item), 0, 'no prologue in Pure Endless');
});
