// The safehouse: floors, typed slots, furniture instances and their storage.
import { HOMES, SCENERY } from '../content/homes.js';
import { furn, func, furnName, item, SLOT, ELEC, packageToFurniture, furnitureToPackage } from '../data/db.js';
import { buildFloor, footprint, cellKey, CELL, cellAt } from './scene.js';
import { createInventory, newUid, destroyInventory, insert, makeInstance } from './inventory.js';
import { getMods } from './modifiers.js';
import { loc, pickLang } from '../engine/i18n.js';
import { emit } from '../engine/bus.js';

// Storage grid sizes (w, h) for furniture with storage. The config references bag ids we do not have,
// so sizes are chosen to match capacities described in patch notes (tool cabinet: 80 slots).
const STORAGE = {
  1: [6, 4],
  203: [8, 5],
  204: [12, 8],
  307: [5, 4],
  327: [8, 5],
  374: [4, 3],
  380: [6, 5],
  383: [6, 5],
  406: [8, 5],
  435: [6, 5],
  449: [6, 4],
  10000: [10, 6],
  10001: [8, 5],
  10002: [6, 4],
  10003: [4, 3],
  10004: [8, 6],
  15000: [7, 6],
  15001: [10, 6],
  21005: [6, 3],
  66000: [4, 4],
  66001: [4, 4],
  70006: [10, 8],
};

// Preservation multiplier for containers (lower = slower spoilage).
const COLD = { 15000: 0.2, 15001: 0.1 };
// Compost bin rots food 5x faster into fertilizer; brewing barrel ferments.
const SPECIAL_STORAGE = { 66000: 'compost', 66001: 'brew' };

const gridCache = new Map();

export function homeDef(homeId) {
  return HOMES[homeId];
}

export function homeFloors(homeId) {
  if (!gridCache.has(homeId)) {
    const def = HOMES[homeId];
    const floors = {};
    for (const [fid, fdef] of Object.entries(def.floors)) floors[fid] = buildFloor(fid, fdef);
    gridCache.set(homeId, floors);
  }
  return gridCache.get(homeId);
}

// slot id -> slot, per home (the homes hold a few hundred slots; systems look slots up every tick)
const slotIndex = new Map();

export function slotDef(state, slotId) {
  const id = state.home.id;
  if (!slotIndex.has(id)) slotIndex.set(id, new Map(HOMES[id].slots.map((s) => [s.id, s])));
  return slotIndex.get(id).get(slotId);
}

export function allSlots(state) {
  return HOMES[state.home.id].slots;
}

export function furnDef(cfg) {
  if (typeof cfg === 'string') return { scenery: true, ...SCENERY[cfg] };
  return furn(cfg);
}

export function furnLabel(f) {
  if (!f) return '';
  if (f.rename === 'luxuryFridge') return pickLang({ en: 'Luxury Fridge', zh: '豪华冰箱' });
  if (f.cfg === 'trap' && f.data?.trapItem) return loc(item(f.data.trapItem)?.zh);
  if (typeof f.cfg === 'string') return pickLang(SCENERY[f.cfg].name);
  return furnName(f.cfg);
}

export function isStorage(cfg) {
  if (typeof cfg === 'string') return false;
  const d = furn(cfg);
  // Take (1), Organize (5) or another FuncType 1 function (搜索衣柜, 404: take from the piece itself) makes it storage
  return !!(STORAGE[cfg] || (d && (d.funcs.includes(1) || d.funcs.includes(5) || d.funcs.some((k) => func(k)?.ftype === 1)) && d.slot !== SLOT.DOOR));
}

export function storageSize(state, cfg) {
  const base = STORAGE[cfg] || [6, 4];
  const mult = getMods(state).storageMult || 1;
  if (mult <= 1) return base;
  return [Math.round(base[0] * Math.sqrt(mult)), Math.round(base[1] * Math.sqrt(mult))];
}

export function createFurniture(state, cfg, slotId, opts = {}) {
  const def = furnDef(cfg);
  if (!def) throw new Error(`unknown furniture ${cfg}`);
  const slot = slotDef(state, slotId);
  const [w, h] = footprint(slot.type);
  const uid = newUid(state);
  const maxHp = def.hp || 1000;
  const f = {
    uid,
    cfg,
    slot: slotId,
    floor: slot.floor,
    x: slot.x,
    y: slot.y,
    w,
    h,
    hp: maxHp,
    maxHp,
    reinforce: 0,
    on: true,
    inv: null,
    data: {},
    rename: opts.rename || null,
    fixed: !!opts.fixed,
    broken: !!opts.broken,
  };
  if (isStorage(cfg)) {
    const [iw, ih] = storageSize(state, cfg);
    const inv = createInventory(state, {
      kind: 'furniture',
      w: iw,
      h: ih,
      maxKg: null,
      owner: uid,
      cold: COLD[cfg] || 0,
    });
    inv.special = SPECIAL_STORAGE[cfg] || null;
    f.inv = inv.id;
  }
  state.furniture[uid] = f;
  state.home.slots[slotId] = uid;
  furnitureChanged(state);
  return f;
}

export function removeFurniture(state, uid) {
  const f = state.furniture[uid];
  if (!f) return;
  if (state.home.slots[f.slot] === uid) state.home.slots[f.slot] = null;
  delete state.furniture[uid];
  furnitureChanged(state);
}

export function furnitureAt(state, slotId) {
  const uid = state.home.slots[slotId];
  return uid ? state.furniture[uid] : null;
}

// One sub-step of the simulation (src/sim/tick.js) reads the home's furniture many times over (power, heating,
// farming, cooking, the record players, the shredders): within a sub-step the list is built once and shared, frozen so
// no reader changes it, and every change to the home's furniture in src/sim (createFurniture, removeFurniture, a move,
// a story fixture) drops it. Outside a sub-step every call builds a fresh list.
/** @type {WeakMap<object, { list: readonly any[], furniture: object, slots: object } | null>} */
const frames = new WeakMap();

export function beginFurnitureFrame(state) {
  frames.set(state, null);
}

export function endFurnitureFrame(state) {
  frames.delete(state);
}

export function furnitureChanged(state) {
  if (frames.has(state)) frames.set(state, null);
}

function listHomeFurniture(state) {
  return Object.values(state.furniture).filter((f) => f.slot && state.home.slots[f.slot] === f.uid);
}

export function homeFurniture(state) {
  if (!frames.has(state)) return listHomeFurniture(state);
  const c = frames.get(state);
  if (c && c.furniture === state.furniture && c.slots === state.home.slots) return c.list;
  const list = Object.freeze(listHomeFurniture(state));
  frames.set(state, { list, furniture: state.furniture, slots: state.home.slots });
  return list;
}

export function furnitureOn(state, floor) {
  return homeFurniture(state).filter((f) => f.floor === floor);
}

export function isFloorUnlocked(state, floor) {
  return !!state.home.unlocked[floor];
}

export function isRoomUnlocked(state, floorId, x, y) {
  const floors = homeFloors(state.home.id);
  const fl = floors[floorId];
  for (const r of fl.rooms) {
    if (r.lock && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return !!state.home.unlocked[r.lock];
  }
  return true;
}

export function slotUsable(state, slot) {
  if (!isFloorUnlocked(state, slot.floor)) return false;
  if (!isRoomUnlocked(state, slot.floor, slot.x, slot.y)) return false;
  if (slot.type === SLOT.DEFENSE && (slot.lv || 0) > defenseLevel(state)) return false;
  return true;
}

export function defenseLevel(state) {
  return state.progress?.prof?.defense?.lv ?? 0;
}

// Tiles blocked by furniture footprints (and locked rooms) on a floor.
export function blockedCells(state, floorId) {
  const set = new Set();
  for (const f of furnitureOn(state, floorId)) {
    for (let dy = 0; dy < f.h; dy++) for (let dx = 0; dx < f.w; dx++) set.add(cellKey(f.x + dx, f.y + dy));
  }
  const fl = homeFloors(state.home.id)[floorId];
  for (const r of fl.rooms) {
    if (r.lock && !state.home.unlocked[r.lock]) {
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) set.add(cellKey(x, y));
    }
  }
  return set;
}

// Walkable tile next to a piece of furniture where the survivor stands to use it.
export function interactionTile(state, f, from) {
  return interactionTiles(state, f, from)[0];
}

// Standing tiles next to an (empty) slot, for installing furniture or placing traps.
export function slotStandTiles(state, slotId, from) {
  const s = slotDef(state, slotId);
  if (!s) return [];
  const [w, h] = footprint(s.type);
  return interactionTiles(state, { floor: s.floor, x: s.x, y: s.y, w, h, slot: slotId }, from);
}

// All candidate standing tiles, nearest first (the route planner tries them in order).
export function interactionTiles(state, f, from) {
  const fl = homeFloors(state.home.id)[f.floor];
  const blocked = blockedCells(state, f.floor);
  const candidates = [];
  const slot = slotDef(state, f.slot);
  // Defense pieces and anything standing in the yard itself (the trapped veteran 42013 in the warehouse yard,
  // BUG-0003) are reached from the yard, as the survivor walks out to the defense line.
  const outside = slot?.type === SLOT.DEFENSE || cellAt(fl, f.x, f.y) === CELL.YARD;
  if (f.w === 0) {
    // wall/door/window items: stand on the adjacent inside tile
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ]) {
      const x = f.x + dx;
      const y = f.y + dy;
      const c = cellAt(fl, x, y);
      if ((c === CELL.FLOOR || c === CELL.OUTDOOR) && !blocked.has(cellKey(x, y))) candidates.push([x, y]);
    }
    if (!candidates.length) candidates.push([f.x, f.y + 1]);
  } else {
    for (let x = f.x - 1; x <= f.x + f.w; x++) {
      for (let y = f.y - 1; y <= f.y + f.h; y++) {
        const inside = x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h;
        const corner = (x === f.x - 1 || x === f.x + f.w) && (y === f.y - 1 || y === f.y + f.h);
        if (inside || corner) continue;
        const c = cellAt(fl, x, y);
        const open = c === CELL.FLOOR || c === CELL.OUTDOOR || c === CELL.STAIRS_UP || c === CELL.STAIRS_DOWN || (outside && c === CELL.YARD);
        if (open && !blocked.has(cellKey(x, y))) candidates.push([x, y]);
      }
    }
  }
  if (!candidates.length) return [[f.x, f.y]];
  if (from) candidates.sort((a, b) => Math.abs(a[0] - from.x) + Math.abs(a[1] - from.y) - (Math.abs(b[0] - from.x) + Math.abs(b[1] - from.y)));
  return candidates;
}

export function buildHome(state, homeId) {
  const def = HOMES[homeId];
  state.home = {
    id: homeId,
    slots: Object.fromEntries(def.slots.map((s) => [s.id, null])),
    unlocked: { '1F': true },
    repairs: {},
  };
  for (const fid of Object.keys(def.floors)) {
    if (!def.locks?.[fid]) state.home.unlocked[fid] = true;
  }
  for (const s of def.starter) {
    const cfg = s.furn;
    createFurniture(state, cfg, s.slot, { rename: s.rename, fixed: s.fixed });
    const f = furnitureAt(state, s.slot);
    // the starter workbench is broken until repaired (its manual) or worked out (Day 6); a legacy 'workbench'
    // stand-in of an older home definition likewise
    if (s.broken || cfg === 'workbench') f.broken = true;
    // the scene's own clutter (junk, debris, the basement rubble) the survivor clears to make room
    if (s.clutter) f.data.clutter = true;
    if (s.rubble) f.data.rubble = true;
    if (s.starterPot) f.data.decorPlant = true;
    if (s.off) f.on = false;
  }
}

// Place a furniture package from an inventory into a slot (Planning Mode "Install").
export function canInstall(state, cfg, slotId) {
  const slot = slotDef(state, slotId);
  if (!slot || state.home.slots[slotId]) return { ok: false, reason: 'occupied' };
  if (!slotUsable(state, slot)) return { ok: false, reason: 'locked' };
  const def = furnDef(cfg);
  const need = def.slot ?? def.type;
  if (!slotAccepts(slot.type, need)) return { ok: false, reason: 'slotType' };
  if (slot.trap && need !== SLOT.SMALL) return { ok: false, reason: 'slotType' };
  if (needsSky(cfg) && !slot.outdoor) return { ok: false, reason: 'outdoorOnly' };
  return { ok: true };
}

// Solar panels "can only be installed on the terrace" (config descriptions): outdoor slots only.
export function needsSky(cfg) {
  return typeof cfg === 'number' && furn(cfg)?.elec === ELEC.SOLAR;
}

// Slot compatibility: small furniture may sit in medium/large slots; wall/tabletop/bed/door/window/defense exact.
export function slotAccepts(slotType, furnSlot) {
  if (slotType === furnSlot) return true;
  const rank = { [SLOT.SMALL]: 1, [SLOT.MEDIUM]: 2, [SLOT.LARGE]: 3 };
  if (rank[slotType] && rank[furnSlot]) return rank[furnSlot] <= rank[slotType];
  return false;
}

export function installFurniture(state, cfg, slotId, opts = {}) {
  const chk = canInstall(state, cfg, slotId);
  if (!chk.ok) return chk;
  const f = createFurniture(state, cfg, slotId, opts);
  state.progress.installed[cfg] = (state.progress.installed[cfg] || 0) + 1;
  emit('furnitureInstalled', { uid: f.uid, cfg });
  return { ok: true, f };
}

// Move storage contents out before removing furniture; spill to a floor box if needed.
export function spillStorage(state, f, targetInvId) {
  if (!f.inv) return;
  const inv = state.inventories[f.inv];
  if (!inv) return;
  const target = state.inventories[targetInvId];
  for (const it of [...inv.items]) {
    inv.items.splice(inv.items.indexOf(it), 1);
    if (!target || !insert(target, it, { allowOverweight: true })) {
      dropToFloor(state, it, f.floor, f.x, f.y);
    }
  }
  destroyInventory(state, f.inv);
  f.inv = null;
}

// Floor cardboard boxes hold items dropped on the ground.
export function dropToFloor(state, inst, floor, x, y) {
  state.floorBoxes = state.floorBoxes || [];
  let box = state.floorBoxes.find((b) => b.floor === floor && Math.abs(b.x - x) + Math.abs(b.y - y) <= 1 && state.inventories[b.inv]);
  if (!box) {
    const inv = createInventory(state, { kind: 'floor', w: 8, h: 6, maxKg: null });
    if (isOutdoorTile(state, floor, x, y)) inv.outdoor = true;
    box = { id: `box${newUid(state)}`, floor, x, y, inv: inv.id };
    state.floorBoxes.push(box);
  }
  const inv = state.inventories[box.inv];
  if (!insert(inv, inst, { allowOverweight: true })) {
    inv.h += 2;
    insert(inv, inst, { allowOverweight: true });
  }
  return box;
}

// Terrace, balcony and yard tiles are open to the weather.
export function isOutdoorTile(state, floor, x, y) {
  const fl = state.home && homeFloors(state.home.id)[floor];
  const c = fl ? cellAt(fl, x, y) : null;
  return c === CELL.OUTDOOR || c === CELL.YARD;
}

export function dropNewItem(state, id, floor, x, y, opts) {
  return dropToFloor(state, makeInstance(state, id, opts), floor, x, y);
}

export function cleanupFloorBoxes(state) {
  state.floorBoxes = (state.floorBoxes || []).filter((b) => {
    const inv = state.inventories[b.inv];
    if (inv && inv.items.length === 0) {
      destroyInventory(state, b.inv);
      return false;
    }
    return !!inv;
  });
}

// Dismantle: returns materials (RemoveGet) as items dropped at the furniture.
export function dismantle(state, uid) {
  const f = state.furniture[uid];
  if (!f) return null;
  const def = furnDef(f.cfg);
  const mats = def.rmGet || [];
  spillStorage(state, f, state.player.backpack);
  removeFurniture(state, uid);
  const given = [];
  for (const id of mats) {
    if (!item(id)) continue;
    given.push(id);
    dropNewItem(state, id, f.floor, f.x, f.y);
  }
  state.progress.counters['furniture.dismantle'] = (state.progress.counters['furniture.dismantle'] || 0) + 1;
  return given;
}

// Repack installed furniture into its package item (moving it / returning it pre-disaster).
export function packUp(state, uid) {
  const f = state.furniture[uid];
  if (!f || typeof f.cfg === 'string') return null;
  const pkg = furnitureToPackage[f.cfg];
  spillStorage(state, f, state.player.backpack);
  removeFurniture(state, uid);
  if (pkg) return dropNewItem(state, pkg, f.floor, f.x, f.y);
  return null;
}

export function packageFurniture(itemId) {
  return packageToFurniture[itemId] || 0;
}

export function electricalKind(f) {
  if (typeof f.cfg === 'string') return ELEC.NONE;
  const d = furn(f.cfg);
  return d?.elec || ELEC.NONE;
}

export function doorAndWindows(state) {
  return homeFurniture(state).filter((f) => {
    const s = slotDef(state, f.slot);
    return s && (s.type === SLOT.DOOR || s.type === SLOT.WINDOW);
  });
}

export function frontDoor(state) {
  return homeFurniture(state).find((f) => slotDef(state, f.slot)?.type === SLOT.DOOR) || null;
}

export function effectiveMaxHp(f) {
  return (f.maxHp || 0) + (f.reinforce || 0);
}

export function storageInventories(state, filterFn) {
  const out = [];
  for (const f of homeFurniture(state)) {
    if (!f.inv) continue;
    if (filterFn && !filterFn(f)) continue;
    out.push(f.inv);
  }
  return out;
}
