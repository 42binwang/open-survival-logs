// Save slots in localStorage with a checksum and a backup copy (patches 07-20, 08-25, 09-08).
// Falls back to an in-memory store when localStorage is unavailable (Node tests).
const memory = new Map();
const store = {
  get(k) {
    try {
      if (typeof localStorage !== 'undefined') return localStorage.getItem(k);
    } catch {}
    return memory.has(k) ? memory.get(k) : null;
  },
  set(k, v) {
    try {
      if (typeof localStorage !== 'undefined') return localStorage.setItem(k, v);
    } catch (err) {
      console.warn('localStorage write failed', err);
    }
    memory.set(k, v);
  },
  del(k) {
    try {
      if (typeof localStorage !== 'undefined') return localStorage.removeItem(k);
    } catch {}
    memory.delete(k);
  },
  keys() {
    try {
      if (typeof localStorage !== 'undefined') return Object.keys(localStorage);
    } catch {}
    return [...memory.keys()];
  },
};

const PREFIX = 'survivalLog.save.';
const HISTORY_KEY = 'survivalLog.history';
const SETTINGS_KEY = 'survivalLog.settings';

function checksum(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function serialize(state) {
  return JSON.stringify(state, (k, v) => (k.startsWith('_') ? undefined : v));
}

export function saveGame(slot, state) {
  const data = serialize(state);
  const payload = JSON.stringify({ v: state.version, sum: checksum(data), data, savedAt: Date.now(), summary: summarize(state) });
  const key = PREFIX + slot;
  const prev = store.get(key);
  if (prev) store.set(key + '.bak', prev);
  store.set(key, payload);
  const check = store.get(key);
  if (check !== payload) {
    // retry once, then keep the backup
    store.set(key, payload);
  }
  return true;
}

function parsePayload(raw) {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (checksum(p.data) !== p.sum) return null;
    return { state: JSON.parse(p.data), savedAt: p.savedAt, summary: p.summary, v: p.v };
  } catch {
    return null;
  }
}

export function loadGame(slot) {
  const key = PREFIX + slot;
  return parsePayload(store.get(key)) || parsePayload(store.get(key + '.bak'));
}

export function deleteGame(slot) {
  store.del(PREFIX + slot);
  store.del(PREFIX + slot + '.bak');
}

export function listSaves() {
  const out = [];
  for (const k of store.keys()) {
    if (!k.startsWith(PREFIX) || k.endsWith('.bak')) continue;
    const slot = k.slice(PREFIX.length);
    const raw = store.get(k);
    try {
      const p = JSON.parse(raw);
      out.push({ slot, savedAt: p.savedAt, summary: p.summary, version: p.v, corrupt: checksum(p.data) !== p.sum });
    } catch {
      out.push({ slot, corrupt: true });
    }
  }
  return out.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

// Save files: a slot's payload (checksum and all) as a file the player keeps, and back. Browser storage is per
// browser and can be cleared; a file is the player's own copy.
export const SAVE_FILE_KIND = 'survivalLog.save';

/** The slot as a save file's text, or null when the slot is empty or corrupt. */
export function exportSave(slot) {
  const raw = store.get(PREFIX + slot);
  if (!parsePayload(raw)) return null;
  return JSON.stringify({ kind: SAVE_FILE_KIND, slot, payload: JSON.parse(raw) });
}

/**
 * Writes a save file's text into a slot of its own (never over an existing one). Returns the slot, or null when the
 * text is not a save file or its checksum does not match (a damaged or edited file).
 */
export function importSave(text) {
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    return null;
  }
  if (!file || file.kind !== SAVE_FILE_KIND || !file.payload) return null;
  const raw = JSON.stringify(file.payload);
  if (!parsePayload(raw)) return null;
  const base = `imported-${String(file.slot || 'save').replace(/[^\w-]/g, '')}`;
  let slot = base;
  for (let i = 2; store.get(PREFIX + slot) != null; i++) slot = `${base}-${i}`;
  store.set(PREFIX + slot, raw);
  return slot;
}

function summarize(state) {
  return {
    character: state.meta.character,
    phase: state.phase,
    day: state.run?.day ?? 0,
    cycle: state.loop?.cycle ?? 1,
  };
}

// Global history: achievements, codex, unlocked characters, endings, endless records, profile.
export function defaultHistory() {
  return {
    achievements: {},
    counters: {},
    codex: { food: [], dish: [], plant: [], prey: [], craft: [], furniture: [] },
    milestones: {},
    characters: { wage: true, student: false, warehouse: false },
    endings: {},
    endingsByChar: {},
    endless: { best: {}, maxThreat: 0 },
    profile: { badges: [], titles: [], runs: 0, deaths: 0 },
    tvBest: {},
    records: [],
    seenVersion: null,
    souvenirRecipes: [],
  };
}

export function loadHistory() {
  const raw = store.get(HISTORY_KEY);
  if (!raw) return defaultHistory();
  try {
    const h = JSON.parse(raw);
    return { ...defaultHistory(), ...h, codex: { ...defaultHistory().codex, ...(h.codex || {}) } };
  } catch {
    return defaultHistory();
  }
}

export function saveHistory(h) {
  store.set(HISTORY_KEY, JSON.stringify(h));
}

export function loadSettings() {
  try {
    return JSON.parse(store.get(SETTINGS_KEY) || 'null');
  } catch {
    return null;
  }
}

export function saveSettings(s) {
  store.set(SETTINGS_KEY, JSON.stringify(s));
}

export function _resetStorage() {
  for (const k of store.keys()) if (k.startsWith('survivalLog.')) store.del(k);
}
