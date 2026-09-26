// @ts-check
// Items (Config_Item): obtainable — some driver saw the sim hand the item to the survivor — and usable as its config
// says (tools/coverage/uses.mjs).
import { CAT, devEntry, nameOf } from '../data.mjs';
import { check, family, few } from '../family.mjs';
import { NO_USE, USED_UP, expectedUses } from '../uses.mjs';

// FEATURES.md rows an item's gap reopens, read from what the config says the item is.
/** @type {Record<number, string[]>} */
const CAT_ROWS = {
  [CAT.FOOD]: ['G01'],
  [CAT.MEDICINE]: ['C10'],
  [CAT.BOOK]: ['T02'],
  [CAT.CONSOLE]: ['T01'],
  [CAT.DAILY]: ['D06'],
  [CAT.TOOL]: ['I08'],
  [CAT.PACK]: ['D11'],
  [CAT.MATERIAL]: ['I02'],
  [CAT.SEED]: ['H02'],
  [CAT.FERTILIZER]: ['H04'],
  [CAT.TRAP]: ['K01'],
  [CAT.FUEL]: ['G04'],
  [CAT.PACKAGE]: ['E08'],
  [CAT.FLOWER]: ['H08'],
  [CAT.DEFENSE]: ['M04'],
};
/** @type {Record<string, string[]>} */
const USE_ROWS = { eat: ['G01'], cook: ['G03', 'G05'], brew: ['G10'], cut: ['D10'], read: ['T02'], open: ['D11'], install: ['E08'], fuel: ['G04'], seed: ['H02'], fertilize: ['H04'], trap: ['K01'], vase: ['H08'], bait: ['M09'], throw: ['M04'], material: ['I02'], tool: ['I08'], place: ['F11'], disinfect: ['D08'], trade: ['O03'] };

/** @param {import('../data.mjs').Row} it */
function obtainRows(it) {
  if (it.story) return ['P16'];
  if (it.cat === CAT.FOOD && /邻家女孩/.test(it.d1 || '')) return ['O01'];
  if (it.cat === CAT.FOOD && /\((完美|优良|普通|失败)\)$/.test(it.zh || '')) return ['G05'];
  if (it.cat === CAT.BOOK && /写满字迹的.*笔记/.test(it.zh || '')) return ['Q05'];
  return CAT_ROWS[it.cat] || ['D06'];
}

/** @param {import('../data.mjs').Row} it @param {string[]} failed */
function useRows(it, failed) {
  const rows = new Set(failed.flatMap((u) => (u === 'use' ? CAT_ROWS[it.cat] || ['D06'] : USE_ROWS[u] || ['D06'])));
  if (it.story) rows.add('P16');
  return [...rows];
}

/**
 * @param {{ cfg: import('../data.mjs').Config, obs: import('../observe.mjs').Obs }} ctx
 * @returns {import('../family.mjs').Family}
 */
export function evaluate({ cfg, obs }) {
  const uses = expectedUses(cfg.items, cfg.funcs);
  /** @type {string[]} */
  const noUse = [];
  const direct = obs.results.itemuse || {};
  const rows = Object.values(cfg.items).map((it) => {
    const excluded = devEntry(it);
    if (excluded) return { id: it.id, name: nameOf(it), excluded };
    const from = obs.produced[it.id] || [];
    const want = uses[it.id] || [];
    /** @type {string[]} */
    const failed = [];
    /** @type {string[]} */
    const failedUses = [];
    /** @type {string[]} */
    const passed = [];
    for (const u of want) {
      // burning a burnable material in a stove is using it up, too
      const burnt = u === 'material' && direct[it.id]?.fuel?.ok;
      const r = USED_UP.has(u) ? (obs.used[it.id]?.length || burnt ? { ok: true } : { ok: false, why: 'no sim action used it up' }) : direct[it.id]?.[u] || { ok: false, why: 'not probed' };
      if (r.ok) passed.push(u);
      else {
        failed.push(`${u}: ${/** @type {any} */ (r).why}`);
        failedUses.push(u);
      }
    }
    /** @type {Record<string, import('../family.mjs').Check>} */
    const checks = { obtain: check(from.length > 0, from.length ? few(from) : 'no driver saw the sim hand it over') };
    if (want.length) checks.use = check(!failed.length, failed.length ? failed.join('; ') : passed.join(', '));
    else noUse.push(String(it.id));
    return {
      id: it.id,
      name: nameOf(it),
      checks,
      rows: { obtain: obtainRows(it), use: useRows(it, failedUses) },
    };
  });
  return family(
    {
      id: 'items',
      title: 'Items',
      source: 'Config_Item (src/data/gen/items.js)',
      checks: [
        { id: 'obtain', title: 'obtainable: shop stock, loot, crafting, cooking, harvest, traps, events, people, starter kits, …' },
        { id: 'use', title: 'usable as its config says (eat, use, read, open, install, fuel, seed, bait, material, …)' },
      ],
    },
    rows,
    noUse.length ? [`no use check for ${noUse.length} item(s) (${NO_USE}): ${noUse.join(', ')}`] : []
  );
}
