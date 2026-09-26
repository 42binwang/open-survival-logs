// @ts-check
// WP-P0-07: the UI style tile (pages/ui-tile.html) and the kit sheet (?view=kit) in English and Chinese.
//  - no console errors, failed requests or images that did not load; the backdrop is a 1920 × 1080 still;
//  - no overflowing, clipped or covered text: every text run's box keeps scrollWidth ≤ clientWidth and scrollHeight ≤
//    clientHeight, every line box stays inside each clipping ancestor (and, on the tile, inside the frame), and a
//    hit test at three points per line, with pointer events forced on, finds the text's own element on top;
//  - no two items share a grid cell and every item lies inside its grid, on the tile and on the kit sheet;
//  - contrast: every text run against the colour actually composited under it (a screenshot with the text hidden),
//    ≥ 4.5 : 1 for normal text and ≥ 3 : 1 for large text (src/ui/kit/contrast.js); disabled controls are listed but exempt.
// Screenshots go to the test output; with UI_TILE_OUT=<dir> they (and the boards against the source) are also
// written there: `UI_TILE_OUT=docs/art/ui npx playwright test tests/e2e/ui-tile.spec.js` refreshes docs/art/ui.
import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { decodePng } from '../../tools/lib/png.mjs';
import { parseColor, over, contrast, requiredContrast, toHex, luminance, darkenToContrast, toLab, AA_NORMAL } from '../../src/ui/kit/contrast.js';
import { artAngle, iconBox, slotSize, freshness, placed, PITCH } from '../../src/ui/kit/slot.js';
import { splitQuality, withQuality, formatFootprint, formatKg, formatLoad, formatMoney } from '../../src/ui/kit/format.js';
import { item } from '../../src/data/db.js';
import { BACKPACK, FRIDGE, SHOP, SOURCE_NAMES } from '../../pages/ui-tile/content.js';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = process.env.UI_TILE_OUT ? resolve(ROOT, process.env.UI_TILE_OUT) : null;
const W = 1920;
const H = 1080;

/**
 * @typedef {{ x: number, y: number, w: number, h: number }} Rect
 * @typedef {{ text: string, path: string, color: string, fontSize: number, fontWeight: number, opacity: number,
 *   disabled: boolean, rects: Rect[], overflow: string | null, clipped: string | null, covered: string | null }} Run
 */

/**
 * Page errors, console errors, failed requests and HTTP errors seen so far.
 * @param {import('@playwright/test').Page} page
 */
function collectErrors(page) {
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (err) => errors.push(`uncaught: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  page.on('requestfailed', (req) => errors.push(`request failed: ${req.url()} (${req.failure()?.errorText})`));
  page.on('response', (res) => {
    if (res.status() >= 400) errors.push(`HTTP ${res.status()}: ${res.url()}`);
  });
  return errors;
}

/**
 * Opens a view and waits until its fonts and images are ready and its entry animations have finished.
 * @param {import('@playwright/test').Page} page
 * @param {'tile' | 'kit'} view
 * @param {'en' | 'zh'} lang
 */
async function open(page, view, lang) {
  await page.goto(`/pages/ui-tile.html?lang=${lang}${view === 'kit' ? '&view=kit' : ''}`);
  await page.waitForFunction(() => document.documentElement.dataset.ready);
  expect(await page.evaluate(() => document.documentElement.dataset.ready), 'the page built without an error').toBe('true');
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity);
    await Promise.all(finite.map((a) => a.finished));
  });
}

/**
 * Every visible text run with its style, boxes and layout problems (runs in the page).
 * @param {import('@playwright/test').Page} page
 * @param {boolean} framed  text must stay inside the 1920 × 1080 frame
 * @returns {Promise<Run[]>}
 */
function textRuns(page, framed) {
  return page.evaluate(
    ({ framed, W, H }) => {
      const pathOf = (/** @type {Element} */ el) => {
        const parts = [];
        for (let e = /** @type {Element | null} */ (el); e && e !== document.body && parts.length < 5; e = e.parentElement) {
          const cls = [...e.classList].filter((c) => !c.startsWith('is-')).slice(0, 2).join('.');
          parts.unshift(`${e.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`);
        }
        return parts.join(' > ');
      };
      // hit tests see every element, including the ones the kit makes click-through (tooltips, toasts, icons)
      const force = document.createElement('style');
      force.textContent = '*, *::before, *::after { pointer-events: auto !important; }';
      document.head.append(force);
      /** @type {Run[]} */
      const runs = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
        const parent = node.parentElement;
        if (!text || !parent || parent.closest('script, style')) continue;
        const cs = getComputedStyle(parent);
        if (cs.visibility !== 'visible') continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
        if (!rects.length) continue;
        let opacity = 1;
        for (let e = /** @type {Element | null} */ (parent); e; e = e.parentElement) opacity *= parseFloat(getComputedStyle(e).opacity);
        if (opacity < 0.01) continue;
        const svg = parent.closest('svg');
        /** @type {string | null} */
        let overflow = null;
        /** @type {string | null} */
        let clipped = null;
        if (svg) {
          const box = svg.getBoundingClientRect();
          if (rects.some((r) => r.left < box.left - 0.5 || r.right > box.right + 0.5 || r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5)) clipped = 'outside its <svg>';
        } else {
          let owner = /** @type {HTMLElement} */ (parent);
          while (owner.parentElement && ['inline', 'contents'].includes(getComputedStyle(owner).display)) owner = owner.parentElement;
          if (owner.scrollWidth > owner.clientWidth + 1 || owner.scrollHeight > owner.clientHeight + 1) {
            overflow = `${pathOf(owner)}: scroll ${owner.scrollWidth} × ${owner.scrollHeight} > client ${owner.clientWidth} × ${owner.clientHeight}`;
          }
        }
        for (let a = /** @type {Element | null} */ (parent); a && !clipped; a = a.parentElement) {
          const s = getComputedStyle(a);
          if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
          const b = a.getBoundingClientRect();
          const box = { left: b.left + a.clientLeft, top: b.top + a.clientTop, right: b.left + a.clientLeft + a.clientWidth, bottom: b.top + a.clientTop + a.clientHeight };
          if (rects.some((r) => r.left < box.left - 0.5 || r.right > box.right + 0.5 || r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5)) clipped = `clipped by ${pathOf(a)}`;
        }
        if (!clipped && framed && rects.some((r) => r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5)) clipped = 'outside the 1920 × 1080 frame';
        const owner = svg && !(parent instanceof SVGTextContentElement) ? svg : parent;
        /** @type {Set<string>} */
        const above = new Set();
        for (const r of rects) {
          for (const fx of [0.2, 0.5, 0.8]) {
            const top = document.elementFromPoint(r.left + r.width * fx, r.top + r.height / 2);
            if (!top) above.add('nothing (outside the viewport)');
            else if (top !== owner && !owner.contains(top)) above.add(pathOf(top));
          }
        }
        runs.push({
          text: text.slice(0, 60),
          path: pathOf(parent),
          color: svg ? cs.fill : cs.color,
          fontSize: parseFloat(cs.fontSize),
          fontWeight: parseInt(cs.fontWeight, 10),
          opacity,
          disabled: !!parent.closest('button:disabled, [aria-disabled="true"], .is-disabled'),
          rects: rects.map((r) => ({ x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height })),
          overflow,
          clipped,
          covered: above.size ? `covered by ${[...above].join(', ')}` : null,
        });
      }
      force.remove();
      return runs;
    },
    { framed, W, H }
  );
}

/**
 * Items that share a cell with another item or leave their grid, on every inventory grid of the page. A dragged
 * copy (.sl-slot--ghost) is not placed and may overlap.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
function gridOverlaps(page) {
  return page.evaluate(() => {
    const num = (/** @type {HTMLElement} */ e, /** @type {string} */ k) => Number(e.style.getPropertyValue(k));
    /** @type {string[]} */
    const out = [];
    [...document.querySelectorAll('.sl-grid')].forEach((grid, gi) => {
      const g = /** @type {HTMLElement} */ (grid);
      const [cols, rows] = [num(g, '--cols'), num(g, '--rows')];
      const name = `${g.getAttribute('aria-label') ?? 'grid'} #${gi}`;
      /** @type {Map<string, string>} */
      const used = new Map();
      for (const el of g.querySelectorAll('.sl-slot:not(.sl-slot--ghost)')) {
        const s = /** @type {HTMLElement} */ (el);
        const [x, y, w, h] = ['--x', '--y', '--w', '--h'].map((k) => num(s, k));
        const what = `${s.querySelector('img')?.getAttribute('alt') ?? 'item'} at ${x},${y} (${w} × ${h})`;
        if (x < 0 || y < 0 || x + w > cols || y + h > rows) out.push(`${name}: ${what} leaves the ${cols} × ${rows} grid`);
        for (let cy = y; cy < y + h; cy++) {
          for (let cx = x; cx < x + w; cx++) {
            const k = `${cx},${cy}`;
            if (used.has(k)) out.push(`${name}: ${what} shares cell ${k} with ${used.get(k)}`);
            used.set(k, what);
          }
        }
      }
    });
    return out;
  });
}

/**
 * The page with every glyph hidden (text, text shadows, SVG text), as PNG bytes: what each text run sits on.
 * @param {import('@playwright/test').Page} page
 * @param {boolean} fullPage
 */
async function backgroundShot(page, fullPage) {
  const style = await page.addStyleTag({
    content:
      '*, *::before, *::after { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; } svg text { fill: transparent !important; }',
  });
  const png = await page.screenshot({ fullPage, animations: 'disabled' });
  await style.evaluate((el) => el.parentNode?.removeChild(el));
  return png;
}

/**
 * Contrast of each run against the pixels under it. The worst 2 % of pixels are ignored (a border or the edge of a
 * neighbouring fill crossing the line box), the rest must all pass.
 * @param {Run[]} runs
 * @param {import('../../tools/lib/png.mjs').Image} img
 */
function measureContrast(runs, img) {
  return runs.map((run) => {
    const fg = parseColor(run.color);
    fg.a *= run.opacity;
    /** @type {number[]} */
    const ratios = [];
    const lums = [];
    for (const r of run.rects) {
      for (let y = Math.max(0, Math.floor(r.y)); y < Math.min(img.height, Math.ceil(r.y + r.h)); y++) {
        for (let x = Math.max(0, Math.floor(r.x)); x < Math.min(img.width, Math.ceil(r.x + r.w)); x++) {
          const i = (y * img.width + x) * img.channels;
          const bg = { r: img.data[i], g: img.data[i + 1], b: img.data[i + 2], a: 1 };
          ratios.push(contrast(over(fg, bg), bg));
          lums.push(luminance(bg));
        }
      }
    }
    ratios.sort((a, b) => a - b);
    const p2 = ratios[Math.floor(ratios.length * 0.02)] ?? 0;
    const need = requiredContrast(run.fontSize, run.fontWeight);
    const mid = lums.sort((a, b) => a - b)[Math.floor(lums.length / 2)] ?? 0;
    return { text: run.text, path: run.path, color: toHex(fg), fontSize: run.fontSize, fontWeight: run.fontWeight, disabled: run.disabled, worst: +ratios[0]?.toFixed(2), p2: +p2.toFixed(2), need, bgMedianL: +mid.toFixed(4) };
  });
}

/**
 * @param {import('@playwright/test').TestInfo} info
 * @param {string} name
 * @param {Buffer} png
 */
async function keep(info, name, png) {
  const path = info.outputPath(name);
  writeFileSync(path, png);
  await info.attach(name, { path, contentType: 'image/png' });
  if (OUT) {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, name), png);
  }
}

for (const view of /** @type {const} */ (['tile', 'kit'])) {
  for (const lang of /** @type {const} */ (['en', 'zh'])) {
    const tag = view === 'tile' ? { tag: '@smoke' } : {};
    test(`${view} (${lang}): renders cleanly, no clipped text, AA contrast`, tag, async ({ page }, info) => {
      const errors = collectErrors(page);
      await open(page, view, lang);
      const framed = view === 'tile';

      const backdrop = await page.locator('.tile-backdrop').evaluate((img) => ({ w: /** @type {HTMLImageElement} */ (img).naturalWidth, h: /** @type {HTMLImageElement} */ (img).naturalHeight }));
      expect(backdrop, 'the backdrop is one 1920 × 1080 still').toEqual({ w: W, h: H });
      const broken = await page.evaluate(() => [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src));
      expect(broken, 'every image loaded').toEqual([]);
      const icons = await page.evaluate(() => new Set([...document.images].map((i) => i.currentSrc).filter((s) => s.includes('/assets/icons/'))).size);
      expect(icons, 'the rendered icons are on screen').toBeGreaterThan(0);
      if (framed) {
        const size = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
        expect(size, 'nothing spills outside the 1920 × 1080 frame').toEqual({ w: W, h: H });
      }

      expect(await gridOverlaps(page), 'no two items share a cell; every item lies inside its grid').toEqual([]);
      // the hit test only sees the viewport: the kit sheet is laid out in one viewport as tall as the page
      if (!framed) await page.setViewportSize({ width: W, height: await page.evaluate(() => document.documentElement.scrollHeight) });
      const runs = await textRuns(page, framed);
      if (!framed) await page.setViewportSize({ width: W, height: H });
      expect(runs.length, 'the view has text').toBeGreaterThan(framed ? 60 : 150);
      const layout = runs.filter((r) => r.overflow || r.clipped || r.covered).map((r) => `"${r.text}" (${r.path}): ${r.overflow || r.clipped || r.covered}`);
      expect(layout, 'no overflowing, clipped or covered text').toEqual([]);

      const shot = await page.screenshot({ fullPage: !framed, animations: 'disabled' });
      await keep(info, `${view}-${lang}.png`, shot);
      const bg = decodePng(await backgroundShot(page, !framed));
      const measured = measureContrast(runs, bg);
      const report = info.outputPath(`${view}-${lang}-contrast.json`);
      writeFileSync(report, `${JSON.stringify(measured, null, 1)}\n`);
      await info.attach(`${view}-${lang}-contrast.json`, { path: report, contentType: 'application/json' });
      const failing = measured.filter((m) => !m.disabled && m.p2 < m.need).map((m) => `"${m.text}" (${m.path}) ${m.color} ${m.fontSize}px/${m.fontWeight}: ${m.p2} : 1 < ${m.need}`);
      expect(failing, 'every text run meets AA against its composited background').toEqual([]);
      const body = measured.filter((m) => !m.disabled && m.need === AA_NORMAL);
      expect(body.length, 'body-size text was measured').toBeGreaterThan(framed ? 40 : 100);
      expect(errors).toEqual([]);
    });
  }
}

test('kit helpers: icon fit, freshness, contrast, quality text', { tag: '@smoke' }, () => {
  expect(PITCH).toBe(68);
  expect(slotSize(3, 4)).toEqual({ width: 200, height: 268 });
  expect(placed([2, 1], true)).toEqual([1, 2]);
  expect(iconBox([0.66, 0.66], [1, 1])).toBeCloseTo(64, 6);
  expect(iconBox([0.66, 0.5095], [2, 1])).toBeCloseTo((0.66 * 64) / 0.5095, 6);
  expect(iconBox([0.66, 0.415], [2, 1], true)).toBeCloseTo((0.66 * 64) / 0.415, 6);
  // a render lying across its footprint stands up with a quarter turn; rotating the item then lays it back down
  expect([artAngle(-90), artAngle(-90, true), artAngle(0, true), artAngle(90, true)]).toEqual([-90, 0, 90, 180]);
  expect(iconBox([0.66, 0.4182], [1, 2])).toBeCloseTo(64, 6);
  expect(iconBox([0.66, 0.4182], [1, 2], false, 0.66, -90)).toBeCloseTo((0.66 * 64) / 0.4182, 6);
  expect(iconBox([0.66, 0.4182], [1, 2], true, 0.66, -90)).toBeCloseTo((0.66 * 64) / 0.4182, 6);
  expect(freshness(5, -1)).toBeNull();
  expect(freshness(9, 10)).toEqual({ v: 0.9, state: 'fresh' });
  expect(freshness(0.9, 2)?.state).toBe('soon');
  expect(freshness(1.5, 10)?.state).toBe('soon');
  expect(freshness(-0.4, 2)).toEqual({ v: 0, state: 'expired' });
  expect(contrast(parseColor('#000'), parseColor('#ffffff'))).toBeCloseTo(21, 6);
  expect(contrast(parseColor('rgb(225 225 223)'), parseColor('#232522'))).toBeCloseTo(11.8, 1);
  const panel = over(parseColor('rgb(33 36 32 / 0.9)'), parseColor('#373737'));
  expect([panel.r, panel.g, panel.b].map((v) => Math.round(v * 10) / 10)).toEqual([35.2, 37.9, 34.3]);
  expect(requiredContrast(20, 700)).toBe(3);
  expect(requiredContrast(20, 400)).toBe(4.5);
  expect(splitQuality('午餐肉煎蛋(完美)')).toEqual({ base: '午餐肉煎蛋', quality: 'perfect' });
  expect(withQuality('Luncheon Meat and Fried Egg', 'good', 'en')).toBe('Luncheon Meat and Fried Egg (Good)');
  expect(withQuality('午餐肉煎蛋', 'failed', 'zh')).toBe('午餐肉煎蛋【失败】');
  expect(formatFootprint([3, 4])).toBe('[3x4]');
  expect(formatKg(500)).toBe('0.50kg');
});

test('kit tokens: the twelve measured tokens of docs/ART.md §8 keep their values; every token used is defined', { tag: '@smoke' }, () => {
  const kit = join(ROOT, 'src/ui/kit');
  const tokens = readFileSync(join(kit, 'tokens.css'), 'utf8');
  const art = readFileSync(join(ROOT, 'docs/ART.md'), 'utf8');
  const section = art.slice(art.indexOf('## 8. UI'), art.indexOf('## 9.'));
  const measured = [...section.matchAll(/^\| `(--ui-[a-z-]+)` \| (`#[0-9a-f]{6}`(?: \/ `#[0-9a-f]{6}`)?) \|/gm)].map((m) => ({ name: m[1], hexes: [...m[2].matchAll(/#[0-9a-f]{6}/g)].map((h) => h[0]) }));
  expect(measured.length, 'ART.md §8 lists twelve tokens').toBe(12);
  const defined = new Map([...tokens.matchAll(/^\s*(--ui-[a-z0-9-]+):\s*([^;]+);/gm)].map((m) => [m[1], m[2].trim()]));
  for (const { name, hexes } of measured) {
    expect(defined.get(name), `${name} is defined as in ART.md`).toBe(hexes[0]);
    if (hexes.length === 2) expect(defined.get(`${name}-light`), `${name}-light is the second measured value`).toBe(hexes[1]);
  }
  const css = ['tokens.css', 'base.css', 'components.css', 'inventory.css', 'hud.css'].map((f) => readFileSync(join(kit, f), 'utf8')).join('\n');
  const used = new Set([...css.matchAll(/var\((--ui-[a-z0-9-]+)/g)].map((m) => m[1]));
  const missing = [...used].filter((name) => !defined.has(name));
  expect(missing, 'no component reads an undefined token').toEqual([]);
});

test('kit tokens: the Buy face is the measured rest green darkened to AA; component CSS reads colours only from tokens', { tag: '@smoke' }, () => {
  const kit = join(ROOT, 'src/ui/kit');
  const tokens = readFileSync(join(kit, 'tokens.css'), 'utf8');
  const value = (/** @type {string} */ name) => new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm').exec(tokens)?.[1].trim();
  const derived = darkenToContrast(/** @type {string} */ (value('--ui-buy-rest')), /** @type {string} */ (value('--ui-buy-label')));
  expect(derived).toEqual({ hex: value('--ui-buy-face'), dL: 0.6, ratio: 4.52 });
  expect(contrast(parseColor(/** @type {string} */ (value('--ui-buy'))), parseColor('#ffffff')), 'white on the source\'s hovered green misses AA, so the kit steps its faces down').toBeLessThan(AA_NORMAL);
  // rest and hover faces: lighter at the top, the label's backing (the face stop) at AA, hover an even lift of rest
  const L = (/** @type {string} */ name) => toLab(parseColor(/** @type {string} */ (value(name)))).L;
  const white = parseColor(/** @type {string} */ (value('--ui-buy-label')));
  for (const face of ['--ui-buy-face', '--ui-buy-rest-face']) expect(contrast(parseColor(/** @type {string} */ (value(face))), white), `${face} backs the label at AA`).toBeGreaterThanOrEqual(AA_NORMAL);
  for (const [top, face, bottom] of [['--ui-buy-hover-top', '--ui-buy-face', '--ui-buy-hover-bottom'], ['--ui-buy-rest-top', '--ui-buy-rest-face', '--ui-buy-rest-bottom']]) {
    expect(L(top), `${top} is lighter than ${face}`).toBeGreaterThan(L(face));
    expect(L(face), `${face} is lighter than ${bottom}`).toBeGreaterThan(L(bottom));
  }
  const step = L('--ui-buy-face') - L('--ui-buy-rest-face');
  const source = toLab(parseColor('#648e3f')).L - toLab(parseColor('#5c8439')).L;
  expect(Math.abs(step - source), 'hover lifts the face by the source\'s rest-to-hover step').toBeLessThan(1);
  expect(L('--ui-buy-hover-top') - L('--ui-buy-rest-top')).toBeCloseTo(step, 0);
  const components = readFileSync(join(kit, 'components.css'), 'utf8');
  const hover = /\.sl-btn--buy\.is-hover:not\(:disabled\) \{([^}]*)\}/.exec(components)?.[1] ?? '';
  expect(hover, 'the Buy hover is a vertical gradient with no shadow ring').toMatch(/linear-gradient\(var\(--ui-buy-hover-top\), var\(--ui-buy-face\) 4px, var\(--ui-buy-hover-bottom\)\)/);
  expect(hover).toMatch(/box-shadow: none/);
  for (const file of ['base.css', 'components.css', 'inventory.css', 'hud.css']) {
    const css = readFileSync(join(kit, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const raw = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/g)].map((m) => m[0]);
    expect(raw, `${file}: colours live in tokens.css`).toEqual([]);
  }
});

test('measurements: every sample box docs/UI.md quotes is in docs/art/ui/measurements.json, at the colour it quotes', { tag: '@smoke' }, () => {
  const m = JSON.parse(readFileSync(join(ROOT, 'docs/art/ui/measurements.json'), 'utf8'));
  /** @type {{ box: number[], hex: string, uiMd: string | null }[]} */
  const samples = Object.values(m.samples);
  let quoted = 0;
  for (const line of readFileSync(join(ROOT, 'docs/UI.md'), 'utf8').split('\n')) {
    for (const b of line.matchAll(/`\[(\d+),(\d+),(\d+),(\d+)\]`/g)) {
      const box = b.slice(1, 5).map(Number);
      const s = samples.find((x) => x.box.join() === box.join());
      expect(s, `[${box}] is measured by measure_ui.py`).toBeTruthy();
      expect(line, `the line quoting [${box}] gives its measured colour`).toContain(s?.hex);
      quoted++;
    }
  }
  expect(quoted).toBeGreaterThanOrEqual(25);
  for (const s of samples) if (s.uiMd) expect(s.hex, `[${s.box}]`).toBe(s.uiMd);
  const tokens = readFileSync(join(ROOT, 'src/ui/kit/tokens.css'), 'utf8');
  const rest = parseColor(/** @type {string} */ (/--ui-buy-rest:\s*(#[0-9a-f]{6})/.exec(tokens)?.[1]));
  const measured = parseColor(m.buyButtons.rest);
  expect(Math.max(.../** @type {const} */ (['r', 'g', 'b']).map((k) => Math.abs(rest[k] - measured[k]))), 'the resting Buy green is the measured one').toBeLessThanOrEqual(2);
  expect(m.buyButtons.buttons).toHaveLength(6);
});

test('tile content: config items with bound icons, inventories that fit their grids without overlaps', { tag: '@smoke' }, () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'assets/icons/manifest.json'), 'utf8'));
  const ids = [...BACKPACK.items, ...FRIDGE.items, ...SHOP].map((p) => p.id);
  for (const id of ids) {
    expect(item(id), `config item ${id}`).toBeTruthy();
    expect(manifest.bindings[String(id)], `item ${id} has a rendered icon`).toBeTruthy();
  }
  for (const id of Object.keys(SOURCE_NAMES).map(Number)) expect(ids, `the source name of ${id} is shown`).toContain(id);
  for (const [name, inv] of /** @type {const} */ ([['backpack', BACKPACK], ['fridge', FRIDGE]])) {
    /** @type {Map<string, number>} */
    const used = new Map();
    for (const p of inv.items) {
      const c = item(p.id);
      if (p.usesLeft != null) expect(p.usesLeft, `${name}: ${p.id} servings`).toBeLessThanOrEqual(c.uses);
      const [w, h] = placed(/** @type {[number, number]} */ (c.size), !!p.rotated);
      for (let y = p.y; y < p.y + h; y++) {
        for (let x = p.x; x < p.x + w; x++) {
          expect(x < inv.cols && y < inv.rows, `${name}: ${p.id} at ${x},${y} is inside ${inv.cols} × ${inv.rows}`).toBe(true);
          expect(used.get(`${x},${y}`), `${name}: ${p.id} overlaps at ${x},${y}`).toBeUndefined();
          used.set(`${x},${y}`, p.id);
        }
      }
    }
  }
});

test('tile (en): shop rows, load and the unpaid total print the config facts', { tag: '@smoke' }, async ({ page }) => {
  await open(page, 'tile', 'en');
  const shown = await page.evaluate(() => ({
    rows: [...document.querySelectorAll('.sl-row[data-item]')].map((r) => ({
      id: Number(/** @type {HTMLElement} */ (r).dataset.item),
      meta: r.querySelector('.sl-row__meta')?.textContent,
      price: r.querySelector('.sl-price')?.textContent,
      buy: (({ width, height }) => [width, height])(/** @type {Element} */ (r.querySelector('.sl-btn--buy')).getBoundingClientRect()),
      height: r.getBoundingClientRect().height,
    })),
    load: document.querySelector('.tile-inventory .sl-load__value')?.textContent,
    due: document.querySelector('.tile-cash .sl-price--lg')?.textContent,
  }));
  expect(shown.rows.map((r) => r.id)).toEqual(SHOP.map((r) => r.id));
  for (const r of shown.rows) {
    const c = item(r.id);
    expect({ id: r.id, meta: r.meta, price: r.price, buy: r.buy, height: r.height }).toEqual({ id: r.id, meta: `${formatKg(c.g)}${formatFootprint(c.size)}`, price: formatMoney(c.price), buy: [64, 32], height: 112 });
  }
  const kg = BACKPACK.items.reduce((sum, p) => sum + item(p.id).g / 1000, 0);
  expect(shown.load).toBe(formatLoad(kg, BACKPACK.maxKg));
  const pending = BACKPACK.items.filter((p) => p.states?.includes('is-pending'));
  expect(shown.due).toBe(formatMoney(pending.reduce((sum, p) => sum + item(p.id).price, 0)));

  // the Buy faces as rendered, label hidden: flat across every row inside the edge (no ring or oval), the lightest
  // pixel behind the label still at AA under white, and the hovered face an even lift of the resting one
  await page.addStyleTag({ content: '.sl-btn--buy { color: transparent !important; }' });
  /** @param {string} sel */
  const face = async (sel) => {
    const btn = page.locator(sel).first();
    const label = await btn.evaluate((b) => {
      const r = document.createRange();
      r.selectNodeContents(b);
      const t = r.getBoundingClientRect();
      const o = b.getBoundingClientRect();
      return { top: Math.floor(t.top - o.top), bottom: Math.ceil(t.bottom - o.top), left: Math.floor(t.left - o.left), right: Math.ceil(t.right - o.left) };
    });
    const img = decodePng(await btn.screenshot({ animations: 'disabled' }));
    const px = (/** @type {number} */ x, /** @type {number} */ y) => {
      const i = (y * img.width + x) * img.channels;
      return { r: img.data[i], g: img.data[i + 1], b: img.data[i + 2], a: 1 };
    };
    const rows = [];
    let flat = 0;
    for (let y = 3; y < img.height - 3; y++) {
      const ls = [];
      for (let x = 6; x < img.width - 6; x++) ls.push(px(x, y).g);
      flat = Math.max(flat, Math.max(...ls) - Math.min(...ls));
      rows.push(ls.reduce((a, b) => a + b, 0) / ls.length);
    }
    let backing = 21;
    for (let y = Math.max(0, label.top); y < Math.min(img.height, label.bottom); y++) for (let x = Math.max(0, label.left); x < Math.min(img.width, label.right); x++) backing = Math.min(backing, contrast(px(x, y), parseColor('#ffffff')));
    return { size: [img.width, img.height], flat, backing, rows };
  };
  const rest = await face('.sl-row:not(.is-hover) .sl-btn--buy:not(:disabled)');
  const hovered = await face('.sl-row.is-hover .sl-btn--buy.is-hover');
  for (const [name, f] of /** @type {const} */ ([['rest', rest], ['hover', hovered]])) {
    expect(f.size, `${name} Buy`).toEqual([64, 32]);
    expect(f.flat, `${name} Buy: each row is one colour inside the edge (no ring)`).toBeLessThanOrEqual(2);
    expect(f.backing, `${name} Buy: the label's lightest backing`).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(f.rows[0], `${name} Buy is lighter at the top`).toBeGreaterThan(f.rows[f.rows.length - 1]);
  }
  expect(hovered.rows.every((v, i) => v > rest.rows[i]), 'hover lifts every row of the face').toBe(true);
});

/** Source frame as a data URL. @param {string} name @param {'screenshots' | 'trailer'} [dir] */
const source = (name, dir = 'screenshots') => `data:image/jpeg;base64,${readFileSync(join(ROOT, 'assets/targets/source', dir, name)).toString('base64')}`;
/** Trailer frames hold the game at 0.90625 inside a border (ART.md); this scale shows them in game pixels. */
const TRAILER_SCALE = 1 / 0.90625;
/** @param {Buffer} png */
const dataUrl = (png) => `data:image/png;base64,${png.toString('base64')}`;

/**
 * Side-by-side boards: a source screenshot region next to the tile's matching region, both in native 1080p pixels
 * (or both at the same reduction for whole frames).
 */
/** @type {{ name: string, title: string, src: string, dir?: 'screenshots' | 'trailer', srcNote: string, a: number[], b: number[] }[]} */
const BOARDS = [
  { name: 'board-inventory', title: 'Inventory', src: 'ss_01_8f2609d8.jpg', srcNote: 'ss_01 inventory (pre-disaster, 8 × 7)', a: [362, 118, 640, 664], b: [112, 216, 976, 672] },
  { name: 'board-shop', title: 'Shop window', src: 'ss_01_8f2609d8.jpg', srcNote: 'ss_01 Groceries', a: [975, 118, 600, 760], b: [1084, 216, 516, 784] },
  { name: 'board-cash', title: 'Cash panel', src: 'shot_08_t018.167s.jpg', dir: 'trailer', srcNote: 't018 CASH with two unpaid items (trailer, in game pixels)', a: [410, 712, 556, 170], b: [1084, 766, 516, 190] },
  { name: 'board-topbar', title: 'HUD top bar', src: 'ss_02_dede236e.jpg', srcNote: 'ss_02 day, loop, clock', a: [1360, 0, 560, 250], b: [1360, 0, 560, 250] },
  { name: 'board-stats', title: 'HUD right column and stats', src: 'ss_02_dede236e.jpg', srcNote: 'ss_02 navigation, floors, power, stats', a: [1480, 240, 440, 840], b: [1480, 240, 440, 840] },
  { name: 'board-objectives', title: 'HUD objectives', src: 'ss_06_bdcdf4bc.jpg', srcNote: 'ss_06 Main / Event', a: [0, 0, 560, 340], b: [0, 0, 560, 340] },
  { name: 'board-toolbar', title: 'HUD toolbar', src: 'ss_02_dede236e.jpg', srcNote: 'ss_02 tools, quick actions, queue, speed, wish', a: [0, 760, 1300, 320], b: [0, 760, 1300, 320] },
];

test('boards: the tile beside the source at the same scale', async ({ page }, info) => {
  const errors = collectErrors(page);
  /** @type {Record<string, Buffer>} */
  const tiles = {};
  for (const lang of /** @type {const} */ (['en', 'zh'])) {
    await open(page, 'tile', lang);
    tiles[lang] = await page.screenshot({ animations: 'disabled' });
  }
  await page.setViewportSize({ width: 2000, height: 1200 });
  /**
   * @param {string} title
   * @param {{ url: string, note: string, box: number[], scale: number }[]} panes
   */
  const board = async (title, panes) => {
    const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#0d0e0d;font:600 16px/1.4 system-ui,sans-serif;color:#d8dad6">
      <div id="b" style="display:inline-flex;flex-direction:column;gap:12px;padding:16px">
      <div style="font-size:20px;color:#f4f5f2">${title}: source (left) and the tile (right), ${panes[0].scale < 1 ? `both at ${panes[0].scale * 100} %` : 'native 1080p game pixels'}</div>
      <div style="display:flex;gap:16px;align-items:flex-start">${panes
        .map(
          (p) => `<figure style="margin:0;display:grid;gap:6px">
          <div style="width:${p.box[2] * p.scale}px;height:${p.box[3] * p.scale}px;overflow:hidden;outline:1px solid #3a3c38">
            <img src="${p.url}" style="display:block;transform-origin:0 0;transform:scale(${p.scale}) translate(${-p.box[0]}px,${-p.box[1]}px)"></div>
          <figcaption style="color:#9c9e9a">${p.note}</figcaption></figure>`
        )
        .join('')}</div></div></body>`;
    await page.setContent(html);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
    return /** @type {Buffer} */ (await page.locator('#b').screenshot());
  };
  for (const b of BOARDS) {
    const png = await board(b.title, [
      { url: source(b.src, b.dir), note: b.srcNote, box: b.a, scale: b.dir === 'trailer' ? TRAILER_SCALE : 1 },
      { url: dataUrl(tiles.en), note: 'tile, English', box: b.b, scale: 1 },
    ]);
    await keep(info, `${b.name}.png`, png);
  }
  for (const [name, src, lang, note] of /** @type {const} */ ([
    ['board-frame-ss01', 'ss_01_8f2609d8.jpg', 'en', 'ss_01 (shopping)'],
    ['board-frame-ss02', 'ss_02_dede236e.jpg', 'en', 'ss_02 (Day 7 HUD)'],
    ['board-frame-zh', 'ss_02_dede236e.jpg', 'zh', 'ss_02 (Day 7 HUD)'],
  ])) {
    const png = await board('Whole frame', [
      { url: source(src), note, box: [0, 0, W, H], scale: 0.5 },
      { url: dataUrl(tiles[lang]), note: `tile, ${lang === 'en' ? 'English' : 'Chinese'}`, box: [0, 0, W, H], scale: 0.5 },
    ]);
    await keep(info, `${name}.png`, png);
  }
  expect(errors).toEqual([]);
});
