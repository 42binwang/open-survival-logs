// @ts-check
// The asset-lock check (tools/asset-lock.mjs) and its shared libraries: PNG read / write, SSIM against
// scikit-image, the fingerprints, the sample rule, and whole runs on fixture checkouts (a clean re-bake, a tampered
// texture, a source missing from the lock, an asset with no build, a hash mismatch).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from '../tools/lib/png.mjs';
import { ssim } from '../tools/lib/ssim.mjs';
import { loudness, meshCounts, spectrogram, compare, modelProblems } from '../tools/asset-lock/fingerprint.mjs';
import { sample } from '../tools/asset-lock/sample.mjs';
import { sandboxDir } from '../tools/asset-lock/sandbox.mjs';
import { makeRepo, editManifest, digestOf } from './fixtures/asset-lock/make-repo.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FIX = join(ROOT, 'tests/fixtures/asset-lock');

/** A deterministic test image. @param {number} w @param {number} h @param {number} ch @param {(x: number, y: number, c: number) => number} f */
function image(w, h, ch, f) {
  const data = new Uint8Array(w * h * ch);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < ch; c++) data[(y * w + x) * ch + c] = Math.max(0, Math.min(255, Math.round(f(x, y, c))));
  return { width: w, height: h, channels: ch, data };
}
const pattern = (/** @type {number} */ x, /** @type {number} */ y) => 128 + 60 * Math.sin(x / 5) * Math.cos(y / 7) + 30 * (((x >> 3) + (y >> 3)) & 1 ? 1 : -1);
const lcg = (seed = 1) => () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);

test('png: every writable layout round-trips through decode as RGBA', () => {
  for (const channels of [1, 2, 3, 4]) {
    const img = image(13, 7, channels, (x, y, c) => x * 17 + y * 29 + c * 61);
    const back = decodePng(encodePng(img));
    assert.deepEqual([back.width, back.height, back.channels], [13, 7, 4]);
    for (let i = 0; i < 13 * 7; i++) {
      const src = [...img.data.subarray(i * channels, (i + 1) * channels)];
      const rgba = [...back.data.subarray(i * 4, i * 4 + 4)];
      const want = channels === 1 ? [src[0], src[0], src[0], 255] : channels === 2 ? [src[0], src[0], src[0], src[1]] : channels === 3 ? [...src, 255] : src;
      assert.deepEqual(rgba, want, `pixel ${i}, ${channels} channel(s)`);
    }
  }
  assert.throws(() => decodePng(new Uint8Array([1, 2, 3])), /not a PNG/);
  const bytes = encodePng(image(4, 4, 3, () => 9));
  bytes[40] ^= 0xff;
  assert.throws(() => decodePng(bytes), /bad CRC/);
});

test('ssim: identical images give 1; more noise and a larger shift give less, in that order', () => {
  const ref = image(96, 64, 1, pattern);
  assert.equal(ssim(ref, ref).mean, 1);
  const rnd = lcg(7);
  const noisy = (/** @type {number} */ amp) => image(96, 64, 1, (x, y) => pattern(x, y) + (rnd() - 0.5) * amp);
  const shifted = (/** @type {number} */ dx) => image(96, 64, 1, (x, y) => pattern(x + dx, y));
  const [n5, n20, n60] = [5, 20, 60].map((a) => ssim(ref, noisy(a)).mean);
  const [s1, s3] = [1, 3].map((d) => ssim(ref, shifted(d)).mean);
  assert.ok(1 > n5 && n5 > n20 && n20 > n60, `noise 5 ${n5}, 20 ${n20}, 60 ${n60}`);
  assert.ok(n5 > 0.99 && n60 < 0.85, `light noise stays near 1 (${n5}), heavy noise falls well below (${n60})`);
  assert.ok(1 > s1 && s1 > s3 && s3 < 0.8, `shift 1 px ${s1}, 3 px ${s3}`);
  const rgba = ssim(image(32, 32, 4, (x, y, c) => pattern(x + c, y)), image(32, 32, 4, (x, y, c) => pattern(x + c, y) + (c === 2 ? 40 : 0)));
  assert.equal(rgba.channels.length, 4);
  assert.ok(rgba.min < rgba.mean && rgba.min === rgba.channels[2], 'the changed channel is the minimum');
  assert.throws(() => ssim(ref, image(95, 64, 1, pattern)), /differ in size/);
});

test('ssim: matches scikit-image structural_similarity on the reference fixtures within 1e-3', () => {
  const ref = JSON.parse(readFileSync(join(FIX, 'ssim/reference.json'), 'utf8'));
  assert.match(ref.implementation, /^scikit-image \d/);
  assert.equal(ref.pairs.length, 4);
  for (const p of ref.pairs) {
    const load = (/** @type {string} */ f) => decodePng(readFileSync(join(FIX, 'ssim', f)));
    const keep = p.channels.length === 1 ? [0] : [0, 1, 2];
    const pick = (/** @type {import('../tools/lib/png.mjs').Image} */ i) => ({ ...i, channels: keep.length, data: i.data.filter((_, k) => keep.includes(k % 4)) });
    const got = ssim(pick(load(p.a)), pick(load(p.b)));
    assert.ok(Math.abs(got.mean - p.ssim) < 1e-3, `${p.a} vs ${p.b}: ${got.mean} vs scikit-image ${p.ssim}`);
    got.channels.forEach((c, i) => assert.ok(Math.abs(c - p.channels[i]) < 1e-3, `${p.a} channel ${i}`));
  }
});

test('audio fingerprint: BS.1770 loudness of a full-scale 997 Hz sine is -3.01 LUFS; the spectrogram tells tones apart', () => {
  const rate = 48000;
  const tone = (/** @type {number} */ f, amp = 1, secs = 2) => Float64Array.from({ length: secs * rate }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / rate));
  assert.ok(Math.abs(loudness(tone(997), rate) - -3.01) < 0.05, `${loudness(tone(997), rate)}`);
  assert.ok(Math.abs(loudness(tone(997, 0.1), rate) - -23.01) < 0.05, 'amplitude 0.1 is 20 dB quieter');
  assert.equal(loudness(new Float64Array(rate), rate), -Infinity, 'silence');
  const a = spectrogram(tone(440), rate);
  assert.deepEqual([a.height, a.channels], [256, 1]);
  assert.equal(ssim(a, spectrogram(tone(440), rate)).mean, 1);
  assert.ok(ssim(a, spectrogram(tone(660), rate)).mean < 0.99, 'another pitch');
  assert.ok(ssim(a, spectrogram(tone(440, 0.99), rate)).mean > 0.99, 'a 0.1 dB level change still matches');
});

test('mesh fingerprint: triangle and bone counts come from the glTF JSON of a glb', () => {
  const json = {
    asset: { version: '2.0' },
    accessors: [{ count: 36 }, { count: 24 }, { count: 9 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 1 }, indices: 0 }, { attributes: { POSITION: 2 } }, { attributes: { POSITION: 2 }, mode: 1 }] }],
    skins: [{ joints: [3, 4, 5] }, { joints: [5, 6] }],
  };
  const body = Buffer.from(JSON.stringify(json).padEnd(Math.ceil(JSON.stringify(json).length / 4) * 4, ' '));
  const glb = Buffer.alloc(20 + body.length);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(body.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  body.copy(glb, 20);
  assert.deepEqual(meshCounts(glb), { triangles: 12 + 3, bones: 4, meshes: 1 });
  assert.deepEqual(meshCounts(Buffer.from(JSON.stringify(json))), { triangles: 15, bones: 4, meshes: 1 }, 'a .gltf file');
});

test('sample: at least 5 % and one per family, the same for the same seed', () => {
  const assets = [
    ...Array.from({ length: 150 }, (_, i) => ({ id: `furniture/f${i}`, family: 'furniture' })),
    ...Array.from({ length: 30 }, (_, i) => ({ id: `icons/i${i}`, family: 'icons' })),
    { id: 'homes/apartment', family: 'homes' },
  ];
  const s = sample(assets, 42);
  assert.equal(s.length, Math.ceil(0.05 * assets.length));
  for (const f of ['furniture', 'icons', 'homes']) assert.ok(s.some((id) => id.startsWith(`${f}/`)), f);
  assert.deepEqual(sample(assets, 42), s, 'deterministic');
  assert.notDeepEqual(sample(assets, 43), s, 'another seed, another sample');
  assert.deepEqual(sample([{ id: 'a/x', family: 'a' }], 1), ['a/x']);
});

/**
 * Runs the tool on a fixture checkout.
 * @param {string} root
 * @param {string[]} [extra]
 */
function run(root, extra = []) {
  const r = spawnSync(process.execPath, [join(ROOT, 'tools/asset-lock.mjs'), '--root', root, '--json', ...extra], { encoding: 'utf8' });
  const line = r.stdout.trim().split('\n').at(-1) || '';
  return { code: r.status, report: line.startsWith('{') ? JSON.parse(line) : null, stderr: r.stderr };
}

/** @param {(root: string) => void} body */
function withRepo(body) {
  const root = makeRepo();
  try {
    body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(sandboxDir(root), { recursive: true, force: true });
  }
}

test('asset-lock: a clean checkout re-bakes its sample (one per family) at SSIM 1 and passes', () => {
  withRepo((root) => {
    const { code, report } = run(root);
    assert.equal(code, 0, JSON.stringify(report?.problems));
    assert.equal(report.ok, true);
    assert.deepEqual(report.problems, []);
    assert.equal(report.sampled.length, 2, 'one texture and the tone');
    assert.ok(report.sampled.includes('sounds/tone') && report.sampled.some((/** @type {string} */ id) => id.startsWith('textures/')));
    assert.ok(report.results.every((/** @type {any} */ r) => r.ssim === 1));
    assert.match(report.summary, /4 asset\(s\) in 2 manifest\(s\) traced .* re-baked 2 .*seed 0/);
    const all = run(root, ['--all']);
    assert.equal(all.code, 0);
    assert.equal(all.report.results.length, 4);
    assert.equal(run(root, ['--asset', 'textures/c']).report.sampled.join(), 'textures/c');
  });
});

test('asset-lock: a tampered texture (digest updated) re-bakes below SSIM 0.99 and fails, naming the asset', () => {
  withRepo((root) => {
    const p = 'assets/textures/a.png';
    const img = decodePng(readFileSync(join(root, p)));
    for (let y = 8; y < 40; y++) for (let x = 8; x < 40; x++) img.data.set([255, 0, 255, 255], (y * img.width + x) * 4);
    writeFileSync(join(root, p), encodePng(img));
    editManifest(root, 'assets/textures/manifest.json', (m) => (m.assets[0].digests[p] = digestOf(root, p)));
    const { code, report } = run(root, ['--asset', 'textures/a']);
    assert.equal(code, 1);
    assert.equal(report.ok, false);
    assert.ok(report.problems.some((/** @type {string} */ q) => /^textures\/a: assets\/textures\/a\.png re-bakes differently: SSIM 0\.\d+ < 0\.99$/.test(q)), report.problems.join('\n'));
    assert.ok(report.results[0].ssim < 0.99);
  });
});

test('asset-lock: a source missing from the lock fails, naming the asset', () => {
  withRepo((root) => {
    editManifest(root, 'assets/textures/manifest.json', (m) => (m.assets[1].sources = ['fixture/pattern', 'fixture/unlocked']));
    const { code, report } = run(root);
    assert.equal(code, 1);
    assert.deepEqual(report.problems, ["textures/b: source 'fixture/unlocked' is not in the asset lock"]);
  });
});

test('asset-lock: a shipped file with no build fails, naming the asset', () => {
  withRepo((root) => {
    editManifest(root, 'assets/textures/manifest.json', (m) => delete m.assets[2].rebuild);
    const { code, report } = run(root);
    assert.equal(code, 1);
    assert.deepEqual(report.problems, ['textures/c: no build (assets/textures/manifest.json names no rebuild recipe for it)']);
  });
});

test('asset-lock: a committed file that no longer matches its digest fails, naming the asset; so does a bad source hash', () => {
  withRepo((root) => {
    const p = join(root, 'assets/sounds/tone.wav');
    const wav = readFileSync(p);
    wav[1000] ^= 0x40;
    writeFileSync(p, wav);
    const first = run(root);
    assert.equal(first.code, 1);
    assert.deepEqual(first.report.problems, ['sounds/tone: assets/sounds/tone.wav does not match its digest (the committed file changed without a rebuild)']);
    writeFileSync(join(root, 'assets/cache/pattern.txt'), '441 5\n');
    const second = run(root);
    assert.ok(second.report.problems.includes('sources: fixture/pattern: pattern.txt does not match its SHA-256'), second.report.problems.join('\n'));
  });
});

test('asset-lock: usage errors exit 2; a checkout without manifests passes with nothing to check', () => {
  withRepo((root) => {
    assert.equal(run(root, ['--seed', 'x']).code, 2);
    assert.equal(run(root, ['--all', '--asset', 'textures/a']).code, 2);
    assert.equal(run(root, ['--asset', 'textures/zzz']).code, 2);
    rmSync(join(root, 'assets/textures'), { recursive: true });
    rmSync(join(root, 'assets/sounds'), { recursive: true });
    const empty = run(root);
    assert.equal(empty.code, 0);
    assert.equal(empty.report.summary, 'no shipped asset manifests yet');
  });
});

test('fingerprint compare: byte-identical files compare at 1 without decoding; other file types must match exactly', async () => {
  const root = makeRepo();
  try {
    const a = join(root, 'assets/textures/a.png');
    assert.deepEqual(await compare(a, a, root), { ssim: 1, problems: [] });
    const x = join(root, 'x.json');
    const y = join(root, 'y.json');
    writeFileSync(x, '{"a":1}');
    writeFileSync(y, '{"a":2}');
    assert.deepEqual(await compare(x, y, root), { ssim: null, problems: ['differs byte for byte (no image fingerprint for this file type)'] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('model checks: pivot nodes must be in the glTF; baked maps need TEXCOORD_1 and TANGENT on every primitive', () => {
  const baked = { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2, TEXCOORD_1: 3, TANGENT: 4 };
  const gltf = (/** @type {any[]} */ primitives, /** @type {string[]} */ nodes) => Buffer.from(JSON.stringify({ asset: { version: '2.0' }, nodes: nodes.map((name) => ({ name })), meshes: [{ name: 'door', primitives }] }));
  const entry = { id: 'furniture/door-front', kind: 'model', files: { normal: 'n.ktx2', occlusion: 'o.ktx2' }, params: { pivots: { leaf: { node: 'leaf_hinge', axis: '-y', openDeg: 90 } } } };
  assert.deepEqual(modelProblems(entry, gltf([{ attributes: baked }], ['door', 'leaf_hinge', 'leaf'])), []);
  const { TANGENT: _t, ...noTangent } = baked;
  assert.deepEqual(modelProblems(entry, gltf([{ attributes: baked }, { attributes: noTangent }], ['door', 'leaf'])), [
    "pivot 'leaf' names node 'leaf_hinge', which the glTF lacks",
    'baked maps need TEXCOORD_1 and TANGENT on every primitive; mesh door lacks them',
  ]);
  assert.deepEqual(modelProblems({ id: 'furniture/sofa', kind: 'model' }, gltf([{ attributes: { POSITION: 0 } }], [])), [], 'no baked maps, no pivots: nothing required');
});
