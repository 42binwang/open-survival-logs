// Game controller: owns the current run, global history and settings; bridges sim <-> UI.
import { newGame as createRun, ensureSystems } from './sim/state.js';
import { tick } from './sim/tick.js';
import { SPEED_SCALE, RELAXED_SCALE } from './sim/time.js';
import { isIdle } from './sim/actions.js';
import { saveGame, loadGame, loadHistory, saveHistory, loadSettings, saveSettings } from './engine/save.js';
import { setLang } from './engine/i18n.js';
import { emit, on } from './engine/bus.js';
import { bumpMods } from './sim/modifiers.js';

// Relaxed slow-down never applies while something is attacking the house.
const ATTACK_TYPES = new Set(['horde', 'sporadic', 'thugs']);
// Actions that are a trip between scenes (src/sim/predisaster.js travel, src/sim/explore.js exploreTravel).
const TRIPS = new Set(['travel', 'exploreTravel']);

export const DEFAULT_SETTINGS = {
  lang: 'en',
  fps: 60,
  volume: 0.6,
  music: 0.4,
  sfx: 0.7,
  operationTips: true,
  autoRelax: true,
  autonomy: true,
  lagOptimization: true,
  /** 'auto' (high on a GPU, low on a software rasteriser), 'high', 'low', or 'classic' (the Canvas 2D renderer) */
  graphics: 'auto',
  keys: {},
  skipPrologue: false,
};

export const game = {
  state: null,
  history: loadHistory(),
  settings: { ...DEFAULT_SETTINGS, ...(loadSettings() || {}) },
  slot: null,
  paused: false, // menu pause (independent of speed 0)
  lastAutosave: 0,
  listeners: [],
};

setLang(game.settings.lang);

export function applySettings(patch) {
  Object.assign(game.settings, patch);
  saveSettings(game.settings);
  if (patch.lang) setLang(patch.lang);
  if ('autonomy' in patch && game.state) game.state.ui.autonomy = patch.autonomy;
  if ('autoRelax' in patch && game.state) game.state.clock.autoRelax = patch.autoRelax;
  emit('settings', game.settings);
}

export function startRun(opts) {
  // ?seed= (the visual shots, reproducible bug reports) seeds the run itself: a seed drawn from Math.random depended
  // on how many random numbers three.js had drawn for object ids while the scene loaded (BUG-0063)
  const urlSeed = Number(new URLSearchParams(globalThis.location?.search || '').get('seed'));
  if (opts.seed == null && Number.isInteger(urlSeed) && urlSeed > 0) opts = { ...opts, seed: urlSeed };
  game.state = createRun(opts);
  game.slot = opts.slot || `slot-${game.state.meta.id}`;
  game.state.clock.autoRelax = game.settings.autoRelax;
  game.state.ui.autonomy = game.settings.autonomy;
  game.history.profile.runs = (game.history.profile.runs || 0) + 1;
  saveHistory(game.history);
  emit('runStarted', { state: game.state });
  return game.state;
}

export function adoptState(state, slot) {
  game.state = state;
  game.slot = slot;
  bumpMods(state);
  ensureSystems(state);
  state.ui.autonomy = game.settings.autonomy;
  emit('runStarted', { state, loaded: true });
}

export function loadRun(slot) {
  const res = loadGame(slot);
  if (!res) return false;
  adoptState(res.state, slot);
  return true;
}

export function saveRun() {
  if (!game.state || !game.slot) return false;
  saveGame(game.slot, game.state);
  saveHistory(game.history);
  game.lastAutosave = game.state.clock.t;
  return true;
}

export function persistHistory() {
  saveHistory(game.history);
}

// Advance simulation by real seconds.
export function step(realDt) {
  const s = game.state;
  if (!s || game.paused) return;
  if (s.phase === 'dead' || s.phase === 'ending') return;
  const c = s.clock;
  let scale = SPEED_SCALE[c.speed] ?? 60;
  if (c.speed > 0 && c.relaxed && isIdle(s) && !s.crises.active.some((cr) => ATTACK_TYPES.has(cr.type) && cr.phase === 'attack')) scale = RELAXED_SCALE;
  if (s.ui.modalPause) scale = 0;
  // A trip (to a shop, a site, or home again) is not watched: once the survivor is out of the door the game jumps
  // to the arrival and the trip's time is taken off the clock. The world still runs through those minutes, so an
  // ambush or an event on the way stops the jump.
  const trip = s.actions.current;
  if (scale > 0 && trip && TRIPS.has(trip.kind) && trip.phase === 'work') {
    for (let i = 0; i < 24 * 60 && s.actions.current === trip && s.phase !== 'dead' && s.phase !== 'ending' && !s.ui.modalPause; i++) tick(s, 60);
  } else {
    const dt = Math.min(realDt, 0.25) * scale;
    if (dt > 0) tick(s, dt);
  }
  // autosave every 6 in-game hours
  if (s.clock.t - game.lastAutosave > 6 * 3600) saveRun();
}

export function setSpeed(n) {
  if (!game.state) return;
  game.state.clock.speed = n;
  if (n > 0) game.state.clock.relaxed = false;
}

export function toggleRelaxed() {
  if (!game.state) return;
  const c = game.state.clock;
  c.relaxed = !c.relaxed;
  if (c.relaxed && c.speed === 0) c.speed = 1;
}

export { on, emit };
