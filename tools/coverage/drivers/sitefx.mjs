// @ts-check
// Exploration-site fixtures: at every site, every interaction the sim offers for each placed Config_Furniture piece
// (search, unlock, pry, clear, rest, take) is run on its own copy of the visit, with a crowbar and lockpicks at hand,
// over several seeds so loot has a fair chance to turn up. Per piece: where it stands, which interactions completed,
// the furniture functions their actions named (funcKey) and whether they handed out items
// (tools/coverage/interactions.mjs reads this against the config's functions).
import { CHARACTERS, HOUR, give, keepAlive, loadSim, postGame, runUntilIdle } from '../sim.mjs';
import { Recorder } from '../observe.mjs';
import { funcOf } from '../trace/rules.mjs';

/** @param {{ sites?: string[], seeds?: number }} args */
export async function run({ sites, seeds = 6 }) {
  const S = await loadSim();
  const X = S.explore;
  const rec = new Recorder();
  const ids = sites || S.sites.SITES.map((/** @type {any} */ d) => d.id);
  for (const site of ids) {
    for (let seed = 1; seed <= seeds; seed++) {
      const character = CHARACTERS[seed % CHARACTERS.length];
      const s = postGame(S, { seed: 4000 + seed * 31 + site.length, character });
      const opens = X.exploreState(s).unlockDay[site];
      const day = Math.max(2, opens);
      s.clock.t = S.time.dayStartT(s.clock, day) + 9 * HOUR;
      s.run.day = day;
      keepAlive(s);
      give(S, s, S.sites.ITEM.crowbar, 8);
      give(S, s, S.sites.ITEM.lockpick, 8);
      give(S, s, X.NOISEMAKER, 1);
      const start = X.startExploration(s, site);
      if (!start.ok) {
        rec.warn(`sitefx: ${character} could not leave for ${site} on day ${day} (${start.reason})`);
        continue;
      }
      for (let t = 0; t < 4 * HOUR && X.exploreRun(s)?.phase !== 'site'; t += 60) S.tick.tick(s, 60);
      const r = X.exploreRun(s);
      if (r?.phase !== 'site') {
        rec.warn(`sitefx: ${character} never arrived at ${site}`);
        continue;
      }
      // a tin-can noisemaker thrown into the far corner draws the dead away
      if (X.canThrowLure(s) === true) X.throwLure(s);
      runUntilIdle(S, s, HOUR);
      // obstacles first, as a player clears the way: every block is pushed aside in the visit itself, the ones the
      // survivor can reach first, so a barricade behind another one (the office's executive suite) comes next
      const pending = r.fixtures.filter((/** @type {any} */ fx) => fx.kind === 'block');
      const rest = r.fixtures.filter((/** @type {any} */ fx) => fx.kind !== 'block');
      const next = () => {
        if (!pending.length) return rest.shift();
        const i = pending.findIndex((/** @type {any} */ fx) => X.approachTile(s, fx.id));
        return pending.splice(Math.max(0, i), 1)[0];
      };
      for (let fx = next(); fx; fx = next()) {
        if (typeof fx.cfg !== 'number') continue;
        /** @type {Record<string, { done: boolean, items: boolean, funcs?: number[], why?: string }>} */
        const modes = {};
        for (const opt of X.fixtureOptions(s, fx.id)) {
          const t = fx.kind === 'block' ? s : structuredClone(s);
          keepAlive(t);
          /** @type {any[]} */
          const done = [];
          /** @type {string[]} */
          const said = [];
          const off = S.bus.on('actionDone', (/** @type {any} */ a) => a?.fixture === fx.id && done.push(a));
          const offToast = S.bus.on('toast', (/** @type {any} */ m) => m?.kind === 'bad' && said.push(m.text));
          try {
            const w = rec.watch(t, `site:${site}`, () => {
              let queued = false;
              // a zombie that grabs the survivor drops the action: shake it off and go again
              for (let attempt = 0; attempt < 4 && !done.length; attempt++) {
                keepAlive(t);
                const q = X.queueFixture(t, fx.id, opt.mode);
                if (!q) break;
                queued = true;
                runUntilIdle(S, t, 2 * HOUR);
              }
              return queued;
            });
            const why = done.length ? null : opt.reason || said.at(-1) || (w.value ? 'queued but never completed' : 'the sim refused it');
            const funcs = [...new Set(done.map(funcOf).filter((k) => k != null))];
            modes[opt.mode] = { done: done.length > 0, items: w.up.length > 0, ...(funcs.length ? { funcs } : {}), ...(why ? { why } : {}) };
          } finally {
            off();
            offToast();
          }
        }
        rec.merge('fixtures', fx.cfg, { where: [`site:${site}`], modes: { [`site:${site}`]: modes } });
      }
    }
  }
  return rec.obs;
}
