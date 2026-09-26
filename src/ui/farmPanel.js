// Planting panel (planter status, care buttons, fertilizer and seed pickers) and the vase panel.
import { h, openWindow, isOpen, refreshWindow, toast, bar, escapeHtml } from './dom.js';
import { registerPanel } from './panels.js';
import { game } from '../game.js';
import { pickLang, loc } from '../engine/i18n.js';
import { item, itemName, plant, seedToPlant, func } from '../data/db.js';
import { furnLabel } from '../sim/home.js';
import { startFurnitureFunction } from '../sim/furnActions.js';
import { formatDuration, HOUR, DAY } from '../sim/time.js';
import {
  BOSTON_IVY,
  FARM_OPS,
  WATER_LOW,
  planterCfg,
  planterEnv,
  activeHeaters,
  cropRate,
  estimateRipeIn,
  harvestLeft,
  validateFarmOp,
  canQueuePlanting,
  queueFarm,
  queuePlanting,
  queueVase,
  validateVase,
  farmOpLabel,
  plantResearched,
  capacityOf,
  usedCapacity,
  seedsAtHome,
  fertilizersAtHome,
  flowersAtHome,
  vaseLifeSeconds,
  minGrowTemp,
  isGrowing,
  isLive,
} from '../sim/farming.js';

const CARE_OPS = ['water', 'pest', 'weed', 'harvest', 'clear', 'till', 'remove'];
const CONFIRM = {
  remove: { en: 'Uproot everything in this planter? You will get nothing back.', zh: func(1619)?.confirm || '确定要铲除当前植物吗？' },
  removeDecor: { en: 'Pull out the houseplant and keep the empty pot for planting? It cannot be put back.', zh: func(80028)?.confirm || '确定拔掉绿植吗？' },
};

function longDuration(sec) {
  if (!Number.isFinite(sec)) return '—';
  const d = Math.floor(sec / DAY);
  if (d < 1) return formatDuration(sec);
  const hh = Math.floor((sec % DAY) / HOUR);
  return pickLang({ en: `${d}d ${hh}h`, zh: `${d}天${hh}小时` });
}

const tag = (text, cls = '') => h('span', { class: `tag ${cls}` }, text);
const pill = (text, cls = '') => h('span', { class: `pill ${cls}` }, text);

function opTip(label) {
  if (game.settings.operationTips) game.ui?.opTip?.(label);
}

// Refresh an open window whenever the simulation changes what it shows.
function autoRefresh(id, state, signature) {
  let last = signature();
  const timer = setInterval(() => {
    if (!isOpen(id) || game.state !== state) {
      clearInterval(timer);
      return;
    }
    const now = signature();
    if (now !== last) {
      last = now;
      refreshWindow(id);
    }
  }, 1000);
  return () => clearInterval(timer);
}

function costTip(op) {
  const def = FARM_OPS[op];
  const parts = [pickLang({ en: `${def.min} min`, zh: `${def.min}分钟` })];
  if (def.cost.sta) parts.push(`<span class="bad">${pickLang({ en: 'Stamina', zh: '精力' })} -${def.cost.sta}</span>`);
  return parts.join(' · ');
}

// Unavailable ops stay clickable and explain why instead of silently doing nothing.
function opButton(state, f, op, refresh, { extra = {}, label = farmOpLabel(op), tip = costTip(op), cls = '' } = {}) {
  const ok = validateFarmOp(state, f.uid, op, extra);
  return h(
    'button',
    {
      class: ok === true ? cls : '',
      style: ok === true ? null : { opacity: 0.45 },
      dataset: { tip: ok === true ? tip : escapeHtml(ok) },
      onclick: () => {
        if (ok !== true) return toast(ok, 'bad');
        if (CONFIRM[op] && !window.confirm(pickLang(CONFIRM[op]))) return;
        const a = queueFarm(state, f.uid, op, extra);
        opTip(a.label);
        refresh();
      },
    },
    label
  );
}

// ------------------------------------------------------------------------------ planting panel
function potSignature(state, uid) {
  const f = state.furniture[uid];
  if (!f) return 'gone';
  const env = planterEnv(state, f);
  const crops = (f.data?.crops || []).map(
    (c) => `${c.plantId}:${Math.floor(c.growth * 200)}:${Math.floor((c.water ?? 1) * 20)}:${+!!c.pest}${+!!c.weed}${+!!c.dry}${+!!c.ready}${+!!c.withered}:${Math.floor((c.chill || 0) * 10)}`
  );
  return [f.data?.soil, f.data?.decorPlant, crops.join(','), Math.round(env.temp), Math.round(env.light * 10), state.actions.queue.length, plantResearched(state)].join('|');
}

function envLine(state, f, env) {
  const cfg = planterCfg(f) || {};
  const bits = [
    pill(`${pickLang({ en: 'Space', zh: '空间' })} ${usedCapacity(f)}/${capacityOf(f)}`),
    pill(f.data?.soil === 'tilled' ? pickLang({ en: 'Soil loosened', zh: '已翻土' }) : pickLang({ en: 'Soil not tilled', zh: '未翻土' })),
    pill(env.outdoor ? pickLang({ en: '🌤 Outdoors', zh: '🌤 露天' }) : env.sunlit ? pickLang({ en: '🪟 Sunroom', zh: '🪟 阳光房' }) : pickLang({ en: '🏠 Indoors', zh: '🏠 室内' })),
  ];
  if (env.sun > 0) bits.push(pill(`☀ ${Math.round(env.sun * 50)}%`));
  if (env.lamp > 0) bits.push(pill(`💡 ${pickLang({ en: 'Grow light', zh: '补光' })} ${'★'.repeat(env.lamp)}`));
  if (!env.light) bits.push(pill(pickLang({ en: '🌑 No light', zh: '🌑 无光照' })));
  bits.push(pill(`🌡 ${Math.round(env.temp)}°C`));
  if (env.heated) bits.push(pill(pickLang({ en: '🔥 Heated', zh: '🔥 保温' })));
  if (cfg.NeedPower) bits.push(env.powered ? pill(pickLang({ en: '⚡ Powered', zh: '⚡ 通电' })) : pill(pickLang({ en: '⚡ No power', zh: '⚡ 未通电' }), 'bad'));
  const traits = [];
  if (cfg.GrowthFaster) traits.push(pickLang({ en: `Growth +${Math.round(cfg.GrowthFaster * 100)}%`, zh: `生长+${Math.round(cfg.GrowthFaster * 100)}%` }));
  if (cfg.PestControl) traits.push(pickLang({ en: `Pests ${Math.round(cfg.PestControl * 100)}%`, zh: `虫害${Math.round(cfg.PestControl * 100)}%` }));
  if (cfg.WeedControl) traits.push(pickLang({ en: `Weeds ${Math.round(cfg.WeedControl * 100)}%`, zh: `杂草${Math.round(cfg.WeedControl * 100)}%` }));
  if (cfg.DryControl) traits.push(pickLang({ en: `Drought ${Math.round(cfg.DryControl * 100)}%`, zh: `干旱${Math.round(cfg.DryControl * 100)}%` }));
  return h(
    'div',
    { class: 'col', style: { gap: '4px' } },
    h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '4px' } }, ...bits),
    traits.length ? h('div', { class: 'dim' }, traits.join(' · ')) : null
  );
}

function researchCard(state, f, refresh) {
  return h(
    'div',
    { class: 'card', style: { width: 'auto', margin: '8px 0' } },
    h('h5', {}, pickLang({ en: 'Planting: not mastered', zh: '种植：未掌握' })),
    h('div', { class: 'dim' }, pickLang({ en: 'Study a planting facility once to start earning planting experience. You cannot plant until then.', zh: '研究一次种植设施，开始积累种植经验。在此之前无法种植。' })),
    h('div', {}, opButton(state, f, 'research', refresh, { label: `🔬 ${farmOpLabel('research')}`, cls: 'primary' }))
  );
}

function decorCard(state, f, refresh) {
  const pv = pickLang({ en: 'Morale +3 · Max Morale +2 · once a day', zh: '心态+3 · 心态上限+2 · 每天一次' });
  return h(
    'div',
    { class: 'card', style: { width: 'auto', margin: '8px 0' } },
    h('h5', {}, pickLang({ en: 'Houseplant', zh: '绿植' })),
    h('div', { class: 'dim' }, pickLang({ en: 'A leafy houseplant fills this pot. Watering it lifts your spirits; pull it out to free the pot for something edible.', zh: '盆里是一丛绿植。给它浇浇水能让心情变好；拔了它，空出花盆种点能吃的。' })),
    h(
      'div',
      { class: 'row' },
      opButton(state, f, 'water', refresh, { label: `💧 ${farmOpLabel('water')}`, tip: `${costTip('water')}<br><span class="good">${pv}</span>` }),
      opButton(state, f, 'removeDecor', refresh)
    )
  );
}

function cropRow(state, f, c, env, heaters) {
  const p = plant(c.plantId);
  const status = [];
  if (c.withered) {
    status.push(tag(c.witherCause === 'cold' ? pickLang({ en: 'Frozen', zh: '冻死了' }) : pickLang({ en: 'Withered', zh: '已枯萎' }), 'bad'));
  } else if (c.ready) {
    status.push(tag(pickLang({ en: 'Ripe', zh: '已成熟' })));
    if (c.perfect) status.push(tag(pickLang({ en: '✨ Perfect', zh: '✨ 完美' })));
    if (c.plantId === BOSTON_IVY && env.outdoor) status.push(h('span', { class: 'dim' }, pickLang({ en: 'Covering the walls', zh: '正爬满外墙' })));
    else {
      const hl = harvestLeft(state, c);
      if (hl?.fresh) status.push(h('span', { class: 'dim' }, pickLang({ en: `keeps ${longDuration(hl.left)}`, zh: `还能放${longDuration(hl.left)}` })));
      else if (hl) status.push(h('span', { class: 'warn' }, pickLang({ en: `overripe — withers in ${longDuration(hl.left)}`, zh: `熟过头了——${longDuration(hl.left)}后枯萎` })));
    }
  } else {
    const rate = cropRate(state, f, c, env);
    const eta = estimateRipeIn(state, f, c, heaters);
    status.push(h('span', { class: 'dim' }, eta < Infinity ? pickLang({ en: `ripe in ~${longDuration(eta)}`, zh: `约${longDuration(eta)}后成熟` }) : pickLang({ en: 'not growing', zh: '停止生长' })));
    if (env.temp < minGrowTemp(p)) status.push(tag(pickLang({ en: '🥶 Too cold to grow', zh: '🥶 太冷，停止生长' }), 'bad'));
    else if (p?.light && env.light < p.light) status.push(tag(pickLang({ en: '🌑 Needs more light', zh: '🌑 光照不足' }), 'bad'));
    if (rate > 0 && !c.anomaly) status.push(h('span', { class: 'dim' }, pickLang({ en: 'flawless so far', zh: '全程无异常' })));
  }
  if (c.pest) status.push(tag(pickLang({ en: '🐛 Pests', zh: '🐛 虫害' }), 'bad'));
  if (c.weed) status.push(tag(pickLang({ en: '🌿 Weeds', zh: '🌿 杂草' }), 'bad'));
  if (c.dry) status.push(tag(pickLang({ en: '🏜 Drought', zh: '🏜 干旱' }), 'bad'));
  if (c.chill > 0 && isLive(c)) status.push(tag(pickLang({ en: `❄ Freezing ${Math.round(c.chill * 100)}%`, zh: `❄ 受冻${Math.round(c.chill * 100)}%` }), 'bad'));
  if (c.fertilizer && isGrowing(c)) status.push(tag(`🟫 ${itemName(c.fertilizer)}`));
  return h(
    'div',
    { class: 'list-item', dataset: { tip: escapeHtml(loc(p?.desc || '')) } },
    h('span', { style: { fontSize: '16px' } }, c.withered ? '🥀' : c.ready ? '🧺' : '🌱'),
    h(
      'div',
      { class: 'col', style: { gap: '3px', flex: 1 } },
      h(
        'div',
        { class: 'row', style: { alignItems: 'center' } },
        h('b', {}, loc(p?.zh)),
        h('div', { style: { width: '140px' } }, bar(c.growth * 100, 100, 'hp')),
        h('span', { class: 'dim' }, `${Math.floor(c.growth * 100)}%`)
      ),
      isGrowing(c)
        ? h(
            'div',
            { class: 'row', style: { alignItems: 'center' } },
            h('span', { class: (c.water ?? 1) < WATER_LOW ? 'bad' : 'dim' }, `💧 ${Math.round((c.water ?? 1) * 100)}%`),
            h('div', { style: { width: '80px' } }, bar((c.water ?? 1) * 100, 100, 'sta'))
          )
        : null,
      h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '4px', alignItems: 'center' } }, ...status)
    )
  );
}

function cropList(state, f, env) {
  const crops = f.data?.crops || [];
  if (!crops.length) {
    const text =
      f.data?.soil === 'tilled'
        ? pickLang({ en: 'The soil is loose and ready for seeds.', zh: '土已翻松，可以播种了。' })
        : pickLang({ en: 'Empty. Pick a seed below — the soil is tilled first.', zh: '空花盆。在下方选择种子，会先翻土再播种。' });
    return h('div', { class: 'dim', style: { margin: '8px 0' } }, text);
  }
  const heaters = activeHeaters(state);
  return h('div', { class: 'list', style: { margin: '8px 0' } }, ...crops.map((c) => cropRow(state, f, c, env, heaters)));
}

function coldWarning(state, f, env) {
  const exposed = env.coldWave && !env.heated && env.temp < 5 && (f.data?.crops || []).some((c) => isLive(c) && !plant(c.plantId)?.cold);
  if (!exposed) return null;
  return h('div', { class: 'bad', style: { margin: '4px 0' } }, pickLang({ en: '❄ Cold wave! Cold-sensitive crops here will freeze — add heating or move the pot indoors.', zh: '❄ 寒潮来袭！这里不耐寒的作物会被冻死——给花盆加热或搬进室内。' }));
}

function fertilizerRow(state, f, ui, refresh) {
  const list = fertilizersAtHome(state);
  if (!ui.fert) ui.fert = (list.find((x) => x.n > 0) || list[0]).id;
  const sel = list.find((x) => x.id === ui.fert);
  return h(
    'div',
    { class: 'col', style: { marginTop: '10px' } },
    h('div', { class: 'sec-title' }, pickLang({ en: 'Fertilizer', zh: '肥料' })),
    h(
      'div',
      { class: 'row', style: { flexWrap: 'wrap', alignItems: 'center', gap: '6px' } },
      ...list.map(({ id, n, bonus }) =>
        h(
          'button',
          { class: ui.fert === id ? 'primary' : '', style: n > 0 ? null : { opacity: 0.6 }, onclick: () => ((ui.fert = id), refresh()) },
          `${itemName(id)} ×${n} (+${Math.round(bonus * 100)}%)`
        )
      ),
      opButton(state, f, 'fertilize', refresh, { extra: { fertId: ui.fert }, label: `🟫 ${farmOpLabel('fertilize')}` })
    ),
    sel && sel.n <= 0 ? h('div', { class: 'bad' }, pickLang({ en: 'Not enough fertilizer', zh: '肥料不足' })) : null,
    h('div', { class: 'dim' }, pickLang({ en: 'Toilet trips and the compost bin turn waste into fertilizer.', zh: '上厕所和堆肥箱都能产出肥料。' }))
  );
}

function seedInfo(p) {
  const light = [pickLang({ en: '🌑 Shade', zh: '🌑 耐阴' }), pickLang({ en: '☀ Some light', zh: '☀ 需要光照' }), pickLang({ en: '☀☀ Full sun', zh: '☀☀ 需要强光' })][p.light || 0];
  const cold = p.cold ? pickLang({ en: `❄ Hardy ${p.cold}`, zh: `❄ 耐寒${p.cold}` }) : pickLang({ en: '❄ Frost-tender', zh: '❄ 不耐寒' });
  return [pickLang({ en: `Space ${p.size}`, zh: `空间${p.size}` }), light, cold, `⏱ ${longDuration(p.grow)}`].join(' · ');
}

function seedList(state, f, ui, refresh) {
  const seeds = seedsAtHome(state);
  const living = (f.data?.crops || []).filter(isLive).reduce((n, c) => n + (c.size || 1), 0);
  const room = capacityOf(f) - living;
  const plantButton = (seedId, count, label) => {
    const ok = canQueuePlanting(state, f.uid, seedId, count);
    const prep = f.data?.soil === 'tilled' && !(f.data?.crops || []).some((c) => c.withered) ? '' : pickLang({ en: 'Tills the soil first · ', zh: '会先翻土 · ' });
    return h(
      'button',
      {
        class: ok === true ? 'primary' : '',
        style: ok === true ? null : { opacity: 0.45 },
        dataset: { tip: ok === true ? `${prep}${costTip('plant')}` : escapeHtml(ok) },
        onclick: () => {
          if (ok !== true) return toast(ok, 'bad');
          const list = queuePlanting(state, f.uid, seedId, { count, fertId: ui.autoFert ? ui.fert : 0 });
          opTip(list.map((a) => a.label).join(' → '));
          refresh();
        },
      },
      label
    );
  };
  const rows = seeds.map(({ id, n }) => {
    const p = plant(seedToPlant[id]);
    const fill = Math.min(n, Math.floor(room / (p.size || 1)));
    return h(
      'div',
      { class: 'list-item', dataset: { tip: escapeHtml(loc(p.desc)) } },
      h('span', { style: { fontSize: '16px' } }, '🌱'),
      h('div', { class: 'col', style: { gap: '2px', flex: 1 } }, h('b', {}, `${itemName(id)} ×${n}`), h('span', { class: 'dim' }, seedInfo(p))),
      plantButton(id, 1, farmOpLabel('plant')),
      fill > 1 ? plantButton(id, fill, pickLang({ en: `Fill ×${fill}`, zh: `种满×${fill}` })) : null
    );
  });
  return h(
    'div',
    { class: 'col', style: { marginTop: '10px' } },
    h(
      'div',
      { class: 'row', style: { alignItems: 'center' } },
      h('span', { class: 'sec-title' }, pickLang({ en: 'Seeds at home', zh: '家中的种子' })),
      h('span', { class: 'spacer' }),
      h(
        'label',
        { class: 'dim' },
        h('input', { type: 'checkbox', checked: ui.autoFert ? true : null, onchange: (e) => (ui.autoFert = e.target.checked) }),
        ' ',
        pickLang({ en: 'Fertilize after planting', zh: '种下后施肥' })
      )
    ),
    rows.length
      ? h('div', { class: 'list', style: { maxHeight: '260px', overflowY: 'auto' } }, ...rows)
      : h('div', { class: 'dim' }, pickLang({ en: "No seeds at home. Buy them at the Farmers' Market before the outbreak, trade for them, or keep seeds from harvests.", zh: '家里没有种子。灾变前可以去农贸市场买，之后可以交易或在收获时留种。' }))
  );
}

function buildPlantPanel(body, state, uid, ui) {
  const f = state.furniture[uid];
  if (!f) {
    body.appendChild(h('div', { class: 'dim' }, pickLang({ en: 'This planter is gone.', zh: '这个花盆已经不在了。' })));
    return;
  }
  const refresh = () => refreshWindow(`plant-${uid}`);
  const env = planterEnv(state, f);
  body.appendChild(envLine(state, f, env));
  if (!plantResearched(state)) body.appendChild(researchCard(state, f, refresh));
  if (f.data?.decorPlant) {
    body.appendChild(decorCard(state, f, refresh));
    return;
  }
  const warning = coldWarning(state, f, env);
  if (warning) body.appendChild(warning);
  body.appendChild(cropList(state, f, env));
  body.appendChild(h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } }, ...CARE_OPS.map((op) => opButton(state, f, op, refresh))));
  body.appendChild(fertilizerRow(state, f, ui, refresh));
  body.appendChild(seedList(state, f, ui, refresh));
}

registerPanel('plant', ({ furn: uid }) => {
  const state = game.state;
  const f = state?.furniture[uid];
  if (!f) return;
  const id = `plant-${uid}`;
  const ui = { fert: 0, autoFert: false };
  let stop = null;
  const win = openWindow(id, { title: furnLabel(f), width: 600, build: (body) => buildPlantPanel(body, state, uid, ui), onClose: () => stop?.() });
  stop = autoRefresh(id, state, () => potSignature(state, uid));
  return win;
});

// ------------------------------------------------------------------------------ vase panel
function vaseSignature(state, uid) {
  const fl = state.furniture[uid]?.data?.flower;
  const flowers = flowersAtHome(state)
    .map((x) => `${x.id}:${x.n}`)
    .join(',');
  return `${fl?.id}|${fl?.wilted}|${fl ? Math.floor((fl.until - state.clock.t) / HOUR) : ''}|${flowers}`;
}

function buildVasePanel(body, state, uid) {
  const f = state.furniture[uid];
  if (!f) {
    body.appendChild(h('div', { class: 'dim' }, pickLang({ en: 'This vase is gone.', zh: '这个花瓶已经不在了。' })));
    return;
  }
  const refresh = () => refreshWindow(`vase-${uid}`);
  const fl = f.data?.flower;
  let current;
  if (!fl) current = h('div', { class: 'dim' }, pickLang({ en: 'The vase is empty. A fresh flower makes the place feel like home again.', zh: '花瓶是空的。插一枝花，让屋子还像个家。' }));
  else if (fl.wilted) current = h('div', { class: 'bad' }, pickLang({ en: `🥀 The ${itemName(fl.id)} has wilted.`, zh: `🥀 ${itemName(fl.id)}已经枯萎了。` }));
  else {
    current = h(
      'div',
      {},
      h('b', {}, `🌸 ${itemName(fl.id)}`),
      h('span', { class: 'dim' }, pickLang({ en: ` · fresh for ${longDuration(fl.until - state.clock.t)} · `, zh: ` · 还能鲜艳${longDuration(fl.until - state.clock.t)} · ` })),
      h('span', { class: 'good' }, pickLang({ en: `Morale +${fl.mor.toFixed(2)}/h at home`, zh: `在家时心态每小时+${fl.mor.toFixed(2)}` }))
    );
  }
  body.appendChild(
    h(
      'div',
      { class: 'row', style: { alignItems: 'center' } },
      h('div', { style: { flex: 1 } }, current),
      fl
        ? h(
            'button',
            {
              onclick: () => {
                const a = startFurnitureFunction(state, uid, 2108);
                if (a) opTip(a.label);
                refresh();
              },
            },
            pickLang({ en: 'Clear', zh: '清理' })
          )
        : null
    )
  );
  const flowers = flowersAtHome(state);
  const rows = flowers.map(({ id, n }) => {
    const ok = validateVase(state, uid, id);
    const cfg = item(id);
    return h(
      'div',
      { class: 'list-item' },
      h('span', { style: { fontSize: '16px' } }, '🌸'),
      h(
        'div',
        { class: 'col', style: { gap: '2px', flex: 1 } },
        h('b', {}, `${itemName(id)} ×${n}`),
        h('span', { class: 'dim' }, pickLang({ en: `Lasts ${longDuration(vaseLifeSeconds(cfg))} · Morale +${(cfg.vaseMor || 0).toFixed(2)}/h`, zh: `可保持${longDuration(vaseLifeSeconds(cfg))} · 心态每小时+${(cfg.vaseMor || 0).toFixed(2)}` }))
      ),
      h(
        'button',
        {
          class: ok === true ? 'primary' : '',
          dataset: { tip: fl ? pickLang({ en: 'Replaces the flower in the vase', zh: '会替换瓶里原来的花' }) : '' },
          onclick: () => {
            if (ok !== true) return toast(ok, 'bad');
            opTip(queueVase(state, uid, id).label);
            refresh();
          },
        },
        pickLang({ en: 'Arrange', zh: '插花' })
      )
    );
  });
  body.appendChild(h('div', { class: 'sec-title', style: { marginTop: '10px' } }, pickLang({ en: 'Flowers at home', zh: '家中的花' })));
  body.appendChild(
    rows.length
      ? h('div', { class: 'list' }, ...rows)
      : h('div', { class: 'dim' }, pickLang({ en: 'No flowers at home. Grow daisies, pansies, marigolds, cosmos or petunias in a sunny spot.', zh: '家里没有花。在光照充足的地方种些雏菊、三色堇、金盏菊、波斯菊或矮牵牛吧。' }))
  );
}

registerPanel('vase', ({ furn: uid }) => {
  const state = game.state;
  const f = state?.furniture[uid];
  if (!f) return;
  const id = `vase-${uid}`;
  let stop = null;
  const win = openWindow(id, { title: furnLabel(f), width: 440, build: (body) => buildVasePanel(body, state, uid), onClose: () => stop?.() });
  stop = autoRefresh(id, state, () => vaseSignature(state, uid));
  return win;
});
