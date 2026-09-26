// Boot: DOM layers, renderer, input, main loop.
import { game, step, setSpeed, toggleRelaxed, saveRun } from './game.js';
import { on, emit } from './engine/bus.js';
import { IsoRenderer } from './render/iso.js';
import { ThreeRenderer, webgl2Supported } from './render3d/index.js';
import { registerRenderer, createRenderer } from './contracts/render.js';
import { buildView } from './ui/view.js';
import { initWindows, initTooltip, initToasts, toast, closeTopWindow, anyModalOpen, refreshWindows, refreshWindowsSoon, isOpen, closeWindow, escapeHtml } from './ui/dom.js';
import { initHud, updateHud, showHud } from './ui/hud.js';
import { initMenus, titleScreen, keyFor, actionForBinding } from './ui/menus.js';
import { openPanel, toggleBackpack, takeAllHotkey } from './ui/panels.js';
import { openCtxMenu, closeCtxMenu, isCtxOpen, storageTagLabel } from './ui/ctxmenu.js';
import { enqueue } from './sim/actions.js';
import { pickLang } from './engine/i18n.js';
import { dropToFloor, furnLabel } from './sim/home.js';
import { hovered } from './ui/invgrid.js';
import { furnitureFunctions, startFurnitureFunction } from './sim/furnActions.js';
import './systems.js';
import { isPlanter, isDecor, startFarmSmartAction } from './sim/farming.js';
import { claimStoryItems } from './sim/explore.js';

const canvas = document.getElementById('scene');
// Renderer switch: `?render=<id>` picks a registered renderer (src/contracts/render.js). The three.js renderer is the
// default wherever WebGL2 runs; the Canvas renderer is the fallback and stays available as `?render=2d`.
const gl2 = webgl2Supported();
registerRenderer({ id: '2d', label: 'Canvas 2D', isDefault: !gl2, create: (c) => new IsoRenderer(c) });
registerRenderer({ id: '3d', label: 'three.js', isDefault: gl2, create: (c) => new ThreeRenderer(c), supported: webgl2Supported });
// the Graphics setting picks the Canvas renderer ('classic') unless the address asks for one
const search = new URLSearchParams(globalThis.location?.search || '');
if (!search.get('render') && game.settings.graphics === 'classic') search.set('render', '2d');
const { id: renderMode, renderer } = createRenderer(canvas, search);
on('thunder', () => renderer.lightning());
// bursts at the pieces the sim names (a renderer without effects ignores them)
const fx = (/** @type {string} */ kind, /** @type {{ uid?: number | string, slot?: string }} */ at) => /** @type {any} */ (renderer).effect?.(kind, at);
on('defenseHit', (p) => fx(p?.device === 'net' ? 'zap' : 'hit', { slot: p?.slot }));
on('chainsawHit', (p) => fx('saw', { slot: p?.slot }));
on('defenseBroken', (p) => fx('break', { slot: p?.slot }));
on('repaired', (p) => fx('dust', { uid: p?.furn }));
on('furnitureInstalled', (p) => fx('dust', { uid: p?.uid }));
on('installed', (p) => fx('dust', { slot: p?.slot }));
on('droneDispatched', (p) => fx('droneOut', { uid: p?.uid }));
on('droneReturned', (p) => fx('droneBack', { uid: p?.uid }));
initWindows(document.getElementById('windows'));
initTooltip(document.body);
initToasts(document.body);
initHud(document.getElementById('hud'));
initMenus(document.getElementById('screens'));

game.ui = {
  renderer,
  renderMode,
  opTip(text) {
    game.ui.opTipText = text;
    game.ui.opTipAt = performance.now();
  },
  recenter() {
    const s = game.state;
    if (!s) return;
    renderer.cam.follow = true;
    const v = buildView(s);
    if (v.focus) renderer.centerOn(v.focus.x, v.focus.y);
    else renderer.centerOn(s.player.px ?? s.player.x, s.player.py ?? s.player.y);
  },
};

function resize() {
  renderer.resize();
}
window.addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------------------ events -> UI
on('toast', ({ text, kind }) => toast(text, kind));
on('enterGame', () => {
  showHud(true);
  game.ui.recenter();
  updateHud(performance.now(), true);
});
on('leaveGame', () => showHud(false));
on('actionDone', () => (game.settings.lagOptimization ? refreshWindowsSoon() : refreshWindows()));

// ------------------------------------------------------------------------------ input
let dragging = null;
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 3 || e.button === 4) return;
  dragging = { x: e.clientX, y: e.clientY, cx: renderer.cam.x, cy: renderer.cam.y, moved: false, button: e.button };
});
window.addEventListener('mousemove', (e) => {
  const s = game.state;
  if (dragging) {
    const dx = e.clientX - dragging.x;
    const dy = e.clientY - dragging.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) dragging.moved = true;
    if (dragging.moved) {
      renderer.cam.follow = false;
      renderer.cam.x = dragging.cx - dx / renderer.cam.zoom;
      renderer.cam.y = dragging.cy - dy / renderer.cam.zoom;
    }
    return;
  }
  if (!s || e.target !== canvas) return;
  const view = buildView(s);
  const [wx, wy] = renderer.toWorld(e.clientX, e.clientY);
  const hit = renderer.pick(view, wx, wy);
  renderer.hover = hit.furn ? { furn: hit.furn.uid } : hit.box ? { box: hit.box.id } : { tile: true, x: hit.tile[0], y: hit.tile[1] };
  const tag = hit.furn && s.player.scene === 'home' ? storageTagLabel(s, hit.furn) : '';
  if (tag) canvas.dataset.tip = `${escapeHtml(furnLabel(hit.furn))} · 🏷 ${escapeHtml(tag)}`;
  else delete canvas.dataset.tip;
});
window.addEventListener('mouseup', (e) => {
  const d = dragging;
  dragging = null;
  if (!d || d.moved || e.target !== canvas) return;
  const s = game.state;
  if (!s || s.phase === 'dead' || s.phase === 'ending') return;
  if (isCtxOpen()) {
    closeCtxMenu();
    return;
  }
  const view = buildView(s);
  const [wx, wy] = renderer.toWorld(e.clientX, e.clientY);
  if (view.onClick && view.onClick(wx, wy, e) !== false) return;
  const hit = renderer.pick(view, wx, wy);
  if (hit.furn) {
    openCtxMenu(hit.furn, e.clientX, e.clientY, view.extraMenu?.(hit.furn) || []);
    return;
  }
  if (hit.box) {
    openPanel('floorItems', { box: hit.box.id });
    return;
  }
  const [tx, ty] = hit.tile;
  const floor = view.floorId || s.player.floor;
  if (e.button === 0) {
    enqueue(s, { kind: 'walk', label: pickLang({ en: 'Walk', zh: '移动' }), target: { x: tx, y: ty, floor }, dur: 0 }, { replace: !e.shiftKey });
  }
});
// touch: one finger pans, two pinch to zoom (a tap arrives as the browser's mouse events, handled above)
canvas.style.touchAction = 'none';
/** @type {{ x: number, y: number, cx: number, cy: number, dist: number, zoom: number } | null} */
let touch = null;
const touchState = (/** @type {TouchEvent} */ e) => {
  const [a, b] = [e.touches[0], e.touches[1]];
  const x = b ? (a.clientX + b.clientX) / 2 : a.clientX;
  const y = b ? (a.clientY + b.clientY) / 2 : a.clientY;
  return { x, y, cx: renderer.cam.x, cy: renderer.cam.y, dist: b ? Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) : 0, zoom: renderer.cam.zoom };
};
canvas.addEventListener('touchstart', (e) => (touch = e.touches.length ? touchState(e) : null), { passive: true });
canvas.addEventListener(
  'touchmove',
  (e) => {
    if (!touch || !e.touches.length) return;
    e.preventDefault();
    const now = touchState(e);
    // a second finger landing or lifting restarts the gesture from here
    if ((now.dist > 0) !== (touch.dist > 0)) {
      touch = now;
      return;
    }
    renderer.cam.follow = false;
    renderer.cam.x = touch.cx - (now.x - touch.x) / renderer.cam.zoom;
    renderer.cam.y = touch.cy - (now.y - touch.y) / renderer.cam.zoom;
    if (touch.dist > 0 && now.dist > 0) {
      const [lo, hi] = /** @type {any} */ (renderer).zoomLimits || [0.5, 2.4];
      renderer.cam.zoom = Math.max(lo, Math.min(hi, touch.zoom * (now.dist / touch.dist)));
    }
  },
  { passive: false }
);
canvas.addEventListener('touchend', (e) => (touch = e.touches.length ? touchState(e) : null), { passive: true });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const z = renderer.cam.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1);
    // a renderer can keep the zoom to its own range (the three.js one: its FOV stops)
    const [lo, hi] = /** @type {any} */ (renderer).zoomLimits || [0.5, 2.4];
    renderer.cam.zoom = Math.max(lo, Math.min(hi, z));
  },
  { passive: false }
);

function matches(e, action) {
  const k = keyFor(action);
  if (!k) return false;
  if (k.length === 1) return e.key.toUpperCase() === k.toUpperCase();
  return e.key === k;
}

function interact(s) {
  // E again in an open container takes everything (patch 08-13)
  if (takeAllHotkey(s)) {
    claimStoryItems(s);
    return;
  }
  // E on hovered furniture: first/most relevant function
  const view = buildView(s);
  const uid = renderer.hover?.furn;
  const f = uid && s.furniture[uid];
  if (f && (isPlanter(f) || isDecor(f))) startFarmSmartAction(s, f.uid);
  else if (f) {
    const fn = furnitureFunctions(s, f).find((x) => x.enabled);
    if (fn) startFurnitureFunction(s, f.uid, fn.key);
  } else if (renderer.hover?.box != null && s.player.scene === 'home') openPanel('floorItems', { box: renderer.hover.box });
  emit('interactKey', { view });
}

function dropHovered(s) {
  if (!hovered.uid) return false;
  const inv = s.inventories[hovered.inv];
  const inst = inv && inv.items.find((i) => i.uid === hovered.uid);
  if (inst && inv.kind === 'backpack') {
    inv.items.splice(inv.items.indexOf(inst), 1);
    dropToFloor(s, inst, s.player.floor, s.player.x, s.player.y);
    hovered.uid = null;
    refreshWindows();
  }
  return true;
}

const toggle = (id) => (isOpen(id) ? closeWindow(id) : openPanel(id));

// Runs a bindable action from a key or a mouse side button. Returns false when the action does not apply right
// now, so the key can mean something else (D switches tabs when defense does not open).
function runHotkey(action, e = null) {
  const s = game.state;
  if (action === 'report') {
    e?.preventDefault();
    openPanel('report');
    return true;
  }
  if (!s || anyModalOpen()) return false;
  switch (action) {
    case 'speed1':
    case 'speed2':
    case 'speed3':
      setSpeed(Number(action.slice(5)));
      return true;
    case 'pause':
      setSpeed(0);
      return true;
    case 'relax':
      toggleRelaxed();
      return true;
    case 'inventory':
      toggleBackpack();
      return true;
    case 'phone':
      openPanel('phone');
      return true;
    case 'map':
      openPanel('map');
      return true;
    case 'log':
      openPanel('journal');
      return true;
    case 'planning':
      openPanel('planning');
      return true;
    case 'defense':
      if (s.phase === 'pre' || document.querySelector('.win .tabs')) return false;
      toggle('defense');
      return true;
    case 'power':
    case 'codex':
      toggle(action);
      return true;
    case 'checklist':
      if (s.phase !== 'pre') return false;
      toggle('checklist');
      return true;
    case 'recenter':
      e?.preventDefault();
      game.ui.recenter();
      return true;
    case 'rotateLeft':
    case 'rotateRight':
      renderer.cam.swivelTarget = action === 'rotateLeft' ? -0.35 : 0.35;
      return true;
    case 'hideSearch':
      s.ui.hideSearch = !s.ui.hideSearch;
      return true;
    case 'drop':
      return dropHovered(s);
    case 'interact':
      interact(s);
      return true;
    default:
      return false;
  }
}

// Keyboard order matters: earlier actions win a shared key. The checklist key is handled in cityPanel.js.
const KEY_DISPATCH = ['report', 'speed1', 'speed2', 'speed3', 'pause', 'relax', 'inventory', 'phone', 'map', 'log', 'planning', 'defense', 'power', 'codex', 'recenter', 'rotateLeft', 'rotateRight', 'hideSearch', 'drop'];

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  const s = game.state;
  if (e.key === 'Escape') {
    if (isCtxOpen()) return closeCtxMenu();
    if (closeTopWindow()) return;
    if (s && s.phase !== 'dead' && s.phase !== 'ending') openPanel('pause');
    return;
  }
  for (const action of KEY_DISPATCH) if (matches(e, action) && runHotkey(action, e)) return;
  if (!s || anyModalOpen()) return;
  if (e.key === '0') return setSpeed(0);
  if (e.key === '~') return toggleRelaxed();
  if ((e.key === 'a' || e.key === 'A' || e.key === 'd' || e.key === 'D') && document.querySelector('.win .tabs')) {
    const wins = [...document.querySelectorAll('.win')];
    const tabs = wins[wins.length - 1]?.querySelector('.tabs');
    if (tabs) {
      const btns = [...tabs.querySelectorAll('button')];
      const i = btns.findIndex((b) => b.classList.contains('on'));
      const next = btns[(i + (e.key.toLowerCase() === 'a' ? -1 : 1) + btns.length) % btns.length];
      next?.click();
      return;
    }
  }
  if (e.key === 'Alt') {
    e.preventDefault();
    for (const b of s.floorBoxes || []) renderer.highlight.add(`box:${b.id}`);
    for (const f of Object.values(s.furniture)) if (f.inv && s.inventories[f.inv]?.items.length) renderer.highlight.add(f.uid);
    return;
  }
  if (matches(e, 'interact')) runHotkey('interact', e);
});

window.addEventListener('keyup', (e) => {
  if (matches(e, 'rotateLeft') || matches(e, 'rotateRight')) renderer.cam.swivelTarget = 0;
  if (e.key === 'Alt') renderer.highlight.clear();
});

// Mouse side buttons can be bound in the settings (saved as 'Mouse4' / 'Mouse5').
const SIDE_BUTTONS = { 3: 'Mouse4', 4: 'Mouse5' };
const sideAction = (e) => (SIDE_BUTTONS[e.button] ? actionForBinding(SIDE_BUTTONS[e.button]) : null);
window.addEventListener('mousedown', (e) => {
  const action = sideAction(e);
  if (!action) return;
  e.preventDefault();
  runHotkey(action, e);
});
window.addEventListener('mouseup', (e) => {
  const action = sideAction(e);
  if (!action) return;
  // a bound side button must not also send the page back / forward
  e.preventDefault();
  if (action === 'rotateLeft' || action === 'rotateRight') renderer.cam.swivelTarget = 0;
});

// ------------------------------------------------------------------------------ loop
let last = performance.now();
let acc = 0;
function frame() {
  requestAnimationFrame(frame);
  // the clock, not the frame's timestamp: they agree in play, and under a test harness's paused page clock only the
  // clock stands still (the sim otherwise advanced by real time between captures, BUG-0063)
  const now = performance.now();
  const fps = game.settings.fps || 0;
  const minDt = fps > 0 ? 1000 / fps : 0;
  acc += now - last;
  last = now;
  if (acc < minDt - 1) return;
  const dt = acc / 1000;
  acc = 0;
  const s = game.state;
  if (s) {
    // a frame in which no time passed (a paused page clock) must not advance anything
    if (dt > 0) step(dt);
    const view = buildView(s);
    if (renderer.cam.follow) {
      const fx = view.focus?.x ?? s.player.px ?? s.player.x;
      const fy = view.focus?.y ?? s.player.py ?? s.player.y;
      const [tx, ty] = [(fx - fy) * 32, (fx + fy) * 16];
      renderer.cam.x += (tx - renderer.cam.x) * Math.min(1, dt * 6);
      renderer.cam.y += (ty - renderer.cam.y) * Math.min(1, dt * 6);
    }
    renderer.cam.swivel = (renderer.cam.swivel || 0) + ((renderer.cam.swivelTarget || 0) - (renderer.cam.swivel || 0)) * Math.min(1, dt * 5);
    renderer.draw(view);
    updateHud(now);
  } else {
    renderer.draw({ floor: null });
  }
}
requestAnimationFrame(frame);

window.addEventListener('beforeunload', () => {
  if (game.state && game.state.phase !== 'dead') saveRun();
});

titleScreen();

// expose for debugging and automated browser checks
window.__game = game;
