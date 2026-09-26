# Architect hook patches

Changes to files outside the architect's paths, for the integrator (`git apply --3way <patch>`). Patches are removed
once master has them (WP-P0-14b's `view-hpratio.patch` and `gate-min-tests.patch` are applied or superseded).

| patch | from | apply | file(s) | change |
| --- | --- | --- | --- | --- |
| `view-scene-facts.patch` | WP-P0-14c | with the `wp/P0-14c` merge | `src/ui/view.js`, `src/ui/shopPanel.js`, `src/ui/explorePanel.js` | the view facts of src/contracts/view.js, from sim state: `home` = `state.home.id`, `powered` = `state.power.homePowered`, `lightsPowered` = `state.power.lightsPowered`, `lightsSwitchedOff` = `state.power.lightsOff`; the survivor's `moving` / `heading` / `action` from `state.actions.current` (`playerMotion`, also in the shop and site views); a zombie's `moving` / `heading` from its step (`cx, cy -> nx, ny` while `mt` is set) |
| `furniture-typed-params.patch` | WP-P0-14b | at the WP-P0-10 merge, after its squash (made against `wp/P0-10` @ fa7402b) | `tools/blender/furniture/catalog.json`, `tools/blender/furniture/finish.mjs`, `assets/furniture/manifest.json` | `params.states` as the ordered rule list (`broken`, `hpRatio ≤ 0.5`, `always`); `params.nodes` → `params.pivots.leaf = { node: 'leaf_hinge', axis: '-y', openDeg: 90 }`; `finish.mjs` writes `pivots` |

After applying: `node --test tests/*.test.js` and `npm run gate -- --quick` (its contracts check runs `checkView` on
the live views).
