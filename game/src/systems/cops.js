// The police. Cruisers pursue from one star, flank and shoot from the window at three, try
// pit-manoeuvre rams at four and up, roadblocks lock the street from three stars on, and foot
// officers chase on the sidewalks. A cornered player on foot gets BUSTED.

import { BLOCK_HOLD, GRID, PITCH, LANE, COP_RANGE } from '../config.js';
import { Car } from '../entities/car.js';
import { Person } from '../entities/person.js';
import { clamp, dist, dist2, turnDelta } from '../util.js';
import { rand, randInt } from '../rng.js';
import { laneAt } from './traffic.js';

export class Cops {
  constructor(game) {
    this.game = game;
    this.cruisers = [];
    this.foot = [];
    this.spawnT = 0;
    this.blockT = 0;
    this.arrestT = 0;
    this.scratch = [];
  }

  update(dt, stars, player) {
    const game = this.game;
    this.spawnT -= dt;
    this.blockT -= dt;

    // Cruisers on duty scale with the wanted level: one star is a nervous city, five is a manhunt.
    const quota = stars === 0 ? 0 : Math.min(1 + stars, 7);
    if (this.cruisers.length < quota && this.spawnT <= 0) {
      const c = this.birthCruiser(player);
      if (c) { this.cruisers.push(c); game.cars.push(c); this.spawnT = Math.max(0.6, 1.4 - stars * 0.15); }
    }
    for (let i = this.cruisers.length - 1; i >= 0; i--) {
      const c = this.cruisers[i];
      if (stars === 0 || dist2(c.x, c.y, player.x, player.y) > 4400 * 4400 || (c.wasted && (c.wreckAge = (c.wreckAge ?? 0) - dt) < -12)) {
        const at = game.cars.indexOf(c);
        if (at >= 0) game.cars.splice(at, 1);
        this.cruisers.splice(i, 1);
        continue;
      }
      // Roadblock crews stay posted until the player closes in; then they join the chase.
      if (c.roadblock) {
        if (dist2(c.x, c.y, player.x, player.y) < BLOCK_HOLD * BLOCK_HOLD) c.roadblock = false;
        else { c.update(dt, game); continue; }
      }
      this.pursue(c, dt, player, stars);
    }
    for (let i = this.foot.length - 1; i >= 0; i--) {
      const f = this.foot[i];
      if (stars === 0 || f.wreck || dist2(f.x, f.y, player.x, player.y) > 3800 * 3800) {
        this.foot.splice(i, 1);
        const at = game.people.indexOf(f);
        if (at >= 0) game.people.splice(at, 1);
        continue;
      }
      this.walkCop(f, dt, player, stars);
    }
    if (stars >= 3 && this.blockT <= 0) {
      this.roadblock(player);
      this.blockT = 9;
    }
  }

  /** Cruisers arrive biased down the road the player is driving: the chase meets you. */
  birthCruiser(player) {
    const mvx = player.vx ?? 0, mvy = player.vy ?? 0;
    const mv = Math.hypot(mvx, mvy);
    for (let tries = 0; tries < 10; tries++) {
      const vertical = mv < 40 ? rand() < 0.5 : Math.abs(mvy) >= Math.abs(mvx);
      const line = randInt(GRID + 1);
      const center = line * PITCH;
      const dir = rand() < 0.5 ? 1 : -1;
      const band = 950 + rand() * 750;
      // Moving player: place the ring ahead along travel; idle: all around.
      const ahead = mv > 40 ? band * 0.75 * Math.sign(vertical ? mvy : mvx) : band * (rand() < 0.5 ? 1 : -1);
      const along = (vertical ? player.y : player.x) + ahead;
      if (along < 260 || along > GRID * PITCH - 260) continue;
      const x = vertical ? laneAt('y', center, dir) : along;
      const y = vertical ? along : laneAt('x', center, dir);
      const c = new Car(-1, x, y, vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI));
      c.role = 'cop';
      c.siren = true;
      return c;
    }
    return null;
  }

  /** Chase with a lead aim and, from four stars, a flank so pairs close from both sides. */
  pursue(c, dt, player, stars) {
    const game = this.game;
    if (c.wreck || c.wasted) return;
    c.flank = c.flank ?? ((this.cruisers.indexOf(c) % 2) * 2 - 1);
    const lead = player.car ? 0.5 : 0.1;
    const tx = player.x + (player.vx ?? 0) * lead;
    const ty = player.y + (player.vy ?? 0) * lead;
    // Flank offset perpendicular to the player's heading: partner cars curve wide.
    let aim = Math.atan2(ty - c.y, tx - c.x);
    let range = dist(c.x, c.y, player.x, player.y);
    if (stars >= 3 && range < 700) {
      const ph = player.car ? player.car.ang : (player.heading ?? 0);
      aim += turnDelta(aim, ph + c.flank * Math.PI / 2) * 0.22;
    }
    c.steer = clamp(turnDelta(c.ang, aim) * 1.6, -1, 1);
    c.gas = range > 120 ? 1 : 0.15;
    c.brake = range < 90 && Math.abs(c.fwd) > 120 ? 1 : 0;
    c.slide = Math.abs(turnDelta(c.ang, aim)) > 1.9 && Math.abs(c.fwd) > 200;
    // Pit manoeuvre: at 4+ stars a close cruiser steers hard into the player's quarter.
    if (stars >= 4 && range < 110) c.steer = clamp(c.steer + c.flank * 0.9, -1, 1);
    c.drive(dt, game);
    c.update(dt, game);
    // Window fire from three stars on, when close and roughly nose-in.
    if (stars >= 3 && range < COP_RANGE && Math.abs(turnDelta(c.ang, aim)) < 0.5 && rand() < dt * 0.9) {
      game.bullets.fire(c.x + Math.cos(c.ang) * 32, c.y + Math.sin(c.ang) * 32, aim, 820, false, 7);
      game.fx.muzzle(c.x + Math.cos(c.ang) * 36, c.y + Math.sin(c.ang) * 36, c.ang);
      game.audio.shot(game.proximity(c.x, c.y) * 0.7);
    }
  }

  /** Two cruisers parked nose-out across the street ahead, plus foot cover. */
  roadblock(player) {
    const game = this.game;
    const heading = player.car ? player.car.ang : (player.heading ?? 0);
    const rx = player.x + Math.cos(heading) * 720;
    const ry = player.y + Math.sin(heading) * 720;
    const snapX = Math.round(rx / PITCH) * PITCH;
    const snapY = Math.round(ry / PITCH) * PITCH;
    const vertical = Math.abs(rx - snapX) < Math.abs(ry - snapY);
    const bx = vertical ? snapX : clamp(Math.round(rx / PITCH) * PITCH, 0, GRID * PITCH);
    const by = vertical ? clamp(Math.round(ry / PITCH) * PITCH, 0, GRID * PITCH) : snapY;
    if (dist2(bx, by, player.x, player.y) < 520 * 520) return;
    for (let k = -1; k <= 1; k += 2) {
      const c = new Car(-1, vertical ? bx + k * 24 : bx, vertical ? by : by + k * 24, vertical ? 0 : Math.PI / 2);
      c.role = 'cop';
      c.siren = true;
      c.roadblock = true;   // posted: holds the lane until the player closes in
      this.cruisers.push(c);
      game.cars.push(c);
      this.birthFoot(vertical ? bx + k * 42 : bx + 55, vertical ? by + 55 : by + k * 42);
    }
  }

  birthFoot(x, y) {
    const game = this.game;
    const cop = new Person(x, y, (rand() * 1000) | 0);
    cop.isCop = true;
    cop.shirt = '#2e4a7a';
    cop.hp = 45;
    cop.speed = 108;
    cop.shootT = 1;
    this.foot.push(cop);
    game.people.push(cop);
    return cop;
  }

  /** A cruiser burned out: the officer bails and keeps chasing on foot. */
  onCruiserDown(c) {
    if (this.game.wanted.stars > 0) this.birthFoot(c.x + 24, c.y + 18);
  }

  walkCop(f, dt, player, stars) {
    const game = this.game;
    if (f.mode === 'down') { f.downT -= dt; return; }
    const d = dist(f.x, f.y, player.x, player.y);
    f.ang = Math.atan2(player.y - f.y, player.x - f.x);
    if (d > 250) {
      f.x += Math.cos(f.ang) * f.speed * dt;
      f.y += Math.sin(f.ang) * f.speed * dt;
      f.phase += dt * 7;
    }
    if (stars >= 3 && d < COP_RANGE) {
      f.shootT -= dt;
      if (f.shootT <= 0) {
        f.shootT = 0.9 + rand() * 0.5;
        game.bullets.fire(f.x, f.y, f.ang + (rand() - 0.5) * 0.15, 800, false, 6);
        game.fx.muzzle(f.x + Math.cos(f.ang) * 12, f.y + Math.sin(f.ang) * 12, f.ang);
        game.audio.shot(game.proximity(f.x, f.y) * 0.6);
      }
    }
  }

  /** BUSTED: on foot, wanted, an officer close, and the player stopped long enough. */
  cornered(dt, player, stars) {
    if (player.car || stars === 0) { this.arrestT = 0; return false; }
    let near = false;
    for (const c of this.cruisers) {
      if (!c.wreck && dist2(c.x, c.y, player.x, player.y) < 115 * 115) { near = true; break; }
    }
    if (!near) for (const f of this.foot) {
      if (!f.wreck && f.mode !== 'down' && dist2(f.x, f.y, player.x, player.y) < 92 * 92) { near = true; break; }
    }
    if (near) {
      const moving = Math.hypot(player.vx ?? 0, player.vy ?? 0) > 60;
      this.arrestT = moving ? Math.max(0, this.arrestT - dt * 2) : this.arrestT + dt;
      return this.arrestT > 1.6;
    }
    this.arrestT = Math.max(0, this.arrestT - dt);
    return false;
  }
}
