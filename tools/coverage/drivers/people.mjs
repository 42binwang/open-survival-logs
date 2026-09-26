// @ts-check
// People after the disaster (src/sim/social.js): drone trades with every trading post and every survivor who
// trades, return gifts for answered help requests, the neighbor's gifts across the rooftop line, the Warehouse
// Manager's thank-you gifts, the veteran's rewards and supply caches, the doorstep cat, and drone scavenging.
// Random gifts and scavenging run over several seeds. `part` picks one of them, so they spread over workers.
import { HOUR, advanceTo, give, keepAlive, keepSafe, loadSim, placeAtHome, postGame, runUntilIdle, unlockHome } from '../sim.mjs';
import { Recorder, trackUnlocks } from '../observe.mjs';

const NOTE = 9014; // the truck note that starts the Warehouse Manager line

/** @param {{ part: 'trade' | 'aid' | 'neighbor' | 'wm' | 'veteran' | 'cat' | 'scavenge', seeds?: number }} args */
export async function run({ part, seeds = 6 }) {
  const S = await loadSim();
  const So = S.social;
  const P = S.people;
  const rec = new Recorder();
  const off = trackUnlocks(S, rec, `people:${part}`);
  const items = /** @type {any[]} */ (Object.values(S.db.items));
  const food = items.filter((it) => it.cat === S.db.CAT.FOOD && it.sat >= 20 && !it.noUse && !it.cut && it.life !== 0).sort((a, b) => b.sat - a.sat || a.id - b.id);
  const bigFood = food[0].id;

  /** @param {any} s */
  const withDrone = (s) => {
    const f = placeAtHome(S, s, P.DRONE_FURN);
    if (!f) rec.warn(`people: the drone (${P.DRONE_FURN}) does not install`);
    So.syncDrones(s);
    return f;
  };
  /** @param {any} s @returns {any} a big crate for goods the survivor hands over (the backpack may be full) */
  const crate = (s) => S.inventory.createInventory(s, { kind: 'furniture', w: 20, h: 20, label: 'coverage crate' });
  /** @param {any} s @param {number} sat @returns {{ inv: string, uid: number }[]} food worth `sat`, ready to hand over */
  const packFood = (s, sat) => {
    const inv = crate(s);
    const n = Math.ceil(sat / S.db.item(bigFood).sat) + 1;
    return Array.from({ length: n }, () => ({ inv: inv.id, uid: S.inventory.addItem(s, inv, bigFood, { allowOverweight: true }).uid }));
  };
  /** @param {any} s  empty the drone holds into a crate at home (return gifts block the next flight) */
  const unload = (s) => {
    const to = crate(s);
    for (const d of So.listDrones(s)) {
      const hold = s.inventories[d.cargo];
      for (const it of [...(hold?.items || [])]) S.inventory.moveItem(s, hold, it.uid, to, null, null, { allowOverweight: true });
    }
  };
  /** @param {any} s @param {number} hours */
  const wait = (s, hours) => {
    for (let h = 0; h < hours * 2; h++) {
      S.tick.tick(s, HOUR / 2);
      keepAlive(s);
    }
  };

  if (part === 'trade') {
    // Pure Endless puts every survivor on the roster; they trade from first contact until they ask for help
    for (const day of [9, 29]) {
      const base = S.state.newGame({ seed: 71, character: 'wage', mode: 'pureEndless', skipPrologue: true });
      withDrone(base);
      advanceTo(S, base, day);
      unload(base);
      const pay = items.filter((it) => it.trade > 0 && it.cat !== S.db.CAT.FOOD).sort((a, b) => b.trade / Math.max(1, b.g) - a.trade / Math.max(1, a.g) || a.id - b.id);
      for (const partner of So.tradePartners(base)) {
        for (const offer of So.partnerStock(base, partner.id)) {
          const s = structuredClone(base);
          const inv = crate(s);
          /** @type {{ inv: string, uid: number }[]} */
          const giveList = [];
          let value = 0;
          for (const it of pay) {
            if (value >= offer.price) break;
            const inst = S.inventory.addItem(s, inv, it.id, { allowOverweight: true });
            const v = inst && So.sellValue(s, partner.id, inst);
            if (v == null || v <= 0) continue;
            giveList.push({ inv: inv.id, uid: inst.uid });
            value += v;
          }
          const w = rec.watch(s, `trade:${partner.id}`, () => {
            const r = So.executeTrade(s, { partner: partner.id, give: giveList, take: [{ id: offer.id, qty: 1 }] });
            if (r.ok) wait(s, P.DRONE_HOURS.trade + 0.5);
            return r;
          });
          if (!w.value.ok) rec.warn(`people: trading for ${offer.id} with ${partner.id} failed (${w.value.reason})`);
        }
      }
    }
  }

  if (part === 'aid') {
    // every help request answered with enough food for a return gift
    const base = S.state.newGame({ seed: 72, character: 'wage', mode: 'pureEndless', skipPrologue: true });
    withDrone(base);
    advanceTo(S, base, 37);
    unload(base);
    for (const sv of So.pendingHelp(base)) {
      for (let k = 1; k <= seeds; k++) {
        const s = structuredClone(base);
        s.rng = S.rng.seedRng(k);
        const picks = packFood(s, P.GIFT_AID_SAT + 10);
        const w = rec.watch(s, `aid:${sv.id}`, () => {
          const r = So.respondHelp(s, { survivor: sv.id, give: picks });
          if (r.ok) wait(s, P.DRONE_HOURS.help + 0.5);
          return r;
        });
        if (!w.value.ok) rec.warn(`people: answering ${sv.id} failed (${w.value.reason})`);
      }
    }
  }

  if (part === 'neighbor') {
    // the rooftop basket: food, medicine and liquor across the line; her gift comes back ten hours later
    for (const character of ['wage', 'student']) {
      const base = postGame(S, { seed: 73, character });
      unlockHome(S, base);
      if (!So.repairBasket(base)) {
        rec.warn(`people: the ${character}'s basket line could not be repaired`);
        continue;
      }
      const dishSet = /** @type {any[]} */ (Object.values(S.db.recipes)).filter((r) => r.items?.length === 2);
      for (let k = 1; k <= seeds * 2; k++) {
        const s = structuredClone(base);
        s.rng = S.rng.seedRng(k);
        const inv = So.basketInventory(s);
        // odd rounds send a dish's exact ingredients (she cooks it), even rounds plain food (a bento or sundries)
        const send = [bigFood, 2400, 15504, 15505, 15506, 2137, ...(k % 2 ? dishSet[k % dishSet.length].items : [])];
        for (const id of send) S.inventory.addItem(s, inv, id, { allowOverweight: true });
        const w = rec.watch(s, `neighbor:${character}`, () => {
          if (k % 4 === 0) So.addNeighborAffinity(s, 400); // three hearts and more: dishes come back as Good
          const r = So.sendBasket(s);
          if (r.ok) wait(s, 11);
          return r;
        });
        if (!w.value.ok) rec.warn(`people: sending the ${character}'s basket failed (${w.value.reason})`);
      }
      // a neighbor who cooks dishes of her own (the girl next door, NEIGHBORS.student.ownDishOffset): every exact
      // recipe's ingredients sent on their own (she picks between the dishes of one ingredient set, so those sets go
      // across on a few seeds)
      const cooksOwn = !!P.NEIGHBORS[So.neighborState(base).id]?.ownDishOffset;
      const exact = /** @type {any[]} */ (Object.values(S.db.recipes)).filter((r) => cooksOwn && r.items?.length);
      const sameSet = (/** @type {any} */ r) => exact.filter((x) => [...x.items].sort().join() === [...r.items].sort().join()).length;
      exact.forEach((r, i) => {
        for (let k = 0; k < (sameSet(r) > 1 ? 4 : 1); k++) {
          const s = structuredClone(base);
          s.rng = S.rng.seedRng(1000 + i * 8 + k);
          const inv = So.basketInventory(s);
          for (const id of r.items) S.inventory.addItem(s, inv, id, { allowOverweight: true });
          const w = rec.watch(s, `neighbor:${character}:dish`, () => {
            const res = So.sendBasket(s);
            if (res.ok) wait(s, 11);
            return res;
          });
          if (!w.value.ok) rec.warn(`people: sending recipe ${r.id}'s ingredients to the ${character}'s neighbor failed (${w.value.reason})`);
        }
      });
      // a keepsake comes with each heart she gives; hearts lost and won back bring the next keepsake of that level
      const s = structuredClone(base);
      rec.watch(s, `neighbor:${character}:keepsakes`, () => {
        for (let round = 0; round < 6; round++) {
          So.addNeighborAffinity(s, 600);
          So.addNeighborAffinity(s, -600);
        }
      });
    }
  }

  if (part === 'wm') {
    // the College Student feeds the Warehouse Manager by drone ten times, once a day
    const s = postGame(S, { seed: 74, character: 'student' });
    withDrone(s);
    give(S, s, NOTE);
    wait(s, 2);
    if (!So.wmState(s)?.active) rec.warn('people: the truck note did not start the Warehouse Manager line');
    for (let i = 0; i < P.WM_DELIVERIES && So.wmState(s)?.active; i++) {
      advanceTo(S, s, S.time.dayNumber(s.clock) + 1);
      unload(s);
      const picks = packFood(s, P.MIN_AID_SAT + 10);
      const w = rec.watch(s, 'wm', () => {
        const r = So.rescueDeliver(s, { give: picks });
        if (r.ok) wait(s, P.DRONE_HOURS.rescue + 0.5);
        return r;
      });
      if (!w.value.ok) rec.warn(`people: delivery ${i + 1} to the Warehouse Manager failed (${w.value.reason})`);
    }
  }

  if (part === 'veteran') {
    // the Warehouse Manager's trapped veteran: feed him through every stage, then fly to his cache and the airdrop
    const s = postGame(S, { seed: 75, character: 'warehouse' });
    withDrone(s);
    advanceTo(S, s, P.VETERAN.appearDay + 1);
    if (!So.veteranState(s)) rec.warn('people: the veteran never appeared');
    const need = P.VETERAN.stages.at(-1).need;
    rec.watch(s, 'veteran', () => So.giveVeteran(s, packFood(s, need + 20)));
    for (const day of [S.time.dayNumber(s.clock), ...P.COORD_TIPS.map((/** @type {any} */ c) => c.day)]) {
      advanceTo(S, s, day);
      while (So.social(s).coords.length) {
        unload(s);
        const q = So.queueDroneOp(s, 'coords');
        if (!q.ok) {
          rec.warn(`people: the coordinates flight failed (${q.reason})`);
          break;
        }
        rec.watch(s, 'coords', () => {
          runUntilIdle(S, s, HOUR);
          wait(s, P.DRONE_HOURS.coords + 0.5);
        });
      }
    }
  }

  if (part === 'cat') {
    // the doorstep cat: feed it whenever it comes, take what it brings, until the guardian visit
    // (a visit waits two game hours for an answer, so the house is checked every hour)
    for (let k = 1; k <= Math.ceil(seeds / 2); k++) {
      const s = postGame(S, { seed: 80 + k, character: 'wage' });
      for (let h = 0; h < 45 * 24 && s.phase === 'post'; h++) {
        keepSafe(S, s);
        S.tick.tick(s, HOUR);
        keepAlive(s);
        const ev = So.catEvent(s);
        if (!ev) continue;
        give(S, s, bigFood, 3);
        const pickChoice = ev.choices.find((/** @type {any} */ c) => c.give) || ev.choices.find((/** @type {any} */ c) => c.id === 'feed') || ev.choices[0];
        rec.watch(s, 'cat', () => So.resolveCat(s, pickChoice.id));
      }
    }
  }

  if (part === 'scavenge') {
    const base = S.state.newGame({ seed: 76, character: 'wage', mode: 'pureEndless', skipPrologue: true });
    withDrone(base);
    wait(base, 1);
    for (let k = 1; k <= seeds * 10; k++) {
      const s = structuredClone(base);
      s.rng = S.rng.seedRng(k);
      const q = So.queueDroneOp(s, 'scavenge');
      if (!q.ok) {
        rec.warn(`people: scavenging failed (${q.reason})`);
        break;
      }
      rec.watch(s, 'drone:scavenge', () => {
        runUntilIdle(S, s, HOUR);
        wait(s, P.DRONE_HOURS.scavenge + 0.5);
      });
    }
  }
  off();
  return rec.obs;
}
