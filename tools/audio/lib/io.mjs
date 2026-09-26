// @ts-check
// Audio file I/O through ffmpeg (decode anything to 48 kHz float) and sox (Vorbis encode: this ffmpeg build has no
// libvorbis, sox links it). Decoded sources are cached as raw float files under tools/audio/.build/decoded so a
// rebuild does not decode the same sample twice.

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SR } from './dsp.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const BUILD = join(ROOT, 'tools', 'audio', '.build');
const MAX_BUFFER = 1 << 30;

/** @param {string} p */
export const rel = (p) => (p.startsWith(ROOT) ? p.slice(ROOT.length + 1) : p);

/**
 * Parses a RIFF/WAVE buffer (PCM 16/24/32 or IEEE float 32/64; streamed files with unknown sizes too).
 * @param {Buffer} buf
 * @returns {{ sampleRate: number, channels: Float32Array[] }}
 */
export function parseWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV file');
  let p = 12;
  let fmt = 0;
  let ch = 0;
  let rate = 0;
  let bits = 0;
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4);
    let size = buf.readUInt32LE(p + 4);
    const body = p + 8;
    if (id === 'fmt ') {
      fmt = buf.readUInt16LE(body);
      ch = buf.readUInt16LE(body + 2);
      rate = buf.readUInt32LE(body + 4);
      bits = buf.readUInt16LE(body + 14);
      if (fmt === 0xfffe) fmt = buf.readUInt16LE(body + 24);
    } else if (id === 'data') {
      if (size === 0 || size === 0xffffffff || body + size > buf.length) size = buf.length - body;
      const bytes = bits / 8;
      const frames = Math.floor(size / (bytes * ch));
      const out = Array.from({ length: ch }, () => new Float32Array(frames));
      for (let f = 0; f < frames; f++) {
        for (let c = 0; c < ch; c++) {
          const o = body + (f * ch + c) * bytes;
          let v;
          if (fmt === 3) v = bits === 64 ? buf.readDoubleLE(o) : buf.readFloatLE(o);
          else if (bits === 16) v = buf.readInt16LE(o) / 32768;
          else if (bits === 24) v = buf.readIntLE(o, 3) / 8388608;
          else if (bits === 32) v = buf.readInt32LE(o) / 2147483648;
          else if (bits === 8) v = (buf.readUInt8(o) - 128) / 128;
          else throw new Error(`unsupported WAV bit depth ${bits}`);
          out[c][f] = v;
        }
      }
      return { sampleRate: rate, channels: out };
    }
    p = body + size + (size & 1);
  }
  throw new Error('WAV has no data chunk');
}

/**
 * Encodes a WAV file buffer.
 * @param {Float32Array[]} chans
 * @param {number} rate
 * @param {'f32' | 's24' | 's16'} [format]
 */
export function wavBuffer(chans, rate, format = 'f32') {
  const ch = chans.length;
  const n = chans[0].length;
  const bytes = format === 's16' ? 2 : format === 's24' ? 3 : 4;
  const dataSize = n * ch * bytes;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(format === 'f32' ? 3 : 1, 20);
  buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * ch * bytes, 28);
  buf.writeUInt16LE(ch * bytes, 32);
  buf.writeUInt16LE(bytes * 8, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40);
  // TPDF dither for the integer formats, from a fixed seed so files are reproducible.
  let s = 0x12345678;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = chans[c][i];
      if (format === 'f32') buf.writeFloatLE(v, o);
      else {
        const full = format === 's16' ? 32767 : 8388607;
        const d = (rnd() - rnd()) / full;
        const q = Math.max(-full - 1, Math.min(full, Math.round((v + d) * full)));
        if (format === 's16') buf.writeInt16LE(q, o);
        else buf.writeIntLE(q, o, 3);
      }
      o += bytes;
    }
  }
  return buf;
}

/**
 * @param {string} path
 * @param {Float32Array[]} chans
 * @param {number} [rate]
 * @param {'f32' | 's24' | 's16'} [format]
 */
export function writeWav(path, chans, rate = SR, format = 'f32') {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, wavBuffer(chans, rate, format));
}

/**
 * Decodes any audio file to float at `rate` (native channel count unless `channels` is given).
 * @param {string} path
 * @param {{ rate?: number, channels?: number, cache?: boolean }} [o]
 * @returns {Float32Array[]}
 */
export function decode(path, o = {}) {
  const rate = o.rate ?? SR;
  const st = statSync(path);
  const key = createHash('sha1').update(`${realpathSync(path)}|${st.size}|${st.mtimeMs}|${rate}|${o.channels ?? 0}`).digest('hex');
  const cacheFile = join(BUILD, 'decoded', `${key}.wav`);
  if (o.cache !== false && existsSync(cacheFile)) return parseWav(readFileSync(cacheFile)).channels;
  const args = ['-v', 'error', '-i', path];
  if (o.channels) args.push('-ac', String(o.channels));
  args.push('-af', `aresample=${rate}:filter_size=64:phase_shift=12:cutoff=0.97`, '-c:a', 'pcm_f32le', '-f', 'wav', '-');
  const out = execFileSync('ffmpeg', args, { maxBuffer: MAX_BUFFER });
  const wav = parseWav(out);
  if (o.cache !== false) {
    mkdirSync(dirname(cacheFile), { recursive: true });
    writeFileSync(`${cacheFile}.part`, wavBuffer(wav.channels, rate, 'f32'));
    renameSync(`${cacheFile}.part`, cacheFile);
  }
  return wav.channels;
}

/**
 * Encodes Ogg Vorbis with sox (libvorbis). quality: -1 … 10 (5 ≈ 160 kbit/s stereo, 6 ≈ 192).
 * @param {string} path
 * @param {Float32Array[]} chans
 * @param {{ rate?: number, quality?: number, comment?: string[] }} [o]
 */
export function writeOgg(path, chans, o = {}) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(BUILD, 'tmp', `${createHash('sha1').update(path).digest('hex')}.wav`);
  writeWav(tmp, chans, o.rate ?? SR, 'f32');
  // -R: repeatable mode (fixed Ogg stream serial, seeded dither), so a rebuild is byte-identical.
  const args = ['-V1', '-R', tmp, '-C', String(o.quality ?? 5)];
  for (const c of o.comment ?? []) args.push('--add-comment', c);
  args.push(`${path}.tmp.ogg`);
  execFileSync('sox', args);
  renameSync(`${path}.tmp.ogg`, path);
  rmSync(tmp, { force: true });
}

/**
 * @typedef {{ integrated: number, lra: number, truePeak: number, threshold: number }} EburReport
 */

/**
 * Parses the summary ffmpeg's ebur128 filter prints on stderr.
 * @param {string} text
 * @returns {EburReport}
 */
export function parseEbur128(text) {
  const summary = text.slice(text.lastIndexOf('Summary:'));
  /** @param {RegExp} re */
  const num = (re) => {
    const m = re.exec(summary);
    return m ? Number(m[1]) : NaN;
  };
  return {
    integrated: num(/I:\s+(-?[\d.]+|-inf)\s+LUFS/),
    threshold: num(/Threshold:\s+(-?[\d.]+)\s+LUFS/),
    lra: num(/LRA:\s+(-?[\d.]+)\s+LU/),
    truePeak: num(/Peak:\s+(-?[\d.]+|-inf)\s+dBFS/),
  };
}

/**
 * Measures a file with ffmpeg's EBU R128 scanner (true peak enabled).
 * @param {string} path
 * @returns {EburReport}
 */
export function measure(path) {
  const args = ['-nostats', '-hide_banner', '-i', path, '-filter_complex', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-'];
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: MAX_BUFFER });
  if (r.status !== 0) throw new Error(`ffmpeg ebur128 failed for ${path}: ${r.stderr.slice(-400)}`);
  return parseEbur128(r.stderr);
}

/** Duration in seconds (ffprobe). @param {string} path */
export function duration(path) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path], { encoding: 'utf8' });
  return Number(out.trim());
}

/** SHA-256 of a file. @param {string} path */
export const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
