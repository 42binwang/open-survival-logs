// @ts-check
// Visual baselines and their change log. Every baseline (tests/visual/baselines/<shot>.png) enters through
// `--approve <shot> --reason … --by review:<id>`, which appends one line to tests/visual/baselines/log.jsonl:
// the shot, the SHA-256 of the new file and of the one it replaces, the SSIM between them, the reason, who approved
// it, the commit and the capture environment. A baseline whose bytes differ from the last logged SHA-256 was changed
// outside --approve, and fails. Against master (the merge base), the branch's log must extend master's byte for byte,
// every line it adds must name an approver other than the branch's agent (`--sign --by` fills in lines the branch
// wrote before review), and every shot id master lists must still be listed.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { agentOf, appended, approverProblem, baseCommit, branchOf, fileAt, readRoster } from '../balance/git.mjs';

export const SHOTS_FILE = 'tests/visual/shots.json';
export const BASELINE_DIR = 'tests/visual/baselines';
export const LOG_FILE = 'tests/visual/baselines/log.jsonl';

/**
 * @typedef {object} LogEntry
 * @property {string} shot
 * @property {string} sha256
 * @property {string | null} previous  SHA-256 of the baseline it replaced
 * @property {number | null} ssimToPrevious
 * @property {string} reason
 * @property {string | null} [approvedBy]  'review:<agent id>' of a reviewer master lists, never the branch's agent
 * @property {string} at  ISO time
 * @property {string} commit
 * @property {Record<string, string>} env  browser, platform, arch, node
 */

/** @param {Uint8Array} bytes */
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** @param {string} root @param {string} shot */
export const baselinePath = (root, shot) => join(root, BASELINE_DIR, `${shot}.png`);

/**
 * @param {string} root
 * @returns {{ entries: LogEntry[], problems: string[] }}
 */
export function readLog(root) {
  const file = join(root, LOG_FILE);
  if (!existsSync(file)) return { entries: [], problems: [] };
  /** @type {LogEntry[]} */
  const entries = [];
  /** @type {string[]} */
  const problems = [];
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (!line.trim()) return;
      try {
        const e = JSON.parse(line);
        if (typeof e.shot !== 'string' || !/^[0-9a-f]{64}$/.test(e.sha256) || typeof e.reason !== 'string' || !e.reason.trim()) throw new Error('needs shot, sha256 and reason');
        entries.push(e);
      } catch (err) {
        problems.push(`${LOG_FILE}:${i + 1}: ${/** @type {Error} */ (err).message}`);
      }
    });
  return { entries, problems };
}

/**
 * The baseline of each shot as the log last recorded it.
 * @param {LogEntry[]} entries
 */
export function latest(entries) {
  /** @type {Map<string, LogEntry>} */
  const m = new Map();
  for (const e of entries) m.set(e.shot, e);
  return m;
}

/**
 * Why a shot cannot be compared: no baseline, or a baseline the log does not account for.
 * @param {string} root
 * @param {string} shot
 * @param {Map<string, LogEntry>} last
 * @returns {string | null}
 */
export function baselineProblem(root, shot, last) {
  const file = baselinePath(root, shot);
  if (!existsSync(file)) return `${shot}: no baseline (approve one: node tools/visual/run.mjs --approve ${shot} --reason "…")`;
  const entry = last.get(shot);
  const hash = sha256(readFileSync(file));
  if (!entry) return `${shot}: ${BASELINE_DIR}/${shot}.png has no entry in ${LOG_FILE}; baselines change only through --approve`;
  if (entry.sha256 !== hash) return `${shot}: ${BASELINE_DIR}/${shot}.png (sha256 ${hash.slice(0, 12)}) is not the file the log approved (${entry.sha256.slice(0, 12)}); baselines change only through --approve`;
  return null;
}

/**
 * Writes a baseline and logs the change.
 * @param {string} root
 * @param {{ shot: string, png: Uint8Array, reason: string, commit: string, env: Record<string, string>, ssimToPrevious: number | null, approvedBy?: string | null }} change
 * @returns {LogEntry}
 */
export function approve(root, { shot, png, reason, commit, env, ssimToPrevious, approvedBy = null }) {
  const file = baselinePath(root, shot);
  const previous = existsSync(file) ? sha256(readFileSync(file)) : null;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, png);
  /** @type {LogEntry} */
  const entry = { shot, sha256: sha256(png), previous, ssimToPrevious, reason, approvedBy, at: new Date().toISOString(), commit, env };
  appendFileSync(join(root, LOG_FILE), `${JSON.stringify(entry)}\n`);
  return entry;
}

/**
 * The branch's agent (docs/wp/STATUS.md), for the approver rule; null on master or an unlisted branch.
 * @param {string} root
 */
export function branchAgent(root) {
  const b = branchOf(root);
  return b ? agentOf(root, b) : null;
}

/**
 * The log and shot list against master: append-only, an approver on every added line, master's shots kept.
 * @param {string} root
 * @returns {string[]}
 */
export function auditAgainstMaster(root) {
  let base;
  try {
    base = baseCommit(root);
  } catch (err) {
    return [`${LOG_FILE}: ${/** @type {Error} */ (err).message}`];
  }
  const agent = branchAgent(root);
  const problems = [];
  const now = existsSync(join(root, LOG_FILE)) ? readFileSync(join(root, LOG_FILE), 'utf8') : '';
  const { added, problems: ap } = appended(fileAt(root, base, LOG_FILE), now, LOG_FILE);
  problems.push(...ap);
  for (const line of added) {
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    const why = e.approvedBy ? approverProblem(e.approvedBy, agent, readRoster(root)) : `no approver (a reviewer signs it: node tools/visual/run.mjs --sign --by review:<id>)`;
    if (why) problems.push(`${LOG_FILE}: the ${e.shot} baseline of ${String(e.at).slice(0, 10)}: ${why}`);
  }
  const was = fileAt(root, base, SHOTS_FILE);
  if (was) {
    let before = [];
    let after = [];
    try {
      before = JSON.parse(was).shots.map((/** @type {{ id: string }} */ s) => s.id);
      after = JSON.parse(readFileSync(join(root, SHOTS_FILE), 'utf8')).shots.map((/** @type {{ id: string }} */ s) => s.id);
    } catch {}
    const gone = before.filter((/** @type {string} */ id) => !after.includes(id));
    if (gone.length) problems.push(`${SHOTS_FILE}: master's shot(s) ${gone.join(', ')} were removed; a shot id, once on master, stays`);
  }
  return problems;
}

/**
 * Signs the log lines the branch added without an approver (lines master has are never touched).
 * @param {string} root
 * @param {string} by
 * @returns {{ signed: number, problems: string[] }}
 */
export function signAdded(root, by) {
  const why = approverProblem(by, branchAgent(root), readRoster(root));
  if (why) return { signed: 0, problems: [why] };
  const file = join(root, LOG_FILE);
  const now = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const before = fileAt(root, baseCommit(root), LOG_FILE) || '';
  if (!now.startsWith(before)) return { signed: 0, problems: [`${LOG_FILE} does not extend master's; nothing is signed`] };
  let signed = 0;
  const tail = now
    .slice(before.length)
    .split('\n')
    .map((line) => {
      if (!line.trim()) return line;
      const e = JSON.parse(line);
      if (e.approvedBy) return line;
      signed++;
      return JSON.stringify({ ...e, approvedBy: by });
    })
    .join('\n');
  writeFileSync(file, before + tail);
  return { signed, problems: [] };
}
