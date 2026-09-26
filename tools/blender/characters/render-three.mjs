// @ts-check
// Game-view renders of the shipped character: assets/characters/wage/wage.glb in three.js (tools/blender/characters/
// three/view.html) in headless Chromium, through the game camera (src/contracts/look.js) under the ART.md day-interior
// and dusk rigs, AgX at exposure 1.0, KTX2 textures as shipped. A 0.18 grey card in every still must read its ART.md
// code within ±5 (the rig's intensity is calibrated on it; the exposure never changes).
//
//   node tools/blender/characters/render-three.mjs
//
// Writes into docs/art/characters/:
//   wage_three_{day,dusk}_{60,50}.png  full 1920x1080 frames at the zoomed-out (60°) and zoomed-in (50°) FOV
//   wage_board.png                     the source's Wage Slave (t069, ss_04, t035 crops) beside these renders, at the
//                                      same pixel scale (2x nearest neighbour)
//   wage_walk_strip.png                one walk cycle at 50°, the camera still, root motion applied (floor tiles 1 m)
//   wage_run_strip.png                 one run cycle, the same way
//   wage_motion_50.mp4                 walk, run and idle at 50°, the camera following as in the game (960x540, the
//                                      middle of the 1080p frame at its pixel scale)
//   wage_three_measure.json            card readings, rig intensities, on-screen samples, character heights
// The page is served from the repository root on 127.0.0.1:5205 (this package's dev-server port).

import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

/* global window, document, Image -- the page.evaluate callbacks run in the browser */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const OUT = join(ROOT, 'docs', 'art', 'characters');
const PORT = Number(process.env.PORT || 5205);
const GLB = '/assets/characters/wage/wage.glb';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const MIME = /** @type {Record<string, string>} */ ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.png': 'image/png' });
// the source's frames with the Wage Slave (tools/targets/regions.json family 'character'): crop centres in file pixels
const SOURCES = [
  { label: 'source t069 (day interior, 11:50)', src: '/assets/targets/source/trailer/shot_41_t068.883s.jpg', cx: 686, cy: 588 },
  { label: 'source ss_04 (dusk, bed lamp on)', src: '/assets/targets/source/screenshots/ss_04_344f0472.jpg', cx: 535, cy: 548 },
  { label: 'source t035 (planning phase)', src: '/assets/targets/source/trailer/shot_24_t035.212s.jpg', cx: 890, cy: 503 },
];
const CROP = { w: 300, h: 260 };

function serve() {
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
    const file = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    if (!file.startsWith(ROOT + sep) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(PORT, '127.0.0.1', () => ok(server)));
}

/** @param {string} dataUrl @param {string} path */
function savePng(dataUrl, path) {
  writeFileSync(path, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const server = /** @type {import('node:http').Server} */ (await serve());
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const tmp = mkdtempSync(join(tmpdir(), 'wage-three-'));
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    page.on('pageerror', (e) => console.error('[render] page error:', e.message));
    page.on('console', (m) => m.type() === 'error' && console.error('[render] console:', m.text()));
    await page.goto(`http://127.0.0.1:${PORT}/tools/blender/characters/three/view.html`);
    await page.waitForFunction(() => /** @type {any} */ (window).viewReady === true);
    const info = await page.evaluate((url) => /** @type {any} */ (window).view.init(url), GLB);
    console.log(`[render] three r${info.three}, ${info.gl}; required extensions ${info.extensionsRequired?.join(', ')}`);
    if (!info.textures.every((/** @type {any} */ t) => t.compressed || t.width)) throw new Error('textures did not load');

    // stills
    /** @type {Record<string, any>} */
    const stills = {};
    for (const rig of ['day', 'dusk']) {
      for (const fov of [60, 50]) {
        const r = await page.evaluate((o) => /** @type {any} */ (window).view.still(o), { rig, fov });
        const file = `wage_three_${rig}_${fov}.png`;
        savePng(r.png, join(OUT, file));
        delete r.png;
        r.file = file;
        stills[`${rig}_${fov}`] = r;
        const ok = Math.abs(r.card.read - r.card.want) <= 5;
        console.log(`[render] ${file}: card ${r.card.read} (want ${r.card.want} ±5 ${ok ? 'ok' : 'FAIL'}), hemisphere ${r.hemisphere.intensity} (E ${r.hemisphere.nominalE} x ${r.hemisphere.scale}), height ${r.heightPx.idle}/${r.heightPx.walk} px; ` +
          Object.entries(r.samples).map(([k, s]) => `${k} ${s.hex} (${s.lum})`).join(', '));
        if (!ok) throw new Error(`${file}: the 0.18 card reads ${r.card.read}, not ${r.card.want} ±5`);
      }
    }

    // the board: source crops beside the renders at the same pixel scale
    const board = await page.evaluate(async ({ sources, stills, crop }) => {
      const img = (/** @type {string} */ src) => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; });
      const S = 2;
      const cw = crop.w * S;
      const ch = crop.h * S;
      const bar = 34;
      const rows = 3;
      const c = document.createElement('canvas');
      c.width = cw * 3;
      c.height = (ch + bar) * rows;
      const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#111';
      g.fillRect(0, 0, c.width, c.height);
      g.font = '20px sans-serif';
      /** @param {any} image @param {number} cx @param {number} cy @param {number} col @param {number} row @param {string} label */
      const cell = (image, cx, cy, col, row, label) => {
        const x = col * cw;
        const y = row * (ch + bar);
        g.drawImage(image, Math.round(cx - crop.w / 2), Math.round(cy - crop.h / 2), crop.w, crop.h, x, y + bar, cw, ch);
        g.fillStyle = '#ddd';
        g.fillText(label, x + 10, y + 24);
      };
      for (let i = 0; i < sources.length; i++) cell(await img(sources[i].src), sources[i].cx, sources[i].cy, i, 0, sources[i].label);
      let row = 1;
      for (const rig of ['day', 'dusk']) {
        let col = 0;
        for (const fov of [60, 50]) {
          const s = stills[`${rig}_${fov}`];
          cell(await img(`/docs/art/characters/${s.file}`), s.centre[0], s.centre[1] - 10, col++, row, `three.js ${rig} ${fov}° (card ${s.card.read} / ${s.card.want})`);
        }
        const s = stills[`${rig}_60`];
        const s50 = stills[`${rig}_50`];
        const x = 2 * cw + 16;
        let y = row * (ch + bar) + 30;
        g.fillStyle = '#ddd';
        const lines = [
          `${s.rigLabel.split(' (')[0]}, AgX exposure 1.0`,
          `hemisphere E ${s.hemisphere.intensity} (card-calibrated)`,
          `on screen at 60° / 50° (display luminance):`,
          ...['hoodie', 'hoodieBack', 'jeans', 'jeansBack', 'hair', 'face', 'floor'].map((k) => `  ${k}: ${s.samples[k].hex} ${s.samples[k].lum} / ${s50.samples[k].hex} ${s50.samples[k].lum}`),
          `height: ${s.heightPx.idle} px (60°), ${s50.heightPx.idle} px (50°)`,
          rig === 'day' ? 'source t069: hoodie #3a3b3a, jeans #333638, hair #333331' : 'source ss_04: hoodie #262826, jeans #323233, hair #191a19',
        ];
        for (const l of lines) { g.fillText(l, x, y); y += 30; }
        row++;
      }
      return c.toDataURL('image/png');
    }, { sources: SOURCES, stills, crop: CROP });
    savePng(board, join(OUT, 'wage_board.png'));
    console.log('[render] wrote docs/art/characters/wage_board.png');

    // strips at 50°: the camera still, the survivor crossing the view with its root motion
    const toCam = Math.atan2(info.camera.offset[0], info.camera.offset[2]);
    const dayScale = stills.day_50.hemisphere.scale;
    for (const [clip, n] of /** @type {[string, number][]} */ ([['walk', 9], ['run', 8]])) {
      const c = info.clips[clip];
      const speed = c.extras.rootMotion.speedMps;
      const frames = [];
      for (let k = 0; k < n; k++) {
        const t = (k / n) * c.duration;
        frames.push(await page.evaluate((o) => /** @type {any} */ (window).view.follow(o), { rig: 'day', scale: dayScale, fov: 50, clip, t, heading: toCam + Math.PI / 2, travel: speed * t - speed * c.duration / 2, w: 200, h: 220, groundTrack: false }));
      }
      const strip = await page.evaluate(async (list) => {
        const imgs = await Promise.all(list.map((src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; })));
        const c = document.createElement('canvas');
        c.width = 200 * imgs.length;
        c.height = 220;
        const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
        imgs.forEach((im, i) => g.drawImage(/** @type {any} */ (im), i * 200, 0));
        return c.toDataURL('image/png');
      }, frames);
      savePng(strip, join(OUT, `wage_${clip}_strip.png`));
      console.log(`[render] wrote docs/art/characters/wage_${clip}_strip.png (${n} frames, ${speed} m/s)`);
    }

    // motion capture at 50°: walk (2 cycles), run (3 cycles), idle (4 s), the camera following
    const fps = 30;
    let frame = 0;
    let travel = 0;
    /** @type {[string, number, number][]} */
    const segments = [['walk', 2 * info.clips.walk.duration, toCam + 1.9], ['run', 3 * info.clips.run.duration, toCam + 1.25], ['idle', 4.0, toCam + 0.5]];
    for (const [clip, dur, heading] of segments) {
      const speed = info.clips[clip].extras.rootMotion.speedMps;
      travel = 0;
      for (let t = 0; t < dur - 1e-6; t += 1 / fps) {
        const png = await page.evaluate((o) => /** @type {any} */ (window).view.follow(o), { rig: 'day', scale: dayScale, fov: 50, clip, t, heading, travel, w: 960, h: 540, groundTrack: true });
        savePng(png, join(tmp, `f${String(frame++).padStart(4, '0')}.png`));
        travel += speed / fps;
      }
    }
    const mp4 = join(OUT, 'wage_motion_50.mp4');
    execFileSync(FFMPEG, ['-loglevel', 'error', '-y', '-framerate', String(fps), '-i', join(tmp, 'f%04d.png'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
    console.log(`[render] wrote ${relative(ROOT, mp4)} (${frame} frames)`);

    const measure = { page: 'tools/blender/characters/three/view.html', three: info.three, gl: info.gl, camera: info.camera, extensionsRequired: info.extensionsRequired, textures: info.textures, stills, clips: info.clips, locomotion: info.extras?.locomotion };
    writeFileSync(join(OUT, 'wage_three_measure.json'), `${JSON.stringify(measure, null, 2)}\n`);
    console.log('[render] wrote docs/art/characters/wage_three_measure.json');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
