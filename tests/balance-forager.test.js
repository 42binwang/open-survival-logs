// @ts-check
// The forager of tools/balance/bots.mjs plays as docs/BALANCE.md defines it (WP-P0-15, BUG-0057 / BUG-0058,
// docs/balance/forager.md): at a site it searches the nearest container it can open and passes a locked one without
// the tool, it does not set out while its own site rule would call it hurt, and its "two weeks of food" counts the
// food the survivor eats.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FORAGER, foodSatiety, nextContainer } from '../tools/balance/bots.mjs';
import { loadSim } from '../tools/balance/sim.mjs';

const S = await loadSim();
const CROWBAR = 20330;

/** A Normal survivor at home after the outbreak, fed, rested and in good spirits, on Day 18 at 08:00. */
function atHome() {
  const s = S.state.newGame({ seed: 1026, character: 'wage', difficulty: 'normal', skipPrologue: true });
  s.phase = 'post';
  s.clock.t = S.time.dayStartT(s.clock, 18) + 8 * 3600;
  s.run.day = S.time.dayNumber(s.clock);
  for (const e of s.crises.schedule) if (e.day < 18) e.status = 'done';
  s.run.bot = {};
  s.ui.autonomy = true;
  Object.assign(s.player.stats, { sat: 80, sta: 100, mor: 90, life: S.stats.effectiveMax(s, 'life') });
  return s;
}

/** The forager's first step sets out for the Nearby Streets; plays the walk there. @param {any} s */
function atStreets(s) {
  FORAGER.step(S, s);
  const run = S.explore.exploreRun(s);
  assert.equal(run?.site, 'streets', 'it sets out for the first open site, the Nearby Streets');
  S.tick.tick(s, S.explore.travelTime(s, 'streets') + 60);
  assert.equal(run.phase, 'site');
  run.zombies = [];
  return run;
}

test('the forager does not set out while hurt, since it would retreat from the site on arrival', () => {
  const s = atHome();
  const max = S.stats.effectiveMax(s, 'life');
  s.player.stats.life = 0.7 * max;
  FORAGER.step(S, s);
  assert.equal(S.explore.exploreRun(s), null, 'at 70 % of max Life it stays home');
  s.player.stats.life = 0.8 * max;
  FORAGER.step(S, s);
  assert.equal(S.explore.exploreRun(s)?.site, 'streets', 'at 80 % it sets out');
});

test('at the Nearby Streets the forager passes the pry-locked car it has no crowbar for and searches on', () => {
  const s = atHome();
  const run = atStreets(s);
  const car = run.fixtures.find((/** @type {any} */ f) => f.kind === 'box' && f.lock === 'pry');
  assert.ok(car, 'the streets have a pry-locked car');
  const p = s.player;
  const at = /** @type {any} */ (S.explore.approachTile(s, car.id));
  [p.x, p.y, p.px, p.py] = [at.x, at.y, at.x, at.y];
  const boxes = run.fixtures.filter((/** @type {any} */ f) => f.kind === 'box' && f !== car);
  const far = boxes.reduce((/** @type {any} */ a, /** @type {any} */ b) => (/** @type {any} */ (S.explore.approachTile(s, b.id)).d > /** @type {any} */ (S.explore.approachTile(s, a.id)).d ? b : a));
  for (const f of boxes) if (f !== far) f.searched = true;
  assert.equal(S.explore.nearestFixture(s, 60)?.id, car.id, 'the locked car is the nearest unsearched container');
  assert.equal(S.explore.fixtureOptions(s, car.id).some((/** @type {any} */ o) => o.enabled), false, 'without a crowbar it cannot be opened');
  assert.equal(nextContainer(S, s, 60)?.id, far.id, 'the nearest container it can open');
  FORAGER.step(S, s);
  const a = s.actions.current || s.actions.queue[0];
  assert.deepEqual([a?.kind, a?.fixture], ['exploreSearch', far.id], 'it goes to search the other container instead of standing at the car');
  S.actions.cancelAll(s);
  far.searched = true;
  FORAGER.step(S, s);
  assert.equal(run.phase, 'travelBack', 'with only the locked car left it heads home');
});

test('with a crowbar in the backpack the locked car is a container the forager can open', () => {
  const s = atHome();
  const run = atStreets(s);
  const car = run.fixtures.find((/** @type {any} */ f) => f.kind === 'box' && f.lock === 'pry');
  for (const f of run.fixtures) if (f.kind === 'box' && f !== car) f.searched = true;
  assert.equal(nextContainer(S, s, 60), null, 'no crowbar: nothing to open');
  S.inventory.addItem(s, s.inventories[s.player.backpack], CROWBAR);
  assert.equal(nextContainer(S, s, 60)?.id, car.id);
});

test('the forager counts the food the survivor eats: raw meat, which it would have to cook, is not food for it', () => {
  const s = atHome();
  const bp = s.inventories[s.player.backpack];
  const before = foodSatiety(S, s);
  const meat = S.db.item(2115);
  assert.ok(meat.cook && meat.sub === 2 && meat.sat > 0, 'Canned Luncheon Meat is raw meat with satiety');
  S.inventory.addItem(s, bp, 2115);
  assert.equal(foodSatiety(S, s), before, 'raw meat does not count');
  assert.notEqual(S.suggest.bestFood(s)?.inst.id, 2115, 'autonomy does not eat it either');
  S.inventory.addItem(s, bp, 2123);
  assert.equal(foodSatiety(S, s), before + S.db.item(2123).sat, 'Canned Yellow Peaches count');
});

/** Items of `id` at home (backpack and storage). @param {any} s @param {number} id */
const atHomeCount = (s, id) => S.inventory.countIn(s, S.furnActions.homeSources(s), id);

test('it keeps itself fed: while its Life is below max it eats to 10 over the Life-regeneration threshold, no further', () => {
  const s = atHome();
  s.clock.t = S.time.dayStartT(s.clock, 18) + 20 * 3600;
  const line = S.stats.REGEN_SAT + 10;
  assert.equal(S.stats.REGEN_SAT, 30, 'src/sim/stats.js: Life regenerates above 30 satiety');
  S.inventory.addItem(s, s.inventories[s.player.backpack], 2123);
  const max = S.stats.effectiveMax(s, 'life');
  Object.assign(s.player.stats, { life: 0.8 * max, sat: line - 5 });
  FORAGER.step(S, s);
  const a = s.actions.current || s.actions.queue[0];
  assert.deepEqual([a?.kind, a?.op], ['useItem', 'eat'], 'Life below max, satiety under the line: it eats');
  S.actions.cancelAll(s);
  s.player.stats.sat = line;
  FORAGER.step(S, s);
  assert.ok(S.actions.isIdle(s), 'at the line it eats no more');
  Object.assign(s.player.stats, { life: max, sat: line - 5 });
  FORAGER.step(S, s);
  assert.ok(S.actions.isIdle(s), 'at full Life it leaves the meals to autonomy');
});

test('it treats a bleed with the cheapest medicine that clears it, and uses medicine when hurt at home', () => {
  const s = atHome();
  s.clock.t = S.time.dayStartT(s.clock, 18) + 20 * 3600;
  const bp = s.inventories[s.player.backpack];
  S.inventory.addItem(s, bp, 2400);
  S.inventory.addItem(s, bp, 2509);
  S.stats.addEffect(s, 'bleeding', 12);
  FORAGER.step(S, s);
  S.tick.tick(s, 600);
  assert.equal(s.player.effects.bleeding, undefined, 'the bleed is cleared');
  assert.deepEqual([atHomeCount(s, 2509), atHomeCount(s, 2400)], [0, 1], 'with the band-aid, the cheapest that clears it');
  s.player.stats.life = 0.6 * S.stats.effectiveMax(s, 'life');
  const life = s.player.stats.life;
  FORAGER.step(S, s);
  S.tick.tick(s, 600);
  assert.equal(atHomeCount(s, 2400), 0, 'hurt at home, it uses the bandage');
  assert.ok(s.player.stats.life > life);
});

test('at the site it treats a bleed from its backpack', () => {
  const s = atHome();
  const run = atStreets(s);
  S.inventory.addItem(s, s.inventories[s.player.backpack], 2400);
  S.stats.addEffect(s, 'bleeding', 12);
  FORAGER.step(S, s);
  const a = s.actions.current || s.actions.queue[0];
  assert.deepEqual([a?.kind, a?.op], ['useItem', 'use']);
  assert.equal(run.phase, 'site', 'it treats the bleed before anything else');
  S.tick.tick(s, 600);
  assert.equal(s.player.effects.bleeding, undefined);
});

test('it buys no medicine during the preparation: at the outbreak it has what the idle survivor has', () => {
  /** @param {any} bot */
  const atOutbreak = (bot) => {
    const s = S.state.newGame({ seed: 1026, character: 'wage', difficulty: 'normal', skipPrologue: true });
    s.ui.autonomy = true;
    for (let i = 0; i < 200 && s.phase === 'pre'; i++) {
      bot.step(S, s);
      S.tick.tick(s, 600);
    }
    assert.equal(s.phase, 'post');
    const meds = S.furnActions.homeSources(s).flatMap((/** @type {string} */ id) => s.inventories[id].items).filter((/** @type {any} */ it) => S.db.item(it.id)?.cat === S.db.CAT.MEDICINE);
    return { meds: meds.length, spent: Number(s.run.bot?.spent || 0) };
  };
  const forager = atOutbreak(FORAGER);
  assert.ok(forager.spent > 0, 'it shopped');
  assert.equal(forager.meds, atOutbreak({ step() {} }).meds);
});
