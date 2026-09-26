// @ts-check
// PNG read and write with node:zlib only. Reads every non-interlaced PNG (grayscale, RGB, palette, gray + alpha,
// RGBA at 1, 2, 4, 8 or 16 bits; tRNS transparency) into 8-bit RGBA; writes 8-bit gray, gray + alpha, RGB or RGBA.
// Shared by the asset-lock check (tools/asset-lock.mjs) and the visual regression tools (WP-P0-11).
import { crc32, deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** channels per PNG color type */
const CHANNELS = /** @type {Record<number, number>} */ ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 });

/**
 * @typedef {object} Image
 * @property {number} width
 * @property {number} height
 * @property {number} channels  1 gray, 2 gray + alpha, 3 RGB, 4 RGBA
 * @property {Uint8Array} data  row-major, `channels` bytes per pixel
 */

/**
 * Decodes a PNG to 8-bit RGBA (16-bit samples keep their high byte).
 * @param {Uint8Array} bytes
 * @returns {Image}
 */
export function decodePng(bytes) {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG file');
  let pos = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let type = 0;
  /** @type {Buffer | null} */
  let palette = null;
  /** @type {Buffer | null} */
  let trns = null;
  /** @type {Buffer[]} */
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const name = buf.toString('latin1', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (pos + 12 + len > buf.length) throw new Error(`truncated ${name} chunk`);
    if (crc32(buf.subarray(pos + 4, pos + 8 + len)) !== buf.readUInt32BE(pos + 8 + len)) throw new Error(`bad CRC in ${name} chunk`);
    if (name === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      type = body[9];
      if (body[12] !== 0) throw new Error('interlaced PNGs are not supported');
      if (!(type in CHANNELS)) throw new Error(`unknown color type ${type}`);
    } else if (name === 'PLTE') palette = body;
    else if (name === 'tRNS') trns = body;
    else if (name === 'IDAT') idat.push(body);
    else if (name === 'IEND') break;
    pos += 12 + len;
  }
  if (!width || !height) throw new Error('missing IHDR');
  const ch = CHANNELS[type];
  const bitsPerPixel = ch * depth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const bpp = Math.max(1, bitsPerPixel >> 3);
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length < (stride + 1) * height) throw new Error('image data too short');
  const rows = new Uint8Array(stride * height);
  const prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = rows.subarray(y * stride, (y + 1) * stride);
    const up = y ? rows.subarray((y - 1) * stride, y * stride) : prev;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0;
      const b = up[i];
      const c = i >= bpp ? up[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`unknown filter ${filter}`);
      out[i] = v & 255;
    }
  }
  const sample = (/** @type {number} */ y, /** @type {number} */ i) => {
    const row = y * stride;
    if (depth === 8) return rows[row + i];
    if (depth === 16) return rows[row + i * 2];
    const bit = i * depth;
    const v = (rows[row + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
    return type === 3 ? v : Math.round((v * 255) / ((1 << depth) - 1));
  };
  const rgba = new Uint8Array(width * height * 4);
  const key16 = (/** @type {number} */ o) => (trns && trns.length >= o + 2 ? trns.readUInt16BE(o) : -1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const s = (/** @type {number} */ k) => sample(y, x * ch + k);
      if (type === 3) {
        const idx = s(0);
        if (!palette || idx * 3 + 2 >= palette.length) throw new Error('palette index out of range');
        rgba.set([palette[idx * 3], palette[idx * 3 + 1], palette[idx * 3 + 2], trns && idx < trns.length ? trns[idx] : 255], o);
      } else if (type === 0 || type === 4) {
        const g = s(0);
        const transparent = type === 0 && depth <= 8 && key16(0) >= 0 && g === Math.round((key16(0) * 255) / ((1 << depth) - 1));
        rgba.set([g, g, g, type === 4 ? s(1) : transparent ? 0 : 255], o);
      } else {
        rgba.set([s(0), s(1), s(2), type === 6 ? s(3) : 255], o);
      }
    }
  }
  return { width, height, channels: 4, data: rgba };
}

/**
 * Encodes an 8-bit image (filter 0 rows, zlib level 9), bit-for-bit reproducible for the same pixels.
 * @param {Image} img
 * @returns {Buffer}
 */
export function encodePng({ width, height, channels, data }) {
  const type = /** @type {Record<number, number>} */ ({ 1: 0, 2: 4, 3: 2, 4: 6 })[channels];
  if (type == null) throw new Error(`cannot write ${channels} channels`);
  if (data.length !== width * height * channels) throw new Error('pixel data does not match the size');
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) raw.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const chunk = (/** @type {string} */ name, /** @type {Buffer} */ body) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(name, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
    return Buffer.concat([head, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = type;
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * One channel of an image as a float plane.
 * @param {Image} img
 * @param {number} c
 */
export function channel(img, c) {
  const out = new Float64Array(img.width * img.height);
  for (let i = 0; i < out.length; i++) out[i] = img.data[i * img.channels + c];
  return out;
}
