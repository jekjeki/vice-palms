// People: pedestrians strolling the sidewalk corners, phone-gazers, and the ones who bolt
// when gunfire, horns or a carjack erupt nearby. Killed people stay down a while as evidence.
// Foot police officers are people too, but the cops system drives them.

import { GRID, PITCH, ROAD, WALK, PED_SPEED } from '../config.js';
import { clamp } from '../util.js';
import { rand, randInt } from '../rng.js';

const SHIRTS = ['#d95f5f', '#5fa8d9', '#d9c15f', '#8bd98a', '#c46fd9', '#d98a5f', '#e6e6e6', '#6f7bd9', '#3fae9a', '#d97f9a'];
const SKINS = ['#c99a72', '#8a5a3a', '#e0b48a', '#5a3a26', '#a8734a', '#d9b091'];

/** The four sidewalk corners of block (i, j) in walkable coordinates. */
export function cornersOf(i, j) {
  const x0 = i * PITCH + ROAD / 2 + WALK / 2;
  const y0 = j * PITCH + ROAD / 2 + WALK / 2;
  const x1 = (i + 1) * PITCH - ROAD / 2 - WALK / 2;
  const y1 = (j + 1) * PITCH - ROAD / 2 - WALK / 2;
  return [x0, y0, x1, y1];
}

export class Person {
  constructor(x, y, seed) {
    this.x = x; this.y = y;
    this.shirt = SHIRTS[seed % SHIRTS.length];
    this.skin = SKINS[(seed * 7 + 3) % SKINS.length];
    this.hair = ['#241a10', '#3a2a18', '#181818', '#6b4a26'][seed % 4];
    this.speed = PED_SPEED * (0.75 + (seed % 47) / 95);
    this.mode = 'stroll';          // stroll | gawk | bolt | down
    this.tx = x; this.ty = y;
    this.hp = 30;
    this.boltT = 0; this.downT = 0;
    this.phone = seed % 7 === 3;
    this.phase = (seed % 628) / 100;
    this.wreck = false;
    this.isCop = false;
    this.graceT = 0;               // seconds of run-over immunity right after spawning
    // One stroller in eleven stops dead to gawk at the strip — sidewalks read as lived-in.
    this.mode = seed % 11 === 2 ? 'gawk' : 'stroll';
    this.gawkT = 3 + (seed % 55) / 10;
    // Strollers occasionally pause mid-block to let a group knot up and un-knot again.
    this.pauseT = seed % 9 === 4 ? 1 + (seed % 40) / 20 : 0;
    this.targetBlock();
  }

  /** Pick the next sidewalk corner: usually this block, sometimes across the crosswalk. */
  targetBlock() {
    const i = clamp(Math.floor((this.x - ROAD / 2) / PITCH), 0, GRID - 1);
    const j = clamp(Math.floor((this.y - ROAD / 2) / PITCH), 0, GRID - 1);
    let bi = i, bj = j;
    const roll = rand();
    if (roll < 0.22 && i + 1 < GRID && rand() < 0.5) bi = i + 1;
    else if (roll < 0.22 && i > 0) bi = i - 1;
    else if (roll < 0.4 && j + 1 < GRID && rand() < 0.5) bj = j + 1;
    else if (roll < 0.4 && j > 0) bj = j - 1;
    const [x0, y0, x1, y1] = cornersOf(bi, bj);
    const k = randInt(4);
    this.tx = k % 2 === 0 ? x0 : x1;
    this.ty = k < 2 ? y0 : y1;
  }

  bolt(fromX, fromY) {
    if (this.mode === 'down') return;
    this.mode = 'bolt';
    this.boltT = 4 + rand() * 3;
    this.boltX = fromX; this.boltY = fromY;
  }

  /** Returns true when this hit is fatal. */
  hurt(game, dmg, fromX, fromY) {
    if (this.mode === 'down') return false;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.mode = 'down';
      this.downT = 12;
      game.fx.blood(this.x, this.y, 5);
      game.onPersonDown(this);
      return true;
    }
    this.bolt(fromX, fromY);
    return false;
  }

  update(dt, game) {
    if (this.graceT > 0) this.graceT -= dt;
    if (this.mode === 'down') { this.downT -= dt; return; }
    if (this.mode === 'gawk') {
      // Frozen mid-photo; gunfire or a horn bolts them like anyone else.
      this.gawkT -= dt;
      this.phase += dt * 1.6;
      if (this.gawkT <= 0) { this.mode = 'stroll'; }
      return;
    }
    if (this.mode === 'bolt') {
      this.boltT -= dt;
      const d = Math.hypot(this.x - this.boltX, this.y - this.boltY) || 1;
      const sp = this.speed * 2.6;
      this.x += ((this.x - this.boltX) / d) * sp * dt;
      this.y += ((this.y - this.boltY) / d) * sp * dt;
      this.phase += dt * 13;
      if (this.boltT <= 0) { this.mode = 'stroll'; this.targetBlock(); }
      return;
    }
    if (this.pauseT > 0) {
      this.pauseT -= dt;
      this.phase += dt * 1.2;
      return;
    }
    const dx = this.tx - this.x, dy = this.ty - this.y;
    if (Math.hypot(dx, dy) < 6) {
      this.targetBlock();
      // Roll a fresh pause at each corner: some walkers linger on the stoop.
      if (rand() < 0.08) this.pauseT = 1 + rand() * 2.5;
      return;
    }
    this.x += (dx / Math.hypot(dx, dy)) * this.speed * dt;
    this.y += (dy / Math.hypot(dx, dy)) * this.speed * dt;
    this.phase += dt * 6;
  }

  get heading() { return Math.atan2(this.ty - this.y, this.tx - this.x); }
}
