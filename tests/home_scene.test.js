// @ts-check
// The homes start with the config pieces of the original's home scenes (Config_Furniture ids, not string stand-ins):
// each home's workbench, radio, door and windows, its story fixtures and the post-outbreak clutter of its upper floor
// and basement; the shops' fixtures are the pieces of their own scenes. Saves from before (string stand-ins) still
// play.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { tick } from '../src/sim/tick.js';
import { furnitureFunctions, startFurnitureFunction } from '../src/sim/furnActions.js';
import { createFurniture, dismantle, furnitureAt, homeFurniture, removeFurniture, slotAccepts } from '../src/sim/home.js';
import { findWorkbench } from '../src/sim/crafting.js';
import { queueMove, slotsFor } from '../src/sim/planning.js';
import { addItem } from '../src/sim/inventory.js';
import { dayStartT, HOUR } from '../src/sim/time.js';
import { arriveAt, buy, shelfOffers } from '../src/sim/predisaster.js';
import { serialize } from '../src/engine/save.js';
import { neighborState } from '../src/sim/social.js';
import '../src/sim/story.js'; // counts rubble cleared (story event rubbleCleared)
import { HOMES } from '../src/content/homes.js';
import { SHOPS } from '../src/content/shops.js';
import { furn, func } from '../src/data/db.js';

const CHARACTER_HOME = { wage: 'apartment', student: 'duplex', warehouse: 'warehouse' };
const MANUAL = 9020;
const CONSTRUCTION_SHOP = 53; // Config_FurnitureFunc 建造商店, FuncAction 12: buying

/** @param {Record<string, any>} [opts] @param {number} [day] @param {number} [hour] */
function post(opts = {}, day = 2, hour = 10) {
  const s = /** @type {any} */ (newGame({ seed: 91, ...opts }));
  s.phase = 'post';
  s.clock.t = dayStartT(s.clock, day) + hour * HOUR;
  s.run.day = day;
  return s;
}

/** @param {any} s */
function keepAlive(s) {
  Object.assign(s.player.stats, { sat: 90, mor: 90, sta: 100, life: 100 });
}

/** @param {any} s @param {any} f @param {string} kind */
const byKind = (s, f, kind) => /** @type {any} */ (furnitureFunctions(s, f).find((/** @type {any} */ e) => e.spec.kind === kind));

test('every home places Config_Furniture ids only, each in a slot that takes it or a scene piece of its own', () => {
  for (const [id, home] of Object.entries(HOMES)) {
    for (const st of home.starter) {
      assert.equal(typeof st.furn, 'number', `${id} ${st.slot} places ${st.furn}, a config id`);
      const def = furn(st.furn);
      assert.ok(def, `${id} ${st.slot}: ${st.furn} is a Config_Furniture row`);
      const slot = home.slots.find((/** @type {any} */ x) => x.id === st.slot);
      assert.ok(slot, `${id} ${st.slot} exists`);
      // SlotType 0: a scene piece the original never lets the player install, standing where the scene has it
      if (def.slot) assert.ok(slotAccepts(slot.type, def.slot), `${id} ${st.slot} (type ${slot.type}) takes ${st.furn} (SlotType ${def.slot})`);
    }
  }
});

test("each home's own workbench, radio, door and windows are its scene's config pieces", () => {
  const want = {
    wage: { bench: 313, radio: 213, door: 211, window: 212 },
    student: { bench: 80033, radio: 80016, door: 80200, window: 80201 },
    warehouse: { bench: 405, radio: 407, door: 368, window: 369 },
  };
  for (const [character, w] of Object.entries(want)) {
    const s = /** @type {any} */ (newGame({ seed: 92, character }));
    assert.equal(s.home.id, CHARACTER_HOME[/** @type {keyof typeof CHARACTER_HOME} */ (character)]);
    const bench = findWorkbench(s);
    assert.equal(bench?.cfg, w.bench, `${character}: the workbench`);
    assert.equal(bench.broken, true, `${character}: the workbench starts broken`);
    assert.ok(homeFurniture(s).some((/** @type {any} */ f) => f.cfg === w.radio), `${character}: the radio`);
    assert.equal(furnitureAt(s, '1F:door')?.cfg, w.door, `${character}: the front door`);
    assert.equal(furnitureAt(s, '1F:win1')?.cfg, w.window, `${character}: the windows`);
    assert.ok(!homeFurniture(s).some((/** @type {any} */ f) => typeof f.cfg === 'string'), `${character}: no string stand-in`);
  }
});

test('the broken starter bench of every home: its manual repairs it, or the Day 6 study; working, no repair or study', () => {
  for (const character of ['wage', 'student', 'warehouse']) {
    const s = post({ character }, 3, 10);
    keepAlive(s);
    const bench = findWorkbench(s);
    assert.ok(byKind(s, bench, 'open'), `${character}: crafting is offered (it tells the bench is broken)`);
    assert.equal(byKind(s, bench, 'repairWorkbench')?.key, 220, `${character}: Repair Workbench (220)`);
    assert.equal(byKind(s, bench, 'repairWorkbench').enabled, false, 'needs the manual');
    assert.match(byKind(s, bench, 'studyWorkbench').reason, /Day 6/);
    const vice = furnitureFunctions(s, bench).find((/** @type {any} */ e) => e.key === 247);
    assert.ok(vice, `${character}: Fix the Vice (247) is offered (the vice will not turn)`);
    assert.equal(vice.enabled, false, 'it needs a tin sheet');
    addItem(s, s.inventories[s.player.backpack], MANUAL, { allowOverweight: true });
    assert.ok(startFurnitureFunction(s, bench.uid, 220));
    tick(s, 2 * HOUR);
    assert.equal(bench.broken, false, `${character}: repaired with the manual`);
    assert.equal(byKind(s, bench, 'repairWorkbench'), undefined, 'a working bench offers no repair');
    assert.equal(byKind(s, bench, 'studyWorkbench'), undefined, 'nor the study');
    assert.ok(!furnitureFunctions(s, bench).some((/** @type {any} */ e) => e.key === 247), 'nor Fix the Vice');

    const t = post({ character }, 7, 10);
    keepAlive(t);
    const b2 = findWorkbench(t);
    const study = byKind(t, b2, 'studyWorkbench');
    assert.ok(study?.enabled, study?.reason);
    assert.equal(study.key, 249);
    startFurnitureFunction(t, b2.uid, study.key);
    tick(t, 4 * HOUR);
    assert.equal(b2.broken, false, `${character}: worked out without the manual`);
  }
});

test('the scene clutter: dismantled for its RemoveGet; the basement rubble counts as rubble cleared', () => {
  for (const character of ['wage', 'student', 'warehouse']) {
    const s = post({ character });
    keepAlive(s);
    // every floor and locked room open (the warehouse's rubble lies in its locked cabin and garage)
    const home = /** @type {any} */ (HOMES)[s.home.id];
    for (const area of ['2F', 'B1', ...Object.keys(home.locks || {})]) s.home.unlocked[area] = true;
    const clutter = homeFurniture(s).filter((/** @type {any} */ f) => f.data.clutter);
    assert.ok(clutter.length >= 5, `${character}: ${clutter.length} pieces of clutter`);
    const rubble = clutter.filter((/** @type {any} */ f) => f.data.rubble);
    assert.ok(rubble.length >= 1, `${character}: rubble in the basement`);
    for (const f of rubble) {
      const d = byKind(s, f, 'dismantle');
      assert.ok(d?.enabled, `${character}: ${f.cfg} can be taken apart`);
      const before = s.progress.counters['rubble.cleared'] || 0;
      startFurnitureFunction(s, f.uid, d.key);
      tick(s, 2 * HOUR);
      keepAlive(s);
      assert.equal(s.furniture[f.uid], undefined, `${character}: ${f.cfg} is gone`);
      assert.equal(s.progress.counters['rubble.cleared'], before + 1, `${character}: rubble cleared`);
    }
    const junk = clutter.find((/** @type {any} */ f) => !f.data.rubble && (furn(f.cfg)?.rmGet || []).length);
    const mats = /** @type {number[]} */ (dismantle(s, junk.uid));
    assert.deepEqual([...mats].sort(), [...furn(junk.cfg).rmGet].sort(), `${character}: ${junk.cfg} leaves its RemoveGet`);
  }
});

test('a scene piece with a slot type moves through Planning Mode like a bought one', () => {
  const s = post({ character: 'wage' });
  keepAlive(s);
  s.home.unlocked.B1 = true;
  const box = furnitureAt(s, 'B1:c3'); // the basement's storage box (9169)
  assert.equal(box.cfg, 9169);
  const target = slotsFor(s, box.cfg).find((/** @type {any} */ x) => x.floor === 'B1');
  assert.ok(target, 'a free basement slot that takes it');
  queueMove(s, box.uid, target.id);
  tick(s, 2 * HOUR);
  assert.equal(furnitureAt(s, target.id)?.uid, box.uid, 'moved');
});

test("each end of the basket line hangs its own home's basket: 9298 at the apartment, 80011 at the duplex", () => {
  for (const [character, cfg] of [['wage', 9298], ['student', 80011]]) {
    const s = /** @type {any} */ (newGame({ seed: 41, character: String(character) }));
    s.phase = 'post';
    s.clock.t = s.clock.outbreakAt;
    s.run.day = 1;
    for (let i = 0; i < 2; i++) {
      keepAlive(s);
      tick(s, HOUR);
    }
    const n = neighborState(s);
    assert.ok(n.id, `${character}: a neighbour across the line`);
    const basket = s.furniture[n.basketUid];
    assert.equal(basket?.cfg, cfg, `${character}: the basket piece`);
    assert.ok(furnitureFunctions(s, basket).some((/** @type {any} */ e) => e.key === 1749 && e.spec.kind === 'basket'), 'Repair Basket (1749)');
  }
});

test('shop fixtures are the pieces of their own scene; the Construction Shop counters sell the furniture wings', () => {
  const s = /** @type {any} */ (newGame({ seed: 93 }));
  s.player.money = 1e6;
  const wings = SHOPS.renovation.fixtures.filter((/** @type {any} */ f) => f.kind === 'shelf' && f.id !== 'security');
  assert.deepEqual(wings.map((/** @type {any} */ f) => f.cfg).sort(), [804, 806, 814, 815]);
  for (const f of wings) assert.ok(furn(f.cfg).funcs.includes(CONSTRUCTION_SHOP), `${f.id}: ${f.cfg} is a Construction Shop counter`);
  assert.deepEqual(func(CONSTRUCTION_SHOP).acts, [12], 'its action is buying');
  arriveAt(s, 'renovation');
  const living = /** @type {any} */ (wings.find((/** @type {any} */ f) => f.id === 'living'));
  const offer = shelfOffers(s, 'renovation', living.id)[0];
  assert.ok(offer, 'the living wing has stock');
  assert.equal(buy(s, 'renovation', living.id, offer.id).ok, true, 'bought at the counter');
  const planters = /** @type {any} */ (SHOPS.farmers.fixtures.find((/** @type {any} */ f) => f.id === 'planters'));
  assert.equal(planters.cfg, 831, "the farmers' market planter counter");
  assert.ok(furn(831).funcs.includes(CONSTRUCTION_SHOP));
  const model = (/** @type {number} */ id) => furn(id).res;
  /** @param {any[]} list @param {string} id */
  const fx = (list, id) => /** @type {any} */ (list.find((/** @type {any} */ f) => f.id === id));
  assert.match(model(fx(SHOPS.convenience.fixtures, 'box').cfg), /^SmallMarket/);
  assert.match(model(fx(SHOPS.hardware.fixtures, 'scrap').cfg), /^Tool_Store/);
  for (const id of ['scrapParts', 'jerrycan', 'glovebox']) {
    const cfg = fx(SHOPS.carlot.fixtures, id).cfg;
    assert.ok(cfg >= 42014 && cfg <= 42051, `${id}: ${cfg} of the car lot's own block`);
  }
});

test('a save from before the homes placed config pieces still plays: its string stand-ins keep working', () => {
  const s = post({ character: 'wage' });
  keepAlive(s);
  // the old apartment: 'workbench', 'radio', 'rubble' and 'junkpile' stand-ins where the config pieces stand now
  const swap = (/** @type {string} */ slot, /** @type {string} */ key) => {
    const old = furnitureAt(s, slot);
    if (old) removeFurniture(s, old.uid);
    return createFurniture(s, key, slot);
  };
  const bench = swap('1F:l1', 'workbench');
  bench.broken = true;
  swap('1F:lt1', 'radio');
  s.home.unlocked.B1 = true;
  swap('B1:g1', 'rubble');
  const loaded = /** @type {any} */ (JSON.parse(serialize(s)));
  keepAlive(loaded);
  const wb = findWorkbench(loaded);
  assert.equal(wb.cfg, 'workbench');
  assert.deepEqual(furnitureFunctions(loaded, wb).map((/** @type {any} */ e) => e.key).sort(), ['craft', 'drawer', 'repairWorkbench', 'studyWorkbench']);
  addItem(loaded, loaded.inventories[loaded.player.backpack], MANUAL, { allowOverweight: true });
  assert.ok(startFurnitureFunction(loaded, wb.uid, 'repairWorkbench'));
  tick(loaded, 2 * HOUR);
  assert.equal(wb.broken, false, 'the stand-in bench is repaired');
  const radio = furnitureAt(loaded, '1F:lt1');
  assert.equal(byKind(loaded, radio, 'radio')?.key, 'radio');
  const rubble = furnitureAt(loaded, 'B1:g1');
  keepAlive(loaded);
  assert.ok(startFurnitureFunction(loaded, rubble.uid, 'clearRubble'));
  tick(loaded, 2 * HOUR);
  assert.equal(furnitureAt(loaded, 'B1:g1'), null, 'the old rubble clears');
  assert.equal(loaded.progress.counters['rubble.cleared'], 1);
});
