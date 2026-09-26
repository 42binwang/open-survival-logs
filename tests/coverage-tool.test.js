// @ts-check
// The coverage tool (tools/coverage.mjs): every probe gets a fixture it must pass and one it must fail. Drivers run
// in this process on a handful of real config entities; family evaluations get fixture configs, observations,
// traces and manifests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { funcExcluded, furnitureScope, gameConfig, offeredFuncs, phaseUnreachable } from '../tools/coverage/data.mjs';
import { emptyObs, mergeObs } from '../tools/coverage/observe.mjs';
import { expectedUses } from '../tools/coverage/uses.mjs';
import { readManifests, renderBinding } from '../tools/coverage/manifests.mjs';
import { featureRows, newsItems } from '../tools/coverage/news.mjs';
import { traceTests } from '../tools/coverage/trace.mjs';
import { markdown, table, verdict } from '../tools/coverage/report.mjs';
import { FAMILIES, planTasks } from '../tools/coverage/run.mjs';
import { fullParity, impossibleChecks } from '../tools/coverage/selfcheck.mjs';
import { ROOT, loadSim } from '../tools/coverage/sim.mjs';
import { groupsRead } from '../tools/coverage/trace/rules.mjs';
import * as items from '../tools/coverage/families/items.mjs';
import * as furniture from '../tools/coverage/families/furniture.mjs';
import * as funcs from '../tools/coverage/families/funcs.mjs';
import * as cooking from '../tools/coverage/families/cooking.mjs';
import * as crafting from '../tools/coverage/families/crafting.mjs';
import * as plants from '../tools/coverage/families/plants.mjs';
import * as achievements from '../tools/coverage/families/achievements.mjs';
import * as news from '../tools/coverage/families/news.mjs';
import { run as shops } from '../tools/coverage/drivers/shops.mjs';
import { run as starter } from '../tools/coverage/drivers/starter.mjs';
import { run as itemuse } from '../tools/coverage/drivers/itemuse.mjs';
import { run as furnitureDriver } from '../tools/coverage/drivers/furniture.mjs';
import { run as scenes } from '../tools/coverage/drivers/scenes.mjs';
import { run as specs } from '../tools/coverage/drivers/specs.mjs';
import { run as cookingDriver } from '../tools/coverage/drivers/cooking.mjs';
import { run as craftingDriver } from '../tools/coverage/drivers/crafting.mjs';
import { run as farming } from '../tools/coverage/drivers/farming.mjs';
import { run as sitefx } from '../tools/coverage/drivers/sitefx.mjs';

const CFG = gameConfig();
/** @param {import('../tools/coverage/data.mjs').Config} cfg @param {Partial<import('../tools/coverage/data.mjs').Config>} over */
const only = (cfg, over) => ({ ...cfg, ...over });
/** @param {Record<string, any>} table @param {number[]} ids */
const pick = (table, ids) => Object.fromEntries(ids.map((id) => [id, table[id]]));
/** @param {import('../tools/coverage/family.mjs').Family} fam @param {string | number} id */
const entity = (fam, id) => {
  const e = fam.entities.find((x) => x.id === String(id));
  assert.ok(e, `${fam.id} has entity ${id} in scope`);
  return e;
};
/** @param {...import('../tools/coverage/observe.mjs').Obs} list */
const merged = (...list) => list.reduce((a, o) => mergeObs(a, o), emptyObs());

test('config rules: development entries, unoffered functions and uncookable recipes are left out, nothing else', () => {
  const fam = items.evaluate({ cfg: only(CFG, { items: pick(CFG.items, [2114, 15001]) }), obs: emptyObs() });
  assert.deepEqual(fam.excluded.map((e) => e.id), ['15001'], 'a test seed is a development entry');
  assert.equal(fam.total, 2);
  const fn = funcs.evaluate({ cfg: only(CFG, { funcs: pick(CFG.funcs, [2, 3, 33]) }), obs: emptyObs(), trace: null });
  assert.deepEqual(fn.excluded.map((e) => e.id).sort(), ['3', '33'], 'func 3 no furniture offers; func 33 is a test entry');
  const ck = cooking.evaluate({ cfg: only(CFG, { recipes: pick(CFG.recipes, [7001, 3038]) }), obs: emptyObs() });
  assert.deepEqual(ck.excluded.map((e) => e.id), ['3038'], 'no Config_FurnitureCook allows recipe 3038');
  const tpl = items.evaluate({ cfg: only(CFG, { items: pick(CFG.items, [2100, 2114]) }), obs: emptyObs() });
  assert.deepEqual(tpl.excluded.map((e) => e.id), ['2100'], 'the timed-food template (通用读条食品模板) is a development entry');
  const cr = crafting.evaluate({ cfg: only(CFG, { crafts: pick(CFG.crafts, [1, 12, 19, 200]) }), obs: emptyObs() });
  assert.deepEqual(cr.excluded.map((e) => e.id).sort(), ['12', '19', '200'], 'IsUseable false, and a test recipe; nothing read from the sim');
  assert.match(String(cr.excluded.find((e) => e.id === '12')?.why), /IsUseable is false/);
});

test('furniture scope comes from the config alone: stand-ins, placeholders and unnamed rows out, every other row in a class', () => {
  const sc = furnitureScope(CFG);
  const why = (/** @type {number} */ id) => sc.get(id)?.excluded || '';
  for (const id of [118, 119, 121]) assert.match(why(id), /development entry/, `${id}: a builder's stand-in (占位)`);
  assert.equal(why(9178), 'the config gives it no name');
  for (const id of [80000, 80001, 80002, 80003, 80004]) assert.match(why(id), /stand-in model P_WoodBox_02/);
  assert.equal(sc.get(204)?.excluded, null, "204's 占位最大 means it takes up space, not a stand-in");
  const cls = (/** @type {number} */ id) => sc.get(id)?.cls;
  // the auditor's stratified sample: workbenches, floor unlocks, home fixtures, original home furniture
  for (const id of [313, 80033, 405, 9075, 80057, 879, 213, 310, 369, 80201, 200, 80028, 1, 2, 3, 201, 871, 872, 80011]) assert.ok(cls(id), `${id} is in scope`);
  assert.equal(cls(313), 'home');
  assert.equal(cls(66014), 'site', 'a hospital medicine cabinet with a loot group');
  assert.equal(cls(107), 'site', 'a not-for-sale (非卖品) shop fixture despite its slot');
  assert.equal(cls(392), 'decor');
  const excluded = [...sc.values()].filter((v) => v.excluded).length;
  const fam = furniture.evaluate({ cfg: CFG, obs: emptyObs(), manifests: { files: [], assets: new Map(), bindings: new Map(), problems: [] } });
  assert.equal(fam.total, Object.keys(CFG.furniture).length);
  assert.equal(fam.excluded.length, excluded, 'no observation changes the denominator');
  assert.equal(fam.scope, fam.total - excluded);
});

test('function scope: every named non-development function, prototypes and the planning-mode install out by stated rules', () => {
  const off = offeredFuncs(CFG);
  const why = (/** @type {number} */ id) => funcExcluded(CFG, CFG.funcs[id], off) || '';
  for (const id of [3, 7, 8, 9, 10, 11, 12, 13]) assert.match(why(id), /prototype function/);
  assert.match(why(298), /planning-mode Install/);
  for (const id of [101, 102, 103, 104, 105, 106, 107, 108, 109]) assert.match(why(id), /offered only by development furniture/);
  for (const id of [305, 2102, 2104]) assert.match(why(id), /no name and no Config_Furniture row offers it/);
  for (const id of [1652, 1653, 1607, 1609, 1619, 1710, 223, 1701, 1702, 1778, 80013, 242, 1102, 1103, 1104, 1106, 1504, 1604, 1727, 1728, 2101, 300, 42]) assert.equal(why(id), '', `${id} is live and in scope`);
});

test('items probe passes an item a shop sells and the survivor can eat and cook', async () => {
  const obs = merged(await shops({ characters: ['wage'], seeds: 1 }), await itemuse({ items: [2114] }));
  const fam = items.evaluate({ cfg: only(CFG, { items: pick(CFG.items, [2114]) }), obs });
  const e = entity(fam, 2114);
  assert.equal(e.checks.obtain.ok, true, e.checks.obtain.detail);
  assert.match(String(e.checks.obtain.detail), /shop:/);
  assert.equal(e.checks.use.ok, true, e.checks.use.detail);
  assert.deepEqual(expectedUses(CFG.items)[2114], ['eat', 'cook']);
  assert.equal(fam.pct, 100);
});

test('items probe fails an item nothing hands over, and a burnable story book no stove will burn', async () => {
  const ghost = { ...CFG.items[2114], id: 999001 };
  const obs = merged(await starter({ characters: ['wage'] }), await itemuse({ items: [3001] }));
  const fam = items.evaluate({ cfg: only(CFG, { items: { 999001: ghost, 3001: CFG.items[3001] } }), obs });
  const g = entity(fam, 999001);
  assert.equal(g.checks.obtain.ok, false);
  assert.equal(g.checks.use.ok, false, 'never probed');
  const book = entity(fam, 3001);
  assert.equal(book.checks.use.ok, false);
  assert.match(String(book.checks.use.detail), /fuel/);
  assert.equal(fam.ok, 0);
  assert.deepEqual(g.rows?.obtain, ['G01'], 'a plain food reopens the foods row');
  assert.deepEqual(book.rows?.use, ['G04', 'P16'], 'a story document that will not burn reopens fuels and the clue documents');
});

test('item uses the item menu cannot run: a record placed on the player, a spray disinfecting, a keepsake a post buys', async () => {
  const obs = await itemuse({ items: [11014, 2164, 20202] });
  const fam = items.evaluate({ cfg: only(CFG, { items: pick(CFG.items, [11014, 2164, 20202, 31002]) }), obs });
  assert.deepEqual(expectedUses(CFG.items)[11014], ['place']);
  assert.deepEqual(expectedUses(CFG.items)[2164], ['disinfect']);
  assert.deepEqual(expectedUses(CFG.items)[20202], ['trade']);
  for (const id of [11014, 2164, 20202]) assert.equal(entity(fam, id).checks.use.ok, true, `${id}: ${entity(fam, id).checks.use.detail}`);
  assert.equal(entity(fam, 31002).checks.use, undefined, 'the config gives a gold bar no use: no use check, and it is listed');
  assert.ok(fam.notes.some((n) => n.includes('31002')));
});

test('item uses the item menu cannot run fail when no probe shows them', async () => {
  const obs = await itemuse({ items: [2114] });
  const ghosts = { 999011: { ...CFG.items[11014], id: 999011 }, 999012: { ...CFG.items[2164], id: 999012 }, 999013: { ...CFG.items[20202], id: 999013 } };
  const fam = items.evaluate({ cfg: only(CFG, { items: ghosts }), obs });
  for (const id of [999011, 999012, 999013]) assert.equal(entity(fam, id).checks.use.ok, false, `${id} has a use no probe showed`);
  assert.match(String(entity(fam, 999011).checks.use.detail), /^place:/);
  assert.match(String(entity(fam, 999012).checks.use.detail), /^disinfect:/);
  assert.match(String(entity(fam, 999013).checks.use.detail), /^trade:/);
});

test('furniture probe passes a starter stove with a model of its own', async () => {
  const obs = merged(await furnitureDriver({ furniture: [801], characters: ['wage'] }), await scenes({}));
  const man = { files: ['assets/furniture/manifest.json'], assets: new Map([['furniture/fuel-stove', { id: 'furniture/fuel-stove', kind: 'model' }]]), bindings: new Map([['801', { asset: 'furniture/fuel-stove', file: 'x' }]]), problems: [] };
  const fam = furniture.evaluate({ cfg: only(CFG, { furniture: pick(CFG.furniture, [801]) }), obs, manifests: man });
  const e = entity(fam, 801);
  for (const k of ['obtain', 'install', 'functions', 'render']) assert.equal(e.checks[k].ok, true, `${k}: ${e.checks[k].detail}`);
  assert.match(String(e.checks.render.detail), /own model/);
});

test('furniture probe fails a piece whose function the survivor cannot reach, no model, and a package nobody obtained', async () => {
  const obs = merged(await furnitureDriver({ furniture: [42013], characters: ['warehouse'] }), await furnitureDriver({ furniture: [42000], characters: ['wage'] }), await scenes({}));
  const none = { files: [], assets: new Map(), bindings: new Map(), problems: [] };
  const fam = furniture.evaluate({ cfg: only(CFG, { furniture: pick(CFG.furniture, [42013, 42000]) }), obs, manifests: none });
  const veteran = entity(fam, 42013); // the trapped veteran the sim places in the warehouse yard (BUG-0003: reached)
  assert.equal(veteran.checks.functions.ok, true, veteran.checks.functions.detail);
  // no asset manifest binds him, but the 3D renderer draws him with his family's builder
  assert.equal(veteran.checks.render.ok, true, veteran.checks.render.detail);
  assert.match(String(veteran.checks.render.detail), /3D renderer's '\w+' builder/);
  // a piece no family knows gets only the placeholder box, and render fails
  // (the telescope 324 is known by its name alone; renamed, nothing knows it)
  const nameless = { ...CFG.furniture[324], zh: '无人认得的东西' };
  const odd = furniture.evaluate({ cfg: only(CFG, { furniture: { 324: nameless } }), obs, manifests: none });
  assert.equal(entity(odd, 324).checks.render.ok, false, entity(odd, 324).checks.render.detail);
  assert.match(String(entity(odd, 324).checks.render.detail), /placeholder box/);
  const generator = entity(fam, 42000); // a package item, but no driver in this fixture obtains it
  assert.equal(generator.checks.install.ok, true);
  assert.equal(generator.checks.obtain.ok, false, generator.checks.obtain.detail);

  // the same veteran placed off the warehouse's grid, where no tile reaches him: his function fails
  const S = await loadSim();
  const tile = S.people.VETERAN.tile;
  const at = { ...tile };
  Object.assign(tile, { x: 40, y: 40 });
  try {
    const off = merged(await furnitureDriver({ furniture: [42013], characters: ['warehouse'] }), await scenes({}));
    const lost = entity(furniture.evaluate({ cfg: only(CFG, { furniture: pick(CFG.furniture, [42013]) }), obs: off, manifests: none }), 42013);
    assert.equal(lost.checks.functions.ok, false);
    assert.match(String(lost.checks.functions.detail), /1791: .*Cannot reach/);
  } finally {
    Object.assign(tile, at);
  }
});

test('furniture probe: a solar panel installs on a terrace, and fails in the Warehouse Manager\'s home, which has none', async () => {
  const cfg = only(CFG, { furniture: pick(CFG.furniture, [40000]) });
  const none = { files: [], assets: new Map(), bindings: new Map(), problems: [] };
  const warehouse = furniture.evaluate({ cfg, obs: merged(await furnitureDriver({ furniture: [40000], characters: ['warehouse'] }), await scenes({})), manifests: none });
  const e = entity(warehouse, 40000);
  assert.equal(e.checks.install.ok, false);
  assert.match(String(e.checks.install.detail), /outdoorOnly/);
  const wage = furniture.evaluate({ cfg, obs: merged(await furnitureDriver({ furniture: [40000], characters: ['wage'] }), await scenes({})), manifests: none });
  assert.equal(entity(wage, 40000).checks.install.ok, true);
});

test('site pieces: functions run where the piece stands, loot must hand out items; unreachable fixtures fail', async () => {
  const obs = merged(await sitefx({ sites: ['hardware', 'office'], seeds: 2 }), await scenes({}));
  const none = { files: [], assets: new Map(), bindings: new Map(), problems: [] };
  const fam = furniture.evaluate({ cfg: only(CFG, { furniture: pick(CFG.furniture, [66035, 66055, 67171, 42038]) }), obs, manifests: none });
  const cabinet = entity(fam, 66035); // a hardware-store container with a loot group and Take Supplies (1101)
  assert.equal(cabinet.checks.placed.ok, true, cabinet.checks.placed.detail);
  assert.equal(cabinet.checks.functions.ok, true, cabinet.checks.functions.detail);
  assert.equal(cabinet.checks.obtain, undefined, 'a site piece is not obtained');
  assert.equal(entity(fam, 66055).checks.functions.ok, true, 'Clear Away (1733) clears the obstacle');
  // the executive suite's safe and couch sit behind a second barricade: the probe clears the one it can reach first
  assert.equal(entity(fam, 67171).checks.functions.ok, true, entity(fam, 67171).checks.functions.detail);
  assert.doesNotMatch(String(entity(fam, 42038).checks.functions.detail), /cannot reach/i, 'the suite’s old sofa is reached (resting there hands out nothing, which its Search 1721 should)');

  // the same office with the suite bricked up (a wall where its barricade stands): its pieces are out of reach
  const S = await loadSim();
  const office = S.sites.SITE_BY_ID.office;
  const [bx, by] = [19, 5];
  assert.equal(office.map[by][bx], 'X', 'the suite barricade');
  const sealed = { ...office, id: 'sealedOffice', map: office.map.map((/** @type {string} */ row, /** @type {number} */ y) => (y === by ? `${row.slice(0, bx)}#${row.slice(bx + 1)}` : row)) };
  S.sites.SITES.push(sealed);
  S.sites.SITE_BY_ID.sealedOffice = sealed;
  try {
    const cut = furniture.evaluate({ cfg: only(CFG, { furniture: pick(CFG.furniture, [67171, 42038]) }), obs: await sitefx({ sites: ['sealedOffice'], seeds: 1 }), manifests: none });
    const locked = entity(cut, 67171);
    assert.equal(locked.checks.functions.ok, false);
    assert.match(String(locked.checks.functions.detail), /cannot reach/i);
    assert.match(String(entity(cut, 42038).checks.functions.detail), /cannot reach/i);
  } finally {
    S.sites.SITES.splice(S.sites.SITES.indexOf(sealed), 1);
    delete S.sites.SITE_BY_ID.sealedOffice;
  }
});

test('shop pieces: the car lot sells a car and the black market takes blood; the forklift is not for sale', async () => {
  const obs = merged(await shops({ characters: ['wage'], seeds: 1 }), await scenes({}));
  const none = { files: [], assets: new Map(), bindings: new Map(), problems: [] };
  const fam = furniture.evaluate({ cfg: only(CFG, { furniture: pick(CFG.furniture, [42033, 80010, 42032]) }), obs, manifests: none });
  for (const id of [42033, 80010]) assert.equal(entity(fam, id).checks.functions.ok, true, `${id}: ${entity(fam, id).checks.functions.detail}`);
  const forklift = entity(fam, 42032);
  assert.equal(forklift.checks.placed.ok, true);
  assert.equal(forklift.checks.functions.ok, false, 'Buy Vehicle (1651) on a fixture the shop refuses');
  assert.match(String(forklift.checks.functions.detail), /needs car/);
});

test('being placed is a check that can fail: pieces nothing places stay in scope and fail, a placed decoration passes', () => {
  const none = { files: [], assets: new Map(), bindings: new Map(), problems: [] };
  const cfg = only(CFG, { furniture: pick(CFG.furniture, [66014, 313, 392]) });
  const fam = furniture.evaluate({ cfg, obs: emptyObs(), manifests: none });
  assert.equal(fam.scope, 3, 'nothing is left out for want of a placement');
  assert.equal(entity(fam, 66014).checks.placed.ok, false);
  assert.match(String(entity(fam, 66014).checks.functions.detail), /loot group 8151/);
  assert.equal(entity(fam, 313).checks.obtain.ok, false, 'a workbench no home places and no package hands out');
  assert.equal(entity(fam, 392).checks.placed.ok, false);
  assert.equal(entity(fam, 392).checks.functions, undefined, 'decoration has no functions to run');
  const placed = furniture.evaluate({ cfg, obs: { ...emptyObs(), results: { scenes: { 392: ['site:school'] } } }, manifests: none });
  assert.equal(entity(placed, 392).checks.placed.ok, true);
});

test('string stand-ins in the homes place no config piece and are named in the report', async () => {
  const S = await loadSim();
  // the homes place Config_Furniture ids only (the workbench is 313 / 80033 / 405, the radio 213 / 80016 / 407)
  const clean = await scenes({});
  assert.deepEqual(clean.results.standIns || {}, {}, 'no home places a string stand-in');
  for (const id of [313, 80033, 405, 213, 80016, 407]) assert.ok(clean.results.scenes[id]?.some((/** @type {string} */ w) => w.startsWith('home:')), `${id} stands in a home`);
  // a stand-in, should a home place one again, places no config piece and is named in the report
  const starter = S.homes.HOMES.apartment.starter;
  starter.push({ slot: '1F:r2', furn: 'workbench' });
  let obs;
  try {
    obs = await scenes({});
  } finally {
    starter.pop();
  }
  assert.ok(obs.results.standIns.workbench, "a home placing 'workbench' is recorded as a stand-in");
  const fam = furniture.evaluate({ cfg: only(CFG, { furniture: pick(CFG.furniture, [801]) }), obs, manifests: { files: [], assets: new Map(), bindings: new Map(), problems: [] } });
  assert.ok(fam.notes.some((n) => /string stand-ins place no config piece: .*workbench/.test(n)));
});

test('render binding: a family model needs a variant of its own per piece', () => {
  const asset = { id: 'furniture/shelf', kind: 'model', variants: { a: {}, b: {} } };
  const man = (/** @type {[string, any][]} */ b) => ({ files: ['m'], assets: new Map([['furniture/shelf', asset]]), bindings: new Map(b), problems: [] });
  assert.equal(renderBinding(man([['10000', { asset: 'furniture/shelf', variant: 'a' }], ['10001', { asset: 'furniture/shelf', variant: 'b' }]]), 10000).ok, true);
  assert.equal(renderBinding(man([['10000', { asset: 'furniture/shelf' }], ['10001', { asset: 'furniture/shelf', variant: 'b' }]]), 10000).ok, false);
  assert.equal(renderBinding(man([['10000', { asset: 'furniture/shelf', variant: 'a' }], ['10001', { asset: 'furniture/shelf', variant: 'a' }]]), 10001).ok, false);
  assert.equal(renderBinding(man([]), 10000).ok, false);
});

test('asset manifests: conforming bindings are read, a broken manifest is a problem', () => {
  const root = mkdtempSync(join(tmpdir(), 'coverage-assets-'));
  try {
    mkdirSync(join(root, 'assets/furniture/stove'), { recursive: true });
    mkdirSync(join(root, 'assets/props'), { recursive: true });
    writeFileSync(join(root, 'assets/furniture/stove/stove.glb'), 'glb');
    const good = { schema: 'survival-logs/asset-manifest@1', assets: [{ id: 'furniture/stove', kind: 'model', path: 'assets/furniture/stove/stove.glb', license: 'LicenseRef-Original' }], bindings: { 801: { asset: 'furniture/stove' } } };
    writeFileSync(join(root, 'assets/furniture/manifest.json'), JSON.stringify(good));
    writeFileSync(join(root, 'assets/props/manifest.json'), JSON.stringify({ schema: 'nope', assets: [] }));
    const man = readManifests(root);
    assert.deepEqual(man.files, ['assets/furniture/manifest.json', 'assets/props/manifest.json']);
    assert.equal(renderBinding(man, 801).ok, true);
    assert.ok(man.problems.some((p) => p.startsWith('assets/props/manifest.json: schema')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Config rows for functions the sim has no spec for, added to the sim's own table for one test. The config once had
// real ones (the Construction Shop, 53; Take Supplies, 1101, and Search, 1726, with only the stamina stub their preview
// derives despite a reward and a loot action); since those got specs, the probe's failures are shown on copies.
const BARE_FUNCS = {
  999201: { ...CFG.funcs[53], id: 999201 },
  999202: { ...CFG.funcs[1101], id: 999202 },
  999203: { ...CFG.funcs[1726], id: 999203 },
};

/** Run fn with BARE_FUNCS in the sim's function table (and the config's). @param {() => Promise<void>} fn */
async function withBareFuncs(fn) {
  const S = await loadSim();
  const ids = Object.keys(BARE_FUNCS).map(Number);
  try {
    for (const id of ids) S.db.funcs[id] = BARE_FUNCS[/** @type {999201} */ (id)];
    await fn();
  } finally {
    for (const id of ids) delete S.db.funcs[id];
  }
}

test('furniture functions probe passes a function with a spec and a test, fails one with neither', async () => {
  await withBareFuncs(async () => {
    const obs = await specs({ funcs: [2, 999201] });
    /** @type {import('../tools/coverage/trace.mjs').Trace} */
    const trace = { files: 1, tests: ['tests/x.test.js › sleeps'], func: { 2: ['tests/x.test.js › sleeps'] }, achievement: {}, undriven: {}, results: { passed: 1, failed: 0 }, problems: [] };
    const fam = funcs.evaluate({ cfg: only(CFG, { funcs: { ...pick(CFG.funcs, [2]), ...pick(BARE_FUNCS, [999201]) } }), obs, trace });
    const sleep = entity(fam, 2);
    assert.equal(sleep.ok, true, JSON.stringify(sleep.checks));
    const bare = entity(fam, 999201); // a Construction Shop copy: no spec, no preview
    assert.equal(bare.checks.spec.ok, false);
    assert.equal(bare.checks.test.ok, false);
  });
});

test('function spec: a preview stub passes only without reward or loot; a loot function must hand out items', async () => {
  await withBareFuncs(async () => {
    const stubs = await specs({ funcs: [999202, 999203] });
    const bare = funcs.evaluate({ cfg: only(CFG, { funcs: pick(BARE_FUNCS, [999202, 999203]) }), obs: stubs, trace: null });
    for (const id of [999202, 999203]) {
      assert.equal(stubs.results.funcs[id].spec, 'preview');
      assert.equal(entity(bare, id).checks.spec.ok, false, `${id} has a config reward and a loot action`);
      assert.match(String(entity(bare, id).checks.spec.detail), /stamina stub.*reward 9101/);
    }
  });
  const obs = merged(await specs({ funcs: [401, 1101, 1726] }), await sitefx({ sites: ['hardware'], seeds: 2 }));
  const fam = funcs.evaluate({ cfg: only(CFG, { funcs: pick(CFG.funcs, [401, 1101, 1726]) }), obs, trace: null });
  assert.equal(obs.results.funcs[401].spec, 'preview');
  assert.equal(entity(fam, 401).checks.spec.ok, true, 'no reward, no loot: the stamina stub is its spec');
  for (const id of [1101, 1726]) {
    assert.equal(obs.results.funcs[id].spec, 'funcSpecs', `${id}: a loot spec of its own`);
    assert.equal(entity(fam, id).checks.spec.ok, true, String(entity(fam, id).checks.spec.detail));
  }
  assert.equal(entity(fam, 1101).checks.loot.ok, true, entity(fam, 1101).checks.loot.detail);
  assert.match(String(entity(fam, 1101).checks.loot.detail), /site:hardware/);
  const nothing = funcs.evaluate({ cfg: only(CFG, { funcs: pick(CFG.funcs, [1101]) }), obs: emptyObs(), trace: null });
  assert.equal(entity(nothing, 1101).checks.loot.ok, false, 'no probe saw items come out');
  assert.equal(entity(fam, 401).checks.loot, undefined, 'not a loot function');
});

test('cooking probe cooks a tag-combo stew into all four quality outputs', async () => {
  const obs = await cookingDriver({ recipes: [7001] });
  const fam = cooking.evaluate({ cfg: only(CFG, { recipes: pick(CFG.recipes, [7001]) }), obs });
  const e = entity(fam, 7001);
  assert.equal(e.ok, true, JSON.stringify(e.checks));
  assert.deepEqual(Object.values(obs.results.cooking[7001].outputs).sort(), [...CFG.recipes[7001].out].sort());
});

// Config rows for recipes the game cannot cook, added to the sim's own tables for one test. The config once had real
// ones (2006 did not fit the 6 × 4 pot, BUG-0005; every set for 6002 made another dish, BUG-0006); since those were
// fixed, the probe's failures are shown on these: two 6 × 5 suckling pigs (2320) in one pot, and a single-meat tag
// dish that the sim's recipe index never matches (every candidate set makes another dish).
const UNCOOKABLE = {
  999101: { id: 999101, zh: '两头乳猪', tags: [], items: [2320, 2320], out: [12073, 12074, 12075, 12076], tier: 0, q: [0, 30, 70, 90], minLv: 1, time: 9000, satStd: 32, exp: 50, showLv: 0, craftLv: 1, discExp: 75 },
  999102: { id: 999102, zh: '无法匹配的烤肉', tags: [2], items: [], out: [60005, 60006, 60007, 60008], tier: 1, q: [0, 30, 70, 90], minLv: 1, time: 9000, satStd: 40, exp: 50, showLv: 2, craftLv: 1, discExp: 75 },
};

test('cooking probe fails a recipe whose ingredients do not fit the pot, and one another dish shadows', async () => {
  const S = await loadSim();
  const ids = Object.keys(UNCOOKABLE).map(Number);
  const normal = CFG.cookers.filter((c) => c.CookMode === 0 && (c.AllowedRecipes || []).includes(4012));
  assert.ok(normal.length, 'cookers that roast a suckling pig');
  try {
    for (const id of ids) S.db.recipes[id] = UNCOOKABLE[/** @type {999101 | 999102} */ (id)];
    for (const c of normal) {
      c.AllowedRecipes.push(...ids);
      for (const id of ids) S.cooking.allowedRecipes(c).add(id);
    }
    const obs = await cookingDriver({ recipes: ids });
    const fam = cooking.evaluate({ cfg: only(CFG, { recipes: pick(CFG.recipes, ids) }), obs });
    assert.match(String(entity(fam, 999101).checks.cook.detail), /room in the pot/);
    assert.match(String(entity(fam, 999102).checks.cook.detail), /makes another dish/);
    assert.equal(fam.ok, 0);
  } finally {
    for (const id of ids) delete S.db.recipes[id];
    for (const c of normal) {
      c.AllowedRecipes = c.AllowedRecipes.filter((/** @type {number} */ x) => !ids.includes(x));
      for (const id of ids) S.cooking.allowedRecipes(c).delete(id);
    }
  }
  // the two real recipes are cooked now (all four quality outputs of 2006; 6002 by a Lv1 cook)
  const real = await cookingDriver({ recipes: [2006, 6002] });
  const fixed = cooking.evaluate({ cfg: only(CFG, { recipes: pick(CFG.recipes, [2006, 6002]) }), obs: real });
  assert.equal(entity(fixed, 2006).ok, true, JSON.stringify(entity(fixed, 2006).checks));
  assert.equal(entity(fixed, 6002).checks.cook.ok, true, JSON.stringify(entity(fixed, 6002).checks));
});

test('crafting probe crafts cardboard end to end with its Perfect bonus', async () => {
  const obs = await craftingDriver({ crafts: [1] });
  const fam = crafting.evaluate({ cfg: only(CFG, { crafts: pick(CFG.crafts, [1]) }), obs });
  const e = entity(fam, 1);
  assert.equal(e.ok, true, JSON.stringify(e.checks));
});

test('crafting probe fails a recipe the sim has no row for, salvage no level reaches and a recipe only the probe could teach', async () => {
  const ghost = { ...CFG.crafts[1], id: 999004 };
  const obs = await craftingDriver({ crafts: [100, 416, 999004] });
  const fam = crafting.evaluate({ cfg: only(CFG, { crafts: { ...pick(CFG.crafts, [100, 416]), 999004: ghost } }), obs });
  assert.equal(entity(fam, 999004).checks.craft.ok, false);
  assert.equal(entity(fam, 100).checks.outputs.ok, false);
  assert.match(String(entity(fam, 100).checks.outputs.detail), /failure salvage never produced/);
  const press = entity(fam, 416);
  assert.equal(press.checks.craft.ok, true, 'it crafts once taught');
  assert.equal(press.checks.unlock.ok, false, 'no exploration ran in this fixture');
  const taught = crafting.evaluate({ cfg: only(CFG, { crafts: pick(CFG.crafts, [416]) }), obs: merged(obs, { ...emptyObs(), unlocks: { 416: ['explore:explore'] } }) });
  assert.equal(entity(taught, 416).checks.unlock.ok, true, 'an exploration find teaches it');
});

test('plants probe grows spinach from seed to every config output', async () => {
  const obs = await farming({ plants: [22] });
  const fam = plants.evaluate({ cfg: only(CFG, { plants: pick(CFG.plants, [22]) }), obs });
  const e = entity(fam, 22);
  assert.equal(e.ok, true, JSON.stringify(e.checks));
});

test('plants probe fails a plant with no seed item and Boston Ivy, which never withers', async () => {
  const seedless = { ...CFG.plants[22], id: 999003 };
  const obs = await farming({ plants: [38, 999003] });
  const fam = plants.evaluate({ cfg: only(CFG, { plants: { 38: CFG.plants[38], 999003: seedless } }), obs });
  assert.equal(entity(fam, 999003).checks.plant.ok, false);
  const ivy = entity(fam, 38);
  assert.equal(ivy.checks.harvest.ok, true, ivy.checks.harvest.detail);
  assert.match(String(ivy.checks.outputs.detail), /withered remains/);
});

test('achievements probe: earned in a test and a counter game code writes; fails without either', () => {
  const list = CFG.achievements.filter((a) => a.id === 1001 || a.id === 2102);
  /** @type {import('../tools/coverage/trace.mjs').Trace} */
  const trace = { files: 1, tests: ['t'], func: {}, achievement: { 1001: ['tests/a.test.js › days'] }, undriven: {}, results: { passed: 1, failed: 0 }, problems: [] };
  const keys = [{ ns: 'counters', key: 'cook.count', writes: [{ file: 'src/sim/cooking.js' }], writtenBy: [] }];
  const fam = achievements.evaluate({ cfg: only(CFG, { achievements: list }), trace, keys });
  assert.equal(entity(fam, 1001).ok, true);
  const home = entity(fam, 2102);
  assert.equal(home.checks.test.ok, false, 'no test earns it in this trace');
  assert.equal(home.checks.counter.ok, true);
  const testOnly = achievements.evaluate({ cfg: only(CFG, { achievements: list }), trace, keys: [{ ns: 'counters', key: 'cook.count', writes: [{ file: 'tests/cooking.test.js' }], writtenBy: [] }] });
  assert.equal(entity(testOnly, 2102).checks.counter.ok, false, 'a counter only a test writes is not earnable');
  const declared = achievements.evaluate({ cfg: only(CFG, { achievements: list }), trace, keys: [{ ns: 'counters', key: 'cook.count', writes: [], writtenBy: ['src/sim/cooking.js (cook)'] }] });
  assert.equal(entity(declared, 2102).checks.counter.ok, false, 'a writtenBy declaration is no write site');
  assert.match(String(entity(declared, 2102).checks.counter.detail), /no write site/);
});

test('achievements probe: an award on hand-set state the sim never advanced credits nothing', () => {
  const list = CFG.achievements.filter((a) => a.id === 1001);
  /** @type {import('../tools/coverage/trace.mjs').Trace} */
  const trace = { files: 1, tests: ['t'], func: {}, achievement: {}, undriven: { 1001: ['tests/a.test.js › sets the day'] }, results: { passed: 1, failed: 0 }, problems: [] };
  const fam = achievements.evaluate({ cfg: only(CFG, { achievements: list }), trace, keys: [] });
  assert.equal(entity(fam, 1001).checks.test.ok, false);
  assert.match(String(entity(fam, 1001).checks.test.detail), /hand-set state/);
});

test('traced test run: names the test that completes a furniture function and earns an achievement, and no other', async () => {
  const root = mkdtempSync(join(tmpdir(), 'coverage-trace-fixture-'));
  try {
    mkdirSync(join(root, 'tests'));
    const src = (/** @type {string} */ rel) => pathToFileURL(join(ROOT, rel)).href;
    writeFileSync(
      join(root, 'tests/fixture.test.js'),
      `import test from 'node:test';
import { newGame } from '${src('src/sim/state.js')}';
import { tick } from '${src('src/sim/tick.js')}';
import '${src('src/sim/furnActions.js')}';
import { startFurnitureFunction } from '${src('src/sim/furnActions.js')}';
import { homeFurniture } from '${src('src/sim/home.js')}';
import { checkAchievement, evaluateAchievements } from '${src('src/meta/achievements.js')}';
import { dayStartT } from '${src('src/sim/time.js')}';
const atDay2 = () => {
  const s = newGame({ seed: 3, skipPrologue: true });
  s.phase = 'post';
  s.clock.t = dayStartT(s.clock, 2) + 12 * 3600;
  s.run.day = 2;
  return s;
};
const lateDay1 = () => {
  const s = newGame({ seed: 3, skipPrologue: true });
  const at = dayStartT(s.clock, 1) + 23.5 * 3600;
  while (s.clock.t < at) tick(s, Math.min(3600, at - s.clock.t));
  return s;
};
test('naps on the bed and lives to day two', () => {
  const s = lateDay1();
  const bed = homeFurniture(s).find((f) => f.cfg === 20000);
  startFurnitureFunction(s, bed.uid, 1801);
  tick(s, 2 * 3600);
  evaluateAchievements(s, {}, 0);
});
test('sets day two by hand and awards', () => {
  evaluateAchievements(atDay2(), {}, 0);
});
test('asks the checker only', () => {
  const s = atDay2();
  tick(s, 60);
  if (!checkAchievement(1001, s, {})) throw new Error('day two should meet 1001');
});
test('does nothing', () => {});
`
    );
    const trace = await traceTests({ root, files: ['tests/fixture.test.js'] });
    assert.deepEqual(trace.problems, []);
    assert.equal(trace.tests.length, 4);
    const t = 'tests/fixture.test.js › naps on the bed and lives to day two';
    assert.deepEqual(trace.func[1801], [t]);
    assert.deepEqual(trace.achievement[1001], [t], 'awarded by the unlock path on the state the sim advanced; the checker alone credits nothing');
    assert.deepEqual(trace.undriven[1001], ['tests/fixture.test.js › sets day two by hand and awards']);
    assert.equal(trace.func[2], undefined, 'the bed was never slept in');
    assert.equal(trace.achievement[1002], undefined, 'day seven never came');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('patch notes: glued list items split into line items; headings name their section; URLs stay whole', () => {
  const text = [
    '######## 2026-08-12 | Patch',
    'Hello, survivors!Details below:【Settings & UI】Custom frame rate: You can set a cap.Feedback shortcut: press F7.Update DetailsUpgraded the drone camera',
    'Report here: https://forms.gle/AbCdEf12Good luck!',
  ].join('\n');
  const list = newsItems(text);
  assert.deepEqual(
    list.map((i) => i.text),
    ['Hello, survivors!', 'Details below:', 'Custom frame rate: You can set a cap.', 'Feedback shortcut: press F7.', 'Update Details', 'Upgraded the drone camera', 'Report here: https://forms.gle/AbCdEf12Good luck!']
  );
  assert.equal(list[2].section, 'Settings & UI');
  assert.equal(list[0].section, '');
  assert.match(list[0].id, /^2026-08-12-p00-[0-9a-f]{8}$/);
  assert.equal(newsItems(text)[3].id, list[3].id, 'ids are stable');
  const twice = newsItems(['######## 2026-02-14 | Update', 'Stay tuned!', '######## 2026-02-14 | Plan', 'Stay tuned!'].join('\n'));
  assert.notEqual(twice[0].id, twice[1].id, 'the same line in two same-day posts gets two ids');
});

test('patch-notes probe passes mapped and reasoned items, fails unmapped ones, unknown rows and bare reason codes', () => {
  const list = newsItems(['######## 2026-08-13 | U', 'Hello, survivors!Custom key binding: rebind keys.Map freeze fix: fixed.Save fix: fixed.Other fix: fixed.'].join('\n'));
  const [hello, keys, freeze, save, other] = list;
  const map = {
    schema: news.NEWS_MAP_SCHEMA,
    reasons: { greeting: 'A greeting, thanks or sign-off: no feature.' },
    items: { [hello.id]: { na: 'greeting' }, [keys.id]: { rows: ['A08'] }, [freeze.id]: { rows: ['Z99'] }, [save.id]: { na: 'crash' }, stale: { rows: ['A01'] } },
  };
  const fam = news.evaluate({ items: list, map, features: featureRows('| A08 | Settings | N:08-13 | ✅ | code | test |\n') });
  assert.equal(entity(fam, hello.id).ok, true);
  assert.equal(entity(fam, keys.id).ok, true);
  assert.match(String(entity(fam, freeze.id).checks.mapped.detail), /Z99/);
  assert.match(String(entity(fam, save.id).checks.mapped.detail), /no reason code/);
  assert.equal(entity(fam, other.id).checks.mapped.detail, 'not in the map');
  assert.ok(fam.notes.some((n) => /no line item any more/.test(n)), 'stale entries are reported');
  const reopened = news.evaluate({ items: list, map, features: featureRows('| A08 | Settings | N:08-13 | 🟨 | code | test |\n') });
  assert.equal(entity(reopened, keys.id).checks.mapped.ok, false, 'a line on a reopened row is not covered');
  assert.match(String(entity(reopened, keys.id).checks.mapped.detail), /A08 🟨/);
});

test('verdict: printed before P3, required from P3, and a crashed probe always fails', () => {
  const fam = cooking.evaluate({ cfg: only(CFG, { recipes: pick(CFG.recipes, [7001]) }), obs: emptyObs() });
  assert.equal(fam.pct, 0);
  assert.equal(verdict([fam], { phase: 0, problems: [], warnings: [] }).ok, true);
  const p3 = verdict([fam], { phase: 3, problems: [], warnings: [] });
  assert.equal(p3.ok, false);
  assert.equal(p3.required, true);
  assert.match(p3.problems[0], /P3 requires 100%/);
  assert.equal(verdict([fam], { phase: 0, problems: ['cooking crashed: boom'], warnings: [] }).ok, false);
  const none = cooking.evaluate({ cfg: only(CFG, { recipes: {} }), obs: emptyObs() });
  assert.equal(verdict([none], { phase: 3, problems: [], warnings: [] }).ok, true, 'nothing in scope is 100%');
  assert.deepEqual(p3.reopen, [
    { rows: ['G05', 'G03'], family: 'cooking', check: 'cook', ids: ['7001'] },
    { rows: ['G05'], family: 'cooking', check: 'outputs', ids: ['7001'] },
  ]);
});

test('planner: each family asks only for the drivers it reads', () => {
  const drivers = (/** @type {string[]} */ fams) => [...new Set(planTasks(CFG, fams).map((t) => t.driver))].sort();
  assert.deepEqual(drivers(['cooking']), ['cooking']);
  assert.deepEqual(drivers(['news']), []);
  assert.deepEqual(drivers(['funcs']), ['furniture', 'shops', 'sitefx', 'specs']);
  assert.ok(drivers(['furniture']).includes('sitefx') && drivers(['furniture']).includes('scenes'));
  const furn = planTasks(CFG, ['furniture']).filter((t) => t.driver === 'furniture').flatMap((t) => t.args.furniture);
  assert.equal(furn.length, [...furnitureScope(CFG).values()].filter((v) => !v.excluded).length, 'every piece in scope is planned');
  assert.ok(drivers(['items']).includes('shops') && drivers(['items']).includes('explore'));
  const cook = planTasks(CFG, ['cooking']).flatMap((t) => t.args.recipes);
  assert.equal(cook.length, Object.keys(CFG.recipes).length, 'every recipe is planned once');
});

test('CLI: --json prints one verdict line for the gate; --phase P3 turns gaps into a failure', () => {
  const r = spawnSync(process.execPath, ['tools/coverage.mjs', '--only', 'cooking', '--json'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.trim().split('\n');
  assert.equal(lines.length, 1);
  const v = JSON.parse(lines[0]);
  assert.equal(typeof v.ok, 'boolean');
  assert.equal(typeof v.summary, 'string');
  assert.ok(Array.isArray(v.problems));
  assert.deepEqual(v.families.map((/** @type {any} */ f) => f.id), ['cooking']);
  const p3 = spawnSync(process.execPath, ['tools/coverage.mjs', '--only', 'cooking', '--json', '--phase', 'P3'], { cwd: ROOT, encoding: 'utf8' });
  const v3 = JSON.parse(p3.stdout.trim());
  assert.equal(p3.status, v3.ok ? 0 : 1);
  assert.equal(v3.required, true);
  const bad = spawnSync(process.execPath, ['tools/coverage.mjs', '--only', 'nothing'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(bad.status, 2);
  assert.match(execFileSync(process.execPath, ['tools/coverage.mjs', '--help'], { cwd: ROOT, encoding: 'utf8' }), /--phase P3/);
});

const NO_MANIFESTS = { files: [], assets: new Map(), bindings: new Map(), problems: [] };

test('fix 1: shop and site pieces are told before the movable test; the storage box, the locker and home racks stay home', async () => {
  const sc = furnitureScope(CFG);
  const cls = (/** @type {number} */ id) => sc.get(id)?.cls;
  // shelves of the market (Market_), convenience store (SmallMarket) and hardware store (Tool_Store) and their box
  // piles, the post-disaster supermarket shelf, the building-materials pile and the school book pile: each has a slot
  // and Dismantle / Move, and still stands in a shop or a site
  const shopAndSite = [101, 102, 103, 104, 105, 106, 110, 111, 112, 113, 9132, 9133, 9134, 9135, 9136, 9137, 9140, 9141, 9142, 9143, 9144, 9145, 9146, 80125, 385, 390, 401, 9066];
  assert.equal(shopAndSite.length, 28);
  for (const id of shopAndSite) assert.equal(cls(id), 'site', `${id} (${CFG.furniture[id].res})`);
  // loot containers drawn with a home model that the player can neither dismantle nor move: site copies of home racks
  for (const id of [66061, 66065, 66085, 67155]) assert.equal(cls(id), 'site', `${id} (${CFG.furniture[id].res}, loot group ${CFG.furniture[id].loot})`);
  // the storage box and locker offer Shop and Take; the home racks 66061 / 66065 copy; plain cardboard boxes
  for (const id of [1, 4, 201, 202, 203, 114, 9138, 9139]) assert.equal(cls(id), 'home', `${id} (${CFG.furniture[id].res})`);
  // where the recreation's shops stand them, the shelves pass placed and their Shop function, with nothing to obtain
  const cfg = only(CFG, { furniture: pick(CFG.furniture, [101, 9132, 9140, 385]) });
  const fam = furniture.evaluate({ cfg, obs: merged(await shops({ characters: ['wage'], seeds: 1 }), await scenes({})), manifests: NO_MANIFESTS });
  for (const id of [101, 9132, 9140]) {
    const e = entity(fam, id);
    assert.equal(e.checks.obtain, undefined, `${id} is not obtained`);
    assert.equal(e.checks.install, undefined, `${id} is not installed`);
    assert.equal(e.checks.placed.ok, true, e.checks.placed.detail);
    assert.equal(e.checks.functions.ok, true, e.checks.functions.detail);
  }
  // placed nowhere they fail where they should stand, never for want of a home
  const unplaced = furniture.evaluate({ cfg, obs: emptyObs(), manifests: NO_MANIFESTS });
  for (const id of [101, 385]) {
    const e = entity(unplaced, id);
    assert.equal(e.checks.obtain, undefined);
    assert.equal(e.checks.placed.ok, false);
    assert.match(String(e.checks.functions.detail), /no probe placed it anywhere/);
  }
});

test('fix 2: a site or shop function works when the completed action carries its id; the act table is only the fallback', async () => {
  /** @param {number} piece @param {Record<string, any>} modes @param {string} [where] */
  const fn = (piece, modes, where = 'site:hospital') => {
    const obs = { ...emptyObs(), results: { fixtures: { [piece]: { where: [where], modes: { [where]: modes } } } } };
    return entity(furniture.evaluate({ cfg: only(CFG, { furniture: pick(CFG.furniture, [piece]) }), obs, manifests: NO_MANIFESTS }), piece).checks.functions;
  };
  // Recycle (1764, act 1943) on a hospital film viewer: the action names it
  assert.equal(fn(66005, { clear: { done: true, items: true, funcs: [1764] } }).ok, true);
  assert.match(String(fn(66005, { clear: { done: true, items: true, funcs: [1764] } }).detail), /1 work/);
  // no id: the fallback wants the prop taken apart with materials coming out
  assert.equal(fn(66005, { clear: { done: true, items: true } }).ok, true);
  const bare = fn(66005, { clear: { done: true, items: false } });
  assert.equal(bare.ok, false);
  assert.match(String(bare.detail), /1764: .*needs recycle/);
  assert.equal(fn(66005, { clear: { done: true, items: true, funcs: [1733] } }).ok, false, 'an action naming Clear Away (1733) is not Recycle');
  assert.equal(fn(66005, { clear: { done: false, items: false, funcs: [1764] } }).ok, false, 'an action that never completed');
  // a loot function named by the action still has to hand out items
  assert.equal(fn(66035, { search: { done: true, items: true, funcs: [1101] } }).ok, true);
  const empty = fn(66035, { search: { done: true, items: false, funcs: [1101] } });
  assert.equal(empty.ok, false);
  assert.match(String(empty.detail), /1101: .*no action ran 1101 handing out items/);
  // the fallback now maps Try Toilet (1711, act 1907), and the showroom sofa's rest is its try-out
  const toilet = fn(805, { trial: { done: true, items: false } }, 'shop:renovation');
  assert.equal(toilet.ok, false, 'its Search (1721) needs items');
  assert.match(String(toilet.detail), /^1 of 2: 1721: /);
  assert.equal(fn(812, { trial: { done: true, items: true } }, 'shop:renovation').ok, true);
  assert.match(String(fn(812, { trial: { done: true, items: false } }, 'shop:renovation').detail), /^1 of 2: 1721: /, 'its Rest (1714) is the try-out, its Search needs items');
  const obs = merged(await shops({ characters: ['wage'], seeds: 1 }), await scenes({}));
  const shop = furniture.evaluate({ cfg: only(CFG, { furniture: pick(CFG.furniture, [805, 812]) }), obs, manifests: NO_MANIFESTS });
  assert.doesNotMatch(String(entity(shop, 805).checks.functions.detail), /\b1711: /, 'the renovation showroom tries out its toilet');
  assert.equal(entity(shop, 812).checks.functions.ok, true, entity(shop, 812).checks.functions.detail);
  // the site driver records the function a completed action names
  const S = await loadSim();
  const tag = S.bus.on('actionDone', (/** @type {any} */ a) => {
    if (a?.kind === 'exploreSearch' && a.funcKey == null) a.funcKey = 1101;
  });
  let tagged;
  try {
    tagged = await sitefx({ sites: ['hardware'], seeds: 1 });
  } finally {
    tag();
  }
  const modes = Object.values(/** @type {Record<string, any>} */ (tagged.results.fixtures[66035].modes['site:hardware']));
  assert.ok(modes.some((m) => m.done && m.funcs?.includes(1101)), JSON.stringify(modes));
});

test('fix 3: an award the state met before the test first ticked it credits nothing; one the sim earned credits the test', async () => {
  const root = mkdtempSync(join(tmpdir(), 'coverage-baseline-fixture-'));
  try {
    mkdirSync(join(root, 'tests'));
    const src = (/** @type {string} */ rel) => pathToFileURL(join(ROOT, rel)).href;
    writeFileSync(
      join(root, 'tests/baseline.test.js'),
      `import test from 'node:test';
import { newGame } from '${src('src/sim/state.js')}';
import { tick } from '${src('src/sim/tick.js')}';
import '${src('src/sim/furnActions.js')}';
import { queuePlaceTrap, trapSlots } from '${src('src/sim/traps.js')}';
import { addItem } from '${src('src/sim/inventory.js')}';
import { evaluateAchievements } from '${src('src/meta/achievements.js')}';
import { dayStartT } from '${src('src/sim/time.js')}';
// through the outbreak to the hour, game code only
const post = (day, hour) => {
  const s = newGame({ seed: 5, skipPrologue: true });
  const at = dayStartT(s.clock, day) + hour * 3600;
  while (s.clock.t < at) tick(s, Math.min(3600, at - s.clock.t));
  return s;
};
test('lives into day two', () => {
  const s = post(1, 23);
  tick(s, 2 * 3600);
  evaluateAchievements(s, {}, 0);
});
test('sets day two by hand, ticks once and awards', () => {
  // a copy the test built: no game code left it, so only the first-tick snapshot can tell
  const s = structuredClone(newGame({ seed: 5, skipPrologue: true }));
  s.phase = 'post';
  s.clock.t = dayStartT(s.clock, 2) + 12 * 3600;
  s.run.day = 2;
  tick(s, 60);
  evaluateAchievements(s, {}, 0);
});
test('sets a trap', () => {
  const s = post(1, 20);
  const trap = addItem(s, s.inventories[s.player.backpack], 25001);
  queuePlaceTrap(s, trap.uid, trapSlots(s, '1F')[0].id);
  tick(s, 3600);
  evaluateAchievements(s, {}, 0);
});
test('sets the trap counter by hand, ticks once and awards', () => {
  const s = post(1, 20);
  s.progress.counters['trap.place'] = 1;
  tick(s, 60);
  evaluateAchievements(s, {}, 0);
});
test('sets the lifetime trap counter in the history by hand, ticks once and awards', () => {
  const s = post(1, 20);
  tick(s, 60);
  evaluateAchievements(s, { counters: { 'trap.place': 1 } }, 0);
});
`
    );
    // the live wiring awards on the game's global history (one process each: its evaluation runs after the test)
    /** @param {string} body */
    const live = (body) => `import test from 'node:test';
import { newGame } from '${src('src/sim/state.js')}';
import { tick } from '${src('src/sim/tick.js')}';
import '${src('src/sim/furnActions.js')}';
import { runEvaluation } from '${src('src/meta/achievements.js')}';
import { game } from '${src('src/game.js')}';
import { _resetStorage, loadHistory } from '${src('src/engine/save.js')}';
import { dayStartT } from '${src('src/sim/time.js')}';
// through the outbreak to the hour, game code only
const post = (day, hour) => {
  const s = newGame({ seed: 5, skipPrologue: true });
  const at = dayStartT(s.clock, day) + hour * 3600;
  while (s.clock.t < at) tick(s, Math.min(3600, at - s.clock.t));
  return s;
};
${body}
`;
    writeFileSync(join(root, 'tests/live-earned.test.js'), live(`test('lives into day two in the live game', () => {
  _resetStorage();
  game.history = loadHistory();
  game.state = post(1, 23);
  tick(game.state, 2 * 3600);
  runEvaluation();
});`));
    writeFileSync(join(root, 'tests/live-hand.test.js'), live(`test('writes an ending into the live history by hand, ticks once and evaluates', () => {
  _resetStorage();
  game.history = loadHistory();
  game.history.endings = { ...(game.history.endings || {}), girl: true };
  game.state = post(1, 20);
  tick(game.state, 60);
  runEvaluation();
});`));
    const trace = await traceTests({ root, files: ['tests/baseline.test.js', 'tests/live-earned.test.js', 'tests/live-hand.test.js'] });
    assert.deepEqual(trace.problems, []);
    const t = (/** @type {string} */ name) => `tests/baseline.test.js › ${name}`;
    assert.deepEqual(trace.achievement[1001], [t('lives into day two'), 'tests/live-earned.test.js › lives into day two in the live game'], 'the sim carried the state into Day 2');
    assert.deepEqual(trace.baseline?.[1001], [t('sets day two by hand, ticks once and awards')]);
    assert.deepEqual(trace.achievement[2107], [t('sets a trap')], 'Cage Setter from the counter the trap placement wrote and the run folded into the history');
    assert.deepEqual(trace.baseline?.[2107], [t('sets the lifetime trap counter in the history by hand, ticks once and awards')]);
    assert.deepEqual(trace.tainted?.[2107], [t('sets the trap counter by hand, ticks once and awards')], 'written by the test after newGame, before the first tick');
    assert.equal(trace.achievement[1102], undefined, 'an ending written into the live history by hand earns nothing');
    assert.deepEqual(trace.tainted?.[1102], ['tests/live-hand.test.js › writes an ending into the live history by hand, ticks once and evaluates'], 'written into the history loadHistory returned');
    const list = CFG.achievements.filter((a) => a.id === 1001 || a.id === 2107);
    const fam = achievements.evaluate({ cfg: only(CFG, { achievements: list }), trace, keys: [] });
    assert.equal(entity(fam, 1001).checks.test.ok, true);
    const hand = achievements.evaluate({ cfg: only(CFG, { achievements: list }), trace: { ...trace, achievement: {} }, keys: [] });
    assert.equal(entity(hand, 1001).checks.test.ok, false);
    assert.match(String(entity(hand, 1001).checks.test.detail), /met it before the sim advanced it/, 'Day 2 set by hand: the clock is no achievement field');
    assert.match(String(entity(hand, 2107).checks.test.detail), /wrote itself between game calls/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fix 4: loot functions no piece in scope offers get no loot check; a function only left-out furniture offers is left out', async () => {
  const ids = [1101, 1102, 1103, 1106, 1504, 1604];
  const fam = funcs.evaluate({ cfg: only(CFG, { funcs: pick(CFG.funcs, ids) }), obs: await specs({ funcs: ids }), trace: null });
  for (const id of [1102, 1103, 1106, 1504, 1604]) {
    const e = entity(fam, id);
    assert.equal(e.checks.loot, undefined, `${id}: no Config_Furniture row offers it, so no probe could run a loot check`);
    assert.ok(e.checks.spec && e.checks.test, `${id} still needs a spec and a test`);
  }
  assert.ok(fam.notes.some((n) => /no loot check for 5 loot function\(s\) .*1102, 1103, 1106, 1504, 1604/.test(n)));
  // an offered loot function keeps its loot check and fails it without evidence
  assert.equal(entity(fam, 1101).checks.loot.ok, false);
  // Admire the Work (243) is offered only by the stand-in crates 80000-80004, which the furniture family leaves out
  const why = funcExcluded(CFG, CFG.funcs[243], offeredFuncs(CFG)) || '';
  assert.match(why, /^offered only by furniture the furniture family leaves out \(80000, 80001, 80002, 80003, 80004: drawn with the stand-in model P_WoodBox_02/);
  // on a statue with a model of its own it would be in scope
  const cfg = only(CFG, { furniture: { ...CFG.furniture, 999243: { ...CFG.furniture[80000], id: 999243, res: 'P_Statue_001' } } });
  assert.equal(funcExcluded(cfg, CFG.funcs[243], offeredFuncs(cfg)), null);
});

test('fix 5: Force-Make Marker (42) is in scope by its visibility condition; the prototype block stays out', async () => {
  const off = offeredFuncs(CFG);
  assert.equal(CFG.funcs[42].vis, 1007);
  assert.equal(funcExcluded(CFG, CFG.funcs[42], off), null, 'no Config_Furniture row offers it, but the config wires it into the game');
  assert.match(funcExcluded(CFG, { ...CFG.funcs[42], id: 99, vis: 0 }, off) || '', /prototype function/, 'without a visibility condition it would be a prototype');
  const obs = await specs({ funcs: [42] });
  /** @type {import('../tools/coverage/trace.mjs').Trace} */
  const trace = { files: 1, tests: ['t'], func: { 42: ['tests/x.test.js › forces the marker'] }, achievement: {}, undriven: {}, results: { passed: 1, failed: 0 }, problems: [] };
  const cfg = only(CFG, { funcs: pick(CFG.funcs, [42]) });
  const fam = funcs.evaluate({ cfg, obs, trace });
  assert.equal(entity(fam, 42).checks.spec.ok, true, entity(fam, 42).checks.spec.detail);
  assert.equal(entity(fam, 42).ok, true);
  const untested = funcs.evaluate({ cfg, obs, trace: { ...trace, func: {} } });
  assert.equal(entity(untested, 42).checks.test.ok, false, 'no test completes it');
});

test('fix 7: the self-check reports every in-scope check no probe can pass as a tool problem; the game config has none', () => {
  assert.deepEqual(impossibleChecks(CFG, FAMILIES), [], 'every in-scope check can pass once the game does what its config says');
  // a plant no item sows, a dish only the hot-pot mode lists, a record named only by a function no piece offers
  const cfg = only(CFG, {
    plants: { 999003: { ...CFG.plants[22], id: 999003 } },
    recipes: { 999007: { ...CFG.recipes[7001], id: 999007 } },
    cookers: [{ ...CFG.cookers.filter((c) => c.CookMode === 1)[0], AllowedRecipes: [999007] }],
    items: { 999014: { ...CFG.items[11014], id: 999014, zh: '唱片《无人之曲》' } },
    funcs: { ...CFG.funcs, 999016: { ...CFG.funcs[80016], id: 999016, zh: '放上唱片《无人之曲》' } },
  });
  const found = impossibleChecks(cfg, ['items', 'cooking', 'plants']);
  const key = (/** @type {{ family: string, check: string, id: string }} */ x) => `${x.family}/${x.check} ${x.id}`;
  assert.deepEqual(found.map(key).sort(), ['cooking/cook 999007', 'cooking/outputs 999007', 'items/use 999014', 'plants/harvest 999003', 'plants/outputs 999003', 'plants/plant 999003']);
  assert.match(found.find((x) => x.family === 'items')?.why || '', /place: no furniture piece in scope offers a function that names it/);
  // a tool problem in every phase, listed in the report
  const v = verdict([], { phase: 0, problems: [], warnings: [], impossible: found });
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => /^tool: plants\/plant 999003 can never pass, even at full parity/.test(p)), v.problems.join('\n'));
  assert.match(table(v, { ms: 0, where: 'x' }), /Self-check: 6 in-scope check/);
  assert.match(markdown(v, [], { ms: 0, where: 'x', date: 'd', workers: 1, tasks: 0, trace: null, command: 'c' }), /## Self-check: checks no probe can pass\n[\s\S]*✖ cooking \/ cook: .* \(1\): 999007/);
  const clean = verdict([], { phase: 0, problems: [], warnings: [], impossible: [] });
  assert.equal(clean.ok, true);
  assert.match(markdown(clean, [], { ms: 0, where: 'x', date: 'd', workers: 1, tasks: 0, trace: null, command: 'c' }), /None: every in-scope check can pass/);
});

test('return 1, finding 1: an award on a state whose achievement fields the test wrote between game calls credits nothing', async () => {
  const root = mkdtempSync(join(tmpdir(), 'coverage-taint-fixture-'));
  try {
    mkdirSync(join(root, 'tests'));
    const src = (/** @type {string} */ rel) => pathToFileURL(join(ROOT, rel)).href;
    writeFileSync(
      join(root, 'tests/taint.test.js'),
      `import test from 'node:test';
import { newGame } from '${src('src/sim/state.js')}';
import { tick } from '${src('src/sim/tick.js')}';
import '${src('src/sim/furnActions.js')}';
import { placeTrap, trapSlots } from '${src('src/sim/traps.js')}';
import { evaluateAchievements } from '${src('src/meta/achievements.js')}';
import { dayStartT } from '${src('src/sim/time.js')}';
// through the outbreak to the hour, game code only
const post = (day, hour) => {
  const s = newGame({ seed: 5, skipPrologue: true });
  const at = dayStartT(s.clock, day) + hour * 3600;
  while (s.clock.t < at) tick(s, Math.min(3600, at - s.clock.t));
  return s;
};
test('ticks, writes the trap counter by hand and awards', () => {
  const s = post(1, 20);
  tick(s, 60);
  s.progress.counters['trap.place'] = 1;
  evaluateAchievements(s, {}, 0);
});
test('ticks, sets a trap through game code and awards', () => {
  const s = post(1, 20);
  tick(s, 60);
  placeTrap(s, 25001, trapSlots(s, '1F')[0].id);
  evaluateAchievements(s, {}, 0);
});
test('writes a story tag by hand, then lives into day two', () => {
  const s = post(1, 23);
  tick(s, 60);
  s.story.tags.TAG_NEIGHBOR_RESCUE3_COMPLETE = true;
  tick(s, 2 * 3600);
  evaluateAchievements(s, {}, 0);
});
test('lives into day two', () => {
  const s = post(1, 23);
  tick(s, 2 * 3600);
  evaluateAchievements(s, {}, 0);
});
`
    );
    const trace = await traceTests({ root, files: ['tests/taint.test.js'] });
    assert.deepEqual(trace.problems, []);
    const t = (/** @type {string} */ name) => `tests/taint.test.js › ${name}`;
    assert.deepEqual(trace.tainted?.[2107], [t('ticks, writes the trap counter by hand and awards')], 'the tick-then-write-then-evaluate exploit');
    assert.deepEqual(trace.achievement[2107], [t('ticks, sets a trap through game code and awards')], 'a player action between ticks is game code');
    assert.deepEqual(trace.tainted?.[1001], [t('writes a story tag by hand, then lives into day two')], 'tainted for the rest of the test');
    assert.deepEqual(trace.achievement[1001], [t('lives into day two')]);
    const list = CFG.achievements.filter((a) => a.id === 2107);
    const fam = achievements.evaluate({ cfg: only(CFG, { achievements: list }), trace: { ...trace, achievement: {} }, keys: [] });
    assert.match(String(entity(fam, 2107).checks.test.detail), /wrote itself between game calls/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('return 1, finding 2: post-outbreak functions on pre-outbreak market freezers are shown unreachable, not required', async () => {
  const cfg = only(CFG, { furniture: pick(CFG.furniture, [102, 106, 107, 67092, 908]) });
  const obs = merged(await shops({ characters: ['wage'], seeds: 1 }), await scenes({}));
  const fam = furniture.evaluate({ cfg, obs, manifests: NO_MANIFESTS });
  for (const id of [102, 106]) {
    const e = entity(fam, id);
    assert.equal(e.checks.functions.ok, true, e.checks.functions.detail);
    assert.match(String(e.checks.functions.detail), /^1 work; 1722, 1723 unreachable \(a post-outbreak function on a pre-outbreak shop piece/);
  }
  assert.equal(entity(fam, 107).checks.functions, undefined, 'Take, Turn On/Off and Disinfect are all post-outbreak');
  assert.ok(fam.notes.some((n) => /shown to be unreachable.*: 102:1722, 102:1723, 106:1722, 106:1723, 107:1, 107:1722, 107:1723, 107:2006$/.test(n)), fam.notes.join('\n'));
  // a shop model reused inside the post-outbreak site block, and the post-outbreak supermarket's own freezer, keep theirs
  const none = furniture.evaluate({ cfg, obs: emptyObs(), manifests: NO_MANIFESTS });
  assert.match(String(entity(none, 67092).checks.functions.detail), /^1 of 1: 1733: /, 'Clear Away stays required');
  assert.equal(entity(none, 908).checks.functions.ok, false);
  const unreachable = Object.values(CFG.furniture).flatMap((f) => (f.funcs || []).filter((/** @type {number} */ k) => phaseUnreachable(CFG, f.id, k)).map((/** @type {number} */ k) => `${f.id}:${k}`));
  assert.deepEqual(unreachable, ['102:1722', '102:1723', '106:1722', '106:1723', '107:1', '107:1722', '107:1723', '107:2006']);
});

test('return 1, finding 3: the self-check builds its evidence through the phase rule and the tracer rules', () => {
  const { obs, trace } = fullParity(CFG);
  const modes = (/** @type {number} */ id) => Object.values(/** @type {Record<string, any>} */ (Object.values(obs.results.fixtures[id].modes)[0]));
  assert.deepEqual(modes(102)[0].funcs, [6], 'no evidence for the freezer switches the original cannot run');
  assert.deepEqual(modes(67092)[0].funcs, [1733]);
  assert.equal(Object.keys(trace.achievement).length, CFG.achievements.length);
  assert.deepEqual([trace.tainted, trace.baseline, trace.undriven], [{}, {}, {}]);
  // were the freezer switches still required, the self-check would name them
  const cfg = only(CFG, { furniture: { ...pick(CFG.furniture, [102]), 999102: { ...CFG.furniture[102], id: 999102, res: 'P_Freezer_002_S1_M04' } } });
  assert.deepEqual(impossibleChecks(cfg, ['furniture']), []);
  assert.equal(phaseUnreachable(cfg, 999102, 1722), null, 'the same freezer on a post-outbreak model: its switches can run');
});

test('return 1, finding 4: the funcKey path keeps the outcome its interaction needs', () => {
  /** @param {number} piece @param {Record<string, any>} modes */
  const fn = (piece, modes) => {
    const obs = { ...emptyObs(), results: { fixtures: { [piece]: { where: ['site:hospital'], modes: { 'site:hospital': modes } } } } };
    return entity(furniture.evaluate({ cfg: only(CFG, { furniture: pick(CFG.furniture, [piece]) }), obs, manifests: NO_MANIFESTS }), piece).checks.functions;
  };
  const bare = fn(66005, { clear: { done: true, items: false, funcs: [1764] } });
  assert.equal(bare.ok, false, 'Recycle named by the action, but no materials came out');
  assert.match(String(bare.detail), /1764: .*no action ran 1764 handing out items and it needs recycle/);
  assert.equal(fn(66005, { clear: { done: true, items: true, funcs: [1764] } }).ok, true);
  // pick and pry (the school safe's Unlock 1838, a loot function): completed and handing out items
  assert.equal(fn(67045, { pick: { done: true, items: false, funcs: [1838] }, search: { done: true, items: true } }).ok, false);
});

test('taint per field group: stats written by hand cost 2008 its credit, not Day 7; a tag written by hand costs a tag-reading award', async () => {
  const root = mkdtempSync(join(tmpdir(), 'coverage-groups-fixture-'));
  try {
    mkdirSync(join(root, 'tests'));
    const src = (/** @type {string} */ rel) => pathToFileURL(join(ROOT, rel)).href;
    writeFileSync(
      join(root, 'tests/groups.test.js'),
      `import test from 'node:test';
import { newGame } from '${src('src/sim/state.js')}';
import { tick } from '${src('src/sim/tick.js')}';
import '${src('src/sim/furnActions.js')}';
import { evaluateAchievements } from '${src('src/meta/achievements.js')}';
import { dayNumber } from '${src('src/sim/time.js')}';
// a week through the outbreak, game code only, with 'each' run by the test before every hour
const week = (each) => {
  const s = newGame({ seed: 5, skipPrologue: true });
  for (let i = 0; i < 24 * 8 && dayNumber(s.clock) < 8; i++) {
    each(s);
    tick(s, 3600);
  }
  evaluateAchievements(s, {}, 0);
};
const fed = (s) => Object.assign(s.player.stats, { sat: 90, sta: 95, mor: 90, life: 100 });
test('restores stats by hand for a week', () => week(fed));
test('restores stats and writes a story tag by hand for a week', () => week((s) => (fed(s), (s.story.tags.COVERAGE_HAND = true))));
test('restores stats and writes a run counter by hand for a week', () => week((s) => (fed(s), (s.progress.counters['coverage.hand'] = (s.progress.counters['coverage.hand'] || 0) + 1))));
`
    );
    const trace = await traceTests({ root, files: ['tests/groups.test.js'] });
    assert.deepEqual(trace.problems, []);
    const t = (/** @type {string} */ name) => `tests/groups.test.js › ${name}`;
    const stats = t('restores stats by hand for a week');
    const tag = t('restores stats and writes a story tag by hand for a week');
    const counter = t('restores stats and writes a run counter by hand for a week');
    assert.ok(trace.tainted?.[2008]?.includes(stats), 'all stats at 80: its condition reads the stats the test wrote');
    assert.equal(trace.achievement[2008], undefined);
    assert.ok(trace.achievement[1002]?.includes(stats), 'Day 7 reads the day the sim advanced, not the stats');
    assert.ok(trace.achievement[1002]?.includes(counter), 'nor run counters');
    assert.ok(trace.tainted?.[1002]?.includes(tag), 'days survived reads the story tags (the reckoning, the final wave)');
    assert.equal(groupsRead(1002, new Set())?.includes('stats'), false);
    assert.deepEqual(groupsRead(2008, new Set([2008])), null, 'a predicate of its own reads every group');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
