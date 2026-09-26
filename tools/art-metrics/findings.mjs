// @ts-check
// The result of one art metric on one entry, and the context the checks read files through.

/**
 * @typedef {object} Finding
 * @property {string} check  a check id from CHECKS
 * @property {string} entry  the asset id
 * @property {'pass' | 'fail' | 'skip'} state  skip: the check does not apply to this entry, with the reason in detail
 * @property {string} detail  what was measured against what
 * @property {boolean} [exempt]  a skip the kind's required checks allow (a transmissive family's albedo, a lone icon)
 */

/** Every check the tool runs, in report order, with what it measures. */
export const CHECKS = Object.freeze({
  content: 'every art family holds what the phase needs (a skinned character per survivor, a shell and five lightmap sets per home floor, bound icons)',
  'albedo-range': 'base color within the ART.md §7.2 hard limits per texel (dielectric 0.013–0.90, metal F0 0.50–1.0 by the texel\'s metalness), every tint',
  'albedo-band': 'untinted base color median inside its ART.md §7.2 family band (an unbanded family fails)',
  'roughness-saturation': 'at most 0.5 % of roughness texels clipped at 0 or 1',
  'roughness-band': 'roughness median inside its ART.md §7.2 family band',
  metalness: 'at least 90 % of texels within 0.1 of metal (1) or dielectric (0)',
  'normal-length': 'tangent-space normals unit length on every stored mip (mean error ≤ 0.02, p99 ≤ 0.08) and facing out',
  'tile-seams': 'no wrap seam on tiled maps (base color, normals, roughness)',
  'tile-repetition': 'no block of a 4 × 4, 8 × 8 or 16 × 16 grid standing out from the tile mean by more than 12, 20 or 25 %',
  'tile-size': 'tiled materials repeat at 1 m or 2 m (ART.md §3)',
  'texel-density': 'every UV island within ±10 % of its ART.md §3 class (regular 256, tall 384, hero 512, distant 128 px/m); unjudged islands ≤ 10 % of the area',
  'meter-uv': 'UV0 of parts bound to library materials is 1 unit = 1 m, ±10 %',
  'triangle-budget': 'triangles (measured in the file) within the class budget and equal to what the manifest says',
  'lod-triangles': 'every coarser LOD keeps at most 60 % of the triangles of the one before, as the manifest says',
  'bone-influences': 'at most 4 bone influences per vertex',
  'required-clips': 'characters carry the idle, walk and run clips',
  'icon-sizes': 'icons at 64, 128 and 256 px, square, with transparent backdrop',
  'icon-distinct': 'icons of a config category are perceptually distinct (DCT hash ≥ 14 bits, or ΔE2000 ≥ 12 and ≥ 8 under colour-blindness)',
  'text-artifacts': 'no text-like glyph rows (glyphs ≥ 6 px, ≥ 3 in a row) beyond the label lines an entry declares',
  'lightmap-seams': 'irradiance steps across UV seams of continuous surfaces ≤ 5 % (p95) and ≤ 10 % anywhere',
  'lightmap-padding': 'at least 2 texels (4 in KTX2) of dilated padding around every lightmap island',
});

/** @param {string} check @param {string} entry @param {string} detail @returns {Finding} */
export const pass = (check, entry, detail) => ({ check, entry, state: 'pass', detail });
/** @param {string} check @param {string} entry @param {string} detail @returns {Finding} */
export const fail = (check, entry, detail) => ({ check, entry, state: 'fail', detail });
/** @param {string} check @param {string} entry @param {string} detail @returns {Finding} */
export const skip = (check, entry, detail) => ({ check, entry, state: 'skip', detail });
/** @param {string} check @param {string} entry @param {string} detail @returns {Finding} */
export const exempt = (check, entry, detail) => ({ check, entry, state: 'skip', detail, exempt: true });

/** @param {string} check @param {string} entry @param {boolean} ok @param {string} detail @returns {Finding} */
export const verdict = (check, entry, ok, detail) => (ok ? pass(check, entry, detail) : fail(check, entry, detail));

/** @param {number} v @param {number} [d] */
export const fmt = (v, d = 3) => (Number.isFinite(v) ? Number(v.toFixed(d)).toString() : String(v));
/** @param {number} v signed percent */
export const pct = (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)} %`;

/**
 * @typedef {object} Context
 * @property {string} root  the checkout the asset paths are relative to
 * @property {(path: string) => Uint8Array} read
 * @property {(path: string) => boolean} exists
 * @property {(path: string) => Promise<import('./images.mjs').Texture>} texture  decoded once per path
 * @property {(bytes: Uint8Array) => Promise<import('./images.mjs').Texture>} decodeBytes  an image held in memory (embedded glTF textures)
 * @property {(path: string) => Promise<import('./gltf.mjs').GltfFacts>} gltf  read once per path
 * @property {(configId: string) => string | null} configCategory  the game config category of a config item id, for icon groups
 * @property {(configId: string) => number | null} [configCategoryCode]  the same category as its numeric config code
 * @property {Map<string, import('../../src/contracts/assets.js').AssetEntry>} assets  every entry of every manifest by id
 * @property {Map<string, import('../../src/contracts/assets.js').AssetBinding & { cfg: string }>} bindings  config id -> binding, all manifests
 */
