// @ts-check
// Endless-mode achievements (S03; https://steamcommunity.com/stats/4164790/achievements), played in Pure Endless from the title screen's Endless
// Mode: the hordes come on the endless calendar and the live achievement wiring awards what the sim counted. The run
// is long, so the survivor is kept fed and rested and the openings are patched between game hours; Pulled Through
// counts survived endless hordes (a config counter) and reads neither.
import test from 'node:test';
import assert from 'node:assert/strict';
import { S, begin, awarded, settle } from './fixtures/play.mjs';

test('Pure Endless held for thirty endless hordes: Pulled Through', async () => {
  const s = begin({ seed: 2206, mode: 'pureEndless' });
  const c = s.progress.counters;
  for (let h = 0; h < 24 * 250 && s.phase === 'post' && (c['wave.survived'] || 0) < 30; h++) {
    for (let k = 0; k < 3; k++) {
      Object.assign(s.player.stats, { sat: 90, sta: 95, mor: 90, life: 100 });
      for (const f of S.home.doorAndWindows(s)) f.hp = S.home.effectiveMaxHp(f);
      S.tick.tick(s, 1200);
    }
  }
  await settle();
  assert.equal(c['wave.survived'], 30, `${c['wave.survived']} endless hordes by Day ${S.time.dayNumber(s.clock)}`);
  assert.ok(awarded(2206), 'Pulled Through: 30 hordes survived in Endless Mode');
});
