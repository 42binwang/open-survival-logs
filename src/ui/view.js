// Builds what the renderer should draw for the current scene.
import { homeFloors, furnitureOn, homeDef, isRoomUnlocked, allSlots, effectiveMaxHp } from '../sim/home.js';
import { footprint } from '../sim/scene.js';
import { sceneProvider } from '../sim/scenes.js';
import { CHARACTERS } from '../content/characters.js';
import { isNight } from '../sim/time.js';
import { actionTimeMult } from '../sim/stats.js';

const viewBuilders = new Map();

export function registerView(prefix, builder) {
  viewBuilders.set(prefix, builder);
}

// The survivor's motion and action as the sim runs them (src/contracts/view.js ViewEntity): the next tile of the walk
// phase, and the current action's kind, phase and work progress.
export function playerMotion(state) {
  const a = state.actions?.current;
  if (!a) return { moving: false };
  const p = state.player;
  const next = a.phase === 'walk' ? a.legs?.[0]?.path?.[0] : null;
  const heading = next ? [Math.sign(next[0] - p.x), Math.sign(next[1] - p.y)] : null;
  const moving = !!heading && (heading[0] !== 0 || heading[1] !== 0);
  const action = { kind: a.kind, phase: a.phase };
  const total = (a.dur || 0) * (a.noSlow ? 1 : actionTimeMult(state));
  if (a.phase === 'work' && Number.isFinite(total) && total > 0) action.progress = Math.min(1, Math.max(0, a.elapsed / total));
  return { moving, ...(moving ? { heading } : {}), action };
}

// A zombie's step between tiles (src/sim/horde.js: cx, cy -> nx, ny while mt is set).
function zombieMotion(z) {
  const heading = z.mt != null ? [Math.sign(z.nx - z.cx), Math.sign(z.ny - z.cy)] : null;
  const moving = !!heading && (heading[0] !== 0 || heading[1] !== 0);
  return moving ? { moving, heading } : { moving: false };
}

export function buildView(state) {
  const scene = state.player.scene || 'home';
  if (scene !== 'home') {
    const b = viewBuilders.get(scene.split(':')[0]);
    if (b) return b(state);
  }
  return homeView(state);
}

export function homeView(state) {
  const floorId = state.ui.viewFloor || state.player.floor;
  const floors = homeFloors(state.home.id);
  const fl = floors[floorId];
  const def = homeDef(state.home.id);
  const ch = CHARACTERS[state.meta.character];
  const entities = [];
  if (state.player.floor === floorId && state.player.scene === 'home') {
    entities.push({
      x: state.player.px ?? state.player.x,
      y: state.player.py ?? state.player.y,
      color: ch.color,
      head: '#e8c9a0',
      sleeping: state.player.sleeping,
      kind: 'player',
      character: state.meta.character,
      ...playerMotion(state),
    });
  }
  for (const z of state.zombies || []) {
    if (z.floor === floorId) entities.push({ x: z.x, y: z.y, color: '#5f7a4a', head: '#8aa26a', hp: z.hp, maxHp: z.maxHp, kind: z.big ? 'big' : 'zombie', id: z.id, ...zombieMotion(z) });
  }
  for (const npc of state.ui.npcs || []) if (npc.floor === floorId) entities.push(npc);
  const lightsOn = state.power?.homePowered && !state.power?.lightsOff;
  const slots = state.ui.planning
    ? allSlots(state)
        .filter((s) => s.floor === floorId)
        .map((s) => {
          const [w, h] = footprint(s.type);
          return { x: s.x, y: s.y, w: w || 1, h: h || 1, free: !state.home.slots[s.id], valid: !!state.ui.planSlots?.has(s.id) };
        })
    : null;
  return {
    fires: floorId === '1F' ? state.crises?.fires || [] : [],
    slots,
    floor: fl,
    floorId,
    // a copy per piece with the sim's wear ratio (reinforcement included) for the damage states (src/contracts/view.js hpRatio)
    furniture: furnitureOn(state, floorId).map((f) => (f.maxHp > 0 ? { ...f, hpRatio: Math.min(1, Math.max(0, f.hp / effectiveMaxHp(f))) } : f)),
    boxes: (state.floorBoxes || []).filter((b) => b.floor === floorId),
    entities,
    clock: state.clock,
    weather: floorId === 'B1' ? null : state.weather?.today,
    lightsOn: lightsOn && isNight(state.clock),
    // facts for a renderer with its own lamp schedule (src/contracts/view.js); the sim defaults both power flags to true
    home: state.home.id,
    powered: state.power?.homePowered !== false,
    lightsPowered: state.power?.lightsPowered !== false,
    lightsSwitchedOff: !!state.power?.lightsOff,
    basement: floorId === 'B1',
    indoorDark: floorId === 'B1' && !lightsOn,
    roomAt: (x, y) => fl.rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h),
    locked: (x, y) => !state.home.unlocked[floorId] || !isRoomUnlocked(state, floorId, x, y),
    floorsAvailable: Object.keys(def.floors),
  };
}

export function currentProvider(state) {
  return sceneProvider(state);
}
