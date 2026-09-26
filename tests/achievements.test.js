import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { defaultHistory } from '../src/engine/save.js';
import { dayStartT } from '../src/sim/time.js';
import { createInventory, addItem, countIn } from '../src/sim/inventory.js';
import { doorAndWindows, effectiveMaxHp } from '../src/sim/home.js';
import { homeSources } from '../src/sim/furnActions.js';
import { achievementConfig } from '../src/data/db.js';
import { emit } from '../src/engine/bus.js';
import { game } from '../src/game.js';
import {
  ACHIEVEMENTS,
  ACH_BY_ID,
  SPECIAL_IDS,
  checkAchievement,
  evaluateAchievements,
  achievementProgress,
  accumulateLifetime,
  recordEnding,
  unlockCharacter,
  canonicalEnding,
  snapshotOutbreak,
  trackTaboos,
  homeStock,
  NEXT_CHARACTER,
  TOP_DOOR,
  TOP_WINDOW,
} from '../src/meta/achievements.js';
import { enterStoryEndless, endlessDays, threatLevel, updateEndlessRecords, ENDLESS_RECIPES } from '../src/meta/endless.js';
import {
  submitTvScore,
  tvLeaderboard,
  placeRecord,
  playTrack,
  setPlayMode,
  tickRecordPlayers,
  recordMoraleHour,
  trackLengthSec,
  RECORD_IDS,
  profileSummary,
  refreshProfileAwards,
  recordDeath,
} from '../src/meta/profile.js';

const HOUR = 3600;

function run(opts = {}) {
  return newGame({ seed: 11, ...opts });
}

// Noon of post-disaster day n (the outbreak evening is Day 1).
function atDay(s, day) {
  s.phase = 'post';
  s.clock.t = dayStartT(s.clock, day) + 12 * HOUR;
  s.run.day = day;
  return s;
}

function place(s, cfg, extra = {}) {
  const uid = ++s.nextUid;
  const slot = `test:${uid}`;
  s.furniture[uid] = { uid, cfg, slot, floor: '1F', x: 0, y: 0, w: 1, h: 1, hp: 100, maxHp: 100, reinforce: 0, on: true, inv: null, data: {}, ...extra };
  s.home.slots[slot] = uid;
  return s.furniture[uid];
}

const ok = (id, s, h = defaultHistory()) => checkAchievement(id, s, h);

test('config: 93 achievements with Steam English names, descriptions and global unlock rates', () => {
  assert.equal(ACHIEVEMENTS.length, 93);
  const steamNames = new Set(achievementConfig.steam.map((x) => x.en));
  const names = new Set();
  for (const a of ACHIEVEMENTS) {
    assert.ok(a.name.en && a.name.zh, `${a.id} has names`);
    assert.ok(a.desc.en.length > 10 && a.desc.zh, `${a.id} has descriptions (hidden ones too)`);
    assert.equal(typeof a.pct, 'number', `${a.id} matched a Steam entry`);
    assert.ok(steamNames.has(a.name.en));
    names.add(a.name.en);
    assert.ok(SPECIAL_IDS.includes(a.id) || (a.counter && a.threshold > 0), `${a.id} has a predicate`);
  }
  assert.equal(names.size, 93, 'every Steam achievement is used once');
  assert.equal(ACH_BY_ID[2202].name.en, 'Meat Grinder');
  assert.match(ACH_BY_ID[2202].desc.en, /400/, 'config threshold wins over the Steam text (500)');
  assert.match(ACH_BY_ID[2208].desc.en, /8 rats/);
  assert.equal(ACH_BY_ID[2202].scope, 'run');
  assert.equal(ACH_BY_ID[2108].scope, 'life');
});

test('days survived after the disaster (1001-1008)', () => {
  const s = run();
  assert.equal(ok(1001, s), false, 'not before the outbreak');
  atDay(s, 1);
  assert.equal(ok(1001, s), false, 'the outbreak evening is still Day 1');
  atDay(s, 2);
  assert.equal(ok(1001, s), true);
  assert.equal(ok(1002, s), false);
  atDay(s, 8);
  assert.equal(ok(1002, s), true);
  atDay(s, 31);
  assert.equal(ok(1003, s), true);
  assert.equal(ok(1004, s), false);
  atDay(s, 51);
  assert.equal(ok(1004, s), true);
  atDay(s, 69);
  assert.equal(ok(1005, s), false);
  s.story.tags.TAG_RECKONING = true;
  assert.equal(ok(1005, s), true, 'Day of Reckoning replies');
  delete s.story.tags.TAG_RECKONING;
  atDay(s, 70);
  assert.equal(ok(1005, s), true);
  assert.equal(ok(1007, s), false);
  s.story.tags.TAG_FINAL_WAVE_SURVIVED = true;
  assert.equal(ok(1007, s), true);
  atDay(s, 100);
  assert.equal(ok(1008, s), false);
  atDay(s, 101);
  assert.equal(ok(1008, s), true);
  assert.deepEqual(achievementProgress(1003, atDay(run(), 12), defaultHistory()), { value: 11, target: 30, raw: 11 });
});

test('pre-disaster stockpile, money at the outbreak and shopping variety (2001-2007)', () => {
  const s = run();
  s.progress.counters['pre.kg'] = 5;
  assert.equal(ok(2001, s), false, 'needs more than 5 kg');
  s.progress.counters['pre.kg'] = 5.2;
  assert.equal(ok(2001, s), true);
  s.progress.counters['pre.kg'] = 25;
  assert.equal(ok(2002, s), false);
  s.progress.counters['pre.kg'] = 26;
  assert.equal(ok(2002, s), true);
  assert.equal(ok(2003, s), false);
  s.progress.counters['pre.kg'] = 51;
  assert.equal(ok(2003, s), true);

  const t = run();
  assert.equal(t.progress.snap.baseKg >= 0, true, 'baseline weight captured at the start');
  const bp = t.inventories[t.player.backpack];
  for (let i = 0; i < 6; i++) addItem(t, bp, 41000); // 6 x 200 g
  const stocked = checkAchievement(2001, t, defaultHistory());
  assert.equal(stocked, false, '1.2 kg is not enough');
  for (let i = 0; i < 20; i++) addItem(t, bp, 2115); // 20 kg of cans
  assert.equal(ok(2001, t), true, 'own weight tracking while shopping');

  const m = run();
  m.player.money = 40;
  assert.equal(ok(2004, m), false, 'judged at the outbreak');
  snapshotOutbreak(m);
  m.phase = 'post';
  assert.equal(ok(2004, m), true);
  m.progress.snap.money = 60;
  assert.equal(ok(2004, m), false);
  assert.equal(ok(2004, run({ mode: 'pureEndless' })), false, 'no pre-disaster phase in Pure Endless');

  const v = run();
  v.pre.visited = ['a', 'b', 'c', 'd'];
  assert.equal(ok(2005, v), false);
  v.pre.visited.push('e');
  assert.equal(ok(2005, v), true);
  v.pre.foodTypes = Array.from({ length: 20 }, (_, i) => i);
  v.pre.matTypes = [1, 2, 3, 4];
  assert.equal(ok(2006, v), true);
  assert.equal(ok(2007, v), true);
});

test('condition: every stat at 80 (2008) and caps beyond 150 (2011/2012)', () => {
  const s = run();
  Object.assign(s.player.stats, { sat: 80, sta: 85, mor: 90, life: 100 });
  assert.equal(ok(2008, s), true);
  s.player.stats.mor = 79;
  assert.equal(ok(2008, s), false);
  s.player.max.sat = 151;
  assert.equal(ok(2011, s), true);
  assert.equal(ok(2012, s), false);
  s.player.max.sta = 160;
  s.player.max.mor = 155;
  assert.equal(ok(2012, s), true);
  const t = run();
  t.progress.maxOver150 = 3;
  assert.equal(ok(2012, t), true, 'the stats system records the best simultaneous count');
});

test('production counters use config thresholds; "this loop" achievements ignore other loops', () => {
  const s = run();
  const h = defaultHistory();
  const c = s.progress.counters;
  c['cook.count'] = 29;
  assert.equal(ok(2102, s, h), false);
  c['cook.count'] = 30;
  assert.equal(ok(2102, s, h), true);
  c['cook.count'] = 5;
  h.counters['cook.count'] = 100;
  assert.equal(ok(2102, s, h), false, 'Home-Style Cooking counts this loop only');
  assert.equal(ok(2101, s, h), true);
  h.counters['cook.perfect'] = 10;
  assert.equal(ok(1212, s, h), true, 'A Good Meal counts every loop');
  assert.equal(ok(2103, s, h), false);
  c['plant.perfect'] = 10;
  c['craft.total'] = 100;
  c.ratCatch = 8;
  c['explore.points.distinct'] = 4;
  c['explore.total'] = 15;
  c['drone.foraging.count'] = 25;
  c['plant.harvest.flower'] = 10;
  c['group.reply'] = 12;
  for (const id of [2106, 2109, 2208, 2302, 2303, 2308, 9003, 9001]) assert.equal(ok(id, s, h), true, `${id}`);
  c.ratCatch = 7;
  assert.equal(ok(2208, s, defaultHistory()), false);
  assert.deepEqual(achievementProgress(2308, s, h), { value: 25, target: 25, raw: 25 });
});

test('lifetime counters fold into history once per increase', () => {
  const h = defaultHistory();
  const a = run();
  a.progress.counters['trap.catch'] = 20;
  evaluateAchievements(a, h, 1);
  assert.equal(h.counters['trap.catch'], 20);
  assert.equal(h.achievements[2108], undefined);
  evaluateAchievements(a, h, 2);
  assert.equal(h.counters['trap.catch'], 20, 'no double counting');
  const b = run();
  b.progress.counters['trap.catch'] = 12;
  const fresh = evaluateAchievements(b, h, 3);
  assert.equal(h.counters['trap.catch'], 32);
  assert.ok(fresh.includes(2108), 'Indoor Hunter: 30 prey in total');
  b.progress.counters['trap.catch'] = 13;
  assert.equal(accumulateLifetime(b, h), true);
  assert.equal(h.counters['trap.catch'], 33);
});

test('kills: Meat Grinder 400 and Mountain of Corpses 2000 count this loop only', () => {
  const s = run();
  const h = defaultHistory();
  h.counters['zombie.kill'] = 5000;
  s.progress.counters['zombie.kill'] = 10;
  assert.equal(ok(2201, s, h), true);
  assert.equal(ok(2202, s, h), false);
  s.progress.counters['zombie.kill'] = 399;
  assert.equal(ok(2202, s, h), false);
  s.progress.counters['zombie.kill'] = 400;
  assert.equal(ok(2202, s, h), true);
  assert.equal(ok(2405, s, h), false);
  s.progress.counters['zombie.kill'] = 2000;
  assert.equal(ok(2405, s, h), true);
  const t = run();
  t.progress.kills = 400;
  assert.equal(ok(2202, t), true, 'falls back to progress.kills');
  assert.deepEqual(achievementProgress(2202, run(), h), { value: 0, target: 400, raw: 0 });
});

test('defense: triple line, iron wall, door held, zero breach and the worn-door taboo', () => {
  const s = atDay(run(), 10);
  for (let i = 0; i < 4; i++) place(s, 36002);
  for (let i = 0; i < 4; i++) place(s, 36003);
  for (let i = 0; i < 3; i++) place(s, 36004);
  assert.equal(ok(2203, s), false);
  assert.equal(achievementProgress(2203, s, defaultHistory()).value, 11);
  place(s, 36004);
  assert.equal(ok(2203, s), true);

  assert.equal(ok(2205, s), false, 'starter door and windows');
  const openings = doorAndWindows(s);
  assert.ok(openings.length >= 2);
  for (const f of openings) f.cfg = f.slot.includes('door') ? TOP_DOOR : TOP_WINDOW;
  assert.equal(ok(2205, s), true);

  s.progress.counters['crisis.doorHeld80'] = 1;
  assert.equal(ok(2204, s), true);

  s.story.tags.TAG_FINAL_WAVE_SURVIVED = true;
  s.progress.counters['siege.final.kill'] = 40;
  assert.equal(ok(2207, s), true);
  s.progress.taboo.siegeDoorWorn = true;
  assert.equal(ok(2207, s), false);

  const w = atDay(run(), 5);
  trackTaboos(w);
  assert.equal(w.progress.taboo.doorWorn, undefined);
  const door = doorAndWindows(w)[0];
  door.hp = effectiveMaxHp(door) * 0.6;
  trackTaboos(w);
  assert.equal(w.progress.taboo.doorWorn, true);
  assert.equal(w.progress.taboo.siegeDoorWorn, undefined, 'not during the final siege');
});

test('challenge endings need an ending this loop without their taboo (3001-3008)', () => {
  const ids = [3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008];
  const clean = atDay(run(), 86);
  for (const id of ids) assert.equal(ok(id, clean), false, `${id} needs an ending`);
  clean.progress.ending = 'fortress';
  for (const id of ids) assert.equal(ok(id, clean), true, `${id} on a clean loop`);
  const broken = [
    [3001, (s) => (s.loop.rebirths = 1)],
    [3001, (s) => (s.progress.taboo.rebirth = true)],
    [3002, (s) => (s.progress.taboo.explore = true)],
    [3002, (s) => (s.progress.counters['explore.total'] = 1)],
    [3003, (s) => (s.progress.taboo.overspend = true)],
    [3003, (s) => (s.pre.spent = s.pre.budget * 0.6)],
    [3004, (s) => (s.progress.taboo.doorWorn = true)],
    [3005, (s) => (s.progress.taboo.meat = true)],
    [3006, (s) => (s.progress.taboo.trade = true)],
    [3006, (s) => (s.progress.counters['trade.active.dealcount'] = 1)],
    [3007, (s) => (s.progress.taboo.neighbor = true)],
    [3008, (s) => (s.progress.taboo.lowVitality = true)],
  ];
  for (const [id, spoil] of broken) {
    const s = atDay(run(), 86);
    s.progress.ending = 'survival';
    spoil(s);
    assert.equal(ok(id, s), false, `${id} broken`);
  }
  const phaseOnly = atDay(run(), 101);
  phaseOnly.phase = 'ending';
  assert.equal(ok(3005, phaseOnly), true, 'the ending phase counts as an ending');
});

test('endings from history: stories, Three Stages of Life and All Roads (1101-1114)', () => {
  assert.equal(canonicalEnding('lieFlat'), 'lastOne');
  assert.equal(canonicalEnding('lastOne'), 'lastOne', 'ending ids of src/content/endings.js');
  assert.equal(canonicalEnding('shelter'), 'fortress');
  assert.equal(canonicalEnding(9), 'truth');
  assert.equal(canonicalEnding('ENDING_RESCUE'), 'evacuate');
  assert.equal(canonicalEnding('TAG_LINE_SUPPLY_CHOSEN'), 'supply');
  const h = defaultHistory();
  assert.equal(recordEnding(h, 'truth', 'wage'), 'truth');
  assert.equal(ok(1105, null, h), true);
  assert.equal(ok(1110, null, h), true);
  assert.equal(ok(1111, null, h), false);
  assert.deepEqual(achievementProgress(1113, null, h), { value: 1, target: 3, raw: 1 });
  recordEnding(h, 'greenhouse', 'student');
  assert.equal(ok(1113, null, h), false);
  recordEnding(h, 'supplyHub', 'warehouse');
  assert.equal(ok(1113, null, h), true);
  assert.equal(ok(1108, null, h), true);
  assert.equal(ok(1114, null, h), false);
  for (const id of ['evacuate', 'girl', 'net', 'safehouse', 'truth', 'companionship', 'lastOneStanding']) recordEnding(h, id, 'wage');
  assert.deepEqual(achievementProgress(1114, null, h), { value: 9, target: 9, raw: 9 });
  assert.equal(ok(1114, null, h), true);
  assert.deepEqual(Object.keys(h.endings).sort(), ['companion', 'evacuate', 'fortress', 'girl', 'greenhouse', 'lastOne', 'stranger', 'supply', 'truth']);

  const s = atDay(run({ character: 'wage' }), 86);
  s.progress.ending = 'girl';
  const empty = defaultHistory();
  assert.equal(ok(1102, s, empty), true, 'the current run ending counts before it is recorded');
  assert.equal(ok(1110, s, empty), true);
});

test('character unlocks from events and endings', () => {
  const h = defaultHistory();
  assert.equal(unlockCharacter(h, 'student'), true);
  assert.equal(unlockCharacter(h, 'student'), false);
  assert.equal(unlockCharacter(h, 'nobody'), false);
  assert.equal(NEXT_CHARACTER.wage, 'student');
  assert.equal(NEXT_CHARACTER.student, 'warehouse');

  game.history = defaultHistory();
  emit('unlockCharacter', { id: 'warehouse' });
  assert.equal(game.history.characters.warehouse, true);
  emit('endingReached', { id: 'truth', character: 'wage' });
  assert.equal(game.history.endings.truth, true);
  assert.equal(game.history.endingsByChar.wage.truth, true);
  assert.equal(game.history.characters.student, true, 'an ending unlocks the next identity');
  emit('endingReached', { id: 'mystery', character: 'student', achievement: 1109 });
  assert.equal(game.history.endingsByChar.student.lastOne, true, 'the payload achievement id wins');
});

test('endless states (2401-2404), Pure Endless setup and Story Endless', () => {
  const story = atDay(run(), 20);
  assert.equal(ok(2401, story), false);

  const pure = run({ mode: 'pureEndless', endlessAlloc: { sat: 2, mor: 1 }, endlessPoints: 6 });
  assert.equal(pure.phase, 'post');
  assert.equal(pure.meta.endlessState, 3);
  assert.equal(pure.player.max.sat, 110);
  assert.equal(pure.player.max.mor, 105);
  assert.ok(countIn(pure, homeSources(pure), 41000) >= 4, 'starter kit in the backpack');
  assert.ok(pure.floorBoxes.length > 0, 'furniture packages and materials at the door');
  for (const id of ENDLESS_RECIPES) assert.ok(pure.run.unlockedRecipes.includes(id));
  assert.equal(ok(2401, pure), true);
  assert.equal(ok(2402, pure), false);
  atDay(pure, 30);
  assert.equal(endlessDays(pure), 29);
  assert.equal(ok(2403, pure), false);
  atDay(pure, 31);
  assert.equal(ok(2403, pure), true);
  pure.crises.threat = 7;
  assert.equal(ok(2404, pure), false);
  pure.crises.threat = 8;
  assert.equal(ok(2404, pure), true);
  delete pure.crises.threat;
  atDay(pure, 36);
  assert.equal(threatLevel(pure), 8, 'fallback threat rises every 5 endless days');

  const h = defaultHistory();
  assert.equal(updateEndlessRecords(pure, h), true);
  assert.equal(h.endless.best.wage, 35);
  assert.equal(h.endless.maxThreat, 8);
  assert.equal(h.endless.bestPure.wage, 35);

  const after = atDay(run(), 101);
  after.progress.ending = 'survival';
  after.phase = 'ending';
  assert.equal(enterStoryEndless(after), true);
  assert.equal(after.meta.mode, 'endless');
  assert.equal(after.phase, 'post');
  assert.equal(ok(2401, after), true);
  assert.equal(ok(2402, after), true);
  assert.equal(ok(2403, atDay(after, 140)), false, 'Hold Out needs Pure Endless');
});

test('home and life: planters, inventory check and family assets (1211, 1221, 2009)', () => {
  const s = atDay(run(), 20);
  assert.equal(ok(1211, s), false);
  s.progress.counters.PlantPotCount = 24;
  assert.equal(ok(1211, s), true);

  const t = atDay(run(), 20);
  assert.equal(ok(1221, t), false);
  const invs = [];
  for (let i = 0; i < 8; i++) {
    const inv = createInventory(t, { kind: 'furniture', w: 20, h: 20 });
    place(t, 10000, { inv: inv.id });
    invs.push(inv);
  }
  for (let i = 0; i < 60; i++) addItem(t, invs[i % 8], 2115);
  for (let i = 0; i < 120; i++) addItem(t, invs[i % 8], 20001);
  const st = homeStock(t);
  assert.ok(st.sat >= 1200 && st.items >= 180 && st.storage >= 8, JSON.stringify(st));
  assert.equal(ok(1221, t), true);
  assert.equal(ok(2009, t), homeStock(t).sat > 2000);
  for (let i = 0; i < 45; i++) addItem(t, invs[i % 8], 2115);
  assert.equal(ok(2009, t), true);
});

test('TV Enthusiast reads the best score of any mini-game; misc hidden achievements', () => {
  const s = atDay(run({ character: 'student' }), 12);
  const h = defaultHistory();
  const r = submitTvScore(s, h, 'invaders', 64);
  assert.equal(r.record, true);
  assert.ok(r.reward.mor > 0, 'first game of the day gives Morale');
  assert.equal(submitTvScore(s, h, 'snake', 12).reward, null, 'once per day');
  assert.equal(ok(9002, s, h), false);
  submitTvScore(s, h, 'breakout', 71);
  assert.equal(h.tvBest.breakout, 71);
  assert.equal(s.progress.counters['tvgame.best'], 71);
  assert.equal(ok(9002, null, h), true, 'history alone is enough');
  const board = tvLeaderboard('invaders', 'student', 64);
  const wageBoard = tvLeaderboard('invaders', 'wage', 64);
  assert.ok(board[0].score < wageBoard[0].score, 'student NPC scores are lower');
  assert.ok(board.some((row) => row.you && row.score === 64));
  s.progress.counters['bath.ice'] = 1;
  s.progress.counters['cook.midnight'] = 1;
  assert.equal(ok(9005, s, h), true);
  assert.equal(ok(9006, s, h), true);
});

test('record player: placing unlocks a track, auto-change, single loop and Morale while playing', () => {
  const s = atDay(run(), 15);
  const f = place(s, 70002);
  const bp = s.inventories[s.player.backpack];
  addItem(s, bp, RECORD_IDS[0]);
  addItem(s, bp, RECORD_IDS[3]);
  assert.equal(playTrack(s, f.uid), false, 'nothing placed yet');
  assert.equal(placeRecord(s, f.uid, RECORD_IDS[0]), true);
  assert.equal(countIn(s, [bp.id], RECORD_IDS[0]), 0, 'the disc goes into the player');
  assert.equal(placeRecord(s, f.uid, RECORD_IDS[1]), false, 'not owned');
  placeRecord(s, f.uid, RECORD_IDS[3]);
  assert.deepEqual(f.data.tracks, [RECORD_IDS[0], RECORD_IDS[3]]);
  assert.equal(playTrack(s, f.uid, RECORD_IDS[0]), true);
  tickRecordPlayers(s, trackLengthSec(RECORD_IDS[0]));
  assert.equal(f.data.playing, false, 'stops after one side by default');
  setPlayMode(s, f.uid, 'auto');
  playTrack(s, f.uid, RECORD_IDS[0]);
  tickRecordPlayers(s, trackLengthSec(RECORD_IDS[0]));
  assert.equal(f.data.playing, true);
  assert.equal(RECORD_IDS[f.data.track], RECORD_IDS[3], 'auto-change skips to the next unlocked record');
  setPlayMode(s, f.uid, 'loop');
  assert.equal(f.data.auto, false);
  tickRecordPlayers(s, trackLengthSec(RECORD_IDS[3]));
  assert.equal(RECORD_IDS[f.data.track], RECORD_IDS[3], 'single loop repeats the record');
  f.data.track = 1; // "Next" from the context menu may land on a locked record
  tickRecordPlayers(s, 60);
  assert.equal(RECORD_IDS[f.data.track], RECORD_IDS[3]);
  s.player.stats.mor = 50;
  assert.equal(recordMoraleHour(s), 2);
  f.powered = false;
  tickRecordPlayers(s, 60);
  assert.equal(f.data.playing, false, 'no power, no music');
  assert.equal(recordMoraleHour(s), 0);
});

test('evaluateAchievements unlocks once with a timestamp; profile badges and titles follow', () => {
  const s = atDay(run(), 8);
  const h = defaultHistory();
  const fresh = evaluateAchievements(s, h, 1234);
  assert.ok(fresh.includes(1001) && fresh.includes(1002));
  assert.equal(h.achievements[1001], 1234);
  assert.deepEqual(evaluateAchievements(s, h, 99), []);
  assert.equal(refreshProfileAwards(h), true);
  assert.ok(h.profile.badges.includes('survival:bronze'));
  assert.ok(h.profile.titles.includes('newcomer'));
  recordDeath(h, s, 'life');
  const p = profileSummary(h, s);
  assert.equal(p.deaths, 1);
  assert.equal(p.longest.wage.any, 7);
  assert.equal(p.unlocked, 2);
  assert.ok(p.dimensions.survival > 0);
  assert.ok('defenseLine' in p.dimensions);
  assert.equal(achievementProgress(1001, null, h), null, 'no run, no day progress');
});
