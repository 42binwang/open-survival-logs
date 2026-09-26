#!/usr/bin/env node
// @ts-check
// The asset lock (spec §11): locked sources verify, every shipped file traces to locked sources and a build, and a
// re-bake of a sample matches at SSIM ≥ 0.99. The gate's `asset-lock` check runs `node tools/asset-lock.mjs --json`.
//
//   node tools/asset-lock.mjs [--json] [--seed <n>] [--all | --asset <id> ...] [--root <dir>] [--budget-min 50]
//
// 1. `node tools/fetch-assets.mjs --verify`: every locked source restores into assets/cache/ at its SHA-256.
// 2. Every entry of every shipped manifest (src/contracts/assets.js) names a rebuild recipe, sources that are in the
//    lock, and a digest per shipped file that matches the committed file.
// 3. A sample, at least 5 % of the assets and one per family, ranked by the seed (default: the commit's first
//    8 hex digits; printed), is rebuilt in a sandbox (tools/asset-lock/sandbox.mjs) and every output is compared
//    with the committed file through its fingerprint (tools/asset-lock/fingerprint.mjs) at SSIM ≥ 0.99.
// --json prints one line { ok, summary, problems, seed, sampled, results, ms }. Exit code 0 pass, 1 fail, 2 usage.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { assetOutputs, rebuildOf } from '../src/contracts/assets.js';
import { compare, modelProblems, SSIM_MIN } from './asset-lock/fingerprint.mjs';
import { findManifests, lockedSources } from './asset-lock/manifests.mjs';
import { prepare, runEntry, sandboxDir } from './asset-lock/sandbox.mjs';
import { SHARE, sample, seedFor } from './asset-lock/sample.mjs';

const LFS_POINTER = 'version https://git-lfs.github.com/spec/v1';

/** @param {string} msg @returns {never} */
function usage(msg) {
  console.error(`asset-lock: ${msg}\nusage: node tools/asset-lock.mjs [--json] [--seed <n>] [--all | --asset <id> ...] [--root <dir>] [--budget-min 50]`);
  process.exit(2);
}

/** @type {any} */
let args;
try {
  args = parseArgs({
    options: {
      json: { type: 'boolean' },
      seed: { type: 'string' },
      all: { type: 'boolean' },
      asset: { type: 'string', multiple: true },
      root: { type: 'string' },
      'budget-min': { type: 'string', default: '50' },
    },
  }).values;
} catch (err) {
  usage(/** @type {Error} */ (err).message);
}
if (args.all && args.asset) usage('pick --all or --asset, not both');
if (args.seed != null && !/^\d+$/.test(args.seed)) usage(`--seed takes a non-negative integer, not '${args.seed}'`);
const budgetMin = Number(args['budget-min']);
if (!(budgetMin > 0)) usage('--budget-min takes minutes');

const root = resolve(args.root || fileURLToPath(new URL('..', import.meta.url)));
const t0 = performance.now();
const log = (/** @type {string} */ s) => !args.json && console.log(s);
/** @type {string[]} */
const problems = [];
const secs = (/** @type {number} */ ms) => `${(ms / 1000).toFixed(1)} s`;

/** @param {{ ok: boolean, summary: string, [k: string]: unknown }} report */
function finish(report) {
  const ms = Math.round(performance.now() - t0);
  const full = { ...report, problems, ms };
  if (args.json) console.log(JSON.stringify(full));
  else {
    for (const p of problems) console.log(`  ✖ ${p}`);
    console.log(`${report.ok ? 'PASS' : 'FAIL'} asset-lock: ${report.summary}`);
  }
  process.exit(report.ok ? 0 : 1);
}

// ------------------------------------------------------------------------------------------ 1. manifests, sources
const found = findManifests(root);
problems.push(...found.problems);
const manifests = found.manifests;
const entries = manifests.flatMap(({ file, manifest }) => (Array.isArray(manifest.assets) ? manifest.assets : []).map((entry) => ({ file, manifest, entry })));
if (!manifests.length && !problems.length) finish({ ok: true, summary: 'no shipped asset manifests yet', seed: null, sampled: [], results: [] });

const fetch = join(root, 'tools', 'fetch-assets.mjs');
let sourcesNote = '';
if (!existsSync(fetch)) problems.push('tools/fetch-assets.mjs is missing: the locked sources cannot be verified');
else {
  let out;
  let ok = false;
  try {
    out = execFileSync(process.execPath, [fetch, '--verify'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 });
    ok = true;
  } catch (err) {
    out = String(/** @type {any} */ (err).stdout || '');
  }
  const last = out.trim().split('\n').at(-1) || '';
  let report = null;
  try {
    report = JSON.parse(last);
  } catch {
    // no JSON line
  }
  if (!ok || report?.ok === false) problems.push(...(report?.problems?.length ? report.problems.map((/** @type {string} */ p) => `sources: ${p}`) : [`sources: fetch-assets --verify failed${report?.summary ? `: ${report.summary}` : ''}`]));
  sourcesNote = report?.summary || 'sources verified';
}
log(`sources: ${sourcesNote || 'not verified'}`);

// ------------------------------------------------------------------------------------------ 2. trace
const locked = lockedSources(root);
const sha = (/** @type {string} */ p) => createHash('sha256').update(readFileSync(join(root, p))).digest('hex');
/** @type {Set<string>} ids whose committed files are sound enough to re-bake */
const traced = new Set();
for (const { file, manifest, entry } of entries) {
  const id = entry.id;
  const before = problems.length;
  if (!rebuildOf(manifest, entry)) problems.push(`${id}: no build (${file} names no rebuild recipe for it)`);
  for (const s of entry.sources || []) if (!locked.has(s)) problems.push(`${id}: source '${s}' is not in the asset lock`);
  if (entry.license !== 'LicenseRef-Original' && !(entry.sources || []).length) problems.push(`${id}: a ${entry.license} asset must name its locked sources`);
  for (const p of assetOutputs(entry)) {
    if (!existsSync(join(root, p))) {
      problems.push(`${id}: ${p} is missing`);
      continue;
    }
    if (readFileSync(join(root, p)).subarray(0, LFS_POINTER.length).toString('latin1') === LFS_POINTER) {
      problems.push(`${id}: ${p} is an LFS pointer (run git lfs pull)`);
      continue;
    }
    if (entry.kind === 'model' && /\.(glb|gltf)$/i.test(p)) {
      try {
        for (const q of modelProblems(entry, readFileSync(join(root, p)))) problems.push(`${id}: ${p}: ${q}`);
      } catch (err) {
        problems.push(`${id}: ${p} is not a readable glTF (${/** @type {Error} */ (err).message})`);
      }
    }
    const want = entry.digests?.[p];
    if (!want) problems.push(`${id}: ${p} has no digest in ${file}`);
    else if (sha(p) !== want) problems.push(`${id}: ${p} does not match its digest (the committed file changed without a rebuild)`);
  }
  if (problems.length === before) traced.add(id);
}
log(`traced: ${entries.length} asset(s) in ${manifests.length} manifest(s), ${traced.size} clean`);

// ------------------------------------------------------------------------------------------ 3. sample and re-bake
const commit = (() => {
  try {
    return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
})();
const seed = args.seed != null ? Number(args.seed) : seedFor(commit);
const byId = new Map(entries.map((x) => [x.entry.id, x]));
for (const id of args.asset || []) if (!byId.has(id)) usage(`no asset '${id}' in any manifest`);
const pool = entries.filter((x) => rebuildOf(x.manifest, x.entry)).map((x) => ({ id: x.entry.id, family: x.entry.id.split('/')[0] }));
const picked = args.all ? pool.map((a) => a.id) : args.asset ? [...args.asset] : sample(pool, seed);
log(`sample: ${picked.length} of ${pool.length} (${args.all ? '--all' : args.asset ? '--asset' : `seed ${seed}, at least ${SHARE * 100} % and one per family`})`);

// one run per distinct (manifest, recipe, arguments)
/** @type {Map<string, { file: string, name: string, recipe: import('../src/contracts/assets.js').RebuildRecipe, args: string[], ids: string[] }>} */
const runs = new Map();
for (const id of picked) {
  const x = byId.get(id);
  const r = x && rebuildOf(x.manifest, x.entry);
  if (!x || !r) continue;
  const key = [x.file, r.name, ...r.args].join('\0');
  if (!runs.has(key)) runs.set(key, { file: x.file, name: r.name, recipe: r.recipe, args: r.args, ids: [] });
  runs.get(key)?.ids.push(id);
}
const estimate = [...runs.values()].reduce((s, r) => s + r.recipe.cost, 0);
if (estimate > budgetMin * 60) problems.push(`the sample's estimated re-bake time ${Math.round(estimate)} s exceeds the ${budgetMin}-minute budget (recipe costs)`);

/** @type {{ id: string, file: string, ssim: number | null, ms: number, problems: string[] }[]} */
const results = [];
const lockDir = join(sandboxDir(root), 'lock');
if (runs.size && estimate <= budgetMin * 60) {
  mkdirSync(join(sandboxDir(root)), { recursive: true });
  try {
    mkdirSync(lockDir);
  } catch {
    const pid = Number(existsSync(join(lockDir, 'pid')) ? readFileSync(join(lockDir, 'pid'), 'utf8') : NaN);
    let alive;
    try {
      alive = Number.isInteger(pid) && process.kill(pid, 0);
    } catch {
      alive = false;
    }
    if (alive) {
      problems.push(`another asset-lock run (pid ${pid}) is using ${sandboxDir(root)}`);
      finish({ ok: false, summary: 'the re-bake sandbox is busy', seed, sampled: picked, results: [] });
    }
  }
  writeFileSync(join(lockDir, 'pid'), String(process.pid));
  try {
    for (const run of runs.values()) {
      const outputs = run.ids.flatMap((id) => assetOutputs(/** @type {any} */ (byId.get(id)).entry));
      const box = prepare(root, { manifestFile: run.file, recipe: run.recipe, outputs });
      log(`re-bake: ${run.ids.join(', ')} with ${run.recipe.entry} ${run.args.join(' ')}`);
      const r = await runEntry(box, run.recipe, run.args);
      if (r.code !== 0) {
        const tail = r.out.trim().split('\n').slice(-6).join(' | ');
        for (const id of run.ids) {
          problems.push(`${id}: the re-bake ${r.timedOut ? 'timed out' : `failed (exit ${r.code})`}: ${tail}`);
          results.push({ id, file: '', ssim: null, ms: Math.round(r.ms), problems: ['re-bake failed'] });
        }
        continue;
      }
      for (const id of run.ids) {
        for (const p of assetOutputs(/** @type {any} */ (byId.get(id)).entry)) {
          const t1 = performance.now();
          if (!existsSync(join(box, p))) {
            problems.push(`${id}: the re-bake did not write ${p}`);
            results.push({ id, file: p, ssim: null, ms: 0, problems: ['not written'] });
            continue;
          }
          if (!existsSync(join(root, p))) continue;
          let c;
          try {
            c = await compare(join(root, p), join(box, p), root);
          } catch (err) {
            c = { ssim: null, problems: [`cannot fingerprint: ${/** @type {Error} */ (err).message}`] };
          }
          for (const q of c.problems) problems.push(`${id}: ${p} re-bakes differently: ${q}`);
          results.push({ id, file: p, ssim: c.ssim, ms: Math.round(r.ms + performance.now() - t1), problems: c.problems });
        }
      }
    }
  } finally {
    rmSync(lockDir, { recursive: true, force: true });
  }
}

const ssims = results.map((r) => r.ssim).filter((s) => s != null);
const minSsim = ssims.length ? Math.min(.../** @type {number[]} */ (ssims)) : null;
const summary =
  `${entries.length} asset(s) in ${manifests.length} manifest(s) traced to locked sources and builds; ` +
  `re-baked ${[...runs.values()].reduce((n, r) => n + r.ids.length, 0)} (${results.length} files, seed ${seed}${args.all ? ', --all' : ''}) ` +
  `in ${secs(performance.now() - t0)}${minSsim != null ? `, min SSIM ${minSsim.toFixed(4)} (≥ ${SSIM_MIN})` : ''}`;
finish({ ok: problems.length === 0, summary, seed, sampled: picked, results, estimateS: Math.round(estimate) });
