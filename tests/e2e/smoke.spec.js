// @ts-check
// Smoke tier (@smoke): the game boots in Chromium, a new run reaches the apartment and the Canvas renderer draws it.
import { test, expect } from '@playwright/test';

/**
 * Uncaught page errors and console errors seen so far; a smoke run must end with none.
 * @param {import('@playwright/test').Page} page
 */
function collectErrors(page) {
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (err) => errors.push(`uncaught: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  return errors;
}

/** @param {import('@playwright/test').Page} page */
const gameState = (page) => page.evaluate(() => {
  const g = /** @type {any} */ (window).__game;
  return g?.state ? { scene: g.state.player.scene, home: g.state.home.id, character: g.state.meta.character, phase: g.state.phase } : null;
});

/**
 * Samples the scene canvas: the share of pixels that differ from the clear color and the number of distinct colors.
 * @param {import('@playwright/test').Page} page
 */
const canvasStats = (page) => page.evaluate(async () => {
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('scene'));
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const clear = [0x15, 0x17, 0x1a];
  const colors = new Set();
  let drawn = 0;
  let samples = 0;
  for (let i = 0; i < data.length; i += 4 * 7) {
    samples++;
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    if (Math.abs(r - clear[0]) + Math.abs(g - clear[1]) + Math.abs(b - clear[2]) > 24) drawn++;
    colors.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
  }
  return { width: canvas.width, height: canvas.height, drawn: drawn / samples, colors: colors.size };
});

test('title screen → New Game → the apartment renders', { tag: '@smoke' }, async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await page.goto('/?render=2d');
  await expect(page.locator('.title-logo')).toHaveText('Survival Log');
  await page.getByRole('button', { name: 'New Game' }).click();

  await expect(page.getByRole('heading', { name: 'Choose your past' })).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start', exact: true }).click();

  await expect.poll(() => gameState(page)).toEqual({ scene: 'home', home: 'apartment', character: 'wage', phase: 'pre' });
  await expect(page.locator('#hud')).toBeVisible();
  expect(await page.evaluate(() => /** @type {any} */ (window).__game.ui.renderMode)).toBe('2d');

  const stats = await canvasStats(page);
  expect(stats.width).toBe(1920);
  expect(stats.drawn, 'the apartment covers a good part of the screen').toBeGreaterThan(0.12);
  expect(stats.colors, 'floors, walls, furniture and the survivor in their own colors').toBeGreaterThan(12);

  const shot = testInfo.outputPath('apartment.png');
  await page.screenshot({ path: shot });
  await testInfo.attach('apartment', { path: shot, contentType: 'image/png' });
  expect(errors).toEqual([]);
});

test('renderer switch: no ?render and an unknown id run the three.js renderer (the default with WebGL2), ?render=2d the Canvas one', { tag: '@smoke' }, async ({ page }) => {
  const errors = collectErrors(page);
  /** @type {string[]} */
  const warnings = [];
  page.on('console', (msg) => {
    if (msg.type() === 'warning') warnings.push(msg.text());
  });
  for (const [url, mode] of [
    ['/', '3d'],
    ['/?render=2d', '2d'],
    ['/?render=nope', '3d'],
  ]) {
    await page.goto(url);
    await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).__game?.ui?.renderMode)).toBe(mode);
  }
  expect(warnings.filter((w) => w.includes('?render=nope: no such renderer'))).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('the three.js renderer (?render=3d) draws the apartment: shell, props and the survivor, no errors', { tag: '@smoke' }, async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  // headless Chromium renders WebGL in software; the warnings it prints about that are not errors of the game
  await page.goto('/?render=3d&quality=low');
  await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).__game?.ui?.renderMode)).toBe('3d');
  await page.getByRole('button', { name: 'New Game' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect.poll(() => gameState(page)).toEqual({ scene: 'home', home: 'apartment', character: 'wage', phase: 'pre' });
  await page.evaluate(() => /** @type {any} */ (window).__game.ui.renderer.ready);
  const frame = () =>
    page.evaluate(async () => {
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      const r = /** @type {any} */ (window).__game.ui.renderer;
      const walls = r.shell?.group.children.filter((/** @type {any} */ o) => o.name === 'walls').length || 0;
      return { stats: r.stats(), walls, props: r.furniture.items.size, actors: r.actors.actors.length, model: r.actors.actors[0]?.model === true };
    });
  await expect.poll(async () => (await frame()).model, { timeout: 30000 }).toBe(true);
  const f = await frame();
  expect(f.walls, 'the shell has walls').toBeGreaterThan(0);
  expect(f.props, 'a prop for each piece of the apartment').toBeGreaterThan(15);
  expect(f.actors, 'the survivor').toBeGreaterThan(0);
  expect(f.stats.drawCalls, 'draw calls counted over every pass').toBeGreaterThan(50);
  expect(f.stats.triangles).toBeGreaterThan(10000);
  const shot = testInfo.outputPath('apartment-3d.png');
  await page.screenshot({ path: shot });
  await testInfo.attach('apartment-3d', { path: shot, contentType: 'image/png' });
  expect(errors).toEqual([]);
});
