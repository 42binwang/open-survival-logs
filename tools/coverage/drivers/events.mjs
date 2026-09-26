// @ts-check
// Story, random and clue events (src/content/events.js) and quests: every event is fired for every character it is
// written for, on its first day, and resolved once with each of its choices (the items a choice takes are put in
// the backpack first; choices with a chance roll run over several seeds). Quests are started and completed so their
// rewards apply. Items the rewards hand over, recipes they teach and items they take are recorded.
import { CHARACTERS, HOUR, give, keepAlive, loadSim, postGame } from '../sim.mjs';
import { Recorder, trackUnlocks } from '../observe.mjs';

const FOOD = 2107; // generic supplies for choices that ask for food, medicine or fuel
const MEDICINE = 2400;
const FUEL = 8001;

/** @param {{ events?: string[], seeds?: number }} args */
export async function run({ events, seeds = 4 }) {
  const S = await loadSim();
  const St = S.story;
  const rec = new Recorder();
  const off = trackUnlocks(S, rec, 'events');
  const all = /** @type {any[]} */ (S.events.EVENTS).filter((e) => !events || events.includes(e.id));
  for (const e of all) {
    for (const character of e.characters || CHARACTERS) {
      const choices = e.choices?.length ? e.choices : [{}];
      choices.forEach((/** @type {any} */ choice, /** @type {number} */ index) => {
        const chancy = JSON.stringify(choice.effects || {}).includes('"chance"');
        for (let seed = 1; seed <= (chancy ? seeds : 1); seed++) {
          const s = postGame(S, { seed: 300 + seed, character });
          const day = Math.max(2, e.day ?? e.dayRange?.[0] ?? 2);
          s.clock.t = S.time.dayStartT(s.clock, day) + (e.hour ?? 12) * HOUR;
          s.run.day = day;
          keepAlive(s);
          const eff = choice.effects || {};
          for (const [id, n] of eff.take || []) give(S, s, id, n);
          if (eff.food) give(S, s, FOOD, Math.ceil(eff.food / 10) + 2);
          if (eff.medicine) give(S, s, MEDICINE, eff.medicine);
          if (eff.fuel) give(S, s, FUEL, eff.fuel);
          s.story.pending = [];
          s.story.active = null;
          const w = rec.watch(s, `event:${e.id}`, () => {
            if (!St.fireEvent(s, e.id)) return null;
            return St.resolveEvent(s, index);
          });
          if (!w.value && index === 0) rec.warn(`events: ${e.id} could not be presented to the ${character}`);
        }
      });
    }
  }
  if (!events) {
    for (const [id, def] of Object.entries(/** @type {Record<string, any>} */ (S.events.QUESTS))) {
      for (const character of def.characters || CHARACTERS) {
        const s = postGame(S, { seed: 400, character });
        rec.watch(s, `quest:${id}`, () => St.startQuest(s, id) && St.completeQuest(s, id));
      }
    }
  }
  off();
  return rec.obs;
}
