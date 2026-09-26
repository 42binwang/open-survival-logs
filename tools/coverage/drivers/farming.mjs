// @ts-check
// Plants (Config_Plant), from seed to harvest under their config conditions: a large flowerpot (room for every seed
// size) in the College Student's sunroom — daylight through glass at room temperature, so light-hungry crops get sun
// and cold-sensitive ones stay warm. Sow through the action queue, tend pests, weeds and drought when they appear,
// grow to ripe, harvest; then from the same crop a Perfect harvest (RNG seeds until the ripening roll comes up
// Perfect) and a crop left to wither (its remains). Seed returns roll at harvest and are recorded when they come.
import { HOUR, give, keepAlive, keepSafe, loadSim, postGame, runUntilIdle, unlockHome } from '../sim.mjs';
import { Recorder } from '../observe.mjs';
import { CAT, gameConfig } from '../data.mjs';

const POT = 60002; // Large Flowerpot, capacity 4
const SPOT = '2F:g1'; // duplex sunroom, a large slot under glass
const SEED_TRIES = 40;

/**
 * The items that sow a plant (Config_Item.Plant), seed packets first: the driver sows the first.
 * @param {import('../data.mjs').Config} cfg
 * @param {number} pid
 * @returns {number[]}
 */
export function seedsFor(cfg, pid) {
  return Object.values(cfg.items)
    .filter((it) => it.plant === pid)
    .sort((a, b) => Number(b.cat === CAT.SEED) - Number(a.cat === CAT.SEED) || a.id - b.id)
    .map((it) => it.id);
}

/** @param {{ plants: number[] }} args */
export async function run({ plants }) {
  const S = await loadSim();
  const F = S.farming;
  const rec = new Recorder();
  const base = postGame(S, { seed: 61, character: 'student' });
  unlockHome(S, base);
  const old = S.home.furnitureAt(base, SPOT);
  if (old) S.home.removeFurniture(base, old.uid);
  const placed = S.home.installFurniture(base, POT, SPOT);
  if (!placed.ok) {
    rec.warn(`farming: the large flowerpot does not install at ${SPOT} (${placed.reason})`);
    return rec.obs;
  }
  const potUid = placed.f.uid;
  const cfg = gameConfig();

  for (const pid of plants) {
    const p = S.db.plant(pid);
    const res = { seed: /** @type {number | null} */ (null), planted: false, ripe: false, hours: 0, harvest: /** @type {number[]} */ ([]), perfect: /** @type {number[] | null} */ (null), wither: /** @type {number[] | null} */ (null), seeds: false, problems: /** @type {string[]} */ ([]) };
    rec.result('plants', pid, res);
    if (!p) {
      res.problems.push('not in Config_Plant');
      continue;
    }
    const seedId = seedsFor(cfg, pid)[0];
    if (!seedId) {
      res.problems.push('no Config_Item has it as its Plant (no seed)');
      continue;
    }
    res.seed = seedId;
    const s = structuredClone(base);
    const pot = () => s.furniture[potUid];
    give(S, s, seedId);
    const sown = rec.watch(s, `plant:${pid}`, () => {
      S.farming.queuePlanting(s, potUid, seedId, { count: 1 });
      return runUntilIdle(S, s, 4 * HOUR);
    });
    const crop = () => pot().data.crops.find((/** @type {any} */ c) => c.plantId === pid);
    if (!crop()) {
      res.problems.push(`sowing failed (${F.canQueuePlanting(s, potUid, seedId)})`);
      continue;
    }
    res.planted = true;
    if (!sown.down.includes(seedId)) res.problems.push('sowing did not use up the seed');
    // grow, tending anomalies the way the E smart action does
    const limit = Math.ceil((p.grow / HOUR) * 6) + 48;
    /** @param {any} run @param {(c: any) => boolean} until @param {number} max */
    const grow = (run, until, max) => {
      let h = 0;
      for (; h < max; h++) {
        const c = run.furniture[potUid].data.crops.find((/** @type {any} */ x) => x.plantId === pid);
        if (!c || until(c)) break;
        if (run.phase !== 'post') return h;
        for (let half = 0; half < 2; half++) {
          keepSafe(S, run);
          S.tick.tick(run, HOUR / 2);
        }
        keepAlive(run);
        const op = F.farmSmartOp(run, potUid);
        if (op === 'pest' || op === 'weed' || op === 'water') {
          F.queueFarm(run, potUid, op);
          runUntilIdle(S, run, 2 * HOUR);
        }
      }
      return h;
    };
    res.hours = grow(s, (c) => c.growth >= 0.9 || c.ready || c.withered, limit);
    const c0 = crop();
    if (!c0 || c0.withered) {
      res.problems.push(`withered while growing (${c0?.witherCause ?? 'gone'})`);
      continue;
    }
    if (c0.growth < 0.9 && !c0.ready) {
      res.problems.push(`only ${Math.round(c0.growth * 100)}% grown after ${res.hours} h (config ${Math.round(p.grow / HOUR)} h)`);
      continue;
    }
    /** @param {any} run */
    const harvest = (run) =>
      rec.watch(run, `harvest:${pid}`, () => {
        F.queueFarm(run, potUid, 'harvest');
        runUntilIdle(S, run, 2 * HOUR);
      }).up;
    const nearly = structuredClone(s);
    // a plain harvest (and the seed return, which rolls at harvest time)
    for (let k = 1; k <= SEED_TRIES && (!res.ripe || (!res.seeds && p.seed?.length)); k++) {
      const run = structuredClone(nearly);
      run.rng = S.rng.seedRng(k);
      res.hours = Math.max(res.hours, grow(run, (c) => c.ready || c.withered, limit));
      const c = run.furniture[potUid].data.crops.find((/** @type {any} */ x) => x.plantId === pid);
      if (!c?.ready || c.perfect) continue;
      const got = harvest(run);
      res.ripe = true;
      if (!res.harvest.length) res.harvest = got;
      if (p.seed?.some((/** @type {number} */ id) => got.includes(id))) res.seeds = true;
    }
    if (!res.ripe) res.problems.push('never ripened');
    // a Perfect harvest
    if (p.pGain?.length) {
      for (let k = 1; k <= SEED_TRIES && !res.perfect; k++) {
        const run = structuredClone(nearly);
        run.rng = S.rng.seedRng(1000 + k);
        grow(run, (c) => c.ready || c.withered, limit);
        const c = run.furniture[potUid].data.crops.find((/** @type {any} */ x) => x.plantId === pid);
        if (c?.ready && c.perfect) res.perfect = harvest(run);
      }
      if (!res.perfect) res.problems.push('Perfect: never rolled');
    }
    // left on the plant past its harvest window: it withers into remains
    if (p.wither?.length) {
      const run = structuredClone(nearly);
      grow(run, (c) => c.withered, limit + Math.ceil(((p.window || 0) + (p.decay || 0)) / HOUR) + 48);
      const c = run.furniture[potUid].data.crops.find((/** @type {any} */ x) => x.plantId === pid);
      if (c?.withered) {
        res.wither = rec.watch(run, `wither:${pid}`, () => {
          F.queueFarm(run, potUid, 'clear');
          runUntilIdle(S, run, 2 * HOUR);
        }).up;
      } else res.problems.push('never withered');
    }
  }
  return rec.obs;
}
