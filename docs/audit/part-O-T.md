# Feature audit — sections O, Q, R, S, T

Scope: FEATURES.md sections O (people: neighbor, phone, drone, trading), Q (rebirth loop and progression), R (endless
mode), S (codex, achievements, records) and T (mini-games). Section P (story) is out of scope. Every row was checked
against the source code, and every ✅ cites a Node test that exercises the behavior. Tests added for this audit live in
`tests/coverage_ot.test.js` (19 tests: 16 passing, 3 `todo` specs that encode confirmed gaps and do not fail the run).
Full suite `node --test tests/*.test.js` when the audit was written: 304 tests, 301 pass, 0 fail, 3 todo, and
`node tools/check_syntax.mjs` parsed 108/108 modules (HEAD `2c392f0` plus working tree, 2026-09-22). A later rerun with
other agents' uncommitted edits (363 tests) had 8 failures, all in their files (`tests/coverage_af.test.js`, K01 in
`tests/coverage_gn.test.js`, the duplex test in `tests/homes.test.js`); none were in `tests/coverage_ot.test.js`.
Suspected gaps were reproduced with scratch scripts before being reported.

**Result: 24 ✅ · 5 🟨 · 0 ⬜** (29 rows). Gap rows: O02, Q01, Q10, R03, S05.

Rating notes: ✅ means every clause is implemented and its logic is covered by a test. Where a clause is presentational
inside a tested row (a panel layout, a countdown label), the code was read and is cited, and the row keeps ✅. The story
files (`src/sim/story.js`, `src/sim/endings.js`, `src/content/events.js`) were committed mid-audit (`856c7d7`) and may
still change; rows that lean on them say so.

## O. People: neighbor, phone, drone, trading

| ID | Feature | Source | Status | Code | Test |
| --- | --- | --- | --- | --- | --- |
| O01 | Neighbor across the rooftops: rope-and-basket line (10 kg), send food/medicine, affinity hearts (5), return gifts, daily tasks, neighbor death, affinity partly carried over between loops | DL#6, N:08-12–08-28, G2 | ✅ | `src/sim/social.js` (repairBasket, sendBasket, syncHearts, deliverGift, issueRequest, neighborDaily, neighborDies); `src/content/people.js` (BASKET_MAX_KG, HEART_THRESHOLDS, NEIGHBORS, NEIGHBOR_REQUESTS); `src/ui/neighborPanel.js` (basket). Requests come every 2 days (daily during the third rescue task); the Warehouse Manager has no neighbor | `tests/social.test.js` › 'the basket line: repair on the terrace, 10 kg deliveries raise affinity, hearts and rescue progress, gifts come back'; `tests/social.test.js` › 'rescue tasks, text requests and five hearts set the Girl route tags'; `tests/social.test.js` › 'an ignored neighbor starves: TAG_NEIGHBOR_DEAD, or TAG_COMPANION_MAN_DEAD next door to the Student'; `tests/social.test.js` › 'affinity carries over from the last loop; the girl surviving to Day 30 with 3 hearts unlocks the College Student' |
| O02 | Cell phone: SMS threads, unknown numbers, community group chat with dated prompts and stances, food-sharing posts, ring/vibrate, unread badges | DL 06-03, N:08-15, N:08-28, N:09-12, G2 | 🟨 | `src/sim/phone.js` (sendSms, postGroup, postDuePrompts, groupReply, groupShareFood, toggleVibrate, notify, markRead, recount); `src/sim/social.js` (addUnknown, dronePackageFallback, coordTips); `src/content/people.js` (GROUP_PROMPTS, UNKNOWN_SURVIVORS, COORD_TIPS); `src/ui/phonePanel.js`. Ring/vibrate is a flag only: `phoneMessage` carries `sound` but nothing plays a ring or vibration | `tests/phone.test.js` › 'the homeowners' group chat posts its 15 prompts on their days'; `tests/phone.test.js` › 'taking a stance in the group chat counts group.reply once per prompt; some stances cost medicine'; `tests/phone.test.js` › 'food-sharing tasks: share a photo for morale, or deliver a portion of food to improve neighbor relations'; `tests/phone.test.js` › 'ring/vibrate toggle, unread badges and read state'; `tests/phone.test.js` › 'SMS threads: pre-disaster chat records for people met in shops, first texts on later days, the neighbor writes'; `tests/coverage_ot.test.js` › 'O02 unknown numbers: a courier leaves a drone at the door, a stranger asks for help, an airdrop tip sends the drone to coordinates' |
| O03 | Drone: trading with strangers (8 trading posts, trade value, daily quota, half-price buyback, one-click buy), scavenging dispatch, supply drops, respond to help requests, cargo hold, multiple drones | DL#6, N:08-14–09-17 | ✅ | `src/sim/social.js` (postsDaily, tradePartners, sellValue, executeTrade, completeTrade, maxBuyable, tradeQuota, syncDrones, idleDrone, runDroneOp, respondHelp, deliverSupplies); `src/content/people.js` (TRADING_POSTS); `src/ui/dronePanel.js` (droneTrade "Max" button, droneCargo, droneHelp, droneDeliver) | `tests/social.test.js` › 'drone trade: half-price buyback, refused goods, trade value, daily quota and trade counters'; `tests/social.test.js` › 'drone scavenging fills the cargo hold, counts for Aerial Scavenging and has a daily limit; loot runs sweep the yard'; `tests/social.test.js` › 'help requests join the survivor network; supply drops, letters, return gifts, deaths and aliveNetworkSurvivors'; `tests/coverage_ot.test.js` › 'O03 eight trading posts are on the air by Day 28; one-click buy stops at stock or drone capacity; a second drone flies while the first is out' |
| O04 | Survivor network: people met before the disaster, help requests with food countdowns, deaths, letters and return gifts | N:08-21, N:09-12, G2 | ✅ | `src/sim/social.js` (setupRoster, survivorsDaily, requestHelp, respondHelp, survivorAnswer, survivorDies); `src/sim/predisaster.js` (pre.metNpcs from shop NPC talks) | `tests/social.test.js` › 'help requests join the survivor network; supply drops, letters, return gifts, deaths and aliveNetworkSurvivors'; `tests/phone.test.js` › 'SMS threads: pre-disaster chat records for people met in shops, first texts on later days, the neighbor writes' |
| O05 | Shield of the Street: besieged trading posts; lure hordes with a drone; damaged posts for 15 days if ignored | N:09-04, N:09-08, G2 | ✅ | `src/sim/social.js` (shieldHourly, startLure, markShieldDefended, damagePost, postsDaily); story mode only (patch 09-08) | `tests/social.test.js` › 'Shield of the Street: distress after Day 50, the lure summons a horde, three defenses win; ignored posts are damaged' |
| O06 | Warehouse Manager rescue line: crowbar → truck note → feed him 10 times → character unlocked | N:08-14, N:08-15, G5 | ✅ | `src/content/sites.js` (supermarket truck, pry lock); `src/sim/social.js` (scanStoryItems, startWm, rescueDeliver, wmAnswer) | `tests/explore.test.js` › 'the Warehouse Manager's note is only in the Student's supermarket truck, behind a crowbar'; `tests/social.test.js` › 'Warehouse Manager rescue: the truck note starts it and 10 drone deliveries unlock him (College Student only)' |
| O07 | Veteran survivor feeding line | N:09-12 | ✅ | `src/sim/social.js` (veteranDaily, giveVeteran); `src/content/people.js` (VETERAN); `src/ui/neighborPanel.js` (giveSupplies) | `tests/social.test.js` › 'trapped veteran (Warehouse Manager run): satiety counted by remaining portions, stages give military supplies'; `tests/coverage_ot.test.js` › 'O07 feeding the trapped veteran to the last stage frees him (letter + supply-cache coordinates); a starved veteran is gone' |
| O08 | Doorstep cat event series with countdown choices | N:08-25, N:09-08 | ✅ | `src/sim/social.js` (catsHourly, startCatEvent, resolveCat, tickCatPending, catVisible); `src/content/people.js` (CAT_EVENTS); `src/ui/neighborPanel.js` (catEvent countdown) | `tests/social.test.js` › 'doorstep cat: countdown picks the default, feeding builds trust into new events, no visits during hordes' |

## Q. Rebirth loop and progression

| ID | Feature | Source | Status | Code | Test |
| --- | --- | --- | --- | --- | --- |
| Q01 | Death settlement: stats; Planning Points from days survived, record-breaking days, event rewards, carried over, rewind cost, departed people | N:07-10, N:08-18, N:09-12 | 🟨 | `src/sim/settlement.js` (LEDGER_KINDS, dailyCredit, addPoints, reconcilePoints, ledgerTotals); `src/ui/deathScreen.js` (keyStats, allStats); `src/ui/settlementPanel.js` (ledgerTable). The `departed` row is defined but never credited | `tests/settlement.test.js` › 'daily credit: base points, +1 per 10 days, record-breaking days and the difficulty multiplier'; `tests/rebirth.test.js` › 'rebirth-page abilities apply at the round start; tearing up refunds this round's abilities and is not a rebirth'; `tests/rebirth.test.js` › '"I want to persist!" restores a daily snapshot, costs Planning Points and sets the rebirth taboo'; `tests/coverage_ot.test.js` › 'Q01 (gap) people who die leave Planning Points on a separate "Left by the Departed" settlement row' (todo) |
| Q02 | Rebirth options: Rebirth (new loop), "I want to persist!" (rewind a few days for points), Tear Up This Round and Rewrite (restart this loop, full refund) | N:08-13, N:08-18, N:08-22 | ✅ | `src/sim/rebirth.js` (prepareNextLoop, takeSnapshot, rewindOptions, rewindTo, prepareTearUp, refundRoundAbilities); `src/ui/deathScreen.js` (showDeathScreen, confirmRebirth, confirmPersist, startTearUp, showRebirthPage) | `tests/rebirth.test.js` › 'prepareNextLoop carries points, abilities, memories and rebirth notes into the next cycle'; `tests/rebirth.test.js` › '"I want to persist!" restores a daily snapshot, costs Planning Points and sets the rebirth taboo'; `tests/rebirth.test.js` › 'rebirth-page abilities apply at the round start; tearing up refunds this round's abilities and is not a rebirth'; `tests/fullrun.test.js` › 'a full life: hoard before the outbreak, hold out for days, die, and carry progress into the next life' |
| Q03 | Abilities bought with Planning Points (Quick Rest, Efficient Eating, Emotional Management, Energy-Saving Metabolism, Psychological Construction, Effort-Saving Tricks, Hearty Meal Training, Energy Management, Thrifty, Daily Settlement Plan, Bulk Bargains, Broad Shoulders, Light Sleeper, Energy Storage, Deep Freezing, Proper Refrigeration, Savings) | G6, N:08-18, N:08-19, N:09-08, N:09-12 | ✅ | `src/content/abilities.js` (ABILITIES: all 17 plus 6 extras); `src/sim/rebirth.js` (buyAbility, abilityCost); `src/sim/modifiers.js` (computeMods); consumers: `src/sim/stats.js`, `src/sim/actions.js`, `src/sim/itemuse.js`, `src/sim/furnActions.js`, `src/sim/spoilage.js`, `src/sim/power.js`, `src/sim/settlement.js`, `src/sim/predisaster.js`, `src/sim/state.js`; `src/ui/deathScreen.js` (abilityList) | `tests/coverage_ot.test.js` › 'Q03 all seventeen named abilities are bought with Planning Points and change the simulation'; `tests/rebirth.test.js` › 'rebirth-page abilities apply at the round start; tearing up refunds this round's abilities and is not a rebirth' |
| Q04 | Planning Points interest (5%) | G4 | ✅ | `src/sim/settlement.js` (INTEREST, interestFor, dailyCredit) | `tests/settlement.test.js` › 'interest: 5% of a saved balance of 200 or more, capped at 25 per day' |
| Q05 | Rebirth notes (proficiency / recipe notes) carried into the next loop | N:08-14, N:08-31 | ✅ | `src/sim/rebirth.js` (NOTE_ITEMS, rebirthNotes, placeNotes, applyLoopStart). The config has no separate recipe-note item: the Compiled/Scattered Crafting, Farming, Cooking, Trap, Exploration and Defense Notes are the rebirth notes | `tests/rebirth.test.js` › 'prepareNextLoop carries points, abilities, memories and rebirth notes into the next cycle'; `tests/rebirth.test.js` › 'a new round puts the rebirth notes in the backpack; notes that do not fit drop at the survivor's feet' |
| Q06 | Knowledge memories recorded in the Survival Log (e.g., "blackout on Day 7") shown in later loops | DL#1, N:08-14 | ✅ | `src/sim/power.js` (remember, onDay early blackout warning); `src/sim/weather.js` (remember); `src/sim/story.js` (addMemory, event s_remember, quest memos); `src/sim/rebirth.js` (autoMemories, mergeMemories); `src/ui/journalPanel.js` (memoriesTab) | `tests/power.test.js` › 'grid power until the Day 7 blackout, then only own sources'; `tests/story.test.js` › 'knowledge memories are recorded once per loop'; `tests/story.test.js` › 'New Game+ unlocks advanced reinforcement at once and moves the unlock tasks up'; `tests/coverage_ot.test.js` › 'Q06 a knowledge memory from an earlier loop pays off: the remembered blackout shows in the crisis bar two days ahead' |
| Q07 | New Game+ adjustments (earlier 2F/basement/trap unlocks, direct advanced door repair/reinforce) | N:08-14, N:09-04 | ✅ | `src/sim/rebirth.js` (prepareNextLoop sets ngPlus); `src/sim/story.js` (isNgPlus, init, onOutbreak); `src/content/events.js` (NG_EARLY quests); `src/sim/furnActions.js` (availability: advanced reinforce); `src/sim/unlocks.js` (recipe 313) | `tests/story.test.js` › 'New Game+ unlocks advanced reinforcement at once and moves the unlock tasks up'; `tests/coverage_ot.test.js` › 'Q07 New Game+ from the second loop: advanced front-door reinforcement at once and the Enhanced Reinforcement recipe on Day 30' |
| Q08 | Daily settlement with choose-1-of-3 planning cards (Deep Cultivation, Scavenging, Endurance Drone, Capacity Upgrade ×3, Slow Roast and Fine Bake, Proper Storage, Fridge Management, …) | N:07-10, N:08-14, N:08-20, N:08-22, N:08-23 | ✅ | `src/sim/settlement.js` (settleDay, availableCards, offerCards, buyCard, applyCard); `src/content/planningCards.js` (PLANNING_CARDS); `src/ui/settlementPanel.js` (dailySettlement) | `tests/settlement.test.js` › 'the tick loop settles every new day once, with a yesterday summary and three plans to choose from'; `tests/settlement.test.js` › 'offers exclude owned plans and respect requires and character restrictions'; `tests/settlement.test.js` › 'buying a plan charges the Thrifty-discounted cost and applies mods, recipes and one-shot stats'; `tests/coverage_ot.test.js` › 'Q08 the named planning cards: Deep Cultivation, Scavenging, Endurance Drone, Capacity Upgrade I–III, Slow Roast and Fine Bake, Proper Storage, Fridge Management' |
| Q09 | Five proficiency systems (cooking, farming, crafting, trapping, exploration) + defense level; max-all achievement | A:2112, D:PlantLv, D:ProductionLv | ✅ | `src/sim/proficiency.js` (PROF, FIVE_SYSTEMS, addProfExp, checkAllMax); `src/sim/home.js` (defenseLevel, slotUsable); `src/meta/achievements.js` (2112) | `tests/coverage_ot.test.js` › 'Q09 five proficiency systems plus the defense level; maxing all five unlocks Renaissance Man (2112)' |
| Q10 | Character unlocks (Student via neighbor/ending; WM via rescue line or any ending) | N:08-14 | 🟨 | `src/sim/social.js` (neighborDaily Day-30 unlock, wmAnswer); `src/sim/endings.js` (triggerEnding); `src/meta/achievements.js` (NEXT_CHARACTER, onEnding, unlockCharacter). A Wage Slave ending never unlocks the Warehouse Manager | `tests/social.test.js` › 'affinity carries over from the last loop; the girl surviving to Day 30 with 3 hearts unlocks the College Student'; `tests/social.test.js` › 'Warehouse Manager rescue: the truck note starts it and 10 drone deliveries unlock him (College Student only)'; `tests/achievements.test.js` › 'character unlocks from events and endings'; `tests/coverage_ot.test.js` › 'Q10 (gap) any ending unlocks the next locked character: a Wage Slave ending unlocks the Warehouse Manager once the Student is unlocked' (todo) |

## R. Endless mode

| ID | Feature | Source | Status | Code | Test |
| --- | --- | --- | --- | --- | --- |
| R01 | Story Endless (after an ending) and Pure Endless (fresh start, starting attribute points, narration) | N:08-19, N:08-27 | ✅ | `src/meta/endless.js` (applyEndlessStart, sanitizeAlloc, endlessPoints, enterStoryEndless, endlessScreen with NARRATION); `src/sim/endings.js` (continueAfterEnding); `src/ui/endingScreen.js` ("Refusing to Take a Bow") | `tests/achievements.test.js` › 'endless states (2401-2404), Pure Endless setup and Story Endless'; `tests/endings.test.js` › 'Refusing to Take a Bow continues in Story Endless without another ending'; `tests/coverage_ot.test.js` › 'R01 Pure Endless starts on the outbreak night with allocated max-stat points, narration and no neighbor; starting points grow with endings and achievements' |
| R02 | Threat level escalation, horde variations, overrun exploration points | A:2404, N:09-12 | ✅ | `src/sim/horde.js` (scheduleEndless, endlessStrength, endHorde threat +1, threatLevel); `src/sim/explore.js` (rollOverrun). Variation is by threat (waves, large zombies, hp/damage); N:09-12 announces real wave variants only for the October update | `tests/horde.test.js` › 'endless mode: a horde every 5–7 days with a rising threat level'; `tests/explore.test.js` › 'endless mode: hordes overrun exploration points (marked, unreachable); story mode never'; `tests/coverage_ot.test.js` › 'R02 endless hordes vary with the threat level: more waves, more large zombies, tougher zombies' |
| R03 | Endless-specific initial recipes and staged area unlocks | N:08-15, N:08-17, N:08-19 | 🟨 | `src/meta/endless.js` (ENDLESS_RECIPES, applyEndlessStart). No staged unlock tasks exist for endless runs | `tests/achievements.test.js` › 'endless states (2401-2404), Pure Endless setup and Story Endless' (initial recipes only) |
| R04 | Longest-survival record per character; daily choose-1-of-3 continues past Day 200 | N:08-27, N:09-17 | ✅ | `src/meta/endless.js` (updateEndlessRecords, endlessRecordText); `src/ui/hud.js` (endless banner); `src/ui/menus.js` (character cards); `src/sim/settlement.js` (settleDay, availableCards) | `tests/achievements.test.js` › 'endless states (2401-2404), Pure Endless setup and Story Endless'; `tests/settlement.test.js` › 'Endless runs keep the choose-one-of-three going past Day 200'; `tests/coverage_ot.test.js` › 'R01 Pure Endless starts on the outbreak night with allocated max-stat points, narration and no neighbor; starting points grow with endings and achievements' |

## S. Codex, achievements, records

| ID | Feature | Source | Status | Code | Test |
| --- | --- | --- | --- | --- | --- |
| S01 | Codex: Food 173, Dishes 493, Plants 34, Prey 19, Crafts 124, Furniture 87 with unlock tracking and details | D:codex | ✅ | `src/meta/codex.js` (runCodexIds, mergeRunCodex, codexCompletion); recorders: `src/sim/itemuse.js` (markCodex), `src/sim/cooking.js`, `src/sim/farming.js`, `src/sim/traps.js`, `src/sim/crafting.js`, `src/sim/home.js` (installFurniture); `src/ui/codexPanel.js` (entryInfo, detail) | `tests/codex.test.js` › 'codex tables match the config sizes'; `tests/codex.test.js` › 'merging a run into history keeps ids unique, drops unknown ones and adds installed furniture'; `tests/coverage_ot.test.js` › 'S01 every entry of the six codex collections has a detail card with a name and stats' |
| S02 | Codex milestones with souvenir rewards (Shelter, Home Sweet Home, Blueprint Progress, …) | G2, N:08-23, N:08-27 | ✅ | `src/content/milestones.js` (MILESTONES, 15 souvenirs); `src/meta/codex.js` (checkMilestones, syncSouvenirRecipes); `src/sim/crafting.js` (unlockedRecipeIds) | `tests/codex.test.js` › 'codex milestones unlock souvenir recipes at the right counts'; `tests/codex.test.js` › 'souvenir recipes apply to every save' |
| S03 | 93 achievements with progress, hidden ones, config thresholds | D:Achievement, A:* | ✅ | `src/meta/achievements.js` (ACHIEVEMENTS, SPECIAL, checkAchievement, achievementProgress, evaluateAchievements, accumulateLifetime); `src/ui/achievementsPanel.js`. Every predicate reads data that something in `src/` produces (see below) | `tests/achievements.test.js` › 'config: 93 achievements with Steam English names, descriptions and global unlock rates' (plus the 16 predicate tests in that file); `tests/coverage_ot.test.js` › 'S03 hidden achievements and config thresholds drive the list and its progress bars'; `tests/coverage_ot.test.js` › 'S03 clue achievements read the per-line counters the story keeps: Puzzle (1203), Deep in the Hospital (2304), Name on the Delivery Slip (1223)' |
| S04 | Survivor profile with badges, titles, Defense Line dimension | N:08-27 | ✅ | `src/meta/profile.js` (BADGES, TITLES, DIMENSIONS, dimensionScores, refreshProfileAwards, profileSummary); `src/ui/profilePanel.js` | `tests/achievements.test.js` › 'evaluateAchievements unlocks once with a timestamp; profile badges and titles follow' |
| S05 | Run statistics / survival archive (aid count, kills, trades, …) | N:08-19, N:08-20 | 🟨 | `src/meta/profile.js` (PROFILE_STATS, profileSummary, pushRecord); `src/ui/deathScreen.js` (keyStats, allStats); `src/ui/journalPanel.js` (statsTab); `src/sim/settlement.js` (summarizeDay, COUNTER_LABELS). The aid count (`survivor.aid`) is recorded but not labelled or archived | `tests/coverage_ot.test.js` › 'S05 the survival archive lists lifetime kills, trades and the other run statistics'; `tests/settlement.test.js` › 'the tick loop settles every new day once, with a yesterday summary and three plans to choose from'; `tests/coverage_ot.test.js` › 'S05 (gap) the aid count (supplies delivered and gifted to survivors) is shown in the archive' (todo) |

## T. Mini-games

| ID | Feature | Source | Status | Code | Test |
| --- | --- | --- | --- | --- | --- |
| T01 | Five TV mini-games (Snake, Space Invaders, +3) with high-score boards incl. NPC scores; needs a game console | G2, N:08-27 | ✅ | `src/ui/tvGames.js` (FACTORIES: snake, invaders, breakout, stack, runner; tvgames panel); `src/meta/profile.js` (TV_GAMES, tvLeaderboard, submitTvScore, consoleAtHome, rewardTvPlay); `src/content/funcSpecs.js` (219) | `tests/coverage_ot.test.js` › 'T01 five TV mini-games play to a game over with a score; the TV needs a game console; the handheld adds a daily bonus'; `tests/achievements.test.js` › 'TV Enthusiast reads the best score of any mini-game; misc hidden achievements' |
| T02 | Darts, yoga, treadmill running, reading (daily max), paper planes | D:FurnitureFunc | ✅ | `src/content/funcSpecs.js` (201 darts, 35 yoga, 200 run, 328 bookshelf read, 226 paper plane); `src/sim/furnActions.js` (availability: config `daily` cap, `stat` kind); `src/sim/actions.js` (applyCostsAndGains) | `tests/coverage_ot.test.js` › 'T02 darts, yoga, treadmill running and bookshelf reading once a day each; paper planes out of the window use up a plane' |

## Gaps

- **O02 — ring/vibrate has no effect.** `toggleVibrate` flips `state.social.phone.vibrate` and `notify()` emits
  `phoneMessage { sound: 'ring' | 'vibrate' }`, but nothing plays either sound. `src/engine/audio.js` has no
  `phoneMessage` handler and no ring or vibration SFX, and `src/ui/phonePanel.js` only refreshes the window. Patch 08-15:
  "When switched to vibrate, new messages no longer ring but instead produce vibration sounds from the Cell Phone's
  location." Fix in `src/engine/audio.js`: add `ring` and `vibrate` entries to the SFX table and, in `start()`,
  `on('phoneMessage', (p) => playSfx(p.vibrate ? 'vibrate' : 'ring'))` (skip `silent` messages, which already emit
  nothing). The threads, unknown numbers, group chat, food posts and badges are implemented and tested. Audio: needs a
  browser check once added.
- **Q01 — no "departed people" points.** `LEDGER_KINDS.departed` ("Left by the Departed") exists, is counted as earned
  (`EARNED`), and the Planning Points help text promises it. But no code calls `addPoints(state, n, 'departed')`, so the
  row never appears. Patch 09-12: "Planning Points left by departed individuals will also be listed separately on the
  settlement page." Fix in `src/sim/social.js`: call `addPoints(state, amount, 'departed', { note: id })` (import from
  `src/sim/settlement.js`) in `neighborDies()` and `survivorDies()`, and optionally when the veteran leaves in
  `veteranDaily()`. Scale the amount by what the player invested (for example `5 + 2 × deliveries`). The rest of the row
  (stats, days survived, record days, event rewards, carried over, rewind cost) is implemented and tested. Executable
  spec: `tests/coverage_ot.test.js` › 'Q01 (gap) …' (todo).
- **Q10 — a Wage Slave ending never unlocks the Warehouse Manager.** Ending unlocks go through
  `NEXT_CHARACTER = { wage: 'student', student: 'warehouse' }` in `src/meta/achievements.js` (`onEnding`) and
  `src/content/endings.js` (used by `triggerEnding` in `src/sim/endings.js`). If the Student is already unlocked (for
  example via the neighbor line on Day 30), a Wage Slave ending unlocks nobody. Patch 08-14: "completing any ending will
  also unlock the next available character." Fix in `src/meta/achievements.js` `onEnding()`: unlock the first id in
  `CHARACTER_ORDER` that `history.characters` does not have yet, instead of `NEXT_CHARACTER[character]`. In
  `src/sim/endings.js` `triggerEnding()`, emit `unlockCharacter` with `{ next: true }` and let the history side choose
  the id; also update the Warehouse Manager `unlockHint` in `src/content/characters.js`. Executable spec:
  `tests/coverage_ot.test.js` › 'Q10 (gap) …' (todo).
- **R03 — no staged area unlocks in endless mode.** Pure Endless adds `ENDLESS_RECIPES`, but no area-unlock tasks run at
  all. Story quests (`startQuest`, `src/sim/story.js` line 669) and non-random events (`eventEligible`, lines 464–465)
  only run when `meta.mode === 'story'`, and story objectives are hidden outside story mode (line 1243). So a Pure Endless
  Warehouse Manager never gets the `wmColdKey` / `wmGarage` / `wmCabinKey` tasks. Worse, the garage key (item 9069) comes
  only from the story event `wm_garageKey`, so the garage can never be opened; an 8-day scratch run confirmed no quests
  and no 9069. Patch 08-17: "In endless mode, the warehouse manager's home cold storage room, left cabin, garage, and
  right area will have their unlock tasks gradually released during the first few days of the game." Fix in
  `src/meta/endless.js`: give the `endless` system an `onDay(state, day)` that, for `pureEndless` runs in the `warehouse`
  home, releases one task per day with an objective from `registerObjectives`:
  - Day 1: open the cold storage (recipe 326 is already craftable).
  - Day 2: put item 9069 in the cold room or on the doorstep.
  - Day 3: open the left cabin (recipe 324).

  Alternatively, let those three quests and events run in `pureEndless` in `src/sim/story.js`. The "right area" from the
  patch has no lock in `src/content/homes.js` (warehouse locks: coldStorage, cabin, garage, B1).
- **S05 — aid count missing from the archive.** Food sent to survivors is counted in `counters['survivor.aid']`
  (`respondHelp`, `deliverSupplies` in `src/sim/social.js`), but four places ignore it:
  - `COUNTER_LABELS` (`src/sim/settlement.js`) has no label, so the death screen's "View all stats" and the journal's
    Stats tab show the raw key "survivor.aid".
  - The death screen's `KEY_STATS` (`src/ui/deathScreen.js`) omits it.
  - The profile's survival archive `PROFILE_STATS` (`src/meta/profile.js`) omits it.
  - It isn't folded into history via `LIFETIME_KEYS` (`src/meta/achievements.js`).

  Neighbor basket deliveries (`neighbor.delivery`), Warehouse Manager rescue drops (`wm.delivery`) and veteran feeding
  (`veteran.fed`) are separate counters that no aid count aggregates. Patch 08-20: "Aid Count" in completion settlements
  and archives, "Delivering and gifting supplies to survivors will now be correctly counted." Fix: add
  `'survivor.aid'` to those four lists, and bump it (or an aggregate `aid.count`) in `sendBasket`, `rescueDeliver` and
  `giveVeteran`. Kills, trades and the other statistics are implemented and tested. Executable spec:
  `tests/coverage_ot.test.js` › 'S05 (gap) …' (todo).

### Other findings (not row-blocking)

- **Light Sleeper does half of what it says.** `src/content/abilities.js` describes it as "Wake up automatically when
  zombies attack; sleep needs 20% less time", but only the shorter sleep exists (`src/sim/furnActions.js`, sleep
  `begin`). Everyone wakes on a breach regardless (`src/sim/horde.js` `breach`). Either wake a sleeping Light Sleeper
  when a horde starts (in `startHorde`: `if (getMods(state).lightSleeper && state.player.sleeping) cancelCurrent(state)`)
  or reword the description.
- **Deep Cultivation's planting-exp bonus can lag.** `addProfExp` reads the cached `state._mods?.plantExp`
  (`src/sim/proficiency.js`), which is stale between buying the card and the next `getMods` call. Use
  `getMods(state).plantExp`.
- **Advanced Repair is never gated (F07 scope).** Advanced Repair (+500, funcs 221/222/2128/2130) is available in the
  first loop too; `availability()` in `src/sim/furnActions.js` gates only advanced reinforcement. The NG+ "use Advanced
  Repair directly" change (patch 09-04) therefore makes no visible difference.
- **2206 is easier than the config says.** "Pulled Through" is an Endless-category achievement ("在无尽模式中累计挺过 30
  波尸潮"), but its `wave.survived` fallback `progress.hordesSurvived` also counts story hordes, so it can be earned
  outside endless.
- **Stranger ending depends on pre-disaster chats.** The survivor network is seeded from `state.pre.metNpcs` (shop NPCs
  actually talked to). A story run that talks to nobody before the outbreak gets only the four unknown numbers, so the
  Stranger ending's "≥6 supported survivors alive on Day 71" (P07) needs at least two pre-disaster conversations.

## Achievements with unreachable predicates

**None at the time of writing.** All 93 predicates in `src/meta/achievements.js` (the `SPECIAL` table plus the config
counter thresholds) were traced to the code that writes what they read. `src/data/gen/*` was excluded from the search so
config text couldn't mask a missing producer.

- **Fixed during the audit.** At the start of the audit, **1223 Name on the Delivery Slip** read `clue.supply`, which
  nothing produced (`src/sim/story.js` wrote `clue.slip`), so it could never unlock. Commit `856c7d7` changed it to read
  `clue.slip`, and **1203 Puzzle** now reads `clue.truth`. Both counters are written by `noteClue()` in
  `src/sim/story.js`. `tests/coverage_ot.test.js` › 'S03 clue achievements read the per-line counters …' pins the
  predicates.
- **Depends on the in-progress story files.** These are reachable only through `src/sim/story.js`,
  `src/sim/endings.js` or `src/content/events.js`: 1005 (TAG_RECKONING, with a Day-70 fallback), 1006 (`story.route`),
  1101–1114 (endings), 1202 (stranger route), 1203/1223/2304 (clue counters), and 3001–3008 (need an ending). 1007 and
  2207 also get TAG_FINAL_WAVE_SURVIVED from `src/sim/horde.js`. 2111 also has the `floors.both` fallback in
  `src/sim/furnActions.js`.
- **Reachable, but only in certain ways.** None of these block the achievement:
  - **2111** Underground and Rooftop can't be earned as the Warehouse Manager, whose home has no 2F (floors 1F, B1).
    The Wage Slave and the Student can earn it, and achievements are global.
  - **1222** Supply Chain counts only the 8 trading posts as "strangers" (survivor contacts don't), so every post must be
    traded with; all 8 are online by Day 28.
  - **9004** Collector needs the 8 codex milestones behind souvenirs 9300–9307. A source check (shop shelves, loot pools,
    packs, trade stocks, crop yields, dish/craft outputs, rot products and literal ids in content and sim) finds sources
    for 169/173 foods (need 165), ~492/493 dishes (need 405 and 330), 34/34 plants (need 33 and 30), 124/124 craft
    recipes (need 115 and 90) and 87/87 furniture (need 84). This is plausible but was not verified by play.
  - **2113** Blueprint Collector: all 124 crafting-codex recipes have an unlock path (crafting level, planning card, story
    event, site papers, horde blueprint, codex milestone, drone quest, or the endless list).

Producer map (what each predicate reads → where it is written):

| Achievements | Reads | Produced by |
| --- | --- | --- |
| 1001–1004, 1008 | days survived | `src/meta/endless.js` (daysSurvived, from the clock) |
| 1005, 1006, 1007 | TAG_RECKONING / day ≥ 70; `story.route`; TAG_FINAL_WAVE_SURVIVED / day ≥ 88 | `src/sim/story.js` (onDay 70, commitRoute); `src/sim/horde.js` (endHorde), `src/sim/endings.js` (markFinalWaveSurvived) |
| 1101–1114 | `run.ending`, `history.endings`, `history.endingsByChar` | `src/sim/endings.js` (triggerEnding → `endingReached`) → `src/meta/achievements.js` (recordEnding) |
| 1201, 2110 | `power.allTypes`, `power.own`, `power.homePowered` | `src/sim/power.js` |
| 1202 | `camp.prep.supply` + stranger route | `src/sim/social.js` (deliverSupplies) |
| 1203, 1223, 2304 | `clue.truth`, `clue.slip` (+ supply route), `clue.hospital` | `src/sim/story.js` (noteClue, via `storyItemClaimed` from `src/sim/explore.js` and home polling) |
| 1211 | `PlantPotCount` / planters at home | `src/sim/farming.js`; installed furniture |
| 1212, 2101–2103, 9006 | `cook.perfect`, `cook.count`, `cook.midnight` | `src/sim/cooking.js` |
| 1213 | TAG_NEIGHBOR_ENDING_COZY | `src/sim/social.js` (syncHearts at 5 hearts) |
| 1221, 2009 | satiety / items / storage at home | inventories (homeStock) |
| 1222, 2305–2307 | `trade.stranger.partner`, `trade.active.dealcount` | `src/sim/social.js` (completeTrade) |
| 2001–2007 | `pre.kg`, `snap.money` / `pre.moneyLeft`, `pre.points`, `pre.foodTypes`, `pre.matTypes` | `src/sim/predisaster.js`; `src/meta/achievements.js` (snapshotOutbreak) |
| 2008, 2011, 2012 | stats; effective max / `progress.maxOver150` | `src/sim/stats.js` (raiseMax), abilities (maxAdd) |
| 2010 | `food.rot` / `taboo.foodRot` | `src/sim/spoilage.js` |
| 2104–2106, 9003 | `plant.harvest`, `plant.perfect`, `plant.harvest.flower` | `src/sim/farming.js` |
| 2107, 2108, 2208 | `trap.place`, `trap.catch`, `ratCatch` | `src/sim/traps.js` |
| 2109, 2113 | `craft.total`; crafting codex | `src/sim/crafting.js` |
| 2111 | `floors.both` / TAG_FLOOR_* | `src/sim/furnActions.js` (unlockArea); `src/sim/story.js` (pollWorld) |
| 2112 | `prof.allmax` | `src/sim/proficiency.js` (checkAllMax) |
| 2201, 2202, 2405 | `zombie.kill` | `src/sim/horde.js`, `src/sim/explore.js`, `src/sim/story.js` |
| 2203 | `defense.spike/net/chainsaw` / placed devices | `src/sim/horde.js` |
| 2204, 2206, 2209 | `crisis.doorHeld80`, `wave.survived` / hordesSurvived, `crisis.survived` | `src/sim/horde.js`; `src/sim/weather.js` (cold wave) |
| 2205 | door 30002 + windows 35002 | Heavy Doors card → recipes 407/408 (`src/content/planningCards.js`) |
| 2207 | TAG_FINAL_WAVE_SURVIVED, `siege.final.kill`, `taboo.siegeDoorWorn` | `src/sim/horde.js`; `src/meta/achievements.js` (trackTaboos) |
| 2301–2303, 2309 | `explore.total`, `explore.points.distinct`, `marketLoot` | `src/sim/explore.js` |
| 2308 | `drone.foraging.count` | `src/sim/social.js` (scavenging mission) |
| 2401–2404 | `meta.endlessState`, threat | `src/meta/endless.js`; `src/sim/horde.js` (`crises.threat`, `endless.threat`) |
| 3001–3008 | an ending + `taboo.*` (rebirth, explore, overspend, doorWorn, meat, trade, neighbor, lowVitality) | `src/sim/rebirth.js`, `src/sim/explore.js`, `src/sim/predisaster.js`, `src/sim/horde.js` / `src/sim/story.js` / `src/meta/achievements.js`, `src/sim/itemuse.js`, `src/sim/social.js`, `src/sim/stats.js` |
| 9001 | `group.reply` | `src/sim/phone.js` (groupReply, groupShareFood) |
| 9002 | `tvgame.best` / `history.tvBest` | `src/meta/profile.js` (submitTvScore, called from `src/ui/tvGames.js`) |
| 9004 | souvenirs 9300–9307 installed | codex milestones → souvenir recipes (`src/meta/codex.js`) |
| 9005 | `bath.ice` | `src/sim/furnActions.js` (iceBath) |

## Tests added (`tests/coverage_ot.test.js`)

- 'O02 unknown numbers: a courier leaves a drone at the door, a stranger asks for help, an airdrop tip sends the drone to coordinates'
- 'O03 eight trading posts are on the air by Day 28; one-click buy stops at stock or drone capacity; a second drone flies while the first is out'
- 'O07 feeding the trapped veteran to the last stage frees him (letter + supply-cache coordinates); a starved veteran is gone'
- 'Q01 (gap) people who die leave Planning Points on a separate "Left by the Departed" settlement row' (todo)
- 'Q03 all seventeen named abilities are bought with Planning Points and change the simulation'
- 'Q06 a knowledge memory from an earlier loop pays off: the remembered blackout shows in the crisis bar two days ahead'
- 'Q07 New Game+ from the second loop: advanced front-door reinforcement at once and the Enhanced Reinforcement recipe on Day 30'
- 'Q08 the named planning cards: Deep Cultivation, Scavenging, Endurance Drone, Capacity Upgrade I–III, Slow Roast and Fine Bake, Proper Storage, Fridge Management'
- 'Q09 five proficiency systems plus the defense level; maxing all five unlocks Renaissance Man (2112)'
- 'Q10 (gap) any ending unlocks the next locked character: a Wage Slave ending unlocks the Warehouse Manager once the Student is unlocked' (todo)
- 'R01 Pure Endless starts on the outbreak night with allocated max-stat points, narration and no neighbor; starting points grow with endings and achievements'
- 'R02 endless hordes vary with the threat level: more waves, more large zombies, tougher zombies'
- 'S01 every entry of the six codex collections has a detail card with a name and stats'
- 'S03 hidden achievements and config thresholds drive the list and its progress bars'
- 'S03 clue achievements read the per-line counters the story keeps: Puzzle (1203), Deep in the Hospital (2304), Name on the Delivery Slip (1223)'
- 'S05 the survival archive lists lifetime kills, trades and the other run statistics'
- 'S05 (gap) the aid count (supplies delivered and gifted to survivors) is shown in the archive' (todo)
- 'T01 five TV mini-games play to a game over with a score; the TV needs a game console; the handheld adds a daily bonus'
- 'T02 darts, yoga, treadmill running and bookshelf reading once a day each; paper planes out of the window use up a plane'
