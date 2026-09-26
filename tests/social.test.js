import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, newLoopData } from '../src/sim/state.js';
import { tick } from '../src/sim/tick.js';
import { dayStartT, dayNumber, hourOfDay } from '../src/sim/time.js';
import { furnitureFunctions, startFurnitureFunction, homeSources } from '../src/sim/furnActions.js';
import { installFurniture, furnitureAt, dismantle, dropNewItem } from '../src/sim/home.js';
import { addItem, count } from '../src/sim/inventory.js';
import { bumpMods } from '../src/sim/modifiers.js';
import { packageToFurniture, item } from '../src/data/db.js';
import { emit, on } from '../src/engine/bus.js';
import { getThread } from '../src/sim/phone.js';
import {
  social, neighborState, basketInventory, basketGiftUids, sendBasket, repairBasket, activeRescue, activeRequest, addNeighborAffinity,
  neighborReadyForRoute, heartsFor, listDrones, droneBusy, droneBlock, droneHasGift, tradePartners, sellValue, executeTrade,
  requestHelp, pendingHelp, respondHelp, deliverSupplies, aliveNetworkSurvivors, rescueDeliver, wmState, queueDroneOp,
  shieldState, markShieldDefended, catState, catEvent, catVisible, resolveCat, veteranState, giveVeteran, foodSat,
} from '../src/sim/social.js';
import { HEART_THRESHOLDS, BASKET_MAX_KG } from '../src/content/people.js';

function postGame(character = 'wage', seed = 31, opts = {}) {
  const s = newGame({ seed, character, ...opts });
  s.phase = 'post';
  s.clock.t = s.clock.outbreakAt; // 18:00, Day 1
  s.run.day = 1;
  return s;
}

function keepAlive(s) {
  Object.assign(s.player.stats, { sat: 100, sta: 100, mor: 100, life: 100 });
}

function advance(s, hours) {
  for (let i = 0; i < hours; i++) {
    keepAlive(s);
    tick(s, 3600);
  }
}

// The drone is a tabletop piece: swap it in for the radio in the living room.
function installDrone(s, slot = '1F:lt1') {
  const old = furnitureAt(s, slot);
  if (old) dismantle(s, old.uid);
  const r = installFurniture(s, packageToFurniture[14023], slot);
  assert.ok(r.ok, `drone installs into ${slot}`);
  return listDrones(s).find((d) => d.uid === r.f.uid);
}

function give(s, id, n = 1) {
  const bp = s.inventories[s.player.backpack];
  const picks = [];
  for (let i = 0; i < n; i++) picks.push({ inv: bp.id, uid: addItem(s, bp, id, { allowOverweight: true }).uid });
  return picks;
}

// Empty the basket (her gifts included), fill it and send it across.
function sendFood(s, id, n) {
  const inv = basketInventory(s);
  inv.items.length = 0;
  for (let i = 0; i < n; i++) assert.ok(addItem(s, inv, id), `item ${id} fits the basket`);
  return sendBasket(s);
}

const REQUEST_ITEM = { fever: 2406, bandage: 2400, sweet: 2132, veg: 2504, protein: 2162, drink: 2130, book: 3001, hygiene: 11011, staple: 2102 };

test('the basket line: repair on the terrace, 10 kg deliveries raise affinity, hearts and rescue progress, gifts come back', () => {
  const s = postGame('wage', 41);
  s.home.unlocked['2F'] = true;
  dismantle(s, furnitureAt(s, '2F:p1').uid); // the junk pile blocks the terrace door
  advance(s, 1);
  const n = neighborState(s);
  assert.equal(n.id, 'student', 'the girl next door');
  const basket = s.furniture[n.basketUid];
  assert.equal(basket.cfg, 9298);
  assert.deepEqual([basket.floor, basket.x, basket.y], ['2F', 12, 9], 'on the rooftop line anchor');
  assert.equal(sendBasket(s).ok, false, 'broken until repaired');
  assert.ok(furnitureFunctions(s, basket).some((f) => f.key === 1749 && f.spec.kind === 'basket'));

  const sta = s.player.stats.sta;
  assert.ok(startFurnitureFunction(s, basket.uid, 1749));
  tick(s, 2 * 3600);
  assert.equal(n.basketRepaired, true);
  assert.ok(!furnitureFunctions(s, basket).some((f) => f.key === 1749), 'the repair button goes away');
  assert.ok(s.player.stats.sta <= sta - 15, 'repairing costs stamina');
  assert.equal(s.player.floor, '2F', 'the survivor walked up to the terrace');
  assert.equal(s.progress.taboo.neighbor, true, 'the neighbor line has started');
  assert.equal(activeRescue(s).id, 'rescue1');

  const inv = basketInventory(s);
  assert.equal(inv.maxKg, BASKET_MAX_KG);
  assert.ok(addItem(s, inv, 2101) && addItem(s, inv, 2101), 'two 4 kg biscuit crates fit');
  assert.equal(addItem(s, inv, 2101), null, 'a third one is over 10 kg');
  inv.items.length = 0;

  const before = n.affinity;
  const r = sendFood(s, 2105, 8);
  assert.ok(r.ok);
  assert.equal(r.sat, 8 * item(2105).sat);
  assert.equal(inv.items.filter((it) => !basketGiftUids(s).includes(it.uid)).length, 0, 'everything went across');
  assert.equal(activeRescue(s).progress, r.sat, 'satiety delivered is rescue progress');
  assert.ok(n.affinity > before);
  assert.ok(n.foodDays > 8, 'her pantry grows');
  assert.equal(s.progress.counters['neighbor.delivery'], 1);

  let guard = 0;
  while (!s.story.tags.TAG_NEIGHBOR_RESCUE1_COMPLETE && guard++ < 10) assert.ok(sendFood(s, 2107, 8).ok);
  assert.equal(s.story.tags.TAG_NEIGHBOR_RESCUE1_COMPLETE, true);
  assert.equal(activeRescue(s).id, 'rescue2');
  assert.ok(n.hearts >= 1 && n.hearts === heartsFor(n.affinity), `hearts follow affinity (${n.affinity})`);
  assert.equal(s.loop.neighborAffinity, Math.floor(n.affinity * 0.5), 'half the affinity carries over to the next loop');

  advance(s, 12);
  assert.ok(basketGiftUids(s).length > 0, 'she put return gifts in the basket');
  assert.ok(basketInventory(s).items.some((it) => it.id === 24116), 'her first note');
  assert.equal(sendBasket(s).ok, false, 'gifts left in the basket are not sent back');
});

test('rescue tasks, text requests and five hearts set the Girl route tags', () => {
  const s = postGame('wage', 42);
  advance(s, 1);
  assert.ok(repairBasket(s));
  const n = neighborState(s);
  let guard = 0;
  while (!n.tasks.some((t) => t.id === 'rescue2' && t.done) && guard++ < 20) assert.ok(sendFood(s, 2107, 8).ok);
  assert.equal(s.story.tags.TAG_NEIGHBOR_RESCUE1_COMPLETE, true);
  assert.equal(s.story.tags.TAG_NEIGHBOR_RESCUE2_COMPLETE, true);
  assert.equal(activeRescue(s), null, 'the third task waits for the route commitment');

  s.story.route = 'girl';
  s.story.tags.TAG_LINE_GIRL_CHOSEN = true;
  advance(s, 24);
  const r3 = activeRescue(s);
  assert.equal(r3?.id, 'rescue3');
  assert.ok(sendFood(s, 2161, 5).ok);
  assert.equal(r3.progress, 300);
  assert.notEqual(s.story.tags.TAG_NEIGHBOR_RESCUE3_COMPLETE, true, 'also needs three text requests');

  for (guard = 0; guard < 12 && !s.story.tags.TAG_NEIGHBOR_RESCUE3_COMPLETE; guard++) {
    for (let h = 0; h < 24 && !activeRequest(s); h++) advance(s, 1);
    const req = activeRequest(s);
    assert.ok(req, 'she texts a request');
    assert.ok(getThread(s, 'neighbor').messages.some((m) => m.kind === 'request' && m.ref === req.id));
    assert.ok(sendFood(s, REQUEST_ITEM[req.req], 1).ok);
    assert.equal(req.done, true);
  }
  assert.equal(r3.reqDone, 3);
  assert.equal(s.story.tags.TAG_NEIGHBOR_RESCUE3_COMPLETE, true);
  assert.equal(n.rescueStage, 3);

  for (guard = 0; guard < 20 && n.hearts < 5; guard++) assert.ok(sendFood(s, 2400, 10).ok); // first-aid bandages
  assert.equal(n.hearts, 5);
  assert.ok(n.affinity >= HEART_THRESHOLDS[4]);
  assert.equal(s.story.tags.TAG_NEIGHBOR_ENDING_COZY, true, 'The Person Next Door');
  assert.ok(neighborReadyForRoute(s));
});

test('an ignored neighbor starves: TAG_NEIGHBOR_DEAD, or TAG_COMPANION_MAN_DEAD next door to the Student', () => {
  for (const [character, tag] of [
    ['wage', 'TAG_NEIGHBOR_DEAD'],
    ['student', 'TAG_COMPANION_MAN_DEAD'],
  ]) {
    const s = postGame(character, 43);
    advance(s, 1);
    const n = neighborState(s);
    assert.equal(n.id, character === 'wage' ? 'student' : 'wage');
    n.foodDays = 0;
    advance(s, 24 * 4);
    assert.equal(n.alive, false, `${character}: the neighbor died`);
    assert.equal(n.deadReason, 'starved');
    assert.equal(s.story.tags[tag], true);
    assert.equal(sendBasket(s).ok, false);
    assert.notEqual(s.progress.taboo.neighbor, true, 'never interacting keeps One Person\'s Hundred Days open');
  }
  const wm = postGame('warehouse', 43);
  advance(wm, 2);
  assert.equal(neighborState(wm).id, null, 'the Warehouse Manager has no neighbor');
  assert.equal(neighborState(wm).basketUid, null);
});

test('affinity carries over from the last loop; the girl surviving to Day 30 with 3 hearts unlocks the College Student', () => {
  const carried = postGame('wage', 44, { loop: { ...newLoopData(), neighborAffinity: 100 } });
  advance(carried, 1);
  assert.equal(neighborState(carried).affinity, 100);
  assert.equal(neighborState(carried).hearts, heartsFor(100));

  const unlocks = [];
  const off = on('unlockCharacter', (p) => unlocks.push(p.id));
  const s = postGame('wage', 44);
  advance(s, 1);
  repairBasket(s);
  addNeighborAffinity(s, HEART_THRESHOLDS[2]);
  neighborState(s).foodDays = 10;
  s.clock.t = dayStartT(s.clock, 30) - 3600;
  s.run.day = 29;
  advance(s, 2);
  off();
  assert.deepEqual(unlocks, ['student']);
});

test('drone trade: half-price buyback, refused goods, trade value, daily quota and trade counters', () => {
  const s = postGame('wage', 45);
  const d = installDrone(s);
  advance(s, 24 * 2 + 8); // Day 3: City Center Base Camp comes on the air
  assert.ok(tradePartners(s).some((p) => p.id === 'city'));
  assert.ok(getThread(s, 'post:city').messages.length > 0, 'the post texts when it comes online');

  const bp = s.player.backpack;
  const [glass] = give(s, 20002);
  const [vine] = give(s, 20107);
  const noodles = give(s, 2105, 2);
  const inst = (p) => s.inventories[p.inv].items.find((it) => it.uid === p.uid);
  assert.equal(sellValue(s, 'city', inst(glass)), null, 'they never buy what they sell');
  assert.equal(sellValue(s, 'city', inst(vine)), item(20107).trade / 2, 'their main category (materials) at half value');
  assert.equal(sellValue(s, 'city', inst(noodles[0])), item(2105).trade, 'other goods at full value');

  assert.equal(executeTrade(s, { drone: d.uid, partner: 'city', give: [vine], take: [{ id: 20104, qty: 1 }] }).ok, false, 'not enough trade value');
  assert.equal(executeTrade(s, { drone: d.uid, partner: 'city', give: [glass, ...noodles], take: [{ id: 20104, qty: 1 }] }).ok, false, 'refused goods block the deal');
  const r = executeTrade(s, { drone: d.uid, partner: 'city', give: noodles, take: [{ id: 20104, qty: 2 }] });
  assert.ok(r.ok, r.reason);
  assert.equal(count(s.inventories[bp], 2105), 0, 'the goods left with the drone');
  assert.ok(droneBusy(s, d));
  assert.equal(s.progress.counters['trade.active.dealcount'] || 0, 0, 'a deal counts once the drone is back');

  advance(s, 3);
  assert.equal(s.progress.counters['trade.active.dealcount'], 1);
  assert.equal(s.progress.counters['trade.stranger.partner'], 1);
  assert.equal(s.progress.taboo.trade, true, 'Going Solo is lost');
  assert.equal(count(s.inventories[d.cargo], 20104), 2, 'the purchase is in the cargo hold');

  const more = give(s, 2105, 2);
  const quota = executeTrade(s, { drone: d.uid, partner: 'city', give: more, take: [{ id: 20104, qty: 1 }] });
  assert.equal(quota.ok, false, 'one trade per drone per day');
  s.run.cards = ['enduranceDrone'];
  bumpMods(s);
  assert.ok(executeTrade(s, { drone: d.uid, partner: 'city', give: more, take: [{ id: 20104, qty: 1 }] }).ok, 'Endurance Drone adds a daily trade');
  advance(s, 3);
  assert.equal(s.progress.counters['trade.active.dealcount'], 2);
  assert.equal(s.progress.counters['trade.stranger.partner'], 1, 'partners are distinct trading posts');
});

test('drone scavenging fills the cargo hold, counts for Aerial Scavenging and has a daily limit; loot runs sweep the yard', () => {
  const s = postGame('wage', 46);
  const d = installDrone(s);
  assert.ok(startFurnitureFunction(s, d.uid, 1754));
  advance(s, 1);
  assert.ok(droneBusy(s, d));
  assert.equal(d.mission.op, 'scavenge');
  advance(s, 3);
  const cargo = s.inventories[d.cargo];
  assert.ok(cargo.items.length >= 3, 'scrap and supplies in the hold');
  assert.equal(s.progress.counters['drone.foraging.count'], 1);
  assert.notEqual(droneBlock(s, d, 'scavenge'), true, 'one scavenging run per day');
  const fn = furnitureFunctions(s, s.furniture[d.uid]).find((x) => x.key === 1754);
  assert.equal(fn.enabled, false);
  assert.match(fn.reason, /scavenged/);
  assert.ok(homeSources(s).includes(d.cargo), 'the cargo hold counts as home storage');
  assert.notEqual(s.progress.taboo.trade, true, 'scavenging is not trading');

  dropNewItem(s, 41007, '1F', 7, 12); // loot left in the yard after a horde
  cargo.items.length = 0;
  assert.ok(startFurnitureFunction(s, d.uid, 1772));
  advance(s, 2);
  assert.equal(count(cargo, 41007), 1, 'the yard loot is in the hold');

  advance(s, 24);
  assert.equal(droneBlock(s, d, 'scavenge'), true, 'the limit resets the next day');
});

test('help requests join the survivor network; supply drops, letters, return gifts, deaths and aliveNetworkSurvivors', () => {
  const s = postGame('wage', 47);
  const d = installDrone(s);
  advance(s, 1);
  const roster = social(s).survivors;
  assert.ok(roster.filter((x) => !x.unknown).length >= 10, 'people met before the disaster (default roster)');
  const [a, b] = roster.filter((x) => !x.unknown);
  assert.ok(requestHelp(s, a.id));
  assert.ok(requestHelp(s, b.id));
  assert.deepEqual(pendingHelp(s).map((x) => x.id), [a.id, b.id]);
  assert.equal(aliveNetworkSurvivors(s), 0);

  assert.equal(respondHelp(s, { drone: d.uid, survivor: a.id, give: give(s, 2143) }).ok, false, 'a marshmallow is not enough');
  const r = respondHelp(s, { drone: d.uid, survivor: a.id, give: give(s, 2161) });
  assert.ok(r.ok, r.reason);
  assert.equal(a.inNetwork, true);
  assert.equal(a.food, item(2161).sat / 40, 'their food countdown starts');
  assert.equal(aliveNetworkSurvivors(s), 1);
  advance(s, 3);
  assert.ok(getThread(s, `sv:${a.id}`).messages.some((m) => m.kind === 'letter'), 'they reply with a letter');

  s.story.route = 'stranger';
  const drop = deliverSupplies(s, { drone: d.uid, survivor: a.id, give: give(s, 2161, 2) });
  assert.ok(drop.ok, drop.reason);
  assert.equal(s.progress.counters['camp.prep.supply'], 1, 'Web Weaver counts drops on the stranger path');
  advance(s, 3);
  assert.equal(droneHasGift(s, d), true, 'enough food earns a return gift in the hold');
  assert.notEqual(droneBlock(s, d, 'deliver'), true, 'collect it before flying again');
  s.inventories[d.cargo].items.length = 0;
  assert.equal(droneBlock(s, d, 'deliver'), true);

  advance(s, 24 * 6);
  assert.equal(a.alive, false, 'food ran out');
  assert.equal(aliveNetworkSurvivors(s), 0);
  assert.equal(b.alive, true, 'an unanswered request has no countdown yet');
  assert.equal(b.status, 'help');
});

test('Warehouse Manager rescue: the truck note starts it and 10 drone deliveries unlock him (College Student only)', () => {
  const wage = postGame('wage', 48);
  advance(wage, 1);
  give(wage, 9014);
  advance(wage, 1);
  assert.equal(wmState(wage), null, 'not in the Wage Slave run');

  const unlocks = [];
  const off = on('unlockCharacter', (p) => unlocks.push(p.id));
  const s = postGame('student', 48);
  const d = installDrone(s);
  advance(s, 1);
  assert.equal(wmState(s), null);
  give(s, 9014);
  advance(s, 1);
  assert.equal(wmState(s)?.active, true, 'the note in the truck starts the rescue');
  assert.ok(getThread(s, 'wm').messages.length >= 2);
  for (let i = 0; i < 10; i++) {
    s.inventories[d.cargo].items.length = 0; // take his thank-you gift out of the hold
    const r = rescueDeliver(s, { drone: d.uid, give: give(s, 2161) });
    assert.ok(r.ok, `delivery ${i + 1}: ${r.reason}`);
    if (i === 0) assert.equal(rescueDeliver(s, { drone: d.uid, give: give(s, 2161) }).ok, false, 'one delivery a day');
    advance(s, 24);
  }
  off();
  assert.equal(wmState(s).deliveries, 10);
  assert.equal(wmState(s).done, true);
  assert.deepEqual(unlocks, ['warehouse']);
  assert.equal(s.story.tags.TAG_WM_RESCUED, true);
});

test('Shield of the Street: distress after Day 50, the lure summons a horde, three defenses win; ignored posts are damaged', () => {
  const summons = [];
  const off = on('summonHorde', (p) => summons.push(p));
  const s = postGame('wage', 49);
  const d = installDrone(s);
  advance(s, 1);
  for (const p of Object.values(social(s).posts)) p.unlocked = true;
  s.clock.t = dayStartT(s.clock, 51) + 6 * 3600;
  s.run.day = 51;
  const sh = shieldState(s);
  for (let round = 1; round <= 3; round++) {
    for (let h = 0; h < 24 * 6 && !sh.active; h++) advance(s, 1);
    assert.ok(sh.active, `round ${round}: a besieged post texts for help`);
    for (let h = 0; h < 30 && droneBusy(s, d); h++) advance(s, 1);
    s.inventories[d.cargo].items.length = 0;
    assert.ok(queueDroneOp(s, 'lure', { post: sh.active.post }).ok);
    advance(s, 1);
    assert.equal(d.mission?.op, 'lure');
    assert.equal(summons.length, round);
    assert.equal(summons[round - 1].reason, 'shield');
    const got = [];
    const offGot = on('gotItem', (p) => got.push(p.id));
    if (round === 1) {
      assert.equal(summons[0].size, 2);
      emit('hordeEnded', { state: s, success: true });
    } else {
      assert.ok(markShieldDefended(s));
    }
    offGot();
    assert.equal(sh.defended, round);
    assert.equal(got.length, 4, 'the post sends four support supplies');
    assert.ok(s.inventories[d.cargo].items.length > 0, 'into the drone hold (what does not fit lands beside the drone)');
  }
  off();
  assert.equal(s.story.tags.TAG_SHIELD_OF_STREET, true);
  assert.equal(s.story.tags.TAG_SHIELD_OF_THE_STREET, true);

  const ign = postGame('wage', 50);
  advance(ign, 1);
  for (const p of Object.values(social(ign).posts)) p.unlocked = true;
  ign.clock.t = dayStartT(ign.clock, 51) + 6 * 3600;
  ign.run.day = 51;
  const ish = shieldState(ign);
  for (let h = 0; h < 12 && !ish.active; h++) advance(ign, 1);
  const post = social(ign).posts[ish.active.post];
  advance(ign, 26);
  assert.equal(post.damaged, true, 'ignored posts get damaged');
  assert.ok(post.stock.filter((e) => e.qty > 0).length <= 2, 'only one or two items left on the shelves');
  ign.clock.t += 16 * 86400;
  ign.run.day = dayNumber(ign.clock);
  advance(ign, 24);
  assert.equal(post.damaged, false, 'recovered after 15 days');
});

test('doorstep cat: countdown picks the default, feeding builds trust into new events, no visits during hordes', () => {
  const s = postGame('wage', 51);
  advance(s, 15); // 09:00 on Day 2
  const c = catState(s);
  const visit = () => {
    c.nextAt = s.clock.t;
    for (let h = 0; h < 24 && !c.pending; h++) advance(s, 1);
    assert.ok(c.pending, 'a cat at the door');
    assert.ok(hourOfDay(s.clock) >= 8 && hourOfDay(s.clock) < 21, 'daytime visits');
  };
  visit();
  assert.equal(catEvent(s).id, 'stray');
  s.crises.active.push({ type: 'horde', label: 'Horde' });
  assert.equal(catVisible(s), false, 'hidden while a horde attacks');
  advance(s, 3);
  assert.ok(c.pending, 'the countdown pauses during the horde');
  s.crises.active = [];
  advance(s, 3);
  assert.equal(c.pending, null, 'the default choice was taken');
  assert.equal(s.progress.counters['cat.ignore'], 1);

  for (let i = 0; i < 2; i++) {
    visit();
    give(s, 2901);
    assert.ok(resolveCat(s, 'feed').ok);
  }
  assert.equal(c.trust, 4);
  visit();
  assert.equal(catEvent(s).id, 'return', 'more interactions unlock the next event');
  assert.equal(resolveCat(s, 'feed').ok, false, 'no food, no feeding');
  assert.ok(resolveCat(s, 'pet').ok);
});

test('trapped veteran (Warehouse Manager run): satiety counted by remaining portions, stages give military supplies', () => {
  const s = postGame('warehouse', 52);
  advance(s, 24 * 6);
  const v = veteranState(s);
  assert.ok(v, 'the veteran appears on Day 6');
  const f = s.furniture[v.uid];
  assert.equal(f.cfg, 42013);
  assert.ok(furnitureFunctions(s, f).some((fn) => fn.key === 1791 && fn.spec.panel === 'giveSupplies'));
  const [rice] = give(s, 2103);
  const inst = s.inventories[rice.inv].items.find((it) => it.uid === rice.uid);
  inst.uses = 2;
  assert.equal(foodSat(inst), 2 * item(2103).sat);
  const r = giveVeteran(s, [rice]);
  assert.ok(r.ok);
  assert.equal(r.sat, 15);
  const r2 = giveVeteran(s, give(s, 2161, 2));
  assert.ok(r2.rewards.some(([id]) => id === 41000), 'army biscuits at the first stage');
  assert.ok(count(s.inventories[s.player.backpack], 41000) >= 2);
});
