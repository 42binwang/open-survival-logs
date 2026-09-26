// @ts-check
// One coverage run: plan the driver tasks the chosen families need, run them on worker threads alongside the traced
// test run and the keys audit, then evaluate every family, and self-check that every in-scope check is one some probe
// can pass (selfcheck.mjs).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { furnitureScope, gameConfig } from './data.mjs';
import { readManifests } from './manifests.mjs';
import { emptyObs } from './observe.mjs';
import { defaultWorkers, runTasks } from './pool.mjs';
import { impossibleChecks } from './selfcheck.mjs';
import { ROOT } from './sim.mjs';
import { traceTests } from './trace.mjs';
import * as items from './families/items.mjs';
import * as furniture from './families/furniture.mjs';
import * as funcs from './families/funcs.mjs';
import * as cooking from './families/cooking.mjs';
import * as crafting from './families/crafting.mjs';
import * as plants from './families/plants.mjs';
import * as achievements from './families/achievements.mjs';

// The patch-note family (families/news.mjs) read the developer's patch notes, which this repository does not ship.
export const FAMILIES = ['items', 'furniture', 'funcs', 'cooking', 'crafting', 'plants', 'achievements'];
export const NEWS_MAP = 'docs/coverage/news-map.json';

// Every driver that can hand the survivor an item or use one up.
const ITEM_DRIVERS = ['starter', 'shops', 'explore', 'cooking', 'crafting', 'farming', 'traps', 'events', 'people', 'itemuse', 'brewing', 'timeline', 'furniture'];
/** @type {Record<string, string[]>} drivers each family reads */
const NEEDS = {
  items: ITEM_DRIVERS,
  furniture: [...ITEM_DRIVERS, 'scenes', 'sitefx'],
  funcs: ['specs', 'furniture', 'shops', 'sitefx'],
  cooking: ['cooking'],
  crafting: ['crafting', 'events', 'explore', 'timeline', 'people', 'starter', 'milestones'],
  plants: ['farming'],
  achievements: [],
  news: [],
};

/** @param {any[]} list @param {number} n */
const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

/**
 * The driver tasks a set of families needs, longest first.
 * @param {import('./data.mjs').Config} cfg
 * @param {string[]} families
 * @returns {import('./pool.mjs').Task[]}
 */
export function planTasks(cfg, families) {
  const need = new Set(families.flatMap((f) => NEEDS[f] || []));
  /** @type {import('./pool.mjs').Task[]} */
  const tasks = [];
  const ids = (/** @type {Record<string, any>} */ t) => Object.keys(t).map(Number);
  const add = (/** @type {string} */ driver, /** @type {any} */ args, cost = 1, label = '') => tasks.push({ driver, args, cost, label });
  if (need.has('starter')) add('starter', {});
  if (need.has('shops')) for (const character of ['wage', 'student', 'warehouse']) add('shops', { characters: [character] }, 1, character);
  if (need.has('explore')) for (const site of ['streets', 'hardware', 'supermarket', 'school', 'hospital', 'office']) add('explore', { sites: [site] }, site === 'streets' || site === 'hardware' ? 6 : 2, site);
  if (need.has('cooking')) for (const c of chunks(ids(cfg.recipes), 40)) add('cooking', { recipes: c }, 4, `${c[0]}…`);
  if (need.has('crafting')) for (const c of chunks(ids(cfg.crafts), 75)) add('crafting', { crafts: c }, 2, `${c[0]}…`);
  if (need.has('farming')) {
    const byGrow = ids(cfg.plants).sort((a, b) => cfg.plants[b].grow - cfg.plants[a].grow);
    for (let i = 0; i < 10; i++) {
      const c = byGrow.filter((_, k) => k % 10 === i);
      if (c.length) add('farming', { plants: c }, 8, `${c[0]}…`);
    }
  }
  if (need.has('traps')) add('traps', {}, 2);
  if (need.has('events')) add('events', {}, 2);
  if (need.has('people')) for (const part of ['trade', 'aid', 'neighbor', 'wm', 'veteran', 'cat', 'scavenge']) add('people', { part }, part === 'cat' ? 8 : 3, part);
  if (need.has('itemuse')) for (const c of chunks(ids(cfg.items), 600)) add('itemuse', { items: c }, 2, `${c[0]}…`);
  if (need.has('brewing')) add('brewing', {}, 2);
  if (need.has('timeline')) {
    for (const character of ['wage', 'student', 'warehouse']) add('timeline', { character }, 6, character);
    add('timeline', { character: 'wage', mode: 'pureEndless', days: 30 }, 5, 'pure endless');
  }
  if (need.has('furniture')) {
    const scope = furnitureScope(cfg);
    const inScope = ids(cfg.furniture).filter((id) => !scope.get(id)?.excluded);
    for (const c of chunks(inScope, 60)) add('furniture', { furniture: c }, 3, `${c[0]}…`);
  }
  if (need.has('sitefx')) for (const site of ['streets', 'hardware', 'supermarket', 'school', 'hospital', 'office']) add('sitefx', { sites: [site] }, 2, site);
  if (need.has('scenes')) add('scenes', {}, 2);
  if (need.has('specs')) add('specs', { funcs: ids(cfg.funcs) });
  if (need.has('milestones')) add('milestones', {});
  return tasks;
}

/** The keys audit's list of declared keys with their producer sites (tools/keys-audit.mjs --json --list). */
async function keysList(/** @type {string} */ root) {
  if (!existsSync(join(root, 'tools/keys-audit.mjs'))) return { keys: null, problem: 'tools/keys-audit.mjs is missing' };
  const out = await new Promise((resolve) => {
    const child = spawn(process.execPath, ['tools/keys-audit.mjs', '--json', '--list'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] });
    let s = '';
    child.stdout.on('data', (d) => (s += d));
    child.on('close', () => resolve(s));
  });
  try {
    return { keys: JSON.parse(/** @type {string} */ (out)).keys, problem: null };
  } catch {
    return { keys: null, problem: 'tools/keys-audit.mjs --json --list printed no report' };
  }
}

/**
 * @typedef {object} RunOptions
 * @property {string[]} [families]
 * @property {number} [workers]
 * @property {boolean} [trace]  run the traced test suite (funcs and achievements need it)
 * @property {string} [root]
 * @property {(msg: string) => void} [progress]
 */

/**
 * @param {RunOptions} [opts]
 */
export async function runCoverage({ families = FAMILIES, workers = defaultWorkers(), trace = true, root = ROOT, progress = () => {} } = {}) {
  const t0 = performance.now();
  const cfg = gameConfig();
  const tasks = planTasks(cfg, families);
  let done = 0;
  progress(`${tasks.length} driver tasks on ${workers} worker thread(s)${trace && (families.includes('funcs') || families.includes('achievements')) ? ' + the traced test run' : ''}`);
  const wantsTrace = trace && (families.includes('funcs') || families.includes('achievements'));
  const [obs, traced, keys] = await Promise.all([
    tasks.length ? runTasks(tasks, { workers, onDone: () => (++done % 10 === 0 || done === tasks.length) && progress(`drivers ${done}/${tasks.length}`) }) : Promise.resolve(emptyObs()),
    wantsTrace ? traceTests({ root }).then((t) => (progress(`traced ${t.tests.length} tests`), t)) : Promise.resolve(null),
    families.includes('achievements') ? keysList(root) : Promise.resolve({ keys: null, problem: null }),
  ]);
  const manifests = readManifests(root);
  /** @type {import('./family.mjs').Family[]} */
  const results = [];
  for (const id of families) {
    if (id === 'items') results.push(items.evaluate({ cfg, obs }));
    if (id === 'furniture') results.push(furniture.evaluate({ cfg, obs, manifests }));
    if (id === 'funcs') results.push(funcs.evaluate({ cfg, obs, trace: traced }));
    if (id === 'cooking') results.push(cooking.evaluate({ cfg, obs }));
    if (id === 'crafting') results.push(crafting.evaluate({ cfg, obs }));
    if (id === 'plants') results.push(plants.evaluate({ cfg, obs }));
    if (id === 'achievements') results.push(achievements.evaluate({ cfg, trace: traced, keys: keys.keys }));
  }
  const impossible = impossibleChecks(cfg, families, { news: [] });
  const problems = [...obs.errors];
  if (traced?.problems.length && !traced.tests.length) problems.push(...traced.problems.map((p) => `trace: ${p}`));
  if (keys.problem) problems.push(`keys: ${keys.problem}`);
  const warnings = [...obs.warnings, ...(traced?.tests.length ? traced.problems.map((p) => `trace: ${p}`) : [])];
  return { families: results, problems, warnings, impossible, obs, trace: traced, ms: performance.now() - t0, tasks: tasks.length };
}
