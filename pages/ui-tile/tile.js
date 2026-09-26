// @ts-check
// The UI style tile (docs/UI.md §7): the inventory (backpack + fridge), a shop window and the HUD in the kit, over
// one still of the Wage Slave's living room at 1920 × 1080. ?lang=zh for Chinese, ?view=kit for the component sheet,
// ?backdrop=<url> to try another still without replacing pages/ui-tile/backdrop.jpg.
import { gridElement, slotElement, freshness, formatKg, formatLoad, formatFootprint, formatMoney, formatClock, labelled, placeItemTip } from '../../src/ui/kit/index.js';
import { h, g, append, iconFor, iconImg, cfg, itemLabel, imagesReady } from './dom.js';
import { t, BACKPACK, FRIDGE, SHOP, CASH, STATS, CLOCK } from './content.js';
import { buildSheet } from './sheet.js';

/** @typedef {import('./content.js').Lang} Lang */
/** @typedef {import('./content.js').Placed} Placed */

const params = new URLSearchParams(location.search);
/** @type {Lang} */
const lang = params.get('lang') === 'zh' ? 'zh' : 'en';
const view = params.get('view') === 'kit' ? 'kit' : 'tile';
const backdropUrl = params.get('backdrop') || new URL('./backdrop.jpg', import.meta.url).href;

document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : 'en';
document.title = t('pageTitle', lang);

/** @param {string} key @param {Record<string, string | number>} [vars] */
const tx = (key, vars) => t(key, lang, vars);

// ---------------------------------------------------------------------------------------------------- inventory
/**
 * @param {Placed} p
 */
function slotFor(p) {
  const c = cfg(p.id);
  const left = c.life > 0 ? c.life - (p.age ?? 0) : 0;
  const fresh = freshness(left, c.life);
  /** @type {import('../../src/ui/kit/slot.js').SlotIcon} */
  const icon = iconFor(p.id);
  const status =
    fresh?.state === 'expired'
      ? { kind: /** @type {const} */ ('expired'), label: tx('expired'), glyph: g('alert') }
      : fresh?.state === 'soon' && !p.status
        ? { kind: /** @type {const} */ ('expiring'), label: tx('expiring'), glyph: g('hourglass') }
        : p.status === 'chilled'
          ? { kind: /** @type {const} */ ('chilled'), label: tx('chilled'), glyph: g('tag') }
          : undefined;
  const el = slotElement({
    x: p.x,
    y: p.y,
    size: c.size,
    rotated: p.rotated,
    icon,
    name: itemLabel(p.id, lang),
    servings: c.uses > 1 ? { left: p.usesLeft ?? c.uses, total: c.uses } : undefined,
    fresh,
    status,
    states: p.states,
  });
  el.dataset.item = String(p.id);
  return el;
}

/**
 * @param {{ cols: number, rows: number, items: Placed[] }} box
 * @param {boolean} cold
 * @param {string} label
 */
function grid(box, cold, label) {
  const el = gridElement({ cols: box.cols, rows: box.rows, cold, label });
  for (const p of box.items) el.appendChild(slotFor(p));
  return el;
}

/** @param {Placed[]} items */
const totalKg = (items) => items.reduce((a, p) => a + cfg(p.id).g, 0) / 1000;
/** @param {Placed[]} items */
const cellsUsed = (items) => items.reduce((a, p) => a + cfg(p.id).size[0] * cfg(p.id).size[1], 0);

function inventoryWindow() {
  const kg = totalKg(BACKPACK.items);
  const over = kg > BACKPACK.maxKg;
  const used = cellsUsed(FRIDGE.items);
  const cells = FRIDGE.cols * FRIDGE.rows;
  return h(
    'section',
    { class: 'sl-panel tile-inventory', 'aria-label': tx('inventory') },
    h('header', { class: 'sl-panel__head' }, h('h2', { class: 'sl-panel__title' }, tx('inventory')), h('button', { class: 'sl-close', 'aria-label': tx('close') }, g('close'))),
    h(
      'div',
      { class: 'tile-inventory__cols' },
      h(
        'div',
        { class: 'tile-container' },
        h('div', { class: 'sl-section' }, tx('backpack'), h('span', { class: `sl-section__aside sl-load__value${over ? ' is-over' : ''}` }, formatLoad(kg, BACKPACK.maxKg))),
        h('div', { class: `sl-bar${over ? ' sl-bar--danger' : ''} tile-container__bar`, style: `--v: ${Math.min(1, kg / BACKPACK.maxKg)}`, role: 'meter', 'aria-label': tx('load'), 'aria-valuenow': kg.toFixed(1), 'aria-valuemax': BACKPACK.maxKg }),
        grid(BACKPACK, false, tx('backpack'))
      ),
      h(
        'div',
        { class: 'tile-container' },
        h('div', { class: 'sl-section' }, tx('fridge'), h('span', { class: 'sl-section__aside sl-load__value' }, labelled(tx('space'), `${used} / ${cells}`, lang))),
        h('div', { class: 'sl-bar tile-container__bar', style: `--v: ${used / cells}`, role: 'meter', 'aria-label': tx('space'), 'aria-valuenow': used, 'aria-valuemax': cells }),
        grid(FRIDGE, true, tx('fridge'))
      )
    ),
    h('p', { class: 'sl-panel__foot' }, tx('invTip'))
  );
}

// ---------------------------------------------------------------------------------------------------- tooltip
function itemTooltip() {
  const p = FRIDGE.items.find((x) => x.tip);
  if (!p) throw new Error('the fridge has no tooltip item');
  const c = cfg(p.id);
  const left = c.life - (p.age ?? 0);
  const fresh = freshness(left, c.life);
  const signed = (/** @type {number} */ n) => `${n > 0 ? '+' : ''}${n}`;
  const gain = (/** @type {string} */ key, /** @type {number} */ n) => h('li', {}, tx(key), ' ', h('b', { class: 'sl-good' }, signed(n)));
  return h(
    'aside',
    { class: 'sl-tip sl-tip--rich tile-tip', role: 'tooltip' },
    h('div', { class: 'sl-tip__title' }, iconImg(p.id, 32), h('span', {}, itemLabel(p.id, lang))),
    h('div', { class: 'sl-tip__sub' }, `${tx('meatDish')} · ${formatKg(c.g)} ${formatFootprint(c.size)}`),
    h('ul', { class: 'sl-tip__gains' }, gain('satietyShort', c.sat), gain('moraleShort', c.mor), gain('lifeShort', c.hp)),
    h('div', { class: 'sl-tip__rule' }),
    h('dl', { class: 'sl-kv' }, h('dt', {}, tx('shelfLife')), h('dd', { class: fresh?.state === 'fresh' ? '' : 'is-warn' }, tx('days', { a: left.toFixed(1), b: c.life }))),
    h('p', { class: 'tile-tip__status' }, g('tag'), tx('chilled')),
    h('div', { class: 'sl-tip__rule' }),
    h('p', { class: 'sl-tip__desc' }, t('dishDesc', lang))
  );
}

// ---------------------------------------------------------------------------------------------------- shop
/** The shop list and, under it, the cash panel with the unpaid total (the source's CASH panel, ss_01 and t018). */
function shopColumn() {
  return h('div', { class: 'tile-shopcol' }, shopWindow(), cashPanel());
}

function shopWindow() {
  return h(
    'section',
    { class: 'sl-panel tile-shop', 'aria-label': tx('groceries') },
    h('header', { class: 'sl-panel__head' }, h('h2', { class: 'sl-panel__title' }, tx('groceries')), h('button', { class: 'sl-close', 'aria-label': tx('close') }, g('close'))),
    h(
      'div',
      { class: 'tile-shop__list' },
      h(
        'ul',
        { class: 'sl-list' },
        SHOP.map((row) => {
          const c = cfg(row.id);
          const out = row.remaining <= 0;
          return h(
            'li',
            { class: `sl-row${row.hover ? ' is-hover' : ''}`, 'data-item': row.id },
            h('div', { class: 'sl-row__icon' }, iconImg(row.id, 96)),
            h(
              'div',
              { class: 'sl-row__main' },
              h('div', { class: 'tile-shop__name' }, h('span', { class: 'sl-row__name' }, itemLabel(row.id, lang)), row.must ? h('span', { class: 'sl-tag sl-tag--must' }, g('star'), tx('mustBuy')) : null),
              h('div', { class: 'sl-row__meta sl-t-mono' }, h('span', {}, formatKg(c.g)), h('span', {}, formatFootprint(c.size)))
            ),
            h(
              'div',
              { class: 'sl-row__aside' },
              h('span', { class: out ? 'sl-bad' : 'sl-dim' }, out ? tx('soldOut') : labelled(tx('remaining'), row.remaining, lang)),
              h(
                'div',
                { class: 'sl-row__buy' },
                h('span', { class: `sl-price${out ? ' sl-price--muted' : ''}` }, formatMoney(c.price)),
                h('button', { class: `sl-btn sl-btn--buy${row.hover ? ' is-hover' : ''}`, disabled: out }, tx('buy'))
              )
            )
          );
        })
      ),
      h('div', { class: 'sl-scrollbar', style: '--thumb-top: 0%; --thumb-size: 62%', 'aria-hidden': 'true' }, h('i', {}))
    )
  );
}

function cashPanel() {
  const pending = BACKPACK.items.filter((p) => p.states?.includes('is-pending'));
  const due = pending.reduce((a, p) => a + cfg(p.id).price, 0);
  return h(
    'section',
    { class: 'sl-panel tile-cash', 'aria-label': tx('cash') },
    h('div', { class: 'tile-cash__line' }, h('span', { class: 'sl-dim' }, tx('cash')), h('span', { class: 'sl-strong sl-num' }, formatMoney(CASH))),
    h('div', { class: 'tile-cash__line' }, h('span', { class: 'sl-dim' }, tx('items', { n: pending.length })), h('span', { class: 'sl-price sl-price--lg' }, formatMoney(due))),
    h('button', { class: 'sl-btn sl-btn--secondary sl-btn--lg sl-btn--block' }, tx('checkout'))
  );
}

// ---------------------------------------------------------------------------------------------------- HUD
function objectives() {
  return h(
    'nav',
    { class: 'sl-objectives tile-objectives sl-hud-text', 'aria-label': tx('main') },
    h('div', { class: 'sl-obj-head sl-obj-head--main' }, g('flag'), tx('main')),
    h('div', { class: 'sl-obj sl-obj--main' }, tx('mainQuest')),
    h('div', { class: 'sl-obj-head' }, g('bolt'), tx('event')),
    h('div', { class: 'sl-obj' }, tx('event1')),
    h('div', { class: 'sl-obj' }, tx('event2'), h('span', { class: 'sl-obj__timer' }, '23:45'))
  );
}

/**
 * 24-hour dial as in ss_02: night half on top, day half below, a thin pale rim, the hours on an outer ring around a
 * darker inner disc, one white hand from the centre and the gold marker above 24. The hand stays inside the inner
 * disc, so it never crosses a numeral.
 */
function dial() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 144 144');
  svg.setAttribute('class', 'sl-clock__dial');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', formatClock(CLOCK.h, CLOCK.m));
  const angle = ((CLOCK.h + CLOCK.m / 60) / 24) * 2 * Math.PI;
  const at = (/** @type {number} */ a, /** @type {number} */ r) => [72 + r * Math.sin(a), 72 - r * Math.cos(a)];
  const [hx, hy] = at(angle, 36);
  let marks = '';
  for (let hour = 2; hour <= 24; hour += 2) {
    const [x, y] = at((hour / 24) * 2 * Math.PI, 56);
    marks += `<text x="${x.toFixed(1)}" y="${(y + 4.5).toFixed(1)}">${hour}</text>`;
  }
  const hand = `x1="72" y1="72" x2="${hx.toFixed(1)}" y2="${hy.toFixed(1)}" stroke-linecap="round"`;
  const fill = (/** @type {string} */ token) => `style="fill: var(${token})"`;
  svg.innerHTML = `
    <defs><clipPath id="dial-face"><circle cx="72" cy="72" r="71"/></clipPath></defs>
    <g clip-path="url(#dial-face)">
      <rect x="0" y="0" width="144" height="72" ${fill('--ui-dial-night-ring')}/>
      <rect x="0" y="72" width="144" height="72" ${fill('--ui-dial-day-ring')}/>
    </g>
    <path d="M28 72a44 44 0 0 1 88 0z" ${fill('--ui-dial-night')}/>
    <path d="M28 72a44 44 0 0 0 88 0z" ${fill('--ui-dial-day')}/>
    <circle cx="72" cy="72" r="44" fill="none" style="stroke: var(--ui-dial-groove)" stroke-width="2"/>
    <circle cx="72" cy="72" r="70.5" fill="none" style="stroke: var(--ui-dial-rim)" stroke-width="1.5"/>
    <path d="M65 -10h14l-7 10z" ${fill('--ui-dial-marker')}/>
    <g class="tile-dial__marks">${marks}</g>
    <line ${hand} style="stroke: var(--ui-dial-hand-shadow)" stroke-width="6" transform="translate(1 1.5)"/>
    <line ${hand} style="stroke: var(--ui-text-strong)" stroke-width="5"/>`;
  return svg;
}

function daybar() {
  return h(
    'div',
    { class: 'sl-daybar tile-daybar' },
    h('div', { class: 'sl-weather', role: 'img', 'aria-label': tx('sunny') }, g('sun')),
    h('div', { class: 'sl-day' }, h('div', { class: 'sl-day__count' }, tx('day')), h('div', { class: 'sl-loop' }, tx('loop'))),
    h('div', { class: 'sl-clock' }, dial(), h('div', { class: 'sl-clock__digits' }, formatClock(CLOCK.h, CLOCK.m)))
  );
}

function rightColumn() {
  const nav = [
    ['log', 'log'],
    ['tactics', 'tactics'],
    ['track', 'track'],
    ['layout', 'layout'],
  ];
  return h(
    'div',
    { class: 'tile-right' },
    h('div', { class: 'sl-nav' }, nav.map(([key, gl]) => h('button', { class: 'sl-nav__item' }, h('span', { class: 'sl-nav__label' }, tx(key)), h('span', { class: 'sl-nav__icon' }, g(gl))))),
    h(
      'div',
      { class: 'sl-floors tile-floors' },
      h('button', { class: 'sl-floor' }, tx('floor2')),
      h('button', { class: 'sl-floor', 'aria-current': 'true' }, tx('floorHome')),
      h('button', { class: 'sl-floor', disabled: true }, tx('floorB1'))
    ),
    h('div', { class: 'sl-hudrow sl-hudrow--power tile-hudrow' }, g('plug'), tx('gridPower'), h('span', { class: 'sl-hudrow__value' }, g('caretUp'))),
    h('div', { class: 'sl-hudrow tile-hudrow' }, g('cloud'), tx('room'), h('span', { class: 'sl-hudrow__value' }, tx('roomTemp')))
  );
}

function stats() {
  return h(
    'div',
    { class: 'tile-stats' },
    h('span', { class: 'sl-badge sl-badge--danger sl-badge--lg tile-encumbered' }, tx('encumbered')),
    h(
      'div',
      { class: 'sl-stats' },
      STATS.map((s) =>
        h(
          'div',
          { class: `sl-stat sl-stat--${s.mod}${s.tone === 'warn' ? ' sl-stat--warn' : ''}`, style: `--v: ${s.value / s.max}`, role: 'meter', 'aria-label': tx(s.key), 'aria-valuenow': s.value, 'aria-valuemax': s.max },
          h('span', { class: 'sl-stat__icon' }, g(s.glyph)),
          h('span', {}, tx(s.key)),
          h('span', { class: 'sl-stat__value' }, `${s.value}/${s.max}`)
        )
      )
    )
  );
}

function toolbar() {
  return h(
    'div',
    { class: 'tile-toolbar' },
    h('button', { class: 'sl-toolbtn tile-toolbtn--bag', 'aria-label': tx('backpackBtn') }, g('briefcase')),
    h('button', { class: 'sl-toolbtn tile-toolbtn--phone', 'aria-label': tx('phoneBtn') }, g('phone')),
    h('button', { class: 'sl-toolbtn sl-toolbtn--main tile-toolbtn--main', 'aria-label': tx('cookAction') }, g('chef')),
    h(
      'div',
      { class: 'sl-chips tile-chips' },
      h('button', { class: 'sl-chip' }, iconImg(2105, 24), tx('eat', { name: itemLabel(2105, lang) })),
      h('button', { class: 'sl-chip' }, g('music'), tx('music')),
      h('button', { class: 'sl-chip' }, g('relax'), tx('relax'))
    ),
    h(
      'div',
      { class: 'sl-queue tile-queue', role: 'list', 'aria-label': tx('queue') },
      h('span', { class: 'sl-queue__back', 'aria-label': tx('queueBack') }, g('chevronLeft')),
      h(
        'div',
        { class: 'sl-queue__slots' },
        h('div', { class: 'sl-queue__slot is-current', role: 'listitem' }, g('chef'), h('div', { class: 'sl-bar sl-bar--primary', style: '--v: 0.42' })),
        h('div', { class: 'sl-queue__slot', role: 'listitem' }, g('relax')),
        h('div', { class: 'sl-queue__slot', role: 'listitem' }),
        h('div', { class: 'sl-queue__slot', role: 'listitem' }),
        h('div', { class: 'sl-queue__slot', role: 'listitem' })
      )
    ),
    h(
      'div',
      { class: 'sl-speed tile-speed' },
      h('button', { class: 'sl-speed__btn', 'aria-pressed': 'true', 'aria-label': tx('speedPlay') }, g('play')),
      h('button', { class: 'sl-speed__btn', 'aria-pressed': 'false', 'aria-label': tx('speedFast') }, g('fast')),
      h('button', { class: 'sl-speed__btn', 'aria-pressed': 'false', 'aria-label': tx('speedFaster') }, g('faster')),
      h('button', { class: 'sl-speed__btn', 'aria-pressed': 'false', 'aria-label': tx('speedPause') }, g('pause'))
    ),
    h('div', { class: 'sl-alerts tile-alerts' }, h('button', { class: 'sl-alert', 'aria-label': tx('alert') }, g('alert')), h('button', { class: 'sl-alert sl-alert--new', 'aria-label': tx('alert') }, g('alert'))),
    h(
      'div',
      { class: 'sl-wish tile-wish' },
      h('span', { class: 'sl-wish__label' }, tx('wish')),
      h('span', { class: 'sl-tag sl-tag--gold' }, tx('pickOne')),
      h('span', {}, tx('wishItems')),
      h('span', { class: 'sl-wish__timer' }, '06:03')
    )
  );
}

function toasts() {
  return h(
    'div',
    { class: 'sl-toasts tile-toasts', role: 'status' },
    h('div', { class: 'sl-toast sl-toast--good' }, iconImg(2105, 36, 'sl-toast__icon'), h('span', { class: 'sl-toast__gain' }, '+1'), h('span', {}, itemLabel(2105, lang))),
    h('div', { class: 'sl-toast sl-toast--bad' }, g('alert'), h('span', {}, tx('overLimit')))
  );
}

// ---------------------------------------------------------------------------------------------------- stage
async function main() {
  const stage = /** @type {HTMLElement} */ (document.getElementById('stage'));
  stage.dataset.view = view;
  const backdrop = /** @type {HTMLImageElement} */ (h('img', { class: 'tile-backdrop', alt: '', src: backdropUrl }));
  if (view === 'kit') {
    stage.style.setProperty('--sheet-backdrop', `url("${backdropUrl}")`);
    stage.style.background = `#0b0c0b url("${backdropUrl}") center top / 1920px 1080px repeat-y`;
    append(stage, [backdrop, buildSheet(lang)]);
  } else {
    append(stage, [backdrop, objectives(), toasts(), daybar(), rightColumn(), stats(), inventoryWindow(), shopColumn(), itemTooltip(), toolbar()]);
  }
  await document.fonts.ready;
  const tip = /** @type {HTMLElement | null} */ (stage.querySelector('.tile-tip'));
  const anchor = stage.querySelector('.tile-inventory .sl-slot.is-hover');
  if (tip && anchor) {
    const win = /** @type {Element} */ (anchor.closest('.sl-panel'));
    placeItemTip(tip, anchor, { bounds: win.getBoundingClientRect(), avoid: [...win.querySelectorAll('.sl-slot')] });
  }
  await imagesReady(stage);
  document.documentElement.dataset.ready = 'true';
}

main().catch((err) => {
  document.documentElement.dataset.ready = 'error';
  console.error(err);
});
