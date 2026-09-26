// @ts-check
// The audio lane's lock fragment (assets/lock/WP-P0-06.json) and credits fragment (assets/credits/WP-P0-06.md).
// Same schema as tools/fetch-assets.mjs (WP-P0-05): sources with url, bytes and SHA-256 per file, cached under
// assets/cache/<id>/<path>. Kenney zips list the SHA-256 of the audio members read from them in `members`; they are
// not marked `unpack: 'zip'` because the shared fetcher only unpacks images and text (see the hook request).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/io.mjs';

export const WP = 'WP-P0-06';
export const LOCK_PATH = join(ROOT, 'assets', 'lock', `${WP}.json`);
export const CREDITS_PATH = join(ROOT, 'assets', 'credits', `${WP}.md`);
export const CACHE = join(ROOT, 'assets', 'cache');
export const LEDGER_PATH = join(ROOT, 'assets', 'sources.lock.json');

/**
 * @typedef {{ url: string, path: string, bytes: number, sha256: string, members?: Record<string, string> }} LockFile
 * @typedef {{ id: string, provider: string, title: string, page?: string, license: string, licenseUrl?: string,
 *   authors: string[], kind: string, creationMethod?: string, usedFor: string[], retrieved: string, files: LockFile[],
 *   notes?: string }} LockSource
 * @typedef {{ schema: number, wp: string, sources: LockSource[], attempts?: { url: string, date: string, result: string }[] }} LockFragment
 */

/**
 * The lane's lock from its fragment and the merged ledger (both parsed, or null when the file is absent): the fragment
 * while it has one, else the lane's ledger entries (tagged `wp`). A source the fragment and the ledger both lock with
 * different files is a conflict, as in tools/fetch-assets.mjs; a lane with no pinned sources at all is an error.
 * @param {LockFragment | null} fragment
 * @param {{ schema?: number, sources?: any[], attempts?: any[] } | null} ledger
 * @returns {LockFragment}
 */
export function resolveLock(fragment, ledger) {
  const pins = (/** @type {{ files: LockFile[] }} */ s) => JSON.stringify(s.files.map((f) => [f.path, f.sha256]));
  if (fragment) {
    const merged = new Map((ledger?.sources ?? []).map((s) => [s.id, s]));
    for (const s of fragment.sources) {
      const m = merged.get(s.id);
      if (m && pins(m) !== pins(s)) throw new Error(`lock conflict for ${s.id}: assets/lock/${WP}.json and assets/sources.lock.json (${m.wp ?? 'no wp'}) disagree`);
    }
    return fragment;
  }
  /** @param {any[] | undefined} list @returns {any[]} */
  const mine = (list) => (list ?? []).filter((x) => x.wp === WP).map(({ wp: _wp, ...rest }) => rest);
  const sources = mine(ledger?.sources);
  if (!sources.length) {
    throw new Error(`the audio lane ${WP} has no pinned sources: no assets/lock/${WP}.json and no entries with wp ${WP} in assets/sources.lock.json${ledger ? '' : ' (missing)'}`);
  }
  return { schema: ledger?.schema ?? 1, wp: WP, sources, attempts: mine(ledger?.attempts) };
}

/**
 * The lane's lock (resolveLock over assets/lock/WP-P0-06.json and assets/sources.lock.json). Writes always go to the
 * fragment.
 * @returns {LockFragment}
 */
export function readLock() {
  const read = (/** @type {string} */ p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
  return resolveLock(read(LOCK_PATH), read(LEDGER_PATH));
}

/** @param {LockFragment} lock */
export function writeLock(lock) {
  mkdirSync(join(ROOT, 'assets', 'lock'), { recursive: true });
  lock.sources.sort((a, b) => a.id.localeCompare(b.id));
  for (const s of lock.sources) {
    s.files.sort((a, b) => a.path.localeCompare(b.path));
    s.usedFor = [...new Set(s.usedFor)].sort();
  }
  writeFileSync(LOCK_PATH, `${JSON.stringify(lock, null, 2)}\n`);
}

/**
 * Keeps only what a full build used: files, zip members and usedFor labels recorded in the usage log.
 * @param {{ id: string, path: string, member?: string, usedFor?: string[] }[]} usage
 */
export function pruneLock(usage) {
  const lock = readLock();
  const files = new Set(usage.map((u) => `${u.id}|${u.path}`));
  const members = new Set(usage.filter((u) => u.member).map((u) => `${u.id}|${u.path}|${u.member}`));
  /** @type {Map<string, Set<string>>} */
  const used = new Map();
  for (const u of usage) for (const x of u.usedFor ?? []) (used.get(u.id) ?? used.set(u.id, new Set()).get(u.id))?.add(x);
  let dropped = 0;
  lock.sources = lock.sources.filter((s) => {
    const before = s.files.length;
    s.files = s.files.filter((f) => files.has(`${s.id}|${f.path}`));
    dropped += before - s.files.length;
    for (const f of s.files) {
      if (!f.members) continue;
      for (const m of Object.keys(f.members)) if (!members.has(`${s.id}|${f.path}|${m}`)) {
        delete f.members[m];
        dropped++;
      }
    }
    s.usedFor = [...(used.get(s.id) ?? [])];
    return s.files.length > 0;
  });
  writeLock(lock);
  return dropped;
}

/** @param {string} id */
export function cacheDir(id) {
  if (!/^[A-Za-z0-9._@-]+(\/[A-Za-z0-9._@-]+)*$/.test(id)) throw new Error(`invalid source id ${id}`);
  return join(CACHE, ...id.split('/'));
}

/**
 * Credits markdown from the lock plus the list of assets made here.
 * @param {LockFragment} lock
 * @param {{ id: string, what: string, from: string }[]} original
 */
export function writeCredits(lock, original) {
  mkdirSync(join(ROOT, 'assets', 'credits'), { recursive: true });
  const esc = (/** @type {string} */ s) => String(s).replace(/\|/g, '\\|');
  const lines = [
    `# Credits — ${WP} (audio)`,
    '',
    `Generated by \`node tools/audio/build.mjs\` from \`assets/lock/${WP}.json\`, which pins the URL, size and SHA-256 of`,
    'every downloaded file (and of every audio member read from a zip). The integrator merges this fragment into',
    '`assets/CREDITS.md`.',
    '',
    '## Downloaded sources',
    '',
    '| Source | Provider | Author(s) | License | Files | Used for |',
    '| --- | --- | --- | --- | --- | --- |',
    ...lock.sources.map(
      (s) =>
        `| [${esc(s.title)}](${s.page ?? s.files[0]?.url}) (\`${s.id}\`) | ${esc(s.provider)} | ${esc(s.authors.join(', '))} | ` +
        `[${s.license}](${s.licenseUrl ?? 'https://creativecommons.org/publicdomain/zero/1.0/'}) | ${s.files.length} | ${esc(s.usedFor.join(', '))} |`,
    ),
    '',
    'VSCO 2 Community Edition and VCSL ask for credit to Versilian Studios / Sam Gossner (and Ivy Audio / Simon',
    'Dalzell for the Knight upright piano); Kenney assets credit Kenney Vleugels (kenney.nl). All are CC0 1.0.',
    '',
    '## Made for this project (LicenseRef-Original)',
    '',
    'Composed, synthesized or mixed by the scripts in `tools/music/` and `tools/audio/` from the sources above;',
    'no other material.',
    '',
    '| Asset | What | Made from |',
    '| --- | --- | --- |',
    ...original.map((o) => `| \`${o.id}\` | ${esc(o.what)} | ${esc(o.from)} |`),
    '',
    '## Tools (installed system-wide, not shipped)',
    '',
    '| Tool | License | Used for |',
    '| --- | --- | --- |',
    '| [FFmpeg](https://ffmpeg.org) | LGPL-2.1+ / GPL | decoding sources, EBU R128 loudness and true-peak measurement |',
    '| [SoX](https://sox.sourceforge.net) with libvorbis | GPL-2.0+ / LGPL-2.1+ (libvorbis BSD) | Ogg Vorbis encoding |',
    '',
  ];
  if (lock.attempts?.length) {
    lines.push('## Sources tried and not used', '');
    for (const a of lock.attempts) lines.push(`- ${a.url} (${a.date}): ${a.result}`);
    lines.push('');
  }
  lines.push('## Downloads (URL, bytes, SHA-256)', '');
  for (const s of lock.sources) {
    lines.push(`- \`${s.id}\``);
    for (const f of s.files) lines.push(`  - ${f.url} — ${f.bytes} bytes — \`${f.sha256}\``);
  }
  lines.push('');
  writeFileSync(CREDITS_PATH, lines.join('\n'));
}
