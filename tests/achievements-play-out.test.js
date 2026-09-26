// @ts-check
// Achievements earned outside the house (S03; https://steamcommunity.com/stats/4164790/achievements): exploring the city's sites on foot
// (src/sim/explore.js) and trading and scavenging by drone (src/sim/social.js), played through the sim's own actions
// and awarded by the live achievement wiring from what the sim counted. These runs are long, so the survivor is kept
// fed and rested at home and the openings patched between game hours: every achievement here counts what the
// survivor did (a config counter), none reads the survivor's stats or the house.
import test from 'node:test';
import assert from 'node:assert/strict';
import { S, begin, give, until, awarded, settle, HOUR } from './fixtures/play.mjs';
import { nextContainer, stash } from '../tools/balance/bots.mjs';

/** A run past the outbreak (Finish Preparation). @param {number} seed */
function afterOutbreak(seed) {
  const s = begin({ seed });
  assert.ok(S.predisaster.finishPreparation(s));
  return s;
}

/** Fed, rested, the openings at full strength (counter achievements only; see the header). @param {any} s */
function keepUp(s) {
  Object.assign(s.player.stats, { sat: 90, sta: 95, mor: 90, life: 100 });
  for (const f of S.home.doorAndWindows(s)) f.hp = S.home.effectiveMaxHp(f);
}

test('a morning outing a day, a new site whenever one opens, else the Ruined Supermarket: Go out for the first time, Traverse the Ruins, Scavenger, Delve Deep into the Ruins and First Blood', async () => {
  const X = S.explore;
  const s = afterOutbreak(2301);
  const c = s.progress.counters;
  const done = () => (c['explore.total'] || 0) >= 15 && (c.marketLoot || 0) >= 5 && (c['explore.points.distinct'] || 0) >= 4;
  for (let day = 0; day < 60 && s.phase === 'post' && !done(); day++) {
    // home, rested, a morning without an attack
    until(
      s,
      () => {
        keepUp(s);
        const h = S.time.hourOfDay(s.clock);
        return h >= 7 && h < 8 && !S.horde.underAttack(s) && S.actions.isIdle(s);
      },
      { step: 600, max: 30 * HOUR }
    );
    keepUp(s);
    const open = X.sites().map((/** @type {any} */ d) => d.id).filter((/** @type {string} */ id) => X.siteStatus(s, id)?.available);
    const seen = X.exploreState(s).visited || [];
    const site = open.find((/** @type {string} */ id) => !seen.includes(id)) || ((c.marketLoot || 0) < 5 && open.includes('supermarket') ? 'supermarket' : 'streets');
    assert.ok(X.startExploration(s, site).ok, `set out for ${site}`);
    // at the site: fight what comes close, search the nearest containers, retreat when hurt, tired or late
    for (let i = 0; i < 24 * 12 && X.exploreRun(s); i++) {
      const run = X.exploreRun(s);
      if (run.phase === 'site' && S.actions.isIdle(s)) {
        const z = X.adjacentZombie(s);
        const next = nextContainer(S, s, 60);
        const left = X.timeLeft(s);
        if (s.player.stats.life < 60 || s.player.stats.sta < 20 || (!z && (!next || (left != null && left < 45 * 60) || run.searched >= 3))) X.retreat(s);
        else if (z) X.queueFight(s, z.id);
        else X.queueDefault(s, next.id);
      }
      S.tick.tick(s, 300);
    }
    assert.equal(X.exploreRun(s), null, 'back home');
  }
  until(s, () => false, { max: HOUR });
  await settle();
  assert.ok(done(), `${c['explore.total']} outings, ${c['explore.points.distinct']} sites, ${c.marketLoot} supermarket runs`);
  assert.ok(awarded(2301), 'Go out for the first time');
  assert.ok(awarded(2302), 'Traverse the Ruins: 4 different exploration points');
  assert.ok(awarded(2303), 'Scavenger: 15 explorations this loop');
  assert.ok(awarded(2309), 'Delve Deep into the Ruins: the Ruined Supermarket scavenged 5 times');
  assert.ok(awarded(2201), 'First Blood: the first zombie killed');
});

test('every community group prompt answered on the phone as it comes, a stance or a food share, until Day 83: Between Neighbors', async () => {
  const Ph = S.phone;
  const s = afterOutbreak(9001);
  const c = s.progress.counters;
  for (let h = 0; h < 24 * 90 && s.phase === 'post' && (c['group.reply'] || 0) < 12; h++) {
    keepUp(s);
    S.tick.tick(s, HOUR);
    for (const p of Ph.pendingGroupPrompts(s)) {
      // a stance that costs nothing (the others hand over medicine or food)
      const free = p.type === 'stance' ? p.options.findIndex((/** @type {any} */ o) => !o.need) : -1;
      const r = p.type === 'stance' ? Ph.groupReply(s, p.id, Math.max(0, free)) : Ph.groupShareFood(s, p.id, 'photo');
      assert.ok(r.ok, `reply to ${p.id}: ${r.reason || ''}`);
    }
  }
  until(s, () => false, { max: HOUR });
  await settle();
  assert.equal(c['group.reply'], 12, `${c['group.reply']} replies by Day ${S.time.dayNumber(s.clock)}`);
  assert.ok(awarded(9001), 'Between Neighbors: 12 replies in the community group');
});

test('a drone on the kitchen shelf trading with every trading post as it comes online, and scavenging on the side: First Deal, Regular Customer, Supplier, Supply Chain and Aerial Scavenging', async () => {
  const So = S.social;
  const s = afterOutbreak(2305);
  const pkg = Number(Object.entries(S.db.packageToFurniture).find(([, v]) => v === S.people.DRONE_FURN)?.[0]);
  const [inst] = give(s, pkg);
  const slot = S.planning.slotsFor(s, S.people.DRONE_FURN)[0];
  assert.ok(slot && S.planning.queueInstall(s, s.player.backpack, inst.uid, slot.id), 'install the drone');
  until(s, () => S.actions.isIdle(s), { step: 600, max: 6 * HOUR });
  So.syncDrones(s);
  assert.equal(So.listDrones(s).length, 1, 'a drone');
  // what the posts take in payment: goods with a trade value, the most value per gram first
  const pay = /** @type {any[]} */ (Object.values(S.db.items))
    .filter((it) => it.trade > 0 && it.cat !== S.db.CAT.FOOD)
    .sort((a, b) => b.trade / Math.max(1, b.g) - a.trade / Math.max(1, a.g) || a.id - b.id);
  const c = s.progress.counters;
  const done = () => (c['trade.active.dealcount'] || 0) >= 30 && (c['trade.stranger.partner'] || 0) >= 8 && (c['drone.foraging.count'] || 0) >= 25;
  for (let h = 0; h < 24 * 60 && s.phase === 'post' && !done(); h++) {
    keepUp(s);
    S.tick.tick(s, HOUR);
    // unload the drone's hold and put everything away
    const bp = s.inventories[s.player.backpack];
    for (const d of So.listDrones(s)) {
      const hold = s.inventories[d.cargo];
      for (const it of [...(hold?.items || [])]) S.inventory.moveItem(s, hold, it.uid, bp, null, null, { allowOverweight: true });
    }
    stash(S, s);
    if ((c['drone.foraging.count'] || 0) < 25 && So.idleDrone(s, 'scavenge') && So.queueDroneOp(s, 'scavenge').ok) {
      until(s, () => S.actions.isIdle(s), { step: 600, max: 2 * HOUR });
      continue;
    }
    if (!So.idleDrone(s, 'trade')) continue;
    // the post dealt with least, its cheapest offer
    const post = So.tradePartners(s)
      .filter((/** @type {any} */ p) => p.kind === 'post' && !p.damaged)
      .sort((/** @type {any} */ a, /** @type {any} */ b) => a.deals - b.deals)[0];
    const offer = post && So.partnerStock(s, post.id).filter((/** @type {any} */ o) => o.qty > 0).sort((/** @type {any} */ a, /** @type {any} */ b) => a.price - b.price)[0];
    if (!offer) continue;
    const goods = [];
    let value = 0;
    for (const it of pay) {
      if (value >= offer.price) break;
      const [g] = give(s, it.id);
      const v = g && So.sellValue(s, post.id, g);
      if (!v || v <= 0) continue;
      goods.push({ inv: s.player.backpack, uid: g.uid });
      value += v;
    }
    So.executeTrade(s, { partner: post.id, give: goods, take: [{ id: offer.id, qty: 1 }] });
  }
  until(s, () => false, { max: 3 * HOUR });
  await settle();
  assert.ok(done(), `${c['trade.active.dealcount']} deals with ${c['trade.stranger.partner']} posts, ${c['drone.foraging.count']} scavenging runs`);
  assert.ok(awarded(2305), 'First Deal');
  assert.ok(awarded(2306), 'Regular Customer: 4 trading posts');
  assert.ok(awarded(2307), 'Supplier: 30 transactions');
  assert.ok(awarded(1222), 'Supply Chain: all 8 trading posts');
  assert.ok(awarded(2308), 'Aerial Scavenging: 25 drone scavenging runs this loop');
});
