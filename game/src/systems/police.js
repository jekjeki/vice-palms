// Police: cruisers that chase and ram from one star, roadblocks and foot cops that shoot at
// three stars, and the BUSTED check when a cop corners the player on foot.

import { BLOCKS, PITCH, ROAD_W, LANE, COP_SHOOT_RANGE } from '../config.js';
import { Vehicle } from '../entities/vehicle.js';
import { clamp, dist, dist2, angDiff } from '../util.js';

export class Police {
  constructor(game) {
    this.game = game;
    this.cars = [];
    this.footCops = [];
    this.blockT = 0;      // roadblock cooldown
    this.spawnT = 0;
  }

  update(dt, wanted, player) {
    const game = this.game;
    this.spawnT -= dt;
    this.blockT -= dt;

    // Population scales with the wanted level.
    const wantCars = wanted === 0 ? 0 : Math.min(2 + wanted, 7);
    if (this.cars.length < wantCars && this.spawnT <= 0) {
      const c = this.spawnCar(player);
      if (c) { this.cars.push(c); game.vehicles.push(c); this.spawnT = 1.1; }
    }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      if (wanted === 0 || dist2(c.x, c.y, player.x, player.y) > 4200 * 4200 || (c.exploded && (c.wreckT = (c.wreckT ?? 0) - dt) < -12)) {
        game.vehicles.splice(game.vehicles.indexOf(c), 1);
        this.cars.splice(i, 1);
        continue;
      }
      this.chase(c, dt, player, wanted);
    }
    for (let i = this.footCops.length - 1; i >= 0; i--) {
      const f = this.footCops[i];
      if (wanted === 0 || f.dead || dist2(f.x, f.y, player.x, player.y) > 3600 * 3600) {
        this.footCops.splice(i, 1);
        game.peds.splice(game.peds.indexOf(f), 1);
        continue;
      }
      this.footCop(f, dt, player, wanted);
    }
    if (wanted >= 3 && this.blockT <= 0) {
      this.spawnRoadblock(player, wanted);
      this.blockT = 9;
    }
  }

  spawnCar(player) {
    const game = this.game;
    for (let a = 0; a < 10; a++) {
      const vertical = Math.random() < 0.5;
      const line = Math.floor(Math.random() * (BLOCKS + 1));
      const center = line * PITCH;
      const dir = Math.random() < 0.5 ? 1 : -1;
      const along = (vertical ? player.y : player.x) + (900 + Math.random() * 700) * (Math.random() < 0.5 ? 1 : -1);
      if (along < 250 || along > BLOCKS * PITCH - 250) continue;
      const x = vertical ? TrafficLane('y', center, dir) : along;
      const y = vertical ? along : TrafficLane('x', center, dir);
      const c = new Vehicle(-1, x, y, vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI));
      c.role = 'cop';
      c.siren = true;
      c.driverName = 'Officer Vance';
      return c;
    }
    return null;
  }

  chase(c, dt, player, wanted) {
    const game = this.game;
    if (c.dead || c.exploded) return;
    // Aim at a point slightly ahead of the player (a lead that makes rams happen).
    const lead = player.inCar ? 0.45 : 0.1;
    const tx = player.x + (player.vx ?? 0) * lead;
    const ty = player.y + (player.vy ?? 0) * lead;
    const to = Math.atan2(ty - c.y, tx - c.x);
    c.steer = clamp(angDiff(c.ang, to) * 1.6, -1, 1);
    const far = dist(c.x, c.y, player.x, player.y);
    c.throttle = far > 120 ? 1 : 0.15;
    c.brake = far < 90 && Math.abs(c.speed) > 120 ? 1 : 0;
    c.handbrake = Math.abs(angDiff(c.ang, to)) > 1.9 && c.speed > 200;
    c.drive(dt, game);
    c.update(dt, game);
    // Shooting from the window at 3+ stars when close and roughly lined up.
    if (wanted >= 3 && far < COP_SHOOT_RANGE && Math.abs(angDiff(c.ang, to)) < 0.5 && Math.random() < dt * 0.8) {
      game.bullets.fire(c.x + Math.cos(c.ang) * 30, c.y + Math.sin(c.ang) * 30, to, 820, false, 7);
      game.fx.muzzle(c.x + Math.cos(c.ang) * 34, c.y + Math.sin(c.ang) * 34, c.ang);
      game.audio.shot(game.proximity(c.x, c.y) * 0.7);
    }
  }

  spawnRoadblock(player, wanted) {
    const game = this.game;
    // Park two cruisers nose-out across the road the player is heading toward.
    const heading = player.inCar ? player.inCar.ang : (player.heading ?? 0);
    const aheadDist = 700;
    const rx = player.x + Math.cos(heading) * aheadDist;
    const ry = player.y + Math.sin(heading) * aheadDist;
    // Snap to the nearest road centre line.
    const snapX = Math.round(rx / PITCH) * PITCH;
    const snapY = Math.round(ry / PITCH) * PITCH;
    const onVertical = Math.abs(rx - snapX) < Math.abs(ry - snapY);
    const bx = onVertical ? snapX : clamp(Math.round(rx / PITCH) * PITCH, 0, BLOCKS * PITCH);
    const by = onVertical ? clamp(Math.round(ry / PITCH) * PITCH, 0, BLOCKS * PITCH) : snapY;
    if (dist2(bx, by, player.x, player.y) < 500 * 500) return;
    for (let k = -1; k <= 1; k += 2) {
      const c = new Vehicle(-1, onVertical ? bx + k * 24 : bx, onVertical ? by : by + k * 24, onVertical ? Math.PI / 2 : 0);
      c.role = 'cop';
      c.siren = true;
      c.ang = onVertical ? 0 : Math.PI / 2;
      this.cars.push(c);
      game.vehicles.push(c);
      this.spawnFootCop(onVertical ? bx + k * 40 : bx + 55, onVertical ? by + 55 : by + k * 40);
    }
  }

  spawnFootCop(x, y) {
    const game = this.game;
    const cop = {
      x, y, isCop: true, shirt: '#2e4a7a', skin: '#c99a72',
      speed: 105, state: 'chase', phase: 0, hp: 40,
      shootT: 1, dead: false, downT: 0, ang: 0,
    };
    this.footCops.push(cop);
    game.peds.push(cop);
    return cop;
  }

  footCop(f, dt, player, wanted) {
    const game = this.game;
    if (f.dead) { f.downT -= dt; return; }
    const d = dist(f.x, f.y, player.x, player.y);
    f.ang = Math.atan2(player.y - f.y, player.x - f.x);
    if (d > 260) {
      f.x += Math.cos(f.ang) * f.speed * dt;
      f.y += Math.sin(f.ang) * f.speed * dt;
      f.phase += dt * 7;
    }
    if (wanted >= 3 && d < COP_SHOOT_RANGE) {
      f.shootT -= dt;
      if (f.shootT <= 0) {
        f.shootT = 0.9 + Math.random() * 0.5;
        const spread = (Math.random() - 0.5) * 0.14;
        game.bullets.fire(f.x, f.y, f.ang + spread, 800, false, 6);
        game.fx.muzzle(f.x + Math.cos(f.ang) * 12, f.y + Math.sin(f.ang) * 12, f.ang);
        game.audio.shot(game.proximity(f.x, f.y) * 0.6);
      }
    }
  }

  /** BUSTED: on foot, wanted, a cop within reach, player slowing. Called from game.update. */
  bustedCheck(dt, player, wanted) {
    if (player.inCar || wanted === 0) { this.arrestT = 0; return false; }
    let near = false;
    for (const c of this.cars) {
      if (!c.dead && dist2(c.x, c.y, player.x, player.y) < 110 * 110) { near = true; break; }
    }
    if (!near) for (const f of this.footCops) {
      if (!f.dead && dist2(f.x, f.y, player.x, player.y) < 90 * 90) { near = true; break; }
    }
    if (near) {
      const moving = Math.hypot(player.vx ?? 0, player.vy ?? 0) > 60;
      this.arrestT = moving ? Math.max(0, (this.arrestT ?? 0) - dt * 2) : (this.arrestT ?? 0) + dt;
      return this.arrestT > 1.6;
    }
    this.arrestT = Math.max(0, (this.arrestT ?? 0) - dt);
    return false;
  }
}

function TrafficLane(axis, center, dir) {
  return axis === 'x' ? center - dir * LANE : center + dir * LANE;
}
