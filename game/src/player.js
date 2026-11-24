// Vice Palms — player: walk/sprint, carjack (F), health/armor, fists + pistol
import { S, crime, spawnBullet, wasted, toast } from './game.js';
import { damageCar } from './cars.js';

export class Player {
  constructor() {
    this.x = 0; this.y = 0; this.a = 0; this.vx = 0; this.vy = 0;
    this.hp = 100; this.armor = 0; this.ammo = 24;
    this.weapon = 'pistol';
    this.inCar = null;
    this.shootT = 0; this.punchT = 0; this.sprint = 100; this.walkT = 0;
  }
  cx() { return this.inCar ? this.inCar.x : this.x; }
  cy() { return this.inCar ? this.inCar.y : this.y; }
  alive() { return this.hp > 0; }

  hurt(dmg) {
    if (!Number.isFinite(dmg) || dmg <= 0 || !this.alive()) return;
    if (this.armor > 0) { const a = Math.min(this.armor, dmg * 0.6); this.armor -= a; dmg -= a; }
    this.hp -= dmg;
    S.shake = Math.min(12, S.shake + 3);
    if (this.hp <= 0) { this.hp = 0; wasted(); }
  }

  // ---- vehicles ----
  enterCar(car) {
    if (!car || car.dead) return;
    if (car.driver === 'traffic' || car.driver === 'cop') {
      crime(car.driver === 'cop' ? 1.8 : 0.8);
      S.stats.jack++;
      S.peds.panic(car.x, car.y, 300);
      toast('Carjacked: ' + car.t.name);
    }
    car.driver = 'player';
    car.lane = null;
    this.inCar = car;
    this.x = car.x; this.y = car.y;
  }
  exitCar() {
    const c = this.inCar;
    if (!c) return;
    if (Math.abs(c.spd) > 130) return; // too fast to bail safely
    c.driver = 'none'; c.th = 0; c.st = 0; c.br = 1;
    const ox = Math.cos(c.a + Math.PI / 2) * (c.h / 2 + 18);
    const oy = Math.sin(c.a + Math.PI / 2) * (c.h / 2 + 18);
    this.x = c.x + ox; this.y = c.y + oy;
    S.world.resolveCircle(this, 11);
    this.inCar = null;
  }

  // ---- update ----
  update(dt) {
    if (this.inCar) this.drive(dt);
    else { this.walk(dt); this.combat(dt); }
  }

  walk(dt) {
    const K = S.keys;
    let dx = ((K.KeyD || K.ArrowRight) ? 1 : 0) - ((K.KeyA || K.ArrowLeft) ? 1 : 0);
    let dy = ((K.KeyS || K.ArrowDown) ? 1 : 0) - ((K.KeyW || K.ArrowUp) ? 1 : 0);
    const m = Math.hypot(dx, dy);
    const sprinting = (K.ShiftLeft || K.ShiftRight) && m > 0 && this.sprint > 1;
    const spd = sprinting ? 215 : 128;
    if (sprinting) this.sprint = Math.max(0, this.sprint - 30 * dt);
    else this.sprint = Math.min(100, this.sprint + 20 * dt);
    if (m > 0) {
      dx /= m; dy /= m;
      this.a = Math.atan2(dy, dx);
      this.x += dx * spd * dt; this.y += dy * spd * dt;
      this.walkT += dt * (sprinting ? 11 : 7);
      this.vx = dx * spd; this.vy = dy * spd;
    } else { this.vx = this.vy = 0; }
    S.world.resolveCircle(this, 11);
    // carjack / enter
    if (S.pressed.has('KeyF')) {
      let best = null, bd = 95;
      const cars = S.traffic.cars.concat(S.police.cops);
      for (const c of cars) {
        if (c.dead) continue;
        const d = Math.hypot(c.x - this.x, c.y - this.y);
        if (d < bd) { bd = d; best = c; }
      }
      if (best) this.enterCar(best);
    }
  }

  drive(dt) {
    const c = this.inCar;
    if (!c || c.dead) { this.inCar = null; return; }
    const K = S.keys;
    const up = K.KeyW || K.ArrowUp, down = K.KeyS || K.ArrowDown;
    c.th = up ? 1 : (down ? -0.8 : 0);
    c.st = ((K.KeyD || K.ArrowRight) ? 1 : 0) - ((K.KeyA || K.ArrowLeft) ? 1 : 0);
    c.br = K.Space ? 1 : 0;
    c.update(dt);
    this.x = c.x; this.y = c.y; this.a = c.a;
    if (S.pressed.has('KeyF')) this.exitCar();
  }

  // ---- combat ----
  combat(dt) {
    this.shootT -= dt; this.punchT -= dt;
    if (S.pressed.has('KeyK')) {
      this.weapon = this.weapon === 'pistol' ? 'fists' : 'pistol';
      toast(this.weapon === 'pistol' ? `Pistol (${this.ammo})` : 'Fists');
      S.audio.blip(520, 0.05, 'square', 0.05);
    }
    const shooting = S.mouse.down || S.keys.KeyJ;
    const aimA = this.aimAngle();
    if (shooting && this.weapon === 'pistol' && this.shootT <= 0) {
      if (this.ammo <= 0) {
        if (S.frame % 40 === 0) toast('Out of ammo — find ammo pickup');
        this.shootT = 0.4;
        return;
      }
      this.shootT = 0.3; this.ammo--;
      const ox = Math.cos(aimA) * 20, oy = Math.sin(aimA) * 20;
      spawnBullet(this.cx() + ox, this.cy() + oy, aimA, 'player');
      S.peds.panic(this.cx(), this.cy(), 420);
      S.traffic.scare(this.cx(), this.cy(), 420);
      crime(0.15);
    }
    if (shooting && this.weapon === 'fists' && this.punchT <= 0 && !this.inCar) {
      this.punchT = 0.42;
      const px = this.cx() + Math.cos(aimA) * 24, py = this.cy() + Math.sin(aimA) * 24;
      const ped = S.peds.hitPed(px, py);
      if (ped) { ped.kill(); S.audio.punch(); }
      else {
        const c = S.traffic.hitCar(px, py) || S.police.hitCar(px, py);
        if (c) { damageCar(c, 4, 'player'); S.audio.punch(); }
      }
    }
  }

  aimAngle() {
    const wx = S.mouse.x + S.cam.x - 640, wy = S.mouse.y + S.cam.y - 360;
    const dx = wx - this.cx(), dy = wy - this.cy();
    if (Math.hypot(dx, dy) > 24) return Math.atan2(dy, dx);
    return this.inCar ? this.inCar.a : this.a;
  }
}
