// Objective / quest list shown top-left. Systems register providers returning entries.
const providers = [];

export function registerObjectives(fn) {
  providers.push(fn);
}

// entry: { id, text, prog?: string, done?: bool, urgent?: bool, onClick? }
export function getObjectives(state) {
  const out = [];
  for (const fn of providers) {
    try {
      const r = fn(state);
      if (r) out.push(...r);
    } catch (err) {
      console.error('objective provider failed', err);
    }
  }
  return out;
}
