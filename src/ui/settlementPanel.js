// Daily settlement popup (yesterday in review, Planning Points credited, choose one of three plans) and the
// Planning Points widgets shared by the results page and the Survival Log: '?' help icons next to every
// balance and ledger row (patch 09-12) and the settlement ledger.
import { h, openWindow, closeWindow, isOpen, refreshWindow, toast } from './dom.js';
import { registerPanel, openPanel } from './panels.js';
import { game } from '../game.js';
import { on } from '../engine/bus.js';
import { pickLang, tr } from '../engine/i18n.js';
import { CARD_BY_ID } from '../content/planningCards.js';
import { LEDGER_KINDS, LEDGER_ORDER, COUNTER_LABELS, PATH_NAMES, SUMMARY_KEYS, INTEREST, ledgerTotals, interestFor, cardCost, buyCard, closeSettlement } from '../sim/settlement.js';

export const POINTS_HELP = {
  en: '<b>Planning Points</b><br>Earned: +8 for every new day you live to see (+1 more per 10 days survived), +5 for each record-breaking day, event rewards, points left by the departed, and 5% interest on a saved balance of 200+ (up to 25 a day). The difficulty scales daily points.<br>Spent on: abilities in the Survival Log (kept in every loop), plans at the daily settlement and "I want to persist!" rewinds.<br>Unspent points carry over into the next loop.',
  zh: '<b>生存点</b><br>获得：每迎来新的一天+8（每生存10天再+1），每个破纪录的天数+5，事件奖励，逝者遗留，以及余额达到200时每日5%的利息（每天最多25）。每日所得受难度倍率影响。<br>用途：在生存日志中学习能力（每轮都保留）、每日结算的规划，以及“我还想坚持！”的回溯。<br>没花完的生存点会带入下一轮。',
};

const REASONS = {
  points: { en: 'Not enough Planning Points.', zh: '生存点不足。' },
  closed: { en: 'You already chose a plan today.', zh: '今天已经选过规划了。' },
  owned: { en: 'You already have this plan.', zh: '已经拥有该规划。' },
  notOffered: { en: 'That plan is not on offer.', zh: '该规划不在本次选项中。' },
};

export function reasonLabel(reason) {
  return pickLang(REASONS[reason] || { en: String(reason), zh: String(reason) });
}

export function helpIcon(tip) {
  return h('span', { class: 'pill', style: { cursor: 'help', marginLeft: '4px' }, dataset: { tip } }, '?');
}

export function pointsBadge(balance) {
  return h('span', {}, `${tr('stat.points')}: `, h('b', { class: 'warn' }, String(Math.floor(balance))), helpIcon(pickLang(POINTS_HELP)));
}

export function signed(n) {
  const v = Math.round(n);
  return v > 0 ? `+${v}` : String(v);
}

// World time stays frozen while any hold (or the pause menu) is active and resumes once the last one is
// released (patch 09-17: the world must not stay paused after confirming the settlement).
const holds = new Set();

export function holdPause(state, key) {
  holds.add(key);
  state.ui.modalPause = true;
}

export function releasePause(state, key) {
  holds.delete(key);
  state.ui.modalPause = holds.size > 0 || isOpen('pause');
}

function ledgerLabel(kind) {
  const def = LEDGER_KINDS[kind];
  return h('span', {}, def ? pickLang(def.name) : kind, def ? helpIcon(pickLang(def.help)) : null);
}

// This round's Planning Points by source; the total is the current balance.
export function ledgerTable(state) {
  const totals = ledgerTotals(state);
  const kinds = [...LEDGER_ORDER, ...Object.keys(totals).filter((k) => !LEDGER_KINDS[k])].filter((k) => Math.round(totals[k] || 0) !== 0);
  const line = { borderTop: '1px solid var(--line)', paddingTop: '4px' };
  return h(
    'div',
    { class: 'kv' },
    ...kinds.flatMap((k) => [ledgerLabel(k), h('b', { class: totals[k] > 0 ? 'good' : 'bad', style: { textAlign: 'right' } }, signed(totals[k]))]),
    kinds.length ? null : h('span', { class: 'dim' }, pickLang({ en: 'Nothing earned or spent yet.', zh: '尚无收支。' })),
    kinds.length ? null : h('span', {}),
    h('span', { style: line }, pickLang({ en: 'Balance', zh: '当前余额' }), helpIcon(pickLang(POINTS_HELP))),
    h('b', { class: 'warn', style: { ...line, textAlign: 'right' } }, String(Math.floor(state.loop.planningPoints)))
  );
}

function summaryGrid(summary) {
  const always = new Set([summary['food.sat'] > 0 ? 'food.sat' : 'food.eaten', 'zombie.kill', 'trade.active.dealcount', 'plant.harvest']);
  const keys = SUMMARY_KEYS.filter((k) => always.has(k) || summary[k] > 0);
  return h(
    'div',
    { class: 'kv' },
    ...keys.flatMap((k) => [h('span', { class: summary[k] ? '' : 'dim' }, pickLang(COUNTER_LABELS[k] || { en: k, zh: k })), h('b', { class: summary[k] ? '' : 'dim', style: { textAlign: 'right' } }, String(summary[k] || 0))])
  );
}

function planCard(state, id, offers) {
  const card = CARD_BY_ID[id];
  const cost = cardCost(state, card);
  const picked = offers.picked === id;
  const canBuy = !offers.picked && !offers.closed && state.loop.planningPoints >= cost;
  const tag = pickLang(PATH_NAMES[card.path] || { en: card.path, zh: card.path }) + (card.once ? pickLang({ en: ' · instant', zh: ' · 即时' }) : '');
  return h(
    'div',
    { class: 'card', style: picked ? { borderColor: 'var(--accent)' } : offers.picked ? { opacity: 0.5 } : null },
    h('span', { class: 'pill', style: { alignSelf: 'flex-start' } }, tag),
    h('h5', {}, pickLang(card.name)),
    h('div', { class: 'dim', style: { flex: 1, lineHeight: 1.4 } }, pickLang(card.desc)),
    h('div', {}, cost < card.cost ? h('s', { class: 'dim' }, String(card.cost)) : null, cost < card.cost ? ' ' : null, h('b', { class: 'warn' }, String(cost)), ` ${tr('stat.points')}`),
    h(
      'button',
      {
        class: canBuy ? 'primary' : '',
        disabled: canBuy ? null : true,
        onclick: () => {
          const r = buyCard(state, id);
          if (r.ok) toast(pickLang({ en: `Plan learned: ${card.name.en}`, zh: `已学习规划：${card.name.zh}` }), 'good');
          else toast(reasonLabel(r.reason), 'bad');
          refreshWindow('dailySettlement');
        },
      },
      picked ? pickLang({ en: '✓ Learned', zh: '✓ 已学习' }) : pickLang({ en: 'Learn this plan', zh: '学习该规划' })
    )
  );
}

function buildSettlement(body, state, st) {
  const offers = state.run.offers;
  const credited = st.rows.reduce((a, r) => a + r.amount, 0);
  const nextInterest = interestFor(state.loop.planningPoints);
  body.appendChild(
    h(
      'div',
      { class: 'row', style: { alignItems: 'stretch' } },
      h('div', { class: 'col', style: { flex: 1 } }, h('div', { class: 'sec-title' }, pickLang({ en: `Day ${st.day - 1} in review`, zh: `第${st.day - 1}天回顾` })), summaryGrid(st.summary || {})),
      h(
        'div',
        { class: 'col', style: { flex: 1 } },
        h('div', { class: 'sec-title' }, pickLang({ en: 'Planning Points credited', zh: '生存点入账' })),
        h(
          'div',
          { class: 'kv' },
          ...st.rows.flatMap((r) => [ledgerLabel(r.kind), h('b', { class: 'good', style: { textAlign: 'right' } }, signed(r.amount))]),
          h('span', { style: { borderTop: '1px solid var(--line)', paddingTop: '4px' } }, pickLang({ en: 'Today', zh: '今日合计' })),
          h('b', { class: 'good', style: { borderTop: '1px solid var(--line)', paddingTop: '4px', textAlign: 'right' } }, signed(credited))
        ),
        st.record ? h('div', { class: 'warn' }, pickLang({ en: '★ A new record: further than any loop before.', zh: '★ 新纪录：比以往任何一轮走得更远。' })) : null,
        h('div', {}, pointsBadge(state.loop.planningPoints)),
        h(
          'div',
          { class: 'dim', style: { fontSize: '11px' } },
          nextInterest
            ? pickLang({ en: `Saving pays: +${nextInterest} interest at the next settlement if you keep this balance.`, zh: `保持当前余额，下次结算可得利息+${nextInterest}。` })
            : pickLang({ en: `Keep ${INTEREST.minBalance}+ saved to earn 5% interest per day.`, zh: `余额保持${INTEREST.minBalance}以上，每天可得5%利息。` })
        )
      )
    )
  );
  body.appendChild(h('div', { class: 'sec-title', style: { marginTop: '10px' } }, pickLang({ en: 'Choose one plan', zh: '三选一规划' })));
  body.appendChild(
    offers?.ids.length
      ? h('div', { class: 'cards' }, ...offers.ids.map((id) => planCard(state, id, offers)))
      : h('div', { class: 'dim' }, pickLang({ en: 'No plans on offer today.', zh: '今天没有可选的规划。' }))
  );
  body.appendChild(
    h(
      'div',
      { class: 'row', style: { justifyContent: 'flex-end', marginTop: '10px' } },
      h('button', { class: 'primary', onclick: () => closeWindow('dailySettlement') }, offers?.picked ? tr('menu.confirm') : pickLang({ en: 'Skip the plans', zh: '暂不规划' }))
    )
  );
}

registerPanel('dailySettlement', () => {
  const state = game.state;
  const st = state?.run.settlement;
  if (!st) return;
  if (isOpen('dailySettlement')) return refreshWindow('dailySettlement');
  openWindow('dailySettlement', {
    title: pickLang({ en: `Daily Settlement · Day ${st.day}`, zh: `每日结算 · 第${st.day}天` }),
    width: 700,
    modal: true,
    onClose: () => {
      closeSettlement(state);
      releasePause(state, 'dailySettlement');
    },
    build: (body) => buildSettlement(body, state, st),
  });
  holdPause(state, 'dailySettlement');
});

function openIfPending() {
  const s = game.state;
  if (s?.phase === 'post' && s.run.settlement?.pending && !isOpen('dailySettlement')) openPanel('dailySettlement');
}

on('dailySettlement', () => setTimeout(openIfPending, 0));
on('enterGame', () => setTimeout(openIfPending, 0));
