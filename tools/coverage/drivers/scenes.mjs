// @ts-check
// Where Config_Furniture pieces appear in the recreation: each home's starter set, the fixtures of the pre-disaster
// shops and of the exploration sites (src/content), and whatever the sim itself places at home during a run (the
// rooftop basket line, the trapped veteran, …). A placement by a string stand-in instead of a config id (the SCENERY
// keys of homes.js, 'workbench', 'radio', …) places no config piece; it is listed so the report can name it.
import { CHARACTERS, advanceTo, loadSim, postGame } from '../sim.mjs';
import { Recorder } from '../observe.mjs';

/** @param {Record<string, never>} _args */
export async function run(_args) {
  const S = await loadSim();
  const rec = new Recorder();
  /** @type {Record<string, string[]>} */
  const placed = {};
  /** @type {Record<string, string[]>} string stand-ins (not a Config_Furniture id) -> where */
  const standIns = {};
  /** @param {any} cfg @param {string} where */
  const at = (cfg, where) => {
    if (typeof cfg === 'string') (standIns[cfg] ||= []).includes(where) || standIns[cfg].push(where);
    if (typeof cfg !== 'number') return;
    const list = (placed[cfg] ||= []);
    if (!list.includes(where)) list.push(where);
  };
  for (const [id, home] of Object.entries(/** @type {Record<string, any>} */ (S.homes.HOMES))) for (const st of home.starter) at(st.furn, `home:${id}`);
  for (const [id, shop] of Object.entries(/** @type {Record<string, any>} */ (S.shops.SHOPS))) for (const f of shop.fixtures) at(f.cfg, `shop:${id}`);
  // a site's hand-drawn map (legend) and the wing that places the rest of its scene (src/content/siteWings.js)
  for (const site of /** @type {any[]} */ (S.sites.SITES)) for (const spec of [...Object.values(/** @type {Record<string, any>} */ (site.legend)), ...(site.extra || [])]) at(spec.cfg, `site:${site.id}`);
  for (const character of CHARACTERS) {
    const s = postGame(S, { seed: 141, character });
    advanceTo(S, s, 8);
    for (const f of Object.values(/** @type {Record<string, any>} */ (s.furniture))) at(f.cfg, `run:${character}`);
  }
  for (const [cfg, where] of Object.entries(placed)) rec.result('scenes', cfg, where);
  for (const [name, where] of Object.entries(standIns)) rec.result('standIns', name, where);
  return rec.obs;
}
