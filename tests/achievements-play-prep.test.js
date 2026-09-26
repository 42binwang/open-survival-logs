// @ts-check
// Achievements of the ten hours before the outbreak (S03; https://steamcommunity.com/stats/4164790/achievements: Prepper, Fine Haul, Doomsday
// Tycoon, Penny Pincher, Explore the Entire City, Well-Stocked Pantry, Ready for Anything), earned by playing the
// preparation: travel on the city map takes its game time, shopping pays and must fit the backpack or the car's
// trunk, and the live achievement wiring awards them from what the sim recorded (src/sim/predisaster.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { S, begin, until, awarded, HOUR } from './fixtures/play.mjs';

const P = S.predisaster;
const SHOPS = S.shops.SHOPS;

/** Travel to a map location and wait for the arrival. @param {any} s @param {string} dest */
function go(s, dest) {
  assert.ok(P.startTravel(s, dest), `set out for ${dest}`);
  const scene = dest === 'home' ? 'home' : `shop:${dest}`;
  assert.ok(until(s, () => s.player.scene === scene, { step: 60, max: 3 * HOUR }), `reached ${dest}`);
}

/**
 * Buy one of every shelf offer the filter picks, into the car's trunk when there is one.
 * @param {any} s @param {string} shop @param {(cfg: any, offer: any) => boolean} pick @param {number} [times]
 */
function shop(s, shop, pick, times = 1) {
  let n = 0;
  for (const f of SHOPS[shop].fixtures) {
    if (f.kind !== 'shelf') continue;
    for (const o of P.shelfOffers(s, shop, f.id)) {
      if (o.pkg || !pick(S.db.item(o.id), o)) continue;
      for (let k = 0; k < times; k++) if (P.buy(s, shop, f.id, o.id, { dest: 'trunk' }).ok) n++;
    }
  }
  return n;
}

/** Move the backpack into home storage, as the player drags it over. @param {any} s */
function stash(s) {
  const bp = s.inventories[s.player.backpack];
  const to = S.home.storageInventories(s).map((/** @type {string} */ id) => s.inventories[id]).filter(Boolean);
  for (const it of [...bp.items]) to.some((/** @type {any} */ inv) => S.inventory.moveItem(s, bp, it.uid, inv).ok);
}

const { FOOD, MATERIAL } = S.db.CAT;

test('a car, five supply points and a shopping list: Prepper, Penny Pincher, Explore the Entire City, Well-Stocked Pantry and Ready for Anything', () => {
  const s = begin({ seed: 2001 });
  assert.equal(s.phase, 'pre');
  go(s, 'carlot');
  assert.ok(P.buyCar(s, 'sedan').ok, 'a car with a trunk');
  assert.ok(shop(s, 'carlot', (c, o) => c.cat === MATERIAL && o.unit <= 50) >= 4, 'four kinds of material');
  go(s, 'convenience');
  shop(s, 'convenience', (c, o) => c.cat === FOOD && o.unit <= 15);
  go(s, 'market');
  shop(s, 'market', (c, o) => c.cat === FOOD && o.unit <= 25);
  assert.ok(s.player.money < 50, `spent down to ${s.player.money}`);
  go(s, 'hardware');
  go(s, 'farmers');
  go(s, 'home');
  assert.equal(awarded(2004), false, 'Penny Pincher is judged when the disaster strikes');
  assert.ok(until(s, () => s.phase === 'post', { step: 300, max: 12 * HOUR }), 'the outbreak came');
  until(s, () => false, { max: HOUR });
  assert.ok(s.progress.counters['pre.kg'] > 5);
  assert.ok(awarded(2001), 'Prepper: over 5 kg stockpiled before the disaster');
  assert.ok(awarded(2004), 'Penny Pincher: under 50 money when the disaster struck');
  assert.ok(awarded(2005), 'Explore the Entire City: 5 supply points visited');
  assert.ok(awarded(2006), 'Well-Stocked Pantry: 20 kinds of food bought');
  assert.ok(awarded(2007), 'Ready for Anything: 4 kinds of material bought');
});

test('three supermarket runs on foot for the heaviest food per dollar: Fine Haul and Doomsday Tycoon', () => {
  const s = begin({ seed: 2002 });
  const heavy = (/** @type {any} */ c, /** @type {any} */ o) => c.cat === FOOD && c.g / 1000 / o.unit >= 0.06;
  for (let trip = 0; trip < 4; trip++) {
    if (S.time.secondsUntilOutbreak(s) < 2.5 * HOUR) break;
    go(s, 'market');
    shop(s, 'market', heavy, 5);
    go(s, 'home');
    stash(s);
  }
  assert.ok(until(s, () => s.phase === 'post', { step: 300, max: 12 * HOUR }), 'the outbreak came');
  until(s, () => false, { max: HOUR });
  assert.ok(s.progress.counters['pre.kg'] > 50, `${s.progress.counters['pre.kg']} kg stockpiled`);
  assert.ok(awarded(2002), 'Fine Haul: over 25 kg');
  assert.ok(awarded(2003), 'Doomsday Tycoon: over 50 kg');
});
