// @ts-check
// The numbers tools/art-metrics.mjs judges assets by, each with where it is decided. docs/ART.md is the standard
// (the version with WP-P0-04b's §3 and §7.2); the triangle budgets and required clips come from the lane packages;
// what neither decides is labelled "decided (WP-P0-11)" with its reason. tests/art-metrics.test.js holds these
// numbers to the ART.md text, so a change there needs a matching change here. After P0 these only tighten
// (docs/QUALITY.md, "Thresholds").

/** Linear-luminance limits of a base color (Rec. 709 weights on linear RGB). */
export const ALBEDO = Object.freeze({
  /** ART.md §7.2 "Hard limits for every diffuse albedo: linear 0.013–0.90 (sRGB 30–243)" */
  dielectric: Object.freeze({ min: 0.013, max: 0.9, source: 'docs/ART.md §7.2 hard limits' }),
  /**
   * Metals carry F0 in the base color. ART.md §7.2 names bare steel F0 0.56 and aluminium F0 0.91; the range is
   * those two widened by the ±10 % tolerance ART.md §3 uses (0.56 × 0.9 = 0.50, 0.91 × 1.1 capped at 1).
   */
  metal: Object.freeze({ min: 0.5, max: 1, source: 'decided (WP-P0-11) from the ART.md §7.2 F0 values' }),
  /** each texel is judged by its own metalness (ORM blue × metalnessFactor): metal above 0.5, else dielectric */
  /** the texel percentiles the limits apply to, so compression noise in a handful of texels does not fail a map */
  percentiles: Object.freeze([0.5, 99.5]),
});

/**
 * ART.md §7.2 family bands, keyed by the `params.family` names the lanes use. `albedo` is the linear luminance of
 * the untinted base color's median texel; `roughness` the median of the ORM green channel times roughnessFactor.
 * Where ART.md gives one value instead of a range, the band is that value ±10 % (the tolerance of ART.md §3).
 * A family missing here, or a band without albedo or roughness, is unbanded: the band check fails until ART.md gives
 * the number (a transmissive family's albedo is exempt).
 * @type {Readonly<Record<string, { label: string, albedo?: readonly [number, number], roughness?: readonly [number, number], metal?: boolean, transmissive?: boolean }>>}
 */
export const FAMILY_BANDS = Object.freeze({
  plaster_paint: { label: 'plaster walls', albedo: [0.45, 0.65], roughness: [0.85, 0.95] },
  wood_floor: { label: 'wood floors', albedo: [0.25, 0.39], roughness: [0.45, 0.65] },
  wood_stained: { label: 'stained wood accents', albedo: [0.1, 0.2], roughness: [0.45, 0.65] },
  // ART.md: 0.75 assumed and one measured sample at 0.878; the band spans both, up to the 0.90 hard limit
  tile_ceramic: { label: 'white ceramic tiles', albedo: [0.7, 0.9], roughness: [0.15, 0.3] },
  // ART.md: light tile ÷ 1.96 = 0.38 (single value, ±10 %)
  tile_checker_dark: { label: 'dark checker tiles', albedo: [0.342, 0.418], roughness: [0.2, 0.35] },
  grout: { label: 'grout', albedo: [0.3, 0.45], roughness: [0.8, 0.95] },
  terracotta: { label: 'terracotta and pavers', albedo: [0.2, 0.35], roughness: [0.7, 0.9] },
  fabric: { label: 'fabric', albedo: [0.22, 0.46], roughness: [0.85, 1] },
  foliage: { label: 'foliage', albedo: [0.13, 0.16], roughness: [0.6, 0.8] },
  skin_light: { label: 'light skin', albedo: [0.3, 0.4], roughness: [0.5, 0.6] },
  skin_medium: { label: 'medium skin', albedo: [0.18, 0.28], roughness: [0.5, 0.6] },
  skin_dark: { label: 'dark skin', albedo: [0.06, 0.12], roughness: [0.5, 0.6] },
  // ART.md roughness single values (0.25 wet, 0.7 dry), ±10 %
  blood_fresh: { label: 'fresh blood', albedo: [0.04, 0.08], roughness: [0.225, 0.275] },
  blood_dried: { label: 'dried blood', albedo: [0.02, 0.03], roughness: [0.63, 0.77] },
  metal_painted: { label: 'painted metal', albedo: [0.05, 0.8], roughness: [0.35, 0.6] },
  // bare steel F0 0.56 … aluminium 0.91 (ALBEDO.metal)
  metal_bare: { label: 'bare metal (F0)', albedo: [0.5, 1], roughness: [0.2, 0.4], metal: true },
  rust: { label: 'rust', albedo: [0.1, 0.25] },
  glass: { label: 'glass', roughness: [0.05, 0.25], transmissive: true },
  // survivor clothing band (derived from the t069 targets): garments 0.10–0.30; soles near-white up to 0.70
  cloth: { label: 'clothing', albedo: [0.1, 0.3], roughness: [0.8, 1] },
  cloth_sole: { label: 'sneaker soles', albedo: [0.1, 0.7], roughness: [0.4, 0.6] },
  cloth_leather: { label: 'sneaker rubber and leather', roughness: [0.4, 0.6] },
  // the materials lane's derived bands (tools/materials/bands.json, each traced there to an ART.md §7.2 family), promoted
  concrete: { label: 'concrete', albedo: [0.2, 0.35], roughness: [0.7, 0.9] },
  leather: { label: 'leather', albedo: [0.02, 0.3], roughness: [0.4, 0.6] },
  laminate: { label: 'laminate', albedo: [0.25, 0.39], roughness: [0.45, 0.65] },
  rubber: { label: 'rubber', albedo: [0.013, 0.05], roughness: [0.4, 0.6] },
  cardboard: { label: 'cardboard', albedo: [0.2, 0.35], roughness: [0.85, 0.95] },
  plastic: { label: 'plastic', albedo: [0.02, 0.8], roughness: [0.35, 0.6] },
  bark: { label: 'bark', albedo: [0.08, 0.2], roughness: [0.7, 0.9] },
  soil: { label: 'soil', albedo: [0.05, 0.2], roughness: [0.8, 0.97] },
  newsprint: { label: 'newsprint', albedo: [0.45, 0.65], roughness: [0.85, 0.95] },
  rattan: { label: 'rattan', albedo: [0.25, 0.45], roughness: [0.45, 0.65] },
});

/**
 * Metalness is a switch, not a blend: at least 90 % of texels (inside the UV islands for atlases) are within 0.1 of 0
 * or of 1 (glTF metallic-roughness; mixed values read as neither metal nor paint). Decided (WP-P0-11).
 */
export const METALNESS = Object.freeze({ nearZero: 0.1, nearOne: 0.9, minShare: 0.9 });

/** Roughness (ORM green) is saturated at the 8-bit ends; at most this share of texels may sit there. */
export const ROUGHNESS_SATURATION = Object.freeze({
  low: 1,
  high: 254,
  maxFraction: 0.005,
  source: 'decided (WP-P0-11): a clipped roughness map loses the specular variation its scan carries',
});

/** Tangent-space normal maps are unit length (|n| decoded from RGB = XYZ × 0.5 + 0.5) and face outward (z ≥ 0). */
export const NORMALS = Object.freeze({
  /** on every stored mip level (runtime-made mips are the renderer's) */
  meanLengthError: 0.02,
  p99LengthError: 0.08,
  /** share of texels (inside the UV islands) whose normal points into the surface (z < 0) */
  maxBackFacingShare: 0.001,
  source: 'decided (WP-P0-11): 8-bit quantisation and UASTC stay under 0.01 mean; unnormalised mips reach 0.05–0.2; back-facing texels render as black specks',
});

/** Tiled materials (ART.md §3 "Tiling"). */
export const TILING = Object.freeze({
  /** ART.md §3: "Tiled materials repeat at 1 m or 2 m, aligned to the grid" */
  sizesM: Object.freeze([1, 2]),
  /** wrap seam vs interior adjacent-texel steps (tools/materials/checks.mjs seamMetric) */
  seam: Object.freeze({ maxZ: 4, maxRatioToP99: 1.3 }),
  /**
   * Repetition: the tile is cut into blocks of a quarter tile (25 cm at 1 m) and the block means of linear
   * luminance are compared with the tile mean. A block that stands out by more than this share of the mean is a
   * landmark the eye finds again at every repeat (decided, WP-P0-11).
   */
  repetition: Object.freeze({
    /**
     * [blocks per side, largest block-mean deviation from the tile mean]: 4 × 4 (25 cm at 1 m) and 8 × 8 catch
     * blotches and gradients; 16 × 16 (6 cm) catches the small standout feature that repeats in a 3 × 3 tiling
     * (calibrated on the library: oak's knot 30 %, concrete's patches 95 %; painted metal 22 %, tile 20 %, pine 14 %).
     * A material that repeats by design (checker, brick bond, plank module) declares `params.patternM` and is measured
     * with that pattern removed: a clean checker at ART.md's 0.75 / 0.38 passes, a stain that repeats per tile fails.
     */
    levels: Object.freeze([
      [4, 0.12],
      [8, 0.2],
      [16, 0.25],
    ]),
    /** the families whose design repeats and may declare `params.patternM` (checker, brick, planks, ceramic tile) */
    patternedFamilies: Object.freeze(['tile_checker_dark', 'tile_ceramic', 'wood_floor', 'brick']),
    /** a declared pattern repeats at least this often along each side of the tile */
    minPeriods: 4,
    /** after the pattern is removed, the texture must keep at least this relative standard deviation (of the mean) */
    minResidualStd: 0.005,
  }),
  /**
   * A tile that equals itself shifted by half or a quarter of its size (mean difference ≤ 1 sRGB code over RGB)
   * (and a quarter or less of the difference at an unrelated shift) repeats at that smaller period, whatever `sizeM` says: a 2 × 2 copy filed as a 2 m tile repeats every metre, and
   * its blocks would be judged at twice their real size. It fails `tile-size`. Shifts that are whole multiples of a
   * declared pattern are exempt.
   */
  selfCopy: Object.freeze({
    fractions: Object.freeze([1 / 2, 1 / 4]),
    maxMeanCodes: 1,
    /**
     * compared with a shift by 0.37 of the tile (no period): the copy shift must be at most a quarter of it, and the
     * texture must show at least 1 code of structure there (a flat tile, glass 0.14 or cardboard 0.03, cannot visibly
     * repeat). Measured on the library at 37ce1a2: 13 materials 0.00 at half or a quarter against 1.2–13 at 0.37
     */
    maxShareOfReference: 0.25,
    minReferenceCodes: 1,
  }),
  source: 'docs/ART.md §3; seam and repetition limits decided (WP-P0-11)',
});

/** Texel density classes in px/m (ART.md §3) and the ±10 % tolerance per UV island mean. */
export const TEXEL_DENSITY = Object.freeze({
  // character: skinned survivors and zombies, their islands packed into 512 skin / 1K cloth atlases, which hold about
  // 440 px/m (ART.md §3, decided 2026-09-24: 1.3× over the 337 px/m a surface reaches on screen at 3.3 m and 50°)
  classes: Object.freeze({ regular: 256, tall: 384, hero: 512, distant: 128, character: 440 }),
  /**
   * Atlas islands are judged when they would hold at least 8 × 8 texels at their class density and are at least 8
   * texels across: below that the mean is set by texel snapping and packing margins (a bevel strip 0.6 texels wide
   * cannot hold 256 px/m), and nothing that small shows a density step (decided, WP-P0-11).
   */
  minIslandTexels: 64,
  minIslandWidthTexels: 8,
  /** the islands left unjudged may cover at most this share of the surface */
  maxUnjudgedAreaShare: 0.1,
  /**
   * Alpha-tested hair cards are thin strips by construction (a card is a few texels across), so most of a hair part
   * is too small to judge; they may leave this share unjudged (decided 2026-09-24)
   */
  maxUnjudgedHairShare: 0.35,
  /** names the lanes use for the classes (`params.tier`) */
  aliases: Object.freeze({ tallPartition: 'tall', 'tall-partition': 'tall' }),
  tolerance: 0.1,
  /** a kind without a declared tier gets this class (ART.md §3: characters) */
  defaults: Object.freeze({ character: 'character' }),
  source: 'docs/ART.md §3',
});

/**
 * Meter UVs (library.conventions.uv: "uv_m, 1 unit = 1 m, or world-planar position"). Each UV0 island of a part
 * dressed in a library material reads 1 UV unit per metre ±10 % (unwrapped in metres), or its own world-planar box
 * projection scale ±10 % (a face at angle θ to its projection axis keeps √cos θ of its density), as ./gltf.mjs
 * `uvIslands` measures both.
 */
export const METER_UV = Object.freeze({ scale: 1, tolerance: 0.1, source: 'assets/materials/library.json conventions.uv' });

/**
 * Triangle budgets by `params.class` (LOD 0; every coarser LOD must have fewer).
 * @type {Readonly<Record<string, { max: number, source: string }>>}
 */
export const TRIANGLES = Object.freeze({
  furniture: { max: 5000, source: 'docs/wp/WP-P0-10.md: furniture ≤ 5k triangles' },
  prop: { max: 1500, source: 'docs/wp/WP-P0-10.md: props ≤ 1.5k' },
  hero: { max: 10000, source: 'docs/wp/WP-P0-10.md: hero pieces ≤ 10k' },
  character: { max: 15000, source: 'docs/wp/WP-P0-09.md: ≤ 15k triangles for the hero character' },
  shell: {
    max: 60000,
    source: 'decided (WP-P0-11): one home floor; hidden floors still render into the key light\'s shadow map every frame (ART.md §4.4), and this is the only GPU-side guard',
  },
});

/** Each LOD may keep at most this share of the triangles of the level before it. */
export const LOD_MAX_RATIO = 0.6;

/** Kinds whose entries default to a triangle class when `params.class` is absent. */
export const TRIANGLE_CLASS_DEFAULTS = Object.freeze({ character: 'character' });

/** Skinned meshes (WP-P0-09): at most 4 bone influences per vertex. */
export const MAX_INFLUENCES = 4;

/** Clips every character must carry, by name (docs/wp/WP-P0-09.md: `idle`, `walk`, `run`). Later phases add to the list. */
export const REQUIRED_CLIPS = Object.freeze({ character: Object.freeze(['idle', 'walk', 'run']) });

/** Icons (WP-P0-12): 64 / 128 / 256 px squares with alpha, perceptually distinct within a category. */
export const ICONS = Object.freeze({
  sizes: Object.freeze([64, 128, 256]),
  /** at least this share of each file's texels is transparent (backdrop-free alpha) */
  minTransparent: 0.05,
  /**
   * Two icons of a category are distinct when their 64-bit DCT perceptual hashes differ in at least `minHashBits`, or
   * their mean opaque colours differ by at least `minColorDeltaE` (CIEDE2000) and still by `minCvdDeltaE` under
   * protanopia and deuteranopia (Machado 2009, full severity), since same-template containers differ mainly in label
   * colour (decided, WP-P0-11).
   */
  minHashBits: 14,
  minColorDeltaE: 12,
  minCvdDeltaE: 8,
  source: 'docs/wp/WP-P0-12.md; distinctness limits decided (WP-P0-11)',
});

/**
 * Text-like glyph rows in renders, icons, base colors and model atlases (WP-P0-12 "no text artifacts on labels";
 * scans with printed text). A row is at least `minGlyphs` blobs (`minGlyphsShort` under `shortRowPx`) of similar height on one baseline with gaps under
 * `maxGapRatio` × height and varied widths (periodic weaves and tiles have equal widths). An entry that shows text
 * declares its lines in `params.labelText` (a list): every row found must match a declared line's letter count
 * within ±30 %, and there may be no more rows than lines.
 */
export const TEXT = Object.freeze({
  minGlyphs: 3,
  /**
   * rows of glyphs under 24 px need 4: gravel and speckle make short chains of 3 (the CC0 concrete scan held 15 such
   * rows, 12–21 px); calibrated to no finding on any library material (WP-P0-11c)
   */
  minGlyphsShort: 4,
  shortRowPx: 24,
  /**
   * and a median stroke width (2 × area / boundary) of at most 0.2 of the glyph height: letters are thin strokes
   * (0.11–0.13 in the fixtures, 1–2 px strokes at 12 px), speckle is blobs (0.19–0.41 in the concrete scan)
   */
  maxStrokeShare: 0.2,
  /** glyphs from 6 px tall, whatever the image size */
  minGlyphPx: 6,
  maxGlyphHeightShare: 1 / 6,
  contrast: 0.12,
  heightTolerance: 0.3,
  maxGapRatio: 1.2,
  minWidthVariation: 0.15,
  source: 'decided (WP-P0-11)',
});

/**
 * Lightmap seams: across a UV seam of a continuous surface (face normals within 30°), the irradiance sampled one
 * texel inside each side may step by at most 5 % (p95 along the edge) and 10 % anywhere; islands keep at least 2
 * texels of padding (4 in block-compressed KTX2) dilated from them (within 10 %), so bilinear filtering and mips never
 * pull in a foreign value; at most 1 % of the ring may miss.
 */
export const LIGHTMAP = Object.freeze({
  /** the p95 of the relative step along each seam edge, and its largest sample */
  maxRelativeStep: 0.05,
  maxStepAnywhere: 0.1,
  stepPercentile: 95,
  maxNormalAngleDeg: 30,
  /** below this share of the map's p99, steps count against this floor instead (dark corners) */
  darkFloor: 0.02,
  paddingTexels: 2,
  /** block-compressed KTX2 (4 × 4 blocks) needs a whole block of padding */
  paddingTexelsKtx2: 4,
  maxUnpaddedShare: 0.01,
  source: 'decided (WP-P0-11); bake contract docs/ART.md §4.4',
});

/**
 * The asset families the art lanes deliver, with the package that writes each manifest. A family with no manifest
 * yet, or whose manifests hold no entry, is listed as missing, which fails the check: nothing passes for an asset
 * that does not exist.
 * @type {Readonly<Record<string, { manifest: string, owner: string }>>}
 */
export const FAMILIES = Object.freeze({
  materials: { manifest: 'assets/materials/library.json', owner: 'WP-P0-05' },
  characters: { manifest: 'assets/characters/manifest.json', owner: 'WP-P0-09' },
  // the scanned CC0 props replaced the planned furniture lane (WP-P0-10); the three.js renderer builds the home shells
  // procedurally (src/render3d/shell.js) and lights them in real time, so no shell models or lightmaps (WP-P0-13)
  // exist to judge (decided 2026-09-24, ART.md §4.4)
  models: { manifest: 'assets/models/manifest.json', owner: 'WP-P1-models' },
  icons: { manifest: 'assets/icons/manifest.json', owner: 'WP-P0-12' },
});

/**
 * Entry kinds art-metrics has no check for (sound, grading, typefaces); they are counted, not judged, and make no
 * family present. Fonts are judged by tests/fonts.test.js (glyph coverage, sizes) and the UI tile tests (clipping).
 */
export const UNJUDGED_KINDS = Object.freeze(['audio', 'lut', 'probe', 'font']);

/**
 * The content each art family must hold by phase, beyond having a manifest: a skinned `kind: 'character'` entry per
 * survivor (id `characters/<survivor>`); per home, a `params.class: 'shell'` model per floor (`params.home`,
 * `params.floor`) and a lightmap entry for it (`params.model`) with the five ART.md §4.4 sets; icons bound to config
 * items. P0 is the spike scope (docs/wp/WP-P0-09.md: the Wage Slave; WP-P0-13.md: the apartment's 1F); from P1 all of it.
 * @type {Readonly<Record<string, { characters: readonly string[], homes: Readonly<Record<string, readonly string[]>> }>>}
 */
export const CONTENT = Object.freeze({
  // no baked shells: the shell is procedural and lit in real time (FAMILIES above), so no home needs a shell model
  P0: { characters: ['wage'], homes: {} },
  P1: { characters: ['wage', 'student', 'warehouse'], homes: {} },
});
/** ART.md §4.4 "Five lightmap sets per home", as file keys of a lightmap entry. */
export const LIGHTMAP_SETS = Object.freeze(['day', 'dusk', 'night', 'overcast', 'lamps']);

/**
 * The checks each kind must pass: a skip of one of these is a failure (the entry lacks what the check needs). A
 * transmissive family's albedo checks and a single icon's distinctness are the only skips allowed.
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const REQUIRED_CHECKS = Object.freeze({
  material: ['albedo-range', 'albedo-band', 'roughness-saturation', 'roughness-band', 'metalness', 'normal-length', 'tile-seams', 'tile-repetition', 'tile-size', 'texel-density', 'text-artifacts'],
  model: ['triangle-budget', 'texel-density'],
  character: ['triangle-budget', 'bone-influences', 'required-clips', 'texel-density', 'albedo-range', 'roughness-saturation', 'metalness', 'normal-length', 'text-artifacts'],
  icon: ['icon-sizes', 'icon-distinct', 'text-artifacts'],
  lightmap: ['lightmap-seams', 'lightmap-padding'],
});
