// @ts-check
// Vite serves the game (index.html -> src/main.js) and the dev pages under pages/ (the spike, the audio test, the UI
// tile, …); the production build takes only index.html, so the dev pages are never shipped. The port is 5200 + the
// package slot (tools/gate/port.mjs) and strict, so two checkouts never share a server; `/__checkout` tells the
// Playwright setup which checkout a running server belongs to.
import { copyFile, mkdir, open, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { defineConfig } from 'vite';
import { devPort, currentBranch, ROOT } from './tools/gate/port.mjs';
import { UNSHIPPED_ASSET_DIRS } from './src/contracts/assets.js';

const { port } = devPort();
const LFS_POINTER = 'version https://git-lfs.github.com/spec/v1';

/** @returns {import('vite').Plugin} */
function checkoutInfo() {
  /** @param {import('vite').Connect.Server} app */
  const serve = (app) => {
    app.use('/__checkout', (_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ root: ROOT, branch: currentBranch() }));
    });
  };
  return {
    name: 'survival-logs:checkout',
    configureServer(server) {
      serve(server.middlewares);
    },
    configurePreviewServer(server) {
      serve(server.middlewares);
    },
  };
}

/**
 * Copies the shipped part of assets/ into the build at the same paths (asset manifests name files by repo path).
 * The download cache, look references and ledgers stay out; an LFS pointer that was never pulled fails the build.
 * @returns {import('vite').Plugin}
 */
function shippedAssets() {
  let outDir = resolve(ROOT, 'dist');
  return {
    name: 'survival-logs:shipped-assets',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    async writeBundle() {
      const from = resolve(ROOT, 'assets');
      if (!existsSync(from)) return;
      /** @type {string[]} */
      const pointers = [];
      /** @param {string} dir */
      const walk = async (dir) => {
        for (const e of await readdir(dir, { withFileTypes: true })) {
          const src = join(dir, e.name);
          const rel = relative(from, src);
          if (dir === from && (!e.isDirectory() || UNSHIPPED_ASSET_DIRS.includes(e.name))) continue;
          if (e.isDirectory()) await walk(src);
          else if (e.isFile()) {
            const fh = await open(src);
            const head = Buffer.alloc(LFS_POINTER.length);
            await fh.read(head, 0, head.length, 0);
            await fh.close();
            if (head.toString('utf8') === LFS_POINTER) pointers.push(`assets/${rel}`);
            await mkdir(resolve(outDir, 'assets', rel, '..'), { recursive: true });
            await copyFile(src, resolve(outDir, 'assets', rel));
          }
        }
      };
      await walk(from);
      if (pointers.length) this.error(`git LFS objects were never pulled (run git lfs pull): ${pointers.join(', ')}`);
    },
  };
}

/**
 * The Basis Universal transcoder KTX2Loader fetches at run time (three's examples/jsm/libs/basis), served at
 * /vendor/basis/ in dev and copied there in the build, so the three.js renderer can decode the KTX2 materials.
 * @returns {import('vite').Plugin}
 */
function basisTranscoder() {
  const from = resolve(ROOT, 'node_modules/three/examples/jsm/libs/basis');
  const files = ['basis_transcoder.js', 'basis_transcoder.wasm'];
  let outDir = resolve(ROOT, 'dist');
  return {
    name: 'survival-logs:basis-transcoder',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use('/vendor/basis', async (req, res, next) => {
        const name = (req.url || '').replace(/^\//, '').split('?')[0];
        if (!files.includes(name)) return next();
        const { readFile } = await import('node:fs/promises');
        res.setHeader('content-type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        res.end(await readFile(join(from, name)));
      });
    },
    async writeBundle() {
      await mkdir(resolve(outDir, 'vendor/basis'), { recursive: true });
      for (const f of files) await copyFile(join(from, f), resolve(outDir, 'vendor/basis', f));
    },
  };
}

export default defineConfig({
  publicDir: false,
  server: {
    host: '127.0.0.1',
    port,
    strictPort: true,
    watch: { ignored: ['**/assets/cache/**', '**/research/**', '**/dist/**', '**/test-results/**', '**/playwright-report/**'] },
  },
  preview: { host: '127.0.0.1', port, strictPort: true },
  build: {
    outDir: 'dist',
    // Vite's default 'assets' would mix the bundle with the game's assets/ tree copied by shippedAssets.
    assetsDir: 'bundle',
    sourcemap: true,
    // The generated game config (src/data/gen, 2.6 MB of JS) is one chunk by design.
    chunkSizeWarningLimit: 4096,
    rolldownOptions: { input: { main: resolve(ROOT, 'index.html') } },
  },
  plugins: [checkoutInfo(), shippedAssets(), basisTranscoder()],
});
