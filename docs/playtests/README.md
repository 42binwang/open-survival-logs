# Playtests

Playtests check what bots and tools cannot: whether a person, or an agent playing as one, can learn the game, reads
it correctly and enjoys it. They feed three rubric axes of [`docs/QUALITY.md`](../QUALITY.md): onboarding, feedback
and feel, and UI clarity. They also count towards two release criteria: zero crashes over 20 playtest sessions, and
the bug counts.

## Rules

- **UI only.** Play with the mouse and keyboard, as a player would. You may not:
  - use the browser console, `window.__game` or the DevTools;
  - edit localStorage or saves;
  - use any URL parameter except the two below;
  - read the source code during a session.

  What the game shows is all you know. For an agent, that includes the text of the page and its screenshots.
- **URL parameters.** Only these two:
  - `?seed=<integer>`: the run's seed;
  - `?devSpeed=<1–8>`: multiplies the game speed, to skip long waits (use 1 while learning).

  No other parameter, not even `?render=`: the session plays the build's default renderer, as a player would. The
  session line's `url` is the page the harness opened, and the ledger check rejects any other parameter. Until the
  game reads `?seed=` and `?devSpeed=` (BUG-0053 in `docs/bugs.jsonl`), say so in the report: runs are then not
  reproducible by seed.
- **A clean start.** Each session opens a fresh browser profile (no saves, default settings) at 1920 × 1080, unless the
  persona's plan says to Continue an earlier session's save.
- **The build.** The phase's integrated build: `npm run build && npm run preview` on the checkout, or the dev server
  on its port. Record the commit.
- **A passive logger is mandatory.** Every session runs under the playtest harness (a P1 deliverable,
  `tools/playtest/`), which never acts on the game and records a trace: the URL, page errors, console errors,
  frame times, the tips shown and the systems first used, and a screenshot a minute. **Every page error and every
  stall of 5 s or more (no frame painted) counts as a crash**, whether or not the player noticed it. The stall clock
  starts at the first frame of the home scene after `renderer.ready`: the loading screen before it is the
  first-interactive budget's (≤ 8 s cold, docs/QUALITY.md §4), not a stall. The trace is
  committed beside the report and named in the session line (`trace`).

## Personas

| id | persona | knows | plays | goal of a session | watches for |
| --- | --- | --- | --- | --- | --- |
| `first-timer` | Mia, has never played Survival Log or a hoarding sim; reads every tip | nothing about the game | Wage Slave, Normal, English, devSpeed 1 | survive the first life as long as possible | where she gets stuck, what she misreads, what she never finds |
| `veteran` | Kai, plays colony and survival sims (Don't Starve, This War of Mine), not this one | the genre | any unlocked survivor, Hard, English, devSpeed up to 4 | reach Day 49 by planning: defence, food engine, trade | numbers that do not add up, dominant strategies, dead systems |
| `source-fan` | Lin, finished Survival Log on Steam and knows the guides in `research/` | the source | all three survivors across loops, Normal, Chinese, devSpeed up to 8 | reach an ending, then check the patch-note features and the three identities | differences from the source, missing features, wrong numbers, translation |
| `casual` | Sam, plays in short breaks, likes farming and decorating | a little | College Student when unlocked, else Wage Slave, Relaxed, English, devSpeed 1–2 | 30-minute sessions that Continue each other's save | save and load, whether a returning player knows what to do, comfort |

A phase's round is at least 5 sessions per persona (20 in all). Each session uses its own seed from the phase's seed
list (below), so a finding can be replayed.

## Seeds

The seeds of a round are `<phase number> × 1000 + persona index × 100 + session number`. The persona indices are
first-timer 1, veteran 2, source-fan 3, casual 4. Example: P1, veteran, session 3 → `?seed=1203`.

## A session

1. Note the start time, the build commit, the persona, the seed and devSpeed.
2. Play from the title screen until one of these happens:
   - the survivor dies;
   - an ending is reached;
   - 60 minutes of real time pass (30 for `casual`);
   - the persona's goal is met.
3. As you play, write down every moment of doubt, surprise or annoyance with the game time it happened at, and take
   a screenshot of anything that looks wrong.
4. After the session:
   - file each defect in [`docs/bugs.jsonl`](../bugs.jsonl): the next free id, `foundBy: "playtest:<persona>"`, the
     seed and game time in `repro`, severity per docs/QUALITY.md §6;
   - write the report;
   - add a line to `sessions.jsonl`.

A crash is any uncaught page error, a frozen game (no frame for 5 s), a lost save, or a run that cannot go on. It is
an S1 bug and ends the session.

## Results

Reports go in `docs/playtests/<phase>/`, one Markdown file per session, `<persona>-<nn>.md`:

```markdown
# P1 · veteran · 03

| field | value |
| --- | --- |
| build | wp/…@a1b2c3d, /?seed=1203&devSpeed=4 |
| played | 2026-10-12 14:05–15:05 (60 min) |
| survivor, difficulty | Wage Slave, Hard |
| outcome | died Day 31 (zombies, the Day 25 horde breached the front door) |
| crashes | 0 (logger: 0 page errors, 0 stalls ≥ 5 s) |
| bugs filed | BUG-0031, BUG-0032 |

## Timeline
- 00:04 (prep, 16:20 left) The city map does not say the car lot sells a car; found it by visiting.
- …

## Friction (onboarding)
## Feel (response, feedback)
## Balance notes
## Rubric notes (optional, per axis)
```

`docs/playtests/<phase>/sessions.jsonl` has one line per session, for the release check:

```json
{"phase":"P1","persona":"veteran","session":3,"seed":1203,"devSpeed":4,"commit":"a1b2c3d","url":"/?seed=1203&devSpeed=4","trace":"docs/playtests/P1/veteran-03.trace.json","character":"wage","difficulty":"hard","minutes":60,"days":31,"end":"dead","crashes":0,"pageErrors":0,"stalls":0,"bugs":["BUG-0031","BUG-0032"],"report":"docs/playtests/P1/veteran-03.md"}
```

| field | meaning |
| --- | --- |
| `phase`, `persona`, `session` | which session |
| `seed`, `devSpeed` | the two URL parameters used |
| `commit` | the build |
| `url` | the page the harness opened: only `?seed=` (matching `seed`) and `?devSpeed=` (matching `devSpeed`; absent means 1) |
| `trace` | the harness trace, committed |
| `character`, `difficulty` | the run |
| `minutes` | real time played |
| `days` | days survived, as the survival record counts them |
| `end` | `dead`, `ending`, `stopped` (time or goal) or `crash` |
| `crashes` | page errors + stalls of 5 s or more, plus 1 for a crash neither shows |
| `pageErrors`, `stalls` | what the passive logger counted |
| `bugs` | the ids filed from the session |
| `report` | the Markdown report |

`tools/balance/ledgers.mjs` checks these lines, and totals the sessions and crashes for the release criteria.
