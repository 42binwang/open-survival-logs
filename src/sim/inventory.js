// Grid ("Tetris") inventories with kg weight. Every container in the game uses this:
// backpack, furniture storage, fridges, car trunk, shopping cart, drone cargo hold, floor boxes.
import { item } from '../data/db.js';

export function newUid(state) {
  state.nextUid = (state.nextUid || 1) + 1;
  return state.nextUid;
}

export function createInventory(state, { kind, w, h, maxKg = null, label = '', owner = null, cold = 0, tag = 0 }) {
  const id = `inv${newUid(state)}`;
  state.inventories[id] = { id, kind, w, h, maxKg, label, owner, cold, tag, items: [] };
  return state.inventories[id];
}

export function getInv(state, invId) {
  return state.inventories[invId];
}

export function destroyInventory(state, invId) {
  delete state.inventories[invId];
}

export function makeInstance(state, id, opts = {}) {
  const cfg = item(id);
  if (!cfg) throw new Error(`unknown item ${id}`);
  return {
    uid: newUid(state),
    id,
    x: 0,
    y: 0,
    r: false,
    qty: opts.qty ?? 1,
    uses: opts.uses ?? (cfg.uses > 0 ? cfg.uses : cfg.uses),
    age: opts.age ?? 0, // effective days of shelf life consumed
    mold: 0,
    data: opts.data ?? null,
  };
}

export function dims(inst) {
  const cfg = item(inst.id);
  const [w, h] = cfg?.size || [1, 1];
  return inst.r ? [h, w] : [w, h];
}

export function instWeightG(inst) {
  const cfg = item(inst.id);
  if (!cfg) return 0;
  let g = cfg.g * (inst.qty || 1);
  if (cfg.uses > 1 && inst.uses > 0 && inst.uses < cfg.uses) g = Math.ceil((g * inst.uses) / cfg.uses);
  if (inst.left < 1) g = Math.ceil(g * inst.left);
  return g;
}

export function weightG(inv) {
  let g = 0;
  for (const it of inv.items) g += instWeightG(it);
  return g;
}

export function weightKg(inv) {
  return weightG(inv) / 1000;
}

function overlaps(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export function canPlaceAt(inv, inst, x, y, rotated = inst.r, ignoreUid = inst.uid) {
  const cfg = item(inst.id);
  const [bw, bh] = cfg?.size || [1, 1];
  const [w, h] = rotated ? [bh, bw] : [bw, bh];
  if (x < 0 || y < 0 || x + w > inv.w || y + h > inv.h) return false;
  for (const other of inv.items) {
    if (other.uid === ignoreUid) continue;
    const [ow, oh] = dims(other);
    if (overlaps(x, y, w, h, other.x, other.y, ow, oh)) return false;
  }
  return true;
}

export function findSpot(inv, inst) {
  for (const rotated of [inst.r, !inst.r]) {
    for (let y = 0; y < inv.h; y++) {
      for (let x = 0; x < inv.w; x++) {
        if (canPlaceAt(inv, inst, x, y, rotated)) return { x, y, r: rotated };
      }
    }
  }
  return null;
}

export function fitsWeight(inv, inst) {
  if (inv.maxKg == null) return true;
  return weightG(inv) + instWeightG(inst) <= inv.maxKg * 1000;
}

// Try to stack onto an existing stack of the same item.
function tryStack(inv, inst) {
  const cfg = item(inst.id);
  if (!cfg || cfg.stack <= 1) return false;
  for (const other of inv.items) {
    if (other.id === inst.id && other.qty < cfg.stack && Math.abs((other.age || 0) - (inst.age || 0)) < 0.5) {
      const room = cfg.stack - other.qty;
      const move = Math.min(room, inst.qty);
      other.qty += move;
      inst.qty -= move;
      if (inst.qty <= 0) return true;
    }
  }
  return false;
}

// Insert an existing instance. Returns true on success. `allowOverweight` lets the backpack go past its
// kg limit (the survivor becomes Encumbered) while grid space stays a hard limit.
export function insert(inv, inst, { x, y, allowOverweight = false } = {}) {
  if (!allowOverweight && !fitsWeight(inv, inst)) return false;
  if (tryStack(inv, inst)) return true;
  if (x != null && y != null) {
    if (!canPlaceAt(inv, inst, x, y)) return false;
    inst.x = x;
    inst.y = y;
  } else {
    const spot = findSpot(inv, inst);
    if (!spot) return false;
    inst.x = spot.x;
    inst.y = spot.y;
    inst.r = spot.r;
  }
  inv.items.push(inst);
  return true;
}

export function addItem(state, inv, id, opts = {}) {
  const inst = makeInstance(state, id, opts);
  return insert(inv, inst, opts) ? inst : null;
}

// Add n copies; returns the list that fit.
export function addItems(state, inv, id, n, opts = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const inst = addItem(state, inv, id, opts);
    if (!inst) break;
    out.push(inst);
  }
  return out;
}

export function removeUid(inv, uid) {
  const i = inv.items.findIndex((it) => it.uid === uid);
  if (i < 0) return null;
  return inv.items.splice(i, 1)[0];
}

export function findUid(inv, uid) {
  return inv.items.find((it) => it.uid === uid) || null;
}

export function locateUid(state, uid) {
  for (const inv of Object.values(state.inventories)) {
    const inst = findUid(inv, uid);
    if (inst) return { inv, inst };
  }
  return null;
}

// Move an item between inventories (or within one). If (x, y) is occupied by exactly one other item,
// the two swap places when both fit; same-item stacks merge.
export function moveItem(state, fromInv, uid, toInv, x, y, { allowOverweight = false, rotate = null } = {}) {
  const inst = findUid(fromInv, uid);
  if (!inst) return { ok: false, reason: 'missing' };
  const wasR = inst.r;
  if (rotate != null) inst.r = rotate;
  if (fromInv !== toInv && !allowOverweight && !fitsWeight(toInv, inst)) {
    inst.r = wasR;
    return { ok: false, reason: 'weight' };
  }
  if (x == null || y == null) {
    removeUid(fromInv, uid);
    if (insert(toInv, inst, { allowOverweight })) return { ok: true };
    insert(fromInv, inst, { x: inst.x, y: inst.y, allowOverweight: true });
    inst.r = wasR;
    return { ok: false, reason: 'space' };
  }
  if (canPlaceAt(toInv, inst, x, y, inst.r, fromInv === toInv ? inst.uid : -1)) {
    removeUid(fromInv, uid);
    inst.x = x;
    inst.y = y;
    toInv.items.push(inst);
    return { ok: true };
  }
  // swap / merge with a single occupant
  const [w, h] = dims(inst);
  const occupants = toInv.items.filter((o) => {
    if (o.uid === inst.uid) return false;
    const [ow, oh] = dims(o);
    return overlaps(x, y, w, h, o.x, o.y, ow, oh);
  });
  if (occupants.length === 1) {
    const other = occupants[0];
    const cfg = item(inst.id);
    if (other.id === inst.id && cfg.stack > 1 && other.qty < cfg.stack) {
      const move = Math.min(cfg.stack - other.qty, inst.qty);
      other.qty += move;
      inst.qty -= move;
      if (inst.qty <= 0) removeUid(fromInv, uid);
      return { ok: true, merged: true };
    }
    const [ow, oh] = dims(other);
    if (ow === w && oh === h) {
      const ox = other.x;
      const oy = other.y;
      removeUid(toInv, other.uid);
      removeUid(fromInv, uid);
      other.x = inst.x;
      other.y = inst.y;
      inst.x = ox;
      inst.y = oy;
      toInv.items.push(inst);
      fromInv.items.push(other);
      return { ok: true, swapped: true };
    }
    inst.r = wasR;
    return { ok: false, reason: 'size' };
  }
  inst.r = wasR;
  return { ok: false, reason: 'space' };
}

export function count(inv, id) {
  let n = 0;
  for (const it of inv.items) if (it.id === id) n += it.qty || 1;
  return n;
}

export function countIn(state, invIds, id) {
  let n = 0;
  for (const invId of invIds) {
    const inv = state.inventories[invId];
    if (inv) n += count(inv, id);
  }
  return n;
}

// Remove n units of an item id from a list of inventories (in order). Returns removed count.
export function takeFrom(state, invIds, id, n) {
  let left = n;
  for (const invId of invIds) {
    const inv = state.inventories[invId];
    if (!inv) continue;
    for (const it of [...inv.items]) {
      if (left <= 0) break;
      if (it.id !== id) continue;
      const take = Math.min(left, it.qty || 1);
      it.qty = (it.qty || 1) - take;
      left -= take;
      if (it.qty <= 0) removeUid(inv, it.uid);
    }
    if (left <= 0) break;
  }
  return n - left;
}

// Spend one use of a multi-use item (sprays, bottles); single-use items are taken whole.
export function useOnce(state, invIds, id) {
  const cfg = item(id);
  if (!(cfg?.uses > 1)) return takeFrom(state, invIds, id, 1) > 0;
  for (const invId of invIds) {
    const inv = state.inventories[invId];
    const it = inv?.items.find((i) => i.id === id);
    if (!it) continue;
    it.uses = (it.uses ?? cfg.uses) - 1;
    if (it.uses <= 0) removeUid(inv, it.uid);
    return true;
  }
  return false;
}

export function filter(inv, pred) {
  return inv.items.filter((it) => pred(it, item(it.id)));
}

export function usedCells(inv) {
  let n = 0;
  for (const it of inv.items) {
    const [w, h] = dims(it);
    n += w * h;
  }
  return n;
}

export function freeCells(inv) {
  return inv.w * inv.h - usedCells(inv);
}

// Compact layout: re-pack items largest-first (the "One-Click Organize" button).
export function organize(inv) {
  const list = inv.items.slice().sort((a, b) => {
    const [aw, ah] = dims(a);
    const [bw, bh] = dims(b);
    return bw * bh - aw * ah || a.id - b.id;
  });
  inv.items = [];
  const leftovers = [];
  for (const it of list) {
    if (!insert(inv, it, { allowOverweight: true })) leftovers.push(it);
  }
  return leftovers;
}
