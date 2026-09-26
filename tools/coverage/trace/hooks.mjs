// @ts-check
// Module hooks of a traced test run (registered by register.mjs):
// - a tests/*.test.js file importing 'node:test' gets wrapper.mjs instead (one copy per test file, which knows the file);
// - src/meta/achievements.js is loaded with unlockMet wrapped — the one place game code awards an achievement
//   (history.achievements[id] = now) — so every award is reported with the state and history it was awarded on and
//   the module's own checker, and with accumulateLifetime wrapped, so the run knows which lifetime counters a run
//   folded into a history;
// - src/sim/tick.js is loaded with tick wrapped, so the run knows which states the sim advanced during which test;
// - src/game.js hands the run its game object, whose global history the live achievement wiring awards on;
// - every exported function of the game's code (src/sim, src/meta, src/content, src/ui, src/game.js,
//   src/engine/save.js) reports when it is entered and left, so the run can tell what game code wrote from what
//   test code wrote in between. The event bus is not game code: an event a test emits by hand is test code.
// Each rewrite fails loudly if the function's declaration ever changes.

const WRAPPER = new URL('./wrapper.mjs', import.meta.url).href;
const UNLOCK_DECL = 'export function unlockMet(state, history, now = Date.now()) {';
const FOLD_DECL = 'export function accumulateLifetime(state, history) {';
const CHECK_DECL = 'export function checkAchievement(id, state, history) {';
const PREDICATES_DECL = 'export const SPECIAL_IDS = ';
const TICK_DECL = 'export function tick(state, dt) {';
const GAME_DECL = 'export const game = {';
const GAME_CODE = /\/src\/(sim|meta|content|ui)\/.+\.js$|\/src\/game\.js$|\/src\/engine\/save\.js$/;

/**
 * @param {string} specifier
 * @param {{ parentURL?: string }} context
 * @param {(s: string, c: any) => any} next
 */
export async function resolve(specifier, context, next) {
  const parent = context.parentURL || '';
  if ((specifier === 'node:test' || specifier === 'test') && /\/tests\/[^/]+\.test\.m?js$/.test(parent)) {
    return { url: `${WRAPPER}?from=${encodeURIComponent(parent)}`, shortCircuit: true };
  }
  return next(specifier, context);
}

/**
 * @param {string} src @param {string} url @param {string} decl @param {string} inner @param {string} wrapper
 */
function rewrite(src, url, decl, inner, wrapper) {
  if (!src.includes(decl)) throw new Error(`coverage trace: ${url} no longer declares "${decl}"`);
  return `${src.replace(decl, `function ${inner}${decl.slice(decl.indexOf('('))}`)}\n${wrapper}\n`;
}

/**
 * Every `export function` of a game-code module, wrapped so the run sees game code entered and left.
 * @param {string} src
 */
export function gameCode(src) {
  /** @type {string[]} */
  const names = [];
  const out = src.replace(/^export function (\w+)\s*\(/gm, (_, /** @type {string} */ n) => {
    names.push(n);
    return `function __coverageGc_${n}(`;
  });
  if (!names.length) return src;
  const wrap = (/** @type {string} */ n) =>
    `export function ${n}(...a) {\n  const g = globalThis.__coverageGameCode;\n  if (!g) return __coverageGc_${n}.apply(this, a);\n  g.enter(a);\n  let r;\n  try {\n    return (r = __coverageGc_${n}.apply(this, a));\n  } finally {\n    g.exit(a, r);\n  }\n}`;
  return `${out}\n${names.map(wrap).join('\n')}\n`;
}

/**
 * @param {string} url
 * @param {any} context
 * @param {(u: string, c: any) => Promise<{ format: string, source: any }>} next
 */
export async function load(url, context, next) {
  const r = await next(url, context);
  if (!GAME_CODE.test(url)) return r;
  let src = String(r.source);
  if (/\/src\/meta\/achievements\.js$/.test(url)) {
    for (const d of [CHECK_DECL, PREDICATES_DECL]) if (!src.includes(d)) throw new Error(`coverage trace: ${url} no longer declares "${d}"`);
    const unlock = 'export function unlockMet(state, history, now = Date.now()) {\n  const fresh = __coverageUnlockMet(state, history, now);\n  if (fresh.length) globalThis.__coverageAwarded?.(fresh, state, history, checkAchievement, SPECIAL_IDS);\n  return fresh;\n}';
    const fold = 'export function accumulateLifetime(state, history) {\n  const before = { ...(history?.counters || {}) };\n  const changed = __coverageAccumulateLifetime(state, history);\n  if (changed) globalThis.__coverageFolded?.(history, before);\n  return changed;\n}';
    src = rewrite(src, url, UNLOCK_DECL, '__coverageUnlockMet', unlock);
    src = rewrite(src, url, FOLD_DECL, '__coverageAccumulateLifetime', fold);
  }
  if (/\/src\/sim\/tick\.js$/.test(url)) {
    src = rewrite(src, url, TICK_DECL, '__coverageTick', 'export function tick(state, dt) {\n  globalThis.__coverageTicked?.(state);\n  return __coverageTick(state, dt);\n}');
  }
  if (/\/src\/game\.js$/.test(url)) {
    if (!src.includes(GAME_DECL)) throw new Error(`coverage trace: ${url} no longer declares "${GAME_DECL}"`);
    src = `${src}\nglobalThis.__coverageGame = game;\n`;
  }
  return { format: 'module', source: gameCode(src), shortCircuit: true };
}
