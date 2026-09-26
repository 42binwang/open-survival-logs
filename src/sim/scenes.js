// Resolves grids for whatever scene the survivor is in. The home is built in; shops and exploration
// sites register providers: { floor(state, floorId), blocked(state, floorId), stairs(state, from, to) }.
import { homeFloors, blockedCells } from './home.js';
import { homeStairs } from './actions.js';

const providers = new Map();

export function registerScene(prefix, provider) {
  providers.set(prefix, provider);
}

function provider(state) {
  const scene = state.player.scene || 'home';
  if (scene === 'home') return null;
  const prefix = scene.split(':')[0];
  return providers.get(prefix) || null;
}

export function sceneFloor(state, floor) {
  const pv = provider(state);
  if (pv) return pv.floor(state, floor);
  return homeFloors(state.home.id)[floor];
}

export function sceneBlocked(state, floor) {
  const pv = provider(state);
  if (pv) return pv.blocked(state, floor);
  return blockedCells(state, floor);
}

export function sceneStairs(state, from, to) {
  const pv = provider(state);
  if (pv) return pv.stairs ? pv.stairs(state, from, to) : null;
  return homeStairs(state, from, to);
}

export function sceneProvider(state) {
  return provider(state);
}
