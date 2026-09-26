// @ts-check
// Asset manifests: how shipped assets (models, characters, materials, icons, audio, lightmaps, …) are described to
// the renderers, the coverage tool and the gate. Each asset package writes a manifest for its family
// (`assets/<family>/manifest.json`; the material library is `assets/materials/library.json`); `checkAssetManifest`
// validates one and the gate's contracts check runs it on every manifest under assets/. Frozen for P0: fields are
// only added, as optional fields, through an interface request to the architect.

export const ASSET_MANIFEST_SCHEMA = 'survival-logs/asset-manifest@1';

/** What an entry is. */
export const ASSET_KINDS = Object.freeze({
  model: 'static glTF (.glb): furniture, props, a building shell',
  character: 'skinned glTF with its animation clips (meta.clips)',
  animation: 'glTF that holds animation clips only',
  material: 'a PBR texture set and its parameters (files: baseColor, normal, orm, …)',
  texture: 'a single texture (KTX2 or PNG)',
  lightmap: 'baked light for a model, one file per lighting state (files: day, dusk, night, …)',
  probe: 'baked light probes (spherical harmonics) for movable objects',
  icon: 'a UI icon at several sizes (files: 64, 128, 256)',
  audio: 'a sound, ambience or music stem; round-robin takes are variants',
  lut: 'a color-grading lookup table (.cube)',
  font: 'a UI typeface (WOFF2), subset where noted',
});

/** License ids an asset may carry: the allowed sources of docs/wp/README.md. */
export const LICENSES = Object.freeze({
  'CC0-1.0': 'CC0: Poly Haven, ambientCG, Kenney, VSCO 2 CE, VCSL, MPFB system assets',
  'LicenseRef-CMU-Mocap': 'CMU Graphics Lab Motion Capture Database (free to use)',
  'LicenseRef-Sonniss-GDC': 'Sonniss GDC game audio bundles (royalty-free)',
  'LicenseRef-Original': 'made for this project (scripted, procedural or authored here); inputs listed in sources',
  'OFL-1.1': 'SIL Open Font License 1.1: Noto fonts (Google Fonts repository)',
});

/** Folders of assets/ that are never shipped: the download cache, look references and the ledgers. */
export const UNSHIPPED_ASSET_DIRS = Object.freeze(['cache', 'targets', 'lock', 'credits']);

/** How a model sits in its slot: on the floor, against a wall face (TV, wall shelf), or in a wall opening (door, window). */
export const ANCHORS = Object.freeze(['floor', 'wall-face', 'wall-center']);

/** What a dressed mesh part is, for a material's tint presets (`params.tint.presetUse` restricts presets to some). */
export const MATERIAL_USES = Object.freeze(['floor', 'wall', 'furniture', 'accent']);

/** Footprint in tiles [x, y] of every slot type, as `footprint()` in src/sim/scene.js gives it (the contract tests compare). */
export const SLOT_FOOTPRINTS = Object.freeze({
  SMALL: [1, 1],
  TABLETOP: [1, 1],
  DEFENSE: [1, 1],
  MEDIUM: [2, 1],
  BED: [2, 1],
  LARGE: [2, 2],
  WALL: [0, 0],
  DOOR: [0, 0],
  WINDOW: [0, 0],
});

/**
 * Baked model maps (`files.normal`, `files.occlusion` of a model): both on TEXCOORD_1; the normal map is tangent
 * space, OpenGL (+Y), MikkTSpace against the glTF TANGENT attribute; the occlusion map packs these channels.
 * TEXCOORD_0 stays the meter UVs of the library materials.
 */
export const BAKED_UV = 1;
export const OCCLUSION_CHANNELS = Object.freeze({ r: 'ao (the aoMap)', g: 'convex curvature 0 … 1 (the library wear convention c)', b: 'local occlusion (cavity = 1 − b)' });

/** Axes a pivot node rotates about, in the model's space (+Y up, front +Z). */
export const PIVOT_AXES = Object.freeze(['+x', '-x', '+y', '-y', '+z', '-z']);

/** What a state rule tests on a view furniture piece (`modelVariant`). */
export const STATE_TESTS = Object.freeze({
  broken: 'ViewFurniture.broken === true or ViewFurniture.data.breached === true',
  hpRatio: 'ViewFurniture.hpRatio <= atMost (hp / effectiveMaxHp, reinforcement included; the sim computes it)',
  always: 'the fallback: matches every piece',
});

/** Runtime audio convention (docs/AUDIO.md): categories, mixer buses, reverb spaces and music layers. */
export const AUDIO_CATEGORIES = Object.freeze(['sfx', 'ambience', 'ui', 'music', 'ir', 'test']);
export const AUDIO_BUSES = Object.freeze(['music', 'sfx', 'ambience', 'ui']);
export const AUDIO_SPACES = Object.freeze(['apartment', 'stairwell', 'shop', 'basement', 'outdoors']);
export const MUSIC_LAYERS = Object.freeze(['pre-outbreak', 'day', 'night', 'horde', 'transition', 'ending']);

/**
 * @typedef {keyof typeof ASSET_KINDS} AssetKind
 * @typedef {keyof typeof LICENSES} LicenseId
 */

/**
 * The wall opening a door or window needs; the shell lane cuts it from these numbers. Metres, in the wall plane.
 * @typedef {object} ModelOpening
 * @property {number} widthM  clear width of the opening
 * @property {number} headM  height of its head above the floor
 * @property {number} [sillM]  height of the sill (windows); 0 or absent for doors
 * @property {number[]} [leafM]  [width, height] of a door leaf
 * @property {number} wallM  the wall thickness the unit is built for
 * @property {string} [note]
 */

/**
 * A node the renderer rotates at run time: the node's name in the glTF, the axis in the model's space and how far it
 * turns from closed to fully open (right-hand rule, degrees).
 * @typedef {object} ModelPivot
 * @property {string} node
 * @property {'+x' | '-x' | '+y' | '-y' | '+z' | '-z'} axis
 * @property {number} openDeg  0 < openDeg ≤ 180
 */

/**
 * One rule of a model's `states`: the first rule whose test matches a piece picks the variant (null: the entry's own
 * files). The last rule is `always`.
 * @typedef {object} ModelState
 * @property {string | null} variant
 * @property {keyof typeof STATE_TESTS} when
 * @property {number} [atMost]  for `hpRatio`: 0 < atMost < 1
 */

/**
 * The typed `params` of a model a slot holds (furniture, fixtures). Other params keys stay free-form.
 * @typedef {object} ModelParams
 * @property {keyof typeof SLOT_FOOTPRINTS} [slot]  the slot type it goes in; with a slot, anchor, front and footprint are required
 * @property {'floor' | 'wall-face' | 'wall-center'} [anchor]  floor: the model's origin is the footprint's floor centre;
 *   wall-face: on the room side of the wall, origin at the wall face; wall-center: in the wall's centre plane (openings)
 * @property {'+z'} [front]  the side facing the room is +Z
 * @property {number[]} [footprint]  [x, y] tiles, SLOT_FOOTPRINTS[slot]
 * @property {ModelOpening} [opening]  required for DOOR and WINDOW slots
 * @property {Record<string, ModelPivot>} [pivots]  role ('leaf') -> the node that turns
 * @property {ModelState[]} [states]  which variant shows which view state
 * @property {{ uv: number, normal?: string, occlusion?: Record<string, string>, uv0?: string }} [bake]  required with
 *   files.normal or files.occlusion: uv is BAKED_UV
 */

/**
 * The typed `params` of an audio entry: the runtime audio convention of docs/AUDIO.md.
 * @typedef {object} AudioParams
 * @property {string} title
 * @property {'sfx' | 'ambience' | 'ui' | 'music' | 'ir' | 'test'} category
 * @property {'music' | 'sfx' | 'ambience' | 'ui'} [bus]  mixer bus (every category but ir and test)
 * @property {boolean} [spatial]  played through a PannerNode at its world position (sfx, ambience, ui)
 * @property {boolean} [loop]  loops until its cause ends
 * @property {'apartment' | 'stairwell' | 'shop' | 'basement' | 'outdoors' | null} [space]  the room reverb it is played in
 *   (null: dry, the space is baked in); for an ir, the space it models
 * @property {string[]} [tags]
 * @property {number} [pitchCents]  each play is detuned uniformly within ± this many cents
 * @property {number} [gainDb]  each play's gain varies uniformly within ± this many dB
 * @property {boolean} [noRepeat]  the shuffled bag never plays the same take twice in a row
 * @property {number} [maxVoices]  at most this many of the family sound at once
 * @property {number} [cooldown]  at least this many seconds between starts
 * @property {string} [layer]  music: one of MUSIC_LAYERS
 * @property {number} [bpm]
 * @property {number[]} [meter]  [beats per bar, beat unit]
 * @property {number} [bars]
 * @property {number} [barSeconds]  60 / bpm × beats per bar: layers switch on bar lines
 * @property {number | null} [loopEndSample]  a loop's end in samples (bars × barSeconds × meta.sampleRate); null if it does not loop
 * @property {number[]} [rt60Bands]  ir: octave band centres, Hz
 * @property {number[]} [rt60]  ir: reverberation time per band, s
 * @property {{ t: number, title: string }[]} [sections]  test: section starts, s
 * @property {string[]} [uses]  test: the audio entries it mixes
 */

/**
 * A coarser level of detail. LOD 0 is the entry's own `path`.
 * @typedef {object} AssetLod
 * @property {number} level  1, 2, … (coarser as it grows)
 * @property {string} path
 * @property {number} [triangles]
 * @property {number} [screenSize]  used below this share of the viewport height (0 … 1)
 */

/**
 * A variant: a damage state ('broken'), a quality tier, a tint, a round-robin take. Lists only what differs.
 * @typedef {object} AssetVariant
 * @property {string} [path]
 * @property {Record<string, string>} [files]
 * @property {AssetLod[]} [lods]  coarser levels of the variant's own mesh
 * @property {Record<string, unknown>} [params]  audio takes: { levelDb } relative to the family
 */

/**
 * One mesh part dressed in a library material with per-object variation. Nothing in the sim chooses these values,
 * so they live here and not in the view model: a model entry gives each part its default (`AssetEntry.materials`), a
 * config binding may override it per config id (`AssetBinding.materials`), and the renderer draws every object with
 * `instanceSeed(uid, part)` unless a seed is pinned. The variation formulas are the library's `conventions`.
 * @typedef {object} MaterialInstance
 * @property {string} material  the id of a `kind: 'material'` entry ('materials/fabric_sofa'), usually in the library
 * @property {string} [variant]  a variant of that material ('sage')
 * @property {string} [tint]  '#rrggbb' or a tint preset of the material (`params.tint.presets`)
 * @property {string} [secondaryTint]  '#rrggbb' or a preset, for materials whose tint mask has two colors
 * @property {number} [wear]  0 … 1, within the material's `params.instance.wear` range when it declares one
 * @property {number} [dirt]  0 … 1, within `params.instance.dirt` when declared (default: the material's dirt.amount)
 * @property {number} [seed]  integer 0 … 2^32 − 1; pins the variation instead of the per-object seed
 * @property {'floor' | 'wall' | 'furniture' | 'accent'} [use]  what the part is; required when the instance picks a
 *   tint preset (by `tint` or `variant`) that the material's `params.tint.presetUse` restricts, and must be one of
 *   that preset's uses
 */

/**
 * How assets are rebuilt from locked sources: a build entry under tools/, run in a sandbox copy of the checkout with
 * the entry's paths as its outputs. It must be deterministic: fixed seeds, pinned tool versions, and a fixed Cycles
 * seed and sample count for Cycles renders. The asset-lock check (tools/asset-lock.mjs) re-bakes a sample with it.
 * @typedef {object} RebuildRecipe
 * @property {string} entry  script under tools/, run by its extension: .sh with bash, .mjs / .js with node, .py with
 *   python3 (a recipe that needs a virtualenv uses a .sh entry that sets it up)
 * @property {string[]} [args]  arguments; `{id}`, `{name}` (the id after the family) and `{family}` are replaced per asset
 * @property {string[]} inputs  repo paths the build reads, copied into the sandbox (folders end in '/'); the manifest
 *   itself is always copied
 * @property {string[]} [shared]  repo paths linked into the sandbox from the checkout (the source cache, installed
 *   tool binaries); created in the checkout when missing and never compared
 * @property {string[]} [persist]  sandbox paths kept from one re-bake to the next (virtualenvs, whose scripts hold
 *   absolute paths)
 * @property {Record<string, string>} tools  pinned versions of the tools it runs ({ ktx: '4.4.2', blender: '4.5.3' })
 * @property {Record<string, number>} [seeds]  every random seed the build uses, fixed
 * @property {{ seed: number, samples: number }} [cycles]  required when the build renders with Cycles
 * @property {number} cost  expected wall-clock seconds to re-bake one asset (the asset-lock sample budget uses it)
 * @property {number} [timeoutSec]  per run; default 10 × cost, at least 60
 */

/**
 * Which recipe rebuilds an entry: the recipe's name, or the name with this entry's own arguments.
 * @typedef {string | { recipe: string, args?: string[] }} RebuildRef
 */

/**
 * The material library block of `assets/materials/library.json` (WP-P0-05): the conventions every material entry
 * of the manifest follows.
 * @typedef {object} MaterialLibrary
 * @property {string} schema  'survival-logs/material-library@<n>'
 * @property {string} [generator]  the build that writes it
 * @property {Record<string, string>} [toolchain]  pinned tool versions
 * @property {'meters'} [units]
 * @property {Record<string, string>} [conventions]  uv, color spaces, channel packing, tint, variation, wear, dirt, …
 * @property {Record<string, unknown>} [targets]  resolution and texel-density targets
 */

/**
 * @typedef {object} AssetEntry
 * @property {string} id  unique across all manifests, `<family>/<name>` in lowercase ('furniture/sofa-fabric')
 * @property {AssetKind} kind
 * @property {string} path  repo-relative POSIX path under assets/ of the primary file, or of a folder (ending in '/')
 *   for a multi-file asset whose files are named in `files`. Served from the same path under the site root.
 * @property {LicenseId} license
 * @property {string[]} [sources]  ids of the locked sources (assets/sources.lock.json) it was made from
 * @property {Record<string, string>} [files]  named files: material maps, icon sizes, lightmap states, …
 * @property {AssetLod[]} [lods]
 * @property {Record<string, AssetVariant>} [variants]
 * @property {Record<string, MaterialInstance>} [materials]  mesh part (glTF material slot name) -> its material
 * @property {RebuildRef} [rebuild]  the recipe of `AssetManifest.rebuild` that rebuilds it
 * @property {Record<string, string>} [digests]  SHA-256 (hex) of every output file, by its path (`assetOutputs`)
 * @property {Record<string, unknown>} [params]  kind-specific parameters: ModelParams for models, AudioParams for
 *   audio, the material parameters of the library conventions for materials
 * @property {Record<string, unknown>} [meta]  measured facts the gate checks: triangles, bones, maxInfluences, clips,
 *   texelDensity, sizeBytes, durationSec, lufs, …
 */

/**
 * @typedef {object} AssetBinding
 * @property {string} asset  an AssetEntry id (from any manifest)
 * @property {string} [variant]  a variant of that asset
 * @property {Record<string, MaterialInstance>} [materials]  per-part overrides of the asset's own `materials`
 */

/**
 * @typedef {object} AssetManifest
 * @property {typeof ASSET_MANIFEST_SCHEMA} schema
 * @property {string} [wp]  the work package that produced it
 * @property {MaterialLibrary} [library]  present in the material library only
 * @property {Record<string, RebuildRecipe>} [rebuild]  named recipes the entries refer to
 * @property {AssetEntry[]} assets
 * @property {Record<string, AssetBinding>} [bindings]  game config id (Config_Furniture or Config_Item id, SCENERY key,
 *   …) -> the asset that shows it
 */

/**
 * Every file an entry ships, repo-relative: its path (unless a folder), named files, LOD and variant files.
 * @param {AssetEntry} entry
 * @returns {string[]}
 */
export function assetOutputs(entry) {
  const out = new Set();
  if (typeof entry.path === 'string' && !entry.path.endsWith('/')) out.add(entry.path);
  for (const p of Object.values(entry.files || {})) out.add(p);
  for (const l of entry.lods || []) out.add(l.path);
  for (const v of Object.values(entry.variants || {})) {
    if (v.path) out.add(v.path);
    for (const p of Object.values(v.files || {})) out.add(p);
    for (const l of v.lods || []) out.add(l.path);
  }
  return [...out];
}

/**
 * The variant a model shows for a view furniture piece: the first of `params.states` whose test matches; null for the
 * entry's own files (also when the model has no states).
 * @param {AssetEntry} entry
 * @param {import('./view.js').ViewFurniture} piece
 * @returns {string | null}
 */
export function modelVariant(entry, piece) {
  const states = /** @type {ModelParams | undefined} */ (entry.params)?.states || [];
  for (const s of states) {
    if (s.when === 'always') return s.variant;
    if (s.when === 'broken' && (piece.broken === true || piece.data?.breached === true)) return s.variant;
    if (s.when === 'hpRatio' && typeof piece.hpRatio === 'number' && s.atMost != null && piece.hpRatio <= s.atMost) return s.variant;
  }
  return null;
}

/**
 * The recipe and arguments that rebuild an entry, placeholders replaced; null when it names none.
 * @param {AssetManifest} manifest
 * @param {AssetEntry} entry
 * @returns {{ name: string, recipe: RebuildRecipe, args: string[] } | null}
 */
export function rebuildOf(manifest, entry) {
  const ref = entry.rebuild;
  const name = typeof ref === 'string' ? ref : ref?.recipe;
  const recipe = name ? manifest.rebuild?.[name] : undefined;
  if (!name || !recipe) return null;
  const [family, ...rest] = entry.id.split('/');
  const args = (typeof ref === 'object' && ref.args) || recipe.args || [];
  const fill = (/** @type {string} */ a) => a.replaceAll('{id}', entry.id).replaceAll('{name}', rest.join('/')).replaceAll('{family}', family);
  return { name, recipe, args: args.map(fill) };
}

/**
 * The variation seed of one object's part: FNV-1a (32 bit) of `<uid>/<part>`. Stable across renderers, sessions and
 * tools, so an object keeps its look; a MaterialInstance.seed overrides it.
 * @param {number | string} uid  the view furniture uid
 * @param {string} [part]
 */
export function instanceSeed(uid, part = '') {
  let h = 0x811c9dc5;
  for (const ch of `${uid}/${part}`) {
    h ^= ch.codePointAt(0) || 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * The material of every part an object shows: the asset's own `materials`, overridden field by field by its binding.
 * @param {AssetEntry} entry
 * @param {AssetBinding} [binding]
 * @returns {Record<string, MaterialInstance>}
 */
export function resolveMaterials(entry, binding) {
  /** @type {Record<string, MaterialInstance>} */
  const out = {};
  for (const [part, m] of Object.entries(entry.materials || {})) out[part] = { ...m };
  for (const [part, m] of Object.entries(binding?.materials || {})) out[part] = /** @type {MaterialInstance} */ ({ ...out[part], ...m });
  return out;
}

/**
 * The URL an asset path is served at.
 * @param {string} path  an AssetEntry path
 * @param {string} [base]  the site root (Vite's import.meta.env.BASE_URL)
 */
export function assetUrl(path, base = '/') {
  return `${base.endsWith('/') ? base : `${base}/`}${path}`;
}

const ID = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)+$/;

/**
 * Why a path cannot be an asset path, or null when it can.
 * @param {unknown} p
 * @returns {string | null}
 */
export function assetPathProblem(p) {
  if (typeof p !== 'string' || !p) return 'expected a path';
  if (p.includes('\\') || p.startsWith('/') || /^[a-z]+:/i.test(p)) return `'${p}' must be a repo-relative POSIX path`;
  const parts = p.split('/');
  if (parts[0] !== 'assets' || parts.length < 3) return `'${p}' is not inside an assets/ family folder`;
  if (parts.some((s, i) => s === '..' || s === '.' || (s === '' && i < parts.length - 1))) return `'${p}' has an empty, . or .. segment`;
  if (UNSHIPPED_ASSET_DIRS.includes(parts[1])) return `'${p}' is under assets/${parts[1]}/, which never ships`;
  return null;
}

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Checks one manifest. Returns the problems found as `where: problem` lines (empty when it conforms).
 * @param {unknown} manifest
 * @param {{ exists?: (path: string) => boolean, knownAssets?: Map<string, AssetEntry> }} [opts]
 *   exists: also check that every path is on disk; knownAssets: entries of other manifests bindings may point to
 * @returns {string[]}
 */
export function checkAssetManifest(manifest, opts = {}) {
  /** @type {string[]} */
  const out = [];
  if (!isObj(manifest)) return ['manifest: expected an object'];
  if (manifest.schema !== ASSET_MANIFEST_SCHEMA) out.push(`schema: expected '${ASSET_MANIFEST_SCHEMA}', got ${JSON.stringify(manifest.schema)}`);
  if (manifest.wp !== undefined && typeof manifest.wp !== 'string') out.push('wp: expected a work package id');
  checkLibrary(out, manifest.library);
  const recipes = checkRecipes(out, manifest.rebuild);
  if (!Array.isArray(manifest.assets)) return [...out, 'assets: expected an array of entries'];
  /** @type {Map<string, Record<string, any>>} */
  const ids = new Map();
  /** @type {[string, unknown][]} material instances to resolve once every id is known */
  const instances = [];
  /** @type {[string, string][]} audio ids a test mix uses, resolved once every id is known */
  const usesToResolve = [];
  /**
   * @param {string} at
   * @param {unknown} p
   * @param {boolean} [folder]  a folder path ending in '/' is allowed
   */
  const path = (at, p, folder = false) => {
    const problem = assetPathProblem(p);
    if (problem) return void out.push(`${at}: ${problem}`);
    const s = /** @type {string} */ (p);
    if (s.endsWith('/') && !folder) out.push(`${at}: '${s}' must name a file`);
    else if (opts.exists && !opts.exists(s)) out.push(`${at}: '${s}' does not exist`);
  };
  /**
   * @param {string} at
   * @param {unknown} files
   */
  const fileMap = (at, files) => {
    if (files === undefined) return;
    if (!isObj(files) || !Object.keys(files).length) return void out.push(`${at}: expected named files`);
    for (const [k, p] of Object.entries(files)) path(`${at}.${k}`, p);
  };
  manifest.assets.forEach((e, i) => {
    const at = `assets[${i}]${isObj(e) && typeof e.id === 'string' ? ` (${e.id})` : ''}`;
    if (!isObj(e)) return void out.push(`${at}: expected an object`);
    if (typeof e.id !== 'string' || !ID.test(e.id)) out.push(`${at}.id: expected '<family>/<name>' in lowercase`);
    else if (ids.has(e.id)) out.push(`${at}.id: duplicate`);
    else ids.set(e.id, e);
    if (!Object.hasOwn(ASSET_KINDS, e.kind)) out.push(`${at}.kind: '${e.kind}' is not one of ${Object.keys(ASSET_KINDS).join(', ')}`);
    if (!Object.hasOwn(LICENSES, e.license)) out.push(`${at}.license: '${e.license}' is not one of ${Object.keys(LICENSES).join(', ')}`);
    path(`${at}.path`, e.path, true);
    if (typeof e.path === 'string' && e.path.endsWith('/') && e.files === undefined) out.push(`${at}.files: a folder path needs its files named`);
    fileMap(`${at}.files`, e.files);
    if (e.sources !== undefined && (!Array.isArray(e.sources) || !e.sources.every((s) => typeof s === 'string' && s))) out.push(`${at}.sources: expected lock ids`);
    /** @param {string} where @param {unknown} list */
    const lods = (where, list) => {
      if (list === undefined) return;
      if (!Array.isArray(list)) return void out.push(`${where}: expected an array`);
      let prev = 0;
      list.forEach((l, j) => {
        if (!isObj(l) || !Number.isInteger(l.level) || l.level <= prev) return void out.push(`${where}[${j}]: levels must be integers counting up from 1`);
        prev = l.level;
        path(`${where}[${j}].path`, l.path);
        if (l.triangles !== undefined && !(Number.isInteger(l.triangles) && l.triangles > 0)) out.push(`${where}[${j}].triangles: expected a positive integer`);
        if (l.screenSize !== undefined && !(typeof l.screenSize === 'number' && l.screenSize > 0 && l.screenSize < 1)) out.push(`${where}[${j}].screenSize: expected 0 < share < 1`);
      });
    };
    lods(`${at}.lods`, e.lods);
    if (e.variants !== undefined) {
      if (!isObj(e.variants)) out.push(`${at}.variants: expected named variants`);
      else {
        for (const [k, v] of Object.entries(e.variants)) {
          if (!isObj(v)) {
            out.push(`${at}.variants.${k}: expected an object`);
            continue;
          }
          if (v.path !== undefined) path(`${at}.variants.${k}.path`, v.path);
          fileMap(`${at}.variants.${k}.files`, v.files);
          lods(`${at}.variants.${k}.lods`, v.lods);
          if (v.params !== undefined && !isObj(v.params)) out.push(`${at}.variants.${k}.params: expected an object`);
          else if (e.kind === 'audio' && v.params?.levelDb !== undefined && !(typeof v.params.levelDb === 'number' && Number.isFinite(v.params.levelDb))) out.push(`${at}.variants.${k}.params.levelDb: expected dB`);
        }
      }
    }
    for (const k of ['params', 'meta']) if (e[k] !== undefined && !isObj(e[k])) out.push(`${at}.${k}: expected an object`);
    if (e.kind === 'model') checkModelParams(out, at, e);
    if (e.kind === 'material') checkPresetUse(out, at, e);
    if (e.kind === 'audio') checkAudioParams(out, at, e, usesToResolve);
    if (e.materials !== undefined) {
      if (!isObj(e.materials) || !Object.keys(e.materials).length) out.push(`${at}.materials: expected mesh part -> material instance`);
      else for (const [part, m] of Object.entries(e.materials)) instances.push([`${at}.materials.${part}`, m]);
    }
    if (e.rebuild !== undefined) {
      const ref = e.rebuild;
      const name = typeof ref === 'string' ? ref : isObj(ref) ? ref.recipe : null;
      if (typeof name !== 'string') out.push(`${at}.rebuild: expected a recipe name or { recipe, args }`);
      else if (!recipes.has(name)) out.push(`${at}.rebuild: no recipe '${name}' in the manifest's rebuild`);
      if (isObj(ref) && ref.args !== undefined && !isStrings(ref.args)) out.push(`${at}.rebuild.args: expected strings`);
    }
    if (e.digests !== undefined) {
      if (!isObj(e.digests)) out.push(`${at}.digests: expected path -> SHA-256`);
      else {
        const outputs = new Set(assetOutputs(/** @type {AssetEntry} */ (e)));
        for (const [p, h] of Object.entries(e.digests)) {
          if (!outputs.has(p)) out.push(`${at}.digests: '${p}' is not one of the entry's files`);
          if (typeof h !== 'string' || !/^[0-9a-f]{64}$/.test(h)) out.push(`${at}.digests.${p}: expected a lowercase hex SHA-256`);
        }
      }
    }
  });
  if (manifest.bindings !== undefined) {
    if (!isObj(manifest.bindings)) out.push('bindings: expected config id -> { asset, variant }');
    else {
      for (const [k, b] of Object.entries(manifest.bindings)) {
        const target = isObj(b) && typeof b.asset === 'string' ? ids.get(b.asset) || opts.knownAssets?.get(b.asset) : null;
        if (!target) out.push(`bindings.${k}: asset ${JSON.stringify(isObj(b) ? b.asset : b)} is not in any manifest`);
        else if (b.variant !== undefined && !(isObj(target.variants) && Object.hasOwn(target.variants, b.variant))) out.push(`bindings.${k}: '${b.asset}' has no variant '${b.variant}'`);
        if (isObj(b) && b.materials !== undefined) {
          if (!isObj(b.materials)) out.push(`bindings.${k}.materials: expected mesh part -> material instance`);
          else for (const [part, m] of Object.entries(b.materials)) instances.push([`bindings.${k}.materials.${part}`, m]);
        }
      }
    }
  }
  const lookup = (/** @type {string} */ id) => ids.get(id) || opts.knownAssets?.get(id);
  for (const [at, m] of instances) checkInstance(out, at, m, lookup);
  for (const [at, id] of usesToResolve) if (lookup(id)?.kind !== 'audio') out.push(`${at}: '${id}' is not an audio entry of any manifest`);
  return out;
}

/** @param {unknown} v @returns {v is string[]} */
const isStrings = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string');
/** @param {unknown} v @returns {v is number} */
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
/** @param {unknown} v @param {number} n @returns {v is number[]} */
const isNums = (v, n) => Array.isArray(v) && v.length === n && v.every(isNum);

/**
 * The typed placement and dressing params of a model (ModelParams).
 * @param {string[]} out
 * @param {string} at
 * @param {Record<string, any>} e
 */
function checkModelParams(out, at, e) {
  const p = isObj(e.params) ? e.params : {};
  const where = `${at}.params`;
  const slot = p.slot;
  if (slot !== undefined && !Object.hasOwn(SLOT_FOOTPRINTS, slot)) out.push(`${where}.slot: '${slot}' is not one of ${Object.keys(SLOT_FOOTPRINTS).join(', ')}`);
  const expected = Object.hasOwn(SLOT_FOOTPRINTS, slot) ? SLOT_FOOTPRINTS[/** @type {keyof typeof SLOT_FOOTPRINTS} */ (slot)] : null;
  if (slot !== undefined) for (const k of ['anchor', 'front', 'footprint']) if (p[k] === undefined) out.push(`${where}.${k}: required for a model that goes in a slot`);
  if (p.anchor !== undefined && !ANCHORS.includes(p.anchor)) out.push(`${where}.anchor: '${p.anchor}' is not one of ${ANCHORS.join(', ')}`);
  if (p.front !== undefined && p.front !== '+z') out.push(`${where}.front: the room side of a model is '+z', not ${JSON.stringify(p.front)}`);
  if (p.footprint !== undefined) {
    if (!isNums(p.footprint, 2) || !p.footprint.every((/** @type {number} */ n) => Number.isInteger(n) && n >= 0)) out.push(`${where}.footprint: expected [x, y] whole tiles`);
    else if (expected && (p.footprint[0] !== expected[0] || p.footprint[1] !== expected[1])) out.push(`${where}.footprint: a ${slot} slot is [${expected}] tiles, not [${p.footprint}]`);
    else if (p.anchor === 'floor' && !(p.footprint[0] > 0 && p.footprint[1] > 0)) out.push(`${where}.footprint: a floor model covers at least one tile`);
    else if (typeof p.anchor === 'string' && p.anchor.startsWith('wall') && (p.footprint[0] || p.footprint[1])) out.push(`${where}.footprint: a wall model covers no floor tiles ([0, 0])`);
  }
  if ((slot === 'DOOR' || slot === 'WINDOW') && p.anchor !== undefined && p.anchor !== 'wall-center') out.push(`${where}.anchor: a ${slot} sits in its opening ('wall-center')`);
  if (slot === 'WALL' && p.anchor !== undefined && p.anchor !== 'wall-face') out.push(`${where}.anchor: a WALL piece hangs on the wall face ('wall-face')`);
  if ((slot === 'DOOR' || slot === 'WINDOW') && p.opening === undefined) out.push(`${where}.opening: required for a ${slot}, the shell lane cuts the wall from it`);
  if (p.opening !== undefined) {
    const o = p.opening;
    if (!isObj(o)) out.push(`${where}.opening: expected { widthM, headM, sillM?, leafM?, wallM }`);
    else {
      for (const k of ['widthM', 'headM', 'wallM']) if (!(isNum(o[k]) && o[k] > 0)) out.push(`${where}.opening.${k}: expected metres > 0`);
      if (o.sillM !== undefined && !(isNum(o.sillM) && o.sillM >= 0 && (!isNum(o.headM) || o.sillM < o.headM))) out.push(`${where}.opening.sillM: expected metres, below the head`);
      if (slot === 'WINDOW' && o.sillM === undefined) out.push(`${where}.opening.sillM: a window needs its sill height`);
      if (o.leafM !== undefined && !(isNums(o.leafM, 2) && o.leafM[0] > 0 && o.leafM[1] > 0 && o.leafM[0] <= o.widthM && o.leafM[1] <= o.headM)) out.push(`${where}.opening.leafM: expected [width, height] within the opening`);
      if (o.note !== undefined && typeof o.note !== 'string') out.push(`${where}.opening.note: expected a string`);
    }
  }
  if (p.pivots !== undefined) {
    if (!isObj(p.pivots) || !Object.keys(p.pivots).length) out.push(`${where}.pivots: expected role -> { node, axis, openDeg }`);
    else {
      for (const [role, v] of Object.entries(p.pivots)) {
        if (!isObj(v) || typeof v.node !== 'string' || !v.node) out.push(`${where}.pivots.${role}.node: expected the glTF node name`);
        else if (Array.isArray(e.meta?.nodes) && !e.meta.nodes.includes(v.node)) out.push(`${where}.pivots.${role}.node: '${v.node}' is not in meta.nodes`);
        if (!isObj(v) || !PIVOT_AXES.includes(v.axis)) out.push(`${where}.pivots.${role}.axis: expected one of ${PIVOT_AXES.join(', ')}`);
        if (!isObj(v) || !(isNum(v.openDeg) && v.openDeg > 0 && v.openDeg <= 180)) out.push(`${where}.pivots.${role}.openDeg: expected 0 < degrees ≤ 180`);
      }
    }
  }
  if (p.states !== undefined) {
    const variants = isObj(e.variants) ? e.variants : {};
    if (!Array.isArray(p.states) || !p.states.length) out.push(`${where}.states: expected an ordered list of { variant, when, atMost? }`);
    else {
      p.states.forEach((/** @type {any} */ s, /** @type {number} */ i) => {
        const w = `${where}.states[${i}]`;
        if (!isObj(s)) return void out.push(`${w}: expected { variant, when, atMost? }`);
        if (!Object.hasOwn(STATE_TESTS, s.when)) out.push(`${w}.when: '${s.when}' is not one of ${Object.keys(STATE_TESTS).join(', ')}`);
        if (s.variant !== null && !(typeof s.variant === 'string' && Object.hasOwn(variants, s.variant))) out.push(`${w}.variant: ${JSON.stringify(s.variant)} is not a variant of the entry (null: its own files)`);
        if (s.when === 'hpRatio' && !(isNum(s.atMost) && s.atMost > 0 && s.atMost < 1)) out.push(`${w}.atMost: expected 0 < ratio < 1`);
        if (s.when !== 'hpRatio' && s.atMost !== undefined) out.push(`${w}.atMost: only an hpRatio rule has a threshold`);
        if (s.when === 'always' && i !== p.states.length - 1) out.push(`${w}: an 'always' rule must be the last`);
      });
      if (p.states.at(-1)?.when !== 'always') out.push(`${where}.states: the last rule must be 'always'`);
    }
  }
  const baked = isObj(e.files) && ('normal' in e.files || 'occlusion' in e.files);
  if (baked || p.bake !== undefined) {
    const b = p.bake;
    if (!isObj(b)) out.push(`${where}.bake: baked normal / occlusion maps need { uv: ${BAKED_UV}, … }`);
    else {
      if (b.uv !== BAKED_UV) out.push(`${where}.bake.uv: baked maps are on TEXCOORD_${BAKED_UV}, not ${JSON.stringify(b.uv)}`);
      if (b.occlusion !== undefined && !(isObj(b.occlusion) && ['r', 'g', 'b'].every((c) => typeof b.occlusion[c] === 'string'))) out.push(`${where}.bake.occlusion: expected { r, g, b } descriptions (OCCLUSION_CHANNELS)`);
      for (const k of ['normal', 'uv0']) if (b[k] !== undefined && typeof b[k] !== 'string') out.push(`${where}.bake.${k}: expected a string`);
    }
  }
}

/**
 * The typed params of an audio entry (AudioParams).
 * @param {string[]} out
 * @param {string} at
 * @param {Record<string, any>} e
 * @param {[string, string][]} uses
 */
function checkAudioParams(out, at, e, uses) {
  const p = isObj(e.params) ? e.params : {};
  const where = `${at}.params`;
  const c = p.category;
  if (typeof p.title !== 'string' || !p.title) out.push(`${where}.title: expected a string`);
  if (!AUDIO_CATEGORIES.includes(c)) return void out.push(`${where}.category: '${c}' is not one of ${AUDIO_CATEGORIES.join(', ')}`);
  const need = (/** @type {string} */ k) => p[k] === undefined && out.push(`${where}.${k}: required for ${c}`);
  const played = c === 'sfx' || c === 'ambience' || c === 'ui';
  if (played || c === 'music') ['bus', 'loop'].forEach(need);
  if (played) ['spatial', 'space', 'tags', 'pitchCents', 'gainDb', 'maxVoices', 'cooldown'].forEach(need);
  if (c === 'music') ['layer', 'bpm', 'meter', 'bars', 'barSeconds', 'loopEndSample'].forEach(need);
  if (c === 'ir') ['space', 'rt60Bands', 'rt60'].forEach(need);
  if (c === 'test') ['sections', 'uses'].forEach(need);
  if (p.bus !== undefined && !AUDIO_BUSES.includes(p.bus)) out.push(`${where}.bus: '${p.bus}' is not one of ${AUDIO_BUSES.join(', ')}`);
  for (const k of ['spatial', 'loop', 'noRepeat']) if (p[k] !== undefined && typeof p[k] !== 'boolean') out.push(`${where}.${k}: expected true or false`);
  if (p.space !== undefined && !(AUDIO_SPACES.includes(p.space) || (p.space === null && c !== 'ir'))) out.push(`${where}.space: ${JSON.stringify(p.space)} is not one of ${AUDIO_SPACES.join(', ')}${c === 'ir' ? '' : ' or null'}`);
  if (p.tags !== undefined && !isStrings(p.tags)) out.push(`${where}.tags: expected strings`);
  if (p.pitchCents !== undefined && !(isNum(p.pitchCents) && p.pitchCents >= 0 && p.pitchCents <= 1200)) out.push(`${where}.pitchCents: expected 0 … 1200 cents`);
  if (p.gainDb !== undefined && !(isNum(p.gainDb) && p.gainDb >= 0 && p.gainDb <= 24)) out.push(`${where}.gainDb: expected 0 … 24 dB`);
  if (p.maxVoices !== undefined && !(Number.isInteger(p.maxVoices) && p.maxVoices >= 1)) out.push(`${where}.maxVoices: expected a whole number ≥ 1`);
  if (p.cooldown !== undefined && !(isNum(p.cooldown) && p.cooldown >= 0)) out.push(`${where}.cooldown: expected seconds ≥ 0`);
  if (c === 'music') {
    if (p.layer !== undefined && !MUSIC_LAYERS.includes(p.layer)) out.push(`${where}.layer: '${p.layer}' is not one of ${MUSIC_LAYERS.join(', ')}`);
    const meterOk = isNums(p.meter, 2) && p.meter.every((/** @type {number} */ n) => Number.isInteger(n) && n > 0);
    if (p.meter !== undefined && !meterOk) out.push(`${where}.meter: expected [beats per bar, beat unit]`);
    if (p.bpm !== undefined && !(isNum(p.bpm) && p.bpm > 0)) out.push(`${where}.bpm: expected beats per minute > 0`);
    if (p.bars !== undefined && !(Number.isInteger(p.bars) && p.bars >= 1)) out.push(`${where}.bars: expected a whole number ≥ 1`);
    if (isNum(p.bpm) && meterOk && isNum(p.barSeconds) && Math.abs(p.barSeconds - (60 / p.bpm) * p.meter[0]) > 1e-9) out.push(`${where}.barSeconds: ${p.barSeconds} is not 60 / bpm × ${p.meter[0]} = ${(60 / p.bpm) * p.meter[0]}`);
    else if (p.barSeconds !== undefined && !(isNum(p.barSeconds) && p.barSeconds > 0)) out.push(`${where}.barSeconds: expected seconds > 0`);
    if (p.loop === true) {
      const rate = e.meta?.sampleRate;
      if (!(Number.isInteger(p.loopEndSample) && p.loopEndSample > 0)) out.push(`${where}.loopEndSample: a loop needs its end sample`);
      else if (isNum(rate) && Number.isInteger(p.bars) && isNum(p.barSeconds) && p.loopEndSample !== Math.round(p.bars * p.barSeconds * rate)) out.push(`${where}.loopEndSample: ${p.loopEndSample} is not bars × barSeconds × sampleRate = ${Math.round(p.bars * p.barSeconds * rate)}`);
    } else if (p.loopEndSample !== undefined && p.loopEndSample !== null) out.push(`${where}.loopEndSample: null when the layer does not loop`);
  }
  if (c === 'ir') {
    const bands = p.rt60Bands;
    if (bands !== undefined && !(Array.isArray(bands) && bands.length && bands.every((/** @type {unknown} */ b, /** @type {number} */ i) => isNum(b) && b > 0 && (i === 0 || b > bands[i - 1])))) out.push(`${where}.rt60Bands: expected rising band centres in Hz`);
    if (p.rt60 !== undefined && !(Array.isArray(p.rt60) && Array.isArray(bands) && p.rt60.length === bands.length && p.rt60.every((/** @type {unknown} */ v) => isNum(v) && v > 0))) out.push(`${where}.rt60: expected one reverberation time per band`);
  }
  if (c === 'test') {
    if (p.sections !== undefined && !(Array.isArray(p.sections) && p.sections.every((/** @type {any} */ s, /** @type {number} */ i) => isObj(s) && isNum(s.t) && typeof s.title === 'string' && (i === 0 || s.t > p.sections[i - 1].t)))) out.push(`${where}.sections: expected { t, title } in rising time`);
    if (p.uses !== undefined) {
      if (!isStrings(p.uses)) out.push(`${where}.uses: expected audio ids`);
      else p.uses.forEach((id, i) => uses.push([`${where}.uses[${i}]`, id]));
    }
  }
}
const HEX = /^#[0-9a-f]{6}$/i;

/**
 * @param {string[]} out
 * @param {unknown} lib
 */
function checkLibrary(out, lib) {
  if (lib === undefined) return;
  if (!isObj(lib)) return void out.push('library: expected the material library block');
  if (typeof lib.schema !== 'string' || !/^survival-logs\/material-library@\d+$/.test(lib.schema)) out.push(`library.schema: expected 'survival-logs/material-library@<n>', got ${JSON.stringify(lib.schema)}`);
  if (lib.generator !== undefined && typeof lib.generator !== 'string') out.push('library.generator: expected a string');
  if (lib.units !== undefined && lib.units !== 'meters') out.push(`library.units: expected 'meters'`);
  for (const k of ['toolchain', 'conventions']) {
    if (lib[k] !== undefined && (!isObj(lib[k]) || !Object.values(lib[k]).every((v) => typeof v === 'string'))) out.push(`library.${k}: expected name -> string`);
  }
  if (lib.targets !== undefined && !isObj(lib.targets)) out.push('library.targets: expected an object');
}

/**
 * @param {string} p
 * @returns {boolean} a repo-relative POSIX path without . or .. segments
 */
const repoPath = (p) => typeof p === 'string' && !!p && !p.startsWith('/') && !p.includes('\\') && !p.split('/').some((s, i, all) => s === '..' || s === '.' || (s === '' && i < all.length - 1));

/**
 * @param {string[]} out
 * @param {unknown} rebuild
 * @returns {Set<string>} the recipe names
 */
function checkRecipes(out, rebuild) {
  if (rebuild === undefined) return new Set();
  if (!isObj(rebuild)) return out.push('rebuild: expected recipe name -> recipe'), new Set();
  for (const [name, r] of Object.entries(rebuild)) {
    const at = `rebuild.${name}`;
    if (!isObj(r)) {
      out.push(`${at}: expected a recipe`);
      continue;
    }
    if (typeof r.entry !== 'string' || !repoPath(r.entry) || !r.entry.startsWith('tools/') || !/\.(sh|mjs|js|py)$/.test(r.entry)) out.push(`${at}.entry: expected a .sh, .mjs, .js or .py script under tools/`);
    if (r.args !== undefined && !isStrings(r.args)) out.push(`${at}.args: expected strings`);
    if (!isStrings(r.inputs) || !r.inputs.length || !r.inputs.every(repoPath)) out.push(`${at}.inputs: expected the repo paths the build reads`);
    for (const k of ['shared', 'persist']) if (r[k] !== undefined && (!isStrings(r[k]) || !r[k].every(repoPath))) out.push(`${at}.${k}: expected repo paths`);
    if (!isObj(r.tools) || !Object.keys(r.tools).length || !Object.values(r.tools).every((v) => typeof v === 'string' && v)) out.push(`${at}.tools: expected the pinned tool versions`);
    if (r.seeds !== undefined && (!isObj(r.seeds) || !Object.values(r.seeds).every((v) => Number.isInteger(v)))) out.push(`${at}.seeds: expected name -> integer`);
    if (r.cycles !== undefined && (!isObj(r.cycles) || !Number.isInteger(r.cycles.seed) || !Number.isInteger(r.cycles.samples) || r.cycles.samples < 1)) out.push(`${at}.cycles: expected { seed, samples } integers`);
    if (typeof r.cost !== 'number' || !(r.cost > 0)) out.push(`${at}.cost: expected seconds per asset`);
    if (r.timeoutSec !== undefined && !(typeof r.timeoutSec === 'number' && r.timeoutSec > 0)) out.push(`${at}.timeoutSec: expected seconds`);
  }
  return new Set(Object.keys(rebuild));
}

/**
 * @param {string[]} out
 * @param {string} at
 * @param {unknown} m
 * @param {(id: string) => Record<string, any> | undefined} lookup
 */
function checkInstance(out, at, m, lookup) {
  if (!isObj(m)) return void out.push(`${at}: expected { material, variant?, tint?, secondaryTint?, wear?, dirt?, seed? }`);
  const mat = typeof m.material === 'string' ? lookup(m.material) : undefined;
  if (!mat) return void out.push(`${at}.material: ${JSON.stringify(m.material)} is not a material in any manifest`);
  if (mat.kind !== 'material') return void out.push(`${at}.material: '${m.material}' is a ${mat.kind}, not a material`);
  const params = isObj(mat.params) ? mat.params : {};
  if (m.variant !== undefined && !(isObj(mat.variants) && Object.hasOwn(mat.variants, m.variant))) out.push(`${at}.variant: '${m.material}' has no variant '${m.variant}'`);
  const presets = isObj(params.tint) && isObj(params.tint.presets) ? params.tint.presets : {};
  for (const k of ['tint', 'secondaryTint']) {
    const v = m[k];
    if (v !== undefined && !(typeof v === 'string' && (HEX.test(v) || Object.hasOwn(presets, v)))) out.push(`${at}.${k}: ${JSON.stringify(v)} is neither '#rrggbb' nor a tint preset of '${m.material}'`);
  }
  if (m.tint !== undefined && isObj(params.instance) && params.instance.tint === false) out.push(`${at}.tint: '${m.material}' takes no per-object tint`);
  for (const k of ['wear', 'dirt']) {
    const v = m[k];
    if (v === undefined) continue;
    const range = isObj(params.instance) && Array.isArray(params.instance[k]) ? params.instance[k] : [0, 1];
    if (typeof v !== 'number' || v < Math.max(0, range[0]) || v > Math.min(1, range[1])) out.push(`${at}.${k}: ${v} is outside ${Math.max(0, range[0])} … ${Math.min(1, range[1])}`);
  }
  if (m.seed !== undefined && !(Number.isInteger(m.seed) && m.seed >= 0 && m.seed <= 0xffffffff)) out.push(`${at}.seed: expected an integer 0 … 2^32 - 1`);
  if (m.use !== undefined && !MATERIAL_USES.includes(m.use)) out.push(`${at}.use: '${m.use}' is not one of ${MATERIAL_USES.join(', ')}`);
  const restricted = isObj(params.tint) && isObj(params.tint.presetUse) ? params.tint.presetUse : {};
  for (const preset of new Set([m.tint, m.variant].filter((v) => typeof v === 'string' && Object.hasOwn(restricted, v)))) {
    const uses = restricted[preset];
    if (m.use === undefined) out.push(`${at}.use: '${m.material}' restricts preset '${preset}' to ${uses.join(', ')}; name the part's use`);
    else if (MATERIAL_USES.includes(m.use) && !uses.includes(m.use)) out.push(`${at}.use: preset '${preset}' of '${m.material}' is for ${uses.join(', ')}, not ${m.use}`);
  }
  const known = ['material', 'variant', 'tint', 'secondaryTint', 'wear', 'dirt', 'seed', 'use'];
  for (const k of Object.keys(m)) if (!known.includes(k)) out.push(`${at}.${k}: not a material-instance field (${known.join(', ')})`);
}

/**
 * A material's `params.tint.presetUse`: preset -> the uses (MATERIAL_USES) it is allowed for; unlisted presets suit
 * every use.
 * @param {string[]} out
 * @param {string} at
 * @param {Record<string, any>} e
 */
function checkPresetUse(out, at, e) {
  const tint = isObj(e.params) && isObj(e.params.tint) ? e.params.tint : null;
  if (!tint || tint.presetUse === undefined) return;
  const where = `${at}.params.tint.presetUse`;
  if (!isObj(tint.presetUse)) return void out.push(`${where}: expected preset -> uses`);
  const presets = isObj(tint.presets) ? tint.presets : {};
  for (const [preset, uses] of Object.entries(tint.presetUse)) {
    if (!Object.hasOwn(presets, preset)) out.push(`${where}.${preset}: not a tint preset of the material`);
    if (!Array.isArray(uses) || !uses.length || !uses.every((u) => MATERIAL_USES.includes(u))) out.push(`${where}.${preset}: expected uses from ${MATERIAL_USES.join(', ')}`);
  }
}
