// @ts-check
// Tooltip placement (docs/UI.md §5.4), after builder A's placeItemTip.

/**
 * Puts an item tooltip beside its slot, as the game will. The tip goes right of the slot and centred on it, or left
 * when the right side leaves `bounds`; it is kept inside `bounds`, then slid down (then up) off every `avoid` element
 * so it covers empty cells only. It sets the tip's left / top in its offset parent, `data-side` (the side of the
 * slot it is on) and `--tip-arrow` (the arrow's distance from the tip's top, pointing at the slot's centre).
 * @param {HTMLElement} tip  absolutely positioned
 * @param {Element} anchor  the hovered slot
 * @param {{ bounds?: DOMRect, avoid?: Element[], gap?: number, margin?: number }} [o]
 * @returns {{ x: number, y: number, side: 'left' | 'right' }}  viewport coordinates of the tip's top-left
 */
export function placeItemTip(tip, anchor, o = {}) {
  const parent = (tip.offsetParent ?? document.body).getBoundingClientRect();
  const b = o.bounds ?? parent;
  const a = anchor.getBoundingClientRect();
  const gap = o.gap ?? 10;
  const m = o.margin ?? 8;
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  const fits = (/** @type {number} */ x) => x >= b.left + m && x + w <= b.right - m;
  /** @type {'left' | 'right'} */
  let side = 'right';
  let x = a.right + gap;
  if (!fits(x)) {
    side = 'left';
    x = a.left - gap - w;
  }
  if (!fits(x)) x = Math.min(Math.max(x, b.left + m), b.right - m - w);
  const lo = b.top + m;
  const hi = b.bottom - m - h;
  let y = Math.min(Math.max(a.top + a.height / 2 - h / 2, lo), hi);
  const others = (o.avoid ?? []).filter((n) => n !== anchor).map((n) => n.getBoundingClientRect());
  const hits = (/** @type {number} */ top) => others.some((r) => r.right > x && r.left < x + w && r.bottom > top && r.top < top + h);
  const start = y;
  while (hits(y) && y < hi) y += 1;
  if (hits(y)) for (y = start; hits(y) && y > lo; ) y -= 1;
  tip.style.left = `${Math.round(x - parent.left)}px`;
  tip.style.top = `${Math.round(y - parent.top)}px`;
  tip.dataset.side = side;
  tip.style.setProperty('--tip-arrow', `${Math.round(Math.min(Math.max(a.top + a.height / 2 - y, 16), h - 16))}px`);
  return { x, y, side };
}
