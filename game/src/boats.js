// boats.js - the harbor fleet. A handful of runabouts moored at the piers
// and off Palm Beach; steal one and take the night air. Boats only live on
// water, bounce off piers and hulls, and throw a wake behind them.

import { CFG } from './config.js';
import { clamp, dist, angMove, TAU } from './util.js';
import { uid } from './util.js';

export const BOAT_SPECS = [
  { id: 'reefer', name: 'Reefer', kind: 'boat', w: 64, h: 24, accel: 150, top: 150, rev: 40, turn: 1.6, mass: 1.6, hp: 120, colors: ['#d9d3c8', '#3f7fae'] },
  { id: 'squalo', name: 'Squalo', kind: 'boat', w: 74, h: 27, accel: 190, top: 185, rev: 45, turn: 1.4, mass: 2.1, hp: 160, colors: ['#c22f4a', '#e8e2d4'] },
  { id: 'tubb', name: 'Tubb', kind: 'boat', w: 52, h: 22, accel: 110, top: 110, rev: 35, turn: 1.9, mass: 1.2, hp: 90, colors: ['#5a9e4b', '#d9a13b'] },
];

export class Boat {
  constructor(spec, x, y, ang, opts) {
    opts = opts || {};
    this.id = uid();
    this.spec = spec;
    this.x = x;
    this.y = y;
    this.ang = ang;
    this.vx = 0;
    this.vy = 0;
    this.speed = 0;
    this.steerVis = 0;
    this.color = opts.color || spec.colors[0];
    this.hp = spec.hp;
    this.driver = opts.driver || null;   // 'player' | null
    this.parked = true;
    this.missionTag = null;
    this.dead = false;
    this.exploded = false;
    this.wakeT = 0;
    this.bob = Math.random() * 10;
    this.smokeTimer = 0;
    this.lastHitBy = null;
  }

  get w() { return this.spec.w; }
  get h() { return this.spec.h; }
  get inWater() { return true; }

  mph() { return Math.abs(this.speed) * 0.3; }

  /** Same control signature as Car so the player drive path just works. */
  control(throttle, steer, handbrake, dt) {
    const spec = this.spec;
    if (throttle > 0) this.speed += spec.accel * throttle * dt;
    else if (throttle < 0) {
      if (this.speed > 10) this.speed -= 300 * dt;
      else this.speed = Math.max(-spec.rev, this.speed + spec.accel * 0.4 * throttle * dt);
    }
    if (throttle === 0) {
      const drag = 1.1 * dt;
      if (Math.abs(this.speed) <= drag) this.speed = 0;
      else this.speed -= Math.sign(this.speed) * drag;
    }
    this.speed = clamp(this.speed, -spec.rev, spec.top);

    // boats turn lazily and need way to turn at all
    if (Math.abs(this.speed) > 6) {
      const rate = spec.turn * clamp(Math.abs(this.speed) / 120, 0.25, 1);
      const dirSign = this.speed < 0 ? -1 : 1;
      this.ang = angMove(this.ang, this.ang + steer * rate * dt * dirSign, rate * dt);
    }
    this.steerVis = clamp(this.steerVis + (steer * 0.4 - this.steerVis) * Math.min(1, dt * 6), -0.5, 0.5);

    // boats keep momentum: almost no lateral grip
    const fx = Math.cos(this.ang), fy = Math.sin(this.ang);
    let latX = this.vx - fx * this.speed;
    let latY = this.vy - fy * this.speed;
    const latKill = Math.min(1, dt * 1.2);
    latX -= latX * latKill;
    latY -= latY * latKill;
    this.vx = fx * this.speed + latX;
    this.vy = fy * this.speed + latY;
  }

  step(dt, game) {
    if (this.dead) return;
    this.bob += dt * 1.6;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.collide(game, dt);

    // wake
    if (Math.abs(this.speed) > 30) {
      this.wakeT -= dt;
      if (this.wakeT <= 0) {
        this.wakeT = 0.08;
        game.effects.push({
          type: 'splash', x: this.x - Math.cos(this.ang) * this.spec.w * 0.5,
          y: this.y - Math.sin(this.ang) * this.spec.w * 0.5,
          t: 0, dur: 0.5, small: true,
        });
      }
    }
  }

  collide(game, dt) {
    const world = game.world;
    // land is the shore: any non-water tile ahead pushes back
    const probe = 10;
    const pts = [
      { x: this.x + Math.cos(this.ang) * this.spec.w * 0.5, y: this.y + Math.sin(this.ang) * this.spec.w * 0.5 },
      { x: this.x - Math.cos(this.ang) * this.spec.w * 0.5, y: this.y - Math.sin(this.ang) * this.spec.w * 0.5 },
    ];
    for (const p of pts) {
      for (const [ox, oy] of [[0, 0], [0, this.spec.h * 0.4], [0, -this.spec.h * 0.4]]) {
        const wx = p.x + ox, wy = p.y + oy;
        if (world.isWaterPx(wx, wy)) continue;
        // not water: slide back along the heading toward open water
        let backX = null, backY = null;
        for (let i = 1; i <= 6; i++) {
          const cx = this.x - Math.cos(this.ang) * i * probe;
          const cy = this.y - Math.sin(this.ang) * i * probe;
          if (world.isWaterPx(cx, cy)) { backX = cx; backY = cy; break; }
        }
        if (backX !== null) {
          this.x = backX;
          this.y = backY;
        } else {
          this.x -= Math.cos(this.ang) * 3;
          this.y -= Math.sin(this.ang) * 3;
        }
        this.speed *= -0.25;
        this.vx *= -0.4;
        this.vy *= -0.4;
        game.audio.crash(0.3);
        break;
      }
    }
    // boat vs boat
    for (const o of game.boats) {
      if (o === this || o.dead) continue;
      const dx = o.x - this.x, dy = o.y - this.y;
      const rr = (this.spec.w + o.spec.w) * 0.45;
      const d2 = dx * dx + dy * dy;
      if (d2 > rr * rr || d2 < 1e-9) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d;
      const overlap = rr - d;
      this.x -= nx * overlap * 0.5;
      this.y -= ny * overlap * 0.5;
      o.x += nx * overlap * 0.5;
      o.y += ny * overlap * 0.5;
      this.speed *= 0.8;
      o.speed *= 0.8;
    }
    // world bounds are handled by water tiles everywhere
    void dt;
  }
}

/** The moored fleet, seeded around the piers and the beach. */
export function seedBoats(game) {
  const T = CFG.T;
  const spots = [
    { x: 22.9 * T, y: 5.2 * T, ang: Math.PI, spec: 0 },   // pier end, dock 1
    { x: 30.9 * T, y: 5.2 * T, ang: Math.PI, spec: 1 },   // pier end, dock 2
    { x: 70.9 * T, y: 5.2 * T, ang: Math.PI, spec: 2 },   // pier end, dock 5
    { x: 46.9 * T, y: 154.2 * T, ang: 0, spec: 0 },       // off Palm Beach
    { x: 96.9 * T, y: 154.2 * T, ang: 0, spec: 1 },       // off Palm Beach east
  ];
  const rng = Math.floor.bind(Math);
  for (const s of spots) {
    const spec = BOAT_SPECS[s.spec % BOAT_SPECS.length];
    const boat = new Boat(spec, s.x, s.y, s.ang, {
      color: spec.colors[rng(Math.random() * spec.colors.length)],
    });
    game.boats.push(boat);
  }
}

/** Enter/exit bridge: mirrors player.tryEnterCar for boats. */
export function tryEnterBoat(player, game) {
  let best = null, bd = 60;
  for (const b of game.boats) {
    if (b.dead || b.driver) continue;
    const d = dist(player.x, player.y, b.x, b.y);
    if (d < bd) { bd = d; best = b; }
  }
  if (best) {
    best.driver = 'player';
    best.parked = false;
    player.car = best;
    player.x = best.x;
    player.y = best.y;
    game.audio.jack();
    game.hud.subtitle(`The ${best.spec.name} is yours. Mind the wake.`, 2.5);
    return true;
  }
  return false;
}

