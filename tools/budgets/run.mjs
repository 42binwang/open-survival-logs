#!/usr/bin/env node
// @ts-check
// Performance and size budgets (the gate's budgets check), measured on a fresh production build of the default
// renderer at 1920 × 1080 with the CPU throttled 4× (6× with --cpu 6) and the network at 10 Mbit/s / 40 ms: frame
// time p95 and worst, draw calls and GPU memory (renderer.stats() every frame), the initial download, cold and warm
// first-interactive, the shipped size of dist/, and the 100-day headless sim of a stocked house. Frame budgets are
// the worst over every scenario: New Game in each home, the Day 87 final horde's peak night wave in a storm in each
// home, the exploration site with the most zombies, and the backpack and storage grids open. A budget that cannot be
// measured (a scenario not reached, a renderer that is not the phase's shipping one, software GL) is unmeasured and
// fails; nothing passes without a number.
//   node tools/budgets/run.mjs [--json] [--sample <ms>] [--dist <dir>] [--phase P<n>] [--cpu 4|6]
// --dist measures an existing build instead of building into test-results/budgets/dist. The full report, with the
// commit, whether the tree was dirty, and the machine (CPU, memory, GPU), goes to test-results/budgets/last.json.
// Exit code: 0 pass, 1 fail, 2 bad usage.
import { execFile } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, arch, totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { chromium } from '@playwright/test';
import { DISPLAY_HZ, displayFrames, evaluate, formatValue, percentile, statsMeasurements } from './budgets.mjs';
import { CHANNEL, NETWORK, VIEWPORT, measureFrames, measureLoads, rendererProblem, setCpuThrottle } from './browser.mjs';
import { phase as statusPhase } from '../gate/ledgers.mjs';
import { gatePhase } from '../balance/git.mjs';
import { serveStatic } from './serve.mjs';

const run = promisify(execFile);
const REPO = fileURLToPath(new URL('../..', import.meta.url));
const USAGE = 'usage: node tools/budgets/run.mjs [--json] [--sample <ms>] [--dist <dir>] [--phase P<n>] [--cpu 4|6]';
export const HOMES = Object.freeze(['apartment', 'duplex', 'warehouse']);

/** @type {{ json?: boolean, sample?: string, dist?: string, phase?: string, cpu?: string, help?: boolean }} */
let args = {};
try {
  args = parseArgs({ options: { json: { type: 'boolean' }, sample: { type: 'string' }, dist: { type: 'string' }, phase: { type: 'string' }, cpu: { type: 'string' }, help: { type: 'boolean', short: 'h' } } }).values;
} catch (err) {
  console.error(`budgets: ${/** @type {Error} */ (err).message}\n${USAGE}`);
  process.exit(2);
}
if (args.help) {
  console.log(USAGE);
  process.exit(0);
}
const sampleMs = args.sample ? Number(args.sample) : 10_000;
if (!(sampleMs >= 1000)) {
  console.error(`budgets: --sample takes at least 1000 ms\n${USAGE}`);
  process.exit(2);
}
const cpu = args.cpu ? Number(args.cpu) : 4;
if (cpu !== 4 && cpu !== 6) {
  console.error(`budgets: --cpu is 4 (the budget) or 6 (the low-end check)\n${USAGE}`);
  process.exit(2);
}
if (args.phase != null && !/^P\d+$/.test(args.phase)) {
  console.error(`budgets: --phase must be P<n>\n${USAGE}`);
  process.exit(2);
}
const phaseId = args.phase || gatePhase() || statusPhase()?.id || 'P0';
setCpuThrottle(cpu);
const log = (/** @type {string} */ s) => !args.json && console.error(s);
const node = process.execPath;
const out = join(REPO, 'test-results', 'budgets');
mkdirSync(out, { recursive: true });

/** @type {import('./budgets.mjs').Measurement[]} */
const measured = [];
/** @type {Record<string, unknown>} */
const facts = {
  phase: phaseId,
  viewport: `${VIEWPORT.width}×${VIEWPORT.height}`,
  cpuThrottle: cpu,
  network: `${(NETWORK.downloadThroughput * 8) / 1e6} Mbit/s down, ${NETWORK.latency} ms RTT`,
  machine: { cpu: cpus()[0]?.model, cores: cpus().length, memoryGB: Math.round(totalmem() / 2 ** 30), os: `${platform()} ${release()} ${arch()}` },
};
const git = async (/** @type {string[]} */ a) => (await run('git', a, { cwd: REPO })).stdout.trim();
const commit = await git(['rev-parse', 'HEAD']).catch(() => null);
const dirty = await git(['status', '--porcelain', '--untracked-files=no']).then((o) => o.length > 0).catch(() => true);

// ------------------------------------------------------------------------------ build
let dist = args.dist ? resolve(args.dist) : join(out, 'dist');
if (!args.dist) {
  log('budgets: building dist …');
  rmSync(dist, { recursive: true, force: true });
  try {
    await run(join(REPO, 'node_modules', '.bin', 'vite'), ['build', '--logLevel', 'error', '--outDir', dist, '--emptyOutDir'], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    const msg = `the production build failed: ${String(/** @type {any} */ (err).stderr || err).split('\n').slice(0, 3).join(' ')}`;
    for (const id of ['frameP95', 'frameWorst', 'drawCalls', 'gpuMemory', 'initialDownload', 'coldInteractive', 'warmInteractive', 'shippedAssets']) measured.push({ id, value: null, detail: msg });
    dist = '';
  }
}

/** @param {string} dir */
function sizeOf(dir) {
  let total = 0;
  let files = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      const s = sizeOf(p);
      total += s.total;
      files += s.files;
    } else if (e.isFile()) {
      total += statSync(p).size;
      files++;
    }
  }
  return { total, files };
}

// ------------------------------------------------------------------------------ browser
if (dist) {
  const size = sizeOf(dist);
  const assets = (() => {
    try {
      return sizeOf(join(dist, 'assets')).total;
    } catch {
      return 0;
    }
  })();
  measured.push({ id: 'shippedAssets', value: size.total, detail: `${size.files} files; assets/ ${formatValue(assets, 'bytes')}` });
  const server = await serveStatic(dist);
  const browser = await chromium.launch({ channel: CHANNEL });
  facts.browser = `${CHANNEL} ${browser.version()}`;
  const BROWSER_IDS = ['frameP95', 'frameWorst', 'drawCalls', 'gpuMemory', 'initialDownload', 'coldInteractive', 'warmInteractive'];
  try {
    log('budgets: cold and warm loads …');
    const loads = await measureLoads(chromium, server);
    facts.loads = loads;
    facts.gpu = loads.gl;
    facts.renderer = loads.mode;
    const bad = rendererProblem({ mode: loads.mode, gl: loads.gl, phase: phaseId });
    if (bad) for (const id of BROWSER_IDS) measured.push({ id, value: null, detail: bad });
    else {
      measured.push({ id: 'coldInteractive', value: loads.coldMs, detail: `${loads.mode} renderer; title at ${Math.round(loads.coldTitleMs)} ms after ${loads.coldRequests} requests` });
      measured.push({ id: 'warmInteractive', value: loads.warmMs, detail: `profile relaunched; ${formatValue(loads.warmBytes, 'bytes')} received to the title` });
      measured.push({ id: 'initialDownload', value: loads.initialBytes, detail: `${loads.coldRequests} responses to the title screen` });

      log('budgets: frame-time scenarios …');
      /** @type {import('./browser.mjs').Scenario[]} */
      const scenarios = [];
      /** @type {string[]} */
      const unreached = [];
      /** @param {string[]} argv */
      const save = async (argv) => {
        try {
          const r = await run(node, [join(REPO, 'tools', 'budgets', 'scenario.mjs'), ...argv], { cwd: REPO, maxBuffer: 64 * 1024 * 1024, timeout: 10 * 60_000 });
          return JSON.parse(r.stdout.trim().split('\n').at(-1) || '{}');
        } catch (err) {
          unreached.push(`${argv.join(' ')}: ${String(/** @type {any} */ (err).stderr || err).trim().split('\n').at(-1)}`);
          return null;
        }
      };
      for (const home of HOMES) {
        const s0 = await save(['new', '--home', home]);
        if (s0) scenarios.push({ id: `new-${home}`, title: `New Game in the ${home} (${s0.summary.character})`, start: 'continue', storage: { [s0.key]: s0.value } });
        const s1 = await save(['final-horde', '--home', home]);
        if (s1) scenarios.push({ id: `final-horde-${home}`, title: `the ${home} under the Day 87 final horde, ${s1.summary.zombies} zombies at ${s1.summary.hour}:00 in a storm`, start: 'continue', storage: { [s1.key]: s1.value } });
      }
      const s2 = await save(['site']);
      if (s2) scenarios.push({ id: `site-${s2.summary.site}`, title: `${s2.summary.site} at night, forced, ${s2.summary.zombies} zombies`, start: 'continue', storage: { [s2.key]: s2.value } });
      scenarios.push({ id: 'grids-open', title: 'the apartment after New Game with the backpack and a storage grid open', start: 'new', open: 'grids' });
      const frames = [];
      for (const sc of scenarios) {
        const f = await measureFrames(browser, server.url, sc, { warmupMs: 2000, sampleMs });
        const d = displayFrames(f.intervals);
        frames.push({ ...f, title: sc.title, ...d, frames: f.intervals.length });
        log(`  ${sc.id}: ${f.intervals.length} frames at ${d.hz.toFixed(1)} Hz, p95 ${d.p95} and worst ${d.worst} display frame(s), ${d.missed} missed (${f.renderer}, ${JSON.stringify(f.state)})`);
      }
      facts.scenarios = frames.map(({ intervals, ...rest }) => ({ ...rest, rawP95Ms: percentile(intervals, 95), rawWorstMs: intervals.length ? Math.max(...intervals) : null }));
      const why = [
        ...unreached.map((u) => `scenario not reached (${u})`),
        ...frames
          .filter((f) => f.blocked || f.errors.length || f.frames < 10 || Math.abs(f.hz - DISPLAY_HZ) > DISPLAY_HZ * 0.05 || rendererProblem({ mode: f.renderer, gl: f.gl, phase: phaseId }))
          .map((f) => `${f.id}: ${f.blocked || rendererProblem({ mode: f.renderer, gl: f.gl, phase: phaseId }) || (f.errors.length ? `page errors (${f.errors[0]})` : f.frames < 10 ? `only ${f.frames} frames` : `the display ran at ${f.hz.toFixed(1)} Hz, not ${DISPLAY_HZ}`)}`),
      ].join('; ');
      if (why) measured.push({ id: 'frameP95', value: null, detail: why }, { id: 'frameWorst', value: null, detail: why });
      else {
        const p = frames.reduce((a, b) => (b.p95 > a.p95 ? b : a));
        const w = frames.reduce((a, b) => (b.worst > a.worst ? b : a));
        measured.push({ id: 'frameP95', value: p.p95, detail: `worst of ${frames.length} scenarios: ${p.id}, ${p.frames} frames over ${sampleMs / 1000} s, ${p.missed} missed a vsync` });
        measured.push({ id: 'frameWorst', value: w.worst, detail: `worst of ${frames.length} scenarios: ${w.id}, raw ${Math.max(...w.intervals).toFixed(1)} ms` });
      }
      measured.push(...statsMeasurements(frames, why));
    }
  } catch (err) {
    const msg = `the browser run failed: ${/** @type {Error} */ (err).message.split('\n')[0]}`;
    for (const id of BROWSER_IDS) if (!measured.some((m) => m.id === id)) measured.push({ id, value: null, detail: msg });
  } finally {
    await browser.close();
    await server.close();
  }
}

// ------------------------------------------------------------------------------ headless sim
log('budgets: 100-day headless sim …');
try {
  const r = await run(node, [join(REPO, 'tools', 'budgets', 'sim100.mjs')], { cwd: REPO, maxBuffer: 16 * 1024 * 1024, timeout: 10 * 60_000 });
  const j = JSON.parse(r.stdout.trim().split('\n').at(-1) || '{}');
  facts.sim100 = j;
  measured.push(j.days >= 100 ? { id: 'sim100', value: j.ms, detail: `${j.days} days, ${j.hours} game hours, ${j.stocked} items stocked` } : { id: 'sim100', value: null, detail: `the run stopped on day ${j.days} (${j.phase})` });
} catch (err) {
  measured.push({ id: 'sim100', value: null, detail: `sim100.mjs failed: ${/** @type {Error} */ (err).message.split('\n')[0]}` });
}

const verdict = evaluate(measured);
writeFileSync(join(out, 'last.json'), `${JSON.stringify({ at: new Date().toISOString(), commit, dirty, phase: phaseId, ...verdict, facts }, null, 2)}\n`);
if (args.json) console.log(JSON.stringify({ ok: verdict.ok, summary: verdict.summary, problems: verdict.problems, results: verdict.results.map(({ id, value, status, max, unit, detail }) => ({ id, value, status, max, unit, detail })) }));
else {
  for (const r of verdict.results) console.log(`${r.status === 'pass' ? '✔' : r.status === 'fail' ? '✖' : '○'} ${r.label.padEnd(26)} ${(r.value == null ? 'unmeasured' : formatValue(r.value, r.unit)).padEnd(12)} budget ${formatValue(r.max, r.unit).padEnd(9)} ${r.detail}`);
  console.log(`${verdict.ok ? 'PASS' : 'FAIL'} budgets: ${verdict.summary}`);
}
process.exit(verdict.ok ? 0 : 1);
