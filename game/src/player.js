// player.js — on-foot movement, carjack/enter/exit, health & armor, fists + pistol
import { CFG } from './config.js';
import { clamp, dist, angleTo, circleRect, carCircle, TAU } from './util.js';
import { carAt as findCar } from './cars.js';
import { pedAt } from './peds.js';

export class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.h = -Math.PI / 2;
    this.r = 9;
    this.hp = CFG.P_HP;
    this.armor = 0;
    this.money = 500;
    this.ammo = 24;
    this.inCar = null;          // Car reference
    this.alive = true;
    this.shootCd = 0;
    this.punchT = 0;
    this.sprint = 0;            // stamina-ish 0..1
    this.walkPhase = 0;
    this.moving = false;
    this.exitCd = 0;
    this.enterCd = 0;
    this.hurtT = 0;
    this.muzzleT = 0;
    this.carjackT = 0;
    this.skin = '#d9b08c';
    this.shirt = '#ff5da2';
    this.pants = '#20242e';
  }

  get speedCap() { return this.inCar ? 0 : (this.sprinting ? CFG.P_SPRINT : CFG.P_WALK); }

  update(game, dt, input) {
    this.shootCd = Math.max(0, this.shootCd - dt);
    this.punchT = Math.max(0, this.punchT - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.muzzleT = Math.max(0, this.muzzleT - dt);
    this.exitCd = Math.max(0, this.exitCd - dt);
    this.enterCd = Math.max(0, this.enterCd - dt);
    this.carjackT = Math.max(0, this.carjackT - dt);

    if (!this.alive) return;

    // camera-facing aim from mouse (world space)
    const cam = game.cam;
    const mwx = cam.x + (input.mouse.x - CFG.VIEW_W / 2);
    const mwy = cam.y + (input.mouse.y - CFG.VIEW_H / 2);

    if (this.inCar) {
      this.x = this.inCar.x; this.y = this.inCar.y; this.h = this.inCar.h;
      // exit / carjack-switch with F
      if (input.pressed('F') && this.exitCd <= 0) this.tryExit(game);
      // drive-by: shoot left/right of car with mouse
      if ((input.mouse.down || input.mouse.clicked) && this.shootCd <= 0 && this.ammo > 0) this.shoot(game, mwx, mwy, true);
      if (input.pressed('SPACE') === false && input.anyPressed('SPACE')) { /* handbrake handled by car */ }
      return;
    }

    // ---- on-foot movement ----
    let vx = 0, vy = 0;
    if (input.anyDown('W', 'UP')) vy -= 1;
    if (input.anyDown('S', 'DOWN')) vy += 1;
    if (input.anyDown('A', 'LEFT')) vx -= 1;
    if (input.anyDown('D', 'RIGHT')) vx += 1;
    this.sprinting = input.down('SHIFT') && (vx || vy);
    const sp = this.sprinting ? CFG.P_SPRINT : CFG.P_WALK;
    this.moving = !!(vx || vy);
    if (this.moving) {
      const l = Math.hypot(vx, vy);
      vx = (vx / l) * sp; vy = (vy / l) * sp;
      this.walkPhase += dt * (this.sprinting ? 14 : 9);
      // aim at mouse while moving slowly, else face move dir
      if (!input.mouse.down) this.h = angleTo(0, 0, vx, vy);
    }
    if (input.mouse.x !== undefined) {
      const aimA = angleTo(this.x, this.y, mwx, mwy);
      this.h = aimA;
    }

    // collide with solids
    this.moveCollide(game, vx, vy, dt);

    // ---- enter / carjack ----
    if (input.pressed('F') && this.enterCd <= 0) this.tryEnter(game);

    // ---- punch ----
    if ((input.pressed('E') || (input.mouse.clicked && this.ammo <= 0)) && this.punchT <= 0) this.punch(game);

    // ---- shoot pistol ----
    if ((input.mouse.down || input.mouse.clicked) && this.shootCd <= 0) {
      if (this.ammo > 0) this.shoot(game, mwx, mwy, false);
      else if (game.t - (this.lastClickMsg || -9) > 2.5) {
        this.lastClickMsg = game.t;
        game.hud.toast('Out of ammo — find an ammo pickup');
      }
    }
    // ammo pickup
    game.tryPickup(this);
  }

  moveCollide(game, vx, vy, dt) {
    let nx = this.x + vx * dt, ny = this.y + vy * dt;
    // solids
    const solids = game.world.nearSolids(nx, ny);
    for (const r of solids) {
      const hit = circleRect(nx, ny, this.r, r);
      if (hit) { nx += hit.x; ny += hit.y; }
    }
    // palms
    for (const p of game.world.palmSolids) {
      const dx = nx - p.x, dy = ny - p.y, d = Math.hypot(dx, dy);
      if (d < p.r + this.r && d > 0.001) { nx = p.x + (dx / d) * (p.r + this.r); ny = p.y + (dy / d) * (p.r + this.r); }
    }
    // cars as colliders
    for (const c of game.cars) {
      if (Math.abs(c.x - nx) > 120 || Math.abs(c.y - ny) > 120) continue;
      if (c === this.inCar) continue;
      if (carCircle(c, nx, ny, this.r + 2)) {
        // push out along the shortest axis of the oriented box
        const cs = Math.cos(-c.h), sn = Math.sin(-c.h);
        const dx = nx - c.x, dy = ny - c.y;
        const lx = dx * cs - dy * sn, ly = dx * sn + dy * cs;
        const qx = clamp(lx, -c.len / 2, c.len / 2), qy = clamp(ly, -c.wid / 2, c.wid / 2);
        let px = lx - qx, py = ly - qy;
        const pl = Math.hypot(px, py);
        if (pl < 0.001) { px = 1; py = 0; } else { px /= pl; py /= pl; }
        const push = this.r + 2 - pl + 1;
        const rc = Math.cos(c.h), rs = Math.sin(c.h);
        nx += (px * rc - py * rs) * push;
        ny += (px * rs + py * rc) * push;
        // moving car hurts
        if (c.speed > 120) this.damage(game, c.speed / 22, 'car');
      }
    }
    this.x = clamp(nx, 8, CFG.W - 8);
    this.y = clamp(ny, 8, CFG.H - 8);
    if (game.world.isWater(this.x, this.y)) {
      // cannot swim at night: get pushed back toward sand
      const d = this.y > (CFG.OCEAN_S + CFG.SAND_S) / 2 ? -1 : 1;
      this.y += d * 160 * dt;
      this.damage(game, dt * 4, 'water');
    }
  }

  tryEnter(game) {
    // nearest car within reach
    let best = null, bestD = 80;
    for (const c of game.cars) {
      if (c.state === 'wreck') continue;
      const d = dist(this.x, this.y, c.x, c.y);
      if (d < bestD) { best = c; bestD = d; }
    }
    if (!best) return;
    this.enterCd = 0.35;
    const wasAI = best.driver === 'ai';
    const wasPlayerOwned = best.driver === 'player';
    this.inCar = best;
    best.driver = 'player';
    best.ai = null;
    this.carjackT = 0.5;
    if (wasAI) {
      // driver flees
      const door = best.centerOffset('left');
      const ped = game.spawnPed(door.x, door.y, { flee: true });
      game.onCarjack?.(best, true);
      game.hud.subtitle('Carjacked! The driver bolts.', 2);
      game.audio?.carDoor?.();
      if (best.type === 'police') game.addWanted(1, 'carjack');
    } else {
      game.onCarjack?.(best, false);
      game.audio?.carDoor?.();
    }
    game.missions.onEnterCar?.(game, best);
  }

  tryExit(game) {
    const car = this.inCar;
    if (!car) return;
    if (car.speed > 140) {
      game.hud.toast('Too fast to bail — brake first');
      return;
    }
    const door = car.centerOffset('left');
    this.x = door.x; this.y = door.y;
    // if a wall is there, use the other side
    const solids = game.world.nearSolids(this.x, this.y);
    for (const r of solids) if (circleRect(this.x, this.y, this.r, r)) {
      const alt = car.centerOffset('right');
      this.x = alt.x; this.y = alt.y;
      break;
    }
    car.driver = null;
    car.ai = null;
    this.inCar = null;
    this.exitCd = 0.4;
    game.audio?.carDoor?.();
    game.missions.onExitCar?.(game, car);
  }

  punch(game) {
    this.punchT = 0.32;
    const px = this.x + Math.cos(this.h) * CFG.PUNCH_RANGE * 0.7;
    const py = this.y + Math.sin(this.h) * CFG.PUNCH_RANGE * 0.7;
    game.audio?.punch?.();
    // hit peds
    const ped = pedAt(game, px, py, 16);
    if (ped) { ped.knock(game, Math.cos(this.h), Math.sin(this.h), CFG.PUNCH_DMG); game.addWanted(1, 'assault'); game.fxHit(px, py); return; }
    // hit cops (they are peds with kind cop)
    const cop = pedAt(game, px, py, 16, false);
    if (cop && cop.kind === 'cop') { cop.knock(game, Math.cos(this.h), Math.sin(this.h), CFG.PUNCH_DMG); game.addWanted(2, 'assault-cop'); game.fxHit(px, py); }
    // hit car
    const car = findCar(game, px, py, 8);
    if (car) { car.impact(6, game); game.fxSparks(px, py, 3); }
  }

  shoot(game, tx, ty, fromCar) {
    if (this.ammo <= 0) return;
    this.ammo--;
    this.shootCd = CFG.PISTOL_CD;
    this.muzzleT = 0.06;
    const ox = this.x + Math.cos(this.h) * 14;
    const oy = this.y + Math.sin(this.h) * 14;
    game.spawnBullet(ox, oy, this.h, 'player');
    game.lastShotAt = game.t;
    game.onPlayerShot?.();
    game.audio?.gunshot?.();
  }

  damage(game, amount, src) {
    if (!this.alive) return;
    if (this.armor > 0) {
      const a = Math.min(this.armor, amount * 0.7);
      this.armor -= a; amount -= a;
    }
    this.hp -= amount;
    this.hurtT = 0.3;
    game.audio?.hurt?.();
    if (this.hp <= 0) { this.hp = 0; game.onPlayerDead?.(src); }
  }

  heal(amount) { this.hp = clamp(this.hp + amount, 0, CFG.P_HP); }
}
