// @ts-check
// Loads the simulation headless in Node the way the browser wires it: every src/sim and src/meta module that
// src/systems.js imports, in the same order (UI panels and audio stay out).
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { ROOT } from './port.mjs';

/** @param {string} rel  repo-relative module path */
export const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href);

/** @returns {Promise<string[]>} the sim / meta modules src/systems.js wires, repo-relative */
export async function loadSystems() {
  const wiring = readFileSync(join(ROOT, 'src/systems.js'), 'utf8');
  const mods = [...wiring.matchAll(/^import '\.\/((?:sim|meta)\/[\w/-]+\.js)';$/gm)].map((m) => `src/${m[1]}`);
  if (!mods.length) throw new Error('src/systems.js wires no sim modules');
  for (const m of mods) await load(m);
  return mods;
}
