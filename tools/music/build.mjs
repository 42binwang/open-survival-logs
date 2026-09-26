#!/usr/bin/env node
// @ts-check
// Composes, renders and masters the music layers.
//
//   node tools/music/build.mjs [id ...] [--frozen]
//
// For each composition (tools/music/compositions/<id>.mjs): writes assets/audio/music/midi/<id>.mid, reads it back,
// fetches (and locks) exactly the sample files its notes reach, renders every track through its SFZ instrument
// (loops are rendered twice and the second pass kept, so tails wrap around seamlessly), mixes with per-track EQ, pan
// and a hall send, masters to -16 LUFS integrated / -1 dBTP (checked on the encoded file with ffmpeg) and writes
// assets/audio/music/<id>.ogg plus assets/audio/music/music.json (tempo grid, loop points, loudness, samples used).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { SR, filterChannels, makeChannels, compress, dbToGain, biquad, runBiquad } from '../audio/lib/dsp.mjs';
import { convolveChannels } from '../audio/lib/fft.mjs';
import { decode, rel, ROOT, writeWav } from '../audio/lib/io.mjs';
import { integratedLoudness, momentaryMax } from '../audio/lib/loudness.mjs';
import { masterToOgg } from '../audio/lib/master.mjs';
import { makeIR } from '../audio/spaces.mjs';
import { ensureFiles, githubRaw } from '../audio/fetch.mjs';
import { updateManifest } from '../audio/manifest.mjs';
import { readMidi, tempoMap, writeMidi } from './midi.mjs';
import { INSTRUMENTS, LIBS, MUSIC, SFZ_DIR, cacheName, calibrationSample, instrument, readCatalog, sfzText, sourceId } from './instruments.mjs';
import { detectPitch } from './pitch.mjs';
import { Instrument, clearSampleCache, renderTrack } from './sampler.mjs';
import { hzToKey, noteName } from './theory.mjs';

export const OUT = join(ROOT, 'assets', 'audio', 'music');
export const COMPOSITIONS = ['night', 'night-to-horde', 'horde', 'horde-end', 'pre-outbreak', 'day', 'ending'];
export const TARGET_LUFS = -16;

/**
 * @typedef {import('../audio/lib/dsp.mjs').FilterSpec} FilterSpec
 * @typedef {{ eq?: FilterSpec[], width?: number, gainDb?: number, level?: number }} TrackMix  level: target loudness of the
 *   dry track in LUFS (integrated over the parts where it plays); the build sets the gain to reach it
 * @typedef {{ id: string, title: string, layer: string, score: import('./score.mjs').Score,
 *   mix?: { tracks?: Record<string, TrackMix>, reverbReturnDb?: number, master?: FilterSpec[], glue?: boolean } }} Composition
 */

/** @param {string} trackName */
const instrumentOf = (trackName) => trackName.split('#')[0];

/**
 * Notes and controllers of a parsed MIDI file, in seconds.
 * @param {import('./midi.mjs').MidiFile} file
 */
function tracksOf(file) {
  const toSec = tempoMap(file);
  return file.tracks.slice(1).map((t) => {
    /** @type {Map<string, { t0: number, vel: number }[]>} */
    const open = new Map();
    /** @type {import('./sampler.mjs').NoteSpan[]} */
    const notes = [];
    /** @type {import('./sampler.mjs').CcPoint[]} */
    const ccs = [];
    for (const e of [...t.events].sort((a, b) => a.tick - b.tick)) {
      if (e.type === 'on') {
        const k = `${e.ch}:${e.key}`;
        if (!open.has(k)) open.set(k, []);
        /** @type {{ t0: number, vel: number }[]} */ (open.get(k)).push({ t0: toSec(e.tick), vel: e.vel });
      } else if (e.type === 'off') {
        const st = open.get(`${e.ch}:${e.key}`)?.shift();
        if (st) notes.push({ t0: st.t0, t1: toSec(e.tick), key: e.key, vel: st.vel });
      } else if (e.type === 'cc') ccs.push({ t: toSec(e.tick), cc: e.cc, value: e.value });
    }
    return { name: t.name, notes, ccs };
  });
}

/**
 * Writes every SFZ file: key maps from the catalog, pitch-detected keys for the timpani, and gain staging for the
 * instruments the compositions play (their loudest layer calibrated to -20 LUFS-M on a reference sample near the
 * middle of the range; natural level differences between velocity layers are kept).
 * @param {Set<string>} usedInstruments
 */
async function writeSfzFiles(usedInstruments) {
  const catalog = readCatalog();
  const report = [];
  mkdirSync(SFZ_DIR, { recursive: true });
  /** @type {Record<string, { volumeDb: number, reference: string, measured: number }>} */
  const cal = {};
  for (const def of INSTRUMENTS.filter((d) => usedInstruments.has(d.id) && !d.calibrateWith)) {
    const lib = LIBS[def.lib];
    const ref = calibrationSample(def, catalog[def.id]);
    const [path] = await ensureFiles(sourceMeta(def), [{ url: githubRaw(lib.repo, lib.commit, ref.path), path: cacheName(ref) }], [`music:${def.id}`]);
    let x = decode(path);
    const n = x[0].length;
    let a = 0;
    let peak = 0;
    for (const ch of x) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(ch[i]));
    while (a < n && Math.abs(x[0][a]) < peak * 0.008) a++;
    x = x.map((ch) => ch.slice(a));
    const measured = momentaryMax(x);
    cal[def.id] = { volumeDb: Math.round((-20 - measured) * 10) / 10, reference: ref.file, measured };
  }
  for (const def of INSTRUMENTS.filter((d) => d.calibrateWith && cal[d.calibrateWith])) cal[def.id] = cal[/** @type {string} */ (def.calibrateWith)];
  writeFileSync(join(MUSIC, 'calibration.json'), `${JSON.stringify(cal, null, 1)}\n`);

  /** @type {Record<string, number[]>} drum number -> detected keys of its hits; the rolls are the same drums */
  const byDrum = {};
  for (const def of INSTRUMENTS) {
    const samples = catalog[def.id].map((s) => ({ ...s }));
    if (def.detectPitch) {
      const lib = LIBS[def.lib];
      const paths = await ensureFiles(sourceMeta(def), samples.map((s) => ({ url: githubRaw(lib.repo, lib.commit, s.path), path: cacheName(s) })), [`music:${def.id}`]);
      if (def.id === 'timpani') {
        samples.forEach((s, i) => {
          const x = decode(paths[i]);
          const hz = detectPitch(x[0], { from: 0.12, to: 1.5, fmin: 55, fmax: 260, threshold: 0.2 });
          const drum = /Timpani(\d)/.exec(s.file)?.[1] ?? '0';
          if (hz) (byDrum[drum] ??= []).push(hzToKey(hz));
        });
        for (const [drum, keys] of Object.entries(byDrum)) report.push(`timpani drum ${drum}: ${noteName(modeKey(keys))}`);
      }
      for (const s of samples) {
        const drum = /Timpani(\d)/.exec(s.file)?.[1] ?? '0';
        if (!byDrum[drum]?.length) throw new Error(`${def.id}: no pitch found for drum ${drum}`);
        s.key = modeKey(byDrum[drum]);
      }
    }
    writeFileSync(join(SFZ_DIR, `${def.id}.sfz`), sfzText(def, samples, cal[def.id] ?? null));
  }
  return report;
}

/** Most frequent semitone among detections (octave slips on loud hits are outvoted); ties go low. @param {number[]} keys */
function modeKey(keys) {
  /** @type {Map<number, number>} */
  const count = new Map();
  for (const x of keys) count.set(Math.round(x), (count.get(Math.round(x)) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

/** @param {import('./instruments.mjs').InstrumentDef} def */
function sourceMeta(def) {
  const lib = LIBS[def.lib];
  return {
    id: sourceId(def),
    provider: def.lib === 'vsco' ? 'VSCO 2 Community Edition (GitHub)' : 'VCSL (GitHub)',
    title: `${lib.title}: ${def.title}`,
    page: `${lib.page}/tree/${lib.commit}/${def.folder.split('/').map(encodeURIComponent).join('/')}`,
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    authors: lib.authors,
    kind: 'audio',
    creationMethod: 'Multisampled instrument recording',
  };
}

/**
 * Downloads (and locks) the samples a set of notes reaches, all round-robin siblings included.
 * @param {string} instId
 * @param {import('./sampler.mjs').NoteSpan[]} notes
 * @param {import('./sampler.mjs').CcPoint[]} ccs
 * @param {string} usedFor
 */
async function fetchNeeded(instId, notes, ccs, usedFor) {
  const catalog = readCatalog();
  const ids = [instId, ...(instrument(instId).includes ?? [])];
  for (const id of ids) {
    const def = instrument(id);
    const sfz = join(SFZ_DIR, `${id}.sfz`);
    if (!existsSync(sfz)) throw new Error(`missing ${rel(sfz)} (run node tools/music/instruments.mjs)`);
    const inst = new Instrument(sfz);
    /** @type {Set<string>} */
    const files = new Set();
    for (const r of inst.regions) {
      if (r.trigger === 'cc') {
        if (ccs.some((c) => c.cc === r.onCc?.cc)) files.add(basename(r.sample));
        continue;
      }
      if (notes.some((n) => n.key >= r.lokey && n.key <= r.hikey && n.vel >= r.lovel && n.vel <= r.hivel)) files.add(basename(r.sample));
    }
    if (!files.size) continue;
    const lib = LIBS[def.lib];
    const wanted = catalog[id].filter((s) => files.has(cacheName(s)));
    await ensureFiles(sourceMeta(def), wanted.map((s) => ({ url: githubRaw(lib.repo, lib.commit, s.path), path: cacheName(s) })), [usedFor]);
  }
}

/**
 * StereoPannerNode law for a stereo input, in place.
 * @param {Float32Array[]} st
 * @param {number} pan
 */
function stereoPan(st, pan) {
  if (Math.abs(pan) < 1e-3) return;
  const x = pan <= 0 ? pan + 1 : pan;
  const gl = Math.cos((x * Math.PI) / 2);
  const gr = Math.sin((x * Math.PI) / 2);
  const [L, R] = st;
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    const r = R[i];
    if (pan <= 0) {
      L[i] = l + r * gl;
      R[i] = r * gr;
    } else {
      L[i] = l * gl;
      R[i] = r + l * gr;
    }
  }
}

/** @param {Float32Array[]} st @param {number} w */
function width(st, w) {
  const [L, R] = st;
  for (let i = 0; i < L.length; i++) {
    const m = (L[i] + R[i]) / 2;
    const s = ((L[i] - R[i]) / 2) * w;
    L[i] = m + s;
    R[i] = m - s;
  }
}

/**
 * @param {string} id
 * @param {{ hallIR: Float32Array[] }} ctx
 */
async function buildOne(id, ctx) {
  const t0 = Date.now();
  /** @type {{ default: Composition }} */
  const mod = await import(`./compositions/${id}.mjs`);
  const comp = mod.default;
  const score = comp.score;
  mkdirSync(join(OUT, 'midi'), { recursive: true });
  const midPath = join(OUT, 'midi', `${id}.mid`);
  writeFileSync(midPath, writeMidi(score.toMidi()));
  const parsed = readMidi(readFileSync(midPath));
  const tracks = tracksOf(parsed);
  const L = score.lengthSeconds;
  const loopN = Math.round(L * SR);
  const tail = score.loop ? 0 : score.tail;
  const renderLen = score.loop ? 2 * L + 4 : L + tail;
  const frames = Math.ceil(renderLen * SR);
  for (const t of tracks) await fetchNeeded(instrumentOf(t.name), t.notes, t.ccs, `music:${id}`);

  const mixBus = makeChannels(frames);
  const send = makeChannels(frames);
  /** @type {Set<string>} */
  const used = new Set();
  /** @type {{ track: string, notes: number, lufs: number, gainDb: number }[]} */
  const levels = [];
  let seed = 1;
  for (const t of tracks) {
    const inst = new Instrument(join(SFZ_DIR, `${instrumentOf(t.name)}.sfz`));
    let notes = t.notes;
    let ccs = t.ccs;
    if (score.loop) {
      notes = [...notes, ...notes.map((n) => ({ ...n, t0: n.t0 + L, t1: n.t1 + L }))];
      ccs = [...ccs, ...ccs.map((c) => ({ ...c, t: c.t + L }))];
    }
    const st = renderTrack(inst, notes, ccs, frames, { seed: seed++, used, loopAt: score.loop ? L : undefined });
    const m = comp.mix?.tracks?.[t.name] ?? {};
    if (m.eq) filterChannels(st, m.eq);
    if (m.width != null) width(st, m.width);
    const pan = ((t.ccs.find((c) => c.cc === 10)?.value ?? 64) - 64) / 63;
    stereoPan(st, pan);
    const part = score.loop ? st.map((ch) => ch.slice(loopN, 2 * loopN)) : st;
    const measured = integratedLoudness(part);
    const gainDb = m.level != null && Number.isFinite(measured) ? m.level - measured : (m.gainDb ?? 0);
    const g = dbToGain(gainDb);
    const sendAmt = ((t.ccs.find((c) => c.cc === 91)?.value ?? 40) / 127) ** 2;
    levels.push({ track: t.name, notes: t.notes.length, lufs: Math.round((measured + gainDb) * 10) / 10, gainDb: Math.round(gainDb * 10) / 10 });
    if (process.env.MUSIC_STEMS) {
      console.log(`  ${t.name.padEnd(18)} ${t.notes.length.toString().padStart(4)} notes  ${(measured + gainDb).toFixed(1)} LUFS (gain ${gainDb.toFixed(1)} dB)`);
      writeWav(join(MUSIC, '.build', 'stems', id, `${t.name.replace(/#/g, '-')}.wav`), part.map((ch) => ch.map((v) => v * g)), SR, 'f32');
    }
    for (let c = 0; c < 2; c++) {
      const a = st[c];
      const mb = mixBus[c];
      const sb = send[c];
      for (let i = 0; i < frames; i++) {
        mb[i] += a[i] * g;
        sb[i] += a[i] * g * sendAmt;
      }
    }
  }
  clearSampleCache();

  // Hall reverb on the send bus (pre-delay and decay live in the IR), with the low end kept out of the tail.
  const hp = biquad({ type: 'highpass', freq: 180 });
  for (const ch of send) runBiquad(ch, hp);
  const wet = convolveChannels(send, ctx.hallIR);
  const ret = dbToGain(comp.mix?.reverbReturnDb ?? -4);
  for (let c = 0; c < 2; c++) for (let i = 0; i < frames; i++) mixBus[c][i] += wet[c][i] * ret;

  // Master EQ and glue run on the whole render before a loop is cut out of it, so their state is warm at the seam.
  filterChannels(mixBus, [{ type: 'highpass', freq: 28 }, ...(comp.mix?.master ?? [])]);
  if (comp.mix?.glue !== false) compress(mixBus, { thresholdDb: -20, ratio: 1.7, attack: 0.03, release: 0.3, kneeDb: 8, rms: 0.05 });
  let out;
  if (score.loop) out = mixBus.map((ch) => ch.slice(loopN, 2 * loopN));
  else {
    const n = Math.min(frames, Math.round((L + tail) * SR));
    out = mixBus.map((ch) => ch.slice(0, n));
    // Fade the very end of a one-shot's tail.
    const f = Math.round(0.8 * SR);
    for (const ch of out) for (let i = 0; i < f; i++) ch[ch.length - 1 - i] *= i / f;
  }

  const oggPath = join(OUT, `${id}.ogg`);
  const rep = masterToOgg(oggPath, out, {
    lufs: TARGET_LUFS,
    maxTruePeak: -1,
    quality: 6,
    loop: score.loop,
    comment: [`TITLE=${comp.title}`, 'ARTIST=Survival Logs audio lane (WP-P0-06)', 'LICENSE=original composition; CC0 samples (VSCO 2 CE, VCSL)'],
  });
  const samplesUsed = [...used].map((p) => rel(p)).sort();
  console.log(`${id}: ${(out[0].length / SR).toFixed(2)} s, ${rep.integrated} LUFS, TP ${rep.truePeak} dBTP, LRA ${rep.lra}, ${samplesUsed.length} samples, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return {
    id,
    title: comp.title,
    layer: comp.layer,
    file: rel(oggPath),
    midi: rel(midPath),
    bpm: score.bpm,
    meter: score.meter,
    bars: score.bars,
    barSeconds: (score.beatsPerBar * 60) / score.bpm,
    loop: score.loop,
    lengthSeconds: out[0].length / SR,
    loopEndSample: score.loop ? loopN : null,
    loudness: { integrated: rep.integrated, truePeak: rep.truePeak, lra: rep.lra },
    tracks: levels,
    samples: samplesUsed,
  };
}

async function main() {
  const ids = process.argv.slice(2).filter((a) => !a.startsWith('--')).map((a) => a.replace(/^music-/, ''));
  for (const id of ids) if (!COMPOSITIONS.includes(id)) throw new Error(`unknown composition ${id}`);
  const todo = ids.length ? ids : COMPOSITIONS;
  if (process.argv.includes('--manifest')) {
    const rep = JSON.parse(readFileSync(join(OUT, 'music.json'), 'utf8'));
    updateManifest(rep.stems.map(manifestEntry), (mid) => mid.startsWith('audio/music-'), 'music');
    return;
  }
  /** @type {Set<string>} */
  const used = new Set();
  for (const id of COMPOSITIONS) {
    /** @type {{ default: Composition }} */
    const mod = await import(`./compositions/${id}.mjs`);
    for (const t of mod.default.score.tracks) {
      const inst = instrumentOf(t.name);
      used.add(inst);
      for (const inc of instrument(inst).includes ?? []) used.add(inc);
    }
  }
  const detected = await writeSfzFiles(used);
  for (const line of detected) console.log(line);
  const hallIR = makeIR('hall');
  const reportPath = join(OUT, 'music.json');
  /** @type {{ schema: string, targetLufs: number, stems: any[] }} */
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : { schema: 'survival-logs/music-report@1', targetLufs: TARGET_LUFS, stems: [] };
  for (const id of todo) {
    const r = await buildOne(id, { hallIR });
    report.stems = [...report.stems.filter((s) => s.id !== id), r].sort((a, b) => COMPOSITIONS.indexOf(a.id) - COMPOSITIONS.indexOf(b.id));
    writeFileSync(reportPath, `${JSON.stringify(report, null, 1)}\n`);
  }
  // Only the stems built now: a single-cue rebuild (the asset-lock sandbox) leaves the other entries as they are.
  const built = new Set(todo.map((id) => `audio/music-${id}`));
  updateManifest(report.stems.filter((st) => built.has(`audio/music-${st.id}`)).map(manifestEntry), (mid) => built.has(mid), 'music');
}

/**
 * The asset-manifest entry of a stem; its sources are the lock ids of the instruments whose samples it plays.
 * @param {any} s
 * @returns {import('../audio/manifest.mjs').AudioEntry}
 */
function manifestEntry(s) {
  const sources = [...new Set(/** @type {string[]} */ (s.samples).map((p) => p.split('/').slice(2, 4).join('/')))].sort();
  return {
    id: `audio/music-${s.id}`,
    kind: 'audio',
    path: s.file,
    license: 'LicenseRef-Original',
    sources,
    files: { midi: s.midi },
    params: { title: s.title, category: 'music', bus: 'music', layer: s.layer, loop: s.loop, bpm: s.bpm, meter: s.meter, bars: s.bars, barSeconds: s.barSeconds, loopEndSample: s.loopEndSample },
    meta: { durationSec: s.lengthSeconds, lufs: s.loudness.integrated, truePeak: s.loudness.truePeak, lra: s.loudness.lra, target: { lufs: TARGET_LUFS } },
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) await main();
