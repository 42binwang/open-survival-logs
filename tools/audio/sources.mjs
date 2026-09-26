// @ts-check
// Downloaded foley sources: Kenney audio packs (CC0), locked in assets/lock/WP-P0-06.json and read straight from
// the zips. Also records the Sonniss GDC bundle attempt (the official pages answer 403 to scripted requests).

import { ensureZip } from './fetch.mjs';
import { readLock, writeLock } from './lock.mjs';
import { decode } from './lib/io.mjs';
import { toMono } from './lib/dsp.mjs';

export const KENNEY = /** @type {const} */ ({
  'impact-sounds': { title: 'Impact Sounds', url: 'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip' },
  'interface-sounds': { title: 'Interface Sounds', url: 'https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip' },
  'rpg-audio': { title: 'RPG Audio', url: 'https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip' },
  'ui-audio': { title: 'UI Audio', url: 'https://kenney.nl/media/pages/assets/ui-audio/490d233f68-1677590494/kenney_ui-audio.zip' },
});

/** @typedef {keyof typeof KENNEY} KenneyPack */

/** @param {KenneyPack} pack */
function meta(pack) {
  return {
    id: `kenney/${pack}`,
    provider: 'Kenney',
    title: `Kenney ${KENNEY[pack].title}`,
    page: `https://kenney.nl/assets/${pack}`,
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    authors: ['Kenney Vleugels (Kenney.nl)'],
    kind: 'audio',
    creationMethod: 'Foley recording',
    notes: 'Audio members are read from the zip by tools/audio/fetch.mjs; their SHA-256 are listed under members.',
  };
}

/**
 * Local paths of Kenney members (downloads and locks the pack on first use).
 * @param {KenneyPack} pack
 * @param {string[]} names  e.g. ['footstep_wood_000.ogg']
 * @param {string} usedFor
 */
export async function kenneyFiles(pack, names, usedFor) {
  const zipName = KENNEY[pack].url.split('/').pop() ?? `${pack}.zip`;
  return ensureZip(meta(pack), { url: KENNEY[pack].url, path: zipName }, names, [usedFor]);
}

/**
 * Decoded mono Kenney sounds keyed by name.
 * @param {KenneyPack} pack
 * @param {string[]} names
 * @param {string} usedFor
 * @returns {Promise<Record<string, Float32Array>>}
 */
export async function kenney(pack, names, usedFor) {
  const files = await kenneyFiles(pack, names, usedFor);
  /** @type {Record<string, Float32Array>} */
  const out = {};
  for (const n of names) out[n] = toMono(decode(files[n]))[0];
  return out;
}

/** Records the one-time attempt at the Sonniss GDC bundles in the lock fragment (shown in the credits). */
export function recordSonnissAttempt() {
  const lock = readLock();
  const urls = ['https://sonniss.com/gameaudiogdc', 'https://gdc.sonniss.com/', 'https://sonniss.com/gdc-bundle-license/'];
  lock.attempts = urls.map((url) => ({
    url,
    date: '2026-09-22',
    result: 'HTTP 403 to scripted requests (browser user agent too); the bundles are multi-GB archives without per-file downloads, so the lane uses Kenney packs and synthesis instead',
  }));
  writeLock(lock);
}
