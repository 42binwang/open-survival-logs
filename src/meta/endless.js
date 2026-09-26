// Endless mode (R01-R04, A01): Pure Endless from the title screen (character pick, narration + confirmation,
// starting attribute points, starter kit, endless-only initial recipes), Story Endless after an ending
// ("Refusing to Take a Bow"), threat level, the longest-survival record per character (patch 08-27) and the
// staged area unlock tasks that replace the story quests (patch 08-17).
import { h, openWindow, closeWindow, toast } from '../ui/dom.js';
import { registerMenuButton, showScreen, titleScreen } from '../ui/menus.js';
import { game, startRun, persistHistory } from '../game.js';
import { tr, pickLang } from '../engine/i18n.js';
import { emit, on } from '../engine/bus.js';
import { registerSystem } from '../sim/tick.js';
import { registerObjectives } from '../sim/objectives.js';
import { enqueue } from '../sim/actions.js';
import { dayNumber } from '../sim/time.js';
import { raiseMax, effectiveMax, dailyCount, STAT_KEYS } from '../sim/stats.js';
import { addItem, insert, makeInstance, countIn } from '../sim/inventory.js';
import { dropToFloor, homeDef, homeFurniture } from '../sim/home.js';
import { homeSources, giveItems } from '../sim/furnActions.js';
import { recipeDef, recipeNeeds, RECIPE_ORDER } from '../sim/crafting.js';
import { unlockRecipe } from '../sim/unlocks.js';
import { furn, itemName } from '../data/db.js';
import { FUNC_SPECS } from '../content/funcSpecs.js';
import { CHARACTERS, CHARACTER_ORDER } from '../content/characters.js';

// EndlessState from the achievement config: 1 = any endless, 2 = Story Endless after an ending, 3 = Pure Endless.
export const ENDLESS_STORY = 2;
export const ENDLESS_PURE = 3;

// Initial recipes of endless saves (patches 08-15 / 08-19): Simple Mousetrap, Universal Reinforcement, Vase,
// Brewing Barrel, Disinfectant Spray and the Shredder ("Grinder").
export const ENDLESS_RECIPES = [201, 110, 325, 336, 410, 415];

// What the survivor carries in when there is no pre-disaster phase.
export const ENDLESS_KIT = {
  backpack: [
    [41000, 4], // military compressed biscuits
    [2115, 2], // canned luncheon meat
    [2123, 2], // canned yellow peaches
    [9030, 2], // canned tuna
    [9032, 2], // chocolate bars
    [2400, 2], // first-aid bandages
    [2147, 1], // multivitamin tablets
    [8001, 2], // butane canisters
    [9020, 1], // workbench manual: the story places it at the outbreak, which Pure Endless skips
  ],
  doorstep: [
    [14004, 1], // small storage rack package
    [14001, 2], // basic small flowerpot packages
    [14035, 1], // manual generator package
    [14012, 1], // lead-acid battery package
    [20004, 6], // sheet metal
    [20106, 6], // wooden planks
    [20104, 4], // wire
    [20005, 6], // wood chips
    [20001, 6], // scrap paper
    [20300, 1], // door patch kit
    [15007, 2], // white beech mushroom seeds
    [15009, 2], // oyster mushroom seeds
  ],
};

export const ALLOC_STEP = 5; // max-stat bonus per point
export const ALLOC_MAX_LV = 6; // points per attribute

export function endlessStateOf(state) {
  const m = state?.meta;
  if (!m) return 0;
  if (m.endlessState != null) return m.endlessState;
  if (m.mode === 'pureEndless') return ENDLESS_PURE;
  if (m.mode === 'endless') return ENDLESS_STORY;
  return 0;
}

export function isEndless(state) {
  return endlessStateOf(state) > 0;
}

// Full post-disaster days behind the survivor (Day N is survived once Day N + 1 begins).
export function daysSurvived(state) {
  if (!state?.clock || state.phase === 'pre') return 0;
  return Math.max(0, dayNumber(state.clock) - 1);
}

export function endlessDays(state) {
  if (!isEndless(state) || !state.clock || state.phase === 'pre') return 0;
  const start = state.meta.endlessStartDay ?? state.run?.endlessStartDay ?? (endlessStateOf(state) === ENDLESS_PURE ? 1 : dayNumber(state.clock));
  return Math.max(0, dayNumber(state.clock) - start);
}

// The horde system owns state.crises.threat; until it reports one, endless threat rises every 5 days.
export function threatLevel(state) {
  const t = state?.crises?.threat ?? state?.crises?.threatLevel;
  const counted = Number(state?.progress?.counters?.['endless.threat']) || 0;
  if (typeof t === 'number') return Math.max(t, counted);
  if (t && typeof t.level === 'number') return Math.max(t.level, counted);
  if (!isEndless(state)) return counted;
  return Math.max(counted, Math.min(10, 1 + Math.floor(endlessDays(state) / 5)));
}

// Starting attribute points grow with what the survivor has already lived through.
export function endlessPoints(history) {
  const endings = Object.keys(history?.endings || {}).length;
  const achievements = Object.keys(history?.achievements || {}).length;
  return 6 + Math.min(9, endings) + Math.min(9, Math.floor(achievements / 10));
}

export function sanitizeAlloc(alloc, budget = Infinity) {
  const out = {};
  let left = budget;
  for (const k of STAT_KEYS) {
    const n = Math.max(0, Math.min(ALLOC_MAX_LV, Math.floor(Number(alloc?.[k]) || 0), left));
    if (n > 0) out[k] = n;
    left -= n;
  }
  return out;
}

function giveKit(state) {
  const bp = state.inventories[state.player.backpack];
  const spawn = homeDef(state.home.id)?.spawn || { floor: state.player.floor, x: state.player.x, y: state.player.y };
  const drop = (inst) => dropToFloor(state, inst, spawn.floor, spawn.x, spawn.y);
  for (const [id, n] of ENDLESS_KIT.backpack) {
    for (let i = 0; i < n; i++) {
      if (!bp || !addItem(state, bp, id)) drop(makeInstance(state, id));
    }
  }
  const doorstep = state.home.doorstepInv && state.inventories[state.home.doorstepInv];
  for (const [id, n] of ENDLESS_KIT.doorstep) {
    for (let i = 0; i < n; i++) {
      const inst = makeInstance(state, id);
      if (!doorstep || !insert(doorstep, inst, { allowOverweight: true })) drop(inst);
    }
  }
}

// Pure Endless run setup (called from the system init while newGame builds the run).
export function applyEndlessStart(state, opts = {}) {
  const m = state.meta;
  if (m.endlessApplied) return false;
  m.endlessApplied = true;
  m.endlessState = ENDLESS_PURE;
  m.endlessStartDay = 1;
  const alloc = sanitizeAlloc(opts.endlessAlloc, opts.endlessPoints ?? ALLOC_MAX_LV * STAT_KEYS.length);
  m.endlessAlloc = alloc;
  for (const [k, n] of Object.entries(alloc)) {
    raiseMax(state, k, n * ALLOC_STEP, 'endless');
    state.player.stats[k] = Math.min(effectiveMax(state, k), state.player.stats[k] + n * ALLOC_STEP);
  }
  const rec = (state.run.unlockedRecipes = state.run.unlockedRecipes || []);
  for (const id of ENDLESS_RECIPES) if (!rec.includes(id)) rec.push(id);
  giveKit(state);
  state.log?.push({ t: state.clock.t, kind: 'story', text: pickLang(NARRATION[NARRATION.length - 1]) });
  return true;
}

// "Refusing to Take a Bow": keep holding the house after an ending.
export function enterStoryEndless(state) {
  if (!state?.meta) return false;
  const m = state.meta;
  if (m.mode === 'pureEndless') return false;
  const already = m.endlessState === ENDLESS_STORY;
  m.mode = 'endless';
  m.endlessState = ENDLESS_STORY;
  if (!already || m.endlessStartDay == null) m.endlessStartDay = state.run?.endlessStartDay ?? (state.clock ? dayNumber(state.clock) : 1);
  if (state.phase === 'ending') state.phase = 'post';
  return !already;
}

// Longest survival per character and the highest threat reached. Returns true when a record improved.
export function updateEndlessRecords(state, history) {
  if (!isEndless(state)) return false;
  const e = (history.endless = history.endless || { best: {}, maxThreat: 0 });
  e.best = e.best || {};
  const ch = state.meta.character;
  let changed = false;
  const days = daysSurvived(state);
  if (days > (e.best[ch] || 0)) {
    e.best[ch] = days;
    changed = true;
  }
  const threat = threatLevel(state);
  if (threat > (e.maxThreat || 0)) {
    e.maxThreat = threat;
    changed = true;
  }
  if (endlessStateOf(state) === ENDLESS_PURE) {
    e.bestPure = e.bestPure || {};
    const d = endlessDays(state);
    if (d > (e.bestPure[ch] || 0)) {
      e.bestPure[ch] = d;
      changed = true;
    }
  }
  return changed;
}

// Top-right HUD line in endless runs (patch 08-27).
export function endlessRecordText(state, history = game.history) {
  if (!isEndless(state)) return '';
  const best = history?.endless?.best?.[state.meta.character] || 0;
  return pickLang({ en: `Longest survival: ${best} days`, zh: `最长生存：${best}天` });
}

export function endlessLabel(state) {
  const s = endlessStateOf(state);
  if (!s) return '';
  return pickLang(s === ENDLESS_PURE ? { en: 'Endless Mode', zh: '无尽模式' } : { en: 'Story Endless', zh: '剧情无尽' });
}

// ------------------------------------------------------------------------------------------ staged area unlocks
// Endless runs have no story quests, so every locked area of the home comes back as an unlock task, one more per
// day from the first endless day. Warehouse order per patch 08-17: cold storage, the way down to the lower level
// (the "right area"), the garage, the left cabin.
export const ENDLESS_UNLOCK_ORDER = {
  apartment: ['2F', 'B1'],
  duplex: ['2F', 'B1'],
  warehouse: ['coldStorage', 'B1', 'garage', 'cabin'],
};
const STAIRS_FUNC = 1730;
const BASEMENT_FUNC = 1731;
const BASEMENT_DAILY = 'story:repairBasement'; // shared with the story quest: one clearing session per day
const CRAFT_FUNC = 37;

const TASKS = {
  '2F': {
    title: { en: 'Repair the stairs', zh: '修复楼梯' },
    desc: { en: 'The way upstairs is broken. Fixing it takes 2× Wooden Plank and some stamina. Click to start.', zh: '去楼上的路坏了。修好它需要木板×2和一些精力。点击开始修理。' },
  },
  B1: {
    title: { en: 'Open the basement', zh: '打通地下室' },
    desc: { en: 'The way down needs clearing, one session per day. Click to work on it.', zh: '下去的路需要清理，每天可以清理一次。点击开始清理。' },
  },
  coldStorage: { title: { en: 'Open the cold storage', zh: '打开冷库' } },
  garage: {
    title: { en: 'Open the garage', zh: '打开车库' },
    find: 'coldStorage',
    found: { en: 'Behind a crate of frozen dumplings in the cold storage: an old copper key marked SHUTTER.', zh: '冷库里一箱速冻饺子后面，有一把写着“卷帘”的旧铜钥匙。' },
    hidden: { en: 'The shutter key must be somewhere in the cold storage.', zh: '卷帘门的钥匙应该就在冷库里。' },
  },
  cabin: { title: { en: 'Open the left cabin', zh: '打开左侧小屋' } },
};
const TITLE_BY_HOME = { warehouse: { B1: { en: 'Clear the way to the lower level', zh: '打通下层' } } };

export function unlockTasks(state) {
  return (state.run.endlessUnlocks ||= { startDay: null, released: [], done: {}, keys: [] });
}

function homeLocks(state) {
  return homeDef(state.home.id)?.locks || {};
}

function unlockOrder(state) {
  const locks = homeLocks(state);
  const order = (ENDLESS_UNLOCK_ORDER[state.home.id] || []).filter((a) => locks[a]);
  return [...order, ...Object.keys(locks).filter((a) => !order.includes(a))];
}

function keyRecipe(itemId) {
  return RECIPE_ORDER.find((id) => recipeDef(id).out.includes(itemId)) ?? null;
}

// The floor a lock sits on: the floor itself, or the floor of the locked room.
function lockFloor(state, area) {
  const floors = homeDef(state.home.id).floors;
  if (floors[area]) return area;
  return Object.keys(floors).find((fl) => floors[fl].rooms?.some((r) => r.lock === area)) || '1F';
}

function taskTitle(state, area) {
  const t = TITLE_BY_HOME[state.home.id]?.[area] || TASKS[area]?.title;
  if (t) return pickLang(t);
  const lock = homeLocks(state)[area];
  return pickLang({ en: `Unlock: ${pickLang(lock?.label || { en: area, zh: area })}`, zh: `解锁：${pickLang(lock?.label || { en: area, zh: area })}` });
}

function onRelease(state, area) {
  const lock = homeLocks(state)[area];
  const recipe = lock?.item ? keyRecipe(lock.item) : null;
  if (recipe) unlockRecipe(state, recipe);
  emit('toast', { text: `${pickLang({ en: 'New task', zh: '新任务' })}: ${taskTitle(state, area)}` });
}

// Releases the tasks that are due today; areas that are already open are skipped. Returns the new ones.
export function releaseUnlockTasks(state) {
  if (!isEndless(state) || state.phase !== 'post' || !state.home) return [];
  const u = unlockTasks(state);
  u.startDay ??= state.meta.endlessStartDay ?? state.run.endlessStartDay ?? dayNumber(state.clock);
  const due = dayNumber(state.clock) - u.startDay + 1;
  const fresh = [];
  while (u.released.length < due) {
    const area = unlockOrder(state).find((a) => !u.released.includes(a) && !state.home.unlocked[a]);
    if (!area) break;
    u.released.push(area);
    fresh.push(area);
    onRelease(state, area);
  }
  return fresh;
}

// Keys nobody can craft turn up once their hiding place is open; finished tasks are marked for the day.
function syncUnlockTasks(state) {
  const u = state.run.endlessUnlocks;
  if (!u?.released.length) return;
  const locks = homeLocks(state);
  const day = dayNumber(state.clock);
  for (const area of u.released) {
    const lock = locks[area];
    if (state.home.unlocked[area]) {
      if (u.done[area] == null) {
        u.done[area] = day;
        emit('toast', { text: `${pickLang({ en: 'Objective complete', zh: '目标完成' })}: ${taskTitle(state, area)}`, kind: 'good' });
      }
      continue;
    }
    if (!lock?.item || keyRecipe(lock.item) || u.keys.includes(area)) continue;
    const find = TASKS[area]?.find;
    if (find && locks[find] && !state.home.unlocked[find]) continue;
    u.keys.push(area);
    if (countIn(state, homeSources(state), lock.item) > 0) continue;
    giveItems(state, [[lock.item, 1]]);
    const found = TASKS[area]?.found;
    emit('toast', { text: found ? pickLang(found) : pickLang({ en: `You found the ${itemName(lock.item)}.`, zh: `你找到了${itemName(lock.item)}。` }), kind: 'good' });
  }
}

function workingBench(state) {
  return homeFurniture(state).find((f) => (f.cfg === 'workbench' && !f.broken) || (typeof f.cfg === 'number' && furn(f.cfg)?.funcs?.includes(CRAFT_FUNC))) || null;
}

function queued(state, key) {
  return [state.actions.current, ...state.actions.queue].some((a) => a?.storyKey === key);
}

// The same area repair the story quests queue: walk to the stairs and work on them.
export function queueAreaRepair(state, area) {
  const lock = homeLocks(state)[area];
  const stairs = lock?.taskId === 'repairStairs';
  if (!lock?.taskId || state.home.unlocked[area] || queued(state, lock.taskId)) return null;
  if (!stairs && dailyCount(state, BASEMENT_DAILY) >= 1) {
    emit('toast', { text: pickLang({ en: 'You have done all you can down there today.', zh: '今天能做的都做了。' }) });
    return null;
  }
  const tile = homeDef(state.home.id).floors['1F']?.[stairs ? 'stairsUp' : 'stairsDown'];
  if (!tile) return null;
  const spec = FUNC_SPECS[stairs ? STAIRS_FUNC : BASEMENT_FUNC];
  return enqueue(state, {
    kind: 'unlockArea',
    storyKey: lock.taskId,
    label: taskTitle(state, area),
    target: { floor: '1F', x: tile[0], y: tile[1] },
    dur: spec.min * 60,
    cost: spec.cost,
    spec,
    dailyKey: stairs ? null : BASEMENT_DAILY,
  });
}

function openKeyCraft(state) {
  const bench = workingBench(state);
  if (bench) emit('openPanel', { panel: 'craft', furn: bench.uid });
  else emit('toast', { text: pickLang({ en: 'Get the workbench working first.', zh: '先把工作台修好。' }) });
}

function taskView(state, area) {
  const lock = homeLocks(state)[area];
  const u = unlockTasks(state);
  const floor = lockFloor(state, area);
  const first = floor !== area && !state.home.unlocked[floor] ? `${pickLang({ en: 'First: ', zh: '先' })}${taskTitle(state, floor)}` : null;
  if (lock?.taskId) {
    const stairs = lock.taskId === 'repairStairs';
    const need = state.home.repairsNeeded?.[area] ?? lock.repairs ?? 2;
    const prog = stairs
      ? `${itemName(20106)} ${Math.min(2, countIn(state, homeSources(state), 20106))}/2`
      : `${state.home.repairs?.[area] || 0}/${need}`;
    return { desc: pickLang(TASKS[stairs ? '2F' : 'B1'].desc), prog, onClick: () => queueAreaRepair(state, area) };
  }
  const recipe = lock?.item ? keyRecipe(lock.item) : null;
  if (recipe) {
    const mats = recipeNeeds(recipe).map(([id, n]) => `${itemName(id)}×${n}`).join(pickLang({ en: ', ', zh: '、' }));
    return {
      desc: pickLang({ en: `Craft the ${itemName(lock.item)} at the workbench (${mats}).`, zh: `在工作台制作${itemName(lock.item)}（${mats}）。` }),
      prog: first,
      onClick: () => openKeyCraft(state),
    };
  }
  const t = TASKS[area] || {};
  const have = u.keys.includes(area);
  return {
    desc: have ? pickLang({ en: `The ${itemName(lock.item)} opens it once you are home.`, zh: `回到家就能用${itemName(lock.item)}打开。` }) : pickLang(t.hidden || { en: 'Its key is somewhere in the house.', zh: '钥匙就在屋子里的某个地方。' }),
    prog: first,
    onClick: first ? () => queueAreaRepair(state, floor) : null,
  };
}

registerObjectives((state) => {
  const u = state.run?.endlessUnlocks;
  if (!u?.released.length || state.phase !== 'post' || !isEndless(state)) return null;
  const day = dayNumber(state.clock);
  const out = [];
  for (const area of u.released) {
    const done = !!state.home.unlocked[area];
    if (done && (u.done[area] ?? day) < day) continue;
    const t = done ? {} : taskView(state, area);
    out.push({ id: `endless:${area}`, text: `${done ? '✔ ' : ''}${taskTitle(state, area)}`, prog: t.prog || null, done, tip: t.desc || null, onClick: t.onClick || null });
  }
  return out;
});

// ------------------------------------------------------------------------------------------ live wiring
registerSystem({
  id: 'endless',
  order: 90,
  init(state, opts) {
    if (opts?.mode === 'pureEndless' || state.meta.mode === 'pureEndless') applyEndlessStart(state, opts || {});
    releaseUnlockTasks(state);
  },
  ensure(state) {
    if (state.meta && state.meta.mode !== 'story' && state.meta.endlessState == null) state.meta.endlessState = endlessStateOf(state);
  },
  onHour(state) {
    releaseUnlockTasks(state);
    syncUnlockTasks(state);
    if (state === game.state && updateEndlessRecords(state, game.history)) persistHistory();
  },
  onDay(state) {
    releaseUnlockTasks(state);
  },
  onDeath(state) {
    if (state === game.state && updateEndlessRecords(state, game.history)) persistHistory();
  },
});

on('storyEndless', (p) => {
  const s = p?.state || game.state;
  if (!s) return;
  enterStoryEndless(s);
  updateEndlessRecords(s, game.history);
  persistHistory();
  emit('endlessStarted', { mode: 'endless', state: s });
});

// ------------------------------------------------------------------------------------------ title screen
const NARRATION = [
  {
    en: 'No notebook this time. No second chance ten hours before the end, no memories carried over from the last loop.',
    zh: '这一次没有日志。没有末日前十小时的重来机会，也没有从上一轮带回来的记忆。',
  },
  {
    en: 'There is no ending waiting on Day 100 either. No rescue beacon, no neighbor, no answer from anyone. Only the dead, the house, and whatever you managed to carry inside.',
    zh: '第100天也不会有结局在等你。没有救援信标，没有邻居，没有任何人的答复。只有丧尸、这栋房子，和你带进门的那点东西。',
  },
  {
    en: 'The hordes will not stop. They only grow. How long can you last?',
    zh: '尸潮不会停下，只会越来越凶。你能撑多久？',
  },
];

const STAT_LABEL = {
  sat: { en: 'Satiety', zh: '饱腹' },
  sta: { en: 'Stamina', zh: '精力' },
  mor: { en: 'Morale', zh: '心态' },
  life: { en: 'Life', zh: '生命' },
};

export function endlessScreen() {
  const hist = game.history;
  const unlocked = hist.characters || {};
  let character = CHARACTER_ORDER.find((id) => unlocked[id]) || 'wage';
  const budget = endlessPoints(hist);
  const alloc = { sat: 0, sta: 0, mor: 0, life: 0 };
  const spent = () => Object.values(alloc).reduce((a, b) => a + b, 0);

  const render = () => {
    const cards = CHARACTER_ORDER.map((id) => {
      const c = CHARACTERS[id];
      const locked = !unlocked[id];
      const best = hist.endless?.best?.[id];
      return h(
        'div',
        {
          class: `charcard ${character === id ? 'sel' : ''} ${locked ? 'locked' : ''}`,
          onclick: () => {
            if (locked) return toast(pickLang(c.unlockHint || { en: 'Locked', zh: '未解锁' }), 'bad');
            character = id;
            render();
          },
        },
        h('div', { class: 'charportrait', style: { background: `linear-gradient(135deg, ${c.color}55, #1c1f24)` } }, { wage: '👔', student: '🎓', warehouse: '📦' }[id]),
        h('h3', {}, pickLang(c.name), locked ? h('span', { class: 'dim' }, ` · ${tr('menu.locked')}`) : null),
        h('div', { class: 'warn' }, pickLang(c.defenseLine)),
        h(
          'div',
          { class: 'dim' },
          best != null
            ? pickLang({ en: `Longest survival: ${best} days`, zh: `最长生存：${best}天` })
            : pickLang({ en: 'No endless record yet', zh: '暂无无尽记录' })
        ),
        locked ? h('div', { class: 'bad' }, pickLang(c.unlockHint)) : null
      );
    });
    const rows = STAT_KEYS.map((k) =>
      h(
        'div',
        { class: 'row', style: { alignItems: 'center', margin: '3px 0' } },
        h('span', { style: { width: '90px' } }, pickLang(STAT_LABEL[k])),
        h('button', { disabled: alloc[k] <= 0 ? true : null, onclick: () => ((alloc[k] -= 1), render()) }, '−'),
        h(
          'span',
          { style: { width: '120px', letterSpacing: '2px', color: 'var(--accent)' } },
          '■'.repeat(alloc[k]) + '□'.repeat(ALLOC_MAX_LV - alloc[k])
        ),
        h('button', { disabled: alloc[k] >= ALLOC_MAX_LV || spent() >= budget ? true : null, onclick: () => ((alloc[k] += 1), render()) }, '+'),
        h('span', { class: 'dim' }, `${pickLang({ en: 'Max', zh: '上限' })} +${alloc[k] * ALLOC_STEP}`)
      )
    );
    showScreen(
      h(
        'div',
        { class: 'screen' },
        h('h2', {}, pickLang({ en: 'Endless Mode · Pure Endless', zh: '无尽模式 · 纯净无尽' })),
        h(
          'div',
          { class: 'dim', style: { maxWidth: '720px', textAlign: 'center' } },
          pickLang({
            en: `No story and no prep: you start on the night of the outbreak with a small kit. Hordes grow with the threat level. Highest threat reached: ${hist.endless?.maxThreat || 0}.`,
            zh: `没有剧情，也没有灾前准备：你将在灾变当晚带着一点物资开局。尸潮会随威胁等级增强。最高威胁等级：${hist.endless?.maxThreat || 0}。`,
          })
        ),
        h('div', { class: 'charcards' }, ...cards),
        h(
          'div',
          { class: 'card', style: { width: '460px' } },
          h('h5', {}, pickLang({ en: 'Starting attribute points', zh: '初始属性点' }), h('span', { class: 'dim' }, `  ${budget - spent()} / ${budget}`)),
          h('div', { class: 'dim' }, pickLang({ en: `Each point raises a maximum by ${ALLOC_STEP}. More points come from endings and achievements.`, zh: `每点提升一项上限${ALLOC_STEP}。达成结局与成就可获得更多点数。` })),
          ...rows
        ),
        h(
          'div',
          { class: 'row' },
          h('button', { onclick: () => titleScreen() }, tr('menu.back')),
          h('button', { class: 'primary', onclick: () => confirmStart() }, pickLang({ en: 'Begin Pure Endless', zh: '开始纯净无尽' }))
        )
      )
    );
  };

  const confirmStart = () => {
    openWindow('endlessConfirm', {
      title: pickLang({ en: 'Pure Endless', zh: '纯净无尽' }),
      width: 480,
      modal: true,
      build: (body) => {
        body.appendChild(h('div', { class: 'story-text', style: { fontSize: '14px', textAlign: 'left' } }, ...NARRATION.map((line) => h('p', {}, pickLang(line)))));
        body.appendChild(
          h(
            'div',
            { class: 'dim' },
            pickLang({
              en: `${pickLang(CHARACTERS[character].name)} · the pre-disaster phase is skipped · a starter kit waits at the door.`,
              zh: `${pickLang(CHARACTERS[character].name)} · 跳过灾前阶段 · 门口放着一份初始物资。`,
            })
          )
        );
        body.appendChild(
          h(
            'div',
            { class: 'row', style: { marginTop: '10px', justifyContent: 'flex-end' } },
            h('button', { onclick: () => closeWindow('endlessConfirm') }, tr('menu.cancel')),
            h(
              'button',
              {
                class: 'primary',
                onclick: () => {
                  closeWindow('endlessConfirm');
                  startRun({ character, mode: 'pureEndless', difficulty: 'normal', endlessAlloc: { ...alloc }, endlessPoints: budget });
                  showScreen(null);
                  emit('enterGame', { fresh: true, endless: true });
                },
              },
              tr('menu.confirm')
            )
          )
        );
      },
    });
  };

  render();
}

registerMenuButton({ label: () => tr('menu.endless'), run: () => endlessScreen() });
