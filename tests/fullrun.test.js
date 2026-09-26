// One life from the first hour of hoarding to the next life: every simulation and meta system is loaded and
// ticks together, the way src/systems.js wires them in the browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/sim/furnActions.js';
import '../src/sim/itemuse.js';
import '../src/sim/weather.js';
import '../src/sim/power.js';
import '../src/sim/cooking.js';
import '../src/sim/farming.js';
import '../src/sim/crafting.js';
import '../src/sim/predisaster.js';
import '../src/sim/horde.js';
import '../src/sim/planning.js';
import '../src/sim/traps.js';
import '../src/sim/wishes.js';
import '../src/sim/autonomy.js';
import '../src/sim/unlocks.js';
import '../src/sim/social.js';
import '../src/sim/phone.js';
import '../src/sim/explore.js';
import '../src/sim/story.js';
import '../src/sim/endings.js';
import '../src/sim/settlement.js';
import '../src/sim/rebirth.js';
import '../src/meta/achievements.js';
import '../src/meta/codex.js';
import '../src/meta/profile.js';
import '../src/meta/endless.js';
import { game, startRun, saveRun, loadRun } from '../src/game.js';
import { tick } from '../src/sim/tick.js';
import { dayNumber, HOUR } from '../src/sim/time.js';
import { count } from '../src/sim/inventory.js';
import { getMods } from '../src/sim/modifiers.js';
import { startTravel, buy } from '../src/sim/predisaster.js';
import { travelMinutes } from '../src/content/shops.js';
import { ledgerTotals } from '../src/sim/settlement.js';
import { prepareNextLoop, buyAbility, deathCause } from '../src/sim/rebirth.js';
import { _resetStorage, loadHistory } from '../src/engine/save.js';

const SLOT = 'slot-fullrun';

function until(s, done, { step = 600, max = 48 * HOUR } = {}) {
  for (let t = 0; t < max && !done(); t += step) tick(s, step);
  return done();
}

test('a full life: hoard before the outbreak, hold out for days, die, and carry progress into the next life', () => {
  _resetStorage();
  game.history = loadHistory();
  let s = startRun({ character: 'wage', seed: 4242, difficulty: 'normal', skipPrologue: true, slot: SLOT });
  assert.equal(s.phase, 'pre');
  assert.equal(game.history.profile.runs, 1);

  // Pre-disaster: a trip to the supermarket and back while the countdown runs.
  const money = s.player.money;
  const walk = travelMinutes('home', 'market') * 60;
  startTravel(s, 'market');
  assert.ok(until(s, () => s.player.scene === 'shop:market', { step: 60, max: walk + 1800 }), 'reached the market');
  for (const id of [2102, 2102, 2102, 2103]) assert.ok(buy(s, 'market', 'staples', id).ok, `bought ${id}`);
  assert.ok(s.player.money < money);
  startTravel(s, 'home');
  assert.ok(until(s, () => s.player.scene === 'home', { step: 60, max: walk + 1800 }), 'back home');
  const bp = s.inventories[s.player.backpack];
  assert.equal(count(bp, 2102), 3, 'the shopping came home');

  // The outbreak at 18:00 turns the run into the siege.
  assert.ok(until(s, () => s.phase === 'post', { step: 300, max: 12 * HOUR }), 'the outbreak happened');
  assert.ok(s.progress.counters['pre.kg'] > 0, 'the hoard was weighed');
  assert.equal(dayNumber(s.clock), 1);

  // Hold out three days on autonomy (eating, sleeping, resting on their own). Save and reload on the way.
  s.ui.autonomy = true;
  assert.ok(until(s, () => s.phase !== 'post' || dayNumber(s.clock) >= 3, { step: 900, max: 3 * 24 * HOUR }));
  assert.equal(s.phase, 'post', `alive on Day 3 (${s.run.deathCause || ''})`);
  assert.ok(saveRun());
  assert.ok(loadRun(SLOT));
  assert.notEqual(game.state, s, 'a fresh object from the save');
  s = game.state;
  assert.equal(dayNumber(s.clock), 3);
  assert.ok(until(s, () => s.phase !== 'post' || dayNumber(s.clock) >= 4, { step: 900, max: 2 * 24 * HOUR }));
  assert.equal(s.phase, 'post', 'alive on Day 4 after the reload');
  assert.ok(game.history.achievements[1001], 'First Night of Disaster unlocked');

  // Starving to death ends the life.
  const inv = (id) => s.inventories[id];
  for (const id of Object.keys(s.inventories)) inv(id).items = inv(id).items.filter((it) => !(it.id >= 2000 && it.id < 3000));
  Object.assign(s.player.stats, { sat: 0, life: 8 });
  assert.ok(until(s, () => s.phase === 'dead', { step: 600, max: 3 * 24 * HOUR }), 'died');
  const cause = deathCause(s);
  assert.ok(cause, 'the death has a cause');
  assert.ok(ledgerTotals(s).day > 0, 'planning points were credited day by day');
  assert.ok(s.run.pointsEarned > 0);

  // The rebirth page: spend points on an ability, then start the next life with the same survivor.
  const loop = prepareNextLoop(s);
  assert.equal(loop.cycle, 2);
  const points = loop.planningPoints;
  const bought = buyAbility({ loop }, 'efficientEating');
  assert.ok(bought.ok, `ability bought (${bought.reason || ''})`);
  assert.equal(loop.planningPoints, points - bought.cost);
  const next = startRun({ character: 'wage', seed: 4243, difficulty: 'normal', skipPrologue: true, slot: SLOT, loop });
  assert.equal(next.loop.cycle, 2);
  assert.equal(next.phase, 'pre', 'the next life starts ten hours before the outbreak again');
  assert.equal(next.loop.planningPoints, points - bought.cost, 'points carried over');
  assert.equal(next.loop.abilities.efficientEating, 1);
  assert.ok(getMods(next).eatSat > getMods(s).eatSat, 'the ability applies in the new life');
  assert.ok(next.loop.memories.some((m) => m.kind === 'death' && m.day >= 4), 'the death is remembered');
  assert.equal(next.loop.history.at(-1).cause, cause);
  assert.equal(next.progress.taboo.rebirth, true, 'Just Once is spent');
  assert.equal(game.history.profile.runs, 2);
  assert.ok(game.history.achievements[1001], 'achievements are global, not per life');
});
