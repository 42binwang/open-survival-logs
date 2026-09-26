# AGENTS.md: how to work in this repository

Read this before your first change. It applies to every writer: a person, the coordinating session, or an agent in a
worktree. The work-package rules in [`docs/wp/README.md`](docs/wp/README.md) still apply; this file is the part every
writer needs on day one, and it wins where the two differ.

## 0. The project in one paragraph

A browser recreation of the Steam game *Survival Log* (README.md). The goal is to match the source game: its
systems, its content tables (`src/data/gen/`, from the config) and its look (`assets/targets/source/`; the Steam guides,
patch notes and achievement statistics, cited by URL). The code is MIT-licensed; the original game's material and the third-party assets keep their
own terms (README.md, License). A new asset comes only from a source whose license allows redistribution, recorded in
`assets/CREDITS.md`.

## 1. Set up a worktree

```sh
git lfs install && git lfs pull      # or, in a fresh worktree: git lfs checkout (otherwise ~350 asset tests fail)
npm ci                               # installs the hooks too (core.hooksPath = .githooks)
```

A worktree may symlink `node_modules` to the main checkout's instead of `npm ci`; never commit the link. Check
`git config core.hooksPath` prints `.githooks`.

## 2. The rules that never bend

- **Tests.** Never delete or weaken a test; no `.skip`, `.only`, `.todo`; no conditional pass (no `if (existsSync)`
  around an assertion, no early return). When a behaviour changes on purpose, change the test to the new behaviour
  and say why in the commit.
- **Randomness** goes through `src/engine/rng.js` (seeded). No `Math.random`, `Date.now` or wall-clock time in
  `src/sim`. The sim never imports render or UI code.
- **New JS files** start with `// @ts-check`. Keys (counters, tags, bus events, storage keys) are declared in
  `src/contracts/keys.js`.
- **Commit messages** end with the `Co-Authored-By:` line of the tool that wrote the change.
- **Ledgers are append-only** (`docs/bugs.jsonl`, `docs/balance/bands-log.jsonl`, `tests/visual/baselines/log.jsonl`,
  `docs/quality/*.jsonl`). On an existing bug only `status`, `fixedIn` (a commit hash), `links`, `notes` may change.
- **Never mask an exit status.** `cmd | tail` returns `tail`'s status. Read the real status (`; echo exit=$?`) or grep
  for the verdict line (`^PASS quick`) before you commit or report success.

## 3. Code coverage: 100% of new code

`tools/code-coverage.mjs` (the `code-coverage` gate check) judges the V8 coverage the `tests` check collects:

1. **Every line and branch you add or change under `src/` is run by a test** (diff against your merge base with
   master, working tree included). A new file no test loads fails.
2. **No file loses coverage** below `docs/quality/code-coverage.json`; a branch never lowers that baseline. When your
   tests raise a file's numbers, run `node tools/code-coverage.mjs --update` and commit the new baseline.
3. **Exemptions** are listed in the baseline with what covers the file instead (WebGL frame loop → visual shots,
   Web Audio → e2e). Only the integrator adds one, on master.

How to write the test:

- Test behaviour through the public path a player (or the sim) takes: `enqueue` an action and `tick`, call the
  panel's handler, build the view and the shell. Assert the outcome the player sees, not an internal field.
- A test proves its point: make it fail against the old code once (revert your fix locally, run it, restore).
- Every player-facing change needs a test of what the player sees or can do: walking, travel, menus, what renders
  where (`tests/render3d.test.js` builds every scene's shell in Node). Sim tests alone let "the survivor can walk out
  of the house" through.
- Long play-throughs (`tests/achievements-play-*.test.js`) share a 9-minute traced budget
  (`tools/coverage/trace.mjs`): keep each file under about a minute traced, and report its time.

## 4. Before you commit, before you report

```sh
npm test                                   # all green; never pipe it through tail without the exit status
PORT=<your port> npm run gate -- --quick   # must print "PASS quick"
```

- Your dev-server / e2e port is 5200 + your slot (`docs/wp/STATUS.md`) or the port your brief names. Never kill a
  server you did not start; stop your own by PID.
- Heavy or timing-sensitive jobs (balance beyond a few seeds, visual captures, budgets, bake batches) run one at a
  time under `lockf -k /tmp/survival-logs-heavy.lock <command>`.
- **Merge the current base into your branch before you report** (`git merge p1-render3d`, or master): other agents
  have landed since you started. Re-run `npm test` and the quick gate on the merged result. A branch that passes
  alone and fails together is not done.
- Run the balance bots when you touch the sim (`node tools/balance/run.mjs --seeds 10 --out -`): P0 bands hold, and
  say which moved.
- Run `node tools/visual/run.mjs` when you touch anything that renders. Look at every changed shot yourself
  (`test-results/visual/<id>/`). **Builders never approve baselines**; name the changed shots and why in your report.

## 5. Shared files and ids

- Shared files (contracts, registries, config, `tools/gate*`, ledgers, `src/main.js`) are written by the integrator;
  builders ask in their report (`hookRequests`), see `docs/wp/README.md`.
- **Bug ids**: the coordinator gives each agent a block (`BUG-0200`–`BUG-0209`) in its brief. Without a block, write
  `BUG-TODO` in your report and let the integrator number it; never guess the next free id (two agents will).
- One concern per commit; keep generated files (`docs/coverage/P0.md`, the coverage baseline) in their own commit so
  a merge conflict in them is regenerated, not hand-merged.

## 6. Match the source, not a metric

Coverage numbers (`tools/coverage.mjs`), art metrics and SSIM are guards, not the goal. Before you add content or
geometry to raise a number, check it against the source (`assets/targets/source/`, the Steam pages cited in the docs); a home twice the
source's size or a rack drawn as shop shelving is a regression even when a count goes up. Play the change in the
browser (`npm run dev`) the way a player would before you call it done.

## 7. Integrating (coordinator / integrator)

1. Merge the agent's branch with `--no-ff --no-commit`; resolve ledgers by keeping both sides (ids stay unique).
2. `npm run gate -- --quick` on the merged tree; read failing tests, fix or send the branch back with the reason.
3. Visual changes: compare old and new frames by eye, then `node tools/visual/run.mjs --approve <ids> --reason "…"
   --by review:<id>`. Balance band changes: `tools/balance/check.mjs log-bands` and `sign-bands`.
4. Commit, push the branch; the pre-push hook re-runs the quick gate. Fast-forward master only from a gated commit.
