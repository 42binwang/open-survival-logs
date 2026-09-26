# Survival Log — browser edition

A browser recreation of the Steam game *Survival Log*: hoard for ten hours before the outbreak, then hold your
safehouse for a hundred days. The simulation, the content tables and both renderers are plain ES modules: the three.js
renderer (`src/render3d/`, the default) and the Canvas one (`src/render/iso.js`) read the same view model.

## License

- **The code** (the engine, the renderers, the UI and the tools) is under the [MIT License](LICENSE).
- **Bundled third-party assets** keep their own licenses, listed per file in [`assets/CREDITS.md`](assets/CREDITS.md):
  CC0 (Poly Haven, ambientCG, Kenney and others), MIT and Apache-2.0 models, the CMU Graphics Lab motion capture, and
  the Noto fonts under the SIL Open Font License 1.1.
- **Material from the original *Survival Log*** (its name, characters and story text, the content tables in
  `src/data/gen/` built from its config, and the reference captures in `assets/targets/source/`) is included with the
  permission of its rights holders and is not covered by the MIT License.
- Research sources (the players' Steam guides, the patch notes, the achievement statistics) are not included; the
  docs and the balance bands cite them by their public Steam URLs.

`package.json` stays `private`, so npm will not publish it as a package.

## Requirements

Node 24 with npm 11, git with git-lfs, and Python 3 for `npm run data`. The asset lanes also use Blender, ffmpeg and sox.

## Setup

```sh
git lfs install                   # once per clone: LFS filters and hooks
git lfs pull                      # the binary assets under assets/
npm ci
npx playwright install chromium   # for npm run e2e
```

## Run

- `npm run dev` serves the game at `http://127.0.0.1:<port>/`. The port is 5200 plus the slot of the current branch's
  work package in `docs/wp/STATUS.md` (5200 on master), so parallel worktrees never collide; `PORT=` or `WP_SLOT=`
  override it.
- The three.js renderer (`src/render3d/`) is the default wherever WebGL2 runs; `?render=2d` selects the Canvas
  renderer (also the fallback without WebGL2), and an unknown value falls back to the default with a console warning.
  `?quality=low` drops the ambient-occlusion pass and MSAA (chosen automatically on software rasterisers).
- `npm run build` writes `dist/` (with the shipped part of `assets/`); `npm run preview` serves it.

## Checks

| Command | What it runs |
| --- | --- |
| `npm test` | the Node tests: `node --test tests/*.test.js` (the glob is required) |
| `npm run typecheck` | TypeScript over every file that starts with `// @ts-check` |
| `npm run lint` | ESLint over the repo |
| `npm run e2e` | Playwright in Chromium at 1920 × 1080 (`tests/e2e/`) |
| `npm run code-coverage` | the Node tests with coverage of `src/`: new code 100%, no file below its baseline (`docs/QUALITY.md` §7) |
| `npm run gate -- --quick` | the quick gate, run for every merge and by the pre-push hook |
| `npm run gate -- --status` | the phase, every check's state and the ledgers |
| `npm run gate -- --signoff P0` | a phase signoff: every check the phase requires must pass, none may be pending |
| `npm run gate -- --final` | every check must pass |

## Where things are

- `AGENTS.md`: how to work here (setup, the rules, coverage, the checks before a commit, integrating). Read it first.

- `docs/ARCHITECTURE.md`: layers, state, registries and conventions of the engine.
- `src/contracts/`: the frozen interfaces: the view model (`view.js`), the renderer interface and registry
  (`render.js`), the asset-manifest schema (`assets.js`) and, from WP-P0-02, the key registry (`keys.js`).
- `docs/wp/`: the work packages, the status board and the rules for every writer (`docs/wp/README.md`);
  `docs/JOURNAL.md` records decisions; `docs/FEATURES.md` is the feature inventory.
- `tools/gate.mjs` and `tools/gate/`: the gate and its check registry.
- `assets/`: shipped assets (binaries in git LFS) with their lock and credits.
