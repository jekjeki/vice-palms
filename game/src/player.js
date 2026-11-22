// The player: Rico, on foot and behind the wheel. Walking with sprint, punches, the pistol,
// car entering and stealing, and the health/armor model the cops and blasts wear down.

import { PUNCH_CD, PUNCH_DMG, WALK_SPEED, SPRINT_SPEED } from './config.js';
import { clamp, dist2 } from './util.js';
import { collideCity } from './world/city.js';

export class Hero {
  constructor(game, x, y) {
    this.game = game;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.heading = -Math.PI / 2;
    this.health = 100;
    this.armor = 0;
    this.money = 250;
    this.ammo = 0;
    this.weapon = 'fist';          // fist | pistol
    this.car = null;
    this.shootT = 0;
    this.punchT = 0;
    this.walkPhase = 0;
    this.dead = false;
  }

  hit(dmg, fromX, fromY) {
    if (this.dead) return;
    let d = dmg;
    if (this.armor > 0) {
      const soaked = Math.min(this.armor, d * 0.7);
      this.armor -= soaked;
      d -= soaked;
    }
    this.health -= d;
    this.game.fx.blood(this.x, this.y, 3);
    // Every hit on Rico reads in the camera too, however small.
    this.game.shake = Math.min(8, this.game.shake + 1.4);
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.game.onHeroDown();
    } else {
      this.game.audio.punch();
    }
  }

  update(dt, input) {
    const game = this.game;
    this.shootT -= dt;
    this.punchT -= dt;
    if (this.car) {
      this.x = this.car.x;
      this.y = this.car.y;
      this.heading = this.car.ang;
      this.drive(input, game);
      return;
    }
    if (this.dead) return;

    const ax = input.axis();
    const sprint = input.held('ShiftLeft') || input.held('ShiftRight');
    const top = sprint ? SPRINT_SPEED : WALK_SPEED;
    this.vx += clamp(ax.x * top - this.vx, -1450 * dt, 1450 * dt);
    this.vy += clamp(ax.y * top - this.vy, -1450 * dt, 1450 * dt);
    if (ax.x === 0 && ax.y === 0) { this.vx *= 1 - 8 * dt; this.vy *= 1 - 8 * dt; }
    if (Math.hypot(this.vx, this.vy) > 10) {
      this.heading = Math.atan2(this.vy, this.vx);
      this.walkPhase += dt * (sprint ? 11 : 7);
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const res = collideCity(game.city, this.x, this.y, 9);
    this.x = res.x; this.y = res.y;

    if (input.tap('KeyF')) game.tryCar();
    if (input.tap('Space')) this.punch();
    if ((input.tap('KeyE') || input.tap('MouseLeft')) && this.ammo > 0 && this.shootT <= 0) this.shoot();
  }

  drive(input, game) {
    const car = this.car;
    const ax = input.axis();
    car.gas = ax.y < 0 ? 1 : 0;
    car.brake = ax.y > 0 ? 1 : 0;
    car.steer = ax.x;
    car.slide = input.held('Space');
    if (input.tap('KeyH')) {
      game.audio.horn?.();
      game.honk(car);
    }
    if (input.tap('KeyF')) game.leaveCar();
  }

  punch() {
    if (this.punchT > 0) return;
    this.punchT = PUNCH_CD;
    const game = this.game;
    const rx = this.x + Math.cos(this.heading) * 26;
    const ry = this.y + Math.sin(this.heading) * 26;
    game.audio.punch();
    for (const person of game.people) {
      if (person.mode === 'down') continue;
      if (dist2(person.x, person.y, rx, ry) < 26 * 26) {
        const down = person.hurt(game, PUNCH_DMG, this.x, this.y);
        game.wanted.add(down ? 'pedKill' : 'pedHit');
        game.fx.blood(person.x, person.y, 3);
        break;
      }
    }
    for (const c of game.cars) {
      if (c.wasted || c === this.car) continue;
      if (dist2(c.x, c.y, rx, ry) < (c.radius + 14) ** 2) {
        c.damage(6, game);
        game.fx.sparks(c.x, c.y, 2);
        break;
      }
    }
  }

  shoot() {
    const game = this.game;
    this.shootT = 0.24;
    this.ammo--;
    game.audio.shot(1);
    game.wanted.gunshot();
    game.fx.muzzle(this.x + Math.cos(this.heading) * 16, this.y + Math.sin(this.heading) * 16, this.heading);
    game.bullets.fire(this.x + Math.cos(this.heading) * 18, this.y + Math.sin(this.heading) * 18, this.heading, 880, true, 16);
    game.scarePeople(this.x, this.y, 430);
    // A shot rocks the frame a touch: the pistol should feel fired, not clicked.
    game.shake = Math.min(10, game.shake + 1.6);
  }

  pickup(kind, amount) {
    const game = this.game;
    if (kind === 'pistol') { this.weapon = 'pistol'; this.ammo += amount ?? 24; }
    else if (kind === 'health') this.health = Math.min(100, this.health + 50);
    else if (kind === 'armor') this.armor = Math.min(100, this.armor + 50);
    else if (kind === 'cash') this.money += amount ?? 120;
    game.audio.blip(700);
    game.fx.cash(this.x, this.y);
  }
}
