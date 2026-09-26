// Tiny event bus. Simulation code emits; UI, audio and achievement tracking subscribe.

const listeners = new Map();

export function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
  return () => listeners.get(type)?.delete(fn);
}

export function emit(type, payload) {
  for (const key of [type, '*']) {
    const set = listeners.get(key);
    if (!set) continue;
    for (const fn of [...set]) {
      try {
        fn(payload, type);
      } catch (err) {
        console.error(`listener for ${type} failed`, err);
      }
    }
  }
}

export function clearListeners() {
  listeners.clear();
}
