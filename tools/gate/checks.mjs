// @ts-check
// The gate's check registry, in run order. Each check names the work package that builds it, the first phase whose
// signoff requires it, whether --quick runs it, and whether it is built yet: a check whose tool does not exist yet is
// `pending` (a failure for --final and for any --signoff that requires it).
//
// Tool contract for checks other packages build: the gate runs the entry file with Node and the arguments below.
// Exit code 0 is a pass, anything else a fail. With --json the tool prints one JSON object on stdout, ideally
// { ok: boolean, summary: string, problems: string[] }; the gate shows the summary and, on failure, the problems.
// Changing an entry or its arguments is a hook request to the architect.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { phase } from './ledgers.mjs';
import { ROOT } from './port.mjs';
import { exec, lastJson, tail } from './exec.mjs';
import { coverageEnv, V8_DIR } from '../code-coverage.mjs';

/** Node tests on master (434 at the opening of P0). The count may only grow: raise it when tests are added. */
export const MIN_TESTS = 978;

/** Extensions stored in git LFS under assets/ (.gitattributes). */
export const LFS_EXTENSIONS = ['glb', 'gltf', 'bin', 'ktx2', 'ogg', 'opus', 'wav', 'flac', 'hdr', 'exr', 'png', 'jpg', 'jpeg', 'webp', 'blend', 'fbx', 'mp4', 'woff2'];

/**
 * @typedef {'pass' | 'fail'} Outcome
 * @typedef {{ state: Outcome, summary: string, output?: string }} CheckResult
 * @typedef {{ quick: boolean, phase?: string }} RunMode  phase: the phase the run is judged by (gatePhase)
 * @typedef {object} Check
 * @property {string} id
 * @property {string} title
 * @property {string} owner  the work package that builds it
 * @property {number} requiredFrom  the first phase whose signoff requires it (0 = P0)
 * @property {boolean} quick  part of --quick
 * @property {boolean} [finalOnly]  runs only for --final and a signoff of its requiredFrom phase or later
 * @property {() => string | null} pending  why it is not built yet, or null when it can run
 * @property {(mode: RunMode) => Promise<CheckResult>} run
 */

const node = process.execPath;
const has = (/** @type {string} */ rel) => existsSync(join(ROOT, rel));
const bin = (/** @type {string} */ name) => join(ROOT, 'node_modules', '.bin', name);
const secs = (/** @type {number} */ ms) => `${(ms / 1000).toFixed(1)} s`;
/** @returns {CheckResult} */
const pass = (/** @type {string} */ summary) => ({ state: 'pass', summary });
/** @returns {CheckResult} */
const fail = (/** @type {string} */ summary, output = '') => ({ state: 'fail', summary, output });
/** @returns {CheckResult | null} a failure when the npm dependencies are not installed */
const needsInstall = (/** @type {string} */ tool) => (existsSync(bin(tool)) ? null : fail(`node_modules/.bin/${tool} is missing: run npm ci`));

/**
 * JS files under the given folders (recursively), skipping installed, built and generated code.
 * @param {string[]} dirs  repo-relative
 */
function jsFiles(dirs) {
  /** @type {string[]} */
  const out = [];
  const skip = new Set(['node_modules', 'dist', 'gen', 'cache', 'bin']);
  /** @param {string} rel */
  const walk = (rel) => {
    for (const e of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
      const p = `${rel}/${e.name}`;
      if (e.isDirectory() && !skip.has(e.name)) walk(p);
      else if (e.isFile() && /\.m?js$/.test(e.name)) out.push(p);
    }
  };
  for (const d of dirs) if (has(d)) walk(d);
  return out;
}

/** Files that opt in to type checking. */
const checkedFiles = () =>
  [...jsFiles(['src', 'tools', 'tests', 'pages']), ...readdirSync(ROOT).filter((f) => /\.config\.m?js$/.test(f))].filter((f) =>
    readFileSync(join(ROOT, f), 'utf8').startsWith('// @ts-check')
  );

/** `.only` / `.skip` / `.todo` / `.fixme` marks in test sources (never allowed, docs/wp/README.md). */
function focusMarks() {
  /** @type {string[]} */
  const found = [];
  const mark = /\b(?:test|it|describe|suite)\.(?:only|skip|todo|fixme)\s*\(|\{\s*(?:only|skip|todo)\s*:\s*(?:true|['"`])/;
  for (const f of jsFiles(['tests'])) {
    readFileSync(join(ROOT, f), 'utf8')
      .split('\n')
      .forEach((line, i) => mark.test(line) && found.push(`${f}:${i + 1}`));
  }
  return found;
}

/** First phase whose bar is full parity: --final judges by it at the least. */
export const PARITY_PHASE = 3;

/**
 * The phase a run is judged by: the one a --signoff names; for --final the current phase but at least the parity
 * phase; otherwise the current phase (docs/wp/STATUS.md).
 * @param {{ signoff?: number | null, final?: boolean }} run
 * @param {{ id: string } | null} [current]
 */
export function gatePhase({ signoff = null, final = false }, current = phase()) {
  const now = current ? Number(current.id.slice(1)) : 0;
  if (signoff != null) return `P${signoff}`;
  if (final) return `P${Math.max(now, PARITY_PHASE)}`;
  return `P${now}`;
}

/** The coverage tool's arguments: it prints before P3 and fails below 100% from P3, so it needs the phase. @param {RunMode} mode */
export const coverageArgs = (mode) => ['--json', '--phase', mode.phase || gatePhase({})];

/** The WP-P0-11 tools' phase argument: the phase the run is judged by. @param {RunMode} mode */
const phaseArgs = (mode) => ['--phase', mode.phase || gatePhase({})];
/** The release is P5's: --final and the P5 signoff judge it at P5 at least. @param {RunMode} mode */
const releasePhase = (mode) => `P${Math.max(5, Number((mode.phase || gatePhase({})).slice(1)))}`;

/**
 * A check whose tool another package builds: pending until its entry file exists. `args` may depend on the run mode.
 * @param {{ id: string, title: string, owner: string, entry: string, args?: string[] | ((mode: RunMode) => string[]), quick?: boolean, requiredFrom?: number, finalOnly?: boolean, timeoutMs?: number }} spec
 * @returns {Check}
 */
export function tool({ id, title, owner, entry, args = ['--json'], quick = false, requiredFrom = 0, finalOnly = false, timeoutMs = 15 * 60_000 }) {
  return {
    id,
    title,
    owner,
    requiredFrom,
    quick,
    finalOnly,
    pending: () => (has(entry) ? null : `${entry} not built yet (${owner})`),
    async run(/** @type {RunMode} */ mode = { quick: false }) {
      const r = await exec(node, [entry, ...(typeof args === 'function' ? args(mode) : args)], { timeoutMs });
      const json = lastJson(r.stdout);
      const ok = r.code === 0 && json?.ok !== false;
      const problems = Array.isArray(json?.problems) ? json.problems : null;
      let summary = typeof json?.summary === 'string' ? json.summary : problems ? `${problems.length} problem(s)` : r.stdout.trim().split('\n')[0] || `exit code ${r.code}`;
      if (r.timedOut) summary = `timed out after ${secs(r.ms)}`;
      return ok ? pass(summary) : fail(summary, problems?.length ? problems.slice(0, 40).join('\n') : tail(r.out));
    },
  };
}

/** @type {Check[]} */
export const CHECKS = [
  {
    id: 'syntax',
    title: 'Every module under src/ parses (tools/check_syntax.mjs)',
    owner: 'WP-P0-01',
    requiredFrom: 0,
    quick: true,
    pending: () => null,
    async run() {
      const r = await exec(node, ['tools/check_syntax.mjs']);
      const line = /\d+\/\d+ modules parse/.exec(r.out)?.[0] || `exit code ${r.code}`;
      return r.code === 0 ? pass(line) : fail(line, tail(r.out));
    },
  },
  {
    id: 'tests',
    title: 'Node tests (node --test tests/*.test.js)',
    owner: 'WP-P0-01',
    requiredFrom: 0,
    quick: true,
    pending: () => null,
    async run() {
      const files = readdirSync(join(ROOT, 'tests'))
        .filter((f) => f.endsWith('.test.js'))
        .sort()
        .map((f) => `tests/${f}`);
      // with V8 coverage of every test process: the code-coverage check below judges it
      const r = await exec(node, ['--test', '--test-reporter=spec', ...files], { timeoutMs: 12 * 60_000, env: coverageEnv() });
      const n = (/** @type {string} */ k) => Number(new RegExp(`^ℹ ${k} (\\d+)$`, 'm').exec(r.out)?.[1] ?? NaN);
      const [tests, passed, failed, cancelled, skipped, todo] = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].map(n);
      const marks = focusMarks();
      const summary = `${passed} of ${tests} passed, ${failed} failed`;
      /** @type {string[]} */
      const why = [];
      if (r.code !== 0 || failed || cancelled || Number.isNaN(tests)) why.push(`${failed} failed, ${cancelled} cancelled (exit code ${r.code})`);
      if (skipped || todo) why.push(`${skipped} skipped and ${todo} todo: tests are never skipped`);
      if (tests < MIN_TESTS) why.push(`${tests} tests is fewer than the ${MIN_TESTS} of the baseline: tests are never deleted`);
      if (marks.length) why.push(`.only / .skip / .todo marks: ${marks.join(', ')}`);
      if (!why.length) return pass(summary);
      const failures = r.out.split('\n').filter((l) => l.startsWith('✖')).slice(0, 20).join('\n');
      return fail(`${summary}; ${why.join('; ')}`, failures || tail(r.out));
    },
  },
  {
    id: 'code-coverage',
    title: 'Every line and branch a branch adds under src/ is run by a test; no file loses coverage (tools/code-coverage.mjs)',
    owner: 'integrator',
    requiredFrom: 0,
    quick: true,
    pending: () => null,
    async run() {
      if (!existsSync(join(ROOT, V8_DIR))) return fail(`${V8_DIR} missing: the tests check writes it`, '');
      const r = await exec(node, ['tools/code-coverage.mjs', '--v8', V8_DIR, '--json'], { timeoutMs: 2 * 60_000 });
      const json = lastJson(r.stdout);
      const summary = typeof json?.summary === 'string' ? json.summary : `exit code ${r.code}`;
      const problems = Array.isArray(json?.problems) ? json.problems : [];
      return r.code === 0 && json?.ok ? pass(summary) : fail(summary, problems.slice(0, 40).join('\n') || tail(r.out));
    },
  },
  {
    id: 'typecheck',
    title: 'TypeScript over the files that start with // @ts-check (npm run typecheck)',
    owner: 'WP-P0-01',
    requiredFrom: 0,
    quick: true,
    pending: () => null,
    async run() {
      const missing = needsInstall('tsc');
      if (missing) return missing;
      const r = await exec(bin('tsc'), ['--noEmit', '-p', 'tsconfig.json'], { timeoutMs: 5 * 60_000 });
      const errors = (r.out.match(/error TS\d+/g) || []).length;
      return r.code === 0 ? pass(`${checkedFiles().length} files opt in, no type errors`) : fail(`${errors} type error(s)`, tail(r.out, 40));
    },
  },
  {
    id: 'lint',
    title: 'ESLint over the repo (npm run lint)',
    owner: 'WP-P0-01',
    requiredFrom: 0,
    quick: true,
    pending: () => null,
    async run() {
      const missing = needsInstall('eslint');
      if (missing) return missing;
      const r = await exec(bin('eslint'), ['.', '--max-warnings', '0', '--format', 'json'], { timeoutMs: 5 * 60_000 });
      const results = lastJson(r.stdout);
      if (!Array.isArray(results)) return fail(`eslint did not report (exit code ${r.code})`, tail(r.out));
      const sum = (/** @type {string} */ k) => results.reduce((a, f) => a + (f[k] || 0), 0);
      if (r.code === 0) return pass(`${results.length} files, no problems`);
      const lines = results.flatMap((f) => f.messages.map((/** @type {any} */ m) => `${f.filePath.slice(ROOT.length)}:${m.line} ${m.ruleId || 'fatal'} ${m.message}`));
      return fail(`${sum('errorCount')} error(s), ${sum('warningCount')} warning(s)`, lines.slice(0, 40).join('\n'));
    },
  },
  {
    id: 'build',
    title: 'Vite production build (npm run build)',
    owner: 'WP-P0-01',
    requiredFrom: 0,
    quick: true,
    pending: () => null,
    async run() {
      const missing = needsInstall('vite');
      if (missing) return missing;
      const r = await exec(bin('vite'), ['build', '--logLevel', 'warn'], { timeoutMs: 5 * 60_000 });
      const warnings = [...new Set([...r.out.matchAll(/\[([A-Z][A-Z_]{3,})\]/g)].map((m) => m[1]))];
      const note = warnings.length ? `; warnings: ${warnings.join(', ')}` : '';
      return r.code === 0 ? pass(`dist/ built${note}`) : fail('the build failed', tail(r.out, 40));
    },
  },
  {
    id: 'contracts',
    title: 'Live views, the Canvas renderer and asset manifests conform to src/contracts',
    owner: 'WP-P0-01',
    requiredFrom: 0,
    quick: true,
    pending: () => null,
    async run() {
      const r = await exec(node, ['tools/gate/contracts.mjs'], { timeoutMs: 5 * 60_000 });
      const json = lastJson(r.stdout);
      if (!json) return fail(`no report (exit code ${r.code})`, tail(r.out));
      return json.ok && r.code === 0 ? pass(json.summary) : fail(`${json.problems.length} problem(s); ${json.summary}`, json.problems.slice(0, 40).join('\n'));
    },
  },
  {
    id: 'determinism',
    title: 'Two seeded headless runs hash-equal; another seed differs; save + Continue keeps the run',
    owner: 'WP-P0-01',
    requiredFrom: 0,
    quick: true,
    pending: () => null,
    async run({ quick }) {
      const plans = (quick ? ['wage'] : ['wage', 'student', 'warehouse']).map((character) => ({ character, hours: quick ? 60 : 72 }));
      const dir = mkdtempSync(join(tmpdir(), 'gate-determinism-'));
      /** @param {string[]} args */
      const one = async (args) => {
        const r = await exec(node, ['tools/gate/determinism-run.mjs', ...args], { timeoutMs: 5 * 60_000 });
        return { r, json: lastJson(r.stdout) };
      };
      /** @type {string[]} */
      const problems = [];
      /** @type {string[]} */
      const done = [];
      try {
        await Promise.all(
          plans.map(async ({ character, hours }) => {
            const save = join(dir, `${character}.json`);
            const run = (/** @type {number} */ seed, /** @type {number} */ h, extra = /** @type {string[]} */ ([])) =>
              one(['--seed', String(seed), '--hours', String(h), '--character', character, ...extra]);
            const [a, b, other, firstHalf] = await Promise.all([run(4242, hours), run(4242, hours), run(4243, hours), run(4242, hours / 2, ['--save', save])]);
            const resumed = firstHalf.json ? await one(['--resume', save, '--hours', String(hours)]) : firstHalf;
            const runs = { 'run A': a, 'run B': b, 'other seed': other, 'first half': firstHalf, resumed };
            for (const [name, x] of Object.entries(runs)) if (!x.json) problems.push(`${character} ${name}: no result (exit code ${x.r.code})\n${tail(x.r.out, 8)}`);
            if (!a.json || !b.json || !other.json || !resumed.json) return;
            if (a.json.final !== b.json.final || a.json.days.join() !== b.json.days.join()) {
              const day = a.json.days.findIndex((/** @type {string} */ h, /** @type {number} */ i) => h !== b.json.days[i]);
              problems.push(`${character}: two runs with seed 4242 differ${day >= 0 ? ` from game day ${day + 1}` : ' at the end'}`);
            }
            if (a.json.final === other.json.final) problems.push(`${character}: seeds 4242 and 4243 end in the same state, so the seed does not reach the sim`);
            if (resumed.json.final !== a.json.final) problems.push(`${character}: saving at hour ${hours / 2} and continuing in a new process changes the run`);
            done.push(`${character} ${hours} h ${a.json.final.slice(0, 8)}`);
          })
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
      return problems.length ? fail(`${problems.length} problem(s)`, problems.join('\n')) : pass(done.sort().join(', '));
    },
  },
  {
    id: 'lfs',
    title: 'Shipped binaries under assets/ are stored in git LFS',
    owner: 'WP-P0-01',
    requiredFrom: 0,
    quick: true,
    pending: () => null,
    async run() {
      const version = await exec('git', ['lfs', 'version']);
      if (version.code !== 0) return fail('git-lfs is not installed (brew install git-lfs, then git lfs install)');
      const attrs = has('.gitattributes') ? readFileSync(join(ROOT, '.gitattributes'), 'utf8') : '';
      const missing = LFS_EXTENSIONS.filter((ext) => !new RegExp(`^assets/\\*\\*/\\*\\.${ext}\\s+filter=lfs diff=lfs merge=lfs -text\\s*$`, 'm').test(attrs));
      if (missing.length) return fail(`.gitattributes does not put assets/**/*.{${missing.join(',')}} in LFS`);
      const filter = await exec('git', ['config', '--get', 'filter.lfs.process']);
      // relative in the main checkout, absolute in a linked worktree (hooks live in the common git dir)
      const hook = await exec('git', ['rev-parse', '--git-path', 'hooks/pre-push']);
      const hookPath = hook.stdout.trim() && resolve(ROOT, hook.stdout.trim());
      const hookOk = hookPath && existsSync(hookPath) && readFileSync(hookPath, 'utf8').includes('git lfs');
      if (filter.code !== 0 || !hookOk) return fail('git LFS is not set up in this clone: run git lfs install');
      const fsck = await exec('git', ['lfs', 'fsck', '--pointers']);
      if (fsck.code !== 0) return fail('files that belong in LFS are stored as plain git blobs: git add --renormalize assets && commit', tail(fsck.out));
      const files = (await exec('git', ['lfs', 'ls-files', '--name-only'])).stdout.split('\n').filter(Boolean);
      return pass(`${files.length} file(s) in LFS; ${LFS_EXTENSIONS.length} extensions tracked under assets/`);
    },
  },
  {
    id: 'e2e',
    title: 'Playwright UI tests in Chromium (npm run e2e; --quick runs the @smoke tier)',
    owner: 'WP-P0-01',
    requiredFrom: 0,
    quick: true,
    pending: () => null,
    async run({ quick }) {
      const missing = needsInstall('playwright');
      if (missing) return missing;
      const r = await exec(bin('playwright'), ['test', '--reporter=line', ...(quick ? ['--grep', '@smoke'] : [])], { timeoutMs: 20 * 60_000 });
      const count = (/** @type {string} */ k) => Number(new RegExp(`(\\d+) ${k}\\b`).exec(r.out)?.[1] ?? 0);
      const [passed, failed, flaky, skipped] = ['passed', 'failed', 'flaky', 'skipped'].map(count);
      const summary = `${passed} passed${quick ? ' (@smoke)' : ''}, ${failed} failed${flaky ? `, ${flaky} flaky` : ''}${skipped ? `, ${skipped} skipped` : ''}`;
      if (r.code === 0 && passed > 0 && !failed && !flaky && !skipped) return pass(summary);
      const hint = /Executable doesn't exist|npx playwright install/.test(r.out) ? 'Chromium is missing: run npx playwright install chromium' : summary;
      return fail(hint, tail(r.out, 40));
    },
  },
  {
    id: 'keys-audit',
    title: 'Every key is declared, produced and consumed (src/contracts/keys.js)',
    owner: 'WP-P0-02',
    requiredFrom: 0,
    quick: true,
    pending: () => (has('tools/keys-audit.mjs') ? null : 'tools/keys-audit.mjs not built yet (WP-P0-02)'),
    async run() {
      const r = await exec(node, ['tools/keys-audit.mjs', '--json'], { timeoutMs: 5 * 60_000 });
      const json = lastJson(r.stdout);
      if (!json?.counts) return fail(`no report (exit code ${r.code})`, tail(r.out));
      const { declared, accesses, byType } = json.counts;
      const scope = `${declared.total} keys declared, ${accesses.total} accesses`;
      if (json.ok && r.code === 0) return pass(`${scope}, no problems`);
      const kinds = Object.entries(byType || {})
        .filter(([, n]) => n)
        .map(([type, n]) => `${n} ${type}`);
      /** @type {{ type: string, ns: string, key: string, message: string, sites: { file: string, line: number }[] }[]} */
      const problems = Array.isArray(json.problems) ? json.problems : [];
      const lines = problems.map((p) => `${p.type} ${p.ns}:${p.key} ${p.message}${p.sites?.[0] ? ` (${p.sites[0].file}:${p.sites[0].line})` : ''}`);
      return fail(`${json.counts.problems} problem(s): ${kinds.join(', ') || `exit code ${r.code}`}; ${scope}`, lines.slice(0, 40).join('\n') || tail(r.out));
    },
  },
  {
    id: 'targets',
    title: 'Look reference hashes, the grade LUT (three.js LUTCubeLoader) and the scene-score cache (tools/targets/)',
    owner: 'WP-P0-04',
    requiredFrom: 0,
    quick: true,
    pending: () => (has('tools/targets/fetch-targets.mjs') ? null : 'tools/targets/ not built yet (WP-P0-04)'),
    async run() {
      // check-scene-cache needs ffmpeg and ffprobe on PATH; nothing here touches the network or tools/targets/.cache
      /** @type {{ what: string, args: string[], env: Record<string, string> }[]} */
      const steps = [
        { what: 'reference hashes', args: ['tools/targets/fetch-targets.mjs', '--verify'], env: {} },
        { what: 'grade LUT', args: ['tools/targets/validate-lut.mjs'], env: { THREE_DIR: join(ROOT, 'node_modules', 'three') } },
        { what: 'scene-score cache', args: ['tools/targets/check-scene-cache.mjs'], env: {} },
      ];
      /** @type {string[]} */
      const done = [];
      let verified = 'reference files verified';
      for (const s of steps) {
        const r = await exec(node, s.args, { timeoutMs: 5 * 60_000, env: s.env });
        if (r.code !== 0) return fail(`${s.what} failed (exit code ${r.code})${done.length ? `; passed: ${done.join(', ')}` : ''}`, tail(r.out, 30));
        if (s === steps[0]) verified = /\d+\/\d+ files verified/.exec(r.out)?.[0] || verified;
        done.push(s.what);
      }
      return pass(`${verified}; grade LUT valid; scene-score cache reused and invalidated correctly`);
    },
  },
  tool({ id: 'coverage', title: 'Config entities reachable and working in the sim (tools/coverage.mjs)', owner: 'WP-P0-03', entry: 'tools/coverage.mjs', args: coverageArgs, timeoutMs: 10 * 60_000 }),
  tool({ id: 'visual', title: 'Visual regression: SSIM against tests/visual/baselines', owner: 'WP-P0-11', entry: 'tools/visual/run.mjs' }),
  tool({ id: 'art-metrics', title: 'Art metrics over the asset manifests (PBR, texel density, budgets, the content of the phase)', owner: 'WP-P0-11', entry: 'tools/art-metrics.mjs', args: (mode) => ['--json', ...phaseArgs(mode)] }),
  tool({ id: 'budgets', title: 'Performance and size budgets of the default renderer at 1920 × 1080, 4× CPU throttle, 10 Mbit/s', owner: 'WP-P0-11', entry: 'tools/budgets/run.mjs', args: (mode) => ['--json', ...phaseArgs(mode)], timeoutMs: 30 * 60_000 }),
  tool({
    id: 'balance',
    title: 'Balance bots on the real sim, 50 seeds per difficulty: every band due by the phase inside, no crash, every save/load round trip identical (docs/BALANCE.md)',
    owner: 'WP-P0-11',
    entry: 'tools/balance/run.mjs',
    args: (mode) => ['--seeds', '50', '--out', '-', '--json', ...phaseArgs(mode)],
    timeoutMs: 30 * 60_000,
  }),
  tool({
    id: 'ledgers',
    title: 'Quality ledgers: bugs, scores, side-by-side pairs, playtest sessions and the band log; formats, append-only against master, approvers from the STATUS.md registry (docs/QUALITY.md §5–§6)',
    owner: 'WP-P0-11',
    entry: 'tools/balance/check.mjs',
    args: ['ledgers', '--json'],
    quick: true,
  }),
  tool({
    id: 'rubric',
    title: 'Rubric signoff of the judged phase: every axis and due side-by-side pair ≥ 4, none below its earlier best (docs/QUALITY.md §3)',
    owner: 'WP-P0-11',
    entry: 'tools/balance/check.mjs',
    args: (mode) => ['rubric', '--json', ...phaseArgs(mode)],
    requiredFrom: 1,
  }),
  tool({
    id: 'release',
    title: 'Release criteria: no open S1/S2, ≤ 20 S3; ≥ 20 playtest sessions (≥ 5 per persona, 0 crashes); ≥ 200 bot sessions (0 crashes, 100 % round trips); every budget met at HEAD',
    owner: 'WP-P0-11',
    entry: 'tools/balance/check.mjs',
    args: (mode) => ['release', '--json', '--phase', releasePhase(mode)],
    requiredFrom: 5,
    finalOnly: true,
  }),
  tool({
    id: 'asset-lock',
    title: 'Locked sources verify (SHA-256), every shipped file traces to a build, and a 5% re-bake matches at SSIM ≥ 0.99',
    owner: 'WP-P0-14',
    entry: 'tools/asset-lock.mjs',
    timeoutMs: 60 * 60_000,
  }),
];
