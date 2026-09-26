// The rebirth time loop. Dying or finishing a round sends the survivor back to the morning before the outbreak
// with the Survival Log: Planning Points, abilities, memories and rebirth notes that restore most proficiency
// (demo 07-10, patches 08-13 respawn page, 08-14 notes and NG+, 08-18 "I want to persist!", 08-22 "Tear Up This
// Round and Rewrite", 08-31 notes that do not fit drop at your feet). Guide G1: "Die or finish. Notes / memories
// come back. Next loop starts richer."
import { registerSystem } from './tick.js';
import { bumpMods } from './modifiers.js';
import { dayNumber } from './time.js';
import { makeInstance, insert } from './inventory.js';
import { dropToFloor } from './home.js';
import { PROF } from './proficiency.js';
import { addPoints } from './settlement.js';
import { ABILITY_BY_ID } from '../content/abilities.js';
import { BOOKS } from '../content/itemEffects.js';
import { CHARACTERS } from '../content/characters.js';
import * as endingContent from '../content/endings.js';
import { item } from '../data/db.js';
import { serialize } from '../engine/save.js';

// Rebirth notes per proficiency: organised notes (big) and scattered memos (small), exp from BOOKS.
export const NOTE_ITEMS = {
  craft: { big: 3040, small: 3027 },
  plant: { big: 3041, small: 3028 },
  cook: { big: 3042, small: 3029 },
  trap: { big: 3043, small: 3030 },
  explore: { big: 3044, small: 3031 },
  defense: { big: 3033, small: 3032 },
};
// A system taken to its top level comes back as the Complete Manuscript of it (3034–3039, "上一轮的自己整理成册的
// 全部心得": all of last round's insights, bound by your former self), the rest of its share as notes: patch 08-14
// brought notes back, a later patch cut "the quantity and weight" of the notes so they fit in the backpack.
export const MANUSCRIPTS = { craft: 3034, plant: 3035, cook: 3036, trap: 3037, explore: 3038, defense: 3039 };
export const NOTE_SHARE = 0.7;
export const MAX_NOTES_PER_SYSTEM = 10;

// "I want to persist!": back to the start of today (1), yesterday (2) or the day before (3).
export const REWIND = { maxBack: 3, base: 20, perDay: 0.5 };

// Abilities that only change how a round starts.
export const START_ONLY_ABILITIES = new Set(['savings', 'earlyBird']);

export const DEATH_CAUSES = {
  life: { en: 'Life ran out', zh: '生命耗尽' },
  starvation: { en: 'Starved to death', zh: '饿死' },
  zombies: { en: 'Zombies broke in', zh: '丧尸破门而入' },
  horde: { en: 'Overrun by the horde', zh: '被尸潮吞没' },
  explore: { en: 'Fell while exploring', zh: '死于外出探索' },
  bleeding: { en: 'Bled out', zh: '失血过多' },
  illness: { en: 'Succumbed to illness', zh: '病重不治' },
  poisoning: { en: 'Food poisoning', zh: '食物中毒' },
  cold: { en: 'Froze to death', zh: '冻死' },
  thug: { en: 'Killed by thugs', zh: '死于暴徒之手' },
  raider: { en: 'Killed by raiders', zh: '死于劫匪之手' },
};

// Life lost to an attacker within the last game hour names the killer.
const HURT_CAUSES = { zombie: 'zombies', zombies: 'zombies', thugs: 'thug', raider: 'raider' };

export function causeLabel(cause) {
  return DEATH_CAUSES[cause] || { en: String(cause || 'Unknown'), zh: String(cause || '未知') };
}

// The generic 'life' cause is narrowed down from the survivor's condition at the moment of death.
export function deathCause(state) {
  const cause = state.run.deathCause || 'life';
  const hurt = state.run.lastHurt;
  const recent = hurt && state.clock.t - hurt.t <= 3600 ? HURT_CAUSES[hurt.source] : null;
  if (cause === 'exploration') return recent === 'raider' ? 'raider' : 'explore';
  if (cause !== 'life') return cause;
  if (recent) return recent;
  const p = state.player;
  const fx = Object.keys(p.effects || {});
  if (p.stats.sat <= 0) return 'starvation';
  if (fx.includes('bleeding') || fx.includes('shock')) return 'bleeding';
  if (fx.includes('1104') || fx.includes('1105')) return 'poisoning';
  if (fx.includes('fever')) return 'illness';
  if (fx.includes('cold')) return 'cold';
  return 'life';
}

export function endingLabel(id) {
  const table = endingContent.ENDINGS || {};
  const def = Array.isArray(table) ? table.find((e) => e.id === id) : table[id];
  return def?.name || { en: String(id), zh: String(id) };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ------------------------------------------------------------------------------ rebirth notes

function cumulativeExp(key, lv, exp = 0) {
  const need = PROF[key]?.need || [];
  let sum = exp;
  for (let i = 0; i < lv; i++) sum += need[i] || 0;
  return sum;
}

function noteExp(id, key) {
  return BOOKS[id]?.prof?.[key] || 0;
}

// ~70% of the proficiency exp earned beyond the character's starting level, as note items.
export function rebirthNotes(state) {
  const start = CHARACTERS[state.meta.character]?.startProf || {};
  const notes = [];
  for (const [key, ids] of Object.entries(NOTE_ITEMS)) {
    const p = state.progress.prof[key];
    if (!p) continue;
    const earned = cumulativeExp(key, p.lv, p.exp) - cumulativeExp(key, start[key] || 0);
    let target = earned * NOTE_SHARE;
    const bigExp = noteExp(ids.big, key);
    const smallExp = noteExp(ids.small, key);
    if (target <= 0 || !bigExp || !smallExp) continue;
    let room = MAX_NOTES_PER_SYSTEM;
    const ms = MANUSCRIPTS[key];
    if (ms && p.lv >= (PROF[key]?.max ?? Infinity) && noteExp(ms, key)) {
      notes.push({ prof: key, id: ms, n: 1, exp: noteExp(ms, key) });
      target -= noteExp(ms, key);
      room -= 1;
      if (target <= 0) continue;
    }
    let big = Math.floor(target / bigExp);
    let small = Math.round((target - big * bigExp) / smallExp);
    if (small * smallExp >= bigExp) {
      big += 1;
      small = 0;
    }
    big = Math.min(big, room);
    small = Math.min(small, room - big);
    if (big) notes.push({ prof: key, id: ids.big, n: big, exp: big * bigExp });
    if (small) notes.push({ prof: key, id: ids.small, n: small, exp: small * smallExp });
  }
  return notes;
}

function placeNotes(state, notes) {
  const bp = state.inventories[state.player.backpack];
  const out = { packed: 0, dropped: 0 };
  for (const note of notes) {
    if (!item(note.id)) continue;
    for (let i = 0; i < (note.n || 1); i++) {
      const inst = makeInstance(state, note.id);
      if (bp && insert(bp, inst)) {
        out.packed++;
      } else {
        dropToFloor(state, inst, state.player.floor, state.player.x, state.player.y);
        out.dropped++;
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------------------ loop data

function ensureLoop(loop) {
  loop.abilities ||= {};
  loop.abilitiesThisRound ||= {};
  loop.pointsSpentThisRound ||= 0;
  loop.memories ||= [];
  loop.notes ||= [];
  loop.history ||= [];
  loop.rebirths ||= 0;
  loop.usedRebirth ??= false;
  return loop;
}

function memoryKey(m) {
  return typeof m === 'string' ? m : m.id || JSON.stringify(m.text);
}

function mergeMemories(list, add) {
  const seen = new Set(list.map(memoryKey));
  return [...list, ...add.filter((m) => !seen.has(memoryKey(m)))];
}

function deathMemory(state, cycle, id = `death:${cycle}`) {
  const day = state.run.deathDay ?? state.run.day ?? 1;
  const cause = deathCause(state);
  const why = causeLabel(cause);
  return {
    id,
    kind: 'death',
    cycle,
    day,
    cause,
    text: { en: `Loop ${cycle}: I fell on Day ${day}. ${why.en}.`, zh: `第${cycle}轮：我倒在了第${day}天。${why.zh}。` },
  };
}

function autoMemories(state) {
  const cycle = state.loop.cycle || 1;
  const out = [];
  if (state.phase === 'dead') out.push(deathMemory(state, cycle));
  if (state.run.ending) {
    const name = endingLabel(state.run.ending);
    const day = state.run.day ?? 1;
    out.push({
      id: `ending:${cycle}`,
      kind: 'ending',
      cycle,
      day,
      ending: state.run.ending,
      text: { en: `Loop ${cycle}: reached the ending "${name.en}" on Day ${day}.`, zh: `第${cycle}轮：第${day}天达成结局「${name.zh}」。` },
    });
  }
  return out;
}

function roundRecord(state, extra = {}) {
  const run = state.run;
  const dead = state.phase === 'dead';
  return {
    cycle: state.loop.cycle || 1,
    character: state.meta.character,
    day: (dead ? run.deathDay : null) ?? run.day ?? 0,
    cause: dead ? deathCause(state) : null,
    ending: run.ending || null,
    points: Math.round(run.pointsEarned || 0),
    mode: state.meta.mode,
    difficulty: state.meta.difficultyId,
    ...extra,
  };
}

// Loop data for the next round (pure: `state` is not modified). The balance already holds this round's
// earnings, which were credited day by day.
export function prepareNextLoop(state) {
  const loop = ensureLoop(structuredClone(state.loop));
  const record = roundRecord(state);
  loop.history.push(record);
  loop.memories = mergeMemories(loop.memories, autoMemories(state));
  loop.notes = rebirthNotes(state);
  loop.cycle = (loop.cycle || 1) + 1;
  loop.bestDay = Math.max(loop.bestDay || 0, record.day || 0);
  loop.rebirths += 1;
  loop.usedRebirth = true;
  loop.ngPlus = loop.ngPlus || !!state.run.ending || loop.cycle >= 2;
  const affinity = state.social?.neighbor?.affinity;
  if (typeof affinity === 'number') loop.neighborAffinity = round2(affinity * 0.5);
  loop.abilitiesThisRound = {};
  loop.pointsSpentThisRound = 0;
  return loop;
}

// When a round starts: rebirth notes go into the backpack (overflow drops at the survivor's feet), the
// save-wide rebirth taboo carries over, and the round's starting position is remembered for a tear-up.
export function applyLoopStart(state) {
  const loop = ensureLoop(state.loop);
  if (loop.usedRebirth) state.progress.taboo.rebirth = true;
  state.run.roundStart = { points: loop.planningPoints + loop.pointsSpentThisRound, bestDay: loop.bestDay || 0 };
  const placed = placeNotes(state, loop.notes);
  state.run.notesPlaced = placed;
  return placed;
}

// ------------------------------------------------------------------------------ abilities

export function abilityCost(loop, id) {
  const def = ABILITY_BY_ID[id];
  const lv = loop.abilities?.[id] || 0;
  return def && lv < def.maxLv ? def.cost[lv] : null;
}

export function canAffordAnyAbility(loop) {
  return Object.keys(ABILITY_BY_ID).some((id) => {
    const cost = abilityCost(loop, id);
    return cost != null && cost <= loop.planningPoints;
  });
}

// Works on a live run or on loop data alone ({ loop }) for the rebirth page before a round starts.
export function buyAbility(state, id) {
  const def = ABILITY_BY_ID[id];
  if (!def) return { ok: false, reason: 'unknown' };
  const loop = ensureLoop(state.loop);
  const lv = loop.abilities[id] || 0;
  if (lv >= def.maxLv) return { ok: false, reason: 'max' };
  const cost = def.cost[lv];
  if (loop.planningPoints < cost) return { ok: false, reason: 'points', cost };
  if (state.run) addPoints(state, -cost, 'ability', { note: id });
  else loop.planningPoints -= cost;
  loop.abilities[id] = lv + 1;
  loop.abilitiesThisRound[id] = (loop.abilitiesThisRound[id] || 0) + 1;
  loop.pointsSpentThisRound += cost;
  const bp = state.inventories?.[state.player?.backpack];
  if (bp && def.per.carryKg && bp.maxKg != null) bp.maxKg += def.per.carryKg;
  bumpMods(state);
  return { ok: true, cost, lv: lv + 1 };
}

// Removes every ability level learned this round and returns the points spent on them.
export function refundRoundAbilities(state) {
  const loop = ensureLoop(state.loop);
  const bp = state.inventories?.[state.player?.backpack];
  let paid = 0;
  for (const [id, n] of Object.entries(loop.abilitiesThisRound)) {
    const def = ABILITY_BY_ID[id];
    const lv = loop.abilities[id] || 0;
    const keep = Math.max(0, lv - n);
    for (let l = keep; l < lv; l++) paid += def?.cost[l] ?? 0;
    if (bp && def?.per.carryKg && bp.maxKg != null) bp.maxKg -= def.per.carryKg * (lv - keep);
    if (keep > 0) loop.abilities[id] = keep;
    else delete loop.abilities[id];
  }
  const refund = loop.pointsSpentThisRound || paid;
  loop.planningPoints += refund;
  loop.abilitiesThisRound = {};
  loop.pointsSpentThisRound = 0;
  bumpMods(state);
  return refund;
}

// "Tear Up This Round and Rewrite": the same loop from the morning before the outbreak. Abilities learned this
// round are refunded; the rest of the round is torn out with it (the balance and best day go back to how the
// round began), and it does not count as a rebirth.
export function prepareTearUp(state) {
  const loop = ensureLoop(structuredClone(state.loop));
  const refunded = refundRoundAbilities({ loop });
  const start = state.run.roundStart;
  if (start) {
    loop.planningPoints = start.points;
    loop.bestDay = start.bestDay;
  }
  loop.history.push(roundRecord(state, { torn: true }));
  return { loop, refunded };
}

// ------------------------------------------------------------------------------ daily snapshots

const SNAP_KEEP = 4;
const SNAP_PERSIST = 2;
// Larger states stay in memory only, so snapshots never crowd the save slot and its backup out of the quota.
const SNAP_MAX_CHARS = 600_000;
const SNAP_PREFIX = 'survivalLog.snap.';
const snapshots = new Map(); // run id -> [{ day, t, points, json }], oldest first

function storage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function loadPersisted(runId) {
  try {
    const raw = storage()?.getItem(SNAP_PREFIX + runId);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persist(runId, list) {
  const store = storage();
  if (!store) return;
  const recent = list.slice(-SNAP_PERSIST).filter((s) => s.json.length <= SNAP_MAX_CHARS);
  for (const keep of [recent, recent.slice(-1)]) {
    try {
      if (keep.length) store.setItem(SNAP_PREFIX + runId, JSON.stringify(keep));
      else store.removeItem(SNAP_PREFIX + runId);
      return;
    } catch {
      // quota: retry with the latest snapshot only, then give up
    }
  }
  try {
    store.removeItem(SNAP_PREFIX + runId);
  } catch {}
}

export function listSnapshots(state) {
  const id = state.meta.id;
  if (!snapshots.has(id)) snapshots.set(id, loadPersisted(id));
  return snapshots.get(id);
}

// Stored at the start of each post-disaster day, after every other system handled the new day.
export function takeSnapshot(state) {
  const day = state.run.day ?? dayNumber(state.clock);
  const list = listSnapshots(state).filter((s) => s.day < day);
  list.push({ day, t: state.clock.t, points: state.loop.planningPoints, json: serialize(state) });
  while (list.length > SNAP_KEEP) list.shift();
  snapshots.set(state.meta.id, list);
  persist(state.meta.id, list);
  return list[list.length - 1];
}

export function clearSnapshots(runId) {
  snapshots.delete(runId);
  try {
    storage()?.removeItem(SNAP_PREFIX + runId);
  } catch {}
}

export function rewindCost(day, back) {
  return Math.round(back * (REWIND.base + REWIND.perDay * day));
}

// Rewind targets for "I want to persist!", newest first. The cost is paid from the balance the survivor had on
// that morning, so days re-lived earn their points again.
export function rewindOptions(state) {
  const day = state.run.deathDay ?? state.run.day ?? dayNumber(state.clock);
  return listSnapshots(state)
    .filter((s) => s.day <= day && day - s.day < REWIND.maxBack)
    .map((s) => {
      const back = day - s.day + 1;
      const cost = rewindCost(day, back);
      return { day: s.day, back, cost, balance: s.points, affordable: s.points >= cost };
    })
    .sort((a, b) => b.day - a.day);
}

// Returns the restored state (the caller adopts it) or null when the target is missing or unaffordable.
export function rewindTo(state, day) {
  const opt = rewindOptions(state).find((o) => o.day === day);
  if (!opt?.affordable) return null;
  const list = listSnapshots(state);
  const snap = list.find((s) => s.day === day);
  const next = JSON.parse(snap.json);
  const loop = ensureLoop(next.loop);
  const memory = state.phase === 'dead' ? deathMemory(state, loop.cycle || 1, `death:${loop.cycle || 1}:${state.run.deathDay}:${day}`) : null;
  if (memory) {
    memory.text = {
      en: `${memory.text.en} I went back to the morning of Day ${day}.`,
      zh: `${memory.text.zh}我回到了第${day}天的清晨。`,
    };
    loop.memories = mergeMemories(loop.memories, [memory]);
  }
  addPoints(next, -opt.cost, 'rewind', { day, note: opt.back });
  loop.rebirths += 1;
  loop.usedRebirth = true;
  next.progress.taboo.rebirth = true;
  next.ui = { ...(next.ui || {}), modalPause: false };
  const kept = list.filter((s) => s.day <= day);
  snapshots.set(state.meta.id, kept);
  persist(state.meta.id, kept);
  return next;
}

registerSystem({
  id: 'rebirth',
  order: 99,
  init(state) {
    applyLoopStart(state);
    if (state.phase === 'post') takeSnapshot(state);
  },
  ensure(state) {
    ensureLoop(state.loop);
    if (state.loop.usedRebirth) state.progress.taboo.rebirth = true;
    state.run.roundStart ??= { points: state.loop.planningPoints + state.loop.pointsSpentThisRound, bestDay: state.loop.bestDay || 0 };
  },
  onOutbreak(state) {
    takeSnapshot(state);
  },
  onDay(state) {
    takeSnapshot(state);
  },
});
