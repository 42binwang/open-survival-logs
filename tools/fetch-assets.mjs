#!/usr/bin/env node
// @ts-check
// Restores assets/cache/ from the asset lock and adds new sources to it.
//
//   node tools/fetch-assets.mjs --verify [--only <id>] [--offline] [--jobs 4]
//       Downloads every locked source that is missing from assets/cache/, verifies the SHA-256 of every
//       file (and of every unpacked archive member), unpacks archives. Exit code 1 on any failure; the last
//       output line is JSON {ok, summary, problems}: step 1 of tools/asset-lock.mjs, which the gate's
//       'asset-lock' check runs, reads it.
//   node tools/fetch-assets.mjs --add <ref> [--use <what>]... [--wp WP-P0-05] [options]
//       <ref> is one of
//         ambientcg:<AssetId>[@<attribute>]        e.g. ambientcg:PaintedPlaster017@2K-PNG
//         polyhaven:<slug>[@<res>]                 e.g. polyhaven:oak_wood_planks@2k --maps diff,nor_gl,rough,ao,disp
//                                                  HDRIs: polyhaven:studio_small_09@2k (format hdr)
//         googlefonts:<dir>@<commit>               e.g. googlefonts:ofl/notosans@<40-hex commit>
//                                                  --file 'NotoSans[wdth,wght].ttf' --file OFL.txt --author '…'
//         https://...  (needs --id, --license, --title, --author; --unpack zip for archives)
//       Downloads, hashes and unpacks the source, then writes the entry into assets/lock/<wp>.json and
//       regenerates assets/credits/<wp>.md. Re-adding an id replaces its entry (the files are re-hashed).
//   node tools/fetch-assets.mjs --remove <id> [--wp WP-P0-05]  drop a source from the fragment (cache left alone)
//   node tools/fetch-assets.mjs --list
//   node tools/fetch-assets.mjs --credits [--wp WP-P0-05]     regenerate the credits fragment only
//
// Sources are read from assets/sources.lock.json (merged by the integrator) and assets/lock/*.json (fragments).
// Only hosts of the allowed providers (docs/wp/README.md) are accepted unless --allow-host <host> is given.

import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { crc32, inflateRawSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'assets', 'cache');
const LOCK_DIR = join(ROOT, 'assets', 'lock');
const CREDITS_DIR = join(ROOT, 'assets', 'credits');
const MERGED_LOCK = join(ROOT, 'assets', 'sources.lock.json');
const UA = 'SurvivalLogs-asset-fetch/1 (private build; +https://github.com/)';

/** Hosts of the allowed sources (docs/wp/README.md). Redirect targets are not checked, the initial URL is. */
export const ALLOWED_HOSTS = [
  'ambientcg.com',
  'polyhaven.com',
  'dl.polyhaven.org',
  'api.polyhaven.com',
  'kenney.nl',
  'github.com',
  'mocap.cs.cmu.edu',
  'static.makehumancommunity.org',
  'files.makehumancommunity.org',
  'files2.makehumancommunity.org',
  'extensions.blender.org',
  'download.tuxfamily.org',
  'sonniss.com',
];

/** @typedef {{ url: string, path: string, bytes: number, sha256: string, md5?: string, unpack?: 'zip', members?: Record<string, string> }} LockFile */
/** @typedef {{ id: string, provider: string, title: string, page?: string, license: string, licenseUrl?: string,
 *   authors: string[], kind: string, creationMethod?: string, physicalSizeM?: number[] | null, usedFor: string[],
 *   retrieved: string, files: LockFile[], notes?: string }} LockSource */
/** @typedef {{ schema: number, wp: string, sources: LockSource[] }} LockFragment */

// ---------------------------------------------------------------------------------------------- utils

/** @param {string} id */
export function cacheDirFor(id) {
  if (!/^[A-Za-z0-9._@-]+(\/[A-Za-z0-9._@-]+)*$/.test(id) || id.split('/').includes('..')) {
    throw new Error(`invalid source id "${id}"`);
  }
  return join(CACHE, ...id.split('/'));
}

/** @param {string} file */
export async function sha256File(file) {
  const h = createHash('sha256');
  await pipeline(createReadStream(file), h);
  return h.digest('hex');
}

/** @param {Uint8Array} buf */
const sha256Buf = (buf) => createHash('sha256').update(buf).digest('hex');

/** @param {string} url @param {string[]} extraHosts */
function checkHost(url, extraHosts) {
  const host = new URL(url).hostname;
  const ok = [...ALLOWED_HOSTS, ...extraHosts].some((h) => host === h || host.endsWith(`.${h}`));
  if (!ok) throw new Error(`host ${host} is not an allowed asset source (docs/wp/README.md); use --allow-host to override`);
}

/** @param {string} url */
async function getJson(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
  return res.json();
}

/**
 * Streams url to dest (atomically), returning its SHA-256, MD5 and size.
 * @param {string} url @param {string} dest
 */
async function download(url, dest, attempts = 4, stallMs = 60_000) {
  mkdirSync(dirname(dest), { recursive: true });
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    const part = `${dest}.part`;
    const ctrl = new AbortController();
    let timer = setTimeout(() => ctrl.abort(new Error(`no data for ${stallMs / 1000} s`)), stallMs);
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow', signal: ctrl.signal });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const sha = createHash('sha256');
      const md5 = createHash('md5');
      let bytes = 0;
      const body = Readable.fromWeb(/** @type {any} */ (res.body));
      body.on('data', (/** @type {Buffer} */ chunk) => {
        sha.update(chunk);
        md5.update(chunk);
        bytes += chunk.length;
        clearTimeout(timer);
        timer = setTimeout(() => ctrl.abort(new Error(`stalled after ${bytes} bytes`)), stallMs);
      });
      await pipeline(body, createWriteStream(part));
      renameSync(part, dest);
      return { sha256: sha.digest('hex'), md5: md5.digest('hex'), bytes };
    } catch (err) {
      lastErr = err;
      rmSync(part, { force: true });
      console.error(`  attempt ${i + 1}/${attempts} failed for ${url}: ${/** @type {Error} */ (err).message}`);
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`download failed ${url}: ${/** @type {Error} */ (lastErr).message}`);
}

// ----------------------------------------------------------------------------------------------- zip

/**
 * Lists the entries of a zip archive (stored or deflated; zip64 sizes supported).
 * @param {Buffer} buf
 */
export function zipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip archive (no end of central directory)');
  let count = buf.readUInt16LE(eocd + 10);
  let cdOffset = buf.readUInt32LE(eocd + 16);
  if (cdOffset === 0xffffffff || count === 0xffff) {
    const loc = eocd - 20;
    if (loc < 0 || buf.readUInt32LE(loc) !== 0x07064b50) throw new Error('zip64 locator missing');
    const z64 = Number(buf.readBigUInt64LE(loc + 8));
    count = Number(buf.readBigUInt64LE(z64 + 32));
    cdOffset = Number(buf.readBigUInt64LE(z64 + 48));
  }
  const entries = [];
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('corrupt zip central directory');
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    let csize = buf.readUInt32LE(p + 20);
    let usize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    let local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    let e = p + 46 + nameLen;
    const extraEnd = e + extraLen;
    while (e + 4 <= extraEnd) {
      const tag = buf.readUInt16LE(e);
      const size = buf.readUInt16LE(e + 2);
      if (tag === 0x0001) {
        let q = e + 4;
        if (usize === 0xffffffff) (usize = Number(buf.readBigUInt64LE(q))), (q += 8);
        if (csize === 0xffffffff) (csize = Number(buf.readBigUInt64LE(q))), (q += 8);
        if (local === 0xffffffff) local = Number(buf.readBigUInt64LE(q));
      }
      e += 4 + size;
    }
    entries.push({ name, method, crc, csize, usize, local });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * @param {Buffer} buf
 * @param {ReturnType<typeof zipEntries>[number]} entry
 */
export function zipRead(buf, entry) {
  if (buf.readUInt32LE(entry.local) !== 0x04034b50) throw new Error(`corrupt zip local header for ${entry.name}`);
  const start = entry.local + 30 + buf.readUInt16LE(entry.local + 26) + buf.readUInt16LE(entry.local + 28);
  const raw = buf.subarray(start, start + entry.csize);
  let data;
  if (entry.method === 0) data = raw;
  else if (entry.method === 8) data = inflateRawSync(raw);
  else throw new Error(`unsupported zip compression method ${entry.method} for ${entry.name}`);
  if (data.length !== entry.usize || crc32(data) >>> 0 !== entry.crc >>> 0) throw new Error(`CRC mismatch for ${entry.name}`);
  return data;
}

/** Members worth unpacking: images and text; skips engine-specific scene files. */
const UNPACK_EXT = /\.(png|jpe?g|exr|hdr|tif?f|ogg|wav|flac|txt|md|json|wasm|js|cjs)$/i;

/**
 * Unpacks the wanted members of a zip into dir and returns their SHA-256 map.
 * @param {string} zipPath @param {string} dir
 */
function unpackZip(zipPath, dir) {
  const buf = readFileSync(zipPath);
  /** @type {Record<string, string>} */
  const members = {};
  for (const entry of zipEntries(buf)) {
    if (entry.name.endsWith('/') || !UNPACK_EXT.test(entry.name)) continue;
    const rel = normalize(entry.name);
    if (rel.startsWith('..') || rel.startsWith(sep) || /^[A-Za-z]:/.test(rel)) throw new Error(`unsafe zip member ${entry.name}`);
    const data = zipRead(buf, entry);
    const out = join(dir, rel);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, data);
    members[rel.split(sep).join('/')] = sha256Buf(data);
  }
  return members;
}

// ----------------------------------------------------------------------------------------------- lock

/** @returns {{ sources: LockSource[], origin: Map<string, string> }} */
export function readLock() {
  /** @type {Map<string, LockSource>} */
  const byId = new Map();
  /** @type {Map<string, string>} */
  const origin = new Map();
  const files = [];
  if (existsSync(MERGED_LOCK)) files.push(MERGED_LOCK);
  if (existsSync(LOCK_DIR)) {
    for (const f of readdirSync(LOCK_DIR).sort()) if (f.endsWith('.json')) files.push(join(LOCK_DIR, f));
  }
  for (const file of files) {
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    for (const src of doc.sources ?? []) {
      const prev = byId.get(src.id);
      if (prev) {
        const a = JSON.stringify(prev.files.map((f) => [f.path, f.sha256]));
        const b = JSON.stringify(src.files.map((/** @type {LockFile} */ f) => [f.path, f.sha256]));
        if (a !== b) throw new Error(`lock conflict for ${src.id}: ${origin.get(src.id)} and ${relative(ROOT, file)} disagree`);
        continue;
      }
      byId.set(src.id, src);
      origin.set(src.id, relative(ROOT, file));
    }
  }
  return { sources: [...byId.values()], origin };
}

/** @param {string} wp @returns {LockFragment} */
function readFragment(wp) {
  const file = join(LOCK_DIR, `${wp}.json`);
  if (!existsSync(file)) return { schema: 1, wp, sources: [] };
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** @param {LockFragment} frag */
function writeFragment(frag) {
  mkdirSync(LOCK_DIR, { recursive: true });
  frag.sources.sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(join(LOCK_DIR, `${frag.wp}.json`), `${JSON.stringify(frag, null, 2)}\n`);
}

/** @param {LockFragment} frag */
function writeCredits(frag) {
  mkdirSync(CREDITS_DIR, { recursive: true });
  const esc = (/** @type {string} */ s) => String(s).replace(/\|/g, '\\|');
  const assets = frag.sources.filter((s) => s.kind !== 'tool');
  const tools = frag.sources.filter((s) => s.kind === 'tool');
  const lines = [
    `# Credits — ${frag.wp}`,
    '',
    `Generated by \`node tools/fetch-assets.mjs\` from \`assets/lock/${frag.wp}.json\` (which also lists the SHA-256 of`,
    'every unpacked archive member). The integrator merges this fragment into `assets/CREDITS.md`.',
    '',
    '## Assets',
    '',
    '| Asset | Provider | Author(s) | License | Made by | Used for |',
    '| --- | --- | --- | --- | --- | --- |',
    ...assets.map(
      (s) =>
        `| [${esc(s.title)}](${s.page ?? s.files[0].url}) (\`${s.id}\`) | ${esc(s.provider)} | ${esc(s.authors.join(', '))} | ` +
        `[${s.license}](${s.licenseUrl ?? 'https://creativecommons.org/publicdomain/zero/1.0/'}) | ${esc(s.creationMethod ?? '—')} | ${esc(s.usedFor.join(', '))} |`,
    ),
    '',
  ];
  if (tools.length) {
    lines.push('## Tools', '', '| Tool | Author(s) | License | Used for |', '| --- | --- | --- | --- |');
    for (const s of tools) {
      lines.push(`| [${esc(s.title)}](${s.page ?? s.files[0].url}) | ${esc(s.authors.join(', '))} | ${s.license} | ${esc(s.usedFor.join(', '))} |`);
    }
    lines.push('');
  }
  lines.push('## Downloads (URL and SHA-256)', '');
  for (const s of frag.sources) {
    lines.push(`- \`${s.id}\``);
    for (const f of s.files) lines.push(`  - ${f.url} — ${f.bytes} bytes — \`${f.sha256}\``);
  }
  lines.push('');
  writeFileSync(join(CREDITS_DIR, `${frag.wp}.md`), lines.join('\n'));
}

// --------------------------------------------------------------------------------------------- verify

/** Makes sure assets/cache never gets committed, whatever the root .gitignore says. */
function guardCache() {
  mkdirSync(CACHE, { recursive: true });
  const gi = join(CACHE, '.gitignore');
  if (!existsSync(gi)) writeFileSync(gi, '# restorable by node tools/fetch-assets.mjs --verify\n*\n');
}

/**
 * @param {LockSource} src
 * @param {{ offline: boolean, allowHosts: string[] }} opts
 * @returns {Promise<{ id: string, fetched: number, ok: boolean, errors: string[] }>}
 */
async function restoreSource(src, opts) {
  const dir = cacheDirFor(src.id);
  const errors = [];
  let fetched = 0;
  for (const f of src.files) {
    const dest = join(dir, f.path);
    try {
      let good = existsSync(dest) && statSync(dest).size === f.bytes && (await sha256File(dest)) === f.sha256;
      if (!good) {
        if (opts.offline) throw new Error('missing or corrupt (offline)');
        checkHost(f.url, opts.allowHosts);
        const got = await download(f.url, dest);
        fetched++;
        if (got.sha256 !== f.sha256) throw new Error(`SHA-256 mismatch: locked ${f.sha256}, downloaded ${got.sha256}`);
        good = true;
      }
      if (f.unpack === 'zip') {
        const members = f.members ?? {};
        let intact = Object.keys(members).length > 0;
        for (const [name, sha] of Object.entries(members)) {
          const p = join(dir, name);
          if (!existsSync(p) || (await sha256File(p)) !== sha) {
            intact = false;
            break;
          }
        }
        if (!intact) {
          const got = unpackZip(dest, dir);
          for (const [name, sha] of Object.entries(members)) {
            if (got[name] !== sha) throw new Error(`unpacked member ${name} does not match the lock`);
          }
        }
      }
    } catch (err) {
      errors.push(`${f.path}: ${/** @type {Error} */ (err).message}`);
    }
  }
  return { id: src.id, fetched, ok: errors.length === 0, errors };
}

/** @template T, R @param {T[]} items @param {number} n @param {(t: T) => Promise<R>} fn */
async function pool(items, n, fn) {
  /** @type {R[]} */
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

// ------------------------------------------------------------------------------------------------ add

const today = () => new Date().toISOString().slice(0, 10);

/** @param {unknown} v @returns {string[]} */
const list = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v.map(String) : [String(v)]);

/** ambientCG's creationMethodName is the same for every asset; the creationMethod code is the reliable field. */
const ACG_METHOD = {
  PBRPhotogrammetry: 'Photogrammetry scan',
  PBRMultiAngle: 'Multi-angle photo scan',
  PBRApproximated: 'Photo with approximated PBR maps',
  PBRProcedural: 'Procedural (Substance Designer)',
};

/**
 * @param {string} ref
 * @param {Record<string, any>} a parsed args
 * @returns {Promise<Omit<LockSource, 'files' | 'usedFor' | 'retrieved'> & { downloads: { url: string, path: string, md5?: string, unpack?: 'zip' }[] }>}
 */
async function resolveRef(ref, a) {
  if (ref.startsWith('ambientcg:')) {
    const [assetId, attr = '2K-PNG'] = ref.slice('ambientcg:'.length).split('@');
    const q = new URLSearchParams({ id: assetId, include: 'downloadData,tagData,dimensionsData' });
    const doc = await getJson(`https://ambientcg.com/api/v2/full_json?${q}`);
    const asset = doc.foundAssets?.find((/** @type {any} */ x) => x.assetId === assetId);
    if (!asset) throw new Error(`ambientCG asset ${assetId} not found`);
    const dl = asset.downloadFolders?.default?.downloadFiletypeCategories?.zip?.downloads?.find((/** @type {any} */ d) => d.attribute === attr);
    if (!dl) throw new Error(`ambientCG ${assetId} has no ${attr} download`);
    const dims = asset.dimensionX && asset.dimensionY ? [asset.dimensionX / 100, asset.dimensionY / 100] : null;
    return {
      id: `ambientcg/${assetId}@${attr}`,
      provider: 'ambientCG',
      title: asset.displayName || assetId,
      page: `https://ambientcg.com/view?id=${assetId}`,
      license: 'CC0-1.0',
      licenseUrl: 'https://docs.ambientcg.com/license/',
      authors: ['Lennart Demes (ambientCG)'],
      kind: asset.dataType === 'HDRI' ? 'hdri' : 'texture',
      creationMethod: /** @type {Record<string, string>} */ (ACG_METHOD)[asset.creationMethod] ?? asset.creationMethod ?? undefined,
      physicalSizeM: dims,
      downloads: [{ url: dl.downloadLink, path: dl.fileName, unpack: 'zip' }],
    };
  }
  if (ref.startsWith('polyhaven:')) {
    const [slug, res = '2k'] = ref.slice('polyhaven:'.length).split('@');
    const info = await getJson(`https://api.polyhaven.com/info/${slug}`);
    const files = await getJson(`https://api.polyhaven.com/files/${slug}`);
    const authors = Object.keys(info.authors ?? {});
    const base = {
      provider: 'Poly Haven',
      title: info.name ?? slug,
      page: `https://polyhaven.com/a/${slug}`,
      license: 'CC0-1.0',
      licenseUrl: 'https://polyhaven.com/license',
      authors,
    };
    if (info.type === 0) {
      const fmt = a.format ?? 'hdr';
      const f = files.hdri?.[res]?.[fmt];
      if (!f) throw new Error(`Poly Haven HDRI ${slug} has no ${res} ${fmt}`);
      return {
        ...base,
        id: `polyhaven/${slug}@${res}`,
        kind: 'hdri',
        creationMethod: 'HDR panorama capture',
        physicalSizeM: null,
        downloads: [{ url: f.url, path: f.url.split('/').pop(), md5: f.md5 }],
      };
    }
    const fmt = a.format ?? 'png';
    /** Poly Haven map names -> keys of the files API. */
    const keyOf = { diff: 'Diffuse', nor_gl: 'nor_gl', nor_dx: 'nor_dx', rough: 'Rough', ao: 'AO', disp: 'Displacement', arm: 'arm', metal: 'Metal', spec: 'spec', bump: 'Bump', opacity: 'Opacity' };
    const maps = String(a.maps ?? 'diff,nor_gl,rough,ao,disp').split(',');
    const downloads = maps.map((m) => {
      const key = /** @type {Record<string,string>} */ (keyOf)[m] ?? m;
      const f = files[key]?.[res]?.[fmt] ?? files[key]?.[res]?.jpg;
      if (!f) throw new Error(`Poly Haven ${slug} has no ${m} (${key}) map at ${res}`);
      return { url: f.url, path: f.url.split('/').pop(), md5: f.md5 };
    });
    const dims = Array.isArray(info.dimensions) ? info.dimensions.map((/** @type {number} */ mm) => Math.round(mm) / 1000) : null;
    return { ...base, id: `polyhaven/${slug}@${res}`, kind: 'texture', creationMethod: 'Photoscan', physicalSizeM: dims, downloads };
  }
  if (ref.startsWith('googlefonts:')) {
    const [dir, commit] = ref.slice('googlefonts:'.length).split('@');
    if (!/^(ofl|apache|ufl)\/[a-z0-9]+$/.test(dir ?? '') || !/^[0-9a-f]{40}$/.test(commit ?? '')) throw new Error('googlefonts:<license dir>/<family>@<40-hex commit> expected, e.g. googlefonts:ofl/notosans@b5efa9c…');
    const names = list(a.file);
    if (!names.length) throw new Error('--add googlefonts:… needs --file <name> per file (the font files and OFL.txt)');
    if (!a.author) throw new Error('--add googlefonts:… needs --author');
    const raw = (/** @type {string} */ n) => `https://github.com/google/fonts/raw/${commit}/${dir}/${encodeURIComponent(n).replace(/%2C/g, ',')}`;
    return {
      id: `googlefonts/${dir.split('/')[1]}@${commit.slice(0, 12)}`,
      provider: 'Google Fonts (github.com/google/fonts)',
      title: a.title ?? dir.split('/')[1],
      page: `https://github.com/google/fonts/tree/${commit}/${dir}`,
      license: dir.startsWith('ofl/') ? 'OFL-1.1' : a.license,
      licenseUrl: dir.startsWith('ofl/') ? raw('OFL.txt') : a['license-url'],
      authors: list(a.author),
      kind: 'font',
      creationMethod: a['made-by'] ?? 'Variable TrueType font',
      physicalSizeM: null,
      downloads: names.map((n) => ({ url: raw(n), path: n })),
    };
  }
  if (/^https:\/\//.test(ref)) {
    for (const k of ['id', 'license', 'title', 'author']) if (!a[k]) throw new Error(`--add <url> needs --${k}`);
    return {
      id: a.id,
      provider: a.provider ?? new URL(ref).hostname,
      title: a.title,
      page: a.page,
      license: a.license,
      licenseUrl: a['license-url'],
      authors: list(a.author),
      kind: a.kind ?? 'file',
      creationMethod: a['made-by'],
      physicalSizeM: null,
      downloads: [{ url: ref, path: a.path ?? decodeURIComponent(new URL(ref).pathname.split('/').pop() ?? 'download'), unpack: a.unpack }],
    };
  }
  throw new Error(`unknown source reference "${ref}"`);
}

/** @param {string} ref @param {Record<string, any>} a */
async function add(ref, a) {
  const wp = a.wp ?? 'WP-P0-05';
  const allowHosts = list(a['allow-host']);
  const r = await resolveRef(ref, a);
  const id = a.id && !/^https:/.test(ref) ? a.id : r.id;
  const dir = cacheDirFor(id);
  /** @type {LockFile[]} */
  const files = [];
  for (const d of r.downloads) {
    checkHost(d.url, allowHosts);
    const dest = join(dir, d.path);
    const got = await download(d.url, dest);
    if (d.md5 && d.md5 !== got.md5) throw new Error(`${d.url}: provider MD5 ${d.md5} does not match download ${got.md5}`);
    /** @type {LockFile} */
    const lf = { url: d.url, path: d.path, bytes: got.bytes, sha256: got.sha256 };
    if (d.md5) lf.md5 = d.md5;
    if (d.unpack === 'zip') {
      lf.unpack = 'zip';
      lf.members = unpackZip(dest, dir);
    }
    files.push(lf);
    console.log(`  ${d.path}  ${got.bytes} bytes  sha256 ${got.sha256}`);
  }
  const frag = readFragment(wp);
  const prev = frag.sources.find((s) => s.id === id);
  const usedFor = [...new Set([...(prev?.usedFor ?? []), ...list(a.use)])];
  /** @type {LockSource} */
  const entry = {
    id,
    provider: r.provider,
    title: r.title,
    page: r.page,
    license: r.license,
    licenseUrl: r.licenseUrl,
    authors: r.authors,
    kind: a.kind ?? r.kind,
    creationMethod: r.creationMethod,
    physicalSizeM: r.physicalSizeM,
    usedFor,
    retrieved: today(),
    files,
  };
  if (a.notes ?? prev?.notes) entry.notes = a.notes ?? prev?.notes;
  for (const k of /** @type {(keyof LockSource)[]} */ (Object.keys(entry))) if (entry[k] === undefined) delete entry[k];
  frag.sources = frag.sources.filter((s) => s.id !== id).concat(entry);
  writeFragment(frag);
  writeCredits(frag);
  console.log(`locked ${id} in assets/lock/${wp}.json (${files.length} file${files.length === 1 ? '' : 's'})`);
}

// ----------------------------------------------------------------------------------------------- main

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {Record<string, any>} */
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith('--')) {
      out._.push(t);
      continue;
    }
    const [k, inline] = t.slice(2).split(/=(.*)/s);
    const flag = ['verify', 'offline', 'list', 'credits', 'help'].includes(k);
    const v = flag ? true : inline ?? argv[++i];
    if (out[k] === undefined) out[k] = v;
    else out[k] = [...(Array.isArray(out[k]) ? out[k] : [out[k]]), v];
  }
  return out;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.help || (!a.verify && !a.add && !a.list && !a.credits && !a.remove)) {
    const src = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n');
    console.log(src.slice(2, src.findIndex((l) => l.startsWith('import'))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    process.exit(a.help ? 0 : 2);
  }
  if (a.credits) {
    writeCredits(readFragment(a.wp ?? 'WP-P0-05'));
    console.log(`wrote assets/credits/${a.wp ?? 'WP-P0-05'}.md`);
    return;
  }
  if (a.remove) {
    const frag = readFragment(a.wp ?? 'WP-P0-05');
    const ids = list(a.remove);
    const missing = ids.filter((id) => !frag.sources.some((s) => s.id === id));
    if (missing.length) throw new Error(`not in assets/lock/${frag.wp}.json: ${missing.join(', ')}`);
    frag.sources = frag.sources.filter((s) => !ids.includes(s.id));
    writeFragment(frag);
    writeCredits(frag);
    console.log(`removed ${ids.join(', ')} from assets/lock/${frag.wp}.json`);
    return;
  }
  if (a.list) {
    const { sources, origin } = readLock();
    for (const s of sources) console.log(`${s.id.padEnd(48)} ${s.license.padEnd(10)} ${String(s.files.length).padStart(2)} file(s)  ${origin.get(s.id)}`);
    return;
  }
  guardCache();
  if (a.add) {
    for (const ref of list(a.add)) await add(ref, a);
    return;
  }
  const { sources } = readLock();
  const only = list(a.only);
  const wanted = only.length ? sources.filter((s) => only.includes(s.id)) : sources;
  if (only.length && wanted.length !== only.length) throw new Error(`unknown id in --only: ${only.filter((id) => !sources.some((s) => s.id === id)).join(', ')}`);
  const opts = { offline: Boolean(a.offline), allowHosts: list(a['allow-host']) };
  const results = await pool(wanted, Number(a.jobs ?? 4), (s) => restoreSource(s, opts));
  let failed = 0;
  for (const r of results) {
    if (r.ok) console.log(`ok       ${r.id}${r.fetched ? `  (downloaded ${r.fetched})` : ''}`);
    else {
      failed++;
      console.log(`FAILED   ${r.id}\n         ${r.errors.join('\n         ')}`);
    }
  }
  const files = wanted.reduce((n, s) => n + s.files.length, 0);
  const summary = `${wanted.length - failed}/${wanted.length} sources verified (${files} files) in assets/cache/`;
  console.log(summary);
  // last line for tools/asset-lock.mjs (it reads the final JSON line of this output)
  const problems = results.filter((r) => !r.ok).flatMap((r) => r.errors.map((e) => `${r.id}: ${e}`));
  console.log(JSON.stringify({ ok: failed === 0, summary, problems }));
  if (failed) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`fetch-assets: ${err.message}`);
    process.exit(1);
  });
}
