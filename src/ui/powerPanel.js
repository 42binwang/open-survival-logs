// Power Overview Panel (dev log 06-03, patch 09-12), the generator / heater and rat cage panels, and
// the ⚡ toolbar button (P).
import { h, openWindow, refreshWindow, refreshWindows, isOpen, toast, bar } from './dom.js';
import { registerPanel, openPanel, reasonText } from './panels.js';
import { registerToolbarButton } from './hud.js';
import { renderGrid } from './invgrid.js';
import { weatherLabel } from './labels.js';
import { game } from '../game.js';
import { pickLang, tr } from '../engine/i18n.js';
import { furn, item, itemName, elecCfg } from '../data/db.js';
import { furnLabel, homeDef, isFloorUnlocked } from '../sim/home.js';
import { startFurnitureFunction, hasItems, queuePanelFunction } from '../sim/furnActions.js';
import { formatDuration, daylight } from '../sim/time.js';
import {
  powerOverview,
  powerRole,
  setApplianceOn,
  setLights,
  setBurner,
  setAutoStart,
  fuelInventory,
  fuelHoursLeft,
  tidyFuel,
  isGeneratorFuel,
  isHeaterFuel,
  queueRepair,
  cageFeed,
  rodentSlots,
  feedCapacity,
  putRodent,
  takeRodent,
  fillRodents,
  feedCage,
  tidyFeed,
  feedHoursLeft,
  isLiveRodent,
  isRatFeed,
  LIGHT_W,
} from '../sim/power.js';
import { outdoorTemp, heatingByFloor, weatherSunFactor, COLD_BELOW } from '../sim/weather.js';

const REASONS = {
  night: { en: 'Night — no sunlight', zh: '夜间，没有日照' },
  overcast: { en: 'Overcast — weak sunlight', zh: '阴天，光照很弱' },
  basement: { en: 'No sunlight in the basement', zh: '地下室照不到阳光' },
  indoors: { en: 'Indoors — solar panels belong on the terrace or yard', zh: '在室内——太阳能板只能装在露台或院子里' },
  noFuel: { en: 'Out of fuel', zh: '燃料耗尽' },
  noFood: { en: 'Rodents ran out of food', zh: '老鼠没有食物了' },
  empty: { en: 'No rodents in the cage', zh: '笼里没有老鼠' },
  off: { en: 'Switched off', zh: '已关闭' },
  standby: { en: 'Auto Start — waiting', zh: '自动启动待机中' },
  full: { en: 'Batteries full — stopped', zh: '电量已满，自动停机' },
  grid: { en: 'Running (grid power is on too)', zh: '运行中（电网仍在供电）' },
  manual: { en: 'Pedal it to charge the batteries', zh: '亲自踩动为蓄电池充电' },
  shortage: { en: 'Power shortage — cut off', zh: '电力不足，已断电' },
  damaged: { en: 'Circuit damaged', zh: '电路损坏' },
  idle: { en: 'Standby — draws power while in use', zh: '待机，使用时耗电' },
  thermostat: { en: 'Warm enough — idle', zh: '室温足够，待机' },
  noHorde: { en: 'Standby until a horde comes', zh: '尸潮来袭时才启动' },
  locked: { en: 'Area not unlocked', zh: '区域未解锁' },
};

const WIRE = 20104;
const reasonLabel = (r) => (r ? pickLang(REASONS[r] || { en: r, zh: r }) : '');
const watts = (n) => `${n > 0 && n < 10 ? n.toFixed(1) : Math.round(n)} W`;
const floorName = (state, floor) => pickLang(homeDef(state.home.id).floors[floor]?.label) || floor;
const hoursText = (hours) => (hours > 0 ? formatDuration(hours * 3600) : '—');

// Rebuild a window every `ms` while it is open, unless the player is dragging or editing inside it.
function keepFresh(id, entry, ms = 1000) {
  const timer = setInterval(() => {
    if (!isOpen(id) || !entry.el.isConnected) {
      clearInterval(timer);
      return;
    }
    const el = document.activeElement;
    if (el && entry.win.contains(el) && (el.tagName === 'INPUT' || el.tagName === 'SELECT')) return;
    if (document.querySelector('.inv-item.ghost')) return;
    refreshWindow(id);
  }, ms);
}

function section(title, ...children) {
  return h('div', { style: { marginTop: '10px' } }, h('div', { class: 'sec-title' }, title), ...children);
}

// ------------------------------------------------------------------------------ overview
function weatherSection(state) {
  const w = state.weather;
  if (!w?.today) return null;
  const d = w.today;
  const t = w.tomorrow;
  const out = [];
  out.push(
    h(
      'div',
      { class: 'row', style: { alignItems: 'center', flexWrap: 'wrap' } },
      h('b', {}, `${weatherLabel(d.kind)} ${Math.round(outdoorTemp(state))}°C`),
      h('span', { class: 'dim' }, `${Math.round(d.low)}…${Math.round(d.high)}°C`),
      t ? h('span', {}, `${pickLang({ en: 'Tomorrow', zh: '明天' })}: ${weatherLabel(t.kind)} ${Math.round(t.low)}…${Math.round(t.high)}°C`) : null
    )
  );
  const active = (state.crises?.active || []).find((c) => c.type === 'coldWave');
  const upcoming = (state.crises?.upcoming || []).find((c) => c.type === 'coldWave');
  if (active) out.push(h('div', { class: 'bad' }, `🥶 ${active.label} — ${pickLang({ en: 'keep the heaters running and stay indoors.', zh: '保持取暖，尽量别出门。' })}`));
  else if (upcoming) out.push(h('div', { class: 'warn' }, `🥶 ${pickLang({ en: 'Cold wave in', zh: '寒潮将在' })} ${formatDuration(upcoming.at - state.clock.t)} ${pickLang({ en: '— set up heating and stock fuel.', zh: '后到来，请准备取暖和燃料。' })}`));
  const heat = heatingByFloor(state);
  const floors = Object.keys(homeDef(state.home.id).floors).filter((fl) => isFloorUnlocked(state, fl));
  out.push(
    h(
      'div',
      { class: 'row', style: { flexWrap: 'wrap' }, dataset: { tip: pickLang({ en: `Indoor temperature per floor. Below ${COLD_BELOW}°C you catch Cold; heaters and AC only warm the floor they stand on, and a big floor needs more of them.`, zh: `各楼层室温。低于${COLD_BELOW}°C会着凉；取暖设备只温暖所在楼层，楼层越大需要越多。` }) } },
      h('span', { class: 'dim' }, pickLang({ en: 'Indoors:', zh: '室内：' })),
      ...floors.map((fl) => {
        const temp = w.indoorTemp?.[fl];
        const warm = (heat[fl]?.electric || 0) + (heat[fl]?.fuel || 0) > 0;
        return h('span', { class: temp != null && temp < COLD_BELOW ? 'bad' : '' }, `${floorName(state, fl)} ${temp != null ? Math.round(temp) : '?'}°C${warm ? ' 🔥' : ''}`);
      })
    )
  );
  return section(pickLang({ en: 'Weather', zh: '天气' }), ...out);
}

function gridSection(state, p) {
  let text;
  let cls = 'good';
  if (state.phase === 'pre') text = pickLang({ en: '✔ City grid connected', zh: '✔ 城市电网供电中' });
  else if (p.blackoutAt) {
    text = pickLang({ en: `✖ City blackout since Day ${p.gridCutDay} — own power only`, zh: `✖ 第${p.gridCutDay}天起全城停电，只能自己发电` });
    cls = 'bad';
  } else if (!p.grid) {
    text = pickLang({ en: '⚠ Grid outage — the city power is flickering', zh: '⚠ 电网断电，城市供电不稳' });
    cls = 'warn';
  } else text = pickLang({ en: '✔ City grid connected', zh: '✔ 城市电网供电中' });
  const rows = [h('div', { class: cls }, text)];
  if (p.damaged) {
    const hasWire = hasItems(state, [[WIRE, 1]]);
    rows.push(
      h(
        'div',
        { class: 'row', style: { alignItems: 'center', flexWrap: 'wrap' } },
        h('span', { class: 'bad' }, pickLang({ en: '✖ The circuit is damaged — nothing gets power.', zh: '✖ 电路损坏，全屋断电。' })),
        h('button', { onclick: () => (queueRepair(state, false), toast(pickLang({ en: 'Repairing the circuit…', zh: '去修理电路……' }))) }, pickLang({ en: 'Repair (1 h)', zh: '修复（1小时）' })),
        h(
          'button',
          { disabled: hasWire ? null : true, onclick: () => (queueRepair(state, true), toast(pickLang({ en: 'Repairing the circuit with wire…', zh: '用铁丝修理电路……' }))) },
          `${pickLang({ en: 'Quick repair (30 min)', zh: '快速修理（30分钟）' })} · ${itemName(WIRE)}`
        )
      )
    );
  }
  return section(pickLang({ en: 'Supply', zh: '供电' }), ...rows);
}

function solarText(state, p) {
  const sun = weatherSunFactor(state);
  if (daylight(state.clock) <= 0) return pickLang({ en: 'Night: solar panels produce nothing until sunrise.', zh: '夜间：日出前太阳能板不发电。' });
  if (sun < 0.5) return pickLang({ en: `${weatherLabel(state.weather?.today?.kind)}: clouds cut output to ${Math.round(sun * 100)}% of a sunny day.`, zh: `${weatherLabel(state.weather?.today?.kind)}：云层让发电量降到晴天的${Math.round(sun * 100)}%。` });
  if (daylight(state.clock) < 1) return pickLang({ en: 'Low sun: output rises towards midday.', zh: '日照偏低，临近中午发电量会升高。' });
  return pickLang({ en: `Good sun: panels run at ${Math.round(p.solarEff * 100)}%.`, zh: `日照充足，太阳能板效率${Math.round(p.solarEff * 100)}%。` });
}

function balanceSection(state, p) {
  const scale = Math.max(1, p.gen || 0, p.draw || 0);
  const rows = [
    h('div', { class: 'kv' }, h('span', {}, pickLang({ en: 'Generation', zh: '发电' })), h('b', {}, watts(p.gen || 0))),
    bar(p.gen || 0, scale, 'hp'),
    h('div', { class: 'kv' }, h('span', {}, pickLang({ en: 'Draw', zh: '用电' })), h('b', { class: (p.draw || 0) > (p.gen || 0) && !p.grid ? 'warn' : '' }, watts(p.draw || 0))),
    bar(p.draw || 0, scale, 'sat'),
  ];
  if (p.capacity > 0) {
    const pct = p.stored / p.capacity;
    const net = (p.gen || 0) - (p.draw || 0);
    let eta = '';
    if (!p.grid && net < 0 && p.stored > 0) eta = pickLang({ en: ` · lasts ≈ ${formatDuration((p.stored / -net) * 3600)}`, zh: ` · 约可用${formatDuration((p.stored / -net) * 3600)}` });
    else if (net > 0 && p.stored < p.capacity) eta = pickLang({ en: ` · full in ≈ ${formatDuration(((p.capacity - p.stored) / net) * 3600)}`, zh: ` · 约${formatDuration(((p.capacity - p.stored) / net) * 3600)}充满` });
    rows.push(h('div', { class: 'kv' }, h('span', {}, pickLang({ en: 'Battery', zh: '储电' })), h('b', {}, `${Math.round(p.stored)} / ${Math.round(p.capacity)} Wh (${Math.round(pct * 100)}%)${eta}`)), bar(p.stored, p.capacity, 'sta'));
  } else {
    rows.push(h('div', { class: 'dim' }, pickLang({ en: 'No battery: surplus power is wasted and nothing is kept for the night.', zh: '没有蓄电池：多余的电会浪费，夜里无电可用。' })));
  }
  if (p.brownout) rows.push(h('div', { class: 'bad' }, pickLang({ en: 'Power shortage: appliances are cut off by priority (fridges are kept longest, lights go first).', zh: '电力不足：按优先级断电（冰箱最后断电，照明最先）。' })));
  rows.push(h('div', { class: 'kv', dataset: { tip: pickLang({ en: 'Solar output = panel rating × daylight × weather. It is 0 at night and drops sharply on overcast, rainy and snowy days.', zh: '太阳能发电 = 额定功率 × 日照 × 天气。夜间为0，阴雨雪天大幅下降。' }) } }, h('span', {}, pickLang({ en: 'Solar efficiency', zh: '太阳能效率' })), h('b', {}, `${Math.round((p.solarEff || 0) * 100)}%`)));
  rows.push(h('div', { class: 'dim' }, solarText(state, p)));
  rows.push(
    h(
      'div',
      { class: 'row', style: { alignItems: 'center' } },
      h('span', {}, pickLang({ en: `Main lights (${LIGHT_W} W per floor at night)`, zh: `主照明（夜间每层${LIGHT_W}W）` })),
      h('span', { class: 'spacer' }),
      h('span', { class: p.lightsOff ? 'dim' : p.lightsPowered ? 'good' : 'bad' }, p.lightsOff ? pickLang({ en: 'Off', zh: '关' }) : p.lightsPowered ? pickLang({ en: 'On', zh: '开' }) : pickLang({ en: 'No power', zh: '无电' })),
      h('button', { onclick: () => (setLights(state, !!p.lightsOff), refreshWindows()) }, p.lightsOff ? pickLang({ en: 'Switch on', zh: '打开' }) : pickLang({ en: 'Switch off', zh: '关闭' }))
    )
  );
  return section(pickLang({ en: 'Balance', zh: '电力平衡' }), ...rows);
}

function sourceRow(state, row) {
  const { f, role, status } = row;
  const icon = { solar: '☀', fuelGen: '⛽', manualGen: '🚲', ratGen: '🐀' }[role] || '⚡';
  const extra = [];
  const buttons = [];
  if (role === 'fuelGen') {
    extra.push(`${pickLang({ en: 'fuel', zh: '燃料' })} ${hoursText(fuelHoursLeft(state, f))}`);
    if (f.data.auto) extra.push(pickLang({ en: `auto <${f.data.autoPct}%`, zh: `自动<${f.data.autoPct}%` }));
    buttons.push(h('button', { onclick: () => startFurnitureFunction(state, f.uid, 1755) }, pickLang({ en: 'Manage', zh: '管理' })));
  } else if (role === 'ratGen') {
    const cage = cageFeed(state, f);
    extra.push(`${cage.rats.length}/${rodentSlots(f)} 🐀`, `${pickLang({ en: 'feed', zh: '饲料' })} ${hoursText(feedHoursLeft(state, f))}`);
    buttons.push(h('button', { onclick: () => startFurnitureFunction(state, f.uid, 1790) }, pickLang({ en: 'Manage', zh: '管理' })));
  } else if (role === 'manualGen') {
    buttons.push(h('button', { onclick: () => startFurnitureFunction(state, f.uid, 1703) }, pickLang({ en: 'Pedal 1 h', zh: '发电1小时' })));
  }
  const bad = ['noFuel', 'noFood'].includes(status.reason);
  return h(
    'div',
    { class: 'list-item' },
    h('span', {}, `${icon} ${row.label}`),
    h('span', { class: 'dim' }, floorName(state, f.floor)),
    h('span', { class: 'spacer' }),
    h('span', { class: bad ? 'bad' : 'dim' }, [reasonLabel(status.reason), ...extra].filter(Boolean).join(' · ')),
    role === 'manualGen' ? null : h('b', {}, `${watts(status.w || 0)}${status.peak ? ` / ${watts(status.peak)}` : ''}`),
    ...buttons
  );
}

function heaterRow(state, row) {
  const { f, status } = row;
  return h(
    'div',
    { class: 'list-item' },
    h('span', {}, `🔥 ${row.label}`),
    h('span', { class: 'dim' }, floorName(state, f.floor)),
    h('span', { class: 'spacer' }),
    h('span', { class: status.reason === 'noFuel' ? 'bad' : 'dim' }, f.data.lit ? `${pickLang({ en: 'Burning', zh: '燃烧中' })} · ${hoursText(fuelHoursLeft(state, f))}` : reasonLabel(status.reason)),
    h('button', { onclick: () => startFurnitureFunction(state, f.uid, 1776) }, pickLang({ en: 'Add fuel & light', zh: '添柴点火' })),
    h('button', { onclick: () => openPanel('generator', { furn: f.uid }) }, pickLang({ en: 'Fuel', zh: '燃料' }))
  );
}

function applianceRow(state, row) {
  const { f, status } = row;
  const d = furn(f.cfg);
  const on = f.on !== false;
  const powered = f.powered !== false;
  const drawing = status.w > 0;
  return h(
    'div',
    { class: 'list-item' },
    h('span', { class: powered ? 'good' : 'bad' }, powered ? '●' : '✖'),
    h('span', {}, row.label),
    h('span', { class: 'dim' }, floorName(state, f.floor)),
    h('span', { class: 'spacer' }),
    h('span', { class: status.reason === 'shortage' || status.reason === 'damaged' ? 'bad' : 'dim' }, reasonLabel(status.reason)),
    h('b', { dataset: { tip: pickLang({ en: `Rated ${d.pw} W${d.pwMode === 1 ? ', only while in use' : ''}`, zh: `额定${d.pw}W${d.pwMode === 1 ? '，仅使用时耗电' : ''}` }) } }, drawing ? watts(status.w) : `0 / ${watts(d.pw)}`),
    status.reason === 'locked'
      ? null
      : h(
          'button',
          {
            class: on ? '' : 'primary',
            onclick: () => {
              setApplianceOn(state, f.uid, !on);
              refreshWindows();
            },
          },
          on ? pickLang({ en: 'Turn off', zh: '关闭' }) : pickLang({ en: 'Turn on', zh: '开启' })
        )
  );
}

function overview(state, body) {
  const p = state.power;
  if (!p) return;
  const ov = powerOverview(state);
  body.appendChild(weatherSection(state) || h('span'));
  body.appendChild(gridSection(state, p));
  body.appendChild(balanceSection(state, p));
  const empty = (text) => h('div', { class: 'dim' }, text);
  body.appendChild(section(pickLang({ en: 'Generators', zh: '发电设备' }), h('div', { class: 'list' }, ...ov.sources.map((r) => sourceRow(state, r))), ov.sources.length ? null : empty(pickLang({ en: 'No generators installed. Solar panels, fuel generators, manual generators and rat cages keep the lights on after the blackout.', zh: '还没有发电设备。停电后要靠太阳能板、燃油发电机、人力发电机或老鼠笼供电。' }))));
  if (ov.batteries.length) {
    body.appendChild(section(pickLang({ en: 'Batteries', zh: '储电设备' }), h('div', { class: 'list' }, ...ov.batteries.map((r) => h('div', { class: 'list-item' }, h('span', {}, `🔋 ${r.label}`), h('span', { class: 'dim' }, floorName(state, r.f.floor)), h('span', { class: 'spacer' }), h('b', {}, `${Math.round(r.status.cap || 0)} Wh`))))));
  }
  if (ov.heaters.length) body.appendChild(section(pickLang({ en: 'Fuel heating', zh: '燃料取暖' }), h('div', { class: 'list' }, ...ov.heaters.map((r) => heaterRow(state, r)))));
  body.appendChild(section(pickLang({ en: 'Appliances', zh: '电器' }), h('div', { class: 'list' }, ...ov.appliances.map((r) => applianceRow(state, r))), ov.appliances.length ? null : empty(pickLang({ en: 'No electrical appliances.', zh: '没有电器。' }))));
}

registerPanel('power', () => {
  const state = game.state;
  if (!state) return;
  const entry = openWindow('power', {
    title: `⚡ ${pickLang({ en: 'Power Overview', zh: '电力总览' })}`,
    width: 640,
    build: (body) => overview(state, body),
  });
  keepFresh('power', entry);
});

// ------------------------------------------------------------------------------ generator / heater
function fuelNames(heater) {
  return heater
    ? pickLang({ en: 'Wood chips, boards, paper, cardboard, newspapers, alcohol, gas canisters, diesel', zh: '木片、木板、纸片、硬纸、报纸、酒精、卡式气瓶、柴油' })
    : pickLang({ en: 'Diesel, alcohol, gas canisters', zh: '柴油、酒精、卡式气瓶' });
}

function generatorBody(state, f, body) {
  const heater = powerRole(f) === 'heater';
  const ec = elecCfg(furn(f.cfg).elecCfg) || {};
  const inv = fuelInventory(state, f);
  const st = state.power?.units?.[f.uid] || {};
  const running = f.on === true;
  const refresh = () => refreshWindows();
  const accept = heater ? isHeaterFuel : isGeneratorFuel;
  const bp = state.player.backpack;
  const statusText = running
    ? heater
      ? pickLang({ en: `Burning — warms ${floorName(state, f.floor)}`, zh: `燃烧中，温暖${floorName(state, f.floor)}` })
      : `${pickLang({ en: 'Running', zh: '运行中' })} · ${watts(st.w || 0)}`
    : reasonLabel(st.reason) || pickLang({ en: 'Stopped', zh: '已停止' });
  body.appendChild(
    h(
      'div',
      { class: 'row', style: { alignItems: 'center', flexWrap: 'wrap' } },
      h('b', { class: running ? 'good' : st.reason === 'noFuel' ? 'bad' : 'dim' }, statusText),
      h('span', { class: 'spacer' }),
      h(
        'button',
        {
          class: running ? '' : 'primary',
          onclick: () => {
            // a generator is started / stopped at the machine (开启 / 关闭发电机, 1701 / 1702); a heater is lit here
            if (!heater) queuePanelFunction(state, f.uid, running ? 1702 : 1701);
            else {
              const r = setBurner(state, f.uid, !running, { manual: true });
              if (r !== true) toast(r, 'bad');
            }
            refresh();
          },
        },
        running ? (heater ? pickLang({ en: 'Put out', zh: '熄火' }) : pickLang({ en: 'Stop', zh: '关闭发电机' })) : heater ? pickLang({ en: 'Light', zh: '点火' }) : pickLang({ en: 'Start', zh: '开启发电机' })
      )
    )
  );
  if (!heater) {
    const pct = f.data.autoPct ?? 30;
    const noBattery = !(state.power?.capacity > 0);
    body.appendChild(
      h(
        'div',
        { class: 'row', style: { alignItems: 'center', marginTop: '6px', flexWrap: 'wrap' } },
        h(
          'label',
          { class: 'row', style: { alignItems: 'center', gap: '4px' } },
          h('input', { type: 'checkbox', checked: f.data.auto ? true : null, onchange: (e) => (setAutoStart(state, f.uid, e.target.checked), refresh()) }),
          pickLang({ en: 'Auto Start', zh: '自动启动' })
        ),
        h('input', { type: 'range', min: 5, max: 95, step: 5, value: pct, disabled: noBattery ? true : null, onchange: (e) => (setAutoStart(state, f.uid, f.data.auto, Number(e.target.value)), refresh()) }),
        h(
          'span',
          { class: 'dim' },
          noBattery
            ? pickLang({ en: 'No battery: Auto Start runs it only while the home needs power.', zh: '没有蓄电池：自动启动只在家里需要用电时运行。' })
            : pickLang({ en: `Starts below ${pct}% stored power, stops when the batteries are full. Stopping it by hand turns Auto Start off.`, zh: `储电低于${pct}%时自动启动，充满后自动停机。手动关闭会取消自动启动。` })
        )
      )
    );
  }
  body.appendChild(
    h(
      'div',
      { class: 'dim', style: { marginTop: '6px' } },
      pickLang({
        en: `${heater ? '' : `Output ${watts(ec.BasePower || 0)} · `}burns ${ec.FuelRate || 0} heat per 10 min · ${inv.slots} fuel slots · loaded fuel lasts ≈ ${hoursText(fuelHoursLeft(state, f))}`,
        zh: `${heater ? '' : `输出${watts(ec.BasePower || 0)} · `}每10分钟消耗热值${ec.FuelRate || 0} · ${inv.slots}个燃料槽 · 现有燃料约可烧${hoursText(fuelHoursLeft(state, f))}`,
      })
    ),
    h('div', { class: 'dim' }, `${pickLang({ en: 'Burns:', zh: '可用燃料：' })} ${fuelNames(heater)}`)
  );
  const onChange = () => {
    const n = tidyFuel(state, f.uid);
    if (n) toast(pickLang({ en: 'Only fuel goes in the fuel slots, one item per slot.', zh: '燃料槽只能放燃料，每格一件。' }), 'bad');
    refresh();
  };
  body.appendChild(
    h(
      'div',
      { class: 'row', style: { marginTop: '8px' } },
      h('div', { class: 'col' }, h('div', { class: 'sec-title' }, `${pickLang({ en: 'Fuel slots', zh: '燃料槽' })} ${inv.items.length}/${inv.slots}`), renderGrid(state, inv.id, { onChange, transferTo: () => bp, onError: (r) => toast(reasonText(r), 'bad') })),
      h('div', { class: 'col' }, h('div', { class: 'sec-title' }, tr('ui.inventory')), renderGrid(state, bp, { onChange, transferTo: () => inv.id, mark: (inst) => accept(item(inst.id)), onError: (r) => toast(reasonText(r), 'bad') }))
    )
  );
}

registerPanel('generator', ({ furn: uid }) => {
  const state = game.state;
  const f = state?.furniture[uid];
  if (!f || !['fuelGen', 'heater'].includes(powerRole(f))) return;
  const id = `generator-${uid}`;
  const entry = openWindow(id, { title: furnLabel(f), width: 'auto', build: (body) => generatorBody(state, f, body) });
  keepFresh(id, entry, 2000);
});

// ------------------------------------------------------------------------------ rat cage
function ratCageBody(state, f, body) {
  const cage = cageFeed(state, f);
  const slots = rodentSlots(f);
  const st = state.power?.units?.[f.uid] || {};
  const bp = state.inventories[state.player.backpack];
  const refresh = () => refreshWindows();
  body.appendChild(
    h(
      'div',
      { class: 'row', style: { alignItems: 'center', flexWrap: 'wrap' } },
      h('b', { class: st.reason === 'noFood' ? 'bad' : st.w > 0 ? 'good' : 'dim' }, st.w > 0 ? `${pickLang({ en: 'Generating', zh: '发电中' })} ${watts(st.w)}` : reasonLabel(st.reason) || pickLang({ en: 'Idle', zh: '空闲' })),
      h('span', { class: 'dim' }, pickLang({ en: `${cage.rats.length}/${slots} rodents · each makes ${watts(elecCfg(furn(f.cfg).elecCfg)?.BasePower || 0)} while fed · feed lasts ≈ ${hoursText(feedHoursLeft(state, f))}`, zh: `老鼠${cage.rats.length}/${slots} · 吃饱时每只发电${watts(elecCfg(furn(f.cfg).elecCfg)?.BasePower || 0)} · 饲料约可维持${hoursText(feedHoursLeft(state, f))}` }))
    )
  );
  if (st.reason === 'noFood') body.appendChild(h('div', { class: 'bad' }, pickLang({ en: 'The rodents are starving. They stop running and die after a day without food.', zh: '老鼠在挨饿，停止发电，饿上一天就会死。' })));
  const places = [];
  for (let i = 0; i < slots; i++) {
    const rat = cage.rats[i];
    places.push(
      rat
        ? h('div', { class: 'list-item' }, h('span', {}, `🐀 ${itemName(rat.id)}`), h('span', { class: 'spacer' }), h('button', { onclick: () => (takeRodent(state, f.uid, i), refresh()) }, pickLang({ en: 'Take out', zh: '取出' })))
        : h('div', { class: 'list-item dim' }, pickLang({ en: '(empty place)', zh: '（空位）' }))
    );
  }
  const loose = bp.items.filter((it) => isLiveRodent(it.id));
  body.appendChild(
    section(
      pickLang({ en: 'Rodents', zh: '老鼠' }),
      h('div', { class: 'list' }, ...places),
      h(
        'div',
        { class: 'row', style: { flexWrap: 'wrap', marginTop: '4px' } },
        ...loose.map((it) =>
          h(
            'button',
            {
              disabled: cage.rats.length >= slots ? true : null,
              onclick: () => {
                const r = putRodent(state, f.uid, bp.id, it.uid);
                if (r !== true) toast(r, 'bad');
                refresh();
              },
            },
            `+ ${itemName(it.id)}`
          )
        ),
        h(
          'button',
          {
            class: 'primary',
            disabled: !loose.length || cage.rats.length >= slots ? true : null,
            onclick: () => {
              const n = fillRodents(state, f.uid);
              toast(pickLang({ en: `Put ${n} rodents in the cage.`, zh: `放入了${n}只老鼠。` }));
              refresh();
            },
          },
          pickLang({ en: 'One-click insert', zh: '一键放入' })
        ),
        loose.length ? null : h('span', { class: 'dim' }, pickLang({ en: 'Catch live mice, rats, guinea pigs or lab mice with traps.', zh: '用陷阱抓活的老鼠、豚鼠或小白鼠。' }))
      )
    )
  );
  const onChange = () => {
    const n = tidyFeed(state, f.uid);
    if (n) toast(pickLang({ en: `The feed storage only takes food, ${feedCapacity(f)} items at most.`, zh: `饲料槽只能放食物，最多${feedCapacity(f)}件。` }), 'bad');
    refresh();
  };
  body.appendChild(
    section(
      `${pickLang({ en: 'Feed storage', zh: '饲料槽' })} ${cage.items.length}/${feedCapacity(f)}`,
      h(
        'button',
        {
          onclick: () => {
            const n = feedCage(state, f.uid);
            toast(n ? pickLang({ en: `Added ${n} food items, shortest shelf life first.`, zh: `按保质期由短到长放入了${n}份食物。` }) : pickLang({ en: 'No suitable food in the backpack or fridges.', zh: '背包和冰箱里没有合适的食物。' }), n ? 'info' : 'bad');
            refresh();
          },
        },
        pickLang({ en: 'One-click feeding (backpack + fridges)', zh: '一键喂食（背包+冰箱）' })
      ),
      h(
        'div',
        { class: 'row', style: { marginTop: '6px' } },
        h('div', { class: 'col' }, renderGrid(state, cage.id, { onChange, transferTo: () => bp.id, onError: (r) => toast(reasonText(r), 'bad') })),
        h('div', { class: 'col' }, h('div', { class: 'sec-title' }, tr('ui.inventory')), renderGrid(state, bp.id, { onChange, transferTo: () => cage.id, mark: (inst) => isRatFeed(item(inst.id)), onError: (r) => toast(reasonText(r), 'bad') }))
      )
    )
  );
}

registerPanel('ratCage', ({ furn: uid }) => {
  const state = game.state;
  const f = state?.furniture[uid];
  if (!f || powerRole(f) !== 'ratGen') return;
  const id = `ratCage-${uid}`;
  const entry = openWindow(id, { title: furnLabel(f), width: 'auto', build: (body) => ratCageBody(state, f, body) });
  keepFresh(id, entry, 2000);
});

// ------------------------------------------------------------------------------ toolbar
function powerAlert(state) {
  const p = state.power;
  return !!p && (p.damaged || p.brownout || Object.values(p.units || {}).some((u) => u.reason === 'noFood'));
}

registerToolbarButton({ label: () => `⚡ ${tr('ui.power')}`, key: 'P', panel: 'power', dot: powerAlert });

