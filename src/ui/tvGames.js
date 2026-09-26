// TV mini-games (T01, F11): five keyboard canvas games played on the TV when a game console is somewhere at home.
// Scores go to history.tvBest and counters['tvgame.best'] (TV Enthusiast: 70 in any game, patch 08-27);
// leaderboards list neighbor NPCs (easier in the College Student's run); the first game each day gives Morale.
import { h, clear, openWindow, closeWindow, toast } from './dom.js';
import { registerPanel } from './panels.js';
import { game, persistHistory } from '../game.js';
import { pickLang } from '../engine/i18n.js';
import { emit } from '../engine/bus.js';
import { seedRng, nextFloat } from '../engine/rng.js';
import { itemName } from '../data/db.js';
import { TV_GAMES, CONSOLE_IDS, TV_MORALE, TV_ACHIEVEMENT_SCORE, consoleAtHome, tvLeaderboard, submitTvScore } from '../meta/profile.js';

const W = 480;
const H = 320;
// the games' own seeded stream (src/engine/rng.js), apart from the run's: a round plays out the same way for the same
// inputs, and the tests that play one take the same paths every run
const tvRng = seedRng(0x7e1e);
const random = () => nextFloat(tvRng);
const rnd = (a, b) => a + random() * (b - a);
const irnd = (n) => Math.floor(random() * n);

function text(ctx, s, x, y, { size = 14, color = '#e6e1d6', align = 'center', bold = false } = {}) {
  ctx.fillStyle = color;
  ctx.font = `${bold ? 'bold ' : ''}${size}px "Courier New", monospace`;
  ctx.textAlign = align;
  ctx.fillText(s, x, y);
}

function clearScreen(ctx, color = '#050806') {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
}

// ------------------------------------------------------------------------------------------ Snake
function snake() {
  const C = 20;
  const COLS = W / C;
  const ROWS = H / C;
  const g = { score: 0, over: false };
  let body = [
    [8, 8],
    [7, 8],
    [6, 8],
  ];
  let dir = [1, 0];
  let next = dir;
  let acc = 0;
  const free = () => {
    for (;;) {
      const p = [irnd(COLS), irnd(ROWS)];
      if (!body.some(([x, y]) => x === p[0] && y === p[1])) return p;
    }
  };
  let food = free();
  g.update = (dt, inp) => {
    if (inp.pressed.left && dir[0] !== 1) next = [-1, 0];
    else if (inp.pressed.right && dir[0] !== -1) next = [1, 0];
    else if (inp.pressed.up && dir[1] !== 1) next = [0, -1];
    else if (inp.pressed.down && dir[1] !== -1) next = [0, 1];
    acc += dt;
    const step = Math.max(0.055, 0.13 - body.length * 0.0018);
    while (acc >= step && !g.over) {
      acc -= step;
      dir = next;
      const head = [body[0][0] + dir[0], body[0][1] + dir[1]];
      if (head[0] < 0 || head[1] < 0 || head[0] >= COLS || head[1] >= ROWS || body.some(([x, y]) => x === head[0] && y === head[1])) {
        g.over = true;
        return;
      }
      body.unshift(head);
      if (head[0] === food[0] && head[1] === food[1]) {
        g.score += 3;
        food = free();
      } else {
        body.pop();
      }
    }
  };
  g.draw = (ctx) => {
    clearScreen(ctx, '#0b1a0e');
    ctx.fillStyle = '#e06a5a';
    ctx.fillRect(food[0] * C + 4, food[1] * C + 4, C - 8, C - 8);
    body.forEach(([x, y], i) => {
      ctx.fillStyle = i === 0 ? '#bff08a' : '#6fbf4a';
      ctx.fillRect(x * C + 1, y * C + 1, C - 2, C - 2);
    });
  };
  return g;
}

// ------------------------------------------------------------------------------------------ Space Invaders
function invaders() {
  const g = { score: 0, over: false, lives: 3 };
  let px = W / 2;
  const py = H - 22;
  let shots = [];
  let bombs = [];
  let aliens = [];
  let wave = 0;
  let adir = 1;
  let cool = 0;
  let hurt = 0;
  const spawn = () => {
    aliens = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) aliens.push({ x: 70 + c * 44, y: 36 + r * 28, row: r, alive: true });
    adir = 1;
    wave++;
  };
  spawn();
  g.update = (dt, inp) => {
    if (inp.held.left) px -= 220 * dt;
    if (inp.held.right) px += 220 * dt;
    px = Math.max(16, Math.min(W - 16, px));
    cool -= dt;
    hurt -= dt;
    if (inp.held.fire && cool <= 0 && shots.length < 2) {
      shots.push({ x: px, y: py - 10 });
      cool = 0.32;
    }
    for (const s of shots) s.y -= 380 * dt;
    shots = shots.filter((s) => s.y > 0);
    const alive = aliens.filter((a) => a.alive);
    const speed = (30 + wave * 10) * (1 + (32 - alive.length) / 12);
    const dx = adir * speed * dt;
    if (alive.some((a) => a.x + dx < 14 || a.x + dx > W - 14)) {
      adir = -adir;
      for (const a of alive) a.y += 12;
    } else {
      for (const a of alive) a.x += dx;
    }
    for (const s of shots) {
      const hit = alive.find((a) => a.alive && Math.abs(a.x - s.x) < 14 && Math.abs(a.y - s.y) < 10);
      if (hit) {
        hit.alive = false;
        s.y = -99;
        g.score += hit.row === 0 ? 3 : hit.row === 1 ? 2 : 1;
      }
    }
    if (alive.length && random() < dt * (1.4 + wave * 0.35)) {
      const a = alive[irnd(alive.length)];
      bombs.push({ x: a.x, y: a.y + 8 });
    }
    for (const b of bombs) b.y += (150 + wave * 12) * dt;
    bombs = bombs.filter((b) => b.y < H);
    if (hurt <= 0 && bombs.some((b) => Math.abs(b.x - px) < 13 && b.y > py - 8)) {
      g.lives -= 1;
      bombs = [];
      hurt = 1.2;
      if (g.lives <= 0) g.over = true;
    }
    if (alive.some((a) => a.alive && a.y > py - 22)) g.over = true;
    if (!aliens.some((a) => a.alive)) {
      g.score += 5;
      spawn();
    }
  };
  g.draw = (ctx) => {
    clearScreen(ctx, '#05060d');
    for (const a of aliens) {
      if (!a.alive) continue;
      ctx.fillStyle = ['#e06a5a', '#e0a84a', '#7cc47c', '#6fb3e0'][a.row];
      ctx.fillRect(a.x - 11, a.y - 7, 22, 12);
      ctx.fillStyle = '#05060d';
      ctx.fillRect(a.x - 6, a.y - 3, 3, 3);
      ctx.fillRect(a.x + 3, a.y - 3, 3, 3);
      ctx.fillStyle = ['#e06a5a', '#e0a84a', '#7cc47c', '#6fb3e0'][a.row];
      ctx.fillRect(a.x - 11, a.y + 5, 4, 4);
      ctx.fillRect(a.x + 7, a.y + 5, 4, 4);
    }
    if (hurt <= 0 || Math.floor(hurt * 10) % 2) {
      ctx.fillStyle = '#d8e8ff';
      ctx.beginPath();
      ctx.moveTo(px, py - 10);
      ctx.lineTo(px - 14, py + 8);
      ctx.lineTo(px + 14, py + 8);
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    for (const s of shots) ctx.fillRect(s.x - 1, s.y - 6, 2, 8);
    ctx.fillStyle = '#ff9a6a';
    for (const b of bombs) ctx.fillRect(b.x - 2, b.y - 4, 4, 8);
    text(ctx, '♥'.repeat(Math.max(0, g.lives)), W - 10, 18, { align: 'right', color: '#e06a5a' });
  };
  return g;
}

// ------------------------------------------------------------------------------------------ Breakout
function breakout() {
  const g = { score: 0, over: false, lives: 3 };
  const COLS = 10;
  const ROWS = 5;
  const BW = 44;
  const BH = 14;
  let bricks = [];
  let level = 0;
  let pad = W / 2;
  const PW = 72;
  const ball = { x: W / 2, y: H - 40, vx: 0, vy: 0, stuck: true };
  const build = () => {
    bricks = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) bricks.push({ x: 20 + c * (BW + 0), y: 36 + r * (BH + 4), row: r, alive: true });
    level++;
  };
  build();
  const launch = () => {
    const sp = 250 + level * 25;
    const a = rnd(-0.6, 0.6);
    ball.vx = Math.sin(a) * sp;
    ball.vy = -Math.cos(a) * sp;
    ball.stuck = false;
  };
  g.update = (dt, inp) => {
    if (inp.held.left) pad -= 320 * dt;
    if (inp.held.right) pad += 320 * dt;
    pad = Math.max(PW / 2, Math.min(W - PW / 2, pad));
    if (ball.stuck) {
      ball.x = pad;
      ball.y = H - 30;
      if (inp.pressed.fire || inp.pressed.up) launch();
      return;
    }
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    if (ball.x < 5 || ball.x > W - 5) {
      ball.vx = -ball.vx;
      ball.x = Math.max(5, Math.min(W - 5, ball.x));
    }
    if (ball.y < 5) {
      ball.vy = Math.abs(ball.vy);
      ball.y = 5;
    }
    if (ball.vy > 0 && ball.y > H - 26 && ball.y < H - 14 && Math.abs(ball.x - pad) < PW / 2 + 4) {
      const off = (ball.x - pad) / (PW / 2);
      const sp = Math.hypot(ball.vx, ball.vy) * 1.01;
      ball.vx = off * sp * 0.8;
      ball.vy = -Math.sqrt(Math.max(1, sp * sp - ball.vx * ball.vx));
    }
    for (const b of bricks) {
      if (!b.alive || ball.x < b.x - 4 || ball.x > b.x + BW + 4 || ball.y < b.y - 4 || ball.y > b.y + BH + 4) continue;
      b.alive = false;
      g.score += b.row === 0 ? 2 : 1;
      const fromSide = ball.x < b.x || ball.x > b.x + BW;
      if (fromSide) ball.vx = -ball.vx;
      else ball.vy = -ball.vy;
      break;
    }
    if (ball.y > H + 10) {
      g.lives -= 1;
      ball.stuck = true;
      if (g.lives <= 0) g.over = true;
    }
    if (!bricks.some((b) => b.alive)) {
      build();
      ball.stuck = true;
    }
  };
  g.draw = (ctx) => {
    clearScreen(ctx, '#0a0a12');
    const colors = ['#e06a5a', '#e0a84a', '#e8c35a', '#7cc47c', '#6fb3e0'];
    for (const b of bricks) {
      if (!b.alive) continue;
      ctx.fillStyle = colors[b.row];
      ctx.fillRect(b.x + 1, b.y, BW - 2, BH);
    }
    ctx.fillStyle = '#d8e8ff';
    ctx.fillRect(pad - PW / 2, H - 20, PW, 8);
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, 5, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, '♥'.repeat(Math.max(0, g.lives)), W - 10, 18, { align: 'right', color: '#e06a5a' });
    if (ball.stuck && !g.over) text(ctx, pickLang({ en: 'SPACE to launch', zh: '空格发球' }), W / 2, H - 60, { size: 12, color: '#9a978f' });
  };
  return g;
}

// ------------------------------------------------------------------------------------------ Block Stack
const SHAPES = [
  [[1, 1, 1, 1]],
  [
    [1, 1],
    [1, 1],
  ],
  [
    [0, 1, 0],
    [1, 1, 1],
  ],
  [
    [0, 1, 1],
    [1, 1, 0],
  ],
  [
    [1, 1, 0],
    [0, 1, 1],
  ],
  [
    [1, 0, 0],
    [1, 1, 1],
  ],
  [
    [0, 0, 1],
    [1, 1, 1],
  ],
];
const SHAPE_COLORS = ['#6fb3e0', '#e8c35a', '#c58be0', '#7cc47c', '#e06a5a', '#4a7ae0', '#e0a84a'];
const LINE_SCORE = [0, 10, 25, 45, 70];

function stack() {
  const COLS = 10;
  const ROWS = 16;
  const C = 20;
  const OX = (W - COLS * C) / 2;
  const g = { score: 0, over: false, lines: 0 };
  const board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  const rot = (m) => m[0].map((_, i) => m.map((row) => row[i]).reverse());
  const make = () => {
    const k = irnd(SHAPES.length);
    return { m: SHAPES[k], k, x: 3, y: 0 };
  };
  let cur = make();
  let nxt = make();
  let fall = 0;
  let rep = { left: 0, right: 0 };
  const fits = (p, x = p.x, y = p.y, m = p.m) =>
    m.every((row, dy) => row.every((v, dx) => !v || (x + dx >= 0 && x + dx < COLS && y + dy < ROWS && (y + dy < 0 || !board[y + dy][x + dx]))));
  const lock = () => {
    cur.m.forEach((row, dy) =>
      row.forEach((v, dx) => {
        if (v && cur.y + dy >= 0) board[cur.y + dy][cur.x + dx] = cur.k + 1;
      })
    );
    let n = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (board[y].every(Boolean)) {
        board.splice(y, 1);
        board.unshift(Array(COLS).fill(0));
        n++;
        y++;
      }
    }
    g.lines += n;
    g.score += LINE_SCORE[n] || 0;
    cur = nxt;
    nxt = make();
    if (!fits(cur)) g.over = true;
  };
  const move = (dx) => {
    if (fits(cur, cur.x + dx)) cur.x += dx;
  };
  g.update = (dt, inp) => {
    for (const k of ['left', 'right']) {
      if (inp.pressed[k]) {
        move(k === 'left' ? -1 : 1);
        rep[k] = 0.18;
      } else if (inp.held[k]) {
        rep[k] -= dt;
        if (rep[k] <= 0) {
          move(k === 'left' ? -1 : 1);
          rep[k] = 0.05;
        }
      }
    }
    if (inp.pressed.up) {
      const m = rot(cur.m);
      for (const kick of [0, -1, 1, -2, 2]) {
        if (fits(cur, cur.x + kick, cur.y, m)) {
          cur.m = m;
          cur.x += kick;
          break;
        }
      }
    }
    if (inp.pressed.fire) {
      while (fits(cur, cur.x, cur.y + 1)) cur.y++;
      lock();
      return;
    }
    const gravity = Math.max(0.1, 0.65 - g.lines * 0.03);
    fall += inp.held.down ? dt * 10 : dt;
    if (fall >= gravity) {
      fall = 0;
      if (fits(cur, cur.x, cur.y + 1)) cur.y++;
      else lock();
    }
  };
  const cell = (ctx, x, y, k) => {
    ctx.fillStyle = SHAPE_COLORS[k];
    ctx.fillRect(x + 1, y + 1, C - 2, C - 2);
  };
  g.draw = (ctx) => {
    clearScreen(ctx, '#07080c');
    ctx.fillStyle = '#12151b';
    ctx.fillRect(OX, 0, COLS * C, ROWS * C);
    board.forEach((row, y) => row.forEach((v, x) => v && cell(ctx, OX + x * C, y * C, v - 1)));
    cur.m.forEach((row, dy) => row.forEach((v, dx) => v && cell(ctx, OX + (cur.x + dx) * C, (cur.y + dy) * C, cur.k)));
    text(ctx, pickLang({ en: 'NEXT', zh: '下一个' }), OX + COLS * C + 50, 30, { size: 12, color: '#9a978f' });
    nxt.m.forEach((row, dy) => row.forEach((v, dx) => v && cell(ctx, OX + COLS * C + 24 + dx * C, 44 + dy * C, nxt.k)));
    text(ctx, `${pickLang({ en: 'LINES', zh: '行数' })} ${g.lines}`, OX + COLS * C + 50, 130, { size: 12, color: '#9a978f' });
  };
  return g;
}

// ------------------------------------------------------------------------------------------ Dead Run
function runner() {
  const GROUND = H - 40;
  const g = { score: 0, over: false };
  const p = { x: 70, y: GROUND, vy: 0 };
  let obs = [];
  let t = 0;
  let spawnIn = 1.2;
  let scroll = 0;
  g.update = (dt, inp) => {
    t += dt;
    const speed = Math.min(520, 230 + t * 5);
    scroll += speed * dt;
    const onGround = p.y >= GROUND;
    if ((inp.pressed.fire || inp.pressed.up) && onGround) p.vy = -470;
    p.vy += 1350 * dt;
    p.y = Math.min(GROUND, p.y + p.vy * dt);
    if (p.y >= GROUND) p.vy = 0;
    spawnIn -= dt;
    if (spawnIn <= 0) {
      const kind = irnd(3);
      obs.push({ x: W + 10, w: kind === 1 ? 18 : 24, h: kind === 1 ? 38 : kind === 2 ? 22 : 28, kind, passed: false });
      spawnIn = rnd(0.75, 1.6) * (300 / speed) + 0.35;
    }
    for (const o of obs) {
      o.x -= speed * dt;
      if (!o.passed && o.x + o.w < p.x - 10) {
        o.passed = true;
        g.score += 2;
      }
      if (p.x + 9 > o.x && p.x - 9 < o.x + o.w && p.y > GROUND - o.h) g.over = true;
    }
    obs = obs.filter((o) => o.x > -40);
  };
  g.draw = (ctx) => {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#2a1a24');
    sky.addColorStop(1, '#6a3a2a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1a1216';
    for (let i = 0; i < 9; i++) {
      const bx = ((i * 70 - scroll * 0.25) % 630 + 630) % 630 - 60;
      const bh = 50 + ((i * 37) % 70);
      ctx.fillRect(bx, GROUND - bh, 48, bh);
    }
    ctx.fillStyle = '#2c2a26';
    ctx.fillRect(0, GROUND, W, H - GROUND);
    for (const o of obs) {
      ctx.fillStyle = o.kind === 1 ? '#6f8a4a' : o.kind === 2 ? '#8a5a3a' : '#7a6a4a';
      ctx.fillRect(o.x, GROUND - o.h, o.w, o.h);
      if (o.kind === 1) {
        ctx.fillStyle = '#a2c26a';
        ctx.fillRect(o.x + 2, GROUND - o.h - 10, o.w - 4, 10);
      }
    }
    ctx.fillStyle = '#e8c9a0';
    ctx.fillRect(p.x - 5, p.y - 38, 10, 10);
    ctx.fillStyle = '#c9a36b';
    ctx.fillRect(p.x - 7, p.y - 28, 14, 18);
    ctx.fillStyle = '#3a3f46';
    const leg = Math.sin(t * 18) * 4;
    ctx.fillRect(p.x - 6 + (p.y < GROUND ? 0 : leg), p.y - 10, 5, 10);
    ctx.fillRect(p.x + 1 - (p.y < GROUND ? 0 : leg), p.y - 10, 5, 10);
  };
  return g;
}

export const FACTORIES = { snake, invaders, breakout, stack, runner };

const HELP = {
  snake: { en: 'Arrows / WASD to steer. +3 per can of food.', zh: '方向键/WASD 转向。每吃一罐 +3。' },
  invaders: { en: '← → to move, SPACE to shoot. Top rows score more.', zh: '← → 移动，空格射击。上排得分更高。' },
  breakout: { en: '← → to move the paddle, SPACE to launch.', zh: '← → 移动挡板，空格发球。' },
  stack: { en: '← → move, ↑ rotate, ↓ soft drop, SPACE hard drop. Lines: 10/25/45/70.', zh: '← → 移动，↑ 旋转，↓ 加速，空格落下。消行：10/25/45/70。' },
  runner: { en: 'SPACE / ↑ to jump over the dead. +2 per obstacle.', zh: '空格/↑ 跳过障碍。每越过一个 +2。' },
};

const KEYMAP = {
  ArrowLeft: 'left',
  a: 'left',
  A: 'left',
  ArrowRight: 'right',
  d: 'right',
  D: 'right',
  ArrowUp: 'up',
  w: 'up',
  W: 'up',
  ArrowDown: 'down',
  s: 'down',
  S: 'down',
  ' ': 'fire',
  Enter: 'fire',
};

// ------------------------------------------------------------------------------------------ panel
let session = null;

function stopSession() {
  if (!session) return;
  cancelAnimationFrame(session.raf);
  window.removeEventListener('keydown', session.onDown, true);
  window.removeEventListener('keyup', session.onUp, true);
  session = null;
}

registerPanel('tvgames', (ctx = {}) => {
  const state = game.state;
  if (!state) return;
  const f = ctx.furn != null ? state.furniture[ctx.furn] : null;
  if (f && f.powered === false) {
    toast(pickLang({ en: 'The TV has no power.', zh: '电视没有电。' }), 'bad');
    return;
  }
  const consoleId = consoleAtHome(state);
  if (!consoleId) {
    openWindow('tvgames', {
      title: `📺 ${pickLang({ en: 'TV', zh: '电视' })}`,
      width: 420,
      build: (body) => {
        body.appendChild(
          h(
            'div',
            { class: 'dim' },
            pickLang({
              en: `You need a game console to play on the TV. Keep a ${itemName(CONSOLE_IDS[1])} or a ${itemName(CONSOLE_IDS[0])} in your backpack or storage at home. The VIP counter before the disaster, the school and the hospital sometimes have one.`,
              zh: `需要游戏机才能在电视上玩。把${itemName(CONSOLE_IDS[1])}或${itemName(CONSOLE_IDS[0])}放在背包或家中的储物家具里。灾前商店的VIP柜台、学校和医院有时能找到。`,
            })
          )
        );
      },
    });
    return;
  }
  stopSession();
  const prevPause = state.ui.modalPause;
  state.ui.modalPause = true;
  const sel = { id: TV_GAMES.find((g) => g.id === ctx.game)?.id || TV_GAMES[1].id };
  let phase = 'idle';
  let current = null;
  const canvas = h('canvas', { width: W, height: H, tabindex: 0 });
  const g2d = canvas.getContext('2d');
  const listBox = h('div', { class: 'col', style: { width: '150px', gap: '4px' } });
  const boardBox = h('div', { class: 'col', style: { width: '180px', gap: '3px' } });
  const helpLine = h('div', { class: 'dim', style: { fontSize: '12px', minHeight: '16px', marginTop: '4px' } });
  const input = { held: {}, pressed: {} };

  const renderList = () => {
    clear(listBox);
    for (const g of TV_GAMES) {
      const best = game.history.tvBest?.[g.id] || 0;
      listBox.appendChild(
        h(
          'button',
          {
            class: sel.id === g.id ? 'primary' : '',
            style: { textAlign: 'left' },
            onclick: (e) => {
              e.currentTarget.blur();
              sel.id = g.id;
              phase = 'idle';
              current = null;
              renderList();
              renderBoard();
            },
          },
          `${g.icon} ${pickLang(g.name)}`,
          h('span', { class: best >= TV_ACHIEVEMENT_SCORE ? 'good' : 'dim', style: { float: 'right' } }, String(best))
        )
      );
    }
    listBox.appendChild(
      h(
        'div',
        { class: 'dim', style: { fontSize: '11px', marginTop: '6px' } },
        pickLang({
          en: `${itemName(consoleId)} connected. The first game each day: +${TV_MORALE} Morale${consoleId === 11002 ? ', +1 Max Morale, +3 Planning Points' : ''}.`,
          zh: `已连接${itemName(consoleId)}。每天第一局：心态+${TV_MORALE}${consoleId === 11002 ? '，心态上限+1，生存点+3' : ''}。`,
        })
      )
    );
    helpLine.textContent = pickLang(HELP[sel.id]);
  };

  const renderBoard = () => {
    clear(boardBox);
    boardBox.appendChild(h('div', { class: 'sec-title' }, pickLang({ en: 'High scores', zh: '排行榜' })));
    const rows = tvLeaderboard(sel.id, state.meta.character, game.history.tvBest?.[sel.id] || 0);
    rows.forEach((r, i) =>
      boardBox.appendChild(
        h(
          'div',
          { class: 'list-item', style: { padding: '3px 6px', fontSize: '12px', borderColor: r.you ? 'var(--accent)' : null } },
          h('span', { class: 'dim' }, `${i + 1}.`),
          h('span', { style: { flex: 1 } }, pickLang(r.name)),
          h('b', {}, String(r.score))
        )
      )
    );
  };

  const start = () => {
    current = FACTORIES[sel.id]();
    phase = 'play';
    canvas.focus();
  };

  const finish = () => {
    phase = 'over';
    const res = submitTvScore(state, game.history, sel.id, current.score);
    persistHistory();
    emit('tvScore', { game: sel.id, score: res.score, best: res.best, record: res.record });
    if (res.reward) {
      const extra = res.reward.max ? pickLang({ en: ', +1 Max Morale, +3 Planning Points', zh: '，心态上限+1，生存点+3' }) : '';
      toast(pickLang({ en: `A good round on the TV. +${Math.round(res.reward.mor)} Morale${extra}`, zh: `玩得挺开心。心态+${Math.round(res.reward.mor)}${extra}` }), 'good');
    }
    if (res.record) toast(pickLang({ en: `New high score: ${res.score}`, zh: `新纪录：${res.score}` }), 'good');
    renderList();
    renderBoard();
  };

  const overlay = (lines) => {
    g2d.fillStyle = 'rgba(0, 0, 0, 0.6)';
    g2d.fillRect(0, 0, W, H);
    lines.forEach(([s, opts], i) => text(g2d, s, W / 2, H / 2 - 20 + i * 26, opts));
  };

  let last = performance.now();
  const frame = (now) => {
    if (!session) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const meta = TV_GAMES.find((g) => g.id === sel.id);
    if (phase === 'play') {
      current.update(dt, input);
      if (current.over) finish();
    }
    input.pressed = {};
    if (current) current.draw(g2d);
    else clearScreen(g2d);
    if (current) text(g2d, `${current.score}`, 10, 18, { align: 'left', bold: true, color: '#e8c35a' });
    if (phase === 'idle') {
      overlay([
        [`${meta.icon} ${pickLang(meta.name)}`, { size: 22, bold: true, color: '#e0a84a' }],
        [pickLang(HELP[sel.id]), { size: 11, color: '#cfcac0' }],
        [pickLang({ en: 'Press SPACE to start', zh: '按空格开始' }), { size: 14 }],
      ]);
    } else if (phase === 'over') {
      overlay([
        [pickLang({ en: 'GAME OVER', zh: '游戏结束' }), { size: 24, bold: true, color: '#e06a5a' }],
        [`${pickLang({ en: 'Score', zh: '得分' })} ${current.score}`, { size: 16 }],
        [pickLang({ en: 'SPACE to play again', zh: '按空格再来一局' }), { size: 13, color: '#cfcac0' }],
      ]);
    }
    session.raf = requestAnimationFrame(frame);
  };

  const onDown = (e) => {
    const k = KEYMAP[e.key];
    if (!k) return;
    e.preventDefault();
    if (!e.repeat) input.pressed[k] = true;
    input.held[k] = true;
    if (k === 'fire' && !e.repeat && phase !== 'play') {
      input.pressed = {};
      start();
    }
  };
  const onUp = (e) => {
    const k = KEYMAP[e.key];
    if (!k) return;
    e.preventDefault();
    input.held[k] = false;
  };

  openWindow('tvgames', {
    title: `📺 ${pickLang({ en: 'TV Games', zh: '电视游戏' })}`,
    width: 880,
    modal: true,
    className: 'minigame',
    onClose: () => {
      stopSession();
      state.ui.modalPause = prevPause || false;
    },
    build: (body) => {
      renderList();
      renderBoard();
      body.appendChild(
        h(
          'div',
          { class: 'row' },
          listBox,
          h(
            'div',
            { class: 'col', style: { alignItems: 'center' } },
            canvas,
            helpLine,
            h(
              'div',
              { class: 'row' },
              h(
                'button',
                {
                  class: 'primary',
                  onclick: (e) => {
                    e.currentTarget.blur();
                    start();
                  },
                },
                pickLang({ en: 'Start (Space)', zh: '开始（空格）' })
              ),
              h('button', { onclick: () => closeWindow('tvgames') }, pickLang({ en: 'Turn off (Esc)', zh: '关掉（Esc）' }))
            )
          ),
          boardBox
        )
      );
    },
  });
  session = { raf: requestAnimationFrame(frame), onDown, onUp };
  window.addEventListener('keydown', onDown, true);
  window.addEventListener('keyup', onUp, true);
});
