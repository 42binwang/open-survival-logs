// Exploration UI: the exploration map (points, hours, overrun marks), the in-site view for the iso renderer
// (flashlight in the dark, zombies, searchable fixtures), the expedition HUD (depth bar, exposure, time
// left, minimap, Retreat) and the container loot window.
import { h, openWindow, closeWindow, refreshWindows, refreshWindow, isOpen, toast } from './dom.js';
import { registerPanel, openPanel, quickUse, reasonText } from './panels.js';
import { registerToolbarButton } from './hud.js';
import { registerView, playerMotion } from './view.js';
import { renderGrid, weightLine } from './invgrid.js';
import { game, setSpeed } from '../game.js';
import { on } from '../engine/bus.js';
import { pickLang } from '../engine/i18n.js';
import { CHARACTERS } from '../content/characters.js';
import { CELL, cellAt } from '../sim/scene.js';
import { enqueue } from '../sim/actions.js';
import { frontDoor } from '../sim/home.js';
import { moveItem, organize, weightKg, countIn } from '../sim/inventory.js';
import { getMods } from '../sim/modifiers.js';
import { dailyCount } from '../sim/stats.js';
import { PROF, profLevel } from '../sim/proficiency.js';
import { dayNumber, formatClock, formatDuration, isNight, HOUR } from '../sim/time.js';
import {
  sites,
  site,
  siteStatus,
  siteLayout,
  isCleared,
  siteFloorId,
  exploreRun,
  exploreState,
  isExploring,
  startExploration,
  retreat,
  fixtureName,
  fixtureOptions,
  queueFixture,
  queueDefault,
  queueFight,
  nearestFixture,
  adjacentZombie,
  isWalkable,
  exposureLevel,
  timeLeft,
  claimStoryItems,
  standoffView,
  resolveStandoff,
  throwLure,
  NOISEMAKER,
} from '../sim/explore.js';
import { itemName } from '../data/db.js';

const t = (en, zh) => pickLang({ en, zh });
const hh = (h) => `${String(h).padStart(2, '0')}:00`;
const SIZE_LABEL = { small: { en: 'Small', zh: '小型' }, medium: { en: 'Medium', zh: '中型' }, large: { en: 'Large', zh: '大型' } };
const BUSY_KINDS = new Set(['exploreSearch', 'exploreClear', 'exploreFight', 'exploreRest', 'exploreTravel']);
const hasDom = typeof document !== 'undefined';

// ------------------------------------------------------------------------------------------ in-site view
let eTarget = { at: 0, id: null };
let highlighted = null;

function targetFixture(state) {
  const now = hasDom ? performance.now() : 0;
  if (now - eTarget.at > 250) eTarget = { at: now, id: nearestFixture(state, 2)?.id || null };
  return eTarget.id;
}

// In the dark only what the flashlight reaches is visible.
function zombieVisible(state, def, z) {
  const dark = def.dark || isNight(state.clock);
  return !dark || Math.abs(z.x - state.player.x) + Math.abs(z.y - state.player.y) <= 7;
}

function syncHighlight(uid) {
  const r = game.ui?.renderer;
  if (!r || highlighted === uid) return;
  if (highlighted) r.highlight.delete(highlighted);
  if (uid) r.highlight.add(uid);
  highlighted = uid;
}

registerView('explore', (state) => {
  const run = exploreRun(state);
  const id = run?.site || state.player.scene.split(':')[1];
  const def = site(id);
  const layout = siteLayout(id);
  const fl = layout.floor;
  const p = state.player;
  const onSite = run?.phase === 'site';
  const px = p.px ?? p.x;
  const py = p.py ?? p.y;
  const dark = def.dark || isNight(state.clock);
  const spotter = !!getMods(state).highlightLoot;
  const target = onSite ? targetFixture(state) : null;
  syncHighlight(target ? `x:${target}` : null);
  const furniture = (run?.fixtures || layout.fixtures)
    .filter((fx) => !isCleared(fx))
    .map((fx) => ({
      uid: `x:${fx.id}`,
      x: fx.x,
      y: fx.y,
      w: fx.w,
      h: fx.h,
      cfg: fx.cfg,
      data: {},
      broken: (fx.kind === 'box' || fx.kind === 'loose') && !!fx.searched,
      exclaim: spotter && fx.kind === 'box' && fx.hidden && !fx.searched,
    }));
  const entities = [];
  if (onSite) entities.push({ x: px, y: py, color: CHARACTERS[state.meta.character]?.color, head: '#e8c9a0', sleeping: p.sleeping, kind: 'player', character: state.meta.character, ...playerMotion(state) });
  for (const z of run?.zombies || []) {
    if (!zombieVisible(state, def, z)) continue;
    if (z.human) entities.push({ x: z.x, y: z.y, color: z.stance === 'hostile' ? '#8a3b2e' : '#6b5a44', head: '#d8b48c', hp: z.hp, maxHp: z.maxHp, kind: 'raider', id: z.id, label: z.stance === 'hostile' ? t('Raider', '劫匪') : t('Survivor?', '幸存者？') });
    else entities.push({ x: z.x, y: z.y, color: z.big ? '#4c6639' : '#5f7a4a', head: '#8aa26a', hp: z.hp, maxHp: z.maxHp, kind: z.big ? 'big' : 'zombie', id: z.id });
  }
  const view = {
    floor: fl,
    floorId: siteFloorId(id),
    furniture,
    boxes: [],
    entities,
    clock: state.clock,
    weather: def.outdoor ? state.weather?.today : null,
    lightsOn: false,
    basement: !!def.dark,
    indoorDark: !!def.dark,
    flashlight: onSite && dark ? { x: px, y: py } : null,
    focus: onSite ? null : { x: layout.entry[0], y: layout.entry[1] },
    bg: '#0d0e10',
    roomAt: (x, y) => fl.rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h),
    locked: () => false,
    floorsAvailable: [],
  };
  view.onClick = (wx, wy, e) => handleClick(state, view, wx, wy, e);
  return view;
});

function zombieUnder(state, run, wx, wy) {
  const def = site(run.site);
  for (const [ox, oy] of [
    [0, 0],
    [0.6, 0.6],
  ]) {
    const x = Math.floor(wx + ox);
    const y = Math.floor(wy + oy);
    const z = run.zombies.find((o) => o.x === x && o.y === y && zombieVisible(state, def, o));
    if (z) return z;
  }
  return null;
}

function handleClick(state, view, wx, wy, e) {
  if (menuJustClosed) {
    menuJustClosed = false;
    return true;
  }
  const run = exploreRun(state);
  if (!run) return false;
  if (run.phase !== 'site') return true;
  const z = zombieUnder(state, run, wx, wy);
  if (z && e.button === 0) {
    queueFight(state, z.id, { replace: !e.shiftKey });
    return true;
  }
  const hit = game.ui.renderer.pick(view, wx, wy);
  if (hit.furn) {
    openFixtureMenu(state, hit.furn.uid.slice(2), e.clientX, e.clientY);
    return true;
  }
  const [tx, ty] = hit.tile;
  return !isWalkable(state, tx, ty);
}

// ------------------------------------------------------------------------------------------ fixture menu
let menuEl = null;
let menuJustClosed = false;

function closeMenu() {
  menuEl?.remove();
  menuEl = null;
}

if (hasDom) {
  document.addEventListener(
    'mousedown',
    (e) => {
      if (!menuEl || menuEl.contains(e.target)) return;
      closeMenu();
      menuJustClosed = e.target?.id === 'scene';
    },
    true
  );
  window.addEventListener(
    'keydown',
    (e) => {
      if (menuEl && e.key === 'Escape') {
        closeMenu();
        e.stopImmediatePropagation();
      }
    },
    true
  );
}

function lockText(fx) {
  if (!fx.lock || fx.unlocked) return null;
  return fx.lock === 'pick' ? t('🔒 Locked — a lockpick opens it quietly, a crowbar noisily.', '🔒 上锁了——开锁器能悄悄打开，撬棍动静大。') : t('🔒 Jammed shut — only a crowbar will do.', '🔒 卡死了——只能用撬棍撬开。');
}

function optionTip(o) {
  const parts = [];
  if (o.sec) parts.push(`⏱ ${formatDuration(o.sec)}`);
  if (o.sta) parts.push(`${t('Stamina', '精力')} −${o.sta}`);
  if (o.mode === 'pry') parts.push(t('uses up the crowbar · loud', '消耗撬棍 · 动静大'));
  if (o.mode === 'pick') parts.push(t('uses up the lockpick', '消耗开锁器'));
  if (o.mode === 'clear') parts.push(`${t('Satiety', '饱腹')} −10`);
  return parts.join(' · ');
}

function openFixtureMenu(state, fid, x, y) {
  closeMenu();
  const run = exploreRun(state);
  const fx = run?.fixtures.find((f) => f.id === fid);
  if (!fx) return;
  const lines = [];
  if (fx.kind === 'box') {
    lines.push(fx.searched ? t('Searched.', '已搜过。') : lockText(fx) || t('Not searched yet.', '还没搜过。'));
    if (fx.hidden && !fx.searched && getMods(state).highlightLoot) lines.push(t('❗ Something is tucked away in here.', '❗ 这里面藏着东西。'));
  } else if (fx.kind === 'block') {
    lines.push(t('Blocks the way. Pushing it aside takes a while and makes noise.', '挡住了去路。搬开要花点时间，还会弄出动静。'));
  } else if (fx.kind === 'rest') {
    lines.push(t('Catch your breath here. The dead can still find you.', '在这里喘口气。丧尸还是可能找上门。'));
  } else if (fx.kind === 'loose') {
    lines.push(fx.searched ? t('Picked up.', '已拾取。') : t('Lying about, easy to pick up.', '散落在这儿，随手就能捡起来。'));
  } else if (fx.kind === 'scrap') {
    lines.push(t('Broken, but there are parts worth taking apart.', '坏了，但拆开还有些能用的零件。'));
  } else if (fx.kind === 'prop') {
    lines.push(t('Nothing to do with it.', '没什么可做的。'));
  }
  const options = fixtureOptions(state, fid);
  const hotkey = options.find((o) => o.enabled)?.mode;
  menuEl = h(
    'div',
    { class: 'ctxmenu', style: { left: `${x}px`, top: `${y}px` } },
    h('div', { class: 'ttl' }, fixtureName(fx)),
    ...lines.map((l) => h('div', { class: 'hpline' }, l)),
    ...options.map((o) =>
      h(
        'button',
        {
          disabled: o.enabled ? null : true,
          dataset: optionTip(o) ? { tip: optionTip(o) } : null,
          onclick: (e) => {
            e.stopPropagation();
            closeMenu();
            if (queueFixture(state, fid, o.mode, { replace: !e.shiftKey }) && game.settings.operationTips) game.ui?.opTip?.(`${o.label} → ${fixtureName(fx)}`);
          },
        },
        o.mode === hotkey ? `${o.label} (E)` : o.label,
        o.enabled ? null : h('span', { class: 'why' }, o.reason)
      )
    )
  );
  if (!options.length) menuEl.appendChild(h('div', { class: 'hpline' }, t('Nothing left to do here.', '这里没什么可做的了。')));
  document.body.appendChild(menuEl);
  const r = menuEl.getBoundingClientRect();
  if (r.right > window.innerWidth) menuEl.style.left = `${window.innerWidth - r.width - 6}px`;
  if (r.bottom > window.innerHeight) menuEl.style.top = `${window.innerHeight - r.height - 6}px`;
}

function handleInteract() {
  const state = game.state;
  const run = state && exploreRun(state);
  if (!run || run.phase !== 'site' || state.phase === 'dead') return;
  if (BUSY_KINDS.has(state.actions.current?.kind)) return;
  const z = adjacentZombie(state);
  if (z) {
    queueFight(state, z.id, { replace: true });
    return;
  }
  const hov = game.ui?.renderer?.hover?.furn;
  if (typeof hov === 'string' && hov.startsWith('x:')) {
    queueDefault(state, hov.slice(2), { replace: true });
    return;
  }
  const fx = nearestFixture(state, 3);
  if (fx) queueDefault(state, fx.id, { replace: true });
  else toast(t('Nothing to search nearby.', '附近没有可搜的东西。'));
}

// ------------------------------------------------------------------------------------------ exploration map
function dangerStars(d) {
  return '☠'.repeat(d >= 1.3 ? 3 : d >= 0.95 ? 2 : 1);
}

function lootStars(r) {
  return '★'.repeat(r >= 1.2 ? 3 : r >= 0.95 ? 2 : 1);
}

function statusPill(st, def) {
  switch (st.status) {
    case 'here':
      return h('span', { class: 'pill good' }, `📍 ${t('You are here', '当前位置')}`);
    case 'locked':
      return h('span', { class: 'pill dim' }, `🔒 ${t(`Day ${st.unlockDay}`, `第${st.unlockDay}天`)}`);
    case 'overrun':
      return h('span', { class: 'pill bad' }, `☣ ${t(`Overrun until Day ${st.overrunUntil}`, `被占领至第${st.overrunUntil}天`)}`);
    case 'closed':
      return h('span', { class: 'pill warn' }, `🌙 ${t(`Closed · opens ${hh(def.hours[0])}`, `已关闭 · ${hh(def.hours[0])}开放`)}`);
    default:
      return h('span', { class: 'pill good' }, def.hours ? t(`Open until ${hh(def.hours[1])}`, `开放至${hh(def.hours[1])}`) : t('Open 24h', '全天开放'));
  }
}

function departNow(state, id, ctx) {
  if (ctx.forced || ctx.fromDoor) {
    if (startExploration(state, id, { forced: !!ctx.forced }).ok) closeWindow('exploreMap');
    return;
  }
  const door = frontDoor(state);
  const def = site(id);
  enqueue(
    state,
    { kind: 'goExplore', label: `${def.icon} ${t('Head out to', '出发前往')} ${pickLang(def.name)}`, site: id, target: door ? { furn: door.uid } : null, noWalk: !door, dur: 0 },
    { replace: true }
  );
  closeWindow('exploreMap');
}

function mapMarkers(state, statuses) {
  const run = exploreRun(state);
  const marker = (x, y, children, cls = '', tip = '') =>
    h(
      'div',
      {
        class: cls,
        dataset: tip ? { tip } : null,
        style: { position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, transform: 'translate(-50%, -50%)', textAlign: 'center', fontSize: '11px', whiteSpace: 'nowrap' },
      },
      children
    );
  return h(
    'div',
    {
      style: {
        position: 'relative',
        height: '190px',
        margin: '6px 0 10px',
        borderRadius: '6px',
        border: '1px solid var(--line)',
        background: 'repeating-linear-gradient(45deg, #1b1e22 0 14px, #1e2126 14px 28px)',
        overflow: 'hidden',
      },
    },
    marker(0.5, 0.5, [h('div', { style: { fontSize: '20px' } }, '🏠'), t('Home', '家')], run ? 'dim' : 'good'),
    ...statuses.map(({ def, st }) =>
      marker(
        def.mapPos[0],
        def.mapPos[1],
        [
          h('div', { style: { fontSize: '20px', filter: st.status === 'locked' ? 'grayscale(1) brightness(0.6)' : 'none' } }, st.status === 'overrun' ? '☣' : def.icon),
          pickLang(def.name),
          run?.site === def.id ? h('div', { class: 'good' }, '📍') : null,
        ],
        st.status === 'overrun' ? 'bad' : st.status === 'locked' ? 'dim' : st.status === 'closed' ? 'warn' : '',
        st.reason || pickLang(def.desc)
      )
    )
  );
}

function buildMap(body, state, ctx) {
  const ex = exploreState(state);
  const run = exploreRun(state);
  const w = state.weather?.today?.kind;
  const snowy = w === 'snow' || w === 'coldWave';
  const day = dayNumber(state.clock);
  const header = `${t(`Day ${day}`, `第${day}天`)} · ${formatClock(state.clock)}`;
  body.appendChild(h('div', { class: 'row', style: { alignItems: 'center' } }, h('b', {}, header), snowy ? h('span', { class: 'warn' }, t('❄ Snow: slower travel, stamina ×1.5', '❄ 雪天：路上更慢，精力消耗×1.5')) : null));
  if (ctx.forced) {
    body.appendChild(
      h(
        'div',
        { class: 'bad', style: { margin: '6px 0' } },
        t(
          'Desperate exploration: opening hours and the horde at your door no longer stop you, but you will get badly hurt on the way (Life −24, likely bleeding) and more of them will be waiting. Once per day.',
          '强行出门：不再受开放时间和门口尸潮限制，但路上会受重伤（生命−24，很可能流血），等着你的丧尸也更多。每天一次。'
        )
      )
    );
  }
  if (state.phase === 'pre') body.appendChild(h('div', { class: 'dim' }, t('The exploration points open up after the outbreak.', '灾变之后才能前往探索点。')));
  if (run) body.appendChild(h('div', { class: 'dim' }, t('You are out right now. Retreat home before heading somewhere else.', '你正在外面，先撤回家再去别处。')));
  const statuses = sites().map((def) => ({ def, st: siteStatus(state, def.id) }));
  body.appendChild(mapMarkers(state, statuses));
  const forcedUsed = dailyCount(state, 'explore.forced') >= 1;
  const atHome = state.player.scene === 'home' && state.phase === 'post' && !run;
  body.appendChild(
    h(
      'div',
      { class: 'list' },
      ...statuses.map(({ def, st }) => {
        const risky = atHome && !!ctx.forced && !st.available && st.forcedOk && !forcedUsed;
        const canGo = (atHome && st.available) || risky;
        const why = !atHome ? '' : ctx.forced && forcedUsed && st.forcedOk && !st.available ? t('You already risked it today.', '今天已经冒过一次险了。') : st.reason;
        return h(
          'div',
          { class: 'list-item', style: { alignItems: 'flex-start' } },
          h('div', { style: { fontSize: '22px', width: '30px', textAlign: 'center' } }, st.status === 'overrun' ? '☣' : def.icon),
          h(
            'div',
            { class: 'col', style: { flex: 1, gap: '3px' } },
            h(
              'div',
              { class: 'row', style: { alignItems: 'center', flexWrap: 'wrap', gap: '6px' } },
              h('b', {}, pickLang(def.name)),
              statusPill(st, def),
              st.visits ? h('span', { class: 'pill' }, `✓ ×${st.visits}`) : null,
              h('span', { class: 'pill' }, pickLang(SIZE_LABEL[def.size])),
              def.dark ? h('span', { class: 'pill', dataset: { tip: t('Pitch black inside — flashlight only.', '里面漆黑一片，只能靠手电筒。') } }, '🔦') : null
            ),
            h('div', { class: 'dim', style: { fontSize: '12px' } }, pickLang(def.desc)),
            h(
              'div',
              { style: { fontSize: '12px' } },
              h('span', { dataset: { tip: t('Danger', '危险度') } }, dangerStars(def.danger)),
              '  ',
              h('span', { class: 'warn', dataset: { tip: t('Supplies', '物资') } }, lootStars(def.richness)),
              '  ',
              `🚶 ${formatDuration(st.travelSec)} ${t('each way', '单程')} · ${t('Stamina', '精力')} −${st.travelSta}`
            ),
            why && !canGo ? h('div', { class: st.status === 'overrun' ? 'bad' : 'dim', style: { fontSize: '11px' } }, why) : null
          ),
          h('button', { class: risky ? 'danger' : canGo ? 'primary' : '', disabled: canGo ? null : true, onclick: () => departNow(state, def.id, { ...ctx, forced: risky }) }, risky ? t('Risk it', '冒险出发') : t('Go', '出发'))
        );
      })
    )
  );
  const lv = profLevel(state, 'explore');
  const prof = state.progress.prof.explore;
  const need = PROF.explore.need[lv];
  body.appendChild(
    h(
      'div',
      { class: 'dim', style: { marginTop: '8px', fontSize: '12px' } },
      `${pickLang(PROF.explore.name)} Lv${lv}${need ? ` (${Math.floor(prof.exp)}/${need})` : ''} · ${t('Outings', '探索次数')} ${state.progress.counters['explore.total'] || 0} · ${t('Places seen', '去过的地点')} ${ex.visited.length}/${sites().length}`
    )
  );
}

registerPanel('exploreMap', (ctx = {}) => {
  const state = game.state;
  if (!state) return;
  openWindow('exploreMap', { title: `🗺 ${t('Exploration Map', '探索地图')}`, width: 620, build: (body) => buildMap(body, state, ctx) });
});

// ------------------------------------------------------------------------------------------ expedition HUD
let hud = null;

function meter() {
  const fill = h('div', { class: 'bar-fill' });
  return { el: h('div', { class: 'bar' }, fill), fill };
}

function buildHud(body) {
  const state = game.state;
  const run = state && exploreRun(state);
  if (!run) {
    hud = null;
    body.appendChild(h('div', { class: 'dim' }, t('You are at home.', '你在家里。')));
    return;
  }
  const def = site(run.site);
  const depth = meter();
  const exposure = meter();
  const minimap = h('canvas', { width: 1, height: 1, style: { display: 'block', margin: '6px auto 0', imageRendering: 'pixelated' } });
  const retreatBtn = h('button', { class: 'danger', style: { flex: 1 }, onclick: () => retreat(game.state) }, `⤺ ${t('Retreat', '撤离')}`);
  const lureBtn = h(
    'button',
    {
      style: { width: '100%', marginTop: '6px' },
      dataset: { tip: t('Throw the tin-can noisemaker into the far corner: nearby zombies follow the noise for a while.', '把易拉罐响器扔到远处的角落：附近的丧尸会跟着声音走开一阵子。') },
      onclick: () => {
        const r = throwLure(game.state);
        if (!r.ok) toast(r.reason, 'bad');
        updateHud();
      },
    },
    ''
  );
  hud = {
    root: body,
    site: def,
    phase: h('div', { class: 'dim', style: { fontSize: '12px' } }),
    depthText: h('span', {}),
    depth,
    exposureText: h('span', {}),
    exposure,
    time: h('div', { style: { fontSize: '12px' } }),
    zone: h('div', { class: 'dim', style: { fontSize: '12px' } }),
    weight: h('div', { class: 'dim', style: { fontSize: '12px' } }),
    minimap,
    retreatBtn,
    lureBtn,
  };
  body.append(
    hud.phase,
    h('div', { class: 'row', style: { justifyContent: 'space-between', marginTop: '4px' } }, h('span', {}, t('Depth', '深度')), hud.depthText),
    depth.el,
    h('div', { class: 'row', style: { justifyContent: 'space-between', marginTop: '6px' } }, h('span', {}, t('Exposure', '暴露值')), hud.exposureText),
    exposure.el,
    h('div', { style: { marginTop: '6px' } }, hud.time, hud.zone, hud.weight),
    minimap,
    h('div', { class: 'row', style: { marginTop: '8px', gap: '6px' } }, retreatBtn, h('button', { onclick: () => openPanel('backpack') }, '🎒'), h('button', { onclick: () => openPanel('exploreMap') }, '🗺')),
    lureBtn
  );
  updateHud();
}

const MINI_COLORS = {
  [CELL.WALL]: '#3a3f46',
  [CELL.WINDOW]: '#56707f',
  [CELL.DOOR]: '#8a6a3a',
  [CELL.FLOOR]: '#5b4f41',
  [CELL.YARD]: '#2d3033',
  [CELL.OUTDOOR]: '#57534b',
};

function drawMinimap(state, run, canvas) {
  const layout = siteLayout(run.site);
  const fl = layout.floor;
  const cs = Math.max(4, Math.min(7, Math.floor(210 / fl.w)));
  if (canvas.width !== fl.w * cs) {
    canvas.width = fl.w * cs;
    canvas.height = fl.h * cs;
  }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < fl.h; y++) {
    for (let x = 0; x < fl.w; x++) {
      const color = MINI_COLORS[cellAt(fl, x, y)];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * cs, y * cs, cs, cs);
    }
  }
  for (const fx of run.fixtures) {
    if (isCleared(fx)) continue;
    const left = fx.inv && state.inventories[fx.inv]?.items.length;
    ctx.fillStyle = fx.kind === 'block' ? '#8a4a3a' : fx.kind === 'rest' ? '#6d7fa3' : fx.kind === 'scrap' ? '#7a7f86' : fx.kind === 'prop' ? '#3c3a37' : !fx.searched ? '#e0a84a' : left ? '#b08a58' : '#4a4a4a';
    ctx.fillRect(fx.x * cs + 1, fx.y * cs + 1, fx.w * cs - 2, fx.h * cs - 2);
  }
  const [ex, ey] = layout.entry;
  ctx.fillStyle = '#7cc47c';
  ctx.fillRect(ex * cs + 1, ey * cs + 1, cs - 2, cs - 2);
  const p = state.player;
  ctx.fillStyle = '#e06a5a';
  for (const z of run.zombies) {
    if (!zombieVisible(state, hud.site, z)) continue;
    ctx.beginPath();
    ctx.arc((z.x + 0.5) * cs, (z.y + 0.5) * cs, cs * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (run.phase === 'site') {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(((p.px ?? p.x) + 0.5) * cs, ((p.py ?? p.y) + 0.5) * cs, cs * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function updateHud() {
  const state = game.state;
  const run = state && exploreRun(state);
  if (!hud || !run || !hud.root.isConnected) return;
  const cur = state.actions.current;
  const travelLeft = cur?.kind === 'exploreTravel' ? cur.dur - cur.elapsed : null;
  hud.phase.textContent =
    run.phase === 'travelOut'
      ? `🚶 ${t('On the way', '在路上')} · ${formatDuration(travelLeft ?? run.travelSec)}`
      : run.phase === 'travelBack'
        ? `🏠 ${t('Heading home', '正在回家')} · ${formatDuration(travelLeft ?? run.travelSec)}`
        : `${hud.site.icon} ${run.forced ? t('Desperate run', '强行探索') : t('Scavenging', '搜刮中')} · ${t('kills', '击杀')} ${run.kills}`;
  hud.depthText.textContent = `${run.searched}/${run.total}`;
  hud.depth.fill.style.width = `${(run.searched / Math.max(1, run.total)) * 100}%`;
  const lv = exposureLevel(run.exposure);
  hud.exposureText.textContent = `${pickLang(lv.label)} ${Math.round(run.exposure)}%`;
  hud.exposure.fill.style.width = `${run.exposure}%`;
  hud.exposure.fill.style.background = run.exposure >= 60 ? 'var(--bad)' : run.exposure >= 30 ? 'var(--warn)' : 'var(--good)';
  const left = timeLeft(state);
  hud.time.textContent =
    left == null
      ? isNight(state.clock)
        ? `🌙 ${t('Night — darker and busier', '夜里——更暗，丧尸更多')}`
        : `☀ ${t('Open around the clock', '全天开放')}`
      : left > 0
        ? `${left < HOUR ? '⚠' : '⏱'} ${t('Dark in', '天黑还有')} ${formatDuration(left)}`
        : `🌙 ${t('After dark — retreat!', '天已黑——快撤！')}`;
  hud.time.className = left != null && left < HOUR ? 'bad' : '';
  const room = siteLayout(run.site).floor.rooms.find((r) => state.player.x >= r.x && state.player.x < r.x + r.w && state.player.y >= r.y && state.player.y < r.y + r.h);
  hud.zone.textContent = run.phase === 'site' && room ? `📍 ${pickLang(room.label)}` : '';
  const bp = state.inventories[state.player.backpack];
  hud.weight.textContent = `🎒 ${weightLine(state, state.player.backpack)}${bp.maxKg != null && weightKg(bp) > bp.maxKg ? ` · ${t('overloaded', '超重')}` : ''}`;
  hud.retreatBtn.disabled = run.phase === 'travelBack' ? true : null;
  hud.retreatBtn.textContent = run.phase === 'travelOut' ? `⤺ ${t('Turn back', '掉头回家')}` : `⤺ ${t('Retreat', '撤离')}`;
  const cans = countIn(state, [state.player.backpack], NOISEMAKER);
  hud.lureBtn.style.display = cans && run.phase === 'site' ? '' : 'none';
  hud.lureBtn.textContent = `🥫 ${t('Throw the can', '扔易拉罐')} ×${cans}`;
  drawMinimap(state, run, hud.minimap);
}

function openHud() {
  const state = game.state;
  const run = state && exploreRun(state);
  if (!run) return;
  const def = site(run.site);
  const entry = openWindow('exploreHud', { title: `${def.icon} ${pickLang(def.name)}`, width: 240, build: buildHud, onClose: () => (hud = null) });
  Object.assign(entry.win.style, { position: 'fixed', right: '8px', top: '205px', margin: '0' });
}

registerPanel('exploreHud', () => openHud());

if (typeof window !== 'undefined') setInterval(updateHud, 300);

// ------------------------------------------------------------------------------------------ loot window
registerPanel('exploreLoot', ({ fixture } = {}) => {
  const state = game.state;
  const run = state && exploreRun(state);
  const fx = run?.fixtures.find((f) => f.id === fixture);
  if (!fx?.inv || !state.inventories[fx.inv]) return;
  let sel = null;
  openWindow('exploreLoot', {
    title: `${fixtureName(fx)} · ${t('Search results', '搜索结果')}`,
    width: 'auto',
    build: (body) => {
      const inv = state.inventories[fx.inv];
      const bp = state.player.backpack;
      const refresh = () => {
        claimStoryItems(state);
        refreshWindows();
      };
      const onError = (r) => toast(reasonText(r), 'bad');
      const takeAll = () => {
        let stuck = 0;
        for (const it of [...inv.items]) if (!moveItem(state, inv, it.uid, state.inventories[bp], null, null).ok) stuck++;
        if (stuck) toast(t(`${stuck} items do not fit — drop something or carry them overweight (Shift+click).`, `还有${stuck}件放不下——丢掉些东西，或Shift+点击硬塞（会超重）。`), 'bad');
        refresh();
      };
      body.appendChild(
        h(
          'div',
          { class: 'row' },
          h(
            'div',
            { class: 'col' },
            h('span', { class: 'sec-title' }, fixtureName(fx)),
            inv.items.length ? renderGrid(state, fx.inv, { onChange: refresh, transferTo: () => bp, selected: sel, onSelect: (i) => ((sel = i.uid), refreshWindows()), onError }) : h('div', { class: 'dim' }, t('Empty.', '空了。')),
            h('button', { class: 'primary', disabled: inv.items.length ? null : true, onclick: takeAll }, `${t('Take all', '全部拿取')}`)
          ),
          h(
            'div',
            { class: 'col' },
            h('div', { class: 'row' }, h('span', { class: 'sec-title' }, t('Backpack', '背包')), h('span', { class: 'dim' }, weightLine(state, bp))),
            renderGrid(state, bp, { onChange: refresh, transferTo: () => fx.inv, selected: sel, onSelect: (i) => ((sel = i.uid), refreshWindows()), onUse: (i) => quickUse(state, bp, i), onError }),
            h('button', { onclick: () => (organize(state.inventories[bp]), refresh()) }, t('One-Click Organize', '一键整理'))
          )
        )
      );
      body.appendChild(h('div', { class: 'dim', style: { marginTop: '6px', fontSize: '11px' } }, t('Whatever you leave behind is gone once you head home. Z hides this panel after searches.', '回家后留在这里的东西就没了。按Z可在搜索后不再自动弹出此面板。')));
    },
  });
});

// ------------------------------------------------------------------------------------------ wiring
registerToolbarButton({ label: () => `🗺 ${t('Explore', '探索')}`, key: '', panel: 'exploreMap', visible: (s) => s.phase === 'post' });
registerToolbarButton({ label: () => `🔦 ${t('Expedition', '探索状态')}`, key: '', panel: 'exploreHud', visible: (s) => !!s.explore?.run });

function closeExploreWindows() {
  closeMenu();
  closeWindow('exploreHud');
  closeWindow('exploreLoot');
  syncHighlight(null);
}

on('interactKey', () => handleInteract());
on('exploreDeparted', () => {
  closeWindow('exploreMap');
  closeMenu();
  openHud();
  game.ui?.recenter?.();
});
on('exploreArrived', () => {
  if (!isOpen('exploreHud')) openHud();
  game.ui?.recenter?.();
});
on('exploreHit', () => {
  if ((game.state?.clock.speed || 0) > 1) setSpeed(1);
});
on('exploreSearched', ({ fixture, left }) => {
  if (left?.length && !game.state?.ui.hideSearch) openPanel('exploreLoot', { fixture });
});
on('exploreEnded', () => {
  closeExploreWindows();
  game.ui?.recenter?.();
});
on('exploreOverrun', () => refreshWindow('exploreMap'));
on('hour', () => refreshWindow('exploreMap'));
on('enterGame', () => {
  if (game.state && isExploring(game.state)) openHud();
});
on('leaveGame', closeExploreWindows);
on('death', closeExploreWindows);

// ------------------------------------------------------------------------------------------ raiders
// The standoff with hostile survivors: the world waits until you choose.
registerPanel('raiders', () => {
  const state = game.state;
  const view = state && standoffView(state);
  if (!view) return;
  state.ui.modalPause = true;
  const choose = (choice) => {
    resolveStandoff(state, choice);
    closeWindow('raiders');
  };
  const goods = view.tribute.map((id) => itemName(id)).join(pickLang({ en: ', ', zh: '、' }));
  openWindow('raiders', {
    title: t('Hostile survivors', '敌对幸存者'),
    width: 460,
    modal: true,
    onClose: () => {
      if (standoffView(state)) resolveStandoff(state, 'fight');
      state.ui.modalPause = false;
    },
    build: (body) => {
      body.appendChild(
        h(
          'p',
          {},
          view.count > 1
            ? t(`${view.count} armed survivors step out and block the way. "Put the bag down. Nobody has to get hurt."`, `${view.count}个带着武器的幸存者走出来，拦住了去路。“把包放下，没人会受伤。”`)
            : t('An armed survivor steps out and blocks the way. "Put the bag down. Nobody has to get hurt."', '一个带着武器的幸存者走出来，拦住了去路。“把包放下，没人会受伤。”')
        )
      );
      body.appendChild(
        h(
          'div',
          { class: 'choices' },
          h('button', { disabled: view.tribute.length ? null : true, onclick: () => choose('give') }, t('Hand over supplies', '交出物资'), h('span', { class: 'dim' }, view.tribute.length ? ` — ${goods}` : t(' — your backpack is empty', '——背包是空的'))),
          h('button', { onclick: () => choose('talk') }, t('Talk your way out', '试着说服他们'), h('span', { class: 'dim' }, ` — ${Math.round(view.talk * 100)}%`)),
          h('button', { class: 'danger', onclick: () => choose('fight') }, t('Fight', '动手'), h('span', { class: 'dim' }, t(' — they hit harder than the dead, but carry supplies', '——他们比丧尸下手更狠，但身上有物资')))
        )
      );
    },
  });
});
