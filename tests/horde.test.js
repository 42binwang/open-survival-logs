import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../src/sim/state.js';
import { tick } from '../src/sim/tick.js';
import '../src/sim/furnActions.js';
import { furnitureFunctions, startFurnitureFunction } from '../src/sim/furnActions.js';
import {
  isHordeActive,
  nextHorde,
  threatLevel,
  allOpeningsMaxTier,
  spawnZombie,
  throwMolotov,
  counterattack,
  baitWaveSize,
  startThugs,
  resolveThugs,
  thugOffer,
  queueThugChoice,
  acceptRadioMission,
  queueInstallDefense,
  openingsInfo,
  defenseSlotsInfo,
} from '../src/sim/horde.js';
import { furnitureAt, installFurniture, removeFurniture, createFurniture, homeFloors, effectiveMaxHp } from '../src/sim/home.js';
import { addItem, count } from '../src/sim/inventory.js';
import { hasEffect } from '../src/sim/stats.js';
import { dayNumber, dayStartT, hourOfDay } from '../src/sim/time.js';
import { on } from '../src/engine/bus.js';

const HOUR = 3600;

function postGame(seed, opts = {}) {
  const s = newGame({ seed, ...opts });
  s.phase = 'post';
  return s;
}

// Tick forward while keeping the survivor fed and rested (life is left alone unless asked).
function advance(s, seconds, { chunk = 600, life = false, until } = {}) {
  let left = seconds;
  while (left > 0 && s.phase === 'post') {
    const step = Math.min(chunk, left);
    tick(s, step);
    left -= step;
    Object.assign(s.player.stats, { sat: 80, sta: 90, mor: 80 });
    if (life) s.player.stats.life = 100;
    if (until?.(s)) break;
  }
}

function jumpToDay(s, day, hour = 12) {
  s.clock.t = dayStartT(s.clock, day) + hour * HOUR;
  s.run.day = day;
}

function untilT(s, t, opts) {
  advance(s, Math.max(0, t - s.clock.t), opts);
}

function upgradeOpenings(s, door = 30002, win = 35002, reinforce = 1800) {
  for (const slot of ['1F:door', '1F:win1', '1F:win2', '1F:win3']) {
    const f = furnitureAt(s, slot);
    if (!f) continue;
    removeFurniture(s, f.uid);
    const g = createFurniture(s, slot === '1F:door' ? door : win, slot);
    g.reinforce = reinforce;
    g.hp = effectiveMaxHp(g);
  }
}

const FORTRESS = { d1: 36004, d2: 36004, d3: 36003, d4: 36004, d5: 36004, d6: 36002, d7: 36002, d8: 36003, d9: 36003, d10: 36002, d11: 36002, d12: 36003, d13: 36001, d14: 36001, d15: 36001, d16: 36001 };

function install(s, map) {
  for (const [slot, cfg] of Object.entries(map)) assert.ok(installFurniture(s, cfg, `1F:${slot}`).ok, `install ${cfg} at ${slot}`);
}

const yardZombies = (s) => s.zombies.filter((z) => z.home);
const approachOf = (s, slot) => {
  const f = furnitureAt(s, slot);
  return [f.x, f.y + 1];
};

test('Day 7 horde: warned two days ahead with a radio broadcast, attacks at 22:00 from the yard edge', () => {
  const s = postGame(21);
  const broadcasts = [];
  const off = on('radioBroadcast', (p) => broadcasts.push(p));
  const warnAt = dayStartT(s.clock, 5) + 22 * HOUR;
  const attackAt = dayStartT(s.clock, 7) + 22 * HOUR;
  const n = nextHorde(s);
  assert.equal(n.day, 7);
  assert.equal(n.at, attackAt);
  assert.equal(n.warned, false);
  untilT(s, warnAt - 600);
  assert.equal(s.crises.upcoming.length, 0, 'no warning yet');
  untilT(s, warnAt + 600);
  const up = s.crises.upcoming.find((e) => e.type === 'horde');
  assert.ok(up, 'crisis bar shows the upcoming horde');
  assert.equal(up.at, attackAt);
  assert.equal(broadcasts.length, 1, 'radio broadcast when the warning appears');
  assert.equal(broadcasts[0].horde.day, 7);
  assert.equal(s.crises.radioMission.status, 'offered');
  untilT(s, attackAt - 600);
  assert.equal(isHordeActive(s), false);
  assert.equal(yardZombies(s).length, 0);
  untilT(s, attackAt + 20 * 60);
  off();
  assert.equal(isHordeActive(s), true);
  assert.equal(dayNumber(s.clock), 7);
  assert.ok(hourOfDay(s.clock) >= 22);
  const zs = yardZombies(s);
  assert.ok(zs.length > 0, 'zombies spawned');
  const fl = homeFloors(s.home.id)['1F'];
  for (const z of zs) {
    assert.equal(z.floor, '1F');
    assert.ok(z.y >= fl.innerH, 'zombies are in the yard');
    assert.ok(['1F:door', '1F:win1', '1F:win2'].includes(z.target), `target ${z.target}`);
  }
  const act = s.crises.active.find((e) => e.type === 'horde');
  assert.equal(act.phase, 'attack');
  assert.equal(s.crises.upcoming.filter((e) => e.type === 'horde').length, 0);
});

test('zombies gnaw the door; repairs during the attack restore it', () => {
  const s = postGame(22);
  const door = furnitureAt(s, '1F:door');
  untilT(s, dayStartT(s.clock, 7) + 22 * HOUR);
  advance(s, 2 * HOUR, { chunk: 300 });
  assert.ok(door.hp < 1000, `door damaged (${door.hp})`);
  door.hp = 300;
  const fix = furnitureFunctions(s, door).find((f) => f.spec.kind === 'repair' && f.spec.amount === 100);
  assert.ok(fix.enabled);
  startFurnitureFunction(s, door.uid, fix.key);
  let repaired = null;
  const off = on('repaired', (p) => (repaired = p));
  let before = door.hp;
  for (let i = 0; i < 60 && !repaired; i++) {
    before = door.hp;
    advance(s, 60, { chunk: 60 });
  }
  off();
  assert.ok(repaired, 'repair finished');
  assert.ok(door.hp > before + 80, `repair added durability (${before} -> ${door.hp})`);
});

test('spikes kill zombies: kill counters, defense exp and yard loot; the crisis resolves', () => {
  const s = postGame(5);
  install(s, { d1: 36002, d2: 36002, d3: 36002, d4: 36002 });
  const killed = [];
  const off = on('zombieKilled', (p) => killed.push(p));
  untilT(s, dayStartT(s.clock, 7) + 22 * HOUR);
  advance(s, 12 * HOUR, { chunk: 300, until: (st) => !isHordeActive(st) && st.clock.t > dayStartT(st.clock, 7) + 23 * HOUR });
  off();
  assert.equal(isHordeActive(s), false, 'horde over');
  const p = s.progress;
  assert.ok(p.kills >= 5, `spikes killed zombies (${p.kills})`);
  assert.equal(p.counters['zombie.kill'], p.kills);
  assert.equal(killed.length, p.kills);
  assert.ok(killed.every((k) => k.by === 'spike'));
  assert.ok(p.prof.defense.exp > 0 || p.prof.defense.lv > 0, 'defense exp from kills');
  assert.equal(p.crisesSurvived, 1);
  assert.equal(p.counters['crisis.survived'], 1);
  assert.equal(p.hordesSurvived, 1);
  assert.equal(p.counters['crisis.doorHeld80'], 1, 'the door stayed above 80%');
  assert.equal(s.crises.active.filter((e) => e.type === 'horde').length, 0);
  assert.equal(s.crises.schedule.find((e) => e.id === 'story-7').status, 'done');
  assert.equal(s.crises.history.at(-1).survived, true);
  const fl = homeFloors(s.home.id)['1F'];
  const yardBoxes = s.floorBoxes.filter((b) => b.floor === '1F' && b.y >= fl.innerH && s.inventories[b.inv]?.items.length);
  assert.ok(yardBoxes.length > 0, 'rewards and loot wait in yard boxes');
  assert.ok(yardBoxes.every((b) => b.yard));
  const devices = defenseSlotsInfo(s).filter((d) => d.device === 'spike');
  assert.equal(devices.length, 4);
  assert.ok(devices.some((d) => d.f.hp < d.f.maxHp), 'spikes wear down');
  assert.equal(s.progress.counters['defense.spike'], 4);
  advance(s, 2 * HOUR);
  assert.equal(yardZombies(s).filter((z) => z.src !== 'sporadic').length, 0, 'survivors of the horde left');
});

test('large zombies: more hp, harder hits, and they only gnaw from the tile in front of the opening', () => {
  const s = postGame(23);
  jumpToDay(s, 3);
  const door = furnitureAt(s, '1F:door');
  const win = furnitureAt(s, '1F:win1');
  const [dx, dy] = approachOf(s, '1F:door');
  const fl = homeFloors(s.home.id)['1F'];
  const far = spawnZombie(s, { big: true, target: '1F:door', x: dx, y: fl.h - 1, hpMult: 1 });
  advance(s, 120, { chunk: 30 });
  assert.equal(door.hp, 1000, 'no gnawing from a distance');
  assert.ok(far.cy > dy);
  s.zombies = [];
  const big = spawnZombie(s, { big: true, target: '1F:door', x: dx, y: dy, hpMult: 1 });
  const [wx, wy] = approachOf(s, '1F:win1');
  const small = spawnZombie(s, { target: '1F:win1', x: wx, y: wy, hpMult: 1 });
  assert.ok(big.maxHp > small.maxHp * 3, 'large zombies are tougher');
  advance(s, 150, { chunk: 30 });
  const bigHit = 1000 - door.hp;
  const smallHit = 1000 - win.hp;
  assert.ok(smallHit > 0 && bigHit > smallHit * 2, `large zombie hits harder (${bigHit} vs ${smallHit})`);
});

test('breaking in hurts the survivor; a long breach kills them', () => {
  const s = postGame(24);
  jumpToDay(s, 3);
  const door = furnitureAt(s, '1F:door');
  door.hp = 3;
  const [dx, dy] = approachOf(s, '1F:door');
  for (let i = 0; i < 3; i++) spawnZombie(s, { target: '1F:door', x: dx, y: dy, patience: 10 * HOUR, hpMult: 20 });
  const life = s.player.stats.life;
  let breached = false;
  const off = on('breach', () => (breached = true));
  advance(s, 10 * 60, { chunk: 30 });
  off();
  assert.ok(breached, 'the door gave way');
  assert.equal(door.hp, 0);
  assert.ok(s.player.stats.life <= life - 15, `heavy damage on the break-in (${life} -> ${s.player.stats.life})`);
  advance(s, 4 * HOUR, { chunk: 300, life: true });
  assert.equal(s.phase, 'dead');
  assert.equal(s.run.deathCause, 'zombies');
});

test('electric nets need power; nets and sandbags block the way', () => {
  const run = (cfg, poweredFlag) => {
    const s = postGame(25);
    jumpToDay(s, 3);
    install(s, { d3: cfg });
    const device = furnitureAt(s, '1F:d3');
    if (poweredFlag === false) device.powered = false;
    const [dx, dy] = approachOf(s, '1F:door');
    const z = spawnZombie(s, { target: '1F:door', x: dx, y: dy + 2, hpMult: 5, patience: 5 * HOUR });
    advance(s, 5 * 60, { chunk: 30 });
    return { z, device, door: furnitureAt(s, '1F:door') };
  };
  const off = run(36003, false);
  assert.equal(off.z.hp, off.z.maxHp, 'an unpowered net does no damage');
  assert.equal(off.z.stun, 0);
  assert.ok(off.device.hp < off.device.maxHp, 'the zombie is stuck clawing at the net');
  assert.equal(off.door.hp, 1000);
  const onRun = run(36003, true);
  assert.ok(onRun.z.hp < onRun.z.maxHp, 'a powered net shocks');
  assert.equal(onRun.door.hp, 1000);
  const bags = run(36001);
  assert.equal(bags.z.hp, bags.z.maxHp, 'sandbags only block');
  assert.ok(bags.device.hp < bags.device.maxHp, 'and soak up the blows');
  assert.equal(bags.door.hp, 1000);
});

test('tense state while an opening is nearly broken during an attack', () => {
  const s = postGame(26);
  jumpToDay(s, 3);
  const win = furnitureAt(s, '1F:win2');
  const [dx, dy] = approachOf(s, '1F:door');
  spawnZombie(s, { target: '1F:door', x: dx, y: dy + 3, patience: 5 * HOUR, hpMult: 50 });
  advance(s, 60, { chunk: 30 });
  assert.equal(hasEffect(s, 'tense'), false);
  win.hp = 150;
  advance(s, 60, { chunk: 30 });
  assert.equal(hasEffect(s, 'tense'), true);
  win.hp = 1000;
  advance(s, 60, { chunk: 30 });
  assert.equal(hasEffect(s, 'tense'), false, 'cleared after repairs');
  assert.equal(s.progress.taboo.doorWorn, true, 'Flawless taboo recorded');
});

test('molotovs burn the densest group; stronger ones hit harder', () => {
  const damageBy = (id) => {
    const s = postGame(27);
    jumpToDay(s, 3);
    const [dx, dy] = approachOf(s, '1F:door');
    const zs = [];
    for (let i = 0; i < 4; i++) zs.push(spawnZombie(s, { target: '1F:door', x: dx, y: dy + (i % 2), hpMult: 30, patience: 5 * HOUR }));
    spawnZombie(s, { target: '1F:win1', x: 0, y: homeFloors(s.home.id)['1F'].h - 1, hpMult: 30 });
    const r = throwMolotov(s, id);
    assert.ok(r && r.hit >= 4, 'the blast catches the crowd at the door');
    const impact = zs.reduce((a, z) => a + (z.maxHp - z.hp), 0);
    assert.equal(s.crises.fires.length, 1);
    advance(s, 120, { chunk: 30 });
    const total = zs.reduce((a, z) => a + (z.maxHp - z.hp), 0);
    assert.ok(total > impact, 'the fire keeps burning');
    return impact;
  };
  const poor = damageBy(26006);
  const normal = damageBy(26005);
  const strong = damageBy(26007);
  assert.ok(poor < normal && normal < strong, `${poor} < ${normal} < ${strong}`);
});

test('counterattack through the door kills zombies and counts for First Blood', () => {
  const s = postGame(28);
  jumpToDay(s, 3);
  const [dx, dy] = approachOf(s, '1F:door');
  spawnZombie(s, { target: '1F:door', x: dx, y: dy, hpMult: 0.5 });
  const r = counterattack(s, '1F:door');
  assert.equal(r.killed, 1);
  assert.equal(s.progress.counters['zombie.kill'], 1);
  assert.equal(s.progress.kills, 1);
});

test('rotten meat bait summons an extra wave after a crisis-bar countdown', () => {
  const s = postGame(29);
  jumpToDay(s, 3, 10);
  const bp = s.inventories[s.player.backpack];
  addItem(s, bp, 26009);
  const door = furnitureAt(s, '1F:door');
  const fn = furnitureFunctions(s, door).find((f) => f.spec.kind === 'throwBait' && f.enabled);
  assert.equal(fn?.spec.size, 2, 'the door offers throwing the rotten meat chunk');
  startFurnitureFunction(s, door.uid, fn.key);
  advance(s, 20 * 60, { chunk: 60 });
  assert.equal(count(bp, 26009), 0, 'bait used up');
  assert.ok(s.crises.bait, 'bait pending');
  const entry = s.crises.upcoming.find((e) => e.id === 'bait');
  assert.ok(entry && entry.at > s.clock.t, 'countdown in the crisis bar');
  assert.equal(yardZombies(s).length, 0);
  untilT(s, entry.at + 30 * 60, { chunk: 300 });
  assert.equal(s.crises.horde?.kind, 'bait');
  assert.ok(yardZombies(s).length > 0, 'the lured wave arrives');
  assert.ok(baitWaveSize(s, 3) > baitWaveSize(s, 2) && baitWaveSize(s, 2) > baitWaveSize(s, 1), 'bigger bait, bigger wave');
  const boxesBefore = s.floorBoxes.length;
  advance(s, 8 * HOUR, { chunk: 300, until: (st) => !st.crises.horde });
  assert.equal(s.crises.horde, null, 'repelled');
  assert.ok(s.floorBoxes.length > boxesBefore, 'extra supplies outside');
  assert.equal(s.progress.crisesSurvived, 1);
  assert.equal(s.progress.hordesSurvived, 0, 'bait waves are not scheduled hordes');
});

test('final horde on Day 87 sets TAG_FINAL_WAVE_SURVIVED; a fortress keeps Zero Breach', () => {
  const s = postGame(30);
  s.progress.prof.defense.lv = 3;
  upgradeOpenings(s);
  install(s, FORTRESS);
  assert.equal(allOpeningsMaxTier(s), true, 'Iron Wall');
  jumpToDay(s, 86);
  advance(s, 60);
  assert.equal(s.crises.schedule.find((e) => e.id === 'story-76').status, 'missed', 'skipped hordes are not credited');
  const n = nextHorde(s);
  assert.equal(n.day, 87);
  assert.equal(n.final, true);
  assert.equal(n.warned, true);
  untilT(s, dayStartT(s.clock, 87) + 22 * HOUR + 60);
  assert.equal(s.crises.horde?.final, true);
  advance(s, 14 * HOUR, { chunk: 300, until: (st) => !st.crises.horde });
  assert.equal(s.phase, 'post');
  assert.equal(s.story.tags.TAG_FINAL_WAVE_SURVIVED, true);
  assert.ok(s.progress.counters['siege.final.kill'] >= 40, `siege kills ${s.progress.counters['siege.final.kill']}`);
  assert.ok(!s.progress.taboo.siegeDoorWorn, 'doors and windows stayed above 70%');
  assert.equal(s.progress.counters['defense.spike'], 4);
  assert.equal(s.progress.counters['defense.net'], 4);
  assert.equal(s.progress.counters['defense.chainsaw'], 4);
  assert.equal(nextHorde(s), null, 'no story hordes left');
});

test('Day 66 horde hands over the Military Repair Kit', () => {
  const s = postGame(31);
  s.progress.prof.defense.lv = 3;
  upgradeOpenings(s);
  install(s, FORTRESS);
  jumpToDay(s, 65);
  untilT(s, dayStartT(s.clock, 66) + 22 * HOUR + 60);
  assert.equal(s.crises.horde?.id, 'story-66');
  advance(s, 12 * HOUR, { chunk: 300, until: (st) => !st.crises.horde });
  assert.equal(count(s.inventories[s.player.backpack], 9048), 1);
});

test('radio mission: accept, survive until the next warning, get supplies', () => {
  const s = postGame(32);
  install(s, { d1: 36002, d2: 36002, d3: 36002, d4: 36002, d5: 36002 });
  untilT(s, dayStartT(s.clock, 5) + 23 * HOUR);
  assert.equal(acceptRadioMission(s), true);
  const bp = s.inventories[s.player.backpack];
  const before = bp.items.length;
  untilT(s, dayStartT(s.clock, 13) + 23 * HOUR, { life: true });
  assert.equal(s.phase, 'post');
  assert.ok(bp.items.length > before, 'supply drop received');
  assert.equal(s.progress.counters['radio.mission'], 1);
  assert.equal(s.crises.radioMission.status, 'offered', 'a new mission is offered with the Day 15 warning');
});

test('sporadic zombies start after Day 3 and go for the front door', () => {
  const s = postGame(33);
  s.progress.prof.defense.lv = 3;
  upgradeOpenings(s);
  install(s, FORTRESS);
  const spawned = [];
  const off = on('sporadicZombies', () => spawned.push({ day: dayNumber(s.clock), targets: yardZombies(s).filter((z) => z.src === 'sporadic').map((z) => z.target) }));
  untilT(s, dayStartT(s.clock, 30), { life: true, chunk: 1800 });
  off();
  assert.ok(spawned.length >= 2, `sporadic visits (${spawned.length})`);
  assert.ok(spawned.every((e) => e.day > 3));
  assert.ok(spawned.every((e) => e.targets.every((t) => t === '1F:door')));
  assert.ok(s.progress.counters['zombie.sporadic'] >= spawned.length);
});

test('thug encounter: hand over supplies, counterattack, or wait them out', () => {
  const s = postGame(34);
  jumpToDay(s, 22, 20);
  const bp = s.inventories[s.player.backpack];
  for (let i = 0; i < 6; i++) addItem(s, bp, 2105);
  startThugs(s);
  assert.equal(s.crises.thugs.status, 'pending');
  assert.ok(s.crises.active.some((e) => e.type === 'thugs'));
  const offer = thugOffer(s);
  assert.ok(offer.ok && offer.items.length > 0);
  const food = count(bp, 2105);
  const r = resolveThugs(s, 'give');
  assert.ok(r.ok && r.text);
  assert.equal(count(bp, 2105), food - offer.items.length, 'supplies handed over');
  assert.equal(s.crises.thugs.status, 'done');
  assert.equal(s.progress.crisesSurvived, 1);

  jumpToDay(s, 27, 20);
  startThugs(s);
  const sta = s.player.stats.sta;
  queueThugChoice(s, 'fight');
  tick(s, 40 * 60);
  assert.equal(s.crises.thugs.status, 'done');
  assert.equal(s.crises.thugs.choice, 'fight');
  assert.ok(s.player.stats.sta < sta - 15, 'fighting costs stamina');

  jumpToDay(s, 32, 20);
  startThugs(s);
  const door = furnitureAt(s, '1F:door');
  const hp = door.hp;
  advance(s, 3 * HOUR, { chunk: 600 });
  assert.equal(s.crises.thugs.choice, 'ignore', 'they give up at the deadline');
  assert.ok(door.hp < hp, 'after battering the door');
  assert.equal(s.progress.counters['crisis.survived'], 3);
});

test('endless mode: a horde every 5–7 days with a rising threat level', () => {
  const s = newGame({ seed: 35, mode: 'pureEndless' });
  assert.equal(s.phase, 'post');
  s.progress.prof.defense.lv = 3;
  upgradeOpenings(s);
  install(s, FORTRESS);
  assert.equal(threatLevel(s), 1);
  const first = nextHorde(s);
  assert.equal(first.kind, 'endless');
  assert.equal(first.day, 7);
  untilT(s, first.at + 60, { life: true, chunk: 1800 });
  advance(s, 12 * HOUR, { chunk: 300, life: true, until: (st) => !st.crises.horde });
  assert.equal(s.progress.counters['wave.survived'], 1);
  assert.equal(s.progress.hordesSurvived, 1);
  assert.equal(threatLevel(s), 2);
  const second = nextHorde(s);
  assert.ok(second.day - first.day >= 5 && second.day - first.day <= 7, `next horde on Day ${second.day}`);
  untilT(s, second.at + 60, { life: true, chunk: 1800 });
  const h = s.crises.horde;
  assert.ok(h && h.total > 10, 'stronger with the threat level');
  advance(s, 12 * HOUR, { chunk: 300, life: true, until: (st) => !st.crises.horde });
  assert.equal(threatLevel(s), 3);
  assert.equal(s.progress.counters['wave.survived'], 2);
  assert.equal(s.progress.counters['endless.threat'], 3);
});

test('defense slots: locked by defense level, install packages via the survivor, Iron Wall helper', () => {
  const s = postGame(36);
  jumpToDay(s, 3, 9);
  const slots = defenseSlotsInfo(s);
  assert.ok(slots.find((x) => x.slot === '1F:d6').locked, 'Lv1 slot previewed as locked');
  assert.equal(slots.find((x) => x.slot === '1F:d1').locked, false);
  const bp = s.inventories[s.player.backpack];
  addItem(s, bp, 26004);
  queueInstallDefense(s, '1F:d1', 26004);
  advance(s, 2 * HOUR, { chunk: 300 });
  assert.equal(count(bp, 26004), 0, 'package consumed');
  assert.equal(furnitureAt(s, '1F:d1')?.cfg, 36004, 'chainsaw on the defense line');
  assert.equal(s.progress.counters['defense.chainsaw'], 1);
  assert.equal(allOpeningsMaxTier(s), false);
  const door = openingsInfo(s).find((o) => o.door);
  assert.equal(door.exposed, true);
  assert.equal(openingsInfo(s).find((o) => o.slot === '1F:win3').exposed, false, 'the side window does not face the street');
});
