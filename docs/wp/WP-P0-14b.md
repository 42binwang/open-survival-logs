# WP-P0-14b — Interface pass 2 (before the tech spike)

**Role:** architect. **Phase:** P0. **Depends on:** WP-P0-10 (furniture manifest; read it on `wp/P0-10` until it
merges), WP-P0-11 (renderer stats request). Must land before WP-P0-08 dispatches, since the spike consumes all of it.

## Scope
1. **Model placement and dressing fields** in `src/contracts/assets.js` (typed, validated by `checkAssetManifest`,
   with fixtures), now documented only in the furniture manifest's `params`:
   - `anchor` (floor | wall-face | wall-center), front along +Z, `footprint` in tiles, and a wall `opening` for doors
     and windows (the shell lane cuts openings from it);
   - `files.normal` and `files.occlusion` on TEXCOORD_1 with TANGENT (occlusion R = aoMap, G = curvature for the
     library's wear convention, B = cavity);
   - `states`: view state to variant (broken ← `ViewFurniture.broken` or `data.breached`; damaged ← hp / maxHp ≤ 0.5);
   - node pivots (the door's `leaf_hinge`);
   - optional `lods` on `AssetVariant`.
2. **`Renderer.stats(): { drawCalls, triangles, gpuBytes }`** in `src/contracts/render.js`, optional on the
   interface but required of the three.js renderer (WP-P0-11's `render-stats.patch`, unless the integrator applied
   it at P0-11's merge), so the budgets check can measure draw calls and GPU memory. Define how `gpuBytes` is
   computed (textures by format, mips and dimensions, plus buffers and render targets) rather than trusting a
   self-report, with a fixture scene whose expected bytes the test computes independently.
3. **A view-model health ratio for damage states:** the sim judges openings by `hp / effectiveMaxHp(f)`, which
   includes reinforcement, so the view model exposes the ratio (for example `hpRatio`) and the manifests' `states`
   rules read it; the renderer never re-derives sim numbers (from P0-10's review).
4. **The audio manifest's params** (bus, spatial, loop, space, tags, pitchCents, gainDb, noRepeat, maxVoices,
   cooldown, barSeconds, loopEndSample) typed as the runtime audio convention (from P0-06).
5. **Housekeeping in P0-14's own files:** remove the applied patches in `tools/asset-lock/hooks/`; make
   `tools/asset-lock/render_mesh.py` strip `KHR_texture_basisu` from `extensionsRequired` before Blender imports a
   glb (P0-09 marks it required, since its textures have no fallback), unless P0-09's patch already landed it.
6. `docs/ARCHITECTURE.md` "Assets": document the above.

## Exclusive paths
`src/contracts/assets.js`, `src/contracts/render.js` and `src/contracts/view.js` (this pass only), the contract tests
(extend, never weaken), `tools/asset-lock/`, the asset and contract sections of `docs/ARCHITECTURE.md`. The view-model
field itself is added in `src/ui/view.js` through a hook patch. Lane manifests that need to adopt a renamed field are
hook requests (patches) for the integrator.

## Acceptance
- Every manifest on master still passes `checkAssetManifest`; the furniture manifest passes with the typed fields,
  and fixtures show each new field failing when malformed.
- The existing suite, typecheck and lint stay green.

## Deliverables
The changes on `wp/P0-14b`, hook patches for any lane manifest, the JSON report.
