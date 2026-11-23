// cars.js — the 8 vehicle types plus their arcade physics. Grip, drift,
// handbrake, damage with smoke/fire/explosion and headlights all live here.
// Rendering is render.js's job; this file is pure simulation.

import { CFG } from './config.js';
import { clamp, dist, angMove, vecNorm } from './util.js';
import { uid } from './util.js';

/**
 * The vehicle roster. Values are tuned per class; `w`/`h` are the body
 * footprint in px, `accel` px/s², `top` px/s forward.
 */
export const CAR_SPECS = [
  { id: 'banshee', name: 'Banshee', kind: 'sport', w: 46, h: 22, accel: 300, top: 250, rev: 90, grip: 5.6, drift: 0.55, mass: 1.0, hp: 90, colors: ['#e6e2da', '#c22f4a', '#3ec6b8', '#2d2f36'] },
  { id: 'stinger', name: 'Stinger', kind: 'sport', w: 48, h: 23, accel: 320, top: 262, rev: 92, grip: 5.2, drift: 0.6, mass: 1.0, hp: 85, colors: ['#d9a13b', '#8b4bd9', '#e8e2d4', '#c22f4a'] },
  { id: 'idaho', name: 'Idaho', kind: 'car', w: 44, h: 21, accel: 190, top: 190, rev: 80, grip: 6.4, drift: 0.4, mass: 1.1, hp: 110, colors: ['#2f6f9e', '#b0467e', '#5a9e4b', '#d9d3c8'] },
  { id: 'cabby', name: 'Cabby', kind: 'taxi', w: 46, h: 22, accel: 185, top: 185, rev: 78, grip: 6.2, drift: 0.38, mass: 1.15, hp: 115, colors: ['#e8c53a'] },
  { id: 'moonbeam', name: 'Moonbeam', kind: 'van', w: 50, h: 24, accel: 150, top: 165, rev: 70, grip: 6.8, drift: 0.3, mass: 1.4, hp: 140, colors: ['#d9d3c8', '#5a9e4b', '#c56a2e'] },
  { id: 'bobcat', name: 'Bobcat', kind: 'pickup', w: 48, h: 23, accel: 200, top: 195, rev: 82, grip: 6.0, drift: 0.45, mass: 1.25, hp: 120, colors: ['#c22f4a', '#2d2f36', '#3f7fae'] },
  { id: 'bus', name: 'Coach', kind: 'bus', w: 76, h: 26, accel: 110, top: 150, rev: 55, grip: 7.4, drift: 0.22, mass: 2.2, hp: 220, colors: ['#e0e4ea', '#3f7fae'] },
  { id: 'rumpo', name: 'Rumpo', kind: 'truck', w: 66, h: 26, accel: 130, top: 160, rev: 60, grip: 7.0, drift: 0.25, mass: 1.9, hp: 180, colors: ['#c56a2e', '#5d6a75'] },
];

export const POLICE_SPEC = {
  id: 'cruiser', name: 'VCPD Cruiser', kind: 'police', w: 48, h: 23,
  accel: 260, top: 240, rev: 88, grip: 6.0, drift: 0.45, mass: 1.2, hp: 130,
  colors: ['#20242e'],
};

export const POLICE_SUV = {
  id: 'enforcer', name: 'VCPD Enforcer', kind: 'police', w: 56, h: 26,
  accel: 230, top: 225, rev: 80, grip: 6.6, drift: 0.3, mass: 1.7, hp: 200,
  colors: ['#20242e'],
};

/** Heading angle for a cardinal traffic direction. */
export const DIR_ANG = [0, Math.PI / 2, Math.PI, -Math.PI / 2]; // E S W N

const CORNERS = [{}, {}, {}, {}]; // scratch

export class Car {
  constructor(spec, x, y, ang, opts) {
    opts = opts || {};
    this.id = uid();
    this.spec = spec;
    this.x = x;
    this.y = y;
    this.ang = ang;
    this.vx = 0;
    this.vy = 0;
    this.speed = 0;          // signed forward speed
    this.steerVis = 0;       // visual wheel angle
    this.color = opts.color || spec.colors[0];
    this.hp = opts.hp !== undefined ? opts.hp : spec.hp;
    this.maxHp = spec.hp;
    this.driver = opts.driver || null;   // 'player' | 'ai' | 'cop' | null
    this.parked = !!opts.parked;
    this.dir = opts.dir !== undefined ? opts.dir : 0;   // ai cardinal direction
    this.aiState = 'cruise';
    this.turnTarget = null;
    this.stopped = false;
    this.blockedTimer = 0;
    this.frozen = !!opts.frozen;
    this.dead = false;
    this.onFire = false;
    this.exploded = false;
    this.sinkTimer = 0;
    this.smokeTimer = 0;
    this.headlights = opts.headlights !== undefined ? opts.headlights : true;
    this.siren = false;
    this.sirenPitch = 0;
    this.lightT = Math.random() * 6;
    this.hitFlash = 0;
    this.wobble = 0;
    this.burnT = 0;
    this.missionTag = opts.missionTag || null;   // 'target' | 'escape' | 'fare' | 'gang' | 'vigilante'
    this.escapeT = 0;
    this.sunk = false;
    this.lastHitBy = null;
    this.tireT = 0;
    this.handbrakeVis = 0;
    this._out = { nx: 0, ny: 0, len: 0 };
  }

  get w() { return this.spec.w; }
  get h() { return this.spec.h; }
  get wrecked() { return this.hp <= 0; }

  corners(out) {
    const c = Math.cos(this.ang), s = Math.sin(this.ang);
    const hw = this.spec.w / 2, hh = this.spec.h / 2;
    const pts = out || CORNERS;
    pts[0].x = this.x + c * hw - s * hh; pts[0].y = this.y + s * hw + c * hh;
    pts[1].x = this.x + c * hw + s * hh; pts[1].y = this.y + s * hw - c * hh;
    pts[2].x = this.x - c * hw + s * hh; pts[2].y = this.y - s * hw - c * hh;
    pts[3].x = this.x - c * hw - s * hh; pts[3].y = this.y - s * hw + c * hh;
    return pts;
  }

  /** Forward unit vector. */
  fwd(out) {
    out.x = Math.cos(this.ang); out.y = Math.sin(this.ang);
    return out;
  }

  /** Apply throttle/steer/handbrake from a driver. */
  control(throttle, steer, handbrake, dt, gripMult) {
    const spec = this.spec;
    const gm = gripMult === undefined ? 1 : gripMult;
    // forward speed integrates throttle
    if (throttle > 0) {
      this.speed += spec.accel * throttle * dt;
    } else if (throttle < 0) {
      if (this.speed > 12) this.speed -= CFG.BRAKE_FORCE * dt;   // braking
      else this.speed = Math.max(-spec.rev, this.speed + spec.accel * 0.55 * throttle * dt);
    }
    // drag toward zero when coasting
    if (throttle === 0) {
      const drag = CFG.CAR_DRAG * spec.mass * dt;
      if (Math.abs(this.speed) <= drag) this.speed = 0;
      else this.speed -= Math.sign(this.speed) * drag;
    }
    this.speed = clamp(this.speed, -spec.rev, spec.top);

    // steering scales with speed: nothing at standstill, softer at top speed
    const spdF = clamp(Math.abs(this.speed) / 90, 0, 1);
    const steerRate = CFG.STEER_RATE * (1 - 0.35 * clamp(Math.abs(this.speed) / spec.top, 0, 1));
    const dirSign = this.speed < 0 ? -1 : 1;
    if (Math.abs(this.speed) > 4) {
      this.ang = angMove(this.ang, this.ang + steer * steerRate * dt * dirSign * (handbrake ? 1.5 : 1), steerRate * dt * (handbrake ? 1.6 : 1));
    }
    this.steerVis = clamp(this.steerVis + (steer * 0.5 - this.steerVis) * Math.min(1, dt * 10), -0.5, 0.5);

    // velocity: mostly along heading; lateral component decays by grip
    const fx = Math.cos(this.ang), fy = Math.sin(this.ang);
    let latX = this.vx - fx * this.speed;
    let latY = this.vy - fy * this.speed;
    const gripBase = spec.grip * (handbrake ? CFG.HANDBRAKE_GRIP : 1) * gm;
    const latKill = Math.min(1, dt * gripBase);
    latX -= latX * latKill;
    latY -= latY * latKill;
    this.vx = fx * this.speed + latX;
    this.vy = fy * this.speed + latY;
    this.handbrakeVis = handbrake ? 1 : Math.max(0, this.handbrakeVis - dt * 4);

    // drift check for tire marks + screech
    const latLen = Math.hypot(latX, latY);
    if (latLen > 55 && Math.abs(this.speed) > 60) this.tireT += dt;
    else this.tireT = 0;
  }

  /** Integrate position and resolve against the world and other cars. */
  step(dt, game) {
    if (this.dead) return;
    if (this.frozen && this.driver !== 'player') return;

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.lightT += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt * 3;

    this.collideWorld(game);
    this.collideCars(game, dt);

    // fire damage
    if (this.onFire && !this.exploded) {
      this.burnT += dt;
      this.damageSilent(CFG.BURN_RATE * dt, 'fire');
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.08;
        game.effects.push({ type: 'flame', x: this.x + (Math.random() - 0.5) * 14, y: this.y + (Math.random() - 0.5) * 10, t: 0, dur: 0.5, vy: -26 });
      }
    }
    if (this.wrecked && !this.exploded) this.explode(game);
  }

  collideWorld(game) {
    const world = game.world;
    const near = [];
    world.solidsNear(this.x, this.y, Math.max(this.spec.w, this.spec.h) * 0.6 + 24, near);
    const pts = this.corners(CORNERS);
    for (const s of near) {
      for (let i = 0; i < 4; i++) {
        const p = pts[i];
        if (p.x < s.x0 || p.x > s.x1 || p.y < s.y0 || p.y > s.y1) continue;
        // push out along the shallowest axis
        const dl = p.x - s.x0, dr = s.x1 - p.x, dt2 = p.y - s.y0, db = s.y1 - p.y;
        const m = Math.min(dl, dr, dt2, db);
        let px = 0, py = 0;
        if (m === dl) px = -dl; else if (m === dr) px = dr;
        else if (m === dt2) py = -dt2; else py = db;
        this.x += px; this.y += py;
        // kill velocity into the wall
        const vn = this.vx * Math.sign(px || 0) + this.vy * Math.sign(py || 0);
        if (px !== 0) { this.vx *= -0.28; this.vy *= 0.86; }
        if (py !== 0) { this.vy *= -0.28; this.vx *= 0.86; }
        const impact = Math.abs(vn) + Math.abs(this.speed) * 0.2;
        if (impact > 130) {
          this.damageSilent((impact - 130) * 0.05, 'crash');
          game.audio.crash(clamp(impact / 400, 0, 1));
          if (this.driver === 'player') game.cam.shake = Math.min(10, game.cam.shake + impact * 0.012);
          game.effects.push({ type: 'spark', x: p.x, y: p.y, t: 0, dur: 0.3, n: 4 });
        }
        // resync
        this.speed *= 0.8;
        this.corners(pts);
      }
    }
    // prop solids (palms, poles, trees, hydrants)
    for (const p of world.propSolids) {
      const rr = CFG.CAR_RADIUS + p.r;
      const dx = this.x - p.x, dy = this.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr && d2 > 1e-9) {
        const d = Math.sqrt(d2);
        this.x = p.x + (dx / d) * rr;
        this.y = p.y + (dy / d) * rr;
        const spd = Math.abs(this.speed);
        if (p.kind === 'hydrant' && p.primed && spd > 40) {
          // shear the hydrant clean off: street fountain
          p.primed = false;
          game.effects.push({ type: 'jet', x: p.x, y: p.y, t: 0, dur: 3.4 });
          game.audio.crash(0.4);
          this.speed *= 0.7;
          continue;
        }
        if (spd > 90) {
          this.damageSilent((spd - 90) * 0.09, 'crash');
          game.audio.crash(clamp(spd / 300, 0, 1));
          game.effects.push({ type: 'spark', x: this.x, y: this.y, t: 0, dur: 0.3, n: 3 });
        }
        this.speed *= 0.55;
        this.vx *= 0.5; this.vy *= 0.5;
      }
    }
    // water: cars drown
    if (world.isWaterPx(this.x, this.y) && !this.exploded) {
      this.sinkTimer += 1 / 60;
      this.speed *= 0.92;
      this.vx *= 0.92; this.vy *= 0.92;
      if (this.sinkTimer > 1.2) {
        this.explode(game);
        this.sunk = true;
      }
      game.effects.push({ type: 'splash', x: this.x, y: this.y, t: 0, dur: 0.4 });
    } else this.sinkTimer = 0;
  }

  collideCars(game, dt) {
    const cars = game.cars;
    for (const o of cars) {
      if (o === this || o.dead) continue;
      const dx = o.x - this.x, dy = o.y - this.y;
      const rr = (this.spec.w + o.spec.w) * 0.42;
      const d2 = dx * dx + dy * dy;
      if (d2 > rr * rr || d2 < 1e-9) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d;
      const overlap = rr - d;
      const mSum = this.spec.mass + o.spec.mass;
      const thisShare = o.spec.mass / mSum;
      this.x -= nx * overlap * thisShare;
      this.y -= ny * overlap * thisShare;
      o.x += nx * overlap * (1 - thisShare);
      o.y += ny * overlap * (1 - thisShare);
      // relative velocity along normal
      const rvx = o.vx - this.vx, rvy = o.vy - this.vy;
      const rel = rvx * nx + rvy * ny;
      if (rel < 0) {
        const imp = -rel;
        const j = imp * 0.6;
        this.vx -= nx * j / this.spec.mass;
        this.vy -= ny * j / this.spec.mass;
        o.vx += nx * j / o.spec.mass;
        o.vy += ny * j / o.spec.mass;
        this.speed *= 0.7;
        o.speed *= 0.7;
        const force = imp / 60;
        if (force > 1.4) {
          this.damageSilent(force * 2.2, 'crash', o);
          o.damageSilent(force * 2.2, 'crash', this);
          game.audio.crash(clamp(force / 5, 0, 1));
          game.effects.push({ type: 'spark', x: (this.x + o.x) / 2, y: (this.y + o.y) / 2, t: 0, dur: 0.3, n: 5 });
          if (this.driver === 'player' || o.driver === 'player') {
            game.cam.shake = Math.min(9, game.cam.shake + force * 0.9);
          }
        }
      }
    }
  }

  /** Run over a ped. Called by peds.js; applies damage + returns true if hit. */
  hitPed(ped, game) {
    const spd = Math.abs(this.speed);
    if (spd < 26) return false;
    ped.hp -= spd * 0.5;
    ped.x += Math.cos(this.ang) * 12;
    ped.y += Math.sin(this.ang) * 12;
    if (ped.hp <= 0) ped.state = 'dead';
    else ped.state = 'flee';
    this.speed *= 0.86;
    game.effects.push({ type: 'blood', x: ped.x, y: ped.y, t: 0, dur: 0.5 });
    if (this.driver === 'player') {
      game.police.crime(ped.state === 'dead' ? CFG.HEAT_RUN_PED : CFG.HEAT_PED * 0.4, ped.x, ped.y);
    }
    return true;
  }

  damageSilent(n, cause, by) {
    if (this.dead || this.exploded) return;
    if (cause !== 'fire' && cause !== 'drown') this.hp -= n;
    else this.hp -= n;
    if (by) this.lastHitBy = by;
    if (this.hp < CFG.CAR_FIRE_HP && !this.onFire && this.hp > 0) this.onFire = true;
    if (this.hp <= 0) this.hp = 0;
    if (cause === 'crash' || cause === 'bullet') this.hitFlash = 1;
  }

  damage(n, cause, game, by) {
    this.damageSilent(n, cause, by);
  }

  explode(game) {
    if (this.exploded) return;
    this.exploded = true;
    this.dead = true;
    this.onFire = false;
    this.driver = null;
    game.boom(this.x, this.y, this);
    // debris shower
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 90 + Math.random() * 200;
      game.effects.push({
        type: 'debris', x: this.x, y: this.y, t: 0, dur: 0.9 + Math.random() * 0.6,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v, spin: (Math.random() - 0.5) * 14,
        size: 2 + Math.random() * 4,
      });
    }
    // eject the driver as a fleeing ped if it was an ai/civ car
    if (game.onCarExploded) game.onCarExploded(this);
  }

  /** Player-driven convenience: what the speedo shows. */
  mph() {
    return Math.abs(this.speed) * 0.3;
  }
}

/** Pick a fresh civilian car in a lane. */
export function makeTrafficCar(spec, x, y, dir) {
  const color = spec.colors[Math.floor(Math.random() * spec.colors.length)];
  return new Car(spec, x, y, DIR_ANG[dir], {
    color, driver: 'ai', dir, headlights: true,
  });
}

/** Parked car for streets and lots. */
export function makeParkedCar(spec, x, y, ang, color) {
  return new Car(spec, x, y, ang, {
    color: color || spec.colors[0], driver: null, parked: true, headlights: false,
  });
}

/** Simple helper used by missions to place scenario cars. */
export function placeCar(spec, x, y, ang, opts) {
  return new Car(spec, x, y, ang, opts || {});
}

/** All spec ids except the police cruiser. */
export const CIV_SPECS = CAR_SPECS;
