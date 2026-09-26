// @ts-check
// Furniture (Config_Furniture): for every home piece (data.mjs furnitureScope: a package item, a movable piece with a
// slot type, or a home model) and every other piece a home starts with or the sim places at home, for each
// character, put it into the home — the starter piece where a home has it,
// the piece the sim placed during the first week, else installed into a slot that takes it (installFurniture, as
// the install action does) — and run every config function (FurnitureFunc, RemoveFunc, MoveFunc) the way the
// furniture menu does (furnitureFunctions + startFurnitureFunction), in the phase its Chapter allows. Before each
// function the probe sets up the situation that function is for (items it needs, a damaged door to repair, a crop
// with pests to treat, a night to sleep, …). A function that works for one character counts; for the others the
// result says why not. Functions that hand out random finds run again over several seeds; dismantling and
// recycling also run with Tool Pliers along, which should halve the work. Whether a function handed out items is
// recorded with it (loot functions must). Site and shop pieces no home places are left to drivers/sitefx.mjs and
// drivers/shops.mjs.
import { furnitureScope, gameConfig } from '../data.mjs';
import { CHARACTERS, HOUR, advanceTo, give, keepAlive, loadSim, placeAtHome, postGame, preGame, runUntilIdle, unlockHome } from '../sim.mjs';
import { Recorder, trackUnlocks } from '../observe.mjs';

const SPROUT = 15024; // spinach seeds: the quickest real crop
const PLIERS = 20350;
const MARK = [9003, 20001, 20001, 20002, 20003, 20004]; // rescue marker blueprint and scrap for "Make Survival Marker"
const NOTE = 9014; // the truck note that starts the Warehouse Manager line
const LOOT_SEEDS = 40;
const SIM_PLACED_DAY = 8;
const SCOPE = furnitureScope(gameConfig());

/**
 * @param {{ furniture: number[], characters?: string[] }} args
 */
export async function run({ furniture, characters = CHARACTERS }) {
  const S = await loadSim();
  const FA = S.furnActions;
  const rec = new Recorder();
  const off = trackUnlocks(S, rec, 'furniture');
  /** @type {Map<string, any>} */
  const bases = new Map();
  /** @param {string} character @param {'pre' | 'post' | 'week'} phase */
  const baseFor = (character, phase) => {
    const key = `${character}:${phase}`;
    if (!bases.has(key)) {
      const s = phase === 'pre' ? preGame(S, { seed: 111, character }) : postGame(S, { seed: 111, character });
      unlockHome(S, s);
      if (phase === 'week') advanceTo(S, s, SIM_PLACED_DAY);
      else if (phase === 'post') S.tick.tick(s, 60);
      bases.set(key, s);
    }
    return bases.get(key);
  };
  const starters = new Set(Object.values(/** @type {Record<string, any>} */ (S.homes.HOMES)).flatMap((h) => h.starter.map((/** @type {any} */ x) => x.furn)));
  /** @param {number} cfg @param {string} character */
  const simPlaced = (cfg, character) => Object.values(baseFor(character, 'week').furniture).some((/** @type {any} */ f) => f.cfg === cfg);

  for (const cfg of furniture) {
    const def = S.db.furn(cfg);
    const res = { starter: /** @type {string[]} */ ([]), placed: /** @type {string[]} */ ([]), installs: /** @type {Record<string, string | true>} */ ({}), funcs: /** @type {Record<string, any>} */ ({}) };
    if (!def) continue;
    const home = SCOPE.get(cfg)?.cls === 'home';
    if (!home && !starters.has(cfg) && !characters.some((ch) => simPlaced(cfg, ch))) continue; // placed away from home only
    rec.result('furniture', cfg, res);
    const keys = [...new Set([...(def.funcs || []), ...(def.rmFunc || []), ...(def.mvFunc || [])])];
    for (const k of keys) res.funcs[k] = { ok: false, by: null, why: {} };
    for (const character of characters) {
      // in the home: the starter piece, the piece the sim placed, or installed into a slot
      let post = structuredClone(baseFor(character, 'post'));
      let piece = S.home.homeFurniture(post).find((/** @type {any} */ f) => f.cfg === cfg);
      if (piece) res.starter.push(character);
      else if (simPlaced(cfg, character)) {
        post = structuredClone(baseFor(character, 'week'));
        piece = Object.values(post.furniture).find((/** @type {any} */ f) => f.cfg === cfg);
        res.placed.push(character);
      } else if (home) {
        piece = placeAtHome(S, post, cfg);
        res.installs[character] = piece ? true : installWhy(S, post, cfg);
      }
      if (!piece) continue;
      if (res.installs[character] === true) rec.furnished(cfg, `install:${character}`);
      for (const key of keys) {
        const r = res.funcs[key];
        if (r.ok) continue;
        const chapter = S.db.func(key)?.chapter ?? 0;
        const phases = chapter === 1 ? ['pre'] : chapter === 2 ? ['post'] : ['post', 'pre'];
        for (const phase of phases) {
          const s = phase === 'post' ? structuredClone(post) : structuredClone(baseFor(character, 'pre'));
          let f = s.furniture[piece.uid];
          if (phase === 'pre' && f?.cfg !== cfg) {
            // the pre-disaster home: the same piece, installed before the outbreak
            f = S.home.homeFurniture(s).find((/** @type {any} */ x) => x.cfg === cfg) || placeAtHome(S, s, cfg);
          }
          if (!f) {
            r.why[`${character}:${phase}`] = 'not in the pre-disaster home';
            continue;
          }
          const out = runFunction(S, rec, s, f, key);
          if (out.gave) r.gave = true;
          if (out.ok) {
            Object.assign(r, { ok: true, by: `${character}:${phase}`, detail: out.detail || null });
            break;
          }
          r.why[`${character}:${phase}`] = out.why;
        }
      }
    }
  }
  off();
  return rec.obs;

  /**
   * @param {Record<string, any>} S @param {Recorder} rec @param {any} s @param {any} f @param {number} key
   * @returns {{ ok: boolean, why?: string, detail?: string, gave?: boolean }}
   */
  function runFunction(S, rec, s, f, key) {
    keepAlive(s);
    const situation = prepare(S, s, f, key);
    const entry = FA.furnitureFunctions(s, f).find((/** @type {any} */ e) => e.key === key);
    if (!entry) return { ok: false, why: hiddenWhy(S, s, f, key, situation) };
    if (!entry.enabled) return { ok: false, why: `offered but disabled: ${entry.reason}${situation ? ` (situation: ${situation})` : ''}` };
    const kind = entry.spec.kind;
    /** @type {any[]} */
    const done = [];
    /** @type {any[]} */
    const panels = [];
    const offDone = S.bus.on('actionDone', (/** @type {any} */ a) => a.funcKey === key && done.push(a));
    const offPanel = S.bus.on('openPanel', (/** @type {any} */ p) => panels.push(p));
    /** @type {string[]} */
    const toasts = [];
    const offToast = S.bus.on('toast', (/** @type {any} */ t) => t.kind === 'bad' && toasts.push(t.text));
    const before = kind === 'dismantle' || kind === 'recycle' || entry.spec.lootPool ? structuredClone(s) : null;
    let extra = null;
    try {
      const w = rec.watch(s, `func:${key}`, () => {
        const a = FA.startFurnitureFunction(s, f.uid, key);
        if (!a) return false;
        runUntilIdle(S, s, Math.max(2 * HOUR, (entry.spec.min || 0) * 60 * 3));
        if (s.actions.current?.funcKey === key) S.actions.cancelAll(s); // a continuous action still going: it ran
        return true;
      });
      const said = toasts.length ? ` (${toasts.at(-1)})` : '';
      if (!w.value) return { ok: false, why: `startFurnitureFunction refused${said}` };
      if (!done.length) return { ok: false, why: `the ${kind} action never completed${said}` };
      if (kind === 'open' && !panels.some((p) => p.panel === entry.spec.panel)) return { ok: false, why: `the ${entry.spec.panel} panel never opened` };
      let gave = w.up.length > 0;
      if (before && entry.spec.lootPool) {
        const more = sampleLoot(S, rec, before, f.uid, key);
        extra = more.text;
        gave ||= more.gave;
      } else if (before) extra = pliersCheck(S, rec, before, f.uid, key, done[0].dur);
      return { ok: true, gave, detail: [situation, extra].filter(Boolean).join('; ') || undefined };
    } finally {
      offDone();
      offPanel();
      offToast();
    }
  }
}

/**
 * A function that hands out random finds (a makeItem loot pool), again over several RNG seeds.
 * @param {Record<string, any>} S
 * @param {Recorder} rec
 * @param {any} s  the run before the function ran
 * @param {number} uid
 * @param {number} key
 */
function sampleLoot(S, rec, s, uid, key) {
  let gave = false;
  for (let k = 1; k <= LOOT_SEEDS; k++) {
    const t = structuredClone(s);
    t.rng = S.rng.seedRng(k);
    const w = rec.watch(t, `func:${key}`, () => {
      if (S.furnActions.startFurnitureFunction(t, uid, key)) runUntilIdle(S, t, 2 * HOUR);
    });
    gave ||= w.up.length > 0;
  }
  return { text: `${LOOT_SEEDS} more rolls of its loot pool`, gave };
}

/**
 * The same dismantling with Tool Pliers in the backpack ("can take apart some small items"): when the work is
 * quicker, the pliers were used as a tool.
 * @param {Record<string, any>} S
 * @param {Recorder} rec
 * @param {any} s  the run before the function ran
 * @param {number} uid
 * @param {number} key
 * @param {number} plain  the work without pliers, in game seconds
 * @returns {string | null}
 */
function pliersCheck(S, rec, s, uid, key, plain) {
  give(S, s, PLIERS);
  const a = S.furnActions.startFurnitureFunction(s, uid, key);
  if (!a || !(plain > 0)) return null;
  if (a.dur < plain) {
    rec.used(PLIERS, `func:${key}`);
    return `with Tool Pliers ${Math.round(a.dur / 60)} min instead of ${Math.round(plain / 60)}`;
  }
  return null;
}

/** Why no slot of the character's home takes the piece. */
function installWhy(/** @type {Record<string, any>} */ S, /** @type {any} */ s, /** @type {number} */ cfg) {
  const def = S.db.furn(cfg);
  const slots = S.homes.HOMES[s.home.id].slots;
  const fits = slots.filter((/** @type {any} */ x) => S.home.slotAccepts(x.type, def.slot));
  if (!fits.length) return `no ${s.home.id} slot has SlotType ${def.slot}`;
  const why = fits.map((/** @type {any} */ x) => S.home.canInstall(s, cfg, x.id).reason).filter(Boolean);
  return `every ${s.home.id} slot of type ${def.slot} refuses it (${[...new Set(why)].join(', ')})`;
}

/** Why the furniture menu does not list the function. */
function hiddenWhy(/** @type {Record<string, any>} */ S, /** @type {any} */ s, /** @type {any} */ f, /** @type {number} */ key, /** @type {string} */ situation) {
  const cfg = S.db.func(key);
  const spec = S.funcSpecs.FUNC_SPECS[key];
  if (!spec && !(cfg && Object.values(S.funcSpecs.parsePreview(cfg.preview)).some((/** @type {any} */ o) => Object.keys(o).length))) return 'no spec in src/content/funcSpecs.js and no PreviewAttrDelta to derive one';
  if (cfg?.chapter === 1 && s.phase !== 'pre') return 'a pre-disaster function (Chapter 1)';
  if (cfg?.chapter === 2 && s.phase === 'pre') return 'a post-disaster function (Chapter 2)';
  const kind = spec?.kind || 'stat';
  if (!S.actions.getKind(kind)) return `its kind '${kind}' is not a registered action kind`;
  if (f.fixed && (S.db.furn(f.cfg)?.rmFunc || []).includes(key)) return 'the piece is fixed in place (its RemoveFunc is not offered)';
  const label = S.db.func(key)?.zh;
  const twin = S.furnActions.furnitureFunctions(s, f).find((/** @type {any} */ e) => e.key !== key && e.spec.kind === kind && (e.spec.panel || '') === (spec?.panel || '') && S.db.func(e.key)?.zh === label);
  if (twin) return `merged into the identical button ${twin.key}`;
  // the menu keeps one button per label, kind and panel, and takes the slot before it asks whether the button shows
  const def = S.db.furn(f.cfg);
  const keys = [...(def?.funcs || []), ...(f.fixed ? [] : [...(def?.mvFunc || []), ...(def?.rmFunc || [])])];
  const shadow = keys.slice(0, keys.indexOf(key)).find((k) => k !== key && S.db.func(k)?.zh === label && (S.funcSpecs.FUNC_SPECS[k]?.kind || 'stat') === kind && (S.funcSpecs.FUNC_SPECS[k]?.panel || '') === (spec?.panel || ''));
  if (shadow != null) return `shadowed by the identical button ${shadow}, which is hidden here (the menu drops a repeated label before it checks availability)${situation ? ` (situation: ${situation})` : ''}`;
  const panel = spec?.panel ? ` panel ${spec.panel}` : '';
  return `hidden: the ${kind} kind${panel} or a system rule hides it${situation ? ` even with ${situation}` : ''}`;
}

/**
 * The obstacles a home starts with (its scene clutter: junk piles, debris, the basement rubble) taken apart, the way
 * their Dismantle does; also the 'junkpile' / 'rubble' stand-ins of an older home definition.
 * @param {Record<string, any>} S
 * @param {any} s
 */
function clearWay(S, s) {
  for (const f of S.home.homeFurniture(s)) if (f.data?.clutter || f.cfg === 'junkpile' || f.cfg === 'rubble') S.home.dismantle(s, f.uid);
}

/**
 * Set up what the function is for. Returns a short description of the situation, or ''.
 * @param {Record<string, any>} S
 * @param {any} s
 * @param {any} f
 * @param {number} key
 */
function prepare(S, s, f, key) {
  const spec = S.funcSpecs.FUNC_SPECS[key] || {};
  const bits = [];
  for (const [id, n] of spec.need || []) give(S, s, id, n * 2);
  if (spec.need) bits.push('needs in the backpack');
  const kind = spec.kind;
  const op = spec.op;
  const home = () => unlockHome(S, s);
  switch (kind) {
    case 'sleep':
      s.clock.t = S.time.dayStartT(s.clock, Math.max(2, S.time.dayNumber(s.clock) + 1)) - 1 * HOUR;
      s.player.stats.sta = 40;
      bits.push('night, tired');
      break;
    case 'iceBath':
      Object.assign(s.player.stats, { sat: 35, sta: 35 });
      bits.push('satiety and stamina at 35');
      break;
    case 'repair':
      f.hp = Math.max(1, Math.floor((f.maxHp || 100) / 3));
      if (spec.advanced) s.loop.ngPlus = true;
      bits.push(`damaged to ${f.hp} hp${spec.advanced ? ', New Game+' : ''}`);
      break;
    case 'reinforce':
      f.reinforce = 0;
      if (spec.advanced) s.loop.ngPlus = true;
      if (spec.advanced) bits.push('New Game+');
      break;
    case 'throwBait': {
      const n = S.horde.nextHorde(s);
      if (n && n.at - s.clock.t < 8 * HOUR) s.clock.t = n.at + 12 * HOUR;
      bits.push('no horde due');
      break;
    }
    case 'recycle':
      // storage furniture recycles the junk it holds
      if (f.inv && s.inventories[f.inv]) for (const id of [20105, 2911, 24118]) S.inventory.addItem(s, s.inventories[f.inv], id, { allowOverweight: true });
      if (f.inv) bits.push('junk in its storage');
      break;
    case 'disinfect':
      give(S, s, 2164, 1);
      if (f.inv && s.inventories[f.inv]) s.inventories[f.inv].moldy = true;
      bits.push('a moldy container, spray in the backpack');
      break;
    case 'repairPower':
      S.power.damageCircuit(s, 'coverage');
      give(S, s, 20104, 1);
      bits.push('damaged wiring');
      break;
    case 'fireplace':
      give(S, s, 8001, 1);
      bits.push('fuel in the backpack');
      break;
    case 'manualGen':
      placeAtHome(S, s, 45000);
      bits.push('a battery at home');
      break;
    case 'unlockArea': {
      const area = spec.area;
      s.home.unlocked[area] = false;
      if (spec.repairs) s.home.repairsNeeded = { ...(s.home.repairsNeeded || {}), [area]: 1 };
      bits.push(`${area} still locked`);
      break;
    }
    case 'studyWorkbench':
    case 'repairWorkbench':
      f.broken = true;
      if (kind === 'studyWorkbench') s.clock.t = Math.max(s.clock.t, S.time.dayStartT(s.clock, 7) + 10 * HOUR);
      bits.push('a broken workbench');
      break;
    case 'commit': {
      // Day 72: the route's Day-71 check has passed (what updateRouteAvailability latches), a kit in the backpack
      const day = 72;
      s.clock.t = S.time.dayStartT(s.clock, day) + 10 * HOUR;
      s.run.day = day;
      s.story.checks = { ...(s.story.checks || {}), [spec.route]: 71 };
      if (spec.route === 'truth') {
        s.story.tags.TAG_LINE_TRUTH_EXPLORED = true;
        if (!S.story.installedRecorder(s)) placeAtHome(S, s, S.story.RECORDER_FURN);
      }
      if (spec.route === 'evacuate' && !S.story.installedBeacon(s)) placeAtHome(S, s, S.story.BEACON_FURN);
      if (spec.route === 'girl' || spec.route === 'companion') {
        S.social.addNeighborAffinity(s, 600);
        s.story.tags[`TAG_${S.story.neighborInfo(s).line}_RESCUE2_COMPLETE`] = true;
      }
      if (spec.route === 'fortress') {
        for (const o of S.home.doorAndWindows(s)) {
          o.reinforce = 1500;
          o.hp = S.home.effectiveMaxHp(o);
        }
        for (const dev of Object.values(S.story.DEFENSE_FURN)) for (let i = 0; i < 4; i++) placeAtHome(S, s, dev);
        s.story.powerChecks = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [60 + i, 1]));
      }
      S.story.updateRouteAvailability(s);
      give(S, s, 9048, 1);
      bits.push(`Day ${day}, the ${spec.route} route's prerequisites met, Military Repair Kit in the backpack`);
      break;
    }
    case 'story':
      if (spec.story === 'makeMark') for (const id of MARK) give(S, s, id);
      if (spec.story === 'installMark') give(S, s, S.story.MARKER_ITEM);
      if (spec.story === 'checkBeacon') placeAtHome(S, s, S.story.BEACON_FURN);
      home();
      bits.push(`story step ${spec.story}`);
      break;
    case 'bribe':
      S.horde.startThugs(s);
      give(S, s, 2107, 10);
      bits.push('thugs at the door');
      break;
    case 'hotpotEat': {
      const C = S.cooking;
      give(S, s, 2530, 2);
      const bp = s.inventories[s.player.backpack];
      for (const inst of bp.items.filter((/** @type {any} */ i) => i.id === 2530)) C.addIngredient(s, f.uid, bp.id, inst.uid);
      C.startHotPot(s, f.uid);
      C.tickCooking(s, 2 * HOUR);
      s.player.stats.sat = 30;
      bits.push('a cooked hot pot');
      break;
    }
    case 'drone':
      S.social.syncDrones(s);
      if (op === 'loot') S.home.dropNewItem(s, 20001, '1F', 7, S.home.homeFloors(s.home.id)['1F'].innerH + 1);
      if (op === 'coords') S.social.social(s).coords.push({ id: 'coverage', label: { en: 'test', zh: 'test' }, loot: [[20001, 1]] });
      bits.push(`drone ${op}`);
      break;
    case 'farm': {
      home();
      if (!S.farming.plantResearched(s)) s.farm.researched = true;
      if (['pest', 'weed', 'water', 'harvest', 'clear', 'fertilize', 'remove'].includes(op) && S.farming.isPlanter(f)) {
        if (f.data.decorPlant) f.data.decorPlant = false;
        give(S, s, SPROUT);
        S.farming.queuePlanting(s, f.uid, SPROUT, { count: 1 });
        runUntilIdle(S, s, 4 * HOUR);
        const c = f.data.crops?.[0];
        if (c) {
          if (op === 'pest') c.pest = true;
          if (op === 'weed') c.weed = true;
          if (op === 'water') Object.assign(c, { water: 0, dry: true });
          if (op === 'harvest') c.growth = 0.999;
          if (op === 'clear') Object.assign(c, { withered: true, ready: false });
          if (op === 'fertilize') give(S, s, 15501);
          if (op === 'harvest') S.tick.tick(s, HOUR);
        }
        bits.push(`a crop for ${op}`);
      }
      if (op === 'till' && S.farming.isPlanter(f)) f.data.decorPlant = false;
      if (op === 'warm') bits.push('a heater');
      break;
    }
    case 'vase':
      f.data.flower = { id: 2541, at: s.clock.t, until: s.clock.t + 3 * 86400, mor: 0.3, wilted: false };
      bits.push('a flower in the vase');
      break;
    case 'record':
      give(S, s, 11014);
      S.profile.placeRecord(s, f.uid, 11014);
      bits.push('a record on the player');
      break;
    case 'basket':
      home();
      clearWay(S, s);
      if (op === 'rope') {
        S.social.repairBasket(s);
        S.social.neighborState(s).ropeHp = 1;
      }
      bits.push(`basket ${op}`);
      break;
    case 'clearObstacle':
    case 'goExplore':
    case 'goOut':
      home();
      break;
    case 'open': {
      clearWay(S, s);
      const So = S.social;
      if (spec.panel === 'droneHelp' || spec.panel === 'droneDeliver') {
        So.syncDrones(s);
        const sv = So.social(s).survivors.find((/** @type {any} */ x) => x.alive);
        if (sv) So.requestHelp(s, sv.id);
        if (spec.panel === 'droneDeliver' && sv) {
          const inv = S.inventory.createInventory(s, { kind: 'furniture', w: 20, h: 20 });
          const give = Array.from({ length: 8 }, () => ({ inv: inv.id, uid: S.inventory.addItem(s, inv, 2107, { allowOverweight: true }).uid }));
          So.respondHelp(s, { survivor: sv.id, give });
          S.tick.tick(s, 3 * HOUR);
          keepAlive(s);
        }
        bits.push(sv ? `${sv.id} asked for help` : 'nobody on the survivor roster');
      }
      if (spec.panel === 'droneRescue') {
        So.syncDrones(s);
        give(S, s, NOTE);
        S.tick.tick(s, HOUR);
        bits.push('the truck note at home');
      }
      break;
    }
    default:
      break;
  }
  if (spec.needPower || S.db.furn(f.cfg)?.elec === S.db.ELEC.CONSUMER) S.tick.tick(s, 60);
  return bits.join(', ');
}
