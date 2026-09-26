// Full-screen ending (P05–P15): illustration and text, the Safehouse Snapshot (one photo per floor plus how
// many people the house can feed and how big a horde it can take), the survival record with challenge
// endings, and the after-credits choices: Refusing to Take a Bow, Rebirth, Main Menu.
import { h, clear, closeAllWindows, toast } from './dom.js';
import { game, saveRun } from '../game.js';
import { on, emit } from '../engine/bus.js';
import { pickLang, tr } from '../engine/i18n.js';
import { IsoRenderer, TW, TH } from '../render/iso.js';
import { homeView } from './view.js';
import { homeDef, homeFloors } from '../sim/home.js';
import { ENDINGS } from '../content/endings.js';
import { SCENES } from '../content/events.js';
import { CHARACTERS } from '../content/characters.js';
import { safehouseTally, survivalScore, challengeResults, continueAfterEnding } from '../sim/endings.js';
import { titleScreen } from './menus.js';
import { KEY_STATS } from './deathScreen.js';
import { COUNTER_LABELS } from '../sim/settlement.js';

const CSS = `
body.ending-open .toasts { top: auto; bottom: 24px; }
.ending-screen { position: absolute; inset: 0; z-index: 25; overflow: auto; background: radial-gradient(ellipse at 50% 0%, #2a241a 0%, #0d0f12 70%); display: flex; flex-direction: column; align-items: center; padding: 24px 16px 40px; gap: 14px; }
.ending-nav { display: flex; gap: 6px; }
.ending-nav button.on { border-color: var(--accent); color: var(--accent); }
.ending-card { width: min(860px, 96vw); background: var(--panel); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; box-shadow: 0 16px 60px rgba(0,0,0,.6); }
.ending-art { height: 230px; display: flex; align-items: center; justify-content: center; font-size: 110px; position: relative; text-shadow: 0 10px 40px rgba(0,0,0,.6); }
.ending-art::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, transparent 55%, rgba(18,20,23,.95)); }
.ending-head { padding: 0 24px; margin-top: -54px; position: relative; }
.ending-head h1 { margin: 0; font-size: 34px; letter-spacing: 1px; }
.ending-head .sub { color: var(--accent); margin-top: 2px; }
.ending-text { padding: 12px 24px 20px; line-height: 1.75; font-size: 15px; white-space: pre-line; }
.ending-pad { padding: 16px 20px 20px; }
.snap-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
.snap { background: #15171a; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.snap img { width: 100%; display: block; }
.snap .cap { padding: 4px 8px; font-size: 12px; color: var(--dim); }
.tally { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; margin-top: 12px; }
.tally .box { background: #1c1f24; border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; }
.tally .big { font-size: 26px; color: var(--accent); }
.score-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.score-table td { padding: 4px 6px; border-bottom: 1px solid #2a2e34; }
.score-table td.num { text-align: right; }
.score-total { display: flex; align-items: baseline; gap: 12px; margin: 10px 0; }
.score-total .grade { font-size: 40px; color: var(--accent); }
.challenge-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 6px; }
.challenge-list .c { padding: 6px 8px; border-radius: 6px; background: #1c1f24; font-size: 12px; }
.challenge-list .c.held { border-left: 3px solid var(--good); }
.challenge-list .c.lost { border-left: 3px solid #444; color: var(--dim); }
.ending-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 16px; }
`;

const L = (en, zh) => pickLang({ en, zh });
const FLOOR_ORDER = ['2F', '1F', 'B1'];
const TIER = {
  small: { en: 'a small pack', zh: '小股尸群' },
  medium: { en: 'a mid-sized horde', zh: '中等规模的尸潮' },
  large: { en: 'a large horde', zh: '大规模尸潮' },
  massive: { en: 'a massive horde', zh: '超大规模尸潮' },
};
const ROW_LABEL = {
  days: { en: 'Days survived', zh: '生存天数' },
  kills: { en: 'Zombies killed', zh: '击杀丧尸' },
  trades: { en: 'Trades', zh: '交易次数' },
  proficiency: { en: 'Proficiency levels', zh: '熟练度等级' },
  challenges: { en: 'Challenge endings', zh: '挑战结局' },
  sustain: { en: 'People the house can feed for a day', zh: '安全屋可供养人数（一天）' },
  strength: { en: 'Barrier strength', zh: '防御强度' },
};

let overlay = null;

function injectCss() {
  if (document.getElementById('ending-css')) return;
  document.head.appendChild(h('style', { id: 'ending-css' }, CSS));
}

function closeEnding() {
  overlay?.remove();
  overlay = null;
  document.body.classList.remove('ending-open');
}

// Freeze-frame one floor with an offscreen renderer (lit as a daytime photo, no weather particles).
function snapshotFloor(state, floorId) {
  const fl = homeFloors(state.home.id)[floorId];
  const canvas = document.createElement('canvas');
  canvas.width = 520;
  canvas.height = 320;
  const renderer = new IsoRenderer(canvas);
  renderer.dpr = 1;
  const prevFloor = state.ui.viewFloor;
  const prevPlanning = state.ui.planning;
  let view;
  try {
    state.ui.viewFloor = floorId;
    state.ui.planning = false;
    view = homeView(state);
  } finally {
    state.ui.viewFloor = prevFloor;
    state.ui.planning = prevPlanning;
  }
  const span = fl.w + fl.h;
  const width = (span * TW) / 2;
  const height = (span * TH) / 2 + 70;
  renderer.cam.zoom = Math.min(canvas.width / width, canvas.height / height) * 0.94;
  renderer.cam.x = ((fl.w - fl.h) * TW) / 4;
  renderer.cam.y = (span * TH) / 4 - 30;
  renderer.draw({ ...view, weather: null, indoorDark: false, clock: { ...state.clock, startHour: 12, t: 0 }, bg: '#15171a' });
  return canvas.toDataURL('image/png');
}

function snapshots(state) {
  const def = homeDef(state.home.id);
  return FLOOR_ORDER.filter((f) => def.floors[f]).map((f) => {
    let src = null;
    try {
      src = snapshotFloor(state, f);
    } catch (err) {
      console.error('snapshot failed', err);
    }
    return { floor: f, label: def.floors[f].label, locked: !state.home.unlocked[f], src };
  });
}

function showEnding(state, id, startPage = 0) {
  const def = ENDINGS[id];
  if (!def) return;
  injectCss();
  closeEnding();
  const shots = snapshots(state);
  const tally = safehouseTally(state);
  const score = survivalScore(state);
  const challenges = challengeResults(state);
  const scene = SCENES[def.scene] || SCENES.dawn;
  const character = CHARACTERS[state.meta.character];
  const day = state.run.endingDay ?? '?';
  let page = startPage;

  const endingPage = () =>
    h(
      'div',
      { class: 'ending-card' },
      h('div', { class: 'ending-art', style: { background: scene.bg } }, def.art),
      h(
        'div',
        { class: 'ending-head' },
        h('div', { class: 'dim' }, `${L('Ending', '结局')} · ${pickLang(character?.name)} · ${tr('time.day', { n: day })}`),
        h('h1', {}, pickLang(def.title)),
        h('div', { class: 'sub' }, pickLang(def.subtitle))
      ),
      h('div', { class: 'ending-text' }, pickLang(def.text), def.byChar?.[state.meta.character] ? `\n\n${pickLang(def.byChar[state.meta.character])}` : ''),
      h('div', { class: 'ending-actions', style: { paddingBottom: '18px' } }, h('button', { class: 'primary', onclick: () => go(1) }, L('Safehouse Snapshot →', '安全屋快照 →')))
    );

  const snapshotPage = () =>
    h(
      'div',
      { class: 'ending-card' },
      h(
        'div',
        { class: 'ending-pad' },
        h('h2', { style: { marginTop: 0 } }, L('Safehouse Snapshot', '安全屋快照')),
        h('div', { class: 'dim' }, L('Your home, the moment the story ended.', '故事结束那一刻的家。')),
        h(
          'div',
          { class: 'snap-grid', style: { marginTop: '10px' } },
          ...shots.map((s) =>
            h(
              'div',
              { class: 'snap' },
              s.src ? h('img', { src: s.src, alt: pickLang(s.label) }) : h('div', { class: 'cap' }, '—'),
              h('div', { class: 'cap' }, `${s.floor} · ${pickLang(s.label)}${s.locked ? ` · ${L('never opened', '从未解锁')}` : ''}`)
            )
          )
        ),
        h(
          'div',
          { class: 'tally' },
          h(
            'div',
            { class: 'box' },
            h('div', { class: 'dim' }, L('Food stores', '食物储备')),
            h('div', { class: 'big' }, String(tally.people)),
            h('div', {}, L(`people could eat for a day on the ${tally.satiety} Satiety stored here.`, `个人可以靠这里储存的${tally.satiety}点饱腹度撑过一天。`))
          ),
          h(
            'div',
            { class: 'box' },
            h('div', { class: 'dim' }, L('Barriers', '防线')),
            h('div', { class: 'big' }, `≈ ${tally.zombies}`),
            h(
              'div',
              {},
              L(
                `zombies — ${pickLang(TIER[tally.tier])}. Doors and windows ${tally.openingHp}, defenses ${tally.defenseHp} (${tally.defenses} placed).`,
                `只丧尸——${pickLang(TIER[tally.tier])}。门窗耐久${tally.openingHp}，防御设施${tally.defenseHp}（共${tally.defenses}个）。`
              )
            )
          )
        ),
        h('div', { class: 'ending-actions' }, h('button', { onclick: () => go(0) }, L('← Back', '← 返回')), h('button', { class: 'primary', onclick: () => go(2) }, L('Survival Record →', '生存记录 →')))
      )
    );

  const recordPage = () =>
    h(
      'div',
      { class: 'ending-card' },
      h(
        'div',
        { class: 'ending-pad' },
        h('h2', { style: { marginTop: 0 } }, L('Survival Record', '生存记录')),
        h(
          'table',
          { class: 'score-table' },
          ...score.rows.map((r) => h('tr', {}, h('td', {}, pickLang(ROW_LABEL[r.key])), h('td', { class: 'num' }, String(r.value)), h('td', { class: 'num dim' }, `+${r.points}`)))
        ),
        h('div', { class: 'score-total' }, h('span', { class: 'grade' }, score.grade), h('span', {}, L(`Score ${score.total}`, `评分 ${score.total}`))),
        h('h3', {}, L('Run Statistics', '本轮统计')),
        h(
          'table',
          { class: 'score-table' },
          ...KEY_STATS.map((k) => h('tr', {}, h('td', {}, pickLang(COUNTER_LABELS[k] || { en: k, zh: k })), h('td', { class: 'num' }, String(Math.round(state.progress.counters[k] || 0)))))
        ),
        h('h3', {}, L('Challenge Endings Achieved This Run', '本轮达成的挑战结局')),
        h(
          'div',
          { class: 'challenge-list' },
          ...challenges.map((c) => h('div', { class: `c ${c.held ? 'held' : 'lost'}` }, h('b', {}, `${c.held ? '✔' : '✘'} ${pickLang(c.name)}`), h('div', { class: 'dim' }, pickLang(c.desc))))
        ),
        h(
          'div',
          { class: 'ending-actions' },
          h('button', { onclick: () => go(1) }, L('← Back', '← 返回')),
          h('button', { class: 'primary', dataset: { tip: L('Keep holding the house after the credits (Story Endless).', '结局之后继续坚守（剧情无尽）。') }, onclick: () => refuseBow(state) }, L('Refusing to Take a Bow', '不肯谢幕')),
          h('button', { onclick: () => rebirth(state) }, L('Rebirth / New Loop', '重生 / 新的轮回')),
          h('button', { onclick: () => mainMenu() }, L('Main Menu', '主菜单'))
        )
      )
    );

  const pages = [endingPage, snapshotPage, recordPage];
  const titles = [L('Ending', '结局'), L('Safehouse Snapshot', '安全屋快照'), L('Survival Record', '生存记录')];
  overlay = h('div', { class: 'ending-screen' });
  (document.getElementById('overlay') || document.body).appendChild(overlay);
  document.body.classList.add('ending-open');
  function go(i) {
    page = i;
    clear(overlay);
    overlay.appendChild(h('div', { class: 'ending-nav' }, ...titles.map((t, j) => h('button', { class: j === page ? 'on' : '', onclick: () => go(j) }, t))));
    overlay.appendChild(pages[page]());
    overlay.scrollTop = 0;
  }
  go(page);
}

function refuseBow(state) {
  if (!continueAfterEnding(state)) return;
  closeEnding();
  saveRun();
  toast(L('Story Endless: the house holds on.', '剧情无尽：继续坚守。'), 'good');
}

function rebirth(state) {
  saveRun();
  closeEnding();
  emit('requestRebirth', { fromEnding: true, ending: state.run.ending });
  setTimeout(() => {
    if (game.state === state && state.phase === 'ending' && !document.querySelector('.screen, .modal-back')) {
      toast(L('Rebirth is not available right now.', '暂时无法重生。'), 'bad');
      showEnding(state, state.run.ending, 2);
    }
  }, 500);
}

function mainMenu() {
  saveRun();
  closeEnding();
  closeAllWindows();
  game.state = null;
  emit('leaveGame', {});
  titleScreen();
}

on('ending', ({ id }) => {
  const state = game.state;
  if (state?.run?.ending === id) showEnding(state, id);
});

on('runStarted', ({ state }) => {
  closeEnding();
  if (state?.phase === 'ending' && state.run?.ending) setTimeout(() => game.state === state && showEnding(state, state.run.ending), 0);
});

on('leaveGame', () => closeEnding());
