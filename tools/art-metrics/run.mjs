// @ts-check
// Runs every art metric over the asset manifests of a checkout and builds the report tools/art-metrics.mjs prints.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UNSHIPPED_ASSET_DIRS } from '../../src/contracts/assets.js';
import { CHECKS, fail, verdict } from './findings.mjs';
import { CONTENT, FAMILIES, LIGHTMAP_SETS, REQUIRED_CHECKS, UNJUDGED_KINDS } from './standard.mjs';
import { decodeImage } from './images.mjs';
import { readGltf } from './gltf.mjs';
import { checkMaterial, checkTexture } from './materials.mjs';
import { checkModel } from './models.mjs';
import { checkIcons } from './icons.mjs';
import { checkLightmap } from './lightmaps.mjs';

/** @typedef {import('./findings.mjs').Finding} Finding */
/** @typedef {import('../../src/contracts/assets.js').AssetEntry} AssetEntry */
/** @typedef {import('../../src/contracts/assets.js').AssetManifest} AssetManifest */

export const REPO = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Every manifest under assets/ (manifest.json or library.json), skipping the folders that never ship.
 * @param {string} root
 * @returns {{ file: string, family: string, manifest: AssetManifest | null, error?: string }[]}
 */
export function findManifests(root) {
  const dir = join(root, 'assets');
  /** @type {{ file: string, family: string, manifest: AssetManifest | null, error?: string }[]} */
  const out = [];
  if (!existsSync(dir)) return out;
  /** @param {string} d */
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (d === dir && UNSHIPPED_ASSET_DIRS.includes(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory() || (e.isSymbolicLink() && statSync(p).isDirectory())) walk(p);
      else if (e.name === 'manifest.json' || e.name === 'library.json') {
        const file = relative(root, p).split('\\').join('/');
        const family = file.split('/')[1];
        try {
          out.push({ file, family, manifest: JSON.parse(readFileSync(p, 'utf8')) });
        } catch (err) {
          out.push({ file, family, manifest: null, error: /** @type {Error} */ (err).message });
        }
      }
    }
  };
  walk(dir);
  return out;
}

/** @type {Promise<{ name: (id: string) => string | null, code: (id: string) => number | null }> | null} */
let categories = null;

/** The game config category of a config item id (src/data/db.js), by name and by its numeric code, for icon groups. */
function configCategories() {
  if (!categories) {
    categories = import('../../src/data/db.js').then((db) => {
      const names = new Map(Object.entries(db.CAT).map(([k, v]) => [v, k.toLowerCase()]));
      const code = (/** @type {string} */ id) => db.item(Number(id))?.cat ?? null;
      return {
        name: (/** @type {string} */ id) => {
          const cat = code(id);
          return cat == null ? null : names.get(cat) || String(cat);
        },
        code,
      };
    });
  }
  return categories;
}

/**
 * The context the checks read a checkout through: files, decoded textures and glTF facts (each read once), and every
 * entry and binding of every manifest.
 * @param {string} root
 * @param {{ manifest: AssetManifest | null }[]} manifests
 * @returns {Promise<import('./findings.mjs').Context>}
 */
export async function createContext(root, manifests) {
  /** @type {Map<string, AssetEntry>} */
  const assets = new Map();
  /** @type {Map<string, any>} */
  const bindings = new Map();
  for (const m of manifests) {
    for (const e of m.manifest?.assets || []) if (e && typeof e.id === 'string' && !assets.has(e.id)) assets.set(e.id, e);
    for (const [cfg, b] of Object.entries(m.manifest?.bindings || {})) bindings.set(cfg, { ...b, cfg });
  }
  const category = await configCategories();
  /** @type {Map<string, Promise<any>>} */
  const cache = new Map();
  const memo = (/** @type {string} */ k, /** @type {() => Promise<any>} */ f) => {
    if (!cache.has(k)) cache.set(k, f());
    return /** @type {Promise<any>} */ (cache.get(k));
  };
  const abs = (/** @type {string} */ p) => join(root, p);
  return {
    root,
    read: (p) => new Uint8Array(readFileSync(abs(p))),
    exists: (p) => typeof p === 'string' && existsSync(abs(p)),
    texture: (p) => memo(`tex:${p}`, () => decodeImage(new Uint8Array(readFileSync(abs(p))))),
    decodeBytes: (bytes) => decodeImage(bytes),
    gltf: (p) => memo(`gltf:${p}`, () => readGltf(abs(p))),
    assets,
    bindings,
    configCategory: category.name,
    configCategoryCode: category.code,
  };
}

/**
 * The content a phase needs (P0 the spike, P1 on everything).
 * @param {string} phase  P<n>
 */
export const contentFor = (phase) => (Number(phase.slice(1)) >= 1 ? CONTENT.P1 : CONTENT.P0);

/**
 * `content` findings: every survivor has a skinned character; every home floor a shell model with a lightmap entry
 * holding the five ART.md §4.4 sets; at least one icon bound to a config item.
 * @param {string} phase
 * @param {{ family: string, entry: AssetEntry }[]} all
 * @param {import('./findings.mjs').Context} ctx
 * @returns {Promise<Finding[]>}
 */
export async function contentFindings(phase, all, ctx) {
  const need = contentFor(phase);
  /** @type {Finding[]} */
  const out = [];
  const par = (/** @type {AssetEntry} */ e) => /** @type {Record<string, any>} */ (e.params || {});
  for (const s of need.characters) {
    const id = `characters/${s}`;
    const e = all.find((x) => x.family === 'characters' && x.entry.kind === 'character' && (x.entry.id === id || par(x.entry).survivor === s))?.entry;
    if (!e) {
      out.push(fail('content', id, `${phase} needs a kind 'character' entry for the survivor '${s}' (id ${id} or params.survivor)`));
      continue;
    }
    let joints = 0;
    try {
      joints = ctx.exists(e.path) ? (await ctx.gltf(e.path)).joints : 0;
    } catch {}
    out.push(verdict('content', id, joints > 0, joints > 0 ? `${e.id}: skinned, ${joints} joints` : `${e.id}: ${ctx.exists(e.path) ? 'has no skin' : `${e.path} is missing`}`));
  }
  for (const [home, floors] of Object.entries(need.homes)) {
    for (const floor of floors) {
      const id = `homes/${home}/${floor}`;
      const shell = all.find((x) => x.family === 'homes' && x.entry.kind === 'model' && par(x.entry).class === 'shell' && par(x.entry).home === home && par(x.entry).floor === floor)?.entry;
      if (!shell) {
        out.push(fail('content', id, `${phase} needs a model with params.class 'shell', params.home '${home}', params.floor '${floor}'`));
        continue;
      }
      const lm = all.find((x) => x.entry.kind === 'lightmap' && par(x.entry).model === shell.id)?.entry;
      const sets = Object.keys(lm?.files || {});
      const lack = LIGHTMAP_SETS.filter((k) => !sets.includes(k));
      if (!lm) out.push(fail('content', id, `shell ${shell.id} has no lightmap entry (kind 'lightmap', params.model '${shell.id}')`));
      else out.push(verdict('content', id, !lack.length, lack.length ? `${lm.id} lacks the lightmap set(s) ${lack.join(', ')} (ART.md §4.4: ${LIGHTMAP_SETS.join(', ')})` : `shell ${shell.id}, lightmaps ${lm.id} with ${LIGHTMAP_SETS.join(', ')}`));
    }
  }
  const icons = all.filter((x) => x.entry.kind === 'icon');
  const bound = icons.filter((x) => [...ctx.bindings.values()].some((b) => b.asset === x.entry.id));
  out.push(verdict('content', 'icons', bound.length > 0, `${bound.length} of ${icons.length} icon entries bound to a config item`));
  return out;
}

/**
 * Required checks per kind: a check the kind needs that did not run, or was skipped without an exemption, fails.
 * @param {AssetEntry[]} entries
 * @param {Finding[]} findings
 * @returns {Finding[]}
 */
export function requiredFindings(entries, findings) {
  /** @type {Map<string, Finding[]>} */
  const by = new Map();
  for (const f of findings) by.set(f.entry, [...(by.get(f.entry) || []), f]);
  /** @type {Finding[]} */
  const out = [];
  for (const e of entries) {
    const req = REQUIRED_CHECKS[e.kind];
    if (!req) continue;
    const fs = by.get(e.id) || [];
    for (const c of req) {
      const got = fs.filter((f) => f.check === c);
      if (!got.length) out.push(fail(c, e.id, `a ${e.kind} must pass ${c}, and nothing measured it (the entry lacks what the check reads)`));
      else if (got.every((f) => f.state === 'skip' && !f.exempt)) out.push(fail(c, e.id, `a ${e.kind} must pass ${c}, but it was skipped: ${got[0].detail}`));
    }
  }
  return out;
}

/**
 * @param {{ root?: string, phase?: string }} [opts]
 */
export async function runArtMetrics({ root = REPO, phase = 'P0' } = {}) {
  const manifests = findManifests(root);
  const ctx = await createContext(root, manifests);
  /** @type {Finding[]} */
  const findings = [];
  /** @type {Record<string, { manifest: string, entries: number, kinds: Record<string, number>, unjudged: number }>} */
  const families = {};
  /** @type {AssetEntry[]} */
  const icons = [];
  /** @type {{ family: string, entry: AssetEntry }[]} */
  const all = [];
  for (const m of manifests) {
    const fam = (families[m.family] ||= { manifest: m.file, entries: 0, kinds: {}, unjudged: 0 });
    if (fam.manifest !== m.file) fam.manifest = `${fam.manifest}, ${m.file}`;
    if (!m.manifest) {
      findings.push(fail('manifest', m.file, `not JSON: ${m.error}`));
      continue;
    }
    for (const e of m.manifest.assets || []) {
      if (!UNJUDGED_KINDS.includes(e.kind)) fam.entries++;
      fam.kinds[e.kind] = (fam.kinds[e.kind] || 0) + 1;
      all.push({ family: m.family, entry: e });
      try {
        if (e.kind === 'material') findings.push(...(await checkMaterial(e, ctx)));
        else if (e.kind === 'texture') findings.push(...(await checkTexture(e, ctx)));
        else if (e.kind === 'model' || e.kind === 'character' || e.kind === 'animation') findings.push(...(await checkModel(e, ctx)));
        else if (e.kind === 'lightmap') findings.push(...(await checkLightmap(e, ctx)));
        else if (e.kind === 'icon') icons.push(e);
        else if (UNJUDGED_KINDS.includes(e.kind)) fam.unjudged++;
        else findings.push(fail('manifest', e.id, `kind '${e.kind}' has no art metric`));
      } catch (err) {
        findings.push(fail('manifest', e.id, `the check crashed: ${/** @type {Error} */ (err).stack || err}`));
      }
    }
  }
  if (icons.length) findings.push(...(await checkIcons(icons, ctx)));
  findings.push(...requiredFindings(all.map((x) => x.entry), findings));
  findings.push(...(await contentFindings(phase, all, ctx)));
  const missing = Object.entries(FAMILIES)
    .filter(([name]) => !families[name]?.entries)
    .map(([name, f]) => ({ family: name, ...f, why: families[name] ? 'its manifest has no judged entries (audio, LUTs and probes do not count)' : 'no manifest yet' }));
  return report({ root, manifests, findings, families, missing, phase });
}

/**
 * @param {{ root: string, manifests: { file: string }[], findings: Finding[], families: Record<string, { manifest: string, entries: number, kinds: Record<string, number>, unjudged: number }>, missing: { family: string, manifest: string, owner: string, why: string }[], phase?: string }} r
 */
export function report({ manifests, findings, families, missing, phase = 'P0' }) {
  /** @type {Record<string, { pass: number, fail: number, skip: number }>} */
  const checks = {};
  for (const id of [...Object.keys(CHECKS), 'manifest']) checks[id] = { pass: 0, fail: 0, skip: 0 };
  for (const f of findings) (checks[f.check] ||= { pass: 0, fail: 0, skip: 0 })[f.state]++;
  const failing = findings.filter((f) => f.state === 'fail');
  const problems = [
    ...missing.map((m) => `${m.family}: ${m.why} (${m.owner} writes ${m.manifest})`),
    ...failing.map((f) => `${f.entry}: ${f.check}: ${f.detail}`),
  ];
  if (!manifests.length) problems.unshift('no asset manifest under assets/');
  const entries = Object.values(families).reduce((a, f) => a + f.entries, 0);
  const failingChecks = Object.entries(checks)
    .filter(([, c]) => c.fail)
    .map(([id, c]) => `${id} ${c.fail}`);
  const famText = Object.entries(families).map(([n, f]) => `${n} ${f.entries}`).join(', ');
  const summary = [
    `${phase}: ${entries} judged entries in ${manifests.length} manifest(s) (${famText || 'none'})`,
    failing.length ? `${failing.length} failing: ${failingChecks.join(', ')}` : entries ? 'every check passes' : 'nothing to check',
    missing.length ? `no manifest or entries yet: ${missing.map((m) => `${m.family} (${m.owner})`).join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('; ');
  return { ok: problems.length === 0, summary, problems, families, missing, checks, findings };
}
