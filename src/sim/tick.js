// Main simulation step and the subsystem registry.
import { tickActions, cancelAll } from './actions.js';
import { tickStats, isDead, resetDaily } from './stats.js';
import { tickSpoilage } from './spoilage.js';
import { dayNumber, secondsUntilOutbreak } from './time.js';
import { emit } from '../engine/bus.js';
import { cleanupFloorBoxes, beginFurnitureFrame, endFurnitureFrame } from './home.js';

const systems = [];

// system: { id, order, tick(state, dt), onDay(state, day), onOutbreak(state), onHour(state, hour) }
export function registerSystem(sys) {
  if (systems.some((s) => s.id === sys.id)) return;
  systems.push(sys);
  systems.sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
}

export function getSystems() {
  return systems;
}

const STEP = 30; // max game seconds per sub-step

export function tick(state, dt) {
  if (state.phase === 'dead' || state.phase === 'ending' || state.phase === 'menu') return;
  try {
    subSteps(state, dt);
  } finally {
    endFurnitureFrame(state);
  }
}

function subSteps(state, dt) {
  let left = dt;
  while (left > 0) {
    const step = Math.min(STEP, left);
    left -= step;
    // the home's furniture list is shared within the sub-step (src/sim/home.js homeFurniture)
    beginFurnitureFrame(state);
    const prevHour = Math.floor((state.clock.startHour * 3600 + state.clock.t) / 3600);
    state.clock.t += step;
    tickActions(state, step);
    tickStats(state, step);
    tickSpoilage(state, step);
    for (const s of systems) {
      if (s.tick) s.tick(state, step);
      if (state.phase === 'dead' || state.phase === 'ending') return;
    }
    const hour = Math.floor((state.clock.startHour * 3600 + state.clock.t) / 3600);
    if (hour !== prevHour) {
      for (const s of systems) s.onHour?.(state, hour % 24);
      emit('hour', { hour: hour % 24 });
    }
    if (state.phase === 'pre' && secondsUntilOutbreak(state) <= 0) {
      outbreak(state);
    }
    if (state.phase === 'post') {
      const day = dayNumber(state.clock);
      if (state.run.day == null) state.run.day = day;
      if (day !== state.run.day) {
        const prev = state.run.day;
        state.run.day = day;
        newDay(state, day, prev);
      }
    }
    if (isDead(state)) {
      die(state, state.run.deathCause || 'life');
      return;
    }
  }
}

export function outbreak(state) {
  if (state.phase !== 'pre') return;
  cancelAll(state);
  for (const s of systems) s.beforeOutbreak?.(state);
  state.phase = 'post';
  state.run.day = dayNumber(state.clock);
  for (const s of systems) s.onOutbreak?.(state);
  emit('outbreak', {});
}

function newDay(state, day, prevDay) {
  resetDaily(state);
  cleanupFloorBoxes(state);
  for (const s of systems) s.onDay?.(state, day, prevDay);
}

export function die(state, cause) {
  if (state.phase === 'dead') return;
  cancelAll(state);
  state.run.deathDay = state.phase === 'pre' ? 0 : dayNumber(state.clock);
  state.phase = 'dead';
  state.run.deathCause = cause;
  for (const s of systems) s.onDeath?.(state, cause);
  emit('death', { cause, day: state.run.deathDay });
}

// Run the simulation forward quickly (tests and fast-forward).
export function simulate(state, seconds) {
  tick(state, seconds);
}
