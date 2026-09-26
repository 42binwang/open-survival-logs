// @ts-check
// Contract conformance at run time (the gate's contracts check; tools/gate/conformance.js is the compile-time half):
// - the constants the contracts restate match the sim and the Canvas renderer;
// - live views of every home floor, shop and exploration site pass checkView, and the Canvas renderer draws and
//   hit-tests each of them through the renderer interface;
// - every asset manifest under assets/ passes checkAssetManifest (ids unique across manifests, files on disk).
// Prints one JSON line { ok, summary, problems }; exits 1 on problems.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { ROOT } from './port.mjs';
import { load, loadSystems } from './sim.mjs';

/** @type {string[]} */
const problems = [];
const stats = { views: 0, manifests: 0, assets: 0 };

// ------------------------------------------------------------------------------------------ constants
const view = await load('src/contracts/view.js');
const render = await load('src/contracts/render.js');
const assets = await load('src/contracts/assets.js');
await loadSystems();
const scene = await load('src/sim/scene.js');
const weather = await load('src/sim/weather.js');
const iso = await load('src/render/iso.js');
if (!isDeepStrictEqual({ ...view.CELL }, { ...scene.CELL })) problems.push('src/contracts/view.js CELL differs from src/sim/scene.js CELL');
if (!isDeepStrictEqual([...view.WEATHER_KINDS], [...weather.WEATHER_KINDS])) problems.push('src/contracts/view.js WEATHER_KINDS differs from src/sim/weather.js');
if (render.TILE_W !== iso.TW || render.TILE_H !== iso.TH) problems.push('src/contracts/render.js TILE_W / TILE_H differ from src/render/iso.js TW / TH');
for (const [x, y] of [[0, 0], [3.5, 7.25], [13, 14], [-2, 5]]) {
  if (!isDeepStrictEqual(render.isoToScreen(x, y), iso.isoToScreen(x, y))) problems.push(`isoToScreen(${x}, ${y}) differs from src/render/iso.js`);
  const [sx, sy] = iso.isoToScreen(x, y);
  if (!isDeepStrictEqual(render.screenToIso(sx, sy), iso.screenToIso(sx, sy))) problems.push(`screenToIso(${sx}, ${sy}) differs from src/render/iso.js`);
}

// ------------------------------------------------------------------------------------------ live views
await load('src/ui/shopPanel.js');
await load('src/ui/explorePanel.js');
const { newGame } = await load('src/sim/state.js');
const { tick } = await load('src/sim/tick.js');
const { dayStartT, HOUR } = await load('src/sim/time.js');
const { buildView } = await load('src/ui/view.js');
const { homeDef } = await load('src/sim/home.js');
const { SHOPS } = await load('src/content/shops.js');
const explore = await load('src/sim/explore.js');

// A canvas whose 2D context accepts every call, so the Canvas renderer can run headless.
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? /** @type {any} */ (t)[k] : () => ({ addColorStop() {} })), set: (t, k, v) => ((/** @type {any} */ (t)[k] = v), true) });
const canvas = /** @type {any} */ ({ width: 1280, height: 800, getContext: () => ctx2d, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 800 }) });
/** @type {import('../../src/contracts/render.js').Renderer} */
const renderer = new iso.IsoRenderer(canvas);
for (const k of ['draw', 'pick', 'toWorld', 'toCanvas', 'centerOn', 'lightning', 'resize']) {
  if (typeof (/** @type {any} */ (renderer))[k] !== 'function') problems.push(`IsoRenderer.${k} is not a function`);
}
if (!(renderer.highlight instanceof Set)) problems.push('IsoRenderer.highlight is not a Set');
for (const k of ['x', 'y', 'zoom']) if (typeof (/** @type {any} */ (renderer.cam))[k] !== 'number') problems.push(`IsoRenderer.cam.${k} is not a number`);

/**
 * @param {string} label
 * @param {any} state
 */
function checkScene(label, state) {
  const v = buildView(state);
  stats.views++;
  const found = view.checkView(v);
  for (const p of found) problems.push(`${label}: ${p}`);
  if (found.length || !v.floor) return;
  try {
    const p = state.player;
    renderer.centerOn(p.px ?? p.x, p.py ?? p.y);
    renderer.draw(v);
    const [cx, cy] = renderer.toCanvas(p.x + 0.5, p.y + 0.5);
    const [wx, wy] = renderer.toWorld(cx, cy);
    if (Math.abs(wx - p.x - 0.5) > 1e-6 || Math.abs(wy - p.y - 0.5) > 1e-6) problems.push(`${label}: toWorld(toCanvas(p)) does not return p`);
    const hit = renderer.pick(v, wx, wy);
    if (!Array.isArray(hit.tile) || hit.tile[0] !== Math.floor(wx) || hit.tile[1] !== Math.floor(wy)) problems.push(`${label}: pick().tile is not the tile under the point`);
  } catch (err) {
    problems.push(`${label}: the Canvas renderer failed on this view: ${/** @type {Error} */ (err).message}`);
  }
}

/** @param {any} s @param {number} day @param {number} hour */
function postOutbreak(s, day, hour) {
  s.phase = 'post';
  s.clock.t = dayStartT(s.clock, day) + hour * HOUR;
  s.run.day = day;
  return s;
}

for (const character of ['wage', 'student', 'warehouse']) {
  const s = newGame({ seed: 11, id: 'contracts', character, skipPrologue: true });
  s.ui.autonomy = true;
  const floors = Object.keys(homeDef(s.home.id).floors);
  for (const floor of floors) {
    s.ui.viewFloor = floor;
    checkScene(`${character} ${floor} (morning before the outbreak)`, s);
  }
  s.ui.viewFloor = s.player.floor;
  s.ui.planning = true;
  s.ui.planSlots = new Set();
  checkScene(`${character} planning mode`, s);
  s.ui.planning = false;
  tick(s, 38 * HOUR); // 08:00 + 38 h: 22:00 on Day 2, after the outbreak
  for (const floor of floors) {
    s.ui.viewFloor = floor;
    checkScene(`${character} ${floor} (Day 2, 22:00)`, s);
  }
  for (const kind of view.WEATHER_KINDS) {
    s.weather.today.kind = kind;
    s.ui.viewFloor = '1F';
    checkScene(`${character} 1F in ${kind} weather`, s);
  }
}
for (const shopId of Object.keys(SHOPS)) {
  const s = newGame({ seed: 12, id: 'contracts', skipPrologue: true });
  s.player.scene = `shop:${shopId}`;
  checkScene(`shop ${shopId}`, s);
}
for (const site of explore.sites()) {
  const s = postOutbreak(newGame({ seed: 13, id: 'contracts' }), 45, 9);
  const started = explore.startExploration(s, site.id);
  if (!started.ok) {
    problems.push(`site ${site.id}: could not start the exploration on Day 45 (${started.reason})`);
    continue;
  }
  checkScene(`site ${site.id} (on the way)`, s);
  tick(s, explore.travelTime(s, site.id) + 60);
  checkScene(`site ${site.id}`, s);
}
// the title screen draws nothing
const empty = view.checkView({ floor: null });
if (empty.length) problems.push(`empty view: ${empty.join('; ')}`);

// ------------------------------------------------------------------------------------------ asset manifests
const assetsDir = join(ROOT, 'assets');
/** @type {{ file: string, manifest: any }[]} */
const manifests = [];
if (existsSync(assetsDir)) {
  /** @param {string} dir */
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (dir === assetsDir && assets.UNSHIPPED_ASSET_DIRS.includes(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'manifest.json' || e.name === 'library.json') {
        const file = p.slice(ROOT.length);
        try {
          manifests.push({ file, manifest: JSON.parse(readFileSync(p, 'utf8')) });
        } catch (err) {
          problems.push(`${file}: not JSON (${/** @type {Error} */ (err).message})`);
        }
      }
    }
  };
  walk(assetsDir);
}
/** @type {Map<string, any>} */
const known = new Map();
for (const { file, manifest } of manifests) {
  for (const e of Array.isArray(manifest?.assets) ? manifest.assets : []) {
    if (typeof e?.id !== 'string') continue;
    if (known.has(e.id)) problems.push(`${file}: asset id '${e.id}' is also used by ${known.get(e.id).file}`);
    else known.set(e.id, { ...e, file });
  }
}
const exists = (/** @type {string} */ p) => existsSync(join(ROOT, p));
for (const { file, manifest } of manifests) {
  stats.manifests++;
  stats.assets += Array.isArray(manifest?.assets) ? manifest.assets.length : 0;
  for (const p of assets.checkAssetManifest(manifest, { exists, knownAssets: known })) problems.push(`${file}: ${p}`);
}

const summary = `${stats.views} live views conform and draw; ${stats.manifests} asset manifest(s), ${stats.assets} asset(s)`;
console.log(JSON.stringify({ ok: problems.length === 0, summary, problems }));
process.exit(problems.length ? 1 : 0);
