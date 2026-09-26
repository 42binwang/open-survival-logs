// @ts-check
// The real simulation, headless, for the balance bots: every sim and meta module src/systems.js wires (so every
// system and action kind registers the way it does in the browser), plus the modules the bots call. Module
// namespaces come back untyped: the sim is plain JavaScript.
import { load, loadSystems } from '../gate/sim.mjs';

/** @type {Promise<Record<string, any>> | null} */
let loading = null;

/** @returns {Promise<Record<string, any>>} */
export function loadSim() {
  if (!loading) loading = loadAll();
  return loading;
}

async function loadAll() {
  // src/meta/endless.js pulls in UI code whose 'openPanel' listeners need a page; headless, the bus logs each
  // failure (docs/bugs.jsonl). Only those lines are dropped.
  const error = console.error;
  console.error = (/** @type {unknown[]} */ ...a) => (typeof a[0] === 'string' && a[0].startsWith('listener for openPanel failed') ? undefined : error(...a));
  await loadSystems();
  /** @type {Record<string, string>} */
  const names = {
    state: 'src/sim/state.js',
    tick: 'src/sim/tick.js',
    time: 'src/sim/time.js',
    actions: 'src/sim/actions.js',
    stats: 'src/sim/stats.js',
    modifiers: 'src/sim/modifiers.js',
    home: 'src/sim/home.js',
    inventory: 'src/sim/inventory.js',
    furnActions: 'src/sim/furnActions.js',
    predisaster: 'src/sim/predisaster.js',
    horde: 'src/sim/horde.js',
    explore: 'src/sim/explore.js',
    suggest: 'src/sim/suggest.js',
    itemuse: 'src/sim/itemuse.js',
    settlement: 'src/sim/settlement.js',
    rebirth: 'src/sim/rebirth.js',
    spoilage: 'src/sim/spoilage.js',
    save: 'src/engine/save.js',
    db: 'src/data/db.js',
    shops: 'src/content/shops.js',
    story: 'src/sim/story.js',
    itemEffects: 'src/content/itemEffects.js',
    proficiency: 'src/sim/proficiency.js',
    weather: 'src/sim/weather.js',
    planning: 'src/sim/planning.js',
    crafting: 'src/sim/crafting.js',
    cooking: 'src/sim/cooking.js',
    farming: 'src/sim/farming.js',
    traps: 'src/sim/traps.js',
    power: 'src/sim/power.js',
    social: 'src/sim/social.js',
    difficulty: 'src/content/difficulty.js',
  };
  /** @type {Record<string, any>} */
  const out = {};
  for (const [k, rel] of Object.entries(names)) out[k] = await load(rel);
  return out;
}
