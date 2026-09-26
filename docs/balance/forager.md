# The forager: root cause of BUG-0057 and BUG-0058 (WP-P0-15)

**Outcome.** The P0 numbers of the forager came from a bot that did not play its definition in
[`docs/BALANCE.md`](../BALANCE.md). It had two defects, both fixed in `tools/balance/bots.mjs` and pinned by
`tests/balance-forager.test.js`:

1. At the Nearby Streets it walked to the nearest container even when that was the pry-locked car it has no crowbar
   for, and stood in front of it until 45 minutes before dark: 17 hours per run on Normal, 21 on Relaxed.
2. It set out with less than three quarters of its Life, which its own site rule calls hurt, so it turned back as
   soon as it arrived: 175 of the 197 empty trips on Normal, 124 of 159 on Hard.

BUG-0058's suspected cause does not hold. At the start of the Day 25 horde the forager's doors and windows are as
repaired as the prepper's (the weakest at 92 % for both bots, on every difficulty). The forager dies more often
because it enters the horde with less Life (78 against 101 on Normal, 65 against 83 on Hard) and a breach then kills
it. The Life it lacks is zombie bites and bleeding at the site that never heal.

With the bot fixed, and the site costs restored to the config, **the six forager bands still fail** (numbers
below). What remains is the cost of a trip in the
sim, not the bot: on Normal a trip to the Nearby Streets searches 3.3 containers and brings home 0.46 days of food,
and spends 58 stamina and 8.9 Life on two zombies. The survivor regenerates Life only above 30 satiety, and autonomy
keeps it between 20 and 30 on the pantry the prepper buys, so those bites are still there when the horde comes.
None of the numbers behind this (zombies per site, bite damage, bleeding, fight stamina, exposure surges, the
regeneration rule) is in the extracted config or in `research/`. There is no source value for a sim fix to restore,
and the sources of the two bands do not contradict them. Closing the gap is a decision for the architect and the
quality-standards reviewer; the options, measured, are at the end.

## The reviewer's ruling and its result

The quality-standards reviewer accepted the bot fix as a faithful reading of the definition and closed the gap with
two changes to the forager's definition (`docs/BALANCE.md`), not a sim value or a band:

- **It keeps itself fed.** While its Life is below max, and before every trip, it eats its ready-to-eat food until
  Satiety is 10 over the sim's Life-regeneration threshold (`src/sim/stats.js` REGEN_SAT, 30), besides the half of
  max Satiety it already wanted before a trip. The meals come earlier, not larger ("keep them up", "Eat before Stamina
  work", `https://steamcommunity.com/sharedfiles/filedetails/?id=3786657132`, `:66`; Steady and Stable, `https://steamcommunity.com/stats/4164790/achievements`).
- **It treats wounds with the medicine it finds** (band-aid 2509, First-Aid Bandage 2400, Military Med Kit 2401, from
  the sites' medicine pool): a bleed, at home or at the site, with the cheapest item that clears it; hurt at home, with
  a Life-restoring item. It buys none (`https://store.steampowered.com/news/app/4164790`, `https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359`).

Not adopted: the Ruined Supermarket first, retreating at the Tired threshold, engaging zombies early.
`tests/balance-forager.test.js` pins both changes; the three tests for them fail on the bot at 62a3c9e.

`node tools/balance/run.mjs --seeds 50` at 44a373f (under the machine lock): **23 of 26 P0 bands hold**, 0 crashes,
800 of 800 round trips identical.

| band | P0-11 run | bot fixed, config costs | the ruling | band |
| --- | ---: | ---: | ---: | --- |
| `forager-gain-relaxed` | 0 | +0.5 | +5 (41 vs 36) | 2 – 14 ✔ |
| `forager-gain-normal` | 0 | 0 | +3 (33 vs 30) | 2 – 14 ✔ |
| `forager-gain-hard` | −0.5 | −0.5 | −0.5 (26 vs 26.5) | 2 – 14 ✖ |
| `forager-gain-outOfAmmo` | −1 | −1 | +1 (24 vs 23) | 2 – 14 ✖ |
| `forager-horde25-relaxed` | 1 | 1 | 1 (50 of 50) | ≥ 0.9 ✔ |
| `forager-horde25-normal` | 0.86 | 0.82 | 0.92 (46 of 50) | ≥ 0.9 ✔ |
| `forager-horde25-hard` | 0.51 | 0.65 | 0.54 (26 of 48) | ≥ 0.75 ✖ |
| `forager-difficulty-order` | 4 | 4 | 2 (41 > 33 > 26 > 24) | ≥ 2 ✔ |

What still fails is Hard, and Out of Ammo and Food through it. At the Hard Day 25 horde (50 traces,
`tools/balance/trace.mjs`) the forager now has more Life than the prepper (96 against 83) and no bleed, with its
openings as repaired (the weakest at 92 %), but less stamina (45 against 63). Its doors or windows break in 39 of 48
runs against the prepper's 28, and it survives 17 of those 39 breaches. A Hard trip still costs 2.5 bites and 14 Life
for 0.26 days of food, and it uses 0.4 medicine items per run. The Hard and Out of Ammo gains need that horde
survived, and on Out of Ammo the food a trip brings home too. Under the ruling this goes to the architect as a
documented site-combat decision; no band is re-fitted to a run.

## How the evidence was gathered

`tools/balance/trace.mjs` (below, under Reproduce) plays the same sessions as `tools/balance/session.mjs`: the same seeds (1009 k + 17), the same
10-minute bot steps, the same two save/load round trips, the session continuing on the loaded copy. It records each
outing (departure, arrival, containers searched, items taken and their satiety, bites, kills, what the survivor stood
idle in front of), each meal, repair and horde, and the survivor every morning. Its scratch predecessor, which also
recorded the rule that ended each outing, produced the tables below: its 800 sessions (the P0-11 bot and the fixed
bot, 50 seeds on each difficulty, before the site-cost fix) match the balance runs' days, causes of death and bot
counters exactly, and `tests/balance-trace.test.js` checks the landed tool against `runSession`. "Food" below is
satiety the survivor eats as it is (autonomy's rule, `src/sim/suggest.js` bestFood), in days of 40.

## What the P0-11 forager did (BUG-0057)

Normal, seed 1026. It starts scavenging on Day 18, when less than two weeks of food is left. Each line is one trip
to the Nearby Streets:

| day | out – back | containers | bites | Life | food home | what happened |
| --- | --- | ---: | ---: | --- | ---: | --- |
| 18 | 07:48 – 19:48 | 3 of 12 | 2 | 102 → 97 | 0.1 d | searched a newspaper pile, a bag and a fuel drum, then stood 600 minutes at the pry-locked car C1 ("needs a crowbar") until 45 minutes before dark |
| 19 | 08:18 – 19:48 | 3 of 12 | 2 | 98 → 89 | 0.5 d | the same three containers, then 580 minutes at the car |
| 20 | 07:48 – 08:48 | 0 | 0 | 70 → 70 | 0 | left at 70 % of max Life (the home gate asked for 60 Life), retreated on arrival as hurt (under 75 %) |
| 20 | 08:48 – 09:48 | 0 | 0 | 70 → 71 | 0 | again |
| 20 | 09:48 – 10:48 | 0 | 0 | 71 → 71 | 0 | again |
| 21 | 10:30 – 11:42 | 0 | 1 | 75 → 71 | 0 | again |
| 21 | 12:00 – 13:12 | 0 | 0 | 72 → 72 | 0 | again |
| 22 | 08:18 – 09:42 | 1 | 1 | 76 → 73 | 0 | again |

Every empty trip still cost about 17 stamina, an hour, and 0.08 of the site's loot (the depletion a visit adds,
`src/sim/explore.js:523`). The two defects, as the P0-11 code had them:

- **The stall.** The bot took the sim's `nearestFixture` (`src/sim/explore.js:1316`), which returns the nearest
  unsearched container whether or not it can be opened. `queueDefault` then found no enabled option on the locked
  car, queued nothing, and the bot waited. Only the daylight rule (under 45 minutes left) ended the trip.
- **Setting out hurt.** At home the bot required `life >= 60` (`tools/balance/bots.mjs:267` at 2c95676); at the
  site it retreats under `0.75 × max Life` (line 236). Between the two it left and came straight back.

Over 50 seeds (P0-11 bot):

| difficulty | runs | trips / run | empty (0 searched) | of them, left home hurt | h stalled at a lock / run | containers / run | food home / run (days) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Relaxed | 50 | 4.5 | 1.0 (51) | 48 of 51 | 21.3 | 10.3 | 2.1 |
| Normal | 50 | 7.3 | 3.9 (197) | 175 of 197 | 16.9 | 9.6 | 1.4 |
| Hard | 50 | 5.0 | 3.2 (159) | 124 of 159 | 1.7 | 4.4 | 0.4 |
| Out of Ammo | 50 | 3.7 | 2.7 (135) | 91 of 135 | 0.5 | 2.1 | 0.3 |

A whole run of scavenging brought home 1.4 days of food on Normal and 0.4 on Hard: nothing to gain days with.

## The Day 25 horde (BUG-0058)

| bot, difficulty | faced | survived | weakest door or window at its start | Life at its start | stamina at its start | broke an opening | survived a breach |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| prepper, Relaxed | 50 | 50 | 92 % | 104 | 59 | 10 | 10 of 10 |
| prepper, Normal | 50 | 49 | 92 % | 101 | 73 | 15 | 14 of 15 |
| prepper, Hard | 48 | 39 | 92 % | 83 | 63 | 28 | 19 of 28 |
| forager (P0-11), Relaxed | 50 | 50 | 92 % | 100 | 53 | 15 | 15 of 15 |
| forager (P0-11), Normal | 50 | 43 | 92 % | 78 | 65 | 19 | 12 of 19 |
| forager (P0-11), Hard | 47 | 24 | 92 % | 65 | 49 | 36 | 14 of 36 |

The openings are equally repaired: the forager does not go out within a day of a horde, and it repairs like the
prepper. A breached opening costs the survivor 15 Life, often a bleed, and 2.5 Life per zombie hit until it is
repaired (`src/sim/horde.js` breach, hitOpening). With 100 Life the prepper lives through that; with 65 to 78 the
forager often does not.

Hard, seed 5062 (P0-11 bot), shows where its Life went. On Day 19 its first trip ends after two bites and a bleed
(Life 100 → 63 by the next morning). It then makes six trips on Days 20 to 23 that turn back on arrival, each
costing about 18 stamina. It meets the Day 25 horde with 90 Life but 19 stamina, cannot repair (a repair during an
attack needs 18) once the door breaks at 01:18, and dies at 01:57.

## The fix: the forager plays its definition

`docs/BALANCE.md` defines the forager as the prepper that, with less than two weeks of food left, "goes by day, fed
and rested, with no horde due within a day, to the first open site of the Nearby Streets, the Ruined Supermarket and
the rest. It searches the nearest containers, fights only while fresh, and retreats when hurt, tired, loaded or short
of daylight." The bot now does that and no more:

- **It searches the nearest container it can open** (`nextContainer`): not yet searched, and not locked against the
  tools in its backpack. The site view marks such a container "needs a crowbar" (`src/sim/explore.js` canSearch), so
  this is what a player sees. With no such container left within reach it heads home, as it did when nothing was
  left to search. With a crowbar in the backpack the car counts again.
- **It does not set out hurt**: the home gate uses the same rule as the site's retreat, three quarters of max Life.
- **Its two weeks of food count the food the survivor eats.** It never cooks, and autonomy does not eat raw meat
  (Canned Luncheon Meat, Ham Sausage), so those no longer count. This moves the trigger by less than a day.

It gains no information a player lacks and no play the definition does not describe: it still goes to the first open
site, searches nearest first, fights only an adjacent zombie while fresh, and retreats on the same four conditions.
`tests/balance-forager.test.js` pins all three, and each of its tests fails on the P0-11 bot.

## After the fix

`npm run balance` (50 seeds), the forager's bands. The last column is the run at e7115d1, rebased onto master 0d24966, with the site costs of the config (below); the per-trip tables and traces in this section were measured with the bot fix alone:

| band | P0-11 run | bot fixed | and site costs from the config | band |
| --- | ---: | ---: | ---: | --- |
| `forager-gain-relaxed` | 0 (36 vs 36) | +0.5 (36.5 vs 36) | +0.5 (36.5 vs 36) | 2 – 14 ✖ |
| `forager-gain-normal` | 0 (30 vs 30) | 0 (30 vs 30) | 0 (30 vs 30) | 2 – 14 ✖ |
| `forager-gain-hard` | −0.5 (26 vs 26.5) | −0.5 (26 vs 26.5) | −0.5 (26 vs 26.5) | 2 – 14 ✖ |
| `forager-gain-outOfAmmo` | −1 (22 vs 23) | −1 (22 vs 23) | −1 (22 vs 23) | 2 – 14 ✖ |
| `forager-horde25-relaxed` | 1 (50 of 50) | 1 (50 of 50) | 1 (50 of 50) | ≥ 0.9 ✔ |
| `forager-horde25-normal` | 0.86 (43 of 50) | 0.78 (39 of 50) | 0.82 (41 of 50) | ≥ 0.9 ✖ |
| `forager-horde25-hard` | 0.51 (24 of 47) | 0.66 (31 of 47) | 0.65 (30 of 46) | ≥ 0.75 ✖ |

The other 20 P0 bands are unchanged (the prepper and the idle bot did not change) and hold: 0 crashes, 798 of 798
round trips identical in both runs. The forager now searches, and brings home a little more:

| difficulty | runs | trips / run | empty (0 searched) | of them, left home hurt | h stalled at a lock / run | containers / run | food home / run (days) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Relaxed | 50 | 3.3 | 0.1 (6) | 0 of 6 | 0.5 | 14.7 | 2.8 |
| Normal | 50 | 3.4 | 0.6 (31) | 0 of 31 | 0.4 | 11.0 | 1.5 |
| Hard | 50 | 2.3 | 0.5 (24) | 0 of 24 | 0.2 | 4.5 | 0.5 |
| Out of Ammo | 50 | 1.8 | 0.8 (40) | 0 of 40 | 0.1 | 2.1 | 0.3 |

(The empty trips left now are bites on arrival; the few hours "at a lock" are the idle rest of a 10-minute step after
an action finished, not a stall.) Per trip:

| difficulty | trips | containers | food (days) | zombies killed | bites | Life lost | stamina spent | hours out |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Relaxed | 167 | 4.4 | 0.84 | 1.2 | 1.2 | 3.1 | 59 | 2.9 |
| Normal | 168 | 3.3 | 0.46 | 2.0 | 2.1 | 8.9 | 58 | 2.5 |
| Hard | 116 | 1.9 | 0.23 | 2.3 | 2.4 | 14.3 | 55 | 2.0 |
| Out of Ammo | 91 | 1.2 | 0.17 | 1.8 | 3.2 | 23.2 | 53 | 1.7 |

A trip, minute by minute (Normal, seed 1026, Day 18):

- **08:20** Arrives with Life 102, stamina 91. Two zombies wander 6 and 8 tiles away.
- **08:22** A zombie grabs it before the first search is done, and the search is lost. It kills the zombie by 08:24,
  for 12 stamina.
- **08:41 – 09:22** It searches the nearest containers: a newspaper pile (nothing), a bag (one item), a fuel drum
  (nothing).
- **09:33** A bite interrupts the next search; the zombie is dead a minute later.
- **09:53** Exposure passes 50 and brings a new zombie; it bites at 09:58 and dies at 09:59.
- **10:24** The car's search (26 minutes, restarted twice) gives one item.
- **11:00** Home with stamina 29: it retreated as tired, under 40.

The corner shop's two grocery shelves, the food of the Nearby Streets (22 satiety each on average), are at the far
end of the map. Four searches in, it is tired before it gets there.

Normal, seed 9098 (this branch), shows the Life that does not come back. Trips on Days 18 to 20 cost 3, 2 and 3 bites
and bring home 0, 0.8 and 0.5 days of food; a bleed takes it to 53.6 Life on Day 21. Now hurt, it stays home, and its
Life is **53.6 every morning from Day 21 to Day 25**. It eats cola and white sugar (5 satiety each) whenever it
falls under 25 satiety (`src/sim/autonomy.js:17`), and Life regenerates only above 30 (`src/sim/stats.js:170`). It
meets the Day 25 horde with 58 Life, the door breaks at 01:18, and it dies at 01:34. The prepper on the same seed
meets it with 102.

At the Day 25 horde after the fix:

| bot, difficulty | faced | survived | weakest door or window at its start | Life at its start | stamina at its start | broke an opening | survived a breach |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| forager, Relaxed | 50 | 50 | 92 % | 100 | 51 | 14 | 14 of 14 |
| forager, Normal | 50 | 39 | 92 % | 74 | 63 | 23 | 12 of 23 |
| forager, Hard | 47 | 31 | 92 % | 66 | 61 | 29 | 14 of 29 |

## What remains, against the source

Everything the forager exercises, compared with the extracted config (`src/data/gen`) and `research/`:

| what | the source | the sim | verdict |
| --- | --- | --- | --- |
| stamina to search a container | FurnitureFunc 1101 取出物资 / 1726 搜寻 "Stamina:-5" (every plain site container) | was 5, and 8 for 2×2 and larger | restored to 5 (below) |
| prying, picking a lock | 1501 强行撬开 "Stamina:-25", 1502 / 1832 解锁 "Stamina:-15" | 25 and 15 | matches |
| a locked container without the tool | each locked prop also ships a 查看 ("look") function, "Stamina:-5", no condition (e.g. car 67005: 1818 撬开 needs a crowbar, 1819 查看) | locked: nothing without the tool | not established. What 查看 yields depends on condition and reward tables that are not shipped (cond 9209, reward 9228), and the only research line says a crowbar opens the truck's cab (`https://steamcommunity.com/sharedfiles/filedetails/?id=3784534931`). The car holds no food either |
| loot per container | each prop names a loot group and `lootN` (the grocery shelf 884: 1) | tables built from item categories, `rolls` 2 for that shelf (`src/content/sites.js` header) | the groups are not shipped. Following `lootN` would give the shelves less, not more |
| food at the supermarket | "食物去外面超市可以撿一堆，吃到吐" (`https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359`) | a full search at no depletion holds 8.6 days of food on Normal (the Nearby Streets 2.5) | consistent |
| zombies per site, bite damage, bleeding, fight stamina, exposure surges | no values; the site is "a gamble against time and risk" (`https://store.steampowered.com/news/app/4164790`) | 2 zombies at the Nearby Streets, bites of 6 × danger × difficulty strength with a 20 % bleed of 24 Life (`src/sim/explore.js:834-838`), 4 stamina a swing (`:854`) | no source value |
| Life regeneration, when autonomy eats | no values | above 30 satiety (`src/sim/stats.js:170`); autonomy eats under 25 % (`src/sim/autonomy.js:17`) | no source value |

Apart from the search stamina, now restored, no value the forager depends on deviates from a source value, so no
sim change here can "restore the source". The
bands' sources do not contradict them either. For the gain band, the source says the supermarket feeds you, and less
after 8/13 (`https://steamcommunity.com/sharedfiles/filedetails/?id=3782585359`): "greatly reduced" is not "nothing". For the horde band, hordes
before Day 30 are held by repairs (`:77`), and the forager's repairs hold as well as the prepper's. Two readings of
the source are left for the reviewer:

- The forager as defined never reaches the supermarket the gain band cites. The Nearby Streets are open from 06:00 to
  20:00 and it leaves between 07:00 and 13:00, so the first open site is always the Nearby Streets.
- Line 82 goes on "沒關係，我們有草莓汁交易法" (never mind, we have the strawberry-juice trade): after 8/13 the guide's
  author fed themselves by trading, not by scavenging.

## Site action costs against the config

Every fixture of the six sites, its Config_Furniture functions and what their previews charge, against the sim
(`tests/explore-costs.test.js` pins the fixed ones to the previews, fixture by fixture). Research has no patch note
that changes a search or clearing cost; the only one on these actions (8/15, `https://store.steampowered.com/news/app/4164790`) makes
prying and examining cancellable with stamina charged on completion, which the sim already does.

| action | config | sim before | now |
| --- | --- | --- | --- |
| search a plain container, any size | 1101 取出物资, 1726 搜寻: "Stamina:-5" | 5; 8 for 4 tiles or more (the abandoned vehicle 66083 at the Nearby Streets) | **5 (fixed)** |
| unlock with a lockpick | 1502, 1832, 1834, 1838 解锁: "Stamina:-15" | 15 | 15 |
| pry the metal cabinet 9120 | 1501 强行撬开: "Stamina:-25" | 25 | 25 |
| pry the other locked props | 1740, 1744, 1766, 1770, 1804, 1806, 1812, 1816, 1818, 1822, 1824, 1826, 1828, 1830 撬开: no preview | 25; 28 for the 2×2 car 67005 and the 3×2 truck 882 | 25, as 1501 (the size term had no source; the previews pin no value) |
| push an obstacle aside | 1729, 1733 搬走: "Satiety:-15;Stamina:-25" | charged 10 satiety and 20 stamina, showed 25 | **15 and 25 (fixed)** |
| search times per container size | not in the config (the acts behind each function are not shipped) | 12, 18, 26, 30 minutes by tiles (`src/content/sites.js` SEARCH_MIN) | unchanged, no source |
| rest at a site | 1105 休息一会 on the bed 9122, no preview; 1721 搜寻 on the office sofa 42038, no preview | 60 minutes, 12 stamina an hour | unchanged, no source |
| travel, fights, carrying | no functions | travel 4 + 0.15 per minute, 4 a swing, 20 kg backpack | unchanged, no source |

Deviations in what the props offer, not in costs, listed for the architect and not changed: every locked prop also
ships a no-tool 查看 ("look", "Stamina:-5"; above); the pick-locked toolbox, safes and fire cabinet (9115, 67045, 67171, 67122)
ship only 解锁 and 查看, yet the sim lets a crowbar pry them too; the site bed 9122 ships 1506 搜索 ("Stamina:-15")
and 1606 查看 besides resting, and the office sofa 42038 ships 1721 搜寻, but the sim only rests on them.

## Experiments, not proposals

Each row is the fixed bot with one change, 50 seeds per difficulty, against the same prepper; nothing here is on the
branch. Gain is the forager's median days minus the prepper's (band +2 to +14); the horde columns are the Day 25
survival shares (bands ≥ 0.9, ≥ 0.9, ≥ 0.75).

| change | gain R / N / H / O | horde R / N / H |
| --- | --- | --- |
| this branch | +0.5 / 0 / −0.5 / −1 | 1.00 / 0.78 / 0.66 |
| the Ruined Supermarket first once it is open | 0 / −1 / −0.5 / −1.5 | 0.98 / 0.80 / 0.49 |
| when hurt at home, eat back above 30 satiety | +2 / +1 / −0.5 / 0 | 1.00 / 0.86 / 0.56 |
| both of the above | +3.5 / +1 / −0.5 / 0 | 0.98 / 0.87 / 0.52 |
| retreat at the sim's Tired (under 15 stamina plus the walk home) instead of 40 | 0 / 0 / −0.5 / −1 | 1.00 / 0.82 / 0.57 |
| fight or flee a zombie it sees coming, not only one that reached it | +0.5 / 0 / −0.5 / −1 | 1.00 / 0.84 / 0.62 |
| (sim) no bleeding from a bite at a site | +1 / +0.5 / −0.5 / −1 | 1.00 / 0.82 / 0.63 |
| (sim) one zombie at the Nearby Streets instead of two | 0 / +1 / 0 / −1 | 1.00 / 0.84 / 0.68 |
| (sim) no zombies at the sites at all | +1.5 / +2.5 / +2.5 / +3 | 1.00 / 0.92 / 0.76 |

No change to the bot's policy closes the gap: at the Ruined Supermarket (dark, four zombies) a trip searches 1.3
containers for 19 Life. Only a site without zombies lets the forager as defined hold the bands. Even then Relaxed
falls short (+1.5): its scavenging starts on Day 23, and the extra days end at the first cold wave and the Day 35
horde.

## What this leaves open

The two bot defects were the root cause of the P0 run's forager numbers, and they are fixed. The bands fail on what
remains, and each way out needs someone other than this package:

- **The site's combat economy is a design decision for the architect.** The values have no source (above). Anything
  that makes a site trip cheaper in Life (fewer or weaker zombies, rarer bleeding, fights that do not follow every
  bite) is a sim change without a source.
- **The definition is a decision for the reviewer.** A forager that goes to the supermarket, heals itself or goes for
  the food shelves first would be play `docs/BALANCE.md` does not describe today. The table shows none of these holds
  the bands alone.
- **The bands are a decision for the reviewer**, if the two readings of line 82 above are taken as the source
  contradicting a +2-day floor for the current version, or a horde floor equal to the prepper's.

## Reproduce

```sh
lockf -k /tmp/survival-logs-heavy.lock npm run balance    # docs/balance/P0.md and P0.json
node tools/balance/trace.mjs --bot forager --difficulty normal --seed 1026            # one session, day by day
node tools/balance/trace.mjs --bot forager --difficulty hard --seed 5062 --json t.json # the whole trace as JSON
node --test tests/balance-forager.test.js tests/explore-costs.test.js tests/balance-trace.test.js
```

`traceSession(opts)` and `describe(trace)` are exported for scripts; the JSON's types are documented at the top of
`tools/balance/trace.mjs`. The seeds of a balance run are 1009 k + 17 for k = 1 … 50.
