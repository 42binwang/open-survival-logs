// @ts-check
// Balance bots: players that act only through the sim's own actions, as the UI would (travel takes its game time,
// shopping pays and fits the backpack, repairs cost stamina). Every choice follows from the state, so a bot replays
// identically from a save. The survivor's own autonomy (src/sim/autonomy.js: eat, sleep, find some leisure) stays on
// for every bot, as it is by default in the game.
// - idle: autonomy only. The floor: what the house and the starting pantry give.
// - prepper: spends the preparation hours on supermarket trips for ready-to-eat food that keeps three weeks, best
//   satiety and morale per dollar, and stores it at home. After the outbreak it keeps the house standing (repairs
//   the most damaged door or window below 60 % during an attack, below 90 % between attacks, with stamina to spare)
//   and its spirits up (below 70 % morale it uses the home's best morale per minute: radio, bath, games). With a
//   horde due within 12 hours it saves its stamina for the repairs: below 60 % it rests first, and its leisure costs
//   no stamina. It never cooks, farms, crafts, trades, sets traps or explores.
// - forager: the prepper, and when less than two weeks of food is left it scavenges by day: the first open site of
//   the Nearby Streets, the Ruined Supermarket and the rest, only with no horde due within a day, fed and rested; it
//   searches the nearest containers it can open (loot goes into the backpack), fights a zombie that reaches it only
//   while fresh and retreats when hurt, tired, loaded or short of daylight. Hurt, it does not set out. It keeps itself
//   fed: while its Life is below max, and before every trip, it eats until Satiety is 10 over the Life-regeneration
//   threshold (src/sim/stats.js REGEN_SAT). It treats wounds with the medicine it brings home: bleeding, at home or at
//   the site, with the cheapest item that clears it; hurt at home, with a Life-restoring item. It buys none.

/**
 * @typedef {object} Bot
 * @property {string} id
 * @property {string} title
 * @property {boolean} [oneSeed]  its outcome does not depend on the seed, so it plays one seed per difficulty
 * @property {(S: Record<string, any>, state: any) => void} step  called every 10 game minutes
 */

import { MEDICINE } from '../../src/content/itemEffects.js';
import { defenderStep } from './defender.mjs';

/** Minutes of margin before the outbreak that a trip must leave. */
const TRIP_MARGIN_MIN = 30;

/** @param {Record<string, any>} S @param {any} state */
const idle = (S, state) => S.actions.isIdle(state) && !state.player.path?.length;

/**
 * Food the survivor eats as it is: autonomy eats it (src/sim/suggest.js bestFood), raw meat it would not.
 * @param {Record<string, any>} S
 * @param {any} cfg
 */
const eats = (S, cfg) => !!cfg && cfg.cat === S.db.CAT.FOOD && cfg.sat > 0 && !cfg.noUse && !(cfg.cook && cfg.sub === 2);

/**
 * Food worth carrying: ready to eat (autonomy eats it; raw meat it would not), keeps at least three weeks.
 * @param {any} cfg
 */
const readyToEat = (cfg) => cfg && cfg.sat > 0 && !cfg.noUse && !(cfg.cook && cfg.sub === 2) && cfg.life >= 21;

/**
 * Moves everything in the backpack into home storage (fridges first for food), as the player drags it over.
 * @param {Record<string, any>} S
 * @param {any} state
 */
export function stash(S, state) {
  const bp = state.inventories[state.player.backpack];
  const inv = S.home.storageInventories(state).map((/** @type {string} */ id) => state.inventories[id]).filter(Boolean);
  inv.sort((/** @type {any} */ a, /** @type {any} */ b) => (b.cold || 0) - (a.cold || 0));
  let moved = 0;
  for (const it of [...bp.items]) {
    for (const to of inv) {
      if (S.inventory.moveItem(state, bp, it.uid, to).ok) {
        moved++;
        break;
      }
    }
  }
  return moved;
}

/**
 * Buys ready-to-eat food at the current shop, best satiety per dollar first (bulk when it is cheaper), until the
 * backpack or the wallet is full.
 * @param {Record<string, any>} S
 * @param {any} state
 * @param {string} shopId
 */
export function shopForFood(S, state, shopId) {
  const P = S.predisaster;
  const offers = [];
  for (const f of S.shops.SHOPS[shopId].fixtures) {
    if (f.kind !== 'shelf') continue;
    for (const o of P.shelfOffers(state, shopId, f.id)) {
      const cfg = S.db.item(o.id);
      if (!readyToEat(cfg) || o.pkg) continue;
      // morale counts double: eating is also how the survivor keeps their spirits up (compressed biscuits cost morale)
      const worth = (cfg.sat + 2 * Math.max(-5, cfg.mor || 0)) * Math.max(1, cfg.uses || 1);
      if (worth <= 0) continue;
      offers.push({ shelf: f.id, o, cfg, sat: worth, perDollar: worth / o.unit, perKg: worth / Math.max(0.05, cfg.g / 1000) });
    }
  }
  offers.sort((a, b) => b.perDollar - a.perDollar || b.perKg - a.perKg || a.o.id - b.o.id);
  let spent = 0;
  for (const x of offers) {
    for (let guard = 0; guard < 50; guard++) {
      const fresh = P.shelfOffers(state, shopId, x.shelf).find((/** @type {any} */ o) => o.id === x.o.id);
      if (!fresh || fresh.left <= 0) break;
      const bulk = fresh.bulk > 0 && fresh.left >= fresh.bulk && fresh.bulkPrice <= state.player.money && fresh.bulkPrice < fresh.unit * fresh.bulk;
      const r = P.buy(state, shopId, x.shelf, x.o.id, { bulk });
      if (!r.ok) {
        if (bulk) {
          const one = P.buy(state, shopId, x.shelf, x.o.id);
          if (one.ok) {
            spent += one.cost;
            continue;
          }
        }
        break;
      }
      spent += r.cost;
    }
  }
  return spent;
}

/**
 * The door or window most in need of a repair, and the repair function to use on it.
 * @param {Record<string, any>} S
 * @param {any} state
 * @param {number} below  share of max HP under which it needs one
 */
export function repairTarget(S, state, below) {
  let best = null;
  for (const f of S.home.doorAndWindows(state)) {
    const max = S.home.effectiveMaxHp(f);
    if (!max || f.hp / max >= below) continue;
    const fns = S.furnActions.furnitureFunctions(state, f).filter((/** @type {any} */ fn) => fn.enabled && fn.spec.kind === 'repair');
    if (!fns.length) continue;
    fns.sort((/** @type {any} */ a, /** @type {any} */ b) => (b.spec.amount || 0) - (a.spec.amount || 0));
    if (!best || f.hp / max < best.share) best = { f, fn: fns[0], share: f.hp / max };
  }
  return best;
}

/**
 * The home's best morale per minute that needs no items and little stamina (radio, bath, games, TV); with `free`,
 * none at all.
 * @param {Record<string, any>} S
 * @param {any} state
 * @param {boolean} [free]
 */
export function moraleTarget(S, state, free = false) {
  let best = null;
  for (const f of S.home.homeFurniture(state)) {
    for (const fn of S.furnActions.furnitureFunctions(state, f)) {
      const sp = fn.spec;
      if (!fn.enabled || !(sp.gain?.mor > 0) || sp.need?.length || (sp.cost?.sta || 0) > (free ? 0 : 10) || (sp.cost?.sat || 0) > 0 || sp.kind === 'sleep') continue;
      const rate = sp.gain.mor / Math.max(5, sp.min || 30);
      if (!best || rate > best.rate) best = { f, fn, rate };
    }
  }
  return best;
}

/** @type {Bot} */
export const IDLE = {
  id: 'idle',
  title: 'autonomy only: no shopping, no repairs',
  // it starves on the same day whatever the seed (every one of 50 seeds died on Day 4 in the first P0 run)
  oneSeed: true,
  step() {},
};

/**
 * A bed that offers sleep (at night, or tired) or else a nap now.
 * @param {Record<string, any>} S
 * @param {any} state
 */
function restTarget(S, state) {
  for (const kind of ['sleep', 'nap']) {
    for (const f of S.home.homeFurniture(state)) {
      const fn = S.furnActions.furnitureFunctions(state, f).find((/** @type {any} */ e) => e.enabled && e.spec.kind === kind);
      if (fn) return { f, fn };
    }
  }
  return null;
}

/** How long before a horde the prepper stops spending stamina on leisure (it needs it for the repairs). */
const HORDE_SAVE_SEC = 12 * 3600;
/** Below this share of max Stamina, with a horde due, the prepper rests before it. */
const HORDE_REST_STA = 0.6;

/** @type {Bot} */
export const PREPPER = {
  id: 'prepper',
  title: 'supermarket runs for ready-to-eat food before the outbreak; repairs doors and windows after',
  step(S, state) {
    const p = state.player;
    const bot = (state.run.bot ||= { trips: 0, spent: 0, stashed: 0 });
    if (state.phase === 'pre') {
      const left = S.time.secondsUntilOutbreak(state) / 60;
      if (p.scene === 'home' && idle(S, state)) {
        if (state.inventories[p.backpack].items.length) bot.stashed += stash(S, state);
        const trip = 2 * S.predisaster.travelSeconds(state, 'home', 'market') / 60;
        if (p.money >= 10 && left > trip + TRIP_MARGIN_MIN && bot.trips < 8) {
          S.predisaster.startTravel(state, 'market');
          bot.trips++;
        }
      } else if (p.scene === 'shop:market' && idle(S, state)) {
        bot.spent += shopForFood(S, state, 'market');
        S.predisaster.startTravel(state, 'home');
      }
      return;
    }
    if (state.phase !== 'post' || p.scene !== 'home') return;
    if (p.scene === 'home' && state.inventories[p.backpack].items.length && idle(S, state)) bot.stashed += stash(S, state);
    const attacked = S.horde.underAttack(state);
    if (!idle(S, state) || p.sleeping) return;
    const sta = p.stats.sta;
    const t = repairTarget(S, state, attacked ? 0.6 : 0.9);
    if (t && sta >= (t.fn.spec.cost?.sta || 10) + (attacked ? 8 : 30)) {
      S.furnActions.startFurnitureFunction(state, t.f.uid, t.fn.key);
      bot.repairs = (bot.repairs || 0) + 1;
      return;
    }
    if (attacked || sta < 15) return;
    // with a horde due within half a day it keeps its stamina for the repairs: tired, it rests first (a nap or a
    // night's sleep, whichever the bed offers now), and it takes only leisure that costs no stamina
    const next = S.horde.nextHorde(state);
    const saving = !!next && next.at - state.clock.t < HORDE_SAVE_SEC;
    if (saving && sta < HORDE_REST_STA * S.stats.effectiveMax(state, 'sta')) {
      const bed = restTarget(S, state);
      if (bed) {
        S.furnActions.startFurnitureFunction(state, bed.f.uid, bed.fn.key);
        bot.rests = (bot.rests || 0) + 1;
        return;
      }
    }
    if (p.stats.mor < 0.7 * S.stats.effectiveMax(state, 'mor')) {
      const m = moraleTarget(S, state, saving);
      if (m) {
        S.furnActions.startFurnitureFunction(state, m.f.uid, m.fn.key);
        bot.leisure = (bot.leisure || 0) + 1;
      }
    }
  },
};

/** Sites in the order the forager prefers them (food first). */
const SITE_ORDER = ['streets', 'supermarket', 'school', 'office', 'hospital', 'hardware'];
/** Satiety a day costs, for the food-days estimate (2 per waking hour, 1 asleep). */
const SAT_PER_DAY = 40;

/**
 * Satiety in the food at home (backpack and installed storage) that the survivor eats: it never cooks, so raw meat
 * does not count.
 * @param {Record<string, any>} S
 * @param {any} state
 */
export function foodSatiety(S, state) {
  let sat = 0;
  for (const id of S.furnActions.homeSources(state)) {
    for (const it of state.inventories[id]?.items || []) {
      const cfg = S.db.item(it.id);
      if (!eats(S, cfg)) continue;
      sat += cfg.sat * (cfg.uses > 1 ? (it.uses ?? cfg.uses) : 1) * (it.qty || 1) * (it.left ?? 1);
    }
  }
  return sat;
}

/** Hurt, under three quarters of max Life: the forager retreats from a site, and does not set out. @param {Record<string, any>} S @param {any} state */
const hurt = (S, state) => state.player.stats.life < 0.75 * S.stats.effectiveMax(state, 'life');

/**
 * The nearest container at the site the survivor can search now: not searched yet, and not locked against the tools
 * in the backpack.
 * @param {Record<string, any>} S
 * @param {any} state
 * @param {number} maxSteps
 */
export function nextContainer(S, state, maxSteps) {
  const X = S.explore;
  let best = null;
  for (const fx of X.exploreRun(state)?.fixtures || []) {
    if (fx.kind !== 'box' || fx.searched || !X.fixtureOptions(state, fx.id).some((/** @type {any} */ o) => o.enabled)) continue;
    const tile = X.approachTile(state, fx.id);
    if (tile && tile.d <= maxSteps && (!best || tile.d < best.d)) best = { fx, d: tile.d };
  }
  return best?.fx || null;
}

/**
 * On a site: take the food out of searched containers, fight or flee, search the next container, go home in time.
 * @param {Record<string, any>} S
 * @param {any} state
 * @param {any} run
 */
function scavenge(S, state, run) {
  const X = S.explore;
  const p = state.player;
  const bot = state.run.bot;
  if (run.phase !== 'site' || !idle(S, state)) return;
  const bp = state.inventories[p.backpack];
  const z = X.adjacentZombie(state);
  const fresh = p.stats.life >= 0.9 * S.stats.effectiveMax(state, 'life') && p.stats.sta >= 50;
  if (z && fresh) {
    X.queueFight(state, z.id);
    return;
  }
  if (!z && treat(S, state, [p.backpack], false)) return;
  const left = X.timeLeft(state);
  const loaded = bp.maxKg != null && S.inventory.weightKg(bp) > 0.85 * bp.maxKg;
  const next = nextContainer(S, state, 60);
  if (z || hurt(S, state) || p.stats.sta < 40 || loaded || (left != null && left < 45 * 60) || !next) {
    X.retreat(state);
    bot.retreats = (bot.retreats || 0) + 1;
    return;
  }
  X.queueDefault(state, next.id);
}

/** The medicine the forager uses, from the sites' medicine pool: band-aid, First-Aid Bandage, Military Med Kit. */
export const FORAGER_MEDS = Object.freeze([2509, 2400, 2401]);

/**
 * The cheapest of the forager's medicine in `sources` that does what `wanted` asks of its MEDICINE entry, or null.
 * @param {Record<string, any>} S
 * @param {any} state
 * @param {string[]} sources
 * @param {(m: any) => boolean} wanted
 */
function cheapestMed(S, state, sources, wanted) {
  let best = null;
  for (const invId of sources) {
    for (const it of state.inventories[invId]?.items || []) {
      if (!FORAGER_MEDS.includes(it.id) || !wanted(/** @type {any} */ (MEDICINE)[it.id] || {})) continue;
      if (S.itemuse.canUseNow(state, it) !== true) continue;
      const price = S.db.item(it.id)?.price ?? Infinity;
      if (!best || price < best.price) best = { invId, it, price };
    }
  }
  return best;
}

/**
 * Treats a bleed (at home or at the site: `sources`), or Life when hurt at home. True when it queued a treatment.
 * @param {Record<string, any>} S
 * @param {any} state
 * @param {string[]} sources
 * @param {boolean} heal  also restore Life when hurt
 */
function treat(S, state, sources, heal) {
  const fx = state.player.effects;
  const bleed = ['bleeding', 'shock'].filter((id) => fx[id]);
  let med = bleed.length ? cheapestMed(S, state, sources, (m) => bleed.every((id) => m.cure?.includes(id))) : null;
  if (!med && bleed.length) med = cheapestMed(S, state, sources, (m) => bleed.some((id) => m.cure?.includes(id)));
  if (!med && heal && hurt(S, state)) med = cheapestMed(S, state, sources, (m) => (m.stats?.life || 0) > 0);
  if (!med) return false;
  S.actions.enqueue(state, S.itemuse.useItemAction(state, med.invId, med.it.uid, 'use'));
  const bot = state.run.bot;
  bot.medicine = (bot.medicine || 0) + 1;
  return true;
}

/** Satiety the forager keeps while its Life is below max and before a trip. @param {Record<string, any>} S */
const fedLine = (S) => S.stats.REGEN_SAT + 10;

/** Queues the survivor's own next meal (autonomy's choice of food); true when there was one. @param {Record<string, any>} S @param {any} state */
function eat(S, state) {
  const food = S.suggest.bestFood(state);
  if (!food) return false;
  S.actions.enqueue(state, S.itemuse.useItemAction(state, food.invId, food.inst.uid, 'eat'));
  return true;
}

/** @type {Bot} */
export const FORAGER = {
  id: 'forager',
  title: 'the prepper, plus daytime scavenging for food once less than two weeks of it is left',
  step(S, state) {
    const X = S.explore;
    const run = X.exploreRun(state);
    if (run) {
      state.run.bot ||= {};
      scavenge(S, state, run);
      return;
    }
    const p = state.player;
    if (state.run.bot?.out && p.scene === 'home') {
      // back from an outing: count the food carried home (the prepper's stash step then stores it)
      const bp = state.inventories[p.backpack];
      state.run.bot.foodHome = (state.run.bot.foodHome || 0) + bp.items.filter((/** @type {any} */ it) => S.db.item(it.id)?.cat === S.db.CAT.FOOD).length;
      state.run.bot.out = false;
    }
    PREPPER.step(S, state);
    if (state.phase !== 'post' || p.scene !== 'home' || !idle(S, state) || p.sleeping || S.horde.underAttack(state)) return;
    if (treat(S, state, S.furnActions.homeSources(state), true)) return;
    if (p.stats.life < S.stats.effectiveMax(state, 'life') && p.stats.sat < fedLine(S) && eat(S, state)) return;
    const h = S.time.hourOfDay(state.clock);
    if (h < 7 || h > 12 || p.stats.sta < 60 || hurt(S, state)) return;
    if (foodSatiety(S, state) > 14 * SAT_PER_DAY) return;
    const next = S.horde.nextHorde(state);
    if (next && (next.warned || next.day <= S.time.dayNumber(state.clock) + 1)) return;
    if (p.stats.sat < Math.max(0.5 * S.stats.effectiveMax(state, 'sat'), fedLine(S))) {
      // eat before setting out, as a player would
      eat(S, state);
      return;
    }
    const ids = [...SITE_ORDER, ...X.sites().map((/** @type {any} */ d) => d.id)];
    for (const id of ids) {
      const st = X.siteStatus(state, id);
      if (!st?.available || p.stats.sta < st.travelSta + 25) continue;
      if (X.startExploration(state, id).ok) {
        state.run.bot.outings = (state.run.bot.outings || 0) + 1;
        state.run.bot.out = true;
      }
      return;
    }
  },
};

/** @type {Bot} */
export const DEFENDER = {
  id: 'defender',
  title: 'raises money and hoards food that keeps; holds the house (repairs, counterattacks) and rests between attacks',
  step: (S, state) => defenderStep(S, state),
};

export const BOTS = Object.freeze({ idle: IDLE, prepper: PREPPER, forager: FORAGER, defender: DEFENDER });
