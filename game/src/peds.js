// peds.js — the people of Vice Palms. They stroll the sidewalks, scatter
// from gunfire, and become wanted-level fodder when things go wrong.

import { CFG } from './config.js';
import { RNG, mixSeeds } from './rng.js';
import { clamp, dist, angMove, TAU } from './util.js';
import { uid } from './util.js';

const SKINS = ['#c99b72', '#8a5a3a', '#e8c39c', '#6b4226', '#d9ab84'];
const SHIRTS = ['#c94f7c', '#4fa3c9', '#c9b44f', '#5fc98a', '#9a6fd9', '#d97f4f', '#c94f4f', '#e0e4ea'];
const PANTS = ['#2b3040', '#3a3226', '#42424e', '#26323a'];

export class Ped {
  constructor(x, y, rng, game) {
    this.id = uid();
    this.game = game || null;
    this.x = x;
    this.y = y;
    this.ang = rng.angle();
    this.skin = rng.pick(SKINS);
    this.shirt = rng.pick(SHIRTS);
    this.pants = rng.pick(PANTS);
    // district flavour: beach walkers get swimwear, joggers cross downtown
    const ty = y / CFG.T;
    if (ty >= CFG.BEACH.y0 - 2) {
      this.shirt = this.skin;          // shirtless on the sand
      this.pants = rng.pick(['#e8e2d4', '#37f5ff', '#ff4fd8', '#ffd23d']);
      this.style = 'beach';
    } else if (rng.chance(0.14)) {
      this.shirt = '#e85454';
      this.pants = '#20242e';
      this.style = 'jogger';
      this.speed = CFG.PED_SPEED * 1.7;
    } else if (rng.chance(0.1)) {
      this.pants = '#1d2740';
      this.style = 'suit';
    } else {
      this.style = 'town';
    }
    this.hp = CFG.PED_HP;
    this.state = 'walk';          // walk | flee | dead
    this.speed = this.speed || CFG.PED_SPEED * rng.range(0.8, 1.2);
    this.fleeT = 0;
    this.fleeAng = 0;
    this.target = null;
    this.step = rng.range(0, 10);
    this.deadT = 0;
    this.wanderT = 0;
    this.screamT = 0;
  }

  update(dt, game) {
    if (this.state === 'dead') {
      this.deadT += dt;
      return;
    }
    const world = game.world;

    if (this.state === 'flee') {
      this.fleeT -= dt;
      const spd = CFG.PED_FLEE_SPEED;
      this.move(this.fleeAng, spd, dt, world);
      // re-panic from nearby danger
      if (this.fleeT <= 0) this.state = 'walk';
      // dead ends: turn away from walls
      const aheadX = this.x + Math.cos(this.fleeAng) * 26;
      const aheadY = this.y + Math.sin(this.fleeAng) * 26;
      const code = world.codeAt(aheadX, aheadY);
      if (code === 2 || code === 3) {
        this.fleeAng += 1.9;
        this.move(this.fleeAng, spd * 0.4, dt, world);
      }
      return;
    }

    // walking: pick a nearby sidewalk waypoint and drift toward it
    this.wanderT -= dt;
    if (this.wanderT <= 0 || !this.target) {
      this.wanderT = 2 + Math.random() * 4;
      this.target = this.pickWaypoint(world);
    }
    if (this.target) {
      const d = dist(this.x, this.y, this.target.x, this.target.y);
      if (d < 8) {
        this.target = null;
      } else {
        const want = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        this.ang = angMove(this.ang, want, 3 * dt);
        this.move(this.ang, this.speed, dt, world);
      }
    }
    this.step += dt * 6;
  }

  pickWaypoint(world) {
    // aim for a road-adjacent tile within ~5 tiles: peds hug the streets
    const rng = Math.random;
    for (let i = 0; i < 10; i++) {
      const ang = rng() * TAU;
      const d = 60 + rng() * 170;
      const tx = Math.floor((this.x + Math.cos(ang) * d) / CFG.T);
      const ty = Math.floor((this.y + Math.sin(ang) * d) / CFG.T);
      const code = world.at(tx, ty);
      if (code === 0 || code === 7 || code === 8) {
        return { x: (tx + 0.5) * CFG.T, y: (ty + 0.5) * CFG.T };
      }
    }
    return null;
  }

  move(ang, spd, dt, world) {
    const nx = this.x + Math.cos(ang) * spd * dt;
    const ny = this.y + Math.sin(ang) * spd * dt;
    const p = world.collideCircle(this.x, this.y, nx, ny, 7);
    this.x = p.x;
    this.y = p.y;
  }

  panic(fx, fy) {
    if (this.state === 'dead') return;
    this.state = 'flee';
    this.fleeT = 4 + Math.random() * 3;
    this.fleeAng = Math.atan2(this.y - fy, this.x - fx) + (Math.random() - 0.5) * 0.7;
    this.screamT = 0.5;
    if (this.game && this.game.barks && Math.random() < 0.5) {
      this.game.barks.onPanic(this);
    }
  }

  damage(n, game, cause) {
    if (this.state === 'dead') return;
    this.hp -= n;
    if (this.hp <= 0) {
      this.state = 'dead';
      this.deadT = 0;
      if (cause === 'gun') game.police.crime(CFG.HEAT_PED, this.x, this.y);
      else if (cause === 'punch') game.police.crime(CFG.HEAT_PED, this.x, this.y);
    } else {
      this.panic(this.x + (Math.random() - 0.5) * 10, this.y + (Math.random() - 0.5) * 10);
    }
  }
}

export class Peds {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.rng = new RNG(mixSeeds(game.seed, 0x9EDE));
    this.spawnTimer = 0;
  }

  /** Fill the initial population around the player's start. */
  populate(cx, cy) {
    for (let i = 0; i < CFG.PED_COUNT; i++) {
      const spot = this.findSpot(cx, cy, 200, 900);
      if (spot) this.list.push(new Ped(spot.x, spot.y, this.rng, this.game));
    }
  }

  findSpot(cx, cy, rMin, rMax) {
    for (let i = 0; i < 24; i++) {
      const ang = this.rng.angle();
      const d = this.rng.range(rMin, rMax);
      const x = clamp(cx + Math.cos(ang) * d, 40, CFG.W - 40);
      const y = clamp(cy + Math.sin(ang) * d, 40, CFG.H - 40);
      const code = this.game.world.codeAt(x, y);
      if (code === 0 || code === 7 || code === 8 || code === 4) return { x, y };
    }
    return null;
  }

  update(dt) {
    const game = this.game;
    const px = game.viewX(), py = game.viewY();
    // population control
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.5;
      let alive = 0;
      for (const p of this.list) if (p.state !== 'dead') alive++;
      if (alive < CFG.PED_COUNT) {
        const spot = this.findSpot(px, py, 420, 760);
        if (spot) this.list.push(new Ped(spot.x, spot.y, this.rng, this.game));
      }
    }
    // cull far-away corpses and long-gone walkers
    if (this.list.length > CFG.PED_COUNT + 22) {
      this.list = this.list.filter((p) => dist(p.x, p.y, px, py) < 1400);
    } else {
      this.list = this.list.filter((p) => p.state !== 'dead' || p.deadT < 24);
      this.list = this.list.filter((p) => dist(p.x, p.y, px, py) < 1700);
    }

    for (const p of this.list) {
      p.update(dt, game);
      // being run over
      if (p.state !== 'dead') {
        for (const c of game.cars) {
          if (c.dead || c.exploded) continue;
          const d = dist(c.x, c.y, p.x, p.y);
          if (d < CFG.CAR_RADIUS + 5 && Math.abs(c.speed) > 26) {
            c.hitPed(p, game);
            if (c.driver === 'player') {
              game.hud.flashWanted();
              if (game.stats) game.stats.bump('pedsBumped');
              if (game.barks) game.barks.onNearMiss(p);
            }
            break;
          }
        }
      }
      // police contact
      if (game.police.touchPed(p)) { /* handled inside */ }
    }
  }

  /** Gunfire scatters everyone nearby. */
  gunfire(x, y, radius) {
    for (const p of this.list) {
      if (p.state === 'dead') continue;
      if (dist(p.x, p.y, x, y) < radius) p.panic(x, y);
    }
  }

  explosionAt(x, y) {
    this.gunfire(x, y, 320);
    for (const p of this.list) {
      if (p.state === 'dead') continue;
      const d = dist(p.x, p.y, x, y);
      if (d < CFG.BOOM_RADIUS) {
        p.hp -= CFG.BOOM_DMG_PED;
        if (p.hp <= 0) {
          p.state = 'dead';
          game_policeBoom(this.game, x, y);
        } else p.panic(x, y);
      }
    }
  }

  /** Nearest living ped within r of a point. */
  near(x, y, r) {
    let best = null, bd = r * r;
    for (const p of this.list) {
      if (p.state === 'dead') continue;
      const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
}

function game_policeBoom(game, x, y) {
  if (game.police) game.police.crime(CFG.HEAT_BOOM * 0.4, x, y);
}
