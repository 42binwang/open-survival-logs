// Workbench panel (recipe list, work surface, material sources incl. drawer and tool cabinets), the
// crafting results popup and the shredder panel (patches 08-14, 08-18, 08-19, 08-26, 08-31, 09-02, 09-04).
import { h, clear, bar, openWindow, closeWindow, refreshWindows, refreshWindow, isOpen, toast, escapeHtml } from './dom.js';
import { renderGrid, weightLine, itemIcon, itemColor } from './invgrid.js';
import { registerPanel, reasonText } from './panels.js';
import { slotTypeName } from './planningPanel.js';
import { game } from '../game.js';
import { on } from '../engine/bus.js';
import { pickLang, tr, loc } from '../engine/i18n.js';
import { item, itemName, furn, func, packageToFurniture, ELEC } from '../data/db.js';
import { FUNC_SPECS, parsePreview } from '../content/funcSpecs.js';
import { furnLabel, isStorage, storageSize } from '../sim/home.js';
import { count, countIn, organize } from '../sim/inventory.js';
import { homeSources, furnitureFunctions, startFurnitureFunction } from '../sim/furnActions.js';
import { enqueue, cancelAction } from '../sim/actions.js';
import { actionTimeMult } from '../sim/stats.js';
import { PROF } from '../sim/proficiency.js';
import { dayNumber, formatDuration } from '../sim/time.js';
import {
  NOTE_GROUPS,
  recipeDef,
  recipeName,
  listRecipes,
  tally,
  autoFill,
  clearSurface,
  organizeSurface,
  canCraft,
  startCraft,
  craftAgain,
  isCraftingAt,
  ensureWorkbench,
  findWorkbench,
  toolCabinets,
  craftSources,
  craftStaminaCost,
  craftDurationSec,
  craftExp,
  perfectChance,
  failChance,
  missingText,
  freshRecipes,
  markRecipeSeen,
  blueprintProgress,
  craftProfInfo,
  ensureShredder,
  shredderStatus,
  isShreddable,
  breakdownOf,
  shredTimeSec,
  shreddableItems,
  addToShredder,
  collectBin,
} from '../sim/crafting.js';

const esc = escapeHtml;
const pct = (p) => `${Math.round(p * 100)}%`;
const qtyList = (list) => list.map(([id, n]) => `${itemName(id)}${n > 1 ? ` ×${n}` : ''}`).join(', ');
const PERFECT = { en: 'Perfect', zh: '完美' };
const CORNER = { position: 'absolute', top: '0', right: '0', width: '0', height: '0', borderTop: '10px solid var(--warn)', borderLeft: '10px solid transparent' };

function itemBox(id, px = 40) {
  const cfg = item(id);
  return h(
    'div',
    { style: { width: `${px}px`, height: `${px}px`, flex: 'none', borderRadius: '4px', background: itemColor(cfg), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: `${Math.round(px / 2)}px` } },
    itemIcon(cfg)
  );
}

// ------------------------------------------------------------------------------------------ tooltips
function funcEffect(key) {
  const cfg = func(key);
  if (!cfg) return '';
  const spec = FUNC_SPECS[key] || {};
  const pv = parsePreview(cfg.preview);
  const parts = [
    ...Object.entries(spec.gain || pv.gain).map(([k, v]) => `${tr(`stat.${k}`)} +${v}`),
    ...Object.entries(spec.cost || pv.cost).map(([k, v]) => `${tr(`stat.${k}`)} −${v}`),
    ...Object.entries(spec.max || pv.max).map(([k, v]) => `${pickLang({ en: 'Max', zh: '上限' })} ${tr(`stat.${k}`)} +${v}`),
  ];
  return parts.length ? `${loc(cfg.zh)} (${parts.join(', ')})` : loc(cfg.zh);
}

// Hovering a furniture recipe shows the piece's slot, key stats and attribute effects (patch 09-04).
function furnitureLines(state, fid) {
  const d = furn(fid);
  if (!d) return [];
  const stats = [`${pickLang({ en: 'Slot', zh: '占位' })}: ${slotTypeName(d.slot)}`];
  if (d.hp) stats.push(`${pickLang({ en: 'Durability', zh: '耐久' })} ${d.hp}`);
  if (d.elec === ELEC.CONSUMER && d.pw) stats.push(`${pickLang({ en: 'Power', zh: '耗电' })} ${d.pw} W`);
  if (isStorage(fid)) stats.push(`${pickLang({ en: 'Storage', zh: '储物' })} ${storageSize(state, fid).join('×')}`);
  if (d.restore) stats.push(`${pickLang({ en: 'Rest', zh: '睡眠恢复' })} ×${d.restore}`);
  const effects = [...new Set(d.funcs)].map(funcEffect).filter(Boolean).slice(0, 5);
  return [esc(stats.join(' · ')), effects.length ? `<span class="dim">${esc(effects.join('; '))}</span>` : ''].filter(Boolean);
}

function recipeTip(state, s) {
  const r = recipeDef(s.id);
  const [[out, n]] = tally(r.out);
  const cfg = item(out);
  const miss = new Map(s.missing);
  const lines = [`<b>${esc(recipeName(s.id))}</b> <span class="dim">Lv${r.lv}</span>`];
  lines.push(`→ ${esc(itemName(out))}${n > 1 ? ` ×${n}` : ''} · ${(cfg.g / 1000).toFixed(2)} kg · ${cfg.size[0]}×${cfg.size[1]}`);
  if (cfg.d1) lines.push(`<span class="desc">${esc(loc(cfg.d1))}</span>`);
  if (cfg.d2) lines.push(esc(loc(cfg.d2)));
  if (packageToFurniture[out]) lines.push(...furnitureLines(state, packageToFurniture[out]));
  lines.push(
    s.need
      .map(([iid, k]) => {
        const have = k - (miss.get(iid) || 0);
        return `<span class="${have >= k ? 'good' : 'bad'}">${esc(itemName(iid))} ${have}/${k}</span>`;
      })
      .join(' · ')
  );
  lines.push(`<span class="dim">⏱ ${formatDuration(craftDurationSec(state, s.id))} · ${tr('stat.sta')} −${craftStaminaCost(state, s.id)}</span>`);
  if (!s.craftable) lines.push(`<span class="bad">🔒 ${esc(s.reason)}</span>`);
  else if (s.haveAll && !s.gathered) lines.push(`<span class="warn">${esc(pickLang({ en: 'Enough materials at home but not gathered yet: click to move them onto the workbench.', zh: '家中材料足够但尚未集中：点击即可搬到工作台上。' }))}</span>`);
  return lines.join('<br>');
}

// ------------------------------------------------------------------------------------------ workbench
registerPanel('craft', (ctx = {}) => {
  const state = game.state;
  if (!state) return;
  const f = (ctx.furn != null && state.furniture[ctx.furn]) || findWorkbench(state);
  if (!f) return toast(pickLang({ en: 'There is no workbench at home.', zh: '家里没有工作台。' }), 'bad');
  const d = ensureWorkbench(state, f);
  const ui = { sel: d.last, tab: 'bp', scroll: 0, live: null };
  let timer = null;
  openWindow('craft', {
    title: furnLabel(f),
    width: 'auto',
    onClose: () => clearInterval(timer),
    build: (body) => buildCraft(body, state, f.uid, ui),
  });
  timer = setInterval(() => ui.live?.(), 500);
});

on('workbenchRepaired', () => refreshWindow('craft'));

function buildCraft(body, state, uid, ui) {
  const f = state.furniture[uid];
  if (!f) return body.appendChild(h('div', { class: 'dim' }, pickLang({ en: 'The workbench is gone.', zh: '工作台不见了。' })));
  ui.live = null;
  if (f.broken) return body.appendChild(brokenView(state, f));
  const d = ensureWorkbench(state, f);
  const refresh = () => refreshWindows();
  const list = listRecipes(state, uid);
  const sel = list.find((s) => s.id === ui.sel && s.visible) || null;
  const tabs = sourceTabs(state, f);
  const tab = tabs.find((t) => t.key === ui.tab) || tabs[0];
  const surface = state.inventories[d.surface];
  const lacking = new Set((sel?.need || []).filter(([iid, n]) => count(surface, iid) < n).map(([iid]) => iid));
  body.appendChild(header(state, uid, ui));
  const recipes = recipeColumn(state, uid, list, ui, refresh);
  body.appendChild(h('div', { class: 'row' }, recipes, benchColumn(state, f, d, sel, tab, refresh), sourceColumn(state, d, tabs, tab, lacking, ui, refresh)));
  recipes.scrollTop = ui.scroll;
}

function header(state, uid, ui) {
  const info = craftProfInfo(state);
  const bp = blueprintProgress(state);
  const live = h('div', { class: 'row', style: { alignItems: 'center', minHeight: '26px' } });
  ui.live = () => craftLive(state, uid, live);
  ui.live();
  return h(
    'div',
    { class: 'col', style: { marginBottom: '6px' } },
    h(
      'div',
      { class: 'row', style: { alignItems: 'center' } },
      h('b', {}, `${pickLang(PROF.craft.name)} Lv${info.lv}`),
      info.max ? h('span', { class: 'pill' }, 'MAX') : h('div', { style: { width: '140px' } }, bar(info.exp, info.need)),
      info.max ? null : h('span', { class: 'dim' }, `${Math.floor(info.exp)} / ${info.need}`),
      h('span', { class: 'dim' }, `${tr('stat.sta')} −${pct(info.staminaCut)} · ${pickLang(PERFECT)} +${pct(info.perfectBonus)}`),
      h('span', { class: 'spacer' }),
      h('span', { class: 'dim', dataset: { tip: esc(pickLang({ en: 'Crafting codex: blueprints you have crafted', zh: '制造图鉴：已制造过的图纸' })) } }, `📘 ${bp.have}/${bp.total}`)
    ),
    state.phase === 'pre' ? h('div', { class: 'warn' }, pickLang({ en: 'The workbench can be used after the outbreak.', zh: '灾变之后才能使用工作台。' })) : null,
    live
  );
}

function craftLive(state, uid, el) {
  clear(el);
  const a = isCraftingAt(state, uid);
  const queued = state.actions.queue.filter((q) => q.kind === 'craft' && q.furn === uid).length;
  if (a) {
    const total = (a.dur || 1) * actionTimeMult(state);
    const p = a.phase === 'work' ? Math.min(1, a.elapsed / total) : 0;
    el.appendChild(h('span', {}, a.phase === 'work' ? `⚒ ${recipeName(a.craftId)}` : pickLang({ en: 'Walking to the workbench…', zh: '正在走向工作台…' })));
    el.appendChild(h('div', { style: { width: '160px' } }, bar(p, 1)));
    el.appendChild(h('span', { class: 'dim' }, `${pct(p)} · ${formatDuration(total - a.elapsed)}`));
    el.appendChild(h('button', { onclick: () => (cancelAction(state, a.id), refreshWindows()) }, tr('ui.cancelAction')));
  }
  if (queued) el.appendChild(h('span', { class: 'dim' }, pickLang({ en: `${queued} more queued`, zh: `队列中还有${queued}个` })));
}

function recipeColumn(state, uid, list, ui, refresh) {
  const groups = state.ui.craftGroups || (state.ui.craftGroups = {});
  const fresh = new Set(freshRecipes(state));
  const col = h('div', { class: 'col', style: { width: '270px', maxHeight: '62vh', overflowY: 'auto', paddingRight: '4px', flex: 'none' } });
  col.addEventListener('scroll', () => (ui.scroll = col.scrollTop));
  for (const [note, label] of NOTE_GROUPS) {
    const rows = list.filter((s) => s.visible && s.note === note);
    if (!rows.length) continue;
    const collapsed = !!groups[note];
    const ready = rows.filter((s) => s.craftable && s.haveAll).length;
    col.appendChild(
      h(
        'div',
        { class: 'sec-title', style: { cursor: 'pointer' }, onclick: () => ((groups[note] = !collapsed), refresh()) },
        `${collapsed ? '▸' : '▾'} ${pickLang(label)} `,
        h('span', { class: ready ? 'good' : 'dim' }, `${ready}/${rows.length}`)
      )
    );
    if (!collapsed) col.appendChild(h('div', { class: 'list' }, ...rows.map((s) => recipeRow(state, uid, s, ui, fresh.has(s.id), refresh))));
  }
  return col;
}

// Ready recipes are highlighted; a corner marker flags "enough materials but not gathered" (patch 08-26).
function recipeRow(state, uid, s, ui, isNew, refresh) {
  const r = recipeDef(s.id);
  const ready = s.craftable && s.haveAll;
  const selected = ui.sel === s.id;
  const style = { position: 'relative', cursor: 'pointer', padding: '4px 8px' };
  if (!s.craftable) style.opacity = '0.5';
  if (ready && s.gathered && !selected) style.borderColor = 'var(--good)';
  return h(
    'div',
    {
      class: `list-item ${selected ? 'sel' : ''}`,
      style,
      dataset: { tip: recipeTip(state, s) },
      onclick: () => {
        ui.sel = s.id;
        markRecipeSeen(state, s.id);
        if (s.craftable) autoFill(state, uid, s.id);
        refresh();
      },
    },
    h('span', { style: { width: '18px', textAlign: 'center' } }, s.craftable ? itemIcon(item(r.out[0])) : '🔒'),
    h('span', { class: ready ? '' : 'dim' }, recipeName(s.id)),
    h('span', { class: 'spacer' }),
    isNew ? h('span', { class: 'pill', style: { background: '#6b4b1c' } }, pickLang({ en: 'NEW', zh: '新' })) : null,
    h('span', { class: 'dim', style: { fontSize: '11px' } }, formatDuration(r.lifeMin * 60)),
    ready && !s.gathered ? h('span', { style: CORNER }) : null
  );
}

function materialChips(state, uid, d, sel) {
  const surface = state.inventories[d.surface];
  const sources = craftSources(state, uid);
  return h(
    'div',
    { class: 'row', style: { flexWrap: 'wrap', gap: '4px' } },
    ...sel.need.map(([iid, n]) => {
      const on = count(surface, iid);
      const total = countIn(state, sources, iid);
      const cls = on >= n ? 'good' : total >= n ? 'warn' : 'bad';
      const tip = pickLang({ en: `On the workbench ${on} · At home ${total} · Needed ${n}`, zh: `工作台上${on} · 家中共${total} · 需要${n}` });
      return h('span', { class: `pill ${cls}`, dataset: { tip: esc(tip) } }, `${itemName(iid)} ${Math.min(on, n)}/${n}`);
    })
  );
}

function preview(state, s) {
  const r = recipeDef(s.id);
  const [[out, n]] = tally(r.out);
  const fail = failChance(state, s.id);
  return h(
    'div',
    { class: 'list-item', style: { alignItems: 'center', gap: '10px' } },
    itemBox(out, 44),
    h(
      'div',
      { class: 'col', style: { gap: '2px' } },
      h('b', {}, `${itemName(out)}${n > 1 ? ` ×${n}` : ''}`),
      h('span', { class: 'dim' }, `${tr('stat.sta')} −${craftStaminaCost(state, s.id)} · EXP +${craftExp(s.id)}`),
      r.pOut.length ? h('span', { class: 'dim' }, `${pickLang(PERFECT)} ${pct(perfectChance(state, s.id))}: +${qtyList(tally(r.pOut))}`) : null,
      fail > 0 ? h('span', { class: 'warn' }, `${pickLang({ en: 'Failure', zh: '失败' })} ${pct(fail)} → ${qtyList(tally(r.fail))}`) : null
    )
  );
}

function benchColumn(state, f, d, sel, tab, refresh) {
  const uid = f.uid;
  const onError = (reason) => toast(reasonText(reason), 'bad');
  const why = sel ? canCraft(state, uid, sel.id) : null;
  const detail = sel
    ? [
        h(
          'div',
          { class: 'row', style: { alignItems: 'center' } },
          h('b', {}, recipeName(sel.id)),
          h('span', { class: 'pill' }, `Lv${recipeDef(sel.id).lv}`),
          h('span', { class: 'spacer' }),
          h('span', { class: 'dim' }, `⏱ ${formatDuration(craftDurationSec(state, sel.id))}`)
        ),
        materialChips(state, uid, d, sel),
        !sel.craftable ? h('div', { class: 'bad' }, `🔒 ${sel.reason}`) : sel.haveAll ? preview(state, sel) : h('div', { class: 'warn' }, missingText(sel.missing)),
      ]
    : [h('div', { class: 'dim' }, pickLang({ en: 'Pick a recipe. The missing materials are moved from your backpack, the drawer and the tool cabinets onto the workbench.', zh: '选择一个配方，缺少的材料会从背包、抽屉和工具柜自动搬到工作台上。' }))];
  return h(
    'div',
    { class: 'col', style: { width: '350px', flex: 'none' } },
    ...detail,
    h('div', { class: 'sec-title' }, pickLang({ en: 'Workbench', zh: '工作台' })),
    renderGrid(state, d.surface, { onChange: refresh, transferTo: () => tab.inv, onError, mark: (inst) => !!sel?.need.some(([iid]) => iid === inst.id) }),
    h(
      'div',
      { class: 'row', style: { flexWrap: 'wrap' } },
      h('button', { class: 'primary', disabled: why === true ? null : true, onclick: () => startCraft(state, uid, sel.id) && refresh() }, `⚒ ${tr('ui.craft')}`),
      d.last != null ? h('button', { onclick: () => craftAgain(state, uid) && refresh() }, d.last === sel?.id ? tr('ui.craftAgain') : `${tr('ui.craftAgain')}: ${recipeName(d.last)}`) : null,
      h('button', { onclick: () => (clearSurface(state, uid), refresh()) }, tr('ui.clear')),
      h('button', { onclick: () => (organizeSurface(state, uid), refresh()) }, tr('ui.organize'))
    ),
    sel && why !== true && sel.craftable && sel.haveAll ? h('div', { class: 'bad' }, why) : null
  );
}

// Materials come from the backpack, this workbench's drawer and every tool cabinet (patches 08-14, 08-26).
function sourceTabs(state, f) {
  const tabs = [{ key: 'bp', label: tr('ui.inventory'), inv: state.player.backpack }];
  if (f.inv) tabs.push({ key: 'drawer', label: pickLang({ en: 'Drawer', zh: '抽屉' }), inv: f.inv });
  toolCabinets(state).forEach((t, i) => tabs.push({ key: `tc${t.uid}`, label: `${furnLabel(t)} ${i + 1}`, inv: t.inv }));
  return tabs;
}

function sourceColumn(state, d, tabs, tab, lacking, ui, refresh) {
  const holds = (invId) => !!state.inventories[invId]?.items.some((it) => lacking.has(it.id));
  return h(
    'div',
    { class: 'col' },
    h(
      'div',
      { class: 'tabs' },
      ...tabs.map((t) => h('button', { class: t.key === tab.key ? 'on' : '', onclick: () => ((ui.tab = t.key), refresh()) }, t.label, holds(t.inv) ? h('span', { class: 'good' }, ' ★') : null))
    ),
    h('div', { class: 'dim' }, weightLine(state, tab.inv)),
    renderGrid(state, tab.inv, { onChange: refresh, transferTo: () => d.surface, onError: (reason) => toast(reasonText(reason), 'bad'), mark: (inst) => lacking.has(inst.id) }),
    h('div', { class: 'row' }, h('button', { onclick: () => (organize(state.inventories[tab.inv]), refresh()) }, tr('ui.organize')))
  );
}

function repairBench(state, f, kind, fallbackKey) {
  const fn = furnitureFunctions(state, f).find((x) => x.spec.kind === kind);
  if (fn) return startFurnitureFunction(state, f.uid, fn.key);
  const spec = FUNC_SPECS[fallbackKey];
  return enqueue(state, { kind, label: loc(func(fallbackKey)?.zh), target: { furn: f.uid }, furn: f.uid, dur: spec.min * 60, spec, cost: spec.cost });
}

function brokenView(state, f) {
  const hasManual = countIn(state, homeSources(state), 9020) > 0;
  const day = state.phase === 'pre' ? 0 : dayNumber(state.clock);
  return h(
    'div',
    { class: 'col', style: { width: '440px' } },
    h('div', { class: 'bad' }, pickLang({ en: 'The workbench is broken. Repair it before crafting.', zh: '工作台坏了，修好之后才能制造。' })),
    h('div', { class: 'dim' }, pickLang({ en: `The ${itemName(9020)} explains the repair. Without it you can still work it out yourself from Day 6.`, zh: `${itemName(9020)}里写着修理方法。没有的话，第6天起也能自己钻研出来。` })),
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'primary', disabled: hasManual ? null : true, onclick: () => repairBench(state, f, 'repairWorkbench', 220) && refreshWindows() }, `🔧 ${pickLang({ en: 'Repair with the manual', zh: '照手册修理' })}`),
      h('button', { disabled: day >= 6 ? null : true, onclick: () => repairBench(state, f, 'studyWorkbench', 249) && refreshWindows() }, `🧠 ${pickLang({ en: 'Study it yourself (Day 6+)', zh: '自己钻研（第6天起）' })}`)
    )
  );
}

// ------------------------------------------------------------------------------------------ results popup
// Shows the product, quantity, proficiency progress and newly unlocked recipes; E collects (patch 08-19).
on('crafted', (res) => {
  if (game.state && res?.ok) showResult(game.state, res);
});

function showResult(state, res) {
  let onKey = null;
  const close = () => closeWindow('craft-result');
  const rows = [
    ...res.products.map(([id, n]) => [id, n, '']),
    ...res.bonus.map(([id, n]) => [id, n, pickLang({ en: 'Perfect bonus', zh: '完美额外产出' })]),
    ...res.salvage.map(([id, n]) => [id, n, pickLang({ en: 'Salvaged', zh: '回收' })]),
  ];
  openWindow('craft-result', {
    title: res.failed ? pickLang({ en: 'Crafting failed', zh: '制造失败' }) : res.perfect ? pickLang({ en: 'Perfect craft!', zh: '完美制造！' }) : pickLang({ en: 'Crafting complete', zh: '制造完成' }),
    width: 360,
    onClose: () => window.removeEventListener('keydown', onKey, true),
    build: (body) => {
      body.appendChild(
        h(
          'div',
          { class: 'col' },
          h('div', { class: 'list' }, ...rows.map(([id, n, tag]) => h('div', { class: 'list-item', style: { alignItems: 'center' } }, itemBox(id, 32), h('b', {}, itemName(id)), h('span', {}, `×${n}`), h('span', { class: 'spacer' }), tag ? h('span', { class: 'pill warn' }, tag) : null))),
          h(
            'div',
            { class: 'row', style: { alignItems: 'center' } },
            h('span', {}, `${pickLang(PROF.craft.name)} Lv${res.lv}`),
            res.profNeed ? h('div', { style: { width: '120px' } }, bar(res.profExp, res.profNeed)) : h('span', { class: 'pill' }, 'MAX'),
            h('span', { class: 'good' }, `+${res.exp} EXP`),
            res.defExp ? h('span', { class: 'good' }, `${pickLang({ en: 'Defense', zh: '防御' })} +${res.defExp}`) : null
          ),
          res.levelUp ? h('div', { class: 'good' }, pickLang({ en: `Crafting reached Lv${res.lv}!`, zh: `制造熟练度提升到${res.lv}级！` })) : null,
          res.unlocked.length
            ? h('div', { class: 'col', style: { gap: '4px' } }, h('div', { class: 'sec-title' }, pickLang({ en: 'Newly unlocked recipes', zh: '新解锁的配方' })), h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '4px' } }, ...res.unlocked.map((id) => h('span', { class: 'pill good' }, recipeName(id)))))
            : null,
          h(
            'div',
            { class: 'row' },
            h('button', { class: 'primary', onclick: close }, `${tr('ui.collect')} (E)`),
            h('button', { onclick: () => (close(), craftAgain(state, res.furn), refreshWindows()) }, tr('ui.craftAgain'))
          )
        )
      );
    },
  });
  onKey = (e) => {
    if (e.key !== 'e' && e.key !== 'E' && e.key !== 'Enter') return;
    e.preventDefault();
    e.stopPropagation();
    close();
  };
  window.addEventListener('keydown', onKey, true);
}

// ------------------------------------------------------------------------------------------ shredder
registerPanel('shredder', (ctx = {}) => {
  const state = game.state;
  const f = state?.furniture[ctx.furn];
  if (!f) return;
  ensureShredder(state, f);
  const ui = { live: null };
  let timer = null;
  openWindow('shredder', {
    title: furnLabel(f),
    width: 'auto',
    onClose: () => clearInterval(timer),
    build: (body) => buildShredder(body, state, f.uid, ui),
  });
  timer = setInterval(() => ui.live?.(), 500);
});

on('shredded', () => {
  if (isOpen('shredder')) refreshWindow('shredder');
});

const SHRED_STATUS = {
  idle: [{ en: 'Idle: put materials into the hopper', zh: '待机：把材料放进投料斗' }, 'dim'],
  working: [{ en: 'Shredding', zh: '粉碎中' }, 'good'],
  noPower: [{ en: 'No power: the shredder cannot start', zh: '没有电，粉碎机无法启动' }, 'bad'],
  binFull: [{ en: 'The collection bin is full', zh: '接料仓已满' }, 'bad'],
  stuck: [{ en: 'These items cannot be shredded', zh: '这些物品无法粉碎' }, 'warn'],
};

function shredLive(state, uid, el) {
  clear(el);
  const st = shredderStatus(state, uid);
  if (!st) return;
  const [label, cls] = SHRED_STATUS[st.status] || SHRED_STATUS.idle;
  el.appendChild(h('span', { class: cls }, pickLang(label)));
  if (st.job) {
    el.appendChild(h('span', {}, itemName(st.job.id)));
    el.appendChild(h('div', { style: { width: '160px' } }, bar(st.job.pct, 1)));
    el.appendChild(h('span', { class: 'dim' }, formatDuration(st.job.left)));
  }
  if (st.queued) el.appendChild(h('span', { class: 'dim' }, pickLang({ en: `${st.queued} in queue`, zh: `队列${st.queued}件` })));
}

const breakdownTip = (inst) =>
  isShreddable(inst.id)
    ? `<span class="good">→ ${esc(qtyList(breakdownOf(inst.id)))} · ${formatDuration(shredTimeSec(inst.id))}</span>`
    : `<span class="bad">${esc(pickLang({ en: 'Cannot be shredded', zh: '无法粉碎' }))}</span>`;

function buildShredder(body, state, uid, ui) {
  const f = state.furniture[uid];
  if (!f) return;
  const d = ensureShredder(state, f);
  const bp = state.player.backpack;
  const refresh = () => refreshWindows();
  const onError = (reason) => toast(reasonText(reason), 'bad');
  const status = h('div', { class: 'row', style: { alignItems: 'center', minHeight: '26px' } });
  ui.live = () => shredLive(state, uid, status);
  ui.live();
  const addAll = () => {
    let n = 0;
    for (const it of [...state.inventories[bp].items]) if (isShreddable(it.id) && addToShredder(state, uid, bp, it.uid).ok) n++;
    toast(pickLang({ en: `Queued ${n} items`, zh: `已放入${n}件` }));
    refresh();
  };
  const column = (title, invId, opts, ...extra) =>
    h('div', { class: 'col' }, h('div', { class: 'row' }, h('span', { class: 'sec-title' }, title), h('span', { class: 'dim' }, weightLine(state, invId))), renderGrid(state, invId, { onChange: refresh, onError, ...opts }), ...extra);
  body.appendChild(
    h(
      'div',
      { class: 'col' },
      h('div', { class: 'dim', style: { maxWidth: '820px' } }, pickLang({ en: 'Put crafted materials into the hopper. While powered, the shredder takes them apart one by one and returns every material used to make them into the collection bin.', zh: '把制造出的材料放进投料斗。通电时粉碎机会逐个拆解，把制造它们所用的原料全部退回接料仓。' })),
      status,
      h(
        'div',
        { class: 'row' },
        column(pickLang({ en: 'Hopper', zh: '投料斗' }), d.hopper, { transferTo: () => bp, tipExtra: breakdownTip }),
        column(tr('ui.inventory'), bp, { transferTo: () => d.hopper, tipExtra: breakdownTip, mark: (inst) => isShreddable(inst.id) }, h('button', { onclick: addAll }, pickLang({ en: 'Queue all ★ materials', zh: '放入全部★材料' }))),
        column(pickLang({ en: 'Collection bin', zh: '接料仓' }), f.inv, { transferTo: () => bp }, h('button', { onclick: () => (collectBin(state, uid), refresh()) }, tr('ui.takeAll')))
      ),
      h('div', { class: 'dim', style: { maxWidth: '820px', fontSize: '11px' } }, shreddableItems().map((id) => `${itemName(id)} → ${qtyList(breakdownOf(id))}`).join(' · '))
    )
  );
}
