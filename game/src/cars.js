// ---------------------------------------------------------------------------
// cars.js — arcade vehicle physics for all 9 types (8 civilian + cruiser).
// Handles acceleration/braking, speed-sensitive steering, handbrake drifts,
// lateral slip, a 4-speed auto gearbox feeding the engine audio, world & car-
// to-car collisions, damage states (smoke → fire → explosion → wreck) and
// headlights. Rendering lives in render.js.
// ---------------------------------------------------------------------------

import { CAR_SPECS, CFG } from './config.js';
import { RNG } from './rng.js';
import { clamp, wrapAngle, TAU } from './util.js';

// showroom blurbs — the HUD name plate quotes these on entry
export const CAR_BLURBS = {
  compact: 'Blista — rental-grade zip',
  sedan: 'Primo — the honest workhorse',
  taxi: 'Cabby — the meter is the boss',
  sports: 'Banshee — loud in all the right ways',
  super: 'Infernus — neon sunset included',
  van: 'Burrito — tastes like cargo',
  pickup: 'Bobcat — fence-post approved',
  bus: 'Coach — 44 grudges aboard',
  police: 'Cruiser — you did NOT earn this',
};

let nextId = 1;

export class Car {
  constructor(type, x, y, angle = 0, variant = 0) {
    const spec = CAR_SPECS[type] || CAR_SPECS.sedan;
    this.id = nextId++;
    this.type = type;
    this.spec = spec;
    this.x = x;
    this.y = y;
    this.angle = angle;          // heading (radians, 0 = +x)
    this.speed = 0;              // forward px/s
    this.slide = 0;              // lateral px/s
    this.steerVis = 0;           // front wheel visual angle
    this.hp = spec.hp;
    this.maxHp = spec.hp;
    this.wrecked = false;
    this.burn = 0;               // burning fuse before explosion (s), 0 = stable
    this.exploded = false;
    this.variant = variant;      // colour index
    this.driver = null;          // 'player' | 'ai' | 'cop' | null
    this.parked = false;
    this.lightsOn = true;
    this.siren = false;
    this.skidTimer = 0;
    this.handbraking = false;
    this.lastImpact = 0;         // timestamp of last hard hit (for camera)
    this.impactMag = 0;
    this.missionTag = null;      // missions can pin identity (e.g. 'target')
    this.occupiedBy = null;      // ped reference when an AI driver is inside
    this.radius = Math.max(spec.len, spec.wid) * 0.52;
    this.honkCd = 0;
    this.gear = 1;
    this.rpm = 0.12;
    this.stuckT = 0;
    this.horn = false;
    this.braking = false;
    this.reversing = false;
    this.lastImpactCorner = -1;
  }

  get dead() { return this.wrecked; }
  get speed01() { return Math.abs(this.speed) / this.spec.max; }
  get damage01() { return 1 - this.hp / this.maxHp; }

  corners() {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    const hl = this.spec.len / 2, hw = this.spec.wid / 2;
    const fx = c * hl, fy = s * hl, rx = s * hw, ry = -c * hw;
    return [
      { x: this.x + fx + rx, y: this.y + fy + ry },
      { x: this.x + fx - rx, y: this.y + fy - ry },
      { x: this.x - fx + rx, y: this.y - fy + ry },
      { x: this.x - fx - rx, y: this.y - fy - ry },
    ];
  }

  containsPoint(px, py) {
    const dx = px - this.x, dy = py - this.y;
    const c = Math.cos(-this.angle), s = Math.sin(-this.angle);
    const lx = dx * c - dy * s, ly = dx * s + dy * c;
    return Math.abs(lx) <= this.spec.len / 2 + 2 && Math.abs(ly) <= this.spec.wid / 2 + 2;
  }

  /**
   * One physics step. ctl = {throttle:-1..1, steer:-1..1, handbrake:bool}
   * Returns impact magnitude if the car hit the world this frame.
   */
  step(dt, ctl, worldRef) {
    if (this.wrecked) { this.speed *= 0.9; this.slide *= 0.9; this._integrate(dt); return 0; }
    const spec = this.spec;

    // ---- longitudinal
    if (ctl.throttle > 0) {
      this.speed += spec.accel * ctl.throttle * dt;
    } else if (ctl.throttle < 0) {
      if (this.speed > 10) this.speed += spec.brake * ctl.throttle * dt;   // braking
      else this.speed = Math.max(this.speed - spec.accel * 0.5 * dt, -spec.rev); // reverse
    }
    this.braking = ctl.throttle < 0 && this.speed > 10;
    this.reversing = this.speed < -5;
    // rolling drag + top speed clamp (damaged engines breathe harder)
    const drag = ctl.throttle === 0 ? 1.6 : 0.55;
    this.speed -= this.speed * drag * dt;
    const topLimit = this.spec.max * (0.55 + 0.45 * (this.hp / this.maxHp));
    this.speed = clamp(this.speed, -spec.rev, topLimit);

    // ---- gearbox (automatic; feeds the engine audio pitch)
    const abs = Math.abs(this.speed);
    this.gear = abs < 1 ? 1 : Math.min(4, 1 + Math.floor(abs / (spec.max / 4.2)));
    const gearFloor = (this.gear - 1) * (spec.max / 4.2);
    const gearSpan = spec.max / 4.2;
    this.rpm = clamp((abs - gearFloor) / gearSpan, 0.12, 1);

    // ---- steering (speed sensitive, reversed when backing up)
    const spd01 = clamp(Math.abs(this.speed) / spec.max, 0, 1);
    const steerAuth = spec.turn * (0.32 + 0.68 * (1 - spd01 * 0.55));
    const dir = this.speed >= 0 ? 1 : -1;
    this.steerVis = clamp(ctl.steer, -1, 1);
    const yaw = ctl.steer * steerAuth * spd01 * 1.6 * dir;

    // ---- grip & drift (rain, handbrake and damage all soften grip)
    const weatherGrip = ctl.grip !== undefined ? ctl.grip : 1;
    const dmgGrip = 1 - this.damage01 * 0.2;
    this.handbraking = !!ctl.handbrake && Math.abs(this.speed) > 60;
    const grip = (ctl.handbrake ? spec.grip * 0.22 : spec.grip) * weatherGrip * dmgGrip;
    // lateral slip picked up while turning hard or handbraking
    const slipGen = (ctl.handbrake ? 2.6 : 1.0) * Math.abs(yaw) * Math.abs(this.speed) * 0.02;
    this.slide += (slipGen * 60 - this.slide) * (grip * dt);
    this.slide *= Math.pow(0.86, dt * 60 * (ctl.handbrake ? 0.35 : 1));
    this.slide = clamp(this.slide, -spec.max * 0.55, spec.max * 0.55);

    this.angle = wrapAngle(this.angle + yaw * dt + this.handlingNoise() * dt * (this.speed >= 0 ? 1 : -1));
    this._integrate(dt);

    // skid audio + marks
    if (Math.abs(this.slide) > 60 && Math.abs(this.speed) > 80) {
      this.skidTimer -= dt;
      return 0; // slide handled by caller for skid marks
    }
    return 0;
  }

  _integrate(dt) {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    this.x += (c * this.speed - s * this.slide) * dt;
    this.y += (s * this.speed + c * this.slide) * dt;
  }

  /** push out of world solids; returns impact px/s or 0 */
  collideWorld(worldRef) {
    let worst = 0;
    let worstCorner = -1;
    const pts = this.corners();
    for (let ci = 0; ci < pts.length; ci++) {
      const p = pts[ci];
      // water is a hard wall for cars
      if (worldRef.isWater(p.x, p.y) && !worldRef.onPier(p.x, p.y)) {
        const fixed = this._resolveWater(worldRef);
        if (fixed) worst = Math.max(worst, Math.abs(this.speed));
        continue;
      }
      const hit = worldRef.collide(p.x, p.y, 2, { water: false });
      if (hit) {
        worstCorner = ci;
        const dx = hit.x - p.x, dy = hit.y - p.y;
        this.x += dx; this.y += dy;
        const impact = Math.abs(this.speed);
        if (impact > 60) {
          const along = Math.abs(dx) + Math.abs(dy);
          this.speed *= along > 0 ? -0.3 : -0.3;
          this.slide *= 0.5;
          this.damage(impact * CFG.CAR_HIT_DMG * 0.8);
          worst = Math.max(worst, impact);
        } else {
          this.speed *= 0.85;
        }
        // re-check the other corners after the push
        break;
      }
    }
    if (worst > 0) {
      this.impactMag = worst;
      this.lastImpact = performance.now() / 1000;
      this.tagImpactCorner(worstCorner);
    }
    return worst;
  }

  _resolveWater(worldRef) {
    // nudge back toward the map interior
    const mid = CFG.WORLD / 2;
    if (this.y < CFG.WATER_N) { this.y = CFG.WATER_N + this.spec.wid; }
    if (this.x > CFG.WATER_E) { this.x = CFG.WATER_E - this.spec.wid; }
    this.speed *= -0.25;
    return true;
  }

  damage(amount) {
    if (this.wrecked) return false;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      return this.catchFire();
    }
    return false;
  }

  /** reached 0 hp → burning; explodes after a short fuse */
  catchFire() {
    if (this.wrecked) return true;
    this.burn = this.burn > 0 ? this.burn : 2.4;
    return true;
  }

  explode() {
    if (this.exploded) return false;
    this.exploded = true;
    this.wrecked = true;
    this.burn = 0;
    this.hp = 0;
    this.driver = null;
    this.lightsOn = false;
    this.siren = false;
    this.hue = CFG.COL.wreck;
    return true;
  }

  /** burning countdown; caller triggers the boom */
  updateBurn(dt) {
    if (this.wrecked || this.burn <= 0) return false;
    this.burn -= dt;
    if (this.burn <= 0) return true; // explode now
    return false;
  }

  /** occupied by the player? kick the AI driver out first (carjack) */
  jack(game) {
    if (this.driver === 'player') return false;
    if (this.driver === 'ai') {
      game.peds.spawnFleeingDriver(this);
      this.driver = null;
      game.police.crime(this.x, this.y, 12, 'carjack');
    }
    this.driver = 'player';
    game.audio.jack();
    return true;
  }

  seatBeltHeal() { /* cars don't heal; placeholder for future pickups */ }

  /** engine audio feed: [rpm01, load01] */
  engineState() {
    return [this.rpm || 0, clamp(Math.abs(this.speed) / this.spec.max, 0, 1)];
  }

  /** true when the AI has been wedged against geometry too long */
  isStuck(dt) {
    if (Math.abs(this.speed) < 12) this.stuckT += dt;
    else this.stuckT = 0;
    return this.stuckT > 2.2;
  }

  /** reverse-and-straighten recovery used by AI drivers */
  unstuckStep(dt) {
    this.stuckT = 0;
    this.step(dt, { throttle: -1, steer: -this.unstuckSide || 1, handbrake: false }, null);
    if (this.unstuckSide === undefined) this.unstuckSide = 1;
    if (Math.random() < dt) this.unstuckSide *= -1;
  }

  // ------------------------------------------------------------ flavour API
  /** full name for toasts/log: "Banshee (scorched)" */
  describe() {
    const state = this.wrecked ? ' (wreck)'
      : this.burn > 0 ? ' (on fire!)'
      : this.damage01 > 0.6 ? ' (beat up)'
      : this.damage01 > 0.25 ? ' (scratched)' : '';
    return this.spec.name + state;
  }

  /** honk: returns true if the honk actually fired (cooldown respected) */
  tryHorn(game) {
    if (this.honkCd > 0 || this.wrecked) return false;
    this.honkCd = 1.4;
    game.audio.honk();
    // peds in front shuffle along
    game.peds.panicNear(this.x + Math.cos(this.angle) * 60, this.y + Math.sin(this.angle) * 60, 70, game);
    return true;
  }

  /** idle exhaust puffs — called by the sim for stopped, occupied cars */
  idlePuff(game) {
    if (this.wrecked || Math.abs(this.speed) > 8) return;
    const bx = this.x - Math.cos(this.angle) * (this.spec.len / 2 + 4);
    const by = this.y - Math.sin(this.angle) * (this.spec.len / 2 + 4);
    game.fx.smokePuff(bx, by, '#4a4e56', 3);
  }

  /** smoke/fire emissive state for the renderer, one pass */
  emissiveState() {
    if (this.wrecked) return 'wreck';
    if (this.burn > 0) return 'fire';
    if (this.hp < this.maxHp * 0.28) return 'burning';
    if (this.hp < this.maxHp * 0.55) return 'smoke';
    return 'ok';
  }

  /** which corner took the last hit — the renderer dents that side first */
  impactCorner() {
    if (!this.lastImpact) return -1;
    const age = performance.now() / 1000 - this.lastImpact;
    return age < 0.5 ? this.lastImpactCorner | 0 : -1;
  }

  /** remember which corner hit what (called by collide helpers) */
  tagImpactCorner(cornerIdx) {
    this.lastImpactCorner = cornerIdx;
    this.lastImpact = performance.now() / 1000;
  }

  // ------------------------------------------------------------ damage feel
  /** bent axles pull the wheel; heavy damage shudders the steering */
  handlingNoise() {
    const d = this.damage01;
    if (d < 0.35) return 0;
    return (d - 0.35) * 0.5;   // radians/s of constant pull
  }

  /** engine stall: below 15% health the engine coughs and stalls out */
  stalled() {
    return this.damage01 > 0.85 && Math.abs(this.speed) < 40;
  }

  /** smoke colour for the exhaust at a given damage level */
  exhaustTone() {
    const d = this.damage01;
    if (d > 0.7) return '#151517';
    if (d > 0.4) return '#3a3d44';
    return '#4a4e56';
  }
}

/** pairwise car/car collision: circle pushout + shared damage */
export function collideCars(cars, game) {
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const rr = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 < 0.001) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d;
      const overlap = rr - d;
      const ma = a.spec.mass, mb = b.spec.mass;
      const totalM = ma + mb;
      a.x -= nx * overlap * (mb / totalM);
      a.y -= ny * overlap * (mb / totalM);
      b.x += nx * overlap * (ma / totalM);
      b.y += ny * overlap * (ma / totalM);
      const rel = Math.abs(a.speed - b.speed) + Math.abs(a.slide - b.slide) * 0.5;
      const impact = rel;
      if (impact > 70) {
        const dmg = impact * CFG.CAR_HIT_DMG * 0.55;
        a.damage(dmg * (mb / totalM) * 2);
        b.damage(dmg * (ma / totalM) * 2);
        a.speed *= 0.55; b.speed *= 0.55;
        a.slide = clamp(a.slide - nx * impact * 0.3, -200, 200);
        b.slide = clamp(b.slide + nx * impact * 0.3, -200, 200);
        game.fx.impactSparks((a.x + b.x) / 2, (a.y + b.y) / 2, impact);
        if (a.driver === 'player' || b.driver === 'player') {
          game.shake(Math.min(impact * 0.012, 6));
          game.police.crime(a.x, a.y, 3, 'ram');
        }
      } else {
        a.speed *= 0.96; b.speed *= 0.96;
      }
    }
  }
}

/** convenient spawner used by traffic, police and missions */
export function spawnCar(type, x, y, angle, opts = {}) {
  const rng = opts.rng || new RNG((x * 31 + y * 17 + Math.floor(angle * 8)) | 0);
  const spec = CAR_SPECS[type];
  const car = new Car(type, x, y, angle, opts.variant !== undefined ? opts.variant : rng.int(0, spec.hue.length));
  if (opts.parked) { car.parked = true; car.lightsOn = false; }
  if (opts.hp !== undefined) car.hp = opts.hp;
  if (opts.tag) car.missionTag = opts.tag;
  return car;
}

// ---------------------------------------------------------------------------
// mass-scaled collision damage helper — heavier vehicles dish out more than
// they take. Returns the damage the ATTACKER deals to the TARGET.
// ---------------------------------------------------------------------------
export function ramDamage(attacker, target, impact) {
  const massRatio = attacker.spec.mass / (attacker.spec.mass + target.spec.mass);
  return impact * CFG.CAR_HIT_DMG * 0.55 * 2 * massRatio;
}

/** per-type horn pitch (Hz) — the audio system reads this for variety */
export const HORN_PITCH = {
  compact: 520, sedan: 460, taxi: 480, sports: 600,
  super: 620, van: 380, pickup: 400, bus: 300, police: 440,
};
