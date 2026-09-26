// @ts-check
// The dev-server port of this checkout: 5200 + the slot of its work package in docs/wp/STATUS.md, found by the
// current branch, so parallel worktrees never share a server. PORT (a port) or WP_SLOT (a slot) override it; a branch
// without a slot (master, the integrator) gets slot 0. Vite, Playwright and the gate all read it from here.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const BASE_PORT = 5200;
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** @returns {string | null} */
export function currentBranch(cwd = ROOT) {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

/**
 * The slot of a branch in the STATUS.md table (its "Slot / port" cell reads `<slot> / <port>`), or null.
 * @param {string} branch
 * @param {string} statusText
 * @returns {number | null}
 */
export function slotOf(branch, statusText) {
  for (const line of statusText.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (!cells.includes(branch)) continue;
    for (const c of cells) {
      const m = /^(\d+)\s*\/\s*\d+$/.exec(c);
      if (m) return Number(m[1]);
    }
  }
  return null;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ port: number, why: string }}
 */
export function devPort(env = process.env) {
  if (env.PORT) {
    const port = Number(env.PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`PORT=${env.PORT} is not a port`);
    return { port, why: 'PORT' };
  }
  if (env.WP_SLOT) {
    const slot = Number(env.WP_SLOT);
    if (!Number.isInteger(slot) || slot < 0 || slot > 99) throw new Error(`WP_SLOT=${env.WP_SLOT} is not a slot (0 … 99)`);
    return { port: BASE_PORT + slot, why: `WP_SLOT=${slot}` };
  }
  const branch = currentBranch();
  let status = '';
  try {
    status = readFileSync(new URL('docs/wp/STATUS.md', `file://${ROOT}`), 'utf8');
  } catch {
    // no status board: slot 0
  }
  const slot = branch ? slotOf(branch, status) : null;
  if (slot != null) return { port: BASE_PORT + slot, why: `slot ${slot} of ${branch} in docs/wp/STATUS.md` };
  return { port: BASE_PORT, why: `${branch || 'this checkout'} has no slot` };
}
