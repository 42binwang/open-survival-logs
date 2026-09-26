// @ts-check
// Screen-facing overlays the Canvas renderer draws in 2D: Planning Mode slot outlines on the floor, and status
// markers over furniture (something to notice, cooking or crafting under way, no power).
import * as THREE from 'three';
import { furn, plant } from '../data/db.js';
import { loc } from '../engine/i18n.js';

/** Counts finished web-font loads (the UI faces, src/ui/kit/fonts.css): a label drawn before its face arrived is
 * redrawn once it has. */
let fontLoads = 0;
if (typeof document !== 'undefined' && document.fonts) document.fonts.addEventListener('loadingdone', () => void fontLoads++);

/**
 * A floating label: optional text over an optional bar, drawn on a canvas sprite that is redrawn only when its
 * content (or a loaded font) changes. World-sized so it reads at the camera's distance; always drawn on top.
 */
class Label {
  constructor() {
    this.canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    this.key = '';
    const tex = this.canvas ? new THREE.CanvasTexture(this.canvas) : null;
    if (tex) tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, toneMapped: false, transparent: true }));
    this.sprite.renderOrder = 31;
  }

  /**
   * @param {string} text
   * @param {number | null} bar  0 … 1, or null for none
   * @param {string} barColor
   */
  set(text, bar, barColor = '#6fcf6f') {
    const key = `${text}|${bar == null ? '' : Math.round(bar * 50)}|${barColor}|${fontLoads}`;
    if (key === this.key || !this.canvas) return;
    this.key = key;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const font = '600 26px "Noto Sans", "Noto Sans SC", system-ui, sans-serif';
    ctx.font = font;
    const tw = text ? Math.ceil(ctx.measureText(text).width) : 0;
    const w = Math.max(bar != null ? 120 : 0, tw + 20);
    const h = (text ? 34 : 0) + (bar != null ? 16 : 0) + 4;
    this.canvas.width = w;
    this.canvas.height = h;
    ctx.font = font;
    if (text) {
      ctx.fillStyle = 'rgba(12,13,12,0.62)';
      ctx.beginPath();
      ctx.roundRect(0, 0, w, 34, 8);
      ctx.fill();
      ctx.fillStyle = '#f2ede2';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, 18);
    }
    if (bar != null) {
      const y = text ? 38 : 2;
      ctx.fillStyle = 'rgba(10,10,10,0.8)';
      ctx.fillRect(w / 2 - 58, y, 116, 12);
      ctx.fillStyle = barColor;
      ctx.fillRect(w / 2 - 56, y + 2, 112 * Math.max(0, Math.min(1, bar)), 8);
    }
    const map = /** @type {THREE.SpriteMaterial} */ (this.sprite.material).map;
    if (map) {
      map.dispose();
      const tex = new THREE.CanvasTexture(this.canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      /** @type {THREE.SpriteMaterial} */ (this.sprite.material).map = tex;
    }
    // 0.0035 m per canvas pixel: a 26 px line of text stands about 9 cm tall in the world
    this.sprite.scale.set(w * 0.0035, h * 0.0035, 1);
  }
}

/** Remaining growth as the source prints it: '2D 07:45', or '07:45' under a day. @param {number} sec */
function growLeft(sec) {
  const s = Math.max(0, Math.round(sec));
  const d = Math.floor(s / 86400);
  const hh = String(Math.floor((s % 86400) / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  return d > 0 ? `${d}D ${hh}:${mm}` : `${hh}:${mm}`;
}

/** @type {Map<string, THREE.SpriteMaterial>} */
const GLYPHS = new Map();

/**
 * A sprite material showing one glyph in a round badge.
 * @param {string} glyph
 * @param {string} color
 * @param {string} bg
 */
function glyphMaterial(glyph, color, bg) {
  const key = `${glyph}|${color}|${bg}`;
  let m = GLYPHS.get(key);
  if (m) return m;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = 'bold 40px "Noto Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, 32, 35);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  m = new THREE.SpriteMaterial({ map: tex, depthTest: false, toneMapped: false, transparent: true });
  GLYPHS.set(key, m);
  return m;
}

export class Overlays {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'overlays';
    this.group.renderOrder = 20;
    scene.add(this.group);
    this.slotKey = '';
    this.slotGroup = new THREE.Group();
    this.group.add(this.slotGroup);
    this.markers = new THREE.Group();
    this.group.add(this.markers);
    /** @type {THREE.Sprite[]} */
    this.pool = [];
    /** @type {THREE.Mesh[]} */
    this.flames = [];
    /** @type {Map<string, Label>} */
    this.labels = new Map();
    /** @type {THREE.Sprite[]} */
    this.smoke = [];
    /** @type {THREE.SpriteMaterial | null} */
    this.smokeMat = null;
    this.labelGroup = new THREE.Group();
    this.group.add(this.labelGroup);
    this.flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.6, 0.4), transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
    this.hasDocument = typeof document !== 'undefined';
  }

  /**
   * @param {import('../contracts/view.js').SceneView} view
   * @param {(uid: string | number) => THREE.Object3D | null} objectOf
   * @param {number} t
   */
  update(view, objectOf, t) {
    // Planning Mode: slot outlines
    const slots = view.slots || [];
    const key = slots.map((s) => `${s.x},${s.y},${s.w},${s.h},${s.free ? 1 : 0}${s.valid ? 1 : 0}`).join('|');
    if (key !== this.slotKey) {
      this.slotKey = key;
      for (const c of [...this.slotGroup.children]) {
        this.slotGroup.remove(c);
        /** @type {THREE.Mesh | THREE.LineSegments} */ (c).geometry.dispose();
      }
      for (const s of slots) {
        const color = s.valid ? 0xffd166 : 0xffffff;
        const fill = new THREE.Mesh(new THREE.PlaneGeometry(s.w - 0.06, s.h - 0.06).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: s.valid ? 0.25 : s.free ? 0.07 : 0.02, depthWrite: false, toneMapped: false }));
        fill.position.set(s.x + s.w / 2, 0.02, s.y + s.h / 2);
        this.slotGroup.add(fill);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(s.w - 0.06, s.h - 0.06).rotateX(-Math.PI / 2)), new THREE.LineBasicMaterial({ color, transparent: true, opacity: s.valid ? 1 : s.free ? 0.45 : 0.15, toneMapped: false }));
        edges.position.copy(fill.position);
        this.slotGroup.add(edges);
      }
    }
    // fires on the ground (molotovs): flickering additive cones, lit by the lighting's fire lights
    const fires = view.fires || [];
    while (this.flames.length < fires.length * 5) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.6, 8, 1, true).translate(0, 0.3, 0), this.flameMat);
      this.group.add(f);
      this.flames.push(f);
    }
    this.flames.forEach((m, i) => {
      const fire = fires[Math.floor(i / 5)];
      m.visible = !!fire;
      if (!fire) return;
      const k = i % 5;
      const r = (fire.r || 1) * 0.6;
      const a = k * 1.2566 + t * 0.7;
      m.position.set(fire.x + 0.5 + Math.cos(a) * r * (k ? 0.6 : 0), 0, fire.y + 0.5 + Math.sin(a) * r * (k ? 0.6 : 0));
      const s = (k ? 0.7 : 1.2) * (0.8 + 0.4 * Math.abs(Math.sin(t * 9 + k * 2.1)));
      m.scale.set(s, s * (1 + 0.3 * Math.sin(t * 13 + k)), s);
    });
    // smoke rising off each fire: soft puffs that climb, swell and fade on a loop
    if (this.hasDocument) {
      if (!this.smokeMat) {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const ctx = c.getContext('2d');
        if (ctx) {
          const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
          grad.addColorStop(0, 'rgba(70,66,62,0.55)');
          grad.addColorStop(1, 'rgba(70,66,62,0)');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, 64, 64);
        }
        const tex = new THREE.CanvasTexture(c);
        this.smokeMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      }
      while (this.smoke.length < fires.length * 6) {
        const sp = new THREE.Sprite(/** @type {THREE.SpriteMaterial} */ (this.smokeMat).clone());
        this.group.add(sp);
        this.smoke.push(sp);
      }
      this.smoke.forEach((sp, i) => {
        const fire = fires[Math.floor(i / 6)];
        sp.visible = !!fire;
        if (!fire) return;
        const phase = (t * 0.35 + (i % 6) / 6) % 1;
        sp.position.set(fire.x + 0.5 + Math.sin(i * 2.3 + t * 0.5) * 0.3 * phase, 0.6 + phase * 3.2, fire.y + 0.5 + Math.cos(i * 1.7) * 0.2 * phase);
        const size = 0.5 + phase * 1.6;
        sp.scale.set(size, size, 1);
        /** @type {THREE.SpriteMaterial} */ (sp.material).opacity = (1 - phase) * Math.min(1, phase * 6) * 0.8;
      });
    }
    if (!this.hasDocument) return;

    // status markers over furniture
    let n = 0;
    const box = new THREE.Box3();
    for (const f of view.furniture || []) {
      /** @type {[string, string, string][]} */
      const marks = [];
      if (f.exclaim) marks.push(['!', '#1a1408', '#ffd166']);
      if (f.data?.cooking || f.data?.crafting) marks.push(['⏳', '#1a1408', '#ffe9b0']);
      // no power: only on electric pieces, as the Canvas renderer marks them
      if (f.powered === false && typeof f.cfg === 'number' && furn(f.cfg)?.elec) marks.push(['⚡', '#ffffff', '#c93b26']);
      if (!marks.length) continue;
      const obj = objectOf(f.uid);
      if (!obj) continue;
      box.setFromObject(obj);
      const top = Math.max(1.2, box.max.y) + 0.35;
      marks.forEach(([g, c, bg], i) => {
        let spr = this.pool[n];
        if (!spr) {
          spr = new THREE.Sprite();
          spr.renderOrder = 30;
          this.pool.push(spr);
          this.markers.add(spr);
        }
        spr.material = glyphMaterial(g, c, bg);
        spr.visible = true;
        const bob = g === '!' ? Math.sin(t * 4) * 0.05 : 0;
        spr.position.set((box.min.x + box.max.x) / 2 + (i - (marks.length - 1) / 2) * 0.42, top + bob, (box.min.z + box.max.z) / 2);
        spr.scale.set(0.38, 0.38, 1);
        n++;
      });
    }
    for (let i = n; i < this.pool.length; i++) this.pool[i].visible = false;
    this.#labels(view, objectOf, box);
  }

  /**
   * In-world feedback: the survivor's work progress, name tags, crop names with their growth.
   * @param {import('../contracts/view.js').SceneView} view
   * @param {(uid: string | number) => THREE.Object3D | null} objectOf
   * @param {THREE.Box3} box
   */
  #labels(view, objectOf, box) {
    const used = new Set();
    /** @param {string} key */
    const label = (key) => {
      used.add(key);
      let l = this.labels.get(key);
      if (!l) {
        l = new Label();
        this.labels.set(key, l);
        this.labelGroup.add(l.sprite);
      }
      l.sprite.visible = true;
      return l;
    };
    (view.entities || []).forEach((e, i) => {
      const x = e.x + 0.5;
      const z = e.y + 0.5;
      // the survivor at work: a progress bar over the head
      const a = e.action;
      if (e.kind === 'player' && a && a.phase === 'work' && a.progress != null && a.progress < 1) {
        const l = label(`work:${i}`);
        l.set('', a.progress, '#e8c23a');
        l.sprite.position.set(x, 2.15, z);
      }
      if (e.label && e.kind !== 'player') {
        const l = label(`name:${i}`);
        l.set(e.label, e.hp != null && e.maxHp ? e.hp / e.maxHp : null, '#e05a4a');
        l.sprite.position.set(x, 2.35, z);
      }
    });
    // planters: the crop's name with a growth bar and the time left (the source's 'Carrot 1D 03:50')
    for (const f of view.furniture || []) {
      const p = f.data?.plant;
      if (!p || p.decor || p.plantId == null) continue;
      const cfg = plant(p.plantId);
      const name = cfg ? loc(cfg.zh).replace(/[（(].*[)）]/, '').trim() : '';
      const left = cfg && !p.ready ? growLeft((1 - (p.growth || 0)) * cfg.grow) : '';
      const text = `${name}${p.ready ? ' ✔' : p.withered ? ' ✖' : left ? `  ${left}` : ''}`;
      const obj = objectOf(f.uid);
      if (!obj) continue;
      box.setFromObject(obj);
      const l = label(`crop:${f.uid}`);
      l.set(text, p.ready || p.withered ? null : p.growth || 0, p.dry ? '#e0b64a' : '#6fcf6f');
      l.sprite.position.set((box.min.x + box.max.x) / 2, box.max.y + 0.3, (box.min.z + box.max.z) / 2);
    }
    for (const [k, l] of this.labels) if (!used.has(k)) l.sprite.visible = false;
  }
}
