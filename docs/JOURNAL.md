# Journal

## 2026-09-22 — P0 opened (pre-production)

**Baseline.** Commit `a90f84a` on `master`: the Canvas build with 434 passing tests, 108 modules, `docs/FEATURES.md`
at 179 rows, the sim in `src/sim`, the view model in `src/ui/view.js`, the Canvas renderer in `src/render/iso.js`.

**Environment.** Apple M4 Max, 64 GB RAM, 548 GB free. Node 24.15 / npm 11.12, Homebrew 6.0, git-lfs present;
Blender, ffmpeg and sox installed by the coordinator so agents don't race on Homebrew.

**Sources checked.** Reachable without an account: npm, Poly Haven API, ambientCG API, Kenney, VCSL and VSCO 2 CE on
GitHub, the CMU mocap site, MakeHuman asset packs, Steam store screenshots (1920×1080) and the trailer HLS stream.
Needing fallbacks: Sonniss GDC bundles answer 403 to scripted requests (audio lane tries the official links, else
Kenney plus synthesis); the cgspeed CMU BVH mirror is gone (convert the original ASF/AMC); KTX-Software has no
Homebrew formula (use the official GitHub release).

**Plan.** Thirteen P0 packages (`docs/wp/`), first wave of four writers: build and interfaces (P0-01), key registry
(P0-02), look reference and ART.md (P0-04), asset pipeline and materials (P0-05). P0 closes at user checkpoint 1.

**Progress.** P0-01 merged (`afff849`): Vite 8.3, TypeScript 7.0 over `// @ts-check` files, ESLint 10, Playwright 1.63, three 0.186; frozen contracts in `src/contracts/`; the gate with 15 checks (9 built, 6 pending for later packages). Bugbot could not compute branch diffs (no remote, `master` base), so reviews use a written change description.

**Progress.** P0-02 merged (`ca522eb`) after one review return: keys-audit is in the quick gate (325 keys, 0 problems), 453 tests. P0-05 went back once: its manifest test skipped the contract check when the contract file was missing. The gate's `asset-lock` check only covered hashes, and §11 also requires a 5% re-bake at SSIM ≥ 0.99. Gate scripts freeze after P0, so a new package WP-P0-14 builds that check together with the first interface pass (material binding, rebuild contract). Branches cut before `.gitattributes` are squash-merged with renormalization, so master's history stays free of plain binaries.

**Progress.** P0-05 merged (squash, `ebc8b5b`): 16 calibrated CC0 scan materials as KTX2, 19 locked sources that restore from scratch in 23 s, and the shared lock and credits ledgers. P0-14 merged (`7f753f6`): the material binding lives in the asset manifests, not the view model; every shipped asset declares a rebuild recipe and SHA-256 digests; the look constants are in `src/contracts/look.js`; and asset-lock re-bakes a seeded 5% sample at SSIM ≥ 0.99, which on master reproduces the materials byte for byte. The integrator had to edit tests twice while merging ledgers and digests. The first edit narrowed a check and a reviewer caught it, so integrator test edits now get their own review. The infosec secret scanner flags public hashes in the ledgers; its false-positive override is allowed only after checking every flagged string, and each use is logged. P0-04's art review sent ART.md back (lamp measurements, rig anchors, bake rules, and a 40° zoom that breaks 256 px/m where native views stop near 50°). P0-06 passed code review (music in code from CC0 samples, 71 takes, the 60 s test at −16.1 LUFS; Sonniss stayed at 403, so Kenney plus synthesis) and is adopting the rebuild contract. 632 tests.

**Progress.** P0-04 merged (squash, `4f711cd`) after one return. The minimum zoom is 50°, the source's native stop; 40° broke 256 px/m. The lighting rigs are re-derived. A bake and runtime contract keeps the key light's direct term out of the lightmaps and puts the lamps in a switchable layer. The LUT is a neutral tint only, with lamp colour from an emitter layer. A fix-up (P0-04b) is approved and merging. Reviews kept finding tests that passed when an input was missing, in P0-05, P0-06, P0-09 and the shared contract test. The rule is now written down (no conditional passes), and each case went back to its owner. Two findings change the plan:
- **The character was wrong because of this coordinator's package text.** WP-P0-09 asked for a white shirt and tie; the source's Wage Slave wears a charcoal hoodie, jeans and sneakers, and runs at about 5 m/s like the sim. WP-P0-09 is corrected (outfit, a run clip, velocity-continuous loops, a three.js render under the ART.md rigs), and the character goes back for a re-dress.
- **The coverage tool took its furniture scope from our own content.** About 880 of 923 excluded pieces are used by the original. The tool freezes after P0, so it goes back for a rework, with strict function specs, achievements credited only when game code awards them, and the gate passing the phase. Once fixed, about 1,150 furniture entries are in scope for P3.

P0-12 delivered 12 deterministic Cycles icons and found a material-library seed bug (black renders above about 2²⁰), which is routed to a P0-05 follow-up.

**Progress.** Merges #6 to #13 landed: the audio test (P0-06), the ART.md fix-up (P0-04b), icons (P0-12), interface pass 2 (P0-14b), the material library at the ART.md standard (P0-05b), the coverage tool (P0-03 + P0-03c), the survivor (P0-09 + P0-09c) and the quality tools (P0-11 + P0-11c). Master `1333c69` has 876 tests; the quick gate passes. The full gate now runs every check and fails three, on content that was already there: art metrics (self-copied material tiles, unbanded material families, the character measured in bind pose, no shell yet), budgets (the Canvas renderer can't report draw calls or GPU memory) and balance (scavenging adds no days, and the forager loses the Day 25 horde too often). Each has an owner in STATUS, and all block the P0 sign-off. Merges must pass the quick gate and add no full-gate failure. Other state:
- The coverage tracer was redesigned by a fresh architect (P0-03d) against 33 threats. Honest achievement credit today is 1 of 93, to be earned back by tests that survive through play.
- The UI kit was a best-of-2. The reviewer picked builder B and folded A's best parts into it.
- The tech spike review (P0-08) found that ART.md's sun and moon azimuths blacken the foreground, and that its lamp anchor came from a photo whose table lamp is off. The art director re-derives both (P0-04e), then the shell re-bakes and the spike re-calibrates.

Four coordination slips, with their fixes:
- A completion report from the integrator never arrived, and a blocker sat for over an hour until the coordinator read the transcript. Silent agents now get their transcripts checked.
- The coordinator's own STATUS wording (a reviewer's id in a table row) made the approval tool treat that reviewer as a builder and blocked merge #13's signatures. Reviewer ids now stay out of table rows, and the parser fix is queued in P0-11d.
- A Bugbot review whose change description gave relative paths read master instead of the branch, and its two high findings described the tracer's old code. All 51 Bugbot runs were audited. That run was the only one whose findings were acted on; one other read master, but a later correct run covered its branch before the merge. Change descriptions now name files by absolute worktree paths.
- When routing that review, the coordinator passed on two of its four findings. The other two went to the coverage auditor to check against the branch.

**Progress.** At 10:14 every running agent stopped on Cursor's monthly usage limit, and `docs/BLOCKED.md` recorded the state. Master was consistent, and each stopped agent's uncommitted work stayed in its worktree. A probe review went through at 10:16, and the five stopped agents resumed where they had stopped. None redid committed work. The note is now removed. The same check found a third lost completion report: the art director's P0-04d had been done since 04:03 and sat unreviewed for six hours. Merges #16 (interface pass 3) and #18 (the UI kit, its dev pages kept out of the build) landed. #17 (the shell) and #19 (the furniture) each stopped on a side-effect of #15's library: the kitchen wall tile can't reach its target, and the cardboard is too saturated for the newspapers box. Each is back with its author, with no test loosened. Rulings since then:
- **Forager bands:** the quality-standards reviewer ruled two source-backed definition changes (stay fed above the regeneration threshold; treat wounds with found medicine). P0-15 now holds 23 of 26 bands.
- **Budgets at P0:** the three.js spike is measured in three frozen apartment scenarios, with the shipped survivor as zombie stand-ins. First interactive may stream textures above a texel-density floor, and full quality is its own budget. The spike meets frame time, draw calls and GPU memory, but its cold load (21.3 s against 8 s) is an S2, fixed by progressive loading and a furniture texture diet.
- **Art direction:** P0-04d ruled the 11 missing material families and found up-facing surfaces 2.56x brighter in the source. P0-04e re-derived the sun (105 degrees), the lamps (weight 1), dusk and the top-light, and is in its first return.

## 2026-09-23 — The three.js renderer, and a new way of working

**Restart.** The work moved to a new machine. The coordinator setup (several agents in parallel worktrees, reviewer
signatures, a merge queue) is retired: the unmerged branches of the old machine (P0-03e, P0-04e, P0-08/08b, P0-09e,
P0-10, P0-11d, P0-13, P0-14d, P0-15b) never reached GitHub and are dropped. Master `c24e326` is the base; the goal is
unchanged (the game in 3D at the source's look), and the rules that protect the build stay: tests, the gate, the
contracts, the asset ledgers, never publishing.

**Progress.** The three.js renderer (`src/render3d/`) is the default wherever WebGL2 runs. It draws every home floor,
shop and site from the same view model as the Canvas renderer: the shell with ART.md's cutaway, 1,249 furniture
config rows as procedural props, 97 scanned CC0 models from Poly Haven (`assets/models/`, WP-P1-models, locked and
credited like the other lanes), the survivor with walk and run, the day / dusk / night / weather rigs, and the full
post chain. Brightness was fitted to the nine side-by-side pairs: sky and bounce fill ×1.6 over the ART.md rig values
and exposure 1.1 put the medians of t035, t033 and the market within a few codes of the source.

**Findings.**
- The side-by-side pairs already asked for `?render=3d`; without a 3D renderer they silently fell back to 2D. With one,
  SwiftShader took minutes per shot, so 3D captures and Playwright now run Chromium with Metal on macOS.
- The rig values of ART.md §4.3 alone leave the frame at about half the source's median, with p10 20–40 codes too
  dark: the source lifts its shadows well above a physical sky term.
- The interior rule R3 (no sun patches indoors) needs the full wall volume as a shadow caster, not just the floors
  above: a low sun otherwise comes in under the roof through the cut-down walls.

## 2026-09-23 — Closing the gaps to the source

A read-only investigation listed what still separates the build from the Steam game (visuals, content, audio and
UI, the quality gates) and ordered a roadmap by player-visible impact. Worked through on `p1-render3d`, each step
behind the quick gate and fast-forwarded to `master`:

- **UI, icons, names.** The UI kit dresses the HUD and every window; the inventory shows the rendered icons; Steam's
  English item names replace the machine translations.
- **Audio.** `src/engine/sampler.js` plays the recorded manifest (variant rules, music crossfades on bar lines, room
  reverbs), with loops for rain, the generator and the horde, and footsteps; synthesis remains the fallback.
- **In-world feedback and animation.** Progress labels, name tags and crop timers over the scene. Nine CMU-based
  clips join idle / walk / run on the survivor (work, use, eat, sit, attack, sleep; pickup, hit, death), placed on the
  bed or seat they need; zombies batter doors, flinch, fall and bleed.
- **Lighting and weather.** Lamps and the flashlight to ART.md §4.5; fog, wet ground and snow cover; smoke off fires;
  sparks, debris and dust at the pieces the sim names; floors and scenes fade in.
- **Places.** Stores dressed like t019 (signs, tape, stocked gondolas, pallets, glass-topped freezers); streets with
  lanes, crossings, curbs and leaves; frost in cold storage; the rope-and-basket line; an animated cat.
- **Content.** Ten ledger bugs fixed (the Companionship route, the neighbour's returned dishes, the pot size, recipe
  levels, fridge ice, rebirth manuscripts, …): coverage 66 % → 72 %, items 95 %, recipes 99.7 %.
- **Platform.** A Graphics setting (Auto / High / Low / Classic 2D), save files that export and import, touch pan and
  pinch, dialog and live-region markup; the camera's zoom and swivel to ART.md §1.2.

**Findings.**
- One transmissive glass material (the generator model's gauge) made three.js render every opaque object twice, and
  GTAO's normal pass rendered the scene again: fixing both halved the draw calls (office site 687 → 262 a frame).
- A three.js alpha map reads the green channel: canvas masks must be grey levels on black, not white at an alpha.
- `eslint .` linted agent worktrees under `.claude/` mid-edit; they are ignored now.

**Left for the user.** The balance bands the forager misses on Hard and Out of Ammo and Food are open readings of the
source (docs/balance/forager.md) that need a reviewer, not a tuning pass; 3D visual baselines need approval before
they replace the 2D ones; the budgets want a re-measure on a quiet machine; fonts (Noto) are still a decision.
