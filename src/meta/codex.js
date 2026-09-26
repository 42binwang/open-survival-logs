// Codex (S01, S02, F12): six collections merged from each run into the global history, codex milestones and
// the souvenir furniture recipes they unlock for every save (guide 3794377867, patches 08-23 / 08-27 / 09-02).
import { codex as CODEX, crafts, dishOutput, seedToPlant } from '../data/db.js';
import { registerSystem } from '../sim/tick.js';
import { homeFurniture } from '../sim/home.js';
import { emit, on } from '../engine/bus.js';
import { pickLang } from '../engine/i18n.js';
import { game, persistHistory } from '../game.js';
import { MILESTONES } from '../content/milestones.js';

export const CODEX_CATS = ['food', 'dish', 'plant', 'prey', 'craft', 'furniture'];

export const CODEX_CAT_INFO = {
  food: { icon: '🍎', name: { en: 'Food', zh: '食物' }, verb: { en: 'Taste {n} different foods', zh: '品尝{n}种食物' }, bar: { en: 'Taste Journal', zh: '品鉴手记' } },
  dish: { icon: '🍲', name: { en: 'Dishes', zh: '菜肴' }, verb: { en: 'Cook {n} different dishes', zh: '烹饪{n}种菜肴' }, bar: { en: 'Recipe Book', zh: '私房菜谱' } },
  plant: { icon: '🌱', name: { en: 'Plants', zh: '植物' }, verb: { en: 'Grow {n} different plants', zh: '种出{n}种植物' }, bar: { en: 'Herbarium', zh: '植物志' } },
  prey: { icon: '🐀', name: { en: 'Prey', zh: '猎物' }, verb: { en: 'Catch {n} kinds of prey', zh: '捕获{n}种猎物' }, bar: { en: 'Field Notes', zh: '狩猎笔记' } },
  craft: { icon: '🛠', name: { en: 'Crafts', zh: '制造' }, verb: { en: 'Craft {n} different items', zh: '制造{n}种物品' }, bar: { en: 'Blueprint Progress', zh: '图纸进度' } },
  furniture: { icon: '🛋', name: { en: 'Furniture', zh: '家具' }, verb: { en: 'Install {n} different furniture', zh: '安装{n}种家具' }, bar: { en: 'Home Sweet Home', zh: '温馨小家' } },
};

// Milestone -> souvenir recipe (craft id producing the souvenir package) -> souvenir furniture.
// "Blueprint Collection" was renamed "Blueprint Progress" (09-04); Shelter / Home Sweet Home thresholds were
// lowered after the furniture codex cleanup (09-02).
export { MILESTONES };

export const SOUVENIR_RECIPES = MILESTONES.map((m) => m.craft);

// Collector (A:9004) checks these eight souvenirs placed at home.
export const COLLECTOR_IDS = [9300, 9301, 9302, 9303, 9304, 9305, 9306, 9307];

const SETS = Object.fromEntries(CODEX_CATS.map((c) => [c, new Set(CODEX[c] || [])]));

const CRAFT_BY_OUTPUT = {};
for (const c of Object.values(crafts)) {
  const out = c.out?.[0];
  if (out && SETS.craft.has(c.id) && CRAFT_BY_OUTPUT[out] == null) CRAFT_BY_OUTPUT[out] = c.id;
}

export function codexList(cat) {
  return CODEX[cat] || [];
}

export function codexTotal(cat) {
  return SETS[cat]?.size || 0;
}

// Systems may record the item they produced instead of the codex key; map it back when unambiguous.
export function normalizeCodexId(cat, raw) {
  const id = Number(raw);
  if (!Number.isFinite(id)) return null;
  const set = SETS[cat];
  if (!set) return null;
  if (set.has(id)) return id;
  if (cat === 'dish' && set.has(dishOutput[id]?.recipe)) return dishOutput[id].recipe;
  if (cat === 'plant' && set.has(seedToPlant[id])) return seedToPlant[id];
  if (cat === 'craft' && CRAFT_BY_OUTPUT[id] != null) return CRAFT_BY_OUTPUT[id];
  return null;
}

function ensureHistoryCodex(history) {
  history.codex = history.codex || {};
  for (const cat of CODEX_CATS) if (!Array.isArray(history.codex[cat])) history.codex[cat] = [];
  history.milestones = history.milestones || {};
  if (!Array.isArray(history.souvenirRecipes)) history.souvenirRecipes = [];
  return history.codex;
}

// Everything the current run has seen, per category (codexRun + installed furniture + furniture at home).
export function runCodexIds(state) {
  const out = {};
  const run = state?.progress?.codexRun || {};
  for (const cat of CODEX_CATS) out[cat] = [...(run[cat] || [])];
  if (state?.progress) {
    for (const key of Object.keys(state.progress.installed || {})) out.furniture.push(Number(key));
    if (state.home) for (const f of homeFurniture(state)) if (typeof f.cfg === 'number') out.furniture.push(f.cfg);
  }
  return out;
}

// Merge the run's codex into the global history. Returns the newly added [{ cat, id }].
export function mergeRunCodex(state, history) {
  const hc = ensureHistoryCodex(history);
  const added = [];
  if (!state) return added;
  const run = runCodexIds(state);
  for (const cat of CODEX_CATS) {
    const have = new Set(hc[cat]);
    for (const raw of run[cat]) {
      const id = normalizeCodexId(cat, raw);
      if (id == null || have.has(id)) continue;
      have.add(id);
      hc[cat].push(id);
      added.push({ cat, id });
    }
  }
  return added;
}

export function codexCount(history, cat) {
  const list = history?.codex?.[cat] || [];
  const set = SETS[cat];
  let n = 0;
  for (const id of new Set(list)) if (set?.has(id)) n++;
  return n;
}

export function codexUnlockedSet(history, cat) {
  return new Set(history?.codex?.[cat] || []);
}

export function codexCompletion(history) {
  const out = {};
  let have = 0;
  let total = 0;
  for (const cat of CODEX_CATS) {
    const n = codexCount(history, cat);
    const t = codexTotal(cat);
    out[cat] = { have: n, total: t, pct: t ? Math.floor((n / t) * 100) : 0 };
    have += n;
    total += t;
  }
  out.all = { have, total, pct: total ? Math.floor((have / total) * 100) : 0 };
  return out;
}

export function milestonesFor(cat) {
  return MILESTONES.filter((m) => m.cat === cat);
}

export function milestoneReached(history, m) {
  return !!history?.milestones?.[m.id] || codexCount(history, m.cat) >= m.count;
}

// Souvenir recipes apply to every save: copy the global list into the run the crafting system reads.
export function syncSouvenirRecipes(state, history) {
  if (!state?.run) return 0;
  const list = (state.run.souvenirRecipes = state.run.souvenirRecipes || []);
  let n = 0;
  for (const id of history?.souvenirRecipes || []) {
    if (!list.includes(id)) {
      list.push(id);
      n++;
    }
  }
  return n;
}

// Award every milestone whose count is met (also retroactively, patch 09-02). Returns the new milestones.
export function checkMilestones(state, history, now = Date.now()) {
  ensureHistoryCodex(history);
  const fresh = [];
  for (const m of MILESTONES) {
    if (codexCount(history, m.cat) < m.count) continue;
    if (!history.milestones[m.id]) {
      history.milestones[m.id] = now;
      fresh.push(m);
    }
    if (!history.souvenirRecipes.includes(m.craft)) history.souvenirRecipes.push(m.craft);
  }
  syncSouvenirRecipes(state, history);
  return fresh;
}

// Merge + milestones in one step (what the live game runs on codex events and every game hour).
export function syncCodex(state, history, now = Date.now()) {
  const added = mergeRunCodex(state, history);
  const milestones = checkMilestones(state, history, now);
  return { added, milestones };
}

export function placedCounts(state) {
  const counts = {};
  if (!state?.home) return counts;
  for (const f of homeFurniture(state)) if (typeof f.cfg === 'number') counts[f.cfg] = (counts[f.cfg] || 0) + 1;
  return counts;
}

export function souvenirsPlaced(state) {
  const counts = placedCounts(state);
  return COLLECTOR_IDS.filter((id) => counts[id] > 0);
}

export function collectorMet(state) {
  return souvenirsPlaced(state).length === COLLECTOR_IDS.length;
}

export function milestoneText(m) {
  const info = CODEX_CAT_INFO[m.cat];
  return pickLang(info.verb).replace('{n}', m.count);
}

// ------------------------------------------------------------------------------------------ live wiring
export function syncLiveCodex() {
  const s = game.state;
  if (!s) return;
  const { added, milestones } = syncCodex(s, game.history);
  if (!added.length && !milestones.length) return;
  persistHistory();
  if (added.length) emit('codexUpdated', { added });
  for (const m of milestones) {
    emit('codexMilestone', { id: m.id, craft: m.craft, furn: m.furn });
    emit('toast', {
      text: pickLang({
        en: `Codex milestone "${m.name.en}" reached: souvenir recipe unlocked for every save.`,
        zh: `图鉴里程碑「${m.name.zh}」达成：纪念品配方已在所有存档解锁。`,
      }),
      kind: 'good',
    });
  }
}

let pending = false;
function schedule() {
  if (pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    syncLiveCodex();
  }, 0);
}

on('codex', schedule);
on('furnitureInstalled', schedule);
on('installed', schedule);
on('runStarted', () => {
  if (game.state) syncSouvenirRecipes(game.state, game.history);
  schedule();
});

registerSystem({
  id: 'codex',
  order: 94,
  onHour(state) {
    if (state === game.state) syncLiveCodex();
  },
  onDeath(state) {
    if (state === game.state) syncLiveCodex();
  },
});
