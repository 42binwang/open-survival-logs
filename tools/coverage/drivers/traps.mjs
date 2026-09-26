// @ts-check
// Traps and prey: every trap item (Config_Item category 12) set through the action queue in each trap slot habitat
// it works in, baited with food, left until the hourly roll makes a catch; then, from that moment, more catches over
// RNG seeds (the sim's own catch roll) so every prey of the trap type shows up. Live rodents then go into a rat cage
// without feed until they starve (their remains).
import { CHARACTERS, HOUR, give, keepAlive, keepSafe, loadSim, placeAtHome, postGame, runUntilIdle, unlockHome } from '../sim.mjs';
import { Recorder } from '../observe.mjs';

const BAIT = 2114; // ham sausage: food with satiety
const CAGE = 42010; // small mouse cage
const SEED_TRIES = 150;

/** @param {{ seeds?: number }} args */
export async function run({ seeds = SEED_TRIES }) {
  const S = await loadSim();
  const T = S.traps;
  const rec = new Recorder();
  const traps = /** @type {any[]} */ (Object.values(S.db.items)).filter((it) => it.cat === S.db.CAT.TRAP);
  /** @type {Set<number>} */
  const live = new Set();
  for (const trap of traps) {
    const res = { set: [], caught: /** @type {number[]} */ ([]), problems: /** @type {string[]} */ ([]) };
    rec.result('traps', trap.id, res);
    for (const character of CHARACTERS) {
      const s0 = postGame(S, { seed: 91, character });
      unlockHome(S, s0);
      const habitats = new Map();
      for (const slot of T.trapSlots(s0)) if (!s0.home.slots[slot.id] && T.trapFits(s0, trap.id, slot)) habitats.set(T.habitatOf(s0, slot), slot.id);
      for (const [habitat, slotId] of habitats) {
        const s = structuredClone(s0);
        const inst = give(S, s, trap.id)[0];
        const placed = rec.watch(s, `trap:${trap.id}`, () => {
          T.queuePlaceTrap(s, inst.uid, slotId);
          return runUntilIdle(S, s, 2 * HOUR);
        });
        const f = S.home.furnitureAt(s, slotId);
        if (!f || f.cfg !== 'trap') {
          res.problems.push(`${character}: could not set it at ${slotId} (${habitat})`);
          continue;
        }
        if (!placed.down.includes(trap.id)) res.problems.push(`${character}: setting it did not use up the trap item`);
        /** @type {any[]} */ (res.set).push(`${character}:${habitat}`);
        S.inventory.addItem(s, s.inventories[f.data.bait], BAIT, { allowOverweight: true });
        // the first catch the natural way: the hourly roll
        let hours = 0;
        rec.watch(s, `trap:${trap.id}`, () => {
          for (; hours < 24 * 20 && !(s.inventories[f.data.hold]?.items.length); hours++) {
            keepSafe(S, s);
            S.tick.tick(s, HOUR);
            keepAlive(s);
          }
        });
        const first = s.inventories[f.data.hold]?.items[0]?.id;
        if (!first) {
          res.problems.push(`${character}: nothing caught at ${habitat} in 20 days`);
          continue;
        }
        if (!res.caught.includes(first)) res.caught.push(first);
        // more catches from here on, one RNG seed each
        for (let k = 1; k <= seeds; k++) {
          const t = structuredClone(s);
          t.rng = S.rng.seedRng(k);
          const tf = t.furniture[f.uid];
          t.inventories[tf.data.hold].items = [];
          S.inventory.addItem(t, t.inventories[tf.data.bait], BAIT, { allowOverweight: true });
          tf.data.durability = tf.data.maxDurability;
          const prey = rec.watch(t, `trap:${trap.id}`, () => T.rollCatch(t, tf)).value;
          if (prey && !res.caught.includes(prey)) res.caught.push(prey);
        }
      }
    }
    for (const id of res.caught) if (S.power.isLiveRodent(id)) live.add(id);
  }
  // live rodents in a rat cage without feed starve and leave their remains
  const s = postGame(S, { seed: 92, character: 'wage' });
  const cage = placeAtHome(S, s, CAGE);
  if (!cage) rec.warn(`traps: the mouse cage (${CAGE}) does not install`);
  else {
    for (const id of live) {
      const t = structuredClone(s);
      const inst = give(S, t, id)[0];
      if (S.power.putRodent(t, cage.uid, t.player.backpack, inst.uid) !== true) {
        rec.warn(`traps: a live ${id} does not go into the mouse cage`);
        continue;
      }
      rec.watch(t, `ratCage:${id}`, () => {
        for (let h = 0; h < 24 * 10 && S.power.cageRodents(t, t.furniture[cage.uid]).length; h++) {
          keepSafe(S, t);
          S.tick.tick(t, HOUR);
          keepAlive(t);
        }
      });
    }
  }
  return rec.obs;
}
