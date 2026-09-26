// Panel registry + core container panels (storage, backpack, floor boxes).
import { h, openWindow, closeWindow, refreshWindows, toast, isOpen, windowIds, windowElement } from './dom.js';
import { renderGrid, weightLine, itemIcon, itemColor, itemTooltip } from './invgrid.js';
import { game } from '../game.js';
import { tr, pickLang, loc } from '../engine/i18n.js';
import { item, itemName, furnitureTags, furnitureTag, CAT } from '../data/db.js';
import { itemOps, useItemAction, pickUpAction } from '../sim/itemuse.js';
import { enqueue } from '../sim/actions.js';
import { furnLabel, dropToFloor } from '../sim/home.js';
import { moveItem, organize, removeUid, findUid, weightKg } from '../sim/inventory.js';
import { on } from '../engine/bus.js';
import { isWished } from '../sim/wishes.js';
import { TUTORIALS } from '../content/tutorials.js';

const panels = new Map();
const lastCtx = new Map();

export function registerPanel(name, fn) {
  panels.set(name, fn);
}

export function openPanel(name, ctx = {}) {
  const fn = panels.get(name);
  if (!fn) {
    toast(`${name}: not available yet`, 'bad');
    return;
  }
  lastCtx.set(name, ctx);
  fn(ctx);
  showTutorialOnce(name);
}

// The context a panel was last opened with (e.g. which fixture the loot window shows).
export function panelContext(name) {
  return lastCtx.get(name) || null;
}

// "Take All": everything that fits moves from an inventory into the backpack. Returns how many items moved and
// how many stayed behind.
export function takeAll(state, fromInvId, { allowOverweight = true } = {}) {
  const from = state.inventories[fromInvId];
  const bp = state.inventories[state.player.backpack];
  if (!from || !bp || from === bp) return { moved: 0, left: 0 };
  let moved = 0;
  for (const it of [...from.items]) if (moveItem(state, from, it.uid, bp, null, null, { allowOverweight }).ok) moved++;
  return { moved, left: from.items.length };
}

function reportLeft(r) {
  if (r.left) toast(pickLang({ en: `${r.left} item(s) did not fit.`, zh: `有${r.left}件物品放不下。` }), 'bad');
  return r;
}

// Where E takes from in a container window, matching the window's Take All button: { inv, allowOverweight } or
// { boxes } for the floor list; null for other windows. Doorstep, trunk, shop floor and loot windows keep to the
// carry limit like their buttons; storage furniture may go past it.
export function takeAllSource(state, winId) {
  const scene = state.player.scene || 'home';
  const limited = (inv) => (inv && state.inventories[inv] ? { inv, allowOverweight: false } : null);
  if (winId.startsWith('storage-')) {
    const inv = state.furniture[winId.slice(8)]?.inv;
    return inv && state.inventories[inv] ? { inv, allowOverweight: true } : null;
  }
  switch (winId) {
    case 'doorstep':
      return scene === 'home' ? limited(state.home.doorstepInv) : null;
    case 'trunk':
      return limited(state.pre?.trunk);
    case 'shopGround':
      return scene.startsWith('shop:') ? limited(state.pre?.ground?.[scene.slice(5)]) : null;
    case 'exploreLoot': {
      const fixture = panelContext('exploreLoot')?.fixture;
      return limited(state.explore?.run?.fixtures?.find((f) => f.id === fixture)?.inv);
    }
    case 'floorItems': {
      if (scene !== 'home') return null;
      const all = floorBoxesByDistance(state);
      const focus = all.filter((b) => b.id === panelContext('floorItems')?.box);
      return { boxes: focus.length ? focus : all };
    }
    default:
      return null;
  }
}

// E with a container window open takes everything from the top-most one. Returns false when there is none, or
// when it is already empty, so E goes back to interacting (e.g. searching the next spot on an expedition).
export function takeAllHotkey(state) {
  for (const id of windowIds()) {
    const src = takeAllSource(state, id);
    if (!src) {
      // other windows labelled "Take All (E)" (cooking output, crafting bins, drone cargo) get their button pressed
      const btn = [...(windowElement(id)?.querySelectorAll('button') || [])].find((b) => b.textContent.trim() === tr('ui.takeAll') && !b.disabled);
      if (!btn) continue;
      btn.click();
      return true;
    }
    if (src.boxes) {
      if (!src.boxes.length) return false;
      for (const b of src.boxes) queuePickUp(state, b);
    } else {
      if (!state.inventories[src.inv].items.length) return false;
      reportLeft(takeAll(state, src.inv, src));
    }
    refreshWindows();
    return true;
  }
  return false;
}

function showTutorialOnce(name) {
  const tut = TUTORIALS[name];
  if (!tut || !game.state || game.settings.skipPrologue) return;
  const seen = (game.history.tutorials ||= {});
  if (seen[name]) return;
  seen[name] = true;
  openWindow(`tut-${name}`, {
    title: `💡 ${pickLang(tut.title)}`,
    width: 380,
    build: (body) => {
      body.appendChild(h('div', { style: { lineHeight: 1.55 } }, pickLang(tut.text)));
      body.appendChild(h('div', { style: { marginTop: '8px', textAlign: 'right' } }, h('button', { class: 'primary', onclick: () => closeWindow(`tut-${name}`) }, pickLang({ en: 'Got it', zh: '知道了' }))));
    },
  });
}

on('openPanel', ({ panel, ...ctx }) => openPanel(panel, ctx));

export function reasonText(reason) {
  return (
    {
      weight: tr('ui.tooHeavy'),
      space: tr('ui.full'),
      size: pickLang({ en: 'Different sizes cannot be swapped', zh: '尺寸不同，无法交换' }),
      missing: '—',
    }[reason] || reason
  );
}

const TAG_ITEM_MATCH = {
  1001: (c) => c.cat === CAT.FOOD,
  1002: (c) => c.cat === CAT.FOOD && c.id >= 8100 && c.id < 13000,
  1003: (c) => c.cat === CAT.FOOD && c.cook,
  1004: (c) => c.cat === CAT.FOOD && (c.sub === 5 || c.sub === 6),
  1005: (c) => !!c.prey,
  1006: (c) => c.cat === CAT.FOOD && c.life > 0 && c.life <= 10,
  1007: (c) => c.cat === CAT.SEED,
  1008: (c) => c.cat === CAT.FOOD && (c.sub === 9 || c.sub === 10),
  1009: (c) => c.cat === CAT.MEDICINE,
  1010: (c) => c.cat === CAT.DAILY,
  1011: (c) => c.cat === CAT.TOOL || c.cat === CAT.TRAP,
  1012: (c) => c.cat === CAT.MATERIAL,
  1013: (c) => c.cat === CAT.FUEL,
  1014: (c) => c.cat === CAT.DEFENSE,
  1015: (c) => c.cat === CAT.BOOK,
  1016: (c) => c.cat === CAT.FURNITURE_PACKAGE,
  1017: (c) => c.cat === CAT.CONSOLE || c.story > 0,
  1018: () => true,
  1019: (c) => c.cat === CAT.FERTILIZER,
};

export function itemMatchesTag(tagId, cfg) {
  return !!cfg && (TAG_ITEM_MATCH[tagId]?.(cfg) ?? false);
}

// Item detail + operations bar
function itemDetail(state, invId, sel, refresh) {
  const inv = state.inventories[invId];
  const inst = sel && inv ? findUid(inv, sel) : null;
  if (!inst) return h('div', { class: 'dim' }, pickLang({ en: 'Select an item. Right-click or Shift+click to transfer, Ctrl+click to use, R to rotate while dragging.', zh: '选择物品。右键或Shift+点击快速转移，Ctrl+点击直接使用，拖动时按R旋转。' }));
  const cfg = item(inst.id);
  const ops = itemOps(state, inst);
  return h(
    'div',
    { class: 'row', style: { alignItems: 'center', flexWrap: 'wrap' } },
    h('b', {}, itemName(inst.id)),
    ...ops.map((o) =>
      h(
        'button',
        {
          onclick: () => {
            if (o.panel) return openPanel(o.panel, { invId, uid: inst.uid });
            enqueue(state, useItemAction(state, invId, inst.uid, o.op));
            refresh();
          },
        },
        o.label
      )
    ),
    h(
      'button',
      {
        onclick: () => {
          removeUid(inv, inst.uid);
          dropToFloor(state, inst, state.player.floor, state.player.x, state.player.y);
          refresh();
        },
      },
      tr('ui.drop')
    ),
    cfg?.cat === CAT.FURNITURE_PACKAGE && state.player.scene === 'home'
      ? h('button', { class: 'primary', onclick: () => openPanelLater('planning', { installUid: inst.uid, fromInv: invId }) }, tr('ui.install'))
      : null
  );
}

function openPanelLater(name, ctx) {
  setTimeout(() => openPanel(name, ctx), 0);
}

// Storage furniture next to the backpack.
registerPanel('storage', ({ furn: uid }) => {
  const state = game.state;
  const f = state.furniture[uid];
  if (!f?.inv) return;
  let sel = null;
  let selInv = null;
  const id = `storage-${uid}`;
  const win = openWindow(id, {
    title: furnLabel(f),
    width: 'auto',
    build: (body) => {
      const refresh = () => refreshWindows();
      const inv = state.inventories[f.inv];
      const tagSel = h(
        'select',
        {
          onchange: (e) => {
            inv.tag = Number(e.target.value) || 0;
            refresh();
          },
        },
        h('option', { value: 0 }, pickLang({ en: 'No label', zh: '无标签' })),
        ...furnitureTags().map((t) => h('option', { value: t.ID, selected: inv.tag === t.ID ? true : null }, loc(t.TagName_Local)))
      );
      const bp = state.player.backpack;
      const storeByTag = inv.tag
        ? h(
            'button',
            {
              onclick: () => {
                const bpInv = state.inventories[bp];
                let moved = 0;
                for (const it of [...bpInv.items]) {
                  if (itemMatchesTag(inv.tag, item(it.id)) && moveItem(state, bpInv, it.uid, inv, null, null).ok) moved++;
                }
                toast(pickLang({ en: `Stored ${moved} items`, zh: `存入${moved}件物品` }));
                refresh();
              },
            },
            pickLang({ en: `Store all "${loc(furnitureTag(inv.tag).TagName_Local)}"`, zh: `一键存入「${loc(furnitureTag(inv.tag).TagName_Local)}」` })
          )
        : null;
      body.appendChild(
        h(
          'div',
          { class: 'row' },
          h(
            'div',
            { class: 'col' },
            h('div', { class: 'row' }, h('span', { class: 'sec-title' }, furnLabel(f)), h('span', { class: 'dim' }, weightLine(state, f.inv)), tagSel),
            renderGrid(state, f.inv, {
              onChange: refresh,
              transferTo: () => bp,
              selected: sel,
              onSelect: (i) => {
                sel = i.uid;
                selInv = f.inv;
                refresh();
              },
              onUse: (i) => quickUse(state, f.inv, i),
              onError: (r) => toast(reasonText(r), 'bad'),
              mark: (i) => isWished(state, i.id),
            }),
            h(
              'div',
              { class: 'row' },
              h(
                'button',
                {
                  onclick: () => {
                    reportLeft(takeAll(state, f.inv));
                    refresh();
                  },
                },
                tr('ui.takeAll')
              ),
              h('button', { onclick: () => (organize(inv), refresh()) }, tr('ui.organize')),
              storeByTag
            )
          ),
          h(
            'div',
            { class: 'col' },
            h('div', { class: 'row' }, h('span', { class: 'sec-title' }, tr('ui.inventory')), h('span', { class: 'dim' }, weightLine(state, bp))),
            renderGrid(state, bp, {
              onChange: refresh,
              transferTo: () => f.inv,
              selected: sel,
              onSelect: (i) => {
                sel = i.uid;
                selInv = bp;
                refresh();
              },
              onUse: (i) => quickUse(state, bp, i),
              onError: (r) => toast(reasonText(r), 'bad'),
              mark: (i) => isWished(state, i.id),
            }),
            h('button', { onclick: () => (organize(state.inventories[bp]), refresh()) }, tr('ui.organize'))
          )
        )
      );
      body.appendChild(h('div', { style: { marginTop: '8px' } }, itemDetail(state, selInv || bp, sel, refresh)));
    },
  });
  return win;
});

export function quickUse(state, invId, inst) {
  const ops = itemOps(state, inst);
  if (!ops.length) return;
  enqueue(state, useItemAction(state, invId, inst.uid, ops.find((o) => o.op !== 'cut')?.op || ops[0].op));
  toast(`${ops[0].label}: ${itemName(inst.id)}`);
}

// Backpack (I) with trunk and floor box tabs
registerPanel('backpack', () => {
  const state = game.state;
  let sel = null;
  let tab = 'bp';
  openWindow('backpack', {
    title: tr('ui.inventory'),
    width: 'auto',
    build: (body) => {
      const refresh = () => refreshWindows();
      const bp = state.player.backpack;
      const tabs = [['bp', tr('ui.inventory')]];
      if (state.pre.trunk && state.inventories[state.pre.trunk]) tabs.push(['trunk', pickLang({ en: 'Trunk', zh: '后备箱' })]);
      const nearBox = (state.floorBoxes || []).find((b) => b.floor === state.player.floor && Math.abs(b.x - state.player.x) + Math.abs(b.y - state.player.y) <= 2 && state.player.scene === 'home');
      if (nearBox) tabs.push(['floor', pickLang({ en: 'On the floor', zh: '地上' })]);
      body.appendChild(h('div', { class: 'tabs' }, ...tabs.map(([k, l]) => h('button', { class: tab === k ? 'on' : '', onclick: () => ((tab = k), refresh()) }, l))));
      const other = tab === 'trunk' ? state.pre.trunk : tab === 'floor' ? nearBox?.inv : null;
      body.appendChild(
        h(
          'div',
          { class: 'row' },
          h(
            'div',
            { class: 'col' },
            h('div', { class: 'dim' }, weightLine(state, bp), state.inventories[bp].maxKg && weightKg(state.inventories[bp]) > state.inventories[bp].maxKg ? h('span', { class: 'bad' }, ` · ${tr('ui.tooHeavy')}`) : null),
            renderGrid(state, bp, {
              onChange: refresh,
              transferTo: () => other,
              selected: sel,
              onSelect: (i) => ((sel = i.uid), refresh()),
              onUse: (i) => quickUse(state, bp, i),
              onError: (r) => toast(reasonText(r), 'bad'),
              mark: (i) => isWished(state, i.id),
            }),
            h('button', { onclick: () => (organize(state.inventories[bp]), refresh()) }, tr('ui.organize'))
          ),
          other
            ? h(
                'div',
                { class: 'col' },
                h('div', { class: 'dim' }, weightLine(state, other)),
                renderGrid(state, other, {
                  onChange: refresh,
                  transferTo: () => bp,
                  onSelect: (i) => ((sel = i.uid), refresh()),
                  onError: (r) => toast(reasonText(r), 'bad'),
                })
              )
            : null
        )
      );
      body.appendChild(h('div', { style: { marginTop: '8px' } }, itemDetail(state, bp, sel, refresh)));
    },
  });
});

export function toggleBackpack() {
  if (isOpen('backpack')) closeWindow('backpack');
  else openPanel('backpack');
}

// ------------------------------------------------------------------------------ quick pickup list
// Cardboard boxes with something in them on the floor being viewed, nearest to the survivor first.
export function floorBoxesByDistance(state) {
  const p = state.player;
  const floor = state.ui.viewFloor || p.floor;
  const dist = (b) => (b.floor === p.floor ? Math.abs(b.x - p.x) + Math.abs(b.y - p.y) : Infinity);
  return (state.floorBoxes || []).filter((b) => b.floor === floor && state.inventories[b.inv]?.items.length).sort((a, b) => dist(a) - dist(b));
}

function pickUpQueued(state, box, uid = null) {
  return [state.actions.current, ...state.actions.queue].some((a) => a?.kind === 'pickUp' && a.box === box.id && (a.uid ?? null) === uid);
}

export function queuePickUp(state, box, uid = null) {
  if (pickUpQueued(state, box, uid)) return null;
  const a = enqueue(state, pickUpAction(state, box, uid));
  if (game.settings.operationTips) game.ui?.opTip?.(`📦 ${a.label}`);
  return a;
}

function floorBoxCard(state, box, focused) {
  const inv = state.inventories[box.inv];
  const p = state.player;
  const dist = box.floor === p.floor ? Math.abs(box.x - p.x) + Math.abs(box.y - p.y) : null;
  const where = dist == null ? box.floor : dist <= 1 ? pickLang({ en: 'at your feet', zh: '就在脚边' }) : pickLang({ en: `${dist} tiles away`, zh: `${dist}格外` });
  const queued = pickUpQueued(state, box);
  const refresh = () => refreshWindows();
  return h(
    'div',
    { class: `floorbox ${focused ? 'sel' : ''}`, dataset: { box: box.id } },
    h(
      'div',
      { class: 'row', style: { alignItems: 'center' } },
      h('b', {}, `📦 ${pickLang({ en: 'Cardboard box', zh: '纸箱' })}`),
      h('span', { class: 'dim' }, `${where} · ${weightLine(state, box.inv)}`),
      h('span', { class: 'spacer' }),
      h(
        'button',
        { class: focused ? 'primary' : '', disabled: queued ? true : null, onclick: () => (queuePickUp(state, box), refresh()) },
        queued ? pickLang({ en: 'On the way…', zh: '正在前往…' }) : focused ? pickLang({ en: 'Take all (E)', zh: '全部拾取 (E)' }) : pickLang({ en: 'Take all', zh: '全部拾取' })
      )
    ),
    ...inv.items.map((it) => {
      const cfg = item(it.id);
      return h(
        'div',
        { class: 'row floorline', dataset: { uid: it.uid, tip: itemTooltip(it) } },
        h('span', { class: 'ico', style: { background: itemColor(cfg) } }, itemIcon(cfg)),
        h('span', {}, itemName(it.id), (it.qty || 1) > 1 ? ` ×${it.qty}` : ''),
        h('span', { class: 'spacer' }),
        h('button', { disabled: queued || pickUpQueued(state, box, it.uid) ? true : null, onclick: () => (queuePickUp(state, box, it.uid), refresh()) }, tr('ui.take'))
      );
    })
  );
}

// Dev log #3's quick pickup list: every box on this floor; Take / Take all walk over first. Clicking a box in the
// scene opens the list with that box on top.
registerPanel('floorItems', () => {
  const state = game.state;
  if (!state || state.player.scene !== 'home') return;
  openWindow('floorItems', {
    title: pickLang({ en: 'Items on the floor', zh: '地上的物品' }),
    width: 420,
    build: (body) => {
      const all = floorBoxesByDistance(state);
      const focus = all.find((b) => b.id === panelContext('floorItems')?.box) || null;
      const boxes = focus ? [focus, ...all.filter((b) => b !== focus)] : all;
      const floor = state.ui.viewFloor || state.player.floor;
      const count = boxes.reduce((n, b) => n + state.inventories[b.inv].items.length, 0);
      body.appendChild(
        h(
          'div',
          { class: 'row', style: { alignItems: 'center', marginBottom: '6px' } },
          h('span', { class: 'dim' }, pickLang({ en: `${floor} · ${boxes.length} box(es) · ${count} item(s)`, zh: `${floor} · ${boxes.length}个纸箱 · ${count}件物品` })),
          h('span', { class: 'spacer' }),
          boxes.length
            ? h('button', { class: focus ? '' : 'primary', onclick: () => (boxes.forEach((b) => queuePickUp(state, b)), refreshWindows()) }, focus ? pickLang({ en: 'Take everything', zh: '全部拾取' }) : pickLang({ en: 'Take everything (E)', zh: '全部拾取 (E)' }))
            : null
        )
      );
      if (!boxes.length) body.appendChild(h('div', { class: 'dim' }, pickLang({ en: 'Nothing on this floor.', zh: '这一层的地上没有东西。' })));
      for (const b of boxes) body.appendChild(floorBoxCard(state, b, b === focus));
      body.appendChild(h('div', { class: 'dim', style: { marginTop: '6px', fontSize: '11px' } }, pickLang({ en: 'Hold Alt to highlight every box. What does not fit in the backpack stays in the box.', zh: '按住Alt高亮所有纸箱。背包放不下的东西会留在纸箱里。' })));
    },
  });
});
