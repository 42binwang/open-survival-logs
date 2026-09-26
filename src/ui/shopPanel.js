// Shop scenes (walkable isometric rooms) and the pre-disaster panels: shelves, car lot, trunk,
// doorstep deliveries, used-furniture buyer, returns desk, NPC talk, doomsday rush, black market
// and items dropped on a shop floor.
import { h, openWindow, closeWindow, refreshWindows, toast } from './dom.js';
import { registerPanel, openPanel, reasonText, quickUse } from './panels.js';
import { renderGrid, weightLine, itemIcon, itemColor, itemTooltip } from './invgrid.js';
import { registerView, playerMotion } from './view.js';
import { game } from '../game.js';
import { pickLang, tr, loc } from '../engine/i18n.js';
import { on } from '../engine/bus.js';
import { item, itemName, furn, CAT } from '../data/db.js';
import { CELL, cellAt } from '../sim/scene.js';
import { moveItem, usedCells } from '../sim/inventory.js';
import { furnLabel, homeDef } from '../sim/home.js';
import { secondsUntilOutbreak, formatDuration } from '../sim/time.js';
import { CHARACTERS } from '../content/characters.js';
import { SHOPS, SHOP_FLOOR, SHOP_NPCS, CARS, RUSH, BLOOD_PRICE, ANEMIA_HOURS } from '../content/shops.js';
import {
  currentShop,
  shopGrid,
  shopFixtures,
  shopNpcs,
  fixtureLabel,
  interactFixture,
  talkToNpc,
  pickUpGround,
  groundInv,
  trunkInv,
  shelfDef,
  shelfOffers,
  bulkDiscount,
  buy,
  buyCar,
  returnCar,
  preReason,
  locationName,
  doorstepInv,
  pawnableFurniture,
  pawnPrice,
  pawnFurniture,
  returnablePackages,
  returnPackage,
  rushBlocked,
  startRush,
  startSellBlood,
} from '../sim/predisaster.js';

const SHOP_WINDOWS = ['shop', 'carShop', 'trunk', 'returns', 'pawn', 'npcTalk', 'rush', 'blackMarket', 'shopGround'];
const HIT_OFFSETS = [
  [0, 0],
  [0.6, 0.6],
  [1.1, 1.1],
];

// ------------------------------------------------------------------------------ scene view
function pickFixture(fixtures, wx, wy) {
  let best = null;
  for (const f of fixtures) {
    for (const [ox, oy] of HIT_OFFSETS.slice(0, 2)) {
      const x = wx + ox;
      const y = wy + oy;
      if (x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h && (!best || f.x + f.y > best.x + best.y)) best = f;
    }
  }
  return best;
}

function onShopClick(state, shopId, grid, fixtures, npcs, wx, wy) {
  const f = pickFixture(fixtures, wx, wy);
  if (f) {
    if (interactFixture(state, f.id) && game.settings.operationTips) game.ui?.opTip?.(`→ ${fixtureLabel(f)}`);
    return true;
  }
  const npc = npcs.find((n) => HIT_OFFSETS.some(([ox, oy]) => Math.floor(wx + ox) === n.x && Math.floor(wy + oy) === n.y));
  if (npc) {
    talkToNpc(state, npc.id);
    return true;
  }
  const tx = Math.floor(wx);
  const ty = Math.floor(wy);
  if (cellAt(grid, tx, ty) === CELL.DOOR) {
    openPanel('map');
    return true;
  }
  const [gx, gy] = SHOPS[shopId].ground;
  if (tx === gx && ty === gy && groundInv(state, shopId)?.items.length) {
    pickUpGround(state);
    return true;
  }
  return false;
}

registerView('shop', (state) => {
  const shopId = currentShop(state);
  const shop = SHOPS[shopId];
  const grid = shopGrid(shopId);
  const fixtures = shopFixtures(state, shopId);
  const npcs = shopNpcs(state, shopId);
  const p = state.player;
  const entities = npcs.map((n) => ({ x: n.x, y: n.y, color: n.color, head: '#e8c9a0', label: n.label, kind: 'npc' }));
  entities.push({ x: p.px ?? p.x, y: p.py ?? p.y, color: CHARACTERS[state.meta.character].color, head: '#e8c9a0', kind: 'player', character: state.meta.character, ...playerMotion(state) });
  const boxes = [];
  if (groundInv(state, shopId)?.items.length) boxes.push({ x: shop.ground[0], y: shop.ground[1] });
  // cargo piled on the shopping cart grows with the trunk load (patch 08-16)
  const cart = fixtures.find((f) => f.kind === 'cart');
  const trunk = trunkInv(state);
  if (cart && trunk?.items.length) {
    const piles = Math.min(3, 1 + Math.floor((usedCells(trunk) / (trunk.w * trunk.h)) * 3));
    for (let i = 0; i < piles; i++) boxes.push({ x: cart.x - 0.2 + i * 0.2, y: cart.y - 0.05 * i });
  }
  return {
    floor: grid,
    floorId: SHOP_FLOOR,
    furniture: fixtures,
    boxes,
    entities,
    clock: state.clock,
    weather: null,
    lightsOn: true,
    bg: '#101215',
    roomAt: (x, y) => grid.rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h),
    locked: () => false,
    floorsAvailable: [SHOP_FLOOR],
    onClick: (wx, wy) => onShopClick(state, shopId, grid, fixtures, npcs, wx, wy),
  };
});

on('interactKey', () => {
  const state = game.state;
  const shopId = state && currentShop(state);
  const uid = game.ui?.renderer?.hover?.furn;
  if (!shopId || !uid) return;
  const f = shopFixtures(state, shopId).find((x) => x.uid === uid);
  if (f) interactFixture(state, f.id);
});

on('sceneChanged', () => {
  for (const id of SHOP_WINDOWS) closeWindow(id);
  game.ui?.recenter?.();
});

on('outbreak', () => {
  for (const id of SHOP_WINDOWS) closeWindow(id);
});

// ------------------------------------------------------------------------------ helpers
const money = (state) => h('b', {}, `$${Math.round(state.player.money)}`);

function itemChip(id) {
  const cfg = item(id);
  return h(
    'span',
    { class: 'row', style: { alignItems: 'center', gap: '6px' }, dataset: { tip: itemTooltip({ id, uses: cfg.uses, age: 0 }) } },
    h('span', { style: { background: itemColor(cfg), borderRadius: '3px', padding: '1px 4px' } }, itemIcon(cfg)),
    h('span', {}, itemName(id))
  );
}

function invGrid(state, invId, otherId, { readonly = false } = {}) {
  return renderGrid(state, invId, {
    readonly,
    cellPx: 28,
    onChange: refreshWindows,
    transferTo: () => otherId,
    onUse: (inst) => quickUse(state, invId, inst),
    onError: (r) => toast(reasonText(r), 'bad'),
  });
}

function column(title, state, invId, otherId, opts) {
  return h('div', { class: 'col' }, h('div', { class: 'row' }, h('span', { class: 'sec-title' }, title), h('span', { class: 'dim' }, weightLine(state, invId))), invGrid(state, invId, otherId, opts));
}

function takeAll(state, fromId, toId) {
  const from = state.inventories[fromId];
  const to = state.inventories[toId];
  let failed = 0;
  for (const it of [...from.items]) if (!moveItem(state, from, it.uid, to, null, null).ok) failed++;
  if (failed) toast(pickLang({ en: `${failed} item(s) did not fit.`, zh: `有${failed}件物品放不下。` }), 'bad');
  refreshWindows();
}

const REC = {
  3: { cls: 'bad', text: { en: 'Must Buy', zh: '必买' } },
  2: { cls: 'warn', text: { en: 'Recommended', zh: '推荐' } },
};

// ------------------------------------------------------------------------------ shelves
registerPanel('shop', (ctx = {}) => {
  const state = game.state;
  const shelf = state && ctx.shop && shelfDef(ctx.shop, ctx.shelf);
  if (!shelf) return toast(pickLang({ en: 'Nothing for sale here.', zh: '这里没有东西卖。' }), 'bad');
  const showCartTip = !!trunkInv(state) && !state.pre.tips.cart;
  if (showCartTip) state.pre.tips.cart = true;
  openWindow('shop', {
    title: `${locationName(ctx.shop)} · ${fixtureLabel(shelf)}`,
    width: 'auto',
    build: (body) => {
      const trunk = trunkInv(state);
      const dest = trunk && state.ui.shopDest === 'trunk' ? 'trunk' : 'backpack';
      const offers = shelfOffers(state, ctx.shop, ctx.shelf);
      const packages = offers.some((o) => o.pkg);
      const setDest = (d) => {
        state.ui.shopDest = d;
        refreshWindows();
      };
      body.appendChild(
        h(
          'div',
          { class: 'row', style: { alignItems: 'center', marginBottom: '6px' } },
          h('span', {}, `${tr('stat.money')} `, money(state)),
          packages ? h('span', { class: 'good' }, pickLang({ en: '📦 Delivered to your doorstep', zh: '📦 送货到家门口' })) : h('span', { class: 'dim' }, pickLang({ en: `Bulk packages −${Math.round(bulkDiscount(state) * 100)}%`, zh: `大包装优惠${Math.round(bulkDiscount(state) * 100)}%` })),
          h('span', { class: 'spacer' }),
          trunk && !packages
            ? h(
                'span',
                { class: 'tabs', style: { margin: 0 } },
                h('button', { class: dest === 'backpack' ? 'on' : '', onclick: () => setDest('backpack') }, `🎒 ${tr('ui.inventory')}`),
                h('button', { class: dest === 'trunk' ? 'on' : '', onclick: () => setDest('trunk') }, `🛒 ${pickLang({ en: 'Shopping Cart (trunk)', zh: '购物车（后备箱）' })}`)
              )
            : null
        )
      );
      if (showCartTip) body.appendChild(h('div', { class: 'warn', style: { marginBottom: '6px' } }, pickLang({ en: 'Tip: items in the shopping cart go straight into your car trunk and do not count toward your carry weight.', zh: '提示：放进购物车的东西会直接装进后备箱，不计入你的负重。' })));
      const list = h(
        'div',
        { class: 'list', style: { minWidth: '430px', maxHeight: '52vh', overflowY: 'auto' } },
        ...offers.map((o) => {
          const cfg = item(o.id);
          const rec = REC[o.rec];
          const out = o.left <= 0;
          const afford = state.player.money >= o.unit;
          return h(
            'div',
            { class: 'list-item' },
            itemChip(o.id),
            rec ? h('span', { class: `pill ${rec.cls}` }, pickLang(rec.text)) : null,
            shelf.aged ? h('span', { class: 'pill warn' }, pickLang({ en: 'Near expiry', zh: '临期' })) : null,
            o.cut ? h('span', { class: 'pill', dataset: { tip: pickLang({ en: 'Needs cutting after the disaster', zh: '灾变后需要切分' }) } }, '🔪') : null,
            h('span', { class: 'spacer' }),
            h('span', { class: 'dim' }, o.pkg ? loc(furn(cfg.furn)?.desc || '').slice(0, 34) : `${(cfg.g / 1000).toFixed(1)}kg ${cfg.size[0]}×${cfg.size[1]}`),
            h('span', { class: out ? 'bad' : 'dim' }, out ? pickLang({ en: 'Sold out', zh: '售罄' }) : pickLang({ en: `${o.left} left`, zh: `剩${o.left}` })),
            h('button', { disabled: out || !afford ? true : null, onclick: () => doBuy(o.id, false) }, `$${o.unit}`),
            o.bulk ? h('button', { disabled: o.left < o.bulk || state.player.money < o.bulkPrice ? true : null, dataset: { tip: pickLang({ en: `Bulk package: ${o.bulk} for $${o.bulkPrice}`, zh: `大包装：${o.bulk}件$${o.bulkPrice}` }) }, onclick: () => doBuy(o.id, true) }, `×${o.bulk} $${o.bulkPrice}`) : null
          );
        })
      );
      const bp = state.player.backpack;
      const side = h(
        'div',
        { class: 'col' },
        column(tr('ui.inventory'), state, bp, trunk?.id || null),
        trunk ? column(pickLang({ en: 'Shopping Cart (trunk)', zh: '购物车（后备箱）' }), state, trunk.id, bp) : null
      );
      body.appendChild(h('div', { class: 'row' }, list, packages ? null : side));
      function doBuy(id, bulk) {
        const r = buy(state, ctx.shop, ctx.shelf, id, { bulk, dest });
        if (!r.ok) toast(preReason(r.reason), 'bad');
        else toast(`${itemName(id)}${r.n > 1 ? ` ×${r.n}` : ''}  −$${r.cost}`, 'good');
        refreshWindows();
      }
    },
  });
});

// ------------------------------------------------------------------------------ car lot
registerPanel('carShop', () => {
  const state = game.state;
  if (!state) return;
  openWindow('carShop', {
    title: pickLang({ en: 'Used Car Lot', zh: '二手车场' }),
    width: 460,
    build: (body) => {
      const owned = state.pre.car;
      body.appendChild(h('div', { class: 'row', style: { marginBottom: '6px' } }, h('span', {}, `${tr('stat.money')} `, money(state))));
      body.appendChild(h('div', { class: 'dim', style: { marginBottom: '6px' } }, pickLang({ en: 'A car cuts travel to about 35 minutes. Its trunk has no weight limit and does not count toward what you carry; open it from the backpack (Trunk tab) or any shopping cart.', zh: '有车后出行只要约35分钟。后备箱没有重量限制，也不计入负重；可在背包的“后备箱”页或任意购物车打开。' })));
      body.appendChild(
        h(
          'div',
          { class: 'list' },
          ...Object.values(CARS).map((car) =>
            h(
              'div',
              { class: `list-item ${owned?.id === car.id ? 'sel' : ''}` },
              h('b', {}, `🚗 ${pickLang(car.name)}`),
              h('span', { class: 'dim' }, pickLang({ en: `Trunk ${car.trunk[0]}×${car.trunk[1]}`, zh: `后备箱${car.trunk[0]}×${car.trunk[1]}` })),
              h('span', { class: 'spacer' }),
              owned
                ? owned.id === car.id
                  ? h('span', { class: 'good' }, pickLang({ en: 'Yours', zh: '你的车' }))
                  : null
                : h(
                    'button',
                    {
                      class: 'primary',
                      disabled: state.player.money < car.price ? true : null,
                      onclick: () => {
                        const r = buyCar(state, car.id);
                        toast(r.ok ? pickLang({ en: `You drive off in the ${pickLang(car.name)}.`, zh: `你开着${pickLang(car.name)}出发了。` }) : preReason(r.reason), r.ok ? 'good' : 'bad');
                        refreshWindows();
                      },
                    },
                    `${tr('ui.buy')} $${car.price}`
                  )
            )
          )
        )
      );
      if (owned) {
        body.appendChild(
          h(
            'div',
            { class: 'row', style: { marginTop: '8px', alignItems: 'center' } },
            h('span', { class: 'dim' }, pickLang({ en: 'The dealer refunds the car in full if you bring it back with an empty trunk.', zh: '只要后备箱清空，车商会全额退款。' })),
            h(
              'button',
              {
                onclick: () => {
                  const r = returnCar(state);
                  toast(r.ok ? pickLang({ en: `Car returned: +$${r.refund}. You are on foot again.`, zh: `车已退回：+$${r.refund}。又要走路了。` }) : preReason(r.reason), r.ok ? 'good' : 'bad');
                  refreshWindows();
                },
              },
              pickLang({ en: `Return car (+$${owned.price})`, zh: `退车（+$${owned.price}）` })
            )
          )
        );
      }
    },
  });
});

registerPanel('trunk', () => {
  const state = game.state;
  const trunk = state && trunkInv(state);
  if (!trunk) return toast(preReason('needCar'), 'bad');
  openWindow('trunk', {
    title: pickLang({ en: 'Shopping Cart → Trunk', zh: '购物车 → 后备箱' }),
    width: 'auto',
    build: (body) => {
      const bp = state.player.backpack;
      body.appendChild(h('div', { class: 'row' }, column(tr('ui.inventory'), state, bp, trunk.id), column(pickLang({ en: 'Trunk', zh: '后备箱' }), state, trunk.id, bp)));
      body.appendChild(h('div', { class: 'row', style: { marginTop: '6px' } }, h('button', { onclick: () => takeAll(state, bp, trunk.id) }, pickLang({ en: 'Load everything into the trunk', zh: '全部装进后备箱' })), h('button', { onclick: () => takeAll(state, trunk.id, bp) }, tr('ui.takeAll'))));
    },
  });
});

// ------------------------------------------------------------------------------ doorstep deliveries
registerPanel('doorstep', () => {
  const state = game.state;
  if (!state) return;
  let sel = null;
  openWindow('doorstep', {
    title: pickLang({ en: 'Doorstep Delivery Area', zh: '门口暂存区' }),
    width: 'auto',
    build: (body) => {
      const inv = doorstepInv(state);
      const bp = state.player.backpack;
      const home = state.player.scene === 'home';
      const selInst = sel && inv.items.find((it) => it.uid === sel);
      body.appendChild(
        h(
          'div',
          { class: 'dim', style: { marginBottom: '6px', maxWidth: '640px' } },
          home
            ? pickLang({ en: 'Packages from the Renovation Company and the Farmers\' Market wait here. Select one and Install it, or carry things inside.', zh: '装修公司和农贸市场的包裹会放在这里。选中包裹即可安装，或把东西搬进屋。' })
            : pickLang({ en: 'You can see what was delivered, but you have to be home to carry it in.', zh: '可以查看送到的东西，但要回家才能搬进屋。' })
        )
      );
      const doorGrid = renderGrid(state, inv.id, {
        readonly: !home,
        cellPx: 28,
        selected: sel,
        onSelect: (inst) => {
          sel = inst.uid;
          refreshWindows();
        },
        onChange: refreshWindows,
        transferTo: () => bp,
        onError: (r) => toast(reasonText(r), 'bad'),
      });
      body.appendChild(
        h(
          'div',
          { class: 'row' },
          h('div', { class: 'col' }, h('span', { class: 'sec-title' }, pickLang({ en: 'Doorstep', zh: '门口' })), doorGrid),
          home ? column(tr('ui.inventory'), state, bp, inv.id) : null
        )
      );
      body.appendChild(
        h(
          'div',
          { class: 'row', style: { marginTop: '6px', alignItems: 'center' } },
          home ? h('button', { onclick: () => takeAll(state, inv.id, bp) }, tr('ui.takeAll')) : null,
          selInst ? itemChip(selInst.id) : null,
          selInst && home && item(selInst.id)?.cat === CAT.FURNITURE_PACKAGE
            ? h('button', { class: 'primary', onclick: () => setTimeout(() => openPanel('planning', { installUid: selInst.uid, fromInv: inv.id }), 0) }, tr('ui.install'))
            : null
        )
      );
    },
  });
});

// ------------------------------------------------------------------------------ renovation company
registerPanel('pawn', () => {
  const state = game.state;
  if (!state) return;
  openWindow('pawn', {
    title: pickLang({ en: 'Used-Furniture Buyer', zh: '收旧家具' }),
    width: 480,
    build: (body) => {
      const list = pawnableFurniture(state);
      body.appendChild(h('div', { class: 'row', style: { marginBottom: '6px' } }, h('span', {}, `${tr('stat.money')} `, money(state))));
      body.appendChild(h('div', { class: 'dim', style: { marginBottom: '6px' } }, pickLang({ en: 'Movers collect the piece from your home. Anything stored in it is left at your doorstep.', zh: '搬家师傅会上门取走家具，里面存放的东西会留在你家门口。' })));
      body.appendChild(
        list.length
          ? h(
              'div',
              { class: 'list', style: { maxHeight: '50vh', overflowY: 'auto' } },
              ...list.map((f) =>
                h(
                  'div',
                  { class: 'list-item' },
                  h('span', {}, furnLabel(f)),
                  h('span', { class: 'pill' }, pickLang(homeDef(state.home.id).floors[f.floor]?.label) || f.floor),
                  h('span', { class: 'spacer' }),
                  h(
                    'button',
                    {
                      onclick: () => {
                        const r = pawnFurniture(state, f.uid);
                        toast(r.ok ? pickLang({ en: `Sold ${furnLabel(f)}: +$${r.price}`, zh: `卖掉了${furnLabel(f)}：+$${r.price}` }) : preReason(r.reason), r.ok ? 'good' : 'bad');
                        refreshWindows();
                      },
                    },
                    `${tr('ui.sell')} +$${pawnPrice(f)}`
                  )
                )
              )
            )
          : h('div', { class: 'dim' }, pickLang({ en: 'Nothing left she wants to buy.', zh: '已经没有她想收的东西了。' }))
      );
    },
  });
});

registerPanel('returns', () => {
  const state = game.state;
  if (!state) return;
  openWindow('returns', {
    title: pickLang({ en: 'Returns & Service Desk', zh: '退货与服务台' }),
    width: 480,
    build: (body) => {
      const list = returnablePackages(state);
      body.appendChild(h('div', { class: 'row', style: { marginBottom: '6px' } }, h('span', {}, `${tr('stat.money')} `, money(state))));
      body.appendChild(h('div', { class: 'dim', style: { marginBottom: '6px' } }, pickLang({ en: 'Intact packages bought today are refunded in full — from your backpack, trunk or doorstep. Installed furniture has to be packed up first (Planning Mode).', zh: '今天买的包裹只要完好都能全额退款——背包、后备箱或门口的都可以。已安装的家具要先在规划模式里打包。' })));
      const where = (invId) => (invId === state.player.backpack ? tr('ui.inventory') : invId === state.pre.trunk ? pickLang({ en: 'Trunk', zh: '后备箱' }) : pickLang({ en: 'Doorstep', zh: '门口' }));
      body.appendChild(
        list.length
          ? h(
              'div',
              { class: 'list', style: { maxHeight: '50vh', overflowY: 'auto' } },
              ...list.map((p) =>
                h(
                  'div',
                  { class: 'list-item' },
                  itemChip(p.id),
                  h('span', { class: 'pill' }, where(p.invId)),
                  h('span', { class: 'spacer' }),
                  h(
                    'button',
                    {
                      onclick: () => {
                        const r = returnPackage(state, p.invId, p.uid);
                        toast(r.ok ? pickLang({ en: `Refunded $${r.refund}`, zh: `退款$${r.refund}` }) : preReason(r.reason), r.ok ? 'good' : 'bad');
                        refreshWindows();
                      },
                    },
                    `${tr('ui.return')} +$${p.refund}`
                  )
                )
              )
            )
          : h('div', { class: 'dim' }, pickLang({ en: 'You have nothing to return.', zh: '没有可以退的东西。' }))
      );
    },
  });
});

// ------------------------------------------------------------------------------ NPCs
const NPC_ACTIONS = {
  pawn: { en: 'Sell old furniture', zh: '卖旧家具' },
  carShop: { en: 'Look at the cars', zh: '看看车' },
  blackMarket: { en: 'Sell blood', zh: '卖血' },
};

registerPanel('npcTalk', (ctx = {}) => {
  const state = game.state;
  const npc = SHOP_NPCS[ctx.npc];
  if (!state || !npc) return;
  openWindow('npcTalk', {
    title: ctx.name,
    width: 420,
    build: (body) => {
      const box = h('div', { class: 'eventbox' });
      for (const line of ctx.lines || []) box.appendChild(h('p', {}, pickLang(line)));
      if (ctx.remembered) box.appendChild(h('div', { class: 'dim' }, pickLang({ en: '(They remember you.)', zh: '（对方记得你。）' })));
      if (ctx.gift) box.appendChild(h('div', { class: 'good' }, pickLang({ en: `+$${ctx.gift}`, zh: `+$${ctx.gift}` })));
      const choices = h('div', { class: 'choices' });
      if (ctx.action) choices.appendChild(h('button', { class: 'primary', onclick: () => (closeWindow('npcTalk'), openPanel(ctx.action)) }, pickLang(NPC_ACTIONS[ctx.action])));
      choices.appendChild(h('button', { onclick: () => closeWindow('npcTalk') }, pickLang({ en: 'Leave', zh: '离开' })));
      box.appendChild(choices);
      body.appendChild(box);
    },
  });
});

// ------------------------------------------------------------------------------ rush & black market
registerPanel('rush', () => {
  const state = game.state;
  if (!state) return;
  openWindow('rush', {
    title: pickLang({ en: 'Doomsday Rush', zh: '末日抢购' }),
    width: 420,
    build: (body) => {
      const why = rushBlocked(state);
      body.appendChild(
        h(
          'div',
          { class: 'eventbox' },
          h('p', {}, pickLang({ en: `The checkout is mobbed. Push through the crowd with a trolley and grab whatever cheap staples are left: about ${RUSH.count} items for $${RUSH.price}, ${RUSH.minutes} minutes of shoving.`, zh: `收银台被挤爆了。推着购物车挤进人群，抢下剩下的便宜货：约${RUSH.count}件，$${RUSH.price}，要挤${RUSH.minutes}分钟。` })),
          h('p', { class: 'dim' }, pickLang({ en: 'Leave room in your backpack — whatever does not fit drops on the floor.', zh: '记得给背包留出空间——装不下的会掉在地上。' })),
          h('p', {}, pickLang({ en: `Time left: ${formatDuration(secondsUntilOutbreak(state))}`, zh: `剩余时间：${formatDuration(secondsUntilOutbreak(state))}` })),
          why ? h('p', { class: 'bad' }, preReason(why)) : null,
          h('div', { class: 'choices' }, h('button', { class: 'primary', disabled: why ? true : null, onclick: () => (startRush(state), closeWindow('rush')) }, pickLang({ en: `Rush in ($${RUSH.price})`, zh: `冲进去（$${RUSH.price}）` })))
        )
      );
    },
  });
});

registerPanel('blackMarket', () => {
  const state = game.state;
  if (!state) return;
  openWindow('blackMarket', {
    title: pickLang({ en: 'Blood Donation Station', zh: '献血台' }),
    width: 420,
    build: (body) => {
      const sold = state.pre.soldBlood;
      body.appendChild(
        h(
          'div',
          { class: 'eventbox' },
          h('p', {}, pickLang({ en: `One bag of blood for $${BLOOD_PRICE} cash. It takes half an hour.`, zh: `一袋血，现金$${BLOOD_PRICE}，需要半小时。` })),
          h('p', { class: 'warn' }, pickLang({ en: `You will suffer Anemia for the first ${ANEMIA_HOURS / 24} days after the outbreak (lower max Stamina).`, zh: `灾变后的前${ANEMIA_HOURS / 24}天你会贫血（精力上限降低）。` })),
          sold ? h('p', { class: 'bad' }, preReason('bloodSold')) : null,
          h('div', { class: 'choices' }, h('button', { class: 'primary', disabled: sold ? true : null, onclick: () => (startSellBlood(state), closeWindow('blackMarket')) }, pickLang({ en: `Sell blood (+$${BLOOD_PRICE})`, zh: `卖血（+$${BLOOD_PRICE}）` })))
        )
      );
    },
  });
});

registerPanel('shopGround', (ctx = {}) => {
  const state = game.state;
  const inv = state && groundInv(state, ctx.shop || currentShop(state));
  if (!inv) return;
  openWindow('shopGround', {
    title: pickLang({ en: 'On the floor', zh: '地上' }),
    width: 'auto',
    build: (body) => {
      const bp = state.player.backpack;
      const trunk = trunkInv(state);
      body.appendChild(h('div', { class: 'row' }, column(pickLang({ en: 'Floor', zh: '地上' }), state, inv.id, bp), column(tr('ui.inventory'), state, bp, inv.id), trunk ? column(pickLang({ en: 'Trunk', zh: '后备箱' }), state, trunk.id, inv.id) : null));
      body.appendChild(h('div', { class: 'row', style: { marginTop: '6px' } }, h('button', { onclick: () => takeAll(state, inv.id, bp) }, tr('ui.takeAll')), trunk ? h('button', { onclick: () => takeAll(state, inv.id, trunk.id) }, pickLang({ en: 'Everything into the trunk', zh: '全部装进后备箱' })) : null));
    },
  });
});
