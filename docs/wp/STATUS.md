# Status

Phase: **P0 — pre-production** (the gate reads this line; the P0 signoff still waits on the full gate's art-metrics,
budgets and balance rows). Since 2026-09-23 the work runs without the multi-agent pipeline (see docs/JOURNAL.md): feature
branches off master merge after `npm run gate -- --quick` passes. The P0 table below is kept as history; its "running"
rows were never merged and are dropped.

## Plan

| # | Work | State |
| --- | --- | --- |
| 1 | three.js renderer over the view model (`src/render3d/`), default with WebGL2 | done (branch `p1-render3d`) |
| 2 | Scanned CC0 furniture models (`assets/models/`, 97 Poly Haven models) | done (WP-P1-models) |
| 3 | Brightness fitted to the side-by-side pairs | done; per-scene gaps remain (roof day, duplex terrace, site streets) |
| 4 | Clutter density and the source's props (pallets, crates on shelves, cables, wall fixtures) | next |
| 5 | Zombie and horde models of their own (today: tinted clones of the survivor) | next |
| 6 | Budgets, art metrics and the visual baselines on the three.js renderer (the full gate) | next |
| 7 | Characters: College Student and Warehouse Manager on the survivor pipeline | later |

---

## History: the P0 work packages

Concurrency: **5 writers** since merge #8 (starts at 4; −1 when more than 1 in 5 merges needs
manual conflict resolution, +1 up to 8 after two clean waves). A large review return (a rework) takes a writer
slot; a small return confined to the package's own files (under about half an hour) runs in the package's existing
place in the pipeline. Eight merges, none needing manual conflict resolution: two clean waves of four, so concurrency
rose from 4 to 5 at merge #8.

| WP | Title | Role | Depends on | State | Agent | Branch | Slot / port |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P0-01 | Build, interfaces and gate skeleton | architect | — | merged | 831eaea5 | wp/P0-01 | 1 / 5201 |
| P0-02 | Key registry and keys-audit | architect | — | merged | bca371f0 | wp/P0-02 | 2 / 5202 |
| P0-04 | Look reference and art direction | art director | — | merged | 30cda1ad | wp/P0-04 | 3 / 5203 |
| P0-04b | ART.md fix-up after approval | art director | P0-04 | merged | 30cda1ad | wp/P0-04b | 10 / 5210 |
| P0-05 | Asset pipeline and material library | materials | — | merged | 9f6f9c1f | wp/P0-05 | 4 / 5204 |
| P0-09 | Survivor character and animation spike | characters | Blender | merged (with P0-09c) | aa08f3f3 | wp/P0-09 | 5 / 5205 |
| P0-09c | Character: faster run, straight idle stance, hair value | characters | P0-09 | merged | aa08f3f3 | wp/P0-09 | 5 / 5205 |
| P0-05b | Material library to the ART.md standard | materials | P0-04b, P0-11 | merged | 9f6f9c1f | wp/P0-05b | 16 / 5216 |
| P0-04c | ART.md: dusk interior light and hair target | art director | P0-04b | P0-04c approved; P0-04d (the 11 material families) APPROVED at 1a2bd50 plus the indent nit 00dbd6d (art reviewer; Bugbot clean twice); merge #20 | 30cda1ad | wp/P0-04c | 10 / 5210 |
| P0-04e | ART.md re-derivations from the spike and shell reviews | art director | P0-04d | done at 886da74 (sun 105 degrees, LAMPS at weight 1, dusk, dawn without a key, the up-facing top-light policy, survivor values); the spike reviewer RETURNED it (the wall lamp sits in its spot's penumbra; fill per rig; blackout); Bugbot found a laminate output mismatch; return 1 running | 30cda1ad | wp/P0-04e | 23 / 5223 |
| P0-06 | 60-second audio test | audio | — | merged | f0be15b5 | wp/P0-06 | 6 / 5206 |
| P0-03 | Coverage tool | architect | — | merged (with P0-03c) | 7dec1733 | wp/P0-03 | 7 / 5207 |
| P0-03c | Coverage tool: final review fixes | architect (fresh) | P0-03 | merged; the tracer's integrity model is split into P0-03d | c4b4173e | wp/P0-03c | 14 / 5214 |
| P0-03d | Achievement credit integrity (the coverage tracer) | architect (fresh) | P0-03c | return 1 done at cc4d59c: TV rounds must be game-made (game side as `tools/coverage/trace/hook-tv-round.patch`), `extra` records limited to the UI's keys; Bugbot's two earlier findings read master's old tracer (the coordinator's prompt error, not the author's); the coverage auditor APPROVED the integrity model for the freeze (with the hook patch); a corrected Bugbot found TV rounds forgeable by swapping FACTORIES, so the TV-round integrity split into P0-03e (second failed return) | 3945c934 | wp/P0-03d | 20 / 5220 |
| P0-03e | Tracer: TV-round integrity (swappable game tables, methods of game-made objects) | architect | P0-03d | the auditor RETURNED cae1fdd (top-level Maps and Sets writable, e.g. RAT_IDS farms Rat Catcher; swallowed seal errors; the either-reason fixture); return running | 3945c934 | wp/P0-03d | 20 / 5220 |
| P0-14 | Interface pass 1 and the asset re-bake check | architect | P0-01, P0-05 | merged | 831eaea5 | wp/P0-14 | 8 / 5208 |
| P0-10 | Furniture for the spike room | furniture | Blender, P0-05, P0-14 | APPROVED at 833df8b; #19 blocked on master's library: the newspapers box (cardboard is now Paper004) is refused at saturation 0.45. The author is fixing the box; the integrator's ledger merge (fbe29f2), lock-test edit (ace1ba7, in review) and patch retirement (5ecf662) are on wp/P0-10 | a992babc | wp/P0-10 | 9 / 5209 |
| P0-10b | Furniture: texture diet and review follow-ups | furniture | P0-10 | after #19: at most 3 MB of baked maps for the 1F pieces, at most 40 KB per map at the streaming floor, right-sized atlases, ETC1S occlusion, shared damage-variant maps; the damaged window from outside, the rack and shelf metal, hidden faces; the door re-checked against t035 after the exterior lighting | a992babc | | 9 / 5209 |
| P0-14b | Interface pass 2 (before the tech spike) | architect | P0-10, P0-11 | merged | 831eaea5 | wp/P0-14b | 15 / 5215 |
| P0-13 | Apartment shell and baked lightmaps | environment | Blender, P0-04, P0-04b, P0-05, P0-14 | #17 blocked after the integrator re-baked on the library of #15 (cb45d27): `wall_tile_kitchen` can't reach 0.72 (0.7049 at white). The author is redefining it as ART.md does (the tile face against 0.75, grout 0.30-0.45). Re-bakes again after P0-04e | 023521e9 | wp/P0-13 | 13 / 5213 |
| P0-12 | Icon rig spike | icons | Blender, P0-05, P0-14 | merged | 63987275 | wp/P0-12 | 11 / 5211 |
| P0-11 | Quality rubric, art metrics and ledgers | architect | P0-01, P0-04, P0-14 | merged (#13, with P0-11c) | 1519b40a | wp/P0-11 | 12 / 5212 |
| P0-11c | Quality tools: final fixes (checker repetition, text on gravel, impossible bands, pair shots, verified approvers, frozen list, signoff phase) | architect | P0-11 | merged (#13) with the quality-standards reviewer's sign-off (11 baselines with the new streets capture `d456ec27…`, 37 band lines, BUG-0056 closure), without the seed-devspeed patch | 1519b40a | wp/P0-11 | 12 / 5212 |
| P0-11d | Quality tools before the freeze | architect | P0-11 | return 1 done at e206af3 (exact repeats, alpha cards, atomic asset-lock, signature entries, the P0 budgets plan, the machine lock); the reviewer returned two dropped alpha cases, the stand-in wording and the lockf-unavailable path (return 2 running). Queued before the freeze: the fullQuality and first-interactive ruling in tools/budgets; a signed rootCause correction (rootCauseHistory); FAMILY_BANDS from ART.md §7.2 | 1519b40a | wp/P0-11d | 12 / 5212 |
| P0-05c | Material library: no self-copied tiles | materials | P0-05b | merged (#15) | 9f6f9c1f | wp/P0-05c | 16 / 5216 |
| P0-05d | Material library to the P0-04d/e rulings | materials | P0-04d, P0-04e | to cut after P0-04e: concrete as the interior slab plus a new exterior concrete, cardboard, soil, rubber, plastic, wood floor, laminate and fabric bands; reword the Paper005 notes; the blender temp-path patch lands via P0-11d | 9f6f9c1f | | 16 / 5216 |
| P0-09d | Character: texel density check; walk wrists | characters | P0-09 | merged (#14) | aa08f3f3 | wp/P0-09d | 5 / 5205 |
| P0-09e | Character: hair cards to 512 px/m +-10%, then the P0-04e re-tint (neutral hoodie, white soles, decal) | characters | P0-09d, P0-11d | running (hair re-map) | aa08f3f3 | wp/P0-09e | 5 / 5205 |
| P0-07-a | UI style tile and docs/UI.md, builder A (best-of-2) | UI | P0-01, P0-04, P0-12 | not picked (the reviewer chose B and folded A's best parts into it); branch kept for reference | 0a429d59 | wp/P0-07-a | 17 / 5217 |
| P0-07-b | UI style tile and docs/UI.md, builder B (best-of-2) | UI | P0-01, P0-04, P0-12 | merged (#18) | cdddd183 | wp/P0-07-b | 18 / 5218 |
| P0-08 | Tech spike room in three.js | render | P0-01, P0-04, P0-05, P0-09, P0-10, P0-13, P0-14, P0-14b | return 2 done at 2663171 (lamps from the view's power facts, TV dark, R3 reveal, ART paragraphs, LUT manifest); Bugbot clean; the spike reviewer checks returns 2 and 3 at the end of P0-08b | decbb519 | wp/P0-08 | 19 / 5219 |
| P0-08b | Spike: LAMPS re-calibration and re-capture on the re-derived ART.md and re-baked shell | render | P0-08, P0-04e, P0-13 re-bake | part A done at 8b9cecf (29 zombie stand-ins, storm, the three P0 budget scenarios: frame time, draw calls and GPU memory in budget; cold first-interactive 21.3 s against 8 s); A2 at 8090c1e (grey cards: up-to-vertical 1.65 by day; loading plan); A3 running (progressive loading to the first-interactive ruling). Part B after P0-04e and the shell re-bake | decbb519 | wp/P0-08 | 19 / 5219 |
| P0-14c | View fields for the renderer (home, power, lights switched off, entity motion) and `tint.presetUse` | architect | P0-08 | merged (#16) | 831eaea5 | wp/P0-14c | 21 / 5221 |
| P0-14d | View facts: weather and stable entity ids; `stats().streaming` queued | architect | P0-14c | running | 831eaea5 | wp/P0-14d | 24 / 5224 |
| P0-15 | Balance: scavenging and the forager's horde nights (BUG-0057, BUG-0058) | sim and balance (fresh) | P0-11 | APPROVED at 9f09378 (the quality-standards reviewer; Bugbot clean): 23 of 26 bands, the six forager failures down to three (Hard horde, Hard gain, Out of Ammo gain); merge #21 | 22b3b4ba | wp/P0-15 | 22 / 5222 |
| P0-15b | Balance: the three Hard and Out of Ammo bands | sim and balance | P0-15 | running (analysis and proposals in scratch); the reviewer pre-approved "rest to full stamina before a warned horde"; fallback: the architect's documented site-combat economy | 22b3b4ba | wp/P0-15 | 22 / 5222 |
| INT | Integrator (merge queue) | integrator | any finished branch | standing | 0f6c2113 | | |

## Merge log

| # | WP | Branch | Conflicts | Result |
| --- | --- | --- | --- | --- |
| 1 | P0-01 | wp/P0-01 | none | merged `afff849` (4 hook commits: docs, action-id fix + 3 tests, endings import, lint cleanup); 437 tests; quick gate 9 pass / 6 pending |
| 2 | P0-02 | wp/P0-02 | none | merged `ca522eb` after one review return (sandbag counter); hook patch 123 edits / 32 files; keys-audit in the quick gate (325 keys, 0 problems); 453 tests; quick gate 10 pass / 5 pending |
| 3 | P0-05 | wp/P0-05 | none | squash-merged `ebc8b5b` after one review return (skipped contract check); hooks `c0066f9` (LFS for `docs/art/`), `d122ff6` (ledgers; fragments removed), `954d0d2` (ESLint ignores `.venv`), `ccd2967` (npm scripts), `36b2938` (MIN_TESTS 619; asset-lock waits on P0-14); 66 of 66 LFS-pattern blobs are pointers; restore from scratch 19/19 sources in 23 s; build ships only `assets/materials/`. One secret-scanner override on the squash commit (public hashes, licence prose). The review of `d122ff6` found the lock's `wp` check narrowed to the materials (and credits matched across the whole file); fixed in `46d141f` (exactly P0-05's 19 sources; its own `CREDITS.md` section), re-review clean; 619 tests |
| 4 | P0-14 | wp/P0-14 | none | rebased and fast-forwarded to `7f753f6`; hooks `49e4450` (material library gains rebuild recipe and digests), `2fb2ce1` (`npm run asset-lock`), `e0d8847` (negative control renames the digest key with the path; re-review clean), `ef34818` (gate title, MIN_TESTS 632; `gate-entry.patch` superseded by `36b2938`); asset-lock passes on master (seeded sample `materials/plaster_painted`, min SSIM 1.0000, 31–38 s); a scratch build reproduces `library.json` and all 49 KTX2 files; 632 tests; gate 11 passing, 4 pending (coverage, visual, art-metrics, budgets) |
| 5 | P0-04 | wp/P0-04 | none | squash-merged `4f711cd` after one art-review return (lamps, rig anchors, bake rules, zoom) and approval; 137 JPEG/PNG paths as LFS pointers; hooks `ef25682` (`look.js` vfovMin 40 → 50), `91f1ea2` (contract test golden values; review found its ART.md comparison still behind `if (existsSync(…))`, fix routed), `9de7924` (gate `targets` check: reference hashes, LUT, scene cache; offline, quick tier, 2.1 s); build ships neither `assets/targets/` nor `docs/`; gate 12 passing, 4 pending. Follow-up `443105e` makes the ART.md comparison unconditional (re-review clean) |
| 6 | P0-06 | wp/P0-06 | none | squash-merged `d998e9d` after one return (a conditional contract check) and the rebuild-contract follow-up; 84 audio files as LFS pointers; hooks `63a84c8` (ledgers: 43 sources, 385 files, 3 Sonniss attempts; the lane's `readLock()` falls back to its ledger entries; review found the fallback returns an empty list silently; fixed in `19e6c0f`, which throws with no lane entries and treats differing files for an id as a lock conflict, with 5 tests in `9bcc9f6`), `a83d307` (audio test reads P0-06's ledger entries), `5c41c46` and `18b9ac8` (MIN_TESTS 648), `d23d065` (`npm run audio`); all integrator edits re-reviewed clean; fetch verifies 62/62 sources; seeded asset-lock sampled two audio assets at SSIM 1.0000; the build ships `assets/audio/` |
| 7 | P0-04b | wp/P0-04b | none | rebased and fast-forwarded to `3b1c8e8` after one return (script traceability); contracts smoke and `targets` pass; regenerated outputs spot-checked against the scripts |
| 9 | P0-14b | wp/P0-14b | none | rebased and fast-forwarded to `879950d`; hooks `c84f6dc` (`hpRatio` in `src/ui/view.js`; renderer gets per-frame copies, UI writes go through `uid` to the live piece) and `42f37d1` (MIN_TESTS 663); the furniture field patch left for P0-10 to adopt; at P0-11's merge drop its `render-stats.patch`; 663 tests, 14 e2e smoke, asset-lock SSIM 1.0000 |
| 12 | P0-09 + P0-09c | wp/P0-09 | none | squash-merged `6ed9c56` after two returns and a split (outfit from the coordinator's spec error, run, stance, hair, hood); hooks `60d66af` (mp4 in LFS, also in the gate's lfs check), `b2201c4` (MakeHuman and Blender extension hosts allowed), `71182ee` (7 sources into the ledger with `usedMembers`/`extractTo`), `99386e0` (character test reads WP-P0-09's ledger entries; re-review clean), `5bc0cab` (MIN_TESTS 818); `characters/wage` re-bakes at SSIM 1.0000; 74/74 sources verify; build ships `assets/characters/` |
| 11 | P0-03 + P0-03c | wp/P0-03c | none | rebased and fast-forwarded (11 commits); hooks `f1a1081` (gate-phase patch: every check gets the phase, `--final` at least P3; a P3 signoff fails below 100%), `afb37e5` (20 FEATURES rows reopened as 🟨 with their gaps; ledger 159 done / 20 partial), `a350534` (MIN_TESTS 807), `51ce211` (`npm run coverage`), `1e58401` (the CLI no longer truncates its report through a pipe; reviewed clean). Coverage at P0: 66% (report only); the current tracer may over-credit achievements until P0-03d |
| 10 | P0-05b | wp/P0-05b | none | rebased and fast-forwarded to `280f482`; hooks `665a8d1` (5 new CC0 sources into the ledger), `109b9bb` (materials test reads P0-05b's ledger entries; review pending), `91848a2` (library rebuild byte-identical, fragment dropped from recipe inputs), `395914b` (icons/2115 re-baked against the new library), `6a1ac9f` (MIN_TESTS 760); `asset-lock --all`: 63 assets, 196 files, byte-identical |
| 8 | P0-12 | wp/P0-12 | none | rebased and fast-forwarded to `6b365a1` after one art-review return and one Bugbot fix; 130 icon images as LFS pointers; hooks `c8c94a1` (ledger: no new sources, icon uses added to two P0-05 sources' `usedFor`; credits section) and `fef41d3` (MIN_TESTS 662); asset-lock sampled an icon, an audio file and a material at SSIM 1.0000; build ships `assets/icons/`. Second clean wave: concurrency 5 |
| 13 | P0-11 + P0-11c | wp/P0-11 via `int/P0-11-merge` | none | squash-merged: `7d01e38` (LFS for the visual baselines), `ddb3fae` (squash of `d4c3f8c`), `fdd6fd3` (gate patch: MIN_TESTS 876; balance, ledgers, rubric and release checks), `1333c69` (the quality-standards reviewer's written sign-off: 11 baselines with streets at `d456ec27…`, 37 band lines, BUG-0056 wontfix). Blocked once: a reviewer id in the P0-11c table row made the roster parser count the reviewer as a builder (the coordinator's wording; row fixed in `8920432`, parser fix in P0-11d). seed-devspeed held back. 876 tests; quick gate passes; full gate 16 passed, 3 failed (known, below), release skipped |
| 14 | P0-09d | wp/P0-09d | none | rebased and fast-forwarded to `d32c84e` (walk wrists smoothed); no hooks; 876 tests; full gate unchanged |
| 15 | P0-05c | wp/P0-05c | none | rebased (`ac71cd7`, `44e2e2b`, `893f934`); hooks `aaafd30` (Paper004 into the ledger and credits), `a18c6a9` (materials test reads WP-P0-05c's ledger entries; reviewed clean), `d736233` (library rebuild, byte-identical but for the recipe inputs), `a28ee6c` (icons/2115 re-baked), `26e6cfd` (MIN_TESTS 941); Paper005 kept (prose notes in `graph.json` and `library.json` still name it). Full gate: art-metrics 38 → 25 failing rows (the 13 self-copied tiles gone), nothing added |
| 16 | P0-14c | wp/P0-14c | none | rebased and fast-forwarded (`5d7749e`); hook `a2185c8` (view-scene-facts.patch: home, powered, lightsPowered, lightsSwitchedOff, entity motion); 941 tests; full gate rows unchanged |
| 18 | P0-07-b | wp/P0-07-b | none | `479c4c6` (LFS for pages/**/*.jpg and *.png), squash `4a03a90` (renormalized), `2c17198` (the production build takes only index.html; the dev pages stay out of dist); full gate rows unchanged |

## Reviewers

Approvals (visual baselines, balance band lines, bug closures) are valid only from these ids; builders and the
integrator never approve their own work. `integrator` is valid only on the integrator's merge commits.

- **Reviewers:**
  - 0340a9c5 (art: ART.md, shell)
  - 1db045c3 (art: character)
  - c64ee948 (art: icons)
  - 9ce32616 (art: furniture)
  - 72d20848 (quality standards)
  - 5efe27ec (coverage audit)
  - 32e4785f (UI best-of-2)
  - a9d28435 (art and rendering: tech spike)
  - 526d1488 (the working session, Claude: approvals delegated by the project owner on 2026-09-23; the reason of each approval says so)

Reviewer ids appear only in this list and the notes, never in a table row; the quality tools' roster parser treats
any id in a table row as a builder (fix queued in P0-11d).
- **Builders (never approvers):** 831eaea5, bca371f0, 7dec1733, c4b4173e, 30cda1ad, 9f6f9c1f, f0be15b5, aa08f3f3,
  a992babc, 023521e9, 63987275, 1519b40a, 0a429d59, cdddd183, decbb519, 3945c934, 22b3b4ba.
- **Integrator:** 0f6c2113.

Approvals are recorded only after the reviewer signs: builders leave `approvedBy` empty, and the integrator fills it
from the reviewer's written verdict at merge (`--by review:<id>`). No tool can tell agents apart (they all commit as
one git user), so the checks guard against honest mistakes and keep approvals traceable, not against forgery.

## Notes
- **Full-gate known failures at `26e6cfd`** (they block the P0 sign-off, not merges; a merge may not add to them):
  - art-metrics, 25 rows: 3 character texel-density rows (fixed on wp/P0-11d: skinned meshes were measured in bind
    pose); 21 unbanded albedo and roughness rows (P0-04d's bands, then FAMILY_BANDS); 1 content row, the apartment
    shell (P0-13, merge #17).
  - budgets: draw calls and GPU memory unmeasured, since the Canvas renderer has no `stats()` and is P0's default
    (the P0 definition is with the quality-standards reviewer; the three.js renderer comes with P0-08).
  - balance: 6 forager bands (BUG-0057, BUG-0058; P0-15).
- **Bugbot reviews of branches:** these worktrees have no remote, so Bugbot can't compute branch diffs, and the
  natural-language change descriptions must name every file by its absolute worktree path. One run whose
  description gave relative paths read master instead of the branch (the tracer's old code) and reported findings
  that didn't apply.
- **Paper005:** nothing uses it since cardboard moved to Paper004, but prose notes in `tools/materials/graph.json`
  and `assets/materials/library.json` still name it. The materials lane rewords them, then the integrator retires it
  (ledger entry, credits section, `LOCKED_IDS`).
- **For the art director before the freeze (from P0-11d):** patternM period ranges, all proposed because ART.md
  states none: checker 0.1–1 m, ceramic tile 0.05–1, wood floor 0.05–2, brick 0.05–1, wallpaper 0.1–0.64, printed
  fabric 0.05–0.64, rattan 0.01–0.1, with at least 4 periods per tile side. Alpha cards: coverage within 0.85–1.25 of
  level 0 down to 16 px, cards at most 25% of a material.
- **Art director, more (from the shell and spike re-checks):**
  - the shell's concrete slots use the cement material as a stand-in until the concrete band is ruled; then they
    switch back;
  - whether window and door frames stand above the cut walls (the shell's declared convention) or are cut with them;
  - the TV screen's lit look (a dim, textured picture; the spike keeps it off until then);
  - the renderer's paragraphs for §6, §4.5, §4.3 and §5.2 come with P0-08's return, corrected by the spike
    reviewer.
- **From UI builder A (P1 inputs):**
  - config names that differ from the source's Steam names: 2105 Beef Noodles, 2127 Fuji Apple, 2117 Marinated
    Eggs, 2118 Whole Milk, 2121 Protein Powder ($200, 3×3), 2101 Hardtack, "(Average)" for "(Normal)", 【完美】;
  - the backpack is 10×6 at 20 kg in the sim but 8×7 at 9.6 kg in the source (ss_01, shot_36), to be verified as a
    parity gap;
  - the source dims the HUD about 28% under station windows;
  - ART.md §8 corrections for the art director: `--ui-buy` is the hovered Buy (rest #5d833b); the overweight bar
    core is #c93b26; panel opacity is 0.93 on #191b19; the objective token is only the "Complete Preparations" label;
    HUD labels are 20 px; the heading is 30.8 px.
- **P0-04e, the art director's re-derivations from the spike review:**
  - **Sun and moon azimuths:** re-fit them from cast shadows in t032 and t059. ART's azimuth 15° puts the building's shadow toward the camera, which blackens the foreground. Set a minimum fill for camera-facing outside faces, caps and the near site.
  - **LAMPS anchor:** in t033 the table lamp is switched OFF, so the 46.5-code wall is night ambient, not NIGHT + LAMPS. Re-derive the wall lamp as a near-neutral wall-wash from t033's lit downlight. Re-derive NIGHT so the lit home reads 46.5 on plaster with lamps near weight 1, and re-derive the DUSK split.
  - **Dusk:** re-derive the sun colour, elevation and direction against ss_04's grey dusk, checked through AgX.
  - **Clothing:** neutral charcoal albedo for the survivor (the white-balanced #8294a8 reads blue), and white shoe soles.
  - **Character decal:** size a character contact decal.
  - **Dawn:** key shadows at dawn, with a wide penumbra.
  - **Record the renderer's deviations:** bloom excess-only, the shader emitter depth test, PCFShadowMap, the LUT re-fit waiver.
  - **Later:** re-judge the vignette after the foreground fix.
  - The shell re-bakes after this; the spike re-calibrates LAMPS without the ×39.7; the character re-tints.
- **Art director's queue (after P0-04d):**
  - record rulings R1–R3 below;
  - decide how the source counts days, so the Day-1 side-by-side pairs (roof, storeroom day and dusk) can assert the
    phase;
  - decide whether the wall lamps need a diffuse component.
- **Art rulings from the shell review (for the art director to record in ART.md §4.4):**
  - R1: the floors above and the roof block the key light only; sky and bounce light rooms from above. A decided look
    model matching the source's evenly top-lit interiors.
  - R2: zone normalisation, with the room factor inside the building and physical light outside.
  - R3: no sun or moon patches indoors at any time; key-light blockers in window openings and doorways, at runtime
    and in the bake.
  - Also: lamps add only about 0.01 of light at weight 1 against 0.040, so P0-08's calibration needs about ×4. The
    wall-lamp geometry may need a diffuse component.
- **three.js constraints for P0-08:** one `lightMap` per material (UV set 1), so blending the nine channels needs a
  custom shader; `LightProbe` is one global SH, so the 318 probes need interpolation.

- Lane folders `docs/art/<lane>/` belong to their lanes; `docs/art/` itself (reference boards) to P0-04.
- Frozen by P0-14 (on master): the material binding (`AssetEntry.materials`, `bindings[cfgId].materials`, `resolveMaterials()`, `instanceSeed()`), the rebuild contract (named `rebuild` recipes; per-entry recipe and SHA-256 `digests`), the look constants (`src/contracts/look.js`), shared `tools/lib/ssim.mjs` and `tools/lib/png.mjs`. The asset-lock check fails any shipped file without a recipe and digests.
- P0-04's review may change `vfovMin` (40° breaks 256 px/m; the native evidence stops near 50°): its merge carries a `src/contracts/look.js` hook, and P0-14's contract test keeps look.js and ART.md in step.
- New keys (counters, tags, flags, events, storage) need a `src/contracts/keys.js` entry: builders list them under `keysAdded`, the integrator declares them.
- P0-04 hooks for its merge: LFS for `docs/art/**` images (done at merge #3); a gate check running `tools/targets/fetch-targets.mjs --verify` and `tools/targets/validate-lut.mjs`; confirm the build leaves out `assets/targets/` (already in `UNSHIPPED_ASSET_DIRS`). Its camera-constants request went to P0-14, the LUT shipping and re-fit to P0-08, the UI tokens to P0-07.
- `research/store_appdetails.json`, `research/steam_news.json`, `research/*.html` and `research/datavw/` are git-ignored, so worktrees lack them: read them from `/Users/bwang/SurvivalLogs/research/`.
- The action-id collision fix (merge #1) goes into `docs/bugs.jsonl` when P0-11 creates it.
- P0-04, P0-06 and P0-09 were cut before `.gitattributes`: the integrator squash-merges them with `git add --renormalize .` (WP-INT step 5) so master's history holds no plain binaries.
- Follow-ups to cut:
  - **P0-05b (materials), more:** new library materials the furniture lane lacked (plastic, bark, soil, newsprint, rattan), then the furniture lane rebinds those parts (the TV and radio housings are painted metal until then); the seed bug above.
  - **P0-10 merge hooks:** merge its fragments (4 Poly Haven sources, 22 files); drop `assets/lock/` from its two recipe inputs; its lock test reads WP-P0-10's ledger entries at least as strictly (an integrator test edit, reviewed); MIN_TESTS to the post-merge count; optional `furniture:build` / `furniture:renders` scripts.
  - **P1 (from P0-10):** shelf fill-level variants (Config FurnitureState 100, six states) for 10001, 10002 and the configs sharing them; LODs for the variants.
  - **P0-05b (materials):** re-calibrate `tools/materials/bands.json` and `targets.json` to `docs/ART.md` (bands and roughness §7.2, texel density §3) and rebuild once P0-04 merges; detail maps for fabric, leather and cardboard; reword the `tools/fetch-assets.mjs` header (the gate calls `tools/asset-lock.mjs`); drop `assets/lock/` from the materials recipe inputs (the folder is gone after ledger merges); add `ogg|wav|flac` to `UNPACK_EXT` (P0-06); `tools/bin/install-ktx.sh` is macOS-only (Linux later).
  - **Architect, next interface pass:** remove the applied patches in `tools/asset-lock/hooks/`; document the audio manifest params (bus, spatial, loop, space, pitchCents, gainDb, noRepeat, maxVoices, cooldown, barSeconds, loopEndSample) as the runtime audio convention (P0-06).
  - **Character follow-ups (from the approval):** a rank-based seam test (per bone, the wrap key's angular
    acceleration at native key times must not exceed that bone's maximum at the other keys; warn above 1.25× its p90;
    ignore bones that barely move); smooth the walk's noisy CMU wrist data (a 590°/s snap, about 1 px at game zoom);
    re-check probe lighting and contact shadows when P0-08 lands.
  - **P0-09b (characters):** a run clip if P0-08's speed policy needs one (the sim moves 5 m/s of real time, the walk clip 1.18 m/s), then turn in place, pick-up and crouch-work clips; LODs (about 6k and 2k triangles); the shoulder fold; the College Student and Warehouse Manager on the same pipeline (P1).
  - **Architect, next interface pass (more):** `tools/asset-lock/render_mesh.py` drops `KHR_texture_basisu` from `extensionsRequired` before importing (P0-09).
  - **Integrator at the P0-09 merge:** add `files.makehumancommunity.org`, `files2.makehumancommunity.org` and `extensions.blender.org` to `tools/fetch-assets.mjs` `ALLOWED_HOSTS` (a fresh clone must re-download P0-09's archives); drop the duplicate `.gitattributes` in `assets/characters/` and `docs/art/characters/`.
  - About 20 achievement-read counters need `COUNTER_LABELS` entries (from P0-02).
- P0-03 merge hooks: the gate passes the phase to the coverage tool (`--phase`, from STATUS or `GATE_PHASE` on `--signoff P<n>`), without which coverage could never fail, even at P3; reopen FEATURES rows C10, D06, F04, G01, G03, G04, G05, H02, I02, O01, P16, Q05, S03, T01, T02; optional `npm run coverage`.
- Coverage gaps from P0-03 (80.6% at P0) become `docs/bugs.jsonl` entries once P0-11 creates it, and P1/P2 packages: the neighbour's 299 "Her …" return dishes; 111 dish quality variants; 13 recipes that don't fit the 6×4 pot; recipe 6002 made as another dish; 23 unreachable Fail outputs; burnable story documents stoves refuse; keepsakes with no use; unobtainable books, notes, foods and items; crafting failure salvage; Boston Ivy never withering; 44 funcs without a spec and 257 without a completing test; 5 achievements no test earns; `furnitureFunctions` hiding the College Student's basket button 2121 behind hidden 2116; the unreachable veteran fixture 42013; `src/meta/endless.js` importing UI code.
- Coverage scope (from the P0-03 audit): every non-dev furniture row is in scope, read from the config, not from what our content places. About 880 of the 923 pieces P0-03 excluded are placed or handed out by the original (workbenches, basement and stair unlocks, home fixtures, school and hospital loot containers, shop fixtures, site obstacles), so by P3 roughly 1,150 furniture entries must be placed, working and rendered (own model or family model plus variant). `src/content/homes.js` stands in string placeholders (`workbench`, `radio`, `newspapers`, `rubble`, `woodDoor`, `woodWindow`) for config pieces; P1 replaces them with config ids.
- P0-11 hooks (patches in `tools/visual/hooks/`): `seed-devspeed.patch` gives `src/game.js` the `?seed=` and `?devSpeed=1–8` parameters the playtest protocol allows (BUG-0026), with the visual baselines re-approved in the same merge with a logged reason; `render-stats.patch` adds an optional `Renderer.stats(): { drawCalls, triangles, gpuBytes }` to `src/contracts/render.js`, which WP-P0-08 must implement or the budgets check stays failing; `gate-and-config.patch` raises MIN_TESTS, adds a full-tier `balance` check, puts `tests/visual/baselines/*.png` in LFS and adds npm scripts. `docs/bugs.jsonl` now exists with 28 entries (BUG-0001 is merge #1's action-id fix; BUG-0002 to BUG-0025 are P0-03's findings).
- P0-11's measurements on lane branches: P0-10's TV atlas reads 181 px/m (−29%), four workbench islands +17%, the medium shelf 0.104% back-facing normals (limit 0.1%); the material library misses 29 checks (texel density 2× on all 16, five albedo and five roughness bands, three tints) for P0-05b.
- P0-03 merge hooks (after re-review): apply `docs/coverage/gate-phase.patch` (the gate passes its phase to every check; `--final` counts as at least P3; `tests/gate-coverage.test.js` proves a P3 signoff fails below 100%); reopen FEATURES rows C10, D06, E04, E08, F01, F03, F04, G01, G03, G04, G05, H02, I02, N01, N02, O01, P16, Q05, S03, T02; MIN_TESTS to the post-merge count.
- Fonts (decided at checkpoint 1): SIL OFL 1.1 fonts are an allowed source. The UI is set in Noto Sans (Latin, 29 KB) and Noto Sans SC (Chinese, subset to the 2,256 characters the game shows, 632 KB), variable weight 400–700 WOFF2 in `assets/fonts/` with OFL.txt beside each, built by `tools/fonts/build.sh` from the locked Google Fonts TTFs; the system stacks stay as fallbacks (docs/UI.md §3.2). When strings add Chinese characters, `tools/fonts/build.sh --collect` then `tools/fonts/build.sh` (tests/fonts.test.js fails until then). Icon lettering may now use these faces.
- English names: `src/data` English names were machine-translated from the config and sometimes differ from the source's Steam English ("Braised Beef Instant Noodles" vs "Beef Noodles", "Compressed Biscuits (90)" vs "Hardtack", "(Normal)" vs "(Average)"). The source's texts stay, so P1's writing pass maps names to the source's where it shows them.
- Icon follow-ups (from the approved re-review): darks lighter than the source's (L* p10 38 vs 20), revisit with the checkpoint-1 lighting pass; planks, sack and packet move to the library pine, hessian and cardboard after P0-05b; lettering can use the Noto faces now (fonts decided) and waits on the source's English names. The icon box (fill 0.66, baked shadow 3% / σ 2% / 0.3) is in each entry's `params.box` for the UI tile.
- P0-12 hooks: merge its fragments (no new sources; add the icon uses to `usedFor` of `polyhaven/studio_small_09@2k` and `ambientcg/Metal009@2K-PNG`); MIN_TESTS to the post-merge count.
- **Material seed bug (from P0-12, for P0-05b):** `tools/blender/materials/library.py` renders black in Cycles when an object's seed exceeds about 2²⁰, while `instanceSeed()` returns up to 2³²−1. Fix: store `frac(seed × φ)` computed in Python, state "mod 1" in `library.conventions.variation`, and wrap it in the runtime shader (P0-08). P0-10 and P0-13 may meet it in Blender until then.
- P0-09 hooks at its merge: `docs/art/**/*.mp4` into LFS; apply `tools/blender/characters/hooks/render_mesh-basisu.patch` to `tools/asset-lock/render_mesh.py` (strips `KHR_texture_basisu` from `extensionsRequired` before import; the glb now requires it, and asset-lock fails without the patch; P0-14b skips its own version if this lands first); `ALLOWED_HOSTS` gains `files.makehumancommunity.org`, `files2.makehumancommunity.org`, `extensions.blender.org`; merge its fragments; MIN_TESTS.
- Locomotion (decided): the run is CMU 16_46 (4.42 m/s, 2.95 m stride, trunk 15° forward), played stride-matched at 1.13× at the sim's 5 m/s with no clamp. Cadence there is 204 steps/min against the 190 the coordinator set. No clean CMU run on this character has the 3.16 m stride 190 needs, so 204 is accepted as a documented limitation; show it at checkpoint 1. Movables are lit by the hemisphere alone in P0-09's preview, so the hoodie reads 38 against the source's 45–50; P0-08's light probes should close that.
- **Openings:** frames, thresholds and sills belong to the shell (P0-13's manifest says so, and the coordinator confirmed it in WP-P0-10); the door and window furniture ship only the moving and state-changing parts, sized to the clear opening. P0-14b's `opening` field describes the clear opening.
- **From P0-05b:**
  - The art director confirms or replaces the bands P0-05b derived for families ART.md §7.2 lacks: grout roughness, concrete, leather, laminate, rubber, cardboard, plastic, bark, soil, newsprint, rattan. This is P0-04d, after P0-04c, and must land before P0-11's rework merges, since unbanded families now fail art metrics. P0-11 takes the numbers from `tools/materials/hooks/art-metrics-family-bands.patch` or from ART.md.
  - Brass and copper are gone from brushed steel (a steel tint can't reach their F0 of 0.72–0.78). P0-13's lamp must use `steel` or `aluminium`; after P0-05b's fix an unknown preset fails loudly.
  - P0-10 and P0-12 can drop their seed caps.
  - P0-08 implements `library.conventions.variation` (offset `frac(seed × φ)` in float64, passed wrapped as a uniform) and `conventions.detail` (whiteout blend, faded by distance).
  - Dependents to re-bake at the P0-05b merge: icons/2115 (the tin; SSIM 0.9947 against the new library); P0-10 and P0-13 re-bake on their own branches before they merge.
- **Library changes invalidate dependents:** any shipped asset whose rebuild recipe takes library files as input (the tin icon, furniture bakes, shell lightmaps) goes stale when the library changes. At the P0-05b merge the integrator re-bakes them through their recipes (`asset-lock --all` names them) and commits the new outputs and digests.
- P1 backlog (from P0-06): a runtime audio engine over the manifest (families, variant rules, bar-synced layers, crisis loops) replacing the synthesized audio in `src/engine/audio.js`; per-home music (two alternating Warehouse Manager tracks, per the patch notes); explore and death cues, generator start/stop, chainsaw and electric-net loops with voice limits.
- Checkpoint 1 listening notes (from P0-06): audio was checked by measurement only; ask the user to judge the synthesized zombie voices, the horde crowd and the night mix balance first.
