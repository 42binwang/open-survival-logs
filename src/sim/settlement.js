// Planning Points economy and the daily settlement. Every day lived accumulates as Planning Points and the
// settlement offers a learnable plan (demo notes 07-10); the settlement page lists Carried Over, Event Rewards,
// Rewind Cost, Record-Breaking Days and departed people as separate rows (09-12); the choose-one-of-three
// keeps coming past Day 200 in Endless (09-17); a saved balance of 200+ earns 5% interest (IndieBunny guide).
import { registerSystem } from './tick.js';
import { getMods, bumpMods } from './modifiers.js';
import { addStat } from './stats.js';
import { dayNumber } from './time.js';
import { PLANNING_CARDS, CARD_BY_ID } from '../content/planningCards.js';
import { weighted } from '../engine/rng.js';
import { emit } from '../engine/bus.js';

export const DAILY_BASE = 8;
export const RECORD_BONUS = 5;
export const INTEREST = { rate: 0.05, minBalance: 200, cap: 25 };
export const OFFER_COUNT = 3;

// Older ledger rows are folded into per-kind totals so Endless saves stay small.
const LEDGER_MAX = 400;
const LEDGER_KEEP = 300;

// Ledger row kinds in the order the settlement pages list them.
export const LEDGER_KINDS = {
  carried: {
    name: { en: 'Carried Over', zh: '上轮结转' },
    help: { en: 'Balance brought into this round from the previous loops.', zh: '从之前的轮回带入本轮的余额。' },
  },
  day: {
    name: { en: 'Days Survived', zh: '生存天数' },
    help: {
      en: '+8 for every new day you live to see, +1 more per 10 days survived, plus Daily Settlement Plan. Scaled by the difficulty.',
      zh: '每迎来新的一天+8，每生存10天再+1，另加日结计划加成。受难度倍率影响。',
    },
  },
  record: {
    name: { en: 'Record-Breaking Days', zh: '破纪录天数' },
    help: { en: '+5 for every day beyond the furthest day you reached in any loop.', zh: '超过历次轮回最远天数的每一天+5。' },
  },
  interest: {
    name: { en: 'Interest', zh: '利息' },
    help: { en: 'A saved balance of 200 or more earns 5% at every daily settlement (up to 25).', zh: '余额达到200及以上时，每日结算获得5%利息（最多25）。' },
  },
  event: {
    name: { en: 'Event Rewards', zh: '事件奖励' },
    help: { en: 'Rewards from events and wishes, credited the moment you earn them.', zh: '事件与心愿等奖励，获得时立即入账。' },
  },
  departed: {
    name: { en: 'Left by the Departed', zh: '逝者遗留' },
    help: { en: 'Planning Points left behind by people who did not make it.', zh: '离世之人留下的生存点。' },
  },
  card: {
    name: { en: 'Planning Cards', zh: '规划卡' },
    help: { en: 'Plans bought at the daily settlement.', zh: '在每日结算中购买的规划。' },
  },
  ability: {
    name: { en: 'Abilities Learned', zh: '学习能力' },
    help: { en: 'Abilities learned in the Survival Log this round. Tearing up the round refunds them.', zh: '本轮在生存日志中学习的能力。撕掉本轮可全额退还。' },
  },
  rewind: {
    name: { en: 'Rewind Cost', zh: '回溯消耗' },
    help: { en: 'Paid to go back a few days with "I want to persist!".', zh: '选择“我还想坚持！”回到几天前所支付的点数。' },
  },
  spent: {
    name: { en: 'Other Spending', zh: '其他花费' },
    help: { en: 'Points spent elsewhere, such as the pre-disaster planning bar.', zh: '其他途径的花费，例如灾前规划栏。' },
  },
};
export const LEDGER_ORDER = Object.keys(LEDGER_KINDS);
const EARNED = new Set(['day', 'record', 'interest', 'event', 'departed']);

// Achievement counters summarised at each daily settlement ("yesterday"). `food.sat` is satiety gained by eating.
export const SUMMARY_KEYS = ['food.sat', 'food.eaten', 'zombie.kill', 'trade.active.dealcount', 'plant.harvest', 'cook.count', 'craft.total', 'trap.catch', 'explore.total'];

export const COUNTER_LABELS = {
  'food.sat': { en: 'Satiety eaten', zh: '摄入饱腹' },
  'food.eaten': { en: 'Meals eaten', zh: '进食次数' },
  'cook.count': { en: 'Dishes cooked', zh: '烹饪菜肴' },
  'cook.perfect': { en: 'Perfect dishes', zh: '完美菜肴' },
  'plant.harvest': { en: 'Harvests', zh: '收获次数' },
  'plant.perfect': { en: 'Perfect harvests', zh: '完美收获' },
  'plant.harvest.flower': { en: 'Flowers harvested', zh: '收获鲜花' },
  'craft.total': { en: 'Items crafted', zh: '制造物品' },
  'trap.place': { en: 'Traps set', zh: '布置陷阱' },
  'trap.catch': { en: 'Prey caught', zh: '捕获猎物' },
  ratCatch: { en: 'Rats caught', zh: '捕获老鼠' },
  'zombie.kill': { en: 'Zombies killed', zh: '击杀丧尸' },
  'horde.survived': { en: 'Hordes survived', zh: '挺过尸潮' },
  'wave.survived': { en: 'Endless hordes survived', zh: '无尽模式挺过尸潮' },
  'crisis.survived': { en: 'Crises survived', zh: '度过危机' },
  'explore.total': { en: 'Explorations', zh: '外出探索' },
  'explore.points.distinct': { en: 'Exploration points visited', zh: '探索过的地点' },
  marketLoot: { en: 'Ruined Supermarket runs', zh: '深入废墟超市' },
  'trade.active.dealcount': { en: 'Trades', zh: '交易次数' },
  'trade.stranger.partner': { en: 'Trading partners', zh: '交易伙伴' },
  'drone.foraging.count': { en: 'Drone scavenging runs', zh: '无人机拾荒' },
  'survivor.aid': { en: 'Aid count', zh: '援助次数' },
  'camp.prep.supply': { en: 'Outpost deliveries', zh: '据点补给' },
  'group.reply': { en: 'Group chat stances', zh: '群聊表态' },
  clue: { en: 'Clues found', zh: '找到线索' },
  'book.read': { en: 'Books and notes read', zh: '阅读书籍笔记' },
  'furniture.dismantle': { en: 'Furniture dismantled', zh: '拆除家具' },
  'prof.allmax': { en: 'All proficiencies maxed', zh: '全熟练度满级' },
  'bait.thrown': { en: 'Bait thrown', zh: '投掷诱饵' },
  'brew.count': { en: 'Bottles brewed', zh: '酿造瓶数' },
  'cat.feed': { en: 'Fed the cat', zh: '喂猫' },
  'cat.pet': { en: 'Petted the cat', zh: '摸猫' },
  'cat.ignore': { en: 'Ignored the cat', zh: '无视猫咪' },
  'cat.take': { en: "Took the cat's gift", zh: '收下猫的礼物' },
  'craft.fail': { en: 'Crafts failed', zh: '制造失败' },
  'craft.perfect': { en: 'Perfect crafts', zh: '完美制造' },
  'defense.chainsaw': { en: 'Chainsaws installed', zh: '已装电锯' },
  'defense.net': { en: 'Electric nets installed', zh: '已装电网' },
  'defense.sandbag': { en: 'Sandbags installed', zh: '已装沙袋' },
  'defense.spike': { en: 'Spike traps installed', zh: '已装地刺' },
  'door.repair': { en: 'Door and window repairs', zh: '修理门窗' },
  'explore.hurt': { en: 'Hits taken outside', zh: '探索中受伤' },
  'explore.lure': { en: 'Lures thrown outside', zh: '探索中投掷诱饵' },
  'explore.search': { en: 'Searches outside', zh: '探索中搜刮' },
  'furniture.recycle': { en: 'Furniture recycled', zh: '回收家具' },
  'home.breach': { en: 'Openings breached', zh: '门窗被突破' },
  'molotov.thrown': { en: 'Molotovs thrown', zh: '投掷燃烧瓶' },
  'neighbor.basket': { en: 'Basket line repairs', zh: '修复吊篮' },
  'neighbor.delivery': { en: 'Baskets to the neighbor', zh: '给邻居送篮子' },
  'plant.sow': { en: 'Seeds sown', zh: '播种' },
  'power.manual': { en: 'Pedal generator sessions', zh: '脚踏发电' },
  'power.repair': { en: 'Wiring repairs', zh: '修理电路' },
  'pre.riotGrabs': { en: 'Riot grabs', zh: '骚乱中抢物资' },
  'pre.spent': { en: 'Spent before the disaster', zh: '灾前花费' },
  'radio.mission': { en: 'Radio missions', zh: '电台任务' },
  'raider.kill': { en: 'Raiders killed', zh: '击杀劫匪' },
  'raider.met': { en: 'Raider stand-offs', zh: '遭遇劫匪' },
  'raider.paid': { en: 'Raiders paid off', zh: '向劫匪交出物资' },
  'raider.talked': { en: 'Raiders talked down', zh: '说服劫匪' },
  'rat.starved': { en: 'Caged rats starved', zh: '饿死的笼中老鼠' },
  'ration.pressed': { en: 'Rations pressed', zh: '压制口粮' },
  'rubble.cleared': { en: 'Rubble cleared', zh: '清理瓦砾' },
  'shield.defended': { en: 'Street shield rounds held', zh: '守住街道' },
  'shred.count': { en: 'Items shredded', zh: '粉碎物品' },
  sleeps: { en: 'Times slept', zh: '睡觉次数' },
  'survivor.dead': { en: 'Survivors lost', zh: '死去的幸存者' },
  'thug.bribed': { en: 'Thugs bribed', zh: '贿赂暴徒' },
  'thug.repelled': { en: 'Thugs driven off', zh: '击退暴徒' },
  tilesWalked: { en: 'Tiles walked', zh: '行走格数' },
  'tvgame.plays': { en: 'TV games played', zh: '电视游戏次数' },
  'vase.arrange': { en: 'Flowers arranged', zh: '插花' },
  'veteran.fed': { en: 'Satiety given to the veteran', zh: '给老兵的饱腹' },
  'wm.delivery': { en: 'Deliveries to the warehouse manager', zh: '给仓库管理员送物资' },
  'wave.final': { en: 'Final horde survived', zh: '挺过最终尸潮' },
  'zombie.counter': { en: 'Counterattacks', zh: '反击次数' },
  'zombie.kill.big': { en: 'Big zombies killed', zh: '击杀大型丧尸' },
  'zombie.sporadic': { en: 'Stray zombies at the door', zh: '门外的游荡丧尸' },
};

export const PATH_NAMES = {
  farm: { en: 'Farming', zh: '种植' },
  drone: { en: 'Drone', zh: '无人机' },
  cook: { en: 'Cooking', zh: '烹饪' },
  store: { en: 'Storage', zh: '储物' },
  power: { en: 'Power', zh: '电力' },
  defense: { en: 'Defense', zh: '防御' },
  craft: { en: 'Crafting', zh: '制造' },
  life: { en: 'Daily Life', zh: '生活' },
};

// Offers are spread across paths; the one-shot consumables come up less often while other plans remain.
const PATH_WEIGHT = { life: 0.5 };

function today(state) {
  if (state.phase === 'pre') return 0;
  return state.run.day ?? dayNumber(state.clock);
}

function compact(ledger) {
  if (ledger.length <= LEDGER_MAX) return;
  const old = ledger.splice(0, ledger.length - LEDGER_KEEP);
  const sums = new Map();
  for (const r of old) sums.set(r.kind, (sums.get(r.kind) || 0) + r.amount);
  const day = old[old.length - 1].day;
  ledger.unshift(...[...sums].map(([kind, amount]) => ({ day, kind, amount, merged: true })));
}

export function ensureLedger(state) {
  const run = state.run;
  if (!run.pointsLedger) {
    const bal = state.loop.planningPoints;
    run.pointsLedger = bal ? [{ day: 0, kind: 'carried', amount: bal }] : [];
    run.pointsSeen = bal;
  }
  run.pointsSeen ??= state.loop.planningPoints;
  run.dayRecords ||= [];
  run.pointsEarned ??= 0;
  return run.pointsLedger;
}

// The round's ledger starts with the balance carried in; abilities learned on the rebirth page before the
// round began show up as this round's ability spending.
function startLedger(state) {
  const loop = state.loop;
  const spent = loop.pointsSpentThisRound || 0;
  const carried = loop.planningPoints + spent;
  state.run.pointsLedger = [];
  if (carried) state.run.pointsLedger.push({ day: 0, kind: 'carried', amount: carried });
  if (spent) state.run.pointsLedger.push({ day: 0, kind: 'ability', amount: -spent });
  state.run.pointsSeen = loop.planningPoints;
  ensureLedger(state);
}

// Other systems may change the balance directly (wish rewards, sundries): those changes become ledger rows.
export function reconcilePoints(state) {
  const ledger = ensureLedger(state);
  const diff = state.loop.planningPoints - state.run.pointsSeen;
  if (Math.abs(diff) > 1e-9) {
    ledger.push({ day: today(state), kind: diff > 0 ? 'event' : 'spent', amount: diff });
    if (diff > 0) state.run.pointsEarned += diff;
  }
  state.run.pointsSeen = state.loop.planningPoints;
  compact(ledger);
}

// Credit (or with a negative amount, charge) Planning Points with a ledger row. Hook for events
// (`kind: 'event'`) and people who leave points behind (`kind: 'departed'`).
export function addPoints(state, amount, kind = 'event', { note = null, day = null } = {}) {
  reconcilePoints(state);
  state.loop.planningPoints += amount;
  const row = { day: day ?? today(state), kind, amount };
  if (note != null) row.note = note;
  state.run.pointsLedger.push(row);
  state.run.pointsSeen = state.loop.planningPoints;
  if (amount > 0 && EARNED.has(kind)) state.run.pointsEarned += amount;
  return row;
}

export function spendPoints(state, amount, kind = 'spent', opts = {}) {
  if (amount > state.loop.planningPoints) return false;
  addPoints(state, -amount, kind, opts);
  return true;
}

export function ledgerTotals(state) {
  reconcilePoints(state);
  const totals = {};
  for (const r of state.run.pointsLedger) totals[r.kind] = (totals[r.kind] || 0) + r.amount;
  return totals;
}

export function interestFor(balance) {
  return balance >= INTEREST.minBalance ? Math.min(INTEREST.cap, Math.floor(balance * INTEREST.rate)) : 0;
}

// Points for reaching `day`: base + 1 per 10 days survived + record-breaking bonus + Daily Settlement Plan,
// times the difficulty multiplier; plus interest on the balance saved before today's credit.
export function dailyCredit(state, day) {
  const loop = state.loop;
  const mult = state.meta.difficulty?.pointsMult ?? 1;
  const record = day > (loop.bestDay || 0);
  const perTen = Math.floor(Math.max(0, day - 1) / 10);
  const total = Math.round((DAILY_BASE + perTen + (getMods(state).pointsPerDay || 0) + (record ? RECORD_BONUS : 0)) * mult);
  const recordPts = record ? Math.round(RECORD_BONUS * mult) : 0;
  reconcilePoints(state);
  const interest = interestFor(loop.planningPoints);
  const rows = [addPoints(state, total - recordPts, 'day', { day })];
  if (record) {
    rows.push(addPoints(state, recordPts, 'record', { day }));
    loop.bestDay = day;
    state.run.dayRecords.push(day);
  }
  if (interest > 0) rows.push(addPoints(state, interest, 'interest', { day }));
  state.run.lastSettledDay = Math.max(state.run.lastSettledDay || 0, day);
  return { day, total: total + interest, record, interest, rows };
}

function markCounters(state) {
  const c = state.progress.counters;
  state.run.counterMark = Object.fromEntries(SUMMARY_KEYS.map((k) => [k, c[k] || 0]));
}

// Counter deltas since the previous settlement; resets the mark.
export function summarizeDay(state) {
  const c = state.progress.counters;
  const mark = state.run.counterMark || {};
  const out = {};
  for (const k of SUMMARY_KEYS) out[k] = Math.round(((c[k] || 0) - (mark[k] || 0)) * 10) / 10;
  markCounters(state);
  return out;
}

export function availableCards(state) {
  const owned = new Set(state.run.cards);
  const recipes = new Set(state.run.unlockedRecipes);
  const character = state.meta.character;
  return PLANNING_CARDS.filter((c) => {
    if (c.character && !c.character.includes(character)) return false;
    if (c.requires && !owned.has(c.requires)) return false;
    if (c.once) return true;
    if (owned.has(c.id)) return false;
    return !(c.recipes && !c.mods && c.recipes.every((r) => recipes.has(r)));
  });
}

// Choose-one-of-three: each pick favours a path not offered yet, every path equally likely.
export function offerCards(state, n = OFFER_COUNT) {
  const pool = availableCards(state);
  const picks = [];
  const paths = new Set();
  while (picks.length < n && pool.length) {
    const fresh = pool.filter((c) => !paths.has(c.path));
    const from = fresh.length ? fresh : pool;
    const perPath = {};
    for (const c of from) perPath[c.path] = (perPath[c.path] || 0) + 1;
    const card = weighted(state, from.map((c) => [c, (PATH_WEIGHT[c.path] ?? 1) / perPath[c.path]]));
    picks.push(card.id);
    paths.add(card.path);
    pool.splice(pool.indexOf(card), 1);
  }
  return picks;
}

export function cardCost(state, card) {
  const c = typeof card === 'string' ? CARD_BY_ID[card] : card;
  const off = Math.min(0.9, Math.max(0, getMods(state).settlementDiscount || 0));
  return Math.round(c.cost * (1 - off));
}

// Apply a planning card without paying (also used by events that grant a plan).
export function applyCard(state, card) {
  const c = typeof card === 'string' ? CARD_BY_ID[card] : card;
  if (c.once) {
    for (const [k, v] of Object.entries(c.apply || {})) addStat(state, k, v, 'card');
  } else if (!state.run.cards.includes(c.id)) {
    state.run.cards.push(c.id);
  }
  const fresh = (c.recipes || []).filter((r) => !state.run.unlockedRecipes.includes(r));
  state.run.unlockedRecipes.push(...fresh);
  bumpMods(state);
  if (fresh.length) emit('recipesUnlocked', { ids: fresh, source: c.id });
}

export function buyCard(state, id) {
  const card = CARD_BY_ID[id];
  if (!card) return { ok: false, reason: 'unknown' };
  const offers = state.run.offers;
  if (offers) {
    if (offers.picked || offers.closed) return { ok: false, reason: 'closed' };
    if (!offers.ids.includes(id)) return { ok: false, reason: 'notOffered' };
  }
  if (!card.once && state.run.cards.includes(id)) return { ok: false, reason: 'owned' };
  const cost = cardCost(state, card);
  if (!spendPoints(state, cost, 'card', { note: id })) return { ok: false, reason: 'points', cost };
  applyCard(state, card);
  if (offers) offers.picked = id;
  return { ok: true, cost };
}

// Credits the day, rolls three plans and leaves the settlement pending for the popup. Runs once per day.
export function settleDay(state, day) {
  const run = state.run;
  if ((run.lastSettledDay || 0) >= day) return null;
  const credit = dailyCredit(state, day);
  run.offers = { day, ids: offerCards(state), picked: null };
  const rows = credit.rows.map(({ kind, amount }) => ({ kind, amount }));
  const departed = run.pointsLedger.filter((r) => r.kind === 'departed' && r.day === day).reduce((a, r) => a + r.amount, 0);
  if (departed) rows.push({ kind: 'departed', amount: departed });
  run.settlement = {
    day,
    credited: credit.total,
    record: credit.record,
    rows,
    summary: summarizeDay(state),
    pending: true,
  };
  emit('dailySettlement', { day, credited: credit.total });
  return run.settlement;
}

export function closeSettlement(state) {
  if (state.run.settlement) state.run.settlement.pending = false;
  if (state.run.offers) state.run.offers.closed = true;
}

registerSystem({
  id: 'settlement',
  order: 80,
  init(state) {
    startLedger(state);
    markCounters(state);
  },
  ensure(state) {
    ensureLedger(state);
    if (!state.run.counterMark) markCounters(state);
  },
  onOutbreak(state) {
    markCounters(state);
  },
  onDay(state, day) {
    settleDay(state, day);
  },
});
