// Codex window (S01, S02): six tabs (Food 173, Dishes 493, Plants 34, Prey 19, Crafts 124, Furniture 87) with
// entry details, completion, the milestone bar with souvenir rewards (09-12: end nodes stay visible) and search.
import { h, clear, openWindow, closeWindow, refreshWindow, isOpen, bar } from './dom.js';
import { registerPanel, openPanel } from './panels.js';
import { registerMenuButton } from './menus.js';
import { registerToolbarButton } from './hud.js';
import { itemIcon } from './invgrid.js';
import { game } from '../game.js';
import { tr, pickLang, loc, getLang } from '../engine/i18n.js';
import { on } from '../engine/bus.js';
import { item, itemName, furn, furnName, recipe, plant, craft, func, subCategoryName, foodTypeName, SLOT, ELEC } from '../data/db.js';
import {
  CODEX_CATS,
  CODEX_CAT_INFO,
  MILESTONES,
  codexList,
  codexCount,
  codexTotal,
  codexCompletion,
  codexUnlockedSet,
  milestonesFor,
  milestoneReached,
  milestoneText,
  syncLiveCodex,
} from '../meta/codex.js';

const view = { cat: 'food', query: '', unlockedOnly: false, sel: null };

const CJK = /[\u3400-\u9fff]/;
const SLOT_NAMES = {
  [SLOT.SMALL]: { en: 'Small', zh: '小型' },
  [SLOT.MEDIUM]: { en: 'Medium', zh: '中型' },
  [SLOT.LARGE]: { en: 'Large', zh: '大型' },
  [SLOT.WALL]: { en: 'Wall', zh: '挂壁' },
  [SLOT.TABLETOP]: { en: 'Tabletop', zh: '桌上' },
  [SLOT.BED]: { en: 'Bed', zh: '床位' },
  [SLOT.DOOR]: { en: 'Door', zh: '门' },
  [SLOT.WINDOW]: { en: 'Window', zh: '窗' },
  [SLOT.DEFENSE]: { en: 'Defense Line', zh: '防线' },
};

const L = {
  sat: { en: 'Satiety', zh: '饱腹' },
  mor: { en: 'Morale', zh: '心态' },
  sta: { en: 'Stamina', zh: '精力' },
  life: { en: 'Life', zh: '生命' },
  shelf: { en: 'Shelf life', zh: '保质期' },
  weight: { en: 'Weight', zh: '重量' },
  price: { en: 'Price', zh: '价格' },
  type: { en: 'Type', zh: '类别' },
  time: { en: 'Time', zh: '耗时' },
  level: { en: 'Level', zh: '等级' },
};

const DISCOVER_HINT = {
  food: { en: 'Not discovered yet. Eat it once to record it.', zh: '尚未发现。吃过一次即可记录。' },
  dish: { en: 'Not discovered yet. Cook it once to record it.', zh: '尚未发现。做出一次即可记录。' },
  plant: { en: 'Not discovered yet. Grow and harvest it once.', zh: '尚未发现。种出并收获一次即可记录。' },
  prey: { en: 'Not discovered yet. Catch one with a trap.', zh: '尚未发现。用陷阱抓到一只即可记录。' },
  craft: { en: 'Not discovered yet. Craft it once at the workbench.', zh: '尚未发现。在工作台制造一次即可记录。' },
  furniture: { en: 'Not discovered yet. Install it at home once.', zh: '尚未发现。在家中安装一次即可记录。' },
};

// Config descriptions are Chinese; show them in English only when a translation exists.
function locDesc(zh) {
  const s = loc(zh || '');
  return getLang() !== 'zh' && CJK.test(s) ? '' : s;
}

const days = (n) => (n < 0 ? '∞' : pickLang({ en: `${n} d`, zh: `${n}天` }));
const kg = (g) => `${(g / 1000).toFixed(g % 1000 ? 1 : 0)} kg`;
const mins = (sec) => (sec >= 3600 ? `${(sec / 3600).toFixed(sec % 3600 ? 1 : 0)} h` : `${Math.round(sec / 60)} min`);
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

function tally(ids) {
  const m = new Map();
  for (const id of ids || []) m.set(id, (m.get(id) || 0) + 1);
  return [...m].map(([id, n]) => `${itemName(id)}${n > 1 ? ` ×${n}` : ''}`).join(', ');
}

function foodStats(cfg) {
  const out = [];
  if (cfg.sat) out.push([pickLang(L.sat), signed(cfg.sat)]);
  if (cfg.mor) out.push([pickLang(L.mor), signed(cfg.mor)]);
  if (cfg.sta) out.push([pickLang(L.sta), signed(cfg.sta)]);
  if (cfg.hp) out.push([pickLang(L.life), signed(cfg.hp)]);
  if (cfg.life) out.push([pickLang(L.shelf), days(cfg.life)]);
  out.push([pickLang(L.weight), kg(cfg.g)]);
  if (cfg.sub) out.push([pickLang(L.type), subCategoryName(cfg.sub)]);
  return out;
}

function furnitureIcon(d) {
  if (!d) return '🛋';
  if (d.slot === SLOT.DOOR) return '🚪';
  if (d.slot === SLOT.WINDOW) return '🪟';
  if (d.slot === SLOT.BED) return '🛏';
  if (d.slot === SLOT.DEFENSE) return '🚧';
  if (d.plant) return '🪴';
  if (d.cook) return '🍳';
  if (d.elec && d.elec !== ELEC.CONSUMER) return '⚡';
  if ((d.funcs || []).some((k) => k === 1 || k === 5)) return '🗄';
  return '🛋';
}

// { name, icon, desc, stats: [[label, value]] } for one codex entry.
export function entryInfo(cat, id) {
  switch (cat) {
    case 'food':
    case 'prey': {
      const cfg = item(id);
      if (!cfg) return { name: `#${id}`, icon: '?', desc: '', stats: [] };
      const stats = foodStats(cfg);
      if (cat === 'prey') stats.push([pickLang({ en: 'Rarity', zh: '稀有度' }), '★'.repeat(Math.max(1, cfg.prey || 1))]);
      return { name: itemName(id), icon: itemIcon(cfg), desc: locDesc(cfg.d2 || cfg.d1), stats };
    }
    case 'dish': {
      const r = recipe(id);
      if (!r) return { name: `#${id}`, icon: '🍲', desc: '', stats: [] };
      const best = item(r.out[0]);
      const stats = [];
      if (r.items.length) stats.push([pickLang({ en: 'Ingredients', zh: '食材' }), tally(r.items)]);
      if (r.tags.length) stats.push([pickLang({ en: 'Food types', zh: '食材类别' }), r.tags.map((t) => foodTypeName(t)).join(' + ')]);
      if (best?.sat) stats.push([`${pickLang(L.sat)} (${pickLang({ en: 'perfect', zh: '完美' })})`, signed(best.sat)]);
      if (best?.mor) stats.push([pickLang(L.mor), signed(best.mor)]);
      if (r.time) stats.push([pickLang(L.time), mins(r.time)]);
      if (r.minLv) stats.push([pickLang({ en: 'Cooking level', zh: '烹饪等级' }), `Lv${r.minLv}`]);
      return { name: loc(r.zh), icon: id === 100 ? '💀' : '🍲', desc: best ? locDesc(best.d2 || best.d1) : '', stats };
    }
    case 'plant': {
      const p = plant(id);
      if (!p) return { name: `#${id}`, icon: '🌱', desc: '', stats: [] };
      const light = [{ en: 'None', zh: '不需要' }, { en: 'Some', zh: '少量' }, { en: 'Full sun', zh: '充足' }][p.light] || { en: '?', zh: '?' };
      const cold = [{ en: 'Tender', zh: '怕冷' }, { en: 'Hardy', zh: '较耐寒' }, { en: 'Very hardy', zh: '耐寒' }, { en: 'Frost-proof', zh: '极耐寒' }][p.cold] || { en: '?', zh: '?' };
      return {
        name: loc(p.zh),
        icon: '🌱',
        desc: locDesc(p.desc),
        stats: [
          [pickLang({ en: 'Growth', zh: '生长期' }), mins(p.grow)],
          [pickLang({ en: 'Light', zh: '光照' }), pickLang(light)],
          [pickLang({ en: 'Cold', zh: '耐寒' }), pickLang(cold)],
          [pickLang({ en: 'Yield', zh: '收获' }), tally(p.gain)],
          [pickLang({ en: 'Perfect yield', zh: '完美收获' }), `${tally(p.pGain)} (${Math.round((p.pRate || 0) * 100)}%)`],
          [pickLang({ en: 'Pests / weeds / drought', zh: '虫害/杂草/干旱' }), [p.pest, p.weed, p.dry].map((x) => `${Math.round((x || 0) * 100)}%`).join(' / ')],
        ],
      };
    }
    case 'craft': {
      const c = craft(id);
      if (!c) return { name: `#${id}`, icon: '🛠', desc: '', stats: [] };
      const out = item(c.out[0]);
      const stats = [
        [pickLang({ en: 'Materials', zh: '材料' }), tally(c.mat)],
        [pickLang({ en: 'Output', zh: '产出' }), tally(c.out)],
        [pickLang(L.time), mins((c.lifeMin || 0) * 60)],
        [pickLang({ en: 'Crafting level', zh: '制造等级' }), `Lv${c.lv || 1}`],
      ];
      if (c.pOut?.length) stats.push([pickLang({ en: 'Perfect bonus', zh: '完美额外产出' }), tally(c.pOut)]);
      return { name: loc(c.zh), icon: out ? itemIcon(out) : '🛠', desc: out ? locDesc(out.d2 || out.d1) : '', stats };
    }
    case 'furniture': {
      const d = furn(id);
      if (!d) return { name: `#${id}`, icon: '🛋', desc: '', stats: [] };
      const zh = getLang() === 'zh';
      const funcs = [...new Set((d.funcs || []).map((k) => loc(func(k)?.zh || '')).filter((s) => s && (zh || !CJK.test(s))))].slice(0, 6);
      const stats = [[pickLang({ en: 'Slot', zh: '位置' }), pickLang(SLOT_NAMES[d.slot] || { en: '—', zh: '—' })]];
      if (d.price) stats.push([pickLang(L.price), `$${d.price}`]);
      if (d.slot === SLOT.DOOR || d.slot === SLOT.WINDOW || d.slot === SLOT.DEFENSE) stats.push([pickLang({ en: 'Durability', zh: '耐久' }), String(d.hp)]);
      if (d.pw) stats.push([pickLang({ en: 'Power', zh: '功率' }), `${d.pw} W`]);
      if (funcs.length) stats.push([pickLang({ en: 'Functions', zh: '功能' }), funcs.join(', ')]);
      return { name: furnName(id), icon: furnitureIcon(d), desc: locDesc(d.desc), stats };
    }
    default:
      return { name: `#${id}`, icon: '?', desc: '', stats: [] };
  }
}

function milestoneBar(cat, hist) {
  const list = milestonesFor(cat);
  const total = codexTotal(cat);
  const have = codexCount(hist, cat);
  const info = CODEX_CAT_INFO[cat];
  if (!list.length) return null;
  const pct = (n) => Math.max(3, Math.min(97, (n / total) * 100));
  return h(
    'div',
    { style: { margin: '6px 0 10px' } },
    h('div', { class: 'row', style: { alignItems: 'center' } }, h('span', { class: 'sec-title' }, pickLang(info.bar)), h('span', { class: 'dim' }, `${have} / ${total}`)),
    h(
      'div',
      { style: { position: 'relative', height: '46px', margin: '0 14px' } },
      h(
        'div',
        { style: { position: 'absolute', left: 0, right: 0, top: '30px', height: '8px', background: '#0d0f11', border: '1px solid #2c3036', borderRadius: '4px', overflow: 'hidden' } },
        h('div', { style: { height: '100%', width: `${Math.min(100, (have / total) * 100)}%`, background: 'var(--accent)' } })
      ),
      ...list.map((m) => {
        const done = milestoneReached(hist, m);
        return h(
          'div',
          {
            style: {
              position: 'absolute',
              left: `${pct(m.count)}%`,
              top: 0,
              transform: 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              cursor: 'help',
            },
            dataset: {
              tip: `<b>${pickLang(m.name)}</b><br>${milestoneText(m)}<br>${pickLang({ en: 'Reward', zh: '奖励' })}: ${furnName(m.furn)}<br><span class="dim">${pickLang({
                en: 'Souvenir recipe, unlocked for every save',
                zh: '纪念品配方，所有存档通用',
              })}</span>`,
            },
          },
          h('span', { style: { fontSize: '18px', filter: done ? 'none' : 'grayscale(1) opacity(0.6)' } }, m.icon),
          h('span', { style: { fontSize: '10px', color: done ? 'var(--good)' : 'var(--dim)', marginTop: '14px' } }, String(m.count))
        );
      })
    )
  );
}

function detail(cat, id, unlocked) {
  if (id == null) {
    return h('div', { class: 'dim' }, pickLang({ en: 'Select an entry to see its details.', zh: '选择一个条目查看详情。' }));
  }
  if (!unlocked) {
    return h(
      'div',
      { class: 'col' },
      h('div', { style: { fontSize: '34px', filter: 'grayscale(1)' } }, '❔'),
      h('b', {}, '???'),
      h('div', { class: 'dim' }, pickLang(DISCOVER_HINT[cat]))
    );
  }
  const info = entryInfo(cat, id);
  return h(
    'div',
    { class: 'col' },
    h('div', { style: { fontSize: '34px' } }, info.icon),
    h('b', { style: { fontSize: '15px', color: 'var(--accent)' } }, info.name),
    info.desc ? h('div', { class: 'dim', style: { fontStyle: 'italic', lineHeight: 1.4 } }, info.desc) : null,
    h('div', { class: 'kv', style: { gridTemplateColumns: 'auto 1fr', fontSize: '12px' } }, ...info.stats.flatMap(([k, v]) => [h('span', { class: 'dim' }, k), h('span', {}, v)]))
  );
}

function tiles(cat, hist) {
  const have = codexUnlockedSet(hist, cat);
  const q = view.query.trim().toLowerCase();
  const out = [];
  codexList(cat).forEach((id, i) => {
    const unlocked = have.has(id);
    if (view.unlockedOnly && !unlocked) return;
    let name = '???';
    let icon = '';
    if (unlocked) {
      const info = entryInfo(cat, id);
      name = info.name;
      icon = info.icon;
    }
    if (q && (!unlocked || !name.toLowerCase().includes(q))) return;
    out.push(
      h(
        'div',
        {
          style: {
            width: '84px',
            height: '64px',
            padding: '4px',
            borderRadius: '5px',
            background: unlocked ? '#23272d' : '#16181b',
            border: `1px solid ${view.sel === id ? 'var(--accent)' : '#2c3036'}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            cursor: 'pointer',
            fontSize: '10px',
            lineHeight: 1.1,
            overflow: 'hidden',
          },
          onclick: () => {
            view.sel = id;
            refreshWindow('codex');
          },
        },
        h('span', { style: { fontSize: '18px' } }, unlocked ? icon : h('span', { class: 'dim' }, `#${i + 1}`)),
        h('span', { class: unlocked ? '' : 'dim' }, name)
      )
    );
  });
  return out;
}

function build(body) {
  const hist = game.history;
  const comp = codexCompletion(hist);
  const cat = view.cat;
  body.appendChild(
    h(
      'div',
      { class: 'row', style: { alignItems: 'center', marginBottom: '6px' } },
      h('b', {}, pickLang({ en: 'Completion', zh: '完成度' })),
      h('div', { style: { flex: '1' } }, bar(comp.all.have, comp.all.total)),
      h('span', { class: 'dim' }, `${comp.all.have} / ${comp.all.total} (${comp.all.pct}%)`),
      h('button', { onclick: () => openPanel('achievements') }, `🏆 ${tr('menu.achievements')}`),
      h('button', { onclick: () => openPanel('profile') }, `🪪 ${tr('menu.profile')}`)
    )
  );
  body.appendChild(
    h(
      'div',
      { class: 'tabs' },
      ...CODEX_CATS.map((c) =>
        h(
          'button',
          {
            class: view.cat === c ? 'on' : '',
            onclick: () => {
              view.cat = c;
              view.sel = null;
              refreshWindow('codex');
            },
          },
          `${CODEX_CAT_INFO[c].icon} ${pickLang(CODEX_CAT_INFO[c].name)} ${comp[c].have}/${comp[c].total}`
        )
      )
    )
  );
  body.appendChild(milestoneBar(cat, hist));
  const grid = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px', alignContent: 'flex-start' } });
  const fillGrid = () => {
    clear(grid);
    const list = tiles(cat, hist);
    if (list.length) list.forEach((t) => grid.appendChild(t));
    else grid.appendChild(h('div', { class: 'dim' }, pickLang({ en: 'No matching entries.', zh: '没有匹配的条目。' })));
  };
  const search = h('input', {
    type: 'search',
    placeholder: pickLang({ en: 'Search discovered entries…', zh: '搜索已发现的条目……' }),
    value: view.query,
    style: { flex: '1' },
    oninput: (e) => {
      view.query = e.target.value;
      fillGrid();
    },
  });
  body.appendChild(
    h(
      'div',
      { class: 'row', style: { alignItems: 'center', marginBottom: '6px' } },
      search,
      h(
        'label',
        { class: 'row', style: { alignItems: 'center', gap: '4px' } },
        h('input', {
          type: 'checkbox',
          checked: view.unlockedOnly ? true : null,
          onchange: (e) => {
            view.unlockedOnly = e.target.checked;
            fillGrid();
          },
        }),
        pickLang({ en: 'Discovered only', zh: '只看已发现' })
      )
    )
  );
  fillGrid();
  const unlocked = view.sel != null && codexUnlockedSet(hist, cat).has(view.sel);
  body.appendChild(
    h(
      'div',
      { class: 'row', style: { alignItems: 'stretch' } },
      h('div', { style: { flex: '1', maxHeight: '46vh', overflowY: 'auto', paddingRight: '4px' } }, grid),
      h('div', { class: 'card', style: { width: '250px', flex: '0 0 250px' } }, detail(cat, view.sel, unlocked))
    )
  );
  const reached = MILESTONES.filter((m) => milestoneReached(hist, m)).length;
  body.appendChild(
    h(
      'div',
      { class: 'dim', style: { marginTop: '6px', fontSize: '11px' } },
      pickLang({
        en: `Milestones reached: ${reached}/${MILESTONES.length}. Souvenir recipes from milestones can be crafted in every save.`,
        zh: `已达成里程碑：${reached}/${MILESTONES.length}。里程碑解锁的纪念品配方在所有存档都能制造。`,
      })
    )
  );
}

registerPanel('codex', () => {
  syncLiveCodex();
  openWindow('codex', { title: `📖 ${tr('menu.codex')}`, width: 900, modal: !game.state, build });
});

export function toggleCodex() {
  if (isOpen('codex')) closeWindow('codex');
  else openPanel('codex');
}

registerMenuButton({ label: () => tr('menu.codex'), run: () => openPanel('codex') });
registerToolbarButton({ label: () => `📖 ${tr('menu.codex')}`, key: 'K', panel: 'codex' });

on('codexUpdated', () => {
  if (isOpen('codex')) refreshWindow('codex');
});

