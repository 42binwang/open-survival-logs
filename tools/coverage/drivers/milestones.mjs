// @ts-check
// Codex milestones (src/content/milestones.js): a save history whose codex reached each milestone's count — the
// first entries of that codex category — goes through the sim's milestone check, which hands the run the souvenir
// recipe the milestone unlocks for every save.
import { loadSim, postGame } from '../sim.mjs';
import { Recorder } from '../observe.mjs';

/** @param {Record<string, never>} _args */
export async function run(_args) {
  const S = await loadSim();
  const C = S.codex;
  const rec = new Recorder();
  for (const m of /** @type {any[]} */ (C.MILESTONES)) {
    const s = postGame(S, { seed: 151, character: 'wage' });
    const h = S.save.defaultHistory();
    h.codex[m.cat] = C.codexList(m.cat).slice(0, m.count);
    const fresh = C.checkMilestones(s, h, 0);
    if (!fresh.some((/** @type {any} */ x) => x.id === m.id)) rec.warn(`milestones: ${m.id} was not awarded with ${m.count} ${m.cat} codex entries`);
    if (s.run.souvenirRecipes?.includes(m.craft)) rec.unlocked(m.craft, `milestone:${m.id}`);
    else rec.warn(`milestones: ${m.id} did not hand the run recipe ${m.craft}`);
  }
  return rec.obs;
}
