// Pre-disaster phase (features E01–E15): the 10-hour hoarding rush. Travel across the city map,
// walkable shop scenes, buying with weight/space/money validation, bulk packages, doorstep
// deliveries, the car and its trunk, money sources (wallet, phone loan, neighbor, refunds, pawning,
// blood), shop NPCs, free loot, riots and the doomsday rush, the Stockpile Checklist, and the
// stats finalized when the outbreak hits.
import { registerSystem, outbreak, tick } from './tick.js';
import { registerKind, enqueue, cancelAll, getKind } from './actions.js';
import { registerScene } from './scenes.js';
import { registerObjectives } from './objectives.js';
import { registerSuggestions } from './suggest.js';
import { createInventory, destroyInventory, makeInstance, insert, fitsWeight, removeUid, weightKg } from './inventory.js';
import { homeDef, homeFloors, homeFurniture, frontDoor, interactionTile, dropToFloor, removeFurniture, spillStorage, slotDef, furnLabel } from './home.js';
import { homeSources, registerFuncAvailability } from './furnActions.js';
import { addStat, addEffect, moveSpeedMult } from './stats.js';
import { getMods } from './modifiers.js';
import { secondsUntilOutbreak, formatDuration, formatClock, HOUR } from './time.js';
import { buildFloor, cellAt, CELL, cellKey } from './scene.js';
import { logEvent } from './state.js';
import { randInt, pick, shuffle } from '../engine/rng.js';
import { emit } from '../engine/bus.js';
import { pickLang } from '../engine/i18n.js';
import { item, itemName, furn, furnName, CAT, SLOT, packageToFurniture, furnitureToPackage } from '../data/db.js';
import { CHARACTERS } from '../content/characters.js';
import { fixtureFunc } from '../content/funcSpecs.js';
import {
  LOCATIONS,
  SHOPS,
  SHOP_FLOOR,
  SHOP_NPCS,
  CARS,
  RUSH,
  RIOT_HOURS,
  RIOT_LOOT,
  BLOOD_PRICE,
  ANEMIA_HOURS,
  NEWS,
  CHECKLIST,
  BULK_DISCOUNT,
  BULK_DISCOUNT_CAP,
  RESTOCK_FRACTION,
  PACKAGE_STOCK,
  bulkSize,
  stockRange,
  travelMinutes,
} from '../content/shops.js';

export const POINTS_GOAL = 5;
export const KG_GOALS = [5, 25, 50];
const HASTY_COST = { sta: 20, mor: 10 };

const REASONS = {
  closed: { en: 'The shops are closed — the city has fallen.', zh: '商店都关了——城市已经沦陷。' },
  notHere: { en: 'You need to be there first.', zh: '你得先到那里。' },
  notHome: { en: 'You need to be at home.', zh: '你得在家里。' },
  here: { en: 'You are already here.', zh: '你已经在这里了。' },
  unavailable: { en: 'Not available.', zh: '没有这个商品。' },
  soldOut: { en: 'Sold out.', zh: '卖完了。' },
  money: { en: 'Not enough money.', zh: '资金不足。' },
  weight: { en: 'Too heavy for your backpack.', zh: '背包装不下这么重的东西。' },
  space: { en: 'Not enough space.', zh: '空间不足。' },
  haveCar: { en: 'You already own a car.', zh: '你已经有车了。' },
  noCar: { en: 'You do not have a car.', zh: '你没有车。' },
  needCar: { en: 'Buy a car at the Used Car Lot to load the cart straight into your trunk.', zh: '在二手车场买辆车，购物车里的东西就能直接装进后备箱。' },
  trunkNotEmpty: { en: 'Empty the trunk first.', zh: '请先清空后备箱。' },
  notReturnable: { en: 'This cannot be returned.', zh: '这个不能退。' },
  notPawnable: { en: 'The buyer does not want that.', zh: '收购的人不要这个。' },
  riot: { en: 'The service desk was abandoned in the riot.', zh: '暴乱中服务台已经没人了。' },
  rushUsed: { en: 'You already rushed the checkout.', zh: '你已经抢购过了。' },
  rushLate: { en: 'Less than 30 minutes left — too late to rush in. Get home!', zh: '距离灾变不足30分钟，来不及抢购了。快回家！' },
  bloodSold: { en: 'You already sold blood today.', zh: '今天已经卖过血了。' },
  done: { en: 'Already done.', zh: '已经做过了。' },
  searched: { en: 'Nothing left here.', zh: '这里已经没东西了。' },
  tried: { en: 'You already tried this one.', zh: '这个已经试过了。' },
  unreachable: { en: 'You cannot reach that.', zh: '过不去。' },
};

export function preReason(reason) {
  return pickLang(REASONS[reason] || { en: String(reason), zh: String(reason) });
}

const fail = (reason) => ({ ok: false, reason });
const reasonOrTrue = (reason) => (reason ? preReason(reason) : true);

// ------------------------------------------------------------------------------ state
function ensurePre(state) {
  const pre = state.pre;
  pre.visited ??= [];
  pre.foodTypes ??= [];
  pre.matTypes ??= [];
  pre.deliveries ??= [];
  pre.rushUsed ??= {};
  pre.shopStock ??= {};
  pre.news ??= [];
  pre.visits ??= {};
  pre.metNpcs ??= [];
  pre.npcTalks ??= {};
  pre.bought ??= {};
  pre.paid ??= {};
  pre.ground ??= {};
  pre.riotLoot ??= {};
  pre.lootTaken ??= {};
  pre.trials ??= {};
  pre.pawned ??= [];
  pre.returned ??= [];
  pre.tips ??= {};
  pre.travel ??= null;
  pre.location ??= 'home';
}

export function currentShop(state) {
  const scene = state.player.scene || 'home';
  return scene.startsWith('shop:') ? scene.slice(5) : null;
}

export function locationOf(state) {
  return currentShop(state) || 'home';
}

export function locationName(id) {
  return pickLang(LOCATIONS[id]?.name);
}

function pay(state, amount) {
  state.player.money -= amount;
  state.pre.spent += amount;
}

// Money that was not in the starting budget (wallet, loan, gifts, pawning, blood) raises the budget.
function income(state, amount) {
  state.player.money += amount;
  state.pre.budget += amount;
}

// Refunds for something bought this loop lower the amount spent; other refunds count as income.
function refund(state, amount, key) {
  const pre = state.pre;
  state.player.money += amount;
  if (pre.bought[key] > 0) {
    pre.bought[key] -= 1;
    pre.spent = Math.max(0, pre.spent - amount);
  } else {
    pre.budget += amount;
  }
}

function recordPurchase(state, id, n, unit) {
  const pre = state.pre;
  pre.bought[id] = (pre.bought[id] || 0) + n;
  if (unit != null) pre.paid[id] = unit;
  const cfg = item(id);
  if (cfg?.cat === CAT.FOOD && !pre.foodTypes.includes(id)) pre.foodTypes.push(id);
  if (cfg?.cat === CAT.MATERIAL && !pre.matTypes.includes(id)) pre.matTypes.push(id);
}

// ------------------------------------------------------------------------------ shop geometry
const grids = new Map();

export function shopGrid(shopId) {
  if (!grids.has(shopId)) grids.set(shopId, buildFloor(`shop:${shopId}`, SHOPS[shopId].floor));
  return grids.get(shopId);
}

const lootKey = (shopId, id) => `${shopId}:${id}`;

// Render-ready fixtures of a shop: static fixtures plus riot goods on the floor.
export function shopFixtures(state, shopId) {
  const shop = SHOPS[shopId];
  if (!shop) return [];
  const spotter = getMods(state).highlightLoot > 0;
  const out = [];
  for (const f of shop.fixtures) {
    if (f.hidden && !spotter) continue;
    out.push({ ...f, uid: `fx:${shopId}:${f.id}`, data: {}, exclaim: !!f.loot && !state.pre.lootTaken[lootKey(shopId, f.id)] });
  }
  for (const spot of state.pre.riotLoot[shopId] || []) {
    if (spot.taken) continue;
    out.push({ id: spot.id, kind: 'riot', cfg: 1024, x: spot.x, y: spot.y, w: 1, h: 1, pass: true, items: spot.items, uid: `fx:${shopId}:${spot.id}`, data: {}, exclaim: true });
  }
  return out;
}

export function shopNpcs(state, shopId) {
  return (SHOPS[shopId]?.npcs || []).map((n) => ({ ...SHOP_NPCS[n.id], x: n.x, y: n.y, label: npcName(state, n.id) }));
}

export function npcName(state, npcId) {
  const name = SHOP_NPCS[npcId]?.name;
  return pickLang(name?.[state.meta.character] || name);
}

export function fixtureLabel(f) {
  if (f.name) return pickLang(f.name);
  if (f.kind === 'car') return pickLang(CARS[f.car].name);
  if (f.kind === 'riot') return pickLang({ en: 'Dropped goods (free)', zh: '散落的货物（免费）' });
  return furnName(f.cfg);
}

export function shopBlocked(state, shopId) {
  const set = new Set();
  for (const f of shopFixtures(state, shopId)) {
    if (f.pass) continue;
    for (let dy = 0; dy < f.h; dy++) for (let dx = 0; dx < f.w; dx++) set.add(cellKey(f.x + dx, f.y + dy));
  }
  for (const n of SHOPS[shopId]?.npcs || []) set.add(cellKey(n.x, n.y));
  return set;
}

// Open tile next to a fixture (or NPC) where the survivor stands to use it.
export function accessTile(state, shopId, f, from = state.player) {
  if (f.pass) return [f.x, f.y];
  const grid = shopGrid(shopId);
  const blocked = shopBlocked(state, shopId);
  const w = f.w || 1;
  const h = f.h || 1;
  const cands = [];
  for (let x = f.x - 1; x <= f.x + w; x++) {
    for (let y = f.y - 1; y <= f.y + h; y++) {
      const inside = x >= f.x && x < f.x + w && y >= f.y && y < f.y + h;
      const corner = (x === f.x - 1 || x === f.x + w) && (y === f.y - 1 || y === f.y + h);
      if (inside || corner) continue;
      if (cellAt(grid, x, y) === CELL.FLOOR && !blocked.has(cellKey(x, y))) cands.push([x, y]);
    }
  }
  if (!cands.length) return null;
  const d = ([x, y]) => Math.abs(x - (from?.x ?? x)) + Math.abs(y - (from?.y ?? y));
  cands.sort((a, b) => d(a) - d(b));
  return cands[0];
}

registerScene('shop', {
  floor: (state) => shopGrid(currentShop(state)),
  blocked: (state) => shopBlocked(state, currentShop(state)),
  stairs: () => null,
});

// ------------------------------------------------------------------------------ travel
export function travelSeconds(state, from, to) {
  const byCar = !!state.pre.car;
  let min = travelMinutes(from, to, byCar);
  if (!byCar) min /= moveSpeedMult(state) * (getMods(state).moveMult || 1);
  return Math.round(min) * 60;
}

function exitTarget(state) {
  const shop = currentShop(state);
  if (shop) {
    const [x, y] = SHOPS[shop].entrance;
    return { x, y, floor: SHOP_FLOOR };
  }
  const door = frontDoor(state);
  return door ? { furn: door.uid } : null;
}

export function startTravel(state, dest) {
  if (!LOCATIONS[dest]) return null;
  const from = locationOf(state);
  const target = exitTarget(state);
  const byCar = !!state.pre.car;
  const min = travelSeconds(state, from, dest) / 60;
  return enqueue(
    state,
    {
      kind: 'travel',
      label: pickLang({ en: `${byCar ? '🚗' : '🚶'} To ${locationName(dest)}`, zh: `${byCar ? '🚗' : '🚶'} 前往${locationName(dest)}` }),
      dest,
      target,
      noWalk: !target,
      dur: min * 60,
      noSlow: true,
      cost: { sta: byCar ? 1 : Math.max(1, Math.round(min / 12)) },
    },
    { replace: true }
  );
}

// Put the survivor into a scene: 'home' or a shop id.
export function arriveAt(state, dest) {
  const p = state.player;
  const pre = state.pre;
  if (dest === 'home') {
    const sp = homeDef(state.home.id).spawn;
    Object.assign(p, { scene: 'home', floor: sp.floor, x: sp.x, y: sp.y, px: sp.x, py: sp.y, path: [], walkT: 0 });
    state.ui.viewFloor = sp.floor;
  } else {
    const [x, y] = SHOPS[dest].entrance;
    Object.assign(p, { scene: `shop:${dest}`, floor: SHOP_FLOOR, x, y, px: x, py: y, path: [], walkT: 0 });
    pre.visits[dest] = (pre.visits[dest] || 0) + 1;
    if (LOCATIONS[dest].supply && !pre.visited.includes(dest)) {
      pre.visited.push(dest);
      state.progress.counters['pre.points'] = pre.visited.length;
    }
    restock(state, dest);
    if (pre.riot) spawnRiotLoot(state, dest);
  }
  pre.location = dest;
  emit('sceneChanged', { scene: p.scene, location: dest });
}

registerKind('travel', {
  canStart(state, a) {
    if (state.phase !== 'pre') return preReason('closed');
    if (a.dest === locationOf(state)) return preReason('here');
    return true;
  },
  begin(state, a) {
    const from = locationOf(state);
    a.dur = travelSeconds(state, from, a.dest);
    state.pre.travel = { from, dest: a.dest, t0: state.clock.t, eta: state.clock.t + a.dur, car: !!state.pre.car };
  },
  cancel(state) {
    state.pre.travel = null;
  },
  complete(state, a) {
    state.pre.travel = null;
    arriveAt(state, a.dest);
  },
});

// The front door's "Go Out" (Config_FurnitureFunc 239/240) opens the city map before the outbreak.
// Any other use of 'goOut' goes to the handler that was registered before this one.
const GO_OUT = Symbol('preGoOut');
function installGoOut() {
  const prev = getKind('goOut');
  if (prev?.[GO_OUT]) return;
  const mine = (state, a) => state.phase === 'pre' && !a.spec?.explore;
  registerKind('goOut', {
    [GO_OUT]: true,
    canStart: (state, a) => (mine(state, a) ? true : (prev?.canStart?.(state, a) ?? true)),
    begin: (state, a) => (mine(state, a) ? undefined : prev?.begin?.(state, a)),
    progress: (state, a, dt) => (mine(state, a) ? undefined : prev?.progress?.(state, a, dt)),
    cancel: (state, a) => (mine(state, a) ? undefined : prev?.cancel?.(state, a)),
    complete: (state, a) => (mine(state, a) ? emit('openPanel', { panel: 'map' }) : prev?.complete?.(state, a)),
  });
}
installGoOut();

// ------------------------------------------------------------------------------ stock & buying
export function shelfDef(shopId, shelfId) {
  return SHOPS[shopId]?.fixtures.find((f) => f.id === shelfId && f.kind === 'shelf') || null;
}

export function unitPrice(state, shelf, id) {
  const cfg = item(id);
  const base = cfg.cat === CAT.FURNITURE_PACKAGE ? furn(cfg.furn)?.price || cfg.price : cfg.price;
  const mult = (shelf?.priceMult ?? 1) * (1 - (getMods(state).shopDiscount || 0));
  return Math.max(1, Math.round(base * mult));
}

export function bulkDiscount(state) {
  return Math.min(BULK_DISCOUNT_CAP, BULK_DISCOUNT + (getMods(state).bulkDiscount || 0));
}

function initialQty(state, shelf, id) {
  if (item(id).cat === CAT.FURNITURE_PACKAGE) return PACKAGE_STOCK;
  const [lo, hi] = stockRange(unitPrice(state, shelf, id));
  return Math.max(1, Math.round(randInt(state, lo, hi) * (getMods(state).supply || 1)));
}

// Shelves are stocked on the first visit and refill to at least half on every later visit.
export function restock(state, shopId) {
  const pre = state.pre;
  const stock = (pre.shopStock[shopId] ||= { visit: -1, left: {}, max: {} });
  const visit = pre.visits[shopId] || 0;
  if (stock.visit === visit) return stock;
  for (const f of SHOPS[shopId].fixtures) {
    if (f.kind !== 'shelf') continue;
    for (const id of f.items) {
      const key = `${f.id}:${id}`;
      if (stock.max[key] == null) {
        stock.max[key] = initialQty(state, f, id);
        stock.left[key] = stock.max[key];
      } else {
        stock.left[key] = Math.max(stock.left[key], Math.ceil(stock.max[key] * RESTOCK_FRACTION));
      }
    }
  }
  stock.visit = visit;
  return stock;
}

// [{ id, pkg, unit, left, bulk, bulkPrice, rec, cut }]
// Boston Ivy is the College Student's defensive plant (guide G5): only she knows to ask for the seeds.
const CHARACTER_ONLY = { 15040: 'student' };

export function shelfOffers(state, shopId, shelfId) {
  const shelf = shelfDef(shopId, shelfId);
  if (!shelf) return [];
  const stock = restock(state, shopId);
  const disc = bulkDiscount(state);
  return shelf.items.filter((id) => !CHARACTER_ONLY[id] || CHARACTER_ONLY[id] === state.meta.character).map((id) => {
    const cfg = item(id);
    const pkg = cfg.cat === CAT.FURNITURE_PACKAGE;
    const unit = unitPrice(state, shelf, id);
    const bulk = pkg || shelf.noBulk ? 0 : shelf.bulkAll || bulkSize(unit);
    return { id, pkg, unit, left: stock.left[`${shelfId}:${id}`] ?? 0, bulk, bulkPrice: bulk ? Math.round(unit * bulk * (1 - disc)) : 0, rec: cfg.rec || 0, cut: !!cfg.cut };
  });
}

// Would n new copies of an item fit (weight first, then grid space)? Returns a reason or null.
export function fitCheck(inv, id, n = 1) {
  const tmp = { ...inv, items: inv.items.slice() };
  for (let i = 0; i < n; i++) {
    const probe = { uid: -1 - i, id, x: 0, y: 0, r: false, qty: 1, uses: item(id).uses, age: 0 };
    if (!fitsWeight(tmp, probe)) return 'weight';
    if (!insert(tmp, probe, { allowOverweight: true })) return 'space';
  }
  return null;
}

export function trunkInv(state) {
  return (state.pre.trunk && state.inventories[state.pre.trunk]) || null;
}

function buyTarget(state, dest) {
  return (dest === 'trunk' && trunkInv(state)) || state.inventories[state.player.backpack];
}

// Buy one unit or a bulk package. Furniture packages go to the doorstep; goods into the backpack
// (weight and grid enforced) or the car trunk (no weight limit, not carried).
export function buy(state, shopId, shelfId, itemId, { bulk = false, dest = 'backpack' } = {}) {
  if (state.phase !== 'pre') return fail('closed');
  if (currentShop(state) !== shopId) return fail('notHere');
  const offer = shelfOffers(state, shopId, shelfId).find((o) => o.id === itemId);
  const n = offer ? (bulk ? offer.bulk : 1) : 0;
  if (!n) return fail('unavailable');
  if (offer.left < n) return fail('soldOut');
  const cost = bulk ? offer.bulkPrice : offer.unit;
  if (state.player.money < cost) return fail('money');
  const cfg = item(itemId);
  if (offer.pkg) {
    for (let i = 0; i < n; i++) deliverToDoorstep(state, itemId, shopId);
  } else {
    const inv = buyTarget(state, dest);
    const why = fitCheck(inv, itemId, n);
    if (why) return fail(why);
    const aged = shelfDef(shopId, shelfId).aged;
    const age = aged && cfg.life > 0 ? cfg.life * aged : 0;
    for (let i = 0; i < n; i++) insert(inv, makeInstance(state, itemId, { age }));
  }
  pay(state, cost);
  restock(state, shopId).left[`${shelfId}:${itemId}`] -= n;
  recordPurchase(state, itemId, n, offer.unit);
  if (offer.pkg) {
    emit('toast', { text: pickLang({ en: `${itemName(itemId)} will be waiting at your doorstep.`, zh: `${itemName(itemId)}会送到你家门口。` }), kind: 'good' });
  } else if (offer.cut) {
    emit('toast', { text: pickLang({ en: `${itemName(itemId)} is a large frozen cut: after the disaster, click it in your backpack and Cut Up into smaller pieces.`, zh: `${itemName(itemId)}是大块冻品：灾变后在背包里点击它并选择“切分”，切成小块。` }) });
  }
  return { ok: true, cost, n, delivered: offer.pkg };
}

// ------------------------------------------------------------------------------ doorstep deliveries
export function doorstepInv(state) {
  let inv = state.home.doorstepInv && state.inventories[state.home.doorstepInv];
  if (!inv) {
    inv = createInventory(state, { kind: 'doorstep', w: 10, h: 8, maxKg: null, label: 'doorstep' });
    state.home.doorstepInv = inv.id;
  }
  return inv;
}

export function doorstepCount(state) {
  const inv = state.home.doorstepInv && state.inventories[state.home.doorstepInv];
  return inv ? inv.items.length : 0;
}

// The tile just inside the front door (shopping bags and overflow parcels land here).
export function entranceTile(state) {
  const door = frontDoor(state);
  if (door) {
    const [x, y] = interactionTile(state, door);
    return { floor: door.floor, x, y };
  }
  const sp = homeDef(state.home.id).spawn;
  return { floor: sp.floor, x: sp.x, y: sp.y };
}

export function deliverToDoorstep(state, itemId, from = null) {
  const inst = makeInstance(state, itemId);
  if (!insert(doorstepInv(state), inst, { allowOverweight: true })) {
    const e = entranceTile(state);
    dropToFloor(state, inst, e.floor, e.x, e.y);
  }
  state.pre.deliveries.push({ id: itemId, t: state.clock.t, from });
  return inst;
}

// Walk to the front door and open the doorstep delivery area (func 2005 only exists after the outbreak).
export function openDoorstep(state) {
  const door = state.player.scene === 'home' ? frontDoor(state) : null;
  if (!door) {
    emit('openPanel', { panel: 'doorstep' });
    return null;
  }
  return enqueue(state, { kind: 'open', label: pickLang({ en: 'Doorstep deliveries', zh: '门口的快递' }), target: { furn: door.uid }, furn: door.uid, spec: { panel: 'doorstep' }, dur: 0 }, { replace: true });
}

// ------------------------------------------------------------------------------ vehicles
export function buyCar(state, carId) {
  const car = CARS[carId];
  if (!car) return fail('unavailable');
  if (state.phase !== 'pre') return fail('closed');
  if (currentShop(state) !== 'carlot') return fail('notHere');
  if (state.pre.car) return fail('haveCar');
  if (state.player.money < car.price) return fail('money');
  pay(state, car.price);
  const trunk = createInventory(state, { kind: 'trunk', w: car.trunk[0], h: car.trunk[1], maxKg: null, label: 'trunk' });
  state.pre.car = { id: carId, price: car.price, t: state.clock.t };
  state.pre.trunk = trunk.id;
  state.pre.bought[`car:${carId}`] = 1;
  logEvent(state, pickLang({ en: `Bought a ${pickLang(car.name)}.`, zh: `买了一辆${pickLang(car.name)}。` }), 'good');
  return { ok: true, cost: car.price };
}

// The dealer refunds the car in full if it comes back before the outbreak with an empty trunk.
export function returnCar(state) {
  const car = state.pre.car;
  if (!car) return fail('noCar');
  if (currentShop(state) !== 'carlot') return fail('notHere');
  if (trunkInv(state)?.items.length) return fail('trunkNotEmpty');
  if (state.pre.trunk) destroyInventory(state, state.pre.trunk);
  state.pre.trunk = null;
  state.pre.car = null;
  refund(state, car.price, `car:${car.id}`);
  return { ok: true, refund: car.price };
}

// ------------------------------------------------------------------------------ returns & pawning
export function packageRefund(state, id) {
  return state.pre.paid[id] ?? furn(packageToFurniture[id])?.price ?? item(id)?.price ?? 0;
}

// Intact packages bought this loop, in the backpack, trunk or doorstep area.
export function returnablePackages(state) {
  const out = [];
  for (const invId of [state.player.backpack, state.pre.trunk, state.home.doorstepInv]) {
    const inv = invId && state.inventories[invId];
    if (!inv) continue;
    for (const inst of inv.items) {
      if (item(inst.id)?.cat !== CAT.FURNITURE_PACKAGE || !(state.pre.bought[inst.id] > 0)) continue;
      out.push({ invId, uid: inst.uid, id: inst.id, refund: packageRefund(state, inst.id) });
    }
  }
  return out;
}

export function returnPackage(state, invId, uid) {
  if (state.phase !== 'pre') return fail('closed');
  if (currentShop(state) !== 'renovation') return fail('notHere');
  if (state.pre.riot) return fail('riot');
  const entry = returnablePackages(state).find((p) => p.invId === invId && p.uid === uid);
  if (!entry) return fail('notReturnable');
  removeUid(state.inventories[invId], uid);
  refund(state, entry.refund, entry.id);
  state.pre.returned.push(entry.id);
  return { ok: true, refund: entry.refund };
}

// Installed furniture that can still go back to the store: the starter decorative flowerpot, or
// something bought this loop that is undamaged and emptied.
export function canReturnHome(state, f) {
  if (state.phase !== 'pre' || !f || typeof f.cfg !== 'number' || f.fixed) return false;
  const starter = !!f.data?.decorPlant;
  if (!starter && !(state.pre.bought[furnitureToPackage[f.cfg]] > 0)) return false;
  // a crop growing in it (the starter pot's own decorative plant, which farming summarizes as a decor plant, goes too)
  if (f.data?.plant && !f.data.plant.decor) return false;
  if (f.inv && state.inventories[f.inv]?.items.length) return false;
  return f.hp >= (f.maxHp || 0);
}

export function homeReturnPrice(state, f) {
  return (f.data?.decorPlant ? null : state.pre.paid[furnitureToPackage[f.cfg]]) ?? furn(f.cfg)?.price ?? 0;
}

export function returnableHomeFurniture(state) {
  return homeFurniture(state).filter((f) => canReturnHome(state, f));
}

export function returnHomeFurniture(state, uid) {
  const f = state.furniture[uid];
  if (!canReturnHome(state, f)) return fail('notReturnable');
  const price = homeReturnPrice(state, f);
  const key = f.data?.decorPlant ? `starter:${f.cfg}` : furnitureToPackage[f.cfg];
  spillStorage(state, f, state.player.backpack);
  removeFurniture(state, uid);
  refund(state, price, key);
  state.pre.returned.push(f.cfg);
  return { ok: true, refund: price };
}

export function queueReturnFurniture(state, uid) {
  const f = state.furniture[uid];
  if (!f) return null;
  // 退货 (Config_FurnitureFunc 1607, FuncType 4)
  return enqueue(state, { kind: 'returnFurniture', label: pickLang({ en: `Return ${furnLabel(f)}`, zh: `退回${furnLabel(f)}` }), target: { furn: uid }, furn: uid, funcKey: 1607, dur: 5 * 60 });
}

registerKind('returnFurniture', {
  canStart: (state, a) => reasonOrTrue(canReturnHome(state, state.furniture[a.furn]) ? null : 'notReturnable'),
  complete(state, a) {
    const r = returnHomeFurniture(state, a.furn);
    if (r.ok) emit('toast', { text: pickLang({ en: `Returned for a $${r.refund} refund.`, zh: `已退货，退款$${r.refund}。` }), kind: 'good' });
  },
});

export function pawnPrice(f) {
  const d = furn(f.cfg);
  return d?.pawn > 0 ? d.pawn : Math.max(5, Math.round((d?.price || 0) * 0.5));
}

export function pawnableFurniture(state) {
  return homeFurniture(state).filter((f) => {
    if (typeof f.cfg !== 'number' || f.fixed || f.broken) return false;
    const type = slotDef(state, f.slot)?.type;
    if (type === SLOT.DOOR || type === SLOT.WINDOW || type === SLOT.DEFENSE) return false;
    const d = furn(f.cfg);
    return !!d && (d.price > 0 || d.pawn > 0);
  });
}

// The used-furniture buyer at the Renovation Company pays cash; movers take the piece from home and
// leave anything stored in it at the doorstep.
export function pawnFurniture(state, uid) {
  if (state.phase !== 'pre') return fail('closed');
  if (currentShop(state) !== 'renovation') return fail('notHere');
  const f = state.furniture[uid];
  if (!f || !pawnableFurniture(state).includes(f)) return fail('notPawnable');
  const price = pawnPrice(f);
  spillStorage(state, f, doorstepInv(state).id);
  removeFurniture(state, uid);
  income(state, price);
  state.pre.pawned.push(f.cfg);
  return { ok: true, price };
}

registerKind('pawnFurniture', {
  complete() {
    emit('openPanel', { panel: 'pawn' });
  },
});

// ------------------------------------------------------------------------------ money at home
export function takeWallet(state) {
  if (state.phase !== 'pre' || state.pre.walletTaken) return fail('done');
  const amount = CHARACTERS[state.meta.character]?.wallet || 0;
  state.pre.walletTaken = true;
  income(state, amount);
  emit('toast', { text: pickLang({ en: `Picked up your wallet: +$${amount}.`, zh: `拿到钱包：+$${amount}。` }), kind: 'good' });
  return { ok: true, amount };
}

export function takeLoan(state) {
  if (state.phase !== 'pre' || state.pre.loanTaken) return fail('done');
  const amount = CHARACTERS[state.meta.character]?.loan || 0;
  state.pre.loanTaken = true;
  income(state, amount);
  emit('toast', { text: pickLang({ en: `The loan app approves you instantly: +$${amount}. Nobody will be around to collect it.`, zh: `贷款App秒批：+$${amount}。反正以后也没人来催债了。` }), kind: 'good' });
  return { ok: true, amount };
}

const WALLET_SPOTS = [21005, 10003, 10004];

function walletSpot(state) {
  const usable = homeFurniture(state).filter((f) => state.home.unlocked[f.floor]);
  return usable.find((f) => WALLET_SPOTS.includes(f.cfg)) || usable.find((f) => slotDef(state, f.slot)?.type === SLOT.BED) || frontDoor(state);
}

export function queueWallet(state) {
  const spot = state.player.scene === 'home' ? walletSpot(state) : null;
  return enqueue(state, { kind: 'preMoney', source: 'wallet', label: pickLang({ en: 'Pick up wallet', zh: '拿钱包' }), target: spot ? { furn: spot.uid } : null, noWalk: !spot, dur: 60 });
}

export function queueLoan(state) {
  return enqueue(state, { kind: 'preMoney', source: 'loan', label: pickLang({ en: 'Phone loan', zh: '手机贷款' }), noWalk: true, dur: 5 * 60 });
}

registerKind('preMoney', {
  canStart(state, a) {
    if (state.phase !== 'pre') return preReason('closed');
    if (a.source === 'wallet' && state.player.scene !== 'home') return preReason('notHome');
    return reasonOrTrue((a.source === 'wallet' ? state.pre.walletTaken : state.pre.loanTaken) ? 'done' : null);
  },
  complete(state, a) {
    if (a.source === 'wallet') takeWallet(state);
    else takeLoan(state);
  },
});

// ------------------------------------------------------------------------------ NPCs
// Talking: the neighbor hands back $100 once; the young customer remembers you on a later visit.
export function talkTo(state, npcId) {
  const npc = SHOP_NPCS[npcId];
  if (!npc) return null;
  const pre = state.pre;
  const rec = (pre.npcTalks[npcId] ||= { count: 0, visit: 0 });
  const visit = pre.visits[npc.shop] || 0;
  const remembered = rec.count > 0 && rec.visit < visit;
  const lines = rec.count === 0 ? npc.first : remembered ? npc.remember : npc.again;
  rec.count += 1;
  rec.visit = visit;
  if (!pre.metNpcs.includes(npcId)) pre.metNpcs.push(npcId);
  let gift = 0;
  if (npc.gift && !pre.neighborCash) {
    pre.neighborCash = true;
    gift = npc.gift;
    income(state, gift);
  }
  return { npc: npcId, name: npcName(state, npcId), lines, gift, remembered, action: npc.action || null };
}

// ------------------------------------------------------------------------------ loot, riots, rush
export function groundInv(state, shopId, create = false) {
  const id = state.pre.ground[shopId];
  if (id && state.inventories[id]) return state.inventories[id];
  if (!create) return null;
  const inv = createInventory(state, { kind: 'floor', w: 8, h: 6, maxKg: null, label: 'shopFloor' });
  state.pre.ground[shopId] = inv.id;
  return inv;
}

function dropOnShopFloor(state, shopId, inst) {
  const inv = groundInv(state, shopId, true);
  const [w, h] = item(inst.id).size;
  inv.w = Math.max(inv.w, Math.min(w, h));
  for (let guard = 0; guard < 50 && !insert(inv, inst, { allowOverweight: true }); guard++) inv.h += 2;
}

// Free goods go into the backpack; whatever does not fit drops on the shop floor (patch 09-17).
function giveHere(state, shopId, list) {
  const bp = state.inventories[state.player.backpack];
  const got = [];
  const dropped = [];
  for (const [id, n] of list) {
    for (let i = 0; i < n; i++) {
      const inst = makeInstance(state, id);
      if (insert(bp, inst)) got.push(id);
      else {
        dropOnShopFloor(state, shopId, inst);
        dropped.push(id);
      }
      emit('gotItem', { id });
    }
  }
  if (dropped.length) {
    emit('toast', { text: pickLang({ en: `Your backpack is full: ${dropped.length} item(s) dropped on the floor.`, zh: `背包满了：${dropped.length}件物品掉在了地上。` }), kind: 'bad' });
  }
  return { got, dropped };
}

export function searchLoot(state, shopId, fixId) {
  const f = SHOPS[shopId]?.fixtures.find((x) => x.id === fixId);
  const key = lootKey(shopId, fixId);
  if (!f?.loot || state.pre.lootTaken[key]) return null;
  state.pre.lootTaken[key] = true;
  const mult = getMods(state).lootMult || 1;
  return giveHere(
    state,
    shopId,
    f.loot.map(([id, n]) => [id, Math.max(1, Math.round(n * mult))])
  );
}

function spawnRiotLoot(state, shopId) {
  const cfg = RIOT_LOOT[shopId];
  if (!cfg || state.pre.riotLoot[shopId]) return;
  const pool = shuffle(state, cfg.pool);
  state.pre.riotLoot[shopId] = cfg.spots.map(([x, y], i) => ({ id: `riot${i}`, x, y, items: [pool[i % pool.length]], taken: false }));
}

export function riotSpots(state, shopId) {
  return (state.pre.riotLoot[shopId] || []).filter((s) => !s.taken);
}

export function grabRiotLoot(state, shopId, spotId) {
  const spot = (state.pre.riotLoot[shopId] || []).find((s) => s.id === spotId);
  if (!spot || spot.taken) return null;
  spot.taken = true;
  state.progress.counters['pre.riotGrabs'] = (state.progress.counters['pre.riotGrabs'] || 0) + 1;
  return giveHere(state, shopId, spot.items);
}

export function rushBlocked(state) {
  if (state.phase !== 'pre') return 'closed';
  if (currentShop(state) !== RUSH.shop) return 'notHere';
  if (state.pre.rushUsed[RUSH.shop]) return 'rushUsed';
  if (secondsUntilOutbreak(state) < RUSH.minutes * 60) return 'rushLate';
  if (state.player.money < RUSH.price) return 'money';
  return null;
}

// The rush pays at the end (costs are only charged on completion) and hands over a random pile.
export function doRush(state) {
  if (state.pre.rushUsed[RUSH.shop] || state.player.money < RUSH.price) return null;
  pay(state, RUSH.price);
  state.pre.rushUsed[RUSH.shop] = true;
  const list = Array.from({ length: RUSH.count }, () => [pick(state, RUSH.pool), 1]);
  for (const [id] of list) recordPurchase(state, id, 1);
  return giveHere(state, RUSH.shop, list);
}

export function sellBlood(state) {
  if (state.phase !== 'pre') return fail('closed');
  if (currentShop(state) !== 'blackmarket') return fail('notHere');
  if (state.pre.soldBlood) return fail('bloodSold');
  state.pre.soldBlood = true;
  income(state, BLOOD_PRICE);
  addStat(state, 'sta', -15, 'blood');
  logEvent(state, pickLang({ en: `Sold blood on the black market (+$${BLOOD_PRICE}).`, zh: `在黑市卖了血（+$${BLOOD_PRICE}）。` }), 'bad');
  return { ok: true, amount: BLOOD_PRICE };
}

// ------------------------------------------------------------------------------ shop interactions
const FIXTURE_OPS = { shelf: 'open', car: 'open', cart: 'open', returns: 'open', checkout: 'open', blood: 'open', loot: 'search', riot: 'grab', trial: 'trial' };
const FIXTURE_PANELS = { shelf: 'shop', car: 'carShop', cart: 'trunk', returns: 'returns', checkout: 'rush', blood: 'blackMarket' };
// search: a free loot spot in a shop takes 2 game minutes (2 real seconds at 1x), like picking up a loose find at a
// site. The config gives no duration (the FuncAction table is not in src/data/gen); the source made furniture access
// in the preparation phase near-instant ("Instant Furniture Access (Pre-Disaster Phase)", https://store.steampowered.com/news/app/4164790),
// and the whole preparation is ten game hours. It was 10 minutes, which read as a stall (owner playtest, 2026-09-26).
const OP_MINUTES = { open: 0, search: 2, grab: 5, talk: 1, ground: 0, rush: RUSH.minutes, blood: 30 };

function shopAction(state, shopId, spot, spec) {
  const tile = spot ? accessTile(state, shopId, spot) : null;
  if (spot && !tile) {
    emit('toast', { text: preReason('unreachable'), kind: 'bad' });
    return null;
  }
  return enqueue(
    state,
    { kind: 'shop', shop: shopId, target: tile ? { x: tile[0], y: tile[1], floor: SHOP_FLOOR } : null, noWalk: !tile, dur: (spec.min ?? OP_MINUTES[spec.op] ?? 0) * 60, ...spec },
    { replace: true }
  );
}

// Walk to a fixture in the current shop and use it (open a shelf, search, grab, try out...).
export function interactFixture(state, fixId) {
  const shopId = currentShop(state);
  const f = shopId && shopFixtures(state, shopId).find((x) => x.id === fixId);
  if (!f) return null;
  if (f.kind === 'decor') {
    emit('toast', { text: pickLang(f.say || { en: 'Nothing to do here.', zh: '这里没什么可做的。' }) });
    return null;
  }
  const op = FIXTURE_OPS[f.kind];
  // the fixture's config function (a showroom try-out names its own), carried as the action's funcKey
  const funcKey = f.trial || fixtureFunc(f.cfg, op === 'search' ? 'rummage' : op, FIXTURE_PANELS[f.kind] || null);
  return shopAction(state, shopId, f, { op, fixture: f.id, funcKey, ui: FIXTURE_PANELS[f.kind] || null, label: fixtureLabel(f), min: f.kind === 'trial' ? f.min : undefined, gain: f.kind === 'trial' ? f.gain : undefined, cost: f.kind === 'trial' ? f.cost : undefined, car: f.car });
}

export function talkToNpc(state, npcId) {
  const shopId = currentShop(state);
  const n = shopId && SHOPS[shopId].npcs.find((x) => x.id === npcId);
  if (!n) return null;
  return shopAction(state, shopId, { x: n.x, y: n.y, w: 1, h: 1 }, { op: 'talk', npc: npcId, label: pickLang({ en: `Talk to ${npcName(state, npcId)}`, zh: `和${npcName(state, npcId)}说话` }) });
}

export function pickUpGround(state) {
  const shopId = currentShop(state);
  if (!shopId) return null;
  const [x, y] = SHOPS[shopId].ground;
  return shopAction(state, shopId, { x, y, w: 1, h: 1, pass: true }, { op: 'ground', label: pickLang({ en: 'Pick up from the floor', zh: '捡起地上的东西' }) });
}

export function startRush(state) {
  const shopId = currentShop(state);
  const why = rushBlocked(state);
  if (why) {
    emit('toast', { text: preReason(why), kind: 'bad' });
    return null;
  }
  const checkout = SHOPS[shopId].fixtures.find((f) => f.kind === 'checkout');
  return shopAction(state, shopId, checkout, { op: 'rush', noSlow: true, cost: { sta: 10 }, label: pickLang({ en: 'Doomsday Rush', zh: '末日抢购' }) });
}

export function startSellBlood(state) {
  const shopId = currentShop(state);
  if (shopId !== 'blackmarket') return null;
  const station = SHOPS[shopId].fixtures.find((f) => f.kind === 'blood');
  return shopAction(state, shopId, station, { op: 'blood', label: pickLang({ en: 'Sell blood', zh: '卖血' }) });
}

registerKind('shop', {
  canStart(state, a) {
    if (state.phase !== 'pre') return preReason('closed');
    if (currentShop(state) !== a.shop) return preReason('notHere');
    const pre = state.pre;
    switch (a.op) {
      case 'rush':
        return reasonOrTrue(rushBlocked(state));
      case 'blood':
        return reasonOrTrue(pre.soldBlood ? 'bloodSold' : null);
      case 'search':
        return reasonOrTrue(pre.lootTaken[lootKey(a.shop, a.fixture)] ? 'searched' : null);
      case 'grab':
        return reasonOrTrue(riotSpots(state, a.shop).some((s) => s.id === a.fixture) ? null : 'searched');
      case 'trial':
        return reasonOrTrue(pre.trials[lootKey(a.shop, a.fixture)] ? 'tried' : null);
      case 'open':
        if (a.ui === 'trunk' && !trunkInv(state)) return preReason('needCar');
        if (a.ui === 'returns' && pre.riot) return preReason('riot');
        return true;
      default:
        return true;
    }
  },
  complete(state, a) {
    switch (a.op) {
      case 'open':
        emit('openPanel', { panel: a.ui, shop: a.shop, shelf: a.fixture, car: a.car });
        break;
      case 'search':
        searchLoot(state, a.shop, a.fixture);
        break;
      case 'grab':
        grabRiotLoot(state, a.shop, a.fixture);
        break;
      case 'trial': {
        state.pre.trials[lootKey(a.shop, a.fixture)] = true;
        // what the try-out turns up (the showroom sofa's cushions) is the piece's own Search (1721): a second action
        const fx = SHOPS[a.shop]?.fixtures.find((x) => x.id === a.fixture);
        const search = fx?.loot && !state.pre.lootTaken[lootKey(a.shop, a.fixture)] ? fixtureFunc(fx.cfg, 'rummage') : null;
        if (search) enqueue(state, { kind: 'shop', shop: a.shop, op: 'search', fixture: a.fixture, funcKey: search, label: a.label, noWalk: true, dur: 0 }, { front: true });
        else searchLoot(state, a.shop, a.fixture);
        break;
      }
      case 'talk':
        emit('openPanel', { panel: 'npcTalk', ...talkTo(state, a.npc) });
        break;
      case 'ground':
        emit('openPanel', { panel: 'shopGround', shop: a.shop });
        break;
      case 'rush':
        doRush(state);
        break;
      case 'blood':
        sellBlood(state);
        break;
    }
  },
});

// ------------------------------------------------------------------------------ stockpile
// Home inventories: backpack, installed storage, the doorstep area and cardboard boxes on home floors.
export function homeInventories(state) {
  const ids = new Set(homeSources(state));
  if (state.home.doorstepInv && state.inventories[state.home.doorstepInv]) ids.add(state.home.doorstepInv);
  const floors = homeFloors(state.home.id);
  for (const b of state.floorBoxes || []) if (floors[b.floor] && state.inventories[b.inv]) ids.add(b.inv);
  return [...ids];
}

function stockInventories(state) {
  const ids = homeInventories(state);
  if (trunkInv(state)) ids.push(state.pre.trunk);
  return ids;
}

export function stockpileKg(state) {
  return stockInventories(state).reduce((kg, id) => kg + weightKg(state.inventories[id]), 0);
}

function satietyOf(inst, cfg) {
  const servings = cfg.uses > 1 ? (inst.uses ?? cfg.uses) : 1;
  return Math.max(0, cfg.sat) * servings * (inst.qty || 1) * (inst.left ?? 1);
}

// Stockpile Checklist: 7 categories × 18 dimensions rated low / adequate / plentiful.
export function stockpileChecklist(state) {
  const insts = stockInventories(state).flatMap((id) => state.inventories[id].items);
  const furnIds = homeFurniture(state)
    .filter((f) => typeof f.cfg === 'number')
    .map((f) => f.cfg);
  for (const inst of insts) if (packageToFurniture[inst.id]) furnIds.push(packageToFurniture[inst.id]);
  return CHECKLIST.map((cat) => ({
    id: cat.id,
    name: cat.name,
    dims: cat.dims.map((d) => {
      let value = 0;
      if (d.match) {
        for (const inst of insts) {
          const c = item(inst.id);
          if (c && d.match(c)) value += d.measure === 'sat' ? satietyOf(inst, c) : inst.qty || 1;
        }
      }
      if (d.matchFurn) for (const fid of furnIds) if (furn(fid) && d.matchFurn(furn(fid))) value += 1;
      const [adequate, plenty] = d.need;
      return { id: d.id, name: d.name, measure: d.measure, value: Math.round(value), need: d.need, status: value >= plenty ? 'plentiful' : value >= adequate ? 'adequate' : 'low' };
    }),
  }));
}

// ------------------------------------------------------------------------------ outbreak
export function unloadTrunk(state) {
  const trunk = trunkInv(state);
  if (!trunk) return 0;
  const n = trunk.items.length;
  if (n) {
    const e = entranceTile(state);
    for (const inst of [...trunk.items]) {
      removeUid(trunk, inst.uid);
      const box = dropToFloor(state, inst, e.floor, e.x, e.y);
      state.inventories[box.inv].label = 'shoppingBag';
    }
    const text = pickLang({ en: `The supplies in your trunk were unloaded into shopping bags by the front door (${n} items).`, zh: `后备箱里的物资已卸到门口的购物袋里（${n}件）。` });
    logEvent(state, text, 'good');
    emit('toast', { text, kind: 'good' });
  }
  destroyInventory(state, trunk.id);
  state.pre.trunk = null;
  return n;
}

export function finalizePreStats(state) {
  const pre = state.pre;
  const c = state.progress.counters;
  c['pre.kg'] = Math.round(stockpileKg(state) * 100) / 100;
  c['pre.points'] = pre.visited.length;
  c['pre.foodTypes'] = pre.foodTypes.length;
  c['pre.matTypes'] = pre.matTypes.length;
  c['pre.moneyLeft'] = Math.round(state.player.money);
  c['pre.spent'] = Math.round(pre.spent);
  state.progress.taboo.overspend = pre.spent > pre.budget / 2;
}

// "Finish Preparation": skip the rest of the countdown and let the disaster begin.
export function finishPreparation(state) {
  if (state.phase !== 'pre') return false;
  cancelAll(state);
  state.pre.finishing = true;
  const left = secondsUntilOutbreak(state);
  if (left > 0) tick(state, left);
  if (state.phase === 'pre') outbreak(state);
  state.pre.finishing = false;
  return true;
}

function tickNews(state) {
  const pre = state.pre;
  const left = secondsUntilOutbreak(state);
  for (const n of NEWS) {
    if (left > n.hours * HOUR || pre.news.some((e) => e.id === n.id)) continue;
    pre.news.push({ id: n.id, t: state.clock.t });
    if (!pre.finishing) emit('toast', { text: `📰 ${pickLang(n.text)}`, kind: n.id === 'riot' || n.id === 'sirens' ? 'bad' : 'info' });
  }
  if (!pre.riot && left <= RIOT_HOURS * HOUR) {
    pre.riot = true;
    const shop = currentShop(state);
    if (shop) spawnRiotLoot(state, shop);
  }
}

export function latestNews(state) {
  const last = state.pre.news[state.pre.news.length - 1];
  return last ? NEWS.find((n) => n.id === last.id) : null;
}

registerSystem({
  id: 'predisaster',
  order: 15,
  init(state) {
    ensurePre(state);
    installGoOut();
  },
  ensure(state) {
    ensurePre(state);
    installGoOut();
  },
  tick(state) {
    if (state.phase !== 'pre') return;
    const pre = state.pre;
    if (!pre.prologueShown) {
      pre.prologueShown = true;
      if (!state.meta.skipPrologue) emit('openPanel', { panel: 'prologue' });
    }
    tickNews(state);
  },
  beforeOutbreak(state) {
    const pre = state.pre;
    pre.travel = null;
    if (state.player.scene !== 'home') {
      arriveAt(state, 'home');
      if (!pre.finishing) {
        pre.hastyEscape = true;
        addStat(state, 'sta', -HASTY_COST.sta, 'hastyEscape');
        addStat(state, 'mor', -HASTY_COST.mor, 'hastyEscape');
        emit('toast', { text: pickLang({ en: 'Hasty escape! You fight your way home through the chaos as the city falls.', zh: '仓皇逃离！城市沦陷之际，你拼命挤过混乱的人群逃回了家。' }), kind: 'bad' });
      }
    }
    unloadTrunk(state);
    for (const invId of Object.values(pre.ground)) destroyInventory(state, invId);
    pre.ground = {};
    finalizePreStats(state);
    pre.finishing = false;
  },
  onOutbreak(state) {
    if (state.pre.soldBlood) addEffect(state, 'anemia', ANEMIA_HOURS);
  },
});

// ------------------------------------------------------------------------------ HUD hooks
registerObjectives((state) => {
  if (state.phase !== 'pre') return null;
  const pre = state.pre;
  const left = secondsUntilOutbreak(state);
  const ch = CHARACTERS[state.meta.character];
  const out = [
    {
      id: 'pre.countdown',
      text: pickLang({ en: `Outbreak in ${formatDuration(left)} — be home by 18:00`, zh: `距离灾变还有${formatDuration(left)}——18:00前回家` }),
      urgent: left < HOUR,
      tip: pickLang({ en: 'When the countdown ends you are dragged home, supplies in the trunk are unloaded at the door.', zh: '倒计时结束时你会被迫回家，后备箱里的物资会卸在门口。' }),
    },
  ];
  const news = latestNews(state);
  if (news) out.push({ id: 'pre.news', text: `📰 ${pickLang(news.text)}`, urgent: pre.riot });
  if (pre.travel) out.push({ id: 'pre.travel', text: pickLang({ en: `On the way to ${locationName(pre.travel.dest)}`, zh: `正在前往${locationName(pre.travel.dest)}` }), prog: pickLang({ en: `arrives ~${formatClock({ ...state.clock, t: pre.travel.eta })}`, zh: `约${formatClock({ ...state.clock, t: pre.travel.eta })}到达` }) });
  out.push(
    { id: 'pre.wallet', text: pickLang({ en: `Pick up your wallet (+$${ch.wallet})`, zh: `拿上钱包（+$${ch.wallet}）` }), done: pre.walletTaken, onClick: pre.walletTaken ? null : () => queueWallet(state) },
    { id: 'pre.loan', text: pickLang({ en: `Take the phone loan (+$${ch.loan})`, zh: `用手机借一笔贷款（+$${ch.loan}）` }), done: pre.loanTaken, onClick: pre.loanTaken ? null : () => queueLoan(state) },
    { id: 'pre.neighbor', text: pickLang({ en: 'Talk to your neighbor at the Discount Supermarket (+$100)', zh: '去特价超市和邻居聊聊（+$100）' }), done: pre.neighborCash },
    {
      id: 'pre.car',
      text: pre.car ? pickLang({ en: `Car: ${pickLang(CARS[pre.car.id].name)} — trunk ready`, zh: `座驾：${pickLang(CARS[pre.car.id].name)}——后备箱可用` }) : pickLang({ en: 'Buy a car? $500 at the Used Car Lot: 35-minute drives and a trunk', zh: '要买车吗？二手车场$500：开车35分钟，还有后备箱' }),
      done: !!pre.car,
    },
    { id: 'pre.points', text: pickLang({ en: 'Visit supply points', zh: '走访采购点' }), prog: `${pre.visited.length} / ${POINTS_GOAL}`, done: pre.visited.length >= POINTS_GOAL }
  );
  const kg = stockpileKg(state);
  const goal = KG_GOALS.find((g) => kg < g);
  out.push({ id: 'pre.kg', text: pickLang({ en: 'Stockpile supplies', zh: '囤积物资' }), prog: goal ? `${kg.toFixed(1)} / ${goal} kg` : `${kg.toFixed(1)} kg`, done: !goal });
  const waiting = doorstepCount(state);
  if (waiting) out.push({ id: 'pre.doorstep', text: pickLang({ en: `${waiting} package(s) at your doorstep`, zh: `门口有${waiting}个包裹` }), onClick: () => openDoorstep(state) });
  return out;
});

registerSuggestions((state) => {
  if (state.phase !== 'pre') return null;
  const pre = state.pre;
  const home = state.player.scene === 'home';
  const late = secondsUntilOutbreak(state) < HOUR;
  const finish = { id: 'pre.finish', label: pickLang({ en: 'Finish Preparation', zh: '完成准备' }), run: () => ({ panel: 'finishPrep' }) };
  const out = [];
  if (home && late) out.push(finish);
  if (!home) {
    const min = Math.round(travelSeconds(state, locationOf(state), 'home') / 60);
    out.push({ id: 'pre.goHome', label: pickLang({ en: `Go home (${min} min)`, zh: `回家（${min}分钟）` }), run: () => startTravel(state, 'home') });
  }
  if (home && !pre.walletTaken) out.push({ id: 'pre.wallet', label: pickLang({ en: 'Pick up your wallet', zh: '拿上钱包' }), run: () => queueWallet(state) });
  if (!pre.loanTaken) out.push({ id: 'pre.loan', label: pickLang({ en: 'Take the phone loan', zh: '手机贷款' }), run: () => queueLoan(state) });
  if (home) {
    const pot = returnableHomeFurniture(state).find((f) => f.data?.decorPlant);
    if (pot) out.push({ id: 'pre.returnPot', label: pickLang({ en: `Return the ${furnLabel(pot)} (+$${homeReturnPrice(state, pot)})`, zh: `退掉${furnLabel(pot)}（+$${homeReturnPrice(state, pot)}）` }), run: () => queueReturnFurniture(state, pot.uid) });
    if (doorstepCount(state)) out.push({ id: 'pre.doorstep', label: pickLang({ en: `Doorstep packages (${doorstepCount(state)})`, zh: `门口的包裹（${doorstepCount(state)}）` }), run: () => openDoorstep(state) });
    if (!late) out.push(finish);
  }
  return out;
});

// Home furniture that carries the shop function (ids 1 and 4) sells nothing outside a shop.
registerFuncAvailability(6, (state) => (String(state.player.scene || '').startsWith('shop:') ? true : 'hide'));
