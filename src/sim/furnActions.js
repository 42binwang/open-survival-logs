// Furniture interactions: which functions a piece offers right now, and the generic action kinds.
import { furn, func, item, itemName } from '../data/db.js';
import { FUNC_SPECS, SCENERY_SPECS, parsePreview } from '../content/funcSpecs.js';
import { SCENERY } from '../content/homes.js';
import { enqueue, registerKind, getKind, homeStairs } from './actions.js';
import { addStat, addEffect, removeEffect, dailyCount, bumpDaily, effectiveMax, hasEffect } from './stats.js';
import { countIn, takeFrom, insert, makeInstance, useOnce } from './inventory.js';
import { dismantle, furnLabel, slotDef, effectiveMaxHp, dropToFloor, removeFurniture, isFloorUnlocked, isRoomUnlocked } from './home.js';
import { getMods } from './modifiers.js';
import { loc, pickLang, tr } from '../engine/i18n.js';
import { emit } from '../engine/bus.js';
import { rand, pick, weighted } from '../engine/rng.js';
import { LOOT_POOLS as SITE_POOLS, LOOT_TABLES, SITES } from '../content/sites.js';
import { hourOfDay, isNight, dayNumber } from './time.js';
import { disinfect } from './spoilage.js';
import { addProfExp } from './proficiency.js';
import { registerObjectives } from './objectives.js';

// Inventories the survivor can draw materials from at home: backpack first, then furniture storage.
export function homeSources(state) {
  const ids = [state.player.backpack];
  for (const f of Object.values(state.furniture)) if (f.inv && state.home.slots[f.slot] === f.uid) ids.push(f.inv);
  return ids;
}

export function hasItems(state, need, sources = homeSources(state)) {
  return (need || []).every(([id, n]) => countIn(state, sources, id) >= n);
}

export function consumeItems(state, need, sources = homeSources(state)) {
  for (const [id, n] of need || []) takeFrom(state, sources, id, n);
}

export function giveItems(state, list) {
  const bp = state.inventories[state.player.backpack];
  for (const [id, n] of list || []) {
    for (let i = 0; i < n; i++) {
      const inst = makeInstance(state, id);
      if (!insert(bp, inst, { allowOverweight: true })) dropToFloor(state, inst, state.player.floor, state.player.x, state.player.y);
      emit('gotItem', { id });
    }
  }
}

function specFor(state, f, key) {
  if (typeof f.cfg === 'string') return SCENERY_SPECS[key];
  const s = FUNC_SPECS[key];
  if (s) return s;
  const cfg = func(key);
  if (!cfg) return null;
  const pv = parsePreview(cfg.preview);
  if (Object.keys(pv.gain).length || Object.keys(pv.cost).length || Object.keys(pv.max).length) {
    return { kind: 'stat', min: 30, cost: pv.cost, gain: pv.gain, max: pv.max };
  }
  return null;
}

function funcLabel(f, key) {
  if (typeof f.cfg === 'string') {
    const labels = {
      craft: { en: 'Craft', zh: '制造' },
      repairWorkbench: { en: 'Repair Workbench', zh: '修理工作台' },
      studyWorkbench: { en: 'Study Its Structure', zh: '钻研构造' },
      drawer: { en: 'Workbench Drawer', zh: '工作台抽屉' },
      dismantle: { en: 'Dismantle', zh: '拆除' },
      cleanMagazines: { en: 'Clear the Stacks', zh: '清理报纸堆' },
      clearRubble: { en: 'Clear Rubble', zh: '清理碎石' },
      radio: { en: 'Listen to Radio', zh: '听收音机' },
      trapOpen: { en: 'Check Trap / Bait', zh: '查看陷阱 / 放诱饵' },
      trapRemove: { en: 'Take Trap Back', zh: '收回陷阱' },
    };
    return pickLang(labels[key] || { en: key, zh: key });
  }
  const cfg = func(key);
  return cfg ? loc(cfg.zh) || key : String(key);
}

function funcTip(f, key) {
  if (typeof f.cfg === 'string') return '';
  const cfg = func(key);
  return cfg?.tip ? loc(cfg.tip) : '';
}

const phaseOk = (state, cfg) => {
  if (!cfg) return true;
  if (cfg.chapter === 1) return state.phase === 'pre';
  if (cfg.chapter === 2) return state.phase !== 'pre';
  return true;
};

// Workbench functions (Config_FurnitureFunc): 37 Craft, 220 Repair Workbench, 249 Study Its Structure, 238
// Workbench Drawer, 247 Fix the Vice. Its visibility condition (FuncVisible 10054) is not in the extracted config;
// the story's own first look at the house says the bench's vice will not turn (src/content/events.js), so a broken
// bench offers it beside its manual (220) and the Day 6 study (249).
const BENCH_REPAIR = 220;
const BENCH_FIX_KEYS = new Set([220, 247, 249]);
const BENCH_BROKEN_KEYS = new Set([37, 220, 247, 249, 238]);

// Returns [{ key, label, tip, spec, enabled, reason }]
export function furnitureFunctions(state, f) {
  const def = typeof f.cfg === 'string' ? SCENERY[f.cfg] : furn(f.cfg);
  if (!def) return [];
  let keys = [...(def.funcs || [])];
  if (typeof f.cfg !== 'string') {
    if (!f.fixed) keys.push(...(def.mvFunc || []));
    if (!f.fixed) keys.push(...(def.rmFunc || []));
  }
  if (f.broken && f.cfg === 'workbench') keys = ['craft', 'repairWorkbench', 'studyWorkbench', 'drawer'];
  if (!f.broken && f.cfg === 'workbench') keys = keys.filter((k) => k !== 'repairWorkbench' && k !== 'studyWorkbench');
  // A config workbench (Repair Workbench 220 among its functions) the same way: broken, it offers crafting (which
  // tells it is broken), the repair, the study and the drawer; working, no repair or study.
  if (typeof f.cfg === 'number' && keys.includes(BENCH_REPAIR)) {
    if (f.broken) keys = keys.filter((k) => BENCH_BROKEN_KEYS.has(k));
    else keys = keys.filter((k) => !BENCH_FIX_KEYS.has(k));
  }
  const slot = slotDef(state, f.slot);
  // a piece on a floor or in a room still locked is out of the survivor's reach
  if (slot && state.home && (!isFloorUnlocked(state, slot.floor) || !isRoomUnlocked(state, slot.floor, slot.x, slot.y))) return [];
  const out = [];
  // One button per label, kind and panel. Availability is checked first, so a function hidden in this run never
  // shadows a visible one with the same label (the basket's two kit gifts: 2116 for the neighbour girl, 2121 for the
  // College Student's companion); among visible duplicates an enabled one replaces a disabled one.
  const seen = new Map();
  for (const key of keys) {
    const cfg = typeof key === 'number' ? func(key) : null;
    const spec = specFor(state, f, key);
    if (!spec) continue;
    if (!spec.anyPhase && !phaseOk(state, cfg)) continue;
    const label = funcLabel(f, key);
    if (!label) continue;
    const dup = `${label}|${spec.kind}|${spec.panel || ''}`;
    const prev = seen.get(dup);
    if (prev && prev.enabled) continue;
    const res = availability(state, f, key, spec, cfg, slot);
    if (res === 'hide') continue;
    const entry = { key, label, tip: funcTip(f, key), spec, enabled: res === true, reason: res === true ? '' : res };
    if (prev) {
      if (entry.enabled) out[out.indexOf(prev)] = entry;
      else continue;
    } else out.push(entry);
    seen.set(dup, entry);
  }
  return out;
}

// Systems can hide or disable specific furniture functions and panel-opening buttons.
const funcAvailability = new Map();
const panelAvailability = new Map();

export function registerFuncAvailability(key, fn) {
  funcAvailability.set(key, fn);
}

export function registerPanelAvailability(panel, fn) {
  panelAvailability.set(panel, fn);
}

// New Game+ twins (FUNC_SPECS twinOf): base key -> twin key.
const TWINS = new Map(Object.entries(FUNC_SPECS).filter(([, sp]) => sp.twinOf).map(([k, sp]) => [sp.twinOf, Number(k)]));
const learned = (state) => !!state.story?.tags?.advancedReinforce;

function availability(state, f, key, spec, cfg) {
  // a New Game+ twin shows in New Game+ until the quest teaches the base button; the base hides meanwhile where the
  // piece offers the twin
  if (spec.twinOf) {
    if (!state.loop?.ngPlus || learned(state)) return 'hide';
  } else if (TWINS.has(key) && state.loop?.ngPlus && !learned(state) && typeof f.cfg === 'number' && (furn(f.cfg)?.funcs || []).includes(TWINS.get(key))) return 'hide';
  if (spec.outing) {
    const out = Object.values(state.pre?.visits || {}).some((n) => n > 0);
    if ((spec.outing === 'first') === out) return 'hide';
  }
  const kindCheck = getKind(spec.kind)?.available?.(state, f, spec);
  if (kindCheck !== undefined && kindCheck !== true) return kindCheck;
  const funcCheck = funcAvailability.get(key)?.(state, f, spec);
  if (funcCheck !== undefined && funcCheck !== true) return funcCheck;
  if (spec.kind === 'open') {
    const panelCheck = panelAvailability.get(spec.panel)?.(state, f, spec);
    if (panelCheck !== undefined && panelCheck !== true) return panelCheck;
  }
  const daily = spec.daily ?? spec.dailyMax ?? cfg?.daily ?? 0;
  if (daily && dailyCount(state, `func:${key}:${f.uid}`) >= daily) return tr('ui.dailyLimit') === 'ui.dailyLimit' ? 'Done for today' : tr('ui.dailyLimit');
  if (spec.kind === 'throwBait' && !hasItems(state, spec.need)) return 'hide';
  if (spec.tool && !hasItems(state, [[spec.tool, 1]])) return pickLang({ en: `Needs ${loc(item(spec.tool)?.zh)}`, zh: `需要${loc(item(spec.tool)?.zh)}` });
  if (spec.needPower && f.powered === false) return pickLang({ en: 'No power', zh: '没有电' });
  if (spec.need && !hasItems(state, needFor(state, spec))) {
    const [id, n] = spec.need[0];
    return pickLang({ en: `Needs ${n}× ${loc(item(id)?.zh)}`, zh: `需要${loc(item(id)?.zh)}×${n}` });
  }
  if (spec.kind === 'repair') {
    if (f.hp >= effectiveMaxHp(f)) return pickLang({ en: 'Fully repaired', zh: '已修满' });
    // Advanced Repair has to be learned first; New Game+ can use it right away (patch 09-04).
    if (spec.advanced && !state.loop.ngPlus && !state.story.tags.advancedReinforce) return pickLang({ en: 'Learn it first (quest)', zh: '需先完成任务' });
  }
  if (spec.kind === 'reinforce') {
    const cap = reinforceCap(state, f, spec);
    if ((f.reinforce || 0) >= cap) return pickLang({ en: 'Limit Reached', zh: '已达上限' });
    if (spec.advanced && !state.loop.ngPlus && !state.story.tags.advancedReinforce) return pickLang({ en: 'Learn it first (quest)', zh: '需先完成任务' });
  }
  if (spec.kind === 'commit') return state.story.commitAvailable?.[spec.route] ? true : 'hide';
  if (spec.kind === 'goExplore' && state.phase === 'pre') return 'hide';
  if (spec.kind === 'goOut' && state.phase !== 'pre') return 'hide';
  if (spec.kind === 'iceBath') {
    const s = state.player.stats;
    if (s.sat > 40 || s.sta > 40) return pickLang({ en: 'Needs Satiety and Stamina ≤ 40', zh: '需饱腹、精力均≤40' });
  }
  if (spec.kind === 'toilet' && dailyCount(state, 'toilet') >= 2) return pickLang({ en: 'Not now', zh: '现在不需要' });
  if (spec.kind === 'dismantle' && f.fixed) return 'hide';
  if (spec.kind === 'sleep' && !isNight(state.clock) && state.player.stats.sta > 70) return pickLang({ en: 'Not tired', zh: '还不困' });
  if (spec.kind === 'studyWorkbench' && (state.phase === 'pre' || dayNumber(state.clock) < 6)) return pickLang({ en: 'Needs more time (Day 6+)', zh: '需要更多时间（第6天后）' });
  return true;
}

export function reinforceCap(state, f, spec) {
  // Plain reinforcement (sheet metal / glass) caps at +300; advanced tiers stack to +1500 total.
  return spec.advanced ? 1500 : 300;
}

export function startFurnitureFunction(state, uid, key, extra = {}) {
  const f = state.furniture[uid];
  if (!f) return null;
  const entry = furnitureFunctions(state, f).find((e) => e.key === key);
  if (!entry) return null;
  if (!entry.enabled) {
    emit('toast', { text: entry.reason, kind: 'bad' });
    return null;
  }
  const spec = entry.spec;
  const quick = TAKE_APART.has(spec.kind) && hasItems(state, [[PLIERS, 1]]) ? 0.5 : 1;
  const a = enqueue(state, {
    kind: spec.kind,
    label: entry.label,
    target: { furn: uid },
    furn: uid,
    funcKey: key,
    dur: (spec.min || 0) * 60 * quick,
    spec,
    cost: spec.cost,
    gain: spec.gain,
    max: spec.max,
    rest: spec.kind === 'nap' || spec.kind === 'sleep',
    dailyKey: (spec.daily ?? spec.dailyMax ?? func(key)?.daily) ? `func:${key}:${uid}` : null,
    continuous: !!spec.continuous,
    ...extra,
  });
  return a;
}

// A config function a panel button runs on a piece whose FurnitureFunc does not list it (the generator panel's 开启 /
// 关闭发电机, 1701 / 1702; the record player's 下一首, 80013): the same action the furniture menu would queue.
export function queuePanelFunction(state, uid, key, extra = {}) {
  const f = state.furniture[uid];
  const spec = FUNC_SPECS[key];
  if (!f || !spec) return null;
  return enqueue(state, { kind: spec.kind, label: funcLabel(f, key), target: { furn: uid }, furn: uid, funcKey: key, dur: (spec.min || 0) * 60, spec, cost: spec.cost, gain: spec.gain, max: spec.max, ...extra });
}

// Tool Pliers (20350, "can take apart some small items"): dismantling and recycling take half the time,
// and recycling recovers every material.
export const PLIERS = 20350;
const TAKE_APART = new Set(['dismantle', 'recycle']);

// ----------------------------------------------------------------------------- generic kinds
// The materials a function takes: its need, or the first alternative (spec.needAlt) the survivor has instead.
export function needFor(state, spec) {
  if (!spec?.need || hasItems(state, spec.need)) return spec?.need;
  return (spec.needAlt || []).find((alt) => hasItems(state, alt)) || spec.need;
}

const needCheck = (state, a) => {
  const need = needFor(state, a.spec);
  if (need && !hasItems(state, need)) return pickLang({ en: 'Missing materials', zh: '材料不足' });
  return true;
};

registerKind('open', {
  complete(state, a) {
    emit('openPanel', { panel: a.spec.panel, furn: a.furn, spec: a.spec });
  },
});

registerKind('stat', {
  canStart: needCheck,
  complete(state, a) {
    consumeItems(state, a.spec.need);
    if (a.spec.give) giveItems(state, a.spec.give);
    if (a.spec.effect) addEffect(state, a.spec.effect[0], a.spec.effect[1]);
    if (a.spec.windUp != null) {
      const f = state.furniture[a.furn];
      if (f) f.data.wound = a.spec.windUp;
    }
    if (a.spec.story) emit('story', { id: a.spec.story, furn: a.furn });
  },
});

function sleepRestore(state, a, bedUid) {
  const f = state.furniture[bedUid];
  const bedCoeff = f && typeof f.cfg === 'number' ? furn(f.cfg).restore || 1 : 1;
  const mods = getMods(state);
  const night = isNight(state.clock) || hourOfDay(state.clock) < 8;
  const timeMult = night ? mods.sleepNight : Math.max(0.2, mods.sleepDay);
  const insomnia = hasEffect(state, 'insomnia') ? 0.5 : 1;
  const drowsy = hasEffect(state, 'sleepy') ? 1.5 : 1;
  return bedCoeff * timeMult * insomnia * drowsy * mods.restGain;
}

registerKind('sleep', {
  begin(state, a) {
    state.player.sleeping = true;
    const mods = getMods(state);
    if (mods.lightSleeper) a.dur = Math.round(a.dur * 0.8);
    a.restPerSec = (effectiveMax(state, 'sta') / a.dur) * sleepRestore(state, a, a.furn);
  },
  progress(state, a, dt) {
    addStat(state, 'sta', a.restPerSec * dt, 'sleep');
    addStat(state, 'mor', (2 / 3600) * dt, 'sleep');
  },
  cancel(state) {
    state.player.sleeping = false;
  },
  complete(state) {
    state.player.sleeping = false;
    removeEffect(state, 'insomnia');
    state.progress.counters.sleeps = (state.progress.counters.sleeps || 0) + 1;
  },
});

registerKind('nap', {
  begin(state, a) {
    state.player.sleeping = true;
    a.restPerSec = (15 / 3600) * sleepRestore(state, a, a.furn);
  },
  progress(state, a, dt) {
    addStat(state, 'sta', a.restPerSec * dt, 'nap');
  },
  cancel(state) {
    state.player.sleeping = false;
  },
  complete(state) {
    state.player.sleeping = false;
  },
});

registerKind('toggle', {
  complete(state, a) {
    const f = state.furniture[a.furn];
    if (f) {
      f.on = a.spec.on;
      emit('powerChanged', {});
    }
  },
});

const LOOT_POOLS = {
  books: [2505, 2506, 3001, 3002, 3003, 3004, 3006, 3011, 3012, 3013, 3014, 3022, 3023, 3024],
  rummage: [20001, 20002, 20003, 20005, 20001, 2509, 2135, 2143, 11012, 20104, 20220],
  doorstep: [20001, 20002, 20003, 20004, 2133, 2135, 20005, 2911, 2902],
  pickup: [20001, 20003, 20005],
};

registerKind('makeItem', {
  canStart(state, a) {
    if (a.spec.needPower) {
      const f = state.furniture[a.furn];
      if (f && f.powered === false) return pickLang({ en: 'No power', zh: '没有电' });
    }
    return true;
  },
  complete(state, a) {
    if (a.spec.give) giveItems(state, a.spec.give);
    if (a.spec.lootPool) {
      const pool = LOOT_POOLS[a.spec.lootPool];
      const n = rand(state) < 0.35 ? 2 : 1;
      const got = [];
      for (let i = 0; i < n; i++) {
        if (rand(state) < 0.2) continue;
        got.push([pick(state, pool), 1]);
      }
      giveItems(state, got);
      if (!got.length) emit('toast', { text: pickLang({ en: 'Nothing useful this time.', zh: '这次没找到什么有用的。' }) });
    }
  },
});

// Mold Crisis: point at the moldy container until it has been disinfected.
registerObjectives((state) => {
  if (!state.crises?.mold) return null;
  const moldy = Object.values(state.furniture).find((f) => f.inv && state.inventories[f.inv]?.moldy);
  return [
    {
      id: 'mold',
      text: pickLang({ en: `Mold Crisis: disinfect the ${moldy ? furnLabel(moldy) : 'moldy container'} with disinfectant spray`, zh: `霉菌危机：用消毒喷雾给${moldy ? furnLabel(moldy) : '发霉的容器'}消毒` }),
      urgent: true,
    },
  ];
});

registerKind('disinfect', {
  canStart(state) {
    const sprays = [2164, 2165, 2166];
    return sprays.some((id) => countIn(state, homeSources(state), id) > 0) ? true : pickLang({ en: 'No disinfectant spray', zh: '没有消毒喷雾' });
  },
  complete(state, a) {
    const f = state.furniture[a.furn];
    const inv = f?.inv && state.inventories[f.inv];
    const sprays = [
      [2166, 3],
      [2165, 2],
      [2164, 1],
    ];
    for (const [id, strength] of sprays) {
      if (countIn(state, homeSources(state), id) > 0) {
        useOnce(state, homeSources(state), id);
        if (inv) disinfect(state, inv, strength);
        break;
      }
    }
  },
});

registerKind('iceBath', {
  canStart: needCheck,
  complete(state, a) {
    consumeItems(state, needFor(state, a.spec));
    addStat(state, 'mor', 25, 'iceBath');
    addStat(state, 'sta', 30, 'iceBath');
    state.progress.counters['bath.ice'] = (state.progress.counters['bath.ice'] || 0) + 1;
    if (rand(state) < 0.35) addEffect(state, 'cold', 8);
    if (rand(state) < 0.15) addEffect(state, 'fever', 12);
  },
});

registerKind('toilet', {
  canStart: needCheck,
  complete(state, a) {
    consumeItems(state, a.spec.need);
    giveItems(state, a.spec.give);
    bumpDaily(state, 'toilet');
    addStat(state, 'mor', 2, 'toilet');
  },
});

registerKind('lookout', {});

registerKind('radio', {
  complete(state, a) {
    emit('radio', { furn: a.furn });
  },
});

registerKind('repair', {
  canStart: needCheck,
  complete(state, a) {
    const f = state.furniture[a.furn];
    if (!f) return;
    consumeItems(state, a.spec.need);
    const amount = a.spec.amount * getMods(state).repairMult;
    f.hp = Math.min(effectiveMaxHp(f), f.hp + amount);
    addProfExp(state, 'defense', a.spec.amount >= 500 ? 20 : 8);
    state.progress.counters['door.repair'] = (state.progress.counters['door.repair'] || 0) + 1;
    emit('repaired', { furn: f.uid, hp: f.hp });
  },
});

registerKind('reinforce', {
  canStart: needCheck,
  complete(state, a) {
    const f = state.furniture[a.furn];
    if (!f) return;
    consumeItems(state, a.spec.need);
    const before = f.reinforce || 0;
    f.reinforce = Math.min(reinforceCap(state, f, a.spec), before + a.spec.amount);
    f.hp = Math.min(effectiveMaxHp(f), f.hp + (f.reinforce - before));
    addProfExp(state, 'defense', 15);
  },
});

registerKind('dismantle', {
  canStart: needCheck,
  complete(state, a) {
    consumeItems(state, a.spec?.need);
    const f = state.furniture[a.furn];
    if (!f) return;
    if (state.phase !== 'pre') state.progress.taboo.brokeSomething = true;
    const rubble = !!f.data?.rubble;
    dismantle(state, a.furn);
    // the debris a home starts with in its basement: taking it apart clears the rubble, as Clear Rubble does
    if (rubble) emit('story', { id: 'rubbleCleared', floor: f.floor });
  },
});

registerKind('clearRubble', {
  complete(state, a) {
    const f = state.furniture[a.furn];
    if (!f) return;
    dismantle(state, a.furn);
    emit('story', { id: 'rubbleCleared', floor: f.floor });
  },
});

// Recycling breaks the piece down into its RemoveGet materials; "recover part of the materials" (1764)
// keeps the first one and about half of the rest. Storage furniture recycles the junk inside it instead.
registerKind('recycle', {
  complete(state, a) {
    const f = state.furniture[a.furn];
    if (!f) return;
    const inv = f.inv && state.inventories[f.inv];
    if (inv) {
      const junk = inv.items.filter((it) => [20105, 2911, 24118].includes(it.id));
      for (const it of junk) {
        inv.items.splice(inv.items.indexOf(it), 1);
        giveItems(state, [[pick(state, [20001, 20002, 20003, 20004]), 1]]);
      }
      return;
    }
    const whole = !a.spec.partial || hasItems(state, [[PLIERS, 1]]);
    const mats = (furn(f.cfg)?.rmGet || []).filter((id, i) => item(id) && (whole || i === 0 || rand(state) < 0.5));
    removeFurniture(state, f.uid);
    giveItems(state, mats.map((id) => [id, 1]));
    const c = state.progress.counters;
    c['furniture.recycle'] = (c['furniture.recycle'] || 0) + 1;
    const names = mats.map((id) => itemName(id)).join(pickLang({ en: ', ', zh: '、' }));
    emit('toast', { text: mats.length ? pickLang({ en: `Recycled: ${names}`, zh: `回收得到：${names}` }) : pickLang({ en: 'Nothing worth keeping.', zh: '没什么值得留下的。' }), kind: 'good' });
  },
});

registerKind('moveFurniture', {
  complete(state, a) {
    emit('openPanel', { panel: 'planning', moveFurn: a.furn });
  },
});

registerKind('unlockArea', {
  canStart: needCheck,
  complete(state, a) {
    consumeItems(state, a.spec.need);
    const area = a.spec.area;
    if (a.spec.repairs) {
      const need = state.home.repairsNeeded?.[area] ?? 2;
      state.home.repairs[area] = (state.home.repairs[area] || 0) + 1;
      if (state.home.repairs[area] < need) {
        emit('toast', { text: pickLang({ en: `Repair progress ${state.home.repairs[area]}/${need}`, zh: `修复进度 ${state.home.repairs[area]}/${need}` }) });
        return;
      }
    }
    unlockArea(state, area);
  },
});

export function unlockArea(state, area) {
  if (state.home.unlocked[area]) return;
  state.home.unlocked[area] = true;
  emit('areaUnlocked', { area });
  if (state.home.unlocked['2F'] && state.home.unlocked.B1) state.progress.counters['floors.both'] = 1;
}

registerKind('repairWorkbench', {
  canStart: needCheck,
  complete(state, a) {
    consumeItems(state, a.spec.need);
    const f = state.furniture[a.furn];
    if (f) f.broken = false;
    emit('workbenchRepaired', {});
  },
});

registerKind('studyWorkbench', {
  canStart(state) {
    const day = state.phase === 'pre' ? 0 : dayNumber(state.clock);
    return day >= 6 ? true : pickLang({ en: 'You need more time to figure it out (Day 6+).', zh: '还需要时间琢磨（第6天后）。' });
  },
  complete(state, a) {
    const f = state.furniture[a.furn];
    if (f) f.broken = false;
    emit('workbenchRepaired', { self: true });
  },
});

registerKind('record', {
  complete(state, a) {
    if (state.furniture[a.furn]) emit('recordOp', { state, furn: a.furn, op: a.spec.op, value: a.spec.value });
  },
});

registerKind('vase', {
  complete(state, a) {
    const f = state.furniture[a.furn];
    if (f) f.data.flower = null;
  },
});

registerKind('dismantlePackage', {
  complete(state, a) {
    emit('openPanel', { panel: 'storage', furn: a.furn });
  },
});

registerKind('clearObstacle', {
  complete(state, a) {
    const f = state.furniture[a.furn];
    if (f) removeFurniture(state, f.uid);
  },
});

// ----------------------------------------------------------------------------- loot containers
// A container's finds (FuncAction 1100/1101 "hand out a loot roll") are rolled once, the first time a loot function
// opens it: LootRandomCount rolls (2 when the config gives none) from the loot table of the site the piece stands at,
// else the function's own table (src/content/funcSpecs.js LOOT_SPECS). 'search' and a lock opened with its tool take
// everything, 'look' (查看) one find at a time. A piece with a lock function stays shut until the lock is opened.
const SITE_TABLE = (() => {
  const out = {};
  for (const site of SITES) for (const spec of [...Object.values(site.legend || {}), ...(site.extra || [])]) if (typeof spec?.cfg === 'number' && spec.loot && !out[spec.cfg]) out[spec.cfg] = spec.loot;
  return out;
})();

// 取出物资 (1101) sits on material piles, boxes and trash bags alike: the table follows the piece's name.
function tableByName(cfgId, fallback) {
  const zh = furn(cfgId)?.zh || '';
  if (/垃圾/.test(zh)) return 'trash';
  if (/纸箱|纸盒|木板箱|箱/.test(zh)) return 'stockroom';
  if (/材料|建材|砖|木/.test(zh)) return 'materials';
  return fallback;
}

export function lootTableOf(f, spec) {
  if (typeof f.cfg !== 'number') return spec.table;
  return SITE_TABLE[f.cfg] || (spec.byName ? tableByName(f.cfg, spec.table) : spec.table);
}

function rollTable(state, table) {
  const entries = (LOOT_TABLES[table] || []).filter(([pool]) => SITE_POOLS[pool]?.length && pool !== 'fresh');
  const pool = weighted(state, entries);
  return pool ? pick(state, SITE_POOLS[pool]) : undefined;
}

// The finds the piece still holds (rolled on first use).
export function containerFinds(state, f, spec) {
  if (!f.data.finds) {
    const n = furn(f.cfg)?.lootN || spec.rolls || 2;
    const table = lootTableOf(f, spec);
    f.data.finds = [];
    for (let i = 0; i < n; i++) {
      const id = rollTable(state, table);
      if (id && item(id)) f.data.finds.push(id);
    }
  }
  return f.data.finds;
}

const LOCK_MODES = new Set(['pry', 'pick']);
// Does the piece carry a lock function (so its other loot functions wait until the lock is opened)?
function lockable(f) {
  const def = typeof f.cfg === 'number' ? furn(f.cfg) : null;
  return !!def && (def.funcs || []).some((k) => LOCK_MODES.has(FUNC_SPECS[k]?.kind === 'loot' ? FUNC_SPECS[k].mode : ''));
}

registerKind('loot', {
  available(state, f, spec) {
    const locked = lockable(f) && !f.data.opened;
    if (LOCK_MODES.has(spec.mode)) return locked ? true : 'hide';
    if (locked) return 'hide';
    if (f.data.finds && !f.data.finds.length) return pickLang({ en: 'Nothing left', zh: '已经空了' });
    return true;
  },
  canStart(state, a) {
    if (a.spec.tool && !hasItems(state, [[a.spec.tool, 1]])) return pickLang({ en: `Needs ${loc(item(a.spec.tool)?.zh)}`, zh: `需要${loc(item(a.spec.tool)?.zh)}` });
    return true;
  },
  complete(state, a) {
    const f = state.furniture[a.furn];
    if (!f) return;
    const spec = a.spec;
    if (spec.tool && spec.consume) consumeItems(state, [[spec.tool, 1]]);
    if (LOCK_MODES.has(spec.mode)) f.data.opened = true;
    const finds = containerFinds(state, f, spec);
    const got = spec.mode === 'look' ? finds.splice(0, 1) : finds.splice(0, finds.length);
    giveItems(
      state,
      got.map((id) => [id, 1])
    );
    const names = got.map((id) => itemName(id)).join(pickLang({ en: ', ', zh: '、' }));
    emit('toast', { text: got.length ? `${furnLabel(f)}: ${names}` : pickLang({ en: `${furnLabel(f)}: nothing useful.`, zh: `${furnLabel(f)}：没找到有用的东西。` }), kind: got.length ? 'good' : undefined });
  },
});

// ----------------------------------------------------------------------------- stairs
// 上楼 / 下楼 (FuncType 7): the survivor takes the stairs to the floor above / below the piece.
const FLOOR_ORDER = ['B1', '1F', '2F'];
function stairsTarget(state, f, spec) {
  const i = FLOOR_ORDER.indexOf(f.floor);
  const to = FLOOR_ORDER[i + (spec.dir === 'up' ? 1 : -1)];
  return i < 0 || !to ? null : homeStairs(state, f.floor, to);
}

registerKind('stairs', {
  available(state, f, spec) {
    if (stairsTarget(state, f, spec)) return true;
    return spec.brokenTip ? pickLang({ en: 'The stairs are broken — no way up for now', zh: '楼梯已损坏，暂时无法上楼' }) : pickLang({ en: 'No way through', zh: '过不去' });
  },
  complete(state, a) {
    const f = state.furniture[a.furn];
    const hop = f && stairsTarget(state, f, a.spec);
    if (!hop) return;
    Object.assign(state.player, { floor: hop.toFloor, x: hop.to[0], y: hop.to[1] });
    emit('floorChanged', { floor: hop.toFloor });
  },
});
