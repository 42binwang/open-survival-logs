// City map (M) with travel times, Finish Preparation, the prologue window and the Stockpile Checklist.
import { h, openWindow, closeWindow, refreshWindows, toast, anyModalOpen, isOpen } from './dom.js';
import { registerPanel, openPanel } from './panels.js';
import { registerToolbarButton } from './hud.js';
import { keyFor } from './menus.js';
import { game } from '../game.js';
import { pickLang, tr } from '../engine/i18n.js';
import { on } from '../engine/bus.js';
import { formatDuration, formatClock, secondsUntilOutbreak } from '../sim/time.js';
import { CHARACTERS } from '../content/characters.js';
import { LOCATIONS, MAP_SIZE, PROLOGUE, PROLOGUE_TIPS } from '../content/shops.js';
import { locationOf, locationName, startTravel, travelSeconds, finishPreparation, stockpileChecklist, stockpileKg, POINTS_GOAL, KG_GOALS } from '../sim/predisaster.js';

const PRE_WINDOWS = ['map', 'finishPrep', 'checklist', 'tut-map', 'tut-shop'];

function modalPause(state, paused) {
  state.ui.modalPause = paused;
}

// ------------------------------------------------------------------------------ city map
function roads(here) {
  const [hx, hy] = LOCATIONS[here].map;
  const lines = Object.values(LOCATIONS)
    .filter((l) => l.id !== here)
    .map((l) => `<line x1="${hx}%" y1="${hy}%" x2="${l.map[0]}%" y2="${l.map[1]}%" stroke="#4a4f56" stroke-width="2" stroke-dasharray="6 5"/>`)
    .join('');
  return h('div', { style: { position: 'absolute', inset: '0', pointerEvents: 'none' }, html: `<svg width="100%" height="100%">${lines}</svg>` });
}

function travelInfo(state, from, to) {
  const sec = travelSeconds(state, from, to);
  return { sec, label: `${state.pre.car ? '🚗' : '🚶'} ${formatDuration(sec)}` };
}

function details(state, sel, here) {
  if (!sel) return h('div', { class: 'dim', style: { marginTop: '8px' } }, pickLang({ en: 'Pick a destination on the map.', zh: '在地图上选择目的地。' }));
  const loc = LOCATIONS[sel];
  const left = secondsUntilOutbreak(state);
  const go = travelInfo(state, here, sel);
  const back = sel === 'home' ? 0 : travelSeconds(state, sel, 'home');
  const arrive = formatClock({ ...state.clock, t: state.clock.t + go.sec });
  const traveling = state.pre.travel?.dest === sel;
  const warn = go.sec + back > left;
  return h(
    'div',
    { class: 'col', style: { marginTop: '8px' } },
    h('div', { class: 'row', style: { alignItems: 'center' } }, h('b', {}, `${loc.icon} ${locationName(sel)}`), state.pre.visited.includes(sel) ? h('span', { class: 'pill' }, pickLang({ en: 'Visited', zh: '去过' })) : null, loc.riot && state.pre.riot ? h('span', { class: 'pill bad' }, pickLang({ en: 'Rioting — free grabs', zh: '暴乱中——免费哄抢' })) : null),
    loc.blurb ? h('div', { class: 'dim' }, pickLang(loc.blurb)) : null,
    sel === here
      ? h('div', { class: 'good' }, pickLang({ en: 'You are here.', zh: '你就在这里。' }))
      : h(
          'div',
          { class: 'row', style: { alignItems: 'center' } },
          h('span', {}, pickLang({ en: `${go.label} · arrive ~${arrive}`, zh: `${go.label} · 约${arrive}到达` })),
          warn ? h('span', { class: 'bad' }, pickLang({ en: 'You will not make it back home before the outbreak!', zh: '灾变前来不及回家了！' })) : null,
          h('span', { class: 'spacer' }),
          h(
            'button',
            {
              class: 'primary',
              disabled: traveling ? true : null,
              onclick: () => {
                if (startTravel(state, sel)) {
                  closeWindow('map');
                  toast(pickLang({ en: `Heading to ${locationName(sel)}…`, zh: `正在前往${locationName(sel)}……` }));
                }
              },
            },
            traveling ? pickLang({ en: 'On the way', zh: '路上' }) : tr('ui.travel')
          )
        )
  );
}

registerPanel('map', () => {
  const state = game.state;
  if (!state) return;
  if (state.phase !== 'pre') return openPanel('exploreMap');
  let sel = null;
  openWindow('map', {
    title: pickLang({ en: 'City Map', zh: '城市地图' }),
    width: MAP_SIZE[0] + 24,
    build: (body) => {
      const pre = state.pre;
      const here = locationOf(state);
      body.appendChild(
        h(
          'div',
          { class: 'row', style: { alignItems: 'center', marginBottom: '6px' } },
          h('span', { class: 'bad' }, `☣ ${formatDuration(secondsUntilOutbreak(state))}`),
          h('span', {}, `${tr('stat.money')} `, h('b', {}, `$${Math.round(state.player.money)}`)),
          h('span', { class: 'dim' }, pre.car ? pickLang({ en: '🚗 Driving', zh: '🚗 开车' }) : pickLang({ en: '🚶 On foot', zh: '🚶 步行' })),
          h('span', { class: 'spacer' }),
          h('span', { class: pre.visited.length >= POINTS_GOAL ? 'good' : 'dim' }, pickLang({ en: `Supply points ${pre.visited.length}/${POINTS_GOAL}`, zh: `采购点 ${pre.visited.length}/${POINTS_GOAL}` }))
        )
      );
      const map = h('div', { class: 'mapview', style: { width: `${MAP_SIZE[0]}px`, height: `${MAP_SIZE[1]}px` } }, roads(here));
      for (const loc of Object.values(LOCATIONS)) {
        const cls = ['mapnode', loc.id === 'home' ? 'home' : '', pre.visited.includes(loc.id) ? 'visited' : '', loc.riot && pre.riot ? 'overrun' : ''].join(' ');
        map.appendChild(
          h(
            'div',
            {
              class: cls,
              style: { left: `${loc.map[0]}%`, top: `${loc.map[1]}%`, outline: sel === loc.id ? '2px solid var(--accent)' : loc.id === here ? '2px solid var(--good)' : '' },
              onclick: () => {
                sel = loc.id;
                refreshWindows();
              },
            },
            h('div', {}, `${loc.icon} ${locationName(loc.id)}`),
            h('div', { class: 'dim' }, loc.id === here ? pickLang({ en: 'You are here', zh: '当前位置' }) : travelInfo(state, here, loc.id).label)
          )
        );
      }
      body.appendChild(map);
      body.appendChild(details(state, sel, here));
      body.appendChild(
        h(
          'div',
          { class: 'row', style: { marginTop: '10px', alignItems: 'center' } },
          h('span', { class: 'dim' }, pickLang({ en: 'Riots break out in the last 3 hours. The trunk is unloaded at your door when the outbreak hits.', zh: '最后3小时会爆发暴乱。灾变时后备箱里的东西会卸在家门口。' })),
          h('span', { class: 'spacer' }),
          h('button', { class: 'danger', onclick: () => openPanel('finishPrep') }, tr('ui.finishPrep'))
        )
      );
    },
  });
});

registerPanel('finishPrep', () => {
  const state = game.state;
  if (!state || state.phase !== 'pre') return;
  modalPause(state, true);
  openWindow('finishPrep', {
    title: tr('ui.finishPrep'),
    width: 400,
    modal: true,
    onClose: () => modalPause(state, false),
    build: (body) => {
      const away = state.player.scene !== 'home';
      body.appendChild(
        h(
          'div',
          { class: 'eventbox' },
          h('p', {}, pickLang({ en: `Skip the remaining ${formatDuration(secondsUntilOutbreak(state))} and let the outbreak begin?`, zh: `跳过剩余的${formatDuration(secondsUntilOutbreak(state))}，让灾变开始？` })),
          away ? h('p', { class: 'warn' }, pickLang({ en: 'You will head straight home.', zh: '你会直接回家。' })) : null,
          state.pre.trunk ? h('p', { class: 'dim' }, pickLang({ en: 'Supplies in your trunk will be unloaded into shopping bags by the door.', zh: '后备箱里的物资会卸到门口的购物袋里。' })) : null,
          h(
            'div',
            { class: 'choices' },
            h(
              'button',
              {
                class: 'primary',
                onclick: () => {
                  for (const id of PRE_WINDOWS) closeWindow(id);
                  finishPreparation(state);
                },
              },
              tr('menu.confirm')
            ),
            h('button', { onclick: () => closeWindow('finishPrep') }, tr('menu.cancel'))
          )
        )
      );
    },
  });
});

// ------------------------------------------------------------------------------ prologue (A05)
registerPanel('prologue', () => {
  const state = game.state;
  if (!state) return;
  modalPause(state, true);
  const ch = CHARACTERS[state.meta.character];
  openWindow('prologue', {
    title: pickLang({ en: 'Survival Log — Day 0', zh: '生存日志——第0天' }),
    width: 560,
    modal: true,
    onClose: () => modalPause(state, false),
    build: (body) => {
      body.appendChild(h('div', { class: 'story-text', style: { textAlign: 'left', fontSize: '14px' } }, ...PROLOGUE.map((p) => h('p', {}, pickLang(p)))));
      body.appendChild(
        h(
          'div',
          { class: 'dim', style: { margin: '8px 0' } },
          pickLang({ en: `${pickLang(ch.name)} · $${Math.round(state.player.money)} · ${formatDuration(secondsUntilOutbreak(state))} until the outbreak`, zh: `${pickLang(ch.name)} · $${Math.round(state.player.money)} · 距离灾变${formatDuration(secondsUntilOutbreak(state))}` })
        )
      );
      body.appendChild(h('ul', {}, ...PROLOGUE_TIPS.map((t) => h('li', {}, pickLang(t)))));
      body.appendChild(h('div', { class: 'choices', style: { marginTop: '10px' } }, h('button', { class: 'primary', onclick: () => closeWindow('prologue') }, pickLang({ en: 'This time, I will be ready', zh: '这一次，我会做好准备' }))));
    },
  });
});

// ------------------------------------------------------------------------------ Stockpile Checklist (E10)
const STATUS = {
  low: { cls: 'bad', text: { en: 'Low', zh: '不足' } },
  adequate: { cls: 'warn', text: { en: 'Adequate', zh: '够用' } },
  plentiful: { cls: 'good', text: { en: 'Plentiful', zh: '充足' } },
};

registerPanel('checklist', () => {
  const state = game.state;
  if (!state) return;
  openWindow('checklist', {
    title: pickLang({ en: 'Stockpile Checklist', zh: '囤货清单' }),
    width: 520,
    build: (body) => {
      const pre = state.pre;
      const kg = stockpileKg(state);
      body.appendChild(
        h(
          'div',
          { class: 'row', style: { flexWrap: 'wrap', marginBottom: '6px' } },
          h('span', {}, pickLang({ en: `Stockpiled ${kg.toFixed(1)} kg`, zh: `已囤${kg.toFixed(1)}千克` }), h('span', { class: 'dim' }, ` (${KG_GOALS.join(' / ')} kg)`)),
          h('span', {}, pickLang({ en: `Food types ${pre.foodTypes.length}`, zh: `食物种类${pre.foodTypes.length}` })),
          h('span', {}, pickLang({ en: `Material types ${pre.matTypes.length}`, zh: `材料种类${pre.matTypes.length}` })),
          h('span', {}, pickLang({ en: `Spent $${Math.round(pre.spent)} of $${Math.round(pre.budget)}`, zh: `已花$${Math.round(pre.spent)} / $${Math.round(pre.budget)}` }))
        )
      );
      body.appendChild(h('div', { class: 'dim', style: { marginBottom: '6px' } }, pickLang({ en: 'Counts what is at home, in your backpack, in the trunk and at the doorstep.', zh: '统计家中、背包、后备箱和门口的物资。' })));
      for (const cat of stockpileChecklist(state)) {
        body.appendChild(h('div', { class: 'sec-title' }, pickLang(cat.name)));
        body.appendChild(
          h(
            'div',
            { class: 'list' },
            ...cat.dims.map((d) =>
              h(
                'div',
                { class: 'list-item' },
                h('span', {}, pickLang(d.name)),
                h('span', { class: 'spacer' }),
                h('span', { class: 'dim', dataset: { tip: pickLang({ en: `Adequate ${d.need[0]} · Plentiful ${d.need[1]}`, zh: `够用${d.need[0]} · 充足${d.need[1]}` }) } }, `${d.value}${d.measure === 'sat' ? pickLang({ en: ' satiety', zh: '饱腹' }) : ''}`),
                h('span', { class: `pill ${STATUS[d.status].cls}` }, pickLang(STATUS[d.status].text))
              )
            )
          )
        );
      }
    },
  });
});

const checklistKey = () => keyFor('checklist') || 'H';

registerToolbarButton({ label: () => `🗺 ${tr('ui.map')}`, key: 'M', panel: 'map', visible: (s) => s.phase === 'pre' });
registerToolbarButton({
  label: () => `📋 ${pickLang({ en: 'Checklist', zh: '囤货清单' })}`,
  key: checklistKey(),
  panel: 'checklist',
  visible: (s) => s.phase === 'pre',
  dot: (s) => stockpileKg(s) < KG_GOALS[0],
});

window.addEventListener('keydown', (e) => {
  const state = game.state;
  if (!state || state.phase !== 'pre' || anyModalOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.toUpperCase() !== checklistKey().toUpperCase() || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  if (isOpen('checklist')) closeWindow('checklist');
  else openPanel('checklist');
});

on('outbreak', () => {
  for (const id of PRE_WINDOWS) closeWindow(id);
});
