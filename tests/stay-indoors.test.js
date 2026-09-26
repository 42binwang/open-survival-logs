// @ts-check
// At home the survivor stays indoors: a click on the street or the yard does not walk them out of the front door
// (src/sim/actions.js walk), while a click on a free floor tile still walks them there.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { tick } from '../src/sim/tick.js';
import { enqueue, isIdle } from '../src/sim/actions.js';
import { homeFloors } from '../src/sim/home.js';
import { cellAt, CELL } from '../src/sim/scene.js';
import { on } from '../src/engine/bus.js';

/** @param {any} s @param {number} x @param {number} y */
const walk = (s, x, y) => enqueue(s, { kind: 'walk', label: 'Walk', target: { x, y, floor: s.player.floor }, dur: 0 }, { replace: true });

test('a click on the yard in front of the house does not take the survivor outside', () => {
  const s = /** @type {any} */ (newGame({ character: 'wage', seed: 7, difficulty: 'normal', skipPrologue: true }));
  const fl = homeFloors(s.home.id)[s.player.floor];
  /** @type {[number, number] | null} */
  let yard = null;
  for (let y = fl.h - 1; y >= 0 && !yard; y--) for (let x = 0; x < fl.w && !yard; x++) if (cellAt(fl, x, y) === CELL.YARD) yard = [x, y];
  assert.ok(yard, 'the floor has a yard');
  const toasts = /** @type {string[]} */ ([]);
  const off = on('toast', (/** @type {any} */ e) => toasts.push(e.text));
  walk(s, yard[0], yard[1]);
  for (let i = 0; i < 120; i++) tick(s, 1);
  off?.();
  assert.notEqual(cellAt(fl, s.player.x, s.player.y), CELL.YARD, 'still indoors');
  assert.ok(isIdle(s), 'the walk was refused');
  assert.ok(toasts.some((t) => /outside/i.test(t)), `told why (${toasts.join(' | ')})`);
});

test('a click on a free floor tile indoors still walks the survivor there', () => {
  const s = /** @type {any} */ (newGame({ character: 'wage', seed: 7, difficulty: 'normal', skipPrologue: true }));
  const fl = homeFloors(s.home.id)[s.player.floor];
  /** @type {[number, number][]} */
  const floorTiles = [];
  for (let y = 0; y < fl.h; y++) for (let x = 0; x < fl.w; x++) if (cellAt(fl, x, y) === CELL.FLOOR && (x !== s.player.x || y !== s.player.y)) floorTiles.push([x, y]);
  for (const [x, y] of floorTiles) {
    walk(s, x, y);
    for (let i = 0; i < 200 && !isIdle(s); i++) tick(s, 1);
    if (s.player.x === x && s.player.y === y) return;
  }
  assert.fail('the survivor walked to no free floor tile');
});
