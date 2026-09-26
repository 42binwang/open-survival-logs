// Cell phone (FEATURES O02): SMS threads shown in daily segments (patch 09-12), unknown numbers,
// the homeowners' group chat with its 15 dated prompts (stances and food-sharing tasks, patch 08-28),
// ring/vibrate (patch 08-15) and unread badges. State lives in state.social.phone.
import { registerSystem } from './tick.js';
import { registerObjectives } from './objectives.js';
import { homeSources } from './furnActions.js';
import { addStat } from './stats.js';
import { removeUid } from './inventory.js';
import { isExpired } from './spoilage.js';
import { dayNumber, DAY, HOUR } from './time.js';
import { item, itemName, CAT } from '../data/db.js';
import { emit } from '../engine/bus.js';
import { pick, rand } from '../engine/rng.js';
import { pickLang, tr } from '../engine/i18n.js';
import { GROUP_PROMPTS, GROUP_PROMPT_BY_ID, GROUP_MEMBERS, GROUP_CHATTER, GROUP_HISTORY, GROUP_OPENING, FOOD_SHARE } from '../content/people.js';

export const GROUP = 'group';
const MAX_GROUP_MESSAGES = 400;
const MAX_THREAD_MESSAGES = 200;

export function phoneState(state) {
  state.social ||= {};
  const ph = (state.social.phone ||= {});
  if (ph.v === 1) return ph;
  ph.threads ||= {};
  ph.unread ??= 0;
  ph.vibrate ??= false;
  ph.group ||= {};
  ph.group.messages ||= [];
  ph.group.replies ||= {};
  ph.group.posted ||= {};
  ph.group.unread ??= 0;
  ph.group.history ??= 0;
  ph.group.opening ??= 0;
  ph.pending ||= [];
  ph.nextId ??= 1;
  ph.v = 1;
  return ph;
}

// Day a message belongs to: 0 = before the disaster, otherwise the post-disaster day number.
export function currentDay(state) {
  return state.phase === 'pre' ? 0 : dayNumber(state.clock);
}

export function dayLabel(day) {
  return day <= 0 ? pickLang({ en: 'Before the disaster', zh: '灾变前' }) : tr('time.day', { n: day });
}

// ------------------------------------------------------------------------------ text
function varText(v) {
  if (v == null) return null;
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (v.item != null) return itemName(v.item);
  if (v.items) return v.items.map(([id, n]) => (n > 1 ? `${itemName(id)} ×${n}` : itemName(id))).join(pickLang({ en: ', ', zh: '、' }));
  return pickLang(v);
}

// Messages store bilingual text plus vars so switching language re-renders everything.
export function formatText(text, vars) {
  const s = pickLang(text);
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => varText(vars[k]) ?? m);
}

export function authorName(author) {
  if (author === 12) return pickLang({ en: 'No. 12 (me)', zh: '12号（我）' });
  return pickLang(GROUP_MEMBERS[author] || { en: '?', zh: '?' });
}

export function threadName(state, th) {
  if (!th) return '';
  if (th.id === GROUP) return pickLang({ en: "Homeowners' Group", zh: '业主群' });
  return pickLang(th.name || th.id);
}

// ------------------------------------------------------------------------------ threads
export function ensureThread(state, id, { name, kind = 'contact' } = {}) {
  const ph = phoneState(state);
  let th = ph.threads[id];
  if (!th) {
    th = { id, name: name || id, kind, messages: [], unread: 0, last: 0 };
    ph.threads[id] = th;
  } else if (name) {
    th.name = name;
  }
  return th;
}

export function getThread(state, id) {
  return phoneState(state).threads[id] || null;
}

function recount(ph) {
  let n = ph.group.unread;
  for (const th of Object.values(ph.threads)) n += th.unread;
  ph.unread = n;
}

function notify(state, title, text, vars, kind, threadId) {
  const ph = phoneState(state);
  const sound = ph.vibrate ? 'vibrate' : 'ring';
  emit('phoneMessage', { thread: threadId, kind, sound, vibrate: ph.vibrate });
  const preview = formatText(text, vars);
  emit('toast', { text: `📱 ${title}: ${preview.length > 60 ? `${preview.slice(0, 58)}…` : preview}` });
}

// msg: { text, vars, from ('them' | 'me' | 'system'), kind, ref, options, t, day, read, silent }
export function sendSms(state, threadId, msg) {
  const ph = phoneState(state);
  const th = ph.threads[threadId] || ensureThread(state, threadId);
  const m = {
    id: ph.nextId++,
    t: msg.t ?? state.clock.t,
    day: msg.day ?? currentDay(state),
    from: msg.from || 'them',
    text: msg.text,
  };
  for (const k of ['vars', 'kind', 'ref', 'options']) if (msg[k] != null) m[k] = msg[k];
  th.messages.push(m);
  if (th.messages.length > MAX_THREAD_MESSAGES) th.messages.splice(0, th.messages.length - MAX_THREAD_MESSAGES);
  th.last = Math.max(th.last, m.t);
  if (m.from !== 'me' && !msg.read) {
    th.unread++;
    recount(ph);
    if (!msg.silent) notify(state, threadName(state, th), m.text, m.vars, m.kind, threadId);
  }
  return m;
}

export function postGroup(state, msg) {
  const ph = phoneState(state);
  const m = {
    id: ph.nextId++,
    t: msg.t ?? state.clock.t,
    day: msg.day ?? currentDay(state),
    from: msg.from || 'them',
    author: msg.from === 'me' ? 12 : msg.author,
    text: msg.text,
  };
  for (const k of ['vars', 'kind', 'ref']) if (msg[k] != null) m[k] = msg[k];
  ph.group.messages.push(m);
  if (ph.group.messages.length > MAX_GROUP_MESSAGES) ph.group.messages.splice(0, ph.group.messages.length - MAX_GROUP_MESSAGES);
  if (m.from !== 'me' && !msg.read) {
    ph.group.unread++;
    recount(ph);
    if (!msg.silent) notify(state, pickLang({ en: 'Group', zh: '业主群' }), m.text, m.vars, m.kind, GROUP);
  }
  return m;
}

// Delayed replies: delivered by the phone system tick. threadId GROUP posts to the group chat.
export function scheduleSms(state, delaySec, threadId, msg) {
  const ph = phoneState(state);
  const entry = { at: state.clock.t + delaySec, thread: threadId, msg };
  const i = ph.pending.findIndex((p) => p.at > entry.at);
  if (i < 0) ph.pending.push(entry);
  else ph.pending.splice(i, 0, entry);
}

function deliverPending(state) {
  const ph = phoneState(state);
  while (ph.pending.length && ph.pending[0].at <= state.clock.t) {
    const { thread, msg } = ph.pending.shift();
    if (thread === GROUP) postGroup(state, msg);
    else sendSms(state, thread, msg);
  }
}

export function markRead(state, threadId) {
  const ph = phoneState(state);
  if (threadId === GROUP) ph.group.unread = 0;
  else if (ph.threads[threadId]) ph.threads[threadId].unread = 0;
  recount(ph);
}

export function unreadCount(state) {
  return state.social?.phone?.unread || 0;
}

export function threadUnread(state, threadId) {
  const ph = phoneState(state);
  return threadId === GROUP ? ph.group.unread : ph.threads[threadId]?.unread || 0;
}

// Group first, then threads with the newest message on top.
export function threadList(state) {
  const ph = phoneState(state);
  return Object.values(ph.threads)
    .filter((th) => th.messages.length)
    .sort((a, b) => b.last - a.last);
}

export function toggleVibrate(state) {
  const ph = phoneState(state);
  ph.vibrate = !ph.vibrate;
  return ph.vibrate;
}

// ------------------------------------------------------------------------------ group chat
function absT(state, daysAgo, hour) {
  return -daysAgo * DAY + (hour - state.clock.startHour) * HOUR;
}

// Pre-disaster history and first-night opening messages, posted as their time arrives.
function postHistory(state, { read = false } = {}) {
  const ph = phoneState(state);
  while (ph.group.history < GROUP_HISTORY.length) {
    const h = GROUP_HISTORY[ph.group.history];
    const t = absT(state, h.daysAgo, h.hour);
    if (t > state.clock.t) break;
    ph.group.history++;
    postGroup(state, { author: h.author, text: h.text, t, day: 0, read: read || t <= 0, silent: true });
  }
}

function postOpening(state) {
  const ph = phoneState(state);
  while (ph.group.opening < GROUP_OPENING.length) {
    const o = GROUP_OPENING[ph.group.opening];
    const t = state.clock.outbreakAt + (o.hour - 18) * HOUR;
    if (t > state.clock.t) break;
    ph.group.opening++;
    postGroup(state, { author: o.author, text: o.text, t, day: 1 });
  }
}

function promptT(state, p) {
  return (p.day - 1) * DAY + (p.hour - state.clock.startHour) * HOUR;
}

export function postDuePrompts(state) {
  if (state.phase === 'pre' || state.meta?.mode === 'pureEndless') return;
  const ph = phoneState(state);
  for (const p of GROUP_PROMPTS) {
    if (ph.group.posted[p.id] || promptT(state, p) > state.clock.t) continue;
    const m = postGroup(state, { author: p.author, text: p.text, kind: p.type === 'food' ? 'food' : 'prompt', ref: p.id, day: p.day });
    ph.group.posted[p.id] = m.id;
  }
}

function postChatter(state, day) {
  if (GROUP_PROMPTS.some((p) => p.day === day)) return;
  const odds = day < 30 ? 0.7 : day < 60 ? 0.45 : 0.25;
  if (rand(state) >= odds) return;
  const ph = phoneState(state);
  const lastAuthor = ph.group.messages[ph.group.messages.length - 1]?.author;
  const pool = GROUP_CHATTER.filter((c) => c.author !== lastAuthor && (c.author !== 18 || day < 70));
  const line = pick(state, pool);
  if (line) postGroup(state, { author: line.author, text: line.text, silent: true });
}

export function groupMessages(state) {
  return phoneState(state).group.messages;
}

export function isPromptPosted(state, promptId) {
  return !!phoneState(state).group.posted[promptId];
}

export function groupReplyOf(state, promptId) {
  return phoneState(state).group.replies[promptId] || null;
}

// Prompts on screen that still wait for the survivor's stance or food share.
export function pendingGroupPrompts(state) {
  const ph = phoneState(state);
  return GROUP_PROMPTS.filter((p) => ph.group.posted[p.id] && !ph.group.replies[p.id]);
}

function countReply(state) {
  const c = state.progress.counters;
  c['group.reply'] = (c['group.reply'] || 0) + 1;
}

function fail(reason) {
  return { ok: false, reason: pickLang(reason) };
}

// Use one portion of an item: multi-serving items lose a serving, everything else is removed.
export function usePortion(state, inv, inst) {
  const cfg = item(inst.id);
  if (cfg?.uses > 1) {
    inst.uses = (inst.uses ?? cfg.uses) - 1;
    if (inst.uses <= 0) removeUid(inv, inst.uid);
  } else {
    removeUid(inv, inst.uid);
  }
}

// First instance of any listed item id in the given inventories.
export function findAny(state, ids, sources = homeSources(state)) {
  for (const invId of sources) {
    const inv = state.inventories[invId];
    const inst = inv?.items.find((it) => ids.includes(it.id));
    if (inst) return { inv, inst };
  }
  return null;
}

// The cheapest edible, unspoiled portion at home: what "deliver a portion" hands over.
export function foodPortionCandidate(state) {
  let best = null;
  for (const invId of homeSources(state)) {
    const inv = state.inventories[invId];
    if (!inv) continue;
    for (const inst of inv.items) {
      const cfg = item(inst.id);
      if (!cfg || cfg.cat !== CAT.FOOD || cfg.noUse || cfg.sat < 5 || isExpired(inst, cfg)) continue;
      const score = cfg.trade / Math.max(1, cfg.uses > 1 ? cfg.uses : 1);
      if (!best || score < best.score) best = { inv, inst, score };
    }
  }
  return best;
}

export function groupReply(state, promptId, optionIndex = 0) {
  const ph = phoneState(state);
  const p = GROUP_PROMPT_BY_ID[promptId];
  if (!p || p.type !== 'stance') return fail({ en: 'Nothing to reply to.', zh: '没有可回复的消息。' });
  if (!ph.group.posted[promptId]) return fail({ en: 'That message has not arrived yet.', zh: '这条消息还没出现。' });
  if (ph.group.replies[promptId]) return fail({ en: 'You already replied.', zh: '你已经回复过了。' });
  const o = p.options[optionIndex];
  if (!o) return fail({ en: 'Nothing to reply to.', zh: '没有可回复的消息。' });
  if (o.need) {
    const found = findAny(state, o.need);
    if (!found) return fail({ en: `You need ${itemName(o.need[0])} for that.`, zh: `需要${itemName(o.need[0])}。` });
    usePortion(state, found.inv, found.inst);
  }
  ph.group.replies[promptId] = { option: optionIndex, t: state.clock.t };
  postGroup(state, { from: 'me', text: o.text });
  countReply(state);
  addStat(state, 'mor', o.need ? 6 : 2, 'group');
  if (p.follow) scheduleSms(state, 20 * 60, GROUP, { author: p.follow.author, text: p.follow.text, silent: true });
  return { ok: true };
}

// Food-sharing task: 'photo' (+morale) or 'deliver' (costs a portion, improves neighbor relations).
export function groupShareFood(state, promptId, choice) {
  const ph = phoneState(state);
  const p = GROUP_PROMPT_BY_ID[promptId];
  const share = FOOD_SHARE[choice];
  if (!p || p.type !== 'food' || !share) return fail({ en: 'Nothing to share here.', zh: '这里没什么可分享的。' });
  if (!ph.group.posted[promptId]) return fail({ en: 'That message has not arrived yet.', zh: '这条消息还没出现。' });
  if (ph.group.replies[promptId]) return fail({ en: 'You already replied.', zh: '你已经回复过了。' });
  let vars = null;
  if (choice === 'deliver') {
    const c = foodPortionCandidate(state);
    if (!c) return fail({ en: 'No food at home to share.', zh: '家里没有能分出去的吃的。' });
    vars = { item: { item: c.inst.id } };
    usePortion(state, c.inv, c.inst);
    const counters = state.progress.counters;
    counters['survivor.aid'] = (counters['survivor.aid'] || 0) + 1;
    emit('groupFoodShared', { state, promptId, item: vars.item.item, affinity: share.affinity });
  }
  ph.group.replies[promptId] = { choice, t: state.clock.t };
  postGroup(state, { from: 'me', text: share.sent, vars });
  countReply(state);
  addStat(state, 'mor', share.mor, 'group');
  if (p.follow) scheduleSms(state, 30 * 60, GROUP, { author: p.follow.author, text: p.follow.text, silent: true });
  return { ok: true, item: vars?.item.item ?? null };
}

// ------------------------------------------------------------------------------ system
registerSystem({
  id: 'phone',
  order: 62,
  init(state) {
    phoneState(state);
    postHistory(state, { read: true });
  },
  ensure(state) {
    phoneState(state);
  },
  tick(state) {
    const ph = state.social?.phone;
    if (ph?.pending.length && ph.pending[0].at <= state.clock.t) deliverPending(state);
  },
  onHour(state, h) {
    phoneState(state);
    postHistory(state, { read: state.phase !== 'pre' });
    if (state.phase !== 'post') return;
    postOpening(state);
    postDuePrompts(state);
    const day = dayNumber(state.clock);
    if (h === 8 && day > 1) postChatter(state, day);
  },
});

registerObjectives((state) => {
  const ph = state.social?.phone;
  if (!ph || state.phase === 'pre') return [];
  const out = [];
  const waiting = pendingGroupPrompts(state).length;
  if (ph.unread > 0 || waiting) {
    const parts = [];
    if (ph.unread > 0) parts.push(pickLang({ en: `${ph.unread} unread`, zh: `${ph.unread}条未读` }));
    if (waiting) parts.push(pickLang({ en: 'the group chat is waiting for you', zh: '业主群在等你回复' }));
    out.push({ id: 'phone', text: `📱 ${pickLang({ en: 'Phone', zh: '手机' })} (C)`, prog: parts.join(' · '), onClick: () => emit('openPanel', { panel: 'phone' }) });
  }
  return out;
});
