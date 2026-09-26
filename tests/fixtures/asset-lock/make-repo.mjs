// @ts-check
// Assembles a throwaway checkout for the asset-lock tests: the fixture tools (repo/), a copy of tools/lib/, one
// locked source in assets/cache/, the committed outputs built once by the fixture build, and two manifests
// (textures: a, b, c; sounds: tone) that follow the rebuild contract, with digests.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SCHEMA = 'survival-logs/asset-manifest@1';

/** @param {string} root @param {string} p */
const sha = (root, p) => createHash('sha256').update(readFileSync(join(root, p))).digest('hex');

/** The rebuild recipe the fixture manifests share. */
export const RECIPE = {
  entry: 'tools/fixture/build.mjs',
  args: ['--only', '{name}'],
  inputs: ['tools/fixture/', 'tools/lib/'],
  shared: ['assets/cache'],
  tools: { node: '24' },
  seeds: { pattern: 0 },
  cost: 1,
};

/**
 * @returns {string} the root of a fresh fixture checkout
 */
export function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'asset-lock-fixture-'));
  cpSync(join(HERE, 'repo'), root, { recursive: true });
  cpSync(join(ROOT, 'tools', 'lib'), join(root, 'tools', 'lib'), { recursive: true });
  mkdirSync(join(root, 'assets', 'cache'), { recursive: true });
  mkdirSync(join(root, 'assets', 'lock'), { recursive: true });
  writeFileSync(join(root, 'assets/cache/pattern.txt'), '440 5\n');
  const lock = { schema: 'survival-logs/asset-lock@1', wp: 'WP-TEST', sources: [{ id: 'fixture/pattern', license: 'CC0-1.0', files: [{ path: 'pattern.txt', sha256: sha(root, 'assets/cache/pattern.txt') }] }] };
  writeFileSync(join(root, 'assets/lock/WP-TEST.json'), JSON.stringify(lock, null, 2));
  for (const name of ['a', 'b', 'c', 'tone']) execFileSync(process.execPath, ['tools/fixture/build.mjs', '--only', name], { cwd: root });
  const entry = (/** @type {string} */ id, /** @type {string} */ kind, /** @type {string} */ path) => ({
    id,
    kind,
    path,
    license: 'LicenseRef-Original',
    sources: ['fixture/pattern'],
    rebuild: 'fixture',
    digests: { [path]: sha(root, path) },
  });
  const textures = { schema: SCHEMA, wp: 'WP-TEST', rebuild: { fixture: RECIPE }, assets: ['a', 'b', 'c'].map((n) => entry(`textures/${n}`, 'texture', `assets/textures/${n}.png`)) };
  const sounds = { schema: SCHEMA, wp: 'WP-TEST', rebuild: { fixture: RECIPE }, assets: [entry('sounds/tone', 'audio', 'assets/sounds/tone.wav')] };
  writeFileSync(join(root, 'assets/textures/manifest.json'), JSON.stringify(textures, null, 2));
  writeFileSync(join(root, 'assets/sounds/manifest.json'), JSON.stringify(sounds, null, 2));
  return root;
}

/**
 * Rewrites one manifest of a fixture checkout.
 * @param {string} root
 * @param {string} file  repo-relative
 * @param {(m: any) => void} edit
 */
export function editManifest(root, file, edit) {
  const m = JSON.parse(readFileSync(join(root, file), 'utf8'));
  edit(m);
  writeFileSync(join(root, file), JSON.stringify(m, null, 2));
}

/** @param {string} root @param {string} p */
export const digestOf = sha;
