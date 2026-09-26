// @ts-check
// Furniture functions (Config_FurnitureFunc): every named, non-development function (data.mjs funcExcluded) needs
// - a spec the sim uses (src/content/funcSpecs.js), whose action kind is registered; a stamina stub the furniture menu
//   derives from PreviewAttrDelta counts only for a function the config gives no reward and no loot action;
// - a test during which the function's action completes (the traced test run);
// - for a loot function (actions 1100/1101) that a furniture piece in scope offers: a probe that ran it on such a
//   piece and saw items come out. A loot function no piece in scope offers has nothing a probe could run it on.
import { funcExcluded, furnitureScopeOf, nameOf, offeredFuncs } from '../data.mjs';
import { check, family, few } from '../family.mjs';
import { funcOnPiece, isLoot } from '../interactions.mjs';

/**
 * @param {{ cfg: import('../data.mjs').Config, obs: import('../observe.mjs').Obs, trace: import('../trace.mjs').Trace | null }} ctx
 * @returns {import('../family.mjs').Family}
 */
export function evaluate({ cfg, obs, trace }) {
  const offered = offeredFuncs(cfg);
  const scope = furnitureScopeOf(cfg);
  const specs = obs.results.funcs || {};
  /** @type {string[]} */
  const unoffered = [];
  const rows = Object.values(cfg.funcs).map((fn) => {
    const name = nameOf(fn) || `#${fn.id}`;
    const excluded = funcExcluded(cfg, fn, offered);
    if (excluded) return { id: fn.id, name, excluded };
    const sp = specs[fn.id];
    const tests = trace?.func[fn.id] || [];
    const loot = isLoot(fn);
    const rewarded = fn.reward > 0 || loot;
    const stub = sp?.spec === 'preview';
    const what = [fn.reward > 0 ? `reward ${fn.reward}` : '', loot ? 'a loot action (1101)' : ''].filter(Boolean).join(' and ');
    /** @type {Record<string, import('../family.mjs').Check>} */
    const checks = {
      spec: check(
        !!sp?.spec && !!sp.registered && !(stub && rewarded),
        !sp ? 'not probed' : !sp.spec ? 'no spec in src/content/funcSpecs.js and no PreviewAttrDelta' : !sp.registered ? `kind '${sp.kind}' is not registered` : stub && rewarded ? `only the stamina stub derived from its preview, but the config gives it ${what}: it needs a spec that hands that out` : `${sp.spec} (${sp.kind})`
      ),
      test: check(tests.length > 0, trace ? (tests.length ? few(tests, 1) : 'no test completes its action') : 'the traced test run did not run'),
    };
    const pieces = loot ? (offered.get(fn.id) || []).filter((p) => scope.get(p)?.excluded === null) : [];
    if (loot && !pieces.length) unoffered.push(String(fn.id));
    if (pieces.length) {
      const tries = pieces.map((p) => ({ p, r: funcOnPiece(fn, p, obs) }));
      const good = tries.filter((t) => t.r.ok);
      checks.loot = check(good.length > 0, good.length ? `items from ${few(good.map((t) => `${t.p} (${t.r.where})`), 2)}` : `no piece handed out items through it: ${few(tries.map((t) => `${t.p}: ${t.r.why}`), 2)}`);
    }
    return { id: fn.id, name, checks };
  });
  return family(
    {
      id: 'funcs',
      title: 'Furniture functions',
      source: 'Config_FurnitureFunc (src/data/gen/funcs.js)',
      checks: [
        { id: 'spec', title: 'a spec the sim uses, with a registered action kind (a preview stub only without reward or loot)' },
        { id: 'test', title: 'a test during which the function’s action completes' },
        { id: 'loot', title: 'loot functions: a probe ran it on a piece offering it and items came out' },
      ],
    },
    rows,
    unoffered.length ? [`no loot check for ${unoffered.length} loot function(s) no furniture piece in scope offers (spec and test still apply): ${unoffered.join(', ')}`] : []
  );
}
