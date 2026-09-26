// @ts-check
// The renderer interface both renderers implement (src/render/iso.js: Canvas 2D; src/render3d/: three.js) and the
// registry src/main.js picks one from with `?render=<id>`. Frozen for P0: members are only added, as optional
// members, through an interface request to the architect.
//
// Coordinate spaces:
// - world: tile units of the view's floor grid (src/contracts/view.js), fractions allowed; the floor plane is z = 0.
// - camera: `cam.x` / `cam.y` are the point the camera looks at, in 2D iso screen units at zoom 1 (`isoToScreen`
//   below). src/main.js eases them toward the survivor or `view.focus` and pans them by drag deltas divided by
//   `cam.zoom`, so every renderer takes its camera in these units (a 3D renderer maps them back with `screenToIso`).
// - client: CSS pixels from the canvas' top-left corner (the scene canvas fills the window, so clientX / clientY).
// - canvas: backing-store pixels of the canvas (client × devicePixelRatio, capped at 2).

/** Tile width and height of the iso projection that defines camera units (TW / TH in src/render/iso.js). */
export const TILE_W = 64;
export const TILE_H = 32;

/**
 * World tile -> camera units at zoom 1.
 * @param {number} x
 * @param {number} y
 * @returns {[number, number]}
 */
export function isoToScreen(x, y) {
  return [(x - y) * (TILE_W / 2), (x + y) * (TILE_H / 2)];
}

/**
 * Camera units at zoom 1 -> world tile (the inverse of isoToScreen).
 * @param {number} sx
 * @param {number} sy
 * @returns {[number, number]}
 */
export function screenToIso(sx, sy) {
  return [(sx / (TILE_W / 2) + sy / (TILE_H / 2)) / 2, (sy / (TILE_H / 2) - sx / (TILE_W / 2)) / 2];
}

/**
 * @typedef {object} Camera
 * @property {number} x  camera units (see above)
 * @property {number} y
 * @property {number} zoom  1 = one tile is TILE_W client px wide; main.js keeps it in 0.5 … 2.4 (mouse wheel)
 * @property {boolean} follow  main.js eases x / y toward the focus every frame while set; a drag clears it
 * @property {number} [swivel]  view rotation about the canvas center in radians; main.js eases it toward swivelTarget
 * @property {number} [swivelTarget]  -0.35 / 0.35 while a rotate key or button is held, else 0
 */

/**
 * What the mouse is over, set by main.js from `pick` on every mouse move; drawn as a hover outline.
 * @typedef {{ furn: number | string } | { box: number | string } | { tile: true, x: number, y: number }} Hover
 */

/**
 * @typedef {object} PickResult
 * @property {import('./view.js').ViewFurniture | null} furn  the front-most piece under the point, or null
 * @property {import('./view.js').ViewBox | null} box  the floor box under the point, when drawn in front of any piece
 * @property {number[]} tile  [x, y]: the integer tile under the point
 */

/**
 * @typedef {object} Renderer
 * @property {Camera} cam
 * @property {Hover | null} hover
 * @property {Set<number | string>} highlight  furniture uids and `box:<id>` keys drawn highlighted (Alt, planning, targets)
 * @property {(view: import('./view.js').View) => void} draw  draws one frame; called every animation frame
 * @property {(view: import('./view.js').View, wx: number, wy: number) => PickResult} pick  hit test at a world point
 *   on the floor plane (from toWorld); raised tops of furniture count, as they are drawn
 * @property {(cx: number, cy: number) => number[]} toWorld  client px -> [x, y] world point on the floor plane
 * @property {(x: number, y: number) => number[]} toCanvas  world point on the floor plane -> [x, y] canvas px
 * @property {(x: number, y: number) => void} centerOn  points the camera at a world point
 * @property {(ms?: number) => void} lightning  a flash for a thunderclap (drawn on storm days)
 * @property {(kind: string, at?: { uid?: number | string, slot?: string }) => void} [effect]  a short burst at a piece
 *   (zap, saw, hit, break, dust) or the trading drone's flight (droneOut, droneBack); absent: no effects
 * @property {() => void} resize  the canvas' CSS size changed: resize the backing store
 * @property {Promise<void>} [ready]  resolves once the scene can be drawn in full (assets loaded); absent: ready now
 * @property {() => void} [dispose]  releases GPU and DOM resources before another renderer takes the canvas
 * @property {() => RenderStats} [stats]  what the last frame cost. Optional on the interface (the Canvas renderer has
 *   none); required of the three.js renderer, since without it the draw-call and GPU-memory budgets stay unmeasured
 */

// ------------------------------------------------------------------------------------------ frame cost

/**
 * The cost of the most recently drawn frame. The budgets tool samples `stats()` after every frame. A value the
 * renderer cannot measure is 0, and a consumer treats 0 as unmeasured, never as a pass.
 * @typedef {object} RenderStats
 * @property {number} drawCalls  GPU draw calls issued for the frame, every pass included (shadows, post-processing)
 * @property {number} triangles  triangles drawn in the frame, every pass included
 * @property {number} gpuBytes  `gpuBytes(inventory)` over every GPU resource alive at that frame
 */

/**
 * Bytes per block of each GPU format, with the block size in texels. Uncompressed formats are 1 × 1 blocks. An RGB8
 * texture is stored as RGBA8 by WebGL implementations, so it is counted as `rgba8`; KTX2 textures count as the format
 * they were transcoded to (UASTC → bc7 / astc4x4 / etc2rgba, ETC1S → bc1 / bc3 / etc1 / etc2rgba).
 */
export const GPU_FORMATS = Object.freeze({
  r8: { block: [1, 1], bytes: 1 },
  rg8: { block: [1, 1], bytes: 2 },
  rgba8: { block: [1, 1], bytes: 4 },
  srgb8a8: { block: [1, 1], bytes: 4 },
  rgb10a2: { block: [1, 1], bytes: 4 },
  r11g11b10f: { block: [1, 1], bytes: 4 },
  r16f: { block: [1, 1], bytes: 2 },
  rg16f: { block: [1, 1], bytes: 4 },
  rgba16f: { block: [1, 1], bytes: 8 },
  r32f: { block: [1, 1], bytes: 4 },
  rg32f: { block: [1, 1], bytes: 8 },
  rgba32f: { block: [1, 1], bytes: 16 },
  depth16: { block: [1, 1], bytes: 2 },
  depth24: { block: [1, 1], bytes: 4 },
  depth24stencil8: { block: [1, 1], bytes: 4 },
  depth32f: { block: [1, 1], bytes: 4 },
  depth32fstencil8: { block: [1, 1], bytes: 8 },
  bc1: { block: [4, 4], bytes: 8 },
  bc3: { block: [4, 4], bytes: 16 },
  bc4: { block: [4, 4], bytes: 8 },
  bc5: { block: [4, 4], bytes: 16 },
  bc7: { block: [4, 4], bytes: 16 },
  etc1: { block: [4, 4], bytes: 8 },
  etc2rgb: { block: [4, 4], bytes: 8 },
  etc2rgba: { block: [4, 4], bytes: 16 },
  eacr11: { block: [4, 4], bytes: 8 },
  eacrg11: { block: [4, 4], bytes: 16 },
  astc4x4: { block: [4, 4], bytes: 16 },
});

/**
 * A texture on the GPU: `levels` mip levels (1 without mips), `layers` array layers or cube faces (6), `depth` for 3D.
 * @typedef {object} GpuTexture
 * @property {keyof typeof GPU_FORMATS} format
 * @property {number} width
 * @property {number} height
 * @property {number} [depth]
 * @property {number} [layers]
 * @property {number} [levels]
 */

/**
 * A render target: its color attachments and optional depth-stencil attachment. With `samples` > 1 each color
 * attachment holds a multisampled buffer plus its single-sample resolve texture, and the depth buffer is multisampled.
 * Textures that are render-target attachments are counted here, not among the textures.
 * @typedef {object} GpuRenderTarget
 * @property {number} width
 * @property {number} height
 * @property {(keyof typeof GPU_FORMATS)[]} color
 * @property {keyof typeof GPU_FORMATS} [depth]
 * @property {number} [samples]
 */

/**
 * Every GPU resource a renderer holds.
 * @typedef {object} GpuInventory
 * @property {GpuTexture[]} [textures]
 * @property {GpuRenderTarget[]} [renderTargets]
 * @property {{ bytes: number }[]} [buffers]  vertex, index, uniform and storage buffers at their byte length
 */

/** Mip levels of a full chain: floor(log2(max side)) + 1. @param {number} width @param {number} height @param {number} [depth] */
export const mipLevels = (width, height, depth = 1) => Math.floor(Math.log2(Math.max(width, height, depth))) + 1;

/**
 * Bytes of one texture: every mip level (sides halved and floored at 1, then rounded up to whole blocks) times layers.
 * @param {GpuTexture} t
 */
export function textureBytes(t) {
  const f = GPU_FORMATS[t.format];
  if (!f) throw new Error(`unknown GPU format '${t.format}'`);
  const [bw, bh] = f.block;
  let bytes = 0;
  for (let l = 0; l < (t.levels ?? 1); l++) {
    const w = Math.max(1, t.width >> l);
    const h = Math.max(1, t.height >> l);
    const d = Math.max(1, (t.depth ?? 1) >> l);
    bytes += Math.ceil(w / bw) * Math.ceil(h / bh) * d * f.bytes;
  }
  return bytes * (t.layers ?? 1);
}

/**
 * Bytes of one render target (see GpuRenderTarget).
 * @param {GpuRenderTarget} rt
 */
export function renderTargetBytes(rt) {
  const samples = Math.max(1, rt.samples ?? 1);
  const px = rt.width * rt.height;
  const of = (/** @type {keyof typeof GPU_FORMATS} */ fmt) => {
    const f = GPU_FORMATS[fmt];
    if (!f || f.block[0] !== 1) throw new Error(`'${fmt}' cannot be a render-target attachment`);
    return f.bytes;
  };
  const color = rt.color.reduce((s, fmt) => s + px * of(fmt) * (samples > 1 ? samples + 1 : 1), 0);
  return color + (rt.depth ? px * of(rt.depth) * samples : 0);
}

/**
 * GPU memory of an inventory: textures, render targets and buffers. `RenderStats.gpuBytes` is this number, so the
 * budgets tool can recompute it from the same inventory rather than trust the renderer's own figure.
 * @param {GpuInventory} inv
 */
export function gpuBytes(inv) {
  let bytes = 0;
  for (const t of inv.textures || []) bytes += textureBytes(t);
  for (const rt of inv.renderTargets || []) bytes += renderTargetBytes(rt);
  for (const b of inv.buffers || []) bytes += b.bytes;
  return bytes;
}

/**
 * Checks a RenderStats sample: whole numbers ≥ 0. Returns the problems found.
 * @param {unknown} s
 * @returns {string[]}
 */
export function checkStats(s) {
  if (typeof s !== 'object' || s === null) return ['stats: expected { drawCalls, triangles, gpuBytes }'];
  const o = /** @type {Record<string, unknown>} */ (s);
  return ['drawCalls', 'triangles', 'gpuBytes'].filter((k) => !(Number.isInteger(o[k]) && /** @type {number} */ (o[k]) >= 0)).map((k) => `stats.${k}: expected a whole number ≥ 0 (0: unmeasured)`);
}

/**
 * A renderer src/main.js can pick. Renderers are registered in src/main.js (the renderer switch).
 * @typedef {object} RendererEntry
 * @property {string} id  the `?render=` value, lowercase
 * @property {string} label
 * @property {(canvas: HTMLCanvasElement) => Renderer} create  builds the renderer on the scene canvas, synchronously;
 *   a renderer that loads assets starts drawing what it has and resolves `ready` when complete
 * @property {boolean} [isDefault]  used when `?render` is absent or names nothing usable; exactly one entry has it
 * @property {() => boolean} [supported]  false when this device cannot run it (no WebGL2, …): the default is used
 */

/** @type {Map<string, RendererEntry>} */
const registry = new Map();

/**
 * @param {RendererEntry} entry
 */
export function registerRenderer(entry) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(entry.id)) throw new Error(`renderer id '${entry.id}' must be lowercase letters, digits or dashes`);
  if (registry.has(entry.id)) throw new Error(`renderer '${entry.id}' is already registered`);
  const current = defaultEntry();
  if (entry.isDefault && current?.isDefault) throw new Error(`renderer '${entry.id}' cannot be the default: '${current.id}' is`);
  registry.set(entry.id, entry);
}

/** @returns {RendererEntry[]} */
export function rendererEntries() {
  return [...registry.values()];
}

/** @returns {RendererEntry | undefined} the entry marked isDefault, else the first registered */
function defaultEntry() {
  const all = rendererEntries();
  return all.find((e) => e.isDefault) || all[0];
}

/**
 * The renderer id asked for in a query string (`?render=2d`), or null.
 * @param {string | URLSearchParams | null | undefined} search
 * @returns {string | null}
 */
export function requestedRenderer(search) {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
  return params.get('render')?.trim().toLowerCase() || null;
}

/**
 * Builds the renderer the query string asks for, falling back to the default when the id is unknown, the device
 * does not support it, or it fails to start.
 * @param {HTMLCanvasElement} canvas
 * @param {string | URLSearchParams | null} [search]  e.g. `location.search`
 * @returns {{ id: string, renderer: Renderer }}
 */
export function createRenderer(canvas, search) {
  const fallback = defaultEntry();
  if (!fallback) throw new Error('no renderer registered');
  const wanted = requestedRenderer(search);
  let entry = fallback;
  if (wanted && wanted !== fallback.id) {
    const asked = registry.get(wanted);
    if (!asked) console.warn(`?render=${wanted}: no such renderer (have ${[...registry.keys()].join(', ')}); using '${fallback.id}'`);
    else if (asked.supported && !asked.supported()) console.warn(`?render=${wanted}: not supported on this device; using '${fallback.id}'`);
    else entry = asked;
  }
  if (entry !== fallback) {
    try {
      return { id: entry.id, renderer: entry.create(canvas) };
    } catch (err) {
      console.error(`?render=${entry.id} failed to start; using '${fallback.id}'`, err);
    }
  }
  return { id: fallback.id, renderer: fallback.create(canvas) };
}
