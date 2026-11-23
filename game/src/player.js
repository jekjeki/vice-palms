// ---------------------------------------------------------------------------
// player.js — the hood. Walk, sprint, take cover, throw fists, fire the
// pistol with mouse aim, jack cars with F, ride, bail, bleed.
// ---------------------------------------------------------------------------

import { CFG } from './config.js';
import { clamp, dist2, wrapAngle, angleDamp } from './util.js';
import { CAR_BLURBS } from './cars.js';

export class Player {
  constructor(x, y, angle = 0) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.vx = 0;
    this.vy = 0;
    this.health = CFG.HEALTH_MAX;
    this.armor = 0;
    this.money = 250;
    this.ammo = 34;
    this.weapon = 'pistol';       // 'fist' | 'pistol'
    this.inCar = null;            // Car reference while driving
    this.fireCd = 0;
    this.walkPhase = 0;
    this.hurtT = 0;
    this.skin = '#d8ae86';
    this.shirt = '#3fd9ff';
    this.pants = '#2e3440';
    this.exitCd = 0;
    this.jackCd = 0;
    this.aimAngle = angle;
    this.dead = false;
    this.stamina = 100;
    this.sprinting = false;
    this.swimming = false;
    this.swimT = 0;
  }

  get radius() { return CFG.PLAYER_R; }

  update(dt, game) {
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.exitCd = Math.max(0, this.exitCd - dt);
    this.jackCd = Math.max(0, this.jackCd - dt);
    if (this.inCar) {
      this.x = this.inCar.x;
      this.y = this.inCar.y;
      this.angle = this.inCar.angle;
      this.driveControls(dt, game);
      return;
    }
    this.footControls(dt, game);
  }

  footControls(dt, game) {
    const input = game.input;
    const world = game.world;

    // ---- aim: mouse if it moved, else movement facing
    const worldMouse = game.renderer.screenToWorld(input.mouse.x, input.mouse.y);
    if (input.mouse.moved || input.mouse.down) {
      this.aimAngle = Math.atan2(worldMouse.y - this.y, worldMouse.x - this.x);
    }

    // ---- movement
    let mx = 0, my = 0;
    if (input.isDown('KeyW', 'ArrowUp')) my -= 1;
    if (input.isDown('KeyS', 'ArrowDown')) my += 1;
    if (input.isDown('KeyA', 'ArrowLeft')) mx -= 1;
    if (input.isDown('KeyD', 'ArrowRight')) mx += 1;
    const mag = Math.hypot(mx, my);

    // swimming? (sea covers most of the north; piers are safe)
    this.swimming = game.world.isWater(this.x, this.y) && !game.world.onPier(this.x, this.y);
    if (this.swimming) {
      this.swimT = (this.swimT || 0) + dt;
      if (this.swimT > 6) this.health -= dt * 3;   // cold water gets you eventually
      if (this.health <= 0) game.onPlayerDeath('drowned');
    } else {
      this.swimT = 0;
    }

    // sprint stamina
    const wantSprint = input.isDown('ShiftLeft', 'ShiftRight') && mag > 0;
    if (wantSprint && this.stamina > 0 && !this.swimming) {
      this.stamina = Math.max(0, this.stamina - dt * 22);
      this.sprinting = true;
    } else {
      this.stamina = Math.min(100, this.stamina + dt * (mag > 0 ? 9 : 16));
      this.sprinting = false;
      if (this.stamina <= 0) this.sprinting = false;
    }

    const speed = this.swimming ? 74 : (this.sprinting ? CFG.SPRINT : CFG.WALK);
    if (mag > 0) {
      mx /= mag; my /= mag;
      this.x += mx * speed * dt;
      this.y += my * speed * dt;
      if (!(input.mouse.moved || input.mouse.down)) {
        this.angle = wrapAngle(Math.atan2(my, mx));
      }
      this.walkPhase += dt * (this.sprinting ? 14 : this.swimming ? 6 : 9);
      // kicked-up heel dust when sprinting on dry land
      if (this.sprinting && !this.swimming && Math.random() < dt * 14) {
        game.fx.smokePuff(this.x - mx * 8, this.y - my * 8, '#3a3f48', 2);
      }
    } else {
      this.walkPhase += dt * 2;
    }
    if (input.mouse.moved || input.mouse.down) {
      this.angle = this.aimAngle;
    } else if (this.weapon === 'pistol' && input.mouse.down) {
      this.angle = this.aimAngle;
    }

    // ---- world collision
    const fixed = world.collide(this.x, this.y, CFG.PLAYER_R);
    if (fixed) { this.x = fixed.x; this.y = fixed.y; }

    // ---- footsteps (soft ticks, faster when sprinting)
    this.stepAcc = (this.stepAcc || 0) + dt * (mag > 0 ? (this.sprinting ? 2.4 : 1.5) : 0);
    if (this.stepAcc > 1) {
      this.stepAcc = 0;
      game.audio.footstep(this.swimming);
      if (this.swimming) game.fx.ripple(this.x, this.y);
    }

    // ---- weapons
    if (this.fireCd <= 0 && (input.mouse.down || input.mouse.clicked || input.isDown('Space'))) {
      this.fire(game);
    }
    if (input.wasPressed('Digit1')) this.weapon = 'fist';
    if (input.wasPressed('Digit2')) this.weapon = 'pistol';

    // ---- vehicle interaction
    if (input.wasPressed('KeyF') && this.jackCd <= 0) {
      this.tryCarInteract(game);
    }
  }

  driveControls(dt, game) {
    const input = game.input;
    const car = this.inCar;
    // engine audio
    game.audio.engineUpdate(car.speed01, input.isDown('KeyW', 'ArrowUp') ? 1 : 0);
    if (input.wasPressed('KeyF') && this.exitCd <= 0) {
      this.exitCar(game);
      return;
    }
    // horn / siren toggle for fun
    if (input.wasPressed('KeyH') && car.type === 'police') car.siren = !car.siren;
    if (input.wasPressed('KeyH') && car.type !== 'police') this.honk(game);
    // shooting from the car: allow pistol fire out the window
    if (this.fireCd <= 0 && (input.mouse.clicked || input.wasPressed('Space'))) {
      this.fireFromCar(game);
    }
  }

  fire(game) {
    const input = game.input;
    if (this.weapon === 'fist') {
      this.fireCd = CFG.FIST_CD;
      this.punch(game);
      return;
    }
    if (this.ammo <= 0) {
      // dry click — swap to fists so the player notices
      this.weapon = 'fist';
      return;
    }
    this.ammo--;
    this.fireCd = CFG.PISTOL_CD;
    const a = this.aimAngle;
    const mx = this.x + Math.cos(a) * 16, my = this.y + Math.sin(a) * 16;
    game.fx.muzzleFlash(mx, my, a);
    game.fx.muzzleSmoke(mx, my);
    game.fx.casing(this.x + Math.cos(a + Math.PI / 2) * 8, this.y + Math.sin(a + Math.PI / 2) * 8);
    game.audio.gunshot();
    game.bullet(this.x, this.y, a, { from: 'player', dmgPed: CFG.PISTOL_DMG_PED, dmgCar: CFG.PISTOL_DMG_CAR, range: CFG.PISTOL_RANGE });
    game.police.gunfireHeard(this.x, this.y);
    game.peds.panicNear(this.x, this.y, 240, game);
    game.traffic.panicNear(this.x, this.y, 240);
    game.shake(1.2);
  }

  fireFromCar(game) {
    if (this.ammo <= 0) return;
    const worldMouse = game.renderer.screenToWorld(game.input.mouse.x, game.input.mouse.y);
    const a = Math.atan2(worldMouse.y - this.y, worldMouse.x - this.x);
    this.ammo--;
    this.fireCd = CFG.PISTOL_CD * 1.4;
    game.fx.muzzleFlash(this.x + Math.cos(a) * 24, this.y + Math.sin(a) * 24, a);
    game.audio.gunshot();
    game.bullet(this.x, this.y, a, { from: 'player', dmgPed: CFG.PISTOL_DMG_PED, dmgCar: CFG.PISTOL_DMG_CAR, range: CFG.PISTOL_RANGE });
    game.police.gunfireHeard(this.x, this.y);
    game.peds.panicNear(this.x, this.y, 240, game);
    game.shake(1.0);
  }

  punch(game) {
    const a = this.angle;
    const px = this.x + Math.cos(a) * 18, py = this.y + Math.sin(a) * 18;
    game.audio.punch();
    // hit peds
    for (const p of game.peds.list) {
      if (p.state === 'dead') continue;
      if (dist2(px, py, p.x, p.y) < 24 * 24) {
        p.hurt(CFG.FIST_DMG, this.x, this.y, game);
        game.fx.impactSparks(p.x, p.y, 80);
        return;
      }
    }
    // hit cars (dents)
    for (const c of game.allCars()) {
      if (c.wrecked) continue;
      if (c.containsPoint(px, py)) {
        c.damage(6);
        game.fx.impactSparks(px, py, 60);
        game.police.crime(px, py, 2, 'vandal');
        return;
      }
    }
  }

  tryCarInteract(game) {
    // nearest enterable car within reach
    let best = null, bd = Infinity;
    for (const c of game.allCars()) {
      if (c.wrecked) continue;
      const d = dist2(this.x, this.y, c.x, c.y);
      if (d < 70 * 70 && d < bd) { bd = d; best = c; }
    }
    if (!best) return;
    this.jackCd = 0.4;
    this.exitCd = 0.6;
    if (best.jack(game)) {
      this.inCar = best;
      best.parked = false;
      this.jackCd = 0;      // (drive handlers keep their own cooldowns)
      game.stats.jacks++;
      game.audio.engineStart();
      game.police.crime(this.x, this.y, best.driver === 'player' ? 0 : 0, 'enter');
    }
  }

  exitCar(game) {
    const car = this.inCar;
    if (!car) return;
    // pop out on the left side, or right if blocked
    const side = car.angle - Math.PI / 2;
    let ex = car.x + Math.cos(side) * (car.spec.wid / 2 + 14);
    let ey = car.y + Math.sin(side) * (car.spec.wid / 2 + 14);
    if (game.world.solidHit(ex, ey, CFG.PLAYER_R)) {
      ex = car.x - Math.cos(side) * (car.spec.wid / 2 + 14);
      ey = car.y - Math.sin(side) * (car.spec.wid / 2 + 14);
    }
    const fixed = game.world.collide(ex, ey, CFG.PLAYER_R);
    if (fixed) { ex = fixed.x; ey = fixed.y; }
    this.x = ex; this.y = ey;
    this.inCar = null;
    car.driver = null;
    car.parked = true;
    car.speed *= 0.2;
    this.exitCd = 0.5;
    game.audio.engineStop();
  }

  /** H key while driving: horn (traffic scatters a touch) */
  honk(game) {
    if (!this.inCar) return false;
    return this.inCar.tryHorn(game);
  }

  enterCar(car, game) {
    this.inCar = car;
    car.driver = 'player';
    car.parked = false;
    game.audio.engineStart();
  }

  damage(n, game, cause = 'hurt') {
    if (this.dead) return;
    // armor soaks first
    if (this.armor > 0) {
      const soak = Math.min(this.armor, n * 0.7);
      this.armor -= soak;
      n -= soak;
    }
    this.health -= n;
    this.hurtT = 0.4;
    game.audio.hurt();
    game.shake(2.5);
    game.fx.blood(this.x, this.y, 4);
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      game.onPlayerDeath(cause);
    }
  }

  heal(n) {
    this.health = clamp(this.health + n, 0, CFG.HEALTH_MAX);
  }

  addArmor(n) {
    this.armor = clamp(this.armor + n, 0, CFG.ARMOR_MAX);
  }

  addAmmo(n) {
    this.ammo += n;
  }

  addMoney(n) {
    const before = this.money;
    this.money = Math.max(0, this.money + n);
    return this.money - before; // actual delta (clamped at zero)
  }
}
