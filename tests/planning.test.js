import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { tick } from '../src/sim/tick.js';
import '../src/sim/furnActions.js';
import { installablePackages, slotsFor, queueInstall, queueMove, queuePackUp, installTimeSec } from '../src/sim/planning.js';
import { furnitureAt, dismantle } from '../src/sim/home.js';
import { addItem, count } from '../src/sim/inventory.js';

test('install a furniture package into a free slot, then move and pack it', () => {
  const s = newGame({ seed: 21 });
  dismantle(s, furnitureAt(s, '1F:l4').uid); // clear the wood pile
  const bp = s.inventories[s.player.backpack];
  const pkg = addItem(s, bp, 14006); // large shelf package
  const pk = installablePackages(s).find((p) => p.uid === pkg.uid);
  assert.ok(pk, 'package listed');
  const slots = slotsFor(s, pk.furnCfg).map((x) => x.id);
  assert.ok(slots.includes('1F:l4'));
  queueInstall(s, pk.invId, pk.uid, '1F:l4');
  tick(s, installTimeSec(s, pk.furnCfg) + 600);
  const f = furnitureAt(s, '1F:l4');
  assert.ok(f, 'installed');
  assert.equal(f.cfg, pk.furnCfg);
  assert.equal(count(bp, 14006), 0, 'package consumed');
  assert.ok(f.inv, 'shelf has storage');

  dismantle(s, furnitureAt(s, '1F:l6').uid); // newspaper stacks free a medium slot
  const target = slotsFor(s, f.cfg).find((x) => x.floor === '1F' && x.id !== '1F:l4');
  assert.ok(target, 'a free slot to move into');
  queueMove(s, f.uid, target.id);
  tick(s, 3600 * 2);
  assert.equal(furnitureAt(s, target.id)?.uid, f.uid, 'moved');

  queuePackUp(s, f.uid);
  tick(s, 3600);
  assert.equal(furnitureAt(s, target.id), null, 'packed up');
  const boxes = s.floorBoxes.map((b) => count(s.inventories[b.inv], 14006)).reduce((a, b) => a + b, 0);
  assert.equal(boxes, 1, 'package back on the floor');
});

test('post-disaster installation takes longer', () => {
  const s = newGame({ seed: 22 });
  const pre = installTimeSec(s, 10000);
  s.phase = 'post';
  assert.ok(installTimeSec(s, 10000) > pre);
});
