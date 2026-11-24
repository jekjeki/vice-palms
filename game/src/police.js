// Vice Palms — police: wanted 1-5, cruisers, roadblocks at 3+, decay, BUSTED
import { S, busted, spawnBullet, toast } from './game.js';
import { Car } from './cars.js';
import { CITY_W, CITY_H } from './world.js';

export class Police {
  constructor() { this.cops = []; this.rbT = 8; this.arrest = 0; }

  clear() { this.cops.length = 0; this.arrest = 0; this.rbT = 8; }

  sync() { /* spawns are throttled in update; sync just prunes when clean */ }

  spawnCop(x, y) {
    const c = new Car(
      Math.max(60, Math.min(CITY_W - 60, x)),
      Math.max(60, Math.min(CITY_H - 60, y)),
      S.rng() * Math.PI * 2, 'sedan', '#f0f0f0'
    );
    c.driver = 'cop'; c.isCop = true; c.hp = 120; c.maxHp = 120;
    this.cops.push(c);
    return c;
  }

  update(dt) {
    const p = S.player, focus = p.inCar || p;
    if (S.wanted === 0) {
      for (let i = this.cops.length - 1; i >= 0; i--) {
        const c = this.cops[i];
        if (c.dead) { this.cops.splice(i, 1); continue; }
        if (Math.hypot(c.x - focus.x, c.y - focus.y) > 1500) this.cops.splice(i, 1);
        else { c.th = 0; c.br = 1; c.update(dt); }
      }
      this.arrest = 0;
      return;
    }

    const want = Math.min(2 + S.wanted, 8);
    let alive = 0;
    for (const c of this.cops) if (!c.dead) alive++;
    if (alive < want && S.frame % 55 === 0) {
      const a = S.rng() * Math.PI * 2, d = 780 + S.rng() * 420;
      this.spawnCop(focus.x + Math.cos(a) * d, focus.y + Math.sin(a) * d);
    }

    for (const c of this.cops) {
      if (c.dead) { c.burnT -= dt; continue; }
      this.chase(c, focus, dt);
    }
    for (let i = this.cops.length - 1; i >= 0; i--) {
      if (this.cops[i].dead && this.cops[i].burnT <= 0) this.cops.splice(i, 1);
    }

    // roadblocks at 3+ stars (only while player drives)
    if (S.wanted >= 3 && p.inCar) {
      this.rbT -= dt;
      if (this.rbT <= 0) { this.roadblock(p.inCar); this.rbT = 15; }
    }

    // busted: on foot, cop car parked close for long enough
    if (!p.inCar) {
      let near = false;
      for (const c of this.cops) {
        if (!c.dead && Math.hypot(c.x - p.x, c.y - p.y) < 72 && Math.abs(c.spd) < 50) { near = true; break; }
      }
      this.arrest = near ? this.arrest + dt : Math.max(0, this.arrest - dt * 2);
      if (this.arrest > 1.7) busted();
    } else this.arrest = 0;
  }

  chase(c, f, dt) {
    const p = S.player;
    if (c.rb) { c.th = 0; c.br = 1; c.update(dt); return; }
    const tx = f.x + (f.vx || 0) * 0.55, ty = f.y + (f.vy || 0) * 0.55;
    const want = Math.atan2(ty - c.y, tx - c.x);
    let da = want - c.a;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    c.st = Math.max(-1, Math.min(1, da * 2.4));
    const dist = Math.hypot(f.x - c.x, f.y - c.y);
    if (dist < 130 && !p.inCar) { c.th = 0; c.br = 1; }   // box them in
    else { c.th = 1; c.br = 0; }
    c.update(dt);

    // pit-and-persist: ram the player's car at close quarters
    if (p.inCar && dist < 90) {
      p.inCar.damage(6 * dt * 10, 'cop');
      S.shake = Math.min(10, S.shake + dt * 30);
    }
    // fire from the cruiser at 2+ stars
    if (S.wanted >= 2 && dist < 440 && !c.dead && S.frame % Math.max(14, 36 - S.wanted * 4) === 0) {
      const aim = Math.atan2(f.y - c.y, f.x - c.x) + (S.rng() - 0.5) * 0.22;
      spawnBullet(c.x + Math.cos(aim) * 32, c.y + Math.sin(aim) * 32, aim, 'cop', 840);
    }
  }

  roadblock(car) {
    const dirx = Math.cos(car.a), diry = Math.sin(car.a);
    const bx = car.x + dirx * 860, by = car.y + diry * 860;
    if (bx < 120 || bx > CITY_W - 120 || by < 120 || by > CITY_H - 120) return;
    const perp = car.a + Math.PI / 2;
    for (const off of [-50, 50]) {
      const rb = this.spawnCop(bx + Math.cos(perp) * off, by + Math.sin(perp) * off);
      rb.a = car.a + Math.PI / 2 * (S.rng() < 0.5 ? 1 : -1);
      rb.rb = true;
    }
    toast('Roadblock ahead!');
  }

  hitCar(x, y) {
    for (const c of this.cops) if (!c.dead && c.contains(x, y)) return c;
    return null;
  }
  hitCop(x, y) { return this.hitCar(x, y) ? true : false; }
}
