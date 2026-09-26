import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, newLoopData } from '../src/sim/state.js';
import { tick, die } from '../src/sim/tick.js';
import { getMods } from '../src/sim/modifiers.js';
import { count } from '../src/sim/inventory.js';
import { addPoints, ledgerTotals } from '../src/sim/settlement.js';
import { prepareNextLoop, prepareTearUp, buyAbility, refundRoundAbilities, takeSnapshot, listSnapshots, clearSnapshots, rewindOptions, rewindTo, rewindCost, deathCause, causeLabel, NOTE_ITEMS, NOTE_SHARE } from '../src/sim/rebirth.js';
import { addStat } from '../src/sim/stats.js';
import { BOOKS } from '../src/content/itemEffects.js';

function postDisaster(opts = {}) {
  const s = newGame({ seed: 51, ...opts });
  s.phase = 'post';
  s.clock.t = s.clock.outbreakAt + 5 * 3600; // 23:00 on Day 1
  s.run.day = 1;
  return s;
}

// Start of Day 1: the outbreak hits at 18:00 through the tick loop.
function fromOutbreak(opts = {}) {
  const s = newGame({ seed: 52, ...opts });
  s.clock.t = s.clock.outbreakAt - 60;
  tick(s, 120);
  assert.equal(s.phase, 'post');
  return s;
}

function floorCount(s, id) {
  return s.floorBoxes.reduce((n, b) => n + count(s.inventories[b.inv], id), 0);
}

// Keeps the survivor healthy through long ticks so only the tested death happens.
function live(s, seconds) {
  for (let left = seconds; left > 0; left -= 6 * 3600) {
    Object.assign(s.player.stats, { sat: 90, sta: 90, mor: 90, life: 100 });
    tick(s, Math.min(6 * 3600, left));
  }
}

test('prepareNextLoop carries points, abilities, memories and rebirth notes into the next cycle', () => {
  const s = postDisaster();
  addPoints(s, 150, 'event');
  s.loop.abilities.quickRest = 2;
  s.loop.memories.push({ id: 'blackout', day: 7, text: { en: 'The city grid fails on Day 7.', zh: '第7天全城停电。' } });
  s.loop.bestDay = 3;
  s.progress.prof.cook = { lv: 3, exp: 200 }; // the Wage Slave starts at cooking Lv1
  s.progress.prof.defense = { lv: 2, exp: 0 };
  s.social.neighbor = { affinity: 4 };
  s.clock.t += 4 * 86400;
  s.run.day = 5;
  die(s, 'zombies');
  const next = prepareNextLoop(s);

  assert.equal(next.cycle, 2);
  assert.equal(next.planningPoints, 150);
  assert.equal(next.abilities.quickRest, 2);
  assert.deepEqual(next.abilitiesThisRound, {});
  assert.equal(next.pointsSpentThisRound, 0);
  assert.equal(next.bestDay, 5);
  assert.equal(next.neighborAffinity, 2, 'half the neighbor affinity carries over');
  assert.equal(next.ngPlus, true);
  assert.equal(next.rebirths, 1);
  assert.equal(next.usedRebirth, true);
  assert.ok(next.memories.some((m) => m.id === 'blackout'), 'memories are kept');
  const death = next.memories.find((m) => m.kind === 'death');
  assert.equal(death.day, 5);
  assert.equal(death.cause, 'zombies');
  assert.deepEqual(next.history.at(-1), { cycle: 1, character: 'wage', day: 5, cause: 'zombies', ending: null, points: 150, mode: 'story', difficulty: 'normal' });

  const cookNotes = next.notes.filter((n) => n.prof === 'cook');
  const cookExp = cookNotes.reduce((a, n) => a + n.exp, 0);
  const earned = 600 + 1800 + 200;
  assert.ok(Math.abs(cookExp - earned * NOTE_SHARE) <= BOOKS[NOTE_ITEMS.cook.small].prof.cook / 2, `cook notes restore ~70% (${cookExp})`);
  assert.ok(cookNotes.every((n) => n.id === NOTE_ITEMS.cook.small), 'too little exp for an organized note (4600 exp)');
  assert.deepEqual(
    next.notes.filter((n) => n.prof === 'defense').map((n) => [n.id, n.n]),
    [[NOTE_ITEMS.defense.small, 1]]
  );
  assert.ok(!next.notes.some((n) => n.prof === 'craft'), 'no notes for the starting level');
  assert.equal(s.loop.cycle, 1, 'the finished run is untouched');
});

test('a new round puts the rebirth notes in the backpack; notes that do not fit drop at the survivor\'s feet', () => {
  const loop = { ...newLoopData(), cycle: 2, notes: [{ prof: 'cook', id: 3042, n: 3, exp: 1800 }, { prof: 'craft', id: 3027, n: 70, exp: 10500 }] };
  const s = newGame({ seed: 53, loop });
  const bp = s.inventories[s.player.backpack];
  assert.equal(count(bp, 3042), 3);
  const dropped = floorCount(s, 3027);
  assert.ok(dropped > 0, 'overflow dropped');
  assert.equal(count(bp, 3027) + dropped, 70, 'no note is lost');
  assert.deepEqual(s.run.notesPlaced, { packed: 3 + count(bp, 3027), dropped });
  assert.ok(s.floorBoxes.every((b) => b.floor === s.player.floor && Math.abs(b.x - s.player.x) + Math.abs(b.y - s.player.y) <= 1));
});

test('rebirth-page abilities apply at the round start; tearing up refunds this round\'s abilities and is not a rebirth', () => {
  const dead = postDisaster();
  addPoints(dead, 200, 'event');
  dead.loop.abilities.quickRest = 1; // from an earlier round
  die(dead, 'life');
  const prepared = prepareNextLoop(dead);
  const r = buyAbility({ loop: prepared }, 'savings');
  assert.equal(r.ok, true);
  assert.equal(prepared.planningPoints, 150);

  const s = newGame({ seed: 54, loop: prepared });
  const base = newGame({ seed: 54 });
  assert.equal(s.player.money, base.player.money + 150, 'Savings applies to the starting money');
  assert.equal(ledgerTotals(s).carried, 200);
  assert.equal(ledgerTotals(s).ability, -50);
  assert.equal(s.run.roundStart.points, 200);

  const carry = s.inventories[s.player.backpack].maxKg;
  assert.equal(buyAbility(s, 'quickRest').cost, 80);
  assert.equal(buyAbility(s, 'broadShoulders').ok, true);
  assert.equal(s.inventories[s.player.backpack].maxKg, carry + 5);
  assert.equal(getMods(s).carryKg, 5);
  assert.equal(buyAbility(s, 'energyManagement').reason, 'points');
  assert.deepEqual(s.loop.abilitiesThisRound, { savings: 1, quickRest: 1, broadShoulders: 1 });
  assert.equal(s.loop.pointsSpentThisRound, 170);
  assert.equal(s.loop.planningPoints, 30);
  assert.equal(ledgerTotals(s).ability, -170);
  addPoints(s, 40, 'event');

  const { loop, refunded } = prepareTearUp(s);
  assert.equal(refunded, 170);
  assert.deepEqual(loop.abilities, { quickRest: 1 }, 'levels from earlier rounds stay');
  assert.equal(loop.planningPoints, 200, 'the balance returns to how the round began, before any ability purchases');
  assert.equal(loop.cycle, 2, 'same loop');
  assert.equal(loop.rebirths, prepared.rebirths, 'not a rebirth');
  assert.equal(loop.history.at(-1).torn, true);

  const rewritten = newGame({ seed: s.meta.seed, loop });
  assert.equal(rewritten.loop.cycle, 2);
  assert.equal(rewritten.player.money, base.player.money);
  assert.equal(ledgerTotals(rewritten).carried, 200);

  assert.equal(refundRoundAbilities(s), 170);
  assert.deepEqual(s.loop.abilities, { quickRest: 1 });
  assert.equal(s.loop.planningPoints, 240);
  assert.equal(getMods(s).carryKg, 0, 'mods rebuilt after the refund');
  assert.equal(s.inventories[s.player.backpack].maxKg, carry, 'Broad Shoulders taken back');
});

test('"I want to persist!" restores a daily snapshot, costs Planning Points and sets the rebirth taboo', () => {
  const s = fromOutbreak();
  addPoints(s, 100, 'event');
  live(s, 7 * 3600); // Day 2
  live(s, 24 * 3600); // Day 3
  live(s, 24 * 3600); // Day 4
  assert.deepEqual(
    listSnapshots(s).map((x) => x.day),
    [1, 2, 3, 4]
  );
  live(s, 5 * 3600);
  die(s, 'zombies');
  const opts = rewindOptions(s);
  assert.deepEqual(
    opts.map((o) => [o.day, o.back]),
    [
      [4, 1],
      [3, 2],
      [2, 3],
    ],
    'the start of today, yesterday or the day before'
  );
  const o = opts.find((x) => x.day === 3);
  assert.equal(o.cost, rewindCost(4, 2));
  assert.equal(o.balance, 100 + 13 + 13);
  assert.equal(o.affordable, true);
  assert.equal(opts.find((x) => x.day === 2).affordable, o.balance - 13 >= rewindCost(4, 3));
  assert.equal(rewindTo(s, 1), null, 'too far back');

  const next = rewindTo(s, 3);
  assert.ok(next);
  assert.equal(next.phase, 'post');
  assert.equal(next.run.day, 3);
  assert.equal(next.meta.id, s.meta.id);
  assert.equal(next.loop.planningPoints, o.balance - o.cost);
  assert.equal(next.loop.rebirths, 1);
  assert.equal(next.loop.usedRebirth, true);
  assert.equal(next.progress.taboo.rebirth, true);
  assert.equal(ledgerTotals(next).rewind, -o.cost);
  assert.equal(next.run.settlement.pending, true, 'that morning\'s settlement is waiting again');
  assert.ok(next.loop.memories.some((m) => m.kind === 'death' && m.day === 4));
  assert.deepEqual(
    listSnapshots(next).map((x) => x.day),
    [1, 2, 3],
    'the abandoned future is gone'
  );

  const bal = next.loop.planningPoints;
  live(next, 24 * 3600);
  assert.equal(next.run.day, 4);
  assert.equal(next.loop.planningPoints, bal + 13, 're-lived days earn their points again');
  assert.deepEqual(
    listSnapshots(next).map((x) => x.day),
    [1, 2, 3, 4]
  );
});

test('the rebirth taboo ("Just Once") persists across the save file\'s loops; tear-ups never set it', () => {
  const s = postDisaster();
  assert.equal(s.progress.taboo.rebirth, undefined);
  die(s, 'life');
  const torn = newGame({ seed: 55, loop: prepareTearUp(s).loop });
  assert.equal(torn.progress.taboo.rebirth, undefined, 'tearing up keeps Just Once possible');
  assert.equal(torn.loop.usedRebirth, false);

  const second = newGame({ seed: 56, loop: prepareNextLoop(s) });
  assert.equal(second.loop.usedRebirth, true);
  assert.equal(second.progress.taboo.rebirth, true);
  die(second, 'life');
  const third = newGame({ seed: 57, loop: prepareTearUp(second).loop });
  assert.equal(third.progress.taboo.rebirth, true, 'still set after a later tear-up');
  const fourth = newGame({ seed: 58, loop: prepareNextLoop(third) });
  assert.equal(fourth.loop.cycle, 3);
  assert.equal(fourth.progress.taboo.rebirth, true);
});

test('rebirth after an ending records the ending and turns on New Game+', () => {
  const s = postDisaster();
  addPoints(s, 90, 'event');
  s.run.day = 101;
  s.run.ending = 'evacuate';
  s.phase = 'ending';
  const next = prepareNextLoop(s);
  const last = next.history.at(-1);
  assert.equal(last.ending, 'evacuate');
  assert.equal(last.cause, null);
  assert.equal(last.day, 101);
  assert.equal(next.bestDay, 101);
  assert.equal(next.ngPlus, true);
  assert.equal(next.planningPoints, 90);
  assert.ok(next.memories.some((m) => m.kind === 'ending' && m.ending === 'evacuate'));
  assert.ok(!next.memories.some((m) => m.kind === 'death'));
});

test('the latest two snapshots are also kept in localStorage and found again after a reload', () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  try {
    const s = postDisaster({ id: 'snapTestA' });
    for (let day = 2; day <= 7; day++) {
      s.run.day = day;
      takeSnapshot(s);
    }
    assert.deepEqual(
      listSnapshots(s).map((x) => x.day),
      [4, 5, 6, 7],
      'four kept in memory'
    );
    const key = `survivalLog.snap.${s.meta.id}`;
    const saved = JSON.parse(store.get(key));
    assert.deepEqual(
      saved.map((x) => x.day),
      [6, 7]
    );

    const reloaded = postDisaster({ id: 'snapTestB' });
    store.set(`survivalLog.snap.${reloaded.meta.id}`, JSON.stringify(saved));
    assert.deepEqual(
      listSnapshots(reloaded).map((x) => x.day),
      [6, 7]
    );
    clearSnapshots(s.meta.id);
    assert.equal(store.has(key), false);
    assert.deepEqual(listSnapshots(s), []);
  } finally {
    delete globalThis.localStorage;
  }
});

test('the death cause names the killer: thugs at home, raiders or a fall on an outing, hunger otherwise', () => {
  const thugs = postDisaster();
  addStat(thugs, 'life', -500, 'thugs');
  die(thugs, 'life');
  assert.equal(deathCause(thugs), 'thug');
  const raid = postDisaster();
  addStat(raid, 'life', -500, 'raider');
  die(raid, 'exploration');
  assert.equal(deathCause(raid), 'raider');
  assert.equal(causeLabel('raider').en, 'Killed by raiders');
  const fall = postDisaster();
  die(fall, 'exploration');
  assert.equal(deathCause(fall), 'explore');
  const hunger = postDisaster();
  addStat(hunger, 'life', -30, 'zombie');
  hunger.clock.t += 5 * 3600;
  Object.assign(hunger.player.stats, { sat: 0, life: 0 });
  die(hunger, 'life');
  assert.equal(deathCause(hunger), 'starvation', 'an old bite does not count');
});
