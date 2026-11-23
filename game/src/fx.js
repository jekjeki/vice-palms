// ---------------------------------------------------------------------------
// fx.js — transient effects: particles (smoke/fire/sparks/blood), decals
// (blood/skids/scorch), bullet tracers, floating texts, screen flash and
// camera shake requests. Capped hard so chaos stays at 60 fps.
// ---------------------------------------------------------------------------

import { clamp } from './util.js';

const MAX_PARTICLES = 420;
const MAX_DECALS = 140;

export class FX {
  constructor() {
    this.particles = [];
    this.decals = [];
    this.tracers = [];
    this.texts = [];
    this.flash = 0;
  }

  spawn(p) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(p);
  }

  addDecal(d) {
    if (this.decals.length >= MAX_DECALS) this.decals.shift();
    this.decals.push(d);
  }

  blood(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 30 + Math.random() * 120;
      this.spawn({
        kind: 'blood', x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.4 + Math.random() * 0.3, maxLife: 0.7,
        color: '#7a1524', size: 2,
      });
    }
    this.addDecal({ kind: 'blood', x, y, r: 5 + Math.random() * 6, a: 0.5, rot: Math.random() * 3 });
  }

  muzzleFlash(x, y, a) {
    this.spawn({
      kind: 'fire', x, y,
      vx: Math.cos(a) * 60, vy: Math.sin(a) * 60,
      life: 0.06, maxLife: 0.06, color: '#ffe9a0', size: 7,
    });
  }

  impactSparks(x, y, mag) {
    const n = clamp(Math.round(mag / 60), 2, 10);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 60 + Math.random() * 160;
      this.spawn({
        kind: 'spark', x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.25 + Math.random() * 0.2, maxLife: 0.45,
        color: '#ffd070', size: 2,
      });
    }
  }

  explosion(x, y, game) {
    this.flash = Math.max(this.flash, 0.7);
    if (game) game.renderer.shake(14);
    // spinning debris chunks
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 90 + Math.random() * 260;
      this.spawn({
        kind: 'debris', x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.7 + Math.random() * 0.7, maxLife: 1.4,
        color: '#2e3238', size: 2 + Math.random() * 3,
        rot: Math.random() * 6, vrot: (Math.random() - 0.5) * 14,
      });
    }
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 20 + Math.random() * 90;
      this.spawn({
        kind: 'smoke', x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30,
        life: 1.4 + Math.random() * 1.6, maxLife: 3,
        color: '#1c1e22', size: 8 + Math.random() * 10,
      });
    }
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 240;
      this.spawn({
        kind: 'fire', x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.4 + Math.random() * 0.5, maxLife: 0.9,
        color: Math.random() < 0.5 ? '#ff9a30' : '#ffce54', size: 6 + Math.random() * 8,
      });
    }
    this.addDecal({ kind: 'scorch', x, y, r: 44, a: 0.55 });
  }

  smokePuff(x, y, color = '#3a3d44', size = 5) {
    this.spawn({
      kind: 'smoke', x, y,
      vx: (Math.random() - 0.5) * 20, vy: -20 - Math.random() * 26,
      life: 1.1, maxLife: 1.1, color, size,
    });
  }

  fireFlame(x, y) {
    this.spawn({
      kind: 'fire', x, y,
      vx: (Math.random() - 0.5) * 26, vy: -40 - Math.random() * 30,
      life: 0.35, maxLife: 0.35, color: Math.random() < 0.6 ? '#ff8a30' : '#ffd050', size: 4 + Math.random() * 4,
    });
  }

  skidMark(x, y) {
    this.addDecal({ kind: 'skid', x, y, a: 0.4 });
  }

  /** water ripple (swimming, splashes) */
  ripple(x, y) {
    this.spawn({
      kind: 'ripple', x, y, vx: 0, vy: 0,
      life: 0.5, maxLife: 0.5, color: '#9fd0e8', size: 6,
    });
  }

  /** spent shell casing — small brass decal that lingers */
  casing(x, y) {
    this.addDecal({ kind: 'casing', x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 8, a: 0.8 });
  }

  tracer(x0, y0, x1, y1) {
    this.tracers.push({ x0, y0, x1, y1, life: 0.09 });
  }

  text(x, y, str, color = '#fff') {
    this.texts.push({ x, y, text: str, color, life: 1.4, vy: -26 });
  }

  /** muzzle smoke curling off hot barrels */
  muzzleSmoke(x, y) {
    this.spawn({
      kind: 'smoke', x, y,
      vx: (Math.random() - 0.5) * 14, vy: -14 - Math.random() * 10,
      life: 0.7, maxLife: 0.7, color: '#4a4e56', size: 3,
    });
  }

  update(dt) {
    this.flash = Math.max(0, this.flash - dt * 2.2);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'smoke') { p.vx *= 0.98; p.vy *= 0.98; }
      if (p.kind === 'debris') {
        p.vx *= 0.985; p.vy *= 0.985;
        p.rot = (p.rot || 0) + (p.vrot || 0) * dt;
        p.vy += 60 * dt; // gravity-ish
      }
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      this.tracers[i].life -= dt;
      if (this.tracers[i].life <= 0) this.tracers.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y += t.vy * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    for (const d of this.decals) {
      if (d.kind === 'blood') d.a = Math.max(0.12, d.a - dt * 0.01);
    }
  }
}
