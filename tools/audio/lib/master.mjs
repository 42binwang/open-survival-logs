// @ts-check
// The last stage of the shared chain: loudness normalization + true-peak limiting, Vorbis encode, and a check of the
// encoded file with ffmpeg's ebur128 (the meter the tests use). Lossy encoding adds inter-sample overshoot and moves
// the loudness a little, so the stage re-renders with a lower ceiling / corrected gain until the file itself meets
// the target.

import { writeOgg, measure } from './io.mjs';
import { normalize } from './limiter.mjs';

/**
 * @typedef {{ integrated: number, truePeak: number, lra: number, ceilingDb: number, gainDb: number, passes: number }} MasterReport
 */

/**
 * @param {string} path  .ogg output
 * @param {Float32Array[]} chans  not modified
 * @param {{ lufs: number, maxTruePeak?: number, quality?: number, comment?: string[], tolerance?: number, loop?: boolean }} o
 *   maxTruePeak: the ceiling the encoded file must meet in ffmpeg's measurement (default -1 dBTP); loop: seamless loop
 * @returns {MasterReport}
 */
export function masterToOgg(path, chans, o) {
  const maxTp = o.maxTruePeak ?? -1;
  const margin = 0.15;
  const tol = o.tolerance ?? 0.3;
  let ceiling = maxTp - 0.9;
  let target = o.lufs;
  /** @type {MasterReport | null} */
  let last = null;
  for (let pass = 1; pass <= 6; pass++) {
    const y = chans.map((c) => c.slice());
    const r = normalize(y, { lufs: target, ceilingDb: ceiling, circular: o.loop });
    writeOgg(path, y, { quality: o.quality ?? 6, comment: o.comment });
    const m = measure(path);
    last = { integrated: m.integrated, truePeak: m.truePeak, lra: m.lra, ceilingDb: ceiling, gainDb: r.gainDb, passes: pass };
    const tpOk = m.truePeak <= maxTp - margin;
    const lufsOk = Math.abs(m.integrated - o.lufs) <= tol;
    if (tpOk && lufsOk) break;
    if (!tpOk) ceiling -= m.truePeak - (maxTp - margin) + 0.1;
    if (!lufsOk) target += Math.max(-2, Math.min(2, o.lufs - m.integrated));
  }
  return /** @type {MasterReport} */ (last);
}
