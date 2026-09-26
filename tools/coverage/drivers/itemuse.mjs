// @ts-check
// Item uses, as the config describes each item (tools/coverage/families/items.mjs derives the list): every direct use
// runs through the sim the way the player would do it — the item menu's Eat / Use / Read / Open / Cut through the
// action queue, ingredients into a stove pot, fuel into a stove, generator or heater, a package installed from the
// backpack, a seed sown, fertilizer on a growing crop, a trap set, a flower in a vase, a Molotov thrown at a horde.
// What the uses hand out (pack contents, cut pieces, empty cans) is recorded as produced.
import { HOUR, give, keepAlive, keepSafe, loadSim, placeAtHome, postGame, runUntilIdle, unlockHome } from '../sim.mjs';
import { Recorder } from '../observe.mjs';
import { USED_UP, expectedUses, namingFuncs } from '../uses.mjs';
import { furnitureScopeOf, offeredFuncs, gameConfig } from '../data.mjs';

const CFG = gameConfig();
const OFFERED = offeredFuncs(CFG);
/** @type {WeakMap<import('../data.mjs').Config, Map<number, number[]>>} */
const offeredOf = new WeakMap([[CFG, OFFERED]]);

const STOVE = 801; // the Wage Slave's fuel stove
const POT = 60002; // a large flowerpot on the terrace
const POT_SLOT = '2F:p1';
const GENERATOR = 42000; // small fuel generator
const HEATER = 65001; // the fuel-burning heater
const VASE = 67000;
const BARREL = 66001; // brewing barrel
const GROWING = 15007; // White Beech Mushroom seeds: something growing to fertilize
const PACK_SEEDS = 30;
const DISINFECT = 2006;

/** Uses this driver runs itself; the others (uses.mjs USED_UP) show when any driver's sim action uses the item up. */
export const DIRECT_USES = new Set(['open', 'eat', 'use', 'read', 'cut', 'cook', 'fuel', 'install', 'seed', 'fertilize', 'trap', 'brew', 'vase', 'throw', 'place', 'disinfect', 'trade']);

/**
 * Why this driver could never show the item used this way, whatever the game does, or null: it has no probe for the
 * use, or the config leaves the probe nothing to run it on.
 * @param {import('../data.mjs').Config} cfg
 * @param {Record<string, any>} it  a Config_Item row
 * @param {string} use
 * @returns {string | null}
 */
export function unprobeable(cfg, it, use) {
  if (USED_UP.has(use)) return null;
  if (!DIRECT_USES.has(use)) return `no probe for the use '${use}'`;
  const scope = furnitureScopeOf(cfg);
  const inScope = (/** @type {number} */ p) => scope.get(p)?.excluded === null;
  if (use === 'place') {
    const offered = offeredOf.get(cfg) || offeredFuncs(cfg);
    offeredOf.set(cfg, offered);
    return namingFuncs(it, cfg.funcs).some((k) => (offered.get(k) || []).some(inScope)) ? null : 'no furniture piece in scope offers a function that names it';
  }
  if (use === 'install') return cfg.furniture[it.furn] ? null : `its TargetFurnitureID ${it.furn} is not in Config_Furniture`;
  if (use === 'disinfect') return Object.values(cfg.furniture).some((f) => inScope(f.id) && f.bag > 0 && (f.funcs || []).includes(DISINFECT)) ? null : 'no storage piece in scope offers Disinfect';
  return null;
}

/** @param {{ items: number[] }} args */
export async function run({ items }) {
  const S = await loadSim();
  const db = S.db;
  const rec = new Recorder();

  // one prepared post-disaster home with everything the uses need
  const base = postGame(S, { seed: 101, character: 'wage' });
  unlockHome(S, base);
  const junk = S.home.furnitureAt(base, POT_SLOT);
  if (junk) S.home.removeFurniture(base, junk.uid);
  const pot = S.home.installFurniture(base, POT, POT_SLOT).f;
  if (!S.farming.plantResearched(base)) S.farming.queueFarm(base, pot.uid, 'research');
  S.farming.queueFarm(base, pot.uid, 'till');
  runUntilIdle(S, base, 2 * HOUR);
  const stove = S.home.homeFurniture(base).find((/** @type {any} */ f) => f.cfg === STOVE);
  const gen = placeAtHome(S, base, GENERATOR);
  const heater = placeAtHome(S, base, HEATER);
  const vase = placeAtHome(S, base, VASE);
  const barrel = placeAtHome(S, base, BARREL);
  for (const [name, f] of Object.entries({ stove, pot, gen, heater, vase, barrel })) if (!f) rec.warn(`itemuse: the ${name} is missing from the prepared home`);
  keepAlive(base);

  // keys: an item a home's lock names opens that area once it is at home (story.js polls the locks)
  for (const [homeId, home] of Object.entries(/** @type {Record<string, any>} */ (S.homes.HOMES))) {
    const character = Object.entries(S.characters.CHARACTERS).find(([, c]) => /** @type {any} */ (c).home === homeId)?.[0];
    for (const [area, lock] of Object.entries(/** @type {Record<string, any>} */ (home.locks || {}))) {
      if (!lock.item || !character || !items.includes(lock.item)) continue;
      const s = postGame(S, { seed: 102, character });
      give(S, s, lock.item);
      /** @type {string[]} */
      const opened = [];
      const off = S.bus.on('areaUnlocked', (/** @type {any} */ p) => opened.push(p.area));
      S.tick.tick(s, 2 * HOUR);
      off();
      if (opened.includes(area)) rec.used(lock.item, `lock:${homeId}/${area}`);
      else rec.warn(`itemuse: ${lock.item} at home did not open the ${homeId} ${area}`);
    }
  }
  const uses = expectedUses(db.items);
  for (const id of items) {
    const cfg = db.item(id);
    const want = uses[id] || [];
    /** @type {Record<string, { ok: boolean, why?: string }>} */
    const res = {};
    rec.result('itemuse', id, res);
    for (const use of want) {
      if (USED_UP.has(use)) continue; // shown by other drivers using the item up
      const never = unprobeable(CFG, cfg, use);
      if (never) {
        res[use] = { ok: false, why: never };
        continue;
      }
      const s = structuredClone(base);
      s.player.stats.sat = 30;
      try {
        res[use] = tryUse(S, rec, s, cfg, use, { stove: stove?.uid, pot: pot?.uid, gen: gen?.uid, heater: heater?.uid, vase: vase?.uid, barrel: barrel?.uid });
      } catch (err) {
        res[use] = { ok: false, why: `crashed: ${/** @type {Error} */ (err).message}` };
      }
    }
  }
  return rec.obs;
}

/**
 * @param {Record<string, any>} S
 * @param {Recorder} rec
 * @param {any} s
 * @param {any} cfg
 * @param {string} use
 * @param {Record<string, number>} at  prepared furniture uids
 * @returns {{ ok: boolean, why?: string }}
 */
function tryUse(S, rec, s, cfg, use, at) {
  const U = S.itemuse;
  let bp = s.inventories[s.player.backpack];
  let inst = give(S, s, cfg.id)[0];
  if (!inst) {
    // bigger than the backpack grid: used from a storage crate at home, as from a fridge or a shelf
    bp = S.inventory.createInventory(s, { kind: 'furniture', w: 20, h: 20, label: 'coverage crate' });
    inst = S.inventory.addItem(s, bp, cfg.id, { allowOverweight: true });
  }
  const src = `use:${use}:${cfg.id}`;
  /** @param {string} op */
  const viaMenu = (op) => {
    const ops = U.itemOps(s, inst).map((/** @type {any} */ o) => o.op);
    if (!ops.includes(op)) return { ok: false, why: `the item menu offers ${ops.join(', ') || 'nothing'}, not ${op}` };
    const why = U.canUseNow(s, inst);
    if (why !== true) return { ok: false, why: String(why) };
    const done = [];
    const off = S.bus.on('actionDone', (/** @type {any} */ a) => a.kind === 'useItem' && a.uid === inst.uid && done.push(a));
    const before = { uses: inst.uses, left: inst.left ?? 1, qty: inst.qty || 1 };
    const w = rec.watch(s, src, () => {
      S.actions.enqueue(s, U.useItemAction(s, bp.id, inst.uid, op));
      runUntilIdle(S, s, 4 * HOUR);
    });
    off();
    if (!done.length) return { ok: false, why: `the ${op} action never completed` };
    const still = S.inventory.findUid(bp, inst.uid);
    // reusable items (UseTimes -1: dumbbells, novels) and daily sundries stay; everything else is used up in part
    const changed = !still || w.down.includes(cfg.id) || (still.left ?? 1) < before.left || still.uses !== before.uses || (still.qty || 1) < before.qty || cfg.uses === -1 || op === 'use' || op === 'read';
    return changed ? { ok: true } : { ok: false, why: `${op} left the item untouched` };
  };
  switch (use) {
    case 'open': {
      // what a pack holds is partly random: more packs over RNG seeds show the whole pool
      const first = structuredClone(s);
      const r = viaMenu(use);
      if (r.ok) {
        for (let k = 1; k <= PACK_SEEDS; k++) {
          const t = structuredClone(first);
          t.rng = S.rng.seedRng(k);
          const tb = t.inventories[bp.id];
          rec.watch(t, src, () => {
            S.actions.enqueue(t, U.useItemAction(t, tb.id, inst.uid, 'open'));
            runUntilIdle(S, t, HOUR);
          });
        }
      }
      return r;
    }
    case 'eat':
    case 'use':
    case 'read':
    case 'cut':
      return viaMenu(use);
    case 'cook': {
      const r = S.cooking.addIngredient(s, at.stove, bp.id, inst.uid);
      return r.ok ? { ok: true } : { ok: false, why: r.reason };
    }
    case 'fuel': {
      const r = S.cooking.addFuel(s, at.stove, bp.id, inst.uid);
      if (r.ok) return { ok: true };
      for (const uid of [at.gen, at.heater]) {
        if (uid == null) continue;
        const f = s.furniture[uid];
        const inv = S.power.fuelInventory(s, f);
        const it = S.inventory.findUid(bp, inst.uid);
        if (!it || !S.inventory.moveItem(s, bp, it.uid, inv, null, null, { allowOverweight: true }).ok) continue;
        S.power.tidyFuel(s, uid);
        if (S.inventory.findUid(inv, inst.uid)) return { ok: true };
      }
      return { ok: false, why: `no stove, generator or heater takes it (stove: ${r.reason})` };
    }
    case 'install': {
      const furnCfg = S.db.packageToFurniture[cfg.id];
      if (!furnCfg || !S.db.furn(furnCfg)) return { ok: false, why: `its TargetFurnitureID ${cfg.furn} is not in Config_Furniture` };
      s.progress.prof.defense.lv = 5;
      let slot = S.planning.slotsFor(s, furnCfg)[0];
      let replace = false;
      if (!slot) {
        const targets = S.planning.replaceTargets(s, furnCfg);
        if (targets.length) {
          slot = targets[0];
          replace = true;
        } else {
          slot = S.planning.slotsFor(s, furnCfg, { includeOccupied: true })[0];
          const old = slot && S.home.furnitureAt(s, slot.id);
          if (old) S.home.removeFurniture(s, old.uid);
        }
      }
      if (!slot) return { ok: false, why: `no slot of the ${s.home.id} takes furniture ${furnCfg} (slot type ${S.db.furn(furnCfg).slot})` };
      const w = rec.watch(s, src, () => {
        const a = replace ? S.planning.queueReplaceOpening(s, bp.id, inst.uid, slot.id) : S.planning.queueInstall(s, bp.id, inst.uid, slot.id);
        if (!a) return false;
        return runUntilIdle(S, s, 12 * HOUR);
      });
      if (!w.value) return { ok: false, why: 'the install action was refused' };
      const f = S.home.furnitureAt(s, slot.id);
      if (f?.cfg !== furnCfg) return { ok: false, why: `nothing installed at ${slot.id}` };
      rec.furnished(furnCfg, `install:${cfg.id}`);
      return { ok: true };
    }
    case 'seed': {
      const w = rec.watch(s, src, () => {
        S.farming.queuePlanting(s, at.pot, cfg.id, { count: 1 });
        return runUntilIdle(S, s, 4 * HOUR);
      });
      const crops = s.furniture[at.pot].data.crops;
      return crops.some((/** @type {any} */ c) => c.seedId === cfg.id) && w.down.includes(cfg.id) ? { ok: true } : { ok: false, why: `sowing failed (${S.farming.canQueuePlanting(s, at.pot, cfg.id)})` };
    }
    case 'fertilize': {
      give(S, s, GROWING);
      S.farming.queuePlanting(s, at.pot, GROWING, { count: 1 });
      runUntilIdle(S, s, 4 * HOUR);
      rec.watch(s, src, () => {
        S.farming.queueFarm(s, at.pot, 'fertilize', { fertId: cfg.id });
        return runUntilIdle(S, s, 2 * HOUR);
      });
      const crop = s.furniture[at.pot].data.crops[0];
      return crop?.fertilizer === cfg.id ? { ok: true } : { ok: false, why: `fertilizing failed (${S.farming.validateFarmOp(s, at.pot, 'fertilize', { fertId: cfg.id })})` };
    }
    case 'trap': {
      const slot = S.traps.trapSlots(s).find((/** @type {any} */ x) => !s.home.slots[x.id] && S.traps.trapFits(s, cfg.id, x));
      if (!slot) return { ok: false, why: 'no free trap slot of the home fits it' };
      rec.watch(s, src, () => {
        S.traps.queuePlaceTrap(s, inst.uid, slot.id);
        return runUntilIdle(S, s, 2 * HOUR);
      });
      return S.home.furnitureAt(s, slot.id)?.data?.trapItem === cfg.id ? { ok: true } : { ok: false, why: 'the trap was not set' };
    }
    case 'brew': {
      const f = s.furniture[at.barrel];
      const inv = s.inventories[f.inv];
      if (!S.inventory.moveItem(s, bp, inst.uid, inv, null, null, { allowOverweight: true }).ok) return { ok: false, why: 'does not fit the barrel' };
      S.cooking.tidyBarrel(s, f.uid);
      return S.inventory.findUid(inv, inst.uid) ? { ok: true } : { ok: false, why: 'the brewing barrel hands it back' };
    }
    case 'vase': {
      rec.watch(s, src, () => {
        S.farming.queueVase(s, at.vase, cfg.id);
        return runUntilIdle(S, s, 2 * HOUR);
      });
      return s.furniture[at.vase].data.flower?.id === cfg.id ? { ok: true } : { ok: false, why: `arranging failed (${S.farming.validateVase(s, at.vase, cfg.id)})` };
    }
    case 'throw': {
      S.horde.summonHorde(s, { size: 6, hours: 4, label: 'coverage' });
      for (let t = 0; t < 6 * HOUR && !S.horde.underAttack(s); t += 600) {
        keepSafe(S, s);
        S.tick.tick(s, 600);
      }
      if (!S.horde.underAttack(s)) return { ok: false, why: 'the summoned horde never reached the house' };
      const w = rec.watch(s, src, () => {
        const a = S.horde.queueMolotov(s, cfg.id);
        if (!a) return false;
        return runUntilIdle(S, s, HOUR);
      });
      return w.down.includes(cfg.id) ? { ok: true } : { ok: false, why: 'the Molotov was not thrown' };
    }
    case 'place': {
      // the furniture function that names the item, on a piece offering it, installed at home
      /** @type {string[]} */
      const whys = [];
      const scope = furnitureScopeOf(CFG);
      for (const key of namingFuncs(cfg)) {
        for (const furn of (OFFERED.get(key) || []).filter((p) => scope.get(p)?.excluded === null)) {
          const t = structuredClone(s);
          const f = S.home.homeFurniture(t).find((/** @type {any} */ x) => x.cfg === furn) || placeAtHome(S, t, furn);
          if (!f) {
            whys.push(`${furn} does not install`);
            continue;
          }
          const r = runFunc(S, rec, t, f, key, src);
          if (r.ok && r.down.includes(cfg.id)) return { ok: true };
          // a function that opens the record panel: the panel's own operation places the disc (src/meta/profile.js)
          if (r.ok && r.panel === 'records') {
            const w = rec.watch(t, src, () => S.profile.placeRecord(t, f.uid, cfg.id));
            if (w.value && w.down.includes(cfg.id)) return { ok: true };
          }
          whys.push(`${key} on ${furn}: ${r.ok ? `ran${r.panel ? ` (opened the ${r.panel} panel)` : ''} but did not take the item` : r.why}`);
        }
      }
      return { ok: false, why: whys[0] || 'no furniture offers the function that names it' };
    }
    case 'disinfect': {
      const box = S.home.homeFurniture(s).find((/** @type {any} */ f) => f.inv && s.inventories[f.inv] && (S.db.furn(f.cfg)?.funcs || []).includes(DISINFECT));
      if (!box) return { ok: false, why: 'no storage at home offers Disinfect' };
      s.inventories[box.inv].moldy = true;
      const before = { uses: inst.uses, left: inst.left };
      const r = runFunc(S, rec, s, box, DISINFECT, src);
      const left = S.inventory.findUid(bp, inst.uid);
      const took = !left || left.uses !== before.uses || left.left !== before.left || r.down.includes(cfg.id);
      return r.ok && took ? { ok: true } : { ok: false, why: r.ok ? 'Disinfect ran but used another spray' : r.why };
    }
    case 'trade': {
      const posts = /** @type {any[]} */ (S.people.TRADING_POSTS).map((p) => p.id);
      const paying = posts.filter((id) => (S.social.sellValue(s, id, inst) || 0) > 0);
      return paying.length ? { ok: true } : { ok: false, why: `no trading post pays for it (${posts.join(', ')})` };
    }
    default:
      return { ok: false, why: `no probe for the use '${use}'` };
  }
}

/**
 * Run a furniture function from the furniture menu until it completes.
 * @param {Record<string, any>} S @param {Recorder} rec @param {any} s @param {any} f @param {number} key @param {string} src
 * @returns {{ ok: boolean, why?: string, down: number[], panel?: string }}
 */
function runFunc(S, rec, s, f, key, src) {
  keepAlive(s);
  const FA = S.furnActions;
  const entry = FA.furnitureFunctions(s, f).find((/** @type {any} */ e) => e.key === key);
  if (!entry) return { ok: false, why: `the furniture menu does not list ${key}`, down: [] };
  if (!entry.enabled) return { ok: false, why: `${key} is offered but disabled: ${entry.reason}`, down: [] };
  /** @type {any[]} */
  const done = [];
  const off = S.bus.on('actionDone', (/** @type {any} */ a) => a.funcKey === key && done.push(a));
  /** @type {string[]} */
  const panels = [];
  const offPanel = S.bus.on('openPanel', (/** @type {any} */ p) => panels.push(p.panel));
  try {
    const w = rec.watch(s, src, () => {
      if (!FA.startFurnitureFunction(s, f.uid, key)) return false;
      runUntilIdle(S, s, 2 * HOUR);
      return true;
    });
    if (!w.value) return { ok: false, why: `startFurnitureFunction refused ${key}`, down: [] };
    return done.length ? { ok: true, down: w.down, panel: panels[0] } : { ok: false, why: `the ${key} action never completed`, down: w.down };
  } finally {
    off();
    offPanel();
  }
}
