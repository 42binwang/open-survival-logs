// Read-only access to the extracted game config plus derived lookup tables.
import { ITEMS } from './gen/items.js';
import { RECIPES } from './gen/recipes.js';
import { PLANTS } from './gen/plants.js';
import { CRAFTS } from './gen/crafts.js';
import { FURNITURE } from './gen/furniture.js';
import { FUNCS } from './gen/funcs.js';
import { AUX } from './gen/aux.js';
import { CODEX } from './gen/codex.js';
import { ACHIEVEMENT_CONFIG } from './gen/achievements.js';
import { loc } from '../engine/i18n.js';

export const CAT = {
  FOOD: 1,
  MEDICINE: 2,
  BOOK: 3,
  CONSOLE: 4,
  DAILY: 5,
  TOOL: 6,
  PACK: 8,
  MATERIAL: 9,
  SEED: 10,
  FERTILIZER: 11,
  TRAP: 12,
  FUEL: 13,
  FURNITURE_PACKAGE: 14,
  FLOWER: 15,
  DEFENSE: 16,
};

export const SUB = {
  NONE: 0,
  STAPLE: 1,
  MEAT: 2,
  CUSTARD: 3,
  FISH: 4,
  VEGETABLE: 5,
  FRUIT: 6,
  SNACK: 7,
  SEASONING: 8,
  SOFT_DRINK: 9,
  LIQUOR: 10,
  MUSHROOM: 11,
};

export const SLOT = {
  NONE: 0,
  SMALL: 1,
  MEDIUM: 2,
  LARGE: 3,
  WALL: 4,
  TABLETOP: 6,
  BED: 7,
  DOOR: 8,
  WINDOW: 9,
  DEFENSE: 10,
};

// ElectricalType in Config_Furniture / Config_FurnitureElectrical
export const ELEC = {
  NONE: 0,
  CONSUMER: 1,
  SOLAR: 2,
  FUEL_GEN: 3,
  MANUAL_GEN: 4,
  BATTERY: 5,
  RAT_GEN: 6,
  FUEL_HEATER: 7,
};

export const items = ITEMS;
export const recipes = RECIPES.recipes;
export const tierRules = RECIPES.tierRules;
export const plants = PLANTS;
export const crafts = CRAFTS;
export const furniture = FURNITURE;
export const funcs = FUNCS;
export const aux = AUX;
export const codex = CODEX;
export const achievementConfig = ACHIEVEMENT_CONFIG;

export function item(id) {
  return ITEMS[id];
}

export function itemName(id) {
  const it = ITEMS[id];
  return it ? loc(it.zh) : `#${id}`;
}

export function furn(id) {
  return FURNITURE[id];
}

export function furnName(id) {
  const f = FURNITURE[id];
  return f ? loc(f.zh) : `#${id}`;
}

export function recipe(id) {
  return RECIPES.recipes[id];
}

export function plant(id) {
  return PLANTS[id];
}

export function craft(id) {
  return CRAFTS[id];
}

export function func(id) {
  return FUNCS[id];
}

const byId = (rows, key = 'ID') => Object.fromEntries(rows.map((r) => [r[key], r]));
const cookCfgs = byId(AUX.FurnitureCook);
const elecCfgs = byId(AUX.FurnitureElectrical);
const plantCfgs = byId(AUX.FurniturePlant);
const tagCfgs = byId(AUX.FurnitureTag);

export function cookCfg(id) {
  return cookCfgs[id];
}
export function elecCfg(id) {
  return elecCfgs[id];
}
export function plantCfg(id) {
  return plantCfgs[id];
}
export function furnitureTags() {
  return AUX.FurnitureTag;
}
export function furnitureTag(id) {
  return tagCfgs[id];
}
export function plantLevels() {
  return AUX.PlantLv;
}
export function productionLevels() {
  return AUX.ProductionLv;
}
export function subCategoryName(sub) {
  const row = AUX.ItemSubCategory.find((r) => r.ID === sub);
  return row ? loc(row.Name_Local) : '';
}
export function foodTypeName(tag) {
  const row = AUX.FoodType.find((r) => r.ID === tag);
  return row ? loc(row.Name_Local) : '';
}

// ------------------------------------------------------------------ derived indices
export const seedToPlant = {};
for (const it of Object.values(ITEMS)) {
  if (it.cat === CAT.SEED && it.plant) seedToPlant[it.id] = it.plant;
}

export const packageToFurniture = {};
export const furnitureToPackage = {};
for (const it of Object.values(ITEMS)) {
  if (it.cat === CAT.FURNITURE_PACKAGE && it.furn) {
    packageToFurniture[it.id] = it.furn;
    if (!furnitureToPackage[it.furn]) furnitureToPackage[it.furn] = it.id;
  }
}

// dish output item id -> { recipe, quality }  (quality 0 perfect, 1 good, 2 normal, 3 fail)
export const dishOutput = {};
for (const r of Object.values(RECIPES.recipes)) {
  r.out.forEach((iid, q) => {
    if (iid && !dishOutput[iid]) dishOutput[iid] = { recipe: r.id, quality: q };
  });
}

export function isFood(it) {
  return it && it.cat === CAT.FOOD;
}

export function isMeat(it) {
  return it && it.cat === CAT.FOOD && (it.sub === SUB.MEAT || it.sub === SUB.FISH || it.tags.includes(2) || it.tags.includes(4));
}

export function isAnimalProduct(it) {
  return isMeat(it) || (it && it.cat === CAT.FOOD && (it.sub === SUB.CUSTARD || it.tags.includes(3)));
}

export function isFuel(it) {
  return it && (it.cat === CAT.FUEL || it.burn > 0);
}

export function needsFridge(it) {
  // Fresh ingredients that spoil within ~10 days benefit from refrigeration.
  return it && it.cat === CAT.FOOD && it.life > 0 && it.life <= 10;
}

// Items the player can see in the codex (food and prey categories)
export function codexList(category) {
  return CODEX[category] || [];
}

export function allItemsOfCat(cat) {
  return Object.values(ITEMS).filter((it) => it.cat === cat);
}
