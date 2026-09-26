// Planning Mode (dev logs #3/#4): install furniture packages into typed slots, move and pack up furniture.
import { item, furn, CAT, SLOT, packageToFurniture, furnitureToPackage } from '../data/db.js';
import { registerKind, enqueue } from './actions.js';
import { allSlots, slotDef, slotUsable, slotAccepts, needsSky, furnitureAt, furnDef, createFurniture, removeFurniture, packUp, installFurniture, dropToFloor, furnLabel, furnitureChanged } from './home.js';
import { homeSources } from './furnActions.js';
import { findUid, removeUid, locateUid, makeInstance, insert } from './inventory.js';
import { footprint } from './scene.js';
import { emit } from '../engine/bus.js';
import { pickLang } from '../engine/i18n.js';

export const POST_INSTALL_MULT = 1.5;

export function installTimeSec(state, cfg) {
  const d = furnDef(cfg);
  const base = d?.inst || 1800;
  return state.phase === 'pre' ? base : Math.round(base * POST_INSTALL_MULT);
}

export function planningSources(state) {
  const ids = homeSources(state);
  if (state.home.doorstepInv && state.inventories[state.home.doorstepInv]) ids.push(state.home.doorstepInv);
  for (const b of state.floorBoxes || []) if (state.inventories[b.inv]) ids.push(b.inv);
  return ids;
}

// Furniture packages the survivor owns at home.
export function installablePackages(state) {
  const out = [];
  for (const invId of planningSources(state)) {
    const inv = state.inventories[invId];
    for (const inst of inv.items) {
      const cfg = item(inst.id);
      if (cfg?.cat !== CAT.FURNITURE_PACKAGE) continue;
      const fid = packageToFurniture[inst.id];
      if (!fid || !furn(fid)) continue;
      out.push({ invId, uid: inst.uid, itemId: inst.id, furnCfg: fid });
    }
  }
  return out;
}

export function slotsFor(state, furnCfg, { includeOccupied = false } = {}) {
  const d = furnDef(furnCfg);
  const need = d?.slot ?? SLOT.SMALL;
  return allSlots(state).filter((s) => {
    if (!slotAccepts(s.type, need)) return false;
    if (s.trap && need !== SLOT.SMALL) return false;
    if (needsSky(furnCfg) && !s.outdoor) return false;
    if (!slotUsable(state, s)) return false;
    if (!includeOccupied && state.home.slots[s.id]) return false;
    return true;
  });
}

export function queueInstall(state, pkgInvId, pkgUid, slotId) {
  const inv = state.inventories[pkgInvId];
  const inst = inv && findUid(inv, pkgUid);
  if (!inst) return null;
  const furnCfg = packageToFurniture[inst.id];
  return enqueue(state, {
    kind: 'install',
    label: pickLang({ en: 'Install', zh: '安装' }),
    target: { slot: slotId },
    pkgInv: pkgInvId,
    pkgUid,
    furnCfg,
    slotId,
    dur: installTimeSec(state, furnCfg),
    cost: state.phase === 'pre' ? { sta: 3 } : { sta: 8 },
  });
}

registerKind('install', {
  canStart(state, a) {
    if (state.home.slots[a.slotId]) return pickLang({ en: 'That spot is taken.', zh: '这个位置被占用了。' });
    const loc = locateUid(state, a.pkgUid);
    if (!loc) return pickLang({ en: 'The package is gone.', zh: '包裹不见了。' });
    return true;
  },
  complete(state, a) {
    const loc = locateUid(state, a.pkgUid);
    if (!loc) return;
    const res = installFurniture(state, a.furnCfg, a.slotId);
    if (!res.ok) {
      emit('toast', { text: pickLang({ en: 'Cannot install here.', zh: '无法安装在这里。' }), kind: 'bad' });
      return;
    }
    removeUid(loc.inv, a.pkgUid);
    emit('installed', { cfg: a.furnCfg, slot: a.slotId });
  },
});

// Upgraded doors and windows replace the opening in place: the old one comes out (its package comes back
// if it had one; the starter doors and windows are scrapped), the new one goes in at full durability.
const STARTER_OPENINGS = new Set([211, 212, 368, 369]);

export function isOpeningCfg(cfg) {
  const t = furnDef(cfg)?.slot;
  return t === SLOT.DOOR || t === SLOT.WINDOW;
}

export function replaceTargets(state, furnCfg) {
  if (!isOpeningCfg(furnCfg)) return [];
  return slotsFor(state, furnCfg, { includeOccupied: true }).filter((s) => {
    const f = furnitureAt(state, s.id);
    return f && f.cfg !== furnCfg;
  });
}

export function queueReplaceOpening(state, pkgInvId, pkgUid, slotId) {
  const inst = findUid(state.inventories[pkgInvId], pkgUid);
  if (!inst) return null;
  const furnCfg = packageToFurniture[inst.id];
  if (!replaceTargets(state, furnCfg).some((s) => s.id === slotId)) return null;
  return enqueue(state, {
    kind: 'replaceOpening',
    label: pickLang({ en: 'Replace', zh: '更换' }),
    target: { slot: slotId },
    pkgInv: pkgInvId,
    pkgUid,
    furnCfg,
    slotId,
    dur: installTimeSec(state, furnCfg),
    cost: { sta: 12 },
  });
}

registerKind('replaceOpening', {
  canStart(state, a) {
    if (!locateUid(state, a.pkgUid)) return pickLang({ en: 'The package is gone.', zh: '包裹不见了。' });
    return furnitureAt(state, a.slotId) ? true : pickLang({ en: 'Nothing to replace there.', zh: '那里没有可更换的门窗。' });
  },
  complete(state, a) {
    const loc = locateUid(state, a.pkgUid);
    const old = furnitureAt(state, a.slotId);
    if (!loc || !old) return;
    const back = !STARTER_OPENINGS.has(old.cfg) && furnitureToPackage[old.cfg];
    removeFurniture(state, old.uid);
    const res = installFurniture(state, a.furnCfg, a.slotId);
    if (!res.ok) {
      createFurniture(state, old.cfg, a.slotId);
      emit('toast', { text: pickLang({ en: 'Cannot install here.', zh: '无法安装在这里。' }), kind: 'bad' });
      return;
    }
    removeUid(loc.inv, a.pkgUid);
    if (back) {
      const pkg = makeInstance(state, back);
      if (!insert(state.inventories[state.player.backpack], pkg, { allowOverweight: true })) dropToFloor(state, pkg, state.player.floor, state.player.x, state.player.y);
    }
    emit('installed', { cfg: a.furnCfg, slot: a.slotId, replaced: old.cfg });
    emit('toast', { text: pickLang({ en: `${furnLabel(res.f)} is in.`, zh: `${furnLabel(res.f)}装好了。` }), kind: 'good' });
  },
});

// Move installed furniture to another compatible slot (keeps storage contents).
export function queueMove(state, uid, slotId) {
  const f = state.furniture[uid];
  if (!f) return null;
  return enqueue(state, {
    kind: 'moveTo',
    label: pickLang({ en: 'Move furniture', zh: '移动家具' }),
    target: { furn: uid },
    furnUid: uid,
    slotId,
    dur: Math.round(installTimeSec(state, f.cfg) * 0.5),
    cost: { sta: 10 },
  });
}

registerKind('moveTo', {
  canStart(state, a) {
    if (state.home.slots[a.slotId]) return pickLang({ en: 'That spot is taken.', zh: '这个位置被占用了。' });
    return true;
  },
  complete(state, a) {
    const f = state.furniture[a.furnUid];
    const s = slotDef(state, a.slotId);
    if (!f || !s) return;
    const d = furnDef(f.cfg);
    if (!slotAccepts(s.type, d.slot ?? s.type)) return;
    state.home.slots[f.slot] = null;
    const [w, h] = footprint(s.type);
    Object.assign(f, { slot: s.id, floor: s.floor, x: s.x, y: s.y, w, h });
    state.home.slots[s.id] = f.uid;
    furnitureChanged(state);
  },
});

// Pack furniture back into its package (so it can be moved later or returned before the disaster).
export function queuePackUp(state, uid) {
  const f = state.furniture[uid];
  if (!f) return null;
  return enqueue(state, {
    kind: 'packUp',
    label: pickLang({ en: 'Pack up', zh: '打包' }),
    target: { furn: uid },
    furnUid: uid,
    dur: Math.round(installTimeSec(state, f.cfg) * 0.3),
    cost: { sta: 5 },
  });
}

registerKind('packUp', {
  complete(state, a) {
    const f = state.furniture[a.furnUid];
    if (!f) return;
    if (!furnitureToPackage[f.cfg]) {
      emit('toast', { text: pickLang({ en: 'This cannot be packed. Dismantle it instead.', zh: '这个无法打包，只能拆除。' }), kind: 'bad' });
      return;
    }
    packUp(state, f.uid);
  },
});

export function canPack(f) {
  return typeof f.cfg === 'number' && !!furnitureToPackage[f.cfg] && !f.fixed;
}
