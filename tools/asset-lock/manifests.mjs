// @ts-check
// The shipped asset manifests of a checkout and the ids of its locked sources.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { UNSHIPPED_ASSET_DIRS } from '../../src/contracts/assets.js';

/**
 * @typedef {{ file: string, manifest: import('../../src/contracts/assets.js').AssetManifest }} ManifestFile
 */

/**
 * Every manifest.json / library.json under the shipped folders of assets/, repo-relative, sorted.
 * @param {string} root
 * @returns {{ manifests: ManifestFile[], problems: string[] }}
 */
export function findManifests(root) {
  const base = join(root, 'assets');
  /** @type {ManifestFile[]} */
  const manifests = [];
  /** @type {string[]} */
  const problems = [];
  if (!existsSync(base)) return { manifests, problems };
  /** @param {string} rel */
  const walk = (rel) => {
    for (const e of readdirSync(join(root, rel), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (rel === 'assets' && UNSHIPPED_ASSET_DIRS.includes(e.name)) continue;
      const p = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (e.name === 'manifest.json' || e.name === 'library.json') {
        try {
          manifests.push({ file: p, manifest: JSON.parse(readFileSync(join(root, p), 'utf8')) });
        } catch (err) {
          problems.push(`${p}: not JSON (${/** @type {Error} */ (err).message})`);
        }
      }
    }
  };
  walk('assets');
  return { manifests, problems };
}

/**
 * Ids of every locked source: assets/sources.lock.json (merged by the integrator) and the fragments in assets/lock/.
 * @param {string} root
 * @returns {Set<string>}
 */
export function lockedSources(root) {
  const ids = new Set();
  const files = ['assets/sources.lock.json', ...(existsSync(join(root, 'assets/lock')) ? readdirSync(join(root, 'assets/lock')).filter((f) => f.endsWith('.json')).map((f) => `assets/lock/${f}`) : [])];
  for (const f of files) {
    if (!existsSync(join(root, f))) continue;
    const j = JSON.parse(readFileSync(join(root, f), 'utf8'));
    for (const s of Array.isArray(j) ? j : j.sources || []) if (typeof s?.id === 'string') ids.add(s.id);
  }
  return ids;
}
