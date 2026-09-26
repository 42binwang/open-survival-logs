// Title screen, new game setup, load, settings, pause menu.
import { h, clear, openWindow, closeWindow, toast, closeAllWindows } from './dom.js';
import { game, startRun, loadRun, saveRun, applySettings, DEFAULT_SETTINGS } from '../game.js';
import { tr, pickLang, getLang } from '../engine/i18n.js';
import { CHARACTERS, CHARACTER_ORDER } from '../content/characters.js';
import { DIFFICULTIES, CUSTOM_RANGES } from '../content/difficulty.js';
import { listSaves, deleteGame, exportSave, importSave } from '../engine/save.js';
import { registerPanel, openPanel } from './panels.js';
import { emit } from '../engine/bus.js';
import { seedRng, nextFloat } from '../engine/rng.js';
import { UPDATE_LOG, GAME_VERSION } from '../content/updateLog.js';
import { SAVE_VERSION } from '../sim/state.js';

// the title-screen radio's line and tilt, from a seeded stream of its own (src/engine/rng.js)
const radioRng = seedRng(0x7ad10);

let screens;
const menuButtons = [];

export function registerMenuButton(b) {
  menuButtons.push(b);
}

export function initMenus(el) {
  screens = el;
}

export function showScreen(node) {
  clear(screens);
  if (node) screens.appendChild(node);
}

// Main-menu scene elements that react to clicks (patches 08-21 "some scene elements are now interactive" and
// 09-02 "a new interactive detail"; 08-17 reworked the menu's lighting).
const CALENDAR_PAGES = [
  () => ({ en: 'Circled in red: today, 18:00.', zh: '用红笔圈着：今天18:00。' }),
  () => ({ en: 'Scribbled underneath: water, cans, batteries, a better lock.', zh: '下面潦草地写着：水、罐头、电池、换把好锁。' }),
  () => {
    const n = game.history.profile?.runs || 0;
    return n ? { en: `Tally marks on the back of the page: ${n}.`, zh: `这一页背面画着${n}道记号。` } : { en: 'The back of the page is still blank.', zh: '这一页的背面还是空白的。' };
  },
  () => ({ en: 'You tear the page off. The one underneath shows the same date.', zh: '你撕下这一页，下面那页还是同一天。' }),
];
const CAT_LINES = [
  { en: 'Mrrp?', zh: '喵？' },
  { en: 'The cat headbutts the glass.', zh: '猫用脑袋蹭了蹭玻璃。' },
  { en: 'Purrr… it curls up on the windowsill.', zh: '呼噜噜……它在窗台上蜷成了一团。' },
  { en: 'Shh. It is asleep.', zh: '嘘，它睡着了。' },
];
const titleProps = { lampOff: false, page: 0, pets: 0 };

function titleProp(glyph, tip, style, onclick, extra = '') {
  return h('div', { class: `title-prop ${extra}`, style, dataset: { tip: pickLang(tip) }, onclick }, glyph);
}

export function titleScreen() {
  const saves = listSaves().filter((s) => !s.corrupt);
  const newVersion = game.history.seenVersion !== GAME_VERSION;
  const langBtn = h(
    'button',
    {
      style: { position: 'absolute', top: '14px', right: '14px' },
      onclick: () => {
        applySettings({ lang: getLang() === 'en' ? 'zh' : 'en' });
        titleScreen();
      },
    },
    getLang() === 'en' ? '中文' : 'English'
  );
  const radio = titleProp('📻', { en: 'The radio on the shelf', zh: '架子上的收音机' }, { bottom: '18px', left: '18px' }, (e) => {
    const lines = [
      { en: '…static… "Stay indoors. This is not a drill." …static…', zh: '……沙沙……“请待在室内，这不是演习。”……沙沙……' },
      { en: '…a song you almost remember…', zh: '……一首似曾相识的歌……' },
      { en: '"Day 101. If anyone can hear this—"', zh: '“第101天。如果有人能听到——”' },
    ];
    toast(pickLang(lines[Math.floor(nextFloat(radioRng) * lines.length)]));
    e.currentTarget.style.transform = `rotate(${nextFloat(radioRng) * 30 - 15}deg)`;
  });
  const lamp = titleProp('💡', { en: 'The desk lamp', zh: '台灯' }, { bottom: '18px', left: '66px' }, () => {
    titleProps.lampOff = !titleProps.lampOff;
    screen.classList.toggle('lamp-off', titleProps.lampOff);
    toast(pickLang(titleProps.lampOff ? { en: 'Click. Better that nobody out there sees a light.', zh: '咔哒。最好别让外面的人看见灯光。' } : { en: 'The bulb flickers back on.', zh: '灯泡闪了几下，又亮了。' }));
  }, 'lamp');
  const calendar = titleProp('📅', { en: 'The calendar on the wall', zh: '墙上的日历' }, { top: '16px', left: '18px' }, (e) => {
    toast(pickLang(CALENDAR_PAGES[titleProps.page % CALENDAR_PAGES.length]()));
    titleProps.page++;
    e.currentTarget.style.transform = `rotate(${titleProps.page % 2 ? -8 : 8}deg)`;
  });
  const asleep = () => titleProps.pets >= CAT_LINES.length - 1;
  const cat = titleProp(asleep() ? '🐈💤' : '🐈', { en: 'A cat at the window', zh: '窗边的猫' }, { bottom: '18px', right: '18px' }, (e) => {
    toast(pickLang(CAT_LINES[Math.min(titleProps.pets, CAT_LINES.length - 1)]));
    titleProps.pets++;
    const el = e.currentTarget;
    el.textContent = asleep() ? '🐈💤' : '🐈';
    el.style.transform = asleep() ? '' : `translateY(-${4 + titleProps.pets * 3}px)`;
  });
  const screen = h(
    'div',
    { class: `screen ${titleProps.lampOff ? 'lamp-off' : ''}` },
    langBtn,
    calendar,
    radio,
    lamp,
    cat,
    h('div', { class: 'title-logo' }, tr('game.title')),
    h('div', { class: 'title-sub' }, tr('game.tagline')),
    h(
      'div',
      { class: 'menu-col' },
      saves.length ? h('button', { class: 'primary', onclick: () => continueGame(saves[0].slot) }, tr('menu.continue')) : null,
      h('button', { class: saves.length ? '' : 'primary', onclick: () => newGameScreen() }, tr('menu.new')),
      h('button', { onclick: () => loadScreen() }, tr('menu.load')),
      ...menuButtons.map((b) => h('button', { onclick: b.run }, b.label(), b.dot?.() ? ' ●' : '')),
      h('button', { onclick: () => settingsWindow() }, tr('menu.settings')),
      h(
        'button',
        {
          onclick: () => {
            game.history.seenVersion = GAME_VERSION;
            updateLogWindow();
          },
        },
        tr('menu.updateLog'),
        newVersion ? h('span', { class: 'bad' }, ' ●') : null
      )
    ),
    h('div', { class: 'dim', style: { marginTop: '20px', fontSize: '11px' } }, `v${GAME_VERSION} · ${pickLang({ en: 'A fan-made browser recreation. Single player.', zh: '粉丝自制的网页复刻版，单人游戏。' })}`)
  );
  showScreen(screen);
}

function continueGame(slot) {
  const summary = listSaves().find((s) => s.slot === slot);
  const go = () => {
    if (!loadRun(slot)) {
      toast(pickLang({ en: 'Save is corrupted and no backup could be read.', zh: '存档已损坏，且无法读取备份。' }), 'bad');
      return;
    }
    showScreen(null);
    emit('enterGame', {});
  };
  if (summary?.version != null && summary.version !== SAVE_VERSION) {
    openWindow('legacy', {
      title: pickLang({ en: 'Old save', zh: '旧版存档' }),
      width: 380,
      modal: true,
      build: (body) => {
        body.appendChild(h('div', {}, pickLang({ en: 'This save was made with a different version. Loading it may cause data anomalies.', zh: '该存档来自其他版本，直接读取可能导致数据异常。' })));
        body.appendChild(h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { onclick: () => closeWindow('legacy') }, tr('menu.cancel')), h('button', { class: 'primary', onclick: () => (closeWindow('legacy'), go()) }, tr('menu.confirm'))));
      },
    });
    return;
  }
  go();
}

export function newGameScreen(opts = {}) {
  let charSel = opts.character || 'wage';
  let diff = 'normal';
  const custom = {};
  let skip = game.settings.skipPrologue;
  const render = () => {
    const unlocked = game.history.characters;
    const cards = CHARACTER_ORDER.map((id) => {
      const c = CHARACTERS[id];
      const locked = !unlocked[id];
      return h(
        'div',
        {
          class: `charcard ${charSel === id ? 'sel' : ''} ${locked ? 'locked' : ''}`,
          onclick: () => {
            if (locked) return toast(pickLang(c.unlockHint || { en: 'Locked', zh: '未解锁' }), 'bad');
            charSel = id;
            render();
          },
        },
        h('div', { class: 'charportrait', style: { background: `linear-gradient(135deg, ${c.color}55, #1c1f24)` } }, { wage: '👔', student: '🎓', warehouse: '📦' }[id]),
        h('h3', {}, pickLang(c.name), locked ? h('span', { class: 'dim' }, ` · ${tr('menu.locked')}`) : null),
        h('div', { class: 'dim' }, pickLang(c.blurb)),
        h('div', { class: 'warn' }, pickLang(c.defenseLine)),
        h('div', {}, `${tr('stat.money')}: $${c.startMoney}`),
        locked ? h('div', { class: 'bad' }, pickLang(c.unlockHint)) : null,
        game.history.endless?.best?.[id] ? h('div', { class: 'dim' }, pickLang({ en: `Longest survival: ${game.history.endless.best[id]} days`, zh: `最长生存：${game.history.endless.best[id]}天` })) : null
      );
    });
    const diffBtns = Object.entries(DIFFICULTIES).map(([id, d]) =>
      h('button', { class: diff === id ? 'primary' : '', dataset: { tip: pickLang(d.desc) }, onclick: () => ((diff = id), render()) }, pickLang(d.name))
    );
    diffBtns.push(h('button', { class: diff === 'custom' ? 'primary' : '', onclick: () => ((diff = 'custom'), render()) }, tr('menu.custom')));
    const customRows =
      diff === 'custom'
        ? Object.entries(CUSTOM_RANGES).map(([k, r]) => {
            const base = DIFFICULTIES.normal[k];
            const val = custom[k] ?? base;
            return h(
              'div',
              { class: 'row', style: { alignItems: 'center' } },
              h('span', { style: { width: '200px' } }, pickLang(r.label)),
              h('input', {
                type: 'range',
                min: r.min,
                max: r.max,
                step: r.step,
                value: val,
                oninput: (e) => {
                  custom[k] = Number(e.target.value);
                  e.target.nextSibling.textContent = String(custom[k]);
                },
              }),
              h('span', {}, String(val))
            );
          })
        : [];
    showScreen(
      h(
        'div',
        { class: 'screen' },
        h('h2', {}, tr('menu.chooseCharacter')),
        h('div', { class: 'charcards' }, ...cards),
        h('div', { class: 'row', style: { alignItems: 'center' } }, h('b', {}, `${tr('menu.difficulty')}: `), ...diffBtns),
        ...customRows,
        h(
          'label',
          { class: 'row', style: { alignItems: 'center' } },
          h('input', { type: 'checkbox', checked: skip ? true : null, onchange: (e) => (skip = e.target.checked) }),
          tr('menu.skipPrologue')
        ),
        h(
          'div',
          { class: 'row' },
          h('button', { onclick: () => titleScreen() }, tr('menu.back')),
          h(
            'button',
            {
              class: 'primary',
              onclick: () => {
                applySettings({ skipPrologue: skip });
                startRun({ character: charSel, difficulty: diff === 'custom' ? 'normal' : diff, custom: diff === 'custom' ? custom : null, skipPrologue: skip, loop: opts.loop });
                showScreen(null);
                emit('enterGame', { fresh: true });
              },
            },
            tr('menu.start')
          )
        )
      )
    );
  };
  render();
}

export function loadScreen() {
  const render = () => {
    const saves = listSaves();
    showScreen(
      h(
        'div',
        { class: 'screen' },
        h('h2', {}, tr('menu.load')),
        saves.length === 0 ? h('div', { class: 'dim' }, tr('menu.noSaves')) : null,
        h(
          'div',
          { class: 'list', style: { width: '560px' } },
          ...saves.map((s) =>
            h(
              'div',
              { class: 'list-item' },
              h('span', {}, s.corrupt ? h('span', { class: 'bad' }, pickLang({ en: 'Corrupted save', zh: '存档损坏' })) : `${pickLang(CHARACTERS[s.summary?.character]?.name || { en: '?', zh: '?' })} · ${pickLang({ en: 'Loop', zh: '周目' })} ${s.summary?.cycle ?? 1} · ${s.summary?.phase === 'pre' ? tr('phase.pre') : tr('time.day', { n: s.summary?.day ?? 0 })}`),
              h('span', { class: 'spacer' }),
              h('span', { class: 'dim' }, s.savedAt ? new Date(s.savedAt).toLocaleString() : ''),
              h('button', { disabled: s.corrupt ? true : null, onclick: () => continueGame(s.slot) }, tr('menu.load')),
              h('button', { disabled: s.corrupt ? true : null, title: pickLang({ en: 'Save this slot to a file', zh: '把这个存档保存成文件' }), onclick: () => downloadSave(s.slot) }, pickLang({ en: 'Export', zh: '导出' })),
              h(
                'button',
                {
                  class: 'danger',
                  onclick: () => {
                    deleteGame(s.slot);
                    render();
                  },
                },
                tr('menu.delete')
              )
            )
          )
        ),
        h(
          'div',
          { class: 'row' },
          h(
            'button',
            {
              onclick: () =>
                pickSaveFile((text) => {
                  const slot = importSave(text);
                  toast(slot ? pickLang({ en: 'Save imported.', zh: '存档已导入。' }) : pickLang({ en: 'That file is not a Survival Log save, or it is damaged.', zh: '这不是生存日志的存档文件，或者文件已损坏。' }), slot ? 'good' : 'bad');
                  if (slot) render();
                }),
            },
            pickLang({ en: 'Import save file…', zh: '导入存档文件…' })
          ),
          h('button', { onclick: () => titleScreen() }, tr('menu.back'))
        )
      )
    );
  };
  render();
}

/** Downloads a slot as a save file (the player's own copy, outside the browser's storage). @param {string} slot */
function downloadSave(slot) {
  const text = exportSave(slot);
  if (!text) return;
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = h('a', { href: url, download: `survival-log-${slot}.json` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Asks for a save file and hands its text on. @param {(text: string) => void} done */
function pickSaveFile(done) {
  const input = /** @type {HTMLInputElement} */ (h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } }));
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.remove();
    if (file) file.text().then(done);
  });
  document.body.appendChild(input);
  input.click();
}

const KEY_ACTIONS = [
  ['inventory', 'I'],
  ['phone', 'C'],
  ['map', 'M'],
  ['log', 'L'],
  ['planning', 'N'],
  ['defense', 'D'],
  ['checklist', 'H'],
  ['power', 'P'],
  ['codex', 'K'],
  ['interact', 'E'],
  ['drop', 'Q'],
  ['relax', '`'],
  ['pause', '4'],
  ['speed1', '1'],
  ['speed2', '2'],
  ['speed3', '3'],
  ['recenter', ' '],
  ['rotateLeft', ','],
  ['rotateRight', '.'],
  ['hideSearch', 'Z'],
  ['report', 'F7'],
];

export function keyFor(action) {
  return game.settings.keys?.[action] || KEY_ACTIONS.find(([a]) => a === action)?.[1];
}

// The action bound to a key or mouse side button ('Mouse4' / 'Mouse5'), or null.
export function actionForBinding(binding) {
  return KEY_ACTIONS.find(([a]) => keyFor(a) === binding)?.[0] || null;
}

export function settingsWindow() {
  let waiting = null;
  const win = openWindow('settings', {
    title: tr('menu.settings'),
    width: 560,
    build: (body) => {
      const s = game.settings;
      const row = (label, control) => h('div', { class: 'row', style: { alignItems: 'center', margin: '4px 0' } }, h('span', { style: { width: '210px' } }, label), control);
      body.appendChild(
        row(
          pickLang({ en: 'Language', zh: '语言' }),
          h(
            'select',
            { onchange: (e) => (applySettings({ lang: e.target.value }), win.refresh()) },
            h('option', { value: 'en', selected: s.lang === 'en' ? true : null }, 'English'),
            h('option', { value: 'zh', selected: s.lang === 'zh' ? true : null }, '简体中文')
          )
        )
      );
      body.appendChild(
        row(
          pickLang({ en: 'Frame rate cap', zh: '帧率上限' }),
          h(
            'select',
            {
              onchange: (e) => {
                const v = Number(e.target.value);
                if (v > 60 || v === 0) toast(pickLang({ en: 'High frame rates may make the interface lag on some devices.', zh: '高帧率在部分设备上可能导致界面卡顿。' }));
                applySettings({ fps: v });
              },
            },
            ...[30, 60, 120, 144, 0].map((v) => h('option', { value: v, selected: s.fps === v ? true : null }, v === 0 ? pickLang({ en: 'Unlimited', zh: '不限' }) : String(v)))
          )
        )
      );
      body.appendChild(
        row(
          pickLang({ en: 'Graphics', zh: '画质' }),
          h(
            'select',
            {
              onchange: (e) => {
                applySettings({ graphics: e.target.value });
                // the renderer is chosen at start: save the run and reload to apply
                saveRun();
                toast(pickLang({ en: 'Applying graphics settings…', zh: '正在应用画质设置…' }));
                setTimeout(() => globalThis.location?.reload(), 300);
              },
            },
            ...[
              ['auto', { en: 'Auto', zh: '自动' }],
              ['high', { en: 'High (3D, shadows, ambient occlusion)', zh: '高（3D、阴影、环境光遮蔽）' }],
              ['low', { en: 'Low (3D, lighter effects)', zh: '低（3D、简化特效）' }],
              ['classic', { en: 'Classic 2D', zh: '经典 2D' }],
            ].map(([v, l]) => h('option', { value: v, selected: (s.graphics || 'auto') === v ? true : null }, pickLang(/** @type {any} */ (l))))
          )
        )
      );
      for (const [k, label] of [
        ['volume', { en: 'Master volume', zh: '总音量' }],
        ['music', { en: 'Music', zh: '音乐' }],
        ['sfx', { en: 'Sound effects', zh: '音效' }],
      ]) {
        body.appendChild(row(pickLang(label), h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s[k], oninput: (e) => applySettings({ [k]: Number(e.target.value) }) })));
      }
      body.appendChild(
        row(
          pickLang({ en: 'Display mode', zh: '显示模式' }),
          h(
            'button',
            {
              onclick: () => {
                if (document.fullscreenElement) document.exitFullscreen?.();
                else document.documentElement.requestFullscreen?.();
                setTimeout(() => win.refresh(), 200);
              },
            },
            document.fullscreenElement ? pickLang({ en: 'Windowed', zh: '窗口化' }) : pickLang({ en: 'Borderless fullscreen', zh: '无边框全屏' })
          )
        )
      );
      for (const [k, label] of [
        ['operationTips', { en: 'Operation tips', zh: '操作提示' }],
        ['autoRelax', { en: 'Auto slow-down when idle (Relaxed)', zh: '空闲时自动减速（悠闲）' }],
        ['autonomy', { en: 'Survivor looks after themselves when idle', zh: '空闲时自动照顾自己' }],
        ['lagOptimization', { en: 'Interface lag optimization', zh: '界面卡顿优化' }],
      ]) {
        body.appendChild(row(pickLang(label), h('input', { type: 'checkbox', checked: s[k] ? true : null, onchange: (e) => applySettings({ [k]: e.target.checked }) })));
      }
      body.appendChild(h('div', { class: 'sec-title' }, pickLang({ en: 'Key bindings (click, then press a key or mouse side button)', zh: '按键绑定（点击后按下按键或鼠标侧键）' })));
      body.appendChild(
        h(
          'div',
          { class: 'kv' },
          ...KEY_ACTIONS.flatMap(([a]) => [
            h('span', {}, a),
            h(
              'button',
              {
                onclick: (e) => {
                  waiting = a;
                  e.target.textContent = '…';
                },
              },
              waiting === a ? '…' : keyFor(a) === ' ' ? 'Space' : keyFor(a)
            ),
          ])
        )
      );
      body.appendChild(h('button', { onclick: () => (applySettings({ keys: {} }), win.refresh()) }, pickLang({ en: 'Reset bindings', zh: '恢复默认' })));
      body.appendChild(
        h(
          'div',
          { style: { marginTop: '10px' } },
          h('button', { onclick: () => openPanel('report') }, tr('menu.report'))
        )
      );
    },
  });
  const onKey = (e) => {
    if (!waiting) return;
    e.preventDefault();
    e.stopPropagation();
    applySettings({ keys: { ...game.settings.keys, [waiting]: e.key.length === 1 ? e.key.toUpperCase() : e.key } });
    waiting = null;
    win.refresh();
  };
  const onMouse = (e) => {
    if (!waiting || (e.button !== 3 && e.button !== 4)) return;
    e.preventDefault();
    applySettings({ keys: { ...game.settings.keys, [waiting]: e.button === 3 ? 'Mouse4' : 'Mouse5' } });
    waiting = null;
    win.refresh();
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('mousedown', onMouse, true);
  const prevClose = win.onClose;
  win.onClose = () => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('mousedown', onMouse, true);
    prevClose?.();
  };
}

export function updateLogWindow() {
  openWindow('updatelog', {
    title: tr('menu.updateLog'),
    width: 560,
    build: (body) => {
      for (const e of UPDATE_LOG) {
        body.appendChild(h('div', { class: 'sec-title' }, `${e.version} · ${e.date}`));
        body.appendChild(h('ul', {}, ...e.notes.map((n) => h('li', {}, pickLang(n)))));
      }
    },
  });
}

registerPanel('pause', () => {
  const state = game.state;
  if (!state) return;
  const wasPaused = !!state.ui.modalPause;
  state.ui.modalPause = true;
  openWindow('pause', {
    title: tr('menu.paused'),
    width: 320,
    modal: true,
    onClose: () => {
      state.ui.modalPause = wasPaused;
    },
    build: (body) => {
      body.appendChild(
        h(
          'div',
          { class: 'menu-col', style: { width: '100%' } },
          h('button', { class: 'primary', onclick: () => closeWindow('pause') }, tr('menu.resume')),
          h('button', { onclick: () => (saveRun(), toast(pickLang({ en: 'Saved.', zh: '已保存。' }), 'good')) }, tr('menu.save')),
          h('button', { onclick: () => settingsWindow() }, tr('menu.settings')),
          h('button', { onclick: () => (closeWindow('pause'), openPanel('journal')) }, tr('ui.log')),
          h('button', { onclick: () => (closeWindow('pause'), openPanel('codex')) }, tr('menu.codex')),
          h('button', { onclick: () => (closeWindow('pause'), openPanel('achievements')) }, tr('menu.achievements')),
          h('button', { onclick: () => (closeWindow('pause'), openPanel('profile')) }, tr('menu.profile')),
          h('button', { onclick: () => openPanel('report') }, tr('menu.report')),
          h(
            'button',
            {
              onclick: () => {
                saveRun();
                closeAllWindows();
                state.ui.modalPause = false;
                game.state = null;
                emit('leaveGame', {});
                titleScreen();
              },
            },
            tr('menu.saveQuit')
          )
        )
      );
    },
  });
});

registerPanel('report', () => {
  openWindow('report', {
    title: tr('menu.report'),
    width: 420,
    build: (body) => {
      const ta = h('textarea', { style: { width: '100%', height: '120px', background: '#111', color: '#ddd' }, placeholder: pickLang({ en: 'Describe what happened and how to reproduce it…', zh: '描述问题和复现步骤……' }) });
      body.appendChild(ta);
      body.appendChild(
        h(
          'button',
          {
            class: 'primary',
            onclick: () => {
              const reports = JSON.parse(localStorage.getItem('survivalLog.reports') || '[]');
              reports.push({ at: Date.now(), text: ta.value, day: game.state?.run?.day, phase: game.state?.phase });
              localStorage.setItem('survivalLog.reports', JSON.stringify(reports));
              toast(pickLang({ en: 'Thanks! Report saved locally.', zh: '感谢！反馈已保存在本地。' }), 'good');
              closeWindow('report');
            },
          },
          pickLang({ en: 'Submit', zh: '提交' })
        )
      );
    },
  });
});

export { DEFAULT_SETTINGS };
