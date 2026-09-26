# WP-P0-04b — ART.md fix-up after approval

**Role:** art director (the P0-04 author). **Phase:** P0. **Depends on:** WP-P0-04 merged. The art re-review approved
P0-04 with one required edit before P0-13 bakes; this package makes it and batches the small follow-ups, so the
downstream lanes read one settled standard.

## Scope
- **Required (blocks P0-13):** ART.md §4.4 — the DAY, DUSK and NIGHT lightmap sets hold sky, bounce and the key
  light's indirect light only; the key light's direct term comes only from the runtime shadowed light (in Cycles,
  exclude the key's direct contribution).
- **Specs the renderer and bake lanes need without guessing:**
  - fog colour per rig as scene-linear radiance (sky colour × E_h × about 0.5 / π), with reasons for the fog densities
    and the bloom strength and radius;
  - one GTAO rule three.js can implement: a material AO term on probe-lit movables only, or the whole frame at a
    stated reduced intensity (the lightmaps already hold contact occlusion);
  - the emitter layer: it writes display-encoded colour with tone mapping and colour-space conversion off, it keeps
    the main render's depth texture, and it has a stated scene-linear emissive strength for bloom;
  - overcast rigs (dawn, storm day, cold wave): a sky-only set, or reuse of DAY stated as a decision; the dusk set
    normalised knowing that the ss_04 anchor already has the bed lamp on;
  - the LAMPS calibration target for P0-08: t033's reference wall at 0.141 ±5 codes (the lamp intensity as measured
    overshoots it at weight 1); table lamps with shades that block sideways light.
- **Corrections:** the flashlight intensity with the floor's cosine at 55° incidence (clipping needs I ≈ 710, not 407);
  re-pick t074's wall height (the pick's foot sits on the back wall) and drop the "2.7 m warehouse partitions" note;
  UI font sizes from ink heights (about 14 / 17 / 28 px); doors and windows exempt from the furniture fill rule; the
  density claim for `keepFullHeight` partitions at the bottom rows (337 px/m at 3.3 m) and the matching §3 row; the
  stale shade colour in `tools/targets/out/rigs.json`; clothing and skin value bands (from P0-09: trousers sRGB 52,
  shoes 36, belt 38, socks 34, skin mean (196, 150, 126), shirt 212).

## Exclusive paths
`tools/targets/`, `assets/targets/`, `docs/ART.md`, `docs/art/` except the lane folders.

## Acceptance
- Each item above changed in ART.md or its outputs, every new number traced to an output or labelled decided; the
  acceptance scripts of P0-04 still pass.

## Deliverables
The changes on `wp/P0-04b` (cut from master after the P0-04 merge), the JSON report with a per-item table.
