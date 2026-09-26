// @ts-check
// Whether a Config_FurnitureFunc works on a given piece, from the drivers' evidence: in a home (drivers/furniture.mjs
// runs the function from the furniture menu), at an exploration site (drivers/sitefx.mjs) or in a pre-disaster shop
// (drivers/shops.mjs). At a site or shop fixture a function works when an interaction completes there whose action
// carries the function's id (actionDone.funcKey, as furniture-menu actions do). Interactions whose actions name no
// function fall back to the interaction the function's config actions (FuncAction) describe; one that names another
// function is that function, not this one. A function whose actions hand out supplies (1100/1101) works only when
// items actually came out.

/** Config actions (FuncAction ids) that hand out a loot roll. */
export const LOOT_ACTS = new Set([1100, 1101]);

/** @param {Record<string, any>} fn  a Config_FurnitureFunc row */
export const isLoot = (fn) => (fn.acts || []).some((/** @type {number} */ a) => LOOT_ACTS.has(a));

/** @type {Record<string, number[]>} interaction -> the config actions that describe it */
const ACTS = {
  loot: [1100, 1101, 1106, 1919, 1925, 1932, 1604, 1504, 1104],
  pry: [1929, 1103, 1926],
  pick: [1102],
  clear: [199],
  recycle: [1943],
  buy: [4, 12],
  trial: [1702, 1907, 1908, 1909, 1910, 1911, 1912, 1913],
  blood: [9001],
};
/** @type {Record<number, string>} FuncType -> interaction */
const FTYPES = { 8: 'car', 9: 'cart', 4: 'returns' };
const REST = /睡觉|打盹|休息/;

/**
 * Interactions a function needs at a site or shop fixture when the fixture's actions carry no function id;
 * 'unmapped:<acts>' when no fixture interaction of the recreation matches its config actions. A resting name
 * (sleep, nap, rest) is the clue only when the config actions map to nothing: the showroom sofa's rest is its try-out.
 * @param {Record<string, any>} fn
 * @returns {string[]}
 */
export function needs(fn) {
  const out = new Set();
  const acts = /** @type {number[]} */ (fn.acts || []);
  for (const [what, ids] of Object.entries(ACTS)) if (acts.some((a) => ids.includes(a))) out.add(what);
  if (FTYPES[fn.ftype]) out.add(FTYPES[fn.ftype]);
  if (!out.size && REST.test(fn.zh || '')) out.add('rest');
  if (!out.size) out.add(`unmapped:${acts.join('+') || `FuncType ${fn.ftype}`}`);
  return [...out];
}

/** @param {string} need @param {Record<string, { done: boolean, items: boolean }>} modes  one placement's interactions */
function met(need, modes) {
  const d = (/** @type {string} */ m) => !!modes[m]?.done;
  const i = (/** @type {string} */ m) => !!modes[m]?.done && !!modes[m]?.items;
  switch (need) {
    case 'loot':
      return i('search') || i('pick') || i('pry') || i('loot') || i('trial');
    case 'recycle':
      // taken apart for its materials: the prop is cleared and materials come out
      return i('clear');
    case 'pry':
    case 'pick':
    case 'clear':
    case 'rest':
    case 'trial':
    case 'car':
    case 'cart':
    case 'returns':
      return d(need);
    case 'buy':
      return d('buy');
    case 'blood':
      return d('sellBlood');
    default:
      return false;
  }
}

/** Interactions that work only when items come out: loot handed over, materials from a prop taken apart. */
const YIELDS = new Set(['loot', 'recycle']);

/**
 * The interactions at one placement that completed with an action naming the function and had the outcome its
 * interactions require (items, for a function that loots or recycles).
 * @param {Record<string, any>} fn @param {Record<string, { done: boolean, items: boolean, funcs?: number[] }>} modes
 */
function carried(fn, modes) {
  const yields = isLoot(fn) || needs(fn).some((n) => YIELDS.has(n));
  return Object.entries(modes)
    .filter(([, r]) => r.done && (r.funcs || []).includes(fn.id) && (!yields || r.items))
    .map(([m]) => m);
}

/**
 * @param {Record<string, any>} fn  a Config_FurnitureFunc row
 * @param {number} piece  a Config_Furniture id offering it
 * @param {import('./observe.mjs').Obs} obs
 * @returns {{ ok: boolean, where?: string, why: string }}
 */
export function funcOnPiece(fn, piece, obs) {
  const home = obs.results.furniture?.[piece]?.funcs?.[fn.id];
  const loot = isLoot(fn);
  if (home?.ok && (!loot || home.gave)) return { ok: true, where: String(home.by || 'home'), why: '' };
  const fx = obs.results.fixtures?.[piece];
  const want = needs(fn);
  /** @type {string[]} */
  const whys = [];
  for (const [where, modes] of Object.entries(/** @type {Record<string, any>} */ (fx?.modes || {}))) {
    const by = carried(fn, modes);
    if (by.length) return { ok: true, where: `${where} (${by.join(', ')} ran ${fn.id})`, why: '' };
    const unnamed = Object.fromEntries(Object.entries(/** @type {Record<string, any>} */ (modes)).filter(([, r]) => !r.funcs?.length));
    const missing = want.filter((n) => !met(n, unnamed));
    if (!missing.length) return { ok: true, where, why: '' };
    const tried = Object.entries(/** @type {Record<string, any>} */ (modes)).map(([m, r]) => `${m} ${r.done ? (r.items ? 'done, items' : 'done, no items') : `not done (${r.why || '?'})`}${r.funcs?.length ? ` [ran ${[...new Set(r.funcs)].join(', ')}]` : ''}`);
    whys.push(`${where}: no action ran ${fn.id}${loot || needs(fn).some((n) => YIELDS.has(n)) ? ' handing out items' : ''} and it needs ${missing.join(', ')}; ${tried.join('; ') || 'nothing offered'}`);
  }
  if (home?.ok && loot) whys.unshift('ran at home but handed out no items');
  else if (home) whys.unshift(...Object.values(/** @type {Record<string, string>} */ (home.why || {})).slice(0, 1).map(String));
  return { ok: false, why: whys[0] || (fx ? 'no interaction' : 'no probe placed it anywhere') };
}
