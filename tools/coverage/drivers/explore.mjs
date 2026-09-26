// @ts-check
// Post-disaster exploration: travel to a site, open every container (with a crowbar and lockpicks along) and come
// home. Loot tables roll at random, so each site runs over many seeds for each character, on the day it opens and
// later in the story; sites that open within the first week (fresh produce only turns up then) get extra early
// visits.
import { CHARACTERS, HOUR, give, keepAlive, loadSim, postGame, runUntilIdle } from '../sim.mjs';
import { Recorder, trackUnlocks } from '../observe.mjs';

/** @param {{ sites?: string[], characters?: string[], seeds?: number, earlySeeds?: number }} args */
export async function run({ sites, characters = CHARACTERS, seeds = 12, earlySeeds = 200 }) {
  const S = await loadSim();
  const X = S.explore;
  const rec = new Recorder();
  const off = trackUnlocks(S, rec, 'explore');
  const ids = sites || S.sites.SITES.map((/** @type {any} */ d) => d.id);
  /** @param {string} site @param {string} character @param {number} seed @param {boolean} early */
  const visit = (site, character, seed, early) => {
    const s = postGame(S, { seed: seed * 7919 + site.length, character });
    const opens = X.exploreState(s).unlockDay[site];
    // Day 1 ends at the outbreak (18:00), so the first morning outside is Day 2
    const day = Math.max(early ? 2 : 45, opens);
    if (early && day > S.sites.FRESH_DAYS) return false;
    s.clock.t = S.time.dayStartT(s.clock, day) + 9 * HOUR;
    s.run.day = day;
    keepAlive(s);
    give(S, s, S.sites.ITEM.crowbar, 8);
    give(S, s, S.sites.ITEM.lockpick, 8);
    give(S, s, X.NOISEMAKER, 1);
    const start = X.startExploration(s, site);
    if (!start.ok) {
      rec.warn(`explore: ${character} could not leave for ${site} on day ${day} (${start.reason})`);
      return false;
    }
    for (let t = 0; t < 4 * HOUR && X.exploreRun(s)?.phase !== 'site'; t += 60) S.tick.tick(s, 60);
    const r = X.exploreRun(s);
    if (r?.phase !== 'site') {
      rec.warn(`explore: ${character} never arrived at ${site}`);
      return false;
    }
    // a tin-can noisemaker thrown into the far corner draws the dead away
    if (!early) rec.watch(s, `lure:${site}`, () => X.throwLure(s));
    for (const fx of r.fixtures) {
      if (fx.kind !== 'box') continue;
      keepAlive(s);
      rec.watch(s, `loot:${site}`, () => X.searchContainer(s, fx.id));
    }
    // leftovers are dropped with the site's containers on the way home: that is no use of an item
    X.retreat(s);
    runUntilIdle(S, s, 4 * HOUR);
    if (X.exploreRun(s)) rec.warn(`explore: ${character} did not get home from ${site}`);
    return true;
  };
  for (const site of ids) {
    for (const character of characters) {
      for (let seed = 1; seed <= seeds; seed++) visit(site, character, seed, seed % 2 === 1);
      for (let seed = 1; seed <= earlySeeds; seed++) if (!visit(site, character, 1000 + seed, true)) break;
    }
  }
  off();
  return rec.obs;
}
