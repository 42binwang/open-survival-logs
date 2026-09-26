// Tile grids and pathfinding shared by the safehouse, shops and exploration sites.
import { SLOT } from '../data/db.js';

export const CELL = {
  VOID: 0,
  FLOOR: 1,
  WALL: 2,
  DOOR: 3,
  WINDOW: 4,
  STAIRS_UP: 5,
  STAIRS_DOWN: 6,
  OUTDOOR: 7, // terrace / balcony: indoors-reachable but exposed to weather and sun
  YARD: 8, // outside the front wall: street and defense line
};

export function footprint(slotType) {
  switch (slotType) {
    case SLOT.SMALL:
    case SLOT.TABLETOP:
    case SLOT.DEFENSE:
      return [1, 1];
    case SLOT.MEDIUM:
    case SLOT.BED:
      return [2, 1];
    case SLOT.LARGE:
      return [2, 2];
    default:
      return [0, 0];
  }
}

// Build a floor grid from a floor definition (see content/homes.js).
export function buildFloor(id, def) {
  const yardH = def.yard ? def.yard[3] : 0;
  const w = def.w;
  const h = def.h + yardH;
  const cells = new Array(w * h).fill(CELL.VOID);
  const set = (x, y, v) => {
    if (x >= 0 && y >= 0 && x < w && y < h) cells[y * w + x] = v;
  };
  for (let y = 0; y < def.h; y++) {
    for (let x = 0; x < w; x++) {
      const border = x === 0 || y === 0 || x === w - 1 || y === def.h - 1;
      set(x, y, border ? CELL.WALL : CELL.FLOOR);
    }
  }
  for (const [x1, y1, x2, y2] of def.walls || []) {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++)
      for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) set(x, y, CELL.WALL);
  }
  for (const [x, y] of def.gaps || []) set(x, y, CELL.FLOOR);
  if (def.terrace) {
    const [tx, ty, tw, th] = def.terrace;
    for (let y = ty; y < ty + th; y++) for (let x = tx; x < tx + tw; x++) set(x, y, CELL.OUTDOOR);
    if (def.terraceWall != null) {
      for (let x = 1; x < w - 1; x++) if (x < tx || x >= tx + tw) set(x, def.terraceWall, CELL.WALL);
      for (let x = tx; x < tx + tw; x++) set(x, def.terraceWall, x === tx + 1 ? CELL.FLOOR : CELL.WALL);
    }
  }
  if (def.yard) {
    for (let y = def.h; y < h; y++) for (let x = 0; x < w; x++) set(x, y, CELL.YARD);
  }
  if (def.door) set(def.door[0], def.door[1], CELL.DOOR);
  for (const [x, y] of def.windows || []) set(x, y, CELL.WINDOW);
  if (def.stairsUp) set(def.stairsUp[0], def.stairsUp[1], CELL.STAIRS_UP);
  if (def.stairsDown) set(def.stairsDown[0], def.stairsDown[1], CELL.STAIRS_DOWN);
  return { id, w, h, innerH: def.h, cells, rooms: def.rooms || [], def };
}

export function cellAt(floor, x, y) {
  if (x < 0 || y < 0 || x >= floor.w || y >= floor.h) return CELL.VOID;
  return floor.cells[y * floor.w + x];
}

export function isOpenCell(c, { outside = false } = {}) {
  if (c === CELL.FLOOR || c === CELL.OUTDOOR || c === CELL.STAIRS_UP || c === CELL.STAIRS_DOWN) return true;
  if (c === CELL.DOOR) return true;
  if (c === CELL.YARD) return outside;
  return false;
}

const key = (x, y) => y * 1024 + x;

// A* on one floor. blocked: Set of keys. Returns array of [x, y] from start (exclusive) to goal (inclusive).
export function findPath(floor, sx, sy, gx, gy, blocked = new Set(), opts = {}) {
  if (sx === gx && sy === gy) return [];
  const open = [[sx, sy]];
  const g = new Map([[key(sx, sy), 0]]);
  const f = new Map([[key(sx, sy), Math.abs(gx - sx) + Math.abs(gy - sy)]]);
  const came = new Map();
  const closed = new Set();
  const passable = (x, y) => {
    if (x === gx && y === gy) {
      if (opts.goalAnyCell) return true;
      // by default the goal may sit on a blocked open tile (a fixture); strictGoal requires a free tile
      if (opts.strictGoal && blocked.has(key(x, y))) return false;
      return isOpenCell(cellAt(floor, x, y), opts);
    }
    if (blocked.has(key(x, y))) return false;
    return isOpenCell(cellAt(floor, x, y), opts);
  };
  let guard = 0;
  while (open.length && guard++ < 20000) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f.get(key(...open[i])) < f.get(key(...open[bi]))) bi = i;
    const [cx, cy] = open.splice(bi, 1)[0];
    const ck = key(cx, cy);
    if (cx === gx && cy === gy) {
      const path = [];
      let k = ck;
      while (came.has(k)) {
        path.push([k % 1024, Math.floor(k / 1024)]);
        k = came.get(k);
      }
      return path.reverse();
    }
    closed.add(ck);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cx + dx;
      const ny = cy + dy;
      const nk = key(nx, ny);
      if (closed.has(nk) || !passable(nx, ny)) continue;
      const ng = g.get(ck) + 1;
      if (ng < (g.get(nk) ?? Infinity)) {
        came.set(nk, ck);
        g.set(nk, ng);
        f.set(nk, ng + Math.abs(gx - nx) + Math.abs(gy - ny));
        if (!open.some(([ox, oy]) => ox === nx && oy === ny)) open.push([nx, ny]);
      }
    }
  }
  return null;
}

export { key as cellKey };
