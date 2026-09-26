// Isometric canvas renderer for the safehouse, shops and exploration sites.
import { CELL, cellAt } from '../sim/scene.js';
import { furn, SLOT, ELEC } from '../data/db.js';
import { SCENERY } from '../content/homes.js';
import { daylight } from '../sim/time.js';

export const TW = 64;
export const TH = 32;
const WALL_H = 58;

export function isoToScreen(x, y) {
  return [(x - y) * (TW / 2), (x + y) * (TH / 2)];
}

export function screenToIso(sx, sy) {
  const x = (sx / (TW / 2) + sy / (TH / 2)) / 2;
  const y = (sy / (TH / 2) - sx / (TW / 2)) / 2;
  return [x, y];
}

function shade(color, f) {
  const m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(color);
  const n = m ? (+m[1] << 16) | (+m[2] << 8) | +m[3] : parseInt(color.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r * f)));
  g = Math.max(0, Math.min(255, Math.round(g * f)));
  b = Math.max(0, Math.min(255, Math.round(b * f)));
  return `rgb(${r},${g},${b})`;
}

// Colors and heights by furniture family.
export function furnitureLook(f) {
  if (typeof f.cfg === 'string') {
    const d = SCENERY[f.cfg];
    return { color: d.color || '#777', h: (d.h || 0.6) * 40, glyph: glyphFor(f.cfg) };
  }
  const d = furn(f.cfg);
  if (!d) return { color: '#888', h: 20, glyph: '?' };
  const zh = d.zh;
  let color = '#8b7d6b';
  let h = 26;
  let glyph = '';
  if (d.slot === SLOT.DOOR) return { color: '#6b4a2f', h: 50, glyph: '', door: true };
  if (d.slot === SLOT.WINDOW) return { color: '#8fb4c9', h: 30, glyph: '', window: true };
  if (d.slot === SLOT.DEFENSE) {
    if (zh.includes('沙包')) return { color: '#a58f63', h: 14, glyph: '▦' };
    if (zh.includes('尖刺')) return { color: '#8a8f96', h: 16, glyph: '✶' };
    if (zh.includes('电网')) return { color: '#c9b43a', h: 20, glyph: '⚡' };
    if (zh.includes('电锯')) return { color: '#b5443a', h: 22, glyph: '⚙' };
  }
  if (d.plant) return { color: d.elec ? '#5d7f6e' : '#9a6b4b', h: 14, glyph: '', planter: true };
  if (d.cook) {
    color = '#9aa3a8';
    h = d.slot === SLOT.TABLETOP ? 14 : 34;
    glyph = '♨';
  } else if (d.elec === ELEC.SOLAR) {
    color = '#2f4f7a';
    h = 10;
    glyph = '☀';
  } else if (d.elec === ELEC.FUEL_GEN || d.elec === ELEC.MANUAL_GEN) {
    color = '#b8862b';
    h = 28;
    glyph = '⛽';
  } else if (d.elec === ELEC.BATTERY) {
    color = '#3e8e5a';
    h = 24;
    glyph = '▮';
  } else if (d.elec === ELEC.RAT_GEN) {
    color = '#8c7a5c';
    h = 22;
    glyph = '◎';
  } else if (d.slot === SLOT.BED) {
    color = '#6d7fa3';
    h = 14;
    glyph = '';
  } else if (zh.includes('冰箱') || zh.includes('冰柜')) {
    color = '#dfe6ea';
    h = d.slot === SLOT.LARGE ? 24 : 46;
    glyph = '❄';
  } else if (zh.includes('置物架') || zh.includes('柜') || zh.includes('箱')) {
    color = '#9c7b55';
    h = 40;
    glyph = '▤';
  } else if (zh.includes('沙发') || zh.includes('按摩椅')) {
    color = '#7b5c7e';
    h = 18;
  } else if (zh.includes('电视') || zh.includes('唱片')) {
    color = '#2c2c2c';
    h = 18;
    glyph = '▶';
  } else if (zh.includes('马桶') || zh.includes('水池') || zh.includes('浴缸')) {
    color = '#e5eef2';
    h = zh.includes('浴缸') ? 14 : 18;
  } else if (zh.includes('桌') || zh.includes('台') || zh.includes('几')) {
    color = '#a07b52';
    h = 16;
  } else if (zh.includes('空调') || zh.includes('暖') || zh.includes('电暖')) {
    color = '#d9d4c8';
    h = 30;
    glyph = '♒';
  }
  if (d.slot === SLOT.WALL) return { color, h: 20, glyph, wall: true };
  if (d.slot === SLOT.TABLETOP) h = Math.min(h, 16);
  return { color, h, glyph };
}

function glyphFor(key) {
  return { workbench: '⚒', radio: '📻', newspapers: '▤', woodpile: '▥', junkpile: '▩', rubble: '▩' }[key] || '';
}

export class IsoRenderer {
  constructor(canvas) {
    this.flashUntil = 0;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0, y: 0, zoom: 1, follow: true };
    this.hover = null;
    this.highlight = new Set();
    this.particles = [];
    this.dpr = 1;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
  }

  // world tile -> canvas pixel
  toCanvas(x, y) {
    const [sx, sy] = isoToScreen(x, y);
    const z = this.cam.zoom * this.dpr;
    return [(sx - this.cam.x) * z + this.canvas.width / 2, (sy - this.cam.y) * z + this.canvas.height / 2];
  }

  // canvas client px -> world tile (float)
  toWorld(cx, cy) {
    const z = this.cam.zoom * this.dpr;
    let dx = cx * this.dpr - this.canvas.width / 2;
    let dy = cy * this.dpr - this.canvas.height / 2;
    const rot = this.cam.swivel || 0;
    if (Math.abs(rot) > 0.001) {
      const c = Math.cos(-rot);
      const s = Math.sin(-rot);
      [dx, dy] = [c * dx - s * dy, s * dx + c * dy];
    }
    return screenToIso(dx / z + this.cam.x, dy / z + this.cam.y);
  }

  centerOn(x, y) {
    const [sx, sy] = isoToScreen(x, y);
    this.cam.x = sx;
    this.cam.y = sy;
  }

  // view: { floor (grid), furniture[], entities[], boxes[], clock, weather, lights, labels, dimmed }
  draw(view) {
    const { ctx, canvas } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = view.bg || '#15171a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const z = this.cam.zoom * this.dpr;
    const rot = this.cam.swivel || 0;
    if (Math.abs(rot) > 0.001) {
      const cw = canvas.width / 2;
      const ch = canvas.height / 2;
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      // rotate around the screen center, then apply the world camera
      ctx.setTransform(c * z, s * z, -s * z, c * z, cw - (c * this.cam.x - s * this.cam.y) * z, ch - (s * this.cam.x + c * this.cam.y) * z);
    } else {
      ctx.setTransform(z, 0, 0, z, canvas.width / 2 - this.cam.x * z, canvas.height / 2 - this.cam.y * z);
    }
    const fl = view.floor;
    if (!fl) return;
    // ground
    for (let y = 0; y < fl.h; y++) {
      for (let x = 0; x < fl.w; x++) {
        const c = cellAt(fl, x, y);
        if (c === CELL.VOID || c === CELL.WALL || c === CELL.WINDOW) continue;
        this.tile(x, y, this.groundColor(c, x, y, view), view.locked?.(x, y));
      }
    }
    for (const s of view.slots || []) {
      const pts = [isoToScreen(s.x, s.y), isoToScreen(s.x + s.w, s.y), isoToScreen(s.x + s.w, s.y + s.h), isoToScreen(s.x, s.y + s.h)];
      this.ctx.lineWidth = s.valid ? 2.5 : 1;
      this.poly(pts, s.valid ? 'rgba(255,209,102,0.25)' : s.free ? 'rgba(255,255,255,0.06)' : null, s.valid ? '#ffd166' : s.free ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)');
    }
    // back walls first (row 0 and column 0), then depth-sorted objects
    const objs = [];
    for (let y = 0; y < fl.h; y++) {
      for (let x = 0; x < fl.w; x++) {
        const c = cellAt(fl, x, y);
        if (c === CELL.WALL || c === CELL.WINDOW || c === CELL.DOOR) objs.push({ d: x + y + 0.5, t: 'wall', x, y, c });
      }
    }
    for (const f of view.furniture || []) objs.push({ d: f.x + f.y + (f.w || 1) + (f.h || 1) - 1, t: 'furn', f });
    for (const b of view.boxes || []) objs.push({ d: b.x + b.y + 1.2, t: 'box', b });
    for (const e of view.entities || []) objs.push({ d: e.x + e.y + 1.3, t: 'ent', e });
    objs.sort((a, b) => a.d - b.d);
    for (const o of objs) {
      if (o.t === 'wall') this.wall(fl, o.x, o.y, o.c, view);
      else if (o.t === 'furn') this.furniture(o.f, view);
      else if (o.t === 'box') this.box(o.b);
      else this.entity(o.e);
    }
    for (const fire of view.fires || []) this.fire(fire);
    // labels & overlays in screen space
    this.lighting(view);
    this.weather(view);
  }

  groundColor(c, x, y, view) {
    const checker = (x + y) % 2 === 0;
    if (c === CELL.YARD) return checker ? '#3b3d3f' : '#37393b';
    if (c === CELL.OUTDOOR) return checker ? '#6f6a5c' : '#6a6557';
    if (c === CELL.STAIRS_UP || c === CELL.STAIRS_DOWN) return '#5b4632';
    if (c === CELL.DOOR) return '#4b3b2b';
    const room = view.roomAt?.(x, y);
    if (room?.id?.includes('bath')) return checker ? '#b9c3c7' : '#b3bdc1';
    if (room?.id?.includes('kitchen')) return checker ? '#c2b59b' : '#bcaf95';
    if (room?.cold) return checker ? '#9fb4c2' : '#99aebc';
    if (view.basement) return checker ? '#5f5b55' : '#5a5650';
    return checker ? '#8a6e4f' : '#84694b';
  }

  poly(points, fill, stroke) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  tile(x, y, color, locked) {
    const a = isoToScreen(x, y);
    const b = isoToScreen(x + 1, y);
    const c = isoToScreen(x + 1, y + 1);
    const d = isoToScreen(x, y + 1);
    this.poly([a, b, c, d], locked ? '#2a2a2a' : color, 'rgba(0,0,0,0.12)');
    if (this.hover && this.hover.tile && this.hover.x === x && this.hover.y === y) this.poly([a, b, c, d], 'rgba(255,255,255,0.18)');
  }

  wall(fl, x, y, c, view) {
    const front = x === fl.w - 1 || y === fl.innerH - 1 || cellAt(fl, x + 1, y) === CELL.YARD || cellAt(fl, x, y + 1) === CELL.YARD;
    const h = front ? 16 : WALL_H;
    const color = c === CELL.WINDOW ? '#7aa6bf' : c === CELL.DOOR ? '#5a4030' : view.basement ? '#56524c' : '#a89b88';
    if (c === CELL.DOOR) {
      this.block(x, y, 1, 1, 4, '#3a2c20');
      return;
    }
    this.block(x, y, 1, 1, h, color, front ? 0.55 : 1);
    if (c === CELL.WINDOW) {
      const [sx, sy] = isoToScreen(x + 0.5, y + 0.5);
      this.ctx.fillStyle = 'rgba(200,230,255,0.55)';
      this.ctx.fillRect(sx - 8, sy - h + 8, 16, Math.max(6, h - 20));
    }
  }

  block(x, y, w, d, h, color, alpha = 1) {
    const { ctx } = this;
    ctx.globalAlpha = alpha;
    const p1 = isoToScreen(x, y + d);
    const p2 = isoToScreen(x + w, y + d);
    const p3 = isoToScreen(x + w, y);
    const p0 = isoToScreen(x, y);
    const up = (p) => [p[0], p[1] - h];
    // left face (along y) and right face (along x)
    this.poly([p1, p2, up(p2), up(p1)], shade(color, 0.72));
    this.poly([p2, p3, up(p3), up(p2)], shade(color, 0.86));
    this.poly([up(p0), up(p3), up(p2), up(p1)], shade(color, 1.05), 'rgba(0,0,0,0.25)');
    ctx.globalAlpha = 1;
  }

  furniture(f) {
    const look = furnitureLook(f);
    const w = f.w || 1;
    const d = f.h || 1;
    const hovered = this.hover?.furn === f.uid;
    const hl = this.highlight.has(f.uid);
    if (look.door || look.window || f.w === 0) {
      // drawn onto the wall tile; wall decor sits on the room-facing side of a back wall
      const onLeftWall = f.x === 0;
      const [sx, sy] = look.door || look.window ? isoToScreen(f.x + 0.5, f.y + 0.5) : onLeftWall ? isoToScreen(f.x + 1, f.y + 0.5) : isoToScreen(f.x + 0.5, f.y + 1);
      const hpFrac = f.maxHp ? f.hp / (f.maxHp + (f.reinforce || 0)) : 1;
      const h = look.door ? 46 : look.window ? 28 : 18;
      this.ctx.fillStyle = look.color;
      this.ctx.fillRect(sx - 10, sy - h - (look.window ? 14 : 2), 20, h);
      if (hovered || hl) {
        this.ctx.strokeStyle = hl ? '#ffd166' : '#fff';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(sx - 11, sy - h - (look.window ? 15 : 3), 22, h + 2);
      }
      if (look.door || look.window) {
        this.ctx.fillStyle = '#300';
        this.ctx.fillRect(sx - 12, sy + 2, 24, 4);
        this.ctx.fillStyle = hpFrac > 0.5 ? '#6fcf6f' : hpFrac > 0.25 ? '#e0b64a' : '#e05a4a';
        this.ctx.fillRect(sx - 12, sy + 2, 24 * Math.max(0, hpFrac), 4);
      }
      if (look.glyph) this.glyph(sx, sy - h, look.glyph);
      if (f.data?.breached) this.glyph(sx, sy - h / 2, '✖', '#ff4a3a');
      return;
    }
    let color = look.color;
    if (f.broken) color = shade(color, 0.6);
    this.block(f.x + 0.08, f.y + 0.08, w - 0.16, d - 0.16, look.h, color);
    const [cx, cy] = isoToScreen(f.x + w / 2, f.y + d / 2);
    if (look.planter && f.data?.plant) this.plant(cx, cy - look.h, f.data.plant);
    else if (look.planter && f.data?.soil === 'tilled') {
      this.ctx.fillStyle = '#5a3d24';
      this.ctx.beginPath();
      this.ctx.ellipse(cx, cy - look.h, 9 * w, 4 * d, 0, 0, Math.PI * 2);
      this.ctx.fill();
    }
    if (look.glyph) this.glyph(cx, cy - look.h - 6, look.glyph);
    if (f.powered === false && look.glyph) this.glyph(cx + 10, cy - look.h - 14, '✖', '#e05a4a');
    if (f.data?.cooking || f.data?.crafting) this.glyph(cx - 12, cy - look.h - 14, '⏳', '#ffd166');
    if (hovered || hl) {
      const p0 = isoToScreen(f.x, f.y);
      const p1 = isoToScreen(f.x + w, f.y);
      const p2 = isoToScreen(f.x + w, f.y + d);
      const p3 = isoToScreen(f.x, f.y + d);
      const up = (p) => [p[0], p[1] - look.h];
      this.ctx.lineWidth = 2;
      this.poly([up(p0), up(p1), up(p2), up(p3)], null, hl ? '#ffd166' : '#ffffff');
    }
    if (f.exclaim) this.glyph(cx, cy - look.h - 26, '❗', '#ffd166');
  }

  fire(fire) {
    const { ctx } = this;
    const [sx, sy] = isoToScreen(fire.x + 0.5, fire.y + 0.5);
    const r = (fire.r || 1) * 22;
    const flicker = 0.85 + Math.random() * 0.3;
    const g = ctx.createRadialGradient(sx, sy - 8, 2, sx, sy - 8, r * flicker);
    g.addColorStop(0, 'rgba(255,230,120,0.95)');
    g.addColorStop(0.4, 'rgba(255,120,30,0.7)');
    g.addColorStop(1, 'rgba(160,30,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(sx, sy - 8, r * flicker, r * 0.7 * flicker, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  plant(cx, cy, p) {
    const stage = Math.min(4, Math.floor((p.growth || 0) * 4));
    const color = p.withered ? '#6b5a3a' : p.ready ? '#e7c04a' : '#4f9a4a';
    const size = 3 + stage * 3;
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.ellipse(cx, cy - size, size, size * 0.8, 0, 0, Math.PI * 2);
    this.ctx.fill();
    if (p.pest || p.weed || p.dry) this.glyph(cx + 8, cy - size - 6, p.pest ? '🐛' : p.weed ? '🌿' : '💧');
  }

  box(b) {
    const hl = this.highlight.has(`box:${b.id}`);
    this.block(b.x + 0.25, b.y + 0.25, 0.5, 0.5, 10, hl ? '#ffd166' : '#b08a58');
    if (b.id != null && this.hover?.box === b.id) {
      const up = (x, y) => {
        const [sx, sy] = isoToScreen(x, y);
        return [sx, sy - 10];
      };
      this.ctx.lineWidth = 2;
      this.poly([up(b.x + 0.25, b.y + 0.25), up(b.x + 0.75, b.y + 0.25), up(b.x + 0.75, b.y + 0.75), up(b.x + 0.25, b.y + 0.75)], null, '#ffffff');
    }
  }

  entity(e) {
    const { ctx } = this;
    const [sx, sy] = isoToScreen(e.x + 0.5, e.y + 0.5);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(sx, sy, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    const h = e.kind === 'big' ? 46 : 34;
    ctx.fillStyle = e.color || '#d0b48c';
    ctx.fillRect(sx - 6, sy - h + 10, 12, h - 12);
    ctx.beginPath();
    ctx.arc(sx, sy - h + 6, 6, 0, Math.PI * 2);
    ctx.fillStyle = e.head || '#e8c9a0';
    ctx.fill();
    if (e.sleeping) this.glyph(sx + 10, sy - h, 'z', '#cfe');
    if (e.hp != null && e.maxHp) {
      ctx.fillStyle = '#300';
      ctx.fillRect(sx - 10, sy - h - 6, 20, 3);
      ctx.fillStyle = '#e05a4a';
      ctx.fillRect(sx - 10, sy - h - 6, 20 * (e.hp / e.maxHp), 3);
    }
    if (e.label) {
      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(e.label, sx, sy - h - 10);
    }
  }

  glyph(x, y, g, color = '#fff') {
    const { ctx } = this;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.fillText(g, x, y);
  }

  lighting(view) {
    if (!view.clock) return;
    const { ctx, canvas } = this;
    const dl = view.indoorDark ? 0.35 : daylight(view.clock);
    const dark = Math.max(0, 0.62 * (1 - dl) - (view.lightsOn ? 0.28 : 0));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (dark > 0.01) {
      ctx.fillStyle = `rgba(8,12,30,${dark.toFixed(3)})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (view.flashlight) {
      const [px, py] = this.toCanvas(view.flashlight.x + 0.5, view.flashlight.y + 0.5);
      const r = 220 * this.dpr * this.cam.zoom;
      const g = ctx.createRadialGradient(px, py, r * 0.2, px, py, r);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.85)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  lightning(ms = 220) {
    this.flashUntil = performance.now() + ms;
  }

  weather(view) {
    const w = view.weather;
    if (!w || view.noWeather) return;
    const { ctx, canvas } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const kind = w.kind;
    const heavy = kind === 'heavyRain' || kind === 'storm';
    const n = kind === 'rain' ? 80 : heavy ? 180 : kind === 'snow' || kind === 'coldWave' || kind === 'freezingRain' ? 120 : 0;
    while (this.particles.length < n) {
      this.particles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, v: 0.5 + Math.random() });
    }
    this.particles.length = n;
    const snow = kind === 'snow' || kind === 'coldWave';
    ctx.strokeStyle = snow ? 'rgba(255,255,255,0.8)' : 'rgba(170,200,255,0.5)';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const p of this.particles) {
      p.y += (snow ? 1.2 : 9) * p.v * this.dpr;
      p.x += (snow ? Math.sin(p.y / 30) * 0.6 : -2) * this.dpr;
      if (p.y > canvas.height) {
        p.y = -10;
        p.x = Math.random() * canvas.width;
      }
      if (snow) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6 * this.dpr, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - 3 * this.dpr, p.y + 12 * this.dpr);
        ctx.stroke();
      }
    }
    const flash = this.flashUntil - performance.now();
    if (kind === 'storm' && flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${(0.4 * Math.min(1, flash / 120)).toFixed(3)})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (kind === 'cloudy' || heavy) {
      ctx.fillStyle = 'rgba(40,45,55,0.18)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  // hit test: the furniture or floor box under a world position (uses footprint and wall tiles). At most one of
  // `furn` / `box` is set: whichever is drawn in front.
  pick(view, wx, wy) {
    const tx = Math.floor(wx);
    const ty = Math.floor(wy);
    let best = null;
    for (const f of view.furniture || []) {
      const w = f.w || 1;
      const d = f.h || 1;
      // allow clicking the raised top: shift test point up-left a bit
      for (const [ox, oy] of [
        [0, 0],
        [0.6, 0.6],
      ]) {
        const x = wx + ox;
        const y = wy + oy;
        if (x >= f.x && x < f.x + w && y >= f.y && y < f.y + d) {
          if (!best || f.x + f.y > best.x + best.y) best = f;
        }
      }
    }
    let box = null;
    for (const b of view.boxes || []) {
      if (b.id == null) continue;
      // the box is low, so only a small lift for its top
      const hit = [
        [0, 0],
        [0.25, 0.25],
      ].some(([ox, oy]) => Math.floor(wx + ox) === b.x && Math.floor(wy + oy) === b.y);
      if (hit && (!box || b.x + b.y > box.x + box.y)) box = b;
    }
    if (box && best && box.x + box.y + 1.2 < best.x + best.y + (best.w || 1) + (best.h || 1) - 1) box = null;
    return { furn: box ? null : best, box, tile: [tx, ty] };
  }
}
