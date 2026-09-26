// Coverage for FEATURES sections O, Q, R, S and T that no other test file exercised (audit docs/audit/part-O-T.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, newLoopData } from '../src/sim/state.js';
import { tick, die } from '../src/sim/tick.js';
import { applyCostsAndGains, getKind } from '../src/sim/actions.js';
import { dayStartT, dayNumber } from '../src/sim/time.js';
import '../src/sim/furnActions.js';
import { furnitureFunctions, startFurnitureFunction, homeSources } from '../src/sim/furnActions.js';
import { eatItem } from '../src/sim/itemuse.js';
import { tickStats, effectiveMax } from '../src/sim/stats.js';
import { installFurniture, furnitureAt, dismantle, allSlots, slotUsable, defenseLevel } from '../src/sim/home.js';
import { addItem, count, createInventory } from '../src/sim/inventory.js';
import { getMods, computeMods } from '../src/sim/modifiers.js';
import { containerRate } from '../src/sim/spoilage.js';
import { fuelSlotCount, batteryCapacity } from '../src/sim/power.js';
import { isRecipeCraftable } from '../src/sim/crafting.js';
import '../src/sim/unlocks.js';
import { PROF, FIVE_SYSTEMS, addProfExp, addProfLevels, profLevel } from '../src/sim/proficiency.js';
import { applyCard, availableCards, cardCost, ledgerTotals, COUNTER_LABELS } from '../src/sim/settlement.js';
import { buyAbility, prepareNextLoop } from '../src/sim/rebirth.js';
import { nextHorde, threatLevel } from '../src/sim/horde.js';
import {
  social, neighborState, listDrones, idleDrone, droneBusy, tradePartners, maxBuyable, droneCapacityKg, executeTrade, queueDroneOp,
  findSurvivor, survivorName, respondHelp, hasItemAtHome, veteranState, giveVeteran, foodSat, scavengeQuota, tradeQuota,
} from '../src/sim/social.js';
import { getThread, threadName, isPromptPosted } from '../src/sim/phone.js';
import { TRADING_POSTS } from '../src/content/people.js';
import { ABILITIES } from '../src/content/abilities.js';
import { PLANNING_CARDS } from '../src/content/planningCards.js';
import { packageToFurniture, SLOT, achievementConfig } from '../src/data/db.js';
import { emit } from '../src/engine/bus.js';
import { defaultHistory } from '../src/engine/save.js';
import { game } from '../src/game.js';
import { ACHIEVEMENTS, SPECIAL_IDS, checkAchievement, achievementProgress } from '../src/meta/achievements.js';
import { CODEX_CATS, codexList } from '../src/meta/codex.js';
import { endlessPoints, sanitizeAlloc, ALLOC_MAX_LV, ALLOC_STEP, endlessRecordText, ENDLESS_PURE } from '../src/meta/endless.js';
import { TV_GAMES, consoleAtHome, rewardTvPlay, profileSummary, PROFILE_STATS } from '../src/meta/profile.js';
import { entryInfo } from '../src/ui/codexPanel.js';
import { FACTORIES } from '../src/ui/tvGames.js';

const HOUR = 3600;

function postGame(character = 'wage', seed = 101, opts = {}) {
  const s = newGame({ seed, character, ...opts });
  s.phase = 'post';
  s.clock.t = s.clock.outbreakAt; // 18:00, Day 1
  s.run.day = 1;
  return s;
}

function advance(s, hours) {
  for (let i = 0; i < hours && s.phase === 'post'; i++) {
    Object.assign(s.player.stats, { sat: 100, sta: 100, mor: 100, life: 100 });
    tick(s, HOUR);
  }
}

// Jump to `hour` on `day`; run.day is left one behind so every onDay hook fires for that day.
function jumpTo(s, day, hour = 9) {
  s.clock.t = dayStartT(s.clock, day) + hour * HOUR - 1800;
  s.run.day = day - 1;
  advance(s, 1);
}

// The drone is a tabletop piece: swap it into a tabletop slot.
function installDrone(s, slot) {
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

// ---------------------------------------------------------------------------------------------- O. People
test('O02 unknown numbers: a courier leaves a drone at the door, a stranger asks for help, an airdrop tip sends the drone to coordinates', () => {
  const s = postGame('wage', 83);
  s.crises.disabled = true; // no hordes while jumping through the calendar
  advance(s, 1);

  jumpTo(s, 5, 8);
  const courier = getThread(s, 'unknown:courier');
  assert.ok(courier, 'an unknown number texts on Day 5 when there is no drone yet');
  assert.equal(threadName(s, courier), 'Unknown number');
  assert.ok(courier.messages.length >= 1 && courier.unread >= 1, 'unread badge on the new thread');
  assert.equal(hasItemAtHome(s, 14023), true, 'the drone package was left at the front door');

  jumpTo(s, 11, 10);
  const mother = findSurvivor(s, 'u_mother');
  assert.equal(mother.status, 'help', 'an unknown number asks for help on its day');
  assert.equal(survivorName(mother).en, 'Unknown number', 'shown as an unknown number until helped');
  const th = getThread(s, 'sv:u_mother');
  assert.equal(th.kind, 'unknown');
  assert.equal(th.messages.at(-1).kind, 'help');

  const d = installDrone(s, '1F:lt1');
  const r = respondHelp(s, { drone: d.uid, survivor: 'u_mother', give: give(s, 2161) });
  assert.ok(r.ok, r.reason);
  assert.equal(survivorName(mother).en, 'Mother with a baby', 'helping reveals who was texting');

  jumpTo(s, 40, 8);
  assert.deepEqual(social(s).coords.map((c) => c.id), ['airdrop']);
  assert.equal(threadName(s, getThread(s, 'unknown:airdrop')), 'Unknown number');
  s.inventories[d.cargo].items.length = 0; // collect any return gift first
  assert.ok(queueDroneOp(s, 'coords').ok);
  advance(s, 1);
  assert.equal(d.mission?.op, 'coords');
  advance(s, 7);
  assert.equal(count(s.inventories[d.cargo], 41000), 2, 'the airdrop crate is in the cargo hold');
  assert.equal(social(s).coords.length, 0);
});

test('O03 eight trading posts are on the air by Day 28; one-click buy stops at stock or drone capacity; a second drone flies while the first is out', () => {
  const s = postGame('wage', 81);
  s.crises.disabled = true;
  advance(s, 1);
  const d1 = installDrone(s, '1F:lt1');
  const d2 = installDrone(s, '1F:kt2');
  assert.equal(listDrones(s).length, 2, 'multiple drones');
  assert.ok(homeSources(s).includes(d1.cargo) && homeSources(s).includes(d2.cargo), 'both cargo holds are home storage');

  jumpTo(s, 28, 9);
  assert.equal(TRADING_POSTS.length, 8);
  const posts = tradePartners(s).filter((p) => p.kind === 'post');
  assert.equal(posts.length, 8, 'every trading post is reachable');
  for (const p of TRADING_POSTS) assert.ok(getThread(s, `post:${p.id}`)?.messages.length, `${p.id} texted when it came online`);

  // One-click buy ("Max"): as many as are in stock and still fit in the drone.
  assert.equal(droneCapacityKg(s), 10);
  assert.equal(maxBuyable(s, 'rail', 2115), 4, 'stock-limited');
  const crates = [{ id: 2101, qty: 2 }]; // 8 kg already in the basket
  assert.equal(maxBuyable(s, 'rail', 2115, crates), 2, 'weight-limited: 2 kg left for 1 kg cans');
  assert.equal(maxBuyable(s, 'rail', 2101, crates), 2, 'an item does not count against its own row');
  applyCard(s, 'cargoBay');
  assert.equal(droneCapacityKg(s), 15);
  assert.equal(maxBuyable(s, 'rail', 2115, crates), 4, 'a bigger cargo bay lifts the weight limit');

  const r1 = executeTrade(s, { partner: 'city', give: give(s, 2105, 3), take: [{ id: 20104, qty: 1 }] });
  assert.ok(r1.ok, r1.reason);
  assert.equal(r1.drone, d1.uid);
  assert.equal(droneBusy(s, d1), true);
  assert.equal(idleDrone(s, 'trade')?.uid, d2.uid, 'the other drone is not grayed out');
  const r2 = executeTrade(s, { partner: 'pharmacy', give: give(s, 2105, 3), take: [{ id: 2509, qty: 1 }] });
  assert.ok(r2.ok, r2.reason);
  assert.equal(r2.drone, d2.uid);
  assert.equal(executeTrade(s, { partner: 'farm', give: give(s, 2105, 3), take: [{ id: 2504, qty: 1 }] }).ok, false, 'both drones are out');
  advance(s, 3);
  assert.equal(s.progress.counters['trade.active.dealcount'], 2);
  assert.equal(s.progress.counters['trade.stranger.partner'], 2);
  assert.equal(count(s.inventories[d1.cargo], 20104), 1);
  assert.equal(count(s.inventories[d2.cargo], 2509), 1);
});

test('O07 feeding the trapped veteran to the last stage frees him (letter + supply-cache coordinates); a starved veteran is gone', () => {
  const s = postGame('warehouse', 52);
  s.crises.disabled = true;
  advance(s, 1);
  jumpTo(s, 6, 9);
  const v = veteranState(s);
  assert.ok(v && s.furniture[v.uid], 'he appears on Day 6');
  const pantry = createInventory(s, { kind: 'furniture', w: 30, h: 30 });
  const picks = [];
  let sat = 0;
  while (sat < 1100) {
    const inst = addItem(s, pantry, 2161, { allowOverweight: true });
    picks.push({ inv: pantry.id, uid: inst.uid });
    sat += foodSat(inst);
  }
  const r = giveVeteran(s, picks);
  assert.ok(r.ok);
  assert.deepEqual(r.rewards.map(([id]) => id), [41000, 2401, 20310, 2107, 41003, 9047], 'every stage pays out');
  assert.equal(v.done, true);
  assert.equal(s.furniture[v.uid], undefined, 'he climbed out of the guard booth');
  assert.ok(social(s).coords.some((c) => c.id === 'veteranCache'), 'coordinates for the drone');
  assert.equal(s.story.tags.TAG_VETERAN_DONE, true);
  assert.equal(count(s.inventories[s.player.backpack], 9047), 1, "the veteran's letter");
  assert.equal(s.progress.counters['veteran.fed'], r.sat);
  assert.equal(giveVeteran(s, give(s, 2161)).ok, false, 'nobody left to feed');

  const t = postGame('warehouse', 53);
  t.crises.disabled = true;
  advance(t, 1);
  jumpTo(t, 6, 9);
  const u = veteranState(t);
  for (let day = 7; day <= 12; day++) jumpTo(t, day, 9);
  assert.equal(u.gone, true, 'no food for six days');
  assert.equal(t.furniture[u.uid], undefined);
});

// ---------------------------------------------------------------------------------------------- Q. Rebirth
test('Q01 people who die leave Planning Points on a separate "Left by the Departed" settlement row', () => {
  const s = postGame('wage', 111);
  s.crises.disabled = true;
  advance(s, 1);
  const sv = social(s).survivors.find((x) => !x.unknown);
  Object.assign(sv, { status: 'network', inNetwork: true, food: 0 });
  jumpTo(s, 3, 9);
  assert.equal(sv.alive, false, 'the supported survivor ran out of food');
  assert.ok((ledgerTotals(s).departed || 0) > 0, 'their points are listed on the departed row');
  assert.ok(s.run.pointsLedger.some((r) => r.kind === 'departed' && r.note === sv.id), 'the row names who left them');
});

test('Q03 all seventeen named abilities are bought with Planning Points and change the simulation', () => {
  const NAMES = [
    'Quick Rest', 'Efficient Eating', 'Emotional Management', 'Energy-Saving Metabolism', 'Psychological Construction', 'Effort-Saving Tricks',
    'Hearty Meal Training', 'Energy Management', 'Thrifty', 'Daily Settlement Plan', 'Bulk Bargains', 'Broad Shoulders', 'Light Sleeper',
    'Energy Storage', 'Deep Freezing', 'Proper Refrigeration', 'Savings',
  ];
  const byName = {};
  for (const name of NAMES) {
    const def = ABILITIES.find((a) => a.name.en === name);
    assert.ok(def, `${name} exists`);
    byName[name] = def.id;
    const s = postGame('wage', 120);
    s.loop.planningPoints = 5000;
    const before = computeMods(s);
    const r = buyAbility(s, def.id);
    assert.ok(r.ok, `${name} can be learned`);
    assert.equal(r.cost, def.cost[0]);
    assert.equal(s.loop.planningPoints, 5000 - def.cost[0], 'paid with Planning Points');
    const after = getMods(s);
    for (const [k, v] of Object.entries(def.per)) {
      if (k === 'maxAdd') for (const [stat, n] of Object.entries(v)) assert.equal(after.maxAdd[stat], before.maxAdd[stat] + n, `${name}: max ${stat}`);
      else assert.ok(Math.abs(after[k] - (before[k] + v)) < 1e-9, `${name}: ${k}`);
    }
  }

  const pair = (ids) => {
    const base = postGame('wage', 121);
    const s = postGame('wage', 121);
    s.loop.planningPoints = 5000;
    for (const id of ids) assert.ok(buyAbility(s, id).ok);
    return [base, s];
  };
  // Efficient Eating: +15% satiety from the same meal.
  {
    const [base, s] = pair([byName['Efficient Eating']]);
    const gain = (st) => {
      st.player.stats.sat = 10;
      const bp = st.inventories[st.player.backpack];
      eatItem(st, bp, addItem(st, bp, 2105));
      return st.player.stats.sat - 10;
    };
    assert.ok(Math.abs(gain(s) - gain(base) * 1.15) < 1e-6);
  }
  // Energy-Saving Metabolism and Emotional Management: slower passive decay.
  {
    const [base, s] = pair([byName['Energy-Saving Metabolism'], byName['Emotional Management']]);
    const drop = (st) => {
      Object.assign(st.player.stats, { sat: 80, sta: 80, mor: 80, life: 100 });
      tickStats(st, HOUR);
      return [80 - st.player.stats.sat, 80 - st.player.stats.mor];
    };
    const [bs, bm] = drop(base);
    const [ss, sm] = drop(s);
    assert.ok(Math.abs(ss - bs * 0.9) < 1e-9 && Math.abs(sm - bm * 0.9) < 1e-9);
  }
  // Effort-Saving Tricks and Quick Rest on action costs and rest gains.
  {
    const [, s] = pair([byName['Effort-Saving Tricks'], byName['Quick Rest']]);
    s.player.stats.sta = 50;
    applyCostsAndGains(s, { kind: 'test', cost: { sta: 10 } });
    assert.ok(Math.abs(s.player.stats.sta - 41) < 1e-9, '10% less stamina');
    applyCostsAndGains(s, { kind: 'test', gain: { sta: 10 }, rest: true });
    assert.ok(Math.abs(s.player.stats.sta - 53) < 1e-9, '20% more from resting');
  }
  // Psychological Construction / Hearty Meal Training raise the caps.
  {
    const [, s] = pair([byName['Psychological Construction'], byName['Hearty Meal Training']]);
    assert.equal(effectiveMax(s, 'mor'), 115);
    assert.equal(effectiveMax(s, 'sat'), 115);
  }
  // Light Sleeper: sleep takes 20% less time.
  {
    const [, s] = pair([byName['Light Sleeper']]);
    const a = { dur: 6 * HOUR, furn: furnitureAt(s, '1F:r1').uid };
    getKind('sleep').begin(s, a);
    assert.equal(a.dur, Math.round(6 * HOUR * 0.8));
  }
  // Energy Storage, Deep Freezing, Proper Refrigeration.
  {
    const [base, s] = pair([byName['Energy Storage'], byName['Deep Freezing'], byName['Proper Refrigeration']]);
    assert.equal(batteryCapacity(s, { cfg: 45000 }), batteryCapacity(base, { cfg: 45000 }) * 1.2);
    const fridge = (st) => st.inventories[furnitureAt(st, '1F:k1').inv];
    const shelf = (st) => st.inventories[furnitureAt(st, '1F:l3').inv];
    assert.ok(Math.abs(containerRate(s, fridge(s)) - containerRate(base, fridge(base)) * 0.8) < 1e-9, 'fridges preserve 20% better');
    assert.ok(Math.abs(containerRate(s, shelf(s)) - containerRate(base, shelf(base)) * 0.85) < 1e-9, 'food outside the fridge spoils 15% slower');
  }
  // Thrifty discounts plans; Savings applies when the next round begins.
  {
    const [base, s] = pair([byName.Thrifty]);
    assert.equal(cardCost(s, 'heavyDoors'), Math.round(cardCost(base, 'heavyDoors') * 0.85));
    const next = newGame({ seed: 122, character: 'wage', loop: { ...newLoopData(), abilities: { savings: 1 } } });
    assert.equal(next.player.money, newGame({ seed: 122, character: 'wage' }).player.money + 150);
  }
});

test('Q06 a knowledge memory from an earlier loop pays off: the remembered blackout shows in the crisis bar two days ahead', () => {
  const plain = postGame('wage', 190);
  const loop = { ...newLoopData(), cycle: 2, memories: [{ id: 'blackout', day: 7, text: { en: 'The city-wide blackout comes on Day 7.', zh: '第7天全城停电。' } }] };
  const wise = postGame('wage', 190, { loop });
  for (const s of [plain, wise]) {
    s.crises.disabled = true;
    advance(s, 1);
  }
  const cut = wise.power.gridCutDay;
  jumpTo(plain, cut - 2, 9);
  jumpTo(wise, cut - 2, 9);
  assert.ok(wise.crises.upcoming.some((c) => c.id === 'blackout'), 'the survivor who remembers sees it coming');
  assert.ok(!plain.crises.upcoming.some((c) => c.id === 'blackout'), 'a first-timer gets no warning');
  jumpTo(plain, cut, 9);
  assert.ok(plain.loop.memories.some((m) => m.id === 'blackout' && m.day === cut), 'and now it is written down for the next loop');
});

test('Q07 New Game+ from the second loop: advanced front-door reinforcement at once and the Enhanced Reinforcement recipe on Day 30', () => {
  const doorCheck = (loop) => {
    const s = postGame('wage', 12, { loop });
    s.crises.disabled = true;
    const door = furnitureAt(s, '1F:door');
    for (const id of [20300, 20310, 20311]) addItem(s, s.inventories[s.player.backpack], id);
    door.hp = Math.round(door.maxHp / 3);
    const fns = furnitureFunctions(s, door);
    const adv = fns.filter((f) => f.spec.kind === 'reinforce' && f.spec.advanced);
    const bigRepair = fns.find((f) => f.spec.kind === 'repair' && f.spec.amount === 500);
    jumpTo(s, 30, 9);
    return { adv, bigRepair, enhanced: s.run.unlockedRecipes.includes(313) };
  };
  const first = doorCheck(undefined);
  assert.equal(first.adv.length, 2);
  assert.ok(first.adv.every((f) => !f.enabled && f.reason === 'Learn it first (quest)'), 'first loop: advanced reinforcement waits for the quest');
  assert.equal(first.enhanced, false);

  const dead = postGame('wage', 12);
  die(dead, 'life');
  const loop = prepareNextLoop(dead);
  assert.equal(loop.cycle, 2);
  assert.equal(loop.ngPlus, true, 'the second loop is New Game+');
  const ng = doorCheck(loop);
  assert.ok(ng.adv.every((f) => f.enabled), 'Advanced (+200) and Enhanced (+400) reinforcement usable right away');
  assert.equal(ng.bigRepair.enabled, true, 'Advanced Repair (+500) usable right away');
  assert.equal(ng.enhanced, true, 'Enhanced Reinforcement recipe on Day 30 in New Game+');
});

test('Q08 the named planning cards: Deep Cultivation, Scavenging, Endurance Drone, Capacity Upgrade I–III, Slow Roast and Fine Bake, Proper Storage, Fridge Management', () => {
  const card = (name) => {
    const c = PLANNING_CARDS.find((x) => x.name.en === name);
    assert.ok(c, `${name} exists`);
    return c;
  };
  const s = postGame('wage', 130);
  const base = postGame('wage', 130);

  applyCard(s, card('Deep Cultivation'));
  const m = getMods(s);
  assert.ok(Math.abs(m.growMult - 0.7) < 1e-9 && Math.abs(m.plantYield - 1.5) < 1e-9, 'slower, bigger harvests');
  const exp = (st) => {
    getMods(st);
    const p = st.progress.prof.plant;
    const was = p.exp;
    addProfExp(st, 'plant', 10);
    return p.exp - was;
  };
  assert.ok(Math.abs(exp(s) - exp(base) * 1.3) < 1e-9, 'extra planting proficiency (patch 08-20)');

  applyCard(s, card('Scavenging'));
  assert.equal(scavengeQuota(s), 2);
  applyCard(s, card('Endurance Drone'));
  assert.equal(tradeQuota(s), 2);

  const gen = { cfg: 42000, data: {} };
  const slots = fuelSlotCount(base, gen);
  for (const name of ['Capacity Upgrade I', 'Capacity Upgrade II', 'Capacity Upgrade III']) {
    assert.ok(availableCards(s).some((c) => c.id === card(name).id), `${name} is offered once the previous one is owned`);
    applyCard(s, card(name));
  }
  assert.equal(fuelSlotCount(s, gen), slots + 3, 'three extra fuel slots');

  assert.equal(isRecipeCraftable(s, 418), false);
  applyCard(s, card('Slow Roast and Fine Bake'));
  assert.equal(isRecipeCraftable(s, 418), true, 'electric oven recipe');

  const shelf = (st) => st.inventories[furnitureAt(st, '1F:l3').inv];
  applyCard(s, card('Proper Storage'));
  assert.ok(Math.abs(containerRate(s, shelf(s)) - containerRate(base, shelf(base)) * 0.75) < 1e-9);

  applyCard(s, card('Fridge Management'));
  for (const id of card('Fridge Management').recipes) assert.equal(isRecipeCraftable(s, id), true, `fridge recipe ${id}`);
});

test('Q09 five proficiency systems plus the defense level; maxing all five unlocks Renaissance Man (2112)', () => {
  assert.deepEqual(FIVE_SYSTEMS, ['cook', 'plant', 'craft', 'trap', 'explore']);
  assert.ok(PROF.defense, 'defense level');
  const s = postGame('wage', 140);
  assert.deepEqual(FIVE_SYSTEMS.map((k) => profLevel(s, k)), [1, 0, 2, 1, 1], 'Wage Slave starting levels');

  const need = PROF.trap.need[1];
  addProfExp(s, 'trap', need - 1);
  assert.equal(profLevel(s, 'trap'), 1);
  addProfExp(s, 'trap', 1);
  assert.equal(profLevel(s, 'trap'), 2, 'levels up at the threshold');

  for (const k of FIVE_SYSTEMS.slice(0, 4)) addProfExp(s, k, 1e7);
  assert.equal(checkAchievement(2112, s, defaultHistory()), false);
  assert.deepEqual(achievementProgress(2112, s, defaultHistory()), { value: 4, target: 5, raw: 4 });
  addProfExp(s, 'explore', 1e7);
  assert.ok(FIVE_SYSTEMS.every((k) => profLevel(s, k) === PROF[k].max));
  assert.equal(s.progress.counters['prof.allmax'], 1);
  assert.equal(checkAchievement(2112, s, defaultHistory()), true);

  const lv2 = allSlots(s).find((x) => x.type === SLOT.DEFENSE && x.lv === 2);
  assert.equal(defenseLevel(s), 0);
  assert.equal(slotUsable(s, lv2), false, 'a Lv2 defense slot is locked');
  addProfLevels(s, 'defense', 2);
  assert.equal(defenseLevel(s), 2);
  assert.equal(slotUsable(s, lv2), true, 'the defense level opens it');
});

test('Q10 any ending unlocks the next locked character: a Wage Slave ending unlocks the Warehouse Manager once the Student is unlocked', () => {
  game.history = defaultHistory();
  game.history.characters.student = true;
  emit('endingReached', { id: 'truth', character: 'wage' });
  assert.equal(game.history.characters.warehouse, true);
});

// ---------------------------------------------------------------------------------------------- R. Endless
test('R01 Pure Endless starts on the outbreak night with allocated max-stat points, narration and no neighbor; starting points grow with endings and achievements', () => {
  const h = defaultHistory();
  assert.equal(endlessPoints(h), 6);
  h.endings = { truth: true, girl: true };
  h.achievements = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [1000 + i, 1]));
  assert.equal(endlessPoints(h), 10, '+1 per ending, +1 per 10 achievements');
  assert.deepEqual(sanitizeAlloc({ sat: 9, sta: 3, mor: 2, life: 5 }, 10), { sat: ALLOC_MAX_LV, sta: 3, mor: 1 }, 'capped per attribute and by the budget');

  const p = newGame({ seed: 150, character: 'student', mode: 'pureEndless', endlessAlloc: { sat: 3, life: 2 }, endlessPoints: 5 });
  assert.equal(p.phase, 'post', 'no pre-disaster phase');
  assert.equal(p.clock.t, p.clock.outbreakAt, 'starts on the outbreak night');
  assert.equal(p.meta.endlessState, ENDLESS_PURE);
  assert.equal(p.player.max.sat, 100 + 3 * ALLOC_STEP, 'every allocated level counts (patch 08-14 fix)');
  assert.equal(p.player.max.life, 100 + 2 * ALLOC_STEP);
  assert.ok(p.log.some((e) => e.kind === 'story' && /hordes/i.test(e.text)), 'opening narration');
  assert.equal(neighborState(p).id, null, 'no neighbor across the rooftops');
  assert.equal(threatLevel(p), 1);
  p.crises.disabled = true;
  advance(p, 16);
  assert.equal(dayNumber(p.clock), 2);
  assert.equal(isPromptPosted(p, 'd2'), false, 'no story group chat');
  assert.equal(endlessRecordText(p, { endless: { best: { student: 12 } } }), 'Longest survival: 12 days');
});

test('R02 endless hordes vary with the threat level: more waves, more large zombies, tougher zombies', () => {
  const hordeAt = (threat) => {
    const s = newGame({ seed: 91, character: 'wage', mode: 'pureEndless' });
    s.crises.threat = threat;
    const e = nextHorde(s);
    assert.equal(e.kind, 'endless');
    s.clock.t = e.at - 120;
    s.run.day = e.day;
    for (let i = 0; i < 4 && !s.crises.horde; i++) {
      Object.assign(s.player.stats, { sat: 90, sta: 90, mor: 90, life: 100 });
      tick(s, 60);
    }
    return s.crises.horde;
  };
  const low = hordeAt(1);
  const high = hordeAt(6);
  assert.ok(low && high, 'both hordes attacked');
  assert.ok(high.waves.length > low.waves.length, `waves ${low.waves.length} -> ${high.waves.length}`);
  assert.ok(high.bigWaves.reduce((a, b) => a + b, 0) > low.bigWaves.reduce((a, b) => a + b, 0), 'more large zombies');
  assert.ok(high.total > low.total && high.hpMult > low.hpMult && high.dmgMult > low.dmgMult, 'bigger and tougher');
});

// ---------------------------------------------------------------------------------------------- S. Codex, achievements
test('S01 every entry of the six codex collections has a detail card with a name and stats', () => {
  let n = 0;
  for (const cat of CODEX_CATS) {
    for (const id of codexList(cat)) {
      const info = entryInfo(cat, id);
      assert.ok(info.name && !info.name.startsWith('#'), `${cat} ${id} has a name`);
      assert.ok(info.icon, `${cat} ${id} has an icon`);
      assert.ok(info.stats.length > 0, `${cat} ${id} has details`);
      n++;
    }
  }
  assert.equal(n, 173 + 493 + 34 + 19 + 125 + 87);
});

test('S03 hidden achievements and config thresholds drive the list and its progress bars', () => {
  const hidden = ACHIEVEMENTS.filter((a) => a.hidden).map((a) => a.id);
  assert.equal(hidden.length, achievementConfig.list.filter((c) => c.hidden).length);
  assert.equal(hidden.length, 18, 'the twelve ending/story achievements and six curiosities are hidden');
  assert.ok(hidden.includes(1101) && hidden.includes(9002));
  const counterBased = ACHIEVEMENTS.filter((a) => !SPECIAL_IDS.includes(a.id) && a.counter && a.threshold > 0);
  assert.ok(counterBased.length >= 25);
  for (const a of counterBased) {
    const s = postGame('wage', 160);
    s.progress.counters[a.counter] = a.threshold - 1;
    assert.equal(checkAchievement(a.id, s, defaultHistory()), false, `${a.id} below ${a.threshold}`);
    if (a.threshold > 1) assert.equal(achievementProgress(a.id, s, defaultHistory()).target, a.threshold, `${a.id} progress target`);
    s.progress.counters[a.counter] = a.threshold;
    assert.equal(checkAchievement(a.id, s, defaultHistory()), true, `${a.id} at ${a.threshold}`);
  }
});

test('S03 clue achievements read the per-line counters the story keeps: Puzzle (1203), Deep in the Hospital (2304), Name on the Delivery Slip (1223)', () => {
  const h = defaultHistory();
  const s = postGame('warehouse', 161);
  const c = s.progress.counters;
  c['clue.slip'] = 3;
  assert.equal(checkAchievement(1223, s, h), false, 'the delivery slips alone are not enough');
  s.story.route = 'supply';
  assert.equal(checkAchievement(1223, s, h), true, 'three slips and the supply station route');
  c['clue.slip'] = 2;
  assert.equal(checkAchievement(1223, s, h), false);
  c['clue.hospital'] = 3;
  c['clue.truth'] = 3;
  assert.equal(checkAchievement(2304, s, h), true, 'three hospital clues');
  assert.equal(checkAchievement(1203, s, h), false);
  assert.deepEqual(achievementProgress(1203, s, h), { value: 3, target: 4, raw: 3 });
  c['clue.truth'] = 4;
  assert.equal(checkAchievement(1203, s, h), true, 'all four truth clues');
});

test('S05 the survival archive lists lifetime kills, trades and the other run statistics', () => {
  const h = defaultHistory();
  h.counters['zombie.kill'] = 40;
  const s = postGame('wage', 170);
  Object.assign(s.progress.counters, { 'zombie.kill': 12, 'trade.active.dealcount': 3, 'drone.foraging.count': 2 });
  const stats = Object.fromEntries(profileSummary(h, s).stats.map((x) => [x.key, x.value]));
  assert.equal(stats['zombie.kill'], 40, 'lifetime kills from earlier loops');
  assert.equal(stats['trade.active.dealcount'], 3, 'trades');
  assert.equal(stats['drone.foraging.count'], 2);
  for (const key of ['wave.survived', 'crisis.survived', 'cook.count', 'plant.harvest', 'craft.total', 'trap.catch', 'explore.total', 'group.reply']) assert.ok(key in stats, key);
  for (const [key] of PROFILE_STATS) assert.ok(COUNTER_LABELS[key], `${key} has a label on the results pages`);
});

test('S05 the aid count (supplies delivered and gifted to survivors) is shown in the archive', () => {
  assert.ok(COUNTER_LABELS['survivor.aid'], 'labelled on the results pages');
  assert.ok(PROFILE_STATS.some(([key]) => key === 'survivor.aid'), 'listed in the survival archive');
  const h = defaultHistory();
  h.counters['survivor.aid'] = 4;
  const s = postGame('wage', 171);
  s.progress.counters['survivor.aid'] = 2;
  const stats = Object.fromEntries(profileSummary(h, s).stats.map((x) => [x.key, x.value]));
  assert.equal(stats['survivor.aid'], 4, 'lifetime aid count from earlier loops');
});

// ---------------------------------------------------------------------------------------------- T. Mini-games
const canvas = new Proxy(function () {}, { get: () => canvas, apply: () => canvas, set: () => true });

test('T01 five TV mini-games play to a game over with a score; the TV needs a game console; the handheld adds a daily bonus', () => {
  assert.equal(TV_GAMES.length, 5);
  assert.deepEqual(TV_GAMES.map((g) => g.id).sort(), Object.keys(FACTORIES).sort());
  assert.ok(TV_GAMES.some((g) => g.name.en === 'Snake') && TV_GAMES.some((g) => g.name.en === 'Space Invaders'));
  const inputs = {
    snake: () => ({}),
    invaders: () => ({ held: { fire: true } }),
    breakout: (i) => ({ pressed: { fire: i % 50 === 0 } }),
    stack: () => ({ pressed: { fire: true } }),
    runner: () => ({}),
  };
  for (const g of TV_GAMES) {
    const game1 = FACTORIES[g.id]();
    let i = 0;
    for (; i < 100000 && !game1.over; i++) {
      const inp = inputs[g.id](i);
      game1.update(0.05, { held: inp.held || {}, pressed: inp.pressed || {} });
      if (i % 25 === 0) game1.draw(canvas);
    }
    assert.equal(game1.over, true, `${g.id} ends`);
    assert.ok(Number.isInteger(game1.score) && game1.score >= 0, `${g.id} scores`);
    if (g.id === 'invaders') assert.ok(game1.score > 0, 'shooting invaders scores points');
  }

  const s = postGame('wage', 180);
  const tv = furnitureAt(s, '1F:lw1');
  const fn = furnitureFunctions(s, tv).find((f) => f.key === 219);
  assert.equal(fn?.spec.panel, 'tvgames', 'the TV offers "Play TV games"');
  assert.equal(consoleAtHome(s), null, 'no console in the starter home');
  const bp = s.inventories[s.player.backpack];
  addItem(s, bp, 5);
  assert.equal(consoleAtHome(s), 5);
  s.player.stats.mor = 50;
  const first = rewardTvPlay(s);
  assert.equal(first.mor, 8);
  assert.equal(first.max, undefined);
  assert.equal(rewardTvPlay(s), null, 'the bonus comes once a day');
  s.player.daily = {};
  addItem(s, bp, 11002);
  const points = s.loop.planningPoints;
  const handheld = rewardTvPlay(s);
  assert.equal(handheld.max, 1);
  assert.equal(s.loop.planningPoints, points + 3);
  assert.equal(s.player.max.mor, 101);
});

test('T02 darts, yoga, treadmill running and bookshelf reading once a day each; paper planes out of the window use up a plane', () => {
  const s = postGame('wage', 71);
  s.clock.t = dayStartT(s.clock, 2) + 9 * HOUR;
  s.run.day = 2;
  const put = (cfg, slot) => {
    const old = furnitureAt(s, slot);
    if (old) dismantle(s, old.uid);
    const r = installFurniture(s, cfg, slot);
    assert.ok(r.ok, `${cfg} into ${slot}`);
    return r.f;
  };
  const dart = put(70003, '1F:lw2');
  const mat = put(70005, '1F:l6');
  const mill = put(70004, '1F:l4');
  const shelf = put(80109, '1F:r2');
  const use = (f, key) => {
    Object.assign(s.player.stats, { sat: 90, sta: 90, mor: 50, life: 90 });
    const max = { ...s.player.max };
    assert.ok(startFurnitureFunction(s, f.uid, key), `function ${key} starts`);
    for (let i = 0; i < 24 && (s.actions.current || s.actions.queue.length); i++) tick(s, 600);
    const after = furnitureFunctions(s, f).find((x) => x.key === key);
    return { mor: s.player.stats.mor - 50, sta: s.player.stats.sta - 90, max, after };
  };
  const darts = use(dart, 201);
  assert.ok(darts.mor > 4 && darts.sta < 0, 'darts: morale for a little stamina');
  const yoga = use(mat, 35);
  assert.ok(yoga.mor > 6 && s.player.max.mor === yoga.max.mor + 1, 'yoga: morale and +1 max morale');
  const run = use(mill, 200);
  assert.ok(run.mor > 4 && s.player.max.sta === run.max.sta + 1, 'treadmill: morale and +1 max stamina');
  const read = use(shelf, 328);
  assert.ok(read.mor > 3 && s.player.max.mor === read.max.mor + 2, 'reading: morale and +2 max morale');
  for (const r of [darts, yoga, run, read]) assert.equal(r.after.enabled, false, 'once a day');

  const win = furnitureAt(s, '1F:win1');
  const plane = () => furnitureFunctions(s, win).find((x) => x.key === 226);
  assert.equal(plane().enabled, false, 'needs a paper airplane');
  const bp = s.inventories[s.player.backpack];
  addItem(s, bp, 20220);
  addItem(s, bp, 20220);
  const throw1 = use(win, 226);
  assert.ok(throw1.mor > 3);
  assert.equal(count(bp, 20220), 1, 'one plane used');
  assert.equal(plane().enabled, true, 'no daily limit while planes last');

  s.clock.t = dayStartT(s.clock, 3) + 8 * HOUR - 1800;
  tick(s, 1800);
  assert.equal(dayNumber(s.clock), 3);
  for (const [f, key] of [[dart, 201], [mat, 35], [mill, 200], [shelf, 328]]) {
    assert.equal(furnitureFunctions(s, f).find((x) => x.key === key).enabled, true, `${key} is back the next day`);
  }
});
