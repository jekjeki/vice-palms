// The player: Rico on foot and behind the wheel. Foot movement with sprint, melee, the
// pistol, car entering/stealing, and the health/armor model the police and explosions use.

import { WALK_SPEED, SPRINT_SPEED } from '../config.js';
import { clamp, dist2 } from '../util.js';
import { collideCircle } from '../world/city.js';

export class Player {
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
    this.inCar = null;
    this.shootT = 0;
    this.punchT = 0;
    this.walkPhase = 0;
    this.dead = false;
    this.busted = false;
  }

  hit(dmg, fromX, fromY) {
    if (this.dead) return;
    let d = dmg;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, d * 0.7);
      this.armor -= absorbed;
      d -= absorbed;
    }
    this.health -= d;
    this.game.fx.blood(this.x, this.y, 3);
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.game.onPlayerWasted();
    } else {
      this.game.audio.punch();
    }
  }

  update(dt, input) {
    const game = this.game;
    this.shootT -= dt;
    this.punchT -= dt;
    if (this.inCar) {
      this.x = this.inCar.x;
      this.y = this.inCar.y;
      this.heading = this.inCar.ang;
      this.driveControls(input, game);
      return;
    }
    if (this.dead) return;

    const ax = input.axis();
    const sprint = input.held('ShiftLeft') || input.held('ShiftRight');
    const top = sprint ? SPRINT_SPEED : WALK_SPEED;
    const targetVx = ax.x * top, targetVy = ax.y * top;
    this.vx += clamp(targetVx - this.vx, -1400 * dt, 1400 * dt);
    this.vy += clamp(targetVy - this.vy, -1400 * dt, 1400 * dt);
    if (ax.x === 0 && ax.y === 0) { this.vx *= 1 - 8 * dt; this.vy *= 1 - 8 * dt; }
    const moving = Math.hypot(this.vx, this.vy) > 10;
    if (moving) this.heading = Math.atan2(this.vy, this.vx);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (moving) this.walkPhase += dt * (sprint ? 11 : 7);

    const res = collideCircle(game.city, this.x, this.y, 9);
    this.x = res.x; this.y = res.y;

    if (input.hit('KeyF')) game.tryEnterVehicle();
    if (input.hit('Space')) this.punch();
    if ((input.hit('KeyE') || input.hit('MouseLeft')) && this.ammo > 0 && this.shootT <= 0) this.shoot();
  }

  driveControls(input, game) {
    const car = this.inCar;
    const ax = input.axis();
    car.throttle = ax.y < 0 ? 1 : 0;
    car.brake = ax.y > 0 ? 1 : 0;
    car.steer = ax.x;
    car.handbrake = input.held('Space');
    if (input.hit('KeyH')) {
      game.audio.blip(180);
      game.honk(car);
    }
    if (input.hit('KeyF')) game.exitVehicle();
  }

  punch() {
    if (this.punchT > 0) return;
    this.punchT = 0.42;
    const game = this.game;
    const rx = this.x + Math.cos(this.heading) * 26;
    const ry = this.y + Math.sin(this.heading) * 26;
    game.audio.punch();
    // Peds in reach take the hit and their friends flee.
    for (const ped of game.peds) {
      if (ped.dead || ped.state === 'down') continue;
      if (dist2(ped.x, ped.y, rx, ry) < 26 * 26) {
        const down = ped.hurt(game, 12, this.x, this.y);
        game.wanted.add(down ? 'pedKill' : 'pedHit');
        game.fx.blood(ped.x, ped.y, 3);
        break;
      }
    }
    for (const v of game.vehicles) {
      if (v.exploded || v === this.inCar) continue;
      if (dist2(v.x, v.y, rx, ry) < (v.radius + 14) ** 2) { v.damage(6, game); game.fx.sparks(v.x, v.y, 2); break; }
    }
  }

  shoot() {
    const game = this.game;
    this.shootT = 0.28;
    this.ammo--;
    game.audio.shot(1);
    game.wanted.gunshot();
    game.fx.muzzle(this.x + Math.cos(this.heading) * 16, this.y + Math.sin(this.heading) * 16, this.heading);
    game.bullets.fire(this.x + Math.cos(this.heading) * 18, this.y + Math.sin(this.heading) * 18, this.heading, 880, true, 16);
    game.alertNearbyPeds(this.x, this.y, 420);
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
