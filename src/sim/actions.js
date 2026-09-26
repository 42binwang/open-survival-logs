// The survivor's action queue: walk to a target, spend time working, apply effects on completion.
// Systems register their own action kinds with registerKind(). Stamina/costs are only charged when
// an action completes (patch 08-15: cancelling refunds nothing because nothing was spent yet).
import { emit } from '../engine/bus.js';
import { findPath, cellAt, CELL } from './scene.js';
import { homeFloors, blockedCells, interactionTiles, slotStandTiles, homeDef } from './home.js';
import { pickLang } from '../engine/i18n.js';
import { actionTimeMult, moveSpeedMult, addStat, raiseMax, bumpDaily, dailyCount } from './stats.js';
import { getMods } from './modifiers.js';
import { sceneFloor, sceneBlocked, sceneStairs } from './scenes.js';

export const TILE_SECONDS = 12; // game seconds to walk one tile

const kinds = new Map();

export function registerKind(kind, handler) {
  kinds.set(kind, handler);
}

export function getKind(kind) {
  return kinds.get(kind);
}

// Action ids are handles for cancelAction() and must stay unique within a run across save and Continue, so the counter
// lives in the state. Saves without it continue after their highest queued id.
export function ensureActionIds(state) {
  const acts = state.actions;
  let top = 0;
  for (const a of [acts.current, ...acts.queue]) if (Number.isFinite(a?.id)) top = Math.max(top, a.id);
  acts.nextId = Math.max(Number.isInteger(acts.nextId) ? acts.nextId : 1, top + 1);
}

// Queue an action. spec: { kind, label, target: {furn}|{x,y,floor}|null, dur (game s), cost, gain, max, ... }
export function enqueue(state, spec, { front = false, replace = false } = {}) {
  if (!Number.isInteger(state.actions.nextId)) ensureActionIds(state);
  const a = { id: state.actions.nextId++, ...spec, phase: 'pending', elapsed: 0 };
  if (replace) {
    cancelAll(state);
  }
  if (front) state.actions.queue.unshift(a);
  else state.actions.queue.push(a);
  return a;
}

export function cancelCurrent(state) {
  const cur = state.actions.current;
  if (!cur) return;
  const h = kinds.get(cur.kind);
  h?.cancel?.(state, cur);
  state.actions.current = null;
  state.player.sleeping = false;
  state.player.path = [];
}

export function cancelAll(state) {
  state.actions.queue = [];
  cancelCurrent(state);
}

export function cancelAction(state, id) {
  if (state.actions.current?.id === id) return cancelCurrent(state);
  state.actions.queue = state.actions.queue.filter((a) => a.id !== id);
}

export function isIdle(state) {
  return !state.actions.current && state.actions.queue.length === 0;
}

// Where the survivor may stand for an action (candidates, nearest first).
function resolveTargets(state, a) {
  const p = state.player;
  if (a.target?.furn != null) {
    const f = state.furniture[a.target.furn];
    if (!f) return null;
    if (state.player.scene !== 'home') return [{ floor: f.floor, x: f.x, y: f.y }];
    return interactionTiles(state, f, p.floor === f.floor ? p : null).map(([x, y]) => ({ floor: f.floor, x, y }));
  }
  if (a.target?.slot != null && state.player.scene === 'home') {
    const tiles = slotStandTiles(state, a.target.slot, p);
    const floor = a.target.slot.split(':')[0];
    return tiles.map(([x, y]) => ({ floor, x, y }));
  }
  if (a.target?.x != null) return [{ floor: a.target.floor ?? p.floor, x: a.target.x, y: a.target.y }];
  return null;
}

// Path across floors via stairs (home) or within a single-floor scene. At home the survivor stays indoors: a route
// goes out of the door into the yard only for an action whose spot is out there (a trap, the defence line), never
// for a plain walk.
function planRoute(state, dest, kind) {
  const p = state.player;
  const legs = [];
  let floor = p.floor;
  let x = p.x;
  let y = p.y;
  let guard = 0;
  const home = state.player.scene === 'home';
  const destCell = home ? cellAt(sceneFloor(state, dest.floor), dest.x, dest.y) : null;
  // (a survivor already out there, after setting a trap, walks back in through the yard)
  const here = home ? cellAt(sceneFloor(state, floor), x, y) : null;
  const outside = !home || here === CELL.YARD || here === CELL.DOOR || (kind !== 'walk' && destCell === CELL.YARD);
  while (floor !== dest.floor && guard++ < 4) {
    const hop = sceneStairs(state, floor, dest.floor);
    if (!hop) return null;
    const grid = sceneFloor(state, floor);
    const path = findPath(grid, x, y, hop.from[0], hop.from[1], sceneBlocked(state, floor), { outside });
    if (!path) return null;
    legs.push({ floor, path, then: { floor: hop.toFloor, x: hop.to[0], y: hop.to[1] } });
    floor = hop.toFloor;
    x = hop.to[0];
    y = hop.to[1];
  }
  const grid = sceneFloor(state, floor);
  // At home the goal must be a free tile; other scenes may target fixture tiles directly.
  const path = findPath(grid, x, y, dest.x, dest.y, sceneBlocked(state, floor), { outside, goalAnyCell: !home, strictGoal: home });
  if (!path) return null;
  legs.push({ floor, path, then: null });
  return legs;
}

function startAction(state, a) {
  const h = kinds.get(a.kind);
  if (!h) {
    emit('toast', { text: `Unknown action ${a.kind}`, kind: 'bad' });
    return false;
  }
  if (h.canStart) {
    const why = h.canStart(state, a);
    if (why !== true && why != null) {
      emit('toast', { text: why, kind: 'bad' });
      return false;
    }
  }
  const dests = a.noWalk ? null : resolveTargets(state, a);
  if (dests) {
    let legs = null;
    for (const dest of dests) {
      legs = planRoute(state, dest, a.kind);
      if (legs) break;
    }
    if (!legs) {
      emit('toast', { text: pickLang({ en: 'Cannot reach that — something is in the way.', zh: '过不去——有东西挡住了。' }), kind: 'bad' });
      return false;
    }
    a.legs = legs;
    a.phase = 'walk';
  } else {
    a.phase = 'work';
    h.begin?.(state, a);
  }
  state.actions.current = a;
  emit('actionStarted', a);
  return true;
}

// Advance the queue by dt game seconds.
export function tickActions(state, dt) {
  let budget = dt;
  let guard = 0;
  while (budget > 0 && guard++ < 50) {
    let a = state.actions.current;
    if (!a) {
      const next = state.actions.queue.shift();
      if (!next) return;
      if (!startAction(state, next)) continue;
      a = state.actions.current;
    }
    if (a.phase === 'walk') {
      budget = stepWalk(state, a, budget);
      if (a.phase === 'walk') return;
      const h = kinds.get(a.kind);
      h?.begin?.(state, a);
      if (state.actions.current !== a) continue;
    }
    if (a.phase === 'work') {
      const h = kinds.get(a.kind);
      const mult = a.noSlow ? 1 : actionTimeMult(state);
      const need = (a.dur || 0) * mult - a.elapsed;
      const use = Math.min(budget, Math.max(0, need));
      a.elapsed += use;
      budget -= use;
      h?.progress?.(state, a, use);
      if (state.actions.current !== a) continue;
      if (a.continuous) {
        // continuous actions end themselves (via finish) or when cancelled
        if (a.elapsed >= (a.dur || Infinity) * mult) finish(state, a);
        else return;
      } else if (a.elapsed >= (a.dur || 0) * mult) {
        finish(state, a);
      } else {
        return;
      }
    }
  }
}

function stepWalk(state, a, budget) {
  const p = state.player;
  const speed = moveSpeedMult(state) * (getMods(state).moveMult || 1);
  const tileTime = TILE_SECONDS / speed;
  while (budget > 0 && a.legs.length) {
    const leg = a.legs[0];
    if (!leg.path.length) {
      a.legs.shift();
      if (leg.then) {
        p.floor = leg.then.floor;
        p.x = leg.then.x;
        p.y = leg.then.y;
        p.px = p.x;
        p.py = p.y;
        if (state.player.scene === 'home') state.ui.viewFloor = p.floor;
        emit('floorChanged', { floor: p.floor });
      }
      continue;
    }
    const [nx, ny] = leg.path[0];
    p.walkT = (p.walkT || 0) + budget;
    if (p.walkT >= tileTime) {
      budget = p.walkT - tileTime;
      p.walkT = 0;
      p.x = nx;
      p.y = ny;
      p.px = nx;
      p.py = ny;
      leg.path.shift();
      state.progress.counters.tilesWalked = (state.progress.counters.tilesWalked || 0) + 1;
    } else {
      const f = p.walkT / tileTime;
      p.px = p.x + (nx - p.x) * f;
      p.py = p.y + (ny - p.y) * f;
      budget = 0;
    }
  }
  if (!a.legs.length) {
    a.phase = 'work';
    p.walkT = 0;
  }
  return budget;
}

export function finish(state, a) {
  const h = kinds.get(a.kind);
  state.actions.current = null;
  try {
    applyCostsAndGains(state, a);
    h?.complete?.(state, a);
  } finally {
    emit('actionDone', a);
  }
}

// Shared effect application: cost {sta, sat, mor}, gain {...}, max {...} (daily-capped via `daily` key).
export function applyCostsAndGains(state, a) {
  const mods = getMods(state);
  if (a.cost) {
    for (const [k, v] of Object.entries(a.cost)) {
      const mult = k === 'sta' ? mods.staCost * (a.craft ? mods.craftStamina : 1) * (state.player.effects.handy ? 0.7 : 1) : 1;
      addStat(state, k, -v * mult, a.kind);
    }
  }
  if (a.gain) {
    for (const [k, v] of Object.entries(a.gain)) {
      const mult = k === 'sta' && a.rest ? mods.restGain : 1;
      addStat(state, k, v * mult, a.kind);
    }
  }
  if (a.max) {
    for (const [k, v] of Object.entries(a.max)) raiseMax(state, k, v, a.kind);
  }
  if (a.dailyKey) bumpDaily(state, a.dailyKey);
}

export function dailyLeft(state, key, max) {
  if (!max) return Infinity;
  return max - dailyCount(state, key);
}

// A simple "walk here" action.
registerKind('walk', {
  // at home a click outside the walls (the street, the yard) does not take the survivor out of the house
  canStart(state, a) {
    if (state.player.scene !== 'home' || a.target?.x == null) return true;
    const c = cellAt(sceneFloor(state, a.target.floor ?? state.player.floor), a.target.x, a.target.y);
    if (c === CELL.YARD || c === CELL.DOOR || c === CELL.VOID) return pickLang({ en: "You can't go outside.", zh: '不能出门。' });
    return true;
  },
});

// Home-specific helpers exposed to the scenes resolver
export function homeStairs(state, fromFloor, toFloor) {
  const def = homeDef(state.home.id);
  const order = ['B1', '1F', '2F'];
  const fi = order.indexOf(fromFloor);
  const ti = order.indexOf(toFloor);
  if (fi < 0 || ti < 0 || fi === ti) return null;
  const up = ti > fi;
  const cur = def.floors[fromFloor];
  const nextFloor = order[fi + (up ? 1 : -1)];
  const nxt = def.floors[nextFloor];
  if (!nxt || !state.home.unlocked[nextFloor]) return null;
  const from = up ? cur.stairsUp : cur.stairsDown;
  const to = up ? nxt.stairsDown : nxt.stairsUp;
  if (!from || !to) return null;
  return { from, to, toFloor: nextFloor };
}

export function isWalkableHome(state, floor, x, y) {
  const fl = homeFloors(state.home.id)[floor];
  const c = cellAt(fl, x, y);
  if (!(c === CELL.FLOOR || c === CELL.OUTDOOR || c === CELL.STAIRS_UP || c === CELL.STAIRS_DOWN)) return false;
  return !blockedCells(state, floor).has(y * 1024 + x);
}
