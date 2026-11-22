// Bullets and the particle pool. Both are pre-allocated and recycled by cursor, so steady
// state never allocates and the frame budget holds with hundreds of live emitters.

import { rand } from '../rng.js';

export class Bullets {
  constructor() { this.list = []; }

  fire(x, y, ang, speed, fromPlayer, damage) {
    let b = this.list.find((b) => !b.live);
    if (!b) { b = {}; this.list.push(b); }
    b.live = true;
    b.x = x; b.y = y;
    b.vx = Math.cos(ang) * speed;
    b.vy = Math.sin(ang) * speed;
    b.ttl = 0.7;
    b.fromPlayer = fromPlayer;
    b.dmg = damage;
    return b;
  }

  update(dt, game) {
    for (const b of this.list) {
      if (!b.live) continue;
      b.ttl -= dt;
      if (b.ttl <= 0) { b.live = false; continue; }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      game.onBullet(b);
    }
  }
}

export class Particles {
  constructor(cap = 1100) {
    this.pool = [];
    for (let i = 0; i < cap; i++) this.pool.push({ live: false });
    this.cursor = 0;
  }

  claim() {
    for (let n = 0; n < this.pool.length; n++) {
      const p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % this.pool.length;
      if (!p.live) return p;
    }
    return this.pool[this.cursor]; // pool full: overwrite the oldest slot
  }

  emit(x, y, vx, vy, life, size, color, kind) {
    const p = this.claim();
    p.live = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.max = life; p.size = size; p.color = color; p.kind = kind;
    return p;
  }

  smoke(x, y, n, dark) {
    for (let i = 0; i < n; i++) {
      const a = rand() * 6.28, s = 12 + rand() * 30;
      this.emit(x + (rand() - 0.5) * 14, y + (rand() - 0.5) * 14,
        Math.cos(a) * s, Math.sin(a) * s - 26, 0.9 + rand() * 0.8,
        6 + rand() * 10, dark ? '#1b1b21' : '#545a66', 'smoke');
    }
  }

  fire(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = rand() * 6.28, s = 10 + rand() * 42;
      this.emit(x + (rand() - 0.5) * 12, y + (rand() - 0.5) * 12,
        Math.cos(a) * s, Math.sin(a) * s - 42, 0.35 + rand() * 0.3,
        4 + rand() * 7, rand() < 0.5 ? '#ff7b2f' : '#ffcc44', 'fire');
    }
  }

  sparks(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = rand() * 6.28, s = 60 + rand() * 160;
      this.emit(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.25 + rand() * 0.2, 2, '#ffd977', 'spark');
    }
  }

  blood(x, y, n = 6) {
    for (let i = 0; i < n; i++) {
      const a = rand() * 6.28, s = 20 + rand() * 70;
      this.emit(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.4, 2.4, '#a01828', 'blood');
    }
  }

  /** Dark chunks tossed out of a blast — painted under the glow layer like smoke. */
  debris(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = rand() * 6.28, s = 90 + rand() * 220;
      this.emit(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.5 + rand() * 0.4,
        2.5 + rand() * 3, rand() < 0.5 ? '#26262e' : '#3a3540', 'debris');
    }
  }

  muzzle(x, y, ang) {
    this.emit(x, y, Math.cos(ang) * 90, Math.sin(ang) * 90, 0.08, 7, '#ffe9a3', 'muzzle');
    // A hot core that reads even against neon spill.
    this.flash(x, y, 13, 0.07);
  }

  flash(x, y, size, life = 0.35) {
    this.emit(x, y, 0, 0, life, size, '#ffdf9e', 'flash');
  }

  cash(x, y) {
    for (let i = 0; i < 8; i++) {
      const a = rand() * 6.28;
      this.emit(x, y, Math.cos(a) * 40, Math.sin(a) * 40, 0.5, 3, '#7dffa4', 'cash');
    }
  }

  blast(x, y) {
    this.flash(x, y, 95, 0.45);
    this.fire(x, y, 26);
    this.smoke(x, y, 18, true);
    this.sparks(x, y, 20);
    this.debris(x, y, 14);
  }

  carFire(v) {
    this.fire(v.x + Math.cos(v.ang) * v.spec.len * 0.3, v.y + Math.sin(v.ang) * v.spec.len * 0.3, 2);
  }

  carSmoke(v) {
    this.smoke(v.x + Math.cos(v.ang) * v.spec.len * 0.3, v.y + Math.sin(v.ang) * v.spec.len * 0.3, 1, v.hp <= 0);
  }

  update(dt) {
    for (const p of this.pool) {
      if (!p.live) continue;
      p.life -= dt;
      if (p.life <= 0) { p.live = false; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'smoke') { p.vx *= 0.98; p.vy = p.vy * 0.98 - 12 * dt; p.size += 14 * dt; }
      else if (p.kind === 'spark' || p.kind === 'blood' || p.kind === 'cash') p.vy += 220 * dt;
      else if (p.kind === 'debris') { p.vx *= 0.94; p.vy = p.vy * 0.94 + 320 * dt; }
      else if (p.kind === 'fire') { p.vx *= 0.9; p.vy *= 0.9; }
    }
  }
}
