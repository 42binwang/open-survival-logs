// @ts-check
// Re-bakes run in a sandbox copy of the checkout so they never write the committed tree. The sandbox has a stable
// path per checkout (tmpdir/survival-logs-asset-lock/<hash>/root) because virtualenvs kept between runs (a recipe's
// `persist`) hold absolute paths. Each run: keep the persisted paths, clear the rest, copy the recipe inputs and the
// manifest, link the shared paths, delete the outputs about to be rebuilt, run the entry.
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * @param {string} root
 */
export function sandboxDir(root) {
  return join(tmpdir(), 'survival-logs-asset-lock', createHash('sha256').update(root).digest('hex').slice(0, 12));
}

/**
 * Repo-relative files under a path: tracked files in a git checkout, else every file on disk.
 * @param {string} root
 * @param {string} rel
 */
function filesUnder(root, rel) {
  try {
    const out = execFileSync('git', ['-C', root, 'ls-files', '-z', '--', rel], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const tracked = out.split('\0').filter(Boolean);
    if (tracked.length) return tracked;
  } catch {
    // not a git checkout
  }
  const abs = join(root, rel);
  if (!existsSync(abs)) return [];
  if (!statSync(abs).isDirectory()) return [rel.replace(/\/$/, '')];
  /** @type {string[]} */
  const found = [];
  /** @param {string} r */
  const walk = (r) => {
    for (const e of readdirSync(join(root, r), { withFileTypes: true })) {
      const p = `${r}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) found.push(p);
    }
  };
  walk(rel.replace(/\/$/, ''));
  return found;
}

/**
 * Prepares the sandbox for one recipe run. Returns its root.
 * @param {string} root  the checkout
 * @param {{ manifestFile: string, recipe: import('../../src/contracts/assets.js').RebuildRecipe, outputs: string[] }} run
 */
export function prepare(root, { manifestFile, recipe, outputs }) {
  const base = sandboxDir(root);
  const box = join(base, 'root');
  const keep = join(base, 'keep');
  rmSync(keep, { recursive: true, force: true });
  const persist = recipe.persist || [];
  persist.forEach((p, i) => {
    if (existsSync(join(box, p))) {
      mkdirSync(keep, { recursive: true });
      renameSync(join(box, p), join(keep, String(i)));
    }
  });
  rmSync(box, { recursive: true, force: true });
  mkdirSync(box, { recursive: true });
  for (const rel of [...recipe.inputs, manifestFile]) {
    for (const f of filesUnder(root, rel)) {
      mkdirSync(dirname(join(box, f)), { recursive: true });
      cpSync(join(root, f), join(box, f));
    }
  }
  for (const rel of recipe.shared || []) {
    const target = join(root, rel.replace(/\/$/, ''));
    if (!existsSync(target)) mkdirSync(target, { recursive: true });
    const link = join(box, rel.replace(/\/$/, ''));
    rmSync(link, { recursive: true, force: true });
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(target, link);
  }
  persist.forEach((p, i) => {
    if (existsSync(join(keep, String(i)))) {
      rmSync(join(box, p), { recursive: true, force: true });
      mkdirSync(dirname(join(box, p)), { recursive: true });
      renameSync(join(keep, String(i)), join(box, p));
    }
  });
  for (const o of outputs) rmSync(join(box, o), { force: true });
  writeFileSync(join(base, 'owner'), `${root}\n`);
  return box;
}

/**
 * Runs a recipe entry inside the sandbox.
 * @param {string} box
 * @param {import('../../src/contracts/assets.js').RebuildRecipe} recipe
 * @param {string[]} args
 * @returns {Promise<{ code: number | null, out: string, ms: number, timedOut: boolean }>}
 */
export function runEntry(box, recipe, args) {
  const ext = recipe.entry.split('.').pop();
  const cmd = ext === 'sh' ? 'bash' : ext === 'py' ? 'python3' : process.execPath;
  const timeoutMs = 1000 * (recipe.timeoutSec ?? Math.max(60, 10 * recipe.cost));
  return new Promise((resolve) => {
    const t0 = performance.now();
    const child = spawn(cmd, [recipe.entry, ...args], {
      cwd: box,
      env: { ...process.env, ASSET_LOCK_SANDBOX: '1', PYTHONHASHSEED: '0', SOURCE_DATE_EPOCH: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let timedOut = false;
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out, ms: performance.now() - t0, timedOut });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: -1, out: `${out}\n${err.message}`, ms: performance.now() - t0, timedOut });
    });
  });
}
