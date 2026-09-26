// @ts-check
// Named setups a shot step can run in the page (`{ "setup": "<name>", "args": { … } }`). They drive the running game
// through the same sim and UI modules the page loaded (the dev server serves /src/…), deterministically: the seed
// fixes Math.random and the harness owns the clock. Each is sent to the browser on its own (page.evaluate), so it
// imports what it needs itself; the template literals keep type checkers from resolving dev-server paths.
/* global window -- these run in the page */

/** @type {Record<string, (args: any) => Promise<unknown>>} */
export const SETUPS = {
  /** Advances the run by whole game hours (the sim ticks as the game does at high speed). */
  hours: async ({ hours = 1 }) => {
    const g = /** @type {any} */ (window).__game;
    const { tick } = await import(/* @vite-ignore */ `${'/src/sim/tick.js'}`);
    for (let h = 0; h < hours; h++) tick(g.state, 3600);
    return g.state.phase;
  },
  /** Opens a panel by id (panels.js openPanel), as its toolbar button or hotkey would. */
  panel: async ({ id, ...rest }) => {
    const { openPanel } = await import(/* @vite-ignore */ `${'/src/ui/panels.js'}`);
    openPanel(id, rest);
    return id;
  },
  /** Before the outbreak: walks to a supply point, or home, and arrives (predisaster.js startTravel). */
  travel: async ({ to }) => {
    const g = /** @type {any} */ (window).__game;
    const { startTravel } = await import(/* @vite-ignore */ `${'/src/sim/predisaster.js'}`);
    const { tick } = await import(/* @vite-ignore */ `${'/src/sim/tick.js'}`);
    const want = to === 'home' ? 'home' : `shop:${to}`;
    startTravel(g.state, to);
    for (let i = 0; i < 2000 && g.state.player.scene !== want; i++) tick(g.state, 30);
    return g.state.player.scene;
  },
  /** Shows another floor of the home (the floor switcher). */
  floor: async ({ id }) => {
    const g = /** @type {any} */ (window).__game;
    g.state.ui.viewFloor = id;
    return id;
  },
  /** The survivor's life runs out: the death screen follows. */
  die: async () => {
    const g = /** @type {any} */ (window).__game;
    const { tick } = await import(/* @vite-ignore */ `${'/src/sim/tick.js'}`);
    g.state.player.stats.life = 0;
    tick(g.state, 30);
    return g.state.phase;
  },
  /**
   * Runs the sim to a day and time (`day`, `hour`, `minute`), keeping the survivor and the house standing (the four
   * stats and every door and window back to full each step, as tools/budgets/sim100.mjs does), then closes the
   * windows the days opened (daily settlements, events). Stops early if the run ends.
   */
  goto: async ({ day, hour = 8, minute = 0 }) => {
    const g = /** @type {any} */ (window).__game;
    const { tick } = await import(/* @vite-ignore */ `${'/src/sim/tick.js'}`);
    const time = await import(/* @vite-ignore */ `${'/src/sim/time.js'}`);
    const { effectiveMax } = await import(/* @vite-ignore */ `${'/src/sim/stats.js'}`);
    const home = await import(/* @vite-ignore */ `${'/src/sim/home.js'}`);
    const { closeAllWindows } = await import(/* @vite-ignore */ `${'/src/ui/dom.js'}`);
    const s = g.state;
    const at = () => (time.dayNumber(s.clock) - day) * 24 + time.hourOfDay(s.clock) - (hour + minute / 60);
    for (let i = 0; i < 24 * 120 && at() < -1e-6 && s.phase !== 'dead' && s.phase !== 'ending'; i++) {
      tick(s, Math.min(600, Math.max(30, -at() * 3600)));
      for (const k of ['sat', 'sta', 'mor', 'life']) s.player.stats[k] = effectiveMax(s, k);
      if (s.player.scene === 'home') for (const f of home.doorAndWindows(s)) f.hp = home.effectiveMaxHp(f);
    }
    closeAllWindows();
    return `${time.dayNumber(s.clock)} ${time.hourOfDay(s.clock).toFixed(2)} ${s.phase}`;
  },
  /** Closes every window and empties the toast column: the pop-ups and news a run of days leaves on screen. */
  clear: async () => {
    const dom = await import(/* @vite-ignore */ `${'/src/ui/dom.js'}`);
    dom.closeAllWindows();
    dom.toastLayer()?.replaceChildren();
    return 'clear';
  },
  /** Today's weather (src/sim/weather.js WEATHER_KINDS: sunny, cloudy, rain, heavyRain, storm, snow, freezingRain, coldWave). */
  weather: async ({ kind }) => {
    const g = /** @type {any} */ (window).__game;
    const { WEATHER_KINDS } = await import(/* @vite-ignore */ `${'/src/sim/weather.js'}`);
    if (!WEATHER_KINDS.includes(kind)) throw new Error(`weather '${kind}' is not one of ${WEATHER_KINDS.join(', ')}`);
    g.state.weather.today = { ...g.state.weather.today, kind };
    return kind;
  },
  /** Opens every locked area of the home (furnActions.js unlockArea), or the listed ones. */
  unlock: async ({ areas = null }) => {
    const g = /** @type {any} */ (window).__game;
    const { unlockArea } = await import(/* @vite-ignore */ `${'/src/sim/furnActions.js'}`);
    const { homeDef } = await import(/* @vite-ignore */ `${'/src/sim/home.js'}`);
    const list = areas || Object.keys(homeDef(g.state.home.id).locks || {});
    for (const a of list) unlockArea(g.state, a);
    return list.join(',');
  },
  /** After the outbreak: sets out for an exploration site and arrives (explore.js startExploration); with `arriveAt` (hours), leaves so as to arrive then. */
  explore: async ({ site = 'streets', arriveAt = null }) => {
    const g = /** @type {any} */ (window).__game;
    const ex = await import(/* @vite-ignore */ `${'/src/sim/explore.js'}`);
    const { tick } = await import(/* @vite-ignore */ `${'/src/sim/tick.js'}`);
    const time = await import(/* @vite-ignore */ `${'/src/sim/time.js'}`);
    if (arriveAt != null) {
      const leave = arriveAt - (ex.travelTime(g.state, site) + 60) / 3600;
      for (let i = 0; i < 2000 && time.hourOfDay(g.state.clock) < leave - 1e-6; i++) tick(g.state, Math.min(300, Math.max(10, (leave - time.hourOfDay(g.state.clock)) * 3600)));
    }
    const r = ex.startExploration(g.state, site);
    if (!r.ok) throw new Error(`exploration ${site} could not start: ${r.reason}`);
    tick(g.state, ex.travelTime(g.state, site) + 60);
    return g.state.player.scene;
  },
};

export const SETUP_NAMES = Object.keys(SETUPS);
