// @ts-check
// The shape every family evaluation returns, and the helpers that build it.

/**
 * @typedef {{ ok: boolean, detail?: string }} Check
 * @typedef {object} Entity
 * @property {string} id
 * @property {string} name
 * @property {boolean} ok  every check that applies passed
 * @property {Record<string, Check>} checks
 * @property {Record<string, string[]>} [rows]  FEATURES.md rows a failing check reopens, where they differ by entity
 * @typedef {object} Family
 * @property {string} id
 * @property {string} title
 * @property {string} source  where the denominator comes from
 * @property {{ id: string, title: string }[]} checks
 * @property {number} total  entities in the denominator
 * @property {{ id: string, name: string, why: string }[]} excluded  left out by a rule read from the config
 * @property {Entity[]} entities  the entities in scope
 * @property {number} ok
 * @property {number} scope
 * @property {number} pct  0 … 100
 * @property {string[]} notes
 */

/**
 * @param {{ id: string, title: string, source: string, checks: { id: string, title: string }[] }} meta
 * @param {{ id: string | number, name: string, excluded?: string | null, checks?: Record<string, Check>, rows?: Record<string, string[]> }[]} rows
 * @param {string[]} [notes]
 * @returns {Family}
 */
export function family(meta, rows, notes = []) {
  /** @type {Family['excluded']} */
  const excluded = [];
  /** @type {Entity[]} */
  const entities = [];
  for (const r of rows) {
    if (r.excluded) {
      excluded.push({ id: String(r.id), name: r.name, why: r.excluded });
      continue;
    }
    const checks = r.checks || {};
    /** @type {Entity} */
    const e = { id: String(r.id), name: r.name, ok: Object.values(checks).every((c) => c.ok), checks };
    if (r.rows) e.rows = r.rows;
    entities.push(e);
  }
  const ok = entities.filter((e) => e.ok).length;
  const scope = entities.length;
  return { ...meta, total: rows.length, excluded, entities, ok, scope, pct: scope ? Math.floor((ok / scope) * 1000) / 10 : 100, notes };
}

/** @param {boolean} ok @param {string} [detail] @returns {Check} */
export const check = (ok, detail) => (detail ? { ok, detail } : { ok });

/** A list shortened for a detail line. @param {Array<string | number>} list @param {number} [n] */
export const few = (list, n = 3) => (list.length > n ? `${list.slice(0, n).join(', ')} (+${list.length - n})` : list.join(', '));
