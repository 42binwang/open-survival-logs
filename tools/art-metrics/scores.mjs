// @ts-check
// The rubric scores ledger (docs/quality/scores.jsonl, docs/QUALITY.md §5): the format of every line, the evidence
// each axis needs (committed), one line per axis or pair per review, reviewers who built nothing, regressions (an
// axis or pair blocks while its latest score is below its earlier best), and the thresholds of a phase signoff.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SCORES_FILE = 'docs/quality/scores.jsonl';
export const PAIRS_FILE = 'docs/quality/side-by-side.json';

/** The 12 rubric axes of docs/QUALITY.md §1, in order. */
export const AXES = Object.freeze(['match', 'lighting', 'materials', 'models', 'characters', 'vfx', 'ui', 'feel', 'onboarding', 'audio', 'writing', 'stability']);
/** Phases whose signoff requires every axis at the threshold (and the pairs whose `from` has come). */
export const RUBRIC_PHASES = Object.freeze(['P1', 'P3', 'P4', 'P5']);
export const MIN_SCORE = 4;

/**
 * The evidence a score of each axis must attach (docs/QUALITY.md §1), as patterns every one of which some evidence
 * path must match. Side-by-side lines need their sheet.
 * @type {Readonly<Record<string, readonly RegExp[]>>}
 */
export const EVIDENCE = Object.freeze({
  match: [/side-by-side\//, /framing\.(md|json)$/, /art-metrics\.json$/],
  lighting: [/rig-(day|dawn|dusk|night|blackout|storm|coldwave)\.png$/, /greycard\.(md|json)$/, /dusk-night\.(webm|mp4)$/, /lamps\.(md|json)$/],
  materials: [/art-metrics\.json$/, /-close\.png$/, /-wide\.png$/, /contact-sheet\.(png|jpg)$/],
  models: [/coverage\.(md|json)$/, /art-metrics\.json$/, /turntable-/, /floor-/],
  characters: [/actions\.(md|json)$/, /\.(webm|mp4)$/, /art-metrics\.json$/],
  vfx: [/\.(webm|mp4)$/, /budgets\.json$/],
  ui: [/shots\//, /overflow\.(md|json)$/, /contrast\.(md|json)$/],
  feel: [/feel\.(json|md)$/, /\.(webm|mp4)$/, /placeholders\.(json|md)$/],
  onboarding: [/docs\/playtests\/P\d+\//],
  audio: [/loudness\.(json|md)$/, /\.(wav|ogg|webm|mp4)$/, /listening\.md$/],
  writing: [/strings\.(json|md)$/, /glossary\.(md|json)$/, /sample\.(md|json)$/],
  stability: [/budgets\.json$/, /docs\/balance\/P\d+\.(md|json)$/, /e2e\.(json|md)$/],
  'side-by-side': [/side-by-side\/[^/]+\.png$/],
});

/**
 * @typedef {{ review: string, phase: string, axis: string, pair?: string, score: number, reviewer: string, fresh: boolean, date: string, commit: string, evidence: string[], notes: string }} ScoreLine
 * @typedef {{ id: string, from: string }} Pair
 */

/** @param {string} p */
const phaseNo = (p) => Number(p.slice(1));

/**
 * Parses and checks the ledger.
 * @param {string} text
 * @param {{ root: string, pairs: string[], committed?: (path: string) => boolean, builders?: string[] }} ctx  the
 *   checkout (for evidence), the side-by-side pair ids, whether a path is committed, and the agent ids that built work
 *   packages (a fresh reviewer is none of them)
 * @returns {{ lines: ScoreLine[], problems: string[] }}
 */
export function parseScores(text, { root, pairs, committed = () => true, builders = [] }) {
  /** @type {ScoreLine[]} */
  const lines = [];
  /** @type {string[]} */
  const problems = [];
  const seen = new Set();
  text.split('\n').forEach((raw, i) => {
    if (!raw.trim()) return;
    const at = `${SCORES_FILE}:${i + 1}`;
    let s;
    try {
      s = JSON.parse(raw);
    } catch {
      return void problems.push(`${at}: not JSON`);
    }
    const bad = [];
    if (typeof s.review !== 'string' || !/^P[1-9]-r\d+$/.test(s.review)) bad.push("review 'P<n>-r<k>'");
    if (typeof s.phase !== 'string' || !/^P[1-9]$/.test(s.phase) || (typeof s.review === 'string' && !s.review.startsWith(`${s.phase}-`))) bad.push('phase P1 … P9 matching the review');
    if (!AXES.includes(s.axis) && s.axis !== 'side-by-side') bad.push(`axis one of ${AXES.join(', ')}, side-by-side`);
    if (s.axis === 'side-by-side' && !pairs.includes(s.pair)) bad.push(`pair one of ${PAIRS_FILE}`);
    if (s.axis !== 'side-by-side' && s.pair !== undefined) bad.push('pair only on side-by-side lines');
    if (!Number.isInteger(s.score) || s.score < 1 || s.score > 5) bad.push('score a whole number 1–5');
    if (typeof s.reviewer !== 'string' || !/^(agent|human):\S+/.test(s.reviewer)) bad.push("reviewer 'agent:<id>' or 'human:<name>'");
    else if (s.reviewer.startsWith('agent:') && builders.includes(s.reviewer.slice(6))) bad.push(`a fresh reviewer: ${s.reviewer} built a work package (docs/wp/STATUS.md)`);
    if (s.fresh !== true) bad.push('fresh true: only a reviewer who built nothing of the phase scores it');
    if (typeof s.date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(s.date) || Number.isNaN(Date.parse(s.date))) bad.push('date ISO');
    if (typeof s.commit !== 'string' || !/^[0-9a-f]{7,40}$/.test(s.commit)) bad.push('commit a hex hash');
    if (!Array.isArray(s.evidence) || !s.evidence.length || !s.evidence.every((/** @type {unknown} */ p) => typeof p === 'string' && p)) bad.push('evidence a list of repo paths');
    else {
      for (const p of s.evidence) if (!existsSync(join(root, p)) || !committed(p)) bad.push(`evidence ${p} committed`);
      for (const re of EVIDENCE[s.axis] || []) if (!s.evidence.some((/** @type {string} */ p) => re.test(p))) bad.push(`evidence matching ${re} (docs/QUALITY.md §1, ${s.axis})`);
    }
    if (typeof s.notes !== 'string' || !s.notes.trim()) bad.push('notes on the descriptor points');
    const key = `${s.review}|${s.axis}|${s.pair ?? ''}`;
    if (seen.has(key)) bad.push(`one line per axis or pair per review (${s.axis}${s.pair ? ` ${s.pair}` : ''} twice in ${s.review})`);
    seen.add(key);
    if (bad.length) problems.push(`${at}: needs ${bad.join('; ')}`);
    else lines.push(s);
  });
  return { lines, problems };
}

/** @param {ScoreLine} s */
const keyOf = (s) => (s.axis === 'side-by-side' ? `side-by-side:${s.pair}` : s.axis);
/** @param {string} review 'P3-r2' -> [3, 2] */
const order = (review) => review.slice(1).split('-r').map(Number);
/** @param {ScoreLine} a @param {ScoreLine} b */
const byReview = (a, b) => {
  const [pa, ra] = order(a.review);
  const [pb, rb] = order(b.review);
  return pa - pb || ra - rb;
};

/**
 * Scores never decrease: an axis or pair blocks while its latest score is below the best it had before. A later
 * review that lifts it back clears the block.
 * @param {ScoreLine[]} lines
 * @returns {string[]}
 */
export function decreases(lines) {
  /** @type {Map<string, ScoreLine[]>} */
  const byKey = new Map();
  for (const s of lines) byKey.set(keyOf(s), [...(byKey.get(keyOf(s)) || []), s]);
  /** @type {string[]} */
  const out = [];
  for (const [key, list] of byKey) {
    list.sort(byReview);
    const last = list[list.length - 1];
    const before = list.slice(0, -1);
    const best = before.reduce((a, b) => (b.score > a.score ? b : a), before[0]);
    if (best && last.score < best.score) out.push(`${key}: ${last.review} scores ${last.score}, below ${best.score} in ${best.review} (scores never decrease; a later review must lift it)`);
  }
  return out;
}

/**
 * What blocks a phase signoff: every axis, and every side-by-side pair whose `from` has come, needs a score in the
 * phase at least MIN_SCORE (its latest in the phase), and nothing may be below its earlier best.
 * @param {ScoreLine[]} lines
 * @param {string} phase
 * @param {Pair[]} pairs
 * @returns {string[]}
 */
export function signoffProblems(lines, phase, pairs) {
  if (!RUBRIC_PHASES.includes(phase)) return [];
  const inPhase = lines.filter((s) => s.phase === phase);
  const out = [...decreases(lines.filter((s) => phaseNo(s.phase) <= phaseNo(phase)))];
  const due = pairs.filter((p) => phaseNo(p.from) <= phaseNo(phase)).map((p) => `side-by-side:${p.id}`);
  for (const key of [...AXES, ...due]) {
    const mine = inPhase.filter((s) => keyOf(s) === key).sort(byReview);
    const last = mine[mine.length - 1];
    if (!last) out.push(`${key}: no ${phase} score`);
    else if (last.score < MIN_SCORE) out.push(`${key}: ${last.score} in ${last.review}, below ${MIN_SCORE}`);
  }
  return out;
}

/** What a pair can be judged on, and the measured descriptor each judge compares with. */
export const JUDGES = Object.freeze({ camera: 'camera', value: 'value', palette: 'palette', light: 'light', relativeAlbedo: 'palette' });
/** The tolerances docs/QUALITY.md §2 fixes; the pairs file must state exactly these. */
export const PAIR_TOLERANCES = Object.freeze({ vFovDeg: 1, pitchDeg: 1, yawDeg: 2, valueCodes: 5, paletteDeltaE2000: 8, lightDeg: 15, relativeAlbedoL: 5 });
export const PAIR_PHASES = Object.freeze(['P1', 'P3']);

/**
 * Checks docs/quality/side-by-side.json: each pair due from P1 or P3, a source frame that exists, a shot with steps
 * and a numeric look-at point, a judge list whose measured descriptors are present, and the descriptors split into
 * `requires` (non-empty) and `mayShow`; unpaired targets say why; the tolerances are the fixed ones.
 * @param {any} doc
 * @param {(path: string) => boolean} exists
 * @returns {string[]}
 */
export function pairProblems(doc, exists) {
  const out = [];
  const num = (/** @type {unknown} */ v) => typeof v === 'number' && Number.isFinite(v);
  for (const [k, v] of Object.entries(PAIR_TOLERANCES)) if (doc?.tolerances?.[k] !== v) out.push(`${PAIRS_FILE}: tolerances.${k} must be ${v} (docs/QUALITY.md §2)`);
  const ids = new Set();
  for (const p of doc?.pairs || []) {
    const at = `${PAIRS_FILE}: ${p?.id ?? '?'}`;
    if (typeof p?.id !== 'string' || ids.has(p.id)) out.push(`${at}: a unique id`);
    ids.add(p?.id);
    if (!PAIR_PHASES.includes(p?.from)) out.push(`${at}: from P1 or P3`);
    if (typeof p?.source !== 'string' || !exists(p.source)) out.push(`${at}: a source frame that exists`);
    const sh = p?.shot;
    if (!sh || !Array.isArray(sh.steps) || !sh.steps.length || typeof sh.url !== 'string') out.push(`${at}: a shot with a url and steps`);
    if (!Array.isArray(sh?.camera?.lookAt) || sh.camera.lookAt.length !== 2 || !sh.camera.lookAt.every(num)) out.push(`${at}: shot.camera.lookAt two numbers (sim tiles)`);
    if (!(typeof sh?.camera?.lookZoom === 'number' && sh.camera.lookZoom >= 0 && sh.camera.lookZoom <= 1)) out.push(`${at}: shot.camera.lookZoom, the zoom amount of src/contracts/look.js (0 … 1)`);
    if (!p?.conditions || typeof p.conditions !== 'object' || !Number.isInteger(p.conditions.day) || typeof p.conditions.weather !== 'string' || typeof p.conditions.scene !== 'string') out.push(`${at}: conditions with the day, weather and scene the shot must reach`);
    if (p?.conditions?.phase !== undefined && !['pre', 'post'].includes(p.conditions.phase)) out.push(`${at}: conditions.phase 'pre' (before the outbreak) or 'post', when given`);
    if (!Array.isArray(p?.judge) || !p.judge.length) out.push(`${at}: a judge list`);
    for (const j of p?.judge || []) {
      const need = /** @type {Record<string, string>} */ (JUDGES)[j];
      if (!need) out.push(`${at}: judge '${j}' is not one of ${Object.keys(JUDGES).join(', ')}`);
      else if (!p?.measured?.[need]) out.push(`${at}: judge '${j}' needs measured.${need}`);
    }
    const m = p?.measured || {};
    if (p?.judge?.includes('camera') && !['vFovDeg', 'pitchDeg', 'yawDeg'].every((k) => num(m.camera?.[k]))) out.push(`${at}: measured.camera vFovDeg, pitchDeg, yawDeg`);
    if (p?.judge?.includes('value') && !num(m.value?.median)) out.push(`${at}: measured.value.median`);
    if ((p?.judge?.includes('palette') || p?.judge?.includes('relativeAlbedo')) && !(Array.isArray(m.palette?.lab) && m.palette.lab.length === 3)) out.push(`${at}: measured.palette.lab, the 3 dominant colours`);
    if (p?.judge?.includes('light') && !(num(m.light?.az) && num(m.light?.el))) out.push(`${at}: measured.light az and el`);
    if (!Array.isArray(p?.descriptors?.requires) || !p.descriptors.requires.length || !Array.isArray(p?.descriptors?.mayShow)) out.push(`${at}: descriptors.requires (non-empty) and descriptors.mayShow`);
    if (p?.nearest && !(typeof p.why === 'string' && p.why.length > 10)) out.push(`${at}: a nearest pair says why`);
  }
  for (const u of doc?.unpaired || []) {
    if (typeof u?.target !== 'string' || !(typeof u?.why === 'string' && u.why.length > 10)) out.push(`${PAIRS_FILE}: unpaired ${u?.target ?? '?'} says why`);
    const ev = Array.isArray(u?.evidence) ? u.evidence : [];
    if (!ev.some((/** @type {string} */ e) => /greycard\.(md|json)$/.test(e)) || !ev.some((/** @type {string} */ e) => /-day\.png$/.test(e)) || !ev.some((/** @type {string} */ e) => /-night\.png$/.test(e))) out.push(`${PAIRS_FILE}: unpaired ${u?.target ?? '?'} names its evidence: a grey-card reading and a day and a night capture`);
  }
  return out;
}

/**
 * The pairs of docs/quality/side-by-side.json with the phase each is due.
 * @param {string} root
 * @returns {Pair[]}
 */
export function readPairs(root) {
  return JSON.parse(readFileSync(join(root, PAIRS_FILE), 'utf8')).pairs.map((/** @type {Pair} */ p) => ({ id: p.id, from: p.from }));
}

/**
 * Reads the ledger and the pairs of a checkout.
 * @param {string} root
 * @param {{ committed?: (path: string) => boolean, builders?: string[] }} [opts]
 */
export function readScores(root, opts = {}) {
  const pairs = readPairs(root);
  const pairIssues = pairProblems(JSON.parse(readFileSync(join(root, PAIRS_FILE), 'utf8')), (p) => existsSync(join(root, p)));
  const file = join(root, SCORES_FILE);
  const text = existsSync(file) ? readFileSync(file, 'utf8') : null;
  if (text == null) return { pairs, lines: [], problems: [...pairIssues, `${SCORES_FILE} is missing`] };
  const r = parseScores(text, { root, pairs: pairs.map((p) => p.id), ...opts });
  return { pairs, lines: r.lines, problems: [...pairIssues, ...r.problems] };
}
