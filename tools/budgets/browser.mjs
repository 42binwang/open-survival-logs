// @ts-check
// Browser measurements for the budgets, in Chromium (the full build, `channel: 'chromium'`, not the headless shell) at
// 1920 × 1080 (device scale 1), with the CPU throttled 4× (Emulation.setCPUThrottlingRate) and the network at
// 10 Mbit/s down with 40 ms RTT (Network.emulateNetworkConditions), both through the DevTools protocol:
// - the page runs the default renderer (no `?render`), which must be the phase's shipping renderer, on a hardware
//   WebGL device: SwiftShader or llvmpipe (software GL) makes every browser budget unmeasured;
// - first-interactive: navigation start to the first frame of the home scene after `renderer.ready`, with New Game
//   and Start clicked as soon as they are enabled; cold on a fresh profile, warm by relaunching the same persistent
//   profile (its HTTP cache);
// - initial download: bytes received (encoded, as the network delivered them) until the title screen shows, cold;
// - frame times: requestAnimationFrame intervals over a sampling window after a warm-up, per scenario;
// - draw calls and GPU memory: `renderer.stats()` sampled every frame of the window, the largest value kept.
/* global window, document, requestAnimationFrame, MutationObserver -- the functions handed to page.evaluate run in the page */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const VIEWPORT = Object.freeze({ width: 1920, height: 1080 });
/** The CPU throttle: 4× is the budget; 6× the low-end check (`--cpu 6`). */
export let CPU_THROTTLE = 4;
/** @param {number} rate */
export function setCpuThrottle(rate) {
  CPU_THROTTLE = rate;
}
/** 10 Mbit/s down, 40 ms round trip (upload unthrottled). */
export const NETWORK = Object.freeze({ offline: false, latency: 40, downloadThroughput: (10 * 1000 * 1000) / 8, uploadThroughput: -1 });
export const CHANNEL = 'chromium';
/** WebGL renderer strings of software rasterisers, which say nothing about a player's GPU. */
export const SOFTWARE_GL = /SwiftShader|llvmpipe|softpipe|Software Rasterizer|Microsoft Basic Render/i;

/**
 * The renderer a phase ships: from P1 the three.js renderer (docs/wp/README.md: 3D is the product from P1); in P0 the
 * registry's default.
 * @param {string} phase  P<n>
 * @returns {string | null}  a renderer id, or null for "the default, whichever it is"
 */
export const shippingRenderer = (phase) => (Number(phase.slice(1)) >= 1 ? '3d' : null);

/**
 * Whether a run's renderer and GL device can stand for the budgets, and why not.
 * @param {{ mode: string | null | undefined, gl: string | null | undefined, phase: string }} r
 * @returns {string | null}  null when it can; else the reason every browser budget is unmeasured
 */
export function rendererProblem({ mode, gl, phase }) {
  const want = shippingRenderer(phase);
  if (!mode) return 'the page reported no renderer (window.__game.ui.renderMode)';
  if (want && mode !== want) return `the default renderer is '${mode}', not the ${phase} shipping renderer '${want}'`;
  if (!gl) return 'the browser has no WebGL device';
  if (SOFTWARE_GL.test(gl)) return `WebGL runs on a software rasteriser (${gl}), not a GPU`;
  return null;
}

/** Installed before the page's scripts: the title-screen time, then the first home-scene frame after renderer.ready. */
function watchFirstInteractive() {
  const w = /** @type {any} */ (window);
  const title = () => [...document.querySelectorAll('button')].some((b) => /New Game/.test(b.textContent || '') && b.offsetParent !== null);
  const obs = new MutationObserver(() => {
    if (w.__titleShown == null && title()) {
      w.__titleShown = performance.now();
      obs.disconnect();
    }
  });
  document.addEventListener('DOMContentLoaded', () => {
    if (title()) w.__titleShown = performance.now();
    else obs.observe(document.documentElement, { childList: true, subtree: true });
  });
  const poll = setInterval(() => {
    const g = w.__game;
    if (!g?.state || g.state.player?.scene !== 'home' || w.__fiPending) return;
    w.__fiPending = true;
    clearInterval(poll);
    Promise.resolve(g.ui?.renderer?.ready).then(() => requestAnimationFrame(() => (w.__firstInteractive = performance.now())));
  }, 5);
}

/**
 * CPU and network throttling on a page, through its own DevTools session (before navigation, so it holds from the
 * first byte). Byte counts come from the same session.
 * @param {import('@playwright/test').BrowserContext} context
 * @param {import('@playwright/test').Page} page
 * @param {{ network?: boolean }} [o]
 */
async function throttle(context, page, { network = true } = {}) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
  const got = { bytes: 0, requests: 0 };
  if (network) {
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', NETWORK);
    cdp.on('Network.loadingFinished', (e) => {
      got.bytes += e.encodedDataLength;
      got.requests++;
    });
  }
  return { cdp, got };
}

/**
 * The WebGL device the page sees (unmasked renderer string), or null.
 * @param {import('@playwright/test').Page} page
 */
export async function glRenderer(page) {
  return page.evaluate(() => {
    const c = document.createElement('canvas');
    const gl = /** @type {WebGLRenderingContext | null} */ (c.getContext('webgl2') || c.getContext('webgl'));
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  });
}

/**
 * New Game, the survivor of `character` (the default when absent), Start: each clicked as soon as it is enabled.
 * @param {import('@playwright/test').Page} page
 */
async function newGame(page) {
  await page.getByRole('button', { name: 'New Game' }).click({ timeout: 120_000 });
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
}

/**
 * One load on a persistent profile: title time, bytes to the title, first-interactive.
 * @param {import('@playwright/test').BrowserType} type
 * @param {string} profile
 * @param {string} url
 */
async function oneLoad(type, profile, url) {
  const context = await type.launchPersistentContext(profile, { channel: CHANNEL, viewport: VIEWPORT, deviceScaleFactor: 1 });
  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.addInitScript(watchFirstInteractive);
    const { got } = await throttle(context, page);
    await page.goto(url, { waitUntil: 'commit', timeout: 120_000 });
    await page.waitForFunction(() => /** @type {any} */ (window).__titleShown != null, null, { timeout: 120_000, polling: 20 });
    const titleBytes = got.bytes;
    const titleRequests = got.requests;
    await newGame(page);
    await page.waitForFunction(() => /** @type {any} */ (window).__firstInteractive != null, null, { timeout: 120_000, polling: 50 });
    const t = await page.evaluate(() => ({ title: /** @type {any} */ (window).__titleShown, fi: /** @type {any} */ (window).__firstInteractive, mode: /** @type {any} */ (window).__game?.ui?.renderMode }));
    return { titleMs: t.title, interactiveMs: t.fi, titleBytes, titleRequests, mode: t.mode, gl: await glRenderer(page) };
  } finally {
    await context.close();
  }
}

/**
 * Cold (fresh profile) and warm (the same profile relaunched) loads of the default renderer.
 * @param {import('@playwright/test').BrowserType} type
 * @param {{ url: string }} server
 */
export async function measureLoads(type, server) {
  const profile = mkdtempSync(join(tmpdir(), 'budgets-profile-'));
  try {
    const cold = await oneLoad(type, profile, `${server.url}/`);
    const warm = await oneLoad(type, profile, `${server.url}/`);
    return {
      coldMs: cold.interactiveMs,
      warmMs: warm.interactiveMs,
      coldTitleMs: cold.titleMs,
      initialBytes: cold.titleBytes,
      coldRequests: cold.titleRequests,
      warmBytes: warm.titleBytes,
      mode: cold.mode,
      gl: cold.gl,
    };
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
}

/**
 * @typedef {object} Scenario
 * @property {string} id
 * @property {string} title
 * @property {Record<string, string>} [storage]  localStorage entries before load (a save to Continue)
 * @property {'new' | 'continue'} start
 * @property {'grids'} [open]  after the start: the backpack (I) and a storage piece's grid
 */

/**
 * Opens the grid of a storage piece on the survivor's floor (clicked through the renderer's toCanvas, then its first
 * action, Organize Supplies) and the backpack (the I hotkey, unless the storage window shows it), and says whether
 * both grids are up.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string | null>}  null when both are open, else what failed
 */
async function openGrids(page) {
  const target = await page.evaluate(() => {
    const g = /** @type {any} */ (window).__game;
    const s = g.state;
    const floor = s.ui.viewFloor ?? s.player.floor;
    const bp = Object.values(s.inventories).find((i) => /** @type {any} */ (i).kind === 'backpack');
    const box = /** @type {any} */ (Object.values(s.furniture || {}).find((f) => /** @type {any} */ (f).inv && /** @type {any} */ (f).floor === floor && s.inventories[/** @type {any} */ (f).inv]?.kind === 'furniture'));
    if (!box || !bp) return null;
    const [x, y] = g.ui.renderer.toCanvas(box.x + box.w / 2, box.y + box.h / 2);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    return { x: x / dpr, y: y / dpr, inv: box.inv, backpack: /** @type {any} */ (bp).id };
  });
  if (!target) return 'no storage piece with a grid on the survivor’s floor';
  await page.mouse.click(target.x, target.y);
  const item = page.locator('.ctxmenu button:not([disabled])');
  await item.first().waitFor({ timeout: 10_000 }).catch(() => {});
  if (!(await item.count())) return `no enabled action in the context menu of the storage piece at (${Math.round(target.x)}, ${Math.round(target.y)})`;
  await item.first().click();
  await page.locator(`.inv-grid[data-inv="${target.inv}"]`).waitFor({ timeout: 60_000 }).catch(() => {});
  if (!(await page.locator(`.inv-grid[data-inv="${target.backpack}"]`).count())) await page.keyboard.press('i');
  const up = await page
    .waitForFunction(
      ({ a, b }) => !!document.querySelector(`.inv-grid[data-inv="${a}"]`) && !!document.querySelector(`.inv-grid[data-inv="${b}"]`),
      { a: target.backpack, b: target.inv },
      { timeout: 60_000 }
    )
    .then(() => true)
    .catch(() => false);
  return up ? null : `the backpack (${target.backpack}) and storage (${target.inv}) grids did not both open`;
}

/**
 * Frame-time sample of one scenario on the default renderer: reach it through the title screen, run the game at the
 * fastest speed, drop a warm-up, then record every requestAnimationFrame interval over the window, sampling
 * `renderer.stats()` each frame.
 * @param {import('@playwright/test').Browser} browser
 * @param {string} baseURL
 * @param {Scenario} sc
 * @param {{ warmupMs: number, sampleMs: number }} timing
 */
export async function measureFrames(browser, baseURL, sc, { warmupMs, sampleMs }) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    /** @type {string[]} */
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    if (sc.storage) {
      await page.addInitScript((entries) => {
        for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
      }, sc.storage);
    }
    await page.goto(`${baseURL}/`, { waitUntil: 'load' });
    if (sc.start === 'new') await newGame(page);
    else await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForFunction(() => /** @type {any} */ (window).__game?.state?.player?.scene != null, null, { timeout: 60_000 });
    await page.evaluate(() => Promise.resolve(/** @type {any} */ (window).__game?.ui?.renderer?.ready));
    const blocked = sc.open === 'grids' ? await openGrids(page) : null;
    await page.evaluate(() => {
      const s = /** @type {any} */ (window).__game.state;
      s.clock.speed = 3;
      s.clock.relaxed = false;
    });
    await throttle(context, page, { network: false });
    const sample = /** @type {{ t: number[], drawCalls: number | null, gpuBytes: number | null, statsFrames: number }} */ (
      await page.evaluate(
        ({ warm, dur }) =>
          new Promise((done) => {
            /** @type {number[]} */
            const t = [];
            let drawCalls = /** @type {number | null} */ (null);
            let gpuBytes = /** @type {number | null} */ (null);
            let statsFrames = 0;
            const r = /** @type {any} */ (window).__game?.ui?.renderer;
            const t0 = performance.now();
            const f = (/** @type {number} */ now) => {
              if (now - t0 >= warm) {
                t.push(now);
                const s = typeof r?.stats === 'function' ? r.stats() : null;
                if (s && typeof s === 'object') {
                  statsFrames++;
                  if (Number.isFinite(s.drawCalls)) drawCalls = Math.max(drawCalls ?? 0, s.drawCalls);
                  if (Number.isFinite(s.gpuBytes)) gpuBytes = Math.max(gpuBytes ?? 0, s.gpuBytes);
                }
              }
              if (now - t0 < warm + dur) requestAnimationFrame(f);
              else done({ t, drawCalls, gpuBytes, statsFrames });
            };
            requestAnimationFrame(f);
          }),
        { warm: warmupMs, dur: sampleMs }
      )
    );
    const times = sample.t;
    const intervals = times.slice(1).map((t, i) => t - times[i]);
    const info = await page.evaluate(() => {
      const g = /** @type {any} */ (window).__game;
      const s = g.state;
      return { mode: g.ui?.renderMode, scene: s.player.scene, phase: s.phase, zombies: (s.zombies?.length ?? 0) + (s.explore?.run?.zombies?.length ?? 0), day: s.run?.day ?? 0, weather: s.weather?.today?.kind };
    });
    const { mode, ...state } = info;
    return { id: sc.id, intervals, renderer: mode, gl: await glRenderer(page), drawCalls: sample.drawCalls, gpuBytes: sample.gpuBytes, statsFrames: sample.statsFrames, errors, state, blocked };
  } finally {
    await context.close();
  }
}
