// Content the source game has that the recreation's sim never reached (docs/bugs.jsonl, the coverage gaps of
// docs/coverage/P0.md). Every test drives the sim to produce the item, button or dish; none writes the result.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { tick } from '../src/sim/tick.js';
import { dayStartT } from '../src/sim/time.js';
import '../src/sim/furnActions.js';
import { furnitureFunctions, startFurnitureFunction } from '../src/sim/furnActions.js';
import { furnitureAt, dismantle } from '../src/sim/home.js';
import { addItem, count } from '../src/sim/inventory.js';
import { neighborState, basketInventory, basketGiftUids, sendBasket, veteranState, social, requestHelp, respondHelp, listDrones } from '../src/sim/social.js';
import { installFurniture } from '../src/sim/home.js';
import { die } from '../src/sim/tick.js';
import { addProfExp } from '../src/sim/proficiency.js';
import { prepareNextLoop, MANUSCRIPTS } from '../src/sim/rebirth.js';
import { packageToFurniture } from '../src/data/db.js';
import { DRONE_HOURS, GIFT_AID_SAT } from '../src/content/people.js';
import { on } from '../src/engine/bus.js';
import { item, recipes } from '../src/data/db.js';
import { updateRouteAvailability } from '../src/sim/story.js';

const HOUR = 3600;
const bp = (s) => s.inventories[s.player.backpack];

function postGame(character = 'wage', seed = 31, opts = {}) {
  const s = newGame({ seed, character, ...opts });
  s.phase = 'post';
  s.clock.t = s.clock.outbreakAt; // 18:00, Day 1
  s.run.day = 1;
  return s;
}

function keepAlive(s) {
  Object.assign(s.player.stats, { sat: 100, sta: 100, mor: 100, life: 100 });
  s.player.effects = {};
}

function advance(s, hours) {
  for (let i = 0; i < hours && s.phase === 'post'; i++) {
    keepAlive(s);
    tick(s, HOUR);
  }
}

// Jump to `hour` on `day`; run.day is left one behind so every onDay hook fires for that day.
function jumpTo(s, day, hour = 9) {
  s.clock.t = dayStartT(s.clock, day) + hour * HOUR - 1800;
  s.run.day = day - 1;
  advance(s, 1);
}

// Repair the rooftop basket through its own function (1749), as a player does on the terrace.
function repairLine(s) {
  s.home.unlocked['2F'] = true;
  const junk = furnitureAt(s, '2F:p1');
  if (junk) dismantle(s, junk.uid);
  advance(s, 1);
  const n = neighborState(s);
  const basket = s.furniture[n.basketUid];
  assert.ok(startFurnitureFunction(s, basket.uid, 1749), 'the repair starts');
  advance(s, 2);
  assert.equal(n.basketRepaired, true);
  return basket;
}

test('BUG-0002: the College Student gives the kit at the basket (2121) although 2116 has the same label', () => {
  const s = postGame('student', 52);
  const basket = repairLine(s);
  jumpTo(s, 72, 10);
  const n = neighborState(s);
  n.hearts = 5; // five hearts and two rescues (tests/endings.test.js sets them the same way)
  n.rescueStage = 2;
  addItem(s, bp(s), 9048); // the Military Repair Kit
  const avail = updateRouteAvailability(s);
  assert.equal(avail.companion, true, 'Companionship is open');
  assert.notEqual(avail.girl, true, 'the neighbour-girl route is not the student’s');
  const menu = furnitureFunctions(s, basket);
  const gift = menu.find((e) => e.spec.kind === 'commit');
  assert.ok(gift, 'the basket offers the kit gift');
  assert.equal(gift.key, 2121, 'the companion’s function, not the hidden 2116');
  assert.equal(gift.enabled, true);
  assert.ok(startFurnitureFunction(s, basket.uid, 2121));
  advance(s, 2);
  assert.equal(s.story.route, 'companion');
  assert.equal(count(bp(s), 9048), 0, 'the kit went across');
});

test('BUG-0002: the Wage Slave still gets 2116 at the same basket', () => {
  const s = postGame('wage', 53);
  const basket = repairLine(s);
  jumpTo(s, 72, 10);
  const n = neighborState(s);
  n.hearts = 5;
  n.rescueStage = 2;
  s.story.tags.TAG_NEIGHBOR_RESCUE2_COMPLETE = true;
  addItem(s, bp(s), 9048);
  assert.equal(updateRouteAvailability(s).girl, true);
  const gifts = furnitureFunctions(s, basket).filter((e) => e.spec.kind === 'commit');
  assert.deepEqual(gifts.map((e) => e.key), [2116]);
});

// Fill the basket with ingredients and send it across; the return gift comes about ten hours later.
function sendAndWait(s, ids) {
  const inv = basketInventory(s);
  inv.items.length = 0;
  for (const id of ids) assert.ok(addItem(s, inv, id), `item ${id} fits the basket`);
  assert.ok(sendBasket(s).ok);
  advance(s, 12);
  const gifts = basketGiftUids(s);
  return inv.items.filter((it) => gifts.includes(it.uid)).map((it) => it.id);
}

test('BUG-0008: the girl next door sends back her own dish (the config’s “Her …” items) made from what you sent', () => {
  const s = postGame('wage', 61);
  repairLine(s);
  assert.equal(neighborState(s).id, 'student');
  const pigeon = recipes[4001]; // roast pigeon: one pigeon
  const back = sendAndWait(s, pigeon.items);
  assert.ok(back.includes(48501), `her roast pigeon came back (${back})`);
  assert.match(item(48501).d1, /邻家女孩/);
  assert.ok(!back.some((id) => pigeon.out.includes(id)), 'not the ordinary dish');

  // Every "Her …" dish the config has a recipe for is one she can cook: 298 of 299 (52644, her mushroom soup, has
  // no recipe in Config_CookingRecipe). Two recipes of one ingredient (4038 corn juice, 4048 roast corn) are her pick.
  const seen = new Set();
  for (let i = 0; i < 12 && seen.size < 2; i++) for (const id of sendAndWait(s, [2536])) if (id === 52520 || id === 52421) seen.add(id);
  assert.deepEqual([...seen].sort(), [52421, 52520], 'both corn dishes turn up');
});

test('BUG-0008: the man across the alley still cooks the ordinary dish', () => {
  const s = postGame('student', 62);
  repairLine(s);
  assert.equal(neighborState(s).id, 'wage');
  const back = sendAndWait(s, recipes[4001].items);
  assert.ok(back.some((id) => id === 8502 || id === 8503), `a Good or Normal roast pigeon (${back})`);
  assert.ok(!back.some((id) => id >= 48000 && id <= 54000), 'none of her dishes');
});

test('BUG-0003: the survivor walks out into the warehouse yard to the trapped veteran (42013) and opens func 1791', () => {
  const s = postGame('warehouse', 54);
  advance(s, 24 * 6);
  const v = veteranState(s);
  assert.ok(v, 'the veteran appears on Day 6');
  const f = s.furniture[v.uid];
  assert.deepEqual([f.floor, f.x, f.y], ['1F', 13, 14], 'in the yard, outside the front wall');
  const opened = [];
  const said = [];
  const offs = [on('openPanel', (p) => opened.push(p)), on('toast', (m) => m?.kind === 'bad' && said.push(m.text))];
  try {
    assert.ok(startFurnitureFunction(s, f.uid, 1791), 'the function queues');
    advance(s, 1);
  } finally {
    for (const off of offs) off();
  }
  assert.deepEqual(opened.map((p) => [p.panel, p.furn]), [['giveSupplies', f.uid]], `the panel opened (${said.join(' / ')})`);
  assert.equal(s.player.floor, '1F');
  assert.equal(Math.abs(s.player.x - 13) + Math.abs(s.player.y - 14), 1, `standing next to him (${s.player.x}, ${s.player.y})`);
});

test('BUG-0018: the fridge makes its own ice cubes (2906), and the ice bath takes them', () => {
  const s = postGame('wage', 63);
  jumpTo(s, 2, 10);
  const fridge = furnitureAt(s, '1F:k1');
  assert.ok(startFurnitureFunction(s, fridge.uid, 213), 'Make Ice Cubes');
  advance(s, 1);
  assert.equal(count(bp(s), 2906), 2, 'two fridge-made ice cubes');
  assert.match(item(2906).d1, /从冰箱制作/);
  Object.assign(s.player.stats, { sat: 30, sta: 30 });
  const tub = furnitureAt(s, '1F:b3');
  assert.ok(startFurnitureFunction(s, tub.uid, 208), 'the ice bath');
  tick(s, HOUR);
  assert.equal(count(bp(s), 2906), 0, 'the bath used them');
  assert.equal(s.progress.counters['bath.ice'], 1);
});

test('BUG-0027: a proficiency taken to its top level comes back as its Complete Manuscript, in the next backpack', () => {
  const s = postGame('wage', 64);
  addProfExp(s, 'cook', 20000); // cooked up to Lv5
  addProfExp(s, 'explore', 20000);
  assert.equal(s.progress.prof.cook.lv, 5);
  die(s, 'zombies');
  const loop = prepareNextLoop(s);
  const ms = loop.notes.filter((n) => Object.values(MANUSCRIPTS).includes(n.id));
  assert.deepEqual(ms.map((n) => n.id).sort(), [3036, 3038], 'the cooking and exploration manuscripts');
  const next = newGame({ seed: 65, loop });
  assert.equal(count(next.inventories[next.player.backpack], 3036), 1, 'in the backpack of the next round');
  const explore = loop.notes.filter((n) => n.prof === 'explore').reduce((a, n) => a + n.exp, 0);
  assert.ok(explore >= 0.7 * 15100 - 400, `the manuscript and notes still restore ~70% of exploration (${explore})`);
  assert.match(item(3036).d2, /上一轮/);
});

test('BUG-0037: the blood broker thanks you for food with Survivor’s Emergency Medicine (11008)', () => {
  let got = false;
  for (let seed = 1; seed <= 12 && !got; seed++) {
    const s = postGame('wage', 70 + seed);
    const old = furnitureAt(s, '1F:lt1');
    if (old) dismantle(s, old.uid);
    assert.ok(installFurniture(s, packageToFurniture[14023], '1F:lt1').ok, 'a drone');
    advance(s, 1);
    const d = listDrones(s)[0];
    const sv = social(s).survivors.find((x) => x.id === 'bloodBroker');
    assert.ok(sv && requestHelp(s, sv.id));
    const food = [];
    for (let sat = 0; sat < GIFT_AID_SAT + 10; sat += item(2161).sat) food.push({ inv: bp(s).id, uid: addItem(s, bp(s), 2161, { allowOverweight: true }).uid });
    const r = respondHelp(s, { drone: d.uid, survivor: sv.id, give: food });
    assert.ok(r.ok, r.reason);
    advance(s, Math.ceil(DRONE_HOURS.help) + 1);
    got = s.inventories[d.cargo].items.some((i) => i.id === 11008);
  }
  assert.ok(got, 'the medicine came back in the drone');
  assert.match(item(11008).d1, /幸存者/);
});

test('BUG-0038: the girl next door sends her College Acceptance Letter (41004) after her second rescue', () => {
  const s = postGame('wage', 66);
  repairLine(s);
  let guard = 0;
  while (!s.story.tags.TAG_NEIGHBOR_RESCUE2_COMPLETE && guard++ < 40) {
    const inv = basketInventory(s);
    inv.items.length = 0;
    for (let i = 0; i < 8; i++) addItem(s, inv, 2107);
    assert.ok(sendBasket(s).ok);
    advance(s, 12);
  }
  assert.equal(s.story.tags.TAG_NEIGHBOR_RESCUE2_COMPLETE, true);
  assert.ok(basketInventory(s).items.some((i) => i.id === 41004), 'her letter is in the basket');
});
