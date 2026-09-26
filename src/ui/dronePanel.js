// Drone panels: cargo hold, trading with strangers (posts and contacts), help requests, supply drops
// to the survivor network and the Warehouse Manager rescue. Offers are picked from the backpack,
// refrigerators and tool cabinets directly (patch 08-19 trading tabs).
import { h, openWindow, refreshWindow, isOpen, toast } from './dom.js';
import { registerPanel, reasonText, quickUse } from './panels.js';
import { renderGrid, weightLine } from './invgrid.js';
import { game } from '../game.js';
import { pickLang, tr } from '../engine/i18n.js';
import { on } from '../engine/bus.js';
import { item, itemName, CAT } from '../data/db.js';
import { moveItem, organize, findUid } from '../sim/inventory.js';
import {
  listDrones, droneStatusText, droneBlock, droneCapacityKg, tradeQuota, tradeSources, tradePartners, partnerStock,
  buyPrice, sellValue, offerValue, takeWeightKg, maxBuyable, executeTrade, pendingHelp, networkSurvivors, aliveNetworkSurvivors,
  respondHelp, deliverSupplies, rescueDeliver, wmState, survivorName, foodSat, shieldState, queueDroneOp,
} from '../sim/social.js';
import { POST_BY_ID, MIN_AID_SAT, SURVIVOR_MAX_FOOD, WM_DELIVERIES, WAREHOUSE_MANAGER } from '../content/people.js';

const PANELS = ['droneCargo', 'droneTrade', 'droneHelp', 'droneDeliver', 'droneRescue'];
on('droneReturned', () => PANELS.forEach((p) => isOpen(p) && refreshWindow(p)));
on('droneDispatched', () => PANELS.forEach((p) => isOpen(p) && refreshWindow(p)));

const dim = (text) => h('div', { class: 'dim', style: { maxWidth: '520px' } }, text);

function atHome(state) {
  if (state?.player.scene === 'home') return true;
  toast(pickLang({ en: 'The drone is at home.', zh: '无人机在家里。' }), 'bad');
  return false;
}

function report(r, okText) {
  if (r?.ok) toast(okText || pickLang({ en: 'The drone takes off.', zh: '无人机起飞了。' }), 'good');
  else if (r) toast(r.reason, 'bad');
}

// Drone selector + Shield of the Street banner.
function droneBar(state, ctx, refresh) {
  const drones = listDrones(state);
  if (!drones.length) return dim(pickLang({ en: 'No drone installed. Install a drone package in Planning Mode (tabletop slot).', zh: '还没有安装无人机。在规划模式里把无人机包裹装到桌面位上。' }));
  const cur = drones.find((d) => d.uid === ctx.drone) || drones[0];
  ctx.drone = cur.uid;
  const out = h(
    'div',
    { class: 'col' },
    h(
      'div',
      { class: 'tabs' },
      ...drones.map((d, i) =>
        h('button', { class: d.uid === cur.uid ? 'on' : '', onclick: () => ((ctx.drone = d.uid), refresh()) }, `🚁 ${pickLang({ en: 'Drone', zh: '无人机' })} ${i + 1} · ${droneStatusText(state, d)}`)
      )
    )
  );
  const a = shieldState(state).active;
  if (a && !a.luring) {
    out.appendChild(
      h(
        'div',
        { class: 'list-item', style: { borderColor: '#b5443a' } },
        h('span', { class: 'bad' }, pickLang({ en: `${pickLang(POST_BY_ID[a.post].name)} is besieged by a horde.`, zh: `${pickLang(POST_BY_ID[a.post].name)}被尸潮围困。` })),
        h('span', { class: 'spacer' }),
        h('button', { class: 'primary', onclick: () => (report(queueDroneOp(state, 'lure', { post: a.post, drone: ctx.drone }), pickLang({ en: 'Heading to the drone controls.', zh: '去操控无人机。' })), refresh()) }, pickLang({ en: 'Lure it to your door (24 h)', zh: '引到自家门口（24小时）' }))
      )
    );
  }
  return out;
}

export function picksArray(state, ctx) {
  const out = [];
  for (const [uid, invId] of [...ctx.picks]) {
    const inv = state.inventories[invId];
    if (inv && findUid(inv, uid)) out.push({ inv: invId, uid });
    else ctx.picks.delete(uid);
  }
  return out;
}

// Source tabs (backpack / refrigerator / tool cabinet / cargo) with click-to-pick grids.
export function picker(state, ctx, refresh, { foodOnly = false, partner = null } = {}) {
  const sources = tradeSources(state);
  const src = sources.find((s) => s.key === ctx.src) || sources[0];
  ctx.src = src.key;
  const grids = src.invs.map((invId) =>
    renderGrid(state, invId, {
      readonly: true,
      cellPx: 30,
      mark: (inst) => ctx.picks.has(inst.uid),
      onSelect: (inst) => {
        if (ctx.picks.has(inst.uid)) ctx.picks.delete(inst.uid);
        else if (foodOnly && item(inst.id)?.cat !== CAT.FOOD) return toast(pickLang({ en: 'Only food will do.', zh: '只能给食物。' }), 'bad');
        else ctx.picks.set(inst.uid, invId);
        refresh();
      },
      tipExtra: (inst) => {
        if (partner) {
          const v = sellValue(state, partner, inst);
          return v == null ? `<span class="bad">${pickLang({ en: 'They do not buy this', zh: '对方不收' })}</span>` : `${pickLang({ en: 'Offer value', zh: '交易价值' })} ${Math.floor(v)}`;
        }
        const sat = foodSat(inst);
        return sat ? `${tr('stat.sat')} ${Math.round(sat)}` : '';
      },
    })
  );
  return h(
    'div',
    { class: 'col' },
    h('div', { class: 'tabs' }, ...sources.map((s) => h('button', { class: s.key === src.key ? 'on' : '', onclick: () => ((ctx.src = s.key), refresh()) }, pickLang(s.label)))),
    h('div', { class: 'dim', style: { fontSize: '12px' } }, pickLang({ en: 'Click items to add or remove them (★).', zh: '点击物品加入或取消（★）。' })),
    ...grids
  );
}

export function pickedList(state, ctx, valueOf) {
  const picks = picksArray(state, ctx);
  if (!picks.length) return dim(pickLang({ en: 'Nothing picked yet.', zh: '还没有选择物品。' }));
  return h(
    'div',
    { class: 'list', style: { maxHeight: '160px', overflowY: 'auto' } },
    ...picks.map(({ inv, uid }) => {
      const inst = findUid(state.inventories[inv], uid);
      const v = valueOf(inst);
      return h(
        'div',
        { class: 'list-item' },
        h('span', {}, itemName(inst.id)),
        h('span', { class: 'spacer' }),
        h('span', { class: v == null ? 'bad' : 'dim' }, v == null ? pickLang({ en: 'refused', zh: '不收' }) : String(Math.floor(v))),
        h('button', { onclick: () => (ctx.picks.delete(uid), refreshWindow(ctx.win)) }, '✕')
      );
    })
  );
}

// ------------------------------------------------------------------------------ cargo hold
registerPanel('droneCargo', (c = {}) => {
  const state = game.state;
  if (!atHome(state)) return;
  const ctx = { drone: c.furn ?? null };
  openWindow('droneCargo', {
    title: pickLang({ en: 'Drone Cargo Hold', zh: '无人机货舱' }),
    width: 'auto',
    build: (body) => {
      const refresh = () => refreshWindow('droneCargo');
      body.appendChild(droneBar(state, ctx, refresh));
      const d = listDrones(state).find((x) => x.uid === ctx.drone);
      if (!d) return;
      const bp = state.player.backpack;
      const cargo = state.inventories[d.cargo];
      const onError = (r) => toast(reasonText(r), 'bad');
      body.appendChild(
        h(
          'div',
          { class: 'row' },
          h(
            'div',
            { class: 'col' },
            h('div', { class: 'row' }, h('span', { class: 'sec-title' }, pickLang({ en: 'Cargo', zh: '货舱' })), h('span', { class: 'dim' }, weightLine(state, d.cargo))),
            renderGrid(state, d.cargo, { onChange: refresh, transferTo: () => bp, onError, mark: (inst) => (d.gifts || []).includes(inst.uid), onUse: (i) => quickUse(state, d.cargo, i) }),
            h(
              'div',
              { class: 'row' },
              h('button', { onclick: () => (cargo.items.slice().forEach((it) => moveItem(state, cargo, it.uid, state.inventories[bp], null, null, { allowOverweight: true })), refresh()) }, tr('ui.takeAll')),
              h('button', { onclick: () => (organize(cargo), refresh()) }, tr('ui.organize'))
            ),
            (d.gifts || []).length ? dim(pickLang({ en: '★ Return gifts must be collected before this drone can fly again.', zh: '★ 回礼取出之后，这架无人机才能再次起飞。' })) : null
          ),
          h(
            'div',
            { class: 'col' },
            h('div', { class: 'row' }, h('span', { class: 'sec-title' }, tr('ui.inventory')), h('span', { class: 'dim' }, weightLine(state, bp))),
            renderGrid(state, bp, { onChange: refresh, transferTo: () => d.cargo, onError, onUse: (i) => quickUse(state, bp, i) })
          )
        )
      );
    },
  });
});

// ------------------------------------------------------------------------------ trade
function stockRow(state, ctx, e, refresh) {
  const q = ctx.take.get(e.id) || 0;
  const takeList = () => [...ctx.take].map(([id, qty]) => ({ id, qty }));
  const set = (n) => {
    const v = Math.max(0, Math.min(n, maxBuyable(state, ctx.partner, e.id, takeList())));
    if (v) ctx.take.set(e.id, v);
    else ctx.take.delete(e.id);
    refresh();
  };
  return h(
    'div',
    { class: `list-item ${q ? 'sel' : ''}` },
    h('span', { style: { minWidth: '150px' } }, itemName(e.id)),
    h('span', { class: 'dim' }, `${pickLang({ en: 'value', zh: '价值' })} ${e.price}`),
    h('span', { class: 'dim' }, `×${e.qty}`),
    h('span', { class: 'spacer' }),
    h('button', { onclick: () => set(q - 1), disabled: q ? null : true }, '−'),
    h('span', { style: { minWidth: '18px', textAlign: 'center' } }, String(q)),
    h('button', { onclick: () => set(q + 1) }, '+'),
    h('button', { dataset: { tip: pickLang({ en: 'Buy as many as the drone can carry', zh: '买到无人机装满为止' }) }, onclick: () => set(e.qty) }, pickLang({ en: 'Max', zh: '最多' }))
  );
}

registerPanel('droneTrade', (c = {}) => {
  const state = game.state;
  if (!atHome(state)) return;
  const ctx = { win: 'droneTrade', drone: c.furn ?? null, partner: c.partner || null, picks: new Map(), take: new Map(), src: null };
  openWindow('droneTrade', {
    title: pickLang({ en: 'Drone Trade', zh: '无人机交易' }),
    width: 'auto',
    build: (body) => {
      const refresh = () => refreshWindow('droneTrade');
      body.appendChild(droneBar(state, ctx, refresh));
      const d = listDrones(state).find((x) => x.uid === ctx.drone);
      if (!d) return;
      const partners = tradePartners(state);
      if (!partners.length) {
        body.appendChild(dim(pickLang({ en: 'Nobody to trade with yet. Trading posts come on the air over the first weeks, and survivors you met before the disaster may text you.', zh: '暂时没有交易对象。交易点会在头几个星期陆续上线，灾前认识的幸存者也可能给你发短信。' })));
        return;
      }
      if (!partners.some((p) => p.id === ctx.partner)) {
        ctx.partner = partners[0].id;
        ctx.take.clear();
      }
      const partner = partners.find((p) => p.id === ctx.partner);
      const takeList = [...ctx.take].map(([id, qty]) => ({ id, qty }));
      const offer = offerValue(state, ctx.partner, picksArray(state, ctx));
      const price = takeList.reduce((a, x) => a + buyPrice(state, ctx.partner, x.id) * x.qty, 0);
      const load = takeWeightKg(takeList);
      const cap = droneCapacityKg(state);
      const block = droneBlock(state, d, 'trade');
      const ok = block === true && takeList.length && !offer.refused.length && offer.value + 1e-6 >= price && load <= cap + 1e-6;
      body.appendChild(
        h(
          'div',
          { class: 'row' },
          h(
            'div',
            { class: 'list', style: { width: '200px' } },
            h('div', { class: 'sec-title' }, pickLang({ en: 'Partners', zh: '交易对象' })),
            ...partners.map((p) =>
              h(
                'div',
                { class: `list-item ${p.id === ctx.partner ? 'sel' : ''}`, style: { cursor: 'pointer' }, onclick: () => ((ctx.partner = p.id), ctx.take.clear(), refresh()) },
                h('span', {}, p.kind === 'post' ? '📡' : '👤'),
                h('span', {}, pickLang(p.name)),
                h('span', { class: 'spacer' }),
                p.damaged ? h('span', { class: 'pill bad' }, pickLang({ en: 'damaged', zh: '受损' })) : null,
                p.deals ? h('span', { class: 'dim' }, `×${p.deals}`) : null
              )
            )
          ),
          h(
            'div',
            { class: 'col', style: { minWidth: '330px' } },
            h('div', { class: 'sec-title' }, pickLang({ en: 'Their shelves', zh: '对方货架' })),
            partner.blurb ? dim(pickLang(partner.blurb)) : null,
            partner.kind === 'post' ? dim(pickLang({ en: 'Buys its own specialty at half value and never buys what it sells.', zh: '自家主营的物资只按半价收，自己在卖的东西不收。' })) : null,
            h('div', { class: 'list', style: { maxHeight: '300px', overflowY: 'auto' } }, ...partnerStock(state, ctx.partner).map((e) => stockRow(state, ctx, e, refresh)))
          ),
          h(
            'div',
            { class: 'col' },
            h('div', { class: 'sec-title' }, pickLang({ en: 'Your offer', zh: '你的出价' })),
            picker(state, ctx, refresh, { partner: ctx.partner }),
            pickedList(state, ctx, (inst) => sellValue(state, ctx.partner, inst))
          )
        )
      );
      body.appendChild(
        h(
          'div',
          { class: 'row', style: { alignItems: 'center', marginTop: '8px' } },
          h('span', { class: offer.value + 1e-6 >= price ? 'good' : 'bad' }, `${pickLang({ en: 'Offer', zh: '出价' })} ${Math.floor(offer.value)} / ${pickLang({ en: 'Price', zh: '价格' })} ${price}`),
          h('span', { class: load > cap ? 'bad' : 'dim' }, `${load.toFixed(1)} / ${cap} kg`),
          h('span', { class: 'dim' }, `${pickLang({ en: 'Trades today', zh: '今日交易' })} ${d.dailyTrades}/${tradeQuota(state)}`),
          offer.value > price + 5 ? h('span', { class: 'warn' }, pickLang({ en: 'Overpaying: the surplus is lost', zh: '多付的部分不会找零' })) : null,
          h('span', { class: 'spacer' }),
          block !== true ? h('span', { class: 'bad' }, block) : null,
          h(
            'button',
            {
              class: 'primary',
              disabled: ok ? null : true,
              onclick: () => {
                const r = executeTrade(state, { drone: ctx.drone, partner: ctx.partner, give: picksArray(state, ctx), take: takeList });
                report(r, pickLang({ en: 'Deal struck. The drone is on its way.', zh: '成交，无人机出发了。' }));
                if (r.ok) {
                  ctx.picks.clear();
                  ctx.take.clear();
                }
                refresh();
              },
            },
            pickLang({ en: 'Send the drone', zh: '派出无人机' })
          )
        )
      );
    },
  });
});

// ------------------------------------------------------------------------------ aid (help / supply drop / rescue)
function aidFooter(state, ctx, label, onSend) {
  const picks = picksArray(state, ctx);
  const sat = picks.reduce((a, { inv, uid }) => a + foodSat(findUid(state.inventories[inv], uid)), 0);
  return h(
    'div',
    { class: 'row', style: { alignItems: 'center', marginTop: '8px' } },
    h('span', { class: sat >= MIN_AID_SAT ? 'good' : 'dim' }, `${tr('stat.sat')} ${Math.round(sat)} (${pickLang({ en: 'min', zh: '至少' })} ${MIN_AID_SAT})`),
    h('span', { class: 'spacer' }),
    h('button', { class: 'primary', disabled: sat >= MIN_AID_SAT ? null : true, onclick: onSend }, label)
  );
}

function foodBar(days) {
  const pct = Math.max(0, Math.min(100, (days / SURVIVOR_MAX_FOOD) * 100));
  return h('div', { class: 'bar sat', style: { width: '80px' } }, h('div', { class: 'bar-fill', style: { width: `${pct}%` } }));
}

function aidPanel(id, title, { list, empty, rowInfo, send, sendLabel, intro }) {
  registerPanel(id, (c = {}) => {
    const state = game.state;
    if (!atHome(state)) return;
    const ctx = { win: id, drone: c.furn ?? null, survivor: c.survivor || null, picks: new Map(), src: null };
    openWindow(id, {
      title: pickLang(title),
      width: 'auto',
      build: (body) => {
        const refresh = () => refreshWindow(id);
        body.appendChild(droneBar(state, ctx, refresh));
        if (!listDrones(state).length) return;
        if (intro) body.appendChild(dim(intro(state)));
        const people = list(state);
        if (!people.length) {
          body.appendChild(dim(pickLang(empty)));
          return;
        }
        if (!people.some((p) => p.id === ctx.survivor)) ctx.survivor = people[0].id;
        body.appendChild(
          h(
            'div',
            { class: 'row' },
            h(
              'div',
              { class: 'list', style: { width: '240px' } },
              ...people.map((sv) =>
                h(
                  'div',
                  { class: `list-item ${sv.id === ctx.survivor ? 'sel' : ''}`, style: { cursor: 'pointer' }, onclick: () => ((ctx.survivor = sv.id), refresh()) },
                  h('span', {}, pickLang(survivorName(sv))),
                  h('span', { class: 'spacer' }),
                  rowInfo(sv)
                )
              )
            ),
            h('div', { class: 'col' }, picker(state, ctx, refresh, { foodOnly: true }), pickedList(state, ctx, (inst) => foodSat(inst)))
          )
        );
        body.appendChild(
          aidFooter(state, ctx, pickLang(sendLabel), () => {
            const r = send(state, { drone: ctx.drone, survivor: ctx.survivor, give: picksArray(state, ctx) });
            report(r);
            if (r.ok) ctx.picks.clear();
            refresh();
          })
        );
      },
    });
  });
}

aidPanel('droneHelp', { en: 'Respond to Help Requests', zh: '回应求助' }, {
  list: pendingHelp,
  empty: { en: 'Nobody is asking for help right now.', zh: '现在没有人求助。' },
  rowInfo: () => h('span', { class: 'warn' }, pickLang({ en: 'needs food', zh: '需要食物' })),
  send: respondHelp,
  sendLabel: { en: 'Send food (joins your network)', zh: '送去食物（加入补给网络）' },
  intro: () => pickLang({ en: "Once you send food, their food countdown starts — keep them supplied or they won't make it.", zh: '一旦送去食物，他们的口粮倒计时就开始了——要持续补给，否则他们撑不下去。' }),
});

aidPanel('droneDeliver', { en: 'Supply Drop', zh: '投送物资' }, {
  list: networkSurvivors,
  empty: { en: 'No one has joined your supply network yet. Answer help requests first.', zh: '还没有人加入你的补给网络。先回应求助。' },
  rowInfo: (sv) => h('span', { class: 'row', style: { alignItems: 'center', gap: '4px' } }, foodBar(sv.food), h('span', { class: sv.food <= 2 ? 'bad' : 'dim' }, pickLang({ en: `${Math.max(0, sv.food).toFixed(1)} d`, zh: `${Math.max(0, sv.food).toFixed(1)}天` }))),
  send: deliverSupplies,
  sendLabel: { en: 'Drop supplies', zh: '投送物资' },
  intro: (state) => {
    const alive = aliveNetworkSurvivors(state);
    const web = state.progress.counters['camp.prep.supply'] || 0;
    return pickLang({ en: `Supported survivors alive: ${alive}.${state.story?.route === 'stranger' ? ` Deliveries on the stranger path: ${web}/12.` : ''}`, zh: `存活的受助幸存者：${alive}人。${state.story?.route === 'stranger' ? `陌生人路线投送：${web}/12。` : ''}` });
  },
});

registerPanel('droneRescue', (c = {}) => {
  const state = game.state;
  if (!atHome(state)) return;
  const ctx = { win: 'droneRescue', drone: c.furn ?? null, picks: new Map(), src: null };
  openWindow('droneRescue', {
    title: pickLang({ en: 'Rescue: Warehouse Manager', zh: '救助：仓库管理员' }),
    width: 'auto',
    build: (body) => {
      const refresh = () => refreshWindow('droneRescue');
      body.appendChild(droneBar(state, ctx, refresh));
      const wm = wmState(state);
      if (!wm?.active) {
        body.appendChild(dim(pickLang({ en: 'Nobody to rescue. (A note in the Ruined Supermarket truck might change that.)', zh: '没有需要救助的人。（废弃超市货车里的字条也许会改变这一点。）' })));
        return;
      }
      if (wm.done) {
        body.appendChild(dim(pickLang(WAREHOUSE_MANAGER.done)));
        return;
      }
      body.appendChild(h('div', {}, `${pickLang(WAREHOUSE_MANAGER.name)}: ${wm.deliveries}/${WM_DELIVERIES}`, h('span', { class: 'dim' }, pickLang({ en: ' · one delivery per day, any food', zh: ' · 每天一次，什么吃的都行' }))));
      body.appendChild(h('div', { class: 'col' }, picker(state, ctx, refresh, { foodOnly: true }), pickedList(state, ctx, (inst) => foodSat(inst))));
      body.appendChild(
        aidFooter(state, ctx, pickLang({ en: 'Send the rescue drone', zh: '派出救助无人机' }), () => {
          const r = rescueDeliver(state, { drone: ctx.drone, give: picksArray(state, ctx) });
          report(r);
          if (r.ok) ctx.picks.clear();
          refresh();
        })
      );
    },
  });
});
