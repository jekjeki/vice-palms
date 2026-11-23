// police.js — wanted 1-5: cruiser pursuit + ramming, roadblocks at 3+, foot cops, decay, BUSTED
import { CFG } from './config.js';
import { clamp, dist, angDiff, angleTo, rand, TAU } from './util.js';
import { Ped } from './peds.js';

// cruiser chase AI: steer at the player, ram, unstick itself
export class ChaseAI {
  constructor() { this.stuck = 0; this.revT = 0; this.siren = true; }

  drive(car, game, dt) {
    const p = game.player;
    const tx = p.inCar ? p.inCar.x + p.inCar.vx * 0.5 : p.x;
    const ty = p.inCar ? p.inCar.y + p.inCar.vy * 0.5 : p.y;
    const d = dist(car.x, car.y, tx, ty);

    // stuck detection: little movement while throttling
    if (car.speed < 24) this.stuck += dt; else this.stuck = Math.max(0, this.stuck - dt * 2);
    if (this.stuck > 1.4) { this.revT = 0.9; this.stuck = 0; }

    let t, s;
    if (this.revT > 0) {
      this.revT -= dt;
      t = -1;
      s = angDiff(car.h, angleTo(car.x, car.y, tx, ty)) > 0 ? -1 : 1;
      return { t, s };
    }

    const aim = angleTo(car.x, car.y, tx, ty);
    const err = angDiff(car.h, aim);
    s = clamp(err * 1.5, -1, 1);
    t = d > 160 ? 1 : (p.inCar ? 0.85 : 0.3);
    // brake-check to ram squarely
    if (d < 70 && p.inCar) t = 1;
    if (p.inCar && p.inCar.speed < 20 && d < 90) t = 1; // ram stationary player
    return { t, s };
  }
}

export class Police {
  constructor(game) {
    this.game = game;
    this.heat = 0;               // continuous wanted energy
    this.wanted = 0;
    this.blockT = 0;             // roadblock cooldown
    this.decayT = 0;             // out-of-sight timer
    this.spawnT = 0;
    this.bustT = 0;
    this.active = [];            // tracked cop peds (cruisers live in game.cars with police ai)
    this.lastReason = '';
  }

  addWanted(n, reason) {
    const before = this.wanted;
    this.heat = clamp(this.heat + n, 0, CFG.WANTED_MAX + 0.99);
    this.wanted = Math.min(CFG.WANTED_MAX, Math.max(this.wanted, Math.ceil(this.heat)));
    if (this.wanted > before) {
      this.lastReason = reason || this.lastReason;
      this.game.hud.toast('WANTED ' + '★'.repeat(this.wanted));
      this.game.audio?.star?.(this.wanted);
      this.decayT = 0;
    }
  }

  clear() { this.heat = 0; this.wanted = 0; this.decayT = 0; }

  update(dt) {
    const game = this.game;
    if (game.state !== 'play') return;
    const p = game.player;

    if (this.wanted > 0) {
      this.maintainCruisers(dt);
      if (this.wanted >= CFG.ROADBLOCK_STARS) this.maybeRoadblock(dt);
      this.updateFootCops(dt);
      this.updateHeli(dt);
      if (this.wanted >= 4) this.updateSpikes(dt);
      this.checkDecay(dt);
      this.checkBust(dt);
    } else {
      // cool down: parked cruisers disperse, heli leaves
      if (this.heli) { this.heli.leave = true; }
      for (const c of game.cars) {
        if (c.type === 'police' && c.ai instanceof ChaseAI && dist(c.x, c.y, p.x, p.y) > 700) {
          c.despawn = true;
        }
      }
      for (const ped of game.peds) if (ped.kind === 'cop' && dist(ped.x, ped.y, p.x, p.y) > 500) ped.despawn = true;
    }
  }

  maintainCruisers(dt) {
    const game = this.game;
    const p = game.player;
    this.spawnT -= dt;
    const target = Math.min(8, Math.ceil(this.wanted * CFG.CRUISERS_PER_STAR));
    let live = 0;
    for (const c of game.cars) if (c.type === 'police' && c.ai instanceof ChaseAI && c.state === 'drive') live++;
    if (live < target && this.spawnT <= 0) {
      this.spawnT = 1.6;
      const spot = this.spawnPoint(p);
      if (spot) {
        const car = game.addCar('police', spot.x, spot.y, angleTo(spot.x, spot.y, p.x, p.y));
        car.driver = 'ai';
        car.ai = new ChaseAI();
        car.siren = true;
        game.audio?.sirenStart?.();
      }
    }
  }

  // off-screen road position near the player
  spawnPoint(p) {
    const game = this.game;
    const R = CFG.ROAD_SPACING;
    for (let i = 0; i < 10; i++) {
      const ang = rand(0, TAU);
      const d = 620 + rand(0, 300);
      const x = clamp(p.x + Math.cos(ang) * d, 200, CFG.W - 200);
      const y = clamp(p.y + Math.sin(ang) * d, 400, CFG.SAND_S - 60);
      const ry = Math.round(y / R) * R;
      const rx = Math.round(x / R) * R;
      if (Math.abs(y - ry) < 40) return { x, y: ry + (Math.random() < 0.5 ? 15 : -15) };
      if (Math.abs(x - rx) < 40) return { x: rx + (Math.random() < 0.5 ? 15 : -15), y };
    }
    return null;
  }

  maybeRoadblock(dt) {
    const game = this.game, p = game.player;
    this.blockT -= dt;
    if (this.blockT > 0) return;
    this.blockT = 14;
    if (!p.inCar || p.inCar.speed < 120) return;
    // at 4+ stars also lay a spike strip before the roadblock
    if (this.wanted >= 4) this.laySpikes(game, p);
    // place across the road the player is driving toward
    const car = p.inCar;
    const ahead = 520;
    const bx = car.x + Math.cos(car.h) * ahead;
    const by = car.y + Math.sin(car.h) * ahead;
    const R = CFG.ROAD_SPACING;
    const horiz = Math.abs(Math.sin(car.h)) < 0.7;
    const ry = Math.round(by / R) * R;
    const rx = Math.round(bx / R) * R;
    if (horiz && Math.abs(by - ry) < 60 && ry > 400 && ry < CFG.SAND_S - 60) {
      for (let i = -1; i <= 1; i++) {
        const cx = bx + i * 44;
        const c = game.addCar('police', cx, ry + (i === 0 ? 4 : -6), (i === 0 ? 0.2 : i < 0 ? -0.5 : 0.5) + (Math.random() < 0.5 ? 0 : Math.PI));
        c.driver = null; // parked, angled
        const cop = game.spawnPed(cx, ry + 34, { kind: 'cop' });
        this.active.push(cop);
      }
      game.hud.toast('ROADBLOCK ahead!');
      game.audio?.roadblock?.();
    } else if (!horiz && Math.abs(bx - rx) < 60 && rx > 200 && rx < CFG.AIR_W) {
      for (let i = -1; i <= 1; i++) {
        const cy = by + i * 44;
        const c = game.addCar('police', rx + (i === 0 ? 4 : -6), cy, Math.PI / 2 + (i - 1) * 0.4);
        c.driver = null;
        const cop = game.spawnPed(rx + 34, cy, { kind: 'cop' });
        this.active.push(cop);
      }
      game.hud.toast('ROADBLOCK ahead!');
      game.audio?.roadblock?.();
    }
  }

  updateFootCops(dt) {
    const game = this.game, p = game.player;
    // cruisers near a player on foot deploy officers
    if (!p.inCar) {
      for (const c of game.cars) {
        if (c.type !== 'police' || !(c.ai instanceof ChaseAI) || c.state !== 'drive') continue;
        if (dist(c.x, c.y, p.x, p.y) < 130 && c.speed < 40 && !c.deployed) {
          c.deployed = true;
          const door = c.centerOffset('left');
          // at 5 stars: SWAT pair, heavier and more accurate
          const swat = this.wanted >= 5;
          const cop = game.spawnPed(door.x, door.y, { kind: 'cop', hp: swat ? 90 : 45 });
          if (swat) cop.swat = true;
          this.active.push(cop);
          if (swat) {
            const cop2 = game.spawnPed(door.x + 20, door.y + 12, { kind: 'cop', hp: 90 });
            cop2.swat = true;
            this.active.push(cop2);
            game.hud.toast('SWAT deployed!');
          }
        }
      }
    }
    for (const cop of game.peds) {
      if (cop.kind !== 'cop' || cop.state === 'dead' || cop.state === 'down') continue;
      const d = dist(cop.x, cop.y, p.x, p.y);
      cop.shootT = (cop.shootT || 0) - dt;
      if (d < 320 && cop.shootT <= 0) {
        cop.shootT = (cop.swat ? CFG.COP_SHOOT_CD * 0.7 : CFG.COP_SHOOT_CD) * rand(0.8, 1.3);
        cop.dir = angleTo(cop.x, cop.y, p.x, p.y);
        game.spawnBullet(cop.x + Math.cos(cop.dir) * 12, cop.y + Math.sin(cop.dir) * 12, cop.dir + (cop.swat ? 0 : rand(-0.08, 0.08)), 'cop');
        game.audio?.gunshot?.(0.5);
      }
      // walk toward the player
      if (d > 200) {
        const a = angleTo(cop.x, cop.y, p.x, p.y);
        cop.dir = a;
        cop.state = 'walk';
        cop.homeDir = a;
      }
    }
  }

  checkDecay(dt) {
    const game = this.game, p = game.player;
    let seen = false;
    for (const c of game.cars) {
      if (c.type === 'police' && (c.ai instanceof ChaseAI || c.driver === 'ai') && dist(c.x, c.y, p.x, p.y) < 760) { seen = true; break; }
    }
    if (!seen) for (const ped of game.peds) {
      if (ped.kind === 'cop' && ped.state !== 'dead' && dist(ped.x, ped.y, p.x, p.y) < 620) { seen = true; break; }
    }
    if (seen) this.decayT = 0;
    else {
      this.decayT += dt;
      // continuous cool-off: heat bleeds a little every second, stars drop on the beat
      if (this.decayT > CFG.DECAY_SEEN) {
        this.decayT = 0;
        this.heat = Math.max(0, Math.ceil(this.heat) - 1);
        this.wanted = Math.min(this.wanted, Math.max(0, Math.ceil(this.heat)));
        if (this.wanted === 0) { this.clear(); game.hud.toast('You lost the heat'); game.audio?.missionTick?.(); }
        else game.hud.toast('Heat cooling… ' + '★'.repeat(this.wanted));
      } else if (this.decayT > CFG.DECAY_SEEN * 0.5 && Math.random() < dt * 0.3) {
        this.heat = Math.max(this.wanted, this.heat - dt * 0.05);
      }
    }
  }

  checkBust(dt) {
    const game = this.game, p = game.player;
    if (p.inCar) { this.bustT = 0; return; }
    let near = false;
    for (const cop of game.peds) {
      if (cop.kind !== 'cop' || cop.state === 'dead' || cop.state === 'down') continue;
      if (dist(cop.x, cop.y, p.x, p.y) < 34) { near = true; break; }
    }
    if (near && this.wanted > 0) {
      this.bustT += dt;
      if (this.bustT > 0.9) { this.bustT = 0; game.onBusted?.(); }
    } else this.bustT = Math.max(0, this.bustT - dt);
  }

  onCopKilled() { this.addWanted(1, 'cop-down'); }

  // ------- spike strips (4+ stars) -------
  laySpikes(game, p) {
    const car = p.inCar;
    const ahead = 380;
    const bx = car.x + Math.cos(car.h) * ahead;
    const by = car.y + Math.sin(car.h) * ahead;
    const horiz = Math.abs(Math.sin(car.h)) < 0.7;
    const spike = {
      x: bx, y: by, axis: horiz ? 'h' : 'v', life: 22,
      x0: horiz ? bx - 90 : bx - 5, x1: horiz ? bx + 90 : bx + 5,
      y0: horiz ? by - 5 : by - 90, y1: horiz ? by + 5 : by + 90,
      hit: false,
    };
    this.spikes = this.spikes || [];
    if (this.spikes.length < 3) {
      this.spikes.push(spike);
      game.hud.toast('SPIKE STRIP ahead!');
      game.audio?.roadblock?.();
    }
  }

  updateSpikes(dt) {
    const game = this.game;
    this.spikes = this.spikes || [];
    for (const s of this.spikes) {
      s.life -= dt;
      for (const c of game.cars) {
        if (c.state === 'wreck' || c.spikeT > 0) continue;
        if (c.x < s.x0 || c.x > s.x1 || c.y < s.y0 || c.y > s.y1) continue;
        if (c.speed < 80) continue;
        c.spikeT = 6;
        game.audio?.tirePop?.();
        game.fxSparks(c.x, c.y, 8);
        if (c === game.player.inCar) {
          game.hud.toast('Tires blown! Limp to a garage');
          game.cam.shake = Math.min(CFG.SHAKE_MAX, game.cam.shake + 6);
        }
      }
    }
    this.spikes = this.spikes.filter((s) => s.life > 0);
  }

  // ------- police helicopter (4+ stars): shadow, searchlight, pot shots -------
  updateHeli(dt) {
    const game = this.game, p = game.player;
    if (!this.heli) {
      if (this.wanted >= 4 && !this.heliCd) { this.heliCd = true; this.heli = new Heli(p.x - 500, p.y - 500); game.hud.toast('Air unit inbound!'); game.audio?.alarm?.(); }
    }
    const heli = this.heli;
    if (!heli) return;
    heli.update(game, dt);
    if (dist(heli.x, heli.y, p.x, p.y) < 900) game.audio?.rotor(1 - dist(heli.x, heli.y, p.x, p.y) / 900);
    if (heli.gone || this.wanted < 3) { this.heli = null; this.heliCd = false; }
  }
}

export class Heli {
  constructor(x, y) {
    this.x = x; this.y = y;      // world position of the air unit (drawn overhead)
    this.alt = 260;              // fictional altitude for shadow offset
    this.spotR = 60;             // searchlight radius on the ground
    this.shootT = 2;
    this.rotor = 0;
    this.leave = false;
    this.gone = false;
    this.wobble = Math.random() * TAU;
  }

  update(game, dt) {
    const p = game.player;
    this.rotor += dt * 40;
    this.wobble += dt * 2;
    const tx = (p.inCar ? p.inCar.x : p.x) + Math.cos(this.wobble) * 60;
    const ty = (p.inCar ? p.inCar.y : p.y) + Math.sin(this.wobble * 0.8) * 60;
    this.x += (tx - this.x) * Math.min(1, dt * 1.4);
    this.y += (ty - this.y) * Math.min(1, dt * 1.4);
    if (this.leave) { this.y -= dt * 260; if (this.y < -400) this.gone = true; return; }
    // occasional pot shots through the searchlight
    this.shootT -= dt;
    if (this.shootT <= 0 && dist(this.x, this.y, p.x, p.y) < 120) {
      this.shootT = 1.6;
      const a = angleTo(this.x, this.y, p.x, p.y) + rand(-0.25, 0.25);
      game.spawnBullet(this.x + Math.cos(a) * 30, this.y + Math.sin(a) * 30, a, 'cop');
      game.audio?.gunshot?.(0.4);
    }
  }
}
