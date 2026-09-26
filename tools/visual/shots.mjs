// @ts-check
// The shot list of the visual regression check (tests/visual/shots.json) and its validation. Every shot is a page
// and query at 1920 × 1080 with a seed (Math.random is seeded with it, and ?seed= carries it for the game) and the
// fixed clock of the file, plus the UI steps that reach the screen. Shots of the 3D renderer name their camera:
// the look-at point and zoom, the rest of the pose being the look constants of src/contracts/look.js.

export const SHOTS_SCHEMA = 'survival-logs/visual-shots@1';
export const VIEWPORT = Object.freeze([1920, 1080]);

/**
 * @typedef {string | { role: string, name?: string, exact?: boolean }} Target  a CSS selector or an ARIA role and name
 * @typedef {{ waitFor: Target } | { click: Target } | { check: Target } | { press: string } | { state: Record<string, string | number> } | { setup: string, args?: Record<string, unknown> } | { frames: number }} Step
 * @typedef {object} Shot
 * @property {string} id
 * @property {string} title
 * @property {string} url  path and query, e.g. '/?render=2d&seed=4242'
 * @property {number} seed
 * @property {Record<string, unknown>} [storage]  localStorage entries present before the page loads (objects as JSON)
 * @property {{ lookAt: [number, number], floor?: string, zoom?: number, lookZoom?: number }} [camera]  required for ?render=3d;
 *   zoom in renderer-contract units (0.5 … 2.4), lookZoom as src/contracts/look.js's zoom amount (0 … 1)
 * @property {Step[]} steps
 * @property {number} [settleFrames]
 * @typedef {object} ShotList
 * @property {string} schema
 * @property {number[]} viewport
 * @property {number} threshold  minimum SSIM, lowest RGB channel
 * @property {string} clock  ISO time the fake clock starts at
 * @property {number} settleFrames  frames drawn after the last step
 * @property {Shot[]} shots
 */

const STEP_KINDS = ['waitFor', 'click', 'check', 'press', 'state', 'setup', 'frames'];

/** @param {unknown} t */
const targetOk = (t) => (typeof t === 'string' && !!t) || (!!t && typeof t === 'object' && typeof (/** @type {any} */ (t).role) === 'string');

/**
 * Problems with a shot list (empty when it can run).
 * @param {unknown} list
 * @param {string[]} setups  the setup names tools/visual/setups.mjs offers
 * @returns {string[]}
 */
export function checkShots(list, setups) {
  const out = [];
  const l = /** @type {any} */ (list);
  if (!l || typeof l !== 'object') return ['the shot list is not an object'];
  if (l.schema !== SHOTS_SCHEMA) out.push(`schema: expected '${SHOTS_SCHEMA}'`);
  if (!Array.isArray(l.viewport) || l.viewport[0] !== VIEWPORT[0] || l.viewport[1] !== VIEWPORT[1]) out.push(`viewport: shots are taken at ${VIEWPORT.join(' × ')}`);
  if (typeof l.threshold !== 'number' || l.threshold < 0.98 || l.threshold > 1) out.push('threshold: an SSIM of at least 0.98 (docs/QUALITY.md)');
  if (typeof l.clock !== 'string' || Number.isNaN(Date.parse(l.clock))) out.push('clock: an ISO time for the fixed clock');
  if (!Number.isInteger(l.settleFrames) || l.settleFrames < 1) out.push('settleFrames: a positive integer');
  if (!Array.isArray(l.shots) || !l.shots.length) return [...out, 'shots: the list is empty, so nothing would be compared'];
  const ids = new Set();
  l.shots.forEach((/** @type {any} */ s, /** @type {number} */ i) => {
    const at = `shots[${i}]${typeof s?.id === 'string' ? ` (${s.id})` : ''}`;
    if (typeof s?.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.id)) out.push(`${at}.id: lowercase words joined by dashes`);
    else if (ids.has(s.id)) out.push(`${at}.id: duplicate`);
    else ids.add(s.id);
    if (typeof s?.title !== 'string' || !s.title) out.push(`${at}.title: say what the shot shows`);
    if (typeof s?.url !== 'string' || !s.url.startsWith('/')) out.push(`${at}.url: a path and query on the dev server`);
    const q = new URLSearchParams(String(s?.url || '').split('?')[1] || '');
    if (!Number.isInteger(s?.seed)) out.push(`${at}.seed: an integer`);
    else if (q.get('seed') !== String(s.seed)) out.push(`${at}.url: carries ?seed=${s.seed}`);
    const render = q.get('render');
    if (!render) out.push(`${at}.url: names the renderer (?render=2d or ?render=3d)`);
    if (render === '3d') {
      const c = s.camera;
      if (!c || !Array.isArray(c.lookAt) || c.lookAt.length !== 2 || !c.lookAt.every(Number.isFinite)) out.push(`${at}.camera: 3D shots name the look-at point [x, y] (the pose is src/contracts/look.js)`);
    }
    if (s?.storage !== undefined && (typeof s.storage !== 'object' || s.storage === null)) out.push(`${at}.storage: localStorage key -> value`);
    if (!Array.isArray(s?.steps)) out.push(`${at}.steps: a list`);
    else
      s.steps.forEach((/** @type {any} */ st, /** @type {number} */ j) => {
        const kinds = Object.keys(st || {}).filter((k) => STEP_KINDS.includes(k));
        if (kinds.length !== 1) return void out.push(`${at}.steps[${j}]: one of ${STEP_KINDS.join(', ')}`);
        const k = kinds[0];
        if (['waitFor', 'click', 'check'].includes(k) && !targetOk(st[k])) out.push(`${at}.steps[${j}].${k}: a selector or { role, name }`);
        if (k === 'setup' && !setups.includes(st.setup)) out.push(`${at}.steps[${j}].setup: '${st.setup}' is not in tools/visual/setups.mjs (${setups.join(', ')})`);
        if (k === 'frames' && (!Number.isInteger(st.frames) || st.frames < 1)) out.push(`${at}.steps[${j}].frames: a positive integer`);
        if (k === 'press' && typeof st.press !== 'string') out.push(`${at}.steps[${j}].press: a key name`);
      });
  });
  return out;
}
