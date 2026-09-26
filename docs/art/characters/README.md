# Character renders (WP-P0-09)

Renders of `assets/characters/wage/wage.glb` (the Wage Slave). Regenerate with
`python3 tools/blender/characters/build.py --only render` (both sets) or `node tools/blender/characters/render-three.mjs`
(the three.js set).

## The game views (three.js, the shipped file)

`tools/blender/characters/render-three.mjs` loads the shipped glb in headless Chromium through
`tools/blender/characters/three/view.html`: three r186, GLTFLoader with the meshopt decoder and KTX2Loader (the KTX2
textures as shipped), AgX tone mapping at exposure 1.0, the game camera from `src/contracts/look.js` (pitch 40°, the
camera S30°E of its target, 10.47 m away) at the zoomed-out 60° and zoomed-in 50° vertical FOV. The hair cards use
`alphaToCoverage` with MSAA (the manifest's renderer recommendation).

Rigs (ART.md §4.2-4.4). Indoors the sun's direct term does not reach (the source shows no sun patches in rooms), and
characters take probe light; here a HemisphereLight whose intensity is the rig's horizontal E, sky colour the key's
indirect and sky mix, ground colour the floor bounce (floor albedo 0.34, t069 wood).

| Rig | E (ART.md) | 0.18 card (ART.md) | card read | intensity after calibration |
| --- | --- | --- | --- | --- |
| day interior | 0.419 | 43 | 43 (42 at the nominal E) | 0.437 (x1.043) |
| dusk interior, lamps on | 0.237 | 26 | 26.3 (25 at the nominal E) | 0.252 (x1.063) |

The card lies on the floor beside the survivors in every still; the rig's intensity is scaled until it reads its code
(the exposure never changes). The dusk set's colour indoors is not in ART.md: the exterior's 86.9 % sun share at
2600 K turns everything orange where the source's dusk frame (ss_04) is neutral, so it is taken as 40 % sun indirect,
60 % sky, plus the 2700 K lamps.

| File | What it shows |
| --- | --- |
| `wage_three_day_60.png`, `wage_three_day_50.png` | full 1920×1080 frames, day interior, at 60° and 50°: `idle` facing the camera three-quarter (left), `walk` going away three-quarter like the source's frames (right), the grey card |
| `wage_three_dusk_60.png`, `wage_three_dusk_50.png` | the same under the dusk rig |
| `wage_board.png` | **side by side**: the source's Wage Slave (t069 day interior, ss_04 dusk, t035 planning) above these renders at the same pixel scale (2× nearest neighbour), with the on-screen samples |
| `wage_walk_strip.png` | one `walk` cycle (9 frames) at 50°, the camera still, root motion applied (1 m floor tiles show the planted feet) |
| `wage_run_strip.png` | one `run` cycle (8 frames), the same way |
| `wage_motion_50.mp4` | two `walk` cycles, three `run` cycles, then `idle`, at 50°, the camera following as in the game (960×540: the middle of the 1080p frame at its pixel scale) |
| `wage_three_measure.json` | every number: card readings and iterations, rig colours and intensities, the on-screen samples with their pixel positions, character heights |

On screen, day interior, display sRGB (luminance code), 60° / 50°:

| Sample | Render | Source t069 (and the reviewer's range) |
| --- | --- | --- |
| hoodie, front / back | `#262624` 37.5 / `#2a2c2f` 44 | `#3a3b3a` 58 (45-50) |
| jeans, front / back | 44 / 44, blue-grey | `#333638` 54 (40-80 blue-grey) |
| hair, front / back | `#1a1d21` 28.7 / 25.2: 0.77x / 0.57x the hoodie | `#333331` 51: 0.88x the hoodie |
| face | 52-54 | `#644834` (t035 only: a brighter frame, E 0.699) |
| floor | 66 | 57-70 |

Heights: 147 px at 60°, 182 px at 50° (the idle now stands straight).

## Look development (Blender, Cycles)

| File | What it shows |
| --- | --- |
| `wage_turntable.jpg` | the `idle` pose from eight directions, 45° apart; studio key / fill / rim |
| `wage_closeup.jpg` | head and shoulders at 85 mm: skin, hair, warm dark-brown eyebrows, eyes, the hood at the nape, the drawstrings, the shoulder line of the lowered rest pose |

The studio light is brighter than any game rig: the garments' albedos are mid-range (ART.md §7.2: hoodie 0.281,
jeans 0.246) and read charcoal and dark blue-grey only under the interior light, as the game views show.

## At game zoom

- **Outfit.** Charcoal hoodie with the hood down at the nape (it reads from behind as a darker collar band) and two
  drawstrings, faded mid-blue jeans, dark sneakers with white soles, short dark hair (darker than the hoodie, as in
  every source frame).
- **Idle.** Stands relaxed: knees 3.6-9.2° (left) and 3.6-6.5° (right) through the loop, ankles 21.3 cm apart (hips
  21.3 cm), both feet flat and planted; the head's yaw swings are damped to 35 % about the chest's facing.
- **Run.** CMU 16_46: 4.42 m/s, 0.667 s cycle, 2.95 m stride (180 steps/min), trunk leaning 15° forward. At the sim's
  5 m/s it plays at 1.13x (no clamp; 204 steps/min, accepted); encumbered (3.5 m/s) at 0.79x; with caffeine (6.25 m/s)
  it clamps at 1.35x. Nothing shows behind the head: the shoulders keep 30 % of the capture's shrug and the upper
  arms swing at most about 20° behind the vertical (the far shoulder and upper arm read as a "ponytail" behind the
  head at 50° before); the hood's upper band is bound partly to the neck and head, its lip only 1.2 cm tall.
- **Loops.** Closed by a correction spread over the loop (pose) and its last 0.25 s (velocity; the whole loop for the
  run), with the loop point where every bone is calm. Across the wrap each bone's angular acceleration is at most
  1.37x (idle), 1.67x (walk) and 1.56x (run) its own typical value (30 Hz; clips are keyed at 60 fps).
- **Soles.** Every foot comes down onto the floor in contact and no sole vertex goes below it: the closest sole vertex
  of each foot is 0.4 / 0.7 mm (walk), 0.7 / 0.1 mm (run), 1.0 / 1.5 mm (idle) above it; a planted sole vertex slides
  at most 0.6 cm over a run step, 1.4 cm over a walk step.

## Texel density (how it is measured)

`wage.glb` uses `KHR_mesh_quantization`: its POSITION values are a normalised grid, and on a skinned mesh the scale
back to metres lives in the bind transform (every joint's world matrix times its inverse bind matrix scales by 0.8661).
Measured in the bind pose in metres, the atlases hold skin 512.1, cloth 511.5 (islands 492-533) and hair 488.9 px/m
(scalp; the strand cards, brows and lashes together 506.6), ART.md's hero class 512 ±10 %. Reading the quantised
POSITION values as metres gives 0.8661 of that (443 / 443 / 423). The hair's strand cards (21 strips about 1.2 cm
wide), brows and lashes are narrower than 8 texels at 512 px/m by design: 15.9 % of the hair material.

## Known limitations

- The run's cadence at 5 m/s is 204 steps/min (the acceptance asks for at most 190, which needs a 3.16 m stride): no
  CMU run found loops cleanly at a longer stride on this character (the candidates and their numbers are in the WP
  report).
- Hood and drawstrings are rigid on the top: no secondary motion.
