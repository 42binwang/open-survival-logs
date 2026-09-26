// Survivor profile (S04, S05, A07): runs, deaths, endings per character, badges and titles derived from
// achievements, the five profile dimensions (incl. "Defense Line", patch 09-04), longest survival per character.
// Also the DOM-free leisure sims behind the TV mini-games and the record player panels (F11, T01).
import { furn } from '../data/db.js';
import { pickLang } from '../engine/i18n.js';
import { emit, on } from '../engine/bus.js';
import { registerSystem } from '../sim/tick.js';
import { addStat, raiseMax, dailyCount, bumpDaily } from '../sim/stats.js';
import { countIn, takeFrom } from '../sim/inventory.js';
import { homeSources } from '../sim/furnActions.js';
import { homeFurniture } from '../sim/home.js';
import { CHARACTER_ORDER } from '../content/characters.js';
import { game, persistHistory } from '../game.js';
import { ACHIEVEMENTS, ENDINGS, canonicalEnding, unlockedCount, lifetimeCounter } from './achievements.js';
import { codexCompletion } from './codex.js';
import { daysSurvived, endlessStateOf } from './endless.js';

// ------------------------------------------------------------------------------------------ badges & titles
export const BADGES = [
  { id: 'survival', icon: '📅', cats: [1], name: { en: 'Survivor', zh: '幸存者' } },
  { id: 'endings', icon: '🎬', cats: [2], name: { en: 'Storyteller', zh: '讲述者' } },
  { id: 'home', icon: '🏠', cats: [3], name: { en: 'Homemaker', zh: '持家能手' } },
  { id: 'prep', icon: '🛒', cats: [4], name: { en: 'Prepper', zh: '囤货达人' } },
  { id: 'production', icon: '🛠', cats: [5], name: { en: 'Artisan', zh: '巧手匠人' } },
  { id: 'defense', icon: '🛡', cats: [6], name: { en: 'Defense Line', zh: '防线' } },
  { id: 'explore', icon: '🧭', cats: [7], name: { en: 'Scavenger', zh: '拾荒者' } },
  { id: 'endless', icon: '♾', cats: [8], name: { en: 'Endless', zh: '无尽' } },
  { id: 'challenge', icon: '🏆', cats: [9], name: { en: 'Challenger', zh: '挑战者' } },
  { id: 'secrets', icon: '❔', cats: [10], name: { en: 'Curiosity', zh: '好奇心' } },
];

export const BADGE_TIERS = [
  { id: 'bronze', color: '#b07a4a', name: { en: 'Bronze', zh: '铜' } },
  { id: 'silver', color: '#c0c6cc', name: { en: 'Silver', zh: '银' } },
  { id: 'gold', color: '#e0b84a', name: { en: 'Gold', zh: '金' } },
];

export const TITLES = [
  { id: 'newcomer', min: 0, name: { en: 'Newcomer', zh: '新来的人' } },
  { id: 'survivor', min: 5, name: { en: 'Survivor', zh: '幸存者' } },
  { id: 'hoarder', min: 15, name: { en: 'Seasoned Hoarder', zh: '老练囤货人' } },
  { id: 'veteran', min: 30, name: { en: 'Veteran of the Loop', zh: '轮回老兵' } },
  { id: 'expert', min: 50, name: { en: 'Wasteland Expert', zh: '废土专家' } },
  { id: 'legend', min: 75, name: { en: 'Legend of the Ruins', zh: '废墟传说' } },
  { id: 'lastOne', min: 93, name: { en: 'The Last One Standing', zh: '最后的幸存者' } },
  { id: 'threeLives', ach: 1113, name: { en: 'Three Lives Lived', zh: '活过三段人生' } },
  { id: 'allRoads', ach: 1114, name: { en: 'Walker of All Roads', zh: '走过所有的路' } },
  { id: 'fortress', ach: 2205, name: { en: 'Iron Wall', zh: '铜墙铁壁' } },
  { id: 'corpses', ach: 2405, name: { en: 'Mountain of Corpses', zh: '尸山' } },
  { id: 'holdout', ach: 2403, name: { en: 'Endless Holdout', zh: '无尽坚守者' } },
  { id: 'collector', ach: 9004, name: { en: 'Collector', zh: '收藏家' } },
  { id: 'oneShot', ach: 3001, name: { en: 'One Shot', zh: '一次就好' } },
];

export const DIMENSIONS = [
  { id: 'survival', icon: '📅', cats: [1, 2, 9], name: { en: 'Survival', zh: '生存' } },
  { id: 'home', icon: '🏠', cats: [3, 4], name: { en: 'Home', zh: '家园' } },
  { id: 'production', icon: '🛠', cats: [5, 10], name: { en: 'Production', zh: '生产' } },
  { id: 'defenseLine', icon: '🛡', cats: [6, 8], name: { en: 'Defense Line', zh: '防线' } },
  { id: 'exploration', icon: '🧭', cats: [7], name: { en: 'Exploration', zh: '探索' } },
];

function catCounts(history, cats) {
  const list = ACHIEVEMENTS.filter((a) => cats.includes(a.cat));
  const have = list.filter((a) => history?.achievements?.[a.id]).length;
  return { have, total: list.length };
}

export function badgeTier(history, badge) {
  const { have, total } = catCounts(history, badge.cats);
  if (!have) return null;
  if (have >= total) return 'gold';
  if (have * 2 >= total) return 'silver';
  return 'bronze';
}

export function badgeDesc(history, badge) {
  const { have, total } = catCounts(history, badge.cats);
  const half = Math.ceil(total / 2);
  return pickLang({
    en: `${have}/${total} achievements. Bronze: 1 · Silver: ${half} · Gold: ${total}`,
    zh: `${have}/${total} 个成就。铜：1 · 银：${half} · 金：${total}`,
  });
}

export function deriveBadges(history) {
  const out = [];
  for (const b of BADGES) {
    const tier = badgeTier(history, b);
    if (tier) out.push(`${b.id}:${tier}`);
  }
  return out;
}

export function deriveTitles(history) {
  const n = unlockedCount(history);
  return TITLES.filter((t) => (t.ach ? !!history?.achievements?.[t.ach] : n >= t.min)).map((t) => t.id);
}

export function currentTitle(history) {
  const n = unlockedCount(history);
  const ranked = TITLES.filter((t) => t.min != null && n >= t.min);
  return ranked[ranked.length - 1] || TITLES[0];
}

// Keep history.profile.badges / titles in sync with the achievements. Returns true if they changed.
export function refreshProfileAwards(history) {
  const p = (history.profile = history.profile || { badges: [], titles: [], runs: 0, deaths: 0 });
  const badges = deriveBadges(history);
  const titles = deriveTitles(history);
  const changed = badges.join() !== (p.badges || []).join() || titles.join() !== (p.titles || []).join();
  p.badges = badges;
  p.titles = titles;
  return changed;
}

// ------------------------------------------------------------------------------------------ records
const clamp01 = (x) => Math.max(0, Math.min(1, x || 0));

export function dimensionScores(history) {
  const life = (k) => lifetimeCounter(null, history, k);
  const best = Math.max(0, ...Object.values(history?.profile?.bestDays || {}), ...Object.values(history?.endless?.best || {}));
  const codex = codexCompletion(history);
  const stat = {
    survival: clamp01(best / 100),
    home: clamp01(codex.furniture.have / 60),
    production: clamp01((life('cook.count') + life('craft.total') + life('plant.harvest')) / 300),
    defenseLine: clamp01(life('zombie.kill') / 1000 + life('horde.survived') / 60),
    exploration: clamp01(life('explore.total') / 30 + life('trade.active.dealcount') / 60),
  };
  const out = {};
  for (const d of DIMENSIONS) {
    const { have, total } = catCounts(history, d.cats);
    out[d.id] = Math.round((total ? (have / total) * 70 : 0) + stat[d.id] * 30);
  }
  return out;
}

export function longestSurvival(history) {
  const out = {};
  for (const ch of CHARACTER_ORDER) {
    out[ch] = {
      any: history?.profile?.bestDays?.[ch] || 0,
      endless: history?.endless?.best?.[ch] || 0,
      pure: history?.endless?.bestPure?.[ch] || 0,
    };
  }
  return out;
}

export function endingsTable(history) {
  return ENDINGS.map((e) => ({
    ...e,
    seen: !!history?.endings?.[e.key],
    byChar: Object.fromEntries(CHARACTER_ORDER.map((ch) => [ch, !!history?.endingsByChar?.[ch]?.[e.key]])),
  }));
}

export const PROFILE_STATS = [
  ['zombie.kill', { en: 'Zombies killed', zh: '击杀丧尸' }],
  ['horde.survived', { en: 'Hordes survived', zh: '挺过尸潮' }],
  ['wave.survived', { en: 'Endless hordes survived', zh: '无尽模式挺过尸潮' }],
  ['crisis.survived', { en: 'Crises survived', zh: '度过危机' }],
  ['cook.count', { en: 'Dishes cooked', zh: '烹饪菜肴' }],
  ['cook.perfect', { en: 'Perfect dishes', zh: '完美料理' }],
  ['plant.harvest', { en: 'Harvests', zh: '收获次数' }],
  ['craft.total', { en: 'Items crafted', zh: '制造物品' }],
  ['trap.catch', { en: 'Prey caught', zh: '捕获猎物' }],
  ['explore.total', { en: 'Explorations', zh: '探索次数' }],
  ['trade.active.dealcount', { en: 'Trades', zh: '交易次数' }],
  ['drone.foraging.count', { en: 'Drone scavenges', zh: '无人机拾荒' }],
  ['survivor.aid', { en: 'Aid count', zh: '援助次数' }],
  ['group.reply', { en: 'Group chat stances', zh: '群聊表态' }],
];

export function profileSummary(history, state = null) {
  const p = history?.profile || {};
  const unlocked = unlockedCount(history);
  return {
    runs: p.runs || 0,
    deaths: p.deaths || 0,
    unlocked,
    total: ACHIEVEMENTS.length,
    title: currentTitle(history),
    titles: deriveTitles(history),
    badges: BADGES.map((b) => ({ ...b, tier: badgeTier(history, b) })),
    dimensions: dimensionScores(history),
    longest: longestSurvival(history),
    endings: endingsTable(history),
    endingCount: ENDINGS.filter((e) => history?.endings?.[e.key]).length,
    maxThreat: history?.endless?.maxThreat || 0,
    tvBest: { ...(history?.tvBest || {}) },
    stats: PROFILE_STATS.map(([key, label]) => ({ key, label, value: lifetimeCounter(state, history, key) })),
    codex: codexCompletion(history),
    records: (history?.records || []).slice(-12).reverse(),
  };
}

export function recordBestDays(history, state) {
  if (!state?.meta) return false;
  const p = (history.profile = history.profile || { badges: [], titles: [], runs: 0, deaths: 0 });
  p.bestDays = p.bestDays || {};
  const ch = state.meta.character;
  const days = daysSurvived(state);
  if (days <= (p.bestDays[ch] || 0)) return false;
  p.bestDays[ch] = days;
  return true;
}

export function pushRecord(history, state, entry) {
  history.records = Array.isArray(history.records) ? history.records : [];
  history.records.push({
    at: Date.now(),
    character: state?.meta?.character || null,
    mode: state?.meta?.mode || 'story',
    day: daysSurvived(state),
    cycle: state?.loop?.cycle || 1,
    ...entry,
  });
  if (history.records.length > 60) history.records.splice(0, history.records.length - 60);
}

export function recordDeath(history, state, cause) {
  const p = (history.profile = history.profile || { badges: [], titles: [], runs: 0, deaths: 0 });
  p.deaths = (p.deaths || 0) + 1;
  recordBestDays(history, state);
  pushRecord(history, state, { kind: 'death', cause: cause || state?.run?.deathCause || 'life', endless: endlessStateOf(state) });
}

// ------------------------------------------------------------------------------------------ record player
export const RECORD_IDS = [11014, 11015, 11016, 11017, 11018, 11019, 11020, 11021, 11022];
export const RECORD_PLAYER_CFG = 70002;
const TRACK_MIN = [34, 42, 38, 46, 30, 36, 40, 44, 52]; // one side, in game minutes
export const RECORD_MORALE_PER_HOUR = 2;

export function trackLengthSec(id) {
  const i = RECORD_IDS.indexOf(id);
  return (TRACK_MIN[i] || 40) * 60;
}

// worked out once per config id: the record players are looked for every sub-step
/** @type {Map<number, boolean>} */
const recordPlayerCfg = new Map();

export function isRecordPlayer(f) {
  if (!f || typeof f.cfg !== 'number') return false;
  let yes = recordPlayerCfg.get(f.cfg);
  if (yes === undefined) {
    yes = f.cfg === RECORD_PLAYER_CFG || (furn(f.cfg)?.funcs || []).includes(80012);
    recordPlayerCfg.set(f.cfg, yes);
  }
  return yes;
}

export function recordPlayers(state) {
  return state?.home ? homeFurniture(state).filter(isRecordPlayer) : [];
}

export function recordData(f) {
  const d = (f.data = f.data || {});
  if (!Array.isArray(d.tracks)) d.tracks = [];
  if (d.track == null) d.track = 0;
  return d;
}

export function unlockedTracks(f) {
  const d = recordData(f);
  return RECORD_IDS.filter((id) => d.tracks.includes(id));
}

export function ownedRecords(state) {
  if (!state?.home) return [];
  const src = homeSources(state);
  return RECORD_IDS.filter((id) => countIn(state, src, id) > 0);
}

export function currentTrack(f) {
  return RECORD_IDS[recordData(f).track] ?? null;
}

function nextUnlockedIndex(f, from) {
  const d = recordData(f);
  for (let step = 1; step <= RECORD_IDS.length; step++) {
    const i = (from + step) % RECORD_IDS.length;
    if (d.tracks.includes(RECORD_IDS[i])) return i;
  }
  return -1;
}

function changed(f, op) {
  emit('record', { furn: f.uid, data: f.data, op });
}

// "Place record": the disc goes into the player and its track stays unlocked for good.
export function placeRecord(state, uid, id) {
  const f = state.furniture[uid];
  if (!isRecordPlayer(f) || !RECORD_IDS.includes(id)) return false;
  const d = recordData(f);
  if (d.tracks.includes(id)) return false;
  if (takeFrom(state, homeSources(state), id, 1) < 1) return false;
  d.tracks.push(id);
  d.tracks.sort((a, b) => RECORD_IDS.indexOf(a) - RECORD_IDS.indexOf(b));
  changed(f, 'place');
  return true;
}

export function playTrack(state, uid, id = null) {
  const f = state.furniture[uid];
  if (!isRecordPlayer(f)) return false;
  const d = recordData(f);
  let idx = id != null ? RECORD_IDS.indexOf(id) : d.track;
  if (idx < 0 || !d.tracks.includes(RECORD_IDS[idx])) idx = nextUnlockedIndex(f, idx < 0 ? -1 : idx);
  if (idx < 0) return false;
  if (f.powered === false) return false;
  d.track = idx;
  d.pos = 0;
  d.playing = true;
  changed(f, 'play');
  return true;
}

export function stopTrack(state, uid) {
  const f = state.furniture[uid];
  if (!isRecordPlayer(f)) return false;
  recordData(f).playing = false;
  changed(f, 'stop');
  return true;
}

// Record player furniture functions (Next / Stop / Auto-Change / Single Loop) arrive through the bus.
on('recordOp', ({ state, furn, op, value }) => {
  if (!state) return;
  if (op === 'next') nextTrack(state, furn);
  else if (op === 'stop') stopTrack(state, furn);
  else if (op === 'auto' || op === 'loop') setPlayMode(state, furn, value ? op : null);
});

export function nextTrack(state, uid) {
  const f = state.furniture[uid];
  if (!isRecordPlayer(f)) return false;
  const d = recordData(f);
  const idx = nextUnlockedIndex(f, d.track);
  if (idx < 0) return false;
  d.track = idx;
  d.pos = 0;
  changed(f, 'next');
  return true;
}

// 'auto' (Auto-Change, 08-28), 'loop' (Single Loop, 09-04) or null; the two modes are exclusive.
export function setPlayMode(state, uid, mode) {
  const f = state.furniture[uid];
  if (!isRecordPlayer(f)) return false;
  const d = recordData(f);
  d.auto = mode === 'auto';
  d.loop = mode === 'loop';
  changed(f, 'mode');
  return true;
}

export function tickRecordPlayers(state, dt) {
  if (!state?.home) return;
  // a stopped player has nothing to do: look at the playing flag before the kind of piece (every sub-step)
  for (const f of homeFurniture(state)) {
    const d = f.data;
    if (!d?.playing || !isRecordPlayer(f)) continue;
    if (f.powered === false) {
      d.playing = false;
      changed(f, 'power');
      continue;
    }
    recordData(f);
    if (!d.tracks.includes(RECORD_IDS[d.track])) {
      const idx = nextUnlockedIndex(f, d.track);
      if (idx < 0) {
        d.playing = false;
        changed(f, 'stop');
        continue;
      }
      d.track = idx;
      d.pos = 0;
    }
    d.pos = (d.pos || 0) + dt;
    if (d.pos < trackLengthSec(RECORD_IDS[d.track])) continue;
    d.pos = 0;
    if (d.loop) {
      changed(f, 'repeat');
    } else if (d.auto) {
      const idx = nextUnlockedIndex(f, d.track);
      if (idx >= 0) d.track = idx;
      changed(f, 'next');
    } else {
      d.playing = false;
      changed(f, 'end');
    }
  }
}

export function musicPlaying(state) {
  return recordPlayers(state).find((f) => f.data?.playing && f.powered !== false) || null;
}

// +2 Morale per game hour while a powered record player is playing and the survivor is at home.
export function recordMoraleHour(state) {
  if (!state?.player || state.player.scene !== 'home' || !musicPlaying(state)) return 0;
  return addStat(state, 'mor', RECORD_MORALE_PER_HOUR, 'music');
}

// ------------------------------------------------------------------------------------------ TV mini-games
export const TV_GAMES = [
  { id: 'snake', icon: '🐍', name: { en: 'Snake', zh: '贪吃蛇' } },
  { id: 'invaders', icon: '👾', name: { en: 'Space Invaders', zh: '太空侵略者' } },
  { id: 'breakout', icon: '🧱', name: { en: 'Breakout', zh: '打砖块' } },
  { id: 'stack', icon: '🟦', name: { en: 'Block Stack', zh: '方块堆叠' } },
  { id: 'runner', icon: '🏃', name: { en: 'Dead Run', zh: '末日快跑' } },
];

export const CONSOLE_IDS = [11002, 5]; // handheld console first: it adds a daily bonus
export const TV_MORALE = 8;
export const TV_ACHIEVEMENT_SCORE = 70;

const TV_NPCS = [
  { en: 'No.1 Old Electrician', zh: '1号老电工' },
  { en: 'No.14 Kindergarten Teacher', zh: '14号幼师' },
  { en: 'No.8 Handyman', zh: '8号修东西的' },
  { en: 'No.7 Bookkeeper', zh: '7号记账的' },
  { en: 'No.22 Nurse', zh: '22号护士' },
];
const NPC_SCORES = {
  snake: [96, 81, 63, 47, 30],
  invaders: [118, 94, 72, 52, 33],
  breakout: [104, 86, 66, 48, 29],
  stack: [125, 95, 70, 45, 25],
  runner: [98, 80, 61, 44, 26],
};
export const STUDENT_NPC_MULT = 0.6; // the College Student's leaderboard is easier (guide 3794377867)

export function consoleAtHome(state) {
  if (!state?.home) return null;
  const src = homeSources(state);
  return CONSOLE_IDS.find((id) => countIn(state, src, id) > 0) || null;
}

export function tvLeaderboard(gameId, character, best = 0) {
  const mult = character === 'student' ? STUDENT_NPC_MULT : 1;
  const rows = (NPC_SCORES[gameId] || []).map((score, i) => ({ name: TV_NPCS[i], score: Math.round(score * mult), you: false }));
  if (best > 0) rows.push({ name: { en: 'You', zh: '你' }, score: best, you: true });
  return rows.sort((a, b) => b.score - a.score || (a.you ? -1 : 1));
}

// First game of the day: +8 Morale; the handheld console also adds Max Morale and Planning Points.
export function rewardTvPlay(state) {
  if (!state?.player || dailyCount(state, 'tvgame') > 0) return null;
  bumpDaily(state, 'tvgame');
  const out = { mor: addStat(state, 'mor', TV_MORALE, 'tv') };
  if (consoleAtHome(state) === 11002) {
    raiseMax(state, 'mor', 1, 'tv');
    state.loop.planningPoints = (state.loop.planningPoints || 0) + 3;
    out.max = 1;
    out.points = 3;
  }
  return out;
}

export function submitTvScore(state, history, gameId, score) {
  const s = Math.max(0, Math.floor(Number(score) || 0));
  history.tvBest = history.tvBest || {};
  const prev = history.tvBest[gameId] || 0;
  if (s > prev) history.tvBest[gameId] = s;
  if (state?.progress) {
    const c = state.progress.counters;
    c['tvgame.best'] = Math.max(c['tvgame.best'] || 0, s);
    c['tvgame.plays'] = (c['tvgame.plays'] || 0) + 1;
  }
  const reward = state ? rewardTvPlay(state) : null;
  return { score: s, record: s > prev, best: Math.max(prev, s), reward };
}

// ------------------------------------------------------------------------------------------ live wiring
registerSystem({
  id: 'leisure',
  order: 80,
  tick(state, dt) {
    tickRecordPlayers(state, dt);
  },
  onHour(state) {
    recordMoraleHour(state);
  },
});

registerSystem({
  id: 'profile',
  order: 96,
  onDay(state) {
    if (state === game.state && recordBestDays(game.history, state)) persistHistory();
  },
});

on('death', (p) => {
  const s = game.state;
  if (!s) return;
  recordDeath(game.history, s, p?.cause);
  persistHistory();
});

function onEnding(p) {
  const s = game.state;
  const obj = p && typeof p === 'object' ? p : {};
  const raw = ENDINGS.find((e) => e.ach === obj.achievement)?.key ?? obj.id ?? obj.ending ?? obj.key ?? p;
  const key = canonicalEnding(raw);
  if (!key || s?.progress?.recordedEnding === key) return;
  if (s?.progress) s.progress.recordedEnding = key;
  recordBestDays(game.history, s);
  pushRecord(game.history, s, { kind: 'ending', ending: key });
  persistHistory();
}
on('ending', onEnding);
on('endingReached', onEnding);

for (const ev of ['achievement', 'runStarted']) {
  on(ev, () => {
    if (refreshProfileAwards(game.history)) persistHistory();
  });
}
