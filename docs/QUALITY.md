# QUALITY.md: how Survival Log is judged (WP-P0-11)

The upgrade is judged two ways, and a phase signs off only when both agree:

- **Reviewers** score 12 axes from 1 to 5 against the descriptors below, with evidence attached, and compare the
  game side by side with the source.
- **Tools** check what can be measured, with no reviewer in the loop:
  - art metrics on every shipped asset;
  - visual regression against approved baselines;
  - performance and size budgets;
  - balance bots on the real sim;
  - the bug and playtest ledgers.

The numbers in this file are thresholds. After P0 they change only to fix a demonstrated bug (a reviewer approves
the fix), and they never loosen ("Thresholds" below). Everything here is what P1–P5 are judged by.

---

## 1. The rubric

Twelve axes, each scored **1–5 in whole points**. Each descriptor describes what the reviewer sees, in two parts:

- **Requires**: every point of it must hold. Requirements **cumulate**: a score needs its own requirements and those
  of every score below it.
- ***May still show***: what a game at that score is allowed to show. It does not cumulate: the next score up
  removes it.

When in doubt, take the lower score. Words the descriptors use are pinned:

- **most** = at least 75 % (of the scenes, pairs, families or screens counted);
- **every function the source offers** (UI) and **every event the source shows as an effect** (VFX) = the rows of
  `docs/FEATURES.md` with a UI surface, and those whose source behaviour shows an effect, listed by id in the review's
  evidence (`ui-rows.md`, `vfx-rows.md`). The list is fixed at the P1 signoff and only grows;
- **no visible tiling** = the art-metrics `tile-repetition` check passes on every tiled material (block deviation
  ≤ 12 % at 4 × 4, ≤ 20 % at 8 × 8, ≤ 25 % at 16 × 16, §3).

- **Screens.** Evidence captured at 1920 × 1080 with `?render=3d` (from P1; `?render=2d` before). Use the shot
  harness (`tools/visual/`: fixed clock, seed) and name the shot. Screenshots from the playtest runs are also fine.
- **Where the evidence goes.** In `docs/quality/<phase>/<axis>/`, committed with the score.

### 1.1 Match to approved targets (`match`)

The in-engine look against `docs/ART.md` and the approved targets in `assets/targets/source/`: camera, scale,
palette, value and light, per home and exploration site.

| score | descriptor |
|---|---|
| 1 | Unrelated to the targets: a different camera, scale or palette. A viewer would not place it as Survival Log. |
| 2 | Recognisably the same game, but the camera (FOV, pitch, yaw), scale or overall value is visibly off in most scenes. |
| 3 | Camera and scale match (`src/contracts/look.js`, ART.md §1–§2). Palette and value are within ART.md §7 bands in most scenes. *May still show:* one or more homes or sites that read as placeholder or clearly different in light or colour. |
| 4 | Every due side-by-side pair (§2) passes every point of its `judge` list and every `requires` descriptor, and scores ≥ 4. Every unpaired site meets ART.md §1–§7 on its own, shown by its unpaired evidence (§2). The art director can point to no scene that breaks the standard. *May still show:* differences of detail, not of look. |
| 5 | Side by side, a viewer cannot pick the source in most pairs without the HUD. Remaining differences are improvements the art director approved in ART.md. |

Evidence:

- the side-by-side sheets for every pair (§2);
- the ART.md §1.4 framing numbers re-measured on one in-engine frame per home (FOV, pitch and yaw from the renders:
  `tools/targets/camera.py` on the capture);
- the ids of the art-metrics reports of that commit.

### 1.2 Lighting (`lighting`)

The rigs of ART.md §4:

- day, dawn, dusk, night with lamps, blackout, storm, cold wave;
- the bake and runtime contract (§4.4);
- lamps and the flashlight (§4.5);
- AgX and the grade (§5).

| score | descriptor |
|---|---|
| 1 | Flat or unlit: no key light, no lightmaps, or exposure far off (clipped or crushed floors). |
| 2 | Lit, but one or more of: rigs missing, day and night hard to tell apart, light leaking through walls, sun patches inside rooms at 11:50 (ART.md §4.4 forbids them), obvious shadow acne or peter-panning. |
| 3 | Every rig exists and reads as its time of day. The 0.18 grey card lands within ±5 codes of ART.md §4.2/§4.3 on the day and night rigs. *May still show:* pops at transitions, hard lamp pools. |
| 4 | All rigs within ±5 codes on the grey card, with the lamp calibration met (t033 wall 46.5 ± 5 codes). Transitions cross-fade over 45 game minutes without pops, and no double-counted sun. Bloom only on emitters and the flashlight. The emitter layer matches `#daa850`. |
| 5 | As 4, and a lighting artist would call the rigs finished: contact darkening under every movable, soft lamp pools matching t069 / t033, storms and the cold wave convincing in motion. |

Evidence:

- one capture per rig of the same framing (7 images);
- the grey-card readings per rig (a table with the codes);
- a 10 s capture of the dusk → night transition;
- the lamp calibration reading.

### 1.3 Materials (`materials`)

The PBR materials of the library and of every model: albedo and roughness per ART.md §7.2, texel density per §3,
tiling, per-object variation, wear and dirt (the library conventions).

| score | descriptor |
|---|---|
| 1 | Flat colours or unmapped surfaces, or textures stretched and misaligned. |
| 2 | Textured, but art-metrics fails on albedo, roughness or texel density for many families; visible tiling grids; every instance identical. |
| 3 | Art-metrics passes on most library families. Materials read as their family at game zoom. *May still show:* repetition, flat roughness or missing wear on large surfaces. |
| 4 | Art-metrics passes on every material and every dressed model. No visible tiling. Per-object variation, curvature wear and gravity dirt visible and restrained. Metals, glass and fabric read correctly under day and night rigs. |
| 5 | At the closest zoom (50°), surfaces hold up as scanned; a materials artist would sign every family off. |

Evidence:

- `node tools/art-metrics.mjs --json` output of that commit (every check green, or the failing ids named);
- one close (50°) and one wide (60°) capture per home of floors, walls and three furniture pieces;
- the library contact sheet (`tools/materials/contact_sheet.py`).

### 1.4 Models (`models`)

Furniture, props, home shells and exploration sites:

- silhouettes, bevels and scale per ART.md §2;
- triangle budgets and LODs;
- damage states;
- the tile-fill rule.

| score | descriptor |
|---|---|
| 1 | Boxes, missing pieces, or pieces that do not fit their tiles. |
| 2 | Recognisable pieces, but low detail: hard edges without bevels, wrong scale against the 1.75 m survivor, pieces crossing into tiles they do not occupy. |
| 3 | Every visible piece modelled at the right scale (ART.md §2 table). Art-metrics triangle budgets hold. *May still show:* generic pieces, pieces without damage states. |
| 4 | Every config piece that can be shown has its own model or a family model plus a variant (the coverage tool's furniture render check at 100 %). Bevels and weighted normals catch light. Damage states for doors, windows and breakables. LODs where the budgets ask. No floating, intersecting or z-fighting geometry. |
| 5 | Pieces carry the wear of use and the story of the home; a modeller would find nothing generic at game zoom. |

Evidence:

- the coverage report's furniture render row;
- the art-metrics triangle-budget and LOD results;
- turntables of 10 pieces chosen by the reviewer (`docs/art/furniture/`);
- one capture per home floor.

### 1.5 Characters and animation (`characters`)

The three survivors, zombies and NPCs: meshes, skin and cloth, the clips the sim's actions need, foot contact, turns
and transitions.

| score | descriptor |
|---|---|
| 1 | A placeholder capsule or T-pose, or a sliding survivor with no clip. |
| 2 | A rigged character with idle and walk only; feet slide; actions play no clip; zombies static. |
| 3 | Idle, walk and run with no visible foot sliding at the sim's speeds (the playback-rate policy of WP-P0-08), and the most frequent actions (sleep, eat, repair, search) have clips. Art-metrics clip, influence and triangle checks pass. *May still show:* actions that pop between clips. |
| 4 | Every action kind the sim queues has a clip or a documented shared one. Transitions blend in ≤ 0.25 s. Zombies walk, attack, stagger and die. All three survivors and every visible NPC on the same pipeline. Hero texel density per ART.md §3. |
| 5 | Performances carry character (weight, fatigue at low stamina, fear during a siege); an animator would pass every clip. |

Evidence:

- a list of the sim's action kinds with the clip each plays;
- 10 s captures of walk, a repair during a horde, eating, and a zombie death;
- the art-metrics character results.

### 1.6 VFX (`vfx`)

Rain, snow, lightning, fire and cooking steam, blood, breaking doors, traps (spikes, electric net, chainsaw),
molotovs, drone flights, screen feedback for damage.

| score | descriptor |
|---|---|
| 1 | No effects: weather and combat invisible except as text. |
| 2 | Some effects as flat sprites or particles that ignore light, sorting or the cutaway. |
| 3 | Weather, fire and combat have effects that respect light and depth. *May still show:* events without an effect (traps, breaching, drones). |
| 4 | Every event the source shows as an effect (the `vfx-rows.md` list of FEATURES.md rows) has one: weather, fire, blood, breaching, each trap, molotov, drone. Effects are lit, depth-sorted and cut by the cutaway, within budgets (draw calls, frame time). |
| 5 | Effects add to the mood without distraction; a VFX artist would call them finished. |

Evidence:

- a capture of each effect in play;
- the budgets run of the same commit with a storm-night horde scenario.

### 1.7 UI clarity and consistency (`ui`)

The HUD, panels, inventory grids, shop, map, phone, planning and death screens:

- `docs/UI.md` tokens and type scale (ART.md §8);
- EN and ZH layouts;
- no overflow;
- contrast.

| score | descriptor |
|---|---|
| 1 | Unstyled or inconsistent controls; text overflows; key information missing. |
| 2 | Styled, but several panels follow their own rules: sizes, colours and buttons differ; some text clips in ZH. |
| 3 | Every panel on the UI kit (`src/ui/kit/`, docs/UI.md). No clipped text in EN or ZH on the shot list. *May still show:* dense or ambiguous screens (icons without labels, states not shown). |
| 4 | Every screen on the kit, with body text contrast ≥ 4.5 : 1. Every item shown with its rendered icon, quality, servings and expiry badges. Hover, focus and disabled states everywhere. A first-time reviewer reaches every function the source offers (the `ui-rows.md` list of FEATURES.md rows). |
| 5 | As clear as the source or clearer; a UI designer would change nothing on the main screens. |

Evidence:

- the visual-regression shots of every panel in EN and ZH;
- an overflow scan (Playwright: every text node inside its box);
- contrast readings of body text and buttons.

### 1.8 Feedback and feel (`feel`)

Response to input, and feedback for every action.

| score | descriptor |
|---|---|
| 1 | Input lags or is lost; actions start and finish without a sign. |
| 2 | Most input responds, but some takes over 100 ms to show anything. Actions show a label and nothing else. |
| 3 | Every input of the feel list responds within 100 ms. Actions show start and completion. *May still show:* progress only in a panel. |
| 4 | Every input of the feel list responds within 100 ms. Every action shows start (the survivor turns to it, a sound), progress (a bar or animation at the spot) and completion (a result toast or change on screen). Failures say why. No placeholders (from P1). |
| 5 | The game feels as responsive as the source or better; tuning, easing and sounds make routine actions satisfying. |

Definitions:

- **The feel list** is 20 fixed inputs in `tests/e2e/feel.spec.js` (a P1 deliverable), run at 4× CPU throttle:
  hover a furniture piece; click it (context menu); pick a menu action; click a floor tile (walk); shift-click
  (queue); drag the camera; wheel zoom; `I` (backpack); drag an item in a grid; rotate it while dragging; speed 1;
  speed 2; speed 3; pause; the map; the phone; planning; the report; switch floor; `Escape` (close the top window).
  Each input is timed from the event to the **first changed pixel inside the target's box** (the element, or the
  piece's screen box); the **largest** of the 20 must be ≤ 100 ms.
- **No placeholders** = zero manifest entries flagged `placeholder` or `synthesized`, zero synthesized-audio
  fallbacks at runtime, zero raw string keys on screen (the writing scan), and the coverage tool's furniture render
  row at 100 %.

Evidence:

- the `feel.spec.js` report (all 20 times);
- captures of five actions from start to finish;
- the placeholder scan.

### 1.9 Onboarding (`onboarding`)

The prologue, the first preparation hours, tutorials and tips, the stockpile checklist.

| score | descriptor |
|---|---|
| 1 | A new player cannot start: no guidance, unclear goals. |
| 2 | Guidance exists but is text-heavy or late; new players miss the countdown or the city map. |
| 3 | The prologue and tips cover the first hours. The `first-timer` and `casual` personas (§6) reach the outbreak with food at home. *May still show:* confusion noted in the reports. |
| 4 | All four playtest personas reach Day 3 without asking for help in ≥ 4 of 5 sessions. Every system is introduced when first needed (patch-note tips of the source included), and the skip-prologue path is complete. |
| 5 | New players understand the loop (hoard, hold, rebirth) by the end of their first life without external help. |

Definitions:

- **food at home at the outbreak** = at least 3 days of eating (120 satiety, `docs/BALANCE.md`) in the backpack and
  home storage at 18:00 on Day 1, read from the session's harness trace;
- **without asking for help** = the session report logs no question to the moderator and no look at outside
  material;
- **introduced when first needed** = the tip or tutorial of a system shows at or before its first use, both
  timestamped in the trace.

Evidence:

- the playtest reports of that phase (`docs/playtests/<phase>/`), with the first-session notes of every persona.

### 1.10 Audio mix and music (`audio`)

Sound effects, ambience, music per home and state, the bus mix and loudness, voice limits.

| score | descriptor |
|---|---|
| 1 | Silent, or placeholder beeps. |
| 2 | Sounds for some actions; clipping, masking or repetition obvious; no music per state. |
| 3 | Every frequent action and ambience has sound. Music follows day, night and crisis. Loudness within the targets of `docs/AUDIO.md`. *May still show:* repetition over long sessions. |
| 4 | Every action, crisis and UI event has sound, with round-robin variants and no audible repeat within a minute. Music per home, and crossfades between states. Mix at −16 LUFS integrated with no clipping (true peak ≤ −1 dBTP). Spatial cues for zombies at doors and windows. |
| 5 | The soundscape carries tension and relief as the source does; an audio director would sign off the mix. |

Evidence:

- a 10-minute capture of one day and one siege (loudness measured);
- the audio manifest checks;
- listening notes from two reviewers.

### 1.11 Writing and localization (`writing`)

Every string the player sees, in EN and ZH:

- config text through `loc()`;
- authored strings;
- tone, consistency and correctness;
- no missing keys.

| score | descriptor |
|---|---|
| 1 | Raw keys, untranslated Chinese in the EN build, or broken sentences. |
| 2 | Translated, but with machine-translation errors, inconsistent names for the same item, or truncated strings. |
| 3 | No missing or raw strings in either language on the shot list. Names consistent. *May still show:* awkward or overly literal lines. |
| 4 | Every string in both languages checked (a scan finds no missing key, raw id or ZH in EN). Item, character and place names are one glossary. Tone matches the source (dry, quiet dread). Numbers and plurals formatted per language. |
| 5 | Reads as written for each language; a native editor in both finds nothing to fix. |

Evidence:

- the string scan output;
- 20 random strings per language reviewed with notes;
- the glossary.

### 1.12 Stability and performance (`stability`)

Crashes, errors, save and load, budgets.

| score | descriptor |
|---|---|
| 1 | Crashes or console errors in normal play; saves lost. |
| 2 | Occasional crashes or errors; some budgets missed by a wide margin. |
| 3 | No crash in the balance runs. Save/load round trips 100 %. *May still show:* one or two budgets missed or unmeasured. |
| 4 | Every budget met (`tools/budgets/run.mjs` passes). Zero crashes over the balance runs and the phase's playtests. No console errors on the e2e suite. Save/load round trips 100 %. |
| 5 | As 4 with headroom: the frame budgets met at 6× CPU throttling (`node tools/budgets/run.mjs --cpu 6`), and no open S3 bug in the area `stability`. |

Evidence:

- the budgets and balance reports of that commit;
- the e2e run;
- the bug ledger summary (`npm run gate -- --status`).

---

## 2. Side by side with the source

Each home and exploration site that a native source frame shows is compared with that frame at matching framing. The
pairs are listed in [`docs/quality/side-by-side.json`](quality/side-by-side.json). Each pair gives:

- `from`: the phase it is due (`P1` for the home interiors, `P3` for exteriors, weather and sites);
- `source`: the frame in `assets/targets/source/`, a native view (the HUD is on screen, ART.md §1.1). Punch-ins never
  define a pair. A home with no native frame of its own is paired with its nearest native frame of the same kind of
  space, marked `nearest` with `why`;
- `shot`: the in-engine capture: a URL, a `storage` entry that unlocks the three survivors, the steps (the format
  of `tests/visual/shots.json`, with the setups `goto` (day and time, the survivor kept standing), `weather`,
  `unlock` (the home's locked floors), `travel`, `explore` and `clear` (the pop-ups a run of days leaves)), and a
  **numeric** look-at point in sim tiles with the floor and `lookZoom` (the zoom amount of `src/contracts/look.js`);
  the rest of the pose is `look.js`;
- `conditions`: the day, time, weather and scene the shot must reach; `tests/visual.test.js` captures every pair
  and asserts them from the game state (and that no window or toast covers the scene);
- `measured`: the source frame's descriptors, measured: the camera (vFOV, pitch, yaw from ART.md §1.1,
  `tools/targets/camera.py`), the value (the median luma of the central 60 % × 60 % crop), the palette (its 3
  dominant colours, k-means in CIELAB) and the key light (ART.md §4 rig table);
- `judge`: which of those the pair is judged on, and `descriptors`: what the capture `requires` (all must hold for
  a 4) and what it `mayShow` beyond them.

The judges, with the tolerances the file must state:

| judge | passes when | tolerance |
|---|---|---|
| `camera` | `tools/targets/camera.py` on the capture gives vFOV, pitch and yaw within tolerance of `measured.camera` | vFOV ±1°, pitch ±1°, yaw ±2° |
| `value` | the median luma of the same crop of the capture is within tolerance of `measured.value.median` | ±5 codes |
| `palette` | each of the capture's 3 dominant colours (same method) is within tolerance of its nearest measured colour | ΔE2000 ≤ 8 |
| `light` | the capture's key light (the rig of `look.js`) is within tolerance of `measured.light`, azimuth and elevation | ±15° |
| `relativeAlbedo` | the L* gaps between the capture's 3 dominant colours are within tolerance of the source's | ±5 L* |

Frames that anchor less are judged on less: t035's clock is hidden, so its pair (`apartment-1f-golden`) is judged on
the camera and relative albedo only; t059's camera fit is loose, so its pair skips the camera. The hardware store,
school, hospital and office have no native frame (ART.md §1.1), and the one supermarket frame (t019) shows it stocked
before the disaster, so it pairs with the pre-disaster market shop and the ruined supermarket site has none: these
five are **unpaired**, with why. Each is judged on
its `evidence` instead of a pair: a grey-card reading in the site at the day and night rigs (within ±5 codes of ART.md
§4.2 / §4.3), and a day and a night capture whose floors, walls and props are checked against the ART.md §7 bands
(the art-metrics `albedo-band` method on the capture's material regions), committed as
`docs/quality/<phase>/unpaired/<site>-greycard.md` and `<site>-day.png`, `<site>-night.png`.

**Procedure** (per pair, by a fresh reviewer):

1. Capture the pair's `shot` with the visual harness at 1920 × 1080, fixed clock and seed.
2. Compose a sheet with the source frame on the left and the capture on the right, at the same size, the source's
   paper border cropped (ART.md: `game = (file − (90, 9)) / 0.90625`). Commit it as
   `docs/quality/<phase>/side-by-side/<pair>.png`, with the judge readings.
3. The pair scores at most 3 unless every judge passes and every `requires` descriptor holds; then score it 1–5 with
   the `match` descriptors (§1.1).
4. Record one `side-by-side` line per pair in `docs/quality/scores.jsonl` (§5), the sheet as evidence.

A pair that is not built yet scores 1: nothing passes by being absent. `tools/art-metrics/scores.mjs` checks the
pairs file (every field above, the tolerances, the numeric look-at point, the unpaired reasons).

---

## 3. Thresholds

| what | threshold | when |
|---|---|---|
| every rubric axis | ≥ 4 | the signoffs of P1, P3 and P4 (and after, at the final release) |
| every side-by-side pair | ≥ 4 | from the phase in its `from` (P1 or P3) |
| scores | an axis or pair blocks while its latest score is below its earlier best; a later review that lifts it clears the block. One line per axis or pair per review | every review |
| feel | the largest of the 20 feel-list inputs ≤ 100 ms at 4× throttle; start, progress and completion feedback for every action | from P1 |
| placeholders | none (§1.8) | from P1 |
| art metrics | every check passes on every manifest; every art family has judged entries and the content of the phase (§3.1) | P0 signoff (`art-metrics`, the gate) |
| visual regression | every shot captured twice, byte-identical (else it fails as non-deterministic; a `?render=3d` shot renders on the hardware GPU in capture mode, figures posed from the clock alone, and repeats within rasterisation noise: at most 0.01 % of pixels off by more than 15 levels); SSIM ≥ 0.98 (lowest RGB channel) against its approved baseline and ≥ 0.95 on every tile of a 16 × 9 grid (120 × 120 px); every baseline line approved by a reviewer master's roster lists | every merge that runs the full gate (`visual`) |
| budgets | §4 | P0 signoff on (`budgets`, the gate) |
| balance | every band of `docs/BALANCE.md` due by the phase inside (outside or unmeasured fails); zero crashes; save/load round trips 100 % | every balance run (`node tools/balance/run.mjs --seeds 50`) |
| ledgers | the formats of §5 and §6; against master the ledgers only grow and fixed fields do not change; every line a branch adds to an approval log is signed | every merge (`ledgers`, the gate's quick tier) |
| rubric | the signoff rules above | the P1, P3, P4 and P5 signoffs (`rubric`) |
| release | no open S1 or S2, at most 20 S3; ≥ 20 playtest sessions, ≥ 5 per persona, 0 crashes; ≥ 200 bot sessions with 0 crashes and 100 % round trips, run at the commit's sim; every budget met at HEAD | P5, the final release (`release`, `gate --final`) |

A score below the threshold, or below its earlier best, blocks the phase's signoff until a later review lifts it.

### 3.1 Art metrics

`node tools/art-metrics.mjs` (`tools/art-metrics/standard.mjs`) judges every manifest entry. What a check needs and
the entry lacks fails: a library material needs its base color, normal and ORM maps and a banded family; a kind's
required checks may not be skipped (a transmissive family's albedo and a lone icon's distinctness are the only
exemptions).

| check | threshold |
|---|---|
| content | P0: a skinned `characters/wage`; the apartment's 1F shell (`params.class: 'shell'`) with a lightmap entry holding the five ART.md §4.4 sets (day, dusk, night, overcast, lamps); icons bound to config items. From P1: every survivor, every home and floor |
| albedo | per texel by its own metalness: dielectric 0.013–0.90, metal F0 0.50–1.0 (p0.5–p99.5, every tint); untinted median inside the ART.md §7.2 family band; an unbanded family fails |
| metalness | ≥ 90 % of texels within 0.1 of 0 or 1 |
| roughness | ≤ 0.5 % clipped at 0 or 1 (library and embedded metallic-roughness maps); median inside the family band |
| normals | on every stored mip: length error mean ≤ 0.02, p99 ≤ 0.08; ≤ 0.1 % back-facing |
| tiling | no wrap seam; block deviation from the tile mean ≤ 12 % at 4 × 4, ≤ 20 % at 8 × 8, ≤ 25 % at 16 × 16; repeats at 1 m or 2 m, and not inside itself (a tile equal to itself shifted by half or a quarter, ≤ 1 code and ≤ a quarter of an unrelated shift, fails `tile-size`). Only the patterned families (checker, ceramic tile, wood floor, brick) may declare `params.patternM`, with at least 4 periods per side, and must keep ≥ 0.5 % relative variation once it is removed |
| texel density | every UV island within ±10 % of its ART.md §3 class; the islands too small to judge cover ≤ 10 % of the area |
| triangles | the class budget (shell ≤ 60 000, character ≤ 15 000, hero ≤ 10 000, …), as the manifest says; each LOD ≤ 60 % of the one before |
| skinning | ≤ 4 influences; the clips `idle`, `walk`, `run` |
| icons | 64 / 128 / 256 px with alpha; within a config category (the bound item's; `params.category` may only narrow it) every pair ≥ 14 hash bits apart, or ΔE2000 ≥ 12 apart and ≥ 8 under protanopia and deuteranopia |
| text | no text-like row (glyphs ≥ 6 px, ≥ 3 in a row) on base colors, model atlases, icons and (from P1) in-engine renders, beyond the label lines an entry declares in `params.labelText` |
| lightmaps | seam step p95 ≤ 5 %, max ≤ 10 %; ≥ 2 texels of dilated padding (4 in KTX2) |

### 3.2 Frozen after P0

These files hold the thresholds and are frozen with them. After P0 they change only to fix a demonstrated bug (a
reproducible case where the tool is wrong), approved by a reviewer, and they never loosen:

- `tools/art-metrics/standard.mjs` (§3.1) and `tools/art-metrics/scores.mjs` (evidence sets, pair tolerances);
- `tools/visual/compare.mjs` (the tile grid), the `threshold` of `tests/visual/shots.json`;
- `tools/budgets/budgets.mjs` and `tools/budgets/browser.mjs` (the budgets, the throttles, the network, the
  software-GL list);
- `tools/balance/bands.mjs` (the bands; they change only with an approved line of `docs/balance/bands-log.jsonl`,
  `docs/BALANCE.md`);
- `tools/balance/ledgers.mjs` (the severity rules and the release counts);
- the runners that decide what those thresholds are measured on: `tools/budgets/run.mjs` and
  `tools/budgets/scenario.mjs` (the scenarios, the zero-as-unmeasured rule), `tools/visual/run.mjs`,
  `tools/visual/baselines.mjs` and `tools/visual/capture.mjs` (what is compared, who may approve, and the double capture
  with a clock that only the steps advance), `tools/balance/check.mjs`, `tools/balance/git.mjs`
  (the append-only rules and the approver roster) and `tools/balance/session.mjs` (what a session measures);
- the text-detector constants in `tools/art-metrics/text.mjs` and the pattern rule of `tools/art-metrics/materials.mjs`
  (`patternM`).

### Changing a threshold or a baseline

- **Approvals.** Every approval (baselines, band lines, bug closures, severity changes) names `review:<id>` of a
  reviewer listed in the `## Reviewers` registry of docs/wp/STATUS.md **as master has it** (a branch cannot add
  itself; without a readable master the check fails). There is no `integrator` approver: every agent commits as the
  same git user, so nothing proves who wrote a line. Builders leave `approvedBy` empty; the integrator fills it from
  the reviewer's written verdict at merge.
- A baseline image changes only through `node tools/visual/run.mjs --approve <shot> --reason "…" --by
  review:<id>`. That appends to `tests/visual/baselines/log.jsonl` (hashes before and after, the SSIM between them,
  reason, approver, commit, environment). A baseline the log does not account for fails, and a shot whose two
  captures differ cannot be approved. Against master the log must extend master's byte for byte, every line the
  branch adds needs an approver (`--sign --by review:<id>` signs lines written before review), and no shot id master
  lists may disappear. The capture never advances the page clock while it waits: game time moves only in explicit
  `frames` steps, the 50 ms after each step, and the settle.
- A band changes only through `node tools/balance/check.mjs log-bands --reason "<research file:line>"`, signed by a
  fresh reviewer (`sign-bands --by review:<id>`).
- Tests are never deleted or weakened, and there is no `.skip`, `.only` or `.todo`. Every golden-value change is
  logged with its reason in the commit that makes it.

---

## 4. Budgets

Measured by `node tools/budgets/run.mjs` (the gate's `budgets` check) on a fresh production build. The setup:

- the full Chromium build (`channel: 'chromium'`) at 1920 × 1080, device scale 1;
- the **default renderer** (no `?render`). From P1 it must be the shipping renderer (`3d`); a run on another
  renderer, or on software WebGL (SwiftShader, llvmpipe), leaves every browser budget unmeasured;
- the CPU throttled 4× (DevTools `Emulation.setCPUThrottlingRate`; `--cpu 6` for the stability 5), and the network
  at 10 Mbit/s down with a 40 ms round trip (`Network.emulateNetworkConditions`);
- the build served as a static host would serve it: gzip for text, immutable caching for the hashed bundle, ETags
  elsewhere.

A budget that cannot be measured is **unmeasured**, and that fails like a miss.

| budget | limit | how it is measured |
|---|---|---|
| frame time p95 | ≤ 16.7 ms | requestAnimationFrame intervals over 10 s after a 2 s warm-up, at the fastest game speed. An interval of v ms is ceil((v − 1) / 16.667) display frames, at least 1; p95 ≤ 1 frame. The worst of eight scenarios: New Game in each home (apartment, duplex, warehouse); the Day 87 final horde at its peak night wave, in a storm, in each home; the exploration site with the most zombies, forced at night (the office, 14); and the backpack and a storage grid open. A scenario that cannot be reached leaves the budget unmeasured. |
| worst frame | ≤ 33 ms | the longest interval of the same samples, ≤ 2 display frames |
| draw calls | ≤ 500 | `renderer.stats().drawCalls` sampled every frame of every scenario, the largest; every scenario must report a positive number (a scenario at 0 or without `stats()` leaves the budget unmeasured) |
| GPU memory | ≤ 512 MB | `renderer.stats().gpuBytes` (as WP-P0-14b defines it: textures, buffers and render targets), sampled the same way |
| initial download | ≤ 5 MB | bytes received (encoded) until the title screen shows, fresh profile |
| cold first-interactive | ≤ 8 s | navigation start to the first frame of the home scene after `renderer.ready`, New Game and Start clicked as soon as they are enabled, fresh profile |
| warm first-interactive | ≤ 3 s | the same after relaunching the browser on the same persistent profile |
| shipped size | ≤ 2 GB | every file of `dist/` |
| 100-day headless sim | ≤ 60 s | `node tools/budgets/sim100.mjs`: one seeded run of every system from the first hour to the end of Day 100 in one-hour ticks, the home's storage stocked as in a late game. The survivor and the house are kept standing so the run lasts all 100 days. |

`test-results/budgets/last.json` records the commit, whether the tree was dirty, the phase, and the machine (CPU,
cores, memory, OS, the WebGL renderer). **The reference machine** for signoffs is an Apple M4 Max (16 cores, 64 GB,
macOS on arm64) with Chromium 153 on ANGLE Metal; a run elsewhere is advisory. The release check takes only a
budgets run of HEAD with a clean tree.

Draw calls and GPU memory need the renderer to report them: `Renderer.stats(): { drawCalls, triangles, gpuBytes }`
(`src/contracts/render.js`, WP-P0-14b) is optional on the interface and required of the three.js renderer. The P0
default, the Canvas renderer, has none, so both budgets are unmeasured and the check fails (an unmeasured budget is
an S2 bug).

---

## 5. The scores ledger (`docs/quality/scores.jsonl`)

**Append-only.** One JSON object per line, one line per axis (or side-by-side pair) per review: a second line for
the same axis or pair in one review is rejected. A review is the set of lines with the same `review` id.
Corrections are new lines with a later review id, never edits.

```json
{"review":"P1-r1","phase":"P1","axis":"lighting","score":4,"reviewer":"agent:3f2a9c1e","fresh":true,"date":"2026-10-14","commit":"a1b2c3d","evidence":["docs/quality/P1/lighting/rig-day.png","docs/quality/P1/lighting/greycard.md","docs/quality/P1/lighting/dusk-night.webm","docs/quality/P1/lighting/lamps.md"],"notes":"All rigs within ±5 codes; dusk→night cross-fades; storm lightning flickers once too often."}
{"review":"P1-r1","phase":"P1","axis":"side-by-side","pair":"apartment-1f-night","score":4,"reviewer":"agent:3f2a9c1e","fresh":true,"date":"2026-10-14","commit":"a1b2c3d","evidence":["docs/quality/P1/side-by-side/apartment-1f-night.png"],"notes":"Camera, value, palette and moon direction within tolerance of t033."}
```

| field | meaning |
|---|---|
| `review` | `P<n>-r<k>`: the phase and the k-th review in it |
| `phase` | `P1` … `P5` |
| `axis` | one of `match`, `lighting`, `materials`, `models`, `characters`, `vfx`, `ui`, `feel`, `onboarding`, `audio`, `writing`, `stability`, or `side-by-side` |
| `pair` | for `side-by-side`: a pair id of `docs/quality/side-by-side.json` |
| `score` | whole number 1–5 |
| `reviewer` | `agent:<id>` or `human:<name>`; an agent that built any work package (docs/wp/STATUS.md) is not fresh |
| `fresh` | true: the reviewer did not build any part of what the phase delivered |
| `date` | ISO date |
| `commit` | the commit the evidence was captured on |
| `evidence` | repo paths of the files the score rests on, all committed, covering the axis's evidence set (below) |
| `notes` | which descriptor points hold and which do not |

The evidence set of each axis (`tools/art-metrics/scores.mjs` `EVIDENCE`; every item needs a file):

| axis | evidence files |
|---|---|
| `match` | a side-by-side sheet; the framing re-measurement (`framing.md`/`.json`); the art-metrics report (`art-metrics.json`) |
| `lighting` | a rig capture (`rig-<rig>.png`); the grey-card readings (`greycard.md`); the dusk → night capture (`dusk-night.webm`); the lamp calibration (`lamps.md`) |
| `materials` | `art-metrics.json`; a close and a wide capture (`-close.png`, `-wide.png`); the contact sheet |
| `models` | the coverage report; `art-metrics.json`; turntables (`turntable-…`); floor captures (`floor-…`) |
| `characters` | the action-clip list (`actions.md`); a capture (`.webm`/`.mp4`); `art-metrics.json` |
| `vfx` | a capture; the budgets report (`budgets.json`) |
| `ui` | shots (`shots/`); the overflow scan; the contrast readings |
| `feel` | the feel-list report (`feel.json`); a capture; the placeholder scan (`placeholders.json`) |
| `onboarding` | the phase's playtest reports (`docs/playtests/P<n>/`) |
| `audio` | the loudness readings; a capture; the listening notes |
| `writing` | the string scan; the glossary; the reviewed sample |
| `stability` | `budgets.json`; the balance report (`docs/balance/P<n>`); the e2e run |

`tools/art-metrics/scores.mjs` checks the ledger and the pairs; the `ledgers` gate check runs it on every merge and
the `rubric` check applies §3 at a signoff (`node tools/balance/check.mjs rubric --phase P<n>`).

---

## 6. Playtests and bots

- **Playtests** follow [`docs/playtests/README.md`](playtests/README.md):
  - four personas;
  - UI only, with only `?seed=` and `?devSpeed=` in the URL;
  - a mandatory passive logger: page errors and 5 s stalls count as crashes (the stall clock starts at the first
    home frame after `renderer.ready`; the loading screen is the first-interactive budget's);
  - results in `docs/playtests/<phase>/`.
- **Balance bots** follow [`docs/BALANCE.md`](BALANCE.md). The run: `node tools/balance/run.mjs --seeds 50`, 50
  seeds per difficulty and bot; report in `docs/balance/<phase>.md` and `.json`. Every failing band is a bug.
- **Bugs** go into [`docs/bugs.jsonl`](bugs.jsonl), one per line, **one bug per root cause**: a report that bundles
  several causes is split.

### Bug severity

The rules decide; the examples illustrate.

| severity | rule | examples |
|---|---|---|
| S1 | blocker: a crash, a lost or corrupted save, a run that cannot continue, a security or data problem | an exception in the sim, Continue loading a different run |
| S2 | broken with no workaround; or a deviation from the source that moves a balance band, or a config number by more than 10 %; **every budget miss (an unmeasured budget included)** | an ending's device button hidden, a recipe that can never cook, an item never obtainable, a failing balance band, no renderer stats |
| S3 | a workaround exists; or a deviation of at most 10 % that moves no band; or a visual defect | story documents refused as fuel (other fuel works), a texture seam, the material library off its ART.md bands |
| S4 | polish: cosmetic, wording, test or tooling gaps with no player impact | a missing test, a log line |

Release (P5) allows no open S1 or S2 and at most 20 open S3. The area `stability` holds crashes, errors, stalls and
budget bugs (the stability 5 asks for none open at S3).

### The bug ledger (`docs/bugs.jsonl`)

**Append-only by id.** Against master, no id disappears, and a line changes in place only in `status`, `fixedIn`,
`links`, `notes`, `approvedBy`, and `severity` with a new `severityHistory` entry.

```json
{"id":"BUG-0001","severity":"S2","status":"fixed","title":"…","area":"sim/actions","rootCause":"…","repro":"…","foundBy":"integrator (merge #1)","links":["b8b8a2d","tests/fix_actions_id.test.js"],"phase":"P0","opened":"2026-09-22","fixedIn":"b8b8a2d"}
```

| field | meaning |
|---|---|
| `id` | `BUG-<4 digits>`, never reused |
| `severity` | `S1`–`S4` by the rules above |
| `status` | `open`, `fixed` (with `fixedIn`), `wontfix` (with a reason in `notes`), `duplicate` (with the id in `links`) |
| `title` | one line |
| `area` | the code or content area: `sim/<system>`, `content/<table>`, `render`, `ui`, `audio`, `assets/<family>`, `tools`, `tests`, `stability` |
| `rootCause` | the one cause (what is known; "suspected" or "not yet traced" when it is not) |
| `repro` | steps, a seed or a test that shows it |
| `foundBy` | `bot:<name>`, `playtest:<persona>`, `review:<axis>`, `tool:<name>`, `agent:<wp>`, `integrator` |
| `links` | commits, tests, reports, other bug ids |
| `phase` | the phase it was found in |
| `opened` | ISO date |
| `fixedIn` | the commit that fixed it (status `fixed`) |
| `notes` | optional |
| `approvedBy` | `review:<id>` of a reviewer master lists, recorded by the integrator from the reviewer's verdict (builders leave it empty): required to close an S1 or S2 as `wontfix` or `duplicate` |
| `severityHistory` | `[{ from, to, reason, approvedBy, at }]`, one entry per severity change, in order; the last `to` is `severity` |

`tools/balance/ledgers.mjs` checks the ledger and its changes against master (the `ledgers` gate check) and counts
open bugs by severity for the release (`release`, `gate --final`).

## 7. Code coverage (`tools/code-coverage.mjs`)

The Node tests measure `src/` with V8's own coverage (`NODE_V8_COVERAGE`: the gate's `tests` check writes one file per
test process under `test-results/coverage/v8/`). The tool merges them itself: a line, branch or function counts as
covered when any process ran it. (Node's `--experimental-test-coverage` merge is not used: a process that loaded a
module without calling a function let that function's zero win over the process that called it.) Tests must take the
same paths every run, so anything random in `src/` draws from a seeded stream of `src/engine/rng.js`; otherwise the
ratchet below would flake. The `code-coverage` check judges two things:

- **New code: 100%.** Every line and branch a branch adds or changes under `src/`, against its merge base with master,
  is run by a test. A changed file no test loads fails.
- **The ratchet.** No file's line, branch or function coverage falls below `docs/quality/code-coverage.json` (0.5
  points of run-to-run noise allowed), and a branch never lowers master's numbers or drops a file from it. Raise the
  baseline with `node tools/code-coverage.mjs --update` when tests improve a file; it never lowers one. The baseline
  names the `method` it was measured with; when the tool's method changes, the integrator re-records it
  (`--update --rebase`) and master's older numbers are not compared.

Files that only run in a browser with a GPU or Web Audio are **exempt** from the new-code rule, each with the check
that covers it instead (the 3D visual shots, the e2e specs); they stay under the ratchet. Only the integrator adds an
exemption, on master. The long-run target is every file at 100%: when you touch a file, leave its numbers higher.
