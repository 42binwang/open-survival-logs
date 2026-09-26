// @ts-check
// node:test for a traced test file: the same API, with every test (and subtest) body run inside an async context
// that names the test, so register.mjs can attribute what happens during it.
import * as real from 'node:test';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const g = /** @type {any} */ (globalThis);
const from = new URL(import.meta.url).searchParams.get('from') || '';
const file = from ? relative(process.cwd(), fileURLToPath(from)).split('\\').join('/') : '(unknown file)';

/**
 * Wrap a test body so it runs with the test's name in the async context (keeping its arity: node:test tells
 * callback-style tests by the function's length).
 * @param {Function} fn
 * @param {string} name
 */
function body(fn, name) {
  const run = (/** @type {any} */ self, /** @type {any[]} */ args) => {
    g.__coverageTestStarted?.(`${file} › ${name}`);
    const ctx = args[0] && typeof args[0] === 'object' ? subtests(args[0], name) : args[0];
    const call = () => fn.apply(self, [ctx, ...args.slice(1)]);
    return g.__coverageAls ? g.__coverageAls.run({ file, name }, call) : call();
  };
  return fn.length >= 2
    ? /** @this {any} */ function (/** @type {any} */ t, /** @type {any} */ done) {
        return run(this, [t, done]);
      }
    : /** @this {any} */ function (/** @type {any} */ t) {
        return run(this, [t]);
      };
}

/** A test context whose t.test() names its subtests "parent › child". @param {any} t @param {string} parent */
function subtests(t, parent) {
  return new Proxy(t, {
    get(target, prop) {
      // getters such as t.mock read private fields: they must see the real context as `this`
      const v = Reflect.get(target, prop, target);
      if (prop !== 'test' || typeof v !== 'function') return typeof v === 'function' ? v.bind(target) : v;
      return (/** @type {any[]} */ ...args) => v.apply(target, rewrite(args, parent));
    },
  });
}

/** @param {any[]} args  test(name?, options?, fn?) @param {string} [parent] */
function rewrite(args, parent) {
  const i = args.findLastIndex((a) => typeof a === 'function');
  if (i < 0) return args;
  const fn = args[i];
  const own = typeof args[0] === 'string' ? args[0] : fn.name || '<anonymous>';
  const name = parent ? `${parent} › ${own}` : own;
  const out = [...args];
  out[i] = body(fn, name);
  return out;
}

/** @param {Function} orig */
function wrapTest(orig) {
  const f = (/** @type {any[]} */ ...args) => orig(...rewrite(args));
  for (const k of ['skip', 'todo', 'only']) if (typeof (/** @type {any} */ (orig)[k]) === 'function') /** @type {any} */ (f)[k] = (/** @type {any[]} */ ...args) => /** @type {any} */ (orig)[k](...rewrite(args));
  return f;
}

/** describe / suite: names of the suite prefix the tests inside. @param {Function} orig */
function wrapSuite(orig) {
  return (/** @type {any[]} */ ...args) => orig(...args);
}

export const test = Object.assign(wrapTest(real.test), { describe: wrapSuite(real.describe), it: wrapTest(real.it), suite: wrapSuite(real.suite), before: real.before, after: real.after, beforeEach: real.beforeEach, afterEach: real.afterEach, mock: real.mock });
export const it = wrapTest(real.it);
export const describe = wrapSuite(real.describe);
export const suite = wrapSuite(real.suite);
export const { before, after, beforeEach, afterEach, mock, run } = real;
export default test;
