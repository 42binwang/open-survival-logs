import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { tick } from '../src/sim/tick.js';
import '../src/sim/furnActions.js';
import { furnitureFunctions, startFurnitureFunction } from '../src/sim/furnActions.js';
import {
  startTravel,
  arriveAt,
  travelSeconds,
  shelfOffers,
  buy,
  buyCar,
  returnCar,
  trunkInv,
  doorstepInv,
  queueWallet,
  queueLoan,
  takeWallet,
  talkTo,
  talkToNpc,
  rushBlocked,
  startRush,
  interactFixture,
  riotSpots,
  shopFixtures,
  sellBlood,
  finishPreparation,
  stockpileKg,
  stockpileChecklist,
  pawnableFurniture,
  pawnFurniture,
  returnablePackages,
  returnPackage,
  queueReturnFurniture,
  groundInv,
  shopGrid,
  shopBlocked,
  accessTile,
} from '../src/sim/predisaster.js';
import { SHOPS, CARS, RUSH, BLOOD_PRICE, travelMinutes } from '../src/content/shops.js';
import { furnitureAt, homeFurniture } from '../src/sim/home.js';
import { addItem, count, createInventory } from '../src/sim/inventory.js';
import { hasEffect, effectiveMax } from '../src/sim/stats.js';
import { findPath, cellKey } from '../src/sim/scene.js';
import { on } from '../src/engine/bus.js';

const HOUR = 3600;
const bp = (s) => s.inventories[s.player.backpack];

function withPanels(fn) {
  const opened = [];
  const off = on('openPanel', (p) => opened.push(p));
  try {
    fn(opened);
  } finally {
    off();
  }
  return opened;
}

test('travelling to a shop takes game time, sets the scene and records the visit', () => {
  const s = newGame({ seed: 31 });
  const t0 = s.clock.t;
  const walk = travelMinutes('home', 'market') * 60;
  startTravel(s, 'market');
  tick(s, walk / 2);
  assert.equal(s.player.scene, 'home', 'still on the way');
  assert.equal(s.pre.travel?.dest, 'market');
  tick(s, walk);
  assert.equal(s.player.scene, 'shop:market');
  assert.equal(s.player.floor, 'S');
  assert.deepEqual([s.player.x, s.player.y], SHOPS.market.entrance);
  assert.deepEqual(s.pre.visited, ['market']);
  assert.ok(s.clock.t - t0 >= walk, 'the countdown kept running');
  startTravel(s, 'home');
  tick(s, walk + 600);
  assert.equal(s.player.scene, 'home');
  assert.equal(s.pre.location, 'home');
});

test('the front door "Go Out" opens the city map before the outbreak', () => {
  const s = newGame({ seed: 32 });
  const door = furnitureAt(s, '1F:door');
  const goOut = furnitureFunctions(s, door).find((f) => f.spec.kind === 'goOut');
  assert.ok(goOut, 'door offers Go Out');
  const opened = withPanels(() => {
    startFurnitureFunction(s, door.uid, goOut.key);
    tick(s, 120);
  });
  assert.ok(opened.some((p) => p.panel === 'map'));
});

test('every shop fixture and NPC can be reached from the entrance', () => {
  const s = newGame({ seed: 33, character: 'warehouse' });
  for (const [id, shop] of Object.entries(SHOPS)) {
    const grid = shopGrid(id);
    const blocked = shopBlocked(s, id);
    const [ex, ey] = shop.entrance;
    const targets = [...shopFixtures(s, id), ...shop.npcs.map((n) => ({ id: n.id, x: n.x, y: n.y, w: 1, h: 1 }))];
    for (const t of targets) {
      const tile = accessTile(s, id, t, { x: ex, y: ey });
      assert.ok(tile, `${id}/${t.id} has an access tile`);
      assert.ok(!blocked.has(cellKey(ex, ey)));
      const path = tile[0] === ex && tile[1] === ey ? [] : findPath(grid, ex, ey, tile[0], tile[1], blocked, { outside: true, goalAnyCell: true });
      assert.ok(path, `${id}/${t.id} reachable`);
    }
  }
});

test('stock tables use config prices: goods by item price, furniture by furniture price', () => {
  const s = newGame({ seed: 34 });
  const price = (shop, shelf, id) => shelfOffers(s, shop, shelf).find((o) => o.id === id)?.unit;
  assert.equal(price('market', 'staples', 2103), 35, 'rice');
  assert.equal(price('hardware', 'basic', 20002), 10, 'broken glass');
  assert.equal(price('hardware', 'fuel', 2131), 50, 'energy drink at the tool shop');
  assert.equal(price('farmers', 'mediumSeeds', 15026), 10, 'tomato seeds');
  assert.equal(price('farmers', 'planters', 14019), 150, 'hydroponic station');
  assert.equal(price('renovation', 'security', 14039), 100, 'titanium door');
  assert.equal(price('renovation', 'living', 14020), 80, 'solid wood bed');
  assert.equal(price('renovation', 'appliances', 14064), 50, 'small fuel generator');
  assert.equal(CARS.sedan.price, 500);
  const rice = shelfOffers(s, 'market', 'bestseller').find((o) => o.id === 2103);
  assert.ok(rice.rec === 3 && rice.bulk === 5, 'must-buy rice comes in bulk packs');
});

test('buying deducts money, adds items, records types and enforces weight, space and funds', () => {
  const s = newGame({ seed: 35 });
  arriveAt(s, 'market');
  const r = buy(s, 'market', 'staples', 2102);
  assert.ok(r.ok);
  assert.equal(s.player.money, 990);
  assert.equal(s.pre.spent, 10);
  assert.equal(count(bp(s), 2102), 1);
  assert.deepEqual(s.pre.foodTypes, [2102]);

  const bulk = buy(s, 'market', 'staples', 2102, { bulk: true });
  assert.ok(bulk.ok);
  assert.equal(bulk.n, 10);
  assert.equal(bulk.cost, 90, 'bulk packages are 10% cheaper');
  assert.equal(count(bp(s), 2102), 11);

  const before = s.player.money;
  bp(s).maxKg = 1;
  const heavy = buy(s, 'market', 'staples', 2103);
  assert.equal(heavy.ok, false);
  assert.equal(heavy.reason, 'weight');
  assert.equal(s.player.money, before, 'nothing charged');

  bp(s).maxKg = 100;
  bp(s).w = 1;
  bp(s).h = 1;
  bp(s).items = [];
  addItem(s, bp(s), 2102);
  assert.equal(buy(s, 'market', 'staples', 2102).reason, 'space');

  s.player.money = 5;
  assert.equal(buy(s, 'market', 'staples', 2103).reason, 'money');
  assert.ok(s.player.money >= 0);
});

test('Bulk Bargains makes bulk packages cheaper', () => {
  const s = newGame({ seed: 36, loop: { abilities: { bulkBargains: 2 } } });
  arriveAt(s, 'convenience');
  const ham = shelfOffers(s, 'convenience', 'specials').find((o) => o.id === 2114);
  assert.equal(ham.bulk, 10);
  assert.equal(ham.bulkPrice, Math.round(5 * 10 * (1 - 0.1 - 0.16)));
});

test('a car creates a trunk, holds goods outside the carry limit and speeds up travel', () => {
  const s = newGame({ seed: 37 });
  const walk = travelSeconds(s, 'home', 'market');
  arriveAt(s, 'carlot');
  const r = buyCar(s, 'sedan');
  assert.ok(r.ok);
  assert.equal(s.player.money, 500);
  const trunk = trunkInv(s);
  assert.ok(trunk && trunk.w === 12 && trunk.h === 8 && trunk.maxKg == null);
  assert.equal(buyCar(s, 'suv').reason, 'haveCar');
  const drive = travelSeconds(s, 'home', 'market');
  assert.equal(walk, 60 * 60);
  assert.equal(drive, 35 * 60);

  arriveAt(s, 'market');
  bp(s).maxKg = 1;
  assert.equal(buy(s, 'market', 'staples', 2103).reason, 'weight');
  assert.ok(buy(s, 'market', 'staples', 2103, { dest: 'trunk' }).ok, 'the trunk ignores carry weight');
  assert.equal(count(trunk, 2103), 1);

  arriveAt(s, 'carlot');
  assert.equal(returnCar(s).reason, 'trunkNotEmpty');
  trunk.items = [];
  const back = returnCar(s);
  assert.ok(back.ok);
  assert.equal(s.pre.trunk, null);
  assert.equal(s.pre.car, null);
});

test('furniture packages are delivered to the doorstep and can be returned while intact', () => {
  const s = newGame({ seed: 38 });
  arriveAt(s, 'renovation');
  const r = buy(s, 'renovation', 'security', 14039);
  assert.ok(r.ok && r.delivered);
  assert.equal(s.player.money, 900);
  const door = doorstepInv(s);
  assert.equal(s.home.doorstepInv, door.id);
  assert.equal(count(door, 14039), 1);
  assert.equal(s.pre.deliveries.length, 1);
  assert.equal(count(bp(s), 14039), 0, 'not carried');

  const pkg = returnablePackages(s).find((p) => p.id === 14039);
  assert.ok(pkg);
  assert.ok(returnPackage(s, pkg.invId, pkg.uid).ok);
  assert.equal(s.player.money, 1000);
  assert.equal(s.pre.spent, 0);
  assert.equal(count(door, 14039), 0);
});

test('wallet and phone loan add money once', () => {
  const s = newGame({ seed: 39 });
  queueWallet(s);
  tick(s, 10 * 60);
  assert.equal(s.player.money, 1070);
  assert.equal(s.pre.walletTaken, true);
  assert.equal(takeWallet(s).ok, false);
  queueLoan(s);
  tick(s, 10 * 60);
  assert.equal(s.player.money, 1570);
  assert.equal(s.pre.loanTaken, true);
  assert.equal(s.pre.budget, 1570, 'extra money raises the budget');
});

test('returning the starter flowerpot refunds $10', () => {
  const s = newGame({ seed: 40 });
  const pot = homeFurniture(s).find((f) => f.data.decorPlant);
  assert.ok(pot);
  queueReturnFurniture(s, pot.uid);
  tick(s, HOUR);
  assert.equal(s.player.money, 1010);
  assert.equal(s.furniture[pot.uid], undefined);
});

test('the neighbor at the Discount Supermarket gives $100 only once', () => {
  const s = newGame({ seed: 41 });
  arriveAt(s, 'market');
  const opened = withPanels(() => {
    talkToNpc(s, 'neighbor');
    tick(s, 10 * 60);
  });
  const talk = opened.find((p) => p.panel === 'npcTalk');
  assert.ok(talk && talk.gift === 100);
  assert.equal(s.player.money, 1100);
  assert.equal(s.pre.neighborCash, true);
  assert.ok(s.pre.metNpcs.includes('neighbor'));
  assert.equal(talkTo(s, 'neighbor').gift, 0);
  assert.equal(s.player.money, 1100);
});

test('the young customer remembers you on a later visit', () => {
  const s = newGame({ seed: 42 });
  arriveAt(s, 'convenience');
  assert.equal(talkTo(s, 'youngCustomer').remembered, false);
  assert.equal(talkTo(s, 'youngCustomer').remembered, false, 'same visit');
  arriveAt(s, 'home');
  arriveAt(s, 'convenience');
  assert.equal(talkTo(s, 'youngCustomer').remembered, true);
});

test('free loot spots can be searched once', () => {
  const s = newGame({ seed: 43 });
  arriveAt(s, 'carlot');
  assert.ok(shopFixtures(s, 'carlot').find((f) => f.id === 'jerrycan').exclaim);
  interactFixture(s, 'jerrycan');
  tick(s, 30 * 60);
  assert.equal(count(bp(s), 40000), 1, 'diesel');
  assert.equal(shopFixtures(s, 'carlot').find((f) => f.id === 'jerrycan').exclaim, false);
  interactFixture(s, 'jerrycan');
  tick(s, 30 * 60);
  assert.equal(count(bp(s), 40000), 1, 'nothing left');
});

test('searching a free loot spot in a shop takes two game minutes once the survivor is there', () => {
  const s = newGame({ seed: 43 });
  arriveAt(s, 'carlot');
  interactFixture(s, 'jerrycan');
  for (let i = 0; i < 3600 && s.actions.current?.phase !== 'work' && s.actions.queue.length + (s.actions.current ? 1 : 0) > 0; i++) tick(s, 1);
  assert.equal(s.actions.current?.phase, 'work', 'at the jerry can');
  const at = s.clock.t;
  for (let i = 0; i < 3600 && count(bp(s), 40000) === 0; i++) tick(s, 1);
  assert.equal(count(bp(s), 40000), 1, 'diesel');
  const took = s.clock.t - at;
  assert.ok(took >= 110 && took <= 130, `the search took ${took} game seconds (two minutes)`);
});

test('the doomsday rush takes 30 minutes, is blocked with less than 30 minutes left, and drops overflow', () => {
  const s = newGame({ seed: 44 });
  arriveAt(s, 'market');
  s.clock.t = s.clock.outbreakAt - 20 * 60;
  assert.equal(rushBlocked(s), 'rushLate');
  assert.equal(startRush(s), null);
  assert.equal(s.player.money, 1000);

  const t = newGame({ seed: 45 });
  arriveAt(t, 'market');
  t.clock.t = t.clock.outbreakAt - 2 * HOUR;
  bp(t).w = 2;
  bp(t).h = 2;
  assert.equal(rushBlocked(t), null);
  startRush(t);
  tick(t, 20 * 60);
  assert.equal(t.player.money, 1000, 'paid only when done');
  tick(t, 20 * 60);
  assert.equal(t.player.money, 1000 - RUSH.price);
  assert.equal(t.pre.rushUsed.market, true);
  const onFloor = groundInv(t, 'market')?.items.length || 0;
  assert.equal(bp(t).items.length + onFloor, RUSH.count, 'every rush item lands somewhere');
  assert.ok(onFloor > 0, 'items that do not fit drop on the floor');
  assert.ok(t.pre.foodTypes.length > 0, 'rush goods count as purchases');
});

test('riots in the last 3 hours leave limited free goods on shop floors', () => {
  const s = newGame({ seed: 46 });
  arriveAt(s, 'market');
  assert.equal(riotSpots(s, 'market').length, 0);
  s.clock.t = s.clock.outbreakAt - 3 * HOUR - 60;
  tick(s, 120);
  assert.equal(s.pre.riot, true);
  assert.ok(s.pre.news.some((n) => n.id === 'riot'), 'news reports people going mad');
  const spots = riotSpots(s, 'market');
  assert.equal(spots.length, 6);
  const money = s.player.money;
  interactFixture(s, spots[0].id);
  tick(s, 15 * 60);
  assert.equal(riotSpots(s, 'market').length, 5);
  const [id, n] = spots[0].items[0];
  assert.equal(count(bp(s), id), n, 'grabbed for free');
  assert.equal(s.player.money, money);
  arriveAt(s, 'hardware');
  assert.equal(riotSpots(s, 'hardware').length, 0, 'no riot at the hardware store');
  arriveAt(s, 'renovation');
  assert.equal(riotSpots(s, 'renovation').length, 6);
});

test('selling blood pays once and causes anemia after the outbreak', () => {
  const s = newGame({ seed: 47 });
  arriveAt(s, 'blackmarket');
  const r = sellBlood(s);
  assert.ok(r.ok);
  assert.equal(s.player.money, 1000 + BLOOD_PRICE);
  assert.equal(sellBlood(s).ok, false);
  assert.equal(hasEffect(s, 'anemia'), false);
  finishPreparation(s);
  assert.equal(s.phase, 'post');
  assert.equal(hasEffect(s, 'anemia'), true);
  assert.equal(effectiveMax(s, 'sta'), 75);
  assert.equal(s.player.effects.anemia.until - s.clock.t, 72 * HOUR, 'lasts the first 3 days');
});

test('outbreak brings the survivor home, unloads the trunk and finalizes pre-disaster stats', () => {
  const s = newGame({ seed: 48 });
  arriveAt(s, 'carlot');
  buyCar(s, 'sedan');
  arriveAt(s, 'hardware');
  assert.ok(buy(s, 'hardware', 'basic', 20002, { dest: 'trunk' }).ok);
  assert.ok(buy(s, 'hardware', 'basic', 20004, { dest: 'trunk' }).ok);
  arriveAt(s, 'market');
  assert.ok(buy(s, 'market', 'staples', 2103, { dest: 'trunk' }).ok);
  assert.ok(buy(s, 'market', 'staples', 2102).ok);
  const trunkItems = trunkInv(s).items.length;
  assert.equal(trunkItems, 3);
  const kgBefore = stockpileKg(s);

  tick(s, s.clock.outbreakAt - s.clock.t + 60);
  assert.equal(s.phase, 'post');
  assert.equal(s.player.scene, 'home', 'dragged home when time ran out');
  assert.equal(s.pre.hastyEscape, true);
  assert.equal(s.pre.trunk, null, 'trunk emptied');
  const bags = s.floorBoxes.filter((b) => s.inventories[b.inv]?.label === 'shoppingBag');
  assert.ok(bags.length > 0, 'shopping bags at the door');
  assert.equal(
    bags.reduce((n, b) => n + s.inventories[b.inv].items.length, 0),
    trunkItems
  );
  const c = s.progress.counters;
  assert.equal(c['pre.points'], 3);
  assert.equal(c['pre.foodTypes'], 2);
  assert.equal(c['pre.matTypes'], 2);
  assert.equal(c['pre.moneyLeft'], Math.round(s.player.money));
  assert.ok(Math.abs(c['pre.kg'] - kgBefore) < 0.01, `stockpile ${c['pre.kg']} kg`);
  assert.equal(s.progress.taboo.overspend, true, 'spent more than half the budget');
});

test('Finish Preparation starts the outbreak right away without a hasty escape', () => {
  const s = newGame({ seed: 49 });
  arriveAt(s, 'convenience');
  const sta = s.player.stats.sta;
  assert.ok(finishPreparation(s));
  assert.equal(s.phase, 'post');
  assert.equal(s.player.scene, 'home');
  assert.ok(!s.pre.hastyEscape);
  assert.ok(s.player.stats.sta > sta - 20);
  assert.equal(s.progress.counters['pre.points'], 1);
  assert.equal(s.progress.taboo.overspend, false);
});

test('the used-furniture buyer pawns home furniture for cash and leaves its contents at the door', () => {
  const s = newGame({ seed: 50 });
  const shelf = furnitureAt(s, '1F:l3');
  addItem(s, s.inventories[shelf.inv], 2102);
  arriveAt(s, 'renovation');
  assert.ok(pawnableFurniture(s).includes(shelf));
  assert.ok(!pawnableFurniture(s).some((f) => f.slot === '1F:door'), 'doors stay');
  const r = pawnFurniture(s, shelf.uid);
  assert.ok(r.ok);
  assert.equal(s.player.money, 1000 + r.price);
  assert.equal(furnitureAt(s, '1F:l3'), null);
  assert.equal(count(doorstepInv(s), 2102), 1);
});

test('the Stockpile Checklist rates 18 dimensions in 7 categories', () => {
  const s = newGame({ seed: 51 });
  const before = stockpileChecklist(s);
  assert.equal(before.length, 7);
  assert.equal(before.flatMap((c) => c.dims).length, 18);
  const staples = () => stockpileChecklist(s)[0].dims.find((d) => d.id === 'staples');
  assert.equal(staples().status, 'low');
  const trunk = createInventory(s, { kind: 'trunk', w: 12, h: 8 });
  s.pre.trunk = trunk.id;
  for (let i = 0; i < 4; i++) addItem(s, trunk, 2101);
  assert.equal(staples().value, 800);
  assert.equal(staples().status, 'plentiful');
});

test('the prologue opens once at the first tick unless skipped', () => {
  const s = newGame({ seed: 52 });
  const opened = withPanels(() => tick(s, 60));
  assert.equal(opened.filter((p) => p.panel === 'prologue').length, 1);
  assert.equal(withPanels(() => tick(s, 60)).filter((p) => p.panel === 'prologue').length, 0);
  const skipped = newGame({ seed: 53, skipPrologue: true });
  assert.equal(withPanels(() => tick(skipped, 60)).filter((p) => p.panel === 'prologue').length, 0);
});

test('Boston Ivy seeds are only offered to the College Student', () => {
  const shelfOf = (shop) => shop.fixtures.find((f) => f.items?.includes(15040));
  const shelf = shelfOf(SHOPS.farmers);
  assert.ok(shelf, 'the Farmers’ Market stocks them');
  for (const [character, offered] of [['student', true], ['wage', false], ['warehouse', false]]) {
    const s = newGame({ seed: 60, character });
    assert.equal(shelfOffers(s, 'farmers', shelf.id).some((o) => o.id === 15040), offered, character);
  }
});
