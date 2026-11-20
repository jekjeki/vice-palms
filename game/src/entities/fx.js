// Bullets and the pooled particle system: smoke, fire, sparks, blood, muzzle flashes,
// explosion flashes and cash sparkles. Everything is a pooled particle; nothing allocates
// per frame in steady state.

import { dist } from '../util.js';

export class BulletPool {
  constructor() { this.list = []; }
  fire(x, y, ang, speed, fromPlayer, damage) {
    let b = this.list.find((b) => !b.active);
    if (!b) { b = {}; this.list.push(b); }
    b.active = true;
    b.x = x; b.y = y;
    b.vx = Math.cos(ang) * speed;
    b.vy = Math.sin(ang) * speed;
    b.ttl = 0.7;
    b.fromPlayer = fromPlayer;
    b.damage = damage;
    this.onFire?.(b);
    return b;
  }
  update(dt, game) {
    for (const b of this.list) {
      if (!b.active) continue;
      b.ttl -= dt;
      if (b.ttl <= 0) { b.active = false; continue; }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      game.onBullet(b);
    }
  }
}

export class Particles {
  constructor(cap = 900) {
    this.pool = [];
    for (let i = 0; i < cap; i++) this.pool.push({ active: false });
    this.cursor = 0;
  }
  _spawn() {
    for (let n = 0; n < this.pool.length; n++) {
      const p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % this.pool.length;
      if (!p.active) return p;
    }
    return this.pool[this.cursor]; // overwrite the oldest slot
  }
  emit(x, y, vx, vy, life, size, color, kind) {
    const p = this._spawn();
    p.active = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.max = life; p.size = size; p.color = color; p.kind = kind;
    return p;
  }
  smoke(x, y, n, dark) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, s = 12 + Math.random() * 30;
      this.emit(x + (Math.random() - 0.5) * 14, y + (Math.random() - 0.5) * 14,
        Math.cos(a) * s, Math.sin(a) * s - 24, 0.9 + Math.random() * 0.8,
        6 + Math.random() * 10, dark ? '#1c1c22' : '#555a66', 'smoke');
    }
  }
  fire(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, s = 10 + Math.random() * 40;
      this.emit(x + (Math.random() - 0.5) * 12, y + (Math.random() - 0.5) * 12,
        Math.cos(a) * s, Math.sin(a) * s - 40, 0.35 + Math.random() * 0.3,
        4 + Math.random() * 7, Math.random() < 0.5 ? '#ff7b2f' : '#ffcc44', 'fire');
    }
  }
  sparks(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, s = 60 + Math.random() * 160;
      this.emit(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.25 + Math.random() * 0.2,
        2, '#ffd977', 'spark');
    }
  }
  blood(x, y, n = 6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, s = 20 + Math.random() * 70;
      this.emit(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.4, 2.4, '#a01828', 'blood');
    }
  }
  muzzle(x, y, ang) {
    this.emit(x, y, Math.cos(ang) * 90, Math.sin(ang) * 90, 0.08, 7, '#ffe9a3', 'muzzle');
  }
  flash(x, y, size, life = 0.35) {
    this.emit(x, y, 0, 0, life, size, '#ffdf9e', 'flash');
  }
  cash(x, y) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * 6.28;
      this.emit(x, y, Math.cos(a) * 40, Math.sin(a) * 40, 0.5, 3, '#7dffa4', 'cash');
    }
  }
  explosion(x, y) {
    this.flash(x, y, 90, 0.45);
    this.fire(x, y, 26);
    this.smoke(x, y, 18, true);
    this.sparks(x, y, 20);
  }
  vehicleFire(v) {
    this.fire(v.x + Math.cos(v.ang) * v.def.len * 0.3, v.y + Math.sin(v.ang) * v.def.len * 0.3, 2);
  }
  vehicleSmoke(v) {
    this.smoke(v.x + Math.cos(v.ang) * v.def.len * 0.3, v.y + Math.sin(v.ang) * v.def.len * 0.3, 1, v.hp <= 0);
  }
  update(dt) {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'smoke') { p.vx *= 0.98; p.vy = p.vy * 0.98 - 12 * dt; p.size += 14 * dt; }
      else if (p.kind === 'spark' || p.kind === 'blood' || p.kind === 'cash') p.vy += 220 * dt;
      else if (p.kind === 'fire') { p.vx *= 0.9; p.vy *= 0.9; }
    }
  }
}
