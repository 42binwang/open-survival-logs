// @ts-check
// Action ids are handles for cancelAction(). Continuing a save in a new page must not hand out an id that a saved
// queued action already has, or cancelling the new action cancels the saved one with it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { enqueue } from '../src/sim/actions.js';
import { saveGame, serialize, _resetStorage } from '../src/engine/save.js';
import { game, loadRun } from '../src/game.js';

let pages = 0;
/** src/sim/actions.js as a new page loads it: a fresh module instance with its own module scope. */
const newPage = () => import(`${new URL('../src/sim/actions.js', import.meta.url).href}?page=${++pages}`);

/** @param {any} s @param {number} x */
const walk = (s, x) => ({ kind: 'walk', label: `walk ${x}`, target: { x, y: 1, floor: s.player.floor } });

/**
 * Saves the run, loads actions.js the way a new page does and presses Continue (loadRun, as the title screen does).
 * @param {string} slot
 * @param {any} state
 */
async function continueInNewPage(slot, state) {
  saveGame(slot, state);
  const page = await newPage();
  assert.ok(loadRun(slot), 'the save loads');
  return { page, loaded: /** @type {any} */ (game.state) };
}

test('continuing a save in a new page never reuses the id of a saved queued action', async () => {
  _resetStorage();
  const s = newGame({ seed: 7 });
  const saved = [1, 2, 3].map((x) => enqueue(s, walk(s, x)).id);
  const { page, loaded } = await continueInNewPage('fix-actions-id', s);
  const added = page.enqueue(loaded, walk(loaded, 4));
  assert.ok(!saved.includes(added.id), `the new action got id ${added.id}, which a saved action has (${saved.join(', ')})`);
  page.cancelAction(loaded, added.id);
  assert.deepEqual(loaded.actions.queue.map((/** @type {any} */ a) => a.id), saved, 'cancelling the new action keeps the saved ones');
});

test('a save without the id counter continues after its highest action id, the current action included', async () => {
  _resetStorage();
  const s = newGame({ seed: 8 });
  for (const x of [1, 2, 3]) enqueue(s, walk(s, x));
  // saved before the counter moved into the state: ids from a module-scope counter that ran on across runs
  const old = JSON.parse(serialize(s));
  delete old.actions.nextId;
  [20, 7, 12].forEach((id, i) => (old.actions.queue[i].id = id));
  old.actions.current = old.actions.queue.shift();
  const { page, loaded } = await continueInNewPage('fix-actions-id-old', old);
  assert.equal(loaded.actions.nextId, 21);
  const added = page.enqueue(loaded, walk(loaded, 4));
  assert.equal(added.id, 21);
  page.cancelAction(loaded, added.id);
  assert.equal(loaded.actions.current.id, 20, 'the current action is kept');
  assert.deepEqual(loaded.actions.queue.map((/** @type {any} */ a) => a.id), [7, 12]);
});

test('a loaded state that skipped ensureSystems still hands out fresh ids', async () => {
  const s = newGame({ seed: 9 });
  for (const x of [1, 2]) enqueue(s, walk(s, x));
  const raw = JSON.parse(serialize(s));
  delete raw.actions.nextId;
  const page = await newPage();
  assert.equal(page.enqueue(raw, walk(raw, 3)).id, 3);
});
