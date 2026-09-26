// @ts-check
// Runs a gate tool as a child process of this checkout, capturing its output, with a timeout.
import { spawn } from 'node:child_process';
import { ROOT } from './port.mjs';

/**
 * @typedef {object} ExecResult
 * @property {number | null} code  exit code (null when killed)
 * @property {string} stdout
 * @property {string} out  stdout and stderr interleaved
 * @property {number} ms
 * @property {boolean} timedOut
 */

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ timeoutMs?: number, env?: Record<string, string> }} [opts]
 * @returns {Promise<ExecResult>}
 */
export function exec(cmd, args, opts = {}) {
  /** @type {NodeJS.ProcessEnv} */
  const env = { ...process.env, NO_COLOR: '1', ...opts.env };
  delete env.FORCE_COLOR;
  return new Promise((resolve) => {
    const t0 = performance.now();
    const child = spawn(cmd, args, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let out = '';
    let timedOut = false;
    child.stdout.on('data', (d) => ((stdout += d), (out += d)));
    child.stderr.on('data', (d) => (out += d));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, opts.timeoutMs ?? 10 * 60_000);
    const done = (/** @type {number | null} */ code, extra = '') => {
      clearTimeout(timer);
      resolve({ code, stdout, out: out + extra, ms: performance.now() - t0, timedOut });
    };
    child.on('error', (err) => done(-1, `\n${err.message}`));
    child.on('close', (code) => done(code));
  });
}

/**
 * The last JSON object a tool printed on stdout (tools called with --json print one), or null.
 * @param {string} stdout
 * @returns {any}
 */
export function lastJson(stdout) {
  const text = stdout.trim();
  try {
    return JSON.parse(text);
  } catch {
    // fall through: a JSON line after other output
  }
  for (const line of text.split('\n').reverse()) {
    if (!line.trim().startsWith('{')) continue;
    try {
      return JSON.parse(line);
    } catch {
      // not this line
    }
  }
  return null;
}

/**
 * The last lines of a tool's output, for a failure report.
 * @param {string} out
 * @param {number} [n]
 */
export const tail = (out, n = 25) => out.trimEnd().split('\n').slice(-n).join('\n');
