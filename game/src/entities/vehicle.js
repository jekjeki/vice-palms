// Vehicles: arcade physics (velocity split into forward and lateral grip), damage states
// (smoke, fire, explosion), and a horn. One class serves the player, traffic and the police;
// the role decides who runs the update AI, which lives in traffic.js and police.js.

import { VEHICLES, POLICE_CAR } from '../config.js';
import { clamp, circlePush } from '../util.js';

export function vehicleDef(index) {
  return index < 0 ? POLICE_CAR : VEHICLES[index];
}

// Collision against the city is injected by game.js to keep the world module free of a
// circular import between entities and the city generator.
let collideCity = null;
export function setVehicleCollision(fn) { collideCity = fn; }

export class Vehicle {
  constructor(defIndex, x, y, ang) {
    this.defIndex = defIndex;
    this.def = vehicleDef(defIndex);
    this.x = x; this.y = y;
    this.ang = ang;
    this.vx = 0; this.vy = 0;          // world-space velocity
    this.speed = 0;                    // signed forward speed (engine audio + HUD)
    this.hp = this.def.hp;
    this.role = 'parked';              // parked | traffic | player | cop
    this.throttle = 0; this.brake = 0; this.steer = 0; this.handbrake = false;
    this.hornAt = 0;
    this.dead = false; this.burnT = 0; this.exploded = false;
    this.siren = false;
    this.color = this.def.color;
    this.driver = null;                // a fleeing Ped reference when carjacked
    // Traffic AI bookkeeping (owned by traffic.js)
    this.axis = 'x'; this.dir = 1; this.lane = 0; this.cruise = 160;
    this.targetAng = ang;
    this.blinker = 0;
    this.stopReason = false;
  }

  get radius() { return this.def.len * 0.42; }

  /** Apply one control frame. The handbrake cuts lateral grip so the car slides. */
  drive(dt, game) {
    if (this.dead || this.exploded) return;
    const def = this.def;
    const cos = Math.cos(this.ang), sin = Math.sin(this.ang);
    let fwd = this.vx * cos + this.vy * sin;
    let lat = -this.vx * sin + this.vy * cos;

    const top = def.top * (this.hp < def.hp * 0.4 ? 0.75 : 1);
    fwd += this.throttle * def.accel * dt;
    if (this.brake > 0) {
      if (fwd > 20) fwd -= def.accel * 1.6 * dt * this.brake;
      else fwd -= def.accel * 0.5 * dt * this.brake; // creep into reverse
    }
    fwd = clamp(fwd, -top * 0.35, top);
    if (this.throttle === 0 && this.brake === 0) fwd *= 1 - 0.35 * dt;

    const gripBase = this.handbrake ? 0.35 : def.grip;
    const grip = gripBase * (1 - Math.min(0.35, (Math.abs(fwd) / def.top) * 0.35));
    lat *= Math.pow(1 - grip, dt * 60);
    lat = clamp(lat, -260, 260);

    const speedAbs = Math.abs(fwd);
    const steerPow = clamp(speedAbs / 120, 0, 1) * (1 - clamp((speedAbs - def.top * 0.72) / def.top, 0, 0.45));
    this.ang += this.steer * def.turn * steerPow * dt * (fwd < -5 ? -1 : 1);

    this.vx = cos * fwd - sin * lat;
    this.vy = sin * fwd + cos * lat;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.speed = fwd;

    if (collideCity) {
      const hit = collideCity(this);
      if (hit) {
        const impact = Math.hypot(this.vx, this.vy);
        if (impact > 150) {
          this.damage((impact - 150) * 0.05, game);
          if (game.fx) game.fx.sparks(this.x, this.y, 4);
          if (this.role === 'player' && impact > 260) game.audio.crash(Math.min(1, impact / 500));
        }
        this.vx = this.vx * 0.55 - 1.4 * (this.vx * hit.nx + this.vy * hit.ny) * hit.nx;
        this.vy = this.vy * 0.55 - 1.4 * (this.vx * hit.nx + this.vy * hit.ny) * hit.ny;
      }
    }
  }

  damage(amount, game) {
    if (this.dead) return;
    this.hp -= amount;
    if (game.fx) {
      if (this.hp < this.def.hp * 0.25) game.fx.vehicleFire(this);
      else if (this.hp < this.def.hp * 0.5) game.fx.vehicleSmoke(this);
    }
    if (this.hp <= 0) {
      this.dead = true;
      this.burnT = 2.0; // burn briefly so the player can bail before the blast
      if (this.role === 'player') game.onPlayerVehicleBurning(this);
    }
  }

  explode(game) {
    if (this.exploded) return;
    this.exploded = true;
    game.fx.explosion(this.x, this.y);
    game.audio.explosion(game.proximity(this.x, this.y));
    game.onExplosion(this);
  }

  update(dt, game) {
    if (this.dead && !this.exploded) {
      this.burnT -= dt;
      game.fx.smoke(this.x, this.y, 2, true);
      if (this.burnT <= 0) this.explode(game);
      return;
    }
    if (this.exploded) { game.fx.smoke(this.x, this.y, 1, true); return; }
    if (this.hp < this.def.hp * 0.25) game.fx.smoke(this.x, this.y, 2, true);
    else if (this.hp < this.def.hp * 0.5 && Math.random() < 0.4) game.fx.smoke(this.x, this.y, 1, false);
  }
}
