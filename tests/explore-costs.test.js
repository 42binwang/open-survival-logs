// @ts-check
// Site action costs follow Config_FurnitureFunc (WP-P0-15, docs/balance/forager.md): searching a container costs the
// stamina its function previews whatever its size, unlocking and prying cost their tool functions' stamina, and
// pushing an obstacle aside costs the satiety and stamina of 搬走.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { tick } from '../src/sim/tick.js';
import { dayStartT, dayNumber } from '../src/sim/time.js';
import { furn, func } from '../src/data/db.js';
import { parsePreview } from '../src/content/funcSpecs.js';
import { SITES } from '../src/content/sites.js';
import { startExploration, travelTime, exploreRun, fixtureOptions, searchContainer, queueFixture } from '../src/sim/explore.js';
import '../src/sim/story.js';

/** @param {number} day @param {number} hour */
function atDay(day, hour) {
  const s = /** @type {any} */ (newGame({ seed: 21, character: 'wage' }));
  s.phase = 'post';
  s.clock.t = dayStartT(s.clock, day) + hour * 3600;
  s.run.day = dayNumber(s.clock);
  return s;
}

/** @param {any} s @param {string} id */
function arriveAt(s, id) {
  const r = /** @type {any} */ (startExploration(s, id));
  assert.ok(r.ok, r.reason);
  tick(s, travelTime(s, id) + 60);
  const run = exploreRun(s);
  assert.equal(run.phase, 'site');
  run.zombies = [];
  return run;
}

/** Stamina a config function previews, or null when it previews none. @param {number} id */
const previewSta = (id) => {
  const c = /** @type {Record<string, number>} */ (parsePreview(func(id)?.preview).cost);
  return c.sta ?? null;
};

test('every site container costs the stamina its config function previews, whatever its size', () => {
  let checked = 0;
  for (const site of SITES) {
    const s = atDay(45, 9);
    const run = arriveAt(s, site.id);
    for (const fx of run.fixtures) {
      if (fx.kind !== 'box') continue;
      const funcs = /** @type {number[]} */ (furn(fx.cfg).funcs);
      const opts = fixtureOptions(s, fx.id);
      if (!fx.lock) {
        const plain = funcs.map(previewSta).find((v) => v != null);
        assert.equal(opts.find((/** @type {any} */ o) => o.mode === 'search')?.sta, plain, `${site.id} ${fx.id} (${fx.cfg}, ${fx.w}×${fx.h}): funcs ${funcs}`);
      } else if (fx.lock === 'pick') {
        const unlock = funcs.find((id) => func(id)?.zh === '解锁');
        assert.equal(opts.find((/** @type {any} */ o) => o.mode === 'pick')?.sta, previewSta(/** @type {number} */ (unlock)), `${site.id} ${fx.id}: 解锁 ${unlock}`);
      } else {
        // 1501 强行撬开 is the only pry function with a stamina preview; the other 撬开 functions preview none
        assert.equal(opts.find((/** @type {any} */ o) => o.mode === 'pry')?.sta, previewSta(1501), `${site.id} ${fx.id}: pry`);
      }
      checked++;
    }
  }
  assert.ok(checked > 100, `${checked} containers`);
});

test("the Nearby Streets' abandoned vehicle (2×2) costs 5 stamina to search, as 1101 取出物资 previews", () => {
  const s = atDay(3, 9);
  const run = arriveAt(s, 'streets');
  const car = run.fixtures.find((/** @type {any} */ f) => f.cfg === 66083);
  assert.equal(car.w * car.h, 4);
  assert.deepEqual(furn(66083).funcs, [1101]);
  s.player.stats.sta = 80;
  assert.ok(searchContainer(s, car.id).ok);
  assert.equal(previewSta(1101), 5);
  assert.equal(s.player.stats.sta, 80 - 5);
});

test('pushing an obstacle aside costs what 搬走 previews (1729, 1733)', () => {
  for (const [siteId, cfgFunc] of [
    ['supermarket', 1729],
    ['hospital', 1733],
  ]) {
    const s = atDay(30, 9);
    const run = arriveAt(s, /** @type {string} */ (siteId));
    const block = run.fixtures.find((/** @type {any} */ f) => f.kind === 'block' && furn(f.cfg).funcs.includes(cfgFunc));
    assert.ok(block, `${siteId} has an obstacle with ${cfgFunc}`);
    const want = /** @type {Record<string, number>} */ (parsePreview(func(/** @type {number} */ (cfgFunc)).preview).cost);
    assert.equal(fixtureOptions(s, block.id)[0].sta, want.sta);
    Object.assign(s.player.stats, { sat: 90, sta: 90 });
    const a = queueFixture(s, block.id, 'clear');
    assert.ok(a);
    assert.deepEqual(a.cost, want, `${siteId}: the action charges ${JSON.stringify(want)}`);
  }
});
