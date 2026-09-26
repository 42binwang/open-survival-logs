# WP-P0-03c — Coverage tool: final review fixes

**Role:** architect (a fresh agent; the package is split and reassigned after P0-03's second failed return).
**Phase:** P0. **Depends on:** `wp/P0-03` at `65dee21` (the reworked tool; not merged). The coverage tool freezes
after P0, so these fixes land before the P0 sign-off, and P0-03 merges together with them.

## Scope
Each fix comes with a passing and a failing fixture in `tests/coverage-tool.test.js`.
1. **Shop and site pieces classed as home.** `furnitureScope` makes any piece with a slot plus Dismantle 299 or Move
   1608 a home piece, which catches 28 shop and site fixtures: market shelves 101–113 (models `Market_01…11`, Shop
   function 6, story ids 14xx), convenience- and hardware-store shelves 9132–9146 and 80125, and 385, 390, 401, 9066.
   They can only pass `obtain` by being put in the player's home, which breaks parity. Classify a piece as site or
   shop first when its model is a shop or site scene (`Market_`, `SmallMarket`, `Tool_Store`,
   `P_Building_materials_market`, `P_NEWMaket`, `Explore_School`, `TanSuo`, and any others the config shows) or it
   offers Shop 6 or Construction Shop 53; the movable test comes after.
2. **Functions missing from the act table fail forever at shops and sites.** The trial list in `interactions.mjs`
   maps acts 1908–1913 (functions 1712–1717) but skips 1907 (1711 Try Toilet), so showroom toilet 805 always fails;
   60 functions on 105 site-class pieces are unmapped (Recycle 1764 via act 1943 on 31 hospital and school props,
   appliance on/off 1722/1723, Wash Hands 1107/203, Pick 1724, Restore Power 43). Credit a shop or site function when
   the fixture's completed action carries that function's id (`actionDone.funcKey`), keep the act table only as a
   fallback, and add 1907 and 1943.
3. **The award tracer can still be fooled.** Credit needs only that the test passed the state to `tick()` once;
   `evaluateAchievements(state, history)` is exported and pure, so hand-set counters plus one tick earn full credit.
   When a test first ticks a state, record the achievements already met on it and credit only those met later.
4. **Checks no probe can satisfy.** Loot functions nothing offers (1102, 1103, 1106, 1504, 1604) get a `loot` check
   whose failure reads "no probe can run it": skip it for unoffered functions, or credit it from any fixture carrying
   the act. Function 243 is offered only by the excluded 80000–80004: extend "offered only by development furniture"
   to all excluded furniture.
5. **Function 42 is live but excluded** by the "id below 100 no furniture offers" rule (`src/sim/story.js:830`
   force-makes the rescue marker; `src/content/funcSpecs.js:130` has `story: 'forceMark'`). Narrow the prototype rule
   or keep 42 in scope.
6. **Refresh `docs/coverage/gate-phase.patch`** against current master (`MIN_TESTS` moved from 632 to 648 and will
   move again), so the integrator can apply it with `git apply --3way`.
7. **A self-check against impossible checks:** the report lists any in-scope check that no probe or driver can ever
   run, even at full parity, as a tool problem, never as a content gap. P3 must be reachable by building the game.

## Exclusive paths
`tools/coverage.mjs`, `tools/coverage/`, `docs/coverage/`, `tests/coverage-tool.test.js`, `tests/gate-coverage.test.js`,
`tests/fixtures/gate/`.

## Read
Everything, including both audit reports summarised in `docs/wp/STATUS.md` and the P0-03 author's notes in
`docs/coverage/P0.md`.

## Acceptance
- Each fix has a passing and a failing fixture; the existing 32 coverage tests stay green and unweakened.
- `node tools/coverage.mjs --json` runs clean; `--phase P3` exits 1 and names the real gaps only; the impossible-check
  list is empty.
- The gate patch applies to master with `git apply --check --3way`.

## Deliverables
The fixes on `wp/P0-03c` (cut from `wp/P0-03`), the refreshed patch, the new per-family table, the JSON report.
