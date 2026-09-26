// @ts-check
// Plants (Config_Plant): a seed item sows it, it grows to ripe under its config conditions and the harvest yields its
// config gain; the Perfect gain, the seed return and the withered remains the config lists are produced too.
import { devEntry, nameOf } from '../data.mjs';
import { check, family } from '../family.mjs';

/**
 * @param {{ cfg: import('../data.mjs').Config, obs: import('../observe.mjs').Obs }} ctx
 * @returns {import('../family.mjs').Family}
 */
export function evaluate({ cfg, obs }) {
  const runs = obs.results.plants || {};
  const rows = Object.values(cfg.plants).map((p) => {
    const name = nameOf(p);
    const excluded = devEntry(p);
    if (excluded) return { id: p.id, name, excluded };
    const res = runs[p.id];
    const why = (res?.problems || []).join('; ');
    const gain = new Set(p.gain || []);
    const harvestOk = !!res?.ripe && res.harvest.some((/** @type {number} */ id) => gain.has(id));
    const out = [];
    if (p.pGain?.length && !res?.perfect?.some((/** @type {number} */ id) => (p.pGain || []).includes(id))) out.push('Perfect gain');
    if (p.seed?.length && p.seedRate > 0 && !res?.seeds && !res?.perfect?.some((/** @type {number} */ id) => p.seed.includes(id))) out.push('seed return');
    if (p.wither?.length && !res?.wither?.some((/** @type {number} */ id) => p.wither.includes(id))) out.push('withered remains');
    return {
      id: p.id,
      name,
      checks: {
        plant: check(!!res?.planted, res?.planted ? `seed ${res.seed}` : why || 'not probed'),
        harvest: check(harvestOk, harvestOk ? `ripe in ${res.hours} h (config ${Math.round(p.grow / 3600)} h)` : why || 'no harvest'),
        outputs: check(!!res && !out.length, !res ? 'not probed' : out.length ? `never produced: ${out.join(', ')}` : 'config outputs produced'),
      },
    };
  });
  return family(
    {
      id: 'plants',
      title: 'Plants',
      source: 'Config_Plant (src/data/gen/plants.js)',
      checks: [
        { id: 'plant', title: 'a seed item sows it' },
        { id: 'harvest', title: 'grows to ripe and the harvest yields its config gain' },
        { id: 'outputs', title: 'Perfect gain, seed return and withered remains the config lists' },
      ],
    },
    rows
  );
}
