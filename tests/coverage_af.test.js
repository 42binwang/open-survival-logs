// Coverage for FEATURES.md sections A–F: shell and settings, time and controls, survivor status, inventory,
// the pre-disaster hoard and the safehouse. UI rows run against the real panels with a small DOM stand-in,
// since the UI modules only touch `document` when they build something.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, newLoopData } from '../src/sim/state.js';
import { tick } from '../src/sim/tick.js';
import { enqueue, isIdle, cancelAction, cancelAll } from '../src/sim/actions.js';
import { furnitureFunctions, startFurnitureFunction } from '../src/sim/furnActions.js';
import { eatItem, useMedicine, openPack, cutItem, useItemAction, canUseNow, itemOps } from '../src/sim/itemuse.js';
import { addItem, count, instWeightG, createInventory, moveItem } from '../src/sim/inventory.js';
import {
  furnitureAt,
  installFurniture,
  dropToFloor,
  storageSize,
  isStorage,
  slotAccepts,
  canInstall,
  effectiveMaxHp,
  homeFloors,
  blockedCells,
} from '../src/sim/home.js';
import { slotsFor } from '../src/sim/planning.js';
import { addEffect, hasEffect, effectiveMax, raiseMax, addStat, tickStats, moveSpeedMult, STAT_KEYS } from '../src/sim/stats.js';
import { tickSpoilage, containerRate, isExpiringSoon } from '../src/sim/spoilage.js';
import { suggestions } from '../src/sim/suggest.js';
import { getMods, bumpMods } from '../src/sim/modifiers.js';
import { dayNumber, isNight, daylight, secondsUntilOutbreak, dayStartT, formatClock, HOUR, SPEED_SCALE, RELAXED_SCALE } from '../src/sim/time.js';
import { cellAt, CELL, cellKey } from '../src/sim/scene.js';
import { arriveAt, buy, buyCar, doorstepInv, takeWallet, takeLoan, finishPreparation, trunkInv, shelfOffers } from '../src/sim/predisaster.js';
import { DIFFICULTIES, CUSTOM_RANGES } from '../src/content/difficulty.js';
import { CHARACTERS } from '../src/content/characters.js';
import { LOCATIONS, SHOPS, SUPPLY_POINTS, SHOP_NPCS, PROLOGUE } from '../src/content/shops.js';
import { HOMES } from '../src/content/homes.js';
import { FUNC_SPECS } from '../src/content/funcSpecs.js';
import { MEDICINE } from '../src/content/itemEffects.js';
import { TUTORIALS } from '../src/content/tutorials.js';
import { GAME_VERSION, UPDATE_LOG } from '../src/content/updateLog.js';
import { item, CAT, SLOT, furnitureTags, subCategoryName, needsFridge, allItemsOfCat } from '../src/data/db.js';
import { saveGame, loadGame, listSaves, deleteGame, loadHistory, saveHistory, defaultHistory, loadSettings, _resetStorage } from '../src/engine/save.js';
import { getLang, loc } from '../src/engine/i18n.js';
import { on } from '../src/engine/bus.js';
import { currentMood } from '../src/engine/audio.js';
import { placeRecord, playTrack, consoleAtHome } from '../src/meta/profile.js';
import { game, applySettings, step, setSpeed, toggleRelaxed, DEFAULT_SETTINGS } from '../src/game.js';
import { initWindows, initToasts, isOpen, closeWindow, closeAllWindows, refreshWindows } from '../src/ui/dom.js';
import { initMenus, titleScreen, newGameScreen, settingsWindow, keyFor } from '../src/ui/menus.js';
import { initHud, updateHud } from '../src/ui/hud.js';
import { registerPanel, openPanel, itemMatchesTag, reasonText } from '../src/ui/panels.js';
import { openCtxMenu } from '../src/ui/ctxmenu.js';
import { itemTooltip } from '../src/ui/invgrid.js';
import { buildView, homeView } from '../src/ui/view.js';
import { slotTypeName } from '../src/ui/planningPanel.js';
import '../src/ui/extrasPanel.js';
import '../src/ui/codexPanel.js';
import '../src/ui/achievementsPanel.js';
import '../src/ui/profilePanel.js';
import '../src/ui/shopPanel.js';
import '../src/meta/endless.js';

// ------------------------------------------------------------------------------------------ DOM stand-in
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
    const e = { type, target: this, currentTarget: this, button: 0, preventDefault() {}, stopPropagation() {}, ...ev };
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
class FakeElement extends FakeNode {
  constructor(tag) {
    super();
    this.tagName = String(tag).toUpperCase();
    this.attributes = {};
    // CSSStyleDeclaration: custom properties go through setProperty
    this.style = { setProperty(/** @type {string} */ k, /** @type {string} */ v) { this[k] = v; } };
    this.dataset = {};
    this.className = '';
    this.innerHTML = '';
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
  setAttribute(k, v) {
    this.attributes[k] = String(v);
  }
  getAttribute(k) {
    return k in this.attributes ? this.attributes[k] : null;
  }
  removeAttribute(k) {
    delete this.attributes[k];
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
  getBoundingClientRect() {
    return { left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 };
  }
  cloneNode() {
    return new FakeElement(this.tagName);
  }
  focus() {}
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
const windowListeners = {};
globalThis.Node = FakeNode;
globalThis.localStorage = new FakeStorage();
globalThis.document = {
  createElement: (t) => new FakeElement(t),
  createTextNode: (t) => new FakeText(t),
  body: new FakeElement('body'),
  documentElement: new FakeElement('html'),
  fullscreenElement: null,
  addEventListener() {},
  removeEventListener() {},
  querySelector: (s) => document.body.querySelector(s),
  querySelectorAll: (s) => document.body.querySelectorAll(s),
  elementsFromPoint: () => [],
};
globalThis.window = {
  innerWidth: 1280,
  innerHeight: 800,
  addEventListener: (t, fn) => (windowListeners[t] ||= []).push(fn),
  removeEventListener: (t, fn) => {
    const l = windowListeners[t];
    if (l?.includes(fn)) l.splice(l.indexOf(fn), 1);
  },
  confirm: () => true,
};
function fireWindow(type, ev = {}) {
  const e = { type, target: document.body, preventDefault() {}, stopPropagation() {}, ...ev };
  for (const fn of [...(windowListeners[type] || [])]) fn(e);
}

const layer = new FakeElement('div');
const screens = new FakeElement('div');
const hudRoot = new FakeElement('div');
initWindows(layer);
initToasts(document.body);
initMenus(screens);
initHud(hudRoot);

const buttons = (root) => root.querySelectorAll('button');
const labels = (root) => buttons(root).map((b) => b.textContent.trim());
function button(root, re) {
  const b = buttons(root).find((x) => re.test(x.textContent.trim()));
  assert.ok(b, `button ${re} among [${labels(root).join(' | ')}]`);
  return b;
}
const inputs = (root, type) => root.querySelectorAll('input').filter((i) => i.getAttribute('type') === type);
const windowEl = (id) => all(layer, (n) => n.dataset?.id === id)[0] || null;
const toastTexts = () => document.body.querySelector('.toasts')?.children.map((t) => t.textContent) || [];
const byUid = (root, uid) => all(root, (n) => n.dataset?.uid === uid)[0] || null;
const uiStub = () => ({
  renderer: { highlight: new Set(), hover: null },
  recenter() {},
  opTip(text) {
    game.ui.opTipText = text;
    game.ui.opTipAt = performance.now();
  },
});
game.ui = uiStub();

// ------------------------------------------------------------------------------------------ run helpers
const bp = (s) => s.inventories[s.player.backpack];

function fresh(opts = {}) {
  return newGame({ seed: 11, skipPrologue: true, ...opts });
}

// 21:00 on Day 1, just after the outbreak.
function post(opts = {}) {
  const s = fresh(opts);
  s.phase = 'post';
  s.clock.t = s.clock.outbreakAt + 3 * HOUR;
  s.run.day = 1;
  return s;
}

function atDay(s, day, hour) {
  s.clock.t = dayStartT(s.clock, day) + hour * HOUR;
  s.run.day = day;
  return s;
}

function keepAlive(s) {
  Object.assign(s.player.stats, { sat: 90, sta: 95, mor: 60, life: 100 });
}

function untilIdle(s, max = 8 * HOUR) {
  for (let t = 0; t < max && !isIdle(s); t += 60) tick(s, 60);
  assert.ok(isIdle(s), `still busy with ${s.actions.current?.kind}`);
}

function use(s, f, key) {
  const a = startFurnitureFunction(s, f.uid, key);
  assert.ok(a, `function ${key} on ${f.cfg} starts`);
  untilIdle(s);
  return a;
}

const fn = (s, f, key) => furnitureFunctions(s, f).find((x) => x.key === key);
const floorItems = (s) => (s.floorBoxes || []).flatMap((b) => s.inventories[b.inv]?.items.map((i) => i.id) || []);

// ================================================================================== A. Shell, menus, saves, settings
test('A01 main menu has all nine entries', () => {
  _resetStorage();
  game.history = defaultHistory();
  titleScreen();
  assert.ok(!labels(screens).some((t) => t.startsWith('Continue')), 'no Continue without a save');
  saveGame('slot-a01', fresh({ seed: 101 }));
  titleScreen();
  const menu = labels(screens.querySelector('.menu-col'));
  for (const want of ['Continue', 'New Game', 'Load', 'Endless Mode', 'Codex', 'Achievements', 'Survivor Profile', 'Settings', 'Update Log']) {
    assert.ok(menu.some((t) => t.startsWith(want)), `${want} in [${menu.join(' | ')}]`);
  }
  button(screens, /^Load$/).fire('click');
  assert.ok(screens.textContent.includes('Wage Slave · Loop 1'), 'the load screen lists the slot');
});

test('A02 character cards show locks, unlock hints and Defense Lines', () => {
  game.history = defaultHistory();
  newGameScreen();
  const cards = () => screens.querySelectorAll('.charcard');
  assert.equal(cards().length, 3);
  const [wage, student, warehouse] = cards();
  assert.equal(wage.classList.contains('locked'), false);
  assert.ok(student.classList.contains('locked') && warehouse.classList.contains('locked'));
  assert.ok(student.textContent.includes(CHARACTERS.student.unlockHint.en));
  assert.ok(warehouse.textContent.includes(CHARACTERS.warehouse.unlockHint.en));
  for (const [card, id] of [
    [wage, 'wage'],
    [student, 'student'],
    [warehouse, 'warehouse'],
  ]) {
    assert.ok(card.textContent.includes(CHARACTERS[id].defenseLine.en), `${id} defense line`);
  }
  student.fire('click');
  assert.ok(cards()[0].classList.contains('sel'), 'a locked card cannot be picked');
  assert.equal(toastTexts().at(-1), CHARACTERS.student.unlockHint.en);
  game.history.characters.student = true;
  newGameScreen();
  cards()[1].fire('click');
  assert.ok(cards()[1].classList.contains('sel'), 'unlocked survivors can be chosen');
});

test('A03 difficulty presets and six custom sliders drive the run', () => {
  assert.deepEqual(Object.keys(DIFFICULTIES), ['relaxed', 'normal', 'hard', 'outOfAmmo']);
  assert.deepEqual(Object.keys(CUSTOM_RANGES), ['prepHours', 'funds', 'zombieStrength', 'supply', 'decay', 'extremeWeather']);
  _resetStorage();
  game.history = defaultHistory();
  newGameScreen();
  const presets = labels(screens);
  for (const name of ['Relaxed', 'Normal', 'Hard', 'Out of Ammo and Food', 'Custom']) assert.ok(presets.includes(name), name);
  button(screens, /^Custom$/).fire('click');
  const sliders = inputs(screens, 'range');
  assert.equal(sliders.length, 6);
  const values = { prepHours: 12, funds: 2, zombieStrength: 2, supply: 1.5, decay: 2, extremeWeather: 0 };
  Object.values(values).forEach((v, i) => {
    sliders[i].value = String(v);
    sliders[i].fire('input');
    assert.equal(sliders[i].nextSibling.textContent, String(v), 'the slider shows its value');
  });
  button(screens, /^Start$/).fire('click');
  const s = game.state;
  for (const [k, v] of Object.entries(values)) assert.equal(s.meta.difficulty[k], v, k);
  assert.equal(s.clock.outbreakAt, 12 * HOUR, 'preparation time');
  assert.equal(s.player.money, 2000, 'starting funds');
  const m = getMods(s);
  assert.equal(m.zombieHp, 2);
  assert.equal(m.zombieCount, 2);
  assert.equal(m.supply, 1.5);
  assert.equal(m.weatherExtreme, 0);
  assert.equal(containerRate(s, bp(s)), 2, 'spoilage speed');
});

test('A04 Skip Prologue skips the opening story', () => {
  _resetStorage();
  game.history = defaultHistory();
  applySettings({ skipPrologue: false });
  newGameScreen();
  const box = inputs(screens, 'checkbox')[0];
  box.checked = true;
  box.fire('change');
  button(screens, /^Start$/).fire('click');
  assert.equal(game.state.meta.skipPrologue, true);
  assert.equal(loadSettings().skipPrologue, true, 'remembered for the next new game');
  const opened = [];
  const off = on('openPanel', (p) => opened.push(p.panel));
  tick(game.state, 120);
  off();
  assert.ok(!opened.includes('prologue'));
  applySettings({ skipPrologue: false });
});

test('A05 prologue text and one-time tutorials', () => {
  assert.match(PROLOGUE[0].en, /front door giving way/);
  assert.match(PROLOGUE[2].en, /ten hours before everything falls apart/);
  for (const name of ['map', 'cook', 'exploreMap']) {
    assert.ok(TUTORIALS[name]?.title.en && TUTORIALS[name].text.zh, `${name} tutorial`);
    registerPanel(name, () => {});
  }
  game.state = fresh({ seed: 105 });
  game.history = defaultHistory();
  applySettings({ skipPrologue: false });
  for (const name of ['map', 'cook', 'exploreMap']) {
    openPanel(name);
    assert.ok(isOpen(`tut-${name}`), `${name} tutorial on first use`);
    assert.ok(windowEl(`tut-${name}`).textContent.includes(TUTORIALS[name].text.en));
    closeWindow(`tut-${name}`);
    openPanel(name);
    assert.equal(isOpen(`tut-${name}`), false, `${name} tutorial only once`);
  }
  game.history.tutorials = {};
  applySettings({ skipPrologue: true });
  openPanel('cook');
  assert.equal(isOpen('tut-cook'), false, 'skipping the prologue skips the tutorials');
  applySettings({ skipPrologue: false });
});

test('A06 save slots, checksum backup, corrupt flag, legacy warning', () => {
  _resetStorage();
  const a = fresh({ seed: 111 });
  saveGame('slot-a', a);
  saveGame('slot-b', fresh({ seed: 112, character: 'student' }));
  assert.deepEqual(listSaves().map((x) => x.slot).sort(), ['slot-a', 'slot-b']);
  a.player.money = 4321;
  saveGame('slot-a', a);
  assert.equal(loadGame('slot-a').state.player.money, 4321);
  localStorage.setItem('survivalLog.save.slot-a', JSON.stringify({ v: 1, sum: 'tampered', data: '{}' }));
  assert.equal(listSaves().find((x) => x.slot === 'slot-a').corrupt, true, 'integrity check flags it');
  assert.equal(loadGame('slot-a').state.player.money, 1000, 'the backup copy is loaded instead');
  deleteGame('slot-a');
  assert.equal(loadGame('slot-a'), null);
  assert.deepEqual(listSaves().map((x) => x.slot), ['slot-b']);

  _resetStorage();
  const old = fresh({ seed: 113 });
  old.version = 0;
  saveGame('slot-old', old);
  game.state = null;
  titleScreen();
  button(screens, /^Continue/).fire('click');
  assert.ok(isOpen('legacy'), 'an old-version save asks first');
  assert.equal(game.state, null, 'nothing loaded yet');
  button(windowEl('legacy'), /^Confirm$/).fire('click');
  assert.equal(game.state.meta.id, old.meta.id, 'continues after confirming');
});

test('A07 global history is saved apart from runs', () => {
  _resetStorage();
  const h = defaultHistory();
  for (const k of ['achievements', 'codex', 'characters', 'endings', 'endless', 'profile']) assert.ok(k in h, k);
  h.achievements[1001] = 123;
  h.codex.food.push(2101);
  h.characters.student = true;
  h.endings.evacuate = 1;
  h.endless.best.wage = 40;
  saveHistory(h);
  saveGame('slot-h', fresh({ seed: 121 }));
  deleteGame('slot-h');
  const back = loadHistory();
  assert.equal(back.achievements[1001], 123);
  assert.deepEqual(back.codex.food, [2101]);
  assert.equal(back.characters.student, true);
  assert.equal(back.endings.evacuate, 1);
  assert.equal(back.endless.best.wage, 40);
  assert.ok(localStorage.getItem('survivalLog.history'), 'its own storage key');
  assert.equal(listSaves().length, 0);
});

test('A08/A13 settings window, hotkey list and rebinding', () => {
  _resetStorage();
  applySettings({ ...DEFAULT_SETTINGS, keys: {} });
  settingsWindow();
  let win = windowEl('settings');
  const [langSel, fpsSel] = win.querySelectorAll('select');
  assert.deepEqual(langSel.children.map((o) => o.getAttribute('value')), ['en', 'zh']);
  assert.deepEqual(fpsSel.children.map((o) => o.getAttribute('value')), ['30', '60', '120', '144', '0']);
  fpsSel.value = '144';
  fpsSel.fire('change');
  assert.equal(game.settings.fps, 144);
  assert.match(toastTexts().at(-1), /High frame rates/);
  const [master, music, sfx] = inputs(win, 'range');
  for (const [el, v] of [
    [master, 0.3],
    [music, 0.1],
    [sfx, 0.9],
  ]) {
    el.value = String(v);
    el.fire('input');
  }
  assert.deepEqual([game.settings.volume, game.settings.music, game.settings.sfx], [0.3, 0.1, 0.9]);
  let fullscreen = 0;
  document.documentElement.requestFullscreen = () => fullscreen++;
  button(win, /Borderless fullscreen/).fire('click');
  assert.equal(fullscreen, 1, 'display mode switch');
  const toggles = inputs(win, 'checkbox');
  assert.equal(toggles.length, 4);
  toggles[0].checked = false;
  toggles[0].fire('change');
  toggles[3].checked = false;
  toggles[3].fire('change');
  assert.equal(game.settings.operationTips, false);
  assert.equal(game.settings.lagOptimization, false);

  const binding = (action) => all(windowEl('settings').querySelector('.kv'), (n) => n.tagName === 'SPAN' && n.textContent === action)[0].nextSibling;
  const defaults = { inventory: 'I', phone: 'C', map: 'M', log: 'L', planning: 'N', interact: 'E', drop: 'Q', hideSearch: 'Z', relax: '`', pause: '4', speed1: '1', speed2: '2', speed3: '3', recenter: 'Space', rotateLeft: ',', rotateRight: '.', report: 'F7' };
  for (const [action, key] of Object.entries(defaults)) assert.equal(binding(action).textContent, key, `hotkey list: ${action}`);
  binding('inventory').fire('click');
  fireWindow('keydown', { key: 'j' });
  assert.equal(keyFor('inventory'), 'J');
  binding('map').fire('click');
  fireWindow('mousedown', { button: 3 });
  assert.equal(keyFor('map'), 'Mouse4');
  binding('phone').fire('click');
  fireWindow('mousedown', { button: 4 });
  assert.equal(keyFor('phone'), 'Mouse5');
  const saved = loadSettings();
  assert.deepEqual([saved.fps, saved.volume, saved.keys.inventory, saved.keys.map], [144, 0.3, 'J', 'Mouse4'], 'settings persist');
  win = windowEl('settings');
  button(win, /Reset bindings/).fire('click');
  assert.equal(keyFor('inventory'), 'I');
  assert.equal(keyFor('map'), 'M');
  const lang = windowEl('settings').querySelectorAll('select')[0];
  lang.value = 'zh';
  lang.fire('change');
  assert.equal(getLang(), 'zh');
  assert.ok(windowEl('settings').textContent.includes('语言'), 'the window redraws in Chinese');
  applySettings({ lang: 'en' });
  closeWindow('settings');
  assert.equal((windowListeners.keydown || []).length, 0, 'rebinding listeners removed on close');
  applySettings({ ...DEFAULT_SETTINGS, keys: {} });
});

test('A09 pause menu freezes time and saves', () => {
  _resetStorage();
  const s = fresh({ seed: 131 });
  game.state = s;
  game.slot = 'slot-a09';
  game.paused = false;
  setSpeed(1);
  let t = s.clock.t;
  step(0.25);
  assert.ok(s.clock.t > t);
  openPanel('pause');
  assert.equal(s.ui.modalPause, true);
  t = s.clock.t;
  step(0.25);
  step(0.25);
  assert.equal(s.clock.t, t, 'frozen while the menu is open');
  const menu = labels(windowEl('pause'));
  for (const want of ['Resume', 'Save', 'Settings', 'Survival Log', 'Codex', 'Achievements', 'Survivor Profile', 'Report an Issue (F7)', 'Save & Quit to Menu']) assert.ok(menu.includes(want), want);
  button(windowEl('pause'), /^Save$/).fire('click');
  assert.ok(loadGame('slot-a09'), 'saved from the pause menu');
  closeWindow('pause');
  step(0.25);
  assert.ok(s.clock.t > t, 'time resumes');
  s.phase = 'dead';
  t = s.clock.t;
  step(0.25);
  assert.equal(s.clock.t, t);
  game.slot = null;
});

test('A10 Report an Issue dialog', () => {
  assert.equal(keyFor('report'), 'F7');
  localStorage.removeItem('survivalLog.reports');
  game.state = fresh({ seed: 132 });
  openPanel('report');
  windowEl('report').querySelector('textarea').value = 'The door vanished on Day 3';
  button(windowEl('report'), /^Submit$/).fire('click');
  const reports = JSON.parse(localStorage.getItem('survivalLog.reports'));
  assert.equal(reports.at(-1).text, 'The door vanished on Day 3');
  assert.equal(reports.at(-1).phase, 'pre');
  assert.equal(isOpen('report'), false);
});

test('A11 Update Log red dot', () => {
  game.history = defaultHistory();
  titleScreen();
  const entry = () => button(screens, /^Update Log/);
  assert.ok(entry().textContent.endsWith('●'));
  entry().fire('click');
  assert.ok(isOpen('updatelog'));
  for (const e of UPDATE_LOG) assert.ok(windowEl('updatelog').textContent.includes(e.version));
  assert.equal(game.history.seenVersion, GAME_VERSION);
  closeWindow('updatelog');
  titleScreen();
  assert.equal(entry().textContent.includes('●'), false);
});

test('A12 title-screen radio easter egg', () => {
  titleScreen();
  const radio = all(screens, (n) => n.dataset?.tip === 'The radio on the shelf')[0];
  assert.ok(radio);
  radio.fire('click');
  assert.match(toastTexts().at(-1), /static|song you almost remember|Day 101/);
  assert.match(radio.style.transform, /^rotate\(/);
});

test('A14 music mood per home and scene', () => {
  const wage = post({ seed: 141 });
  assert.equal(currentMood(wage), 'wage:night');
  atDay(wage, 2, 12);
  assert.equal(currentMood(wage), 'wage');
  assert.equal(currentMood(atDay(post({ seed: 142, character: 'student' }), 2, 12)), 'student');
  assert.equal(currentMood(atDay(post({ seed: 143, character: 'warehouse' }), 2, 12)), 'warehouse');
  assert.equal(currentMood(post({ seed: 144, character: 'warehouse' })), 'warehouse:night');
  assert.equal(currentMood(fresh({ seed: 145 })), 'pre');
  wage.player.scene = 'explore:hospital';
  assert.equal(currentMood(wage), 'explore');
  wage.player.scene = 'home';
  wage.crises.active = [{ type: 'horde', phase: 'attack' }];
  assert.equal(currentMood(wage), 'horde');
  wage.crises.active = [];
  const { f } = installFurniture(wage, 70002, '1F:kt2');
  addItem(wage, bp(wage), 11016);
  assert.ok(placeRecord(wage, f.uid, 11016) && playTrack(wage, f.uid, 11016));
  assert.equal(currentMood(wage), 'record:2');
  wage.phase = 'dead';
  assert.equal(currentMood(wage), 'death');
  wage.phase = 'ending';
  assert.equal(currentMood(wage), 'ending');
});

// ================================================================================== B. Time, controls, camera
test('B01 countdown, day and night, Day N', () => {
  const s = fresh({ seed: 151 });
  game.state = s;
  assert.equal(formatClock(s.clock), '08:00');
  assert.equal(secondsUntilOutbreak(s), 10 * HOUR);
  updateHud(performance.now(), true);
  assert.equal(hudRoot.querySelector('.countdown').textContent, '☣ 10h 00m');
  s.clock.t = 4 * HOUR;
  assert.equal(secondsUntilOutbreak(s), 6 * HOUR);
  s.phase = 'post';
  atDay(s, 2, 12);
  assert.deepEqual([isNight(s.clock), daylight(s.clock), dayNumber(s.clock)], [false, 1, 2]);
  atDay(s, 2, 22);
  assert.equal(isNight(s.clock), true);
  atDay(s, 3, 3);
  assert.deepEqual([isNight(s.clock), daylight(s.clock), dayNumber(s.clock)], [true, 0, 3]);
  atDay(s, 100, 12);
  updateHud(performance.now(), true);
  assert.equal(hudRoot.querySelector('.day').textContent, 'Day 100');
});

test('B02 speed controls, Relaxed and pause banner', () => {
  const s = post({ seed: 152 });
  game.state = s;
  game.paused = false;
  game.slot = null;
  const advance = () => {
    const t = s.clock.t;
    step(0.25);
    return s.clock.t - t;
  };
  for (const n of [1, 2, 3]) {
    setSpeed(n);
    assert.equal(advance(), 0.25 * SPEED_SCALE[n], `${n}×`);
  }
  setSpeed(0);
  assert.equal(advance(), 0);
  updateHud(performance.now(), true);
  assert.match(hudRoot.querySelector('.pausebanner').textContent, /Paused/);
  toggleRelaxed();
  assert.deepEqual([s.clock.speed, s.clock.relaxed], [1, true], 'Relaxed also unpauses');
  assert.equal(advance(), 0.25 * RELAXED_SCALE, 'idle: slowed down');
  updateHud(performance.now(), true);
  assert.equal(hudRoot.querySelector('.pausebanner'), null);
  assert.ok(button(hudRoot.querySelector('.speed'), /^~$/).classList.contains('on'));
  enqueue(s, { kind: 'walk', target: { x: 3, y: 7, floor: '1F' }, dur: 0 });
  assert.equal(advance(), 0.25 * SPEED_SCALE[1], 'busy: normal speed');
  cancelAll(s);
  s.crises.active.push({ type: 'horde', phase: 'attack' });
  assert.equal(advance(), 0.25 * SPEED_SCALE[1], 'no slow motion under attack');
  s.crises.active = [];
  setSpeed(2);
  assert.equal(s.clock.relaxed, false, 'choosing a speed leaves Relaxed');
});

test('B03/B06 walking across floors and switching floor views', () => {
  const s = post({ seed: 153 });
  s.home.unlocked['2F'] = true;
  const fl = homeFloors(s.home.id)['2F'];
  const blocked = blockedCells(s, '2F');
  let goal = null;
  for (let y = 1; y < fl.innerH && !goal; y++) for (let x = 8; x < fl.w - 1 && !goal; x++) if (cellAt(fl, x, y) === CELL.FLOOR && !blocked.has(cellKey(x, y))) goal = [x, y];
  const floorsSeen = [];
  const off = on('floorChanged', (p) => floorsSeen.push(p.floor));
  enqueue(s, { kind: 'walk', target: { x: goal[0], y: goal[1], floor: '2F' }, dur: 0 }, { replace: true });
  tick(s, 30 * 60);
  off();
  assert.equal(s.player.floor, '2F');
  assert.deepEqual([s.player.x, s.player.y], goal);
  assert.deepEqual(floorsSeen, ['2F']);
  assert.equal(s.ui.viewFloor, '2F');
  assert.equal(homeView(s).floorId, '2F');
  game.state = s;
  updateHud(performance.now(), true);
  const tabs = hudRoot.querySelector('.floortabs');
  assert.deepEqual(labels(tabs), ['2F', '1F', 'B1']);
  assert.equal(button(tabs, /^B1$/).getAttribute('disabled'), '', 'the basement tab is locked');
  button(tabs, /^1F$/).fire('click');
  assert.equal(homeView(s).floorId, '1F', 'floor tabs switch the view');
  s.ui.viewFloor = 'B1';
  assert.equal(homeView(s).basement, true);
  const toasts = [];
  const off2 = on('toast', (t) => toasts.push(t.text));
  enqueue(s, { kind: 'walk', target: { x: 3, y: 3, floor: 'B1' }, dur: 0 }, { replace: true });
  tick(s, 60);
  off2();
  assert.equal(s.player.floor, '2F');
  assert.ok(toasts.some((t) => /Cannot reach/.test(t)));
});

test('B03 one action queue; cancelling costs nothing', () => {
  const s = post({ seed: 154 });
  keepAlive(s);
  const table = furnitureAt(s, '1F:l5');
  const pushUps = startFurnitureFunction(s, table.uid, 1719);
  const walk = enqueue(s, { kind: 'walk', target: { x: 3, y: 7, floor: '1F' }, dur: 0 });
  tick(s, 5 * 60);
  assert.equal(s.actions.current.id, pushUps.id);
  assert.deepEqual(s.actions.queue.map((a) => a.id), [walk.id], 'the next order waits');
  const sta = s.player.stats.sta;
  cancelAction(s, pushUps.id);
  assert.ok(s.player.stats.sta > sta - 1, 'no 12-stamina charge for an unfinished workout');
  assert.equal(s.player.max.sta, 100);
  tick(s, 5 * 60);
  assert.ok(isIdle(s), 'the queued walk went ahead');
});

test('B04 operation tips', () => {
  const s = post({ seed: 155 });
  game.state = s;
  game.ui = uiStub();
  applySettings({ operationTips: true });
  const table = furnitureAt(s, '1F:l5');
  openCtxMenu(table, 10, 10);
  button(document.body.querySelector('.ctxmenu'), /Push-Ups/).fire('click');
  assert.equal(game.ui.opTipText, 'Do Push-Ups → Coffee Table');
  const now = performance.now();
  updateHud(now, true);
  assert.equal(hudRoot.querySelector('.optip').textContent, 'Do Push-Ups → Coffee Table');
  updateHud(now + 3000, true);
  assert.equal(hudRoot.querySelector('.optip'), null, 'gone after a moment');
  applySettings({ operationTips: false });
  game.ui.opTipText = null;
  openCtxMenu(table, 10, 10);
  button(document.body.querySelector('.ctxmenu'), /Push-Ups/).fire('click');
  assert.equal(game.ui.opTipText, null);
  applySettings({ operationTips: true });
});

// ================================================================================== C. Survivor attributes and status
test('C01 four attributes with caps past 150', () => {
  const s = post({ seed: 161 });
  assert.deepEqual(STAT_KEYS, ['sat', 'sta', 'mor', 'life']);
  for (const k of STAT_KEYS) assert.equal(s.player.max[k], 100);
  raiseMax(s, 'mor', 55);
  assert.equal(effectiveMax(s, 'mor'), 155);
  assert.equal(s.progress.maxOver150, 1);
  addStat(s, 'mor', 500);
  assert.equal(s.player.stats.mor, 155, 'values stop at the cap');
  s.loop.abilities.heartyMeal = 2;
  bumpMods(s);
  assert.equal(effectiveMax(s, 'sat'), 130, 'abilities add to the cap');
});

test('C03 daily habits raise caps within daily limits', () => {
  const s = atDay(post({ seed: 162 }), 2, 9);
  keepAlive(s);
  const table = furnitureAt(s, '1F:l5');
  use(s, table, 1719);
  keepAlive(s);
  use(s, table, 1719);
  assert.equal(s.player.max.sta, 101, 'two workouts, +0.5 each');
  assert.equal(fn(s, table, 1719).enabled, false, 'twice a day at most');
  use(s, furnitureAt(s, '1F:k3'), 203);
  assert.equal(s.player.max.life, 100.2, 'washing hands');
  use(s, furnitureAt(s, '1F:lw1'), 80011);
  assert.equal(s.player.max.mor, 102, 'watching TV');
  const brush = addItem(s, bp(s), 11009);
  enqueue(s, useItemAction(s, s.player.backpack, brush.uid, 'use'));
  untilIdle(s);
  assert.equal(s.player.max.life, 100.4, 'brushing teeth');
  assert.notEqual(canUseNow(s, brush), true, 'once a day');
  const book = addItem(s, bp(s), 3001);
  enqueue(s, useItemAction(s, s.player.backpack, book.uid, 'read'));
  untilIdle(s);
  assert.equal(s.player.max.mor, 105, 'reading');
});

test('C04 applied status effects', () => {
  const s = post({ seed: 163 });
  addEffect(s, 'bleeding', 12);
  addEffect(s, 'shock', 12);
  useMedicine(s, bp(s), addItem(s, bp(s), 2400));
  assert.deepEqual([hasEffect(s, 'bleeding'), hasEffect(s, 'shock')], [false, true], 'a bandage cannot stop shock bleeding');
  useMedicine(s, bp(s), addItem(s, bp(s), 2401));
  assert.equal(hasEffect(s, 'shock'), false, 'the military med kit does');
  Object.assign(s.player.stats, { sat: 10, sta: 10, mor: 10 });
  tickStats(s, 60);
  assert.ok(['hungry', 'tired', 'depressed'].every((id) => hasEffect(s, id)));
  Object.assign(s.player.stats, { sat: 0, sta: 0, mor: 0 });
  tickStats(s, 60);
  assert.ok(['starving', 'exhausted', 'breakdown'].every((id) => hasEffect(s, id)));
  addEffect(s, 'caffeine', 8);
  assert.equal(moveSpeedMult(s), 1.25);
  const stale = addItem(s, bp(s), 2115, { age: 400 });
  eatItem(s, bp(s), stale);
  assert.ok(['1101', '1102', '1103', '1104', '1105'].some((id) => hasEffect(s, id)), 'expired food brings an overdue debuff');
});

test('C05 sleep length, bed quality, day/night and full refill', () => {
  const beginSleep = (s, f) => {
    const key = furnitureFunctions(s, f).find((x) => x.spec.kind === 'sleep').key;
    const a = startFurnitureFunction(s, f.uid, key);
    assert.ok(a, 'sleep queued');
    for (let i = 0; i < 60 && a.phase !== 'work'; i++) tick(s, 15);
    assert.equal(a.phase, 'work', 'reached the bed');
    return a;
  };
  const rate = (max, coeff) => (max / (6 * HOUR)) * coeff;
  const s = post({ seed: 164 });
  s.player.max.sta = 160;
  s.player.stats.sta = 30;
  const iron = furnitureAt(s, '1F:r1');
  const a = beginSleep(s, iron);
  assert.equal(a.dur, 6 * HOUR);
  assert.ok(Math.abs(a.restPerSec - rate(160, 1.1)) < 1e-9, 'single iron bed: ×1.1');
  const start = s.clock.t;
  while (s.actions.current === a) tick(s, 300);
  assert.ok(s.clock.t - start <= 6 * HOUR + 300);
  assert.ok(s.player.stats.sta > 159.9, `full, trained cap included (${s.player.stats.sta})`);

  const d = post({ seed: 165, character: 'student' });
  d.home.unlocked['2F'] = true;
  const wood = beginSleep(d, furnitureAt(d, '2F:b1'));
  assert.ok(Math.abs(wood.restPerSec - rate(100, 1.25)) < 1e-9, 'solid wood bed: ×1.25');

  const loop = { ...newLoopData(), abilities: { energyManagement: 1, lightSleeper: 1 } };
  const night = post({ seed: 166, loop });
  const n = beginSleep(night, furnitureAt(night, '1F:r1'));
  assert.ok(Math.abs(n.restPerSec - rate(100, 1.1) * 1.5 * (1 / 0.8)) < 1e-9, 'Energy Management: +50% at night');
  assert.equal(n.dur, Math.round(0.8 * 6 * HOUR), 'Light Sleeper: 20% shorter');
  const day = atDay(post({ seed: 167, loop }), 2, 13);
  day.player.stats.sta = 50;
  const dd = beginSleep(day, furnitureAt(day, '1F:r1'));
  assert.ok(Math.abs(dd.restPerSec - rate(100, 1.1) * 0.5 * (1 / 0.8)) < 1e-9, 'and −50% by day');

  const restless = post({ seed: 168 });
  addEffect(restless, 'insomnia', 8);
  const r = beginSleep(restless, furnitureAt(restless, '1F:r1'));
  assert.ok(Math.abs(r.restPerSec - rate(100, 1.1) * 0.5) < 1e-9, 'Insomnia halves it');
});

test('C08 daily wish lottery', () => {
  const s = post({ seed: 169 });
  tick(s, 11.5 * HOUR);
  assert.equal(dayNumber(s.clock), 2);
  const offer = s.run.wishOffers;
  assert.equal(offer.day, 2);
  assert.equal(offer.ids.length, 3);
  assert.ok(offer.ids.every((id) => item(id).cat === CAT.FOOD));
  tick(s, 5 * HOUR);
  assert.deepEqual(s.run.wish.items, [offer.ids[0]]);
  assert.equal(s.run.wishOffers, null);
});

test('C07/C08/C09 wish toolbar, backpack star, Mental Toughness', () => {
  const s = post({ seed: 170 });
  game.state = s;
  updateHud(performance.now(), true);
  assert.ok(!labels(hudRoot.querySelector('.toolbar')).some((t) => /Mental Toughness|💭/.test(t)));
  s.run.wishOffers = { day: s.run.day, ids: [2105, 2106, 2107] };
  s.loop.abilities.mentalToughness = 1;
  bumpMods(s);
  updateHud(performance.now(), true);
  const bar = hudRoot.querySelector('.toolbar');
  button(bar, /^💭/).fire('click');
  assert.ok(isOpen('wish'));
  button(windowEl('wish'), /^This one$/).fire('click');
  assert.deepEqual(s.run.wish.items, [2105]);
  const wished = addItem(s, bp(s), 2105);
  const other = addItem(s, bp(s), 2106);
  openPanel('backpack');
  assert.ok(byUid(windowEl('backpack'), wished.uid).querySelector('.badge.mark'), 'the wished food is starred in the backpack');
  assert.equal(byUid(windowEl('backpack'), other.uid).querySelector('.badge.mark'), null);
  closeWindow('backpack');
  s.player.stats.mor = 20;
  button(bar, /Mental Toughness/).fire('click');
  assert.equal(s.player.stats.mor, 50, '+30 Morale');
});

test('C10 all fourteen medicines', () => {
  const MEDS = { bandage: 2400, medKit: 2401, vitamins: 6, antibiotics: 2405, feverReducer: 2406, antidiarrheal: 2407, painkiller: 2408, sedative: 2409, antiAnxiety: 2410, soothing: 2411, antidote: 2412, adrenaline: 2403, stimulant: 2404, bandAid: 2509 };
  for (const [name, id] of Object.entries(MEDS)) {
    assert.equal(item(id)?.cat, CAT.MEDICINE, name);
    assert.ok(MEDICINE[id], `${name} has an effect`);
  }
  const s = post({ seed: 171 });
  const take = (id) => useMedicine(s, bp(s), addItem(s, bp(s), id));
  const cures = [
    [2405, ['fever', '1104']],
    [2406, ['fever', 'cold']],
    [2407, ['1102']],
    [2409, ['insomnia', 'tense']],
    [2410, ['mentalBlock']],
    [2412, ['1103', '1105']],
    [2509, ['bleeding']],
  ];
  for (const [id, effects] of cures) {
    for (const e of effects) addEffect(s, e, 8);
    take(id);
    for (const e of effects) assert.equal(hasEffect(s, e), false, `${item(id).zh} cures ${e}`);
  }
  s.player.stats.sta = 20;
  take(2403);
  assert.equal(s.player.stats.sta, 70, 'adrenaline');
  s.player.stats.sta = 20;
  s.player.stats.life = 80;
  take(2404);
  assert.deepEqual([s.player.stats.sta, s.player.stats.life], [55, 75], 'stimulant costs Life');
  s.player.stats.mor = 20;
  take(2408);
  take(2411);
  assert.equal(s.player.stats.mor, 33, 'painkiller and soothing capsule');
  take(6);
  assert.equal(s.player.max.life, 100.5, 'vitamins');
  const multi = addItem(s, bp(s), 2147);
  useMedicine(s, bp(s), multi);
  assert.notEqual(canUseNow(s, multi), true, 'multivitamins once a day');
  const kit = addItem(s, bp(s), 2401);
  useMedicine(s, bp(s), kit);
  assert.equal(kit.uses, 4, 'a med kit has several uses');
});

test('C11 toilet, washing, bathing and grooming', () => {
  const s = atDay(post({ seed: 172 }), 2, 9);
  keepAlive(s);
  const toilet = furnitureAt(s, '1F:b1');
  assert.match(fn(s, toilet, 212).reason, /Scrap Paper/);
  addItem(s, bp(s), 20001);
  use(s, toilet, 212);
  assert.equal(count(bp(s), 20001), 0);
  assert.equal(count(bp(s), 15501), 1, 'basic fertilizer');
  assert.equal(fn(s, toilet, 212).enabled, false, 'once a day');
  s.player.stats.life = 80;
  use(s, furnitureAt(s, '1F:b2'), 203);
  assert.equal(s.player.max.life, 100.2);
  use(s, furnitureAt(s, '1F:b3'), 207);
  assert.equal(s.player.max.life, 100.5, 'a bath');
  assert.ok(s.player.stats.life > 85);
  const soap = addItem(s, bp(s), 11011);
  const watch = addItem(s, bp(s), 31001);
  for (const inst of [soap, watch]) {
    enqueue(s, useItemAction(s, s.player.backpack, inst.uid, 'use'));
    untilIdle(s);
    assert.notEqual(canUseNow(s, inst), true, `${item(inst.id).zh}: daily limit`);
  }
  assert.equal(s.player.max.life, 100.7, 'soap');
  assert.equal(count(bp(s), 31001), 1, 'the luxury watch is never used up');
});

test('C12 smart suggestions', () => {
  const s = post({ seed: 173 });
  Object.assign(s.player.stats, { sat: 20, sta: 25, mor: 80 });
  addItem(s, bp(s), 2105);
  furnitureAt(s, '1F:door').hp = 300;
  const list = suggestions(s);
  assert.deepEqual(list.map((x) => x.id), ['eat', 'sleep', 'repair']);
  list[0].run();
  untilIdle(s);
  assert.equal(count(bp(s), 2105), 0);
  assert.ok(s.player.stats.sat > 20);
  suggestions(s)
    .find((x) => x.id === 'sleep')
    .run();
  assert.equal(s.actions.current?.kind ?? s.actions.queue[0]?.kind, 'sleep');
  tick(s, 20 * 60);
  assert.equal(s.player.sleeping, true, 'walked to the bed and lay down');
  assert.equal(s.player.floor, '1F');
});

// ================================================================================== D. Inventory, items, storage
test('D01 backpack grid and carry limit', () => {
  const s = fresh({ seed: 181 });
  const b = bp(s);
  assert.deepEqual([b.w, b.h, b.maxKg], [10, 6, 20]);
  assert.equal(bp(fresh({ seed: 182, character: 'warehouse' })).maxKg, 25);
  assert.deepEqual(item(2324).size, [6, 5]);
  assert.ok(addItem(s, b, 2324), 'a 20 kg turkey just fits');
  assert.equal(addItem(s, b, 2115), null, 'one more can is too heavy');
});

test('D02 storage furniture, fridge and freezer', () => {
  const s = post({ seed: 183 });
  const cells = (st, cfg) => storageSize(st, cfg).reduce((a, b) => a * b, 1);
  assert.ok(cells(s, 10002) < cells(s, 10001) && cells(s, 10001) < cells(s, 10000) && cells(s, 10000) < cells(s, 204), 'small < medium < large < extra large');
  assert.equal(cells(s, 70006), 80, 'tool cabinet');
  for (const cfg of [10004, 10003, 15000, 15001, 70006, 1]) assert.ok(isStorage(cfg), `${cfg} stores items`);
  const fridge = s.inventories[furnitureAt(s, '1F:k1').inv];
  assert.deepEqual([fridge.maxKg, fridge.cold], [null, 0.2]);
  s.home.unlocked.B1 = true;
  const { f: freezer } = installFurniture(s, 15001, 'B1:g2');
  assert.deepEqual([s.inventories[freezer.inv].maxKg, s.inventories[freezer.inv].cold], [null, 0.1], 'the chest freezer is colder');
  assert.ok(cells(fresh({ seed: 184, character: 'warehouse' }), 10000) > cells(s, 10000), 'the Warehouse Manager stores more');
});

test('D03 storage panel transfers and Take All', () => {
  const s = post({ seed: 185 });
  game.state = s;
  const shelf = furnitureAt(s, '1F:l3');
  const inv = s.inventories[shelf.inv];
  const crackers = addItem(s, inv, 2102);
  addItem(s, inv, 20004);
  openPanel('storage', { furn: shelf.uid });
  const win = () => windowEl(`storage-${shelf.uid}`);
  assert.equal(win().querySelectorAll('.inv-grid').length, 2, 'storage next to the backpack');
  byUid(win(), crackers.uid).fire('contextmenu');
  assert.deepEqual([count(bp(s), 2102), count(inv, 2102)], [1, 0], 'right-click');
  byUid(win(), crackers.uid).fire('mousedown', { shiftKey: true });
  assert.deepEqual([count(bp(s), 2102), count(inv, 2102)], [0, 1], 'Shift+click');
  const noodles = addItem(s, bp(s), 2105);
  refreshWindows();
  byUid(win(), noodles.uid).fire('mousedown', { ctrlKey: true });
  assert.equal((s.actions.current || s.actions.queue[0])?.kind, 'useItem', 'Ctrl+click eats it');
  button(win(), /^Take All/).fire('click');
  assert.equal(inv.items.length, 0);
  assert.equal(count(bp(s), 20004), 1);
  const sheet = bp(s).items.find((i) => i.id === 20004);
  const r = moveItem(s, bp(s), sheet.uid, bp(s), noodles.x, noodles.y);
  assert.equal(r.reason, 'size');
  assert.equal(reasonText(r.reason), 'Different sizes cannot be swapped', 'size-mismatch prompt');
  byUid(win(), sheet.uid).fire('mousedown');
  fireWindow('mouseup', { clientX: 0, clientY: 0 });
  button(win(), /^Drop \(Q\)$/).fire('click');
  assert.equal(count(bp(s), 20004), 0);
  assert.ok(floorItems(s).includes(20004), 'dropped at the survivor’s feet');
  closeAllWindows();
});

test('D04 floor boxes', () => {
  const s = post({ seed: 186 });
  const box = dropToFloor(s, addItem(s, bp(s), 2102), '1F', 5, 7);
  assert.equal(dropToFloor(s, addItem(s, bp(s), 2105), '1F', 6, 7), box, 'the same box next to it');
  assert.notEqual(dropToFloor(s, addItem(s, bp(s), 2106), '1F', 1, 5), box, 'a new box further away');
  assert.equal(s.floorBoxes.length, 2);
  s.inventories[box.inv].items = [];
  tick(s, 4 * HOUR);
  assert.equal(s.floorBoxes.length, 1, 'empty boxes are cleared overnight');
});

test('D05 storage tags and Store by Tag', () => {
  const tags = furnitureTags();
  assert.equal(tags.length, 19);
  assert.equal(loc(tags.find((t) => t.ID === 1019).TagName_Local), 'Fertilizer');
  const cases = { 1001: 2115, 1006: 2530, 1007: 15026, 1009: 2400, 1012: 20004, 1013: 40000, 1016: 14039, 1019: 15501 };
  for (const [tag, id] of Object.entries(cases)) assert.ok(itemMatchesTag(Number(tag), item(id)), `${id} under tag ${tag}`);
  assert.equal(itemMatchesTag(1009, item(2102)), false);
  const s = post({ seed: 187 });
  game.state = s;
  const shelf = furnitureAt(s, '1F:l3');
  const inv = s.inventories[shelf.inv];
  for (const id of [2400, 2406, 2102]) addItem(s, bp(s), id);
  openPanel('storage', { furn: shelf.uid });
  const sel = windowEl(`storage-${shelf.uid}`).querySelector('select');
  assert.equal(sel.children.length, 20, 'no label + 19 tags');
  sel.value = '1009';
  sel.fire('change');
  button(windowEl(`storage-${shelf.uid}`), /^Store all "Medicine"$/).fire('click');
  assert.equal(count(inv, 2400) + count(inv, 2406), 2);
  assert.equal(count(bp(s), 2102), 1, 'food stays in the backpack');
  closeAllWindows();
});

test('D06 item categories and food sub-categories', () => {
  assert.deepEqual(Object.keys(CAT), ['FOOD', 'MEDICINE', 'BOOK', 'CONSOLE', 'DAILY', 'TOOL', 'PACK', 'MATERIAL', 'SEED', 'FERTILIZER', 'TRAP', 'FUEL', 'FURNITURE_PACKAGE', 'FLOWER', 'DEFENSE']);
  for (const [name, id] of Object.entries(CAT)) assert.ok(allItemsOfCat(id).length > 0, name);
  const food = allItemsOfCat(CAT.FOOD);
  for (let sub = 1; sub <= 11; sub++) {
    assert.ok(food.some((c) => c.sub === sub), `food sub-category ${sub}`);
    assert.ok(subCategoryName(sub), `named sub-category ${sub}`);
  }
});

test('D07 spoilage multipliers, Expiring Soon, Requires Fridge', () => {
  const s = post({ seed: 188 });
  const fridgeF = furnitureAt(s, '1F:k1');
  const fridge = s.inventories[fridgeF.inv];
  assert.equal(containerRate(s, bp(s)), 1);
  assert.equal(containerRate(s, fridge), 0.2);
  fridgeF.powered = false;
  assert.equal(containerRate(s, fridge), 1, 'a dead fridge is just a cupboard');
  fridgeF.powered = true;
  fridgeF.on = false;
  assert.equal(containerRate(s, fridge), 1, 'switched off too');
  fridgeF.on = true;
  assert.equal(containerRate(fresh({ seed: 189, difficulty: 'hard' }), bp(fresh({ seed: 189, difficulty: 'hard' }))), 1.2, 'hard spoils faster');
  assert.equal(isExpiringSoon(addItem(s, bp(s), 2125, { age: 4.2 })), true);
  assert.equal(isExpiringSoon(addItem(s, bp(s), 2125)), false);
  assert.equal(needsFridge(item(2530)), true);
  assert.equal(needsFridge(item(2115)), false);
  const spinach = addItem(s, fridge, 2530);
  const warm = addItem(s, bp(s), 2530);
  tickSpoilage(s, 5 * 86400);
  assert.ok(warm.age > 4.9 && spinach.age < 1.1, 'five days: fresh in the fridge, nearly gone outside');
});

test('D08 mold crisis and disinfectant sprays', () => {
  const s = post({ seed: 190 });
  const fridgeF = furnitureAt(s, '1F:k1');
  const fridge = s.inventories[fridgeF.inv];
  const can = addItem(s, fridge, 2115);
  fridge.moldy = true;
  tickSpoilage(s, 3 * 86400);
  assert.ok(fridge.moldLevel > 0.5);
  assert.equal(can.mold, 1, 'food in there turns moldy');
  assert.ok(s.crises.mold, 'Mold Crisis');
  const wardrobe = s.inventories[furnitureAt(s, '1F:r3').inv];
  addItem(s, wardrobe, 2166);
  addItem(s, bp(s), 2164);
  keepAlive(s);
  use(s, fridgeF, 2006);
  assert.equal(fridge.moldy, false);
  assert.equal(can.mold, 0);
  assert.equal(s.crises.mold, null, 'crisis over');
  assert.deepEqual([wardrobe.items.find((i) => i.id === 2166)?.uses, count(bp(s), 2164)], [item(2166).uses - 1, 1], 'the concentrated spray went first, one use of it');
});

test('D09 multi-use items and servings badge', () => {
  const s = post({ seed: 191 });
  game.state = s;
  const biscuits = addItem(s, bp(s), 2101);
  const full = instWeightG(biscuits);
  s.player.stats.sat = 10;
  eatItem(s, bp(s), biscuits);
  eatItem(s, bp(s), biscuits);
  assert.equal(biscuits.uses, 8);
  assert.equal(count(bp(s), 2101), 1);
  assert.ok(instWeightG(biscuits) < full, 'lighter as it empties');
  openPanel('backpack');
  const el = byUid(windowEl('backpack'), biscuits.uid);
  assert.equal(el.querySelector('.badge.uses').textContent, '8');
  assert.match(el.dataset.tip, /8 servings left/);
  closeWindow('backpack');
  for (let i = 0; i < 8; i++) eatItem(s, bp(s), biscuits);
  assert.equal(count(bp(s), 2101), 0);
});

test('D10 cutting a whole turkey', () => {
  for (const id of [2318, 2319, 2322, 2323, 2324]) assert.ok(item(item(id).cut), `${id} can be cut`);
  const s = post({ seed: 192 });
  const turkey = addItem(s, bp(s), 2324, { age: 1.5 });
  assert.equal(itemOps(s, turkey)[0].op, 'cut');
  enqueue(s, useItemAction(s, s.player.backpack, turkey.uid, 'cut'));
  untilIdle(s);
  assert.equal(count(bp(s), 2324), 0);
  const chunks = bp(s).items.filter((i) => i.id === 2331);
  assert.equal(chunks.reduce((n, i) => n + (i.qty || 1), 0) + floorItems(s).filter((id) => id === 2331).length, 10);
  assert.ok(chunks.every((c) => c.age >= 1.5 && c.age < 1.6), 'chunks carry the turkey’s age');
  const small = post({ seed: 193 });
  bp(small).w = 6;
  bp(small).h = 5;
  const bird = addItem(small, bp(small), 2324);
  addItem(small, createInventory(small, { kind: 'box', w: 1, h: 1 }), 2102);
  assert.equal(cutItem(small, bp(small), bird).length, 10, 'every chunk lands somewhere');
});

test('D11 opening packs', () => {
  const s = post({ seed: 194 });
  const open = (id) => openPack(s, bp(s), addItem(s, bp(s), id));
  const mats = open(13001);
  assert.equal(mats.length, 8);
  assert.ok(mats.every((id) => item(id).cat === CAT.MATERIAL));
  assert.deepEqual(open(11004), Array(6).fill(2131));
  const gift = open(11007);
  assert.equal(gift.length, 4);
  assert.ok(gift.every((id) => item(id).cat === CAT.FOOD));
  assert.equal(count(bp(s), 13001), 0, 'the pack is gone');
  const food = addItem(s, bp(s), 11003);
  assert.ok(itemOps(s, food).some((o) => o.op === 'open'));
  enqueue(s, useItemAction(s, s.player.backpack, food.uid, 'open'));
  untilIdle(s);
  assert.equal(count(bp(s), 11003), 0);
});

test('D12 Find Supplies panel', () => {
  const s = post({ seed: 195 });
  game.state = s;
  game.ui = uiStub();
  const fridge = furnitureAt(s, '1F:k1');
  const wardrobe = furnitureAt(s, '1F:r3');
  addItem(s, s.inventories[fridge.inv], 2530);
  addItem(s, s.inventories[wardrobe.inv], 2400);
  addItem(s, s.inventories[wardrobe.inv], 11009);
  const listed = (cat) => {
    s.ui.searchCat = cat;
    updateHud(performance.now(), true);
    return hudRoot.querySelector('.searchpanel').querySelectorAll('div').map((d) => d.textContent);
  };
  updateHud(performance.now(), true);
  const options = hudRoot.querySelector('.searchpanel select').children.map((o) => o.textContent);
  for (const o of ['Food', 'Requires Fridge', 'Medicine', 'Sundries']) assert.ok(options.includes(o), o);
  assert.ok(listed('fridge').includes('1F · Side-by-Side Refrigerator ×1'));
  assert.ok(game.ui.renderer.highlight.has(fridge.uid), 'highlighted in the scene');
  assert.ok(listed('medicine').some((t) => t.startsWith('1F · Wardrobe')));
  assert.ok(listed('sundry').some((t) => t.startsWith('1F · Wardrobe')));
  s.ui.hideSearch = true;
  updateHud(performance.now(), true);
  assert.equal(hudRoot.querySelector('.searchpanel'), null);
});

test('D14 item detail tooltip', () => {
  const s = post({ seed: 196 });
  const tip = itemTooltip(addItem(s, bp(s), 2115));
  for (const part of ['Canned Luncheon Meat', 'Satiety +20', '1.00 kg · 2×1', '360.0 / 360 days', 'Trade value 28 · $30']) assert.ok(tip.includes(part), part);
});

// ================================================================================== E. Pre-disaster phase
test('E01 countdown length by difficulty', () => {
  const hours = (opts) => fresh({ seed: 201, ...opts }).clock.outbreakAt / HOUR;
  assert.equal(hours({}), 10);
  assert.equal(hours({ difficulty: 'relaxed' }), 11);
  assert.equal(hours({ difficulty: 'hard' }), 8);
  assert.equal(hours({ difficulty: 'outOfAmmo' }), 6.5);
  assert.equal(hours({ difficulty: 'normal', custom: { prepHours: 5 } }), 5);
  assert.equal(hours({ loop: { ...newLoopData(), abilities: { earlyBird: 2 } } }), 11);
  assert.equal(formatClock(fresh({ seed: 202, difficulty: 'hard' }).clock), '10:00', 'the outbreak is still at 18:00');
});

test('E02 starting money, wallet and loan', () => {
  for (const [character, money, wallet] of [
    ['wage', 1000, 70],
    ['student', 1500, 50],
    ['warehouse', 1200, 40],
  ]) {
    const s = fresh({ seed: 203, character });
    assert.equal(s.player.money, money, character);
    takeWallet(s);
    takeLoan(s);
    assert.equal(s.player.money, money + wallet + 500);
  }
});

test('E04 supply points, wings, gas station, furniture buyer', () => {
  assert.deepEqual([...SUPPLY_POINTS].sort(), ['carlot', 'convenience', 'farmers', 'hardware', 'market', 'renovation']);
  assert.ok(LOCATIONS.blackmarket && !LOCATIONS.blackmarket.supply);
  const s = fresh({ seed: 204 });
  for (const id of Object.keys(SHOPS)) {
    arriveAt(s, id);
    for (const f of SHOPS[id].fixtures.filter((x) => x.kind === 'shelf')) assert.ok(shelfOffers(s, id, f.id).length > 0, `${id}/${f.id} is stocked`);
  }
  const wings = ['living', 'kitchenBath', 'decor', 'appliances', 'security'];
  assert.deepEqual(SHOPS.renovation.floor.rooms.map((r) => r.id).sort(), [...wings].sort());
  arriveAt(s, 'carlot');
  assert.ok(shelfOffers(s, 'carlot', 'roadTrip').some((o) => o.id === 40000), 'diesel at the pump');
  assert.deepEqual([SHOP_NPCS.furnitureBuyer.shop, SHOP_NPCS.furnitureBuyer.action], ['renovation', 'pawn']);
});

test('E05 shopping cart shows the trunk load', () => {
  const s = fresh({ seed: 205 });
  arriveAt(s, 'carlot');
  assert.ok(buyCar(s, 'sedan').ok);
  arriveAt(s, 'market');
  assert.equal(buildView(s).boxes.length, 0, 'empty trunk, empty cart');
  assert.ok(buy(s, 'market', 'staples', 2103, { dest: 'trunk' }).ok);
  assert.equal(buildView(s).boxes.length, 1);
  while (addItem(s, trunkInv(s), 2115));
  assert.equal(buildView(s).boxes.length, 3, 'a full trunk piles high');
});

test('E06 heavy motorcycle purchase and ride', () => {
  const s = fresh({ seed: 206 });
  arriveAt(s, 'carlot');
  const bike = shelfOffers(s, 'carlot', 'motorcycle').find((o) => o.id === 14083);
  assert.ok(bike?.pkg);
  assert.ok(buy(s, 'carlot', 'motorcycle', 14083).ok);
  assert.equal(s.player.money, 1000 - bike.unit);
  assert.equal(count(doorstepInv(s), 14083), 1);
  finishPreparation(s);
  s.home.unlocked['2F'] = true;
  const slot = slotsFor(s, 9307)[0];
  const { f } = installFurniture(s, 9307, slot.id);
  const ride = furnitureFunctions(s, f).find((x) => x.spec.ride);
  assert.ok(ride?.enabled);
  keepAlive(s);
  use(s, f, ride.key);
  assert.equal(s.player.max.mor, 102);
});

test('E09 dismantling starter furniture', () => {
  const s = fresh({ seed: 207 });
  for (const [slot, want] of [
    ['1F:l2', [20005, 20003]],
    ['1F:l6', [20004, 20001, 20003]], // material pile (9126): its RemoveGet
    ['1F:l4', [20001, 20004]], // scattered newspapers (9130)
  ]) {
    const f = furnitureAt(s, slot);
    const d = furnitureFunctions(s, f).find((x) => x.spec.kind === 'dismantle');
    assert.ok(d?.enabled, `${slot} can be dismantled`);
    keepAlive(s);
    use(s, f, d.key);
    assert.equal(furnitureAt(s, slot), null);
    for (const id of want) assert.ok(floorItems(s).includes(id), `${slot} leaves ${id}`);
  }
  assert.notEqual(s.progress.taboo.brokeSomething, true, 'clearing out before the outbreak breaks no taboo');
});

// ================================================================================== F. Safehouse
test('F01 the three homes', () => {
  const rooms = (home, floor) => HOMES[home].floors[floor].rooms.map((r) => r.id);
  const windows = (home) => HOMES[home].slots.filter((s) => s.type === SLOT.WINDOW).length;
  assert.deepEqual(Object.keys(HOMES.apartment.floors), ['1F', '2F', 'B1']);
  assert.ok(rooms('apartment', '2F').includes('terrace') && HOMES.apartment.floors['2F'].rooms.find((r) => r.id === 'terrace').outdoor);
  assert.equal(windows('apartment'), 3);
  assert.deepEqual(Object.keys(HOMES.duplex.floors), ['1F', '2F', 'B1']);
  assert.equal(HOMES.duplex.floors['2F'].label.en, 'Loft');
  assert.ok(['loft', 'balcony', 'sunroom'].every((r) => rooms('duplex', '2F').includes(r)));
  const wh = HOMES.warehouse;
  assert.ok(['hallA', 'hallB', 'cold'].every((r) => rooms('warehouse', '1F').includes(r)));
  assert.ok(['cabin', 'garage'].every((r) => rooms('warehouse', 'B1').includes(r)));
  assert.ok(wh.floors['1F'].yard, 'a yard in front');
  const homeOf = (c) => fresh({ seed: 208, character: c }).home.id;
  assert.deepEqual(['wage', 'student', 'warehouse'].map(homeOf), ['apartment', 'duplex', 'warehouse']);
});

test('F03 Planning Mode slots by type and install', () => {
  for (const t of Object.values(SLOT).filter((v) => v !== SLOT.NONE)) assert.notEqual(slotTypeName(t), '?', `slot type ${t} is named`);
  for (const home of Object.values(HOMES)) {
    const types = new Set(home.slots.map((sl) => sl.type));
    for (const t of [SLOT.SMALL, SLOT.MEDIUM, SLOT.LARGE, SLOT.WALL, SLOT.TABLETOP, SLOT.BED, SLOT.DOOR, SLOT.WINDOW, SLOT.DEFENSE]) assert.ok(types.has(t), `${home.id} has type ${t}`);
    assert.ok(home.slots.some((sl) => sl.trap), `${home.id} has trap slots`);
  }
  assert.ok(slotAccepts(SLOT.LARGE, SLOT.SMALL) && !slotAccepts(SLOT.SMALL, SLOT.LARGE) && !slotAccepts(SLOT.WALL, SLOT.SMALL));
  const s = post({ seed: 209 });
  game.state = s;
  game.ui = uiStub();
  const pkg = addItem(s, bp(s), 14042);
  openPanel('planning');
  const pills = windowEl('planning').querySelectorAll('.pill').map((p) => p.textContent);
  for (const t of ['Small', 'Medium', 'Large', 'Wall', 'Tabletop', 'Bed', 'Door', 'Window', 'Defense Line']) assert.ok(pills.some((p) => p.startsWith(t)), t);
  assert.ok(pills.some((p) => p.includes('🪤')), 'trap slots are marked');
  windowEl('planning')
    .querySelectorAll('.list-item')
    .find((li) => li.textContent.startsWith('Nightstand'))
    .fire('click');
  assert.ok(game.ui.renderer.highlight.size > 0, 'valid slots light up');
  button(windowEl('planning'), /^Install$/).fire('click');
  const a = s.actions.queue.at(-1);
  assert.deepEqual([a.kind, a.pkgUid], ['install', pkg.uid]);
  closeWindow('planning');
  assert.equal(s.ui.planning, false);
  untilIdle(s);
  assert.equal(furnitureAt(s, a.slotId)?.cfg, 10003);
});

test('F04 furniture functions from config', () => {
  const kinds = { 2: 'sleep', 4: 'nap', 1719: 'stat', 35: 'stat', 11: 'stat', 12: 'stat', 219: 'open', 8: 'radio', 7: 'lookout', 207: 'stat', 208: 'iceBath', 212: 'toilet', 203: 'stat', 213: 'makeItem', 251: 'makeItem', 30: 'repair', 218: 'reinforce', 299: 'dismantle', 227: 'recycle', 1754: 'drone', 1730: 'unlockArea' };
  for (const [id, kind] of Object.entries(kinds)) assert.equal(FUNC_SPECS[id]?.kind, kind, `func ${id}`);
  const s = atDay(post({ seed: 210 }), 2, 10);
  keepAlive(s);
  const tub = furnitureAt(s, '1F:b3');
  assert.match(fn(s, tub, 208).reason, /Ice Cubes/, 'the ice bath takes ice');
  addItem(s, bp(s), 2507);
  addItem(s, bp(s), 2507);
  assert.match(fn(s, tub, 208).reason, /≤ 40/, 'and a worn-out survivor');
  Object.assign(s.player.stats, { sat: 30, sta: 30 });
  const before = s.player.stats.mor;
  use(s, tub, 208);
  assert.ok(s.player.stats.mor >= before + 24 && s.player.stats.sta >= 58);
  assert.equal(s.progress.counters['bath.ice'], 1);
  const fridge = furnitureAt(s, '1F:k1');
  use(s, fridge, 213);
  assert.equal(count(bp(s), 2906), 2, 'ice cubes from the fridge (2906, the config’s fridge-made ice; BUG-0018)');
  assert.equal(fn(s, fridge, 213).enabled, false, 'once a day');
  const radio = furnitureAt(s, '1F:lt1');
  const heard = [];
  const off = on('radio', () => heard.push(1));
  use(s, radio, furnitureFunctions(s, radio)[0].key);
  off();
  assert.equal(heard.length, 1);
});

test('F05 action tooltips preview changes', () => {
  const s = post({ seed: 211 });
  game.state = s;
  openCtxMenu(furnitureAt(s, '1F:l5'), 10, 10);
  const tip = button(document.body.querySelector('.ctxmenu'), /Push-Ups/).dataset.tip;
  for (const part of ['Stamina -12', 'Satiety -3', 'Morale +2', 'Max Stamina +0.5', '30min']) assert.ok(tip.includes(part), part);
  const door = furnitureAt(s, '1F:door');
  door.hp = 640;
  openCtxMenu(door, 10, 10);
  const menu = document.body.querySelector('.ctxmenu');
  assert.ok(menu.textContent.includes('Durability 640 / 1000'));
  assert.ok(button(menu, /^Fix Door/).dataset.tip.includes('Stamina -10'));
  assert.ok(menu.textContent.includes('Needs 1× Door Patch Kit'), 'disabled actions say why');
});

test('F06 objective list', () => {
  const s = fresh({ seed: 212 });
  game.state = s;
  updateHud(performance.now(), true);
  const box = hudRoot.querySelector('.objectives');
  assert.equal(box.querySelector('h4').textContent, 'Objectives');
  const items = box.querySelectorAll('.objective');
  assert.ok(items.length >= 7 && items.length <= 12, `${items.length} objectives`);
  assert.match(items[0].textContent, /Outbreak in 10h 00m/);
  assert.ok(items.some((o) => /^Stockpile supplies\d+\.\d \/ 5 kg$/.test(o.textContent)), 'progress line');
  items.find((o) => /wallet/.test(o.textContent)).fire('click');
  assert.equal(s.actions.queue.at(-1)?.kind, 'preMoney');
  takeWallet(s);
  updateHud(performance.now(), true);
  assert.ok(hudRoot.querySelectorAll('.objective').find((o) => /wallet/.test(o.textContent)).classList.contains('done'));
});

test('F07 door and window repair and reinforcement', () => {
  const s = post({ seed: 213 });
  const door = furnitureAt(s, '1F:door');
  const run = (key, need) => {
    if (need) addItem(s, bp(s), need);
    keepAlive(s);
    use(s, door, key);
  };
  door.hp = 300;
  run(30);
  assert.equal(door.hp, 400);
  addItem(s, bp(s), 20300);
  assert.equal(fn(s, door, 221).reason, 'Learn it first (quest)', 'Advanced Repair is learned first in the first loop');
  s.loop.ngPlus = true; // New Game+ uses it right away (patch 09-04)
  run(221);
  s.loop.ngPlus = false;
  assert.equal(door.hp, 900);
  door.hp = 1000;
  for (let i = 0; i < 6; i++) run(218, 20004);
  assert.deepEqual([door.reinforce, effectiveMaxHp(door), door.hp], [300, 1300, 1300]);
  addItem(s, bp(s), 20004);
  assert.equal(fn(s, door, 218).reason, 'Limit Reached');
  addItem(s, bp(s), 20310);
  assert.equal(fn(s, door, 224).reason, 'Learn it first (quest)');
  s.story.tags.advancedReinforce = true;
  run(224);
  run(236, 20311);
  assert.equal(door.reinforce, 900);
  for (let i = 0; i < 3; i++) run(224, 20310);
  assert.equal(effectiveMaxHp(door), 2500);
  addItem(s, bp(s), 20310);
  assert.equal(fn(s, door, 224).reason, 'Limit Reached');
  const win = furnitureAt(s, '1F:win1');
  win.hp = 500;
  addItem(s, bp(s), 20301);
  keepAlive(s);
  use(s, win, 222);
  assert.equal(win.hp, 1000, 'windows take their own patch kit');
});

test('F11 leisure and decor furniture', () => {
  const s = atDay(post({ seed: 214 }), 2, 9);
  s.home.unlocked['2F'] = true;
  s.home.unlocked.B1 = true;
  const place = (cfg) => {
    const slot = slotsFor(s, cfg).find((sl) => !sl.trap && canInstall(s, cfg, sl.id).ok);
    assert.ok(slot, `a free slot for ${cfg}`);
    return installFurniture(s, cfg, slot.id).f;
  };
  for (const cfg of [20003, 70003, 70005, 9309, 9301, 9302, 9303, 9311]) {
    const f = place(cfg);
    const fun = furnitureFunctions(s, f).find((x) => x.enabled && (x.spec.gain?.mor || 0) > 0);
    assert.ok(fun, `${cfg} offers something to enjoy`);
    keepAlive(s);
    s.player.stats.mor = 40;
    use(s, f, fun.key);
    assert.ok(s.player.stats.mor > 40, `${cfg}: ${fun.label}`);
    if (cfg === 9311) {
      use(s, f, 1774);
      assert.equal(f.data.wound, true, 'wound up');
    }
  }
  assert.equal(consoleAtHome(s), null);
  addItem(s, bp(s), 5);
  assert.equal(consoleAtHome(s), 5, 'a console at home lets the TV play games');
});

// ================================================================================== late: modules that bring in the rebirth and settlement systems
test('E13 spending Planning Points before the outbreak', async () => {
  const { buyAbility } = await import('../src/sim/rebirth.js');
  const s = fresh({ seed: 221 });
  s.loop.planningPoints = 100;
  const kg = bp(s).maxKg;
  const r = buyAbility(s, 'broadShoulders');
  assert.ok(r.ok);
  assert.equal(s.loop.planningPoints, 100 - r.cost);
  assert.equal(bp(s).maxKg, kg + 5, 'applies before the outbreak');
});

test('F09 Survival Log journal tabs and tear-off', async () => {
  await import('../src/ui/journalPanel.js');
  const loop = {
    ...newLoopData(),
    cycle: 2,
    planningPoints: 30,
    memories: [{ id: 'blackout', text: { en: 'The grid died on Day 7.', zh: '第7天停电。' }, day: 7, cycle: 1 }],
    history: [{ cycle: 1, character: 'wage', day: 12, cause: 'life', points: 40 }],
  };
  const s = post({ seed: 222, loop });
  game.state = s;
  openPanel('journal');
  const tabs = () => windowEl('journal').querySelector('.tabs');
  assert.deepEqual(labels(tabs()), ['Rounds', '✂ Tear Up This Round and Rewrite', 'Abilities', 'Memories', 'Proficiency', 'Stats']);
  assert.ok(windowEl('journal').textContent.includes('Loop 1') && windowEl('journal').textContent.includes('Day 12'), 'earlier loops');
  button(tabs(), /^Memories$/).fire('click');
  assert.ok(windowEl('journal').textContent.includes('The grid died on Day 7.'));
  button(tabs(), /^Abilities$/).fire('click');
  assert.ok(windowEl('journal').textContent.includes('Quick Rest'));
  button(tabs(), /Tear Up/).fire('click');
  assert.ok(isOpen('loopConfirm'), 'tearing up asks first');
  button(windowEl('loopConfirm'), /^Cancel$/).fire('click');
  closeWindow('journal');
  assert.equal(s.ui.modalPause, false);
});

test('A09 results screen asks for confirmation', async () => {
  const { showDeathScreen } = await import('../src/ui/deathScreen.js');
  const s = post({ seed: 223 });
  game.state = s;
  Object.assign(s.player.stats, { sat: 0, life: 0.01 });
  tick(s, 60);
  assert.equal(s.phase, 'dead');
  showDeathScreen();
  for (const choice of [/^Rebirth$/, /^Main menu$/]) {
    button(screens, choice).fire('click');
    assert.ok(isOpen('loopConfirm'), `${choice} asks first`);
    assert.equal(game.state, s);
    button(windowEl('loopConfirm'), /^Cancel$/).fire('click');
    assert.equal(isOpen('loopConfirm'), false);
  }
  closeAllWindows();
});
