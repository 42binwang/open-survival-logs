// @ts-check
// The pre-disaster city: every shelf offer of every shop bought once (each character sees its own stock), the free
// loot and showroom try-outs, riot grabs in the final hours and the doomsday rush. Riot spots and the rush hand out
// random goods, so they run over several seeds.
import { CHARACTERS, HOUR, loadSim, preGame, runUntilIdle } from '../sim.mjs';
import { Recorder } from '../observe.mjs';
import { funcOf } from '../trace/rules.mjs';

/** @param {{ characters?: string[], seeds?: number }} args */
export async function run({ characters = CHARACTERS, seeds = 8 }) {
  const S = await loadSim();
  const P = S.predisaster;
  const rec = new Recorder();
  for (const character of characters) {
    const s = preGame(S, { seed: 11, character });
    s.player.money = 1e7;
    P.arriveAt(s, 'carlot');
    const car = P.buyCar(s, 'suv');
    if (!car.ok) rec.warn(`shops: could not buy the SUV (${car.reason})`);
    const trunk = () => s.inventories[s.pre.trunk];
    for (const [shopId, shop] of Object.entries(S.shops.SHOPS)) {
      P.arriveAt(s, shopId);
      // each fixture used as the player does (walk up, interact) on its own copy of the visit
      for (const f of /** @type {any[]} */ (shop.fixtures)) if (typeof f.cfg === 'number') rec.merge('fixtures', f.cfg, { where: [`shop:${shopId}`], modes: { [`shop:${shopId}`]: useFixture(S, rec, s, shopId, f) } });
      for (const f of /** @type {any[]} */ (shop.fixtures)) {
        if (f.kind === 'shelf') {
          for (const o of P.shelfOffers(s, shopId, f.id)) {
            s.player.money = 1e7;
            const r = rec.watch(s, `shop:${shopId}/${f.id}`, () => P.buy(s, shopId, f.id, o.id, { dest: 'trunk' }));
            if (!r.value.ok) rec.warn(`shops: ${character} could not buy ${o.id} at ${shopId}/${f.id} (${r.value.reason})`);
            else if (typeof f.cfg === 'number') rec.merge('fixtures', f.cfg, { modes: { [`shop:${shopId}`]: { buy: { done: true, items: true } } } });
            trunk().items = [];
          }
        } else if (f.loot) {
          rec.watch(s, `shop:${shopId}/${f.id}`, () => P.searchLoot(s, shopId, f.id));
        }
      }
    }
    // riots in the final hours and the doomsday rush hand out random piles
    for (let seed = 1; seed <= seeds; seed++) {
      const r = preGame(S, { seed: 100 + seed, character });
      r.player.money = 1e7;
      r.clock.t = r.clock.outbreakAt - 2 * HOUR;
      S.tick.tick(r, 60);
      if (!r.pre.riot) rec.warn('shops: no riot two hours before the outbreak');
      for (const shopId of Object.keys(S.shops.RIOT_LOOT)) {
        P.arriveAt(r, shopId);
        for (const spot of P.riotSpots(r, shopId)) rec.watch(r, `riot:${shopId}`, () => P.grabRiotLoot(r, shopId, spot.id));
      }
      const q = preGame(S, { seed: 200 + seed, character });
      q.player.money = 1e7;
      P.arriveAt(q, S.shops.RUSH.shop);
      rec.watch(q, `rush:${S.shops.RUSH.shop}`, () => P.doRush(q));
    }
  }
  return rec.obs;
}

/**
 * Interact with a shop fixture: the action completes (a panel opens, loot is searched, a try-out is done); the
 * checkout also runs the doomsday rush and the black-market station sells blood. Each interaction records the
 * furniture functions its completed actions named (funcKey).
 * @param {Record<string, any>} S @param {Recorder} rec @param {any} base @param {string} shopId @param {any} f
 * @returns {Record<string, { done: boolean, items: boolean, funcs?: number[], why?: string }>}
 */
function useFixture(S, rec, base, shopId, f) {
  const P = S.predisaster;
  /** @type {Record<string, { done: boolean, items: boolean, funcs?: number[], why?: string }>} */
  const out = {};
  /** @param {string} mode @param {(t: any) => any} start */
  const attempt = (mode, start) => {
    const t = structuredClone(base);
    t.player.money = 1e7;
    /** @type {any[]} */
    const done = [];
    /** @type {string[]} */
    const said = [];
    const off = S.bus.on('actionDone', (/** @type {any} */ a) => (a?.fixture === f.id || (a?.kind === 'shop' && mode !== f.kind)) && done.push(a));
    const offToast = S.bus.on('toast', (/** @type {any} */ m) => said.push(m.text));
    try {
      const w = rec.watch(t, `shop:${shopId}/${f.id}`, () => {
        const q = start(t);
        if (q) runUntilIdle(S, t, 2 * HOUR);
        return !!q;
      });
      const funcs = [...new Set(done.map(funcOf).filter((k) => k != null))];
      out[mode] = { done: done.length > 0, items: w.up.length > 0, ...(funcs.length ? { funcs } : {}), ...(done.length ? {} : { why: said.at(-1) || (w.value ? 'queued but never completed' : 'the sim refused it') }) };
    } finally {
      off();
      offToast();
    }
  };
  attempt(f.kind, (t) => P.interactFixture(t, f.id));
  if (f.kind === 'checkout') attempt('rush', (t) => P.startRush(t));
  if (f.kind === 'blood') attempt('sellBlood', (t) => P.startSellBlood(t));
  return out;
}
