// Pre-disaster supply points (dev logs #3/#4, launch notes, guides G3/G4): the city map, shop floor
// plans with their real shop fixtures (Config_Furniture 101–113, 830–857, 9132–9146, 42014–42050,
// 80010), shelf stock tables derived from the item config, shop NPCs, riot loot, the doomsday rush,
// the countdown news ticker, the prologue and the Stockpile Checklist (dev log 06-03).
// Each fixture is the config piece of that shop's own scene (its model family): the convenience store's box pile
// (9134, SmallMarket06), the hardware store's pile of boxes (9146, Tool_Store07), the farmers' market planter
// counter (831, 花盆综合柜台, Construction Shop) and basket (851), the renovation company's classic furniture
// counters (804/806/814/815, 经典家具柜台, Construction Shop; P_Building_materials_market_*) and the car lot's repair
// rig, oil drum and junk pile (42015, 42018, 42041).
import { codex, item, furn, plant, allItemsOfCat, seedToPlant, CAT, SUB, ELEC, SLOT } from '../data/db.js';

// ------------------------------------------------------------------------------ city map
// map: position in percent of the 640 × 420 map panel. Walking time follows the on-map distance.
export const MAP_SIZE = [640, 420];
export const WALK_MIN_PER_PX = 0.3;
export const CAR_FACTOR = 35 / 60;

export const LOCATIONS = {
  home: { id: 'home', icon: '🏠', map: [50, 58], name: { en: 'Home', zh: '家' } },
  convenience: {
    id: 'convenience',
    supply: true,
    icon: '🏪',
    map: [42, 76],
    name: { en: 'Community Convenience Store', zh: '社区便利店' },
    blurb: { en: 'Cheap daily specials (ham sausages at $5), snacks, cold drinks and magazines.', zh: '每日特价（5元火腿肠）、零食、冷饮和杂志。' },
  },
  market: {
    id: 'market',
    supply: true,
    riot: true,
    icon: '🛒',
    map: [22, 36],
    name: { en: 'Discount Supermarket', zh: '特价超市' },
    blurb: { en: 'Rice, compressed biscuits, instant noodles, frozen food, condiments and medicine. Your neighbor shops by the produce.', zh: '大米、压缩饼干、泡面、冷冻食品、调料和常用药。邻居在蔬果区买菜。' },
  },
  hardware: {
    id: 'hardware',
    supply: true,
    icon: '🔧',
    map: [76, 30],
    name: { en: 'Hardware Store', zh: '工具店' },
    blurb: { en: 'Materials, patch kits, random material packs, tools, fuel and energy drinks.', zh: '材料、修补包、随机材料包、工具、燃料和能量饮料。' },
  },
  farmers: {
    id: 'farmers',
    supply: true,
    riot: true,
    icon: '🥕',
    map: [14, 80],
    name: { en: "Farmers' Market", zh: '农贸市场' },
    blurb: { en: 'Seeds, fertilizer, traps, fresh produce, and planters delivered to your door.', zh: '种子、肥料、陷阱、新鲜果蔬，花盆和培育箱送货上门。' },
  },
  renovation: {
    id: 'renovation',
    supply: true,
    riot: true,
    icon: '🛋',
    map: [84, 72],
    name: { en: 'Renovation Company', zh: '装修公司' },
    blurb: { en: 'Five wings of furniture and fixtures, delivered to your doorstep. A buyer at the gate takes old furniture.', zh: '五大展区的家具设备，送货到家门口。门口有人收旧家具。' },
  },
  carlot: {
    id: 'carlot',
    supply: true,
    icon: '🚗',
    map: [58, 14],
    name: { en: 'Used Car Lot & Gas Station', zh: '二手车场与加油站' },
    blurb: { en: 'A car turns a one-hour walk into a 35-minute drive and comes with a trunk. The gas station sells road-trip supplies.', zh: '有车后一小时路程只要35分钟，还有后备箱。加油站卖些路上用品。' },
  },
  blackmarket: {
    id: 'blackmarket',
    icon: '🩸',
    map: [30, 56],
    name: { en: 'Black Market', zh: '黑市' },
    blurb: { en: 'Nobody asks questions here. Sell blood for quick cash — you will pay for it later.', zh: '这里没人多问。卖血能换快钱——但之后要付出代价。' },
  },
};

export const SUPPLY_POINTS = Object.values(LOCATIONS)
  .filter((l) => l.supply)
  .map((l) => l.id);

// Minutes from one map node to another, on foot or by car (~1 h walk, ~35 min drive).
export function travelMinutes(from, to, byCar = false) {
  const a = LOCATIONS[from].map;
  const b = LOCATIONS[to].map;
  const px = Math.hypot(((a[0] - b[0]) * MAP_SIZE[0]) / 100, ((a[1] - b[1]) * MAP_SIZE[1]) / 100);
  const walk = Math.max(15, Math.round((px * WALK_MIN_PER_PX) / 5) * 5);
  return byCar ? Math.max(10, Math.round((walk * CAR_FACTOR) / 5) * 5) : walk;
}

// ------------------------------------------------------------------------------ stock tables
const FOOD = codex.food.map(item).filter((c) => c && c.price > 0 && !c.prey && c.id < 2900);
const foods = (pred) => FOOD.filter(pred).map((c) => c.id);
const isFrozen = (c) => /^(冷冻|冻(?!干)|速冻)/.test(c.zh) || c.id === 2213 || c.id === 2214;
const ofCat = (cat, pred = () => true) =>
  allItemsOfCat(cat)
    .filter((c) => c.price > 0 && pred(c))
    .map((c) => c.id);

const seedPlant = (c) => plant(seedToPlant[c.id]);
const SEEDS = allItemsOfCat(CAT.SEED).filter((c) => c.price > 0 && seedPlant(c)?.codex);
const isFlowerSeed = (c) => {
  const gain = seedPlant(c)?.gain?.[0];
  return item(gain)?.cat === CAT.FLOWER || item(gain)?.cat === CAT.MATERIAL;
};
const seeds = (pred) => SEEDS.filter((c) => pred(c, seedPlant(c))).map((c) => c.id);

// Furniture packages (Category 14) for sale, grouped into Renovation Company wings by Config_Furniture.Page.
const PAGE_WING = { 1: 'living', 2: 'living', 3: 'security', 4: 'appliances', 5: 'kitchenBath', 6: 'farmers', 7: 'decor' };
const WING_OVERRIDE = {
  15000: 'kitchenBath',
  15001: 'kitchenBath',
  21000: 'kitchenBath',
  21001: 'kitchenBath',
  21002: 'kitchenBath',
  21006: 'kitchenBath',
  21007: 'appliances',
  65000: 'appliances',
  65001: 'appliances',
  67000: 'decor',
};
const SALE_PACKAGES = allItemsOfCat(CAT.FURNITURE_PACKAGE).filter((c) => {
  const f = furn(c.furn);
  return f && f.price > 0 && !f.story && f.page >= 1 && f.page <= 7;
});
export function wingOf(furnId) {
  const f = furn(furnId);
  return f ? WING_OVERRIDE[f.id] || PAGE_WING[f.page] || null : null;
}
const wing = (w) => SALE_PACKAGES.filter((c) => wingOf(c.furn) === w).map((c) => c.id);

// ------------------------------------------------------------------------------ shops
// Fixture kinds: shelf (buy panel), loot (search once), trial (showroom try-outs), car, cart (trunk),
// returns (renovation service desk), checkout (doomsday rush), blood (black market), decor.
// Coordinates are tiles inside a walled room; the door is on the bottom wall.
const shelf = (id, cfg, x, y, w, h, items, extra = {}) => ({ id, kind: 'shelf', cfg, x, y, w, h, items, ...extra });
const fixture = (id, kind, cfg, x, y, w, h, extra = {}) => ({ id, kind, cfg, x, y, w, h, ...extra });

export const SHOP_FLOOR = 'S';

export const SHOPS = {
  market: {
    floor: { w: 16, h: 12, door: [8, 11], windows: [[4, 0], [12, 0]] },
    ground: [7, 10],
    fixtures: [
      shelf('staples', 101, 2, 2, 3, 1, [...foods((c) => c.sub === SUB.STAPLE && !isFrozen(c) && c.life >= 30), 2128, 2155]),
      shelf('snacks', 104, 6, 2, 3, 1, foods((c) => c.sub === SUB.SNACK || c.sub === SUB.SOFT_DRINK)),
      shelf('deli', 103, 10, 2, 3, 1, [...foods((c) => [SUB.MEAT, SUB.CUSTARD, SUB.FISH].includes(c.sub) && !isFrozen(c) && c.id < 2300 && c.id !== 2128), 2123, 2124, 2129]),
      shelf('medicine', 113, 14, 2, 1, 2, [2400, 2509, 2406, 2407, 2408, 2412, 6, 2147, 2402, 2164, 2003]),
      shelf('freezer', 102, 2, 5, 3, 1, [...foods((c) => isFrozen(c) && c.id < 2300), 2140, 2507]),
      shelf('bigFreezer', 106, 6, 5, 3, 1, foods((c) => c.id >= 2301 && c.id <= 2326)),
      shelf('condiments', 105, 10, 5, 3, 1, foods((c) => c.sub === SUB.SEASONING && c.id !== 2507 && c.id !== 2155)),
      shelf('produce', 840, 14, 5, 1, 3, [2125, 2127, 2539, 2504, 2527, 2528, 2538, 2522], { name: { en: 'Fruit & Vegetables', zh: '蔬果区' } }),
      shelf('bestseller', 110, 2, 8, 2, 1, foods((c) => c.rec === 3), { bulkAll: 5 }),
      shelf('nearExpiry', 112, 5, 8, 2, 1, [2500, 2501, 2502, 2510, 2511, 2512, 2160, 2110, 2113], { priceMult: 0.5, aged: 0.6 }),
      shelf('vip', 111, 10, 8, 2, 1, [...foods((c) => c.sub === SUB.LIQUOR), 11007, 12001]),
      fixture('checkout', 'checkout', 21005, 4, 10, 2, 1, { name: { en: 'Checkout (Doomsday Rush)', zh: '收银台（末日抢购）' } }),
      fixture('cart', 'cart', 315, 11, 10, 1, 1),
      fixture('crate', 'loot', 114, 1, 10, 1, 1, { loot: [[2102, 2], [2130, 1]], name: { en: 'Abandoned Trolley Box', zh: '被丢下的纸箱' } }),
      fixture('backroom', 'loot', 123, 1, 1, 1, 1, { hidden: true, loot: [[2115, 1], [2105, 1]], name: { en: 'Stockroom Leftovers', zh: '仓库里的余货' } }),
    ],
    npcs: [{ id: 'neighbor', x: 13, y: 8 }],
  },
  convenience: {
    floor: { w: 12, h: 10, door: [6, 9], windows: [[3, 0], [8, 0]] },
    ground: [5, 8],
    fixtures: [
      shelf('specials', 9135, 2, 2, 2, 1, [2114, 2102, 2510, 2511, 2512, 2117]),
      shelf('food', 9137, 5, 2, 3, 1, [2105, 2106, 2107, 2115, 2120, 2502, 2500, 2133, 2134, 2138, 2160]),
      shelf('freezer', 9136, 9, 2, 2, 1, [2140, 2507, 2104, 2207, 2208, 2130, 2142, 2131]),
      shelf('fruit', 9132, 2, 5, 2, 1, [2125, 2127, 2152, 2539, 2123]),
      shelf('magazines', 9133, 5, 5, 2, 1, [2505, 2506, 3002, 3006, 3024, 3001, 3003, 2508, 11009, 11010, 11011, 11012, 11013]),
      fixture('cart', 'cart', 315, 9, 7, 1, 1),
      fixture('box', 'loot', 9134, 10, 5, 1, 1, { loot: [[2508, 1], [2114, 2]], name: { en: 'Unpacked Delivery Box', zh: '没拆完的货箱' } }),
      fixture('counter', 'loot', 114, 1, 8, 1, 1, { hidden: true, loot: [[2131, 1]], name: { en: 'Under the Counter', zh: '柜台底下' } }),
    ],
    npcs: [{ id: 'youngCustomer', x: 4, y: 7 }],
  },
  hardware: {
    floor: { w: 14, h: 11, door: [7, 10], windows: [[4, 0], [10, 0]] },
    ground: [6, 9],
    fixtures: [
      shelf('basic', 9140, 2, 2, 3, 1, ofCat(CAT.MATERIAL, (c) => c.id >= 20001 && c.id <= 20005)),
      shelf('advanced', 9145, 6, 2, 3, 1, [20101, 20102, 20103, 20104, 20106, 20214, 20312, 20360, 20361, 20362, 20210]),
      shelf('parts', 9142, 10, 2, 2, 1, [20300, 20301, 20310, 20311, 13001]),
      shelf('smallTools', 9144, 2, 5, 3, 1, [20320, 20340]),
      shelf('largeTools', 9141, 6, 5, 3, 1, [20330, 20350, 13001]),
      shelf('fuel', 9143, 10, 5, 2, 1, [...ofCat(CAT.FUEL), 2131, 11004], { name: { en: 'Fuel & Energy Drinks', zh: '燃料与能量饮料' } }),
      fixture('cart', 'cart', 451, 11, 8, 1, 1),
      fixture('toolbox', 'loot', 116, 1, 8, 1, 1, { loot: [[20004, 2], [20104, 1]], name: { en: 'Returned Toolbox', zh: '退货工具箱' } }),
      fixture('scrap', 'loot', 9146, 12, 8, 1, 1, { hidden: true, loot: [[20106, 2]], name: { en: 'Offcut Pile', zh: '边角料堆' } }),
    ],
    npcs: [{ id: 'hardwareOwner', x: 4, y: 8 }],
  },
  farmers: {
    floor: { w: 18, h: 13, door: [9, 12], windows: [[5, 0], [12, 0]] },
    ground: [8, 11],
    fixtures: [
      shelf('flowers', 830, 2, 2, 2, 1, seeds((c) => isFlowerSeed(c)), { name: { en: 'Flower & Ivy Seeds', zh: '花卉与爬山虎种子' } }),
      shelf('smallSeeds', 836, 5, 2, 2, 1, seeds((c, p) => !isFlowerSeed(c) && p.light > 0 && p.size === 1)),
      shelf('mediumSeeds', 847, 8, 2, 2, 1, seeds((c, p) => !isFlowerSeed(c) && p.light > 0 && p.size === 2)),
      shelf('largeSeeds', 846, 11, 2, 2, 1, seeds((c, p) => p.size >= 4)),
      shelf('mushrooms', 849, 14, 2, 2, 1, seeds((c, p) => p.light === 0)),
      shelf('fertilizer', 844, 2, 5, 2, 1, [...ofCat(CAT.FERTILIZER), 13001]),
      shelf('traps', 835, 5, 5, 2, 1, [25001, 25002, 25003, 25004]),
      shelf('planters', 831, 8, 5, 2, 1, wing('farmers'), { name: { en: 'Planters & Grow Boxes (delivered)', zh: '花盆与培育箱（送货上门）' } }),
      shelf('canned', 841, 11, 5, 2, 1, [2115, 2123, 2149, 2152, 2129, 2124]),
      shelf('vendSnacks', 857, 14, 5, 1, 1, [2130, 2142, 2131, 2133, 2143]),
      shelf('vendSundries', 856, 15, 5, 1, 1, [11009, 11010, 11011, 11012, 11013, 2508]),
      shelf('produce', 853, 3, 8, 3, 1, foods((c) => (c.sub === SUB.VEGETABLE && c.id >= 2503) || c.sub === SUB.MUSHROOM)),
      shelf('fruit', 840, 8, 8, 3, 1, [...foods((c) => c.sub === SUB.FRUIT && c.id >= 2500), 2125, 2127, 12002]),
      fixture('cart', 'cart', 315, 13, 10, 1, 1),
      fixture('sacks', 'loot', 122, 16, 10, 1, 1, { loot: [[15501, 3], [15024, 1]], name: { en: 'Torn Fertilizer Sacks', zh: '破了的肥料袋' } }),
      fixture('stall', 'loot', 851, 1, 10, 1, 1, { hidden: true, loot: [[15027, 2]], name: { en: 'Forgotten Seed Packets', zh: '被遗忘的种子包' } }),
    ],
    npcs: [{ id: 'seedVendor', x: 12, y: 8 }],
  },
  renovation: {
    floor: {
      w: 20,
      h: 14,
      door: [10, 13],
      windows: [[4, 0], [10, 0], [16, 0]],
      rooms: [
        { id: 'living', x: 1, y: 1, w: 6, h: 5, label: { en: 'Living', zh: '起居' } },
        { id: 'kitchenBath', x: 7, y: 1, w: 6, h: 5, label: { en: 'Kitchen & Bath', zh: '厨卫' } },
        { id: 'appliances', x: 13, y: 1, w: 6, h: 5, label: { en: 'Appliances', zh: '电器' } },
        { id: 'decor', x: 1, y: 7, w: 6, h: 5, label: { en: 'Decor', zh: '装饰' } },
        { id: 'security', x: 13, y: 7, w: 6, h: 5, label: { en: 'Structural Security', zh: '结构安防' } },
      ],
    },
    ground: [9, 12],
    fixtures: [
      shelf('living', 804, 2, 2, 2, 1, wing('living'), { name: { en: 'Living Wing', zh: '起居展区' } }),
      shelf('kitchenBath', 806, 8, 2, 2, 1, wing('kitchenBath'), { name: { en: 'Kitchen & Bath Wing', zh: '厨卫展区' } }),
      shelf('appliances', 814, 14, 2, 2, 1, wing('appliances'), { name: { en: 'Appliances Wing', zh: '电器展区' } }),
      shelf('decor', 815, 2, 8, 2, 1, wing('decor'), { name: { en: 'Decor Wing', zh: '装饰展区' } }),
      shelf('security', 9142, 14, 8, 2, 1, wing('security'), { name: { en: 'Structural Security Wing', zh: '结构安防展区' } }),
      fixture('sofa', 'trial', 812, 2, 4, 2, 1, { trial: 1714, min: 30, gain: { sta: 8 }, loot: [[20005, 2], [20001, 2]] }),
      fixture('toilet', 'trial', 805, 11, 2, 1, 1, { trial: 1711, min: 10, gain: { mor: 1 } }),
      fixture('stove', 'trial', 50003, 8, 4, 1, 1, { trial: 1710, min: 10, gain: { mor: 2 } }),
      fixture('computer', 'trial', 809, 17, 2, 1, 1, { trial: 1713, min: 15, gain: { mor: 2 }, loot: [[20210, 1], [20104, 1]] }),
      fixture('laptop', 'trial', 807, 17, 4, 1, 1, { trial: 1712, min: 15, gain: { mor: 3 } }),
      fixture('painting', 'trial', 816, 2, 10, 1, 1, { trial: 1715, min: 10, gain: { mor: 2 } }),
      fixture('ornament', 'trial', 819, 4, 10, 1, 1, { trial: 1716, min: 10, gain: { mor: 2 } }),
      fixture('dartboard', 'trial', 821, 5, 8, 1, 1, { trial: 1717, min: 15, gain: { mor: 3 }, cost: { sta: 2 } }),
      fixture('returns', 'returns', 21005, 8, 9, 2, 1, { name: { en: 'Returns & Service Desk', zh: '退货与服务台' } }),
      fixture('cart', 'cart', 452, 7, 11, 1, 1),
    ],
    npcs: [
      { id: 'furnitureBuyer', x: 12, y: 11 },
      { id: 'salesRep', x: 10, y: 7 },
    ],
  },
  carlot: {
    floor: { w: 18, h: 12, door: [9, 11], windows: [[5, 0], [12, 0]] },
    ground: [8, 10],
    fixtures: [
      fixture('sedan', 'car', 42039, 2, 2, 3, 2, { car: 'sedan' }),
      fixture('suv', 'car', 42033, 7, 2, 3, 2, { car: 'suv' }),
      fixture('forklift', 'decor', 42032, 13, 2, 2, 2, { say: { en: '"The forklift? Not for sale, pal."', zh: '“叉车？那个不卖。”' } }),
      shelf('motorcycle', 9307, 16, 2, 1, 2, [14083], { name: { en: 'Heavy Motorcycle (delivered)', zh: '重装摩托（送货上门）' } }),
      shelf('autoParts', 42042, 2, 6, 2, 1, [20210, 20104, 20361, 20362, 20214]),
      shelf('tools', 42050, 5, 6, 2, 1, [20330, 20350, 20320]),
      shelf('parts', 42040, 2, 8, 2, 1, [20004, 20360, 20003]),
      shelf('hotFood', 42044, 11, 6, 2, 1, [2510, 2511, 2512]),
      shelf('instant', 42045, 14, 6, 2, 1, [2105, 2106, 2107, 2161]),
      shelf('liquor', 42047, 16, 6, 1, 1, [2137, 2158, 2156]),
      shelf('snacks', 42046, 11, 8, 2, 1, [2132, 2133, 2135, 2141, 2143]),
      shelf('roadTrip', 42049, 14, 8, 2, 1, [2130, 2131, 2142, 2136, 2509, 2508, 8001, 40000]),
      fixture('cart', 'cart', 315, 12, 10, 1, 1),
      fixture('scrapParts', 'loot', 42015, 1, 10, 1, 1, { loot: [[20210, 1]], name: { en: 'Scrapped Engine Parts', zh: '报废的发动机零件' } }),
      fixture('jerrycan', 'loot', 42018, 7, 8, 1, 1, { loot: [[40000, 1]], name: { en: 'Half-Full Jerry Can', zh: '半桶柴油' } }),
      fixture('glovebox', 'loot', 42041, 16, 10, 1, 1, { hidden: true, loot: [[20214, 1]], name: { en: 'Glovebox of a Wreck', zh: '报废车的手套箱' } }),
    ],
    npcs: [{ id: 'carDealer', x: 6, y: 4 }],
  },
  blackmarket: {
    floor: { w: 10, h: 8, door: [5, 7] },
    ground: [4, 6],
    fixtures: [
      fixture('blood', 'blood', 80010, 2, 2, 2, 1, { name: { en: 'Blood Donation Station', zh: '献血台' } }),
      shelf('smuggled', 42047, 6, 2, 2, 1, [2401, 2405, 2403, 2410, 20311], { priceMult: 1.3, noBulk: true, name: { en: 'Under-the-Counter Goods', zh: '柜台下的货' } }),
    ],
    npcs: [{ id: 'bloodBroker', x: 4, y: 4 }],
  },
};

for (const shop of Object.values(SHOPS)) shop.entrance = [shop.floor.door[0], shop.floor.h - 2];

// ------------------------------------------------------------------------------ vehicles
export const CARS = {
  sedan: { id: 'sedan', name: { en: 'Compact Car', zh: '小汽车' }, price: 500, trunk: [12, 8] },
  suv: { id: 'suv', name: { en: 'SUV', zh: 'SUV' }, price: 800, trunk: [14, 10] },
};

// ------------------------------------------------------------------------------ buying rules
export const BULK_DISCOUNT = 0.1; // bulk packages; the Bulk Bargains ability adds 8% per level
export const BULK_DISCOUNT_CAP = 0.6;

export function bulkSize(unitPrice) {
  if (unitPrice <= 10) return 10;
  if (unitPrice <= 50) return 5;
  return 0;
}

// Units on the shelf at the first visit, by unit price.
export function stockRange(unitPrice) {
  if (unitPrice <= 10) return [12, 24];
  if (unitPrice <= 30) return [8, 14];
  if (unitPrice <= 60) return [5, 10];
  if (unitPrice <= 120) return [2, 5];
  if (unitPrice <= 250) return [1, 3];
  return [1, 2];
}
export const RESTOCK_FRACTION = 0.5; // shelves refill to at least half on every later visit
export const PACKAGE_STOCK = 2;

// Doomsday rush at the Discount Supermarket (patch 07-11: 30 in-game minutes, blocked with < 30 min left).
export const RUSH = {
  shop: 'market',
  minutes: 30,
  price: 60,
  count: 10,
  pool: [2101, 2102, 2103, 2105, 2106, 2107, 2108, 2114, 2114, 2115, 2123, 2130, 2133, 2149, 2155],
};

// Riots in the final hours (dev log 06-03 "five-finger discounts", guide G3): free goods on the floor.
export const RIOT_HOURS = 3;
export const RIOT_LOOT = {
  market: {
    spots: [[5, 4], [9, 4], [3, 7], [8, 7], [12, 7], [9, 9]],
    pool: [[2101, 1], [2128, 1], [2111, 1], [2137, 1], [2115, 2], [2107, 2], [2161, 1], [2160, 1]],
  },
  renovation: {
    spots: [[5, 3], [11, 4], [15, 4], [4, 7], [16, 10], [12, 9]],
    pool: [[14039, 1], [14040, 1], [14013, 1], [14056, 1], [14058, 1], [14065, 1], [14019, 1], [14018, 1]],
  },
  farmers: {
    spots: [[4, 4], [10, 4], [7, 7], [14, 7], [6, 10], [11, 10]],
    pool: [[15026, 3], [15027, 3], [15020, 2], [15503, 3], [2535, 1], [2539, 1], [12002, 1]],
  },
};

export const BLOOD_PRICE = 150;
export const ANEMIA_HOURS = 72;

// ------------------------------------------------------------------------------ shop NPCs
// first / again (same visit) / remember (a later visit after talking once, patch 08-21) lines.
// chat: pre-disaster chat records shown in the phone for people you met (patch 08-21).
export const SHOP_NPCS = {
  neighbor: {
    id: 'neighbor',
    shop: 'market',
    color: '#d98ca8',
    gift: 100,
    name: {
      wage: { en: 'Neighbor Girl', zh: '隔壁女孩' },
      student: { en: 'Neighbor Guy', zh: '隔壁大哥' },
      warehouse: { en: 'Auntie Wang', zh: '王阿姨' },
    },
    first: [
      { en: '"Oh, it\'s you! Stocking up too? They say it\'s just the flu, but everyone\'s buying rice like crazy."', zh: '“呀，是你！你也来囤货？都说只是流感，可大家都在疯抢大米。”' },
      { en: '"Here — you lent me money for the rent last month. Take it back, you look like you need it today."', zh: '“对了——上个月你借我交房租的钱，还你。你今天看起来挺需要的。”' },
    ],
    again: [{ en: '"Buy the rice, trust me. And lock your door tonight, okay?"', zh: '“听我的，多买点米。今晚记得锁好门，好吗？”' }],
    remember: [{ en: '"Back again? You look pale. Whatever you know… I\'ll keep my door locked too."', zh: '“又来啦？你脸色好差。不管你知道什么……我也会锁好门的。”' }],
    chat: [
      { en: 'Thanks for the vegetables tip! Are you home tonight?', zh: '谢谢你推荐的菜！你今晚在家吗？' },
      { me: true, en: 'Stay inside. Don\'t open the door for anyone.', zh: '待在家里，谁敲门都别开。' },
    ],
  },
  youngCustomer: {
    id: 'youngCustomer',
    shop: 'convenience',
    color: '#8fb4c9',
    name: { en: 'Young Customer', zh: '年轻顾客' },
    first: [
      { en: '"Twenty packs of noodles? You\'re preparing for the end of the world or something?"', zh: '“二十包泡面？你是在准备世界末日吗？”' },
      { en: '"…Wait, should I? My mom keeps saying it\'s nothing."', zh: '“……等等，我是不是也该买？我妈一直说没事的。”' },
    ],
    again: [{ en: '"I\'m still deciding between the ham sausages and the crackers."', zh: '“我还在火腿肠和饼干之间纠结。”' }],
    remember: [
      { en: '"It\'s you again! I bought extra water after we talked. Weird day, huh?"', zh: '“又是你！上次聊完我多买了水。今天怪怪的，对吧？”' },
      { en: '"Give me your number? If things get bad… maybe we can help each other."', zh: '“留个电话吧？万一情况变糟……也许能互相照应。”' },
    ],
    chat: [
      { en: 'Hi, it\'s the girl from the convenience store. You were right about the water.', zh: '你好，我是便利店那个女生。你说多买水是对的。' },
      { me: true, en: 'Keep your food hidden. Ration it.', zh: '把吃的藏好，省着点吃。' },
    ],
  },
  hardwareOwner: {
    id: 'hardwareOwner',
    shop: 'hardware',
    color: '#9c7b55',
    name: { en: 'Old Zhang (Hardware)', zh: '五金店老张' },
    first: [{ en: '"Sheet metal, glass, plastic — you can patch anything with those. The random packs are a steal."', zh: '“铁皮、玻璃、塑料——修什么都用得上。随机材料包最划算。”' }],
    again: [{ en: '"Diesel\'s in the back. Don\'t smoke near it."', zh: '“柴油在后面，别在旁边抽烟。”' }],
    remember: [{ en: '"You again? Building a bunker? Ha. Take a patch kit, doors don\'t fix themselves."', zh: '“又是你？在修地堡啊？哈。拿个修补包，门可不会自己修好。”' }],
    chat: [{ en: 'Zhang here. Shop\'s shuttered. If you need wire, I have some left.', zh: '我是老张。店关了。缺电线的话我这还有点。' }],
  },
  seedVendor: {
    id: 'seedVendor',
    shop: 'farmers',
    color: '#7cc47c',
    name: { en: 'Seed Vendor Auntie', zh: '卖种子的阿姨' },
    first: [{ en: '"Mushrooms grow in the dark, dear. Tomatoes and strawberries want sun. And don\'t forget fertilizer!"', zh: '“蘑菇黑着也能长，孩子。番茄草莓要晒太阳。别忘了买肥料！”' }],
    again: [{ en: '"A fertile pot doubles your harvest, you know."', zh: '“好花盆能让收成翻倍哦。”' }],
    remember: [{ en: '"Back for more seeds? Good. Growing things keeps the heart alive."', zh: '“又来买种子啦？好啊。种点东西，心里就有盼头。”' }],
    chat: [{ en: 'Did your tomatoes sprout? Mine did, even with the power out.', zh: '你的番茄发芽了吗？我的都发芽了，停电也没耽误。' }],
  },
  salesRep: {
    id: 'salesRep',
    shop: 'renovation',
    color: '#c9a36b',
    name: { en: 'Sales Rep', zh: '销售顾问' },
    first: [{ en: '"Everything is delivered to your doorstep within the hour. Returns are fine as long as the package is intact!"', zh: '“所有商品一小时内送到家门口。只要包裹完好都可以退货！”' }],
    again: [{ en: '"The titanium door is our best seller today. Funny, isn\'t it?"', zh: '“今天卖得最好的是钛合金大门。挺奇怪的，是吧？”' }],
    remember: [{ en: '"Welcome back! Another delivery? Our trucks are running non-stop today."', zh: '“欢迎回来！还要送货吗？今天我们的货车就没停过。”' }],
    chat: [{ en: 'Your order was the last one our driver delivered. Stay safe.', zh: '您的订单是我们司机送的最后一单。注意安全。' }],
  },
  furnitureBuyer: {
    id: 'furnitureBuyer',
    shop: 'renovation',
    color: '#b5443a',
    action: 'pawn',
    name: { en: 'Used-Furniture Buyer', zh: '收旧家具的阿姨' },
    first: [{ en: '"Old furniture? I pay cash, movers pick it up from your place. Keep your bed and toilet, though."', zh: '“旧家具？现金收，搬家师傅上门取。不过床和马桶你还是留着吧。”' }],
    again: [{ en: '"Anything else to sell?"', zh: '“还有别的要卖吗？”' }],
    remember: [{ en: '"You again! Emptying the whole flat? Cash is cash."', zh: '“又是你！要把家搬空啊？钱就是钱。”' }],
    chat: [{ en: 'The furniture you sold me is still in my truck. Nobody is buying anything now.', zh: '你卖给我的家具还在我车上。现在谁都不买东西了。' }],
  },
  carDealer: {
    id: 'carDealer',
    shop: 'carlot',
    color: '#6d7fa3',
    action: 'carShop',
    name: { en: 'Car Dealer', zh: '二手车商' },
    first: [{ en: '"The compact in the middle — five hundred, full tank, big trunk. Bring it back before tonight and I\'ll refund you, no questions."', zh: '“中间那台小轿车——五百，油加满，后备箱大。今晚前开回来全额退款，不问原因。”' }],
    again: [{ en: '"Trunk space doesn\'t weigh on your shoulders, friend."', zh: '“后备箱装的东西可不压你肩膀，朋友。”' }],
    remember: [{ en: '"Back again? Everyone wants a car today. Everyone wants to leave."', zh: '“又回来了？今天人人都想要车，人人都想走。”' }],
    chat: [{ en: 'Hope the car served you well. The lot is full of abandoned ones now.', zh: '希望那车帮上忙了。现在车场里全是被丢下的车。' }],
  },
  bloodBroker: {
    id: 'bloodBroker',
    shop: 'blackmarket',
    color: '#5a4a86',
    action: 'blackMarket',
    name: { en: 'Blood Broker', zh: '血头' },
    first: [{ en: '"One bag, one hundred fifty cash. You\'ll feel weak for a few days. Nobody here will remember your face."', zh: '“一袋，一百五现金。之后几天会有点虚。这里没人会记得你的脸。”' }],
    again: [{ en: '"Once is enough for today. Come back never."', zh: '“今天一次就够了。别再来了。”' }],
    remember: [{ en: '"You. Still breathing? Good for business."', zh: '“是你。还活着？那挺好。”' }],
    chat: [],
  },
};

// ------------------------------------------------------------------------------ story texts
export const NEWS = [
  { id: 'flu', hours: Infinity, text: { en: 'Morning news: hospitals report a spike in a "seasonal flu". Officials urge calm.', zh: '早间新闻：多家医院报告“季节性流感”病例激增，官方呼吁市民保持冷静。' } },
  { id: 'traffic', hours: 8, text: { en: 'Traffic jams around the hospitals. Ambulances everywhere.', zh: '医院周边交通大堵塞，到处都是救护车。' } },
  { id: 'biting', hours: 6, text: { en: 'Videos online show patients attacking nurses. The clips are deleted within minutes.', zh: '网上流传病人袭击护士的视频，几分钟内就被删除了。' } },
  { id: 'panic', hours: 4.5, text: { en: 'Panic buying: supermarket shelves are emptying across the city.', zh: '全城出现抢购潮，超市货架正在被清空。' } },
  {
    id: 'riot',
    hours: RIOT_HOURS,
    text: {
      en: "BREAKING: People are going mad in the streets! Riots and looting at the Discount Supermarket, the Renovation Company and the Farmers' Market.",
      zh: '突发：街上的人开始发疯了！特价超市、装修公司和农贸市场出现暴乱和哄抢。',
    },
  },
  { id: 'curfew', hours: 1, text: { en: 'Emergency broadcast: stay indoors and lock your doors. This is not a drill.', zh: '紧急广播：请留在室内，锁好门窗。这不是演习。' } },
  { id: 'sirens', hours: 0.25, text: { en: 'The sirens start. Get home. Now.', zh: '警报响起。快回家，马上。' } },
];

export const PROLOGUE = [
  { en: 'The last thing you remember is the front door giving way. Weeks of hunger and cold, the hordes scratching at the walls — and then darkness.', zh: '你记得的最后一幕，是大门被撞开。几个星期的饥饿与寒冷，尸潮在墙外抓挠——然后是一片黑暗。' },
  { en: 'You open your eyes to morning light. Your phone says 08:00. The news is talking about a "seasonal flu".', zh: '再睁开眼时，窗外是早晨的阳光。手机显示08:00，新闻里正在播报一场“季节性流感”。' },
  { en: 'It is the day of the outbreak, ten hours before everything falls apart. This time you remember. This time you will be ready.', zh: '这是灾变当天，距离一切崩塌还有十个小时。这一次，你记得一切。这一次，你会做好准备。' },
];

export const PROLOGUE_TIPS = [
  { en: 'Press M for the city map. Travelling takes time: about an hour on foot, 35 minutes by car.', zh: '按 M 打开城市地图。出行要花时间：步行约一小时，开车约35分钟。' },
  { en: 'Grab your wallet and check your phone for a loan before you head out.', zh: '出门前记得拿钱包，再用手机借一笔贷款。' },
  { en: 'Furniture from the Renovation Company is delivered to your doorstep. Install it in Planning Mode (N).', zh: '装修公司买的家具会送到家门口，在规划模式（N）里安装。' },
  { en: 'Check the Stockpile Checklist for what you are missing. Be home before the sirens.', zh: '用囤货清单看看还缺什么。警报响起前一定要回家。' },
];

// ------------------------------------------------------------------------------ Stockpile Checklist
// 7 categories × 18 dimensions (dev log 06-03). measure 'sat' sums satiety (× servings), 'count' sums
// units; matchFurn also counts matching furniture installed at home or waiting as packages.
// need: [adequate, plentiful] thresholds.
const ids = (list) => (c) => list.includes(c.id);
const FIRST_AID = [2400, 2401, 2509, 11008];
const SPRAYS = [2164, 2165, 2166];
const HYGIENE = [11009, 11010, 11011, 11012, 11013];
const CAFFEINE = [2131, 2136, 2526, 11004];
const REPAIR_KITS = [20300, 20301, 20310, 20311];
const BASIC_MATS = [20001, 20002, 20003, 20004, 20005];
const POWER_GEAR = [ELEC.SOLAR, ELEC.FUEL_GEN, ELEC.MANUAL_GEN, ELEC.BATTERY, ELEC.RAT_GEN];
const isFood = (subs) => (c) => c.cat === CAT.FOOD && subs.includes(c.sub);

export const CHECKLIST = [
  {
    id: 'food',
    name: { en: 'Food', zh: '食物' },
    dims: [
      { id: 'staples', name: { en: 'Staples', zh: '主食' }, measure: 'sat', match: isFood([SUB.STAPLE]), need: [250, 750] },
      { id: 'protein', name: { en: 'Meat, fish & eggs', zh: '肉蛋水产' }, measure: 'sat', match: isFood([SUB.MEAT, SUB.CUSTARD, SUB.FISH]), need: [150, 450] },
      { id: 'produce', name: { en: 'Fruit, vegetables & mushrooms', zh: '果蔬菌菇' }, measure: 'sat', match: isFood([SUB.VEGETABLE, SUB.FRUIT, SUB.MUSHROOM]), need: [60, 180] },
      { id: 'longLife', name: { en: 'Long-life food (90+ days)', zh: '耐储食物（90天以上）' }, measure: 'sat', match: (c) => c.cat === CAT.FOOD && c.life >= 90, need: [300, 900] },
    ],
  },
  {
    id: 'drinks',
    name: { en: 'Drinks', zh: '饮品' },
    dims: [
      { id: 'drinks', name: { en: 'Drinks & alcohol', zh: '饮料与酒' }, measure: 'count', match: isFood([SUB.SOFT_DRINK, SUB.LIQUOR]), need: [6, 15] },
      { id: 'caffeine', name: { en: 'Coffee & energy drinks', zh: '咖啡与能量饮料' }, measure: 'count', match: ids(CAFFEINE), need: [3, 8] },
    ],
  },
  {
    id: 'medical',
    name: { en: 'Medicine & Hygiene', zh: '医疗卫生' },
    dims: [
      { id: 'firstAid', name: { en: 'First aid', zh: '急救用品' }, measure: 'count', match: ids(FIRST_AID), need: [3, 8] },
      { id: 'medicine', name: { en: 'Medicine', zh: '药品' }, measure: 'count', match: (c) => c.cat === CAT.MEDICINE && !FIRST_AID.includes(c.id) && !SPRAYS.includes(c.id) && c.id !== 11004, need: [3, 8] },
      { id: 'hygiene', name: { en: 'Disinfectant & toiletries', zh: '消毒与洗漱' }, measure: 'count', match: ids([...SPRAYS, ...HYGIENE]), need: [3, 8] },
    ],
  },
  {
    id: 'power',
    name: { en: 'Fuel & Power', zh: '燃料电力' },
    dims: [
      { id: 'cookingFuel', name: { en: 'Cooking fuel', zh: '烹饪燃料' }, measure: 'count', match: (c) => c.cat === CAT.FUEL && c.id !== 40000, need: [4, 12] },
      { id: 'diesel', name: { en: 'Generator diesel', zh: '发电柴油' }, measure: 'count', match: ids([40000]), need: [3, 10] },
      { id: 'powerGear', name: { en: 'Generators & batteries', zh: '发电与储电设备' }, measure: 'count', matchFurn: (f) => POWER_GEAR.includes(f.elec), need: [1, 3] },
    ],
  },
  {
    id: 'materials',
    name: { en: 'Materials', zh: '材料' },
    dims: [
      { id: 'basicMats', name: { en: 'Basic materials', zh: '基础材料' }, measure: 'count', match: ids(BASIC_MATS), need: [15, 40] },
      { id: 'advancedMats', name: { en: 'Advanced materials & packs', zh: '高级材料与材料包' }, measure: 'count', match: (c) => (c.cat === CAT.MATERIAL && c.price > 1 && !BASIC_MATS.includes(c.id) && !REPAIR_KITS.includes(c.id)) || c.cat === CAT.PACK, need: [5, 15] },
    ],
  },
  {
    id: 'defense',
    name: { en: 'Defense', zh: '防御' },
    dims: [
      { id: 'repairKits', name: { en: 'Patch kits & reinforcements', zh: '修补包与加固件' }, measure: 'count', match: ids(REPAIR_KITS), need: [2, 6] },
      { id: 'doorsWindows', name: { en: 'Upgraded doors & windows', zh: '升级的门窗' }, measure: 'count', matchFurn: (f) => (f.slot === SLOT.DOOR || f.slot === SLOT.WINDOW) && ![211, 368, 212].includes(f.id), need: [1, 3] },
    ],
  },
  {
    id: 'life',
    name: { en: 'Comfort & Farming', zh: '生活与种植' },
    dims: [
      {
        id: 'morale',
        name: { en: 'Books, games & treats', zh: '书籍、娱乐与零嘴' },
        measure: 'count',
        match: (c) => c.cat === CAT.BOOK || c.cat === CAT.CONSOLE || (c.cat === CAT.DAILY && !HYGIENE.includes(c.id)) || isFood([SUB.SNACK, SUB.LIQUOR])(c),
        need: [6, 15],
      },
      { id: 'farming', name: { en: 'Seeds & planters', zh: '种子与花盆' }, measure: 'count', match: (c) => c.cat === CAT.SEED, matchFurn: (f) => f.plant > 0, need: [6, 18] },
    ],
  },
];
