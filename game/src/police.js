// police.js — wanted 1-5 stars: cruiser pursuit, foot cops that shoot,
// roadblocks at 3+, out-of-sight decay, BUSTED handling.

import { CFG, ctx } from './config.js';
import { clamp, dist, TAU, uid } from './util.js';
import { makeCar, steerToward, TYPES } from './cars.js';
import { randomRoadPoint, roadPointAhead, nearestRoadPoint, zoneAt } from './world.js';

const STAR_HEAT = CFG.heatLevels;   // [0,1,4,9,16,26]

export class FootCop {
  constructor(x, y) {
    this.id = uid();
    this.x = x; this.y = y;
    this.health = 55;
    this.dead = false;
    this.deadT = 0;
    this.shootT = 0.8 + Math.random() * 0.6;
    this.animT = Math.random() * 8;
    this.state = 'chase';
  }

  update(dt, S) {
    this.animT += dt;
    if (this.dead) { this.deadT += dt; return; }
    const p = S.player;
    const d = dist(this.x, this.y, p.x, p.y);
    this.dir = Math.atan2(p.y - this.y, p.x - this.x);
    if (!p.inCar && d > CFG.bustGrabRange * 0.7) {
      this.x += Math.cos(this.dir) * 118 * dt;
      this.y += Math.sin(this.dir) * 118 * dt;
    }
    this.shootT -= dt;
    if (this.shootT <= 0 && d < 300 && !p.inCar) {
      this.shootT = 0.9 + Math.random() * 0.4;
      if (ctx.sfx) ctx.sfx('shot', this.x, this.y);
      ctx.game.muzzle(this.x + Math.cos(this.dir) * 14, this.y + Math.sin(this.dir) * 14, this.dir);
      if (Math.random() < 0.55) p.damage(8, { x: this.x, y: this.y, kind: 'cop' });
    }
  }

  hurt(dmg) {
    if (this.dead) return false;
    this.health -= dmg;
    if (this.health <= 0) { this.dead = true; return true; }
    return false;
  }
}

// ---------------------------------------------------------------- heli -----
// Air support at 4+ stars: circles overhead, searchlight pins the player,
// shoots at 5 stars. Cannot be destroyed from the ground — shake it by
// breaking line of sight (it drifts to the player's last known position).
export class PoliceHeli {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.orbitA = Math.random() * TAU;
    this.rotor = 0;
    this.shootT = 2;
    this.alive = true;
  }

  update(dt, S) {
    this.rotor += dt * 28;
    const p = S.player;
    const speed = 210;
    // orbit the player at radius 170
    this.orbitA += dt * 0.5;
    const tx = p.x + Math.cos(this.orbitA) * 170;
    const ty = p.y + Math.sin(this.orbitA) * 170;
    const ang = Math.atan2(ty - this.y, tx - this.x);
    this.vx += Math.cos(ang) * speed * dt * 2;
    this.vy += Math.sin(ang) * speed * dt * 2;
    this.vx *= 1 - 1.6 * dt;
    this.vy *= 1 - 1.6 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.x = clamp(this.x, 60, CFG.map - 60);
    this.y = clamp(this.y, 60, CFG.map - 60);
    this.dir = Math.atan2(p.y - this.y, p.x - this.x);

    // strafing fire at 5 stars
    this.shootT -= dt;
    if (ctx.police.level >= 5 && this.shootT <= 0 && dist(this.x, this.y, p.x, p.y) < 420) {
      this.shootT = 0.5 + Math.random() * 0.3;
      const a = Math.atan2(p.y - this.y, p.x - this.x) + (Math.random() - 0.5) * 0.12;
      if (ctx.sfx) ctx.sfx('shot', this.x, this.y);
      ctx.game.muzzle(this.x, this.y, a);
      if (Math.random() < 0.42) p.damage(6, { x: this.x, y: this.y, kind: 'heli' });
    }
  }
}

export class Police {
  constructor() {
    this.heat = 0;
    this.level = 0;
    this.spawnT = 0;
    this.decayT = 0;
    this.roadblockT = 14;
    this.bustT = 0;
    this.forced = 0;          // missions can pin a minimum level
    this.clearedFlash = 0;
    this.heli = null;         // air support at 4+ stars
  }

  crime(units, x, y) {
    if (units <= 0) return;
    this.heat += units;
    this.decayT = 0;
    const lvl = this.levelFromHeat();
    if (lvl > this.level) {
      this.level = lvl;
      this.spawnT = 0.4;                 // respond to fresh crimes fast
      if (ctx.sfx) ctx.sfx('star', x || 0, y || 0);
    }
  }

  levelFromHeat() {
    let lvl = 0;
    for (let i = 1; i < STAR_HEAT.length; i++) {
      if (this.heat >= STAR_HEAT[i]) lvl = i;
    }
    return clamp(lvl, this.forced, 5);
  }

  forceLevel(lvl, seconds = 99999) {
    this.forced = lvl;
    this.level = Math.max(this.level, lvl);
    this.heat = Math.max(this.heat, STAR_HEAT[lvl]);
    this.decayT = 0;
  }

  clearForced() {
    this.forced = 0;
    this.heat = Math.min(this.heat, STAR_HEAT[this.levelFromHeat()]);
  }

  clear() {
    this.heat = 0; this.level = 0; this.forced = 0; this.bustT = 0;
    for (const c of ctx.cars) {
      if (c.ai === 'police') { c.ai = 'parked'; c.driver = null; c.siren = false; c.aiState = null; }
    }
    ctx.policeFootList.length = 0;
    this.heli = null;
  }

  update(dt, S) {
    const p = S.player;

    // --- spawn cruisers -----------------------------------------------------
    if (this.level > 0) {
      this.spawnT -= dt;
      const target = Math.min(CFG.maxCruisers, this.level + 1);
      let alive = 0;
      for (const c of ctx.cars) if (c.ai === 'police' && !c.dead) alive++;
      if (this.spawnT <= 0 && alive < target) {
        this.spawnT = CFG.copSpawnInterval;
        this.spawnCruiser(S);
      }
    }

    // --- cruiser AI ----------------------------------------------------------
    for (const car of ctx.cars) {
      if (car.ai !== 'police' || car.dead) continue;
      this.driveCruiser(car, dt, S);
      // siren strobe flag for render/audio
      car.siren = !car.dead;
    }

    // --- foot cops -----------------------------------------------------------
    const fl = ctx.policeFootList;
    for (let i = fl.length - 1; i >= 0; i--) {
      const f = fl[i];
      f.update(dt, S);
      if ((f.dead && f.deadT > 20) || dist(f.x, f.y, p.x, p.y) > 1900) fl.splice(i, 1);
    }

    // --- dismount: cruisers near an on-foot player release a cop -------------
    if (this.level > 0 && !p.inCar) {
      let released = 0;
      for (const f of fl) if (!f.dead) released++;
      if (released < this.level) {
        for (const car of ctx.cars) {
          if (car.ai !== 'police' || car.dead) continue;
          const d = dist(car.x, car.y, p.x, p.y);
          if (d < 300 && car.speed < 40) {
            if (Math.random() < dt * 2.2) {
              fl.push(new FootCop(car.x, car.y));
              car.stopT = 1.4;
              break;
            }
          }
        }
      }
    }

    // --- BUSTED checks --------------------------------------------------------
    if (this.level > 0) {
      if (!p.inCar) {
        for (const f of fl) {
          if (f.dead) continue;
          if (dist(f.x, f.y, p.x, p.y) < CFG.bustGrabRange) {
            this.bustT += dt;
            if (this.bustT > CFG.bustGrabTime) {
              ctx.game.onBusted();
              return;
            }
            break;
          }
        }
      } else if (p.inCar.speed < 25) {
        let near = 0;
        for (const car of ctx.cars) {
          if (car.ai === 'police' && !car.dead && dist(car.x, car.y, p.x, p.y) < 95) near++;
        }
        if (near >= 2) {
          this.bustT += dt;
          if (this.bustT > CFG.bustCarStopTime) {
            ctx.game.onBusted();
            return;
          }
        } else this.bustT = Math.max(0, this.bustT - dt * 2);
      } else this.bustT = Math.max(0, this.bustT - dt * 2);
    }

    // --- helicopter air support at 4+ stars ---------------------------------
    if (this.level >= 4) {
      if (!this.heli) {
        const a = Math.random() * TAU;
        this.heli = new PoliceHeli(p.x + Math.cos(a) * 900, p.y + Math.sin(a) * 900);
        ctx.subtitle('Air support inbound!', 2.4);
        if (ctx.sfx) ctx.sfx('heli', p.x, p.y);
      }
      this.heli.update(dt, S);
    } else if (this.heli) {
      this.heli = null;
    }

    // --- roadblocks -----------------------------------------------------------
    this.roadblockT -= dt;
    if (this.level >= CFG.roadblockLevel && this.roadblockT <= 0) {
      this.roadblockT = CFG.roadblockCooldown;
      this.spawnRoadblock(S);
    }

    // --- out-of-sight decay ----------------------------------------------------
    if (this.level > this.forced) {
      let seen = false;
      for (const car of ctx.cars) {
        if (car.ai === 'police' && !car.dead && dist(car.x, car.y, p.x, p.y) < 950) { seen = true; break; }
      }
      if (!seen) for (const f of fl) {
        if (!f.dead && dist(f.x, f.y, p.x, p.y) < 800) { seen = true; break; }
      }
      const need = 10 + this.level * 4;   // higher stars take longer to shake
      if (seen) this.decayT = 0;
      else {
        this.decayT += dt;
        if (this.decayT > need) {
          this.decayT = 0;
          this.level--;
          if (this.level <= 0) { this.clear(); this.clearedFlash = 2; }
          else if (ctx.sfx) ctx.sfx('star-down', p.x, p.y);
        }
      }
    }
    this.clearedFlash = Math.max(0, this.clearedFlash - dt);
  }

  spawnCruiser(S) {
    const p = S.player;
    const pt = randomRoadPoint(ctx.world, Math.random);
    const d = dist(pt.x, pt.y, p.x, p.y);
    if (d < 380 || d > 2100) return;      // try again next tick
    const car = makeCar('police', pt.x, pt.y, 0);
    const ang = Math.atan2(p.y - pt.y, p.x - pt.x);
    car.angle = ang;
    car.vx = Math.cos(ang) * 180;
    car.vy = Math.sin(ang) * 180;
    car.driver = 'police';
    car.ai = 'police';
    car.aiState = { mode: 'pursuit' };
    car.siren = true;
    ctx.cars.push(car);
    if (ctx.sfx) ctx.sfx('siren-start', pt.x, pt.y);
  }

  driveCruiser(car, dt, S) {
    const p = S.player;
    // chase the player with lead; ram on purpose
    const lead = p.inCar ? 0.5 : 0.1;
    const tx = p.x + (p.inCar ? p.inCar.vx : 0) * lead;
    const ty = p.y + (p.inCar ? p.inCar.vy : 0) * lead;
    const d = dist(car.x, car.y, p.x, p.y);
    let steer = steerToward(car, tx, ty, dt, 2.9);

    let throttle = 1;
    if (!p.inCar && d < 240) throttle = -0.9;         // pull up for an arrest
    if (d < 46 && !p.inCar && car.speed < 30) throttle = 0;
    if (d < 90 && p.inCar) throttle = 1;              // ram!
    if (car.stopT > 0) { car.stopT -= dt; throttle = -0.2; }

    const st = car.aiState || {};
    // unstick: reverse briefly when wedged
    if (car.speed < 16 && throttle > 0.3) {
      st.stuck = (st.stuck || 0) + dt;
      if (st.stuck > 1.0 && (st.rev || 0) <= 0) { st.rev = 0.7; st.stuck = 0.4; }
    } else if (car.speed > 30) st.stuck = 0;
    if (st.rev > 0) { st.rev -= dt; throttle = -0.85; steer = -steer; }
    car.aiState = st;

    // wedged or dawdling far from the player → redeploy nearby on a road
    if (d > 460 && car.speed < 32) {
      st.slowT = (st.slowT || 0) + dt;
      if (st.slowT > 2.2) {
        st.slowT = 0;
        const pt = randomRoadPoint(ctx.world, Math.random);
        const nd = dist(pt.x, pt.y, p.x, p.y);
        if (nd > 420 && nd < 900) {
          car.x = pt.x; car.y = pt.y;
          car.angle = Math.atan2(p.y - pt.y, p.x - pt.x);
          car.vx = Math.cos(car.angle) * 200;
          car.vy = Math.sin(car.angle) * 200;
          st.stuck = 0; st.rev = 0;
        }
      }
    } else st.slowT = 0;

    // way behind & offscreen → teleport closer (keeps pursuit hot)
    if (d > 2300) {
      const pt = randomRoadPoint(ctx.world, Math.random);
      if (dist(pt.x, pt.y, p.x, p.y) < 1500) {
        car.x = pt.x; car.y = pt.y;
        car.vx = 0; car.vy = 0;
      }
    }

    car.update(dt, { throttle, steer, hand: false });
  }

  spawnRoadblock(S) {
    const p = S.player;
    if (!p.inCar) return;
    const ang = p.inCar.angle;
    const pt = roadPointAhead(ctx.world, p.x, p.y, ang, 620, Math.random);
    if (!pt) return;
    const perp = pt.axis === 'h' ? Math.PI / 2 : 0;
    for (let k = -1; k <= 1; k += 2) {
      const off = k * 30;
      const cx = pt.axis === 'h' ? pt.x : pt.x + off;
      const cy = pt.axis === 'h' ? pt.y + off : pt.y;
      const car = makeCar('police', cx, cy, perp);
      car.driver = 'police';
      car.ai = 'police';
      car.aiState = { mode: 'roadblock', rev: 0 };
      car.siren = true;
      ctx.cars.push(car);
      ctx.policeFootList.push(new FootCop(cx + (Math.random() - 0.5) * 40, cy + (Math.random() - 0.5) * 40));
    }
    ctx.subtitle('Roadblock ahead!', 2);
    if (ctx.sfx) ctx.sfx('siren-start', pt.x, pt.y);
  }

  // called when a cruiser is destroyed by the player
  copCarDestroyed(car) {
    this.crime(1.5, car.x, car.y);
  }

  stars() {
    return this.level;
  }
}
