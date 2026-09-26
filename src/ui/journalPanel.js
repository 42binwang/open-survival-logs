// The Survival Log (hotkey L, furniture function 252): past rounds, abilities learned with Planning Points,
// knowledge memories carried between loops, proficiency and run statistics, with the tear-off next to the
// current round tab that rewrites the round (dev log #1, patches 08-22, 09-12).
import { h, openWindow, bar } from './dom.js';
import { registerPanel } from './panels.js';
import { registerToolbarButton } from './hud.js';
import { game } from '../game.js';
import { pickLang, tr } from '../engine/i18n.js';
import { CHARACTERS } from '../content/characters.js';
import { itemName } from '../data/db.js';
import { PROF } from '../sim/proficiency.js';
import { PROF_KEYS } from '../sim/state.js';
import { COUNTER_LABELS } from '../sim/settlement.js';
import { causeLabel, deathCause, endingLabel, canAffordAnyAbility, NOTE_SHARE } from '../sim/rebirth.js';
import { helpIcon, pointsBadge, ledgerTable, holdPause, releasePause, POINTS_HELP } from './settlementPanel.js';
import { abilityList, startTearUp } from './deathScreen.js';

const TABS = [
  ['rounds', { en: 'Rounds', zh: '轮回' }],
  ['abilities', { en: 'Abilities', zh: '能力' }],
  ['memories', { en: 'Memories', zh: '记忆' }],
  ['prof', { en: 'Proficiency', zh: '熟练度' }],
  ['stats', { en: 'Stats', zh: '统计' }],
];

let tab = 'rounds';

function loopName(cycle) {
  return pickLang({ en: `Loop ${cycle}`, zh: `第${cycle}轮` });
}

function dayName(day) {
  return pickLang({ en: `Day ${day}`, zh: `第${day}天` });
}

function charName(id) {
  return pickLang(CHARACTERS[id]?.name || { en: id, zh: id });
}

function dim(text) {
  return h('div', { class: 'dim' }, text);
}

function outcome(entry) {
  if (entry.torn) return h('span', { class: 'dim' }, pickLang({ en: '✂ Torn out and rewritten', zh: '✂ 已撕掉重写' }));
  if (entry.ending) return h('span', { class: 'good' }, `${pickLang({ en: 'Ending', zh: '结局' })}: ${pickLang(endingLabel(entry.ending))}`);
  if (entry.cause) return h('span', { class: 'bad' }, pickLang(causeLabel(entry.cause)));
  return h('span', { class: 'dim' }, '—');
}

function currentStatus(state) {
  if (state.phase === 'pre') return tr('phase.pre');
  if (state.phase === 'dead') return h('span', { class: 'bad' }, `${dayName(state.run.deathDay ?? state.run.day)} · ${pickLang(causeLabel(deathCause(state)))}`);
  if (state.run.ending) return h('span', { class: 'good' }, `${dayName(state.run.day)} · ${pickLang({ en: 'Ending', zh: '结局' })}: ${pickLang(endingLabel(state.run.ending))}`);
  return dayName(state.run.day ?? 1);
}

function roundsTab(state) {
  const loop = state.loop;
  const history = [...(loop.history || [])].reverse();
  const justOnce = loop.usedRebirth
    ? h('span', { class: 'dim' }, pickLang({ en: 'A rebirth has been used in this save.', zh: '本存档已使用过重生。' }))
    : h('span', { class: 'good' }, pickLang({ en: 'No rebirth used in this save yet: "Just Once" is still possible.', zh: '本存档尚未使用重生：“一次就好”仍可达成。' }));
  return h(
    'div',
    { class: 'col' },
    h(
      'div',
      { class: 'list' },
      h(
        'div',
        { class: 'list-item sel' },
        h('b', {}, loopName(loop.cycle || 1)),
        h('span', {}, charName(state.meta.character)),
        h('span', { class: 'pill' }, pickLang({ en: 'this round', zh: '本轮' })),
        h('span', { class: 'spacer' }),
        h('span', {}, currentStatus(state)),
        h('span', { class: 'pill', dataset: { tip: pickLang({ en: 'Planning Points earned this round', zh: '本轮获得的生存点' }) } }, `+${Math.round(state.run.pointsEarned || 0)}`)
      ),
      ...history.map((e) =>
        h(
          'div',
          { class: 'list-item', style: e.torn ? { borderStyle: 'dashed', opacity: 0.7 } : null },
          h('b', {}, loopName(e.cycle)),
          h('span', {}, charName(e.character)),
          h('span', { class: 'dim' }, dayName(e.day)),
          h('span', { class: 'spacer' }),
          outcome(e),
          e.points ? h('span', { class: 'pill' }, `+${e.points}`) : null
        )
      ),
      history.length ? null : dim(pickLang({ en: 'This is the first page. Whatever happens, the next loop will remember it.', zh: '这是第一页。无论发生什么，下一轮都会记得。' }))
    ),
    h(
      'div',
      { class: 'kv', style: { marginTop: '6px' } },
      h('span', {}, pickLang({ en: 'Furthest day in any loop', zh: '历次最远天数' })),
      h('b', { style: { textAlign: 'right' } }, String(loop.bestDay || 0)),
      h('span', {}, pickLang({ en: 'Rebirths and rewinds', zh: '重生与回溯次数' })),
      h('b', { style: { textAlign: 'right' } }, String(loop.rebirths || 0))
    ),
    justOnce,
    loop.ngPlus ? h('div', { class: 'warn' }, pickLang({ en: 'New Game+: floors, basement and traps unlock earlier.', zh: '新周目：二楼、地下室与陷阱更早解锁。' })) : null,
    h('div', { class: 'sec-title', style: { marginTop: '8px' } }, pickLang({ en: 'Planning Points this round', zh: '本轮生存点' })),
    ledgerTable(state)
  );
}

function abilitiesTab(state, refresh) {
  return h(
    'div',
    { class: 'col' },
    h(
      'div',
      { class: 'dim' },
      pickLang({
        en: 'Spend Planning Points to learn abilities. They stay with you in every loop; points spent this round come back if you tear up the round.',
        zh: '花费生存点学习能力。能力在每一轮都保留；撕掉本轮时，本轮花费的点数会退还。',
      }),
      helpIcon(pickLang(POINTS_HELP))
    ),
    abilityList(state, refresh, { live: true })
  );
}

function memoryRow(m) {
  const text = typeof m === 'string' ? m : pickLang(m.text) || m.id || '';
  const when = typeof m === 'object' && m.day != null ? `${m.cycle ? `${loopName(m.cycle)} · ` : ''}${dayName(m.day)}` : null;
  return h('div', { class: 'list-item' }, h('span', { style: { flex: 1 } }, text), when ? h('span', { class: 'pill' }, when) : null);
}

function memoriesTab(state) {
  const memories = [...(state.loop.memories || [])].reverse();
  const notes = state.loop.notes || [];
  return h(
    'div',
    { class: 'col' },
    dim(pickLang({ en: 'What you learned in earlier loops stays written here: when things happen, and how you fell.', zh: '前几轮学到的东西都写在这里：什么时候会发生什么，以及你是怎么倒下的。' })),
    memories.length ? h('div', { class: 'list' }, ...memories.map(memoryRow)) : dim(pickLang({ en: 'No memories yet.', zh: '还没有记忆。' })),
    h('div', { class: 'sec-title', style: { marginTop: '8px' } }, pickLang({ en: 'Rebirth notes brought into this loop', zh: '本轮带回的重生笔记' })),
    notes.length
      ? h('div', { class: 'list' }, ...notes.map((n) => h('div', { class: 'list-item' }, h('span', {}, `${itemName(n.id)} ×${n.n}`), h('span', { class: 'spacer' }), h('span', { class: 'dim' }, `${pickLang(PROF[n.prof]?.name)} +${n.exp}`))))
      : dim(pickLang({ en: 'None this loop.', zh: '本轮没有。' }))
  );
}

function profTab(state) {
  return h(
    'div',
    { class: 'col' },
    h(
      'div',
      { class: 'list' },
      ...PROF_KEYS.map((k) => {
        const def = PROF[k];
        const p = state.progress.prof[k] || { lv: 0, exp: 0 };
        const maxed = p.lv >= def.max;
        const need = def.need[p.lv] || 0;
        return h(
          'div',
          { class: 'list-item' },
          h('b', { style: { width: '110px' } }, pickLang(def.name)),
          h('span', { class: 'warn', style: { width: '64px' } }, `Lv ${p.lv}/${def.max}`),
          h('div', { style: { flex: 1 } }, bar(maxed ? 1 : p.exp, maxed ? 1 : need)),
          h('span', { class: 'dim', style: { width: '110px', textAlign: 'right' } }, maxed ? 'MAX' : `${Math.floor(p.exp)} / ${need}`)
        );
      })
    ),
    dim(
      pickLang({
        en: `About ${Math.round(NOTE_SHARE * 100)}% of the proficiency you gain this loop is written into rebirth notes that wait in your backpack next loop.`,
        zh: `本轮获得的熟练度约有${Math.round(NOTE_SHARE * 100)}%会写进重生笔记，下一轮放在你的背包里。`,
      })
    )
  );
}

function statsTab(state) {
  const pr = state.progress;
  const rows = [
    [{ en: 'Days survived', zh: '生存天数' }, Math.max(0, (state.run.deathDay ?? state.run.day ?? 1) - 1)],
    [{ en: 'Hordes survived', zh: '挺过尸潮' }, pr.hordesSurvived || 0],
    [{ en: 'Crises survived', zh: '度过危机' }, pr.crisesSurvived || 0],
    [{ en: 'Attributes over 150', zh: '突破150的属性' }, pr.maxOver150 || 0],
    ...Object.entries(pr.counters)
      .filter(([k, v]) => typeof v === 'number' && v && k !== 'horde.survived')
      .map(([k, v]) => [COUNTER_LABELS[k] || { en: k, zh: k }, Math.round(v * 10) / 10]),
  ];
  return h('div', { class: 'kv' }, ...rows.flatMap(([label, value]) => [h('span', {}, pickLang(label)), h('b', { style: { textAlign: 'right' } }, String(value))]));
}

const TAB_BUILDERS = { rounds: roundsTab, abilities: abilitiesTab, memories: memoriesTab, prof: profTab, stats: statsTab };

function tearOff() {
  return h(
    'button',
    {
      style: { borderStyle: 'dashed' },
      dataset: {
        tip: pickLang({
          en: 'Return to the morning before this round\'s outbreak and start over. Points spent on abilities this round are refunded. Does not count as a rebirth.',
          zh: '回到本轮灾变前的清晨重新开始。本轮学习能力花费的生存点全额退还，不算作重生。',
        }),
      },
      onclick: () => startTearUp(),
    },
    `✂ ${pickLang({ en: 'Tear Up This Round and Rewrite', zh: '撕掉本轮重写' })}`
  );
}

function buildJournal(body, state, refresh) {
  const tabButton = ([k, label]) => h('button', { class: tab === k ? 'on' : '', onclick: () => ((tab = k), refresh()) }, pickLang(label));
  body.appendChild(
    h(
      'div',
      { class: 'row', style: { alignItems: 'center', marginBottom: '8px' } },
      h('b', {}, loopName(state.loop.cycle || 1)),
      h('span', { class: 'dim' }, charName(state.meta.character)),
      h('span', { class: 'spacer' }),
      pointsBadge(state.loop.planningPoints)
    )
  );
  body.appendChild(h('div', { class: 'tabs' }, tabButton(TABS[0]), tearOff(), ...TABS.slice(1).map(tabButton)));
  body.appendChild(TAB_BUILDERS[tab](state, refresh));
}

registerPanel('journal', (ctx = {}) => {
  const state = game.state;
  if (!state) return;
  if (TAB_BUILDERS[ctx.tab]) tab = ctx.tab;
  openWindow('journal', {
    title: tr('ui.log'),
    width: 680,
    onClose: () => releasePause(state, 'journal'),
    build: (body, win) => buildJournal(body, state, () => win.refresh()),
  });
  holdPause(state, 'journal');
});

registerToolbarButton({
  label: () => `📓 ${tr('ui.log')}`,
  key: 'L',
  panel: 'journal',
  dot: (s) => canAffordAnyAbility(s.loop),
});
