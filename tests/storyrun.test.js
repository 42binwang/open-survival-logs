// Whole story runs with every simulation and meta system ticking together: the horde calendar, the Day 70
// reckoning, the commitment, the final horde and the ending. The survivor is kept fed and the openings are
// patched between attacks so only the calendar and the wiring between systems are under test.
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
import { game, startRun } from '../src/game.js';
import { tick } from '../src/sim/tick.js';
import { dayNumber } from '../src/sim/time.js';
import { addItem } from '../src/sim/inventory.js';
import { doorAndWindows, effectiveMaxHp } from '../src/sim/home.js';
import { activeEvent, resolveEvent, presentNext, finalWaveDay, commitRoute, canCommit, updateRouteAvailability } from '../src/sim/story.js';
import { finishPreparation } from '../src/sim/predisaster.js';
import { installablePackages, slotsFor, queueInstall } from '../src/sim/planning.js';
import { RECORDER_ITEM } from '../src/sim/story.js';
import { closeSettlement } from '../src/sim/settlement.js';
import { neighborState, addNeighborAffinity } from '../src/sim/social.js';
import { KIT_ITEM, ENDINGS } from '../src/content/endings.js';
import { _resetStorage, loadHistory } from '../src/engine/save.js';

function patchUp(s) {
  Object.assign(s.player.stats, { sat: 90, sta: 95, mor: 90, life: 100 });
  s.player.effects = {};
  for (const f of doorAndWindows(s)) f.hp = effectiveMaxHp(f);
}

// Ten game minutes at a time: keep the survivor alive, take default choices, skip the plans.
function holdOut(s, done, maxDays = 110, each = null) {
  const hordes = new Set();
  for (let i = 0; i < maxDays * 144 && s.phase === 'post' && !done(); i++) {
    patchUp(s);
    each?.(s);
    tick(s, 600);
    for (const cr of s.crises?.active || []) if (cr.type === 'horde') hordes.add(dayNumber(s.clock));
    for (let a = activeEvent(s); a; a = presentNext(s)) resolveEvent(s, null);
    if (s.run.settlement) closeSettlement(s);
  }
  return hordes;
}

function begin(character, seed) {
  _resetStorage();
  game.history = loadHistory();
  const s = startRun({ character, seed, difficulty: 'normal', skipPrologue: true, slot: `slot-story-${seed}` });
  finishPreparation(s);
  assert.equal(s.phase, 'post');
  return s;
}

test('an uncommitted story run: the horde calendar, the Day 70 reckoning, the final horde on Day 87 and Last One Standing on Day 101', () => {
  const s = begin('wage', 901);
  const hordes = holdOut(s, () => s.phase !== 'post');
  assert.equal(s.phase, 'ending', `the run ended (${s.run.deathCause || ''})`);
  assert.equal(s.run.ending, 'lastOne');
  assert.equal(s.run.endingDay, 101);
  assert.equal(finalWaveDay(s), 87);
  for (const day of [7, 15, 49, 87]) assert.ok(hordes.has(day) || hordes.has(day + 1), `a horde around Day ${day} (${[...hordes].join(',')})`);
  assert.ok(s.story.tags.TAG_RECKONING, 'the reckoning happened');
  assert.ok(s.story.tags.TAG_FINAL_WAVE_SURVIVED, 'the final horde was survived');
  assert.ok(game.history.achievements[1008], 'One Hundred Days');
  assert.ok(game.history.achievements[1007], 'The Final Horde');
});

const finalHorde = (s) => s.crises.history.find((h) => h.type === 'horde' && h.final);

test('committing to the Truth moves the final horde to the night of Day 83, and the ending lands on Day 84', async () => {
  const s = begin('wage', 902);
  holdOut(s, () => dayNumber(s.clock) >= 71);
  for (const id of [9041, 9042, 9043, 9049]) addItem(s, s.inventories[s.player.backpack], id);
  addItem(s, s.inventories[s.player.backpack], KIT_ITEM);
  holdOut(s, () => s.story.tags.TAG_LINE_TRUTH_EXPLORED, 2);
  const pkg = installablePackages(s).find((p) => p.itemId === RECORDER_ITEM);
  assert.ok(pkg, 'the recorder installs like furniture');
  assert.ok(queueInstall(s, pkg.invId, pkg.uid, slotsFor(s, pkg.furnCfg)[0].id));
  holdOut(s, () => !s.actions.current && !s.actions.queue.length, 1);
  updateRouteAvailability(s);
  assert.equal(canCommit(s, 'truth'), true);
  commitRoute(s, 'truth');
  assert.equal(s.story.route, 'truth');
  assert.equal(finalWaveDay(s), 83);
  const hordes = holdOut(s, () => s.phase !== 'post');
  assert.ok(hordes.has(83), `the final horde came on Day 83 (${[...hordes].join(',')})`);
  assert.equal(finalHorde(s)?.day, 83);
  assert.equal(s.run.ending, 'truth', `ending ${s.run.ending} (${s.story.flags.routeFailed ? 'route failed' : ''})`);
  assert.equal(s.run.endingDay, 84, 'the guide’s Day 84 ending');
  assert.equal(dayNumber(s.clock), ENDINGS.truth.day, 'the clock agrees with the ending screen');
  assert.equal(game.history.endings.truth, true, 'recorded in the global history');
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(game.history.achievements[1105], 'The Truth');
});

test('committing to Side By Side moves the final horde to the night of Day 85, and the ending lands on Day 86', async () => {
  const s = begin('wage', 903);
  const feedNeighbor = () => {
    const n = neighborState(s);
    if (n.alive) n.foodDays = Math.max(n.foodDays, 3);
  };
  holdOut(s, () => dayNumber(s.clock) >= 71, 110, feedNeighbor);
  // the basket rescues and the winter rescue are driven for real in tests/coverage_p.test.js (P06/P11)
  addNeighborAffinity(s, 600);
  s.story.tags.TAG_NEIGHBOR_RESCUE2_COMPLETE = true;
  addItem(s, s.inventories[s.player.backpack], KIT_ITEM);
  updateRouteAvailability(s);
  assert.equal(canCommit(s, 'girl'), true);
  commitRoute(s, 'girl');
  assert.equal(finalWaveDay(s), 85);
  s.story.tags.TAG_NEIGHBOR_RESCUE3_COMPLETE = true;
  const hordes = holdOut(s, () => s.phase !== 'post', 110, feedNeighbor);
  assert.equal(finalHorde(s)?.day, 85, `the final horde came on the night of Day 85 (${[...hordes].join(',')})`);
  assert.equal(s.run.ending, 'girl', `ending ${s.run.ending} (${s.story.flags.routeFailed ? 'route failed' : ''})`);
  assert.equal(s.run.endingDay, 86, 'the guide’s Day 86 ending');
  assert.equal(dayNumber(s.clock), ENDINGS.girl.day, 'the clock agrees with the ending screen');
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(game.history.achievements[1102], 'Side By Side');
});
