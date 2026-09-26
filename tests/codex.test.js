import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { defaultHistory } from '../src/engine/save.js';
import { addItem } from '../src/sim/inventory.js';
import { codex as CODEX, item, craft } from '../src/data/db.js';
import {
  CODEX_CATS,
  MILESTONES,
  COLLECTOR_IDS,
  SOUVENIR_RECIPES,
  codexList,
  codexCount,
  codexCompletion,
  mergeRunCodex,
  checkMilestones,
  syncSouvenirRecipes,
  syncCodex,
  normalizeCodexId,
  souvenirsPlaced,
  collectorMet,
  milestoneReached,
} from '../src/meta/codex.js';
import { checkAchievement } from '../src/meta/achievements.js';

function run(opts = {}) {
  return newGame({ seed: 5, ...opts });
}

function place(s, cfg) {
  const uid = ++s.nextUid;
  const slot = `test:${uid}`;
  s.furniture[uid] = { uid, cfg, slot, floor: '1F', x: 0, y: 0, w: 1, h: 1, hp: 1000, maxHp: 1000, reinforce: 0, on: true, inv: null, data: {} };
  s.home.slots[slot] = uid;
  return s.furniture[uid];
}

test('codex tables match the config sizes', () => {
  const comp = codexCompletion(defaultHistory());
  assert.deepEqual(
    Object.fromEntries(CODEX_CATS.map((c) => [c, comp[c].total])),
    { food: 173, dish: 493, plant: 34, prey: 19, craft: 125, furniture: 87 }
  );
  assert.equal(comp.all.total, 931);
  assert.equal(comp.all.pct, 0);
  assert.equal(MILESTONES.length, 15, 'fifteen souvenirs');
  assert.deepEqual([...SOUVENIR_RECIPES].sort((a, b) => a - b), [372, 373, 374, 375, 376, 377, 378, 379, 380, 381, 382, 383, 384, 385, 386]);
  for (const m of MILESTONES) assert.equal(item(craft(m.craft).out[0]).furn, m.furn, `recipe ${m.craft} builds souvenir ${m.furn}`);
});

test('normalizeCodexId maps produced items back to codex keys', () => {
  assert.equal(normalizeCodexId('dish', 4045), 4045);
  assert.equal(normalizeCodexId('dish', 12508), 4045, 'dish output item -> recipe');
  assert.equal(normalizeCodexId('plant', 15007), 5, 'seed -> plant');
  assert.equal(normalizeCodexId('craft', 14076), 372, 'craft output -> recipe');
  assert.equal(normalizeCodexId('food', 2101), 2101);
  assert.equal(normalizeCodexId('food', 99999999), null);
  assert.equal(normalizeCodexId('nope', 1), null);
});

test('merging a run into history keeps ids unique, drops unknown ones and adds installed furniture', () => {
  const s = run();
  const h = defaultHistory();
  h.codex.food = [2101];
  Object.assign(s.progress.codexRun, {
    food: [2101, 2102, 2102, 99999999],
    dish: [100, 12508],
    plant: [5, 15007],
    prey: [30000],
    craft: [372],
  });
  s.progress.installed = { 60001: 1, 10002: 2 };
  const added = mergeRunCodex(s, h);
  assert.deepEqual(h.codex.food, [2101, 2102]);
  assert.deepEqual(h.codex.dish, [100, 4045]);
  assert.deepEqual(h.codex.plant, [5]);
  assert.deepEqual(h.codex.prey, [30000]);
  assert.deepEqual(h.codex.craft, [372]);
  assert.ok(h.codex.furniture.includes(60001) && h.codex.furniture.includes(10002), 'installed furniture');
  assert.ok(h.codex.furniture.includes(801), 'furniture already at home counts (the fuel stove has no package)');
  assert.ok(h.codex.furniture.every((id) => CODEX.furniture.includes(id)));
  assert.equal(new Set(h.codex.furniture).size, h.codex.furniture.length);
  assert.ok(added.some((e) => e.cat === 'dish' && e.id === 4045));
  assert.deepEqual(mergeRunCodex(s, h), [], 'second merge adds nothing');
  assert.equal(codexCount(h, 'food'), 2);
});

test('codex milestones unlock souvenir recipes at the right counts', () => {
  for (const m of MILESTONES) {
    const s = run();
    const h = defaultHistory();
    h.codex[m.cat] = codexList(m.cat).slice(0, m.count - 1);
    assert.equal(checkMilestones(s, h, 7).some((x) => x.id === m.id), false, `${m.id} not yet at ${m.count - 1}`);
    assert.equal(h.souvenirRecipes.includes(m.craft), false);
    h.codex[m.cat] = codexList(m.cat).slice(0, m.count);
    const fresh = checkMilestones(s, h, 8);
    assert.ok(fresh.some((x) => x.id === m.id), `${m.id} reached at ${m.count}`);
    assert.equal(h.milestones[m.id], 8);
    assert.ok(h.souvenirRecipes.includes(m.craft), `${m.id} unlocks recipe ${m.craft}`);
    assert.ok(s.run.souvenirRecipes.includes(m.craft), 'the running save can craft it right away');
    assert.equal(milestoneReached(h, m), true);
  }
  const s = run();
  const h = defaultHistory();
  h.codex.craft = codexList('craft').slice(0, 50);
  h.codex.furniture = codexList('furniture').slice(0, 84);
  h.codex.food = codexList('food').slice(0, 165);
  const fresh = checkMilestones(s, h);
  assert.deepEqual(
    fresh.map((m) => m.craft).sort((a, b) => a - b),
    [373, 375, 382, 383, 384, 385, 386],
    'wasteland art (23), clockwork toy (35), landscape (50); frame, photo wall, guitar; the painting'
  );
  assert.equal(checkMilestones(s, h).length, 0, 'milestones are awarded once');
});

test('codex events flow: a run codex grows history and awards milestones in one sync', () => {
  const s = run();
  const h = defaultHistory();
  s.progress.codexRun.prey = codexList('prey').slice(0, 7);
  const { added, milestones } = syncCodex(s, h, 3);
  assert.equal(added.filter((e) => e.cat === 'prey').length, 7);
  assert.deepEqual(milestones.map((m) => m.id), ['prey7']);
  assert.ok(s.run.souvenirRecipes.includes(381), 'little aquarium recipe');
});

test('souvenir recipes apply to every save', () => {
  const h = defaultHistory();
  h.souvenirRecipes = [382, 373];
  const s = run({ character: 'student' });
  assert.equal(syncSouvenirRecipes(s, h), 2);
  assert.deepEqual(s.run.souvenirRecipes, [382, 373]);
  assert.equal(syncSouvenirRecipes(s, h), 0, 'idempotent');
  const retro = defaultHistory();
  retro.codex.furniture = codexList('furniture').slice(0, 60);
  const t = run();
  checkMilestones(t, retro);
  assert.deepEqual(Object.keys(retro.milestones).sort(), ['furn25', 'furn50'], 'already-met milestones complete on the next check (patch 09-02)');
});

test('Collector (9004) requires the eight souvenirs 9300-9307 placed at home', () => {
  const s = run();
  const h = defaultHistory();
  for (const id of COLLECTOR_IDS.slice(0, 7)) place(s, id);
  assert.equal(souvenirsPlaced(s).length, 7);
  assert.equal(collectorMet(s), false);
  assert.equal(checkAchievement(9004, s, h), false);
  place(s, 9308);
  place(s, 9314);
  assert.equal(checkAchievement(9004, s, h), false, 'the other seven souvenirs do not count');
  addItem(s, s.inventories[s.player.backpack], 14083);
  assert.equal(checkAchievement(9004, s, h), false, 'a heavy motorcycle package in the backpack is not displayed');
  place(s, 9307);
  assert.equal(collectorMet(s), true);
  assert.equal(checkAchievement(9004, s, h), true);
});

test('Blueprint Collector (2113) needs the whole crafting codex from history and the current run', () => {
  const s = run();
  const h = defaultHistory();
  const all = codexList('craft');
  h.codex.craft = all.slice(0, all.length - 1);
  assert.equal(checkAchievement(2113, s, h), false);
  s.progress.codexRun.craft = [all[all.length - 1]];
  assert.equal(checkAchievement(2113, s, h), true, 'the last blueprint crafted this run counts before merging');
  h.codex.craft = all.slice();
  assert.equal(checkAchievement(2113, null, h), true);
});
