// ============================================================================
// VICE PALMS — player.js
// The protagonist on foot and behind the wheel: walk/sprint, aim & shoot the
// pistol, throw punches, carjack (F), enter/exit, drive-by, pickups, health
// and armor, and the slow night-city health trickle.
// ============================================================================

import {
  PLAYER, WEAPONS, ECON, SKINS, SHIRTS, RADIO,
} from './config.js';
import {
  TAU, clamp, dist, angleTowards, resolveCircleRect, shadowBlob, glow,
} from './util.js';

export class Player {
  constructor(game, x, y) {
    this.game = game;
    this.x = x; this.y = y;
    this.angle = -Math.PI / 2;
    this.hp = PLAYER.HP_MAX;
    this.armor = 0;
    this.money = ECON.START_MONEY;
    this.inCar = null;
    this.enterCd = 0;
    this.shootCd = 0;
    this.meleeCd = 0;
    this.curWeapon = 1;          // 0 fists, 1 pistol
    this.pistolAmmo = 24;
    this.dead = false;
    this.hurtT = 0;
    this.regenT = 0;
    this.step = 0;
    this.skin = '#e8b48a';
    this.shirt = '#f0f0f0';
    this.hurtFlash = 0;
    this.exitCd = 0;
    this.aim = { x: x, y: y - 5 };
    this.stamina = 100;
  }

  addMoney(n, label) {
    this.money = Math.max(0, this.money + n);
    this.game.fx.text(this.x, this.y - 2.4, (n >= 0 ? '+' : '') + '$' + Math.abs(Math.round(n)), n >= 0 ? '#7dffa8' : '#ff7d7d');
  }

  weapon() {
    return WEAPONS[this.curWeapon];
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    const g = this.game;
    const inp = g.input;

    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt * 3;
    if (this.enterCd > 0) this.enterCd -= dt;
    if (this.exitCd > 0) this.exitCd -= dt;
    if (this.shootCd > 0) this.shootCd -= dt;
    if (this.meleeCd > 0) this.meleeCd -= dt;

    // Slow trickle regen out of combat.
    this.regenT += dt;
    if (this.regenT > PLAYER.REGEN_DELAY && this.hp < PLAYER.HP_MAX && this.hp > 0) {
      this.hp = Math.min(PLAYER.HP_MAX, this.hp + PLAYER.REGEN_RATE * dt);
    }

    if (this.inCar) {
      this.updateInCar(dt);
    } else {
      this.updateOnFoot(dt);
    }
    this.updatePickups();
  }

  updateInCar(dt) {
    const g = this.game;
    const car = this.inCar;
    const inp = g.input;

    // The car may have been destroyed under us.
    if (car.wrecked || car.remove) {
      this.exitCar(true);
      return;
    }

    car.throttle = inp.throttleAxis();
    car.steer = inp.steerAxis();
    car.handbrake = inp.handbrake();
    this.x = car.x; this.y = car.y;
    this.angle = car.angle;

    if (inp.wasPressed('KeyF') || inp.wasPressed('KeyE')) this.exitCar(false);
    if (inp.wasPressed('KeyH')) g.audio.horn();
    if (inp.wasPressed('KeyR')) {
      g.radio = (g.radio + 1) % RADIO.length;
      g.hud.toast('RADIO — ' + RADIO[g.radio].name);
    }
    if (inp.wasPressed('Digit1')) this.curWeapon = 0;
    if (inp.wasPressed('Digit2')) this.curWeapon = 1;
    if (inp.wasPressed('KeyQ')) this.curWeapon = (this.curWeapon + 1) % WEAPONS.length;

    // Drive-by shooting.
    this.aim = inp.aimWorld(g.cam);
    if (inp.firing() && this.shootCd <= 0 && this.weapon().id === 'pistol' && this.pistolAmmo > 0) {
      this.shootCd = PLAYER.SHOOT_CD * 1.5;
      const side = Math.abs(Math.cos(car.angle)) > Math.abs(Math.sin(car.angle)) ? 1 : -1;
      this.fireBullet(car.x - Math.sin(car.angle) * side, car.y + Math.cos(car.angle) * side, true);
    }
  }

  updateOnFoot(dt) {
    const g = this.game;
    const inp = g.input;
    const mv = inp.moveVec();

    if (mv.x || mv.y) {
      const wantSprint = inp.sprinting() && this.stamina > 4;
      const sp = wantSprint ? PLAYER.SPRINT : PLAYER.WALK;
      this.x += mv.x * sp * dt;
      this.y += mv.y * sp * dt;
      this.angle = angleTowards(this.angle, Math.atan2(mv.y, mv.x), 12 * dt);
      this.step += dt * (wantSprint ? 13 : 9);
      this.stamina = clamp(this.stamina - (wantSprint ? 22 : -14) * dt, 0, 100);
    } else {
      this.stamina = clamp(this.stamina + 14 * dt, 0, 100);
    }

    // Solid collision.
    const near = g.world.solidsNear(this.x, this.y, 1.4);
    for (const rect of near) {
      const r = resolveCircleRect(this.x, this.y, PLAYER.RADIUS, rect);
      if (r) { this.x += r.nx * r.depth; this.y += r.ny * r.depth; }
    }
    // Cars push the player around (and hurt at speed).
    for (const car of g.cars) {
      if (car.remove) continue;
      const d = dist(this.x, this.y, car.x, car.y);
      const minD = car.radius * 0.9;
      if (d < minD && d > 0.01) {
        const nx = (this.x - car.x) / d, ny = (this.y - car.y) / d;
        const sp = car.speed();
        this.x += nx * (minD - d);
        this.y += ny * (minD - d);
        if (sp > 9 && car.driver !== 'player' && this.hurtT <= 0) {
          this.damage(sp * 2.2, 'car');
        }
      }
    }
    // Shoulder checks with pedestrians — they have opinions.
    for (const p of g.peds.list) {
      if (p.dead) continue;
      const d = dist(this.x, this.y, p.x, p.y);
      if (d < 0.95 && d > 0.01) {
        const nx = (p.x - this.x) / d, ny = (p.y - this.y) / d;
        p.x += nx * (0.95 - d) * 0.7;
        p.y += ny * (0.95 - d) * 0.7;
        p.bark();
      }
    }

    // Aim & fire.
    this.aim = inp.aimWorld(g.cam);
    if (inp.wasPressed('Digit1')) this.curWeapon = 0;
    if (inp.wasPressed('Digit2') && this.pistolAmmo > 0) this.curWeapon = 1;
    if (inp.wasPressed('KeyQ')) {
      this.curWeapon = (this.curWeapon + 1) % WEAPONS.length;
      if (this.weapon().id === 'pistol' && this.pistolAmmo <= 0) this.curWeapon = 0;
    }

    if (inp.firing() && this.shootCd <= 0) {
      if (this.weapon().id === 'pistol') {
        if (this.pistolAmmo > 0) {
          this.shootCd = PLAYER.SHOOT_CD;
          const c = Math.cos(this.angle), s = Math.sin(this.angle);
          this.fireBullet(this.x + c * 0.9, this.y + s * 0.9, true);
        } else {
          this.shootCd = 0.4;
          g.hud.toast('OUT OF AMMO');
        }
      } else {
        this.melee();
      }
    }

    // Enter / carjack.
    if ((inp.wasPressed('KeyF') || inp.wasPressed('KeyE')) && this.enterCd <= 0) {
      this.enterCd = PLAYER.ENTER_CD;
      this.tryEnterCar();
    }
  }

  tryEnterCar() {
    const g = this.game;
    let best = null, bestD = PLAYER.ENTER_DIST;
    for (const car of g.cars) {
      if (car.wrecked || car.remove) continue;
      const d = dist(this.x, this.y, car.x, car.y);
      if (d < bestD) { best = car; bestD = d; }
    }
    if (!best) return;

    const wasCop = best.cop && best.driver === 'cop';
    const hadDriver = best.driver === 'ai' || best.driver === 'cop';
    // Yank the driver out.
    if (hadDriver) {
      const ep = new Ped(best.game, best.x + Math.cos(best.angle + Math.PI / 2) * 1.6, best.y + Math.sin(best.angle + Math.PI / 2) * 1.6);
      ep.state = 'flee';
      ep.fleeT = 8;
      ep.threat = { x: best.x, y: best.y };
      if (wasCop) {
        // Replace with a hostile foot cop record; the driver is now on foot.
        g.police.copEjected(best);
      }
      g.peds.list.push(ep);
    }
    if (best.aiKind === 'civ' && best.ai) {
      // Traffic forgets this car.
      best.ai = null;
    }
    best.driver = 'player';
    best.aiKind = null;
    best.sirenOn = false;
    this.inCar = best;
    g.onCarjack(best, hadDriver, wasCop);
    g.audio.doorSlam();
  }

  exitCar(forced) {
    const car = this.inCar;
    if (!car) return;
    this.inCar = null;
    car.driver = null;
    car.throttle = 0;
    car.brake = 1;
    car.handbrake = false;
    // Step out on the left side; fall back to right if blocked.
    const lx = car.x - Math.sin(car.angle) * (car.w / 2 + 1.0);
    const ly = car.y + Math.cos(car.angle) * (car.w / 2 + 1.0);
    if (this.game.world.blockedAt(lx, ly)) {
      this.x = car.x + Math.sin(car.angle) * (car.w / 2 + 1.0);
      this.y = car.y - Math.cos(car.angle) * (car.w / 2 + 1.0);
    } else {
      this.x = lx; this.y = ly;
    }
    this.exitCd = 0.3;
    if (forced) {
      // Flung out of a burning car.
      this.damage(12, 'fire');
      this.game.fx.requestShake(5);
    }
    this.game.audio.doorSlam();
  }

  melee() {
    const g = this.game;
    this.meleeCd = PLAYER.MELEE_CD;
    g.audio.swing();
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    const hx = this.x + c * 1.2, hy = this.y + s * 1.2;
    // Peds & cops in front.
    for (const p of g.peds.list) {
      if (p.dead) continue;
      if (dist(hx, hy, p.x, p.y) < PLAYER.MELEE_RANGE) {
        p.hurt(PLAYER.MELEE_DMG, 'punch');
        g.fx.spark(p.x, p.y, 2);
        g.onViolence(p.x, p.y, 0.4);
        return;
      }
    }
    for (const cop of g.police.foot) {
      if (cop.dead) continue;
      if (dist(hx, hy, cop.x, cop.y) < PLAYER.MELEE_RANGE) {
        cop.hurt(PLAYER.MELEE_DMG, 'punch');
        g.fx.spark(cop.x, cop.y, 2);
        return;
      }
    }
    for (const car of g.cars) {
      if (car.remove || car.wrecked) continue;
      if (dist(hx, hy, car.x, car.y) < car.radius) {
        car.damage(4, 'punch');
        g.fx.spark(car.x, car.y, 2);
        g.audio.punchHit();
        return;
      }
    }
  }

  fireBullet(x, y, fromPlayer) {
    const g = this.game;
    const target = this.aim;
    const a = Math.atan2(target.y - y, target.x - x);
    if (!this.inCar) this.angle = a;
    g.bullets.push({
      x, y,
      vx: Math.cos(a) * PLAYER.BULLET_SPEED,
      vy: Math.sin(a) * PLAYER.BULLET_SPEED,
      life: PLAYER.BULLET_LIFE,
      fromPlayer: true,
      dmg: PLAYER.PISTOL_DMG_PED,
    });
    g.fx.muzzle(x, y);
    g.fx.requestShake(0.7);
    g.audio.shot();
    g.events.gunshots.push({ x, y });
    this.pistolAmmo--;
    g.onViolence(x, y, 0.35);
  }

  updatePickups() {
    const g = this.game;
    for (let i = g.pickups.length - 1; i >= 0; i--) {
      const pk = g.pickups[i];
      if (dist(this.x, this.y, pk.x, pk.y) < 1.7) {
        switch (pk.kind) {
          case 'health':
            this.hp = Math.min(PLAYER.HP_MAX, this.hp + ECON.PICKUP_HEALTH);
            g.fx.text(pk.x, pk.y, '+HEALTH', '#7dffa8');
            g.audio.pickup();
            break;
          case 'armor':
            this.armor = Math.min(PLAYER.ARMOR_MAX, this.armor + ECON.PICKUP_ARMOR);
            g.fx.text(pk.x, pk.y, '+ARMOR', '#7db8ff');
            g.audio.pickup();
            break;
          case 'cash':
            this.addMoney(ECON.PICKUP_CASH);
            g.audio.pickup();
            break;
          case 'ammo':
            this.pistolAmmo += ECON.PICKUP_AMMO;
            g.fx.text(pk.x, pk.y, '+AMMO', '#ffd75e');
            g.audio.pickup();
            if (this.curWeapon === 0) this.curWeapon = 1;
            break;
          case 'package':
            g.missions.onPackage(pk);
            break;
        }
        g.pickups.splice(i, 1);
      }
    }
  }

  damage(n, kind) {
    if (this.dead || this.hurtT > 0 || this.game.godMode) return;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, n * 0.65);
      this.armor -= absorbed;
      n -= absorbed;
    }
    this.hp -= n;
    this.hurtT = PLAYER.HURT_INVULN;
    this.regenT = 0;
    this.hurtFlash = 1;
    this.game.fx.bloodBurst(this.x, this.y, 3);
    this.game.audio.hurt();
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      if (this.inCar) this.exitCar(false);
      this.game.wasted();
    }
  }

  // ------------------------------------------------------------------ drawing
  draw(ctx, t) {
    if (this.inCar) return; // hidden inside the car
    const bob = Math.sin(this.step) * 0.06;
    shadowBlob(ctx, this.x + 0.25, this.y + 0.3, 0.6, 0.32);

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    // Legs
    ctx.fillStyle = '#1e1f28';
    const ls = Math.sin(this.step) * 0.24;
    ctx.fillRect(-0.2, -0.4 + ls, 0.6, 0.26);
    ctx.fillRect(-0.2, 0.14 - ls, 0.6, 0.26);

    // Body
    ctx.fillStyle = this.shirt;
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.5, 0.4 + bob * 0.5, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 0.08;
    ctx.stroke();

    // Arms + weapon
    if (this.weapon().id === 'pistol') {
      ctx.fillStyle = this.skin;
      ctx.fillRect(0.25, -0.3, 0.55, 0.16);
      ctx.fillRect(0.25, 0.14, 0.55, 0.16);
      ctx.fillStyle = '#15161c';
      ctx.fillRect(0.62, -0.09, 0.5, 0.18);
    } else {
      const punch = this.meleeCd > PLAYER.MELEE_CD - 0.18 ? 0.5 : 0;
      ctx.fillStyle = this.skin;
      ctx.fillRect(0.2 + punch, -0.34, 0.4, 0.18);
      ctx.fillRect(0.2 + punch, 0.16, 0.4, 0.18);
    }

    // Head
    ctx.fillStyle = this.skin;
    ctx.beginPath();
    ctx.arc(0.06, 0, 0.3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#241a12';
    ctx.beginPath();
    ctx.arc(-0.06, 0, 0.24, Math.PI / 2, Math.PI * 1.5);
    ctx.fill();

    ctx.restore();

    // Hurt flash
    if (this.hurtFlash > 0) {
      glow(ctx, this.x, this.y, 2.2, '#ff4040', this.hurtFlash * 0.5);
    }
  }
}
