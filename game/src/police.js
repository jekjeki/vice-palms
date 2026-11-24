// police.js — the Vice City PD: five stars of trouble. Cruisers pursue and
// ram, foot cops hop out and shoot, roadblocks appear at 3 stars, and heat
// decays only when nobody in blue can see you. BUSTED costs money.

import { CFG, roadX, roadY, DIRS } from './config.js';
import { G, RNG, clamp, dist, angNorm, say, help } from './util.js';
import { Car, dirAng } from './cars.js';
import { sirenOn, sirenOff, sirenVolume, sfxShot } from './audio.js';
import { addStat } from './stats.js';

export class Cop {
  constructor(x, y, swat = false) {
    this.x = x; this.y = y;
    this.h = 0;
    this.hp = swat ? 120 : 60;
    this.swat = swat;
    this.shootT = 1 + Math.random();
    this.deadT = 0;
    this.walkT = Math.random() * 5;
    this.state = 'chase';
  }

  update(dt) {
    if (this.hp <= 0) { this.deadT += dt; return; }
    const P = G.player;
    if (!P) return;
    this.walkT += dt;
    const dx = P.x - this.x, dy = P.y - this.y;
    const d = Math.hypot(dx, dy) || 0.001;
    this.h = Math.atan2(dy, dx);

    const ideal = P.car ? 60 : (this.swat ? 70 : 90);
    let spd = 0;
    if (d > ideal) spd = this.swat ? 122 : 108;
    else if (d < ideal * 0.6) spd = -40;
    this.x += (dx / d) * spd * dt;
    this.y += (dy / d) * spd * dt;
    const r = G.world.collide(this.x, this.y, 6);
    if (r.power > 0.01) { this.x = r.x; this.y = r.y; }

    // shoot on foot only when close-ish and the player is not in a fast car
    this.shootT -= dt;
    const pSpeed = P.car ? P.car.speed : 0;
    if (this.shootT <= 0 && d < 300 && pSpeed < 220) {
      this.shootT = (this.swat ? 0.62 : 0.95) + Math.random() * 0.5;
      const spread = (Math.random() - 0.5) * (this.swat ? 0.1 : 0.14);
      const a = this.h + spread;
      G.bullets.push({
        x: this.x + Math.cos(a) * 10, y: this.y + Math.sin(a) * 10,
        vx: Math.cos(a) * 700, vy: Math.sin(a) * 700,
        life: 0.5, from: 'cop',
      });
      sfxShot();
    }
  }
}

// pit maneuver: cruisers at 2+ stars shoulder the player's car
function pitAttempt(c, dt) {
  const P = G.player;
  if (!P || !P.car || (G.police ? G.police.stars : 0) < 2) return;
  const dx = P.car.x - c.x, dy = P.car.y - c.y;
  const d = Math.hypot(dx, dy);
  if (d < c.r + P.car.r + 26 && Math.abs(angNorm(Math.atan2(dy, dx) - c.h)) < 0.6) {
    P.car.vx += (dx / d) * 40 * dt * 60 * 0.4;
    P.car.vy += (dy / d) * 40 * dt * 60 * 0.4;
  }
}

export class Police {
  constructor(seed) {
    this.rng = new RNG(seed ^ 0xc0ffee);
    this.stars = 0;
    this.heat = 0;
    this.decayT = 0;
    this.spawnT = 0;
    this.blockT = 0;
    this.bustT = 0;
    this.copEjectT = 0;
  }

  // ------------------------------------------------------------- heat
  crime(n, x, y, opts = {}) {
    if (this.stars >= 5) return;
    if (opts.gun) {
      // gunfire only counts if someone can report it
      let witness = false;
      for (const c of G.cops) if (c.hp > 0 && dist(c.x, c.y, x, y) < 500) witness = true;
      for (const c of G.cars) if (c.type === 'police' && !c.dead && dist(c.x, c.y, x, y) < 500) witness = true;
      if (!witness && Math.random() > 0.3) return;
    }
    this.heat = clamp(this.heat + n * 0.5, 0, 5.49);
    const s = Math.min(5, Math.floor(this.heat));
    if (s > this.stars) {
      this.stars = s;
      this.decayT = 0;
      const lines = {
        1: 'The VCPD has taken an interest in you.',
        2: 'Two stars. They are sending more cars.',
        3: 'Three stars. Roadblocks up ahead — drive smart.',
        4: 'Four stars. The whole precinct is out.',
        5: 'FIVE STARS. You are the night news.',
      };
      say(lines[s], 3);
    }
  }

  clear() {
    this.stars = 0; this.heat = 0; this.decayT = 0; this.bustT = 0;
  }

  setStars(n) {
    this.stars = clamp(n, 0, 5);
    this.heat = this.stars;
    this.decayT = 0;
  }

  cruisers() { return G.cars.filter((c) => c.ai && c.ai.kind === 'police' && !c.dead); }

  // ------------------------------------------------------------- update
  update(dt) {
    const P = G.player;
    if (!P || this.stars === 0) {
      // clean out any leftover units when cool
      if (this.stars === 0) {
        for (let i = G.cars.length - 1; i >= 0; i--) {
          const c = G.cars[i];
          if (c.ai && c.ai.kind === 'police' && c.driver !== 'player') {
            if (dist(c.x, c.y, G.cam.x, G.cam.y) > 600 || c.dead) G.cars.splice(i, 1);
          }
        }
        for (let i = G.cops.length - 1; i >= 0; i--) {
          if (G.cops[i].hp <= 0 || dist(G.cops[i].x, G.cops[i].y, G.cam.x, G.cam.y) > 700) G.cops.splice(i, 1);
        }
        sirenVolume(0);
      }
      return;
    }

    const want = CFG.CRUISERS[this.stars];
    const have = this.cruisers().length;
    this.spawnT -= dt;
    if (have < want && this.spawnT <= 0) {
      this.spawnT = 2.4 - this.stars * 0.2;
      this.spawnCruiser();
    }

    // roadblocks at 3+
    if (this.stars >= 3) {
      this.blockT -= dt;
      if (this.blockT <= 0) {
        this.blockT = 24;
        this.spawnRoadblock();
      }
    }

    // dispatch chatter keeps the night alive
    this.chatterT = (this.chatterT ?? 8) - dt;
    if (this.chatterT <= 0) {
      this.chatterT = 12 + this.rng.range(0, 10);
      const lines = [
        'DISPATCH: All units, suspect refused to pull over. Again.',
        'DISPATCH: Air unit, keep the light on the shiny car.',
        'DISPATCH: Do NOT let them reach the beach. The mayor jogs there.',
        'DISPATCH: Report any Stallion doing something heroic.',
        'DISPATCH: Units are reminded the overtime form is blue, not pink.',
      ];
      help(lines[(this.rng.f() * lines.length) | 0], 3);
    }

    // drive the cruisers
    for (const c of this.cruisers()) { this.drive(c, dt); pitAttempt(c, dt); }
    for (const c of G.cars) if (c.ai && c.ai.kind === 'police') c.update(dt);

    // foot cops
    this.copEjectT -= dt;
    for (let i = G.cops.length - 1; i >= 0; i--) {
      const cop = G.cops[i];
      if (cop.hp > 0 && cop.dying === undefined) cop.dying = false;
      if (cop.hp <= 0 && !cop.counted) {
        cop.counted = true;
        addStat('copsDowned', 1);
      }
      cop.update(dt);
      if (cop.hp <= 0 && cop.deadT > 18) G.cops.splice(i, 1);
      if (dist(cop.x, cop.y, G.cam.x, G.cam.y) > 1400) G.cops.splice(i, 1);
    }

    // busted check
    this.checkBust(dt);

    // heat decay when out of sight
    const seen = this.anyUnitNear(P.x, P.y, 560);
    if (seen) this.decayT = 0;
    else {
      this.decayT += dt;
      if (this.decayT > CFG.STAR_DECAY_T) {
        this.decayT = 0;
        this.stars--;
        this.heat = this.stars;
        if (this.stars === 0) { say('You lost them. The night cools.', 3); sirenOff(); addStat('evaded', 1); }
        else say('The heat drops... keep moving.', 2.4);
      }
    }

    // siren loudness by proximity
    let nearest = 1e9;
    for (const c of this.cruisers()) nearest = Math.min(nearest, dist(c.x, c.y, P.x, P.y));
    sirenOn();
    sirenVolume(nearest < 700 ? clamp(1 - nearest / 700, 0.1, 1) : 0.06);
  }

  anyUnitNear(x, y, r) {
    for (const c of this.cruisers()) if (dist(c.x, c.y, x, y) < r) return true;
    for (const c of G.cops) if (c.hp > 0 && dist(c.x, c.y, x, y) < r * 0.6) return true;
    return false;
  }

  spawnCruiser() {
    const w = G.world, cam = G.cam;
    for (let k = 0; k < 8; k++) {
      const p = w.randomLanePoint(this.rng);
      const d = dist(p.x, p.y, cam.x, cam.y);
      if (d < 600 || d > 1300) continue;
      const car = new Car('police', p.x, p.y, dirAng(p.dir), {
        driver: 'police',
        ai: { kind: 'police', stuckT: 0, revT: 0, ejectCd: 0 },
      });
      G.cars.push(car);
      return car;
    }
    return null;
  }

  drive(c, dt) {
    const P = G.player;
    const ai = c.ai;
    ai.ejectCd -= dt;
    // lead the target
    const lead = P.car ? 0.35 : 0;
    const tx = P.x + (P.car ? P.car.vx * lead : 0);
    const ty = P.y + (P.car ? P.car.vy * lead : 0);
    const dx = tx - c.x, dy = ty - c.y;
    const d = Math.hypot(dx, dy);
    const want = Math.atan2(dy, dx);
    let ad = angNorm(want - c.h);
    // if stuck, reverse a beat
    if (c.speed < 22 && Math.abs(c.ctrl.throttle) > 0.4) ai.stuckT += dt;
    else ai.stuckT = Math.max(0, ai.stuckT - dt * 2);
    if (ai.stuckT > 1.4) { ai.revT = 0.9; ai.stuckT = 0; }
    if (ai.revT > 0) {
      ai.revT -= dt;
      c.ctrl.throttle = -1;
      c.ctrl.steer = -Math.sign(ad);
      return;
    }
    c.ctrl.steer = clamp(ad * 2.4, -1, 1);
    const onFoot = !P.car;
    if (onFoot && d < 110) {
      c.ctrl.throttle = c.speed > 30 ? -1 : 0;
      // hop out and chase on foot — five stars sends S.W.A.T.
    if (d < 130 && ai.ejectCd <= 0 && c.speed < 50) {
        ai.ejectCd = 7;
        const px = -Math.sin(c.h), py = Math.cos(c.h);
        const swat = G.police ? G.police.stars >= 5 : false;
        for (let k = 0; k < 2; k++) {
          const cop = new Cop(c.x + px * (k ? -14 : 14), c.y + py * (k ? -14 : 14), swat);
          G.cops.push(cop);
        }
        if (swat) say('AIR ONE: S.W.A.T. team deployed.', 2.4);
      }
    } else {
      c.ctrl.throttle = d < 140 ? 0.35 : 1;
    }
    c.ctrl.hand = Math.abs(ad) > 1.9 && c.speed > 180;
  }

  spawnRoadblock() {
    const P = G.player;
    const w = G.world;
    // pick the intersection nearest to a point ~700 ahead of the player's motion
    const vx = P.car ? P.car.vx : Math.cos(P.h) * 120;
    const vy = P.car ? P.car.vy : Math.sin(P.h) * 120;
    const fx = P.x + vx * 1.6, fy = P.y + vy * 1.6;
    const i = w.nearestRoadIdx(fx, false);
    const j = w.nearestRoadIdx(fy, true);
    const nx = roadX(i), ny = roadY(j);
    if (dist(nx, ny, P.x, P.y) < 260) return;
    // two cruisers nose-to-nose across the vertical road + two cops
    const vertical = w.isRoadAt(nx, P.y);
    if (vertical) {
      for (const off of [-26, 26]) {
        const car = new Car('police', nx + off, ny + (off > 0 ? 30 : -30), off > 0 ? dirAng(2) : dirAng(0), {
          driver: null, ai: { kind: 'police', stuckT: 0, revT: 0, ejectCd: 99, parked: true },
        });
        G.cars.push(car);
      }
      G.cops.push(new Cop(nx + 40, ny + 60));
      G.cops.push(new Cop(nx - 40, ny - 60));
      // four stars lays down spike strips across the road
      if (this.stars >= 4) {
        G.spikes.push({ x: nx - CFG.SPIKE.w / 2, y: ny - CFG.SPIKE.h / 2, w: CFG.SPIKE.w, h: CFG.SPIKE.h, life: CFG.SPIKE.life });
        G.spikes.push({ x: nx - CFG.SPIKE.w / 2, y: ny + CFG.B - CFG.SPIKE.h / 2, w: CFG.SPIKE.w, h: CFG.SPIKE.h, life: CFG.SPIKE.life });
      }
    }
  }

  checkBust(dt) {
    const P = G.player;
    let closeCops = 0;
    for (const cop of G.cops) {
      if (cop.hp > 0 && dist(cop.x, cop.y, P.x, P.y) < CFG.BUST_R) closeCops++;
    }
    // stopped car surrounded by cruisers also counts
    if (P.car && P.car.speed < 12) {
      for (const c of this.cruisers()) {
        if (dist(c.x, c.y, P.x, P.y) < 90) closeCops += 2;
      }
    }
    if (closeCops > 0 && (!P.car || P.car.speed < 12)) this.bustT += dt;
    else this.bustT = Math.max(0, this.bustT - dt * 1.5);
    if (this.bustT > 1.1 && G.gameRef) {
      this.bustT = 0;
      G.gameRef.busted();
    }
  }

  // busted/wasted fees
  fee(wasted) {
    const base = wasted ? CFG.FEE_WASTE : CFG.FEE_STAR * this.stars;
    const fee = Math.min(G.money, base);
    G.money -= fee;
    addStat('fees', fee);
    return fee;
  }

  removeUnits() {
    for (let i = G.cars.length - 1; i >= 0; i--) {
      const c = G.cars[i];
      if (c.ai && c.ai.kind === 'police' && c.driver !== 'player') G.cars.splice(i, 1);
    }
    G.cops.length = 0;
    sirenOff();
  }
}

export function drawCop(c, cop) {
  c.save();
  c.translate(cop.x, cop.y);
  c.rotate(cop.h);
  if (cop.hp <= 0) {
    c.fillStyle = 'rgba(90,10,20,0.5)';
    c.beginPath(); c.ellipse(4, 0, 12, 7, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2a3a5c';
    c.beginPath(); c.ellipse(0, 0, 9, 5, 0, 0, Math.PI * 2); c.fill();
    c.restore();
    return;
  }
  const step = Math.sin(cop.walkT * 12) * 3.2;
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.beginPath(); c.ellipse(1, 2, 7, 5, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#1c2438';
  c.fillRect(-2, -4 + step * 0.4, 5, 3);
  c.fillRect(-2, 1 - step * 0.4, 5, 3);
  c.fillStyle = '#2a3a5c';                     // navy uniform
  c.beginPath(); c.ellipse(0, 0, 5.6, 4.4, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#e8e6e3';                     // cap
  c.beginPath(); c.arc(1.5, 0, 3.2, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#101624';
  c.fillRect(0.6, -2.6, 2.4, 5.2);
  c.restore();
}
