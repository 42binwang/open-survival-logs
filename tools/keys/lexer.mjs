// @ts-check
// Small JavaScript tokenizer for the keys audit: enough of the grammar to skip comments, read string and template
// literals (a template's `${…}` expressions come out as ordinary tokens between `texpr` and `texprEnd`) and tell
// regex literals from division. Comments are returned separately so `@keys` annotations can be read.

/**
 * @typedef {'name' | 'string' | 'number' | 'regex' | 'punct' | 'tstart' | 'tchunk' | 'texpr' | 'texprEnd' | 'tend'} TokenType
 * @typedef {{ type: TokenType, value: string, line: number }} Token
 * @typedef {{ line: number, text: string }} Comment
 */

const PUNCT = [
  '>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=',
  '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>',
  '{', '}', '(', ')', '[', ']', ';', ',', '<', '>', '+', '-', '*', '/', '%', '&', '|', '^', '!', '~', '?', ':', '=', '.', '@', '#',
];

// After these keywords a `/` starts a regex literal rather than a division.
const REGEX_AFTER = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);

const ID_START = /[\p{ID_Start}$_]/u;
const ID_PART = /[\p{ID_Continue}$\u200c\u200d]/u;
const NUMBER = /(?:0[xX][\da-fA-F_]+|0[oO][0-7_]+|0[bB][01_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?)n?/y;

/** @param {Token | null} last */
function regexAllowed(last) {
  if (!last) return true;
  if (last.type === 'name') return REGEX_AFTER.has(last.value);
  if (last.type === 'punct') return last.value !== ')' && last.value !== ']';
  return last.type === 'texpr';
}

/**
 * Reads the escape sequence at src[i] (the backslash) and returns [cooked text, next index].
 * @param {string} src
 * @param {number} i
 * @returns {[string, number]}
 */
function readEscape(src, i) {
  const c = src[i + 1];
  const simple = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };
  if (c in simple && !(c === '0' && /\d/.test(src[i + 2] || ''))) return [simple[/** @type {keyof typeof simple} */ (c)], i + 2];
  if (c === 'x') return [String.fromCharCode(parseInt(src.slice(i + 2, i + 4), 16)), i + 4];
  if (c === 'u' && src[i + 2] === '{') {
    const end = src.indexOf('}', i + 3);
    return [String.fromCodePoint(parseInt(src.slice(i + 3, end), 16)), end + 1];
  }
  if (c === 'u') return [String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16)), i + 6];
  if (c === '\r' && src[i + 2] === '\n') return ['', i + 3];
  if (c === '\n' || c === '\r' || c === '\u2028' || c === '\u2029') return ['', i + 2];
  return [c ?? '', i + 2];
}

/**
 * @param {string} src
 * @returns {{ tokens: Token[], comments: Comment[] }}
 */
export function tokenize(src) {
  /** @type {Token[]} */
  const tokens = [];
  /** @type {Comment[]} */
  const comments = [];
  /** @type {Array<{ tpl: boolean, depth: number }>} code frames; `tpl` marks a template's `${…}` expression */
  const frames = [{ tpl: false, depth: 0 }];
  /** @type {boolean[]} true while inside a template literal's text */
  const inTemplate = [];
  /** @type {Token | null} */
  let last = null;
  let i = 0;
  let line = 1;
  const n = src.length;

  /** @param {TokenType} type @param {string} value @param {number} at */
  const push = (type, value, at) => {
    const tok = { type, value, line: at };
    tokens.push(tok);
    last = tok;
  };

  if (src.startsWith('#!')) while (i < n && src[i] !== '\n') i++;

  while (i < n) {
    if (inTemplate.length && inTemplate[inTemplate.length - 1]) {
      const at = line;
      let text = '';
      while (i < n && src[i] !== '`' && !(src[i] === '$' && src[i + 1] === '{')) {
        if (src[i] === '\\') {
          const [cooked, next] = readEscape(src, i);
          text += cooked;
          i = next;
          continue;
        }
        if (src[i] === '\n') line++;
        text += src[i++];
      }
      push('tchunk', text, at);
      if (i >= n) break;
      if (src[i] === '`') {
        push('tend', '`', line);
        i++;
        inTemplate.pop();
      } else {
        push('texpr', '${', line);
        i += 2;
        inTemplate[inTemplate.length - 1] = false;
        frames.push({ tpl: true, depth: 0 });
      }
      continue;
    }

    const ch = src[i];
    if (ch === '\n') {
      line++;
      i++;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\f' || ch === '\v' || ch === '\u00a0' || ch === '\ufeff' || ch === '\u2028' || ch === '\u2029') {
      i++;
      continue;
    }
    if (ch === '/' && src[i + 1] === '/') {
      const start = i + 2;
      while (i < n && src[i] !== '\n') i++;
      comments.push({ line, text: src.slice(start, i) });
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const at = line;
      const start = i + 2;
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') line++;
        i++;
      }
      comments.push({ line: at, text: src.slice(start, i) });
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const at = line;
      let text = '';
      i++;
      while (i < n && src[i] !== ch) {
        if (src[i] === '\\') {
          const [cooked, next] = readEscape(src, i);
          text += cooked;
          i = next;
          continue;
        }
        if (src[i] === '\n') break; // unterminated string: stop at the line end
        text += src[i++];
      }
      i++;
      push('string', text, at);
      continue;
    }
    if (ch === '`') {
      push('tstart', '`', line);
      i++;
      inTemplate.push(true);
      continue;
    }
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(src[i + 1] || ''))) {
      NUMBER.lastIndex = i;
      const m = NUMBER.exec(src);
      const raw = m ? m[0] : ch;
      push('number', raw, line);
      i += raw.length;
      continue;
    }
    if (ID_START.test(ch) || ch === '\\') {
      let j = i + 1;
      while (j < n && ID_PART.test(src[j])) j++;
      push('name', src.slice(i, j), line);
      i = j;
      continue;
    }
    if (ch === '/' && regexAllowed(last)) {
      let j = i + 1;
      let inClass = false;
      let ok = false;
      while (j < n && src[j] !== '\n') {
        const c = src[j];
        if (c === '\\') {
          j += 2;
          continue;
        }
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) {
          ok = true;
          break;
        }
        j++;
      }
      if (ok) {
        j++;
        while (j < n && /[a-z]/i.test(src[j])) j++;
        push('regex', src.slice(i, j), line);
        i = j;
        continue;
      }
    }
    const frame = frames[frames.length - 1];
    if (ch === '{') {
      frame.depth++;
      push('punct', '{', line);
      i++;
      continue;
    }
    if (ch === '}') {
      if (frame.tpl && frame.depth === 0) {
        push('texprEnd', '}', line);
        frames.pop();
        inTemplate[inTemplate.length - 1] = true;
        i++;
        continue;
      }
      frame.depth--;
      push('punct', '}', line);
      i++;
      continue;
    }
    if (ch === '?' && src[i + 1] === '.' && /\d/.test(src[i + 2] || '')) {
      push('punct', '?', line);
      i++;
      continue;
    }
    const p = PUNCT.find((q) => src.startsWith(q, i));
    if (p) {
      push('punct', p, line);
      i += p.length;
      continue;
    }
    i++; // unknown character: skip
  }
  return { tokens, comments };
}
