import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { tick } from '../src/sim/tick.js';
import { dayStartT } from '../src/sim/time.js';
import { getMods, bumpMods } from '../src/sim/modifiers.js';
import { dailyCredit, settleDay, availableCards, offerCards, buyCard, cardCost, applyCard, addPoints, ledgerTotals, closeSettlement, interestFor } from '../src/sim/settlement.js';
import { CARD_BY_ID } from '../src/content/planningCards.js';

function postDisaster(opts = {}) {
  const s = newGame({ seed: 31, ...opts });
  s.phase = 'post';
  s.clock.t = s.clock.outbreakAt + 5 * 3600; // 23:00 on Day 1
  s.run.day = 1;
  return s;
}

test('daily credit: base points, +1 per 10 days, record-breaking days and the difficulty multiplier', () => {
  const s = postDisaster();
  const first = dailyCredit(s, 2);
  assert.equal(first.total, 13, '8 + 5 for a record-breaking day');
  assert.equal(first.record, true);
  assert.equal(s.loop.bestDay, 2);
  assert.equal(s.loop.planningPoints, 13);
  assert.equal(dailyCredit(s, 2).total, 8, 'the same day is not a record twice');

  s.loop.bestDay = 40;
  assert.equal(dailyCredit(s, 31).total, 11, '+3 after 30 days survived');
  s.loop.abilities.dailyPlan = 2;
  bumpMods(s);
  assert.equal(dailyCredit(s, 41).total, 8 + 4 + 2 + 5, 'Daily Settlement Plan adds its levels');
  assert.equal(s.loop.bestDay, 41);
  assert.deepEqual(s.run.dayRecords, [2, 41]);

  const totals = ledgerTotals(s);
  assert.equal(totals.record, 10);
  assert.equal(totals.day, 8 + 8 + 11 + 14);
  assert.equal(s.run.pointsEarned, s.loop.planningPoints);

  const hard = postDisaster({ difficulty: 'hard' });
  const c = dailyCredit(hard, 2);
  assert.equal(c.total, Math.round(13 * 1.15));
  assert.deepEqual(
    c.rows.map((r) => [r.kind, r.amount]),
    [
      ['day', c.total - Math.round(5 * 1.15)],
      ['record', Math.round(5 * 1.15)],
    ]
  );
});

test('interest: 5% of a saved balance of 200 or more, capped at 25 per day', () => {
  assert.equal(interestFor(199), 0);
  assert.equal(interestFor(200), 10);
  assert.equal(interestFor(390), 19);
  assert.equal(interestFor(5000), 25);
  const s = postDisaster();
  addPoints(s, 300, 'event');
  s.loop.bestDay = 99;
  const c = dailyCredit(s, 5);
  assert.equal(c.interest, 15, 'interest on the balance saved before today');
  assert.equal(c.total, 8 + 15);
  assert.equal(s.loop.planningPoints, 323);
  assert.equal(ledgerTotals(s).interest, 15);
});

test('the tick loop settles every new day once, with a yesterday summary and three plans to choose from', () => {
  const s = postDisaster();
  tick(s, 2 * 3600);
  assert.equal(s.run.day, 2);
  const st = s.run.settlement;
  assert.equal(st.day, 2);
  assert.equal(st.pending, true);
  assert.equal(st.credited, 13);
  assert.deepEqual(
    st.rows.map((r) => r.kind),
    ['day', 'record']
  );
  assert.equal(s.run.offers.ids.length, 3);
  assert.equal(new Set(s.run.offers.ids.map((id) => CARD_BY_ID[id].path)).size, 3, 'offers span three paths');

  tick(s, 6 * 3600);
  assert.equal(s.loop.planningPoints, 13, 'no second credit on the same day');

  closeSettlement(s);
  assert.equal(buyCard(s, s.run.offers.ids[0]).reason, 'closed', 'a dismissed settlement cannot be bought from');
  s.progress.counters['zombie.kill'] = 4;
  s.progress.counters['food.eaten'] = 3;
  tick(s, 18 * 3600);
  assert.equal(s.run.day, 3);
  assert.equal(s.run.settlement.day, 3);
  assert.equal(s.run.settlement.summary['zombie.kill'], 4);
  assert.equal(s.run.settlement.summary['food.eaten'], 3);
  assert.equal(s.loop.planningPoints, 26);
  assert.equal(s.run.lastSettledDay, 3);
});

test('offers exclude owned plans and respect requires and character restrictions', () => {
  const s = postDisaster({ character: 'student' });
  s.run.cards.push('seedSaver');
  s.run.unlockedRecipes.push(350); // the compost bin recipe is already known
  const ids = availableCards(s).map((c) => c.id);
  assert.ok(!ids.includes('molotov'), 'no Molotovs for the College Student');
  assert.ok(!ids.includes('capacity2'), 'Capacity Upgrade II needs I first');
  assert.ok(!ids.includes('seedSaver'), 'owned');
  assert.ok(!ids.includes('compost'), 'nothing left to unlock');
  assert.ok(ids.includes('hotShower'), 'one-shot plans stay available');
  s.run.cards.push('capacity1');
  assert.ok(availableCards(s).some((c) => c.id === 'capacity2'));
  for (let i = 0; i < 200; i++) {
    const offer = offerCards(s);
    assert.equal(offer.length, 3);
    assert.equal(new Set(offer).size, 3);
    for (const id of offer) assert.ok(!['molotov', 'seedSaver', 'compost', 'capacity1'].includes(id), id);
  }
  assert.ok(availableCards(postDisaster({ character: 'wage' })).some((c) => c.id === 'molotov'));
});

test('buying a plan charges the Thrifty-discounted cost and applies mods, recipes and one-shot stats', () => {
  const s = postDisaster();
  s.loop.abilities.thrifty = 1;
  bumpMods(s);
  addPoints(s, 200, 'event');
  const quality = getMods(s).cookQuality;
  s.run.offers = { day: 2, ids: ['seasonedCook', 'growLights', 'hotShower'], picked: null };
  const r = buyCard(s, 'seasonedCook');
  assert.equal(r.ok, true);
  assert.equal(r.cost, Math.round(35 * 0.85));
  assert.equal(r.cost, cardCost(s, 'seasonedCook'));
  assert.equal(s.loop.planningPoints, 200 - r.cost);
  assert.equal(getMods(s).cookQuality, quality + 10, 'bumpMods picks up the card');
  assert.ok(s.run.cards.includes('seasonedCook'));
  assert.equal(buyCard(s, 'growLights').ok, false, 'one plan per settlement');
  assert.equal(ledgerTotals(s).card, -r.cost);

  s.run.offers = { day: 3, ids: ['growLights', 'hotShower', 'scavenging'], picked: null };
  assert.equal(buyCard(s, 'seasonedCook').reason, 'notOffered');
  assert.equal(buyCard(s, 'growLights').ok, true);
  for (const id of CARD_BY_ID.growLights.recipes) assert.ok(s.run.unlockedRecipes.includes(id), `recipe ${id}`);

  s.player.stats.mor = 40;
  s.run.offers = { day: 4, ids: ['hotShower', 'feast', 'powerNap'], picked: null };
  assert.equal(buyCard(s, 'hotShower').ok, true);
  assert.equal(s.player.stats.mor, 60);
  assert.ok(!s.run.cards.includes('hotShower'), 'one-shot plans are used up');

  s.run.offers = { day: 5, ids: ['feast', 'powerNap', 'enduranceDrone'], picked: null };
  const left = s.loop.planningPoints;
  s.loop.planningPoints = 5;
  assert.equal(buyCard(s, 'enduranceDrone').reason, 'points');
  s.loop.planningPoints = left;
  assert.equal(buyCard(s, 'enduranceDrone').ok, true);
  assert.equal(getMods(s).tradeQuota, 1);
});

test('Endless runs keep the choose-one-of-three going past Day 200', () => {
  const s = postDisaster();
  s.meta.mode = 'endless';
  for (let pass = 0; pass < 4; pass++) for (const c of availableCards(s)) if (!c.once) applyCard(s, c);
  assert.ok(availableCards(s).every((c) => c.once), 'every plan is owned');
  s.loop.bestDay = 400;
  s.run.day = 250;
  s.run.lastSettledDay = 250;
  s.clock.t = dayStartT(s.clock, 250) + 23 * 3600;
  tick(s, 2 * 3600);
  assert.equal(s.run.day, 251);
  assert.equal(s.run.settlement.day, 251);
  assert.equal(s.run.settlement.credited, 8 + 25);
  assert.equal(s.run.offers.ids.length, 3);
  assert.ok(s.run.offers.ids.every((id) => CARD_BY_ID[id].once));
  assert.equal(buyCard(s, s.run.offers.ids[0]).ok, true);
  assert.equal(settleDay(s, 251), null, 'a day is only settled once');
});
