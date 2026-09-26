// @ts-check
// The denominators: every entity of the generated game config (src/data/gen, built by tools/build_data.py), and the
// only reasons an entity may be left out of a family. Each reason is a rule over config fields, stated with the rule;
// none depends on what the recreation's content or sim does.
import { ITEMS } from '../../src/data/gen/items.js';
import { FURNITURE } from '../../src/data/gen/furniture.js';
import { FUNCS } from '../../src/data/gen/funcs.js';
import { RECIPES } from '../../src/data/gen/recipes.js';
import { CRAFTS } from '../../src/data/gen/crafts.js';
import { PLANTS } from '../../src/data/gen/plants.js';
import { AUX } from '../../src/data/gen/aux.js';
import { ACHIEVEMENT_CONFIG } from '../../src/data/gen/achievements.js';
import { EN_NAMES } from '../../src/data/gen/en.js';

/**
 * @typedef {Record<string, any>} Row  one config row as src/data/gen stores it
 * @typedef {object} Config
 * @property {Record<string, Row>} items  Config_Item
 * @property {Record<string, Row>} furniture  Config_Furniture
 * @property {Record<string, Row>} funcs  Config_FurnitureFunc
 * @property {Record<string, Row>} recipes  Config_CookingRecipe
 * @property {Record<string, Row>} crafts  Config_ProductionList
 * @property {Record<string, Row>} plants  Config_Plant
 * @property {Row[]} cookers  Config_FurnitureCook
 * @property {Row[]} achievements  Config_Achievement
 */

/** @returns {Config} the generated config the game ships */
export function gameConfig() {
  return {
    items: ITEMS,
    furniture: FURNITURE,
    funcs: FUNCS,
    recipes: RECIPES.recipes,
    crafts: CRAFTS,
    plants: PLANTS,
    cookers: AUX.FurnitureCook,
    achievements: ACHIEVEMENT_CONFIG.list,
  };
}

/** Config_Item categories (src/data/db.js CAT). */
export const CAT = { FOOD: 1, MEDICINE: 2, BOOK: 3, CONSOLE: 4, DAILY: 5, TOOL: 6, PACK: 8, MATERIAL: 9, SEED: 10, FERTILIZER: 11, TRAP: 12, FUEL: 13, PACKAGE: 14, FLOWER: 15, DEFENSE: 16 };

/** English name of a config row (the build's name table), else its Chinese name. */
export function nameOf(/** @type {Row | undefined} */ row) {
  const zh = row?.zh || '';
  return EN_NAMES[/** @type {keyof typeof EN_NAMES} */ (zh)] || zh || '';
}

// Development entries: the config names them test / not-yet-enabled / invalid entries or templates ("测试",
// "暂未启用", "无效删除", "（模板）", "【开发者】"), or its description says so: a test or development-phase entry
// ("测试", "开发阶段"), a template ("模板"), or a stand-in the builder places while building ("占位使用",
// "占位摆设", "占位家具"; "占位" alone means "takes up space" and is no such mark).
const DEV_NAME = /测试|暂未启用|无效删除|（模板）|\(模板\)|【开发者】/;
const DEV_TEXT = /测试|开发阶段|模板|占位使用|占位摆设|占位家具/;

/** @param {Row} row @returns {string | null} why the config marks the row as a development entry */
export function devEntry(row) {
  if (DEV_NAME.test(row.zh || '')) return `the config names it a development entry (${row.zh})`;
  for (const k of ['desc', 'd1', 'd2', 'tip']) if (typeof row[k] === 'string' && DEV_TEXT.test(row[k])) return `its config text marks it a development entry (${row[k].slice(0, 40)})`;
  return null;
}

/** Package items (Config_Item category 14) by the furniture they unpack into (TargetFurnitureID). @param {Config} cfg */
export function packagesByFurniture(cfg) {
  /** @type {Map<number, number>} furniture -> its first package item */
  const pkg = new Map();
  for (const it of Object.values(cfg.items)) if (it.cat === CAT.PACKAGE && it.furn && !pkg.has(it.furn)) pkg.set(it.furn, it.id);
  return pkg;
}

// Models (Config_Furniture.Res) that stand in for a piece: P_WoodBox_02 is the plain crate that five decor rows
// (statue, craft piece, fountain, rockery, wine rack) point at; one of them has a shipped twin with its own model and a
// package (9304). A row on a stand-in model that no package item hands out is left out.
const STANDIN_MODELS = new Set(['P_WoodBox_02']);
// Models of the player's homes: the original homes (Home_, NewHome), the Warehouse Manager's warehouse and the
// College Student's duplex (the neighbour girl's house, Neighbor_Girl / NHome).
const HOME_MODEL = /^(P_)?(Home_|NewHome|WarehouseManager|NHome_|Neighbor_Girl)/;
// Models of shop and exploration-site scenes: the pre-disaster supermarket (Market_), convenience store
// (SmallMarket), hardware store (Tool_Store), building-materials market, farmers' market and car dealership, and the
// post-disaster supermarket (P_NEWMaket, its own shelves and chest freezers), school (Explore_School) and hospital
// (TanSuo_) sets.
const PRE_SCENE_MODEL = /^(Market_|SmallMarket|Tool_Store|P_Building_materials_market|P_Farmers_market|Used_Car_DealerShip)/;
const POST_SCENE_MODEL = /^(P_NEWMaket|Explore_School|TanSuo)/;
const SCENE_MODEL = { test: (/** @type {string} */ res) => PRE_SCENE_MODEL.test(res) || POST_SCENE_MODEL.test(res) };
// Config_Furniture id blocks of the post-disaster exploration sites (hospital 66xxx, school and office 67xxx): a
// piece there that reuses a shop model stands after the outbreak.
const SITE_BLOCK = (/** @type {number} */ id) => id >= 66000 && id < 68000;
const POST_OUTBREAK = 2; // Config_FurnitureFunc.Chapter: after the outbreak only
const REMOVE = 299; // Dismantle
const MOVE = 1608; // Move
const TAKE = 1; // Take: opens the piece's own storage
const SHOP = 6; // Shop
const CONSTRUCTION_SHOP = 53; // Construction Shop

/**
 * @typedef {'home' | 'site' | 'decor'} FurnitureClass
 * A shop or site piece is told first: drawn with a shop or site scene model, a counter that offers Shop or
 *   Construction Shop without storage of its own (the storage box and locker, 1 and 4, offer Shop and Take), or a
 *   loot container the player can neither dismantle nor move (site copies of home racks drawn with home models).
 * home: otherwise a package item hands it out, or it has a slot type and the player may dismantle or move it, or it
 *   is drawn with a home model — obtainable, installable, every function working, rendered;
 * site: any other piece with a (non-development) function or a loot group — placed somewhere, its functions working
 *   there, rendered;
 * decor: the rest — placed somewhere and rendered.
 */

/**
 * @param {Config} cfg
 * @returns {Map<number, { cls: FurnitureClass | null, excluded: string | null }>}
 */
export function furnitureScope(cfg) {
  const pkg = packagesByFurniture(cfg);
  /** @type {Map<number, { cls: FurnitureClass | null, excluded: string | null }>} */
  const out = new Map();
  for (const f of Object.values(cfg.furniture)) {
    const excluded =
      devEntry(f) ||
      (!f.zh ? 'the config gives it no name' : null) ||
      (STANDIN_MODELS.has(f.res) && !pkg.has(f.id) ? `drawn with the stand-in model ${f.res} and no package item hands it out` : null);
    if (excluded) {
      out.set(f.id, { cls: null, excluded });
      continue;
    }
    const funcs = /** @type {number[]} */ (f.funcs || []);
    const notForSale = /（非卖品）|\(非卖品\)/.test(f.zh);
    const removable = (f.rmFunc || []).includes(REMOVE) || (f.mvFunc || []).includes(MOVE);
    const counter = (funcs.includes(SHOP) || funcs.includes(CONSTRUCTION_SHOP)) && !funcs.includes(TAKE);
    const shopOrSite = SCENE_MODEL.test(f.res || '') || counter;
    const container = f.loot > 0 && !removable;
    const home = !shopOrSite && (pkg.has(f.id) || (f.slot > 0 && removable && !notForSale) || (HOME_MODEL.test(f.res || '') && !container));
    const live = funcs.some((k) => cfg.funcs[k] && !devEntry(cfg.funcs[k]));
    out.set(f.id, { cls: home ? 'home' : live || f.loot > 0 ? 'site' : 'decor', excluded: null });
  }
  return out;
}

/**
 * Why a function of a piece can never run where the original stands the piece, or null: a post-outbreak function
 * (Chapter 2) on a piece of a pre-outbreak shop scene (its model), outside the post-outbreak site id blocks. Those
 * shops exist only before the outbreak; the post-outbreak supermarket has its own model set.
 * @param {Config} cfg @param {number} piece @param {number} fnId
 * @returns {string | null}
 */
export function phaseUnreachable(cfg, piece, fnId) {
  const f = cfg.furniture[piece];
  const fn = cfg.funcs[fnId];
  if (!f || !fn || fn.chapter !== POST_OUTBREAK || !PRE_SCENE_MODEL.test(f.res || '') || SITE_BLOCK(f.id)) return null;
  return `a post-outbreak function on a pre-outbreak shop piece (${f.res})`;
}

/** @type {WeakMap<Config, ReturnType<typeof furnitureScope>>} */
const scopes = new WeakMap();
/** furnitureScope, computed once per config. @param {Config} cfg */
export function furnitureScopeOf(cfg) {
  let sc = scopes.get(cfg);
  if (!sc) scopes.set(cfg, (sc = furnitureScope(cfg)));
  return sc;
}

/**
 * Why a Config_FurnitureFunc row is out of scope, or null:
 * - a development entry, or the config gives it no name and no furniture offers it;
 * - an id below 100 that no furniture offers and the config gives no visibility condition (FuncVisible): the
 *   prototype block, superseded by the numbered families (200+, 1500+); one with a visibility condition is wired into
 *   the game (42, force-making the rescue marker);
 * - FuncType 3 (the planning-mode Install) that no furniture offers: installing is the furniture family's install check;
 * - offered only by furniture the furniture family leaves out (development entries, unnamed rows, stand-ins).
 * @param {Config} cfg
 * @param {Row} fn
 * @param {Map<number, number[]>} offered  offeredFuncs(cfg)
 */
export function funcExcluded(cfg, fn, offered) {
  const dev = devEntry(fn);
  if (dev) return dev;
  const by = offered.get(fn.id) || [];
  if (!fn.zh && !by.length) return 'the config gives it no name and no Config_Furniture row offers it';
  if (!by.length && fn.id < 100 && !fn.vis) return 'a prototype function (id below 100) with no visibility condition that no Config_Furniture row offers';
  if (!by.length && fn.ftype === 3) return 'the planning-mode Install (FuncType 3), which no Config_Furniture row offers';
  if (by.length && by.every((id) => cfg.furniture[id] && devEntry(cfg.furniture[id]))) return `offered only by development furniture (${by.join(', ')})`;
  const scope = furnitureScopeOf(cfg);
  if (by.length && by.every((id) => scope.get(id)?.excluded)) return `offered only by furniture the furniture family leaves out (${by.join(', ')}: ${scope.get(by[0])?.excluded})`;
  return null;
}

/**
 * Function ids some Config_Furniture row offers (FurnitureFunc, RemoveFunc or MoveFunc).
 * @param {Config} cfg
 */
export function offeredFuncs(cfg) {
  /** @type {Map<number, number[]>} func id -> furniture ids */
  const by = new Map();
  for (const f of Object.values(cfg.furniture)) {
    for (const k of [...(f.funcs || []), ...(f.rmFunc || []), ...(f.mvFunc || [])]) {
      if (!by.has(k)) by.set(k, []);
      /** @type {number[]} */ (by.get(k)).push(f.id);
    }
  }
  return by;
}

/** @param {Config} cfg @returns {Set<number>} recipe ids some Config_FurnitureCook lists in AllowedRecipes */
export function cookableRecipes(cfg) {
  return new Set(cfg.cookers.flatMap((c) => c.AllowedRecipes || []));
}

/** @param {Config} cfg @returns {Map<number, number[]>} plant id -> seed item ids (Config_Item.Plant) */
export function seedsByPlant(cfg) {
  /** @type {Map<number, number[]>} */
  const m = new Map();
  for (const it of Object.values(cfg.items)) {
    if (!it.plant) continue;
    if (!m.has(it.plant)) m.set(it.plant, []);
    /** @type {number[]} */ (m.get(it.plant)).push(it.id);
  }
  return m;
}
