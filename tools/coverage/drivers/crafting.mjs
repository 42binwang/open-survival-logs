// @ts-check
// Crafting recipes (Config_ProductionList), end to end at the home workbench: repair the workbench with its manual,
// unlock the recipe the way the sim offers it (crafting level, else a planning card; recipes that only events,
// exploration or rewards teach are unlocked with the sim's unlockRecipe, and the family checks that some driver saw
// such an unlock happen), carry the materials, queue the craft, let the survivor work, and compare the products with
// the config. The Perfect bonus and the salvage of a failed craft (crafting above one's level) are rolled with RNG
// seeds that land them.
import { HOUR, give, keepAlive, loadSim, postGame, runUntilIdle, unlockHome } from '../sim.mjs';
import { Recorder } from '../observe.mjs';

const MANUAL = 9020; // Workbench Manual: what the broken starter workbench needs
const SEED_TRIES = 400;

/** @param {number[]} ids @returns {string} sorted multiset key */
const bag = (ids) => [...ids].sort((a, b) => a - b).join(',');

/** @param {{ crafts: number[] }} args */
export async function run({ crafts }) {
  const S = await loadSim();
  const K = S.crafting;
  // no unlock tracking here: this driver's own unlockRecipe shortcut is no evidence that the game teaches a recipe
  const rec = new Recorder();
  /** @type {Map<string, { s: any, bench: number }>} */
  const bases = new Map();
  /** @param {string} character */
  const baseFor = (character) => {
    const hit = bases.get(character);
    if (hit) return hit;
    const s = postGame(S, { seed: 51, character });
    unlockHome(S, s);
    const bench = S.home.homeFurniture(s).find((/** @type {any} */ f) => K.isWorkbench(f));
    if (bench?.broken) {
      give(S, s, MANUAL);
      // the bench's own repair function, the way its menu offers it
      const repair = S.furnActions.furnitureFunctions(s, bench).find((/** @type {any} */ e) => e.spec.kind === 'repairWorkbench' && e.enabled);
      if (repair) S.furnActions.startFurnitureFunction(s, bench.uid, repair.key);
      runUntilIdle(S, s, 4 * HOUR);
    }
    keepAlive(s);
    const out = { s, bench: bench?.uid };
    bases.set(character, out);
    return out;
  };

  for (const id of crafts) {
    const row = S.db.craft(id);
    const r = K.recipeDef(id);
    const res = { offered: !!r, character: /** @type {string | null} */ (null), unlock: /** @type {string | null} */ (null), crafted: false, products: /** @type {number[]} */ ([]), perfect: /** @type {number[] | null} */ (null), salvage: /** @type {number[] | null} */ (null), problems: /** @type {string[]} */ ([]) };
    rec.result('crafting', id, res);
    if (!row) {
      res.problems.push('not in Config_ProductionList');
      continue;
    }
    if (!r) {
      res.problems.push('the sim does not offer it');
      continue;
    }
    const character = K.unlockHint(baseFor('wage').s, id).includes('Supply Warehouse') ? 'warehouse' : 'wage';
    res.character = character;
    const base = baseFor(character);
    if (base.bench == null || base.s.furniture[base.bench]?.broken) {
      res.problems.push(`the ${character} workbench could not be repaired`);
      continue;
    }
    /** @param {number} [level] @returns {{ s: any, why?: string }} */
    const prepare = (level) => {
      const s = structuredClone(base.s);
      const lv = S.proficiency.profLevel(s, 'craft');
      const want = Math.max(level ?? 0, K.isRecipeCraftable(s, id) ? 0 : r.craftLv || 0);
      if (want > lv) S.proficiency.addProfLevels(s, 'craft', want - lv);
      if (!K.isRecipeCraftable(s, id)) {
        const card = S.settlement.availableCards(s).find((/** @type {any} */ c) => c.recipes?.includes(id));
        if (card) {
          S.settlement.applyCard(s, card);
          res.unlock ||= `planning card ${card.id}`;
        } else if (S.unlocks.unlockRecipe(s, id)) res.unlock ||= 'unlockRecipe';
      } else if (!res.unlock) res.unlock = r.craftLv > 0 && lv < r.craftLv ? `crafting Lv${r.craftLv}` : `known at the start (Lv${lv})`;
      if (!K.isRecipeCraftable(s, id)) return { s, why: K.unlockHint(s, id) || 'not craftable' };
      for (const [iid, n] of K.recipeNeeds(id)) give(S, s, iid, n);
      keepAlive(s);
      return { s };
    };

    // end to end: queue the craft, walk to the workbench, work for LifeMin minutes
    const p = prepare();
    if (p.why) {
      res.problems.push(`cannot craft it: ${p.why}`);
      continue;
    }
    const s = p.s;
    const bench = s.furniture[base.bench];
    const w = rec.watch(s, `craft:${id}`, () => {
      const why = K.canCraft(s, bench.uid, id);
      if (why !== true) return { ok: false, why };
      const a = K.startCraft(s, bench.uid, id);
      if (!a) return { ok: false, why: 'startCraft refused' };
      runUntilIdle(S, s, K.craftDurationSec(s, id) + 6 * HOUR);
      const result = bench.data.craft?.result;
      return result?.id === id ? { ok: true, result } : { ok: false, why: 'the craft action did not complete' };
    });
    if (!w.value.ok) {
      res.problems.push(w.value.why);
      continue;
    }
    const got = w.value.result;
    res.crafted = true;
    res.products = got.failed ? [] : got.products.flatMap((/** @type {[number, number]} */ [iid, n]) => Array(n).fill(iid));
    if (got.failed) res.problems.push('the end-to-end craft failed (salvage only)');
    else if (bag(res.products) !== bag(r.out)) res.problems.push(`made ${bag(res.products)} instead of ${bag(r.out)}`);
    if (got.perfect) res.perfect = got.bonus.flatMap((/** @type {[number, number]} */ [iid, n]) => Array(n).fill(iid));

    // the Perfect bonus
    if (r.pOut.length && !res.perfect) {
      const q = prepare();
      if (!q.why && K.perfectChance(q.s, id) > 0) {
        const out = rollCraft(S, rec, q.s, id, (o) => o.perfect);
        if (out) res.perfect = out.bonus.flatMap((/** @type {[number, number]} */ [iid, n]) => Array(n).fill(iid));
      }
      if (!res.perfect) res.problems.push('Perfect: never rolled');
    }
    // salvage of a failed craft: crafting above one's level, at the lowest level that can craft it
    if (r.fail.length) {
      const lowest = Math.min(...['wage', 'student', 'warehouse'].map((ch) => S.characters.CHARACTERS[ch].startProf?.craft ?? 0));
      const q = prepare(lowest);
      if (!q.why && K.failChance(q.s, id) > 0) {
        const out = rollCraft(S, rec, q.s, id, (o) => o.failed);
        if (out) res.salvage = out.salvage.flatMap((/** @type {[number, number]} */ [iid, n]) => Array(n).fill(iid));
      }
      if (!res.salvage) res.problems.push(`Fail: no level that can craft it is below its level ${r.lv}`);
    }
  }
  return rec.obs;
}

/**
 * Craft once (the sim's instant craft) with the first RNG seed whose rolls satisfy `want`.
 * @param {Record<string, any>} S
 * @param {Recorder} rec
 * @param {any} base  a run with the materials in the backpack
 * @param {number} id
 * @param {(o: any) => boolean} want
 */
function rollCraft(S, rec, base, id, want) {
  for (let k = 1; k <= SEED_TRIES; k++) {
    const s = structuredClone(base);
    s.rng = S.rng.seedRng(k);
    const bench = S.crafting.findWorkbench(s);
    const probe = S.crafting.craftOnce(s, id, { uid: bench.uid });
    if (!probe.ok || !want(probe)) continue;
    const t = structuredClone(base);
    t.rng = S.rng.seedRng(k);
    return rec.watch(t, `craft:${id}`, () => S.crafting.craftOnce(t, id, { uid: S.crafting.findWorkbench(t).uid })).value;
  }
  return null;
}
