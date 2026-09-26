#!/usr/bin/env node
// @ts-check
// Keys audit: every counter, story tag, flag, bus event and storage key used under src/ is declared once in
// src/contracts/keys.js, produced somewhere and used somewhere. Engine and conventions: tools/keys/.
//
//   node tools/keys-audit.mjs            report; exit 0 when clean, 1 when there are problems, 2 on an internal error
//   node tools/keys-audit.mjs --json     the same as JSON (for tools/gate.mjs)
//   node tools/keys-audit.mjs --list     every declared key with the sites that produce and use it
//   node tools/keys-audit.mjs --root DIR audit another checkout (default: this repository)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { audit, summarize, showKey } from './keys/audit.mjs';

const HELP = `usage: node tools/keys-audit.mjs [--json] [--list] [--root DIR]

Problems it reports:
  undeclared   a key is used in src/ but has no entry in src/contracts/keys.js
  unproduced   a declared key is read but nothing writes / emits it
  unconsumed   a declared key is written / emitted but nothing reads / listens to it
  unlabelled   a counter only the Statistics tab / death screen shows, under its raw key (label it, do not delete it)
  stale        a declared key is not found in the code any more
  dynamic      a computed key (emit(type), tags[x]) at a site nobody reviewed
  registry     a mistake in the registry or the rules (bad owner, missing reason, overlap, …)

How to annotate consumers or producers the scan cannot see: see the header of src/contracts/keys.js.`;

/** @param {string} root @param {string[]} dirs */
function collect(root, dirs) {
  /** @type {Map<string, string>} */
  const files = new Map();
  /** @param {string} dir */
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.m?js$/.test(name)) files.set(relative(root, p).split(sep).join('/'), readFileSync(p, 'utf8'));
    }
  };
  for (const d of dirs) if (existsSync(join(root, d))) walk(join(root, d));
  return files;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return 0;
  }
  const json = args.includes('--json');
  const list = args.includes('--list');
  const at = args.indexOf('--root');
  const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const root = at >= 0 && args[at + 1] ? resolve(args[at + 1]) : here;

  const rulesPath = existsSync(join(root, 'tools/keys/rules.mjs')) ? join(root, 'tools/keys/rules.mjs') : join(here, 'tools/keys/rules.mjs');
  const { RULES } = await import(pathToFileURL(rulesPath).href);
  const registry = await import(pathToFileURL(join(root, 'src/contracts/keys.js')).href);
  const files = collect(root, ['src', 'tests']);
  const result = audit({ files, registry, rules: RULES, exists: (p) => existsSync(join(root, p)) });
  const counts = summarize(result);

  if (json) {
    const out = {
      tool: 'keys-audit',
      ok: result.problems.length === 0,
      counts,
      problems: result.problems,
      // whole-namespace reads (e.g. the Statistics tab lists every counter); they do not make a key "used"
      enumerations: result.enumerations,
      ...(list ? { keys: result.keys.map((k) => ({ ...k, key: showKey(k.key) })) } : {}),
    };
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    return out.ok ? 0 : 1;
  }

  const kinds = Object.entries(counts.declared.byKind).map(([k, n]) => `${k} ${n}`).join(', ');
  console.log(`keys-audit: ${counts.filesScanned} modules, ${counts.declared.total} keys declared (${kinds}), ${counts.accesses.total} accesses, ${counts.dynamic.total} computed-key sites (${counts.dynamic.reviewed} reviewed)`);
  if (list) {
    for (const k of result.keys) {
      console.log(`\n${k.ns} ${k.key} — ${k.meaning} [${k.owner}]`);
      for (const s of k.writes) console.log(`  write ${s.file}:${s.line} ${s.via}`);
      for (const s of k.reads) console.log(`  read  ${s.file}:${s.line} ${s.via}`);
      for (const r of k.writtenBy) console.log(`  write (declared) ${r}`);
      for (const r of k.readBy) console.log(`  read  (declared) ${r}`);
    }
  }
  if (!result.problems.length) {
    console.log('✔ no problems');
    return 0;
  }
  const byType = Object.entries(counts.byType).filter(([, n]) => n).map(([t, n]) => `${n} ${t}`).join(', ');
  console.log(`✖ ${result.problems.length} problems: ${byType}\n`);
  for (const p of result.problems) {
    const where = p.sites.slice(0, 3).map((s) => `${s.file}:${s.line} ${s.mode}`).join(', ');
    const more = p.sites.length > 3 ? ` +${p.sites.length - 3}` : '';
    console.log(`${p.type.padEnd(10)} ${p.ns.padEnd(12)} ${p.key}  — ${p.message}${where ? `  [${where}${more}]` : ''}`);
  }
  return 1;
}

// exitCode rather than exit(): a large --json report on a pipe must be flushed before the process ends
main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(err?.stack || err);
    process.exitCode = 2;
  }
);
