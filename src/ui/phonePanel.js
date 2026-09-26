// Cell phone panel (hotkey C): thread list, conversations in daily segments, the homeowners' group
// chat with stance replies and food sharing, ring/vibrate toggle and unread badges.
import { h, openWindow, refreshWindow, isOpen, toast } from './dom.js';
import { registerPanel, openPanel } from './panels.js';
import { registerToolbarButton } from './hud.js';
import { game } from '../game.js';
import { pickLang, tr } from '../engine/i18n.js';
import { on } from '../engine/bus.js';
import { formatClock } from '../sim/time.js';
import { itemName } from '../data/db.js';
import {
  phoneState, threadList, threadName, markRead, unreadCount, threadUnread, toggleVibrate, formatText, dayLabel,
  authorName, groupMessages, groupReply, groupShareFood, groupReplyOf, foodPortionCandidate, GROUP,
} from '../sim/phone.js';
import { GROUP_PROMPT_BY_ID, FOOD_SHARE } from '../content/people.js';
import { replyNeighbor, queueDroneOp, listDrones, shieldState, wmState } from '../sim/social.js';

registerToolbarButton({
  label: () => {
    const n = game.state ? unreadCount(game.state) : 0;
    return `📱 ${tr('ui.phone')}${n ? ` (${n})` : ''}`;
  },
  key: 'C',
  panel: 'phone',
  dot: (s) => unreadCount(s) > 0,
});

let current = null; // open thread id, null = thread list

on('phoneMessage', () => {
  if (isOpen('phone')) refreshWindow('phone');
});

function clockAt(state, t) {
  return formatClock({ ...state.clock, t });
}

function lastPreview(msgs) {
  const m = msgs[msgs.length - 1];
  if (!m) return '';
  const s = formatText(m.text, m.vars);
  return s.length > 42 ? `${s.slice(0, 40)}…` : s;
}

function listView(state, open) {
  const ph = phoneState(state);
  const rows = [];
  const gm = ph.group.messages;
  rows.push(threadRow(pickLang({ en: "Homeowners' Group", zh: '业主群' }), lastPreview(gm), ph.group.unread, () => open(GROUP), '👥'));
  for (const th of threadList(state)) {
    const icon = { neighbor: '🏠', survivor: '👤', unknown: '❔', post: '📡', wm: '📦' }[th.kind] || '💬';
    rows.push(threadRow(threadName(state, th), lastPreview(th.messages), th.unread, () => open(th.id), icon));
  }
  return h('div', { class: 'list' }, ...rows);
}

function threadRow(name, preview, unread, onclick, icon) {
  return h(
    'div',
    { class: 'list-item', style: { cursor: 'pointer' }, onclick },
    h('span', {}, icon),
    h('div', { class: 'col', style: { gap: '2px', flex: '1', minWidth: '0' } }, h('b', {}, name), h('span', { class: 'dim', style: { fontSize: '12px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' } }, preview)),
    unread ? h('span', { class: 'pill', style: { background: '#b5443a' } }, String(unread)) : null
  );
}

function dayDivider(day) {
  return h('div', { class: 'dim', style: { textAlign: 'center', fontSize: '11px', margin: '4px 0' } }, `— ${dayLabel(day)} —`);
}

function bubble(state, m, author) {
  if (m.from === 'system') return h('div', { class: 'dim', style: { textAlign: 'center', fontStyle: 'italic', fontSize: '12px' } }, formatText(m.text, m.vars));
  return h(
    'div',
    { class: `bubble ${m.from === 'me' ? 'me' : ''}` },
    author ? h('div', { class: 'dim', style: { fontSize: '11px' } }, author) : null,
    h('div', {}, formatText(m.text, m.vars)),
    h('div', { class: 'dim', style: { fontSize: '10px', textAlign: 'right' } }, m.day > 0 ? clockAt(state, m.t) : '')
  );
}

function actionRow(...buttons) {
  const list = buttons.filter(Boolean);
  return list.length ? h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '4px', margin: '2px 0 6px' } }, ...list) : null;
}

function report(r) {
  if (r && r.ok === false) toast(r.reason, 'bad');
  refreshWindow('phone');
}

// Buttons under messages that ask for something.
function messageActions(state, threadId, m) {
  if (m.from !== 'them') return null;
  if (threadId === 'neighbor' && m.options && m.answered == null) {
    return actionRow(...m.options.map((o, i) => h('button', { onclick: () => (replyNeighbor(state, m.id, i), refreshWindow('phone')) }, formatText(o.text))));
  }
  if (m.kind === 'help' && threadId.startsWith('sv:')) {
    const sv = state.social.survivors.find((x) => x.id === m.ref);
    if (sv?.alive && sv.status === 'help') return actionRow(h('button', { class: 'primary', onclick: () => openPanel('droneHelp', { survivor: sv.id }) }, pickLang({ en: '🚁 Send food by drone', zh: '🚁 用无人机送吃的' })));
  }
  if (m.kind === 'low' && threadId.startsWith('sv:')) {
    const sv = state.social.survivors.find((x) => x.id === m.ref);
    if (sv?.alive && sv.inNetwork) return actionRow(h('button', { onclick: () => openPanel('droneDeliver', { survivor: sv.id }) }, pickLang({ en: '🚁 Supply drop', zh: '🚁 投送物资' })));
  }
  if (m.kind === 'trade' && m.ref) return actionRow(h('button', { onclick: () => openPanel('droneTrade', { partner: m.ref }) }, pickLang({ en: '🚁 Trade by drone', zh: '🚁 无人机交易' })));
  if (m.kind === 'distress') {
    const a = shieldState(state).active;
    if (a && a.post === m.ref && !a.luring) {
      return actionRow(
        h('button', { class: 'primary', onclick: () => report(queueDroneOp(state, 'lure', { post: a.post })) }, pickLang({ en: '🚁 Send a drone to lure them away (24 h)', zh: '🚁 派无人机引开尸潮（24小时）' }))
      );
    }
  }
  if (m.kind === 'wm' && wmState(state)?.active && !wmState(state).done) return actionRow(h('button', { onclick: () => openPanel('droneRescue') }, pickLang({ en: '🚁 Open the rescue panel', zh: '🚁 打开救助面板' })));
  return null;
}

function groupActions(state, m) {
  if (m.from === 'me' || !m.ref) return null;
  const p = GROUP_PROMPT_BY_ID[m.ref];
  if (!p || groupReplyOf(state, p.id)) return null;
  if (p.type === 'stance') {
    return actionRow(...p.options.map((o, i) => h('button', { onclick: () => report(groupReply(state, p.id, i)) }, `💬 ${formatText(o.text)}${o.need ? ` (−${itemName(o.need[0])})` : ''}`)));
  }
  const c = foodPortionCandidate(state);
  return actionRow(
    h('button', { onclick: () => report(groupShareFood(state, p.id, 'photo')) }, pickLang(FOOD_SHARE.photo.text)),
    h('button', { disabled: c ? null : true, onclick: () => report(groupShareFood(state, p.id, 'deliver')) }, `${pickLang(FOOD_SHARE.deliver.text)}${c ? ` (${itemName(c.inst.id)})` : ''}`)
  );
}

function conversation(state, threadId) {
  const isGroup = threadId === GROUP;
  const msgs = isGroup ? groupMessages(state) : phoneState(state).threads[threadId]?.messages || [];
  const out = [];
  let lastDay = null;
  for (const m of msgs) {
    if (m.day !== lastDay) {
      out.push(dayDivider(m.day));
      lastDay = m.day;
    }
    out.push(bubble(state, m, isGroup && m.from !== 'me' ? authorName(m.author) : null));
    const acts = isGroup ? groupActions(state, m) : messageActions(state, threadId, m);
    if (acts) out.push(acts);
  }
  if (!msgs.length) out.push(h('div', { class: 'dim' }, pickLang({ en: 'No messages yet.', zh: '还没有消息。' })));
  const chat = h('div', { class: 'chat', style: { maxHeight: '420px' } }, ...out);
  setTimeout(() => (chat.scrollTop = chat.scrollHeight), 0);
  return chat;
}

registerPanel('phone', (ctx = {}) => {
  const state = game.state;
  if (!state) return;
  if (ctx.thread) current = ctx.thread;
  openWindow('phone', {
    title: tr('ui.phone'),
    width: 380,
    className: 'phone',
    build: (body) => {
      const ph = phoneState(state);
      const open = (id) => {
        current = id;
        refreshWindow('phone');
      };
      body.appendChild(
        h(
          'div',
          { class: 'row', style: { alignItems: 'center', marginBottom: '6px' } },
          current ? h('button', { onclick: () => open(null) }, '←') : null,
          h('b', {}, current ? (current === GROUP ? pickLang({ en: "Homeowners' Group", zh: '业主群' }) : threadName(state, ph.threads[current])) : pickLang({ en: 'Messages', zh: '短信' })),
          h('span', { class: 'spacer' }),
          h(
            'button',
            { dataset: { tip: pickLang({ en: 'Ring / vibrate', zh: '响铃 / 振动' }) }, onclick: () => (toggleVibrate(state), refreshWindow('phone')) },
            ph.vibrate ? pickLang({ en: '📳 Vibrate', zh: '📳 振动' }) : pickLang({ en: '🔔 Ring', zh: '🔔 响铃' })
          )
        )
      );
      if (current && current !== GROUP && !ph.threads[current]) current = null;
      if (!current) {
        body.appendChild(listView(state, open));
        return;
      }
      if (threadUnread(state, current)) markRead(state, current);
      body.appendChild(conversation(state, current));
      if (current === 'neighbor' && state.social.neighbor?.basketRepaired) {
        body.appendChild(h('div', { class: 'dim', style: { marginTop: '6px', fontSize: '12px' } }, pickLang({ en: 'Send things over with the basket on the terrace.', zh: '东西可以用露台上的吊篮送过去。' })));
      }
      if (current.startsWith('sv:') && !listDrones(state).length) {
        body.appendChild(h('div', { class: 'dim', style: { marginTop: '6px', fontSize: '12px' } }, pickLang({ en: 'You need a drone to reach them.', zh: '需要无人机才能联系到他们。' })));
      }
    },
  });
});
