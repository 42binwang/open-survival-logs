// @ts-check
// Small DOM and data helpers shared by the tile and the kit sheet.
import manifest from '../../assets/icons/manifest.json';
import { item } from '../../src/data/db.js';
import { loc, setLang } from '../../src/engine/i18n.js';
import { glyph, splitQuality, withQuality } from '../../src/ui/kit/index.js';
import { SOURCE_NAMES, ART_TURN } from './content.js';

/** @typedef {import('./content.js').Lang} Lang */
/** @typedef {import('../../src/ui/kit/slot.js').SlotIcon} SlotIcon */
/** @typedef {Node | string | number | null | undefined | false} Child */
/** @typedef {Child | Children[]} Children  nested arrays are flattened */

/**
 * @param {string} tag
 * @param {Record<string, string | number | boolean | null | undefined>} [attrs]  `class`, `style` (CSS text), data-*,
 *   aria-*, any attribute; true sets it empty, null / undefined / false leaves it out
 * @param {...Children} children
 * @returns {HTMLElement}
 */
export function h(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    e.setAttribute(k, v === true ? '' : String(v));
  }
  append(e, children);
  return e;
}

/**
 * @param {Element} e
 * @param {Children[]} children
 */
export function append(e, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(e, c);
    else e.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  return e;
}

/** Glyph shorthand. @param {string} name @param {string} [label] */
export const g = (name, label) => glyph(name, label ? { label } : {});

/**
 * Rendered icon of a config item (assets/icons/manifest.json `bindings`).
 * @param {number} id
 * @returns {SlotIcon & { id: string }}
 */
export function iconFor(id) {
  const binding = /** @type {Record<string, { asset: string }>} */ (manifest.bindings)[String(id)];
  const entry = binding && manifest.assets.find((a) => a.id === binding.asset);
  if (!entry) throw new Error(`no rendered icon for item ${id}`);
  return { id: entry.id, files: entry.files, extent: /** @type {[number, number]} */ (entry.meta.framing.extent), turn: ART_TURN[entry.id] };
}

/**
 * An <img> of an item icon at a CSS size, with the 64 / 128 / 256 files as a srcset.
 * @param {number} id
 * @param {number} px
 * @param {string} [className]
 */
export function iconImg(id, px, className = '') {
  const icon = iconFor(id);
  const img = /** @type {HTMLImageElement} */ (h('img', { class: className, alt: '', width: px, height: px, draggable: 'false' }));
  img.src = `/${icon.files['128']}`;
  img.srcset = ['64', '128', '256'].map((s) => `/${icon.files[s]} ${s}w`).join(', ');
  img.sizes = `${px}px`;
  return img;
}

/**
 * Config facts of an item.
 * @param {number} id
 * @returns {{ zh: string, size: [number, number], g: number, price: number, uses: number, life: number, sat: number, mor: number, hp: number, sub: number }}
 */
export function cfg(id) {
  const it = item(id);
  if (!it) throw new Error(`no config item ${id}`);
  return it;
}

/**
 * Display name as the source writes it: its English where it differs from ours, the quality as text.
 * @param {number} id
 * @param {Lang} lang
 */
export function itemLabel(id, lang) {
  const { base, quality } = splitQuality(cfg(id).zh);
  let name = base;
  if (lang === 'en') {
    setLang('en');
    name = SOURCE_NAMES[id] ?? loc(base);
  }
  return withQuality(name, quality, lang);
}

/** Resolves once every <img> under root has decoded; a missing file rejects with its URL. @param {ParentNode} root */
export async function imagesReady(root) {
  const imgs = [...root.querySelectorAll('img')];
  await Promise.all(
    imgs.map((img) =>
      img.decode().catch(() => {
        throw new Error(`image failed to load: ${img.currentSrc || img.src}`);
      })
    )
  );
}
