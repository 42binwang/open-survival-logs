# Work packages

The upgrade is cut into work packages (`WP-<id>.md`). The coordinator writes and tracks them in
[`STATUS.md`](./STATUS.md); builders implement one package each in their own worktree.

## Rules for every writer

Start with [`AGENTS.md`](../../AGENTS.md) at the repository root: setup, coverage, the checks before a commit and
integration. The rules below are the work-package specifics.

- Work only in your package's **exclusive paths**. Read anything. Everything else is a **hook request** in your report.
- Shared files — interfaces (`src/contracts/`), registries (`src/contracts/keys.js`), config (`package.json`,
  `vite.config.*`, `tsconfig.json`, `eslint.config.*`, `playwright.config.*`, `.gitattributes`, `.gitignore`),
  `tools/gate.mjs`, `tools/coverage*`, `tools/keys-audit.mjs`, ledgers (`docs/FEATURES.md`, `docs/bugs.jsonl`,
  `assets/sources.lock.json`, `assets/CREDITS.md`) and `src/main.js` / `src/systems.js` — are written only by the
  architect or the integrator. Asset packages write lock and credit *fragments* (`assets/lock/<wp>.json`,
  `assets/credits/<wp>.md`) that the integrator merges.
- Branch `wp/<id>`, dev-server port `5200 + slot` (slot in `STATUS.md`), your own browser tab and Playwright run.
- Never delete or weaken a test, never add `.skip` / `.only`; log every golden-value change with its reason.
- No conditional passes. A test never passes by skipping when a file, dependency or input is missing: no
  `if (existsSync(…))` around assertions, no early return, no "print a notice and pass". If something a test needs is
  not on master yet, the test fails on your branch, and your report names the dependency so the integrator lands
  them together.
- The sim (`src/sim`) never imports render code. New JS files start with `// @ts-check`.
- Assets only from the allowed sources (CC0: Poly Haven, ambientCG, Kenney, VSCO 2 CE, VCSL, MPFB system assets; free:
  CMU mocap; royalty-free: Sonniss GDC bundles if downloadable without an account; SIL OFL 1.1: Noto fonts from the
  Google Fonts repository, decided at checkpoint 1). Pin URL, license and SHA-256 of
  every download. The image-generation tool is for concept work only; it never makes a shipped asset.
- The machine's infosec hooks (secret scanning, blocked commands) stay on. When the secret scanner blocks a commit,
  inspect every flagged string. Use its false-positive override (`--skip-secrets`) only when each one is a verified
  false positive: public file hashes, licence prose, a stock string in vendored code. Never use it for anything that
  could be a credential, token, key or personal data. List every override in your report under `followUps`, with
  what was flagged. When in doubt, stop and report.
- Every agent shares one machine (16 cores). Heavy or timing-sensitive jobs run one at a time under a shared lock:
  `lockf -k /tmp/survival-logs-heavy.lock <command>`. That covers balance runs beyond a few seeds, `asset-lock --all`
  and re-bake batches, Blender bake batches, repeated full-suite runs, and every measurement whose numbers or pixels
  get compared: visual captures, budgets, perf captures, SSIM re-bakes and review renders. Hold the lock for one
  command, not a session. Everything else runs with at most 4 parallel workers. Stop only processes you started, by
  the PID you recorded, never by name or pattern (`pkill`, `killall`).
- Commit your work on your branch. End with a JSON report:

```json
{ "wp": "WP-P0-01", "branch": "wp/P0-01", "status": "done|partial|blocked", "rows": [], "entities": [], "tests": [],
  "files": [], "hookRequests": [], "interfaceRequests": [], "keysAdded": [], "assets": [], "gaps": [], "followUps": [] }
```
