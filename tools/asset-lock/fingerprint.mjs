// @ts-check
// Fingerprints that make every shipped file comparable at SSIM, plus the exact facts that must not drift:
//   .ktx2         level 0 decoded to RGBA8 (tools/bin/ktx-wasm, KTX-Software libktx_read), per channel; size and levels
//   .png          decoded (tools/lib/png.mjs), per channel; size
//   .glb / .gltf  a two-view Workbench render (tools/blender/run.sh tools/asset-lock/render_mesh.py); triangle and
//                 bone counts
//   audio         a log-frequency spectrogram image; duration within 10 ms, loudness within 0.5 LU
//   anything else byte-exact
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from '../lib/png.mjs';
import { ssim } from '../lib/ssim.mjs';

export const SSIM_MIN = 0.99;
export const DURATION_TOLERANCE_S = 0.01;
export const LOUDNESS_TOLERANCE_LU = 0.5;
const TOOL_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const AUDIO = new Set(['.wav', '.ogg', '.opus', '.flac', '.mp3']);

/**
 * @typedef {import('../lib/png.mjs').Image} Image
 * @typedef {{ image?: Image, facts: Record<string, number | string> }} Fingerprint
 * @typedef {{ ssim: number | null, problems: string[] }} Comparison
 */

/** The fingerprint kind of a path: 'texture', 'image', 'mesh', 'audio' or 'bytes'. */
export function kindOf(/** @type {string} */ path) {
  const ext = extname(path).toLowerCase();
  if (ext === '.ktx2') return 'texture';
  if (ext === '.png') return 'image';
  if (ext === '.glb' || ext === '.gltf') return 'mesh';
  if (AUDIO.has(ext)) return 'audio';
  return 'bytes';
}

// ------------------------------------------------------------------------------------------ textures

/** @type {Map<string, Promise<any>>} */
const transcoders = new Map();

/**
 * Decodes level 0 of a KTX2 file to RGBA8 with the checkout's committed transcoder.
 * @param {Uint8Array} bytes
 * @param {string} root  checkout whose tools/bin/ktx-wasm decodes
 */
export async function decodeKtx2(bytes, root) {
  const dir = join(root, 'tools', 'bin', 'ktx-wasm');
  if (!existsSync(join(dir, 'libktx_read.cjs'))) throw new Error('tools/bin/ktx-wasm is missing: KTX2 files cannot be decoded');
  if (!transcoders.has(dir)) {
    const create = createRequire(import.meta.url)(join(dir, 'libktx_read.cjs'));
    transcoders.set(dir, create({ wasmBinary: readFileSync(join(dir, 'libktx_read.wasm')) }));
  }
  const ktx = await transcoders.get(dir);
  const tex = new ktx.ktxTexture(bytes);
  try {
    if (tex.needsTranscoding) {
      const rc = tex.transcodeBasis(ktx.TranscodeTarget.RGBA8888, 0);
      const code = typeof rc === 'object' && rc !== null && 'value' in rc ? rc.value : rc;
      if (code !== 0) throw new Error(`KTX2 transcode failed (${code})`);
    }
    const data = new Uint8Array(tex.getImage(0, 0, 0));
    const { baseWidth: width, baseHeight: height } = tex;
    if (data.length !== width * height * 4) throw new Error('KTX2 level 0 is not 8-bit RGBA after transcoding');
    return { width, height, channels: 4, data, levels: new DataView(bytes.buffer, bytes.byteOffset).getUint32(40, true) };
  } finally {
    tex.delete();
  }
}

// ------------------------------------------------------------------------------------------ meshes

/**
 * The JSON document of a glb (its first chunk) or of a .gltf file.
 * @param {Uint8Array} bytes
 * @returns {any}
 */
export function gltfJson(bytes) {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.readUInt32LE(0) !== 0x46546c67) return JSON.parse(buf.toString('utf8'));
  const len = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error('glb: the first chunk is not JSON');
  return JSON.parse(buf.toString('utf8', 20, 20 + len));
}

/**
 * What a model's glTF must hold for its manifest entry (src/contracts/assets.js ModelParams): every pivot node, and
 * TEXCOORD_1 plus TANGENT on every primitive when the entry ships baked normal or occlusion maps.
 * @param {Record<string, any>} entry
 * @param {Uint8Array} bytes
 * @returns {string[]}
 */
export function modelProblems(entry, bytes) {
  const gltf = gltfJson(bytes);
  /** @type {string[]} */
  const out = [];
  const names = new Set((gltf.nodes || []).map((/** @type {any} */ n) => n.name));
  for (const [role, p] of Object.entries(entry.params?.pivots || {})) {
    if (!names.has(/** @type {any} */ (p).node)) out.push(`pivot '${role}' names node '${/** @type {any} */ (p).node}', which the glTF lacks`);
  }
  if (entry.files && ('normal' in entry.files || 'occlusion' in entry.files)) {
    const missing = (gltf.meshes || []).flatMap((/** @type {any} */ m) =>
      (m.primitives || []).filter((/** @type {any} */ p) => !('TEXCOORD_1' in (p.attributes || {}) && 'TANGENT' in (p.attributes || {}))).map(() => m.name || '(unnamed)')
    );
    if (missing.length) out.push(`baked maps need TEXCOORD_1 and TANGENT on every primitive; mesh ${[...new Set(missing)].join(', ')} lacks them`);
  }
  return out;
}

/**
 * Triangle and bone counts of a glTF (glb or embedded-buffer gltf), from its JSON: triangles of every TRIANGLES
 * primitive of every mesh, and the distinct joints of every skin.
 * @param {Uint8Array} bytes
 */
export function meshCounts(bytes) {
  const gltf = gltfJson(bytes);
  let triangles = 0;
  for (const mesh of gltf.meshes || []) {
    for (const p of mesh.primitives || []) {
      if ((p.mode ?? 4) !== 4) continue;
      const acc = gltf.accessors?.[p.indices ?? p.attributes?.POSITION];
      triangles += Math.floor((acc?.count ?? 0) / 3);
    }
  }
  const joints = new Set((gltf.skins || []).flatMap((/** @type {any} */ s) => s.joints || []));
  return { triangles, bones: joints.size, meshes: (gltf.meshes || []).length };
}

/**
 * Renders a mesh from two fixed views with Workbench (tools/asset-lock/render_mesh.py) into a 512 × 256 RGBA image.
 * @param {string} file
 */
function renderMesh(file) {
  const run = join(TOOL_ROOT, 'tools', 'blender', 'run.sh');
  if (!existsSync(run)) throw new Error('tools/blender/run.sh is missing: meshes cannot be rendered');
  const dir = mkdtempSync(join(tmpdir(), 'asset-lock-mesh-'));
  try {
    const out = join(dir, 'view');
    execFileSync('bash', [run, join(TOOL_ROOT, 'tools', 'asset-lock', 'render_mesh.py'), file, out], { stdio: 'pipe', timeout: 300_000 });
    const [a, b] = [0, 1].map((i) => decodePng(readFileSync(`${out}.${i}.png`)));
    const data = new Uint8Array(a.width * 2 * a.height * 4);
    for (let y = 0; y < a.height; y++) {
      data.set(a.data.subarray(y * a.width * 4, (y + 1) * a.width * 4), y * a.width * 8);
      data.set(b.data.subarray(y * a.width * 4, (y + 1) * a.width * 4), y * a.width * 8 + a.width * 4);
    }
    return { width: a.width * 2, height: a.height, channels: 4, data };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------------------------------------ audio

/**
 * Mono samples of an audio file: WAV (PCM 8/16/24/32 or float 32/64) directly, other formats through ffmpeg.
 * @param {string} file
 * @returns {{ rate: number, samples: Float64Array }}
 */
export function readAudio(file) {
  const bytes = readFileSync(file);
  if (bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WAVE') return decodeWav(bytes);
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', '48000', '-f', 'f64le', '-'], { maxBuffer: 1 << 30 });
  return { rate: 48000, samples: new Float64Array(raw.buffer, raw.byteOffset, raw.byteLength / 8).slice() };
}

/** @param {Buffer} b */
function decodeWav(b) {
  let pos = 12;
  let fmt = null;
  while (pos + 8 <= b.length) {
    const id = b.toString('latin1', pos, pos + 4);
    const size = b.readUInt32LE(pos + 4);
    if (id === 'fmt ') {
      const tag = b.readUInt16LE(pos + 8);
      // WAVE_FORMAT_EXTENSIBLE keeps the real format in the first two bytes of its sub-format GUID
      const format = tag === 0xfffe && size >= 40 ? b.readUInt16LE(pos + 8 + 24) : tag;
      fmt = { format, channels: b.readUInt16LE(pos + 10), rate: b.readUInt32LE(pos + 12), bits: b.readUInt16LE(pos + 22) };
    }
    if (id === 'data' && fmt) {
      const { channels, bits, rate, format } = fmt;
      if (format !== 1 && format !== 3) throw new Error(`WAV format ${format} is neither PCM nor float`);
      const bytesPer = bits / 8;
      const frames = Math.floor(size / (bytesPer * channels));
      const samples = new Float64Array(frames);
      for (let f = 0; f < frames; f++) {
        let s = 0;
        for (let c = 0; c < channels; c++) {
          const o = pos + 8 + (f * channels + c) * bytesPer;
          if (format === 3) s += bits === 64 ? b.readDoubleLE(o) : b.readFloatLE(o);
          else if (bits === 8) s += (b[o] - 128) / 128;
          else if (bits === 16) s += b.readInt16LE(o) / 32768;
          else if (bits === 24) s += b.readIntLE(o, 3) / 8388608;
          else s += b.readInt32LE(o) / 2147483648;
        }
        samples[f] = s / channels;
      }
      return { rate, samples };
    }
    pos += 8 + size + (size & 1);
  }
  throw new Error('WAV without fmt / data chunks');
}

/** In-place iterative radix-2 FFT. @param {Float64Array} re @param {Float64Array} im */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
    }
  }
}

export const SPECTROGRAM = Object.freeze({ window: 2048, hop: 512, rows: 256, minHz: 40, floorDb: -100 });

/**
 * A log-frequency, log-magnitude spectrogram as a grayscale image: one column per hop, 256 rows from 40 Hz to
 * Nyquist (high frequencies on top), −100 … 0 dBFS mapped to 0 … 255.
 * @param {Float64Array} samples
 * @param {number} rate
 * @returns {Image}
 */
export function spectrogram(samples, rate) {
  const { window: N, hop, rows, minHz, floorDb } = SPECTROGRAM;
  const cols = Math.max(16, Math.ceil(Math.max(0, samples.length - N) / hop) + 1);
  const hann = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  const data = new Uint8Array(rows * cols);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const bins = Array.from({ length: rows }, (_, r) => (minHz * (rate / 2 / minHz) ** (r / (rows - 1)) * N) / rate);
  for (let c = 0; c < cols; c++) {
    for (let i = 0; i < N; i++) {
      re[i] = (samples[c * hop + i] || 0) * hann[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let r = 0; r < rows; r++) {
      const k = Math.min(N / 2 - 1, bins[r]);
      const k0 = Math.floor(k);
      const t = k - k0;
      const mag = (1 - t) * Math.hypot(re[k0], im[k0]) + t * Math.hypot(re[k0 + 1], im[k0 + 1]);
      const db = 20 * Math.log10((2 * mag) / (N / 2) + 1e-12);
      data[(rows - 1 - r) * cols + c] = Math.round(Math.max(0, Math.min(1, (db - floorDb) / -floorDb)) * 255);
    }
  }
  return { width: cols, height: rows, channels: 1, data };
}

/**
 * The two K-weighting biquads of BS.1770 at any sample rate (the derivation libebur128 uses; at 48 kHz it gives the
 * standard's published coefficients).
 * @param {number} rate
 */
function kWeighting(rate) {
  const shelfK = Math.tan((Math.PI * 1681.974450955533) / rate);
  const q1 = 0.7071752369554196;
  const vh = 10 ** (3.999843853973347 / 20);
  const vb = vh ** 0.4996667741545416;
  const a0 = 1 + shelfK / q1 + shelfK * shelfK;
  const shelf = {
    b: [(vh + (vb * shelfK) / q1 + shelfK * shelfK) / a0, (2 * (shelfK * shelfK - vh)) / a0, (vh - (vb * shelfK) / q1 + shelfK * shelfK) / a0],
    a: [1, (2 * (shelfK * shelfK - 1)) / a0, (1 - shelfK / q1 + shelfK * shelfK) / a0],
  };
  const hpK = Math.tan((Math.PI * 38.13547087602444) / rate);
  const q2 = 0.5003270373238773;
  const d = 1 + hpK / q2 + hpK * hpK;
  const highpass = { b: [1, -2, 1], a: [1, (2 * (hpK * hpK - 1)) / d, (1 - hpK / q2 + hpK * hpK) / d] };
  return [shelf, highpass];
}

/**
 * Integrated loudness (ITU-R BS.1770-4: K-weighting, 400 ms blocks with 75 % overlap, −70 LUFS absolute and −10 LU
 * relative gates) of a mono signal, in LUFS; −Infinity for silence.
 * @param {Float64Array} samples
 * @param {number} rate
 */
export function loudness(samples, rate) {
  let x = samples;
  for (const { b, a } of kWeighting(rate)) {
    const y = new Float64Array(x.length);
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
      x2 = x1;
      x1 = x[i];
      y2 = y1;
      y1 = v;
      y[i] = v;
    }
    x = y;
  }
  const block = Math.round(0.4 * rate);
  const step = Math.round(0.1 * rate);
  const powers = [];
  for (let s = 0; s + block <= x.length; s += step) {
    let sum = 0;
    for (let i = s; i < s + block; i++) sum += x[i] * x[i];
    powers.push(sum / block);
  }
  const lufs = (/** @type {number} */ p) => -0.691 + 10 * Math.log10(p);
  const mean = (/** @type {number[]} */ ps) => ps.reduce((a, b) => a + b, 0) / ps.length;
  const abs = powers.filter((p) => lufs(p) > -70);
  if (!abs.length) return -Infinity;
  const rel = lufs(mean(abs)) - 10;
  const gated = abs.filter((p) => lufs(p) > rel);
  return lufs(mean(gated));
}

// ------------------------------------------------------------------------------------------ fingerprints

/**
 * @param {string} file
 * @param {string} root  checkout the file belongs to (its KTX2 transcoder decodes)
 * @returns {Promise<Fingerprint>}
 */
export async function fingerprint(file, root) {
  const kind = kindOf(file);
  const bytes = readFileSync(file);
  if (kind === 'texture') {
    const { levels, ...image } = await decodeKtx2(bytes, root);
    return { image, facts: { width: image.width, height: image.height, levels } };
  }
  if (kind === 'image') {
    const image = decodePng(bytes);
    return { image, facts: { width: image.width, height: image.height } };
  }
  if (kind === 'mesh') {
    const counts = meshCounts(bytes);
    return { image: renderMesh(file), facts: counts };
  }
  if (kind === 'audio') {
    const { rate, samples } = readAudio(file);
    return { image: spectrogram(samples, rate), facts: { durationS: samples.length / rate, lufs: loudness(samples, rate) } };
  }
  return { facts: { bytes: bytes.length } };
}

/**
 * Compares a committed file with its re-bake. Byte-identical files compare at SSIM 1 without decoding.
 * @param {string} committed
 * @param {string} rebuilt
 * @param {string} root
 * @returns {Promise<Comparison>}
 */
export async function compare(committed, rebuilt, root) {
  const a = readFileSync(committed);
  const b = readFileSync(rebuilt);
  if (a.equals(b)) return { ssim: 1, problems: [] };
  const kind = kindOf(committed);
  if (kind === 'bytes') return { ssim: null, problems: ['differs byte for byte (no image fingerprint for this file type)'] };
  const [fa, fb] = [await fingerprint(committed, root), await fingerprint(rebuilt, root)];
  /** @type {string[]} */
  const problems = [];
  for (const [k, v] of Object.entries(fa.facts)) {
    const w = fb.facts[k];
    if (k === 'durationS') {
      if (Math.abs(Number(v) - Number(w)) > DURATION_TOLERANCE_S) problems.push(`duration ${Number(w).toFixed(3)} s, committed ${Number(v).toFixed(3)} s`);
    } else if (k === 'lufs') {
      if (!(Math.abs(Number(v) - Number(w)) <= LOUDNESS_TOLERANCE_LU) && v !== w) problems.push(`loudness ${Number(w).toFixed(2)} LUFS, committed ${Number(v).toFixed(2)} LUFS`);
    } else if (v !== w) problems.push(`${k} ${w}, committed ${v}`);
  }
  if (!fa.image || !fb.image) return { ssim: null, problems };
  if (fa.image.width !== fb.image.width || fa.image.height !== fb.image.height) return { ssim: null, problems: [...problems, 'the fingerprint images differ in size'] };
  const s = ssim(fa.image, fb.image).min;
  if (s < SSIM_MIN) problems.push(`SSIM ${s.toFixed(4)} < ${SSIM_MIN}`);
  return { ssim: s, problems };
}
