// Trap panels: bait + catch holding, and choosing a trap slot.
import { h, openWindow, closeWindow, refreshWindows, toast } from './dom.js';
import { registerPanel, reasonText } from './panels.js';
import { renderGrid } from './invgrid.js';
import { game } from '../game.js';
import { pickLang } from '../engine/i18n.js';
import { itemName } from '../data/db.js';
import { trapSlots, queuePlaceTrap, catchChancePerHour, TRAP_TYPES, trapFits, trapHabitats, habitatOf, HABITAT_NAMES } from '../sim/traps.js';
import { furnLabel } from '../sim/home.js';
import { locateUid } from '../sim/inventory.js';

registerPanel('trap', ({ furn: uid }) => {
  const state = game.state;
  const f = state.furniture[uid];
  if (!f || f.cfg !== 'trap') return;
  openWindow(`trap-${uid}`, {
    title: furnLabel(f),
    width: 'auto',
    build: (body) => {
      const bp = state.player.backpack;
      const t = TRAP_TYPES[f.data.type];
      body.appendChild(
        h(
          'div',
          { class: 'dim' },
          pickLang({ en: `Durability ${f.data.durability}/${f.data.maxDurability} · catch chance ${(catchChancePerHour(state, f) * 100).toFixed(1)}%/h · ${HABITAT_NAMES[f.data.habitat]?.en || f.data.habitat}`, zh: `耐久 ${f.data.durability}/${f.data.maxDurability} · 捕获概率 ${(catchChancePerHour(state, f) * 100).toFixed(1)}%/小时 · ${HABITAT_NAMES[f.data.habitat]?.zh || ''}` })
        )
      );
      body.appendChild(h('div', { class: 'dim' }, pickLang({ en: 'Can catch: ', zh: '可捕获：' }), t.prey.map((id) => itemName(id)).join(', ')));
      if (f.data.durability <= 1) body.appendChild(h('div', { class: 'bad' }, pickLang({ en: 'Almost worn out — bait may be wasted.', zh: '快坏了，放诱饵可能会浪费。' })));
      const refresh = () => refreshWindows();
      body.appendChild(
        h(
          'div',
          { class: 'row' },
          h(
            'div',
            { class: 'col' },
            h('div', { class: 'sec-title' }, pickLang({ en: 'Bait (food with Satiety)', zh: '诱饵（有饱腹值的食物）' })),
            renderGrid(state, f.data.bait, { onChange: refresh, transferTo: () => bp, onError: (r) => toast(reasonText(r), 'bad') }),
            h('div', { class: 'sec-title' }, pickLang({ en: 'Caught', zh: '捕获' })),
            renderGrid(state, f.data.hold, { onChange: refresh, transferTo: () => bp, onError: (r) => toast(reasonText(r), 'bad') })
          ),
          h('div', { class: 'col' }, h('div', { class: 'sec-title' }, pickLang({ en: 'Backpack', zh: '背包' })), renderGrid(state, bp, { onChange: refresh, transferTo: () => f.data.bait, onError: (r) => toast(reasonText(r), 'bad') }))
        )
      );
    },
  });
});

registerPanel('trapPlace', ({ uid }) => {
  const state = game.state;
  openWindow('trapPlace', {
    title: pickLang({ en: 'Set a trap', zh: '布置陷阱' }),
    width: 420,
    build: (body) => {
      const trapId = locateUid(state, uid)?.inst.id;
      const free = trapSlots(state).filter((s) => !state.home.slots[s.id]);
      const slots = free.filter((s) => trapFits(state, trapId, s));
      if (!slots.length) {
        const where = trapHabitats(trapId).map((k) => pickLang(HABITAT_NAMES[k])).join(pickLang({ en: ', ', zh: '、' }));
        body.appendChild(
          h(
            'div',
            { class: 'dim' },
            free.length
              ? pickLang({ en: `No free spot suits this trap. It works in: ${where}.`, zh: `没有适合这种陷阱的空位。可放置于：${where}。` })
              : pickLang({ en: 'No free trap spots. Unlock more floors or take a trap back.', zh: '没有空的陷阱位。解锁更多楼层或收回已有陷阱。' })
          )
        );
        return;
      }
      body.appendChild(
        h(
          'div',
          { class: 'list' },
          ...slots.map((s) =>
            h(
              'div',
              { class: 'list-item' },
              h('span', {}, `${s.floor} · ${pickLang(HABITAT_NAMES[habitatOf(state, s)])}`),
              h('span', { class: 'spacer' }),
              h(
                'button',
                {
                  class: 'primary',
                  onclick: () => {
                    queuePlaceTrap(state, uid, s.id);
                    closeWindow('trapPlace');
                  },
                },
                pickLang({ en: 'Set here', zh: '放在这里' })
              )
            )
          )
        )
      );
    },
  });
});
