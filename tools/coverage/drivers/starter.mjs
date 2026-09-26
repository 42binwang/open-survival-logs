// @ts-check
// Starter kits: what a new story run and a new Pure Endless run hand each character, the furniture of each home,
// and the rebirth notes the next loop starts with (the loop data a death leaves behind).
import { CHARACTERS, countItems, loadSim } from '../sim.mjs';
import { Recorder } from '../observe.mjs';

/** @param {{ characters?: string[] }} args */
export async function run({ characters = CHARACTERS }) {
  const S = await loadSim();
  const rec = new Recorder();
  for (const character of characters) {
    for (const mode of ['story', 'pureEndless']) {
      const s = S.state.newGame({ seed: 7, character, mode, skipPrologue: true });
      for (const id of countItems(s).keys()) rec.produced(id, `starter:${character}${mode === 'story' ? '' : ':endless'}`);
      for (const f of S.home.homeFurniture(s)) if (typeof f.cfg === 'number') rec.furnished(f.cfg, `starter:${character}`);
    }
    // A loop that trained every proficiency and died: the next one starts with organised notes and scattered memos.
    for (const exp of [900, 9000]) {
      const s = S.state.newGame({ seed: 8, character, skipPrologue: true });
      for (const key of Object.keys(S.rebirth.NOTE_ITEMS)) S.proficiency.addProfExp(s, key, exp);
      s.clock.t = s.clock.outbreakAt + 3600;
      S.tick.outbreak(s);
      S.tick.die(s, 'life');
      const loop = S.rebirth.prepareNextLoop(s);
      const next = S.state.newGame({ seed: 9, character, loop, skipPrologue: true });
      const before = countItems(S.state.newGame({ seed: 9, character, skipPrologue: true }));
      for (const [id, n] of countItems(next)) if (n > (before.get(id) || 0)) rec.produced(id, `rebirth:${character}`);
    }
  }
  return rec.obs;
}
