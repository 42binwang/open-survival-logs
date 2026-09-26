// @ts-check
// The view model: everything a renderer draws for the current scene. `buildView(state)` in src/ui/view.js builds it
// (homeView for the safehouse; the builders registered with registerView for shops and exploration sites), and both
// renderers (src/render/iso.js, src/render3d/) read only the view, never the sim. Frozen for P0: fields are only
// added, as optional fields, through an interface request to the architect. `checkView` guards the shape; the gate's
// contracts check runs it on live views of every scene type.

export { hourOfDay, daylight, isNight } from '../sim/time.js';

/**
 * Tile codes of a floor grid, identical to `CELL` in src/sim/scene.js (the gate compares them).
 */
export const CELL = Object.freeze({
  VOID: 0,
  FLOOR: 1,
  WALL: 2,
  DOOR: 3,
  WINDOW: 4,
  STAIRS_UP: 5,
  STAIRS_DOWN: 6,
  OUTDOOR: 7, // terrace / balcony: reachable from inside, exposed to weather and sun
  YARD: 8, // outside the front wall: the street and the defense line
});

/** Entity kinds a renderer must be able to draw. */
export const ENTITY_KINDS = Object.freeze(['player', 'zombie', 'big', 'npc', 'raider']);

/** `state.weather.today.kind` values, identical to `WEATHER_KINDS` in src/sim/weather.js. */
export const WEATHER_KINDS = Object.freeze(['sunny', 'cloudy', 'rain', 'heavyRain', 'storm', 'snow', 'freezingRain', 'coldWave']);

/**
 * @typedef {object} Text
 * @property {string} en
 * @property {string} zh
 */

/**
 * @typedef {object} Point
 * @property {number} x
 * @property {number} y
 */

/**
 * A rectangle of a floor: a room, the terrace, a locked area.
 * @typedef {object} Room
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {Text} [label]
 * @property {string} [lock]  key in `state.home.unlocked`; the room is locked until it is set
 * @property {boolean} [cold]  cold storage
 * @property {boolean} [outdoor]  exposed to the weather (terrace)
 */

/**
 * One floor as a tile grid (`buildFloor` in src/sim/scene.js). Tile (x, y) covers [x, x + 1) × [y, y + 1); rows
 * `innerH … h − 1` are the yard strip in front of the building. Positions elsewhere in the view use the same units.
 * @typedef {object} FloorGrid
 * @property {string} id
 * @property {number} w  columns
 * @property {number} h  rows, including the yard strip
 * @property {number} innerH  rows of the building itself
 * @property {number[]} cells  row-major `CELL` codes, length w × h
 * @property {Room[]} rooms
 * @property {object} [def]  the authored definition the grid was built from (content/homes.js, shops, sites)
 */

/**
 * Crop summary of a planter (`summarize` in src/sim/farming.js).
 * @typedef {object} PlantView
 * @property {number} growth  0 … 1
 * @property {boolean} [ready]
 * @property {boolean} [withered]
 * @property {boolean} [pest]
 * @property {boolean} [weed]
 * @property {boolean} [dry]
 * @property {boolean} [decor]  a houseplant: always grown, never harvested
 * @property {number} [plantId]  Config_Plant id
 * @property {number} [count]  crops in the planter
 */

/**
 * The part of `f.data` renderers read; systems keep more in it.
 * @typedef {object} FurnitureData
 * @property {PlantView | null} [plant]
 * @property {string} [soil]  planters: 'tilled' | 'untilled'
 * @property {boolean} [cooking]
 * @property {boolean} [crafting]
 * @property {boolean} [breached]  a door or window the horde broke through
 */

/**
 * A piece of furniture, a shop fixture or a site fixture. At home it is a per-frame copy of the `state.furniture`
 * instance with `hpRatio` added (never write it; act on a piece through its uid); shops and sites build plain objects. Its look is not part of the view: a renderer finds the
 * model and its per-part materials through the asset manifests (`bindings[cfg]`, `resolveMaterials` in
 * src/contracts/assets.js) and seeds the variation with `instanceSeed(uid, part)`.
 * @typedef {object} ViewFurniture
 * @property {number | string} uid  home: numeric uid; shops `fx:<shop>:<id>`; sites `x:<id>`
 * @property {number | string} cfg  Config_Furniture id, or a SCENERY key of src/content/homes.js: 'trap', or a stand-in
 *   ('workbench', 'radio', …) a save from before the homes placed config pieces still holds
 * @property {number} x
 * @property {number} y
 * @property {number} w  footprint in tiles; 0 × 0 for doors, windows and wall pieces (drawn on their wall tile)
 * @property {number} h
 * @property {string} [floor]
 * @property {string} [slot]
 * @property {number} [hp]
 * @property {number} [maxHp]
 * @property {number} [reinforce]  extra hit points from reinforcement
 * @property {number} [hpRatio]  0 … 1: hp / effectiveMaxHp(f) (maxHp + reinforce), the sim's own measure of wear,
 *   set by the view builder for every piece with hit points; damage states read it (assets.js `modelVariant`), and
 *   renderers never re-derive it from hp and maxHp
 * @property {boolean} [on]
 * @property {boolean} [powered]  false: it needs power and has none
 * @property {boolean} [broken]
 * @property {boolean} [exclaim]  something to notice: a catch in a trap, unclaimed loot, a hidden box
 * @property {FurnitureData} [data]
 */

/**
 * A cardboard box on the floor (`state.floorBoxes`), or cargo piled on a shop cart (no id: not pickable).
 * @typedef {object} ViewBox
 * @property {string | number} [id]
 * @property {number} x
 * @property {number} y
 * @property {string} [floor]
 */

/**
 * Someone on the floor. x / y carry fractions while walking; the figure stands at the tile center (x + 0.5, y + 0.5).
 * @typedef {object} ViewEntity
 * @property {number} x
 * @property {number} y
 * @property {string} kind  one of ENTITY_KINDS
 * @property {string} [color]  body color (CSS)
 * @property {string} [head]  head color (CSS)
 * @property {boolean} [sleeping]
 * @property {number} [hp]
 * @property {number} [maxHp]
 * @property {string} [label]  name tag
 * @property {string} [floor]
 * @property {boolean} [moving]  the sim is stepping it to the next tile this frame (the survivor's walk phase, a
 *   zombie's step); absent where the sim keeps no motion state
 * @property {number[]} [heading]  [dx, dy] of that step in tile axes (x east, y south), each −1, 0 or 1; only while moving
 * @property {ViewAction} [action]  what the survivor is doing (the sim's current action); zombies have none
 * @property {string | number} [id]  the sim's own id of a zombie or raider (stable while it lives): renderers match
 *   figures across frames and pick a zombie's look by it
 * @property {string} [character]  the survivor only: the playable character (src/content/characters.js id, `state.meta.character`),
 *   so a renderer can draw that character's model
 */

/**
 * The survivor's current action as the sim runs it (`state.actions.current`).
 * @typedef {object} ViewAction
 * @property {string} kind  the action kind ('walk', 'sleep', 'cook', …; src/sim/actions.js registerKind)
 * @property {'walk' | 'work'} phase  walking to the target, or working at it
 * @property {number} [progress]  0 … 1 of the work phase: elapsed / (dur × actionTimeMult); absent for open-ended work
 */

/**
 * A fire on the ground (a molotov): radius in tiles, burning until `clock.t` reaches `until`.
 * @typedef {object} Fire
 * @property {number} x
 * @property {number} y
 * @property {number} [r]
 * @property {number} [dps]
 * @property {number} [until]
 */

/**
 * A furniture slot outlined in Planning Mode.
 * @typedef {object} PlanSlot
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {boolean} free  nothing is installed in it
 * @property {boolean} valid  the selected package fits here
 */

/**
 * The game clock (`state.clock`, src/sim/time.js). Derive the time of day with `hourOfDay` / `daylight` / `isNight`.
 * @typedef {object} Clock
 * @property {number} t  game seconds since the loop started
 * @property {number} startHour  hour of day at t = 0
 * @property {number} [outbreakAt]
 * @property {number} [speed]
 * @property {boolean} [relaxed]
 */

/**
 * Today's weather (`state.weather.today`, src/sim/weather.js).
 * @typedef {object} WeatherDay
 * @property {number} day
 * @property {string} kind  one of WEATHER_KINDS
 * @property {number} [mean]  daily mean, in °C like low, high and temp
 * @property {number} [low]
 * @property {number} [high]
 * @property {number} [temp]  current outside temperature
 * @property {number} [sun]  0 … 1 share of full sunlight
 */

/**
 * A scene to draw. The fields after `floorsAvailable` are read by src/main.js (camera and input), not by renderers.
 * @typedef {object} SceneView
 * @property {FloorGrid} floor
 * @property {string} floorId  '1F' | '2F' | 'B1' at home; the shop floor; `site:<id>` at sites
 * @property {ViewFurniture[]} furniture
 * @property {ViewBox[]} boxes
 * @property {ViewEntity[]} entities
 * @property {Clock} clock
 * @property {WeatherDay | null} [weather]  none in the basement and in shops
 * @property {boolean} [lightsOn]  electric lights are on (at home: at night, with power); the Canvas renderer's rule.
 *   A renderer that schedules its own lamps reads the facts below instead
 * @property {string} [home]  at home: the home id (src/content/homes.js HOMES: 'apartment', 'duplex', 'warehouse')
 * @property {boolean} [powered]  at home: the house has power from the grid, a generator or the batteries
 *   (`state.power.homePowered`)
 * @property {boolean} [lightsPowered]  at home: the lights circuit got its share of the power (false when a shortage
 *   sheds it, or the wiring is damaged; `state.power.lightsPowered`)
 * @property {boolean} [lightsSwitchedOff]  at home: the survivor switched the lights off in the power panel
 *   (`state.power.lightsOff`)
 * @property {boolean} [basement]  underground: no daylight
 * @property {boolean} [indoorDark]  dark without power (basement) or a dark site
 * @property {Point | null} [flashlight]  the survivor's torch: outside its circle everything is black
 * @property {Fire[]} [fires]
 * @property {PlanSlot[] | null} [slots]  Planning Mode outlines
 * @property {string} [bg]  clear color behind the floor (CSS)
 * @property {boolean} [noWeather]  no rain, snow or storm effects even when `weather` is set
 * @property {(x: number, y: number) => Room | undefined} roomAt
 * @property {(x: number, y: number) => boolean} locked  tile is in a locked floor or room (drawn dark)
 * @property {string[]} floorsAvailable
 * @property {Point | null} [focus]  where the camera looks instead of the survivor
 * @property {(wx: number, wy: number, e: MouseEvent) => boolean | void} [onClick]  consumes the click unless it returns false
 * @property {(f: ViewFurniture) => unknown[]} [extraMenu]  extra context-menu entries for a piece
 */

/**
 * Nothing to draw: no run (the title screen).
 * @typedef {object} EmptyView
 * @property {null} floor
 */

/** @typedef {SceneView | EmptyView} View */

// ------------------------------------------------------------------------------------------ helpers

/**
 * The `CELL` code at a tile; VOID outside the grid.
 * @param {FloorGrid} floor
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function cellAt(floor, x, y) {
  if (x < 0 || y < 0 || x >= floor.w || y >= floor.h) return CELL.VOID;
  return floor.cells[y * floor.w + x];
}

// ------------------------------------------------------------------------------------------ shape check

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
/** @param {unknown} v @returns {v is number} */
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
/** @param {unknown} v */
const isOptBool = (v) => v === undefined || typeof v === 'boolean';
/** @param {unknown} v */
const isId = (v) => typeof v === 'string' || isNum(v);

/**
 * @param {string[]} out
 * @param {string} at
 * @param {Record<string, unknown>} o
 * @param {string[]} keys
 */
function numbers(out, at, o, keys) {
  for (const k of keys) if (!isNum(o[k])) out.push(`${at}.${k}: expected a number, got ${typeof o[k]}`);
}

/**
 * @param {string[]} out
 * @param {string} at
 * @param {Record<string, unknown>} o
 * @param {string[]} keys
 */
function optionalBooleans(out, at, o, keys) {
  for (const k of keys) if (!isOptBool(o[k])) out.push(`${at}.${k}: expected a boolean or nothing`);
}

/**
 * @param {string[]} out
 * @param {string} at
 * @param {unknown} v
 * @param {boolean} nullable
 */
function point(out, at, v, nullable) {
  if (v === undefined || (nullable && v === null)) return;
  if (!isObj(v)) out.push(`${at}: expected {x, y}${nullable ? ' or null' : ''}`);
  else numbers(out, at, v, ['x', 'y']);
}

/**
 * @param {string[]} out
 * @param {unknown} floor
 */
function checkFloor(out, floor) {
  if (!isObj(floor)) return void out.push('floor: expected a floor grid or null');
  if (typeof floor.id !== 'string') out.push('floor.id: expected a string');
  numbers(out, 'floor', floor, ['w', 'h', 'innerH']);
  const { w, h, innerH, cells, rooms } = floor;
  if (isNum(w) && isNum(h)) {
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) out.push(`floor: bad size ${w} × ${h}`);
    if (isNum(innerH) && (innerH < 1 || innerH > h)) out.push(`floor.innerH: ${innerH} outside 1 … ${h}`);
    if (!Array.isArray(cells) || cells.length !== w * h) out.push(`floor.cells: expected ${w * h} tile codes`);
    else {
      const codes = new Set(Object.values(CELL));
      const bad = cells.findIndex((c) => !codes.has(c));
      if (bad >= 0) out.push(`floor.cells[${bad}]: unknown tile code ${cells[bad]}`);
    }
  }
  if (!Array.isArray(rooms)) return void out.push('floor.rooms: expected an array');
  rooms.forEach((r, i) => {
    if (!isObj(r)) return void out.push(`floor.rooms[${i}]: expected an object`);
    if (typeof r.id !== 'string') out.push(`floor.rooms[${i}].id: expected a string`);
    numbers(out, `floor.rooms[${i}]`, r, ['x', 'y', 'w', 'h']);
    optionalBooleans(out, `floor.rooms[${i}]`, r, ['cold', 'outdoor']);
  });
}

/**
 * @param {string[]} out
 * @param {string} at
 * @param {unknown} list
 * @param {(out: string[], at: string, item: Record<string, unknown>) => void} each
 * @param {{ optional?: boolean, nullable?: boolean }} [opts]
 */
function list(out, at, list, each, opts = {}) {
  if ((opts.optional && list === undefined) || (opts.nullable && list === null)) return;
  if (!Array.isArray(list)) return void out.push(`${at}: expected an array`);
  list.forEach((item, i) => (isObj(item) ? each(out, `${at}[${i}]`, item) : out.push(`${at}[${i}]: expected an object`)));
}

/**
 * Checks a view against this contract. Returns the problems found, as `path: problem` lines (empty when it conforms).
 * @param {unknown} view
 * @returns {string[]}
 */
export function checkView(view) {
  /** @type {string[]} */
  const out = [];
  if (!isObj(view)) return ['view: expected an object'];
  if (view.floor === null) return out;
  checkFloor(out, view.floor);
  if (typeof view.floorId !== 'string') out.push('floorId: expected a string');
  list(out, 'furniture', view.furniture, (o, at, f) => {
    if (!isId(f.uid)) o.push(`${at}.uid: expected a string or number`);
    if (!isId(f.cfg)) o.push(`${at}.cfg: expected a config id or scenery key`);
    numbers(o, at, f, ['x', 'y', 'w', 'h']);
    optionalBooleans(o, at, f, ['on', 'powered', 'broken', 'exclaim']);
    for (const k of ['hp', 'maxHp', 'reinforce']) if (f[k] != null && !isNum(f[k])) o.push(`${at}.${k}: expected a number`);
    if (f.hpRatio !== undefined && !(isNum(f.hpRatio) && f.hpRatio >= 0 && f.hpRatio <= 1)) o.push(`${at}.hpRatio: expected 0 … 1`);
    else if (isNum(f.hpRatio) && isNum(f.hp) && isNum(f.maxHp) && f.maxHp > 0) {
      const want = Math.min(1, Math.max(0, f.hp / (f.maxHp + (isNum(f.reinforce) ? f.reinforce : 0))));
      if (Math.abs(f.hpRatio - want) > 1e-9) o.push(`${at}.hpRatio: ${f.hpRatio} is not hp / (maxHp + reinforce) = ${want}`);
    }
    if (f.data === undefined) return;
    if (!isObj(f.data)) return void o.push(`${at}.data: expected an object`);
    optionalBooleans(o, `${at}.data`, f.data, ['cooking', 'crafting', 'breached']);
    const p = f.data.plant;
    if (p != null && (!isObj(p) || !isNum(p.growth))) o.push(`${at}.data.plant: expected a crop summary with a growth number`);
  });
  list(out, 'boxes', view.boxes, (o, at, b) => {
    numbers(o, at, b, ['x', 'y']);
    if (b.id !== undefined && !isId(b.id)) o.push(`${at}.id: expected a string or number`);
  });
  list(out, 'entities', view.entities, (o, at, e) => {
    numbers(o, at, e, ['x', 'y']);
    if (typeof e.kind !== 'string' || !ENTITY_KINDS.includes(e.kind)) o.push(`${at}.kind: '${e.kind}' is not one of ${ENTITY_KINDS.join(', ')}`);
    optionalBooleans(o, at, e, ['sleeping', 'moving']);
    if (e.id !== undefined && !isId(e.id)) o.push(`${at}.id: expected a string or number`);
    if (e.character !== undefined) {
      if (typeof e.character !== 'string' || !e.character) o.push(`${at}.character: expected a character id`);
      else if (e.kind !== 'player') o.push(`${at}.character: only on the player`);
    }
    for (const k of ['hp', 'maxHp']) if (e[k] != null && !isNum(e[k])) o.push(`${at}.${k}: expected a number`);
    if (e.heading !== undefined) {
      const hd = e.heading;
      if (!(Array.isArray(hd) && hd.length === 2 && hd.every((v) => v === -1 || v === 0 || v === 1) && (hd[0] || hd[1]))) o.push(`${at}.heading: expected [dx, dy] of a step, each -1, 0 or 1`);
      else if (e.moving !== true) o.push(`${at}.heading: only while moving`);
    }
    if (e.action !== undefined) {
      const a = e.action;
      if (!isObj(a)) o.push(`${at}.action: expected { kind, phase, progress? }`);
      else {
        if (typeof a.kind !== 'string' || !a.kind) o.push(`${at}.action.kind: expected an action kind`);
        if (a.phase !== 'walk' && a.phase !== 'work') o.push(`${at}.action.phase: expected 'walk' or 'work'`);
        if (a.progress !== undefined && !(isNum(a.progress) && a.progress >= 0 && a.progress <= 1)) o.push(`${at}.action.progress: expected 0 … 1`);
        if (a.progress !== undefined && a.phase !== 'work') o.push(`${at}.action.progress: only in the work phase`);
      }
    }
  });
  if (!isObj(view.clock)) out.push('clock: expected the game clock');
  else numbers(out, 'clock', view.clock, ['t', 'startHour']);
  const w = view.weather;
  if (w != null) {
    if (!isObj(w)) out.push('weather: expected a weather day or null');
    else if (typeof w.kind !== 'string' || !WEATHER_KINDS.includes(w.kind)) out.push(`weather.kind: '${w.kind}' is not one of ${WEATHER_KINDS.join(', ')}`);
  }
  optionalBooleans(out, 'view', view, ['lightsOn', 'basement', 'indoorDark', 'noWeather', 'powered', 'lightsPowered', 'lightsSwitchedOff']);
  if (view.home !== undefined) {
    if (typeof view.home !== 'string' || !view.home) out.push('home: expected a home id');
    for (const k of ['powered', 'lightsPowered', 'lightsSwitchedOff']) if (typeof view[k] !== 'boolean') out.push(`${k}: a home view states it (true or false)`);
  }
  point(out, 'flashlight', view.flashlight, true);
  point(out, 'focus', view.focus, true);
  list(out, 'fires', view.fires, (o, at, f) => numbers(o, at, f, ['x', 'y']), { optional: true });
  list(
    out,
    'slots',
    view.slots,
    (o, at, s) => {
      numbers(o, at, s, ['x', 'y', 'w', 'h']);
      if (typeof s.free !== 'boolean' || typeof s.valid !== 'boolean') o.push(`${at}: expected free and valid flags`);
    },
    { optional: true, nullable: true }
  );
  if (view.bg !== undefined && typeof view.bg !== 'string') out.push('bg: expected a CSS color');
  for (const k of ['roomAt', 'locked']) if (typeof view[k] !== 'function') out.push(`${k}: expected a function (x, y)`);
  for (const k of ['onClick', 'extraMenu']) if (view[k] !== undefined && typeof view[k] !== 'function') out.push(`${k}: expected a function`);
  if (!Array.isArray(view.floorsAvailable) || !view.floorsAvailable.every((f) => typeof f === 'string')) out.push('floorsAvailable: expected floor ids');
  return out;
}
