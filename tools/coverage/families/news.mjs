// @ts-check
// Patch notes: every line item of https://store.steampowered.com/news/app/4164790 maps to FEATURES.md rows that are all done (✅; a line on a
// reopened 🟨 or ⬜ row is not covered), or is marked not applicable with a reason, in docs/coverage/news-map.json:
//   { "schema": "survival-logs/news-map@1", "reasons": { "<code>": "<why such items are not a feature>" },
//     "items": { "<item id>": { "rows": ["A08", …] } | { "na": "<code or a reason in words>" }, "text": "<the item>" } }
import { check, family, few } from '../family.mjs';

export const NEWS_MAP_SCHEMA = 'survival-logs/news-map@1';
/** FEATURES.md status of a row that is implemented and covered by a test; ⬜ and 🟨 rows cover nothing yet. */
const DONE = '✅';

/**
 * @param {{ items: import('../news.mjs').NewsItem[], map: any, features: Map<string, import('../news.mjs').FeatureRow> }} ctx
 * @returns {import('../family.mjs').Family}
 */
export function evaluate({ items, map, features }) {
  const notes = [];
  const entries = /** @type {Record<string, any>} */ (map?.items || {});
  const reasons = /** @type {Record<string, string>} */ (map?.reasons || {});
  if (!map) notes.push('docs/coverage/news-map.json is missing: no line item is mapped');
  else if (map.schema !== NEWS_MAP_SCHEMA) notes.push(`docs/coverage/news-map.json: schema is ${JSON.stringify(map.schema)}, expected ${NEWS_MAP_SCHEMA}`);
  const ids = new Set(items.map((i) => i.id));
  const stale = Object.keys(entries).filter((id) => !ids.has(id));
  if (stale.length) notes.push(`${stale.length} map entr${stale.length === 1 ? 'y has' : 'ies have'} no line item any more (the news text changed): ${few(stale, 5)}`);
  for (const [code, why] of Object.entries(reasons)) if (typeof why !== 'string' || why.trim().length < 10) notes.push(`reason '${code}' has no explanation`);
  const rows = items.map((it) => {
    const e = entries[it.id];
    /** @type {import('../family.mjs').Check} */
    let c;
    if (!e) c = check(false, 'not in the map');
    else if (Array.isArray(e.rows) && e.rows.length) {
      const unknown = e.rows.filter((/** @type {string} */ r) => !features.has(r));
      const open = e.rows.filter((/** @type {string} */ r) => features.has(r) && features.get(r)?.status !== DONE);
      c = unknown.length ? check(false, `no FEATURES.md row ${unknown.join(', ')}`) : open.length ? check(false, `maps to row(s) not done: ${open.map((/** @type {string} */ r) => `${r} ${features.get(r)?.status || '?'}`).join(', ')}`) : check(true, e.rows.join(', '));
    } else if (typeof e.na === 'string' && e.na.trim()) {
      const why = reasons[e.na] ?? (e.na.trim().length >= 10 && !/^[\w-]+$/.test(e.na.trim()) ? e.na : null);
      c = why && why.trim().length >= 10 ? check(true, `not applicable: ${e.na}`) : check(false, `not applicable without a reason ('${e.na}' is no reason code)`);
    } else c = check(false, 'neither rows nor a reason');
    return { id: it.id, name: `${it.date}${it.section ? ` [${it.section}]` : ''}: ${it.text.slice(0, 90)}`, checks: { mapped: c } };
  });
  return family(
    {
      id: 'news',
      title: 'Patch notes',
      source: 'line items of https://store.steampowered.com/news/app/4164790',
      checks: [{ id: 'mapped', title: 'maps to FEATURES.md rows that are all done (✅), or is not applicable with a reason (docs/coverage/news-map.json)' }],
    },
    rows,
    notes
  );
}
