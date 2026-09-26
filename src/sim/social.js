// People after the disaster (FEATURES O01, O03–O08): the neighbor across the rooftops and the
// rope-and-basket line, drones (trading, scavenging, yard loot, coordinates, supply drops, luring hordes),
// the eight trading posts, the survivor network, the Warehouse Manager rescue line (College Student run),
// the trapped veteran (Warehouse Manager run), Shield of the Street and the doorstep cat.
// Everything lives in state.social; the phone (sim/phone.js) carries the conversations.
import { registerSystem } from './tick.js';
import { registerKind, enqueue } from './actions.js';
import { registerObjectives } from './objectives.js';
import { homeSources, giveItems, registerFuncAvailability, registerPanelAvailability } from './furnActions.js';
import { homeFurniture, homeDef, homeFloors, dropToFloor, furnitureChanged } from './home.js';
import { createInventory, makeInstance, insert, findUid, removeUid, newUid } from './inventory.js';
import { addStat } from './stats.js';
import { getMods } from './modifiers.js';
import { isExpired } from './spoilage.js';
import { dayNumber, dayStartT, DAY, HOUR, formatDuration } from './time.js';
import { item, itemName, recipes, CAT } from '../data/db.js';
import { opFunc } from '../content/funcSpecs.js';
import { CHARACTERS } from '../content/characters.js';
import {
  HEART_THRESHOLDS, BASKET_MAX_KG, ROPE_MAX, NEIGHBOR_DAILY_SAT, NEIGHBOR_START_FOOD, NEIGHBOR_MAX_FOOD, NEIGHBOR_STARVE_DAYS,
  RESCUE_TASKS, NEIGHBORS, NEIGHBOR_REQUESTS, GIFT_POOLS, MOLOTOV_FROM,
  TRADING_POSTS, POST_BY_ID, POST_RESTOCK_DAYS, POST_DAMAGE_DAYS, POST_LINES,
  SURVIVORS, UNKNOWN_SURVIVORS, SURVIVOR_LINES, SURVIVOR_DAILY_SAT, SURVIVOR_MAX_FOOD, MIN_AID_SAT, GIFT_AID_SAT, NOT_A_CONTACT,
  WM_DELIVERIES, WAREHOUSE_MANAGER, VETERAN, COORD_TIPS,
  DRONE_FURN, DRONE_PACKAGE, SCRAPPED_DRONE, DRONE_CRAFT, DRONE_BASE_KG, DRONE_HOURS, SCAVENGE_POOL, DRONE_PACKAGE_NOTE,
  CAT_EVENTS, CAT_COUNTDOWN_S, CAT_PREY_GIFTS,
} from '../content/people.js';
import { emit, on } from '../engine/bus.js';
import { rand, randInt, chance, pick, weighted, shuffle } from '../engine/rng.js';
import { pickLang } from '../engine/i18n.js';
import { phoneState, ensureThread, getThread, sendSms, scheduleSms, usePortion } from './phone.js';
import { addPoints } from './settlement.js';

// The rooftop basket of each end of the line: the apartment's (9298, P_Basket_002_Rope) and the College Student's
// duplex's (80011, P_Basket_001_Rope, of the duplex scene's Config_Furniture block 80014–80205, with its lamp switch).
const BASKET_FURN = 9298;
const HOME_BASKET = { duplex: 80011 };
const VETERAN_FURN = 42013;
const TOOL_CABINETS = [406, 70006];
const AFFINITY_CAP = 600;
const ROPE_WORN = 5; // "change the rope" shows up once this few trips are left
const SHIELD_WIN = 3;
const SHIELD_ROUNDS = 5;
const DEPARTED_POINTS = 5; // Planning Points left by someone who dies or leaves ("Left by the Departed", patch 09-12)
const DEPARTED_PER_DELIVERY = 2; // plus this much for every delivery the survivor made to them

// ------------------------------------------------------------------------------ state
export function social(state) {
  const s = (state.social ||= {});
  if (s.v === 1) return s;
  s.neighbor ||= newNeighbor(state);
  s.drones ||= [];
  s.posts ||= {};
  for (const p of TRADING_POSTS) {
    s.posts[p.id] ||= { unlocked: false, damaged: false, damagedUntil: 0, stock: p.stock.map(([id, max, price]) => ({ id, qty: max, max, price: price ?? null })), deals: 0, partner: false, restockDay: 0 };
  }
  s.survivors ||= [];
  s.wm ??= null;
  s.veteran ??= null;
  s.shield ||= { rounds: 0, defended: 0, active: null, nextAt: 0, done: false };
  s.coords ||= [];
  s.cats ||= { stage: 0, trust: 0, visits: 0, lastSeen: 0, nextAt: 0, pending: null };
  s.timers ||= [];
  s.flags ||= {};
  s.started ??= false;
  s.v = 1;
  phoneState(state);
  return s;
}

function newNeighbor(state) {
  const id = state.meta?.mode === 'pureEndless' ? null : CHARACTERS[state.meta?.character]?.neighbor || null;
  const carried = Math.max(0, Math.min(AFFINITY_CAP, Math.floor(state.loop?.neighborAffinity || 0)));
  return {
    id,
    alive: !!id,
    hearts: heartsFor(carried),
    affinity: carried,
    tasks: [],
    basketRepaired: false,
    basketUid: null,
    basketInv: null,
    ropeHp: ROPE_MAX,
    gifts: 0,
    deadReason: null,
    foodDays: NEIGHBOR_START_FOOD,
    starving: 0,
    lowWarned: false,
    rescueStage: 0, // rescue tasks completed (read by sim/story.js)
    requestsDone: 0,
    nextRequestDay: 0,
    lastReq: null,
    pendingGift: null,
    giftUids: [],
    keepsakes: [],
    keepsakeQueue: [],
    deliveries: 0,
    unlockSent: false,
  };
}

// ------------------------------------------------------------------------------ helpers
function fail(reason) {
  return { ok: false, reason: typeof reason === 'string' ? reason : pickLang(reason) };
}

function toast(text, kind = 'info') {
  emit('toast', { text: typeof text === 'string' ? text : pickLang(text), kind });
}

function bump(state, key, n = 1) {
  const c = state.progress.counters;
  c[key] = (c[key] || 0) + n;
  return c[key];
}

export function setStoryTag(state, tag) {
  state.story ||= {};
  state.story.tags ||= {};
  if (state.story.tags[tag]) return;
  state.story.tags[tag] = true;
}

function hordeActive(state) {
  return (state.crises?.active || []).some((c) => c.type === 'horde');
}

function leavePoints(state, deliveries, note) {
  addPoints(state, DEPARTED_POINTS + DEPARTED_PER_DELIVERY * (deliveries || 0), 'departed', { note });
}

function schedule(state, at, id, data = null) {
  social(state).timers.push({ at, id, data });
}

function portionsOf(inst, cfg) {
  return cfg.uses > 1 ? Math.max(0, inst.uses ?? cfg.uses) : inst.left ?? 1;
}

// Satiety carried by an item, counted by its remaining portions (patch 09-17 donation fix).
export function foodSat(inst) {
  const cfg = item(inst.id);
  if (cfg?.cat !== CAT.FOOD) return 0;
  return Math.max(0, cfg.sat) * portionsOf(inst, cfg) * (inst.qty || 1);
}

export function tradeValue(inst) {
  const cfg = item(inst.id);
  if (!cfg) return 0;
  const frac = cfg.uses > 1 ? portionsOf(inst, cfg) / cfg.uses : inst.left ?? 1;
  return (cfg.trade || 0) * frac * (inst.qty || 1);
}

// picks: [{ inv, uid }] -> [{ inv, inst }] (null if any is gone or listed twice)
function resolvePicks(state, picks) {
  const out = [];
  const seen = new Set();
  for (const p of picks || []) {
    const inv = state.inventories[p.inv];
    const inst = inv && findUid(inv, p.uid);
    if (!inst || seen.has(inst.uid)) return null;
    seen.add(inst.uid);
    out.push({ inv, inst });
  }
  return out;
}

function foodPicks(state, picks) {
  const list = resolvePicks(state, picks);
  if (!list) return null;
  return list.filter(({ inst }) => item(inst.id)?.cat === CAT.FOOD);
}

// Inventories that count as "at home" for story items: storage, backpack, floor boxes, doorstep, trunk.
function homeInventories(state) {
  const ids = new Set(homeSources(state));
  for (const b of state.floorBoxes || []) ids.add(b.inv);
  if (state.home?.doorstepInv) ids.add(state.home.doorstepInv);
  if (state.pre?.trunk) ids.add(state.pre.trunk);
  return [...ids].filter((id) => state.inventories[id]);
}

export function hasItemAtHome(state, id) {
  return homeInventories(state).some((invId) => state.inventories[invId].items.some((it) => it.id === id));
}

function frontDoorTile(state) {
  const fl = homeDef(state.home.id).floors['1F'];
  const [x, y] = fl.door || [1, 1];
  return { floor: '1F', x, y: y - 1 };
}

function deliverToDoorstep(state, list) {
  const inv = state.home?.doorstepInv && state.inventories[state.home.doorstepInv];
  const door = frontDoorTile(state);
  for (const [id, n] of list) {
    for (let i = 0; i < n; i++) {
      const inst = makeInstance(state, id);
      if (!inv || !insert(inv, inst, { allowOverweight: true })) dropToFloor(state, inst, door.floor, door.x, door.y);
      emit('gotItem', { id });
    }
  }
}

// Story fixtures without a planning slot (basket line, trapped veteran) sit on a synthetic slot id.
function placeFixture(state, cfg, slotId, { floor, x, y }) {
  const uid = newUid(state);
  const f = { uid, cfg, slot: slotId, floor, x, y, w: 1, h: 1, hp: 1000, maxHp: 1000, reinforce: 0, on: true, inv: null, data: {}, rename: null, fixed: true, broken: false };
  state.furniture[uid] = f;
  state.home.slots[slotId] = uid;
  furnitureChanged(state);
  return f;
}

function removeFixture(state, uid) {
  const f = state.furniture[uid];
  if (!f) return;
  if (state.home.slots[f.slot] === uid) delete state.home.slots[f.slot];
  delete state.furniture[uid];
  furnitureChanged(state);
}

// Hide drone buttons that have nothing to act on, and keep "Use drone" off while it is out.
registerPanelAvailability('droneHelp', (state) => (pendingHelp(state).length ? true : 'hide'));
registerPanelAvailability('droneDeliver', (state) => (networkSurvivors(state).length ? true : 'hide'));
registerPanelAvailability('droneRescue', (state) => (state.meta.character === 'student' && wmState(state)?.active && !wmState(state)?.done ? true : 'hide'));
registerFuncAvailability(241, (state, f) => {
  const d = droneByUid(state, f.uid);
  return droneBusy(state, d) ? pickLang({ en: 'The drone is out', zh: '无人机外出中' }) : true;
});

// ------------------------------------------------------------------------------ neighbor (O01)
export function neighborState(state) {
  return social(state).neighbor;
}

export function neighborDef(state) {
  const n = social(state).neighbor;
  return n.id ? NEIGHBORS[n.id] : null;
}

export function heartsFor(affinity) {
  return HEART_THRESHOLDS.filter((th) => affinity >= th).length;
}

export function nextHeartAt(affinity) {
  return HEART_THRESHOLDS.find((th) => th > affinity) ?? null;
}

export function activeRescue(state) {
  return neighborState(state).tasks.find((t) => t.kind === 'rescue' && !t.done) || null;
}

export function activeRequest(state) {
  return neighborState(state).tasks.find((t) => t.kind === 'request' && !t.done && !t.failed) || null;
}

export function requestDef(task) {
  return NEIGHBOR_REQUESTS.find((r) => r.id === task?.req) || null;
}

export function requestMatches(task, cfg) {
  const r = requestDef(task);
  if (!r || !cfg) return false;
  if (r.items?.includes(cfg.id)) return true;
  return r.cat != null && cfg.cat === r.cat && (!r.subs || r.subs.includes(cfg.sub));
}

export function basketInventory(state) {
  const n = neighborState(state);
  return n.basketInv ? state.inventories[n.basketInv] : null;
}

function ensureBasket(state) {
  const n = neighborState(state);
  const line = homeDef(state.home.id).rooftopLine;
  if (!n.id || !line) return;
  if (!n.basketInv || !state.inventories[n.basketInv]) {
    n.basketInv = createInventory(state, { kind: 'basket', w: 10, h: 6, maxKg: BASKET_MAX_KG, label: 'basket' }).id;
  }
  if (n.basketUid && state.furniture[n.basketUid]) return;
  const f = placeFixture(state, HOME_BASKET[state.home.id] || BASKET_FURN, `${line.floor}:basket`, line);
  f.broken = !n.basketRepaired;
  n.basketUid = f.uid;
}

function setupNeighbor(state, t0) {
  const n = neighborState(state);
  if (!n.id) return;
  ensureThread(state, 'neighbor', { name: NEIGHBORS[n.id].name, kind: 'neighbor' });
  ensureBasket(state);
  schedule(state, t0 + 2 * HOUR, 'neighborIntro');
  schedule(state, Math.max(t0 + 6 * HOUR, dayStartT(state.clock, 2) + 10 * HOUR), 'neighborHelp');
}

function basketGive(state, list) {
  const n = neighborState(state);
  const inv = basketInventory(state);
  const f = state.furniture[n.basketUid];
  for (const [id, count] of list) {
    if (!item(id)) continue;
    for (let i = 0; i < count; i++) {
      const inst = makeInstance(state, id);
      if (inv && insert(inv, inst, { allowOverweight: true })) n.giftUids.push(inst.uid);
      else dropToFloor(state, inst, f?.floor || '2F', f?.x ?? 1, f?.y ?? 1);
    }
  }
}

// Gifts she put in the basket stay put when you send it; once taken out they are ordinary items.
export function basketGiftUids(state) {
  const n = neighborState(state);
  const inv = basketInventory(state);
  n.giftUids = (n.giftUids || []).filter((uid) => inv && findUid(inv, uid));
  return n.giftUids;
}

function syncHearts(state) {
  const n = neighborState(state);
  const def = neighborDef(state);
  if (!def) return;
  const h = heartsFor(n.affinity);
  while (n.hearts < h) {
    n.hearts++;
    const line = def.lines.hearts[n.hearts - 1];
    if (line) scheduleSms(state, 45 * 60, 'neighbor', { text: line, kind: 'heart' });
    const keepsake = (def.keepsakes[n.hearts] || []).find((id) => !n.keepsakes.includes(id));
    if (keepsake) {
      n.keepsakes.push(keepsake);
      if (n.basketRepaired) basketGive(state, [[keepsake, 1]]);
      else n.keepsakeQueue.push(keepsake);
    }
    if (n.hearts >= 5) setStoryTag(state, 'TAG_NEIGHBOR_ENDING_COZY');
  }
  if (h < n.hearts) n.hearts = h;
  if (state.loop) state.loop.neighborAffinity = Math.floor(n.affinity * 0.5);
}

export function addNeighborAffinity(state, amount) {
  const n = neighborState(state);
  if (!n.id || !n.alive || !amount) return;
  n.affinity = Math.max(0, Math.min(AFFINITY_CAP, n.affinity + amount));
  syncHearts(state);
}

function startRescue(state, index) {
  const n = neighborState(state);
  const def = RESCUE_TASKS[index];
  if (!def || n.tasks.some((t) => t.id === def.id)) return;
  n.tasks.push({ id: def.id, kind: 'rescue', need: def.need, progress: 0, done: false, requests: def.requests || 0, reqDone: 0 });
  const line = neighborDef(state)?.lines.rescueStart[index];
  if (line) scheduleSms(state, 2 * HOUR, 'neighbor', { text: line, kind: 'rescue' });
}

function routeChosen(state) {
  const def = neighborDef(state);
  const st = state.story || {};
  return !!def && (st.route === def.route || !!st.tags?.[def.routeTag]);
}

function maybeStartRescue3(state) {
  const n = neighborState(state);
  if (n.alive && n.tasks.some((t) => t.id === 'rescue2' && t.done) && routeChosen(state)) startRescue(state, 2);
}

// The story system shows the route promise from state.story.promise (rescue 300 + three requests).
function mirrorPromise(state, task) {
  const pr = state.story?.promise;
  if (!pr || task.id !== 'rescue3') return;
  pr.rescue = task.done ? task.need : Math.min(task.need - 1, Math.floor(task.progress));
  pr.requests = task.reqDone;
}

function checkRescue(state, task) {
  mirrorPromise(state, task);
  if (task.done || task.progress < task.need || task.reqDone < task.requests) return;
  task.done = true;
  mirrorPromise(state, task);
  const i = RESCUE_TASKS.findIndex((r) => r.id === task.id);
  const def = neighborDef(state);
  neighborState(state).rescueStage = i + 1;
  setStoryTag(state, def.rescueTags[i]);
  scheduleSms(state, HOUR, 'neighbor', { text: def.lines.rescueDone[i], kind: 'rescue' });
  if (def.rescueGifts?.[i + 1]) basketGive(state, def.rescueGifts[i + 1]);
  if (i === 0) startRescue(state, 1);
  if (i === 1) maybeStartRescue3(state);
}

function progressRescue(state, amount) {
  const task = activeRescue(state);
  if (!task) return;
  task.progress = Math.min(task.need, task.progress + Math.max(0, amount));
  checkRescue(state, task);
}

// The Girl / Companionship route commitment needs 5 hearts and the first two rescue tasks (guide G2).
export function neighborReadyForRoute(state) {
  const n = neighborState(state);
  const done = (id) => n.tasks.some((t) => t.id === id && t.done);
  return !!n.id && n.alive && n.hearts >= 5 && done('rescue1') && done('rescue2');
}

export function repairBasket(state) {
  const n = neighborState(state);
  if (!n.id || !n.alive || n.basketRepaired) return false;
  n.basketRepaired = true;
  n.ropeHp = ROPE_MAX;
  const f = state.furniture[n.basketUid];
  if (f) f.broken = false;
  state.progress.taboo.neighbor = true;
  sendSms(state, 'neighbor', { text: neighborDef(state).lines.repaired });
  if (n.keepsakeQueue.length) basketGive(state, n.keepsakeQueue.splice(0).map((id) => [id, 1]));
  startRescue(state, 0);
  n.nextRequestDay = dayNumber(state.clock) + 1;
  bump(state, 'neighbor.basket');
  return true;
}

function issueRequest(state) {
  const n = neighborState(state);
  const r = pick(state, NEIGHBOR_REQUESTS.filter((x) => x.id !== n.lastReq));
  const task = { id: `req${n.requestsDone}-${Math.floor(state.clock.t)}`, kind: 'request', req: r.id, need: 1, progress: 0, done: false, failed: false, expires: state.clock.t + 36 * HOUR };
  n.tasks.push(task);
  n.lastReq = r.id;
  const old = n.tasks.filter((t) => t.kind === 'request' && (t.done || t.failed));
  if (old.length > 6) n.tasks = n.tasks.filter((t) => !old.slice(0, old.length - 6).includes(t));
  sendSms(state, 'neighbor', { text: r.text, kind: 'request', ref: task.id });
}

function fulfilRequest(state, task) {
  const n = neighborState(state);
  task.done = true;
  task.progress = 1;
  n.requestsDone++;
  const rescue = activeRescue(state);
  if (rescue?.requests) {
    rescue.reqDone = Math.min(rescue.requests, rescue.reqDone + 1);
    checkRescue(state, rescue);
  }
  scheduleSms(state, 40 * 60, 'neighbor', { text: neighborDef(state).lines.requestDone });
}

let exactRecipes = null;
// A dish she can cook from ingredients you sent (patch 08-28: gifts made from your materials): the recipe with the
// most ingredients that all came across; ties (one ingredient, two dishes: roast corn or corn juice) are her pick.
// The girl next door hands out her own version of the dish (NEIGHBORS.student.ownDishOffset: the config's 299
// "Her …" dishes); the man across the alley the Good or the Normal dish by his hearts.
function cookedFrom(state, def, ids, good) {
  exactRecipes ||= Object.values(recipes).filter((r) => r.items?.length);
  const have = new Set(ids);
  let best = [];
  for (const r of exactRecipes) {
    if (!r.items.every((id) => have.has(id))) continue;
    if (!best.length || r.items.length > best[0].items.length) best = [r];
    else if (r.items.length === best[0].items.length) best.push(r);
  }
  if (!best.length) return null;
  const r = best.length > 1 ? pick(state, best) : best[0];
  const own = def?.ownDishOffset ? r.out[0] + def.ownDishOffset : 0;
  if (own && item(own)) return own;
  const out = r.out[good ? 1 : 2] || r.out[2];
  return item(out) ? out : null;
}

function deliverGift(state) {
  const n = neighborState(state);
  const def = neighborDef(state);
  const pg = n.pendingGift;
  n.pendingGift = null;
  if (!pg || !def) return;
  const out = [];
  let budget = Math.min(300, 20 + pg.value * 0.35);
  let line = def.lines.gift;
  if (!n.gifts && def.firstNote) out.push([def.firstNote, 1]);
  if (def.molotov) {
    const bottles = pg.sent.map((id) => MOLOTOV_FROM[id]).filter(Boolean);
    for (const m of bottles) out.push([m, 1]);
    if (bottles.length) line = def.lines.giftMolotov || line;
  }
  const dish = cookedFrom(state, def, pg.sent, n.hearts >= 3);
  if (dish) {
    out.push([dish, 1]);
    budget -= item(dish).trade || 0;
    line = def.lines.giftDish;
  } else if (pg.sent.some((id) => item(id)?.cat === CAT.FOOD) && (n.hearts >= 1 || chance(state, 0.4))) {
    out.push([41002, 1]);
    budget -= 47;
  }
  if ((n.hearts >= 1 || dayNumber(state.clock) >= 10) && budget > 10 && chance(state, 0.55)) {
    out.push([pick(state, GIFT_POOLS.seeds), 1]);
    budget -= 12;
  }
  if (budget > 15 && chance(state, 0.45)) {
    const pool = def.molotov ? [...GIFT_POOLS.sundries, ...GIFT_POOLS.companionTools] : GIFT_POOLS.sundries;
    out.push([pick(state, pool), 1]);
  }
  if (!out.length) out.push([pick(state, GIFT_POOLS.sundries), 1]);
  basketGive(state, out);
  n.gifts++;
  sendSms(state, 'neighbor', { text: line, kind: 'gift' });
  emit('neighborGift', { items: out });
}

function queueGift(state, value, sent) {
  const n = neighborState(state);
  n.pendingGift ||= { at: state.clock.t + 10 * HOUR, value: 0, sent: [] };
  n.pendingGift.value += value;
  n.pendingGift.sent.push(...sent);
  if (n.pendingGift.sent.length > 40) n.pendingGift.sent.splice(0, n.pendingGift.sent.length - 40);
}

// Send everything in the 10 kg basket across the rooftops (gifts she put in are left alone).
export function sendBasket(state) {
  const n = neighborState(state);
  const def = neighborDef(state);
  if (!def) return fail({ en: 'There is nobody across the rooftops.', zh: '对面没有人。' });
  if (!n.alive) return fail({ en: 'Nobody pulls the rope anymore.', zh: '已经没有人拉绳子了。' });
  if (!n.basketRepaired) return fail({ en: 'Repair the basket first.', zh: '先修好篮子。' });
  if (n.ropeHp <= 0) return fail({ en: 'The rope is frayed. Change it first.', zh: '绳子磨坏了，先换绳。' });
  const inv = basketInventory(state);
  const gifts = basketGiftUids(state);
  const items = (inv?.items || []).filter((it) => !gifts.includes(it.uid));
  if (!items.length) return fail({ en: 'The basket is empty.', zh: '篮子是空的。' });
  let sat = 0;
  let progress = 0;
  let affinity = 0;
  let value = 0;
  let disliked = false;
  const req = activeRequest(state);
  let reqHit = false;
  const sent = [];
  for (const inst of items) {
    const cfg = item(inst.id);
    removeUid(inv, inst.uid);
    if (!cfg) continue;
    sent.push(inst.id);
    const trade = tradeValue(inst);
    value += trade;
    if (req && requestMatches(req, cfg)) reqHit = true;
    if (cfg.cat === CAT.FOOD && def.dislikes.includes(cfg.sub)) {
      affinity -= 2;
      disliked = true;
      continue;
    }
    if (cfg.cat === CAT.FOOD) {
      const expired = isExpired(inst, cfg);
      const s = foodSat(inst) * (expired ? 0.3 : 1);
      sat += s;
      progress += s;
      affinity += s * 0.15 + Math.max(0, cfg.mor) * portionsOf(inst, cfg) * 0.3 - (expired ? 3 : 0);
    } else if (cfg.cat === CAT.MEDICINE) {
      progress += trade;
      affinity += Math.min(20, trade * 0.4);
    } else {
      progress += trade * 0.3;
      affinity += trade > 0 ? Math.min(20, trade * 0.5) : 2;
    }
  }
  if (reqHit) {
    affinity += 25;
    progress += 20;
    fulfilRequest(state, req);
  }
  if (sat > 0) {
    n.foodDays = Math.min(NEIGHBOR_MAX_FOOD, Math.max(n.foodDays, 0) + sat / NEIGHBOR_DAILY_SAT);
    n.starving = 0;
    n.lowWarned = false;
  }
  n.ropeHp -= 1;
  n.deliveries++;
  state.progress.taboo.neighbor = true;
  bump(state, 'neighbor.delivery');
  bump(state, 'survivor.aid');
  addNeighborAffinity(state, affinity);
  progressRescue(state, progress);
  queueGift(state, value + sat, sent);
  const line = disliked && def.lines.dislike ? def.lines.dislike : pick(state, def.lines.thanks);
  scheduleSms(state, 30 * 60, 'neighbor', { text: line, kind: 'thanks' });
  emit('basketSent', { sat, value, progress, affinity });
  return { ok: true, sat, value, progress, affinity };
}

// Reply options on her texts (any reply progresses the neighbor line: challenge taboo).
export function replyNeighbor(state, msgId, index) {
  const m = getThread(state, 'neighbor')?.messages.find((x) => x.id === msgId);
  if (!m?.options || m.answered != null) return false;
  const o = m.options[index];
  if (!o) return false;
  m.answered = index;
  sendSms(state, 'neighbor', { from: 'me', text: o.text });
  state.progress.taboo.neighbor = true;
  addNeighborAffinity(state, o.affinity || 2);
  const def = neighborDef(state);
  if (m.kind === 'intro' && def?.lines.introReply) scheduleSms(state, 20 * 60, 'neighbor', { text: def.lines.introReply });
  return true;
}

function neighborDies(state, reason) {
  const n = neighborState(state);
  const def = neighborDef(state);
  n.alive = false;
  n.deadReason = reason;
  n.pendingGift = null;
  for (const t of n.tasks) if (t.kind === 'request' && !t.done) t.failed = true;
  setStoryTag(state, def.deadTag);
  sendSms(state, 'neighbor', { from: 'system', text: def.lines.dead, silent: true });
  const f = state.furniture[n.basketUid];
  if (f) f.broken = true;
  leavePoints(state, n.deliveries, n.id);
  toast({ en: `${pickLang(def.name)} didn't make it.`, zh: `${pickLang(def.name)}没能撑下去。` }, 'bad');
}

function neighborDaily(state, day) {
  const n = neighborState(state);
  const def = neighborDef(state);
  if (!def || !n.alive) return;
  if (n.foodDays >= 1) {
    n.foodDays -= 1;
    n.starving = 0;
    if (n.foodDays < 2.5 && !n.lowWarned) {
      n.lowWarned = true;
      sendSms(state, 'neighbor', { text: def.lines.lowFood, kind: 'low' });
    }
  } else {
    n.foodDays = 0;
    n.starving += 1;
    if (n.starving >= NEIGHBOR_STARVE_DAYS) return neighborDies(state, 'starved');
    sendSms(state, 'neighbor', { text: def.lines.starving, kind: 'low' });
  }
  if (state.meta.character === 'wage' && day >= 30 && n.hearts >= 3 && !n.unlockSent) {
    n.unlockSent = true;
    emit('unlockCharacter', { id: 'student', reason: 'neighbor' });
    toast({ en: 'The girl next door made it this far. (New character: College Student)', zh: '隔壁的女孩撑到了现在。（解锁新角色：大学生）' }, 'good');
  }
  maybeStartRescue3(state);
}

function neighborHourly(state, h) {
  const n = neighborState(state);
  if (!n.id || !n.alive || !n.basketRepaired) return;
  const req = activeRequest(state);
  if (req && state.clock.t >= req.expires) {
    req.failed = true;
    addNeighborAffinity(state, -5);
    sendSms(state, 'neighbor', { text: neighborDef(state).lines.requestFailed });
  }
  const day = dayNumber(state.clock);
  if (!activeRequest(state) && h === 9 && day >= n.nextRequestDay) {
    issueRequest(state);
    n.nextRequestDay = day + (activeRescue(state)?.id === 'rescue3' ? 1 : 2);
  }
  if (n.pendingGift && state.clock.t >= n.pendingGift.at) deliverGift(state);
}

// ------------------------------------------------------------------------------ drones (O03)
export function droneCapacityKg(state) {
  return DRONE_BASE_KG * (1 + (getMods(state).droneCargo || 0));
}

export function tradeQuota(state) {
  return 1 + (getMods(state).tradeQuota || 0);
}

export function scavengeQuota(state) {
  return 1 + (getMods(state).scavengeQuota || 0);
}

// Keep state.social.drones in step with the drone furniture installed at home (package 14023).
export function syncDrones(state) {
  const s = social(state);
  const installed = homeFurniture(state).filter((f) => f.cfg === DRONE_FURN);
  const cap = droneCapacityKg(state);
  for (const f of installed) {
    let d = s.drones.find((x) => x.uid === f.uid);
    if (!d) {
      d = { uid: f.uid, cargo: null, busyUntil: 0, mission: null, dailyTrades: 0, dailyScavenges: 0, gifts: [] };
      s.drones.push(d);
    }
    if (!d.cargo || !state.inventories[d.cargo]) d.cargo = createInventory(state, { kind: 'drone', w: 6, h: 5, maxKg: cap, label: 'drone', owner: f.uid }).id;
    state.inventories[d.cargo].maxKg = cap;
    f.inv = d.cargo; // the cargo hold counts as home storage
  }
  s.drones = s.drones.filter((d) => installed.some((f) => f.uid === d.uid));
  return s.drones;
}

export function listDrones(state) {
  return syncDrones(state);
}

export function droneByUid(state, uid) {
  return syncDrones(state).find((d) => d.uid === uid) || null;
}

export function droneBusy(state, d) {
  return !!d && d.busyUntil > state.clock.t;
}

function pruneGifts(state, d) {
  const inv = state.inventories[d.cargo];
  d.gifts = (d.gifts || []).filter((uid) => inv && findUid(inv, uid));
}

export function droneHasGift(state, d) {
  pruneGifts(state, d);
  return d.gifts.length > 0;
}

// true, or the reason the drone cannot fly this op right now.
export function droneBlock(state, d, op) {
  if (!d) return pickLang({ en: 'You need a drone for that.', zh: '需要一架无人机。' });
  if (state.phase === 'pre') return pickLang({ en: 'Not before the disaster.', zh: '灾变前用不上。' });
  if (droneBusy(state, d)) return pickLang({ en: `The drone is out (back in ${formatDuration(d.busyUntil - state.clock.t)}).`, zh: `无人机外出中（${formatDuration(d.busyUntil - state.clock.t)}后返回）。` });
  if (droneHasGift(state, d)) return pickLang({ en: 'Collect the return gift from the cargo hold first.', zh: '先把货舱里的回礼取出来。' });
  if (op === 'trade' && d.dailyTrades >= tradeQuota(state)) return pickLang({ en: 'This drone has used its trades for today.', zh: '这架无人机今天的交易次数用完了。' });
  if (op === 'scavenge' && d.dailyScavenges >= scavengeQuota(state)) return pickLang({ en: 'This drone has already scavenged today.', zh: '这架无人机今天已经拾荒过了。' });
  return true;
}

export function idleDrone(state, op) {
  return listDrones(state).find((d) => droneBlock(state, d, op) === true) || null;
}

function pickDrone(state, uid, op) {
  const d = uid != null ? droneByUid(state, uid) : idleDrone(state, op) || listDrones(state)[0] || null;
  const block = droneBlock(state, d, op);
  return block === true ? { d } : { reason: block };
}

function dispatch(state, d, op, data = {}) {
  d.busyUntil = state.clock.t + DRONE_HOURS[op] * HOUR;
  d.mission = { op, at: state.clock.t, ...data };
  emit('droneDispatched', { uid: d.uid, op });
}

export const MISSION_LABELS = {
  trade: { en: 'Trading', zh: '交易中' },
  scavenge: { en: 'Scavenging', zh: '拾荒中' },
  loot: { en: 'Collecting loot', zh: '拾取战利品' },
  coords: { en: 'Flying to coordinates', zh: '飞往坐标' },
  help: { en: 'Answering a help request', zh: '回应求助' },
  deliver: { en: 'Supply drop', zh: '投送物资' },
  rescue: { en: 'Rescue delivery', zh: '救助投送' },
  lure: { en: 'Luring the horde', zh: '引开尸潮' },
};

export function droneStatusText(state, d) {
  if (droneBusy(state, d)) return `${pickLang(MISSION_LABELS[d.mission?.op] || { en: 'Out', zh: '外出' })} · ${formatDuration(d.busyUntil - state.clock.t)}`;
  if (droneHasGift(state, d)) return pickLang({ en: 'Return gift in the hold', zh: '货舱里有回礼' });
  return pickLang({ en: 'Ready', zh: '待命' });
}

function dropNear(state, d, inst) {
  const f = state.furniture[d.uid];
  const at = f || frontDoorTile(state);
  dropToFloor(state, inst, at.floor, at.x, at.y);
}

function cargoAdd(state, d, list, { gift = false } = {}) {
  const inv = state.inventories[d.cargo];
  for (const [id, n] of list) {
    if (!item(id)) continue;
    for (let i = 0; i < n; i++) {
      const inst = makeInstance(state, id);
      if (inv && insert(inv, inst, { allowOverweight: true })) {
        if (gift) d.gifts.push(inst.uid);
      } else {
        dropNear(state, d, inst);
      }
      emit('gotItem', { id });
    }
  }
}

function rollScavenge(state) {
  const n = randInt(state, 3, 5) + (rand(state) < (getMods(state).lootMult || 1) - 1 ? 1 : 0);
  const out = [];
  for (let i = 0; i < n; i++) out.push([weighted(state, SCAVENGE_POOL), 1]);
  return out;
}

function yardBoxes(state) {
  const innerH = homeFloors(state.home.id)['1F'].innerH;
  return (state.floorBoxes || []).filter((b) => b.floor === '1F' && b.y >= innerH && state.inventories[b.inv]?.items.length);
}

function collectYardLoot(state, d) {
  const cargo = state.inventories[d.cargo];
  let moved = 0;
  for (const b of yardBoxes(state)) {
    const inv = state.inventories[b.inv];
    for (const it of [...inv.items]) {
      removeUid(inv, it.uid);
      if (cargo && insert(cargo, it, { allowOverweight: true })) moved++;
      else insert(inv, it, { allowOverweight: true });
    }
  }
  return moved;
}

function finishMission(state, d) {
  const m = d.mission;
  d.mission = null;
  switch (m.op) {
    case 'trade':
      cargoAdd(state, d, m.take);
      completeTrade(state, m.partner);
      break;
    case 'scavenge': {
      const got = rollScavenge(state);
      cargoAdd(state, d, got);
      bump(state, 'drone.foraging.count');
      toast({ en: `The drone is back from scavenging with ${got.length} items.`, zh: `无人机拾荒归来，带回${got.length}件物品。` }, 'good');
      break;
    }
    case 'loot': {
      const moved = collectYardLoot(state, d);
      toast({ en: `The drone hauled ${moved} items of loot into its hold.`, zh: `无人机把${moved}件战利品运回了货舱。` }, 'good');
      break;
    }
    case 'coords':
      cargoAdd(state, d, m.loot || []);
      toast({ en: `The coordinates were real: ${pickLang(m.label)} recovered.`, zh: `坐标是真的：找回了${pickLang(m.label)}。` }, 'good');
      break;
    case 'help':
    case 'deliver':
      survivorAnswer(state, d, m);
      break;
    case 'rescue':
      wmAnswer(state, d, m);
      break;
    case 'lure':
      toast({ en: 'The drone is back from leading the horde.', zh: '引开尸潮的无人机回来了。' });
      break;
  }
  emit('droneReturned', { uid: d.uid, op: m.op });
}

// Queue a drone operation at the nearest idle drone (walk there, 5 minutes at the controls).
export function queueDroneOp(state, op, extra = {}) {
  const d = extra.drone != null ? droneByUid(state, extra.drone) : idleDrone(state, op) || listDrones(state)[0];
  const block = droneBlock(state, d, op);
  if (block !== true) return fail(block);
  // the drone's config function for the mission (1754 scavenge, 1772 loot, 1773 coords, 1778 lure), when it has one
  const funcKey = opFunc(null, 'drone', op);
  const a = enqueue(state, { kind: 'drone', label: pickLang(MISSION_LABELS[op]), target: { furn: d.uid }, furn: d.uid, dur: 5 * 60, spec: { kind: 'drone', op }, ...(funcKey != null ? { funcKey } : {}), ...extra });
  return { ok: true, action: a };
}

function droneOpCheck(state, d, op, a = {}) {
  const block = droneBlock(state, d, op);
  if (block !== true) return block;
  if (op === 'loot' && !yardBoxes(state).length) return pickLang({ en: 'Nothing to collect in the yard.', zh: '院子里没有可拾取的东西。' });
  if (op === 'coords' && !social(state).coords.length) return pickLang({ en: 'No coordinates to check.', zh: '没有要去的坐标。' });
  if (op === 'lure') {
    const act = social(state).shield.active;
    if (!act || act.luring || (a.post && act.post !== a.post)) return pickLang({ en: 'Nobody needs a horde lured away.', zh: '没有需要引开的尸潮。' });
  }
  return true;
}

function runDroneOp(state, d, op) {
  const s = social(state);
  if (op === 'scavenge') {
    d.dailyScavenges++;
    dispatch(state, d, 'scavenge');
  } else if (op === 'loot') {
    dispatch(state, d, 'loot');
  } else if (op === 'coords') {
    const c = s.coords.shift();
    dispatch(state, d, 'coords', { id: c.id, label: c.label, loot: c.loot });
  } else if (op === 'lure') {
    startLure(state, d);
  }
}

// ------------------------------------------------------------------------------ trading (O03)
export function tradeSources(state) {
  const out = [{ key: 'backpack', label: { en: 'Backpack', zh: '背包' }, invs: [state.player.backpack] }];
  const fridges = [];
  const tools = [];
  for (const f of homeFurniture(state)) {
    const inv = f.inv && state.inventories[f.inv];
    if (!inv || f.cfg === DRONE_FURN) continue;
    if (inv.cold > 0 || inv.coldRoom) fridges.push(f.inv);
    else if (TOOL_CABINETS.includes(f.cfg)) tools.push(f.inv);
  }
  if (fridges.length) out.push({ key: 'fridge', label: { en: 'Refrigerator', zh: '冰箱' }, invs: fridges });
  if (tools.length) out.push({ key: 'tools', label: { en: 'Tool Cabinet', zh: '工具柜' }, invs: tools });
  const cargo = listDrones(state).map((d) => d.cargo).filter((id) => state.inventories[id]?.items.length);
  if (cargo.length) out.push({ key: 'cargo', label: { en: 'Drone Cargo', zh: '无人机货舱' }, invs: cargo });
  return out;
}

function inMain(main, cfg) {
  if (!main || !cfg) return false;
  if (main.cats?.includes(cfg.cat)) return true;
  return main.cat === cfg.cat && (!main.subs || main.subs.includes(cfg.sub));
}

function partnerRef(state, partnerId) {
  const s = social(state);
  if (typeof partnerId !== 'string') return null;
  if (partnerId.startsWith('sv:')) {
    const sv = s.survivors.find((x) => x.id === partnerId.slice(3));
    return sv ? { kind: 'survivor', sv, stock: sv.stock, name: sv.name } : null;
  }
  const def = POST_BY_ID[partnerId];
  const ps = s.posts[partnerId];
  return def && ps ? { kind: 'post', def, ps, stock: ps.stock, name: def.name } : null;
}

export function tradePartners(state) {
  const s = social(state);
  const out = [];
  for (const p of TRADING_POSTS) {
    const ps = s.posts[p.id];
    if (ps.unlocked) out.push({ id: p.id, kind: 'post', name: p.name, blurb: p.blurb, damaged: ps.damaged, deals: ps.deals, main: p.main });
  }
  for (const sv of s.survivors) {
    if (sv.alive && sv.status === 'contact' && sv.stock.some((e) => e.qty > 0)) out.push({ id: `sv:${sv.id}`, kind: 'survivor', name: sv.name, deals: sv.deals || 0 });
  }
  return out;
}

export function buyPrice(state, partnerId, itemId) {
  const e = partnerRef(state, partnerId)?.stock.find((x) => x.id === itemId);
  return e?.price ?? item(itemId)?.trade ?? 0;
}

export function partnerStock(state, partnerId) {
  const ref = partnerRef(state, partnerId);
  if (!ref) return [];
  return ref.stock.filter((e) => e.qty > 0 && item(e.id)).map((e) => ({ id: e.id, qty: e.qty, price: e.price ?? item(e.id).trade ?? 0 }));
}

// What the partner pays for an item: null = refused (they sell it themselves); their main category at half value.
export function sellValue(state, partnerId, inst) {
  const ref = partnerRef(state, partnerId);
  const cfg = item(inst.id);
  if (!ref || !cfg) return null;
  if (ref.stock.some((e) => e.id === inst.id && e.qty > 0)) return null;
  let v = tradeValue(inst);
  if (isExpired(inst, cfg)) v *= 0.5;
  if (ref.kind === 'post' && inMain(ref.def.main, cfg)) v *= 0.5;
  return v;
}

export function offerValue(state, partnerId, picks) {
  const list = resolvePicks(state, picks) || [];
  let value = 0;
  const refused = [];
  let kg = 0;
  for (const { inst } of list) {
    const v = sellValue(state, partnerId, inst);
    if (v == null) refused.push(inst.id);
    else value += v;
    kg += (item(inst.id)?.g || 0) / 1000;
  }
  return { value, refused, kg };
}

export function takeWeightKg(take) {
  return (take || []).reduce((kg, { id, qty }) => kg + ((item(id)?.g || 0) * qty) / 1000, 0);
}

// How many of an item still fit: stock left and the drone's weight capacity ("one-click buy").
export function maxBuyable(state, partnerId, itemId, take = []) {
  const e = partnerRef(state, partnerId)?.stock.find((x) => x.id === itemId);
  if (!e) return 0;
  const others = take.filter((x) => x.id !== itemId);
  const freeKg = droneCapacityKg(state) - takeWeightKg(others);
  const g = item(itemId)?.g || 0;
  const byWeight = g > 0 ? Math.floor((freeKg * 1000 + 1e-6) / g) : e.qty;
  return Math.max(0, Math.min(e.qty, byWeight));
}

// give: [{ inv, uid }], take: [{ id, qty }]. The drone flies out with the goods and returns with the purchase.
export function executeTrade(state, { drone = null, partner, give = [], take = [] }) {
  const { d, reason } = pickDrone(state, drone, 'trade');
  if (!d) return fail(reason);
  const ref = partnerRef(state, partner);
  if (!ref) return fail({ en: 'Unknown trading partner.', zh: '未知的交易对象。' });
  if (ref.kind === 'post' && !ref.ps.unlocked) return fail({ en: 'That trading post is not reachable yet.', zh: '这个交易点还联系不上。' });
  const wanted = take.filter((x) => x.qty > 0);
  if (!wanted.length) return fail({ en: 'Pick something to buy.', zh: '先选要换的东西。' });
  let price = 0;
  for (const { id, qty } of wanted) {
    const e = ref.stock.find((x) => x.id === id);
    if (!e || e.qty < qty) return fail({ en: 'They do not have that many.', zh: '对方没有那么多。' });
    price += (e.price ?? item(id)?.trade ?? 0) * qty;
  }
  const picks = resolvePicks(state, give);
  if (!picks) return fail({ en: 'Some offered items are gone.', zh: '有些要交出的物品不见了。' });
  let value = 0;
  let giveKg = 0;
  for (const { inst } of picks) {
    const v = sellValue(state, partner, inst);
    if (v == null) return fail({ en: `They don't buy ${itemName(inst.id)} — they sell it.`, zh: `对方自己就在卖${itemName(inst.id)}，不收。` });
    value += v;
    giveKg += (item(inst.id)?.g || 0) / 1000;
  }
  if (value + 1e-6 < price) return fail({ en: `Not enough trade value (${Math.floor(value)} / ${price}).`, zh: `交易价值不足（${Math.floor(value)} / ${price}）。` });
  const cap = droneCapacityKg(state);
  if (takeWeightKg(wanted) > cap + 1e-6 || giveKg > cap + 1e-6) return fail({ en: `The drone carries at most ${cap} kg.`, zh: `无人机最多只能载${cap}千克。` });
  for (const { inv, inst } of picks) removeUid(inv, inst.uid);
  for (const { id, qty } of wanted) ref.stock.find((x) => x.id === id).qty -= qty;
  d.dailyTrades++;
  dispatch(state, d, 'trade', { partner, take: wanted.map((x) => [x.id, x.qty]) });
  if (ref.kind === 'survivor' && ref.sv.stock.every((e) => e.qty <= 0)) schedule(state, state.clock.t + DAY, 'survivorHelp', { id: ref.sv.id });
  return { ok: true, value, price, drone: d.uid };
}

// Counted when the drone comes back: deals, distinct trading posts and the "never traded" taboo.
function completeTrade(state, partnerId) {
  const s = social(state);
  const ref = partnerRef(state, partnerId);
  bump(state, 'trade.active.dealcount');
  state.progress.taboo.trade = true;
  if (ref?.kind === 'post') {
    ref.ps.deals++;
    ref.ps.partner = true;
    state.progress.counters['trade.stranger.partner'] = TRADING_POSTS.filter((p) => s.posts[p.id].partner).length;
    const th = ensureThread(state, `post:${ref.def.id}`, { name: ref.def.name, kind: 'post' });
    sendSms(state, th.id, { text: pick(state, POST_LINES.thanks), silent: true });
  } else if (ref?.kind === 'survivor') {
    ref.sv.deals = (ref.sv.deals || 0) + 1;
  }
  toast({ en: `Trade with ${pickLang(ref?.name)} complete. The goods are in the drone's hold.`, zh: `与${pickLang(ref?.name)}的交易完成，货物在无人机货舱里。` }, 'good');
}

function restockPost(ps, day) {
  for (const e of ps.stock) e.qty = e.max;
  ps.restockDay = day;
}

export function damagePost(state, postId) {
  const ps = social(state).posts[postId];
  if (!ps) return;
  ps.damaged = true;
  ps.damagedUntil = state.clock.t + POST_DAMAGE_DAYS * DAY;
  const keep = shuffle(state, ps.stock).slice(0, randInt(state, 1, 2));
  for (const e of ps.stock) e.qty = keep.includes(e) ? 1 : 0;
}

function postsDaily(state, day) {
  const s = social(state);
  for (const p of TRADING_POSTS) {
    const ps = s.posts[p.id];
    if (!ps.unlocked && day >= p.unlockDay) {
      ps.unlocked = true;
      ps.restockDay = day;
      ensureThread(state, `post:${p.id}`, { name: p.name, kind: 'post' });
      sendSms(state, `post:${p.id}`, { text: POST_LINES.online, vars: { post: p.name }, kind: 'post' });
    }
    if (ps.damaged && state.clock.t >= ps.damagedUntil) {
      ps.damaged = false;
      restockPost(ps, day);
    } else if (!ps.damaged && day - ps.restockDay >= POST_RESTOCK_DAYS) {
      restockPost(ps, day);
    }
  }
}

// ------------------------------------------------------------------------------ survivor network (O04)
function survivorThread(sv) {
  return `sv:${sv.id}`;
}

export function survivorName(sv) {
  return sv.unknown && !sv.known ? UNKNOWN_SURVIVORS.find((u) => u.id === sv.id)?.label || sv.name : sv.name;
}

export function findSurvivor(state, id) {
  return social(state).survivors.find((x) => x.id === id) || null;
}

function addSurvivor(state, def, customName) {
  const s = social(state);
  const sv = {
    id: def.id,
    name: customName || def.name,
    alive: true,
    status: 'quiet', // quiet -> contact -> help -> network; dead
    food: null,
    inNetwork: false,
    lastLetter: 0,
    unknown: false,
    known: true,
    stock: (def.stock || []).map(([id, max]) => ({ id, qty: max, max })),
    contactDay: randInt(state, 2, 7),
    helpDay: randInt(state, 10, 30),
    deliveries: 0,
    deals: 0,
    lowWarned: false,
  };
  s.survivors.push(sv);
  const th = ensureThread(state, survivorThread(sv), { name: sv.name, kind: 'survivor' });
  let t = -DAY + 11 * HOUR;
  for (const line of def.pre || []) {
    sendSms(state, th.id, { from: line.me ? 'me' : 'them', text: { en: line.en, zh: line.zh }, t: (t += 60), day: 0, read: true, silent: true });
  }
  return sv;
}

function addUnknown(state, def) {
  const s = social(state);
  const sv = { id: def.id, name: def.name, alive: true, status: 'quiet', food: null, inNetwork: false, lastLetter: 0, unknown: true, known: false, stock: [], contactDay: def.day, helpDay: def.day, deliveries: 0, deals: 0, lowWarned: false };
  s.survivors.push(sv);
  ensureThread(state, survivorThread(sv), { name: def.label, kind: 'unknown' });
  return sv;
}

// Survivors met in pre-disaster shops (state.pre.metNpcs); everyone when there was no pre-disaster phase.
function setupRoster(state) {
  const s = social(state);
  if (s.survivors.length) return;
  const met = state.meta.mode === 'pureEndless' ? null : state.pre?.metNpcs;
  if (Array.isArray(met)) {
    const used = new Set();
    for (const entry of met) {
      const id = typeof entry === 'string' ? entry : entry?.id;
      if (NOT_A_CONTACT.includes(id)) continue;
      const def = SURVIVORS.find((x) => x.id === id && !used.has(x.id)) || SURVIVORS.find((x) => !used.has(x.id));
      if (!def) break;
      used.add(def.id);
      addSurvivor(state, def, typeof entry === 'object' && entry?.name ? entry.name : null);
    }
  } else {
    for (const def of SURVIVORS) addSurvivor(state, def);
  }
  for (const def of UNKNOWN_SURVIVORS) addUnknown(state, def);
}

export function requestHelp(state, id) {
  const sv = findSurvivor(state, id);
  if (!sv?.alive || sv.inNetwork || sv.status === 'help') return false;
  sv.status = 'help';
  const lines = sv.unknown ? SURVIVOR_LINES.helpUnknown : SURVIVOR_LINES.help;
  sendSms(state, survivorThread(sv), { text: pick(state, lines), kind: 'help', ref: sv.id });
  return true;
}

export function pendingHelp(state) {
  return social(state).survivors.filter((sv) => sv.alive && sv.status === 'help');
}

export function networkSurvivors(state) {
  return social(state).survivors.filter((sv) => sv.inNetwork && sv.alive);
}

// Stranger ending: at least 6 supported survivors alive on Day 71 (guide G2 / Config_GlobalSetting).
export function aliveNetworkSurvivors(state) {
  return (state.social?.survivors || []).filter((sv) => sv.inNetwork && sv.alive).length;
}

function strangerRoute(state) {
  return state.story?.route === 'stranger' || !!state.story?.tags?.TAG_LINE_STRANGER_CHOSEN;
}

function aidPrep(state, { drone, survivor, give }, op) {
  const sv = findSurvivor(state, survivor);
  if (!sv?.alive) return { error: fail({ en: 'Nobody answers at that number.', zh: '那个号码没人回应了。' }) };
  if (op === 'help' && sv.status !== 'help') return { error: fail({ en: "They haven't asked for help.", zh: '对方没有求助。' }) };
  if (op === 'deliver' && !sv.inNetwork) return { error: fail({ en: 'They are not in your supply network yet.', zh: '对方还没加入你的补给网络。' }) };
  const { d, reason } = pickDrone(state, drone, op);
  if (!d) return { error: fail(reason) };
  const picks = foodPicks(state, give);
  if (!picks) return { error: fail({ en: 'Some items are gone.', zh: '有些物品不见了。' }) };
  const sat = picks.reduce((a, { inst }) => a + foodSat(inst), 0);
  if (sat < MIN_AID_SAT) return { error: fail({ en: `Send at least ${MIN_AID_SAT} Satiety of food.`, zh: `至少要送${MIN_AID_SAT}点饱腹值的食物。` }) };
  return { sv, d, picks, sat };
}

// Respond to a help request: the survivor joins the network and their food countdown starts (guide G2).
export function respondHelp(state, args) {
  const p = aidPrep(state, args, 'help');
  if (p.error) return p.error;
  const { sv, d, picks, sat } = p;
  for (const { inv, inst } of picks) removeUid(inv, inst.uid);
  sv.status = 'network';
  sv.inNetwork = true;
  sv.known = true;
  sv.food = Math.min(SURVIVOR_MAX_FOOD, sat / SURVIVOR_DAILY_SAT);
  sv.lowWarned = false;
  sv.deliveries++;
  ensureThread(state, survivorThread(sv), { name: sv.name });
  bump(state, 'survivor.aid');
  dispatch(state, d, 'help', { survivor: sv.id, sat });
  return { ok: true, sat, food: sv.food };
}

// Supply drop to a networked survivor (func 1760). Counts for Web Weaver after the stranger route is chosen.
export function deliverSupplies(state, args) {
  const p = aidPrep(state, args, 'deliver');
  if (p.error) return p.error;
  const { sv, d, picks, sat } = p;
  for (const { inv, inst } of picks) removeUid(inv, inst.uid);
  sv.food = Math.min(SURVIVOR_MAX_FOOD, Math.max(0, sv.food || 0) + sat / SURVIVOR_DAILY_SAT);
  sv.lowWarned = false;
  sv.deliveries++;
  bump(state, 'survivor.aid');
  if (strangerRoute(state)) bump(state, 'camp.prep.supply');
  dispatch(state, d, 'deliver', { survivor: sv.id, sat });
  return { ok: true, sat, food: sv.food };
}

function survivorAnswer(state, d, m) {
  const sv = findSurvivor(state, m.survivor);
  if (!sv?.alive) return;
  sv.lastLetter = state.clock.t;
  sendSms(state, survivorThread(sv), { text: pick(state, SURVIVOR_LINES.letters), kind: 'letter' });
  if (m.sat >= GIFT_AID_SAT) {
    const pool = SURVIVORS.find((x) => x.id === sv.id)?.gifts || UNKNOWN_SURVIVORS.find((x) => x.id === sv.id)?.gifts || [31001];
    cargoAdd(state, d, [[pick(state, pool), 1]], { gift: true });
    sendSms(state, survivorThread(sv), { text: SURVIVOR_LINES.gift, kind: 'gift', silent: true });
  }
}

function survivorDies(state, sv) {
  sv.alive = false;
  sv.status = 'dead';
  sendSms(state, survivorThread(sv), { from: 'system', text: SURVIVOR_LINES.dead, silent: true });
  leavePoints(state, sv.deliveries, sv.id);
  toast({ en: `${pickLang(survivorName(sv))} ran out of food.`, zh: `${pickLang(survivorName(sv))}断粮了。` }, 'bad');
  bump(state, 'survivor.dead');
}

function survivorsDaily(state, day) {
  for (const sv of social(state).survivors) {
    if (!sv.alive) continue;
    if (sv.status === 'quiet' && day >= sv.contactDay) {
      if (sv.unknown) {
        requestHelp(state, sv.id);
      } else {
        sv.status = 'contact';
        const def = SURVIVORS.find((x) => x.id === sv.id);
        if (def?.hello) sendSms(state, survivorThread(sv), { text: def.hello, kind: 'trade', ref: `sv:${sv.id}` });
      }
    } else if (sv.status === 'contact' && day >= sv.helpDay) {
      requestHelp(state, sv.id);
    }
    if (sv.inNetwork) {
      sv.food -= 1;
      if (sv.food < 0) {
        survivorDies(state, sv);
        continue;
      }
      if (sv.food <= 2 && !sv.lowWarned) {
        sv.lowWarned = true;
        sendSms(state, survivorThread(sv), { text: pick(state, SURVIVOR_LINES.low), kind: 'low', ref: sv.id });
      }
    }
  }
}

// ------------------------------------------------------------------------------ Warehouse Manager (O06)
export function wmState(state) {
  return social(state).wm;
}

function startWm(state) {
  const s = social(state);
  s.wm = { active: true, deliveries: 0, lastDay: 0, done: false };
  ensureThread(state, 'wm', { name: WAREHOUSE_MANAGER.name, kind: 'wm' });
  sendSms(state, 'wm', { from: 'system', text: WAREHOUSE_MANAGER.note, silent: true });
  sendSms(state, 'wm', { text: WAREHOUSE_MANAGER.first, kind: 'wm' });
}

// Feed the Warehouse Manager by drone (panel droneRescue): 10 deliveries unlock him as a character.
export function rescueDeliver(state, { drone = null, give = [] }) {
  const wm = wmState(state);
  if (state.meta.character !== 'student' || !wm?.active) return fail({ en: 'Nobody to rescue.', zh: '没有需要救助的人。' });
  if (wm.done || wm.deliveries >= WM_DELIVERIES) return fail({ en: 'He is safe now.', zh: '他已经安全了。' });
  const day = dayNumber(state.clock);
  if (wm.lastDay === day) return fail({ en: 'You already sent him supplies today.', zh: '今天已经给他送过了。' });
  const { d, reason } = pickDrone(state, drone, 'rescue');
  if (!d) return fail(reason);
  const picks = foodPicks(state, give);
  if (!picks) return fail({ en: 'Some items are gone.', zh: '有些物品不见了。' });
  const sat = picks.reduce((a, { inst }) => a + foodSat(inst), 0);
  if (sat < MIN_AID_SAT) return fail({ en: `Send at least ${MIN_AID_SAT} Satiety of food.`, zh: `至少要送${MIN_AID_SAT}点饱腹值的食物。` });
  for (const { inv, inst } of picks) removeUid(inv, inst.uid);
  wm.deliveries++;
  wm.lastDay = day;
  bump(state, 'wm.delivery');
  bump(state, 'survivor.aid');
  dispatch(state, d, 'rescue', { index: wm.deliveries - 1, sat });
  return { ok: true, deliveries: wm.deliveries };
}

function wmAnswer(state, d, m) {
  const wm = wmState(state);
  if (!wm) return;
  cargoAdd(state, d, WAREHOUSE_MANAGER.gifts[m.index] || [], { gift: true });
  const line = WAREHOUSE_MANAGER.thanks[m.index];
  if (line) sendSms(state, 'wm', { text: line, kind: 'wm' });
  if (wm.deliveries >= WM_DELIVERIES && !wm.done) {
    wm.done = true;
    setStoryTag(state, 'TAG_WM_RESCUED');
    emit('unlockCharacter', { id: 'warehouse', reason: 'rescue' });
    toast(WAREHOUSE_MANAGER.done, 'good');
  }
}

// The College Student's second drone: the scrapped teaching drone (9044) + craft 323 (patch 09-12).
function scanStoryItems(state) {
  const s = social(state);
  if (state.meta.character !== 'student' || state.phase !== 'post' || state.meta.mode === 'pureEndless') return;
  if (!s.wm && hasItemAtHome(state, 9014)) startWm(state);
  if (!s.flags.scrapDrone && hasItemAtHome(state, SCRAPPED_DRONE)) {
    s.flags.scrapDrone = true;
    const list = (state.run.unlockedRecipes ||= []);
    if (!list.includes(DRONE_CRAFT)) list.push(DRONE_CRAFT);
    emit('recipeUnlocked', { id: DRONE_CRAFT });
    toast({ en: 'The old teaching drone could fly again. Repair it at the workbench.', zh: '这架旧教学无人机还能修好。去工作台修一修。' }, 'good');
  }
}

// ------------------------------------------------------------------------------ veteran (O07)
export function veteranState(state) {
  return social(state).veteran;
}

function veteranDaily(state, day) {
  const s = social(state);
  if (state.meta.character !== 'warehouse' || state.meta.mode === 'pureEndless') return;
  if (!s.veteran && day >= VETERAN.appearDay) {
    const f = placeFixture(state, VETERAN_FURN, `${VETERAN.tile.floor}:veteran`, VETERAN.tile);
    s.veteran = { uid: f.uid, fed: 0, stage: 0, food: VETERAN.startFood, gone: false, done: false, deliveries: 0 };
    toast(VETERAN.appear);
    return;
  }
  const v = s.veteran;
  if (!v || v.gone || v.done) return;
  v.food -= 1;
  if (v.food < 0) {
    v.gone = true;
    removeFixture(state, v.uid);
    leavePoints(state, v.deliveries, 'veteran');
    toast(VETERAN.gone, 'bad');
  }
}

// Panel giveSupplies (func 1791): satiety counted by remaining portions; stages yield military supplies.
export function giveVeteran(state, give) {
  const v = veteranState(state);
  if (!v || v.gone || v.done) return fail({ en: 'Nobody is there.', zh: '那里没有人。' });
  const picks = foodPicks(state, give);
  if (!picks?.length) return fail({ en: 'Give him something to eat.', zh: '给他点吃的。' });
  const sat = picks.reduce((a, { inst }) => a + foodSat(inst), 0);
  if (sat <= 0) return fail({ en: 'Give him something to eat.', zh: '给他点吃的。' });
  for (const { inv, inst } of picks) removeUid(inv, inst.uid);
  v.fed += sat;
  v.food = Math.min(10, Math.max(0, v.food) + sat / SURVIVOR_DAILY_SAT);
  v.deliveries = (v.deliveries || 0) + 1;
  bump(state, 'veteran.fed', sat);
  bump(state, 'survivor.aid');
  const rewards = [];
  while (v.stage < VETERAN.stages.length && v.fed >= VETERAN.stages[v.stage].need) {
    const st = VETERAN.stages[v.stage++];
    giveItems(state, st.give);
    rewards.push(...st.give);
    toast(st.text, 'good');
    if (st.final) {
      v.done = true;
      removeFixture(state, v.uid);
      social(state).coords.push({ ...VETERAN.cache });
      setStoryTag(state, 'TAG_VETERAN_DONE');
    }
  }
  return { ok: true, sat, rewards };
}

// ------------------------------------------------------------------------------ Shield of the Street (O05)
export function shieldState(state) {
  return social(state).shield;
}

function shieldSize(state) {
  return Math.min(4, 2 + shieldState(state).defended);
}

function startLure(state, d) {
  const sh = shieldState(state);
  const a = sh.active;
  a.luring = true;
  a.awaiting = true;
  a.sawHorde = false;
  a.dispatchAt = state.clock.t;
  a.drone = d.uid;
  dispatch(state, d, 'lure', { post: a.post });
  emit('summonHorde', { state, size: shieldSize(state), reason: 'shield', post: a.post });
  toast({ en: 'The drone is leading the horde toward your door. Get ready.', zh: '无人机正把尸潮往你家门口引。做好准备。' }, 'bad');
}

// Called when the lured horde is repelled (bus 'hordeEnded' or the fallback checks below).
export function markShieldDefended(state) {
  const sh = shieldState(state);
  const a = sh.active;
  if (!a?.awaiting) return false;
  const def = POST_BY_ID[a.post];
  sh.defended++;
  sh.active = null;
  sh.nextAt = state.clock.t + randInt(state, 3, 5) * DAY;
  const pool = def.stock.map(([id]) => id);
  const support = [];
  for (let i = 0; i < 4; i++) support.push([pick(state, pool), 1]);
  const d = droneByUid(state, a.drone);
  if (d) cargoAdd(state, d, support);
  else deliverToDoorstep(state, support);
  sendSms(state, `post:${def.id}`, { text: POST_LINES.saved, kind: 'post' });
  bump(state, 'shield.defended');
  if (sh.defended >= SHIELD_WIN && !sh.done) {
    sh.done = true;
    setStoryTag(state, 'TAG_SHIELD_OF_STREET');
    setStoryTag(state, 'TAG_SHIELD_OF_THE_STREET'); // the spelling the endings screen reads
    toast({ en: 'Challenge ending: Shield of the Street.', zh: '挑战结局：一街之盾。' }, 'good');
  }
  return true;
}

function shieldHourly(state) {
  const s = social(state);
  const sh = s.shield;
  if (sh.done || (state.meta.mode || 'story') !== 'story' || dayNumber(state.clock) <= 50) return;
  const a = sh.active;
  if (a) {
    if (a.awaiting) {
      if (hordeActive(state)) a.sawHorde = true;
      else if (a.sawHorde || state.clock.t >= a.dispatchAt + 36 * HOUR) markShieldDefended(state);
      return;
    }
    if (state.clock.t >= a.expires) {
      damagePost(state, a.post);
      sendSms(state, `post:${a.post}`, { text: POST_LINES.damaged, kind: 'post' });
      sh.active = null;
      sh.nextAt = state.clock.t + DAY;
    }
    return;
  }
  if (sh.rounds >= SHIELD_ROUNDS || state.clock.t < sh.nextAt) return;
  const cands = TRADING_POSTS.filter((p) => s.posts[p.id].unlocked && !s.posts[p.id].damaged);
  if (!cands.length) {
    sh.nextAt = state.clock.t + DAY;
    return;
  }
  const p = pick(state, cands);
  sh.rounds++;
  sh.active = { post: p.id, at: state.clock.t, expires: state.clock.t + 24 * HOUR, luring: false, awaiting: false };
  ensureThread(state, `post:${p.id}`, { name: p.name, kind: 'post' });
  sendSms(state, `post:${p.id}`, { text: POST_LINES.distress, kind: 'distress', ref: p.id });
}

// ------------------------------------------------------------------------------ doorstep cat (O08)
export function catState(state) {
  return social(state).cats;
}

export function catEvent(state) {
  const p = catState(state).pending;
  return p ? CAT_EVENTS.find((e) => e.id === p.id) || null : null;
}

// Hidden while a horde is at the door (patch 09-08); the countdown pauses too.
export function catVisible(state) {
  return !!catState(state).pending && !hordeActive(state);
}

function startCatEvent(state) {
  const c = catState(state);
  const next = CAT_EVENTS[c.stage + 1];
  if (next && c.trust >= next.minTrust) c.stage++;
  const ev = CAT_EVENTS[Math.min(c.stage, CAT_EVENTS.length - 1)];
  c.pending = { id: ev.id, at: state.clock.t, expires: state.clock.t + CAT_COUNTDOWN_S };
  c.visits++;
  c.lastSeen = state.clock.t;
  toast({ en: '🐈 Something is scratching at the front door…', zh: '🐈 有什么东西在挠大门……' });
  emit('openPanel', { panel: 'catEvent' });
}

function feedCat(state, portions) {
  for (let i = 0; i < portions; i++) {
    let best = null;
    for (const invId of homeSources(state)) {
      const inv = state.inventories[invId];
      for (const inst of inv?.items || []) {
        const cfg = item(inst.id);
        if (cfg?.cat !== CAT.FOOD || cfg.sat <= 0 || cfg.noUse) continue;
        const score = cfg.sat + (cfg.sub === 2 || cfg.sub === 4 ? -20 : 0);
        if (!best || score < best.score) best = { inv, inst, score };
      }
    }
    if (!best) return i > 0;
    usePortion(state, best.inv, best.inst);
  }
  return true;
}

export function resolveCat(state, choiceId) {
  const c = catState(state);
  const ev = catEvent(state);
  if (!ev) return fail({ en: 'The cat is gone.', zh: '猫已经走了。' });
  const ch = ev.choices.find((x) => x.id === choiceId) || ev.choices.find((x) => x.id === ev.default);
  if (ch.food && !feedCat(state, ch.food)) return fail({ en: 'You have nothing it can eat.', zh: '你没有能喂它的东西。' });
  if (ch.give) deliverToDoorstep(state, ch.give);
  if (ev.final && ch.id !== 'ignore' && chance(state, 0.3)) deliverToDoorstep(state, [[pick(state, CAT_PREY_GIFTS), 1]]);
  c.trust += ch.trust || 0;
  if (ch.mor) addStat(state, 'mor', ch.mor, 'cat');
  c.pending = null;
  bump(state, `cat.${ch.id}`);
  return { ok: true, choice: ch.id };
}

export function catTimeLeft(state) {
  const p = catState(state).pending;
  return p ? Math.max(0, p.expires - state.clock.t) : 0;
}

function tickCatPending(state, dt) {
  const c = catState(state);
  if (hordeActive(state)) {
    c.pending.expires += dt;
    return;
  }
  if (state.clock.t >= c.pending.expires) {
    const ev = catEvent(state);
    if (!ev) c.pending = null;
    else resolveCat(state, ev.default);
  }
}

function catsHourly(state, h) {
  const c = catState(state);
  if (c.pending || state.clock.t < c.nextAt || h < 8 || h > 19 || hordeActive(state) || state.player.scene !== 'home') return;
  startCatEvent(state);
  c.nextAt = state.clock.t + (2 + rand(state) * 1.5) * DAY;
}

// ------------------------------------------------------------------------------ daily odds and ends
function dronePackageFallback(state, day) {
  const s = social(state);
  if (s.flags.dronePackage || day < 5) return;
  s.flags.dronePackage = true;
  if (listDrones(state).length || hasItemAtHome(state, DRONE_PACKAGE)) return;
  deliverToDoorstep(state, [[DRONE_PACKAGE, 1]]);
  ensureThread(state, 'unknown:courier', { name: { en: 'Unknown number', zh: '陌生号码' }, kind: 'unknown' });
  sendSms(state, 'unknown:courier', { text: DRONE_PACKAGE_NOTE });
}

function coordTips(state, day) {
  const s = social(state);
  for (const tip of COORD_TIPS) {
    if (day < tip.day || s.flags[`coords:${tip.id}`]) continue;
    s.flags[`coords:${tip.id}`] = true;
    s.coords.push({ id: tip.id, label: tip.label, loot: tip.loot });
    ensureThread(state, `unknown:${tip.id}`, { name: { en: 'Unknown number', zh: '陌生号码' }, kind: 'unknown' });
    sendSms(state, `unknown:${tip.id}`, { text: tip.text, kind: 'coords' });
  }
}

// Post-disaster setup; runs at the outbreak, or lazily when a run starts past it.
function startPost(state) {
  const s = social(state);
  if (s.started) return;
  s.started = true;
  const t0 = Math.max(state.clock.t, state.clock.outbreakAt);
  setupNeighbor(state, t0);
  setupRoster(state);
  s.cats.nextAt = dayStartT(state.clock, 3) + (10 + randInt(state, 0, 6)) * HOUR;
  s.shield.nextAt = dayStartT(state.clock, 51) + 9 * HOUR;
}

const TIMERS = {
  neighborIntro(state) {
    const n = neighborState(state);
    const def = neighborDef(state);
    if (!def || !n.alive) return;
    sendSms(state, 'neighbor', { text: def.lines.intro, kind: 'intro', options: def.lines.introOptions });
  },
  neighborHelp(state) {
    const n = neighborState(state);
    const def = neighborDef(state);
    if (!def || !n.alive || n.basketRepaired) return;
    sendSms(state, 'neighbor', { text: def.lines.help, kind: 'help' });
  },
  survivorHelp(state, data) {
    const sv = findSurvivor(state, data?.id);
    if (sv?.alive && sv.status === 'contact') requestHelp(state, sv.id);
  },
};

function runTimers(state) {
  const s = social(state);
  if (!s.timers.some((x) => x.at <= state.clock.t)) return;
  const due = s.timers.filter((x) => x.at <= state.clock.t);
  s.timers = s.timers.filter((x) => x.at > state.clock.t);
  for (const x of due) TIMERS[x.id]?.(state, x.data);
}

// Bus events arrive without a state; they are applied on the next tick of the running game.
const busQueue = [];
let scanSoon = false;

function handleHordeEnded(state, p) {
  const a = shieldState(state).active;
  if (!a?.awaiting || (p?.kind && p.kind !== 'shield') || p?.success === false) return;
  markShieldDefended(state);
}

on('hordeEnded', (p) => (p?.state ? handleHordeEnded(p.state, p) : busQueue.push(['hordeEnded', p])));
on('gotItem', (p) => {
  if (p?.id === 9014 || p?.id === SCRAPPED_DRONE) scanSoon = true;
});
on('document', (p) => {
  if (p?.id === 9014) scanSoon = true;
});
on('groupFoodShared', (p) => {
  const st = p?.state;
  if (st?.social?.neighbor?.basketRepaired) addNeighborAffinity(st, p.affinity || 10);
});

// ------------------------------------------------------------------------------ action kinds
registerKind('drone', {
  available(state, f, spec) {
    if (spec.op === 'loot' && !yardBoxes(state).length) return 'hide';
    if (spec.op === 'coords' && !social(state).coords.length) return 'hide';
    if (spec.op === 'lure' && !shieldState(state).active) return 'hide';
    return droneOpCheck(state, droneByUid(state, f.uid), spec.op);
  },
  canStart(state, a) {
    return droneOpCheck(state, droneByUid(state, a.furn), a.spec?.op, a);
  },
  complete(state, a) {
    const d = droneByUid(state, a.furn);
    const why = droneOpCheck(state, d, a.spec?.op, a);
    if (why !== true) {
      emit('toast', { text: why, kind: 'bad' });
      return;
    }
    runDroneOp(state, d, a.spec.op);
  },
});

registerKind('basket', {
  available(state, f, spec) {
    const n = neighborState(state);
    if (!n.id) return 'hide';
    if (spec.op === 'repair') return n.basketRepaired ? 'hide' : n.alive ? true : pickLang({ en: 'Nobody pulls the rope anymore.', zh: '已经没有人拉绳子了。' });
    if (spec.op === 'rope') return n.basketRepaired && n.alive && n.ropeHp <= ROPE_WORN ? true : 'hide';
    return true;
  },
  canStart(state, a) {
    const n = neighborState(state);
    if (!n.id) return pickLang({ en: 'The line leads nowhere.', zh: '绳子那头没有人。' });
    if (!n.alive) return pickLang({ en: 'Nobody pulls the rope anymore.', zh: '已经没有人拉绳子了。' });
    const op = a.spec?.op;
    if (op === 'repair' && n.basketRepaired) return pickLang({ en: 'The basket already works.', zh: '篮子已经修好了。' });
    if (op === 'rope' && (!n.basketRepaired || n.ropeHp >= ROPE_MAX)) return pickLang({ en: 'The rope is still fine.', zh: '绳子还好好的。' });
    return true;
  },
  complete(state, a) {
    const n = neighborState(state);
    const op = a.spec?.op;
    if (op === 'repair') repairBasket(state);
    else if (op === 'rope') {
      n.ropeHp = ROPE_MAX;
      state.progress.taboo.neighbor = true;
    } else if (op === 'send') {
      const r = sendBasket(state);
      emit('toast', r.ok ? { text: pickLang({ en: 'The basket slides across the rooftops.', zh: '篮子沿着绳子滑了过去。' }), kind: 'good' } : { text: r.reason, kind: 'bad' });
    }
  },
});

// Basket "Send" from the panel: walk to the basket and send (10 minutes).
export function queueBasketSend(state) {
  const n = neighborState(state);
  if (!n.basketUid || !state.furniture[n.basketUid]) return null;
  return enqueue(state, { kind: 'basket', label: pickLang({ en: 'Send the basket', zh: '送出篮子' }), target: { furn: n.basketUid }, furn: n.basketUid, dur: 10 * 60, spec: { kind: 'basket', op: 'send' } });
}

// ------------------------------------------------------------------------------ system
registerSystem({
  id: 'social',
  order: 60,
  init(state) {
    social(state);
  },
  ensure(state) {
    social(state);
  },
  onOutbreak(state) {
    startPost(state);
  },
  tick(state, dt) {
    const s = social(state);
    if (state.phase !== 'post') return;
    if (!s.started) startPost(state);
    while (busQueue.length) {
      const [type, p] = busQueue.shift();
      if (type === 'hordeEnded') handleHordeEnded(state, p);
    }
    if (scanSoon) {
      scanSoon = false;
      scanStoryItems(state);
    }
    if (s.timers.length) runTimers(state);
    for (const d of s.drones) if (d.mission && state.clock.t >= d.busyUntil) finishMission(state, d);
    if (s.cats.pending) tickCatPending(state, dt);
  },
  onHour(state, h) {
    if (state.phase !== 'post') return;
    const s = social(state);
    if (!s.started) startPost(state);
    syncDrones(state);
    scanStoryItems(state);
    neighborHourly(state, h);
    shieldHourly(state);
    catsHourly(state, h);
  },
  onDay(state, day) {
    const s = social(state);
    if (!s.started) startPost(state);
    for (const d of s.drones) {
      d.dailyTrades = 0;
      d.dailyScavenges = 0;
    }
    neighborDaily(state, day);
    postsDaily(state, day);
    survivorsDaily(state, day);
    veteranDaily(state, day);
    dronePackageFallback(state, day);
    coordTips(state, day);
    if (day === 71) {
      s.network71 = aliveNetworkSurvivors(state);
      if (s.network71 >= 6) setStoryTag(state, 'TAG_STRANGER_NETWORK_OK');
    }
  },
});

// ------------------------------------------------------------------------------ objectives
registerObjectives((state) => {
  const s = state.social;
  if (!s?.v || state.phase !== 'post' || !s.started) return [];
  const out = [];
  const n = s.neighbor;
  const def = n.id ? NEIGHBORS[n.id] : null;
  if (def && n.alive) {
    if (!n.basketRepaired) {
      out.push({ id: 'basket', text: pickLang({ en: 'Repair the basket line on the terrace', zh: '修好露台上的吊篮' }), prog: state.home.unlocked['2F'] ? '' : pickLang({ en: 'upstairs is locked', zh: '二楼还没解锁' }), urgent: n.foodDays < 1 });
    } else {
      const task = activeRescue(state);
      if (task) {
        const label = RESCUE_TASKS.find((r) => r.id === task.id)?.label;
        out.push({ id: task.id, text: pickLang(label), prog: `${Math.floor(task.progress)}/${task.need}${task.requests ? ` · ${pickLang({ en: 'requests', zh: '请求' })} ${task.reqDone}/${task.requests}` : ''}` });
      }
      const req = activeRequest(state);
      if (req) out.push({ id: 'request', text: `🧺 ${pickLang(requestDef(req).text)}`, prog: formatDuration(req.expires - state.clock.t), urgent: req.expires - state.clock.t < 12 * HOUR });
    }
    if (n.foodDays < 1) out.push({ id: 'neighborFood', text: pickLang({ en: `${pickLang(def.name)} is out of food!`, zh: `${pickLang(def.name)}断粮了！` }), urgent: true });
  }
  const help = s.survivors.filter((sv) => sv.alive && sv.status === 'help').length;
  if (help) out.push({ id: 'help', text: pickLang({ en: `${help} survivor(s) asked for help`, zh: `${help}名幸存者在求助` }), onClick: () => emit('openPanel', { panel: 'phone' }) });
  const low = s.survivors.filter((sv) => sv.alive && sv.inNetwork && sv.food <= 2);
  if (low.length) out.push({ id: 'networkLow', text: pickLang({ en: `Supply network: ${low.length} running out of food`, zh: `补给网络：${low.length}人快断粮了` }), urgent: true });
  if (s.wm?.active && !s.wm.done) out.push({ id: 'wm', text: pickLang({ en: 'Send food to the Warehouse Manager by drone', zh: '用无人机给仓库管理员送吃的' }), prog: `${s.wm.deliveries}/${WM_DELIVERIES}` });
  if (s.veteran && !s.veteran.gone && !s.veteran.done) {
    const next = VETERAN.stages[s.veteran.stage];
    out.push({ id: 'veteran', text: pickLang({ en: 'Feed the trapped veteran', zh: '给受困的老兵送吃的' }), prog: next ? `${Math.floor(s.veteran.fed)}/${next.need}` : '', urgent: s.veteran.food < 1 });
  }
  const sh = s.shield.active;
  if (sh && !sh.luring) out.push({ id: 'shield', text: pickLang({ en: `${pickLang(POST_BY_ID[sh.post].name)} is under siege — send a drone`, zh: `${pickLang(POST_BY_ID[sh.post].name)}被围——派无人机去引开尸潮` }), prog: formatDuration(sh.expires - state.clock.t), urgent: true });
  if (s.cats.pending && !hordeActive(state)) out.push({ id: 'cat', text: pickLang({ en: '🐈 A cat is at the door', zh: '🐈 门口来了只猫' }), prog: formatDuration(catTimeLeft(state)), onClick: () => emit('openPanel', { panel: 'catEvent' }) });
  if (s.drones.some((d) => (d.gifts || []).length && !droneBusy(state, d))) out.push({ id: 'droneGift', text: pickLang({ en: 'Collect the return gift from the drone', zh: '从无人机货舱取出回礼' }) });
  if (s.flags.scrapDrone && s.drones.length < 2) out.push({ id: 'droneQuest', text: pickLang({ en: 'Repair the old teaching drone at the workbench', zh: '在工作台修好旧教学无人机' }) });
  return out;
});
