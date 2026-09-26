// @ts-check
// The keys audit: matches every key access found in the sources (scan.mjs) against the registry
// (src/contracts/keys.js) and reports keys that are read but never produced, produced but never used, used but not
// declared, declared but not found, computed-key sites nobody reviewed, and mistakes in the registry itself.
import { Module, scanModule, HOLE, toPattern, showKey } from './scan.mjs';

/** @typedef {import('./scan.mjs').Access} Access */
/** @typedef {import('./scan.mjs').DynamicAccess} DynamicAccess */
/** @typedef {import('./scan.mjs').ContainerUse} ContainerUse */
/** @typedef {import('./scan.mjs').Rules} Rules */
/** @typedef {import('./scan.mjs').Mode} Mode */

/**
 * @typedef {object} Entry A registry declaration.
 * @property {string} ns
 * @property {string} key as declared (`clue.${line}`)
 * @property {string} pattern HOLE form
 * @property {boolean} template
 * @property {string} kind
 * @property {string} owner
 * @property {string} meaning
 * @property {string[]} readBy
 * @property {string[]} writtenBy
 * @property {Record<string, string[]>} [values]
 * @property {RegExp | null} re
 * @property {string[]} names placeholder names
 * @property {number} fixed length of the literal text (templates: more literal text = more specific)
 *
 * @typedef {'undeclared' | 'unproduced' | 'unconsumed' | 'unlabelled' | 'stale' | 'dynamic' | 'registry'} ProblemType
 * @typedef {{ file: string, line: number, mode: Mode, via: string }} Site
 * @typedef {object} Problem
 * @property {ProblemType} type
 * @property {string} ns
 * @property {string} kind
 * @property {string} key
 * @property {string} message
 * @property {Site[]} sites
 *
 * @typedef {object} RegistryModule
 * @property {Record<string, { kind: string, where: string, doc?: string }>} NAMESPACES
 * @property {Record<string, Record<string, [string, string, ({ readBy?: string[], writtenBy?: string[], values?: Record<string, string[]> } | undefined)?]>>} KEYS
 */

export const PROBLEM_TYPES = /** @type {const} */ (['undeclared', 'unproduced', 'unconsumed', 'unlabelled', 'stale', 'dynamic', 'registry']);

const MESSAGES = {
  undeclared: 'used but not declared in src/contracts/keys.js',
  unproduced: 'read but never produced',
  unconsumed: 'produced but never used',
  unlabelled: 'only shown under its raw key by a screen that lists the whole namespace',
  stale: 'declared but not found in the code',
  dynamic: 'computed key at a site that is not reviewed',
};

/** @param {string} s */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** First token of a readBy / writtenBy / owner reference (`tests/x.test.js — why`). @param {string} ref */
export const refTarget = (ref) => ref.trim().split(/\s+/)[0];

/**
 * @param {RegistryModule} reg
 * @returns {{ entries: Entry[], problems: Problem[] }}
 */
export function buildRegistry(reg) {
  /** @type {Entry[]} */
  const entries = [];
  /** @type {Problem[]} */
  const problems = [];
  const bad = (/** @type {string} */ ns, /** @type {string} */ key, /** @type {string} */ message) => problems.push({ type: 'registry', ns, kind: reg.NAMESPACES?.[ns]?.kind || '?', key, message, sites: [] });
  if (!reg || typeof reg.KEYS !== 'object' || typeof reg.NAMESPACES !== 'object') {
    bad('?', '?', 'the registry must export NAMESPACES and KEYS');
    return { entries, problems };
  }
  for (const [ns, table] of Object.entries(reg.KEYS)) {
    const def = reg.NAMESPACES[ns];
    if (!def) bad(ns, '*', `KEYS.${ns} has no NAMESPACES entry`);
    for (const [key, spec] of Object.entries(table || {})) {
      if (!Array.isArray(spec) || typeof spec[0] !== 'string' || typeof spec[1] !== 'string' || !spec[1].trim()) {
        bad(ns, key, 'declare keys as [owner, meaning, options?] with a non-empty meaning');
        continue;
      }
      const [owner, meaning, opts = {}] = spec;
      const pattern = toPattern(key);
      const template = pattern.includes(HOLE);
      const names = [...key.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1]);
      const chunks = key.split(/\$\{[^}]*\}/);
      entries.push({
        ns,
        key,
        pattern,
        template,
        kind: def?.kind || '?',
        owner,
        meaning,
        readBy: opts.readBy || [],
        writtenBy: opts.writtenBy || [],
        values: opts.values,
        re: template ? new RegExp(`^${chunks.map(escapeRe).join('(.+?)')}$`, 's') : null,
        names,
        fixed: chunks.join('').length,
      });
      for (const name of Object.keys(opts.values || {})) if (!names.includes(name)) bad(ns, key, `values.${name} is not a placeholder of the key`);
    }
  }
  // a literal key may not also be covered by a template of the same namespace
  for (const e of entries) {
    if (e.template) continue;
    for (const t of entries) if (t.template && t.ns === e.ns && t.re?.test(e.key) && valuesOk(t, e.key)) bad(e.ns, e.key, `also matches the template ${t.key}; declare it once`);
  }
  return { entries, problems };
}

/** @param {Entry} e @param {string} key */
function valuesOk(e, key) {
  if (!e.values || !e.re) return true;
  const m = e.re.exec(key);
  if (!m) return false;
  return e.names.every((name, k) => !e.values?.[name] || m[k + 1].includes(HOLE) || e.values[name].includes(m[k + 1]));
}

/** Registry lookup: exact keys first, then the most specific template. */
export class KeyIndex {
  /** @param {Entry[]} entries */
  constructor(entries) {
    /** @type {Map<string, Entry>} */
    this.exact = new Map();
    /** @type {Map<string, Entry[]>} */
    this.templates = new Map();
    for (const e of entries) {
      if (e.template) this.templates.set(e.ns, [...(this.templates.get(e.ns) || []), e]);
      else this.exact.set(`${e.ns}\u0000${e.key}`, e);
    }
    for (const list of this.templates.values()) list.sort((a, b) => b.fixed - a.fixed);
  }

  /** @param {string} ns @param {string} key @returns {Entry | null} */
  find(ns, key) {
    if (!key.includes(HOLE)) {
      const hit = this.exact.get(`${ns}\u0000${key}`);
      if (hit) return hit;
    }
    for (const t of this.templates.get(ns) || []) if (t.re?.test(key) && valuesOk(t, key)) return t;
    return null;
  }

  /** A template the key matches except for its placeholder values (for the error message). @param {string} ns @param {string} key */
  nearMiss(ns, key) {
    return (this.templates.get(ns) || []).find((t) => t.re?.test(key)) || null;
  }
}

/**
 * Audits a set of sources against a registry.
 * @param {object} input
 * @param {Map<string, string>} input.files repo-relative path → source (everything under src/, plus files named by references)
 * @param {RegistryModule} input.registry
 * @param {Rules} input.rules
 * @param {(path: string) => boolean} [input.exists] does a referenced path exist (defaults to `files.has`)
 */
export function audit({ files, registry, rules, exists = (p) => files.has(p) }) {
  const { entries, problems } = buildRegistry(registry);
  const index = new KeyIndex(entries);
  const knownNs = new Set(Object.keys(registry.NAMESPACES || {}));
  /** @type {Access[]} */
  const accesses = [];
  /** @type {DynamicAccess[]} */
  const dynamic = [];
  /** @type {ContainerUse[]} whole-namespace reads (`Object.entries(state.progress.counters)`): listed, not counted as uses */
  const enumerations = [];
  /** @type {Map<string, Array<{ line: number, ns: string }>>} */
  const acks = new Map();
  /** @type {Map<string, Module>} */
  const modules = new Map();
  let scanned = 0;

  for (const [file, src] of files) {
    if (!file.startsWith('src/') || !/\.m?js$/.test(file) || (rules.skip || []).some((s) => file.startsWith(s))) continue;
    scanned++;
    const r = scanModule(file, src, rules);
    modules.set(file, r.module);
    accesses.push(...r.accesses);
    dynamic.push(...r.dynamic);
    enumerations.push(...r.containers);
    if (r.acks.length) acks.set(file, r.acks);
  }
  /** @type {import('./scan.mjs').SourceTree} */
  const tree = {
    files,
    module: (file) => {
      if (modules.has(file)) return /** @type {Module} */ (modules.get(file));
      const src = files.get(file);
      if (src == null) return null;
      const m = new Module(file, src, rules);
      modules.set(file, m);
      return m;
    },
  };
  for (const ex of rules.extract || []) accesses.push(...ex(tree));

  // resolve accesses
  /** @type {Map<Entry, Access[]>} */
  const byEntry = new Map(entries.map((e) => [e, []]));
  /** @type {Map<string, Access[]>} */
  const undeclared = new Map();
  for (const a of accesses) {
    if (!knownNs.has(a.ns)) {
      problems.push({ type: 'registry', ns: a.ns, kind: '?', key: showKey(a.key), message: `unknown namespace '${a.ns}' (${a.via})`, sites: [site(a)] });
      continue;
    }
    const e = index.find(a.ns, a.key);
    if (e) /** @type {Access[]} */ (byEntry.get(e)).push(a);
    else {
      const k = `${a.ns}\u0000${a.key}`;
      undeclared.set(k, [...(undeclared.get(k) || []), a]);
    }
  }
  for (const list of undeclared.values()) {
    const a = list[0];
    const near = index.nearMiss(a.ns, a.key);
    const hint = near ? ` (matches ${near.key} except for its allowed values)` : '';
    problems.push({ type: 'undeclared', ns: a.ns, kind: registry.NAMESPACES[a.ns]?.kind || '?', key: showKey(a.key), message: MESSAGES.undeclared + hint, sites: list.map(site) });
  }

  // screens that list a whole namespace (DisplayRule): each must still enumerate it
  /** @type {Map<string, import('./scan.mjs').DisplayRule>} */
  const displayed = new Map();
  for (const d of rules.displays || []) {
    const live = enumerations.filter((u) => u.ns === d.ns && d.sites.includes(u.file));
    if (live.length) displayed.set(d.ns, d);
    else if (d.sites.some((f) => files.has(f))) problems.push({ type: 'registry', ns: d.ns, kind: registry.NAMESPACES[d.ns]?.kind || '?', key: d.sites.join(' '), message: 'display rule: none of its sites enumerates the namespace any more (update tools/keys/rules.mjs)', sites: [] });
  }

  // per-entry production / consumption
  /** @type {Array<{ ns: string, kind: string, key: string, owner: string, meaning: string, reads: Site[], writes: Site[], readBy: string[], writtenBy: string[] }>} */
  const keys = [];
  for (const e of entries) {
    const list = /** @type {Access[]} */ (byEntry.get(e));
    const reads = list.filter((a) => a.mode === 'read').map(site);
    const writes = list.filter((a) => a.mode === 'write').map(site);
    keys.push({ ns: e.ns, kind: e.kind, key: e.key, owner: e.owner, meaning: e.meaning, reads, writes, readBy: e.readBy, writtenBy: e.writtenBy });
    /** @type {ProblemType | null} */
    let type = null;
    if (!list.length) type = 'stale';
    else if (!writes.length && !e.writtenBy.length) type = 'unproduced';
    else if (!reads.length && !e.readBy.length) type = 'unconsumed';
    // a written key that a listing screen shows under its raw name: label it, do not delete it
    const shown = type === 'unconsumed' ? displayed.get(e.ns) : undefined;
    if (shown) type = 'unlabelled';
    const message = shown ? `${MESSAGES.unlabelled} (${shown.sites.join(', ')}): add a label to ${shown.labels}` : /** @type {Record<string, string>} */ (MESSAGES)[type || 'stale'];
    if (type) problems.push({ type, ns: e.ns, kind: e.kind, key: e.key, message, sites: [...writes, ...reads] });
    checkRefs(e, problems, exists, files);
  }

  // computed keys must be reviewed: a rule in tools/keys/rules.mjs or `// @keys dynamic <ns> — why` on or above the line
  let acknowledged = 0;
  for (const d of dynamic) {
    const byRule = (rules.dynamic || []).some((r) => r.file === d.file && (r.fn === '*' || r.fn === d.fn) && r.ns === d.ns);
    const byComment = (acks.get(d.file) || []).some((k) => (k.line === d.line || k.line === d.line - 1) && (k.ns === d.ns || k.ns === '*'));
    if (byRule || byComment) {
      acknowledged++;
      continue;
    }
    problems.push({ type: 'dynamic', ns: d.ns, kind: registry.NAMESPACES[d.ns]?.kind || '?', key: d.expr, message: `${MESSAGES.dynamic} (${d.via} in ${d.fn})`, sites: [{ file: d.file, line: d.line, mode: d.mode, via: d.via }] });
  }
  for (const r of rules.dynamic || []) {
    const used = dynamic.some((d) => d.file === r.file && (r.fn === '*' || r.fn === d.fn) && r.ns === d.ns);
    if (!used && files.has(r.file)) problems.push({ type: 'registry', ns: r.ns, kind: registry.NAMESPACES[r.ns]?.kind || '?', key: `${r.file} ${r.fn}`, message: 'dynamic-site rule matches nothing (remove it from tools/keys/rules.mjs)', sites: [] });
  }

  problems.sort((a, b) => PROBLEM_TYPES.indexOf(a.type) - PROBLEM_TYPES.indexOf(b.type) || a.ns.localeCompare(b.ns) || a.key.localeCompare(b.key));
  return { problems, keys, entries, accesses, dynamic, enumerations, scanned, acknowledged };
}

/** @param {Access} a @returns {Site} */
const site = (a) => ({ file: a.file, line: a.line, mode: a.mode, via: a.via });

/**
 * Owners and readBy / writtenBy references must point at something that exists (a file, or a work package id), and
 * a file named as a consumer or producer must mention the key.
 * @param {Entry} e @param {Problem[]} problems @param {(path: string) => boolean} exists @param {Map<string, string>} files
 */
function checkRefs(e, problems, exists, files) {
  const bad = (/** @type {string} */ message) => problems.push({ type: 'registry', ns: e.ns, kind: e.kind, key: e.key, message, sites: [] });
  const isWp = (/** @type {string} */ t) => /^WP-[A-Z0-9-]+$/.test(t);
  const owner = refTarget(e.owner);
  if (!isWp(owner) && !exists(owner)) bad(`owner ${owner} does not exist`);
  // an exact key must appear quoted or as a property (`'stat'`, `.dayRecords`); a template by its longest literal part
  const needle = e.template ? e.key.split(/\$\{[^}]*\}/).reduce((a, b) => (b.length > a.length ? b : a), '') : e.key;
  const mentions = e.template ? (/** @type {string} */ t) => t.includes(needle) : (/** @type {string} */ t) => new RegExp(`[\`'".]${escapeRe(needle)}(?![\\w$])`).test(t);
  for (const [field, list] of /** @type {const} */ ([['readBy', e.readBy], ['writtenBy', e.writtenBy]])) {
    for (const ref of list) {
      const target = refTarget(ref);
      if (!/\s[—–-]{1,2}\s\S/.test(ref)) bad(`${field} '${ref}' needs a reason ('<path or WP id> — why')`);
      if (isWp(target)) {
        if (!exists(`docs/wp/${target}.md`)) bad(`${field} ${target}: no docs/wp/${target}.md`);
        continue;
      }
      if (!exists(target)) {
        bad(`${field} ${target} does not exist`);
        continue;
      }
      const text = files.get(target);
      if (text != null && needle && !mentions(text)) bad(`${field} ${target} does not mention '${needle}'`);
    }
  }
}

/**
 * Summary numbers for the report.
 * @param {ReturnType<typeof audit>} r
 */
export function summarize(r) {
  /** @type {Record<string, number>} */
  const byType = Object.fromEntries(PROBLEM_TYPES.map((t) => [t, 0]));
  for (const p of r.problems) byType[p.type]++;
  /** @type {Record<string, number>} */
  const byKind = {};
  /** @type {Record<string, number>} */
  const byNs = {};
  let templates = 0;
  for (const e of r.entries) {
    byKind[e.kind] = (byKind[e.kind] || 0) + 1;
    byNs[e.ns] = (byNs[e.ns] || 0) + 1;
    if (e.template) templates++;
  }
  return {
    problems: r.problems.length,
    byType,
    declared: { total: r.entries.length, templates, byKind, byNs },
    accesses: { total: r.accesses.length, reads: r.accesses.filter((a) => a.mode === 'read').length, writes: r.accesses.filter((a) => a.mode === 'write').length },
    dynamic: { total: r.dynamic.length, reviewed: r.acknowledged },
    enumerations: r.enumerations.length,
    filesScanned: r.scanned,
  };
}

export { showKey };
