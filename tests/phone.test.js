import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { tick, outbreak } from '../src/sim/tick.js';
import { dayStartT, dayNumber } from '../src/sim/time.js';
import { addItem, count } from '../src/sim/inventory.js';
import { item } from '../src/data/db.js';
import { on } from '../src/engine/bus.js';
import {
  phoneState, sendSms, ensureThread, getThread, markRead, unreadCount, toggleVibrate, groupMessages, isPromptPosted,
  groupReply, groupShareFood, pendingGroupPrompts, foodPortionCandidate, formatText, GROUP,
} from '../src/sim/phone.js';
import { social, neighborState, repairBasket } from '../src/sim/social.js';
import { GROUP_PROMPTS } from '../src/content/people.js';

function postGame(character = 'wage', seed = 61) {
  const s = newGame({ seed, character });
  s.phase = 'post';
  s.clock.t = s.clock.outbreakAt; // 18:00, Day 1
  s.run.day = 1;
  return s;
}

function advance(s, hours) {
  for (let i = 0; i < hours; i++) {
    Object.assign(s.player.stats, { sat: 100, sta: 100, mor: 100, life: 100 });
    tick(s, 3600);
  }
}

// Jump to a given day and hour (one tick so the systems catch up).
function jumpTo(s, day, hour) {
  s.clock.t = dayStartT(s.clock, day) + hour * 3600 - 1800;
  s.run.day = dayNumber(s.clock);
  advance(s, 1);
}

test('the homeowners\' group chat posts its 15 prompts on their days', () => {
  assert.deepEqual(
    GROUP_PROMPTS.map((p) => p.day),
    [2, 7, 12, 17, 20, 22, 26, 32, 45, 51, 64, 67, 78, 83, 96]
  );
  assert.equal(GROUP_PROMPTS.filter((p) => p.type === 'stance').length, 7);
  assert.equal(GROUP_PROMPTS.filter((p) => p.type === 'food').length, 8);

  const s = postGame('wage', 61);
  const history = groupMessages(s).filter((m) => m.day === 0).length;
  assert.ok(history > 0, 'messages from before the disaster');
  advance(s, 3);
  assert.ok(groupMessages(s).filter((m) => m.day === 1).length >= 3, 'first-night opening messages');
  assert.equal(isPromptPosted(s, 'd2'), false);

  advance(s, 13); // 09:00 on Day 2
  assert.equal(isPromptPosted(s, 'd2'), true);
  assert.equal(isPromptPosted(s, 'd7'), false);
  const d2 = groupMessages(s).find((m) => m.ref === 'd2');
  assert.equal(d2.day, 2);
  assert.equal(d2.kind, 'prompt');
  assert.match(formatText(d2.text), /Roll call/);

  jumpTo(s, 7, 11);
  assert.equal(isPromptPosted(s, 'd7'), true);
  assert.equal(isPromptPosted(s, 'd12'), false);
  assert.deepEqual(pendingGroupPrompts(s).map((p) => p.id), ['d2', 'd7']);
});

test('taking a stance in the group chat counts group.reply once per prompt; some stances cost medicine', () => {
  const s = postGame('wage', 62);
  assert.equal(groupReply(s, 'd2', 0).ok, false, 'not posted yet');
  jumpTo(s, 2, 10);
  s.player.stats.mor = 50;
  assert.ok(groupReply(s, 'd2', 0).ok);
  assert.equal(s.progress.counters['group.reply'], 1);
  assert.ok(s.player.stats.mor > 50);
  assert.equal(groupReply(s, 'd2', 1).ok, false, 'one reply per prompt');
  assert.equal(s.progress.counters['group.reply'], 1);
  assert.ok(groupMessages(s).some((m) => m.from === 'me' && m.author === 12));
  advance(s, 1);
  assert.ok(groupMessages(s).some((m) => m.ref == null && m.author === 1 && m.day === 2), 'the old electrician answers');

  jumpTo(s, 51, 12);
  assert.equal(isPromptPosted(s, 'd51'), true);
  assert.equal(groupReply(s, 'd51', 0).ok, false, '"I have some" needs fever medicine');
  const bp = s.inventories[s.player.backpack];
  const med = addItem(s, bp, 2406);
  assert.ok(groupReply(s, 'd51', 0).ok);
  assert.equal(med.uses, item(2406).uses - 1, 'one dose left at their door');
  assert.equal(s.progress.counters['group.reply'], 2);
  assert.equal(groupShareFood(s, 'd7', 'photo').ok, false, 'stance prompts are not food tasks');
});

test('food-sharing tasks: share a photo for morale, or deliver a portion of food to improve neighbor relations', () => {
  const s = postGame('wage', 63);
  advance(s, 1);
  repairBasket(s);
  jumpTo(s, 12, 12);
  assert.equal(isPromptPosted(s, 'd12'), true);
  assert.equal(groupReply(s, 'd12', 0).ok, false, 'food tasks are not stances');

  s.player.stats.mor = 40;
  assert.ok(groupShareFood(s, 'd12', 'photo').ok);
  assert.equal(s.player.stats.mor, 45);
  assert.equal(s.progress.counters['group.reply'], 1);
  assert.equal(groupShareFood(s, 'd12', 'deliver').ok, false, 'already answered');

  jumpTo(s, 17, 10);
  const bp = s.inventories[s.player.backpack];
  for (const invId of Object.keys(s.inventories)) if (invId !== bp.id) s.inventories[invId].items.length = 0;
  assert.equal(foodPortionCandidate(s), null);
  assert.equal(groupShareFood(s, 'd17', 'deliver').ok, false, 'no food to share');
  addItem(s, bp, 2105);
  addItem(s, bp, 2161);
  const affinity = neighborState(s).affinity;
  const r = groupShareFood(s, 'd17', 'deliver');
  assert.ok(r.ok);
  assert.equal(r.item, 2105, 'the cheapest portion goes');
  assert.equal(count(bp, 2105), 0);
  assert.equal(count(bp, 2161), 1);
  assert.ok(neighborState(s).affinity > affinity, 'delivering food improves relations with the neighbor');
  assert.equal(s.progress.counters['group.reply'], 2);
  assert.ok(groupMessages(s).some((m) => m.from === 'me' && /portion/.test(formatText(m.text, m.vars))));
});

test('ring/vibrate toggle, unread badges and read state', () => {
  const s = postGame('wage', 64);
  const heard = [];
  const off = on('phoneMessage', (p) => heard.push(p));
  ensureThread(s, 'test', { name: { en: 'Tester', zh: '测试' } });
  const before = unreadCount(s);
  sendSms(s, 'test', { text: { en: 'Hello', zh: '你好' } });
  assert.equal(heard.at(-1).sound, 'ring');
  assert.equal(toggleVibrate(s), true);
  assert.equal(phoneState(s).vibrate, true);
  sendSms(s, 'test', { text: { en: 'Again', zh: '又来' } });
  assert.equal(heard.at(-1).sound, 'vibrate');
  assert.equal(heard.at(-1).vibrate, true);
  assert.equal(toggleVibrate(s), false);
  off();
  assert.equal(unreadCount(s), before + 2);
  assert.equal(getThread(s, 'test').unread, 2);
  sendSms(s, 'test', { from: 'me', text: { en: 'Hi', zh: '嗨' } });
  assert.equal(getThread(s, 'test').unread, 2, 'my own messages are never unread');
  markRead(s, 'test');
  assert.equal(unreadCount(s), before);
  advance(s, 2);
  assert.ok(phoneState(s).group.unread > 0);
  markRead(s, GROUP);
  assert.equal(phoneState(s).group.unread, 0);
});

test('SMS threads: pre-disaster chat records for people met in shops, first texts on later days, the neighbor writes', () => {
  const s = newGame({ seed: 65, character: 'wage' });
  s.pre.metNpcs = ['neighbor', 'hardwareOwner', { id: 'unlistedShopNpc', name: { en: 'Mr. Unlisted', zh: '无名先生' } }];
  s.clock.t = s.clock.outbreakAt;
  outbreak(s);
  const met = social(s).survivors.filter((x) => !x.unknown);
  assert.deepEqual(
    met.map((x) => x.id),
    ['hardwareOwner', 'youngCustomer'],
    'the neighbor is not a trade contact; unknown shop NPCs take the next free roster entry'
  );
  assert.deepEqual(met[1].name, { en: 'Mr. Unlisted', zh: '无名先生' });
  assert.ok(social(s).survivors.some((x) => x.unknown), 'unknown numbers exist too');
  const th = getThread(s, 'sv:hardwareOwner');
  assert.ok(th.messages.length >= 2);
  assert.ok(th.messages.every((m) => m.day === 0), 'chat records from before the disaster');
  assert.equal(th.unread, 0);

  for (let i = 0; i < 24 * 8; i++) {
    Object.assign(s.player.stats, { sat: 100, sta: 100, mor: 100, life: 100 });
    tick(s, 3600);
  }
  const days = new Set(th.messages.map((m) => m.day));
  assert.ok(days.size >= 2, 'conversations continue in later daily segments');
  const hello = th.messages.find((m) => m.kind === 'trade');
  assert.ok(hello && hello.day >= 2, 'the hardware store owner texts after the outbreak to trade');
  const neighbor = getThread(s, 'neighbor');
  assert.ok(neighbor.messages.some((m) => m.kind === 'intro' && m.options?.length), 'the girl next door texts on the first night');
  assert.ok(neighbor.messages.some((m) => m.kind === 'help'), 'and asks for help across the rooftops');
});
