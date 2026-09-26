// Achievements (S03, Q10, A07): the 93 config achievements as predicates keyed by config id, evaluated every
// game hour and on game events against the current run (game.state) and the global history (game.history).
// Config thresholds win over older Steam texts (Meat Grinder 400, Rat Catcher 8, Traverse the Ruins 4, ...).
import { achievementConfig, item, furn, CAT, ELEC } from '../data/db.js';
import { pickLang } from '../engine/i18n.js';
import { emit, on } from '../engine/bus.js';
import { registerSystem } from '../sim/tick.js';
import { dayNumber } from '../sim/time.js';
import { effectiveMax, STAT_KEYS } from '../sim/stats.js';
import { homeFurniture, doorAndWindows, effectiveMaxHp, homeDef } from '../sim/home.js';
import { homeSources } from '../sim/furnActions.js';
import { weightG } from '../sim/inventory.js';
import { FIVE_SYSTEMS, PROF } from '../sim/proficiency.js';
import { CHARACTERS, CHARACTER_ORDER } from '../content/characters.js';
import { game, persistHistory } from '../game.js';
import { codexTotal, normalizeCodexId, souvenirsPlaced, placedCounts, COLLECTOR_IDS } from './codex.js';
import { endlessStateOf, endlessDays, daysSurvived, threatLevel, ENDLESS_PURE, ENDLESS_STORY } from './endless.js';

export const ACH_CATEGORIES = {
  1: { icon: '📅', name: { en: 'Survival', zh: '生存' } },
  2: { icon: '🎬', name: { en: 'Endings', zh: '结局' } },
  3: { icon: '🏠', name: { en: 'Home & Life', zh: '家园与生活' } },
  4: { icon: '🛒', name: { en: 'Preparation & Condition', zh: '灾变前准备' } },
  5: { icon: '🛠', name: { en: 'Production & Codex', zh: '生产与图鉴' } },
  6: { icon: '🛡', name: { en: 'Combat & Defense', zh: '战斗与防御' } },
  7: { icon: '🧭', name: { en: 'Exploration & Trade', zh: '探索与交易' } },
  8: { icon: '♾', name: { en: 'Endless Mode', zh: '无尽模式' } },
  9: { icon: '🏆', name: { en: 'Challenge Endings', zh: '结局挑战' } },
  10: { icon: '❔', name: { en: 'Hidden', zh: '隐藏杂项' } },
};

// Steam English name (matched against ACHIEVEMENT_CONFIG.steam for the global %) and a description that follows
// the config condition. Hidden achievements have no Steam description, so these are written from condZh.
const EN = {
  1001: ['First Night of Disaster', 'Survive Day 1 after the disaster'],
  1002: ['Week 1', 'Survive Day 7 after the disaster'],
  1003: ['One Month', 'Survive Day 30 after the disaster'],
  1004: ['Fifty Days', 'Survive Day 50 after the disaster'],
  1005: ['Day of Reckoning', 'Survive to Day 70, and responses from all parties arrive one after another'],
  1006: ['My Choice', 'Make an ending commitment and stake the remaining days on one path'],
  1007: ['The Final Horde', 'Survive the final horde on Day 87'],
  1008: ['One Hundred Days', 'Survive Day 100 after the disaster'],
  1101: ['Evacuate', 'Reach the Rescue ending: build the rescue beacon, repair it with the Military Repair Kit and get out on Day 101'],
  1102: ['Side By Side', 'Reach the Girl Next Door ending as the Wage Slave: rescue your neighbor and keep her alive through the final horde'],
  1103: ['Net', 'Reach the Stranger ending: keep at least 6 supported survivors alive and finish the outpost deliveries'],
  1104: ['Fortress', 'Reach the Safe House ending: 4 spikes, 4 electric nets, 4 chainsaws, reinforced openings and a charged battery bank'],
  1105: ['The Truth', 'Reach The Truth ending: bring back the hospital recorder and every clue, then commit to the truth'],
  1106: ['Greenhouse', 'Reach the Doomsday Greenhouse ending as the College Student'],
  1107: ['Companionship', 'Reach the Companionship ending as the College Student'],
  1108: ['Supply Station', 'Reach the Iron Barrel Hub ending as the Warehouse Manager'],
  1109: ['Stay in Place', 'Reach the Survival: Last One Standing ending'],
  1110: ["Wage Slave's Story", 'Reach any ending as the Wage Slave'],
  1111: ["Student's Story", 'Reach any ending as the College Student'],
  1112: ["Warehouse Manager's Story", 'Reach any ending as the Warehouse Manager'],
  1113: ['Three Stages of Life', 'Reach an ending with each of the three characters'],
  1114: ['All Roads Lead to the End', 'Collect all 9 endings'],
  1201: ['True Electrician', 'Own a solar panel, a fuel generator, a battery and a rat-cage generator while the whole house stays powered'],
  1202: ['Web Weaver', 'After choosing the stranger path, deliver supplies to survivor outposts 12 times'],
  1203: ['Puzzle', 'Collect all 4 truth clues'],
  1211: ['Green Thumb', 'Have 24 planters at home'],
  1212: ['A Good Meal', 'Create 10 perfect dishes'],
  1213: ['The Person Next Door', 'Form a true bond with your Neighbor'],
  1221: ['Inventory Check', 'All three storage dimensions meet requirements: Satiety 1,200 / Items 180 / Storage Furniture 8'],
  1222: ['Supply Chain', 'Complete text-message trades with 8 different strangers'],
  1223: ['Name on the Delivery Slip', 'Collect three delivery-slip clues and choose the supply station route'],
  2001: ['Prepper', 'Stockpiled over 5 kg of supplies before the disaster'],
  2002: ['Fine Haul', 'Stockpiled over 25 kg of supplies before the disaster'],
  2003: ['Doomsday Tycoon', 'Stockpiled over 50 kg of supplies before the disaster'],
  2004: ['Penny Pincher', 'Had less than 50 money remaining when the disaster struck'],
  2005: ['Explore the Entire City', 'Visited 5 supply points before the disaster'],
  2006: ['Well-Stocked Pantry', 'Purchased 20 or more types of Food before the disaster'],
  2007: ['Ready for Anything', 'Purchased 4 or more types of materials before the disaster'],
  2008: ['Steady and Stable', 'Keep Satiety, Morale, Stamina, and Life all at 80 or above simultaneously'],
  2009: ['Family Assets', 'The total Satiety of supplies at Home exceeds 2000'],
  2010: ['No Waste', 'Survive to Day 30 without any food spoiling in this loop'],
  2011: ['Breakthrough', 'Break the upper limit of any attribute beyond 150'],
  2012: ['Extraordinary', 'Break the upper limit of three attributes beyond 150 simultaneously'],
  2101: ['Fire It Up', 'Cook a dish for the first time'],
  2102: ['Home-Style Cooking', 'Cook a total of 30 dishes in this loop'],
  2103: ['Perfectionism', 'Cook 30 perfect dishes in this loop'],
  2104: ['Touch of Green', 'Harvest your own crops for the first time'],
  2105: ['Balcony Farmer', 'Harvest a total of 50 times in this loop'],
  2106: ['Flawless Growth', 'Complete 10 Perfect harvests with no anomalies throughout the entire process'],
  2107: ['A-Hunting We Will Go', 'Set a trap for the first time'],
  2108: ['Indoor Hunter', 'Capture 30 prey in total'],
  2109: ['Tinkerer', 'Craft a total of 100 items'],
  2110: ['Powered', 'Power your Home with your own generator and battery'],
  2111: ['Underground and Rooftop', 'Unlock the basement and second-floor terrace'],
  2112: ['Renaissance Man', 'Max out the proficiency of all five systems'],
  2113: ['Blueprint Collector', 'Complete the crafting collection'],
  2201: ['First Blood', 'First Zombie Kill'],
  2202: ['Meat Grinder', 'Kill 400 zombies in this loop'],
  2203: ['Triple Defense', 'Deploy 4 spikes, 4 electric nets, and 4 chainsaws each'],
  2204: ['The door is closed', 'Get through a crisis with Front Door Durability still above 80%'],
  2205: ['Iron Wall', 'Upgrade all doors and windows to the highest level'],
  2206: ['Pulled Through', 'Survive a total of 30 hordes'],
  2207: ['Zero Breach', 'Hold the final horde with every door and window above 70% the whole time'],
  2208: ['Rat Catcher', 'Catch a total of 8 rats'],
  2209: ['Experience Makes the Doctor', 'Survive a total of 3 crises'],
  2301: ['Go out for the first time', 'Leave Home to explore for the first time'],
  2302: ['Traverse the Ruins', 'Visit 4 different exploration points at least once'],
  2303: ['Scavenger', 'Explore 15 times in this loop'],
  2304: ['Deep in the Hospital', 'Collect all three clues from the hospital'],
  2305: ['First Deal', 'Complete your first trade with a stranger'],
  2306: ['Regular Customer', 'Establish connections with 4 strangers'],
  2307: ['Supplier', 'Complete 30 transactions in total'],
  2308: ['Aerial Scavenging', 'Send out Drones to scavenge 25 times in this loop'],
  2309: ['Delve Deep into the Ruins', 'Scavenge the Ruined Supermarket 5 times'],
  2401: ['Limit Break', 'Enter Endless Mode for the first time'],
  2402: ['Refusing to Take a Bow', 'Choose to continue holding your ground after reaching an ending'],
  2403: ['Hold Out for Thirty Days', 'Hold out for 30 days in Pure Endless'],
  2404: ['Threat Level 8', 'Reach Threat Level 8 in Endless Mode'],
  2405: ['Mountain of Corpses', 'Kill 2,000 zombies in this loop'],
  3001: ['Just Once', 'Reached the ending without using a single rebirth in this save file'],
  3002: ['Stay behind closed doors', 'Reached the ending without ever leaving home in this loop'],
  3003: ['Minimal Budget', 'Reached the ending while spending no more than half of your money before the disaster in this loop'],
  3004: ['Flawless', 'Reached the ending while keeping doors and windows above 70% throughout this loop'],
  3005: ['Vegetarianism', 'Reached the ending without eating any meat in this loop'],
  3006: ['Going Solo', 'Reached the ending without ever trading with strangers in this loop'],
  3007: ["One Person's Hundred Days", 'Reached the ending without ever progressing the Neighbor storyline in this loop'],
  3008: ['Never Fallen', 'Reached the ending without Life ever dropping below 20% in this loop'],
  9001: ['Between Neighbors', 'Take a stance in the community group chat 12 times'],
  9002: ['TV Enthusiast', 'Score 70 points in any of the five TV mini-games'],
  9003: ['A Room Full of Flowers', 'Harvest 10 flowers'],
  9004: ['Collector', 'Collect all 8 souvenirs and display them at home at the same time'],
  9005: ['Cold as Ice', 'Take a cold bath with ice cubes'],
  9006: ['Midnight Kitchen', 'Cook a meal at 3 AM'],
};

// Counters that keep adding up across loops ("in total"); achievements worded "this loop" (本轮) only read the run.
export const LIFETIME_KEYS = [
  'cook.count',
  'cook.perfect',
  'cook.midnight',
  'plant.harvest',
  'plant.perfect',
  'plant.harvest.flower',
  'trap.place',
  'trap.catch',
  'ratCatch',
  'craft.total',
  'zombie.kill',
  'horde.survived',
  'wave.survived',
  'crisis.survived',
  'crisis.doorHeld80',
  'explore.total',
  'trade.active.dealcount',
  'drone.foraging.count',
  'survivor.aid',
  'marketLoot',
  'group.reply',
  'bath.ice',
];
const LIFETIME = new Set(LIFETIME_KEYS);

const steamByName = new Map((achievementConfig.steam || []).map((s) => [s.en, s]));

export const ACHIEVEMENTS = achievementConfig.list
  .map((c) => {
    const [en, desc] = EN[c.id] || [c.zh, c.zhDesc];
    const steam = steamByName.get(en);
    return {
      id: c.id,
      order: c.order,
      cat: c.cat,
      hidden: !!c.hidden,
      api: c.steam,
      name: { en, zh: c.zh },
      desc: { en: desc, zh: c.zhDesc },
      counter: c.counter || '',
      threshold: c.threshold || 0,
      scope: c.zhDesc.includes('本轮') || !LIFETIME.has(c.counter) ? 'run' : 'life',
      pct: steam ? parseFloat(steam.pct) : null,
      steamDesc: steam?.desc || '',
      cond: c.condZh,
    };
  })
  .sort((a, b) => a.order - b.order);

export const ACH_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

export function achName(a) {
  return pickLang((typeof a === 'object' ? a : ACH_BY_ID[a])?.name);
}

export function achDesc(a) {
  return pickLang((typeof a === 'object' ? a : ACH_BY_ID[a])?.desc);
}

// ------------------------------------------------------------------------------------------ endings
export const ENDINGS = [
  { key: 'evacuate', ach: 1101, name: { en: 'Rescue', zh: '救援' }, chars: ['wage', 'student', 'warehouse'] },
  { key: 'girl', ach: 1102, name: { en: 'Girl Next Door', zh: '女孩' }, chars: ['wage'] },
  { key: 'stranger', ach: 1103, name: { en: 'Stranger', zh: '陌生人' }, chars: ['wage'] },
  { key: 'fortress', ach: 1104, name: { en: 'Safe House', zh: '安全屋' }, chars: ['wage', 'student'] },
  { key: 'truth', ach: 1105, name: { en: 'The Truth', zh: '真相' }, chars: ['wage', 'student', 'warehouse'] },
  { key: 'greenhouse', ach: 1106, name: { en: 'Doomsday Greenhouse', zh: '末日温室' }, chars: ['student'] },
  { key: 'companion', ach: 1107, name: { en: 'Companionship', zh: '陪伴' }, chars: ['student'] },
  { key: 'supply', ach: 1108, name: { en: 'Iron Barrel Hub', zh: '铁桶枢纽' }, chars: ['warehouse'] },
  { key: 'lastOne', ach: 1109, name: { en: 'Survival: Last One Standing', zh: '活到最后' }, chars: ['wage', 'student', 'warehouse'] },
];
const ENDING_KEYS = new Set(ENDINGS.map((e) => e.key));
const ENDING_BY_ACH = Object.fromEntries(ENDINGS.map((e) => [e.ach, e.key]));

// Ending ids of src/content/endings.js (= commit routes + lastOne), config ending ids (Config_Achievement values
// 5..13) and common aliases.
const ENDING_ALIASES = {
  evacuate: ['evacuate', 'evacuation', 'rescue', 'beacon', '5'],
  girl: ['girl', 'girlnextdoor', 'sidebyside', 'neighbor', 'neighbour', '6'],
  stranger: ['stranger', 'strangers', 'net', 'network', '7'],
  fortress: ['fortress', 'shelter', 'safehouse', '8'],
  truth: ['truth', 'thetruth', '9'],
  lastOne: ['lastone', 'survival', 'lieflat', 'lyingflat', 'stayinplace', 'laststanding', 'lastonestanding', 'survivallastonestanding', 'default', '10'],
  greenhouse: ['greenhouse', 'doomsdaygreenhouse', '11'],
  companion: ['companion', 'companionship', '12'],
  supply: ['supply', 'supplyhub', 'supplystation', 'ironbarrel', 'ironbarrelhub', 'hub', '13'],
};
const ALIAS_TO_KEY = {};
for (const [key, list] of Object.entries(ENDING_ALIASES)) for (const a of list) ALIAS_TO_KEY[a] = key;

export function canonicalEnding(id) {
  if (id == null || id === '') return null;
  let s = String(id).toLowerCase().replace(/[^a-z0-9]/g, '');
  for (let i = 0; i < 3 && !ALIAS_TO_KEY[s]; i++) s = s.replace(/^(tag|ending|line|route)/, '').replace(/(ending|chosen|route)$/, '');
  return ALIAS_TO_KEY[s] || s || null;
}

export function unlockCharacter(history, id) {
  if (!CHARACTERS[id]) return false;
  history.characters = history.characters || {};
  if (history.characters[id]) return false;
  history.characters[id] = true;
  return true;
}

// Reaching any ending unlocks the next identity (character unlock hints).
export const NEXT_CHARACTER = { wage: 'student', student: 'warehouse' };

// Patch 08-14: "completing any ending will also unlock the next available character" — the next identity, or the
// first still-locked one when that is already unlocked.
export function nextCharacterUnlock(history, character) {
  const have = history?.characters || {};
  const next = NEXT_CHARACTER[character];
  if (next && !have[next]) return next;
  return CHARACTER_ORDER.find((id) => !have[id]) || null;
}

export function recordEnding(history, id, character) {
  const key = canonicalEnding(id);
  if (!key) return null;
  history.endings = history.endings || {};
  history.endings[key] = true;
  if (character) {
    history.endingsByChar = history.endingsByChar || {};
    const byChar = (history.endingsByChar[character] = history.endingsByChar[character] || {});
    byChar[key] = true;
  }
  return key;
}

// ------------------------------------------------------------------------------------------ state readers
// `wave.survived` (Pulled Through, 2206) counts endless-mode hordes only; `horde.survived` counts every horde.
const FALLBACK = {
  'zombie.kill': (s) => s.progress.kills || 0,
  'crisis.survived': (s) => s.progress.crisesSurvived || 0,
  'horde.survived': (s) => s.progress.hordesSurvived || 0,
  'wave.survived': (s) => (s.crises?.history || []).filter((e) => e.type === 'horde' && e.kind === 'endless' && e.survived).length,
  clue: (s) => (s.story?.clues || []).length,
  PlantPotCount: (s) => plantersAtHome(s),
  'pre.points': (s) => (s.pre?.visited || []).length,
  'pre.foodTypes': (s) => (s.pre?.foodTypes || []).length,
  'pre.matTypes': (s) => (s.pre?.matTypes || []).length,
};

export function runCounter(s, key) {
  if (!s?.progress) return 0;
  const v = Number(s.progress.counters?.[key]) || 0;
  const fb = FALLBACK[key];
  return fb ? Math.max(v, Number(fb(s)) || 0) : v;
}

export function lifetimeCounter(s, h, key) {
  return Math.max(runCounter(s, key), Number(h?.counters?.[key]) || 0);
}

function counterValue(a, { s, h }) {
  return a.scope === 'life' ? lifetimeCounter(s, h, a.counter) : runCounter(s, a.counter);
}

const tag = (s, k) => !!s?.story?.tags?.[k];
const taboo = (s) => s?.progress?.taboo || {};
const postDay = (s) => (s?.clock && s.phase !== 'pre' ? dayNumber(s.clock) : 0);

export function runEnding(s) {
  if (!s) return null;
  return s.progress?.ending || s.run?.ending || s.story?.ending || (s.phase === 'ending' ? 'unknown' : null);
}

export function routeChosen(s) {
  if (!s?.story) return null;
  if (s.story.route) return canonicalEnding(s.story.route);
  const t = s.story.tags || {};
  const k = Object.keys(t).find((x) => t[x] && /^TAG_LINE_[A-Z_]+_CHOSEN$/.test(x));
  return k ? canonicalEnding(k.slice(9, -7)) : null;
}

const chose = (s, route) => routeChosen(s) === route;

function plantersAtHome(s) {
  if (!s?.home) return 0;
  return homeFurniture(s).filter((f) => typeof f.cfg === 'number' && furn(f.cfg)?.plant > 0).length;
}

function elecKinds(s) {
  const kinds = new Set();
  for (const f of homeFurniture(s)) if (typeof f.cfg === 'number') kinds.add(furn(f.cfg)?.elec || 0);
  return kinds;
}

export function stockKg(s) {
  if (!s?.inventories) return 0;
  const ids = new Set(s.home ? homeSources(s) : []);
  if (s.pre?.trunk) ids.add(s.pre.trunk);
  if (s.home?.doorstepInv) ids.add(s.home.doorstepInv);
  for (const b of s.floorBoxes || []) ids.add(b.inv);
  let g = 0;
  for (const id of ids) if (s.inventories[id]) g += weightG(s.inventories[id]);
  return g / 1000;
}

// The pre-disaster system reports counters['pre.kg']; the weight gained since the run started is the fallback.
export function preKg(s) {
  if (!s?.progress) return 0;
  const counted = s.progress.counters?.['pre.kg'];
  if (counted != null) return Number(counted) || 0;
  const snap = s.progress.snap || {};
  if (s.phase === 'pre' && snap.baseKg != null) return Math.max(0, stockKg(s) - snap.baseKg);
  return snap.kg ?? 0;
}

function outbreakMoney(s) {
  if (!s?.progress || s.phase === 'pre') return null;
  if (s.progress.snap?.money != null) return s.progress.snap.money;
  const left = s.progress.counters?.['pre.moneyLeft'];
  return left != null ? Number(left) : null;
}

function overspent(s) {
  const budget = s?.pre?.budget || 0;
  return budget > 0 && (s.pre.spent || 0) > budget / 2;
}

export function homeStock(s) {
  const out = { sat: 0, items: 0, storage: 0 };
  if (!s?.home) return out;
  for (const invId of homeSources(s)) {
    const inv = s.inventories[invId];
    if (!inv) continue;
    for (const it of inv.items) {
      const q = it.qty || 1;
      out.items += q;
      const cfg = item(it.id);
      if (cfg?.cat === CAT.FOOD && cfg.sat > 0) out.sat += cfg.sat * q * (cfg.uses > 1 ? (it.uses ?? cfg.uses) : 1) * (it.left ?? 1);
    }
  }
  for (const f of homeFurniture(s)) if (f.inv && s.inventories[f.inv] && !s.inventories[f.inv].special) out.storage++;
  return out;
}

function over150(s) {
  if (!s?.player) return 0;
  const now = STAT_KEYS.filter((k) => effectiveMax(s, k) > 150).length;
  return Math.max(now, s.progress?.maxOver150 || 0);
}

function electrician(s) {
  if (!s?.home) return false;
  if (runCounter(s, 'power.allTypes') >= 1) return true;
  const kinds = elecKinds(s);
  if (![ELEC.SOLAR, ELEC.FUEL_GEN, ELEC.BATTERY, ELEC.RAT_GEN].every((k) => kinds.has(k))) return false;
  if (s.power?.homePowered !== true) return false;
  return homeFurniture(s).every((f) => typeof f.cfg !== 'number' || furn(f.cfg)?.elec !== ELEC.CONSUMER || f.on === false || f.powered !== false);
}

function ownPower(s) {
  if (!s?.home) return false;
  if (runCounter(s, 'power.own') >= 1) return true;
  if (s.power?.homePowered !== true || s.power?.grid !== false) return false;
  const kinds = elecKinds(s);
  return kinds.has(ELEC.BATTERY) && [ELEC.SOLAR, ELEC.FUEL_GEN, ELEC.MANUAL_GEN, ELEC.RAT_GEN].some((k) => kinds.has(k));
}

function basementAndRoof(s) {
  if (!s) return false;
  if (runCounter(s, 'floors.both') >= 1) return true;
  if (tag(s, 'TAG_FLOOR_B1_UNLOCKED') && tag(s, 'TAG_FLOOR_2F_UNLOCKED')) return true;
  const locks = (s.home && homeDef(s.home.id)?.locks) || {};
  return !!(locks['2F'] && locks.B1 && s.home.unlocked['2F'] && s.home.unlocked.B1);
}

function maxedSystems(s) {
  if (!s?.progress?.prof) return 0;
  return FIVE_SYSTEMS.filter((k) => (s.progress.prof[k]?.lv ?? 0) >= PROF[k].max).length;
}

export const DEFENSE_DEVICES = [
  [36002, 'defense.spike'],
  [36003, 'defense.net'],
  [36004, 'defense.chainsaw'],
];

function tripleLine(s) {
  const counts = placedCounts(s);
  return DEFENSE_DEVICES.map(([id, key]) => Math.max(counts[id] || 0, runCounter(s, key)));
}

export const TOP_DOOR = 30002;
export const TOP_WINDOW = 35002;
const REPAIR_FUNCS = [30, 44];

// Openings that can be repaired/upgraded (decorative doors such as the doorstep door do not count).
function defendedOpenings(s) {
  return doorAndWindows(s).filter((f) => typeof f.cfg === 'number' && (furn(f.cfg)?.funcs || []).some((k) => REPAIR_FUNCS.includes(k)));
}

function ironWall(s) {
  if (!s?.home) return false;
  const list = defendedOpenings(s);
  return list.length > 0 && list.every((f) => f.cfg === TOP_DOOR || f.cfg === TOP_WINDOW);
}

function hospitalClues(s) {
  const listed = (s?.story?.clues || []).filter((c) => /hospital/i.test(String(c?.id ?? c?.site ?? c))).length;
  return Math.max(runCounter(s, 'clue.hospital'), listed);
}

function craftCodexCount(s, h) {
  const ids = new Set();
  for (const raw of [...(h?.codex?.craft || []), ...(s?.progress?.codexRun?.craft || [])]) {
    const id = normalizeCodexId('craft', raw);
    if (id != null) ids.add(id);
  }
  return ids.size;
}

function tvBest({ s, h }) {
  const hist = Object.values(h?.tvBest || {}).map((v) => Number(v) || 0);
  return Math.max(runCounter(s, 'tvgame.best'), 0, ...hist);
}

function endingsSeen({ s, h }) {
  const out = new Set();
  for (const [k, v] of Object.entries(h?.endings || {})) {
    const key = canonicalEnding(k);
    if (v && ENDING_KEYS.has(key)) out.add(key);
  }
  const cur = canonicalEnding(runEnding(s));
  if (ENDING_KEYS.has(cur)) out.add(cur);
  return out;
}

function charHasEnding({ s, h }, ch) {
  if (Object.values(h?.endingsByChar?.[ch] || {}).some(Boolean)) return true;
  return !!runEnding(s) && s.meta?.character === ch;
}

const charsWithEndings = (c) => CHARACTER_ORDER.filter((ch) => charHasEnding(c, ch)).length;

// ------------------------------------------------------------------------------------------ predicates
const survivedDays = (n) => ({ test: ({ s }) => daysSurvived(s) >= n, progress: ({ s }) => s && [daysSurvived(s), n] });
const stockpiled = (kg) => ({ test: ({ s }) => preKg(s) > kg, progress: ({ s }) => s && [Math.floor(preKg(s) * 10) / 10, kg] });
const endingAch = (key) => ({ test: (c) => endingsSeen(c).has(key) });
const charStory = (ch) => ({ test: (c) => charHasEnding(c, ch) });
const counterAtLeast = (key, n, scope = 'run') => ({
  test: ({ s, h }) => (scope === 'life' ? lifetimeCounter(s, h, key) : runCounter(s, key)) >= n,
  progress: n > 1 ? ({ s, h }) => [scope === 'life' ? lifetimeCounter(s, h, key) : runCounter(s, key), n] : undefined,
});
const challenge = (broken) => ({ test: ({ s }) => !!runEnding(s) && !broken(s, taboo(s)) });

const SPECIAL = {
  1001: survivedDays(1),
  1002: survivedDays(7),
  1003: survivedDays(30),
  1004: survivedDays(50),
  1005: { test: ({ s }) => tag(s, 'TAG_RECKONING') || postDay(s) >= 70, progress: ({ s }) => s && [postDay(s), 70] },
  1006: { test: ({ s }) => routeChosen(s) != null },
  1007: { test: ({ s }) => tag(s, 'TAG_FINAL_WAVE_SURVIVED') || (s?.meta?.mode !== 'pureEndless' && postDay(s) >= 88) },
  1008: survivedDays(100),
  1101: endingAch('evacuate'),
  1102: endingAch('girl'),
  1103: endingAch('stranger'),
  1104: endingAch('fortress'),
  1105: endingAch('truth'),
  1106: endingAch('greenhouse'),
  1107: endingAch('companion'),
  1108: endingAch('supply'),
  1109: endingAch('lastOne'),
  1110: charStory('wage'),
  1111: charStory('student'),
  1112: charStory('warehouse'),
  1113: { test: (c) => charsWithEndings(c) >= 3, progress: (c) => [charsWithEndings(c), 3] },
  1114: { test: (c) => endingsSeen(c).size >= 9, progress: (c) => [endingsSeen(c).size, 9] },
  1201: { test: ({ s }) => electrician(s) },
  1202: {
    test: ({ s }) => chose(s, 'stranger') && runCounter(s, 'camp.prep.supply') >= 12,
    progress: ({ s }) => s && [runCounter(s, 'camp.prep.supply'), 12],
  },
  1211: counterAtLeast('PlantPotCount', 24),
  1213: { test: ({ s }) => tag(s, 'TAG_NEIGHBOR_ENDING_COZY') },
  1221: {
    test: ({ s }) => {
      const st = homeStock(s);
      return st.sat >= 1200 && st.items >= 180 && st.storage >= 8;
    },
    progress: ({ s }) => {
      if (!s) return null;
      const st = homeStock(s);
      return [(st.sat >= 1200) + (st.items >= 180) + (st.storage >= 8), 3];
    },
  },
  1203: { test: ({ s }) => runCounter(s, 'clue.truth') >= 4, progress: ({ s }) => s && [Math.min(4, runCounter(s, 'clue.truth')), 4] },
  1223: { test: ({ s }) => runCounter(s, 'clue.slip') >= 3 && chose(s, 'supply') },
  2001: stockpiled(5),
  2002: stockpiled(25),
  2003: stockpiled(50),
  2004: {
    test: ({ s }) => {
      const m = outbreakMoney(s);
      return m != null && m < 50;
    },
  },
  2005: counterAtLeast('pre.points', 5),
  2006: counterAtLeast('pre.foodTypes', 20),
  2007: counterAtLeast('pre.matTypes', 4),
  2008: { test: ({ s }) => !!s?.player && ['sat', 'mor', 'sta', 'life'].every((k) => s.player.stats[k] >= 80) },
  2009: { test: ({ s }) => homeStock(s).sat > 2000, progress: ({ s }) => s && [Math.floor(homeStock(s).sat), 2000] },
  2010: { test: ({ s }) => postDay(s) >= 30 && !taboo(s).foodRot && !runCounter(s, 'food.rot'), progress: ({ s }) => s && [postDay(s), 30] },
  2011: { test: ({ s }) => over150(s) >= 1 },
  2012: { test: ({ s }) => over150(s) >= 3, progress: ({ s }) => s && [over150(s), 3] },
  2110: { test: ({ s }) => ownPower(s) },
  2111: { test: ({ s }) => basementAndRoof(s) },
  2112: { test: ({ s }) => runCounter(s, 'prof.allmax') >= 1 || maxedSystems(s) >= 5, progress: ({ s }) => s && [maxedSystems(s), 5] },
  2113: { test: ({ s, h }) => craftCodexCount(s, h) >= codexTotal('craft'), progress: ({ s, h }) => [craftCodexCount(s, h), codexTotal('craft')] },
  2203: {
    test: ({ s }) => !!s && tripleLine(s).every((n) => n >= 4),
    progress: ({ s }) => s && [tripleLine(s).reduce((a, n) => a + Math.min(4, n), 0), 12],
  },
  2204: counterAtLeast('crisis.doorHeld80', 1, 'life'),
  2205: { test: ({ s }) => ironWall(s) },
  2207: {
    test: ({ s }) => tag(s, 'TAG_FINAL_WAVE_SURVIVED') && runCounter(s, 'siege.final.kill') >= 40 && !taboo(s).siegeDoorWorn,
    progress: ({ s }) => s && [runCounter(s, 'siege.final.kill'), 40],
  },
  2304: { test: ({ s }) => hospitalClues(s) >= 3, progress: ({ s }) => s && [hospitalClues(s), 3] },
  2401: { test: ({ s }) => endlessStateOf(s) >= 1 },
  2402: { test: ({ s }) => endlessStateOf(s) === ENDLESS_STORY },
  2403: {
    test: ({ s }) => endlessStateOf(s) === ENDLESS_PURE && endlessDays(s) >= 30,
    progress: ({ s, h }) => [endlessStateOf(s) === ENDLESS_PURE ? endlessDays(s) : Math.max(0, ...Object.values(h?.endless?.bestPure || {})), 30],
  },
  2404: {
    test: ({ s }) => endlessStateOf(s) >= 1 && threatLevel(s) >= 8,
    progress: ({ s, h }) => [Math.max(endlessStateOf(s) ? threatLevel(s) : 0, h?.endless?.maxThreat || 0), 8],
  },
  3001: challenge((s, t) => t.rebirth || (s.loop?.rebirths || 0) > 0),
  3002: challenge((s, t) => t.explore || runCounter(s, 'explore.total') > 0),
  3003: challenge((s, t) => t.overspend || overspent(s)),
  3004: challenge((s, t) => t.doorWorn),
  3005: challenge((s, t) => t.meat),
  3006: challenge((s, t) => t.trade || runCounter(s, 'trade.active.dealcount') > 0),
  3007: challenge((s, t) => t.neighbor),
  3008: challenge((s, t) => t.lowVitality),
  9002: { test: (c) => tvBest(c) >= 70, progress: (c) => [tvBest(c), 70] },
  9004: { test: ({ s }) => souvenirsPlaced(s).length >= COLLECTOR_IDS.length, progress: ({ s }) => s && [souvenirsPlaced(s).length, COLLECTOR_IDS.length] },
  9005: counterAtLeast('bath.ice', 1, 'life'),
  9006: counterAtLeast('cook.midnight', 1, 'life'),
};

export const SPECIAL_IDS = Object.keys(SPECIAL).map(Number);

function ctxOf(state, history) {
  return { s: state || null, h: history || {} };
}

export function checkAchievement(id, state, history) {
  const a = ACH_BY_ID[id];
  if (!a) return false;
  const c = ctxOf(state, history);
  try {
    const sp = SPECIAL[id];
    if (sp) return !!sp.test(c);
    if (a.counter && a.threshold > 0) return counterValue(a, c) >= a.threshold;
  } catch (err) {
    console.warn(`achievement ${id} check failed`, err);
  }
  return false;
}

// { value, target } for progress bars, or null when the achievement has no meaningful progress.
export function achievementProgress(id, state, history) {
  const a = typeof id === 'object' ? id : ACH_BY_ID[id];
  if (!a) return null;
  const c = ctxOf(state, history);
  let r = null;
  try {
    const sp = SPECIAL[a.id];
    if (sp) r = sp.progress ? sp.progress(c) : null;
    else if (a.counter && a.threshold > 1) r = [counterValue(a, c), a.threshold];
  } catch {
    r = null;
  }
  if (!r) return null;
  const [value, target] = r;
  return { value: Math.max(0, Math.min(value, target)), target, raw: value };
}

// Fold this run's counters into history.counters (only the increase since the last fold).
export function accumulateLifetime(state, history) {
  if (!state?.progress || !history) return false;
  const seen = (state.progress.lifeSeen = state.progress.lifeSeen || {});
  const hc = (history.counters = history.counters || {});
  let changed = false;
  for (const key of LIFETIME_KEYS) {
    const cur = runCounter(state, key);
    const prev = seen[key] || 0;
    if (cur > prev) {
      hc[key] = (hc[key] || 0) + (cur - prev);
      seen[key] = cur;
      changed = true;
    }
  }
  return changed;
}

export function unlockMet(state, history, now = Date.now()) {
  history.achievements = history.achievements || {};
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (history.achievements[a.id]) continue;
    if (checkAchievement(a.id, state, history)) {
      history.achievements[a.id] = now;
      fresh.push(a.id);
    }
  }
  return fresh;
}

// Pure core: fold lifetime counters, unlock everything that is met. Returns the newly unlocked ids.
export function evaluateAchievements(state, history, now = Date.now()) {
  if (state) accumulateLifetime(state, history);
  return unlockMet(state, history, now);
}

export function unlockedCount(history) {
  return ACHIEVEMENTS.filter((a) => history?.achievements?.[a.id]).length;
}

// Sticky per-loop flags derived from the house itself (fallbacks for the defense system's own tracking).
export function trackTaboos(state) {
  if (state.phase !== 'post' || !state.home) return;
  const t = (state.progress.taboo = state.progress.taboo || {});
  if (t.doorWorn && t.siegeDoorWorn) return;
  const worn = defendedOpenings(state).some((f) => f.hp < effectiveMaxHp(f) * 0.7);
  if (!worn) return;
  t.doorWorn = true;
  if (finalSiegeActive(state)) t.siegeDoorWorn = true;
}

function finalSiegeActive(s) {
  const hordes = (s.crises?.active || []).filter((c) => c.type === 'horde');
  if (!hordes.length) return false;
  if (hordes.some((c) => c.final || c.isFinal || /final/i.test(`${c.id || ''}${c.kind || ''}${c.name || ''}`))) return true;
  const d = postDay(s);
  return s.meta?.mode !== 'pureEndless' && d >= 87 && d <= 88;
}

export function snapshotOutbreak(state) {
  const snap = (state.progress.snap = state.progress.snap || {});
  snap.money = state.player.money;
  if (snap.baseKg != null) snap.kg = Math.max(0, stockKg(state) - snap.baseKg);
  return snap;
}

// ------------------------------------------------------------------------------------------ live wiring
function announce(id) {
  const a = ACH_BY_ID[id];
  emit('achievement', { id, name: achName(a) });
  emit('toast', { text: pickLang({ en: `Achievement unlocked: ${a.name.en}`, zh: `成就解锁：${a.name.zh}` }), kind: 'good' });
}

export function runEvaluation() {
  const s = game.state;
  const h = game.history;
  const changed = s ? accumulateLifetime(s, h) : false;
  const fresh = unlockMet(s, h);
  if (fresh.length || changed) persistHistory();
  for (const id of fresh) announce(id);
  return fresh;
}

let pending = false;
function schedule() {
  if (pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    runEvaluation();
  }, 0);
}

function grantCharacter(id) {
  if (!id || !unlockCharacter(game.history, id)) return false;
  persistHistory();
  emit('characterUnlocked', { id });
  emit('toast', { text: pickLang({ en: `New character unlocked: ${CHARACTERS[id].name.en}`, zh: `新角色解锁：${CHARACTERS[id].name.zh}` }), kind: 'good' });
  return true;
}

// True while an ending is being announced: endings.js emits 'endingReached' and then 'unlockCharacter' for the
// same ending, which must not unlock a second character.
let endingUnlockSettled = false;

// 'ending' carries no character; endings.js follows it with 'endingReached', which grants the unlock.
function onEnding(p, type) {
  const s = game.state;
  const obj = p && typeof p === 'object' ? p : {};
  const raw = ENDING_BY_ACH[obj.achievement] ?? obj.id ?? obj.ending ?? obj.key ?? p;
  const character = obj.character || s?.meta?.character;
  const key = recordEnding(game.history, raw, character);
  if (!key) return;
  if (s?.progress && !s.progress.ending) s.progress.ending = key;
  if (type === 'endingReached') {
    grantCharacter(nextCharacterUnlock(game.history, character));
    endingUnlockSettled = true;
    queueMicrotask(() => (endingUnlockSettled = false));
  }
  persistHistory();
  schedule();
}

on('ending', onEnding);
on('endingReached', onEnding);
// Story lines name their own character with a reason ('neighbor', 'rescue'). Ending unlocks come without one (or
// with { next: true }) and fall through to the next locked character when the named one is already unlocked.
on('unlockCharacter', (p) => {
  const o = p && typeof p === 'object' ? p : { id: p };
  let id = o.next ? null : o.id;
  if ((!o.reason || o.reason === 'ending') && (!id || game.history.characters?.[id])) {
    if (endingUnlockSettled) return;
    id = nextCharacterUnlock(game.history, null);
  }
  grantCharacter(id);
});
for (const ev of ['runStarted', 'storyEndless', 'endlessStarted', 'tvScore', 'codex', 'actionDone', 'furnitureInstalled', 'installed', 'areaUnlocked', 'profUp', 'maxRaised', 'trapCaught', 'crafted', 'powerChanged']) {
  on(ev, schedule);
}

const lastTabooCheck = new WeakMap();

registerSystem({
  id: 'achievements',
  order: 95,
  init(state) {
    state.progress.snap = { baseKg: stockKg(state) };
  },
  tick(state) {
    if (state.phase !== 'post') return;
    const slot = Math.floor(state.clock.t / 120);
    if (lastTabooCheck.get(state) === slot) return;
    lastTabooCheck.set(state, slot);
    trackTaboos(state);
  },
  onHour(state) {
    if (state === game.state) runEvaluation();
  },
  beforeOutbreak(state) {
    snapshotOutbreak(state);
    if (state === game.state) runEvaluation();
  },
  onOutbreak(state) {
    if (state === game.state) runEvaluation();
  },
  onDay(state) {
    if (state === game.state) runEvaluation();
  },
  onDeath(state) {
    if (state === game.state) runEvaluation();
  },
});
