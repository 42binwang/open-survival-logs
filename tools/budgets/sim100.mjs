#!/usr/bin/env node
// @ts-check
// The 100-day headless sim budget: one seeded run of the real sim (every system src/systems.js wires) from the first
// hour of preparation to the end of Day 100, in one-hour ticks (the sim sub-steps them at 30 s, as the game does at
// high speed). The survivor is kept going so the run lasts all 100 days: every game hour the four stats and every
// door and window go back to full. Everything else (hordes, weather, farming, spoilage, social, story) runs as in
// play. The house starts stocked like a late game: every storage grid in the home is filled with the game's food,
// material and medicine items (as many as fit), so spoilage, crafting lookups and autonomy scan full inventories.
// Prints one JSON line { ms, days, hours, phase, stocked }.
//   node tools/budgets/sim100.mjs [--seed 4242] [--days 100] [--character wage] [--difficulty normal] [--bare]
import { parseArgs } from 'node:util';
import { load, loadSystems } from '../gate/sim.mjs';

const { values } = parseArgs({
  options: { seed: { type: 'string', default: '4242' }, days: { type: 'string', default: '100' }, character: { type: 'string', default: 'wage' }, difficulty: { type: 'string', default: 'normal' }, bare: { type: 'boolean' } },
});
const days = Number(values.days);

const quiet = console.error;
console.error = (/** @type {unknown[]} */ ...a) => (String(a[0]).includes('listener for') ? undefined : quiet(...a));
await loadSystems();
const { newGame } = await load('src/sim/state.js');
const { tick } = await load('src/sim/tick.js');
const { dayNumber } = await load('src/sim/time.js');
const { effectiveMax } = await load('src/sim/stats.js');
const { doorAndWindows, effectiveMaxHp } = await load('src/sim/home.js');
const { addItem } = await load('src/sim/inventory.js');
const db = await load('src/data/db.js');

const state = newGame({ seed: Number(values.seed), id: 'budget-sim100', character: values.character, difficulty: values.difficulty, skipPrologue: true });
state.meta.created = 0;
state.ui.autonomy = true;

/** fills every non-backpack grid of the home with food, materials and medicine, round-robin, until nothing fits */
function stock() {
  const cats = new Set([db.CAT.FOOD, db.CAT.MATERIAL, db.CAT.MEDICINE].filter((c) => c != null));
  const ids = [];
  for (let id = 1; id < 60000 && ids.length < 400; id++) if (cats.has(db.item(id)?.cat)) ids.push(id);
  let items = 0;
  for (const inv of Object.values(state.inventories)) {
    if (/** @type {any} */ (inv).kind === 'backpack') continue;
    let misses = 0;
    for (let k = 0; misses < ids.length && k < 5000; k++) {
      const r = addItem(state, inv, ids[k % ids.length]);
      if (r && r.ok !== false) {
        items++;
        misses = 0;
      } else misses++;
    }
  }
  return items;
}
const stocked = values.bare ? 0 : stock();

/** keeps the survivor and the house standing, so the run covers every day */
function sustain() {
  for (const k of ['sat', 'sta', 'mor', 'life']) state.player.stats[k] = effectiveMax(state, k);
  for (const f of doorAndWindows(state)) f.hp = effectiveMaxHp(f);
}

const t0 = performance.now();
let hours = 0;
while (state.phase !== 'dead' && state.phase !== 'ending' && !(state.phase === 'post' && dayNumber(state.clock) > days)) {
  tick(state, 3600);
  sustain();
  hours++;
}
const ms = performance.now() - t0;
console.log(JSON.stringify({ ms: Math.round(ms), days: dayNumber(state.clock) - 1, hours, phase: state.phase, stocked }));
