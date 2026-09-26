// @ts-check
// A server already listening on this checkout's port is reused, so make sure it serves this checkout and not a
// parallel worktree (the dev server answers /__checkout, see vite.config.js).
import { realpathSync } from 'node:fs';
import { ROOT } from '../../tools/gate/port.mjs';

/** @param {import('@playwright/test').FullConfig} config */
export default async function globalSetup(config) {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) return;
  const res = await fetch(new URL('/__checkout', baseURL));
  const info = res.ok && res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  const same = (/** @type {string} */ p) => {
    try {
      return realpathSync(p) === realpathSync(ROOT);
    } catch {
      return false;
    }
  };
  if (!info?.root || !same(info.root)) {
    throw new Error(`${baseURL} is not this checkout's dev server (it serves ${info?.root ?? 'something else'}); stop it, or run with PORT=<free port>`);
  }
}
