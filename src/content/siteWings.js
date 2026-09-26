// @ts-check
// The rest of each exploration site's own scene: every Config_Furniture piece of a site's scene that its hand-drawn
// map (src/content/sites.js) does not place stands in a wing built onto the east side of that map. The pieces are
// matched to a site by their config model and name, as src/content/homes.js matches the home scenes:
// - the Ruined Supermarket: the post-outbreak shelves (882–914, P_NEWMaket01_after* and the hospital block's copies
//   66130/66180), the second overturned truck (883, story 1721) and chest freezer (909, story 1624), the junk and
//   stock piles drawn with supermarket models (67006, 67100) and its windows (880, 881);
// - the Abandoned Hospital: the rest of the hospital block (66xxx) drawn with the hospital set (TanSuo_Hospital*),
//   medical devices, pharmacy cabinets (P_Cabinet_033), supply crates (P_Container_00102), blood bags and lab
//   glassware, its utility props (the school-model cleaning piles and buckets, sweepers) and the three electrical
//   boxes 66071–66073; the sealed pharmacy cabinet 66163 and the medical fridge 66172;
// - the Abandoned School: the school block (67xxx) drawn with the school set (Explore_School_*), student lockers
//   (P_Cabinet_034), blackboards, the canteen kitchen, the washrooms, the gym shelter and the second safe (67182);
// - the Office Ruins: the office props of both blocks — dead monitors, printers, computers and server cabinets,
//   filing and metal cabinets, paper boxes (P_Paperbox_006), ATMs, the 67xxx storage cabinets (P_Cabinet_019/022),
//   the electrical box 67002 and the safe 67172;
// - the Nearby Streets: the street props of the hospital block (tents, backpacks, glove boxes, the ammo box, oil
//   drums, the warning sign and air pump) and the second abandoned sedan (67082);
// - the Hardware Store: the tool cabinets, shelving and crates of the hospital block (66047, 66064, 66065, 66074,
//   66156, 66168).
// What a piece is at the site follows its config functions (Config_FurnitureFunc, src/content/funcSpecs.js): a loot
// container (search; 撬开 / 解锁 lock it against a crowbar / a lockpick), a loose find picked up in a moment (拾取), an
// obstacle (搬走 / 拆卸), scrap to take apart (回收, its RemoveGet materials) or, with no function, a prop that only
// stands there. Loot tables and footprints follow the piece's name. The wing's rooms are strips the height of the
// map: a walkway down the west side, bands of two rows of pieces between walkways; doorways in the old east wall and
// between the strips. No zombie spawns in a wing: the dead that walk in come from the old map.
import { furn } from '../data/db.js';
import { FUNC_SPECS } from './funcSpecs.js';

/**
 * @typedef {{ en: string, zh: string }} Label
 * @typedef {{ id: string, label?: Label, ids: number[] }} WingRoom
 * @typedef {{ doors: number[], ground?: string, road?: number[], fallback: string, rooms: WingRoom[] }} Wing
 * @typedef {{ kind: string, cfg: number, w: number, h: number, loot?: string, rolls?: number, lock?: string, x?: number, y?: number, id?: string, letter?: string, wing?: boolean }} FixtureSpec
 */

/** @type {Record<string, Wing>} */
export const WINGS = {
  streets: {
    doors: [6, 7, 8, 9, 10, 11, 12],
    ground: ':',
    road: [6, 7, 8, 9],
    fallback: 'bag',
    rooms: [
      { id: 'lot', ids: [67082, 66068, 66077, 66078, 66104, 66086, 66094, 66079, 66106, 66105, 66103, 66085, 66076, 66093, 67200, 67095, 66082, 66069] },
    ],
  },
  hardware: {
    doors: [8],
    fallback: 'materials',
    rooms: [{ id: 'store-yard', label: { en: 'Back Store', zh: '后仓' }, ids: [66047, 66064, 66065, 66074, 66156, 66168] }],
  },
  supermarket: {
    doors: [8, 13],
    fallback: 'grocery',
    rooms: [
      {
        id: 'stock-backaisles',
        label: { en: 'Back Aisles', zh: '后排货架' },
        ids: [885, 886, 887, 889, 890, 891, 892, 893, 894, 895, 898, 899, 900, 902, 903, 904, 905, 906, 907, 66130, 66180],
      },
      { id: 'dock-receiving', label: { en: 'Receiving Bay', zh: '收货区' }, ids: [883, 909, 67006, 67100, 880, 881] },
    ],
  },
  school: {
    doors: [7, 16],
    fallback: 'stockroom',
    rooms: [
      {
        id: 'hall-lockers',
        label: { en: 'Locker Hall', zh: '储物柜走廊' },
        ids: [67032, 67050, 67062, 67048, 67033, 67034, 67037, 67080, 67086, 67115, 67116, 67117, 67118, 67120, 67121, 67132, 67133, 67134, 67135, 67184, 67079, 67091, 67137, 67089, 67101, 67182, 67119],
      },
      {
        id: 'classC',
        label: { en: 'Classroom 2-A', zh: '二年级A班' },
        ids: [67124, 67140, 67125, 67022, 67012, 67013, 67016, 67064, 67065, 67067, 67011, 67039, 67047, 67073, 67017, 67015, 67043, 67142, 67183, 67201, 67126, 67196, 67197],
      },
      {
        id: 'class-library',
        label: { en: 'Library & Classroom 2-B', zh: '图书室与二年级B班' },
        ids: [67141, 67169, 67192, 67054, 67055, 67156, 67163, 67176, 67177, 67014, 67052, 67066, 67051, 67127, 67130, 67131, 67164, 67174, 67178, 67180, 67181, 67193],
      },
      {
        id: 'kitchen-school',
        label: { en: 'School Kitchen', zh: '学校厨房' },
        ids: [67154, 67146, 67147, 67149, 67087, 67085, 67150, 67151, 67153, 67202, 67028, 67143, 67144, 67145, 67129, 67068, 67071, 67072, 67076],
      },
      {
        id: 'bath-washroom',
        label: { en: 'Washrooms', zh: '洗手间' },
        ids: [67104, 67105, 67106, 67110, 67112, 67107, 67108, 67114, 67109, 67007, 67008, 67103, 67102, 67113],
      },
      {
        id: 'storeroom-gym',
        label: { en: 'Gym Storeroom', zh: '体育器材室' },
        ids: [67093, 67096, 67097, 67189, 67190, 67094, 67098, 67191, 67046, 67203, 67019, 67041, 67070, 67026, 67027, 67056, 67009, 67029, 67035, 67057, 67042, 67077, 67078, 67081, 67092, 67023, 67061, 67090, 67099, 67111, 67021, 67036, 67058, 67059],
      },
    ],
  },
  hospital: {
    doors: [7, 15],
    fallback: 'stockroom',
    rooms: [
      {
        id: 'bath-ward',
        label: { en: 'Inpatient Ward', zh: '住院病房' },
        ids: [66024, 66019, 66021, 66025, 66028, 66167, 66029, 66145, 66185, 66177, 66005, 66151, 66080, 66095, 66096, 66111, 66115, 66116, 66119, 66120, 66131, 66140, 66148, 66155, 66173, 66176, 66181, 66137, 66169, 66178, 66090, 66089],
      },
      {
        id: 'bath-dispensary',
        label: { en: 'Dispensary', zh: '药剂科' },
        ids: [66163, 66172, 66189, 66190, 66014, 66060, 66124, 66128, 66132, 66138, 66147, 66149, 66159, 66098, 66143, 66179, 66183, 66186, 66123, 66010, 66117, 66118],
      },
      {
        id: 'store-supply',
        label: { en: 'Central Supply', zh: '中心库房' },
        ids: [66051, 66038, 66042, 66032, 66017, 66166, 66036, 66040, 66041, 66043, 66044, 66045, 66046, 66134, 66033, 66037, 66003, 66084, 66050, 66182],
      },
      {
        id: 'kitchen-hospital',
        label: { en: 'Hospital Kitchen', zh: '医院厨房' },
        ids: [66008, 66018, 66052, 66053, 66054, 66194, 66195, 66102, 66121, 66135, 66002, 66004, 66101, 66157, 66099, 66129],
      },
      { id: 'electrical-plant', label: { en: 'Plant Room', zh: '设备间' }, ids: [66071, 66072, 66073] },
    ],
  },
  office: {
    doors: [9, 15],
    fallback: 'office',
    rooms: [
      {
        id: 'server-it',
        label: { en: 'IT Storage', zh: '设备库' },
        ids: [67002, 66006, 66125, 66142, 66191, 66087, 66088, 66153, 66160, 66187, 66158, 66174, 67185, 66146, 66112, 66056],
      },
      {
        id: 'records-room',
        label: { en: 'Records Store', zh: '资料库' },
        ids: [66141, 66164, 66091, 66092, 67159, 67161, 67166, 67167, 67170, 67173, 67179, 67168, 67175, 66057, 66066, 66165, 66170, 66175, 66193, 66184, 67157],
      },
      {
        id: 'lobby-bank',
        label: { en: 'Bank Branch', zh: '银行网点' },
        ids: [66108, 66127, 66139, 67172, 66171, 66058, 66152, 66107, 67198, 67165, 67186, 67188],
      },
    ],
  },
};

// Loot tables (sites.js LOOT_TABLES) by the piece's name; the first match wins, else the wing's fallback.
/** @type {[RegExp, string][]} */
const LOOT_BY_NAME = [
  [/货车/, 'truck'],
  [/医用冷藏柜/, 'medFridge'],
  [/冰柜/, 'freezer'],
  [/冷饮柜|冰箱|保温箱/, 'fridge'],
  [/封存药柜/, 'sealedMeds'],
  [/配电/, 'electrical'],
  [/保险柜/, 'safe'],
  [/轿车|车辆|手套箱/, 'car'],
  [/弹药箱/, 'raider'],
  [/帐篷|睡袋/, 'camp'],
  [/健身包/, 'gym'],
  [/背包/, 'bag'],
  [/血袋|药品|补给|急救/, 'medicine'],
  [/实验|检验/, 'lab'],
  [/医疗|器械|护士站/, 'nurse'],
  [/报纸/, 'newspaper'],
  [/书架|书柜|书本/, 'bookcase'],
  [/文件柜|笔记本/, 'filing'],
  [/课桌|学生|教室/, 'desk'],
  [/储物柜/, 'locker'],
  [/零食/, 'tuckshop'],
  [/饮料|饮水/, 'vending'],
  [/食材|厨|沥水|水槽|餐/, 'canteen'],
  [/清洁|水桶|洗手/, 'sundries'],
  [/垃圾|小便池|废纸/, 'trash'],
  [/油桶/, 'fuelDrum'],
  [/工具/, 'toolCabinet'],
  [/置物架|收纳架/, 'hardware'],
  [/木箱|托盘/, 'materials'],
  [/办公|金属柜|杂货柜|纸箱/, 'office'],
];

// Footprints (tiles, w × h) by name: trucks and cars take a stretch of road, shelving and piles two tiles.
/** @type {[RegExp, number, number][]} */
const SIZE_BY_NAME = [
  [/货车/, 3, 2],
  [/轿车|车辆/, 2, 2],
  [/架|柜排|床|设备|帐篷|课桌椅|黑板|屏幕|冰柜|冷饮柜|冷藏柜|水槽|检验台|器械台|转运车|堆|饮水区/, 2, 1],
];

/**
 * The fixture a config piece is at a site, from its config functions and name.
 * @param {number} cfg @param {string} fallback  the loot table when the name says nothing
 * @returns {FixtureSpec}
 */
export function pieceFixture(cfg, fallback) {
  const f = /** @type {any} */ (furn(cfg));
  if (!f) throw new Error(`site wing: no Config_Furniture ${cfg}`);
  const name = String(f.zh || '');
  const specs = /** @type {any[]} */ ((f.funcs || []).map((/** @type {number} */ k) => /** @type {any} */ (FUNC_SPECS)[k]).filter(Boolean));
  const size = SIZE_BY_NAME.find(([re]) => re.test(name));
  const [w, h] = size ? [size[1], size[2]] : [1, 1];
  if (specs.some((s) => s.kind === 'clearObstacle')) return { kind: 'block', cfg, w, h };
  if (specs.some((s) => s.kind === 'recycle')) return { kind: 'scrap', cfg, w, h };
  if (specs.some((s) => s.kind === 'nap' || s.kind === 'sleep')) return { kind: 'rest', cfg, w, h };
  const searched = f.loot > 0 || specs.some((s) => s.kind === 'loot');
  if (!searched && specs.some((s) => s.kind === 'makeItem' && s.lootPool)) return { kind: 'loose', cfg, loot: LOOT_BY_NAME.find(([re]) => re.test(name))?.[1] || fallback, rolls: 1, w, h };
  if (!searched) return { kind: 'prop', cfg, w, h };
  const loot = LOOT_BY_NAME.find(([re]) => re.test(name))?.[1] || fallback;
  const lock = specs.some((s) => s.kind === 'loot' && s.mode === 'pick') ? 'pick' : specs.some((s) => s.kind === 'loot' && s.mode === 'pry') ? 'pry' : null;
  return { kind: 'box', cfg, loot, rolls: Math.max(1, Math.min(3, f.lootN || 1)), w, h, ...(lock ? { lock } : {}) };
}

/**
 * Interior rows of a strip: 'a' walkway, 'p' a row of pieces; pieces come in bands of two rows between walkways,
 * and the last row is a walkway when it would close a band.
 * @param {number} h  the map height
 */
function rowRoles(h) {
  /** @type {Record<number, 'a' | 'p'>} */
  const roles = {};
  for (let y = 1; y <= h - 2; y++) roles[y] = (y - 1) % 3 === 0 ? 'a' : 'p';
  if (roles[h - 2] === 'p' && roles[h - 3] === 'p') roles[h - 2] = 'a';
  return roles;
}

/**
 * Packs the pieces into a strip `width` tiles wide (column 0 is the walkway), or null when they do not fit.
 * @param {FixtureSpec[]} pieces @param {Record<number, 'a' | 'p'>} roles @param {number} width
 * @returns {FixtureSpec[] | null}  the pieces with x, y relative to the strip
 */
function pack(pieces, roles, width) {
  /** @type {number[][]} bands of one or two piece rows */
  const bands = [];
  for (const y of Object.keys(roles).map(Number)) {
    if (roles[y] !== 'p') continue;
    const last = bands.at(-1);
    if (last && last.length === 1 && last[0] === y - 1) last.push(y);
    else bands.push([y]);
  }
  /** @type {Record<number, number>} next free column per row */
  const cursor = {};
  for (const b of bands) for (const y of b) cursor[y] = 1;
  const out = [];
  for (const p of pieces) {
    let at = null;
    for (const b of bands) {
      if (p.h === 2) {
        if (b.length < 2) continue;
        const x = Math.max(cursor[b[0]], cursor[b[1]]);
        if (x + p.w <= width) at = { x, y: b[0], rows: b };
      } else {
        const y = b.find((r) => cursor[r] + p.w <= width);
        if (y != null) at = { x: cursor[y], y, rows: [y] };
      }
      if (at) break;
    }
    if (!at) return null;
    for (const r of at.rows) cursor[r] = at.x + p.w;
    out.push({ ...p, x: at.x, y: at.y });
  }
  return out;
}

/**
 * A site definition with its wing built on: the map widened east, the wing's rooms and its pieces (`extra`,
 * fixtures with their tile positions) added.
 * @template {{ id: string, map: string[], rooms?: any[] }} T
 * @param {T} def
 * @returns {T & { extra: FixtureSpec[] }}
 */
export function withWing(def) {
  const wing = WINGS[def.id];
  if (!wing) return { ...def, extra: [] };
  const h = def.map.length;
  const w0 = def.map[0].length;
  const ground = wing.ground || '.';
  const roles = rowRoles(h);
  const rows = def.map.map((r) => r.split(''));
  for (const y of wing.doors) {
    const inside = rows[y][w0 - 2];
    if (!'.:,z'.includes(inside)) throw new Error(`site ${def.id}: the wing door at row ${y} opens onto '${inside}'`);
    rows[y][w0 - 1] = inside === ',' || inside === ':' ? inside : '.';
  }
  const rooms = [...(def.rooms || [])];
  /** @type {FixtureSpec[]} */
  const extra = [];
  let x0 = w0;
  wing.rooms.forEach((room, i) => {
    const pieces = room.ids.map((cfg) => pieceFixture(cfg, wing.fallback));
    let placed = null;
    let width = 3;
    for (; !placed; width++) {
      if (width > 60) throw new Error(`site ${def.id}: the wing room ${room.id} does not fit`);
      placed = pack(pieces, roles, width);
    }
    width -= 1;
    const last = i === wing.rooms.length - 1;
    const aisles = Object.keys(roles).map(Number).filter((y) => roles[y] === 'a');
    for (let y = 0; y < h; y++) {
      const edge = y === 0 || y === h - 1;
      const cell = edge ? '#' : wing.road?.includes(y) ? ',' : ground;
      for (let x = 0; x < width; x++) rows[y].push(cell);
      // the strip's east wall: doorways at the first and last walkway into the next strip
      rows[y].push(!edge && !last && (y === aisles[0] || y === aisles.at(-1)) ? cell : '#');
    }
    for (const p of placed) extra.push({ ...p, x: x0 + /** @type {number} */ (p.x), y: /** @type {number} */ (p.y), id: `w${p.cfg}`, letter: '', wing: true });
    if (room.label) rooms.push({ id: room.id, x: x0, y: 1, w: width, h: h - 2, label: room.label });
    x0 += width + 1;
  });
  return { ...def, map: rows.map((r) => r.join('')), rooms, extra };
}
