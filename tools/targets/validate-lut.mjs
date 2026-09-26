// @ts-check
/**
 * Validate .cube colour LUTs (WP-P0-04).
 *
 * Checks the Adobe/Resolve 3D .cube format as three.js LUTCubeLoader reads it: optional TITLE, LUT_3D_SIZE N
 * (2..256), optional DOMAIN_MIN / DOMAIN_MAX (three floats each, min < max), comments with '#', then exactly N^3
 * rows of three finite floats, red changing fastest. Also reports how far the LUT is from identity and requires
 * that black and white map to themselves (within 1/255), so the grade cannot lift blacks or dim white.
 *
 * With THREE_DIR pointing at an installed `three` package, the file is also parsed by three.js' own LUTCubeLoader.
 *
 *   node tools/targets/validate-lut.mjs [assets/targets/lut/*.cube ...]
 *   THREE_DIR=/path/to/node_modules/three node tools/targets/validate-lut.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LUT_DIR = join(ROOT, 'assets', 'targets', 'lut');

/**
 * @param {string} text
 * @returns {{ title: string, size: number, min: number[], max: number[], data: Float64Array }}
 */
export function parseCube(text) {
  let title = '';
  let size = 0;
  let min = [0, 0, 0];
  let max = [1, 1, 1];
  /** @type {number[]} */
  const values = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    const [key, ...rest] = line.split(/\s+/);
    if (key === 'TITLE') {
      if (values.length) throw new Error(`line ${i + 1}: TITLE after data`);
      title = line.slice(5).trim().replace(/^"|"$/g, '');
    } else if (key === 'LUT_3D_SIZE') {
      if (size) throw new Error(`line ${i + 1}: duplicate LUT_3D_SIZE`);
      size = Number(rest[0]);
      if (!Number.isInteger(size) || size < 2 || size > 256) throw new Error(`line ${i + 1}: LUT_3D_SIZE ${rest[0]} out of 2..256`);
    } else if (key === 'LUT_1D_SIZE') {
      throw new Error(`line ${i + 1}: 1D LUTs are not supported by LUTCubeLoader`);
    } else if (key === 'DOMAIN_MIN' || key === 'DOMAIN_MAX') {
      const v = rest.map(Number);
      if (v.length !== 3 || v.some((x) => !Number.isFinite(x))) throw new Error(`line ${i + 1}: ${key} needs three numbers`);
      if (key === 'DOMAIN_MIN') min = v;
      else max = v;
    } else if (/^[-+.\d]/.test(key)) {
      const v = [key, ...rest].map(Number);
      if (v.length !== 3 || v.some((x) => !Number.isFinite(x))) throw new Error(`line ${i + 1}: data row must be three finite numbers`);
      values.push(v[0], v[1], v[2]);
    } else {
      throw new Error(`line ${i + 1}: unknown keyword ${key}`);
    }
  }
  if (!size) throw new Error('missing LUT_3D_SIZE');
  if (min.some((m, k) => m >= max[k])) throw new Error('DOMAIN_MIN must be below DOMAIN_MAX');
  const rows = values.length / 3;
  if (rows !== size ** 3) throw new Error(`expected ${size ** 3} data rows for size ${size}, found ${rows}`);
  return { title, size, min, max, data: Float64Array.from(values) };
}

/**
 * @param {ReturnType<typeof parseCube>} lut
 */
export function checkCube(lut) {
  const { size, data, min, max } = lut;
  /** @param {number} r @param {number} g @param {number} b */
  const at = (r, g, b) => {
    const i = 3 * (r + g * size + b * size * size);
    return [data[i], data[i + 1], data[i + 2]];
  };
  let maxDev = 0;
  let outOfDomain = 0;
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const v = at(r, g, b);
        const id = [r, g, b].map((x, k) => min[k] + ((max[k] - min[k]) * x) / (size - 1));
        for (let k = 0; k < 3; k++) {
          maxDev = Math.max(maxDev, Math.abs(v[k] - id[k]));
          if (v[k] < min[k] - 1e-6 || v[k] > max[k] + 1e-6) outOfDomain++;
        }
      }
    }
  }
  const black = at(0, 0, 0);
  const white = at(size - 1, size - 1, size - 1);
  const errors = [];
  if (black.some((x) => Math.abs(x) > 1 / 255)) errors.push(`black maps to ${black.map((x) => x.toFixed(4)).join(' ')}`);
  if (white.some((x) => Math.abs(x - 1) > 1 / 255)) errors.push(`white maps to ${white.map((x) => x.toFixed(4)).join(' ')}`);
  if (outOfDomain) errors.push(`${outOfDomain} values outside the domain`);
  return { maxDeviationFromIdentity: maxDev, black, white, errors };
}

/**
 * @param {string} file
 * @param {string} text
 */
async function viaThree(file, text) {
  const dir = process.env.THREE_DIR;
  if (!dir) return null;
  const url = pathToFileURL(join(dir, 'examples', 'jsm', 'loaders', 'LUTCubeLoader.js')).href;
  const { LUTCubeLoader } = await import(url);
  const res = new LUTCubeLoader().parse(text);
  const tex = res.texture3D;
  return { size: res.size, title: res.title, width: tex.image.width, height: tex.image.height, depth: tex.image.depth };
}

async function main() {
  const args = process.argv.slice(2);
  const files = args.length ? args.map((f) => resolve(f)) : readdirSync(LUT_DIR).filter((f) => f.endsWith('.cube')).map((f) => join(LUT_DIR, f));
  if (!files.length) {
    console.error('no .cube files found');
    process.exit(1);
  }
  let failed = false;
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    try {
      const lut = parseCube(text);
      const res = checkCube(lut);
      const three = await viaThree(file, text);
      const tag = res.errors.length ? 'FAIL' : 'OK';
      console.log(`${tag} ${file.replace(ROOT + '/', '')}: size ${lut.size}, "${lut.title}", max deviation from identity ${res.maxDeviationFromIdentity.toFixed(4)}` +
        (three ? `; three.js LUTCubeLoader: size ${three.size}, texture ${three.width}x${three.height}x${three.depth}` : ''));
      for (const e of res.errors) console.log(`  ${e}`);
      if (res.errors.length) failed = true;
    } catch (err) {
      failed = true;
      console.log(`FAIL ${file}: ${/** @type {Error} */ (err).message}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
