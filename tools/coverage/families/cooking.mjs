// @ts-check
// Cooking recipes (Config_CookingRecipe): cooked end to end on a cooker whose config allows the recipe, and every
// distinct output item of its quality bands (Perfect, Good, Normal, Fail) produced.
import { cookableRecipes, devEntry, nameOf } from '../data.mjs';
import { check, family } from '../family.mjs';

const BAND = ['Perfect', 'Good', 'Normal', 'Fail'];

/**
 * @param {{ cfg: import('../data.mjs').Config, obs: import('../observe.mjs').Obs }} ctx
 * @returns {import('../family.mjs').Family}
 */
export function evaluate({ cfg, obs }) {
  const allowed = cookableRecipes(cfg);
  const runs = obs.results.cooking || {};
  const rows = Object.values(cfg.recipes).map((r) => {
    const name = nameOf(r);
    const excluded = devEntry(r) || (allowed.has(r.id) ? null : 'no Config_FurnitureCook row lists it in AllowedRecipes');
    if (excluded) return { id: r.id, name, excluded };
    const res = runs[r.id];
    const made = new Set(Object.values(res?.outputs || {}));
    /** @type {string[]} */
    const missing = [];
    const seen = new Set();
    r.out.forEach((/** @type {number} */ id, /** @type {number} */ band) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      if (!made.has(id)) missing.push(`${BAND[band]} ${id}`);
    });
    const why = (res?.problems || []).join('; ');
    return {
      id: r.id,
      name,
      checks: {
        cook: check(!!res?.cooked, res?.cooked ? `on ${res.cooker} as the ${res.character}` : why || 'not probed'),
        outputs: check(!!res && !missing.length, !res ? 'not probed' : missing.length ? `never produced: ${missing.join(', ')}${why ? ` (${why})` : ''}` : `${seen.size} output item(s)`),
      },
    };
  });
  return family(
    {
      id: 'cooking',
      title: 'Cooking recipes',
      source: 'Config_CookingRecipe (src/data/gen/recipes.js)',
      checks: [
        { id: 'cook', title: 'cooks end to end on a cooker that allows it' },
        { id: 'outputs', title: 'every quality band’s output item is produced' },
      ],
    },
    rows
  );
}
