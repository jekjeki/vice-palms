// player.js — the protagonist on foot and behind the wheel: walking, sprinting,
// aiming, fists and pistol, entering and carjacking cars, health and armor.

import { CFG } from './config.js';
import { clamp, dist, angLerp, angNorm, TAU } from './util.js';
import { tryEnterBoat as game_tryBoat } from './boats.js';

/** Spiral out from a boat to the closest tile you can actually stand on. */
function game_nearestLand(game, x, y) {
  for (let r = 24; r <= 220; r += 16) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const lx = x + Math.cos(a) * r;
      const ly = y + Math.sin(a) * r;
      if (!game.world.isWaterPx(lx, ly)) return { x: lx, y: ly };
    }
  }
  return null;
}

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.ang = -Math.PI / 2;
    this.aimAng = -Math.PI / 2;
    this.r = CFG.PLAYER_R;
    this.health = CFG.PLAYER_HP;
    this.armor = 0;
    this.money = 0;
    this.ammo = CFG.AMMO_START;
    this.weapon = 0;          // 0 fists, 1 pistol
    this.car = null;          // Car | null
    this.carEnterT = 0;       // brief animation lock
    this.punchT = 0;
    this.shootT = 0;
    this.walkPhase = 0;
    this.moving = false;
    this.sprinting = false;
    this.dead = false;
    this.bustT = 0;
    this.lastDmgT = 0;
    this.invulT = 0;
    this.stepT = 0;
  }

  get inCar() { return this.car !== null; }

  update(dt, game) {
    if (this.dead) return;
    const input = game.input;

    // weapon switching
    if (input.pressed('Digit1')) this.weapon = 0;
    if (input.pressed('Digit2') && this.ammo > 0) this.weapon = 1;

    this.punchT = Math.max(0, this.punchT - dt);
    this.shootT = Math.max(0, this.shootT - dt);
    this.invulT = Math.max(0, this.invulT - dt);

    if (this.car) {
      this.drive(dt, game);
    } else {
      this.walk(dt, game);
      this.tryEnterCar(dt, game);
      this.combat(dt, game);
    }

    // regen a sliver of health when untouched for a while
    this.lastDmgT += dt;
    if (this.lastDmgT > 12 && this.health < CFG.PLAYER_HP) {
      this.health = Math.min(CFG.PLAYER_HP, this.health + dt * 4);
    }
  }

  walk(dt, game) {
    const input = game.input;
    const mv = input.moveVec();
    const sprint = input.sprinting();
    this.sprinting = sprint && (mv.x !== 0 || mv.y !== 0);
    const spd = CFG.WALK_SPEED * (this.sprinting ? CFG.SPRINT_MULT : 1);
    let len = Math.hypot(mv.x, mv.y);
    this.moving = len > 0;
    if (this.moving) {
      const nx = mv.x / len, ny = mv.y / len;
      // face movement direction unless aiming with the mouse
      if (!this.aimingThisFrame) this.ang = angLerp(this.ang, Math.atan2(ny, nx), Math.min(1, dt * 12));
      const px = this.x, py = this.y;
      const res = game.world.collideCircle(this.x, this.y, this.x + nx * spd * dt, this.y + ny * spd * dt, this.r);
      this.x = res.x; this.y = res.y;
      this.walkPhase += dt * (this.sprinting ? 13 : 8);
      if (game.time - this.stepT > (this.sprinting ? 0.26 : 0.38)) {
        this.stepT = game.time;
      }
      void px; void py;
    }
    // aim at the mouse (world space), even while standing still
    this.aimingThisFrame = false;
    const m = input.mouse;
    if (m.x !== 0 || m.y !== 0) {
      const wx = game.cam.x - game.viewW / 2 + m.x / game.cam.zoom;
      const wy = game.cam.y - game.viewH / 2 + m.y / game.cam.zoom;
      const d = dist(this.x, this.y, wx, wy);
      if (d > 4) {
        const want = Math.atan2(wy - this.y, wx - this.x);
        this.aimAng = want;
        this.ang = angLerp(this.ang, want, Math.min(1, dt * 18));
        this.aimingThisFrame = true;
      }
    }
  }

  drive(dt, game) {
    const input = game.input;
    const car = this.car;
    if (!car || car.exploded) {
      this.exitCar(game, true);
      return;
    }
    const throttle = input.throttleAxis();
    const steer = input.steerAxis();
    const hb = input.handbrake();
    const gm = game.weather ? game.weather.gripMult() : 1;
    car.control(throttle, steer, hb, dt, gm);
    this.x = car.x;
    this.y = car.y;
    this.ang = car.ang;
    // exit
    if (input.consume('KeyE')) this.exitCar(game);
  }

  tryEnterCar(dt, game) {
    const input = game.input;
    if (!input.consume('KeyE')) return;
    let best = null, bd = CFG.ENTER_RANGE;
    for (const c of game.cars) {
      if (c.dead || c.exploded || c.driver === 'cop') continue;
      const d = dist(this.x, this.y, c.x, c.y);
      if (d < bd) { bd = d; best = c; }
    }
    if (best) {
      this.enterCar(game, best);
      return;
    }
    // nothing on wheels? maybe there is a boat at the pier
    game_tryBoat(this, game);
  }

  /** Try to carjack the nearest occupied car (F). */
  tryCarjack(dt, game) {
    const input = game.input;
    if (this.car) return;
    if (!input.consume('KeyF')) return;
    let best = null, bd = CFG.CARJACK_RANGE;
    for (const c of game.cars) {
      if (c.dead || c.exploded || c.driver === 'player') continue;
      if (c.driver !== 'ai' && c.driver !== 'cop') continue;
      const d = dist(this.x, this.y, c.x, c.y);
      if (d < bd) { bd = d; best = c; }
    }
    if (!best) return;
    const wasCop = best.driver === 'cop';
    best.driver = 'player';
    best.parked = false;
    best.throttle = 0;
    best.steer = 0;
    // the driver bails and flees
    game.spawnBailPed(best.x + Math.cos(best.ang) * -24, best.y + Math.sin(best.ang) * -24, wasCop);
    this.enterCar(game, best);
    game.audio.jack();
    game.police.crime(wasCop ? CFG.HEAT_COP : CFG.HEAT_JACK, best.x, best.y);
    if (game.stats) game.stats.bump('jacked');
    if (game.barks) game.barks.onJack({ id: best.id, x: best.x, y: best.y }, wasCop);
    game.hud.subtitle(wasCop ? 'You jacked a police cruiser!' : 'Nice ride.', 2.2);
    game.cam.shake = Math.min(6, game.cam.shake + 3);
  }

  enterCar(game, car) {
    this.car = car;
    car.driver = 'player';
    car.parked = false;
    car.frozen = false;
    this.x = car.x;
    this.y = car.y;
    this.ang = car.ang;
    this.aimAng = car.ang;
    game.audio.jack();
    if (car.siren) car.siren = false;
  }

  exitCar(game, forced) {
    const car = this.car;
    if (!car) return;
    this.car = null;
    car.driver = null;
    car.throttle = 0;
    car.steer = 0;
    // step out beside the door
    const ox = Math.cos(car.ang + Math.PI / 2) * CFG.EXIT_OFFSET;
    const oy = Math.sin(car.ang + Math.PI / 2) * CFG.EXIT_OFFSET;
    let ex = car.x + ox, ey = car.y + oy;
    if (car.spec && car.spec.kind === 'boat') {
      // no doors on water: hop to the nearest dry tile
      const spot = game_nearestLand(game, car.x, car.y);
      if (spot) { ex = spot.x; ey = spot.y; }
    }
    const res = game.world.collideCircle(car.x, car.y, ex, ey, this.r);
    this.x = res.x; this.y = res.y;
    this.ang = car.ang;
    if (forced) game.hud.subtitle('Bail out!', 1.5);
  }

  combat(dt, game) {
    const input = game.input;
    this.tryCarjack(dt, game);

    if (!input.fired()) return;
    if (this.weapon === 0) this.punch(game);
    else this.shoot(game);
  }

  punch(game) {
    if (this.punchT > 0) return;
    this.punchT = CFG.PUNCH_COOLDOWN;
    game.audio.punch();
    // hit cars and peds in a short arc ahead
    const fx = Math.cos(this.ang), fy = Math.sin(this.ang);
    const hx = this.x + fx * CFG.PUNCH_RANGE * 0.7;
    const hy = this.y + fy * CFG.PUNCH_RANGE * 0.7;
    let hit = false;
    const ped = game.peds.near(hx, hy, CFG.PUNCH_RANGE);
    if (ped) {
      ped.damage(CFG.PUNCH_DMG, game, 'punch');
      game.effects.push({ type: 'hit', x: ped.x, y: ped.y, t: 0, dur: 0.2 });
      hit = true;
    }
    for (const c of game.cars) {
      if (c.dead || c.exploded) continue;
      if (dist(hx, hy, c.x, c.y) < CFG.PUNCH_RANGE + 12) {
        c.damageSilent(CFG.PUNCH_DMG * 0.4, 'melee');
        game.effects.push({ type: 'spark', x: hx, y: hy, t: 0, dur: 0.2, n: 3 });
        hit = true;
        break;
      }
    }
    // cop on foot
    const cop = game.police.copNear(hx, hy, CFG.PUNCH_RANGE);
    if (cop) {
      game.police.damageCop(cop, CFG.PUNCH_DMG, game);
      hit = true;
    }
    if (hit) game.cam.shake = Math.min(5, game.cam.shake + 1.5);
  }

  shoot(game) {
    if (this.shootT > 0) return;
    if (this.ammo <= 0) {
      this.weapon = 0;
      game.hud.subtitle('Out of ammo!', 1.6);
      return;
    }
    this.shootT = CFG.GUN_COOLDOWN;
    this.ammo--;
    const spread = (Math.random() - 0.5) * 0.05;
    const a = this.aimAng + spread;
    const fx = Math.cos(this.ang), fy = Math.sin(this.ang);
    game.bullets.push({
      x: this.x + fx * 14, y: this.y + fy * 14,
      dx: Math.cos(a) * CFG.GUN_SPEED, dy: Math.sin(a) * CFG.GUN_SPEED,
      t: 0, dur: CFG.GUN_RANGE / CFG.GUN_SPEED, from: 'player',
    });
    game.audio.gunshot();
    game.peds.gunfire(this.x, this.y, 260);
    game.cam.shake = Math.min(4, game.cam.shake + 1.2);
    // muzzle flash effect
    game.effects.push({ type: 'muzzle', x: this.x + fx * 16, y: this.y + fy * 16, t: 0, dur: 0.06, ang: a });
  }

  /** Bullets and explosions land here. */
  damage(n, game, cause) {
    if (this.dead || this.invulT > 0) return;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, n * 0.7);
      this.armor -= absorbed;
      n -= absorbed;
    }
    this.health -= n;
    this.lastDmgT = 0;
    game.cam.shake = Math.min(8, game.cam.shake + n * 0.12);
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      game.onPlayerDead(cause);
    }
  }

  giveAmmo(n) {
    this.ammo = Math.min(CFG.AMMO_MAX, this.ammo + n);
  }

  giveArmor(n) {
    this.armor = Math.min(CFG.PLAYER_ARMOR_MAX, this.armor + n);
  }

  giveHealth(n) {
    this.health = Math.min(CFG.PLAYER_HP, this.health + n);
  }
}
