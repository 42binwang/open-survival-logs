// @ts-check
// Budgets (tools/budgets/): the verdicts, frame times in display frames, the static server's transfer and caching,
// first-interactive and frame sampling in Chromium on light and heavy fixture pages, and the 100-day sim runner.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';
import { BUDGETS, displayFrames, evaluate, framesOf, statsMeasurements } from '../tools/budgets/budgets.mjs';
import { CHANNEL, measureFrames, measureLoads, rendererProblem, shippingRenderer } from '../tools/budgets/browser.mjs';
import { serveStatic } from '../tools/budgets/serve.mjs';
import { png, tempRoot } from './visual/fixtures.mjs';

const run = promisify(execFile);
const REPO = new URL('..', import.meta.url).pathname;

/** measurements at 90 % of every budget */
const allWithin = () => BUDGETS.map((b) => ({ id: b.id, value: b.unit === 'frames' ? b.max : b.max * 0.9, detail: 'fixture' }));

test('budget verdicts: all within passes; one over fails; an unmeasured budget fails like a miss', () => {
  assert.equal(evaluate(allWithin()).ok, true);
  const over = allWithin().map((m) => (m.id === 'initialDownload' ? { ...m, value: 6 * 1024 * 1024 } : m));
  const v = evaluate(over);
  assert.equal(v.ok, false);
  assert.match(v.problems.join(), /initial download: 6\.00 MB over the 5\.00 MB budget/);
  const blind = evaluate(allWithin().map((m) => (m.id === 'drawCalls' ? { ...m, value: null, detail: 'no stats()' } : m)));
  assert.equal(blind.ok, false, 'unmeasured is never a pass');
  assert.equal(blind.results.find((r) => r.id === 'drawCalls')?.status, 'unmeasured');
  assert.equal(evaluate([]).results.every((r) => r.status === 'unmeasured'), true, 'nothing measured, nothing passes');
  const zero = evaluate(allWithin().map((m) => (m.id === 'drawCalls' || m.id === 'gpuMemory' ? { ...m, value: 0 } : m)));
  assert.equal(zero.results.find((r) => r.id === 'drawCalls')?.status, 'unmeasured', 'zero draw calls is no measurement');
  assert.equal(zero.results.find((r) => r.id === 'gpuMemory')?.status, 'unmeasured', 'zero bytes is no measurement');
});

test('renderer stats across scenarios: every scenario must report a positive number, or the budget is unmeasured', () => {
  const f = (/** @type {string} */ id, /** @type {number | null} */ dc, /** @type {number | null} */ gb, frames = 60) => ({ id, renderer: '3d', statsFrames: frames, drawCalls: dc, gpuBytes: gb });
  const ok = statsMeasurements([f('a', 120, 3e8), f('b', 340, 2e8)]);
  assert.deepEqual(ok.map((m) => m.value), [340, 3e8], 'the largest over the scenarios');
  const zero = statsMeasurements([f('a', 120, 3e8), f('b', 0, 0)]);
  assert.deepEqual(zero.map((m) => m.value), [null, null], "one scenario's 0 is no measurement, even beside a real one");
  assert.match(zero[0].detail, /0 draw calls in every frame of b/);
  const none = statsMeasurements([f('a', 120, 3e8), f('b', null, null, 0)]);
  assert.match(none[0].detail, /reported no stats\(\) in b/);
  assert.equal(evaluate(zero).results.find((r) => r.id === 'drawCalls')?.status, 'unmeasured');
  assert.equal(evaluate(ok).results.find((r) => r.id === 'drawCalls')?.status, 'pass');
});

test('the renderer and GL device a run may stand on: the phase shipping renderer, on a GPU', () => {
  const gpu = 'ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max, Unspecified Version)';
  assert.equal(shippingRenderer('P0'), null, 'P0 measures the default renderer, whichever it is');
  assert.equal(shippingRenderer('P1'), '3d');
  assert.equal(rendererProblem({ mode: '2d', gl: gpu, phase: 'P0' }), null);
  assert.match(String(rendererProblem({ mode: '2d', gl: gpu, phase: 'P1' })), /not the P1 shipping renderer '3d'/);
  assert.equal(rendererProblem({ mode: '3d', gl: gpu, phase: 'P2' }), null);
  assert.match(String(rendererProblem({ mode: '3d', gl: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)', phase: 'P1' })), /software rasteriser/);
  assert.match(String(rendererProblem({ mode: '3d', gl: 'llvmpipe (LLVM 15.0.7, 256 bits)', phase: 'P1' })), /software rasteriser/);
  assert.match(String(rendererProblem({ mode: '3d', gl: null, phase: 'P1' })), /no WebGL/);
  assert.match(String(rendererProblem({ mode: undefined, gl: gpu, phase: 'P0' })), /no renderer/);
  assert.equal(CHANNEL, 'chromium', 'the full Chromium build, not the headless shell');
});

test('frame times count 60 Hz display frames: vsync jitter stays one frame, a missed vsync is two', () => {
  assert.deepEqual([4, 16.7, 17.6, 17.7, 33.3, 34.3, 34.4].map(framesOf), [1, 1, 1, 2, 2, 2, 3], 'ceil((v − 1 ms) / 16.667), at least 1');
  const smooth = displayFrames([16.6, 16.8, 16.7, 16.6, 16.8]);
  assert.deepEqual([smooth.p95, smooth.worst, smooth.missed], [1, 1, 0]);
  const hitch = displayFrames([...Array(99).fill(16.7), 33.3]);
  assert.deepEqual([hitch.p95, hitch.worst, hitch.missed], [1, 2, 1]);
  const slow = displayFrames(Array(20).fill(50));
  assert.deepEqual([slow.p95, slow.worst], [3, 3]);
  assert.ok(Math.abs(smooth.hz - 60) < 1);
});

test('static server: gzip for text, not for images; immutable bundle; 304 on a matching ETag', async () => {
  const site = tempRoot({ 'index.html': '<p>hi</p>'.repeat(200), 'bundle/app-1.js': 'console.log(1);'.repeat(500), 'assets/x.png': png(16, 16, () => [9, 9, 9]) });
  const server = await serveStatic(site.root);
  try {
    const js = await fetch(`${server.url}/bundle/app-1.js`, { headers: { 'accept-encoding': 'gzip' } });
    assert.equal(js.headers.get('content-encoding'), 'gzip');
    assert.match(String(js.headers.get('cache-control')), /immutable/);
    const img = await fetch(`${server.url}/assets/x.png`, { headers: { 'accept-encoding': 'gzip' } });
    assert.equal(img.headers.get('content-encoding'), null);
    const html = await fetch(`${server.url}/`);
    const again = await fetch(`${server.url}/`, { headers: { 'if-none-match': String(html.headers.get('etag')) } });
    assert.equal(again.status, 304);
    assert.equal((await fetch(`${server.url}/../secret`)).status, 404);
    assert.ok(server.requests.some((q) => q.path === '/bundle/app-1.js' && q.gzip && q.bytes < 7500));
  } finally {
    await server.close();
    site.done();
  }
});

/**
 * A title screen and a game loop that does `work` iterations of arithmetic a frame (slowed 4× by the throttle).
 * @param {number} work
 * @param {string} [renderer]  the renderer object's source (a `stats()` for the per-frame sampling)
 */
const game = (work, renderer = '{}') => `<!doctype html><meta charset="utf-8"><body>
<button id="ng">New Game</button>
<script>
document.getElementById('ng').onclick = () => {
  document.body.insertAdjacentHTML('beforeend', '<label><input type="checkbox"> skip</label><button id="st">Start</button>');
  document.getElementById('st').onclick = () => { window.__game = { state: { player: { scene: 'home' }, clock: {}, phase: 'pre', zombies: [], run: { day: 0 } }, ui: { renderMode: 'fixture', renderer: ${renderer} } }; };
};
let sink = 0;
function frame() { let x = 0; for (let i = 0; i < ${work}; i++) x += Math.sqrt(i); sink += x; requestAnimationFrame(frame); }
requestAnimationFrame(frame);
</script>`;

test('Chromium at 4× throttle: first-interactive and download on a fixture title screen; a light loop meets the frame budget, a heavy one misses it', async () => {
  const light = tempRoot({ 'index.html': game(1000) });
  const heavy = tempRoot({ 'index.html': game(20_000_000) });
  const a = await serveStatic(light.root);
  const b = await serveStatic(heavy.root);
  const browser = await chromium.launch({ channel: CHANNEL });
  try {
    const loads = await measureLoads(chromium, a);
    assert.ok(loads.coldMs > 0 && loads.warmMs > 0, JSON.stringify(loads));
    assert.ok(loads.coldMs > loads.coldTitleMs, 'first-interactive comes after New Game and Start, past the title');
    assert.ok(loads.coldTitleMs >= 40, `the title needs at least one 40 ms round trip (${loads.coldTitleMs} ms)`);
    assert.ok(loads.initialBytes > 0 && loads.initialBytes < 5000, `${loads.initialBytes} bytes`);
    assert.ok(loads.warmBytes < loads.initialBytes, `the relaunched profile revalidates the page (304): ${loads.warmBytes} < ${loads.initialBytes}`);
    assert.equal(loads.mode, 'fixture');
    const timing = { warmupMs: 300, sampleMs: 1500 };
    const fast = await measureFrames(browser, a.url, { id: 'light', title: 'light', start: 'new' }, timing);
    const slow = await measureFrames(browser, b.url, { id: 'heavy', title: 'heavy', start: 'new' }, timing);
    assert.deepEqual(fast.errors, []);
    assert.equal(fast.statsFrames, 0, 'no stats() on the fixture renderer');
    assert.equal(fast.drawCalls, null);
    const f = displayFrames(fast.intervals);
    const s = displayFrames(slow.intervals);
    assert.equal(f.p95, 1, `light loop: ${JSON.stringify(f)}`);
    assert.ok(s.p95 >= 2, `heavy loop: ${JSON.stringify(s)}`);
    const verdict = evaluate([{ id: 'frameP95', value: s.p95, detail: 'heavy' }]);
    assert.equal(verdict.results.find((r) => r.id === 'frameP95')?.status, 'fail');
  } finally {
    await browser.close();
    await a.close();
    await b.close();
    light.done();
    heavy.done();
  }
});

test('frame sampling reads renderer.stats() every frame and keeps the largest values', async () => {
  const peaky = tempRoot({ 'index.html': game(1000, '{ n: 0, stats() { this.n++; return { drawCalls: this.n % 50 === 7 ? 900 : 40, gpuBytes: 1000 + this.n }; } }') });
  const srv = await serveStatic(peaky.root);
  const browser = await chromium.launch({ channel: CHANNEL });
  try {
    const f = await measureFrames(browser, srv.url, { id: 'peaky', title: 'peaky', start: 'new' }, { warmupMs: 200, sampleMs: 1500 });
    assert.ok(f.statsFrames >= f.intervals.length, `stats() on every frame (${f.statsFrames} for ${f.intervals.length} intervals)`);
    assert.equal(f.drawCalls, 900, 'the one-frame spike to 900 is the value, not the typical 40');
    assert.ok(Number(f.gpuBytes) > 1000);
    assert.equal(evaluate([{ id: 'drawCalls', value: f.drawCalls, detail: 'spike' }]).results.find((r) => r.id === 'drawCalls')?.status, 'fail');
  } finally {
    await browser.close();
    await srv.close();
    peaky.done();
  }
});

test('the 100-day sim runner reports the days it ran and the time they took', async () => {
  const r = await run(process.execPath, ['tools/budgets/sim100.mjs', '--days', '3'], { cwd: REPO });
  const j = JSON.parse(r.stdout.trim().split('\n').at(-1) || '{}');
  assert.equal(j.days, 3);
  assert.equal(j.phase, 'post');
  // 10 preparation hours, Day 1 from the 18:00 outbreak to midnight, then Days 2 and 3
  assert.equal(j.hours, 10 + 6 + 2 * 24);
  assert.ok(j.ms > 0);
  assert.ok(j.stocked > 50, `the house starts stocked (${j.stocked} items)`);
  const bare = JSON.parse((await run(process.execPath, ['tools/budgets/sim100.mjs', '--days', '1', '--bare'], { cwd: REPO })).stdout.trim().split('\n').at(-1) || '{}');
  assert.equal(bare.stocked, 0);
});

test('scenario saves: New Game in each home by its survivor, the most crowded site, and bad usage', async () => {
  /** @param {string[]} a */
  const scene = async (a) => {
    const r = await run(process.execPath, ['tools/budgets/scenario.mjs', ...a], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 }).catch((e) => e);
    return { code: r.code ?? 0, json: r.code ? null : JSON.parse(String(r.stdout).trim().split('\n').at(-1) || 'null') };
  };
  const duplex = await scene(['new', '--home', 'duplex']);
  assert.deepEqual([duplex.json.summary.character, duplex.json.summary.phase], ['student', 'pre']);
  assert.match(duplex.json.key, /^survivalLog\.save\./);
  const site = await scene(['site']);
  assert.equal(site.json.summary.site, 'office', 'the site with the most zombies (7)');
  assert.equal(site.json.summary.zombies, Math.round(7 * 1.3 * 1.5), 'at night and forced');
  assert.equal((await scene(['new', '--home', 'castle'])).code, 2);
  assert.equal((await scene(['picnic'])).code, 2);
});
