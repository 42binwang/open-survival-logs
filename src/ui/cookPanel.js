// Cooking panels: cookers (ingredient pot, fuel, live dish preview, finished dishes, cookbook), the electric hot pot,
// the brewing barrel, the ration press and the pre-disaster "try cooking".
import { h, clear, openWindow, closeWindow, refreshWindow, refreshWindows, isOpen, toast, bar } from './dom.js';
import { renderGrid, weightLine } from './invgrid.js';
import { registerPanel, reasonText, quickUse } from './panels.js';
import { game } from '../game.js';
import { on } from '../engine/bus.js';
import { pickLang, loc, tr } from '../engine/i18n.js';
import { item, itemName, recipe, subCategoryName, CAT } from '../data/db.js';
import { furnLabel } from '../sim/home.js';
import { enqueue } from '../sim/actions.js';
import { useItemAction } from '../sim/itemuse.js';
import { moveItem } from '../sim/inventory.js';
import { formatDuration } from '../sim/time.js';
import { PROF } from '../sim/proficiency.js';
import {
  BREW,
  RATION,
  COOK_MODE,
  cookerConfig,
  cookerState,
  predictDish,
  startCooking,
  cancelCooking,
  resumeCooking,
  isTended,
  tidyCooker,
  clearPot,
  collectOutput,
  cookbook,
  potHints,
  fillRecipe,
  cookSources,
  canUseFridge,
  isIngredient,
  isCookFuel,
  ingredientTier,
  fuelHeat,
  fuelHours,
  needsPower,
  isPowered,
  hotPotPreview,
  startHotPot,
  eatHotPot,
  brewStatus,
  tidyBarrel,
  startBrewing,
  isBrewable,
  foodSat,
  pressSources,
  pressPreview,
  tidyPress,
  startPress,
  isPressable,
  rationFlavor,
  rationSatiety,
  trialCooking,
} from '../sim/cooking.js';

const say = (en, zh) => pickLang({ en, zh });
const QUALITY_NAMES = [
  { en: 'Perfect', zh: '完美' },
  { en: 'Good', zh: '优良' },
  { en: 'Normal', zh: '普通' },
  { en: 'Fail', zh: '失败' },
];
const QUALITY_CLASS = ['good', 'good', '', 'bad'];
const TIER_NAMES = { 1: { en: 'High-grade', zh: '高档' }, 2: { en: 'Mid-grade', zh: '中档' }, 3: { en: 'Low-grade', zh: '低档' } };
const COMMON_FUELS = [8001, 40000, 15506, 15504, 15505, 3004, 20106, 2506, 20001];
const BOX = { flexDirection: 'column', alignItems: 'stretch', gap: '4px' };

const onError = (r) => toast(reasonText(r), 'bad');
const report = (rejected) => rejected.forEach((r) => toast(`${itemName(r.id)}: ${r.reason}`, 'bad'));

// Windows with a running job refresh once a second, unless the player is dragging or typing.
function openLive(id, opts, active) {
  let timer = null;
  openWindow(id, { width: 'auto', ...opts, onClose: () => clearInterval(timer) });
  timer = setInterval(() => {
    if (!isOpen(id)) return clearInterval(timer);
    if (!active() || document.querySelector('.inv-item.ghost') || document.activeElement?.tagName === 'INPUT') return;
    refreshWindow(id);
  }, 1000);
}

function invLabels(state, ids) {
  const seen = {};
  return ids.map((id) => {
    if (id === state.player.backpack) return tr('ui.inventory');
    const f = state.furniture[state.inventories[id]?.owner];
    const name = f ? furnLabel(f) : '?';
    seen[name] = (seen[name] || 0) + 1;
    return seen[name] > 1 ? `${name} ${seen[name]}` : name;
  });
}

// Backpack / fridge tabs on the left of every cooking panel.
function sourcePane(state, ui, ids, { target, onChange, tipExtra, hint }) {
  if (!ids.includes(ui.src)) ui.src = ids[0];
  const labels = invLabels(state, ids);
  return h(
    'div',
    { class: 'col' },
    h('div', { class: 'tabs' }, ...ids.map((id, i) => h('button', { class: id === ui.src ? 'on' : '', onclick: () => ((ui.src = id), ui.refresh()) }, labels[i]))),
    h('div', { class: 'dim' }, weightLine(state, ui.src)),
    renderGrid(state, ui.src, { onChange: () => onChange(ui.src), transferTo: target, tipExtra, onUse: (i) => quickUse(state, ui.src, i), onError }),
    hint ? h('div', { class: 'dim', style: { maxWidth: '340px' } }, hint) : null
  );
}

function powerTag(f) {
  if (!needsPower(f)) return null;
  return isPowered(f) ? h('span', { class: 'dim' }, `⚡ ${say('Powered', '已通电')}`) : h('span', { class: 'bad' }, `⚡ ${say('No power', '没有电')}`);
}

function profLine(state) {
  const p = state.progress.prof.cook;
  const need = PROF.cook.need[p.lv];
  return h(
    'div',
    { class: 'row', style: { alignItems: 'center', marginBottom: '6px' } },
    h('span', {}, `${say('Cooking', '烹饪')} Lv${p.lv}`),
    need ? h('div', { style: { width: '120px' } }, bar(p.exp, need)) : null,
    need ? h('span', { class: 'dim' }, `${Math.floor(p.exp)} / ${need}`) : h('span', { class: 'dim' }, say('Max level', '已满级'))
  );
}

function heatTip(cfg) {
  const lines = COMMON_FUELS.map((id) => `${itemName(id)}: ${item(id).burn}${cfg ? ` (≈${fuelHours(cfg, item(id).burn).toFixed(1)} h)` : ''}`);
  return [`<b>${say('Fuel heat values', '燃料热值')}</b>`, ...lines, `<span class="dim">${say('Cooking wine and other liquor are ingredients, not fuel.', '料酒等酒类是食材，不能当燃料。')}</span>`].join('<br>');
}

function cookTip(cfg, inst) {
  const c = item(inst.id);
  if (isCookFuel(c)) return `<span class="warn">🔥 ${say('Heat', '热值')} ${c.burn}${cfg?.FuelRate ? ` · ≈${fuelHours(cfg, c.burn).toFixed(1)} h` : ''}</span>`;
  if (!isIngredient(c)) return c.cat === CAT.FOOD ? `<span class="dim">${say('Ready to eat, not an ingredient', '即食，不能下锅')}</span>` : '';
  const parts = [say('Ingredient', '食材')];
  const t = ingredientTier(c);
  if (t) parts.push(pickLang(TIER_NAMES[t]));
  if (c.cut) parts.push(`<span class="bad">${say('cut it first', '需先切分')}</span>`);
  if (c.burn > 0) parts.push(say('not fuel', '不能当燃料'));
  return `<span class="dim">${parts.join(' · ')}</span>`;
}

function tagCounts(tags) {
  const m = new Map();
  for (const t of tags) m.set(t, (m.get(t) || 0) + 1);
  return [...m];
}

function needsText(r) {
  if (r.items.length) return r.items.map(itemName).join(' + ');
  if (!r.tags.length) return say('Anything that fits no recipe', '什么都凑不上的食材');
  const parts = tagCounts(r.tags).map(([sub, n]) => `${subCategoryName(sub)}${n > 1 ? ` ×${n}` : ''}`);
  return `${parts.join(' + ')} · ${pickLang(TIER_NAMES[r.tier])}`;
}

function missingText(list) {
  return list
    .map((m) => {
      if (m.id) return itemName(m.id);
      const grade = m.tier ? pickLang(TIER_NAMES[m.tier]) : '';
      if (m.sub == null) return `${grade} ${say('ingredient', '食材')}`;
      return `${subCategoryName(m.sub)}${m.n > 1 ? ` ×${m.n}` : ''}${grade ? ` (${grade})` : ''}`;
    })
    .join(', ');
}

function kindLabel(match) {
  if (match.dark) return say('Dark Cuisine', '黑暗料理');
  if (match.special) return say('Special dish', '特色菜');
  return `${pickLang(TIER_NAMES[match.tier])} ${say('dish', '菜')}`;
}

function qualityLine(chances) {
  return h(
    'div',
    {},
    ...chances.map((p, i) => (p > 0.004 ? h('span', { class: QUALITY_CLASS[i], style: { marginRight: '8px' } }, `${pickLang(QUALITY_NAMES[i])} ${Math.round(p * 100)}%`) : null))
  );
}

function recipeTip(r) {
  const out = r.out.map((id, q) => `${pickLang(QUALITY_NAMES[q])}: ${tr('stat.sat')} ${item(id)?.sat ?? 0}`).join(' · ');
  return `<b>${loc(r.zh)}</b><br>${needsText(r)}<br><span class="dim">⏱ ${formatDuration(r.time)} · ${say('Cooking', '烹饪')} Lv${r.minLv}+ · ${out}</span>`;
}

// ------------------------------------------------------------------------------------------ cookers
function jobBox(state, f, d, ui) {
  const job = d.job;
  const name = job.kind === 'hotpot' ? say('Hot pot', '火锅') : loc(recipe(job.recipe).zh);
  const paused = job.tend ? !isTended(state, f.uid) : !isPowered(f);
  return h(
    'div',
    { class: 'list-item', style: BOX },
    h('div', { class: 'row', style: { alignItems: 'center' } }, h('b', {}, `${say('Cooking', '烹饪中')}: ${name}`), h('span', { class: 'spacer' }), h('span', { class: 'dim' }, formatDuration(job.dur - job.done))),
    bar(job.done, job.dur),
    paused ? h('div', { class: 'warn' }, job.tend ? say('A stove needs you beside it to keep cooking.', '灶台离不开人，守在旁边才能继续烹饪。') : say('Paused: no power.', '已暂停：没有电。')) : null,
    h(
      'div',
      { class: 'row' },
      job.tend && paused ? h('button', { onclick: () => (resumeCooking(state, f.uid), ui.refresh()) }, say('Keep cooking', '继续烹饪')) : null,
      h('button', { class: 'danger', onclick: () => (cancelCooking(state, f.uid), ui.refresh()) }, tr('ui.cancelAction'))
    )
  );
}

function previewBox(state, f, plan) {
  if (!plan.match) return h('div', { class: 'list-item dim' }, plan.problem || '—');
  const r = plan.match.recipe;
  return h(
    'div',
    { class: 'list-item', style: BOX, dataset: { tip: recipeTip(r) } },
    h('div', { class: 'row', style: { alignItems: 'center', gap: '6px' } }, h('b', {}, loc(r.zh)), h('span', { class: 'pill' }, kindLabel(plan.match)), plan.isNew ? h('span', { class: 'pill warn' }, say('New!', '新菜')) : null),
    qualityLine(plan.chances),
    h('div', { class: 'dim' }, `⏱ ${formatDuration(plan.seconds)}${plan.heatNeed ? ` · 🔥 ${plan.heatNeed} / ${Math.floor(plan.heat)}` : ''}`),
    plan.problem ? h('div', { class: 'bad' }, plan.problem) : null,
    ...potHints(state, f.uid).map((x) => h('div', { class: 'dim' }, `💡 ${say('Add', '加入')} ${missingText(x.missing)} → ${loc(x.recipe.zh)}`))
  );
}

function fuelBox(state, cfg, d, ui, tidy) {
  const heat = fuelHeat(state, d);
  return h(
    'div',
    { class: 'col' },
    h(
      'div',
      { class: 'row', style: { alignItems: 'center' } },
      h('span', { class: 'sec-title' }, `${say('Fuel', '燃料')} ${state.inventories[d.fuel].items.length}/${cfg.FuelSlotCount}`),
      h('span', { class: 'spacer' }),
      h('span', { class: 'dim', dataset: { tip: heatTip(cfg) } }, `🔥 ${Math.floor(heat)} · ≈${fuelHours(cfg, heat).toFixed(1)} h ⓘ`)
    ),
    renderGrid(state, d.fuel, { transferTo: () => ui.src, onChange: () => tidy(ui.src), tipExtra: (inst) => cookTip(cfg, inst), onError })
  );
}

function outputBox(state, f, d, ui) {
  const out = state.inventories[d.out];
  const sel = out.items.find((i) => i.uid === ui.sel);
  return h(
    'div',
    { class: 'col' },
    h('span', { class: 'sec-title' }, say('Finished dishes', '成品')),
    renderGrid(state, d.out, { transferTo: () => state.player.backpack, onChange: ui.refresh, selected: ui.sel, onSelect: (i) => ((ui.sel = i.uid), ui.refresh()), onError }),
    h(
      'div',
      { class: 'row' },
      h('button', { disabled: out.items.length ? null : true, onclick: () => (collectOutput(state, f.uid), ui.refresh()) }, tr('ui.collect')),
      sel ? h('button', { onclick: () => (enqueue(state, useItemAction(state, d.out, sel.uid, 'eat')), (ui.sel = null)) }, `${tr('ui.eat')}: ${itemName(sel.id)}`) : null
    )
  );
}

function cookerView(state, f, cfg, ui) {
  const d = cookerState(state, f);
  const plan = predictDish(state, f.uid);
  const busy = !!d.job;
  const tidy = (src) => (report(tidyCooker(state, f.uid, src)), ui.refresh());
  const tip = (inst) => cookTip(cfg, inst);
  const pot = state.inventories[d.pot];
  const start = () => {
    const r = startCooking(state, f.uid);
    if (!r.ok) return toast(r.reason, 'bad');
    toast(r.job.tend ? say('Cooking. Stay by the stove.', '开始烹饪，守在灶台旁。') : say(`Cooking, ready in ${formatDuration(r.job.dur)}.`, `开始烹饪，${formatDuration(r.job.dur)}后做好。`), 'good');
    ui.refresh();
  };
  const left = sourcePane(state, ui, cookSources(state), {
    target: () => (busy ? null : d.pot),
    onChange: tidy,
    tipExtra: tip,
    hint: canUseFridge(state) ? null : say('Reach Cooking Lv2 to cook straight from the fridge.', '烹饪等级达到2级后，可以直接取用冰箱里的食材。'),
  });
  const right = h(
    'div',
    { class: 'col', style: { minWidth: '310px' } },
    h('div', { class: 'row', style: { alignItems: 'center' } }, h('span', { class: 'sec-title' }, `${say('Ingredients', '食材')} ${pot.items.length}/${cfg.MaxFoodCount}`), h('span', { class: 'spacer' }), powerTag(f)),
    renderGrid(state, d.pot, { readonly: busy, transferTo: () => ui.src, onChange: () => tidy(ui.src), tipExtra: tip, onError }),
    d.fuel ? fuelBox(state, cfg, d, ui, tidy) : null,
    busy ? jobBox(state, f, d, ui) : previewBox(state, f, plan),
    busy
      ? null
      : h(
          'div',
          { class: 'row' },
          h('button', { class: 'primary', disabled: plan.problem ? true : null, onclick: start }, tr('ui.cook')),
          h('button', { disabled: pot.items.length ? null : true, onclick: () => (clearPot(state, f.uid), ui.refresh()) }, tr('ui.clear'))
        ),
    outputBox(state, f, d, ui)
  );
  return h('div', { class: 'row' }, left, right);
}

function entryRow(state, f, e, ui) {
  const r = e.recipe;
  const status =
    e.status === 'ready'
      ? h('span', { class: 'good' }, say('✓ Ready', '✓ 可烹饪'))
      : e.status === 'level'
        ? h('span', { class: 'bad' }, say(`Needs Cooking Lv${r.minLv}`, `需要烹饪${r.minLv}级`))
        : h('span', { class: e.status === 'near' ? 'warn' : 'dim' }, `${say('Missing', '缺少')}: ${missingText(e.missing)}`);
  const fill = () => {
    const res = fillRecipe(state, f.uid, r.id);
    if (!res.ok) return toast(res.reason, 'bad');
    ui.tab = 'cook';
    ui.refresh();
  };
  return h(
    'div',
    { class: `list-item ${e.status === 'ready' ? 'sel' : ''}`, dataset: { tip: recipeTip(r) } },
    h('b', { style: { minWidth: '110px' } }, loc(r.zh)),
    h('span', { class: 'pill' }, r.items.length ? say('Special', '特色') : pickLang(TIER_NAMES[r.tier])),
    e.discovered ? null : h('span', { class: 'pill', dataset: { tip: say('Not cooked yet this run', '本轮还没做过') } }, '?'),
    h('span', { class: 'dim', style: { flex: '1' } }, needsText(r)),
    status,
    e.status === 'ready' ? h('button', { onclick: fill }, say('Fill', '放入')) : null
  );
}

function cookbookView(state, f, ui) {
  const book = cookbook(state, f.uid);
  const list = h('div', { class: 'list', style: { maxHeight: '440px', overflowY: 'auto' } });
  const render = () => {
    clear(list);
    const q = ui.query.trim().toLowerCase();
    const shown = book.entries.filter((e) => {
      if (ui.filter === 'ready' && e.status !== 'ready') return false;
      if (ui.filter === 'new' && e.discovered) return false;
      return !q || `${loc(e.recipe.zh)} ${e.recipe.zh} ${needsText(e.recipe)}`.toLowerCase().includes(q);
    });
    for (const e of shown) list.appendChild(entryRow(state, f, e, ui));
    if (!shown.length) list.appendChild(h('div', { class: 'dim' }, say('No recipes match.', '没有匹配的菜谱。')));
  };
  const input = h('input', {
    type: 'search',
    value: ui.query,
    placeholder: say('Search dishes or ingredients…', '搜索菜名或食材…'),
    style: { flex: '1' },
    oninput: (e) => ((ui.query = e.target.value), (ui.focus = true), render()),
    onfocus: () => (ui.focus = true),
    onblur: (e) => e.target.isConnected && (ui.focus = false),
  });
  if (ui.focus) setTimeout(() => (input.focus(), input.setSelectionRange(input.value.length, input.value.length)), 0);
  const filters = [
    ['all', say('All', '全部')],
    ['ready', say('Can cook', '可烹饪')],
    ['new', say('Not cooked yet', '未做过')],
  ];
  render();
  return h(
    'div',
    { class: 'col', style: { width: '600px' } },
    h('div', { class: 'row', style: { alignItems: 'center' } }, input, ...filters.map(([k, label]) => h('button', { class: ui.filter === k ? 'primary' : '', onclick: () => ((ui.filter = k), ui.refresh()) }, label))),
    list,
    h(
      'div',
      { class: 'dim' },
      book.hidden
        ? say(`${book.hidden} more recipes to discover: experiment, or raise your Cooking proficiency to reveal them.`, `还有${book.hidden}道菜谱未发现：多尝试搭配，或提升烹饪熟练度来解锁提示。`)
        : say('You know every recipe this cooker can make.', '这台炊具能做的菜谱你都掌握了。')
    )
  );
}

function openCooker(state, f, cfg) {
  const id = `cook-${f.uid}`;
  const ui = { tab: 'cook', src: state.player.backpack, sel: null, query: '', filter: 'all', focus: false, refresh: () => refreshWindow(id) };
  const tab = (key, label) => h('button', { class: ui.tab === key ? 'on' : '', onclick: () => ((ui.tab = key), ui.refresh()) }, label);
  openLive(
    id,
    {
      title: furnLabel(f),
      build: (body) => {
        body.appendChild(h('div', { class: 'row', style: { alignItems: 'center' } }, h('div', { class: 'tabs' }, tab('cook', say('Cooking', '烹饪')), tab('book', say('Cookbook', '菜谱'))), h('span', { class: 'spacer' }), profLine(state)));
        body.appendChild(ui.tab === 'book' ? cookbookView(state, f, ui) : cookerView(state, f, cfg, ui));
      },
    },
    () => !!f.data.cook?.job
  );
}

// ------------------------------------------------------------------------------------------ hot pot
function hotPotView(state, f, cfg, ui) {
  const p = hotPotPreview(state, f.uid);
  const d = p.d;
  const tidy = (src) => (report(tidyCooker(state, f.uid, src)), ui.refresh());
  const tip = (inst) => cookTip(cfg, inst);
  const left = d.hotpot;
  const eat = () => {
    const r = eatHotPot(state, f.uid);
    if (!r.ok) toast(r.reason, 'bad');
  };
  const cook = () => {
    const r = startHotPot(state, f.uid);
    toast(r.ok ? say('The pot is on.', '火锅煮上了。') : r.reason, r.ok ? 'good' : 'bad');
    ui.refresh();
  };
  return h(
    'div',
    { class: 'row' },
    sourcePane(state, ui, cookSources(state), { target: () => (d.job ? null : d.pot), onChange: tidy, tipExtra: tip }),
    h(
      'div',
      { class: 'col', style: { minWidth: '300px' } },
      h('div', { class: 'row', style: { alignItems: 'center' } }, h('span', { class: 'sec-title' }, `${say('Ingredients', '食材')} ${p.items.length}/${cfg.MaxFoodCount}`), h('span', { class: 'spacer' }), powerTag(f)),
      renderGrid(state, d.pot, { readonly: !!d.job, transferTo: () => ui.src, onChange: () => tidy(ui.src), tipExtra: tip, onError }),
      d.job
        ? jobBox(state, f, d, ui)
        : h(
            'div',
            { class: 'list-item', style: BOX },
            p.items.length
              ? h('div', {}, `${say('Hot pot', '火锅')}: ${tr('stat.sat')} ${Math.round(p.sat)} · ${tr('stat.mor')} +${Math.round(p.mor)} · ⏱ ${formatDuration(p.seconds)}`)
              : h('div', { class: 'dim' }, say('Put ingredients in, cook a pot, then eat until you are full.', '把食材下锅煮一锅火锅，然后围着锅吃到饱。')),
            p.problem && p.items.length ? h('div', { class: 'bad' }, p.problem) : null
          ),
      d.job ? null : h('button', { class: 'primary', disabled: p.problem ? true : null, onclick: cook }, say('Cook hot pot', '煮火锅')),
      left
        ? h(
            'div',
            { class: 'list-item', style: BOX },
            h('b', {}, say('In the pot', '锅里还有')),
            bar(left.sat, left.total, 'sat'),
            h('div', { class: 'dim' }, `${tr('stat.sat')} ${Math.round(left.sat)} · ${tr('stat.mor')} +${Math.round(left.mor)}`),
            h('button', { class: 'primary', onclick: eat }, say('Eat until full', '吃到饱'))
          )
        : null
    )
  );
}

function openHotPot(state, f, cfg) {
  const id = `cook-${f.uid}`;
  const ui = { src: state.player.backpack, refresh: () => refreshWindow(id) };
  openLive(id, { title: furnLabel(f), build: (body) => body.appendChild(hotPotView(state, f, cfg, ui)) }, () => !!f.data.cook?.job);
}

// ------------------------------------------------------------------------------------------ pre-disaster trial
function openTrial(state, f) {
  const id = `cook-trial-${f.uid}`;
  const lines = [
    say('Put up to four or five ingredients in the pot. An exact set of ingredients makes a special dish; otherwise the mix of ingredient types (meat, vegetables, staples…) makes a home-style dish.', '往锅里放四五份食材。特定食材组合能做出特色菜，否则按食材种类（肉、蔬菜、主食……）搭配出家常菜。'),
    say('Pricier ingredients raise a home-style dish to a finer grade. Anything that fits no recipe turns into Dark Cuisine.', '食材越贵，家常菜的档次越高。什么都凑不上的，就成了黑暗料理。'),
    say('Quality (Perfect, Good, Normal, Fail) depends on your cooking proficiency and the cooker. One ingredient is a safe bet; big combinations can shine or flop.', '品质（完美、优良、普通、失败）取决于烹饪熟练度和炊具。单一食材稳妥，复杂搭配可能惊艳也可能翻车。'),
    say('Stoves burn fuel and need you beside them; microwaves and ovens cook on their own as long as they have power.', '灶台要烧燃料，还得有人守着；微波炉和烤箱只要有电就能自己做好。'),
  ];
  openWindow(id, {
    title: `${furnLabel(f)} · ${say('Try cooking', '试用烹饪')}`,
    width: 460,
    build: (body) => {
      for (const text of lines) body.appendChild(h('p', { style: { margin: '0 0 8px', lineHeight: '1.5' } }, text));
      body.appendChild(h('div', { class: 'dim', dataset: { tip: heatTip(cookerConfig(f)) } }, `🔥 ${say('Fuel heat values (hover)', '燃料热值（悬停查看）')}`));
      body.appendChild(
        h(
          'button',
          {
            class: 'primary',
            style: { marginTop: '8px' },
            onclick: () => {
              trialCooking(state);
              toast(say('You get a feel for the stove.', '你大概摸清了灶台的脾气。'), 'good');
              closeWindow(id);
            },
          },
          say('Give it a try', '试一试')
        )
      );
    },
  });
}

registerPanel('cook', ({ furn: uid, spec = {} } = {}) => {
  const state = game.state;
  const f = state?.furniture[uid];
  if (!f) return;
  if (spec.trial) return openTrial(state, f);
  const cfg = cookerConfig(f);
  if (!cfg || cfg.CookMode === COOK_MODE.PRESS) return toast(say('You cannot cook with this.', '这个不能用来烹饪。'), 'bad');
  if (spec.hotpot || cfg.CookMode === COOK_MODE.HOTPOT) return openHotPot(state, f, cfg);
  openCooker(state, f, cfg);
});

// ------------------------------------------------------------------------------------------ brewing barrel
function brewView(state, f, ui) {
  const st = brewStatus(state, f.uid);
  const tidy = (src) => (report(tidyBarrel(state, f.uid, src)), ui.refresh());
  const tip = (inst) => (isBrewable(item(inst.id)) ? `<span class="dim">${say('Brewable', '可酿造')} · ${tr('stat.sat')} ${Math.round(foodSat(inst))}</span>` : '');
  const brew = () => {
    const r = startBrewing(state, f.uid);
    toast(r.ok ? say(`Sealed. Fermenting for ${BREW.hours} hours.`, `已封桶，发酵${BREW.hours}小时。`) : r.reason, r.ok ? 'good' : 'bad');
    ui.refresh();
  };
  const takeAll = () => {
    const bp = state.inventories[state.player.backpack];
    for (const inst of [...st.inv.items]) moveItem(state, st.inv, inst.uid, bp, null, null, { allowOverweight: true });
    ui.refresh();
  };
  const job = st.job;
  const status = job
    ? h(
        'div',
        { class: 'list-item', style: BOX },
        h('div', { class: 'row', style: { alignItems: 'center' } }, h('b', {}, `${say('Fermenting', '发酵中')}: ${itemName(job.out)} ×${job.n}`), h('span', { class: 'spacer' }), h('span', { class: 'dim' }, formatDuration(st.left))),
        bar(job.endsAt - job.startedAt - st.left, job.endsAt - job.startedAt),
        h('div', { class: 'dim' }, say('The barrel is sealed; nothing inside can be eaten until it is done.', '酒桶已封，发酵完成前里面的东西都不能食用。'))
      )
    : h(
        'div',
        { class: 'list-item', style: BOX },
        h('div', { class: 'row' }, h('span', {}, say('Brewing line', '酿造线')), h('span', { class: 'spacer' }), h('span', {}, `${Math.floor(st.total)} / ${BREW.line}`)),
        bar(Math.min(st.total, BREW.line), BREW.line, 'sat'),
        st.bottles
          ? h('div', { class: 'good' }, say(`Yields ${st.bottles}× ${itemName(st.out)} after ${BREW.hours} h.`, `${BREW.hours}小时后得到${itemName(st.out)}×${st.bottles}。`))
          : h('div', { class: 'warn' }, say(`${Math.ceil(st.need)} more Satiety needed to reach the brewing line.`, `还差${Math.ceil(st.need)}点饱腹值到达酿造线。`))
      );
  return h(
    'div',
    { class: 'row' },
    sourcePane(state, ui, pressSources(state), {
      target: () => (job ? null : st.inv.id),
      onChange: tidy,
      tipExtra: tip,
      hint: say('Grain, fruit and vegetables ferment into alcohol for Molotovs, disinfectant and fuel. Better ingredients make stronger alcohol.', '粮食和果蔬能发酵成酒精，可用来做燃烧瓶、消毒剂或当燃料。料越好，酒越烈。'),
    }),
    h(
      'div',
      { class: 'col', style: { minWidth: '280px' } },
      h('span', { class: 'sec-title' }, say('Barrel', '酒桶')),
      renderGrid(state, st.inv.id, { readonly: !!job, transferTo: () => ui.src, onChange: () => tidy(ui.src), tipExtra: tip, onError }),
      status,
      h(
        'div',
        { class: 'row' },
        job ? null : h('button', { class: 'primary', onclick: brew }, say('Seal and brew', '封桶酿造')),
        job ? null : h('button', { disabled: st.inv.items.length ? null : true, onclick: takeAll }, tr('ui.takeAll'))
      )
    )
  );
}

registerPanel('brew', ({ furn: uid } = {}) => {
  const state = game.state;
  const f = state?.furniture[uid];
  if (!f || !brewStatus(state, uid)) return;
  const id = `brew-${uid}`;
  const ui = { src: state.player.backpack, refresh: () => refreshWindow(id) };
  openLive(id, { title: furnLabel(f), build: (body) => body.appendChild(brewView(state, f, ui)) }, () => !!f.data.brew?.job);
});

// ------------------------------------------------------------------------------------------ ration press
function pressView(state, f, ui) {
  const p = pressPreview(state, f.uid);
  const d = p.d;
  const tidy = (src) => (report(tidyPress(state, f.uid, src)), ui.refresh());
  const tip = (inst) => {
    const c = item(inst.id);
    const ration = rationSatiety(inst.id);
    if (c?.id === RATION.fragment) return `<span class="dim">${tr('stat.sat')} +${ration} · ${say('four fragments press back into a block', '四块碎屑可以压回一整块')}</span>`;
    if (ration) return `<span class="dim">${tr('stat.sat')} +${ration}</span>`;
    if (!isPressable(c)) return '';
    return `<span class="dim">→ ${itemName(rationFlavor(c))} · ${tr('stat.sat')} ${Math.round(foodSat(inst) * RATION.keep)}</span>`;
  };
  const press = () => {
    const r = startPress(state, f.uid);
    toast(r.ok ? say('The press is running.', '压制机开始工作。') : r.reason, r.ok ? 'good' : 'bad');
    ui.refresh();
  };
  const job = d.job;
  const status = job
    ? h(
        'div',
        { class: 'list-item', style: BOX },
        h('div', { class: 'row', style: { alignItems: 'center' } }, h('b', {}, say('Pressing…', '压制中…')), h('span', { class: 'spacer' }), h('span', { class: 'dim' }, formatDuration(job.dur - job.done))),
        bar(job.done, job.dur),
        isPowered(f) ? null : h('div', { class: 'warn' }, say('Paused: no power.', '已暂停：没有电。'))
      )
    : h(
        'div',
        { class: 'list-item', style: BOX },
        p.out.length ? h('div', {}, p.out.map(([id, n]) => `${itemName(id)} ×${n}`).join(' · ')) : null,
        p.out.length ? h('div', { class: 'dim' }, `${say('Keeps 60% of the nutrition, 30 Satiety per block', '保留六成营养，每块30点饱腹')} · ⏱ ${formatDuration(p.seconds)}`) : null,
        p.problem ? h('div', { class: p.items.length ? 'bad' : 'dim' }, p.problem) : null
      );
  const out = state.inventories[d.out];
  return h(
    'div',
    { class: 'row' },
    sourcePane(state, ui, pressSources(state), {
      target: () => (job ? null : d.slot),
      onChange: tidy,
      tipExtra: tip,
      hint: say('Food you cannot finish becomes rations that keep for a month. Rodents make rat-flavored rations.', '吃不完的食物可以压成能放一个月的口粮。老鼠之类会压成鼠味口粮。'),
    }),
    h(
      'div',
      { class: 'col', style: { minWidth: '280px' } },
      h('div', { class: 'row', style: { alignItems: 'center' } }, h('span', { class: 'sec-title' }, say('Press slot', '压制槽')), h('span', { class: 'spacer' }), powerTag(f)),
      renderGrid(state, d.slot, { readonly: !!job, transferTo: () => ui.src, onChange: () => tidy(ui.src), tipExtra: tip, onError }),
      status,
      job ? null : h('button', { class: 'primary', disabled: p.problem ? true : null, onclick: press }, say('Press', '压制')),
      h('span', { class: 'sec-title' }, say('Rations', '口粮')),
      renderGrid(state, d.out, { transferTo: () => state.player.backpack, onChange: ui.refresh, tipExtra: tip, onError }),
      h('button', { disabled: out.items.length ? null : true, onclick: () => (collectOutput(state, f.uid), ui.refresh()) }, tr('ui.collect'))
    )
  );
}

registerPanel('rationPress', ({ furn: uid } = {}) => {
  const state = game.state;
  const f = state?.furniture[uid];
  if (!f || !pressPreview(state, uid)) return;
  const id = `press-${uid}`;
  const ui = { src: state.player.backpack, refresh: () => refreshWindow(id) };
  openLive(id, { title: furnLabel(f), build: (body) => body.appendChild(pressView(state, f, ui)) }, () => !!f.data.press?.job);
});

for (const ev of ['cooked', 'hotpotReady', 'brewed', 'pressed', 'recipeUnlocked', 'recipesUnlocked', 'cookCancelled']) on(ev, () => refreshWindows());
