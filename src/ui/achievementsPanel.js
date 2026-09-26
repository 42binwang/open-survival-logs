// Achievements window (S03): all 93 achievements with category icon, name and description (hidden ones stay
// "???" until unlocked), progress bars, unlock date and the Steam global unlock rate.
import { h, openWindow, refreshWindow, isOpen, bar } from './dom.js';
import { registerPanel, openPanel } from './panels.js';
import { registerMenuButton } from './menus.js';
import { game } from '../game.js';
import { tr, pickLang, getLang } from '../engine/i18n.js';
import { on } from '../engine/bus.js';
import { ACHIEVEMENTS, ACH_CATEGORIES, achievementProgress, unlockedCount } from '../meta/achievements.js';

const view = { cat: 0, show: 'all', sort: 'order' };

function dateText(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(getLang() === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function row(a, state, hist) {
  const at = hist.achievements?.[a.id];
  const cat = ACH_CATEGORIES[a.cat] || ACH_CATEGORIES[10];
  const secret = a.hidden && !at;
  const prog = at ? null : achievementProgress(a, state, hist);
  return h(
    'div',
    { class: `list-item ${at ? 'sel' : ''}`, style: { alignItems: 'center', opacity: at ? 1 : 0.8 } },
    h(
      'div',
      {
        style: {
          width: '38px',
          height: '38px',
          flex: '0 0 38px',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '20px',
          background: at ? '#4a3a1c' : '#23272d',
          border: `1px solid ${at ? 'var(--accent)' : '#3a3f46'}`,
          filter: at ? 'none' : 'grayscale(1)',
        },
        dataset: { tip: pickLang(cat.name) },
      },
      secret ? '🔒' : cat.icon
    ),
    h(
      'div',
      { class: 'col', style: { flex: '1', gap: '2px', minWidth: 0 } },
      h('b', { style: { color: at ? 'var(--accent)' : 'var(--text)' } }, secret ? '???' : pickLang(a.name)),
      h(
        'span',
        { class: 'dim', style: { fontSize: '12px' } },
        secret ? pickLang({ en: 'Hidden achievement. Keep playing to reveal it.', zh: '隐藏成就，继续游戏以揭晓。' }) : pickLang(a.desc)
      ),
      prog
        ? h(
            'div',
            { class: 'row', style: { alignItems: 'center', gap: '6px' } },
            h('div', { style: { flex: '1' } }, bar(prog.value, prog.target)),
            h('span', { class: 'dim', style: { fontSize: '11px', minWidth: '70px', textAlign: 'right' } }, `${prog.value} / ${prog.target}`)
          )
        : null
    ),
    h(
      'div',
      { class: 'col', style: { alignItems: 'flex-end', gap: '2px', minWidth: '96px' } },
      at ? h('span', { class: 'good', style: { fontSize: '12px' } }, `✔ ${dateText(at)}`) : h('span', { class: 'dim', style: { fontSize: '12px' } }, pickLang({ en: 'Locked', zh: '未解锁' })),
      a.pct != null
        ? h('span', { class: 'dim', style: { fontSize: '11px' }, dataset: { tip: pickLang({ en: 'Share of Steam players who unlocked it', zh: 'Steam 玩家解锁比例' }) } }, `🌐 ${a.pct.toFixed(1)}%`)
        : null
    )
  );
}

function build(body) {
  const hist = game.history;
  const state = game.state;
  const n = unlockedCount(hist);
  body.appendChild(
    h(
      'div',
      { class: 'row', style: { alignItems: 'center', marginBottom: '6px' } },
      h('b', { style: { fontSize: '16px' } }, `${n} / ${ACHIEVEMENTS.length}`),
      h('div', { style: { flex: '1' } }, bar(n, ACHIEVEMENTS.length)),
      h('span', { class: 'dim' }, `${Math.floor((n / ACHIEVEMENTS.length) * 100)}%`),
      h('button', { onclick: () => openPanel('codex') }, `📖 ${tr('menu.codex')}`),
      h('button', { onclick: () => openPanel('profile') }, `🪪 ${tr('menu.profile')}`)
    )
  );
  const cats = [[0, { icon: '★', name: { en: 'All', zh: '全部' } }], ...Object.entries(ACH_CATEGORIES).map(([k, v]) => [Number(k), v])];
  body.appendChild(
    h(
      'div',
      { class: 'tabs' },
      ...cats.map(([id, c]) => {
        const list = ACHIEVEMENTS.filter((a) => !id || a.cat === id);
        const have = list.filter((a) => hist.achievements?.[a.id]).length;
        return h(
          'button',
          {
            class: view.cat === id ? 'on' : '',
            onclick: () => {
              view.cat = id;
              refreshWindow('achievements');
            },
          },
          `${c.icon} ${pickLang(c.name)} ${have}/${list.length}`
        );
      })
    )
  );
  const toggle = (key, value, label) =>
    h(
      'button',
      {
        class: view[key] === value ? 'on' : '',
        style: view[key] === value ? { borderColor: 'var(--accent)' } : null,
        onclick: () => {
          view[key] = value;
          refreshWindow('achievements');
        },
      },
      pickLang(label)
    );
  body.appendChild(
    h(
      'div',
      { class: 'row', style: { alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '4px' } },
      toggle('show', 'all', { en: 'All', zh: '全部' }),
      toggle('show', 'unlocked', { en: 'Unlocked', zh: '已解锁' }),
      toggle('show', 'locked', { en: 'Locked', zh: '未解锁' }),
      h('span', { class: 'spacer' }),
      h('span', { class: 'dim' }, pickLang({ en: 'Sort:', zh: '排序：' })),
      toggle('sort', 'order', { en: 'Default', zh: '默认' }),
      toggle('sort', 'rare', { en: 'Rarest first', zh: '稀有优先' }),
      toggle('sort', 'recent', { en: 'Recently unlocked', zh: '最近解锁' })
    )
  );
  let list = ACHIEVEMENTS.filter((a) => !view.cat || a.cat === view.cat);
  if (view.show === 'unlocked') list = list.filter((a) => hist.achievements?.[a.id]);
  if (view.show === 'locked') list = list.filter((a) => !hist.achievements?.[a.id]);
  if (view.sort === 'rare') list = [...list].sort((a, b) => (a.pct ?? 100) - (b.pct ?? 100));
  if (view.sort === 'recent') list = [...list].sort((a, b) => (hist.achievements?.[b.id] || 0) - (hist.achievements?.[a.id] || 0));
  body.appendChild(
    list.length
      ? h('div', { class: 'list' }, ...list.map((a) => row(a, state, hist)))
      : h('div', { class: 'dim' }, pickLang({ en: 'Nothing here yet.', zh: '这里还什么都没有。' }))
  );
}

registerPanel('achievements', () => {
  openWindow('achievements', { title: `🏆 ${tr('menu.achievements')}`, width: 760, modal: !game.state, build });
});

registerMenuButton({ label: () => tr('menu.achievements'), run: () => openPanel('achievements') });

on('achievement', () => {
  if (isOpen('achievements')) refreshWindow('achievements');
});
