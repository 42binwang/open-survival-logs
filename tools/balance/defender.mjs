// @ts-check
// The defender (docs/BALANCE.md, P1): a balance bot that holds the house to the end of the story on its own, acting
// only through the sim's own actions, as the UI would. Its registry entry (DEFENDER) is in tools/balance/bots.mjs;
// this module only exports function declarations and frozen data, so the two modules can import each other.
//
// Before the outbreak it raises what money it can (the wallet, the phone loan, the neighbor at the supermarket, the
// used-furniture buyer for the pieces it has no use for) and makes one round of the town on foot: a supermarket run
// for food that keeps (the most satiety for the money and the backpack's weight together) and a few band-aids; the
// Renovation Company for a titanium door, bulletproof windows and two fuel heaters; the Hardware Store for iron
// sheets and glass, diesel, two planks and the gas cans the trading posts pay well for; and a last supermarket run
// that stays through the riot for the free goods and the Doomsday Rush and is dragged home by the outbreak.
// After the outbreak it keeps the house and itself:
// - the house: it fits the new door, windows and heaters, reinforces the openings the hordes reach to their cap,
//   repairs the workbench and the stairs and clears the basement, and once it has the Barricade Guide crafts spike
//   barriers and sets them on the defense line (the far slots first, never walling itself into the yard);
// - hordes and wandering zombies: it repairs the most damaged opening, counterattacks only with stamina to spare and
//   otherwise rests; with a horde due within half a day it keeps its stamina for the repairs;
// - itself: it eats before Satiety falls under the Life-regeneration line, treats bleeding and fevers, lights as many
//   heaters as the cold calls for (loading them with diesel by hand), takes the home's leisure when its spirits sag
//   and otherwise rests (a night's sleep, or a nap), which halves what the hours cost it;
// - the drone (from Day 5): it fetches the loot hordes leave in the yard, scavenges once a day and trades its goods
//   for fuel when the heaters run low, for fever medicine, and for food while stocks are low or a bargain is offered;
// - the story: it answers every event with its default choice, accepts every radio mission, and at every daily
//   settlement buys the plan it can use most.
// Every choice follows from the state, so a session replays from a save. The bot reads the state freely but calls
// the game's functions only when it acts or needs an answer only the game can give (what a piece of furniture offers,
// a path, a trade): it remembers the layout of the home for a day, and while the survivor is busy it does nothing.

import { findPath, cellKey } from '../../src/sim/scene.js';
import { sceneFloor, sceneBlocked } from '../../src/sim/scenes.js';

const HOUR = 3600;
const DAY = 86400;

/**
 * Options of a defender run: `route` is the ending route it commits to when that route opens (by Day 74);
 * `vegetarian` keeps it from ever eating meat, fish, eggs or dairy (the Vegetarianism challenge); `frugal` spends at
 * most half its money before the outbreak (Minimal Budget); `solo` never trades (Going Solo).
 * @typedef {{ route?: string | null, vegetarian?: boolean, frugal?: boolean, solo?: boolean }} DefenderOptions
 */

/** The options of the run being played (set at every step from the bot's memory). @type {DefenderOptions} */
let OPTS = {};

/** The bot's memory on the run state (serialized with it, so a save replays). @param {any} state @param {DefenderOptions} [opts] */
export function defenderMemory(state, opts) {
  return (state.run.bot ||= { opts: { route: null, ...(opts || {}) }, at: 0, trips: 0, spent: 0, pawned: 0, repairs: 0, counters: 0, meals: 0, rests: 0, leisure: 0, crafted: 0, devices: 0, reinforced: 0, trades: 0, cards: [] });
}

/** Post-disaster day number (src/sim/time.js dayNumber) and hour of day, read off the clock. @param {any} clock */
const dayOf = (clock) => Math.floor((clock.startHour * HOUR + clock.t) / DAY) + 1;

/** Is the survivor doing something (an action running or queued, or walking)? @param {any} state */
const busy = (state) => !!state.actions.current || state.actions.queue.length > 0 || !!state.player.path?.length;

/** Are zombies at the house (src/sim/horde.js underAttack)? @param {any} state */
const attackedNow = (state) => (state.zombies || []).some((/** @type {any} */ z) => z.home && !z.leaving && z.hp > 0);

/** An opening's durability share (src/sim/home.js effectiveMaxHp: max HP plus reinforcement). @param {any} f */
const share = (f) => f.hp / Math.max(1, (f.maxHp || 0) + (f.reinforce || 0));

/** The next horde not started yet (src/sim/horde.js nextHorde), or null. @param {any} state */
function nextHordeAt(state) {
  let at = Infinity;
  for (const e of state.crises?.schedule || []) if (e.type === 'horde' && (e.status === 'pending' || e.status === 'warned') && e.at < at) at = e.at;
  return at;
}

/** Raw meat or fish, which the survivor does not eat as it is. @param {Record<string, any>} S @param {any} cfg */
const raw = (S, cfg) => !!cfg.cook && (cfg.sub === S.db.SUB.MEAT || cfg.sub === S.db.SUB.FISH);

/** Food the survivor eats as it is: not raw meat or fish. @param {Record<string, any>} S @param {any} cfg */
const edible = (S, cfg) => !!cfg && cfg.cat === S.db.CAT.FOOD && cfg.sat > 0 && !cfg.noUse && !raw(S, cfg) && !(OPTS.vegetarian && animal(S, cfg));

/** Meat, fish, eggs or dairy (what breaks the Vegetarianism challenge when eaten). @param {Record<string, any>} S @param {any} cfg */
const animal = (S, cfg) => !!cfg && (S.db.isMeat(cfg) || S.db.isAnimalProduct(cfg));

/** Food the bot buys: keeps two months, ready to eat, not a big cut. @param {Record<string, any>} S @param {any} cfg */
const keeps = (S, cfg) => edible(S, cfg) && !cfg.cut && cfg.life >= 60;

/** Satiety of one unit of an item (all its servings). @param {any} cfg */
const satOf = (cfg) => cfg.sat * Math.max(1, cfg.uses || 1);

/** Satiety a unit of food is worth to the bot: its satiety, less a little for what it costs in morale. @param {any} cfg */
const foodWorth = (cfg) => Math.max(0.3 * cfg.sat, cfg.sat + 0.5 * (cfg.mor || 0)) * Math.max(1, cfg.uses || 1);

/** Grid cells an item takes (src/sim/inventory.js dims). @param {Record<string, any>} S @param {any} it */
function cells(S, it) {
  const [w, h] = S.db.item(it.id)?.size || [1, 1];
  return w * h;
}

/**
 * The medicine the defender uses: on a bleed the band-aid, First-Aid Bandage and Military Med Kit; on a fever the
 * antibiotics, the fever reducer and the rest of what cures one.
 */
export const DEFENDER_MEDS = Object.freeze([2509, 2400, 2401, 2405, 2406, 8, 11008]);
/** What the defender treats with its medicine. */
const AILMENTS = Object.freeze(['bleeding', 'shock', 'fever']);
/** Fever medicine it keeps at home through the cold months, trading for more when it runs out. */
const FEVER_MEDS = 2;
const BANDAIDS = 3;

/** Titanium door and bulletproof window packages (Renovation Company, security wing). */
const TOP_DOOR_PKG = 14039;
const TOP_WINDOW_PKG = 14040;
/** Iron sheet and broken glass: plain reinforcement (door / window) and the spike barrier. */
const IRON = 20004;
const GLASS = 20002;
/** Fuel heater package (Renovation Company); two keep the apartment's ground floor warm through the deepest cold. */
const HEATER_PKG = 14025;
const HEATERS = 2;
/** Diesel: 160 hours in one heater. */
const DIESEL = 40000;
/** Wooden planks: two repair the loose stairs to the apartment's upper floor. */
const PLANK = 20106;
/** Cassette gas cans: cheap at the Hardware Store and worth a lot to the trading posts (120 each). */
const GAS = 8001;
/**
 * Bought at the Hardware Store: gas cans to trade once the drone flies, planks for the stairs, diesel for the heaters,
 * reinforcement to the cap (6 per exposed opening) and a few spikes. The frugal defender takes the gas cans, the
 * planks and a little diesel (the rest comes by trade); the one who never trades takes no gas cans and more diesel.
 * @param {DefenderOptions} opts
 */
function hardwareList(opts) {
  if (opts.solo) return [[PLANK, 2], [DIESEL, 9], [IRON, 9], [GLASS, 18]];
  if (opts.route === 'greenhouse') return [[GAS, 13], [PLANK, 2], [DIESEL, 8], [IRON, 9], [GLASS, 18]];
  if (opts.frugal) return [[GAS, 13], [PLANK, 2], [DIESEL, 2], [IRON, 6], [GLASS, 12]];
  return [[GAS, 13], [PLANK, 2], [DIESEL, 5], [IRON, 9], [GLASS, 18]];
}

/** Dollars it may still spend before the outbreak: all it has, or on the frugal run what keeps it at half its budget. @param {any} state */
const spendable = (state) => Math.max(0, Math.min(state.player.money, OPTS.frugal ? Math.floor(state.pre.budget / 2) - state.pre.spent : Infinity));
/** Pieces of the home the defender sells to the used-furniture buyer (1F, none it uses; the upper floors hold story pieces). */
const PAWN = Object.freeze([801, 9130, 9126, 70000]);
/** The defense device it crafts and sets up: the spike barrier (the Barricade Guide plan); it needs no power. */
const DEVICE_RECIPE = 401;
const DEVICE_PKG = 26002;
/**
 * The three defense devices (Config_ProductionList 401–403, their packages and the furniture they become): the spike
 * barrier, and the electric net and mechanical chainsaw whose blueprints the Day 15 and Day 25 hordes leave. The
 * Fortress route wants four of each; the others hold the line with spikes alone.
 */
const DEVICES = Object.freeze([
  { recipe: DEVICE_RECIPE, pkg: DEVICE_PKG, cfg: 36002 },
  { recipe: 402, pkg: 26003, cfg: 36003 },
  { recipe: 403, pkg: 26004, cfg: 36004 },
]);
const DEVICE_PKGS = Object.freeze(DEVICES.map((d) => d.pkg));
const DEVICE_CFGS = Object.freeze(DEVICES.map((d) => d.cfg));
const FORTRESS_EACH = 4;
/** The Fortress route's power reserve: a home UPS (2000 Wh) and a manual generator (600 Wh an hour of cranking). */
const UPS_PKG = 14066;
const CRANK_PKG = 14035;
/** Reserve the Fortress route keeps the batteries above (the route checks 80 % at noon and at 23:00, Days 60–69). */
const RESERVE_LOW = 0.9;
/** The delivery drone's package (it turns up at the door on Day 5). */
const DRONE_PKG = 14023;
/** The rescue route: the marker blueprint, the marker package and the beacon it becomes, and the marker recipe. */
const BLUEPRINT = 9003;
const MARKER_PKG = 9002;
const BEACON = 9296;
const MARKER_RECIPE = 23;
/** The marker's materials besides the blueprint (Config_ProductionList 23), kept back from trading on that route. */
const MARKER_MATS = Object.freeze([20001, 20002, 20003, 20004]);
/** The old recorder from the hospital (the Truth route): set up at home it becomes the route's device. */
const RECORDER_PKG = 9049;
/** Packages it sets up at home as they arrive. */
const SETUP_PKGS = Object.freeze([TOP_DOOR_PKG, TOP_WINDOW_PKG, HEATER_PKG, DRONE_PKG, UPS_PKG, CRANK_PKG, RECORDER_PKG]);

// ------------------------------------------------------------------------------------------ shopping
/**
 * Buys at the supermarket with `budget` dollars: first a few band-aids, then food by its worth for the money and the
 * backpack's free weight together, bulk when that is cheaper.
 * @param {Record<string, any>} S @param {any} state @param {string} shopId @param {number} budget
 */
export function shopForKeeps(S, state, shopId, budget) {
  budget = Math.min(budget, spendable(state));
  const P = S.predisaster;
  const bp = state.inventories[state.player.backpack];
  let spent = 0;
  const bot = defenderMemory(state);
  for (const f of S.shops.SHOPS[shopId].fixtures) {
    if (f.kind !== 'shelf' || !f.items?.includes(2509)) continue;
    while ((bot.bandaids || 0) < BANDAIDS && spent + 20 <= budget) {
      const r = P.buy(state, shopId, f.id, 2509);
      if (!r.ok) break;
      spent += r.cost;
      bot.bandaids = (bot.bandaids || 0) + 1;
    }
  }
  const kgFree = Math.max(0.1, (bp.maxKg ?? 20) - S.inventory.weightKg(bp));
  const offers = [];
  for (const f of S.shops.SHOPS[shopId].fixtures) {
    if (f.kind !== 'shelf') continue;
    for (const o of P.shelfOffers(state, shopId, f.id)) {
      const cfg = S.db.item(o.id);
      if (o.pkg || !keeps(S, cfg)) continue;
      offers.push({ shelf: f.id, id: o.id, cfg, worth: foodWorth(cfg), unit: o.unit, kg: cfg.g / 1000 });
    }
  }
  const money0 = Math.max(1, Math.min(budget, state.player.money));
  const score = (/** @type {any} */ x) => x.worth / (x.unit / money0 + x.kg / kgFree);
  offers.sort((a, b) => score(b) - score(a) || a.id - b.id);
  for (const x of offers) {
    for (let guard = 0; guard < 60; guard++) {
      const fresh = P.shelfOffers(state, shopId, x.shelf).find((/** @type {any} */ o) => o.id === x.id);
      if (!fresh || fresh.left <= 0) break;
      const bulk = fresh.bulk > 0 && fresh.left >= fresh.bulk && spent + fresh.bulkPrice <= budget && fresh.bulkPrice < fresh.unit * fresh.bulk;
      let r = bulk ? P.buy(state, shopId, x.shelf, x.id, { bulk: true }) : { ok: false };
      if (!r.ok) {
        if (spent + fresh.unit > budget) break;
        r = P.buy(state, shopId, x.shelf, x.id);
      }
      if (!r.ok) break;
      spent += r.cost;
    }
  }
  bot.spent += spent;
  return spent;
}

/**
 * Buys `n` of an item from whichever shelf of the current shop has it, bulk while that is cheaper. Returns the cost.
 * @param {Record<string, any>} S @param {any} state @param {string} shopId @param {number} id @param {number} n
 */
function buyN(S, state, shopId, id, n) {
  const P = S.predisaster;
  const shelf = S.shops.SHOPS[shopId].fixtures.find((/** @type {any} */ f) => f.kind === 'shelf' && f.items?.includes(id));
  let got = 0;
  let spent = 0;
  for (let guard = 0; shelf && got < n && guard < 40; guard++) {
    const o = P.shelfOffers(state, shopId, shelf.id).find((/** @type {any} */ x) => x.id === id);
    if (!o || o.left <= 0 || o.unit > spendable(state)) break;
    const bulk = o.bulk > 0 && n - got >= o.bulk && o.left >= o.bulk && o.bulkPrice < o.unit * o.bulk && o.bulkPrice <= spendable(state);
    const r = P.buy(state, shopId, shelf.id, id, { bulk });
    if (!r.ok) break;
    got += r.n;
    spent += r.cost;
  }
  defenderMemory(state).spent += spent;
  return spent;
}

// ------------------------------------------------------------------------------------------ the home's layout
/**
 * What the defender knows about its home, surveyed once a day and whenever furniture comes or goes: the storage on
 * open floors, the beds, the leisure on offer, the heaters, the openings the hordes reach, the workbench and the
 * drone.
 * @param {Record<string, any>} S @param {any} state
 */
function survey(S, state) {
  const bot = defenderMemory(state);
  const sig = `${dayOf(state.clock)}|${Object.keys(state.furniture).length}|${Object.keys(state.home.unlocked).filter((k) => state.home.unlocked[k]).join()}`;
  if (bot.home?.sig === sig) return bot.home;
  const exposed = new Map(S.horde.openingsInfo(state).map((/** @type {any} */ o) => [o.f?.uid, o.exposed]));
  const home = { sig, stores: /** @type {string[]} */ ([]), beds: /** @type {any[]} */ ([]), fun: /** @type {any[]} */ ([]), habits: /** @type {any[]} */ ([]), heaters: /** @type {number[]} */ ([]), openings: /** @type {any[]} */ ([]), bench: /** @type {number | null} */ (null), drone: /** @type {number | null} */ (null), beacon: /** @type {number | null} */ (null) };
  for (const f of S.home.homeFurniture(state)) {
    if (!state.home.unlocked[f.floor]) continue;
    const inv = f.inv && state.inventories[f.inv];
    if (inv && !inv.special && inv.kind !== 'drone') home.stores.push(f.inv);
    if (inv?.kind === 'drone') home.drone = f.uid;
    if (S.power.powerRole(f) === 'heater') home.heaters.push(f.uid);
    if (S.crafting.isWorkbench(f)) home.bench = f.uid;
    if (f.cfg === BEACON) home.beacon = f.uid;
    const fns = S.furnActions.furnitureFunctions(state, f);
    const sleep = fns.find((/** @type {any} */ e) => e.spec.kind === 'sleep')?.key;
    const nap = fns.find((/** @type {any} */ e) => e.spec.kind === 'nap')?.key;
    if (sleep != null || nap != null) home.beds.push({ uid: f.uid, floor: f.floor, sleep, nap });
    for (const fn of fns) {
      const sp = fn.spec;
      // daily habits that raise a stat's maximum and need nothing but stamina (washing up, a bath, push-ups)
      if (sp.kind === 'stat' && sp.max && Object.keys(sp.max).length && !sp.need?.length && !sp.needPower) home.habits.push({ uid: f.uid, key: fn.key, sta: sp.cost?.sta || 0 });
      if (!(sp.gain?.mor > 0) || sp.need?.length || (sp.cost?.sat || 0) > 0 || sp.kind === 'sleep' || sp.kind === 'nap' || (sp.cost?.sta || 0) > 8) continue;
      home.fun.push({ uid: f.uid, key: fn.key, rate: sp.gain.mor / Math.max(5, sp.min || 30), sta: sp.cost?.sta || 0 });
    }
    if (exposed.has(f.uid)) {
      const repairs = fns.filter((/** @type {any} */ e) => e.spec.kind === 'repair').sort((/** @type {any} */ a, /** @type {any} */ b) => (b.spec.amount || 0) - (a.spec.amount || 0));
      // reinforcements, the biggest first: plain ones (sheet metal, glass) to +300, the advanced kits to +1500
      const reinforces = fns
        .filter((/** @type {any} */ e) => e.spec.kind === 'reinforce')
        .sort((/** @type {any} */ a, /** @type {any} */ b) => (b.spec.amount || 0) - (a.spec.amount || 0))
        .map((/** @type {any} */ e) => ({ key: e.key, need: e.spec.need?.[0]?.[0] ?? null, cap: e.spec.advanced ? 1500 : 300 }));
      home.openings.push({ uid: f.uid, exposed: !!exposed.get(f.uid), repairs: repairs.map((/** @type {any} */ e) => e.key), cost: repairs[0]?.spec.cost?.sta ?? 10, reinforces });
    }
  }
  home.stores.sort((a, b) => (state.inventories[b].cold || 0) - (state.inventories[a].cold || 0));
  home.fun.sort((a, b) => b.rate - a.rate);
  bot.home = home;
  return home;
}

/** How many of an item the backpack and the storage on open floors hold (read, no game call). @param {any} state @param {any} home @param {number} id */
function stock(state, home, id) {
  let n = 0;
  for (const inv of [state.player.backpack, ...home.stores]) for (const it of state.inventories[inv]?.items || []) if (it.id === id) n += it.qty || 1;
  return n;
}

// ------------------------------------------------------------------------------------------ keeping house
/** Cells the backpack keeps for what the survivor carries at hand (the rest stays free for harvests and crafts). */
const HAND_CELLS = 44;
/** Medicine carried at hand: this many of each kind. */
const HAND_MEDS = 2;
/** What the defender keeps back from trading: iron sheets and glass for spikes, its diesel, the repair parts. */
const KEEP = Object.freeze({ [IRON]: 6, [GLASS]: 6, [DIESEL]: 99, 20300: 99, 20301: 99, 20310: 99, 20311: 99 });
/** Categories it trades away: materials, fuel (gas cans), seeds, fertilizer, daily goods, books and consoles. */
const CURRENCY_CATS = Object.freeze([9, 13, 10, 11, 5, 3, 4]);

/** How many of an item it keeps back from trading: KEEP, and on the rescue route one of each marker material. @param {any} state @param {number} id */
const keepOf = (state, id) =>
  (/** @type {any} */ (KEEP)[id] || 0) + (state.run.bot?.opts?.route === 'evacuate' && MARKER_MATS.includes(id) ? 1 : 0) + (state.run.bot?.opts?.route === 'greenhouse' && (id === PLASTIC || GH_SEEDS.some(([seed]) => seed === id)) ? 99 : 0);

/** Books that raise a stat's maximum when read (three readings each); the defender reads them, never trades them. @param {Record<string, any>} S @param {number} id */
const maxBook = (S, id) => {
  const b = /** @type {any} */ (S.itemEffects.BOOKS)[id];
  return !!b?.max && !b.story;
};

/** What the defender trades away: goods of those categories and the raw meat and fish it never eats; nothing a story needs. @param {Record<string, any>} S @param {any} cfg */
function tradeable(S, cfg) {
  if (!cfg || cfg.story || !(cfg.trade > 0) || maxBook(S, cfg.id) || (OPTS.vegetarian && animal(S, cfg))) return false;
  return CURRENCY_CATS.includes(cfg.cat) || (cfg.cat === S.db.CAT.FOOD && raw(S, cfg));
}

/** Before the outbreak: everything from the backpack into home storage (fridges first), so the next run has the whole backpack. @param {Record<string, any>} S @param {any} state */
export function storeAway(S, state) {
  const home = survey(S, state);
  const bp = state.inventories[state.player.backpack];
  let moved = 0;
  for (const it of [...bp.items]) if (home.stores.some((/** @type {string} */ to) => S.inventory.moveItem(state, bp, it.uid, state.inventories[to]).ok)) moved++;
  return moved;
}

/** An item's weight in grams (src/sim/inventory.js instWeightG). @param {Record<string, any>} S @param {any} it */
function gramsOf(S, it) {
  const cfg = S.db.item(it.id);
  if (!cfg) return 0;
  let g = cfg.g * (it.qty || 1);
  if (cfg.uses > 1 && it.uses > 0 && it.uses < cfg.uses) g = Math.ceil((g * it.uses) / cfg.uses);
  if (it.left < 1) g = Math.ceil(g * it.left);
  return g;
}

/**
 * Keeps the house in order after the outbreak. The backpack holds what the survivor needs at hand: spike packages,
 * a few of each medicine, and the trade goods worth the most per cell (where the drone's trade panel reaches them).
 * Everything else useful goes into the reachable storage, food into the fridges first; what finds no room stays in
 * the shopping bags on the floor, and worthless leftovers (empty cans and the like) are set down there too. The drone
 * hold is emptied, so it is free for the next flight.
 * @param {Record<string, any>} S @param {any} state
 */
function organize(S, state) {
  const home = survey(S, state);
  const bp = state.inventories[state.player.backpack];
  const stores = home.stores.map((/** @type {string} */ id) => state.inventories[id]).filter(Boolean);
  const bags = (state.floorBoxes || []).filter((/** @type {any} */ b) => state.home.unlocked[b.floor] && !b.yard).map((/** @type {any} */ b) => state.inventories[b.inv]).filter(Boolean);
  const holds = (state.social?.drones || []).filter((/** @type {any} */ d) => d.busyUntil <= state.clock.t).map((/** @type {any} */ d) => state.inventories[d.cargo]).filter(Boolean);
  /** @type {{ inv: any, it: any, rank: number, cells: number }[]} */
  const hand = [];
  /** @type {Record<number, number>} */
  const meds = {};
  for (const inv of [bp, ...stores, ...bags, ...holds]) {
    for (const it of inv.items) {
      const cfg = S.db.item(it.id);
      if (!cfg) continue;
      const c = cells(S, it);
      if (DEVICE_PKGS.includes(it.id)) hand.push({ inv, it, rank: 1e6, cells: c });
      else if (DEFENDER_MEDS.includes(it.id) && (meds[it.id] = (meds[it.id] || 0) + 1) <= HAND_MEDS) hand.push({ inv, it, rank: 1e5, cells: c });
      else if (tradeable(S, cfg) && !keepOf(state, it.id)) hand.push({ inv, it, rank: cfg.trade / c, cells: c });
    }
  }
  hand.sort((a, b) => b.rank - a.rank || a.it.uid - b.it.uid);
  const keep = new Set();
  let used = 0;
  for (const x of hand) {
    if (used + x.cells > HAND_CELLS) continue;
    used += x.cells;
    keep.add(x.it.uid);
  }
  // leftovers worth nothing to anyone (empty cans and the like: daily goods no post trades for)
  const worthless = (/** @type {any} */ cfg) => !!cfg && cfg.cat === S.db.CAT.DAILY && !(cfg.trade > 0) && !cfg.story;
  // what a store turned away: while nothing leaves the storage, an item at least that big (in cells, either way
  // round) or that heavy finds no room there either (src/sim/inventory.js findSpot tries both orientations), unless
  // it stacks
  /** @type {Map<any, { cells: number[][], g: number }>} */
  const full = new Map();
  const toStore = (/** @type {any} */ from, /** @type {any} */ it, /** @type {any} */ to) => {
    const cfg = S.db.item(it.id);
    const [a, b] = [...(cfg?.size || [1, 1])].sort((x, y) => x - y);
    const g = gramsOf(S, it);
    const f = full.get(to);
    const single = !cfg || !(cfg.stack > 1);
    if (single && f && (f.cells.some(([ra, rb]) => a >= ra && b >= rb) || g >= f.g)) return false;
    const r = S.inventory.moveItem(state, from, it.uid, to);
    if (r.ok) return true;
    if (single) {
      const rec = full.get(to) || { cells: [], g: Infinity };
      if (r.reason === 'weight') rec.g = Math.min(rec.g, g);
      else if (r.reason === 'space') rec.cells.push([a, b]);
      full.set(to, rec);
    }
    return false;
  };
  const toStores = (/** @type {any} */ from, /** @type {any} */ it) => stores.some((/** @type {any} */ to) => to !== from && toStore(from, it, to));
  const setDown = (/** @type {any} */ inv, /** @type {any} */ it) => {
    full.delete(inv);
    S.home.dropToFloor(state, (S.inventory.removeUid(inv, it.uid), it), state.player.floor, state.player.x, state.player.y);
  };
  // the vegetarian keeps meat, fish, eggs and dairy out of the house's reach (on the floor), where nobody eats them
  const shunned = (/** @type {any} */ it) => !!OPTS.vegetarian && S.db.item(it.id)?.cat === S.db.CAT.FOOD && animal(S, S.db.item(it.id));
  for (const inv of [bp, ...stores]) for (const it of [...inv.items]) if (shunned(it)) setDown(inv, it);
  for (const it of [...bp.items]) if (!keep.has(it.uid) && !toStores(bp, it) && worthless(S.db.item(it.id))) setDown(bp, it);
  for (const inv of stores) for (const it of [...inv.items]) if (worthless(S.db.item(it.id))) setDown(inv, it);
  for (const x of hand) if (keep.has(x.it.uid) && x.inv !== bp) S.inventory.moveItem(state, x.inv, x.it.uid, bp);
  full.clear();
  // the bags and the drone holds into storage, food first; food that finds no room makes room: the least useful
  // piece in storage (trade goods it has no room to carry, then anything but food and what it keeps back) goes down
  const rest = [...bags, ...holds].flatMap((inv) => inv.items.map((/** @type {any} */ it) => ({ inv, it, cfg: S.db.item(it.id) })));
  rest.sort((a, b) => (edible(S, b.cfg) ? 1 : 0) - (edible(S, a.cfg) ? 1 : 0));
  const spare = (/** @type {any} */ it) => {
    const cfg = S.db.item(it.id);
    return !edible(S, cfg) && !keepOf(state, it.id) && !cfg?.story && !DEFENDER_MEDS.includes(it.id) && !DEVICE_PKGS.includes(it.id) && cfg?.cat !== S.db.CAT.FURNITURE_PACKAGE;
  };
  for (const x of rest) {
    if (keep.has(x.it.uid) || worthless(x.cfg) || shunned(x.it) || setAside(S, x.cfg) || toStores(x.inv, x.it) || !edible(S, x.cfg)) continue;
    for (let guard = 0; guard < 4; guard++) {
      const inv = stores.find((/** @type {any} */ i) => i.items.some(spare));
      if (!inv) break;
      setDown(inv, inv.items.find(spare));
      if (toStores(x.inv, x.it)) break;
    }
  }
  for (const inv of holds) for (const it of [...inv.items]) setDown(inv, it);
}

/**
 * The food to eat next: autonomy's choice (src/sim/suggest.js bestFood); the vegetarian's own among what it eats, the
 * tastiest and nearest to spoiling first.
 * @param {Record<string, any>} S @param {any} state
 */
function pickFood(S, state) {
  if (!OPTS.vegetarian) return S.suggest.bestFood(state);
  let best = null;
  for (const invId of [state.player.backpack, ...survey(S, state).stores]) {
    for (const it of state.inventories[invId]?.items || []) {
      const cfg = S.db.item(it.id);
      if (!edible(S, cfg)) continue;
      const score = cfg.sat + (cfg.mor || 0) * 0.5 + (it.left < 1 ? 15 : 0) - (it.age || 0) / Math.max(1, cfg.life || 1);
      if (!best || score > best.score) best = { invId, inst: it, score };
    }
  }
  return best;
}

/** Eats autonomy's choice of food, fetching some from the shopping bags when the storage has none. @param {Record<string, any>} S @param {any} state */
function eatMeal(S, state) {
  let food = pickFood(S, state);
  if (!food) {
    const bp = state.inventories[state.player.backpack];
    for (const b of state.floorBoxes || []) {
      if (b.yard || !state.home.unlocked[b.floor]) continue;
      const box = state.inventories[b.inv];
      const it = box?.items.find((/** @type {any} */ x) => edible(S, S.db.item(x.id)));
      if (it && S.inventory.moveItem(state, box, it.uid, bp, null, null, { allowOverweight: true }).ok) {
        food = pickFood(S, state);
        break;
      }
    }
  }
  if (!food) return false;
  S.actions.enqueue(state, S.itemuse.useItemAction(state, food.invId, food.inst.uid, 'eat'));
  defenderMemory(state).meals++;
  return true;
}

/** Lies down: a night's sleep when a bed offers it, else a nap; on the warmest open floor. @param {Record<string, any>} S @param {any} state */
function rest(S, state) {
  const home = survey(S, state);
  const warm = (/** @type {any} */ b) => state.weather?.indoorTemp?.[b.floor] ?? 18;
  const beds = [...home.beds].sort((a, b) => warm(b) - warm(a));
  for (const kind of ['sleep', 'nap']) {
    for (const b of beds) {
      if (b[kind] == null) continue;
      const fn = S.furnActions.furnitureFunctions(state, state.furniture[b.uid]).find((/** @type {any} */ e) => e.key === b[kind]);
      if (fn?.enabled && S.furnActions.startFurnitureFunction(state, b.uid, b[kind])) {
        defenderMemory(state).rests++;
        return true;
      }
    }
  }
  return false;
}

/** The home's best leisure for morale that is enabled now; with `free`, one that costs no stamina. @param {Record<string, any>} S @param {any} state @param {boolean} free */
function leisure(S, state, free) {
  for (const x of survey(S, state).fun) {
    if (free && x.sta > 0) continue;
    const f = state.furniture[x.uid];
    if (!f) continue;
    const fn = S.furnActions.furnitureFunctions(state, f).find((/** @type {any} */ e) => e.key === x.key);
    if (fn?.enabled && S.furnActions.startFurnitureFunction(state, x.uid, x.key)) {
      defenderMemory(state).leisure++;
      return true;
    }
  }
  return false;
}

/** Repairs the exposed opening most in need below `below` of its durability, the biggest repair it can make first. @param {Record<string, any>} S @param {any} state @param {number} below */
function repair(S, state, below) {
  const home = survey(S, state);
  const worst = home.openings
    .map((/** @type {any} */ o) => ({ o, f: state.furniture[o.uid] }))
    .filter((/** @type {any} */ x) => x.f && share(x.f) < below)
    .sort((/** @type {any} */ a, /** @type {any} */ b) => share(a.f) - share(b.f))[0];
  if (!worst || state.player.stats.sta < worst.o.cost + 2) return false;
  for (const key of worst.o.repairs) {
    if (S.furnActions.startFurnitureFunction(state, worst.o.uid, key)) {
      defenderMemory(state).repairs++;
      return true;
    }
  }
  return false;
}

/** Its medicine (at home, or in `sources`) that cures an ailment it has, the cheapest first, or null. @param {Record<string, any>} S @param {any} state @param {string[]} ills @param {string[]} [sources] */
function medicineFor(S, state, ills, sources = [state.player.backpack, ...survey(S, state).stores]) {
  let best = null;
  for (const invId of sources) {
    for (const it of state.inventories[invId]?.items || []) {
      const m = /** @type {any} */ (S.itemEffects.MEDICINE)[it.id];
      if (!DEFENDER_MEDS.includes(it.id) || !ills.some((id) => m?.cure?.includes(id))) continue;
      const price = S.db.item(it.id)?.price ?? Infinity;
      if (!best || price < best.price) best = { invId, it, price };
    }
  }
  return best && S.itemuse.canUseNow(state, best.it) === true ? best : null;
}

/** Treats a bleed or a fever with the cheapest medicine at home that cures it. True when it queued one. @param {Record<string, any>} S @param {any} state */
function treat(S, state) {
  const ills = AILMENTS.filter((id) => state.player.effects[id]);
  const best = ills.length ? medicineFor(S, state, ills) : null;
  if (!best) return false;
  S.actions.enqueue(state, S.itemuse.useItemAction(state, best.invId, best.it.uid, 'use'));
  defenderMemory(state).medicine = (defenderMemory(state).medicine || 0) + 1;
  return true;
}

/**
 * The choices it makes on the events of its route (event id -> choice index); every other event gets its default.
 * On the Supply Station route it proves at the special trading point that it can deliver.
 */
const ROUTE_CHOICES = Object.freeze({ supply: { p_supplyPoint: 0 } });

/** The choice for the event on screen: its route's pick, else the default (null). @param {any} state */
function eventChoice(state) {
  const pick = /** @type {any} */ (ROUTE_CHOICES)[OPTS.route || '']?.[state.story.active?.id];
  return pick ?? null;
}

/** The Military Repair Kit (the Day 66 horde's spoils) a commitment takes. */
const KIT = 9048;

/** Commits to its route once the route opens (the Military Repair Kit from the Day 66 horde in hand, by Day 74). @param {Record<string, any>} S @param {any} state */
function commit(S, state) {
  const route = OPTS.route;
  if (!route || route === 'evacuate' || state.story.route) return false;
  // the kit left in a box on the floor (in the yard where the horde dropped it, or set down for want of room) is
  // picked up first
  if (S.story.canCommit(state, route) !== true && state.story.commitAvailable?.[route]) {
    const b = (state.floorBoxes || []).find((/** @type {any} */ x) => state.home.unlocked[x.floor] && state.inventories[x.inv]?.items.some((/** @type {any} */ it) => it.id === KIT));
    const kit = b && state.inventories[b.inv].items.find((/** @type {any} */ it) => it.id === KIT);
    if (!kit) return false;
    // out in the yard behind the defense line the drone fetches it
    if (b.yard) {
      const d = (state.social?.drones || []).find((/** @type {any} */ x) => x.busyUntil <= state.clock.t && !state.inventories[x.cargo]?.items.length);
      return !!d && !!S.social.queueDroneOp(state, 'loot', { drone: d.uid }).ok;
    }
    return !!S.actions.enqueue(state, S.itemuse.pickUpAction(state, b, kit.uid));
  }
  if (S.story.canCommit(state, route) !== true) return false;
  return !!S.story.startCommit(state, route);
}

/** Plans the defender buys at the daily settlement, in order of preference. */
const CARD_ORDER = Object.freeze(['barricades', 'feast', 'hotShower', 'powerNap']);

/** The daily settlement: buy the most useful plan on offer, then close it. @param {Record<string, any>} S @param {any} state */
function settle(S, state) {
  const offers = state.run.offers;
  if (offers && !offers.picked && !offers.closed) {
    const s = state.player.stats;
    /** @param {string} id */
    const want = (id) => (id === 'feast' ? s.sat < 70 : id === 'hotShower' ? s.mor < 70 : id === 'powerNap' ? s.sta < 50 : true);
    for (const id of CARD_ORDER) {
      if (!offers.ids.includes(id) || !want(id)) continue;
      if (S.settlement.buyCard(state, id).ok) {
        defenderMemory(state).cards.push(id);
        break;
      }
    }
  }
  S.settlement.closeSettlement(state);
}

// ------------------------------------------------------------------------------------------ preparation
/**
 * The preparation plan: a supermarket run, the Renovation Company and the Hardware Store, and the last supermarket
 * run, which stays through the riot. A stop that no longer fits in the hours left (with an hour at the last stop) is
 * dropped, the earliest first.
 */
const PLAN = Object.freeze(['market', 'home', 'renovation', 'hardware', 'home', 'market']);
/** Minutes spent at a stop besides the walk. */
const STOP_MIN = Object.freeze({ market: 25, home: 40, renovation: 10, hardware: 5, farmers: 10 });

/** At the Renovation Company: sell the pieces it has no use for, buy the top door and windows and the heaters. @param {Record<string, any>} S @param {any} state */
function atRenovation(S, state) {
  const P = S.predisaster;
  const bot = defenderMemory(state);
  for (const f of P.pawnableFurniture(state)) {
    if (f.floor !== '1F' || !PAWN.includes(f.cfg)) continue;
    const r = P.pawnFurniture(state, f.uid);
    if (r.ok) bot.pawned += r.price;
  }
  // the Fortress route wants every window strong, the ones no zombie reaches too
  const fortress = OPTS.route === 'fortress';
  const exposed = S.horde.openingsInfo(state).filter((/** @type {any} */ o) => o.exposed || fortress);
  const doors = exposed.filter((/** @type {any} */ o) => o.door).length;
  buyN(S, state, 'renovation', TOP_DOOR_PKG, doors);
  buyN(S, state, 'renovation', TOP_WINDOW_PKG, exposed.length - doors);
  buyN(S, state, 'renovation', HEATER_PKG, HEATERS);
  if (fortress || OPTS.route === 'greenhouse') {
    buyN(S, state, 'renovation', UPS_PKG, 1);
    buyN(S, state, 'renovation', CRANK_PKG, 1);
  }
  if (OPTS.route === 'greenhouse') buyN(S, state, 'renovation', EHEATER_PKG, 2);
}

/**
 * Seconds the rest of the plan takes from `here`: the walks and the stops, up to the arrival at the last one.
 * @param {Record<string, any>} S @param {any} state @param {string} here @param {string[]} rest
 */
function planSeconds(S, state, here, rest) {
  let t = 0;
  let at = here;
  rest.forEach((dest, i) => {
    t += S.predisaster.travelSeconds(state, at, dest) + (i < rest.length - 1 ? (/** @type {any} */ (STOP_MIN)[dest] || 0) * 60 : 0);
    at = dest;
  });
  return t;
}

/** The stops still ahead (the bot's copy of PLAN, with dropped stops left out). @param {any} bot @returns {string[]} */
const planLeft = (bot) => (bot.plan ||= [...(bot.opts?.route === 'greenhouse' ? GH_PLAN : PLAN)]).slice(bot.at ?? 0);

/** Before the outbreak: follow the plan; the last supermarket run spends everything and stays. @param {Record<string, any>} S @param {any} state */
function prepare(S, state) {
  const P = S.predisaster;
  const p = state.player;
  const bot = defenderMemory(state);
  if (busy(state)) return;
  const here = P.locationOf(state);
  const left = Math.max(0, state.clock.outbreakAt - state.clock.t);
  const last = planLeft(bot).length <= 1;
  if (here === 'home') {
    if (!state.pre.walletTaken) return void P.queueWallet(state);
    if (!state.pre.loanTaken) return void P.queueLoan(state);
    if (state.inventories[p.backpack].items.length) storeAway(S, state);
    // the Greenhouse route shops at the farmers market last: what finds no room in the storage is set down in a bag on
    // the floor (the planks for the stairs stay at hand)
    if (OPTS.route === 'greenhouse') {
      const bp = state.inventories[p.backpack];
      for (const it of [...bp.items]) if (it.id !== PLANK) S.home.dropToFloor(state, (S.inventory.removeUid(bp, it.uid), it), p.floor, p.x, p.y);
    }
    if (setUp(S, state)) return;
  } else if (OPTS.route === 'stranger' && (S.shops.SHOPS[here]?.npcs || []).some((/** @type {any} */ n) => !(bot.talked ||= []).includes(n.id))) {
    // the Stranger route: a word with the people in the shops, who turn up in the phone's contacts later
    const n = S.shops.SHOPS[here].npcs.find((/** @type {any} */ x) => !bot.talked.includes(x.id));
    bot.talked.push(n.id);
    if (P.talkToNpc(state, n.id)) return;
  } else if (here === 'renovation' && !bot.renovation) {
    bot.renovation = true;
    atRenovation(S, state);
  } else if (here === 'farmers' && !bot.farmers) {
    bot.farmers = true;
    atFarmers(S, state);
  } else if (here === 'hardware' && !bot.hardware) {
    bot.hardware = true;
    for (const [id, n] of hardwareList(OPTS)) buyN(S, state, 'hardware', id, n);
  } else if (here === 'market') {
    if (!state.pre.neighborCash) return void P.talkToNpc(state, 'neighbor');
    for (const f of P.shopFixtures(state, 'market')) if (f.kind === 'loot' && f.exclaim) return void P.interactFixture(state, f.id);
    if (bot.shopped !== bot.at) {
      // money for this run: all of it on the last one (less the rush), else its share of the runs left
      bot.shopped = bot.at;
      const runs = planLeft(bot).filter((x) => x === 'market').length;
      const rush = state.pre.rushUsed.market ? 0 : 60;
      // the frugal run keeps the money its errands still need
      // (and the Greenhouse route what the renovation company, the hardware store and the farmers market cost it)
      const errands = OPTS.frugal
        ? (planLeft(bot).includes('renovation') ? 360 : 0) + (planLeft(bot).includes('hardware') ? 300 : 0)
        : OPTS.route === 'greenhouse'
          ? (planLeft(bot).includes('renovation') ? 560 : 0) + (planLeft(bot).includes('hardware') ? 460 : 0) + (planLeft(bot).includes('farmers') ? 460 : 0)
          : 0;
      shopForKeeps(S, state, 'market', Math.max(0, (spendable(state) - rush - errands) / Math.max(1, runs)));
    }
    if (!last) {
      bot.at++;
      bot.trips++;
      return void P.startTravel(state, planLeft(bot)[0]);
    }
    for (const f of P.shopFixtures(state, 'market')) if (f.kind === 'riot') return void P.interactFixture(state, f.id);
    if (state.pre.riot && !P.rushBlocked(state) && spendable(state) >= 60) return void P.startRush(state);
    return;
  }
  if (last && here === planLeft(bot)[0]) return;
  // on to the next stop; drop the earliest stops that no longer fit
  if (bot.plan[bot.at ?? 0] === here) bot.at = (bot.at ?? 0) + 1;
  for (;;) {
    const ahead = planLeft(bot);
    if (planSeconds(S, state, here, ahead) + HOUR <= left) break;
    const i = ahead.slice(0, -1).findIndex((x) => x !== 'home');
    if (i < 0) break;
    ahead.splice(i, 1);
    // no stop twice in a row, and none where the survivor already is
    const kept = ahead.filter((x, j) => x !== (j ? ahead[j - 1] : here));
    bot.plan = [...bot.plan.slice(0, bot.at ?? 0), ...kept];
    bot.dropped = (bot.dropped || 0) + 1;
  }
  const dest = planLeft(bot)[0];
  if (dest && dest !== here && left > P.travelSeconds(state, here, dest) + 1800) {
    bot.trips++;
    P.startTravel(state, dest);
  }
}

// ------------------------------------------------------------------------------------------ the house
/** Sets up what arrived: the top door and windows (in the openings the hordes reach), the heaters and the drone. True when it queued one. @param {Record<string, any>} S @param {any} state */
function setUp(S, state) {
  const where = (/** @type {any} */ inv) => inv && inv.items.some((/** @type {any} */ it) => SETUP_PKGS.includes(it.id));
  const places = [state.player.backpack, state.home.doorstepInv, ...(state.floorBoxes || []).map((/** @type {any} */ b) => b.inv), ...(defenderMemory(state).home?.stores || [])];
  if (!places.some((id) => where(state.inventories[id]))) return false;
  for (const pkg of S.planning.installablePackages(state)) {
    if (!SETUP_PKGS.includes(pkg.itemId)) continue;
    if (pkg.itemId !== TOP_DOOR_PKG && pkg.itemId !== TOP_WINDOW_PKG) {
      const slots = S.planning.slotsFor(state, pkg.furnCfg);
      const slot = slots.find((/** @type {any} */ s) => s.floor === '1F') || slots[0];
      if (slot && S.planning.queueInstall(state, pkg.invId, pkg.uid, slot.id)) return true;
      continue;
    }
    const exposed = new Set(S.horde.openingsInfo(state).filter((/** @type {any} */ o) => o.exposed).map((/** @type {any} */ o) => o.slot));
    const targets = S.planning.replaceTargets(state, pkg.furnCfg);
    const slot = targets.find((/** @type {any} */ s) => exposed.has(s.id)) || targets[0];
    if (slot && S.planning.queueReplaceOpening(state, pkg.invId, pkg.uid, slot.id)) return true;
  }
  return false;
}

/** Reinforcement of an exposed opening below its cap, the biggest it has the materials for. @param {Record<string, any>} S @param {any} state */
function reinforce(S, state) {
  const home = survey(S, state);
  for (const o of home.openings) {
    const f = state.furniture[o.uid];
    if ((!o.exposed && OPTS.route !== 'fortress') || !f) continue;
    for (const r of o.reinforces) {
      if ((f.reinforce || 0) >= r.cap || (r.need && stock(state, home, r.need) < 1)) continue;
      if (S.furnActions.startFurnitureFunction(state, o.uid, r.key)) {
        defenderMemory(state).reinforced++;
        return true;
      }
    }
  }
  return false;
}

/** Can the survivor walk to a piece of furniture on its floor from where they stand? @param {Record<string, any>} S @param {any} state @param {any} f */
function canReach(S, state, f) {
  const p = state.player;
  if (p.scene !== 'home' || p.floor !== f.floor) return false;
  const grid = sceneFloor(state, f.floor);
  const blocked = sceneBlocked(state, f.floor);
  return S.home.interactionTiles(state, f, p).some((/** @type {number[]} */ [x, y]) => (x === p.x && y === p.y) || !!findPath(grid, p.x, p.y, x, y, blocked, { outside: true, strictGoal: true }));
}

/**
 * The free defense slot to set a device on next: of those the survivor can walk up to now and still walk back into
 * the house from once the device stands there, the farthest, so the devices by the door, which wall off the yard
 * behind them, go in last. With `keepOpen` (the Fortress route, which wants a device in all of them) the device also
 * has to leave a way from the house to every other empty slot, the ones a higher defense level unlocks too.
 * @param {Record<string, any>} S @param {any} state @param {boolean} [keepOpen]
 */
function freeDefenseSlot(S, state, keepOpen = false) {
  const p = state.player;
  if (p.scene !== 'home' || p.floor !== '1F') return null;
  const grid = sceneFloor(state, '1F');
  const blocked = sceneBlocked(state, '1F');
  const spawn = S.home.homeDef(state.home.id).spawn;
  let best = null;
  const empty = S.horde.defenseSlotsInfo(state).filter((/** @type {any} */ d) => !d.f);
  const free = empty.filter((/** @type {any} */ d) => !d.locked);
  /** @param {any} d @param {Set<string>} after */
  const reachable = (d, after) => S.home.slotStandTiles(state, d.slot, p).some((/** @type {number[]} */ [x, y]) => (x === spawn.x && y === spawn.y) || !!findPath(grid, spawn.x, spawn.y, x, y, after, { outside: true, strictGoal: true }));
  for (const d of free) {
    const slot = S.home.slotDef(state, d.slot);
    const after = new Set(blocked);
    after.add(cellKey(slot.x, slot.y));
    if (keepOpen && empty.some((/** @type {any} */ o) => o !== d && !reachable(o, after))) continue;
    // the tile the survivor will stand on is the first one the route planner reaches (the nearest first)
    for (const [x, y] of S.home.slotStandTiles(state, d.slot, p)) {
      const there = x === p.x && y === p.y ? [] : findPath(grid, p.x, p.y, x, y, blocked, { outside: true, strictGoal: true });
      if (!there) continue;
      const back = (x === spawn.x && y === spawn.y) || !!findPath(grid, x, y, spawn.x, spawn.y, after, { outside: true });
      if (back && (!best || there.length > best.len)) best = { ...d, len: there.length };
      break;
    }
  }
  return best;
}

/** Does the survivor know the spike barrier (from the Barricade Guide plan, or otherwise learned)? @param {any} state */
const knowsSpikes = (state) => (state.run.cards || []).includes('barricades') || (state.run.unlockedRecipes || []).includes(DEVICE_RECIPE);

/**
 * The device the next free defense slot gets: the spike barrier, or on the Fortress route the net or the chainsaw
 * while it has fewer than four of one it knows, keeping slots free for them until then.
 * @param {Record<string, any>} S @param {any} state @param {any} home
 */
function nextDevice(S, state, home) {
  if (OPTS.route !== 'fortress') return DEVICES[0];
  const placed = (/** @type {typeof DEVICES[number]} */ d) => S.home.homeFurniture(state).filter((/** @type {any} */ f) => f.cfg === d.cfg).length;
  const have = (/** @type {typeof DEVICES[number]} */ d) => placed(d) + stock(state, home, d.pkg);
  // one it has on hand and still needs goes in first
  const ready = DEVICES.find((d) => placed(d) < FORTRESS_EACH && stock(state, home, d.pkg) > 0);
  if (ready) return ready;
  const known = DEVICES.slice(1).find((d) => have(d) < FORTRESS_EACH && S.crafting.isRecipeCraftable(state, d.recipe));
  if (known) return known;
  // spikes: four at least, then as many as leave a slot for each net and chainsaw still to come
  const free = S.horde.defenseSlotsInfo(state).filter((/** @type {any} */ d) => !d.f).length;
  const owed = DEVICES.slice(1).reduce((n, d) => n + Math.max(0, FORTRESS_EACH - placed(d)), 0);
  return placed(DEVICES[0]) < FORTRESS_EACH || free > owed ? DEVICES[0] : null;
}

/** Keeps the defense line: repairs worn devices, sets up the ones it has, crafts a new one for a free slot. @param {Record<string, any>} S @param {any} state */
function defenseLine(S, state) {
  if (!knowsSpikes(state)) return false;
  const bot = defenderMemory(state);
  const home = survey(S, state);
  for (const s of Object.values(state.home.slots || {})) {
    const f = state.furniture[/** @type {number} */ (s)];
    if (!f || !DEVICE_CFGS.includes(f.cfg) || f.hp >= 0.5 * f.maxHp || stock(state, home, IRON) < KEEP[IRON]) continue;
    if (canReach(S, state, f) && S.horde.queueRepairDevice(state, f.uid)) return true;
  }
  const dev = nextDevice(S, state, home);
  if (!dev) return false;
  const ready = stock(state, home, dev.pkg) > 0;
  const bench = home.bench != null ? state.furniture[home.bench] : null;
  const bagged = (state.floorBoxes || []).some((/** @type {any} */ b) => state.inventories[b.inv]?.items.some((/** @type {any} */ it) => it.id === dev.pkg));
  /** @type {Record<number, number>} */
  const mats = {};
  for (const id of S.crafting.recipeDef(dev.recipe)?.mat || []) mats[id] = (mats[id] || 0) + 1;
  const craft = !ready && !bagged && !!bench && !bench.broken && Object.entries(mats).every(([id, n]) => stock(state, home, Number(id)) >= n) && S.crafting.canCraft(state, bench.uid, dev.recipe) === true;
  if (!ready && !craft) return false;
  const slot = freeDefenseSlot(S, state, OPTS.route === 'fortress');
  if (!slot) {
    // the Fortress route with a net or a chainsaw on hand and every slot taken: a spike beyond the four makes room
    if (!ready || dev === DEVICES[0]) return false;
    const spikes = S.home.homeFurniture(state).filter((/** @type {any} */ f) => f.cfg === DEVICES[0].cfg);
    const spare = spikes.length > FORTRESS_EACH ? spikes.find((/** @type {any} */ f) => canReach(S, state, f)) : null;
    const fn = spare && S.furnActions.furnitureFunctions(state, spare).find((/** @type {any} */ e) => e.enabled && e.spec.kind === 'dismantle');
    return !!fn && !!S.furnActions.startFurnitureFunction(state, spare.uid, fn.key);
  }
  if (ready) {
    if (!S.horde.queueInstallDefense(state, slot.slot, dev.pkg)) return false;
    bot.devices++;
    return true;
  }
  if (!S.crafting.startCraft(state, bench?.uid, dev.recipe)) return false;
  bot.crafted++;
  return true;
}

/**
 * The Fortress route's power reserve: once the city grid is gone it keeps the lights and the appliances off (the
 * defense devices draw only while a horde is at the house) and cranks the manual generator whenever the batteries
 * fall below RESERVE_LOW, with the Satiety and stamina to spare.
 * @param {Record<string, any>} S @param {any} state
 */
function powerWork(S, state) {
  const green = OPTS.route === 'greenhouse' && dayOf(state.clock) >= GH_PLANT_DAY - 2;
  if ((OPTS.route !== 'fortress' && !green) || !state.power || S.power.gridUp(state)) return false;
  const p = state.power;
  const bot = defenderMemory(state);
  // what it keeps on: the defense devices, and on the Greenhouse route the planters and the heaters
  const keep = (/** @type {any} */ f) => DEVICE_CFGS.includes(f.cfg) || (green && (S.farming.isPlanter(f) || S.db.furn(f.cfg)?.heat > 0));
  if (!bot.powerSaving) {
    bot.powerSaving = true;
    S.power.setLights(state, false);
    for (const f of S.home.homeFurniture(state)) {
      if (f.on !== false && !keep(f) && S.power.powerRole(f) === 'consumer') S.power.setApplianceOn(state, f.uid, false);
    }
  }
  // the lamps and heaters need the circuit
  if (green && p.damaged) return !!S.power.queueRepair(state, S.inventory.countIn(state, S.furnActions.homeSources(state), 20104) > 0);
  const cap = S.power.storageCapacity(state);
  if (cap <= 0 || p.stored >= RESERVE_LOW * cap) return false;
  const s = state.player.stats;
  if (s.sta < 40 || s.sat < 40) return false;
  const crank = S.home.homeFurniture(state).find((/** @type {any} */ f) => S.power.powerRole(f) === 'manualGen');
  if (!crank) return false;
  const fn = S.furnActions.furnitureFunctions(state, crank).find((/** @type {any} */ e) => e.enabled && e.spec.kind === 'manualGen' && !e.spec.continuous);
  if (!fn || !S.furnActions.startFurnitureFunction(state, crank.uid, fn.key)) return false;
  bot.cranks = (bot.cranks || 0) + 1;
  return true;
}

/** Opens the upper floor and the basement (the story's repair tasks) for their storage and beds. @param {Record<string, any>} S @param {any} state */
function openFloors(S, state) {
  const locks = S.home.homeDef(state.home.id).locks || {};
  for (const [area, task] of [
    ['2F', 'repairStairs'],
    ['B1', 'repairBasement'],
  ]) {
    if (state.home.unlocked[area] || !locks[area] || (task === 'repairStairs' && stock(state, survey(S, state), PLANK) < 2)) continue;
    if (task === 'repairBasement' && (state.player.daily?.['story:repairBasement'] || 0) >= 1) continue;
    if (S.story.runQuestAction(state, task)) {
      defenderMemory(state).floorWork = (defenderMemory(state).floorWork || 0) + 1;
      return true;
    }
  }
  return false;
}

/** Reads a book that raises a stat's maximum, with stamina to spare. @param {Record<string, any>} S @param {any} state */
function read(S, state) {
  if (state.player.stats.sta < 50) return false;
  for (const id of [state.player.backpack, ...survey(S, state).stores]) {
    const it = state.inventories[id]?.items.find((/** @type {any} */ x) => maxBook(S, x.id));
    if (!it) continue;
    S.actions.enqueue(state, S.itemuse.useItemAction(state, id, it.uid, 'read'));
    defenderMemory(state).reads = (defenderMemory(state).reads || 0) + 1;
    return true;
  }
  return false;
}

/** A daily habit that raises a stat's maximum, once a day each, with stamina to spare. @param {Record<string, any>} S @param {any} state */
function habit(S, state) {
  const bot = defenderMemory(state);
  const day = dayOf(state.clock);
  const done = (bot.habitDay ||= {});
  for (const h of survey(S, state).habits) {
    const id = `${h.uid}:${h.key}`;
    if (done[id] === day || state.player.stats.sta < h.sta + 50) continue;
    done[id] = day;
    if (S.furnActions.startFurnitureFunction(state, h.uid, h.key)) {
      bot.habits = (bot.habits || 0) + 1;
      return true;
    }
  }
  return false;
}

/**
 * The rescue route (Evacuate): crafts the marker from the blueprint the military drops on Day 30, sets it up on the
 * second floor as the beacon, commits to the route there with the Military Repair Kit (the Day 66 horde's spoils)
 * and inspects the beacon once a day.
 * @param {Record<string, any>} S @param {any} state
 */
function beaconWork(S, state) {
  const home = survey(S, state);
  const day = dayOf(state.clock);
  const beacon = home.beacon != null ? state.furniture[home.beacon] : null;
  if (!beacon) {
    const pkg = stock(state, home, MARKER_PKG) > 0 ? S.planning.installablePackages(state).find((/** @type {any} */ x) => x.itemId === MARKER_PKG) : null;
    if (pkg) {
      const slot = S.planning.slotsFor(state, BEACON).find((/** @type {any} */ x) => x.floor === '2F');
      return !!slot && !!S.planning.queueInstall(state, pkg.invId, pkg.uid, slot.id);
    }
    const bench = home.bench != null ? state.furniture[home.bench] : null;
    if (!bench || bench.broken || stock(state, home, BLUEPRINT) < 1 || MARKER_MATS.some((id) => stock(state, home, id) < 1)) return false;
    if (S.crafting.canCraft(state, bench.uid, MARKER_RECIPE) !== true || !S.crafting.startCraft(state, bench.uid, MARKER_RECIPE)) return false;
    defenderMemory(state).markers = (defenderMemory(state).markers || 0) + 1;
    return true;
  }
  if (!state.story.route && S.story.canCommit(state, 'evacuate') === true) return !!S.story.startCommit(state, 'evacuate');
  if (state.story.route === 'evacuate' && state.story.flags?.lastBeaconCheck !== day && state.player.stats.sta >= 20) return !!S.furnActions.startFurnitureFunction(state, beacon.uid, 2111);
  return false;
}

/**
 * The Truth route's finds (src/content/sites.js): the story container at each site and what it holds, the hospital's
 * three record fragments and the old recorder, and the office's torn patient register (the fourth truth clue).
 */
const TRUTH_FINDS = Object.freeze({
  hospital: Object.freeze({ recorderCabinet: RECORDER_PKG, pharmacyCabinet: 9043, outpatientDesk: 9041, labBench: 9042 }),
  office: Object.freeze({ archiveCabinet: 9062 }),
});
/** Satiety it sets out with (it eats first). */
const OUTING_SAT = 70;
/** Band-aids and bandages it takes along on an outing. */
const SITE_MEDS = 2;
/**
 * Where the one who never trades goes for food once less than FORAGE_DAYS of it is left at home: the supermarket
 * first, then the streets, the school and the hardware store.
 */
const FORAGE_SITES = Object.freeze(['supermarket', 'streets', 'school', 'hardware']);
const FORAGE_DAYS = 30;
/** Game seconds of one step while the survivor is at a site (the fights and the walks there take seconds). */
const SITE_STEP = 120;
/** Tiles from a big zombie within which it turns straight back on arriving at a site. */
const SITE_WARY = 10;

/** The story containers at `site` still to search on its route, with what they hold. @param {any} state @param {string} site */
function findsLeft(state, site) {
  const ex = state.explore || {};
  const finds = OPTS.route === 'truth' ? /** @type {Record<string, Record<string, number>>} */ (TRUTH_FINDS)[site] : null;
  return Object.entries(finds || {}).filter(([, item]) => !ex.claimed?.[item] && !ex.found?.[item]);
}

/**
 * A morning outing, rested, fed and healthy, with no horde due before it is back: for the route's story finds (the
 * Truth route: the hospital, then the office) to a site that is open with finds still left there, or, for the one who
 * never trades, for food when it runs low.
 * @param {Record<string, any>} S @param {any} state
 */
function outing(S, state) {
  const go = outingSite(S, state);
  if (!go) return false;
  const p = state.player;
  // a meal before setting out
  if (p.stats.sat < OUTING_SAT) return eatMeal(S, state);
  // medicine for a bleed along in the backpack
  const bp = state.inventories[p.backpack];
  const cures = (/** @type {any} */ it) => DEFENDER_MEDS.includes(it.id) && /** @type {any} */ (S.itemEffects.MEDICINE)[it.id]?.cure?.includes('bleeding');
  for (const id of survey(S, state).stores) {
    for (const it of [...(state.inventories[id]?.items || [])]) if (bp.items.filter(cures).length < SITE_MEDS && cures(it)) S.inventory.moveItem(state, state.inventories[id], it.uid, bp);
  }
  if (!S.explore.startExploration(state, go.site).ok) return false;
  const bot = defenderMemory(state);
  bot.outings = (bot.outings || 0) + 1;
  bot.foraging = go.forage;
  return true;
}

/**
 * The site of the morning's outing (see outing), or null when there is none to make now.
 * @param {Record<string, any>} S @param {any} state @returns {{ site: string, forage: boolean } | null}
 */
function outingSite(S, state) {
  const forage = !!OPTS.solo && foodAtHome(S, state) < FORAGE_DAYS * satPerDay(state);
  if (OPTS.route !== 'truth' && !forage) return null;
  const X = S.explore;
  const p = state.player;
  const hour = (((state.clock.startHour * HOUR + state.clock.t) % DAY) + DAY) % DAY / HOUR;
  if (hour < 7 || hour >= 10 || p.stats.life < 0.75 * S.stats.effectiveMax(state, 'life')) return null;
  if (nextHordeAt(state) - state.clock.t < 24 * HOUR || attackedNow(state)) return null;
  const story = Object.keys(TRUTH_FINDS).filter((site) => findsLeft(state, site).length);
  for (const site of [...story, ...(forage ? FORAGE_SITES : [])]) {
    const st = X.siteStatus(state, site);
    if (st?.available && p.stats.sta >= st.travelSta + 60) return { site, forage: !story.includes(site) };
  }
  return null;
}

/**
 * At a site: fights what comes close while healthy, searches the route's story containers, or out foraging every
 * container (the nearest first), and heads home once they are searched, or when hurt, tired, loaded or short of
 * daylight.
 * @param {Record<string, any>} S @param {any} state @param {any} run
 */
function atSite(S, state, run) {
  const X = S.explore;
  if (run.phase !== 'site') return;
  const p = state.player;
  const bot = defenderMemory(state);
  // a big one or armed survivors coming at it: it does not stay to fight them, even in the middle of a walk or a
  // search; on arrival it turns back when a big one is already about
  const arrived = bot.siteRun !== run.departedAt;
  bot.siteRun = run.departedAt;
  const near = (/** @type {number} */ d) => run.zombies.some((/** @type {any} */ o) => o.hp > 0 && (o.big || (o.human && o.stance === 'hostile')) && Math.abs(o.x - p.x) + Math.abs(o.y - p.y) <= d);
  if (!run.standoff && near(arrived ? SITE_WARY : 4)) {
    X.retreat(state);
    bot.retreats = (bot.retreats || 0) + 1;
    return;
  }
  if (busy(state)) return;
  // raiders blocking the way: pay them off with part of the backpack, or talk when there is nothing to give
  if (X.standoffView(state)) {
    X.resolveStandoff(state, X.raiderTribute(state).length ? 'give' : 'talk');
    bot.standoffs = (bot.standoffs || 0) + 1;
    return;
  }
  const z = X.adjacentZombie(state);
  if (!z && p.effects.bleeding) {
    const med = medicineFor(S, state, ['bleeding'], [p.backpack]);
    if (med) return void S.actions.enqueue(state, S.itemuse.useItemAction(state, med.invId, med.it.uid, 'use'));
  }
  const healthy = p.stats.life >= 0.65 * S.stats.effectiveMax(state, 'life') && !p.effects.bleeding;
  if (z && healthy && p.stats.sta >= 15) {
    X.queueFight(state, z.id);
    return;
  }
  const want = new Set(bot.foraging ? run.fixtures.filter((/** @type {any} */ fx) => fx.kind === 'box').map((/** @type {any} */ fx) => fx.id) : findsLeft(state, run.site).map(([id]) => id));
  let next = null;
  for (const fx of run.fixtures) {
    if (!want.has(fx.id) || fx.searched || !X.fixtureOptions(state, fx.id).some((/** @type {any} */ o) => o.enabled)) continue;
    const tile = X.approachTile(state, fx.id);
    if (tile && (!next || tile.d < next.d)) next = { fx, d: tile.d };
  }
  // a finds container it cannot walk up to lies behind an obstacle (the hospital's stairwell): push that away first
  const hidden = !next && !bot.foraging && run.fixtures.some((/** @type {any} */ fx) => want.has(fx.id) && !fx.searched);
  for (const fx of hidden ? run.fixtures : []) {
    if (fx.kind !== 'block' || fx.cleared || !X.fixtureOptions(state, fx.id).some((/** @type {any} */ o) => o.enabled)) continue;
    const tile = X.approachTile(state, fx.id);
    if (tile && (!next || tile.d < next.d)) next = { fx, d: tile.d };
  }
  const left = X.timeLeft(state);
  const bp = state.inventories[p.backpack];
  const loaded = bot.foraging && bp.maxKg != null && S.inventory.weightKg(bp) > 0.85 * bp.maxKg;
  if (z || !next || !healthy || loaded || p.stats.sta < 25 || (left != null && left < 45 * 60)) {
    X.retreat(state);
    bot.retreats = (bot.retreats || 0) + 1;
    return;
  }
  X.queueDefault(state, next.fx.id);
}

/**
 * The Doomsday Greenhouse route (the College Student): before the outbreak it buys two dozen planters at the farmers
 * market (the lamp boxes among them), flower seeds for the lamps and mushroom spawn for the dark, and at the
 * renovation company a UPS, a manual generator and electric heaters for the upper floor and the basement. After the
 * outbreak it sets every planter up (clearing the basement rubble and taking apart furniture it has no use for to make
 * room), and from GH_PLANT_DAY sows, tends and harvests them, keeps the lamps and heaters powered and every open floor
 * warm.
 */
const GH_PLAN = Object.freeze(['market', 'home', 'renovation', 'hardware', 'home', 'farmers']);
/** Packages it sets up before the planters: the power for the lamps, and the heaters for the floors above and below. */
const GH_FIRST = Object.freeze([UPS_PKG, CRANK_PKG, 14014]);
/**
 * Planter packages it buys at the farmers market, and how many of each: the lamp boxes for the flowers and a few
 * cheap pots. The rest of the route's 24 it makes at the workbench (Basic Small Flowerpot, two waste plastic each).
 */
const GH_PLANTERS = Object.freeze([
  [14067, 2], // lamp box (small)
  [14068, 2], // lamp box (medium)
  [14001, 2],
  [14072, 2],
  [14069, 2],
]);
const PLANTERS_WANTED = 24;
const POT_RECIPE = 300;
const PLASTIC = 20003;
/** Seeds: cosmos and marigold for the flowers (they need light), enoki for the produce (it grows in the dark). */
const FLOWER_SEEDS = Object.freeze([15037, 15036]);
const DARK_SEEDS = Object.freeze([15039]);
const GH_SEEDS = Object.freeze([
  [15037, 21],
  [15036, 10],
  [15039, 24],
]);
/** Electric heater package (Renovation Company): one each for the upper floor and the basement. */
const EHEATER_PKG = 14014;
const GH_PLANT_DAY = 64;

/** At the farmers market on the Greenhouse route: the planters, then the seeds. @param {Record<string, any>} S @param {any} state */
function atFarmers(S, state) {
  for (const [id, n] of [...GH_PLANTERS, ...GH_SEEDS]) buyN(S, state, 'farmers', id, n);
}

/**
 * The Greenhouse route's harvest, which it leaves in the bags on the floor where it set it down: cut flowers, and the
 * mushrooms it does not eat as they are.
 * @param {Record<string, any>} S @param {any} cfg
 */
const setAside = (S, cfg) => !!cfg && OPTS.route === 'greenhouse' && (cfg.cat === S.db.CAT.FLOWER || (cfg.cat === S.db.CAT.FOOD && !edible(S, cfg) && cfg.sub !== S.db.SUB.MEAT && cfg.sub !== S.db.SUB.FISH));

/** Is `f` a planter with a grow lamp (its plant config's ElectricLight)? @param {Record<string, any>} S @param {any} f */
const lampPlanter = (S, f) => (S.db.plantCfg(S.db.furn(f.cfg)?.plant)?.ElectricLight || 0) > 0;

/**
 * What it takes apart for the planters' slots, the least useful first: the basement rubble and clutter, then the
 * furniture it has no use for (a flower stand, a clothes rack, the gas stove it never cooks on, the dining table
 * whose push-ups the coffee table offers too, the yoga mat, a second sink, the bathtub, the toilet, and the sofa when
 * there is a bed besides).
 */
const SPARE_FURNITURE = Object.freeze([80087, 80073, 55000, 21003, 70005, 21000, 21002, 21001, 20002]);
/** It makes room only from this day, with every floor open (the pots it has by then fill the free slots first). */
const SPARE_FROM_DAY = 40;

/** How expendable a piece is for a planter's slot (lower first), or -1 when it keeps it. @param {Record<string, any>} S @param {any} state @param {any} f */
function spareRank(S, state, f) {
  if (f.data?.rubble || f.data?.clutter) return 0;
  const i = SPARE_FURNITURE.indexOf(f.cfg);
  if (i < 0 || f.fixed) return -1;
  // a second sink goes; the last one stays
  if (f.cfg === 21000 && S.home.homeFurniture(state).filter((/** @type {any} */ x) => x.cfg === 21000).length < 2) return -1;
  if (survey(S, state).beds.some((/** @type {any} */ b) => (b.uid ?? b) === f.uid) && survey(S, state).beds.length < 2) return -1;
  return 1 + i;
}

/**
 * The Greenhouse route's house work (see GH_PLAN). True when it queued something.
 * @param {Record<string, any>} S @param {any} state
 */
function greenhouseWork(S, state) {
  if (OPTS.route !== 'greenhouse') return false;
  const F = S.farming;
  const bot = defenderMemory(state);
  const day = dayOf(state.clock);
  // the harvest (cut flowers, and produce it cannot eat as it is) is set down on the floor, off the backpack
  const p = state.player;
  const bp = state.inventories[p.backpack];
  for (const it of [...bp.items]) if (setAside(S, S.db.item(it.id))) S.home.dropToFloor(state, (S.inventory.removeUid(bp, it.uid), it), p.floor, p.x, p.y);
  // the power and the electric heaters first (one on each floor above and below), then the planters, the biggest first
  // (a small one fits any slot), in the basement and upstairs before the ground floor and the far spots of a floor
  // first, so the pots near the stairs go in last; a spot where the install did not take is passed over after that
  const bad = (bot.ghBad ||= []);
  if (bot.ghPending) {
    if (!S.home.furnitureAt(state, bot.ghPending)) bad.push(bot.ghPending);
    bot.ghPending = null;
  }
  const rank = (/** @type {any} */ p) => (GH_FIRST.includes(p.itemId) ? 10 : 0) + (S.db.furn(p.furnCfg)?.slot || 0);
  const pkgs = S.planning.installablePackages(state).filter((/** @type {any} */ p) => S.db.furn(p.furnCfg)?.plant > 0 || GH_FIRST.includes(p.itemId));
  pkgs.sort((/** @type {any} */ a, /** @type {any} */ b) => rank(b) - rank(a));
  /** @type {Record<string, number>} */
  const order = { B1: 0, '2F': 1, '1F': 2 };
  for (const pkg of pkgs) {
    let slots = S.planning.slotsFor(state, pkg.furnCfg).filter((/** @type {any} */ x) => !bad.includes(x.id));
    if (pkg.itemId === EHEATER_PKG) {
      const heated = new Set(S.home.homeFurniture(state).filter((/** @type {any} */ f) => f.cfg === S.db.packageToFurniture[EHEATER_PKG]).map((/** @type {any} */ f) => f.floor));
      slots = slots.filter((/** @type {any} */ x) => x.floor !== '1F' && !heated.has(x.floor));
    } else if (!(S.db.furn(pkg.furnCfg)?.plant > 0)) {
      slots = slots.filter((/** @type {any} */ x) => x.floor === '1F');
    } else {
      slots = slots.reverse().sort((/** @type {any} */ a, /** @type {any} */ b) => (order[a.floor] ?? 3) - (order[b.floor] ?? 3));
    }
    if (slots[0] && S.planning.queueInstall(state, pkg.invId, pkg.uid, slots[0].id)) {
      bot.ghInstalls = (bot.ghInstalls || 0) + 1;
      bot.ghPending = slots[0].id;
      return true;
    }
  }
  // flowerpots from waste plastic while it has fewer than the route's planters
  const benchF = survey(S, state).bench != null ? state.furniture[survey(S, state).bench] : null;
  const bench = benchF && !benchF.broken ? benchF : null;
  const potsHad = F.homePlanters(state).length + pkgs.filter((/** @type {any} */ p) => S.db.furn(p.furnCfg)?.plant > 0).length;
  if (potsHad < PLANTERS_WANTED && bench && S.inventory.countIn(state, S.furnActions.homeSources(state), PLASTIC) >= 2 && S.crafting.canCraft(state, bench.uid, POT_RECIPE) === true && S.crafting.startCraft(state, bench.uid, POT_RECIPE)) {
    bot.ghPots = (bot.ghPots || 0) + 1;
    return true;
  }
  // no slot left for a planter: make room
  const planterPkg = pkgs.find((/** @type {any} */ p) => S.db.furn(p.furnCfg)?.plant > 0);
  if (planterPkg && !busy(state) && day >= SPARE_FROM_DAY && Object.keys(S.home.homeDef(state.home.id).floors).every((fl) => state.home.unlocked[fl])) {
    const fits = new Set(S.planning.slotsFor(state, planterPkg.furnCfg, { includeOccupied: true }).map((/** @type {any} */ x) => x.id));
    const spare = S.home
      .homeFurniture(state)
      .filter((/** @type {any} */ f) => state.home.unlocked[f.floor] && fits.has(f.slot) && spareRank(S, state, f) >= 0)
      .sort((/** @type {any} */ a, /** @type {any} */ b) => spareRank(S, state, a) - spareRank(S, state, b));
    for (const f of spare) {
      const fn = S.furnActions.furnitureFunctions(state, f).find((/** @type {any} */ e) => e.enabled && (e.spec.kind === 'clearRubble' || e.spec.kind === 'dismantle'));
      if (fn && S.furnActions.startFurnitureFunction(state, f.uid, fn.key)) {
        bot.ghCleared = (bot.ghCleared || 0) + 1;
        return true;
      }
    }
  }
  if (day < GH_PLANT_DAY) return false;
  const planters = F.homePlanters(state);
  if (!planters.length) return false;
  if (!F.plantResearched(state)) return !!F.queueFarm(state, planters[0].uid, 'research');
  // tend, harvest and sow: flowers under the lamps, mushrooms elsewhere
  const sources = S.furnActions.homeSources(state);
  for (const f of planters) {
    const op = F.farmSmartOp(state, f.uid);
    if (!op) continue;
    if (op !== 'plant') {
      if (F.validateFarmOp(state, f.uid, op) === true && F.queueFarm(state, f.uid, op)) return true;
      continue;
    }
    const seeds = lampPlanter(S, f) ? FLOWER_SEEDS : DARK_SEEDS;
    const seed = seeds.find((id) => S.inventory.countIn(state, sources, id) > 0);
    if (!seed) continue;
    const size = S.db.plant(S.db.seedToPlant[seed])?.size || 1;
    const n = Math.min(Math.floor(F.freeCapacity(f) / size), S.inventory.countIn(state, sources, seed));
    if (n > 0 && F.canQueuePlanting(state, f.uid, seed, n) === true && F.queuePlanting(state, f.uid, seed, { count: n }).length) {
      bot.ghSown = (bot.ghSown || 0) + n;
      return true;
    }
  }
  return false;
}

/** Routes that keep the neighbor alive across the rooftops (the hanging basket). */
const CARE_ROUTES = Object.freeze(['girl', 'companion']);
/** Days of food it keeps the neighbor stocked with (she eats 40 Satiety a day). */
const CARE_FOOD_DAYS = 8;

/**
 * Looks after the neighbor across the rooftops (the Girl Next Door and Companionship routes): repairs the hanging
 * basket and changes its rope when worn, and once a day sends what she asked for, food to keep her stocked, and while
 * she is warming to the survivor some small goods she likes to have.
 * @param {Record<string, any>} S @param {any} state
 */
function neighborCare(S, state) {
  const n = state.social?.neighbor;
  if (!CARE_ROUTES.includes(OPTS.route || '') || !n?.id || !n.alive) return false;
  const basket = state.furniture[n.basketUid];
  if (!basket || !state.home.unlocked[basket.floor]) return false;
  const bot = defenderMemory(state);
  const fns = S.furnActions.furnitureFunctions(state, basket).filter((/** @type {any} */ e) => e.enabled && e.spec.kind === 'basket');
  const op = (/** @type {string} */ o) => fns.find((/** @type {any} */ e) => e.spec.op === o);
  if (!n.basketRepaired) {
    const fn = op('repair');
    return !!fn && !!S.furnActions.startFurnitureFunction(state, basket.uid, fn.key);
  }
  if (op('rope') && n.ropeHp <= 2) return !!S.furnActions.startFurnitureFunction(state, basket.uid, op('rope').key);
  const day = dayOf(state.clock);
  const req = S.social.activeRequest(state);
  if (bot.basketDay === day || (n.foodDays >= CARE_FOOD_DAYS - 2 && !req && n.hearts >= 5)) return false;
  const inv = S.social.basketInventory(state);
  if (!inv) return false;
  const home = survey(S, state);
  const def = S.social.neighborDef(state);
  const sources = [state.player.backpack, ...home.stores].map((id) => state.inventories[id]).filter(Boolean);
  const room = () => (inv.maxKg ?? 10) - S.inventory.weightKg(inv);
  const put = (/** @type {any} */ from, /** @type {any} */ it) => S.inventory.moveItem(state, from, it.uid, inv).ok;
  // what she asked for
  if (req) {
    /** @type {Map<number, boolean>} whether an item id is what she asked for, asked once per id */
    const asked = new Map();
    const matches = (/** @type {any} */ cfg) => {
      if (!asked.has(cfg.id)) asked.set(cfg.id, !!S.social.requestMatches(req, cfg));
      return asked.get(cfg.id);
    };
    outer: for (const from of sources) {
      for (const it of from.items) {
        const cfg = S.db.item(it.id);
        if (cfg && matches(cfg) && !keepOf(state, it.id) && !DEVICE_PKGS.includes(it.id) && put(from, it)) break outer;
      }
    }
  }
  // food to keep her stocked, what she likes first (never what she dislikes)
  let sat = Math.max(0, (CARE_FOOD_DAYS - n.foodDays) * 40);
  const foods = sources.flatMap((from) => from.items.map((/** @type {any} */ it) => ({ from, it, cfg: S.db.item(it.id) }))).filter((x) => edible(S, x.cfg) && !def?.dislikes?.includes(x.cfg.sub));
  foods.sort((a, b) => satOf(b.cfg) / Math.max(0.1, b.cfg.g) - satOf(a.cfg) / Math.max(0.1, a.cfg.g));
  for (const x of foods) {
    if (sat <= 0 || room() < x.cfg.g / 1000) continue;
    if (put(x.from, x.it)) sat -= x.cfg.sat * (x.cfg.uses > 1 ? (x.it.uses ?? x.cfg.uses) : 1);
  }
  // small goods while she warms up: each counts toward her affinity
  if (n.hearts < 5) {
    for (const from of sources) {
      for (const it of [...from.items]) {
        const cfg = S.db.item(it.id);
        if (room() < 1 || !cfg || !tradeable(S, cfg) || keepOf(state, it.id) || cfg.trade > 40 || cfg.cat === S.db.CAT.FOOD) continue;
        put(from, it);
      }
    }
  }
  const gifts = S.social.basketGiftUids(state);
  if (!inv.items.some((/** @type {any} */ it) => !gifts.includes(it.uid))) return false;
  // what she sent back comes out of the basket first
  for (const uid of gifts) {
    const it = inv.items.find((/** @type {any} */ x) => x.uid === uid);
    if (it) S.inventory.moveItem(state, inv, it.uid, state.inventories[state.player.backpack], null, null, { allowOverweight: true });
  }
  bot.basketDay = day;
  bot.baskets = (bot.baskets || 0) + 1;
  return !!S.social.queueBasketSend(state);
}

/** Fixes the workbench: the repair (with the manual from the cabinet), or studying it from Day 6. @param {Record<string, any>} S @param {any} state */
function fixWorkbench(S, state) {
  const home = survey(S, state);
  const f = home.bench != null ? state.furniture[home.bench] : null;
  if (!f?.broken) return false;
  for (const fn of S.furnActions.furnitureFunctions(state, f)) {
    if (fn.enabled && (fn.spec.kind === 'repairWorkbench' || fn.spec.kind === 'studyWorkbench') && S.furnActions.startFurnitureFunction(state, f.uid, fn.key)) return true;
  }
  return false;
}

/** Heaters to keep lit for the walls' temperature on their floor, and the temperature at which one more can go out. */
const HEAT_STEPS = Object.freeze([
  [12, 14],
  [6, 8],
]);

/**
 * Keeps warm through the cold months: as many heaters lit as the cold the walls let in calls for (none above 12 °C,
 * one above 6 °C, else two), each loaded with diesel by hand first, so the heater's own loading does not burn the
 * trade goods (it takes scrap before fuel).
 * @param {Record<string, any>} S @param {any} state
 */
function heating(S, state) {
  const home = survey(S, state);
  const all = home.heaters.map((/** @type {number} */ uid) => state.furniture[uid]).filter(Boolean);
  if (!all.length) return false;
  const lit = all.filter((/** @type {any} */ f) => f.on === true && !!f.data?.lit);
  const walls = S.weather.baseIndoorTemp(state, all[0].floor);
  // the Greenhouse promise wants every open floor warm: one heater stays lit once committed
  const least = state.story?.route === 'greenhouse' ? 1 : 0;
  const want = Math.max(least, HEAT_STEPS.filter(([on]) => walls < on).length);
  const keep = Math.max(least, HEAT_STEPS.filter(([, off]) => walls < off).length);
  if (lit.length > keep) {
    S.power.setBurner(state, lit[lit.length - 1].uid, false);
    return false;
  }
  if (lit.length >= want) return false;
  const next = all.find((/** @type {any} */ f) => !(f.on === true && f.data?.lit));
  if (!next) return false;
  const slots = S.power.fuelInventory(state, next);
  for (const id of [state.player.backpack, ...home.stores]) {
    const inv = state.inventories[id];
    for (const it of [...(inv?.items || [])]) {
      if (slots.items.length >= slots.slots) break;
      if (it.id === DIESEL) S.inventory.moveItem(state, inv, it.uid, slots);
    }
  }
  const fn = S.furnActions.furnitureFunctions(state, next).find((/** @type {any} */ e) => e.enabled && e.spec.kind === 'fireplace');
  if (!fn || !S.furnActions.startFurnitureFunction(state, next.uid, fn.key)) return false;
  defenderMemory(state).fires = (defenderMemory(state).fires || 0) + 1;
  return true;
}

/** Hours of heating with every heater lit, in the heaters and the fuel at home. @param {Record<string, any>} S @param {any} state */
function heatingHours(S, state) {
  const home = survey(S, state);
  if (!home.heaters.length) return Infinity;
  let heat = 0;
  for (const uid of home.heaters) {
    const f = state.furniture[uid];
    heat += (f?.data?.heat || 0) + (state.inventories[f?.data?.fuel]?.items || []).reduce((/** @type {number} */ n, /** @type {any} */ it) => n + (S.db.item(it.id)?.burn || 0), 0);
  }
  for (const id of [state.player.backpack, ...home.stores]) {
    for (const it of state.inventories[id]?.items || []) {
      const cfg = S.db.item(it.id);
      if (cfg?.cat === S.db.CAT.FUEL && cfg.burn > 0) heat += cfg.burn * (it.qty || 1);
    }
  }
  // a fuel heater burns 50 heat every 10 minutes (Config_FurnitureElectrical 18)
  return heat / (300 * home.heaters.length);
}

// ------------------------------------------------------------------------------------------ the drone and trading
/** Satiety a day the stock is measured in (the survivor's, and the neighbor's on the routes that feed her), and the days of food it trades for until it has them at home. */
const SAT_PER_DAY = 25;
/** @param {any} state */
const satPerDay = (state) => SAT_PER_DAY + (CARE_ROUTES.includes(OPTS.route || '') && state.social?.neighbor?.alive ? 40 : 0) + (OPTS.route === 'stranger' && dayOf(state.clock) >= NETWORK_STOCK_DAY ? NETWORK_SAT_PER_DAY : 0);
const FOOD_DAYS = 45;
/** Bargains (at least BARGAIN satiety per point of trade value) it takes until it has this many days of food. */
const FOOD_MAX_DAYS = 90;
const BARGAIN = 3;

/** Satiety of the edible food at home: storage, backpack, shopping bags, drone hold. @param {Record<string, any>} S @param {any} state */
export function foodAtHome(S, state) {
  let sat = 0;
  const ids = new Set([...S.furnActions.homeSources(state), ...(state.floorBoxes || []).filter((/** @type {any} */ b) => !b.yard).map((/** @type {any} */ b) => b.inv)]);
  for (const id of ids) {
    for (const it of state.inventories[id]?.items || []) {
      const cfg = S.db.item(it.id);
      if (edible(S, cfg)) sat += cfg.sat * (cfg.uses > 1 ? (it.uses ?? cfg.uses) : 1) * (it.qty || 1) * (it.left ?? 1);
    }
  }
  return sat;
}

/** The goods the defender trades away, where the trade panel reaches them (the backpack, fridges, tool cabinets, drone holds). @param {Record<string, any>} S @param {any} state */
function currency(S, state) {
  const out = [];
  /** @type {Record<number, number>} */
  const seen = {};
  for (const src of S.social.tradeSources(state)) {
    for (const inv of src.invs) {
      for (const it of state.inventories[inv]?.items || []) {
        const cfg = S.db.item(it.id);
        if (!tradeable(S, cfg)) continue;
        seen[it.id] = (seen[it.id] || 0) + 1;
        if (seen[it.id] <= keepOf(state, it.id)) continue;
        out.push({ inv, it, cfg });
      }
    }
  }
  return out;
}

/**
 * Trades goods by drone for what `worth` values (per unit; 0 for what it does not want): at the partner whose stock
 * gives the most of it for what the goods are worth to that partner, within the drone's load and taking only what
 * gives at least `minRatio` per point of trade value, paying with the fewest goods that cover the price.
 * @param {Record<string, any>} S @param {any} state @param {any} d @param {(cfg: any) => number} worth @param {number} minRatio
 */
function tradeFor(S, state, d, worth, minRatio) {
  const goods = currency(S, state);
  if (!goods.length) return false;
  const cap = S.social.droneCapacityKg(state);
  let best = null;
  for (const partner of S.social.tradePartners(state)) {
    const stock = S.social
      .partnerStock(state, partner.id)
      .map((/** @type {any} */ e) => ({ ...e, cfg: S.db.item(e.id) }))
      .filter((/** @type {any} */ e) => e.price > 0 && worth(e.cfg) > 0 && worth(e.cfg) / e.price >= minRatio);
    if (!stock.length) continue;
    const vals = goods.map((g) => ({ ...g, v: S.social.sellValue(state, partner.id, g.it) || 0 })).filter((g) => g.v > 0);
    // what the drone can carry out of the goods, the most valuable per kilogram first
    vals.sort((a, b) => b.v / Math.max(0.05, b.cfg.g / 1000) - a.v / Math.max(0.05, a.cfg.g / 1000));
    let budget = 0;
    let giveKg = 0;
    for (const g of vals) {
      if (giveKg + g.cfg.g / 1000 > cap) continue;
      giveKg += g.cfg.g / 1000;
      budget += g.v;
    }
    stock.sort((/** @type {any} */ a, /** @type {any} */ b) => worth(b.cfg) / b.price - worth(a.cfg) / a.price || a.id - b.id);
    const take = [];
    let price = 0;
    let kg = 0;
    let got = 0;
    for (const e of stock) {
      let q = 0;
      while (q < e.qty && price + e.price <= budget && kg + e.cfg.g / 1000 <= cap) {
        q++;
        price += e.price;
        kg += e.cfg.g / 1000;
        got += worth(e.cfg);
      }
      if (q) take.push({ id: e.id, qty: q });
    }
    if (got > 0 && (!best || got > best.got)) best = { partner: partner.id, take, price, got, vals };
  }
  if (!best) return false;
  // pay: the biggest pieces that stay under the price, then the smallest piece that covers the rest
  const pool = [...best.vals].sort((a, b) => b.v - a.v);
  const give = [];
  let paid = 0;
  let kg = 0;
  for (const g of [...pool]) {
    if (paid + g.v > best.price || kg + g.cfg.g / 1000 > cap) continue;
    give.push(g);
    pool.splice(pool.indexOf(g), 1);
    paid += g.v;
    kg += g.cfg.g / 1000;
  }
  while (paid < best.price && pool.length) {
    const short = best.price - paid;
    const fits = pool.filter((g) => kg + g.cfg.g / 1000 <= cap);
    if (!fits.length) break;
    const g = fits.filter((x) => x.v >= short).sort((a, b) => a.v - b.v)[0] || fits[0];
    give.push(g);
    pool.splice(pool.indexOf(g), 1);
    paid += g.v;
    kg += g.cfg.g / 1000;
  }
  if (paid < best.price) return false;
  const r = S.social.executeTrade(state, { drone: d.uid, partner: best.partner, give: give.map((g) => ({ inv: g.inv, uid: g.it.uid })), take: best.take });
  if (!r.ok) return false;
  defenderMemory(state).trades++;
  return true;
}

/** The day's trade: fuel when the heaters run low in the cold months, fever medicine, else food while stocks are low or a bargain is on offer. @param {Record<string, any>} S @param {any} state @param {any} d */
function trade(S, state, d) {
  const bot = defenderMemory(state);
  const day = dayOf(state.clock);
  if (day >= 20 && heatingHours(S, state) < 12 * 24 && tradeFor(S, state, d, (cfg) => (cfg?.cat === S.db.CAT.FUEL && cfg.burn > 0 ? cfg.burn / 1000 : 0), 0)) {
    bot.fuelTrades = (bot.fuelTrades || 0) + 1;
    return true;
  }
  const cures = (/** @type {any} */ id) => !!(/** @type {any} */ (S.itemEffects.MEDICINE)[id]?.cure?.includes('fever'));
  const home = survey(S, state);
  const feverMeds = [state.player.backpack, ...home.stores].reduce((n, id) => n + (state.inventories[id]?.items || []).filter((/** @type {any} */ it) => cures(it.id)).length, 0);
  if (day >= 25 && feverMeds < FEVER_MEDS && tradeFor(S, state, d, (cfg) => (cures(cfg?.id) ? 10 : 0), 0)) {
    bot.medTrades = (bot.medTrades || 0) + 1;
    return true;
  }
  const food = foodAtHome(S, state);
  const hungry = food < FOOD_DAYS * satPerDay(state);
  if (hungry && tradeFor(S, state, d, (cfg) => (edible(S, cfg) ? satOf(cfg) : 0), 0.3)) {
    bot.foodTrades = (bot.foodTrades || 0) + 1;
    return true;
  }
  // the Greenhouse route: waste plastic for the flowerpots it still has to make
  if (OPTS.route === 'greenhouse' && day < 71) {
    const pots = S.farming.homePlanters(state).length + S.planning.installablePackages(state).filter((/** @type {any} */ p) => S.db.furn(p.furnCfg)?.plant > 0).length;
    if (2 * (PLANTERS_WANTED - pots) > S.inventory.countIn(state, S.furnActions.homeSources(state), PLASTIC) && tradeFor(S, state, d, (cfg) => (cfg?.id === PLASTIC ? 1 : 0), 1 / 40)) {
      bot.plasticTrades = (bot.plasticTrades || 0) + 1;
      return true;
    }
  }
  // the Supply Station route wants 180 items stored by Day 71: the cheapest goods by the crateful
  if (OPTS.route === 'supply' && day >= 50 && day <= 74 && S.story.homeItemCount(state) < 200 && tradeFor(S, state, d, (cfg) => (cfg ? 1 : 0), 1 / 40)) {
    bot.stockTrades = (bot.stockTrades || 0) + 1;
    return true;
  }
  // the house: reinforcement kits while the openings have room for them, door and window patches, and glass and
  // sheet metal for spikes while the defense line has free slots
  const room = home.openings.filter((/** @type {any} */ o) => (o.exposed || OPTS.route === 'fortress') && state.furniture[o.uid]).reduce((/** @type {number} */ n, /** @type {any} */ o) => n + 1500 - (state.furniture[o.uid].reinforce || 0), 0);
  const slots = knowsSpikes(state) && S.horde.defenseSlotsInfo(state).some((/** @type {any} */ x) => !x.locked && !x.f);
  const patches = stock(state, home, 20300) + stock(state, home, 20301);
  /** @param {any} cfg */
  const guard = (cfg) => {
    if (!cfg) return 0;
    if (cfg.id === 20311) return room >= 400 * 2 ? 400 : 0;
    if (cfg.id === 20310) return room >= 200 * 2 ? 200 : 0;
    if (cfg.id === 20300 || cfg.id === 20301) return patches < 6 ? 500 : 0;
    if (cfg.id === GLASS) return slots && stock(state, home, GLASS) < KEEP[GLASS] + 4 ? 60 : 0;
    if (cfg.id === IRON) return slots && stock(state, home, IRON) < KEEP[IRON] + 2 ? 60 : 0;
    return 0;
  };
  if (tradeFor(S, state, d, guard, 1)) {
    bot.guardTrades = (bot.guardTrades || 0) + 1;
    return true;
  }
  // books that raise a maximum (the School Shelter trades them for anything), worth their three readings
  const gain = (/** @type {any} */ cfg) => (cfg && maxBook(S, cfg.id) ? Object.values(/** @type {any} */ (S.itemEffects.BOOKS)[cfg.id].max).reduce((a, /** @type {number} */ v) => a + v, 0) * Math.max(1, cfg.uses || 1) : 0);
  if (tradeFor(S, state, d, gain, 0.2)) {
    bot.bookTrades = (bot.bookTrades || 0) + 1;
    return true;
  }
  if (food < FOOD_MAX_DAYS * satPerDay(state) && tradeFor(S, state, d, (cfg) => (edible(S, cfg) ? satOf(cfg) : 0), BARGAIN)) {
    bot.foodTrades = (bot.foodTrades || 0) + 1;
    return true;
  }
  return false;
}

/**
 * The Stranger route (the survivors' network, src/sim/social.js): from NETWORK_JOIN_DAY it answers the help requests,
 * each with food to last to NETWORK_UNTIL (the route checks six members alive from Day 71), topping up anyone who
 * would run out sooner; once committed it flies small supply drops to the best-fed member, one after another, until
 * NETWORK_RUNS of them have gone out. It never sends away the last NETWORK_RESERVE_DAYS of its own food.
 */
const NETWORK_JOIN_DAY = 69;
const NETWORK_UNTIL = 73;
const NETWORK_RUNS = 12;
/** The last day to commit to a route (src/content/endings.js COMMIT_DEADLINE_DAY). */
const COMMIT_DAY_LAST = 74;
const NETWORK_RESERVE_DAYS = 10;
/** Satiety a network member eats a day (src/content/people.js SURVIVOR_DAILY_SAT) and the least a drop carries. */
const MEMBER_SAT = 40;
const DROP_SAT = 40;
/** From this day it stocks food for the network too (Satiety a day on top of its own). */
const NETWORK_STOCK_DAY = 45;
const NETWORK_SAT_PER_DAY = 60;

/**
 * Flies the drone for the Stranger route's network (see NETWORK_JOIN_DAY). True when it sent the drone.
 * @param {Record<string, any>} S @param {any} state @param {any} d
 */
function network(S, state, d) {
  if (OPTS.route !== 'stranger' || !state.social?.survivors) return false;
  const day = dayOf(state.clock);
  const survivors = state.social.survivors.filter((/** @type {any} */ v) => v.alive);
  const members = survivors.filter((/** @type {any} */ v) => v.inNetwork).sort((/** @type {any} */ a, /** @type {any} */ b) => a.food - b.food);
  let to = null;
  let op = '';
  let sat = 0;
  if (state.story.route === 'stranger') {
    if ((state.progress.counters['camp.prep.supply'] || 0) >= NETWORK_RUNS || !members.length) return false;
    [to, op, sat] = [members[members.length - 1], 'deliver', DROP_SAT];
  } else if (day >= NETWORK_JOIN_DAY && day <= COMMIT_DAY_LAST) {
    const low = members.find((/** @type {any} */ v) => day + v.food < NETWORK_UNTIL);
    const asking = survivors.find((/** @type {any} */ v) => v.status === 'help');
    if (low) [to, op, sat] = [low, 'deliver', (NETWORK_UNTIL - day - low.food) * MEMBER_SAT];
    else if (asking) [to, op, sat] = [asking, 'help', (NETWORK_UNTIL - day) * MEMBER_SAT];
  }
  if (!to) return false;
  sat = Math.min(sat, foodAtHome(S, state) - NETWORK_RESERVE_DAYS * SAT_PER_DAY);
  if (sat < 30) return false;
  // the food, close to what the drop should carry: the biggest item that still fits, else the smallest that covers it
  const sources = [state.player.backpack, ...survey(S, state).stores];
  const foods = sources.flatMap((id) => (state.inventories[id]?.items || []).map((/** @type {any} */ it) => ({ inv: id, it, sat: S.social.foodSat(it) }))).filter((x) => x.sat > 0 && edible(S, S.db.item(x.it.id)));
  foods.sort((a, b) => b.sat - a.sat);
  const give = [];
  let got = 0;
  while (got < Math.max(sat, 30) && foods.length) {
    const need = Math.max(sat, 30) - got;
    const i = foods.findIndex((x) => x.sat <= need);
    const [x] = foods.splice(i >= 0 ? i : foods.length - 1, 1);
    give.push({ inv: x.inv, uid: x.it.uid });
    got += x.sat;
  }
  if (got < 30) return false;
  const r = op === 'help' ? S.social.respondHelp(state, { drone: d.uid, survivor: to.id, give }) : S.social.deliverSupplies(state, { drone: d.uid, survivor: to.id, give });
  if (!r?.ok) return false;
  const bot = defenderMemory(state);
  bot.network = (bot.network || 0) + 1;
  return true;
}

/** The drone's day: the Stranger route's network, fetch the loot in the yard, trade, scavenge. True when it queued or sent something. @param {Record<string, any>} S @param {any} state */
function flyDrone(S, state) {
  const bot = defenderMemory(state);
  const d = (state.social?.drones || []).find((/** @type {any} */ x) => x.busyUntil <= state.clock.t && state.furniture[x.uid]);
  if (!d || state.inventories[d.cargo]?.items.length) return false;
  if (network(S, state, d)) return true;
  // the loot in the yard, once for every new drop (what finds no room in the hold stays out there)
  const innerH = S.home.homeFloors(state.home.id)['1F']?.innerH ?? Infinity;
  const yard = (state.floorBoxes || []).reduce((/** @type {number} */ n, /** @type {any} */ b) => n + (b.floor === '1F' && b.y >= innerH ? state.inventories[b.inv]?.items.length || 0 : 0), 0);
  if (bot.looting) {
    bot.looting = false;
    bot.yardLeft = yard;
  }
  if (yard < (bot.yardLeft || 0)) bot.yardLeft = yard;
  if (yard > (bot.yardLeft || 0) && !attackedNow(state) && S.social.queueDroneOp(state, 'loot', { drone: d.uid }).ok) {
    bot.loots = (bot.loots || 0) + 1;
    bot.looting = true;
    return true;
  }
  if (!OPTS.solo && d.dailyTrades < S.social.tradeQuota(state) && trade(S, state, d)) return true;
  if (d.dailyScavenges < S.social.scavengeQuota(state) && S.social.queueDroneOp(state, 'scavenge', { drone: d.uid }).ok) {
    bot.scavenges = (bot.scavenges || 0) + 1;
    return true;
  }
  return false;
}

// ------------------------------------------------------------------------------------------ after the outbreak
/** @param {Record<string, any>} S @param {any} state */
function holdOut(S, state) {
  const p = state.player;
  const bot = defenderMemory(state);
  const t = state.clock.t;
  if (state.story?.active || state.story?.pending?.length) {
    for (let i = 0; i < 5 && (state.story.active || S.story.presentNext(state)); i++) {
      S.story.resolveEvent(state, eventChoice(state));
      bot.events = (bot.events || 0) + 1;
    }
  }
  if (state.run.settlement?.pending || (state.run.offers && !state.run.offers.closed)) settle(S, state);
  if (state.crises?.radioMission?.status === 'offered' && S.horde.acceptRadioMission(state)) bot.missions = (bot.missions || 0) + 1;
  const attacked = attackedNow(state);
  const sta = p.stats.sta;
  const home = bot.home;
  // woken by the door: stop resting when an opening is going
  if (attacked && p.sleeping && ((sta >= 12 && home?.openings.some((/** @type {any} */ o) => state.furniture[o.uid] && share(state.furniture[o.uid]) < 0.8)) || (sta >= 40 && (state.zombies || []).some((/** @type {any} */ z) => z.home && !z.leaving && z.mt == null && home?.openings.length)))) S.actions.cancelCurrent(state);
  // up from a night's sleep in the morning for an outing
  if (p.sleeping && !attacked && t - (bot.wokeAt || 0) >= HOUR && (OPTS.solo || OPTS.route === 'truth')) {
    bot.wokeAt = t;
    if (outingSite(S, state)) {
      S.actions.cancelCurrent(state);
      bot.choreAt = 0;
    }
  }
  if (busy(state)) return;
  const maxSta = S.stats.effectiveMax(state, 'sta');
  // the house in order: when the drone came back with a load, and every few hours
  const landed = (state.social?.drones || []).some((/** @type {any} */ d) => d.busyUntil <= t && state.inventories[d.cargo]?.items.length);
  if (landed || t - (bot.storedAt || 0) > 6 * HOUR) {
    organize(S, state);
    bot.storedAt = t;
  }
  if (AILMENTS.some((id) => p.effects[id]) && treat(S, state)) return;
  if (t - (bot.heatAt || 0) >= HOUR) {
    bot.heatAt = t;
    if (heating(S, state)) return;
  }
  if (attacked) {
    // an opening under three quarters is repaired first; otherwise it stabs through the busiest opening at the
    // zombies pressing against it while it has the stamina, tops the openings up, and rests
    if (repair(S, state, 0.75)) return;
    if (sta >= 30 && S.horde.busiestOpening(state)) {
      if (S.horde.queueCounterattack(state)) bot.counters++;
      return;
    }
    if (repair(S, state, 0.9)) return;
    if (p.stats.sat < 35 && eatMeal(S, state)) return;
    if (sta < 0.95 * maxSta) rest(S, state);
    return;
  }
  if (p.stats.sat < S.stats.REGEN_SAT + 15 && eatMeal(S, state)) return;
  const soon = nextHordeAt(state) - t < 12 * HOUR;
  if (sta >= (soon ? 12 : 40) && repair(S, state, 0.95)) return;
  if (t - (bot.droneAt || 0) >= HOUR) {
    bot.droneAt = t;
    if (flyDrone(S, state)) return;
  }
  if (!soon && sta >= 40 && t - (bot.choreAt || 0) >= 2 * HOUR) {
    if (setUp(S, state) || fixWorkbench(S, state) || reinforce(S, state) || defenseLine(S, state) || powerWork(S, state) || openFloors(S, state)) return;
    if (bot.opts.route === 'evacuate' && beaconWork(S, state)) return;
    if (commit(S, state) || neighborCare(S, state) || outing(S, state) || greenhouseWork(S, state)) return;
    if (habit(S, state) || read(S, state)) return;
    bot.choreAt = t;
  }
  if (p.stats.mor < 0.5 * S.stats.effectiveMax(state, 'mor') && leisure(S, state, soon && sta < 0.9 * maxSta)) return;
  rest(S, state);
}

/**
 * One step of the defender (every 10 game minutes).
 * @param {Record<string, any>} S @param {any} state @param {DefenderOptions} [opts]
 */
export function defenderStep(S, state, opts) {
  OPTS = defenderMemory(state, opts).opts;
  if (state.phase === 'pre') return prepare(S, state);
  if (state.phase !== 'post') return;
  // the outing under way (src/sim/explore.js exploreRun), read off the state
  const run = state.explore?.run;
  if (run) return atSite(S, state, run);
  if (state.player.scene !== 'home') return;
  holdOut(S, state);
}

/** Game seconds of one defender step. */
export const DEFENDER_STEP = 600;

/**
 * How long a driver may let the sim run before the defender's next step: one step (10 game minutes) while it has a
 * choice to make or zombies are about; while the survivor is in the middle of an action with nothing coming, until
 * that action ends (at most an hour, never past the next horde or wandering zombies). The balance sessions step every
 * 10 minutes; the achievement play-throughs use this to make fewer calls into the game.
 * @param {any} state
 */
export function defenderPace(state) {
  if (state.phase !== 'post') return DEFENDER_STEP;
  if (state.explore?.run?.phase === 'site') return SITE_STEP;
  const a = state.actions.current;
  if (!a || a.phase !== 'work' || state.actions.queue.length || attackedNow(state) || state.crises?.horde || state.crises?.thugs?.status === 'pending') return DEFENDER_STEP;
  const t = state.clock.t;
  const until = Math.min((a.dur || 0) - (a.elapsed || 0), nextHordeAt(state) - t, (state.crises?.sporadic?.at ?? Infinity) - t, (state.crises?.thugs?.status === 'coming' ? state.crises.thugs.at : Infinity) - t, HOUR);
  return Math.max(DEFENDER_STEP, Math.floor(until / DEFENDER_STEP) * DEFENDER_STEP);
}
