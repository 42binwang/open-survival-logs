import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { tick } from '../src/sim/tick.js';
import { dayNumber, hourOfDay, dayStartT } from '../src/sim/time.js';
import '../src/sim/furnActions.js';
import { furnitureFunctions } from '../src/sim/furnActions.js';
import '../src/sim/planning.js';
import {
  updateRouteAvailability,
  routeStatus,
  canCommit,
  commitRoute,
  startCommit,
  finalWaveDay,
  activeEvent,
  resolveEvent,
  presentNext,
  storageFurnitureCount,
} from '../src/sim/story.js';
import { markFinalWaveSurvived, challengeResults, continueAfterEnding, safehouseTally, survivalScore, dueEnding } from '../src/sim/endings.js';
import { ENDINGS, ROUTES, CHALLENGES, LAST_DAY, DEFAULT_FINAL_WAVE_DAY } from '../src/content/endings.js';
import { addItem, makeInstance, count } from '../src/sim/inventory.js';
import { createFurniture, removeFurniture, furnitureAt, homeFurniture } from '../src/sim/home.js';
import { emit, on } from '../src/engine/bus.js';

const bp = (s) => s.inventories[s.player.backpack];

// A post-disaster state at a given day/hour (no outbreak replay needed for route rules).
function atDay(character, day, hour = 12, seed = 3) {
  const s = newGame({ seed, character });
  s.phase = 'post';
  s.clock.t = dayStartT(s.clock, day) + hour * 3600;
  s.run.day = day;
  return s;
}

function place(s, cfg, slot) {
  const old = furnitureAt(s, slot);
  if (old) removeFurniture(s, old.uid);
  return createFurniture(s, cfg, slot);
}

function keepAlive(s) {
  Object.assign(s.player.stats, { sat: 90, sta: 95, mor: 90, life: 100 });
  s.player.effects = {};
}

function runHours(s, n, seen = [], pickFor = null) {
  for (let i = 0; i < n && s.phase === 'post'; i++) {
    keepAlive(s);
    tick(s, 3600);
    let a = activeEvent(s);
    while (a) {
      seen.push(`${dayNumber(s.clock)}:${a.id}`);
      resolveEvent(s, pickFor ? pickFor(a) : null);
      a = presentNext(s);
    }
  }
  return seen;
}

function runUntil(s, day, hour = 0, seen = [], pickFor = null) {
  let guard = 0;
  while (s.phase === 'post' && guard++ < 24 * 120 && (dayNumber(s.clock) < day || (dayNumber(s.clock) === day && hourOfDay(s.clock) < hour))) runHours(s, 1, seen, pickFor);
  return seen;
}

const giveKit = (s) => addItem(s, bp(s), 9048);

function fortressHome(s) {
  const door = place(s, 30002, '1F:door');
  door.reinforce = 300;
  const wins = ['1F:win1', '1F:win2', '1F:win3'].filter((id) => furnitureAt(s, id)).map((id) => place(s, 35002, id));
  wins[0].reinforce = 300;
  const defense = [36002, 36003, 36004];
  for (let i = 0; i < 12; i++) place(s, defense[i % 3], `1F:d${i + 1}`);
  for (let d = 60; d <= 69; d++) s.story.powerChecks[d] = 1;
  return { door, wins };
}

test('Evacuate opens once a distress beacon stands on the second floor', () => {
  const s = atDay('wage', 70);
  assert.equal(updateRouteAvailability(s).evacuate, undefined);
  s.home.unlocked['2F'] = true;
  place(s, 9296, '1F:l6');
  assert.equal(routeStatus(s, 'evacuate').ok, false, 'a beacon downstairs is not seen');
  place(s, 9296, '2F:s3');
  assert.equal(updateRouteAvailability(s).evacuate, true);
  const beacon = homeFurniture(s).find((f) => f.cfg === 9296 && f.floor === '2F');
  assert.ok(furnitureFunctions(s, beacon).some((f) => f.spec.kind === 'commit'), 'Retrofit Beacon is offered');
});

test('Fortress needs reinforced openings, a 2000 door, 1500 windows, 4 of each defense and power on Days 60–69', () => {
  const s = atDay('wage', 70);
  assert.equal(routeStatus(s, 'fortress').ok, false);
  fortressHome(s);
  assert.equal(routeStatus(s, 'fortress').ok, true);
  assert.equal(updateRouteAvailability(s).fortress, true);
  s.story.powerChecks[65] = 0.5;
  assert.equal(routeStatus(s, 'fortress').ok, false, 'a weak power reserve on Day 65 fails the check');
  s.story.powerChecks[65] = 0.9;
  removeFurniture(s, furnitureAt(s, '1F:d12').uid);
  assert.equal(routeStatus(s, 'fortress').ok, false, 'only three chainsaws');
  place(s, 36004, '1F:d12');
  furnitureAt(s, '1F:win2').hp = 1200;
  assert.equal(routeStatus(s, 'fortress').ok, false, 'every window needs 1500');

  const student = atDay('student', 70);
  fortressHome(student);
  assert.equal(routeStatus(student, 'fortress').ok, true, 'the College Student can take it too');
  assert.equal(routeStatus(atDay('warehouse', 70), 'fortress').locked, true, 'not for the Warehouse Manager');
});

test('Net needs 6 supported survivors alive at the Day 71 check (Wage Slave only)', () => {
  const survivors = (n) => Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, alive: i < n, inNetwork: true }));
  const s = atDay('wage', 70);
  s.social = { survivors: survivors(6) };
  assert.equal(routeStatus(s, 'stranger').ok, false, 'not checked before Day 71');
  s.clock.t = dayStartT(s.clock, 71) + 9 * 3600;
  assert.equal(updateRouteAvailability(s).stranger, true);
  s.social.survivors[0].alive = false;
  s.clock.t += 24 * 3600;
  assert.equal(updateRouteAvailability(s).stranger, true, 'the Day 71 check latches');
  const few = atDay('wage', 71);
  few.social = { survivors: survivors(5) };
  assert.equal(updateRouteAvailability(few).stranger, undefined);
  const outside = atDay('wage', 71);
  outside.social = { survivors: survivors(8).map((x) => ({ ...x, inNetwork: false })) };
  assert.equal(routeStatus(outside, 'stranger').ok, false, 'only survivors in your network count');
  assert.equal(routeStatus(atDay('student', 71), 'stranger').locked, true);
});

test('Greenhouse needs 24 planters at the Day 71 check (College Student only)', () => {
  const s = atDay('student', 71);
  s.progress.counters.PlantPotCount = 23;
  assert.equal(updateRouteAvailability(s).greenhouse, undefined);
  s.progress.counters.PlantPotCount = 24;
  assert.equal(updateRouteAvailability(s).greenhouse, true);
  const early = atDay('student', 69);
  early.progress.counters.PlantPotCount = 30;
  assert.equal(routeStatus(early, 'greenhouse').ok, false);
  assert.equal(routeStatus(atDay('wage', 71), 'greenhouse').locked, true);
});

test('Supply Station needs 1200 satiety, 180 items and 8 storage at the same check (Warehouse Manager only)', () => {
  const s = atDay('warehouse', 71);
  assert.ok(storageFurnitureCount(s) >= 8, 'the warehouse starts with plenty of shelving');
  const shelf = homeFurniture(s).find((f) => f.inv && !s.inventories[f.inv].cold);
  const inv = s.inventories[shelf.inv];
  const put = (id, qty) => {
    const it = makeInstance(s, id);
    it.qty = qty;
    inv.items.push(it);
  };
  put(2107, 29); // 29 × 40 satiety
  put(20001, 151);
  assert.equal(routeStatus(s, 'supply').ok, false, '1160 satiety is not enough');
  put(2107, 1);
  assert.equal(updateRouteAvailability(s).supply, true);
  assert.equal(routeStatus(atDay('wage', 71), 'supply').locked, true);
});

test('Side By Side and Companionship need 5 hearts, two rescues and a living neighbor', () => {
  const s = atDay('wage', 72);
  s.social = { neighbor: { hearts: 5 } };
  assert.equal(routeStatus(s, 'girl').ok, false, 'two rescues first');
  s.story.tags.TAG_NEIGHBOR_RESCUE2_COMPLETE = true;
  assert.equal(updateRouteAvailability(s).girl, true);
  s.social.neighbor.dead = true;
  assert.equal(routeStatus(s, 'girl').ok, false);
  assert.equal(routeStatus(s, 'companion').locked, true);

  const st = atDay('student', 72);
  st.social = { neighbor: { hearts: 5, rescueStage: 2 } };
  assert.equal(routeStatus(st, 'companion').ok, true);
  st.story.tags.TAG_COMPANION_MAN_DEAD = true;
  assert.equal(routeStatus(st, 'companion').ok, false);
});

test('The Truth needs the hospital clues and the recorder set up at home', () => {
  const s = atDay('warehouse', 70);
  s.story.tags.TAG_LINE_TRUTH_EXPLORED = true;
  assert.equal(routeStatus(s, 'truth').ok, false, 'the recorder must be installed');
  place(s, 9297, '1F:ot2');
  assert.equal(updateRouteAvailability(s).truth, true);
});

test('committing consumes the kit, sets the route and final wave day, and allows only one path', () => {
  const s = atDay('wage', 71);
  s.home.unlocked['2F'] = true;
  place(s, 9296, '2F:s3');
  fortressHome(s);
  assert.equal(finalWaveDay(s), 87);
  assert.match(String(canCommit(s, 'evacuate')), /Repair Kit/);
  giveKit(s);
  assert.equal(canCommit(s, 'fortress'), true);
  assert.equal(commitRoute(s, 'fortress'), true);
  assert.equal(s.story.route, 'fortress');
  assert.equal(count(bp(s), 9048), 0, 'kit consumed');
  assert.equal(s.story.tags.TAG_LINE_FORTRESS_CHOSEN, true);
  assert.equal(s.story.tags.TAG_LINE_SHELTER_CHOSEN, true, 'config tag name');
  assert.equal(s.progress.counters['route.committed'], 1);
  assert.equal(finalWaveDay(s), 85, 'the final wave comes the night before the Day 86 ending');
  assert.equal(s.story.finalWaveDay, 85);
  assert.ok(s.story.quests.promise_fortress, 'promise task');
  giveKit(s);
  assert.notEqual(commitRoute(s, 'evacuate'), true, 'one path per save');
  assert.deepEqual(updateRouteAvailability(s), {});
});

test('the commitment closes after Day 74', () => {
  const s = atDay('wage', 75);
  s.home.unlocked['2F'] = true;
  place(s, 9296, '2F:s3');
  giveKit(s);
  assert.match(String(canCommit(s, 'evacuate')), /Day 74/);
  assert.deepEqual(updateRouteAvailability(s), {});
  const ok = atDay('wage', 74, 23);
  ok.home.unlocked['2F'] = true;
  place(ok, 9296, '2F:s3');
  giveKit(ok);
  assert.equal(canCommit(ok, 'evacuate'), true, 'still open late on Day 74');
});

test('the commit action walks to the device and consumes the kit on completion', () => {
  const s = atDay('student', 72, 10);
  s.story.tags.TAG_LINE_TRUTH_EXPLORED = true;
  place(s, 9297, '1F:kt3');
  giveKit(s);
  const a = startCommit(s, 'truth');
  assert.equal(a.kind, 'commit');
  assert.equal(count(bp(s), 9048), 1, 'nothing spent before the work is done');
  runHours(s, 2);
  assert.equal(s.story.route, 'truth');
  assert.equal(count(bp(s), 9048), 0);
  assert.equal(finalWaveDay(s), 83);
});

test('every route that ends before Day 101 fights its final wave the night before its ending day', () => {
  for (const r of Object.values(ROUTES)) {
    assert.equal(ENDINGS[r.id].day, r.endingDay, `${r.id}: the ending screen shows the route's day`);
    assert.equal(r.finalWaveDay, r.endingDay === LAST_DAY ? DEFAULT_FINAL_WAVE_DAY : r.endingDay - 1, r.id);
  }
  assert.deepEqual(
    Object.fromEntries(Object.values(ROUTES).map((r) => [r.id, r.endingDay])),
    { evacuate: 101, girl: 86, stranger: 87, fortress: 86, truth: 84, greenhouse: 86, companion: 86, supply: 86 },
    'guide G2: Truth 84, Net 87, Evacuate 101, the other route endings 86'
  );
});

// route -> [character, setup(state), ending day, ending hour]
const ROUTE_CASES = {
  truth: ['warehouse', (s) => (s.story.tags.TAG_LINE_TRUTH_EXPLORED = true), 84, 0],
  fortress: ['student', (s) => markFinalWaveSurvived(s, 45), 86, 0],
  girl: ['wage', (s) => (s.story.tags.TAG_NEIGHBOR_RESCUE3_COMPLETE = true), 86, 0],
  greenhouse: ['student', (s) => (s.story.tags.TAG_LINE_GREENHOUSE_DONE = true), 86, 0],
  companion: ['student', (s) => (s.story.tags.TAG_COMPANION_RESCUE3_COMPLETE = true), 86, 0],
  supply: [
    'warehouse',
    (s) => {
      s.story.tags.TAG_SUPPLY_SPECIAL_TRADE = true;
      markFinalWaveSurvived(s, 40);
    },
    86,
    0,
  ],
  stranger: ['wage', (s) => (s.story.tags.TAG_LINE_STRANGER_CAMP_DONE = true), 87, 0],
  evacuate: [
    'wage',
    (s) => {
      s.home.unlocked['2F'] = true;
      place(s, 9296, '2F:s3');
      s.story.tags.TAG_LINE_RESCUE_READY = true;
    },
    101,
    8,
  ],
};

for (const [route, [character, setup, endDay, endHour]] of Object.entries(ROUTE_CASES)) {
  test(`${ENDINGS[route].title.en} resolves on Day ${endDay} after the final wave (${character})`, () => {
    const events = [];
    const offs = ['ending', 'endingReached', 'unlockCharacter'].map((type) => on(type, (p) => events.push([type, p])));
    try {
      const s = atDay(character, endDay - 1, 22);
      s.story.route = route;
      s.story.committedDay = 72;
      s.story.finalWaveDay = ROUTES[route].finalWaveDay;
      s.story.tags.TAG_FINAL_WAVE_SURVIVED = true;
      setup(s);
      assert.equal(dueEnding(s), null, 'not before its day');
      runUntil(s, endDay, Math.max(0, endHour - 1));
      if (endHour) assert.equal(s.phase, 'post', 'waits for the morning');
      runHours(s, 2);
      assert.equal(s.phase, 'ending');
      assert.equal(s.run.ending, route);
      assert.equal(s.run.endingDay, endDay);
      assert.equal(s.story.tags[`TAG_ENDING_${route.toUpperCase()}`], true);
      const reached = events.find(([t]) => t === 'endingReached')?.[1];
      assert.deepEqual([reached.id, reached.character, reached.achievement], [route, character, ENDINGS[route].achievement]);
      const unlock = events.find(([t]) => t === 'unlockCharacter')?.[1];
      assert.equal(unlock?.id, { wage: 'student', student: 'warehouse' }[character]);
      tick(s, 3600);
      assert.equal(s.run.ending, route, 'nothing runs after the ending');
    } finally {
      offs.forEach((off) => off());
    }
  });
}

test('route endings need the final wave: without it the story waits', () => {
  const s = atDay('student', 86, 1);
  s.story.route = 'greenhouse';
  s.story.tags.TAG_LINE_GREENHOUSE_DONE = true;
  runHours(s, 4);
  assert.equal(s.phase, 'post');
  markFinalWaveSurvived(s, 10);
  runHours(s, 1);
  assert.equal(s.run.ending, 'greenhouse');
});

test('a broken promise falls back to Survival: Last One Standing on Day 101', () => {
  const s = atDay('wage', 85, 23);
  s.story.route = 'fortress';
  s.story.finalWaveDay = 86;
  s.story.flags.killsAtFinalWave = 100;
  s.progress.kills = 112;
  markFinalWaveSurvived(s);
  assert.equal(s.story.finalWaveKills, 12);
  assert.equal(s.story.tags.TAG_LINE_SHELTER_HELD, undefined, 'fewer than 40 kills');
  const seen = runHours(s, 3);
  assert.equal(s.phase, 'post');
  assert.ok(s.story.flags.routeFailed);
  assert.ok(seen.some((x) => x.endsWith('s_promiseBroken')));
  s.clock.t = dayStartT(s.clock, 101) + 6 * 3600;
  runHours(s, 3);
  assert.equal(s.run.ending, 'lastOne');
});

test('Survival: Last One Standing is the default ending on the morning of Day 101', () => {
  const s = atDay('wage', 100, 21);
  runUntil(s, 101, 7);
  assert.equal(s.phase, 'post', 'still night');
  runHours(s, 2);
  assert.equal(s.run.ending, 'lastOne');
  assert.equal(s.run.endingDay, 101);
  assert.equal(s.story.tags.TAG_ENDING_LASTONE, true);
  assert.deepEqual(ENDINGS.lastOne.name, ENDINGS.lastOne.title, 'labelled for the rebirth memories');
});

test('the final wave is marked from the horde system’s hordeEnded event', () => {
  const s = atDay('wage', 87, 10);
  s.story.flags.killsAtFinalWave = 5;
  s.progress.kills = 5;
  tick(s, 60);
  emit('hordeEnded', { final: false, killed: 99 });
  assert.equal(s.story.tags.TAG_FINAL_WAVE_SURVIVED, undefined, 'ordinary hordes do not count');
  s.progress.kills = 47;
  emit('hordeEnded', { final: true });
  assert.equal(s.story.tags.TAG_FINAL_WAVE_SURVIVED, true);
  assert.equal(s.story.finalWaveKills, 42, 'kills counted from the snapshot');

  const f = atDay('student', 86, 20);
  f.story.route = 'fortress';
  tick(f, 60);
  emit('hordeEnded', { final: true, killed: 41 });
  assert.equal(f.story.finalWaveKills, 41, 'the horde payload’s kill count wins');
  assert.equal(f.story.tags.TAG_LINE_SHELTER_HELD, true);
});

test('the challenge endings section lists which taboos held this run', () => {
  const s = atDay('wage', 101, 9);
  s.progress.taboo.meat = true;
  s.progress.taboo.trade = true;
  const res = challengeResults(s);
  assert.equal(res.length, CHALLENGES.length);
  const held = (id) => res.find((c) => c.id === id).held;
  assert.equal(held('vegetarian'), false);
  assert.equal(held('goingSolo'), false);
  assert.equal(held('justOnce'), true);
  assert.equal(held('neverFallen'), true);
  s.story.tags.TAG_SHIELD_OF_THE_STREET = true;
  assert.ok(challengeResults(s).some((c) => c.id === 'shieldOfStreet' && c.held));
  runHours(s, 1);
  assert.equal(s.run.ending, 'lastOne');
  assert.ok(s.run.challenges.includes('shieldOfStreet'));
  assert.ok(!s.run.challenges.includes('vegetarian'));
});

test('the Safehouse Snapshot tally and survival record score', () => {
  const s = atDay('wage', 90);
  const base = safehouseTally(s);
  assert.equal(base.satiety, 0);
  for (let i = 0; i < 5; i++) addItem(s, bp(s), 2107);
  place(s, 36004, '1F:d1');
  const t = safehouseTally(s);
  assert.equal(t.satiety, 200);
  assert.equal(t.people, Math.floor(200 / 42));
  assert.equal(t.defenses, 1);
  assert.equal(t.strength, t.openingHp + t.defenseHp);
  assert.ok(t.zombies > 0 && ['small', 'medium', 'large', 'massive'].includes(t.tier));
  const score = survivalScore(s);
  assert.equal(score.rows.length, 7);
  assert.equal(score.total, score.rows.reduce((a, r) => a + r.points, 0));
  assert.ok(score.rows.find((r) => r.key === 'days').value === 90);
});

test('Refusing to Take a Bow continues in Story Endless without another ending', () => {
  const s = atDay('student', 101, 7);
  const seen = [];
  const off = on('storyEndless', (p) => seen.push(p));
  try {
    runHours(s, 2);
    assert.equal(s.run.ending, 'lastOne');
    assert.equal(continueAfterEnding(s), true);
    assert.equal(s.phase, 'post');
    assert.equal(s.meta.mode, 'endless');
    assert.equal(seen[0]?.ending, 'lastOne');
    runHours(s, 48);
    assert.equal(s.phase, 'post', 'the story does not end twice');
    assert.equal(s.run.ending, 'lastOne');
  } finally {
    off();
  }
});

test('promise task: answering her three requests completes the third rescue and the Girl ending', () => {
  const s = atDay('wage', 72, 8);
  s.social = { neighbor: { hearts: 5, rescueStage: 2 } };
  giveKit(s);
  assert.equal(commitRoute(s, 'girl'), true);
  for (const id of [2107, 2107, 2406, 40000]) addItem(s, bp(s), id);
  const answer = (a) => (a.id.startsWith('p_request') ? 0 : null);
  const seen = runUntil(s, 80, 12, [], answer);
  for (const n of [1, 2, 3]) assert.ok(seen.some((x) => x.endsWith(`p_request${n}`)), `request ${n}`);
  assert.equal(s.story.promise.rescue, 300);
  assert.equal(s.story.tags.TAG_NEIGHBOR_RESCUE3_COMPLETE, true);
  assert.equal(s.story.quests.promise_girl.done, true);
  runUntil(s, 86, 20);
  assert.equal(s.phase, 'post', 'the final wave has not been survived yet');
  markFinalWaveSurvived(s, 20);
  runHours(s, 1);
  assert.equal(s.run.ending, 'girl');
});
