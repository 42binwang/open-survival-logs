// @ts-check
// Achievements about the house itself (S03; https://steamcommunity.com/stats/4164790/achievements), each earned by playing to its condition
// through the sim's own actions: repairs and story tasks, the bathtub, the planning queue installing furniture and the
// power system running it. The survivor is never fed, rested or healed by the test here, and no door, window or piece
// of furniture is touched except through the sim: these conditions read the house, so the run has to hold on its own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { S, G, begin, give, until, awarded, settle, HOUR } from './fixtures/play.mjs';
import { PREPPER, moraleTarget, shopForFood, stash } from '../tools/balance/bots.mjs';
import { FACTORIES } from '../src/ui/tvGames.js';

const { homeStock } = S.achievements;

/** Tick until the survivor has worked through the queue. @param {any} s @param {number} [max] */
const work = (s, max = 6 * HOUR) => until(s, () => S.actions.isIdle(s), { step: 300, max });

/** Travel to a map location before the outbreak and wait for the arrival. @param {any} s @param {string} dest */
function go(s, dest) {
  assert.ok(S.predisaster.startTravel(s, dest), `set out for ${dest}`);
  assert.ok(until(s, () => s.player.scene === (dest === 'home' ? 'home' : `shop:${dest}`), { step: 60, max: 3 * HOUR }), `reached ${dest}`);
}

/** Buy n units of an item from whichever shelf of the shop has it. @param {any} s @param {string} shop @param {number} id @param {number} n */
function buy(s, shop, id, n) {
  const shelf = S.shops.SHOPS[shop].fixtures.find((/** @type {any} */ f) => f.kind === 'shelf' && f.items.includes(id));
  for (let i = 0; i < n; i++) {
    const r = S.predisaster.buy(s, shop, shelf.id, id);
    assert.ok(r.ok, `bought ${id} (${r.reason || ''})`);
  }
}

/** The home piece offering a function of this kind. @param {any} s @param {string} kind */
function withFunction(s, kind) {
  for (const f of S.home.homeFurniture(s)) {
    const fn = S.furnActions.furnitureFunctions(s, f).find((/** @type {any} */ e) => e.spec.kind === kind);
    if (fn) return { f, fn };
  }
  return null;
}

/**
 * Before the outbreak: supermarket and convenience-store runs on foot for the cheapest food that keeps ten days or
 * more, stored at home after every trip, until the money or the hours run out.
 * @param {any} s
 */
function hoardFood(s) {
  const P = S.predisaster;
  for (let trip = 0; s.phase === 'pre'; trip++) {
    const shop = ['convenience', 'market'][trip % 2];
    if (S.time.secondsUntilOutbreak(s) < 2 * P.travelSeconds(s, 'home', shop) + 1800 || s.player.money < 5) break;
    go(s, shop);
    const offers = [];
    for (const f of S.shops.SHOPS[shop].fixtures) {
      if (f.kind !== 'shelf') continue;
      for (const o of P.shelfOffers(s, shop, f.id)) {
        const c = S.db.item(o.id);
        if (o.pkg || c.cat !== S.db.CAT.FOOD || !(c.sat > 0) || c.life < 10 || c.cut) continue;
        offers.push({ shelf: f.id, id: o.id, unit: o.unit, per: (c.sat * Math.max(1, c.uses || 1)) / o.unit });
      }
    }
    offers.sort((a, b) => a.unit - b.unit || b.per - a.per);
    for (const o of offers) for (let k = 0; k < 40 && P.buy(s, shop, o.shelf, o.id).ok; k++);
    go(s, 'home');
    stash(S, s);
  }
}

test('the College Student on Relaxed spends her savings on food that keeps: Family Assets', async () => {
  const s = begin({ seed: 2009, character: 'student', difficulty: 'relaxed' });
  hoardFood(s);
  assert.ok(S.predisaster.finishPreparation(s));
  until(s, () => false, { max: 2 * HOUR });
  await settle();
  assert.ok(homeStock(s).sat > 2000, `${homeStock(s).sat} satiety at home`);
  assert.ok(awarded(2009), 'Family Assets: over 2000 satiety of supplies at home');
});

test('the Warehouse Manager on Relaxed fills his shelves with cheap food: Inventory Check', async () => {
  const s = begin({ seed: 2009, character: 'warehouse', difficulty: 'relaxed' });
  hoardFood(s);
  assert.ok(S.predisaster.finishPreparation(s));
  until(s, () => false, { max: 2 * HOUR });
  await settle();
  const st = homeStock(s);
  assert.ok(st.sat >= 1200 && st.items >= 180 && st.storage >= 8, JSON.stringify(st));
  assert.ok(awarded(1221), 'Inventory Check: Satiety 1,200 / Items 180 / Storage Furniture 8 at once');
});

test('a solar panel, a fuel generator, a battery and a rat-cage generator upstairs, and the prepper keeping house: Powered and True Electrician', async () => {
  const s = begin({ seed: 2110 });
  go(s, 'hardware');
  buy(s, 'hardware', 20106, 2); // planks for the stairs
  buy(s, 'hardware', 40000, 4); // diesel
  go(s, 'market');
  shopForFood(S, s, 'market');
  go(s, 'home');
  stash(S, s);
  assert.ok(S.predisaster.finishPreparation(s));
  assert.ok(S.story.runQuestAction(s, 'repairStairs'));
  assert.ok(work(s) && s.home.unlocked['2F'], 'the stairs are repaired');
  const pieces = [14009, 14064, 14012, 14029].map((pkg) => {
    const [inst] = give(s, pkg);
    const cfg = S.db.packageToFurniture[pkg];
    const slot = S.planning.slotsFor(s, cfg)[0];
    assert.ok(slot && S.planning.queueInstall(s, s.player.backpack, inst.uid, slot.id), `install ${cfg}`);
    assert.ok(work(s));
    return S.home.homeFurniture(s).find((/** @type {any} */ f) => f.cfg === cfg);
  });
  assert.ok(pieces.every(Boolean), 'all four sources installed');
  const bp = s.inventories[s.player.backpack];
  const tank = S.power.fuelInventory(s, pieces[1]);
  for (const it of bp.items.filter((/** @type {any} */ i) => i.id === 40000)) assert.ok(S.inventory.moveItem(s, bp, it.uid, tank).ok, 'diesel in the tank');
  for (let i = 0; i < 12 * 24 * 6 && s.phase === 'post' && !(awarded(1201) && awarded(2110)); i++) {
    PREPPER.step(S, s);
    S.tick.tick(s, 600);
  }
  await settle();
  assert.equal(s.phase, 'post', `alive (${s.run.deathCause || ''})`);
  assert.ok(awarded(2110), 'Powered: the home runs on its own generator and battery');
  assert.ok(awarded(1201), 'True Electrician: all four kinds of source, and no outage for a day');
});

test('a titanium door and three bulletproof windows from the Renovation Company, reinforced to the limit, then the defense line: Iron Wall and Triple Defense', async () => {
  const s = begin({ seed: 2203 });
  go(s, 'renovation');
  buy(s, 'renovation', 14039, 1); // Titanium Alloy Door
  buy(s, 'renovation', 14040, 2); // Bulletproof Window: two on the shelf
  go(s, 'hardware');
  buy(s, 'hardware', 20004, 6); // sheet metal: door reinforcement
  buy(s, 'hardware', 20002, 12); // glass: window reinforcement
  go(s, 'renovation');
  buy(s, 'renovation', 14040, 1); // the shelf restocked
  go(s, 'hardware');
  buy(s, 'hardware', 20002, 6);
  go(s, 'market');
  shopForFood(S, s, 'market');
  go(s, 'home');
  stash(S, s);
  assert.ok(S.predisaster.finishPreparation(s));
  /** @param {number} [max] */
  const busy = (max = 6 * HOUR) => {
    for (let t = 0; t < max && !S.actions.isIdle(s) && s.phase === 'post'; t += 600) {
      PREPPER.step(S, s);
      S.tick.tick(s, 600);
    }
  };
  /** Until the survivor is rested and no attack is under way (the prepper keeps house meanwhile). */
  const ready = () => {
    for (let w = 0; w < 300 && (S.horde.underAttack(s) || s.crises.horde || s.player.stats.sta < 30); w++) {
      PREPPER.step(S, s);
      S.tick.tick(s, 600);
    }
  };
  const doorstep = S.predisaster.doorstepInv(s);
  for (const it of [...doorstep.items]) {
    const cfg = S.db.packageToFurniture[it.id];
    const target = S.planning.replaceTargets(s, cfg)[0];
    assert.ok(target, `an opening to replace with ${cfg}`);
    ready();
    assert.ok(S.planning.queueReplaceOpening(s, doorstep.id, it.uid, target.id));
    busy();
  }
  assert.deepEqual(S.home.doorAndWindows(s).map((/** @type {any} */ f) => f.cfg).sort(), [30002, 35002, 35002, 35002]);
  // reinforcing every opening to +300 is the defense practice that opens the line's Lv1 and Lv2 spots
  for (let round = 0; round < 10; round++) {
    let did = false;
    for (const f of S.home.doorAndWindows(s)) {
      const fn = S.furnActions.furnitureFunctions(s, f).find((/** @type {any} */ e) => e.spec.kind === 'reinforce' && e.enabled);
      if (!fn) continue;
      ready();
      S.furnActions.startFurnitureFunction(s, f.uid, fn.key);
      busy();
      did = true;
    }
    if (!did) break;
  }
  assert.ok(S.proficiency.profLevel(s, 'defense') >= 2, 'Defense Lv2');
  // the far spots first, so the devices already standing never block the way to the next one
  const spots = S.horde.defenseSlotsInfo(s).filter((/** @type {any} */ x) => !x.locked && !x.f).reverse();
  assert.ok(spots.length >= 12, `${spots.length} open spots on the defense line`);
  const PKG = [26002, 26003, 26004]; // spikes, electric net, chainsaw
  for (let i = 0; i < 12; i++) {
    give(s, PKG[i % 3]);
    for (let k = 0; k < 10 && !S.home.furnitureAt(s, spots[i].slot); k++) {
      ready();
      S.horde.queueInstallDefense(s, spots[i].slot, PKG[i % 3]);
      busy();
    }
  }
  until(s, () => false, { max: 2 * HOUR });
  await settle();
  assert.equal(s.phase, 'post', `alive (${s.run.deathCause || ''} on Day ${s.run.deathDay}, defense ${JSON.stringify(s.progress.prof.defense)}, ${['defense.spike', 'defense.net', 'defense.chainsaw'].map((k) => s.progress.counters[k])})`);
  assert.ok(awarded(2205), 'Iron Wall: every door and window at the highest level');
  assert.deepEqual(['defense.spike', 'defense.net', 'defense.chainsaw'].map((k) => s.progress.counters[k]), [4, 4, 4]);
  assert.ok(awarded(2203), 'Triple Defense: 4 spikes, 4 electric nets and 4 chainsaws');
});

test('planter packages from the farmers market, the upstairs and the basement opened for them: Green Thumb', async () => {
  const s = begin({ seed: 1211 });
  go(s, 'hardware');
  buy(s, 'hardware', 20106, 2); // planks for the stairs
  // waste plastic for eight Basic Small Flowerpot Packages at the workbench: what the hardware store has, the rest
  // from the car lot
  const plastic = () => S.inventory.count(s.inventories[s.player.backpack], 20003);
  while (plastic() < 16 && S.predisaster.buy(s, 'hardware', 'basic', 20003).ok);
  go(s, 'carlot');
  while (plastic() < 16 && S.predisaster.buy(s, 'carlot', 'parts', 20003).ok);
  assert.equal(plastic(), 16);
  /** Every small planter package on the farmers-market shelf (two of each kind, one after a restock). */
  const shopPlanters = () => {
    let n = 0;
    for (const o of S.predisaster.shelfOffers(s, 'farmers', 'planters')) {
      const cfg = S.db.packageToFurniture[o.id];
      if (!o.pkg || !(S.db.furn(cfg)?.plant > 0) || S.db.furn(cfg).slot !== S.db.furn(60000).slot) continue;
      for (let k = 0; k < o.left && S.predisaster.buy(s, 'farmers', 'planters', o.id).ok; k++) n++;
    }
    return n;
  };
  go(s, 'farmers');
  let bought = shopPlanters();
  go(s, 'market');
  shopForFood(S, s, 'market');
  go(s, 'farmers');
  bought += shopPlanters();
  assert.ok(bought >= 15, `${bought} small planter packages`);
  go(s, 'home');
  stash(S, s);
  assert.ok(S.predisaster.finishPreparation(s));
  /** @param {number} [max] */
  const busy = (max = 6 * HOUR) => {
    for (let t = 0; t < max && !S.actions.isIdle(s) && s.phase === 'post'; t += 600) {
      PREPPER.step(S, s);
      S.tick.tick(s, 600);
    }
  };
  assert.ok(S.story.runQuestAction(s, 'repairStairs'));
  busy();
  for (let day = 0; day < 4 && !s.home.unlocked.B1; day++) {
    if (S.story.runQuestAction(s, 'repairBasement')) busy();
    for (let i = 0; i < 24 * 6 && !(S.time.hourOfDay(s.clock) >= 8 && S.time.hourOfDay(s.clock) < 8.2); i++) {
      PREPPER.step(S, s);
      S.tick.tick(s, 600);
    }
  }
  assert.ok(s.home.unlocked['2F'] && s.home.unlocked.B1, 'upstairs and the basement are open');
  const rested = () => {
    for (let w = 0; w < 100 && (S.horde.underAttack(s) || s.player.stats.sta < 30); w++) {
      PREPPER.step(S, s);
      S.tick.tick(s, 600);
    }
  };
  // the workbench: its manual is somewhere in the house (the story's own task finds it), then eight flowerpots
  assert.ok(S.story.runQuestAction(s, 'workbench'), 'repair the workbench with its manual');
  busy();
  const POT = 300; // Basic Small Flowerpot Package
  for (let n = 0; n < 8; n++) {
    rested();
    assert.ok(S.crafting.craftOnce(s, POT), 'craft a flowerpot package');
    busy();
  }
  // wherever they are at home (the doorstep, the backpack, a shelf the prepper stashed them on)
  const planterPackages = () => S.planning.installablePackages(s).filter((/** @type {any} */ p) => S.db.furn(p.furnCfg)?.plant > 0);
  assert.ok(planterPackages().length >= 23, `${planterPackages().length} planter packages`);
  // the scene's clutter (the storeroom junk, the basement debris) is cleared with its own Dismantle to make room
  for (const f of S.home.homeFurniture(s).filter((/** @type {any} */ x) => x.data?.clutter)) {
    const fn = S.furnActions.furnitureFunctions(s, f).find((/** @type {any} */ e) => e.enabled && e.spec.kind === 'dismantle');
    if (!fn) continue;
    rested();
    assert.ok(S.furnActions.startFurnitureFunction(s, f.uid, fn.key), `dismantle ${f.cfg}`);
    busy();
  }
  // a spot the survivor cannot reach any more (the pots already standing in the way) is passed over
  const unreachable = new Set();
  for (let guard = 0; guard < 40 && planterPackages().length; guard++) {
    rested();
    const p = planterPackages()[0];
    // the basement and the upstairs first, the far spots of a floor first: pots near the stairs go in last
    /** @type {Record<string, number>} */
    const order = { B1: 0, '2F': 1, '1F': 2 };
    const spots = S.planning.slotsFor(s, p.furnCfg).reverse().sort((/** @type {any} */ a, /** @type {any} */ b) => (order[a.floor] ?? 3) - (order[b.floor] ?? 3));
    const slot = spots.find((/** @type {any} */ x) => !unreachable.has(x.id));
    assert.ok(slot, `a free spot for ${p.furnCfg}`);
    assert.ok(S.planning.queueInstall(s, p.invId, p.uid, slot.id));
    busy();
    if (!S.home.furnitureAt(s, slot.id)) unreachable.add(slot.id);
  }
  until(s, () => false, { max: 2 * HOUR });
  await settle();
  assert.equal(s.phase, 'post', `alive (${s.run.deathCause || ''})`);
  assert.ok(S.farming.homePlanters(s).length >= 24, `${S.farming.homePlanters(s).length} planters at home`);
  assert.ok(awarded(1211), 'Green Thumb: 24 planters at home');
});

/**
 * One round of the TV's Survivor Run (src/ui/tvGames.js), played the way a player plays it: look at the screen
 * (the frame the game draws), judge the speed from how far the next obstacle moved since the last frame, and jump
 * when it is about a quarter of a second away.
 */
function playRunner() {
  const OBSTACLE = new Set(['#6f8a4a', '#8a5a3a', '#7a6a4a']);
  const FEET = 79; // the runner's front edge on screen
  const g = /** @type {any} */ (FACTORIES.runner());
  let last = null;
  for (let frame = 0; frame < 60 * 300 && !g.over && g.score < 80; frame++) {
    /** @type {{ c: string, x: number }[]} */
    const drawn = [];
    const ctx = {
      fillStyle: '',
      font: '',
      textAlign: '',
      /** @param {number} x */
      fillRect(x) {
        drawn.push({ c: String(this.fillStyle), x });
      },
      createLinearGradient: () => ({ addColorStop() {} }),
      fillText() {},
    };
    g.draw(/** @type {any} */ (ctx));
    const next = drawn.filter((r) => OBSTACLE.has(r.c) && r.x > FEET).map((r) => r.x).sort((a, b) => a - b)[0];
    const speed = next != null && last != null && last > next ? (last - next) * 60 : 230;
    last = next ?? null;
    const jump = next != null && next - FEET < speed * 0.22;
    g.update(1 / 60, { held: {}, pressed: jump ? { fire: true } : {} });
  }
  return g.score;
}

test('a handheld console at home and a round of Survivor Run on the TV: TV Enthusiast', async () => {
  const s = begin({ seed: 9002 });
  assert.ok(S.predisaster.finishPreparation(s));
  give(s, 11002); // a handheld console (the VIP counter, the school or the hospital have them)
  assert.equal(S.profile.consoleAtHome(s), 11002);
  const tv = S.home.homeFurniture(s).find((/** @type {any} */ f) => S.furnActions.furnitureFunctions(s, f).some((/** @type {any} */ e) => e.key === 219 && e.enabled));
  assert.ok(tv, 'a TV with power');
  // a few rounds at most, each submitted the way the TV panel does when a round ends
  let score = 0;
  for (let round = 0; round < 5 && score < 70; round++) score = S.profile.submitTvScore(s, G.game.history, 'runner', playRunner()).best;
  assert.ok(score >= 70, `best ${score}`);
  until(s, () => false, { max: HOUR });
  await settle();
  assert.ok(awarded(9002), 'TV Enthusiast: 70 points in a TV mini-game');
});

test('the prepper on Relaxed, no help from the test: a month on long-keeping food with nothing spoiled (No Waste)', async () => {
  const s = begin({ seed: 2010, difficulty: 'relaxed' });
  s.ui.autonomy = true;
  for (let i = 0; i < 40 * 24 * 6 && s.phase !== 'dead' && !awarded(2010); i++) {
    PREPPER.step(S, s);
    S.tick.tick(s, 600);
    for (let a = S.story.activeEvent(s); a; a = S.story.presentNext(s)) S.story.resolveEvent(s, null);
    if (s.run.settlement) S.settlement.closeSettlement(s);
  }
  await settle();
  assert.equal(s.phase, 'post', `alive (${s.run.deathCause || ''})`);
  assert.ok(S.time.dayNumber(s.clock) >= 30);
  assert.ok(!s.progress.taboo.foodRot && !s.progress.counters['food.rot'], 'nothing spoiled');
  assert.ok(awarded(2010), 'No Waste: Day 30 without food spoiling this loop');
});

test('a full meal and some leisure after the first night: Steady and Stable', async () => {
  const s = begin({ seed: 2008, difficulty: 'relaxed' });
  s.ui.autonomy = true;
  for (let i = 0; i < 12 * 24 * 6 && s.phase !== 'dead' && !awarded(2008); i++) {
    const st = s.player.stats;
    if (s.phase === 'post' && S.actions.isIdle(s) && !s.player.sleeping && !S.horde.underAttack(s)) {
      if (st.sat < 85) {
        const food = S.suggest.bestFood(s);
        if (food) S.actions.enqueue(s, S.itemuse.useItemAction(s, food.invId, food.inst.uid, 'eat'));
      } else if (st.mor < 85) {
        const m = moraleTarget(S, s);
        if (m) S.furnActions.startFurnitureFunction(s, m.f.uid, m.fn.key);
      }
    }
    PREPPER.step(S, s);
    S.tick.tick(s, 600);
  }
  await settle();
  assert.ok(awarded(2008), 'Steady and Stable: Satiety, Morale, Stamina and Life all at 80 or above');
});

test('two bags of ice from the convenience store and a cold bath at home: Cold as Ice', async () => {
  const s = begin({ seed: 9005 });
  go(s, 'convenience');
  buy(s, 'convenience', 2507, 2);
  go(s, 'home');
  assert.ok(S.predisaster.finishPreparation(s), 'the disaster begins');
  // the bath is for a hungry, worn-out survivor (Satiety and Stamina at most 40): wait for that without eating
  let bath = withFunction(s, 'iceBath');
  until(s, () => !!(bath = withFunction(s, 'iceBath'))?.fn.enabled, { step: 600, max: 3 * 24 * HOUR });
  assert.ok(bath?.fn.enabled, `the bathtub takes the ice (${bath?.fn.reason || ''})`);
  assert.ok(S.furnActions.startFurnitureFunction(s, bath.f.uid, bath.fn.key));
  assert.ok(work(s));
  until(s, () => false, { max: HOUR });
  await settle();
  assert.equal(s.progress.counters['bath.ice'], 1);
  assert.ok(awarded(9005), 'Cold as Ice: a cold bath with ice cubes');
});

test('the stairs repaired with two planks and the basement cleared over two days: Underground and Rooftop', async () => {
  const s = begin({ seed: 2111 });
  assert.ok(S.predisaster.finishPreparation(s));
  give(s, 20106, 2);
  assert.ok(S.story.runQuestAction(s, 'repairStairs'), 'repair the stairs');
  assert.ok(work(s) && s.home.unlocked['2F'], 'upstairs is open');
  for (let day = 0; day < 4 && !s.home.unlocked.B1; day++) {
    if (S.story.runQuestAction(s, 'repairBasement')) work(s);
    until(s, () => S.time.hourOfDay(s.clock) >= 8 && S.time.hourOfDay(s.clock) < 9, { step: 600, max: 30 * HOUR });
  }
  assert.ok(s.home.unlocked.B1, 'the basement is open');
  until(s, () => false, { max: HOUR });
  await settle();
  assert.ok(awarded(2111), 'Underground and Rooftop: the basement and the second floor unlocked');
});
