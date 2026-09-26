// @ts-check
// Furniture functions at home, run the way the furniture menu runs them: the piece placed (a starter piece, installed
// into a slot that takes it, or — for a piece with no slot type the homes do not place yet — stood in a free slot),
// the situation the function is for set up, then furnitureFunctions + startFurnitureFunction and the clock ticked
// until the action completes. What the action did is recorded for the test to assert on: stat changes (the 'stat'
// events the sim emits, by source), cap raises, panels opened, item counts before and after, the piece afterwards.
import { newGame } from '../../../src/sim/state.js';
import { tick, outbreak } from '../../../src/sim/tick.js';
import { isIdle, cancelAll } from '../../../src/sim/actions.js';
import { furnitureFunctions, startFurnitureFunction, queuePanelFunction } from '../../../src/sim/furnActions.js';
import { homeFurniture, installFurniture, removeFurniture, furnitureAt, createFurniture, allSlots, doorAndWindows, effectiveMaxHp, dismantle, homeFloors, dropNewItem } from '../../../src/sim/home.js';
import { slotsFor } from '../../../src/sim/planning.js';
import { addItem, createInventory } from '../../../src/sim/inventory.js';
import { dayNumber, dayStartT } from '../../../src/sim/time.js';
import { damageCircuit, fuelInventory, setBurner } from '../../../src/sim/power.js';
import { nextHorde, startThugs } from '../../../src/sim/horde.js';
import * as story from '../../../src/sim/story.js';
import * as social from '../../../src/sim/social.js';
import * as cooking from '../../../src/sim/cooking.js';
import * as farming from '../../../src/sim/farming.js';
import { placeRecord } from '../../../src/meta/profile.js';
import { furn, func, ELEC } from '../../../src/data/db.js';
import { FUNC_SPECS, parsePreview } from '../../../src/content/funcSpecs.js';
import { HOMES } from '../../../src/content/homes.js';
import { on } from '../../../src/engine/bus.js';
import { seedRng } from '../../../src/engine/rng.js';
import '../../../src/sim/itemuse.js';
import '../../../src/sim/weather.js';
import '../../../src/sim/crafting.js';
import '../../../src/sim/predisaster.js';
import '../../../src/sim/traps.js';
import '../../../src/sim/wishes.js';
import '../../../src/sim/unlocks.js';
import '../../../src/sim/phone.js';
import '../../../src/sim/explore.js';
import '../../../src/sim/endings.js';

// src/meta/profile.js pulls in the UI panels, whose 'openPanel' listeners read the page's game state; headless they
// throw and the bus logs every failure. Those lines are left out, nothing else (as tools/coverage/sim.mjs does).
const consoleError = console.error;
console.error = (...a) => (typeof a[0] === 'string' && a[0].startsWith('listener for openPanel failed') ? undefined : consoleError(...a));

export const HOUR = 3600;
export const CHARACTERS = ['wage', 'student', 'warehouse'];
const SPROUT = 15024; // spinach seeds: the quickest real crop
const MARK = [9003, 20001, 20001, 20002, 20003, 20004]; // the rescue marker blueprint and scrap
const NOTE = 9014; // the truck note that starts the Warehouse Manager line

/** @param {any} s */
export function keepAlive(s) {
  Object.assign(s.player.stats, { sat: 60, sta: 60, mor: 50, life: 80 });
  for (const k of Object.keys(s.player.effects || {})) if (/^(110\d|insomnia|breakdown|mentalBlock|hungry|exhausted|depressed|encumbered)$/.test(k)) delete s.player.effects[k];
}

/** A run before the outbreak, or after it at 21:00 on Day 1 (the outbreak transition itself). @returns {any} */
export function run(character = 'wage', phase = 'post', seed = 7) {
  const s = /** @type {any} */ (newGame({ seed, character, mode: 'story', skipPrologue: true }));
  if (phase === 'post') {
    s.clock.t = s.clock.outbreakAt;
    outbreak(s);
    s.clock.t += 3 * HOUR;
    s.run.day = dayNumber(s.clock);
  }
  for (const area of [...Object.keys(s.home.unlocked), ...Object.keys(/** @type {Record<string, any>} */ (HOMES)[s.home.id]?.locks || {}), '1F', '2F', 'B1']) s.home.unlocked[area] = true;
  s.progress.prof.defense.lv = Math.max(s.progress.prof.defense.lv, 5);
  keepAlive(s);
  return s;
}

/** @param {any} s @param {number} id @param {number} [n] */
export function give(s, id, n = 1) {
  const bp = s.inventories[s.player.backpack];
  for (let i = 0; i < n; i++) addItem(s, bp, id, { allowOverweight: true });
}

/** @param {any} s @returns {Map<number, number>} item id -> units in every inventory of the run */
export function countItems(s) {
  const m = new Map();
  for (const inv of Object.values(s.inventories)) for (const it of /** @type {any} */ (inv).items || []) m.set(it.id, (m.get(it.id) || 0) + (it.qty || 1));
  return m;
}

/**
 * Put the piece in the home: the one already there, installed into a slot that takes it (what stands there taken out
 * first when every such slot is taken), or, for a piece with no slot type, stood in a free slot (standIn).
 * @param {any} s @param {number} cfg
 * @returns {{ f: any, how: 'home' | 'installed' | 'standIn' } | null}
 */
export function placePiece(s, cfg) {
  const here = homeFurniture(s).find((f) => f.cfg === cfg);
  if (here) return { f: here, how: 'home' };
  for (const slot of slotsFor(s, cfg)) {
    const r = /** @type {any} */ (installFurniture(s, cfg, slot.id));
    if (r.ok) return { f: r.f, how: 'installed' };
  }
  for (const slot of slotsFor(s, cfg, { includeOccupied: true })) {
    const old = furnitureAt(s, slot.id);
    if (old) removeFurniture(s, old.uid);
    const r = /** @type {any} */ (installFurniture(s, cfg, slot.id));
    if (r.ok) return { f: r.f, how: 'installed' };
  }
  if (furn(cfg)?.slot) return null;
  const slots = /** @type {any[]} */ (allSlots(s));
  const free = slots.find((x) => !s.home.slots[x.id] && x.floor === '1F') || slots.find((x) => !s.home.slots[x.id]);
  return free ? { f: createFurniture(s, cfg, free.id), how: 'standIn' } : null;
}

/** The spec the furniture menu uses for a function: its own, or the stat spec derived from its preview. @param {number} key */
export function specOf(key) {
  const own = /** @type {Record<number, any>} */ (FUNC_SPECS)[key];
  if (own) return own;
  const pv = parsePreview(func(key)?.preview);
  return { kind: 'stat', min: 30, ...pv };
}

/** Set up what the function is for. @param {any} s @param {any} f @param {number} key */
export function prepare(s, f, key) {
  const spec = specOf(key);
  for (const [id, n] of spec.need || []) give(s, id, n * 2);
  if (spec.tool) give(s, spec.tool, 1);
  const op = spec.op;
  switch (spec.kind) {
    case 'sleep':
      s.clock.t = dayStartT(s.clock, Math.max(2, dayNumber(s.clock) + 1)) - 1 * HOUR;
      s.player.stats.sta = 40;
      break;
    case 'nap':
      s.player.stats.sta = 40;
      break;
    case 'iceBath':
      Object.assign(s.player.stats, { sat: 35, sta: 35 });
      break;
    case 'repair':
      f.hp = Math.max(1, Math.floor((f.maxHp || 100) / 3));
      learn(s, spec);
      break;
    case 'reinforce':
      f.reinforce = 0;
      learn(s, spec);
      break;
    case 'goOut':
      // 240 is every outing after the first (239)
      if (spec.outing === 'again') s.pre.visits = { ...(s.pre.visits || {}), market: 1 };
      break;
    case 'throwBait': {
      const n = nextHorde(s);
      if (n && n.at - s.clock.t < 8 * HOUR) s.clock.t = n.at + 12 * HOUR;
      break;
    }
    case 'recycle':
      if (f.inv && s.inventories[f.inv]) for (const id of [20105, 2911, 24118]) addItem(s, s.inventories[f.inv], id, { allowOverweight: true });
      break;
    case 'disinfect':
      give(s, 2164, 1);
      if (f.inv && s.inventories[f.inv]) s.inventories[f.inv].moldy = true;
      break;
    case 'repairPower':
      damageCircuit(s, 'test');
      give(s, 20104, 1);
      break;
    case 'fireplace':
      give(s, 8001, 1);
      break;
    case 'manualGen':
      placePiece(s, 45000);
      break;
    case 'unlockArea':
      s.home.unlocked[spec.area] = false;
      if (spec.repairs) s.home.repairsNeeded = { ...(s.home.repairsNeeded || {}), [spec.area]: 1 };
      break;
    case 'studyWorkbench':
    case 'repairWorkbench':
      f.broken = true;
      if (spec.kind === 'studyWorkbench') s.clock.t = Math.max(s.clock.t, dayStartT(s.clock, 7) + 10 * HOUR);
      break;
    case 'commit': {
      const day = 72;
      s.clock.t = dayStartT(s.clock, day) + 10 * HOUR;
      s.run.day = day;
      s.story.checks = { ...(s.story.checks || {}), [spec.route]: 71 };
      if (spec.route === 'truth') {
        s.story.tags.TAG_LINE_TRUTH_EXPLORED = true;
        if (!story.installedRecorder(s)) placePiece(s, story.RECORDER_FURN);
      }
      if (spec.route === 'evacuate' && !story.installedBeacon(s)) placePiece(s, story.BEACON_FURN);
      if (spec.route === 'girl' || spec.route === 'companion') {
        social.addNeighborAffinity(s, 600);
        s.story.tags[`TAG_${story.neighborInfo(s).line}_RESCUE2_COMPLETE`] = true;
      }
      if (spec.route === 'fortress') {
        for (const o of doorAndWindows(s)) {
          o.reinforce = 1500;
          o.hp = effectiveMaxHp(o);
        }
        for (const dev of Object.values(story.DEFENSE_FURN)) {
          for (let i = homeFurniture(s).filter((x) => x.cfg === dev).length; i < 4; i++) {
            const slot = slotsFor(s, dev)[0];
            if (slot) installFurniture(s, dev, slot.id);
          }
        }
        s.story.powerChecks = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [60 + i, 1]));
      }
      story.updateRouteAvailability(s);
      give(s, 9048, 1);
      break;
    }
    case 'story':
      if (spec.story === 'makeMark') for (const id of MARK) give(s, id);
      if (spec.story === 'forceMark') {
        for (const id of MARK.slice(1)) give(s, id);
        s.story.quests.rescueBeacon = s.story.quests.rescueBeacon || { stage: 1 };
      }
      if (spec.story === 'installMark') give(s, story.MARKER_ITEM);
      if (spec.story === 'checkBeacon') placePiece(s, story.BEACON_FURN);
      break;
    case 'generator': {
      // fuel in its slots (for 开启), running already (for 关闭)
      const fuel = /** @type {any} */ (fuelInventory(s, f));
      addItem(s, fuel, 15504, { allowOverweight: true });
      if (!spec.on) setBurner(s, f.uid, true, { manual: true });
      break;
    }
    case 'bribe':
      startThugs(s);
      give(s, 2107, 10);
      break;
    case 'hotpotEat': {
      give(s, 2530, 2);
      const bp = s.inventories[s.player.backpack];
      for (const inst of bp.items.filter((/** @type {any} */ i) => i.id === 2530)) cooking.addIngredient(s, f.uid, bp.id, inst.uid);
      cooking.startHotPot(s, f.uid);
      cooking.tickCooking(s, 2 * HOUR);
      s.player.stats.sat = 30;
      break;
    }
    case 'drone':
      social.syncDrones(s);
      if (op === 'loot') dropNewItem(s, 20001, '1F', 7, homeFloors(s.home.id)['1F'].innerH + 1);
      if (op === 'coords') social.social(s).coords.push({ id: 'test', label: { en: 'test', zh: 'test' }, loot: [[20001, 1]] });
      if (op === 'lure') {
        // a besieged post asking for the horde to be led away (Shield of the Street)
        const post = Object.keys(social.social(s).posts || {})[0];
        social.shieldState(s).active = { post, at: s.clock.t, expires: s.clock.t + 24 * HOUR, luring: false, awaiting: false };
      }
      break;
    case 'farm':
      if (!farming.plantResearched(s)) s.farm.researched = true;
      if (['pest', 'weed', 'water', 'harvest', 'clear', 'fertilize', 'remove'].includes(op) && farming.isPlanter(f)) {
        if (f.data.decorPlant) f.data.decorPlant = false;
        give(s, SPROUT);
        farming.queuePlanting(s, f.uid, SPROUT, { count: 1 });
        runUntilIdle(s, 4 * HOUR);
        const c = f.data.crops?.[0];
        if (c) {
          if (op === 'pest') c.pest = true;
          if (op === 'weed') c.weed = true;
          if (op === 'water') Object.assign(c, { water: 0, dry: true });
          if (op === 'harvest') c.growth = 0.999;
          if (op === 'clear') Object.assign(c, { withered: true, ready: false });
          if (op === 'fertilize') give(s, 15501);
          if (op === 'harvest') tick(s, HOUR);
        }
      }
      if (op === 'till' && farming.isPlanter(f)) f.data.decorPlant = false;
      break;
    case 'vase':
      f.data.flower = { id: 2541, at: s.clock.t, until: s.clock.t + 3 * 86400, mor: 0.3, wilted: false };
      break;
    case 'record':
      give(s, 11014);
      placeRecord(s, f.uid, 11014);
      break;
    case 'basket':
      clearWay(s);
      if (op === 'rope') {
        social.repairBasket(s);
        social.neighborState(s).ropeHp = 1;
      }
      break;
    case 'loot':
      // 查看 on a locked piece comes after its lock function opened it
      if (spec.mode === 'look' || spec.mode === 'search') f.data.opened = true;
      break;
    case 'stairs':
      s.player.floor = f.floor;
      break;
    case 'open':
      clearWay(s);
      if (spec.panel === 'droneHelp' || spec.panel === 'droneDeliver') {
        social.syncDrones(s);
        const sv = social.social(s).survivors.find((/** @type {any} */ x) => x.alive);
        if (sv) social.requestHelp(s, sv.id);
        if (spec.panel === 'droneDeliver' && sv) {
          const inv = /** @type {any} */ (createInventory(s, { kind: 'furniture', w: 20, h: 20 }));
          const gifts = Array.from({ length: 8 }, () => ({ inv: inv.id, uid: /** @type {any} */ (addItem(s, inv, 2107, { allowOverweight: true })).uid }));
          social.respondHelp(s, { survivor: sv.id, give: gifts });
          tick(s, 3 * HOUR);
          keepAlive(s);
        }
      }
      if (spec.panel === 'droneRescue') {
        social.syncDrones(s);
        give(s, NOTE);
        tick(s, HOUR);
      }
      break;
    default:
      break;
  }
  if (spec.needPower || furn(f.cfg)?.elec === ELEC.CONSUMER) tick(s, 60);
}

/** Advanced repair learned: the quest's tag for a base button, New Game+ for its twin (twinOf). @param {any} s @param {any} spec */
function learn(s, spec) {
  if (spec.twinOf) s.loop.ngPlus = true;
  else if (spec.advanced) s.story.tags.advancedReinforce = true;
}

/** The junk piles and rubble a home starts with, taken apart. @param {any} s */
function clearWay(s) {
  for (const f of homeFurniture(s)) if (f.cfg === 'junkpile' || f.cfg === 'rubble') dismantle(s, f.uid);
}

/** @param {any} s @param {number} [max] */
export function runUntilIdle(s, max = 12 * HOUR) {
  let t = 0;
  while (t < max && !isIdle(s) && s.phase !== 'dead') {
    const step = Math.min(10 * 60, max - t);
    tick(s, step);
    t += step;
    if (s.player.stats.sta < 30 || s.player.stats.sat < 30) keepAlive(s);
  }
  return isIdle(s);
}

/**
 * Run function `key` on piece `cfg`: for each character and the phases its Chapter allows, place the piece, set up
 * the situation, and run it from the furniture menu. Returns the first run whose action completed, with what it did.
 * panel: the function is queued the way a panel button queues it (queuePanelFunction), for a function the piece's
 * own FurnitureFunc does not list.
 * @param {number} cfg @param {number} key @param {{ seed?: number, setup?: (s: any, f: any) => void, panel?: boolean }} [opts]
 * @returns {any}
 */
export function runFunction(cfg, key, { seed = 7, setup, panel = false } = {}) {
  const chapter = func(key)?.chapter ?? 0;
  const phases = chapter === 1 ? ['pre'] : chapter === 2 ? ['post'] : ['post', 'pre'];
  /** @type {string[]} */
  const why = [];
  for (const character of CHARACTERS) {
    for (const phase of phases) {
      const s = run(character, phase, seed);
      const placed = placePiece(s, cfg);
      if (!placed) {
        why.push(`${character}:${phase}: no place for ${cfg}`);
        continue;
      }
      const f = placed.f;
      prepare(s, f, key);
      setup?.(s, f);
      const entry = panel ? { spec: specOf(key), enabled: true, reason: '' } : furnitureFunctions(s, f).find((e) => e.key === key);
      if (!entry || !entry.enabled) {
        why.push(`${character}:${phase}: ${entry ? `disabled (${entry.reason})` : 'not offered'}`);
        continue;
      }
      const rec = record(s, f, key, () => {
        const a = panel ? queuePanelFunction(s, f.uid, key) : startFurnitureFunction(s, f.uid, key);
        if (!a) return false;
        runUntilIdle(s, Math.max(2 * HOUR, (entry.spec.min || 0) * 60 * 3));
        if (/** @type {any} */ (s.actions.current)?.funcKey === key) cancelAll(s);
        return true;
      });
      if (rec.done) return { ...rec, s, f, spec: entry.spec, character, phase, how: placed.how };
      why.push(`${character}:${phase}: ${rec.started ? 'never completed' : 'refused'}${rec.toasts.length ? ` (${rec.toasts.at(-1)})` : ''}`);
    }
  }
  return { done: false, why };
}

/** @param {any} s @param {any} f @param {number} key @param {() => boolean} fn */
function record(s, f, key, fn) {
  /** @type {any[]} */
  const stats = [];
  /** @type {any[]} */
  const maxes = [];
  /** @type {any[]} */
  const panels = [];
  /** @type {string[]} */
  const toasts = [];
  /** @type {any[]} */
  const events = [];
  /** @type {any} */
  let done = null;
  const before = countItems(s);
  const pieceBefore = structuredClone(f);
  const offs = [
    on('stat', (/** @type {any} */ e) => stats.push(e)),
    on('maxRaised', (/** @type {any} */ e) => maxes.push(e)),
    on('openPanel', (/** @type {any} */ e) => panels.push(e)),
    on('toast', (/** @type {any} */ e) => e?.kind === 'bad' && toasts.push(e.text)),
    on('actionDone', (/** @type {any} */ a) => {
      if (a.funcKey === key && !done) done = a;
    }),
    ...['story', 'radio', 'recordOp', 'powerChanged', 'areaUnlocked', 'workbenchRepaired', 'repaired', 'floorChanged', 'gotItem'].map((type) => on(type, (/** @type {any} */ e) => events.push({ type, e }))),
  ];
  let started;
  try {
    started = fn();
  } finally {
    for (const off of offs) off();
  }
  const after = countItems(s);
  const up = [...after].filter(([id, n]) => n > (before.get(id) || 0)).map(([id]) => id);
  const down = [...before].filter(([id, n]) => n > (after.get(id) || 0)).map(([id]) => id);
  return { done: !!done, action: done, started, stats, maxes, panels, toasts, events, up, down, pieceBefore, piece: s.furniture[f.uid] || null };
}

/** A copy of run `s` whose RNG draws from another seed. @param {any} s @param {number} k */
export function reseeded(s, k) {
  const t = structuredClone(s);
  t.rng = seedRng(k);
  return t;
}
