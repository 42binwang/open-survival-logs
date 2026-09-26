// @ts-check
// SFZ parser for the subset the sampler plays: <control> default_path, <global>/<master>/<group>/<region> opcode
// inheritance, #include, key and velocity ranges, velocity crossfades (xfin/xfout), round robins
// (seq_length/seq_position), CC-triggered regions (on_loccN/on_hiccN), envelopes, loops, a velocity-tracked filter.
// Sampler extensions: offset_auto=1 (skip the silence before the attack), loop_crossfade (ARIA; seconds).

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * @typedef {{
 *   sample: string, lokey: number, hikey: number, keycenter: number, keytrack: number, tune: number, transpose: number,
 *   lovel: number, hivel: number, xfin: [number, number] | null, xfout: [number, number] | null,
 *   seqLength: number, seqPosition: number, trigger: 'attack' | 'release' | 'cc', onCc: { cc: number, lo: number, hi: number } | null,
 *   volume: number, pan: number, veltrack: number, ampRandom: number, pitchRandom: number,
 *   offset: number, offsetAuto: boolean,
 *   env: { delay: number, attack: number, hold: number, decay: number, sustain: number, release: number },
 *   loopMode: 'no_loop' | 'one_shot' | 'loop_continuous' | 'loop_sustain', loopStart: number | null, loopEnd: number | null,
 *   loopCrossfade: number, filter: { type: string, cutoff: number, veltrack: number, resonance: number } | null,
 *   id: number
 * }} Region
 */

/** @param {string} text */
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/**
 * Splits one line into headers and opcodes; an opcode value runs to the next header or opcode.
 * @param {string} line
 * @returns {({ header: string } | { key: string, value: string })[]}
 */
function tokens(line) {
  const re = /<(\w+)>|([A-Za-z0-9_]+)=/g;
  /** @type {{ index: number, end: number, header?: string, key?: string }[]} */
  const marks = [];
  let m;
  while ((m = re.exec(line))) marks.push({ index: m.index, end: re.lastIndex, header: m[1], key: m[2] });
  return marks.map((mk, i) => {
    if (mk.header) return { header: mk.header };
    const stop = i + 1 < marks.length ? marks[i + 1].index : line.length;
    return { key: /** @type {string} */ (mk.key), value: line.slice(mk.end, stop).trim() };
  });
}

/**
 * @param {string} file
 * @returns {Region[]}
 */
export function parseSfz(file) {
  /** @type {Region[]} */
  const regions = [];
  /** @type {Record<string, string>} */
  let control = {};
  /** @type {Record<string, string>} */
  let global = {};
  /** @type {Record<string, string>} */
  let master = {};
  /** @type {Record<string, string>} */
  let group = {};
  /** @type {Record<string, string> | null} */
  let region = null;
  /** @type {'control' | 'global' | 'master' | 'group' | 'region' | null} */
  let scope = null;
  let baseDir = dirname(resolve(file));

  const flush = () => {
    if (!region) return;
    const o = { ...global, ...master, ...group, ...region };
    regions.push(toRegion(o, join(baseDir, control.default_path ?? ''), regions.length));
    region = null;
  };

  /** @param {string} path */
  const walk = (path) => {
    const dir = dirname(resolve(path));
    for (const raw of stripComments(readFileSync(path, 'utf8')).split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const inc = /^#include\s+"([^"]+)"/.exec(line);
      if (inc) {
        flush();
        const saved = { control, baseDir };
        walk(join(dir, inc[1]));
        ({ control, baseDir } = saved);
        global = {};
        master = {};
        group = {};
        scope = null;
        continue;
      }
      for (const t of tokens(line)) {
        if ('header' in t) {
          flush();
          scope = /** @type {typeof scope} */ (t.header);
          if (scope === 'control') {
            control = {};
            baseDir = dir;
          } else if (scope === 'global') {
            global = {};
            master = {};
            group = {};
          } else if (scope === 'master') {
            master = {};
            group = {};
          } else if (scope === 'group') group = {};
          else if (scope === 'region') region = {};
          continue;
        }
        const target = scope === 'control' ? control : scope === 'global' ? global : scope === 'master' ? master : scope === 'group' ? group : region;
        if (target) target[t.key] = t.value;
      }
    }
    flush();
  };
  walk(file);
  return regions;
}

/**
 * @param {Record<string, string>} o
 * @param {string} dir
 * @param {number} id
 * @returns {Region}
 */
function toRegion(o, dir, id) {
  const n = (/** @type {string} */ k, /** @type {number} */ d) => (o[k] !== undefined ? Number(o[k]) : d);
  const key = o.key !== undefined ? Number(o.key) : null;
  const ccKey = Object.keys(o).find((k) => /^on_locc\d+$/.test(k));
  const cc = ccKey ? Number(ccKey.slice(7)) : null;
  const pair = (/** @type {string} */ a, /** @type {string} */ b) => (o[a] !== undefined && o[b] !== undefined ? /** @type {[number, number]} */ ([Number(o[a]), Number(o[b])]) : null);
  const loopMode = /** @type {Region['loopMode']} */ (o.loop_mode ?? 'no_loop');
  return {
    id,
    sample: join(dir, o.sample ?? ''),
    lokey: key ?? n('lokey', 0),
    hikey: key ?? n('hikey', 127),
    keycenter: key ?? n('pitch_keycenter', 60),
    keytrack: n('pitch_keytrack', 100),
    tune: n('tune', 0),
    transpose: n('transpose', 0),
    lovel: n('lovel', 1),
    hivel: n('hivel', 127),
    xfin: pair('xfin_lovel', 'xfin_hivel'),
    xfout: pair('xfout_lovel', 'xfout_hivel'),
    seqLength: n('seq_length', 1),
    seqPosition: n('seq_position', 1),
    trigger: cc != null ? 'cc' : o.trigger === 'release' ? 'release' : 'attack',
    onCc: cc != null ? { cc, lo: n(`on_locc${cc}`, 0), hi: n(`on_hicc${cc}`, 127) } : null,
    volume: n('volume', 0),
    pan: n('pan', 0),
    veltrack: n('amp_veltrack', 100),
    ampRandom: n('amp_random', 0),
    pitchRandom: n('pitch_random', 0),
    offset: n('offset', 0),
    offsetAuto: o.offset_auto === '1',
    env: {
      delay: n('ampeg_delay', 0),
      attack: n('ampeg_attack', 0),
      hold: n('ampeg_hold', 0),
      decay: n('ampeg_decay', 0),
      sustain: n('ampeg_sustain', 100) / 100,
      release: n('ampeg_release', 0.001),
    },
    loopMode,
    loopStart: o.loop_start !== undefined ? Number(o.loop_start) : null,
    loopEnd: o.loop_end !== undefined ? Number(o.loop_end) : null,
    loopCrossfade: n('loop_crossfade', 0.25),
    filter: o.fil_type ? { type: o.fil_type, cutoff: n('cutoff', 20000), veltrack: n('fil_veltrack', 0), resonance: n('resonance', 0) } : null,
  };
}
