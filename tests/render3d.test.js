// The three.js renderer's scene building, headless: the shell and the furniture layer for every home floor, shop
// and exploration site; ART.md §1.3's cutaway (camera-facing walls cut to 0.9 m when a room lies behind them, far
// walls full height); the lighting rigs of ART.md §4.3; and a prop for every furniture config row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { load, loadSystems } from '../tools/gate/sim.mjs';

await loadSystems();
await load('src/ui/shopPanel.js');
await load('src/ui/explorePanel.js');
const { newGame } = await load('src/sim/state.js');
const { tick } = await load('src/sim/tick.js');
const { dayStartT, HOUR } = await load('src/sim/time.js');
const { buildView } = await load('src/ui/view.js');
const { homeDef } = await load('src/sim/home.js');
const { SHOPS } = await load('src/content/shops.js');
const explore = await load('src/sim/explore.js');
const { CELL, cellAt } = await load('src/contracts/view.js');
const { furniture: FURNITURE } = await load('src/data/db.js');
const { buildShell, shellKey, WALL_H, CUT_H } = await load('src/render3d/shell.js');
const { FurnitureLayer } = await load('src/render3d/furniture.js');
const { family, buildProp, rng } = await load('src/render3d/props.js');
const { rigAt, kelvin } = await load('src/render3d/lighting.js');
const { buildDressing } = await load('src/render3d/dressing.js');

/** A material library stand-in: plain materials, no textures (the shapes are what is tested). */
const lib = {
  /** @type {Map<string, THREE.MeshStandardMaterial>} */
  cache: new Map(),
  /** @param {string} name */
  get(name) {
    let m = this.cache.get(name);
    if (!m) this.cache.set(name, (m = new THREE.MeshStandardMaterial({ name })));
    return m;
  },
};

/** Every scene the game can show: home floors before and after the outbreak, shops, sites. */
function scenes() {
  /** @type {{ label: string, view: any }[]} */
  const out = [];
  for (const character of ['wage', 'student', 'warehouse']) {
    const s = newGame({ seed: 11, id: 'r3d', character, skipPrologue: true });
    const floors = Object.keys(homeDef(s.home.id).floors);
    for (const floor of floors) {
      s.ui.viewFloor = floor;
      out.push({ label: `${character} ${floor}`, view: buildView(s) });
    }
    tick(s, 38 * HOUR);
    for (const floor of floors) {
      s.ui.viewFloor = floor;
      out.push({ label: `${character} ${floor} night`, view: buildView(s) });
    }
  }
  for (const shopId of Object.keys(SHOPS)) {
    const s = newGame({ seed: 12, id: 'r3d', skipPrologue: true });
    s.player.scene = `shop:${shopId}`;
    out.push({ label: `shop ${shopId}`, view: buildView(s) });
  }
  for (const site of explore.sites()) {
    const s = newGame({ seed: 13, id: 'r3d' });
    s.phase = 'post';
    s.clock.t = dayStartT(s.clock, 45) + 9 * HOUR;
    s.run.day = 45;
    if (!explore.startExploration(s, site.id).ok) continue;
    tick(s, explore.travelTime(s, site.id) + 60);
    out.push({ label: `site ${site.id}`, view: buildView(s) });
  }
  return out.filter((x) => x.view.floor);
}
const SCENES = scenes();

test('every scene builds a shell with floors and walls, and a prop for every piece', () => {
  assert.ok(SCENES.length >= 12, `expected home floors, shops and sites, got ${SCENES.length} scenes`);
  for (const { label, view } of SCENES) {
    const shell = buildShell(view, lib);
    let meshes = 0;
    shell.group.traverse((o) => {
      if (/** @type {THREE.Mesh} */ (o).isMesh) meshes++;
    });
    assert.ok(meshes > 3, `${label}: shell has ${meshes} meshes`);
    assert.ok(shell.ground.length >= 1, `${label}: no ground to pick`);
    assert.ok(shell.group.children.some((o) => o.name === 'walls'), `${label}: no walls`);
    const layer = new FurnitureLayer(lib);
    layer.update(view, 0);
    // dressing never lands on a tile a piece occupies
    const dressing = buildDressing(view, lib);
    assert.equal(dressing.group.name, 'dressing', `${label}: dressing`);
    for (const f of view.furniture) assert.ok(layer.object(f.uid), `${label}: no prop for piece ${f.uid} (${f.cfg})`);
    assert.equal(typeof shellKey(view), 'string');
  }
});

test('no two floor surfaces overlap: every quarter tile shows one floor (overlaps z-fight and twinkle)', () => {
  for (const { label, view } of SCENES) {
    const shell = buildShell(view, lib);
    /** @type {Map<string, string[]>} */
    const cover = new Map();
    shell.group.traverse((o) => {
      const m = /** @type {THREE.Mesh} */ (o);
      if (!m.isMesh || !m.name.startsWith('floor:')) return;
      const pos = /** @type {THREE.BufferAttribute} */ (m.geometry.getAttribute('position'));
      for (let v = 0; v < pos.count; v += 4) {
        const xs = [0, 1, 2, 3].map((k) => pos.getX(v + k));
        const zs = [0, 1, 2, 3].map((k) => pos.getZ(v + k));
        // sample the quad at the centres of its quarter tiles
        for (let x = Math.min(...xs) + 0.25; x < Math.max(...xs); x += 0.5) {
          for (let z = Math.min(...zs) + 0.25; z < Math.max(...zs); z += 0.5) {
            const k = `${x},${z}`;
            if (!cover.has(k)) cover.set(k, []);
            cover.get(k)?.push(m.name);
          }
        }
      }
    });
    const twice = [...cover].filter(([, names]) => names.length > 1);
    assert.deepEqual(twice.slice(0, 5), [], `${label}: ${twice.length} quarter tiles with more than one floor`);
  }
});

test('cutaway: camera-facing walls with a room behind them stand 0.9 m, far walls full height (ART.md §1.3)', () => {
  const { view } = SCENES.find((s) => s.label === 'wage 1F') || {};
  assert.ok(view, 'wage 1F scene');
  const shell = buildShell(view, lib);
  const walls = shell.group.children.filter((o) => o.name === 'walls');
  shell.group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  /** the top of the wall at a tile centre */
  const top = (/** @type {number} */ x, /** @type {number} */ y) => {
    ray.set(new THREE.Vector3(x + 0.5, 10, y + 0.5), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObjects(walls, false)[0];
    return hit ? hit.point.y : 0;
  };
  const fl = view.floor;
  let front = 0;
  let back = 0;
  for (let x = 1; x < fl.w - 1; x++) {
    // the front wall (last building row) with a room behind it
    const y = fl.innerH - 1;
    if (cellAt(fl, x, y) === CELL.WALL && cellAt(fl, x, y - 1) === CELL.FLOOR) {
      assert.ok(Math.abs(top(x, y) - CUT_H) < 1e-3, `front wall at ${x},${y} stands ${top(x, y)} m`);
      front++;
    }
    if (cellAt(fl, x, 0) === CELL.WALL) {
      assert.ok(Math.abs(top(x, 0) - WALL_H) < 1e-3, `back wall at ${x},0 stands ${top(x, 0)} m`);
      back++;
    }
  }
  assert.ok(front > 3 && back > 3, `checked ${front} front and ${back} back wall tiles`);
});

test('rigs: day, dusk and night keys as ART.md §4.3, with 45-minute blends', () => {
  const day = rigAt(12);
  assert.equal(day.keyE, 2.227);
  assert.equal(day.el, 60);
  assert.equal(day.interiorE, 0.419);
  const dusk = rigAt(17.5);
  assert.equal(dusk.keyE, 1.26);
  assert.equal(dusk.keyK, 2600);
  const night = rigAt(1);
  assert.equal(night.keyE, 0.138);
  assert.equal(night.night, 1);
  // mid-blend day → dusk at 16:00: halfway
  const mid = rigAt(16);
  assert.ok(Math.abs(mid.interiorE - (0.419 + 0.197) / 2) < 1e-9);
  // the key never jumps between the sun and the moon: it fades through zero at the night boundaries
  assert.ok(rigAt(19).keyE < 0.02, `key at 19:00 is ${rigAt(19).keyE}`);
  const warm = kelvin(2600);
  const cool = kelvin(8000);
  assert.ok(warm.r > warm.b && cool.b > cool.r);
});

test('every furniture config row gets a prop family and builds without error', () => {
  const counts = /** @type {Record<string, number>} */ ({});
  let rows = 0;
  for (const [id, cfg] of Object.entries(FURNITURE)) {
    const fam = family(cfg.zh, '', cfg.slot, cfg);
    // the config's developer test rows (测试家具) are never placed
    if (!cfg.zh.startsWith('测试')) {
      counts[fam] = (counts[fam] || 0) + 1;
      rows++;
    }
    const f = { uid: Number(id), cfg: Number(id), x: 0, y: 0, w: 1, h: 1, hpRatio: 1, data: {} };
    const g = buildProp(fam, { W: 0.9, D: 0.9, lib, rnd: rng(Number(id)), name: cfg.zh, key: '', f, slot: cfg.slot });
    assert.ok(g.children.length > 0, `${id} ${cfg.zh}: empty ${fam}`);
  }
  // the common pieces land in the right families
  const fam = (/** @type {string} */ zh, /** @type {number} */ slot) => family(zh, '', slot, null);
  assert.equal(fam('双开门冰箱', 2), 'fridge');
  assert.equal(fam('单人铁床', 7), 'bed');
  assert.equal(fam('沙发', 2), 'sofa');
  assert.equal(fam('中型置物架', 2), 'rack');
  assert.equal(fam('衣架', 2), 'clothesrack', 'a clothes rack is a rail of clothes, not shelving');
  assert.equal(fam('花架', 2), 'plantstand', 'a flower stand holds potted plants');
  assert.equal(fam('房门', 8), 'door');
  assert.equal(fam('窗户', 9), 'window');
  assert.equal(fam('大型燃气灶', 2), 'stove');
  assert.equal(fam('马桶', 1), 'toilet');
  assert.ok((counts.generic || 0) < 0.02 * rows, `too many generic props: ${counts.generic} of ${rows}`);
});
