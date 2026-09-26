// Ending resolution (P04–P15): the final wave, route success, the nine endings, challenge endings,
// the Safehouse Snapshot tally and the survival record score (patch 09-08).
import { registerSystem } from './tick.js';
import { cancelAll } from './actions.js';
import { dayNumber, hourOfDay } from './time.js';
import { homeFurniture, slotDef } from './home.js';
import { SLOT } from '../data/db.js';
import { ENDINGS, ROUTES, CHALLENGES, SHIELD_CHALLENGE, NEXT_CHARACTER, LAST_DAY, FINAL_WAVE_KILLS } from '../content/endings.js';
import { ensureStory, finalWaveDay, installedBeacon, neighborInfo, homeSatiety, queueEvent, startQuest, resolveEvent } from './story.js';
import { emit, on } from '../engine/bus.js';

export { finalWaveDay };

export const DAILY_NEED = 42; // satiety a survivor burns per day: 18 h awake at 2/h + 6 h asleep at 1/h
export const ZOMBIE_DAMAGE = 60; // average barrier damage one zombie deals before it drops
const ENDING_HOUR = 8; // Day 101 endings resolve in the morning

let active = null;

export function killCount(state) {
  return Math.max(state.progress.kills || 0, state.progress.counters['zombie.kill'] || 0);
}

// Called by the horde system when the final wave ends with the survivor alive (or via 'hordeEnded' {final}).
export function markFinalWaveSurvived(state, kills = null) {
  if (state.phase === 'dead') return false;
  const st = ensureStory(state);
  st.tags.TAG_FINAL_WAVE_SURVIVED = true;
  st.finalWaveKills = kills ?? Math.max(0, killCount(state) - (st.flags.killsAtFinalWave ?? killCount(state)));
  state.progress.counters['wave.final'] = 1;
  settleFinalWave(state);
  return true;
}

function settleFinalWave(state) {
  const st = state.story;
  if (st.finalWaveKills < FINAL_WAVE_KILLS) return;
  if (st.route === 'fortress') st.tags.TAG_LINE_SHELTER_HELD = true;
  if (st.route === 'supply' && st.tags.TAG_SUPPLY_SPECIAL_TRADE) st.tags.TAG_LINE_SUPPLY_HELD = true;
}

// The horde system may only set the tag; derive the wave's kill count from the snapshot taken that morning.
function syncFinalWave(state) {
  const st = state.story;
  if (st.tags.TAG_FINAL_WAVE_SURVIVED && st.finalWaveKills == null) {
    st.finalWaveKills = Math.max(0, killCount(state) - (st.flags.killsAtFinalWave ?? killCount(state)));
    settleFinalWave(state);
  }
}

export function routeSucceeded(state, route) {
  const tags = state.story.tags;
  switch (route) {
    case 'evacuate':
      return !!installedBeacon(state) && !!tags.TAG_LINE_RESCUE_READY;
    case 'girl':
      return !!tags.TAG_NEIGHBOR_RESCUE3_COMPLETE && !tags.TAG_NEIGHBOR_DEAD && !neighborInfo(state).dead;
    case 'stranger':
      return !!tags.TAG_LINE_STRANGER_CAMP_DONE;
    case 'fortress':
      return !!tags.TAG_LINE_SHELTER_HELD;
    case 'truth':
      return !!tags.TAG_LINE_TRUTH_EXPLORED;
    case 'greenhouse':
      return !!tags.TAG_LINE_GREENHOUSE_DONE;
    case 'companion':
      return !!tags.TAG_COMPANION_RESCUE3_COMPLETE && !tags.TAG_COMPANION_MAN_DEAD && !neighborInfo(state).dead;
    case 'supply':
      return !!tags.TAG_LINE_SUPPLY_HELD;
    default:
      return false;
  }
}

function failRoute(state, day) {
  const st = state.story;
  if (st.flags.routeFailed) return;
  st.flags.routeFailed = day;
  queueEvent(state, 's_promiseBroken');
  startQuest(state, 'holdOut');
}

// Which ending (if any) is due right now.
export function dueEnding(state) {
  if (state.phase !== 'post' || state.meta.mode !== 'story' || state.run.ending) return null;
  const st = ensureStory(state);
  const day = dayNumber(state.clock);
  const morning = hourOfDay(state.clock) >= ENDING_HOUR;
  const route = st.route;
  if (route && !st.flags.routeFailed && st.tags.TAG_FINAL_WAVE_SURVIVED) {
    const endingDay = ROUTES[route].endingDay;
    if (day >= endingDay && (endingDay < LAST_DAY || morning)) {
      if (routeSucceeded(state, route)) return route;
      failRoute(state, day);
    }
  }
  if (day >= LAST_DAY && morning) return 'lastOne';
  return null;
}

export function triggerEnding(state, id) {
  const def = ENDINGS[id];
  if (!def || state.run.ending) return false;
  const st = ensureStory(state);
  const day = dayNumber(state.clock);
  if (st.active) resolveEvent(state, null);
  st.pending = [];
  cancelAll(state);
  state.run.ending = id;
  state.run.endingDay = day;
  state.run.challenges = challengeResults(state)
    .filter((c) => c.held)
    .map((c) => c.id);
  state.run.record = { tally: safehouseTally(state), score: survivalScore(state).total };
  st.tags[`TAG_ENDING_${id.toUpperCase()}`] = true;
  state.phase = 'ending';
  emit('ending', { id, day });
  emit('endingReached', { id, character: state.meta.character, achievement: def.achievement, cfg: def.cfg, day, challenges: state.run.challenges });
  const next = NEXT_CHARACTER[state.meta.character];
  if (next) emit('unlockCharacter', { id: next });
  return true;
}

// "Refusing to Take a Bow": keep holding the house after the credits (Story Endless).
export function continueAfterEnding(state) {
  if (state.phase !== 'ending') return false;
  state.meta.mode = 'endless';
  state.phase = 'post';
  state.run.endlessStartDay = dayNumber(state.clock);
  state.story.tags.TAG_REFUSE_CURTAIN = true;
  emit('storyEndless', { ending: state.run.ending, day: state.run.endlessStartDay, state });
  return true;
}

// ------------------------------------------------------------------------------------ records
export function challengeResults(state) {
  const taboo = state.progress.taboo || {};
  const list = CHALLENGES.map((c) => ({ ...c, held: !taboo[c.flag] }));
  if (state.story?.tags?.[SHIELD_CHALLENGE.tag]) list.push({ ...SHIELD_CHALLENGE, held: true });
  return list;
}

export function hordeTier(zombies) {
  if (zombies < 20) return 'small';
  if (zombies < 60) return 'medium';
  if (zombies < 150) return 'large';
  return 'massive';
}

// Safehouse Snapshot tally: people the food stores can feed for a day and the horde the barriers can take.
export function safehouseTally(state) {
  const satiety = Math.round(homeSatiety(state));
  let openingHp = 0;
  let defenseHp = 0;
  let defenses = 0;
  for (const f of homeFurniture(state)) {
    const type = slotDef(state, f.slot)?.type;
    if (type === SLOT.DOOR || type === SLOT.WINDOW) openingHp += Math.max(0, f.hp || 0);
    else if (type === SLOT.DEFENSE) {
      defenseHp += Math.max(0, f.hp || 0);
      defenses += 1;
    }
  }
  const strength = Math.round(openingHp + defenseHp);
  const zombies = Math.round(strength / ZOMBIE_DAMAGE);
  return { satiety, people: Math.floor(satiety / DAILY_NEED), openingHp: Math.round(openingHp), defenseHp: Math.round(defenseHp), defenses, strength, zombies, tier: hordeTier(zombies) };
}

const GRADES = [
  [3000, 'S'],
  [2200, 'A'],
  [1500, 'B'],
  [900, 'C'],
  [0, 'D'],
];

export function survivalScore(state) {
  const c = state.progress.counters;
  const days = state.run.endingDay ?? (state.phase === 'pre' ? 0 : dayNumber(state.clock));
  const kills = killCount(state);
  const trades = c['trade.active.dealcount'] || 0;
  const prof = Object.values(state.progress.prof || {}).reduce((a, p) => a + (p?.lv || 0), 0);
  const challenges = challengeResults(state).filter((x) => x.held).length;
  const tally = safehouseTally(state);
  const rows = [
    { key: 'days', value: days, points: days * 10 },
    { key: 'kills', value: kills, points: kills * 2 },
    { key: 'trades', value: trades, points: trades * 5 },
    { key: 'proficiency', value: prof, points: prof * 25 },
    { key: 'challenges', value: challenges, points: challenges * 150 },
    { key: 'sustain', value: tally.people, points: Math.min(500, tally.people * 2) },
    { key: 'strength', value: tally.strength, points: Math.min(500, Math.round(tally.strength / 50)) },
  ];
  const total = rows.reduce((a, r) => a + r.points, 0);
  return { rows, total, grade: GRADES.find(([min]) => total >= min)[1] };
}

// ------------------------------------------------------------------------------------ system
registerSystem({
  id: 'endings',
  order: 90,
  tick(state) {
    active = state;
    if (state.phase !== 'post' || state.meta.mode !== 'story' || state.run.ending) return;
    ensureStory(state);
    syncFinalWave(state);
    const id = dueEnding(state);
    if (id) triggerEnding(state, id);
  },
  onDay(state, day) {
    if (state.phase !== 'post') return;
    const st = ensureStory(state);
    if (day === finalWaveDay(state) && st.flags.killsAtFinalWave == null) st.flags.killsAtFinalWave = killCount(state);
  },
});

const isFinal = (p) => !!(p && (p.final || p.isFinal || p.kind === 'final' || p.type === 'final'));

on('hordeStart', (p) => {
  const state = p?.state || active;
  if (state?.story && isFinal(p)) state.story.flags.killsAtFinalWave = killCount(state);
});

on('hordeEnded', (p) => {
  const state = p?.state || active;
  if (!state?.story || state.phase !== 'post' || !isFinal(p)) return;
  markFinalWaveSurvived(state, p.kills ?? p.killed ?? null);
});
