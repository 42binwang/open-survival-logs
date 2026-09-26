// @ts-check
// Whole runs left to the simulation: a story run for each character and a Pure Endless run, day after day, with the
// survivor kept fed and rested, the doors mended before a horde breaks in, and every event resolved with its
// default choice as it comes up. What the world hands over on its own (horde rewards, deliveries, event rewards,
// recipes taught by surviving long enough) is recorded.
import { HOUR, keepAlive, keepSafe, loadSim, postGame } from '../sim.mjs';
import { Recorder, trackUnlocks } from '../observe.mjs';

/** @param {{ character: string, mode?: string, days?: number }} args */
export async function run({ character, mode = 'story', days = 45 }) {
  const S = await loadSim();
  const rec = new Recorder();
  const off = trackUnlocks(S, rec, `timeline:${character}${mode === 'story' ? '' : `:${mode}`}`);
  const s = mode === 'story' ? postGame(S, { seed: 131, character }) : S.state.newGame({ seed: 131, character, mode, skipPrologue: true });
  const src = `timeline:${character}${mode === 'story' ? '' : `:${mode}`}`;
  for (let h = 0; h < days * 24 && s.phase === 'post'; h += 6) {
    rec.watch(s, src, () => {
      for (let i = 0; i < 6; i++) {
        keepSafe(S, s);
        S.tick.tick(s, HOUR);
        keepAlive(s);
        S.story.drainEvents(s);
      }
    });
  }
  if (s.phase !== 'post') rec.warn(`timeline: the ${character} ${mode} run ended (${s.phase}) on day ${S.time.dayNumber(s.clock)}`);
  off();
  return rec.obs;
}
