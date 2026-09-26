// Fixes for audited gaps: O02, Q01, Q10, R03, S05 and the other findings of docs/audit/part-O-T.md (Light Sleeper,
// Deep Cultivation, Pulled Through) plus the SFX hooks of A14 (docs/audit/part-A-F.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/sim/furnActions.js';
import '../src/sim/weather.js';
import '../src/sim/crafting.js';
import '../src/sim/horde.js';
import '../src/sim/unlocks.js';
import '../src/sim/social.js';
import '../src/sim/phone.js';
import '../src/sim/story.js';
import '../src/sim/settlement.js';
import { newGame, newLoopData } from '../src/sim/state.js';
import { tick } from '../src/sim/tick.js';
import { dayStartT, dayNumber } from '../src/sim/time.js';
import { furnitureFunctions, startFurnitureFunction, homeSources } from '../src/sim/furnActions.js';
import { homeFurniture, installFurniture, furnitureAt, dismantle } from '../src/sim/home.js';
import { addItem, countIn, createInventory } from '../src/sim/inventory.js';
import { getObjectives } from '../src/sim/objectives.js';
import { addProfExp } from '../src/sim/proficiency.js';
import { applyCard, ledgerTotals, COUNTER_LABELS } from '../src/sim/settlement.js';
import { summonHorde, startThugs } from '../src/sim/horde.js';
import { triggerEnding } from '../src/sim/endings.js';
import {
  social, neighborState, repairBasket, sendBasket, basketInventory, listDrones, rescueDeliver, wmState, veteranState, giveVeteran,
} from '../src/sim/social.js';
import { ensureThread, sendSms, postGroup, toggleVibrate, groupShareFood } from '../src/sim/phone.js';
import { packageToFurniture } from '../src/data/db.js';
import { HOMES } from '../src/content/homes.js';
import { CHARACTERS } from '../src/content/characters.js';
import { emit, on } from '../src/engine/bus.js';
import { sfxLog } from '../src/engine/audio.js';
import { defaultHistory } from '../src/engine/save.js';
import { game } from '../src/game.js';
import { checkAchievement, achievementProgress, accumulateLifetime, nextCharacterUnlock } from '../src/meta/achievements.js';
import { profileSummary } from '../src/meta/profile.js';
import { ENDLESS_UNLOCK_ORDER, unlockTasks } from '../src/meta/endless.js';

const HOUR = 3600;

function postGame(character = 'wage', seed = 301, opts = {}) {
  const s = newGame({ seed, character, ...opts });
  s.phase = 'post';
  s.clock.t = s.clock.outbreakAt; // 18:00, Day 1
  s.run.day = 1;
  return s;
}

function keepAlive(s) {
  Object.assign(s.player.stats, { sat: 100, sta: 100, mor: 100, life: 100 });
}

function advance(s, hours, step = HOUR) {
  for (let t = 0; t < hours * HOUR && s.phase === 'post'; t += step) {
    keepAlive(s);
    tick(s, step);
  }
}

// Jump to `hour` on `day`; run.day is left one behind so every onDay hook fires for that day.
function jumpTo(s, day, hour = 9) {
  s.clock.t = dayStartT(s.clock, day) + hour * HOUR - 1800;
  s.run.day = day - 1;
  advance(s, 1);
}

function give(s, id, n = 1) {
  const bp = s.inventories[s.player.backpack];
  const picks = [];
  for (let i = 0; i < n; i++) picks.push({ inv: bp.id, uid: addItem(s, bp, id, { allowOverweight: true }).uid });
  return picks;
}

function installDrone(s, slot = '1F:lt1') {
  const old = furnitureAt(s, slot);
  if (old) dismantle(s, old.uid);
  const r = installFurniture(s, packageToFurniture[14023], slot);
  assert.ok(r.ok, `drone installs into ${slot}`);
  return listDrones(s).find((d) => d.uid === r.f.uid);
}

function record(events) {
  const seen = Object.fromEntries(events.map((ev) => [ev, []]));
  const offs = events.map((ev) => on(ev, (p) => seen[ev].push(p)));
  return { seen, stop: () => offs.forEach((off) => off()) };
}

const endlessTasks = (s) => getObjectives(s).filter((o) => o.id.startsWith('endless:'));

// ---------------------------------------------------------------------------------------------- O02
test('O02 new messages ring the phone, or buzz in vibrate mode; silent messages make no sound', () => {
  const s = postGame('wage', 302);
  ensureThread(s, 'test', { name: { en: 'Tester', zh: '测试' } });
  sfxLog.length = 0;
  sendSms(s, 'test', { text: { en: 'Hello', zh: '你好' } });
  assert.deepEqual(sfxLog, ['ring']);
  toggleVibrate(s);
  sendSms(s, 'test', { text: { en: 'Again', zh: '又来' } });
  postGroup(s, { author: 1, text: { en: 'Anyone there?', zh: '有人吗？' } });
  assert.deepEqual(sfxLog, ['ring', 'vibrate', 'vibrate'], 'vibrate mode buzzes instead of ringing, group chat included');
  sendSms(s, 'test', { text: { en: 'Shh', zh: '嘘' }, silent: true });
  emit('phoneMessage', { thread: 'test', sound: 'ring', silent: true });
  assert.equal(sfxLog.length, 3, 'silent messages stay quiet');
});

// ---------------------------------------------------------------------------------------------- A14
test('A14 horde events drive the sounds: spawns, the arrival, door bangs, spikes and chainsaws, each throttled', () => {
  const s = postGame('wage', 303);
  jumpTo(s, 3, 21);
  assert.ok(installFurniture(s, 36004, '1F:d1').ok, 'chainsaw beside the door');
  assert.ok(installFurniture(s, 36002, '1F:d2').ok, 'spikes on the other side');
  const events = ['hordeStart', 'zombieSpawned', 'hordeArrived', 'openingHit', 'chainsawHit', 'defenseHit'];
  const times = Object.fromEntries(events.map((ev) => [ev, []]));
  const offs = events.map((ev) => on(ev, (p) => times[ev].push({ t: s.clock.t, ...p })));
  sfxLog.length = 0;
  const h = summonHorde(s, { size: 16, kind: 'lure', hours: 4 });
  assert.ok(sfxLog.includes('groan'), 'the horde groans as it arrives');
  for (let i = 0; i < 80 && s.crises.horde; i++) {
    keepAlive(s);
    tick(s, 180);
  }
  offs.forEach((off) => off());
  assert.equal(times.hordeStart.length, 1);
  assert.ok(times.zombieSpawned.length >= 2, 'one cue per spawn batch, not per zombie');
  assert.equal(times.zombieSpawned.reduce((n, e) => n + e.n, 0), h.spawned);
  assert.equal(times.hordeArrived.length, 1, 'the horde arrives at the door once');
  assert.ok(times.openingHit.length >= 1 && times.openingHit.every((e) => e.slot === '1F:door' || e.slot.startsWith('1F:win')), 'door and window bangs');
  assert.ok(times.chainsawHit.length >= 1 && times.chainsawHit.every((e) => e.device === 'chainsaw'), 'the chainsaw cuts');
  assert.ok(times.defenseHit.some((e) => e.device === 'spike'), 'the spikes bite');
  for (const ev of ['openingHit', 'chainsawHit']) {
    const t = times[ev].map((e) => e.t);
    assert.ok(t.every((v, i) => i === 0 || v - t[i - 1] >= 45), `${ev} at most once per 45 game seconds`);
  }
  for (const name of ['door', 'chainsaw']) assert.ok(sfxLog.includes(name), `${name} played`);
});

test('A14 the drone whirs when it takes off and when it comes back', () => {
  const s = postGame('wage', 319);
  s.crises.disabled = true;
  const d = installDrone(s);
  const heard = [];
  const offs = ['droneDispatched', 'droneReturned'].map((ev) => on(ev, () => heard.push([ev, sfxLog.at(-1)])));
  assert.ok(startFurnitureFunction(s, d.uid, 1754), 'send it scavenging');
  advance(s, 5);
  offs.forEach((off) => off());
  assert.deepEqual(heard, [['droneDispatched', 'drone'], ['droneReturned', 'drone']]);
});

test('A14 thunderstorm days roll thunder for the audio system; other days stay quiet', () => {
  const s = postGame('wage', 304);
  s.crises.disabled = true;
  jumpTo(s, 5, 6);
  const { seen, stop } = record(['thunder']);
  const at = [];
  const off = on('thunder', () => at.push(s.clock.t));
  sfxLog.length = 0;
  s.weather.today.kind = 'storm';
  advance(s, 8, 300);
  const storm = seen.thunder.length;
  assert.ok(storm >= 5 && storm <= 32, `a thunderclap every 15-50 minutes (${storm} in 8 hours)`);
  assert.ok(at.every((t, i) => i === 0 || t - at[i - 1] >= 15 * 60), 'never back to back');
  assert.ok(sfxLog.includes('thunder'));
  s.weather.today.kind = 'rain';
  advance(s, 6, 300);
  stop();
  off();
  assert.equal(seen.thunder.length, storm, 'plain rain has no thunder');
});

// ---------------------------------------------------------------------------------------------- Light Sleeper
test('Light Sleeper wakes up when a horde, wandering zombies or thugs come; a heavy sleeper sleeps on', () => {
  const asleep = (abilities) => {
    const s = postGame('wage', 305, { loop: { ...newLoopData(), abilities } });
    s.crises.disabled = true;
    jumpTo(s, 22, 23);
    s.crises.disabled = false;
    const bed = homeFurniture(s)
      .map((f) => [f, furnitureFunctions(s, f).find((fn) => fn.spec.kind === 'sleep' && fn.enabled)])
      .find(([, fn]) => fn);
    assert.ok(bed, 'a bed to sleep in');
    assert.ok(startFurnitureFunction(s, bed[0].uid, bed[1].key));
    for (let i = 0; i < 20 && !s.player.sleeping; i++) tick(s, 60);
    assert.equal(s.player.sleeping, true, 'fell asleep');
    return s;
  };
  const light = asleep({ lightSleeper: 1 });
  const woke = [];
  const off = on('toast', (p) => woke.push(p.text));
  summonHorde(light, { size: 4, kind: 'lure' });
  off();
  assert.equal(light.player.sleeping, false, 'the horde wakes a light sleeper');
  assert.notEqual(light.actions.current?.kind, 'sleep');
  assert.ok(woke.some((t) => /jolt awake/.test(t)));

  const heavy = asleep({});
  summonHorde(heavy, { size: 4, kind: 'lure' });
  assert.equal(heavy.player.sleeping, true, 'without the ability the survivor sleeps through the start of the attack');

  const zombies = asleep({ lightSleeper: 1 });
  zombies.crises.sporadic = { at: zombies.clock.t, n: 1 };
  tick(zombies, 30);
  assert.ok(zombies.zombies.some((z) => z.src === 'sporadic'));
  assert.equal(zombies.player.sleeping, false, 'wandering zombies at the door wake a light sleeper');

  const thugs = asleep({ lightSleeper: 1 });
  startThugs(thugs);
  assert.equal(thugs.player.sleeping, false, 'so does pounding on the door');
});

// ---------------------------------------------------------------------------------------------- Deep Cultivation, 2206
test('Deep Cultivation adds its planting exp right after the card is bought (no stale modifier cache)', () => {
  const s = postGame('wage', 306);
  const p = s.progress.prof.plant;
  addProfExp(s, 'plant', 10);
  const plain = p.exp;
  applyCard(s, 'deepCultivation');
  addProfExp(s, 'plant', 10);
  assert.ok(Math.abs(p.exp - plain - 13) < 1e-9, `+30% planting exp (${p.exp - plain})`);
});

test('2206 Pulled Through counts only hordes survived in endless mode', () => {
  const story = postGame('wage', 307);
  story.progress.hordesSurvived = 40;
  story.progress.counters['horde.survived'] = 40;
  const h = defaultHistory();
  assert.equal(checkAchievement(2206, story, h), false, 'forty story hordes do not count');
  accumulateLifetime(story, h);
  assert.equal(h.counters['wave.survived'] || 0, 0, 'nor do they add up across loops');
  assert.equal(h.counters['horde.survived'], 40, 'the archive still counts every horde');
  assert.equal(profileSummary(h, story).stats.find((x) => x.key === 'horde.survived').value, 40);

  const endless = newGame({ seed: 308, character: 'wage', mode: 'pureEndless' });
  for (let i = 0; i < 29; i++) endless.crises.history.push({ type: 'horde', kind: 'endless', id: `endless-${i}`, survived: true });
  endless.crises.history.push({ type: 'horde', kind: 'bait', id: 'bait-1', survived: true });
  assert.deepEqual(achievementProgress(2206, endless, defaultHistory()), { value: 29, target: 30, raw: 29 });
  endless.progress.counters['wave.survived'] = 30;
  assert.equal(checkAchievement(2206, endless, defaultHistory()), true);
});

// ---------------------------------------------------------------------------------------------- Q01
test('Q01 the neighbor, a network survivor and the veteran leave Planning Points scaled by the deliveries they got', () => {
  const s = postGame('wage', 309);
  s.crises.disabled = true;
  advance(s, 1);
  assert.ok(repairBasket(s));
  const n = neighborState(s);
  for (let i = 0; i < 2; i++) {
    basketInventory(s).items.length = 0;
    addItem(s, basketInventory(s), 2105);
    assert.ok(sendBasket(s).ok);
  }
  n.foodDays = 0;
  for (let day = 2; day <= 6 && n.alive; day++) jumpTo(s, day, 9);
  assert.equal(n.alive, false);
  const row = s.run.pointsLedger.find((r) => r.kind === 'departed' && r.note === n.id);
  assert.equal(row?.amount, 5 + 2 * 2, '5 + 2 per basket delivery');

  const sv = social(s).survivors.find((x) => !x.unknown);
  Object.assign(sv, { status: 'network', inNetwork: true, food: 0, deliveries: 3 });
  const before = ledgerTotals(s).departed;
  const points = s.loop.planningPoints;
  jumpTo(s, 7, 9);
  assert.equal(sv.alive, false);
  assert.equal(ledgerTotals(s).departed - before, 5 + 2 * 3);
  assert.ok(s.loop.planningPoints >= points + 11, 'credited to the balance at once');
  assert.deepEqual(s.run.settlement.rows.find((r) => r.kind === 'departed'), { kind: 'departed', amount: 11 }, 'and listed on that morning\'s settlement');

  const w = postGame('warehouse', 310);
  w.crises.disabled = true;
  advance(w, 1);
  jumpTo(w, 6, 9);
  const v = veteranState(w);
  assert.ok(v);
  assert.ok(giveVeteran(w, give(w, 2105)).ok);
  for (let day = 7; day <= 16 && !v.gone; day++) jumpTo(w, day, 9);
  assert.equal(v.gone, true, 'the veteran starved');
  assert.equal(ledgerTotals(w).departed, 5 + 2 * 1);
});

// ---------------------------------------------------------------------------------------------- Q10
test('Q10 one ending unlocks exactly one character: the next identity, else the next locked one; story unlocks never cascade', async () => {
  game.history = defaultHistory();
  const first = postGame('wage', 311);
  game.state = first;
  triggerEnding(first, 'lastOne');
  assert.equal(game.history.characters.student, true, 'a Wage Slave ending unlocks the College Student');
  assert.notEqual(game.history.characters.warehouse, true, 'and nobody else');

  emit('unlockCharacter', { id: 'student', reason: 'neighbor' });
  assert.notEqual(game.history.characters.warehouse, true, 'the neighbor line only ever unlocks the Student');

  const second = postGame('wage', 312);
  game.state = second;
  triggerEnding(second, 'lastOne');
  assert.equal(game.history.characters.warehouse, true, 'the next Wage Slave ending unlocks the Warehouse Manager');
  assert.equal(nextCharacterUnlock(game.history, 'wage'), null, 'everyone is unlocked');
  game.state = null;

  await new Promise((r) => setTimeout(r, 0));
  game.history = defaultHistory();
  game.history.characters.student = true;
  emit('unlockCharacter', { id: 'student' });
  assert.equal(game.history.characters.warehouse, true, 'an ending unlock for a taken identity falls through to the next locked one');
  game.history = defaultHistory();
  emit('unlockCharacter', { next: true });
  assert.equal(game.history.characters.student, true, '{ next: true } picks the first locked character');
  assert.match(CHARACTERS.warehouse.unlockHint.en, /any ending once the College Student is unlocked/);
});

// ---------------------------------------------------------------------------------------------- S05
test('S05 basket deliveries, rescue drops, veteran meals and shared group-chat food all count as aid', () => {
  const wage = postGame('wage', 313);
  wage.crises.disabled = true;
  advance(wage, 1);
  repairBasket(wage);
  addItem(wage, basketInventory(wage), 2105);
  assert.ok(sendBasket(wage).ok);
  assert.equal(wage.progress.counters['survivor.aid'], 1, 'a basket across the rooftops');
  jumpTo(wage, 12, 12);
  addItem(wage, wage.inventories[wage.player.backpack], 2105);
  assert.ok(groupShareFood(wage, 'd12', 'deliver').ok);
  assert.equal(wage.progress.counters['survivor.aid'], 2, 'a portion for the neighbors in the group chat');

  const student = postGame('student', 314);
  student.crises.disabled = true;
  const d = installDrone(student);
  advance(student, 1);
  give(student, 9014);
  advance(student, 1);
  assert.ok(wmState(student)?.active);
  assert.ok(rescueDeliver(student, { drone: d.uid, give: give(student, 2161) }).ok);
  assert.equal(student.progress.counters['survivor.aid'], 1, 'a rescue drop for the Warehouse Manager');

  const wh = postGame('warehouse', 315);
  wh.crises.disabled = true;
  advance(wh, 1);
  jumpTo(wh, 6, 9);
  const pantry = createInventory(wh, { kind: 'furniture', w: 10, h: 10 });
  const inst = addItem(wh, pantry, 2161, { allowOverweight: true });
  assert.ok(giveVeteran(wh, [{ inv: pantry.id, uid: inst.uid }]).ok);
  assert.equal(wh.progress.counters['survivor.aid'], 1, 'a meal for the trapped veteran');

  const h = defaultHistory();
  accumulateLifetime(wage, h);
  accumulateLifetime(wh, h);
  assert.equal(h.counters['survivor.aid'], 3, 'folded into the lifetime archive');
  assert.equal(profileSummary(h, null).stats.find((x) => x.key === 'survivor.aid').value, 3);
  assert.deepEqual(COUNTER_LABELS['survivor.aid'], { en: 'Aid count', zh: '援助次数' });
});

// ---------------------------------------------------------------------------------------------- R03
test('R03 Pure Endless warehouse: cold storage, lower level, garage and left cabin tasks come one per day, and every lock opens', () => {
  const s = newGame({ seed: 316, character: 'warehouse', mode: 'pureEndless' });
  s.crises.disabled = true;
  assert.deepEqual(ENDLESS_UNLOCK_ORDER.warehouse, ['coldStorage', 'B1', 'garage', 'cabin']);
  assert.deepEqual(endlessTasks(s).map((o) => o.id), ['endless:coldStorage'], 'Day 1: the cold storage');
  assert.ok(s.run.unlockedRecipes.includes(326), 'the Cold Storage Key recipe');
  assert.equal(countIn(s, homeSources(s), 9020), 1, 'the workbench manual came with the kit');
  give(s, 9045);
  advance(s, 1);
  assert.equal(s.home.unlocked.coldStorage, true, 'the key opens the cold storage');
  assert.equal(endlessTasks(s)[0].done, true);

  jumpTo(s, 2, 9);
  assert.deepEqual(endlessTasks(s).map((o) => o.id), ['endless:B1'], 'Day 2: the way down; yesterday\'s finished task is gone');
  const lower = endlessTasks(s)[0];
  assert.equal(lower.text, 'Clear the way to the lower level');
  assert.ok(lower.onClick(), 'clicking the task queues the clearing');
  advance(s, 4);
  assert.equal(s.home.unlocked.B1, true, 'one day of clearing opens the lower level');

  jumpTo(s, 3, 9);
  assert.ok(endlessTasks(s).some((o) => o.id === 'endless:garage'), 'Day 3: the garage');
  advance(s, 2);
  assert.equal(countIn(s, homeSources(s), 9069), 1, 'the shutter key turned up in the open cold storage');
  assert.equal(s.home.unlocked.garage, true, 'and opened the garage');

  jumpTo(s, 4, 9);
  assert.ok(endlessTasks(s).some((o) => o.id === 'endless:cabin'), 'Day 4: the left cabin');
  assert.ok(s.run.unlockedRecipes.includes(324), 'the Side Room Key recipe');
  give(s, 9046);
  advance(s, 1);
  assert.ok(Object.keys(HOMES.warehouse.locks).every((a) => s.home.unlocked[a]), 'every area of the warehouse is open');
  assert.deepEqual(unlockTasks(s).released, ['coldStorage', 'B1', 'garage', 'cabin']);

  const story = postGame('warehouse', 317);
  story.crises.disabled = true;
  advance(story, 1);
  assert.equal(endlessTasks(story).length, 0, 'story runs keep the story quests');
});

test('R03 Pure Endless apartment: the stairs on Day 1 and the basement on Day 2 can be opened', () => {
  const s = newGame({ seed: 318, character: 'wage', mode: 'pureEndless' });
  s.crises.disabled = true;
  assert.deepEqual(endlessTasks(s).map((o) => o.id), ['endless:2F']);
  give(s, 20106, 2);
  assert.ok(endlessTasks(s)[0].onClick());
  advance(s, 3);
  assert.equal(s.home.unlocked['2F'], true, 'two planks fix the stairs');

  jumpTo(s, 2, 9);
  const basement = () => endlessTasks(s).find((o) => o.id === 'endless:B1');
  assert.ok(basement()?.onClick());
  advance(s, 3);
  assert.equal(s.home.repairs.B1, 1);
  assert.equal(basement().onClick(), null, 'one clearing session a day');
  jumpTo(s, 3, 9);
  assert.ok(basement().onClick());
  advance(s, 3);
  assert.equal(s.home.unlocked.B1, true);
  assert.ok(Object.keys(HOMES.apartment.locks).every((a) => s.home.unlocked[a]));
  assert.equal(dayNumber(s.clock), 3);
});
