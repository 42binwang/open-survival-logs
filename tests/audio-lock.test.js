// @ts-check
// The audio lane's lock (tools/audio/lock.mjs): its fragment, else its entries in the merged ledger. A lane with no
// pinned sources and a fragment that disagrees with the ledger both fail instead of passing with nothing checked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WP, readLock, resolveLock } from '../tools/audio/lock.mjs';

const file = (/** @type {string} */ sha) => ({ url: 'https://kenney.nl/media/pages/assets/x/0-1/x.zip', path: 'x.zip', bytes: 1, sha256: sha.repeat(64) });
const source = (/** @type {string} */ id, /** @type {string} */ sha) => ({
  id,
  provider: 'Kenney',
  title: id,
  license: 'CC0-1.0',
  authors: ['Kenney'],
  kind: 'audio',
  usedFor: ['test'],
  retrieved: '2026-09-23',
  files: [file(sha)],
});
const ledger = {
  schema: 1,
  sources: [
    { wp: 'WP-P0-05', ...source('ambientcg/other', 'c') },
    { wp: WP, ...source('kenney/a', 'a') },
    { wp: WP, ...source('kenney/b', 'b') },
  ],
  attempts: [{ wp: WP, url: 'https://sonniss.com/gameaudiogdc', date: '2026-09-22', result: '403' }],
};

test('without a fragment the lane reads its own ledger entries, without the wp tag', () => {
  const lock = resolveLock(null, ledger);
  assert.equal(lock.wp, WP);
  assert.deepEqual(
    lock.sources.map((s) => s.id),
    ['kenney/a', 'kenney/b']
  );
  assert.ok(lock.sources.every((s) => !('wp' in s)));
  assert.deepEqual(
    lock.attempts?.map((a) => a.url),
    ['https://sonniss.com/gameaudiogdc']
  );
});

test('a fragment that locks the same files as the ledger is used as it is', () => {
  const fragment = { schema: 1, wp: WP, sources: [source('kenney/a', 'a'), source('kenney/new', 'd')] };
  assert.equal(resolveLock(fragment, ledger), fragment);
});

test('the checkout resolves to the 43 sources WP-P0-06 locked', () => {
  assert.equal(readLock().sources.length, 43);
});

test('a lane with no entries in the ledger and no fragment fails, naming the ledger and the lane', () => {
  const noLane = { schema: 1, sources: ledger.sources.filter((s) => s.wp !== WP) };
  assert.throws(() => resolveLock(null, noLane), /WP-P0-06 has no pinned sources: .*assets\/sources\.lock\.json/);
  assert.throws(() => resolveLock(null, null), /WP-P0-06 has no pinned sources: .*\(missing\)/);
});

test('a fragment whose files differ from the ledger entry of the same id is a lock conflict', () => {
  const fragment = { schema: 1, wp: WP, sources: [source('kenney/a', 'e')] };
  assert.throws(() => resolveLock(fragment, ledger), /lock conflict for kenney\/a: assets\/lock\/WP-P0-06\.json and assets\/sources\.lock\.json/);
});
