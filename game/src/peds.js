// peds.js — pedestrians: sidewalk wanderers, fleers, and armed gang members.

import { CFG, ctx } from './config.js';
import { clamp, dist, uid, TAU } from './util.js';
import { resolveCircleSolids, zoneAt } from './world.js';

export class Ped {
  constructor(x, y, kind = 'civ') {
    this.id = uid();
    this.x = x; this.y = y;
    this.kind = kind;                 // 'civ' | 'gang'
    this.dir = Math.random() * TAU;
    this.state = 'walk';              // walk | flee | hunt | dead
    this.speed = kind === 'gang' ? 96 : 52 + Math.random() * 26;
    this.health = kind === 'gang' ? 60 : 40;
    this.dead = false;
    this.deadT = 0;
    this.fleeT = 0;
    this.shootT = 1 + Math.random();
    this.tx = x; this.ty = y;         // wander target
    this.retarget = 0;
    this.animT = Math.random() * 10;
    this.phoneT = Math.random() < 0.08 ? 3 + Math.random() * 4 : 0;
    this.shirt = kind === 'gang'
      ? ['#8a2030', '#20305a', '#3a3a3a'][(Math.random() * 3) | 0]
      : ['#b06a5a', '#5a8ab0', '#8ab05a', '#c8b060', '#a06ac8', '#c8c8c8', '#e08a3a'][(Math.random() * 7) | 0];
    this.skin = ['#c8a080', '#8a6040', '#e0b890', '#6a4a34'][(Math.random() * 4) | 0];
    this.legs = ['#2a2a34', '#3a4a5a', '#4a3a2a'][(Math.random() * 3) | 0];
  }

  update(dt, S) {
    this.animT += dt;
    if (this.dead) { this.deadT += dt; return; }

    const p = S.player;
    const dPlayer = dist(this.x, this.y, p.x, p.y);

    if (this.kind === 'gang') {
      // gang: hunt the player, shoot when close
      if (dPlayer < 640) {
        this.state = 'hunt';
        this.dir = Math.atan2(p.y - this.y, p.x - this.x);
        const sp = this.speed;
        if (dPlayer > 170) { this.x += Math.cos(this.dir) * sp * dt; this.y += Math.sin(this.dir) * sp * dt; }
        this.shootT -= dt;
        if (this.shootT <= 0 && dPlayer < 380) {
          this.shootT = 1.05 + Math.random() * 0.5;
          if (ctx.sfx) ctx.sfx('shot', this.x, this.y);
          if (Math.random() < 0.62) p.damage(7, { x: this.x, y: this.y, kind: 'gang' });
        }
      } else this.state = 'walk';
    } else if (this.state === 'flee') {
      this.fleeT -= dt;
      if (this.fleeT <= 0) this.state = 'walk';
      const sp = 132;
      this.x += Math.cos(this.dir) * sp * dt;
      this.y += Math.sin(this.dir) * sp * dt;
    }

    if (this.state === 'walk') {
      // idle behaviors: phones, bench-sitting, window-shopping
      if (this.idleT === undefined) this.idleT = 0;
      if (this.phoneT > 0) {
        this.phoneT -= dt;
        return;                      // standing still, texting
      }
      if (this.idleT <= 0 && Math.random() < 0.0015) {
        this.phoneT = 2 + Math.random() * 5;
      }
      this.retarget -= dt;
      if (this.retarget <= 0 || dist(this.x, this.y, this.tx, this.ty) < 24) {
        this.retarget = 3 + Math.random() * 5;
        // wander to a nearby point that is not road-center / not a building
        for (let i = 0; i < 6; i++) {
          const a = Math.random() * TAU;
          const d = 80 + Math.random() * 260;
          const nx = clamp(this.x + Math.cos(a) * d, 60, CFG.map - 60);
          const ny = clamp(this.y + Math.sin(a) * d, CFG.waterTop + 60, CFG.map - 60);
          const z = zoneAt(nx, ny);
          if (z === 'water') continue;
          this.tx = nx; this.ty = ny;
          break;
        }
      }
      const a = Math.atan2(this.ty - this.y, this.tx - this.x);
      this.dir += Math.max(-2.5 * dt, Math.min(2.5 * dt, ((a - this.dir + Math.PI * 3) % TAU) - Math.PI));
      const sp = this.speed;
      this.x += Math.cos(this.dir) * sp * dt;
      this.y += Math.sin(this.dir) * sp * dt;
    }

    resolveCircleSolids(ctx.world, this, 8);
  }

  fleeFrom(x, y) {
    if (this.dead || this.kind === 'gang') return;
    this.state = 'flee';
    this.fleeT = 5 + Math.random() * 3;
    this.dir = Math.atan2(this.y - y, this.x - x) + (Math.random() - 0.5) * 0.6;
  }

  hurt(dmg) {
    if (this.dead) return false;
    this.health -= dmg;
    if (this.health <= 0) { this.die(); return true; }
    this.fleeFrom(this.x - 1, this.y - 1);
    return false;
  }

  die() {
    this.dead = true;
    this.deadT = 0;
    this.state = 'dead';
  }
}

// --------------------------------------------------------------- manager --
export class Peds {
  constructor() {
    this.spawnT = 0;
  }

  count() {
    let n = 0;
    for (const p of ctx.pedsList) if (!p.dead) n++;
    return n;
  }

  update(dt, S) {
    const cam = ctx.renderer ? ctx.renderer.cam : { x: 3200, y: 3200 };
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 0.7;
      if (this.count() < CFG.pedTarget) this.spawnNear(cam);
    }
    // separation: keep pedestrians from stacking on each other
    const list = ctx.pedsList;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > 100 || d2 < 1e-4) continue;      // closer than 10u only
        const d = Math.sqrt(d2);
        const push = (10 - d) * 0.5;
        const nx = dx / d, ny = dy / d;
        if (!a.dead) { a.x -= nx * push; a.y -= ny * push; }
        b.x += nx * push; b.y += ny * push;
      }
    }
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.update(dt, S);
      // cull: far away or corpse expired
      if ((!p.dead && dist(p.x, p.y, S.player.x, S.player.y) > 1600) ||
          (p.dead && p.deadT > 24)) {
        list.splice(i, 1);
      }
    }
  }

  spawnNear(cam) {
    const w = ctx.world;
    for (let tries = 0; tries < 10; tries++) {
      const a = Math.random() * Math.PI * 2;
      const d = 620 + Math.random() * 700;
      const x = cam.x + Math.cos(a) * d;
      const y = clamp(cam.y + Math.sin(a) * d, CFG.waterTop + 40, CFG.map - 40);
      const z = zoneAt(x, y);
      if (z === 'water' || z === 'park' && Math.random() < 0.5) { /* park is fine, keep */ }
      if (z === 'water') continue;
      // keep off building interiors
      let inB = false;
      const list = w.buildings;
      for (const b of list) {
        if (x > b.x0 - 8 && x < b.x1 + 8 && y > b.y0 - 8 && y < b.y1 + 8) { inB = true; break; }
      }
      if (inB) continue;
      const ped = new Ped(x, y);
      ctx.pedsList.push(ped);
      return ped;
    }
    return null;
  }

  // everyone near a point flees (gunfire, explosions)
  panic(x, y, r = 320) {
    for (const p of ctx.pedsList) {
      if (!p.dead && dist(p.x, p.y, x, y) < r) p.fleeFrom(x, y);
    }
  }

  spawnGang(x, y, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const g = new Ped(x + Math.cos(a) * 90, y + Math.sin(a) * 90, 'gang');
      ctx.pedsList.push(g);
      out.push(g);
    }
    return out;
  }
}
