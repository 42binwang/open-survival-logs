// @ts-check
// Food processing outside the recipe book: the brewing barrel (fruit and grain ferment strong, vegetables average,
// spoiled food poor), the ration press (a block of every flavor, quarter-block fragments, rat rations), the compost
// bin (rotten meat and scraps into fertilizer) and plain spoilage (rot products).
import { HOUR, give, keepAlive, keepSafe, loadSim, placeAtHome, postGame } from '../sim.mjs';
import { Recorder } from '../observe.mjs';

const BARREL = 66001;
const PRESS = 70008;
const COMPOST = 66000;
const DAY = 24 * HOUR;

/** @param {Record<string, never>} _args */
export async function run(_args) {
  const S = await loadSim();
  const C = S.cooking;
  const db = S.db;
  const rec = new Recorder();
  const foods = /** @type {any[]} */ (Object.values(db.items)).filter((it) => it.cat === db.CAT.FOOD && it.sat > 0 && !it.noUse);
  /** @param {any} s @param {number} hours */
  const wait = (s, hours) => {
    for (let h = 0; h < hours; h++) {
      keepSafe(S, s);
      S.tick.tick(s, HOUR);
      keepAlive(s);
    }
  };

  // brewing: ingredients of one kind up to the brewing line, 48 hours sealed
  const base = postGame(S, { seed: 121, character: 'wage' });
  const barrel = placeAtHome(S, base, BARREL);
  const press = placeAtHome(S, base, PRESS);
  const compost = placeAtHome(S, base, COMPOST);
  for (const [name, f] of Object.entries({ barrel, press, compost })) if (!f) rec.warn(`brewing: the ${name} does not install`);
  S.tick.tick(base, 60);
  if (barrel) {
    const brews = [
      ['fruit', foods.filter((it) => C.isBrewable(it) && it.sub === db.SUB.FRUIT), 0],
      ['vegetable', foods.filter((it) => C.isBrewable(it) && it.sub === db.SUB.VEGETABLE), 0],
      ['spoiled', foods.filter((it) => C.isBrewable(it) && it.life > 0), 1],
    ];
    for (const [label, list, spoiled] of /** @type {[string, any[], number][]} */ (brews)) {
      const s = structuredClone(base);
      const inv = s.inventories[s.furniture[barrel.uid].inv];
      for (const it of [...list].sort((a, b) => a.size[0] * a.size[1] - b.size[0] * b.size[1] || b.sat - a.sat)) {
        if (C.brewStatus(s, barrel.uid).bottles >= 1) break;
        S.inventory.addItem(s, inv, it.id, { allowOverweight: true, age: spoiled ? it.life : 0 });
      }
      rec.watch(s, `brew:${label}`, () => {
        const r = C.startBrewing(s, barrel.uid);
        if (!r.ok) return rec.warn(`brewing: ${label} did not start (${r.reason})`);
        wait(s, C.BREW.hours + 2);
      });
    }
  }
  // the ration press: each flavor, the fragments poured back, rodents
  if (press) {
    /** @type {Map<number, any[]>} */
    const byFlavor = new Map();
    for (const it of foods) {
      const fl = C.isPressable(it) && C.rationFlavor(it);
      if (fl) byFlavor.set(fl, [...(byFlavor.get(fl) || []), it]);
    }
    for (const [flavor, list] of byFlavor) {
      const s = structuredClone(base);
      const bp = s.inventories[s.player.backpack];
      let sat = 0;
      for (const it of list) {
        if (sat >= (C.RATION.block * 1.5) / C.RATION.keep) break;
        const inst = give(S, s, it.id)[0];
        if (!inst || !C.addToPress(s, press.uid, bp.id, inst.uid).ok) continue;
        sat += C.foodSat(inst);
      }
      rec.watch(s, `press:${flavor}`, () => {
        const r = C.startPress(s, press.uid);
        if (!r.ok) return rec.warn(`brewing: pressing flavor ${flavor} did not start (${r.reason})`);
        C.tickCooking(s, r.job.dur + 60);
      });
    }
  }
  // the compost bin: rotten meat turns into fertilizer in days; scraps rot five times faster
  if (compost) {
    const s = structuredClone(base);
    const inv = s.inventories[s.furniture[compost.uid].inv];
    for (const id of [26008, 26009, 26010]) S.inventory.addItem(s, inv, id, { allowOverweight: true });
    const scraps = foods.filter((it) => it.life > 0 && it.rot?.length).slice(0, 4);
    for (const it of scraps) S.inventory.addItem(s, inv, it.id, { allowOverweight: true, age: it.life });
    rec.watch(s, 'compost', () => wait(s, 5 * 24));
  }
  // spoilage: every rot product of the config, from food left in a cupboard past its shelf life
  const rotting = new Map();
  for (const it of foods) if (it.life > 0 && it.rot?.length && !rotting.has(it.rot[0])) rotting.set(it.rot[0], it);
  for (const [product, it] of rotting) {
    const s = structuredClone(base);
    const inst = give(S, s, it.id)[0];
    if (!inst) continue;
    inst.age = it.life;
    rec.watch(s, `rot:${it.id}`, () => wait(s, Math.ceil((S.spoilage.rotAtDays(it) - it.life) * DAY / HOUR) + 12));
    if (!s.inventories[s.player.backpack].items.some((/** @type {any} */ i) => i.id === product)) rec.warn(`brewing: ${it.id} did not rot into ${product}`);
  }
  return rec.obs;
}
