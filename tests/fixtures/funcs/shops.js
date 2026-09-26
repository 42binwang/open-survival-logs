// @ts-check
// Furniture functions in the pre-disaster shops: the survivor in a shop (money in the wallet, an SUV bought so the
// trunk exists), each fixture used the way the player does (interactFixture: walk up, interact) on its own copy of
// the visit until its actions complete. The record names the functions the completed actions carried (funcKey).
import { tick } from '../../../src/sim/tick.js';
import { isIdle } from '../../../src/sim/actions.js';
import * as P from '../../../src/sim/predisaster.js';
import { SHOPS } from '../../../src/content/shops.js';
import { on } from '../../../src/engine/bus.js';
import { run, countItems, keepAlive, HOUR } from './harness.js';

/** @param {any} s @param {number} max */
function runUntilIdle(s, max) {
  for (let t = 0; t < max && !isIdle(s); t += 60) tick(s, 60);
}

/** The survivor at a shop before the outbreak, with money and an SUV. @param {string} shopId @param {string} [character] */
export function atShop(shopId, character = 'wage') {
  const s = run(character, 'pre', 11);
  s.player.money = 1e7;
  P.arriveAt(s, 'carlot');
  P.buyCar(s, 'suv');
  P.arriveAt(s, shopId);
  return s;
}

/**
 * Every fixture of the shop with a config piece, used on a copy of the visit.
 * @param {any} s @param {string} shopId
 * @returns {{ cfg: number, fixture: string, kind: string, funcs: number[], done: boolean, up: number[], panels: string[], stats: any[] }[]}
 */
export function useEveryFixture(s, shopId) {
  const out = [];
  for (const f of /** @type {Record<string, any>} */ (SHOPS)[shopId].fixtures) {
    if (typeof f.cfg !== 'number') continue;
    const t = structuredClone(s);
    keepAlive(t);
    /** @type {number[]} */
    const funcs = [];
    /** @type {string[]} */
    const panels = [];
    /** @type {any[]} */
    const stats = [];
    let done = false;
    const before = countItems(t);
    const offs = [
      on('actionDone', (/** @type {any} */ a) => {
        if (a?.fixture !== f.id) return;
        done = true;
        if (typeof a.funcKey === 'number') funcs.push(a.funcKey);
      }),
      on('openPanel', (/** @type {any} */ p) => panels.push(p.panel)),
      on('stat', (/** @type {any} */ e) => stats.push(e)),
    ];
    try {
      if (P.interactFixture(t, f.id)) runUntilIdle(t, 2 * HOUR);
    } finally {
      for (const off of offs) off();
    }
    const after = countItems(t);
    out.push({ cfg: f.cfg, fixture: f.id, kind: f.kind, funcs, done, up: [...after].filter(([id, n]) => n > (before.get(id) || 0)).map(([id]) => id), panels, stats });
  }
  return out;
}
