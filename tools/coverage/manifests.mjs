// @ts-check
// Asset manifests (src/contracts/assets.js): every assets/**/manifest.json and the material library outside the
// unshipped folders, checked with checkAssetManifest, and the config-id bindings they declare.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { UNSHIPPED_ASSET_DIRS, checkAssetManifest } from '../../src/contracts/assets.js';
import { ROOT } from './sim.mjs';

/**
 * @typedef {object} Manifests
 * @property {string[]} files  repo-relative manifest paths
 * @property {Map<string, any>} assets  entry id -> entry (with `_file`)
 * @property {Map<string, { asset: string, variant?: string, file: string }>} bindings  config id -> binding
 * @property {string[]} problems  manifests that do not conform (their bindings are left out)
 */

/**
 * @param {string} [root]
 * @returns {Manifests}
 */
export function readManifests(root = ROOT) {
  const base = join(root, 'assets');
  /** @type {string[]} */
  const files = [];
  /** @param {string} dir */
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (dir === base && UNSHIPPED_ASSET_DIRS.includes(name)) continue;
        walk(p);
      } else if (name === 'manifest.json' || (name === 'library.json' && dir === join(base, 'materials'))) files.push(relative(root, p).split(sep).join('/'));
    }
  };
  if (existsSync(base)) walk(base);
  /** @type {Manifests} */
  const out = { files: files.sort(), assets: new Map(), bindings: new Map(), problems: [] };
  /** @type {[string, any][]} */
  const parsed = [];
  for (const f of out.files) {
    try {
      parsed.push([f, JSON.parse(readFileSync(join(root, f), 'utf8'))]);
    } catch (err) {
      out.problems.push(`${f}: not JSON (${/** @type {Error} */ (err).message})`);
    }
  }
  for (const [f, m] of parsed) for (const e of Array.isArray(m?.assets) ? m.assets : []) if (e && typeof e.id === 'string') out.assets.set(e.id, { ...e, _file: f });
  for (const [f, m] of parsed) {
    const problems = checkAssetManifest(m, { exists: (p) => existsSync(join(root, p)), knownAssets: out.assets });
    if (problems.length) {
      out.problems.push(...problems.map((p) => `${f}: ${p}`));
      continue;
    }
    for (const [id, b] of Object.entries(m.bindings || {})) out.bindings.set(String(id), { ...b, file: f });
  }
  return out;
}

/**
 * Is a Config_Furniture id drawn with its own model, or a shared (family) model and a variant of its own?
 * @param {Manifests} man
 * @param {number | string} cfg
 * @returns {{ ok: boolean, detail: string }}
 */
export function renderBinding(man, cfg) {
  const b = man.bindings.get(String(cfg));
  if (!b) return { ok: false, detail: man.files.length ? 'no asset manifest binds it' : 'no asset manifest yet' };
  const asset = man.assets.get(b.asset);
  if (!asset) return { ok: false, detail: `bound to ${b.asset}, which no manifest defines` };
  if (asset.kind !== 'model') return { ok: false, detail: `bound to ${b.asset}, a ${asset.kind}, not a model` };
  const sharers = [...man.bindings].filter(([id, x]) => x.asset === b.asset && id !== String(cfg));
  if (!sharers.length) return { ok: true, detail: `own model ${b.asset}` };
  if (!b.variant) return { ok: false, detail: `shares ${b.asset} with ${sharers.map(([id]) => id).join(', ')} without a variant` };
  const twin = sharers.find(([, x]) => x.variant === b.variant);
  if (twin) return { ok: false, detail: `${b.asset} variant ${b.variant} also draws ${twin[0]}` };
  return { ok: true, detail: `family model ${b.asset}, variant ${b.variant}` };
}
