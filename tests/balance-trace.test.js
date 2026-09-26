// @ts-check
// tools/balance/trace.mjs replays a balance session exactly as tools/balance/session.mjs plays it, and records it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runSession } from '../tools/balance/session.mjs';
import { traceSession, describe } from '../tools/balance/trace.mjs';

test('a trace ends where its balance session ends, with the same bot counters, and records the outings', async () => {
  for (const opts of [
    { bot: 'prepper', difficulty: 'normal', seed: 5, days: 3 },
    { bot: 'forager', difficulty: 'normal', seed: 1026, days: 20 },
  ]) {
    const r = await runSession(opts);
    const t = await traceSession(opts);
    assert.deepEqual([t.end.phase === 'post' ? 'alive' : t.end.phase, t.end.days, t.end.cause, t.end.botNotes], [r.end, r.days, r.cause, r.botNotes], JSON.stringify(opts));
    assert.equal(t.days.length, r.foodSat.length, 'one morning per day played');
    if (opts.bot === 'forager') {
      assert.equal(t.outings.length, Number(r.botNotes.outings), 'every outing recorded');
      assert.ok(t.outings.every((o) => o.after && o.searched <= o.total));
      assert.match(describe(t), /streets \d\d:\d\d–\d\d:\d\d: \d+ of \d+ searched/);
    }
  }
});
