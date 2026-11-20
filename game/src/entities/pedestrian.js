// Pedestrians: sidewalk waypoints (block corners), idle phone-glancers, and a flee state when
// gunfire, horns or carjacking happen nearby. Killed peds fall and stay briefly as evidence.

import { BLOCKS, PITCH, ROAD_W, SIDEWALK, PED_WALK } from '../config.js';
import { clamp } from '../util.js';

const SHIRTS = ['#d95f5f', '#5fa8d9', '#d9c15f', '#8bd98a', '#c46fd9', '#d98a5f', '#e0e0e0', '#6f7bd9'];
const SKINS = ['#c99a72', '#8a5a3a', '#e0b48a', '#5a3a26', '#a8734a'];

/** The four sidewalk corner waypoints of block (i, j), in walkable world coordinates. */
export function blockCorners(i, j, out) {
  const x0 = i * PITCH + ROAD_W / 2 + SIDEWALK / 2;
  const y0 = j * PITCH + ROAD_W / 2 + SIDEWALK / 2;
  const x1 = i * PITCH + ROAD_W / 2 + (PITCH - ROAD_W) - SIDEWALK / 2;
  const y1 = j * PITCH + ROAD_W / 2 + (PITCH - ROAD_W) - SIDEWALK / 2;
  out[0] = x0; out[1] = y0; out[2] = x1; out[3] = y1;
  return out;
}

export class Ped {
  constructor(x, y, seed) {
    this.x = x; this.y = y;
    this.shirt = SHIRTS[seed % SHIRTS.length];
    this.skin = SKINS[(seed * 7) % SKINS.length];
    this.speed = PED_WALK * (0.75 + (seed % 50) / 100);
    this.state = 'walk';            // walk | flee | down
    this.tx = x; this.ty = y;       // current waypoint target
    this.fleeT = 0; this.downT = 0;
    this.phone = (seed % 7) === 3;
    this.phase = seed % 6.28;
    this.dead = false;
    this.pickWaypoint(seed);
  }

  pickWaypoint(seed) {
    // Walk to a random corner of the current block, sometimes crossing the road diagonally
    // to a neighbouring block's corner (the crosswalks).
    const i = clamp(Math.floor((this.x - ROAD_W / 2) / PITCH), 0, BLOCKS - 1);
    const j = clamp(Math.floor((this.y - ROAD_W / 2) / PITCH), 0, BLOCKS - 1);
    const ni = i + (Math.random() < 0.5 ? -1 : 1);
    const nj = j + (Math.random() < 0.5 ? -1 : 1);
    let bi = i, bj = j;
    if (Math.random() < 0.25 && ni >= 0 && ni < BLOCKS) bi = ni;
    else if (Math.random() < 0.25 && nj >= 0 && nj < BLOCKS) bj = nj;
    const c = blockCorners(bi, bj, [0, 0, 0, 0]);
    const k = (Math.random() * 4) | 0;
    this.tx = c[k * 2]; this.ty = c[k * 2 + 1];
  }

  flee(fromX, fromY) {
    if (this.state === 'down') return;
    this.state = 'flee';
    this.fleeT = 4 + Math.random() * 3;
    this.fx = fromX; this.fy = fromY;
  }

  hurt(game, dmg, fromX, fromY) {
    if (this.state === 'down') return false;
    this.hp = (this.hp ?? 30) - dmg;
    if (this.hp <= 0) {
      this.state = 'down';
      this.downT = 12;
      game.fx.blood(this.x, this.y);
      game.onPedKilled(this);
      return true;
    }
    this.flee(fromX, fromY);
    return false;
  }

  update(dt, game) {
    if (this.state === 'down') {
      this.downT -= dt;
      return;
    }
    if (this.state === 'flee') {
      this.fleeT -= dt;
      const d = Math.hypot(this.x - this.fx, this.y - this.fy) || 1;
      const sp = this.speed * 2.6;
      this.x += ((this.x - this.fx) / d) * sp * dt;
      this.y += ((this.y - this.fy) / d) * sp * dt;
      // Fleeing peds bump into nothing: they hug the open streets until they calm down.
      if (this.fleeT <= 0) { this.state = 'walk'; this.pickWaypoint(0); }
      return;
    }
    const dx = this.tx - this.x, dy = this.ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 6) { this.pickWaypoint(0); return; }
    this.x += (dx / d) * this.speed * dt;
    this.y += (dy / d) * this.speed * dt;
    this.phase += dt * 6;
  }

  get heading() {
    return Math.atan2(this.ty - this.y, this.tx - this.x);
  }
}
