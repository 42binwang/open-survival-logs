# WP-P0-05b — Material library to the ART.md standard

**Role:** materials lane (the P0-05 author). **Phase:** P0. **Depends on:** WP-P0-04 and WP-P0-04b (merged: ART.md
bands, roughness, texel density), WP-P0-11 (art metrics, on `wp/P0-11` until it merges).

## Scope
- **Pass art metrics on the library.** WP-P0-11 measured 29 findings on master's library:
  - texel density about 2× the ART.md classes on all 16 materials (ART.md §3: 256 px/m regular, 512 hero, 384 tall
    partitions);
  - albedo bands missed for plaster, oak, pine, white tile and curtain;
  - roughness bands missed for plaster, oak, pine, tile and glass (ART.md §7.2);
  - tints outside the hard limits: pine `dark`, rubber `red_brown`, and brass and copper below metal F0 0.5 (they
    measure 0.31–0.40 against physical values of about 0.72–0.78);
  - six materials with no band at all (concrete, wallpaper, leather, laminate, rubber, cardboard). Give each an
    ART.md-derived band, and hand any missing ART.md band to the art director as a hook request.
- **The seed bug:** `tools/blender/materials/library.py` renders black in Cycles above a seed of about 2²⁰, while
  `instanceSeed()` returns up to 2³²−1. Store `frac(seed × φ)` computed in Python, state "mod 1" in
  `library.conventions.variation`, and say how the runtime shader wraps it.
- **New materials the lanes lacked:** plastic (TV and radio housings), bark, soil, newsprint and rattan (furniture),
  plus detail maps for fabric, leather and cardboard. Each is a CC0 scan (Poly Haven or ambientCG), pinned and
  calibrated like the rest.
- **Housekeeping:** reword the `tools/fetch-assets.mjs` header (the gate calls `tools/asset-lock.mjs`); drop
  `assets/lock/` from the materials recipe inputs; add `ogg|wav|flac` to `UNPACK_EXT` (P0-06); keep
  `install-ktx.sh` macOS-only and say so.
- **Dependents:** list every shipped asset whose rebuild recipe takes library files as input (the icons' tin, the
  furniture bakes, the shell's lightmaps, the character if it uses any), so the integrator re-bakes them when this
  merges. Their digests go stale otherwise, and asset-lock would rightly fail.

## Exclusive paths
As WP-P0-05: `tools/bin/`, `tools/blender/run.sh`, `tools/blender/common/`, `tools/blender/materials/`,
`tools/materials/`, `tools/fetch-assets.mjs`, `assets/materials/`, `docs/art/materials/`, `assets/lock/WP-P0-05b.json`,
`assets/credits/WP-P0-05b.md`, `tests/materials.test.js`.

## Acceptance
- `node tools/art-metrics.mjs --json` (WP-P0-11's tool) reports no material-library findings.
- The seed fix is tested at seeds 0, 2²⁰ and 2³²−1.
- Every material re-bakes byte-identical through asset-lock.
- The existing materials tests stay green and unweakened.

## Deliverables
The changes on `wp/P0-05b`, previews and the contact sheet in `docs/art/materials/`, the dependents list, and the
JSON report.
