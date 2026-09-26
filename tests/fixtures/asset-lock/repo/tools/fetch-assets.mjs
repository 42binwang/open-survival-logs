// @ts-check
// Fixture stand-in for tools/fetch-assets.mjs --verify: checks the SHA-256 of every locked file in assets/cache/ and
// ends with the same JSON line { ok, summary, problems }.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
/** @type {string[]} */
const problems = [];
let files = 0;
for (const f of readdirSync(join(root, 'assets/lock'))) {
  for (const s of JSON.parse(readFileSync(join(root, 'assets/lock', f), 'utf8')).sources) {
    for (const file of s.files) {
      files++;
      const p = join(root, 'assets/cache', file.path);
      if (!existsSync(p)) problems.push(`${s.id}: ${file.path} is missing`);
      else if (createHash('sha256').update(readFileSync(p)).digest('hex') !== file.sha256) problems.push(`${s.id}: ${file.path} does not match its SHA-256`);
    }
  }
}
console.log(JSON.stringify({ ok: !problems.length, summary: `${files} locked file(s) checked`, problems }));
process.exit(problems.length ? 1 : 0);
