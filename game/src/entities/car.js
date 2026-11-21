// Cars: arcade physics with the velocity split into a gripped forward component and a sliding
// lateral one; the handbrake slashes lateral grip so the tail steps out. Damage climbs from
// smoke to fire to a burning wreck, then the blast. One class serves the player, traffic and
// the police; the `role` decides whose AI drives it (traffic.js / cops.js).

import { CARS, WARDEN } from '../config.js';
import { clamp, circlePush } from '../util.js';
import { rand } from '../rng.js';

export function carSpec(index) { return index < 0 ? WARDEN : CARS[index]; }

// The world collision callback is injected by game.js so entities never import the city.
let worldCollide = null;
export function setWorldCollide(fn) { worldCollide = fn; }

export class Car {
  constructor(specIndex, x, y, ang) {
    this.specIndex = specIndex;
    this.spec = carSpec(specIndex);
    this.x = x; this.y = y;
    this.ang = ang;
    this.vx = 0; this.vy = 0;
    this.fwd = 0;                 // signed forward speed (HUD, engine audio, AI)
    this.hp = this.spec.hp;
    this.role = 'parked';         // parked | traffic | player | cop
    this.gas = 0; this.brake = 0; this.steer = 0; this.slide = false;
    this.wreck = false; this.burn = 0; this.wasted = false;
    this.siren = false;
    this.tag = null;              // mission tags live here
    // Traffic bookkeeping (traffic.js owns these).
    this.axis = 'x'; this.dir = 1; this.lane = 0; this.cruise = 150;
    this.gearT = 0; this.blinker = 0; this.stopped = false; this.wreckAge = 0;
  }

  get radius() { return this.spec.len * 0.42; }

  /** One physics frame. Lateral grip falls a little with speed; the handbrake cuts it hard. */
  drive(dt, game) {
    if (this.wreck || this.wasted) return;
    const s = this.spec;
    const cos = Math.cos(this.ang), sin = Math.sin(this.ang);
    let fwd = this.vx * cos + this.vy * sin;
    let lat = -this.vx * sin + this.vy * cos;

    const limiter = this.hp < s.hp * 0.4 ? 0.72 : 1;
    const top = s.top * limiter;
    fwd += this.gas * s.accel * dt;
    if (this.brake > 0) {
      if (fwd > 18) fwd -= s.accel * 1.7 * dt * this.brake;
      else fwd -= s.accel * 0.55 * dt * this.brake;
    }
    fwd = clamp(fwd, -top * 0.36, top);
    if (this.gas === 0 && this.brake === 0) fwd *= 1 - 0.34 * dt;

    const baseGrip = this.slide ? 0.34 : s.grip;
    const grip = baseGrip * (1 - Math.min(0.32, (Math.abs(fwd) / s.top) * 0.32));
    lat *= Math.pow(1 - grip, dt * 60);
    lat = clamp(lat, -280, 280);

    const abs = Math.abs(fwd);
    const bite = clamp(abs / 120, 0, 1) * (1 - clamp((abs - s.top * 0.7) / s.top, 0, 0.42));
    this.ang += this.steer * s.turn * bite * dt * (fwd < -5 ? -1 : 1);

    this.vx = cos * fwd - sin * lat;
    this.vy = sin * fwd + cos * lat;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.fwd = fwd;

    if (worldCollide) {
      const hit = worldCollide(this);
      if (hit) {
        const speed = Math.hypot(this.vx, this.vy);
        if (speed > 150) {
          this.damage((speed - 150) * 0.05, game);
          if (game.fx) game.fx.sparks(this.x, this.y, 4);
          if (this.role === 'player' && speed > 260) game.audio.crash(Math.min(1, speed / 500));
        }
        const dot = this.vx * hit.nx + this.vy * hit.ny;
        this.vx = this.vx * 0.55 - 1.4 * dot * hit.nx;
        this.vy = this.vy * 0.55 - 1.4 * dot * hit.ny;
      }
    }
  }

  damage(amount, game) {
    if (this.wreck) return;
    this.hp -= amount;
    if (game.fx) {
      if (this.hp < this.spec.hp * 0.25) game.fx.carFire(this);
      else if (this.hp < this.spec.hp * 0.5) game.fx.carSmoke(this);
    }
    if (this.hp <= 0) {
      this.wreck = true;
      this.burn = 2.0;             // two seconds to bail out before the blast
      this.fwd = 0;
      if (this.role === 'player') game.onPlayerCarBurning(this);
      if (this.role === 'cop') game.cops.onCruiserDown(this);
    }
  }

  blowUp(game) {
    if (this.wasted) return;
    this.wasted = true;
    game.fx.blast(this.x, this.y);
    game.audio.boom(game.proximity(this.x, this.y));
    game.onBlast(this);
  }

  /** Between-physics upkeep: wreck timers and damage-state particles. */
  update(dt, game) {
    if (this.wreck && !this.wasted) {
      this.burn -= dt;
      this.wreckAge = (this.wreckAge ?? 0) - dt;
      game.fx.smoke(this.x, this.y, 2, true);
      if (this.burn <= 0) this.blowUp(game);
      return;
    }
    if (this.wasted) { game.fx.smoke(this.x, this.y, 1, true); return; }
    if (this.hp < this.spec.hp * 0.25) game.fx.smoke(this.x, this.y, 2, true);
    else if (this.hp < this.spec.hp * 0.5 && rand() < 0.4) game.fx.smoke(this.x, this.y, 1, false);
  }
}
