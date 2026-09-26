// @ts-check
// The bug ledger (docs/bugs.jsonl) and the playtest session ledgers (docs/playtests/<phase>/sessions.jsonl) of
// docs/QUALITY.md §6 and docs/playtests/README.md: the format of every line, what may change against master, and
// the release criteria they count (no open S1 or S2, at most 20 open S3, the playtest sessions and their crashes).
import { approverProblem } from './git.mjs';

export const BUGS_FILE = 'docs/bugs.jsonl';
export const SEVERITIES = Object.freeze(['S1', 'S2', 'S3', 'S4']);
export const STATUSES = Object.freeze(['open', 'fixed', 'wontfix', 'duplicate']);
export const PERSONAS = Object.freeze(['first-timer', 'veteran', 'source-fan', 'casual']);
export const MAX_OPEN_S3 = 20;
/** The only URL parameters a playtest may use (docs/QUALITY.md §9). */
export const PLAYTEST_PARAMS = Object.freeze(['seed', 'devSpeed']);
/** Fields of a bug that may change in place once the line is on master; severity only with a history entry. */
const MUTABLE = ['status', 'fixedIn', 'links', 'notes', 'severity', 'severityHistory', 'approvedBy'];
const KNOWN = ['id', 'severity', 'status', 'title', 'area', 'rootCause', 'repro', 'foundBy', 'links', 'phase', 'opened', 'fixedIn', 'notes', 'approvedBy', 'severityHistory'];

/**
 * @typedef {{ from: string, to: string, reason: string, approvedBy: string, at: string }} SeverityChange
 * @typedef {{ id: string, severity: string, status: string, title: string, area: string, rootCause: string, repro: string, foundBy: string, links: string[], phase: string, opened: string, fixedIn?: string, notes?: string, approvedBy?: string, severityHistory?: SeverityChange[] }} Bug
 */

/**
 * Parses and checks the bug ledger.
 * @param {string} text
 * @param {{ agent?: string | null, roster?: import('./git.mjs').Roster | null }} [ctx]
 *   the branch's agent (who may not approve its own closures) and master's approver roster; without a roster only
 *   the approver's form is checked
 * @returns {{ bugs: Bug[], problems: string[] }}
 */
export function parseBugs(text, { agent = null, roster = null } = {}) {
  /** @type {Bug[]} */
  const bugs = [];
  /** @type {string[]} */
  const problems = [];
  const ids = new Set();
  text.split('\n').forEach((raw, i) => {
    if (!raw.trim()) return;
    const at = `${BUGS_FILE}:${i + 1}`;
    let b;
    try {
      b = JSON.parse(raw);
    } catch {
      return void problems.push(`${at}: not JSON`);
    }
    const bad = [];
    if (typeof b.id !== 'string' || !/^BUG-\d{4}$/.test(b.id)) bad.push("id 'BUG-<4 digits>'");
    else if (ids.has(b.id)) bad.push(`a unique id (${b.id} is used twice)`);
    else ids.add(b.id);
    if (!SEVERITIES.includes(b.severity)) bad.push('severity S1–S4');
    if (!STATUSES.includes(b.status)) bad.push(`status one of ${STATUSES.join(', ')}`);
    for (const k of ['title', 'area', 'rootCause', 'repro', 'foundBy']) if (typeof b[k] !== 'string' || !b[k].trim()) bad.push(`${k} text`);
    if (!Array.isArray(b.links) || !b.links.every((/** @type {unknown} */ l) => typeof l === 'string')) bad.push('links a list');
    if (typeof b.phase !== 'string' || !/^P\d+$/.test(b.phase)) bad.push('phase P<n>');
    if (typeof b.opened !== 'string' || Number.isNaN(Date.parse(b.opened))) bad.push('opened ISO date');
    if (b.status === 'fixed' && (typeof b.fixedIn !== 'string' || !/^[0-9a-f]{7,40}$/.test(b.fixedIn))) bad.push('fixedIn: the commit that fixed it');
    if (b.status === 'wontfix' && !(typeof b.notes === 'string' && b.notes.trim())) bad.push('notes: why it will not be fixed');
    if (b.status === 'duplicate' && !(Array.isArray(b.links) && b.links.some((/** @type {string} */ l) => /^BUG-\d{4}$/.test(l)))) bad.push('links: the bug it duplicates');
    if ((b.severity === 'S1' || b.severity === 'S2') && (b.status === 'wontfix' || b.status === 'duplicate')) {
      const why = approverProblem(b.approvedBy, agent, roster);
      if (why) bad.push(`approvedBy for closing an ${b.severity} as ${b.status}: ${why}`);
    }
    if (b.severityHistory !== undefined) {
      if (!Array.isArray(b.severityHistory)) bad.push('severityHistory a list');
      else {
        let prev = null;
        for (const h of b.severityHistory) {
          if (!SEVERITIES.includes(h?.from) || !SEVERITIES.includes(h?.to) || typeof h?.reason !== 'string' || !h.reason.trim() || Number.isNaN(Date.parse(h?.at))) bad.push('severityHistory entries { from, to, reason, approvedBy, at }');
          else if (prev && h.from !== prev) bad.push(`severityHistory to follow on (${prev} then ${h.from})`);
          const hw = h ? approverProblem(h.approvedBy, agent, roster) : null;
          if (hw) bad.push(`severityHistory approvedBy: ${hw}`);
          prev = h?.to;
        }
        if (prev && prev !== b.severity) bad.push(`severity ${b.severity} to be the last severityHistory 'to' (${prev})`);
      }
    }
    for (const k of Object.keys(b)) if (!KNOWN.includes(k)) bad.push(`no field '${k}' (fields: ${KNOWN.join(', ')})`);
    if (bad.length) problems.push(`${at}: needs ${bad.join('; ')}`);
    else bugs.push(b);
  });
  return { bugs, problems };
}

/**
 * What changed against master's ledger that may not: a removed id, a changed fixed field, a severity change without
 * a new severityHistory entry.
 * @param {Bug[]} before  master's bugs
 * @param {Bug[]} now
 * @returns {string[]}
 */
export function bugChanges(before, now) {
  /** @type {string[]} */
  const out = [];
  const byId = new Map(now.map((b) => [b.id, b]));
  for (const old of before) {
    const b = byId.get(old.id);
    if (!b) {
      out.push(`${old.id}: removed (ids are never removed; close it instead)`);
      continue;
    }
    for (const k of KNOWN) {
      if (MUTABLE.includes(k)) continue;
      if (JSON.stringify(/** @type {any} */ (old)[k]) !== JSON.stringify(/** @type {any} */ (b)[k])) out.push(`${old.id}: '${k}' changed in place (only ${MUTABLE.slice(0, 4).join(', ')} may)`);
    }
    const h0 = old.severityHistory || [];
    const h1 = b.severityHistory || [];
    if (JSON.stringify(h1.slice(0, h0.length)) !== JSON.stringify(h0)) out.push(`${old.id}: severityHistory rewritten (entries are only appended)`);
    if (old.severity !== b.severity && h1.length <= h0.length) out.push(`${old.id}: severity ${old.severity} -> ${b.severity} without a severityHistory entry (reason and approver)`);
  }
  return out;
}

/**
 * Open bugs by severity, and what they block at release.
 * @param {Bug[]} bugs
 */
export function openBySeverity(bugs) {
  /** @type {Record<string, number>} */
  const open = { S1: 0, S2: 0, S3: 0, S4: 0 };
  for (const b of bugs) if (b.status === 'open') open[b.severity]++;
  /** @type {string[]} */
  const blockers = [];
  if (open.S1) blockers.push(`${open.S1} open S1`);
  if (open.S2) blockers.push(`${open.S2} open S2`);
  if (open.S3 > MAX_OPEN_S3) blockers.push(`${open.S3} open S3 (at most ${MAX_OPEN_S3})`);
  return { open, blockers };
}

/**
 * @typedef {{ phase: string, persona: string, session: number, seed: number, devSpeed: number, commit: string, url: string, trace: string, character: string, difficulty: string, minutes: number, days: number, end: string, crashes: number, pageErrors: number, stalls: number, bugs: string[], report: string }} PlaytestSession
 */

/**
 * Parses and checks one phase's playtest session ledger.
 * @param {string} text
 * @param {string} file  its path, for messages
 * @param {(path: string) => boolean} exists
 * @returns {{ sessions: PlaytestSession[], problems: string[] }}
 */
export function parseSessions(text, file, exists) {
  /** @type {PlaytestSession[]} */
  const sessions = [];
  /** @type {string[]} */
  const problems = [];
  text.split('\n').forEach((raw, i) => {
    if (!raw.trim()) return;
    const at = `${file}:${i + 1}`;
    let s;
    try {
      s = JSON.parse(raw);
    } catch {
      return void problems.push(`${at}: not JSON`);
    }
    const bad = [];
    if (typeof s.phase !== 'string' || !/^P\d+$/.test(s.phase)) bad.push('phase P<n>');
    if (!PERSONAS.includes(s.persona)) bad.push(`persona one of ${PERSONAS.join(', ')}`);
    for (const k of ['session', 'seed', 'minutes', 'days', 'crashes', 'pageErrors', 'stalls']) if (!Number.isInteger(s[k]) || s[k] < 0) bad.push(`${k} a whole number`);
    if (!(Number.isInteger(s.devSpeed) && s.devSpeed >= 1 && s.devSpeed <= 8)) bad.push('devSpeed 1–8');
    if (typeof s.commit !== 'string' || !/^[0-9a-f]{7,40}$/.test(s.commit)) bad.push('commit a hex hash');
    let url = null;
    try {
      url = new URL(String(s.url), 'http://x');
    } catch {}
    if (!url || typeof s.url !== 'string') bad.push('url: the page the harness opened');
    else {
      const extra = [...url.searchParams.keys()].filter((k) => !PLAYTEST_PARAMS.includes(k));
      if (extra.length) bad.push(`url with only ?seed= and ?devSpeed= (has ${extra.join(', ')})`);
      if (url.searchParams.get('seed') !== String(s.seed)) bad.push(`url ?seed=${s.seed}`);
      if (url.searchParams.get('devSpeed') !== String(s.devSpeed) && !(s.devSpeed === 1 && !url.searchParams.has('devSpeed'))) bad.push(`url ?devSpeed=${s.devSpeed}`);
    }
    if (typeof s.trace !== 'string' || !exists(s.trace)) bad.push('trace: the harness trace, committed');
    if (!['dead', 'ending', 'stopped', 'crash'].includes(s.end)) bad.push('end dead, ending, stopped or crash');
    if (Number.isInteger(s.pageErrors) && Number.isInteger(s.stalls) && s.crashes !== s.pageErrors + s.stalls + (s.end === 'crash' && !s.pageErrors && !s.stalls ? 1 : 0)) bad.push('crashes = page errors + 5 s stalls (+1 for a crash neither shows)');
    if (s.end === 'crash' && !(s.crashes > 0)) bad.push('crashes ≥ 1 when the session ended in a crash');
    if (!Array.isArray(s.bugs) || !s.bugs.every((/** @type {unknown} */ b) => typeof b === 'string' && /^BUG-\d{4}$/.test(b))) bad.push('bugs a list of BUG ids');
    if (typeof s.report !== 'string' || !exists(s.report)) bad.push('report: the Markdown report, committed');
    if (bad.length) problems.push(`${at}: needs ${bad.join('; ')}`);
    else sessions.push(s);
  });
  return { sessions, problems };
}

/**
 * The playtest release criteria: at least 20 sessions, at least 5 per persona, no crash.
 * @param {PlaytestSession[]} sessions
 */
export function playtestBlockers(sessions) {
  /** @type {string[]} */
  const out = [];
  if (sessions.length < 20) out.push(`${sessions.length} playtest sessions (at least 20)`);
  for (const p of PERSONAS) {
    const n = sessions.filter((s) => s.persona === p).length;
    if (n < 5) out.push(`${n} ${p} sessions (at least 5)`);
  }
  const crashes = sessions.reduce((a, s) => a + s.crashes, 0);
  if (crashes) out.push(`${crashes} playtest crash(es) (zero allowed)`);
  return out;
}
