// @ts-check
// A static server for a production build, as a static host would serve it: gzip for text types, immutable caching
// for Vite's hashed bundle (bundle/), ETag revalidation for everything else. The budget runner measures initial
// download and warm loads against it, so both follow real transfer sizes and caching.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const TYPES = /** @type {Record<string, string>} */ ({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.cube': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ktx2': 'image/ktx2',
  '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
});
/** extensions a static host compresses (already-compressed images, textures and audio are sent as they are) */
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.map', '.svg', '.cube', '.txt', '.wasm', '.bin', '.glb']);

/**
 * @param {string} dir  the build folder
 * @returns {Promise<{ url: string, close: () => Promise<void>, requests: { path: string, bytes: number, gzip: boolean }[] }>}
 */
export function serveStatic(dir) {
  /** @type {Map<string, { body: Buffer, gz: Buffer | null, etag: string, stamp: string }>} */
  const cache = new Map();
  /** @type {{ path: string, bytes: number, gzip: boolean }[]} */
  const requests = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://x');
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(dir, rel));
    if (!file.startsWith(normalize(dir) + sep) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    const st = statSync(file);
    const stamp = `${st.mtimeMs}:${st.size}`;
    let f = cache.get(file);
    if (!f || f.stamp !== stamp) {
      const body = readFileSync(file);
      const ext = extname(file).toLowerCase();
      f = { body, gz: COMPRESSIBLE.has(ext) ? gzipSync(body, { level: 6 }) : null, etag: `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`, stamp };
      cache.set(file, f);
    }
    const ext = extname(file).toLowerCase();
    const headers = /** @type {Record<string, string>} */ ({
      'content-type': TYPES[ext] || 'application/octet-stream',
      etag: f.etag,
      'cache-control': rel.startsWith('/bundle/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      vary: 'accept-encoding',
    });
    if (req.headers['if-none-match'] === f.etag) {
      res.writeHead(304, headers);
      res.end();
      requests.push({ path: rel, bytes: 0, gzip: false });
      return;
    }
    const gzip = !!f.gz && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
    const body = gzip && f.gz ? f.gz : f.body;
    if (gzip) headers['content-encoding'] = 'gzip';
    headers['content-length'] = String(body.length);
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
    requests.push({ path: rel, bytes: body.length, gzip });
  });
  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      done({ url: `http://127.0.0.1:${port}`, requests, close: () => new Promise((ok) => server.close(() => ok(undefined))) });
    });
  });
}
