// @ts-check
// BUG-0100: the survivor set a defense device up standing on its slot, so the device went up under their feet and,
// with the slots around it taken, walled them into the yard. They now stand on a yard tile next to the slot, as for
// any other install, and walk back into the house afterwards.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { tick } from '../src/sim/tick.js';
import '../src/sim/furnActions.js';
import { queueInstallDefense } from '../src/sim/horde.js';
import { furnitureAt, slotDef, blockedCells, homeDef } from '../src/sim/home.js';
import { addItem } from '../src/sim/inventory.js';
import { cellKey, findPath } from '../src/sim/scene.js';
import { sceneFloor } from '../src/sim/scenes.js';

const SPIKES = 26002;

test('a defense device goes up next to the survivor, never under their feet; they can walk back in', () => {
  const s = /** @type {any} */ (newGame({ seed: 100 }));
  s.phase = 'post';
  const bp = s.inventories[s.player.backpack];
  // the three slots around the yard tile in front of the door: below it, then either side
  for (const slot of ['1F:d3', '1F:d1', '1F:d2']) {
    addItem(s, bp, SPIKES);
    assert.ok(queueInstallDefense(s, slot, SPIKES), `queued ${slot}`);
    for (let i = 0; i < 12 && !furnitureAt(s, slot); i++) {
      tick(s, 600);
      Object.assign(s.player.stats, { sat: 80, sta: 90, mor: 80 });
    }
    assert.equal(furnitureAt(s, slot)?.cfg, 36002, `spikes on ${slot}`);
    const at = slotDef(s, slot);
    assert.ok(!(s.player.x === at.x && s.player.y === at.y), `the survivor is not standing on ${slot}`);
    assert.ok(!blockedCells(s, '1F').has(cellKey(s.player.x, s.player.y)), 'the survivor stands on a free tile');
  }
  // and can walk back into the house
  const spawn = homeDef(s.home.id).spawn;
  assert.ok(findPath(sceneFloor(s, '1F'), s.player.x, s.player.y, spawn.x, spawn.y, blockedCells(s, '1F'), { outside: true }), 'a way back inside');
});
