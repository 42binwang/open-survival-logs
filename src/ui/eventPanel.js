// Story event modal (P01/P02): illustration, text, choices with requirements, countdown with a default
// choice, and the reward popup. Also the "My Choice" route overview and the commitment confirmation (P03),
// and the document viewer with every document read this loop (P16).
import { h, openWindow, closeWindow, isOpen, topModalId, bar, toast } from './dom.js';
import { registerPanel, openPanel } from './panels.js';
import { registerToolbarButton } from './hud.js';
import { holdPause, releasePause } from './settlementPanel.js';
import { game } from '../game.js';
import { on } from '../engine/bus.js';
import { pickLang, tr, loc } from '../engine/i18n.js';
import { item, itemName } from '../data/db.js';
import { EFFECTS } from '../content/effects.js';
import { SCENES, documentText } from '../content/events.js';
import { ROUTES, ROUTE_ORDER, COMMIT_DEADLINE_DAY, KIT_ITEM } from '../content/endings.js';
import { activeEvent, eventView, resolveEvent, tickEventCountdown, presentNext, routeStatus, canCommit, startCommit, questTitle, currentDay, documentList } from '../sim/story.js';
import { hasItems } from '../sim/furnActions.js';

const CSS = `
.story-event .win-body { padding: 0; }
.story-art { position: relative; height: 150px; display: flex; align-items: center; justify-content: center; font-size: 64px; border-bottom: 1px solid var(--line); overflow: hidden; text-shadow: 0 6px 24px rgba(0,0,0,.55); }
.story-art::after { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 130%, rgba(0,0,0,.6), transparent 65%); }
.story-body { padding: 12px 16px 14px; }
.story-p { line-height: 1.6; white-space: pre-line; margin: 0 0 10px; }
.story-body .choices { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
.story-body .choices button { text-align: left; padding: 7px 10px; }
.story-body .choices .why { display: block; font-size: 11px; color: var(--bad); }
.story-body .choices .dflt { font-size: 11px; color: var(--dim); margin-left: 6px; }
.story-count { margin: 6px 0 4px; font-size: 11px; color: var(--dim); }
.story-rewards { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 10px; }
.story-rewards .chip { font-size: 12px; padding: 2px 8px; border-radius: 10px; background: #2c3036; }
.story-rewards .chip.good { color: var(--good); }
.story-rewards .chip.bad { color: var(--bad); }
.story-rewards .chip.warn { color: var(--warn); }
.route-card { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; background: #1c1f24; }
.route-card.open { border-color: var(--accent); }
.route-card.chosen { border-color: var(--good); }
.route-card h4 { margin: 0 0 4px; }
.route-card ul { margin: 4px 0 6px; padding-left: 18px; font-size: 12px; }
.route-card li.ok { color: var(--good); }
.route-card li.no { color: var(--dim); }
.doc-view { display: flex; gap: 12px; padding: 12px 14px 14px; }
.doc-list { width: 190px; flex: none; display: flex; flex-direction: column; gap: 4px; max-height: 380px; overflow: auto; }
.doc-list button { text-align: left; padding: 5px 8px; font-size: 12px; }
.doc-list button.on { border-color: var(--accent); color: var(--accent); }
.doc-page { flex: 1; min-height: 220px; padding: 14px 18px; border-radius: 6px; background: linear-gradient(180deg,#efe4c8,#dccb9f); color: #2b2418; box-shadow: inset 0 0 24px rgba(90,70,30,.25); }
.doc-page h3 { margin: 0 0 10px; font-size: 16px; }
.doc-page p { margin: 0; line-height: 1.75; white-space: pre-line; font-family: Georgia, 'Songti SC', serif; }
`;

function injectCss() {
  if (document.getElementById('story-event-css')) return;
  document.head.appendChild(h('style', { id: 'story-event-css' }, CSS));
}

const L = (en, zh) => pickLang({ en, zh });

function chip(text, cls = '') {
  return h('span', { class: `chip ${cls}` }, text);
}

function rewardChips(state, rewards) {
  const stat = (k) => tr(`stat.${k}`);
  const out = [];
  for (const r of rewards) {
    switch (r.kind) {
      case 'stat':
        out.push(chip(`${stat(r.key)} ${r.value > 0 ? '+' : ''}${r.value}`, r.value > 0 ? 'good' : 'bad'));
        break;
      case 'max':
        out.push(chip(`${L('Max', '上限')} ${stat(r.key)} +${r.value}`, 'warn'));
        break;
      case 'item':
        out.push(chip(`+${r.n}× ${itemName(r.id)}`, 'good'));
        break;
      case 'take':
        out.push(chip(`−${r.n}× ${itemName(r.id)}`, 'bad'));
        break;
      case 'food':
        out.push(chip(L(`Food −${r.n} Satiety`, `食物 −${r.n}饱腹`), 'bad'));
        break;
      case 'medicine':
        out.push(chip(L(`Medicine −${r.n}`, `药品 −${r.n}`), 'bad'));
        break;
      case 'fuel':
        out.push(chip(L(`Fuel −${r.n}`, `燃料 −${r.n}`), 'bad'));
        break;
      case 'points':
        out.push(chip(`${tr('stat.points')} +${r.n}`, 'good'));
        break;
      case 'effect':
        out.push(chip(pickLang(EFFECTS[r.id]?.name || { en: r.id, zh: r.id }), EFFECTS[r.id]?.bad ? 'bad' : 'good'));
        break;
      case 'quest':
        out.push(chip(`${L('New objective', '新目标')}: ${pickLang(questTitle(state, r.id))}`, 'warn'));
        break;
      case 'recipes':
        out.push(chip(L(`${r.ids.length} new recipe(s)`, `解锁${r.ids.length}个配方`), 'good'));
        break;
      case 'door':
        out.push(chip(L(`Front door ${r.value}`, `大门耐久 ${r.value}`), 'bad'));
        break;
      case 'kills':
        out.push(chip(L(`Kills +${r.n}`, `击杀 +${r.n}`), 'good'));
        break;
      default:
        break;
    }
  }
  return out;
}

function sceneFor(image) {
  return SCENES[image] || { bg: SCENES.house.bg, art: image || '📓' };
}

const clueDocument = (eventId) => (eventId.startsWith('clue_') ? Number(eventId.slice(5)) : null);

registerPanel('event', () => {
  const state = game.state;
  if (!state || !activeEvent(state) || isOpen('event')) return;
  injectCss();
  const first = eventView(state);
  let result = null;
  let timer = null;
  const choose = (index) => {
    if (result) return;
    result = resolveEvent(state, index);
    clearInterval(timer);
    win.refresh();
  };
  const win = openWindow('event', {
    title: pickLang(first.title),
    width: 560,
    modal: true,
    className: 'story-event',
    onClose: () => {
      clearInterval(timer);
      if (!result && activeEvent(state)?.id === first.id) resolveEvent(state, null);
      state.ui.modalPause = false;
      setTimeout(() => game.state === state && presentNext(state), 0);
    },
    build: (body) => {
      const view = (!result && eventView(state)) || first;
      const scene = sceneFor(view.image);
      body.appendChild(h('div', { class: 'story-art', style: { background: scene.bg } }, scene.art));
      const inner = h('div', { class: 'story-body' }, h('p', { class: 'story-p' }, pickLang(view.text)));
      if (!result) {
        state.ui.modalPause = true;
        if (view.countdown && view.left != null) {
          inner.appendChild(h('div', { class: 'story-count' }, L(`The default choice is taken in ${Math.ceil(view.left)} s`, `${Math.ceil(view.left)}秒后自动选择默认选项`)));
          inner.appendChild(bar(view.left, view.countdown, 'hp'));
        }
        inner.appendChild(
          h(
            'div',
            { class: 'choices' },
            ...view.choices.map((c) =>
              h(
                'button',
                { class: c.isDefault ? 'primary' : '', disabled: c.ok ? null : true, onclick: () => choose(c.index) },
                pickLang(c.label),
                c.isDefault ? h('span', { class: 'dflt' }, L('(default)', '（默认）')) : null,
                c.ok ? null : h('span', { class: 'why' }, c.reason)
              )
            )
          )
        );
      } else {
        if (result.text) inner.appendChild(h('p', { class: 'story-p' }, pickLang(result.text)));
        for (const note of result.notes) inner.appendChild(h('p', { class: 'story-p warn' }, pickLang(note)));
        if (result.auto) inner.appendChild(h('p', { class: 'dim' }, L('Time ran out — the default choice was taken.', '时间到了——已自动选择默认选项。')));
        const chips = rewardChips(state, result.rewards);
        if (chips.length) inner.appendChild(h('div', { class: 'story-rewards' }, ...chips));
        const doc = clueDocument(first.id);
        const readAll = () => {
          closeWindow('event');
          openPanel('document', { id: doc });
        };
        inner.appendChild(
          h(
            'div',
            { class: 'row' },
            h('button', { class: 'primary', onclick: () => closeWindow('event') }, L('Continue', '继续')),
            doc ? h('button', { onclick: readAll }, `📄 ${L('Documents', '文件')}`) : null
          )
        );
      }
      body.appendChild(inner);
    },
  });
  // Once a second: keep the world paused (another modal may have cleared the flag) and run the countdown.
  timer = setInterval(() => {
    if (result || game.state !== state || !isOpen('event')) return clearInterval(timer);
    state.ui.modalPause = true;
    if (!first.countdown || topModalId() !== 'event') return;
    const r = tickEventCountdown(state, 1);
    if (r) {
      result = r;
      clearInterval(timer);
    }
    win.refresh();
  }, 1000);
});

// "My Choice": every route of this character with its prerequisites and the commit button.
registerPanel('routes', () => {
  const state = game.state;
  if (!state?.story) return;
  injectCss();
  openWindow('routes', {
    title: L('My Choice — Ending Paths', '我的选择——结局路线'),
    width: 580,
    build: (body) => {
      const st = state.story;
      const day = currentDay(state);
      const kit = hasItems(state, [[KIT_ITEM, 1]]);
      const intro = st.route
        ? L(`You staked the rest of your days on “${ROUTES[st.route].name.en}”.`, `你把余下的日子押在了「${ROUTES[st.route].name.zh}」上。`)
        : day > COMMIT_DEADLINE_DAY
          ? L('The deadline has passed. Hold on until Day 101.', '期限已过。坚持到第101天吧。')
          : L(
              `Use the Military Repair Kit on the device of one path before the end of Day ${COMMIT_DEADLINE_DAY}. ${kit ? 'You have the kit.' : 'You do not have the kit yet — the horde around Day 66 carries one.'}`,
              `在第${COMMIT_DEADLINE_DAY}天结束前，对其中一条路线的设备使用军用维修套件。${kit ? '你手上有套件。' : '你还没有套件——第66天左右的尸潮会带来一套。'}`
            );
      body.appendChild(h('p', { class: 'dim' }, intro));
      for (const id of ROUTE_ORDER) {
        const r = ROUTES[id];
        const s = routeStatus(state, id);
        if (s.locked) continue;
        const can = canCommit(state, id);
        const chosen = st.route === id;
        body.appendChild(
          h(
            'div',
            { class: `route-card ${chosen ? 'chosen' : s.ok ? 'open' : ''}` },
            h('h4', {}, pickLang(r.name), h('span', { class: 'dim' }, ` · ${pickLang(r.deviceName)}`)),
            h('div', { class: 'dim' }, pickLang(r.pitch)),
            h('ul', {}, ...s.lines.map((l) => h('li', { class: l.ok ? 'ok' : 'no' }, `${l.ok ? '✔' : '✘'} ${pickLang(l.text)}`))),
            chosen
              ? h('b', { class: 'good' }, L('Chosen', '已选择'))
              : st.route
                ? null
                : h(
                    'div',
                    { class: 'row', style: { alignItems: 'center' } },
                    h('button', { class: can === true ? 'primary' : '', disabled: can === true ? null : true, onclick: () => openPanel('commitConfirm', { route: id }) }, pickLang(r.promise)),
                    can === true ? null : h('span', { class: 'dim' }, can)
                  )
          )
        );
      }
    },
  });
});

registerPanel('commitConfirm', ({ route }) => {
  const state = game.state;
  const r = ROUTES[route];
  if (!state || !r) return;
  injectCss();
  openWindow('commitConfirm', {
    title: pickLang(r.promise),
    width: 440,
    modal: true,
    build: (body) => {
      body.appendChild(h('p', { class: 'story-p' }, pickLang(r.pitch)));
      body.appendChild(
        h('p', { class: 'story-p warn' }, L('The kit has parts for exactly one device. Once fitted it cannot be taken out, and this save can never choose another path.', '套件只够改装一台设备。装上就拆不下来，这个存档也再不能选择别的路线。'))
      );
      body.appendChild(
        h(
          'div',
          { class: 'row' },
          h('button', { onclick: () => closeWindow('commitConfirm') }, tr('menu.cancel')),
          h(
            'button',
            {
              class: 'primary',
              onclick: () => {
                const a = startCommit(state, route);
                closeWindow('commitConfirm');
                closeWindow('routes');
                if (a) toast(`${pickLang(r.promise)} → ${pickLang(r.deviceName)}`, 'good');
              },
            },
            tr('menu.confirm')
          )
        )
      );
    },
  });
});

// A save may be closed while an event is on screen: show it again when the run resumes.
on('enterGame', () => {
  const state = game.state;
  if (state && activeEvent(state)) setTimeout(() => openPanel('event'), 0);
});

// ------------------------------------------------------------------------------------ documents
function documentBody(id) {
  const text = documentText(id);
  if (text) return pickLang(text);
  const cfg = item(id);
  return [loc(cfg?.d1), loc(cfg?.d2)].filter(Boolean).join('\n');
}

// One document on parchment, with every document read this loop listed beside it for re-reading.
registerPanel('document', ({ id = null } = {}) => {
  const state = game.state;
  if (!state) return;
  injectCss();
  let current = id ?? documentList(state).at(-1) ?? null;
  const scene = SCENES.document;
  openWindow('document', {
    title: L('Documents', '文件'),
    width: 640,
    className: 'story-event',
    onClose: () => releasePause(state, 'document'),
    build: (body, win) => {
      const docs = documentList(state);
      if (current != null && !docs.includes(current)) docs.push(current);
      body.appendChild(h('div', { class: 'story-art', style: { background: scene.bg, height: '84px', fontSize: '40px' } }, scene.art));
      if (current == null) {
        body.appendChild(h('div', { class: 'story-body dim' }, L('Nothing read yet. Clues, notes and papers you read this loop are kept here.', '还没有读过任何文件。本轮读过的线索、便条和文件都会收在这里。')));
        return;
      }
      const pick = (d) => {
        current = d;
        win.refresh();
      };
      body.appendChild(
        h(
          'div',
          { class: 'doc-view' },
          h(
            'div',
            { class: 'doc-list' },
            h('div', { class: 'dim' }, L(`Read this loop (${docs.length})`, `本轮读过（${docs.length}）`)),
            ...docs.map((d) => h('button', { class: d === current ? 'on' : '', onclick: () => pick(d) }, itemName(d)))
          ),
          h('div', { class: 'doc-page' }, h('h3', {}, itemName(current)), h('p', {}, documentBody(current)))
        )
      );
    },
  });
  holdPause(state, 'document');
});

// Reading a document from an inventory (sim/itemuse.js readBook) opens it here once the tick is done.
on('document', ({ id } = {}) => {
  if (game.state) setTimeout(() => game.state && openPanel('document', { id }), 0);
});

registerToolbarButton({
  label: () => `📄 ${L('Documents', '文件')}`,
  key: '',
  panel: 'document',
  visible: (s) => documentList(s).length > 0,
});
