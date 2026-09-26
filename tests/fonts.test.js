// @ts-check
// WP-P1-fonts: the UI typefaces under assets/fonts/ (Noto Sans, Noto Sans SC; SIL OFL 1.1) conform to the asset
// contract, match their digests and locked sources, ship their OFL.txt, are credited, stay small, cover every
// Chinese character the game shows, and are wired into the UI kit by @font-face rules and the two font tokens
// (docs/UI.md §3.2) without being preloaded.
//
// Every check runs every time: a missing file fails the test (docs/wp/README.md, no conditional passes).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';
import { ASSET_MANIFEST_SCHEMA, assetOutputs, checkAssetManifest, rebuildOf } from '../src/contracts/assets.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WP = 'WP-P1-fonts';
const MANIFEST = 'assets/fonts/manifest.json';
const LFS_POINTER = 'version https://git-lfs.github.com/spec/v1';
/** Shipped font bytes, both faces together (docs/UI.md §3.2). */
const MAX_FONT_BYTES = 1.5 * 1024 * 1024;
/** The CJK blocks tools/fonts/build.py collects and subsets (radicals, punctuation, ideographs, full-width forms). */
const CJK = /[\u2e80-\u9fff\uf900-\ufaff\ufe10-\ufe1f\ufe30-\ufe4f\uff00-\uffef]/u;

/** @param {string} rel */
const read = (rel) => readFileSync(join(ROOT, rel));
/** @param {string} rel */
const readJson = (rel) => JSON.parse(read(rel).toString('utf8'));
/** @param {string} rel */
const sha = (rel) => createHash('sha256').update(read(rel)).digest('hex');
const manifest = readJson(MANIFEST);
/** @type {any[]} */
const entries = manifest.assets;
/** @param {string} id */
const entryOf = (id) => {
  const e = entries.find((x) => x.id === id);
  assert.ok(e, `${MANIFEST} has no ${id}`);
  return e;
};
const ledger = readJson('assets/sources.lock.json');
/** @type {Map<string, any>} */
const locked = new Map(ledger.sources.filter((/** @type {any} */ s) => s.wp === WP).map((/** @type {any} */ s) => [s.id, s]));
const charset = readJson('tools/fonts/charset.json');

// ------------------------------------------------------------------------------------------------ WOFF2 cmap

/** @param {Buffer} b @param {number} p @returns {[number, number]} value, next offset */
function base128(b, p) {
  let v = 0;
  for (let i = 0; i < 5; i++) {
    const byte = b[p++];
    v = v * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) return [v, p];
  }
  throw new Error('bad UIntBase128');
}

/**
 * The code points a WOFF2 file maps (its cmap: format 4 or 12 of the Windows Unicode subtables).
 * @param {Buffer} file
 * @returns {Set<number>}
 */
function woff2Cmap(file) {
  assert.equal(file.toString('latin1', 0, 4), 'wOF2', 'not a WOFF2 file');
  const numTables = file.readUInt16BE(12);
  const compressedSize = file.readUInt32BE(20);
  let p = 48;
  let offset = 0;
  let cmap = null;
  for (let i = 0; i < numTables; i++) {
    const flags = file[p++];
    const known = flags & 0x3f;
    if (known === 0x3f) p += 4;
    const version = (flags >> 6) & 3;
    let length;
    [length, p] = base128(file, p);
    const glyfLoca = known === 10 || known === 11;
    if (glyfLoca ? version === 0 : version !== 0) [length, p] = base128(file, p);
    if (known === 0) cmap = { offset, length };
    offset += length;
  }
  assert.ok(cmap, 'the WOFF2 has no cmap table');
  const data = brotliDecompressSync(file.subarray(p, p + compressedSize));
  const t = data.subarray(cmap.offset, cmap.offset + cmap.length);
  /** @type {Set<number>} */
  const out = new Set();
  const n = t.readUInt16BE(2);
  for (let i = 0; i < n; i++) {
    const platform = t.readUInt16BE(4 + i * 8);
    const encoding = t.readUInt16BE(6 + i * 8);
    const at = t.readUInt32BE(8 + i * 8);
    if (platform !== 3 || (encoding !== 1 && encoding !== 10)) continue;
    const format = t.readUInt16BE(at);
    if (format === 4) {
      const segs = t.readUInt16BE(at + 6) / 2;
      const ends = at + 14;
      const starts = ends + segs * 2 + 2;
      const deltas = starts + segs * 2;
      const ranges = deltas + segs * 2;
      for (let s = 0; s < segs; s++) {
        const end = t.readUInt16BE(ends + s * 2);
        const start = t.readUInt16BE(starts + s * 2);
        const delta = t.readUInt16BE(deltas + s * 2);
        const rangeOffset = t.readUInt16BE(ranges + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          const glyph = rangeOffset === 0 ? (c + delta) & 0xffff : t.readUInt16BE(ranges + s * 2 + rangeOffset + (c - start) * 2);
          if (glyph) out.add(c);
        }
      }
    } else if (format === 12) {
      const groups = t.readUInt32BE(at + 12);
      for (let g = 0; g < groups; g++) {
        const start = t.readUInt32BE(at + 16 + g * 12);
        const end = t.readUInt32BE(at + 20 + g * 12);
        for (let c = start; c <= end; c++) out.add(c);
      }
    }
  }
  return out;
}

/** Every character written literally in the shipped sources, as tools/fonts/build.py --collect reads them (the UI
 * strings are literal; the one \u escape in src/ is a regex range bound, not text). */
function shownCharacters() {
  const files = ['index.html', 'styles.css'];
  /** @param {string} rel */
  const walk = (rel) => {
    for (const e of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
      const p = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (/\.(js|json|css|html)$/.test(e.name)) files.push(p);
    }
  };
  walk('src');
  /** @type {Set<string>} */
  const chars = new Set();
  for (const f of files) {
    const text = read(f).toString('utf8');
    for (const ch of text) chars.add(ch);
  }
  return chars;
}

// ------------------------------------------------------------------------------------------------ tests

test('the font manifest conforms to the asset contract, names its recipe and matches its digests', () => {
  assert.equal(manifest.schema, ASSET_MANIFEST_SCHEMA);
  assert.equal(manifest.wp, WP);
  assert.deepEqual(checkAssetManifest(manifest, { exists: (p) => existsSync(join(ROOT, p)) }), []);
  assert.deepEqual(entries.map((e) => e.id).sort(), ['fonts/noto-sans', 'fonts/noto-sans-sc', 'fonts/noto-sans-sc-lang']);
  for (const e of entries) {
    assert.equal(e.kind, 'font', e.id);
    assert.equal(e.license, 'OFL-1.1', e.id);
    assert.ok(rebuildOf(manifest, e), `${e.id}: no rebuild recipe`);
    assert.equal(manifest.rebuild[/** @type {string} */ (e.rebuild)].entry, 'tools/fonts/build.sh');
    const outputs = assetOutputs(e);
    assert.deepEqual(Object.keys(e.digests).sort(), [...outputs].sort(), `${e.id}: a digest per shipped file`);
    for (const p of outputs) {
      assert.notEqual(read(p).subarray(0, LFS_POINTER.length).toString('latin1'), LFS_POINTER, `${p} is an LFS pointer (git lfs pull)`);
      assert.equal(sha(p), e.digests[p], `${p} does not match its digest`);
    }
    assert.match(e.path, /\.woff2$/);
    assert.equal(read(e.path).toString('latin1', 0, 4), 'wOF2', `${e.path} is not WOFF2`);
    assert.equal(e.params.fontDisplay, 'swap');
  }
});

test('each face comes from a locked Google Fonts source, ships that source\'s OFL.txt and is credited', () => {
  const credits = read('assets/CREDITS.md').toString('utf8');
  const at = credits.indexOf(`\n## ${WP}\n`);
  assert.ok(at >= 0, `assets/CREDITS.md has no ${WP} section`);
  const end = credits.indexOf('\n## ', at + 1);
  const section = credits.slice(at, end < 0 ? undefined : end);
  for (const e of entries) {
    assert.equal(e.sources.length, 1, e.id);
    const src = locked.get(e.sources[0]);
    assert.ok(src, `${e.id}: source ${e.sources[0]} is not locked by ${WP} in assets/sources.lock.json`);
    assert.equal(src.license, 'OFL-1.1');
    assert.equal(src.kind, 'font');
    for (const f of src.files) {
      assert.match(f.url, /^https:\/\/github\.com\/google\/fonts\/raw\/[0-9a-f]{40}\/ofl\//, `${src.id}: ${f.url}`);
      assert.match(f.sha256, /^[0-9a-f]{64}$/);
      assert.ok(f.bytes > 0);
      assert.ok(section.includes(f.sha256), `${src.id}: ${f.path} is not in the credits`);
    }
    const ofl = src.files.find((/** @type {any} */ f) => f.path === 'OFL.txt');
    assert.ok(ofl, `${src.id} locks no OFL.txt`);
    assert.equal(e.files.license, `${dirname(e.path)}/OFL.txt`, `${e.id}: OFL.txt ships beside the font`);
    assert.equal(sha(e.files.license), ofl.sha256, `${e.id}: the shipped OFL.txt is not the source's`);
    assert.match(read(e.files.license).toString('utf8'), /SIL Open Font License, Version 1\.1/);
    assert.ok(section.includes(`\`${src.id}\``), `${src.id} is not credited`);
  }
});

test('the shipped fonts stay under 1.5 MB together', () => {
  const total = entries.reduce((n, e) => n + read(e.path).length, 0);
  assert.ok(total < MAX_FONT_BYTES, `${total} bytes of fonts (limit ${MAX_FONT_BYTES})`);
  for (const e of entries) assert.equal(e.meta.sizeBytes, read(e.path).length, `${e.id}: meta.sizeBytes`);
});

test('the charset holds every Chinese character the game shows, and Noto Sans SC maps every one', () => {
  const shown = shownCharacters();
  const cjk = new Set([...shown].filter((c) => CJK.test(c)));
  assert.ok(cjk.size > 1000, `only ${cjk.size} CJK characters found in src/: the collection is broken`);
  const inCharset = new Set(charset.cjk);
  const missing = [...cjk].filter((c) => !inCharset.has(c)).sort();
  assert.deepEqual(missing, [], `characters the game shows are missing from tools/fonts/charset.json: run tools/fonts/build.sh --collect, then tools/fonts/build.sh`);
  const sc = woff2Cmap(read(entryOf('fonts/noto-sans-sc').path));
  const unmapped = [...inCharset].filter((c) => !sc.has(/** @type {number} */ (c.codePointAt(0)))).sort();
  assert.deepEqual(unmapped, [], 'Noto Sans SC lacks charset characters: rebuild with tools/fonts/build.sh');
  for (let c = 0x20; c < 0x7f; c++) assert.ok(sc.has(c), `Noto Sans SC lacks U+${c.toString(16)}`);
  assert.equal(entryOf('fonts/noto-sans-sc').meta.cjkCharacters, inCharset.size);
});

test('Noto Sans maps ASCII, Latin-1 and the typographic punctuation', () => {
  const latin = woff2Cmap(read(entryOf('fonts/noto-sans').path));
  const want = [...Array.from({ length: 0x5f }, (_, i) => 0x20 + i), ...Array.from({ length: 0x60 }, (_, i) => 0xa0 + i), 0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2026];
  assert.deepEqual(want.filter((c) => !latin.has(c)), []);
  assert.ok(![...latin].some((c) => CJK.test(String.fromCodePoint(c))), 'the Latin face carries no CJK');
});

test('the language-name slice maps exactly the Chinese the English UI shows', () => {
  const menus = read('src/ui/menus.js').toString('utf8');
  const names = ['中文', '简体中文'];
  for (const n of names) assert.ok(menus.includes(`'${n}'`), `src/ui/menus.js no longer shows '${n}': update LANGUAGE_NAMES in tools/fonts/build.py`);
  const slice = woff2Cmap(read(entryOf('fonts/noto-sans-sc-lang').path));
  const want = [...new Set(names.join(''))].map((c) => /** @type {number} */ (c.codePointAt(0))).sort((a, b) => a - b);
  assert.deepEqual([...slice].sort((a, b) => a - b), want);
  assert.ok(read(entryOf('fonts/noto-sans-sc-lang').path).length < 8 * 1024, 'the slice stays a few KB');
});

test('the UI kit loads every face with font-display: swap, the unicode-range of the manifest, and no preload', () => {
  const css = read('src/ui/kit/fonts.css').toString('utf8');
  assert.match(read('src/ui/kit/kit.css').toString('utf8'), /^@import '\.\/fonts\.css';$/m);
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
  assert.equal(faces.length, entries.length);
  /** @type {Map<string, number>} */
  const order = new Map();
  for (const e of entries) {
    const at = faces.findIndex((f) => {
      const url = /url\('([^']+)'\)/.exec(f)?.[1];
      return url !== undefined && resolve(ROOT, 'src/ui/kit', url) === resolve(ROOT, e.path);
    });
    assert.ok(at >= 0, `no @font-face loads ${e.path}`);
    order.set(e.id, at);
    const face = faces[at];
    assert.ok(face.includes(`font-family: '${e.params.family}';`), `${e.path} is not declared as '${e.params.family}'`);
    assert.match(face, /font-display: swap;/);
    assert.match(face, /font-weight: 400 700;/);
    assert.equal(/unicode-range: ([^;]+);/.exec(face)?.[1], e.params.unicodeRange, `${e.id}: unicode-range differs from the manifest`);
  }
  // the browser tries same-family faces last-declared first: the slice must follow the full face
  assert.ok(/** @type {number} */ (order.get('fonts/noto-sans-sc-lang')) > /** @type {number} */ (order.get('fonts/noto-sans-sc')));
  const html = read('index.html').toString('utf8');
  assert.doesNotMatch(html, /rel=["']?preload[^>]*(woff2|font)/i, 'fonts are never preloaded (the CJK file must not load in English)');
});

test('the font tokens name Noto Sans and Noto Sans SC first, with the system stacks behind them', () => {
  const tokens = read('src/ui/kit/tokens.css').toString('utf8');
  assert.match(tokens, /--ui-font-latin: 'Noto Sans', 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial;/);
  assert.match(tokens, /--ui-font-cjk: 'Noto Sans SC', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Source Han Sans SC';/);
  assert.match(read('styles.css').toString('utf8'), /^ {2}font-family: var\(--ui-font\);$/m, 'the game styles read the kit font token');
});
