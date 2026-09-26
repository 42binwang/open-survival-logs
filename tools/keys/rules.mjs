// @ts-check
// How keys are spelled in this codebase, for the keys audit (engine: scan.mjs, registry: src/contracts/keys.js):
// the namespaces, the helpers that take a key argument, content fields that name keys, key-list constants,
// object literals that initialise a namespace, and the reviewed sites that use computed keys.

/** @typedef {import('./scan.mjs').Rules} Rules */
/** @typedef {import('./scan.mjs').Access} Access */
/** @typedef {import('./scan.mjs').SourceTree} SourceTree */

const BUMPERS = ['src/sim/cooking.js', 'src/sim/crafting.js', 'src/sim/farming.js', 'src/sim/horde.js', 'src/sim/social.js'];

/**
 * Achievement config counters (src/data/gen/achievements.js): an achievement without a predicate in the SPECIAL
 * table of src/meta/achievements.js is met when `counter` reaches `threshold`, so its counter is read there.
 * @param {SourceTree} tree
 * @returns {Access[]}
 */
function achievementConfigCounters(tree) {
  const cfgFile = 'src/data/gen/achievements.js';
  const achFile = 'src/meta/achievements.js';
  const src = tree.files.get(cfgFile);
  const ach = tree.module(achFile);
  if (!src || !ach) return [];
  const json = src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1);
  /** @type {{ list: Array<{ id: number, counter?: string, threshold?: number }> }} */
  const cfg = JSON.parse(json);
  const special = new Set();
  const b = ach.lookup('SPECIAL', 0);
  const obj = b?.init ? ach.objectOf(b.init[0], b.init[1]) : -1;
  if (obj < 0) throw new Error(`${achFile}: the SPECIAL predicate table was not found`);
  for (const k of ach.objectKeys(obj)) special.add(Number(k.key));
  const line = ach.tokens[obj].line;
  return cfg.list
    .filter((a) => a.counter && (a.threshold || 0) > 0 && !special.has(a.id))
    .map((a) => ({ ns: 'counters', key: /** @type {string} */ (a.counter), mode: /** @type {const} */ ('read'), file: achFile, line, via: `config achievement ${a.id}`, at: -1 }));
}

/** @type {Rules} */
export const RULES = {
  skip: ['src/data/gen/', 'src/contracts/keys.js'],

  namespaces: [
    { ns: 'counters', suffix: ['progress', 'counters'] },
    { ns: 'daily', suffix: ['player', 'daily'] },
    { ns: 'tags', suffix: ['story', 'tags'] },
    { ns: 'story.flags', suffix: ['story', 'flags'] },
    { ns: 'social.flags', suffix: ['social', 'flags'] },
    { ns: 'taboo', suffix: ['progress', 'taboo'] },
    { ns: 'run', root: 'state', prefix: ['run'] },
    { ns: 'loop', root: 'state', prefix: ['loop'] },
    { ns: 'loop', root: 'loop', prefix: [] },
    { ns: 'history', root: 'history', prefix: [] },
    { ns: 'settings', root: 'settings', prefix: [] },
    { ns: 'slot', root: 'slot', prefix: [] },
    { ns: 'slot.summary', suffix: ['summary'], files: ['src/ui/menus.js'] },
    // the challenge predicates of the achievements get the taboo map as `t`
    { ns: 'taboo', root: 'taboo', prefix: [], files: ['src/meta/achievements.js'] },
  ],

  // By convention `state` is the run state and `game` the controller of src/game.js; parameters named `s` are the run
  // state and parameters named `history` the global history (a local `const history` may be something else).
  roots: { state: 'state', game: 'game' },
  paramRoots: { s: 'state', history: 'history' },
  fileRoots: [
    { files: ['src/meta/achievements.js'], names: { h: 'history', t: 'taboo' } },
    { files: ['src/sim/rebirth.js'], names: { next: 'state', loop: 'loop' } },
    { files: ['src/ui/deathScreen.js'], names: { holder: 'state', loop: 'loop' } },
    { files: ['src/engine/save.js'], names: { p: 'slot' } },
  ],

  calls: [
    { fn: 'emit', arg: 0, ns: 'bus', mode: 'write' },
    { fn: 'on', arg: 0, ns: 'bus', mode: 'read' },
    { fn: 'cue', arg: 1, ns: 'bus', mode: 'write', files: ['src/sim/horde.js'] },
    { fn: 'bump', arg: 1, ns: 'counters', mode: 'write', files: BUMPERS },
    { fn: 'bumpDaily', arg: 1, ns: 'daily', mode: 'write' },
    { fn: 'dailyCount', arg: 1, ns: 'daily', mode: 'read' },
    { fn: 'setStoryTag', arg: 1, ns: 'tags', mode: 'write' },
    { fn: 'runCounter', arg: 1, ns: 'counters', mode: 'read' },
    { fn: 'lifetimeCounter', arg: 2, ns: 'counters', mode: 'read' },
    { fn: 'counterAtLeast', arg: 0, ns: 'counters', mode: 'read', files: ['src/meta/achievements.js'] },
    { fn: 'tag', arg: 1, ns: 'tags', mode: 'read', files: ['src/meta/achievements.js'] },
    { fn: 'life', arg: 0, ns: 'counters', mode: 'read', files: ['src/meta/profile.js'] },
    { fn: 'since', arg: 0, ns: 'counters', mode: 'read', files: ['src/sim/story.js'] },
    // the story query `q` handed to every content condition and text function (src/sim/story.js query())
    { method: 'tag', object: 'q', arg: 0, ns: 'tags', mode: 'read' },
    { method: 'flag', object: 'q', arg: 0, ns: 'story.flags', mode: 'read' },
    { method: 'counter', object: 'q', arg: 0, ns: 'counters', mode: 'read' },
    { method: 'since', object: 'q', arg: 0, ns: 'counters', mode: 'read' },
    { method: 'getItem', arg: 0, ns: 'localStorage', mode: 'read' },
    { method: 'setItem', arg: 0, ns: 'localStorage', mode: 'write' },
    { method: 'removeItem', arg: 0, ns: 'localStorage', mode: 'write' },
    { method: 'get', object: 'store', arg: 0, ns: 'localStorage', mode: 'read', files: ['src/engine/save.js'] },
    { method: 'set', object: 'store', arg: 0, ns: 'localStorage', mode: 'write', files: ['src/engine/save.js'] },
    { method: 'del', object: 'store', arg: 0, ns: 'localStorage', mode: 'write', files: ['src/engine/save.js'] },
    { fn: 'applySettings', arg: 0, ns: 'settings', mode: 'write', take: 'keys' },
  ],

  fields: [
    // declarative effects of events, choices and quests (applied by applyEffects in src/sim/story.js)
    { field: 'tags', ns: 'tags', mode: 'write', files: ['src/content/events.js'] },
    { field: 'flags', ns: 'story.flags', mode: 'write', take: 'keys', files: ['src/content/events.js'] },
    { field: 'counters', ns: 'counters', mode: 'write', take: 'keys', files: ['src/content/events.js'] },
    { field: 'taboo', ns: 'taboo', mode: 'write', files: ['src/content/events.js'] },
    // neighbor lines: set by src/sim/social.js (setStoryTag), the route tag read by routeChosen()
    { field: 'deadTag', ns: 'tags', mode: 'write', files: ['src/content/people.js'] },
    { field: 'rescueTags', ns: 'tags', mode: 'write', files: ['src/content/people.js'] },
    { field: 'routeTag', ns: 'tags', mode: 'read', files: ['src/content/people.js'] },
    // challenge endings: held while the taboo flag stays unset (challengeResults in src/sim/endings.js)
    { field: 'flag', ns: 'taboo', mode: 'read', files: ['src/content/endings.js'] },
    { field: 'tag', ns: 'tags', mode: 'read', match: /^TAG_/, files: ['src/content/endings.js'] },
    // an action's daily limit, bumped when it completes (applyCostsAndGains in src/sim/actions.js)
    { field: 'dailyKey', ns: 'daily', mode: 'write' },
  ],

  // The journal's Statistics tab and the death screen list every non-zero counter (Object.entries), labelled from
  // COUNTER_LABELS or under the raw key: a counter nothing else reads is still on screen and needs a label.
  displays: [{ ns: 'counters', sites: ['src/ui/journalPanel.js', 'src/ui/deathScreen.js'], labels: 'src/sim/settlement.js COUNTER_LABELS' }],

  consts: [
    // a labelled counter is read by those screens
    { file: 'src/sim/settlement.js', name: 'COUNTER_LABELS', ns: 'counters', mode: 'read', take: 'keys' },
    { file: 'src/ui/deathScreen.js', name: 'KEY_STATS', ns: 'counters', mode: 'read' },
  ],

  returns: [
    { fn: 'routeTagChosen', pattern: 'TAG_LINE_${ROUTE}_CHOSEN' },
    { fn: 'ensureStory', path: 'state.story' },
    { fn: 'social', path: 'state.social' },
  ],

  literals: [
    { file: 'src/sim/state.js', fn: 'newLoopData', ns: 'loop' },
    { file: 'src/engine/save.js', fn: 'defaultHistory', ns: 'history' },
    { file: 'src/engine/save.js', fn: 'saveGame', call: 'stringify', ns: 'slot' },
    { file: 'src/engine/save.js', fn: 'summarize', ns: 'slot.summary' },
    { file: 'src/game.js', name: 'DEFAULT_SETTINGS', ns: 'settings' },
  ],

  extract: [achievementConfigCounters],

  // Sites that use computed keys. Each is plumbing whose keys are caught elsewhere (call sites, content fields).
  dynamic: [
    { file: 'src/sim/cooking.js', fn: 'bump', ns: 'counters', reason: 'counter helper; call sites are `bump(state, key)` rules' },
    { file: 'src/sim/crafting.js', fn: 'bump', ns: 'counters', reason: 'counter helper; call sites are `bump(state, key)` rules' },
    { file: 'src/sim/farming.js', fn: 'bump', ns: 'counters', reason: 'counter helper; call sites are `bump(state, key)` rules' },
    { file: 'src/sim/horde.js', fn: 'bump', ns: 'counters', reason: 'counter helper; call sites are `bump(state, key)` rules' },
    { file: 'src/sim/social.js', fn: 'bump', ns: 'counters', reason: 'counter helper; call sites are `bump(state, key)` rules' },
    { file: 'src/sim/horde.js', fn: 'cue', ns: 'bus', reason: 'throttled emit; call sites are `cue(state, type)` rules' },
    { file: 'src/sim/stats.js', fn: 'bumpDaily', ns: 'daily', reason: 'daily counter helper; call sites are rules' },
    { file: 'src/sim/stats.js', fn: 'dailyCount', ns: 'daily', reason: 'daily counter helper; call sites are rules' },
    { file: 'src/sim/actions.js', fn: 'applyCostsAndGains', ns: 'daily', reason: "bumps the action's dailyKey (content field rule)" },
    { file: 'src/sim/actions.js', fn: 'dailyLeft', ns: 'daily', reason: "reads the action's dailyKey (content field rule)" },
    { file: 'src/sim/explore.js', fn: 'complete', ns: 'daily', reason: 'refunds the forced-exploration dailyKey of the cancelled action' },
    { file: 'src/sim/explore.js', fn: 'startExploration', ns: 'daily', reason: 'bumps the dailyKey remembered as forcedKey' },
    { file: 'src/sim/social.js', fn: 'setStoryTag', ns: 'tags', reason: 'tag helper; call sites are `setStoryTag(state, tag)` rules' },
    { file: 'src/sim/social.js', fn: 'checkRescue', ns: 'tags', reason: 'rescueTags of src/content/people.js (field rule)' },
    { file: 'src/sim/social.js', fn: 'neighborDies', ns: 'tags', reason: 'deadTag of src/content/people.js (field rule)' },
    { file: 'src/sim/social.js', fn: 'routeChosen', ns: 'tags', reason: 'routeTag of src/content/people.js (field rule)' },
    { file: 'src/sim/story.js', fn: 'applyEffects', ns: 'tags', reason: 'effects.tags of src/content/events.js (field rule)' },
    { file: 'src/sim/story.js', fn: 'applyEffects', ns: 'story.flags', reason: 'effects.flags of src/content/events.js (field rule)' },
    { file: 'src/sim/story.js', fn: 'applyEffects', ns: 'counters', reason: 'effects.counters of src/content/events.js (field rule)' },
    { file: 'src/sim/story.js', fn: 'applyEffects', ns: 'taboo', reason: 'effects.taboo of src/content/events.js (field rule)' },
    { file: 'src/sim/story.js', fn: 'tag', ns: 'tags', reason: 'q.tag(key) of the story query (method rule)' },
    { file: 'src/sim/story.js', fn: 'flag', ns: 'story.flags', reason: 'q.flag(key) of the story query (method rule)' },
    { file: 'src/sim/story.js', fn: 'counter', ns: 'counters', reason: 'q.counter(key) of the story query (method rule)' },
    { file: 'src/sim/story.js', fn: 'since', ns: 'counters', reason: 'q.since(key) of the story query (method rule)' },
    { file: 'src/sim/endings.js', fn: 'challengeResults', ns: 'taboo', reason: 'CHALLENGES[].flag of src/content/endings.js (field rule)' },
    { file: 'src/sim/endings.js', fn: 'challengeResults', ns: 'tags', reason: 'SHIELD_CHALLENGE.tag of src/content/endings.js (field rule)' },
    { file: 'src/meta/achievements.js', fn: 'runCounter', ns: 'counters', reason: 'counter reader; call sites are rules' },
    { file: 'src/meta/achievements.js', fn: 'lifetimeCounter', ns: 'counters', reason: 'counter reader; call sites are rules' },
    { file: 'src/meta/achievements.js', fn: 'counterValue', ns: 'counters', reason: 'config achievement counters (custom extractor)' },
    { file: 'src/meta/achievements.js', fn: 'counterAtLeast', ns: 'counters', reason: 'predicate factory; call sites are rules' },
    { file: 'src/meta/achievements.js', fn: 'test', ns: 'counters', reason: 'counterAtLeast() predicate body' },
    { file: 'src/meta/achievements.js', fn: 'tag', ns: 'tags', reason: 'tag reader; call sites are rules' },
    { file: 'src/meta/achievements.js', fn: 'routeChosen', ns: 'tags', reason: 'finds the chosen route among TAG_LINE_${ROUTE}_CHOSEN' },
    { file: 'src/meta/profile.js', fn: 'life', ns: 'counters', reason: 'lifetime counter reader; call sites are rules' },
    { file: 'src/ui/endingScreen.js', fn: 'recordPage', ns: 'counters', reason: 'KEY_STATS of src/ui/deathScreen.js (const rule)' },
    { file: 'src/engine/save.js', fn: 'get', ns: 'localStorage', reason: 'storage wrapper; call sites are store.get() rules' },
    { file: 'src/engine/save.js', fn: 'set', ns: 'localStorage', reason: 'storage wrapper; call sites are store.set() rules' },
    { file: 'src/engine/save.js', fn: 'del', ns: 'localStorage', reason: 'storage wrapper; call sites are store.del() rules' },
    { file: 'src/engine/save.js', fn: 'listSaves', ns: 'localStorage', reason: 'enumerates survivalLog.save.${slot}' },
    { file: 'src/game.js', fn: 'applySettings', ns: 'settings', reason: 'merges the patch; call sites are `applySettings({ … })` rules' },
    { file: 'src/engine/save.js', fn: '_resetStorage', ns: 'localStorage', reason: 'test helper: deletes every survivalLog.* key' },
  ],
};
