// @ts-check
// Pitch names and chords for the score DSL. Scientific pitch notation: C4 = MIDI 60 (middle C). The sample libraries
// name their files with C3 = 60 (see libraryNoteToMidi).

const PC = /** @type {Record<string, number>} */ ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 });

/**
 * 'D#4' / 'Eb3' / 'F-1' -> MIDI key (C4 = 60).
 * @param {string} name
 */
export function midi(name) {
  const m = /^([A-Ga-g])(#{1,2}|b{1,2}|x)?(-?\d+)$/.exec(name.trim());
  if (!m) throw new Error(`bad note name '${name}'`);
  const acc = m[2] ?? '';
  const shift = acc === 'x' ? 2 : acc.startsWith('#') ? acc.length : -acc.length;
  return 12 * (Number(m[3]) + 1) + PC[m[1].toUpperCase()] + shift;
}

/** Library file tags use C3 = 60 ('A-1' is the lowest piano A, MIDI 21). @param {string} tag */
export const libraryNoteToMidi = (tag) => midi(tag) + 12;

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
/** @param {number} key */
export const noteName = (key) => `${NAMES[((key % 12) + 12) % 12]}${Math.floor(key / 12) - 1}`;

/** @param {number} key */
export const keyToHz = (key) => 440 * 2 ** ((key - 69) / 12);

/** @param {number} hz */
export const hzToKey = (hz) => 69 + 12 * Math.log2(hz / 440);

/**
 * Chord tones from a symbol: root and quality, e.g. 'Dm9', 'Bbmaj7', 'Gm6', 'A7sus4', 'Ebmaj7#11', 'Dm(add9)'.
 * Returns pitch classes relative to C as offsets from the root (root first).
 * @param {string} symbol
 * @returns {{ root: number, intervals: number[] }}
 */
export function chord(symbol) {
  const m = /^([A-G](?:#|b)?)(.*)$/.exec(symbol);
  if (!m) throw new Error(`bad chord '${symbol}'`);
  const root = midi(`${m[1]}0`) % 12;
  const q = m[2];
  /** @type {Record<string, number[]>} */
  const table = {
    '': [0, 4, 7],
    m: [0, 3, 7],
    5: [0, 7],
    dim: [0, 3, 6],
    aug: [0, 4, 8],
    sus2: [0, 2, 7],
    sus4: [0, 5, 7],
    6: [0, 4, 7, 9],
    m6: [0, 3, 7, 9],
    7: [0, 4, 7, 10],
    maj7: [0, 4, 7, 11],
    m7: [0, 3, 7, 10],
    m7b5: [0, 3, 6, 10],
    dim7: [0, 3, 6, 9],
    '7sus4': [0, 5, 7, 10],
    '7b9': [0, 4, 7, 10, 13],
    9: [0, 4, 7, 10, 14],
    m9: [0, 3, 7, 10, 14],
    maj9: [0, 4, 7, 11, 14],
    add9: [0, 4, 7, 14],
    madd9: [0, 3, 7, 14],
    'm(add9)': [0, 3, 7, 14],
    '(add9)': [0, 4, 7, 14],
    'maj7#11': [0, 4, 7, 11, 18],
    'add#11': [0, 4, 7, 18],
    m11: [0, 3, 7, 10, 14, 17],
    'mMaj7': [0, 3, 7, 11],
  };
  const intervals = table[q];
  if (!intervals) throw new Error(`unknown chord quality '${q}' in '${symbol}'`);
  return { root, intervals };
}

/**
 * Voices a chord: every tone placed in [low, high], root in the bass when `bass` is set.
 * @param {string} symbol
 * @param {{ low: number, high: number, bass?: number | null, drop?: number[] }} o  bass: MIDI key of the bass note
 */
export function voice(symbol, o) {
  const { root, intervals } = chord(symbol);
  /** @type {number[]} */
  const out = [];
  for (const iv of intervals) {
    let k = o.low + ((((root + iv - o.low) % 12) + 12) % 12);
    while (k < o.low) k += 12;
    if (k > o.high) k -= 12;
    if (k >= o.low && !out.includes(k)) out.push(k);
  }
  out.sort((a, b) => a - b);
  if (o.bass != null) out.unshift(o.bass);
  return out;
}

/** Scale degrees (semitones) by mode name. */
export const SCALES = Object.freeze({
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
});
