# Character pipeline (WP-P0-09)

Headless, reproducible: pinned CC0 / free sources in, one skinned, animated, compressed glTF per character out.

```sh
python3 tools/blender/characters/build.py                 # everything for the Wage Slave (about 4 minutes on an M4 Max)
python3 tools/blender/characters/build.py --only render   # one stage, or a comma-separated list
python3 tools/blender/characters/build.py --offline       # never download (assets/cache must be complete)
node tools/blender/characters/render-three.mjs            # only the three.js game views
```

Needs Blender 5.2 (`$BLENDER`, default `/Applications/Blender.app/Contents/MacOS/Blender`), Python 3, Node 24 + npm,
and ffmpeg for the renders. KTX-Software 4.4.2 is taken from `tools/bin/ktx` (WP-P0-05's `install-ktx.sh`) when it is
there, otherwise the same pinned, notarized release is unpacked into `.work/ktx`. The npm dependencies (glTF-Transform
4.5.0, meshoptimizer 1.2.0, three 0.186.0, Playwright 1.63 for the three.js renders) come from the repository's
`node_modules`. Nothing is written outside this folder, `assets/cache/`, `assets/characters/` and
`docs/art/characters/`; MPFB runs in its own Blender profile (`BLENDER_USER_RESOURCES=.work/blender_user`), never in
the user's Blender.

## Stages

| Stage | Script | Output |
| --- | --- | --- |
| setup | `fetch.py` (`build.py`) | every source this pipeline locked (`assets/sources.lock.json` once merged, else `assets/lock/WP-P0-09.json`) in `assets/cache/`, SHA-256 checked (archives and the members read); MPFB 2.0.17 and the asset packs unpacked into `.work/blender_user`; Blender 5.2.2 and KTX-Software 4.4.2 checked |
| character | `character.py` + `wage.json` | `.work/wage/character.blend`, baked atlases in `.work/wage/bake/` |
| animate | `animate.py` + `cmu.py` + `clips.json` | `.work/wage/animated.blend`, `.work/wage/clips_report.json` |
| export | `export.py` | `.work/wage/wage_raw.glb` (PNG textures, uncompressed) |
| compress | `compress.mjs` | `assets/characters/wage/wage.glb`, `.work/wage/stats.json` |
| manifest | `build.py` | `assets/characters/manifest.json` (`src/contracts/assets.js` schema, with the `character` rebuild recipe the asset-lock check re-bakes in its sandbox and the glb's SHA-256 in `digests`) |
| render | `render.py`, `render-three.mjs` + `three/view.html` | `docs/art/characters/*` |

**character.** MPFB builds the human from its CC0 data (base mesh hm08, phenotype macros, `game_engine` rig with its
weights) and the CC0 MakeHuman asset packs (clothes fitted to the body, eyes, brows, lashes, hair). Body faces under
the clothes are deleted. The outfit is the source's: `male_casualsuit02` (a long-sleeve crew top recoloured as the
charcoal hoodie, and the pack's own faded mid-blue jeans), `shoes06` recoloured dark with white soles, and a hood
(down, lying on the upper back and shoulders, with a rolled lip at the nape) and two drawstrings generated on the top
(ray cast onto its outer surface along a smoothed neckline, skinned from it with its upper band bound partly to
`neck_01` and `head` so it stays tucked under the skull when the trunk leans, UVs at the fabric scan's physical size). Garment regions come from
source-UV boxes in the recipe (top panels and sleeves vs jeans; the shoe's tread, lining and sock) and a height band
(the sole's sidewall).

The rest pose is lowered before binding: the arms go from MPFB's A-pose (about 49° below the horizontal) to about
67°, with a corrective smooth over the shoulders, and that pose becomes the rest pose, so hanging and swinging arms
deform the top far less than an A-pose bind.

Each part is decimated to its budget (hands, face and the rest of the head separately), gets an atlas UV with every
island at the recipe's texel density (512 px/m, ART.md §3 hero class) and is baked in Cycles into three atlases:

| Material | Atlas | Parts | Alpha |
| --- | --- | --- | --- |
| `wage_skin` | 512² | head, neck, hands, eyes | opaque |
| `wage_cloth` | 1024² | top, hood, drawstrings, jeans, shoes | opaque, double-sided (cuffs and hems show their inside) |
| `wage_hair` | 256² | hair, eyebrows, eyelashes | MASK 0.35, double-sided |

Maps per atlas: base color (sRGB), tangent-space normal (OpenGL), ORM (R occlusion = source AO times baked geometric
AO, G roughness, B metalness 0). Albedo calibration: a region-id bake pass records which region every texel belongs to
(and how much it counts: the scalp under the hair is left out of the skin), then each region's mean linear luminance
is scaled to its recipe target (`wage.json` `materials.*.albedo`, ART.md §7.2) and every texel is clamped to ART.md's
hard limits (linear 0.013-0.90), keeping its hue. The scalp takes the hair's calibrated colour. `character_summary.json`
and the manifest record each region's albedo before and after, its percentiles and mean sRGB.

**animate.** `cmu.py` reads the original Acclaim ASF/AMC files (forward kinematics, and a BVH writer:
`python cmu.py subject.asf trial.amc out.bvh`). Retargeting is rotation-based in world space: each target bone takes
its CMU bone's world rotation away from the CMU T-pose, composed with the rotation that aligns the two rest directions;
the pelvis follows the CMU root scaled by the leg-length ratio. Corrections: the clavicles follow 25 % of the upper
arm's swing; fingers curl 30/40/20° and are drawn together; neck and head can be turned to the chest's facing, their
yaw swings damped and the face lifted (`clips.json` `head`).

Loops: the loop is searched inside the clip's window (end pose and pose velocity against the start, and a loop point
where every bone accelerates at most about its typical rate); for locomotion the loop point must fall in single support
(walk) or flight (run). The loop is closed per bone in world space: the pose mismatch at the wrap is spread over the
whole loop and the angular-velocity mismatch over its last `closeSec` (0.25 s; the whole loop for the run), so pose and
velocity are continuous across the wrap (a mirrored-step loop, `mirror`, is available for very short clips). Root
motion: the clip is re-expressed in the moving frame of the pelvis path, facing -Y, so it plays in place. Then, on the
closed loop, the feet are locked: each shoe sole's heel, ball, toe and ball-edge points (vertices of the shipped mesh)
are pinned where they were planted while in contact, exactly, with smoothstep fades; every sole vertex keeps the foot
above the floor; the pelvis is denoised first, the legs are re-solved with two-bone IK, smoothed over time and solved
once more; finally the soles are settled with exact skinning, so in contact each foot's lowest sole vertex rests on
the floor (0.8-1.8 mm above it, for the dip between keys) and none is ever below it. A standing clip (`planted`, `knees`, `stanceWidth`,
`levelPelvis`) keeps both feet flat and still, hip width apart and under the hips, raises the pelvis until the knees
are nearly straight and levels part of the pelvis roll. The run keeps 30 % of the capture's shoulder shrug
(`clavicleKeep`) and soft-limits the upper arms' backswing behind the vertical (`armBackLimitDeg`): a leaning run
otherwise shows the far shoulder and upper arm behind the head at the game camera's pitch. Clips are keyed at 60 fps. The toe joint is lightly smoothed (the capture's toe channels
are noisy). The speed published for a clip is the speed at which planted soles travel backward in the in-place clip.
`clips_report.json` records the loop, sole slide before and after locking, the worst bone's angular acceleration
across the wrap against its own typical value, the stance (knees, ankle spacing), trunk lean, head angles and stride.

Action clips (`clips.json` `kind`, `use`). The standing, bent-over and seated loops (`work`, `use`, `eat`, `sit`,
`attack`) go through the same loop search, closure and planted-feet lock as the idle (`planted`, `pin`); `speed`
plays a capture faster (the attack's chop, 2.4x), `seatHeightM` moves a seated clip's pelvis until the underside of
the buttocks is at the game's seat height (the planted feet stay on the floor, the leg IK opens the knees), `yawFrom`
`mix` faces a seated subject between hips and chest. `kind: "oneShot"` (`pickup`, `hit`, `death`) keeps the capture's
window as it is, played once (the game holds the last frame); `pin` or `pinStart` (a fall keeps its travel away from
where it started); planted one-shots are foot-locked like the loops. `kind: "hold"` (`sleep`) holds the window's mean
pose and adds a breathing cycle (a sine on `spine_02` / `spine_03`) over `holdSec`, so it loops exactly. `flinch`
layers a procedural hit reaction on a capture (the hit: the idle subject's stand, spine back, head forward, forearms
up, pelvis back and down on a fast-rise, smooth-settle envelope). `floor: "body"` puts the lowest point of the skinned
body (every 4th vertex, all influences) on the floor instead of the soles (lying clips; a fall blends from the soles at
its start to the body at its end). Lying clips face away from where the head points (`yawFrom: "lying"`), so they lie
on the back along glTF Z, head toward -Z, face up (`faceUp` rolls a turned head toward the ceiling). Every clip's
report has `pose`: the pelvis height range, the lowest body point, the seat height for a seated clip, and for its first
and last frames whether the body lies, where the head and face point and where the pelvis and head are (glTF axes).

| Clip | Kind | CMU source | What it is |
| --- | --- | --- | --- |
| `work` | loop | 79_26 planting a tree | bent over, both hands working at waist-to-knee height (repairing, rummaging, farming) |
| `use` | loop | 79_14 making dough | standing, hands at counter height (cooking, crafting, washing) |
| `eat` | loop | 79_15 eating a sandwich | standing, both hands to the mouth |
| `sit` | loop | 13_04 sit on stepstool | seated idle, hands in the lap, seat at 0.44 m |
| `attack` | loop | 79_01 chopping wood (2.4x) | two-handed overhead strike forward and down (zombies at doors and at the survivor) |
| `sleep` | hold | 140_08 lying on the back | lying on the back, breathing |
| `pickup` | one-shot | 115_06 picking a box up | knees bend, both hands to the floor, back up |
| `hit` | one-shot | 82_08 stand + procedural flinch | a backward flinch, back to the stance |
| `death` | one-shot | 90_18 rug-pull fall | falls backward, ends lying still on the back |

**compress.** KTX2 per texture role (normal: UASTC 4 + RDO 0.4 + Zstd 18 and ORM: ETC1S, WP-P0-05's presets; skin
and hair base color: UASTC 3 + RDO + Zstd; cloth base color: ETC1S), mipmaps, `--threads 8` for byte-identical output;
then `EXT_meshopt_compression` (with `KHR_mesh_quantization`) over geometry and clips. `KHR_texture_basisu` is
required (the textures exist only as KTX2). Channels that never change (the finger curl, most twist axes) are folded
into the joints' rest transforms. Materials have `metallicFactor` 0. Each clip gets `extras: { loop, source,
rootMotion: { mode, forward, speedMps, distanceM, ... }, stride, soleSlideMps, loopContinuity }`; the root gets
`extras.locomotion` (below).

Determinism (the rebuild contract): Cycles bakes at seed 0 with fixed samples (16 per pass, 1 for the id pass, 128
for occlusion), no other randomness; KTX encoding on 8 threads; MPFB, decimation and packing are deterministic.

**render.** `render.py`: look-development views in Cycles (turntable, close-up). `render-three.mjs`: the shipped glb
in three.js in headless Chromium (Playwright; the page is `three/view.html`, served from the repository root on
127.0.0.1:5205), GLTFLoader + meshopt decoder + KTX2Loader, AgX at exposure 1.0, the game camera from
`src/contracts/look.js` at 60° and 50°, the ART.md day-interior and dusk rigs with a 0.18 grey card that must read its
ART.md code ±5; stills, the board beside the source's frames, walk and run strips and a motion capture at 50°.

## Using the character (three.js)

- One scene: armature node `wage_rig` -> 53 joints (`Root`, `pelvis`, `spine_01-03`, `neck_01`, `head`, `clavicle_*`,
  `upperarm_*`, `lowerarm_*`, `hand_*`, fingers, `thigh_*`, `calf_*`, `foot_*`, `ball_*`) and the skinned mesh `wage`
  with three primitives. Metres, +Y up, the character faces +Z, feet on y = 0.
- Loaders: `GLTFLoader` with `setMeshoptDecoder` (three's `meshopt_decoder.module.js`) and `setKTX2Loader` (required).
- Hair cards: `material.alphaToCoverage = true` with an MSAA target (the manifest's `params.renderer`).
- Clips `idle`, `walk` and `run` loop (`THREE.LoopRepeat`) and play in place; `clip.userData` carries the glTF extras.
- Action clips: `work`, `use`, `eat`, `sit`, `attack` and `sleep` loop (`THREE.LoopRepeat`); `pickup`, `hit` and
  `death` play once (`THREE.LoopOnce`, `clampWhenFinished = true`). All start with the pelvis over the origin facing
  +Z and none needs root motion. `sit`: the underside of the buttocks is `pose.seatHeightM` (0.44 m) above y = 0 and
  the feet are on y = 0 ahead of it; put the origin on the floor under the middle of the seat. `sleep`: lying on the
  back along Z, head toward -Z, face up, the lowest body point on y = 0 and the pelvis over the origin; lay it on
  the mattress top (origin at mattress height, head toward the pillow). `death`: falls backward and ends the same
  way, lying on the back along Z with the head toward -Z about 0.6 m behind where the character stood.
  `clip.userData.pose` has these facts per clip (glTF axes).
- Locomotion (`gltf.parser.json.extras.locomotion`, also `meta.locomotion` in the manifest): the sim moves the survivor
  at 5 m/s at speed 1 (x0.7 encumbered, x1.25 with caffeine). Play `run` with
  `timeScale = clamp(simSpeed / run.rootMotion.speedMps, 0.75, 1.35)` and crossfade 0.2 s to and from `idle`.

## Adding clips or characters

- Clips: add an entry to `clips.json` (any CMU subject/trial; `fps` if the trial is not 120 fps, `window` in seconds,
  `loop` bounds, `blendSec`, `splice`, `rootMotion` `extract` or `pin`, `head`), add the trial to `SOURCES` in
  `fetch.py`, then `python3 fetch.py --lock` and `build.py`.
- Characters: copy `wage.json` (MPFB phenotype and assets, rest pose, garment regions, hood, budgets, atlases,
  materials) and run `build.py --recipe <file>`. The recipe's file name is the character id (the manifest's rebuild
  recipe reads `tools/blender/characters/{name}.json`).

## The characters

Every character shares the `game_engine` skeleton and the clip set of `clips.json` (the animate stage retargets
the same captures onto each body, so the clips, their loop and foot-lock rules and the renderer's poses carry over).

| Recipe | Character | Look | Budget notes |
| --- | --- | --- | --- |
| `wage.json` | the Wage Slave | charcoal hoodie (hood and drawstrings generated), jeans, dark sneakers | the reference |
| `college.json` | the College Student (`student`) | female, 1.63 m, dusty-rose hoodie with hood and strings, jeans, pale sneakers, ponytail, generated navy backpack | hair atlas 512 (the ponytail's cards) |
| `manager.json` | the Warehouse Manager (`warehouse`) | heavier, late forties, navy work jacket under an orange hi-vis vest with two silver bands, khaki work trousers, brown work shoes, greying hair | |
| `zombie_a.json` | zombie, office worker | grey-green mottled skin, pale eyes, striped shirt and grey trousers, black shoes | |
| `zombie_b.json` | zombie, labourer | blue overalls over a white T-shirt, worn dark shoes | |
| `zombie_big.json` | the big zombie | the labourer's build (a heavier body left the walk's planted soles sliding), drawn at 1.18x by the renderer; bloodied T-shirt and jeans, olive sneakers | skin atlas 1024 |

Recipe options beyond the Wage Slave's (all in `character.py`):

- `garments.<role>.palette` ({region: sRGB}): regions by the source texture's median colour under each face, instead of
  UV `boxes`; `garments.<role>.rules` ([{from, to, bones | absXAbove | zBelow | zAbove}]): move faces between regions
  by their skin weights (`bones`: name prefixes and a `share`) or position (heights as fractions of the head joint's
  height): the manager's jacket body becomes the vest, its sleeves stay the jacket.
- `generated`: the parts generated on the top are optional (`hood`, `strings`, `backpack`, `straps`). `backpack`: a
  superellipse pillow over the top's back surface (rigidly bound per `bind`), and two straps laid over the shoulders
  onto the top and the hood (`width`, `height`, `depth`, `topBelowNeck`, `strap*`).
- `materials.<region>.stripes` ({hue, ratio, z: [[lo, hi]]}): horizontal retro-reflective bands at fixed heights.
- `materials.<region>.grime` ({dirt, dirtScale, dirtDarken, dirtHue, blood, bloodScale, bloodThreshold, tears,
  tearScale}): dirt, dried blood and ragged dark tears from deterministic 3D noise over the rest pose, baked into the
  atlas (the zombies). `materials.skin.tint` / `saturation` / `grime`: the dead's grey-green, mottled skin.
- `clips` ({clip: {key: value}}): per-character overrides of `clips.json`, merged into the clip's spec by
  `animate.py` (build.py passes the recipe). The new characters take the Wage Slave's loops (`loopAt`: [start, length]
  in the capture's seconds, instead of the loop search, whose splice rules and closure were tuned on the Wage Slave;
  another body's search picks another stretch), `swingClearM` (a swinging foot clears the floor by that much, faded
  with the lock weight), `floorMarginM` / `contactMaxM` (the settle's floor margin and contact band, default 0.8 /
  1.8 mm), `lockBlendSec` and, for a seated clip, `seatBones` (the seat is measured on points skinned mostly to those
  bones: not the hands in the lap, not a coat's hem).
- `soleFromShoes`: the soles' contact points come from the shoes' vertices only (a 'shoe' mesh attribute);
  `bodyPointStep` (default 4): every n-th vertex is a floor point of the body (lying and falling clips);
  `collarFollow` ({followNeck, followHead, followBand}): the top's collar follows the neck like the hood's lip;
  `budgets.triangles.body.handsBeyondX` (default 0.3 m): where the hands' components start (a smaller body).
- When no stance is found at the pelvis path's speed (a body whose stride differs from it by more than the stance
  speed tolerance), `animate.py` bootstraps the travel speed from each foot's lowest sole point near the floor and
  searches the contacts again (the Wage Slave's clips find their stances at the first speed and are unaffected).
- Every character wears the Wage Slave's sneaker mesh (`shoes06`, recoloured): the foot lock and its tests were tuned
  on that sole; the boots and dress shoes of the pack left a foot without planted contacts in the run.
- `atlases.<group>.size` may differ per character when the parts do not fit at 512 px/m (the calibration and the
  texel-density check stay the same).
