// @ts-check
// Captures the shots in Chromium (Playwright) with everything that could vary pinned: a fresh context per shot
// (empty storage unless the shot seeds it), 1920 × 1080 at device scale 1, en-US in UTC, Math.random seeded with the
// shot's seed, the page clock installed at the list's fixed time and advanced only by the harness (timers and
// requestAnimationFrame follow it), CSS animations frozen and the caret hidden in the screenshot.
/* global window, document -- the functions handed to page.evaluate run in the page */
import { createServer as createNetServer } from 'node:net';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { CAMERA } from '../../src/contracts/look.js';
import { SETUPS } from './setups.mjs';

/** @typedef {import('./shots.mjs').Shot} Shot */
/** @typedef {import('./shots.mjs').ShotList} ShotList */
/** @typedef {import('./shots.mjs').Target} Target */

const FRAME_MS = 1000 / 60;

/** @returns {Promise<number>} a free TCP port on 127.0.0.1 */
export function freePort() {
  return new Promise((done, fail) => {
    const s = createNetServer();
    s.on('error', fail);
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      s.close(() => done(port));
    });
  });
}

/**
 * A Vite dev server for a checkout on a free port, so the capture never shares a server with a running `npm run dev`.
 * @param {string} root
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export async function startDevServer(root) {
  const { createServer } = await import('vite');
  const port = await freePort();
  const server = await createServer({ root, configFile: join(root, 'vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1', port, strictPort: true, hmr: false } });
  await server.listen();
  return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
}

/** @param {number} seed  mulberry32, installed before any page script runs */
function seedRandom(seed) {
  let s = seed >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @param {Record<string, string>} entries */
function seedStorage(entries) {
  for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {Target} t
 */
function locate(page, t) {
  if (typeof t === 'string') return page.locator(t).first();
  return page.getByRole(/** @type {any} */ (t.role), { name: t.name, exact: t.exact }).first();
}

/**
 * Polls a condition in real time (up to 20 s) without touching the page clock: what a wait depends on (module
 * fetches, fonts) takes real time, and advancing the game clock per try would make the capture depend on how loaded
 * the machine is. Game time moves only in the explicit steps (`frames`, the 50 ms after each step, the settle).
 * @param {import('@playwright/test').Page} page
 * @param {() => Promise<boolean>} ok
 * @param {string} what
 */
async function until(page, ok, what) {
  const end = Date.now() + 20_000;
  while (Date.now() < end) {
    if (await ok()) return;
    await page.waitForTimeout(25);
  }
  throw new Error(`timed out waiting for ${what}`);
}

/**
 * Captures one shot.
 * @param {import('@playwright/test').Browser} browser
 * @param {string} baseURL
 * @param {ShotList} list
 * @param {Shot} shot
 * @returns {Promise<{ png: Buffer, errors: string[], state: { day: number | null, hour: number | null, minute: number | null, weather: string | null, scene: string | null, phase: string, floor: string | null, character: string | null, windows: number, toasts: number } | null }>}  state: the game after the capture (null before a run)
 */
export async function captureShot(browser, baseURL, list, shot) {
  const [width, height] = list.viewport;
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC', colorScheme: 'dark' });
  const page = await context.newPage();
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (e) => errors.push(`uncaught: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console.error: ${m.text()}`));
  try {
    await page.addInitScript(seedRandom, shot.seed);
    // capture mode: the 3D renderer poses its figures from the clock alone (no crossfades), so a shot repeats
    await page.addInitScript(() => void Object.defineProperty(window, '__visualCapture', { value: true }));
    if (shot.storage) {
      const entries = Object.fromEntries(Object.entries(shot.storage).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
      await page.addInitScript(seedStorage, entries);
    }
    // the page clock is paused at the list's instant before anything loads: Playwright's installed clock otherwise
    // runs in real time, and the game would advance while modules load
    const at = new Date(list.clock).getTime();
    await page.clock.install({ time: new Date(at - 1000) });
    await page.clock.pauseAt(new Date(at));
    await page.goto(new URL(shot.url, baseURL).href, { waitUntil: 'load' });
    for (const step of shot.steps) {
      const s = /** @type {any} */ (step);
      if (s.waitFor) await until(page, () => locate(page, s.waitFor).isVisible(), JSON.stringify(s.waitFor));
      else if (s.click) {
        await until(page, () => locate(page, s.click).isVisible(), JSON.stringify(s.click));
        await locate(page, s.click).click();
      } else if (s.check) await locate(page, s.check).check();
      else if (s.press) await page.keyboard.press(s.press);
      else if (s.frames) await page.clock.runFor(s.frames * FRAME_MS);
      else if (s.state) {
        const want = s.state;
        await until(
          page,
          () =>
            page.evaluate((w) => {
              const st = /** @type {any} */ (window).__game?.state;
              if (!st) return false;
              const have = { phase: st.phase, scene: st.player?.scene, character: st.meta?.character, home: st.home?.id, day: st.run?.day };
              return Object.entries(w).every(([k, v]) => /** @type {any} */ (have)[k] === v);
            }, want),
          `game state ${JSON.stringify(want)}`
        );
      } else if (s.setup) await page.evaluate(SETUPS[s.setup], s.args || {});
      await page.clock.runFor(50);
    }
    if (shot.camera) {
      // the renderer interface's camera (src/contracts/render.js); a 3D renderer derives the rest of its pose from
      // src/contracts/look.js, whose constants the baseline log records (lookFingerprint)
      await page.evaluate((camera) => {
        const r = /** @type {any} */ (window).__game?.ui?.renderer;
        if (!r) throw new Error('no renderer to point the camera with');
        r.cam.follow = false;
        if (camera.floor) /** @type {any} */ (window).__game.state.ui.viewFloor = camera.floor;
        r.centerOn(camera.lookAt[0], camera.lookAt[1]);
        // `zoom` is the renderer contract's (0.5 … 2.4); `lookZoom` is look.js's zoom amount (0 … 1), which a renderer
        // applies itself (setLookZoom) — the Canvas renderer has none and keeps its own zoom
        if (typeof camera.zoom === 'number') r.cam.zoom = camera.zoom;
        if (typeof camera.lookZoom === 'number' && typeof r.setLookZoom === 'function') r.setLookZoom(camera.lookZoom);
      }, shot.camera);
    }
    await page.clock.runFor((shot.settleFrames ?? list.settleFrames) * FRAME_MS);
    await page.evaluate(() => document.fonts.ready.then(() => true));
    const png = await page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
    const state = await page.evaluate(async () => {
      const st = /** @type {any} */ (window).__game?.state;
      if (!st?.clock) return null;
      const time = await import(/* @vite-ignore */ `${'/src/sim/time.js'}`).catch(() => null);
      const hours = time ? time.hourOfDay(st.clock) : null;
      return { day: time ? time.dayNumber(st.clock) : null, hour: hours == null ? null : Math.floor(hours), minute: hours == null ? null : Math.round((hours % 1) * 60), weather: st.weather?.today?.kind ?? null, scene: st.player?.scene ?? null, phase: st.phase, floor: st.ui?.viewFloor ?? st.player?.floor ?? null, character: st.meta?.character ?? null, windows: document.querySelectorAll('.win-title').length, toasts: document.querySelector('.toasts')?.childElementCount ?? 0 };
    });
    return { png, errors, state };
  } finally {
    await context.close();
  }
}

/** @returns {Promise<import('@playwright/test').Browser>} */
/**
 * Chromium flags for hardware WebGL in headless mode (the three.js renderer at 1080p costs seconds per frame on
 * SwiftShader). macOS only: Metal through ANGLE; elsewhere the software rasteriser stays.
 */
export const GPU_ARGS = process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [];

/**
 * @param {{ gpu?: boolean }} [opts]  gpu: hardware WebGL for 3D shots (the Canvas baselines stay on the default path)
 */
export const launch = (opts = {}) => chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb', ...(opts.gpu ? GPU_ARGS : [])] });

/** The look constants a 3D shot depends on, as one string for the baseline log. */
export const lookFingerprint = () => Object.entries(CAMERA).map(([k, v]) => `${k}=${v}`).join(',');
