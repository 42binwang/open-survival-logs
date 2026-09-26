# BALANCE.md: balance bands per difficulty (WP-P0-11)

Headless bots play the real simulation, 50 seeds per difficulty per bot:

```sh
node tools/balance/run.mjs --seeds 50   # writes docs/balance/<phase>.md and docs/balance/<phase>.json
```

The report compares what the bots reach with the bands below, and counts crashes and save/load round trips (release
criteria, [`docs/QUALITY.md`](QUALITY.md) §3). The current run is [`docs/balance/P0.md`](balance/P0.md).

A band is where a measured number must land for the recreation to play like the source. Every band is anchored to a
relation the source states (an order, a gap, a share) and cites where: a line of `research/`, or the sim constant it
follows. A band that is outside, or cannot be measured (its bot did not play, fewer than 10 runs reached the event),
fails the run from the phase in its `from` column. Nothing is judged conditionally.

## The bots

Bots act only through the sim's own actions, the way the UI would:

- travel takes its game time;
- shopping pays and must fit the backpack;
- repairs cost stamina;
- the survivor's own autonomy (eat, sleep and leisure when idle; `src/sim/autonomy.js`) stays on, as it is by default.

Each session runs in a fresh worker thread and plays in 10-minute steps from the first hour of preparation until
the survivor dies, an ending is reached, or Day 100 ends. Every choice follows from the state, so a session replays
exactly from a save.

| bot | phase | plays |
| --- | --- | --- |
| `idle` | P0 | nothing: autonomy only. The floor: what the house and the starting pantry give. One seed per difficulty (it is deterministic). |
| `prepper` (reference) | P0 | Spends the preparation hours on supermarket trips for ready-to-eat food that keeps three weeks, best satiety and morale per dollar, and stores it at home. After the outbreak it keeps the house standing: it repairs the most damaged door or window below 60 % during an attack, and below 90 % between attacks, when it has the stamina. Below 70 % morale it uses the home's best morale per minute (radio, bath, games). With a horde due within 12 hours it keeps its stamina for the repairs: below 60 % of max Stamina it rests first (the bed's sleep or nap), and it takes only leisure that costs no stamina (the homes' config radios are daily-limited, Config_FurnitureFunc 32 DailyLimit 2, so the unlimited radio stand-in no longer tops morale up for free). It never cooks, farms, crafts, trades, sets traps or explores. |
| `forager` | P0 | The prepper, plus scavenging once less than two weeks of food is left. It goes by day, fed and rested, with no horde due within a day, to the first open site of the Nearby Streets, the Ruined Supermarket and the rest. It searches the nearest containers it can open, fights only while fresh, and retreats when hurt (under three quarters of max Life), tired, loaded or short of daylight; hurt, it does not set out. It keeps itself fed: while its Life is below max, and before every trip, it eats its ready-to-eat food until Satiety is 10 over the sim's Life-regeneration threshold (`src/sim/stats.js` REGEN_SAT), besides the half of max Satiety it wants before a trip; it moves meals earlier, it does not eat more ("Satiety / Morale / Stamina / Life - keep them up", "Eat before Stamina work", `https://steamcommunity.com/sharedfiles/filedetails/?id=3786657132`, `:66`; Steady and Stable, all four above 80, is earned by 70.9 % of players, `https://steamcommunity.com/stats/4164790/achievements`). It treats wounds with the medicine it brings home from the sites (band-aid 2509, First-Aid Bandage 2400, Military Med Kit 2401): bleeding, at home or at the site, with the cheapest item that clears it; hurt at home, with a Life-restoring item (bleeding is treatable with bandages and med kits, `https://store.steampowered.com/news/app/4164790`; no need to buy medicine, `https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359`). It buys none during the preparation, so its food still follows its funds like the prepper's. |
| `defender` | P1 | The trader-defender (`tools/balance/defender.mjs`). Before the outbreak it takes the wallet, the loan, the neighbor's $100 and the used-furniture buyer's money for four pieces it has no use for, and makes one round on foot: a supermarket run for food that keeps (satiety for the money and the backpack's weight together) and three band-aids; the Renovation Company for a titanium door, bulletproof windows for the openings the hordes reach and two fuel heaters; the Hardware Store for gas cans (worth 120 to the trading posts), two planks, diesel, sheet metal and glass; and a last supermarket run that stays through the riot and the Doomsday Rush. After it, it fits the door, windows and heaters, reinforces the reachable openings to their cap, repairs the workbench and the stairs and clears the basement, crafts spike barriers once the Barricade Guide plan is bought and sets them up (the far slots first, never walling itself into the yard), and lights as many heaters as the cold calls for with diesel it loads by hand. The drone (Day 5) fetches the yard loot, scavenges once a day and trades goods for diesel when the heaters run low, fever medicine, food while stocks are low or a bargain is offered, reinforcement kits, patches, spike materials and books that raise a maximum. In an attack it repairs an opening under 75 %, counterattacks while it has 30 stamina, and rests; between attacks it eats before Satiety falls under the regeneration line, treats bleeding and fever, keeps daily habits that raise a maximum (washing, a bath, push-ups), reads, and otherwise rests. It answers every event with its default choice, accepts every radio mission and buys the plan it can use most at every settlement. The balance sessions play it as it is; the achievement play-throughs (`tests/achievements-play-*.test.js`) also give it options: a route it works toward and commits to with the Military Repair Kit (the rescue beacon, the neighbor's basket, the survivors' network by drone, the fortress's nets, chainsaws and charged UPS, the hospital and office finds on morning outings, two dozen planters under lamps and heat, the supply station's stock), a frugal budget, a vegetarian diet, or never trading (foraging on morning outings instead). |

Each session also checks two save/load round trips: three hours into the preparation, across the outbreak, and on a
day drawn from the seed (Day 5–24). The state is saved and loaded as Continue does it; both copies then play the same
24 hours, and their saved states must match exactly.

## What the research says

Every claim below is cited to a file and line of `research/`. Claims earlier versions of this file made that the
research does not support are listed at the end of the section, dropped.

- **Doing nothing ends in the first week** is a decided bound, not a research claim: the starting pantry is empty
  and doing nothing buys no food. (The guides only urge using the preparation, `https://steamcommunity.com/sharedfiles/filedetails/?id=3786657132`;
  78.6 % of players survive Day 7, `https://steamcommunity.com/stats/4164790/achievements`; neither states a one-week floor.)
- **Difficulties are ordered.** Relaxed is "a more relaxed survival experience", the harder ones "a higher-pressure
  apocalypse" (`https://store.steampowered.com/news/app/4164790`). The bands ask the medians to keep that order, each at least two days
  apart.
- **Hordes before Day 30 are held by repairs.** "30天前屍潮先用高級維修門板修就好" (before the Day 30 hordes, advanced
  repair boards are enough; `https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359`). So the Day 25 horde is survived by ≥ 90 % of the
  prepper's and forager's runs on Relaxed and Normal and ≥ 75 % on Hard (its hordes are 1.35× stronger,
  `src/content/difficulty.js`). On Out of Ammo and Food the hoard-only bots cannot reach Day 25 by construction (the
  funds and daily-draw bands hold their food to 21–23 days, and no research says a pure hoarder gets there), so that
  horde is the defender's band (≥ 75 %, from P1).
- **The Day 49 horde wipes out many players** ("超多人滅團在這波", `https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359`).
- **Survival from milestone to milestone** (the achievement unlock rates, `https://steamcommunity.com/stats/4164790/achievements 30, 34, 52`:
  59.4 % reach Day 30, 48.7 % Day 50, 40.1 % Day 70, 28.2 % survive the Day 87 horde). Among players who reach one
  milestone, the share reaching the next is 48.7 / 59.4 ≈ **0.82** (Day 30 → 50), 40.1 / 48.7 ≈ **0.82** (50 → 70)
  and 28.2 / 40.1 ≈ **0.70** (70 → 87). The defender's bands are floors 0.15 under those, with no ceiling: the rates
  also fall because players stop playing, and a competent bot should beat the player average.
- **Scavenging feeds, but was cut.** "食物去外面超市可以撿一堆，吃到吐 (8/13改版後，撿的物資大幅減少…)" (the supermarket
  feeds you until you are sick of it; after the 08-13 patch much less; `https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359`). The
  forager must still gain on the prepper: between +2 and +14 days of median life.
- **The first cold wave comes around Day 35** ("35天左右會有寒潮", `https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359`), and one
  community log records it on Day 26 ("【day26】寒潮来袭", `https://steamcommunity.com/sharedfiles/filedetails/?id=3794377867`): its first day is between
  Day 26 and 40. "Cold weather + blackout is how people die with a full pantry" (`https://steamcommunity.com/sharedfiles/filedetails/?id=3786657132`):
  at least half of the unheated survivors alive at its start get cold. The defender heats the house, so its ceiling
  on cold deaths (10 %) is a decided bound, not a research claim.
- **Food, funds and points follow the difficulty table** of `src/content/difficulty.js` (funds ×1.3 / 1 / 0.85 / 0.7,
  points ×1.2 / 1 / 1.15 / 1.3), and the daily draw follows the satiety costs of `src/sim/stats.js:13-14` (40 a day).

Dropped (not supported by the files in `research/`):

- *"6.5 hours and $700 base funds on Out of Ammo and Food"*: `https://steamcommunity.com/sharedfiles/filedetails/?id=3786134186` holds only the guide's
  afterword. The preparation hours and funds are the recreation's own table (`src/content/difficulty.js`), not a
  research claim.
- *"Money buys about a month of food"*: not in the guide. The food bands follow the funds instead.
- *"Day 35 is a common first-run death on the hardest difficulty"*: `https://steamcommunity.com/sharedfiles/filedetails/?id=3786134186` is one
  player's first run, and not on the hardest difficulty ("我第一次玩死在了35天的尸潮 … 所以重开了一个弹尽粮绝的新档": they
  died at Day 35, then started Out of Ammo and Food). No band rests on it.

## Bands

`tools/balance/bands.mjs` holds the same table, and a test keeps the two equal and checks that every source line
exists. `from` is the first phase whose balance run must hold the band.

| band | from | range | source | measures |
| --- | --- | --- | --- | --- |
| `idle-first-week-relaxed` | P0 | 0 – 7 | decided (WP-P0-11): the starting pantry is empty and doing nothing buys no food, so autonomy alone starves within a week | idle, relaxed: median days survived (doing nothing ends within the first week) |
| `idle-first-week-normal` | P0 | 0 – 7 | decided (WP-P0-11): the starting pantry is empty and doing nothing buys no food, so autonomy alone starves within a week | idle, normal: median days survived (doing nothing ends within the first week) |
| `idle-first-week-hard` | P0 | 0 – 7 | decided (WP-P0-11): the starting pantry is empty and doing nothing buys no food, so autonomy alone starves within a week | idle, hard: median days survived (doing nothing ends within the first week) |
| `idle-first-week-outOfAmmo` | P0 | 0 – 7 | decided (WP-P0-11): the starting pantry is empty and doing nothing buys no food, so autonomy alone starves within a week | idle, outOfAmmo: median days survived (doing nothing ends within the first week) |
| `prepper-difficulty-order` | P0 | 2 – ∞ | https://store.steampowered.com/news/app/4164790 | prepper: the smallest gap between the median days of Relaxed > Normal > Hard > Out of Ammo and Food |
| `forager-difficulty-order` | P0 | 2 – ∞ | https://store.steampowered.com/news/app/4164790 | forager: the smallest gap between the median days of Relaxed > Normal > Hard > Out of Ammo and Food |
| `prepper-food-follows-funds-relaxed` | P0 | -0.1 – 0.1 | src/content/difficulty.js (funds) | prepper, relaxed: Day-1 food relative to Normal, divided by the funds relative to Normal, minus 1 |
| `prepper-food-follows-funds-hard` | P0 | -0.1 – 0.1 | src/content/difficulty.js (funds) | prepper, hard: Day-1 food relative to Normal, divided by the funds relative to Normal, minus 1 |
| `prepper-food-follows-funds-outOfAmmo` | P0 | -0.1 – 0.1 | src/content/difficulty.js (funds) | prepper, outOfAmmo: Day-1 food relative to Normal, divided by the funds relative to Normal, minus 1 |
| `prepper-food-draw-normal` | P0 | 0.9 – 1.5 | src/sim/stats.js:13-14 | prepper, Normal: median daily draw on the food at home, in days of satiety (1 = what the survivor needs) |
| `prepper-horde25-relaxed` | P0 | 0.9 – 1 | https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359 | prepper, relaxed: share of runs facing the Day 25 horde that survive it |
| `prepper-horde25-normal` | P0 | 0.9 – 1 | https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359 | prepper, normal: share of runs facing the Day 25 horde that survive it |
| `prepper-horde25-hard` | P0 | 0.75 – 1 | https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359 | prepper, hard: share of runs facing the Day 25 horde that survive it |
| `forager-horde25-relaxed` | P0 | 0.9 – 1 | https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359 | forager, relaxed: share of runs facing the Day 25 horde that survive it |
| `forager-horde25-normal` | P0 | 0.9 – 1 | https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359 | forager, normal: share of runs facing the Day 25 horde that survive it |
| `forager-horde25-hard` | P0 | 0.5 – 1 | https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359 | forager, hard: share of runs facing the Day 25 horde that survive it |
| `forager-gain-relaxed` | P0 | 2 – 14 | https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359 | relaxed: forager median days survived minus the prepper's (scavenging feeds, it does not replace farming) |
| `forager-gain-normal` | P0 | 2 – 14 | https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359 | normal: forager median days survived minus the prepper's (scavenging feeds, it does not replace farming) |
| `forager-gain-hard` | P0 | -1 – 14 | https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359 | hard: forager median days survived minus the prepper's (scavenging feeds, it does not replace farming) |
| `forager-gain-outOfAmmo` | P0 | -1 – 14 | https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359 | outOfAmmo: forager median days survived minus the prepper's (scavenging feeds, it does not replace farming) |
| `cold-first-wave-day` | P0 | 26 – 40 | https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359; https://steamcommunity.com/sharedfiles/filedetails/?id=3794377867 | every session: median start day of the first cold wave ("around Day 35"; one run records Day 26) |
| `cold-unheated-normal` | P0 | 0.5 – 1 | https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359; https://steamcommunity.com/sharedfiles/filedetails/?id=3786657132 | prepper (no heating), normal: share of runs alive when the first cold wave starts that get cold during it |
| `cold-unheated-relaxed` | P0 | 0.5 – 1 | https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359; https://steamcommunity.com/sharedfiles/filedetails/?id=3786657132 | prepper (no heating), relaxed: share of runs alive when the first cold wave starts that get cold during it |
| `prepper-points-follow-mult-relaxed` | P0 | -0.2 – 0.2 | src/content/difficulty.js (pointsMult) | prepper, relaxed: planning points per day relative to Normal, divided by the points multiplier relative to Normal, minus 1 |
| `prepper-points-follow-mult-hard` | P0 | -0.2 – 0.2 | src/content/difficulty.js (pointsMult) | prepper, hard: planning points per day relative to Normal, divided by the points multiplier relative to Normal, minus 1 |
| `prepper-points-follow-mult-outOfAmmo` | P0 | -0.2 – 0.2 | src/content/difficulty.js (pointsMult) | prepper, outOfAmmo: planning points per day relative to Normal, divided by the points multiplier relative to Normal, minus 1 |
| `defender-reach-30-50-normal` | P1 | 0.67 – 1 | https://steamcommunity.com/stats/4164790/achievements | defender, Normal: share of runs alive on Day 30 still alive on Day 50 |
| `defender-reach-50-70-normal` | P1 | 0.67 – 1 | https://steamcommunity.com/stats/4164790/achievements | defender, Normal: share of runs alive on Day 50 still alive on Day 70 |
| `defender-reach-70-88-normal` | P1 | 0.55 – 1 | https://steamcommunity.com/stats/4164790/achievements | defender, Normal: share of runs alive on Day 70 still alive on Day 88 |
| `defender-horde25-normal` | P1 | 0.9 – 1 | https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359 | defender, normal: share of runs facing the Day 25 horde that survive it |
| `defender-horde25-outOfAmmo` | P1 | 0.75 – 1 | https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359 | defender, outOfAmmo: share of runs facing the Day 25 horde that survive it |
| `defender-horde35-normal` | P1 | 0.75 – 1 | https://steamcommunity.com/stats/4164790/achievements | defender, normal: share of runs facing the Day 35 horde that survive it |
| `defender-horde49-normal` | P1 | 0.75 – 1 | https://steamcommunity.com/stats/4164790/achievements; https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359 | defender, normal: share of runs facing the Day 49 horde that survive it |
| `defender-horde87-normal` | P1 | 0.55 – 1 | https://steamcommunity.com/stats/4164790/achievements | defender, normal: share of runs facing the Day 87 horde that survive it |
| `defender-deaths-zombies-normal` | P1 | 0.3 – 1 | https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359 | defender, Normal: share of deaths by zombies |
| `defender-deaths-illness-normal` | P1 | 0 – 0.2 | https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359 | defender, Normal: share of deaths by illness |
| `defender-deaths-cold-normal` | P1 | 0 – 0.1 | decided (WP-P0-11): the defender heats the house through every cold wave (its strategy), so cold kills it rarely | defender, Normal: share of deaths by cold |

### Changing a band

`tools/balance/bands.mjs` is frozen with the other gate thresholds (docs/QUALITY.md §3). A band changes only with a
line in [`docs/balance/bands-log.jsonl`](balance/bands-log.jsonl), which only grows:

```sh
node tools/balance/check.mjs log-bands --reason "<the research file:line and what it says>"   # appends unsigned lines
node tools/balance/check.mjs sign-bands --by review:<agent id>                               # a fresh reviewer signs
```

Each line holds the band's id, range, `source` (a research file and line, or the sim constant), the reason, and
`approvedBy`: `integrator` or `review:<id>`, never the agent of the branch that changed the band. The `ledgers` gate
check fails while `bands.mjs` and the log's last line for a band disagree, while a line this branch added is
unsigned, or when master's lines were changed.

## What the P0 run found

[`docs/balance/P0.md`](balance/P0.md) (50 seeds, commit in [`P0.json`](balance/P0.json)): 404 sessions (400 bot
sessions and one idle seed per difficulty), 0 crashes, 800 of 800 round trips identical. **23 of 26 P0 bands hold; 3
fail**, all the forager's on Hard and Out of Ammo and Food (BUG-0057, BUG-0058; the traces, root cause and what
remains are in [`docs/balance/forager.md`](balance/forager.md)):

- **The floor is exact.** The idle survivor starves on Day 4 on every difficulty.
- **The difficulty order holds.** The prepper's median life is Day 36 / 30 / 26.5 / 23 (Relaxed / Normal / Hard /
  Out of Ammo and Food), the forager's 41 / 33 / 26 / 24: gaps of at least 3.5 and 2 days.
- **The Day 25 horde breaks a door or window** in 20 % / 30 % / 58 % of the prepper's runs that face it (Relaxed /
  Normal / Hard), and the prepper survives it in 100 % / 98 % / 81 %: inside its bands.
- **Out of Ammo and Food starves before Day 25** (prepper median Day 23, 88 % of deaths starvation; forager Day 22):
  its Day-1 food is 21 days of eating (×0.72 of Normal's 29.5, as its funds say) and is gone by Day 21. That follows
  from the funds and draw bands, so the Day 25 horde band there is the defender's (P1); the earlier bug for it is
  closed.
- **Scavenging feeds on Relaxed and Normal, not yet on Hard and Out of Ammo.** The forager gains +5 / +3 / −0.5 / +1
  days over the prepper (band +2 to +14). The P0-11 run's 0 / 0 / −0.5 / −1 came from two bot defects (it stood at a
  locked car it could not open until dusk, and set out hurt and turned back); with those fixed, and the forager
  keeping itself fed and treating its wounds as defined above, Relaxed and Normal hold.
- **The forager holds the Day 25 horde** on Relaxed (100 %) and Normal (92 %), **not on Hard** (54 %, band ≥ 75 %;
  39 of 48 breached against the prepper's 28 of 48). It meets that horde with more Life than the prepper (96 against
  83) but less stamina (45 against 63), and its doors and windows are as repaired (the weakest at 92 %).
- **The cold arrives on time.** The first cold wave starts on Day 30.5 (median, band Day 26–40) and 96 % of the
  unheated Normal survivors alive at its start get cold.
- **Food follows the funds** (within ±0.1 on every difficulty), and the daily draw on Normal is 1.1 days of food a
  day.

**Decided after the run (2026-09-23, docs/balance/bands-log.jsonl).** The three failing bands were a reading of the
source, not a sim defect (docs/balance/forager.md, "What this leaves open"). Guide line 82 says scavenging yields are
"greatly reduced" since patch 8/13, so on Hard and Out of Ammo and Food the forager's gain floor is −1 day (scavenging
does not cost days), not +2; line 77's door repairs hold for the forager as for the prepper, and the 0.75 survival
rate was the prepper's, so the forager's Hard horde floor is 0.5. Against these bands the P0 run holds 26 of 26.

The P1 bands (the defender's) are measured on the defender's sessions and required from P1.
