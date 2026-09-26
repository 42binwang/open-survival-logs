// Neighbor-side panels: the rope-and-basket line on the terrace, feeding the trapped veteran and
// the doorstep cat's choice dialog (auto-picks its default when the countdown runs out).
import { h, openWindow, closeWindow, refreshWindow, isOpen, toast } from './dom.js';
import { registerPanel, reasonText, quickUse } from './panels.js';
import { renderGrid, weightLine } from './invgrid.js';
import { picker, picksArray, pickedList } from './dronePanel.js';
import { game } from '../game.js';
import { pickLang, tr } from '../engine/i18n.js';
import { on } from '../engine/bus.js';
import { formatDuration } from '../sim/time.js';
import { organize } from '../sim/inventory.js';
import {
  neighborState, neighborDef, nextHeartAt, activeRescue, activeRequest, requestDef, basketGiftUids, queueBasketSend,
  veteranState, giveVeteran, foodSat, catEvent, catVisible, catTimeLeft, resolveCat,
} from '../sim/social.js';
import { RESCUE_TASKS, ROPE_MAX, BASKET_MAX_KG, VETERAN } from '../content/people.js';

const dim = (text) => h('div', { class: 'dim', style: { maxWidth: '560px' } }, text);

on('basketSent', () => isOpen('basket') && refreshWindow('basket'));
on('neighborGift', () => isOpen('basket') && refreshWindow('basket'));

function hearts(n) {
  return `${'♥'.repeat(n)}${'♡'.repeat(5 - n)}`;
}

function neighborHeader(state) {
  const n = neighborState(state);
  const def = neighborDef(state);
  const next = nextHeartAt(n.affinity);
  const task = activeRescue(state);
  const req = activeRequest(state);
  return h(
    'div',
    { class: 'col', style: { gap: '3px' } },
    h(
      'div',
      { class: 'row', style: { alignItems: 'center' } },
      h('b', {}, pickLang(def.name)),
      h('span', { style: { color: '#e06a7a', letterSpacing: '2px' } }, hearts(n.hearts)),
      h('span', { class: 'dim' }, next != null ? pickLang({ en: `affinity ${Math.floor(n.affinity)}/${next}`, zh: `好感 ${Math.floor(n.affinity)}/${next}` }) : pickLang({ en: 'a true bond', zh: '真正的羁绊' }))
    ),
    h(
      'div',
      { class: 'dim' },
      pickLang({ en: `Food left: ${n.foodDays < 1 ? 'none!' : `~${Math.floor(n.foodDays)} days`}`, zh: `剩余口粮：${n.foodDays < 1 ? '没有了！' : `约${Math.floor(n.foodDays)}天`}` }),
      ` · ${pickLang({ en: 'Rope', zh: '绳子' })} ${Math.max(0, n.ropeHp)}/${ROPE_MAX}`
    ),
    task ? h('div', {}, `${pickLang(RESCUE_TASKS.find((r) => r.id === task.id).label)}: ${Math.floor(task.progress)}/${task.need}${task.requests ? ` · ${pickLang({ en: 'requests', zh: '请求' })} ${task.reqDone}/${task.requests}` : ''}`) : null,
    req ? h('div', { class: 'warn' }, `🧺 ${pickLang(requestDef(req).text)} (${formatDuration(req.expires - state.clock.t)})`) : null
  );
}

registerPanel('basket', () => {
  const state = game.state;
  if (!state) return;
  openWindow('basket', {
    title: pickLang({ en: 'Rope-and-Basket Line', zh: '吊篮' }),
    width: 'auto',
    build: (body) => {
      const refresh = () => refreshWindow('basket');
      const n = neighborState(state);
      const def = neighborDef(state);
      if (!def) {
        body.appendChild(dim(pickLang({ en: 'The line leads to an empty building.', zh: '绳子那头是一栋空楼。' })));
        return;
      }
      body.appendChild(neighborHeader(state));
      if (!n.alive) {
        body.appendChild(dim(pickLang(def.lines.dead)));
        return;
      }
      if (!n.basketRepaired) {
        body.appendChild(dim(pickLang({ en: 'The pulley is rusted and the basket hangs by a thread. Repair it first (1 h, Stamina 20).', zh: '滑轮锈死了，篮子摇摇欲坠。先把它修好（1小时，精力20）。' })));
        return;
      }
      const bp = state.player.backpack;
      const gifts = basketGiftUids(state);
      const onError = (r) => toast(reasonText(r), 'bad');
      body.appendChild(
        h(
          'div',
          { class: 'row', style: { marginTop: '6px' } },
          h(
            'div',
            { class: 'col' },
            h('div', { class: 'row' }, h('span', { class: 'sec-title' }, pickLang({ en: 'Basket', zh: '篮子' })), h('span', { class: 'dim' }, weightLine(state, n.basketInv))),
            renderGrid(state, n.basketInv, { onChange: refresh, transferTo: () => bp, onError, mark: (inst) => gifts.includes(inst.uid) }),
            gifts.length ? dim(pickLang({ en: '★ From her side — take them out.', zh: '★ 对面送来的——取出来吧。' })) : null,
            h(
              'div',
              { class: 'row' },
              h(
                'button',
                {
                  class: 'primary',
                  disabled: n.ropeHp > 0 ? null : true,
                  onclick: () => {
                    const a = queueBasketSend(state);
                    if (a) toast(pickLang({ en: 'Sending the basket across…', zh: '正在把篮子送过去……' }));
                  },
                },
                pickLang({ en: `Send (max ${BASKET_MAX_KG} kg)`, zh: `送出（最多${BASKET_MAX_KG}千克）` })
              ),
              h('button', { onclick: () => (organize(state.inventories[n.basketInv]), refresh()) }, tr('ui.organize'))
            ),
            n.ropeHp <= 0 ? h('div', { class: 'bad' }, pickLang({ en: 'The rope is frayed. Change it at the basket.', zh: '绳子磨坏了，去吊篮那里换绳。' })) : null
          ),
          h(
            'div',
            { class: 'col' },
            h('div', { class: 'row' }, h('span', { class: 'sec-title' }, tr('ui.inventory')), h('span', { class: 'dim' }, weightLine(state, bp))),
            renderGrid(state, bp, { onChange: refresh, transferTo: () => n.basketInv, onError, onUse: (i) => quickUse(state, bp, i) })
          )
        )
      );
      body.appendChild(dim(pickLang({ en: 'Food fills her pantry and rescue progress; medicine and useful things raise her affinity. She sends gifts back the next day.', zh: '食物能补充她的口粮、推进救助进度；药品和有用的东西更能提升好感。第二天她会回礼。' })));
    },
  });
});

// ------------------------------------------------------------------------------ veteran
registerPanel('giveSupplies', () => {
  const state = game.state;
  if (!state) return;
  const ctx = { win: 'giveSupplies', picks: new Map(), src: null };
  openWindow('giveSupplies', {
    title: pickLang({ en: 'Trapped Veteran', zh: '受困的老兵' }),
    width: 'auto',
    build: (body) => {
      const refresh = () => refreshWindow('giveSupplies');
      const v = veteranState(state);
      if (!v || v.gone || v.done) {
        body.appendChild(dim(pickLang(v?.gone ? VETERAN.gone : { en: 'Nobody is there.', zh: '那里没有人。' })));
        return;
      }
      const next = VETERAN.stages[v.stage];
      body.appendChild(dim(pickLang({ en: `He has eaten ${Math.floor(v.fed)} Satiety so far${next ? ` (next: ${next.need})` : ''}. Food left: ~${Math.max(0, Math.floor(v.food))} days.`, zh: `他目前吃下了${Math.floor(v.fed)}点饱腹${next ? `（下一阶段：${next.need}）` : ''}。剩余口粮：约${Math.max(0, Math.floor(v.food))}天。` })));
      body.appendChild(h('div', { class: 'col' }, picker(state, ctx, refresh, { foodOnly: true }), pickedList(state, ctx, (inst) => foodSat(inst))));
      const picks = picksArray(state, ctx);
      body.appendChild(
        h(
          'button',
          {
            class: 'primary',
            style: { marginTop: '8px' },
            disabled: picks.length ? null : true,
            onclick: () => {
              const r = giveVeteran(state, picks);
              if (!r.ok) toast(r.reason, 'bad');
              else ctx.picks.clear();
              refresh();
            },
          },
          pickLang({ en: 'Hand it over', zh: '交给他' })
        )
      );
    },
  });
});

// ------------------------------------------------------------------------------ doorstep cat
let catTimer = null;

registerPanel('catEvent', () => {
  const state = game.state;
  if (!state || !catVisible(state)) return;
  openWindow('catEvent', {
    title: `🐈 ${pickLang({ en: 'Cat at the Door', zh: '门口的猫' })}`,
    width: 420,
    onClose: () => {
      clearInterval(catTimer);
      catTimer = null;
    },
    build: (body) => {
      const ev = catEvent(state);
      if (!ev || !catVisible(state)) {
        body.appendChild(dim(pickLang({ en: 'The cat wandered off.', zh: '猫溜走了。' })));
        setTimeout(() => closeWindow('catEvent'), 1200);
        return;
      }
      const def = ev.choices.find((c) => c.id === ev.default);
      body.appendChild(
        h(
          'div',
          { class: 'eventbox' },
          h('div', {}, pickLang(ev.text)),
          h(
            'div',
            { class: 'choices' },
            ...ev.choices.map((ch) =>
              h(
                'button',
                {
                  class: ch.id === ev.default ? 'primary' : '',
                  onclick: () => {
                    const r = resolveCat(state, ch.id);
                    if (!r.ok) return toast(r.reason, 'bad');
                    closeWindow('catEvent');
                  },
                },
                `${pickLang(ch.label)}${ch.food ? pickLang({ en: ` (−${ch.food} food)`, zh: `（−${ch.food}份食物）` }) : ''}`
              )
            )
          ),
          h('div', { class: 'dim', style: { marginTop: '8px' } }, pickLang({ en: `"${pickLang(def.label)}" in ${formatDuration(catTimeLeft(state))}`, zh: `${formatDuration(catTimeLeft(state))}后自动选择"${pickLang(def.label)}"` }))
        )
      );
    },
  });
  clearInterval(catTimer);
  catTimer = setInterval(() => isOpen('catEvent') && refreshWindow('catEvent'), 1000);
});
