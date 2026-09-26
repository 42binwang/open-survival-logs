// @ts-check
// Furniture function specs: for every Config_FurnitureFunc id, the spec the sim uses — an entry of
// src/content/funcSpecs.js, or a stat spec the furniture menu derives from the config's PreviewAttrDelta — and
// whether its kind is a registered action kind (src/sim/actions.js registerKind).
import { loadSim } from '../sim.mjs';
import { Recorder } from '../observe.mjs';

/** @param {{ funcs: number[] }} args */
export async function run({ funcs }) {
  const S = await loadSim();
  const rec = new Recorder();
  for (const id of funcs) {
    const cfg = S.db.func(id);
    const own = S.funcSpecs.FUNC_SPECS[id];
    const pv = cfg ? S.funcSpecs.parsePreview(cfg.preview) : null;
    const derived = !own && pv && (Object.keys(pv.gain).length || Object.keys(pv.cost).length || Object.keys(pv.max).length);
    const kind = own?.kind || (derived ? 'stat' : null);
    rec.result('funcs', id, { spec: own ? 'funcSpecs' : derived ? 'preview' : null, kind, registered: !!(kind && S.actions.getKind(kind)) });
  }
  return rec.obs;
}
