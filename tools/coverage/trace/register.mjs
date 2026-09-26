// @ts-check
// Preloaded (node --import) into every test process of a traced run. It installs the module hooks (hooks.mjs: test
// files get a node:test that remembers the running test; src/meta/achievements.js reports every achievement game
// code awards; src/sim/tick.js reports every state the sim advances; every exported function of the game's code
// reports when it is entered and left) and records, per test, the furniture functions whose actions completed and
// the achievements the sim earned during that test (the rules: rules.mjs awardKind).
// - Tainted: whenever game code is left, the field groups achievement conditions read are recorded for the run
//   states and histories it touched (rules.mjs fieldGroups); when game code is next entered and a group differs,
//   test code wrote it in between. For the rest of the test, an award on that state or history earns nothing when
//   its condition reads a group the test wrote (rules.mjs groupsRead); writes to other groups do not affect it.
// - Baseline: when a test first ticks a state, the state as it stands then is kept, and the game's global history
//   too; an award that state (with that history) already met earns nothing. For a history the test passes in itself
//   (evaluateAchievements(state, history)) that is the history the award used, less the lifetime counters runs
//   folded into it since.
// - Undriven: an award on a state the test never ticked earns nothing.
// At exit the records go to $COVERAGE_TRACE_DIR as one JSON file per process.
import { register } from 'node:module';
import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { awardKind, fieldGroups, funcOf, groupsRead, tracked } from './rules.mjs';

const dir = process.env.COVERAGE_TRACE_DIR;
const g = /** @type {any} */ (globalThis);

/** @param {any} state @returns {any} the state as it stands, or null when it cannot be copied */
function snapshot(state) {
  try {
    return structuredClone(state);
  } catch {
    try {
      return JSON.parse(JSON.stringify(state));
    } catch {
      return null;
    }
  }
}

if (dir) {
  /** @type {AsyncLocalStorage<{ file: string, name: string }>} */
  const als = (g.__coverageAls ||= new AsyncLocalStorage());
  /** @type {Record<string, Record<string, Set<string>>>} kind -> id -> test ids ("file › name") */
  const seen = { func: {}, achievement: {}, undriven: {}, baseline: {}, tainted: {} };
  /**
   * state -> test -> the state as that test first ticked it, and the game's global history then
   * @type {WeakMap<object, Map<string, { state: any, history: { ref: object, snap: any } | null }>>}
   */
  const firstTick = new WeakMap();
  /** @type {WeakMap<object, Record<string, number>>} history -> lifetime counter increases runs folded into it */
  const folded = new WeakMap();
  /** @type {Set<string>} */
  const tests = new Set();
  const current = () => {
    const t = als.getStore();
    return t ? `${t.file} › ${t.name}` : null;
  };
  /** @param {'func' | 'achievement' | 'undriven' | 'baseline' | 'tainted'} kind @param {string | number} id */
  const note = (kind, id) => {
    const t = current();
    if (t == null || id == null) return;
    (seen[kind][id] ||= new Set()).add(t);
  };
  /** @type {WeakMap<object, Record<string, string>>} run state or history -> its field groups when game code last left it */
  const left = new WeakMap();
  /** @type {WeakMap<object, Map<string, Set<string>>>} run state or history -> test ('*': outside any test) -> groups its code wrote */
  const tainted = new WeakMap();
  let depth = 0;
  /** @param {any[]} args @param {any} [ret] */
  const touched = (args, ret) => {
    const out = new Set();
    for (const x of [...args, ret, g.__coverageGame?.state, g.__coverageGame?.history]) if (tracked(x)) out.add(x);
    return out;
  };
  g.__coverageGameCode = {
    enter(/** @type {any[]} */ args) {
      if (depth++ > 0) return;
      for (const o of touched(args)) {
        const before = left.get(o);
        if (!before) continue;
        const now = fieldGroups(o);
        const wrote = Object.keys(now).filter((k) => now[k] !== before[k]);
        if (!wrote.length) continue;
        const who = current() ?? '*';
        let by = tainted.get(o);
        if (!by) tainted.set(o, (by = new Map()));
        let set = by.get(who);
        if (!set) by.set(who, (set = new Set()));
        for (const k of wrote) set.add(k);
      }
    },
    exit(/** @type {any[]} */ args, /** @type {any} */ ret) {
      if (--depth > 0) return;
      for (const o of touched(args, ret)) left.set(o, fieldGroups(o));
    },
  };
  /** Did test t's code (or code outside any test) write a group of o the condition reads (null: any group)? @param {any} o @param {string} t @param {string[] | null} groups */
  const taintedIn = (o, t, groups) => {
    if (!o || typeof o !== 'object') return false;
    const by = tainted.get(o);
    const wrote = [...(by?.get(t) || []), ...(by?.get('*') || [])];
    return groups ? wrote.some((k) => groups.includes(k)) : wrote.length > 0;
  };
  g.__coverageTrace = note;
  g.__coverageTicked = (/** @type {any} */ state) => {
    const t = current();
    if (t == null || !state || typeof state !== 'object') return;
    let byTest = firstTick.get(state);
    if (!byTest) firstTick.set(state, (byTest = new Map()));
    if (byTest.has(t)) return;
    const h = g.__coverageGame?.history;
    byTest.set(t, { state: snapshot(state), history: h && typeof h === 'object' ? { ref: h, snap: snapshot(h) } : null });
  };
  g.__coverageFolded = (/** @type {any} */ history, /** @type {Record<string, number>} */ before) => {
    if (!history || typeof history !== 'object') return;
    const f = folded.get(history) || {};
    for (const [k, v] of Object.entries(history.counters || {})) {
      const up = (Number(v) || 0) - (Number(before[k]) || 0);
      if (up > 0) f[k] = (f[k] || 0) + up;
    }
    folded.set(history, f);
  };
  /** The history as the test set it up: what runs folded into its lifetime counters taken out. @param {any} history */
  const unfolded = (history) => {
    const f = history && typeof history === 'object' ? folded.get(history) : null;
    if (!f) return history;
    const counters = { ...(history.counters || {}) };
    for (const [k, n] of Object.entries(f)) counters[k] = (Number(counters[k]) || 0) - n;
    return { ...history, counters };
  };
  g.__coverageAwarded = (/** @type {Array<string | number>} */ ids, /** @type {any} */ state, /** @type {any} */ history, /** @type {(id: any, s: any, h: any) => boolean} */ check, /** @type {number[]} */ predicateIds = []) => {
    const predicates = new Set(predicateIds);
    const t = current();
    const first = t != null && state && typeof state === 'object' ? firstTick.get(state)?.get(t) : undefined;
    const live = first?.history;
    const h0 = live && live.ref === history && live.snap ? live.snap : unfolded(history);
    for (const id of ids) {
      const kind = awardKind({
        ticked: !!first?.state,
        tainted: t != null && (taintedIn(state, t, groupsRead(Number(id), predicates)) || taintedIn(history, t, groupsRead(Number(id), predicates))),
        metBefore: !!first?.state && !!check(id, first.state, h0),
      });
      note(kind, id);
    }
  };
  g.__coverageTestStarted = (/** @type {string} */ t) => tests.add(t);
  // the bus is a module singleton: the tests' own import of src/engine/bus.js resolves to this same instance
  const bus = await import(new URL('../../../src/engine/bus.js', import.meta.url).href);
  bus.on('actionDone', (/** @type {any} */ a) => {
    const k = funcOf(a);
    if (k != null) note('func', k);
  });
  register(new URL('./hooks.mjs', import.meta.url));
  process.on('exit', () => {
    /** @type {Record<string, Record<string, string[]>>} */
    const out = { func: {}, achievement: {}, undriven: {}, baseline: {}, tainted: {} };
    for (const kind of /** @type {const} */ (['func', 'achievement', 'undriven', 'baseline', 'tainted'])) for (const [id, set] of Object.entries(seen[kind])) out[kind][id] = [...set];
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${process.pid}.json`), JSON.stringify({ argv: process.argv.slice(1), bus: !!bus, tests: [...tests], ...out }));
  });
}
