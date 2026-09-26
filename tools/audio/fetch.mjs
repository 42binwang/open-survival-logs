#!/usr/bin/env node
// @ts-check
// Downloads and verifies the audio lane's sources (assets/lock/WP-P0-06.json) into assets/cache/.
//
//   node tools/audio/fetch.mjs            restore every locked file that is missing, verify every SHA-256
//   node tools/audio/fetch.mjs --offline  verify only (exit 1 if anything is missing or corrupt)
//
// The build scripts call ensureFiles() / ensureZip(): a file that is not locked yet is downloaded, hashed and added
// to the lock (unless --frozen / AUDIO_FROZEN=1, which turns any new download into an error).

import { createHash } from 'node:crypto';
import { appendFileSync, createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { inflateRawSync } from 'node:zlib';
import { CACHE, cacheDir, readLock, writeLock } from './lock.mjs';
import { BUILD } from './lib/io.mjs';

/** Where a full build (tools/audio/build.mjs) records every locked file and zip member it used, to prune the rest. */
export const USAGE_LOG = join(BUILD, 'usage.jsonl');
/** @param {Record<string, unknown>} entry */
function logUsage(entry) {
  if (!process.env.AUDIO_TRACK_USAGE) return;
  mkdirSync(dirname(USAGE_LOG), { recursive: true });
  appendFileSync(USAGE_LOG, `${JSON.stringify(entry)}\n`);
}

const UA = 'SurvivalLogs-audio-fetch/1 (private build)';
const today = () => new Date().toISOString().slice(0, 10);
export const frozen = () => process.argv.includes('--frozen') || process.env.AUDIO_FROZEN === '1' || process.env.ASSET_LOCK_SANDBOX === '1';

/** @param {string} file */
async function sha256File(file) {
  const h = createHash('sha256');
  await pipeline(createReadStream(file), h);
  return h.digest('hex');
}

/** Keeps the cache out of git whatever the root .gitignore says (same guard as tools/fetch-assets.mjs). */
function guardCache() {
  mkdirSync(CACHE, { recursive: true });
  const gi = join(CACHE, '.gitignore');
  if (!existsSync(gi)) writeFileSync(gi, '# restorable by node tools/fetch-assets.mjs --verify / node tools/audio/fetch.mjs\n*\n');
}

/**
 * @param {string} url
 * @param {string} dest
 * @returns {Promise<{ sha256: string, bytes: number }>}
 */
async function download(url, dest, attempts = 4) {
  mkdirSync(dirname(dest), { recursive: true });
  /** @type {unknown} */
  let last;
  for (let i = 0; i < attempts; i++) {
    const part = `${dest}.part`;
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const h = createHash('sha256');
      let bytes = 0;
      const body = Readable.fromWeb(/** @type {any} */ (res.body));
      body.on('data', (/** @type {Buffer} */ c) => {
        h.update(c);
        bytes += c.length;
      });
      await pipeline(body, createWriteStream(part));
      renameSync(part, dest);
      return { sha256: h.digest('hex'), bytes };
    } catch (err) {
      last = err;
      rmSync(part, { force: true });
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw new Error(`download failed ${url}: ${/** @type {Error} */ (last).message}`);
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

/**
 * @typedef {Omit<import('./lock.mjs').LockSource, 'files' | 'retrieved' | 'usedFor'> & { usedFor?: string[] }} SourceMeta
 */

/**
 * Makes sure every file of a source is cached and locked; returns their local paths (same order).
 * @param {SourceMeta} meta
 * @param {{ url: string, path: string }[]} files
 * @param {string[]} [usedFor]
 */
export async function ensureFiles(meta, files, usedFor = []) {
  guardCache();
  for (const f of files) logUsage({ id: meta.id, path: f.path, usedFor });
  const lock = readLock();
  let src = lock.sources.find((s) => s.id === meta.id);
  if (!src) {
    if (frozen()) throw new Error(`source ${meta.id} is not in the lock (frozen)`);
    src = { ...meta, usedFor: [], retrieved: today(), files: [] };
    lock.sources.push(src);
  }
  const dir = cacheDir(meta.id);
  let changed = false;
  const paths = await pool(files, 8, async (f) => {
    const dest = join(dir, f.path);
    const locked = /** @type {import('./lock.mjs').LockSource} */ (src).files.find((x) => x.path === f.path);
    if (locked) {
      if (existsSync(dest) && statSync(dest).size === locked.bytes && (await sha256File(dest)) === locked.sha256) return dest;
      const got = await download(locked.url, dest);
      if (got.sha256 !== locked.sha256) throw new Error(`SHA-256 mismatch for ${meta.id}/${f.path}: locked ${locked.sha256}, got ${got.sha256}`);
      return dest;
    }
    if (frozen()) throw new Error(`${meta.id}/${f.path} is not locked (frozen)`);
    const got = await download(f.url, dest);
    /** @type {import('./lock.mjs').LockSource} */ (src).files.push({ url: f.url, path: f.path, bytes: got.bytes, sha256: got.sha256 });
    changed = true;
    return dest;
  });
  const before = src.usedFor.length;
  src.usedFor = [...new Set([...src.usedFor, ...usedFor])];
  if (changed || src.usedFor.length !== before) {
    // Re-read and merge so concurrent ensureFiles calls in one process do not drop each other's entries.
    const fresh = readLock();
    const i = fresh.sources.findIndex((s) => s.id === meta.id);
    if (i < 0) fresh.sources.push(src);
    else {
      const have = new Set(fresh.sources[i].files.map((x) => x.path));
      for (const f of src.files) if (!have.has(f.path)) fresh.sources[i].files.push(f);
      fresh.sources[i].usedFor = [...new Set([...fresh.sources[i].usedFor, ...src.usedFor])];
    }
    writeLock(fresh);
  }
  return paths;
}

// ------------------------------------------------------------------------------------------------ zip

/**
 * Central-directory listing of a zip (stored or deflated members).
 * @param {Buffer} buf
 */
function zipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip archive');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  /** @type {{ name: string, method: number, csize: number, usize: number, local: number }[]} */
  const out = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('corrupt zip central directory');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    out.push({ name: buf.toString('utf8', p + 46, p + 46 + nameLen), method, csize, usize, local });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** @param {Buffer} buf @param {ReturnType<typeof zipEntries>[number]} e */
function zipRead(buf, e) {
  const start = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
  const raw = buf.subarray(start, start + e.csize);
  if (e.method === 0) return Buffer.from(raw);
  if (e.method === 8) return inflateRawSync(raw);
  throw new Error(`unsupported zip method ${e.method} for ${e.name}`);
}

/**
 * Caches and locks a zip, then extracts the named members (by base name or full name) next to it.
 * @param {SourceMeta} meta
 * @param {{ url: string, path: string }} zip
 * @param {string[]} members  base names such as 'footstep_wood_000.ogg'
 * @param {string[]} [usedFor]
 * @returns {Promise<Record<string, string>>} member base name -> extracted local path
 */
export async function ensureZip(meta, zip, members, usedFor = []) {
  const [zipPath] = await ensureFiles(meta, [zip], usedFor);
  const dir = cacheDir(meta.id);
  const buf = readFileSync(zipPath);
  const entries = zipEntries(buf);
  const lock = readLock();
  const src = /** @type {import('./lock.mjs').LockSource} */ (lock.sources.find((s) => s.id === meta.id));
  const lf = /** @type {import('./lock.mjs').LockFile} */ (src.files.find((f) => f.path === zip.path));
  lf.members ??= {};
  /** @type {Record<string, string>} */
  const out = {};
  let changed = false;
  for (const m of members) {
    const e = entries.find((x) => x.name === m || x.name.endsWith(`/${m}`));
    if (!e) throw new Error(`${zip.path} has no member ${m}`);
    const rel = normalize(e.name);
    if (rel.startsWith('..') || rel.startsWith(sep)) throw new Error(`unsafe zip member ${e.name}`);
    const data = zipRead(buf, e);
    const sha = createHash('sha256').update(data).digest('hex');
    const key = rel.split(sep).join('/');
    logUsage({ id: meta.id, path: zip.path, member: key, usedFor });
    if (lf.members[key] && lf.members[key] !== sha) throw new Error(`member ${key} of ${zip.path} does not match the lock`);
    if (!lf.members[key]) {
      if (frozen()) throw new Error(`member ${key} of ${meta.id} is not locked (frozen)`);
      lf.members[key] = sha;
      changed = true;
    }
    const dest = join(dir, 'unpacked', rel);
    if (!existsSync(dest) || statSync(dest).size !== data.length) {
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, data);
    }
    out[m] = dest;
  }
  if (changed) {
    lf.members = Object.fromEntries(Object.entries(lf.members).sort(([a], [b]) => a.localeCompare(b)));
    writeLock(lock);
  }
  return out;
}

/** GitHub raw URL at a pinned commit (github.com redirects to raw.githubusercontent.com). */
export function githubRaw(/** @type {string} */ repo, /** @type {string} */ commit, /** @type {string} */ path) {
  return `https://github.com/${repo}/raw/${commit}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

// ------------------------------------------------------------------------------------------------ CLI

async function main() {
  const offline = process.argv.includes('--offline');
  guardCache();
  const lock = readLock();
  let bad = 0;
  let fetched = 0;
  for (const src of lock.sources) {
    const dir = cacheDir(src.id);
    await pool(src.files, 8, async (f) => {
      const dest = join(dir, f.path);
      const ok = existsSync(dest) && statSync(dest).size === f.bytes && (await sha256File(dest)) === f.sha256;
      if (ok) return;
      if (offline) {
        bad++;
        console.error(`missing or corrupt: ${src.id}/${f.path}`);
        return;
      }
      const got = await download(f.url, dest);
      fetched++;
      if (got.sha256 !== f.sha256) {
        bad++;
        console.error(`SHA-256 mismatch: ${src.id}/${f.path}`);
      }
    });
    for (const f of src.files) {
      if (!f.members) continue;
      const buf = readFileSync(join(dir, f.path));
      const entries = zipEntries(buf);
      for (const [name, sha] of Object.entries(f.members)) {
        const e = entries.find((x) => x.name === name);
        const data = e ? zipRead(buf, e) : null;
        if (!data || createHash('sha256').update(data).digest('hex') !== sha) {
          bad++;
          console.error(`zip member mismatch: ${src.id}/${f.path}:${name}`);
          continue;
        }
        const dest = join(dir, 'unpacked', name);
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, data);
      }
    }
  }
  const files = lock.sources.reduce((n, s) => n + s.files.length, 0);
  console.log(`${lock.sources.length} sources, ${files} files, ${fetched} downloaded, ${bad} problems`);
  process.exit(bad ? 1 : 0);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) await main();
