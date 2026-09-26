// Zombie hordes, crises and the tower-defense line (FEATURES M01–M11).
// Story hordes follow the guides' calendar (Day 7, 15, … 49 large, 66 repair kit, 87 final); Endless
// rolls one every 5–7 days at a rising threat level. Zombies spawn at the bottom of the yard, walk to
// a door or window and gnaw it; defense furniture in the yard slots fights back. Crisis-bar entries
// owned here carry `owner: 'horde'` so other systems' entries in state.crises are left alone.
import { registerSystem, die } from './tick.js';
import { registerKind, enqueue, cancelCurrent } from './actions.js';
import { registerObjectives } from './objectives.js';
import { registerSuggestions } from './suggest.js';
import {
  homeFloors,
  allSlots,
  slotDef,
  furnitureAt,
  furnDef,
  furnLabel,
  effectiveMaxHp,
  installFurniture,
  canInstall,
  defenseLevel,
  dropNewItem,
  packageFurniture,
} from './home.js';
import { homeSources, giveItems } from './furnActions.js';
import { addStat, addEffect, removeEffect } from './stats.js';
import { addProfExp } from './proficiency.js';
import { getMods } from './modifiers.js';
import { countIn, takeFrom, removeUid } from './inventory.js';
import { dayNumber, dayStartT, formatDuration, HOUR, DAY } from './time.js';
import { CELL, cellAt, cellKey } from './scene.js';
import { furn, item, itemName, SLOT, CAT } from '../data/db.js';
import { rand, randInt, chance, pick, weighted } from '../engine/rng.js';
import { emit, on } from '../engine/bus.js';
import { pickLang } from '../engine/i18n.js';
import { logEvent } from './state.js';

// ------------------------------------------------------------------------------------ tuning
const NIGHT_HOUR = 22; // attacks begin at 22:00 of the horde day
const TILE_CAP = 3; // zombies per yard tile (a large one takes 2)
const WAVE_MAX = 70 * 60; // the next wave charges after this even if the last is still up
const WAVE_LULL = 15 * 60; // breather after a wave is wiped out
const BREACH_DEATH = 90 * 60; // zombies inside the house this long kill the survivor
const FIRE_RADIUS = 1.6;
const CUE_GAP = 45; // game seconds between two sound cues of the same kind

// size: zombies before difficulty scaling; big: large zombies among them.
export const STORY_HORDES = [
  { day: 7, size: 12, waves: 2, big: 0 },
  { day: 15, size: 20, waves: 3, big: 0 },
  { day: 25, size: 28, waves: 3, big: 1 },
  { day: 35, size: 36, waves: 3, big: 2 },
  { day: 49, size: 58, waves: 4, big: 5, major: true },
  { day: 58, size: 56, waves: 4, big: 5 },
  { day: 66, size: 64, waves: 4, big: 6, reward: 9048 },
  { day: 76, size: 74, waves: 5, big: 8 },
  { day: 87, size: 96, waves: 6, big: 12, final: true, hours: 10 },
];

const ARCH = {
  normal: { hp: 60, dmg: 4, atk: 150, move: 90, patience: 60 * 60 },
  big: { hp: 260, dmg: 14, atk: 150, move: 150, patience: 90 * 60 },
};

// Defense furniture (Config_Furniture 36001–36004). dps/hit: damage to zombies within one tile;
// wear: durability lost per damage dealt (spikes) or per hit (nets, chainsaws).
export const DEVICES = {
  36001: { key: 'sandbag', block: true },
  36002: { key: 'spike', dps: 3.5 / 60, wear: 0.05 },
  36003: { key: 'net', block: true, power: true, period: 60, hit: 10, stun: 25, wear: 1 },
  36004: { key: 'chainsaw', power: true, period: 30, hit: 18, targets: 3, wear: 0.6 },
};

export const DEFENSE_PACKAGES = [26001, 26002, 26003, 26004];
export const DEVICE_REPAIR = [[20004, 2]];

// Molotov cocktails by quality: impact damage in the blast, then a fire patch (dps for secs).
export const MOLOTOVS = {
  26007: { impact: 45, dps: 1.0, secs: 360 },
  26005: { impact: 30, dps: 0.65, secs: 300 },
  26006: { impact: 18, dps: 0.35, secs: 240 },
};
const MOLOTOV_ORDER = [26007, 26005, 26006];

// Rotten meat bait (funcs 80032–80034, patch 08-26): countdown before the lured wave arrives.
export const BAIT = {
  1: { item: 26008, delay: 60 * 60, size: 8, perDay: 1 / 8, waves: 1, big: 0, reward: 3 },
  2: { item: 26009, delay: 90 * 60, size: 18, perDay: 1 / 5, waves: 2, big: 1, reward: 6 },
  3: { item: 26010, delay: 120 * 60, size: 30, perDay: 1 / 3, waves: 3, big: 3, reward: 10 },
};

const KILL_LOOT = [
  [20001, 5],
  [20002, 4],
  [20003, 4],
  [20004, 3],
  [20005, 3],
  [20105, 4],
  [20104, 1],
  [20106, 1],
];
const BAIT_DROPS = [
  [26008, 0.012],
  [26009, 0.005],
  [26010, 0.002],
];
const REWARD_POOL = [
  [20004, 6],
  [20002, 5],
  [20001, 4],
  [20003, 4],
  [20104, 3],
  [20106, 3],
  [20300, 3],
  [20301, 3],
  [20310, 2],
  [2107, 3],
  [2115, 3],
  [2123, 2],
  [2149, 3],
  [2114, 3],
  [2131, 2],
  [2400, 2],
  [2509, 2],
  [26005, 1],
  [26002, 1],
];
const RADIO_REWARD = [
  [2107, 3],
  [2115, 3],
  [2123, 2],
  [2101, 1],
  [2400, 2],
  [2405, 1],
  [20300, 3],
  [20301, 2],
  [20310, 1],
];
// Horde rewards that unlock defense blueprints (Config_ProductionList: 402 electric net, 403 chainsaw).
const BLUEPRINTS = { 15: 402, 25: 403 };

const RADIO_LINES = [
  {
    en: '"…outer ring relay, repeat, outer ring relay. A big pack is drifting down from the overpass. Two days, maybe less. Board up. Anyone who holds out until our next warning — we will drop supplies."',
    zh: '"……外环中继站，重复，外环中继站。一大群正从高架那边往下涌，最多两天。把门窗堵好。能撑到我们下一次警报的人，我们会空投物资。"',
  },
  {
    en: '"If you can hear this: the dead are moving in a column toward the old district. Reinforce your doors. Survive until the next broadcast and we will make it worth your while."',
    zh: '"如果你能听到：死人正排成一队往老城区走。加固你的门。撑到下一次广播，我们不会亏待你。"',
  },
  {
    en: '"Static… horde sighted east of the river, heading your way. Stock repair patches. Hold until the next warning and look for our drop at dawn."',
    zh: '"沙沙……河东发现尸潮，正朝你们那边去。多备些修补材料。撑到下一次警报，天亮时留意我们的空投。"',
  },
];
const RADIO_FINAL = {
  en: '"This is the last warning we can send. Everything that is left out there is coming at once. Whoever is still breathing on the old district — hold the door."',
  zh: '"这是我们能发出的最后一次警报。外面剩下的一切会一起涌过来。老城区里还喘着气的人——守住你的门。"',
};

// ------------------------------------------------------------------------------------ geometry
const geoCache = new Map();

// Openings on 1F that face the yard (approach = yard tile a zombie must stand on to gnaw) and the
// yard defense slots. Cached per home: slot definitions are static.
function geometry(state) {
  const id = state.home.id;
  if (geoCache.has(id)) return geoCache.get(id);
  const fl = homeFloors(id)['1F'];
  const openings = [];
  for (const s of allSlots(state)) {
    if (s.floor !== '1F' || (s.type !== SLOT.DOOR && s.type !== SLOT.WINDOW)) continue;
    const approach =
      [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ]
        .map(([dx, dy]) => [s.x + dx, s.y + dy])
        .find(([x, y]) => cellAt(fl, x, y) === CELL.YARD) || null;
    openings.push({ slot: s.id, key: s.id.split(':')[1], door: s.type === SLOT.DOOR, x: s.x, y: s.y, approach });
  }
  const g = {
    fl,
    w: fl.w,
    h: fl.h,
    yardTop: fl.innerH,
    openings,
    exposed: openings.filter((o) => o.approach),
    defense: allSlots(state).filter((s) => s.type === SLOT.DEFENSE && s.floor === '1F'),
    openingSlots: allSlots(state).filter((s) => s.type === SLOT.DOOR || s.type === SLOT.WINDOW),
  };
  geoCache.set(id, g);
  return g;
}

const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const units = (z) => (z.big ? 2 : 1);
const tileOf = (z) => (z.mt != null && z.mt >= 0.5 ? [z.nx, z.ny] : [z.cx, z.cy]);
const settledAt = (z, [x, y]) => z.mt == null && z.cx === x && z.cy === y;

function bump(state, key, n = 1) {
  const c = state.progress.counters;
  c[key] = (c[key] || 0) + n;
}

function ratioOf(f) {
  return f ? f.hp / Math.max(1, effectiveMaxHp(f)) : 1;
}

function defRedOf(state, f) {
  const base = furnDef(f.cfg)?.defRed || 0;
  const ivy = Math.max(0, Math.min(0.8, state.run?.ivyDefense || 0));
  return 1 - (1 - base) * (1 - ivy);
}

function currentDay(state) {
  return dayNumber(state.clock);
}

function devicesOf(state, g) {
  const out = [];
  for (const s of g.defense) {
    const f = furnitureAt(state, s.id);
    const def = f && DEVICES[f.cfg];
    if (def) out.push({ f, def, x: s.x, y: s.y, slot: s.id });
  }
  return out;
}

const working = (d) => !d.f.broken && d.f.hp > 0;
const powered = (f) => f.powered !== false && f.on !== false;

function blockerMap(devs) {
  const m = new Map();
  for (const d of devs) if (d.def.block && working(d)) m.set(cellKey(d.x, d.y), d);
  return m;
}

// ------------------------------------------------------------------------------------ queries
export function homeZombies(state) {
  return (state.zombies || []).filter((z) => z.home);
}

// Zombies still pressing the attack (not retreating).
export function activeZombies(state) {
  return (state.zombies || []).filter((z) => z.home && !z.leaving && z.hp > 0);
}

export function underAttack(state) {
  return (state.zombies || []).some((z) => z.home && !z.leaving && z.hp > 0);
}

export function isHordeActive(state) {
  return !!state.crises?.horde;
}

// The next scheduled horde that has not started yet (warned or not).
export function nextHorde(state) {
  const list = (state.crises?.schedule || []).filter((e) => e.type === 'horde' && (e.status === 'pending' || e.status === 'warned'));
  if (!list.length) return null;
  const e = list.reduce((a, b) => (b.at < a.at ? b : a));
  return { id: e.id, kind: e.kind, day: e.day, at: e.at, warnAt: e.warnAt, label: hordeName(e), final: e.final, major: e.major, warned: e.status === 'warned' };
}

// Endless threat level (1..N); 0 in story mode.
export function threatLevel(state) {
  if (state.meta?.mode === 'story') return 0;
  return Math.max(1, state.crises?.threat || 1);
}

// Iron Wall (A:2205): every door is a titanium door and every window bulletproof.
export function allOpeningsMaxTier(state) {
  const slots = geometry(state).openingSlots;
  return (
    slots.length > 0 &&
    slots.every((s) => {
      const f = furnitureAt(state, s.id);
      return f && f.cfg === (s.type === SLOT.DOOR ? 30002 : 35002);
    })
  );
}

export function openingsInfo(state) {
  const g = geometry(state);
  const act = activeZombies(state);
  return g.openingSlots.map((s) => {
    const f = furnitureAt(state, s.id);
    const o = g.openings.find((x) => x.slot === s.id);
    const max = f ? effectiveMaxHp(f) : 0;
    return {
      slot: s.id,
      door: s.type === SLOT.DOOR,
      f,
      hp: f?.hp ?? 0,
      max,
      ratio: f ? ratioOf(f) : 0,
      defRed: f ? defRedOf(state, f) : 0,
      breached: !!f && f.hp <= 0,
      exposed: !!o?.approach,
      attackers: o?.approach ? act.filter((z) => settledAt(z, o.approach)).length : 0,
    };
  });
}

export function defenseSlotsInfo(state) {
  const lv = defenseLevel(state);
  return geometry(state).defense.map((s) => {
    const f = furnitureAt(state, s.id);
    const def = f ? DEVICES[f.cfg] : null;
    return {
      slot: s.id,
      target: s.target,
      lv: s.lv || 0,
      locked: (s.lv || 0) > lv,
      f,
      device: def?.key || null,
      powered: def?.power ? powered(f) : null,
    };
  });
}

export function hordeName(e) {
  if (e.final) return pickLang({ en: 'The Final Horde', zh: '终局尸潮' });
  if (e.kind === 'bait') return pickLang({ en: 'Lured horde', zh: '引来的尸群' });
  if (e.major) return pickLang({ en: 'Large zombie horde', zh: '大规模尸潮' });
  return pickLang({ en: 'Zombie horde', zh: '尸潮' });
}

// ------------------------------------------------------------------------------------ state
function ensureCrises(state) {
  const cr = (state.crises = state.crises || {});
  cr.active = cr.active || [];
  cr.upcoming = cr.upcoming || [];
  cr.history = cr.history || [];
  cr.schedule = cr.schedule || [];
  cr.fires = cr.fires || [];
  cr.seq = cr.seq || 1;
  cr.breachTime = cr.breachTime || 0;
  if (cr.horde === undefined) cr.horde = null;
  state.zombies = state.zombies || [];
  const p = state.progress;
  p.kills = p.kills || 0;
  p.crisesSurvived = p.crisesSurvived || 0;
  p.hordesSurvived = p.hordesSurvived || 0;
  return cr;
}

function hordeEntry(state, spec) {
  const at = dayStartT(state.clock, spec.day) + NIGHT_HOUR * HOUR;
  const warnDays = spec.final || spec.major ? 3 : 2;
  return {
    type: 'horde',
    id: `${spec.kind}-${spec.day}`,
    kind: spec.kind,
    day: spec.day,
    at,
    warnAt: at - warnDays * DAY,
    hours: spec.hours || 8,
    size: spec.size ?? null,
    waves: spec.waves ?? null,
    big: spec.big ?? null,
    final: !!spec.final,
    major: !!spec.major,
    reward: spec.reward || 0,
    status: 'pending',
  };
}

// A committed ending route moves the final horde to that route's day (story sets state.story.finalWaveDay).
export function syncFinalHorde(state) {
  const day = state.story?.finalWaveDay;
  const cr = state.crises;
  if (!day || !cr?.schedule) return false;
  const e = cr.schedule.find((x) => x.type === 'horde' && x.kind === 'story' && x.final);
  if (!e || e.status !== 'pending' || e.day === day) return false;
  const at = dayStartT(state.clock, day) + NIGHT_HOUR * HOUR;
  if (at <= state.clock.t) return false;
  e.day = day;
  e.at = at;
  e.warnAt = at - 3 * DAY;
  e.id = `story-${day}`;
  refreshNext(state);
  return true;
}

function buildStorySchedule(state) {
  const cr = state.crises;
  if (state.meta.mode !== 'story' || cr.schedule.some((e) => e.type === 'horde' && e.kind === 'story')) return;
  for (const spec of STORY_HORDES) cr.schedule.push(hordeEntry(state, { ...spec, kind: 'story' }));
  refreshNext(state);
}

function scheduleEndless(state) {
  const cr = state.crises;
  if (state.meta.mode === 'story') return;
  if (typeof cr.threat !== 'number') cr.threat = 1;
  if (cr.horde?.kind === 'endless') return;
  if (cr.schedule.some((e) => e.type === 'horde' && e.kind === 'endless' && (e.status === 'pending' || e.status === 'warned'))) return;
  const today = currentDay(state);
  const day = cr.lastEndlessDay ? Math.max(today + 2, cr.lastEndlessDay + randInt(state, 5, 7)) : Math.max(7, today + 5);
  cr.schedule.push(hordeEntry(state, { kind: 'endless', day }));
  refreshNext(state);
}

function endlessStrength(state, day) {
  const th = threatLevel(state);
  return {
    size: Math.round(10 + 6 * (th - 1) + day * 0.2),
    waves: Math.min(6, 2 + Math.floor((th - 1) / 2)),
    big: Math.round((th - 1) * 1.2 + day / 30),
    hpMult: 1 + 0.06 * (th - 1),
    dmgMult: 1 + 0.04 * (th - 1),
  };
}

function refreshNext(state) {
  const n = nextHorde(state);
  state.crises.nextHorde = n ? { id: n.id, day: n.day, at: n.at, final: n.final } : null;
}

function upsertEntry(list, entry) {
  const i = list.findIndex((e) => e.id === entry.id);
  if (i >= 0) list[i] = entry;
  else list.push(entry);
  list.sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity));
}

function dropEntry(list, id) {
  const i = list.findIndex((e) => e.id === id);
  if (i >= 0) list.splice(i, 1);
}

const toast = (text, kind = 'info') => emit('toast', { text, kind });

// Sound cues for the audio system (door bangs, device hits, chainsaws): hits land many times per tick in a big
// horde, so each kind is emitted at most once per CUE_GAP.
function cue(state, type, payload, key = type) {
  const last = (state.crises._cues ||= {});
  const since = state.clock.t - (last[key] ?? -Infinity);
  if (since >= 0 && since < CUE_GAP) return false;
  last[key] = state.clock.t;
  emit(type, payload);
  return true;
}

// Light Sleeper (ability): wake up as soon as something attacks the house.
function wakeLightSleeper(state) {
  const p = state.player;
  if (!p.sleeping || p.scene !== 'home' || !getMods(state).lightSleeper) return false;
  cancelCurrent(state);
  toast(pickLang({ en: 'You jolt awake: something is at the door!', zh: '你猛地惊醒：门外有动静！' }), 'bad');
  return true;
}

// ------------------------------------------------------------------------------------ warnings & radio
function warnHorde(state, e) {
  const cr = state.crises;
  e.status = 'warned';
  upsertEntry(cr.upcoming, { id: `horde:${e.id}`, owner: 'horde', type: 'horde', label: hordeName(e), at: e.at });
  if (cr.radioMission?.status === 'accepted') completeRadioMission(state);
  cr.radioMission = { status: 'offered', offeredAt: state.clock.t, horde: e.id, day: e.day };
  const text = pickLang(e.final ? RADIO_FINAL : pick(state, RADIO_LINES));
  emit('radioBroadcast', { text, horde: { id: e.id, day: e.day, at: e.at, final: e.final, major: e.major }, mission: { ...cr.radioMission } });
  emit('crisis', { type: 'horde', phase: 'warning', id: e.id, at: e.at });
  toast(pickLang({ en: `📻 Radio: a horde is coming (Day ${e.day}). Reinforce the doors.`, zh: `📻 广播：尸潮将至（第${e.day}天）。加固门窗！` }), 'bad');
  logEvent(state, pickLang({ en: `Radio warning: horde on Day ${e.day}`, zh: `广播预警：第${e.day}天尸潮` }), 'bad');
  refreshNext(state);
}

export function acceptRadioMission(state) {
  const m = state.crises?.radioMission;
  if (!m || m.status !== 'offered') return false;
  m.status = 'accepted';
  m.acceptedAt = state.clock.t;
  return true;
}

function completeRadioMission(state) {
  const m = state.crises.radioMission;
  if (!m || m.status !== 'accepted') return;
  const list = [];
  const n = 3 + randInt(state, 0, 2);
  for (let i = 0; i < n; i++) list.push([weighted(state, RADIO_REWARD), 1]);
  giveItems(state, list);
  m.status = 'done';
  bump(state, 'radio.mission');
  toast(pickLang({ en: `📻 The survivors kept their word: ${n} supplies received.`, zh: `📻 幸存者兑现了承诺：收到${n}件物资。` }), 'good');
}

// ------------------------------------------------------------------------------------ hordes
function splitWaves(total, n, final) {
  n = Math.max(1, Math.min(n, total));
  const weights = Array.from({ length: n }, (_, i) => 1 + i * 0.25);
  if (final) weights[n - 1] += 0.8;
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = weights.map((w) => Math.max(1, Math.floor((total * w) / sum)));
  let diff = total - out.reduce((a, b) => a + b, 0);
  for (let i = n - 1; diff !== 0; i = (i - 1 + n) % n) {
    if (diff > 0) {
      out[i]++;
      diff--;
    } else if (out[i] > 1) {
      out[i]--;
      diff++;
    }
  }
  return out;
}

function spreadBigs(bigs, waves) {
  const out = waves.map(() => 0);
  let left = Math.min(bigs, waves.reduce((a, b) => a + b, 0));
  for (let i = 0; left > 0; i++) {
    const w = waves.length - 1 - (i % waves.length);
    if (out[w] < waves[w]) {
      out[w]++;
      left--;
    }
  }
  return out;
}

function startHorde(state, e) {
  const cr = state.crises;
  const mods = getMods(state);
  const t = state.clock.t;
  const str = e.kind === 'endless' ? endlessStrength(state, e.day) : e;
  const total = Math.max(1, Math.round(str.size * mods.zombieCount));
  const waves = splitWaves(total, str.waves || 1, e.final);
  const bigWaves = spreadBigs(Math.round((str.big || 0) * mods.zombieCount), waves);
  e.status = 'active';
  const h = {
    id: e.id,
    kind: e.kind,
    day: e.day,
    label: hordeName(e),
    final: e.final,
    major: e.major,
    reward: e.reward,
    bait: e.bait || 0,
    startT: t,
    endT: t + e.hours * HOUR,
    waves,
    bigWaves,
    wave: 0,
    waveT: t,
    lullUntil: null,
    toSpawn: waves[0],
    bigToSpawn: bigWaves[0],
    nextSpawnT: t,
    total: waves.reduce((a, b) => a + b, 0),
    spawned: 0,
    killed: 0,
    retreated: 0,
    hpMult: mods.zombieHp * (1 + e.day / 120) * (str.hpMult || 1),
    dmgMult: (1 + e.day / 100) * (str.dmgMult || 1),
    cap: Math.min(40, 14 + Math.round(total / 4)),
    doorMin: 1,
    openMin: 1,
    breaches: 0,
    damage: 0,
  };
  cr.horde = h;
  dropEntry(cr.upcoming, `horde:${e.id}`);
  upsertEntry(cr.active, activeEntry(h));
  refreshNext(state);
  emit('hordeStart', { id: h.id, kind: h.kind, day: h.day, total: h.total, final: h.final });
  emit('crisis', { type: 'horde', phase: 'attack', id: h.id });
  toast(pickLang({ en: `🧟 ${h.label} is at the door!`, zh: `🧟 ${h.label}来了！` }), 'bad');
  logEvent(state, pickLang({ en: `${h.label} attacked (${h.total} zombies)`, zh: `${h.label}来袭（${h.total}只丧尸）` }), 'bad');
  wakeLightSleeper(state);
  return h;
}

function activeEntry(h) {
  return {
    id: `horde:${h.id}`,
    owner: 'horde',
    type: 'horde',
    kind: h.kind,
    final: h.final,
    label: h.waves.length > 1 ? `${h.label} · ${pickLang({ en: 'Wave', zh: '波次' })} ${h.wave + 1}/${h.waves.length}` : h.label,
    at: h.endT,
    phase: 'attack',
    show: true,
  };
}

// Start an unscheduled horde at the door right now (rotten meat bait, drone lures from other systems).
export function summonHorde(state, { size = 10, waves = 1, big = 0, kind = 'bait', label = null, hours = 4, bait = 0, reward = 0 } = {}) {
  const cr = ensureCrises(state);
  if (cr.horde) return null;
  const day = currentDay(state);
  const e = { type: 'horde', id: `${kind}-${day}-${cr.seq++}`, kind, day, at: state.clock.t, warnAt: state.clock.t, hours, size, waves, big, final: false, major: false, reward, bait, status: 'pending' };
  cr.schedule.push(e);
  const h = startHorde(state, e);
  if (label) {
    h.label = label;
    upsertEntry(cr.active, activeEntry(h));
  }
  return h;
}

function nextWave(state, h) {
  h.wave += 1;
  h.waveT = state.clock.t;
  h.lullUntil = null;
  h.toSpawn = h.waves[h.wave];
  h.bigToSpawn = h.bigWaves[h.wave];
  h.nextSpawnT = state.clock.t;
  upsertEntry(state.crises.active, activeEntry(h));
  emit('hordeWave', { id: h.id, wave: h.wave + 1, of: h.waves.length });
  toast(pickLang({ en: `Another wave is coming (${h.wave + 1}/${h.waves.length})`, zh: `又一波来了（${h.wave + 1}/${h.waves.length}）` }), 'bad');
}

function tickHorde(state) {
  const h = state.crises.horde;
  const t = state.clock.t;
  let alive = 0;
  let waveAlive = 0;
  for (const z of state.zombies) {
    if (z.h !== h.id || z.leaving) continue;
    alive++;
    if (z.w === h.wave) waveAlive++;
  }
  if (h.toSpawn > 0 && t >= h.nextSpawnT) {
    const n = Math.min(h.toSpawn, Math.max(0, h.cap - alive), randInt(state, 1, 3));
    for (let i = 0; i < n; i++) {
      const big = h.bigToSpawn > 0 && (h.bigToSpawn >= h.toSpawn || chance(state, h.bigToSpawn / h.toSpawn));
      spawnZombie(state, { src: h.kind === 'bait' ? 'bait' : 'horde', h: h.id, w: h.wave, big, hpMult: h.hpMult, dmgMult: h.dmgMult });
      h.toSpawn--;
      if (big) h.bigToSpawn--;
      h.spawned++;
      alive++;
      waveAlive++;
    }
    if (n > 0) emit('zombieSpawned', { horde: h.id, n, wave: h.wave + 1, src: h.kind === 'bait' ? 'bait' : 'horde' });
    h.nextSpawnT = t + randInt(state, 60, 150);
  }
  if (h.toSpawn === 0) {
    if (h.wave < h.waves.length - 1) {
      if (waveAlive === 0 && h.lullUntil == null) h.lullUntil = t + WAVE_LULL;
      if ((h.lullUntil != null && t >= h.lullUntil) || t >= h.waveT + WAVE_MAX) nextWave(state, h);
    } else if (alive === 0) {
      return endHorde(state, 'cleared');
    }
  }
  if (t >= h.endT) endHorde(state, 'dawn');
}

function endHorde(state, reason) {
  const cr = state.crises;
  const h = cr.horde;
  if (!h) return;
  cr.horde = null;
  for (const z of state.zombies) if (z.h === h.id) z.leaving = true;
  const e = cr.schedule.find((x) => x.id === h.id);
  if (e) e.status = 'done';
  dropEntry(cr.active, `horde:${h.id}`);
  const p = state.progress;
  p.crisesSurvived += 1;
  bump(state, 'crisis.survived');
  if (h.doorMin > 0.8) bump(state, 'crisis.doorHeld80');
  if (h.kind !== 'bait') {
    p.hordesSurvived += 1;
    bump(state, 'horde.survived');
  }
  if (h.kind === 'endless') {
    bump(state, 'wave.survived');
    cr.threat = threatLevel(state) + 1;
    cr.lastEndlessDay = h.day;
    p.counters['endless.threat'] = Math.max(p.counters['endless.threat'] || 0, cr.threat);
  }
  if (h.final) state.story.tags.TAG_FINAL_WAVE_SURVIVED = true;
  addProfExp(state, 'defense', 10 + Math.round(h.total / 2));
  hordeRewards(state, h);
  if (h.final) completeRadioMission(state);
  cr.history.push({ type: 'horde', kind: h.kind, id: h.id, day: h.day, total: h.total, killed: h.killed, retreated: h.retreated, breaches: h.breaches, doorMin: h.doorMin, final: h.final, reason, survived: true });
  if (cr.history.length > 80) cr.history.splice(0, cr.history.length - 80);
  if (cr.tenseOn) {
    removeEffect(state, 'tense');
    cr.tenseOn = false;
  }
  const endPayload = { id: h.id, kind: h.kind, day: h.day, killed: h.killed, total: h.total, reason, final: h.final };
  emit('hordeEnded', endPayload);
  toast(
    h.killed * 2 >= h.total
      ? pickLang({ en: `The horde is repelled! ${h.killed} zombies killed.`, zh: `尸潮被击退了！击杀${h.killed}只丧尸。` })
      : pickLang({ en: `The horde drifts away. ${h.killed} killed.`, zh: `尸潮渐渐散去。击杀${h.killed}只。` }),
    'good'
  );
  logEvent(state, pickLang({ en: `Survived ${h.label} (${h.killed}/${h.total} killed)`, zh: `挺过${h.label}（击杀${h.killed}/${h.total}）` }), 'good');
  scheduleEndless(state);
  refreshNext(state);
}

function hordeRewards(state, h) {
  const g = geometry(state);
  const door = g.exposed.find((o) => o.door) || g.exposed[0];
  const [x, y] = door ? door.approach : [Math.floor(g.w / 2), g.yardTop];
  const n = h.bait ? Math.max(1, Math.round((BAIT[h.bait]?.reward || 3) * (h.killed / h.total))) : 2 + Math.round(h.total / 10);
  for (let i = 0; i < n; i++) dropYard(state, weighted(state, REWARD_POOL), x, y);
  toast(pickLang({ en: `Supplies were left outside the door (${n} items). Send the drone for them.`, zh: `门外留下了物资（${n}件），派无人机去取吧。` }), 'good');
  if (h.reward && item(h.reward)) {
    giveItems(state, [[h.reward, 1]]);
    toast(pickLang({ en: `You found a ${itemName(h.reward)} among the bodies!`, zh: `你在尸堆里找到了${itemName(h.reward)}！` }), 'good');
  }
  const bp = h.kind === 'story' ? BLUEPRINTS[h.day] : 0;
  const unlocked = (state.run.unlockedRecipes = state.run.unlockedRecipes || []);
  if (bp && !unlocked.includes(bp)) {
    unlocked.push(bp);
    emit('recipeUnlocked', { craft: bp, source: 'horde' });
    toast(pickLang({ en: 'A defense blueprint was among the spoils.', zh: '战利品里有一张防御工事图纸。' }), 'good');
  }
}

function dropYard(state, id, x, y) {
  if (!item(id)) return null;
  const box = dropNewItem(state, id, '1F', x, y);
  box.yard = true;
  const inv = state.inventories[box.inv];
  if (inv) inv.outdoor = true;
  return box;
}

// ------------------------------------------------------------------------------------ zombies
function pickTarget(state, g, big, src) {
  const open = g.exposed.filter((o) => furnitureAt(state, o.slot));
  if (!open.length) return null;
  const door = open.find((o) => o.door);
  if (src === 'sporadic' && door) return door.slot;
  return weighted(
    state,
    open.map((o) => [o.slot, o.door ? (big ? 8 : 4) : 1])
  );
}

// Spawn one zombie at the bottom of the yard (or at opts.x/opts.y).
export function spawnZombie(state, opts = {}) {
  const cr = ensureCrises(state);
  const g = geometry(state);
  const target = opts.target || pickTarget(state, g, opts.big, opts.src);
  const op = g.openings.find((o) => o.slot === target);
  const ax = op?.approach?.[0] ?? Math.floor(g.w / 2);
  let x = opts.x ?? Math.max(0, Math.min(g.w - 1, ax + randInt(state, -3, 3)));
  const y = opts.y ?? g.h - 1;
  if (opts.x == null) {
    const blocked = blockerMap(devicesOf(state, g));
    for (let i = 0; i < g.w && (blocked.has(cellKey(x, y)) || cellAt(g.fl, x, y) !== CELL.YARD); i++) x = (x + 1) % g.w;
  }
  const a = opts.big ? ARCH.big : ARCH.normal;
  const hp = Math.max(1, Math.round(a.hp * (opts.hpMult ?? getMods(state).zombieHp)));
  const z = {
    id: `z${cr.seq++}`,
    floor: '1F',
    home: true,
    src: opts.src || 'horde',
    h: opts.h ?? null,
    w: opts.w ?? 0,
    big: !!opts.big,
    x,
    y,
    cx: x,
    cy: y,
    nx: x,
    ny: y,
    mt: null,
    hp,
    maxHp: hp,
    dmg: a.dmg * (opts.dmgMult ?? 1),
    atk: a.atk,
    move: a.move,
    atkCd: rand(state) * a.atk,
    stun: 0,
    target,
    leaving: false,
    giveUpT: state.clock.t + (opts.patience ?? a.patience) * (0.8 + rand(state) * 0.4),
  };
  state.zombies.push(z);
  return z;
}

// Greedy step toward (gx, gy): zombies walk straight over traps (patch 08-21) but sandbags and
// nets stop them; a crowded tile makes them wait or sidestep.
function nextStep(g, z, gx, gy, occ, blockers) {
  const dx = gx - z.cx;
  const dy = gy - z.cy;
  const v = dy ? [z.cx, z.cy + Math.sign(dy)] : null;
  const hz = dx ? [z.cx + Math.sign(dx), z.cy] : null;
  const opts = Math.abs(dy) >= Math.abs(dx) ? [v, hz] : [hz, v];
  let wall = null;
  for (const c of opts) {
    if (!c || cellAt(g.fl, c[0], c[1]) !== CELL.YARD) continue;
    const k = cellKey(c[0], c[1]);
    const b = blockers.get(k);
    if (b) {
      wall = wall || b;
      continue;
    }
    if ((occ.get(k) || 0) + units(z) > TILE_CAP) continue;
    return { x: c[0], y: c[1] };
  }
  return wall ? { blocker: wall } : null;
}

function startMove(z, x, y, dt, occ) {
  const from = cellKey(z.cx, z.cy);
  occ.set(from, (occ.get(from) || 0) - units(z));
  const to = cellKey(x, y);
  occ.set(to, (occ.get(to) || 0) + units(z));
  z.nx = x;
  z.ny = y;
  z.mt = Math.min(0.99, dt / z.move);
  z.x = z.cx + (z.nx - z.cx) * z.mt;
  z.y = z.cy + (z.ny - z.cy) * z.mt;
}

function readyToHit(z, dt) {
  z.atkCd -= dt;
  if (z.atkCd > 0) return false;
  z.atkCd += z.atk;
  return true;
}

function hurtSurvivor(state, amount) {
  addStat(state, 'life', -amount, 'zombies');
  if (state.player.stats.life <= 0) die(state, 'zombies');
}

function hitOpening(state, z, op, f) {
  const h = state.crises.horde;
  if (h && z.h === h.id && !h.arrived) {
    h.arrived = true;
    emit('hordeArrived', { id: h.id, slot: op.slot });
  }
  if (f.hp > 0) {
    const dmg = z.dmg * (1 - defRedOf(state, f));
    f.hp = Math.max(0, f.hp - dmg);
    if (h) h.damage += dmg;
    cue(state, 'openingHit', { slot: op.slot, door: op.door, furn: f.uid, cfg: f.cfg, ratio: ratioOf(f), big: z.big });
    if (f.hp <= 0) breach(state, op, f);
  } else if (state.player.scene === 'home') {
    cue(state, 'zombieAttack', { big: z.big, slot: op.slot });
    hurtSurvivor(state, z.big ? 5 : 2.5);
  }
}

function breach(state, op, f) {
  f.data.breached = true;
  const h = state.crises.horde;
  if (h) h.breaches += 1;
  bump(state, 'home.breach');
  emit('breach', { slot: op.slot, furn: f.uid });
  toast(pickLang({ en: `Zombies broke through the ${furnLabel(f)}!`, zh: `丧尸冲破了${furnLabel(f)}！` }), 'bad');
  logEvent(state, pickLang({ en: `Breach: ${furnLabel(f)}`, zh: `失守：${furnLabel(f)}` }), 'bad');
  if (state.player.scene !== 'home') return;
  if (state.player.sleeping) cancelCurrent(state);
  if (chance(state, 0.4)) addEffect(state, 'bleeding', 6);
  hurtSurvivor(state, 15);
}

function hitDevice(state, d, dmg) {
  d.f.hp = Math.max(0, d.f.hp - dmg);
  if (d.f.hp <= 0 && !d.f.broken) {
    d.f.broken = true;
    emit('defenseBroken', { slot: d.slot, cfg: d.f.cfg });
    toast(pickLang({ en: `${furnLabel(d.f)} was destroyed.`, zh: `${furnLabel(d.f)}被摧毁了。` }), 'bad');
  }
}

function damageZombie(z, dmg, by) {
  if (z.hp <= 0) return;
  z.hp -= dmg;
  z.by = by;
}

function deviceCue(state, d, n) {
  const type = d.def.key === 'chainsaw' ? 'chainsawHit' : 'defenseHit';
  cue(state, type, { slot: d.slot, cfg: d.f.cfg, device: d.def.key, n }, `${type}:${d.def.key}`);
}

function runDevices(state, devs, zs, dt) {
  for (const d of devs) {
    if (!working(d) || (d.def.power && !powered(d.f))) continue;
    const def = d.def;
    if (def.dps) {
      let hit = 0;
      for (const z of zs) {
        if (z.hp <= 0) continue;
        const [x, y] = tileOf(z);
        if (cheb(x, y, d.x, d.y) > 1) continue;
        const dmg = def.dps * dt;
        damageZombie(z, dmg, def.key);
        hitDevice(state, d, dmg * def.wear);
        hit++;
        if (!working(d)) break;
      }
      if (hit) deviceCue(state, d, hit);
    } else if (def.period) {
      const data = d.f.data;
      data.cd = (data.cd ?? 0) - dt;
      while (data.cd <= 0 && working(d)) {
        const near = zs.filter((z) => {
          if (z.hp <= 0) return false;
          const [x, y] = tileOf(z);
          return cheb(x, y, d.x, d.y) <= 1;
        });
        if (!near.length) {
          data.cd = 0;
          break;
        }
        near.sort((a, b) => a.hp - b.hp);
        const targets = def.targets ? near.slice(0, def.targets) : near;
        for (const z of targets) {
          damageZombie(z, def.hit, def.key);
          if (def.stun) z.stun = Math.max(z.stun, def.stun);
          hitDevice(state, d, def.wear);
        }
        data.cd += def.period;
        deviceCue(state, d, targets.length);
      }
    }
  }
}

function runFires(state, zs, dt) {
  const cr = state.crises;
  const t = state.clock.t;
  cr.fires = cr.fires.filter((fire) => fire.until > t);
  for (const fire of cr.fires) {
    for (const z of zs) {
      if (Math.hypot(z.x - fire.x, z.y - fire.y) <= fire.r) damageZombie(z, fire.dps * dt, 'fire');
    }
  }
}

function playerInYard(state, g) {
  const p = state.player;
  return p.scene === 'home' && p.floor === '1F' && p.y >= g.yardTop;
}

function actZombie(state, g, z, dt, occ, blockers) {
  if (z.stun > 0) {
    z.stun = Math.max(0, z.stun - dt);
    return;
  }
  if (z.mt != null) {
    z.mt += dt / z.move;
    if (z.mt >= 1) {
      z.cx = z.nx;
      z.cy = z.ny;
      z.mt = null;
    }
    z.x = z.mt == null ? z.cx : z.cx + (z.nx - z.cx) * z.mt;
    z.y = z.mt == null ? z.cy : z.cy + (z.ny - z.cy) * z.mt;
    return;
  }
  if (z.leaving) {
    if (z.cy >= g.h - 1) {
      z.gone = true;
      return;
    }
    const c = [z.cx, z.cy + 1];
    if (cellAt(g.fl, c[0], c[1]) === CELL.YARD && !blockers.has(cellKey(c[0], c[1]))) startMove(z, c[0], c[1], dt, occ);
    else z.gone = true;
    return;
  }
  if (state.clock.t >= z.giveUpT) {
    z.leaving = true;
    return;
  }
  const p = state.player;
  if (playerInYard(state, g) && cheb(z.cx, z.cy, p.x, p.y) <= 1) {
    if (readyToHit(z, dt)) {
      if (chance(state, 0.15)) addEffect(state, 'bleeding', 4);
      cue(state, 'zombieAttack', { big: z.big, yard: true });
      hurtSurvivor(state, z.big ? 8 : 4);
    }
    return;
  }
  let op = g.openings.find((o) => o.slot === z.target);
  let f = op && furnitureAt(state, op.slot);
  if (!op?.approach || !f) {
    z.target = pickTarget(state, g, z.big, z.src);
    op = g.openings.find((o) => o.slot === z.target);
    f = op && furnitureAt(state, op.slot);
    if (!op?.approach || !f) {
      z.leaving = true;
      return;
    }
  }
  const [ax, ay] = op.approach;
  if (z.cx === ax && z.cy === ay) {
    if (readyToHit(z, dt)) hitOpening(state, z, op, f);
    return;
  }
  const step = nextStep(g, z, ax, ay, occ, blockers);
  if (!step) return;
  if (step.blocker) {
    if (readyToHit(z, dt)) {
      const b = step.blocker;
      hitDevice(state, b, z.dmg * (z.big ? 1.5 : 1));
      cue(state, 'defenseHit', { slot: b.slot, cfg: b.f.cfg, device: b.def.key, by: 'zombie' }, 'defenseHit:zombie');
    }
    if (!working(step.blocker)) blockers.delete(cellKey(step.blocker.x, step.blocker.y));
    return;
  }
  startMove(z, step.x, step.y, dt, occ);
}

function killZombie(state, z) {
  const p = state.progress;
  p.kills += 1;
  bump(state, 'zombie.kill');
  if (z.big) bump(state, 'zombie.kill.big');
  addProfExp(state, 'defense', 2);
  const h = state.crises.horde;
  if (h) {
    if (z.h === h.id) h.killed += 1;
    if (h.final) bump(state, 'siege.final.kill');
  }
  const [x, y] = tileOf(z);
  const lootChance = z.big ? 0.45 : 0.1;
  if (chance(state, lootChance)) dropYard(state, weighted(state, KILL_LOOT), x, y);
  for (const [id, odds] of BAIT_DROPS) {
    if (chance(state, odds * (z.big ? 3 : 1))) {
      dropYard(state, id, x, y);
      break;
    }
  }
  emit('zombieKilled', { big: z.big, by: z.by || null, src: z.src });
}

function reap(state) {
  const h = state.crises.horde;
  const keep = [];
  for (const z of state.zombies) {
    if (!z.home) keep.push(z);
    else if (z.hp <= 0) killZombie(state, z);
    else if (z.gone) {
      if (h && z.h === h.id) h.retreated += 1;
    } else keep.push(z);
  }
  state.zombies = keep;
}

function simulate(state, dt) {
  const g = geometry(state);
  const devs = devicesOf(state, g);
  let zs = homeZombies(state);
  if (zs.length) {
    runFires(state, zs, dt);
    runDevices(state, devs, zs, dt);
    reap(state);
    zs = homeZombies(state);
    const occ = new Map();
    for (const z of zs) {
      const k = z.mt != null ? cellKey(z.nx, z.ny) : cellKey(z.cx, z.cy);
      occ.set(k, (occ.get(k) || 0) + units(z));
    }
    const blockers = blockerMap(devs);
    for (const z of zs) {
      actZombie(state, g, z, dt, occ, blockers);
      if (state.phase === 'dead') return;
    }
    reap(state);
  } else if (state.crises.fires.length) {
    state.crises.fires = [];
  }
  if (state.crises.horde) tickHorde(state);
}

// ------------------------------------------------------------------------------------ sporadic zombies
function rollSporadic(state, day) {
  const cr = state.crises;
  if (day <= 3 || cr.sporadic || state.clock.t < (cr.quietUntil || 0)) return;
  const near = cr.schedule.some((e) => e.type === 'horde' && (e.status === 'pending' || e.status === 'warned') && Math.abs(e.day - day) <= 1);
  if (near || !chance(state, Math.min(0.4, 0.15 + day * 0.004))) return;
  const hour = weighted(
    state,
    Array.from({ length: 24 }, (_, hr) => [hr, hr >= 19 || hr < 5 ? 2 : 1])
  );
  const n = 1 + (day > 20 && chance(state, 0.5) ? 1 : 0) + (day > 50 && chance(state, 0.5) ? 1 : 0);
  cr.sporadic = { at: dayStartT(state.clock, day) + hour * HOUR + randInt(state, 0, 59) * 60, n };
}

function tickSporadic(state) {
  const cr = state.crises;
  const s = cr.sporadic;
  if (s && state.clock.t >= s.at) {
    cr.sporadic = null;
    if (!cr.horde && state.clock.t < s.at + 6 * HOUR) {
      const mods = getMods(state);
      const day = currentDay(state);
      for (let i = 0; i < s.n; i++) spawnZombie(state, { src: 'sporadic', hpMult: mods.zombieHp * (1 + day / 120), dmgMult: 1 + day / 100, patience: 45 * 60 });
      bump(state, 'zombie.sporadic', s.n);
      emit('sporadicZombies', { n: s.n });
      emit('zombieSpawned', { n: s.n, src: 'sporadic' });
      toast(pickLang({ en: 'Something is scratching at the front door…', zh: '有什么东西在挠大门……' }), 'bad');
      wakeLightSleeper(state);
    }
  }
  const any = state.zombies.some((z) => z.src === 'sporadic' && !z.leaving);
  const has = cr.active.some((e) => e.id === 'sporadic');
  if (any && !has) upsertEntry(cr.active, { id: 'sporadic', owner: 'horde', type: 'sporadic', label: pickLang({ en: 'Wandering zombies', zh: '游荡的丧尸' }), phase: 'attack', show: true });
  else if (!any && has) dropEntry(cr.active, 'sporadic');
}

// ------------------------------------------------------------------------------------ rotten meat bait
export function baitWaveSize(state, size) {
  const b = BAIT[size];
  return b ? Math.round(b.size + currentDay(state) * b.perDay) : 0;
}

function baitBlocked(state) {
  const cr = state.crises;
  if (cr.bait) return pickLang({ en: 'The last bait is still drawing them in.', zh: '上一块诱饵还在起作用。' });
  if (cr.horde || underAttack(state)) return pickLang({ en: 'There are already zombies at the door.', zh: '门外已经有丧尸了。' });
  const n = nextHorde(state);
  if (n && n.at - state.clock.t < 6 * HOUR) return pickLang({ en: 'A horde is due soon — not now.', zh: '尸潮快到了，现在不行。' });
  return null;
}

export function throwBait(state, size) {
  const cr = ensureCrises(state);
  const b = BAIT[size];
  if (!b || baitBlocked(state)) return null;
  cr.bait = { size, at: state.clock.t + b.delay };
  upsertEntry(cr.upcoming, { id: 'bait', owner: 'horde', type: 'horde', label: pickLang({ en: 'Lured horde', zh: '引来的尸群' }), at: cr.bait.at });
  bump(state, 'bait.thrown');
  emit('crisis', { type: 'horde', phase: 'warning', id: 'bait', at: cr.bait.at });
  toast(pickLang({ en: 'The stench spreads down the street. Something is coming.', zh: '腐臭味顺着街道飘散开，有东西要来了。' }), 'bad');
  return cr.bait;
}

function tickBait(state) {
  const cr = state.crises;
  if (!cr.bait || state.clock.t < cr.bait.at || cr.horde) return;
  const { size } = cr.bait;
  const b = BAIT[size];
  cr.bait = null;
  dropEntry(cr.upcoming, 'bait');
  summonHorde(state, { size: baitWaveSize(state, size), waves: b.waves, big: b.big, kind: 'bait', bait: size, hours: 4 });
}

// ------------------------------------------------------------------------------------ thugs (M11)
function rollThugs(state, day) {
  const cr = state.crises;
  if (day <= 20 || cr.thugs?.status === 'coming' || cr.thugs?.status === 'pending') return;
  if (state.clock.t < (cr.quietUntil || 0) || day - (cr.lastThugDay || 0) < 4) return;
  if (cr.schedule.some((e) => e.type === 'horde' && e.status !== 'done' && e.status !== 'missed' && Math.abs(e.day - day) <= 1)) return;
  if (!chance(state, 0.12)) return;
  cr.thugs = { status: 'coming', at: dayStartT(state.clock, day) + randInt(state, 19, 23) * HOUR, day };
}

export function startThugs(state) {
  const cr = ensureCrises(state);
  const day = currentDay(state);
  cr.thugs = { status: 'pending', at: state.clock.t, deadline: state.clock.t + 2 * HOUR, day, demand: Math.round(30 + day * 1.5), doorMin: 1 };
  cr.lastThugDay = day;
  upsertEntry(cr.active, { id: 'thugs', owner: 'horde', type: 'thugs', label: pickLang({ en: 'Thugs at the door', zh: '门外的暴徒' }), at: cr.thugs.deadline, phase: 'attack', show: true });
  emit('crisis', { type: 'thugs', phase: 'attack' });
  emit('openPanel', { panel: 'thugs' });
  toast(pickLang({ en: 'Someone is pounding on the door, demanding supplies!', zh: '有人在砸门，要你交出物资！' }), 'bad');
  wakeLightSleeper(state);
  return cr.thugs;
}

function tickThugs(state) {
  const th = state.crises.thugs;
  if (!th) return;
  if (th.status === 'coming' && state.clock.t >= th.at) {
    if (state.crises.horde) th.at += HOUR;
    else startThugs(state);
  } else if (th.status === 'pending') {
    const door = frontDoor(state);
    if (door) th.doorMin = Math.min(th.doorMin, ratioOf(door));
    if (state.clock.t >= th.deadline) resolveThugs(state, 'ignore');
  }
}

function frontDoor(state) {
  const o = geometry(state).openings.find((x) => x.door);
  return o ? furnitureAt(state, o.slot) : null;
}

// What the thugs would take if you stuff supplies out: the cheapest food and medicine that meet the demand.
export function thugOffer(state) {
  const need = state.crises?.thugs?.demand || 0;
  const pool = [];
  for (const invId of homeSources(state)) {
    const inv = state.inventories[invId];
    if (!inv) continue;
    for (const it of inv.items) {
      const c = item(it.id);
      if (!c || c.noUse || (c.cat !== CAT.FOOD && c.cat !== CAT.MEDICINE)) continue;
      pool.push({ invId, uid: it.uid, id: it.id, qty: it.qty || 1, value: Math.max(1, c.trade || 5) * (it.qty || 1) });
    }
  }
  pool.sort((a, b) => a.value - b.value);
  const items = [];
  let value = 0;
  for (const p of pool) {
    if (value >= need) break;
    items.push(p);
    value += p.value;
  }
  return { need, value, items, ok: value >= need };
}

// choice: 'give' | 'fight' | 'ignore'. Returns { ok, text }.
export function resolveThugs(state, choice) {
  const cr = state.crises;
  const th = cr.thugs;
  if (!th || th.status !== 'pending') return { ok: false, text: pickLang({ en: 'Nobody is at the door.', zh: '门外没人。' }) };
  let text;
  const door = frontDoor(state);
  if (choice === 'give') {
    const offer = thugOffer(state);
    if (!offer.ok) return { ok: false, text: pickLang({ en: 'You do not have enough supplies to satisfy them.', zh: '你拿不出足够的物资打发他们。' }) };
    for (const p of offer.items) {
      const inv = state.inventories[p.invId];
      if (inv) removeUid(inv, p.uid);
    }
    cr.quietUntil = state.clock.t + 12 * HOUR;
    bump(state, 'thug.bribed');
    text = pickLang({ en: `You push ${offer.items.length} items through the gap. They grab the bag and leave you alone tonight.`, zh: `你从门缝塞出去${offer.items.length}件物资。他们抢过袋子，今晚不会再来找麻烦了。` });
  } else if (choice === 'fight') {
    const lv = defenseLevel(state);
    const odds = Math.max(0.2, Math.min(0.9, 0.45 + 0.08 * lv + (state.player.stats.sta >= 40 ? 0.1 : -0.1)));
    const win = chance(state, odds);
    const bled = chance(state, win ? 0.25 : 0.65);
    if (bled) addEffect(state, 'bleeding', 6);
    if (win) {
      const g = geometry(state);
      const o = g.exposed.find((x) => x.door);
      const n = randInt(state, 1, 3);
      if (o) for (let i = 0; i < n; i++) dropYard(state, weighted(state, REWARD_POOL), o.approach[0], o.approach[1]);
      bump(state, 'thug.repelled');
      addProfExp(state, 'defense', 15);
      text = pickLang({
        en: `You fling the door open and drive them off. They leave ${n} things behind in their hurry.${bled ? ' You got cut in the scuffle.' : ''}`,
        zh: `你猛地拉开门把他们打跑了，他们慌乱中丢下了${n}样东西。${bled ? '扭打中你受了伤。' : ''}`,
      });
    } else {
      if (door) door.hp = Math.max(1, door.hp - randInt(state, 100, 200) * (1 - defRedOf(state, door)));
      addStat(state, 'life', -8, 'thugs');
      text = pickLang({ en: 'There are too many of them. You are beaten back and they batter the door before leaving.', zh: '他们人太多了。你被打了回来，他们砸了一通门才离开。' });
    }
  } else {
    if (door) door.hp = Math.max(1, door.hp - randInt(state, 150, 250) * (1 - defRedOf(state, door)));
    text = pickLang({ en: 'You keep quiet. They hammer on the door for a long time, then curse and leave.', zh: '你一声不吭。他们砸了很久的门，骂骂咧咧地走了。' });
  }
  if (door) th.doorMin = Math.min(th.doorMin, ratioOf(door));
  th.status = 'done';
  th.choice = choice;
  th.outcome = text;
  dropEntry(cr.active, 'thugs');
  state.progress.crisesSurvived += 1;
  bump(state, 'crisis.survived');
  if (th.doorMin > 0.8) bump(state, 'crisis.doorHeld80');
  cr.history.push({ type: 'thugs', day: th.day, choice, survived: true });
  toast(text, choice === 'fight' ? 'good' : 'info');
  logEvent(state, text);
  return { ok: true, text };
}

// ------------------------------------------------------------------------------------ molotovs & counterattack
export function molotovTarget(state) {
  const zs = activeZombies(state);
  let best = null;
  for (const z of zs) {
    const [x, y] = tileOf(z);
    let score = 0;
    for (const o of zs) {
      const [ox, oy] = tileOf(o);
      if (cheb(ox, oy, x, y) <= 1) score += units(o);
    }
    if (!best || score > best.score || (score === best.score && y < best.y)) best = { x, y, score };
  }
  return best;
}

export function bestMolotov(state) {
  const src = homeSources(state);
  return MOLOTOV_ORDER.find((id) => countIn(state, src, id) > 0) || null;
}

// Area damage at the densest group plus a fire patch; returns { x, y, hit } or null.
export function throwMolotov(state, itemId) {
  const spec = MOLOTOVS[itemId];
  const tgt = spec && molotovTarget(state);
  if (!tgt) return null;
  let hit = 0;
  for (const z of homeZombies(state)) {
    if (Math.hypot(z.x - tgt.x, z.y - tgt.y) > FIRE_RADIUS) continue;
    damageZombie(z, spec.impact, 'molotov');
    hit++;
  }
  state.crises.fires.push({ x: tgt.x, y: tgt.y, r: FIRE_RADIUS, dps: spec.dps, until: state.clock.t + spec.secs });
  bump(state, 'molotov.thrown');
  reap(state);
  return { x: tgt.x, y: tgt.y, hit };
}

function nearestOpening(state, x, y) {
  let best = null;
  for (const o of geometry(state).exposed) {
    if (!furnitureAt(state, o.slot)) continue;
    const d = Math.abs(o.approach[0] - x) + Math.abs(o.approach[1] - y);
    if (!best || d < best.d) best = { o, d };
  }
  return best?.o || null;
}

export function queueMolotov(state, itemId = bestMolotov(state)) {
  if (!itemId) return null;
  const tgt = molotovTarget(state);
  const o = tgt && nearestOpening(state, tgt.x, tgt.y);
  const f = o && furnitureAt(state, o.slot);
  return enqueue(state, { kind: 'throwMolotov', label: `${pickLang({ en: 'Throw', zh: '投掷' })} ${itemName(itemId)}`, target: f ? { furn: f.uid } : null, dur: 60, cost: { sta: 3 }, item: itemId }, { front: true });
}

function attackersAt(state, o) {
  return activeZombies(state).filter((z) => settledAt(z, o.approach));
}

// Stab through the door or window at the zombies pressing against it (M05).
export function counterattack(state, slotId) {
  const o = geometry(state).exposed.find((x) => x.slot === slotId);
  const zs = o ? attackersAt(state, o) : [];
  if (!zs.length) return { hit: 0, killed: 0 };
  const lv = defenseLevel(state);
  const dmg = 30 + 8 * lv;
  zs.sort((a, b) => a.hp - b.hp);
  const targets = zs.slice(0, 2);
  for (const z of targets) damageZombie(z, dmg, 'counter');
  const killed = targets.filter((z) => z.hp <= 0).length;
  if (chance(state, Math.max(0.03, 0.1 + (zs.some((z) => z.big) ? 0.15 : 0) - 0.02 * lv))) addEffect(state, 'bleeding', 4);
  addProfExp(state, 'defense', 3);
  bump(state, 'zombie.counter');
  reap(state);
  return { hit: targets.length, killed };
}

// The opening with the most zombies at it.
export function busiestOpening(state) {
  let best = null;
  for (const o of geometry(state).exposed) {
    const n = attackersAt(state, o).length;
    if (n && (!best || n > best.n)) best = { slot: o.slot, n };
  }
  return best?.slot || null;
}

export function queueCounterattack(state, slotId = busiestOpening(state)) {
  const f = slotId && furnitureAt(state, slotId);
  if (!f) return null;
  return enqueue(state, { kind: 'counterattack', label: pickLang({ en: 'Counterattack', zh: '反击' }), target: { furn: f.uid }, dur: 10 * 60, cost: { sta: 10 }, slot: slotId }, { front: true });
}

// ------------------------------------------------------------------------------------ defense line
function outsideBlocked(state) {
  return underAttack(state) || state.crises?.horde ? pickLang({ en: 'Too dangerous to go outside during an attack.', zh: '丧尸正在进攻，出去太危险了。' }) : null;
}

// The survivor sets the device up from a yard tile next to its slot, as for any other install (BUG-0100: standing on
// the slot itself, the device went up under their feet and could wall them into the yard).
export function queueInstallDefense(state, slotId, pkgId) {
  const slot = slotDef(state, slotId);
  const cfg = packageFurniture(pkgId);
  if (!slot || !cfg) return null;
  return enqueue(state, {
    kind: 'defenseInstall',
    label: `${pickLang({ en: 'Install', zh: '安装' })} ${itemName(pkgId)}`,
    target: { slot: slotId },
    dur: furn(cfg)?.inst || 1800,
    cost: { sta: 8 },
    slot: slotId,
    pkg: pkgId,
  });
}

export function queueRepairDevice(state, uid) {
  const f = state.furniture[uid];
  if (!f) return null;
  return enqueue(state, { kind: 'defenseRepair', label: `${pickLang({ en: 'Repair', zh: '修理' })} ${furnLabel(f)}`, target: { furn: uid }, dur: 20 * 60, cost: { sta: 8 }, furn: uid });
}

// ------------------------------------------------------------------------------------ bookkeeping
function bookkeeping(state, dt) {
  const cr = state.crises;
  const g = geometry(state);
  const taboo = state.progress.taboo;
  const h = cr.horde;
  let low = false;
  let allClosed = true;
  for (const s of g.openingSlots) {
    const f = furnitureAt(state, s.id);
    if (!f) continue;
    const r = ratioOf(f);
    if (r < 0.7) {
      taboo.doorWorn = true;
      if (h?.final) taboo.siegeDoorWorn = true;
    }
    if (r < 0.25) low = true;
    if (f.hp <= 0) allClosed = false;
    else if (f.data.breached) f.data.breached = false;
    if (h) {
      h.openMin = Math.min(h.openMin, r);
      if (s.type === SLOT.DOOR) h.doorMin = Math.min(h.doorMin, r);
    }
  }
  const pressure = underAttack(state);
  const tenseNow = pressure && low;
  if (tenseNow && !cr.tenseOn) {
    addEffect(state, 'tense');
    cr.tenseOn = true;
  } else if (!tenseNow && cr.tenseOn) {
    removeEffect(state, 'tense');
    cr.tenseOn = false;
  }
  if (allClosed) cr.breachTime = 0;
  else if (pressure && g.exposed.some((o) => furnitureAt(state, o.slot)?.hp <= 0 && attackersAt(state, o).length)) {
    cr.breachTime += dt;
    if (cr.breachTime >= BREACH_DEATH && state.player.scene === 'home') die(state, 'zombies');
  }
  const n = { spike: 0, net: 0, chainsaw: 0, sandbag: 0 };
  for (const s of g.defense) {
    const def = DEVICES[furnitureAt(state, s.id)?.cfg];
    if (def) n[def.key]++;
  }
  const c = state.progress.counters;
  c['defense.spike'] = n.spike;
  c['defense.net'] = n.net;
  c['defense.chainsaw'] = n.chainsaw;
  c['defense.sandbag'] = n.sandbag;
}

function tickSchedule(state) {
  const cr = state.crises;
  const t = state.clock.t;
  for (const e of cr.schedule) {
    if (e.type !== 'horde' || (e.status !== 'pending' && e.status !== 'warned')) continue;
    if (t >= e.at + e.hours * HOUR) {
      e.status = 'missed';
      dropEntry(cr.upcoming, `horde:${e.id}`);
      refreshNext(state);
      continue;
    }
    if (e.status === 'pending' && t >= e.warnAt) warnHorde(state, e);
    if (t >= e.at && !cr.horde) startHorde(state, e);
  }
}

function tickCrises(state, dt) {
  if (state.phase !== 'post' || state.crises?.disabled) return;
  const cr = state.crises?.fires ? state.crises : ensureCrises(state);
  tickSchedule(state);
  tickBait(state);
  tickThugs(state);
  tickSporadic(state);
  if (cr.horde || state.zombies.length) simulate(state, dt);
  if (state.phase === 'dead') return;
  bookkeeping(state, dt);
}

// ------------------------------------------------------------------------------------ action kinds
const noZombies = () => pickLang({ en: 'No zombies in sight.', zh: '外面没有丧尸。' });

registerKind('throwMolotov', {
  canStart(state, a) {
    if (!countIn(state, homeSources(state), a.item)) return pickLang({ en: 'No Molotov left.', zh: '没有燃烧瓶了。' });
    return underAttack(state) ? true : noZombies();
  },
  complete(state, a) {
    if (!underAttack(state)) return toast(noZombies());
    if (takeFrom(state, homeSources(state), a.item, 1)) throwMolotov(state, a.item);
  },
});

registerKind('counterattack', {
  canStart(state, a) {
    const o = geometry(state).exposed.find((x) => x.slot === a.slot);
    return o && attackersAt(state, o).length ? true : noZombies();
  },
  complete(state, a) {
    const r = counterattack(state, a.slot);
    toast(pickLang({ en: `Counterattack: ${r.hit} hit, ${r.killed} killed.`, zh: `反击：击中${r.hit}只，击杀${r.killed}只。` }), r.killed ? 'good' : 'info');
  },
});

registerKind('throwBait', {
  canStart(state, a) {
    const b = BAIT[a.spec?.size];
    if (!b || !countIn(state, homeSources(state), b.item)) return pickLang({ en: 'No bait.', zh: '没有诱饵。' });
    return baitBlocked(state) || true;
  },
  complete(state, a) {
    const b = BAIT[a.spec.size];
    if (baitBlocked(state) || !takeFrom(state, homeSources(state), b.item, 1)) return;
    throwBait(state, a.spec.size);
  },
});

registerKind('bribe', {
  canStart(state) {
    if (state.crises?.thugs?.status !== 'pending') return pickLang({ en: 'Nobody is at the door.', zh: '门外没人。' });
    return thugOffer(state).ok ? true : pickLang({ en: 'Not enough supplies to hand over.', zh: '拿不出足够的物资。' });
  },
  complete(state) {
    const r = resolveThugs(state, 'give');
    if (!r.ok) toast(r.text, 'bad');
  },
});

registerKind('thugFight', {
  canStart(state) {
    return state.crises?.thugs?.status === 'pending' ? true : pickLang({ en: 'Nobody is at the door.', zh: '门外没人。' });
  },
  complete(state) {
    resolveThugs(state, 'fight');
  },
});

export function queueThugChoice(state, choice) {
  const door = frontDoor(state);
  if (choice === 'ignore' || !door) return resolveThugs(state, 'ignore');
  if (choice === 'give') return enqueue(state, { kind: 'bribe', label: pickLang({ en: 'Stuff supplies out', zh: '塞出物资' }), target: { furn: door.uid }, dur: 10 * 60 });
  return enqueue(state, { kind: 'thugFight', label: pickLang({ en: 'Counterattack the thugs', zh: '反击暴徒' }), target: { furn: door.uid }, dur: 20 * 60, cost: { sta: 20 } });
}

registerKind('defenseInstall', {
  canStart(state, a) {
    const blocked = outsideBlocked(state);
    if (blocked) return blocked;
    if (!countIn(state, homeSources(state), a.pkg)) return pickLang({ en: 'The package is gone.', zh: '包裹不见了。' });
    const chk = canInstall(state, packageFurniture(a.pkg), a.slot);
    if (chk.ok) return true;
    return chk.reason === 'locked' ? pickLang({ en: `Needs Defense Lv ${slotDef(state, a.slot)?.lv || 0}`, zh: `需要防御等级${slotDef(state, a.slot)?.lv || 0}` }) : pickLang({ en: 'That spot is taken.', zh: '这个位置已经被占了。' });
  },
  complete(state, a) {
    const cfg = packageFurniture(a.pkg);
    if (!canInstall(state, cfg, a.slot).ok || !takeFrom(state, homeSources(state), a.pkg, 1)) return;
    installFurniture(state, cfg, a.slot);
    addProfExp(state, 'defense', 5);
    toast(pickLang({ en: `${itemName(a.pkg)} set up on the defense line.`, zh: `${itemName(a.pkg)}已布置到防线上。` }), 'good');
  },
});

registerKind('defenseRepair', {
  canStart(state, a) {
    const f = state.furniture[a.furn];
    if (!f || !DEVICES[f.cfg]) return pickLang({ en: 'Nothing to repair.', zh: '没什么可修的。' });
    if (f.hp >= f.maxHp) return pickLang({ en: 'Fully repaired', zh: '已修满' });
    if (!DEVICE_REPAIR.every(([id, n]) => countIn(state, homeSources(state), id) >= n)) return pickLang({ en: `Needs ${DEVICE_REPAIR[0][1]}× ${itemName(DEVICE_REPAIR[0][0])}`, zh: `需要${itemName(DEVICE_REPAIR[0][0])}×${DEVICE_REPAIR[0][1]}` });
    return outsideBlocked(state) || true;
  },
  complete(state, a) {
    const f = state.furniture[a.furn];
    if (!f) return;
    for (const [id, n] of DEVICE_REPAIR) takeFrom(state, homeSources(state), id, n);
    f.hp = Math.min(f.maxHp, f.hp + f.maxHp * 0.6);
    f.broken = false;
    addProfExp(state, 'defense', 4);
  },
});

// ------------------------------------------------------------------------------------ registration
// Other systems summon hordes through the bus: emit('summonHorde', { state, size, reason }).
on('summonHorde', (p) => {
  const state = p?.state;
  if (!state || state.phase !== 'post') return;
  const size = p.size ?? 2;
  summonHorde(state, { size: Math.round(baitWaveSize(state, Math.min(3, size))), kind: p.reason || 'lure', label: p.label || null, reward: p.reward ?? 1, hours: 4 });
});

registerSystem({
  id: 'horde',
  order: 55,
  init(state) {
    ensureCrises(state);
    buildStorySchedule(state);
    scheduleEndless(state);
  },
  ensure(state) {
    ensureCrises(state);
    buildStorySchedule(state);
    scheduleEndless(state);
  },
  tick: tickCrises,
  onDay(state, day) {
    if (state.crises?.disabled) return;
    ensureCrises(state);
    buildStorySchedule(state);
    syncFinalHorde(state);
    scheduleEndless(state);
    rollSporadic(state, day);
    rollThugs(state, day);
  },
  onDeath(state) {
    const h = state.crises?.horde;
    if (h) state.crises.history.push({ type: 'horde', kind: h.kind, id: h.id, day: h.day, total: h.total, killed: h.killed, breaches: h.breaches, final: h.final, survived: false });
  },
});

registerObjectives((state) => {
  const cr = state.crises;
  if (state.phase !== 'post' || !cr?.schedule) return null;
  const t = state.clock.t;
  const out = [];
  const openDefense = () => emit('openPanel', { panel: 'defense' });
  const h = cr.horde;
  if (h) {
    out.push({
      id: 'horde',
      text: `🧟 ${h.label}: ${pickLang({ en: 'hold the line', zh: '守住防线' })}`,
      prog: `${pickLang({ en: 'Wave', zh: '波次' })} ${h.wave + 1}/${h.waves.length} · ${activeZombies(state).length} ${pickLang({ en: 'outside', zh: '只在门外' })} · ${h.killed} ${pickLang({ en: 'killed', zh: '击杀' })}`,
      urgent: true,
      onClick: openDefense,
    });
  } else {
    const n = nextHorde(state);
    if (n?.warned) out.push({ id: 'hordeNext', text: `⚠ ${n.label}`, prog: `${pickLang({ en: 'Arrives in', zh: '距离到达' })} ${formatDuration(n.at - t)}`, urgent: n.at - t < 6 * HOUR, onClick: openDefense });
  }
  if (cr.bait) out.push({ id: 'bait', text: pickLang({ en: '🥩 The bait is drawing zombies in', zh: '🥩 诱饵正在引来丧尸' }), prog: formatDuration(cr.bait.at - t), urgent: true, onClick: openDefense });
  const m = cr.radioMission;
  if (m?.status === 'offered') {
    out.push({ id: 'radioOffer', text: pickLang({ en: '📻 Radio: survivors ask you to hold out (click to accept)', zh: '📻 广播：幸存者请你坚持下去（点击接受）' }), onClick: () => acceptRadioMission(state) });
  } else if (m?.status === 'accepted') {
    out.push({ id: 'radioMission', text: pickLang({ en: '📻 Survive until the next horde warning', zh: '📻 坚持到下一次尸潮预警' }), prog: pickLang({ en: 'Reward: supply drop', zh: '奖励：空投物资' }) });
  }
  if (cr.thugs?.status === 'pending') {
    out.push({ id: 'thugs', text: pickLang({ en: '🚪 Thugs are banging on the door!', zh: '🚪 暴徒在砸门！' }), prog: formatDuration(cr.thugs.deadline - t), urgent: true, onClick: () => emit('openPanel', { panel: 'thugs' }) });
  }
  return out;
});

registerSuggestions((state) => {
  if (!underAttack(state)) return null;
  const out = [];
  const mol = bestMolotov(state);
  if (mol && activeZombies(state).length >= 3) out.push({ id: 'molotov', label: `${pickLang({ en: 'Throw', zh: '投掷' })} ${itemName(mol)}`, run: () => queueMolotov(state, mol) });
  return out;
});
