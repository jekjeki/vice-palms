// peds.js — pedestrians: sidewalk wandering, panic fleeing, knockdowns
import { CFG } from './config.js';
import { clamp, dist, angDiff, rand, TAU } from './util.js';

const SKIN = ['#c9a37e', '#a87d5a', '#8a6242', '#d9b08c', '#6e4a32', '#b58a6a'];
const SHIRT = ['#c94f6d', '#4f8ac9', '#57b06a', '#c9a44f', '#8a5ac9', '#c97b4f', '#4fb3c9', '#b04f4f'];
const PANTS = ['#2c3550', '#3a2c50', '#503a2c', '#24402c', '#402440'];
const JOBS = ['walker', 'walker', 'walker', 'jogger', 'dogwalker', 'tourist'];

let PED_ID = 1;

export class Ped {
  constructor(x, y, opts = {}) {
    this.id = PED_ID++;
    this.x = x; this.y = y;
    this.dir = opts.dir ?? rand(0, TAU);
    this.kind = opts.kind ?? 'ped';
    this.hp = opts.hp ?? 45;
    this.r = 8;
    this.state = 'walk';        // walk | flee | down | dead
    this.deadT = 0;
    this.fleeT = 0;
    this.downT = 0;
    this.speed = opts.speed ?? (this.kind === 'cop' ? 150 : 46 + Math.random() * 26);
    this.skin = SKIN[(Math.random() * SKIN.length) | 0];
    this.shirt = this.kind === 'cop' ? '#26437a' : SHIRT[(Math.random() * SHIRT.length) | 0];
    this.pants = this.kind === 'cop' ? '#1a2440' : PANTS[(Math.random() * PANTS.length) | 0];
    this.shootT = 0;
    this.wanderT = rand(1, 5);
    this.homeDir = this.dir;
    this.scream = 0;
    this.wave = Math.random() * TAU;
    // civilian flavour: joggers run, dog walkers trail a dog, tourists drift slowly
    this.job = opts.job ?? (this.kind === 'cop' ? 'cop' : JOBS[(Math.random() * JOBS.length) | 0]);
    if (this.job === 'jogger') { this.speed = 96 + Math.random() * 30; this.shirt = '#ff8c3c'; }
    if (this.job === 'tourist') { this.speed = 32; this.shirt = '#ffec8c'; }
    if (this.job === 'dogwalker') this.dogPhase = Math.random() * TAU;
  }

  update(game, dt) {
    if (this.state === 'dead') { this.deadT += dt; return; }
    if (this.state === 'down') {
      this.downT += dt;
      if (this.downT > 3.2) { this.state = this.hp <= 0 ? 'dead' : 'flee'; this.fleeT = 8; }
      return;
    }

    const p = game.player;
    const distP = dist(this.x, this.y, p.x, p.y);

    // flee triggers: nearby gunfire, wanted chaos, close speeding car, punched
    if (this.state !== 'flee') {
      if (game.lastShotAt > 0 && game.t - game.lastShotAt < 1.6 && distP < 260) this.startFlee(game);
      else if (game.wanted >= 3 && distP < 180 && Math.random() < dt * 0.7) this.startFlee(game);
    }

    if (this.state === 'flee') {
      // panic spread: fleeing peds shove apart so crowds scatter, not stack
      for (const o of game.peds) {
        if (o === this || o.state !== 'flee') continue;
        const dx = this.x - o.x, dy = this.y - o.y;
        const dd = dx * dx + dy * dy;
        if (dd < 400 && dd > 0.01) {
          const d = Math.sqrt(dd);
          this.x += (dx / d) * 30 * dt;
          this.y += (dy / d) * 30 * dt;
        }
      }
      this.fleeT -= dt;
      const away = Math.atan2(this.y - p.y, this.x - p.x);
      this.dir += angDiff(this.dir, away) * Math.min(1, dt * 3);
      const sp = this.speed * 2.6;
      this.move(game, Math.cos(this.dir) * sp, Math.sin(this.dir) * sp, dt);
      if (this.fleeT <= 0) this.state = 'walk';
      if (this.scream > 0) this.scream -= dt;
      else if (Math.random() < dt * 0.4) { this.scream = 2 + Math.random() * 2; game.audio?.scream?.(); }
      return;
    }

    // sidewalk wander: keep near the spawn lane direction, jitter
    this.wanderT -= dt;
    if (this.wanderT <= 0) {
      this.wanderT = rand(2, 6);
      // occasionally cross the street at a crosswalk instead of turning back
      const R = CFG.ROAD_SPACING;
      const ry = Math.round(this.y / R) * R;
      const nearRoad = Math.abs(this.y - ry) < CFG.ROAD_W / 2 + CFG.SIDEWALK + 4;
      if (nearRoad && Math.random() < 0.4) {
        this.homeDir = this.y > ry ? -Math.PI / 2 : Math.PI / 2; // cross to the other sidewalk
      } else {
        this.homeDir += (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2);
      }
    }
    this.dir += angDiff(this.dir, this.homeDir) * Math.min(1, dt * 2);
    // joggers pick long straight stretches; tourists wander tighter
    if (this.job === 'dogwalker') this.dogPhase += dt * 5;
    this.move(game, Math.cos(this.dir) * this.speed, Math.sin(this.dir) * this.speed, dt);
  }

  move(game, vx, vy, dt) {
    const nx = this.x + vx * dt, ny = this.y + vy * dt;
    // slide along solids
    const solids = game.world.nearSolids(nx, ny);
    let px = nx, py = ny;
    for (const r of solids) {
      const cx = clamp(px, r.x0, r.x1), cy = clamp(py, r.y0, r.y1);
      const dx = px - cx, dy = py - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < this.r * this.r) {
        const d = Math.sqrt(d2) || 1;
        px = cx + (dx / d) * this.r; py = cy + (dy / d) * this.r;
      }
    }
    // water blocks peds
    if (game.world.isWater(px, py)) { this.homeDir += Math.PI; return; }
    this.x = clamp(px, 10, CFG.W - 10);
    this.y = clamp(py, 10, CFG.H - 10);
    this.wave += dt * 9 * (this.state === 'flee' ? 1.6 : 1);
  }

  knock(game, dirx, diry, dmg) {
    if (this.state === 'dead') return;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.state = 'down'; this.downT = 0;
      setTimeout(() => { if (this.state === 'down' && this.hp <= 0) this.state = 'dead'; }, 10);
      game.onPedKilled?.(this);
    } else {
      this.state = 'down'; this.downT = 0;
      game.onPedHit?.(this);
    }
    this.startFlee(game);
  }

  startFlee(game) {
    if (this.state === 'down' || this.state === 'dead') return;
    if (this.state !== 'flee') { this.state = 'flee'; this.fleeT = rand(5, 9); this.scream = 0.5; }
  }

  // killed by any means — callers add wanted heat
  isThreat() { return this.kind === 'cop'; }
}

// helper: find ped near point
export function pedAt(game, x, y, r = 26, excludeDown = true) {
  for (const p of game.peds) {
    if (excludeDown && (p.state === 'down' || p.state === 'dead')) continue;
    if (dist(p.x, p.y, x, y) < r) return p;
  }
  return null;
}
