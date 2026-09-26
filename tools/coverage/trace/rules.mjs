// @ts-check
// The rules that turn what a traced test run saw into evidence, shared by the tracer (register.mjs), the fixture
// drivers and the self-check (selfcheck.mjs), so the self-check runs the same rules on its evidence.
import { ACHIEVEMENT_CONFIG } from '../../../src/data/gen/achievements.js';

/**
 * The furniture function an action ran, as the sim names it on the action (actionDone.funcKey), or null.
 * @param {any} action
 * @returns {number | null}
 */
export const funcOf = (action) => (typeof action?.funcKey === 'number' ? action.funcKey : null);

/**
 * What an award by game code earns: 'achievement' (credit) only on a state the test ticked, where no test code wrote
 * a field group the achievement's condition reads between game calls ('tainted'), and which did not already meet it
 * when the test first ticked it ('baseline'); on a state the test never ticked it is 'undriven'.
 * @param {{ ticked: boolean, tainted: boolean, metBefore: boolean }} evidence
 * @returns {'achievement' | 'undriven' | 'tainted' | 'baseline'}
 */
export function awardKind({ ticked, tainted, metBefore }) {
  if (!ticked) return 'undriven';
  if (tainted) return 'tainted';
  if (metBefore) return 'baseline';
  return 'achievement';
}

/**
 * The field groups of a run state that achievement conditions (src/meta/achievements.js) read, each as the fields
 * that make it up. A history of saved runs is one group, 'history' (lifetime counters and records).
 * @type {Record<string, (s: any) => any>}
 */
export const STATE_GROUPS = {
  tags: (s) => s.story?.tags,
  flags: (s) => s.story?.flags,
  checks: (s) => s.story?.checks,
  route: (s) => s.story?.route,
  clues: (s) => s.story?.clues,
  counters: (s) => s.progress?.counters,
  tallies: (s) => [s.progress?.kills, s.progress?.crisesSurvived, s.progress?.hordesSurvived],
  taboo: (s) => s.progress?.taboo,
  endings: (s) => [s.run?.ending, s.story?.ending, s.progress?.ending],
  endless: (s) => [s.meta?.endlessState, s.meta?.endlessStartDay, s.run?.endlessStartDay],
  mode: (s) => [s.meta?.mode, s.meta?.character],
  stats: (s) => s.player?.stats,
  maxes: (s) => [s.player?.max, s.player?.effects, s.progress?.maxOver150],
  clock: (s) => s.clock,
  phase: (s) => s.phase,
  furniture: (s) => s.furniture,
  inventories: (s) => s.inventories,
  home: (s) => [s.home, s.floorBoxes],
  pre: (s) => s.pre,
  snap: (s) => s.progress?.snap,
  prof: (s) => s.progress?.prof,
  power: (s) => s.power,
  crises: (s) => s.crises,
  loop: (s) => s.loop,
  codex: (s) => s.progress?.codexRun,
};
const HISTORY = 'history';
/** @type {(h: any) => any} */
const historyFields = (h) => [h?.counters, h?.endings, h?.endingsByChar, h?.tvBest, h?.codex, h?.endless];

/** A run state (true), a history of saved runs (false), or neither (null). @param {any} o */
const kindOf = (o) => (!o || typeof o !== 'object' ? null : o.progress && o.story && o.clock ? true : !o.progress && ('achievements' in o || 'counters' in o || 'endings' in o) ? false : null);

/** A run state or a history whose field groups are tracked. @param {any} o */
export const tracked = (o) => kindOf(o) !== null;

/**
 * Each field group of a run state or history, as one comparable string per group.
 * @param {any} o
 * @returns {Record<string, string>}
 */
export function fieldGroups(o) {
  if (kindOf(o) === false) return { [HISTORY]: JSON.stringify(historyFields(o)) };
  /** @type {Record<string, string>} */
  const out = {};
  for (const [g, read] of Object.entries(STATE_GROUPS)) out[g] = JSON.stringify(read(o)) ?? '';
  return out;
}

/**
 * Field groups each condition type reads: the config's Condition type (Config_Achievement.Type), with Type 0 split
 * into a plain counter threshold (the config counter, no predicate of its own) and a predicate of its own. Read off
 * src/meta/achievements.js and the config's condition texts (an ending's condition names the story tags that decide
 * it). null: not mappable with certainty; such a condition reads every group.
 * @type {Record<string, string[] | null>}
 */
export const CONDITION_GROUPS = {
  // Pre-disaster stockpile weight (preKg: the pre.kg counter, else the home's and trunk's weight since the start)
  1: ['counters', 'snap', 'phase', 'inventories', 'furniture', 'home', 'pre'],
  // pre-disaster food types, material types, shops visited (counters with the pre.* fallbacks)
  2: ['counters', 'pre'],
  3: ['counters', 'pre'],
  4: ['counters', 'pre'],
  // money left at the outbreak (the outbreak snapshot, else the pre.moneyLeft counter)
  5: ['snap', 'counters', 'phase'],
  // days survived (1005 also the reckoning tag, 1007 the final-wave tag and the run mode)
  11: ['clock', 'phase', 'tags', 'mode'],
  // a crisis held with the door above 80%; the ice bath (lifetime counters)
  12: ['counters', HISTORY],
  13: ['counters', HISTORY],
  // an ending reached: the endings recorded and the run's own, and the story tags that decide it
  16: ['endings', 'phase', HISTORY, 'tags'],
  // an ending with a character; endings with three characters, nine endings
  17: ['endings', 'phase', HISTORY, 'tags', 'mode'],
  18: ['endings', 'phase', HISTORY, 'tags', 'mode'],
  // a stat maximum above 150: effectiveMax also reads the modifiers of abilities, difficulty and effects
  19: null,
  // a config counter threshold: the run counter and the lifetime counter, plus the fallback the counter key has
  // (COUNTER_FALLBACK)
  '0 counter': ['counters', HISTORY],
  // a predicate of its own (routes, challenges, stock, electricity, souvenirs, …): not mapped by type
  '0 predicate': null,
};

/** The group the run counter's fallback reads, by counter key (achievements.js FALLBACK). @type {Record<string, string>} */
export const COUNTER_FALLBACK = {
  'zombie.kill': 'tallies',
  'crisis.survived': 'tallies',
  'horde.survived': 'tallies',
  'wave.survived': 'crises',
  clue: 'clues',
  PlantPotCount: 'furniture',
  'pre.points': 'pre',
  'pre.foodTypes': 'pre',
  'pre.matTypes': 'pre',
};

/** @type {Map<number, Record<string, any>>} */
const CONFIG = new Map(ACHIEVEMENT_CONFIG.list.map((a) => [a.id, a]));

/**
 * The condition type of an achievement (a CONDITION_GROUPS key).
 * @param {number} id
 * @param {Set<number>} predicates  ids whose condition is a predicate of its own (achievements.js SPECIAL_IDS)
 */
export function conditionType(id, predicates) {
  const a = CONFIG.get(Number(id));
  if (!a) return '0 predicate';
  if (Number(a.type) !== 0) return String(a.type);
  return a.counter && a.threshold > 0 && !predicates.has(Number(id)) ? '0 counter' : '0 predicate';
}

/**
 * The field groups an achievement's condition reads, or null for every group.
 * @param {number} id @param {Set<number>} predicates
 * @returns {string[] | null}
 */
export function groupsRead(id, predicates) {
  const t = conditionType(id, predicates);
  const groups = t in CONDITION_GROUPS ? CONDITION_GROUPS[t] : null;
  const fallback = t === '0 counter' ? COUNTER_FALLBACK[CONFIG.get(Number(id))?.counter] : null;
  return groups && fallback ? [...groups, fallback] : groups;
}
