// Survivor Profile window (S04, S05): title, badges, the five-dimension chart ("Defense Line", patch 09-04),
// endings per character, longest survival per character, endless and TV records, lifetime statistics.
import { h, openWindow, refreshWindow, isOpen, bar } from './dom.js';
import { registerPanel, openPanel } from './panels.js';
import { registerMenuButton } from './menus.js';
import { game } from '../game.js';
import { tr, pickLang, getLang } from '../engine/i18n.js';
import { on } from '../engine/bus.js';
import { CHARACTERS, CHARACTER_ORDER } from '../content/characters.js';
import { profileSummary, badgeDesc, BADGE_TIERS, DIMENSIONS, TITLES, TV_GAMES } from '../meta/profile.js';
import { CODEX_CAT_INFO } from '../meta/codex.js';

const CHAR_ICON = { wage: '👔', student: '🎓', warehouse: '📦' };

function radar(dims) {
  const size = 230;
  const c = h('canvas', { width: size, height: size, style: { width: `${size}px`, height: `${size}px` } });
  const ctx = c.getContext?.('2d');
  if (!ctx) return c;
  const cx = size / 2;
  const cy = size / 2 + 6;
  const r = 78;
  const n = DIMENSIONS.length;
  const pt = (i, f) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * r * f, cy + Math.sin(a) * r * f];
  };
  ctx.strokeStyle = '#3a3f46';
  ctx.lineWidth = 1;
  for (const f of [0.25, 0.5, 0.75, 1]) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const [x, y] = pt(i % n, f);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  for (let i = 0; i < n; i++) {
    const [x, y] = pt(i, 1);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  ctx.beginPath();
  DIMENSIONS.forEach((d, i) => {
    const [x, y] = pt(i, Math.max(0.04, (dims[d.id] || 0) / 100));
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(224, 168, 74, 0.35)';
  ctx.strokeStyle = '#e0a84a';
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e6e1d6';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  DIMENSIONS.forEach((d, i) => {
    const [x, y] = pt(i, 1.22);
    ctx.fillText(`${pickLang(d.name)} ${dims[d.id] || 0}`, x, y + 4);
  });
  return c;
}

function section(title, ...children) {
  return h('div', { style: { marginTop: '10px' } }, h('div', { class: 'sec-title' }, title), ...children);
}

function dateText(ts) {
  return new Date(ts).toLocaleDateString(getLang() === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' });
}

function build(body) {
  const hist = game.history;
  const p = profileSummary(hist, game.state);
  body.appendChild(
    h(
      'div',
      { class: 'row', style: { alignItems: 'center' } },
      h('span', { style: { fontSize: '30px' } }, '🪪'),
      h(
        'div',
        { class: 'col', style: { gap: '2px', flex: '1' } },
        h('b', { style: { fontSize: '17px', color: 'var(--accent)' } }, pickLang(p.title.name)),
        h(
          'span',
          { class: 'dim' },
          pickLang({
            en: `Achievements ${p.unlocked}/${p.total} · Runs ${p.runs} · Deaths ${p.deaths} · Endings ${p.endingCount}/9 · Codex ${p.codex.all.pct}%`,
            zh: `成就 ${p.unlocked}/${p.total} · 开局 ${p.runs} · 死亡 ${p.deaths} · 结局 ${p.endingCount}/9 · 图鉴 ${p.codex.all.pct}%`,
          })
        )
      ),
      h('button', { onclick: () => openPanel('achievements') }, `🏆 ${tr('menu.achievements')}`),
      h('button', { onclick: () => openPanel('codex') }, `📖 ${tr('menu.codex')}`)
    )
  );
  const badgeTiles = p.badges.map((b) => {
    const tier = BADGE_TIERS.find((t) => t.id === b.tier);
    return h(
      'div',
      {
        style: {
          width: '74px',
          padding: '6px 2px',
          borderRadius: '6px',
          textAlign: 'center',
          background: '#1c1f24',
          border: `2px solid ${tier ? tier.color : '#2c3036'}`,
          opacity: tier ? 1 : 0.45,
          fontSize: '11px',
        },
        dataset: { tip: `<b>${pickLang(b.name)}</b>${tier ? ` · ${pickLang(tier.name)}` : ''}<br>${badgeDesc(hist, b)}` },
      },
      h('div', { style: { fontSize: '22px', filter: tier ? 'none' : 'grayscale(1)' } }, b.icon),
      h('div', {}, pickLang(b.name))
    );
  });
  body.appendChild(
    h(
      'div',
      { class: 'row', style: { marginTop: '8px' } },
      h('div', { class: 'card', style: { width: '250px', alignItems: 'center' } }, h('h5', {}, pickLang({ en: 'Survivor dimensions', zh: '幸存者维度' })), radar(p.dimensions)),
      h(
        'div',
        { class: 'col', style: { flex: '1' } },
        h('div', { class: 'sec-title' }, pickLang({ en: 'Badges', zh: '徽章' })),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } }, ...badgeTiles),
        h('div', { class: 'sec-title' }, pickLang({ en: 'Titles', zh: '称号' })),
        h(
          'div',
          { style: { display: 'flex', flexWrap: 'wrap', gap: '4px' } },
          ...TITLES.map((t) => {
            const got = p.titles.includes(t.id);
            const need = t.ach ? pickLang({ en: 'Unlocked by an achievement', zh: '由成就解锁' }) : pickLang({ en: `${t.min} achievements`, zh: `${t.min}个成就` });
            return h('span', { class: `pill ${got ? 'good' : 'dim'}`, style: { opacity: got ? 1 : 0.5 }, dataset: { tip: need } }, pickLang(t.name));
          })
        )
      )
    )
  );
  const endingHead = h('tr', {}, h('th', { style: { textAlign: 'left' } }, pickLang({ en: 'Ending', zh: '结局' })), ...CHARACTER_ORDER.map((ch) => h('th', { dataset: { tip: pickLang(CHARACTERS[ch].name) } }, CHAR_ICON[ch])));
  const endingRows = p.endings.map((e) =>
    h(
      'tr',
      {},
      h('td', { class: e.seen ? '' : 'dim' }, e.seen ? pickLang(e.name) : '???'),
      ...CHARACTER_ORDER.map((ch) =>
        h('td', { style: { textAlign: 'center' }, class: e.byChar[ch] ? 'good' : 'dim' }, !e.chars.includes(ch) ? '—' : e.byChar[ch] ? '✔' : '·')
      )
    )
  );
  const longest = CHARACTER_ORDER.map((ch) => {
    const l = p.longest[ch];
    return h(
      'div',
      { class: 'list-item' },
      h('span', {}, `${CHAR_ICON[ch]} ${pickLang(CHARACTERS[ch].name)}`),
      h('span', { class: 'spacer' }),
      h('span', { dataset: { tip: pickLang({ en: 'Longest survival in any mode', zh: '任意模式最长生存' }) } }, pickLang({ en: `${l.any} d`, zh: `${l.any}天` })),
      h('span', { class: 'dim', dataset: { tip: pickLang({ en: 'Endless / Pure Endless', zh: '无尽 / 纯净无尽' }) } }, `♾ ${l.endless} / ${l.pure}`)
    );
  });
  body.appendChild(
    h(
      'div',
      { class: 'row', style: { alignItems: 'flex-start' } },
      h(
        'div',
        { style: { flex: '1' } },
        section(pickLang({ en: 'Endings', zh: '结局' }), h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' } }, endingHead, ...endingRows))
      ),
      h(
        'div',
        { style: { flex: '1' } },
        section(pickLang({ en: 'Longest survival', zh: '最长生存' }), h('div', { class: 'list' }, ...longest)),
        h('div', { class: 'dim', style: { marginTop: '4px' } }, pickLang({ en: `Highest endless threat level: ${p.maxThreat}`, zh: `无尽最高威胁等级：${p.maxThreat}` })),
        section(
          pickLang({ en: 'TV high scores', zh: '电视游戏最高分' }),
          h(
            'div',
            { class: 'kv' },
            ...TV_GAMES.flatMap((g) => [h('span', {}, `${g.icon} ${pickLang(g.name)}`), h('b', { class: (p.tvBest[g.id] || 0) >= 70 ? 'good' : '' }, String(p.tvBest[g.id] || 0))])
          )
        )
      )
    )
  );
  body.appendChild(
    section(
      pickLang({ en: 'Survival archive', zh: '生存档案' }),
      h('div', { class: 'kv', style: { gridTemplateColumns: '1fr auto 1fr auto' } }, ...p.stats.flatMap((s) => [h('span', { class: 'dim' }, pickLang(s.label)), h('b', {}, String(s.value))]))
    )
  );
  const codexRows = Object.entries(p.codex).filter(([k]) => k !== 'all');
  body.appendChild(
    section(
      pickLang({ en: 'Codex', zh: '图鉴' }),
      h(
        'div',
        { class: 'col', style: { gap: '3px' } },
        ...codexRows.map(([k, v]) =>
          h(
            'div',
            { class: 'row', style: { alignItems: 'center' } },
            h('span', { style: { width: '110px' } }, `${CODEX_CAT_INFO[k].icon} ${pickLang(CODEX_CAT_INFO[k].name)}`),
            h('div', { style: { flex: '1' } }, bar(v.have, v.total)),
            h('span', { class: 'dim', style: { width: '70px', textAlign: 'right' } }, `${v.have}/${v.total}`)
          )
        )
      )
    )
  );
  if (p.records.length) {
    body.appendChild(
      section(
        pickLang({ en: 'Recent runs', zh: '最近的经历' }),
        h(
          'div',
          { class: 'list' },
          ...p.records.map((r) =>
            h(
              'div',
              { class: 'list-item', style: { fontSize: '12px' } },
              h('span', {}, r.kind === 'ending' ? '🎬' : '✝'),
              h('span', {}, pickLang(CHARACTERS[r.character]?.name || { en: '?', zh: '?' })),
              h('span', { class: 'dim' }, pickLang({ en: `Day ${r.day + 1}`, zh: `第${r.day + 1}天` })),
              h('span', { class: 'dim' }, r.kind === 'ending' ? pickLang(p.endings.find((e) => e.key === r.ending)?.name || String(r.ending)) : r.cause || ''),
              h('span', { class: 'spacer' }),
              h('span', { class: 'dim' }, dateText(r.at))
            )
          )
        )
      )
    );
  }
}

registerPanel('profile', () => {
  openWindow('profile', { title: `🪪 ${tr('menu.profile')}`, width: 760, modal: !game.state, build });
});

registerMenuButton({ label: () => tr('menu.profile'), run: () => openPanel('profile') });

on('achievement', () => {
  if (isOpen('profile')) refreshWindow('profile');
});
