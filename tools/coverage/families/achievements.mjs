// @ts-check
// Achievements (Config_Achievement): a test during which game code awards the achievement (the unlock path,
// unlockMet) on a state the sim advanced past it in that test — an award on a state whose achievement fields the
// test's own code wrote between game calls, or that the state (and history) met before the test first ticked the
// state, credits nothing, nor does a checker called on hand-set counters — and, for achievements the
// config ties to a counter, a write site of that counter in game code (src/sim, src/meta) the keys audit found; a
// writtenBy declaration alone is no write.
import { nameOf } from '../data.mjs';
import { check, family, few } from '../family.mjs';

/**
 * @typedef {{ key: string, ns: string, writes: { file: string }[], writtenBy: string[] }} KeyEntry
 * @param {{ cfg: import('../data.mjs').Config, trace: import('../trace.mjs').Trace | null, keys: KeyEntry[] | null }} ctx
 * @returns {import('../family.mjs').Family}
 */
export function evaluate({ cfg, trace, keys }) {
  /** @type {Map<string, KeyEntry>} */
  const counters = new Map((keys || []).filter((k) => k.ns === 'counters').map((k) => [k.key, k]));
  const rows = cfg.achievements.map((a) => {
    const tests = trace?.achievement[a.id] || [];
    const undriven = trace?.undriven?.[a.id] || [];
    const baseline = trace?.baseline?.[a.id] || [];
    const tainted = trace?.tainted?.[a.id] || [];
    /** @type {Record<string, import('../family.mjs').Check>} */
    const checks = {
      test: check(
        tests.length > 0,
        !trace
          ? 'the traced test run did not run'
          : tests.length
            ? few(tests, 1)
            : tainted.length
              ? `awarded only on a state whose fields its condition reads the test wrote itself between game calls (${few(tainted, 1)})`
              : baseline.length
                ? `awarded only on a state that met it before the sim advanced it (${few(baseline, 1)})`
                : undriven.length
                  ? `awarded only on hand-set state the sim never advanced (${few(undriven, 1)})`
                  : 'no test awards it'
      ),
    };
    if (a.counter) {
      const k = counters.get(a.counter);
      const game = (k?.writes || []).map((w) => w.file).filter((f) => f.startsWith('src/sim/') || f.startsWith('src/meta/'));
      checks.counter = check(game.length > 0, !keys ? 'keys-audit did not run' : !k ? `counter ${a.counter} is not declared in src/contracts/keys.js` : game.length ? `${a.counter} written by ${few([...new Set(game)], 2)}` : `no write site of ${a.counter} under src/sim or src/meta${k.writtenBy?.length ? ` (declared writtenBy ${k.writtenBy[0]}, but no write the audit found)` : ''}`);
    }
    return { id: a.id, name: nameOf(a) || a.steam || String(a.id), checks };
  });
  return family(
    {
      id: 'achievements',
      title: 'Achievements',
      source: 'Config_Achievement (src/data/gen/achievements.js)',
      checks: [
        { id: 'test', title: 'a test during which game code awards it (unlockMet) on a state the sim advanced past it (no achievement field written by test code, not already met when the test first ticked the state)' },
        { id: 'counter', title: 'its config counter has a write site in game code (src/sim, src/meta)' },
      ],
    },
    rows
  );
}
