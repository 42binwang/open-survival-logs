// @ts-check
// The re-bake sample: at least SHARE of the shipped assets and at least one per family, chosen by a seed so that a
// given seed always picks the same assets. Assets are ranked by SHA-256 of `<seed>:<id>`; each family's first-ranked
// asset is taken, then the ranking fills up to ceil(SHARE × total).
import { createHash } from 'node:crypto';

export const SHARE = 0.05;

/**
 * @param {number} seed
 * @param {string} id
 */
const rank = (seed, id) => createHash('sha256').update(`${seed}:${id}`).digest('hex');

/**
 * @param {{ id: string, family: string }[]} assets
 * @param {number} seed
 * @returns {string[]} the sampled ids, in rank order
 */
export function sample(assets, seed) {
  const ranked = [...assets].sort((a, b) => (rank(seed, a.id) < rank(seed, b.id) ? -1 : 1));
  const picked = new Set();
  const families = new Set();
  for (const a of ranked) {
    if (families.has(a.family)) continue;
    families.add(a.family);
    picked.add(a.id);
  }
  const want = Math.ceil(SHARE * assets.length);
  for (const a of ranked) {
    if (picked.size >= want) break;
    picked.add(a.id);
  }
  return ranked.filter((a) => picked.has(a.id)).map((a) => a.id);
}

/**
 * The default seed: the first 8 hex digits of the checked-out commit, so each commit re-bakes its own sample and
 * a rerun of the same commit repeats it.
 * @param {string | null} commit
 */
export const seedFor = (commit) => (commit && /^[0-9a-f]{8}/.test(commit) ? parseInt(commit.slice(0, 8), 16) : 0);
