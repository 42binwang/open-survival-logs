// @ts-check
// What the style tile shows (docs/UI.md §7): Day 7 in the Wage Slave's living room, the survivor over their carry
// limit after buying two items, with the fridge open next to the backpack and the grocery shop beside them. Item
// facts (names, weights, prices, footprints, servings, shelf life) come from the game config; the copy here is only
// the tile's own text. Where the source shows an English name, the tile uses it (SOURCE_NAMES).

/** @typedef {'en' | 'zh'} Lang */
/** @typedef {{ en: string, zh: string }} Text */

/**
 * English names the source prints that differ from our config translation (docs/UI.md §3.5 lists every mismatch).
 * @type {Readonly<Record<number, string>>}
 */
export const SOURCE_NAMES = Object.freeze({
  2105: 'Beef Noodles',
});

/**
 * Renders that lie across their footprint, with the clockwise quarter turn that stands them up (SlotIcon.turn). The
 * 2142 bottle is framed wide for a 1 × 2 cell, cap down-right; -90 puts the cap up, as the source stands its bottles.
 * Keyed by icon asset id until the icon manifest carries the turn (docs/UI.md §5.5).
 * @type {Readonly<Record<string, -90 | 90>>}
 */
export const ART_TURN = Object.freeze({
  'icons/2142': -90,
});

/** @type {Readonly<Record<string, Text>>} */
export const T = Object.freeze({
  pageTitle: { en: 'Survival Log — UI style tile', zh: '生存日志 — UI 风格样张' },
  day: { en: 'DAY7', zh: '第7天' },
  loop: { en: 'Loop: 1', zh: '周目：1' },
  sunny: { en: 'Sunny', zh: '晴' },
  log: { en: 'Log', zh: '日志' },
  tactics: { en: 'Tactics', zh: '战术' },
  track: { en: 'Track', zh: '追踪' },
  layout: { en: 'Layout', zh: '布局' },
  floor2: { en: '2F', zh: '2F' },
  floorHome: { en: 'Home', zh: '家园' },
  floorB1: { en: 'B1', zh: 'B1' },
  gridPower: { en: 'Grid Power', zh: '电网供电' },
  room: { en: 'Living Room', zh: '客厅' },
  roomTemp: { en: 'Normal', zh: '适中' },
  satiety: { en: 'Satiety', zh: '饱腹' },
  morale: { en: 'Morale', zh: '心态' },
  stamina: { en: 'Stamina', zh: '精力' },
  life: { en: 'Life', zh: '生命' },
  encumbered: { en: 'Encumbered', zh: '超重' },
  main: { en: 'Main', zh: '主线' },
  mainQuest: { en: 'Rescue the Neighbor Girl', zh: '营救邻居女孩' },
  event: { en: 'Event', zh: '事件' },
  event1: { en: 'Obtain Paper Airplane (0/1)', zh: '获得纸飞机（0/1）' },
  event2: { en: 'Send food to the girl', zh: '给女孩送去食物' },
  questCard: { en: 'Rescue • What She Wants Most', zh: '营救 · 她最想要的东西' },
  food: { en: 'Food', zh: '食物' },
  sundries: { en: 'Sundries', zh: '杂物' },
  questProg: { en: '0/500 · Can last 20 more days', zh: '0/500 · 还能坚持20天' },
  backpackBtn: { en: 'Backpack (I)', zh: '背包（I）' },
  phoneBtn: { en: 'Phone', zh: '手机' },
  cookAction: { en: 'Cook', zh: '烹饪' },
  music: { en: 'Listen to Music', zh: '听音乐' },
  relax: { en: 'Relax', zh: '放松' },
  eat: { en: 'Eat {name}', zh: '吃{name}' },
  queueBack: { en: 'Previous actions', zh: '上一页' },
  queue: { en: 'Action queue', zh: '行动队列' },
  speedPlay: { en: 'Normal speed', zh: '正常速度' },
  speedFast: { en: 'Fast', zh: '加速' },
  speedFaster: { en: 'Fastest', zh: '最快' },
  speedPause: { en: 'Pause', zh: '暂停' },
  wish: { en: '[Wish]', zh: '【心愿】' },
  pickOne: { en: 'Pick One', zh: '任选其一' },
  wishItems: { en: 'Duck Wrap / Marshmallows / Cola', zh: '北京烤鸭卷 / 棉花糖 / 可乐' },
  alert: { en: 'Event', zh: '事件' },
  inventory: { en: 'Inventory', zh: '物品' },
  backpack: { en: 'Your Backpack', zh: '你的背包' },
  load: { en: 'Load', zh: '负重' },
  fridge: { en: 'Fridge', zh: '冰箱' },
  space: { en: 'Space', zh: '空间' },
  invTip: { en: 'Tip: Drag items between grids · R rotates while dragging', zh: '提示：在格子间拖动物品 · 拖动时按 R 旋转' },
  close: { en: 'Close', zh: '关闭' },
  groceries: { en: 'Groceries', zh: '杂货' },
  remaining: { en: 'Remaining', zh: '剩余' },
  soldOut: { en: 'Sold out', zh: '已售罄' },
  buy: { en: 'Buy', zh: '购买' },
  mustBuy: { en: 'Must Buy', zh: '必买' },
  cash: { en: 'CASH:', zh: '现金：' },
  items: { en: '{n} item(s)', zh: '{n} 件商品' },
  checkout: { en: 'Checkout', zh: '结账' },
  gotItem: { en: 'Beef Noodles', zh: '红烧牛肉面' },
  overLimit: { en: 'Over your carry limit: you walk slower', zh: '超出负重上限：移动变慢' },
  satietyShort: { en: 'Satiety', zh: '饱腹' },
  moraleShort: { en: 'Morale', zh: '心态' },
  lifeShort: { en: 'Life', zh: '生命' },
  shelfLife: { en: 'Shelf life', zh: '保质期' },
  days: { en: '{a} / {b} days', zh: '{a} / {b} 天' },
  chilled: { en: 'Chilled: spoils slower', zh: '冷藏中：变质变慢' },
  expired: { en: 'Expired', zh: '已过期' },
  expiring: { en: 'Expiring soon', zh: '即将过期' },
  meatDish: { en: 'Meat · Cooked dish', zh: '肉类 · 料理' },
  dishDesc: {
    en: 'Thick slices of luncheon meat fried until the edges crisp, with a runny-yolk egg.',
    zh: '午餐肉切厚片煎出焦边，配个溏心蛋',
  },
});

/**
 * @param {string} key
 * @param {Lang} lang
 * @param {Record<string, string | number>} [vars]
 */
export function t(key, lang, vars) {
  const entry = T[key];
  if (!entry) throw new Error(`no tile text '${key}'`);
  let s = entry[lang];
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
  return s;
}

/**
 * @typedef {object} Placed
 * @property {number} id  config item id
 * @property {number} x
 * @property {number} y
 * @property {boolean} [rotated]
 * @property {number} [usesLeft]  servings left, for items with more than one
 * @property {number} [age]  days since it was made or bought (freshness = life − age)
 * @property {'chilled'} [status]
 * @property {string[]} [states]
 * @property {boolean} [tip]  the item the tooltip describes
 */

/** The backpack: 8 × 7 cells, as the source's (ss_01, ss_07, t043). The two pending items are the unpaid purchase. */
export const BACKPACK = Object.freeze({
  cols: 8,
  rows: 7,
  maxKg: 8,
  /** @type {Placed[]} */
  items: [
    { id: 2105, x: 0, y: 0, age: 2, states: ['is-pending'] },
    { id: 2142, x: 2, y: 0, age: 0, states: ['is-pending'] },
    { id: 3022, x: 3, y: 0, usesLeft: 2 },
    { id: 2115, x: 4, y: 0, age: 4 },
    { id: 15026, x: 6, y: 0 },
    { id: 15026, x: 7, y: 0 },
    { id: 2115, x: 4, y: 1, age: 4 },
    { id: 25001, x: 6, y: 1 },
    { id: 20106, x: 7, y: 1, rotated: true },
    { id: 2400, x: 0, y: 2, age: 3 },
    { id: 20106, x: 3, y: 2 },
    { id: 2400, x: 5, y: 2, age: 3 },
    { id: 2103, x: 0, y: 3, age: 10, usesLeft: 7 },
  ],
});

/** The fridge next to it: a cold container (blue empty cells, chilled status). */
export const FRIDGE = Object.freeze({
  cols: 5,
  rows: 7,
  /** @type {Placed[]} */
  items: [
    { id: 13540, x: 0, y: 0, age: 0.6, status: 'chilled' },
    { id: 2142, x: 2, y: 0, age: 5, status: 'chilled' },
    { id: 2502, x: 3, y: 0, age: 4, status: 'chilled' },
    { id: 2502, x: 3, y: 1, age: 1, status: 'chilled' },
    { id: 13541, x: 0, y: 3, age: 1.1, status: 'chilled', states: ['is-hover'], tip: true },
    { id: 13543, x: 2, y: 3, age: 2.4 },
  ],
});

/**
 * @typedef {object} ShopRow
 * @property {number} id
 * @property {number} remaining
 * @property {boolean} [must]
 * @property {boolean} [hover]
 */

/** @type {ShopRow[]} */
export const SHOP = [
  { id: 2105, remaining: 2, hover: true },
  { id: 2103, remaining: 1, must: true },
  { id: 2142, remaining: 4 },
  { id: 2502, remaining: 0 },
];

export const CASH = 808;

/** The four stats of ss_02 (`mod` picks the stat's icon colour, `tone` its fill). */
export const STATS = Object.freeze([
  { key: 'satiety', mod: 'sat', glyph: 'satiety', value: 55, max: 100, tone: 'good' },
  { key: 'morale', mod: 'mor', glyph: 'morale', value: 54, max: 102, tone: 'good' },
  { key: 'stamina', mod: 'sta', glyph: 'bolt', value: 46, max: 100, tone: 'warn' },
  { key: 'life', mod: 'life', glyph: 'life', value: 91, max: 102, tone: 'good' },
]);

export const CLOCK = Object.freeze({ h: 11, m: 50 });
