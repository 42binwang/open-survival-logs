// Cooking content the source game has that the recreation never cooked (docs/bugs.jsonl BUG-0005, 0006, 0007): the
// dishes come out of a real cooking job; the tests set only the cooking level and, for spoiled food, its age.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import '../src/sim/furnActions.js';
import { installFurniture } from '../src/sim/home.js';
import { slotsFor } from '../src/sim/planning.js';
import { addItem } from '../src/sim/inventory.js';
import { item, recipe } from '../src/data/db.js';
import { on } from '../src/engine/bus.js';
import { fillRecipe, addIngredient, startCooking, tickCooking, cookerState, predictDish, qualityChances, POT_W, POT_H } from '../src/sim/cooking.js';

const bp = (s) => s.inventories[s.player.backpack];

function postGame(character = 'wage', seed = 31) {
  const s = newGame({ seed, character });
  s.phase = 'post';
  s.clock.t = s.clock.outbreakAt; // 18:00, Day 1
  s.run.day = 1;
  return s;
}

// ------------------------------------------------------------------------------------------------ cooking
// A microwave (50001: electric, unattended, every recipe of the stove) installed at home; the ingredients go into
// the backpack, the cookbook's Fill loads the pot and the job runs to the output.
function kitchen(seed, lv) {
  const s = postGame('wage', seed);
  s.home.unlocked['2F'] = true;
  const [slot] = slotsFor(s, 50001);
  const r = installFurniture(s, 50001, slot.id);
  assert.ok(r.ok, r.reason);
  s.progress.prof.cook.lv = lv; // the cooking level, as tests/cooking.test.js sets it
  return { s, mw: r.f };
}

function cookRecipe(s, mw, id, prep = null) {
  for (const ing of recipe(id).items) addItem(s, bp(s), ing, { allowOverweight: true });
  const filled = fillRecipe(s, mw.uid, id);
  if (!filled.ok) return { ok: false, why: filled.reason };
  prep?.(s.inventories[cookerState(s, mw).pot].items);
  const started = startCooking(s, mw.uid);
  if (!started.ok) return { ok: false, why: started.reason };
  const { job } = started;
  const cooked = [];
  const off = on('cooked', (e) => cooked.push(e.item));
  try {
    tickCooking(s, job.dur + 1);
  } finally {
    off();
  }
  assert.deepEqual(cooked, [job.out], 'the dish came out (into the output, or a floor box when it is too big)');
  s.inventories[cookerState(s, mw).out].items.length = 0;
  return { ok: true, recipe: job.recipe, quality: job.quality, out: job.out };
}

test('BUG-0005: the pot takes every config recipe’s ingredient set, the 6 × 5 suckling pig included', () => {
  assert.ok(POT_W * POT_H > 6 * 4, 'bigger than the old 6 × 4 pot');
  for (const id of [2006, 4012, 7084, 7101, 7102, 7142, 7148, 7231, 7261, 7268, 7270, 7271]) {
    const { s, mw } = kitchen(70, 5);
    const res = cookRecipe(s, mw, id);
    assert.ok(res.ok, `${id} ${recipe(id).zh}: ${res.why}`);
    assert.equal(res.recipe, id);
    assert.ok(recipe(id).out.includes(res.out));
  }
  // 6018 High-Grade Fish Porridge is a tag recipe (a staple and a high-grade fish): the Fill picks rice and tuna
  const k = kitchen(71, 5);
  for (const ing of [2103, 2325]) addItem(k.s, bp(k.s), ing, { allowOverweight: true });
  const filled = fillRecipe(k.s, k.mw.uid, 6018);
  assert.ok(filled.ok, filled.reason);
  assert.equal(predictDish(k.s, k.mw.uid).match.recipe.id, 6018);
  // and the suckling pig (2320) goes into the pot by hand
  const p = kitchen(72, 5);
  const pig = addItem(p.s, bp(p.s), 2320, { allowOverweight: true });
  const r = addIngredient(p.s, p.mw.uid, p.s.player.backpack, pig.uid);
  assert.ok(r.ok, r.reason);
});

test('BUG-0006: a Lv1 cook’s premium cut is the Charcoal Grill Platter (6002); from Lv2 it is the cut’s own dish', () => {
  const lv1 = kitchen(73, 1);
  addItem(lv1.s, bp(lv1.s), 2202, { allowOverweight: true }); // frozen black-pepper short ribs, $150
  const filled = fillRecipe(lv1.s, lv1.mw.uid, 6002);
  assert.ok(filled.ok, `the cookbook fills 6002 with the short ribs (${filled.reason})`);
  const plan = predictDish(lv1.s, lv1.mw.uid);
  assert.equal(plan.match.recipe.id, 6002);
  assert.equal(plan.problem, null);
  const { job } = startCooking(lv1.s, lv1.mw.uid);
  tickCooking(lv1.s, job.dur + 1);
  assert.ok(recipe(6002).out.includes(job.out), `a platter came out (${job.out})`);
  assert.ok(lv1.s.progress.codexRun.dish.includes(6002));

  const lv2 = kitchen(74, 2);
  assert.equal(cookRecipe(lv2.s, lv2.mw, 4002).recipe, 4002, 'the exact recipe once the cook knows it');
});

test('BUG-0007: a spoiled single cut can come out Failed, even for the Lv2–3 recipes; a fresh one cannot', () => {
  const spoil = (items) => {
    for (const inst of items) inst.age = item(inst.id).life; // past its shelf life, not yet rotten
  };
  for (const [id, lv] of [[4002, 2], [4004, 3], [4079, 2], [4035, 3]]) {
    const { s, mw } = kitchen(80, lv);
    for (const ing of recipe(id).items) addItem(s, bp(s), ing, { allowOverweight: true });
    assert.ok(fillRecipe(s, mw.uid, id).ok);
    const fresh = predictDish(s, mw.uid);
    assert.equal(qualityChances(fresh.roll, recipe(id).q)[3], 0, `${id}: a fresh cut does not fail at Lv${lv}`);
    let failed = null;
    for (let i = 0; i < 20 && !failed; i++) {
      const res = cookRecipe(s, mw, id, spoil);
      assert.ok(res.ok, `${id}: ${res.why}`);
      if (res.quality === 3) failed = res.out;
    }
    assert.equal(failed, recipe(id).out[3], `${id} ${recipe(id).zh}: its Fail output`);
  }
});
