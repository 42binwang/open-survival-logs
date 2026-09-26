import test from 'node:test';
import assert from 'node:assert/strict';
import { HOMES } from '../src/content/homes.js';
import { buildFloor, footprint, cellAt, CELL, cellKey } from '../src/sim/scene.js';
import { SLOT } from '../src/data/db.js';

const WALKABLE = new Set([CELL.FLOOR, CELL.OUTDOOR, CELL.STAIRS_UP, CELL.STAIRS_DOWN, CELL.DOOR, CELL.YARD]);

// With every slot occupied, every slot must still be usable from the spawn point.
function reachability(homeId) {
  const def = HOMES[homeId];
  const floors = Object.fromEntries(Object.entries(def.floors).map(([id, fd]) => [id, buildFloor(id, fd)]));
  const blocked = {};
  for (const id of Object.keys(floors)) blocked[id] = new Set();
  for (const s of def.slots) {
    const [w, h] = footprint(s.type);
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) blocked[s.floor].add(cellKey(s.x + dx, s.y + dy));
  }
  const seen = {};
  for (const id of Object.keys(floors)) seen[id] = new Set();
  const queue = [[def.spawn.floor, def.spawn.x, def.spawn.y]];
  const order = ['B1', '1F', '2F'];
  while (queue.length) {
    const [fid, x, y] = queue.shift();
    const k = cellKey(x, y);
    if (seen[fid].has(k)) continue;
    const fl = floors[fid];
    const c = cellAt(fl, x, y);
    if (!WALKABLE.has(c) || blocked[fid].has(k)) continue;
    seen[fid].add(k);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      queue.push([fid, x + dx, y + dy]);
    const fd = def.floors[fid];
    const i = order.indexOf(fid);
    if (fd.stairsUp && fd.stairsUp[0] === x && fd.stairsUp[1] === y && def.floors[order[i + 1]]?.stairsDown) {
      const to = def.floors[order[i + 1]].stairsDown;
      queue.push([order[i + 1], to[0], to[1]]);
    }
    if (fd.stairsDown && fd.stairsDown[0] === x && fd.stairsDown[1] === y && def.floors[order[i - 1]]?.stairsUp) {
      const to = def.floors[order[i - 1]].stairsUp;
      queue.push([order[i - 1], to[0], to[1]]);
    }
  }
  const problems = [];
  for (const s of def.slots) {
    if (s.type === SLOT.DEFENSE) continue; // outside the house: installed from the defense panel
    const [w, h] = footprint(s.type);
    const cw = Math.max(1, w);
    const ch = Math.max(1, h);
    // a piece on a wall (wall decor, a door, a window) is used from a floor tile beside it, never from a staircase
    // (src/sim/home.js interactionTiles)
    const onWall = !w || !h;
    let ok = false;
    for (let x = s.x - 1; x <= s.x + cw && !ok; x++) {
      for (let y = s.y - 1; y <= s.y + ch && !ok; y++) {
        const inside = x >= s.x && x < s.x + cw && y >= s.y && y < s.y + ch;
        const corner = (x === s.x - 1 || x === s.x + cw) && (y === s.y - 1 || y === s.y + ch);
        if (inside || corner) continue;
        const c = cellAt(floors[s.floor], x, y);
        if (onWall && c !== CELL.FLOOR && c !== CELL.OUTDOOR) continue;
        if (seen[s.floor].has(cellKey(x, y))) ok = true;
      }
    }
    if (!ok) problems.push(s.id);
  }
  for (const [fid, fd] of Object.entries(def.floors)) {
    for (const key of ['stairsUp', 'stairsDown']) {
      if (fd[key] && !seen[fid].has(cellKey(fd[key][0], fd[key][1]))) problems.push(`${fid}:${key}`);
    }
  }
  if (def.rooftopLine) {
    const { floor, x, y } = def.rooftopLine;
    if (!seen[floor].has(cellKey(x, y))) problems.push(`${floor}:basket`);
  }
  return problems;
}

for (const homeId of Object.keys(HOMES)) {
  test(`${homeId}: every slot, staircase and the basket stay reachable with all slots filled`, () => {
    assert.deepEqual(reachability(homeId), []);
  });
}

test('every slot id of a home is its own, and every starter piece has a slot of its own', () => {
  for (const [homeId, def] of Object.entries(HOMES)) {
    const ids = def.slots.map((s) => s.id);
    assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], homeId);
    const starters = def.starter.map((s) => s.slot);
    assert.deepEqual(starters.filter((id, i) => starters.indexOf(id) !== i), [], `${homeId}: one starter piece per slot`);
  }
});
