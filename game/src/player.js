// player.js — on-foot movement, aim/shoot, carjack, health/armor.

import { CFG, ctx } from './config.js';
import { clamp, dist, TAU } from './util.js';
import { KEYMAP } from './input.js';
import { resolveCircleSolids, solidsNear } from './world.js';
import { circleRectPush } from './util.js';
import { WEAPONS } from './weapons.js';

export class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.angle = -Math.PI / 2;
    this.health = CFG.playerMaxHealth;
    this.armor = 0;
    this.ammo = CFG.startAmmo;
    this.inCar = null;               // Car reference while driving
    this.shootCd = 0;
    this.meleeCd = 0;
    this.hurtT = 0;
    this.animT = 0;
    this.moving = false;
    this.sprinting = false;
    this.jackT = 0;                  // animation timer for jack flash
  }

  // called when driving: keep sync'd to car
  syncToCar() {
    if (this.inCar) {
      this.x = this.inCar.x;
      this.y = this.inCar.y;
    }
  }

  damage(d, src) {
    if (this.inCar) {
      // damage bleeds into the car instead (except explosions — game.js routes)
      this.inCar.impact(d * 0.9);
      return;
    }
    // remember where the pain came from (damage-direction HUD arc)
    if (src && src !== 'explosion' && typeof src === 'object') {
      this.lastHit = { x: src.x, y: src.y, t: 1.4 };
    } else {
      this.lastHit = { x: this.x + Math.cos(this.angle + Math.PI) * 100, y: this.y + Math.sin(this.angle + Math.PI) * 100, t: 1.0 };
    }
    if (this.armor > 0) {
      const abs = Math.min(this.armor, d * 0.65);
      this.armor -= abs;
      d -= abs;
    }
    this.health -= d;
    this.hurtT = 0.35;
    if (ctx.sfx) ctx.sfx('hurt', this.x, this.y);
    if (this.health <= 0) {
      this.health = 0;
      ctx.game.onPlayerDeath(src || 'gun');
    }
  }

  update(dt, S, input) {
    this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.lastHit) this.lastHit.t -= dt;
    this.shootCd = Math.max(0, this.shootCd - dt);
    this.meleeCd = Math.max(0, this.meleeCd - dt);
    this.jackT = Math.max(0, this.jackT - dt);
    this.animT += dt;

    if (this.inCar) {
      this.syncToCar();
      this.driveCar(dt, S, input);
      return;
    }

    this.walkFoot(dt, S, input);
    this.tryJack(dt, input);
  }

  walkFoot(dt, S, input) {
    let mx = 0, my = 0;
    if (KEYMAP.up.some(k => input.key(k))) my -= 1;
    if (KEYMAP.down.some(k => input.key(k))) my += 1;
    if (KEYMAP.left.some(k => input.key(k))) mx -= 1;
    if (KEYMAP.right.some(k => input.key(k))) mx += 1;

    this.sprinting = KEYMAP.sprint.some(k => input.key(k));
    const sp = this.sprinting ? CFG.playerSprint : CFG.playerWalk;
    const len = Math.hypot(mx, my);
    this.moving = len > 0;

    // aim at mouse always
    this.angle = Math.atan2(input.mouse.wy - this.y, input.mouse.wx - this.x);

    if (len > 0) {
      this.x += (mx / len) * sp * dt;
      this.y += (my / len) * sp * dt;
    }

    resolveCircleSolids(ctx.world, this, CFG.playerRadius);

    // firing is delegated to the weapons system (fists/pistol/shotgun/smg)
    ctx.weapons.update(dt, S, input);
  }

  // legacy direct-fire helpers (used by tests / special cases)
  shoot(S) {
    this.shootCd = CFG.pistolCooldown;
    this.ammo--;
    const ang = this.angle;
    if (ctx.sfx) ctx.sfx('shot', this.x, this.y);
    ctx.game.muzzle(this.x + Math.cos(ang) * 16, this.y + Math.sin(ang) * 16, ang);
    ctx.game.addSparks(this.x + Math.cos(ang) * 20, this.y + Math.sin(ang) * 20, 2);

    // raycast: step along, first hit wins
    const range = CFG.pistolRange;
    const step = 12;
    const w = ctx.world;
    for (let t = 14; t <= range; t += step) {
      const hx = this.x + Math.cos(ang) * t;
      const hy = this.y + Math.sin(ang) * t;
      // peds
      for (const p of ctx.pedsList) {
        if (p.dead) continue;
        if (dist(hx, hy, p.x, p.y) < 12) {
          const killed = p.hurt(CFG.pistolDamage);
          ctx.game.addBlood(p.x, p.y);
          ctx.peds.panic(p.x, p.y, 260);
          if (killed) ctx.game.onPedKilled(p, 'shot');
          else ctx.police.crime(0.6, hx, hy);
          return;
        }
      }
      // cops (foot)
      for (const c of ctx.policeFootList) {
        if (c.dead) continue;
        if (dist(hx, hy, c.x, c.y) < 12) {
          const killed = c.hurt(CFG.pistolDamage);
          ctx.game.addBlood(c.x, c.y);
          if (killed) ctx.game.onCopKilled(c);
          return;
        }
      }
      // cars
      for (const car of ctx.cars) {
        if (car.dead) continue;
        const r = car.spec.l * 0.42;
        if (dist(hx, hy, car.x, car.y) < r) {
          car.impact(CFG.pistolDamage * 0.55);
          ctx.game.addSparks(hx, hy, 3);
          if (car.driver === 'police' || car.siren) ctx.police.crime(0.8, hx, hy);
          // shoot the driver out of traffic cars sometimes
          if (car.ai === 'traffic' && Math.random() < 0.25) {
            car.ai = 'parked'; car.driver = null; car.aiState = null;
            ctx.peds.panic(car.x, car.y);
          }
          return;
        }
      }
      // solids (buildings)
      const solids = solidsNear(w, hx, hy, 4);
      for (const b of solids) {
        if (b.x0 === undefined) continue;
        if (hx > b.x0 && hx < b.x1 && hy > b.y0 && hy < b.y1) {
          ctx.game.addSparks(hx, hy, 3);
          return;
        }
      }
    }
  }

  melee(S) {
    this.meleeCd = CFG.meleeCooldown;
    if (ctx.sfx) ctx.sfx('punch', this.x, this.y);
    const rx = this.x + Math.cos(this.angle) * CFG.meleeRange * 0.7;
    const ry = this.y + Math.sin(this.angle) * CFG.meleeRange * 0.7;
    for (const p of ctx.pedsList) {
      if (p.dead) continue;
      if (dist(rx, ry, p.x, p.y) < CFG.meleeRange * 0.75) {
        const killed = p.hurt(CFG.meleeDamage);
        ctx.game.addBlood(p.x, p.y);
        if (killed) ctx.game.onPedKilled(p, 'fists');
        else { p.fleeFrom(this.x, this.y); ctx.police.crime(0.5, p.x, p.y); }
        return;
      }
    }
    for (const c of ctx.police.foots) {
      if (c.dead) continue;
      if (dist(rx, ry, c.x, c.y) < CFG.meleeRange * 0.75) {
        const killed = c.hurt(CFG.meleeDamage);
        if (killed) ctx.game.onCopKilled(c);
        return;
      }
    }
  }

  // F: enter nearest car / exit current car
  tryJack(dt, input) {
    if (!input.hit('KeyF')) return;
    if (this.inCar) { this.exitCar(); return; }
    let best = null, bestD = CFG.jackRange;
    for (const car of ctx.cars) {
      if (car.dead || car.driver === 'player') continue;
      if (car.burning > 0) continue;
      const d = dist(this.x, this.y, car.x, car.y);
      if (d < bestD) { best = car; bestD = d; }
    }
    if (!best) return;
    // eject NPC driver
    if (best.driver === 'traffic' || best.ai === 'traffic') {
      ctx.peds.panic(best.x, best.y, 120);
      ctx.game.spawnFleeingPed(best.x, best.y);
      best.ai = null; best.aiState = null;
      ctx.police.crime(1.2, best.x, best.y);
      ctx.subtitle('Carjacked!', 1.4);
    } else if (best.driver === 'police' || best.type === 'police') {
      ctx.police.crime(2.2, best.x, best.y);
      ctx.subtitle('You stole a police cruiser!', 1.6);
      best.driver = null; best.ai = null;
    } else {
      // parked / abandoned car — no crime
    }
    // jacked counter lives on the state
    best.driver = 'player';
    best.ai = null;
    best.aiState = null;
    this.inCar = best;
    this.jackT = 0.4;
    if (ctx.S && ctx.S.stats) ctx.S.stats.jacked++;
    if (ctx.sfx) ctx.sfx('door', best.x, best.y);
  }

  exitCar() {
    const car = this.inCar;
    if (!car) return;
    if (car.speed > CFG.exitSpeed) {
      ctx.subtitle('Too fast to bail!', 1.0);
      return;
    }
    car.driver = null;
    car.aiState = null;
    // hop out on the right side
    const sideA = car.angle + Math.PI / 2;
    this.x = car.x + Math.cos(sideA) * (car.spec.w * 0.5 + CFG.playerRadius + 4);
    this.y = car.y + Math.sin(sideA) * (car.spec.w * 0.5 + CFG.playerRadius + 4);
    this.inCar = null;
    resolveCircleSolids(ctx.world, this, CFG.playerRadius);
    if (ctx.sfx) ctx.sfx('door', car.x, car.y);
  }

  driveCar(dt, S, input) {
    const car = this.inCar;
    if (!car) return;
    if (input.hit('KeyF')) { this.exitCar(); return; }
    let throttle = 0, steer = 0;
    if (KEYMAP.up.some(k => input.key(k))) throttle += 1;
    if (KEYMAP.down.some(k => input.key(k))) throttle -= 1;
    if (KEYMAP.left.some(k => input.key(k))) steer -= 1;
    if (KEYMAP.right.some(k => input.key(k))) steer += 1;
    const hand = input.key('Space');
    car.update(dt, { throttle, steer, hand });
    if (car.speed > 240 && ctx.sfx) { /* engine handles it */ }
  }
}
