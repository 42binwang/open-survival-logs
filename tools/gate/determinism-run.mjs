// @ts-check
// One seeded headless run for the determinism check: a survivor on autonomy from the first hour of hoarding.
// Prints JSON with the state hash after every game day and at the end.
//   node tools/gate/determinism-run.mjs --seed 4242 --hours 60 [--character wage]   a run of 60 game hours
//   node tools/gate/determinism-run.mjs --seed 4242 --hours 30 --save <file>        … that stops at hour 30 and saves
//   node tools/gate/determinism-run.mjs --resume <file> --hours 60                  Continue from the save to hour 60
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { load, loadSystems } from './sim.mjs';

const { values } = parseArgs({
  options: {
    seed: { type: 'string', default: '4242' },
    hours: { type: 'string', default: '60' },
    character: { type: 'string', default: 'wage' },
    save: { type: 'string' },
    resume: { type: 'string' },
  },
});
const hours = Number(values.hours);

await loadSystems();
const { newGame, ensureSystems } = await load('src/sim/state.js');
const { tick } = await load('src/sim/tick.js');
const { bumpMods } = await load('src/sim/modifiers.js');
const { serialize } = await load('src/engine/save.js');

/** @type {any} */
let state;
if (values.resume) {
  // what Continue does (adoptState in src/game.js)
  state = JSON.parse(readFileSync(values.resume, 'utf8'));
  bumpMods(state);
  ensureSystems(state);
} else {
  // meta.id and meta.created come from the wall clock; everything else must follow from the seed
  state = newGame({ seed: Number(values.seed), id: 'determinism', character: values.character, difficulty: 'normal', skipPrologue: true });
  state.meta.created = 0;
  state.ui.autonomy = true;
}

// The saved state, minus modsVer: the modifier-cache version is not game state and is bumped on every load.
const hash = () => {
  const s = JSON.parse(serialize(state));
  delete s.modsVer;
  return createHash('sha256').update(JSON.stringify(s)).digest('hex').slice(0, 16);
};

/** @type {string[]} */
const days = [];
for (let h = Math.round(state.clock.t / 3600) + 1; h <= hours; h++) {
  tick(state, 3600);
  if (h % 24 === 0) days.push(hash());
  if (state.phase === 'dead' || state.phase === 'ending') break;
}
if (values.save) writeFileSync(values.save, serialize(state));
console.log(JSON.stringify({ seed: state.meta.seed, character: state.meta.character, hours, phase: state.phase, t: state.clock.t, days, final: hash() }));
