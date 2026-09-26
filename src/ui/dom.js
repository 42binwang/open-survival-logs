// Minimal DOM helpers: element builder, windows (panels), tooltips and toasts.
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

// ------------------------------------------------------------------------------- windows
const windows = [];
let layer = null;

export function initWindows(root) {
  layer = root;
}

export function openWindow(id, { title, build, width = 520, onClose, modal = false, className = '' }) {
  closeWindow(id);
  const body = h('div', { class: 'win-body' });
  // a dialog named by its title, for screen readers
  const titleId = `win-title-${String(id).replace(/[^\w-]/g, '_')}`;
  const win = h(
    'div',
    { class: `win ${className}`, style: { width: typeof width === 'number' ? `${width}px` : width }, dataset: { id }, role: 'dialog', 'aria-modal': modal ? 'true' : null, 'aria-labelledby': titleId },
    h('div', { class: 'win-title' }, h('span', { id: titleId }, title), h('button', { class: 'win-x', title: 'Close (Esc)', 'aria-label': 'Close', onclick: () => closeWindow(id) }, '×')),
    body
  );
  const wrap = modal ? h('div', { class: 'modal-back' }, win) : win;
  layer.appendChild(wrap);
  const entry = { id, el: wrap, win, body, onClose, build, modal };
  windows.push(entry);
  entry.refresh = () => {
    const scroll = body.scrollTop;
    clear(body);
    build(body, entry);
    body.scrollTop = scroll;
  };
  entry.refresh();
  makeDraggable(win, win.querySelector('.win-title'));
  syncModalOpen();
  return entry;
}

// body.modal-open while an event or dialog waits for the player: toasts (phone messages, alerts) then sit behind its
// backdrop instead of piling onto its title and choices (styles.css)
function syncModalOpen() {
  globalThis.document?.body?.classList.toggle('modal-open', windows.some((w) => w.modal));
}

export function closeWindow(id) {
  const i = windows.findIndex((w) => w.id === id);
  if (i < 0) return false;
  const [w] = windows.splice(i, 1);
  w.el.remove();
  syncModalOpen();
  w.onClose?.();
  return true;
}

export function closeTopWindow() {
  const w = windows[windows.length - 1];
  if (!w) return false;
  return closeWindow(w.id);
}

export function isOpen(id) {
  return windows.some((w) => w.id === id);
}

// The id of the modal window on top (the one the player is looking at), or null.
export function topModalId() {
  for (let i = windows.length - 1; i >= 0; i--) if (windows[i].modal) return windows[i].id;
  return null;
}

export function anyWindowOpen() {
  return windows.length > 0;
}

// Open window ids, top-most first.
export function windowIds() {
  return windows.map((w) => w.id).reverse();
}

export function windowElement(id) {
  return windows.find((w) => w.id === id)?.win || null;
}

export function anyModalOpen() {
  return windows.some((w) => w.modal);
}

// While held (an inventory drag with interface lag optimization on), refreshes are collected and run once on release.
let refreshHold = false;
let refreshLater = null;

export function holdRefreshes(on) {
  refreshHold = !!on;
  if (refreshHold || !refreshLater) return;
  const later = refreshLater;
  refreshLater = null;
  if (later === 'all') refreshWindows();
  else for (const id of later) refreshWindow(id);
}

export function refreshWindows() {
  if (refreshHold) {
    refreshLater = 'all';
    return;
  }
  for (const w of windows) w.refresh();
}

export function refreshWindow(id) {
  if (refreshHold) {
    if (refreshLater !== 'all') (refreshLater ||= new Set()).add(id);
    return;
  }
  windows.find((w) => w.id === id)?.refresh();
}

// Collapses a burst of refresh requests into a single refresh on the next frame.
let refreshSoon = false;
export function refreshWindowsSoon() {
  if (refreshSoon) return;
  refreshSoon = true;
  const run = () => {
    refreshSoon = false;
    refreshWindows();
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else setTimeout(run, 0);
}

export function closeAllWindows() {
  while (windows.length) closeWindow(windows[windows.length - 1].id);
}

function makeDraggable(win, handle) {
  let sx;
  let sy;
  let ox;
  let oy;
  handle.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    const r = win.getBoundingClientRect();
    sx = e.clientX;
    sy = e.clientY;
    ox = r.left;
    oy = r.top;
    win.style.position = 'fixed';
    win.style.margin = '0';
    const move = (ev) => {
      win.style.left = `${ox + ev.clientX - sx}px`;
      win.style.top = `${oy + ev.clientY - sy}px`;
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });
}

// ------------------------------------------------------------------------------- tooltip
let tipEl = null;
export function initTooltip(root) {
  tipEl = h('div', { class: 'tooltip hidden' });
  root.appendChild(tipEl);
  document.addEventListener('mousemove', (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (!t) {
      tipEl.classList.add('hidden');
      return;
    }
    tipEl.innerHTML = t.dataset.tip;
    tipEl.classList.remove('hidden');
    const x = Math.min(window.innerWidth - tipEl.offsetWidth - 8, e.clientX + 14);
    const y = Math.min(window.innerHeight - tipEl.offsetHeight - 8, e.clientY + 14);
    tipEl.style.left = `${x}px`;
    tipEl.style.top = `${y}px`;
  });
}

export function hideTooltip() {
  tipEl?.classList.add('hidden');
}

// ------------------------------------------------------------------------------- toasts
let toastEl = null;
export function initToasts(root) {
  // announced as they arrive, without taking focus
  toastEl = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
  root.appendChild(toastEl);
}

// The fixed column at the top of the screen that toasts (and the HUD's item bars) stack in.
export function toastLayer() {
  return toastEl;
}

export function toast(text, kind = 'info', ms = 3200) {
  if (!toastEl || !text) return;
  const t = h('div', { class: `toast ${kind}` }, text);
  toastEl.appendChild(t);
  const shown = [...toastEl.children].filter((c) => c.classList.contains('toast'));
  while (shown.length > 5) shown.shift().remove();
  setTimeout(() => t.classList.add('fade'), ms - 400);
  setTimeout(() => t.remove(), ms);
  t.addEventListener('click', () => t.remove());
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function bar(value, max, cls) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return h('div', { class: `bar ${cls || ''}` }, h('div', { class: 'bar-fill', style: { width: `${pct}%` } }));
}
