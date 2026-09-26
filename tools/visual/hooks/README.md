# WP-P0-11 hook patches

Changes to shared files that WP-P0-11 needs, as patches for the integrator (`git apply tools/visual/hooks/<name>`).
Each applies cleanly to master at 5bc0cab.

| patch | files | what | after applying |
| --- | --- | --- | --- |
| `seed-devspeed.patch` | `src/game.js` | `?seed=<integer>` seeds every new run that names no seed; `?devSpeed=<1–8>` multiplies the game speed (docs/playtests/README.md; the ?seed= bug in docs/bugs.jsonl) | The visual shots pass `?seed=`, so their runs change: re-approve with `node tools/visual/run.mjs --approve all --reason "the game reads ?seed= (hook seed-devspeed)" --by integrator` in the same merge, and close the bug with the merge commit. |
| `gate-and-config.patch` | `tools/gate/checks.mjs`, `tools/gate.mjs`, `tests/gate-quality.test.js` (new), `.gitattributes`, `package.json` | `MIN_TESTS` 818 → 876. The WP-P0-11 checks take the phase the run is judged by (`gatePhase`, the mechanism WP-P0-03c's patch added) as `--phase`: `art-metrics` (the phase's content), `budgets` (the shipping renderer), and four new checks: `balance` (full tier: `tools/balance/run.mjs --seeds 50 --out - --json`), `ledgers` (quick tier: `check.mjs ledgers`), `rubric` (required from P1: `check.mjs rubric`) and `release` (required from P5, `finalOnly`, judged at P5 at least). `tools/gate.mjs` skips a `finalOnly` check outside `--final` and its signoff. `tests/gate-quality.test.js`: `--signoff P1` with STATUS.md at P0 judges P1. LFS for `tests/visual/baselines/*.png` (beside master's mp4 pattern); npm scripts `art-metrics`, `visual`, `budgets`, `balance`. | Squash-merge with `git add --renormalize .` so the baselines go into LFS. |

## Before the merge: record the reviewer's verdict

Approvals are checked against the `## Reviewers` registry of **master's** docs/wp/STATUS.md; only `review:<id>` of
a listed reviewer counts (`integrator` is no approver). The reviewer (72d20848) signed all 11 baselines, all 37 band
lines and the BUG-0056 closure; the integrator records that verdict on the branch before the merge:

```sh
node tools/visual/run.mjs --sign --by review:72d20848
node tools/balance/check.mjs sign-bands --by review:72d20848
# docs/bugs.jsonl: BUG-0056 "status": "wontfix", "approvedBy": "review:72d20848" (the ratified closure)
```

`wage-site-streets` needs a new baseline: the old one was captured while the harness advanced the game clock per
failed poll (BUG-0060); with the deterministic capture it repeats byte for byte but differs in the toast area
(SSIM 0.9671). Its re-approval (`--approve wage-site-streets --reason "…" --by review:<id>`) waits for the reviewer.

## Dropped

`render-stats.patch` (an optional `Renderer.stats()`): master has it since 879950d (WP-P0-14b, with `gpuBytes`
defined). The budgets tool samples it every frame; the Canvas renderer, the P0 default, has none, so draw calls and
GPU memory stay unmeasured until the three.js renderer is the default.
