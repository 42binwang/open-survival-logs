// @ts-check
// The kit sheet (?view=kit): every component of src/ui/kit in each of its states, over the same backdrop as the tile,
// so the reviewer (and tests/e2e/ui-tile.spec.js) sees and measures them all. States are the .is-* classes, which
// render exactly what the pseudo-classes do.
import { gridElement, slotElement, freshness, formatClock, frame, section as sectionHead, button as kitButton, bar as kitBar } from '../../src/ui/kit/index.js';
import { h, g, iconFor, iconImg, cfg, itemLabel } from './dom.js';

/** @typedef {import('./content.js').Lang} Lang */

/** @type {Lang} */
let lang = 'en';
/** @param {string} en @param {string} zh */
const L = (en, zh) => (lang === 'zh' ? zh : en);

/**
 * @param {string} title
 * @param {string} className
 * @param {...(Node | null)} body
 */
const card = (title, className, ...body) => h('section', { class: `sl-panel sheet-card ${className}` }, h('h2', { class: 'sl-section' }, title), ...body);
/** @param {string} text */
const caption = (text) => h('div', { class: 'sheet-caption' }, text);

// ------------------------------------------------------------------------------------------------------------ type
function typeCard() {
  const rows = [
    ['display 68 / 1.42 · 900', 'sl-t-display', L('DAY7', '第7天')],
    ['heading 28 / 36 · 700', 'sl-t-heading', L('Inventory', '物品')],
    ['title 20 / 28 · 700', 'sl-t-title', L('Confirm Purchase', '确认购买')],
    ['hud label 19 / 26 · 700', 'sl-t-hud-lg', L('Satiety 55/100 · Tactics', '饱腹 55/100 · 战术')],
    ['hud 17 / 24', 'sl-t-hud', L('Eat Beef Noodles · Loop: 1', '吃红烧牛肉面 · 周目：1')],
    ['body 14 / 20', 'sl-t-body', L('An electric microwave that quickly heats ingredients.', '一台能快速加热食材的电动微波炉。')],
    ['caps 14 · 700 · tracked', 'sl-t-caps', L('Cooking Station', '烹饪台')],
    ['mono 14 · tabular', 'sl-t-mono', '0.50kg  [2x2]  06:03'],
    ['clock 32 · mono', 'sheet-clock', formatClock(11, 50)],
  ];
  return card(
    L('Type', '字体'),
    'sheet-type',
    h('div', { class: 'sheet-type__rows' }, rows.map(([spec, cls, sample]) => h('div', { class: 'sheet-type__row' }, h('span', { class: 'sheet-spec' }, spec), h('span', { class: cls }, sample)))),
    caption(L('System stacks until checkpoint 1 decides on Noto Sans / Noto Sans SC: EN leads with Segoe UI / system-ui, ZH with PingFang SC.', '在第 1 检查点决定是否采用 Noto Sans / Noto Sans SC 之前使用系统字体：英文优先 Segoe UI / system-ui，中文优先苹方。'))
  );
}

// ---------------------------------------------------------------------------------------------------------- colour
const SWATCHES = [
  ['ART.md §8', ['--ui-panel', '--ui-text', '--ui-confirm', '--ui-buy', '--ui-stat-good', '--ui-gold', '--ui-objective', '--ui-primary', '--ui-secondary', '--ui-secondary-light', '--ui-danger', '--ui-danger-badge', '--ui-info']],
  [
    'measured',
    ['--ui-text-strong', '--ui-gold-pale', '--ui-gold-deep', '--ui-amber', '--ui-fresh', '--ui-success', '--ui-online', '--ui-xp', '--ui-alert', '--ui-stat-warn', '--ui-cold-cell', '--ui-tag-must', '--ui-grid-line', '--ui-cell-top', '--ui-cell-bottom', '--ui-slot-top', '--ui-slot-bottom', '--ui-track', '--ui-thumb', '--ui-tab-on-bg'],
  ],
  ['derived', ['--ui-text-dim', '--ui-text-faint', '--ui-text-on-light', '--ui-positive', '--ui-chilled', '--ui-tag-must-text', '--ui-danger-text', '--ui-panel-bg']],
  ['decided', ['--ui-stat-sat', '--ui-stat-mor', '--ui-stat-sta', '--ui-stat-life', '--ui-stat-bad', '--ui-expiring', '--ui-panel-solid', '--ui-focus']],
];

function colourCard() {
  const root = getComputedStyle(document.documentElement);
  return card(
    L('Colour tokens', '颜色'),
    'sheet-colour',
    ...SWATCHES.map(([group, names]) =>
      h(
        'div',
        { class: 'sheet-swatches' },
        h('div', { class: 'sheet-swatches__group' }, /** @type {string} */ (group)),
        /** @type {string[]} */ (names).map((name) =>
          h('div', { class: 'sheet-swatch' }, h('span', { class: 'sheet-swatch__chip', style: `background: var(${name})` }), h('span', { class: 'sheet-swatch__name' }, name), h('span', { class: 'sheet-swatch__hex' }, root.getPropertyValue(name).trim()))
        )
      )
    )
  );
}

// --------------------------------------------------------------------------------------------------------- buttons
function buttonsCard() {
  const states = [
    ['', L('Default', '默认')],
    ['is-hover', L('Hover', '悬停')],
    ['is-active', L('Pressed', '按下')],
    ['is-focus', L('Focus', '焦点')],
    ['is-disabled', L('Disabled', '禁用')],
  ];
  const variants = [
    ['sl-btn--primary', L('Primary', '主要'), L('Cook', '烹饪')],
    ['sl-btn--secondary', L('Secondary', '次要'), L('Checkout', '结账')],
    ['sl-btn--confirm', L('Confirm', '确认'), L('Confirm', '确认')],
    ['sl-btn--buy sl-btn--sm', L('Buy', '购买'), L('Buy', '购买')],
    ['', L('Neutral', '中性'), L('OK', '确定')],
    ['sl-btn--danger', L('Danger', '危险'), L('Discard', '丢弃')],
    ['sl-btn--ghost', L('Ghost', '描边'), L('Return', '退货')],
  ];
  return card(
    L('Buttons', '按钮'),
    'sheet-buttons',
    h(
      'div',
      { class: 'sheet-btn-grid' },
      h('span', {}),
      states.map(([, label]) => h('span', { class: 'sheet-spec' }, label)),
      variants.map(([cls, name, label]) => [
        h('span', { class: 'sheet-btn-grid__name' }, name),
        states.map(([st]) => h('span', {}, h('button', { class: `sl-btn ${cls} ${st}`.trim(), disabled: st === 'is-disabled' }, label))),
      ])
    ),
    h(
      'div',
      { class: 'sheet-btn-large' },
      h('button', { class: 'sl-btn sl-btn--confirm sl-btn--lg sl-btn--block' }, L('Confirm Purchase', '确认购买')),
      h('button', { class: 'sl-btn sl-btn--primary sl-btn--lg sl-btn--block sl-btn--caps' }, L('Cancel Cookbook', '取消食谱')),
      h('button', { class: 'sl-btn sl-btn--objective sl-btn--lg' }, L('Complete Preparations', '完成准备'))
    ),
    caption(L('Hover and press answer at once (60–90 ms). A 14 px label needs 4.5 : 1, a 20 px bold one 3 : 1.', '悬停与按下立即响应（60–90 毫秒）。14 像素标签需 4.5:1，20 像素粗体需 3:1。'))
  );
}

// ---------------------------------------------------------------------------------------------- tabs, chips, tags
function tagsCard() {
  return card(
    L('Tabs, chips, tags, badges', '标签页、快捷操作、标签、徽章'),
    'sheet-tags',
    h(
      'div',
      { class: 'sl-tabs', role: 'tablist' },
      h('button', { class: 'sl-tab', role: 'tab', 'aria-selected': 'false' }, L('Character Inventory', '角色背包')),
      h('button', { class: 'sl-tab is-hover', role: 'tab', 'aria-selected': 'false' }, L('Fridge', '冰箱')),
      h('button', { class: 'sl-tab', role: 'tab', 'aria-selected': 'true' }, L('Freezer', '冷冻柜'))
    ),
    h(
      'div',
      { class: 'sl-tabs sl-tabs--fill', role: 'tablist' },
      h('button', { class: 'sl-tab', role: 'tab', 'aria-selected': 'false' }, L('Storage', '储物')),
      h('button', { class: 'sl-tab', role: 'tab', 'aria-selected': 'true' }, L('Security', '安防')),
      h('button', { class: 'sl-tab', role: 'tab', 'aria-selected': 'false' }, L('Energy', '能源')),
      h('button', { class: 'sl-tab', role: 'tab', 'aria-selected': 'false' }, L('Other', '其他'))
    ),
    h('div', { class: 'sheet-row' }, h('button', { class: 'sl-chip' }, iconImg(2105, 28), L('Eat Beef Noodles', '吃红烧牛肉面')), h('button', { class: 'sl-chip is-hover' }, g('music'), L('Listen to Music', '听音乐'))),
    h(
      'div',
      { class: 'sheet-row' },
      h('span', { class: 'sl-tag sl-tag--must' }, g('star'), L('Must Buy', '必买')),
      h('span', { class: 'sl-tag sl-tag--gold' }, L('Pick One', '任选其一')),
      h('span', { class: 'sl-tag sl-tag--outline' }, L('Food', '食物')),
      h('span', { class: 'sl-tag sl-tag--outline' }, L('(Perfect)', '【完美】')),
      h('span', { class: 'sl-tag sl-tag--quiet' }, 'Lv.0')
    ),
    h(
      'div',
      { class: 'sheet-row' },
      h('span', { class: 'sl-badge sl-badge--danger' }, L('Encumbered', '超重')),
      h('span', { class: 'sl-badge sl-badge--good' }, L('Orderly Exit', '有序撤离')),
      h('span', { class: 'sl-count' }, '3'),
      h('span', { class: 'sl-count sl-count--gold' }, '2')
    ),
    caption(L('Dish quality is text after the name: "(Perfect)" in English, "【完美】" in Chinese; never a badge on the icon.', '菜品品质以文字写在名称后：英文“(Perfect)”，中文“【完美】”；图标上不加品质角标。'))
  );
}

// ------------------------------------------------------------------------------------------------------ inventory
/**
 * @param {number} id
 * @param {number} x
 * @param {number} y
 * @param {{ rotated?: boolean, age?: number, usesLeft?: number, status?: 'chilled' | 'expiring' | 'expired' | 'mold', states?: string[], frozen?: boolean }} [o]
 */
function slot(id, x, y, o = {}) {
  const c = cfg(id);
  const fresh = c.life > 0 && o.age != null ? freshness(c.life - o.age, c.life) : null;
  const glyphs = { chilled: 'tag', expiring: 'hourglass', expired: 'alert', mold: 'cloud' };
  const labels = { chilled: L('Chilled', '冷藏'), expiring: L('Expiring soon', '即将过期'), expired: L('Expired', '已过期'), mold: L('Moldy', '发霉') };
  return slotElement({
    x,
    y,
    size: c.size,
    rotated: o.rotated,
    icon: iconFor(id),
    name: itemLabel(id, lang),
    servings: c.uses > 1 ? { left: o.usesLeft ?? c.uses, total: c.uses } : undefined,
    fresh,
    status: o.status ? { kind: o.status, label: labels[o.status], glyph: g(glyphs[o.status]) } : undefined,
    states: o.states,
    frozen: o.frozen,
  });
}

/**
 * A grid with captions under given cells.
 * @param {{ cols: number, rows: number, cold?: boolean }} dims
 * @param {HTMLElement[]} slots
 * @param {[number, string][]} captions  [column, text]
 */
function labelledGrid(dims, slots, captions) {
  const grid = gridElement({ ...dims, label: L('Example grid', '示例格子') });
  for (const s of slots) grid.appendChild(s);
  return h(
    'figure',
    { class: 'sheet-grid' },
    grid,
    h(
      'figcaption',
      { class: 'sheet-grid__caps', style: `--cols: ${dims.cols}` },
      captions.map(([col, text]) => h('span', { style: `left: calc(${col} * var(--ui-cell-pitch))` }, text))
    )
  );
}

function inventoryCard() {
  const frame3 = h('div', { class: 'sl-slot sheet-frame', style: '--x: 6; --y: 0; --w: 3; --h: 3' }, h('span', { class: 'sheet-frame__label' }, L('3 × 3: no rendered icon yet', '3 × 3：暂无渲染图标')));
  return card(
    L('Inventory slots', '物品格'),
    'sheet-inventory',
    caption(L('Footprints from the config, 64 px cells on a 68 px pitch; the icon fills 66 % of the slot’s constrained side.', '占格来自配置表：64 像素格、68 像素间距；图标内容占格子受限边的 66%。')),
    labelledGrid(
      { cols: 12, rows: 4 },
      [slot(15026, 0, 0), slot(2115, 1, 0, { age: 40 }), slot(2142, 3, 0, { age: 3 }), slot(2105, 4, 0, { age: 2 }), frame3, slot(2103, 9, 0, { age: 10, usesLeft: 7 })],
      [
        [0, '1 × 1'],
        [1, '2 × 1'],
        [3, '1 × 2'],
        [4, '2 × 2'],
        [6, '3 × 3'],
        [9, '3 × 4'],
      ]
    ),
    h(
      'div',
      { class: 'sheet-inv-row' },
      labelledGrid(
        { cols: 6, rows: 2 },
        [slot(2502, 0, 0, { age: 1 }), slot(2502, 2, 0, { age: 1, rotated: true }), slot(20106, 3, 0), slot(20106, 5, 0, { rotated: true })],
        [
          [0, L('2 × 1', '2 × 1')],
          [2, L('turned', '旋转')],
          [3, '2 × 1'],
          [5, L('turned', '旋转')],
        ]
      ),
      labelledGrid(
        { cols: 8, rows: 1 },
        [slot(2502, 0, 0, { age: 0 }), slot(2502, 2, 0, { age: 4 }), slot(2502, 4, 0, { age: 8.6 }), slot(2502, 6, 0, { age: 11 })],
        [
          [0, L('fresh', '新鲜')],
          [2, '60 %'],
          [4, L('soon', '将过期')],
          [6, L('expired', '已过期')],
        ]
      )
    ),
    h(
      'div',
      { class: 'sheet-inv-row' },
      labelledGrid(
        { cols: 8, rows: 1 },
        [slot(2115, 0, 0, { age: 5, status: 'chilled' }), slot(2115, 2, 0, { age: 300, status: 'expiring' }), slot(2115, 4, 0, { age: 400, status: 'expired' }), slot(2115, 6, 0, { age: 30, status: 'mold' })],
        [
          [0, L('chilled', '冷藏')],
          [2, L('expiring', '将过期')],
          [4, L('expired', '已过期')],
          [6, L('moldy', '发霉')],
        ]
      ),
      labelledGrid(
        { cols: 6, rows: 1 },
        [slot(15026, 0, 0), slot(15026, 1, 0, { states: ['is-hover'] }), slot(15026, 2, 0, { states: ['is-selected'] }), slot(15026, 3, 0, { states: ['is-pending'] }), slot(15026, 4, 0, { states: ['is-dragging'] }), slot(15026, 5, 0, { states: ['is-focus'] })],
        [
          [0, L('rest', '常态')],
          [1, L('hover', '悬停')],
          [2, L('pick', '选中')],
          [3, L('unpaid', '未付')],
          [4, L('drag', '拖动')],
          [5, L('focus', '焦点')],
        ]
      )
    ),
    h('div', { class: 'sheet-inv-row' }, dropPreview(), coldGrid())
  );
}

function dropPreview() {
  const grid = gridElement({ cols: 5, rows: 2, label: L('Drop preview', '放置预览') });
  const cells = [...grid.querySelectorAll('.sl-cell')];
  for (const i of [1, 2, 6, 7]) cells[i].classList.add('is-drop-ok');
  const ghost = slot(2105, 1, 0, { age: 2 });
  ghost.classList.add('sl-slot--ghost');
  grid.appendChild(ghost);
  const bad = gridElement({ cols: 3, rows: 2, label: L('Blocked drop', '无法放置') });
  const badCells = [...bad.querySelectorAll('.sl-cell')];
  for (const i of [0, 1, 3, 4]) badCells[i].classList.add('is-drop-bad');
  bad.appendChild(slot(2400, 1, 1, { age: 3 }));
  const blocked = slot(2105, 0, 0, { age: 2 });
  blocked.classList.add('sl-slot--ghost');
  bad.appendChild(blocked);
  return h('figure', { class: 'sheet-grid sheet-drop' }, h('div', { class: 'sheet-row' }, grid, bad), h('figcaption', { class: 'sheet-caption' }, L('Dragging: green cells take the item, red cells refuse it.', '拖动时：绿色格子可放下，红色格子无法放置。')));
}

function coldGrid() {
  const grid = gridElement({ cols: 4, rows: 2, cold: true, label: L('Freezer', '冷冻柜') });
  grid.appendChild(slot(13540, 0, 0, { age: 0.2, status: 'chilled', frozen: true }));
  grid.appendChild(slot(2142, 2, 0, { age: 2, status: 'chilled', frozen: true }));
  return h('figure', { class: 'sheet-grid' }, grid, h('figcaption', { class: 'sheet-caption' }, L('Cold storage: blue empty cells; frozen items wear the snow cap.', '冷藏：空格为蓝色；冷冻物品顶部覆雪。')));
}

// ------------------------------------------------------------------------------------------------------------ bars
function barsCard() {
  /** @param {string} label @param {string} value @param {string} cls @param {number} v */
  const bar = (label, value, cls, v) =>
    h('div', { class: 'sheet-bar' }, h('div', { class: 'sl-load' }, h('span', { class: 'sl-load__label' }, label), h('span', { class: `sl-load__value${cls.includes('danger') ? ' is-over' : ''}` }, value), h('div', { class: `sl-bar ${cls}`, style: `--v: ${v}` })));
  /** @param {string} key @param {string} glyphName @param {string} cls @param {number} v @param {number} max */
  const stat = (key, glyphName, cls, v, max) => h('div', { class: `sl-stat ${cls}`, style: `--v: ${v / max}` }, h('span', { class: 'sl-stat__icon' }, g(glyphName)), h('span', {}, key), h('span', { class: 'sl-stat__value' }, `${v}/${max}`));
  return card(
    L('Bars', '进度条'),
    'sheet-bars',
    bar(L('Broad Shoulders', '宽阔肩膀'), '5.2 / 9.6 Kg', '', 5.2 / 9.6),
    bar(L('Load', '负重'), '8.7 / 8.0 Kg', 'sl-bar--danger', 1),
    bar(L('Cooking', '烹饪中'), '70 %', 'sl-bar--primary sl-bar--thick', 0.7),
    bar(L('Front Door', '前门'), '80/100', 'sl-bar--alert', 0.8),
    h('div', { class: 'sl-stats' }, stat(L('Satiety', '饱腹'), 'satiety', 'sl-stat--sat', 72, 100), stat(L('Stamina', '精力'), 'bolt', 'sl-stat--sta sl-stat--warn', 38, 100), stat(L('Life', '生命'), 'life', 'sl-stat--life sl-stat--bad', 18, 102))
  );
}

// ------------------------------------------------------------------------------------------------ station window
function stationCard() {
  /** @param {string} name @param {string} sub */
  const recipe = (name, sub) => h('li', { class: 'sheet-recipe' }, h('span', { class: 'sheet-recipe__text' }, h('span', { class: 'sl-strong' }, name), h('span', { class: 'sl-dim' }, sub)), h('span', { class: 'sl-gold' }, L('Ready', '可做')));
  return card(
    L('Station window', '工作站窗口'),
    'sheet-station',
    h(
      'div',
      { class: 'sheet-station__frame' },
      frame({
        title: L('Cooking Station', '烹饪台'),
        sub: L(' - Stove', ' - 灶台'),
        close: L('Close', '关闭'),
        panes: [
          [sectionHead({ label: L('Recipe book', '食谱'), level: 4 }), h('ul', { class: 'sheet-recipes' }, recipe(L('Bland Mushroom Soup', '清淡蘑菇汤'), L('Mushrooms*2', '蘑菇*2')), recipe(L('Stir-Fried Cabbage', '清炒白菜'), L('Cabbage', '白菜')))],
          [
            sectionHead({ label: L('This pot', '这一锅'), level: 4 }),
            h('p', { class: 'sl-dim' }, L('Mushroom Soup · Ready to serve', '蘑菇汤 · 可以上菜')),
            kitButton({ label: L('Cancel Cookbook', '取消食谱'), variant: 'primary', size: 'lg', block: true }),
            kitBar({ value: 0.7, kind: 'primary', label: L('Cooking', '烹饪中') }),
          ],
        ],
      })
    ),
    caption(L('Station windows (ss_07, ss_08) sit their panes on one frosted frame that blurs the room behind it. Built with frame(), section(), button() and bar() from src/ui/kit/build.js.', '工作站窗口（ss_07、ss_08）把各个面板放在一块磨砂框上，框后的房间被模糊。由 src/ui/kit/build.js 的 frame()、section()、button()、bar() 搭建。'))
  );
}

// ---------------------------------------------------------------------------------------------- toasts, tooltips
function toastsCard() {
  return card(
    L('Toasts', '通知'),
    'sheet-toasts',
    h(
      'div',
      { class: 'sl-toasts sheet-toasts__stack' },
      h('div', { class: 'sl-toast sl-toast--good' }, iconImg(2105, 36, 'sl-toast__icon'), h('span', { class: 'sl-toast__gain' }, '+1'), h('span', {}, itemLabel(2105, lang))),
      h('div', { class: 'sl-toast sl-toast--good' }, g('check'), h('span', {}, L('Crafting complete: Simple Mousetrap ×1', '制造完成：简易捕鼠夹 ×1'))),
      h('div', { class: 'sl-toast sl-toast--info' }, g('info'), h('span', {}, L('Codex unlocked: ', '图鉴解锁：'), itemLabel(13540, lang))),
      h('div', { class: 'sl-toast' }, h('span', {}, L('Crafting Proficiency +28', '制造熟练度 +28'))),
      h('div', { class: 'sl-toast sl-toast--bad' }, g('alert'), h('span', {}, L('Not enough money', '资金不足')))
    ),
    caption(L('In over 240 ms from above, hold 3.2 s, out over 280 ms; five at most, newest at the bottom.', '240 毫秒自上滑入，停留 3.2 秒，280 毫秒淡出；最多 5 条，最新的在最下。'))
  );
}

function tooltipsCard() {
  return card(
    L('Tooltips', '悬浮提示'),
    'sheet-tips',
    h('div', { class: 'sheet-tips__label' }, h('button', { class: 'sl-toolbtn is-hover', 'aria-label': L('Stockpile', '囤货') }, g('clipboard')), h('div', { class: 'sl-tip sheet-tip-static' }, L('View Stockpile Reminder', '查看囤货提醒'))),
    h(
      'div',
      { class: 'sl-tip sl-tip--rich sheet-tip-static' },
      h('div', { class: 'sl-tip__title' }, g('sprout'), L('Plant', '种植')),
      h('div', { class: 'sl-tip__sub' }, L('Sustainable post-disaster output', '灾后可持续的产出')),
      h('p', { class: 'sl-bad' }, L('Status: Shortage (5) – resupply required', '状态：短缺（5）– 需要补充')),
      h(
        'dl',
        { class: 'sl-kv' },
        [
          ['Flowerpots', '花盆', true],
          ['Seed Types', '种子种类', false],
          ['Seeds', '种子', false],
          ['Fertilizer', '肥料', false],
        ].map(([en, zh, ok]) => [h('dt', {}, L(String(en), String(zh))), h('dd', { class: ok ? 'is-gold' : 'is-dim' }, ok ? L('• Sufficient', '• 充足') : L('○ Insufficient', '○ 不足'))])
      )
    ),
    caption(L('A label tip appears after 350 ms of hover and fades in over 120 ms; an item tip follows the item, never the cursor.', '悬停 350 毫秒后显示文字提示，120 毫秒淡入；物品提示贴着物品，不跟随鼠标。'))
  );
}

// ------------------------------------------------------------------------------------------------------------ modal
function modalCard() {
  const c = cfg(2115);
  return card(
    L('Modal', '对话框'),
    'sheet-modal',
    h(
      'div',
      { class: 'sheet-modal__frame' },
      h(
        'div',
        { class: 'sl-scrim' },
        h(
          'div',
          { class: 'sl-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': itemLabel(2115, lang) },
          h(
            'header',
            { class: 'sl-modal__head' },
            h('div', { class: 'sl-modal__titles' }, h('h3', { class: 'sl-t-heading' }, itemLabel(2115, lang)), h('div', { class: 'sl-modal__sub' }, L('Food · Canned', '食物 · 罐头'))),
            h('span', { class: 'sl-price sl-price--lg' }, `$${c.price}`),
            h('button', { class: 'sl-close', 'aria-label': L('Close', '关闭') }, g('close'))
          ),
          h(
            'div',
            { class: 'sl-modal__body sheet-modal__body' },
            h('div', { class: 'sheet-modal__icon' }, iconImg(2115, 96)),
            h('dl', { class: 'sl-kv' }, h('dt', {}, L('Weight', '重量')), h('dd', {}, `${(c.g / 1000).toFixed(2)}kg`), h('dt', {}, L('Size', '尺寸')), h('dd', {}, `[${c.size[0]}x${c.size[1]}]`), h('dt', {}, L('Shelf life', '保质期')), h('dd', {}, L(`${c.life} days`, `${c.life} 天`)), h('dt', {}, L('Satiety', '饱腹')), h('dd', {}, `+${c.sat}`))
          ),
          h('footer', { class: 'sl-modal__foot' }, h('button', { class: 'sl-btn sl-btn--lg' }, L('Cancel', '取消')), h('button', { class: 'sl-btn sl-btn--confirm sl-btn--lg sheet-grow' }, L('Confirm Purchase', '确认购买')))
        )
      )
    ),
    caption(L('The scrim dims what the dialog belongs to, without blur (ss_07); the dialog rises 6 px and fades in over 280 ms.', '遮罩只压暗对话框所属的界面，不做模糊（ss_07）；对话框 280 毫秒上浮 6 像素并淡入。'))
  );
}

// ------------------------------------------------------------------------------------------------------ HUD pieces
function hudCard() {
  return card(
    L('HUD pieces', 'HUD 组件'),
    'sheet-hud',
    h('div', { class: 'sheet-row' }, h('div', { class: 'sheet-countdown' }, g('hourglass'), '08:55'), h('div', { class: 'sheet-money' }, '$ 808')),
    h('div', { class: 'sl-crisis' }, L('Zombie Siege!', '尸潮来袭！'), g('search')),
    h('div', { class: 'sheet-hp' }, h('span', {}, L('Front Door', '前门')), h('div', { class: 'sl-bar sl-bar--alert', style: '--v: 0.8' }), h('span', { class: 'sl-num' }, '80/100')),
    h(
      'div',
      { class: 'sl-quest' },
      h('div', { class: 'sl-quest__title' }, L('Rescue • What She Wants Most', '营救 · 她最想要的东西')),
      h('div', { class: 'sl-quest__tags' }, h('span', { class: 'sl-tag sl-tag--outline' }, L('Food', '食物')), h('span', { class: 'sl-tag sl-tag--outline' }, L('Sundries', '杂物'))),
      h('div', { class: 'sl-quest__prog' }, L('0/500 · Can last 20 more days', '0/500 · 还能坚持20天'))
    )
  );
}

// ------------------------------------------------------------------------------------------------- motion, focus
function motionCard() {
  const tokens = [
    ['--ui-dur-press', L('press feedback', '按下反馈')],
    ['--ui-dur-hover', L('hover in / out', '悬停进出')],
    ['--ui-dur-tip', L('tooltip fade (after --ui-delay-tip)', '提示淡入（--ui-delay-tip 之后）')],
    ['--ui-dur-open', L('window open', '窗口打开')],
    ['--ui-dur-toast', L('toast in', '通知进入')],
    ['--ui-dur-modal', L('modal in, toast out', '对话框进入、通知退出')],
    ['--ui-dur-bar', L('bar value change', '进度条变化')],
    ['--ui-ease-out', L('everything that arrives', '所有进入的动效')],
    ['--ui-ease-in', L('everything that leaves', '所有离开的动效')],
    ['--ui-ease-pop', L('badge and count changes', '徽章与计数变化')],
  ];
  const root = getComputedStyle(document.documentElement);
  return card(
    L('Motion and focus', '动效与焦点'),
    'sheet-motion',
    h('dl', { class: 'sl-kv sheet-motion__list' }, tokens.map(([name, use]) => [h('dt', {}, h('span', { class: 'sl-t-mono sl-strong' }, name), ' ', use), h('dd', { class: 'is-plain sl-t-mono' }, root.getPropertyValue(name).trim())])),
    h('div', { class: 'sheet-row' }, h('button', { class: 'sl-btn sl-btn--secondary is-focus' }, L('Checkout', '结账')), h('button', { class: 'sl-btn is-focus' }, L('OK', '确定')), h('div', { class: 'sl-tabs' }, h('button', { class: 'sl-tab is-focus', 'aria-selected': 'true' }, L('Fridge', '冰箱')))),
    caption(L('Keyboard focus only (:focus-visible): a 2 px dark gap and a 2 px pale-gold ring, visible on yellow fills and dark panels alike.', '仅键盘焦点（:focus-visible）：2 像素深色间隙加 2 像素浅金描边，在黄色按钮和深色面板上都清晰。'))
  );
}

/** @param {Lang} l */
export function buildSheet(l) {
  lang = l;
  return h(
    'div',
    { class: 'sheet' },
    h(
      'header',
      { class: 'sheet-head' },
      h('h1', { class: 'sl-t-heading' }, L('Survival Log UI kit', '生存日志 UI 套件')),
      h('p', { class: 'sl-dim' }, L('src/ui/kit · docs/UI.md · every component in each state, over the tile backdrop', 'src/ui/kit · docs/UI.md · 每个组件的各种状态，叠在样张背景上'))
    ),
    h('div', { class: 'sheet-cards' }, typeCard(), colourCard(), buttonsCard(), tagsCard(), inventoryCard(), stationCard(), barsCard(), toastsCard(), tooltipsCard(), modalCard(), hudCard(), motionCard())
  );
}
