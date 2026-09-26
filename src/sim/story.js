// Story engine (P01–P03, P16, F02, F06, Q06, Q07): scheduled story beats and random events with choices,
// quests shown as objectives, clue documents, knowledge memories, the Day 70 reckoning and the ending
// commitment (Military Repair Kit, deadline Day 74, one route per save).
import { registerSystem } from './tick.js';
import { registerKind, enqueue } from './actions.js';
import { registerObjectives } from './objectives.js';
import { registerSuggestions } from './suggest.js';
import { hasItems, consumeItems, giveItems, homeSources, unlockArea } from './furnActions.js';
import { homeFurniture, homeDef, slotDef, dropToFloor, allSlots, slotUsable, slotAccepts, effectiveMaxHp, furnDef } from './home.js';
import { countIn, insert, makeInstance, removeUid, findUid } from './inventory.js';
import { addStat, raiseMax, addEffect, removeEffect, dailyCount } from './stats.js';
import { addProfExp } from './proficiency.js';
import { planningSources, queueInstall } from './planning.js';
import { heatingByFloor, indoorTemp, THERMOSTAT } from './weather.js';
import { dayNumber, hourOfDay, HOUR, DAY } from './time.js';
import { item, itemName, furn, CAT, SLOT, packageToFurniture } from '../data/db.js';
import { FUNC_SPECS, SCENERY_SPECS } from '../content/funcSpecs.js';
import { EVENTS, QUESTS, CLUES, ENVELOPE, documentText } from '../content/events.js';
import { ROUTES, ROUTE_ORDER, KIT_ITEM, RECKONING_DAY, ROUTE_CHECK_DAY, COMMIT_DEADLINE_DAY, DEFAULT_FINAL_WAVE_DAY, routeTagChosen } from '../content/endings.js';
import { rand, randInt, weighted } from '../engine/rng.js';
import { emit, on } from '../engine/bus.js';
import { pickLang } from '../engine/i18n.js';

const T = (en, zh) => ({ en, zh });

export const MANUAL_ITEM = 9020;
export const BLUEPRINT_ITEM = 9003;
export const MARKER_ITEM = 9002;
export const RECORDER_ITEM = 9049;
export const BEACON_FURN = 9296;
export const RECORDER_FURN = 9297;
export const DEFENSE_FURN = { spikes: 36002, nets: 36003, saws: 36004 };
const BASKET_FURN = [9298, 80011];
const DRONE_FURN = [9054];
const MARK_MATS = [
  [BLUEPRINT_ITEM, 1],
  [20001, 1],
  [20002, 1],
  [20003, 1],
  [20004, 1],
];
const FORCE_MATS = [
  [20001, 2],
  [20002, 1],
  [20003, 1],
  [20004, 1],
];
const STALE_SECONDS = 12 * HOUR; // headless safety net: unanswered events resolve with their default
const HOSPITAL_SLOTS = [9041, 9042, 9043];
const EVENT_BY_ID = new Map(EVENTS.map((e) => [e.id, e]));

let active = null; // the run currently being simulated (bus payloads carry no state)

// ------------------------------------------------------------------------------------ state
export function ensureStory(state) {
  const st = (state.story ||= {});
  st.tags ||= {};
  st.quests ||= {};
  st.events ||= {};
  st.flags ||= {};
  st.seen ||= {};
  st.clues ||= [];
  st.docs ||= [];
  st.pending ||= [];
  st.history ||= [];
  st.commitAvailable ||= {};
  st.checks ||= {};
  st.powerChecks ||= {};
  st.promise ||= { base: {}, rescue: 0, requests: 0, inspections: 0 };
  if (st.route === undefined) st.route = null;
  if (st.active === undefined) st.active = null;
  st.finalWaveDay ||= DEFAULT_FINAL_WAVE_DAY;
  return st;
}

export function isNgPlus(state) {
  return !!(state.loop?.ngPlus || (state.loop?.cycle || 1) > 1);
}

export function currentDay(state) {
  return state.phase === 'pre' ? 0 : dayNumber(state.clock);
}

// Final horde day for this run: the horde system schedules its final wave on this day.
export function finalWaveDay(state) {
  const route = state.story?.route;
  return (route && ROUTES[route]?.finalWaveDay) || state.story?.finalWaveDay || DEFAULT_FINAL_WAVE_DAY;
}

function setupHome(state) {
  const locks = homeDef(state.home.id)?.locks || {};
  state.home.repairsNeeded ||= {};
  state.home.repairs ||= {};
  for (const [area, lock] of Object.entries(locks)) {
    if (lock.repairs && state.home.repairsNeeded[area] == null) state.home.repairsNeeded[area] = lock.repairs;
  }
}

// ------------------------------------------------------------------------------------ home metrics
const cfgOf = (f) => (typeof f.cfg === 'number' ? furn(f.cfg) : null);

function homeInvs(state) {
  return homeSources(state)
    .map((id) => state.inventories[id])
    .filter(Boolean);
}

// Total satiety of food stored at home (backpack + storage furniture); multi-serving dishes count each serving.
export function homeSatiety(state) {
  let sat = 0;
  for (const inv of homeInvs(state)) {
    for (const it of inv.items) {
      const cfg = item(it.id);
      if (cfg?.cat !== CAT.FOOD || !(cfg.sat > 0)) continue;
      const servings = cfg.uses > 1 ? (it.uses ?? cfg.uses) : 1;
      sat += cfg.sat * (it.qty || 1) * servings * (it.left ?? 1);
    }
  }
  return sat;
}

export function homeItemCount(state) {
  let n = 0;
  for (const inv of homeInvs(state)) for (const it of inv.items) n += it.qty || 1;
  return n;
}

export function storageFurnitureCount(state) {
  return homeFurniture(state).filter((f) => f.inv && state.inventories[f.inv]).length;
}

export function planterCount(state, floor = null) {
  const n = homeFurniture(state).filter((f) => cfgOf(f)?.plant > 0 && (!floor || f.floor === floor)).length;
  return floor ? n : Math.max(n, state.progress.counters.PlantPotCount || 0);
}

export function heaterCount(state, floor = null) {
  return homeFurniture(state).filter((f) => cfgOf(f)?.heat > 0 && f.on !== false && (!floor || f.floor === floor)).length;
}

function openFloors(state) {
  return Object.keys(homeDef(state.home.id).floors).filter((fl) => state.home.unlocked[fl]);
}

// Warm house (Greenhouse): every open floor has a heater actually running on it (a powered electric
// heater or AC, a lit fire) or is already at the thermostat temperature.
export function warmth(state) {
  const heat = heatingByFloor(state);
  const running = (fl) => (heat[fl] ? heat[fl].electric + heat[fl].fuel : 0) > 0;
  const floors = openFloors(state);
  const cold = floors.filter((fl) => !running(fl) && indoorTemp(state, fl) < THERMOSTAT);
  return { floors: floors.length, warm: floors.length - cold.length, cold };
}

export function allFloorsHeated(state) {
  const w = warmth(state);
  return w.floors > 0 && w.cold.length === 0;
}

function vaseCount(state) {
  return homeFurniture(state).filter((f) => cfgOf(f)?.vase > 0).length;
}

function beaconFloor(state) {
  return homeDef(state.home.id).floors['2F'] ? '2F' : null;
}

// The distress beacon counts once it stands on the second floor (homes without one: anywhere).
export function installedBeacon(state, anywhere = false) {
  const fl = beaconFloor(state);
  return homeFurniture(state).find((f) => f.cfg === BEACON_FURN && (anywhere || !fl || f.floor === fl)) || null;
}

export function installedRecorder(state) {
  return homeFurniture(state).find((f) => f.cfg === RECORDER_FURN) || null;
}

export function recorderAtHome(state) {
  return !!installedRecorder(state) || countIn(state, planningSources(state), RECORDER_ITEM) > 0;
}

function openings(state) {
  const out = { door: null, windows: [] };
  for (const f of homeFurniture(state)) {
    const type = slotDef(state, f.slot)?.type;
    if (type === SLOT.DOOR && !out.door) out.door = f;
    else if (type === SLOT.WINDOW) out.windows.push(f);
  }
  return out;
}

function furnCount(state, cfg) {
  return homeFurniture(state).filter((f) => f.cfg === cfg).length;
}

// Battery reserve 0..1 from the power system (state.power.stored / capacity). Without a power system a
// powered home counts as full.
export function powerReserve(state) {
  const p = state.power || {};
  if (typeof p.capacity === 'number') return p.capacity > 0 ? Math.max(0, Math.min(1, (p.stored || 0) / p.capacity)) : 0;
  return p.homePowered ? 1 : 0;
}

// Normalized neighbor info from the social system (state.social.neighbor: hearts 0–5, dead, rescueStage).
export function neighborInfo(state) {
  const nb = state.social?.neighbor || {};
  const tags = state.story?.tags || {};
  const lineTag = state.meta.character === 'student' ? 'COMPANION' : 'NEIGHBOR';
  return {
    hearts: nb.hearts ?? nb.affinity ?? 0,
    dead: !!(nb.dead || nb.alive === false || tags[lineTag === 'COMPANION' ? 'TAG_COMPANION_MAN_DEAD' : 'TAG_NEIGHBOR_DEAD']),
    rescue: nb.rescueStage ?? nb.rescue ?? 0,
    line: lineTag,
    basket: nb.basketRepaired ?? true,
    // the social system runs its own third rescue task (basket deliveries + SMS requests) once a route is chosen
    socialRescue: Array.isArray(nb.tasks),
  };
}

export function networkSurvivorsAlive(state) {
  const list = state.social?.survivors;
  const arr = Array.isArray(list) ? list : Object.values(list || {});
  return arr.filter((s) => s && s.alive && s.inNetwork).length;
}

function hospitalClueCount(state) {
  const slots = new Set();
  for (const id of state.story.clues) {
    const c = CLUES[id];
    if (c?.line === 'hospital') slots.add(c.pair || id);
  }
  return Math.min(HOSPITAL_SLOTS.length, slots.size);
}

function clueCount(state, lineId) {
  if (lineId === 'hospital') return hospitalClueCount(state);
  return state.story.clues.filter((id) => CLUES[id]?.line === lineId).length;
}

function hordeAttacking(state) {
  return (state.crises?.active || []).some((c) => c.type === 'horde' && c.phase === 'attack');
}

function hordeSoon(state) {
  const t = state.clock.t;
  return (state.crises?.upcoming || []).some((c) => c.type === 'horde' && c.at != null && c.at > t && c.at - t < 18 * HOUR);
}

// The home's own workbench: a config bench (Repair Workbench 220 among its functions: the starter 313 / 80033 / 405),
// the broken one first; or the 'workbench' stand-in of a save from before homes placed config pieces.
const REPAIR_BENCH_FUNC = 220;
function workbench(state) {
  const benches = homeFurniture(state).filter((f) => f.cfg === 'workbench' || !!cfgOf(f)?.funcs?.includes(REPAIR_BENCH_FUNC));
  return benches.find((f) => f.broken) || benches[0] || null;
}

// ------------------------------------------------------------------------------------ query helper
// `q` is passed to every content condition / text function.
export function query(state) {
  const st = ensureStory(state);
  const day = currentDay(state);
  const c = state.progress.counters;
  const base = st.promise.base || {};
  const since = (k) => Math.max(0, (c[k] || 0) - (base[k] || 0));
  const def = homeDef(state.home.id);
  return {
    state,
    day,
    hour: Math.floor(hourOfDay(state.clock)),
    character: state.meta.character,
    home: state.home.id,
    mode: state.meta.mode,
    ngPlus: isNgPlus(state),
    route: st.route,
    committedDay: st.committedDay ?? 0,
    finalWaveDay: finalWaveDay(state),
    tag: (t) => !!st.tags[t],
    flag: (k) => st.flags[k],
    started: (id) => !!st.quests[id],
    done: (id) => !!st.quests[id]?.done,
    fired: (id) => st.events[id]?.n || 0,
    has: (id, n = 1) => countIn(state, homeSources(state), id) >= n,
    count: (id) => countIn(state, homeSources(state), id),
    counter: (k) => c[k] || 0,
    since,
    hasLock: (area) => !!def.locks?.[area],
    unlocked: (area) => !!state.home.unlocked[area],
    repairs: (area) => state.home.repairs?.[area] || 0,
    repairsNeeded: (area) => state.home.repairsNeeded?.[area] ?? def.locks?.[area]?.repairs ?? 2,
    workbenchFixed: () => !!workbench(state) && !workbench(state).broken,
    manualAtHome: () => countIn(state, homeSources(state), MANUAL_ITEM) > 0,
    door: () => openings(state).door,
    doorReinforced: () => (openings(state).door?.reinforce || 0) > 0,
    planters: (floor) => planterCount(state, floor),
    heaters: (floor) => heaterCount(state, floor),
    allFloorsHeated: () => allFloorsHeated(state),
    warmth: () => warmth(state),
    thermostat: THERMOSTAT,
    floorLabel: (floor) => def.floors[floor]?.label || T(floor, floor),
    vases: () => vaseCount(state),
    homeSat: () => homeSatiety(state),
    homeItems: () => homeItemCount(state),
    storage: () => storageFurnitureCount(state),
    beacon: () => installedBeacon(state),
    beaconAnywhere: () => installedBeacon(state, true),
    recorder: () => installedRecorder(state),
    recorderAtHome: () => recorderAtHome(state),
    clues: (lineId) => (lineId ? clueCount(state, lineId) : state.story.clues.length),
    kit: () => countIn(state, homeSources(state), KIT_ITEM) > 0,
    hordeSoon: () => hordeSoon(state),
    hordeActive: () => hordeAttacking(state),
    status: (route) => routeStatus(state, route),
    openRoutes: () => ROUTE_ORDER.filter((r) => routeStatus(state, r).ok).map((r) => ROUTES[r].name),
    neighbor: () => neighborInfo(state),
    network: () => networkSurvivorsAlive(state),
    promise: () => st.promise,
    harvest: () => ({ flowers: since('plant.harvest.flower'), produce: since('plant.harvest.produce') }),
    memories: (n = 3) => (state.loop.memories || []).slice(-n).map((m) => m.text),
  };
}

const resolveText = (t, state, q) => (typeof t === 'function' ? t(state, q) : t);
const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : typeof v === 'object' ? Object.keys(v).filter((k) => v[k]) : [v]);
const asPairs = (v) => (Array.isArray(v?.[0]) ? v : v ? [v] : []);

// ------------------------------------------------------------------------------------ memories
// Knowledge memories carried across loops (state.loop.memories: { id, text {en, zh}, day, cycle }).
export function addMemory(state, id, text, day = currentDay(state)) {
  const list = (state.loop.memories ||= []);
  const cycle = state.loop.cycle || 1;
  const cur = list.find((m) => m.id === id);
  if (cur) {
    if (cur.cycle !== cycle) Object.assign(cur, { text, day, cycle });
    return cur;
  }
  const m = { id, text, day, cycle };
  list.push(m);
  return m;
}

// ------------------------------------------------------------------------------------ effects
const isMedicine = (cfg) => cfg?.cat === CAT.MEDICINE && !cfg.story && !String(cfg.id).startsWith('216');
const isFuelItem = (cfg) => cfg?.cat === CAT.FUEL;

function countMatching(state, pred) {
  let n = 0;
  for (const inv of homeInvs(state)) for (const it of inv.items) if (pred(item(it.id))) n += it.qty || 1;
  return n;
}

function takeMatching(state, pred, n) {
  let left = n;
  for (const inv of homeInvs(state)) {
    for (const it of [...inv.items]) {
      if (left <= 0) return n;
      if (!pred(item(it.id))) continue;
      const take = Math.min(left, it.qty || 1);
      it.qty = (it.qty || 1) - take;
      left -= take;
      if (it.qty <= 0) removeUid(inv, it.uid);
    }
  }
  return n - left;
}

// Hand over food worth `amount` satiety, cheapest items first. Returns the satiety given.
function takeFood(state, amount) {
  const cands = [];
  for (const inv of homeInvs(state)) {
    for (const it of inv.items) {
      const cfg = item(it.id);
      if (cfg?.cat === CAT.FOOD && cfg.sat > 0) cands.push({ inv, it, sat: cfg.sat * (cfg.uses > 1 ? (it.uses ?? cfg.uses) : 1) * (it.left ?? 1) });
    }
  }
  cands.sort((a, b) => a.sat - b.sat);
  let got = 0;
  for (const c of cands) {
    while (got < amount && findUid(c.inv, c.it.uid)) {
      got += c.sat;
      if ((c.it.qty || 1) > 1) c.it.qty -= 1;
      else removeUid(c.inv, c.it.uid);
    }
    if (got >= amount) break;
  }
  return got;
}

function damageDoor(state, delta) {
  const door = openings(state).door;
  if (!door) return 0;
  const before = door.hp;
  door.hp = Math.max(1, Math.min(effectiveMaxHp(door), door.hp + delta));
  if (door.hp < effectiveMaxHp(door) * 0.7) state.progress.taboo.doorWorn = true;
  return door.hp - before;
}

export function unlockRecipes(state, ids) {
  const list = (state.run.unlockedRecipes ||= []);
  const added = ids.filter((id) => !list.includes(id));
  list.push(...added);
  if (added.length) emit('recipesUnlocked', { ids: added });
  return added;
}

// Apply a declarative effects block (see content/events.js). Returns structured rewards for the UI.
export function applyEffects(state, eff, ctx = {}) {
  const rewards = ctx.rewards || [];
  const notes = ctx.notes || [];
  if (!eff) return rewards;
  const st = ensureStory(state);
  const day = currentDay(state);
  const c = state.progress.counters;
  if (eff.take) {
    consumeItems(state, eff.take);
    for (const [id, n] of eff.take) rewards.push({ kind: 'take', id, n });
  }
  if (eff.food) rewards.push({ kind: 'food', n: Math.round(takeFood(state, eff.food)) });
  if (eff.medicine) rewards.push({ kind: 'medicine', n: takeMatching(state, isMedicine, eff.medicine) });
  if (eff.fuel) rewards.push({ kind: 'fuel', n: takeMatching(state, isFuelItem, eff.fuel) });
  for (const [k, v] of Object.entries(eff.stats || {})) {
    const real = addStat(state, k, v, 'event');
    if (real) rewards.push({ kind: 'stat', key: k, value: Math.round(real * 10) / 10 });
  }
  for (const [k, v] of Object.entries(eff.max || {})) {
    raiseMax(state, k, v, 'event');
    rewards.push({ kind: 'max', key: k, value: v });
  }
  if (eff.items) {
    giveItems(state, eff.items);
    for (const [id, n] of eff.items) rewards.push({ kind: 'item', id, n });
  }
  if (eff.points) {
    state.loop.planningPoints = (state.loop.planningPoints || 0) + eff.points;
    state.run.eventPoints = (state.run.eventPoints || 0) + eff.points;
    rewards.push({ kind: 'points', n: eff.points });
  }
  for (const t of asList(eff.tags)) st.tags[t] = true;
  if (eff.flags) Object.assign(st.flags, eff.flags);
  for (const [k, v] of Object.entries(eff.promise || {})) st.promise[k] = (st.promise[k] || 0) + v;
  for (const [k, v] of Object.entries(eff.counters || {})) c[k] = (c[k] || 0) + v;
  for (const [id, h] of asPairs(eff.effect)) {
    addEffect(state, id, h);
    rewards.push({ kind: 'effect', id });
  }
  for (const id of eff.cure || []) removeEffect(state, id);
  if (eff.recipes) {
    const added = unlockRecipes(state, eff.recipes);
    if (added.length) rewards.push({ kind: 'recipes', ids: added });
  }
  for (const [k, v] of Object.entries(eff.prof || {})) addProfExp(state, k, v);
  if (eff.door) rewards.push({ kind: 'door', value: damageDoor(state, eff.door) });
  if (eff.kills) {
    state.progress.kills = (state.progress.kills || 0) + eff.kills;
    c['zombie.kill'] = (c['zombie.kill'] || 0) + eff.kills;
    rewards.push({ kind: 'kills', n: eff.kills });
  }
  if (eff.taboo) state.progress.taboo[eff.taboo] = true;
  if (eff.money) state.player.money += eff.money;
  if (eff.memory) addMemory(state, eff.memory.id, eff.memory.text, day);
  for (const area of asList(eff.unlock)) unlockArea(state, area);
  for (const id of asList(eff.quest)) if (startQuest(state, id)) rewards.push({ kind: 'quest', id });
  if (eff.chance) {
    const ch = eff.chance;
    if (rand(state) < ch.p) {
      applyEffects(state, ch.effects, { rewards, notes });
      if (ch.text) notes.push(ch.text);
    } else if (ch.else) {
      applyEffects(state, ch.else, { rewards, notes });
    }
  }
  if (eff.events) queueChain(state, eff.events);
  return rewards;
}

// ------------------------------------------------------------------------------------ events
export function eventDef(id) {
  return EVENT_BY_ID.get(id) || null;
}

function inHours(h, [from, to]) {
  return from <= to ? h >= from && h < to : h >= from || h < to;
}

// Story beats only play in the story. Random events carry on in Story Endless; Pure Endless only draws the
// ones marked `endless`, and in both endless modes those have no last day.
function modeAllows(state, e) {
  const mode = state.meta.mode;
  if (mode === 'story') return true;
  if (!(e.weight > 0)) return false;
  return mode === 'endless' || (mode === 'pureEndless' && !!e.endless);
}

function lastDay(state, e) {
  if (e.endless && state.meta.mode !== 'story') return Infinity;
  return e.dayRange ? e.dayRange[1] : (e.until ?? Infinity);
}

function isPending(state, id) {
  const st = state.story;
  return st.active?.id === id || st.pending.some((p) => p.id === id);
}

function charOk(state, e) {
  return !e.characters || e.characters.includes(state.meta.character);
}

export function eventEligible(state, q, e) {
  if (e.manual || !modeAllows(state, e) || !charOk(state, e)) return false;
  const rec = state.story.events[e.id];
  const once = e.once ?? true;
  if (once && rec) return false;
  if (!once && rec && e.cooldown && q.day - rec.day < e.cooldown) return false;
  const start = q.ngPlus && e.dayNg != null ? e.dayNg : e.dayRange ? e.dayRange[0] : (e.day ?? 1);
  if (q.day < start || q.day > lastDay(state, e)) return false;
  const hour = q.ngPlus && e.hourNg != null ? e.hourNg : e.hour;
  if (hour != null && (q.day === start || !once) && q.hour < hour) return false;
  if (e.hours && !inHours(q.hour, e.hours)) return false;
  if (e.when && !e.when(state, q)) return false;
  return !isPending(state, e.id);
}

// Add an event to the queue (bypasses its trigger conditions). Returns false if already queued.
export function queueEvent(state, id, { front = false } = {}) {
  const st = ensureStory(state);
  if (!eventDef(id) || isPending(state, id)) return false;
  const day = currentDay(state);
  st.events[id] = { n: (st.events[id]?.n || 0) + 1, day };
  const entry = { id, day };
  if (front) st.pending.unshift(entry);
  else st.pending.push(entry);
  return true;
}

// Alias used by tests and other systems: queue and try to present right away.
export function fireEvent(state, id) {
  const ok = queueEvent(state, id, { front: true });
  if (ok) presentNext(state);
  return ok;
}

// Queue a chain of response events (e.g. the Day 70 answers), skipping ones for other characters.
function queueChain(state, ids) {
  const q = query(state);
  const eligible = ids.filter((id) => {
    const e = eventDef(id);
    return e && charOk(state, e) && (!e.when || e.when(state, q));
  });
  for (const id of eligible.reverse()) queueEvent(state, id, { front: true });
}

function pickRandomEvent(state, q) {
  const pool = EVENTS.filter((e) => e.weight > 0 && eventEligible(state, q, e));
  if (!pool.length) return null;
  return weighted(
    state,
    pool.map((e) => [e, e.weight])
  );
}

export function randomPool(state) {
  const q = query(state);
  return EVENTS.filter((e) => e.weight > 0 && eventEligible(state, { ...q, hour: 12 }, { ...e, hours: null }));
}

export function activeEvent(state) {
  return state.story?.active || null;
}

// Show the next queued event if the survivor is at home and no horde is breaking in.
export function presentNext(state) {
  const st = ensureStory(state);
  if (st.active || !st.pending.length || state.phase !== 'post') return null;
  const def = eventDef(st.pending[0].id);
  if (!def) {
    st.pending.shift();
    return presentNext(state);
  }
  if (state.player.scene !== 'home') return null;
  if (hordeAttacking(state) && !def.urgent) return null;
  if (def.skipIf?.(state, query(state))) {
    st.pending.shift();
    return presentNext(state);
  }
  const next = st.pending.shift();
  st.active = { id: next.id, day: next.day, openedT: state.clock.t, left: def.countdown ?? null };
  emit('openPanel', { panel: 'event', eventId: next.id });
  return st.active;
}

function choiceAvailability(state, choice) {
  const e = choice.effects || {};
  if (e.take) {
    const miss = e.take.find(([id, n]) => countIn(state, homeSources(state), id) < n);
    if (miss) return { ok: false, reason: pickLang({ en: `Needs ${miss[1]}× ${itemName(miss[0])}`, zh: `需要${itemName(miss[0])}×${miss[1]}` }) };
  }
  if (e.food && homeSatiety(state) < e.food) return { ok: false, reason: pickLang({ en: `Needs food worth ${e.food} Satiety`, zh: `需要约${e.food}饱腹的食物` }) };
  if (e.medicine && countMatching(state, isMedicine) < e.medicine) return { ok: false, reason: pickLang({ en: 'Needs medicine', zh: '需要药品' }) };
  if (e.fuel && countMatching(state, isFuelItem) < e.fuel) return { ok: false, reason: pickLang({ en: 'Needs fuel', zh: '需要燃料' }) };
  return { ok: true, reason: null };
}

function eventChoices(state, def, q) {
  const list = def.choices?.length ? def.choices : [{ label: T('Continue', '继续'), default: true }];
  return list
    .map((choice, index) => ({ index, choice, visible: !choice.when || choice.when(state, q), ...choiceAvailability(state, choice) }))
    .filter((c) => c.visible);
}

function defaultChoice(choices) {
  return choices.find((c) => c.choice.default && c.ok) || choices.find((c) => c.ok) || null;
}

// UI-facing snapshot of the active event: texts stay { en, zh } so the panel can localize.
export function eventView(state) {
  const act = state.story?.active;
  if (!act) return null;
  const def = eventDef(act.id);
  if (!def) return null;
  const q = query(state);
  const choices = eventChoices(state, def, q);
  const dflt = defaultChoice(choices);
  return {
    id: act.id,
    title: def.itemTitle ? itemName(def.itemTitle) : resolveText(def.title, state, q),
    text: resolveText(def.text, state, q),
    image: def.image || 'house',
    countdown: def.countdown ?? null,
    left: act.left,
    choices: choices.map((c) => ({ index: c.index, label: c.choice.label, ok: c.ok, reason: c.reason, isDefault: c === dflt })),
  };
}

// Resolve the active event with a choice (null or an unavailable choice falls back to the default).
export function resolveEvent(state, index = null) {
  const st = ensureStory(state);
  const act = st.active;
  if (!act) return null;
  const def = eventDef(act.id);
  const q = query(state);
  const choices = def ? eventChoices(state, def, q) : [];
  const pick = choices.find((c) => c.index === index && c.ok) || defaultChoice(choices);
  st.active = null;
  const rewards = [];
  const notes = [];
  if (pick) applyEffects(state, pick.choice.effects, { rewards, notes });
  const result = {
    id: act.id,
    choice: pick?.index ?? null,
    auto: index == null,
    text: pick?.choice.result ? resolveText(pick.choice.result, state, q) : null,
    notes,
    rewards,
  };
  st.history.push({ id: act.id, day: q.day, choice: result.choice });
  if (st.history.length > 300) st.history.splice(0, st.history.length - 300);
  st.lastResult = result;
  return result;
}

// Countdown choices (patch 09-08): the UI ticks real seconds; at zero the default choice is taken.
export function tickEventCountdown(state, seconds) {
  const act = state.story?.active;
  if (!act || act.left == null) return null;
  act.left = Math.max(0, act.left - seconds);
  return act.left <= 0 ? resolveEvent(state, null) : null;
}

// Resolve everything queued with default choices (headless simulation, tests).
export function drainEvents(state) {
  const out = [];
  let guard = 0;
  while (guard++ < 100) {
    if (!state.story.active && !presentNext(state)) break;
    out.push(resolveEvent(state, null));
  }
  return out;
}

// ------------------------------------------------------------------------------------ quests
export function questDef(id) {
  return QUESTS[id] || null;
}

export function questTitle(state, id) {
  const def = QUESTS[id];
  return def ? resolveText(def.title, state, query(state)) : T(id, id);
}

function targetOf(def, state, q) {
  return typeof def.target === 'function' ? def.target(state, q) : (def.target ?? 1);
}

export function startQuest(state, id) {
  const st = ensureStory(state);
  const def = QUESTS[id];
  if (!def || st.quests[id] || state.meta.mode !== 'story') return false;
  const q = query(state);
  if (def.characters && !def.characters.includes(q.character)) return false;
  if (def.applies && !def.applies(state, q)) return false;
  st.quests[id] = { stage: 0, progress: 0, done: false, started: q.day, deadlineDay: def.deadlineDay ?? null };
  return true;
}

export function completeQuest(state, id, q = query(state)) {
  const def = QUESTS[id];
  const qs = state.story.quests[id];
  if (!def || !qs || qs.done) return false;
  qs.done = true;
  qs.doneDay = q.day;
  qs.progress = targetOf(def, state, q);
  if (def.onDone) applyEffects(state, def.onDone);
  if (def.reward) applyEffects(state, def.reward);
  const title = pickLang(resolveText(def.title, state, q));
  const pts = def.reward?.points;
  emit('toast', {
    text: `${pickLang({ en: 'Objective complete', zh: '目标完成' })}: ${title}${pts ? ` (+${pts} ${pickLang({ en: 'Planning Points', zh: '生存点' })})` : ''}`,
    kind: 'good',
  });
  return true;
}

function updateQuests(state, q) {
  const st = state.story;
  for (const [id, def] of Object.entries(QUESTS)) {
    if (!st.quests[id] && def.auto && (!def.characters || def.characters.includes(q.character)) && def.auto(state, q)) startQuest(state, id);
    const qs = st.quests[id];
    if (!qs || qs.done) continue;
    qs.progress = def.progress ? def.progress(state, q) : 0;
    qs.stage = qs.progress;
    const done = def.done ? def.done(state, q) : qs.progress >= targetOf(def, state, q);
    if (done) completeQuest(state, id, q);
  }
}

// ------------------------------------------------------------------------------------ quest actions
function queued(state, key) {
  const all = [state.actions.current, ...state.actions.queue].filter(Boolean);
  return all.some((a) => a.storyKey === key);
}

function daysSinceOutbreak(state) {
  return state.phase === 'pre' ? 0 : Math.floor((state.clock.t - state.clock.outbreakAt) / DAY) + 1;
}

function findPackage(state, itemId) {
  for (const invId of planningSources(state)) {
    const inst = state.inventories[invId]?.items.find((it) => it.id === itemId);
    if (inst) return { invId, uid: inst.uid };
  }
  return null;
}

function freeSlotFor(state, furnCfg, floor) {
  const need = furnDef(furnCfg)?.slot;
  return allSlots(state).find((s) => (!floor || s.floor === floor) && !state.home.slots[s.id] && !s.trap && slotAccepts(s.type, need) && slotUsable(state, s)) || null;
}

const say = (text, kind = 'info') => emit('toast', { text: pickLang(text), kind });

const ACTIONS = {
  repairStairs(state) {
    if (state.home.unlocked['2F'] || queued(state, 'repairStairs')) return null;
    const tile = homeDef(state.home.id).floors['1F']?.stairsUp;
    const spec = FUNC_SPECS[1730];
    if (!tile) return null;
    return enqueue(state, { kind: 'unlockArea', storyKey: 'repairStairs', label: pickLang(T('Repair the stairs', '修复楼梯')), target: { floor: '1F', x: tile[0], y: tile[1] }, dur: spec.min * 60, cost: spec.cost, spec });
  },
  repairBasement(state) {
    if (state.home.unlocked.B1 || queued(state, 'repairBasement')) return null;
    if (dailyCount(state, 'story:repairBasement') >= 1) {
      say(T('You have done all you can down there today.', '今天能做的都做了。'));
      return null;
    }
    const tile = homeDef(state.home.id).floors['1F']?.stairsDown;
    const spec = FUNC_SPECS[1731];
    if (!tile) return null;
    return enqueue(state, {
      kind: 'unlockArea',
      storyKey: 'repairBasement',
      label: pickLang(T('Clear the basement entrance', '清理地下室入口')),
      target: { floor: '1F', x: tile[0], y: tile[1] },
      dur: spec.min * 60,
      cost: spec.cost,
      spec,
      dailyKey: 'story:repairBasement',
    });
  },
  workbench(state) {
    const wb = workbench(state);
    if (!wb?.broken || queued(state, 'workbench')) return null;
    if (hasItems(state, [[MANUAL_ITEM, 1]])) {
      const spec = SCENERY_SPECS.repairWorkbench;
      return enqueue(state, { kind: 'repairWorkbench', storyKey: 'workbench', label: pickLang(T('Repair the workbench', '修理工作台')), target: { furn: wb.uid }, furn: wb.uid, dur: spec.min * 60, cost: spec.cost, spec });
    }
    if (daysSinceOutbreak(state) >= 6) {
      const spec = FUNC_SPECS[249];
      return enqueue(state, { kind: 'studyWorkbench', storyKey: 'workbench', label: pickLang(T('Study the mechanism', '钻研构造')), target: { furn: wb.uid }, furn: wb.uid, dur: spec.min * 60, cost: spec.cost, spec });
    }
    say(T('The manual must be in one of the cabinets. Or give it until Day 6 and work it out yourself.', '手册应该在哪个柜子里。或者等到第6天，自己琢磨。'));
    return null;
  },
  beacon(state) {
    if (installedBeacon(state)) return ACTIONS.checkBeacon(state);
    const pkg = findPackage(state, MARKER_ITEM);
    if (pkg) {
      emit('openPanel', { panel: 'planning', installUid: pkg.uid, fromInv: pkg.invId });
      return null;
    }
    const wb = homeFurniture(state).find((f) => !f.broken && (f.cfg === 'workbench' || !!cfgOf(f)?.funcs?.includes(37)));
    if (wb) emit('openPanel', { panel: 'craft', furn: wb.uid });
    else say(T('Get the workbench working first.', '先把工作台修好。'));
    return null;
  },
  checkBeacon(state) {
    const b = installedBeacon(state, true);
    if (!b || queued(state, 'checkBeacon')) return null;
    const spec = FUNC_SPECS[2111];
    return enqueue(state, { kind: 'story', storyKey: 'checkBeacon', label: pickLang(T('Inspect Beacon', '检查信标')), target: { furn: b.uid }, furn: b.uid, dur: spec.min * 60, cost: spec.cost, spec });
  },
  myChoice() {
    emit('openPanel', { panel: 'routes' });
    return null;
  },
};

export function runQuestAction(state, id) {
  const def = QUESTS[id];
  if (!def?.action) return null;
  const key = typeof def.action === 'function' ? def.action(state, query(state)) : def.action;
  return ACTIONS[key]?.(state) ?? null;
}

// ------------------------------------------------------------------------------------ story kind
// Config funcs 36/42 (make / force-make the rescue marker), 38 (mount it: install on the 2F), 2111 (inspect).
function storyCheck(state, a) {
  switch (a.spec?.story) {
    case 'makeMark':
      return hasItems(state, MARK_MATS) ? true : pickLang(T('Needs the rescue marker blueprint, scrap paper, broken glass, waste plastic and sheet metal.', '需要救援标记图纸、废纸、碎玻璃、废塑料和铁皮。'));
    case 'forceMark':
      if (!state.story.quests.rescueBeacon) return pickLang(T('You have no idea what a rescue marker should look like.', '你还不知道救援标记该是什么样子。'));
      return hasItems(state, FORCE_MATS) ? true : pickLang(T('Needs 2× scrap paper, broken glass, waste plastic and sheet metal.', '需要废纸×2、碎玻璃、废塑料和铁皮。'));
    case 'installMark':
      if (!findPackage(state, MARKER_ITEM)) return pickLang(T('You have no rescue marker to put up.', '你没有可以安装的救援标记。'));
      return freeSlotFor(state, packageToFurniture[MARKER_ITEM], beaconFloor(state)) ? true : pickLang(T('No free spot upstairs for the marker.', '楼上没有空位放标记。'));
    case 'checkBeacon':
      return installedBeacon(state, true) ? true : pickLang(T('There is no beacon to inspect.', '没有可以检查的信标。'));
    default:
      return true;
  }
}

function storyComplete(state, a) {
  const st = state.story;
  const day = currentDay(state);
  switch (a.spec?.story) {
    case 'makeMark':
      consumeItems(state, MARK_MATS);
      giveItems(state, [[MARKER_ITEM, 1]]);
      break;
    case 'forceMark':
      consumeItems(state, FORCE_MATS);
      addStat(state, 'life', -18, 'forceMark');
      addStat(state, 'mor', -18, 'forceMark');
      giveItems(state, [[MARKER_ITEM, 1]]);
      break;
    case 'installMark': {
      const pkg = findPackage(state, MARKER_ITEM);
      const slot = pkg && freeSlotFor(state, packageToFurniture[MARKER_ITEM], beaconFloor(state));
      if (slot) queueInstall(state, pkg.invId, pkg.uid, slot.id);
      break;
    }
    case 'checkBeacon':
      st.flags.beaconChecks = (st.flags.beaconChecks || 0) + 1;
      addStat(state, 'mor', 2, 'beacon');
      if (st.route === 'evacuate' && st.flags.lastBeaconCheck !== day) {
        st.promise.inspections = (st.promise.inspections || 0) + 1;
        say(T(`Beacon inspected (${Math.min(3, st.promise.inspections)}/3).`, `信标检查完毕（${Math.min(3, st.promise.inspections)}/3）。`), 'good');
      }
      st.flags.lastBeaconCheck = day;
      break;
    default:
      break;
  }
}

registerKind('story', {
  canStart: storyCheck,
  complete: storyComplete,
  available: (state, f, spec) => (storyCheck(state, { spec }) === true ? true : 'hide'),
});

// ------------------------------------------------------------------------------------ routes
function line(ok, text) {
  return { ok: !!ok, text };
}

// Prerequisites of an ending route. check71 routes are only evaluated from Day 71 and latch once met.
export function routeStatus(state, route) {
  const st = ensureStory(state);
  const r = ROUTES[route];
  if (!r) return { ok: false, met: false, lines: [], locked: true };
  if (r.characters && !r.characters.includes(state.meta.character)) return { ok: false, met: false, lines: [], locked: true };
  const day = currentDay(state);
  const lines = [];
  switch (route) {
    case 'evacuate':
      lines.push(line(installedBeacon(state), T('A distress beacon stands on the second floor', '二楼装有求救信标')));
      break;
    case 'girl':
    case 'companion': {
      const nb = neighborInfo(state);
      const rescued = st.tags[`TAG_${nb.line}_RESCUE2_COMPLETE`] || nb.rescue >= 2;
      lines.push(line(nb.hearts >= 5, T(`Neighbor affinity ${Math.min(5, nb.hearts)}/5 hearts`, `邻居好感 ${Math.min(5, nb.hearts)}/5`)));
      lines.push(line(rescued, T('Two rescue tasks completed', '完成两次救助任务')));
      lines.push(line(!nb.dead, T('Your neighbor is alive', '邻居还活着')));
      break;
    }
    case 'stranger': {
      const n = networkSurvivorsAlive(state);
      lines.push(line(n >= 6 || st.tags.TAG_STRANGER_NETWORK_OK, T(`Supported survivors alive: ${n}/6`, `被支援的幸存者存活：${n}/6`)));
      break;
    }
    case 'fortress': {
      const { door, windows } = openings(state);
      const reinforce = [door, ...windows].filter(Boolean).reduce((a, f) => a + (f.reinforce || 0), 0);
      const minWin = windows.length ? Math.min(...windows.map((w) => w.hp)) : 0;
      const days = [];
      for (let d = 60; d <= Math.min(69, day - 1); d++) days.push(d);
      const powerOk = days.every((d) => st.powerChecks[d] >= 0.8) && (day > 69 || powerReserve(state) >= 0.8);
      lines.push(line(reinforce >= 600, T(`Door and window reinforcement ${Math.round(reinforce)}/600`, `门窗加固耐久 ${Math.round(reinforce)}/600`)));
      lines.push(line(door && door.hp >= 2000, T(`Front door durability ${Math.round(door?.hp || 0)}/2000`, `大门耐久 ${Math.round(door?.hp || 0)}/2000`)));
      lines.push(line(windows.length && minWin >= 1500, T(`Weakest window ${Math.round(minWin)}/1500`, `最弱窗户耐久 ${Math.round(minWin)}/1500`)));
      lines.push(line(furnCount(state, DEFENSE_FURN.spikes) >= 4, T(`Spike barriers ${furnCount(state, DEFENSE_FURN.spikes)}/4`, `尖刺障碍 ${furnCount(state, DEFENSE_FURN.spikes)}/4`)));
      lines.push(line(furnCount(state, DEFENSE_FURN.nets) >= 4, T(`Electric nets ${furnCount(state, DEFENSE_FURN.nets)}/4`, `电网 ${furnCount(state, DEFENSE_FURN.nets)}/4`)));
      lines.push(line(furnCount(state, DEFENSE_FURN.saws) >= 4, T(`Mechanical chainsaws ${furnCount(state, DEFENSE_FURN.saws)}/4`, `机械电锯 ${furnCount(state, DEFENSE_FURN.saws)}/4`)));
      lines.push(line(powerOk, T(`Power reserve ≥ 80% on Days 60–69 (now ${Math.round(powerReserve(state) * 100)}%)`, `第60–69天储电≥80%（当前${Math.round(powerReserve(state) * 100)}%）`)));
      break;
    }
    case 'truth':
      lines.push(line(st.tags.TAG_LINE_TRUTH_EXPLORED, T(`Hospital clues ${hospitalClueCount(state)}/3 and the recorder brought home`, `医院线索 ${hospitalClueCount(state)}/3，记录仪已带回家`)));
      lines.push(line(installedRecorder(state), T('The recorder is set up at home', '记录仪已在家中摆好')));
      break;
    case 'greenhouse': {
      const n = planterCount(state);
      lines.push(line(n >= 24, T(`Planters ${n}/24`, `种植容器 ${n}/24`)));
      break;
    }
    case 'supply': {
      const sat = Math.round(homeSatiety(state));
      const items = homeItemCount(state);
      const storage = storageFurnitureCount(state);
      lines.push(line(sat >= 1200, T(`Satiety in storage ${sat}/1200`, `储备饱腹 ${sat}/1200`)));
      lines.push(line(items >= 180, T(`Items ${items}/180`, `物资数量 ${items}/180`)));
      lines.push(line(storage >= 8, T(`Storage furniture ${storage}/8`, `储物设施 ${storage}/8`)));
      break;
    }
    default:
      break;
  }
  const met = lines.every((l) => l.ok);
  let ok = met;
  const latched = !!st.checks[route];
  if (r.check71) {
    ok = latched || (met && day >= ROUTE_CHECK_DAY);
    if (!latched && day < ROUTE_CHECK_DAY) lines.push(line(false, T(`Checked from Day ${ROUTE_CHECK_DAY}`, `第${ROUTE_CHECK_DAY}天起核查`)));
  }
  return { ok, met, lines, latched };
}

// Recompute state.story.commitAvailable (read by furnActions to show the commit functions).
export function updateRouteAvailability(state) {
  const st = ensureStory(state);
  const day = currentDay(state);
  const avail = {};
  if (!st.route && day <= COMMIT_DEADLINE_DAY && state.phase === 'post' && state.meta.mode === 'story') {
    for (const route of ROUTE_ORDER) {
      const s = routeStatus(state, route);
      if (ROUTES[route].check71 && s.met && day >= ROUTE_CHECK_DAY && !st.checks[route]) st.checks[route] = day;
      if (s.ok || st.checks[route]) avail[route] = true;
    }
  }
  st.commitAvailable = avail;
  return avail;
}

export function canCommit(state, route) {
  const st = ensureStory(state);
  if (!ROUTES[route]) return pickLang(T('Unknown path.', '未知的路线。'));
  if (st.route) return pickLang(T('You have already made your choice.', '你已经做出了选择。'));
  if (state.phase !== 'post' || state.meta.mode !== 'story') return pickLang(T('Not now.', '现在不行。'));
  if (currentDay(state) > COMMIT_DEADLINE_DAY) return pickLang(T(`It is too late to change course (deadline: Day ${COMMIT_DEADLINE_DAY}).`, `已经来不及了（截止：第${COMMIT_DEADLINE_DAY}天）。`));
  if (!routeStatus(state, route).ok) return pickLang(T('This path is not open.', '这条路还没有开放。'));
  if (!hasItems(state, [[KIT_ITEM, 1]])) return pickLang(T('Needs a Military Repair Kit.', '需要军用维修套件。'));
  return true;
}

// Stake the rest of the run on one route: consumes the kit, sets TAG_LINE_<ROUTE>_CHOSEN and the final wave day.
export function commitRoute(state, route) {
  const ok = canCommit(state, route);
  if (ok !== true) return ok;
  const st = state.story;
  const day = currentDay(state);
  const c = state.progress.counters;
  consumeItems(state, [[KIT_ITEM, 1]]);
  st.route = route;
  st.committedDay = day;
  st.tags[routeTagChosen(route)] = true;
  st.tags[`TAG_LINE_${route.toUpperCase()}_CHOSEN`] = true;
  c['route.committed'] = 1;
  st.finalWaveDay = ROUTES[route].finalWaveDay;
  st.commitAvailable = {};
  const base = {};
  for (const k of ['camp.prep.supply', 'plant.harvest', 'plant.harvest.flower', 'plant.harvest.produce', 'zombie.kill']) base[k] = c[k] || 0;
  st.promise = { base, rescue: 0, requests: 0, inspections: 0 };
  startQuest(state, `promise_${route}`);
  addMemory(state, 'route', T(`Committed to “${ROUTES[route].name.en}” on Day ${day}.`, `第${day}天承诺了「${ROUTES[route].name.zh}」这条路。`), day);
  queueEvent(state, `c_${route}`, { front: true });
  presentNext(state);
  return true;
}

// Where the kit gets used for a route: { furn } or a tile, or null (commit in place).
export function routeTarget(state, route) {
  const f = routeDevice(state, route);
  if (f) return { furn: f.uid };
  if (ROUTES[route]?.device === 'basket') {
    const def = homeDef(state.home.id);
    const fl = def.rooftopLine?.floor || '2F';
    const tile = def.floors[fl]?.basket;
    if (tile && state.home.unlocked[fl]) return { floor: fl, x: tile[0], y: tile[1] };
  }
  return null;
}

export function routeDevice(state, route) {
  const furnitureList = homeFurniture(state);
  switch (ROUTES[route]?.device) {
    case 'beacon':
      return installedBeacon(state);
    case 'basket':
      return furnitureList.find((f) => BASKET_FURN.includes(f.cfg) || f.cfg === 'basket') || null;
    case 'drone':
      return furnitureList.find((f) => DRONE_FURN.includes(f.cfg) || cfgOf(f)?.funcs?.includes(2117)) || null;
    case 'door':
      return openings(state).door;
    case 'recorder':
      return installedRecorder(state);
    case 'planter':
      return furnitureList.find((f) => cfgOf(f)?.plant > 0) || null;
    default:
      return null;
  }
}

// Queue the commitment action at the route's device (used by the objective / routes panel).
export function startCommit(state, route) {
  const ok = canCommit(state, route);
  if (ok !== true) {
    emit('toast', { text: ok, kind: 'bad' });
    return null;
  }
  const r = ROUTES[route];
  const spec = { ...(FUNC_SPECS[r.func] || { kind: 'commit', min: 60 }), route };
  const target = routeTarget(state, route);
  return enqueue(state, { kind: 'commit', label: pickLang(r.promise), target, furn: target?.furn, dur: (spec.min || 0) * 60, spec, route, noWalk: !target });
}

registerKind('commit', {
  canStart: (state, a) => canCommit(state, a.spec?.route ?? a.route),
  complete(state, a) {
    const res = commitRoute(state, a.spec?.route ?? a.route);
    if (res !== true) emit('toast', { text: res, kind: 'bad' });
  },
  available: (state, f, spec) => (state.story?.commitAvailable?.[spec.route] ? true : 'hide'),
});

// ------------------------------------------------------------------------------------ world polling
// Per-line clue counters (the config's `clue` counter is scoped to one line per achievement): the hospital's
// three records, the four truth clues (Puzzle: those three plus one truth document — the torn patient register
// from the office ruins or the veteran's letter) and the delivery slips.
function noteClue(state, id) {
  const st = state.story;
  if (!CLUES[id] || st.clues.includes(id)) return false;
  st.clues.push(id);
  noteDocument(state, id);
  const c = state.progress.counters;
  c['clue.hospital'] = hospitalClueCount(state);
  c['clue.truth'] = c['clue.hospital'] + Math.min(1, clueCount(state, 'truth'));
  c['clue.slip'] = clueCount(state, 'slip');
  c.clue = c['clue.truth'];
  queueEvent(state, `clue_${id}`);
  return true;
}

function collectClues(state) {
  const sources = planningSources(state);
  for (const key of Object.keys(CLUES)) {
    const id = Number(key);
    if (countIn(state, sources, id) > 0) noteClue(state, id);
  }
}

on('storyItemClaimed', ({ state, id }) => {
  if (state?.story) noteClue(state, id);
});

// ------------------------------------------------------------------------------------ documents
// Documents read this run (a clue's popup on arrival, anything read from the backpack), in reading order.
export function documentList(state) {
  return (state.story?.docs || []).filter((id) => documentText(id));
}

function noteDocument(state, id) {
  const docs = ensureStory(state).docs;
  if (!documentText(id) || docs.includes(id)) return false;
  docs.push(id);
  return true;
}

on('document', ({ id } = {}) => {
  const state = active;
  if (!state?.story) return;
  noteDocument(state, id);
  if (id === ENVELOPE.item && !state.story.flags.envelopeOpened) {
    state.story.flags.envelopeOpened = true;
    giveItems(state, ENVELOPE.notes.map((n) => [n, 1]));
  }
});

// The prologue's envelope in your own handwriting (A05): in the backpack on the morning of every story loop.
function placeEnvelope(state) {
  const st = state.story;
  if (state.meta.mode !== 'story' || state.phase !== 'pre' || st.flags.envelopePlaced) return;
  st.flags.envelopePlaced = true;
  giveItems(state, [[ENVELOPE.item, 1]]);
}

function pollWorld(state, q) {
  const st = state.story;
  const atHome = state.player.scene === 'home';
  const def = homeDef(state.home.id);
  for (const area of ['2F', 'B1']) {
    if (def.floors[area] && state.home.unlocked[area]) st.tags[`TAG_FLOOR_${area}_UNLOCKED`] = true;
  }
  for (const [area, lock] of Object.entries(def.locks || {})) {
    if (!lock.item || state.home.unlocked[area] || !atHome || !hasItems(state, [[lock.item, 1]])) continue;
    unlockArea(state, area);
    say(T(`The key fits. ${itemName(lock.item)} opened the lock.`, `钥匙对上了，${itemName(lock.item)}打开了门锁。`), 'good');
  }
  if (atHome) collectClues(state);
  if (!st.tags.TAG_LINE_TRUTH_EXPLORED && hospitalClueCount(state) >= 3 && recorderAtHome(state)) {
    st.tags.TAG_LINE_TRUTH_EXPLORED = true;
    queueEvent(state, 's_truthExplored');
    addMemory(state, 'truth', T('The three hospital record fragments and the recorder open the Truth path.', '三份医院病历碎片加上记录仪，就能走“真相”这条路。'), q.day);
  }
  if (!st.flags.kitSeen && atHome && hasItems(state, [[KIT_ITEM, 1]])) {
    st.flags.kitSeen = q.day;
    queueEvent(state, 's_kit');
    addMemory(state, 'kit', T(`A Military Repair Kit turned up on Day ${q.day}. It has parts for exactly one device.`, `第${q.day}天拿到了军用维修套件，只够改装一台设备。`), q.day);
  }
  if (state.power?.grid === false && !st.flags.blackoutDay) {
    st.flags.blackoutDay = q.day;
    queueEvent(state, 's_blackout');
    addMemory(state, 'blackout', T(`The city grid failed on Day ${q.day}.`, `第${q.day}天全城停电。`), q.day);
  }
  for (const c of state.crises?.active || []) {
    if (c.type === 'horde') addMemory(state, c.id || `horde:${q.day}`, T(`A horde attacked on Day ${q.day}.`, `第${q.day}天有尸潮来袭。`), q.day);
    if (c.type === 'coldWave') {
      if (st.flags.coldWaveDay == null || q.day - st.flags.coldWaveDay > 3) addMemory(state, `coldWave:${q.day}`, T(`A cold wave arrived on Day ${q.day}.`, `第${q.day}天寒潮来袭。`), q.day);
      st.flags.coldWaveDay = q.day;
    }
  }
}

function samplePower(state, q, hour) {
  if (q.day < 60 || q.day > 69 || (hour !== 12 && hour !== 23)) return;
  const st = state.story;
  st.powerChecks[q.day] = Math.min(st.powerChecks[q.day] ?? 1, powerReserve(state));
}

// The workbench manual is somewhere in the house (not in the fridge); found by searching the cabinets.
function placeManual(state) {
  const st = state.story;
  const wb = workbench(state);
  if (!wb?.broken || st.flags.manualPlaced || countIn(state, planningSources(state), MANUAL_ITEM) > 0) return;
  const inst = makeInstance(state, MANUAL_ITEM);
  const rank = (f) => (f.cfg === 10004 ? 0 : f.floor === wb.floor ? 1 : 2);
  const spots = homeFurniture(state)
    .filter((f) => f.inv && state.inventories[f.inv] && !state.inventories[f.inv].cold && !state.inventories[f.inv].special && state.home.unlocked[f.floor])
    .sort((a, b) => rank(a) - rank(b));
  for (const f of spots) {
    if (insert(state.inventories[f.inv], inst, { allowOverweight: true })) {
      st.flags.manualPlaced = f.uid;
      return;
    }
  }
  dropToFloor(state, inst, wb.floor, wb.x, wb.y);
  st.flags.manualPlaced = 'floor';
}

// ------------------------------------------------------------------------------------ system
registerSystem({
  id: 'story',
  order: 80,
  init(state) {
    active = state;
    const st = ensureStory(state);
    setupHome(state);
    if (isNgPlus(state)) {
      st.tags.advancedReinforce = true;
      st.tags.trapsUnlocked = true;
    }
    placeEnvelope(state);
  },
  ensure(state) {
    ensureStory(state);
    setupHome(state);
  },
  onOutbreak(state) {
    active = state;
    ensureStory(state);
    placeManual(state);
    startQuest(state, 'firstNight');
    if (isNgPlus(state)) for (const id of ['repairStairs', 'repairBasement', 'workbench', 'frontDoor', 'traps']) startQuest(state, id);
  },
  tick(state) {
    active = state;
  },
  onHour(state, hour) {
    active = state;
    if (state.phase !== 'post') return;
    const st = ensureStory(state);
    const q = query(state);
    pollWorld(state, q);
    if (state.meta.mode === 'story') {
      samplePower(state, q, hour);
      updateQuests(state, q);
      updateRouteAvailability(state);
      for (const e of EVENTS) if (!(e.weight > 0) && eventEligible(state, q, e)) queueEvent(state, e.id);
    }
    if (st.random?.day === q.day && hour === st.random.hour) {
      st.random = null;
      const e = pickRandomEvent(state, q);
      if (e) queueEvent(state, e.id);
    }
    if (st.active && state.clock.t - st.active.openedT > STALE_SECONDS) resolveEvent(state, null);
    presentNext(state);
  },
  onDay(state, day) {
    if (state.phase !== 'post') return;
    const st = ensureStory(state);
    st.random = rand(state) < (day < 10 ? 0.4 : 0.65) ? { day, hour: randInt(state, 8, 23) } : null;
    if (day === RECKONING_DAY && state.meta.mode === 'story') {
      st.tags.TAG_RECKONING = true;
      updateRouteAvailability(state);
    }
  },
});

on('story', ({ id } = {}) => {
  const state = active;
  if (!state?.story || state.phase !== 'post') return;
  if (id === 'antenna' && !state.story.tags.TAG_ANTENNA) {
    state.story.tags.TAG_ANTENNA = true;
    queueEvent(state, 's_antenna');
  }
  if (id === 'rubbleCleared') state.progress.counters['rubble.cleared'] = (state.progress.counters['rubble.cleared'] || 0) + 1;
});

// Produce portions for the Greenhouse promise (farming counts harvests and flowers, not portions).
on('harvested', ({ items } = {}) => {
  const state = active;
  if (!state?.progress || !Array.isArray(items)) return;
  const n = items.filter((id) => item(id)?.cat === CAT.FOOD).length;
  if (n) state.progress.counters['plant.harvest.produce'] = (state.progress.counters['plant.harvest.produce'] || 0) + n;
});

// ------------------------------------------------------------------------------------ objectives
const escapeTip = (s) => String(s).replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]);

registerObjectives((state) => {
  if (!state.story || state.phase !== 'post') return [];
  const st = state.story;
  const q = query(state);
  const out = [];
  const waiting = st.active || st.pending[0];
  if (waiting) {
    const def = eventDef(waiting.id);
    const title = def?.itemTitle ? itemName(def.itemTitle) : pickLang(resolveText(def?.title, state, q));
    out.push({
      id: 'event',
      text: `📨 ${title}`,
      urgent: true,
      tip: escapeTip(pickLang(T('An event is waiting for you. Click to open it.', '有事件等你处理，点击打开。'))),
      onClick: () => (st.active ? emit('openPanel', { panel: 'event', eventId: st.active.id }) : presentNext(state)),
    });
  }
  if (state.meta.mode !== 'story') return out;
  const entries = [];
  for (const [id, qs] of Object.entries(st.quests)) {
    const def = QUESTS[id];
    if (!def) continue;
    if (qs.done && (def.hideDone || q.day > qs.doneDay)) continue;
    if (!qs.done && def.applies && !def.applies(state, q)) continue;
    if (!qs.done && qs.deadlineDay && q.day > qs.deadlineDay) continue;
    const target = targetOf(def, state, q);
    const custom = def.prog ? resolveText(def.prog(state, q), state, q) : null;
    const prog = qs.done ? null : custom ? pickLang(custom) : target > 1 ? `${Math.min(qs.progress, target)}/${target}` : null;
    const desc = def.desc ? pickLang(resolveText(def.desc, state, q)) : '';
    const memo = q.ngPlus && def.memo ? `<br><span class="dim">${escapeTip(pickLang(def.memo))}</span>` : '';
    const deadline = qs.deadlineDay ? `<br>${escapeTip(pickLang(T(`Deadline: Day ${qs.deadlineDay}`, `截止：第${qs.deadlineDay}天`)))}` : '';
    entries.push({
      id,
      text: `${qs.done ? '✔ ' : ''}${pickLang(resolveText(def.title, state, q))}`,
      prog,
      done: qs.done,
      urgent: !qs.done && !!qs.deadlineDay && qs.deadlineDay - q.day <= 1,
      tip: desc || memo || deadline ? `${escapeTip(desc)}${memo}${deadline}` : null,
      onClick: def.action && !qs.done ? () => runQuestAction(state, id) : null,
    });
  }
  entries.sort((a, b) => Number(b.urgent) - Number(a.urgent) || Number(a.done) - Number(b.done));
  return [...out, ...entries];
});

// One smart suggestion for a story task that can be done right now.
registerSuggestions((state) => {
  if (state.phase !== 'post' || !state.story || state.player.scene !== 'home') return null;
  const quests = state.story.quests;
  const pick = (id, label, ok) => (quests[id] && !quests[id].done && ok ? [{ id: `story:${id}`, label: pickLang(label), run: () => runQuestAction(state, id) }] : null);
  return (
    pick('repairStairs', T('Repair the stairs', '修复楼梯'), hasItems(state, [[20106, 2]]) && !queued(state, 'repairStairs')) ||
    pick('repairBasement', T('Clear the basement entrance', '清理地下室入口'), dailyCount(state, 'story:repairBasement') < 1 && !queued(state, 'repairBasement')) ||
    pick('workbench', T('Fix the workbench', '修好工作台'), (hasItems(state, [[MANUAL_ITEM, 1]]) || daysSinceOutbreak(state) >= 6) && !queued(state, 'workbench'))
  );
});
