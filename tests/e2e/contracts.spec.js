// @ts-check
// The P0 contracts on their own (no browser): the renderer registry and its fallbacks, the camera projection, and the
// view and asset-manifest checks on passing and failing fixtures.
import { test, expect } from '@playwright/test';
import { registerRenderer, createRenderer, requestedRenderer, rendererEntries, isoToScreen, screenToIso, gpuBytes, textureBytes, renderTargetBytes, mipLevels, checkStats } from '../../src/contracts/render.js';
import { checkView, cellAt, CELL } from '../../src/contracts/view.js';
import { checkAssetManifest, assetPathProblem, assetUrl, ASSET_MANIFEST_SCHEMA, assetOutputs, rebuildOf, instanceSeed, resolveMaterials, modelVariant, SLOT_FOOTPRINTS } from '../../src/contracts/assets.js';
import { footprint } from '../../src/sim/scene.js';
import { SLOT } from '../../src/data/db.js';
import { CAMERA, CAMERA_SOURCES, cameraOffset, zoomFov } from '../../src/contracts/look.js';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

/** @returns {any} a stand-in renderer that records which entry built it */
const fakeRenderer = (/** @type {string} */ id) => ({ id, cam: { x: 0, y: 0, zoom: 1, follow: true }, hover: null, highlight: new Set() });
const canvas = /** @type {HTMLCanvasElement} */ (/** @type {unknown} */ ({}));

test('renderer registry: ?render picks an entry; unknown, unsupported and failing ones fall back to the default', { tag: '@smoke' }, () => {
  expect(requestedRenderer('?render=3D')).toBe('3d');
  expect(requestedRenderer(new URLSearchParams('render=2d&x=1'))).toBe('2d');
  expect(requestedRenderer('')).toBeNull();
  expect(requestedRenderer(undefined)).toBeNull();
  expect(() => createRenderer(canvas, '')).toThrow('no renderer registered');

  registerRenderer({ id: 'flat', label: 'Flat', isDefault: true, create: () => fakeRenderer('flat') });
  registerRenderer({ id: 'deep', label: 'Deep', create: () => fakeRenderer('deep') });
  registerRenderer({ id: 'nogpu', label: 'Needs a GPU', supported: () => false, create: () => fakeRenderer('nogpu') });
  registerRenderer({ id: 'broken', label: 'Throws', create: () => {
    throw new Error('no context');
  } });
  expect(rendererEntries().map((e) => e.id)).toEqual(['flat', 'deep', 'nogpu', 'broken']);
  expect(() => registerRenderer({ id: 'deep', label: 'again', create: () => fakeRenderer('x') })).toThrow('already registered');
  expect(() => registerRenderer({ id: 'other', label: 'second default', isDefault: true, create: () => fakeRenderer('x') })).toThrow("'flat' is");
  expect(() => registerRenderer({ id: 'Bad Id', label: 'bad', create: () => fakeRenderer('x') })).toThrow('lowercase');

  const warn = console.warn;
  const error = console.error;
  /** @type {string[]} */
  const said = [];
  console.warn = (/** @type {string} */ m) => said.push(`warn ${m}`);
  console.error = (/** @type {string} */ m) => said.push(`error ${m}`);
  try {
    const pick = (/** @type {string | null} */ search) => {
      const { id, renderer } = createRenderer(canvas, search);
      return `${id}:${/** @type {any} */ (renderer).id}`;
    };
    expect(pick(null)).toBe('flat:flat');
    expect(pick('?render=deep')).toBe('deep:deep');
    expect(pick('?render=missing')).toBe('flat:flat');
    expect(pick('?render=nogpu')).toBe('flat:flat');
    expect(pick('?render=broken')).toBe('flat:flat');
  } finally {
    console.warn = warn;
    console.error = error;
  }
  expect(said).toEqual([
    "warn ?render=missing: no such renderer (have flat, deep, nogpu, broken); using 'flat'",
    "warn ?render=nogpu: not supported on this device; using 'flat'",
    "error ?render=broken failed to start; using 'flat'",
  ]);
});

test('camera units: isoToScreen and screenToIso invert each other', { tag: '@smoke' }, () => {
  expect(isoToScreen(1, 0)).toEqual([32, 16]);
  expect(isoToScreen(0, 1)).toEqual([-32, 16]);
  for (const [x, y] of [[0, 0], [3.5, 7.25], [-2, 11], [13, 14]]) {
    const [bx, by] = screenToIso(...isoToScreen(x, y));
    expect(bx).toBeCloseTo(x, 9);
    expect(by).toBeCloseTo(y, 9);
  }
});

/** @returns {Record<string, any>} a minimal scene view that conforms */
function sceneView() {
  const w = 3;
  const h = 2;
  const cells = [CELL.WALL, CELL.DOOR, CELL.WALL, CELL.FLOOR, CELL.FLOOR, CELL.YARD];
  const floor = { id: '1F', w, h, innerH: 1, cells, rooms: [{ id: 'living', x: 0, y: 0, w: 3, h: 1, label: { en: 'Living Room', zh: '客厅' } }] };
  return {
    floor,
    floorId: '1F',
    furniture: [{ uid: 7, cfg: 'workbench', x: 1, y: 1, w: 2, h: 1, powered: false, data: { plant: { growth: 0.5 } } }],
    boxes: [{ id: 'box3', x: 0, y: 1 }, { x: 0.8, y: 0.95 }],
    entities: [{ x: 1.5, y: 1, kind: 'player', color: '#fff' }, { x: 2, y: 1, kind: 'zombie', hp: 30, maxHp: 60 }],
    clock: { t: 0, startHour: 8 },
    weather: { day: 1, kind: 'rain' },
    lightsOn: false,
    fires: [],
    slots: [{ x: 1, y: 1, w: 2, h: 1, free: true, valid: false }],
    roomAt: () => undefined,
    locked: () => false,
    floorsAvailable: ['1F'],
  };
}

test('checkView: conforming views pass; each broken field is named', { tag: '@smoke' }, () => {
  expect(checkView({ floor: null })).toEqual([]);
  expect(checkView(sceneView())).toEqual([]);
  expect(cellAt(sceneView().floor, 1, 0)).toBe(CELL.DOOR);
  expect(cellAt(sceneView().floor, 5, 0)).toBe(CELL.VOID);

  const broken = sceneView();
  broken.floor.cells = [1, 1];
  broken.entities[1].kind = 'ghost';
  broken.weather.kind = 'fog';
  broken.furniture[0].data.plant = { stage: 2 };
  delete broken.locked;
  broken.slots[0].valid = 'yes';
  expect(checkView(broken)).toEqual([
    'floor.cells: expected 6 tile codes',
    'furniture[0].data.plant: expected a crop summary with a growth number',
    "entities[1].kind: 'ghost' is not one of player, zombie, big, npc, raider",
    "weather.kind: 'fog' is not one of sunny, cloudy, rain, heavyRain, storm, snow, freezingRain, coldWave",
    'slots[0]: expected free and valid flags',
    'locked: expected a function (x, y)',
  ]);
  expect(checkView(null)).toEqual(['view: expected an object']);
});

/** @returns {Record<string, any>} */
function manifest() {
  return {
    schema: ASSET_MANIFEST_SCHEMA,
    wp: 'WP-P0-10',
    assets: [
      {
        id: 'furniture/sofa-fabric',
        kind: 'model',
        path: 'assets/furniture/sofa/sofa.glb',
        license: 'LicenseRef-Original',
        sources: ['ambientcg:Fabric030'],
        lods: [{ level: 1, path: 'assets/furniture/sofa/sofa.lod1.glb', triangles: 1200 }],
        variants: { broken: { path: 'assets/furniture/sofa/sofa-broken.glb' } },
        meta: { triangles: 4800 },
      },
      {
        id: 'materials/plaster-painted',
        kind: 'material',
        path: 'assets/materials/plaster-painted/',
        files: { baseColor: 'assets/materials/plaster-painted/albedo.ktx2', normal: 'assets/materials/plaster-painted/normal.ktx2' },
        license: 'CC0-1.0',
      },
    ],
    bindings: { 1001: { asset: 'furniture/sofa-fabric' }, 1002: { asset: 'furniture/sofa-fabric', variant: 'broken' } },
  };
}

test('checkAssetManifest: a conforming manifest passes; schema, ids, kinds, licenses, paths, LODs and bindings are checked', { tag: '@smoke' }, () => {
  expect(checkAssetManifest(manifest())).toEqual([]);
  const onDisk = new Set(['assets/furniture/sofa/sofa.glb']);
  expect(checkAssetManifest(manifest(), { exists: (p) => onDisk.has(p) || p.endsWith('/') })).toEqual([
    "assets[0] (furniture/sofa-fabric).lods[0].path: 'assets/furniture/sofa/sofa.lod1.glb' does not exist",
    "assets[0] (furniture/sofa-fabric).variants.broken.path: 'assets/furniture/sofa/sofa-broken.glb' does not exist",
    "assets[1] (materials/plaster-painted).files.baseColor: 'assets/materials/plaster-painted/albedo.ktx2' does not exist",
    "assets[1] (materials/plaster-painted).files.normal: 'assets/materials/plaster-painted/normal.ktx2' does not exist",
  ]);

  const m = manifest();
  m.schema = 'v0';
  m.assets[0].kind = 'mesh';
  m.assets[0].license = 'CC-BY-4.0';
  m.assets[0].lods = [{ level: 2, path: 'assets/furniture/sofa/a.glb' }, { level: 1, path: 'assets/furniture/sofa/b.glb' }];
  m.assets[1].path = 'assets/cache/plaster/';
  m.assets.push({ id: 'Sofa', kind: 'model', path: '/abs/sofa.glb', license: 'CC0-1.0' }, { ...m.assets[0] });
  m.bindings[1003] = { asset: 'furniture/armchair' };
  m.bindings[1004] = { asset: 'furniture/sofa-fabric', variant: 'burnt' };
  expect(checkAssetManifest(m)).toEqual([
    `schema: expected '${ASSET_MANIFEST_SCHEMA}', got "v0"`,
    "assets[0] (furniture/sofa-fabric).kind: 'mesh' is not one of model, character, animation, material, texture, lightmap, probe, icon, audio, lut, font",
    "assets[0] (furniture/sofa-fabric).license: 'CC-BY-4.0' is not one of CC0-1.0, LicenseRef-CMU-Mocap, LicenseRef-Sonniss-GDC, LicenseRef-Original, OFL-1.1",
    'assets[0] (furniture/sofa-fabric).lods[1]: levels must be integers counting up from 1',
    "assets[1] (materials/plaster-painted).path: 'assets/cache/plaster/' is under assets/cache/, which never ships",
    "assets[2] (Sofa).id: expected '<family>/<name>' in lowercase",
    "assets[2] (Sofa).path: '/abs/sofa.glb' must be a repo-relative POSIX path",
    'assets[3] (furniture/sofa-fabric).id: duplicate',
    "assets[3] (furniture/sofa-fabric).kind: 'mesh' is not one of model, character, animation, material, texture, lightmap, probe, icon, audio, lut, font",
    "assets[3] (furniture/sofa-fabric).license: 'CC-BY-4.0' is not one of CC0-1.0, LicenseRef-CMU-Mocap, LicenseRef-Sonniss-GDC, LicenseRef-Original, OFL-1.1",
    'assets[3] (furniture/sofa-fabric).lods[1]: levels must be integers counting up from 1',
    'bindings.1003: asset "furniture/armchair" is not in any manifest',
    "bindings.1004: 'furniture/sofa-fabric' has no variant 'burnt'",
  ]);
  const known = new Map([['furniture/armchair', /** @type {any} */ ({ id: 'furniture/armchair', variants: {} })]]);
  expect(checkAssetManifest({ ...manifest(), bindings: { 1003: { asset: 'furniture/armchair' } } }, { knownAssets: known })).toEqual([]);
  // A UI typeface under the OFL (checkpoint 1: SIL OFL fonts are an allowed source) conforms.
  const font = {
    schema: ASSET_MANIFEST_SCHEMA,
    assets: [{ id: 'fonts/noto-sans', kind: 'font', path: 'assets/fonts/noto-sans/NotoSans.woff2', license: 'OFL-1.1', sources: ['googlefonts/notosans@b5efa9c32e8f'], files: { woff2: 'assets/fonts/noto-sans/NotoSans.woff2', license: 'assets/fonts/noto-sans/OFL.txt' } }],
  };
  expect(checkAssetManifest(font)).toEqual([]);

  expect(assetPathProblem('assets/icons/2102.png')).toBeNull();
  expect(assetPathProblem('assets/icons/../lock/x.json')).toBe("'assets/icons/../lock/x.json' has an empty, . or .. segment");
  expect(assetPathProblem('assets/targets/source/frame.jpg')).toBe("'assets/targets/source/frame.jpg' is under assets/targets/, which never ships");
  expect(assetPathProblem('https://example.com/a.glb')).toBe("'https://example.com/a.glb' must be a repo-relative POSIX path");
  expect(assetUrl('assets/icons/2102.png')).toBe('/assets/icons/2102.png');
  expect(assetUrl('assets/icons/2102.png', '/game')).toBe('/game/assets/icons/2102.png');
});

/** A material library with one material, and a furniture manifest whose sofa dresses its parts in it. */
function dressed() {
  const library = {
    schema: ASSET_MANIFEST_SCHEMA,
    library: { schema: 'survival-logs/material-library@1', generator: 'tools/materials/build.py', toolchain: { ktx: '4.4.2' }, units: 'meters', conventions: { tint: 'baseColor *= tint' } },
    rebuild: { materials: { entry: 'tools/materials/build.sh', args: ['--only', '{name}'], inputs: ['tools/materials/'], shared: ['assets/cache'], persist: ['tools/materials/.venv'], tools: { ktx: '4.4.2' }, seeds: { variation: 20260922 }, cost: 45 } },
    assets: [
      {
        id: 'materials/fabric_sofa',
        kind: 'material',
        path: 'assets/materials/fabric_sofa/',
        files: { baseColor: 'assets/materials/fabric_sofa/baseColor.ktx2', normal: 'assets/materials/fabric_sofa/normal.ktx2' },
        license: 'CC0-1.0',
        sources: ['polyhaven/poly_wool_herringbone@2k'],
        variants: { sage: { params: { tint: '#bac4aa' } } },
        params: { tint: { presets: { sage: '#bac4aa', rust: '#9a5a3c' } }, instance: { tint: true, wear: [0, 0.8], dirt: [0, 1], seed: true } },
        rebuild: 'materials',
        digests: { 'assets/materials/fabric_sofa/baseColor.ktx2': 'a'.repeat(64) },
      },
    ],
  };
  const furniture = {
    schema: ASSET_MANIFEST_SCHEMA,
    assets: [{ id: 'furniture/sofa', kind: 'model', path: 'assets/furniture/sofa/sofa.glb', license: 'LicenseRef-Original', materials: { cushion: { material: 'materials/fabric_sofa', variant: 'sage', wear: 0.3 }, frame: { material: 'materials/fabric_sofa', tint: 'rust', seed: 7 } } }],
    bindings: { 1001: { asset: 'furniture/sofa' }, 1002: { asset: 'furniture/sofa', materials: { cushion: { material: 'materials/fabric_sofa', tint: '#20304a', dirt: 0.6 } } } },
  };
  return { library, furniture };
}

test('assets contract: the library block, material instances and the rebuild contract are typed and checked', { tag: '@smoke' }, () => {
  const { library, furniture } = dressed();
  expect(checkAssetManifest(library)).toEqual([]);
  const known = new Map(library.assets.map((e) => [e.id, /** @type {any} */ (e)]));
  expect(checkAssetManifest(furniture, { knownAssets: known })).toEqual([]);
  expect(checkAssetManifest(furniture)[0]).toBe('assets[0] (furniture/sofa).materials.cushion.material: "materials/fabric_sofa" is not a material in any manifest');

  const bad = dressed();
  bad.library.library.schema = 'v2';
  Object.assign(bad.library.rebuild.materials, { entry: 'build.sh', inputs: [], tools: {}, cost: 0, cycles: { seed: 1 } });
  Object.assign(bad.library.assets[0], { rebuild: 'bake', digests: { 'assets/materials/other.ktx2': 'xyz' } });
  expect(checkAssetManifest(bad.library)).toEqual([
    "library.schema: expected 'survival-logs/material-library@<n>', got \"v2\"",
    'rebuild.materials.entry: expected a .sh, .mjs, .js or .py script under tools/',
    'rebuild.materials.inputs: expected the repo paths the build reads',
    'rebuild.materials.tools: expected the pinned tool versions',
    'rebuild.materials.cycles: expected { seed, samples } integers',
    'rebuild.materials.cost: expected seconds per asset',
    "assets[0] (materials/fabric_sofa).rebuild: no recipe 'bake' in the manifest's rebuild",
    "assets[0] (materials/fabric_sofa).digests: 'assets/materials/other.ktx2' is not one of the entry's files",
    'assets[0] (materials/fabric_sofa).digests.assets/materials/other.ktx2: expected a lowercase hex SHA-256',
  ]);

  const f = dressed().furniture;
  Object.assign(f.assets[0].materials.cushion, { variant: 'teal', wear: 0.9, gloss: 1 });
  Object.assign(f.assets[0].materials.frame, { tint: 'mauve', seed: -1 });
  f.bindings[1002].materials.cushion.material = 'furniture/sofa';
  expect(checkAssetManifest(f, { knownAssets: known })).toEqual([
    "assets[0] (furniture/sofa).materials.cushion.variant: 'materials/fabric_sofa' has no variant 'teal'",
    'assets[0] (furniture/sofa).materials.cushion.wear: 0.9 is outside 0 … 0.8',
    'assets[0] (furniture/sofa).materials.cushion.gloss: not a material-instance field (material, variant, tint, secondaryTint, wear, dirt, seed, use)',
    "assets[0] (furniture/sofa).materials.frame.tint: \"mauve\" is neither '#rrggbb' nor a tint preset of 'materials/fabric_sofa'",
    'assets[0] (furniture/sofa).materials.frame.seed: expected an integer 0 … 2^32 - 1',
    "bindings.1002.materials.cushion.material: 'furniture/sofa' is a model, not a material",
  ]);

  const mat = /** @type {any} */ (library.assets[0]);
  expect(assetOutputs(mat)).toEqual(['assets/materials/fabric_sofa/baseColor.ktx2', 'assets/materials/fabric_sofa/normal.ktx2']);
  expect(rebuildOf(/** @type {any} */ (library), mat)?.args).toEqual(['--only', 'fabric_sofa']);
  expect(rebuildOf(/** @type {any} */ (library), { ...mat, rebuild: { recipe: 'materials', args: ['--only', '_shared', '{family}'] } })?.args).toEqual(['--only', '_shared', 'materials']);
  expect(rebuildOf(/** @type {any} */ (library), { ...mat, rebuild: undefined })).toBeNull();

  const sofa = /** @type {any} */ (furniture.assets[0]);
  expect(resolveMaterials(sofa, /** @type {any} */ (furniture.bindings[1002]))).toEqual({
    cushion: { material: 'materials/fabric_sofa', variant: 'sage', wear: 0.3, tint: '#20304a', dirt: 0.6 },
    frame: { material: 'materials/fabric_sofa', tint: 'rust', seed: 7 },
  });
  expect(instanceSeed(12, 'cushion')).toBe(instanceSeed(12, 'cushion'));
  expect(instanceSeed(12, 'cushion')).not.toBe(instanceSeed(13, 'cushion'));
  expect(instanceSeed('fx:market:s1')).toBeLessThanOrEqual(0xffffffff);
});

test('look constants: the ART.md camera, frozen, each value citing its section', { tag: '@smoke' }, () => {
  expect({ ...CAMERA }).toEqual({ vfovDefault: 60, vfovMin: 50, pitchDeg: 40, yawDeg: 30, lookDistance: 10.47, cutWallHeight: 0.9, near: 1, far: 80 });
  expect(Object.isFrozen(CAMERA)).toBe(true);
  expect(Object.keys(CAMERA_SOURCES)).toEqual(Object.keys(CAMERA));
  for (const s of Object.values(CAMERA_SOURCES)) expect(s).toMatch(/^docs\/ART\.md §\d/);
  const [east, up, south] = cameraOffset();
  expect([east, up, south].map((v) => Number(v.toFixed(3)))).toEqual([4.01, 6.73, 6.946]);
  expect(zoomFov(0)).toBe(60);
  expect(zoomFov(1)).toBe(50);
  expect(zoomFov(2)).toBe(50);
  // docs/ART.md's §1.2 standard table must carry the same numbers
  expect(existsSync('docs/ART.md'), 'docs/ART.md (WP-P0-04) is missing: look.js cannot be compared with its §1.2 camera standard').toBe(true);
  const art = readFileSync('docs/ART.md', 'utf8');
  for (const needle of ['**60°**', '60° (out) → 50° (in)', '**40.0° below horizontal**', '**30° off the grid axes**', '**10.47 m**', '1.0 m / 80 m', '**0.9 m**']) expect(art).toContain(needle);
});

/** A library with two materials, and a furniture manifest: a door with placement, a pivot and damage states, a sofa. */
function furnished() {
  const lib = dressed().library;
  const known = new Map(lib.assets.map((e) => [e.id, /** @type {any} */ (e)]));
  const glb = (/** @type {string} */ n) => `assets/furniture/door/${n}.glb`;
  /** @type {Record<string, any>} */
  const m = {
    schema: ASSET_MANIFEST_SCHEMA,
    assets: [
      {
        id: 'furniture/door-front',
        kind: 'model',
        path: glb('door-front'),
        license: 'LicenseRef-Original',
        files: { normal: 'assets/furniture/door/door-front_normal.ktx2', occlusion: 'assets/furniture/door/door-front_occlusion.ktx2' },
        variants: { damaged: { path: glb('door-front_damaged'), lods: [{ level: 1, path: glb('door-front_damaged_lod1'), triangles: 300, screenSize: 0.1 }] }, broken: { path: glb('door-front_broken') } },
        materials: { leaf: { material: 'materials/fabric_sofa', wear: 0.3 } },
        params: {
          slot: 'DOOR',
          anchor: 'wall-center',
          front: '+z',
          footprint: [0, 0],
          opening: { widthM: 1.4, headM: 2.4, leafM: [1.2, 2.3], wallM: 0.2, note: 'ART.md §2' },
          pivots: { leaf: { node: 'leaf_hinge', axis: '-y', openDeg: 90 } },
          states: [
            { variant: 'broken', when: 'broken' },
            { variant: 'damaged', when: 'hpRatio', atMost: 0.5 },
            { variant: null, when: 'always' },
          ],
          bake: { uv: 1, normal: 'tangent space', occlusion: { r: 'ao', g: 'curvature', b: 'cavity' } },
          screen: { free: 'form params stay allowed' },
        },
        meta: { nodes: ['leaf_hinge'] },
      },
      { id: 'furniture/sofa', kind: 'model', path: 'assets/furniture/sofa/sofa.glb', license: 'LicenseRef-Original', params: { slot: 'MEDIUM', anchor: 'floor', front: '+z', footprint: [2, 1] } },
      { id: 'homes/shell-1f', kind: 'model', path: 'assets/homes/apartment/1F.glb', license: 'LicenseRef-Original', params: { note: 'no slot: no placement fields needed' } },
    ],
  };
  return { m, known };
}

test('model params: placement, opening, pivots, states, baked maps and variant LODs are typed and checked', { tag: '@smoke' }, () => {
  const { m, known } = furnished();
  expect(checkAssetManifest(m, { knownAssets: known })).toEqual([]);
  const door = m.assets[0];
  expect(assetOutputs(door)).toContain('assets/furniture/door/door-front_damaged_lod1.glb');

  const bad = furnished().m;
  const [d, sofa] = bad.assets;
  Object.assign(d.params, { anchor: 'floor', front: '-z', footprint: [1, 1] });
  Object.assign(d.params.opening, { widthM: 0, leafM: [1.6, 2.3] });
  d.params.pivots.leaf = { node: 'hinge', axis: 'y', openDeg: 270 };
  d.params.states = [{ variant: 'dented', when: 'dented' }, { variant: null, when: 'always', atMost: 0.2 }, { variant: 'damaged', when: 'hpRatio' }];
  d.params.bake = { uv: 0, occlusion: { r: 'ao' } };
  d.variants.damaged.lods = [{ level: 0, path: 'assets/furniture/door/x.glb' }];
  Object.assign(sofa.params, { slot: 'SOFA', footprint: [2] });
  bad.assets.push(
    { id: 'furniture/window', kind: 'model', path: 'assets/furniture/window/window.glb', license: 'LicenseRef-Original', params: { slot: 'WINDOW', anchor: 'wall-center', front: '+z', footprint: [0, 0], opening: { widthM: 0.9, headM: 2.2, wallM: 0.2 } } },
    { id: 'furniture/tv', kind: 'model', path: 'assets/furniture/tv/tv.glb', license: 'LicenseRef-Original', params: { slot: 'WALL', anchor: 'floor', front: '+z', footprint: [1, 1] } },
    { id: 'furniture/radio', kind: 'model', path: 'assets/furniture/radio/radio.glb', license: 'LicenseRef-Original', files: { normal: 'assets/furniture/radio/radio_normal.ktx2' }, params: { slot: 'TABLETOP' } },
    { id: 'furniture/crate', kind: 'model', path: 'assets/furniture/crate/crate.glb', license: 'LicenseRef-Original', params: { slot: 'MEDIUM', anchor: 'floor', front: '+z', footprint: [2, 1], states: [{ variant: null, when: 'broken' }] } },
  );
  expect(checkAssetManifest(bad, { knownAssets: known })).toEqual([
    "assets[0] (furniture/door-front).variants.damaged.lods[0]: levels must be integers counting up from 1",
    "assets[0] (furniture/door-front).params.front: the room side of a model is '+z', not \"-z\"",
    'assets[0] (furniture/door-front).params.footprint: a DOOR slot is [0,0] tiles, not [1,1]',
    "assets[0] (furniture/door-front).params.anchor: a DOOR sits in its opening ('wall-center')",
    'assets[0] (furniture/door-front).params.opening.widthM: expected metres > 0',
    'assets[0] (furniture/door-front).params.opening.leafM: expected [width, height] within the opening',
    "assets[0] (furniture/door-front).params.pivots.leaf.node: 'hinge' is not in meta.nodes",
    'assets[0] (furniture/door-front).params.pivots.leaf.axis: expected one of +x, -x, +y, -y, +z, -z',
    'assets[0] (furniture/door-front).params.pivots.leaf.openDeg: expected 0 < degrees ≤ 180',
    "assets[0] (furniture/door-front).params.states[0].when: 'dented' is not one of broken, hpRatio, always",
    'assets[0] (furniture/door-front).params.states[0].variant: "dented" is not a variant of the entry (null: its own files)',
    'assets[0] (furniture/door-front).params.states[1].atMost: only an hpRatio rule has a threshold',
    "assets[0] (furniture/door-front).params.states[1]: an 'always' rule must be the last",
    'assets[0] (furniture/door-front).params.states[2].atMost: expected 0 < ratio < 1',
    "assets[0] (furniture/door-front).params.states: the last rule must be 'always'",
    'assets[0] (furniture/door-front).params.bake.uv: baked maps are on TEXCOORD_1, not 0',
    'assets[0] (furniture/door-front).params.bake.occlusion: expected { r, g, b } descriptions (OCCLUSION_CHANNELS)',
    "assets[1] (furniture/sofa).params.slot: 'SOFA' is not one of SMALL, TABLETOP, DEFENSE, MEDIUM, BED, LARGE, WALL, DOOR, WINDOW",
    'assets[1] (furniture/sofa).params.footprint: expected [x, y] whole tiles',
    'assets[3] (furniture/window).params.opening.sillM: a window needs its sill height',
    "assets[4] (furniture/tv).params.footprint: a WALL slot is [0,0] tiles, not [1,1]",
    "assets[4] (furniture/tv).params.anchor: a WALL piece hangs on the wall face ('wall-face')",
    'assets[5] (furniture/radio).params.anchor: required for a model that goes in a slot',
    'assets[5] (furniture/radio).params.front: required for a model that goes in a slot',
    'assets[5] (furniture/radio).params.footprint: required for a model that goes in a slot',
    'assets[5] (furniture/radio).params.bake: baked normal / occlusion maps need { uv: 1, … }',
    "assets[6] (furniture/crate).params.states: the last rule must be 'always'",
  ]);
  const noOpening = furnished().m;
  delete noOpening.assets[0].params.opening;
  expect(checkAssetManifest(noOpening, { knownAssets: known })).toEqual(['assets[0] (furniture/door-front).params.opening: required for a DOOR, the shell lane cuts the wall from it']);

  // the first matching rule picks the variant; the ratio comes from the view model, never from hp / maxHp here
  const piece = (/** @type {Record<string, any>} */ o) => /** @type {any} */ ({ uid: 1, cfg: 200, x: 7, y: 10, w: 0, h: 0, ...o });
  expect(modelVariant(door, piece({ hpRatio: 1 }))).toBeNull();
  expect(modelVariant(door, piece({ hpRatio: 0.5 }))).toBe('damaged');
  expect(modelVariant(door, piece({ hp: 100, maxHp: 1000, hpRatio: 0.9 }))).toBeNull();
  expect(modelVariant(door, piece({ hpRatio: 0.9, broken: true }))).toBe('broken');
  expect(modelVariant(door, piece({ hpRatio: 0.9, data: { breached: true } }))).toBe('broken');
  expect(modelVariant(m.assets[1], piece({ hpRatio: 0.1 }))).toBeNull();
});

test('SLOT_FOOTPRINTS is the sim footprint of every slot type', { tag: '@smoke' }, () => {
  for (const [name, fp] of Object.entries(SLOT_FOOTPRINTS)) expect(footprint(/** @type {any} */ (SLOT)[name]), name).toEqual(fp);
  expect(Object.keys(SLOT_FOOTPRINTS).sort()).toEqual(Object.keys(SLOT).filter((k) => k !== 'NONE').sort());
});

/** An audio manifest covering every category. */
function audio() {
  const e = (/** @type {string} */ id, /** @type {Record<string, any>} */ params, /** @type {Record<string, any>} */ extra = {}) => ({ id, kind: 'audio', path: `assets/audio/${id.split('/')[1]}.ogg`, license: 'LicenseRef-Original', params, ...extra });
  const played = { bus: 'sfx', spatial: true, loop: false, space: 'apartment', tags: ['impact'], pitchCents: 60, gainDb: 2, noRepeat: true, maxVoices: 2, cooldown: 0.25 };
  return {
    schema: ASSET_MANIFEST_SCHEMA,
    assets: [
      e('audio/door-bang', { title: 'Door bang', category: 'sfx', ...played }, { variants: { '02': { path: 'assets/audio/door-bang-02.ogg', params: { levelDb: -2 } } } }),
      e('audio/amb-street', { title: 'Street', category: 'ambience', ...played, bus: 'ambience', spatial: false, loop: true, space: null, tags: [] }),
      e('audio/music-night', { title: 'Night', category: 'music', bus: 'music', layer: 'night', loop: true, bpm: 64, meter: [4, 4], bars: 16, barSeconds: 3.75, loopEndSample: 2880000 }, { meta: { sampleRate: 48000 } }),
      e('audio/music-ending', { title: 'Ending', category: 'music', bus: 'music', layer: 'ending', loop: false, bpm: 72, meter: [4, 4], bars: 18, barSeconds: 60 / 72 * 4, loopEndSample: null }),
      e('audio/ir-shop', { title: 'Shop IR', category: 'ir', space: 'shop', rt60Bands: [125, 250, 500], rt60: [1.05, 1, 0.92] }),
      e('audio/test-60s', { title: 'Test', category: 'test', sections: [{ t: 0, title: 'Night' }, { t: 30, title: 'Horde' }], uses: ['audio/door-bang', 'audio/music-night'] }),
    ],
  };
}

test('audio params: the runtime audio convention is typed and checked per category', { tag: '@smoke' }, () => {
  expect(checkAssetManifest(audio())).toEqual([]);
  const bad = audio();
  const [bang, street, night, ending, ir, mix] = bad.assets;
  Object.assign(bang.params, { bus: 'voice', spatial: 'yes', pitchCents: -5, gainDb: 40, maxVoices: 0, cooldown: -1, tags: 'impact' });
  /** @type {any} */ (bang).variants['02'].params.levelDb = 'loud';
  delete street.params.maxVoices;
  street.params.space = 'attic';
  Object.assign(night.params, { layer: 'dusk', barSeconds: 3.5, loopEndSample: 100 });
  ending.params.loopEndSample = 5;
  Object.assign(ir.params, { space: null, rt60: [1] });
  mix.params.uses = ['audio/door-bang', 'audio/nope'];
  bad.assets.push({ id: 'audio/beep', kind: 'audio', path: 'assets/audio/beep.ogg', license: 'LicenseRef-Original', params: { title: 'Beep', category: 'noise' } });
  expect(checkAssetManifest(bad)).toEqual([
    'assets[0] (audio/door-bang).variants.02.params.levelDb: expected dB',
    "assets[0] (audio/door-bang).params.bus: 'voice' is not one of music, sfx, ambience, ui",
    'assets[0] (audio/door-bang).params.spatial: expected true or false',
    'assets[0] (audio/door-bang).params.tags: expected strings',
    'assets[0] (audio/door-bang).params.pitchCents: expected 0 … 1200 cents',
    'assets[0] (audio/door-bang).params.gainDb: expected 0 … 24 dB',
    'assets[0] (audio/door-bang).params.maxVoices: expected a whole number ≥ 1',
    'assets[0] (audio/door-bang).params.cooldown: expected seconds ≥ 0',
    'assets[1] (audio/amb-street).params.maxVoices: required for ambience',
    'assets[1] (audio/amb-street).params.space: "attic" is not one of apartment, stairwell, shop, basement, outdoors or null',
    "assets[2] (audio/music-night).params.layer: 'dusk' is not one of pre-outbreak, day, night, horde, transition, ending",
    'assets[2] (audio/music-night).params.barSeconds: 3.5 is not 60 / bpm × 4 = 3.75',
    'assets[2] (audio/music-night).params.loopEndSample: 100 is not bars × barSeconds × sampleRate = 2688000',
    'assets[3] (audio/music-ending).params.loopEndSample: null when the layer does not loop',
    'assets[4] (audio/ir-shop).params.space: null is not one of apartment, stairwell, shop, basement, outdoors',
    'assets[4] (audio/ir-shop).params.rt60: expected one reverberation time per band',
    "assets[6] (audio/beep).params.category: 'noise' is not one of sfx, ambience, ui, music, ir, test",
    "assets[5] (audio/test-60s).params.uses[1]: 'audio/nope' is not an audio entry of any manifest",
  ]);
});

test('every asset manifest on master passes checkAssetManifest with the typed fields', { tag: '@smoke' }, () => {
  /** @type {[string, any][]} */
  const found = [];
  const walk = (/** @type {string} */ dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (dir === 'assets' && ['cache', 'targets', 'lock', 'credits'].includes(e.name)) continue;
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (e.name === 'manifest.json' || e.name === 'library.json') found.push([p, JSON.parse(readFileSync(p, 'utf8'))]);
    }
  };
  walk('assets');
  const files = found.map(([f]) => f);
  for (const f of ['assets/materials/library.json', 'assets/audio/manifest.json', 'assets/icons/manifest.json']) expect(files).toContain(f);
  const known = new Map(found.flatMap(([, m]) => m.assets.map((/** @type {any} */ e) => [e.id, e])));
  for (const [f, m] of found) expect(checkAssetManifest(m, { knownAssets: known, exists: (p) => existsSync(p) }), f).toEqual([]);
});

test('checkView: hpRatio is 0 … 1 and is hp / (maxHp + reinforce)', { tag: '@smoke' }, () => {
  const v = sceneView();
  Object.assign(v.furniture[0], { hp: 300, maxHp: 500, reinforce: 100, hpRatio: 0.5 });
  expect(checkView(v)).toEqual([]);
  v.furniture[0].hpRatio = 0.6;
  expect(checkView(v)).toEqual(['furniture[0].hpRatio: 0.6 is not hp / (maxHp + reinforce) = 0.5']);
  v.furniture[0].hpRatio = 1.2;
  expect(checkView(v)).toEqual(['furniture[0].hpRatio: expected 0 … 1']);
});

test('gpuBytes: textures by format, mips and size, render targets with MSAA, and buffers', { tag: '@smoke' }, () => {
  // expected bytes worked out by hand, level by level
  const rgba8Mips = [1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1].reduce((s, n) => s + n * n * 4, 0); // 5 592 404
  const bc7Mips = (16384 + 4096 + 1024 + 256 + 64 + 16 + 4 + 1 + 1 + 1) * 16; // 512² … 1², 4 × 4 blocks of 16 bytes
  const bc1Odd = (Math.ceil(300 / 4) * Math.ceil(200 / 4)) * 8; // 75 × 50 blocks, no mips
  const cube = 6 * 256 * 256 * 8; // rgba16f cube, no mips
  const rt = 1920 * 1080 * 8 * (4 + 1) + 1920 * 1080 * 4 * 4; // rgba16f × 4 samples + resolve, depth24stencil8 × 4
  const shadow = 2048 * 2048 * 4; // depth32f, single sample
  const buffers = 48000 + 12000 + 256;
  expect(rgba8Mips).toBe(5592404);
  expect(mipLevels(1024, 1024)).toBe(11);
  expect(mipLevels(512, 256)).toBe(10);
  const inventory = {
    textures: [
      { format: /** @type {const} */ ('rgba8'), width: 1024, height: 1024, levels: 11 },
      { format: /** @type {const} */ ('bc7'), width: 512, height: 512, levels: 10 },
      { format: /** @type {const} */ ('bc1'), width: 300, height: 200 },
      { format: /** @type {const} */ ('rgba16f'), width: 256, height: 256, layers: 6 },
    ],
    renderTargets: [
      { width: 1920, height: 1080, color: [/** @type {const} */ ('rgba16f')], depth: /** @type {const} */ ('depth24stencil8'), samples: 4 },
      { width: 2048, height: 2048, color: [], depth: /** @type {const} */ ('depth32f') },
    ],
    buffers: [{ bytes: 48000 }, { bytes: 12000 }, { bytes: 256 }],
  };
  expect(textureBytes(inventory.textures[1])).toBe(bc7Mips);
  expect(textureBytes(inventory.textures[2])).toBe(bc1Odd);
  expect(renderTargetBytes(inventory.renderTargets[0])).toBe(rt);
  expect(gpuBytes(inventory)).toBe(rgba8Mips + bc7Mips + bc1Odd + cube + rt + shadow + buffers);
  expect(gpuBytes({})).toBe(0);
  expect(() => textureBytes(/** @type {any} */ ({ format: 'rgb8', width: 4, height: 4 }))).toThrow("unknown GPU format 'rgb8'");
  expect(() => renderTargetBytes({ width: 4, height: 4, color: ['bc7'] })).toThrow("'bc7' cannot be a render-target attachment");
  expect(checkStats({ drawCalls: 212, triangles: 180000, gpuBytes: 0 })).toEqual([]);
  expect(checkStats({ drawCalls: -1, triangles: 1.5 })).toEqual([
    'stats.drawCalls: expected a whole number ≥ 0 (0: unmeasured)',
    'stats.triangles: expected a whole number ≥ 0 (0: unmeasured)',
    'stats.gpuBytes: expected a whole number ≥ 0 (0: unmeasured)',
  ]);
});

test('checkView: the survivor\'s character and a figure\'s sim id (the 3D renderer\'s model picks)', { tag: '@smoke' }, () => {
  const v = sceneView();
  Object.assign(v.entities[0], { character: 'student' });
  Object.assign(v.entities[1], { id: 'z12' });
  expect(checkView(v)).toEqual([]);
  v.entities[1].id = 7;
  expect(checkView(v)).toEqual([]);
  const bad = sceneView();
  Object.assign(bad.entities[0], { character: '', id: { z: 1 } });
  Object.assign(bad.entities[1], { character: 'wage' });
  expect(checkView(bad)).toEqual([
    'entities[0].id: expected a string or number',
    'entities[0].character: expected a character id',
    'entities[1].character: only on the player',
  ]);
});

test('checkView: home facts (home, powered, lightsPowered, lightsSwitchedOff) and entity motion (moving, heading, action)', { tag: '@smoke' }, () => {
  const v = sceneView();
  Object.assign(v, { home: 'apartment', powered: true, lightsPowered: true, lightsSwitchedOff: false });
  Object.assign(v.entities[0], { moving: true, heading: [0, -1], action: { kind: 'walk', phase: 'walk' } });
  Object.assign(v.entities[1], { moving: false, action: undefined });
  expect(checkView(v)).toEqual([]);
  v.entities[0].action = { kind: 'dismantle', phase: 'work', progress: 0.25 };
  expect(checkView(v)).toEqual([]);
  expect(checkView({ ...sceneView(), powered: false })).toEqual([]);

  const bad = sceneView();
  Object.assign(bad, { home: '', powered: 'yes', lightsSwitchedOff: 1 });
  Object.assign(bad.entities[0], { moving: 'no', heading: [1, 1, 0], action: { kind: '', phase: 'idle', progress: 2 } });
  Object.assign(bad.entities[1], { moving: false, heading: [1, 0], action: 'walking' });
  expect(checkView(bad)).toEqual([
    'entities[0].moving: expected a boolean or nothing',
    'entities[0].heading: expected [dx, dy] of a step, each -1, 0 or 1',
    'entities[0].action.kind: expected an action kind',
    "entities[0].action.phase: expected 'walk' or 'work'",
    'entities[0].action.progress: expected 0 … 1',
    'entities[0].action.progress: only in the work phase',
    'entities[1].heading: only while moving',
    'entities[1].action: expected { kind, phase, progress? }',
    'view.powered: expected a boolean or nothing',
    'view.lightsSwitchedOff: expected a boolean or nothing',
    'home: expected a home id',
    'powered: a home view states it (true or false)',
    'lightsPowered: a home view states it (true or false)',
    'lightsSwitchedOff: a home view states it (true or false)',
  ]);
  const standstill = sceneView();
  standstill.entities[0].heading = [0, 0];
  standstill.entities[0].moving = true;
  expect(checkView(standstill)).toEqual(['entities[0].heading: expected [dx, dy] of a step, each -1, 0 or 1']);
});

test('material binding: tint.presetUse restricts presets to uses; a floor binding of an accent-only preset fails', { tag: '@smoke' }, () => {
  const { library } = dressed();
  const mat = /** @type {any} */ (library.assets[0]);
  mat.params.tint.presetUse = { rust: ['furniture', 'accent'] };
  expect(checkAssetManifest(library)).toEqual([]);
  const known = new Map(library.assets.map((e) => [e.id, /** @type {any} */ (e)]));
  const part = (/** @type {Record<string, any>} */ i) => ({ schema: ASSET_MANIFEST_SCHEMA, assets: [{ id: 'homes/apartment-1f', kind: 'model', path: 'assets/homes/apartment/1F.glb', license: 'LicenseRef-Original', materials: { floor_fabric: { material: 'materials/fabric_sofa', ...i } } }] });
  expect(checkAssetManifest(part({ tint: 'rust', use: 'accent' }), { knownAssets: known })).toEqual([]);
  expect(checkAssetManifest(part({ tint: 'sage', use: 'floor' }), { knownAssets: known }), 'unlisted presets suit every use').toEqual([]);
  expect(checkAssetManifest(part({ tint: '#9a5a3c', use: 'floor' }), { knownAssets: known }), 'a hex tint is no preset').toEqual([]);
  expect(checkAssetManifest(part({ tint: 'rust', use: 'floor' }), { knownAssets: known })).toEqual([
    "assets[0] (homes/apartment-1f).materials.floor_fabric.use: preset 'rust' of 'materials/fabric_sofa' is for furniture, accent, not floor",
  ]);
  expect(checkAssetManifest(part({ tint: 'rust' }), { knownAssets: known })).toEqual([
    "assets[0] (homes/apartment-1f).materials.floor_fabric.use: 'materials/fabric_sofa' restricts preset 'rust' to furniture, accent; name the part's use",
  ]);
  mat.variants.rust = { params: { tint: '#9a5a3c', use: ['furniture', 'accent'] } };
  expect(checkAssetManifest(part({ variant: 'rust', use: 'wall' }), { knownAssets: new Map(library.assets.map((e) => [e.id, /** @type {any} */ (e)])) })).toEqual([
    "assets[0] (homes/apartment-1f).materials.floor_fabric.use: preset 'rust' of 'materials/fabric_sofa' is for furniture, accent, not wall",
  ]);
  expect(checkAssetManifest(part({ use: 'ceiling' }), { knownAssets: known })).toEqual(["assets[0] (homes/apartment-1f).materials.floor_fabric.use: 'ceiling' is not one of floor, wall, furniture, accent"]);
  mat.params.tint.presetUse = { teal: ['floor'], rust: [], sage: ['roof'] };
  expect(checkAssetManifest(library)).toEqual([
    'assets[0] (materials/fabric_sofa).params.tint.presetUse.teal: not a tint preset of the material',
    'assets[0] (materials/fabric_sofa).params.tint.presetUse.rust: expected uses from floor, wall, furniture, accent',
    'assets[0] (materials/fabric_sofa).params.tint.presetUse.sage: expected uses from floor, wall, furniture, accent',
  ]);
});
