// Post-disaster exploration (N01–N06): leave the safehouse for one of six sites, search containers in a
// small iso map (a flashlight beam in the dark ones), dodge or fight the dead while the exposure meter
// climbs, and retreat home with whatever fits in the backpack. Endless runs lose sites to hordes.
import { item, itemName, furn, furnName, craft, CAT } from '../data/db.js';
import {
  SITES,
  SITE_BY_ID,
  LOOT_POOLS,
  LOOT_TABLES,
  FRESH_DAYS,
  ITEM,
  HOSPITAL_CLUES,
  TRUTH_CLUES,
  STUDENT_COPIES,
  SEARCH_MIN,
  LOCK_EXTRA_MIN,
  CLEAR_MIN,
  REST_MIN,
  EXPOSURE_LEVELS,
} from '../content/sites.js';
import { buildFloor, CELL, cellAt, cellKey, isOpenCell } from './scene.js';
import { registerScene } from './scenes.js';
import { fixtureFunc, FUNC_SPECS } from '../content/funcSpecs.js';
import { registerKind, enqueue, cancelAll, cancelCurrent } from './actions.js';
import { registerSystem, die } from './tick.js';
import { createInventory, destroyInventory, makeInstance, insert, countIn, takeFrom, removeUid } from './inventory.js';
import { addStat, addEffect, bumpDaily, dailyCount, effectiveMax } from './stats.js';
import { getMods } from './modifiers.js';
import { addProfExp, profLevel } from './proficiency.js';
import { dayNumber, hourOfDay, isNight, formatDuration, HOUR } from './time.js';
import { frontDoor, interactionTile, homeDef, dropToFloor } from './home.js';
import { registerObjectives } from './objectives.js';
import { registerSuggestions } from './suggest.js';
import { seedRng, nextFloat } from '../engine/rng.js';
import { emit } from '../engine/bus.js';
import { pickLang, loc } from '../engine/i18n.js';

const FLOOR_PREFIX = 'site:';
const FORCED_INJURY = 24; // Config_FurnitureFunc 209 preview "Vitality:-24"
const HIDDEN_STASH_CHANCE = 0.15;
const LORE_CHANCE = 0.3;
const STORY_ITEMS = [...TRUTH_CLUES, ...STUDENT_COPIES, ITEM.recorder, ITEM.wmNote, ITEM.teachingDrone];
const NOISY_KINDS = new Set(['exploreSearch', 'exploreClear', 'exploreFight']);
const INTERRUPTIBLE = new Set(['exploreSearch', 'exploreClear', 'exploreRest', 'exploreOpen']);
const EXPOSURE_SURGES = [
  [50, 1],
  [80, 2],
  [100, 3],
];
const BITE_SEC = { normal: 90, big: 120 };
// Hostile survivors (N02, "not every threat shambles and groans"): armed scavengers work the busier sites
// as the weeks go on. site: [first day, chance per outing]. First contact is a standoff.
export const RAIDERS = { streets: [8, 0.06], hardware: [12, 0.1], supermarket: [16, 0.22], school: [22, 0.2], hospital: [26, 0.28], office: [40, 0.35] };
const RAIDER = { hp: 90, hit: 9, sec: 60, leaveSec: 45 };

const t = (en, zh) => pickLang({ en, zh });
const toast = (text, kind = 'info') => emit('toast', { text, kind });
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

// ------------------------------------------------------------------------------------------ state
function xr(state) {
  return nextFloat(exploreState(state).rng);
}

// The wings' own stream (src/content/siteWings.js): which of a wing's containers hides a stash is drawn from it, so
// the hand-drawn part of a site plays out as it did before the wing was built on.
function wingRoll(state) {
  const ex = exploreState(state);
  ex.wingRng ||= seedRng(((state.meta?.seed ?? 1) ^ 0x3c6ef372) >>> 0);
  return nextFloat(ex.wingRng);
}

function freshState(state) {
  const ex = {
    rng: seedRng(((state.meta?.seed ?? 1) ^ 0x6a09e667) >>> 0),
    unlockDay: {},
    visited: [],
    visits: {},
    outings: 0,
    cleared: {},
    depletion: {},
    overrun: {},
    found: {},
    claimed: {},
    forcedKey: null,
    run: null,
    last: null,
  };
  state.explore = ex;
  for (const s of SITES) {
    const u = s.unlockDay;
    ex.unlockDay[s.id] = Array.isArray(u) ? u[0] + Math.floor(nextFloat(ex.rng) * (u[1] - u[0] + 1)) : u;
  }
  return ex;
}

export function exploreState(state) {
  return state.explore || freshState(state);
}

export function exploreRun(state) {
  return state.explore?.run || null;
}

export function isExploring(state) {
  return !!state.explore?.run;
}

export function sites() {
  return SITES;
}

export function site(id) {
  return SITE_BY_ID[id] || null;
}

export function currentSite(state) {
  const run = exploreRun(state);
  return run ? SITE_BY_ID[run.site] : null;
}

export function siteFloorId(id) {
  return `${FLOOR_PREFIX}${id}`;
}

export function exposureLevel(value) {
  let lv = EXPOSURE_LEVELS[0];
  for (const l of EXPOSURE_LEVELS) if (value >= l.min) lv = l;
  return lv;
}

// ------------------------------------------------------------------------------------------ layouts
const layouts = new Map();
const OUTDOOR_GROUND = { ',': CELL.YARD, ':': CELL.OUTDOOR };

// Parse a site's ASCII map into a floor grid (buildFloor), fixtures, zombie spawn points and the entry tile.
export function siteLayout(id) {
  if (layouts.has(id)) return layouts.get(id);
  const def = SITE_BY_ID[id];
  if (!def) return null;
  const rows = def.map;
  const h = rows.length;
  const w = rows[0].length;
  const walls = [];
  const windows = [];
  const ground = [];
  const spawns = [];
  const fixtures = [];
  const used = new Set();
  const perLetter = {};
  let door = null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = rows[y][x];
      if (!'#DW.,:'.includes(c)) {
        const near = [rows[y][x - 1], rows[y][x + 1], rows[y - 1]?.[x], rows[y + 1]?.[x]].find((n) => OUTDOOR_GROUND[n] != null);
        if (near) ground.push([x, y, OUTDOOR_GROUND[near]]);
      }
      if (c === '#') walls.push([x, y, x, y]);
      else if (c === 'D') door = [x, y];
      else if (c === 'W') windows.push([x, y]);
      else if (OUTDOOR_GROUND[c] != null) ground.push([x, y, OUTDOOR_GROUND[c]]);
      else if (c === 'z') spawns.push([x, y]);
      else if (c !== '.' && !used.has(cellKey(x, y))) {
        const spec = def.legend[c];
        if (!spec) throw new Error(`site ${id}: no legend entry for '${c}'`);
        for (let dy = 0; dy < spec.h; dy++) for (let dx = 0; dx < spec.w; dx++) used.add(cellKey(x + dx, y + dy));
        perLetter[c] = (perLetter[c] || 0) + 1;
        fixtures.push({ ...spec, id: spec.id || `${c}${perLetter[c]}`, letter: c, x, y });
      }
    }
  }
  // the wing's pieces (src/content/siteWings.js) come with their tile positions
  for (const spec of def.extra || []) {
    for (let dy = 0; dy < spec.h; dy++) for (let dx = 0; dx < spec.w; dx++) {
      const k = cellKey(spec.x + dx, spec.y + dy);
      if (used.has(k) || !'.,:'.includes(rows[spec.y + dy]?.[spec.x + dx] ?? '#')) throw new Error(`site ${id}: wing piece ${spec.cfg} overlaps at ${spec.x + dx},${spec.y + dy}`);
      used.add(k);
    }
    fixtures.push({ ...spec });
  }
  const floor = buildFloor(siteFloorId(id), { w, h, walls, windows, door, rooms: def.rooms || [] });
  for (const [x, y, cell] of ground) floor.cells[y * w + x] = cell;
  const [dx, dy] = door;
  const entry = dy === h - 1 ? [dx, dy - 1] : dy === 0 ? [dx, 1] : dx === 0 ? [1, dy] : [w - 2, dy];
  const layout = { id, floor, fixtures, byId: Object.fromEntries(fixtures.map((f) => [f.id, f])), spawns, entry, door };
  layouts.set(id, layout);
  return layout;
}

export function fixtureName(fx) {
  return furnName(fx.cfg);
}

// Obstacles and scrap are gone once pushed aside / taken apart; everything else stands where it is. Containers and
// loose finds lying about (拾取, picked up in a moment) are searched.
const CLEARABLE = new Set(['block', 'scrap']);
const SEARCHABLE = new Set(['box', 'loose']);
export function isCleared(fx) {
  return CLEARABLE.has(fx.kind) && !!fx.cleared;
}

function blocksPath(fx) {
  return !isCleared(fx);
}

export function blockedSet(run) {
  const set = new Set();
  for (const fx of run?.fixtures || []) {
    if (!blocksPath(fx)) continue;
    for (let dy = 0; dy < fx.h; dy++) for (let dx = 0; dx < fx.w; dx++) set.add(cellKey(fx.x + dx, fx.y + dy));
  }
  return set;
}

const walkable = (floor, blocked, x, y) => isOpenCell(cellAt(floor, x, y), { outside: true }) && !blocked.has(cellKey(x, y));
const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

// Breadth-first step distances from (sx, sy) over walkable cells; -1 = unreachable.
function distanceField(floor, blocked, sx, sy) {
  const dist = new Int16Array(floor.w * floor.h).fill(-1);
  if (sx < 0 || sy < 0 || sx >= floor.w || sy >= floor.h) return dist;
  const queue = [sx, sy];
  dist[sy * floor.w + sx] = 0;
  for (let i = 0; i < queue.length; i += 2) {
    const x = queue[i];
    const y = queue[i + 1];
    const d = dist[y * floor.w + x];
    for (const [ox, oy] of NEIGHBORS) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= floor.w || ny >= floor.h) continue;
      const k = ny * floor.w + nx;
      if (dist[k] >= 0 || !walkable(floor, blocked, nx, ny)) continue;
      dist[k] = d + 1;
      queue.push(nx, ny);
    }
  }
  return dist;
}

// Tiles beside a fixture's footprint that the survivor can stand on.
function sideTiles(fx) {
  const out = [];
  for (let x = fx.x; x < fx.x + fx.w; x++) out.push([x, fx.y - 1], [x, fx.y + fx.h]);
  for (let y = fx.y; y < fx.y + fx.h; y++) out.push([fx.x - 1, y], [fx.x + fx.w, y]);
  return out;
}

// Closest reachable tile next to a fixture (from the survivor, or from `from`).
export function approachTile(state, fid, from = state.player) {
  const run = exploreRun(state);
  const fx = run?.fixtures.find((f) => f.id === fid);
  if (!fx) return null;
  const { floor } = siteLayout(run.site);
  const blocked = blockedSet(run);
  const dist = distanceField(floor, blocked, from.x, from.y);
  let best = null;
  for (const [x, y] of sideTiles(fx)) {
    if (!walkable(floor, blocked, x, y) && !(x === from.x && y === from.y)) continue;
    const d = x === from.x && y === from.y ? 0 : dist[y * floor.w + x];
    if (d < 0) continue;
    if (!best || d < best.d) best = { x, y, d };
  }
  return best;
}

export function isWalkable(state, x, y) {
  const run = exploreRun(state);
  if (!run) return false;
  return walkable(siteLayout(run.site).floor, blockedSet(run), x, y);
}

// ------------------------------------------------------------------------------------------ status
function snowy(state) {
  const k = state.weather?.today?.kind;
  return k === 'snow' || k === 'coldWave';
}

function stormy(state) {
  const k = state.weather?.today?.kind;
  return k === 'heavyRain' || k === 'storm' || k === 'freezingRain';
}

export function travelTime(state, id) {
  const def = SITE_BY_ID[id];
  const mult = snowy(state) ? 1.25 : stormy(state) ? 1.1 : 1;
  return Math.round(def.travelMin * mult) * 60;
}

export function travelStamina(state, id) {
  const def = SITE_BY_ID[id];
  const skill = 1 - 0.05 * profLevel(state, 'explore');
  return Math.round((4 + def.travelMin * 0.15) * (snowy(state) ? 1.5 : 1) * skill * 10) / 10;
}

function hoursInfo(state, def, travelSec) {
  if (!def.hours) return { open: true, tooLate: false, closesAt: null, opensIn: 0 };
  const [openH, closeH] = def.hours;
  const h = hourOfDay(state.clock);
  const open = h >= openH && h < closeH;
  return {
    open,
    tooLate: open && h + travelSec / HOUR > closeH - 0.5,
    closesAt: open ? state.clock.t + (closeH - h) * HOUR : null,
    opensIn: open ? 0 : ((openH - h + 24) % 24) * HOUR,
  };
}

const hh = (h) => `${String(h).padStart(2, '0')}:00`;

// { status: 'here'|'locked'|'overrun'|'closed'|'open', available, forcedOk, reason, unlockDay, travelSec, ... }
export function siteStatus(state, id) {
  const def = SITE_BY_ID[id];
  if (!def) return null;
  const ex = exploreState(state);
  const travelSec = travelTime(state, id);
  const out = {
    id,
    status: 'open',
    available: false,
    forcedOk: false,
    reason: '',
    unlockDay: ex.unlockDay[id],
    travelSec,
    travelSta: travelStamina(state, id),
    visits: ex.visits[id] || 0,
    visited: ex.visited.includes(id),
    overrunUntil: ex.overrun[id] || null,
    ...hoursInfo(state, def, travelSec),
  };
  const fail = (status, reason) => Object.assign(out, { status, reason });
  if (ex.run?.site === id) return fail('here', t('You are here.', '你正在这里。'));
  if (state.phase === 'pre') return fail('locked', t('Only after the outbreak.', '灾变之后才能前往。'));
  if (dayNumber(state.clock) < out.unlockDay) return fail('locked', t(`Too dangerous to reach before Day ${out.unlockDay}.`, `第${out.unlockDay}天之前太危险，去不了。`));
  if (ex.overrun[id]) return fail('overrun', t(`Overrun by a horde until Day ${ex.overrun[id]}.`, `被尸潮占据，直到第${ex.overrun[id]}天。`));
  out.forcedOk = true;
  if (!out.open) return fail('closed', t(`Too dark and crowded now. Safe from ${hh(def.hours[0])}.`, `现在又黑又危险，${hh(def.hours[0])}之后再去。`));
  if (out.tooLate) return fail('closed', t(`You would arrive just before dark (${hh(def.hours[1])}).`, `赶到时天就黑了（${hh(def.hours[1])}）。`));
  out.available = true;
  return out;
}

function hordeAtDoor(state) {
  return (state.crises?.active || []).some((c) => c.type === 'horde' && c.phase === 'attack');
}

export function timeLeft(state) {
  const run = exploreRun(state);
  if (!run || run.closesAt == null) return null;
  return run.closesAt - state.clock.t;
}

// ------------------------------------------------------------------------------------------ departure
function buildFixtures(state, def) {
  const cleared = new Set(exploreState(state).cleared[def.id] || []);
  return siteLayout(def.id).fixtures.map((f) => ({
    id: f.id,
    letter: f.letter,
    kind: f.kind,
    cfg: f.cfg,
    x: f.x,
    y: f.y,
    w: f.w,
    h: f.h,
    loot: f.loot || null,
    rolls: f.rolls || 0,
    lock: f.lock || null,
    unlocked: false,
    searched: false,
    hidden: f.kind === 'box' && (f.wing ? wingRoll(state) : xr(state)) < HIDDEN_STASH_CHANCE,
    cleared: CLEARABLE.has(f.kind) ? cleared.has(f.id) : false,
    inv: null,
  }));
}

// Leave the house for a site. forced = desperate exploration (door function 209): ignores opening hours and a
// horde at the door, once per day, and costs Life on arrival.
export function startExploration(state, id, { forced = false } = {}) {
  const def = SITE_BY_ID[id];
  const ex = exploreState(state);
  const fail = (reason) => {
    toast(reason, 'bad');
    return { ok: false, reason };
  };
  if (!def) return fail(t('Unknown place.', '未知地点。'));
  if (state.phase !== 'post') return fail(t('You can only explore after the outbreak.', '只有灾变之后才能出门探索。'));
  if (ex.run) return fail(t('You are already out.', '你已经在外面了。'));
  if (state.player.scene !== 'home') return fail(t('Go home first.', '先回家。'));
  const st = siteStatus(state, id);
  if (st.status === 'locked' || st.status === 'overrun') return fail(st.reason);
  if (forced) {
    if (dailyCount(state, 'explore.forced') >= 1) return fail(t('You already risked it today.', '今天已经冒过一次险了。'));
  } else {
    if (!st.available) return fail(st.reason);
    if (hordeAtDoor(state)) return fail(t('The dead are at your door — you cannot slip out now.', '丧尸就堵在门口，现在出不去。'));
    if (state.player.stats.sta < st.travelSta + 3) return fail(t('Too exhausted to make the trip.', '太累了，走不了那么远。'));
  }
  cancelAll(state);
  state.progress.taboo.explore = true;
  if (forced) {
    bumpDaily(state, 'explore.forced');
    if (ex.forcedKey) bumpDaily(state, ex.forcedKey);
  }
  const layout = siteLayout(id);
  const fixtures = buildFixtures(state, def);
  ex.run = {
    site: id,
    forced,
    phase: 'travelOut',
    departedAt: state.clock.t,
    arrivedAt: null,
    closesAt: null,
    travelSec: st.travelSec,
    travelSta: st.travelSta,
    fixtures,
    total: fixtures.filter((f) => SEARCHABLE.has(f.kind)).length,
    searched: 0,
    zombies: [],
    zid: 0,
    exposure: 0,
    surges: {},
    warned: {},
    lastSurge: 0,
    nightNoted: false,
    kills: 0,
    hits: 0,
    found: [],
    storyRolled: [],
    resting: false,
    interrupted: null,
  };
  const p = state.player;
  p.scene = `explore:${id}`;
  p.floor = siteFloorId(id);
  [p.x, p.y] = layout.entry;
  p.px = p.x;
  p.py = p.y;
  p.path = [];
  p.sleeping = false;
  enqueueTravel(state, ex.run, 'out', st.travelSec);
  emit('exploreDeparted', { site: id, forced });
  return { ok: true };
}

function enqueueTravel(state, run, dir, dur) {
  const def = SITE_BY_ID[run.site];
  const sta = Math.round(run.travelSta * Math.min(1, dur / run.travelSec) * 10) / 10;
  enqueue(state, {
    kind: 'exploreTravel',
    dir,
    site: run.site,
    label: dir === 'out' ? `${def.icon} ${t('Travel to', '前往')} ${pickLang(def.name)}` : `🏠 ${t('Heading home', '返回家中')}`,
    dur,
    noWalk: true,
    noSlow: true,
    cost: sta > 0 ? { sta } : null,
  });
}

function hasTravel(state) {
  return state.actions.current?.kind === 'exploreTravel' || state.actions.queue.some((a) => a.kind === 'exploreTravel');
}

function arrive(state) {
  const ex = exploreState(state);
  const run = ex.run;
  const def = SITE_BY_ID[run.site];
  const layout = siteLayout(run.site);
  run.phase = 'site';
  run.arrivedAt = state.clock.t;
  run.closesAt = hoursInfo(state, def, 0).closesAt;
  run.nightNoted = isNight(state.clock);
  const p = state.player;
  [p.x, p.y] = layout.entry;
  p.px = p.x;
  p.py = p.y;
  const mods = getMods(state);
  const count = Math.max(1, Math.round(def.zombies * (mods.zombieCount || 1) * (run.nightNoted ? 1.3 : 1) * (run.forced ? 1.5 : 1)));
  const spots = shuffled(state, layout.spawns);
  for (let i = 0; i < count; i++) {
    const [x, y] = spots[i % spots.length];
    spawnZombie(state, x, y);
  }
  maybeRaiders(state, run, spots);
  if (!ex.visited.includes(run.site)) {
    ex.visited.push(run.site);
    addProfExp(state, 'explore', 40);
  }
  state.progress.counters['explore.points.distinct'] = ex.visited.length;
  if (run.forced) {
    addStat(state, 'life', -FORCED_INJURY, 'explore');
    if (xr(state) < 0.5) addEffect(state, 'bleeding', 12);
    toast(t('You forced your way out and got badly hurt on the way.', '你硬闯出门，路上受了重伤。'), 'bad');
  }
  toast(`${def.icon} ${pickLang(def.name)} — ${def.dark ? t('pitch black; the flashlight is all you have.', '一片漆黑，只能靠手电筒。') : t('stay quiet and search fast.', '保持安静，速战速决。')}`);
  emit('exploreArrived', { site: run.site, forced: run.forced });
  if (state.player.stats.life <= 0) die(state, 'exploration');
}

// Head home from the site (or turn back on the way there). Loot in the backpack comes along.
export function retreat(state) {
  const run = exploreRun(state);
  if (!run) return { ok: false, reason: 'notOut' };
  if (run.phase === 'travelBack') return { ok: false, reason: 'already' };
  if (run.phase === 'travelOut') {
    const cur = state.actions.current;
    const elapsed = cur?.kind === 'exploreTravel' ? cur.elapsed : 0;
    cancelAll(state);
    run.interrupted = null;
    run.phase = 'travelBack';
    enqueueTravel(state, run, 'back', Math.max(60, Math.round(elapsed)));
    toast(t('You turn back.', '你掉头回家。'));
    return { ok: true };
  }
  const def = SITE_BY_ID[run.site];
  for (const z of run.zombies) {
    if (z.human && z.stance !== 'hostile') continue;
    if (manhattan(z, state.player) <= 1 && xr(state) < 0.5) zombieHit(state, run, def, z, { parting: true });
    if (state.phase === 'dead') return { ok: false, reason: 'dead' };
  }
  cancelAll(state);
  run.interrupted = null;
  run.phase = 'travelBack';
  run.resting = false;
  state.player.sleeping = false;
  enqueueTravel(state, run, 'back', run.travelSec);
  return { ok: true };
}

function returnHome(state) {
  const ex = exploreState(state);
  const run = ex.run;
  if (!run) return;
  const def = SITE_BY_ID[run.site];
  claimStoryItems(state);
  const reached = run.arrivedAt != null;
  if (reached) {
    const c = state.progress.counters;
    c['explore.total'] = (c['explore.total'] || 0) + 1;
    if (run.site === 'supermarket' && run.searched > 0) c.marketLoot = (c.marketLoot || 0) + 1;
    ex.outings += 1;
    ex.visits[run.site] = (ex.visits[run.site] || 0) + 1;
    ex.depletion[run.site] = Math.min(0.6, (ex.depletion[run.site] || 0) + 0.08 + 0.2 * (run.searched / Math.max(1, run.total)));
    addProfExp(state, 'explore', 15 + 10 * def.tier);
  }
  const floorId = siteFloorId(run.site);
  const siteBoxes = (state.floorBoxes || []).filter((b) => b.floor === floorId);
  const rescued = [];
  for (const invId of [...run.fixtures.map((fx) => fx.inv), ...siteBoxes.map((b) => b.inv)]) {
    const inv = invId && state.inventories[invId];
    if (!inv) continue;
    for (const it of [...inv.items]) if (STORY_ITEMS.includes(it.id)) rescued.push(removeUid(inv, it.uid));
    destroyInventory(state, invId);
  }
  state.floorBoxes = (state.floorBoxes || []).filter((b) => b.floor !== floorId);
  const summary = { site: run.site, reached, searched: run.searched, total: run.total, items: run.found.slice(), kills: run.kills, forced: run.forced, at: state.clock.t };
  ex.run = null;
  ex.last = summary;
  const p = state.player;
  p.scene = 'home';
  p.sleeping = false;
  p.path = [];
  const door = frontDoor(state);
  if (door) {
    p.floor = door.floor;
    [p.x, p.y] = interactionTile(state, door, null);
  } else {
    const spawn = homeDef(state.home.id).spawn;
    p.floor = spawn.floor;
    p.x = spawn.x;
    p.y = spawn.y;
  }
  p.px = p.x;
  p.py = p.y;
  state.ui.viewFloor = p.floor;
  // story items are never lost at a site: the survivor pockets them on the way out
  const bp = state.inventories[p.backpack];
  for (const inst of rescued) {
    if (!insert(bp, inst, { allowOverweight: true })) dropToFloor(state, inst, p.floor, p.x, p.y);
    if (!ex.claimed[inst.id]) {
      ex.claimed[inst.id] = true;
      onClaim(state, inst.id);
    }
  }
  for (const id of run.storyRolled) if (!ex.claimed[id]) delete ex.found[id];
  if (reached) {
    const n = summary.items.length;
    toast(t(`Back home from the ${pickLang(def.name)} with ${n} ${n === 1 ? 'find' : 'finds'}.`, `从${pickLang(def.name)}回到家，带回${n}件物资。`), 'good');
  }
  emit('exploreEnded', summary);
}

// ------------------------------------------------------------------------------------------ zombies
function shuffled(state, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(xr(state) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Place a zombie at (x, y) or the nearest free walkable tile around it.
export function spawnZombie(state, x, y, { big, mode = 'wander' } = {}) {
  const run = exploreRun(state);
  if (!run) return null;
  const def = SITE_BY_ID[run.site];
  const { floor } = siteLayout(run.site);
  const blocked = blockedSet(run);
  const taken = new Set(run.zombies.map((z) => cellKey(z.x, z.y)));
  taken.add(cellKey(state.player.x, state.player.y));
  let spot = null;
  for (let r = 0; r <= 3 && !spot; r++) {
    for (let oy = -r; oy <= r && !spot; oy++) {
      for (let ox = -r; ox <= r && !spot; ox++) {
        if (Math.abs(ox) + Math.abs(oy) !== r) continue;
        const nx = x + ox;
        const ny = y + oy;
        if (walkable(floor, blocked, nx, ny) && !taken.has(cellKey(nx, ny))) spot = [nx, ny];
      }
    }
  }
  if (!spot) return null;
  const mods = getMods(state);
  const isBig = big ?? xr(state) < def.bigChance;
  const maxHp = Math.round((isBig ? 160 : 60) * (mods.zombieHp || 1));
  const z = { id: `z${++run.zid}`, x: spot[0], y: spot[1], hp: maxHp, maxHp, big: isBig, mode, mt: xr(state) * 20, at: 0, adj: false, lost: 0 };
  run.zombies.push(z);
  return z;
}

function maybeRaiders(state, run, spots) {
  const odds = RAIDERS[run.site];
  if (!odds || dayNumber(state.clock) < odds[0] || !spots.length) return;
  if (xr(state) >= odds[1] * (getMods(state).raiderChance ?? 1)) return;
  const n = xr(state) < 0.35 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const [x, y] = spots[spots.length - 1 - (i % spots.length)];
    spawnRaider(state, x, y);
  }
}

export function spawnRaider(state, x, y) {
  const z = spawnZombie(state, x, y, { big: false });
  if (!z) return null;
  const hp = Math.round(RAIDER.hp * (getMods(state).zombieHp || 1));
  Object.assign(z, { human: true, stance: 'calm', hp, maxHp: hp });
  return z;
}

// Calm raiders walk up to talk; after the standoff they either leave or fight. True when handled.
function raiderTick(state, run, def, z, dt) {
  if (z.stance === 'leaving') {
    z.leave = (z.leave || 0) + dt;
    if (z.leave >= RAIDER.leaveSec) run.zombies = run.zombies.filter((o) => o !== z);
    return true;
  }
  if (z.stance === 'standoff') return true;
  if (manhattan(z, state.player) > 1) return false;
  if (z.stance === 'calm') {
    startStandoff(state, run, z);
    return true;
  }
  if (!z.adj) {
    z.adj = true;
    z.at = RAIDER.sec / 2;
  }
  autoDefend(state, z);
  z.at += dt;
  while (z.at >= RAIDER.sec) {
    z.at -= RAIDER.sec;
    raiderHit(state, run, def, z);
    if (state.phase === 'dead') return true;
  }
  return true;
}

function startStandoff(state, run, z) {
  for (const o of run.zombies) if (o.human && o.stance === 'calm') o.stance = 'standoff';
  run.standoff = z.id;
  run.resting = false;
  state.player.sleeping = false;
  cancelAll(state);
  const c = state.progress.counters;
  c['raider.met'] = (c['raider.met'] || 0) + 1;
  toast(t('Armed survivors block your way.', '几个带着武器的幸存者拦住了你。'), 'bad');
  emit('openPanel', { panel: 'raiders' });
}

function raiderHit(state, run, def, z) {
  const dmg = Math.round(RAIDER.hit * def.danger * 10) / 10;
  addStat(state, 'life', -dmg, 'raider');
  run.hits += 1;
  if (xr(state) < 0.3) addEffect(state, 'bleeding', 12);
  const cur = state.actions.current;
  if (cur && INTERRUPTIBLE.has(cur.kind)) {
    cancelCurrent(state);
    run.resting = false;
  }
  emit('exploreHit', { site: run.site, dmg, raider: true });
  if (state.player.stats.life <= 0) die(state, 'exploration');
  else autoDefend(state, z);
}

// What they take when you pay: about a third of the backpack, medicine and food first.
export function raiderTribute(state) {
  const bp = state.inventories[state.player.backpack];
  const worth = (cfg) => (cfg.cat === CAT.MEDICINE ? 3 : cfg.cat === CAT.FOOD ? 2 : 1);
  const goods = (bp?.items || []).map((it) => ({ it, cfg: item(it.id) })).filter((g) => g.cfg && !STORY_ITEMS.includes(g.it.id));
  goods.sort((a, b) => worth(b.cfg) - worth(a.cfg));
  return goods.slice(0, Math.max(1, Math.ceil(goods.length / 3))).map((g) => g.it);
}

export function raiderTalkChance(state) {
  const morale = state.player.stats.mor ?? 50;
  return Math.max(0.15, Math.min(0.85, 0.3 + morale / 250 + 0.05 * profLevel(state, 'explore')));
}

export function standoffView(state) {
  const run = exploreRun(state);
  if (!run?.standoff) return null;
  const group = run.zombies.filter((z) => z.human && z.stance === 'standoff');
  return { count: group.length, tribute: raiderTribute(state).map((it) => it.id), talk: raiderTalkChance(state) };
}

// choice: 'give' | 'talk' | 'fight'. Returns { ok, result: 'paid' | 'talked' | 'fight', taken }.
export function resolveStandoff(state, choice) {
  const run = exploreRun(state);
  if (!run?.standoff) return { ok: false };
  const group = run.zombies.filter((z) => z.human && z.stance === 'standoff');
  run.standoff = null;
  const c = state.progress.counters;
  const leave = () => {
    for (const z of group) {
      z.stance = 'leaving';
      z.leave = 0;
    }
  };
  const fight = () => {
    for (const z of group) Object.assign(z, { stance: 'hostile', mode: 'chase', lost: 0, adj: false, at: 0 });
  };
  if (choice === 'give') {
    const offer = raiderTribute(state);
    if (!offer.length) {
      fight();
      toast(t('Empty-handed? They do not take that well.', '两手空空？他们可不吃这一套。'), 'bad');
      return { ok: true, result: 'fight', taken: [] };
    }
    const bp = state.inventories[state.player.backpack];
    for (const it of offer) removeUid(bp, it.uid);
    c['raider.paid'] = (c['raider.paid'] || 0) + 1;
    leave();
    toast(t(`They take ${offer.map((it) => itemName(it.id)).join(', ')} and melt back into the ruins.`, `他们拿走了${offer.map((it) => itemName(it.id)).join('、')}，消失在废墟里。`));
    return { ok: true, result: 'paid', taken: offer.map((it) => it.id) };
  }
  if (choice === 'talk' && xr(state) < raiderTalkChance(state)) {
    c['raider.talked'] = (c['raider.talked'] || 0) + 1;
    leave();
    addStat(state, 'mor', 3, 'raider');
    toast(t('You talk them down. They let you be — this time.', '你说服了他们。这次他们放过了你。'), 'good');
    return { ok: true, result: 'talked', taken: [] };
  }
  fight();
  addExposure(state, run, 10);
  toast(choice === 'talk' ? t('Talks break down — they come at you!', '谈崩了——他们冲了上来！') : t('You go for them first.', '你先动了手。'), 'bad');
  const target = group.find((z) => manhattan(z, state.player) <= 1);
  if (target) autoDefend(state, target);
  return { ok: true, result: 'fight', taken: [] };
}

function killRaider(state) {
  const c = state.progress.counters;
  c['raider.kill'] = (c['raider.kill'] || 0) + 1;
  addProfExp(state, 'explore', 15);
  addStat(state, 'mor', -4, 'raider');
  const n = 2 + Math.floor(xr(state) * 3);
  const bp = state.inventories[state.player.backpack];
  const got = [];
  for (let i = 0; i < n; i++) {
    const id = rollFrom(state, 'raider');
    const cfg = id && item(id);
    if (!cfg) continue;
    if (insert(bp, makeInstance(state, id, { age: spawnAge(state, cfg) }))) {
      got.push(id);
      emit('gotItem', { id });
    }
  }
  toast(t(`The raider goes down.${got.length ? ` You take ${got.map((id) => itemName(id)).join(', ')}.` : ''}`, `劫匪倒下了。${got.length ? `你拿走了${got.map((id) => itemName(id)).join('、')}。` : ''}`), 'bad');
}

// Tin-Can Noisemaker (20340, "very effective at luring zombies away"): thrown into the far corner of the
// site, it pulls the dead nearby toward the noise for a couple of minutes and lets the exposure settle.
export const NOISEMAKER = 20340;
const LURE = { radius: 9, sec: 150, exposure: 15 };

export function canThrowLure(state) {
  const run = exploreRun(state);
  if (!run || run.phase !== 'site') return t('You are not at a site.', '你不在探索点。');
  return hasTool(state, NOISEMAKER) ? true : t('You have no noisemaker.', '你没有易拉罐响器。');
}

export function throwLure(state) {
  const why = canThrowLure(state);
  if (why !== true) return { ok: false, reason: why };
  const run = exploreRun(state);
  const p = state.player;
  const spots = siteLayout(run.site).spawns;
  const [x, y] = spots.reduce((best, s) => (manhattan({ x: s[0], y: s[1] }, p) > manhattan({ x: best[0], y: best[1] }, p) ? s : best), spots[0]);
  takeFrom(state, [p.backpack], NOISEMAKER, 1);
  run.lure = { x, y, until: state.clock.t + LURE.sec };
  let n = 0;
  for (const z of run.zombies) {
    if (z.human || manhattan(z, p) > LURE.radius) continue;
    Object.assign(z, { mode: 'lured', lost: 0, adj: false, at: 0 });
    n += 1;
  }
  addExposure(state, run, -LURE.exposure);
  const c = state.progress.counters;
  c['explore.lure'] = (c['explore.lure'] || 0) + 1;
  toast(n ? t(`The can rattles off into the dark — ${n} of them shamble after it.`, `易拉罐叮叮当当滚进黑暗里——${n}只丧尸跟了过去。`) : t('The can rattles off into the dark.', '易拉罐叮叮当当滚进了黑暗里。'), 'good');
  return { ok: true, drawn: n };
}

function surge(state, run, n) {
  const p = state.player;
  const layout = siteLayout(run.site);
  const far = layout.spawns.slice().sort((a, b) => Math.abs(b[0] - p.x) + Math.abs(b[1] - p.y) - (Math.abs(a[0] - p.x) + Math.abs(a[1] - p.y)));
  const spots = far.length ? far : [layout.entry];
  for (let i = 0; i < n; i++) {
    const [x, y] = spots[i % Math.min(3, spots.length)];
    spawnZombie(state, x, y, { mode: 'chase' });
  }
  run.lastSurge = state.clock.t;
}

function sightRadius(state, run, def) {
  let s = def.dark ? 3 : 5;
  if (!def.dark && isNight(state.clock)) s -= 1;
  if (run.resting) s -= 1;
  return Math.max(1, s + Math.floor(run.exposure / 25));
}

function alertZombies(state, run, radius) {
  for (const z of run.zombies) {
    if (manhattan(z, state.player) <= radius) {
      z.mode = 'chase';
      z.lost = 0;
    }
  }
}

function zombieHit(state, run, def, z, { parting = false } = {}) {
  const mods = getMods(state);
  const dmg = Math.round((z.big ? 12 : 6) * def.danger * (mods.zombieHp || 1) * 10) / 10;
  addStat(state, 'life', -dmg, 'zombie');
  run.hits += 1;
  state.progress.counters['explore.hurt'] = (state.progress.counters['explore.hurt'] || 0) + 1;
  if (xr(state) < (z.big ? 0.35 : 0.2)) addEffect(state, 'bleeding', 12);
  if (z.big && xr(state) < 0.08) addEffect(state, 'shock', 12);
  const cur = state.actions.current;
  if (!parting && cur && INTERRUPTIBLE.has(cur.kind)) {
    cancelCurrent(state);
    run.resting = false;
    toast(t('A zombie grabs you — you drop what you were doing!', '丧尸扑了上来，你手上的事被打断了！'), 'bad');
  }
  emit('exploreHit', { site: run.site, dmg, big: z.big });
  if (state.player.stats.life <= 0) die(state, 'exploration');
  else if (!parting) autoDefend(state, z);
}

// An idle survivor shoves back instead of standing there.
function autoDefend(state, z) {
  if (state.actions.current || state.actions.queue.length) return;
  enqueue(state, { kind: 'exploreFight', label: t('Fight back', '反击'), zombie: z.id, dur: 20, cost: { sta: 4 }, noWalk: true, auto: true });
}

// One step down the distance field; `away` (the survivor's distance field) breaks ties toward the step farther from
// the survivor, so a zombie drawn off by a lure does not brush past on its way.
function stepToward(dist, floor, z, taken, away = null) {
  const here = dist[z.y * floor.w + z.x];
  if (here < 0) return null;
  let best = null;
  for (const [ox, oy] of NEIGHBORS) {
    const nx = z.x + ox;
    const ny = z.y + oy;
    if (nx < 0 || ny < 0 || nx >= floor.w || ny >= floor.h) continue;
    const d = dist[ny * floor.w + nx];
    if (d < 0 || d >= here || taken.has(cellKey(nx, ny))) continue;
    const far = away ? away[ny * floor.w + nx] : 0;
    if (!best || d < best.d || (d === best.d && far > best.far)) best = { x: nx, y: ny, d, far };
  }
  return best;
}

function wanderStep(state, floor, blocked, z, taken) {
  if (xr(state) < 0.35) return null;
  const opts = NEIGHBORS.map(([ox, oy]) => ({ x: z.x + ox, y: z.y + oy })).filter((c) => walkable(floor, blocked, c.x, c.y) && !taken.has(cellKey(c.x, c.y)));
  return opts.length ? opts[Math.floor(xr(state) * opts.length)] : null;
}

function tickZombies(state, run, def, dt) {
  const p = state.player;
  const { floor } = siteLayout(run.site);
  const blocked = blockedSet(run);
  const dist = distanceField(floor, blocked, p.x, p.y);
  const taken = new Set(run.zombies.map((z) => cellKey(z.x, z.y)));
  taken.add(cellKey(p.x, p.y));
  const sight = sightRadius(state, run, def);
  const lure = run.lure && state.clock.t < run.lure.until ? run.lure : null;
  const lureDist = lure && run.zombies.some((z) => z.mode === 'lured') ? distanceField(floor, blocked, lure.x, lure.y) : null;
  for (const z of [...run.zombies]) {
    if (z.human && raiderTick(state, run, def, z, dt)) {
      if (state.phase === 'dead') return;
      continue;
    }
    if (z.mode === 'lured') {
      if (!lure) z.mode = 'wander';
      else if (manhattan(z, p) > 1) {
        z.mt += dt;
        while (z.mt >= 15) {
          z.mt -= 15;
          taken.delete(cellKey(z.x, z.y));
          const next = stepToward(lureDist, floor, z, taken, dist);
          if (next) {
            z.x = next.x;
            z.y = next.y;
          }
          taken.add(cellKey(z.x, z.y));
        }
        continue;
      }
    }
    const d = dist[z.y * floor.w + z.x];
    if (d >= 0 && d <= sight) {
      z.mode = 'chase';
      z.lost = 0;
    } else if (z.mode === 'chase') {
      z.lost += dt;
      if (z.lost > 90 || d < 0) z.mode = 'wander';
    }
    if (manhattan(z, p) <= 1) {
      const period = z.big ? BITE_SEC.big : BITE_SEC.normal;
      if (!z.adj) {
        z.adj = true;
        z.at = period / 2; // the lunge: first bite comes quicker than the rest
      }
      autoDefend(state, z);
      z.at += dt;
      while (z.at >= period) {
        z.at -= period;
        zombieHit(state, run, def, z);
        if (state.phase === 'dead') return;
      }
      continue;
    }
    z.adj = false;
    z.at = 0;
    const interval = z.mode === 'chase' ? (z.big ? 20 : 15) : 30;
    z.mt += dt;
    while (z.mt >= interval) {
      z.mt -= interval;
      taken.delete(cellKey(z.x, z.y));
      const next = z.mode === 'chase' ? stepToward(dist, floor, z, taken) : wanderStep(state, floor, blocked, z, taken);
      if (next) {
        z.x = next.x;
        z.y = next.y;
      }
      taken.add(cellKey(z.x, z.y));
      if (manhattan(z, p) <= 1) break;
    }
  }
}

function killZombie(state, run, z) {
  run.zombies = run.zombies.filter((o) => o !== z);
  if (z.human) return killRaider(state);
  run.kills += 1;
  const c = state.progress.counters;
  c['zombie.kill'] = (c['zombie.kill'] || 0) + 1;
  state.progress.kills = (state.progress.kills || 0) + 1;
  addProfExp(state, 'explore', 5);
  emit('zombieKilled', { where: 'explore', site: run.site, big: z.big, counted: true });
}

// ------------------------------------------------------------------------------------------ exposure
function addExposure(state, run, amount) {
  run.exposure = Math.max(0, Math.min(100, run.exposure + amount));
  for (const [at, n] of EXPOSURE_SURGES) {
    if (run.exposure >= at && !run.surges[at]) {
      run.surges[at] = true;
      surge(state, run, n);
      toast(
        at >= 100
          ? t('The noise has drawn a swarm. Get out!', '动静太大，尸群围过来了，快撤！')
          : t('Something heard you. More of them are shuffling closer.', '有东西听到了动静，更多丧尸正在靠近。'),
        'bad'
      );
    } else if (run.exposure < at - 25) {
      run.surges[at] = false;
    }
  }
}

function noiseFor(fx, mode, def) {
  const base = 7 + fx.w * fx.h;
  const lock = mode === 'pry' ? 18 : mode === 'pick' ? 4 : 0;
  return (base + lock) * (def.dark ? 1.1 : 1);
}

// ------------------------------------------------------------------------------------------ searching
function hasTool(state, id) {
  return countIn(state, [state.player.backpack], id) > 0;
}

function isLocked(fx) {
  return !!fx.lock && !fx.unlocked;
}

// A loose find takes the minutes of its 拾取 function (1765: 2), not a container's search.
const PICKUP_MIN = 2;
function searchSeconds(state, fx, mode) {
  let min = fx.kind === 'loose' ? PICKUP_MIN : SEARCH_MIN[fx.w * fx.h] ?? 22;
  if (isLocked(fx)) min += LOCK_EXTRA_MIN[mode] || 0;
  min = (min / (getMods(state).searchSpeed || 1)) * (1 - 0.06 * profLevel(state, 'explore'));
  return Math.round(min * 60);
}

// Config_FurnitureFunc previews, whatever the container's size: 1101 取出物资 / 1726 搜寻 "Stamina:-5", 1502 / 1832–1838
// 解锁 "Stamina:-15", 1501 强行撬开 "Stamina:-25" (the other 撬开 functions preview no cost).
export const SEARCH_STA = { search: 5, pick: 15, pry: 25 };
// 1729 / 1733 搬走 "Satiety:-15;Stamina:-25".
export const CLEAR_COST = { sat: 15, sta: 25 };

function searchStamina(fx, mode, locked) {
  return locked ? SEARCH_STA[mode === 'pry' ? 'pry' : 'pick'] : SEARCH_STA.search;
}

function findFixture(run, fid) {
  return run?.fixtures.find((f) => f.id === fid) || null;
}

function leftovers(state, fx) {
  const inv = fx.inv && state.inventories[fx.inv];
  return inv ? inv.items.length : 0;
}

// Why a container cannot be searched with `mode` right now (true when it can).
export function canSearch(state, fid, mode = 'search') {
  const run = exploreRun(state);
  if (!run || run.phase !== 'site') return t('You are not at a site.', '你不在探索点。');
  const fx = findFixture(run, fid);
  if (!fx || !SEARCHABLE.has(fx.kind)) return t('Nothing to search.', '没什么可搜的。');
  if (fx.searched) return t('Already searched.', '已经搜过了。');
  if (!isLocked(fx)) return true;
  if (mode === 'pry') return hasTool(state, ITEM.crowbar) ? true : t('Needs a crowbar.', '需要撬棍。');
  if (mode === 'pick') {
    if (fx.lock !== 'pick') return t('This one has to be pried open.', '这个只能撬开。');
    return hasTool(state, ITEM.lockpick) ? true : t('Needs a lockpick.', '需要开锁器。');
  }
  return fx.lock === 'pick' ? t('Locked — needs a lockpick or a crowbar.', '上锁了——需要开锁器或撬棍。') : t('Locked — needs a crowbar.', '上锁了——需要撬棍。');
}

// Options for a fixture: [{ mode, label, enabled, reason, sec, sta }]
export function fixtureOptions(state, fid) {
  const run = exploreRun(state);
  const fx = findFixture(run, fid);
  if (!fx || run.phase !== 'site') return [];
  const opt = (mode, label, sec = 0, sta = 0) => {
    const why = mode === 'search' || mode === 'pry' || mode === 'pick' ? canSearch(state, fid, mode) : true;
    return { mode, label, enabled: why === true, reason: why === true ? '' : why, sec, sta };
  };
  if (fx.kind === 'block') {
    if (fx.cleared) return [];
    return [opt('clear', t('Push it aside', '搬走'), clearSeconds(state), CLEAR_COST.sta)];
  }
  if (fx.kind === 'rest') return [opt('rest', t('Rest a while', '休息一会'), REST_MIN * 60, 0)];
  if (fx.kind === 'scrap') {
    if (fx.cleared) return [];
    const spec = recycleSpec(fx);
    return [opt('clear', t('Take apart', '拆解回收'), recycleSeconds(state, spec), spec.cost?.sta || 0)];
  }
  if (!SEARCHABLE.has(fx.kind)) return [];
  if (fx.searched) {
    const n = leftovers(state, fx);
    return n ? [opt('take', t(`Take what is left (${n})`, `拿走剩下的（${n}）`))] : [];
  }
  if (fx.kind === 'loose') return [opt('search', t('Pick up', '拾取'), searchSeconds(state, fx, 'search'), 0)];
  if (!isLocked(fx)) return [opt('search', t('Search', '搜寻'), searchSeconds(state, fx, 'search'), searchStamina(fx, 'search', false))];
  const out = [];
  if (fx.lock === 'pick') out.push(opt('pick', t('Unlock with a lockpick', '用开锁器解锁'), searchSeconds(state, fx, 'pick'), searchStamina(fx, 'pick', true)));
  out.push(opt('pry', t('Pry open with a crowbar', '用撬棍撬开'), searchSeconds(state, fx, 'pry'), searchStamina(fx, 'pry', true)));
  return out;
}

function clearSeconds(state) {
  return Math.round((CLEAR_MIN * 60) / (1 + 0.1 * profLevel(state, 'explore')));
}

// Scrap (a dead monitor, a printer, an ATM) is taken apart the way its config function 回收 says: its RemoveGet
// materials, all of them with pliers in the backpack, else the first and about half of the rest (as at home).
const PLIERS = 20350;
function recycleSpec(fx) {
  const k = fixtureFunc(fx.cfg, 'clear');
  const spec = k != null ? FUNC_SPECS[k] : null;
  return spec?.kind === 'recycle' ? spec : { kind: 'recycle', min: 20, cost: { sta: 10 }, partial: true };
}

function recycleSeconds(state, spec) {
  const quick = hasTool(state, PLIERS) ? 0.5 : 1;
  return Math.round((spec.min * 60 * quick) / (1 + 0.1 * profLevel(state, 'explore')));
}

function takeApart(state, run, fx) {
  const spec = recycleSpec(fx);
  const whole = !spec.partial || hasTool(state, PLIERS);
  const mats = (furn(fx.cfg)?.rmGet || []).filter((id, i) => item(id) && (whole || i === 0 || xr(state) < 0.5));
  const { taken, left } = deliver(state, fx, mats);
  run.found.push(...taken);
  const names = mats.map((id) => itemName(id)).join(pickLang({ en: ', ', zh: '、' }));
  if (!mats.length) toast(t(`${fixtureName(fx)}: nothing worth keeping.`, `${fixtureName(fx)}：没什么值得留下的。`));
  else toast(`${fixtureName(fx)}: ${names}${left.length ? t(` (${left.length} left behind — backpack full)`, `（背包满了，丢下${left.length}件）`) : ''}`, 'good');
  emit('exploreSearched', { site: run.site, fixture: fx.id, items: mats, taken, left, stash: false });
}

function storyCondition(state, cond) {
  if (!cond) return true;
  const student = state.meta.character === 'student';
  if (cond === 'student') return student;
  if (cond === 'studentMidgame') return student && (dayNumber(state.clock) >= 25 || !!state.story?.quests?.secondDrone);
  return false;
}

function weightedPick(state, entries) {
  let total = 0;
  for (const [, w] of entries) total += w;
  let r = xr(state) * total;
  for (const [v, w] of entries) {
    r -= w;
    if (r < 0) return v;
  }
  return entries[entries.length - 1]?.[0];
}

function rollFrom(state, tableKey) {
  const fresh = dayNumber(state.clock) <= FRESH_DAYS;
  const entries = (LOOT_TABLES[tableKey] || []).filter(([pool]) => LOOT_POOLS[pool]?.length && (pool !== 'fresh' || fresh));
  if (!entries.length) return null;
  const ids = LOOT_POOLS[weightedPick(state, entries)];
  return ids[Math.floor(xr(state) * ids.length)];
}

function stochasticRound(state, v) {
  const n = Math.floor(v);
  return n + (xr(state) < v - n ? 1 : 0);
}

function rollLoot(state, def, fx) {
  const mods = getMods(state);
  const prof = profLevel(state, 'explore');
  const depleted = 1 - (exploreState(state).depletion[def.id] || 0);
  const factor = def.richness * (mods.supply || 1) * (mods.lootMult || 1) * (1 + 0.05 * prof) * depleted;
  const out = [];
  const n = stochasticRound(state, fx.rolls * factor);
  for (let i = 0; i < n; i++) {
    const id = rollFrom(state, fx.loot);
    if (id) out.push(id);
  }
  let stash = false;
  if (fx.hidden && (mods.highlightLoot || xr(state) < 0.35 + 0.1 * prof)) {
    stash = true;
    const extra = 1 + (xr(state) < 0.5 ? 1 : 0);
    for (let i = 0; i < extra; i++) {
      const id = rollFrom(state, 'stash');
      if (id) out.push(id);
    }
  }
  return { ids: out, stash };
}

function unlockRecipe(state, id) {
  const list = (state.run.unlockedRecipes ||= []);
  if (list.includes(id)) return;
  list.push(id);
  emit('recipeUnlocked', { id, source: 'explore' });
  const name = loc(craft(id)?.zh);
  toast(t(`Among the papers: blueprints for a ${name}. Recipe learned!`, `文件堆里夹着${name}的图纸，学会了新配方！`), 'good');
}

function specialFinds(state, run, def, fx) {
  const ex = exploreState(state);
  const spec = siteLayout(def.id).byId[fx.id];
  const out = [];
  for (const s of spec?.story || []) {
    if (ex.found[s.item] || ex.claimed[s.item] || !storyCondition(state, s.cond)) continue;
    ex.found[s.item] = true;
    run.storyRolled.push(s.item);
    out.push(s.item);
  }
  if (spec?.recipe) {
    unlockRecipe(state, spec.recipe);
  }
  if (def.lore && (!def.loreIn || def.loreIn.includes(fx.letter))) {
    const next = def.lore.find((id) => !ex.found[id]);
    if (next && xr(state) < LORE_CHANCE) {
      ex.found[next] = true;
      out.push(next);
    }
  }
  return out;
}

// Scavenged food has sat at room temperature since the outbreak, but never arrives already spoiled.
function spawnAge(state, cfg) {
  if (!(cfg.life > 0)) return 0;
  const days = Math.max(0, dayNumber(state.clock) - 1);
  const age = cfg.life <= 14 ? cfg.life * (0.25 + 0.45 * xr(state)) : Math.min(cfg.life * 0.7, days * (0.5 + 0.5 * xr(state)));
  return Math.round(age * 10) / 10;
}

function containerInv(state, fx) {
  if (!fx.inv || !state.inventories[fx.inv]) fx.inv = createInventory(state, { kind: 'loot', w: 6, h: 4, label: 'explore' }).id;
  return state.inventories[fx.inv];
}

// Loot goes into the backpack while grid space and the carry limit allow; the rest stays in the container.
function deliver(state, fx, ids) {
  const bp = state.inventories[state.player.backpack];
  const taken = [];
  const left = [];
  for (const id of ids) {
    const cfg = item(id);
    if (!cfg) continue;
    const inst = makeInstance(state, id, { age: spawnAge(state, cfg) });
    if (insert(bp, inst)) {
      taken.push(id);
      emit('gotItem', { id });
      continue;
    }
    const inv = containerInv(state, fx);
    while (!insert(inv, inst, { allowOverweight: true })) inv.h += 2;
    left.push(id);
  }
  return { taken, left };
}

function performSearch(state, fid, mode, { noiseApplied = false, opened = false } = {}) {
  const run = exploreRun(state);
  const def = SITE_BY_ID[run.site];
  const fx = findFixture(run, fid);
  // opened: the lock was opened with `mode` by the action just before (a piece whose look is its own function)
  const locked = isLocked(fx) || opened;
  if (isLocked(fx)) openLock(state, fx, mode);
  const { ids, stash } = rollLoot(state, def, fx);
  const all = [...ids, ...specialFinds(state, run, def, fx)];
  const { taken, left } = deliver(state, fx, all);
  fx.searched = true;
  fx.hiddenFound = stash;
  run.searched += 1;
  run.found.push(...taken);
  if (!noiseApplied) addExposure(state, run, noiseFor(fx, mode, def));
  alertZombies(state, run, (mode === 'pry' ? 7 : 4) + Math.floor(run.exposure / 20));
  addProfExp(state, 'explore', 6 + (locked ? 6 : 0) + (stash ? 4 : 0));
  state.progress.counters['explore.search'] = (state.progress.counters['explore.search'] || 0) + 1;
  claimStoryItems(state);
  const names = all.map((id) => itemName(id));
  if (!all.length) toast(t(`${fixtureName(fx)}: nothing useful.`, `${fixtureName(fx)}：没找到有用的东西。`));
  else toast(`${stash ? '❗ ' : ''}${fixtureName(fx)}: ${names.join(', ')}${left.length ? t(` (${left.length} left — backpack full)`, `（背包满了，还剩${left.length}件）`) : ''}`, 'good');
  emit('exploreSearched', { site: run.site, fixture: fid, items: all, taken, left, stash });
  return { ok: true, items: all, taken, left, stash };
}

function openLock(state, fx, mode) {
  takeFrom(state, [state.player.backpack], mode === 'pick' ? ITEM.lockpick : ITEM.crowbar, 1);
  fx.unlocked = true;
}

// Instant search (tests, debugging): same rules as the action, costs applied immediately.
export function searchContainer(state, fid, { mode } = {}) {
  const run = exploreRun(state);
  const fx = findFixture(run, fid);
  const m = mode || (fx && isLocked(fx) ? (fx.lock === 'pick' && hasTool(state, ITEM.lockpick) ? 'pick' : 'pry') : 'search');
  const why = canSearch(state, fid, m);
  if (why !== true) return { ok: false, reason: why, items: [], taken: [], left: [] };
  addStat(state, 'sta', -searchStamina(fx, m, isLocked(fx)) * getMods(state).staCost, 'explore');
  return performSearch(state, fid, m);
}

// Story items count once they are actually in the backpack (clues, the recorder, the truck note, the drone).
export function claimStoryItems(state) {
  const ex = state.explore;
  if (!ex) return;
  for (const id of STORY_ITEMS) {
    if (ex.claimed[id] || countIn(state, [state.player.backpack], id) === 0) continue;
    ex.claimed[id] = true;
    onClaim(state, id);
  }
}

function onClaim(state, id) {
  const tags = state.story.tags;
  emit('storyItemClaimed', { state, id });
  if (id === ITEM.wmNote) tags.wmTruckNote = true;
  const claimed = state.explore.claimed;
  if (!tags.truthExplored && claimed[ITEM.recorder] && HOSPITAL_CLUES.every((cid) => claimed[cid])) {
    tags.truthExplored = true;
    emit('story', { id: 'truthExplored' });
  }
  const msg = {
    [ITEM.recorder]: t('An old recorder — battered, but it still works. Worth bringing home.', '一台老式记录仪，磕得坑坑洼洼，但还能用。带回去吧。'),
    [ITEM.wmNote]: t('A crumpled note in the truck cab, written by a shaking hand…', '货车驾驶室里有张皱巴巴的字条，字迹在发抖……'),
    [ITEM.teachingDrone]: t('An old teaching drone. Broken rotors, but the frame is sound — it might fly again.', '一架旧教学无人机，旋翼断了，骨架完好，修一修也许还能飞。'),
  }[id];
  toast(msg || t(`A clue: ${itemName(id)}`, `一条线索：${itemName(id)}`), 'good');
  emit('story', { id: 'exploreFind', item: id });
}

// ------------------------------------------------------------------------------------------ queueing
function queueAt(state, fid, spec, opts) {
  const tile = approachTile(state, fid);
  if (!tile) {
    toast(t('You cannot reach that.', '过不去。'), 'bad');
    return null;
  }
  return enqueue(state, { ...spec, fixture: fid, target: { x: tile.x, y: tile.y, floor: state.player.floor } }, opts);
}

export function queueFixture(state, fid, mode, opts = {}) {
  const run = exploreRun(state);
  const fx = findFixture(run, fid);
  if (!fx || run.phase !== 'site') return null;
  const option = fixtureOptions(state, fid).find((o) => o.mode === mode);
  if (!option) return null;
  if (!option.enabled) {
    toast(option.reason, 'bad');
    return null;
  }
  const name = fixtureName(fx);
  // the piece's config function this interaction runs (Config_FurnitureFunc), carried as the action's funcKey
  const funcKey = fixtureFunc(fx.cfg, mode);
  if (mode === 'clear' && fx.kind === 'scrap') return queueAt(state, fid, { kind: 'exploreClear', label: `${option.label}: ${name}`, dur: option.sec, cost: { ...(recycleSpec(fx).cost || {}) }, noise: 4, funcKey }, opts);
  if (mode === 'clear') return queueAt(state, fid, { kind: 'exploreClear', label: `${option.label}: ${name}`, dur: option.sec, cost: { ...CLEAR_COST }, noise: 10, funcKey }, opts);
  if (mode === 'rest') return queueAt(state, fid, { kind: 'exploreRest', label: option.label, dur: option.sec, funcKey }, opts);
  if (mode === 'take') return queueAt(state, fid, { kind: 'exploreOpen', label: option.label, dur: 0, funcKey }, opts);
  const def = SITE_BY_ID[run.site];
  return queueAt(state, fid, { kind: 'exploreSearch', label: `${option.label}: ${name}`, mode, dur: option.sec, cost: { sta: option.sta }, noise: noiseFor(fx, mode, def), funcKey }, opts);
}

// The first thing worth doing with a fixture (E key / plain click).
export function queueDefault(state, fid, opts = {}) {
  const options = fixtureOptions(state, fid);
  const pick = options.find((o) => o.enabled) || options[0];
  if (!pick) return null;
  return queueFixture(state, fid, pick.mode, opts);
}

export function queueFight(state, zid, opts = {}) {
  const run = exploreRun(state);
  const z = run?.zombies.find((o) => o.id === zid);
  if (!z || run.phase !== 'site') return null;
  const p = state.player;
  const spec = { kind: 'exploreFight', label: t('Fight back', '反击'), zombie: zid, dur: 20, cost: { sta: 4 } };
  if (manhattan(z, p) <= 1) return enqueue(state, { ...spec, noWalk: true }, opts);
  const { floor } = siteLayout(run.site);
  const blocked = blockedSet(run);
  const dist = distanceField(floor, blocked, p.x, p.y);
  let best = null;
  for (const [ox, oy] of NEIGHBORS) {
    const x = z.x + ox;
    const y = z.y + oy;
    const d = walkable(floor, blocked, x, y) ? dist[y * floor.w + x] : -1;
    if (d >= 0 && (!best || d < best.d)) best = { x, y, d };
  }
  if (!best) return null;
  return enqueue(state, { ...spec, target: { x: best.x, y: best.y, floor: p.floor } }, opts);
}

export function adjacentZombie(state) {
  const run = exploreRun(state);
  if (!run || run.phase !== 'site') return null;
  return run.zombies.find((z) => manhattan(z, state.player) <= 1) || null;
}

// Nearest fixture with something to do (unsearched first), within maxSteps of walking.
export function nearestFixture(state, maxSteps = 4) {
  const run = exploreRun(state);
  if (!run || run.phase !== 'site') return null;
  const p = state.player;
  const { floor } = siteLayout(run.site);
  const dist = distanceField(floor, blockedSet(run), p.x, p.y);
  let best = null;
  for (const fx of run.fixtures) {
    const pending = SEARCHABLE.has(fx.kind) && (!fx.searched || leftovers(state, fx) > 0);
    if (!pending) continue;
    let d = -1;
    for (const [x, y] of sideTiles(fx)) {
      const v = x === p.x && y === p.y ? 0 : x >= 0 && y >= 0 && x < floor.w && y < floor.h ? dist[y * floor.w + x] : -1;
      if (v >= 0 && (d < 0 || v < d)) d = v;
    }
    if (d < 0 || d > maxSteps) continue;
    const score = d + (fx.searched ? 100 : 0);
    if (!best || score < best.score) best = { fx, score, d };
  }
  return best?.fx || null;
}

// ------------------------------------------------------------------------------------------ action kinds
registerKind('goExplore', {
  canStart(state) {
    if (state.phase !== 'post') return t('Not now.', '现在不行。');
    if (state.explore?.run) return t('You are already out.', '你已经在外面了。');
    return true;
  },
  complete(state, a) {
    const forced = !!(a.forced ?? a.spec?.forced);
    if (a.site) {
      startExploration(state, a.site, { forced });
      return;
    }
    if (forced && a.dailyKey) {
      // the door's once-a-day limit is only spent when the survivor actually leaves
      state.player.daily[a.dailyKey] = Math.max(0, (state.player.daily[a.dailyKey] || 0) - 1);
      exploreState(state).forcedKey = a.dailyKey;
    }
    emit('openPanel', { panel: 'exploreMap', forced, fromDoor: true });
  },
});

registerKind('exploreTravel', {
  canStart(state, a) {
    return state.explore?.run?.site === a.site ? true : t('No trip planned.', '没有出行计划。');
  },
  cancel(state, a) {
    const run = state.explore?.run;
    if (run) run.interrupted = { dir: a.dir, elapsed: a.elapsed, dur: a.dur };
  },
  complete(state, a) {
    if (a.dir === 'out') arrive(state);
    else returnHome(state);
  },
});

registerKind('exploreSearch', {
  canStart: (state, a) => canSearch(state, a.fixture, a.opened ? 'search' : a.mode),
  progress(state, a, dt) {
    const run = exploreRun(state);
    if (!run || !a.dur) return;
    const add = Math.min(a.noise - (a.noiseDone || 0), (a.noise * dt) / a.dur);
    if (add > 0) {
      a.noiseDone = (a.noiseDone || 0) + add;
      addExposure(state, run, add);
    }
  },
  complete(state, a) {
    const run = exploreRun(state);
    if (!run) return;
    const rest = a.noise - (a.noiseDone || 0);
    if (rest > 0) addExposure(state, run, rest);
    // A piece whose config splits opening the lock (撬开 / 解锁) from looking inside (查看): the lock opens with this
    // action, the look follows as an action of its own, carrying that function
    const fx = findFixture(run, a.fixture);
    const look = (a.mode === 'pry' || a.mode === 'pick') && fx && isLocked(fx) ? fixtureFunc(fx.cfg, 'take') : null;
    if (look != null && look !== a.funcKey) {
      openLock(state, fx, a.mode);
      enqueue(state, { kind: 'exploreSearch', label: a.label, mode: a.mode, opened: true, fixture: a.fixture, funcKey: look, dur: 0, noise: 0, noWalk: true }, { front: true });
      return;
    }
    performSearch(state, a.fixture, a.mode, { noiseApplied: true, opened: !!a.opened });
  },
});

registerKind('exploreClear', {
  canStart(state, a) {
    const fx = findFixture(exploreRun(state), a.fixture);
    return fx && CLEARABLE.has(fx.kind) && !fx.cleared ? true : t('Nothing in the way.', '没有障碍了。');
  },
  progress(state, a, dt) {
    const run = exploreRun(state);
    if (run && a.dur) addExposure(state, run, (a.noise * dt) / a.dur);
  },
  complete(state, a) {
    const run = exploreRun(state);
    const fx = findFixture(run, a.fixture);
    if (!fx) return;
    fx.cleared = true;
    const ex = exploreState(state);
    (ex.cleared[run.site] ||= []).push(fx.id);
    if (fx.kind === 'scrap') {
      alertZombies(state, run, 4);
      addProfExp(state, 'explore', 4);
      takeApart(state, run, fx);
      return;
    }
    alertZombies(state, run, 6);
    addProfExp(state, 'explore', 8);
    toast(t('The way is clear.', '路打通了。'), 'good');
  },
});

registerKind('exploreRest', {
  begin(state) {
    const run = exploreRun(state);
    if (run) run.resting = true;
    state.player.sleeping = true;
  },
  progress(state, a, dt) {
    addStat(state, 'sta', (12 / 3600) * dt, 'rest');
  },
  cancel(state) {
    const run = exploreRun(state);
    if (run) run.resting = false;
    state.player.sleeping = false;
  },
  complete(state) {
    const run = exploreRun(state);
    if (run) run.resting = false;
    state.player.sleeping = false;
  },
});

registerKind('exploreOpen', {
  complete(state, a) {
    emit('openPanel', { panel: 'exploreLoot', fixture: a.fixture });
  },
});

registerKind('exploreFight', {
  canStart(state, a) {
    return exploreRun(state)?.zombies.some((z) => z.id === a.zombie) ? true : t('Nothing there.', '那里什么都没有。');
  },
  complete(state, a) {
    const run = exploreRun(state);
    const z = run?.zombies.find((o) => o.id === a.zombie);
    if (!z) return;
    if (manhattan(z, state.player) > 1) {
      toast(t('It lurches out of reach.', '它踉跄着躲开了。'));
      return;
    }
    const dmg = (hasTool(state, ITEM.crowbar) ? 45 : 30) * (0.85 + 0.3 * xr(state));
    z.hp -= dmg;
    z.mode = 'chase';
    if (z.human && z.stance !== 'hostile') {
      for (const o of run.zombies) if (o.human && o.stance !== 'leaving') Object.assign(o, { stance: 'hostile', lost: 0 });
      run.standoff = null;
    }
    addExposure(state, run, 5);
    if (z.hp <= 0) killZombie(state, run, z);
  },
});

// ------------------------------------------------------------------------------------------ endless overrun
// Endless runs: hordes occupy exploration points for a few days (patch 08-15 marks them on the map).
export function rollOverrun(state, day = dayNumber(state.clock)) {
  if (state.meta.mode === 'story') return [];
  const ex = exploreState(state);
  for (const [id, until] of Object.entries(ex.overrun)) {
    if (day < until) continue;
    delete ex.overrun[id];
    toast(t(`The horde has moved on from the ${pickLang(SITE_BY_ID[id].name)}.`, `尸潮离开了${pickLang(SITE_BY_ID[id].name)}。`));
  }
  const unlocked = SITES.filter((s) => ex.unlockDay[s.id] <= day);
  const chance = Math.min(0.4, 0.1 + day * 0.004);
  const hit = [];
  for (const s of shuffled(state, unlocked)) {
    if (ex.overrun[s.id] || ex.run?.site === s.id) continue;
    if (Object.keys(ex.overrun).length >= unlocked.length - 1) break;
    if (xr(state) >= chance) continue;
    ex.overrun[s.id] = day + 2 + Math.floor(xr(state) * 5);
    hit.push(s.id);
    toast(t(`A horde has overrun the ${pickLang(s.name)}.`, `尸潮占领了${pickLang(s.name)}。`), 'bad');
    emit('exploreOverrun', { site: s.id, until: ex.overrun[s.id] });
  }
  return hit;
}

// ------------------------------------------------------------------------------------------ system tick
function tickSite(state, run, dt) {
  const def = SITE_BY_ID[run.site];
  tickZombies(state, run, def, dt);
  if (state.phase === 'dead') return;
  if (!NOISY_KINDS.has(state.actions.current?.kind)) addExposure(state, run, (-(run.resting ? 20 : 10) * dt) / HOUR);
  const now = state.clock.t;
  if (run.closesAt != null) {
    const left = run.closesAt - now;
    if (left <= HOUR && !run.warned.hour) {
      run.warned.hour = true;
      toast(t('About an hour of light left — the dead get restless after dark.', '天快黑了，还剩一小时左右，入夜后丧尸会躁动起来。'), 'bad');
    }
    if (left <= 0) {
      if (!run.warned.closed) {
        run.warned.closed = true;
        surge(state, run, 3);
        addExposure(state, run, Math.max(0, 75 - run.exposure));
        toast(t('Night has fallen. The dead are pouring in — retreat!', '天黑了，丧尸蜂拥而至——快撤！'), 'bad');
      } else if (now - run.lastSurge >= 45 * 60) {
        surge(state, run, 1);
      }
    }
  } else {
    const night = isNight(state.clock);
    if (night && !run.nightNoted) {
      surge(state, run, 2);
      toast(t('Night falls outside. It gets darker in here, and busier.', '外面入夜了，这里更暗，丧尸也更多了。'), 'bad');
    }
    run.nightNoted = night;
  }
}

function tickTravel(state, run) {
  if (hasTravel(state)) return;
  const intr = run.interrupted;
  run.interrupted = null;
  if (run.phase === 'travelOut') {
    run.phase = 'travelBack';
    enqueueTravel(state, run, 'back', Math.max(60, Math.round(intr?.elapsed ?? 0)));
    toast(t('You turn back.', '你掉头回家。'));
  } else {
    enqueueTravel(state, run, 'back', intr ? Math.max(60, Math.round(intr.dur - intr.elapsed)) : run.travelSec);
  }
}

registerSystem({
  id: 'explore',
  order: 55,
  init(state) {
    freshState(state);
  },
  ensure(state) {
    exploreState(state);
  },
  tick(state, dt) {
    const run = state.explore?.run;
    if (!run) return;
    if (run.phase === 'site') tickSite(state, run, dt);
    else tickTravel(state, run);
    if (state.phase !== 'dead' && state.player.stats.life <= 0) die(state, 'exploration');
  },
  onDay(state, day) {
    const ex = exploreState(state);
    for (const id of Object.keys(ex.depletion)) ex.depletion[id] = Math.max(0, ex.depletion[id] - 0.04);
    rollOverrun(state, day);
  },
  onDeath(state, cause) {
    const run = state.explore?.run;
    if (run) state.explore.last = { site: run.site, died: true, cause, searched: run.searched, total: run.total, at: state.clock.t };
  },
});

// ------------------------------------------------------------------------------------------ scene, HUD hooks
registerScene('explore', {
  floor(state, floorId) {
    const id = typeof floorId === 'string' && floorId.startsWith(FLOOR_PREFIX) ? floorId.slice(FLOOR_PREFIX.length) : exploreRun(state)?.site;
    return siteLayout(id)?.floor;
  },
  blocked(state) {
    return blockedSet(exploreRun(state));
  },
  stairs() {
    return null;
  },
});

registerObjectives((state) => {
  const run = exploreRun(state);
  if (!run) return null;
  const def = SITE_BY_ID[run.site];
  const name = pickLang(def.name);
  if (run.phase !== 'site') {
    const cur = state.actions.current;
    const left = cur?.kind === 'exploreTravel' ? cur.dur - cur.elapsed : null;
    return [{ id: 'exploreTravel', text: run.phase === 'travelOut' ? `🚶 ${t('On the way to', '正在前往')} ${name}` : `🏠 ${t('Heading home', '正在回家')}`, prog: left != null ? formatDuration(left) : '' }];
  }
  const left = timeLeft(state);
  const exposure = exposureLevel(run.exposure);
  return [
    {
      id: 'exploreDepth',
      text: `${def.icon} ${name} — ${t('Depth', '深度')} ${run.searched}/${run.total}`,
      prog: `${pickLang(exposure.label)} ${Math.round(run.exposure)}%${left != null ? ` · ${left > 0 ? `${t('dark in', '天黑还有')} ${formatDuration(left)}` : t('after dark', '已入夜')}` : ''}`,
      urgent: run.exposure >= 80 || (left != null && left < 1800),
    },
    { id: 'exploreRetreat', text: `⤺ ${t('Retreat home', '撤离回家')}`, prog: formatDuration(run.travelSec), onClick: () => retreat(state) },
  ];
});

registerSuggestions((state) => {
  const run = exploreRun(state);
  if (!run || run.phase !== 'site') return null;
  const out = [];
  const left = timeLeft(state);
  const hurt = state.player.stats.life < effectiveMax(state, 'life') * 0.35;
  if (hurt || run.exposure >= 85 || (left != null && left <= 0)) out.push({ id: 'exploreRetreat', label: `⤺ ${t('Retreat home', '撤离回家')}`, run: () => retreat(state) });
  const fx = nearestFixture(state, 6);
  if (fx) out.push({ id: 'exploreSearch', label: `🔦 ${fixtureName(fx)}`, run: () => queueDefault(state, fx.id) });
  return out;
});
