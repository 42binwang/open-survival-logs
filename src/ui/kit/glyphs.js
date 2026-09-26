// @ts-check
// UI glyphs of the kit (docs/UI.md §4.10): filled 24 × 24 paths drawn in currentColor, sized by the font (1.15 em).
// Item art is never a glyph: items use the rendered icons (assets/icons, WP-P0-12).

/** @type {Readonly<Record<string, string>>} */
export const GLYPHS = Object.freeze({
  hourglass: 'M6 2h12v2h-1v3.2a4 4 0 0 1-1.6 3.2L13.2 12l2.2 1.6a4 4 0 0 1 1.6 3.2V20h1v2H6v-2h1v-3.2a4 4 0 0 1 1.6-3.2l2.2-1.6-2.2-1.6A4 4 0 0 1 7 7.2V4H6zm3 2v3.2a2 2 0 0 0 .8 1.6L12 10.5l2.2-1.7a2 2 0 0 0 .8-1.6V4z',
  sun: 'M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM11 1h2v3.5h-2zM11 19.5h2V23h-2zM1 11h3.5v2H1zM19.5 11H23v2h-3.5zM3.9 5.3l1.4-1.4 2.5 2.5-1.4 1.4zM16.2 17.6l1.4-1.4 2.5 2.5-1.4 1.4zM3.9 18.7l2.5-2.5 1.4 1.4-2.5 2.5zM16.2 6.4l2.5-2.5 1.4 1.4-2.5 2.5z',
  cloud: 'M7 19a5 5 0 0 1-.8-9.94A6.5 6.5 0 0 1 18.6 9.1 5 5 0 0 1 18 19z',
  flag: 'M5 2h2.2v20H5zM8.4 3H20l-2.8 4.6L20 12.2H8.4z',
  bolt: 'M13.5 1 4 13.5h6.2L9 23l10-13h-6.3z',
  briefcase: 'M9 3h6a2 2 0 0 1 2 2v2h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3V5a2 2 0 0 1 2-2zm0 4h6V5H9z',
  phone: 'M8 1h8a2 2 0 0 1 2 2v18a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2zm0 3v14.5h8V4zm3 16.2V21h2v-.8z',
  log: 'M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.6V8h4.4zM8 12h8v2H8zm0 4h8v2H8z',
  tactics: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM5.5 10h2v5.5H14v2H5.5z',
  track: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm0 2.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6zM11 1h2v6.5h-2zM11 16.5h2V23h-2zM1 11h6.5v2H1zM16.5 11H23v2h-6.5z',
  layout: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z',
  satiety: 'M14.8 2.2a6.8 6.8 0 0 1 6.9 7.9 6.9 6.9 0 0 1-6.9 5.4c-.8 0-1.6.2-2.2.8l-2.5 2.5a2.6 2.6 0 1 1-3.6 2.6 2.6 2.6 0 1 1 2.6-3.6l2.5-2.5c.6-.6.8-1.4.8-2.2a6.9 6.9 0 0 1 2.4-5.9z',
  morale: 'M11 3.2V20.8H8.8A4.3 4.3 0 0 1 4.6 17 4.2 4.2 0 0 1 2.4 13a4.2 4.2 0 0 1 1.8-3.5A4.4 4.4 0 0 1 8 3.3a4 4 0 0 1 3-.1zm2 0a4 4 0 0 1 3 .1 4.4 4.4 0 0 1 3.8 6.2 4.2 4.2 0 0 1 1.8 3.5 4.2 4.2 0 0 1-2.2 4 4.3 4.3 0 0 1-4.2 3.8H13z',
  life: 'M12 1.8 20.5 5v6.2c0 5.2-3.6 9.7-8.5 11-4.9-1.3-8.5-5.8-8.5-11V5zm0 6.1c-1-1.3-4-1.1-4 1.4 0 2 2.4 3.7 4 5.1 1.6-1.4 4-3.1 4-5.1 0-2.5-3-2.7-4-1.4z',
  plug: 'M8.5 2h2v5h3V2h2v5h2v5a5.5 5.5 0 0 1-4.5 5.4V22h-2v-4.6A5.5 5.5 0 0 1 6.5 12V7h2z',
  home: 'M12 2.5 1.5 11h3v10.5h6V15h3v6.5h6V11h3z',
  chevronLeft: 'M15.5 3.5 7 12l8.5 8.5 1.6-1.6L10.2 12l6.9-6.9z',
  caretUp: 'M12 6.5 20 17H4z',
  caretDown: 'M12 17.5 4 7h16z',
  close: 'M5.6 4.2 12 10.6l6.4-6.4 1.4 1.4-6.4 6.4 6.4 6.4-1.4 1.4-6.4-6.4-6.4 6.4-1.4-1.4 6.4-6.4-6.4-6.4z',
  star: 'M12 1.8l3 6.4 7 .8-5.2 4.8 1.4 6.9L12 17.2l-6.2 3.5 1.4-6.9L2 9l7-.8z',
  snowflake: 'M11 1.5h2v21h-2zM1.5 11h21v2h-21zM4.2 5.6l1.4-1.4 14.2 14.2-1.4 1.4zM4.2 18.4 18.4 4.2l1.4 1.4L5.6 19.8zM8.5 2.8 12 5.5l3.5-2.7 1 1.4L12 7.8 7.5 4.2zM8.5 21.2 12 18.5l3.5 2.7 1-1.4-4.5-3.6-4.5 3.6z',
  alert: 'M9.8 2.5h4.4l-.9 13h-2.6zM10.4 17.5h3.2v3.6h-3.2z',
  check: 'M9 16.2 4.6 11.8 3 13.4l6 6L21.4 7 19.8 5.4z',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0z',
  search: 'M10 2.5a7.5 7.5 0 0 1 6 12l5.3 5.3-1.6 1.6-5.3-5.3A7.5 7.5 0 1 1 10 2.5zm0 2.2a5.3 5.3 0 1 0 0 10.6 5.3 5.3 0 0 0 0-10.6z',
  play: 'M7 3.5 20 12 7 20.5z',
  fast: 'M2.5 5 12 12l-9.5 7zM12 5l9.5 7-9.5 7z',
  faster: 'M1 6l7 6-7 6zM8.5 6l7 6-7 6zM16 6l7 6-7 6z',
  pause: 'M6 4h4.2v16H6zM13.8 4H18v16h-4.2z',
  chef: 'M7 19.5h10V14a4 4 0 0 0 .8-7.9A5.8 5.8 0 0 0 12 2.5a5.8 5.8 0 0 0-5.8 3.6A4 4 0 0 0 7 14zM7 20.5h10v1.5H7z',
  clipboard: 'M9 2h6v2h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3zm1 2v1.2h4V4zm.6 13-3-3 1.4-1.4 1.6 1.6 4.8-4.8 1.4 1.4z',
  map: 'M1.8 5.4 8 3.3v15.3l-6.2 2.1zM9.5 3.3l5 2v15.4l-5-2zM16 5.3l6.2-2v15.4l-6.2 2z',
  music: 'M9 3.5 20 1.5v13.6a3.4 3.4 0 1 1-2-3.1V6.4l-7 1.3v9.4a3.4 3.4 0 1 1-2-3.1z',
  relax: 'M12 1.8a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6zM2.5 6.8l6.2 2.4h6.6l6.2-2.4.8 2-5.6 2.6V15l2 7h-2.4L13.2 16h-2.4l-3.1 6H5.3l2-7v-3.6L1.7 8.8z',
  coin: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 3.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z',
  info: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1.2 8v7.5h2.4V10zm0-4v2.4h2.4V6z',
  // the source's kept-cold badge draws a price tag (ss_08); the hole winds the other way, so it stays open
  tag: 'M3 3h8.2L21 12.8 12.8 21 3 11.2zm4.6 2.4a2.1 2.1 0 1 0 0 4.2 2.1 2.1 0 0 0 0-4.2z',
  sprout: 'M11 22v-7.1C6.3 14.6 3 11.3 3 6.6V5h1.6c3.3 0 6 1.9 7.1 4.7C12.9 6.9 15.8 5 19.2 5H21v1.6c0 4.7-3.4 8.2-7.6 8.6V22z',
});

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * An inline SVG glyph, decorative unless a label is given.
 * @param {keyof typeof GLYPHS | string} name
 * @param {{ label?: string, className?: string }} [opts]
 * @returns {SVGSVGElement}
 */
export function glyph(name, opts = {}) {
  const d = GLYPHS[name];
  if (!d) throw new Error(`no glyph '${name}' (have ${Object.keys(GLYPHS).join(', ')})`);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `sl-glyph${opts.className ? ` ${opts.className}` : ''}`);
  if (opts.label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', opts.label);
  } else svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  svg.appendChild(path);
  return svg;
}
