// Click-on-furniture context menu with function buttons and stat previews.
import { h, escapeHtml } from './dom.js';
import { furnitureFunctions, startFurnitureFunction } from '../sim/furnActions.js';
import { furnLabel, effectiveMaxHp, slotDef } from '../sim/home.js';
import { furn, furnitureTag, SLOT } from '../data/db.js';
import { tr, loc, pickLang } from '../engine/i18n.js';
import { game } from '../game.js';

let menuEl = null;

// The label a storage container was given in its panel (Store by Tag), or '' when it has none.
export function storageTagLabel(state, f) {
  const tag = f?.inv ? state.inventories[f.inv]?.tag : 0;
  const def = tag ? furnitureTag(tag) : null;
  return def ? loc(def.TagName_Local) : '';
}

export function closeCtxMenu() {
  menuEl?.remove();
  menuEl = null;
}

function previewText(spec) {
  const parts = [];
  const lab = { sat: tr('stat.sat'), sta: tr('stat.sta'), mor: tr('stat.mor'), life: tr('stat.life') };
  for (const [k, v] of Object.entries(spec.cost || {})) parts.push(`<span class="bad">${lab[k]} -${v}</span>`);
  for (const [k, v] of Object.entries(spec.gain || {})) parts.push(`<span class="good">${lab[k]} +${v}</span>`);
  for (const [k, v] of Object.entries(spec.max || {})) parts.push(`<span class="warn">${pickLang({ en: 'Max', zh: '上限' })} ${lab[k]} +${v}</span>`);
  if (spec.min) parts.push(`<span class="dim">${spec.min >= 60 ? `${(spec.min / 60).toFixed(spec.min % 60 ? 1 : 0)}h` : `${spec.min}min`}</span>`);
  return parts.join(' · ');
}

export function openCtxMenu(f, clientX, clientY, extraItems = []) {
  closeCtxMenu();
  const state = game.state;
  const funcs = furnitureFunctions(state, f);
  const def = typeof f.cfg === 'number' ? furn(f.cfg) : null;
  const slot = slotDef(state, f.slot);
  const isOpening = slot && (slot.type === SLOT.DOOR || slot.type === SLOT.WINDOW);
  const tag = storageTagLabel(state, f);
  menuEl = h(
    'div',
    { class: 'ctxmenu', style: { left: `${clientX}px`, top: `${clientY}px` } },
    h('div', { class: 'ttl' }, furnLabel(f)),
    tag ? h('div', { class: 'hpline tagline' }, `🏷 ${tag}`) : null,
    isOpening ? h('div', { class: 'hpline' }, `${pickLang({ en: 'Durability', zh: '耐久' })} ${Math.round(f.hp)} / ${effectiveMaxHp(f)}`) : null,
    def?.desc ? h('div', { class: 'hpline' }, loc(def.desc)) : null,
    f.broken ? h('div', { class: 'hpline bad' }, pickLang({ en: 'Broken', zh: '已损坏' })) : null,
    f.powered === false ? h('div', { class: 'hpline bad' }, pickLang({ en: 'No power', zh: '未通电' })) : null,
    ...funcs.map((fn) =>
      h(
        'button',
        {
          disabled: fn.enabled ? null : true,
          dataset: { tip: `${escapeHtml(fn.label)}${fn.tip ? `<br><span class="dim">${escapeHtml(fn.tip)}</span>` : ''}<br>${previewText(fn.spec)}` },
          onclick: (e) => {
            e.stopPropagation();
            const a = startFurnitureFunction(state, f.uid, fn.key, e.ctrlKey ? {} : {});
            closeCtxMenu();
            if (a && game.settings.operationTips) game.ui?.opTip?.(`${fn.label} → ${furnLabel(f)}`);
          },
        },
        fn.label,
        fn.enabled ? null : h('span', { class: 'why' }, fn.reason)
      )
    ),
    ...extraItems.map((x) => h('button', { onclick: (e) => (e.stopPropagation(), closeCtxMenu(), x.run()) }, x.label))
  );
  document.body.appendChild(menuEl);
  const r = menuEl.getBoundingClientRect();
  if (r.right > window.innerWidth) menuEl.style.left = `${window.innerWidth - r.width - 6}px`;
  if (r.bottom > window.innerHeight) menuEl.style.top = `${window.innerHeight - r.height - 6}px`;
  if (!funcs.length && !extraItems.length) menuEl.appendChild(h('div', { class: 'hpline' }, pickLang({ en: 'Nothing to do here.', zh: '这里没什么可做的。' })));
}

export function isCtxOpen() {
  return !!menuEl;
}
