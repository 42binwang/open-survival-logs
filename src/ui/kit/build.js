// @ts-check
// Thin element builders over the kit's CSS classes (docs/UI.md §6), for P1's panels. Each returns a plain element
// with the classes and attributes docs/UI.md describes; the markup stays open to append to.
import { glyph } from './glyphs.js';

/** @typedef {Node | string | number | null | undefined | false} Child */

/**
 * An element with attributes (`null` / `false` skip one, `true` sets it empty) and children (nested arrays flatten).
 * @param {string} tag
 * @param {Record<string, string | number | boolean | null | undefined>} [attrs]
 * @param {...(Child | Child[])} children
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.append(typeof c === 'object' ? c : String(c));
  }
  return e;
}

/** @param {(string | false | null | undefined)[]} parts */
const cls = (...parts) => parts.filter(Boolean).join(' ');

/**
 * @typedef {'primary' | 'secondary' | 'confirm' | 'buy' | 'danger' | 'ghost' | 'objective'} ButtonVariant
 * @param {{ label: string, variant?: ButtonVariant, size?: 'sm' | 'lg', block?: boolean, glyph?: string,
 *   disabled?: boolean, state?: 'hover' | 'active' | 'focus' }} o
 */
export function button(o) {
  return el(
    'button',
    { type: 'button', class: cls('sl-btn', o.variant && `sl-btn--${o.variant}`, o.size && `sl-btn--${o.size}`, o.block && 'sl-btn--block', o.state && `is-${o.state}`), disabled: !!o.disabled },
    o.glyph ? glyph(o.glyph) : null,
    o.label
  );
}

/** @param {{ label: string, kind?: 'gold' | 'must' | 'outline' | 'quiet', glyph?: string }} o */
export function tag(o) {
  return el('span', { class: cls('sl-tag', o.kind && `sl-tag--${o.kind}`) }, o.glyph ? glyph(o.glyph) : null, o.label);
}

/**
 * A bar, 0 … 1.
 * @param {{ value: number, kind?: 'primary' | 'danger' | 'alert' | 'fresh' | 'info', thick?: boolean, label?: string }} o
 */
export function bar(o) {
  const v = Math.max(0, Math.min(1, o.value));
  return el('div', {
    class: cls('sl-bar', o.kind && `sl-bar--${o.kind}`, o.thick && 'sl-bar--thick'),
    style: `--v: ${v}`,
    role: 'progressbar',
    'aria-valuemin': 0,
    'aria-valuemax': 100,
    'aria-valuenow': Math.round(v * 100),
    'aria-label': o.label ?? null,
  });
}

/** @param {{ text: Child | Child[], kind?: 'good' | 'bad' | 'info', glyph?: string }} o */
export function toast(o) {
  return el('div', { class: cls('sl-toast', o.kind && `sl-toast--${o.kind}`), role: 'status' }, o.glyph ? glyph(o.glyph) : null, el('span', {}, o.text));
}

/** @param {string} label  the accessible name */
export function closeButton(label) {
  return el('button', { type: 'button', class: 'sl-close', 'aria-label': label }, glyph('close'));
}

/**
 * A section head: accent bar, caps label, optional grey suffix and right-hand aside.
 * @param {{ label: string, sub?: string, aside?: Child, level?: 2 | 3 | 4 }} o
 */
export function section(o) {
  return el(`h${o.level ?? 3}`, { class: 'sl-section' }, o.label, o.sub ? el('span', { class: 'sl-section__sub' }, o.sub) : null, o.aside != null ? el('span', { class: 'sl-section__aside' }, o.aside) : null);
}

/**
 * A window pane (ss_01): head with title and close, a body, an optional foot.
 * @param {{ title: string, close?: string, body: Child | Child[], foot?: Child | Child[], variant?: 'solid' | 'flush' | 'pane' }} o
 */
export function panel(o) {
  return el(
    'section',
    { class: cls('sl-panel', o.variant && `sl-panel--${o.variant}`), 'aria-label': o.title },
    el('header', { class: 'sl-panel__head' }, el('h2', { class: 'sl-panel__title' }, o.title), o.close ? closeButton(o.close) : null),
    o.body,
    o.foot ? el('footer', { class: 'sl-panel__foot' }, o.foot) : null
  );
}

/**
 * A station window (ss_07, ss_08): the frosted frame with a head and panes side by side.
 * @param {{ title: string, sub?: string, close?: string, panes: (Child | Child[])[] }} o
 */
export function frame(o) {
  return el(
    'section',
    { class: 'sl-frame', 'aria-label': o.title },
    el('header', { class: 'sl-frame__head' }, section({ label: o.title, sub: o.sub }), o.close ? closeButton(o.close) : null),
    el('div', { class: 'sl-frame__panes' }, o.panes.map((p) => el('div', { class: 'sl-panel sl-panel--pane' }, p)))
  );
}
