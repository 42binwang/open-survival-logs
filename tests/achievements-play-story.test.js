// @ts-check
// Ending achievements of the story mode (S03; https://steamcommunity.com/stats/4164790/achievements): three survivors, one after the other on
// the same save history, each holding the house to Day 101 without committing to a route, which ends the run in
// Survival: Last One Standing; each ending unlocks the next survivor on the character screen. Like the whole story
// runs of tests/storyrun.test.js, the survivor is kept fed and rested and the openings are patched between game
// hours, so only the story calendar, the endings and the wiring between systems are under test: the ending
// achievements read the endings, never the survivor's stats or the house.
import test from 'node:test';
import assert from 'node:assert/strict';
import { S, G, awarded, settle } from './fixtures/play.mjs';

/** @param {any} s */
function patchUp(s) {
  Object.assign(s.player.stats, { sat: 90, sta: 95, mor: 90, life: 100 });
  s.player.effects = {};
  for (const f of S.home.doorAndWindows(s)) f.hp = S.home.effectiveMaxHp(f);
}

/** One story run to its end: ten game minutes at a time, default choices, the plans skipped. @param {string} character @param {number} seed */
function holdOutToTheEnd(character, seed) {
  assert.ok(G.game.history.characters?.[character] || character === 'wage', `${character} is unlocked`);
  const s = G.startRun({ character, seed, difficulty: 'normal', skipPrologue: true, slot: `slot-play-${character}` });
  assert.ok(S.predisaster.finishPreparation(s));
  for (let i = 0; i < 110 * 24 * 6 && s.phase === 'post'; i++) {
    patchUp(s);
    S.tick.tick(s, 600);
    for (let a = S.story.activeEvent(s); a; a = S.story.presentNext(s)) S.story.resolveEvent(s, null);
    if (s.run.settlement) S.settlement.closeSettlement(s);
  }
  return s;
}

test('three survivors, three uncommitted runs to Day 101: Stay in Place, the three survivors’ stories and Three Stages of Life', async () => {
  S.save._resetStorage();
  G.game.history = S.save.loadHistory();
  for (const [character, seed, story] of /** @type {const} */ ([
    ['wage', 1110, 1110],
    ['student', 1111, 1111],
    ['warehouse', 1112, 1112],
  ])) {
    const s = holdOutToTheEnd(character, seed);
    assert.equal(s.phase, 'ending', `${character}: the run ended (${s.run.deathCause || ''})`);
    assert.equal(s.run.ending, 'lastOne');
    assert.equal(s.run.endingDay, 101);
    await settle();
    assert.ok(awarded(1109), 'Stay in Place: Survival: Last One Standing');
    assert.ok(awarded(story), `${character}: an ending reached with this survivor`);
  }
  assert.ok(awarded(1113), 'Three Stages of Life: an ending with each of the three survivors');
});
