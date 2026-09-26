// Fixes for the A–F audit gaps A08, A12, B07, D03, D04, D05, D13, D14 and E13 (docs/audit/part-A-F.md).
// UI modules run against a small DOM stand-in (after tests/coverage_af.test.js) that also lays out inventory grids,
// so drags can be dropped on a cell. The last tests import src/main.js itself for the key and mouse dispatch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { tick } from '../src/sim/tick.js';
import { enqueue, isIdle, isWalkableHome } from '../src/sim/actions.js';
import { eatItem, useItemAction, placeWaste, pickUpFromBox, WASTE, isDocument, useDurationMin, readBook } from '../src/sim/itemuse.js';
import { addItem, count, createInventory } from '../src/sim/inventory.js';
import { furnitureAt, dropNewItem } from '../src/sim/home.js';
import { giveItems } from '../src/sim/furnActions.js';
import { buyAbility, START_ONLY_ABILITIES } from '../src/sim/rebirth.js';
import { HOUR } from '../src/sim/time.js';
import { item, itemName } from '../src/data/db.js';
import { ABILITY_BY_ID } from '../src/content/abilities.js';
import { setLang } from '../src/engine/i18n.js';
import { emit, on } from '../src/engine/bus.js';
import { defaultHistory } from '../src/engine/save.js';
import { game, applySettings, DEFAULT_SETTINGS } from '../src/game.js';
import { initWindows, initToasts, isOpen, closeWindow, closeAllWindows, refreshWindows, refreshWindowsSoon, openWindow, windowIds, toast } from '../src/ui/dom.js';
import { initMenus, titleScreen, settingsWindow, keyFor, actionForBinding } from '../src/ui/menus.js';
import { initHud, updateHud, notifyGot, clearGotBars, planBarAbilities, HUD_REBUILD_MS, GOT_BAR_MS, GOT_BAR_MAX, PLAN_BAR_SLOTS } from '../src/ui/hud.js';
import { registerPanel, openPanel, takeAll, takeAllSource, takeAllHotkey, panelContext, floorBoxesByDistance } from '../src/ui/panels.js';
import { openCtxMenu, closeCtxMenu, storageTagLabel } from '../src/ui/ctxmenu.js';
import { isDragging, itemIcon } from '../src/ui/invgrid.js';
import { buildView } from '../src/ui/view.js';
import { IsoRenderer } from '../src/render/iso.js';
import { POINTS_HELP } from '../src/ui/settlementPanel.js';
import '../src/ui/journalPanel.js';

// ------------------------------------------------------------------------------------------ DOM stand-in
const px = (v) => parseFloat(v) || 0;
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });
const gridPos = new Map(); // inventory id -> where its grid sits on screen

class FakeNode {
  constructor() {
    this.childNodes = [];
    this.parentNode = null;
    this.listeners = {};
  }
  get children() {
    return this.childNodes.filter((c) => c instanceof FakeElement);
  }
  get firstChild() {
    return this.childNodes[0] || null;
  }
  get nextSibling() {
    const p = this.parentNode;
    return p ? p.childNodes[p.childNodes.indexOf(this) + 1] || null : null;
  }
  get isConnected() {
    for (let n = this; n; n = n.parentNode) if (n === document.body || n === document.head) return true;
    return false;
  }
  appendChild(c) {
    c.parentNode?.removeChild(c);
    this.childNodes.push(c);
    c.parentNode = this;
    return c;
  }
  removeChild(c) {
    const i = this.childNodes.indexOf(c);
    if (i >= 0) this.childNodes.splice(i, 1);
    c.parentNode = null;
    return c;
  }
  remove() {
    this.parentNode?.removeChild(this);
  }
  contains(n) {
    for (; n; n = n.parentNode) if (n === this) return true;
    return false;
  }
  get textContent() {
    return this.childNodes.map((c) => c.textContent).join('');
  }
  set textContent(v) {
    this.childNodes = [];
    if (v != null && v !== '') this.appendChild(new FakeText(String(v)));
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  removeEventListener(type, fn) {
    const l = this.listeners[type];
    if (l?.includes(fn)) l.splice(l.indexOf(fn), 1);
  }
  fire(type, ev = {}) {
    const e = { type, target: this, currentTarget: this, button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...ev };
    for (const fn of [...(this.listeners[type] || [])]) fn(e);
    return e;
  }
}
class FakeText extends FakeNode {
  constructor(text) {
    super();
    this.data = text;
  }
  get textContent() {
    return this.data;
  }
}
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => ((t[k] = v), true) });
class FakeElement extends FakeNode {
  constructor(tag) {
    super();
    this.tagName = String(tag).toUpperCase();
    this.attributes = {};
    // CSSStyleDeclaration: custom properties go through setProperty
    this.style = { setProperty(/** @type {string} */ k, /** @type {string} */ v) { this[k] = v; } };
    // browsers keep data-* values as strings
    this.dataset = new Proxy({}, { set: (t, k, v) => ((t[k] = String(v)), true) });
    this.className = '';
    this.innerHTML = '';
  }
  /** layout height: the element's own style height (the stand-in lays nothing else out) */
  get offsetHeight() {
    return px(this.style.height);
  }
  get classList() {
    const list = () => this.className.split(/\s+/).filter(Boolean);
    return {
      add: (...c) => (this.className = [...new Set([...list(), ...c])].join(' ')),
      remove: (...c) => (this.className = list().filter((x) => !c.includes(x)).join(' ')),
      contains: (c) => list().includes(c),
      toggle: (c, force) => {
        const on = force ?? !list().includes(c);
        this.className = on ? [...new Set([...list(), c])].join(' ') : list().filter((x) => x !== c).join(' ');
        return on;
      },
    };
  }
  get id() {
    return this.attributes.id || '';
  }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
  }
  getAttribute(k) {
    return k in this.attributes ? this.attributes[k] : null;
  }
  removeAttribute(k) {
    delete this.attributes[k];
  }
  get disabled() {
    return 'disabled' in this.attributes;
  }
  get value() {
    return this._value ?? this.attributes.value ?? '';
  }
  set value(v) {
    this._value = v;
  }
  get checked() {
    return this._checked ?? 'checked' in this.attributes;
  }
  set checked(v) {
    this._checked = v;
  }
  // Like a browser: nothing for a detached element; grids sit where gridPos says, items inside their grid.
  getBoundingClientRect() {
    if (!this.isConnected) return rect(0, 0, 0, 0);
    if (this._rect) return this._rect;
    if (this.classList.contains('inv-grid')) {
      const p = gridPos.get(this.dataset.inv) || { left: 0, top: 0 };
      return rect(p.left, p.top, px(this.style.width), px(this.style.height));
    }
    if (this.classList.contains('inv-item') && this.parentNode) {
      const g = this.parentNode.getBoundingClientRect();
      return rect(g.left + px(this.style.left), g.top + px(this.style.top), px(this.style.width), px(this.style.height));
    }
    return rect(0, 0, 10, 10);
  }
  cloneNode(deep) {
    const c = new FakeElement(this.tagName);
    c.className = this.className;
    Object.assign(c.style, this.style);
    Object.assign(c.dataset, this.dataset);
    Object.assign(c.attributes, this.attributes);
    if (deep) for (const ch of this.childNodes) c.appendChild(ch instanceof FakeElement ? ch.cloneNode(true) : new FakeText(ch.textContent));
    return c;
  }
  getContext() {
    return ctx2d;
  }
  focus() {}
  click() {
    return this.fire('click');
  }
  querySelectorAll(sel) {
    return all(this, (n) => n !== this && matches(n, sel));
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }
  closest(sel) {
    for (let n = this; n; n = n.parentNode) if (n instanceof FakeElement && matches(n, sel)) return n;
    return null;
  }
}
function all(root, pred) {
  const out = [];
  (function walk(n) {
    if (pred(n)) out.push(n);
    for (const c of n.childNodes || []) walk(c);
  })(root);
  return out;
}
function simpleMatch(n, s) {
  if (!(n instanceof FakeElement)) return false;
  const m = s.match(/^([a-z0-9]*)((?:\.[\w-]+)*)$/i);
  if (!m || (m[1] && n.tagName !== m[1].toUpperCase())) return false;
  return m[2]
    .split('.')
    .filter(Boolean)
    .every((c) => n.classList.contains(c));
}
function matches(n, sel) {
  const parts = sel.trim().split(/\s+/);
  if (!simpleMatch(n, parts.at(-1))) return false;
  let i = parts.length - 2;
  for (let p = n.parentNode; i >= 0 && p; p = p.parentNode) if (simpleMatch(p, parts[i])) i--;
  return i < 0;
}
class FakeStorage {
  getItem(k) {
    return Object.prototype.hasOwnProperty.call(this, k) ? this[k] : null;
  }
  setItem(k, v) {
    this[k] = String(v);
  }
  removeItem(k) {
    delete this[k];
  }
}
globalThis.Node = FakeNode;
globalThis.localStorage = new FakeStorage();
globalThis.document = {
  createElement: (t) => new FakeElement(t),
  createTextNode: (t) => new FakeText(t),
  body: new FakeElement('body'),
  head: new FakeElement('head'),
  documentElement: new FakeElement('html'),
  fullscreenElement: null,
  activeElement: null,
  addEventListener() {},
  removeEventListener() {},
  getElementById: (id) => all(document.body, (n) => n instanceof FakeElement && n.id === id)[0] || all(document.head, (n) => n instanceof FakeElement && n.id === id)[0] || null,
  querySelector: (s) => document.body.querySelector(s),
  querySelectorAll: (s) => document.body.querySelectorAll(s),
  elementsFromPoint: () => [],
};
// window listeners run capture-first and honour stopPropagation, like the settings window's rebinding relies on
const windowListeners = {};
globalThis.window = {
  innerWidth: 1280,
  innerHeight: 800,
  devicePixelRatio: 1,
  addEventListener: (t, fn, capture = false) => (windowListeners[t] ||= []).push({ fn, capture: capture === true || capture?.capture === true }),
  removeEventListener: (t, fn) => {
    const l = windowListeners[t] || [];
    const i = l.findIndex((x) => x.fn === fn);
    if (i >= 0) l.splice(i, 1);
  },
  confirm: () => true,
};
function fireWindow(type, ev = {}) {
  let stopped = false;
  const e = { type, target: document.body, button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation: () => (stopped = true), ...ev };
  const list = windowListeners[type] || [];
  for (const { fn } of [...list.filter((l) => l.capture), ...list.filter((l) => !l.capture)]) {
    if (stopped) break;
    fn(e);
  }
  return e;
}
let frames = [];
globalThis.requestAnimationFrame = (fn) => frames.push(fn);
function flushFrames() {
  const run = frames;
  frames = [];
  for (const fn of run) fn(performance.now());
}
// the explore panel polls with setInterval once a window exists; it must not keep the test process alive
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = (fn, ms, ...args) => realSetInterval(fn, ms, ...args).unref();

const appEl = new FakeElement('div');
const canvasEl = new FakeElement('canvas');
const hudRoot = new FakeElement('div');
const screens = new FakeElement('div');
const layer = new FakeElement('div');
for (const [el, id] of [
  [appEl, 'app'],
  [canvasEl, 'scene'],
  [hudRoot, 'hud'],
  [screens, 'screens'],
  [layer, 'windows'],
]) {
  el.setAttribute('id', id);
  if (el !== appEl) appEl.appendChild(el);
}
canvasEl._rect = rect(0, 0, 1280, 800);
document.body.appendChild(appEl);
initWindows(layer);
initToasts(document.body);
initMenus(screens);
initHud(hudRoot);
game.ui = { renderer: { highlight: new Set(), hover: null, cam: {} }, recenter() {}, opTip() {} };

const buttons = (root) => root.querySelectorAll('button');
const labels = (root) => buttons(root).map((b) => b.textContent.trim());
function button(root, re) {
  const b = buttons(root).find((x) => re.test(x.textContent.trim()));
  assert.ok(b, `button ${re} among [${labels(root).join(' | ')}]`);
  return b;
}
const windowEl = (id) => all(layer, (n) => n.dataset?.id === id)[0] || null;
const toastTexts = () => document.body.querySelectorAll('.toasts').at(-1)?.children.map((t) => t.textContent) || [];
const byUid = (root, uid) => all(root, (n) => n.classList?.contains('inv-item') && n.dataset?.uid === String(uid))[0] || null;
const byTip = (root, tip) => all(root, (n) => n.dataset?.tip === tip)[0] || null;

// ------------------------------------------------------------------------------------------ run helpers
const bp = (s) => s.inventories[s.player.backpack];

function fresh(opts = {}) {
  return newGame({ seed: 71, skipPrologue: true, ...opts });
}

// 21:00 on Day 1, just after the outbreak.
function post(opts = {}) {
  const s = fresh(opts);
  s.phase = 'post';
  s.clock.t = s.clock.outbreakAt + 3 * HOUR;
  s.run.day = 1;
  return s;
}

function keepAlive(s) {
  Object.assign(s.player.stats, { sat: 90, sta: 95, mor: 60, life: 100 });
  s.ui.autonomy = false;
}

function untilIdle(s, max = 4 * HOUR) {
  for (let t = 0; t < max && !isIdle(s); t += 30) tick(s, 30);
  assert.ok(isIdle(s), `still busy with ${s.actions.current?.kind}`);
}

// A free floor tile 3–6 steps from the survivor on their floor.
function tileAway(s) {
  const p = s.player;
  for (let d = 3; d <= 6; d++) {
    for (let dx = -d; dx <= d; dx++) {
      for (const dy of [d - Math.abs(dx), Math.abs(dx) - d]) {
        if (isWalkableHome(s, p.floor, p.x + dx, p.y + dy)) return [p.x + dx, p.y + dy];
      }
    }
  }
  throw new Error('no free tile near the survivor');
}

const floorIds = (s) => (s.floorBoxes || []).flatMap((b) => s.inventories[b.inv]?.items.map((i) => i.id) || []);

// ================================================================================== A08 settings that now do something
test('A08 interface lag optimization rebuilds the HUD less often and not in the middle of a drag', () => {
  const s = post({ seed: 801 });
  game.state = s;
  applySettings({ lagOptimization: true });
  updateHud(1000, true);
  const top = () => hudRoot.querySelector('.topbar');
  const first = top();
  updateHud(1000 + HUD_REBUILD_MS.normal + 50);
  assert.equal(top(), first, 'no rebuild before the longer interval');
  updateHud(1000 + HUD_REBUILD_MS.optimized);
  assert.notEqual(top(), first, 'rebuilt after it');
  applySettings({ lagOptimization: false });
  updateHud(5000, true);
  const plain = top();
  updateHud(5000 + HUD_REBUILD_MS.normal);
  assert.notEqual(top(), plain, 'the normal interval without the optimization');

  applySettings({ lagOptimization: true });
  const can = addItem(s, bp(s), 9030);
  gridPos.set(s.player.backpack, { left: 100, top: 100 });
  openPanel('backpack');
  byUid(windowEl('backpack'), can.uid).fire('mousedown', { clientX: 110, clientY: 110 });
  fireWindow('mousemove', { clientX: 150, clientY: 150 });
  assert.equal(isDragging(), true);
  updateHud(9000, true);
  const during = top();
  updateHud(9000 + HUD_REBUILD_MS.optimized * 3);
  assert.equal(top(), during, 'the HUD waits while an item is dragged');
  fireWindow('mouseup', { clientX: 150, clientY: 150 });
  assert.equal(isDragging(), false);
  updateHud(9000 + HUD_REBUILD_MS.optimized * 4);
  assert.notEqual(top(), during);
  closeAllWindows();
  applySettings({ ...DEFAULT_SETTINGS, keys: {} });
});

test('A08 with lag optimization, windows are not rebuilt mid-drag, and the drop lands on the cell under the item', () => {
  const s = post({ seed: 802 });
  game.state = s;
  applySettings({ lagOptimization: true });
  const can = addItem(s, bp(s), 9030);
  assert.deepEqual([can.x, can.y], [0, 0]);
  gridPos.set(s.player.backpack, { left: 100, top: 100 });
  openPanel('backpack');
  const body = () => windowEl('backpack').querySelector('.win-body').firstChild;
  const pressed = body();
  byUid(windowEl('backpack'), can.uid).fire('mousedown', { clientX: 110, clientY: 110 });
  assert.equal(body(), pressed, 'pressing does not rebuild (and re-centre) the window under the cursor');
  const [toX, toY] = [110 + 3 * 34, 110 + 2 * 34];
  fireWindow('mousemove', { clientX: toX, clientY: toY });
  const before = body();
  refreshWindows();
  assert.equal(body(), before, 'refresh held while dragging');
  assert.equal(byUid(windowEl('backpack'), can.uid).style.opacity, '0.3', 'the item left behind is dimmed');
  const grid = windowEl('backpack').querySelector('.inv-grid');
  document.elementsFromPoint = () => [grid];
  fireWindow('mouseup', { clientX: toX, clientY: toY });
  assert.deepEqual([can.x, can.y], [3, 2], 'dropped three cells right and two down');
  assert.notEqual(body(), before, 'the held refresh ran on the drop');

  applySettings({ lagOptimization: false });
  byUid(windowEl('backpack'), can.uid).fire('mousedown', { clientX: 212, clientY: 178 });
  fireWindow('mousemove', { clientX: 150, clientY: 150 });
  const now = body();
  refreshWindows();
  assert.notEqual(body(), now, 'without the optimization windows refresh at once');
  document.elementsFromPoint = () => [];
  fireWindow('mouseup', { clientX: 150, clientY: 150 });
  assert.equal(byUid(windowEl('backpack'), can.uid).classList.contains('selected'), false, 'a drag does not select');
  byUid(windowEl('backpack'), can.uid).fire('mousedown', { clientX: 212, clientY: 178 });
  fireWindow('mouseup', { clientX: 212, clientY: 178 });
  assert.ok(byUid(windowEl('backpack'), can.uid).classList.contains('selected'), 'a click selects on release');
  closeAllWindows();
  applySettings({ ...DEFAULT_SETTINGS, keys: {} });
});

test('A08 refreshWindowsSoon collapses a burst of refreshes into one', () => {
  let builds = 0;
  openWindow('burst', { title: 'Burst', build: () => builds++ });
  assert.equal(builds, 1);
  refreshWindowsSoon();
  refreshWindowsSoon();
  refreshWindowsSoon();
  assert.equal(builds, 1, 'nothing yet');
  flushFrames();
  assert.equal(builds, 2, 'one refresh on the next frame');
  closeWindow('burst');
});

test('A08 mouse side buttons bound in the settings resolve to their actions', () => {
  applySettings({ ...DEFAULT_SETTINGS, keys: {} });
  assert.equal(actionForBinding('Mouse4'), null);
  assert.equal(actionForBinding('I'), 'inventory');
  settingsWindow();
  const binding = (action) => all(windowEl('settings').querySelector('.kv'), (n) => n.tagName === 'SPAN' && n.textContent === action)[0].nextSibling;
  binding('map').fire('click');
  fireWindow('mousedown', { button: 3 });
  binding('interact').fire('click');
  fireWindow('mousedown', { button: 4 });
  assert.deepEqual([keyFor('map'), keyFor('interact')], ['Mouse4', 'Mouse5']);
  assert.deepEqual([actionForBinding('Mouse4'), actionForBinding('Mouse5')], ['map', 'interact']);
  closeWindow('settings');
  applySettings({ ...DEFAULT_SETTINGS, keys: {} });
});

// ================================================================================== A12 title-screen easter eggs
test('A12 title screen: the lamp, the calendar and the cat react to clicks besides the radio', () => {
  game.history = defaultHistory();
  game.history.profile.runs = 3;
  titleScreen();
  const scene = () => screens.querySelector('.screen');
  const radio = byTip(screens, 'The radio on the shelf');
  radio.fire('click');
  assert.match(toastTexts().at(-1), /static|song you almost remember|Day 101/);

  byTip(screens, 'The desk lamp').fire('click');
  assert.ok(scene().classList.contains('lamp-off'), 'the lights go out');
  assert.match(toastTexts().at(-1), /nobody out there sees a light/);
  titleScreen();
  assert.ok(scene().classList.contains('lamp-off'), 'and stay out when the menu redraws');
  byTip(screens, 'The desk lamp').fire('click');
  assert.equal(scene().classList.contains('lamp-off'), false);
  assert.match(toastTexts().at(-1), /flickers back on/);

  const calendar = byTip(screens, 'The calendar on the wall');
  const pages = [];
  for (let i = 0; i < 5; i++) {
    calendar.fire('click');
    pages.push(toastTexts().at(-1));
  }
  assert.match(pages[0], /Circled in red: today, 18:00/);
  assert.match(pages[2], /Tally marks on the back of the page: 3/, 'one mark per run started');
  assert.match(pages[3], /same date/);
  assert.equal(pages[4], pages[0], 'the pages come round again');
  assert.match(calendar.style.transform, /^rotate\(/);

  const cat = () => byTip(screens, 'A cat at the window');
  const said = [];
  for (let i = 0; i < 4; i++) {
    cat().fire('click');
    said.push(toastTexts().at(-1));
  }
  assert.deepEqual(said, ['Mrrp?', 'The cat headbutts the glass.', 'Purrr… it curls up on the windowsill.', 'Shh. It is asleep.']);
  assert.equal(cat().textContent, '🐈💤');
  titleScreen();
  assert.equal(cat().textContent, '🐈💤', 'still asleep after a redraw');
  setLang('zh');
  titleScreen();
  assert.ok(byTip(screens, '台灯') && byTip(screens, '墙上的日历') && byTip(screens, '窗边的猫'), 'tooltips in Chinese');
  setLang('en');
});

// ================================================================================== B07 / D03 E takes all
test('B07/D03 takeAll moves a container into the backpack; the carry limit holds only when asked', () => {
  const s = post({ seed: 803 });
  const shelf = furnitureAt(s, '1F:l3');
  const inv = s.inventories[shelf.inv];
  for (const id of [2102, 2105, 20004]) addItem(s, inv, id);
  assert.deepEqual(takeAll(s, shelf.inv), { moved: 3, left: 0 });
  assert.equal(inv.items.length, 0);
  assert.deepEqual([count(bp(s), 2102), count(bp(s), 2105), count(bp(s), 20004)], [1, 1, 1]);
  assert.deepEqual(takeAll(s, s.player.backpack), { moved: 0, left: 0 }, 'not from the backpack into itself');
  const heavy = createInventory(s, { kind: 'box', w: 10, h: 10 });
  for (let i = 0; i < 25; i++) addItem(s, heavy, 2115);
  const r = takeAll(s, heavy.id, { allowOverweight: false });
  assert.ok(r.moved > 0 && r.left > 0, 'stops at the carry limit');
  assert.ok(takeAll(s, heavy.id).moved > 0, 'storage Take All may go past it');
});

test('B07/D03 E takes everything from the top-most open container window, matching its Take All button', () => {
  const s = post({ seed: 804 });
  game.state = s;
  const shelf = furnitureAt(s, '1F:l3');
  const wardrobe = furnitureAt(s, '1F:r3');
  addItem(s, s.inventories[shelf.inv], 2102);
  addItem(s, s.inventories[wardrobe.inv], 2400);
  assert.equal(takeAllHotkey(s), false, 'no container window open');
  openPanel('storage', { furn: shelf.uid });
  openPanel('storage', { furn: wardrobe.uid });
  assert.deepEqual(windowIds().slice(0, 2), [`storage-${wardrobe.uid}`, `storage-${shelf.uid}`]);
  assert.deepEqual(takeAllSource(s, `storage-${wardrobe.uid}`), { inv: wardrobe.inv, allowOverweight: true });
  assert.equal(takeAllHotkey(s), true);
  assert.equal(count(bp(s), 2400), 1, 'from the window on top');
  assert.equal(count(bp(s), 2102), 0, 'not the one below');
  assert.equal(takeAllHotkey(s), false, 'the top window is empty now, so E interacts instead');
  closeWindow(`storage-${wardrobe.uid}`);
  assert.equal(takeAllHotkey(s), true);
  assert.equal(count(bp(s), 2102), 1);
  closeAllWindows();

  // the doorstep only at home, like its button
  const door = createInventory(s, { kind: 'doorstep', w: 10, h: 8 });
  s.home.doorstepInv = door.id;
  addItem(s, door, 20004);
  assert.deepEqual(takeAllSource(s, 'doorstep'), { inv: door.id, allowOverweight: false });
  s.player.scene = 'shop:supermarket';
  assert.equal(takeAllSource(s, 'doorstep'), null);
  s.pre.ground = { supermarket: createInventory(s, { kind: 'floor', w: 8, h: 6 }).id };
  assert.deepEqual(takeAllSource(s, 'shopGround'), { inv: s.pre.ground.supermarket, allowOverweight: false });
  s.player.scene = 'home';

  // the loot window of an expedition: its fixture comes from the context the panel was opened with
  const loot = createInventory(s, { kind: 'loot', w: 6, h: 4 });
  addItem(s, loot, 2147);
  s.explore = { ...(s.explore || {}), run: { fixtures: [{ id: 'fx1', inv: loot.id }] } };
  registerPanel('exploreLoot', () => openWindow('exploreLoot', { title: 'Loot', build: () => {} }));
  openPanel('exploreLoot', { fixture: 'fx1' });
  assert.equal(panelContext('exploreLoot').fixture, 'fx1');
  assert.equal(takeAllHotkey(s), true);
  assert.deepEqual([count(bp(s), 2147), loot.items.length], [1, 0]);
  closeAllWindows();

  // any other window with a "Take All (E)" button (cooking output, crafting bin, drone cargo) gets it pressed
  let pressed = 0;
  let enabled = false;
  openWindow('cookOut', { title: 'Cooking', build: (body) => body.appendChild(buttonEl('Take All (E)', !enabled, () => pressed++)) });
  assert.equal(takeAllHotkey(s), false, 'a disabled button is left alone');
  enabled = true;
  refreshWindows();
  assert.equal(takeAllHotkey(s), true);
  assert.equal(pressed, 1);
  closeAllWindows();
});

function buttonEl(text, disabled, onclick) {
  const b = document.createElement('button');
  b.appendChild(document.createTextNode(text));
  if (disabled) b.setAttribute('disabled', '');
  b.addEventListener('click', onclick);
  return b;
}

// ================================================================================== D04 quick pickup list
test('D04 the floor list shows every box on this floor; Take and Take all walk to the box first', () => {
  const s = post({ seed: 805 });
  game.state = s;
  keepAlive(s);
  const p = s.player;
  const [fx, fy] = tileAway(s);
  const near = dropNewItem(s, 2102, p.floor, p.x, p.y);
  const far = dropNewItem(s, 20004, p.floor, fx, fy);
  dropNewItem(s, 2105, p.floor, fx, fy);
  s.home.unlocked['2F'] = true;
  dropNewItem(s, 2106, '2F', 3, 3);
  assert.deepEqual(floorBoxesByDistance(s), [near, far], 'this floor only, nearest first');

  updateHud(performance.now(), true);
  button(hudRoot.querySelector('.toolbar'), /Floor \(2\)/).fire('click');
  const win = () => windowEl('floorItems');
  assert.ok(win(), 'the toolbar opens the list');
  const cards = () => win().querySelectorAll('.floorbox');
  assert.equal(cards().length, 2);
  assert.match(win().textContent, /2 box\(es\) · 3 item\(s\)/);
  assert.match(cards()[0].textContent, /at your feet/);
  assert.match(cards()[1].textContent, /tiles away/);

  const sheet = s.inventories[far.inv].items.find((i) => i.id === 20004);
  const line = all(cards()[1], (n) => n.dataset?.uid === String(sheet.uid))[0];
  assert.match(line.textContent, /Sheet Metal/);
  button(line, /^Take$/).fire('click');
  const a = s.actions.queue.at(-1) || s.actions.current;
  assert.deepEqual([a.kind, a.box, a.uid], ['pickUp', far.id, sheet.uid]);
  untilIdle(s);
  assert.equal(count(bp(s), 20004), 1, 'picked up');
  assert.ok(Math.abs(p.x - fx) + Math.abs(p.y - fy) <= 1, 'after walking over');
  assert.deepEqual(floorIds(s).sort(), [2102, 2105, 2106].sort());

  openPanel('floorItems', { box: far.id });
  assert.ok(cards()[0].classList.contains('sel') && cards()[0].dataset.box === far.id, 'a clicked box comes first');
  button(cards()[0], /^Take all \(E\)$/).fire('click');
  assert.match(button(cards()[0], /On the way/).textContent, /On the way/, 'queued once');
  assert.equal(button(cards()[0], /On the way/).disabled, true);
  untilIdle(s);
  assert.equal(count(bp(s), 2105), 1);
  assert.ok(!s.floorBoxes.includes(far), 'the emptied box is gone');
  assert.equal(s.inventories[far.inv], undefined);
  closeAllWindows();
});

test('D04 E in the floor list picks up the focused box, or every box without one', () => {
  const s = post({ seed: 806 });
  game.state = s;
  keepAlive(s);
  const p = s.player;
  const [fx, fy] = tileAway(s);
  dropNewItem(s, 2102, p.floor, p.x, p.y);
  const b = dropNewItem(s, 20004, p.floor, fx, fy);
  openPanel('floorItems', { box: b.id });
  assert.deepEqual(takeAllSource(s, 'floorItems'), { boxes: [b] });
  assert.equal(takeAllHotkey(s), true);
  assert.deepEqual([...s.actions.queue, s.actions.current].filter(Boolean).map((x) => x.box), [b.id]);
  assert.equal(takeAllHotkey(s), true, 'pressing again does not queue it twice');
  assert.equal([...s.actions.queue, s.actions.current].filter(Boolean).length, 1);
  untilIdle(s);
  openPanel('floorItems');
  assert.equal(takeAllHotkey(s), true);
  untilIdle(s);
  assert.deepEqual([count(bp(s), 2102), count(bp(s), 20004), (s.floorBoxes || []).length], [1, 1, 0]);
  assert.equal(takeAllHotkey(s), false, 'nothing left to pick up');
  closeAllWindows();
});

test('D04 what does not fit in the backpack stays in the box (patch 08-16)', () => {
  const s = post({ seed: 807 });
  keepAlive(s);
  const p = s.player;
  const box = dropNewItem(s, 2115, p.floor, p.x, p.y);
  for (let i = 0; i < 4; i++) dropNewItem(s, 2115, p.floor, p.x, p.y);
  bp(s).items = [];
  bp(s).maxKg = 2.5;
  const toasts = [];
  const off = on('toast', ({ text }) => toasts.push(text));
  enqueue(s, { kind: 'pickUp', box: box.id, uid: null, target: { floor: p.floor, x: p.x, y: p.y }, dur: 60, label: 'Pick up' });
  untilIdle(s);
  off();
  assert.equal(count(bp(s), 2115), 2, 'two 1 kg cans fit under 2.5 kg');
  assert.equal(s.inventories[box.inv].items.length, 3, 'three stay in the box');
  assert.ok(s.floorBoxes.includes(box));
  assert.match(toasts.at(-1), /3 item\(s\) stay in the box/);
  assert.deepEqual(pickUpFromBox(s, 'nope'), { moved: 0, left: 0 });
});

test('D04 floor boxes can be picked in the scene; whichever object is drawn in front wins', () => {
  const r = new IsoRenderer({ getContext: () => ctx2d });
  const view = {
    furniture: [
      { uid: 'shelf', x: 2, y: 2, w: 1, h: 1 },
      { uid: 'low', x: 4, y: 4, w: 1, h: 1 },
      { uid: 'big', x: 8, y: 8, w: 2, h: 2 },
    ],
    boxes: [
      { id: 'b1', x: 6, y: 6 },
      { id: 'b2', x: 4, y: 4 },
      { id: 'b3', x: 8, y: 8 },
      { x: 11, y: 11 }, // shop cart piles have no id
    ],
  };
  let hit = r.pick(view, 6.5, 6.5);
  assert.deepEqual([hit.box?.id, hit.furn], ['b1', null]);
  assert.deepEqual(hit.tile, [6, 6]);
  assert.equal(r.pick(view, 2.5, 2.5).furn.uid, 'shelf');
  assert.equal(r.pick(view, 4.5, 4.5).box.id, 'b2', 'a box drawn after a one-tile piece');
  hit = r.pick(view, 8.5, 8.5);
  assert.deepEqual([hit.furn?.uid, hit.box], ['big', null], 'a large piece drawn over the box');
  hit = r.pick(view, 11.5, 11.5);
  assert.deepEqual([hit.furn, hit.box], [null, null]);
  assert.equal(r.pick({ furniture: [] }, 1.2, 1.7).box, null, 'views without boxes');
});

// ================================================================================== D05 tag on hover
test('D05 a labelled container shows its tag in the context menu', () => {
  const s = post({ seed: 808 });
  game.state = s;
  const shelf = furnitureAt(s, '1F:l3');
  assert.equal(storageTagLabel(s, shelf), '');
  openCtxMenu(shelf, 10, 10);
  assert.equal(document.body.querySelector('.ctxmenu .tagline'), null, 'no label, no tag line');
  s.inventories[shelf.inv].tag = 1009;
  assert.equal(storageTagLabel(s, shelf), 'Medicine');
  openCtxMenu(shelf, 10, 10);
  assert.equal(document.body.querySelector('.ctxmenu .tagline').textContent, '🏷 Medicine');
  setLang('zh');
  assert.equal(storageTagLabel(s, shelf), '药品');
  setLang('en');
  closeCtxMenu();
  assert.equal(storageTagLabel(s, { uid: 'lamp', inv: null }), '', 'furniture without storage');
  assert.equal(storageTagLabel(s, null), '');

  // the tag set in the storage panel is the one shown
  openPanel('storage', { furn: shelf.uid });
  const sel = windowEl(`storage-${shelf.uid}`).querySelector('select');
  sel.value = '1019';
  sel.fire('change');
  assert.equal(storageTagLabel(s, shelf), 'Fertilizer');
  closeAllWindows();
});

// ================================================================================== D13 waste
test('D13 finishing canned food leaves a Washed Empty Can in the backpack, even when eaten from furniture', () => {
  assert.deepEqual(Object.keys(WASTE).map(Number).sort(), [2115, 2123, 2149, 9030]);
  for (const [food, waste] of Object.entries(WASTE)) {
    assert.match(item(Number(food)).zh, /罐头$/, `${itemName(Number(food))} is tinned`);
    assert.equal(waste, 24118);
  }
  const s = post({ seed: 809 });
  keepAlive(s);
  s.player.stats.sat = 10;
  const got = [];
  const off = on('gotItem', (p) => got.push(p));
  eatItem(s, bp(s), addItem(s, bp(s), 2115));
  assert.equal(count(bp(s), 2115), 0);
  assert.equal(count(bp(s), 24118), 1, 'the empty can');
  assert.deepEqual(got.at(-1), { id: 24118, waste: true });
  eatItem(s, bp(s), addItem(s, bp(s), 2102));
  assert.equal(count(bp(s), 24118), 1, 'crackers leave nothing behind');

  const fridge = s.inventories[furnitureAt(s, '1F:k1').inv];
  const peaches = addItem(s, fridge, 2123);
  enqueue(s, useItemAction(s, fridge.id, peaches.uid, 'eat'));
  untilIdle(s);
  assert.deepEqual([count(fridge, 2123), count(fridge, 24118), count(bp(s), 24118)], [0, 0, 2], 'into the backpack, not back into the fridge');
  off();
});

test('D13 waste goes to the backpack first, then the container it came from, then the floor', () => {
  const s = post({ seed: 810 });
  const b = bp(s);
  const shelf = s.inventories[furnitureAt(s, '1F:l3').inv];
  b.w = 1;
  b.h = 1;
  b.items = [];
  addItem(s, b, 2102);
  assert.equal(placeWaste(s, shelf, 24118), 'container', 'backpack full: it stays with the food');
  assert.equal(count(shelf, 24118), 1);
  const tiny = createInventory(s, { kind: 'box', w: 1, h: 1 });
  addItem(s, tiny, 2102);
  assert.equal(placeWaste(s, tiny, 24118), 'floor');
  assert.ok(floorIds(s).includes(24118), 'at the survivor’s feet');
  const crate = createInventory(s, { kind: 'box', w: 1, h: 1 });
  const tuna = addItem(s, crate, 9030);
  b.items = [];
  eatItem(s, crate, tuna);
  assert.deepEqual([count(b, 24118), crate.items.length], [1, 0], 'room in the backpack again: it goes there');
});

// ================================================================================== D14 notification bars
test('D14 item notification bars batch gotItem, harvested and cooked events and go away on their own', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const s = post({ seed: 811 });
  game.state = s;
  clearGotBars();
  updateHud(performance.now(), true);
  const bars = () => document.body.querySelectorAll('.toasts .gotbar');
  // [source mark, "+n", item name] per bar
  const text = () => bars().map((b) => `${b.querySelector('.src').textContent}${b.querySelector('.n').textContent} ${b.children.at(-1).textContent}`);
  emit('gotItem', { id: 2530 });
  emit('gotItem', { id: 2530 });
  assert.deepEqual(text(), [`+2 ${itemName(2530)}`]);
  assert.equal(bars()[0].querySelector('.ico').textContent, itemIcon(item(2530)), 'with the item icon');
  giveItems(s, [[20004, 3]]);
  assert.equal(text().at(-1), `+3 ${itemName(20004)}`, 'from a real source: giveItems');
  emit('cooked', { furn: 'x', recipe: 1, item: 13838, quality: 2 });
  assert.equal(text().at(-1), `🍳+1 ${itemName(13838)}`);

  // farming announces each crop with gotItem and then sends 'harvested': counted once
  emit('gotItem', { id: 2528 });
  emit('gotItem', { id: 2528 });
  emit('harvested', { furn: 'pot', items: [2528, 2528], crops: 1 });
  assert.equal(text().at(-1), `🌾+2 ${itemName(2528)}`);
  await Promise.resolve();
  emit('harvested', { furn: 'pot', items: [2528], crops: 1 });
  assert.equal(text().at(-1), `🌾+3 ${itemName(2528)}`, 'a harvest nobody announced still counts');

  updateHud(performance.now() + 1000, true);
  assert.equal(bars().length, 4, 'HUD rebuilds leave the stack alone');
  const column = document.body.querySelectorAll('.toasts').at(-1);
  for (let i = 0; i < 7; i++) toast(`toast ${i}`);
  assert.equal(column.children.filter((c) => c.classList.contains('toast')).length, 5, 'five toasts at most');
  assert.equal(column.querySelector('.gotbars').parentNode, column, 'trimming old toasts keeps the item bars');
  t.mock.timers.tick(GOT_BAR_MS - 100);
  emit('gotItem', { id: 2530 });
  t.mock.timers.tick(200);
  assert.deepEqual(text(), [`+3 ${itemName(2530)}`], 'an updated bar stays longer');
  t.mock.timers.tick(GOT_BAR_MS);
  assert.equal(bars().length, 0, 'dismissed');

  for (const id of [2102, 2105, 2106, 2115, 2123, 2149, 9030, 20004]) notifyGot(id);
  assert.equal(bars().length, GOT_BAR_MAX, 'a short stack');
  assert.equal(text()[0], `+1 ${itemName(2106)}`, 'the oldest went first');
  emit('leaveGame', {});
  assert.equal(bars().length, 0);
  notifyGot(999999);
  assert.equal(bars().length, 0, 'unknown items are ignored');
});

// ================================================================================== E13 planning bar
test('E13 before the outbreak a bottom bar shows Planning Points with help and buys affordable abilities', () => {
  const s = fresh({ seed: 812 });
  game.state = s;
  s.loop.planningPoints = 100;
  updateHud(performance.now(), true);
  const barEl = () => hudRoot.querySelector('.planbar');
  assert.ok(barEl());
  assert.match(barEl().textContent, /Planning Points: 100/);
  const help = all(barEl(), (n) => n.textContent === '?' && n.dataset?.tip)[0];
  assert.equal(help.dataset.tip, POINTS_HELP.en, 'the ? explains where points come from');
  const offers = labels(barEl()).slice(0, PLAN_BAR_SLOTS);
  assert.deepEqual(offers.slice(0, 2), ['Bulk Bargains · 30', 'Broad Shoulders · 40'], 'what helps the hoard comes first');
  assert.equal(labels(barEl()).length, PLAN_BAR_SLOTS + 1);
  assert.match(labels(barEl()).at(-1), /more…$/);
  const kg = bp(s).maxKg;
  button(barEl(), /^Broad Shoulders · 40$/).fire('click');
  assert.equal(s.loop.planningPoints, 60);
  assert.equal(s.loop.abilities.broadShoulders, 1);
  assert.equal(bp(s).maxKg, kg + 5);
  assert.match(barEl().textContent, /Planning Points: 60/, 'redrawn at once');
  assert.match(toastTexts().at(-1), /Broad Shoulders Lv1/);

  s.loop.planningPoints = 10000;
  const all24 = planBarAbilities(s).map((o) => o.a.id);
  for (const id of START_ONLY_ABILITIES) assert.ok(!all24.includes(id), `${id} only matters when a round starts`);
  assert.ok(all24.every((id) => ABILITY_BY_ID[id]));
  for (let i = 0; i < 3; i++) buyAbility(s, 'broadShoulders');
  assert.ok(!planBarAbilities(s).some((o) => o.a.id === 'broadShoulders'), 'maxed abilities drop out');
  s.loop.planningPoints = 5;
  updateHud(performance.now() + 1000, true);
  assert.deepEqual(labels(barEl()), ['Abilities…'], 'nothing affordable: only the way to the full list');
  button(barEl(), /Abilities…/).fire('click');
  assert.ok(isOpen('journal'), 'the Survival Log');
  assert.ok(windowEl('journal').textContent.includes('Quick Rest'), 'on its Abilities tab');
  closeAllWindows();
  s.ui.modalPause = false;
  s.phase = 'post';
  updateHud(performance.now() + 2000, true);
  assert.equal(barEl(), null, 'gone after the outbreak');
});

// ================================================================================== src/main.js (canvas, keys, mouse)
test('main.js: E takes all from an open container window and otherwise interacts; side buttons run their action', async () => {
  await import('../src/main.js');
  const renderer = game.ui.renderer;
  assert.ok(renderer instanceof IsoRenderer);
  const s = post({ seed: 813 });
  game.state = s;
  keepAlive(s);
  const shelf = furnitureAt(s, '1F:l3');
  addItem(s, s.inventories[shelf.inv], 2102);
  addItem(s, s.inventories[shelf.inv], 20004);
  openPanel('storage', { furn: shelf.uid });
  fireWindow('keydown', { key: 'e' });
  assert.deepEqual([count(bp(s), 2102), count(bp(s), 20004), s.inventories[shelf.inv].items.length], [1, 1, 0], 'E = Take All (E)');
  assert.ok(isIdle(s), 'and nothing else');
  renderer.hover = { furn: shelf.uid };
  fireWindow('keydown', { key: 'E' });
  assert.ok(!isIdle(s), 'with the window empty, E uses the furniture under the mouse');
  s.actions.queue = [];
  s.actions.current = null;
  closeAllWindows();

  applySettings({ keys: { inventory: 'Mouse4', rotateLeft: 'Mouse5' } });
  let e = fireWindow('mousedown', { button: 3 });
  assert.ok(isOpen('backpack'), 'Mouse4 opens the backpack');
  assert.equal(e.defaultPrevented, true);
  assert.equal(fireWindow('mouseup', { button: 3 }).defaultPrevented, true, 'and does not navigate back');
  fireWindow('mousedown', { button: 3 });
  assert.equal(isOpen('backpack'), false, 'pressed again it closes');
  fireWindow('keydown', { key: 'i' });
  assert.equal(isOpen('backpack'), false, 'I is no longer bound');
  fireWindow('mousedown', { button: 4 });
  assert.equal(renderer.cam.swivelTarget, -0.35, 'Mouse5 swivels while held');
  fireWindow('mouseup', { button: 4 });
  assert.equal(renderer.cam.swivelTarget, 0);
  applySettings({ ...DEFAULT_SETTINGS, keys: {} });
  e = fireWindow('mousedown', { button: 3 });
  assert.equal(e.defaultPrevented, false, 'unbound side buttons are left alone');
  assert.equal(isOpen('backpack'), false);
  fireWindow('keydown', { key: 'i' });
  assert.ok(isOpen('backpack'), 'keys still go through the same dispatch');
  fireWindow('keydown', { key: 'i' });
  closeAllWindows();
});

test('main.js: clicking a floor box opens the list on it; hovering labelled storage shows its tag', async () => {
  await import('../src/main.js');
  const renderer = game.ui.renderer;
  const s = post({ seed: 814 });
  game.state = s;
  s.ui.viewFloor = s.player.floor;
  // a free tile where no furniture is drawn over a box
  const p = s.player;
  const furniture = buildView(s).furniture;
  let spot = null;
  for (let d = 2; d <= 8 && !spot; d++) {
    for (let dx = -d; dx <= d && !spot; dx++) {
      for (const [x, y] of [
        [p.x + dx, p.y + d - Math.abs(dx)],
        [p.x + dx, p.y - d + Math.abs(dx)],
      ]) {
        if (isWalkableHome(s, p.floor, x, y) && renderer.pick({ furniture, boxes: [{ id: 'probe', x, y }] }, x + 0.5, y + 0.5).box) {
          spot = [x, y];
          break;
        }
      }
    }
  }
  const [bx, by] = spot;
  const box = dropNewItem(s, 2102, p.floor, bx, by);
  const at = (x, y) => renderer.toCanvas(x, y);
  const [cx, cy] = at(bx + 0.5, by + 0.5);
  fireWindow('mousemove', { target: canvasEl, clientX: cx, clientY: cy });
  assert.deepEqual(renderer.hover, { box: box.id }, 'hovered');
  canvasEl.fire('mousedown', { button: 0, clientX: cx, clientY: cy });
  fireWindow('mouseup', { button: 0, clientX: cx, clientY: cy, target: canvasEl });
  assert.ok(isOpen('floorItems'), 'clicked');
  assert.equal(panelContext('floorItems').box, box.id);
  assert.ok(windowEl('floorItems').querySelector('.floorbox').classList.contains('sel'));
  closeAllWindows();

  const shelf = furnitureAt(s, '1F:l3');
  const [sx, sy] = at(shelf.x + (shelf.w || 1) / 2, shelf.y + (shelf.h || 1) / 2);
  fireWindow('mousemove', { target: canvasEl, clientX: sx, clientY: sy });
  assert.deepEqual(renderer.hover, { furn: shelf.uid });
  assert.equal(canvasEl.dataset.tip, undefined, 'no label, no tooltip');
  s.inventories[shelf.inv].tag = 1009;
  fireWindow('mousemove', { target: canvasEl, clientX: sx, clientY: sy });
  assert.match(canvasEl.dataset.tip, /· 🏷 Medicine$/);
  fireWindow('mousemove', { target: canvasEl, clientX: cx, clientY: cy });
  assert.equal(canvasEl.dataset.tip, undefined, 'cleared off the shelf');
});

test('story documents are a quick, free read; skill books still take an hour and stamina', () => {
  const s = newGame({ seed: 91 });
  const letter = item(9047);
  assert.equal(isDocument(letter), true);
  assert.ok(useDurationMin(letter) <= 5);
  const inst = addItem(s, s.inventories[s.player.backpack], 9047);
  const sta = s.player.stats.sta;
  readBook(s, s.inventories[s.player.backpack], inst);
  assert.equal(s.player.stats.sta, sta, 'no stamina for a letter');
  const notes = item(3029);
  assert.equal(isDocument(notes), false);
  assert.equal(useDurationMin(notes) >= 10, true);
});

test('toasts never cover a modal event: body.modal-open is set exactly while a modal window is open', () => {
  closeAllWindows();
  const body = /** @type {any} */ (globalThis.document).body;
  openWindow('plain-test', { title: 'Plain', build: () => {} });
  assert.equal(body.classList.contains('modal-open'), false, 'a plain panel leaves toasts on top');
  openWindow('modal-test', { title: 'Event', build: () => {}, modal: true });
  assert.equal(body.classList.contains('modal-open'), true, 'a modal event puts toasts behind its backdrop');
  closeWindow('modal-test');
  assert.equal(body.classList.contains('modal-open'), false, 'and back on top once it closes');
  closeAllWindows();
  assert.equal(body.classList.contains('modal-open'), false);
});

test('the HUD records the toolbar\'s height, which the supplies finder and the planning bar sit on', () => {
  game.state = post({ seed: 803 });
  updateHud(5_000_000, true);
  const hud = /** @type {any} */ (hudRoot);
  const bar = all(hud, (n) => n.classList?.contains('hud-toolbar'))[0];
  assert.ok(bar, 'the toolbar is built');
  assert.equal(hud.style['--toolbar-h'], `${bar.offsetHeight}px`);
});
