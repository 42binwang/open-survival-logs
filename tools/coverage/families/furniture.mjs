// @ts-check
// Furniture (Config_Furniture). Every non-development row is in scope, in the class the config gives it
// (data.mjs furnitureScope):
// - home pieces must be obtainable (a starter piece, placed at home by the sim, or a package some driver obtained),
//   install into a valid slot of some home (or sit where the recreation's home places them), have every config
//   function work for some character, and render;
// - site and shop pieces must be placed somewhere by the recreation (by their config id: a string stand-in places
//   nothing), have every function work where they stand (interactions.mjs), hand out items where the config gives
//   them a loot group, and render;
// - decoration must be placed somewhere and render.
// Being placed is a check that can fail: a piece nothing places stays in the denominator.
import { devEntry, furnitureScope, nameOf, packagesByFurniture, phaseUnreachable } from '../data.mjs';
import { check, family, few } from '../family.mjs';
import { funcOnPiece } from '../interactions.mjs';
import { renderBinding } from '../manifests.mjs';
import { furn } from '../../../src/data/db.js';
import { family as propFamily } from '../../../src/render3d/props.js';

/**
 * @param {{ cfg: import('../data.mjs').Config, obs: import('../observe.mjs').Obs, manifests: import('../manifests.mjs').Manifests }} ctx
 * @returns {import('../family.mjs').Family}
 */
export function evaluate({ cfg, obs, manifests }) {
  const scenes = obs.results.scenes || {};
  const runs = obs.results.furniture || {};
  const fixtures = obs.results.fixtures || {};
  const pkg = packagesByFurniture(cfg);
  const scope = furnitureScope(cfg);
  const liveFunc = (/** @type {number} */ k) => !!(cfg.funcs[k] && !devEntry(cfg.funcs[k]));
  /** @type {string[]} piece:function pairs the original can never run where the piece stands */
  const unreachable = [];
  const rows = Object.values(cfg.furniture).map((f) => {
    const name = nameOf(f);
    const sc = scope.get(f.id);
    if (!sc || sc.excluded) return { id: f.id, name, excluded: sc?.excluded || 'not in the config' };
    const where = [...new Set([...(scenes[f.id] || []), ...(fixtures[f.id]?.where || [])])];
    const atHome = where.filter((w) => w.startsWith('home:') || w.startsWith('run:'));
    /** @type {Record<string, import('../family.mjs').Check>} */
    const checks = {};
    const r = runs[f.id];
    if (sc.cls === 'home') {
      const p = pkg.get(f.id);
      const got = [
        ...atHome.map((w) => w.replace(/^run:/, 'placed by the sim for ')),
        ...(p && obs.produced[p]?.length ? [`package ${p} from ${few(obs.produced[p], 2)}`] : []),
        ...(obs.furnished[f.id] || []).filter((s) => !s.startsWith('install:')),
      ];
      checks.obtain = check(got.length > 0, got.length ? few(got, 2) : `${p ? `its package ${p} is never obtained` : 'no package item hands it out'} and no home or sim run places it`);
      const installed = r ? Object.entries(r.installs).filter(([, v]) => v === true).map(([ch]) => ch) : [];
      const starter = r?.starter || [];
      checks.install = check(installed.length + starter.length + atHome.length > 0, installed.length ? `installs for ${installed.join(', ')}` : starter.length ? `starter piece for ${starter.join(', ')}` : atHome.length ? few(atHome) : r ? few(Object.values(r.installs).map(String), 1) : 'not probed');
    } else {
      checks.placed = check(where.length > 0, where.length ? few(where, 3) : 'no home, shop, exploration site or sim run of the recreation places this config id');
    }
    if (sc.cls !== 'decor') {
      const all = [...new Set([...(f.funcs || []), ...(sc.cls === 'home' ? [...(f.rmFunc || []), ...(f.mvFunc || [])] : [])])].filter(liveFunc);
      const never = all.filter((k) => phaseUnreachable(cfg, f.id, k));
      for (const k of never) unreachable.push(`${f.id}:${k}`);
      const keys = all.filter((k) => !never.includes(k));
      const bad = [];
      for (const k of keys) {
        const res = funcOnPiece(cfg.funcs[k], f.id, obs);
        if (res.ok) continue;
        // the menu merges a function into an identical button: it works when that twin works
        const whys = Object.values(r?.funcs?.[k]?.why || {});
        const twin = whys.length && whys.every((w) => /^merged into the identical button \d+$/.test(String(w))) ? Number(/\d+$/.exec(String(whys[0]))?.[0]) : null;
        if (twin != null && cfg.funcs[twin] && funcOnPiece(cfg.funcs[twin], f.id, obs).ok) continue;
        const telling = whys.find((w) => !/^merged into the identical button/.test(String(w)));
        bad.push(`${k}: ${sc.cls === 'home' && telling ? telling : res.why}`);
      }
      if (f.loot > 0) {
        const lootOut = Object.values(/** @type {Record<string, any>} */ (fixtures[f.id]?.modes || {})).some((m) => Object.values(/** @type {Record<string, any>} */ (m)).some((x) => x.done && x.items)) || keys.some((k) => r?.funcs?.[k]?.gave);
        if (!lootOut) bad.push(`loot group ${f.loot}: no interaction handed out items`);
      }
      const of = keys.length + (f.loot > 0 ? 1 : 0);
      const unreach = never.length ? `; ${never.join(', ')} unreachable (${phaseUnreachable(cfg, f.id, never[0])})` : '';
      if (of) checks.functions = check(!bad.length, `${bad.length ? `${bad.length} of ${of}: ${few(bad, 2)}` : `${of} work`}${unreach}`);
    }
    let rb = renderBinding(manifests, f.id);
    // the three.js renderer draws every piece with the builder of its family (src/render3d/props.js, varied per
    // piece by name and seed) or a scanned model of that family; only the placeholder box does not count
    if (!rb.ok) {
      const c = furn(f.id);
      const fam = c ? propFamily(String(/** @type {any} */ (f).zh ?? c.zh ?? ''), '', c.slot, c) : 'generic';
      if (fam !== 'generic') rb = { ok: true, detail: `the 3D renderer's '${fam}' builder (src/render3d/props.js)` };
      else rb = { ok: false, detail: `${rb.detail}; the 3D renderer draws it as the placeholder box` };
    }
    checks.render = check(rb.ok, rb.detail);
    return { id: f.id, name, checks };
  });
  const standIns = Object.entries(obs.results.standIns || {}).map(([k, w]) => `${k} (${few(/** @type {string[]} */ (w), 2)})`);
  return family(
    {
      id: 'furniture',
      title: 'Furniture',
      source: 'Config_Furniture (src/data/gen/furniture.js)',
      checks: [
        { id: 'obtain', title: 'home pieces: a starter piece, placed at home by the sim, or a package some driver obtained' },
        { id: 'install', title: 'home pieces: installs into a valid slot of some home, or sits where a home places it' },
        { id: 'placed', title: 'site, shop and decoration pieces: a home, shop, exploration site or sim run of the recreation places this config id' },
        { id: 'functions', title: 'every config function works (home pieces for some character; site and shop pieces where they stand, loot handing out items)' },
        { id: 'render', title: 'drawn with its own model or a family model plus a variant (asset manifests)' },
      ],
    },
    rows,
    [
      manifests.files.length ? `asset manifests read: ${manifests.files.join(', ')}` : 'no asset manifest under assets/ yet: every piece fails render',
      ...manifests.problems.map((p) => `manifest problem: ${p}`),
      ...(standIns.length ? [`string stand-ins place no config piece: ${standIns.join('; ')}`] : []),
      ...(unreachable.length ? [`shown to be unreachable, so not required (a post-outbreak function on a pre-outbreak shop piece): ${unreachable.join(', ')}`] : []),
    ]
  );
}
