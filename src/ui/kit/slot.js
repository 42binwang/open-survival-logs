// @ts-check
// Inventory slot geometry and builders (docs/UI.md §5). The numbers mirror src/ui/kit/tokens.css (--ui-cell,
// --ui-cell-gap, --ui-icon-fill); the CSS does the layout, these functions give the same boxes to code that needs
// them in pixels (drag ghosts, drop previews, tests).

export const CELL = 64;
export const GAP = 4;
export const PITCH = CELL + GAP;
/** Share of the slot's constrained side the icon's content fills (the icon box convention, assets/icons params.box). */
export const ICON_FILL = 0.66;

/**
 * @typedef {[number, number]} Footprint  [w, h] in cells, as config `size` and manifest `params.footprint`
 * @typedef {'fresh' | 'soon' | 'expired'} Freshness  src/sim/spoilage.js freshness states
 * @typedef {'chilled' | 'expiring' | 'expired' | 'mold'} SlotStatus
 * @typedef {object} SlotIcon
 * @property {Record<string, string>} files  size → repo path ('64', '128', '256'), as the icon manifest's `files`
 * @property {[number, number]} extent  content extent inside the square icon box (manifest meta.framing.extent)
 * @property {-90 | 0 | 90} [turn]  clockwise quarter turn that stands the render up in its footprint, for a render
 *   whose long axis crosses the footprint's (the 2142 bottle lies across its 1 × 2 cell); 0 when omitted
 */

/**
 * The footprint as placed: a rotated item swaps its sides.
 * @param {Footprint} size
 * @param {boolean} [rotated]
 * @returns {Footprint}
 */
export function placed(size, rotated = false) {
  return rotated ? [size[1], size[0]] : [size[0], size[1]];
}

/**
 * Pixel size of a slot spanning w × h cells.
 * @param {number} w
 * @param {number} h
 */
export function slotSize(w, h) {
  return { width: w * PITCH - GAP, height: h * PITCH - GAP };
}

/**
 * Pixel size of a grid of cols × rows cells (without its frame padding).
 * @param {number} cols
 * @param {number} rows
 */
export function gridSize(cols, rows) {
  return slotSize(cols, rows);
}

/**
 * Clockwise angle of the art in a slot: the icon's own turn, plus a quarter turn when the item is rotated (the art
 * turns with its footprint). One of -90, 0, 90, 180.
 * @param {number} [turn]  SlotIcon.turn
 * @param {boolean} [rotated]
 */
export function artAngle(turn = 0, rotated = false) {
  const deg = (((turn + (rotated ? 90 : 0)) % 360) + 360) % 360;
  return deg > 180 ? deg - 360 : deg;
}

/**
 * Side of the square icon box in a slot: the largest box whose content (extent × side) fits ICON_FILL of the slot on
 * both axes. When the art stands at a quarter turn its extent swaps. Same formula as `--icon`.
 * @param {[number, number]} extent
 * @param {Footprint} size  the config footprint (unrotated)
 * @param {boolean} [rotated]
 * @param {number} [fill]
 * @param {number} [turn]  SlotIcon.turn
 */
export function iconBox(extent, size, rotated = false, fill = ICON_FILL, turn = 0) {
  const [w, h] = placed(size, rotated);
  const [ex, ey] = Math.abs(artAngle(turn, rotated)) === 90 ? [extent[1], extent[0]] : extent;
  const { width, height } = slotSize(w, h);
  return Math.min((fill * width) / ex, (fill * height) / ey);
}

/**
 * Freshness bar value and state from days left and shelf life, with the thresholds of src/sim/spoilage.js
 * (`isExpiringSoon`: at most one day or 20 % of the life left).
 * @param {number} daysLeft
 * @param {number} life  config `life` in days (≤ 0: does not spoil)
 * @returns {{ v: number, state: Freshness } | null}
 */
export function freshness(daysLeft, life) {
  if (!(life > 0)) return null;
  const v = Math.max(0, Math.min(1, daysLeft / life));
  if (daysLeft <= 0) return { v: 0, state: 'expired' };
  return { v, state: daysLeft <= 1 || daysLeft <= life * 0.2 ? 'soon' : 'fresh' };
}

/**
 * @param {string} tag
 * @param {string} className
 * @param {string} [text]
 */
function el(tag, className, text) {
  const e = document.createElement(tag);
  e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

/**
 * An empty grid of cols × rows cells; slots are appended to it.
 * @param {{ cols: number, rows: number, cold?: boolean, label?: string }} o
 */
export function gridElement(o) {
  const grid = el('div', `sl-grid${o.cold ? ' sl-grid--cold' : ''}`);
  grid.style.setProperty('--cols', String(o.cols));
  grid.style.setProperty('--rows', String(o.rows));
  grid.setAttribute('role', 'grid');
  if (o.label) grid.setAttribute('aria-label', o.label);
  const cells = el('div', 'sl-grid__cells');
  for (let i = 0; i < o.cols * o.rows; i++) cells.appendChild(el('div', 'sl-cell'));
  grid.appendChild(cells);
  return grid;
}

/**
 * One item in a grid.
 * @param {object} o
 * @param {number} o.x  cell column
 * @param {number} o.y  cell row
 * @param {Footprint} o.size  config footprint
 * @param {boolean} [o.rotated]
 * @param {SlotIcon} o.icon
 * @param {string} o.name  accessible name, with the quality in it (docs/UI.md §5.4)
 * @param {string} [o.base]  URL prefix for the icon files ('/' in the game)
 * @param {{ left: number, total: number }} [o.servings]
 * @param {{ v: number, state: Freshness } | null} [o.fresh]
 * @param {{ kind: SlotStatus, label: string, glyph: SVGElement }} [o.status]
 * @param {string[]} [o.states]  'is-hover', 'is-selected', 'is-pending', 'is-dragging', 'is-focus'
 * @param {boolean} [o.frozen]
 */
export function slotElement(o) {
  const [w, h] = placed(o.size, o.rotated);
  const slot = el('div', ['sl-slot', o.frozen ? 'sl-slot--frozen' : '', ...(o.states || [])].filter(Boolean).join(' '));
  const angle = artAngle(o.icon.turn, o.rotated);
  const [ex, ey] = Math.abs(angle) === 90 ? [o.icon.extent[1], o.icon.extent[0]] : o.icon.extent;
  for (const [k, v] of Object.entries({ '--x': o.x, '--y': o.y, '--w': w, '--h': h, '--ex': ex, '--ey': ey, '--turn': `${angle}deg` })) slot.style.setProperty(k, String(v));
  if (o.rotated) slot.dataset.rot = '1';
  slot.setAttribute('role', 'gridcell');
  slot.setAttribute('aria-label', o.name);
  slot.tabIndex = 0;
  const base = o.base ?? '/';
  const img = /** @type {HTMLImageElement} */ (el('img', 'sl-slot__icon'));
  img.alt = '';
  img.decoding = 'async';
  img.draggable = false;
  img.src = base + o.icon.files['128'];
  img.srcset = ['64', '128', '256'].filter((s) => o.icon.files[s]).map((s) => `${base}${o.icon.files[s]} ${s}w`).join(', ');
  img.sizes = `${Math.round(iconBox(o.icon.extent, o.size, o.rotated, ICON_FILL, o.icon.turn))}px`;
  slot.appendChild(img);
  if (o.servings) slot.appendChild(el('span', 'sl-slot__servings', `${o.servings.left}/${o.servings.total}`));
  if (o.status) {
    const s = el('span', `sl-slot__status sl-slot__status--${o.status.kind}`);
    s.title = o.status.label;
    s.appendChild(o.status.glyph);
    slot.appendChild(s);
  }
  if (o.fresh) {
    const bar = el('span', 'sl-slot__fresh');
    bar.style.setProperty('--v', o.fresh.v.toFixed(3));
    bar.dataset.state = o.fresh.state;
    slot.appendChild(bar);
  }
  return slot;
}
