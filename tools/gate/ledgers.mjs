// @ts-check
// Ledger summaries for `gate --status`: the phase and packages (docs/wp/STATUS.md), the feature inventory, bugs,
// quality scores, coverage reports and the asset lock and credits. A ledger that does not exist yet says which
// package creates it.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './port.mjs';

const read = (/** @type {string} */ rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), 'utf8') : null);
const list = (/** @type {string} */ rel, /** @type {RegExp} */ re) => (existsSync(join(ROOT, rel)) ? readdirSync(join(ROOT, rel)).filter((f) => re.test(f)) : []);

/** @returns {{ id: string, name: string } | null} the phase line of docs/wp/STATUS.md */
export function phase() {
  const m = /^Phase:\s*\*\*(P\d+)\s*[—–-]\s*([^*]+)\*\*/m.exec(read('docs/wp/STATUS.md') || '');
  return m ? { id: m[1], name: m[2].trim() } : null;
}

/** @param {string} text @param {string} heading  data rows of the first table after the heading line */
function tableRows(text, heading) {
  const at = text.indexOf(heading);
  if (at < 0) return [];
  const rows = [];
  for (const line of text.slice(at).split('\n').slice(1)) {
    if (!line.startsWith('|')) {
      if (rows.length) break;
      continue;
    }
    if (/^\|\s*-/.test(line)) continue;
    rows.push(line.split('|').slice(1, -1).map((c) => c.trim()));
  }
  return rows.slice(1);
}

/** @param {any[]} items @param {(x: any) => string} key */
const tally = (items, key) => Object.entries(items.reduce((a, x) => ((a[key(x)] = (a[key(x)] || 0) + 1), a), /** @type {Record<string, number>} */ ({})));

/** @param {string} rel @returns {any[] | null} parsed lines of a JSONL ledger (unparsable lines are skipped) */
function jsonl(rel) {
  const text = read(rel);
  if (text == null) return null;
  return text
    .split('\n')
    .filter((l) => l.trim())
    .flatMap((l) => {
      try {
        return [JSON.parse(l)];
      } catch {
        return [];
      }
    });
}

/** @returns {{ ledger: string, state: string }[]} */
export function ledgers() {
  /** @type {{ ledger: string, state: string }[]} */
  const out = [];
  const add = (/** @type {string} */ ledger, /** @type {string} */ state) => out.push({ ledger, state });

  const status = read('docs/wp/STATUS.md');
  if (status) {
    const wps = tableRows(status, '# Work package status');
    const merges = tableRows(status, '## Merge log');
    add('docs/wp/STATUS.md', `${wps.length} packages (${tally(wps, (r) => r[4] || '?').map(([k, n]) => `${n} ${k}`).join(', ')}); ${merges.length} merge(s)`);
  } else add('docs/wp/STATUS.md', 'missing');

  const features = read('docs/FEATURES.md');
  if (features) {
    const rows = features.split('\n').filter((l) => /^\|\s*[A-Z]\d{2,}\s*\|/.test(l));
    const n = (/** @type {string} */ mark) => rows.filter((l) => l.includes(`| ${mark} |`)).length;
    add('docs/FEATURES.md', `${rows.length} rows: ${n('✅')} done, ${n('🟨')} partial, ${n('⬜')} not started`);
  } else add('docs/FEATURES.md', 'missing');

  const bugs = jsonl('docs/bugs.jsonl');
  if (bugs) {
    const open = bugs.filter((b) => !/^(fixed|closed|wontfix|duplicate)$/i.test(String(b.status ?? 'open')));
    const bySev = tally(open, (b) => String(b.severity ?? '?')).sort().map(([k, n]) => `${k} ${n}`).join(', ');
    add('docs/bugs.jsonl', `${bugs.length} bug(s), ${open.length} open${bySev ? ` (${bySev})` : ''}`);
  } else add('docs/bugs.jsonl', 'not created yet (WP-P0-11)');

  const scores = jsonl('docs/quality/scores.jsonl');
  add('docs/quality/scores.jsonl', scores ? `${scores.length} score record(s)` : 'not created yet (WP-P0-11)');

  const reports = list('docs/coverage', /\.md$/);
  add('docs/coverage/', reports.length ? `report(s): ${reports.join(', ')}` : 'no report yet (WP-P0-03)');

  const lock = read('assets/sources.lock.json');
  let locked = 'not created yet (the integrator merges assets/lock/*.json)';
  if (lock) {
    try {
      const j = JSON.parse(lock);
      const entries = Array.isArray(j) ? j : Array.isArray(j.sources) ? j.sources : Object.keys(j);
      locked = `${entries.length} locked source(s)`;
    } catch {
      locked = 'not valid JSON';
    }
  }
  const fragments = list('assets/lock', /\.json$/);
  add('assets/sources.lock.json', `${locked}; ${fragments.length} fragment(s) in assets/lock/`);
  const credits = list('assets/credits', /\.md$/);
  add('assets/CREDITS.md', `${read('assets/CREDITS.md') ? 'present' : 'not created yet'}; ${credits.length} fragment(s) in assets/credits/`);

  const journal = read('docs/JOURNAL.md');
  const last = journal ? [...journal.matchAll(/^## (.+)$/gm)].at(-1)?.[1] : null;
  add('docs/JOURNAL.md', last ? `last entry: ${last}` : 'missing');
  return out;
}
