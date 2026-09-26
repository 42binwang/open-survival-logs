// @ts-check
// Static extraction of key accesses from one module: counters, story tags, flags, bus events and storage keys.
// Works on the token stream of lexer.mjs with scope-aware bindings, so aliases such as
// `const c = state.progress.counters`, value aliases such as `const list = (state.run.x ||= [])`, loops over
// literal key lists and local string constants resolve to concrete keys. Keys built from templates come out as
// patterns with HOLE in place of each `${…}` (`clue.${line}` → 'clue.\u0001').
import { tokenize } from './lexer.mjs';

/** @typedef {import('./lexer.mjs').Token} Token */
/** @typedef {import('./lexer.mjs').Comment} Comment */

/** Stands for one unknown part of a key built from a template. */
export const HOLE = '\u0001';
const HOLES = new RegExp(`${HOLE}+`, 'g');

/**
 * @typedef {'read' | 'write'} Mode
 * @typedef {{ ns: string, key: string, mode: Mode, file: string, line: number, via: string, at: number }} Access
 * @typedef {{ ns: string, mode: Mode, file: string, line: number, via: string, expr: string, fn: string, at: number }} DynamicAccess
 * @typedef {{ ns: string, file: string, line: number, fn: string, expr: string }} ContainerUse
 *
 * @typedef {object} NamespaceRule A map-like object in the game state (or the bus / storage).
 * @property {string} ns
 * @property {string[]} [suffix] any member chain ending in these properties (`x.progress.counters`)
 * @property {string} [root] chains that start at this root object, then
 * @property {string[]} [prefix] these properties (`state.run`)
 * @property {string[]} [files] only in these files (a trailing `/` matches a directory)
 *
 * @typedef {object} CallRule `fn(…)` or `object.method(…)` whose argument `arg` is a key of `ns`.
 * @property {string} [fn]
 * @property {string} [method]
 * @property {string} [object] receiver name for `method`
 * @property {number} arg
 * @property {string} ns
 * @property {Mode} mode
 * @property {'value' | 'keys'} [take] 'keys': the argument is an object literal whose property names are keys
 * @property {string[]} [files]
 *
 * @typedef {object} FieldRule `field: value` in object literals: the value is a key, a list of keys, or (take 'keys') an object keyed by key.
 * @property {string} field
 * @property {string} ns
 * @property {Mode} mode
 * @property {'value' | 'keys'} [take]
 * @property {RegExp} [match] only values matching this
 * @property {string[]} [files]
 *
 * @typedef {object} ConstRule A module constant that lists keys.
 * @property {string} file
 * @property {string} name
 * @property {string} ns
 * @property {Mode} mode
 * @property {'elements' | 'keys'} [take] array elements (default) or object property names
 * @property {number} [index] element[index] of an array of tuples
 *
 * @typedef {object} ReturnsRule A function whose result is a key built from `pattern` (`${…}` marks unknown parts), or
 *   the state object at `path` (`'state.story'` for `ensureStory(state)`).
 * @property {string} fn
 * @property {string} [pattern]
 * @property {string} [path]
 * @property {string[]} [files]
 *
 * @typedef {object} LiteralRule An object literal whose property names are keys of `ns` being written.
 * @property {string} file
 * @property {string} ns
 * @property {string} [fn] the literal returned by this function, or passed to `call` inside it
 * @property {string} [call]
 * @property {string} [name] the initialiser of this module constant
 *
 * @typedef {object} DynamicRule A reviewed site that uses computed keys of `ns` inside function `fn` (`*`: any).
 * @property {string} file
 * @property {string} fn
 * @property {string} ns
 * @property {string} reason
 *
 * @typedef {object} DisplayRule A screen that lists every key of `ns` (`Object.entries(state.progress.counters)`) and
 *   names them from the key-list constant `labels`. A labelled key is read there (a ConstRule); a key that is only
 *   written is still shown, under its raw name, so the audit reports it as `unlabelled` rather than unconsumed.
 * @property {string} ns
 * @property {string[]} sites modules whose enumeration of `ns` displays the keys
 * @property {string} labels where the labels live, for the message (`src/sim/settlement.js COUNTER_LABELS`)
 *
 * @typedef {object} Rules
 * @property {NamespaceRule[]} namespaces
 * @property {DisplayRule[]} [displays]
 * @property {Record<string, string>} roots identifier → root object ('state', 'history', 'settings', 'game'), for any
 *   binding that is not an alias of another state path
 * @property {Record<string, string>} [paramRoots] the same for parameters only
 * @property {Array<{ files: string[], names: Record<string, string> }>} [fileRoots] per-file roots (any binding)
 * @property {CallRule[]} [calls]
 * @property {FieldRule[]} [fields]
 * @property {ConstRule[]} [consts]
 * @property {ReturnsRule[]} [returns]
 * @property {LiteralRule[]} [literals]
 * @property {DynamicRule[]} [dynamic]
 * @property {string[]} [skip] path prefixes that are not scanned
 * @property {Array<(tree: SourceTree) => Access[]>} [extract] custom extractors
 *
 * @typedef {{ files: Map<string, string>, module: (file: string) => Module | null }} SourceTree
 *
 * @typedef {{ values: string[], dynamic: boolean }} KeyVal
 * @typedef {{ root: string | null, props: string[] }} Path
 * @typedef {{ name: string, idx: number, prop?: string, index?: number, nested?: boolean, inner?: number, innerProp?: string }} PatternName
 * @typedef {object} Binding
 * @property {string} name
 * @property {number} from
 * @property {number} to
 * @property {'const' | 'param' | 'fn'} kind
 * @property {number} decl
 * @property {[number, number]} [init]
 * @property {string} [prop] destructured property of the initialiser
 * @property {number} [index] destructured element of the initialiser
 * @property {boolean} [nested]
 * @property {[number, number]} [elemOf] loop / callback variable over the elements of this expression
 * @property {number} [elemIndex]
 * @property {string} [elemProp]
 * @property {string[]} [params]
 * @property {[number, number]} [body]
 */

const ASSIGN = new Set(['=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=', '&=', '|=', '^=', '&&=', '||=', '??=']);
const MUTATORS = new Set(['push', 'unshift', 'splice', 'pop', 'shift', 'sort', 'reverse', 'fill', 'copyWithin', 'set', 'add', 'delete', 'clear']);
const ARRAY_CALLBACKS = new Set(['map', 'forEach', 'filter', 'some', 'every', 'find', 'findIndex', 'findLast', 'findLastIndex', 'flatMap']);
const NOT_METHOD = new Set(['if', 'for', 'while', 'switch', 'catch', 'with', 'function', 'return', 'typeof', 'await', 'yield', 'new', 'delete', 'void', 'throw', 'case', 'in', 'of', 'instanceof']);
const NON_REFERENCE = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'with', 'function', 'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete',
  'void', 'throw', 'case', 'do', 'else', 'yield', 'await', 'const', 'let', 'var', 'class', 'extends', 'import', 'export',
  'from', 'default', 'try', 'finally', 'break', 'continue', 'this', 'super', 'null', 'undefined', 'true', 'false', 'async', 'static',
]);
// Tokens after which `{` opens an object literal rather than a block.
const OBJECT_AFTER = new Set(['=', '(', ',', ':', '[', '?', '||', '??', '&&', '...', '+', '-', '!', '||=', '??=', '&&=', '+=', '<', '>', '==', '===', '!=', '!==']);
const NOT_A_KEY = new Set(['===', '!==', '==', '!=', '<', '>', '<=', '>=', '-', '*', '/', '%', '**', '&', '|', '^', '<<', '>>', '>>>', '=>', '=', '!', '~']);
/** @type {Record<string, (s: string) => string>} */
const TRANSFORMS = {
  toUpperCase: (/** @type {string} */ s) => s.toUpperCase(),
  toLowerCase: (/** @type {string} */ s) => s.toLowerCase(),
  trim: (/** @type {string} */ s) => s.trim(),
  toString: (/** @type {string} */ s) => s,
};
const MAX_VALUES = 64;

/** @param {Token | undefined} t @param {string} v */
const P = (t, v) => !!t && t.type === 'punct' && t.value === v;
/** @param {Token | undefined} t */
const isOpen = (t) => !!t && ((t.type === 'punct' && (t.value === '(' || t.value === '[' || t.value === '{')) || t.type === 'texpr' || t.type === 'tstart');
/** @param {Token | undefined} t */
const isClose = (t) => !!t && ((t.type === 'punct' && (t.value === ')' || t.value === ']' || t.value === '}')) || t.type === 'texprEnd' || t.type === 'tend');
/** @param {Token | undefined} t @param {string} [v] */
const N = (t, v) => !!t && t.type === 'name' && (v == null || t.value === v);
/** @param {Token | undefined} t */
const isDot = (t) => P(t, '.') || P(t, '?.');

/** @param {string} file @param {string[] | undefined} files */
export const appliesTo = (file, files) => !files || files.some((f) => (f.endsWith('/') ? file.startsWith(f) : file === f));

/** Converts a key with `${…}` placeholders into the HOLE form. @param {string} key */
export const toPattern = (key) => key.replace(/\$\{[^}]*\}/g, HOLE).replace(HOLES, HOLE);

/** @param {string} key */
export const showKey = (key) => key.replace(HOLES, '${…}');

/** @param {string[]} a @param {string[]} b */
function product(a, b) {
  const out = new Set();
  for (const x of a) for (const y of b) out.add((x + y).replace(HOLES, HOLE));
  return [...out];
}

/** Values of a key used inside a larger string: an unknown part becomes a HOLE. @param {KeyVal} v */
const parts = (v) => (v.dynamic || !v.values.length ? [...v.values, HOLE] : v.values);

/** @param {KeyVal} a @param {KeyVal} b @returns {KeyVal} */
const union = (a, b) => ({ values: [...new Set([...a.values, ...b.values])], dynamic: a.dynamic || b.dynamic });

/** @type {KeyVal} */
const DYN = Object.freeze({ values: [], dynamic: true });
/** @type {KeyVal} */
const NONE = Object.freeze({ values: [], dynamic: false });

// ------------------------------------------------------------------------------------------------ module

export class Module {
  /**
   * @param {string} file repo-relative path
   * @param {string} src
   * @param {Rules} rules
   */
  constructor(file, src, rules) {
    this.file = file;
    this.rules = rules;
    const { tokens, comments } = tokenize(src);
    /** @type {Token[]} */
    this.tokens = tokens;
    /** @type {Comment[]} */
    this.comments = comments;
    this.match = new Int32Array(tokens.length).fill(-1);
    this.parent = new Int32Array(tokens.length).fill(-1);
    /** @type {Map<string, Binding[]>} */
    this.byName = new Map();
    /** @type {Set<number>} token indices of declared names */
    this.declNames = new Set();
    /** @type {Array<{ from: number, to: number, name: string }>} */
    this.fns = [];
    /** @type {Map<number, string>} start of a function expression → the name it is assigned to */
    this.fnNames = new Map();
    /** @type {Record<string, string>} */
    this.roots = { ...rules.roots };
    for (const fr of rules.fileRoots || []) if (appliesTo(file, fr.files)) Object.assign(this.roots, fr.names);
    /** @type {Record<string, string>} */
    this.paramRoots = { ...(rules.paramRoots || {}), ...this.roots };
    /** @type {Map<Binding, Path | null>} */
    this.callPaths = new Map();
    this.indexBrackets();
    this.collectBindings();
  }

  indexBrackets() {
    const { tokens, match, parent } = this;
    /** @type {number[]} */
    const stack = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      parent[i] = stack.length ? stack[stack.length - 1] : -1;
      if (isOpen(t)) stack.push(i);
      else if (isClose(t)) {
        const o = stack.pop();
        if (o != null) {
          match[o] = i;
          match[i] = o;
        }
        parent[i] = stack.length ? stack[stack.length - 1] : -1;
      }
    }
  }

  /** @param {number} i */
  line(i) {
    return this.tokens[Math.max(0, Math.min(i, this.tokens.length - 1))]?.line ?? 0;
  }

  /** Source-like text of tokens [from, to). @param {number} from @param {number} to */
  text(from, to) {
    let out = '';
    for (let i = from; i < to && i < this.tokens.length; i++) {
      const t = this.tokens[i];
      if (t.type === 'string') out += `'${t.value}'`;
      else if (t.type === 'punct' && [',', '?', ':', '||', '??', '&&', '+', '===', '!==', '=', '=>'].includes(t.value)) out += `${t.value === ',' ? '' : ' '}${t.value} `;
      else out += t.value;
    }
    return out.replace(/\s+/g, ' ').trim();
  }

  /** End (exclusive) of the expression starting at `from`: the first `,` `;` or unmatched closer. */
  /** @param {number} from @param {number} [limit] */
  exprEnd(from, limit = this.tokens.length) {
    const { tokens, match } = this;
    let i = from;
    while (i < limit) {
      const t = tokens[i];
      if (isOpen(t)) {
        if (match[i] < 0) return limit;
        i = match[i] + 1;
        continue;
      }
      if (isClose(t)) return i;
      if (t.type === 'punct' && (t.value === ',' || t.value === ';')) return i;
      i++;
    }
    return limit;
  }

  /** Top-level comma-separated ranges inside the bracket pair at `open`. @param {number} open */
  splitArgs(open) {
    const close = this.match[open];
    /** @type {Array<[number, number]>} */
    const out = [];
    let i = open + 1;
    while (i < close) {
      const end = this.exprEnd(i, close);
      if (end > i) out.push([i, end]);
      i = end + 1;
    }
    return out;
  }

  /** First token in [from, to) at bracket depth 0 that satisfies `pred`, else -1. */
  /** @param {number} from @param {number} to @param {(t: Token) => boolean} pred */
  findTop(from, to, pred) {
    const { tokens, match } = this;
    for (let i = from; i < to; i++) {
      const t = tokens[i];
      if (isOpen(t)) {
        i = match[i];
        if (i < 0) return -1;
        continue;
      }
      if (pred(t)) return i;
    }
    return -1;
  }

  /** Splits [from, to) at depth-0 tokens that satisfy `pred`. @param {number} from @param {number} to @param {(t: Token) => boolean} pred */
  splitTop(from, to, pred) {
    /** @type {Array<[number, number]>} */
    const out = [];
    let s = from;
    for (;;) {
      const k = this.findTop(s, to, pred);
      if (k < 0) break;
      out.push([s, k]);
      s = k + 1;
    }
    out.push([s, to]);
    return out;
  }

  /** Is the token at `i` directly inside an object literal (not a block)? @param {number} i */
  inObjectLiteral(i) {
    const p = this.parent[i];
    return p >= 0 && P(this.tokens[p], '{') && this.isObjectBrace(p);
  }

  /** @param {number} open index of a `{` */
  isObjectBrace(open) {
    const before = this.tokens[open - 1];
    if (!before) return false;
    if (before.type === 'punct') return OBJECT_AFTER.has(before.value);
    if (before.type === 'name') return before.value === 'return' || before.value === 'yield' || before.value === 'await' || before.value === 'typeof';
    return before.type === 'texpr';
  }

  // -------------------------------------------------------------------------------------------- bindings

  /** @param {Binding} b */
  addBinding(b) {
    let list = this.byName.get(b.name);
    if (!list) this.byName.set(b.name, (list = []));
    list.push(b);
    this.declNames.add(b.decl);
  }

  /** Innermost binding of `name` visible at token `at`. @param {string} name @param {number} at */
  lookup(name, at) {
    const list = this.byName.get(name);
    /** @type {Binding | null} */
    let best = null;
    if (list) for (const b of list) if (b.from <= at && at <= b.to && (!best || b.from >= best.from)) best = b;
    return best;
  }

  /** Range in which a declaration at token `i` is visible. @param {number} i @returns {[number, number]} */
  declScope(i) {
    const { tokens, match, parent } = this;
    let p = parent[i];
    while (p >= 0) {
      if (P(tokens[p], '(') && N(tokens[p - 1], 'for')) {
        const body = match[p] + 1;
        return [p, P(tokens[body], '{') ? match[body] : this.exprEnd(body)];
      }
      if (P(tokens[p], '{')) return [p, match[p]];
      p = parent[p];
    }
    return [0, tokens.length];
  }

  /**
   * Binding names of the destructuring pattern or parameter list at `open`.
   * @param {number} open
   * @returns {PatternName[]}
   */
  patternNames(open) {
    const { tokens, match } = this;
    const close = match[open];
    const isObj = P(tokens[open], '{');
    /** @type {PatternName[]} */
    const out = [];
    let index = 0;
    let j = open + 1;
    while (j < close) {
      const end = this.exprEnd(j, close);
      let k = j;
      if (P(tokens[k], '...')) k++;
      const t = tokens[k];
      if (isObj) {
        if ((t?.type === 'name' || t?.type === 'string') && P(tokens[k + 1], ':')) {
          const target = k + 2;
          if (N(tokens[target])) out.push({ name: tokens[target].value, idx: target, prop: t.value });
          else if (P(tokens[target], '{') || P(tokens[target], '[')) for (const nm of this.patternNames(target)) out.push({ name: nm.name, idx: nm.idx, nested: true });
        } else if (N(t)) out.push({ name: t.value, idx: k, prop: t.value });
      } else if (N(t)) out.push({ name: t.value, idx: k, index });
      else if (P(t, '{') || P(t, '[')) for (const nm of this.patternNames(k)) out.push({ name: nm.name, idx: nm.idx, index, nested: true, inner: nm.nested ? undefined : nm.index, innerProp: nm.nested ? undefined : nm.prop });
      index++;
      j = end + 1;
    }
    return out;
  }

  collectBindings() {
    const { tokens, match } = this;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type === 'name') {
        if (isDot(tokens[i - 1])) continue;
        if (t.value === 'const' || t.value === 'let' || t.value === 'var') this.declaration(i);
        else if (t.value === 'function') this.functionDecl(i);
        else if (t.value === 'catch' && P(tokens[i + 1], '(')) {
          const body = match[i + 1] + 1;
          if (P(tokens[body], '{')) this.params(i + 1, [i + 1, match[body]]);
        } else if (P(tokens[i + 1], '(') && !NOT_METHOD.has(t.value) && !NON_REFERENCE.has(t.value)) {
          const body = match[i + 1] + 1;
          if (body > 0 && P(tokens[body], '{') && !this.isObjectBrace(body)) {
            this.params(i + 1, [i + 1, match[body]]);
            this.fns.push({ from: i, to: match[body], name: t.value });
          }
        }
      } else if (P(t, '=>')) this.arrow(i);
    }
  }

  /** @param {number} open parameter list `(` @param {[number, number]} range @param {[number, number]} [elemOf] */
  params(open, range, elemOf) {
    const names = this.patternNames(open);
    for (const nm of names) {
      /** @type {Binding} */
      const b = { name: nm.name, from: range[0], to: range[1], kind: 'param', decl: nm.idx };
      if (elemOf && nm.index === 0) {
        if (!nm.nested) b.elemOf = elemOf;
        else if (nm.inner != null) Object.assign(b, { elemOf, elemIndex: nm.inner });
        else if (nm.innerProp != null) Object.assign(b, { elemOf, elemProp: nm.innerProp });
      }
      this.addBinding(b);
    }
    return names.filter((n) => !n.nested).map((n) => n.name);
  }

  /** @param {number} i index of const/let/var */
  declaration(i) {
    const { tokens, match } = this;
    const scope = this.declScope(i);
    const forHead = P(tokens[this.parent[i]], '(') && N(tokens[this.parent[i] - 1], 'for') ? this.parent[i] : -1;
    let j = i + 1;
    while (j < tokens.length) {
      const t = tokens[j];
      if (N(t)) {
        const decl = j;
        j++;
        if (P(tokens[j], '=')) {
          const s = j + 1;
          const e = this.exprEnd(s);
          this.addBinding({ name: t.value, from: scope[0], to: scope[1], kind: 'const', init: [s, e], decl });
          this.fnNames.set(N(tokens[s], 'async') ? s + 1 : s, t.value);
          j = e;
        } else if (forHead >= 0 && N(tokens[j], 'of')) {
          this.addBinding({ name: t.value, from: scope[0], to: scope[1], kind: 'param', decl, elemOf: [j + 1, match[forHead]] });
          return;
        } else this.addBinding({ name: t.value, from: scope[0], to: scope[1], kind: 'param', decl });
      } else if (P(t, '{') || P(t, '[')) {
        const close = match[j];
        const names = this.patternNames(j);
        const isArr = P(t, '[');
        /** @type {[number, number] | undefined} */
        let init;
        /** @type {[number, number] | undefined} */
        let elemOf;
        if (P(tokens[close + 1], '=')) {
          const s = close + 2;
          init = [s, this.exprEnd(s)];
        } else if (forHead >= 0 && N(tokens[close + 1], 'of')) elemOf = [close + 2, match[forHead]];
        for (const nm of names) {
          /** @type {Binding} */
          const b = { name: nm.name, from: scope[0], to: scope[1], kind: init ? 'const' : 'param', decl: nm.idx, nested: nm.nested };
          if (init) Object.assign(b, { init }, nm.nested ? {} : isArr ? { index: nm.index } : { prop: nm.prop });
          if (elemOf && !nm.nested) Object.assign(b, { elemOf }, isArr ? { elemIndex: nm.index } : { elemProp: nm.prop });
          this.addBinding(b);
        }
        if (elemOf) return;
        j = init ? init[1] : close + 1;
      } else return;
      if (!P(tokens[j], ',')) return;
      j++;
    }
  }

  /** @param {number} i index of `function` */
  functionDecl(i) {
    const { tokens, match } = this;
    let j = i + 1;
    if (P(tokens[j], '*')) j++;
    let name = null;
    if (N(tokens[j]) && P(tokens[j + 1], '(')) {
      name = tokens[j].value;
      j++;
    }
    if (!P(tokens[j], '(')) return;
    const body = match[j] + 1;
    if (!P(tokens[body], '{')) return;
    const end = match[body];
    const params = this.params(j, [j, end]);
    const start = N(tokens[i - 1], 'async') ? i - 1 : i;
    this.fns.push({ from: i, to: end, name: name || this.fnNames.get(start) || this.fnNames.get(i) || this.propertyName(start) || '' });
    if (name) {
      const scope = this.declScope(i);
      this.addBinding({ name, from: scope[0], to: scope[1], kind: 'fn', decl: i + (P(tokens[i + 1], '*') ? 2 : 1), params, body: [body, end] });
    }
  }

  /** `name: function …` / `name: (…) =>` → name. @param {number} start */
  propertyName(start) {
    const { tokens } = this;
    if (P(tokens[start - 1], ':') && (N(tokens[start - 2]) || tokens[start - 2]?.type === 'string') && this.inObjectLiteral(start - 2)) return tokens[start - 2].value;
    return null;
  }

  /** @param {number} a index of `=>` */
  arrow(a) {
    const { tokens, match } = this;
    let pStart;
    if (P(tokens[a - 1], ')')) pStart = match[a - 1];
    else if (N(tokens[a - 1])) pStart = a - 1;
    else return;
    const body = a + 1;
    const end = P(tokens[body], '{') ? match[body] : this.exprEnd(body);
    // array callbacks: `list.map((k) => …)` binds k to the elements of `list`
    /** @type {[number, number] | undefined} */
    let elemOf;
    const call = pStart - 1;
    if (P(tokens[call], '(') && N(tokens[call - 1]) && ARRAY_CALLBACKS.has(tokens[call - 1].value) && isDot(tokens[call - 2])) {
      const recvStart = this.chainStart(call - 3);
      if (recvStart >= 0) elemOf = [recvStart, call - 2];
    }
    if (P(tokens[pStart], '(')) this.params(pStart, [pStart, end], elemOf);
    else {
      /** @type {Binding} */
      const b = { name: tokens[pStart].value, from: pStart, to: end, kind: 'param', decl: pStart };
      if (elemOf) b.elemOf = elemOf;
      this.addBinding(b);
    }
    const start = N(tokens[pStart - 1], 'async') ? pStart - 1 : pStart;
    this.fns.push({ from: pStart, to: end, name: this.fnNames.get(start) || this.propertyName(start) || this.calleeLabel(start) || '' });
  }

  /** `on('x', (p) => …)` → 'on:x'. @param {number} start */
  calleeLabel(start) {
    const { tokens } = this;
    const p = this.parent[start];
    if (p < 0 || !P(tokens[p], '(') || !N(tokens[p - 1])) return null;
    const first = tokens[p + 1];
    return first?.type === 'string' ? `${tokens[p - 1].value}:${first.value}` : null;
  }

  /** Start index of the member chain / primary expression that ends at token `end`. @param {number} end */
  chainStart(end) {
    const { tokens, match } = this;
    let i = end;
    for (;;) {
      const t = tokens[i];
      if (!t) return -1;
      if (P(t, ']') || P(t, ')')) {
        const o = match[i];
        if (o < 0) return -1;
        const before = tokens[o - 1];
        const attached = N(before) || P(before, ']') || P(before, ')') || isDot(before);
        if (!attached) return o;
        i = isDot(before) ? o - 2 : o - 1;
        continue;
      }
      if (N(t)) {
        if (isDot(tokens[i - 1])) {
          i -= 2;
          continue;
        }
        return i;
      }
      return -1;
    }
  }

  /** Name of the innermost named function around token `i`. @param {number} i */
  fnAt(i) {
    /** @type {{ from: number, to: number, name: string } | null} */
    let best = null;
    for (const f of this.fns) if (f.name && f.from <= i && i <= f.to && (!best || f.from >= best.from)) best = f;
    return best ? best.name : '<module>';
  }

  // -------------------------------------------------------------------------------------------- paths

  /** @param {string} name @param {boolean} [param] @returns {Path | null} */
  rootOf(name, param = false) {
    const r = param ? this.paramRoots[name] : this.roots[name];
    return r ? { root: r, props: [] } : null;
  }

  /** @param {Path} p @returns {Path} */
  normalize(p) {
    if (p.root === 'game' && (p.props[0] === 'state' || p.props[0] === 'history' || p.props[0] === 'settings')) return { root: p.props[0], props: p.props.slice(1) };
    return p;
  }

  /** Path an identifier stands for at token `at` (root objects, aliases of state paths), else null. */
  /** @param {string} name @param {number} at @param {number} [depth] @returns {Path | null} */
  resolveIdent(name, at, depth = 0) {
    const b = this.lookup(name, at);
    if (!b) return this.rootOf(name);
    if (b.kind === 'fn' || b.elemOf) return null;
    if (b.kind === 'param') return this.rootOf(name, true);
    if (b.init && depth < 8 && !b.nested && b.index == null) {
      const p = this.pathOfExpr(b.init[0], b.init[1], depth + 1);
      if (p) return b.prop != null ? { root: p.root, props: [...p.props, b.prop] } : p;
    }
    // `const state = startRun(opts)`, `const next = JSON.parse(snapshot)` (a file rule)
    return this.rootOf(name);
  }

  /** State object returned by `name(…)`: a ReturnsRule path, or a local function whose returns agree on one path. */
  /** @param {string} name @param {number} at @param {number} depth @returns {Path | null} */
  pathOfCall(name, at, depth) {
    for (const r of this.rules.returns || []) {
      if (r.fn === name && r.path && appliesTo(this.file, r.files)) {
        const [root, ...props] = r.path.split('.');
        return { root, props };
      }
    }
    const b = this.lookup(name, at);
    if (!b || depth > 6) return null;
    if (this.callPaths.has(b)) return this.callPaths.get(b) || null;
    this.callPaths.set(b, null);
    /** @type {Array<[number, number]>} */
    const rets = [];
    const { tokens, match } = this;
    if (b.kind === 'fn' && b.body) {
      const end = b.body[1];
      for (let k = b.body[0] + 1; k < end; k++) {
        if (!N(tokens[k], 'return')) continue;
        if (this.innermostFn(k)?.to !== end) continue;
        rets.push([k + 1, this.exprEnd(k + 1)]);
      }
    } else if (b.kind === 'const' && b.init) {
      let s = b.init[0];
      if (N(tokens[s], 'async')) s++;
      const arrowAt = P(tokens[s], '(') ? match[s] + 1 : s + 1;
      if (P(tokens[arrowAt], '=>')) {
        const body = arrowAt + 1;
        if (P(tokens[body], '{')) {
          for (let k = body + 1; k < match[body]; k++) if (N(tokens[k], 'return') && this.innermostFn(k)?.to === match[body]) rets.push([k + 1, this.exprEnd(k + 1)]);
        } else rets.push([body, this.exprEnd(body)]);
      }
    }
    /** @type {Path | null} */
    let out = null;
    for (const [s, e] of rets) {
      const p = this.pathOfExpr(s, e, depth + 1);
      if (!p || (out && (p.root !== out.root || p.props.join('.') !== out.props.join('.')))) {
        out = null;
        break;
      }
      out = p;
    }
    this.callPaths.set(b, out);
    return out;
  }

  /** Innermost function (named or not) around token `i`. @param {number} i */
  innermostFn(i) {
    /** @type {{ from: number, to: number, name: string } | null} */
    let best = null;
    for (const f of this.fns) if (f.from <= i && i <= f.to && (!best || f.from >= best.from)) best = f;
    return best;
  }

  /** Path of an initialiser such as `state.progress.counters`, `(state.story ||= {})`, `x.a || {}` or `social(state)`. */
  /** @param {number} from @param {number} to @param {number} depth @returns {Path | null} */
  pathOfExpr(from, to, depth) {
    const { tokens, match } = this;
    if (this.findTop(from, to, (t) => P(t, '=>')) >= 0) return null;
    let i = from;
    while (P(tokens[i], '(') && match[i] < to) i++;
    if (!N(tokens[i]) || NON_REFERENCE.has(tokens[i].value)) return null;
    /** @type {Path} */
    let path;
    let j = i + 1;
    if (P(tokens[j], '(')) {
      const p = this.pathOfCall(tokens[i].value, i, depth);
      if (!p) return null;
      path = p;
      j = match[j] + 1;
    } else path = this.resolveIdent(tokens[i].value, i, depth) || { root: null, props: [] };
    while (j < to) {
      const a = tokens[j];
      if (isDot(a) && N(tokens[j + 1])) {
        if (P(tokens[j + 2], '(')) return null;
        path = { root: path.root, props: [...path.props, tokens[j + 1].value] };
        j += 2;
        continue;
      }
      if (P(a, '[') || (P(a, '?.') && P(tokens[j + 1], '['))) {
        const o = P(a, '[') ? j : j + 1;
        const v = this.evalKey(o + 1, match[o], o + 1, depth + 1);
        if (v.dynamic || v.values.length !== 1 || v.values[0].includes(HOLE)) return null;
        path = { root: path.root, props: [...path.props, v.values[0]] };
        j = match[o] + 1;
        continue;
      }
      break;
    }
    const next = tokens[j];
    if (j < to && !(next.type === 'punct' && [')', '||', '??', '||=', '??=', '='].includes(next.value))) return null;
    if (!path.props.length && path.root == null) return null;
    return this.normalize(path);
  }

  /** Namespace whose container object is exactly `path`, else null. @param {Path} path */
  nsOfContainer(path) {
    for (const r of this.rules.namespaces) {
      if (!appliesTo(this.file, r.files)) continue;
      if (r.suffix) {
        const n = r.suffix.length;
        const props = path.props;
        if (props.length >= n && r.suffix.every((s, k) => props[props.length - n + k] === s)) return r.ns;
      } else if (r.root && path.root === r.root) {
        const pre = r.prefix || [];
        if (path.props.length === pre.length && pre.every((s, k) => path.props[k] === s)) return r.ns;
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------------------------- evaluation

  /**
   * Possible string values of the expression in tokens [from, to).
   * @param {number} from @param {number} to @param {number} [at] position for binding lookup
   * @param {number} [depth] @param {Map<string, KeyVal> | null} [env] parameter overrides
   * @returns {KeyVal}
   */
  evalKey(from, to, at = from, depth = 0, env = null) {
    const { tokens, match } = this;
    if (depth > 12 || from >= to) return DYN;
    while (P(tokens[from], '(') && match[from] === to - 1) {
      from++;
      to--;
    }
    const q = this.findTop(from, to, (t) => P(t, '?'));
    if (q >= 0) {
      let depthQ = 0;
      let colon = -1;
      for (let k = q + 1; k < to; k++) {
        const t = tokens[k];
        if (isOpen(t)) {
          k = match[k];
          continue;
        }
        if (P(t, '?')) depthQ++;
        else if (P(t, ':')) {
          if (depthQ === 0) {
            colon = k;
            break;
          }
          depthQ--;
        }
      }
      if (colon < 0) return DYN;
      return cap(union(this.evalKey(q + 1, colon, at, depth + 1, env), this.evalKey(colon + 1, to, at, depth + 1, env)));
    }
    const ors = this.splitTop(from, to, (t) => P(t, '||') || P(t, '??') || P(t, '&&'));
    if (ors.length > 1) return cap(ors.reduce((acc, [s, e]) => union(acc, this.evalKey(s, e, at, depth + 1, env)), NONE));
    if (this.findTop(from, to, (t) => (t.type === 'punct' && NOT_A_KEY.has(t.value)) || N(t, 'instanceof') || N(t, 'in') || N(t, 'typeof')) >= 0) return DYN;
    const plus = this.splitTop(from, to, (t) => P(t, '+'));
    if (plus.length > 1) {
      let acc = [''];
      for (const [s, e] of plus) acc = product(acc, parts(this.evalKey(s, e, at, depth + 1, env)));
      return cap({ values: acc, dynamic: false });
    }
    return cap(this.evalPrimary(from, to, depth, env));
  }

  /** @param {number} from @param {number} to @param {number} depth @param {Map<string, KeyVal> | null} env @returns {KeyVal} */
  evalPrimary(from, to, depth, env) {
    const { tokens, match } = this;
    const t = tokens[from];
    /** @type {KeyVal} */
    let v;
    let i;
    if (t.type === 'string') {
      v = { values: [t.value], dynamic: false };
      i = from + 1;
    } else if (t.type === 'number') {
      v = { values: [String(Number(t.value.replace(/_/g, '')))], dynamic: false };
      i = from + 1;
    } else if (t.type === 'tstart') {
      const end = match[from];
      let acc = [''];
      for (let j = from + 1; j < end; j++) {
        const u = tokens[j];
        if (u.type === 'tchunk') acc = product(acc, [u.value]);
        else if (u.type === 'texpr') {
          acc = product(acc, parts(this.evalKey(j + 1, match[j], j + 1, depth + 1, env)));
          j = match[j];
        }
        if (acc.length > MAX_VALUES) return DYN;
      }
      v = { values: acc, dynamic: false };
      i = end + 1;
    } else if (P(t, '(')) {
      v = this.evalKey(from + 1, match[from], from + 1, depth + 1, env);
      i = match[from] + 1;
    } else if (N(t, 'null') || N(t, 'undefined') || N(t, 'false')) {
      // `cond ? 'key' : null` names no key on that branch
      v = NONE;
      i = from + 1;
    } else if (N(t) && !NON_REFERENCE.has(t.value)) {
      let j = from + 1;
      /** @type {string[]} */
      const props = [];
      while (j < to && isDot(tokens[j]) && N(tokens[j + 1]) && !P(tokens[j + 2], '(')) {
        props.push(tokens[j + 1].value);
        j += 2;
      }
      if (j < to && P(tokens[j], '(') && !props.length) {
        v = this.callValue(t.value, j, from, depth, env);
        i = match[j] + 1;
      } else {
        v = props.length ? this.memberValue(t.value, props, from, depth) : this.identValue(t.value, from, depth, env);
        i = j;
      }
    } else return DYN;
    while (i < to && isDot(tokens[i]) && N(tokens[i + 1]) && TRANSFORMS[tokens[i + 1].value] && P(tokens[i + 2], '(') && match[i + 2] === i + 3) {
      const f = TRANSFORMS[tokens[i + 1].value];
      v = { values: v.values.map((s) => s.split(HOLE).map(f).join(HOLE)), dynamic: v.dynamic };
      i += 4;
    }
    return i < to ? DYN : v;
  }

  /** @param {string} id @param {number} at @param {number} depth @param {Map<string, KeyVal> | null} env @returns {KeyVal} */
  identValue(id, at, depth, env) {
    const hit = env?.get(id);
    if (hit) return hit;
    const b = this.lookup(id, at);
    if (!b) return DYN;
    if (b.kind === 'const' && b.init) {
      if (b.nested) return DYN;
      if (b.prop != null) {
        const obj = this.objectOf(b.init[0], b.init[1], depth + 1);
        const r = obj >= 0 ? this.property(obj, b.prop) : null;
        return r ? this.evalKey(r[0], r[1], r[0], depth + 1) : DYN;
      }
      if (b.index != null) {
        const r = this.elements(b.init[0], b.init[1], depth + 1).ranges[b.index];
        return r ? this.evalKey(r[0], r[1], r[0], depth + 1) : DYN;
      }
      return this.evalKey(b.init[0], b.init[1], b.init[0], depth + 1);
    }
    if (b.elemOf) {
      const el = this.elements(b.elemOf[0], b.elemOf[1], depth + 1, b.elemIndex, b.elemProp);
      return { values: el.values, dynamic: el.dynamic };
    }
    return DYN;
  }

  /** `X.a.b` where X is an object constant or an element of a list of objects. */
  /** @param {string} id @param {string[]} props @param {number} at @param {number} depth @returns {KeyVal} */
  memberValue(id, props, at, depth) {
    const b = this.lookup(id, at);
    if (!b) return DYN;
    /** @type {number[]} */
    let objs = [];
    if (b.kind === 'const' && b.init && b.prop == null && b.index == null && !b.nested) {
      const o = this.objectOf(b.init[0], b.init[1], depth + 1);
      if (o >= 0) objs = [o];
    } else if (b.elemOf && b.elemIndex == null && b.elemProp == null) {
      const el = this.elements(b.elemOf[0], b.elemOf[1], depth + 1);
      if (el.dynamic || !el.ranges.length) return DYN;
      objs = el.ranges.filter(([s]) => P(this.tokens[s], '{')).map(([s]) => s);
      if (objs.length !== el.ranges.length) return DYN;
    }
    if (!objs.length) return DYN;
    /** @type {KeyVal} */
    let out = NONE;
    for (const o of objs) {
      let cur = o;
      /** @type {[number, number] | null} */
      let range = null;
      for (let k = 0; k < props.length; k++) {
        range = this.property(cur, props[k]);
        if (!range) break;
        if (k < props.length - 1) {
          if (!P(this.tokens[range[0]], '{')) {
            range = null;
            break;
          }
          cur = range[0];
        }
      }
      if (range) out = union(out, this.evalKey(range[0], range[1], range[0], depth + 1));
    }
    return out;
  }

  /** `id(args)`: a ReturnsRule pattern or a local function returning a key expression (its parameters are unknown). */
  /** @param {string} id @param {number} open @param {number} at @param {number} depth @param {Map<string, KeyVal> | null} env @returns {KeyVal} */
  callValue(id, open, at, depth, env) {
    const { tokens, match } = this;
    if (id === 'String') return this.evalKey(open + 1, match[open], open + 1, depth + 1, env);
    for (const r of this.rules.returns || []) if (r.fn === id && r.pattern && appliesTo(this.file, r.files)) return { values: [toPattern(r.pattern)], dynamic: false };
    if (depth > 8) return DYN;
    const b = this.lookup(id, at);
    if (!b) return DYN;
    /** @type {string[]} */
    let params = [];
    /** @type {[number, number] | null} */
    let ret = null;
    if (b.kind === 'fn' && b.body && b.params) {
      params = b.params;
      ret = this.singleReturn(b.body[0]);
    } else if (b.kind === 'const' && b.init) {
      let s = b.init[0];
      if (N(tokens[s], 'async')) s++;
      let arrowAt = -1;
      if (P(tokens[s], '(') && P(tokens[match[s] + 1], '=>')) {
        params = this.patternNames(s).map((n) => n.name);
        arrowAt = match[s] + 1;
      } else if (N(tokens[s]) && P(tokens[s + 1], '=>')) {
        params = [tokens[s].value];
        arrowAt = s + 1;
      }
      if (arrowAt >= 0) {
        const body = arrowAt + 1;
        ret = P(tokens[body], '{') ? this.singleReturn(body) : [body, this.exprEnd(body)];
      }
    }
    if (!ret) return DYN;
    const v = this.evalKey(ret[0], ret[1], ret[0], depth + 1, new Map(params.map((p) => [p, DYN])));
    return v.values.length ? v : DYN;
  }

  /** Range of EXPR when the block at `open` is exactly `{ return EXPR; }`. @param {number} open @returns {[number, number] | null} */
  singleReturn(open) {
    const { tokens, match } = this;
    if (!N(tokens[open + 1], 'return')) return null;
    const s = open + 2;
    const e = this.exprEnd(s);
    const after = P(tokens[e], ';') ? e + 1 : e;
    return after === match[open] ? [s, e] : null;
  }

  /**
   * Elements of an array expression (optionally element[index] of tuples or element.prop of objects).
   * @param {number} from @param {number} to @param {number} [depth] @param {number} [index] @param {string} [prop]
   * @returns {KeyVal & { ranges: Array<[number, number]> }}
   */
  elements(from, to, depth = 0, index, prop) {
    const { tokens, match } = this;
    const none = { values: [], dynamic: true, ranges: [] };
    if (depth > 10 || from >= to) return none;
    while (P(tokens[from], '(') && match[from] === to - 1) {
      from++;
      to--;
    }
    const t = tokens[from];
    if (P(t, '[') && match[from] === to - 1) {
      /** @type {KeyVal & { ranges: Array<[number, number]> }} */
      const out = { values: [], dynamic: false, ranges: [] };
      for (const [s, e] of this.splitArgs(from)) {
        if (P(tokens[s], '...')) {
          const sub = this.elements(s + 1, e, depth + 1, index, prop);
          out.values.push(...sub.values);
          out.ranges.push(...sub.ranges);
          out.dynamic ||= sub.dynamic;
          continue;
        }
        /** @type {[number, number] | null} */
        let range = [s, e];
        if (index != null) range = P(tokens[s], '[') ? this.splitArgs(s)[index] || null : null;
        else if (prop != null) range = P(tokens[s], '{') ? this.property(s, prop) : null;
        if (!range) {
          out.dynamic = true;
          continue;
        }
        out.ranges.push(range);
        if (P(tokens[range[0]], '{') || P(tokens[range[0]], '[')) continue;
        const v = this.evalKey(range[0], range[1], range[0], depth + 1);
        out.values.push(...v.values);
        out.dynamic ||= v.dynamic;
      }
      out.values = [...new Set(out.values)];
      return out;
    }
    if (N(t) && to === from + 1) {
      const b = this.lookup(t.value, from);
      if (b?.kind === 'const' && b.init && b.prop == null && b.index == null && !b.nested) return this.elements(b.init[0], b.init[1], depth + 1, index, prop);
      return none;
    }
    if (N(t, 'Object') && isDot(tokens[from + 1]) && N(tokens[from + 2], 'keys') && P(tokens[from + 3], '(') && match[from + 3] === to - 1) {
      const obj = this.objectOf(from + 4, to - 1, depth + 1);
      if (obj < 0) return none;
      const keys = this.objectKeys(obj);
      return { values: keys.filter((k) => !k.dynamic).map((k) => k.key), dynamic: keys.some((k) => k.dynamic), ranges: [] };
    }
    return none;
  }

  /** Index of the `{` of the object literal an expression denotes (a literal or a constant), else -1. */
  /** @param {number} from @param {number} to @param {number} [depth] @returns {number} */
  objectOf(from, to, depth = 0) {
    const { tokens, match } = this;
    if (depth > 8) return -1;
    while (P(tokens[from], '(') && match[from] === to - 1) {
      from++;
      to--;
    }
    if (P(tokens[from], '{') && match[from] === to - 1) return from;
    if (N(tokens[from]) && to === from + 1) {
      const b = this.lookup(tokens[from].value, from);
      if (b?.kind === 'const' && b.init && b.prop == null && b.index == null && !b.nested) return this.objectOf(b.init[0], b.init[1], depth + 1);
    }
    return -1;
  }

  /** Property names of the object literal at `open`. @param {number} open */
  objectKeys(open) {
    const { tokens, match } = this;
    /** @type {Array<{ key: string, at: number, value: [number, number] | null, dynamic?: boolean }>} */
    const out = [];
    for (const [s, e] of this.splitArgs(open)) {
      const t = tokens[s];
      if (P(t, '...')) continue;
      let k = s;
      if ((N(t, 'get') || N(t, 'set') || N(t, 'async')) && N(tokens[s + 1]) && P(tokens[s + 2], '(')) k = s + 1;
      const u = tokens[k];
      if ((N(u) || u.type === 'string' || u.type === 'number') && P(tokens[k + 1], ':')) out.push({ key: u.value, at: k, value: [k + 2, e] });
      else if (N(u) && P(tokens[k + 1], '(')) out.push({ key: u.value, at: k, value: null });
      else if (N(u) && k + 1 === e) out.push({ key: u.value, at: k, value: [k, e] });
      else if (P(u, '[')) {
        const v = this.evalKey(k + 1, match[k], k + 1);
        const value = P(tokens[match[k] + 1], ':') ? /** @type {[number, number]} */ ([match[k] + 2, e]) : null;
        for (const key of v.values) out.push({ key, at: k, value });
        if (v.dynamic) out.push({ key: '', at: k, value: null, dynamic: true });
      }
    }
    return out;
  }

  /** Value range of property `prop` of the object literal at `open`. @param {number} open @param {string} prop */
  property(open, prop) {
    for (const k of this.objectKeys(open)) if (k.key === prop && k.value) return k.value;
    return null;
  }
}

/** @param {KeyVal} v */
const cap = (v) => (v.values.length > MAX_VALUES ? DYN : v);

// ------------------------------------------------------------------------------------------------ scanning

/** Short kind names accepted in `@keys` annotations. */
export const NS_ALIASES = /** @type {Record<string, string>} */ ({ event: 'bus', counter: 'counters', tag: 'tags', flag: 'story.flags' });

/**
 * Extracts every key access of one module.
 * @param {string} file @param {string} src @param {Rules} rules
 */
export function scanModule(file, src, rules) {
  const m = new Module(file, src, rules);
  const s = new Scanner(m);
  s.run();
  return { module: m, accesses: s.accesses, dynamic: s.dynamic, containers: s.containers, acks: s.acks };
}

class Scanner {
  /** @param {Module} m */
  constructor(m) {
    this.m = m;
    /** @type {Access[]} */
    this.accesses = [];
    /** @type {DynamicAccess[]} */
    this.dynamic = [];
    /** @type {ContainerUse[]} */
    this.containers = [];
    /** @type {Array<{ ns: string, key: string, from: number, to: number }>} read-modify-write ranges */
    this.rmw = [];
    /** @type {Array<{ line: number, ns: string, reason: string }>} `@keys dynamic` acknowledgements */
    this.acks = [];
    /** @type {Map<string, CallRule[]>} */
    this.fnRules = new Map();
    /** @type {Map<string, CallRule[]>} */
    this.methodRules = new Map();
    for (const r of m.rules.calls || []) {
      if (!appliesTo(m.file, r.files)) continue;
      const map = r.method ? this.methodRules : this.fnRules;
      const name = /** @type {string} */ (r.method || r.fn);
      map.set(name, [...(map.get(name) || []), r]);
    }
    /** @type {Map<string, FieldRule[]>} */
    this.fieldRules = new Map();
    for (const r of m.rules.fields || []) if (appliesTo(m.file, r.files)) this.fieldRules.set(r.field, [...(this.fieldRules.get(r.field) || []), r]);
  }

  run() {
    const { m } = this;
    for (let i = 0; i < m.tokens.length; i++) {
      const t = m.tokens[i];
      if (t.type === 'name') {
        this.visitCall(i);
        this.visitChain(i);
      }
      if (t.type === 'name' || t.type === 'string') this.visitField(i);
    }
    this.visitRootLiterals();
    this.visitConstRules();
    this.visitLiteralRules();
    this.visitAnnotations();
    this.dropReadModifyWrite();
  }

  /** @param {string} ns @param {KeyVal} v @param {Mode} mode @param {number} at @param {string} via @param {string} expr */
  record(ns, v, mode, at, via, expr) {
    const { m } = this;
    for (const key of v.values) this.accesses.push({ ns, key, mode, file: m.file, line: m.line(at), via, at });
    if (v.dynamic) this.dynamic.push({ ns, mode, file: m.file, line: m.line(at), via, expr, fn: m.fnAt(at), at });
  }

  // `fn('key')`, `obj.method('key')`
  /** @param {number} i */
  visitCall(i) {
    const { m } = this;
    const { tokens } = m;
    if (!P(tokens[i + 1], '(')) return;
    const prev = tokens[i - 1];
    const isMethod = isDot(prev);
    if (!isMethod && N(prev, 'function')) return;
    const name = tokens[i].value;
    const rules = isMethod ? this.methodRules.get(name) : this.fnRules.get(name);
    if (!rules) return;
    const close = m.match[i + 1];
    if (!isMethod && P(tokens[close + 1], '{') && !m.isObjectBrace(close + 1)) return; // a method definition
    const args = m.splitArgs(i + 1);
    for (const r of rules) {
      if (isMethod && r.object && !(N(tokens[i - 2], r.object) && !isDot(tokens[i - 3]))) continue;
      const arg = args[r.arg];
      if (!arg) continue;
      const via = `${isMethod ? `${r.object || ''}.` : ''}${name}()`;
      if (r.take === 'keys') {
        const obj = m.objectOf(arg[0], arg[1]);
        if (obj < 0) this.record(r.ns, DYN, r.mode, arg[0], via, m.text(arg[0], arg[1]));
        else for (const k of m.objectKeys(obj)) this.record(r.ns, k.dynamic ? DYN : { values: [k.key], dynamic: false }, r.mode, k.at, via, k.key);
        continue;
      }
      this.record(r.ns, m.evalKey(arg[0], arg[1], arg[0]), r.mode, arg[0], via, m.text(arg[0], arg[1]));
    }
  }

  // member chains on the state: `state.progress.counters['x']`, `c.x`, `st.tags[`TAG_${a}`]`, `list.push(…)`
  /** @param {number} i */
  visitChain(i) {
    const { m } = this;
    const { tokens, match } = m;
    const t = tokens[i];
    if (NON_REFERENCE.has(t.value)) return;
    const prev = tokens[i - 1];
    if (isDot(prev) || m.declNames.has(i)) return;
    if (P(tokens[i + 1], ':') && (P(prev, '{') || P(prev, ',')) && m.inObjectLiteral(i)) return;
    if (P(tokens[i + 1], '=>')) return;
    let j = i + 1;
    /** @type {Path} */
    let path;
    if (P(tokens[j], '(')) {
      // `ensureStory(state).tags.X`: calls that hand back a state object
      const p = m.pathOfCall(t.value, i, 0);
      if (!p) return;
      path = m.normalize(p);
      j = match[j] + 1;
    } else {
      path = m.normalize(m.resolveIdent(t.value, i) || { root: null, props: [] });
      // an alias that already points at a key (`const w = state.run.wish; w.done = true`)
      if (path.props.length) {
        const ns = m.nsOfContainer({ root: path.root, props: path.props.slice(0, -1) });
        if (ns && m.lookup(t.value, i)?.kind === 'const') {
          this.recordKey(ns, { values: [path.props[path.props.length - 1]], dynamic: false }, i, i + 1, 'alias', t.value);
          return;
        }
      }
    }
    for (;;) {
      const a = tokens[j];
      /** @type {KeyVal} */
      let seg;
      let next;
      let expr;
      if (isDot(a) && N(tokens[j + 1])) {
        seg = { values: [tokens[j + 1].value], dynamic: false };
        expr = tokens[j + 1].value;
        next = j + 2;
      } else if (P(a, '[') || (P(a, '?.') && P(tokens[j + 1], '['))) {
        const o = P(a, '[') ? j : j + 1;
        seg = m.evalKey(o + 1, match[o], o + 1);
        expr = m.text(o + 1, match[o]);
        next = match[o] + 1;
      } else break;
      const ns = m.nsOfContainer(path);
      if (ns) {
        this.recordKey(ns, seg, i, next, 'member', expr);
        return;
      }
      if (seg.dynamic || seg.values.length !== 1 || seg.values[0].includes(HOLE)) return;
      path = m.normalize({ root: path.root, props: [...path.props, seg.values[0]] });
      j = next;
    }
    // the chain ends on an object: a literal written into the state, or a whole namespace object
    if (P(tokens[j], '=') && P(tokens[j + 1], '{') && m.isObjectBrace(j + 1)) this.walkLiteral(j + 1, path);
    const ns = m.nsOfContainer(path);
    if (!ns) return;
    if (this.isObjectAssign(i)) {
      for (const [s, e] of m.splitArgs(m.parent[i]).slice(1)) {
        if (P(tokens[s], '{') && m.match[s] === e - 1) this.walkLiteral(s, path);
        else this.record(ns, DYN, 'write', s, 'Object.assign()', m.text(s, e));
      }
    }
    if (this.isEnumeration(i)) this.containers.push({ ns, file: m.file, line: m.line(i), fn: m.fnAt(i), expr: m.text(i, j) });
  }

  /** `Object.entries(ns)`, `{ ...ns }`, `for (k in ns)`: code that reads every key of a namespace. @param {number} i */
  isEnumeration(i) {
    const { tokens } = this.m;
    const b = tokens[i - 1];
    if (P(b, '...') || N(b, 'in')) return true;
    return P(b, '(') && N(tokens[i - 4], 'Object') && isDot(tokens[i - 3]) && ['keys', 'values', 'entries'].includes(tokens[i - 2]?.value);
  }

  /** @param {number} i */
  isObjectAssign(i) {
    const { tokens } = this.m;
    return P(tokens[i - 1], '(') && N(tokens[i - 2], 'assign') && isDot(tokens[i - 3]) && N(tokens[i - 4], 'Object');
  }

  /**
   * Records the key segment of a chain, classified as a read or a write.
   * @param {string} ns @param {KeyVal} seg @param {number} start chain start @param {number} after token after the key
   * @param {string} via @param {string} expr
   */
  recordKey(ns, seg, start, after, via, expr) {
    const c = this.classify(start, after);
    this.record(ns, seg, c.mode, start, via, expr);
    if (c.op != null) {
      const end = this.m.exprEnd(c.op + 1);
      for (const key of seg.values) this.rmw.push({ ns, key, from: c.op + 1, to: end });
      this.guardedWrite(ns, seg.values, start, end);
    }
  }

  /** @param {number} start @param {number} after @returns {{ mode: Mode, op?: number }} */
  classify(start, after) {
    const { tokens, match } = this.m;
    const before = tokens[start - 1];
    if (P(before, '++') || P(before, '--')) return { mode: 'write' };
    let k = after;
    let deeper = false;
    /** @type {string | null} */
    let lastProp = null;
    for (;;) {
      const a = tokens[k];
      if (isDot(a) && N(tokens[k + 1])) {
        lastProp = tokens[k + 1].value;
        k += 2;
        deeper = true;
        continue;
      }
      if (P(a, '?.') && P(tokens[k + 1], '[')) {
        k = match[k + 1] + 1;
        deeper = true;
        lastProp = null;
        continue;
      }
      if (P(a, '[')) {
        k = match[k] + 1;
        deeper = true;
        lastProp = null;
        continue;
      }
      if (P(a, '(') || (P(a, '?.') && P(tokens[k + 1], '('))) return { mode: deeper && lastProp && MUTATORS.has(lastProp) ? 'write' : 'read' };
      break;
    }
    const a = tokens[k];
    if (a?.type === 'punct' && ASSIGN.has(a.value)) return { mode: 'write', op: k };
    if (P(a, '++') || P(a, '--') || N(before, 'delete') || this.isObjectAssign(start)) return { mode: 'write' };
    return { mode: 'read' };
  }

  /**
   * `if (live > (c.best || 0)) c.best = live;` — a condition that only guards a write of the same key is part of
   * that write, not a use of the key.
   * @param {string} ns @param {string[]} keys @param {number} start @param {number} rhsEnd
   */
  guardedWrite(ns, keys, start, rhsEnd) {
    const { tokens, match } = this.m;
    let s = start;
    if (P(tokens[s - 1], '{')) {
      const after = P(tokens[rhsEnd], ';') ? rhsEnd + 1 : rhsEnd;
      if (after !== match[s - 1]) return;
      s -= 1;
    }
    const close = s - 1;
    if (!P(tokens[close], ')')) return;
    const open = match[close];
    if (!N(tokens[open - 1], 'if') || N(tokens[open - 2], 'else')) return;
    for (const key of keys) this.rmw.push({ ns, key, from: open + 1, to: close });
  }

  dropReadModifyWrite() {
    if (!this.rmw.length) return;
    this.accesses = this.accesses.filter((a) => a.mode !== 'read' || !this.rmw.some((r) => r.ns === a.ns && r.key === a.key && r.from <= a.at && a.at < r.to));
  }

  /** Object literal written at `path`: each property that lands on a namespace key is a write. */
  /** @param {number} open @param {Path} path @param {number} [depth] */
  walkLiteral(open, path, depth = 0) {
    const { m } = this;
    if (depth > 6) return;
    const ns = m.nsOfContainer(path);
    for (const k of m.objectKeys(open)) {
      if (k.dynamic) continue;
      if (ns) this.accesses.push({ ns, key: k.key, mode: 'write', file: m.file, line: m.line(k.at), via: 'literal', at: k.at });
      else if (k.value && P(m.tokens[k.value[0]], '{') && m.match[k.value[0]] === k.value[1] - 1) this.walkLiteral(k.value[0], { root: path.root, props: [...path.props, k.key] }, depth + 1);
    }
  }

  /** `const state = { … run: { … } }`: literals assigned to a root identifier. */
  visitRootLiterals() {
    const { m } = this;
    for (const list of m.byName.values()) {
      for (const b of list) {
        if (b.kind !== 'const' || !b.init || b.prop != null || b.nested) continue;
        const root = m.rootOf(b.name);
        if (root && P(m.tokens[b.init[0]], '{') && m.match[b.init[0]] === b.init[1] - 1) this.walkLiteral(b.init[0], root);
      }
    }
  }

  // `field: value` in object literals of content tables
  /** @param {number} i */
  visitField(i) {
    const { m } = this;
    const { tokens } = m;
    if (!P(tokens[i + 1], ':')) return;
    const rules = this.fieldRules.get(tokens[i].value);
    if (!rules) return;
    const prev = tokens[i - 1];
    if (!(P(prev, '{') || P(prev, ',')) || !m.inObjectLiteral(i)) return;
    const vs = i + 2;
    const ve = m.exprEnd(vs);
    for (const r of rules) {
      /** @type {KeyVal} */
      let v;
      if (r.take === 'keys') {
        const obj = m.objectOf(vs, ve);
        v = obj < 0 ? DYN : { values: m.objectKeys(obj).map((k) => k.key), dynamic: false };
      } else if (P(tokens[vs], '[')) v = m.elements(vs, ve);
      else v = m.evalKey(vs, ve, vs);
      if (r.match) {
        const re = r.match;
        v = { values: v.values.filter((x) => re.test(x)), dynamic: false };
      }
      this.record(r.ns, v, r.mode, vs, `${tokens[i].value}:`, m.text(vs, ve));
    }
  }

  visitConstRules() {
    const { m } = this;
    for (const r of m.rules.consts || []) {
      if (r.file !== m.file) continue;
      const b = (m.byName.get(r.name) || []).find((x) => x.kind === 'const' && x.init && x.from === 0);
      if (!b?.init) {
        this.dynamic.push({ ns: r.ns, mode: r.mode, file: m.file, line: 0, via: 'const rule', expr: `constant ${r.name} not found`, fn: '<module>', at: 0 });
        continue;
      }
      if (r.take === 'keys') {
        const obj = m.objectOf(b.init[0], b.init[1]);
        for (const k of obj >= 0 ? m.objectKeys(obj) : []) if (!k.dynamic) this.accesses.push({ ns: r.ns, key: k.key, mode: r.mode, file: m.file, line: m.line(k.at), via: r.name, at: k.at });
        continue;
      }
      for (const [s, e] of m.elements(b.init[0], b.init[1], 0, r.index).ranges) {
        for (const key of m.evalKey(s, e, s).values) this.accesses.push({ ns: r.ns, key, mode: r.mode, file: m.file, line: m.line(s), via: r.name, at: s });
      }
    }
  }

  visitLiteralRules() {
    const { m } = this;
    const { tokens } = m;
    for (const r of m.rules.literals || []) {
      if (r.file !== m.file) continue;
      /** @type {number[]} */
      const opens = [];
      if (r.name) {
        const b = (m.byName.get(r.name) || []).find((x) => x.kind === 'const' && x.init);
        const o = b?.init ? m.objectOf(b.init[0], b.init[1]) : -1;
        if (o >= 0) opens.push(o);
      } else if (r.fn) {
        const b = (m.byName.get(r.fn) || []).find((x) => x.kind === 'fn' && x.body);
        if (b?.body) {
          for (let k = b.body[0]; k < b.body[1]; k++) {
            if (r.call ? N(tokens[k], r.call) && P(tokens[k + 1], '(') && P(tokens[k + 2], '{') : N(tokens[k], 'return') && P(tokens[k + 1], '{') && m.fnAt(k) === r.fn) opens.push(k + (r.call ? 2 : 1));
          }
        }
      }
      if (!opens.length) this.dynamic.push({ ns: r.ns, mode: 'write', file: m.file, line: 0, via: 'literal rule', expr: `${r.fn || r.name}: object literal not found`, fn: '<module>', at: 0 });
      for (const o of opens) for (const k of m.objectKeys(o)) if (!k.dynamic) this.accesses.push({ ns: r.ns, key: k.key, mode: 'write', file: m.file, line: m.line(k.at), via: 'literal', at: k.at });
    }
  }

  // `// @keys read ns:key …`, `// @keys write ns:key …`, `// @keys dynamic ns — reason`
  visitAnnotations() {
    const { m } = this;
    for (const c of m.comments) {
      const at = c.text.indexOf('@keys');
      if (at < 0) continue;
      const words = c.text.slice(at + 5).trim().split(/\s+/);
      const verb = words.shift() || '';
      if (verb === 'dynamic') {
        const ns = words.shift() || '';
        this.acks.push({ line: c.line, ns: NS_ALIASES[ns] || ns, reason: words.join(' ').replace(/^[—–-]+\s*/, '') });
        continue;
      }
      if (verb !== 'read' && verb !== 'write') {
        this.dynamic.push({ ns: '?', mode: 'read', file: m.file, line: c.line, via: '@keys', expr: `unknown @keys verb '${verb}'`, fn: '<module>', at: 0 });
        continue;
      }
      for (const w of words) {
        const colon = w.indexOf(':');
        if (colon <= 0) break;
        const ns = w.slice(0, colon);
        const key = w.slice(colon + 1).replace(/[,;]$/, '');
        this.accesses.push({ ns: NS_ALIASES[ns] || ns, key: toPattern(key), mode: verb, file: m.file, line: c.line, via: '@keys', at: -1 });
      }
    }
  }
}
