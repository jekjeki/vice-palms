// cars.js — 8 vehicle types, arcade drift physics, damage → smoke → fire →
// explosion. Pure simulation; rendering lives in render.js.

import { CFG, ctx } from './config.js';
import { clamp, TAU, uid } from './util.js';
import { solidsNear, waterBlocked } from './world.js';
import { circleRectPush } from './util.js';

// ------------------------------------------------------------ vehicle types
// max = max speed (u/s), accel u/s², grip = lateral damping rate,
// turn = rad/s at full grip, hp = damage capacity.
export const TYPES = {
  sedan: {
    name: 'Sentinel', w: 22, l: 44, accel: 240, max: 330, grip: 6.5, turn: 2.55, hp: 100,
    colors: ['#8a2f3b', '#2f4a8a', '#3f6a4a', '#7a7a82', '#b06a2f', '#2f2f38', '#8a7a2f'],
  },
  sports: {
    name: 'Banshee', w: 21, l: 44, accel: 330, max: 520, grip: 8.0, turn: 3.05, hp: 85,
    colors: ['#d8308a', '#30c8d8', '#e8d830', '#e84830', '#78e830', '#f0f0f0'],
  },
  taxi: {
    name: 'Cabbie', w: 22, l: 45, accel: 235, max: 320, grip: 6.2, turn: 2.5, hp: 100,
    colors: ['#e8b820'],
  },
  van: {
    name: 'Moonbeam', w: 26, l: 54, accel: 190, max: 270, grip: 5.4, turn: 2.15, hp: 130,
    colors: ['#c8c0b0', '#5a7a9a', '#7a5a4a', '#4a5a4a'],
  },
  pickup: {
    name: 'Bobcat', w: 25, l: 50, accel: 215, max: 300, grip: 5.8, turn: 2.3, hp: 120,
    colors: ['#8a4a2f', '#3a5a3a', '#4a4a58', '#9a8a5a'],
  },
  bus: {
    name: 'Coach', w: 30, l: 82, accel: 150, max: 235, grip: 4.6, turn: 1.7, hp: 230,
    colors: ['#3a8a5a', '#b04a3a', '#c8b040'],
  },
  police: {
    name: 'Cruiser', w: 23, l: 47, accel: 300, max: 465, grip: 7.4, turn: 2.85, hp: 130,
    colors: ['#20304a'],
  },
  limo: {
    name: 'Stretch', w: 23, l: 68, accel: 200, max: 310, grip: 5.6, turn: 1.95, hp: 140,
    colors: ['#101014', '#f0f0f0'],
  },
};

export const TYPE_IDS = Object.keys(TYPES);

// civilian-ish mix for traffic
export const CIV_TYPES = ['sedan', 'sedan', 'sedan', 'taxi', 'van', 'pickup', 'sports', 'bus', 'limo'];

export function makeCar(typeId, x, y, ang) {
  return new Car(typeId, x, y, ang);
}

// ------------------------------------------------------------------ Car ----
export class Car {
  constructor(typeId, x, y, ang) {
    const t = TYPES[typeId] || TYPES.sedan;
    this.id = uid();
    this.type = typeId;
    this.spec = t;
    this.x = x; this.y = y;
    this.angle = ang;
    this.vx = 0; this.vy = 0;
    this.steerVis = 0;             // visual wheel steer
    this.color = t.colors[(Math.random() * t.colors.length) | 0];
    this.hp = t.hp;
    this.maxHp = t.hp;
    this.dead = false;             // exploded / sunk
    this.burning = 0;              // seconds until explosion while >0
    this.smoke = false;
    this.driver = null;            // 'player' | 'traffic' | 'police' | null (parked)
    this.ai = null;                // traffic/police behaviour object
    this.siren = false;
    this.headlights = true;
    this.wreckT = 0;               // despawn timer after explosion
    this.lastImpact = 0;
    this.tag = null;               // mission tag
    this.honkT = 0;
  }

  get speed() { return Math.hypot(this.vx, this.vy); }

  // Arcade model: decompose velocity into forward/lateral, apply throttle to
  // forward, damp lateral by grip (handbrake lowers grip → drift).
  update(dt, input) {
    if (this.dead) return;
    const s = this.spec;
    let throttle = input ? clamp(input.throttle, -1, 1) : 0;
    let steer = input ? clamp(input.steer, -1, 1) : 0;
    const hand = input && input.hand;

    const cos = Math.cos(this.angle), sin = Math.sin(this.angle);
    let vf = this.vx * cos + this.vy * sin;
    let vl = -this.vx * sin + this.vy * cos;

    // throttle / brake / reverse
    if (throttle > 0) {
      if (vf < -10) vf += s.accel * 2.1 * dt;          // braking from reverse
      else vf += s.accel * dt * (1 - Math.abs(vf) / s.max * 0.55);
    } else if (throttle < 0) {
      if (vf > 10) vf -= s.accel * 2.2 * dt;           // brake
      else vf -= s.accel * 0.65 * dt;                  // reverse
      vf = Math.max(vf, -s.max * 0.38);
    }
    // engine drag + rolling resistance
    vf *= 1 - 0.045 * dt * 60 * 0.016 * 60;             // ≈ 4%/s
    if (!throttle) vf *= 1 - 0.55 * dt;
    vf = clamp(vf, -s.max * 0.4, s.max);

    // grip
    const g = hand ? 1.15 : s.grip;
    vl *= Math.exp(-g * dt);
    // handbrake also bleeds forward speed
    if (hand) vf *= 1 - 0.35 * dt;

    // steering scales with speed (weak when stopped), reversed in reverse
    const spdF = clamp(Math.abs(vf) / 150, 0, 1);
    const dirF = vf < 0 ? -1 : 1;
    this.angle += steer * s.turn * spdF * dirF * dt;
    this.steerVis += ((steer * 0.5) - this.steerVis) * Math.min(1, dt * 12);

    // recompose
    const cos2 = Math.cos(this.angle), sin2 = Math.sin(this.angle);
    this.vx = cos2 * vf - sin2 * vl;
    this.vy = sin2 * vf + cos2 * vl;

    const px = this.x, py = this.y;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // hard map bounds
    if (this.x < 30) { this.x = 30; this.vx *= -0.4; }
    if (this.x > CFG.map - 30) { this.x = CFG.map - 30; this.vx *= -0.4; }
    if (this.y < 30) { this.y = 30; this.vy *= -0.4; }
    if (this.y > CFG.map - 30) { this.y = CFG.map - 30; this.vy *= -0.4; }

    this.collideSolids(px, py);

    // skidmarks while handbraking or drifting hard
    if (ctx.S && ctx.S.skidmarks) {
      const latSpeed = Math.abs(-this.vx * Math.sin(this.angle) + this.vy * Math.cos(this.angle));
      const drifting = (hand && Math.abs(vf) > 110) || latSpeed > 110;
      if (drifting && ctx.S.skidmarks.length < 380) {
        const bw = this.spec.w * 0.42;
        const bx = this.x - Math.cos(this.angle) * this.spec.l * 0.28;
        const by = this.y - Math.sin(this.angle) * this.spec.l * 0.28;
        for (const side of [-1, 1]) {
          ctx.S.skidmarks.push({
            x: bx + Math.cos(this.angle + Math.PI / 2) * bw * side,
            y: by + Math.sin(this.angle + Math.PI / 2) * bw * side,
            a: this.angle, life: 5.5, w: 2.6,
          });
        }
      }
    }

    // water = instant stop (no swimming cars)
    if (waterBlocked(ctx.world, this.x, this.y) && this.driver !== null) {
      this.x -= this.vx * dt * 2.2;
      this.y -= this.vy * dt * 2.2;
      this.vx *= -0.25; this.vy *= -0.25;
      this.impact(8);
      if (ctx.sfx) ctx.sfx('splash', this.x, this.y);
    }

    this.updateDamage(dt);
  }

  collideSolids(px, py) {
    const s = this.spec;
    const cos = Math.cos(this.angle), sin = Math.sin(this.angle);
    const probeR = s.w * 0.5 + 3;
    const pts = [
      [this.x + cos * s.l * 0.38, this.y + sin * s.l * 0.38],
      [this.x, this.y],
      [this.x - cos * s.l * 0.38, this.y - sin * s.l * 0.38],
    ];
    const solids = solidsNear(ctx.world, this.x, this.y, s.l * 0.55 + 10);
    for (const pt of pts) {
      for (const b of solids) {
        if (b.x0 === undefined) continue;
        const push = circleRectPush(pt[0], pt[1], probeR, b);
        if (push) {
          this.x += push.x; this.y += push.y;
          // reflect + damage by impact speed
          const imp = Math.abs(this.vx * push.x + this.vy * push.y) / (push.depth || 1) * (push.depth || 1);
          const nImp = Math.hypot(this.vx, this.vy);
          if (nImp > 130) {
            this.impact(nImp * 0.06);
            if (ctx.sfx) ctx.sfx('crash', this.x, this.y);
            ctx.game && ctx.game.addSparks(this.x, this.y, 4);
          }
          this.vx *= -0.3; this.vy *= -0.3;
          pt[0] += push.x; pt[1] += push.y;
        }
      }
    }
  }

  impact(dmg) {
    if (this.dead) return;
    this.hp -= dmg;
    this.lastImpact = 0.3;
    if (this.hp < this.maxHp * 0.38) this.smoke = true;
    if (this.hp <= 0 && this.burning <= 0) {
      this.hp = 0;
      this.burning = 1.9;                      // burns then pops
      if (ctx.sfx) ctx.sfx('fire', this.x, this.y);
    }
  }

  updateDamage(dt) {
    if (this.lastImpact > 0) this.lastImpact -= dt;
    if (this.burning > 0) {
      this.burning -= dt;
      if (this.burning <= 0) this.explode();
    }
    if (this.wreckT > 0) {
      this.wreckT -= dt;
      if (this.wreckT <= 0) this.dead = true;
    }
  }

  explode() {
    if (this.dead) return;
    this.dead = true;
    this.wreckT = 14;                          // husk stays a while
    this.burning = 0;
    this.smoke = true;
    this.hp = 0;
    this.headlights = false;
    this.vx *= 0.2; this.vy *= 0.2;
    if (ctx.explodeAt) ctx.explodeAt(this.x, this.y, this.spec === TYPES.bus ? 1.4 : 1);
  }
}

// ------------------------------------------------------------- collisions --
// Approximate cars as circles for car-vs-car; separates + damages both.
export function collideCars(a, b) {
  if (a.dead && b.dead) return;
  const ra = (a.spec.l + a.spec.w) * 0.25;
  const rb = (b.spec.l + b.spec.w) * 0.25;
  const dx = b.x - a.x, dy = b.y - a.y;
  const d2 = dx * dx + dy * dy;
  const rr = ra + rb;
  if (d2 > rr * rr || d2 < 1e-6) return;
  const d = Math.sqrt(d2);
  const nx = dx / d, ny = dy / d;
  const overlap = rr - d;
  const ma = a.spec.l * a.spec.w, mb = b.spec.l * b.spec.w;
  const total = ma + mb;
  a.x -= nx * overlap * (mb / total);
  a.y -= ny * overlap * (mb / total);
  b.x += nx * overlap * (ma / total);
  b.y += ny * overlap * (ma / total);

  // relative velocity along normal
  const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rel < -60) {
    const j = -rel * 0.9;
    a.vx -= nx * j * (mb / total); a.vy -= ny * j * (mb / total);
    b.vx += nx * j * (ma / total); b.vy += ny * j * (ma / total);
    const dmg = Math.min(38, Math.abs(rel) * 0.055);
    a.impact(dmg); b.impact(dmg);
    if (ctx.sfx) ctx.sfx('crash', (a.x + b.x) / 2, (a.y + b.y) / 2);
    if (ctx.game) ctx.game.addSparks((a.x + b.x) / 2, (a.y + b.y) / 2, 6);
  } else if (rel < 0) {
    // gentle push apart
    a.vx -= nx * 12; a.vy -= ny * 12;
    b.vx += nx * 12; b.vy += ny * 12;
  }
}

// ------------------------------------------------------------ utility -----
export function steerToward(car, tx, ty, dt, gain = 2.6) {
  const want = Math.atan2(ty - car.y, tx - car.x);
  let d = want - car.angle;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return clamp(d * gain, -1, 1);
}
