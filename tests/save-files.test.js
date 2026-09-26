// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { saveGame, loadGame, listSaves, exportSave, importSave, _resetStorage } from '../src/engine/save.js';

test('save files: a slot exports to a file and imports back into a slot of its own, state intact', () => {
  _resetStorage();
  const s = newGame({ seed: 7 });
  saveGame('slot1', s);
  const text = exportSave('slot1');
  assert.ok(text, 'the slot exports');
  const slot = importSave(/** @type {string} */ (text));
  assert.equal(slot, 'imported-slot1');
  assert.deepEqual(loadGame(/** @type {string} */ (slot))?.state, loadGame('slot1')?.state);
  // a second import never overwrites the first
  assert.equal(importSave(/** @type {string} */ (text)), 'imported-slot1-2');
  assert.equal(listSaves().length, 3);
});

test('save files: an edited, damaged or foreign file is refused and writes nothing', () => {
  _resetStorage();
  saveGame('slot1', newGame({ seed: 8 }));
  const file = JSON.parse(/** @type {string} */ (exportSave('slot1')));
  const edited = { ...file, payload: { ...file.payload, data: file.payload.data.replace('"seed":8', '"seed":9') } };
  assert.notEqual(edited.payload.data, file.payload.data, 'the edit changed the data');
  assert.equal(importSave(JSON.stringify(edited)), null, 'a checksum mismatch');
  assert.equal(importSave('not json'), null);
  assert.equal(importSave(JSON.stringify({ kind: 'something else', payload: file.payload })), null);
  assert.equal(exportSave('missing'), null);
  assert.equal(listSaves().length, 1);
});
