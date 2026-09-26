// @ts-check
// The simulation, headless: the sim and meta modules src/systems.js wires (so every system and action kind registers
// the way it does in the browser; UI panels and audio stay out), plus the helpers the drivers share. Module
// namespaces come back untyped: the sim is plain JavaScript.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** @param {string} rel  repo-relative module path @returns {Promise<any>} */
const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href);

/** @type {Promise<Record<string, any>> | null} */
let loading = null;

/**
 * Every module the drivers call, loaded once per thread after the systems registered themselves.
 * @returns {Promise<Record<string, any>>}
 */
export function loadSim() {
  if (!loading) loading = loadAll();
  return loading;
}

async function loadAll() {
  // src/meta/endless.js pulls in src/ui/menus.js, whose panels listen for 'openPanel' and read the game state of the
  // page; headless, those listeners throw and the bus logs every failure. Those lines are left out, nothing else.
  const error = console.error;
  console.error = (...a) => (typeof a[0] === 'string' && a[0].startsWith('listener for openPanel failed') ? undefined : error(...a));
  const wiring = readFileSync(join(ROOT, 'src/systems.js'), 'utf8');
  const systems = [...wiring.matchAll(/^import '\.\/((?:sim|meta)\/[\w/-]+\.js)';$/gm)].map((m) => `src/${m[1]}`);
  if (!systems.length) throw new Error('src/systems.js wires no sim modules');
  for (const m of systems) await load(m);
  /** @type {Record<string, string>} */
  const names = {
    state: 'src/sim/state.js',
    tick: 'src/sim/tick.js',
    actions: 'src/sim/actions.js',
    home: 'src/sim/home.js',
    inventory: 'src/sim/inventory.js',
    furnActions: 'src/sim/furnActions.js',
    itemuse: 'src/sim/itemuse.js',
    cooking: 'src/sim/cooking.js',
    crafting: 'src/sim/crafting.js',
    farming: 'src/sim/farming.js',
    planning: 'src/sim/planning.js',
    predisaster: 'src/sim/predisaster.js',
    explore: 'src/sim/explore.js',
    story: 'src/sim/story.js',
    social: 'src/sim/social.js',
    phone: 'src/sim/phone.js',
    traps: 'src/sim/traps.js',
    horde: 'src/sim/horde.js',
    power: 'src/sim/power.js',
    spoilage: 'src/sim/spoilage.js',
    rebirth: 'src/sim/rebirth.js',
    settlement: 'src/sim/settlement.js',
    unlocks: 'src/sim/unlocks.js',
    codex: 'src/meta/codex.js',
    profile: 'src/meta/profile.js',
    stats: 'src/sim/stats.js',
    time: 'src/sim/time.js',
    proficiency: 'src/sim/proficiency.js',
    modifiers: 'src/sim/modifiers.js',
    rng: 'src/engine/rng.js',
    bus: 'src/engine/bus.js',
    save: 'src/engine/save.js',
    db: 'src/data/db.js',
    achievements: 'src/meta/achievements.js',
    endless: 'src/meta/endless.js',
    homes: 'src/content/homes.js',
    shops: 'src/content/shops.js',
    sites: 'src/content/sites.js',
    events: 'src/content/events.js',
    people: 'src/content/people.js',
    funcSpecs: 'src/content/funcSpecs.js',
    itemEffects: 'src/content/itemEffects.js',
    characters: 'src/content/characters.js',
    planningCards: 'src/content/planningCards.js',
  };
  /** @type {Record<string, any>} */
  const out = { systems };
  for (const [k, rel] of Object.entries(names)) out[k] = await load(rel);
  return out;
}

export const CHARACTERS = ['wage', 'student', 'warehouse'];
export const HOUR = 3600;

/**
 * A new run before the outbreak (the pre-disaster shopping phase).
 * @param {Record<string, any>} S  loadSim()
 * @param {{ seed?: number, character?: string, mode?: string }} [opts]
 */
export function preGame(S, { seed = 1, character = 'wage', mode = 'story' } = {}) {
  return S.state.newGame({ seed, character, mode, skipPrologue: true });
}

/**
 * A new run through the real outbreak transition, at 21:00 on Day 1 (as the unit tests set it up).
 * @param {Record<string, any>} S
 * @param {{ seed?: number, character?: string }} [opts]
 */
export function postGame(S, opts = {}) {
  const s = preGame(S, opts);
  s.clock.t = s.clock.outbreakAt;
  S.tick.outbreak(s);
  s.clock.t += 3 * HOUR;
  s.run.day = S.time.dayNumber(s.clock);
  keepAlive(s);
  return s;
}

/** Healthy stats, so long probes never end in exhaustion or death. @param {any} s */
export function keepAlive(s) {
  Object.assign(s.player.stats, { sat: 90, sta: 95, mor: 90, life: 100 });
  for (const k of Object.keys(s.player.effects || {})) if (/^(110\d|insomnia|breakdown|mentalBlock|hungry|exhausted|depressed|encumbered)$/.test(k)) delete s.player.effects[k];
}

/**
 * Doors and windows back at full strength, so no horde breaks in while a long probe waits for something else.
 * @param {Record<string, any>} S
 * @param {any} s
 */
export function keepSafe(S, s) {
  for (const f of S.home.doorAndWindows(s)) f.hp = S.home.effectiveMaxHp(f);
}

/** @param {any} s @returns {Map<number, number>} item id -> units anywhere in the run's inventories */
export function countItems(s) {
  /** @type {Map<number, number>} */
  const m = new Map();
  for (const inv of Object.values(s.inventories)) {
    for (const it of /** @type {any} */ (inv).items || []) m.set(it.id, (m.get(it.id) || 0) + (it.qty || 1));
  }
  return m;
}

/** @param {any} s @returns {Map<string | number, number>} furniture cfg -> pieces in the run */
export function countFurniture(s) {
  /** @type {Map<string | number, number>} */
  const m = new Map();
  for (const f of Object.values(s.furniture)) m.set(/** @type {any} */ (f).cfg, (m.get(/** @type {any} */ (f).cfg) || 0) + 1);
  return m;
}

/**
 * @param {Map<any, number>} before
 * @param {Map<any, number>} after
 * @returns {{ up: any[], down: any[] }}  ids whose count rose / fell
 */
export function diffCounts(before, after) {
  const up = [];
  const down = [];
  for (const [id, n] of after) if (n > (before.get(id) || 0)) up.push(id);
  for (const [id, n] of before) if (n > (after.get(id) || 0)) down.push(id);
  return { up, down };
}

/**
 * Tick until the survivor is idle (the queue ran to its end) or `max` game seconds passed.
 * @param {Record<string, any>} S
 * @param {any} s
 * @param {number} [max]
 * @returns {boolean} idle at the end
 */
export function runUntilIdle(S, s, max = 12 * HOUR) {
  let t = 0;
  while (t < max && !S.actions.isIdle(s) && s.phase !== 'dead') {
    const step = Math.min(10 * 60, max - t);
    S.tick.tick(s, step);
    t += step;
    if (s.player.stats.sta < 30 || s.player.stats.sat < 30) keepAlive(s);
  }
  return S.actions.isIdle(s);
}

/**
 * Put `n` units of an item into the backpack (the way the tests give items).
 * @param {Record<string, any>} S
 * @param {any} s
 * @param {number} id
 * @param {number} [n]
 * @returns {any[]} the instances
 */
export function give(S, s, id, n = 1) {
  const bp = s.inventories[s.player.backpack];
  const out = [];
  for (let i = 0; i < n; i++) out.push(S.inventory.addItem(s, bp, id, { allowOverweight: true }));
  return out;
}

/**
 * Every area a home locks behind story tasks (floors and rooms) opened, as the unlock tasks would.
 * @param {Record<string, any>} S
 * @param {any} s
 */
export function unlockHome(S, s) {
  for (const area of [...Object.keys(s.home.unlocked), ...Object.keys(S.homes.HOMES[s.home.id]?.locks || {}), '1F', '2F', 'B1']) s.home.unlocked[area] = true;
}

/**
 * Install a piece in the first slot of the home that takes it (areas unlocked, defense level raised for defense
 * slots); when every such slot is taken, what stands in one is removed first.
 * @param {Record<string, any>} S
 * @param {any} s
 * @param {number} cfg  furniture id
 * @returns {any | null} the installed piece
 */
export function placeAtHome(S, s, cfg) {
  unlockHome(S, s);
  s.progress.prof.defense.lv = Math.max(s.progress.prof.defense.lv, 5);
  for (const slot of S.planning.slotsFor(s, cfg)) {
    const r = S.home.installFurniture(s, cfg, slot.id);
    if (r.ok) return r.f;
  }
  for (const slot of S.planning.slotsFor(s, cfg, { includeOccupied: true })) {
    const old = S.home.furnitureAt(s, slot.id);
    if (old) S.home.removeFurniture(s, old.uid);
    const r = S.home.installFurniture(s, cfg, slot.id);
    if (r.ok) return r.f;
  }
  return null;
}

/**
 * Let game days pass (hour steps: the survivor kept fed and rested, the doors and windows mended before a breach
 * could last the 90 minutes that kill) until `day`.
 * @param {Record<string, any>} S
 * @param {any} s
 * @param {number} day
 */
export function advanceTo(S, s, day) {
  for (let guard = 0; S.time.dayNumber(s.clock) < day && guard < 24 * 400 && s.phase !== 'dead'; guard++) {
    keepSafe(S, s);
    S.tick.tick(s, HOUR);
    keepAlive(s);
  }
  return S.time.dayNumber(s.clock) >= day;
}

/**
 * Collect every bus event of the given types while `fn` runs.
 * @template T
 * @param {Record<string, any>} S
 * @param {string[]} types
 * @param {() => T} fn
 * @returns {{ value: T, events: { type: string, payload: any }[] }}
 */
export function listen(S, types, fn) {
  /** @type {{ type: string, payload: any }[]} */
  const events = [];
  const offs = types.map((type) => S.bus.on(type, (/** @type {any} */ payload) => events.push({ type, payload })));
  try {
    return { value: fn(), events };
  } finally {
    for (const off of offs) off();
  }
}
