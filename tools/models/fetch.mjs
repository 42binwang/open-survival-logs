#!/usr/bin/env node
// @ts-check
// Poly Haven furniture and prop models (CC0) at 1k glTF: assets/models/<name>/ and assets/models/manifest.json
// (WP-P1-models). The pinned list is tools/models/models.json (Poly Haven id, family, front yaw, mount).
//
//   node tools/models/fetch.mjs --lock [--only <name>]...
//       Resolves each model through the Poly Haven API (https://api.polyhaven.com/files/<id>: gltf['1k']), downloads
//       the .gltf, its .bin and its textures into assets/cache/polyhaven/<id>@1k/ (unshipped), checks each file
//       against the provider's MD5, hashes it (SHA-256) and writes the source into assets/sources.lock.json (wp
//       WP-P1-models, authors from https://api.polyhaven.com/info/<id>) and the ## WP-P1-models section of
//       assets/CREDITS.md. Then builds, as below. Needs the network.
//   node tools/models/fetch.mjs [--only <name>]...
//       The rebuild recipe: restores each locked file into the cache (downloading it from its locked URL when it is
//       missing, checking MD5 and SHA-256), copies the .bin and the JPEG textures byte for byte to
//       assets/models/<name>/ at the relative path the .gltf references, encodes every texture to KTX2 next to its
//       JPEG (tools/models/textures.py: sized for the ART.md §3 texel density of the model's tier, the material
//       library's encoder settings and corrections), writes the .gltf with each texture's KTX2 as its
//       KHR_texture_basisu source (the JPEG stays its fallback), measures the glTF (bounds, triangles) and writes the
//       entries of assets/models/manifest.json. Needs the KTX tools (tools/bin/install-ktx.sh) and a virtualenv
//       (tools/models/.venv, made from tools/models/requirements.txt). Deterministic: the same lock gives
//       byte-identical files and manifest.
//   node tools/models/fetch.mjs --verify [--only <name>]...
//       Writes nothing, encodes nothing and needs no network: every shipped copy of a locked file matches the lock,
//       the .gltf is the one a rebuild writes, every KTX2 is there with the size, levels and format the manifest
//       gives, every file matches the manifest digests, and the manifest entry is what a rebuild would write (the
//       encoder's report, which only an encode can reproduce, is taken from the manifest).
//
// <name> is the lowercase Poly Haven id ('sofa_01'); the Poly Haven id itself ('Sofa_01') is accepted too.
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { cacheDirFor } from '../fetch-assets.mjs';
import { readGltf, uvIslands } from '../art-metrics/gltf.mjs';
import { TEXEL_DENSITY } from '../art-metrics/standard.mjs';
import { coverage } from '../art-metrics/lightmaps.mjs';
import { encodePng } from '../lib/png.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LIST = join(ROOT, 'tools', 'models', 'models.json');
const LOCK = join(ROOT, 'assets', 'sources.lock.json');
const CREDITS = join(ROOT, 'assets', 'CREDITS.md');
const OUT = 'assets/models';
const MANIFEST = join(ROOT, OUT, 'manifest.json');
const UA = 'SurvivalLogs-asset-fetch/1 (private build; +https://github.com/)';
const HOSTS = ['api.polyhaven.com', 'dl.polyhaven.org'];
/** Models built at once. */
const JOBS = 3;

/**
 * @typedef {{ id: string, family: string, frontYawDeg: number, mount: 'floor' | 'surface' | 'wall' | 'ceiling', scale?: number, note?: string }} ModelSpec
 * @typedef {{ wp: string, resolution: string, recipe: string, families: Record<string, string>, models: ModelSpec[] }} ModelList
 * @typedef {{ url: string, path: string, bytes: number, sha256: string, md5?: string }} LockFile
 * @typedef {{ wp?: string, id: string, provider: string, title: string, page?: string, license: string,
 *   licenseUrl?: string, authors: string[], kind: string, physicalSizeM?: number[] | null, usedFor: string[],
 *   retrieved: string, files: LockFile[], notes?: string }} LockSource
 */

/** @returns {ModelList} */
const readList = () => JSON.parse(readFileSync(LIST, 'utf8'));
/** @param {string} id */
export const nameOf = (id) => id.toLowerCase();
/** @param {ModelList} list @param {ModelSpec} m */
const sourceId = (list, m) => `polyhaven/${m.id}@${list.resolution}`;
/** @param {Uint8Array} buf */
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
/** @param {Uint8Array} buf */
const md5 = (buf) => createHash('md5').update(buf).digest('hex');
/** @param {number} v  rounded to 0.1 mm, without negative zero */
const mm = (v) => Math.round(v * 1e4) / 1e4 + 0;

/** @param {string} url */
function checkHost(url) {
  const host = new URL(url).hostname;
  if (!HOSTS.includes(host)) throw new Error(`${url}: ${host} is not a Poly Haven host`);
}

/** @param {string} url */
async function getJson(url) {
  checkHost(url);
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
  return res.json();
}

/**
 * Downloads a file into memory (a few MB at most), retrying.
 * @param {string} url
 */
async function download(url, attempts = 4) {
  checkHost(url);
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw new Error(`download failed ${url}: ${/** @type {Error} */ (last).message}`);
}

/** @param {string} file @param {Uint8Array} data  atomic write */
function writeAtomic(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.part`, data);
  renameSync(`${file}.part`, file);
}

/**
 * A locked file from the cache, downloaded from its URL when missing or corrupt; checked against SHA-256 and MD5.
 * @param {string} id  source id
 * @param {LockFile} f
 */
async function restore(id, f) {
  const dest = join(cacheDirFor(id), ...f.path.split('/'));
  if (existsSync(dest) && statSync(dest).size === f.bytes) {
    const buf = readFileSync(dest);
    if (sha256(buf) === f.sha256) return buf;
  }
  const buf = await download(f.url);
  if (f.md5 && md5(buf) !== f.md5) throw new Error(`${f.url}: MD5 ${md5(buf)} is not the locked ${f.md5}`);
  if (sha256(buf) !== f.sha256) throw new Error(`${f.url}: SHA-256 ${sha256(buf)} is not the locked ${f.sha256}`);
  writeAtomic(dest, buf);
  return buf;
}

// ------------------------------------------------------------------------------------------------ lock

/**
 * Resolves one model through the API, downloads it into the cache and returns its lock entry.
 * @param {ModelList} list
 * @param {ModelSpec} m
 * @param {LockSource | undefined} prev  the entry already locked, whose retrieval date stays when nothing changed
 * @returns {Promise<LockSource>}
 */
async function lockOne(list, m, prev) {
  const res = list.resolution;
  const [info, files] = await Promise.all([getJson(`https://api.polyhaven.com/info/${m.id}`), getJson(`https://api.polyhaven.com/files/${m.id}`)]);
  if (info?.type !== 2) throw new Error(`${m.id} is not a Poly Haven model`);
  const g = files?.gltf?.[res]?.gltf;
  if (!g?.url) throw new Error(`${m.id} has no ${res} glTF`);
  const gltfPath = `${m.id}_${res}.gltf`;
  if (g.url.split('/').pop() !== gltfPath) throw new Error(`${m.id}: unexpected glTF file name ${g.url}`);
  /** @type {[string, { url: string, md5: string }][]} */
  const wanted = [[gltfPath, g], ...Object.entries(/** @type {Record<string, { url: string, md5: string }>} */ (g.include || {})).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))];
  const id = sourceId(list, m);
  /** @type {LockFile[]} */
  const locked = [];
  for (const [path, f] of wanted) {
    if (path.split('/').some((s) => s === '..' || s === '') || path.startsWith('/')) throw new Error(`${m.id}: unsafe path ${path}`);
    const buf = await download(f.url);
    if (md5(buf) !== f.md5) throw new Error(`${f.url}: MD5 ${md5(buf)} is not the provider's ${f.md5}`);
    writeAtomic(join(cacheDirFor(id), ...path.split('/')), buf);
    locked.push({ url: f.url, path, bytes: buf.length, sha256: sha256(buf), md5: f.md5 });
  }
  // the .gltf must reference exactly the files the API lists
  const doc = JSON.parse(readFileSync(join(cacheDirFor(id), gltfPath), 'utf8'));
  const refs = new Set([...(doc.buffers || []), ...(doc.images || [])].map((/** @type {any} */ x) => decodeURI(x.uri)));
  const listed = new Set(locked.slice(1).map((f) => f.path));
  for (const r of refs) if (!listed.has(r)) throw new Error(`${m.id}: the glTF references ${r}, which the API does not list`);
  const unchanged = prev && JSON.stringify(prev.files) === JSON.stringify(locked);
  const dims = Array.isArray(info.dimensions) ? info.dimensions.map((/** @type {number} */ v) => Math.round(v) / 1000) : null;
  return {
    wp: list.wp,
    id,
    provider: 'Poly Haven',
    title: info.name || m.id,
    page: `https://polyhaven.com/a/${m.id}`,
    license: 'CC0-1.0',
    licenseUrl: 'https://polyhaven.com/license',
    authors: Object.keys(info.authors || {}),
    kind: 'model',
    physicalSizeM: dims,
    usedFor: [`models/${nameOf(m.id)} (${m.family})`],
    retrieved: unchanged && prev ? prev.retrieved : new Date().toISOString().slice(0, 10),
    files: locked,
  };
}

/** @param {string} s */
const esc = (s) => String(s).replace(/\|/g, '\\|');

/**
 * The ## <wp> section of assets/CREDITS.md for the locked models.
 * @param {ModelList} list
 * @param {LockSource[]} sources
 */
export function creditsSection(list, sources) {
  const lines = [
    `## ${list.wp}`,
    '',
    'Furniture and prop models from Poly Haven at 1k (glTF with JPEG textures), shipped under',
    '`assets/models/<name>/` with each texture also encoded to KTX2 by `node tools/models/fetch.mjs` (pinned list `tools/models/models.json`).',
    '',
    '### Assets',
    '',
    '| Asset | Provider | Author(s) | License | Made by | Used for |',
    '| --- | --- | --- | --- | --- | --- |',
    ...sources.map(
      (s) =>
        `| [${esc(s.title)}](${s.page}) (\`${s.id}\`) | ${esc(s.provider)} | ${esc(s.authors.join(', '))} | [${s.license}](${s.licenseUrl}) | 3D model | ${esc(s.usedFor.join(', '))} |`
    ),
    '',
    '### Downloads (URL and SHA-256)',
    '',
  ];
  for (const s of sources) {
    lines.push(`- \`${s.id}\``);
    for (const f of s.files) lines.push(`  - ${f.url} — ${f.bytes} bytes — \`${f.sha256}\``);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Replaces (or appends) the ## <wp> section of the credits.
 * @param {string} text
 * @param {string} wp
 * @param {string} section
 */
function spliceCredits(text, wp, section) {
  const at = text.indexOf(`\n## ${wp}\n`);
  if (at < 0) return `${text.replace(/\n*$/, '\n')}\n${section}`;
  const end = text.indexOf('\n## ', at + 1);
  return `${text.slice(0, at + 1)}${section}${end < 0 ? '' : `\n${text.slice(end + 1)}`}`;
}

/** @param {ModelList} list @param {ModelSpec[]} models */
async function lock(list, models) {
  const ledger = JSON.parse(readFileSync(LOCK, 'utf8'));
  /** @type {LockSource[]} */
  const sources = ledger.sources;
  /** @type {string[]} */
  const failed = [];
  let next = 0;
  /** @type {(LockSource | null)[]} */
  const got = new Array(models.length).fill(null);
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < models.length) {
        const i = next++;
        const m = models[i];
        try {
          got[i] = await lockOne(list, m, sources.find((s) => s.id === sourceId(list, m)));
          console.log(`locked   ${sourceId(list, m)}  (${got[i]?.files.length} files)`);
        } catch (err) {
          failed.push(`${m.id}: ${/** @type {Error} */ (err).message}`);
        }
      }
    })
  );
  for (const s of got) {
    if (!s) continue;
    const i = sources.findIndex((x) => x.id === s.id);
    if (i >= 0) sources[i] = s;
    else sources.push(s);
  }
  // keep the lane's entries in list order, after everything else
  const order = new Map(list.models.map((m, i) => [sourceId(list, m), i]));
  const others = sources.filter((s) => !order.has(s.id));
  const mine = sources.filter((s) => order.has(s.id)).sort((a, b) => /** @type {number} */ (order.get(a.id)) - /** @type {number} */ (order.get(b.id)));
  ledger.sources = [...others, ...mine];
  writeFileSync(LOCK, `${JSON.stringify(ledger, null, 2)}\n`);
  writeFileSync(CREDITS, spliceCredits(readFileSync(CREDITS, 'utf8'), list.wp, creditsSection(list, mine)));
  if (failed.length) throw new Error(`could not lock:\n  ${failed.join('\n  ')}`);
}

// ------------------------------------------------------------------------------------------------ build

/** @type {NodeIO | null} */
let io = null;

/**
 * Measures a glTF on disk: world bounds of the default scene (metres, +Y up), triangles over every mesh instance,
 * and the names and features the renderer needs.
 * @param {string} file
 */
export async function measure(file) {
  io ||= new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const json = JSON.parse(readFileSync(file, 'utf8'));
  const doc = await io.read(file);
  const root = doc.getRoot();
  const scene = root.getDefaultScene() || root.listScenes()[0];
  const { min, max } = getBounds(scene);
  let triangles = 0;
  scene.traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    for (const p of mesh.listPrimitives()) {
      const idx = p.getIndices();
      const count = idx ? idx.getCount() : p.getAttribute('POSITION')?.getCount() ?? 0;
      const mode = p.getMode();
      triangles += mode === 4 ? Math.floor(count / 3) : mode === 5 || mode === 6 ? Math.max(0, count - 2) : 0;
    }
  });
  const alpha = [...new Set(root.listMaterials().map((m) => m.getAlphaMode()).filter((a) => a !== 'OPAQUE'))].sort();
  return {
    boundsM: { min: min.map(mm), max: max.map(mm) },
    triangles,
    meshes: root.listMeshes().length,
    materials: root.listMaterials().map((m) => m.getName()),
    nodes: root.listNodes().map((n) => n.getName()),
    extensionsUsed: [...(json.extensionsUsed || [])].sort(),
    alphaModes: alpha,
    doubleSided: root.listMaterials().filter((m) => m.getDoubleSided()).map((m) => m.getName()),
  };
}

/**
 * The key of a file in `files`: the texture's map name ('diff', 'nor_gl', 'arm', 'leaves_diff'), 'bin' for the buffer.
 * @param {string} path  the path the .gltf references
 * @param {string} id  the Poly Haven id
 * @param {string} res
 */
function fileKey(path, id, res) {
  const base = path.split('/').pop() || path;
  if (base.endsWith('.bin')) return base === `${id}.bin` ? 'bin' : base.replace(/\.bin$/, '');
  const stem = base.replace(/\.[a-z0-9]+$/i, '');
  const noRes = stem.endsWith(`_${res}`) ? stem.slice(0, -res.length - 1) : stem;
  return noRes.startsWith(`${id}_`) ? noRes.slice(id.length + 1) : noRes;
}

/** Tool versions the recipe pins (ktx: tools/bin/install-ktx.sh; numpy and pillow: tools/models/requirements.txt). */
export const TOOLS = { node: '>=24', 'gltf-transform': '4.5.0', ktx: '4.4.2', numpy: '2.3.5', pillow: '12.0.0' };

/** @param {ModelList} list */
export function recipe(list) {
  return {
    [list.recipe]: {
      entry: 'tools/models/fetch.mjs',
      args: ['--only', '{name}'],
      inputs: ['tools/models/', 'tools/art-metrics/', 'tools/materials/checks.mjs', 'tools/materials/slmat/', 'tools/lib/', 'tools/fetch-assets.mjs', 'assets/sources.lock.json'],
      shared: ['assets/cache/', 'node_modules/', 'tools/bin'],
      persist: ['tools/models/.venv'],
      tools: TOOLS,
      cost: 40,
      timeoutSec: 900,
    },
  };
}

// ------------------------------------------------------------------------------------------------ textures

/**
 * The texture sizes the encoder may pick: q × 2^k with q 8 … 15 and k ≥ 2, so every level down to q × 4 is whole
 * 4 × 4 blocks and neighbouring sizes are at most 12.5 % apart (a density within ±6.25 % of any target).
 * @param {number} min
 * @param {number} max
 */
export function sizeLattice(min, max) {
  /** @type {Set<number>} */
  const out = new Set();
  for (let k = 2; 8 << k <= max; k++) for (let q = 8; q < 16; q++) if (q << k >= min && q << k <= max) out.add(q << k);
  return [...out].sort((a, b) => a - b);
}

/**
 * The mip levels a texture of this size stores: down to the last level whose sides are whole 4 × 4 blocks
 * (tools/models/textures.py `levels_for`).
 * @param {number} w
 * @param {number} h
 */
export function levelsFor(w, h) {
  let n = 1;
  while (w % 8 === 0 && h % 8 === 0) {
    w /= 2;
    h /= 2;
    n++;
  }
  return n;
}

/**
 * Texel density of a set of UV islands at a texture size, as tools/art-metrics/models.mjs judges an atlas: islands
 * too small or thin at the class density are left out (at most TEXEL_DENSITY.maxUnjudgedAreaShare of the area);
 * `ok` when every judged island is within the tolerance of the target.
 * @param {{ worldArea: number, uvArea: number, uvBox: number[] }[]} islands
 * @param {number} w
 * @param {number} h
 * @param {number} target  px/m
 */
export function densityAt(islands, w, h, target) {
  let total = 0;
  let small = 0;
  let sum2 = 0;
  let area = 0;
  let ok = true;
  for (const isl of islands) {
    const texels = isl.uvArea * w * h;
    const long = Math.max((isl.uvBox[2] - isl.uvBox[0]) * w, (isl.uvBox[3] - isl.uvBox[1]) * h);
    total += Math.max(0, isl.worldArea);
    if (isl.worldArea <= 0 || isl.worldArea * target ** 2 < TEXEL_DENSITY.minIslandTexels || (long > 0 && texels / long < TEXEL_DENSITY.minIslandWidthTexels)) {
      small += Math.max(0, isl.worldArea);
      continue;
    }
    const d = Math.sqrt(texels / isl.worldArea);
    sum2 += d * d * isl.worldArea;
    area += isl.worldArea;
    if (Math.abs(d / target - 1) > TEXEL_DENSITY.tolerance) ok = false;
  }
  const unjudged = total > 0 ? small / total : 1;
  return { ok: ok && area > 0 && unjudged <= TEXEL_DENSITY.maxUnjudgedAreaShare, mean: area > 0 ? Math.sqrt(sum2 / area) : 0, unjudged };
}

/**
 * The size of one texture: among the lattice sizes up to the source size, one at which every judged island is within
 * the tolerance of the class density, the one whose mean is closest to it; when none is, the size whose mean is closest.
 * @param {{ worldArea: number, uvArea: number, uvBox: number[] }[]} islands  in metres (after params.scale)
 * @param {number} srcW
 * @param {number} srcH
 * @param {number} target
 * @param {{ minSize: number, maxSize: number }} limits
 */
export function chooseSize(islands, srcW, srcH, target, { minSize, maxSize }) {
  const long = Math.max(srcW, srcH);
  const sizes = sizeLattice(minSize, Math.min(maxSize, long));
  const tried = sizes.map((s) => {
    const w = srcW >= srcH ? s : Math.max(4, Math.round((s * srcW) / srcH / 4) * 4);
    const h = srcH >= srcW ? s : Math.max(4, Math.round((s * srcH) / srcW / 4) * 4);
    return { w, h, ...densityAt(islands, w, h, target) };
  });
  const measured = tried.filter((t) => t.mean > 0);
  if (!measured.length) return { ...tried[tried.length - 1], ok: false };
  const pool = measured.some((t) => t.ok) ? measured.filter((t) => t.ok) : measured;
  return pool.reduce((a, b) => (Math.abs(Math.log(b.mean / target)) < Math.abs(Math.log(a.mean / target)) ? b : a));
}

/** @type {Record<string, 'baseColor' | 'color' | 'normal' | 'orm' | 'data'>} slot of a material -> encoder role */
const ROLE_OF = {
  baseColorTexture: 'baseColor',
  emissiveTexture: 'color',
  normalTexture: 'normal',
  metallicRoughnessTexture: 'orm',
  occlusionTexture: 'orm',
  specularColorTexture: 'color',
  sheenColorTexture: 'color',
};

/**
 * Every texture slot of a glTF material: [slot name, textureInfo].
 * @param {any} mat
 * @returns {[string, any][]}
 */
function slotsOf(mat) {
  /** @type {[string, any][]} */
  const out = [];
  const pbr = mat.pbrMetallicRoughness || {};
  for (const k of ['baseColorTexture', 'metallicRoughnessTexture']) if (pbr[k]) out.push([k, pbr[k]]);
  for (const k of ['normalTexture', 'occlusionTexture', 'emissiveTexture']) if (mat[k]) out.push([k, mat[k]]);
  for (const ext of Object.values(mat.extensions || {})) {
    for (const [k, v] of Object.entries(/** @type {Record<string, any>} */ (ext))) if (v && typeof v === 'object' && Number.isInteger(v.index)) out.push([k, v]);
  }
  return out;
}

/** The KTX2 next to a JPEG, without the resolution suffix: textures/Sofa_01_diff_1k.jpg -> textures/Sofa_01_diff.ktx2 */
const ktxPathOf = (/** @type {string} */ uri, /** @type {string} */ res) => uri.replace(new RegExp(`(_${res})?\\.[a-z0-9]+$`, 'i'), '.ktx2');

/**
 * What the build makes of a locked glTF: each image's KTX2 (path, role, size, the metalness it is judged with) and
 * the .gltf text that points every texture at its KTX2 through KHR_texture_basisu, the JPEG kept as fallback.
 * @param {ModelList & Record<string, any>} list
 * @param {ModelSpec} m
 * @param {any} json  the locked .gltf, parsed (it is changed)
 * @param {string} gltfFile  a .gltf with the same geometry, read for the UV islands
 * @param {string} dir  where the locked JPEGs are
 */
export async function planTextures(list, m, json, gltfFile, dir) {
  const cfg = list.textures;
  const target = TEXEL_DENSITY.classes[/** @type {keyof typeof TEXEL_DENSITY.classes} */ (list.classes.tier)];
  const scale = m.scale ?? 1;
  const facts = await readGltf(gltfFile);
  // by file: a glTF may list the same JPEG as two images (sofa_03's body and fringe); it gets one KTX2
  const uriOf = (/** @type {number} */ img) => decodeURI(json.images[img].uri);
  /** @type {Map<string, { first: number, roles: Set<string>, materials: Set<string>, texCoord: Set<number>, metal: any, transmissive: boolean[] }>} */
  const byImage = new Map();
  for (const mat of json.materials || []) {
    const pbr = mat.pbrMetallicRoughness || {};
    const transmissive = (mat.extensions?.KHR_materials_transmission?.transmissionFactor ?? 0) > 0;
    for (const [slot, info] of slotsOf(mat)) {
      const img = json.textures[info.index].source;
      const key = uriOf(img);
      if (!byImage.has(key)) byImage.set(key, { first: img, roles: new Set(), materials: new Set(), texCoord: new Set(), metal: null, transmissive: [] });
      const u = /** @type {any} */ (byImage.get(key));
      u.first = Math.min(u.first, img);
      u.roles.add(ROLE_OF[slot] || 'data');
      u.materials.add(mat.name);
      u.texCoord.add(info.texCoord ?? 0);
      if (slot === 'baseColorTexture') {
        u.transmissive.push(transmissive);
        const mr = pbr.metallicRoughnessTexture;
        u.metal ||= [];
        u.metal.push({ src: mr ? join(dir, uriOf(json.textures[mr.index].source)) : null, factor: pbr.metallicFactor ?? 1 });
      }
    }
  }
  const images = [];
  for (const [uri, u] of [...byImage.entries()].sort((a, b) => a[1].first - b[1].first)) {
    if (u.roles.size !== 1) throw new Error(`${m.id}: ${uri} is used as ${[...u.roles].join(' and ')}`);
    if (u.texCoord.size !== 1) throw new Error(`${m.id}: ${uri} is sampled with more than one UV set`);
    const set = [...u.texCoord][0];
    const prims = facts.primitives.filter((p) => u.materials.has(p.material));
    const islands = prims
      .flatMap((p) => uvIslands(p, set))
      .map((i) => ({ ...i, worldArea: i.worldArea * scale * scale }));
    const { width, height } = jpegSize(readFileSync(join(dir, uri)));
    const pick = chooseSize(islands, width, height, target, cfg);
    const role = [...u.roles][0];
    images.push({
      uri,
      ktx: ktxPathOf(uri, list.resolution),
      role,
      size: [pick.w, pick.h],
      pxPerM: Math.round(pick.mean * 10) / 10,
      densityOk: pick.ok,
      /** the primitives that sample it, for its UV coverage (not written to the manifest) */
      prims,
      set,
      ...(role === 'baseColor' ? { metal: u.metal || [], transmissive: u.transmissive.every(Boolean) } : {}),
    });
  }
  // the glTF: one KTX2 image per JPEG, appended; every texture of a JPEG gets its KTX2 as KHR_texture_basisu source
  const ktxIndex = new Map(images.map((im, i) => [im.uri, json.images.length + i]));
  json.images.push(...images.map((im) => ({ name: im.ktx.split('/').pop()?.replace(/\.ktx2$/, ''), uri: encodeURI(im.ktx), mimeType: 'image/ktx2' })));
  for (const t of json.textures || []) {
    const k = ktxIndex.get(uriOf(t.source));
    if (k != null) t.extensions = { ...(t.extensions || {}), KHR_texture_basisu: { source: k } };
  }
  if (images.length) json.extensionsUsed = [...new Set([...(json.extensionsUsed || []), 'KHR_texture_basisu'])];
  return { images, gltf: `${JSON.stringify(json, null, 2)}\n` };
}

/**
 * The locked glTF's content back from a built one: without the KTX2 images, the KHR_texture_basisu sources and the
 * extension's name (`planTextures` must then write the built file again, byte for byte).
 * @param {any} json
 */
export function unplan(json) {
  const first = (json.images || []).findIndex((/** @type {any} */ im) => im.mimeType === 'image/ktx2');
  if (first < 0) return json;
  json.images = json.images.slice(0, first);
  for (const t of json.textures || []) {
    if (!t.extensions?.KHR_texture_basisu) continue;
    delete t.extensions.KHR_texture_basisu;
    if (!Object.keys(t.extensions).length) delete t.extensions;
  }
  json.extensionsUsed = (json.extensionsUsed || []).filter((/** @type {string} */ e) => e !== 'KHR_texture_basisu');
  if (!json.extensionsUsed.length) delete json.extensionsUsed;
  return json;
}

/**
 * Width and height of a JPEG (its first SOF marker).
 * @param {Uint8Array} b
 */
export function jpegSize(b) {
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new Error('not a JPEG');
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) throw new Error('corrupt JPEG marker');
    const marker = b[i + 1];
    const len = (b[i + 2] << 8) | b[i + 3];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
    i += 2 + len;
  }
  throw new Error('JPEG without a frame header');
}

/**
 * Header facts of a KTX2 file: size, stored levels and supercompression (1 BasisLZ = ETC1S, 2 zstd = UASTC here).
 * @param {Uint8Array} b
 */
export function ktx2Header(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const magic = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!magic.every((v, i) => b[i] === v)) throw new Error('not a KTX2 file');
  return { width: dv.getUint32(20, true), height: dv.getUint32(24, true), levels: Math.max(1, dv.getUint32(40, true)), supercompression: dv.getUint32(44, true) };
}

/** Bytes a KTX2 takes on the GPU once transcoded to a 4 × 4 block format of 16 bytes (BC7, ASTC 4 × 4, ETC2 RGBA). */
export function gpuBytes(/** @type {{ width: number, height: number, levels: number }} */ h) {
  let n = 0;
  for (let l = 0, w = h.width, hh = h.height; l < h.levels; l++, w = Math.max(1, w >> 1), hh = Math.max(1, hh >> 1)) n += Math.ceil(w / 4) * Math.ceil(hh / 4) * 16;
  return n;
}

let toolsReady = false;

/** The pinned KTX tools and the encoder's virtualenv (made once; reused while requirements.txt is unchanged). */
function ensureTools() {
  if (toolsReady) return VENV_PY;
  execFileSync('bash', [join(ROOT, 'tools', 'bin', 'install-ktx.sh')], { stdio: ['ignore', 'ignore', 'inherit'] });
  const req = join(ROOT, 'tools', 'models', 'requirements.txt');
  const stamp = join(ROOT, 'tools', 'models', '.venv', 'requirements.sha256');
  const want = sha256(readFileSync(req));
  if (!existsSync(VENV_PY) || !existsSync(stamp) || readFileSync(stamp, 'utf8') !== want) {
    // numpy 2.3 needs Python 3.11 or newer; the first python3 on PATH may be older (macOS ships 3.9)
    const base = ['python3.14', 'python3.13', 'python3.12', 'python3.11', 'python3'].find((py) => {
      try {
        execFileSync(py, ['-c', 'import sys; sys.exit(sys.version_info < (3, 11))'], { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    });
    if (!base) throw new Error('the texture encoder needs Python 3.11 or newer (python3.11 … python3.14 or python3 on PATH)');
    rmSync(join(ROOT, 'tools', 'models', '.venv'), { recursive: true, force: true });
    execFileSync(base, ['-m', 'venv', join(ROOT, 'tools', 'models', '.venv')], { stdio: 'inherit' });
    execFileSync(VENV_PY, ['-m', 'pip', 'install', '--quiet', '--disable-pip-version-check', '-r', req], { stdio: 'inherit' });
    writeFileSync(stamp, want);
  }
  toolsReady = true;
  return VENV_PY;
}
const VENV_PY = join(ROOT, 'tools', 'models', '.venv', 'bin', 'python');

/**
 * Encodes the planned textures of one model (tools/models/textures.py) and returns its report by KTX2 path.
 * @param {ModelList & Record<string, any>} list
 * @param {Awaited<ReturnType<typeof planTextures>>['images']} images
 * @param {string} srcDir  the locked files in the cache
 * @param {string} outDir  assets/models/<name>/
 * @returns {Promise<Record<string, any>>}
 */
async function encodeTextures(list, images, srcDir, outDir) {
  const py = ensureTools();
  const tmp = mkdtempSync(join(tmpdir(), 'models-job-'));
  const job = {
    encode: list.textures.encode,
    images: images.map((im, i) => {
      // the texels inside the UV islands, as the art metrics rasterise them: the encoder's checks judge only these
      const [w, h] = im.size;
      const cover = coverage(im.prims, im.set, w, h);
      const mask = join(tmp, `mask${i}.png`);
      writeFileSync(mask, encodePng({ width: w, height: h, channels: 1, data: cover.map((c) => c * 255) }));
      return {
        src: join(srcDir, im.uri),
        out: join(outDir, im.ktx),
        role: im.role,
        size: im.size,
        mask,
        ...(im.metal ? { metal: im.metal, transmissive: im.transmissive } : {}),
      };
    }),
  };
  try {
    writeFileSync(join(tmp, 'job.json'), JSON.stringify(job));
    const out = await new Promise((res, rej) => {
      execFile(py, [join(ROOT, 'tools', 'models', 'textures.py'), join(tmp, 'job.json')], { maxBuffer: 1 << 24, env: { ...process.env, PYTHONHASHSEED: '0' } }, (err, stdout, stderr) =>
        err ? rej(new Error(`textures.py failed: ${String(stderr || err.message).trim().split('\n').slice(-4).join(' | ')}`)) : res(stdout)
      );
    });
    const byOut = JSON.parse(String(out).trim().split('\n').pop() || '{}');
    /** @type {Record<string, any>} */
    const report = {};
    for (const im of images) report[im.ktx] = byOut[join(outDir, im.ktx)];
    return report;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * The triangle class of a model: its family's (list.classes), a prop larger than propMaxM along any axis is furniture.
 * @param {ModelList & Record<string, any>} list
 * @param {ModelSpec} m
 * @param {{ min: number[], max: number[] }} boundsM
 */
export function classOf(list, m, boundsM) {
  const c = list.classes;
  const size = Math.max(...boundsM.max.map((v, i) => v - boundsM.min[i]));
  if (c.furniture.includes(m.family)) return 'furniture';
  if (c.prop.includes(m.family)) return size > c.propMaxM ? 'furniture' : 'prop';
  throw new Error(`${m.id}: family ${m.family} has no triangle class in tools/models/models.json classes`);
}

/**
 * Builds one model from its locked source (write), or the entry a build would write from the shipped files (verify):
 * copies the locked .bin and JPEGs, encodes the KTX2, writes the .gltf, and returns its manifest entry.
 * @param {ModelList & Record<string, any>} list
 * @param {ModelSpec} m
 * @param {LockSource} src
 * @param {{ write: boolean, old?: any, problems?: string[] }} opts  write: build into assets/models; else verify the
 *   shipped files, taking the encoder's report from `old` (the manifest entry) and adding what differs to `problems`
 */
async function buildOne(list, m, src, { write, old, problems = [] }) {
  const name = nameOf(m.id);
  const dir = `${OUT}/${name}`;
  const cacheDir = cacheDirFor(src.id);
  if (write) rmSync(join(ROOT, dir), { recursive: true, force: true });
  const [gltf, ...rest] = src.files;
  const gltfOut = join(ROOT, dir, gltf.path);
  /** @type {Record<string, string>} */
  const digests = {};
  let plan;
  if (write) {
    for (const f of src.files) {
      const buf = await restore(src.id, f);
      if (f !== gltf) writeAtomic(join(ROOT, dir, f.path), buf);
    }
    const locked = join(cacheDir, gltf.path);
    plan = await planTextures(list, m, JSON.parse(readFileSync(locked, 'utf8')), locked, cacheDir);
    writeAtomic(gltfOut, new TextEncoder().encode(plan.gltf));
  } else {
    if (!existsSync(gltfOut)) throw new Error(`${dir}/${gltf.path} is missing`);
    const shipped = readFileSync(gltfOut, 'utf8');
    plan = await planTextures(list, m, unplan(JSON.parse(shipped)), gltfOut, join(ROOT, dir));
    if (shipped !== plan.gltf) problems.push(`${m.id}: ${dir}/${gltf.path} is not the .gltf a rebuild writes`);
  }
  const report = write ? await encodeTextures(list, plan.images, cacheDir, join(ROOT, dir)) : Object.fromEntries(plan.images.map((im) => [im.ktx, old?.meta?.textures?.[`${dir}/${im.ktx}`]?.encode]));
  digests[`${dir}/${gltf.path}`] = sha256(new TextEncoder().encode(plan.gltf));
  for (const f of rest) digests[`${dir}/${f.path}`] = f.sha256;
  /** @type {Record<string, any>} */
  const textures = {};
  let ktxBytes = 0;
  let gpu = 0;
  for (const im of plan.images) {
    const p = `${dir}/${im.ktx}`;
    if (!existsSync(join(ROOT, p))) {
      problems.push(`${m.id}: ${p} is missing`);
      continue;
    }
    const bytes = readFileSync(join(ROOT, p));
    const h = ktx2Header(bytes);
    const rep = report[im.ktx];
    if (!rep) problems.push(`${m.id}: no encoder report for ${p}`);
    else if (h.width !== im.size[0] || h.height !== im.size[1] || h.levels !== rep.levels || h.levels > levelsFor(im.size[0], im.size[1]) || h.supercompression !== (rep.codec === 'uastc' ? 2 : 1)) {
      problems.push(`${m.id}: ${p} is ${h.width}×${h.height}, ${h.levels} levels, supercompression ${h.supercompression}; a rebuild writes ${im.size.join('×')}, ${rep.levels} levels, ${rep.codec}`);
    }
    digests[p] = sha256(bytes);
    ktxBytes += bytes.length;
    gpu += gpuBytes(h);
    textures[p] = {
      source: `${dir}/${im.uri}`,
      role: im.role,
      size: im.size,
      levels: h.levels,
      pxPerM: im.pxPerM,
      ...(im.densityOk ? {} : { densityNote: `no size puts every UV island within ±${TEXEL_DENSITY.tolerance * 100} % of the ${list.classes.tier} class; the mean is closest to it` }),
      encode: rep,
    };
  }
  const facts = await measure(gltfOut);
  const scale = m.scale ?? 1;
  const boundsM = { min: facts.boundsM.min.map((v) => mm(v * scale)), max: facts.boundsM.max.map((v) => mm(v * scale)) };
  /** @type {Record<string, string>} */
  const files = {};
  for (const f of rest) {
    const k = fileKey(f.path, m.id, list.resolution);
    if (files[k]) throw new Error(`${m.id}: two files map to '${k}'`);
    files[k] = `${dir}/${f.path}`;
  }
  for (const im of plan.images) files[`${fileKey(im.uri, m.id, list.resolution)}_ktx2`] = `${dir}/${im.ktx}`;
  const cls = classOf(list, m, boundsM);
  const rt = list.runtime;
  const skip = facts.triangles > rt.maxTriangles && !rt.exceptFamilies.includes(m.family);
  const bin = rest.filter((f) => f.path.endsWith('.bin')).reduce((a, f) => a + f.bytes, 0);
  const jpegs = rest.filter((f) => !f.path.endsWith('.bin')).reduce((a, f) => a + f.bytes, 0);
  return {
    id: `models/${name}`,
    kind: 'model',
    path: `${dir}/${gltf.path}`,
    license: 'CC0-1.0',
    sources: [src.id],
    files,
    rebuild: list.recipe,
    digests,
    params: {
      title: src.title,
      family: m.family,
      class: cls,
      tier: list.classes.tier,
      ...(skip ? { skip: `${facts.triangles} triangles, over the renderer's ${rt.maxTriangles} per piece: not drawn` } : {}),
      mount: m.mount,
      ...(scale !== 1 ? { scale } : {}),
      boundsM,
      triangles: facts.triangles,
      frontYawDeg: m.frontYawDeg,
      frontAxis: frontAxis(m.frontYawDeg),
      up: '+y',
      units: 'metres',
      ...(m.note ? { note: m.note } : {}),
    },
    meta: {
      triangles: facts.triangles,
      ...(scale !== 1 ? { fileBounds: facts.boundsM } : {}),
      meshes: facts.meshes,
      materials: facts.materials,
      nodes: facts.nodes,
      extensionsUsed: facts.extensionsUsed,
      alphaModes: facts.alphaModes,
      doubleSided: facts.doubleSided,
      sizeBytes: Buffer.byteLength(plan.gltf) + bin + ktxBytes,
      fallbackBytes: jpegs,
      gpuBytes: gpu,
      textures,
      authors: src.authors,
      page: src.page,
    },
  };
}

/**
 * The local axis the model's front faces as shipped: rotating the model by `frontYawDeg` about +Y (right-hand rule,
 * three.js `rotation.y`) turns that axis to +Z.
 * @param {number} yaw
 */
export function frontAxis(yaw) {
  const r = ((yaw % 360) + 360) % 360;
  return /** @type {Record<number, string>} */ ({ 0: '+z', 90: '-x', 180: '-z', 270: '+x' })[r] ?? `yaw ${yaw}`;
}

/** @param {ModelList} list */
function manifestHead(list) {
  return {
    schema: 'survival-logs/asset-manifest@1',
    wp: list.wp,
    note:
      'Poly Haven models (CC0) at 1k: glTF 2.0 (.gltf + .bin), metres, +Y up. The .bin and the JPEG textures are the locked downloads, ' +
      'unchanged; every texture also has a KTX2 (Basis Universal: ETC1S color and data, UASTC normals) that the .gltf names as its ' +
      'KHR_texture_basisu source, the JPEG staying its fallback image, sized for the texel density of params.tier (meta.textures). ' +
      'params.class names the triangle budget (tools/art-metrics); params.skip marks a model the renderer does not draw. ' +
      'meta.sizeBytes is what the renderer downloads (.gltf, .bin, KTX2), meta.gpuBytes the KTX2 levels as 4 × 4-block textures on the GPU. ' +
      'params.frontYawDeg is the yaw about +Y (three.js rotation.y, degrees) that turns the model front to +Z; ' +
      'params.frontAxis is the local axis the front faces before that turn. params.boundsM is the box of the default scene in metres ' +
      '(after params.scale, a uniform scale the renderer applies where the file is not in metres; absent means 1). Origins are ' +
      "Poly Haven's: usually the centre of the footprint on the floor, the back plane (z = 0) for wall pieces, but not always, so place by boundsM. " +
      'Rebuilt by tools/models/fetch.mjs from assets/sources.lock.json.',
    families: list.families,
    rebuild: recipe(list),
  };
}

/** @param {unknown} v */
const stable = (v) => `${JSON.stringify(v, null, 2)}\n`;

async function main() {
  const argv = process.argv.slice(2);
  /** @type {string[]} */
  const only = [];
  let mode = 'build';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') only.push(argv[++i]);
    else if (a.startsWith('--only=')) only.push(a.slice(7));
    else if (a === '--lock' || a === '--verify') mode = a.slice(2);
    else if (a === '--help' || a === '-h') {
      const src = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n');
      console.log(src.slice(2, src.findIndex((l) => l.startsWith('import'))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
      return;
    } else throw new Error(`unknown argument ${a} (--lock, --verify, --only <name>)`);
  }
  const list = readList();
  const unknown = only.filter((n) => !list.models.some((m) => nameOf(m.id) === nameOf(n)));
  if (unknown.length) throw new Error(`not in tools/models/models.json: ${unknown.join(', ')}`);
  const models = only.length ? list.models.filter((m) => only.some((n) => nameOf(n) === nameOf(m.id))) : list.models;
  if (mode === 'lock') await lock(list, models);

  const ledger = JSON.parse(readFileSync(LOCK, 'utf8'));
  /** @type {Map<string, LockSource>} */
  const byId = new Map(ledger.sources.map((/** @type {LockSource} */ s) => [s.id, s]));
  const old = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : null;
  /** @type {Map<string, any>} */
  const entries = new Map((old?.assets || []).map((/** @type {any} */ e) => [e.id, e]));
  /** @type {string[]} */
  const problems = [];
  /** @type {[ModelSpec, LockSource][]} */
  const todo = [];
  for (const m of models) {
    const src = byId.get(sourceId(list, m));
    if (!src) {
      problems.push(`${m.id}: ${sourceId(list, m)} is not in assets/sources.lock.json (run --lock)`);
      continue;
    }
    if (mode === 'verify') {
      const before = problems.length;
      // the locked .bin and JPEGs are shipped unchanged; the .gltf is checked against its rebuild
      for (const f of src.files.slice(1)) {
        const p = join(ROOT, OUT, nameOf(m.id), ...f.path.split('/'));
        if (!existsSync(p)) problems.push(`${m.id}: ${relative(ROOT, p)} is missing`);
        else if (sha256(readFileSync(p)) !== f.sha256) problems.push(`${m.id}: ${relative(ROOT, p)} does not match the lock`);
      }
      if (problems.length > before) continue;
      const id = `models/${nameOf(m.id)}`;
      try {
        const want = await buildOne(list, m, src, { write: false, old: entries.get(id), problems });
        if (stable(entries.get(id)) !== stable(want)) problems.push(`${m.id}: the manifest entry ${id} is not what a rebuild writes`);
      } catch (err) {
        problems.push(`${m.id}: ${/** @type {Error} */ (err).message}`);
      }
      continue;
    }
    todo.push([m, src]);
  }
  // builds run a few at a time (each encode also runs ktx with a fixed thread count)
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(JOBS, todo.length) }, async () => {
      while (next < todo.length) {
        const [m, src] = todo[next++];
        try {
          entries.set(`models/${nameOf(m.id)}`, await buildOne(list, m, src, { write: true }));
          console.log(`built    ${OUT}/${nameOf(m.id)}/`);
        } catch (err) {
          problems.push(`${m.id}: ${/** @type {Error} */ (err).message}`);
        }
      }
    })
  );
  if (mode === 'verify') {
    const head = manifestHead(list);
    for (const k of /** @type {(keyof typeof head)[]} */ (Object.keys(head))) if (stable(old?.[k]) !== stable(head[k])) problems.push(`manifest: '${k}' is not what a rebuild writes`);
    // nothing stray under assets/models
    if (!only.length && existsSync(join(ROOT, OUT))) {
      const known = new Set(list.models.map((m) => nameOf(m.id)));
      for (const d of readdirSync(join(ROOT, OUT), { withFileTypes: true })) if (d.isDirectory() && !known.has(d.name)) problems.push(`${OUT}/${d.name}/ is not in the pinned list`);
    }
  } else {
    // the manifest: entries in list order; entries of models built earlier are kept
    const order = list.models.map((m) => `models/${nameOf(m.id)}`);
    const assets = order.filter((id) => entries.has(id)).map((id) => entries.get(id));
    mkdirSync(dirname(MANIFEST), { recursive: true });
    writeFileSync(MANIFEST, stable({ ...manifestHead(list), assets }));
  }
  const summary = `${models.length - new Set(problems.map((p) => p.split(':')[0])).size}/${models.length} model(s) ${mode === 'verify' ? 'verified' : 'built'}`;
  for (const p of problems) console.log(`  ✖ ${p}`);
  console.log(summary);
  if (problems.length) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`models/fetch: ${err.message}`);
    process.exit(1);
  });
}

