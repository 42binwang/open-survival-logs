#!/usr/bin/env node
// @ts-check
// Saves for the frame-time scenarios, written by the game's own save code (src/engine/save.js through a localStorage
// stand-in) so the title screen's Continue loads them like any save. Prints one JSON line { key, value, summary }.
//   node tools/budgets/scenario.mjs new --home <home>          New Game in that home (its survivor), hour 0
//   node tools/budgets/scenario.mjs final-horde --home <home>  the Day 87 final horde at its peak night wave, in a storm
//   node tools/budgets/scenario.mjs site                       the exploration site with the most zombies, forced at
//                                                              night (src/sim/explore.js arrive(): × 1.3 night, × 1.5 forced)
// Homes: apartment, duplex, warehouse (src/content/characters.js). Exit code 0, 1 when the scenario is not reached,
// 2 bad usage.
import { parseArgs } from 'node:util';
import { load, loadSystems } from '../gate/sim.mjs';

export const SCENARIO_KINDS = Object.freeze(['new', 'final-horde', 'site']);

/** @type {{ home?: string, seed?: string }} */
let opts = {};
/** @type {string[]} */
let rest = [];
try {
  const p = parseArgs({ options: { home: { type: 'string' }, seed: { type: 'string' } }, allowPositionals: true });
  opts = p.values;
  rest = p.positionals;
} catch (err) {
  console.error(`scenario: ${/** @type {Error} */ (err).message}`);
  process.exit(2);
}
const which = rest[0] || '';
if (!SCENARIO_KINDS.includes(which)) {
  console.error(`scenario: unknown scenario '${which}' (have ${SCENARIO_KINDS.join(', ')})`);
  process.exit(2);
}

/** @type {Map<string, string>} */
const mem = new Map();
const storage = {
  getItem: (/** @type {string} */ k) => (mem.has(k) ? /** @type {string} */ (mem.get(k)) : null),
  setItem: (/** @type {string} */ k, /** @type {string} */ v) => void mem.set(k, String(v)),
  removeItem: (/** @type {string} */ k) => void mem.delete(k),
};
Object.defineProperty(globalThis, 'localStorage', { value: new Proxy(storage, { ownKeys: () => [...mem.keys()], getOwnPropertyDescriptor: (_t, k) => (mem.has(String(k)) ? { enumerable: true, configurable: true, value: mem.get(String(k)) } : undefined) }), configurable: true });

const quiet = console.error;
console.error = (/** @type {unknown[]} */ ...a) => (String(a[0]).includes('listener for') ? undefined : quiet(...a));
await loadSystems();
const { newGame } = await load('src/sim/state.js');
const { tick } = await load('src/sim/tick.js');
const { dayNumber, hourOfDay, isNight } = await load('src/sim/time.js');
const { effectiveMax } = await load('src/sim/stats.js');
const { doorAndWindows, effectiveMaxHp } = await load('src/sim/home.js');
const { homeZombies } = await load('src/sim/horde.js');
const explore = await load('src/sim/explore.js');
const { saveGame } = await load('src/engine/save.js');
const { CHARACTERS } = await load('src/content/characters.js');

const chars = /** @type {{ id: string, home: string }[]} */ (Object.values(CHARACTERS));
const home = opts.home || 'apartment';
const character = chars.find((c) => c.home === home)?.id;
if (!character) {
  console.error(`scenario: no survivor lives in '${home}' (homes: ${[...new Set(chars.map((c) => c.home))].join(', ')})`);
  process.exit(2);
}
const id = `budget-${which}-${home}`;
const state = newGame({ seed: Number(opts.seed || 4242), id, character, difficulty: 'normal', skipPrologue: true });
state.meta.created = 0;
state.ui.autonomy = true;

/** keeps the survivor and the house standing, so the run reaches the scenario */
function sustain() {
  for (const k of ['sat', 'sta', 'mor', 'life']) state.player.stats[k] = effectiveMax(state, k);
  for (const f of doorAndWindows(state)) f.hp = effectiveMaxHp(f);
}
/** @param {string} msg */
function unreached(msg) {
  console.error(`scenario: ${msg}`);
  process.exit(1);
}
/** @returns {string} */
function snapshot() {
  saveGame(id, state);
  return /** @type {string} */ (mem.get(`survivalLog.save.${id}`));
}
const attacking = () => state.crises.active.some((/** @type {any} */ c) => c.type === 'horde' && c.phase === 'attack');

let value = '';
/** @type {Record<string, unknown>} */
let extra = {};
if (which === 'new') value = snapshot();
else if (which === 'final-horde') {
  while (dayNumber(state.clock) < 87 && state.phase !== 'dead' && state.phase !== 'ending') {
    tick(state, 3600);
    sustain();
  }
  for (let m = 0; m < 24 * 60 && !attacking(); m += 5) {
    tick(state, 300);
    sustain();
  }
  if (!attacking()) unreached(`the Day 87 horde did not attack (day ${dayNumber(state.clock)}, ${state.phase})`);
  let best = -1;
  for (let m = 0; m < 12 * 60 && attacking(); m += 2) {
    tick(state, 120);
    sustain();
    const n = homeZombies(state).length;
    if (isNight(state.clock) && n > best) {
      best = n;
      state.weather.today = { ...state.weather.today, kind: 'storm' };
      value = snapshot();
      extra = { zombies: n, day: dayNumber(state.clock), hour: Math.floor(hourOfDay(state.clock)) };
    }
  }
  if (best < 0) unreached('the final horde never attacked at night');
} else {
  while (state.phase === 'pre') {
    tick(state, 3600);
    sustain();
  }
  const top = /** @type {{ id: string, zombies: number }[]} */ (explore.sites()).reduce((a, b) => (b.zombies > a.zombies ? b : a));
  let tries = 0;
  while (tries++ < 40 * 24) {
    const st = explore.siteStatus(state, top.id);
    if (isNight(state.clock) && st.forcedOk && !attacking()) {
      state.player.stats.sta = effectiveMax(state, 'sta');
      const r = explore.startExploration(state, top.id, { forced: true });
      if (r?.ok !== false) break;
    }
    tick(state, 3600);
    sustain();
  }
  for (let m = 0; m < 6 * 60 && explore.exploreRun(state)?.phase !== 'site'; m += 1) tick(state, 60);
  const run = explore.exploreRun(state);
  if (run?.phase !== 'site') unreached(`never arrived at ${top.id}`);
  value = snapshot();
  extra = { site: top.id, zombies: run.zombies.length, day: dayNumber(state.clock), hour: Math.floor(hourOfDay(state.clock)) };
}
const key = `survivalLog.save.${id}`;
console.log(JSON.stringify({ key, value, summary: { kind: which, home, character, day: dayNumber(state.clock), hour: Math.floor(hourOfDay(state.clock)), weather: state.weather.today?.kind, phase: state.phase, ...extra } }));
