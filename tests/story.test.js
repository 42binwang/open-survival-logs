import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, newLoopData } from '../src/sim/state.js';
import { tick } from '../src/sim/tick.js';
import { enqueue } from '../src/sim/actions.js';
import { dayNumber, hourOfDay, dayStartT } from '../src/sim/time.js';
import '../src/sim/furnActions.js';
import { furnitureFunctions } from '../src/sim/furnActions.js';
import '../src/sim/planning.js';
import {
  activeEvent,
  resolveEvent,
  tickEventCountdown,
  fireEvent,
  eventView,
  drainEvents,
  startQuest,
  runQuestAction,
  randomPool,
  presentNext,
  installedBeacon,
  routeStatus,
  eventDef,
} from '../src/sim/story.js';
import '../src/sim/endings.js';
import { EVENTS, QUESTS, CLUES, SCENES } from '../src/content/events.js';
import { FUNC_SPECS } from '../src/content/funcSpecs.js';
import { item } from '../src/data/db.js';
import { addItem, count, countIn } from '../src/sim/inventory.js';
import { furnitureAt } from '../src/sim/home.js';
import { homeSources } from '../src/sim/furnActions.js';
import { getObjectives } from '../src/sim/objectives.js';
import { emit } from '../src/engine/bus.js';

const bp = (s) => s.inventories[s.player.backpack];

function keepAlive(s) {
  Object.assign(s.player.stats, { sat: 90, sta: 95, mor: 90, life: 100 });
  s.player.effects = {};
}

// New run, pushed through the outbreak (18:00 on Day 1).
function started(opts = {}) {
  const s = newGame({ seed: 7, ...opts });
  s.clock.t = s.clock.outbreakAt - 60;
  tick(s, 120);
  assert.equal(s.phase, 'post');
  return s;
}

// Tick hour by hour, answering events with their default (like closing the panel, the next queued event
// is shown right away) and recording their ids.
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

function runUntil(s, day, hour = 0, seen = []) {
  let guard = 0;
  while (s.phase === 'post' && guard++ < 24 * 120 && (dayNumber(s.clock) < day || (dayNumber(s.clock) === day && hourOfDay(s.clock) < hour))) runHours(s, 1, seen);
  return seen;
}

test('content: events and quests are well formed and reference real items', () => {
  const ids = new Set();
  const checkItems = (list, where) => {
    for (const [id, n] of list || []) {
      assert.ok(item(id), `${where}: item ${id} exists`);
      assert.ok(n > 0, `${where}: quantity`);
    }
  };
  const walk = (eff, where) => {
    if (!eff) return;
    checkItems(eff.items, where);
    checkItems(eff.take, where);
    for (const q of [eff.quest].flat().filter(Boolean)) assert.ok(QUESTS[q], `${where}: quest ${q}`);
    for (const ev of eff.events || []) assert.ok(eventDef(ev), `${where}: chained event ${ev}`);
    walk(eff.chance?.effects, where);
    walk(eff.chance?.else, where);
  };
  for (const e of EVENTS) {
    assert.ok(!ids.has(e.id), `unique id ${e.id}`);
    ids.add(e.id);
    assert.ok(e.title?.en && e.title?.zh, `${e.id} has a bilingual title`);
    assert.ok(typeof e.text === 'function' || (e.text?.en && e.text?.zh), `${e.id} has bilingual text`);
    assert.ok(SCENES[e.image] || e.image, `${e.id} has an illustration`);
    for (const c of e.choices || []) {
      assert.ok(c.label?.en && c.label?.zh, `${e.id} choice label`);
      walk(c.effects, e.id);
    }
    if (e.countdown) assert.ok(e.choices.some((c) => c.default), `${e.id} countdown needs a default choice`);
  }
  for (const [id, qd] of Object.entries(QUESTS)) {
    assert.ok(qd.title, `quest ${id} has a title`);
    walk(qd.reward, id);
  }
  for (const id of Object.keys(CLUES)) assert.ok(item(Number(id)), `clue item ${id}`);
  const random = EVENTS.filter((e) => e.weight > 0);
  assert.ok(random.length >= 25, `at least 25 random events (${random.length})`);
});

test('story beats fire on their days: the first night, the morning after, the radio', () => {
  const s = started({ character: 'wage' });
  assert.ok(s.story.quests.firstNight, 'first night objective starts at the outbreak');
  runUntil(s, 1, 20);
  runHours(s, 1, []);
  const seen = runUntil(s, 2, 20);
  assert.ok(seen.includes('2:s_morning'), 'morning after on Day 2');
  assert.ok(seen.includes('2:s_radio1'), 'emergency broadcast on Day 2');
  assert.equal(s.story.quests.firstNight.done, true);
  for (const q of ['repairStairs', 'repairBasement', 'workbench', 'frontDoor']) assert.ok(s.story.quests[q], `${q} started`);
  const texts = getObjectives(s).map((o) => o.text).join('|');
  assert.ok(/stairs|楼梯/.test(texts), 'objectives list the stairs quest');
});

test('the first night event is shown with its choices and countdown at 20:00 on Day 1', () => {
  const s = started({ character: 'student' });
  runUntil(s, 1, 19);
  keepAlive(s);
  tick(s, 3600);
  assert.equal(Math.floor(hourOfDay(s.clock)), 20);
  const view = eventView(s);
  assert.equal(view?.id, 's_firstNight');
  assert.equal(view.choices.length, 3);
  assert.equal(view.choices.filter((c) => c.isDefault).length, 1);
  assert.equal(view.countdown, 45);
  assert.ok(view.text.en.includes('duplex'), 'text written for the College Student');
});

test('random events are deterministic for a seed and grow in variety after Day 10', () => {
  const runRandom = () => {
    const s = started({ character: 'wage', seed: 11 });
    const seen = runUntil(s, 22, 0);
    return seen.filter((x) => x.split(':')[1].startsWith('r_'));
  };
  const a = runRandom();
  const b = runRandom();
  assert.ok(a.length >= 4, `some random events happened (${a.length})`);
  assert.deepEqual(a, b, 'same seed, same events');

  const early = started({ character: 'wage', seed: 12 });
  early.clock.t = dayStartT(early.clock, 5) + 12 * 3600;
  const late = started({ character: 'wage', seed: 12 });
  late.clock.t = dayStartT(late.clock, 15) + 12 * 3600;
  assert.ok(randomPool(late).length > randomPool(early).length + 5, 'more random events are possible after Day 10');
});

test('random events keep firing past Day 100 in Story Endless and in Pure Endless, drawn from the endless pool', () => {
  const endless = new Set(EVENTS.filter((e) => e.endless).map((e) => e.id));
  assert.ok(endless.size >= 20, `a broad endless pool (${endless.size})`);
  for (const id of endless) assert.ok(eventDef(id).weight > 0, `${id} is a random event`);
  for (const id of ['r_numbers', 'r_helicopter', 'r_dejaVu']) assert.ok(!endless.has(id), `${id} belongs to the story calendar`);

  const story = started({ character: 'wage', seed: 14 });
  story.clock.t = dayStartT(story.clock, 120) + 12 * 3600;
  assert.deepEqual(randomPool(story), [], 'the story’s random events end with Day 100');
  story.meta.mode = 'endless';
  const after = randomPool(story);
  assert.ok(after.length >= 15, `Story Endless after Day 101 (${after.length})`);
  assert.ok(after.every((e) => endless.has(e.id)));

  const pure = newGame({ seed: 14, character: 'student', mode: 'pureEndless' });
  pure.clock.t = dayStartT(pure.clock, 5) + 12 * 3600;
  const early = randomPool(pure).map((e) => e.id);
  assert.ok(early.includes('r_canUnderSink') && !early.includes('r_birds'), 'Pure Endless draws only the endless pool, from each event’s first day');
  pure.clock.t = dayStartT(pure.clock, 150) + 6 * 3600;
  pure.run.day = 150;
  const ids = runUntil(pure, 165, 0).map((x) => x.split(':')[1]);
  assert.ok(ids.filter((id) => endless.has(id)).length >= 3, `random events on Days 150–164 (${ids.join(', ')})`);
  assert.ok(ids.every((id) => endless.has(id)), 'no story beats in Pure Endless');
});

test('choices apply stats, items and credit Planning Points immediately', () => {
  const s = started({ character: 'wage' });
  const before = s.loop.planningPoints;
  const maxMor = s.player.max.mor;
  assert.ok(fireEvent(s, 's_firstNight'));
  const res = resolveEvent(s, 2);
  assert.equal(res.choice, 2);
  assert.equal(s.loop.planningPoints, before + 5, 'points credited on the spot');
  assert.equal(s.run.eventPoints, 5);
  assert.equal(s.player.max.mor, maxMor + 1);
  assert.ok(res.rewards.some((r) => r.kind === 'points' && r.n === 5));
  assert.ok(res.rewards.some((r) => r.kind === 'max' && r.key === 'mor'));

  // a trade needs its materials; without them the default (no trade) is taken
  fireEvent(s, 'r_scavenger');
  const none = resolveEvent(s, 0);
  assert.equal(none.choice, 1, 'unavailable choice falls back to the default');
  assert.equal(count(bp(s), 20300), 0);
  addItem(s, bp(s), 20004);
  addItem(s, bp(s), 20004);
  fireEvent(s, 'r_scavenger');
  const view = eventView(s);
  assert.equal(view.choices[0].ok, true);
  resolveEvent(s, 0);
  assert.equal(count(bp(s), 20004), 0, 'sheet metal handed over');
  assert.equal(count(bp(s), 20300), 1, 'door patch kit received');
  assert.equal(s.progress.taboo.trade, true, 'a trade breaks Going Solo');
});

test('a countdown takes the default choice when it runs out', () => {
  const s = started({ character: 'wage' });
  addItem(s, bp(s), 2107);
  const mor = s.player.stats.mor;
  fireEvent(s, 'r_knock');
  assert.equal(activeEvent(s).left, 20);
  assert.equal(tickEventCountdown(s, 10), null, 'still waiting');
  const res = tickEventCountdown(s, 15);
  assert.ok(res, 'resolved when the timer hits zero');
  assert.equal(res.auto, true);
  assert.equal(res.choice, 1, 'default: stay silent');
  assert.equal(activeEvent(s), null);
  assert.equal(count(bp(s), 2107), 1, 'food kept');
  assert.ok(s.player.stats.mor < mor, 'but it weighs on you');
});

test('food, medicine and fuel requests take matching supplies from home', () => {
  const s = started({ character: 'wage' });
  addItem(s, bp(s), 2102);
  addItem(s, bp(s), 2102);
  addItem(s, bp(s), 2107);
  fireEvent(s, 'r_knock');
  resolveEvent(s, 0);
  assert.equal(count(bp(s), 2102), 0, 'the cheapest food goes first');
  assert.equal(count(bp(s), 2107), 1);
  addItem(s, bp(s), 2406);
  fireEvent(s, 'r_coughingChild');
  resolveEvent(s, 0);
  assert.equal(count(bp(s), 2406), 0, 'medicine given');
});

test('repairing the stairs unlocks the second floor through the unlockArea kind', () => {
  const s = started({ character: 'wage' });
  assert.equal(s.home.unlocked['2F'], undefined);
  startQuest(s, 'repairStairs');
  addItem(s, bp(s), 20106);
  addItem(s, bp(s), 20106);
  assert.ok(runQuestAction(s, 'repairStairs'), 'repair queued');
  runHours(s, 3);
  assert.equal(s.home.unlocked['2F'], true);
  assert.equal(count(bp(s), 20106), 0, 'planks used');
  runHours(s, 1);
  assert.equal(s.story.quests.repairStairs.done, true);
  assert.equal(s.story.tags.TAG_FLOOR_2F_UNLOCKED, true);
  assert.ok(s.loop.memories.some((m) => m.id === 'stairs'), 'knowledge memory for the next loop');
});

test('the basement takes two repairs on separate days', () => {
  const s = started({ character: 'wage' });
  assert.equal(s.home.repairsNeeded.B1, 2);
  startQuest(s, 'repairBasement');
  runUntil(s, 3, 9);
  assert.ok(runQuestAction(s, 'repairBasement'));
  runHours(s, 3);
  assert.equal(s.home.repairs.B1, 1);
  assert.equal(s.home.unlocked.B1, undefined, 'still blocked');
  assert.equal(runQuestAction(s, 'repairBasement'), null, 'one repair per day');
  runUntil(s, 4, 9);
  assert.ok(runQuestAction(s, 'repairBasement'));
  runHours(s, 3);
  assert.equal(s.home.unlocked.B1, true);
  runHours(s, 1);
  assert.equal(s.story.quests.repairBasement.done, true);
  assert.equal(s.story.tags.TAG_FLOOR_B1_UNLOCKED, true);
});

test('warehouse keys unlock the cold storage, the garage and the cabin', () => {
  const s = started({ character: 'warehouse' });
  assert.equal(s.home.repairsNeeded.B1, 1);
  const seen = runUntil(s, 2, 12);
  assert.ok(seen.includes('2:wm_coldRoom'));
  assert.ok(s.run.unlockedRecipes.includes(326), 'cold storage key recipe unlocked');
  addItem(s, bp(s), 9045);
  runHours(s, 2, seen);
  assert.equal(s.home.unlocked.coldStorage, true);
  assert.ok(seen.some((x) => x.endsWith('wm_garageKey')), 'the garage key turns up in the cold room');
  runHours(s, 1, seen);
  assert.equal(s.home.unlocked.garage, true, 'shutter key opens the garage');
  runHours(s, 2, seen);
  assert.ok(s.story.quests.wmCabinKey, 'cabin quest started');
  assert.ok(s.run.unlockedRecipes.includes(324));
  addItem(s, bp(s), 9046);
  runHours(s, 1, seen);
  assert.equal(s.home.unlocked.cabin, true);
});

test('the workbench manual is hidden at home, and from Day 6 it can be studied instead', () => {
  const s = started({ character: 'wage' });
  const holder = s.furniture[s.story.flags.manualPlaced];
  assert.ok(holder?.inv, 'manual placed in a cabinet');
  assert.equal(count(s.inventories[holder.inv], 9020), 1);
  assert.equal(furnitureAt(s, '1F:l1').broken, true);

  const t = started({ character: 'wage' });
  const inv = t.inventories[t.furniture[t.story.flags.manualPlaced].inv];
  inv.items = inv.items.filter((it) => it.id !== 9020); // the manual got lost
  startQuest(t, 'workbench');
  runUntil(t, 3, 10);
  assert.equal(runQuestAction(t, 'workbench'), null, 'too early to figure it out');
  runUntil(t, 7, 9);
  const a = runQuestAction(t, 'workbench');
  assert.equal(a?.kind, 'studyWorkbench');
  runHours(t, 5);
  assert.equal(furnitureAt(t, '1F:l1').broken, false, 'repaired by studying it');
  assert.equal(t.story.quests.workbench.done, true);
});

test('advanced reinforcement is learned from the Day 10 advice', () => {
  const s = started({ character: 'wage' });
  const door = furnitureAt(s, '1F:door');
  const adv = () => furnitureFunctions(s, door).find((f) => f.spec.kind === 'reinforce' && f.spec.advanced && f.spec.amount === 200);
  assert.equal(adv()?.enabled, false, 'locked before the quest');
  const seen = runUntil(s, 10, 20);
  assert.ok(seen.includes('10:s_doorAdvice'));
  assert.equal(s.story.tags.advancedReinforce, true);
  assert.equal(countIn(s, homeSources(s), 20310), 1, 'a reinforcement kit to try it with');
  assert.equal(adv()?.enabled, true, 'advanced reinforcement available');
  assert.ok(s.loop.memories.some((m) => m.id === 'advancedReinforce'));
});

test('New Game+ unlocks advanced reinforcement at once and moves the unlock tasks up', () => {
  const loop = { ...newLoopData(), ngPlus: true, cycle: 2, memories: [{ id: 'stairs', text: { en: 'Two planks fix the stairs.', zh: '两块木板修楼梯。' }, day: 3, cycle: 1 }] };
  const s = started({ character: 'wage', loop });
  assert.equal(s.story.tags.advancedReinforce, true);
  assert.equal(s.story.tags.trapsUnlocked, true);
  for (const q of ['repairStairs', 'repairBasement', 'traps', 'workbench']) assert.equal(s.story.quests[q]?.started, 1, `${q} starts on Day 1`);
  const door = furnitureAt(s, '1F:door');
  const adv = furnitureFunctions(s, door).find((f) => f.spec.kind === 'reinforce' && f.spec.advanced && f.spec.amount === 200);
  assert.notEqual(adv.reason, 'Learn it first (quest)');
  const seen = runUntil(s, 2, 0);
  assert.ok(seen.includes('1:s_remember'), 'narrative memories from the last loop');
  assert.ok(seen.includes('1:s_traps'), 'traps come up on the first night');
  assert.ok(!seen.some((x) => x.endsWith('s_doorAdvice')));
  const tip = getObjectives(s).find((o) => o.id === 'repairStairs')?.tip || '';
  assert.ok(tip.includes('remember'), 'objective carries the memory');
});

test('hospital clues and the recorder open the Truth line and count clues', () => {
  const s = started({ character: 'wage' });
  const seen = [];
  for (const id of [9041, 9042]) addItem(s, bp(s), id);
  runHours(s, 1, seen);
  assert.equal(s.progress.counters.clue, 2);
  addItem(s, bp(s), 9064); // the student's copy of the pharmacy sheet stands in for 9043
  runHours(s, 1, seen);
  assert.equal(s.progress.counters['clue.hospital'], 3);
  assert.equal(s.story.tags.TAG_LINE_TRUTH_EXPLORED, undefined, 'the recorder is still missing');
  addItem(s, bp(s), 9049);
  runHours(s, 2, seen);
  assert.equal(s.story.tags.TAG_LINE_TRUTH_EXPLORED, true);
  assert.equal(s.progress.counters.clue, 3, 'the recorder itself is not a clue');
  assert.ok(seen.some((x) => x.endsWith('clue_9041')), 'clue documents are shown');
  assert.ok(seen.some((x) => x.endsWith('s_truthExplored')));
  addItem(s, bp(s), 9047);
  runHours(s, 1, seen);
  assert.equal(s.progress.counters.clue, 4, 'Puzzle: all four truth clues');
});

test('the rescue beacon line: craft the marker, set it up on the second floor, inspect it', () => {
  const s = started({ character: 'wage' });
  s.home.unlocked['2F'] = true;
  for (const id of [9003, 20001, 20002, 20003, 20004]) addItem(s, bp(s), id);
  enqueue(s, { kind: 'story', spec: FUNC_SPECS[36], dur: 60, noWalk: true });
  runHours(s, 1);
  assert.equal(count(bp(s), 9002), 1, 'rescue marker made from the blueprint');
  assert.ok(s.story.quests.rescueBeacon, 'beacon objective started');
  enqueue(s, { kind: 'story', spec: FUNC_SPECS[38], dur: 60, noWalk: true });
  runHours(s, 3);
  const beacon = installedBeacon(s);
  assert.equal(beacon?.floor, '2F', 'beacon installed upstairs');
  assert.equal(routeStatus(s, 'evacuate').ok, true);
  assert.ok(runQuestAction(s, 'rescueBeacon'), 'inspection queued');
  runHours(s, 2);
  assert.equal(s.story.flags.beaconChecks, 1);
  runHours(s, 1);
  assert.equal(s.story.quests.rescueBeacon.done, true);
});

test('knowledge memories are recorded once per loop', () => {
  const s = started({ character: 'wage' });
  runUntil(s, 3, 12);
  s.power.grid = false;
  const seen = runHours(s, 2);
  runHours(s, 3);
  const blackout = s.loop.memories.filter((m) => m.id === 'blackout');
  assert.equal(blackout.length, 1);
  assert.equal(blackout[0].day, 3);
  assert.ok(blackout[0].text.en.includes('Day 3') && blackout[0].text.zh.includes('第3天'));
  assert.ok(seen.some((x) => x.endsWith('s_blackout')));
  s.crises.active = [{ type: 'horde', phase: 'attack' }];
  runHours(s, 2);
  s.crises.active = [];
  assert.equal(s.loop.memories.filter((m) => m.id.startsWith('horde:')).length, 1, 'one memory per horde day');
});

test('harvested produce portions are counted for the Greenhouse promise', () => {
  const s = started({ character: 'student' });
  tick(s, 60);
  emit('harvested', { furn: 1, items: [2125, 2125, 2541] });
  assert.equal(s.progress.counters['plant.harvest.produce'], 2, 'flowers are not produce');
});

test('the Day 70 reckoning sets its tag and delivers every party’s response', () => {
  const s = started({ character: 'wage' });
  s.clock.t = dayStartT(s.clock, 69) + 22 * 3600;
  s.run.day = 69;
  drainEvents(s);
  const seen = runUntil(s, 70, 12);
  assert.equal(s.story.tags.TAG_RECKONING, true);
  for (const id of ['s_reckoning', 'r_military', 'r_door', 'r_neighbor', 'r_network', 'r_choice']) assert.ok(seen.includes(`70:${id}`), `${id} delivered`);
  assert.ok(!seen.includes('70:r_hub'), 'no warehouse response for the Wage Slave');
  assert.ok(s.story.quests.myChoice, 'My Choice objective');
});
