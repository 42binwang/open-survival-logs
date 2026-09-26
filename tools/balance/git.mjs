// @ts-check
// What the quality ledgers are compared with: the copy of a file at the merge base with master (a branch may only
// append to an append-only ledger), and who the branch's agent is (an approval must come from someone else).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** @param {string} root @param {string[]} args */
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });

/**
 * The commit the branch left master at (on master itself, master). Throws when there is no master to compare with:
 * an append-only ledger cannot be checked without it.
 * @param {string} root
 * @param {string} [ref]
 */
export function baseCommit(root, ref = 'master') {
  try {
    return git(root, ['merge-base', 'HEAD', ref]).trim();
  } catch {
    throw new Error(`cannot find '${ref}' to compare the ledgers with (git merge-base HEAD ${ref} failed)`);
  }
}

/**
 * A file's text at a commit, or null when it did not exist there.
 * @param {string} root
 * @param {string} commit
 * @param {string} rel
 */
export function fileAt(root, commit, rel) {
  try {
    return git(root, ['show', `${commit}:${rel}`]);
  } catch {
    return null;
  }
}

/**
 * The agent id docs/wp/STATUS.md lists for a branch, or null.
 * @param {string} root
 * @param {string} branch
 */
export function agentOf(root, branch) {
  const file = join(root, 'docs/wp/STATUS.md');
  if (!existsSync(file)) return null;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.includes(branch)) return cells.find((c) => /^[0-9a-f]{8}$/.test(c)) || null;
  }
  return null;
}

/** @param {string} root @returns {string | null} */
export function branchOf(root) {
  try {
    return git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  } catch {
    return null;
  }
}

/**
 * @typedef {object} Roster  who may approve, from master's docs/wp/STATUS.md
 * @property {string[]} reviewers  the ids under the `**Reviewers:**` bullet of its `## Reviewers` section
 * @property {string[]} builders  every other agent id it lists (package rows, builders, the integrator)
 * @property {string} [problem]  why the roster could not be read (every approval then fails)
 */

/**
 * The approvers, from the `## Reviewers` registry of docs/wp/STATUS.md **as master has it**: a branch cannot add
 * itself. The ids under its `**Reviewers:**` bullet approve; those under `**Builders …:**` and `**Integrator:**` never
 * do, nor does any agent id the package tables list. (A table inside the section, `| <id> | reviewer |`, works too.)
 * When master's copy cannot be read (no `master` ref: a detached or shallow clone) the roster says so and every
 * approval fails; the working copy is never read instead.
 * @param {string} root
 * @param {string} [ref]
 * @returns {Roster}
 */
export function readRoster(root, ref = 'master') {
  const text = fileAt(root, ref, 'docs/wp/STATUS.md');
  if (text == null) return { reviewers: [], builders: [], problem: `the approver roster is read from ${ref}:docs/wp/STATUS.md, which this checkout cannot read (no '${ref}' ref, or a shallow clone)` };
  return parseRoster(text);
}

/**
 * @param {string} text  a docs/wp/STATUS.md
 * @returns {Roster}
 */
export function parseRoster(text) {
  const reviewers = new Set();
  const builders = new Set();
  let inReviewers = false;
  /** @type {'reviewer' | 'builder' | null} */
  let mode = null;
  for (const line of text.split('\n')) {
    if (/^##\s/.test(line)) {
      inReviewers = /^##\s+Reviewers\b/i.test(line);
      mode = null;
    }
    const ids = [...line.matchAll(/(?<![0-9a-z])([0-9a-f]{8})(?![0-9a-z])/g)].map((m) => m[1]);
    if (!inReviewers) {
      if (line.startsWith('|')) for (const id of ids) builders.add(id);
      continue;
    }
    if (/^\s*-\s+\*\*Reviewers?\b/i.test(line)) mode = 'reviewer';
    else if (/^\s*-\s+\*\*(Builders?|Integrator)\b/i.test(line)) mode = 'builder';
    else if (/^\s*-\s+\*\*/.test(line)) mode = null;
    if (line.startsWith('|')) {
      for (const id of ids) (!/builder|integrator/i.test(line) && /review/i.test(line) ? reviewers : builders).add(id);
    } else if (mode) for (const id of ids) (mode === 'reviewer' ? reviewers : builders).add(id);
  }
  for (const id of builders) reviewers.delete(id);
  return { reviewers: [...reviewers], builders: [...builders] };
}

/**
 * Whether `by` may approve: only `review:<id>` of a reviewer master's roster lists (never a builder, never the
 * branch's own agent). `integrator` is no approver: every agent commits as the same git user, so nothing proves who
 * wrote a line; the integrator records the reviewer's written verdict as `review:<id>`. Without a roster only the
 * form and the branch agent are checked (a format check of one line).
 * @param {string} by
 * @param {string | null} agent
 * @param {Roster | null} [roster]
 * @returns {string | null} why not, or null
 */
export function approverProblem(by, agent, roster = null) {
  if (by === 'integrator') return "'integrator' is no approver: record the reviewer's verdict as review:<id> (docs/wp/STATUS.md Reviewers)";
  const m = /^review:([0-9a-f]{8})$/.exec(by || '');
  if (!m) return `approver '${by}' must be 'review:<8-hex id>' of a listed reviewer`;
  if (agent && m[1] === agent) return `approver ${by} is the branch's own agent`;
  if (!roster) return null;
  if (roster.problem) return roster.problem;
  if (roster.builders.includes(m[1])) return `approver ${by} built a work package (docs/wp/STATUS.md)`;
  if (!roster.reviewers.includes(m[1])) return `approver ${by} is not a reviewer listed in the Reviewers section of master's docs/wp/STATUS.md`;
  return null;
}

/**
 * Checks that `now` extends `before` byte for byte (an append-only ledger), returning the appended lines.
 * @param {string | null} before
 * @param {string} now
 * @param {string} rel
 * @returns {{ added: string[], problems: string[] }}
 */
export function appended(before, now, rel) {
  if (before == null || before === '') return { added: now.split('\n').filter((l) => l.trim()), problems: [] };
  if (!now.startsWith(before)) return { added: [], problems: [`${rel} is append-only: master's lines were changed or removed`] };
  return { added: now.slice(before.length).split('\n').filter((l) => l.trim()), problems: [] };
}

/**
 * The phase a gate run judges: `GATE_PHASE` (P<n>), which `gate --signoff P<n>` sets for every check it runs (and
 * `--final`, P5), or null when the run names none (the tools then take docs/wp/STATUS.md's phase).
 * @param {Record<string, string | undefined>} [env]
 * @returns {string | null}
 */
export function gatePhase(env = process.env) {
  const p = env.GATE_PHASE;
  return typeof p === 'string' && /^P\d+$/.test(p) ? p : null;
}
