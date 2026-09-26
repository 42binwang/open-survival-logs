// Heads-up display: clock, speed, stats, effects, objectives, crises, queue, suggestions, toolbar, item
// notification bars and the pre-disaster planning bar.
import { h, clear, toast, toastLayer } from './dom.js';
import { game, setSpeed, toggleRelaxed } from '../game.js';
import { tr, pickLang } from '../engine/i18n.js';
import { on } from '../engine/bus.js';
import { formatClock, dayNumber, secondsUntilOutbreak, formatDuration } from '../sim/time.js';
import { effectiveMax, STAT_KEYS } from '../sim/stats.js';
import { EFFECTS } from '../content/effects.js';
import { ABILITIES } from '../content/abilities.js';
import { getObjectives } from '../sim/objectives.js';
import { suggestions } from '../sim/suggest.js';
import { cancelAction } from '../sim/actions.js';
import { buyAbility, abilityCost, START_ONLY_ABILITIES } from '../sim/rebirth.js';
import { openPanel } from './panels.js';
import { isDragging, itemIcon, itemColor } from './invgrid.js';
import { pointsBadge } from './settlementPanel.js';
import { homeDef, furnLabel } from '../sim/home.js';
import { item, itemName } from '../data/db.js';
import { weatherLabel } from './labels.js';
import { endlessLabel, endlessRecordText } from '../meta/endless.js';
import { glyph } from './kit/glyphs.js';

/**
 * A kit glyph (src/ui/kit/glyphs.js), or an empty span where the document cannot make SVG (the Node tests' DOM).
 * @param {string} name
 * @param {string} [label]
 */
function g(name, label) {
  if (typeof document === 'undefined' || typeof document.createElementNS !== 'function') return h('span', { class: 'sl-glyph' });
  return glyph(name, label ? { label } : {});
}

/**
 * The 24-hour dial of the source's day bar (ss_02; docs/UI.md §5.10): night half on top, day half below, hours on
 * the outer ring, one hand. Built as the style tile builds it (pages/ui-tile/tile.js).
 * @param {number} hours  fractional hour of day
 */
function dial(hours) {
  if (typeof document === 'undefined' || typeof document.createElementNS !== 'function') return h('span', { class: 'sl-clock__dial' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 144 144');
  svg.setAttribute('class', 'sl-clock__dial');
  svg.setAttribute('aria-hidden', 'true');
  const angle = (hours / 24) * 2 * Math.PI;
  const at = (/** @type {number} */ a, /** @type {number} */ r) => [72 + r * Math.sin(a), 72 - r * Math.cos(a)];
  const [hx, hy] = at(angle, 36);
  let marks = '';
  for (let hour = 2; hour <= 24; hour += 2) {
    const [x, y] = at((hour / 24) * 2 * Math.PI, 56);
    marks += `<text x="${x.toFixed(1)}" y="${(y + 4.5).toFixed(1)}">${hour}</text>`;
  }
  const hand = `x1="72" y1="72" x2="${hx.toFixed(1)}" y2="${hy.toFixed(1)}" stroke-linecap="round"`;
  const fill = (/** @type {string} */ t) => `style="fill: var(${t})"`;
  svg.innerHTML = `
    <defs><clipPath id="hud-dial-face"><circle cx="72" cy="72" r="71"/></clipPath></defs>
    <g clip-path="url(#hud-dial-face)">
      <rect x="0" y="0" width="144" height="72" ${fill('--ui-dial-night-ring')}/>
      <rect x="0" y="72" width="144" height="72" ${fill('--ui-dial-day-ring')}/>
    </g>
    <path d="M28 72a44 44 0 0 1 88 0z" ${fill('--ui-dial-night')}/>
    <path d="M28 72a44 44 0 0 0 88 0z" ${fill('--ui-dial-day')}/>
    <circle cx="72" cy="72" r="44" fill="none" style="stroke: var(--ui-dial-groove)" stroke-width="2"/>
    <circle cx="72" cy="72" r="70.5" fill="none" style="stroke: var(--ui-dial-rim)" stroke-width="1.5"/>
    <path d="M65 -10h14l-7 10z" ${fill('--ui-dial-marker')}/>
    <g class="hud-dial__marks">${marks}</g>
    <line ${hand} style="stroke: var(--ui-dial-hand-shadow)" stroke-width="6" transform="translate(1 1.5)"/>
    <line ${hand} style="stroke: var(--ui-text-strong)" stroke-width="5"/>`;
  return svg;
}

/** The glyph for an action kind in the queue slots. @param {string} kind */
function actionGlyph(kind) {
  if (/cook|eat|drink|food/.test(kind)) return 'chef';
  if (/sleep|rest|relax|sit|tv|music|record/.test(kind)) return kind === 'music' || kind === 'record' ? 'music' : 'relax';
  if (/farm|plant|water|harvest|seed/.test(kind)) return 'sprout';
  if (/repair|craft|build|reinforce|fix|work/.test(kind)) return 'tactics';
  if (/search|loot|take|pick/.test(kind)) return 'search';
  if (/walk|move|go/.test(kind)) return 'chevronLeft';
  if (/read|study|book/.test(kind)) return 'log';
  return 'hourglass';
}

let root;
let lastBuild = 0;
const toolbarButtons = [];

// Rebuild interval in ms; interface lag optimization trades HUD freshness for fewer DOM rebuilds.
export const HUD_REBUILD_MS = { normal: 200, optimized: 500 };

export function registerToolbarButton(btn) {
  toolbarButtons.push(btn);
}

export function initHud(el) {
  root = el;
  // the kit's scope (src/ui/kit/): its tokens and components style every HUD piece
  root.classList.add('sl-root');
  const fit = () => root.style?.setProperty?.('--hud-zoom', String(Math.max(0.55, Math.min(1, (globalThis.innerHeight || 1080) / 1080))));
  fit();
  globalThis.addEventListener?.('resize', fit);
}

export function showHud(show) {
  root.classList.toggle('hidden', !show);
}

export function updateHud(now, force = false) {
  const state = game.state;
  if (!state || !root || root.classList.contains('hidden')) return;
  const optimized = !!game.settings.lagOptimization;
  if (!force && now - lastBuild < (optimized ? HUD_REBUILD_MS.optimized : HUD_REBUILD_MS.normal)) return;
  if (!force && optimized && isDragging()) return;
  lastBuild = now;
  root.setAttribute('lang', pickLang({ en: 'en', zh: 'zh' }));
  clear(root);
  root.appendChild(topBar(state));
  root.appendChild(statsBox(state));
  const obj = objectives(state);
  if (obj) root.appendChild(obj);
  const cb = crisisBar(state);
  if (cb) root.appendChild(cb);
  root.appendChild(rightColumn(state));
  if (state.player.scene === 'home' && state.phase !== 'pre' && !state.ui.hideSearch) root.appendChild(searchPanel(state));
  root.appendChild(queue(state));
  root.appendChild(speedControl(state));
  root.appendChild(suggestionsRow(state));
  const bar = toolbar(state);
  root.appendChild(bar);
  // the toolbar wraps to more rows as buttons appear after the outbreak: the supplies finder and the planning bar sit
  // on top of it at its measured height (styles.css --toolbar-h), never over its buttons
  root.style.setProperty('--toolbar-h', `${bar.offsetHeight}px`);
  if (state.phase === 'pre') root.appendChild(planningBar(state));
  if (state.clock.speed === 0) root.appendChild(h('div', { class: 'pausebanner sl-hud-text' }, `⏸ ${tr('time.paused')}`));
  if (game.ui?.opTipText && now - game.ui.opTipAt < 2500) root.appendChild(h('div', { class: 'optip' }, game.ui.opTipText));
}

function topBar(state) {
  const c = state.clock;
  const pre = state.phase === 'pre';
  const w = state.weather;
  const hours = (((c.startHour || 0) * 3600 + c.t) / 3600) % 24;
  const kind = w?.today?.kind || 'sunny';
  const wx = /snow|cold|freez/.test(kind) ? 'snowflake' : /rain|storm|cloud/.test(kind) ? 'cloud' : 'sun';
  const loop = state.loop?.cycle != null ? state.loop.cycle + 1 : 1;
  return h(
    'div',
    { class: 'topbar sl-daybar hud-daybar' },
    h('div', { class: 'sl-weather', role: 'img', 'aria-label': w?.today ? weatherLabel(kind) : '', dataset: { tip: w?.today ? `${weatherLabel(kind)} ${Math.round(w.today.temp)}°C${w.tomorrow ? ` · ${pickLang({ en: 'Tomorrow', zh: '明天' })}: ${weatherLabel(w.tomorrow.kind)}` : ''}` : '' } }, g(wx)),
    h(
      'div',
      { class: 'sl-day' },
      pre
        ? h('div', { class: 'countdown sl-day__count hud-countdown', dataset: { tip: tr('time.untilOutbreak') } }, `☣ ${formatDuration(secondsUntilOutbreak(state))}`)
        : h('div', { class: 'day sl-day__count' }, tr('time.day', { n: dayNumber(c) })),
      h('div', { class: 'sl-loop' }, pre ? tr('phase.pre') : pickLang({ en: `Loop: ${loop}`, zh: `轮回：${loop}` }))
    ),
    h('div', { class: 'sl-clock' }, dial(hours), h('div', { class: 'clock sl-clock__digits' }, formatClock(c))),
    h('button', { class: 'sl-btn sl-btn--ghost hud-menu', dataset: { tip: 'Esc' }, 'aria-label': pickLang({ en: 'Menu', zh: '菜单' }), onclick: () => openPanel('pause') }, '☰')
  );
}

/** Play speed as the source's segmented control, with the Relaxed toggle beside it. @param {any} state */
function speedControl(state) {
  const c = state.clock;
  const speedBtn = (/** @type {number} */ n, /** @type {string} */ gl, /** @type {string} */ key, /** @type {string} */ label) =>
    h('button', { class: `sl-speed__btn ${c.speed === n && !(n > 0 && c.relaxed) ? 'on' : ''}`, 'aria-pressed': c.speed === n && !(n > 0 && c.relaxed) ? 'true' : 'false', 'aria-label': label, dataset: { tip: key }, onclick: () => setSpeed(n) }, g(gl));
  return h(
    'div',
    { class: 'speed sl-speed hud-speed' },
    h('button', { class: `sl-speed__btn hud-relaxed ${c.relaxed ? 'on' : ''}`, 'aria-pressed': c.relaxed ? 'true' : 'false', dataset: { tip: `${tr('time.relaxed')} (~)` }, onclick: () => toggleRelaxed() }, '~'),
    speedBtn(1, 'play', '1', 'Play'),
    speedBtn(2, 'fast', '2', 'Fast'),
    speedBtn(3, 'faster', '3', 'Faster'),
    speedBtn(0, 'pause', '4 / 0', tr('time.paused'))
  );
}

/** The right-hand column under the day bar: navigation (Log, Tactics, Track, Layout), power and room rows. @param {any} state */
function rightColumn(state) {
  const byKey = (/** @type {string} */ k) => toolbarButtons.find((b) => b.key === k && (!b.visible || b.visible(state)));
  const nav = [
    [{ en: 'Log', zh: '日志' }, 'log', 'L'],
    [{ en: 'Tactics', zh: '战术' }, 'tactics', 'D'],
    [{ en: 'Track', zh: '追踪' }, 'track', 'M'],
    [{ en: 'Layout', zh: '布局' }, 'layout', 'N'],
  ]
    .map(([label, gl, key]) => ({ label, gl, b: byKey(/** @type {string} */ (key)) }))
    .filter((n) => n.b);
  const pw = state.power;
  const powered = pw ? pw.homePowered !== false : null;
  const w = state.weather?.today;
  return h(
    'div',
    { class: 'hud-right' },
    nav.length
      ? h(
          'div',
          { class: 'sl-nav' },
          ...nav.map((n) =>
            h(
              'button',
              { class: 'sl-nav__item', dataset: { tip: n.b.key }, onclick: () => openPanel(n.b.panel) },
              h('span', { class: 'sl-nav__label' }, pickLang(/** @type {any} */ (n.label))),
              h('span', { class: 'sl-nav__icon' }, g(/** @type {string} */ (n.gl)))
            )
          )
        )
      : null,
    state.player.scene === 'home' ? floorTabs(state) : null,
    powered != null && state.player.scene === 'home'
      ? h('div', { class: 'sl-hudrow sl-hudrow--power hud-hudrow' }, g('plug'), powered ? pickLang({ en: 'Grid Power', zh: '电网供电' }) : pickLang({ en: 'No Power', zh: '断电' }), h('span', { class: 'sl-hudrow__value' }, g(powered ? 'caretUp' : 'caretDown')))
      : null,
    w ? h('div', { class: 'sl-hudrow hud-hudrow' }, g(/snow|cold/.test(w.kind) ? 'snowflake' : 'cloud'), weatherLabel(w.kind), h('span', { class: 'sl-hudrow__value' }, `${Math.round(w.temp)}°C`)) : null
  );
}

const STAT_LOOK = { sat: ['sat', 'satiety'], sta: ['sta', 'bolt'], mor: ['mor', 'morale'], life: ['life', 'life'] };

function statsBox(state) {
  const p = state.player;
  const rows = STAT_KEYS.map((k) => {
    const max = effectiveMax(state, k);
    const v = Math.max(0, Math.min(1, p.stats[k] / Math.max(1, max)));
    const [mod, gl] = STAT_LOOK[/** @type {keyof typeof STAT_LOOK} */ (k)] || ['sat', 'star'];
    return h(
      'div',
      { class: `stat-row sl-stat sl-stat--${mod}${v < 0.2 ? ' sl-stat--bad' : v < 0.35 ? ' sl-stat--warn' : ''}`, style: { '--v': String(v) }, role: 'meter', 'aria-valuenow': Math.round(p.stats[k]), 'aria-valuemax': Math.round(max) },
      h('span', { class: 'sl-stat__icon' }, g(gl)),
      h('span', {}, tr(`stat.${k}`)),
      h('span', { class: 'sl-stat__value' }, `${Math.round(p.stats[k])}/${Math.round(max)}`)
    );
  });
  const effects = Object.keys(p.effects).map((id) => {
    const def = EFFECTS[id];
    if (!def) return null;
    return h('span', { class: `tag sl-tag ${def.bad ? 'bad sl-tag--danger' : 'sl-tag--gold'}`, dataset: { tip: pickLang(def.desc) } }, pickLang(def.name));
  });
  return h(
    'div',
    { class: 'statsbox hud-stats' },
    h('div', { class: 'effects hud-effects' }, ...effects),
    h(
      'div',
      { class: 'money-line hud-money' },
      h('span', {}, `${tr('stat.money')} `, h('b', {}, `$${Math.round(p.money)}`)),
      h('span', { dataset: { tip: pickLang({ en: 'Planning Points: earned every day you survive and from events; spend them on abilities and planning cards.', zh: '生存点：每活过一天及事件奖励获得，用于能力与规划卡。' }) } }, `${tr('stat.points')} `, h('b', {}, String(Math.floor(state.loop.planningPoints))))
    ),
    state.meta.mode !== 'story'
      ? h('div', { class: 'warn hud-endless' }, `♾ ${endlessLabel(state) || pickLang(state.meta.mode === 'pureEndless' ? { en: 'Endless Mode', zh: '无尽模式' } : { en: 'Story Endless', zh: '剧情无尽' })}`, h('div', { class: 'dim' }, endlessRecordText(state)))
      : null,
    h('div', { class: 'sl-stats' }, ...rows)
  );
}

function objectives(state) {
  const list = getObjectives(state);
  if (!list.length) return null;
  return h(
    'nav',
    { class: 'objectives sl-objectives sl-hud-text hud-objectives' },
    h('div', { class: 'sl-obj-head sl-obj-head--main' }, g('flag'), h('h4', {}, tr('ui.objectives'))),
    ...list.slice(0, 12).map((o) =>
      h('div', { class: `objective sl-obj ${o.done ? 'done sl-obj--done' : ''} ${o.urgent ? 'warn sl-obj--main' : ''}`, onclick: o.onClick || null, dataset: o.tip ? { tip: o.tip } : null }, o.text, o.prog ? h('div', { class: 'prog' }, o.prog) : null)
    )
  );
}

function crisisBar(state) {
  const items = (state.crises.active || []).filter((c) => c.show !== false);
  const upcoming = state.crises.upcoming || [];
  const all = [...items, ...upcoming];
  if (!all.length) return null;
  return h(
    'div',
    { class: 'crisisbar hud-crisis' },
    ...all.slice(0, 3).map((c) => {
      const left = c.at != null ? c.at - state.clock.t : null;
      const urgent = left != null && left < 6 * 3600;
      return h('div', { class: `crisis sl-crisis ${c.type === 'horde' ? 'horde' : c.type === 'coldWave' ? 'cold' : ''} ${urgent || c.phase === 'attack' ? 'urgent' : ''}` }, g(c.type === 'coldWave' ? 'snowflake' : 'alert'), c.label || c.type, left != null && left > 0 ? ` · ${formatDuration(left)}` : '');
    })
  );
}

const SEARCH_CATS = [
  ['', { en: '— find supplies —', zh: '— 查找物资 —' }],
  ['food', { en: 'Food', zh: '食物' }],
  ['fridge', { en: 'Requires Fridge', zh: '需冷藏' }],
  ['medicine', { en: 'Medicine', zh: '药品' }],
  ['material', { en: 'Materials', zh: '材料' }],
  ['fuel', { en: 'Fuel', zh: '燃料' }],
  ['seed', { en: 'Seeds & Fertilizer', zh: '种子与肥料' }],
  ['sundry', { en: 'Sundries', zh: '杂物' }],
  ['defense', { en: 'Defense', zh: '防卫' }],
];

function searchMatch(cat, cfg) {
  if (!cfg) return false;
  switch (cat) {
    case 'food':
      return cfg.cat === 1;
    case 'fridge':
      return cfg.cat === 1 && cfg.life > 0 && cfg.life <= 10;
    case 'medicine':
      return cfg.cat === 2;
    case 'material':
      return cfg.cat === 9;
    case 'fuel':
      return cfg.cat === 13 || cfg.burn > 0;
    case 'seed':
      return cfg.cat === 10 || cfg.cat === 11;
    case 'sundry':
      return cfg.cat === 5 || cfg.cat === 3 || cfg.cat === 4;
    case 'defense':
      return cfg.cat === 16 || cfg.cat === 12;
    default:
      return false;
  }
}

function searchPanel(state) {
  const cat = state.ui.searchCat || '';
  const renderer = game.ui?.renderer;
  const hits = [];
  if (renderer) renderer.highlight.clear();
  if (cat) {
    for (const f of Object.values(state.furniture)) {
      if (!f.inv || state.home.slots[f.slot] !== f.uid) continue;
      const inv = state.inventories[f.inv];
      const n = inv.items.filter((it) => searchMatch(cat, item(it.id))).reduce((a, it) => a + (it.qty || 1), 0);
      if (n > 0) {
        hits.push({ f, n });
        renderer?.highlight.add(f.uid);
      }
    }
  }
  return h(
    'div',
    { class: 'searchpanel hud-search' },
    h(
      'select',
      {
        onchange: (e) => {
          state.ui.searchCat = e.target.value;
          updateHud(performance.now(), true);
        },
      },
      ...SEARCH_CATS.map(([k, l]) => h('option', { value: k, selected: cat === k ? true : null }, pickLang(l)))
    ),
    ...hits.slice(0, 8).map(({ f, n }) =>
      h(
        'div',
        {
          class: 'dim',
          style: { cursor: 'pointer' },
          onclick: () => {
            state.ui.viewFloor = f.floor;
            game.ui?.recenter?.();
          },
        },
        `${f.floor} · ${furnLabel(f)} ×${n}`
      )
    ),
    cat && !hits.length ? h('div', { class: 'dim' }, pickLang({ en: 'None stored in furniture.', zh: '家具里没有。' })) : null,
    h('div', { class: 'dim', style: { fontSize: '10px' } }, pickLang({ en: 'Z to hide', zh: '按Z隐藏' }))
  );
}

function floorTabs(state) {
  const def = homeDef(state.home.id);
  const order = ['2F', '1F', 'B1'].filter((f) => def.floors[f]);
  return h(
    'div',
    { class: 'floortabs sl-floors hud-floors' },
    ...order.map((f) =>
      h(
        'button',
        {
          class: `sl-floor ${(state.ui.viewFloor || state.player.floor) === f ? 'on' : ''}`,
          'aria-current': (state.ui.viewFloor || state.player.floor) === f ? 'true' : null,
          disabled: state.home.unlocked[f] ? null : true,
          dataset: { tip: pickLang(def.floors[f].label) + (state.home.unlocked[f] ? '' : ` — ${pickLang(def.locks?.[f]?.label || { en: 'Locked', zh: '未解锁' })}`) },
          onclick: () => {
            state.ui.viewFloor = f;
            game.ui?.recenter?.();
          },
        },
        f
      )
    )
  );
}

const QUEUE_SLOTS = 5;

function queue(state) {
  const cur = state.actions.current;
  /** @type {any[]} */
  const slots = [];
  if (cur) {
    const pct = cur.dur ? Math.min(1, cur.elapsed / cur.dur) : 0;
    slots.push(
      h(
        'div',
        { class: 'qitem sl-queue__slot is-current', role: 'listitem', dataset: { tip: `${cur.phase === 'walk' ? '🚶 ' : ''}${cur.label || cur.kind} — ${pickLang({ en: 'click to cancel', zh: '点击取消' })}` }, onclick: () => cancelAction(state, cur.id) },
        g(actionGlyph(cur.phase === 'walk' ? 'walk' : cur.kind)),
        cur.dur ? h('div', { class: 'sl-bar sl-bar--primary', style: { '--v': String(pct) } }) : null
      )
    );
  }
  for (const a of state.actions.queue.slice(0, QUEUE_SLOTS - slots.length)) {
    slots.push(h('div', { class: 'qitem sl-queue__slot', role: 'listitem', dataset: { tip: `${a.label || a.kind} — ${pickLang({ en: 'click to cancel', zh: '点击取消' })}` }, onclick: () => cancelAction(state, a.id) }, g(actionGlyph(a.kind))));
  }
  while (slots.length < QUEUE_SLOTS) slots.push(h('div', { class: 'sl-queue__slot', role: 'listitem' }));
  return h('div', { class: 'queue sl-queue hud-queue', role: 'list' }, h('span', { class: 'sl-queue__back' }, g('chevronLeft')), h('div', { class: 'sl-queue__slots' }, ...slots));
}

function suggestionsRow(state) {
  const list = suggestions(state);
  return h(
    'div',
    { class: 'suggestions sl-chips hud-chips' },
    ...list.map((s) =>
      h(
        'button',
        {
          class: 'sl-chip',
          onclick: () => {
            const r = s.run();
            if (r?.panel) openPanel(r.panel, r);
          },
        },
        '💡 ',
        s.label
      )
    )
  );
}

function toolbar(state) {
  const btn = (label, key, panel, dot) =>
    h('button', { class: 'sl-btn sl-btn--secondary hud-toolbtn', onclick: () => openPanel(panel) }, label, key ? h('span', { class: 'key' }, key) : null, dot ? h('span', { class: 'dot' }) : null);
  const floor = state.ui.viewFloor || state.player.floor;
  const onFloor = state.player.scene === 'home' ? (state.floorBoxes || []).filter((b) => b.floor === floor && state.inventories[b.inv]?.items.length).length : 0;
  return h(
    'div',
    { class: 'toolbar hud-toolbar' },
    btn(`🎒 ${tr('ui.inventory')}`, 'I', 'backpack'),
    onFloor ? btn(`📦 ${pickLang({ en: 'Floor', zh: '地上' })} (${onFloor})`, '', 'floorItems') : null,
    ...toolbarButtons.filter((b) => !b.visible || b.visible(state)).map((b) => btn(b.label(), b.key, b.panel, b.dot?.(state)))
  );
}

// ------------------------------------------------------------------------------ pre-disaster planning bar
// Patch 09-12: the pre-disaster planning bottom bar shows the Planning Points balance with a '?' help icon.
export const PLAN_BAR_SLOTS = 3;
const HOARD_PERKS = ['carryKg', 'bulkDiscount'];

// Abilities that can be bought right now, the ones that help the hoard first, then the cheapest.
export function planBarAbilities(state) {
  const loop = state.loop;
  return ABILITIES.filter((a) => !START_ONLY_ABILITIES.has(a.id))
    .map((a) => ({ a, cost: abilityCost(loop, a.id) }))
    .filter(({ cost }) => cost != null && cost <= loop.planningPoints)
    .sort((x, y) => Number(HOARD_PERKS.some((k) => y.a.per[k])) - Number(HOARD_PERKS.some((k) => x.a.per[k])) || x.cost - y.cost);
}

function planningBar(state) {
  const offers = planBarAbilities(state);
  const lvDots = (a) => {
    const lv = state.loop.abilities?.[a.id] || 0;
    return '●'.repeat(lv) + '○'.repeat(a.maxLv - lv);
  };
  return h(
    'div',
    { class: 'planbar hud-planbar' },
    h('span', { class: 'planbar-title' }, '📖 ', pointsBadge(state.loop.planningPoints)),
    ...offers.slice(0, PLAN_BAR_SLOTS).map(({ a, cost }) =>
      h(
        'button',
        {
          class: 'primary',
          dataset: { tip: `<b>${pickLang(a.name)}</b> <span class="warn">${lvDots(a)}</span><br>${pickLang(a.desc)}` },
          onclick: () => {
            const r = buyAbility(state, a.id);
            if (r.ok) toast(pickLang({ en: `${a.name.en} Lv${r.lv}`, zh: `${a.name.zh} ${r.lv}级` }), 'good');
            updateHud(performance.now(), true);
          },
        },
        `${pickLang(a.name)} · ${cost}`
      )
    ),
    h(
      'button',
      { dataset: { tip: pickLang({ en: 'Every ability in the Survival Log (L)', zh: '生存日志中的全部能力（L）' }) }, onclick: () => openPanel('journal', { tab: 'abilities' }) },
      offers.length > PLAN_BAR_SLOTS ? pickLang({ en: `+${offers.length - PLAN_BAR_SLOTS} more…`, zh: `还有${offers.length - PLAN_BAR_SLOTS}项…` }) : pickLang({ en: 'Abilities…', zh: '能力…' })
    )
  );
}

// ------------------------------------------------------------------------------ item notification bars
// Items that arrive in a burst share one bar per item ("+2 Tomato"); a bar stays a few seconds after its last update.
// The bars sit at the top of the toast column so the two never overlap.
export const GOT_BAR_MS = 3500;
export const GOT_BAR_MAX = 6;
let gotEl = null;
const gotBars = new Map();
let burst = null;

export function notifyGot(id, n = 1, source = '') {
  const cfg = item(id);
  const layer = toastLayer();
  if (!layer || !cfg || !(n > 0 || gotBars.has(id))) return;
  if (!gotEl) gotEl = h('div', { class: 'gotbars' });
  if (gotEl.parentNode !== layer) layer.appendChild(gotEl);
  let b = gotBars.get(id);
  if (b) {
    gotBars.delete(id);
    gotBars.set(id, b);
  } else {
    b = { n: 0, source: '', count: h('span', { class: 'n' }), src: h('span', { class: 'src' }) };
    b.el = h('div', { class: 'gotbar' }, b.src, h('span', { class: 'ico', style: { background: itemColor(cfg) } }, itemIcon(cfg)), b.count, h('span', {}, itemName(id)));
    gotBars.set(id, b);
    gotEl.appendChild(b.el);
    while (gotBars.size > GOT_BAR_MAX) dismissGot(gotBars.keys().next().value);
  }
  b.n += n;
  if (source) b.source = source;
  b.count.textContent = `+${b.n}`;
  b.src.textContent = b.source;
  clearTimeout(b.timer);
  b.timer = setTimeout(() => dismissGot(id), GOT_BAR_MS);
}

function dismissGot(id) {
  const b = gotBars.get(id);
  if (!b) return;
  clearTimeout(b.timer);
  b.el.remove();
  gotBars.delete(id);
}

export function clearGotBars() {
  for (const id of [...gotBars.keys()]) dismissGot(id);
}

// How many of each item were already announced by gotItem in the current synchronous burst.
function announced() {
  if (!burst) {
    burst = new Map();
    queueMicrotask(() => (burst = null));
  }
  return burst;
}

on('gotItem', ({ id } = {}) => {
  const seen = announced();
  seen.set(id, (seen.get(id) || 0) + 1);
  notifyGot(id, 1);
});
on('harvested', ({ items = [] } = {}) => {
  const counts = new Map();
  for (const id of items) counts.set(id, (counts.get(id) || 0) + 1);
  const seen = announced();
  for (const [id, n] of counts) {
    const already = Math.min(n, seen.get(id) || 0);
    seen.set(id, (seen.get(id) || 0) - already);
    notifyGot(id, n - already, '🌾');
  }
});
on('cooked', ({ item: id } = {}) => notifyGot(id, 1, '🍳'));
on('leaveGame', clearGotBars);
