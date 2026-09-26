# Feature audit — sections G–N

Scope: FEATURES.md sections G (food & cooking), H (farming), I (crafting), J (electricity), K (traps & rodents),
L (weather), M (crises, hordes, defense) and N (exploration). Every row was checked against the source code, and every
"✅" cites a Node test that exercises the behavior. Tests added for this audit live in `tests/coverage_gn.test.js`
(31 tests, all passing; full suite `node --test tests/*.test.js` 286/286 at the time of writing). Suspected defects
listed under Gaps were reproduced with scratch scripts before being reported.

**Result: 47 ✅ · 13 🟨 · 0 ⬜** (60 rows).

Rating notes: a row is ✅ only when every clause is implemented and its logic is covered by a test. Where a clause is
purely presentational inside an otherwise tested row (a search box, a CSS colour, a minimap canvas), the code was read
and is cited, and the row keeps ✅. L04 is entirely visual and is 🟨 "UI: needs browser check".

## G. Food and cooking

| ID | Feature | Source | Status | Code | Test |
| --- | --- | --- | --- | --- | --- |
| G01 | 173 foods with satiety, morale, shelf life, weight, size, trade value, taste, wish power | D:Item | 🟨 | `src/data/gen/items.js` (ITEMS); `src/sim/itemuse.js` (eatItem); `src/sim/inventory.js` (instWeightG, dims); `src/sim/spoilage.js` (tickSpoilage); `src/sim/wishes.js` (wishPool); `src/ui/invgrid.js` (itemTooltip). `taste` is never read | `tests/core.test.js` › 'config data is complete'; `tests/coverage_gn.test.js` › 'G01: the 173 codex foods carry satiety, morale, shelf life, weight, size, trade value, taste and wish power; eating and wishes use them' |
| G02 | Eat raw vs cook; eating takes time; frozen ready meals eaten directly | DL 06-03, N:08-24 | ✅ | `src/sim/itemuse.js` (itemOps, eatItem raw-meat roll, useDurationMin, useItemAction) | `tests/actions.test.js` › 'eating food from the backpack takes time and restores satiety'; `tests/coverage_gn.test.js` › 'G02: raw ingredients can be eaten directly (raw meat risks an upset stomach, cooked dishes do not); eating takes time' |
| G03 | Cookers from config: fuel stove, large gas stove, microwave, electric oven, electric hot pot, kettle, coffee machine, juicer, etc. (food slots, fuel slots, speed, quality bonus, allowed recipes) | D:FurnitureCook | ✅ | `src/sim/cooking.js` (cookerConfig, cookerState, cookSeconds, qualityRoll, allowedRecipes, addTo); kettle: `src/content/funcSpecs.js` (1707) | `tests/cooking.test.js` › 'ingredients that fit no recipe become Dark Cuisine, and cookers restrict recipes'; `tests/cooking.test.js` › 'electric cookers need power and run on their own'; `tests/coverage_gn.test.js` › 'G03: every cooker reads its FurnitureCook row: food slots, fuel slots, starting fuel, speed and quality bonus' |
| G04 | Fuel heat values shown; fuels (gas canisters, alcohols, diesel, wood) | DL 06-03, D:Item cat 13 | ✅ | `src/sim/cooking.js` (isCookFuel, fuelHeat, fuelHours, burnFuel); `src/ui/cookPanel.js` (heatTip, cookTip, fuelBox) | `tests/cooking.test.js` › 'a fuel stove needs fuel, and cooking wine is not fuel'; `tests/coverage_gn.test.js` › 'G04: gas canisters, alcohols, diesel and wood fuel a stove with their heat values; food, liquor and documents do not' |
| G05 | 493 recipes: exact-ingredient special dishes win over tag-combo generic dishes; tier by ingredient price thresholds; Perfect/Good/Normal/Fail; Dark Cuisine fallback; seasonings | D:CookingRecipe, parser notes | ✅ | `src/sim/cooking.js` (matchRecipe, ingredientTier, resolveTier, qualityIndex, qualityChances) | `tests/core.test.js` › 'config data is complete'; `tests/cooking.test.js` › 'an exact ingredient set makes the special dish even when a tag combo would also fit'; `tests/cooking.test.js` › 'tag-combo dishes take their tier from ingredient prices'; `tests/cooking.test.js` › 'quality follows the recipe QualityMap and cooking proficiency'; `tests/cooking.test.js` › 'ingredients that fit no recipe become Dark Cuisine, and cookers restrict recipes'; `tests/coverage_gn.test.js` › 'G05: seasonings join tag combos and their price grades the dish' |
| G06 | Cooking proficiency levels, first-time recipe discovery XP, Lv2 direct fridge access | N:08-14, D:CookingRecipe | ✅ | `src/sim/proficiency.js` (PROF.cook, addProfExp); `src/sim/cooking.js` (recordDish, canUseFridge, cookSources) | `tests/cooking.test.js` › 'finished dishes count for achievements, the codex and cooking proficiency'; `tests/cooking.test.js` › 'Cooking Lv2 lets cookers take ingredients straight from the fridge' |
| G07 | Cookbook with stable ordering, near-match hints, recipe search/filter | N:07-10, N:09-17, N:09-12 | ✅ | `src/sim/cooking.js` (cookbook, potHints, fillRecipe); search box and filters: `src/ui/cookPanel.js` (cookbookView) | `tests/cooking.test.js` › 'the cookbook keeps a stable order, reports missing ingredients and fills the pot'; `tests/coverage_gn.test.js` › 'G07: cookbook entries mark near matches and undiscovered recipes until they are cooked' |
| G08 | Multi-serving dishes | N:07-14 | 🟨 | `src/sim/itemuse.js` (consumeOne); `src/ui/invgrid.js` (servings badge); dishes: `src/sim/cooking.js` (finishJob) are always single-serving | `tests/coverage_gn.test.js` › 'G08 (servings): multi-serving foods lose one serving per meal and weigh less as they go' (multi-use foods only) |
| G09 | Ration Press: compress food into flavored rations (incl. rat-flavored), 4 fragments → 1 block, sources backpack + fridge | N:08-22, N:08-23, N:08-24 | ✅ | `src/sim/cooking.js` (pressPreview, startPress, finishPress, pressSources, rationFlavor) | `tests/cooking.test.js` › 'the ration press compresses food into flavored blocks, fragments and rat rations' |
| G10 | Brewing barrel fermentation (Poor/Average/Strong alcohol), brewing-line satiety prompt | N:08-13, N:08-15, N:08-28 | ✅ | `src/sim/cooking.js` (brewStatus, brewPlan, startBrewing, finishBrew) | `tests/cooking.test.js` › 'the brewing barrel ferments food past the brewing line into alcohol' |
| G11 | Juicer, coffee machine; coffee drinks grant Caffeine | G3, N:09-09 | ✅ | `src/sim/cooking.js` (allowedRecipes, COFFEE_RECIPES, on('ate')) | `tests/cooking.test.js` › 'coffee from the coffee machine gives Caffeine'; `tests/cooking.test.js` › 'ingredients that fit no recipe become Dark Cuisine, and cookers restrict recipes' |
| G12 | Hot drinks & kettle against Cold | DL 06-03 | ✅ | `src/content/funcSpecs.js` (1707 kettle); `src/sim/itemuse.js` (eatItem, item 2913); `src/sim/cooking.js` (WARM_DISHES, on('ate')) | `tests/coverage_gn.test.js` › 'G12: the kettle boils a cup of hot water once a day; hot drinks and soups drive off Cold'; `tests/cooking.test.js` › 'the hot pot cooks a shared pot and the survivor eats until full' |
| G13 | Midnight Kitchen (cook at 3 AM); Student-only night recipes | A:9006, guide 3790003439 | ✅ | `src/sim/cooking.js` (isMidnight, recordDish, STUDENT_RECIPES, recallStudentRecipe, recipeUsable); `src/meta/achievements.js` (9006) | `tests/cooking.test.js` › 'finished dishes count for achievements, the codex and cooking proficiency'; `tests/cooking.test.js` › 'student-only recipes unlock at night for the College Student'; `tests/achievements.test.js` › 'TV Enthusiast reads the best score of any mini-game; misc hidden achievements' |

## H. Farming

| ID | Feature | Source | Status | Code | Test |
| --- | --- | --- | --- | --- | --- |
| H01 | Planters from config: flowerpots (S/M/L, clay, pest-proof, weed-proof, fertile, fine), plant-light boxes, thermostatic boxes, full-spectrum hydroponic station | D:FurniturePlant | ✅ | `src/sim/farming.js` (planterCfg, capacityOf, planterEnv, rollAnomalies) | `tests/farming.test.js` › 'pests, weeds and drought roll from plant odds; planter controls prevent them (H01, H02)'; `tests/farming.test.js` › 'light-hungry crops need sun by day or powered grow lights (H05)'; `tests/coverage_gn.test.js` › 'H01: every planter reads its FurniturePlant row: capacity, passive heat, powered light/heat, growth boost and pest control' |
| H02 | 34 plants: growth time, light need, cold resistance, pest/weed/drought odds, yields, perfect yield/rate, seed return, withering, harvest window | D:Plant | 🟨 | `src/sim/farming.js` (cropRate, rollAnomalies, ripen, harvestYield, tickPlanter). Config HarvestTime (`plant.window`) is never read | `tests/farming.test.js` › 'seeds go into tilled soil, grow to ripe and harvest into the backpack with exp, codex and counters (H02, H03)'; `tests/farming.test.js` › 'perfect crops use the perfect yield; only anomaly-free ones count toward Flawless Growth (S03)'; `tests/farming.test.js` › 'ripe crops wither after DecayTime and leave fertilizer when cleared (H02)'; `tests/coverage_gn.test.js` › 'H02: 34 codex plants with growth, light, cold, anomaly odds, yields, perfect yield/rate, seed return and withering' |
| H03 | Actions: till, plant, fertilize (basic/compound/advanced organic), water, de-pest, weed, harvest; E smart action; queued actions skip changed pots | N:08-17, N:08-21, N:08-22 | ✅ | `src/sim/farming.js` (validateFarmOp, DO, queuePlanting, farmSmartOp, registerKind('farm').begin) | `tests/farming.test.js` › 'fertilizer is taken from home storage and speeds growth by its bonus (H03, H04)'; `tests/farming.test.js` › 'E smart action picks pests > weeds > water > harvest; queued ops skip pots that changed (H03)'; `tests/farming.test.js` › 'rain waters outdoor planters and ends drought; indoor pots still need watering (H06)'; `tests/coverage_gn.test.js` › 'H03: compound and advanced organic fertilizer speed growth more than basic; a pot can be upgraded but not fertilized twice' |
| H04 | Fertilizer sources: toilet trips, compost bin (spoiled food, rotten meat) | DL#4, N:09-12 | 🟨 | `src/content/funcSpecs.js` (212); `src/sim/furnActions.js` (toilet kind); `src/sim/spoilage.js` (containerRate compost ×5, rotItem). Rotten meat never composts | `tests/actions.test.js` › 'food spoils into fertilizer, fridge slows it down'; `tests/coverage_gn.test.js` › 'H04: a toilet trip turns paper into basic fertilizer; the compost bin rots food into fertilizer five times faster' |
| H05 | Light sources: sun on balcony/terrace, daylight lamp, powered grow lights | N:08-14, N:08-24 | 🟨 | `src/sim/farming.js` (planterEnv: sun, ElectricLight, AddLight); `src/content/homes.js` (outdoor/sunny slots). Standalone lamps have no effect | `tests/farming.test.js` › 'light-hungry crops need sun by day or powered grow lights (H05)'; `tests/coverage_gn.test.js` › 'H05: the Student’s balcony gets full sun and her sunroom lets daylight in; indoor pots get none' |
| H06 | Weather effects: rain waters terrace planters; cold stops cold-sensitive crops | DL 06-03, N:08-18 | ✅ | `src/sim/farming.js` (tickPlanter raining/chill, rollAnomalies rainedOn, minGrowTemp) | `tests/farming.test.js` › 'rain waters outdoor planters and ends drought; indoor pots still need watering (H06)'; `tests/farming.test.js` › 'cold stops frost-tender crops; a cold wave kills them outdoors unless heated or indoors (H06, L03)' |
| H07 | Planting proficiency Lv0–5 (research first; −pest odds, +perfect odds; plant overview card) | D:PlantLv | ✅ | `src/sim/farming.js` (plantResearched, DO.research, rollAnomalies, ripen, 'farm.overview' objective); `src/sim/proficiency.js` (plantLevelRow) | `tests/farming.test.js` › 'planting needs one round of research at planting Lv0 (H07)'; `tests/coverage_gn.test.js` › 'H07: planting Lv2+ cuts anomaly odds, raises the perfect chance and shows the plant overview card' |
| H08 | Flowers → vases (arrangements for morale) | D:Item cat 15, N:08-27 | ✅ | `src/sim/farming.js` (queueVase, vaseArrange kind, tickVases) | `tests/farming.test.js` › 'flower harvests count for House of Flowers; a vase gives morale while fresh (H08)' |
| H09 | Boston Ivy defensive plant (Student) | G5 | ✅ | `src/sim/farming.js` (BOSTON_IVY, updateCounters, ivyDefense); `src/sim/horde.js` (defRedOf) | `tests/farming.test.js` › 'mature Boston Ivy on an outdoor planter guards the windows and keeps climbing (H09)'; `tests/coverage_gn.test.js` › 'H09: mature Boston Ivy on the Student’s balcony softens zombie hits on the openings' |

## I. Crafting and processing

| ID | Feature | Source | Status | Code | Test |
| --- | --- | --- | --- | --- | --- |
| I01 | Workbench (repair with manual; Day 6+ study-it-yourself path); slot crafting UI, auto-fill, preview, Craft Again, one-click organize, clear | N:08-15, N:08-19, N:08-26, N:08-31 | 🟨 | `src/sim/furnActions.js` (repairWorkbench / studyWorkbench kinds, availability); `src/sim/crafting.js` (autoFill, clearSurface, organizeSurface, craftAgain); `src/ui/craftPanel.js` (preview, buttons) | `tests/crafting.test.js` › 'auto-fill gathers only missing materials from backpack, drawer and tool cabinets; Clear returns them'; `tests/crafting.test.js` › 'crafting at the workbench takes LifeMin minutes and costs stamina on completion'; `tests/story.test.js` › 'the workbench manual is hidden at home, and from Day 6 it can be studied instead'; `tests/coverage_gn.test.js` › 'I01: the broken workbench is fixed with its manual; without it, studying opens up later; Organize packs the work surface' |
| I02 | 124 craft recipes from config (materials → product, perfect rate/outputs, failed outputs, level) | D:ProductionList | ✅ | `src/sim/crafting.js` (RECIPES / OFFICIAL_FIXES, performCraft, perfectChance, failChance) | `tests/crafting.test.js` › 'patch 09-09 official recipes: electronic components, playing cards, bandage, live trap'; `tests/crafting.test.js` › 'crafting above your level can fail and salvages the fail outputs'; `tests/crafting.test.js` › 'perfect crafting: recipe rate + level + cards, deterministic per seed'; `tests/coverage_gn.test.js` › 'I02: official craft recipes carry materials, products, perfect rate/outputs, failed outputs and a level; the codex list is craftable' |
| I03 | Manufacturing proficiency Lv1–5 (−stamina, +perfect rate) | D:ProductionLv | ✅ | `src/sim/crafting.js` (baseStamina, perfectChance, craftProfInfo); `src/sim/proficiency.js` (craftLevelRow) | `tests/crafting.test.js` › 'crafting at the workbench takes LifeMin minutes and costs stamina on completion'; `tests/crafting.test.js` › 'perfect crafting: recipe rate + level + cards, deterministic per seed' |
| I04 | Recipe unlocks via planning cards, events, notes/books, character restrictions (molotov: Wage Slave & Warehouse Manager only) | G2, G5, N:08-21 | ✅ | `src/sim/crafting.js` (unlockedRecipeIds, evaluate, restriction); `src/sim/story.js` (unlockRecipes); `src/sim/explore.js` (unlockRecipe); `src/sim/unlocks.js` (TIMED_UNLOCKS) | `tests/crafting.test.js` › 'recipe visibility and craftability follow crafting level and unlocks'; `tests/crafting.test.js` › 'Molotov recipes are only for the Wage Slave and the Warehouse Manager'; `tests/story.test.js` › 'warehouse keys unlock the cold storage, the garage and the cabin'; `tests/explore.test.js` › 'the hospital: three clues, the old recorder and the Ration Press papers (behind a hospital bed)' |
| I05 | Tool cabinet opened from the workbench; materials pulled from backpack, drawers, all tool cabinets | N:08-14, N:08-26 | ✅ | `src/sim/crafting.js` (craftSources, toolCabinets, autoFill); tabs: `src/ui/craftPanel.js` | `tests/crafting.test.js` › 'auto-fill gathers only missing materials from backpack, drawer and tool cabinets; Clear returns them' |
| I06 | Shredder / crusher breaks advanced materials down (powered, queued) | N:08-18, N:08-19 | ✅ | `src/sim/crafting.js` (breakdownOf, runShredder, shredderStatus); `src/sim/unlocks.js` (415) | `tests/crafting.test.js` › 'the shredder breaks advanced materials down over time while powered' |
| I07 | Recycle junk; dismantle furniture returns materials | D:FurnitureFunc 227–235 | 🟨 | `src/sim/home.js` (dismantle); `src/sim/furnActions.js` (dismantle kind; recycle kind is a no-op) | `tests/core.test.js` › 'dismantling starter junk yields materials; install checks slot types'; `tests/coverage_gn.test.js` › 'I07: dismantling a config furniture piece returns its RemoveGet materials' |
| I08 | Tools: lockpick, crowbar, tin-can noisemaker, pliers | D:Item cat 6 | 🟨 | `src/sim/explore.js` (canSearch, performSearch, exploreFight crowbar bonus); `src/content/funcSpecs.js` (235). Tin can and pliers unused | `tests/explore.test.js` › 'locked containers need a crowbar or a lockpick, and the tool breaks'; `tests/explore.test.js` › 'clicking a zombie queues a fight; a crowbar hits harder' |

## J. Electricity

| ID | Feature | Source | Status | Code | Test |
| --- | --- | --- | --- | --- | --- |
| J01 | City grid power until the blackout; circuit damage repaired with wire | DL#1, D:FurnitureFunc 223 | ✅ | `src/sim/power.js` (gridUp, noteGridChange, damageCircuit, repairCircuit, queueRepair) | `tests/power.test.js` › 'grid power until the Day 7 blackout, then only own sources'; `tests/power.test.js` › 'the grid only flickers on Days 4-6 before the blackout'; `tests/power.test.js` › 'storm damage cuts the circuit until it is repaired with wire' |
| J02 | Generators: manual (stamina), fuel S/M/L/XL (fuel slots and burn rates), solar S/M/L (weather + daylight), rat-cage generators (food-fed rodents) | D:FurnitureElectrical, DL 06-03 | ✅ | `src/sim/power.js` (solarStep, generatorStep, burn, fuelSlotCount, ratStep, manualGen kind) | `tests/power.test.js` › 'solar output follows daylight and the weather; basement panels get no sun'; `tests/power.test.js` › 'a fuel generator burns diesel from its fuel slots and powers the fridge'; `tests/power.test.js` › 'a manual generator injects energy into the batteries'; `tests/power.test.js` › 'a rat cage generates power while fed, then the rodents starve'; `tests/coverage_gn.test.js` › 'J02: every generator size reads FurnitureElectrical: solar 6/12/24 W, fuel generators with 3/5/8 slots and burn rates, manual gens, rat cages' |
| J03 | Batteries / storage (lead-acid, home station, UPS, XL) | D:FurnitureElectrical | ✅ | `src/sim/power.js` (batteryCapacity, storageCapacity, tickPower balance) | `tests/power.test.js` › 'batteries store surplus power and cover the draw once the generator stops'; `tests/coverage_gn.test.js` › 'J03: lead-acid battery, UPS, home station and XL storage hold 1000/2000/4000/8000 Wh and add up' |
| J04 | Power Overview Panel: per-appliance switches, draw vs generation, battery %, solar efficiency, stop reasons | DL 06-03, N:09-12 | ✅ | `src/sim/power.js` (powerOverview, setApplianceOn, setLights, unit reasons); `src/ui/powerPanel.js` | `tests/coverage_gn.test.js` › 'J04: the power overview lists sources, batteries, appliances and heaters with draw, generation, battery level and stop reasons'; `tests/power.test.js` › 'solar output follows daylight and the weather; basement panels get no sun' |
| J05 | Generator Auto Start threshold + auto shutdown at full | N:08-16 | ✅ | `src/sim/power.js` (setAutoStart, generatorStep, setBurner) | `tests/power.test.js` › 'Auto Start runs the generator below the threshold and stops it at full' |
| J06 | Appliance power draw; blackouts switch lights and fridges off | D:Furniture PowerCost | ✅ | `src/sim/power.js` (desiredDraw, priority, allocate, lightDraw) | `tests/power.test.js` › 'a brownout cuts appliances by priority and reports the change'; `tests/power.test.js` › 'grid power until the Day 7 blackout, then only own sources' |

## K. Traps and rodents

| ID | Feature | Source | Status | Code | Test |
| --- | --- | --- | --- | --- | --- |
| K01 | Traps: simple mousetrap, live trap, bird net, iron bear trap; durability; bait = food with satiety | D:Item cat 12, N:08-14, N:08-17 | ✅ | `src/sim/traps.js` (TRAP_TYPES, placeTrap, baitQuality, catchChancePerHour, rollCatch, removeTrap) | `tests/traps.test.js` › 'placing a trap from the backpack, baiting it and catching prey'; `tests/coverage_gn.test.js` › 'K01: the four trap types have their own durability; bait must have satiety; a worn-out trap stops and is not returned' |
| K02 | 19 prey types with rarity; per-floor / per-location odds | D:Item prey, DL 06-03, N:08-31 | 🟨 | `src/sim/traps.js` (rollCatch, HABITAT_BONUS, habitatOf). `TRAP_TYPES[].habitats` is never enforced | `tests/traps.test.js` › 'traps catch over time with bait; bird nets only work outdoors' (checks the label only); `tests/coverage_gn.test.js` › 'K02: all 19 codex prey can be caught; common prey outnumber rare ones and location shifts the odds' |
| K03 | Mouse cages S/M/L/XL: place mice, guinea pigs, lab mice; feed (one-click); power output; death notifications | N:08-16, N:08-17, N:09-12 | ✅ | `src/sim/power.js` (RODENT_SLOTS, LIVE_RODENTS, fillRodents, feedCage, ratStep, starve); `src/ui/powerPanel.js` (ratCage) | `tests/power.test.js` › 'a rat cage generates power while fed, then the rodents starve'; `tests/coverage_gn.test.js` › 'K03: mouse cages S/M/L/XL take mice, guinea pigs and lab mice, produce 6 W per fed rodent and report deaths' |

## L. Weather and environment

| ID | Feature | Source | Status | Code | Test |
| --- | --- | --- | --- | --- | --- |
| L01 | Weather: sunny, cloudy, rain, heavy rain, thunderstorm, snow, freezing rain, cold wave; tomorrow's forecast | DL 06-03, N:08-21, N:08-25 | ✅ | `src/sim/weather.js` (WEATHER_KINDS, rollDay, advanceWeather, forecast); forecast tip: `src/ui/hud.js` | `tests/weather.test.js` › 'weather rolls are deterministic per seed; the outbreak day is sunny and mild'; `tests/weather.test.js` › 'tomorrow's forecast becomes today's weather' |
| L02 | Temperature and Cold debuff; heating (AC, electric heater, fireplace, fuel heater), warm clothes, hot drinks | DL 06-03, N:08-23, N:08-31 | 🟨 | `src/sim/weather.js` (outdoorTemp, indoorTemp, heatingByFloor, feelCold, rollFever); `src/sim/power.js` (heaterStep, fireplace kind 1776); `src/sim/farming.js` (DO.warm). No warm clothing | `tests/weather.test.js` › 'indoor temperature: insulation per floor, and heat from a powered AC stays on its floor'; `tests/weather.test.js` › 'a fuel heater burns fuel for warmth without power'; `tests/weather.test.js` › 'the cold gives Cold, Warm protects, prolonged cold brings a fever'; `tests/coverage_gn.test.js` › 'L02: an electric heater warms its floor while powered'; `tests/coverage_gn.test.js` › 'G12: the kettle boils a cup of hot water once a day; hot drinks and soups drive off Cold' |
| L03 | Cold waves with warnings, gradual intensity, crop and power effects | DL 06-03, N:08-13, N:08-16 | ✅ | `src/sim/weather.js` (addColdWave, waveOffset, syncCrises, SUN_FACTOR); `src/sim/farming.js` (tickPlanter chill); `src/sim/power.js` (desiredDraw thermostat) | `tests/weather.test.js` › 'the first cold wave is announced days ahead, ramps up and leaves the crisis bar'; `tests/farming.test.js` › 'cold stops frost-tender crops; a cold wave kills them outdoors unless heated or indoors (H06, L03)'; `tests/coverage_gn.test.js` › 'L03: a cold wave switches heating on (power draw spikes) and starves the solar panels' |
| L04 | Visual effects: rain, snow, night lighting, flashlight | DL#6 | 🟨 | UI: needs browser check. `src/render/iso.js` (darkness overlay, flashlight beam, rain/snow particles); `src/ui/view.js` (homeView); `src/ui/explorePanel.js` (explore view) | `tests/coverage_gn.test.js` › 'L04 (view model): rain and snow reach the renderer outside the basement, lights at night with power, a dark basement and a flashlight at dark sites' (view model only) |

## M. Crises, hordes, defense

| ID | Feature | Source | Status | Code | Test |
| --- | --- | --- | --- | --- | --- |
| M01 | Scheduled hordes (Day 7, 15, …, 49/50, ~66, final Day 87) with warnings and a crisis-bar countdown turning red | N:08-15, G1, G3, G5 | ✅ | `src/sim/horde.js` (STORY_HORDES, hordeEntry, warnHorde, tickSchedule); red countdown: `src/ui/hud.js` (crisisBar `urgent` < 6 h), `styles.css` (.crisis.urgent) | `tests/horde.test.js` › 'Day 7 horde: warned two days ahead with a radio broadcast, attacks at 22:00 from the yard edge'; `tests/horde.test.js` › 'final horde on Day 87 sets TAG_FINAL_WAVE_SURVIVED; a fortress keeps Zero Breach' |
| M02 | Zombies path to doors/windows and damage them; large zombies | N:08-27, N:09-08 | ✅ | `src/sim/horde.js` (spawnZombie, pickTarget, nextStep, actZombie, hitOpening, ARCH.big) | `tests/horde.test.js` › 'zombies gnaw the door; repairs during the attack restore it'; `tests/horde.test.js` › 'large zombies: more hp, harder hits, and they only gnaw from the tile in front of the opening'; `tests/horde.test.js` › 'breaking in hurts the survivor; a long breach kills them' |
| M03 | Defense line outside: sandbags, spike barriers, electric nets, chainsaws; defense levels unlock areas (preview) | N:07-23, N:08-18, A:2203 | ✅ | `src/sim/horde.js` (DEVICES, runDevices, defenseSlotsInfo, queueInstallDefense); `src/sim/home.js` (slotUsable); `src/ui/defensePanel.js` | `tests/horde.test.js` › 'electric nets need power; nets and sandbags block the way'; `tests/horde.test.js` › 'spikes kill zombies: kill counters, defense exp and yard loot; the crisis resolves'; `tests/horde.test.js` › 'defense slots: locked by defense level, install packages via the survivor, Iron Wall helper'; `tests/horde.test.js` › 'final horde on Day 87 sets TAG_FINAL_WAVE_SURVIVED; a fortress keeps Zero Breach' |
| M04 | Molotov cocktails (poor/normal/strong) thrown at hordes | D:Item cat 16, N:08-19 | ✅ | `src/sim/horde.js` (MOLOTOVS, molotovTarget, throwMolotov, queueMolotov, runFires) | `tests/horde.test.js` › 'molotovs burn the densest group; stronger ones hit harder' |
| M05 | Counterattack / kill zombies; kill counters | N:08-12, A:2201 | ✅ | `src/sim/horde.js` (counterattack, queueCounterattack, killZombie) | `tests/horde.test.js` › 'counterattack through the door kills zombies and counts for First Blood'; `tests/horde.test.js` › 'spikes kill zombies: kill counters, defense exp and yard loot; the crisis resolves' |
| M06 | Horde rewards (supplies, Military Repair Kit ~Day 66, advanced defense blueprints) | G2, G3 | ✅ | `src/sim/horde.js` (hordeRewards, REWARD_POOL, BLUEPRINTS, STORY_HORDES reward 9048) | `tests/horde.test.js` › 'Day 66 horde hands over the Military Repair Kit'; `tests/horde.test.js` › 'spikes kill zombies: kill counters, defense exp and yard loot; the crisis resolves'; `tests/coverage_gn.test.js` › 'M06: beating the Day 15 and Day 25 hordes hands over the electric net and chainsaw blueprints' |
| M07 | Tense state when doors/windows near breaking | N:08-21 | ✅ | `src/sim/horde.js` (bookkeeping tense) | `tests/horde.test.js` › 'tense state while an opening is nearly broken during an attack' |
| M08 | Sporadic wandering zombies attacking the front door | N:08-31 | ✅ | `src/sim/horde.js` (rollSporadic, tickSporadic, pickTarget) | `tests/horde.test.js` › 'sporadic zombies start after Day 3 and go for the front door' |
| M09 | Rotten meat bait (strip/chunk/steak) summons a horde for rewards | N:08-26 | ✅ | `src/sim/horde.js` (BAIT, throwBait, tickBait, hordeRewards); `src/content/funcSpecs.js` (80032–80034) | `tests/horde.test.js` › 'rotten meat bait summons an extra wave after a crisis-bar countdown' |
| M10 | Radio warnings of approaching hordes with optional survive-until-next-warning mission | N:08-20 | ✅ | `src/sim/horde.js` (warnHorde, acceptRadioMission, completeRadioMission) | `tests/horde.test.js` › 'radio mission: accept, survive until the next warning, get supplies' |
| M11 | Other crises: city blackout, cold wave, mold crisis, thug encounter (with counterattack) | DL#1, N:08-13, N:08-26 | 🟨 | `src/sim/power.js` (noteGridChange); `src/sim/weather.js` (syncCrises); `src/sim/horde.js` (startThugs, resolveThugs); `src/sim/spoilage.js` (spreadMold, disinfect). Mold crisis is never surfaced | `tests/power.test.js` › 'grid power until the Day 7 blackout, then only own sources'; `tests/weather.test.js` › 'the first cold wave is announced days ahead, ramps up and leaves the crisis bar'; `tests/horde.test.js` › 'thug encounter: hand over supplies, counterattack, or wait them out'; `tests/coverage_gn.test.js` › 'M11: mold spreading in a container escalates into a Mold Crisis that disinfectant spray clears' |

## N. Exploration

| ID | Feature | Source | Status | Code | Test |
| --- | --- | --- | --- | --- | --- |
| N01 | Six exploration points: nearby streets, Hardware Store, Ruined Supermarket, Abandoned School, Abandoned Hospital, Construction Site / Office ruins | N:08-15, N:09-02, DL#6, A:2302 | ✅ | `src/content/sites.js` (SITES); `src/sim/explore.js` (siteLayout, freshState unlock days) | `tests/explore.test.js` › 'six exploration points with unlock days, hours, danger and valid maps' |
| N02 | Exploration scene: time limit, exposure risk, depth progress bar, Retreat, flashlight in the dark, searchable containers (E), minimap, free camera, zombies & hostile survivors | DL#6, N:08-27 | 🟨 | `src/sim/explore.js` (arrive, tickSite, addExposure, surge, performSearch, retreat, raiderTalkChance, raiderTribute, resolveStandoff); `src/ui/explorePanel.js` (view, drawMinimap); `src/main.js` (drag camera) | `tests/explore.test.js` › 'searching a container fills the backpack, raises exposure and depth, and trains exploration'; `tests/explore.test.js` › 'searching as an action: walk over, spend time and stamina, E-key default picks the nearest container'; `tests/explore.test.js` › 'the objective list shows depth and exposure, with a clickable Retreat'; `tests/explore.test.js` › 'a raider standoff waits for a choice; paying off hands over a third of the backpack'; `tests/coverage_gn.test.js` › 'N02: sites with opening hours count down to dark; noise and nightfall bring surges of zombies' |
| N03 | Opening hours; overrun points shown on the map | N:08-15, N:09-02 | ✅ | `src/sim/explore.js` (hoursInfo, siteStatus, rollOverrun); map: `src/ui/explorePanel.js` | `tests/explore.test.js` › 'opening hours: the Hardware Store and the Ruined Supermarket stay open at night'; `tests/explore.test.js` › 'endless mode: hordes overrun exploration points (marked, unreachable); story mode never' |
| N04 | Forced desperate exploration (high injury risk) | D:FurnitureFunc 209 | ✅ | `src/sim/explore.js` (startExploration forced, arrive FORCED_INJURY, goExplore kind); `src/content/funcSpecs.js` (209) | `tests/explore.test.js` › 'desperate exploration: ignores closing time, costs Life, once a day; the door spends it only on departure' |
| N05 | Exploration proficiency; Warehouse Manager highlights hidden supplies | G5 | ✅ | `src/sim/explore.js` (travelStamina, searchSeconds, rollLoot, clearSeconds); `src/content/characters.js` (highlightLoot); `src/ui/explorePanel.js` (exclaim) | `tests/explore.test.js` › 'the Warehouse Manager spots hidden stashes at a glance'; `tests/coverage_gn.test.js` › 'N05: exploration proficiency cuts travel stamina and search time; the Warehouse Manager sees hidden stashes marked' |
| N06 | Story clues and items in sites (hospital recorder + 3 clues, school drone, supermarket truck note, ration-press papers) | N:08-14, N:08-22, N:09-12, G2 | ✅ | `src/content/sites.js` (story / recipe fixtures); `src/sim/explore.js` (specialFinds, claimStoryItems, onClaim) | `tests/explore.test.js` › 'the hospital: three clues, the old recorder and the Ration Press papers (behind a hospital bed)'; `tests/explore.test.js` › 'the Warehouse Manager's note is only in the Student's supermarket truck, behind a crowbar'; `tests/explore.test.js` › 'the old teaching drone waits in the school for the Student's mid-game quest' |

## Gaps

- **G01** — The `taste` column (Config_Item Taste, present on all 173 codex foods) is imported into `src/data/gen/items.js`
  but never read: it isn't shown in the item detail tooltip and no mechanic uses it. Show it in `src/ui/invgrid.js`
  (itemTooltip) next to satiety and morale; if taste is meant to drive the eating mood, apply it in `src/sim/itemuse.js`
  (eatItem), e.g. as a morale bonus scaled by taste. Satiety, morale, shelf life, weight, size, trade value and wish power
  are all used and tested.
- **G08** — Cooked dishes are always single-serving. Dish outputs have UseTimes 0/1 in config, `finishJob`
  (`src/sim/cooking.js`) creates a plain instance, and `eatItem` (`src/sim/itemuse.js`) applies the whole satiety at once
  while `addStat` clamps it. Reproduced: eating a 170-satiety 全家桶 at 20 satiety leaves the survivor at 100 and the
  dish gone, so 90 satiety is wasted (the 07-14 patch says large dishes are eaten over several sittings). Fix: in
  `finishJob`, give dishes above a serving size (e.g. the recipe's `satStd`) `inst.uses = ceil(sat / serving)` and record
  the per-serving values in `inst.data`; in `eatItem`, when `inst.uses > 1`, apply one serving's satiety, morale and
  life. `consumeOne` already decrements `inst.uses`. Extend the servings badge in `src/ui/invgrid.js` (renderGrid,
  itemTooltip) and the serving-aware satiety counters (`foodSat` in cooking.js, `portionsOf` in social.js, the stockpile
  sum in story.js) from `cfg.uses > 1` to also cover `inst.uses > 1`.
- **H02** — Config_Plant HarvestTime (imported as `plant.window`: 108 h for every codex plant) is never read. The only
  harvest window is DecayTime (24 h): `tickPlanter` in `src/sim/farming.js` withers a ripe crop 24 h after `readyAt`.
  The feature's "harvest window" most plausibly maps to HarvestTime; if so, crops currently wither about 4.5× too early.
  Fix in `tickPlanter`: keep ripe crops harvestable for `p.window`, then wither (after `p.decay` more, if DecayTime is
  the rot phase), and show the countdown in `src/ui/farmPanel.js`. Everything else in the row is implemented and tested.
- **H04** — Rotten meat can't be composted. Strips, chunks and slabs (26008–26010) are category 16 with `life: -1` and no
  rot product, so `tickSpoilage` (`src/sim/spoilage.js`) skips them. Reproduced: a rotten meat strip is still in the
  compost bin after 30 days. Patch 09-12 says they turn into basic fertilizer after some time. Fix: in `tickSpoilage`,
  when `inv.special === 'compost'`, age the three rotten-meat ids (e.g. a `COMPOST = { 26008: days, … }` table) and
  replace each with 15501 when it expires. Toilet trips and composting spoiled food work and are tested.
- **H05** — Standalone lamps don't light planters. `planterEnv` (`src/sim/farming.js`) only counts sun, the planter's own
  `ElectricLight`/`AddLight` and the Greenhouse route. The LED plant grow light 64000 ("supplements light for nearby
  planting facilities"), its variants 340/396–400, and the basement "Daylight Lamp" (renamed in patch 08-14; config 80162)
  have no effect. Reproduced: an indoor pot next to a powered LED grow light still gets light 0. Fix: add a
  `nearbyLight(f, lamps)` beside `nearbyHeat`, counting powered, switched-on lamps on the same floor within
  `HEATER_RANGE`, and fold it into `planterEnv().light`.
- **I01** — The Day 6+ study path is off by up to 18 hours. The button's availability in `src/sim/furnActions.js` checks
  `state.run.day >= 6`, but `registerKind('studyWorkbench').canStart` counts whole 24-hour periods since the 18:00
  outbreak. Reproduced: at 10:00 on Day 6 the button is enabled, but the queued action is refused with "You need more time
  to figure it out (Day 6+)". Fix: use `dayNumber(state.clock)` in `canStart`. Manual repair, auto-fill, preview, Craft
  Again, organize and clear all work and are tested.
- **I07** — Recycling does nothing. `registerKind('recycle')` in `src/sim/furnActions.js` only converts junk items
  (20105/2911/24118) found in the furniture's own inventory, but none of the recycle furniture has storage. That covers
  newspapers 310/416/9130/80048, photo frames and paintings (228), camera 222, cans and racks (230), and the 66xxx/67xxx
  monitors, cabinets and ATMs (1764). Reproduced on newspaper 310: 20 minutes and 5 stamina spent, nothing received, the
  piece still installed. Fix: in `complete`, turn the piece itself into materials: `giveItems` its `rmGet` (1764
  "dismantle and recover part of the materials" could take a random subset), then `removeFurniture`. Keep the junk path
  for storage furniture. Dismantling (231–235, 299) works and is tested.
- **I08** — The tin-can noisemaker 20340 ("very effective at luring zombies away") and the pliers 20350 have no gameplay
  use. They only appear as loot, shop stock or gifts, they have no item ops, and no code checks for them. Lockpick and
  crowbar are implemented and tested. Fix: add a "throw the can" option at sites in `src/sim/explore.js` (e.g. an
  `exploreDistract` action from the HUD that consumes the can, lowers `run.exposure` and puts nearby zombies into
  `mode: 'wander'` toward a far tile). Give the pliers a concrete role, e.g. a quicker circuit repair in
  `src/sim/power.js` (queueRepair / `repairPower` kind) or opening electrical boxes in `canSearch`.
- **K02** — Trap habitats aren't enforced. `TRAP_TYPES[type].habitats` in `src/sim/traps.js` is declared but never read,
  so any trap works on any floor. Reproduced: a bird net in a 1F indoor slot has a 7.3%/h catch chance and caught a crow.
  Location only reweights the prey mix (`HABITAT_BONUS`). The existing test 'traps catch over time with bait; bird nets
  only work outdoors' only checks the habitat label. Fix: return 0 from `catchChancePerHour` when
  `!TRAP_TYPES[f.data.type].habitats.includes(f.data.habitat)`, reject such slots in `placeTrap`, and filter them in the
  `trapPlace` panel (`src/ui/trapPanel.js`).
- **L02** — There is no warm clothing. The only clothing item in config, the hand-knitted scarf 24114 ("raises felt
  temperature one level for the rest of the run"), has no item ops (it is missing from `SUNDRIES`), and
  `survivorTemp`/`feelCold` in `src/sim/weather.js` know nothing about clothing. The 06-03 dev log also mentions warm
  coats. Fix: add a SUNDRIES entry in `src/content/itemEffects.js` that sets a permanent flag (e.g.
  `state.player.effects.scarf` with `until: -1`), and add its bonus (e.g. +4 °C) in `survivorTemp`. AC, electric heater,
  the fuel heater (65001, whose "light a fire" function 1776 is the fireplace) and hot drinks work and are tested.
- **L04** — UI: needs browser check. The drawing is in `src/render/iso.js` (the darkness overlay near line 412, the
  flashlight radial and the rain/snow particles near line 437). It is fed by `src/ui/view.js` (homeView: weather,
  lightsOn, indoorDark) and the explore view in `src/ui/explorePanel.js` (flashlight, indoorDark). Those view-model
  inputs are tested; the rendering itself needs a manual browser check.
- **M11** — The mold crisis is never shown to the player. `spreadMold` in `src/sim/spoilage.js` sets
  `state.crises.mold` and emits a `crisis` event nothing listens to. It adds nothing to `state.crises.active` (so no
  crisis-bar entry), and there is no toast, no objective and no `crisesSurvived` credit when it clears. Blackout, cold
  wave and thugs (including the 'fight' counterattack) are complete and tested. Fix: in `spreadMold`, push
  `{ id: 'mold', owner: 'spoilage', type: 'mold', label: 'Mold Crisis', phase: 'active' }` onto `state.crises.active`
  and toast; in `disinfect`, drop the entry and credit the crisis. Add a "disinfect the moldy container" objective via
  `registerObjectives` (e.g. registered next to the `disinfect` kind in `src/sim/furnActions.js`).
- **N02** — Three hostile-survivor bugs in `src/sim/explore.js`, each reproduced. (1) `raiderTalkChance` reads
  `state.player.stats.morale`, which doesn't exist (the key is `mor`), so morale never changes the talk-down odds: 0.55
  at both 0 and 100 morale. (2) The talk-down in `resolveStandoff` and `killRaider` call
  `addStat(state, 'morale', …)`, which creates a junk `stats.morale = NaN` instead of changing morale. (3)
  `raiderTribute` ranks goods by `cfg.type`, but items store `cat`, so "medicine and food first" never applies: scrap was
  handed over before a bandage. Fix: use `mor` and `cfg.cat`. The rest of the row (time limit, exposure surges, depth,
  Retreat, flashlight view, E search, minimap in `drawMinimap`, drag camera in `src/main.js`, zombies, standoffs) is
  implemented and tested.

### Other observations (not counted in the ratings)

- Solar panels only lose output in the basement (`solarStep` in `src/sim/power.js`); a panel installed in the 1F living
  room produces full sun. The 06-03 dev log places panels on the terrace; consider requiring outdoor/sunny slots.
- The Warm branch in `eatItem` (`src/sim/itemuse.js`) checks item 2003 (tea), but 2003 is a medicine-category item that
  goes through `useMedicine`, so tea never warms the survivor.
- Boston Ivy isn't Student-only: the seed is sold at the Farmers' Market to every character. Its cover also reduces door
  damage, because `defRedOf` in `src/sim/horde.js` applies it to every opening (the comments say windows).
- The codex lists 124 craft recipes, but Blueprint Collector (`blueprintProgress` in `src/sim/crafting.js`) needs 125:
  recipe 332 (double-door fridge) is InCodex but missing from the codex list. This belongs to section S.
- Config only has S/M/XL fuel generators (42000/42001/42002); there is no "L" generator to implement for J02.
