// Syntax-check every JS module under src/ with `node --check`.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.js') || name.endsWith('.mjs')) files.push(p);
  }
})(join(root, 'src'));

let bad = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (err) {
    bad++;
    console.error(`✖ ${f}\n${err.stderr?.toString() || err.message}`);
  }
}
console.log(`${files.length - bad}/${files.length} modules parse`);
process.exit(bad ? 1 : 0);
