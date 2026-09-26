// @ts-check
// Furniture functions (Config_FurnitureFunc) doing in the sim what their config says: at home from the furniture menu
// (the piece placed, the situation set up, the function started and the clock ticked until its action completes),
// at the exploration sites (every interaction on a site's pieces) and in the pre-disaster shops (every fixture used).
// Each test asserts what the action did: the stamina and other stats its preview names, items made, used up or found,
// the panel it opens, the piece or the home afterwards.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runFunction, HOUR } from './fixtures/funcs/harness.js';
import * as sites from './fixtures/funcs/sites.js';
import * as shops from './fixtures/funcs/shops.js';
import { func, furn, furniture as furnTableOf } from '../src/data/db.js';

const furnTable = () => /** @type {Record<string, any>} */ (furnTableOf);
import { FUNC_SPECS as SPECS, parsePreview } from '../src/content/funcSpecs.js';
import { SITES } from '../src/content/sites.js';
import { queueReturnFurniture } from '../src/sim/predisaster.js';
import { packageToFurniture } from '../src/data/db.js';
import { homeFurniture } from '../src/sim/home.js';
import { tick } from '../src/sim/tick.js';
import { newGame } from '../src/sim/state.js';
import { on } from '../src/engine/bus.js';
import { runUntilIdle as runUntilIdleOf } from './fixtures/funcs/harness.js';

const FUNC_SPECS = /** @type {Record<number, any>} */ (SPECS);

// [function, piece] run at home. Pieces the homes do not place yet and that have no slot type (the stairs, the
// Warehouse Manager's gates and cages) stand in a free slot.
const HOME = [
  [1, 1], [2, 2], [4, 2], [5, 1], [30, 211], [31, 35000], [32, 213], [35, 2], [36, 312], [37, 313], [38, 35000], [43, 9175],
  [44, 35000], [51, 9076], [200, 3], [201, 438], [202, 9065], [203, 434], [204, 9063], [205, 213], [206, 9067], [207, 427],
  [208, 427], [209, 211], [210, 373], [211, 378], [212, 428], [213, 215], [214, 9069], [215, 1], [216, 80050], [217, 80050],
  [218, 211], [219, 419], [220, 313], [221, 211], [222, 35000], [224, 211], [225, 35000], [226, 35000], [227, 310], [228, 305],
  [229, 222], [230, 223], [233, 9166], [234, 9151], [235, 9058], [236, 211], [237, 35000], [238, 313], [239, 211], [240, 211],
  [241, 9054], [244, 879], [245, 871], [246, 80127], [247, 313], [248, 308], [249, 313], [251, 30002], [252, 306], [299, 1],
  [301, 9077], [302, 9078], [303, 9079], [310, 9087], [311, 9088], [312, 9089], [313, 9090], [314, 372], [315, 9092],
  [316, 9093], [317, 9094], [320, 427], [321, 9098], [322, 9099], [323, 428], [324, 9101], [328, 80109], [400, 9104],
  [401, 9107], [402, 9114], [403, 9113], [404, 9111], [1002, 211], [1101, 364], [1105, 9122], [1501, 9120], [1502, 9115],
  [1503, 441], [1505, 9119], [1506, 9122], [1601, 9120], [1602, 9115], [1603, 441], [1605, 9119], [1606, 9122], [1608, 1],
  [1610, 229], [1611, 229], [1613, 229], [1614, 229], [1615, 229], [1616, 229], [1617, 229], [1618, 229], [1620, 65000],
  [1700, 432], [1703, 3], [1704, 66000], [1705, 9075], [1706, 66001], [1707, 50002], [1708, 20001], [1709, 20001],
  [1718, 20003], [1719, 21003], [1720, 21007], [1721, 114], [1722, 215], [1723, 215], [1730, 879], [1731, 9075], [1748, 3],
  [1749, 9298], [1750, 9298], [1751, 9054], [1752, 9054], [1753, 9054], [1754, 9054], [1755, 42000], [1756, 35000],
  [1759, 9054], [1760, 9054], [1772, 9054], [1773, 9054], [1774, 9311], [1775, 9311],
  [1776, 65001], [1780, 9300], [1781, 9308], [1782, 9307], [1790, 42009], [1800, 20000], [1801, 20000], [1842, 80088],
  [2001, 211], [2005, 211], [2006, 1], [2100, 351], [2101, 386], [2103, 341], [2105, 341], [2106, 387], [2107, 67000],
  [2108, 67000], [2109, 9298], [2110, 347], [2111, 9296], [2112, 387], [2113, 347], [2115, 9296], [2116, 9298], [2117, 9054],
  [2118, 211], [2119, 9297], [2120, 229], [2121, 9298], [2122, 368], [2123, 50003], [2124, 50003], [2125, 50003],
  [2126, 35000], [2127, 35000], [2128, 35000], [2129, 35000], [2130, 30000], [2131, 30000], [80011, 70000], [80012, 70002],
  [80014, 70002], [80015, 21006], [80016, 70002], [80017, 70002], [80018, 70002], [80019, 70002], [80020, 70002],
  [80021, 70002], [80022, 70002], [80023, 70002], [80024, 70002], [80025, 80060], [80027, 80105], [80028, 80092],
  [80029, 80117], [80030, 70007], [80031, 70008], [80032, 211], [80033, 211], [80034, 211], [80035, 70002], [80036, 70002],
  [80043, 70002], [80044, 70002],
];

// Shop and home pieces no shop or home places yet: the function run on the piece stood in a free slot of the home,
// the way the furniture menu runs it. (The site pieces that stood in here now stand in their site's wing,
// src/content/siteWings.js, and run there: SITE_FUNCS below.)
const STOOD_IN = [[53, 804], [1107, 42020], [1724, 915], [80010, 80010], [80026, 80041]];

// Functions no Config_Furniture row offers, run the way a panel button queues them (queuePanelFunction) on the piece
// they belong to: the generator panel's 开启 / 关闭发电机 and the record panel's 下一首 (wired so), the planting panel's
// farm operations, the drone's missions and the rest of the config's unoffered rows.
const PANEL = [
  [42, 35000], [231, 9166], [232, 9166], [242, 9054], [300, 2], [304, 2], [306, 1], [307, 1], [308, 1], [309, 1], [318, 1],
  [319, 1], [325, 229], [326, 229], [327, 229], [1102, 9115], [1103, 9120], [1104, 35000], [1106, 330], [1504, 9119],
  [1604, 9119], [1609, 1], [1619, 229], [1652, 42033], [1653, 42033], [1654, 315], [1701, 42000], [1702, 42000],
  [1727, 67007], [1728, 67007], [1778, 9054], [80013, 70002],
];

// Functions whose finds are rolled: run over a few seeds until something comes out.
const ROLLED = (/** @type {any} */ spec) => spec.kind === 'loot' || (spec.kind === 'makeItem' && !!spec.lootPool);

/** @param {number} key @param {any} r  what runFunction recorded */
function assertEffect(key, r) {
  const spec = r.spec;
  const cfg = func(key);
  const label = `${key} ${cfg?.zh || ''}`;
  const own = r.stats.filter((/** @type {any} */ e) => e.source === spec.kind);
  const moved = (/** @type {string} */ k, /** @type {number} */ sign) => own.some((/** @type {any} */ e) => e.key === k && Math.sign(e.delta) === sign);
  // the stats the spec costs and gives (for a preview-derived spec, exactly the config's PreviewAttrDelta)
  // (a farm Plant opens the planting panel: its costs come with the planting itself)
  const opensPanel = spec.kind === 'farm' && spec.op === 'plant';
  for (const k of Object.keys(spec.cost || {})) if (spec.cost[k] > 0 && !opensPanel) assert.ok(moved(k, -1), `${label}: costs ${k}`);
  for (const k of Object.keys(spec.gain || {})) if (spec.gain[k] > 0 && !spec.rest) assert.ok(moved(k, 1), `${label}: gives ${k}`);
  for (const k of Object.keys(spec.max || {})) if (spec.max[k] > 0) assert.ok(r.maxes.some((/** @type {any} */ m) => m.key === k), `${label}: raises max ${k}`);
  if (!FUNC_SPECS[key]) {
    const pv = parsePreview(cfg.preview);
    assert.deepEqual(spec.cost, pv.cost, `${label}: the preview's costs`);
  }
  for (const [id] of spec.give || []) assert.ok(r.up.includes(id), `${label}: makes ${id}`);
  const need = spec.need && spec.kind !== 'repair' && spec.kind !== 'reinforce' ? spec.need : null;
  if (need && !spec.needAlt) for (const [id] of need) assert.ok(r.down.includes(id), `${label}: uses up ${id}`);
  const f = r.piece;
  const before = r.pieceBefore;
  switch (spec.kind) {
    case 'open':
      assert.ok(r.panels.some((/** @type {any} */ p) => p.panel === spec.panel), `${label}: opens the ${spec.panel} panel`);
      break;
    case 'sleep':
    case 'nap':
      assert.ok(own.filter((/** @type {any} */ e) => e.key === 'sta').reduce((/** @type {number} */ a, /** @type {any} */ e) => a + e.delta, 0) > 0, `${label}: restores stamina`);
      assert.equal(r.s.player.sleeping, false, `${label}: wakes up`);
      break;
    case 'makeItem':
    case 'loot':
      assert.ok(r.up.length > 0, `${label}: hands out items`);
      if (spec.kind === 'loot') {
        if (spec.consume) assert.ok(r.down.includes(spec.tool), `${label}: uses up the tool`);
        if (spec.mode === 'pry' || spec.mode === 'pick') assert.equal(f.data.opened, true, `${label}: opens the lock`);
        if (spec.mode === 'look') assert.equal(r.up.length, 1, `${label}: one find at a time`);
      }
      break;
    case 'toggle':
      assert.equal(f.on, spec.on, `${label}: switched ${spec.on ? 'on' : 'off'}`);
      break;
    case 'repair':
      assert.ok(f.hp > before.hp, `${label}: mends the piece`);
      assert.ok(r.down.includes(spec.need?.[0]?.[0] ?? -1) || !spec.need, `${label}: uses up the repair material`);
      break;
    case 'reinforce':
      assert.ok(f.reinforce > before.reinforce, `${label}: reinforces the piece`);
      break;
    case 'dismantle':
      assert.equal(f, null, `${label}: the piece is gone`);
      assert.ok(r.up.length > 0, `${label}: materials come back`);
      break;
    case 'recycle':
      assert.ok(r.up.length > 0, `${label}: materials come back`);
      break;
    case 'stairs':
      assert.ok(r.events.some((/** @type {any} */ e) => e.type === 'floorChanged'), `${label}: takes the stairs`);
      assert.notEqual(r.s.player.floor, before.floor, `${label}: on another floor`);
      break;
    case 'story':
      if (spec.story === 'makeMark' || spec.story === 'forceMark') assert.ok(r.up.includes(9002), `${label}: a rescue marker made`);
      if (spec.story === 'installMark') {
        runUntilIdleOf(r.s);
        assert.ok(Object.values(r.s.furniture).some((/** @type {any} */ x) => x.cfg === /** @type {Record<number, number>} */ (packageToFurniture)[9002]), `${label}: the marker is put up`);
      }
      if (spec.story === 'checkBeacon') assert.ok(r.s.story.flags.beaconChecks >= 1, `${label}: the beacon checked`);
      break;
    case 'radio':
      assert.ok(r.events.some((/** @type {any} */ e) => e.type === 'radio'), `${label}: the radio plays`);
      break;
    case 'record':
      assert.ok(r.events.some((/** @type {any} */ e) => e.type === 'recordOp' && e.e.op === spec.op), `${label}: record player ${spec.op}`);
      break;
    case 'commit':
      assert.equal(r.s.story.route, spec.route, `${label}: commits to ${spec.route}`);
      break;
    case 'goOut':
      assert.ok(r.panels.some((/** @type {any} */ p) => p.panel === 'map'), `${label}: the city map`);
      break;
    case 'goExplore':
      assert.ok(r.panels.some((/** @type {any} */ p) => p.panel === 'exploreMap'), `${label}: the exploration map`);
      break;
    case 'unlockArea':
      assert.equal(r.s.home.unlocked[spec.area], true, `${label}: opens ${spec.area}`);
      break;
    case 'repairWorkbench':
    case 'studyWorkbench':
      assert.equal(f.broken, false, `${label}: the workbench works`);
      break;
    case 'repairPower':
      assert.equal(!!r.s.power?.damaged, false, `${label}: the wiring is mended`);
      break;
    case 'vase':
      assert.equal(f.data.flower, null, `${label}: the vase is cleared`);
      break;
    case 'toilet':
      assert.ok(r.up.includes(15501) && r.down.includes(20001), `${label}: paper in, fertilizer out`);
      break;
    case 'iceBath':
      assert.ok(moved('mor', 1) && moved('sta', 1), `${label}: morale and stamina`);
      break;
    case 'disinfect':
      assert.ok([2164, 2165, 2166].some((id) => r.down.includes(id)) || r.pieceBefore.inv, `${label}: the spray is used`);
      assert.equal(!!r.s.inventories[f.inv]?.moldy, false, `${label}: the mold is gone`);
      break;
    case 'throwBait':
      assert.ok(r.down.includes(spec.need[0][0]), `${label}: the bait is thrown`);
      break;
    case 'fireplace':
      assert.ok(r.down.includes(8001) || r.events.some((/** @type {any} */ e) => e.type === 'powerChanged'), `${label}: the fire is fed`);
      break;
    case 'generator':
      assert.equal(!!f.on, !!spec.on, `${label}: the generator ${spec.on ? 'runs' : 'stops'}`);
      break;
    case 'drone':
      if (spec.op === 'lure') assert.equal(r.s.social.shield.active?.luring, true, `${label}: the drone leads the horde away`);
      break;
    case 'clearObstacle':
      assert.equal(f, null, `${label}: the obstacle is gone`);
      break;
    case 'moveFurniture':
      assert.ok(r.panels.some((/** @type {any} */ p) => p.panel === 'planning'), `${label}: planning mode to move it`);
      break;
    case 'farm':
      if (spec.op === 'plant') assert.ok(r.panels.some((/** @type {any} */ p) => p.panel === 'plant'), `${label}: the planting panel`);
      if (spec.op === 'pest') assert.ok(!(f.data.crops || []).some((/** @type {any} */ c) => c.pest), `${label}: no pests left`);
      if (spec.op === 'weed') assert.ok(!(f.data.crops || []).some((/** @type {any} */ c) => c.weed), `${label}: no weeds left`);
      if (spec.op === 'water') assert.ok(!(f.data.crops || []).some((/** @type {any} */ c) => c.dry), `${label}: watered`);
      if (spec.op === 'harvest') assert.ok(r.up.length > 0, `${label}: the harvest`);
      if (spec.op === 'clear') assert.ok(!(f.data.crops || []).some((/** @type {any} */ c) => c.withered), `${label}: the withered crop cleared`);
      if (spec.op === 'fertilize') assert.ok(r.down.includes(15501), `${label}: the fertilizer is used`);
      if (spec.op === 'removeDecor') assert.ok(!f?.data?.decorPlant, `${label}: the plant is pulled`);
      break;
    default:
      break;
  }
}

for (const [list, how, panel] of /** @type {const} */ ([[HOME, 'at home', false], [STOOD_IN, 'stood in at home', false], [PANEL, 'from its panel', true]])) {
  for (const [key, piece] of list) {
    const spec = FUNC_SPECS[key] || { kind: 'stat' };
    test(`function ${key} ${func(key)?.zh || '(unnamed)'} on ${piece} ${furn(piece)?.zh || ''} works ${how} (${spec.kind})`, () => {
      let r = runFunction(piece, key, { panel });
      for (let seed = 8; ROLLED(spec) && r.done && !r.up.length && seed < 14; seed++) r = runFunction(piece, key, { seed, panel });
      assert.ok(r.done, `${key} on ${piece}: ${(r.why || []).join('; ')}`);
      assert.equal(r.action.funcKey, key);
      assertEffect(key, r);
    });
  }
}

test('a home loot container holds its finds once: 查看 takes one at a time, the thorough search the rest, then nothing is left', () => {
  const r = runFunction(441, 1603);
  assert.ok(r.done);
  const f = r.f;
  const left = f.data.finds.length;
  const entry = (/** @type {number} */ k) => r.s && k;
  assert.ok(entry(1503));
  // the rest comes out with the full rummage, after which both buttons are spent
  const more = runFunction(441, 1503, { setup: (s, g) => (g.data.finds = [...f.data.finds]) });
  assert.ok(more.done);
  assert.equal(more.up.length > 0, left > 0);
  assert.equal(more.piece.data.finds.length, 0);
});

test('a locked home container: its 查看 waits until the crowbar or lockpick function opened it', () => {
  const r = runFunction(9120, 1501);
  assert.ok(r.done, (r.why || []).join('; '));
  assert.equal(r.piece.data.opened, true);
  assert.ok(r.up.length > 0, 'prying it open hands out what is inside');
});

// Site functions, credited at the exploration sites where their pieces stand.
const SITE_FUNCS = {
  streets: [1101, 1818, 1819, 1820, 1821],
  supermarket: [1729, 1740, 1741, 1742, 1743, 1744, 1745, 1746, 1747],
  hardware: [1501, 1502, 1601, 1602, 1828, 1829],
  hospital: [1105, 1732, 1733, 1734, 1761, 1762, 1763, 1766, 1767, 1768, 1769, 1770, 1771, 1802, 1803, 1804, 1805, 1806, 1807, 1808, 1809, 1810, 1811],
  school: [1726, 1735, 1824, 1825, 1826, 1827, 1832, 1833, 1838, 1839, 1840, 1841],
  office: [1764, 1765, 1812, 1813, 1814, 1815, 1816, 1817, 1822, 1823, 1830, 1831, 1834, 1835, 1836, 1837],
};

for (const [site, keys] of Object.entries(SITE_FUNCS)) {
  test(`the ${site} site's pieces run their config functions: ${keys.join(', ')}`, () => {
    assert.ok(SITES.some((d) => d.id === site));
    /** @type {Map<number, any[]>} */
    const by = new Map();
    // the pieces offering these functions; a second visit only when the first left one untried or empty-handed
    const pieces = new Set(Object.values(furnTable()).filter((d) => [...(d.funcs || [])].some((k) => keys.includes(k))).map((d) => d.id));
    const settled = () => keys.every((k) => (by.get(k) || []).some((r) => FUNC_SPECS[k]?.kind !== 'loot' || r.up.length > 0));
    for (const seed of [1, 2, 3]) {
      if (settled()) break;
      for (const r of sites.useEveryFixture(sites.arrive(site, seed), pieces)) for (const k of r.funcs) by.set(k, [...(by.get(k) || []), r]);
    }
    for (const key of keys) {
      const runs = by.get(key) || [];
      assert.ok(runs.length, `${key} ${func(key)?.zh}: no interaction at ${site} ran it`);
      const spec = FUNC_SPECS[key];
      if (spec?.kind === 'loot') assert.ok(runs.some((r) => r.up.length > 0), `${key}: items come out`);
      if (spec?.kind === 'loot' && spec.consume) assert.ok(runs.some((r) => r.down.includes(spec.tool)), `${key}: the tool is used up`);
      if (spec?.kind === 'clearObstacle') assert.ok(runs.some((r) => r.stats.some((/** @type {any} */ e) => e.key === 'sta' && e.delta < 0)), `${key}: pushing it aside is hard work`);
    }
  });
}

test('the pre-disaster shops run their fixtures\' config functions: shelves, trunk, car lot, rummaging and the showroom try-outs', () => {
  /** @type {Map<number, any[]>} */
  const by = new Map();
  for (const shop of ['market', 'carlot', 'renovation']) for (const r of shops.useEveryFixture(shops.atShop(shop), shop)) for (const k of r.funcs) by.set(k, [...(by.get(k) || []), r]);
  const want = { 6: 'shop', 1650: 'trunk', 1651: 'carShop' };
  for (const [key, panel] of Object.entries(want)) assert.ok((by.get(Number(key)) || []).some((r) => r.panels.includes(panel)), `${key} opens ${panel}`);
  for (const key of [1710, 1711, 1712, 1713, 1714, 1715, 1716, 1717]) assert.ok(by.get(key)?.length, `try-out ${key} ${func(key)?.zh}`);
  assert.ok((by.get(1721) || []).some((r) => r.up.length > 0), '1721 搜寻 hands out finds');
  // the showroom sofa: a try-out (1714), then what its cushions hide (1721)
  const sofa = (by.get(1714) || [])[0];
  assert.deepEqual(sofa.funcs, [1714, 1721]);
  assert.ok(sofa.up.length > 0);
});

test('1607 退货: a returnable piece at home goes back for a refund', () => {
  const s = /** @type {any} */ (newGame({ seed: 40 }));
  const pot = homeFurniture(s).find((f) => f.data?.decorPlant);
  assert.ok(pot, 'the starter flowerpot');
  const money = s.player.money;
  /** @type {any} */
  let done = null;
  const off = on('actionDone', (/** @type {any} */ a) => a.funcKey === 1607 && (done = a));
  try {
    assert.ok(queueReturnFurniture(s, pot.uid));
    for (let t = 0; t < HOUR && !done; t += 60) tick(s, 60);
  } finally {
    off();
  }
  assert.ok(done, 'the return completed');
  assert.equal(s.furniture[pot.uid], undefined);
  assert.ok(s.player.money > money, 'refunded');
});
