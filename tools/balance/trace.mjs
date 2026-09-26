#!/usr/bin/env node
// @ts-check
// Balance traces: replays one balance session exactly as tools/balance/session.mjs plays it (same seed, bot, 10-minute
// steps and save/load round trips, the session going on with the loaded copy) and records it day by day: the survivor
// and the food at home every morning, every outing (containers searched, what came home, bites, kills, stamina and
// Life spent, and what the survivor stood idle in front of at the site), every meal, repair and horde, and the death.
// docs/balance/forager.md is built on these traces.
//   node tools/balance/trace.mjs --bot forager --difficulty normal --seed 1026            day-by-day text on stdout
//   node tools/balance/trace.mjs --bot forager --difficulty hard --seed 5062 --json out.json
// Options: --days <n> (default 100). Exit code: 0, or 2 on bad usage.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { BOTS } from './bots.mjs';
import { loadSim } from './sim.mjs';
import { STEP_SEC } from './session.mjs';
import { load } from '../gate/sim.mjs';

/**
 * @typedef {{ sat: number, sta: number, mor: number, life: number, maxLife: number, effects: string[] }} Stats
 * @typedef {{ slot: string, hp: number, max: number }} Opening
 * @typedef {{ id: number, name: string, sat: number }} Find  sat: satiety the survivor eats as it is, 0 for the rest
 * @typedef {{ day: number, hour: number, site: string, depletion: number, before: Stats, after: Stats | null, arrive: number | null,
 *   back: number | null, backDay: number | null, searched: number, total: number, finds: Find[], food: number, bites: number,
 *   biteDamage: number, kills: number, idle: Record<string, number> }} Outing  food: days of satiety brought home; idle:
 *   minutes the survivor stood idle at the site, by the container nearest it and its options (✗ = not possible)
 * @typedef {{ day: number, hour: number, food: number, stats: Stats, openings: Opening[], out: number, asleep: number }} Morning
 *   food: days of satiety at home the survivor eats; out, asleep: minutes of that day
 * @typedef {{ day: number, total: number, start: Stats, openings: Opening[], breaches: { hour: number, slot: string, life: number, sta: number }[],
 *   end: Stats | null, died: boolean }} Horde
 * @typedef {object} Trace
 * @property {string} bot
 * @property {string} difficulty
 * @property {number} seed
 * @property {{ phase: string, days: number, cause: string | null, botNotes: Record<string, unknown> }} end  as runSession reports it
 * @property {Morning[]} days
 * @property {Outing[]} outings
 * @property {{ day: number, hour: number, id: number, name: string, sat: number, expired: boolean }[]} meals
 * @property {{ day: number, hour: number, slot: string, hp: number, attacked: boolean, sta: number }[]} repairs
 * @property {Horde[]} hordes
 * @property {{ day: number, hour: number, cause: string, stats: Stats, lastHurt: unknown } | null} death
 */

const SAT_PER_DAY = 40;
const r1 = (/** @type {number} */ v) => Math.round(v * 10) / 10;

/**
 * Plays and records one session.
 * @param {{ bot: string, difficulty: string, seed: number, days?: number, character?: string }} opts
 * @returns {Promise<Trace>}
 */
export async function traceSession({ bot: botId, difficulty, seed, days = 100, character = 'wage' }) {
  const S = await loadSim();
  const bus = await load('src/engine/bus.js');
  const bot = /** @type {Record<string, import('./bots.mjs').Bot>} */ (BOTS)[botId];
  if (!bot) throw new Error(`no bot '${botId}'`);
  const CAT = S.db.CAT;
  let state = S.state.newGame({ seed, id: `balance-${difficulty}-${seed}`, character, difficulty, skipPrologue: true });
  state.meta.created = 0;
  state.ui.autonomy = true;
  const day = () => S.time.dayNumber(state.clock);
  const hour = () => Math.round(S.time.hourOfDay(state.clock) * 100) / 100;
  /** @param {any} cfg */
  const eats = (cfg) => !!cfg && cfg.cat === CAT.FOOD && cfg.sat > 0 && !cfg.noUse && !(cfg.cook && cfg.sub === 2);
  /** @returns {Stats} */
  const stats = () => {
    const p = state.player;
    return { sat: r1(p.stats.sat), sta: r1(p.stats.sta), mor: r1(p.stats.mor), life: r1(p.stats.life), maxLife: S.stats.effectiveMax(state, 'life'), effects: Object.keys(p.effects) };
  };
  /** @returns {Opening[]} */
  const openings = () => S.home.doorAndWindows(state).map((/** @type {any} */ f) => ({ slot: f.slot, hp: Math.round(f.hp), max: S.home.effectiveMaxHp(f) }));
  const food = () => {
    let sat = 0;
    for (const id of S.furnActions.homeSources(state)) {
      for (const it of state.inventories[id]?.items || []) {
        const cfg = S.db.item(it.id);
        if (eats(cfg)) sat += cfg.sat * (cfg.uses > 1 ? (it.uses ?? cfg.uses) : 1) * (it.qty || 1) * (it.left ?? 1);
      }
    }
    return r1(sat / SAT_PER_DAY);
  };

  /** @type {Trace} */
  const trace = { bot: botId, difficulty, seed, end: { phase: '', days: 0, cause: null, botNotes: {} }, days: [], outings: [], meals: [], repairs: [], hordes: [], death: null };
  /** @type {Outing | null} */
  let out = null;
  /** @type {Horde | null} */
  let horde = null;
  // the copy a round trip leaves behind plays on unrecorded
  let muted = false;
  /** @type {(() => void)[]} */
  const offs = [];
  /** @param {string} type @param {(p: any) => void} fn */
  const on = (type, fn) => offs.push(bus.on(type, (/** @type {any} */ p) => !muted && fn(p)));
  on('exploreDeparted', (p) => {
    out = { day: day(), hour: hour(), site: p.site, depletion: r1((state.explore.depletion[p.site] || 0) * 100) / 100, before: stats(), after: null, arrive: null, back: null, backDay: null, searched: 0, total: 0, finds: [], food: 0, bites: 0, biteDamage: 0, kills: 0, idle: {} };
  });
  on('exploreArrived', () => {
    if (out) out.arrive = hour();
  });
  on('exploreSearched', (p) => {
    if (!out) return;
    out.searched++;
    for (const id of p.taken) {
      const cfg = S.db.item(id);
      out.finds.push({ id, name: S.db.itemName(id), sat: eats(cfg) ? cfg.sat * (cfg.uses > 1 ? cfg.uses : 1) : 0 });
    }
  });
  on('exploreHit', (p) => {
    if (!out) return;
    out.bites++;
    out.biteDamage += p.dmg;
  });
  on('zombieKilled', (p) => {
    if (out && p.where === 'explore') out.kills++;
  });
  on('exploreEnded', (p) => {
    if (!out) return;
    Object.assign(out, { back: hour(), backDay: day(), after: stats(), total: p.total, food: r1(out.finds.reduce((a, f) => a + f.sat, 0) / SAT_PER_DAY) });
    out.biteDamage = r1(out.biteDamage);
    trace.outings.push(out);
    out = null;
  });
  on('ate', (p) => {
    trace.meals.push({ day: day(), hour: hour(), id: p.id, name: S.db.itemName(p.id), sat: S.db.item(p.id)?.sat ?? 0, expired: !!p.expired });
  });
  on('repaired', (p) => {
    trace.repairs.push({ day: day(), hour: hour(), slot: state.furniture[p.furn]?.slot, hp: Math.round(p.hp), attacked: S.horde.underAttack(state), sta: r1(state.player.stats.sta) });
  });
  on('hordeStart', (p) => {
    horde = { day: p.day, total: p.total, start: stats(), openings: openings(), breaches: [], end: null, died: false };
  });
  on('breach', (p) => {
    if (horde) horde.breaches.push({ hour: hour(), slot: p.slot, life: r1(state.player.stats.life), sta: r1(state.player.stats.sta) });
  });
  on('hordeEnded', () => {
    if (!horde) return;
    horde.end = stats();
    trace.hordes.push(horde);
    horde = null;
  });
  on('death', (p) => {
    trace.death = { day: p.day, hour: hour(), cause: p.cause, stats: stats(), lastHurt: state.run.lastHurt ?? null };
    if (horde) {
      Object.assign(horde, { end: stats(), died: true });
      trace.hordes.push(horde);
      horde = null;
    }
  });

  /** @param {any} st */
  const step = (st) => {
    bot.step(S, st);
    S.tick.tick(st, STEP_SEC);
  };
  const roundTrip = () => {
    const orig = state;
    state = JSON.parse(S.save.serialize(orig));
    S.modifiers.bumpMods(state);
    S.state.ensureSystems(state);
    for (let i = 0; i < 144; i++) {
      muted = true;
      step(orig);
      muted = false;
      step(state);
    }
  };
  const rtDay = 5 + (seed % 20);
  const start = state.clock.t;
  let trips = 0;
  let lastDay = -1;
  /** @type {Morning | null} */
  let morning = null;
  try {
    for (let guard = 0; guard < 200 * 144; guard++) {
      if (state.phase === 'dead' || state.phase === 'ending') break;
      if (state.phase === 'post' && day() > days) break;
      if (!trips && state.clock.t - start >= 3 * 3600) {
        roundTrip();
        trips++;
        continue;
      }
      if (state.phase === 'post' && day() !== lastDay) {
        lastDay = day();
        morning = { day: lastDay, hour: hour(), food: food(), stats: stats(), openings: openings(), out: 0, asleep: 0 };
        trace.days.push(morning);
        if (lastDay === rtDay && trips < 2) {
          roundTrip();
          trips++;
          continue;
        }
      }
      if (morning) {
        if (state.explore?.run) morning.out += STEP_SEC / 60;
        if (state.player.sleeping) morning.asleep += STEP_SEC / 60;
      }
      step(state);
      const run = state.explore?.run;
      if (out && run?.phase === 'site' && S.actions.isIdle(state)) {
        const fx = S.explore.nearestFixture(state, 60);
        const key = fx ? `${fx.id} ${fx.loot}${fx.lock ? ` ${fx.lock}` : ''}: ${S.explore.fixtureOptions(state, fx.id).map((/** @type {any} */ o) => `${o.mode}${o.enabled ? '' : '✗'}`).join('/')}` : 'nothing left';
        /** @type {Outing} */ (out).idle[key] = (/** @type {Outing} */ (out).idle[key] || 0) + STEP_SEC / 60;
      }
    }
  } finally {
    for (const off of offs) off();
  }
  trace.end = {
    phase: state.phase,
    days: state.phase === 'dead' ? state.run.deathDay ?? 0 : state.phase === 'pre' ? 0 : Math.min(days, day()),
    cause: state.phase === 'dead' ? S.rebirth.deathCause(state) : null,
    botNotes: state.run?.bot || {},
  };
  return trace;
}

/**
 * The trace as text, one block per day.
 * @param {Trace} t
 */
export function describe(t) {
  const L = [`${t.bot}, ${t.difficulty}, seed ${t.seed}: ${t.end.phase} on Day ${t.end.days}${t.end.cause ? ` (${t.end.cause})` : ''}`];
  const hm = (/** @type {number | null} */ h) => (h == null ? '—' : `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`);
  for (const d of t.days) {
    const s = d.stats;
    const open = d.openings.map((o) => `${o.slot.split(':')[1]} ${Math.round((100 * o.hp) / o.max)} %`).join(', ');
    const rep = t.repairs.filter((r) => r.day === d.day).length;
    const meals = t.meals.filter((m) => m.day === d.day).length;
    L.push(`Day ${d.day}: food ${d.food} d; satiety ${s.sat}, stamina ${s.sta}, morale ${s.mor}, Life ${s.life}/${s.maxLife}${s.effects.length ? ` [${s.effects.join(', ')}]` : ''}; ${open}; ${rep} repairs, ${meals} meals, ${d.out} min out, ${d.asleep} min asleep`);
    for (const o of t.outings.filter((x) => x.day === d.day)) {
      const idle = Object.entries(o.idle).map(([k, v]) => `${k} ${v} min`).join('; ');
      L.push(`  ${o.site} ${hm(o.hour)}–${hm(o.back)}: ${o.searched} of ${o.total} searched, ${o.bites} bites (${o.biteDamage} Life), ${o.kills} kills; stamina ${o.before.sta} → ${o.after?.sta}, Life ${o.before.life} → ${o.after?.life}; food ${o.food} d${o.finds.length ? ` (${o.finds.map((f) => f.name).join(', ')})` : ''}${idle ? `; idle at: ${idle}` : ''}`);
    }
  }
  for (const h of t.hordes) {
    L.push(`Horde of Day ${h.day} (${h.total}): starts at Life ${h.start.life}, stamina ${h.start.sta}, openings ${h.openings.map((o) => `${o.hp}/${o.max}`).join(', ')}; ${h.breaches.length ? `breached ${h.breaches.map((b) => `${hm(b.hour)} ${b.slot.split(':')[1]} (Life ${b.life}, stamina ${b.sta})`).join(', ')}` : 'no breach'}; ${h.died ? 'died' : 'survived'}`);
  }
  return `${L.join('\n')}\n`;
}

// ------------------------------------------------------------------------------------------ the CLI
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const USAGE = 'usage: node tools/balance/trace.mjs --bot <idle|prepper|forager> --difficulty <relaxed|normal|hard|outOfAmmo> --seed <n> [--days 100] [--json <file>|-]';
  /** @type {Record<string, any>} */
  let a = {};
  try {
    a = parseArgs({ options: { bot: { type: 'string', default: 'forager' }, difficulty: { type: 'string', default: 'normal' }, seed: { type: 'string' }, days: { type: 'string', default: '100' }, json: { type: 'string' } } }).values;
  } catch (err) {
    console.error(`trace: ${/** @type {Error} */ (err).message}\n${USAGE}`);
    process.exit(2);
  }
  const seed = Number(a.seed);
  const days = Number(a.days);
  if (!Number.isInteger(seed) || !Number.isInteger(days) || days < 1 || !(a.bot in BOTS)) {
    console.error(USAGE);
    process.exit(2);
  }
  const t = await traceSession({ bot: a.bot, difficulty: a.difficulty, seed, days });
  if (a.json === '-') console.log(JSON.stringify(t));
  else if (a.json) writeFileSync(a.json, JSON.stringify(t));
  else process.stdout.write(describe(t));
}
