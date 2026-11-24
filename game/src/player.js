// player.js — the star of the show: walking, sprinting, entering/jacking
// cars, driving inputs, fists and a pistol with real ammo.

import { CFG } from './config.js';
import { G, clamp, dist, angNorm, say, help } from './util.js';
import { key, hit, moveAxis, mouse } from './input.js';
import { engineOn, engineUpdate, engineOff, sfxShot, sfxPickup, sfxHorn } from './audio.js';
import { dirAng } from './cars.js';
import { addStat } from './stats.js';
import { Ped } from './peds.js';

export class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.h = -Math.PI / 2;
    this.hp = CFG.P_HP;
    this.armor = CFG.P_ARMOR;
    this.onFoot = true;
    this.car = null;
    this.weapon = 'pistol';
    this.hasShotgun = false;
    this.weapons = {
      pistol: { mag: 17, reserve: 51 },
      shotgun: { mag: 0, reserve: 0 },
    };
    this.reloadT = 0;
    this.shootT = 0;
    this.punchT = 0;
    this.walkT = 0;
    this.hurtT = 0;
    this.shield = 0;
    this.money = G.money;
  }

  // ------------------------------------------------------------- per-frame
  update(dt) {
    this.shootT -= dt;
    this.punchT -= dt;
    this.hurtT -= dt;
    this.reloadT -= dt;
    this.hornT = (this.hornT || 0) - dt;
    if (this.shield > 0) this.shield -= dt;

    if (this.car) this.updateDriving(dt);
    else this.updateFoot(dt);

    // shared: fire button (mouse or Ctrl) — works on foot AND from a car (drive-by)
    if ((mouse.down || key('ControlLeft') || key('ControlRight')) && this.shootT <= 0 && this.reloadT <= 0) {
      this.tryShoot();
    }
    if (hit('KeyR')) this.reload();
    if (hit('KeyQ') && this.hasShotgun) {
      this.weapon = this.weapon === 'pistol' ? 'shotgun' : 'pistol';
      help('Equipped: ' + CFG.WEAPONS[this.weapon].name, 1.6);
    }
  }

  updateFoot(dt) {
    const ax = moveAxis();
    const swimming = G.world.onWater(this.x, this.y) && !G.world.onPier(this.x, this.y);
    const sprint = (key('ShiftLeft') || key('ShiftRight')) && !swimming;
    const spd = swimming ? 55 : (sprint ? CFG.SPRINT : CFG.WALK);
    const m = Math.hypot(ax.x, ax.y);
    if (m > 0) {
      const nx = ax.x / m, ny = ax.y / m;
      this.h = angNorm(Math.atan2(ny, nx));
      this.x += nx * spd * dt;
      this.y += ny * spd * dt;
      this.walkT += dt * (swimming ? 0.7 : (sprint ? 1.5 : 1));
    }
    if (swimming) {
      // ripples
      if (Math.random() < 0.3) {
        G.parts.push({ x: this.x, y: this.y, vx: 0, vy: 0, life: 0.6, max: 0.6, type: 'ripple', r: 6 });
      }
    } else {
      // world collision only matters on dry land
      const r = G.world.collide(this.x, this.y, 7);
      if (r.power > 0.01) { this.x = r.x; this.y = r.y; }
    }
    this.x = clamp(this.x, 12, CFG.W - 12);
    this.y = clamp(this.y, 12, CFG.H - 12);

    // enter / jack a car
    if (hit('KeyF')) this.tryEnterCar();

    // melee
    if (hit('KeyV') && this.punchT <= 0) this.tryPunch();
  }

  updateDriving(dt) {
    const car = this.car;
    if (car.dead) { this.exitCar(true); return; }
    car.ctrl.throttle = 0;
    car.ctrl.steer = 0;
    car.ctrl.hand = false;
    car.ctrl.nitro = false;
    if (key('KeyW') || key('ArrowUp')) car.ctrl.throttle += 1;
    if (key('KeyS') || key('ArrowDown')) car.ctrl.throttle -= 1;
    if (key('KeyA') || key('ArrowLeft')) car.ctrl.steer -= 1;
    if (key('KeyD') || key('ArrowRight')) car.ctrl.steer += 1;
    car.ctrl.hand = key('Space');
    car.ctrl.nitro = key('ShiftLeft') || key('ShiftRight');

    this.x = car.x; this.y = car.y;

    engineOn();
    engineUpdate(clamp(car.speed / (car.spec.max * 1.2), 0, 1) + (car.nitroOn ? 0.25 : 0), Math.abs(car.ctrl.throttle));

    if (hit('KeyF')) {
      // small grace: don't exit while moving fast — door won't open
      if (car.speed < 160) this.exitCar();
      else help('Slow down before bailing out.', 2);
    }
    // the city symphony
    if (key('KeyH') && this.hornT <= 0) {
      this.hornT = 0.8;
      sfxHorn();
      G.pedMgr.panicAt(car.x, car.y, 120);
    }
  }

  // ------------------------------------------------------------- cars
  tryEnterCar() {
    let best = null, bd = 66 * 66;
    for (const c of G.cars) {
      if (c.dead) continue;
      const d = dist(this.x, this.y, c.x, c.y);
      if (d * d < bd) { bd = d * d; best = c; }
    }
    if (!best) { help('No car in reach — find one and press F.', 2.4); return; }
    const wasPolice = best.type === 'police';
    const wasDriven = best.driver === 'traffic' || best.driver === 'police';
    // eject the driver
    if (wasDriven) {
      addStat('jacked', 1);
      const p = new Ped(best.x + 20, best.y + 20, null);
      p.panic(6, { x: this.x, y: this.y });
      G.peds.push(p);
      if (G.police) G.police.crime(wasPolice ? 2 : 1, best.x, best.y);
      if (wasPolice) say('You jacked a VCPD cruiser. Bold.', 3);
      else say('Nice jack. The driver disagrees.', 2.6);
    }
    best.driver = 'player';
    best.ai = null;
    best.stopT = 0;
    // some owners arm their alarms; the block hears about it
    if (!wasDriven && Math.random() < 0.22) {
      best.alarmT = 6;
      help('A car alarm is singing your talents.', 2.4);
    }
    this.car = best;
    this.onFoot = false;
    engineOff();
    sfxPickup();
    help('Drive: WASD · handbrake: Space · exit: F', 4);
  }

  exitCar(forced = false) {
    const car = this.car;
    if (!car) return;
    car.driver = null;
    car.ctrl.throttle = 0;
    car.ctrl.steer = 0;
    car.ctrl.hand = false;
    this.car = null;
    this.onFoot = true;
    engineOff();
    // step out on the left side
    const px = -Math.sin(car.h), py = Math.cos(car.h);
    this.x = car.x - px * (car.hh + 12) - Math.cos(car.h) * 8;
    this.y = car.y + py * (car.hh + 12) - Math.sin(car.h) * 8;
    const r = G.world.collide(this.x, this.y, 7);
    if (r.power > 0.01) { this.x = r.x; this.y = r.y; }
    if (forced) this.hurt(12, 'bail');
  }

  // ------------------------------------------------------------- combat
  tryShoot() {
    if (this.reloadT > 0) return;
    if (this.car && G.world.onWater(this.car.x, this.y) && !G.world.onPier(this.car.x, this.y)) return;
    const wname = this.weapon;
    const spec = CFG.WEAPONS[wname];
    const ammoBox = this.weapons[wname];
    if (ammoBox.mag <= 0) {
      this.reload();
      if (ammoBox.mag <= 0) return;
    }
    ammoBox.mag--;
    addStat('shots', spec.pellets);
    this.shootT = spec.rate;
    const baseAng = Math.atan2(mouse.y - this.y, mouse.x - this.x);
    const moveSpread = this.car ? 0.1 : 0;
    for (let p = 0; p < spec.pellets; p++) {
      const a = baseAng + (Math.random() - 0.5) * (spec.spread + moveSpread) * 2;
      const mx = Math.cos(a), my = Math.sin(a);
      G.bullets.push({
        x: this.x + mx * 12, y: this.y + my * 12,
        vx: mx * spec.spd, vy: my * spec.spd,
        life: spec.life, from: 'player', dmg: spec.dmg,
      });
    }
    G.parts.push({ x: this.x + Math.cos(baseAng) * 14, y: this.y + Math.sin(baseAng) * 14, vx: Math.cos(baseAng) * 40, vy: Math.sin(baseAng) * 40, life: 0.08, max: 0.08, type: 'muzzle', r: wname === 'shotgun' ? 9 : 6 });
    sfxShot();
    G.cam.shake = Math.min(8, G.cam.shake + (wname === 'shotgun' ? 4.5 : 1.6));
    // gunfire is a crime in public
    if (G.police) G.police.crime(1, this.x, this.y, { gun: true });
    if (G.pedMgr) G.pedMgr.panicAt(this.x, this.y, 300);
    if (G.trafficMgr) G.trafficMgr.panic(3);
  }

  reload() {
    const spec = CFG.WEAPONS[this.weapon];
    const box = this.weapons[this.weapon];
    if (box.mag >= spec.mag || box.reserve <= 0 || this.reloadT > 0) return;
    const need = spec.mag - box.mag;
    const take = Math.min(need, box.reserve);
    box.mag += take;
    box.reserve -= take;
    this.reloadT = this.weapon === 'shotgun' ? 1.4 : 0.9;
  }

  tryPunch() {
    this.punchT = 0.4;
    const mx = Math.cos(this.h), my = Math.sin(this.h);
    // punch peds
    for (const p of G.peds) {
      if (p.state === 'dead') continue;
      const dx = p.x - this.x, dy = p.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d < CFG.REACH && dx * mx + dy * my > 0) {
        p.kill();
        G.parts.push({ x: p.x, y: p.y, vx: mx * 30, vy: my * 30, life: 0.4, max: 0.4, type: 'blood', r: 4 });
        if (G.police) G.police.crime(2, p.x, p.y);
        return;
      }
    }
    // punch cops
    for (const cop of G.cops) {
      const dx = cop.x - this.x, dy = cop.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d < CFG.REACH && dx * mx + dy * my > 0) {
        cop.hp -= CFG.PUNCH_DMG;
        if (G.police) G.police.crime(2, cop.x, cop.y);
        return;
      }
    }
    // punch cars (alarm the owner)
    for (const c of G.cars) {
      if (c.dead) continue;
      const d = dist(this.x, this.y, c.x, c.y);
      if (d < CFG.REACH + c.r) {
        c.damage(CFG.PUNCH_DMG * 0.4, 'player');
        return;
      }
    }
  }

  hurt(n, from) {
    if (this.hp <= 0) return;
    if (this.shield > 0) return;
    if (this.armor > 0) {
      const abs = Math.min(this.armor, n * 0.7);
      this.armor -= abs;
      n -= abs;
    }
    this.hp -= n;
    this.hurtT = 0.3;
    G.cam.shake = Math.min(10, G.cam.shake + 3);
    if (this.hp <= 0) {
      this.hp = 0;
      if (this.car) this.exitCar(true);
      if (G.gameRef) G.gameRef.wasted();
    }
  }

  giveMoney(n) {
    G.money += n;
    sfxPickup();
  }
}
