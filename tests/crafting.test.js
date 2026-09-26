import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { tick } from '../src/sim/tick.js';
import { isIdle, cancelAction } from '../src/sim/actions.js';
import '../src/sim/furnActions.js';
import {
  RECIPE_ORDER,
  recipeDef,
  recipeStatus,
  listRecipes,
  isRecipeVisible,
  isRecipeCraftable,
  unlockHint,
  craftSources,
  findWorkbench,
  autoFill,
  clearSurface,
  canCraft,
  startCraft,
  craftAgain,
  craftOnce,
  craftExp,
  craftStaminaCost,
  perfectChance,
  failChance,
  blueprintProgress,
  breakdownOf,
  isShreddable,
  shredTimeSec,
  ensureShredder,
  addToShredder,
  shredderStatus,
} from '../src/sim/crafting.js';
import { furnitureAt, dismantle, installFurniture } from '../src/sim/home.js';
import { addItem, count } from '../src/sim/inventory.js';
import { getMods, bumpMods } from '../src/sim/modifiers.js';
import { packageToFurniture } from '../src/data/db.js';

function postDisaster(opts = {}) {
  const s = newGame({ seed: 31, ...opts });
  s.phase = 'post';
  s.clock.t = s.clock.outbreakAt + 3 * 3600; // 21:00 on Day 1
  s.run.day = 1;
  findWorkbench(s).broken = false;
  return s;
}

const backpack = (s) => s.inventories[s.player.backpack];

function give(s, id, n = 1, inv = backpack(s)) {
  for (let i = 0; i < n; i++) assert.ok(addItem(s, inv, id), `room for ${id}`);
}

// Perfect crafts hand extra materials back; subtract them when checking what was consumed.
const bonusOf = (res, id) => res.bonus.find(([x]) => x === id)?.[1] || 0;

// Swap the newspaper stacks (a medium slot) for another piece of furniture.
function installAtL6(s, cfg) {
  dismantle(s, furnitureAt(s, '1F:l6').uid);
  const res = installFurniture(s, cfg, '1F:l6');
  assert.ok(res.ok, `installed ${cfg}`);
  return res.f;
}

test('recipe visibility and craftability follow crafting level and unlocks', () => {
  const s = postDisaster();
  assert.equal(s.progress.prof.craft.lv, 2, 'the Wage Slave starts at crafting Lv2');
  assert.ok(isRecipeVisible(s, 1) && isRecipeCraftable(s, 1), 'Cardboard: shown at Lv1, craftable at Lv2');
  assert.equal(isRecipeVisible(s, 130), false, 'Refined Sheet Metal is hidden below Lv4');
  s.progress.prof.craft.lv = 4;
  assert.ok(isRecipeVisible(s, 130) && isRecipeCraftable(s, 130));

  const sandbags = recipeStatus(s, 400);
  assert.equal(sandbags.visible, true, 'visible by default');
  assert.equal(sandbags.craftable, false, 'but needs an unlock');
  assert.match(sandbags.reason, /Barricade Guide/);
  s.run.cards.push('barricades');
  assert.ok(isRecipeCraftable(s, 400) && isRecipeCraftable(s, 401), 'the planning card unlocks its recipes');
  s.run.unlockedRecipes.push(402);
  assert.ok(isRecipeCraftable(s, 402), 'unlockedRecipes (events, notes)');
  assert.equal(isRecipeCraftable(s, 384), false);
  assert.match(unlockHint(s, 384), /craft 23 different items/);
  s.run.souvenirRecipes = [384];
  assert.ok(isRecipeCraftable(s, 384), 'codex souvenir unlocks');

  const student = postDisaster({ character: 'student' });
  const cardboard = recipeStatus(student, 1);
  assert.equal(cardboard.visible, true);
  assert.equal(cardboard.craftable, false);
  assert.match(cardboard.reason, /Crafting Lv2/);

  const ids = listRecipes(s).map((r) => r.id);
  assert.equal(ids.length, 131, 'official recipe list');
  for (const dev of [5, 6, 13, 14, 25, 200]) assert.ok(!ids.includes(dev), `development recipe ${dev} is excluded`);
  assert.deepEqual(ids, RECIPE_ORDER);
});

test('Molotov recipes are only for the Wage Slave and the Warehouse Manager', () => {
  for (const character of ['wage', 'warehouse']) {
    const s = postDisaster({ character });
    assert.equal(isRecipeCraftable(s, 405), false, 'needs the planning card');
    s.run.cards.push('molotov');
    assert.ok(isRecipeCraftable(s, 405), character);
  }
  const s = postDisaster({ character: 'student' });
  s.run.cards.push('molotov');
  s.run.unlockedRecipes.push(404, 405, 406);
  for (const id of [404, 405, 406]) {
    assert.equal(isRecipeVisible(s, id), false);
    assert.equal(isRecipeCraftable(s, id), false);
  }
  give(s, 20001);
  give(s, 15504);
  const res = craftOnce(s, 405);
  assert.equal(res.ok, false);
  assert.match(res.reason, /Molotov/);
  assert.equal(count(backpack(s), 26005), 0);
});

test('patch 09-09 official recipes: electronic components, playing cards, bandage, live trap', () => {
  const s = postDisaster({ character: 'student' });
  assert.equal(s.progress.prof.craft.lv, 1);
  assert.deepEqual(recipeDef(15).mat, [20103, 20104, 20102], 'Plastic Sheet + Wire + Container');
  for (const id of [15, 12, 19]) {
    assert.ok(isRecipeVisible(s, id), `recipe ${id} visible by default`);
    assert.ok(isRecipeCraftable(s, id), `recipe ${id} craftable at Lv1`);
  }
  assert.deepEqual([...recipeDef(202).mat].sort(), [20003, 20004, 20004], 'Live Trap: Waste Plastic + Sheet Metal ×2');
  assert.equal(recipeDef(200), null, 'the Sheet Metal ×1 test trap is gone');

  const bp = backpack(s);
  give(s, 20104);
  give(s, 20102);
  assert.equal(recipeStatus(s, 15).haveAll, false, 'the old Wire + Container recipe no longer works');
  give(s, 20103);
  const res = craftOnce(s, 15);
  assert.ok(res.ok);
  assert.equal(count(bp, 20210), 1);
  for (const id of [20103, 20104, 20102]) assert.equal(count(bp, id), bonusOf(res, id));
});

test('crafting consumes materials from the backpack and home storage', () => {
  const s = postDisaster();
  const bp = backpack(s);
  const shelf = s.inventories[furnitureAt(s, '1F:l3').inv];
  give(s, 20004, 2);
  give(s, 20004, 1, shelf);
  assert.equal(recipeStatus(s, 4).haveAll, true);
  const res = craftOnce(s, 4);
  assert.ok(res.ok);
  assert.deepEqual(res.products, [[20104, 1]]);
  assert.equal(count(bp, 20104), 1);
  assert.equal(count(shelf, 20004), 0, 'the shelf supplied the third sheet');
  assert.equal(count(bp, 20004), bonusOf(res, 20004));
  bp.items = bp.items.filter((it) => it.id !== 20004);
  const again = craftOnce(s, 4);
  assert.equal(again.ok, false);
  assert.match(again.reason, /Missing/);
});

test('auto-fill gathers only missing materials from backpack, drawer and tool cabinets; Clear returns them', () => {
  const s = postDisaster();
  const wb = findWorkbench(s);
  const bp = backpack(s);
  const drawer = s.inventories[wb.inv];
  const cabinet = s.inventories[installAtL6(s, 70006).inv];
  const shelf = s.inventories[furnitureAt(s, '1F:l3').inv];
  const surface = s.inventories[wb.data.craft.surface];
  give(s, 20004, 1);
  give(s, 20004, 1, drawer);
  give(s, 20004, 1, cabinet);
  give(s, 20004, 2, shelf);

  const src = craftSources(s, wb.uid);
  assert.deepEqual(src.slice(0, 3), [surface.id, bp.id, drawer.id], 'surface, backpack, drawer first');
  assert.ok(src.indexOf(cabinet.id) < src.indexOf(shelf.id), 'tool cabinets before other storage');

  const st = recipeStatus(s, 4, wb.uid);
  assert.equal(st.haveAll, true);
  assert.equal(st.gathered, false, 'enough materials but not gathered (corner marker)');
  assert.equal(autoFill(s, wb.uid, 4).moved, 3);
  assert.equal(count(surface, 20004), 3);
  assert.equal(count(shelf, 20004), 2, 'other storage is only a fallback');
  assert.equal(autoFill(s, wb.uid, 4).moved, 0, 'materials already on the workbench are not moved again');
  assert.ok(recipeStatus(s, 4, wb.uid).onSurface);

  assert.equal(clearSurface(s, wb.uid), 3);
  assert.equal(count(surface, 20004), 0);
  assert.equal(count(bp, 20004), 1);
  assert.equal(count(drawer, 20004), 1);
  assert.equal(count(cabinet, 20004), 1);
});

test('crafting at the workbench takes LifeMin minutes and costs stamina on completion', () => {
  const s = postDisaster();
  const wb = findWorkbench(s);
  const bp = backpack(s);
  const surface = s.inventories[wb.data.craft.surface];
  give(s, 20001, 6);
  const cost = craftStaminaCost(s, 1);
  assert.ok(cost > 0 && cost < 70 * 0.12, 'Lv2 crafting costs less stamina');
  const sta = s.player.stats.sta;
  const a = startCraft(s, wb.uid, 1);
  assert.ok(a);
  assert.equal(a.dur, 70 * 60);
  tick(s, 10 * 60);
  assert.equal(count(bp, 20101), 0, 'still working');
  assert.equal(count(surface, 20001), 3, 'materials laid out on the workbench');
  assert.ok(s.player.stats.sta > sta - 1, 'nothing charged yet');
  assert.equal(wb.data.crafting, true, 'busy flag for the renderer and power system');
  tick(s, 70 * 60);
  assert.equal(count(bp, 20101), 1);
  assert.equal(count(surface, 20001), 0);
  assert.ok(isIdle(s));
  assert.equal(wb.data.crafting, false);
  assert.ok(s.player.stats.sta <= sta - cost + 0.01, 'stamina charged');
  assert.equal(s.progress.counters['craft.total'], 1);

  assert.ok(craftAgain(s, wb.uid), 'Craft Again repeats the last recipe');
  tick(s, 90 * 60);
  assert.equal(count(bp, 20101), 2);

  s.run.cards.push('workshopTricks');
  bumpMods(s);
  assert.ok(craftStaminaCost(s, 1) < cost, 'Workshop Tricks card');
  s.player.stats.sta = 1;
  give(s, 20001, 3);
  assert.match(canCraft(s, wb.uid, 1), /Stamina/);
  assert.equal(startCraft(s, wb.uid, 1), null);
});

test('cancelling a craft keeps the materials and charges nothing', () => {
  const s = postDisaster();
  const wb = findWorkbench(s);
  const surface = s.inventories[wb.data.craft.surface];
  give(s, 20001, 3);
  const a = startCraft(s, wb.uid, 1);
  tick(s, 20 * 60);
  const sta = s.player.stats.sta;
  cancelAction(s, a.id);
  tick(s, 60);
  assert.equal(wb.data.crafting, false);
  assert.equal(count(surface, 20001), 3);
  assert.equal(count(backpack(s), 20101), 0);
  assert.ok(s.player.stats.sta > sta - 1);
  assert.equal(s.progress.counters['craft.total'] ?? 0, 0);
});

test('perfect crafting: recipe rate + level + cards, deterministic per seed', () => {
  const s = postDisaster();
  assert.ok(Math.abs(perfectChance(s, 1) - 0.15) < 1e-6, '5% recipe + 10% at Lv2');
  s.run.cards.push('precision');
  bumpMods(s);
  assert.ok(Math.abs(perfectChance(s, 1) - 0.25) < 1e-6, 'Precision Work card');
  assert.equal(perfectChance(s, 338), 0, 'no perfect output, no perfect roll');

  const rolls = (seed) => {
    const t = postDisaster({ seed });
    const out = [];
    for (let i = 0; i < 60; i++) {
      backpack(t).items = [];
      give(t, 20001, 3);
      out.push(craftOnce(t, 1).perfect);
    }
    return out;
  };
  const a = rolls(41);
  assert.deepEqual(rolls(41), a, 'same seed, same rolls');
  const rate = a.filter(Boolean).length / a.length;
  assert.ok(rate > 0.02 && rate < 0.4, `perfect rate ${rate}`);

  getMods(s).craftPerfect = 1;
  give(s, 20001, 3);
  const res = craftOnce(s, 1);
  assert.equal(res.perfect, true);
  assert.deepEqual(res.bonus, [[20001, 3]]);
  assert.equal(count(backpack(s), 20001), 3, 'a perfect craft returns its perfect outputs');
  assert.equal(s.progress.counters['craft.perfect'], 1);
});

test('crafting above your level can fail and salvages the fail outputs', () => {
  const s = postDisaster({ character: 'student' });
  assert.ok(Math.abs(failChance(s, 23) - 0.36) < 1e-6, 'Rescue Mark is Lv4, the student is Lv1');
  assert.equal(failChance(s, 1), 0, 'no failed outputs, no failure');
  let res = null;
  let made = 0;
  for (let i = 0; i < 20; i++) {
    backpack(s).items = [];
    for (const id of [9003, 20001, 20002, 20003, 20004]) give(s, id);
    res = craftOnce(s, 23);
    if (res.failed) break;
    made++;
  }
  assert.equal(res.failed, true);
  assert.deepEqual(res.products, []);
  assert.deepEqual(res.salvage, [
    [9003, 1],
    [20001, 1],
  ]);
  assert.equal(count(backpack(s), 9003), 1, 'the blueprint is salvaged');
  assert.equal(count(backpack(s), 9002), 0);
  assert.equal(res.exp, Math.round(craftExp(23) / 2));
  assert.equal(s.progress.counters['craft.fail'], 1);
  assert.equal(s.progress.counters['craft.total'] ?? 0, made);
  s.progress.prof.craft.lv = 4;
  assert.equal(failChance(s, 23), 0);
});

test('crafting exp, discovery bonus, defense exp, counters and newly unlocked recipes', () => {
  const s = postDisaster();
  const p = s.progress.prof.craft;
  give(s, 20001, 3);
  const first = craftOnce(s, 1);
  assert.equal(first.first, true);
  assert.equal(first.exp, craftExp(1) + 30, 'LifeMin exp + discovery exp');
  give(s, 20001, 3);
  const second = craftOnce(s, 1);
  assert.equal(second.exp, craftExp(1));
  assert.equal(p.exp, 170);
  assert.equal(s.progress.counters['craft.total'], 2);

  s.run.cards.push('barricades');
  give(s, 20001);
  give(s, 20003, 2);
  const sandbags = craftOnce(s, 400);
  assert.ok(sandbags.ok);
  assert.equal(sandbags.defExp, 5);
  assert.equal(s.progress.prof.defense.exp, 5);
  assert.equal(count(backpack(s), 26001), 1);

  const t = postDisaster();
  t.progress.prof.craft.lv = 3;
  t.progress.prof.craft.exp = 4490;
  give(t, 20001, 3);
  const res = craftOnce(t, 1);
  assert.equal(res.levelUp, true);
  assert.equal(res.lv, 4);
  assert.ok(res.unlocked.includes(130), 'Refined Sheet Metal unlocked at Lv4');
  assert.ok(!res.unlocked.includes(1));
});

test('crafting codex: InCodex recipes are recorded, Blueprint Collector needs 125', () => {
  const s = postDisaster();
  assert.deepEqual(blueprintProgress(s), { have: 0, total: 125 });
  give(s, 20001, 3);
  craftOnce(s, 1);
  assert.ok(s.progress.codexRun.craft.includes(1));
  give(s, 20101, 2);
  assert.ok(craftOnce(s, 12).ok, 'playing cards');
  assert.ok(!s.progress.codexRun.craft.includes(12), 'not a codex entry');
  assert.deepEqual(blueprintProgress(s), { have: 1, total: 125 });
});

test('the workbench must be repaired and used after the outbreak; the drawer is storage', () => {
  const s = newGame({ seed: 9 });
  const wb = findWorkbench(s);
  assert.equal(wb.broken, true);
  assert.ok(s.inventories[wb.inv], 'the drawer has storage');
  give(s, 20001, 3, s.inventories[wb.inv]);
  s.phase = 'post';
  s.clock.t = s.clock.outbreakAt + 3600;
  const broken = craftOnce(s, 1);
  assert.equal(broken.ok, false);
  assert.match(broken.reason, /broken/);
  assert.equal(startCraft(s, wb.uid, 1), null);
  wb.broken = false;
  s.phase = 'pre';
  assert.match(craftOnce(s, 1).reason, /after the outbreak/);
  s.phase = 'post';
  assert.ok(craftOnce(s, 1).ok, 'materials taken from the drawer');
  assert.equal(count(s.inventories[wb.inv], 20001), 0);
});

test('recipe list order is stable and grouped by note category', () => {
  const s = postDisaster();
  const before = listRecipes(s).map((r) => r.id);
  give(s, 20004, 12);
  const after = listRecipes(s);
  assert.deepEqual(after.map((r) => r.id), before, 'materials do not reorder the list');
  const notes = after.map((r) => r.note);
  assert.deepEqual(notes, [...notes].sort((a, b) => a - b));
  assert.ok(after.find((r) => r.id === 4).haveAll);
});

test('the shredder breaks advanced materials down over time while powered', () => {
  const s = postDisaster();
  assert.equal(packageToFurniture[14095], 70007);
  const sh = installAtL6(s, 70007);
  ensureShredder(s, sh);
  const bp = backpack(s);
  const bin = s.inventories[sh.inv];
  assert.deepEqual(breakdownOf(20360), [[20004, 4]]);
  assert.deepEqual(breakdownOf(20362), [[20361, 2]]);
  assert.equal(isShreddable(20004), false);
  for (const id of [20360, 20210, 20004]) assert.ok(addToShredder(s, sh.uid, bp.id, addItem(s, bp, id).uid).ok);

  sh.powered = false;
  tick(s, 3 * 3600);
  assert.equal(shredderStatus(s, sh.uid).status, 'noPower');
  assert.equal(bin.items.length, 0);
  assert.equal(sh.data.crafting, false, 'draws no power while stopped');

  sh.powered = true;
  tick(s, shredTimeSec(20360) - 60);
  assert.equal(shredderStatus(s, sh.uid).status, 'working');
  assert.equal(sh.data.crafting, true, 'draws power while shredding');
  assert.equal(count(bin, 20004), 0, 'still shredding');
  tick(s, 120);
  assert.equal(count(bin, 20004), 4, 'Refined Sheet Metal → Sheet Metal ×4');
  tick(s, shredTimeSec(20210) + 60);
  for (const id of [20103, 20104, 20102]) assert.equal(count(bin, id), 1, `Electronic Components → ${id}`);
  const st = shredderStatus(s, sh.uid);
  assert.equal(st.status, 'stuck', 'plain Sheet Metal cannot be shredded');
  assert.equal(st.blocked, 1);
  assert.equal(sh.data.crafting, false);
  assert.equal(s.progress.counters['shred.count'], 2);
  assert.ok(craftSources(s, findWorkbench(s).uid).includes(sh.inv), 'the collection bin counts as home storage');
});
