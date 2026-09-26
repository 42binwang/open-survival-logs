// Results page after death and the respawn choices: Rebirth into the next loop, "I want to persist!" (go back a
// few days for Planning Points), "Tear Up This Round and Rewrite" and the main menu. Time is frozen on these pages
// and every choice asks for a second confirmation (patches 07-11, 07-18, 08-13, 08-18, 08-22, 09-12). The rebirth
// point-allocation page is shared with the ending screen (emit 'requestRebirth').
import { h, openWindow, closeWindow, closeAllWindows, anyWindowOpen, toast } from './dom.js';
import { game, startRun, adoptState, saveRun } from '../game.js';
import { showScreen, titleScreen } from './menus.js';
import { on, emit } from '../engine/bus.js';
import { pickLang, tr } from '../engine/i18n.js';
import { CHARACTERS, CHARACTER_ORDER } from '../content/characters.js';
import { DIFFICULTIES } from '../content/difficulty.js';
import { ABILITIES } from '../content/abilities.js';
import { itemName } from '../data/db.js';
import { COUNTER_LABELS } from '../sim/settlement.js';
import { prepareNextLoop, prepareTearUp, rewindOptions, rewindTo, clearSnapshots, buyAbility, abilityCost, deathCause, causeLabel, START_ONLY_ABILITIES } from '../sim/rebirth.js';
import { helpIcon, pointsBadge, ledgerTable, holdPause, releasePause, POINTS_HELP } from './settlementPanel.js';

export const KEY_STATS = ['zombie.kill', 'food.eaten', 'cook.count', 'plant.harvest', 'craft.total', 'trap.catch', 'trade.active.dealcount', 'survivor.aid', 'explore.total'];

export function confirmDialog({ title, text, confirm, danger = false, onConfirm }) {
  openWindow('loopConfirm', {
    title,
    width: 440,
    modal: true,
    build: (body) => {
      body.appendChild(h('div', { style: { lineHeight: 1.55, marginBottom: '12px' } }, text));
      body.appendChild(
        h(
          'div',
          { class: 'row', style: { justifyContent: 'flex-end' } },
          h('button', { onclick: () => closeWindow('loopConfirm') }, tr('menu.cancel')),
          h(
            'button',
            {
              class: danger ? 'danger' : 'primary',
              onclick: () => {
                closeWindow('loopConfirm');
                onConfirm();
              },
            },
            confirm || tr('menu.confirm')
          )
        )
      );
    },
  });
}

// Abilities with Learn / Upgrade buttons. `holder` is the live run or { loop } on the rebirth page.
export function abilityList(holder, onChange, { live = false } = {}) {
  const loop = holder.loop;
  return h(
    'div',
    { class: 'list' },
    ...ABILITIES.map((a) => {
      const lv = loop.abilities[a.id] || 0;
      const cost = abilityCost(loop, a.id);
      const fresh = loop.abilitiesThisRound?.[a.id] || 0;
      const can = cost != null && loop.planningPoints >= cost;
      return h(
        'div',
        { class: 'list-item', style: { alignItems: 'flex-start' } },
        h(
          'div',
          { class: 'col', style: { flex: 1, gap: '2px' } },
          h(
            'div',
            {},
            h('b', {}, pickLang(a.name)),
            ' ',
            h('span', { class: 'warn', style: { letterSpacing: '1px' } }, '●'.repeat(lv) + '○'.repeat(a.maxLv - lv)),
            fresh
              ? h(
                  'span',
                  { class: 'pill', style: { marginLeft: '6px' }, dataset: { tip: pickLang({ en: 'Learned this round: refunded if you tear up this round.', zh: '本轮学习：撕掉本轮时全额退还。' }) } },
                  pickLang({ en: `+${fresh} this round`, zh: `本轮+${fresh}` })
                )
              : null
          ),
          h('div', { class: 'dim' }, pickLang(a.desc)),
          live && START_ONLY_ABILITIES.has(a.id) ? h('div', { class: 'dim', style: { fontSize: '11px' } }, pickLang({ en: 'Takes effect when the next round begins.', zh: '从下一轮开始时生效。' })) : null
        ),
        cost == null
          ? h('span', { class: 'good' }, 'MAX')
          : h(
              'button',
              {
                class: can ? 'primary' : '',
                disabled: can ? null : true,
                onclick: () => {
                  const r = buyAbility(holder, a.id);
                  if (r.ok) toast(pickLang({ en: `${a.name.en} Lv${r.lv}`, zh: `${a.name.zh} ${r.lv}级` }), 'good');
                  onChange();
                },
              },
              `${lv ? pickLang({ en: 'Upgrade', zh: '升级' }) : pickLang({ en: 'Learn', zh: '学习' })} · ${cost}`
            )
      );
    })
  );
}

// ------------------------------------------------------------------------------ full-screen pages

// Esc on these pages must not open the pause menu or start anything (demo patch 07-13).
let keyGuard = null;

function guardKeys() {
  if (keyGuard) return;
  keyGuard = (e) => {
    if (e.key === 'Escape' && !anyWindowOpen()) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  window.addEventListener('keydown', keyGuard, true);
}

function leavePage() {
  if (keyGuard) window.removeEventListener('keydown', keyGuard, true);
  keyGuard = null;
  if (game.state) releasePause(game.state, 'rebirthPage');
  showScreen(null);
}

// The page sits under #windows (no z-index) so the Survival Log and confirmations open on top of it.
function page(...children) {
  guardKeys();
  return h(
    'div',
    { class: 'screen', style: { zIndex: 'auto', justifyContent: 'flex-start' } },
    h('div', { class: 'col', style: { margin: 'auto 0', alignItems: 'center', gap: '14px', maxWidth: '1100px' } }, ...children)
  );
}

function box(title, ...children) {
  return h(
    'div',
    { style: { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px 14px', minWidth: '300px' } },
    title ? h('div', { class: 'sec-title' }, title) : null,
    ...children
  );
}

function kv(rows) {
  return h('div', { class: 'kv' }, ...rows.flatMap(([label, value]) => [h('span', {}, pickLang(label)), h('b', { style: { textAlign: 'right' } }, String(value))]));
}

function difficultyName(state) {
  return pickLang(DIFFICULTIES[state.meta.difficultyId]?.name || { en: 'Custom', zh: '自定义' });
}

function daysSurvived(state) {
  return Math.max(0, (state.run.deathDay ?? state.run.day ?? 1) - 1);
}

function keyStats(state) {
  const c = state.progress.counters;
  return [
    [{ en: 'Survivor', zh: '身份' }, pickLang(CHARACTERS[state.meta.character]?.name)],
    [{ en: 'Difficulty', zh: '难度' }, difficultyName(state)],
    [{ en: 'Days survived', zh: '生存天数' }, daysSurvived(state)],
    [{ en: 'Best in any loop', zh: '历史最远' }, pickLang({ en: `Day ${state.loop.bestDay || 0}`, zh: `第${state.loop.bestDay || 0}天` })],
    [{ en: 'Hordes survived', zh: '挺过尸潮' }, state.progress.hordesSurvived || c['horde.survived'] || 0],
    ...KEY_STATS.map((k) => [COUNTER_LABELS[k], Math.round(c[k] || 0)]),
  ];
}

function allStats(state) {
  const rows = Object.entries(state.progress.counters)
    .filter(([, v]) => typeof v === 'number' && v)
    .map(([k, v]) => [COUNTER_LABELS[k] || { en: k, zh: k }, Math.round(v * 10) / 10]);
  return rows.length ? kv(rows) : h('div', { class: 'dim' }, pickLang({ en: 'No records yet.', zh: '暂无记录。' }));
}

function optionCard(icon, name, desc, ...actions) {
  return h(
    'div',
    { class: 'card', style: { width: '230px' } },
    h('h5', {}, `${icon} ${pickLang(name)}`),
    h('div', { class: 'dim', style: { flex: 1, lineHeight: 1.45 } }, desc),
    ...actions
  );
}

export function showDeathScreen() {
  const state = game.state;
  if (!state || state.phase !== 'dead') return;
  let full = false;
  const render = () => {
    const cause = causeLabel(deathCause(state));
    const cycle = state.loop.cycle || 1;
    const persist = rewindOptions(state).filter((o) => o.affordable);
    const firstRebirth = !state.loop.usedRebirth;
    showScreen(
      page(
        h('div', { class: 'title-logo', style: { fontSize: '40px' } }, pickLang({ en: `Loop ${cycle} ends`, zh: `第${cycle}轮 终` })),
        h('div', { class: 'title-sub', style: { fontSize: '16px' } }, pickLang({ en: `Day ${state.run.deathDay ?? state.run.day} · ${cause.en}`, zh: `第${state.run.deathDay ?? state.run.day}天 · ${cause.zh}` })),
        h(
          'div',
          { class: 'row', style: { flexWrap: 'wrap', justifyContent: 'center', alignItems: 'stretch' } },
          box(
            pickLang({ en: 'Survival record', zh: '生存记录' }),
            full ? allStats(state) : kv(keyStats(state)),
            h('button', { style: { marginTop: '8px' }, onclick: () => ((full = !full), render()) }, full ? pickLang({ en: 'Key stats', zh: '关键数据' }) : pickLang({ en: 'View all stats', zh: '查看全部数据' }))
          ),
          box(h('span', {}, pickLang({ en: 'Planning Points this round', zh: '本轮生存点' }), helpIcon(pickLang(POINTS_HELP))), ledgerTable(state))
        ),
        h(
          'div',
          { class: 'cards', style: { justifyContent: 'center' } },
          optionCard(
            '🔁',
            { en: 'Rebirth', zh: '重生' },
            pickLang({
              en: `Wake up on the morning before the outbreak as Loop ${cycle + 1}, with your Planning Points, abilities, memories and rebirth notes.`,
              zh: `以第${cycle + 1}轮在灾变前的清晨醒来，带着生存点、能力、记忆与重生笔记。`,
            }),
            h('button', { class: 'primary', onclick: () => confirmRebirth(state, firstRebirth) }, pickLang({ en: 'Rebirth', zh: '重生' }))
          ),
          persist.length
            ? optionCard(
                '✊',
                { en: 'I want to persist!', zh: '我还想坚持！' },
                pickLang({ en: 'Pay Planning Points to go back to the morning of a recent day and keep this round going.', zh: '支付生存点回到最近某天的清晨，让这一轮继续下去。' }),
                ...persist.map((o) =>
                  h(
                    'button',
                    { onclick: () => confirmPersist(state, o, firstRebirth) },
                    pickLang({ en: `Back to Day ${o.day} · −${o.cost}`, zh: `回到第${o.day}天 · −${o.cost}` })
                  )
                )
              )
            : null,
          optionCard(
            '✂',
            { en: 'Tear Up This Round and Rewrite', zh: '撕掉本轮重写' },
            pickLang({
              en: `Start Loop ${cycle} over from the first morning. Points spent on abilities this round are refunded. Does not count as a rebirth.`,
              zh: `从第一个清晨重新开始第${cycle}轮。本轮学习能力花费的生存点全额退还，不算作重生。`,
            }),
            h('button', { onclick: () => startTearUp() }, pickLang({ en: 'Tear up', zh: '撕掉重写' }))
          ),
          optionCard(
            '🏠',
            { en: 'Main Menu', zh: '返回主菜单' },
            pickLang({ en: 'Leave for now. The results stay in this save, so you can choose later.', zh: '暂时离开。结算结果保留在存档中，之后可以再做选择。' }),
            h('button', { onclick: () => confirmMainMenu() }, pickLang({ en: 'Main menu', zh: '主菜单' }))
          )
        )
      )
    );
  };
  render();
}

function justOnceNote(firstRebirth) {
  return firstRebirth ? pickLang({ en: ' This is the first rebirth in this save: the "Just Once" challenge will no longer be possible.', zh: '这是本存档的第一次重生：“一次就好”挑战将无法达成。' }) : '';
}

function confirmRebirth(state, firstRebirth) {
  confirmDialog({
    title: pickLang({ en: 'Rebirth', zh: '重生' }),
    text: pickLang({ en: 'End this round and turn to a new page of the Survival Log?', zh: '结束本轮，翻开生存日志新的一页？' }) + justOnceNote(firstRebirth),
    confirm: pickLang({ en: 'Rebirth', zh: '重生' }),
    onConfirm: () => showRebirthPage({ loop: prepareNextLoop(state), kind: 'rebirth', character: state.meta.character, back: showDeathScreen }),
  });
}

function confirmPersist(state, o, firstRebirth) {
  confirmDialog({
    title: pickLang({ en: 'I want to persist!', zh: '我还想坚持！' }),
    text:
      pickLang({
        en: `Go back to the morning of Day ${o.day} for ${o.cost} Planning Points? Everything since then is undone; your balance will be ${Math.floor(o.balance - o.cost)}.`,
        zh: `花费${o.cost}生存点回到第${o.day}天的清晨？此后发生的一切都将撤销，余额将变为${Math.floor(o.balance - o.cost)}。`,
      }) + justOnceNote(firstRebirth),
    confirm: pickLang({ en: `Back to Day ${o.day}`, zh: `回到第${o.day}天` }),
    onConfirm: () => persistTo(o.day),
  });
}

function confirmMainMenu() {
  confirmDialog({
    title: pickLang({ en: 'Main Menu', zh: '返回主菜单' }),
    text: pickLang({ en: 'Return to the main menu? Load this save later to choose how the loop continues.', zh: '返回主菜单？之后读取该存档即可继续选择。' }),
    onConfirm: () => {
      saveRun();
      closeAllWindows();
      leavePage();
      game.state = null;
      emit('leaveGame', {});
      titleScreen();
    },
  });
}

// "Tear Up This Round and Rewrite", from the results page or the tear-off in the Survival Log.
export function startTearUp() {
  const state = game.state;
  if (!state) return;
  const { loop, refunded } = prepareTearUp(state);
  const live = state.phase !== 'dead' && state.phase !== 'ending';
  const cycle = state.loop.cycle || 1;
  confirmDialog({
    title: pickLang({ en: 'Tear Up This Round and Rewrite', zh: '撕掉本轮重写' }),
    text: pickLang({
      en: `Tear out Loop ${cycle} and rewrite it from the morning before the outbreak? The ${refunded} Planning Points spent on abilities this round are refunded so you can reallocate them; this round's other gains are torn out with the page. You will start with ${Math.floor(loop.planningPoints)} Planning Points. This does not count as a rebirth.`,
      zh: `撕掉第${cycle}轮，从灾变前的清晨重新书写？本轮学习能力花费的${refunded}生存点全额退还，可重新分配；本轮的其他收获随这一页一起撕掉。你将带着${Math.floor(loop.planningPoints)}生存点重新开始。不算作重生。`,
    }),
    confirm: pickLang({ en: 'Tear it up', zh: '撕掉' }),
    danger: true,
    onConfirm: () => {
      closeAllWindows();
      if (live) holdPause(state, 'rebirthPage');
      const back = live ? leavePage : showDeathScreen;
      showRebirthPage({ loop, kind: 'tearUp', character: state.meta.character, seed: state.meta.seed, back });
    },
  });
}

function difficultyParams(state) {
  return Object.fromEntries(Object.entries(state.meta.difficulty || {}).filter(([, v]) => typeof v === 'number'));
}

function beginLoop(loop, { character, seed, kind }) {
  const prev = game.state;
  const opts = {
    character,
    difficulty: prev.meta.difficultyId,
    custom: difficultyParams(prev),
    mode: prev.meta.mode === 'pureEndless' ? 'pureEndless' : 'story',
    skipPrologue: true,
    slot: game.slot,
    loop,
  };
  if (seed != null) opts.seed = seed;
  closeAllWindows();
  leavePage();
  const state = startRun(opts);
  clearSnapshots(prev.meta.id);
  saveRun();
  emit('enterGame', { fresh: true, rebirth: kind });
  const dropped = state.run.notesPlaced?.dropped;
  if (dropped) toast(pickLang({ en: `${dropped} rebirth notes did not fit in the backpack and lie at your feet.`, zh: `${dropped}份重生笔记放不进背包，掉在了脚边。` }));
}

function persistTo(day) {
  const next = rewindTo(game.state, day);
  if (!next) return toast(pickLang({ en: 'Not enough Planning Points.', zh: '生存点不足。' }), 'bad');
  closeAllWindows();
  leavePage();
  adoptState(next, game.slot);
  saveRun();
  emit('enterGame', { rewind: day });
  toast(pickLang({ en: `Back on the morning of Day ${day}. Hold on this time.`, zh: `回到了第${day}天的清晨。这次要撑住。` }), 'good');
}

function carriedList(loop) {
  const notes = (loop.notes || []).map((n) => `${itemName(n.id)} ×${n.n}`);
  const rows = [
    [{ en: 'Planning Points', zh: '生存点' }, Math.floor(loop.planningPoints)],
    [{ en: 'Abilities learned', zh: '已学能力' }, Object.values(loop.abilities).reduce((a, b) => a + b, 0)],
    [{ en: 'Memories', zh: '记忆' }, (loop.memories || []).length],
    [{ en: 'Best day', zh: '最远天数' }, loop.bestDay || 0],
  ];
  if (loop.neighborAffinity) rows.push([{ en: 'Neighbor affinity', zh: '邻居好感' }, loop.neighborAffinity]);
  return h(
    'div',
    { class: 'col' },
    kv(rows),
    h('div', { class: 'sec-title', style: { marginTop: '6px' } }, pickLang({ en: 'Rebirth notes in the backpack', zh: '背包里的重生笔记' })),
    notes.length ? h('div', { class: 'dim', style: { lineHeight: 1.5 } }, notes.join(' · ')) : h('div', { class: 'dim' }, pickLang({ en: 'None: no proficiency to write down yet.', zh: '无：还没有可记录的熟练度。' })),
    loop.ngPlus ? h('div', { class: 'warn', style: { marginTop: '4px' } }, pickLang({ en: 'New Game+: floors, basement and traps unlock earlier.', zh: '新周目：二楼、地下室与陷阱更早解锁。' })) : null
  );
}

function characterPicker(selected, onPick) {
  const unlocked = CHARACTER_ORDER.filter((id) => id === selected || game.history.characters?.[id]);
  return h(
    'div',
    { class: 'row', style: { flexWrap: 'wrap' } },
    ...unlocked.map((id) => h('button', { class: id === selected ? 'primary' : '', onclick: () => onPick(id) }, pickLang(CHARACTERS[id].name)))
  );
}

// Rebirth point-allocation page: spend Planning Points on abilities, pick who to be, then begin the round.
// kind: 'rebirth' (after death), 'ending' (after an ending) or 'tearUp' (the same loop again).
export function showRebirthPage({ loop, kind, character, seed = null, back = null }) {
  const holder = { loop };
  let who = character;
  const tearUp = kind === 'tearUp';
  const render = () => {
    const title = tearUp ? pickLang({ en: `Rewrite Loop ${loop.cycle}`, zh: `重写第${loop.cycle}轮` }) : pickLang({ en: `Loop ${loop.cycle}`, zh: `第${loop.cycle}轮` });
    showScreen(
      page(
        h('div', { class: 'title-logo', style: { fontSize: '40px' } }, title),
        h(
          'div',
          { class: 'story-text dim' },
          pickLang({
            en: 'The phone lights up. It is the morning before the outbreak — again. The Survival Log is still in your hands.',
            zh: '手机亮了。又是灾变前的那个清晨。生存日志还在你手里。',
          })
        ),
        h(
          'div',
          { class: 'row', style: { flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-start' } },
          h(
            'div',
            { class: 'col', style: { width: '340px' } },
            box(null, pointsBadge(loop.planningPoints)),
            tearUp ? null : box(pickLang({ en: 'Who wakes up', zh: '醒来的是' }), characterPicker(who, (id) => ((who = id), render()))),
            box(pickLang({ en: 'Carried into this loop', zh: '带入本轮' }), carriedList(loop))
          ),
          box(
            h('span', {}, pickLang({ en: 'Abilities', zh: '能力' }), helpIcon(pickLang({ en: 'Abilities are kept in every loop. Points spent here can be refunded by tearing up the round.', zh: '能力在每一轮都保留。在此花费的点数可通过撕掉本轮退还。' }))),
            h('div', { style: { maxHeight: '52vh', overflowY: 'auto', width: '440px' } }, abilityList(holder, render))
          )
        ),
        h(
          'div',
          { class: 'row' },
          back
            ? h('button', { onclick: back }, tr('menu.back'))
            : h(
                'button',
                {
                  onclick: () => {
                    saveRun();
                    leavePage();
                    game.state = null;
                    emit('leaveGame', {});
                    titleScreen();
                  },
                },
                pickLang({ en: 'Main menu', zh: '主菜单' })
              ),
          h(
            'button',
            {
              class: 'primary',
              onclick: () =>
                confirmDialog({
                  title,
                  text: pickLang({
                    en: `Begin as the ${CHARACTERS[who].name.en} with ${Math.floor(loop.planningPoints)} Planning Points left unspent?`,
                    zh: `以${CHARACTERS[who].name.zh}的身份开始，剩余${Math.floor(loop.planningPoints)}生存点未分配？`,
                  }),
                  confirm: pickLang({ en: 'Begin', zh: '开始' }),
                  onConfirm: () => beginLoop(loop, { character: who, seed, kind }),
                }),
            },
            pickLang({ en: 'Begin ▶', zh: '开始 ▶' })
          )
        )
      )
    );
  };
  render();
}

on('death', () =>
  setTimeout(() => {
    if (game.state?.phase !== 'dead') return;
    saveRun();
    closeAllWindows();
    showDeathScreen();
  }, 0)
);

// A save that ended on the results page opens on it again.
on('enterGame', () => setTimeout(() => game.state?.phase === 'dead' && showDeathScreen(), 0));

// After an ending: the ending screen hands over to the allocation page ({ character } optional).
on('requestRebirth', (payload = {}) =>
  setTimeout(() => {
    const state = game.state;
    if (!state) return;
    closeAllWindows();
    showRebirthPage({ loop: prepareNextLoop(state), kind: 'ending', character: payload.character || state.meta.character });
  }, 0)
);
