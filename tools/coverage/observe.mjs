// @ts-check
// What the drivers saw the simulation do: which items appeared in the survivor's world and where from, which items a
// sim action used up, which furniture ended up in a home, and per-entity results for the families. Drivers run in
// worker threads; their observations are plain JSON and merge in any order.
import { countFurniture, countItems, diffCounts } from './sim.mjs';

const MAX_SOURCES = 6;

/**
 * @typedef {object} Obs
 * @property {Record<string, string[]>} produced  item id -> sources ("shop:market/staples", "craft:12", …)
 * @property {Record<string, string[]>} used  item id -> the sim actions that used it up (or used it as a tool)
 * @property {Record<string, string[]>} furnished  furniture cfg -> how it got into a home ("starter:wage", …)
 * @property {Record<string, string[]>} unlocks  craft recipe id -> what taught it (events, exploration, cards, …)
 * @property {Record<string, Record<string, any>>} results  family id -> entity id -> driver result
 * @property {string[]} warnings  what a driver could not do (the families show the effect on the entities)
 * @property {string[]} errors  drivers that crashed (a probe error: the numbers cannot be trusted)
 */

/** @returns {Obs} */
export function emptyObs() {
  return { produced: {}, used: {}, furnished: {}, unlocks: {}, results: {}, warnings: [], errors: [] };
}

/** @param {Record<string, string[]>} map @param {string | number} key @param {string} source */
function add(map, key, source) {
  const list = (map[key] ||= []);
  if (list.length < MAX_SOURCES && !list.includes(source)) list.push(source);
}

export class Recorder {
  constructor() {
    /** @type {Obs} */
    this.obs = emptyObs();
  }

  /** @param {number} id @param {string} source */
  produced(id, source) {
    add(this.obs.produced, id, source);
  }

  /** @param {number} id @param {string} source */
  used(id, source) {
    add(this.obs.used, id, source);
  }

  /** @param {number | string} cfg @param {string} how */
  furnished(cfg, how) {
    add(this.obs.furnished, cfg, how);
  }

  /** @param {number} id  craft recipe @param {string} source */
  unlocked(id, source) {
    add(this.obs.unlocks, id, source);
  }

  /** @param {string} family @param {string | number} id @param {any} result */
  result(family, id, result) {
    (this.obs.results[family] ||= {})[id] = result;
  }

  /** Like result, merged into what this driver already recorded for the id (mergeObs rules). @param {string} family @param {string | number} id @param {any} result */
  merge(family, id, result) {
    const by = (this.obs.results[family] ||= {});
    by[id] = id in by ? mergeResult(by[id], result) : result;
  }

  /** @param {string} message */
  warn(message) {
    this.obs.warnings.push(message);
  }

  /**
   * Snapshot the run, let `fn` drive it, and record what appeared and what was used up in between.
   * @template T
   * @param {any} s  the run
   * @param {string} source  where new things came from
   * @param {() => T} fn
   * @returns {{ value: T, up: number[], down: number[] }}
   */
  watch(s, source, fn) {
    const items = countItems(s);
    const furn = countFurniture(s);
    const value = fn();
    const d = diffCounts(items, countItems(s));
    for (const id of d.up) this.produced(id, source);
    for (const id of d.down) this.used(id, source);
    for (const cfg of diffCounts(furn, countFurniture(s)).up) if (typeof cfg === 'number') this.furnished(cfg, source);
    return { value, up: d.up, down: d.down };
  }
}

/**
 * @param {Obs} into
 * @param {Obs} from
 * @returns {Obs} `into`, with `from` merged in
 */
export function mergeObs(into, from) {
  for (const k of /** @type {const} */ (['produced', 'used', 'furnished', 'unlocks'])) {
    for (const [id, list] of Object.entries(from[k])) for (const src of list) add(into[k], id, src);
  }
  for (const [fam, byId] of Object.entries(from.results)) {
    const to = (into.results[fam] ||= {});
    for (const [id, r] of Object.entries(byId)) to[id] = to[id] ? mergeResult(to[id], r) : r;
  }
  into.warnings.push(...from.warnings);
  into.errors.push(...from.errors);
  return into;
}

/**
 * Record every craft recipe the sim teaches while a driver runs ('recipeUnlocked' / 'recipesUnlocked' bus events;
 * payload.recipe is a cooking recipe and is left out). Returns the function that stops listening.
 * @param {Record<string, any>} S  loadSim()
 * @param {Recorder} rec
 * @param {string} driver
 */
export function trackUnlocks(S, rec, driver) {
  const one = S.bus.on('recipeUnlocked', (/** @type {any} */ p) => {
    const id = p?.id ?? p?.craft;
    if (id != null) rec.unlocked(id, `${driver}${p?.source ? `:${p.source}` : ''}`);
  });
  const many = S.bus.on('recipesUnlocked', (/** @type {any} */ p) => {
    for (const id of p?.ids || []) rec.unlocked(id, `${driver}${p?.source ? `:${p.source}` : ''}`);
  });
  return () => (one(), many());
}

/** Results of the same entity from several tasks (e.g. one per character): arrays concatenate, flags OR. */
function mergeResult(/** @type {any} */ a, /** @type {any} */ b) {
  if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = k in out ? mergeResult(out[k], v) : v;
    return out;
  }
  if (typeof a === 'boolean' && typeof b === 'boolean') return a || b;
  return b ?? a;
}
