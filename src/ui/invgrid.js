// Drag-and-drop grid inventory widget used by every container panel.
import { h, escapeHtml, holdRefreshes } from './dom.js';
import { item, itemName, CAT, SUB, dishOutput, subCategoryName } from '../data/db.js';
import { dims, moveItem, weightKg, instWeightG } from '../sim/inventory.js';
import { lifeLeftDays, isExpiringSoon, isExpired } from '../sim/spoilage.js';
import { loc, tr, getLang, pickLang } from '../engine/i18n.js';
import { rationSatiety } from '../sim/cooking.js';
import { game } from '../game.js';

const CELL_PX = 34;

const SUB_ICON = {
  [SUB.STAPLE]: '🍞',
  [SUB.MEAT]: '🥩',
  [SUB.CUSTARD]: '🥚',
  [SUB.FISH]: '🐟',
  [SUB.VEGETABLE]: '🥬',
  [SUB.FRUIT]: '🍎',
  [SUB.SNACK]: '🍫',
  [SUB.SEASONING]: '🧂',
  [SUB.SOFT_DRINK]: '🥤',
  [SUB.LIQUOR]: '🍷',
  [SUB.MUSHROOM]: '🍄',
};
const CAT_ICON = {
  [CAT.MEDICINE]: '💊',
  [CAT.BOOK]: '📖',
  [CAT.CONSOLE]: '🎮',
  [CAT.DAILY]: '🧴',
  [CAT.TOOL]: '🔧',
  [CAT.PACK]: '📦',
  [CAT.MATERIAL]: '🔩',
  [CAT.SEED]: '🌱',
  [CAT.FERTILIZER]: '🟫',
  [CAT.TRAP]: '🪤',
  [CAT.FUEL]: '⛽',
  [CAT.FURNITURE_PACKAGE]: '📦',
  [CAT.FLOWER]: '🌸',
  [CAT.DEFENSE]: '🔥',
};
const SUB_COLOR = {
  [SUB.STAPLE]: '#8a7a55',
  [SUB.MEAT]: '#8a4a45',
  [SUB.CUSTARD]: '#9a8a45',
  [SUB.FISH]: '#45708a',
  [SUB.VEGETABLE]: '#4f7a45',
  [SUB.FRUIT]: '#9a6a35',
  [SUB.SNACK]: '#8a5a78',
  [SUB.SEASONING]: '#7a6045',
  [SUB.SOFT_DRINK]: '#3f7f86',
  [SUB.LIQUOR]: '#6a4a86',
  [SUB.MUSHROOM]: '#7a6a55',
};
const CAT_COLOR = {
  [CAT.MEDICINE]: '#8a3a3a',
  [CAT.BOOK]: '#5a4a86',
  [CAT.MATERIAL]: '#5c6066',
  [CAT.SEED]: '#56703f',
  [CAT.FERTILIZER]: '#6b5236',
  [CAT.FUEL]: '#8a5a25',
  [CAT.FURNITURE_PACKAGE]: '#7d6440',
  [CAT.DEFENSE]: '#8a3525',
  [CAT.FLOWER]: '#8a4a6a',
};

/** Items with a rendered icon (assets/icons, WP-P0-12: 128 px renders); the rest keep a glyph until the icon lane
 * covers them. */
const RENDERED_ICONS = new Set([13540, 13543, 15026, 20106, 2103, 2105, 2115, 2142, 2400, 25001, 2502, 3022]);

/**
 * The item's rendered icon as an <img>, or null when it has none (or there is no DOM image support).
 * @param {any} cfg
 */
export function itemIconImage(cfg) {
  if (!cfg || !RENDERED_ICONS.has(cfg.id) || typeof document === 'undefined' || typeof document.createElementNS !== 'function') return null;
  return h('img', { class: 'ico-img', src: `assets/icons/${cfg.id}@128.png`, alt: '', draggable: 'false' });
}

export function itemIcon(cfg) {
  if (!cfg) return '?';
  if (dishOutput[cfg.id]) return cfg.id === 8100 ? '💀' : '🍲';
  if (cfg.cat === CAT.FOOD) return SUB_ICON[cfg.sub] || (cfg.prey ? '🐀' : '🍽');
  if (cfg.cat === CAT.DEFENSE && cfg.id >= 26008) return '🥓';
  return CAT_ICON[cfg.cat] || '▫';
}

export function itemColor(cfg) {
  if (!cfg) return '#555';
  if (cfg.cat === CAT.FOOD) return SUB_COLOR[cfg.sub] || '#6a6a6a';
  return CAT_COLOR[cfg.cat] || '#5a5a5a';
}

export function itemTooltip(inst, extra = '') {
  const cfg = item(inst.id);
  if (!cfg) return '';
  const lines = [`<b>${escapeHtml(itemName(cfg.id))}</b>`];
  const catLabel = cfg.cat === CAT.FOOD ? subCategoryName(cfg.sub) : '';
  if (catLabel) lines.push(`<span class="dim">${escapeHtml(catLabel)}</span>`);
  const stats = [];
  const sat = cfg.sat + rationSatiety(cfg.id);
  if (sat) stats.push(`${tr('stat.sat')} ${sat > 0 ? '+' : ''}${sat}`);
  if (cfg.mor) stats.push(`${tr('stat.mor')} ${cfg.mor > 0 ? '+' : ''}${cfg.mor}`);
  if (cfg.sta) stats.push(`${tr('stat.sta')} ${cfg.sta > 0 ? '+' : ''}${cfg.sta}`);
  if (cfg.hp) stats.push(`${tr('stat.life')} ${cfg.hp > 0 ? '+' : ''}${cfg.hp}`);
  if (stats.length) lines.push(stats.join(' · '));
  if (cfg.cat === CAT.FOOD && cfg.taste > 0) lines.push(`${pickLang({ en: 'Taste', zh: '口味' })} <span class="warn">${'★'.repeat(cfg.taste)}${'☆'.repeat(Math.max(0, 5 - cfg.taste))}</span>`);
  const uses = cfg.uses > 1 ? ` · ${tr('ui.servings', { n: inst.uses ?? cfg.uses })}` : inst.left < 1 ? ` · ${pickLang({ en: `${Math.round(inst.left * 100)}% left`, zh: `剩${Math.round(inst.left * 100)}%` })}` : '';
  lines.push(`${(instWeightG(inst) / 1000).toFixed(2)} kg · ${cfg.size[0]}×${cfg.size[1]}${uses}`);
  if (cfg.life > 0) {
    const left = lifeLeftDays(inst, cfg);
    const txt = left <= 0 ? `<span class="bad">${tr('ui.expired')}</span>` : `${left.toFixed(1)} / ${cfg.life} ${getLang() === 'zh' ? '天' : 'days'}`;
    lines.push(txt);
  }
  if (inst.mold) lines.push(`<span class="bad">${getLang() === 'zh' ? '发霉' : 'Moldy'}</span>`);
  if (cfg.trade) lines.push(`<span class="dim">${getLang() === 'zh' ? '交易价值' : 'Trade value'} ${cfg.trade} · $${cfg.price}</span>`);
  const desc = cfg.d2 || cfg.d1;
  if (desc) lines.push(`<span class="desc">${escapeHtml(loc(desc))}</span>`);
  if (extra) lines.push(extra);
  return lines.join('<br>');
}

// Global drag state shared by all grids on screen.
const drag = { inv: null, uid: null, ghost: null, rotated: null, onDone: null, active: false };
// Item under the mouse (Q drops it).
export const hovered = { inv: null, uid: null, opts: null };

// True while an item is being dragged (after the mouse moved with the button held).
export function isDragging() {
  return drag.active;
}

// The on-screen element of an item; windows may have been rebuilt since the element was created.
function liveItemEl(invId, uid) {
  return [...document.querySelectorAll('.inv-item')].find((el) => String(el.dataset.uid) === String(uid) && el.closest('.inv-grid')?.dataset.inv === invId) || null;
}

// opts: { onChange, transferTo: () => invId|null, onUse(inst), onSelect(inst), selectable, readonly, cellPx, tipExtra(inst) }
export function renderGrid(state, invId, opts = {}) {
  const inv = state.inventories[invId];
  const px = opts.cellPx || CELL_PX;
  if (!inv) return h('div', { class: 'grid-missing' }, '—');
  const grid = h('div', {
    class: `inv-grid ${opts.readonly ? 'readonly' : ''}`,
    style: { width: `${inv.w * px}px`, height: `${inv.h * px}px`, backgroundSize: `${px}px ${px}px` },
    dataset: { inv: invId },
  });
  if (inv.moldy) grid.classList.add('moldy');
  for (const inst of inv.items) {
    const cfg = item(inst.id);
    const [w, hh] = dims(inst);
    const badges = [];
    if (cfg?.uses > 1) badges.push(h('span', { class: 'badge uses' }, String(inst.uses ?? cfg.uses)));
    else if (inst.left < 1) badges.push(h('span', { class: 'badge uses' }, `${Math.round(inst.left * 100)}%`));
    if ((inst.qty || 1) > 1) badges.push(h('span', { class: 'badge qty' }, `×${inst.qty}`));
    if (cfg && isExpired(inst, cfg)) badges.push(h('span', { class: 'badge expired' }, '!'));
    else if (cfg && isExpiringSoon(inst, cfg)) badges.push(h('span', { class: 'expiring' }));
    if (inst.mold) badges.push(h('span', { class: 'badge mold' }, '●'));
    if (opts.mark?.(inst)) badges.push(h('span', { class: 'badge mark' }, '★'));
    const el = h(
      'div',
      {
        class: `inv-item ${opts.selected === inst.uid ? 'selected' : ''}`,
        style: {
          left: `${inst.x * px}px`,
          top: `${inst.y * px}px`,
          width: `${w * px - 2}px`,
          height: `${hh * px - 2}px`,
          background: itemColor(cfg),
        },
        dataset: { uid: inst.uid, tip: itemTooltip(inst, opts.tipExtra?.(inst) || '') },
      },
      h('span', { class: 'ico' }, itemIconImage(cfg) || itemIcon(cfg)),
      w * hh >= 2 || w >= 2 ? h('span', { class: 'nm' }, itemName(inst.id)) : null,
      ...badges
    );
    el.addEventListener('mouseenter', () => {
      hovered.inv = invId;
      hovered.uid = inst.uid;
      hovered.opts = opts;
    });
    el.addEventListener('mouseleave', () => {
      if (hovered.uid === inst.uid) hovered.uid = null;
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (opts.readonly) return;
      const to = opts.transferTo?.();
      if (to) {
        const r = moveItem(state, inv, inst.uid, state.inventories[to], null, null, { allowOverweight: state.inventories[to].kind === 'backpack' });
        if (!r.ok) opts.onError?.(r.reason);
        opts.onChange?.();
      }
    });
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        opts.onUse?.(inst);
        return;
      }
      if (e.shiftKey && !opts.readonly) {
        e.preventDefault();
        const to = opts.transferTo?.();
        if (to) {
          const r = moveItem(state, inv, inst.uid, state.inventories[to], null, null, { allowOverweight: state.inventories[to].kind === 'backpack' });
          if (!r.ok) opts.onError?.(r.reason);
          opts.onChange?.();
        }
        return;
      }
      if (opts.readonly) {
        opts.onSelect?.(inst);
        return;
      }
      // Selecting rebuilds the window, which re-centres when its width changes and would pull the grid from under
      // the cursor; so a press starts a drag and a click (no movement) selects on release.
      startDrag(state, invId, inst, e, opts, el, el.getBoundingClientRect());
    });
    grid.appendChild(el);
  }
  return grid;
}

function startDrag(state, invId, inst, e, opts, src, rect) {
  const offX = e.clientX - rect.left;
  const offY = e.clientY - rect.top;
  let moved = false;
  let dimmed = null;
  drag.inv = invId;
  drag.uid = inst.uid;
  drag.rotated = inst.r;
  const ghost = src.cloneNode(true);
  ghost.classList.add('ghost');
  ghost.style.position = 'fixed';
  ghost.style.pointerEvents = 'none';
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  const onKey = (ev) => {
    if (ev.key === 'r' || ev.key === 'R') {
      drag.rotated = !drag.rotated;
      const w = ghost.style.width;
      ghost.style.width = ghost.style.height;
      ghost.style.height = w;
    }
  };
  let held = false;
  const move = (ev) => {
    if (!moved && Math.abs(ev.clientX - e.clientX) + Math.abs(ev.clientY - e.clientY) > 4) {
      moved = true;
      drag.active = true;
      held = !!game.settings.lagOptimization;
      if (held) holdRefreshes(true);
      document.body.appendChild(ghost);
      dimmed = liveItemEl(invId, inst.uid) || src;
      dimmed.style.opacity = '0.3';
    }
    if (moved) {
      ghost.style.left = `${ev.clientX - offX}px`;
      ghost.style.top = `${ev.clientY - offY}px`;
    }
  };
  const drop = (ev) => {
    const target = document.elementsFromPoint(ev.clientX, ev.clientY).find((el) => el.classList?.contains('inv-grid'));
    const fromInv = state.inventories[invId];
    if (!target) {
      opts.onDropOutside?.(inst, ev);
      return;
    }
    const toId = target.dataset.inv;
    const toInv = state.inventories[toId];
    if (!toInv || target.classList.contains('readonly')) return;
    const tr2 = target.getBoundingClientRect();
    const px = opts.cellPx || CELL_PX;
    const gx = Math.round((ev.clientX - offX - tr2.left) / px);
    const gy = Math.round((ev.clientY - offY - tr2.top) / px);
    const r = moveItem(state, fromInv, inst.uid, toInv, gx, gy, { rotate: drag.rotated, allowOverweight: toInv.kind === 'backpack' });
    if (!r.ok) opts.onError?.(r.reason);
    opts.onChange?.();
  };
  const up = (ev) => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    window.removeEventListener('keydown', onKey);
    ghost.remove();
    if (dimmed) dimmed.style.opacity = '';
    if (!moved) {
      opts.onSelect?.(inst);
      return;
    }
    drag.active = false;
    try {
      drop(ev);
    } finally {
      if (held) holdRefreshes(false);
    }
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  window.addEventListener('keydown', onKey);
}

export function weightLine(state, invId) {
  const inv = state.inventories[invId];
  if (!inv) return '';
  const kg = weightKg(inv).toFixed(1);
  return inv.maxKg != null ? `${kg} / ${inv.maxKg} kg` : `${kg} kg`;
}
