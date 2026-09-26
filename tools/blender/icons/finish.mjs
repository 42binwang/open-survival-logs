#!/usr/bin/env node
// @ts-check
// Finishes the icon renders (WP-P0-12) into assets/icons/ and writes assets/icons/manifest.json.
//
//   node tools/blender/icons/finish.mjs [--work tools/blender/icons/work] [--only 2115,2105]
//
// For each icon: the soft drop shadow of rig.json `shadow` is laid under the 256 x 256 Cycles render
// (<work>/render/<id>.png), and that master is downsampled to 128 and 64 in linear light (imaging.mjs). Files:
// assets/icons/<id>.png (256), <id>@128.png, <id>@64.png, encoded by tools/lib/png.mjs, so the same pixels always
// give the same bytes. Icons carry no quality badge: as in the source, a dish's tier shows as text, and one render
// serves the tiers a catalog entry lists in `serves` (bindings from each of those config ids to the one icon). The
// manifest follows src/contracts/assets.js: one `icons` rebuild recipe (tools/blender/icons/build.sh --only {name}),
// and per entry the recipe, the SHA-256 of every file, the config names and category, and the icon box (object fill
// and the baked shadow) for the UI. With --only, the other entries are kept as they are.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { decodePng, encodePng } from '../../lib/png.mjs';
import { ASSET_MANIFEST_SCHEMA, checkAssetManifest } from '../../../src/contracts/assets.js';
import { CAT, item, itemName } from '../../../src/data/db.js';
import { setLang } from '../../../src/engine/i18n.js';
import { canonical, downsample, dropShadow, over } from './imaging.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
export const SIZES = /** @type {const} */ ([64, 128, 256]);
export const MANIFEST = 'assets/icons/manifest.json';
const CATALOG = JSON.parse(readFileSync(join(HERE, 'catalog.json'), 'utf8'));
const RIG = JSON.parse(readFileSync(join(HERE, 'rig.json'), 'utf8'));
const CATEGORY = Object.fromEntries(Object.entries(CAT).map(([k, v]) => [v, k.toLowerCase().replace(/_/g, ' ')]));

/** Repo paths of an icon's files at each size. @param {number} id @param {string} [suffix] */
export const iconFiles = (id, suffix = '') => ({ 64: `assets/icons/${id}${suffix}@64.png`, 128: `assets/icons/${id}${suffix}@128.png`, 256: `assets/icons/${id}${suffix}.png` });

/** The rebuild recipe of every icon: tools/blender/icons/build.sh renders and finishes one icon per run. */
export function recipe() {
  return {
    entry: 'tools/blender/icons/build.sh',
    args: ['--only', '{name}'],
    inputs: [
      'tools/blender/run.sh',
      'tools/blender/common/',
      'tools/blender/materials/',
      'tools/blender/icons/',
      'tools/lib/png.mjs',
      'tools/fetch-assets.mjs',
      'assets/materials/',
      'assets/sources.lock.json',
      'assets/lock/',
      'src/contracts/assets.js',
      'src/data/',
      'src/engine/i18n.js',
      'src/content/strings.js',
    ],
    shared: ['assets/cache', 'tools/bin'],
    tools: { blender: '5.2.2', ktx: '4.4.2', node: '24.15.0' },
    seeds: { catalog: CATALOG.seed, cycles: RIG.cycles.seed },
    cycles: { seed: RIG.cycles.seed, samples: RIG.cycles.samples },
    cost: 8,
    timeoutSec: 300,
  };
}

/**
 * How an icon sits in its file, for the UI: the subject's projected bounds fill `fill` of the side (so the file
 * shows 1:1 in a slot with the corners free) and the drop shadow is already baked in; a UI adds no second shadow.
 */
export function iconBox() {
  const { dx, dy, sigma, opacity, color } = RIG.shadow;
  return { fill: RIG.camera.fill, anchor: 'centre', shadow: { dx, dy, sigma, opacity, color, baked: true } };
}

/** @param {string} rel */
const sha = (rel) => createHash('sha256').update(readFileSync(join(ROOT, rel))).digest('hex');

/** Share of pixels that are at least half opaque. @param {import('../../lib/png.mjs').Image} img */
function coverage(img) {
  let n = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] >= 128) n++;
  return Math.round((n / (img.width * img.height)) * 1000) / 1000;
}

/** Locked sources behind the library materials an icon used, plus the rig's studio HDRI. @param {string[]} mats */
function sourcesOf(mats) {
  const lib = JSON.parse(readFileSync(join(ROOT, 'assets/materials/library.json'), 'utf8'));
  const ids = new Set([RIG.world.hdri.source]);
  for (const m of mats) {
    const e = lib.assets.find((/** @type {any} */ a) => a.id === m);
    if (!e) throw new Error(`render used ${m}, which is not in assets/materials/library.json`);
    for (const s of e.sources || []) ids.add(s);
  }
  return [...ids].sort();
}

/**
 * Finishes one icon: writes its files and returns its manifest entry.
 * @param {any} icon catalog entry @param {string} work
 */
function finishIcon(icon, work) {
  const id = icon.id;
  const png = join(work, 'render', `${id}.png`);
  const factsFile = join(work, 'render', `${id}.json`);
  if (!existsSync(png) || !existsSync(factsFile)) throw new Error(`icon ${id}: no render in ${join(work, 'render')} (run render.py first)`);
  const render = canonical(decodePng(readFileSync(png)));
  if (render.width !== RIG.resolution || render.height !== RIG.resolution) throw new Error(`icon ${id}: render is ${render.width} x ${render.height}, not ${RIG.resolution}`);
  const facts = JSON.parse(readFileSync(factsFile, 'utf8'));
  const cfg = item(id);
  if (!cfg) throw new Error(`icon ${id}: not a config item (src/data/gen/items.js)`);
  const master = over(dropShadow(render, RIG.shadow), render);
  /** @type {Record<number, import('../../lib/png.mjs').Image>} */
  const img = { 256: master, 128: downsample(master, 128), 64: downsample(master, 64) };
  const files = iconFiles(id);
  /** @type {Record<string, string>} */
  const digests = {};
  /** @type {Record<string, number>} */
  const alpha = {};
  /** @type {Record<string, number>} */
  const bytes = {};
  mkdirSync(join(ROOT, 'assets/icons'), { recursive: true });
  for (const s of SIZES) {
    const buf = encodePng(img[s]);
    writeFileSync(join(ROOT, files[s]), buf);
    digests[files[s]] = sha(files[s]);
    alpha[s] = coverage(img[s]);
    bytes[s] = buf.length;
  }
  const serves = /** @type {number[]} */ (icon.serves || [id]);
  for (const cfgId of serves) if (!item(cfgId)) throw new Error(`icon ${id}: serves ${cfgId}, which is not a config item`);
  setLang('en');
  const name = itemName(id);
  setLang('zh');
  const nameZh = itemName(id);
  setLang('en');
  const mats = [...new Set(/** @type {string[]} */ (facts.materials || []))].sort();
  /** @type {Record<string, any>} */
  const entry = {
    id: `icons/${id}`,
    kind: 'icon',
    path: files[256],
    license: 'LicenseRef-Original',
    sources: sourcesOf(mats),
    files: { 64: files[64], 128: files[128], 256: files[256] },
  };
  Object.assign(entry, {
    rebuild: 'icons',
    digests,
    params: {
      item: id,
      name,
      nameZh,
      category: cfg.cat,
      categoryName: CATEGORY[cfg.cat] || `category ${cfg.cat}`,
      footprint: cfg.size,
      title: icon.title,
      builder: icon.builder,
      labels: icon.labels || [],
      libraryMaterials: mats,
      serves,
      ...(icon.quality ? { cooking: icon.quality } : {}),
      box: iconBox(),
      background: 'transparent (straight alpha), no backdrop; a soft drop shadow is baked in (box.shadow)',
      pose: icon.pose || {},
    },
    meta: {
      sizes: [...SIZES],
      alphaCoverage: alpha,
      sizeBytes: bytes,
      framing: { radiusM: facts.radiusM, distanceM: facts.distanceM, extent: facts.extent },
    },
  });
  return entry;
}

function main() {
  const { values } = parseArgs({ options: { work: { type: 'string', default: join(HERE, 'work') }, only: { type: 'string' } } });
  const work = resolve(values.work);
  /** @type {number[]} */
  const ids = values.only ? values.only.split(',').map(Number) : CATALOG.icons.map((/** @type {any} */ i) => i.id);
  const byId = new Map(CATALOG.icons.map((/** @type {any} */ i) => [i.id, i]));
  for (const id of ids) if (!byId.has(id)) throw new Error(`icon ${id} is not in catalog.json`);
  const manifestPath = join(ROOT, MANIFEST);
  const old = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { assets: [] };
  const oldById = new Map((old.assets || []).map((/** @type {any} */ e) => [e.id, e]));
  const done = new Map(ids.map((id) => [id, finishIcon(byId.get(id), work)]));
  const assets = [];
  for (const icon of CATALOG.icons) {
    const e = done.get(icon.id) || oldById.get(`icons/${icon.id}`);
    if (e) assets.push(e);
    else console.warn(`finish: icon ${icon.id} has no render yet and is left out of the manifest`);
  }
  const manifest = {
    schema: ASSET_MANIFEST_SCHEMA,
    wp: 'WP-P0-12',
    rebuild: { icons: recipe() },
    assets,
    bindings: Object.fromEntries(assets.flatMap((e) => (e.params.serves || [e.params.item]).map((/** @type {number} */ c) => [String(c), { asset: e.id }]))),
  };
  const full = !values.only;
  const problems = checkAssetManifest(manifest, full ? { exists: (p) => existsSync(join(ROOT, p)) } : {});
  if (problems.length) throw new Error(`manifest problems:\n  ${problems.join('\n  ')}`);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  for (const id of ids) console.log(`icon ${id}: ${SIZES.join(', ')} px${(byId.get(id).serves || []).length > 1 ? `, serves ${byId.get(id).serves.join(', ')}` : ''}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
