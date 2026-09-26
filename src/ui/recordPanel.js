// Record player window (F11): place records you own (the track stays unlocked for good), play / next / stop,
// Auto-Change (patch 08-28) and Single Loop (patch 09-04). Playback and Morale run in src/meta/profile.js.
import { h, openWindow, refreshWindow, isOpen, bar, toast } from './dom.js';
import { registerPanel } from './panels.js';
import { game } from '../game.js';
import { pickLang, loc, getLang } from '../engine/i18n.js';
import { on } from '../engine/bus.js';
import { item, itemName } from '../data/db.js';
import { furnLabel } from '../sim/home.js';
import { queuePanelFunction } from '../sim/furnActions.js';
import { formatDuration } from '../sim/time.js';
import {
  RECORD_IDS,
  RECORD_MORALE_PER_HOUR,
  recordPlayers,
  recordData,
  unlockedTracks,
  ownedRecords,
  currentTrack,
  placeRecord,
  playTrack,
  stopTrack,
  setPlayMode,
  trackLengthSec,
  isRecordPlayer,
} from '../meta/profile.js';

let ticker = null;

function build(body, uid) {
  const state = game.state;
  const f = state?.furniture[uid];
  if (!isRecordPlayer(f)) {
    body.appendChild(h('div', { class: 'dim' }, pickLang({ en: 'The record player is gone.', zh: '唱片机不见了。' })));
    return;
  }
  const d = recordData(f);
  const tracks = unlockedTracks(f);
  const owned = new Set(ownedRecords(state));
  const cur = currentTrack(f);
  const unpowered = f.powered === false;
  const act = (fn) => () => {
    if (!fn()) toast(pickLang({ en: 'Nothing to play. Place a record first.', zh: '没有可以播放的唱片，先放上一张。' }), 'bad');
    refreshWindow('records');
  };
  body.appendChild(
    h(
      'div',
      { class: 'card', style: { width: 'auto', marginBottom: '8px' } },
      h(
        'div',
        { class: 'row', style: { alignItems: 'center' } },
        h('span', { style: { fontSize: '28px', opacity: d.playing ? 1 : 0.5 } }, d.playing ? '💿' : '📀'),
        h(
          'div',
          { class: 'col', style: { flex: '1', gap: '3px' } },
          h('b', {}, d.playing && cur ? `♪ ${itemName(cur)}` : pickLang({ en: 'Stopped', zh: '已停止' })),
          d.playing && cur ? bar(d.pos || 0, trackLengthSec(cur)) : null,
          d.playing && cur ? h('span', { class: 'dim', style: { fontSize: '11px' } }, `${formatDuration(d.pos || 0)} / ${formatDuration(trackLengthSec(cur))}`) : null
        )
      ),
      unpowered ? h('div', { class: 'bad' }, pickLang({ en: 'No power: the record player is silent.', zh: '没有电，唱片机无法播放。' })) : null,
      h(
        'div',
        { class: 'row', style: { marginTop: '6px', flexWrap: 'wrap', gap: '4px' } },
        h('button', { class: 'primary', disabled: unpowered || !tracks.length ? true : null, onclick: act(() => playTrack(state, uid)) }, `▶ ${pickLang({ en: 'Play', zh: '播放' })}`),
        h('button', { disabled: tracks.length < 2 ? true : null, onclick: act(() => queuePanelFunction(state, uid, 80013)) }, `⏭ ${pickLang({ en: 'Next', zh: '下一首' })}`),
        h('button', { disabled: d.playing ? null : true, onclick: act(() => stopTrack(state, uid)) }, `■ ${pickLang({ en: 'Stop', zh: '暂停播放' })}`),
        h('span', { class: 'spacer' }),
        h(
          'button',
          {
            class: d.auto ? 'primary' : '',
            dataset: { tip: pickLang({ en: 'Play your records one after another.', zh: '放完一张接着放下一张。' }) },
            onclick: act(() => setPlayMode(state, uid, d.auto ? null : 'auto')),
          },
          `🔁 ${pickLang({ en: 'Auto-Change', zh: '自动换碟' })}`
        ),
        h(
          'button',
          {
            class: d.loop ? 'primary' : '',
            dataset: { tip: pickLang({ en: 'Replay this record when it ends.', zh: '这张放完再从头放一遍。' }) },
            onclick: act(() => setPlayMode(state, uid, d.loop ? null : 'loop')),
          },
          `🔂 ${pickLang({ en: 'Single Loop', zh: '单曲循环' })}`
        )
      )
    )
  );
  body.appendChild(h('div', { class: 'sec-title' }, pickLang({ en: `Records ${tracks.length}/${RECORD_IDS.length}`, zh: `唱片 ${tracks.length}/${RECORD_IDS.length}` })));
  body.appendChild(
    h(
      'div',
      { class: 'list' },
      ...RECORD_IDS.map((id) => {
        const unlocked = tracks.includes(id);
        const have = owned.has(id);
        const known = unlocked || have;
        const note = getLang() === 'zh' ? item(id)?.d1 : '';
        return h(
          'div',
          { class: `list-item ${d.playing && cur === id ? 'sel' : ''}`, style: { opacity: known ? 1 : 0.5 } },
          h('span', {}, unlocked ? '💿' : have ? '📀' : '▫'),
          h('div', { class: 'col', style: { flex: '1', gap: '1px' } }, h('span', {}, known ? itemName(id) : '???'), note && known ? h('span', { class: 'dim', style: { fontSize: '11px' } }, loc(note)) : null),
          unlocked
            ? h('button', { disabled: unpowered ? true : null, onclick: act(() => playTrack(state, uid, id)) }, pickLang({ en: 'Play', zh: '播放' }))
            : have
              ? h(
                  'button',
                  {
                    class: 'primary',
                    dataset: { tip: pickLang({ en: 'Put the record in the player. This track stays unlocked for good.', zh: '把唱片放进唱片机，永久解锁这首曲子。' }) },
                    onclick: () => {
                      if (placeRecord(state, uid, id)) toast(pickLang({ en: `Track unlocked: ${itemName(id)}`, zh: `曲目已解锁：${itemName(id)}` }), 'good');
                      refreshWindow('records');
                    },
                  },
                  pickLang({ en: 'Place record', zh: '放上唱片' })
                )
              : h('span', { class: 'dim', style: { fontSize: '11px' } }, pickLang({ en: 'Not found yet', zh: '尚未找到' }))
        );
      })
    )
  );
  body.appendChild(
    h(
      'div',
      { class: 'dim', style: { marginTop: '8px', fontSize: '11px' } },
      pickLang({
        en: `While a record plays at home with power: +${RECORD_MORALE_PER_HOUR} Morale per hour.`,
        zh: `在家且通电时播放唱片：每小时心态+${RECORD_MORALE_PER_HOUR}。`,
      })
    )
  );
}

registerPanel('records', (ctx = {}) => {
  const state = game.state;
  if (!state) return;
  const uid = ctx.furn ?? recordPlayers(state)[0]?.uid;
  const f = uid != null ? state.furniture[uid] : null;
  if (!isRecordPlayer(f)) {
    toast(pickLang({ en: 'There is no record player at home.', zh: '家里没有唱片机。' }), 'bad');
    return;
  }
  clearInterval(ticker);
  openWindow('records', {
    title: `📀 ${furnLabel(f)}`,
    width: 520,
    build: (body) => build(body, uid),
    onClose: () => {
      clearInterval(ticker);
      ticker = null;
    },
  });
  ticker = setInterval(() => {
    if (!isOpen('records')) return clearInterval(ticker);
    if (recordData(f).playing) refreshWindow('records');
  }, 1000);
});

on('record', () => {
  if (isOpen('records')) refreshWindow('records');
});
