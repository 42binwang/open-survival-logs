// @ts-check
// The keys audit (tools/keys-audit.mjs, tools/keys/) on small fixtures, and the health of the real registry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { audit } from '../tools/keys/audit.mjs';
import { tokenize } from '../tools/keys/lexer.mjs';
import { RULES } from '../tools/keys/rules.mjs';
import * as REGISTRY from '../src/contracts/keys.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** @typedef {import('../tools/keys/scan.mjs').Rules} Rules */
/** @typedef {import('../tools/keys/audit.mjs').RegistryModule} RegistryModule */

/** @type {Rules} */
const FIXTURE_RULES = {
  namespaces: [
    { ns: 'counters', suffix: ['progress', 'counters'] },
    { ns: 'daily', suffix: ['player', 'daily'] },
    { ns: 'tags', suffix: ['story', 'tags'] },
    { ns: 'run', root: 'state', prefix: ['run'] },
  ],
  roots: { state: 'state' },
  calls: [
    { fn: 'emit', arg: 0, ns: 'bus', mode: 'write' },
    { fn: 'on', arg: 0, ns: 'bus', mode: 'read' },
    { fn: 'bump', arg: 1, ns: 'counters', mode: 'write' },
    { fn: 'bumpDaily', arg: 1, ns: 'daily', mode: 'write' },
    { fn: 'dailyCount', arg: 1, ns: 'daily', mode: 'read' },
  ],
  fields: [{ field: 'tags', ns: 'tags', mode: 'write', files: ['src/content.js'] }],
  dynamic: [],
};

const NAMESPACES = {
  counters: { kind: /** @type {const} */ ('counter'), where: 'state.progress.counters', doc: '' },
  daily: { kind: /** @type {const} */ ('counter'), where: 'state.player.daily', doc: '' },
  tags: { kind: /** @type {const} */ ('tag'), where: 'state.story.tags', doc: '' },
  run: { kind: /** @type {const} */ ('flag'), where: 'state.run', doc: '' },
  bus: { kind: /** @type {const} */ ('event'), where: 'emit / on', doc: '' },
};

/**
 * @param {Record<string, string>} files repo-relative path → source
 * @param {RegistryModule['KEYS']} keys
 * @param {Partial<Rules>} [rules]
 */
function check(files, keys, rules = {}) {
  return audit({ files: new Map(Object.entries(files)), registry: { NAMESPACES, KEYS: keys }, rules: { ...FIXTURE_RULES, ...rules } });
}

/** @param {ReturnType<typeof audit>} r */
const found = (r) => r.problems.map((p) => `${p.type} ${p.ns}:${p.key}`).sort();

const OWNER = 'src/a.js';

// ------------------------------------------------------------------------------------------------ the four fixtures

test('a key that is read but never produced is reported as unproduced', () => {
  const r = check(
    { 'src/a.js': "export const ready = (state) => state.progress.counters['cook.count'] > 0;" },
    { counters: { 'cook.count': [OWNER, 'Dishes cooked.'] } }
  );
  assert.deepEqual(found(r), ['unproduced counters:cook.count']);
  assert.deepEqual(r.problems[0].sites, [{ file: 'src/a.js', line: 1, mode: 'read', via: 'member' }]);
});

test('a key that is produced but never used is reported as unconsumed', () => {
  const r = check({ 'src/a.js': "import { emit } from './bus.js';\nexport function done() {\n  emit('cropReady', { furn: 1 });\n}" }, { bus: { cropReady: [OWNER, 'A crop is ripe.'] } });
  assert.deepEqual(found(r), ['unconsumed bus:cropReady']);
  assert.equal(r.problems[0].sites[0].line, 3);
});

test('a key that is used but not declared is reported with every site', () => {
  const r = check({ 'src/a.js': "bump(state, 'zombie.kil');\nbump(state, 'zombie.kil');\nif (state.progress.counters['zombie.kil']) {}" }, { counters: {} });
  assert.deepEqual(found(r), ['undeclared counters:zombie.kil']);
  assert.deepEqual(r.problems[0].sites.map((s) => `${s.line} ${s.mode}`), ['1 write', '2 write', '3 read']);
});

test('template keys: a template write, literal reads and one declaration with its allowed values', () => {
  const files = {
    'src/a.js': [
      'export function commit(state, route) {',
      '  state.story.tags[`TAG_LINE_${route.toUpperCase()}_CHOSEN`] = true;',
      '}',
      'export const girl = (state) => !!state.story.tags.TAG_LINE_GIRL_CHOSEN;',
      "export const used = (state, id) => dailyCount(state, `use:${id}`) + dailyCount(state, 'use:9001');",
      'export function useIt(state, cfg) {',
      '  bumpDaily(state, `use:${cfg.id}`);',
      '}',
    ].join('\n'),
  };
  /** @type {RegistryModule['KEYS']} */
  const keys = {
    tags: { 'TAG_LINE_${ROUTE}_CHOSEN': [OWNER, 'Route committed.', { values: { ROUTE: ['GIRL', 'TRUTH'] } }] },
    daily: { 'use:${id}': [OWNER, 'Uses of item id today.'] },
  };
  assert.deepEqual(found(check(files, keys)), []);
  // a literal outside the allowed values is not covered by the template
  const typo = check({ ...files, 'src/b.js': 'export const x = (state) => state.story.tags.TAG_LINE_GRIL_CHOSEN;' }, keys);
  assert.deepEqual(found(typo), ['undeclared tags:TAG_LINE_GRIL_CHOSEN']);
  assert.match(typo.problems[0].message, /matches TAG_LINE_\$\{ROUTE\}_CHOSEN except for its allowed values/);
  // a template key needs a template declaration
  const bare = check({ 'src/a.js': 'export const f = (state, a, b) => { bumpDaily(state, `func:${a}:${b}`); return dailyCount(state, `func:${a}:${b}`); };' }, { daily: {} });
  assert.deepEqual(found(bare), ['undeclared daily:func:${…}:${…}']);
  const declared = check({ 'src/a.js': 'export const f = (state, a, b) => { bumpDaily(state, `func:${a}:${b}`); return dailyCount(state, `func:${a}:${b}`); };' }, { daily: { 'func:${key}:${uid}': [OWNER, 'Daily uses of a furniture function.'] } });
  assert.deepEqual(found(declared), []);
});

// ------------------------------------------------------------------------------------------------ how keys are found

test('aliases, loops over key lists and constants resolve to concrete keys', () => {
  const src = [
    "const KEYS = ['food.eaten', 'cook.count'];",
    'export function tally(state) {',
    '  const c = state.progress.counters;',
    "  c['food.eaten'] = (c['food.eaten'] || 0) + 1;",
    '  c.cookCount = 1;',
    '  let n = 0;',
    '  for (const k of KEYS) n += c[k] || 0;',
    '  return n;',
    '}',
    "const EV = 'saved';",
    "export const save = () => emit(EV, {});",
    "export const listen = () => ['saved', 'loaded'].forEach((ev) => on(ev, () => {}));",
  ].join('\n');
  const r = check({ 'src/a.js': src }, {
    counters: { 'food.eaten': [OWNER, 'Meals.'], 'cook.count': [OWNER, 'Dishes.'], cookCount: [OWNER, 'Written only.'] },
    bus: { saved: [OWNER, 'Saved.'], loaded: [OWNER, 'Loaded.'] },
  });
  assert.deepEqual(found(r), ['unconsumed counters:cookCount', 'unproduced bus:loaded', 'unproduced counters:cook.count']);
});

test('read-modify-write and a condition that only guards its own write are not uses', () => {
  const src = [
    'export function track(state, live) {',
    '  const c = state.progress.counters;',
    "  c['tiles'] = (c['tiles'] || 0) + 1;",
    "  if (live > (c['pots.best'] || 0)) c['pots.best'] = live;",
    "  if (!c['once']) {",
    "    c['once'] = 1;",
    "    emit('firstTime', {});",
    '  }',
    '}',
  ].join('\n');
  const r = check({ 'src/a.js': src }, {
    counters: { tiles: [OWNER, 'Tiles.'], 'pots.best': [OWNER, 'Best.'], once: [OWNER, 'Once-only guard.'] },
    bus: { firstTime: [OWNER, 'First.', { readBy: ['src/a.js — fixture'] }] },
  });
  assert.deepEqual(found(r), ['unconsumed counters:pots.best', 'unconsumed counters:tiles']);
});

test('mutating a value counts as a write, calling a reader method as a read', () => {
  const src = [
    'export function add(state, id) {',
    '  const list = (state.run.cards ||= []);',
    '  if (!list.includes(id)) list.push(id);',
    '  state.run.offers.push(id);',
    '}',
  ].join('\n');
  const r = check({ 'src/a.js': src }, { run: { cards: [OWNER, 'Cards.'], offers: [OWNER, 'Offers.'] } });
  assert.deepEqual(found(r), ['unconsumed run:offers']);
});

test('a counter a listing screen shows is unlabelled, not unconsumed, and a label makes it consumed', () => {
  /** @type {Partial<Rules>} */
  const display = {
    displays: [{ ns: 'counters', sites: ['src/ui/stats.js'], labels: 'src/labels.js LABELS' }],
    consts: [{ file: 'src/labels.js', name: 'LABELS', ns: 'counters', mode: 'read', take: 'keys' }],
  };
  const files = {
    'src/horde.js': "export function sync(state, n) {\n  const c = state.progress.counters;\n  c['defense.spike'] = n.spike;\n  c['defense.sandbag'] = n.sandbag;\n}",
    'src/ui/stats.js': 'export const rows = (state) => Object.entries(state.progress.counters).map(([k, v]) => [LABELS[k] || k, v]);',
    'src/labels.js': "export const LABELS = { 'defense.spike': 'Spike traps installed' };",
  };
  /** @type {RegistryModule['KEYS']} */
  const keys = { counters: { 'defense.spike': ['src/horde.js', 'Spikes.'], 'defense.sandbag': ['src/horde.js', 'Sandbags.'] } };
  const r = check(files, keys, display);
  assert.deepEqual(found(r), ['unlabelled counters:defense.sandbag']);
  assert.match(r.problems[0].message, /add a label to src\/labels\.js LABELS/);
  const labelled = check({ ...files, 'src/labels.js': "export const LABELS = { 'defense.spike': 'Spikes', 'defense.sandbag': 'Sandbags' };" }, keys, display);
  assert.deepEqual(found(labelled), []);
  // without the listing screen the same counter really is unused, and a display rule with no live site is stale
  const gone = check({ ...files, 'src/ui/stats.js': 'export const rows = () => [];' }, keys, display);
  assert.deepEqual(found(gone), ['registry counters:src/ui/stats.js', 'unconsumed counters:defense.sandbag']);
});

test('content tables name keys through field rules', () => {
  const r = check(
    {
      'src/content.js': "export const EVENTS = [{ id: 'wave', effects: { tags: ['TAG_NEIGHBOR_MET'] } }];",
      'src/b.js': 'export const met = (state) => state.story.tags.TAG_NEIGHBOR_MET;',
    },
    { tags: { TAG_NEIGHBOR_MET: ['src/content.js', 'Met the neighbor.'] } }
  );
  assert.deepEqual(found(r), []);
});

test('comments and strings are not keys', () => {
  const src = "// emit('ghost', {})\nconst s = \"emit('ghost')\";\n/* on('ghost') */\nconst re = /emit\\('ghost'\\)/;\nexport { s, re };";
  const r = check({ 'src/a.js': src }, {});
  assert.deepEqual(found(r), []);
  const { tokens, comments } = tokenize('const a = `x${`y${1}`}` / 2; // c\nconst r = /[/]/g;');
  assert.equal(comments.length, 1);
  assert.deepEqual(tokens.filter((t) => t.type === 'regex').map((t) => t.value), ['/[/]/g']);
});

// ------------------------------------------------------------------------------------------------ declaring what the scan cannot see

test('readBy declares a consumer the scan cannot see; the reference must exist, mention the key and give a reason', () => {
  const files = { 'src/a.js': "emit('stat', { key: 'sat' });", 'tests/x.test.js': "on('stat', () => {});" };
  assert.deepEqual(found(check(files, { bus: { stat: [OWNER, 'A stat changed.', { readBy: ['tests/x.test.js — asserts the gains'] }] } })), []);
  const bad = check(files, {
    bus: {
      stat: [OWNER, 'A stat changed.', { readBy: ['tests/missing.test.js — gone', 'tests/x.test.js'] }],
    },
  });
  assert.deepEqual(bad.problems.map((p) => p.message).sort(), ["readBy 'tests/x.test.js' needs a reason ('<path or WP id> — why')", 'readBy tests/missing.test.js does not exist']);
  const silent = check({ ...files, 'tests/y.test.js': 'test(() => {});' }, { bus: { stat: [OWNER, 'A stat changed.', { readBy: ['tests/y.test.js — wrong file'] }] } });
  assert.deepEqual(silent.problems.map((p) => p.message), ["readBy tests/y.test.js does not mention 'stat'"]);
});

test('@keys annotations in a module declare data-driven consumers and producers', () => {
  const src = [
    '// Sound cues come from a table keyed by event name.',
    '// @keys read bus:hordeStart bus:hordeWave — audio cues from SFX',
    'const SFX = { hordeStart: "groan", hordeWave: "groan" };',
    'export const cue = (type) => SFX[type];',
  ].join('\n');
  const r = check({ 'src/audio.js': src, 'src/horde.js': "emit('hordeStart', {});\nemit('hordeWave', {});" }, {
    bus: { hordeStart: ['src/horde.js', 'A horde starts.'], hordeWave: ['src/horde.js', 'Next wave.'] },
  });
  assert.deepEqual(found(r), []);
});

test('computed keys are reported until the site is reviewed', () => {
  const src = 'export function cue(state, type, payload) {\n  emit(type, payload);\n}';
  const r = check({ 'src/a.js': src }, {});
  assert.deepEqual(found(r), ['dynamic bus:type']);
  assert.match(r.problems[0].message, /\(emit\(\) in cue\)/);
  const byComment = check({ 'src/a.js': 'export function cue(state, type, payload) {\n  // @keys dynamic bus — call sites pass literal types\n  emit(type, payload);\n}' }, {});
  assert.deepEqual(found(byComment), []);
  const byRule = check({ 'src/a.js': src }, {}, { dynamic: [{ file: 'src/a.js', fn: 'cue', ns: 'bus', reason: 'fixture' }] });
  assert.deepEqual(found(byRule), []);
  const staleRule = check({ 'src/a.js': 'export const x = 1;' }, {}, { dynamic: [{ file: 'src/a.js', fn: 'cue', ns: 'bus', reason: 'fixture' }] });
  assert.deepEqual(staleRule.problems.map((p) => p.type), ['registry']);
});

test('declared keys that the code no longer uses are stale, and overlapping declarations are rejected', () => {
  const r = check({ 'src/a.js': "bump(state, 'clue.truth');\nexport const n = (state) => state.progress.counters['clue.truth'];" }, {
    counters: { 'clue.${line}': [OWNER, 'Clues per line.'], 'clue.truth': [OWNER, 'Truth clues.'], 'old.count': [OWNER, 'Gone.'] },
  });
  assert.deepEqual(found(r), ['registry counters:clue.truth', 'stale counters:clue.${line}', 'stale counters:old.count']);
});

// ------------------------------------------------------------------------------------------------ the command line

test('the CLI prints a JSON report and exits 1 on problems, 0 when clean', () => {
  const dir = mkdtempSync(join(tmpdir(), 'keys-audit-'));
  try {
    mkdirSync(join(dir, 'src/contracts'), { recursive: true });
    const registry = (/** @type {string} */ keys) =>
      `export const NAMESPACES = { bus: { kind: 'event', where: 'emit / on', doc: '' } };\nexport const KEYS = { bus: { ${keys} } };\n`;
    writeFileSync(join(dir, 'src/a.js'), "emit('ping', {});\non('ping', () => {});\nemit('pong', {});\n");
    writeFileSync(join(dir, 'src/contracts/keys.js'), registry("ping: ['src/a.js', 'Ping.']"));
    const cli = join(ROOT, 'tools/keys-audit.mjs');
    const bad = spawnSync(process.execPath, [cli, '--json', '--root', dir], { encoding: 'utf8' });
    assert.equal(bad.status, 1, bad.stderr);
    const report = JSON.parse(bad.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.counts.problems, 1);
    assert.deepEqual(report.problems.map((/** @type {{ type: string, key: string }} */ p) => `${p.type} ${p.key}`), ['undeclared pong']);
    writeFileSync(join(dir, 'src/a.js'), "emit('ping', {});\non('ping', () => {});\n");
    const good = spawnSync(process.execPath, [cli, '--root', dir], { encoding: 'utf8' });
    assert.equal(good.status, 0, good.stdout + good.stderr);
    assert.match(good.stdout, /no problems/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------------------------------------ the real registry

test('the registry of src/contracts/keys.js is well-formed against the code under src/', () => {
  /** @type {Map<string, string>} */
  const files = new Map();
  /** @param {string} dir */
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.m?js$/.test(name)) files.set(relative(ROOT, p).split(sep).join('/'), readFileSync(p, 'utf8'));
    }
  };
  walk(join(ROOT, 'src'));
  walk(join(ROOT, 'tests'));
  const r = audit({ files, registry: REGISTRY, rules: RULES, exists: (p) => files.has(p) || statExists(join(ROOT, p)) });
  const registryProblems = r.problems.filter((p) => p.type === 'registry').map((p) => `${p.ns}:${p.key} ${p.message}`);
  assert.deepEqual(registryProblems, []);
  for (const ns of Object.keys(REGISTRY.KEYS)) assert.ok(REGISTRY.NAMESPACES[ns], `${ns} has a NAMESPACES entry`);
  assert.ok(r.entries.length > 300, 'every namespace is declared');
});

/** @param {string} p */
function statExists(p) {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}
