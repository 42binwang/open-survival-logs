// @ts-check
// tools/code-coverage.mjs: lcov records of one file merge across test processes; changed lines no test runs, a file
// losing coverage, a lowered baseline and an unexplained exemption are problems; covered changes pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLcov, percent, judge, mergeV8, METHOD } from '../tools/code-coverage.mjs';

const ROOT = '/repo';
/** One lcov record: lines [n, hits], branches [line, taken], functions [name, hits]. */
const record = (/** @type {string} */ file, /** @type {[number, number][]} */ lines, /** @type {[number, number][]} */ branches = [], /** @type {[string, number][]} */ fns = []) =>
  [
    `SF:${ROOT}/${file}`,
    ...fns.map(([name], i) => `FN:${i + 1},${name}`),
    ...fns.map(([name, hits]) => `FNDA:${hits},${name}`),
    ...branches.map(([line, taken], i) => `BRDA:${line},0,${i},${taken}`),
    ...lines.map(([n, hits]) => `DA:${n},${hits}`),
    'end_of_record',
  ].join('\n');

test('records of one file from two test processes merge: a line is covered when either run covers it', () => {
  const text = [record('src/a.js', [[1, 1], [2, 0], [3, 0]], [[2, 0]], [['f', 0]]), record('src/a.js', [[1, 0], [2, 3], [3, 0]], [[2, 1]], [['f', 2]])].join('\n');
  const cov = parseLcov(text, ROOT);
  assert.equal(cov.size, 1);
  const a = /** @type {any} */ (cov.get('src/a.js'));
  assert.deepEqual([...a.lines.entries()], [[1, 1], [2, 3], [3, 0]]);
  assert.deepEqual(percent(a), { lines: 66.7, branches: 100, functions: 100 });
});

test('a changed line no test runs, and a branch on a changed line no test takes, are problems', () => {
  const cov = parseLcov(record('src/a.js', [[1, 1], [2, 0], [3, 1], [4, 1]], [[3, 0], [4, 1]]), ROOT);
  const { problems, newLines, uncoveredNew } = judge({ cov, baseline: { method: METHOD, files: {}, exempt: {} }, master: null, changed: new Map([['src/a.js', [2, 3]]]) });
  assert.equal(newLines, 2);
  assert.equal(uncoveredNew, 1);
  assert.ok(problems.some((p) => /1 changed line\(s\) no test runs: 2/.test(p)), problems.join('\n'));
  assert.ok(problems.some((p) => /branch\(es\) on changed lines no test takes, on line\(s\) 3/.test(p)), problems.join('\n'));
});

test('covered changes pass; an exempt file is judged elsewhere; a changed file no test loads fails', () => {
  const cov = parseLcov(record('src/a.js', [[1, 1], [2, 1]], [[2, 1]]), ROOT);
  const exempt = { 'src/gpu.js': 'WebGL only: covered by the 3D visual shots (tests/visual/shots.json)' };
  const ok = judge({ cov, baseline: { method: METHOD, files: {}, exempt }, master: null, changed: new Map([['src/a.js', [1, 2]], ['src/gpu.js', [5]]]) });
  assert.deepEqual(ok.problems, []);
  const missing = judge({ cov, baseline: { method: METHOD, files: {}, exempt: {} }, master: null, changed: new Map([['src/new.js', [1, 2, 3]]]) });
  assert.ok(missing.problems.some((p) => /src\/new\.js: changed, but no test loads it/.test(p)), missing.problems.join('\n'));
});

test('the ratchet: a file below its baseline fails, noise within half a point does not', () => {
  const cov = parseLcov(record('src/a.js', [[1, 1], [2, 1], [3, 0]]), ROOT); // 66.7 %
  const base = (/** @type {number} */ lines) => ({ method: METHOD, files: { 'src/a.js': { lines, branches: 100, functions: 100 } }, exempt: {} });
  assert.deepEqual(judge({ cov, baseline: base(67.1), master: null, changed: new Map() }).problems, []);
  const drop = judge({ cov, baseline: base(80), master: null, changed: new Map() });
  assert.ok(drop.problems.some((p) => /src\/a\.js: lines coverage fell from 80% to 66\.7%/.test(p)), drop.problems.join('\n'));
});

test("a branch never lowers master's baseline, never drops a file from it, and never adds an exemption", () => {
  const cov = parseLcov(record('src/a.js', [[1, 1]]), ROOT);
  const master = { method: METHOD, files: { 'src/a.js': { lines: 100, branches: 100, functions: 100 }, 'tools/code-coverage.mjs': { lines: 1, branches: 1, functions: 1 } }, exempt: {} };
  const branch = { method: METHOD, files: { 'src/a.js': { lines: 90, branches: 100, functions: 100 } }, exempt: { 'src/a.js': 'because I said so, at length enough' } };
  const { problems } = judge({ cov, baseline: branch, master, changed: new Map() });
  assert.ok(problems.some((p) => /src\/a\.js lines lowered from master's 100% to 90%/.test(p)), problems.join('\n'));
  assert.ok(problems.some((p) => /tools\/code-coverage\.mjs was dropped from the baseline/.test(p)), problems.join('\n'));
  assert.ok(problems.some((p) => /src\/a\.js newly exempt/.test(p)), problems.join('\n'));
});

test('an exemption needs a reason that names what covers the file instead', () => {
  const cov = parseLcov(record('src/a.js', [[1, 1]]), ROOT);
  const { problems } = judge({ cov, baseline: { method: METHOD, files: {}, exempt: { 'src/gpu.js': 'gpu' } }, master: null, changed: new Map() });
  assert.ok(problems.some((p) => /exemption for src\/gpu\.js needs a reason/.test(p)), problems.join('\n'));
});

// V8's per-process coverage of one small module: a function `open` with an if/else, called by one process only.
const SRC = ['export function open(modal) {', '  if (modal) {', '    return 1;', '  }', '  return 2;', '}', '', 'export const x = 1;'].join('\n');
const off = (/** @type {string} */ s) => SRC.indexOf(s);
const END = SRC.length;
const fnStart = off('export function open');
const fnEnd = off('\n\nexport const') + 1;
const ifBlock = { startOffset: off('{\n    return 1'), endOffset: off('\n  return 2'), count: 0 };
/** loaded, `open` never called: V8 reports the function's whole range at 0 and no blocks inside it */
const loadedOnly = { url: 'file:///repo/src/m.js', functions: [{ functionName: '', ranges: [{ startOffset: 0, endOffset: END, count: 1 }] }, { functionName: 'open', isBlockCoverage: true, ranges: [{ startOffset: fnStart, endOffset: fnEnd, count: 0 }] }] };
/** `open(false)` called once: the if-branch is a block at 0 inside a function at 1 */
const called = { url: 'file:///repo/src/m.js', functions: [{ functionName: '', ranges: [{ startOffset: 0, endOffset: END, count: 1 }] }, { functionName: 'open', isBlockCoverage: true, ranges: [{ startOffset: fnStart, endOffset: fnEnd, count: 1 }, ifBlock] }] };

test('V8 merge: a process that only loads a module never hides the lines another process ran (BUG-0112)', () => {
  for (const order of [[loadedOnly, called], [called, loadedOnly]]) {
    const c = mergeV8(SRC, order);
    assert.equal(c.lines.get(1), 1, 'the function line ran');
    assert.equal(c.lines.get(2), 1, 'the if line ran');
    assert.equal(c.lines.get(3), 0, 'the if-branch body did not');
    assert.equal(c.lines.get(5), 1, 'the else path ran');
    assert.equal(c.lines.has(7), false, 'a blank line is not a line');
    assert.deepEqual([...c.fns.entries()], [['open@1', 1]]);
    assert.deepEqual([...c.branches.values()], [{ line: 2, taken: 0 }]);
  }
});

test('V8 merge: a branch one process takes counts as taken; a module no process calls is uncovered', () => {
  const tookIf = { ...called, functions: [called.functions[0], { ...called.functions[1], ranges: [{ startOffset: fnStart, endOffset: fnEnd, count: 1 }, { ...ifBlock, count: 1 }] }] };
  const both = mergeV8(SRC, [called, tookIf]);
  assert.equal(both.lines.get(3), 1);
  assert.deepEqual([...both.branches.values()], [{ line: 2, taken: 1 }]);
  const none = mergeV8(SRC, [loadedOnly]);
  // only `export const x = 1;` ran: 1 of the 7 non-blank lines, and `open` was never called
  assert.deepEqual(percent(none), { lines: 14.3, branches: 100, functions: 0 });
});

test('a baseline measured another way is re-recorded, and master\'s old numbers are not compared with new ones', () => {
  const cov = parseLcov(record('src/a.js', [[1, 1], [2, 0]]), ROOT); // 50 %
  const old = { method: 'lcov-node', files: { 'src/a.js': { lines: 90, branches: 100, functions: 100 } }, exempt: {} };
  const stale = judge({ cov, baseline: old, master: null, changed: new Map() });
  assert.ok(stale.problems.some((p) => /recorded with method lcov-node.*re-record/.test(p)), stale.problems.join('\n'));
  const fresh = { method: METHOD, files: { 'src/a.js': { lines: 50, branches: 100, functions: 100 } }, exempt: {} };
  assert.deepEqual(judge({ cov, baseline: fresh, master: old, changed: new Map() }).problems, []);
});
