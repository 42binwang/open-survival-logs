#!/usr/bin/env node
// @ts-check
// Listening aids for a lane that cannot listen: prints loudness (BS.1770 in JS), the long-term octave-band balance
// relative to 1 kHz, a short-term loudness timeline and suspected clicks (isolated high-frequency spikes).
//
//   node tools/audio/analyze.mjs <file> [--timeline] [--loop] [--png out.png]
//
// --png writes a labelled spectrogram (ffmpeg showspectrumpic) for a visual check.

import { execFileSync } from 'node:child_process';
import { SR, biquad, runBiquad } from './lib/dsp.mjs';
import { decode } from './lib/io.mjs';
import { loudness } from './lib/loudness.mjs';

const OCTAVES = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

/**
 * Long-term level per octave band in dB relative to the 1 kHz band.
 * @param {Float32Array[]} chans
 */
export function octaveBalance(chans) {
  const mono = new Float32Array(chans[0].length);
  for (const ch of chans) for (let i = 0; i < mono.length; i++) mono[i] += ch[i] / chans.length;
  /** @type {Record<string, number>} */
  const out = {};
  const levels = OCTAVES.map((f) => {
    const x = mono.slice();
    const bp = biquad({ type: 'bandpass', freq: f, q: 1.41 });
    runBiquad(x, bp);
    runBiquad(x, bp);
    let e = 0;
    for (let i = 0; i < x.length; i++) e += x[i] * x[i];
    return 10 * Math.log10(e / x.length + 1e-20);
  });
  const ref = levels[OCTAVES.indexOf(1000)];
  OCTAVES.forEach((f, i) => (out[f >= 1000 ? `${f / 1000}k` : String(f)] = Math.round((levels[i] - ref) * 10) / 10));
  return out;
}

/**
 * Positions (seconds) of isolated spikes in the >6 kHz band that stand far above their surroundings.
 * @param {Float32Array[]} chans
 */
export function clicks(chans) {
  const x = chans[0].slice();
  const hp = biquad({ type: 'highpass', freq: 6000 });
  runBiquad(x, hp);
  runBiquad(x, hp);
  const win = Math.round(0.02 * SR);
  /** @type {number[]} */
  const found = [];
  for (let s = win; s + 2 * win < x.length; s += win) {
    let local = 0;
    let peak = 0;
    for (let i = s - win; i < s + 2 * win; i++) local += x[i] * x[i];
    for (let i = s; i < s + win; i++) peak = Math.max(peak, Math.abs(x[i]));
    const rms = Math.sqrt(local / (3 * win));
    if (peak > 0.02 && peak > rms * 12) found.push(Math.round((s / SR) * 100) / 100);
  }
  return found;
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('usage: node tools/audio/analyze.mjs <file> [--timeline] [--png out.png]');
  const chans = decode(file, { cache: false });
  const l = loudness(chans);
  console.log(`${file}: ${(chans[0].length / SR).toFixed(2)} s, ${chans.length} ch`);
  console.log(`  integrated ${l.integrated.toFixed(1)} LUFS, short-term max ${l.shortTermMax.toFixed(1)}, momentary max ${l.momentaryMax.toFixed(1)}, LRA ${l.lra.toFixed(1)} LU, true peak ${l.truePeakDb.toFixed(2)} dBTP`);
  console.log(`  octave balance (dB re 1 kHz): ${JSON.stringify(octaveBalance(chans))}`);
  const c = clicks(chans);
  console.log(`  suspected clicks: ${c.length ? c.slice(0, 20).join(', ') : 'none'}`);
  if (process.argv.includes('--loop')) {
    const n = Math.round(0.5 * SR);
    const wrap = chans.map((ch) => {
      const x = new Float32Array(2 * n);
      x.set(ch.subarray(ch.length - n), 0);
      x.set(ch.subarray(0, n), n);
      return x;
    });
    const w = clicks(wrap);
    console.log(`  loop seam (last 0.5 s + first 0.5 s): ${w.length ? `suspected clicks at ${w.map((t) => (t - 0.5).toFixed(3)).join(', ')} s from the seam` : 'clean'}`);
  }
  if (process.argv.includes('--timeline')) {
    const st = l.shortTerm;
    const line = [];
    for (let i = 0; i < st.length; i += 10) line.push(`${(i / 10 + 3).toFixed(0)}s:${Number.isFinite(st[i]) ? st[i].toFixed(0) : '-inf'}`);
    console.log(`  short-term (3 s window, end time): ${line.join(' ')}`);
  }
  const png = process.argv.indexOf('--png');
  if (png > 0) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-lavfi', 'showspectrumpic=s=1600x500:legend=1:scale=log:fscale=log:stop=16000', '-frames:v', '1', process.argv[png + 1]]);
    console.log(`  spectrogram: ${process.argv[png + 1]}`);
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) await main();
