// @ts-check
// What the config says an item is for (Config_Item: Category, CantUse, CanCook, CanBrew, CutProductId, Burnable /
// BurnValue, Plant), as the uses the item probe checks in the sim.
import { FUNCS } from '../../src/data/gen/funcs.js';
import { CAT } from './data.mjs';

/**
 * Direct uses run in drivers/itemuse.mjs; 'material', 'tool' and 'bait' are shown by any driver whose sim action used
 * the item up (or used it as a tool).
 */
export const USES = {
  eat: 'Food the item menu lets the survivor eat (CantUse unset)',
  cook: 'CanCook: a stove takes it as an ingredient',
  brew: 'CanBrew with satiety: the brewing barrel takes it',
  cut: 'CutProductId: the item menu cuts it into pieces',
  use: 'Medicine, daily items and consoles the item menu uses (CantUse unset)',
  read: 'Books and documents the item menu reads (CantUse unset)',
  open: 'Packs the item menu opens',
  install: 'Furniture packages that install into a home slot',
  fuel: 'Fuel, or a burnable non-food item (patch 08-14: food such as cooking wine is never fuel): a stove, generator or heater takes it',
  seed: 'Seeds that sow into a planter',
  fertilize: 'Fertilizer applied to a growing crop',
  trap: 'Traps set in a trap slot',
  vase: 'Flowers arranged in a vase',
  throw: 'Defense consumables thrown at a horde (Molotovs)',
  bait: 'Defense items the item menu cannot use (rotten-meat bait): a sim action uses them up',
  material: 'Materials: a sim action (crafting, repairs, quests, burning, …) uses them up',
  tool: 'Tools: a sim action uses them up or needs them',
  place: 'An item the item menu cannot use that a furniture function names (records: "放上唱片《…》"): that function takes it',
  disinfect: 'Medicine the item menu cannot use whose description is spraying disinfectant: the Disinfect function (消毒) uses it',
  trade: 'An item the item menu cannot use with a trade value: some trading post pays for it',
};

/** Items no config field gives a use (CantUse, no trade value, no burn value, no function names them): only obtained. */
export const NO_USE = 'the config gives it no use: CantUse, no trade value, no burn value, and no furniture function names it';

/**
 * Furniture functions whose name contains the item's name (a function that takes that item).
 * @param {Record<string, any>} it @param {Record<string, Record<string, any>>} funcs
 * @returns {number[]}
 */
export function namingFuncs(it, funcs = FUNCS) {
  const name = it.zh || '';
  if (name.length < 3) return [];
  return Object.values(funcs)
    .filter((f) => typeof f.zh === 'string' && f.zh !== name && f.zh.includes(name))
    .map((f) => f.id);
}

/**
 * @param {Record<string, Record<string, any>>} items  Config_Item rows by id
 * @param {Record<string, Record<string, any>>} [funcs]  Config_FurnitureFunc rows by id
 * @returns {Record<string, string[]>} item id -> the uses its config names
 */
export function expectedUses(items, funcs = FUNCS) {
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const it of Object.values(items)) {
    const u = [];
    const c = it.cat;
    if (c === CAT.FOOD && !it.noUse) u.push('eat');
    if (c === CAT.FOOD && it.cook && !it.cut) u.push('cook');
    if (c === CAT.FOOD && it.brew && it.sat > 0) u.push('brew');
    if (it.cut) u.push('cut');
    if ((c === CAT.MEDICINE || c === CAT.DAILY || c === CAT.CONSOLE) && !it.noUse) u.push('use');
    if (c === CAT.BOOK && !it.noUse) u.push('read');
    if (c === CAT.PACK) u.push('open');
    if (c === CAT.PACKAGE) u.push('install');
    if (c === CAT.FUEL || (it.burn > 0 && c !== CAT.FOOD)) u.push('fuel');
    if (c === CAT.SEED) u.push('seed');
    if (c === CAT.FERTILIZER) u.push('fertilize');
    if (c === CAT.TRAP) u.push('trap');
    if (c === CAT.FLOWER) u.push('vase');
    if (c === CAT.DEFENSE) u.push(it.noUse ? 'bait' : 'throw');
    if (c === CAT.MATERIAL) u.push('material');
    if (c === CAT.TOOL) u.push('tool');
    if (!u.length && it.noUse) {
      if (namingFuncs(it, funcs).length) u.push('place');
      else if (c === CAT.MEDICINE && /消毒/.test(`${it.d1 || ''}${it.d2 || ''}`)) u.push('disinfect');
      else if (it.trade > 0) u.push('trade');
    }
    out[it.id] = u;
  }
  return out;
}

/** Uses no direct driver runs: evidence is an item used up by some sim action. */
export const USED_UP = new Set(['material', 'tool', 'bait']);
