// @ts-check
/**
 * Key registry: every counter, story tag, flag, bus event and storage key of the game, declared once with its meaning
 * and its owner. `node tools/keys-audit.mjs` (the gate runs it with `--json`) checks the code under src/ against this
 * file: a key must be declared here, produced somewhere and used somewhere.
 *
 * ENTRY   'key': [owner, meaning, options?]
 *   owner    the module that owns the key (the system that produces it, or handles it for request-style events such as
 *            'toast'); a work package id ('WP-P1-03') for a key whose module does not exist yet
 *   meaning  what the key stands for; for events, when they fire and the payload
 *   options  { readBy, writtenBy, values } (below)
 *
 * TEMPLATES   A key built at run time is declared once with ${NAME} placeholders — 'use:${id}', 'clue.${line}',
 *   'TAG_LINE_${ROUTE}_CHOSEN' — and matches both the template literal that builds it and every literal spelling of
 *   it. `values: { ROUTE: ['GIRL', …] }` lists the allowed parts, so a literal with a typo is still an error. Spell keys
 *   as string or template literals at the access site; a site that computes a key from data (`emit(type)`,
 *   `tags[def.routeTag]`) must be reviewed: a `dynamic` entry in tools/keys/rules.mjs, or a comment on or above the
 *   line in your own module: `// @keys dynamic tags — deadTag of src/content/people.js`.
 *
 * CONSUMERS AND PRODUCERS THE SCAN CANNOT SEE   A key counts as used when code under src/ reads it by name (and as
 *   produced when code writes it); the scan follows aliases, loops over literal key lists, content tables and the
 *   helpers listed in tools/keys/rules.mjs. For anything else, declare it:
 *   - here: `readBy: ['tests/horde.test.js — asserts the kill event']`, `writtenBy: ['WP-P1-05 — the audio lane
 *     emits it']` — each entry is a path or a work package id, then ' — ' and the reason; a path must exist and
 *     mention the key. Examples: an event only a test or a future package listens to, a counter only a test asserts.
 *   - in your own module, next to the consumer: `// @keys read bus:hordeStart bus:hordeWave — audio cues from a
 *     table` (`// @keys write …` for producers). Use it for data-driven consumers (an audio or UI table keyed by
 *     event name, a panel that shows counters from a list it builds at run time).
 *   Namespaces for annotations are the keys of NAMESPACES below (`bus`, `counters`, `tags`, `story.flags`, …);
 *   `event:`, `counter:`, `tag:` and `flag:` are accepted as short forms.
 *
 * NEW KEYS   Only the architect and the integrator edit this file. A package that adds a key lists it in the
 *   `keysAdded` field of its report ({ ns, key, owner, meaning }); the integrator declares it here when merging.
 *   Until then the audit lists it as undeclared.
 */

/**
 * @typedef {'counter' | 'tag' | 'flag' | 'event' | 'storage'} KeyKind
 * @typedef {object} KeyOptions
 * @property {string[]} [readBy] consumers the scan cannot see: '<path or WP id> — why'
 * @property {string[]} [writtenBy] producers the scan cannot see: '<path or WP id> — why'
 * @property {Record<string, string[]>} [values] allowed values of a template's placeholders
 * @typedef {[owner: string, meaning: string, options?: KeyOptions]} KeySpec
 * @typedef {Record<string, KeySpec>} KeyTable
 */

/** @type {Record<string, { kind: KeyKind, where: string, doc: string }>} */
export const NAMESPACES = {
  counters: { kind: 'counter', where: 'state.progress.counters[key]', doc: 'Run statistics and achievement counters (numbers), shown on the Statistics tab and the death / ending screens.' },
  daily: { kind: 'counter', where: 'state.player.daily[key]', doc: 'Uses per game day, cleared every morning (bumpDaily / dailyCount in src/sim/stats.js).' },
  tags: { kind: 'tag', where: 'state.story.tags[key]', doc: 'Story milestones, true once reached (config TAG_* names and a few camelCase tags).' },
  'story.flags': { kind: 'flag', where: 'state.story.flags[key]', doc: 'Story bookkeeping: once-only guards and day stamps.' },
  'social.flags': { kind: 'flag', where: 'state.social.flags[key]', doc: 'Social-system once-only guards.' },
  taboo: { kind: 'flag', where: 'state.progress.taboo[key]', doc: 'Challenge taboos: set once the run breaks a challenge condition (src/content/endings.js CHALLENGES).' },
  run: { kind: 'flag', where: 'state.run[key]', doc: 'Per-round run data; a rebirth starts a new round.' },
  loop: { kind: 'flag', where: 'state.loop[key]', doc: 'Data carried across rebirths (newLoopData in src/sim/state.js).' },
  bus: { kind: 'event', where: "emit(type, payload) / on(type, fn) — src/engine/bus.js", doc: 'Bus events: the simulation emits, UI, audio and meta systems listen.' },
  localStorage: { kind: 'storage', where: 'localStorage key', doc: 'Browser storage keys (src/engine/save.js, snapshots, bug reports).' },
  slot: { kind: 'storage', where: 'field of a save-slot payload (survivalLog.save.${slot})', doc: 'The JSON envelope saveGame writes.' },
  'slot.summary': { kind: 'storage', where: 'field of payload.summary', doc: 'The save summary the load menu lists.' },
  history: { kind: 'storage', where: 'game.history[key] (survivalLog.history)', doc: 'Global progress across runs (defaultHistory in src/engine/save.js).' },
  settings: { kind: 'storage', where: 'game.settings[key] (survivalLog.settings)', doc: 'Player settings (DEFAULT_SETTINGS in src/game.js).' },
};

const LINES = ['hospital', 'truth', 'slip'];
const ROUTE_TAGS = ['RESCUE', 'EVACUATE', 'GIRL', 'STRANGER', 'SHELTER', 'FORTRESS', 'TRUTH', 'GREENHOUSE', 'COMPANION', 'SUPPLY'];
const ENDING_IDS = ['EVACUATE', 'GIRL', 'STRANGER', 'FORTRESS', 'TRUTH', 'GREENHOUSE', 'COMPANION', 'SUPPLY', 'LASTONE'];

// ------------------------------------------------------------------------------------------------ counters

/** @type {KeyTable} */
export const COUNTERS = {
  PlantPotCount: ['src/sim/farming.js', 'Planters at home right now (Green Thumb 1211: 24 planters).'],
  'PlantPotCount.best': ['src/sim/farming.js', 'Most planters at home at once this run.', { readBy: ['tests/farming.test.js — asserts the best planter count'] }],
  'bait.thrown': ['src/sim/horde.js', 'Bait thrown into the yard to pull a horde.'],
  'bath.ice': ['src/sim/furnActions.js', 'Cold baths taken with ice cubes (Cold as Ice 9005, lifetime).'],
  'book.read': ['src/sim/itemuse.js', 'Books and notes read.'],
  'brew.count': ['src/sim/cooking.js', 'Bottles brewed in the fermenter.'],
  'camp.prep.supply': ['src/sim/social.js', 'Supply runs to survivor outposts after choosing the stranger route (Web Weaver 1202, outpost quest).'],
  'cat.${choice}': ['src/sim/social.js', 'Answers to the cat at the door, per choice.', { values: { choice: ['feed', 'pet', 'ignore', 'take'] } }],
  clue: ['src/sim/story.js', 'Truth clues found (the config clue counter; equals clue.truth).'],
  'clue.${line}': ['src/sim/story.js', 'Clues found on one line: hospital (Deep in the Hospital 2304), truth (Puzzle 1203), slip (Name on the Delivery Slip 1223).', { values: { line: LINES } }],
  'cook.count': ['src/sim/cooking.js', 'Dishes cooked, hot pots included (Fire It Up 2101, Home-Style Cooking 2102).'],
  'cook.midnight': ['src/sim/cooking.js', 'Meals cooked at 3 AM (Midnight Kitchen 9006, lifetime).'],
  'cook.perfect': ['src/sim/cooking.js', 'Perfect dishes (A Good Meal 1212, Perfectionism 2103).'],
  'craft.fail': ['src/sim/crafting.js', 'Crafts that failed.'],
  'craft.perfect': ['src/sim/crafting.js', 'Perfect crafts.'],
  'craft.total': ['src/sim/crafting.js', 'Items crafted (Tinkerer 2109).'],
  'crisis.doorHeld80': ['src/sim/horde.js', 'Crises ended with the front door above 80% (The door is closed 2204, lifetime).'],
  'crisis.survived': ['src/sim/horde.js', 'Crises survived: hordes, thugs, mold (Experience Makes the Doctor 2209).'],
  'defense.chainsaw': ['src/sim/horde.js', 'Chainsaws installed at the openings (Triple Defense 2203).'],
  'defense.net': ['src/sim/horde.js', 'Electric nets installed at the openings (Triple Defense 2203).'],
  'defense.spike': ['src/sim/horde.js', 'Spike traps installed at the openings (Triple Defense 2203).'],
  'defense.sandbag': ['src/sim/horde.js', 'Sandbags installed at the openings (shown on the Statistics tab).'],
  'door.repair': ['src/sim/furnActions.js', 'Door and window repairs.'],
  'drone.foraging.count': ['src/sim/social.js', 'Drone scavenging runs (Aerial Scavenging 2308).'],
  'endless.threat': ['src/sim/horde.js', 'Highest endless-mode threat level reached this run.'],
  'explore.hurt': ['src/sim/explore.js', 'Hits taken while exploring.'],
  'explore.lure': ['src/sim/explore.js', 'Lures thrown while exploring.'],
  'explore.points.distinct': ['src/sim/explore.js', 'Different exploration points visited (Traverse the Ruins 2302).'],
  'explore.search': ['src/sim/explore.js', 'Fixtures searched while exploring.'],
  'explore.total': ['src/sim/explore.js', 'Outings (Go out for the first time 2301, Scavenger 2303; Stay behind closed doors 3002 needs 0).'],
  'floors.both': ['src/sim/furnActions.js', '1 once the basement and the second floor are both open (Underground and Rooftop 2111).'],
  'food.eaten': ['src/sim/itemuse.js', 'Meals eaten.'],
  'food.rot': ['src/sim/spoilage.js', 'Food that rotted (No Waste 2010 needs 0).'],
  'food.sat': ['src/sim/itemuse.js', 'Satiety gained by eating.'],
  'furniture.dismantle': ['src/sim/home.js', 'Furniture dismantled.'],
  'furniture.recycle': ['src/sim/furnActions.js', 'Furniture recycled for materials.'],
  'group.reply': ['src/sim/phone.js', 'Stances taken in the community group chat (Between Neighbors 9001).'],
  'home.breach': ['src/sim/horde.js', 'Doors and windows breached by a horde.'],
  'horde.survived': ['src/sim/horde.js', 'Hordes survived, every kind.'],
  marketLoot: ['src/sim/explore.js', 'Ruined Supermarket runs with a search (Delve Deep into the Ruins 2309).'],
  'molotov.thrown': ['src/sim/horde.js', 'Molotov cocktails thrown.'],
  'neighbor.basket': ['src/sim/social.js', 'Repairs of the rope basket to the neighbor.'],
  'neighbor.delivery': ['src/sim/social.js', 'Deliveries to the neighbor by basket.'],
  'plant.harvest': ['src/sim/farming.js', 'Harvests (Touch of Green 2104, Balcony Farmer 2105).'],
  'plant.harvest.flower': ['src/sim/farming.js', 'Flowers harvested (A Room Full of Flowers 9003, Greenhouse promise).'],
  'plant.harvest.produce': ['src/sim/story.js', 'Produce harvested, counted from the harvested event for the Greenhouse promise.'],
  'plant.perfect': ['src/sim/farming.js', 'Flawless harvests (Flawless Growth 2106).'],
  'plant.sow': ['src/sim/farming.js', 'Seeds sown.'],
  'power.allTypes': ['src/sim/power.js', '1 after a full day with solar, fuel, battery and rat-cage power and no outage (True Electrician 1201).'],
  'power.manual': ['src/sim/power.js', 'Sessions on the pedal generator.'],
  'power.own': ['src/sim/power.js', '1 once the home runs on its own generator and battery with the grid down (Powered 2110).'],
  'power.repair': ['src/sim/power.js', 'Wiring repairs.'],
  'pre.foodTypes': ['src/sim/predisaster.js', 'Food types bought before the disaster (Well-Stocked Pantry 2006).'],
  'pre.kg': ['src/sim/predisaster.js', 'Kilograms stockpiled before the disaster (Prepper 2001 … Doomsday Tycoon 2003).'],
  'pre.matTypes': ['src/sim/predisaster.js', 'Material types bought before the disaster (Ready for Anything 2007).'],
  'pre.moneyLeft': ['src/sim/predisaster.js', 'Money left at the outbreak (Penny Pincher 2004).'],
  'pre.points': ['src/sim/predisaster.js', 'Supply points visited before the disaster (Explore the Entire City 2005).'],
  'pre.riotGrabs': ['src/sim/predisaster.js', 'Loot grabbed during the pre-outbreak riot.'],
  'pre.spent': ['src/sim/predisaster.js', 'Money spent before the disaster.'],
  'prof.allmax': ['src/sim/proficiency.js', '1 once all five systems reach their top proficiency (Renaissance Man 2112).'],
  'radio.mission': ['src/sim/horde.js', 'Radio supply missions completed.'],
  'raider.kill': ['src/sim/explore.js', 'Raiders killed while exploring.'],
  'raider.met': ['src/sim/explore.js', 'Raider stand-offs while exploring.'],
  'raider.paid': ['src/sim/explore.js', 'Raiders paid off.'],
  'raider.talked': ['src/sim/explore.js', 'Raiders talked down.'],
  'rat.starved': ['src/sim/power.js', 'Rats that starved in a rat-cage generator.'],
  ratCatch: ['src/sim/traps.js', 'Rats caught in traps (Rat Catcher 2208).'],
  'ration.pressed': ['src/sim/cooking.js', 'Rations pressed (fragments not counted).'],
  'route.committed': ['src/sim/story.js', '1 once an ending route is committed.', { readBy: ['tests/endings.test.js — asserts the commitment is counted'] }],
  'rubble.cleared': ['src/sim/story.js', 'Rubble piles cleared (story event rubbleCleared).'],
  'shield.defended': ['src/sim/social.js', 'Street-shield rounds held for the survivor outposts.'],
  'shred.count': ['src/sim/crafting.js', 'Items fed to the shredder.'],
  'siege.final.kill': ['src/sim/horde.js', 'Zombies killed in the final horde (Zero Breach 2207 needs 40).'],
  sleeps: ['src/sim/furnActions.js', 'Times slept in a bed or on a sofa.'],
  'survivor.aid': ['src/sim/social.js', 'Aid given to survivors: neighbor, network, warehouse manager, veteran (Aid count).'],
  'survivor.dead': ['src/sim/social.js', 'Supported survivors who died.'],
  'thug.bribed': ['src/sim/horde.js', 'Thugs at the door bribed.'],
  'thug.repelled': ['src/sim/horde.js', 'Thugs at the door driven off.'],
  tilesWalked: ['src/sim/actions.js', 'Tiles walked by the survivor.'],
  'trade.active.dealcount': ['src/sim/social.js', 'Trades with strangers (First Deal 2305, Supplier 2307; Going Solo 3006 needs 0).'],
  'trade.stranger.partner': ['src/sim/social.js', 'Trading posts that became partners (Supply Chain 1222, Regular Customer 2306).'],
  'trap.catch': ['src/sim/traps.js', 'Prey caught in traps (Indoor Hunter 2108).'],
  'trap.place': ['src/sim/traps.js', 'Traps set (A-Hunting We Will Go 2107, the traps quest).'],
  'tvgame.best': ['src/meta/profile.js', 'Best TV mini-game score this run (TV Enthusiast 9002).'],
  'tvgame.plays': ['src/meta/profile.js', 'TV mini-games played.'],
  'vase.arrange': ['src/sim/farming.js', 'Flowers arranged in vases.'],
  'veteran.fed': ['src/sim/social.js', 'Satiety of food given to the veteran.'],
  'wave.survived': ['src/sim/horde.js', 'Endless-mode hordes survived (Pulled Through 2206).'],
  'wave.final': ['src/sim/endings.js', '1 once the final horde was survived (shown on the Statistics tab).'],
  'wm.delivery': ['src/sim/social.js', 'Supply deliveries to the warehouse manager.'],
  'zombie.counter': ['src/sim/horde.js', 'Counterattacks on zombies in the yard.'],
  'zombie.kill': ['src/sim/horde.js', 'Zombies killed, at home and outside (First Blood 2201, Meat Grinder 2202, Mountain of Corpses 2405).'],
  'zombie.kill.big': ['src/sim/horde.js', 'Big zombies killed.'],
  'zombie.sporadic': ['src/sim/horde.js', 'Stray zombies that came to the door between hordes.'],
};

/** @type {KeyTable} */
export const DAILY = {
  'explore.forced': ['src/sim/explore.js', 'Forced outings (heading out with zombies at the door) today; one per day.'],
  'farm:decorWater:${uid}': ['src/sim/farming.js', 'Decorative plant `uid` watered today.'],
  'func:${key}:${uid}': ['src/sim/furnActions.js', 'Uses today of furniture function `key` on furniture `uid` (functions with a daily limit).'],
  mentalToughness: ['src/sim/wishes.js', 'Mental Toughness (ability) recovery used today.'],
  'story:repairBasement': ['src/sim/story.js', 'Basement entrance cleared today (story repair task and the endless basement task).'],
  toilet: ['src/sim/furnActions.js', 'Toilet uses today (two per day).'],
  tvgame: ['src/meta/profile.js', 'TV mini-game reward collected today.'],
  'use:${id}': ['src/sim/itemuse.js', 'Uses today of item `id` (items with a daily limit).'],
};

// ------------------------------------------------------------------------------------------------ story tags and flags

/** @type {KeyTable} */
export const TAGS = {
  'TAG_${LINE}_RESCUE${N}_COMPLETE': ['src/sim/social.js', 'Neighbor-line rescue task N done (rescueTags of src/content/people.js; task 3 also by the rescue quests).', { values: { LINE: ['NEIGHBOR', 'COMPANION'], N: ['1', '2', '3'] } }],
  TAG_ANTENNA: ['src/sim/story.js', 'The antenna story beat has been queued.'],
  TAG_COMPANION_MAN_DEAD: ['src/sim/social.js', 'The College Student’s companion across the alley is dead (deadTag of src/content/people.js).'],
  'TAG_ENDING_${ID}': ['src/sim/endings.js', 'Ending ID was reached this run.', { values: { ID: ENDING_IDS }, readBy: ['tests/endings.test.js — asserts the ending tag'] }],
  TAG_FINAL_WAVE_SURVIVED: ['src/sim/endings.js', 'The final horde has been survived.'],
  'TAG_FLOOR_${AREA}_UNLOCKED': ['src/sim/story.js', 'Floor AREA of the home is open.', { values: { AREA: ['2F', 'B1'] } }],
  'TAG_LINE_${ROUTE}_CHOSEN': ['src/sim/story.js', 'The ending route was committed (both the config tag of src/content/endings.js ROUTES and the upper-cased route id).', { values: { ROUTE: ROUTE_TAGS } }],
  TAG_LINE_GREENHOUSE_DONE: ['src/content/events.js', 'Greenhouse route quest finished.'],
  TAG_LINE_RESCUE_READY: ['src/content/events.js', 'Rescue route: the beacon is repaired and ready.'],
  TAG_LINE_SHELTER_HELD: ['src/sim/endings.js', 'Safe House route: the final horde was held.'],
  TAG_LINE_STRANGER_CAMP_DONE: ['src/content/events.js', 'Stranger route: the outpost deliveries are done.'],
  TAG_LINE_SUPPLY_HELD: ['src/sim/endings.js', 'Iron Barrel Hub route: final horde held after the special trade.'],
  TAG_LINE_TRUTH_EXPLORED: ['src/sim/story.js', 'The Truth route: hospital clues and the recorder are home.'],
  TAG_LINE_TRUTH_FINAL: ['src/content/events.js', 'The Truth route: the final hospital trip is done.'],
  TAG_NEIGHBOR_DEAD: ['src/sim/social.js', 'The Wage Slave’s neighbor is dead (deadTag of src/content/people.js).'],
  TAG_NEIGHBOR_ENDING_COZY: ['src/sim/social.js', 'Five hearts with the neighbor (The Person Next Door 1213).'],
  TAG_NEIGHBOR_MET: ['src/content/events.js', 'The survivor answered the neighbor’s first wave.'],
  TAG_RECKONING: ['src/sim/story.js', 'Day 70 reckoning reached (Day of Reckoning 1005).'],
  TAG_REFUSE_CURTAIN: ['src/sim/endings.js', 'The player chose to keep going after an ending.', { readBy: ['tests/coverage_p.test.js — asserts the tag on continuing'] }],
  TAG_SHIELD_OF_STREET: ['src/sim/social.js', 'Older spelling of TAG_SHIELD_OF_THE_STREET, set alongside it.', { readBy: ['tests/social.test.js — asserts this spelling'] }],
  TAG_SHIELD_OF_THE_STREET: ['src/sim/social.js', 'Shield of the Street challenge ending met (SHIELD_CHALLENGE of src/content/endings.js).'],
  TAG_STRANGER_NETWORK_OK: ['src/sim/social.js', 'Six supported survivors alive on Day 71 (stranger route check).'],
  TAG_SUPPLY_SPECIAL_TRADE: ['src/content/events.js', 'Iron Barrel Hub route: the special drone trade was made.'],
  TAG_VETERAN_DONE: ['src/sim/social.js', 'The veteran’s storyline is finished.', { readBy: ['tests/coverage_ot.test.js — asserts the storyline completes'] }],
  TAG_WM_RESCUED: ['src/sim/social.js', 'The warehouse manager was rescued (unlocks the Warehouse Manager).', { readBy: ['tests/social.test.js — asserts the rescue'] }],
  advancedReinforce: ['src/content/events.js', 'Advanced reinforcement learned (quest, or New Game+).'],
  trapsUnlocked: ['src/content/events.js', 'Traps introduced by the pantry-rats event (or New Game+).', { readBy: ['tests/story.test.js — asserts the unlock'] }],
  truthExplored: ['src/sim/explore.js', 'The recorder and every hospital clue were claimed while exploring.'],
  wmTruckNote: ['src/sim/explore.js', 'The warehouse manager’s truck note was found while exploring.', { readBy: ['tests/explore.test.js — asserts the note is found'] }],
};

/** @type {KeyTable} */
export const STORY_FLAGS = {
  beaconChecks: ['src/sim/story.js', 'Times the distress beacon was checked (Rescue quest progress).'],
  blackoutDay: ['src/sim/story.js', 'Day of the first grid blackout (story memory).'],
  coldWaveDay: ['src/sim/story.js', 'Day of the last cold wave (story memory, at most one per three days).'],
  envelopeOpened: ['src/sim/story.js', 'The planning envelope has been opened.'],
  envelopePlaced: ['src/sim/story.js', 'The planning envelope has been placed at home.'],
  killsAtFinalWave: ['src/sim/endings.js', 'Kill count when the final horde began (final-wave kills).'],
  kitSeen: ['src/sim/story.js', 'Day the Military Repair Kit was first seen at home.'],
  lastBeaconCheck: ['src/sim/story.js', 'Day of the last beacon check on the Rescue route.'],
  manualPlaced: ['src/sim/story.js', 'Where the workbench manual was placed (furniture uid or "floor").'],
  routeFailed: ['src/sim/endings.js', 'Day the committed route failed.'],
};

/** @type {KeyTable} */
export const SOCIAL_FLAGS = {
  'coords:${tip}': ['src/sim/social.js', 'Coordinates tip `tip` has been sent.'],
  dronePackage: ['src/sim/social.js', 'The drone package has been delivered.'],
  scrapDrone: ['src/sim/social.js', 'The scrapped teaching drone is at home (drone repair quest).'],
};

/** @type {KeyTable} */
export const TABOO = {
  brokeSomething: ['src/sim/furnActions.js', 'Something was smashed after the outbreak.', { readBy: ['tests/coverage_af.test.js — asserts clearing out before the outbreak sets no taboo'] }],
  doorWorn: ['src/sim/horde.js', 'A door or window fell below 70% (Flawless 3004).'],
  explore: ['src/sim/explore.js', 'The survivor left home (Stay behind closed doors 3002).'],
  foodRot: ['src/sim/spoilage.js', 'Food rotted (No Waste 2010).'],
  lowVitality: ['src/sim/stats.js', 'Life fell below 20% (Never Fallen 3008).'],
  meat: ['src/sim/itemuse.js', 'Meat or an animal product was eaten (Vegetarianism 3005).'],
  neighbor: ['src/sim/social.js', 'The neighbor storyline progressed (One Person’s Hundred Days 3007).'],
  overspend: ['src/sim/predisaster.js', 'More than half the budget was spent before the disaster (Minimal Budget 3003).'],
  rebirth: ['src/sim/rebirth.js', 'A rebirth was used in this save (Just Once 3001).'],
  siegeDoorWorn: ['src/sim/horde.js', 'An opening fell below 70% during the final horde (Zero Breach 2207).'],
  trade: ['src/sim/social.js', 'The survivor traded with strangers (Going Solo 3006).'],
};

// ------------------------------------------------------------------------------------------------ run and loop

/** @type {KeyTable} */
export const RUN = {
  cards: ['src/sim/settlement.js', 'Planning cards owned this round.'],
  challenges: ['src/sim/endings.js', 'Challenge endings held when the ending was reached.'],
  counterMark: ['src/sim/settlement.js', 'Counter values at the last daily settlement (the “yesterday” summary).'],
  day: ['src/sim/tick.js', 'Current day number.'],
  dayRecords: ['src/sim/settlement.js', 'Days that beat the furthest day of any loop.', { readBy: ['tests/settlement.test.js — asserts the record days'] }],
  deathCause: ['src/sim/tick.js', 'Cause of death.'],
  deathDay: ['src/sim/tick.js', 'Day of death.'],
  ending: ['src/sim/endings.js', 'Ending id reached this round.'],
  endingDay: ['src/sim/endings.js', 'Day the ending was reached.'],
  endlessStartDay: ['src/sim/endings.js', 'Day endless mode began after an ending.'],
  endlessUnlocks: ['src/meta/endless.js', 'Endless-mode area tasks and unlocks.'],
  eventPoints: ['src/sim/story.js', 'Planning Points earned from events this round.', { readBy: ['tests/story.test.js — asserts event points are recorded'] }],
  idleT: ['src/sim/autonomy.js', 'Idle time before the survivor acts on their own.'],
  ivy: ['src/sim/farming.js', 'Ivy grown on the house.'],
  ivyDefense: ['src/sim/farming.js', 'Defense bonus from the ivy (read by the horde).'],
  lastHurt: ['src/sim/stats.js', 'Source of the last damage (the death screen cause).'],
  lastSettledDay: ['src/sim/settlement.js', 'Last day the daily settlement ran.'],
  notesPlaced: ['src/sim/rebirth.js', 'Rebirth notes placed at the start of the round ({ placed, dropped }).'],
  offers: ['src/sim/settlement.js', 'Planning-card offers of the current settlement.'],
  pointsEarned: ['src/sim/settlement.js', 'Planning Points earned this round.'],
  pointsLedger: ['src/sim/settlement.js', 'Planning Point ledger rows of this round.'],
  pointsSeen: ['src/sim/settlement.js', 'Planning Point balance already accounted for in the ledger.'],
  record: ['src/sim/endings.js', 'Safe-house tally and survival score frozen at the ending.', { readBy: ['tests/coverage_p.test.js — asserts the frozen record'] }],
  roundStart: ['src/sim/rebirth.js', 'Points and best day at the start of the round (for tearing the round up).'],
  settlement: ['src/sim/settlement.js', 'Pending daily settlement shown in its panel.'],
  souvenirRecipes: ['src/meta/codex.js', 'Souvenir recipes unlocked this round.'],
  unlockedRecipes: ['src/sim/unlocks.js', 'Craft recipes unlocked this round.'],
  wish: ['src/sim/wishes.js', 'The wish chosen for today.'],
  wishOffers: ['src/sim/wishes.js', 'Wishes offered, waiting for a choice.'],
};

/** @type {KeyTable} */
export const LOOP = {
  abilities: ['src/sim/rebirth.js', 'Ability levels learned in the Survival Log.'],
  abilitiesThisRound: ['src/sim/rebirth.js', 'Ability levels learned this round (refunded when the round is torn up).'],
  bestDay: ['src/sim/rebirth.js', 'Furthest day reached in any loop.'],
  cycle: ['src/sim/rebirth.js', 'Loop number, 1 for the first loop.'],
  history: ['src/sim/rebirth.js', 'Records of past rounds (journal).'],
  memories: ['src/sim/story.js', 'Knowledge memories carried across loops ({ id, text, day, cycle }).'],
  neighborAffinity: ['src/sim/rebirth.js', 'Neighbor affinity carried into the next loop.'],
  ngPlus: ['src/sim/rebirth.js', 'New Game+: set after an ending or from the second loop.'],
  notes: ['src/sim/rebirth.js', 'Rebirth notes to place in the backpack next round.'],
  planningPoints: ['src/sim/settlement.js', 'Planning Point balance.'],
  pointsSpentThisRound: ['src/sim/rebirth.js', 'Planning Points spent on abilities this round.'],
  rebirths: ['src/sim/rebirth.js', 'Rebirths and rewinds used.'],
  usedRebirth: ['src/sim/rebirth.js', 'A rebirth was used (the rebirth taboo carries over).'],
};

// ------------------------------------------------------------------------------------------------ bus events

const TESTS = (/** @type {string} */ file, /** @type {string} */ why) => ({ readBy: [`tests/${file} — ${why}`] });

/** @type {KeyTable} */
export const EVENTS = {
  achievement: ['src/meta/achievements.js', 'An achievement unlocked. { id, name }'],
  actionDone: ['src/sim/actions.js', 'The current action completed (costs and gains applied). payload: the action'],
  actionStarted: ['src/sim/actions.js', 'The survivor starts working on an action. payload: the action'],
  areaUnlocked: ['src/sim/furnActions.js', 'A locked area of the home opened. { area }'],
  ate: ['src/sim/itemuse.js', 'Food eaten. { id, expired, portion }'],
  basketSent: ['src/sim/social.js', 'A basket went to the neighbor. { sat, value, progress, affinity }'],
  breach: ['src/sim/horde.js', 'An opening was breached. { slot, furn }'],
  brewed: ['src/sim/cooking.js', 'Fermentation finished. { furn, item, n }'],
  chainsawHit: ['src/sim/horde.js', 'A chainsaw hit zombies (throttled cue). { slot, cfg, device, n }'],
  characterUnlocked: ['src/meta/achievements.js', 'A character became playable. { id }'],
  codex: ['src/sim/itemuse.js', 'Something new for the codex. { cat, id }'],
  codexMilestone: ['src/meta/codex.js', 'A codex milestone reward. { id, craft, furn }'],
  codexUpdated: ['src/meta/codex.js', 'Codex entries were added. { added }'],
  cookCancelled: ['src/sim/cooking.js', 'A cooking job was cancelled. { furn }'],
  cookStarted: ['src/sim/cooking.js', 'A cooker (or hot pot) started. { furn, recipe | hotpot }'],
  cooked: ['src/sim/cooking.js', 'A dish is ready. { furn, recipe, item, quality }'],
  crafted: ['src/sim/crafting.js', 'A craft finished. payload: the craft result'],
  crisis: ['src/sim/horde.js', 'A crisis began or was announced: horde, thugs, blackout, mold, cold wave. { type, phase?, id?, at? }', TESTS('coverage_gn.test.js', 'records the crises of a run')],
  cropAnomaly: ['src/sim/farming.js', 'A crop developed an anomaly. { furn, plantId, kind }', TESTS('farming.test.js', 'counts anomalies per planter')],
  dailySettlement: ['src/sim/settlement.js', 'The daily settlement ran. { day, credited }'],
  death: ['src/sim/tick.js', 'The survivor died. { cause, day }'],
  defenseBroken: ['src/sim/horde.js', 'A defense device was destroyed. { slot, cfg }'],
  defenseHit: ['src/sim/horde.js', 'A defense device hit or was hit (throttled cue). { slot, cfg, device, n?, by? }'],
  document: ['src/sim/itemuse.js', 'A document was read. { id, state }'],
  droneDispatched: ['src/sim/social.js', 'A drone took off. { uid, op }'],
  droneReturned: ['src/sim/social.js', 'A drone came back. { uid, op }'],
  ending: ['src/sim/endings.js', 'An ending was reached. { id, day }'],
  endingReached: ['src/sim/endings.js', 'An ending was reached, with details for meta systems. { id, character, achievement, cfg, day, challenges }'],
  endlessStarted: ['src/meta/endless.js', 'Endless mode began after an ending. { mode, state }'],
  enterGame: ['src/ui/menus.js', 'The game screen opened (new run, load, rebirth, rewind, endless). { fresh?, rebirth?, rewind?, endless? }'],
  exploreArrived: ['src/sim/explore.js', 'Arrived at the exploration site. { site, forced }'],
  exploreDeparted: ['src/sim/explore.js', 'Left home to explore. { site, forced }'],
  exploreEnded: ['src/sim/explore.js', 'Back home from exploring. payload: the outing summary'],
  exploreHit: ['src/sim/explore.js', 'Hurt while exploring. { site, dmg, big? | raider? }'],
  exploreOverrun: ['src/sim/explore.js', 'An exploration site was overrun. { site, until }'],
  exploreSearched: ['src/sim/explore.js', 'A fixture was searched. { site, fixture, items, taken, left, stash }'],
  floorChanged: ['src/sim/actions.js', 'The survivor took the stairs. { floor }', TESTS('coverage_af.test.js', 'follows the floors walked')],
  furnitureInstalled: ['src/sim/home.js', 'Furniture was installed. { uid, cfg }'],
  gotItem: ['src/sim/furnActions.js', 'An item came into the survivor’s hands (giveItems and the pickup paths; the HUD shows it). { id, waste? }'],
  groupFoodShared: ['src/sim/phone.js', 'Food was shared in the group chat. { state, promptId, item, affinity }'],
  harvested: ['src/sim/farming.js', 'A planter was harvested. { furn, items, crops, perfect, flawless, dropped }'],
  hordeArrived: ['src/sim/horde.js', 'The horde reached an opening. { id, slot }'],
  hordeEnded: ['src/sim/horde.js', 'A horde ended. { state, id, kind, final, survived, … }'],
  hordeStart: ['src/sim/horde.js', 'A horde attack began. { id, kind, day, total, final }'],
  hordeWave: ['src/sim/horde.js', 'The next horde wave. { id, wave, of }'],
  hotpotReady: ['src/sim/cooking.js', 'The hot pot is ready. { furn }'],
  hour: ['src/sim/tick.js', 'A game hour passed. { hour }'],
  installed: ['src/sim/planning.js', 'A planned furniture piece was installed. { cfg, slot, replaced? }'],
  interactKey: ['src/main.js', 'The interact key was pressed. { view }'],
  leaveGame: ['src/ui/menus.js', 'The game screen closed (back to the title). {}'],
  maxRaised: ['src/sim/stats.js', 'A stat maximum went up. { key, amount, value, source }'],
  neighborGift: ['src/sim/social.js', 'The neighbor sent a gift. { items }'],
  openPanel: ['src/ui/panels.js', 'Request: open a panel. { panel, ...context }'],
  openingHit: ['src/sim/horde.js', 'A zombie hit a door or window (throttled cue). { slot, door, furn, cfg, ratio, big }'],
  outbreak: ['src/sim/tick.js', 'The outbreak began (18:00 on day 1). {}'],
  phoneMessage: ['src/sim/phone.js', 'A phone message arrived. { thread, kind, sound, vibrate }'],
  powerChanged: ['src/sim/power.js', 'Power state changed. { furn? | homePowered? | damaged? }'],
  pressed: ['src/sim/cooking.js', 'The ration press finished. { furn, out }'],
  profUp: ['src/sim/proficiency.js', 'A proficiency levelled up. { key, lv }'],
  radio: ['src/sim/furnActions.js', 'The radio was listened to. { furn }', TESTS('coverage_af.test.js', 'asserts the radio function')],
  radioBroadcast: ['src/sim/horde.js', 'The radio announced a horde. { text, horde, mission }'],
  ratDied: ['src/sim/power.js', 'A rat starved in its cage. { furn, id }', TESTS('coverage_gn.test.js', 'asserts starvation')],
  recipeUnlocked: ['src/sim/unlocks.js', 'A recipe was unlocked. { id | recipe | craft, source? }'],
  recipesUnlocked: ['src/sim/story.js', 'Several craft recipes were unlocked at once (event effects, planning cards). { ids, source? }'],
  record: ['src/meta/profile.js', 'A record furniture piece changed. { furn, data, op }'],
  recordOp: ['src/meta/profile.js', 'Request: apply a record operation. { state, furn, op, value }'],
  repaired: ['src/sim/furnActions.js', 'A door or window was repaired. { furn, hp }', TESTS('horde.test.js', 'asserts the repair')],
  requestRebirth: ['src/ui/deathScreen.js', 'Request: open the rebirth page. { fromEnding?, ending? }'],
  runStarted: ['src/game.js', 'A run started or was loaded. { state, loaded? }'],
  sceneChanged: ['src/sim/predisaster.js', 'The pre-disaster scene changed. { scene, location }'],
  settings: ['src/game.js', 'Settings changed. payload: game.settings'],
  shredded: ['src/sim/crafting.js', 'The shredder finished. { furn, id, out }'],
  sporadicZombies: ['src/sim/horde.js', 'Stray zombies came to the door between hordes. { n }', TESTS('horde.test.js', 'records the stray visits')],
  stat: ['src/sim/stats.js', 'A stat changed. { key, delta, source }', TESTS('farming.test.js', 'measures the vase morale gains')],
  story: ['src/sim/story.js', 'Story trigger from another system. { id, … }'],
  storyEndless: ['src/sim/endings.js', 'The run continues in endless mode after an ending. { ending, day, state }'],
  storyItemClaimed: ['src/sim/story.js', 'A story item was claimed while exploring. { state, id }'],
  summonHorde: ['src/sim/horde.js', 'Request: summon a horde. { state, size, reason, post? }'],
  thunder: ['src/sim/weather.js', 'Thunder struck. { day }'],
  toast: ['src/main.js', 'Request: show a toast. { text, kind? }'],
  trapCaught: ['src/sim/traps.js', 'A trap caught prey. { uid, prey }'],
  tvScore: ['src/ui/tvGames.js', 'A TV mini-game ended. { game, score, best, record }'],
  unlockCharacter: ['src/meta/achievements.js', 'Request: unlock a character. { id, reason? | next? }'],
  wishOffer: ['src/sim/wishes.js', 'Wishes are on offer. { ids }'],
  workbenchRepaired: ['src/sim/furnActions.js', 'The workbench was repaired. { self? }'],
  zombieAttack: ['src/sim/horde.js', 'A zombie attacked (throttled cue). { big, slot? | yard? }'],
  zombieKilled: ['src/sim/horde.js', 'A zombie died. { big, by, src } or, outside, { where, site, big, counted }', TESTS('horde.test.js', 'records the kills')],
  zombieSpawned: ['src/sim/horde.js', 'Zombies spawned. { n, src, horde?, wave? }'],
};

// ------------------------------------------------------------------------------------------------ storage

/** @type {KeyTable} */
export const LOCAL_STORAGE = {
  'survivalLog.history': ['src/engine/save.js', 'The global history (JSON).'],
  'survivalLog.reports': ['src/ui/menus.js', 'Bug reports written from the pause menu (JSON list).'],
  'survivalLog.save.${slot}': ['src/engine/save.js', 'Save slot `slot` (JSON envelope with a checksum).'],
  'survivalLog.save.${slot}.bak': ['src/engine/save.js', 'The previous write of save slot `slot` (backup).'],
  'survivalLog.settings': ['src/engine/save.js', 'The settings (JSON).'],
  'survivalLog.snap.${run}': ['src/sim/rebirth.js', 'The last daily snapshots of run `run` (JSON list, for “I want to persist!”).'],
};

/** @type {KeyTable} */
export const SLOT = {
  data: ['src/engine/save.js', 'The serialized state.'],
  savedAt: ['src/engine/save.js', 'Save time (ms since the epoch).'],
  sum: ['src/engine/save.js', 'FNV-1a checksum of data.'],
  summary: ['src/engine/save.js', 'The summary the load menu lists.'],
  v: ['src/engine/save.js', 'Save format version (SAVE_VERSION).'],
};

/** @type {KeyTable} */
export const SLOT_SUMMARY = {
  character: ['src/engine/save.js', 'Character id.'],
  cycle: ['src/engine/save.js', 'Loop number.'],
  day: ['src/engine/save.js', 'Day number.'],
  phase: ['src/engine/save.js', 'Run phase (pre, post, dead, ending).'],
};

/** @type {KeyTable} */
export const HISTORY = {
  achievements: ['src/meta/achievements.js', 'Unlocked achievements: id → unlock time.'],
  characters: ['src/meta/achievements.js', 'Playable characters: id → true.'],
  codex: ['src/meta/codex.js', 'Codex entries seen per category.'],
  counters: ['src/meta/achievements.js', 'Lifetime counters (LIFETIME_KEYS of src/meta/achievements.js).'],
  endings: ['src/meta/achievements.js', 'Endings reached: key → true.'],
  endingsByChar: ['src/meta/achievements.js', 'Endings reached per character.'],
  endless: ['src/meta/endless.js', 'Endless-mode records ({ best, bestPure, maxThreat }).'],
  milestones: ['src/meta/codex.js', 'Codex milestone rewards collected.'],
  profile: ['src/meta/profile.js', 'Profile: badges, titles, runs, deaths, best days.'],
  records: ['src/meta/profile.js', 'Run records for the profile page.'],
  seenVersion: ['src/ui/menus.js', 'Last update-log version shown.'],
  souvenirRecipes: ['src/meta/codex.js', 'Souvenir recipes unlocked for good.'],
  tutorials: ['src/ui/panels.js', 'Tutorial pop-ups already shown.'],
  tvBest: ['src/meta/profile.js', 'Best score per TV mini-game.'],
};

/** @type {KeyTable} */
export const SETTINGS = {
  autoRelax: ['src/game.js', 'Slow the clock down while idle.'],
  autonomy: ['src/game.js', 'The survivor looks after themselves when idle.'],
  fps: ['src/game.js', 'Frame-rate cap (0: uncapped).'],
  graphics: ['src/game.js', "Graphics: auto, high, low (3D quality) or classic (the Canvas 2D renderer); applies on reload."],
  keys: ['src/game.js', 'Key bindings: action → key (Mouse4 / Mouse5 for the side buttons).'],
  lagOptimization: ['src/game.js', 'Refresh open windows lazily.'],
  lang: ['src/game.js', 'Interface language (en, zh).'],
  music: ['src/game.js', 'Music volume 0–1.'],
  operationTips: ['src/game.js', 'Show a tip when an action is queued.'],
  sfx: ['src/game.js', 'Sound-effect volume 0–1.'],
  skipPrologue: ['src/game.js', 'Skip the prologue on new runs.'],
  volume: ['src/game.js', 'Master volume 0–1.'],
};

/** Every table by namespace (see NAMESPACES). @type {Record<string, KeyTable>} */
export const KEYS = {
  counters: COUNTERS,
  daily: DAILY,
  tags: TAGS,
  'story.flags': STORY_FLAGS,
  'social.flags': SOCIAL_FLAGS,
  taboo: TABOO,
  run: RUN,
  loop: LOOP,
  bus: EVENTS,
  localStorage: LOCAL_STORAGE,
  slot: SLOT,
  'slot.summary': SLOT_SUMMARY,
  history: HISTORY,
  settings: SETTINGS,
};
