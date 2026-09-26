// Deterministic RNG whose whole state lives in the game state (so saves replay identically).

export function seedRng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return { s };
}

export function nextFloat(rng) {
  // mulberry32
  let t = (rng.s = (rng.s + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rand(state) {
  return nextFloat(state.rng);
}

export function randInt(state, lo, hi) {
  return lo + Math.floor(rand(state) * (hi - lo + 1));
}

export function chance(state, p) {
  return rand(state) < p;
}

export function pick(state, arr) {
  if (!arr.length) return undefined;
  return arr[Math.floor(rand(state) * arr.length)];
}

export function weighted(state, entries) {
  // entries: [[value, weight], ...]
  let total = 0;
  for (const [, w] of entries) total += Math.max(0, w);
  if (total <= 0) return undefined;
  let r = rand(state) * total;
  for (const [v, w] of entries) {
    r -= Math.max(0, w);
    if (r < 0) return v;
  }
  return entries[entries.length - 1][0];
}

export function shuffle(state, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(state) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
