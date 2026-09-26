import { furn } from '../data/db.js';

// Furniture function behavior, keyed by Config_FurnitureFunc id (and scenery keys).
// kind: handler in sim/furnActions.js or a subsystem; min: duration in game minutes;
// cost/gain: stat deltas applied on completion; max: permanent cap raise; need: [[itemId, n]] consumed;
// give: [[itemId, n]] produced; panel: UI panel to open when the survivor arrives.
const open = (panel, extra = {}) => ({ kind: 'open', panel, min: 0, ...extra });
const stat = (min, cost = {}, gain = {}, extra = {}) => ({ kind: 'stat', min, cost, gain, ...extra });

export const FUNC_SPECS = {
  // storage
  1: open('storage'),
  5: open('storage'),
  215: stat(20, { sta: 3 }, { mor: 2 }, { tidy: true }),
  238: open('storage', { drawer: true }),
  307: open('storage'),
  318: open('storage'),
  319: open('storage'),
  2005: open('doorstep', { anyPhase: true }),
  2006: { kind: 'disinfect', min: 20, cost: { sta: 5 } },
  // the fridge's own ice: 2906 is 'ice cubes made in the fridge' (Config_Item d1 从冰箱制作出来的冰块); 2507 is the bag
  // of ice the supermarket freezer sells
  213: { kind: 'makeItem', min: 30, give: [[2906, 2]], needPower: true, daily: 1 },
  1722: { kind: 'toggle', on: true, min: 0 },
  1723: { kind: 'toggle', on: false, min: 0 },
  // sleep & rest
  2: { kind: 'sleep', min: 360 },
  400: { kind: 'sleep', min: 360 },
  300: { kind: 'sleep', min: 360 },
  1708: { kind: 'sleep', min: 360 },
  1800: { kind: 'sleep', min: 360 },
  1842: { kind: 'sleep', min: 360 },
  51: { kind: 'sleep', min: 420, beauty: true },
  4: { kind: 'nap', min: 60 },
  304: { kind: 'nap', min: 60 },
  314: { kind: 'nap', min: 60 },
  1709: { kind: 'nap', min: 60 },
  1801: { kind: 'nap', min: 60 },
  1105: { kind: 'nap', min: 60 },
  1714: { kind: 'nap', min: 30 },
  // exercise & leisure
  3: stat(60, { sta: 15, sat: 4 }, { mor: 3 }, { max: { sta: 0.5 }, dailyMax: 2 }),
  1719: stat(30, { sta: 12, sat: 3 }, { mor: 2 }, { max: { sta: 0.5 }, dailyMax: 2 }),
  9: stat(60, { sta: 10, mor: 5 }, {}, { effect: ['yogaFast', 6] }),
  10: stat(60, { sta: 15, sat: 8 }, { life: 5 }, { max: { life: 0.5 } }),
  35: stat(60, { sta: 8 }, { mor: 8 }, { max: { mor: 1 } }),
  200: stat(45, { sta: 15, sat: 5 }, { mor: 6, life: 3 }, { max: { sta: 1 } }),
  201: stat(20, { sta: 3 }, { mor: 6 }),
  12: stat(60, { sta: 3 }, { mor: 10 }),
  211: stat(60, { sta: 4 }, { mor: 10 }, { needPower: true }),
  219: open('tvgames', { needPower: true }),
  80011: stat(60, { sta: 5 }, { mor: 3 }, { max: { mor: 2 }, needPower: true }),
  11: stat(60, { sta: 10 }, { mor: 5 }, { max: { mor: 1 } }),
  216: { kind: 'makeItem', min: 30, cost: { sta: 5 }, lootPool: 'books', daily: 1 },
  217: stat(40, { sta: 8 }, { mor: 2 }, { give: [[20001, 2]] }),
  328: stat(60, { sta: 10 }, { mor: 5 }, { max: { mor: 2 } }),
  8: { kind: 'radio', min: 60, cost: { sta: 3 }, gain: { mor: 8 } },
  32: { kind: 'radio', min: 60, cost: { sta: 2 }, gain: { mor: 6 } },
  205: stat(45, {}, { mor: 8 }, { needPower: true }),
  243: stat(15, { sta: 2 }, { mor: 6 }),
  1780: stat(15, { sta: 5 }, { mor: 10 }, { max: { mor: 2 } }),
  1781: stat(15, { sta: 5 }, { mor: 10 }),
  1782: stat(20, { sta: 5 }, { mor: 10 }, { max: { mor: 2 }, ride: true }),
  1718: stat(40, {}, { mor: 10, sta: 10 }, { max: { sta: 2 }, needPower: true }),
  1720: stat(15, {}, { mor: 5 }, { max: { mor: 2 } }),
  1774: stat(5, {}, { mor: 3 }, { windUp: true }),
  1775: stat(1, {}, {}, { windUp: false }),
  241: stat(30, { sta: 5 }, { mor: 10 }),
  226: stat(5, {}, { mor: 5 }, { need: [[20220, 1]] }),
  301: stat(5, {}, { mor: 2 }),
  302: stat(30, {}, { mor: 4 }),
  303: stat(30, {}, { mor: 4 }),
  306: stat(30, {}, { mor: 3 }),
  308: stat(30, {}, { mor: 3 }),
  309: stat(30, {}, { mor: 3 }),
  310: stat(30, {}, { mor: 4 }),
  313: stat(30, {}, { mor: 3 }),
  315: stat(30, {}, { mor: 4 }),
  316: stat(30, {}, { mor: 4 }),
  317: stat(30, {}, { mor: 3 }),
  321: stat(30, {}, { mor: 3 }),
  322: stat(30, {}, { mor: 3 }),
  311: stat(30, { sta: 6 }, { mor: 3 }),
  312: stat(30, { sta: 6 }, { mor: 3 }),
  320: stat(30, { sta: 6 }, { mor: 3 }),
  323: stat(30, { sta: 6 }, { mor: 3 }),
  324: stat(30, { sta: 6 }, { mor: 3 }),
  80015: stat(60, { sta: 3 }, { mor: 4, life: 2 }, { needPower: true }),
  // hygiene
  203: stat(10, {}, { life: 2 }, { max: { life: 0.2 } }),
  1107: stat(10, { sta: 5 }, { life: 2 }, { give: [[20001, 1]] }),
  204: { kind: 'makeItem', min: 2, give: [[20001, 1]], daily: 1 },
  206: stat(15, {}, { mor: 8 }, { need: [[20001, 1]], max: { mor: 0.5 } }),
  207: stat(40, { sta: 3 }, { life: 4, mor: 6 }, { max: { life: 0.3 } }),
  208: { kind: 'iceBath', min: 30, need: [[2906, 2]], needAlt: [[[2507, 2]]] }, // fridge ice, or bought ice
  212: { kind: 'toilet', min: 15, need: [[20001, 1]], give: [[15501, 1]] },
  1711: stat(10, {}, { mor: 1 }),
  // observation
  7: { kind: 'lookout', min: 10, gain: { mor: 1 } },
  31: { kind: 'lookout', min: 10, gain: { mor: 1 } },
  214: { kind: 'lookout', min: 15, gain: { mor: 2 } },
  1756: { kind: 'lookout', min: 5 },
  13: stat(5, {}, {}),
  1104: stat(20, { sta: 10 }, {}),
  // doors and windows
  30: { kind: 'repair', min: 30, cost: { sta: 10 }, amount: 100 },
  44: { kind: 'repair', min: 30, cost: { sta: 10 }, amount: 100 },
  221: { kind: 'repair', min: 20, cost: { sta: 5 }, amount: 500, need: [[20300, 1]], advanced: true },
  // 2127–2131 repeat 2126 / 222 / 225 / 221 / 224 with visibility conditions of their own (10070–10079): the New Game+
  // buttons (patch 09-04: New Game+ uses advanced repair right away), shown in place of their twin until it is learned
  2130: { kind: 'repair', min: 20, cost: { sta: 5 }, amount: 500, need: [[20300, 1]], advanced: true, twinOf: 221 },
  222: { kind: 'repair', min: 20, cost: { sta: 5 }, amount: 500, need: [[20301, 1]], advanced: true },
  2128: { kind: 'repair', min: 20, cost: { sta: 5 }, amount: 500, need: [[20301, 1]], advanced: true, twinOf: 222 },
  218: { kind: 'reinforce', min: 30, cost: { sta: 10, sat: 5 }, amount: 50, need: [[20004, 1]] },
  2126: { kind: 'reinforce', min: 30, cost: { sta: 10, sat: 5 }, amount: 50, need: [[20002, 1]] },
  2127: { kind: 'reinforce', min: 30, cost: { sta: 10, sat: 5 }, amount: 50, need: [[20002, 1]], twinOf: 2126 },
  224: { kind: 'reinforce', min: 30, cost: { sta: 5 }, amount: 200, need: [[20310, 1]], advanced: true },
  225: { kind: 'reinforce', min: 30, cost: { sta: 5 }, amount: 200, need: [[20310, 1]], advanced: true },
  2129: { kind: 'reinforce', min: 30, cost: { sta: 5 }, amount: 200, need: [[20310, 1]], advanced: true, twinOf: 225 },
  2131: { kind: 'reinforce', min: 30, cost: { sta: 5 }, amount: 200, need: [[20310, 1]], advanced: true, twinOf: 224 },
  236: { kind: 'reinforce', min: 40, cost: { sta: 8 }, amount: 400, need: [[20311, 1]], advanced: true },
  237: { kind: 'reinforce', min: 40, cost: { sta: 8 }, amount: 400, need: [[20311, 1]], advanced: true },
  // 239 "time is short, grab the keys and go out" (vis 1043) is the first outing; 240 "better be back before the
  // countdown ends" (vis 1042, 239's condition) every one after it
  239: { kind: 'goOut', min: 0, outing: 'first' },
  240: { kind: 'goOut', min: 0, outing: 'again' },
  1002: { kind: 'goExplore', min: 0 },
  209: { kind: 'goExplore', min: 0, forced: true },
  403: { kind: 'goOut', min: 0 },
  251: { kind: 'makeItem', min: 30, cost: { sta: 8 }, lootPool: 'doorstep', daily: 1 },
  2001: { kind: 'bribe', min: 10 },
  80032: { kind: 'throwBait', min: 5, need: [[26008, 1]], size: 1 },
  80033: { kind: 'throwBait', min: 5, need: [[26009, 1]], size: 2 },
  80034: { kind: 'throwBait', min: 5, need: [[26010, 1]], size: 3 },
  // rescue marks / beacon (story)
  36: { kind: 'story', min: 60, cost: { sta: 15 }, story: 'makeMark' },
  38: { kind: 'story', min: 20, story: 'installMark' },
  42: { kind: 'story', min: 90, cost: { sta: 25 }, story: 'forceMark' },
  2111: { kind: 'story', min: 30, cost: { sta: 5 }, story: 'checkBeacon' },
  2115: { kind: 'commit', min: 60, route: 'evacuate' },
  2116: { kind: 'commit', min: 30, route: 'girl' },
  2117: { kind: 'commit', min: 60, route: 'stranger' },
  2118: { kind: 'commit', min: 60, route: 'fortress' },
  2119: { kind: 'commit', min: 60, route: 'truth' },
  2120: { kind: 'commit', min: 60, route: 'greenhouse' },
  2121: { kind: 'commit', min: 30, route: 'companion' },
  2122: { kind: 'commit', min: 60, route: 'supply' },
  // workbench
  37: open('craft'),
  220: { kind: 'repairWorkbench', min: 90, cost: { sta: 15 }, need: [[9020, 1]] },
  249: { kind: 'studyWorkbench', min: 180, cost: { sta: 25 } },
  247: { kind: 'repairWorkbench', min: 60, cost: { sta: 10 }, need: [[20004, 1]] },
  // cooking & drinks
  1700: open('cook'),
  1710: open('cook', { trial: true }),
  2123: open('cook', { hotpot: true }),
  2124: { kind: 'hotpotEat', min: 360, continuous: true },
  2125: open('cook', { hotpot: true }),
  1707: { kind: 'makeItem', min: 15, give: [[2913, 1]], needPower: true, daily: 1 },
  1704: open('storage'),
  1706: open('brew'),
  80030: open('shredder'),
  80031: open('rationPress'),
  // power
  1701: { kind: 'generator', on: true, min: 2 },
  1702: { kind: 'generator', on: false, min: 2 },
  1703: { kind: 'manualGen', min: 60, cost: { sat: 10, sta: 10 } },
  1748: { kind: 'manualGen', min: 10, continuous: true, cost: { sat: 2, sta: 3 } },
  1755: open('generator'),
  1790: open('ratCage'),
  43: { kind: 'repairPower', min: 60, cost: { sta: 15 } },
  223: { kind: 'repairPower', min: 30, cost: { sta: 8 }, need: [[20104, 1]] },
  1725: { kind: 'coldStorage', min: 20, cost: { sta: 5 } },
  1776: { kind: 'fireplace', min: 10, needFuel: true },
  // farming (handled by sim/farming.js)
  325: { kind: 'farm', op: 'plant', min: 20, cost: { sta: 4 } },
  1610: { kind: 'farm', op: 'plant', min: 20, cost: { sta: 4 } },
  326: { kind: 'farm', op: 'fertilize', min: 10, cost: { sta: 2 } },
  1611: { kind: 'farm', op: 'fertilize', min: 10, cost: { sta: 2 } },
  327: { kind: 'farm', op: 'till', min: 20, cost: { sta: 6 } },
  1618: { kind: 'farm', op: 'till', min: 20, cost: { sta: 6 } },
  1613: { kind: 'farm', op: 'pest', min: 15, cost: { sta: 5 } },
  1614: { kind: 'farm', op: 'weed', min: 15, cost: { sta: 5 } },
  1615: { kind: 'farm', op: 'water', min: 10, cost: { sta: 3 } },
  202: { kind: 'farm', op: 'water', min: 10, cost: { sta: 3 } },
  1616: { kind: 'farm', op: 'clear', min: 10, cost: { sta: 3 } },
  1617: { kind: 'farm', op: 'harvest', min: 15, cost: { sta: 4 } },
  // 采摘 on the sites' decorative flowerpots (no plant of their own; reward 20001, not shipped): what grows in them
  // picked once, from the garden table
  1724: { kind: 'loot', mode: 'search', min: 15, cost: { sta: 4 }, table: 'plant' },
  1619: { kind: 'farm', op: 'remove', min: 10, cost: { sta: 3 } },
  1620: { kind: 'farm', op: 'warm', min: 10 },
  80026: { kind: 'farm', op: 'removeDecor', min: 10, cost: { sta: 5 } },
  80028: { kind: 'farm', op: 'removeDecor', min: 10, cost: { sta: 5 } },
  80029: { kind: 'farm', op: 'removeDecor', min: 10, cost: { sta: 5 } },
  2107: open('vase'),
  2108: { kind: 'vase', op: 'clear', min: 5 },
  // record player
  80012: open('records', { needPower: true }),
  80013: { kind: 'record', op: 'next', min: 1 },
  80014: { kind: 'record', op: 'stop', min: 1 },
  80035: { kind: 'record', op: 'auto', value: true, min: 0 },
  80036: { kind: 'record', op: 'auto', value: false, min: 0 },
  80043: { kind: 'record', op: 'loop', value: true, min: 0 },
  80044: { kind: 'record', op: 'loop', value: false, min: 0 },
  ...Object.fromEntries([80016, 80017, 80018, 80019, 80020, 80021, 80022, 80023, 80024].map((id) => [id, open('records')])),
  // drone & neighbor (sim/social.js)
  242: open('droneCargo'),
  1751: open('droneHelp'),
  1752: open('droneTrade'),
  1753: open('droneCargo'),
  1754: { kind: 'drone', op: 'scavenge', min: 5 },
  1759: open('droneRescue'),
  1760: open('droneDeliver'),
  1772: { kind: 'drone', op: 'loot', min: 5 },
  1773: { kind: 'drone', op: 'coords', min: 5 },
  1778: { kind: 'drone', op: 'lure', min: 5 },
  // 1757 / 1758 repeat 1749 / 1750 under other visibility conditions (12049/12050 vs 9210/9211; reward 67112 vs
  // 12051) the config does not ship: the menu shows one button (BUG-0072)
  1749: { kind: 'basket', op: 'repair', min: 60, cost: { sta: 20 } },
  1757: { kind: 'basket', op: 'repair', min: 60, cost: { sta: 20 } },
  1750: open('basket'),
  1758: open('basket'),
  2109: { kind: 'basket', op: 'rope', min: 60, cost: { sta: 20 } },
  1791: open('giveSupplies'),
  // floors
  1705: { kind: 'unlockArea', area: 'B1', min: 0, needTask: true },
  1730: { kind: 'unlockArea', area: '2F', min: 120, cost: { sta: 20 }, need: [[20106, 2]] },
  1731: { kind: 'unlockArea', area: 'B1', min: 120, cost: { sta: 20 }, repairs: true },
  1729: { kind: 'clearObstacle', min: 60, cost: { sat: 15, sta: 25 }, carryLv: 1 },
  1732: { kind: 'clearObstacle', min: 60, cost: { sat: 15, sta: 25 }, carryLv: 2 },
  1733: { kind: 'clearObstacle', min: 60, cost: { sat: 15, sta: 25 }, carryLv: 3 },
  1734: { kind: 'clearObstacle', min: 60, cost: { sat: 15, sta: 25 }, carryLv: 4 },
  1735: { kind: 'clearObstacle', min: 60, cost: { sat: 15, sta: 25 }, carryLv: 5 },
  // pre-disaster shops
  6: open('shop'),
  1607: { kind: 'returnFurniture', min: 5 },
  80010: { kind: 'pawnFurniture', min: 5 },
  1651: open('carShop'),
  1652: open('carShop'),
  1653: open('carShop'),
  1650: open('trunk'),
  1654: open('storage'),
  // misc
  252: open('journal'),
  210: { kind: 'makeItem', min: 30, cost: { sta: 5 }, lootPool: 'rummage', daily: 1 },
  227: { kind: 'recycle', min: 20, cost: { sta: 10 } },
  228: { kind: 'recycle', min: 20, cost: { sta: 10 } },
  229: { kind: 'recycle', min: 20, cost: { sta: 10 } },
  230: { kind: 'recycle', min: 20, cost: { sta: 10 } },
  1764: { kind: 'recycle', min: 20, cost: { sta: 10 }, partial: true },
  231: { kind: 'dismantle', min: 40, cost: { sta: 10 } },
  232: { kind: 'dismantle', min: 40, cost: { sta: 10 } },
  233: { kind: 'dismantle', min: 40, cost: { sta: 10 } },
  234: { kind: 'dismantle', min: 40, cost: { sta: 10 } },
  235: { kind: 'dismantle', min: 20, cost: { sta: 10 }, need: [[20330, 1]] },
  299: { kind: 'dismantle', min: 30, cost: { sta: 8 } },
  1608: { kind: 'moveFurniture', min: 20, cost: { sta: 10 } },
  1609: { kind: 'dismantlePackage', min: 20, cost: { sta: 5 } },
  80025: { kind: 'makeItem', min: 2, give: [[2502, 1]], once: true },
  80027: stat(30, { sta: 15 }, { mor: 3 }, { story: 'antenna' }),
  1721: { kind: 'makeItem', min: 20, cost: { sta: 5 }, lootPool: 'rummage' },
  1765: { kind: 'makeItem', min: 2, lootPool: 'pickup' },
  ...LOOT_SPECS(),
  // stairs (FuncType 7, JumpTarget): 上楼 / 下楼 take the survivor to the floor above / below; 244's tip says the
  // stairs are broken until 修复楼梯 (1730) opens the upper floor
  244: { kind: 'stairs', dir: 'up', min: 0, brokenTip: true },
  245: { kind: 'stairs', dir: 'down', min: 0 },
  246: { kind: 'stairs', dir: 'up', min: 0 },
  2101: { kind: 'stairs', dir: 'up', min: 0 },
  // the Construction Shop counters (FuncAction 12, like 6's 4: buy)
  53: open('shop'),
  // 搜索衣柜 (FuncType 1: take from the piece's own storage)
  404: open('storage'),
  // 纸箱2's third function: the config row has no name, no action and no preview; the box opened for a look
  248: open('storage'),
  // pre-disaster showroom try-outs (FuncAction 1908–1913; drivers: the 'shop' action's trial op, predisaster.js)
  1712: { kind: 'shop', op: 'trial', min: 15 },
  1713: { kind: 'shop', op: 'trial', min: 15 },
  1715: { kind: 'shop', op: 'trial', min: 10 },
  1716: { kind: 'shop', op: 'trial', min: 10 },
  1717: { kind: 'shop', op: 'trial', min: 15 },
  // 拆卸 the blocked doors at the hospital and the school: needs a crowbar (cond 9101, as 1728's), clears the way
  1761: { kind: 'clearObstacle', min: 30, cost: { sta: 10 }, tool: 20330 },
};

// Loot containers (FuncAction 1100/1101 hand out a loot roll). mode: 'search' opens and takes everything the piece
// holds, 'look' (查看, Stamina:-5) takes one find at a time, 'pry' / 'pick' open a locked piece with a crowbar /
// lockpick and take everything. table: the loot table (src/content/sites.js LOOT_TABLES) when the piece stands at no
// exploration site; a piece at a site uses the table its site gives it. consume: the tip says the tool is used up
// ("需要消耗1把撬棍"). Stamina is the config's PreviewAttrDelta.
function LOOT_SPECS() {
  const CROWBAR = 20330;
  const LOCKPICK = 20320;
  // minutes: the config gives none; a third of the first guesses (search 20, look 10, pry 30, pick 20), which read as
  // a stall in play (owner playtest, 2026-09-26), in line with a site's containers (src/content/sites.js SEARCH_MIN)
  const search = (sta, table, extra = {}) => ({ kind: 'loot', mode: 'search', min: 6, cost: { sta }, table, ...extra });
  const look = (table, extra = {}) => ({ kind: 'loot', mode: 'look', min: 3, cost: { sta: 5 }, table, ...extra });
  const pry = (sta, table, extra = {}) => ({ kind: 'loot', mode: 'pry', min: 10, cost: sta ? { sta } : {}, tool: CROWBAR, table, ...extra });
  const pick = (sta, table, extra = {}) => ({ kind: 'loot', mode: 'pick', min: 6, cost: { sta }, tool: LOCKPICK, consume: true, table, ...extra });
  const out = {
    1101: search(5, 'materials', { byName: true }),
    1106: search(5, 'stockroom', { byName: true }),
    1102: pick(15, 'toolCabinet'),
    1103: pry(25, 'toolCabinet'),
    1501: pry(25, 'toolCabinet'),
    1601: look('toolCabinet'),
    1502: pick(15, 'toolShelf'),
    1602: look('toolShelf'),
    1503: search(15, 'trash'),
    1603: look('trash'),
    1504: search(15, 'filing'),
    1604: look('filing'),
    1505: search(15, 'filing'),
    1605: look('filing'),
    1506: search(15, 'bag'),
    1606: look('bag'),
    1726: search(5, 'desk'),
    1727: search(0, 'desk', { cost: {}, noisy: true }),
    1728: pry(0, 'toolCabinet', { consume: true }),
  };
  // the site containers' pairs: 撬开 (a crowbar used up) / 解锁 (lockpick, Stamina:-15), then 查看 (Stamina:-5)
  const pairs = [
    [1740, 1741, 'truck'],
    [1742, 1743, 'truck'],
    [1744, 1745, 'freezer'],
    [1746, 1747, 'freezer'],
    [1762, 1763, 'medFridge'],
    [1766, 1767, 'medFridge'],
    [1768, 1769, 'sealedMeds'],
    [1770, 1771, 'sealedMeds'],
    [1802, 1803, 'electrical'],
    [1804, 1805, 'electrical'],
    [1806, 1807, 'generator'],
    [1808, 1809, 'electrical'],
    [1810, 1811, 'electrical'],
    [1812, 1813, 'electrical'],
    [1814, 1815, 'electrical'],
    [1816, 1817, 'generator'],
    [1818, 1819, 'car'],
    [1820, 1821, 'car'],
    [1822, 1823, 'electrical'],
    [1824, 1825, 'vending'],
    [1826, 1827, 'sundries'],
    [1828, 1829, 'toolCabinet'],
    [1830, 1831, 'vending'],
  ];
  for (const [open, see, table] of pairs) {
    out[open] = pry(0, table, { consume: true });
    out[see] = look(table);
  }
  for (const [open, see, table] of [
    [1832, 1833, 'fireCabinet'],
    [1834, 1835, 'safe'],
    [1836, 1837, 'safe'],
    [1838, 1839, 'safe'],
    [1840, 1841, 'safe'],
  ]) {
    out[open] = pick(15, table);
    out[see] = look(table);
  }
  return out;
}

// Scenery (non-config) furniture functions.
export const SCENERY_SPECS = {
  craft: open('craft'),
  repairWorkbench: { kind: 'repairWorkbench', min: 90, cost: { sta: 15 }, need: [[9020, 1]] },
  studyWorkbench: { kind: 'studyWorkbench', min: 180, cost: { sta: 25 } },
  drawer: open('storage', { drawer: true }),
  dismantle: { kind: 'dismantle', min: 40, cost: { sta: 10 } },
  cleanMagazines: stat(40, { sta: 8 }, { mor: 2 }, { give: [[20001, 2]] }),
  clearRubble: { kind: 'clearRubble', min: 90, cost: { sat: 10, sta: 20 } },
  radio: { kind: 'radio', min: 60, cost: { sta: 3 }, gain: { mor: 8 } },
  trapOpen: { kind: 'trapOpen', min: 2 },
  trapRemove: { kind: 'trapRemove', min: 10, cost: { sta: 2 } },
};

// Parse a PreviewAttrDelta string like "Morale:+5;Stamina:-10;MaxMorale:+2".
export function parsePreview(s) {
  const out = { cost: {}, gain: {}, max: {} };
  if (!s) return out;
  const map = { Morale: 'mor', Stamina: 'sta', Satiety: 'sat', Life: 'life', Health: 'life' };
  for (const part of s.split(';')) {
    const [k, v] = part.split(':');
    if (!k || v == null) continue;
    const n = parseFloat(v);
    if (Number.isNaN(n)) continue;
    if (k.startsWith('Max')) {
      const key = map[k.slice(3)];
      if (key) out.max[key] = n;
    } else {
      const key = map[k];
      if (!key) continue;
      if (n < 0) out.cost[key] = -n;
      else out.gain[key] = n;
    }
  }
  return out;
}

// The config function an interaction runs on a piece that stands outside the home (exploration-site fixtures, shop
// fixtures): the first FurnitureFunc of the piece whose spec matches, or null. The action then carries it as its
// funcKey, as furniture-menu actions do.
const FIXTURE_MATCH = {
  search: (s) => (s?.kind === 'loot' && s.mode === 'search') || (s?.kind === 'makeItem' && !!s.lootPool),
  take: (s) => s?.kind === 'loot' && s.mode === 'look',
  pry: (s) => s?.kind === 'loot' && s.mode === 'pry',
  pick: (s) => s?.kind === 'loot' && s.mode === 'pick',
  clear: (s) => s?.kind === 'clearObstacle' || s?.kind === 'recycle',
  rest: (s) => s?.kind === 'nap' || s?.kind === 'sleep',
  rummage: (s) => s?.kind === 'makeItem' && s.lootPool === 'rummage',
};

export function fixtureFunc(cfg, op, panel = null) {
  const keys = (typeof cfg === 'number' && furn(cfg)?.funcs) || [];
  const match = op === 'open' ? (s) => s?.kind === 'open' && s.panel === panel : FIXTURE_MATCH[op];
  if (!match) return null;
  // a plain search of an unlocked container that only offers 查看 runs that
  // (and taking what is left of a container that only offers its search runs that search)
  const other = op === 'search' ? FIXTURE_MATCH.take : op === 'take' ? FIXTURE_MATCH.search : null;
  const hit = keys.find((k) => match(FUNC_SPECS[k])) ?? (other ? keys.find((k) => other(FUNC_SPECS[k])) : undefined);
  return hit ?? null;
}

// The config function an action of `kind` (and `op`) is, when a panel queues it rather than the furniture menu: the
// piece's own function of that kind, else the first config function with that spec (the farm panel's 铲除植物, 1619;
// the drone's missions; the record player's 下一首, 80013).
export function opFunc(cfg, kind, op = undefined) {
  const match = (k) => FUNC_SPECS[k]?.kind === kind && FUNC_SPECS[k].op === op;
  const own = ((typeof cfg === 'number' && furn(cfg)?.funcs) || []).find(match);
  if (own != null) return own;
  const any = Object.keys(FUNC_SPECS).find(match);
  return any != null ? Number(any) : null;
}
