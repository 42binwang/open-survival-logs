// @ts-check
// The self-check against impossible checks. Every family is evaluated once more, on the evidence its drivers and the
// traced test run record when the game does everything its config says and the original offers: every item handed
// over and used up, every home piece obtained and installed with each function completing from the furniture menu,
// every shop and site piece placed with each function it can run where it stands completing under its own id (the
// drivers' rule, trace/rules.mjs funcOf), every recipe cooked into each quality band, every plant grown to all its
// outputs, every function completed and every achievement awarded in a test (through the tracer's award rules,
// awardKind), every piece bound to a model of its own, every patch-notes line mapped. The evidence stops where the
// probes stop: a use the item driver has no probe for, a recipe no cooker the cooking driver installs allows, a plant
// with no seed item, a function the original cannot run where the piece stands (data.mjs phaseUnreachable) stay
// unobserved. An in-scope check that fails even so is one no probe or driver can ever pass, however complete the
// game: a tool problem, never a content gap.
// Its limits: it knows the original only through the config rules above, so a function the config offers on a piece
// the original never lets the player use is caught only when a rule names it; and it builds the evidence in the
// shape the drivers and the tracer record, so it cannot tell whether the sim will emit that evidence (a site or shop
// action carrying its function id, an award on a state the test ticked and never wrote itself).
import { furnitureScopeOf, phaseUnreachable } from './data.mjs';
import { awardKind, funcOf } from './trace/rules.mjs';
import { emptyObs } from './observe.mjs';
import { USED_UP, expectedUses } from './uses.mjs';
import { unprobeable } from './drivers/itemuse.mjs';
import { cookersFor } from './drivers/cooking.mjs';
import { seedsFor } from './drivers/farming.mjs';
import * as items from './families/items.mjs';
import * as furniture from './families/furniture.mjs';
import * as funcs from './families/funcs.mjs';
import * as cooking from './families/cooking.mjs';
import * as crafting from './families/crafting.mjs';
import * as plants from './families/plants.mjs';
import * as achievements from './families/achievements.mjs';
import * as news from './families/news.mjs';

const AT = 'full parity';
const TEST = 'tests/(full parity) › earns everything';
const DONE_ROW = 'Z00';

/**
 * @typedef {{ family: string, check: string, id: string, why: string }} Impossible
 */

/**
 * The evidence of a game that does everything its config says, as the drivers and the traced test run record it.
 * @param {import('./data.mjs').Config} cfg
 * @returns {{ obs: import('./observe.mjs').Obs, trace: import('./trace.mjs').Trace, keys: import('./families/achievements.mjs').KeyEntry[], manifests: import('./manifests.mjs').Manifests }}
 */
export function fullParity(cfg) {
  const obs = emptyObs();
  const scope = furnitureScopeOf(cfg);
  // items: every item handed over and used up by some driver; each direct use run by the item driver where it can
  const uses = expectedUses(cfg.items, cfg.funcs);
  /** @type {Record<string, Record<string, { ok: boolean, why?: string }>>} */
  const itemuse = (obs.results.itemuse = {});
  for (const it of Object.values(cfg.items)) {
    obs.produced[it.id] = [AT];
    obs.used[it.id] = [AT];
    const res = (itemuse[it.id] = /** @type {Record<string, { ok: boolean, why?: string }>} */ ({}));
    for (const use of uses[it.id] || []) {
      if (USED_UP.has(use)) continue;
      const never = unprobeable(cfg, it, use);
      res[use] = never ? { ok: false, why: never } : { ok: true };
    }
  }
  // furniture: home pieces through the furniture driver, shop and site pieces through the fixture drivers
  const runs = (obs.results.furniture = /** @type {Record<string, any>} */ ({}));
  const fixtures = (obs.results.fixtures = /** @type {Record<string, any>} */ ({}));
  const scenes = (obs.results.scenes = /** @type {Record<string, any>} */ ({}));
  /** @type {Map<string, any>} */
  const assets = new Map();
  /** @type {Map<string, { asset: string, file: string }>} */
  const bindings = new Map();
  for (const f of Object.values(cfg.furniture)) {
    const sc = scope.get(f.id);
    if (!sc || sc.excluded) continue;
    if (sc.cls === 'home') {
      obs.furnished[f.id] = [AT];
      const keys = [...new Set([...(f.funcs || []), ...(f.rmFunc || []), ...(f.mvFunc || [])])];
      runs[f.id] = { starter: [], placed: [], installs: { [AT]: true }, funcs: Object.fromEntries(keys.filter((/** @type {number} */ k) => !phaseUnreachable(cfg, f.id, k)).map((k) => [k, { ok: true, by: AT, gave: true, why: {} }])) };
    } else {
      const where = `site:${AT}`;
      scenes[f.id] = [where];
      const done = (f.funcs || []).filter((/** @type {number} */ k) => !phaseUnreachable(cfg, f.id, k)).map((/** @type {number} */ k) => ({ kind: AT, fixture: f.id, funcKey: k }));
      fixtures[f.id] = { where: [where], modes: { [where]: { [AT]: { done: true, items: true, funcs: [...new Set(done.map(funcOf).filter((/** @type {number | null} */ k) => k != null))] } } } };
    }
    assets.set(`model/${f.id}`, { id: `model/${f.id}`, kind: 'model' });
    bindings.set(String(f.id), { asset: `model/${f.id}`, file: AT });
  }
  // functions: a spec the sim uses for each
  obs.results.funcs = Object.fromEntries(Object.keys(cfg.funcs).map((id) => [id, { spec: 'funcSpecs', kind: AT, registered: true }]));
  // recipes: cooked into every band on a cooker the cooking driver can install; crafted with every output
  obs.results.cooking = {};
  for (const r of Object.values(cfg.recipes)) {
    const cooks = cookersFor(cfg, r.id);
    obs.results.cooking[r.id] = cooks.length
      ? { cooked: true, cooker: cooks[0].pieces[0], character: AT, outputs: Object.fromEntries((r.out || []).map((/** @type {number} */ id, /** @type {number} */ band) => [band, id])), problems: [] }
      : { cooked: false, cooker: null, character: null, outputs: {}, problems: ['no Config_FurnitureCook row in the normal cook mode allows it on a piece that installs: the cooking driver has no cooker for it'] };
  }
  obs.results.crafting = Object.fromEntries(
    Object.values(cfg.crafts).map((r) => [r.id, { offered: true, character: AT, unlock: AT, crafted: true, products: [...(r.out || [])], perfect: r.pOut?.length ? [...r.pOut] : null, salvage: r.fail?.length ? [...r.fail] : null, problems: [] }])
  );
  // plants: grown from the seed the farming driver sows to every output
  obs.results.plants = Object.fromEntries(
    Object.values(cfg.plants).map((p) => {
      const seed = seedsFor(cfg, p.id)[0];
      return [p.id, seed ? { seed, planted: true, ripe: true, hours: 0, harvest: [...(p.gain || [])], perfect: [...(p.pGain || [])], wither: [...(p.wither || [])], seeds: true, problems: [] } : { seed: null, planted: false, ripe: false, hours: 0, harvest: [], perfect: null, wither: null, seeds: false, problems: ['no Config_Item has it as its Plant: the farming driver has no seed to sow'] }];
    })
  );
  /** @type {import('./trace.mjs').Trace} */
  const trace = { files: 1, tests: [TEST], func: {}, achievement: {}, undriven: {}, baseline: {}, tainted: {}, results: { passed: 1, failed: 0 }, problems: [] };
  // each function's action completes under its id; each achievement is awarded on a state the test ticked, whose
  // achievement fields only game code wrote and which did not meet it when the test first ticked it
  for (const id of Object.keys(cfg.funcs)) {
    const k = funcOf({ kind: AT, funcKey: Number(id) });
    if (k != null) trace.func[k] = [TEST];
  }
  for (const a of cfg.achievements) {
    const kind = awardKind({ ticked: true, tainted: false, metBefore: false });
    /** @type {Record<string, string[]>} */ (trace[kind])[a.id] = [TEST];
  }
  const keys = [...new Set(cfg.achievements.map((a) => a.counter).filter(Boolean))].map((key) => ({ key, ns: 'counters', writes: [{ file: `src/sim/${key}.js` }], writtenBy: [] }));
  return { obs, trace, keys, manifests: { files: [AT], assets, bindings, problems: [] } };
}

/**
 * In-scope checks that fail even on full-parity evidence: checks no probe or driver can ever pass.
 * @param {import('./data.mjs').Config} cfg
 * @param {string[]} families
 * @param {{ news?: import('./news.mjs').NewsItem[] }} [inputs]  the patch-notes line items, when news is checked
 * @returns {Impossible[]}
 */
export function impossibleChecks(cfg, families, { news: lines = [] } = {}) {
  const { obs, trace, keys, manifests } = fullParity(cfg);
  /** @type {import('./family.mjs').Family[]} */
  const fams = [];
  for (const id of families) {
    if (id === 'items') fams.push(items.evaluate({ cfg, obs }));
    if (id === 'furniture') fams.push(furniture.evaluate({ cfg, obs, manifests }));
    if (id === 'funcs') fams.push(funcs.evaluate({ cfg, obs, trace }));
    if (id === 'cooking') fams.push(cooking.evaluate({ cfg, obs }));
    if (id === 'crafting') fams.push(crafting.evaluate({ cfg, obs }));
    if (id === 'plants') fams.push(plants.evaluate({ cfg, obs }));
    if (id === 'achievements') fams.push(achievements.evaluate({ cfg, trace, keys }));
    if (id === 'news') {
      const map = { schema: news.NEWS_MAP_SCHEMA, reasons: {}, items: Object.fromEntries(lines.map((l) => [l.id, { rows: [DONE_ROW] }])) };
      fams.push(news.evaluate({ items: lines, map, features: new Map([[DONE_ROW, { id: DONE_ROW, status: '✅', feature: AT }]]) }));
    }
  }
  /** @type {Impossible[]} */
  const out = [];
  for (const f of fams) for (const e of f.entities) for (const [check, c] of Object.entries(e.checks)) if (!c.ok) out.push({ family: f.id, check, id: e.id, why: c.detail || 'fails' });
  return out;
}
