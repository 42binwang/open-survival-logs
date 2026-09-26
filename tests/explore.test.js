import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { tick } from '../src/sim/tick.js';
import { dayStartT, dayNumber } from '../src/sim/time.js';
import { enqueue } from '../src/sim/actions.js';
import { sceneFloor } from '../src/sim/scenes.js';
import { furnitureAt } from '../src/sim/home.js';
import { furnitureFunctions, startFurnitureFunction } from '../src/sim/furnActions.js';
import { addItem, countIn } from '../src/sim/inventory.js';
import { getObjectives } from '../src/sim/objectives.js';
import { item, furn, furniture as furnTable } from '../src/data/db.js';
import { on } from '../src/engine/bus.js';
import { saveGame, loadGame, _resetStorage } from '../src/engine/save.js';
import '../src/sim/story.js';
import { FUNC_SPECS } from '../src/content/funcSpecs.js';
import { HOSPITAL_CLUES, TRUTH_CLUES, STUDENT_COPIES, ITEM, RATION_PRESS_RECIPE } from '../src/content/sites.js';
import {
  sites,
  siteStatus,
  siteLayout,
  startExploration,
  retreat,
  searchContainer,
  exploreRun,
  travelTime,
  travelStamina,
  spawnZombie,
  queueFight,
  queueFixture,
  queueDefault,
  nearestFixture,
  approachTile,
  fixtureOptions,
  rollOverrun,
  RAIDERS,
  spawnRaider,
  standoffView,
  resolveStandoff,
  raiderTalkChance,
  throwLure,
  canThrowLure,
  NOISEMAKER,
} from '../src/sim/explore.js';

function atDay(day, hour = 9, opts = {}) {
  const s = newGame({ seed: 21, character: 'wage', ...opts });
  s.phase = 'post';
  s.clock.t = dayStartT(s.clock, day) + hour * 3600;
  s.run.day = dayNumber(s.clock);
  return s;
}

function arriveAt(s, id, opts) {
  const r = startExploration(s, id, opts);
  assert.ok(r.ok, r.reason);
  tick(s, travelTime(s, id) + 60);
  const run = exploreRun(s);
  assert.equal(run.phase, 'site');
  return run;
}

function giveTool(s, id) {
  addItem(s, s.inventories[s.player.backpack], id);
}

function goHome(s) {
  const run = exploreRun(s);
  assert.ok(retreat(s).ok);
  tick(s, run.travelSec + 60);
  assert.equal(s.player.scene, 'home');
}

test('six exploration points with unlock days, hours, danger and valid maps', () => {
  const list = sites();
  assert.equal(list.length, 6);
  assert.deepEqual(
    list.map((d) => d.id),
    ['streets', 'hardware', 'supermarket', 'school', 'hospital', 'office']
  );
  const s = atDay(1, 19);
  const ex = s.explore;
  assert.equal(ex.unlockDay.streets, 1);
  assert.ok(ex.unlockDay.supermarket >= 12 && ex.unlockDay.supermarket <= 17);
  assert.ok(ex.unlockDay.office > ex.unlockDay.hospital);
  for (const def of list) {
    assert.ok(def.travelMin >= 30 && def.travelMin <= 60, `${def.id} travel time`);
    const layout = siteLayout(def.id);
    assert.ok(layout.fixtures.filter((f) => f.kind === 'box').length >= 10, `${def.id} has containers`);
    assert.ok(layout.spawns.length >= 2, `${def.id} has zombie spawn points`);
    for (const f of layout.fixtures) assert.ok(furn(f.cfg), `${def.id}: furniture ${f.cfg} exists`);
  }
  assert.equal(siteLayout('school').fixtures.length > siteLayout('streets').fixtures.length * 2, true, 'the school is the largest site');
  assert.ok(list.find((d) => d.id === 'supermarket').dark && list.find((d) => d.id === 'hospital').dark);
});

test('every container is reachable once obstacles are pushed aside; obstacles wall off whole zones', () => {
  for (const def of sites()) {
    const s = atDay(45, 9);
    assert.ok(startExploration(s, def.id).ok);
    const run = exploreRun(s);
    const [x, y] = siteLayout(def.id).entry;
    const from = { x, y };
    const gated = run.fixtures.filter((f) => f.kind === 'box' && !approachTile(s, f.id, from));
    if (def.id === 'school' || def.id === 'hospital' || def.id === 'office' || def.id === 'supermarket') assert.ok(gated.length > 0, `${def.id} has blocked zones`);
    for (const f of run.fixtures) if (f.kind === 'block') f.cleared = true;
    for (const f of run.fixtures) {
      if (f.kind === 'block') continue;
      assert.ok(approachTile(s, f.id, from), `${def.id}: ${f.id} reachable`);
    }
  }
});

test('zombie spawn points start out of sight of the entrance', () => {
  for (const def of sites()) {
    const { entry, spawns } = siteLayout(def.id);
    for (const [x, y] of spawns) assert.ok(Math.abs(x - entry[0]) + Math.abs(y - entry[1]) > 5, `${def.id} spawn ${x},${y}`);
  }
});

test('opening hours: the Hardware Store and the Ruined Supermarket stay open at night', () => {
  const s = atDay(30, 23);
  assert.equal(siteStatus(s, 'hardware').status, 'open');
  assert.equal(siteStatus(s, 'supermarket').status, 'open');
  assert.equal(siteStatus(s, 'streets').status, 'closed');
  assert.equal(siteStatus(s, 'school').status, 'closed');
  assert.equal(siteStatus(s, 'hospital').status, 'closed');
  assert.equal(siteStatus(s, 'office').status, 'locked');
  const d1 = atDay(1, 18.5);
  assert.equal(siteStatus(d1, 'streets').available, true, 'streets are reachable on the outbreak evening');
  assert.equal(siteStatus(d1, 'hardware').status, 'locked');
  assert.equal(startExploration(d1, 'supermarket').ok, false);
});

test('starting an exploration leaves the house, breaks the stay-indoors taboo and arrives after travel', () => {
  const s = atDay(2, 9);
  const sta = s.player.stats.sta;
  assert.ok(startExploration(s, 'streets').ok);
  assert.equal(s.progress.taboo.explore, true);
  assert.equal(s.player.scene, 'explore:streets');
  assert.equal(exploreRun(s).phase, 'travelOut');
  tick(s, travelTime(s, 'streets') - 120);
  assert.equal(exploreRun(s).phase, 'travelOut', 'still on the road');
  tick(s, 180);
  const run = exploreRun(s);
  assert.equal(run.phase, 'site');
  assert.equal(s.player.floor, 'site:streets');
  assert.deepEqual([s.player.x, s.player.y], siteLayout('streets').entry);
  assert.ok(run.zombies.length >= 1, 'zombies are waiting');
  assert.ok(s.player.stats.sta < sta, 'the trip costs stamina');
  assert.equal(s.progress.counters['explore.points.distinct'], 1);
  assert.equal(sceneFloor(s, s.player.floor), siteLayout('streets').floor, 'the scene provider serves the site grid');
  assert.equal(startExploration(s, 'hardware').ok, false, 'one trip at a time');
});

test('snow slows the trip and drains stamina 1.5× faster', () => {
  const s = atDay(5, 9);
  const t0 = travelTime(s, 'hardware');
  const sta0 = travelStamina(s, 'hardware');
  s.weather = { today: { kind: 'snow' } };
  assert.ok(travelTime(s, 'hardware') > t0);
  assert.ok(Math.abs(travelStamina(s, 'hardware') / sta0 - 1.5) < 0.02);
});

test('searching a container fills the backpack, raises exposure and depth, and trains exploration', () => {
  const s = atDay(3, 9);
  const run = arriveAt(s, 'streets');
  run.zombies = [];
  const bp = s.inventories[s.player.backpack];
  const before = bp.items.length;
  const exp = s.progress.prof.explore.exp;
  const res = searchContainer(s, 'S1');
  assert.ok(res.ok);
  assert.ok(res.items.length >= 1, 'a shelf always has something');
  assert.equal(bp.items.length > before, true);
  for (const inst of bp.items) {
    const cfg = item(inst.id);
    if (cfg.life > 0) assert.ok(inst.age < cfg.life, 'scavenged food is not already spoiled');
  }
  assert.equal(run.searched, 1);
  assert.ok(run.exposure > 0);
  assert.equal(searchContainer(s, 'S1').ok, false, 'a container is searched once per outing');
  assert.equal(s.progress.counters['explore.search'], 1);
  assert.ok(s.progress.prof.explore.exp > exp || s.progress.prof.explore.lv > 1);
});

test('searching as an action: walk over, spend time and stamina, E-key default picks the nearest container', () => {
  const s = atDay(3, 9);
  const run = arriveAt(s, 'streets');
  run.zombies = [];
  const target = { x: 8, y: 10, floor: s.player.floor };
  enqueue(s, { kind: 'walk', target, dur: 0 });
  tick(s, 60);
  assert.deepEqual([s.player.x, s.player.y], [8, 10], 'click-to-walk paths over the site grid');
  const fx = nearestFixture(s, 12);
  assert.ok(fx);
  const sta = s.player.stats.sta;
  assert.ok(queueDefault(s, fx.id));
  tick(s, 60 * 60);
  assert.equal(run.fixtures.find((f) => f.id === fx.id).searched, true);
  assert.ok(s.player.stats.sta < sta);
});

test('locked containers need a crowbar or a lockpick, and the tool breaks', () => {
  const s = atDay(5, 9);
  const run = arriveAt(s, 'hardware');
  run.zombies = [];
  const bp = [s.player.backpack];
  assert.equal(searchContainer(s, 'K1').ok, false, 'jammed cabinet without tools');
  giveTool(s, ITEM.lockpick);
  assert.equal(searchContainer(s, 'K1').ok, false, 'a lockpick cannot pry');
  giveTool(s, ITEM.crowbar);
  assert.ok(fixtureOptions(s, 'K1').find((o) => o.mode === 'pry').enabled);
  assert.ok(searchContainer(s, 'K1').ok);
  assert.equal(countIn(s, bp, ITEM.crowbar), 0, 'the crowbar is used up');
  assert.equal(countIn(s, bp, ITEM.lockpick), 1);
  assert.ok(searchContainer(s, 'H1').ok, 'the toolbox lock takes the lockpick');
  assert.equal(countIn(s, bp, ITEM.lockpick), 0);
});

test('a full backpack leaves the rest in the container; it is lost once you head home', () => {
  const s = atDay(5, 9);
  const run = arriveAt(s, 'hardware');
  run.zombies = [];
  s.inventories[s.player.backpack].maxKg = 0.01;
  const res = searchContainer(s, 'T1');
  assert.ok(res.ok && res.left.length >= 1 && res.taken.length === 0);
  const fx = run.fixtures.find((f) => f.id === 'T1');
  assert.ok(s.inventories[fx.inv].items.length >= 1);
  assert.ok(fixtureOptions(s, 'T1').some((o) => o.mode === 'take'));
  goHome(s);
  assert.equal(s.inventories[fx.inv], undefined);
});

test('a zombie that reaches the survivor bites and interrupts the search; the survivor fights back', () => {
  const s = atDay(3, 9);
  const run = arriveAt(s, 'streets');
  run.zombies = [];
  const fx = nearestFixture(s, 12);
  queueFixture(s, fx.id, 'search');
  for (let i = 0; i < 20 && s.actions.current?.phase !== 'work'; i++) tick(s, 12);
  assert.equal(s.actions.current?.kind, 'exploreSearch');
  const p = s.player;
  const z = spawnZombie(s, p.x, p.y, { big: false });
  assert.equal(Math.abs(z.x - p.x) + Math.abs(z.y - p.y), 1);
  const life = p.stats.life;
  tick(s, 60);
  assert.ok(p.stats.life < life - 3, `bitten (${life} -> ${p.stats.life})`);
  assert.ok(run.hits >= 1);
  assert.equal(run.fixtures.find((f) => f.id === fx.id).searched, false, 'the search was interrupted');
  tick(s, 150);
  assert.equal(run.zombies.length, 0, 'the survivor shoved back until it went down');
  assert.equal(run.kills, 1);
  assert.equal(s.progress.counters['zombie.kill'], 1);
});

test('clicking a zombie queues a fight; a crowbar hits harder', () => {
  const s = atDay(3, 9);
  const run = arriveAt(s, 'streets');
  run.zombies = [];
  giveTool(s, ITEM.crowbar);
  const z = spawnZombie(s, s.player.x + 3, s.player.y, { big: true });
  const hp = z.hp;
  assert.ok(queueFight(s, z.id));
  tick(s, 90);
  assert.ok(z.hp < hp || !run.zombies.includes(z), 'the swing landed');
  assert.ok(hp - z.hp >= 38 || !run.zombies.includes(z), 'crowbar damage');
});

test('being overwhelmed at a site is death by exploration', () => {
  const s = atDay(3, 9);
  const run = arriveAt(s, 'streets');
  run.zombies = [];
  s.player.stats.life = 3;
  spawnZombie(s, s.player.x - 1, s.player.y, { big: true });
  tick(s, 120);
  assert.equal(s.phase, 'dead');
  assert.equal(s.run.deathCause, 'exploration');
  assert.equal(s.explore.last.died, true);
});

test('retreat brings the survivor home with the loot and counts the outing', () => {
  const s = atDay(3, 9);
  const run = arriveAt(s, 'streets');
  run.zombies = [];
  searchContainer(s, 'S1');
  const loot = run.found.slice();
  goHome(s);
  assert.equal(exploreRun(s), null);
  assert.equal(s.player.floor, furnitureAt(s, '1F:door').floor);
  assert.equal(s.progress.counters['explore.total'], 1);
  assert.equal(s.progress.counters['explore.points.distinct'], 1);
  assert.deepEqual(s.explore.visited, ['streets']);
  for (const id of loot) assert.ok(countIn(s, [s.player.backpack], id) >= 1, 'loot came home');
  arriveAt(s, 'streets');
  goHome(s);
  assert.equal(s.progress.counters['explore.total'], 2);
  assert.equal(s.progress.counters['explore.points.distinct'], 1, 'same place again');
  s.clock.t = dayStartT(s.clock, 6) + 9 * 3600;
  s.run.day = dayNumber(s.clock);
  arriveAt(s, 'hardware');
  goHome(s);
  assert.equal(s.progress.counters['explore.points.distinct'], 2);
});

test('the objective list shows depth and exposure, with a clickable Retreat', () => {
  const s = atDay(3, 9);
  arriveAt(s, 'streets');
  const list = getObjectives(s);
  const depth = list.find((o) => o.id === 'exploreDepth');
  assert.match(depth.text, /0\/\d+/);
  const back = list.find((o) => o.id === 'exploreRetreat');
  back.onClick();
  assert.equal(exploreRun(s).phase, 'travelBack');
});

test('turning back on the road returns home without counting an outing', () => {
  const s = atDay(3, 9);
  startExploration(s, 'streets');
  tick(s, 10 * 60);
  assert.ok(retreat(s).ok);
  tick(s, 12 * 60);
  assert.equal(s.player.scene, 'home');
  assert.equal(s.progress.counters['explore.total'] || 0, 0);
});

test('Ruined Supermarket outings with a search count toward Delve Deep into the Ruins', () => {
  const s = atDay(20, 9);
  let run = arriveAt(s, 'supermarket');
  run.zombies = [];
  assert.ok(searchContainer(s, 'A1').ok);
  goHome(s);
  assert.equal(s.progress.counters.marketLoot, 1);
  arriveAt(s, 'supermarket');
  goHome(s);
  assert.equal(s.progress.counters.marketLoot, 1, 'no search, no count');
});

test('the hospital: three clues, the old recorder and the Ration Press papers (behind a hospital bed)', () => {
  const s = atDay(30, 9);
  const run = arriveAt(s, 'hospital');
  run.zombies = [];
  assert.equal(approachTile(s, 'recorderCabinet'), null, 'the upper wing is blocked');
  const bed = run.fixtures.find((f) => f.kind === 'block');
  run.fixtures.filter((f) => f.kind === 'block' && f.id !== bed.id).forEach((f) => (f.cleared = true));
  assert.ok(queueFixture(s, bed.id, 'clear'));
  tick(s, 90 * 60);
  run.zombies = [];
  assert.equal(bed.cleared, true);
  assert.ok(approachTile(s, 'recorderCabinet'), 'pushing the bed aside opens the way');
  for (const id of ['outpatientDesk', 'labBench', 'pharmacyCabinet', 'papers', 'recorderCabinet']) assert.ok(searchContainer(s, id).ok, id);
  const bp = [s.player.backpack];
  for (const clue of HOSPITAL_CLUES) assert.equal(countIn(s, bp, clue), 1);
  assert.equal(countIn(s, bp, ITEM.recorder), 1);
  assert.equal(s.progress.counters['clue.hospital'], 3);
  assert.equal(s.progress.counters.clue, 3);
  assert.ok(s.run.unlockedRecipes.includes(RATION_PRESS_RECIPE));
  assert.equal(s.story.tags.truthExplored, true);
  goHome(s);
  assert.ok(s.explore.cleared.hospital.includes(bed.id), 'the way stays open on later visits');
  // the fourth truth clue waits in the office ruins archive (Puzzle: clue >= 4)
  s.clock.t = dayStartT(s.clock, 45) + 9 * 3600;
  s.run.day = dayNumber(s.clock);
  Object.assign(s.player.stats, { sat: 90, sta: 95 });
  s.player.effects = {};
  const office = arriveAt(s, 'office');
  office.zombies = [];
  assert.ok(searchContainer(s, 'archiveCabinet').ok);
  assert.equal(s.progress.counters.clue, TRUTH_CLUES.length);
  assert.equal(s.progress.counters['clue.hospital'], 3);
});

test("the College Student's own hospital finds: the patient's diary and the family messages fill the lab and pharmacy slots", () => {
  const visit = (s) => {
    Object.assign(s.player.stats, { sat: 90, sta: 95 });
    s.player.effects = {};
    arriveAt(s, 'hospital').zombies = [];
  };
  for (const character of ['wage', 'student']) {
    const s = atDay(30, 9, { character });
    visit(s);
    for (const id of ['outpatientDesk', 'patientBag', 'wardDesk']) assert.ok(searchContainer(s, id).ok, id);
    const student = character === 'student';
    for (const id of STUDENT_COPIES) assert.equal(countIn(s, [s.player.backpack], id), student ? 1 : 0, `${character}: ${id}`);
    assert.equal(s.progress.counters['clue.hospital'], student ? 3 : 1, `${character}: the outpatient log${student ? ' and both copies' : ''}`);
    goHome(s);
    if (!student) continue;
    visit(s);
    for (const id of ['labBench', 'pharmacyCabinet']) assert.ok(searchContainer(s, id).ok, id);
    assert.equal(s.progress.counters['clue.hospital'], 3, 'the originals fill no new slot');
    assert.equal(s.story.clues.length, 5);
    goHome(s);
    visit(s);
    for (const id of ['patientBag', 'wardDesk']) assert.equal(searchContainer(s, id).items.some((x) => STUDENT_COPIES.includes(x)), false, `${id}: one-time find`);
  }
  const full = atDay(30, 9, { character: 'student' });
  visit(full);
  full.inventories[full.player.backpack].maxKg = 0.01;
  assert.ok(searchContainer(full, 'patientBag').left.includes(9063));
  goHome(full);
  assert.equal(countIn(full, [full.player.backpack], 9063), 1, 'a copy left behind still comes home');
});

test('a clue left behind in a full container still comes home (no story softlock)', () => {
  const s = atDay(30, 9);
  arriveAt(s, 'hospital').zombies = [];
  s.inventories[s.player.backpack].maxKg = 0.01;
  const res = searchContainer(s, 'outpatientDesk');
  assert.ok(res.left.includes(9041));
  assert.equal(s.progress.counters['clue.hospital'] || 0, 0, 'not collected yet');
  goHome(s);
  assert.equal(countIn(s, [s.player.backpack], 9041), 1);
  assert.equal(s.progress.counters['clue.hospital'], 1);
});

test('story finds are one-time: the clue does not come back on the next visit', () => {
  const s = atDay(30, 9);
  arriveAt(s, 'hospital');
  searchContainer(s, 'outpatientDesk');
  goHome(s);
  arriveAt(s, 'hospital');
  const res = searchContainer(s, 'outpatientDesk');
  assert.equal(res.items.includes(9041), false);
  assert.equal(s.progress.counters['clue.hospital'], 1);
});

test("the Warehouse Manager's note is only in the Student's supermarket truck, behind a crowbar", () => {
  for (const character of ['wage', 'student']) {
    const s = atDay(20, 9, { character });
    const run = arriveAt(s, 'supermarket');
    run.zombies = [];
    const r0 = searchContainer(s, 'truck');
    assert.equal(r0.ok, false);
    assert.match(r0.reason, /crowbar|撬棍/);
    giveTool(s, ITEM.crowbar);
    const res = searchContainer(s, 'truck');
    assert.ok(res.ok);
    const has = countIn(s, [s.player.backpack], ITEM.wmNote) === 1;
    assert.equal(has, character === 'student', `${character} note`);
    assert.equal(!!s.story.tags.wmTruckNote, character === 'student');
    assert.equal(countIn(s, [s.player.backpack], ITEM.crowbar), 0);
  }
});

test("the old teaching drone waits in the school for the Student's mid-game quest", () => {
  for (const character of ['wage', 'student']) {
    const s = atDay(30, 9, { character });
    const run = arriveAt(s, 'school');
    run.zombies = [];
    searchContainer(s, 'droneCrate');
    assert.equal(countIn(s, [s.player.backpack], ITEM.teachingDrone), character === 'student' ? 1 : 0);
  }
});

test('the Warehouse Manager spots hidden stashes at a glance', () => {
  const s = atDay(5, 9, { character: 'warehouse' });
  const run = arriveAt(s, 'hardware');
  run.zombies = [];
  run.fixtures.find((f) => f.id === 'S1').hidden = true;
  const res = searchContainer(s, 'S1');
  assert.equal(res.stash, true);
  assert.ok(res.items.length >= 2);
});

test('desperate exploration: ignores closing time, costs Life, once a day; the door spends it only on departure', () => {
  const s = atDay(2, 22);
  const door = furnitureAt(s, '1F:door');
  const events = [];
  const off = on('openPanel', (e) => events.push(e));
  const fns = furnitureFunctions(s, door);
  assert.ok(fns.find((f) => f.key === 1002)?.enabled && fns.find((f) => f.key === 209)?.enabled);
  startFurnitureFunction(s, door.uid, 209);
  tick(s, 10 * 60);
  off();
  assert.equal(events.at(-1)?.panel, 'exploreMap');
  assert.equal(events.at(-1).forced, true);
  assert.ok(furnitureFunctions(s, door).find((f) => f.key === 209).enabled, 'not spent until the survivor leaves');
  assert.equal(startExploration(s, 'streets').ok, false, 'closed at night');
  const life = s.player.stats.life;
  assert.ok(startExploration(s, 'streets', { forced: true }).ok);
  assert.equal(furnitureFunctions(s, door).find((f) => f.key === 209).enabled, false);
  tick(s, travelTime(s, 'streets') + 30);
  assert.equal(exploreRun(s).phase, 'site');
  assert.ok(s.player.stats.life <= life - 20, 'badly hurt on the way');
  exploreRun(s).zombies = [];
  goHome(s);
  assert.equal(startExploration(s, 'streets', { forced: true }).ok, false, 'once per day');
});

test('endless mode: hordes overrun exploration points (marked, unreachable); story mode never', () => {
  const endless = atDay(3, 9, { mode: 'endless' });
  let overrun = null;
  for (let day = 3; day <= 40 && !overrun; day++) {
    rollOverrun(endless, day);
    overrun = Object.keys(endless.explore.overrun)[0] || null;
  }
  assert.ok(overrun, 'some point got overrun');
  const st = siteStatus(endless, overrun);
  assert.equal(st.status, 'overrun');
  assert.ok(st.overrunUntil > 0);
  assert.equal(startExploration(endless, overrun, { forced: true }).ok, false);
  const until = endless.explore.overrun[overrun];
  rollOverrun(endless, until);
  assert.equal(endless.explore.overrun[overrun], undefined, 'the horde moves on');
  const story = atDay(3, 9);
  for (let day = 3; day <= 60; day++) assert.deepEqual(rollOverrun(story, day), []);
  assert.deepEqual(story.explore.overrun, {});
});

test('an expedition survives a save and load mid-trip', () => {
  _resetStorage();
  const s = atDay(3, 9);
  startExploration(s, 'streets');
  tick(s, 5 * 60);
  saveGame('explore-slot', s);
  const loaded = loadGame('explore-slot').state;
  tick(loaded, travelTime(loaded, 'streets'));
  assert.equal(exploreRun(loaded).phase, 'site');
  assert.ok(searchContainer(loaded, 'S1').ok);
  goHome(loaded);
  assert.equal(loaded.progress.counters['explore.total'], 1);
});

test('hostile survivors turn up at sites from their first day, more often at the later sites', () => {
  const seen = (id, day) => {
    let n = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = atDay(day, 9, { seed });
      n += arriveAt(s, id).zombies.filter((z) => z.human).length ? 1 : 0;
    }
    return n;
  };
  assert.ok(RAIDERS.office[0] > RAIDERS.streets[0] && RAIDERS.office[1] > RAIDERS.streets[1]);
  assert.equal(seen('streets', RAIDERS.streets[0] - 1), 0, 'none before their first day');
  assert.ok(seen('office', RAIDERS.office[0] + 2) > 0, 'the office ruins attract raiders');
});

test('a raider standoff waits for a choice; paying off hands over a third of the backpack', () => {
  const s = atDay(12, 9);
  const run = arriveAt(s, 'streets');
  run.zombies = [];
  const opened = [];
  const off = on('openPanel', (e) => opened.push(e.panel));
  const bp = s.inventories[s.player.backpack];
  bp.items = [];
  for (const id of [2400, 2400, 2402]) addItem(s, bp, id);
  const r = spawnRaider(s, s.player.x + 1, s.player.y);
  tick(s, 5);
  off();
  assert.ok(opened.includes('raiders'));
  assert.equal(r.stance, 'standoff');
  const life = s.player.stats.life;
  tick(s, 300);
  assert.equal(s.player.stats.life, life, 'nobody swings during the standoff');
  const view = standoffView(s);
  assert.equal(view.count, 1);
  assert.equal(view.tribute.length, 1);
  const res = resolveStandoff(s, 'give');
  assert.equal(res.result, 'paid');
  assert.equal(bp.items.length, 2);
  tick(s, 60);
  assert.equal(run.zombies.length, 0, 'they leave');
  assert.equal(s.progress.counters['raider.paid'], 1);
});

test('fighting raiders: they hit harder than zombies, carry supplies, and are not zombie kills', () => {
  const s = atDay(12, 9);
  const run = arriveAt(s, 'streets');
  run.zombies = [];
  s.inventories[s.player.backpack].items = [];
  const r = spawnRaider(s, s.player.x + 1, s.player.y);
  tick(s, 5);
  assert.equal(resolveStandoff(s, 'fight').result, 'fight');
  assert.equal(r.stance, 'hostile');
  const life = s.player.stats.life;
  for (let i = 0; i < 40 && run.zombies.length; i++) tick(s, 15);
  assert.equal(run.zombies.length, 0, 'the survivor fought them off');
  assert.ok(s.player.stats.life < life, 'and got hurt doing it');
  assert.equal(s.progress.counters['raider.kill'], 1);
  assert.equal(s.progress.counters['zombie.kill'] || 0, 0);
  assert.equal(run.kills, 0);
  assert.ok(s.inventories[s.player.backpack].items.length >= 1, 'loot from the raider');
});

test('raider odds follow morale, and they want medicine and food before scrap', () => {
  const s = atDay(12, 9);
  const run = arriveAt(s, 'streets');
  run.zombies = [];
  s.player.stats.mor = 10;
  const low = raiderTalkChance(s);
  s.player.stats.mor = 100;
  assert.ok(raiderTalkChance(s) > low, 'high morale talks better');
  const bp = s.inventories[s.player.backpack];
  bp.items = [];
  for (const id of [20002, 2400, 20002]) addItem(s, bp, id);
  spawnRaider(s, s.player.x + 1, s.player.y);
  tick(s, 5);
  assert.deepEqual(standoffView(s).tribute, [2400], 'the bandage goes first');
  resolveStandoff(s, 'talk');
  assert.equal(s.player.stats.morale, undefined, 'morale changes go to the real stat');
});

test('the tin-can noisemaker pulls nearby zombies toward the far corner and lets the exposure settle', () => {
  const s = atDay(3, 9);
  const run = arriveAt(s, 'streets');
  run.zombies = [];
  assert.notEqual(canThrowLure(s), true, 'no can, no lure');
  giveTool(s, NOISEMAKER);
  const p = s.player;
  const z = spawnZombie(s, p.x + 3, p.y, { mode: 'chase' });
  run.exposure = 40;
  const r = throwLure(s);
  assert.ok(r.ok);
  assert.equal(r.drawn, 1);
  assert.equal(countIn(s, [p.backpack], NOISEMAKER), 0, 'the can is gone');
  assert.equal(run.exposure, 25);
  const d0 = Math.abs(z.x - p.x) + Math.abs(z.y - p.y);
  const life = p.stats.life;
  tick(s, 120);
  assert.ok(Math.abs(z.x - p.x) + Math.abs(z.y - p.y) > d0, 'it wanders off toward the noise');
  assert.equal(p.stats.life, life);
  tick(s, 120);
  assert.notEqual(z.mode, 'lured', 'the noise dies down');
});

test("every piece of a post-outbreak site scene stands at its site, once: the hospital, school and office blocks and the supermarket's shelves", () => {
  const where = new Map();
  for (const def of sites()) {
    for (const f of siteLayout(def.id).fixtures) {
      if (f.letter !== '') continue;
      assert.ok(!where.has(f.cfg), `${f.cfg} stands in two wings`);
      where.set(f.cfg, def.id);
    }
  }
  const placed = new Set(sites().flatMap((d) => siteLayout(d.id).fixtures.map((f) => f.cfg)));
  // the scene blocks: Config_Furniture 66000–67999 (hospital, school, office) and 880–914 (the ruined supermarket);
  // the few rows there the player can dismantle (a compost bin, a wine barrel, a vase) are home furniture
  const scene = Object.values(furnTable).filter((f) => ((f.id >= 66000 && f.id < 68000) || (f.id >= 880 && f.id <= 914)) && !(f.rmFunc || []).includes(299));
  assert.ok(scene.length > 300);
  for (const f of scene) assert.ok(placed.has(f.id), `${f.id} ${f.zh} (${f.res}) stands at no site`);
  const home = { 883: 'supermarket', 909: 'supermarket', 66163: 'hospital', 66172: 'hospital', 66071: 'hospital', 66072: 'hospital', 66073: 'hospital', 67002: 'office', 67172: 'office', 67182: 'school', 67082: 'streets' };
  for (const [cfg, site] of Object.entries(home)) assert.equal(where.get(Number(cfg)), site, `${cfg} at the ${site}`);
});

test('the wings: a loose find is picked up in a moment, scrap comes apart into its materials, a prop offers nothing', () => {
  const s = atDay(45, 9);
  const run = arriveAt(s, 'office');
  run.zombies = [];
  const bp = [s.player.backpack];
  const done = [];
  const off = on('actionDone', (a) => done.push(a));
  try {
    // 66058 办公用品 offers only 拾取 (1765): no stamina, two minutes
    const loose = run.fixtures.find((f) => f.cfg === 66058);
    assert.equal(loose.kind, 'loose');
    const pick = fixtureOptions(s, loose.id);
    assert.deepEqual(
      pick.map((o) => o.mode),
      ['search']
    );
    assert.equal(pick[0].sta, 0);
    assert.ok(pick[0].sec <= 2 * 60);
    assert.ok(queueFixture(s, loose.id, 'search'));
    tick(s, 30 * 60);
    assert.equal(loose.searched, true);
    assert.equal(done.at(-1)?.funcKey, 1765);
    // 66087 废旧显示器 offers 回收 (1764): with pliers every RemoveGet material comes out, and the monitor is gone
    const scrap = run.fixtures.find((f) => f.cfg === 66087);
    assert.equal(scrap.kind, 'scrap');
    giveTool(s, 20350);
    const mats = furn(66087).rmGet;
    const kinds = [...new Set(mats)];
    const before = kinds.map((id) => countIn(s, bp, id));
    const sta = s.player.stats.sta;
    assert.deepEqual(
      fixtureOptions(s, scrap.id).map((o) => o.mode),
      ['clear']
    );
    assert.ok(queueFixture(s, scrap.id, 'clear'));
    tick(s, 60 * 60);
    assert.equal(scrap.cleared, true);
    assert.equal(done.at(-1)?.funcKey, 1764);
    const got = kinds.reduce((n, id, i) => n + countIn(s, bp, id) - before[i], 0);
    assert.equal(got, mats.length, `materials ${mats} came out`);
    assert.ok(s.player.stats.sta < sta);
    assert.deepEqual(fixtureOptions(s, scrap.id), []);
    // 67192 屏幕 has no function: it only stands there
    const prop = siteLayout('school').fixtures.find((f) => f.cfg === 67192);
    assert.equal(prop.kind, 'prop');
  } finally {
    off();
  }
});

test('searches take minutes, not half an hour: a small container at a site 4, a lock +5 to pry, a home container 6', () => {
  const s = atDay(5, 9);
  const run = arriveAt(s, 'hardware');
  run.zombies = [];
  const small = run.fixtures.find((f) => f.kind === 'box' && f.w * f.h === 1 && !f.lock && !f.searched);
  assert.ok(small, 'a small unlocked container at the hardware store');
  // exploration proficiency takes 6 % off per level (src/sim/explore.js searchSeconds)
  const skill = 1 - 0.06 * (s.progress.prof?.explore?.lv || 0);
  const near = (/** @type {number} */ sec, /** @type {number} */ min) => assert.ok(Math.abs(sec - min * 60 * skill) <= 1, `${sec} s for ${min} min at skill ×${skill}`);
  near(fixtureOptions(s, small.id).find((o) => o.mode === 'search').sec, 4);
  giveTool(s, ITEM.crowbar);
  const k1 = run.fixtures.find((f) => f.id === 'K1');
  near(fixtureOptions(s, 'K1').find((o) => o.mode === 'pry').sec, { 1: 4, 2: 6, 4: 8, 6: 10 }[k1.w * k1.h] + 5);

  // home containers (material piles, boxes, cabinets): a search 6, a look 3, a lockpick 6, a crowbar 10 (an action
  // lasts its spec's minutes, src/sim/furnActions.js)
  // (1724 采摘, picking a flowerpot's plant, is timed like a harvest, not a search)
  const loot = Object.values(FUNC_SPECS).filter((sp) => sp.kind === 'loot' && sp.table !== 'plant');
  assert.ok(loot.length > 10, 'the loot functions');
  assert.deepEqual([...new Set(loot.map((sp) => `${sp.mode}:${sp.min}`))].sort(), ['look:3', 'pick:6', 'pry:10', 'search:6']);
});
