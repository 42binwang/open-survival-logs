// @ts-check
// Cooking recipes (Config_CookingRecipe), end to end: install a cooker whose Config_FurnitureCook allows the recipe,
// stock the backpack, let the cookbook's Fill pick the ingredients, fuel or power the cooker, cook and collect.
// Each quality band (Perfect, Good, Normal, Fail -> the recipe's four config outputs) is cooked separately: the
// probe picks legitimate conditions that make the band possible (cooking level, spoiled ingredients) and an RNG seed
// that lands the quality roll in it. A band no legitimate condition reaches is reported as unreachable.
import { HOUR, give, keepAlive, loadSim, placeAtHome, postGame } from '../sim.mjs';
import { Recorder } from '../observe.mjs';
import { gameConfig } from '../data.mjs';

const MAX_LV = 5;
const SEED_TRIES = 400;
const FUEL = 8001; // butane canister: the fuel the fuel stove is sold with
/** The cook mode this driver cooks in (src/sim/cooking.js COOK_MODE.NORMAL); hot pot and press have panels of their own. */
export const NORMAL_COOK_MODE = 0;

/**
 * The cookers this driver can cook a recipe on: Config_FurnitureCook rows in the normal cook mode that allow it, each
 * with the furniture pieces of that cooker that have a slot to install into.
 * @param {import('../data.mjs').Config} cfg
 * @param {number} rid
 * @returns {{ cook: Record<string, any>, pieces: number[] }[]}
 */
export function cookersFor(cfg, rid) {
  return cfg.cookers
    .filter((c) => c.CookMode === NORMAL_COOK_MODE && (c.AllowedRecipes || []).includes(rid))
    .map((c) => ({ cook: c, pieces: Object.values(cfg.furniture).filter((f) => f.cook === c.ID && f.slot !== 0).map((f) => f.id) }))
    .filter((c) => c.pieces.length);
}

/**
 * @param {{ recipes: number[], character?: string }} args
 */
export async function run({ recipes, character }) {
  const S = await loadSim();
  const C = S.cooking;
  const db = S.db;
  const rec = new Recorder();
  const student = new Set(C.STUDENT_RECIPES);
  const config = gameConfig();
  if (C.COOK_MODE.NORMAL !== NORMAL_COOK_MODE) rec.warn(`cooking: the sim's normal cook mode is ${C.COOK_MODE.NORMAL}, the driver cooks in ${NORMAL_COOK_MODE}`);

  // a cooker piece per Config_FurnitureCook row, installed in a prepared post-disaster run per character
  /** @type {Map<string, { base: any, uid: number, cfgId: number } | null>} */
  const bases = new Map();
  /** @param {string} ch @param {{ cook: Record<string, any>, pieces: number[] }} cooker */
  const baseFor = (ch, cooker) => {
    const key = `${ch}:${cooker.cook.ID}`;
    if (bases.has(key)) return bases.get(key) || null;
    let out = null;
    for (const id of cooker.pieces) {
      const s = postGame(S, { seed: 41, character: ch });
      if (ch === 'student') {
        // she recalls one of her recipes each night at 22:00
        for (let h = 0; h < 8 * 24 && s.cooking.unlocked.length < C.STUDENT_RECIPES.length; h++) {
          S.tick.tick(s, HOUR);
          keepAlive(s);
        }
      }
      const piece = placeAtHome(S, s, id);
      if (!piece) continue;
      S.tick.tick(s, 60);
      out = { base: s, uid: piece.uid, cfgId: id };
      break;
    }
    bases.set(key, out);
    return out;
  };

  const ingredients = Object.values(db.items).filter((/** @type {any} */ it) => C.isIngredient(it) && !it.cut);
  /**
   * Ingredients (id, units) that the sim's own matcher turns into the recipe on this cooker: the exact items of a
   * special dish; for a tag-combo dish a search over ingredients of the tagged sub-categories and fitting price
   * tiers; for Dark Cuisine two ingredients that match nothing.
   * @param {any} r
   * @param {any} s
   * @param {any} cfg
   * @returns {[number, number][] | null}
   */
  const ingredientSet = (r, s, cfg) => {
    const allowed = C.allowedRecipes(cfg);
    // matched as a cook of the recipe's own level would: an exact recipe above that level gives way to a tag dish
    const opts = { allowed, usable: (/** @type {any} */ x) => C.recipeUsable(s, x), level: Math.max(0, r.minLv || 0) };
    /** @param {number[]} ids */
    const tally = (ids) => [...new Set(ids)].map((id) => /** @type {[number, number]} */ ([id, ids.filter((x) => x === id).length]));
    if (r.items.length) return tally(r.items);
    if (r.id === C.DARK_RECIPE) {
      for (const a of /** @type {any[]} */ (ingredients)) for (const b of /** @type {any[]} */ (ingredients)) if (C.matchRecipe([a.id, b.id], opts)?.dark) return tally([a.id, b.id]);
      return null;
    }
    const slots = [...r.tags].sort((a, b) => a - b);
    const cands = slots.map((sub) =>
      ingredients
        .filter((/** @type {any} */ it) => it.sub === sub && (C.ingredientTier(it) == null || C.ingredientTier(it) >= r.tier))
        // ingredients of exactly the dish tier first: one of them has to set the tier
        .sort((/** @type {any} */ a, /** @type {any} */ b) => Number(C.ingredientTier(a) !== r.tier) - Number(C.ingredientTier(b) !== r.tier) || a.id - b.id)
        .map((/** @type {any} */ it) => it.id)
    );
    /** @type {number[]} */
    const chosen = [];
    let budget = 50000;
    /** @param {number} i @returns {boolean} */
    const visit = (i) => {
      if (budget-- <= 0) return false;
      if (i === slots.length) return C.matchRecipe(chosen, opts)?.recipe.id === r.id;
      for (const id of cands[i]) {
        if (i > 0 && slots[i] === slots[i - 1] && id < chosen[i - 1]) continue;
        chosen.push(id);
        if (visit(i + 1)) return true;
        chosen.pop();
      }
      return false;
    };
    return visit(0) ? tally(chosen) : null;
  };

  for (const rid of recipes) {
    const r = db.recipe(rid);
    const res = { cooked: false, cooker: /** @type {number | null} */ (null), character: /** @type {string | null} */ (null), outputs: /** @type {Record<string, number | null>} */ ({}), problems: /** @type {string[]} */ ([]) };
    rec.result('cooking', rid, res);
    if (!r) {
      res.problems.push('not in Config_CookingRecipe');
      continue;
    }
    const cooks = cookersFor(config, rid);
    if (!cooks.length) {
      res.problems.push('no Config_FurnitureCook row in the normal cook mode allows it on a piece that installs');
      continue;
    }
    const ch = character || (student.has(rid) ? 'student' : 'wage');
    res.character = ch;
    let prepared = null;
    for (const c of cooks) if ((prepared = baseFor(ch, c))) break;
    if (!prepared) {
      res.problems.push(`no cooker allowing it installs in the ${ch} home`);
      continue;
    }
    res.cooker = prepared.cfgId;
    const cfg = C.cookerConfig(prepared.base.furniture[prepared.uid]);
    const stock = ingredientSet(r, prepared.base, cfg);
    if (!stock) {
      res.problems.push(r.items.length ? 'its ingredients are not all cookable' : 'no combination of cookable ingredients the sim matches to it (each candidate set makes another dish)');
      continue;
    }
    /** @type {Map<number, string>} */
    const why = new Map();
    for (let band = 0; band < 4; band++) {
      const want = r.out[band];
      if (!want || Object.values(res.outputs).includes(want)) continue;
      const outcome = cookBand(S, rec, prepared, r, stock, band);
      if (outcome.ok) {
        res.cooked = true;
        res.outputs[band] = outcome.item;
      } else {
        why.set(band, outcome.why);
        if (outcome.fatal) break;
      }
    }
    // a band whose dish another band produced is covered (Dark Cuisine is one item for all four)
    const made = new Set(Object.values(res.outputs));
    for (const [band, text] of why) if (!made.has(r.out[band])) res.problems.push(`${['Perfect', 'Good', 'Normal', 'Fail'][band]}: ${text}`);
  }
  return rec.obs;
}

/**
 * Cook the recipe once so that its quality roll lands in `band`.
 * @param {Record<string, any>} S
 * @param {Recorder} rec
 * @param {{ base: any, uid: number }} prepared
 * @param {any} r  the recipe
 * @param {[number, number][]} stock  ingredients to put in the backpack
 * @param {number} band  0 perfect, 1 good, 2 normal, 3 fail
 * @returns {{ ok: true, item: number } | { ok: false, why: string, fatal?: boolean }}
 */
function cookBand(S, rec, prepared, r, stock, band) {
  const C = S.cooking;
  const minLv = Math.max(0, r.minLv || 0);
  /** @type {[number, number][]} (level, spoiled ingredients) to try, most natural first */
  const conditions = [];
  const levels = band <= 1 ? [MAX_LV, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, MAX_LV];
  for (const spoiled of band <= 1 ? [0] : [0, 1, 2, 3, 4, 5]) for (const lv of levels) if (lv >= minLv) conditions.push([lv, spoiled]);
  let lastWhy = 'no condition reaches it';
  for (const [lv, spoiled] of conditions) {
    const cur = S.proficiency.profLevel(prepared.base, 'cook');
    if (lv < cur) continue; // below the character's starting level
    const s = structuredClone(prepared.base);
    const f = s.furniture[prepared.uid];
    if (lv > cur) S.proficiency.addProfLevels(s, 'cook', lv - cur);
    for (const [id, n] of stock) give(S, s, id, n);
    const filled = C.fillRecipe(s, f.uid, r.id);
    if (!filled.ok && r.id !== C.DARK_RECIPE) {
      // the Fill matches at the cook's level too: a tag dish can be out of reach at one level and not at another
      lastWhy = `the cookbook's Fill found no ingredients (${filled.reason})`;
      continue;
    }
    if (r.id === C.DARK_RECIPE) {
      // the cookbook never offers Dark Cuisine: the ingredients go into the pot by hand
      const bp = s.inventories[s.player.backpack];
      for (const [id, units] of stock) {
        for (const inst of bp.items.filter((/** @type {any} */ i) => i.id === id).slice(0, units)) C.addIngredient(s, f.uid, bp.id, inst.uid);
      }
    }
    const d = C.cookerState(s, f);
    const pot = s.inventories[d.pot].items;
    let n = 0;
    for (const inst of pot) {
      const life = S.db.item(inst.id)?.life || 0;
      if (n < spoiled && life > 0) {
        inst.age = life;
        n++;
      }
    }
    if (n < spoiled) continue;
    const cfg = C.cookerConfig(f);
    if (cfg.CookType === C.COOK_TYPE.FUEL) {
      const bp = s.inventories[s.player.backpack];
      for (let i = 0; i < cfg.FuelSlotCount; i++) {
        const inst = give(S, s, FUEL)[0];
        C.addFuel(s, f.uid, bp.id, inst.uid);
      }
    }
    const plan = C.predictDish(s, f.uid);
    if (!plan?.match) return { ok: false, why: 'the cooker makes nothing from these ingredients', fatal: true };
    if (plan.match.recipe.id !== r.id) {
      // what a pot makes can depend on the cook's level (an exact recipe the cook knows beats a tag dish): try the
      // other levels, and fail with this reason when none makes the recipe
      lastWhy = `these ingredients make ${plan.match.recipe.id} instead (${pot.map((/** @type {any} */ i) => i.id).join(', ')})`;
      continue;
    }
    if (plan.problem) {
      lastWhy = plan.problem;
      continue;
    }
    const chances = C.qualityChances(plan.roll, r.q, plan.match.dark);
    if (!(chances[band] > 0)) continue;
    const seed = seedFor(S, plan.roll, r.q, band);
    if (seed == null) continue;
    s.rng = S.rng.seedRng(seed);
    const outInv = () => s.inventories[C.cookerState(s, f).out];
    const w = rec.watch(s, `cooking:${r.id}`, () => {
      const started = C.startCooking(s, f.uid);
      if (!started.ok) return { ok: false, why: started.reason };
      const job = started.job;
      for (let t = 0; t < job.dur * 2 + 6 * HOUR && C.cookerState(s, f).job; t += 1800) {
        S.tick.tick(s, 1800);
        keepAlive(s);
      }
      if (C.cookerState(s, f).job) return { ok: false, why: `still cooking after ${Math.round((job.dur * 2) / HOUR)} h (tended: ${!!job.tend})` };
      return { ok: true, quality: job.quality, item: job.out };
    });
    const out = w.value;
    if (!out.ok) return { ok: false, why: out.why, fatal: true };
    if (out.quality !== band) return { ok: false, why: `rolled quality ${out.quality} instead of ${band}` };
    if (!outInv()?.items.some((/** @type {any} */ i) => i.id === out.item) && !w.up.includes(out.item)) return { ok: false, why: `the dish ${out.item} never reached the output` };
    return { ok: true, item: out.item };
  }
  return { ok: false, why: lastWhy };
}

/**
 * An RNG seed whose first roll puts the dish quality in `band`.
 * @param {Record<string, any>} S
 * @param {{ center: number, spread: number }} roll
 * @param {number[]} q
 * @param {number} band
 */
function seedFor(S, roll, q, band) {
  for (let k = 1; k <= SEED_TRIES; k++) {
    const u = S.rng.nextFloat(S.rng.seedRng(k));
    if (S.cooking.qualityIndex(roll.center + (u * 2 - 1) * roll.spread, q) === band) return k;
  }
  return null;
}
