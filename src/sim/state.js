// Creates a fresh run (one loop of the Survival Log).
import { seedRng } from '../engine/rng.js';
import { createClock } from './time.js';
import { createPlayer } from './stats.js';
import { createInventory } from './inventory.js';
import { buildHome, homeDef } from './home.js';
import { CHARACTERS } from '../content/characters.js';
import { resolveDifficulty } from '../content/difficulty.js';
import { getMods, bumpMods } from './modifiers.js';
import { getSystems } from './tick.js';
import { ensureActionIds } from './actions.js';

export const SAVE_VERSION = 1;

export const PROF_KEYS = ['cook', 'plant', 'craft', 'trap', 'explore', 'defense'];

export function newLoopData() {
  return {
    cycle: 1,
    planningPoints: 0,
    pointsSpentThisRound: 0,
    abilities: {},
    abilitiesThisRound: {},
    memories: [],
    notes: [],
    bestDay: 0,
    rebirths: 0,
    neighborAffinity: 0,
    history: [],
    ngPlus: false,
  };
}

export function newGame(opts = {}) {
  const character = opts.character || 'wage';
  const ch = CHARACTERS[character];
  const difficulty = resolveDifficulty(opts.difficulty || 'normal', opts.custom);
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const loop = opts.loop ? structuredClone(opts.loop) : newLoopData();
  const state = {
    version: SAVE_VERSION,
    meta: {
      id: opts.id || `run${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`,
      created: Date.now(),
      character,
      difficultyId: difficulty.id,
      difficulty,
      mode: opts.mode || 'story', // story | endless | pureEndless
      seed,
      skipPrologue: !!opts.skipPrologue,
    },
    rng: seedRng(seed),
    nextUid: 1,
    modsVer: 1,
    phase: opts.mode === 'pureEndless' ? 'post' : 'pre',
    clock: null,
    player: createPlayer(character),
    inventories: {},
    furniture: {},
    floorBoxes: [],
    home: null,
    actions: { queue: [], current: null, nextId: 1 },
    weather: null,
    power: { grid: true, stored: 0, gridCutDay: null, log: [] },
    crises: { active: [], history: [], nextHorde: null, schedule: [] },
    zombies: [],
    social: {},
    story: { tags: {}, quests: {}, events: {}, route: null, clues: [], flags: {}, seen: {} },
    progress: {
      prof: {},
      counters: {},
      installed: {},
      taboo: {},
      codexRun: { food: [], dish: [], plant: [], prey: [], craft: [], furniture: [] },
      maxOver150: 0,
      kills: 0,
      crisesSurvived: 0,
      hordesSurvived: 0,
    },
    pre: {
      visited: [],
      foodTypes: [],
      matTypes: [],
      deliveries: [],
      car: null,
      trunk: null,
      spent: 0,
      budget: 0,
      loanTaken: false,
      walletTaken: false,
      neighborCash: false,
      rushUsed: {},
      soldBlood: false,
      location: 'home',
      shopStock: {},
      riot: false,
      news: [],
    },
    run: {
      cards: [],
      unlockedRecipes: [],
      offers: null,
      pointsEarned: 0,
      lastSettledDay: 0,
      dayRecords: [],
    },
    loop,
    log: [],
    ui: {},
  };
  state.clock = createClock(0);
  for (const k of ['cook', 'plant', 'craft', 'trap', 'explore', 'defense']) {
    state.progress.prof[k] = { lv: ch.startProf?.[k] ?? 0, exp: 0 };
  }
  bumpMods(state);
  const mods = getMods(state);
  const prepHours = difficulty.prepHours + (mods.prepHours || 0);
  state.clock = createClock(prepHours);
  if (state.phase === 'post') state.clock.t = state.clock.outbreakAt;

  // backpack
  const carry = 20 + (mods.carryKg || 0);
  const bp = createInventory(state, { kind: 'backpack', w: 10, h: 6, maxKg: carry, label: 'backpack' });
  state.player.backpack = bp.id;

  // money: base funds * difficulty + savings; wallet and loan are picked up in the home.
  state.player.money = Math.round(ch.startMoney * difficulty.funds) + (mods.startMoney || 0);
  state.pre.budget = state.player.money;

  buildHome(state, homeDef(ch.home).id);
  const spawn = homeDef(ch.home).spawn;
  state.player.scene = 'home';
  state.player.floor = spawn.floor;
  state.player.x = spawn.x;
  state.player.y = spawn.y;
  state.player.px = spawn.x;
  state.player.py = spawn.y;
  state.player.path = [];
  state.ui.viewFloor = spawn.floor;
  for (const sys of getSystems()) sys.init?.(state, opts);
  return state;
}

// Systems added after a save was created still get their state namespaces.
export function ensureSystems(state) {
  ensureActionIds(state);
  for (const sys of getSystems()) sys.ensure?.(state);
}

export function logEvent(state, text, kind = 'info') {
  state.log.push({ t: state.clock.t, text, kind });
  if (state.log.length > 300) state.log.splice(0, state.log.length - 300);
}
