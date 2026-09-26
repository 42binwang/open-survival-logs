// @ts-check
// Look-reference fetcher (WP-P0-04): the Steam store screenshots and trailer frames of Survival Log (app 4164790).
// Look reference only: never traced, never shipped, never part of the build.
//
//   node tools/targets/fetch-targets.mjs [--appdetails <file>] [--even 30] [--scene 0.12] [--dissolve 15]
//                                        [--min-shot 0.3] [--dedupe 5] [--force]
//   node tools/targets/fetch-targets.mjs --verify
//
// Needs ffmpeg and ffprobe on PATH (or the FFMPEG / FFPROBE variables). Writes assets/targets/source/ (screenshots/,
// store/, trailer/, manifest.json). The remuxed trailer and the per-frame scene scores stay in tools/targets/.cache/.
// Without --appdetails the script reads research/store_appdetails.json and falls back to the live Steam API.

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'assets/targets/source');
const CACHE = path.join(ROOT, 'tools/targets/.cache');
const APP_ID = 4164790;
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || 'ffprobe';
const USAGE = 'Look reference only: never traced, never shipped, never part of the build.';
const RIGHTS = '© Midnight Workshop / Lilith Games. Steam store media fetched for internal look reference.';

// Most of the trailer shows the game inside a static torn-paper frame (game picture scaled by 1740/1920 to x 90..1830,
// y 9..988) with captions below it; cuts are scored on this inner window so the static frame does not mask them.
const INNER_CROP = '1700:880:110:20';

/**
 * @typedef {{ appdetails: string | null, even: number, scene: number, dissolve: number, minShot: number,
 *   dedupe: number, force: boolean, verify: boolean, skipTrailer: boolean }} Options
 * @typedef {{ file: string, kind: string, sourceUrl: string, sha256: string, bytes: number, width: number,
 *   height: number, [key: string]: unknown }} Entry
 */

/** @param {string[]} argv @returns {Options} */
function parseArgs(argv) {
  /** @type {Options} */
  const o = { appdetails: null, even: 30, scene: 0.12, dissolve: 15, minShot: 0.3, dedupe: 5, force: false, verify: false, skipTrailer: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--appdetails') o.appdetails = path.resolve(next());
    else if (a === '--even') o.even = Math.max(24, Number(next()));
    else if (a === '--scene') o.scene = Number(next());
    else if (a === '--dissolve') o.dissolve = Number(next());
    else if (a === '--min-shot') o.minShot = Number(next());
    else if (a === '--dedupe') o.dedupe = Number(next());
    else if (a === '--force') o.force = true;
    else if (a === '--verify') o.verify = true;
    else if (a === '--skip-trailer') o.skipTrailer = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return o;
}

/** @param {Buffer} buf */
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** @param {number} t seconds -> HH:MM:SS.mmm */
function timecode(t) {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = (ms % 60000) / 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
}

/** @param {number} n @param {number} [w] */
const pad = (n, w = 2) => String(n).padStart(w, '0');

/** Width and height from the first SOF marker of a JPEG. @param {Buffer} b */
function jpegSize(b) {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const m = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
    }
    i += 2 + len;
  }
  return { width: 0, height: 0 };
}

/** @param {string} url @param {number} [tries] */
async function download(url, tries = 4) {
  let last;
  for (let k = 0; k < tries; k++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (look-reference fetcher)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 800 * (k + 1)));
    }
  }
  throw last;
}

/** @param {Options} o */
async function loadAppdetails(o) {
  const candidates = [o.appdetails, path.join(ROOT, 'research/store_appdetails.json')].filter(Boolean);
  for (const file of /** @type {string[]} */ (candidates)) {
    if (existsSync(file)) {
      const rel = path.relative(ROOT, file);
      const from = rel.startsWith('..') || path.isAbsolute(rel) ? `research/${path.basename(file)} (outside this checkout)` : rel;
      return { json: JSON.parse(await fs.readFile(file, 'utf8')), from };
    }
  }
  const url = `https://store.steampowered.com/api/appdetails?appids=${APP_ID}&l=english`;
  const buf = await download(url);
  await fs.mkdir(CACHE, { recursive: true });
  await fs.writeFile(path.join(CACHE, 'store_appdetails.json'), buf);
  return { json: JSON.parse(buf.toString('utf8')), from: url };
}

/**
 * Downloads one image (kept byte-identical to the CDN copy) unless it is already on disk.
 * @param {string} url @param {string} rel @param {string} kind @param {Options} o @param {Record<string, unknown>} extra
 * @returns {Promise<Entry>}
 */
async function fetchImage(url, rel, kind, o, extra) {
  const file = path.join(OUT, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  let buf;
  if (!o.force && existsSync(file)) buf = await fs.readFile(file);
  else {
    buf = await download(url);
    await fs.writeFile(file, buf);
  }
  return { file: rel, kind, sourceUrl: url, ...jpegSize(buf), bytes: buf.length, sha256: sha256(buf), ...extra };
}

/** @param {string} text @param {string} base */
function parseMaster(text, base) {
  const lines = text.split(/\r?\n/);
  /** @type {{ url: string, width: number, height: number, bandwidth: number, fps: number }[]} */
  const variants = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXT-X-STREAM-INF:')) continue;
    const attrs = lines[i];
    const res = /RESOLUTION=(\d+)x(\d+)/.exec(attrs);
    const bw = /BANDWIDTH=(\d+)/.exec(attrs);
    const fps = /FRAME-RATE=([\d.]+)/.exec(attrs);
    const uri = lines[i + 1]?.trim();
    if (!uri || !res) continue;
    variants.push({
      url: new URL(uri, base).href,
      width: Number(res[1]),
      height: Number(res[2]),
      bandwidth: bw ? Number(bw[1]) : 0,
      fps: fps ? Number(fps[1]) : 0,
    });
  }
  variants.sort((a, b) => b.width * b.height - a.width * a.height || b.bandwidth - a.bandwidth);
  return variants;
}

/** @param {string} mp4 */
export async function probe(mp4) {
  const { stdout } = await run(FFPROBE, [
    '-v', 'error', '-select_streams', 'v:0', '-count_frames',
    '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames,color_space,color_primaries,color_transfer,color_range:format=duration',
    '-of', 'json', mp4,
  ], { maxBuffer: 16 << 20 });
  const j = JSON.parse(stdout);
  const s = j.streams[0];
  const [num, den] = String(s.r_frame_rate).split('/').map(Number);
  return {
    width: Number(s.width),
    height: Number(s.height),
    fps: num / (den || 1),
    frames: Number(s.nb_read_frames),
    duration: Number(j.format.duration),
    color: { space: s.color_space || 'unknown', primaries: s.color_primaries || 'unknown', transfer: s.color_transfer || 'unknown', range: s.color_range || 'unknown' },
  };
}

/** @param {string} text */
function parseScores(text) {
  /** @type {{ t: number, score: number }[]} */
  const frames = [];
  for (const line of text.split('\n')) {
    const t = /pts_time:([\d.]+)/.exec(line);
    if (t) frames.push({ t: Number(t[1]), score: 0 });
    const s = /lavfi\.scene_score=([\d.]+)/.exec(line);
    if (s && frames.length) frames[frames.length - 1].score = Number(s[1]);
  }
  return frames;
}

/**
 * Scene-change score of every frame (ffmpeg `scene`, inner window), cached next to the video.
 *
 * The cache holds a header naming the input (size and mtime of the video, crop window) and is reused only when the
 * header matches and the scores are complete: one score per frame of the stream and the last timestamp within two
 * frames of the stream end. ffmpeg writes to a temporary file that is renamed into place only after it exits 0, so
 * an interrupted run never leaves a cache behind. `force` always recomputes.
 * @param {string} mp4 @param {{ frames: number, fps: number, duration: number }} info @param {{ force?: boolean }} [opt]
 * @returns {Promise<{ frames: { t: number, score: number }[], regenerated: boolean, reason: string }>}
 */
export async function sceneScores(mp4, info, opt = {}) {
  const txt = path.join(path.dirname(mp4), `${path.basename(mp4, '.mp4')}.inner.scenes.txt`);
  const st = await fs.stat(mp4);
  const key = `# scene-scores v2 input=${path.basename(mp4)} size=${st.size} mtime=${Math.round(st.mtimeMs)} crop=${INNER_CROP}`;
  let reason = opt.force ? 'forced' : 'missing';
  if (!opt.force && existsSync(txt)) {
    const text = await fs.readFile(txt, 'utf8');
    const frames = parseScores(text);
    const last = frames.length ? frames[frames.length - 1].t : -1;
    if (!text.startsWith(key + '\n')) reason = 'input changed or header missing';
    else if (frames.length !== info.frames) reason = `incomplete: ${frames.length} of ${info.frames} frames`;
    else if (last < info.duration - 2 / info.fps) reason = `incomplete: ends at ${last.toFixed(3)} s of ${info.duration.toFixed(3)} s`;
    else return { frames, regenerated: false, reason: 'cache valid' };
  }
  await fs.rm(txt, { force: true });
  const tmp = `${txt}.tmp-${process.pid}`;
  try {
    await run(FFMPEG, ['-hide_banner', '-nostats', '-loglevel', 'error', '-i', path.basename(mp4), '-an',
      '-vf', `crop=${INNER_CROP},select='gte(scene,0)',metadata=mode=print:file=${path.basename(tmp)}`, '-f', 'null', '-'],
    { cwd: path.dirname(mp4), maxBuffer: 64 << 20 });
    const body = await fs.readFile(tmp, 'utf8');
    const frames = parseScores(body);
    if (frames.length !== info.frames) throw new Error(`scene scores: ${frames.length} of ${info.frames} frames`);
    await fs.writeFile(tmp, `${key}\n${body}`);
    await fs.rename(tmp, txt);
    return { frames, regenerated: true, reason };
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

/**
 * Cuts: frames whose scene score passes the threshold and is the local maximum within ±4 frames; cuts closer than
 * `minShot` keep the stronger one.
 * @param {{ t: number, score: number }[]} frames @param {number} thr @param {number} minShot
 */
function findCuts(frames, thr, minShot) {
  /** @type {{ t: number, score: number }[]} */
  const cuts = [];
  for (let i = 1; i < frames.length; i++) {
    const f = frames[i];
    if (f.score < thr) continue;
    let peak = true;
    for (let k = Math.max(0, i - 4); k <= Math.min(frames.length - 1, i + 4); k++) if (frames[k].score > f.score) peak = false;
    if (!peak) continue;
    const prev = cuts[cuts.length - 1];
    if (prev && f.t - prev.t < minShot) {
      if (f.score > prev.score) cuts[cuts.length - 1] = f;
    } else cuts.push(f);
  }
  return cuts;
}

/**
 * Dissolves and fades: the per-frame scene score stays low through them, so compare 32×18 grey thumbnails of the
 * inner window 0.5 s apart (4 fps); a local maximum of the mean absolute difference above `thr` with no hard cut
 * within 0.6 s is a boundary.
 * @param {string} mp4 @param {number} thr @param {{ t: number }[]} hardCuts
 */
async function findDissolves(mp4, thr, hardCuts) {
  const { stdout } = await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', mp4,
    '-vf', `crop=${INNER_CROP},fps=4,scale=32:18:flags=area,format=gray`, '-f', 'rawvideo', '-'],
  { encoding: 'buffer', maxBuffer: 64 << 20 });
  const buf = /** @type {Buffer} */ (/** @type {unknown} */ (stdout));
  const size = 32 * 18;
  const n = Math.floor(buf.length / size);
  const frame = (/** @type {number} */ i) => buf.subarray(i * size, (i + 1) * size);
  /** @type {number[]} */
  const d = [];
  for (let i = 0; i + 2 < n; i++) d.push(meanAbsDiff(frame(i), frame(i + 2)));
  /** @type {{ t: number, score: number, kind: string }[]} */
  const out = [];
  for (let i = 1; i + 1 < d.length; i++) {
    if (d[i] < thr || d[i] < d[i - 1] || d[i] < d[i + 1]) continue;
    const t = (i + 1.5) / 4;
    if (hardCuts.some((c) => Math.abs(c.t - t) < 0.6)) continue;
    out.push({ t, score: +(d[i] / 255).toFixed(3), kind: 'dissolve' });
  }
  return out;
}

/** 32×18 grey thumbnail of the frame at t, for near-duplicate checks. @param {string} mp4 @param {number} t */
async function thumb(mp4, t) {
  const { stdout } = await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-ss', t.toFixed(3), '-i', mp4, '-frames:v', '1',
    '-vf', 'scale=32:18:flags=area,format=gray', '-f', 'rawvideo', '-'], { encoding: 'buffer', maxBuffer: 1 << 20 });
  return /** @type {Buffer} */ (/** @type {unknown} */ (stdout));
}

/** @param {Buffer} a @param {Buffer} b */
function meanAbsDiff(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += Math.abs(a[i] - b[i]);
  return n ? s / n : 255;
}

/**
 * One frame as JPEG. The trailer is BT.709 limited range; it is converted explicitly to full-range BT.601 4:4:4
 * (what JFIF decoders assume) so decoded RGB matches the video.
 * @param {string} mp4 @param {number} t @param {string} file
 */
async function extractFrame(mp4, t, file) {
  await run(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-ss', t.toFixed(3), '-i', mp4, '-frames:v', '1',
    '-vf', 'scale=in_color_matrix=bt709:in_range=tv:out_color_matrix=bt601:out_range=pc:flags=accurate_rnd+full_chroma_int,format=yuvj444p',
    '-q:v', '2', file], { maxBuffer: 16 << 20 });
  return fs.readFile(file);
}

/** @template T @param {T[]} items @param {number} n @param {(x: T) => Promise<void>} fn */
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

/** @param {any} movie @param {Options} o */
async function fetchTrailer(movie, o) {
  const master = movie.hls_h264;
  const variants = parseMaster((await download(master)).toString('utf8'), master);
  const best = variants[0];
  if (!best) throw new Error('no video variant in the HLS master playlist');
  await fs.mkdir(CACHE, { recursive: true });
  const mp4 = path.join(CACHE, `trailer_${movie.id}_${best.height}p.mp4`);
  if (o.force || !existsSync(mp4)) {
    await run(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-i', best.url, '-map', '0:v:0', '-c', 'copy', mp4], { maxBuffer: 64 << 20 });
  }
  const info = await probe(mp4);
  const scores = await sceneScores(mp4, info, { force: o.force });
  console.log(`scene scores: ${scores.regenerated ? `computed (${scores.reason})` : 'cache valid'}, ${scores.frames.length} frames`);
  const frames = scores.frames;
  const hard = findCuts(frames, o.scene, o.minShot).map((c) => ({ ...c, kind: 'cut' }));
  const cuts = [...hard, ...(await findDissolves(mp4, o.dissolve, hard))].sort((a, b) => a.t - b.t);
  const bounds = [0, ...cuts.map((c) => c.t), info.duration];
  /** @type {{ index: number, start: number, end: number, cutScore: number, cutKind: string }[]} */
  const shots = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    shots.push({ index: i + 1, start: bounds[i], end: bounds[i + 1], cutScore: i ? cuts[i - 1].score : 1, cutKind: i ? cuts[i - 1].kind : 'start' });
  }
  const shotAt = (/** @type {number} */ t) => shots.find((s) => t >= s.start && t < s.end) || shots[shots.length - 1];

  /** @type {{ kind: string, t: number, shot: number, name: string, extra: Record<string, unknown> }[]} */
  const picks = [];
  for (let i = 0; i < o.even; i++) {
    const t = ((i + 0.5) * info.duration) / o.even;
    picks.push({ kind: 'trailer-even', t, shot: shotAt(t).index, name: `even_${pad(i + 1)}_t${t.toFixed(3).padStart(7, '0')}s.jpg`, extra: {} });
  }
  /** @type {Buffer | null} */
  let lastThumb = null;
  let kept = 0;
  const dropped = [];
  for (const s of shots) {
    if (s.end - s.start < o.minShot) {
      dropped.push({ shot: s.index, start: +s.start.toFixed(3), end: +s.end.toFixed(3), reason: 'shorter than --min-shot' });
      continue;
    }
    const t = (s.start + s.end) / 2;
    const th = await thumb(mp4, t);
    const diff = lastThumb ? meanAbsDiff(th, lastThumb) : 255;
    if (diff < o.dedupe) {
      dropped.push({ shot: s.index, start: +s.start.toFixed(3), end: +s.end.toFixed(3), reason: `same picture as the previous shot (mean abs diff ${diff.toFixed(1)})` });
      continue;
    }
    lastThumb = th;
    kept++;
    picks.push({
      kind: 'trailer-shot',
      t,
      shot: s.index,
      name: `shot_${pad(kept)}_t${t.toFixed(3).padStart(7, '0')}s.jpg`,
      extra: { shotStart: +s.start.toFixed(3), shotEnd: +s.end.toFixed(3), cutKind: s.cutKind, cutScore: +s.cutScore.toFixed(3) },
    });
  }

  const dir = path.join(OUT, 'trailer');
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  /** @type {Entry[]} */
  const entries = [];
  await pool(picks, 6, async (p) => {
    const rel = `trailer/${p.name}`;
    const buf = await extractFrame(mp4, p.t, path.join(OUT, rel));
    entries.push({
      file: rel,
      kind: p.kind,
      sourceUrl: master,
      variantUrl: best.url,
      timecode: timecode(p.t),
      t: +p.t.toFixed(3),
      frame: Math.round(p.t * info.fps),
      shot: p.shot,
      ...p.extra,
      ...jpegSize(buf),
      bytes: buf.length,
      sha256: sha256(buf),
    });
  });
  entries.sort((a, b) => a.kind.localeCompare(b.kind) || Number(a.t) - Number(b.t));
  const mp4Buf = await fs.readFile(mp4);
  return {
    trailer: {
      id: movie.id,
      name: String(movie.name).trim(),
      sourceUrl: master,
      variantUrl: best.url,
      variant: `${best.width}x${best.height}@${best.fps || info.fps}`,
      duration: +info.duration.toFixed(3),
      fps: info.fps,
      frames: info.frames,
      color: info.color,
      decode: 'BT.709 limited range -> full-range BT.601 YCbCr 4:4:4 JPEG (q:v 2)',
      remuxSha256: sha256(mp4Buf),
      innerCrop: INNER_CROP,
      sceneThreshold: o.scene,
      dissolveThreshold: o.dissolve,
      minShot: o.minShot,
      dedupeMeanAbsDiff: o.dedupe,
      cuts: cuts.map((c) => ({ t: +c.t.toFixed(3), timecode: timecode(c.t), kind: c.kind, score: +c.score.toFixed(3) })),
      shots: shots.map((s) => ({ index: s.index, start: +s.start.toFixed(3), end: +s.end.toFixed(3) })),
      droppedShots: dropped,
    },
    entries,
  };
}

async function verify() {
  const manifest = JSON.parse(await fs.readFile(path.join(OUT, 'manifest.json'), 'utf8'));
  let bad = 0;
  for (const e of manifest.files) {
    const file = path.join(OUT, e.file);
    if (!existsSync(file)) {
      console.error(`missing  ${e.file}`);
      bad++;
      continue;
    }
    const h = sha256(await fs.readFile(file));
    if (h !== e.sha256) {
      console.error(`mismatch ${e.file}`);
      bad++;
    }
  }
  const count = (/** @type {string} */ k) => manifest.files.filter((/** @type {Entry} */ e) => e.kind === k).length;
  console.log(`${manifest.files.length - bad}/${manifest.files.length} files verified (screenshots ${count('screenshot')}, ` +
    `trailer frames ${count('trailer-even') + count('trailer-shot')})`);
  if (bad) process.exit(1);
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.verify) return verify();
  const { json, from } = await loadAppdetails(o);
  const data = json[String(APP_ID)]?.data;
  if (!data) throw new Error('appdetails has no data for app 4164790');
  await fs.mkdir(OUT, { recursive: true });

  /** @type {Entry[]} */
  const files = [];
  const shots = data.screenshots || [];
  for (let i = 0; i < shots.length; i++) {
    const url = shots[i].path_full;
    const id = /ss_([0-9a-f]{8})/.exec(url)?.[1] || String(shots[i].id);
    files.push(await fetchImage(url, `screenshots/ss_${pad(i + 1)}_${id}.jpg`, 'screenshot', o, { steamIndex: shots[i].id }));
  }
  const art = [
    ['header', data.header_image],
    ['capsule', data.capsule_imagev5 || data.capsule_image],
    ['page_background', data.background_raw],
    ['trailer_thumbnail', data.movies?.[0]?.thumbnail],
  ];
  for (const [name, url] of art) if (url) files.push(await fetchImage(url, `store/${name}.jpg`, 'store-art', o, {}));

  let trailer = null;
  if (!o.skipTrailer && data.movies?.length) {
    const t = await fetchTrailer(data.movies[0], o);
    trailer = t.trailer;
    files.push(...t.entries);
  } else if (existsSync(path.join(OUT, 'manifest.json'))) {
    const old = JSON.parse(await fs.readFile(path.join(OUT, 'manifest.json'), 'utf8'));
    trailer = old.trailer;
    files.push(...old.files.filter((/** @type {Entry} */ e) => e.kind.startsWith('trailer')));
  }

  const { stdout: ffv } = await run(FFMPEG, ['-version']);
  const manifest = {
    generatedBy: 'tools/targets/fetch-targets.mjs',
    generatedAt: new Date().toISOString(),
    app: { id: APP_ID, name: data.name, developers: data.developers, publishers: data.publishers },
    usage: USAGE,
    rights: RIGHTS,
    appdetailsFrom: from,
    ffmpeg: ffv.split('\n')[0],
    counts: {
      screenshots: files.filter((e) => e.kind === 'screenshot').length,
      storeArt: files.filter((e) => e.kind === 'store-art').length,
      trailerEven: files.filter((e) => e.kind === 'trailer-even').length,
      trailerShots: files.filter((e) => e.kind === 'trailer-shot').length,
    },
    trailer,
    files,
  };
  await fs.writeFile(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.writeFile(path.join(OUT, 'README.md'), [
    '# Look-reference targets (source)',
    '',
    `${USAGE} ${RIGHTS}`,
    '',
    'Regenerate with `node tools/targets/fetch-targets.mjs`; check hashes with `node tools/targets/fetch-targets.mjs --verify`.',
    'See `docs/ART.md` for what was measured from these files.',
    '',
  ].join('\n'));
  const c = manifest.counts;
  console.log(`screenshots ${c.screenshots}, store art ${c.storeArt}, trailer frames ${c.trailerEven} even + ${c.trailerShots} shots` +
    (trailer ? ` (${trailer.cuts.length} cuts in ${trailer.duration} s)` : ''));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((e) => {
  console.error(e);
  process.exit(1);
});
