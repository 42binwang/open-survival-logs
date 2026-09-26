# WP-INT — Integrator (standing package)

**Role:** integrator — the only writer of shared files; runs the merge queue. Runs whenever a package branch is ready.

## For each finished branch `wp/<id>`
1. Rebase onto `master` (resolve conflicts; if more than trivial, stop and report).
2. Apply the package's hook requests (shared files: `src/contracts/`, config, `src/main.js`, `src/systems.js`,
   ledgers, lockfile and credits — merge `assets/lock/*.json` into `assets/sources.lock.json` and `assets/credits/*.md`
   into `assets/CREDITS.md`).
3. Run the quick gate (`npm run gate -- --quick`); it must pass. Then run the full gate (`npm run gate`) and compare
   it with master's last full-gate log (`test-results/gate/full-<sha>.log`): the merge may not add a failing check or
   a failing row. The full-gate failures already on master are listed with their owners in STATUS ("Full-gate known
   failures"); they block the phase sign-off, not merges.
4. Get a reviewer pass (the coordinator dispatches the reviewer; the integrator waits for its verdict).
5. Merge into `master` (fast-forward after the rebase), update the ledgers (`docs/FEATURES.md` rows reopened or
   closed, `docs/bugs.jsonl`), and report.
   - A branch with any commit that stores a file matching a `.gitattributes` LFS pattern as a plain blob (branches cut
     before `.gitattributes` existed: P0-04, P0-05, P0-06, P0-09) is squash-merged instead: `git merge --squash`,
     `git add --renormalize .`, then check `git lfs fsck --pointers` and that no blob in the new commit matching an
     LFS pattern is plain. The merge log records the squash. master's history never holds a plain binary.

Failures go back to the package's agent; after two failed returns the coordinator splits or reassigns the package.

Any integrator edit to a test file (to follow a moved ledger or a renamed path) gets its own reviewer pass before the
next merge, since nobody reviews their own change. The edited test must stay at least as strict: every assertion
still covers the same set or a larger one.

## Exclusive paths
All shared files listed in `docs/wp/README.md`, plus the merge itself.
