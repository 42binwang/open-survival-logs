// @ts-check
// Crafting recipes (Config_ProductionList): crafted end to end at a workbench with the config's products, the Perfect
// bonus and the salvage of a failed craft produced where the config has them, and a way the game teaches the recipe
// (crafting level, a planning card, or an event, exploration find, reward or timed unlock some driver saw).
import { devEntry, nameOf } from '../data.mjs';
import { check, family, few } from '../family.mjs';

/**
 * @param {{ cfg: import('../data.mjs').Config, obs: import('../observe.mjs').Obs }} ctx
 * @returns {import('../family.mjs').Family}
 */
export function evaluate({ cfg, obs }) {
  const runs = obs.results.crafting || {};
  const rows = Object.values(cfg.crafts).map((r) => {
    const name = nameOf(r);
    const res = runs[r.id];
    const excluded = devEntry(r) || (!r.use ? 'Config_ProductionList.IsUseable is false (a development-phase recipe)' : null);
    if (excluded) return { id: r.id, name, excluded };
    const bag = (/** @type {number[]} */ ids) => [...ids].sort((a, b) => a - b).join(',');
    const made = !!res?.crafted && bag(res.products) === bag(r.out);
    const out = [];
    if (r.pOut?.length && !res?.perfect) out.push('Perfect bonus never produced');
    if (r.fail?.length && !res?.salvage) out.push('failure salvage never produced');
    const taught = res?.unlock === 'unlockRecipe' ? obs.unlocks[r.id] || [] : null;
    const problems = (res?.problems || []).join('; ');
    return {
      id: r.id,
      name,
      checks: {
        craft: check(made, !res ? 'not probed' : made ? `${bag(r.out)} as the ${res.character}` : problems || 'not crafted'),
        outputs: check(!!res && !out.length, !res ? 'not probed' : out.length ? `${out.join('; ')}${problems ? ` (${problems})` : ''}` : 'config outputs produced'),
        unlock: check(!!res?.unlock && (taught == null || taught.length > 0), !res?.unlock ? problems || 'no unlock path' : taught == null ? res.unlock : taught.length ? `taught by ${few(taught, 2)}` : 'only the probe could teach it: no event, exploration, reward or timed unlock taught it in any driver'),
      },
    };
  });
  return family(
    {
      id: 'crafting',
      title: 'Crafting recipes',
      source: 'Config_ProductionList (src/data/gen/crafts.js)',
      checks: [
        { id: 'craft', title: 'crafts end to end at a workbench into its config products' },
        { id: 'outputs', title: 'the Perfect bonus and failure salvage the config lists are produced' },
        { id: 'unlock', title: 'the game teaches it (level, planning card, event, exploration, reward, timed unlock)' },
      ],
    },
    rows
  );
}
