# WP-P0-03d — Achievement credit integrity (the coverage tracer)

**Role:** architect (a fresh agent; split off after P0-03c's second failed return). **Phase:** P0.
**Depends on:** WP-P0-03 + WP-P0-03c (merged). The coverage tool freezes after P0, so this lands before the P0
sign-off.

## Why
The coverage tool credits an achievement to a test in which game code awards it. Each review round found another way
for test code to forge that credit:
- counters set by hand before evaluating;
- tick once, then write;
- a state the test built itself, with no baseline;
- raw `actionDone` bus events;
- callbacks that run inside game code;
- "god mode": story-run helpers that restore stats and repair doors every ten game minutes, without which the survivor
  dies on Day 4. Eight of today's nine credits come from these.

The tracer needs an integrity model designed against all of these at once, not patched one hole at a time.

## Scope
1. **Threat model first.** Write `docs/coverage/integrity.md`, listing every way test code can influence a credited
   award, with the rule that defeats each:
   - direct writes to fields an award reads;
   - writes to causal inputs: stats, effects and maxes, furniture and door hp, inventories, the clock;
   - states or histories the test constructs or clones;
   - bus events emitted by test code;
   - callbacks and function arguments that game code runs;
   - `export const` functions and other unwrapped paths;
   - mutation through objects shared between groups.
2. **Rules:**
   - Only states that game code created (`newGame`, `loadGame`, and so on) can earn credit. A state first seen when
     entering game code is foreign and fully tainted.
   - Function and loot evidence counts only when emitted while a game-code frame is active and not inside a
     test-supplied callback.
   - Callbacks and arguments passed into game code are bracketed, and their diffs are tainted.
   - The survival-critical groups (stats, effects and maxes, furniture and door hp) join the read sets of day
     survival (Type 11), crisis (12), endings (16–18) and the crisis, horde, wave and kill counters.
3. **An adversarial fixture per rule**, plus positive fixtures showing that an autonomous run (the sim's own
   autonomy, player actions through the action API) still earns credit.
4. **The report** lists the credited achievements before and after. Expect about 1 of 93 today: honest, and
   recovered at P3 by tests that survive through play.

## Exclusive paths
`tools/coverage/trace/`, `tools/coverage/trace.mjs`, `tools/coverage/families/achievements.mjs`,
`tools/coverage/families/funcs.mjs` (the evidence rules only), `docs/coverage/integrity.md`, `tests/coverage-tool.test.js`
(add, never weaken).

## Acceptance
- Every threat in `integrity.md` has a failing fixture that the rules defeat, and a positive fixture still earns
  credit.
- `--phase P3` names only content gaps, and the self-check is empty.
- The coverage auditor approves the tool for the freeze.
