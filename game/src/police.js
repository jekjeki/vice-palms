// ============================================================================
// VICE PALMS — police.js
// The VCPD: a 1-5 star heat system with cruiser pursuit (smart ramming at 2+,
// roadblocks at 3+, trigger-happy foot cops), sight-based decay, and BUSTED
// arrests with fees. Foot cops are simple armed chasers that share ped physics.
// ============================================================================

import { WANTED, TILE, CITY_W, CITY_H, HELI } from './config.js';
import { TAU, clamp, dist, angleTowards, resolveCircleRect, shadowBlob, losClear, damp } from './util.js';
import { Car, VEHICLES } from './cars.js';

const DIRV = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export class FootCop {
  constructor(game, x, y) {
    this.game = game;
    this.x = x; this.y = y;
    this.angle = 0;
    this.hp = WANTED.COP_HP;
    this.dead = false;
    this.deadT = 18;
    this.remove = false;
    this.shootCd = 1.2;
    this.step = 0;
    this.bustT = 0;
    this.skin = '#e8c090';
    this.kind = 'cop';
  }

  hurt(n, cause) {
    if (this.dead) return;
    this.hp -= n;
    if (this.hp <= 0) {
      this.dead = true;
      this.game.fx.bloodBurst(this.x, this.y, 10);
      this.game.onCopKilled(this);
    }
  }

  update(dt) {
    const g = this.game;
    if (this.dead) {
      this.deadT -= dt;
      if (this.deadT <= 0) this.remove = true;
      return;
    }
    const p = g.player;
    const d = dist(this.x, this.y, p.x, p.y);
    if (d > 70) { this.remove = true; return; }

    // Chase.
    const want = Math.atan2(p.y - this.y, p.x - this.x);
    this.angle = angleTowards(this.angle, want, 8 * dt);
    const sp = d > 2.0 ? 6.1 : 0;
    this.x += Math.cos(this.angle) * sp * dt;
    this.y += Math.sin(this.angle) * sp * dt;
    this.step += dt * 12;

    // Solids push-out.
    for (const rect of g.world.solidsNear(this.x, this.y, 1.4)) {
      const r = resolveCircleRect(this.x, this.y, 0.5, rect);
      if (r) { this.x += r.nx * r.depth; this.y += r.ny * r.depth; }
    }

    // Shooting: from 3 stars, or always if the player is armed & close.
    const stars = g.police.stars();
    this.shootCd -= dt;
    const pSpeed = p.inCar ? p.inCar.speed() : 0;
    if ((stars >= 3 || this.guard) && d < WANTED.SHOOT_RANGE && this.shootCd <= 0 && losClear(this.x, this.y, p.x, p.y, (x, y) => !!g.world.blockedAt(x, y))) {
      this.shootCd = WANTED.SHOOT_CD[stars] * (0.8 + Math.random() * 0.5);
      const a = Math.atan2(p.y - this.y + (Math.random() - 0.5) * 1.6, p.x - this.x + (Math.random() - 0.5) * 1.6);
      g.bullets.push({
        x: this.x + Math.cos(a) * 0.8, y: this.y + Math.sin(a) * 0.8,
        vx: Math.cos(a) * 80, vy: Math.sin(a) * 80,
        life: 0.8, fromPlayer: false, dmg: 9,
      });
      g.fx.muzzle(this.x + Math.cos(a) * 0.8, this.y + Math.sin(a) * 0.8);
      g.audio.shot(true);
    }

    // Arrest check (mission guards never arrest).
    const close = d < WANTED.BUST_RADIUS;
    const slow = pSpeed < WANTED.BUST_MAX_SPEED && (!p.inCar || p.inCar.speed() < WANTED.BUST_MAX_SPEED);
    if (!this.guard && close && slow && !p.dead && !g.bustImmune) {
      this.bustT += dt;
      if (this.bustT > WANTED.BUST_TIME) g.busted();
    } else {
      this.bustT = Math.max(0, this.bustT - dt * 2);
    }
  }

  draw(ctx, t) {
    if (this.dead) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      ctx.globalAlpha = clamp(this.deadT / 4, 0, 1);
      ctx.fillStyle = '#26324a';
      ctx.fillRect(-0.9, -0.42, 1.8, 0.84);
      ctx.fillStyle = '#e8c090';
      ctx.beginPath(); ctx.arc(1.0, 0, 0.3, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }
    shadowBlob(ctx, this.x + 0.25, this.y + 0.3, 0.55, 0.3);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.fillStyle = '#151a26';
    const ls = Math.sin(this.step) * 0.22;
    ctx.fillRect(-0.15, -0.34 + ls, 0.5, 0.22);
    ctx.fillRect(-0.15, 0.12 - ls, 0.5, 0.22);
    ctx.fillStyle = '#2c3a5e';
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.44, 0.36, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#d8dde8';
    ctx.fillRect(-0.05, -0.38, 0.3, 0.14);
    ctx.fillRect(-0.05, 0.24, 0.3, 0.14);
    // Pistol
    ctx.fillStyle = '#15161c';
    ctx.fillRect(0.5, -0.08, 0.44, 0.16);
    // Cap
    ctx.fillStyle = '#e8c090';
    ctx.beginPath(); ctx.arc(0.06, 0, 0.28, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1a2030';
    ctx.beginPath(); ctx.arc(0.0, 0, 0.29, Math.PI * 0.6, Math.PI * 1.4); ctx.fill();
    ctx.restore();
  }
}

export class Police {
  constructor(game) {
    this.game = game;
    this.heat = 0;
    this.cruisers = [];      // Car refs living in game.cars
    this.foot = [];          // FootCop[]
    this.roadblocks = [];    // {x,y,cars:[Car]}
    this.spawnCd = 0;
    this.blockCd = 0;
    this.seenTimer = 0;      // seconds since last seen
    this.strobeT = 0;
    this.chatCd = 6;
    this.heli = { active: false, x: 0, y: 0, sx: 0, sy: 0, onStation: 0 };
  }

  stars() {
    return Math.min(5, Math.floor(this.heat));
  }

  addHeat(n) {
    const before = this.stars();
    this.heat = clamp(this.heat + n, 0, 5);
    this.seenTimer = 0;
    if (this.stars() > before) this.game.onStarUp(this.stars());
  }

  clear() {
    this.heat = 0;
    this.seenTimer = 0;
    for (const c of this.cruisers) { if (!c.remove) { c.sirenOn = false; c.aiKind = 'civ'; c.ai = null; c.driver = 'ai'; } }
    this.cruisers.length = 0;
    for (const f of this.foot) f.remove = true;
    this.foot.length = 0;
    this.roadblocks.length = 0;
    this.game.audio.setSiren(false);
  }

  copEjected(car) {
    // Called when the player steals a driven cruiser: its cop is now on foot.
    const f = new FootCop(this.game, car.x, car.y);
    this.foot.push(f);
    this.addHeat(1.2);
  }

  // Any cop able to see the player?
  anySeen() {
    const g = this.game;
    const p = g.player;
    const blocked = (x, y) => !!g.world.blockedAt(x, y);
    for (const c of this.cruisers) {
      if (c.remove || c.wrecked) continue;
      const d = dist(c.x, c.y, p.x, p.y);
      if (d < WANTED.ACTIVE_DIST && losClear(c.x, c.y, p.x, p.y, blocked)) return true;
    }
    for (const f of this.foot) {
      if (f.remove || f.dead) continue;
      const d = dist(f.x, f.y, p.x, p.y);
      if (d < 46 && losClear(f.x, f.y, p.x, p.y, blocked)) return true;
    }
    return false;
  }

  spawnCruiser(x, y, angle, siren = true) {
    const g = this.game;
    const car = new Car(g, 'police', x, y, angle);
    car.driver = 'cop';
    car.aiKind = 'cop';
    car.sirenOn = siren;
    car.ai = { mode: 'pursuit' };
    g.cars.push(car);
    this.cruisers.push(car);
    return car;
  }

  trySpawnCruiser() {
    const g = this.game;
    const p = g.player.inCar || g.player;
    const pt = g.world.randomLanePoint(g.rngCops, p.x, p.y, WANTED.SPAWN_DIST, WANTED.SPAWN_DIST + 50);
    if (!pt) return;
    const angle = pt.dir * (Math.PI / 2);
    this.spawnCruiser(pt.x, pt.y, angle);
  }

  // Park 2-3 cruisers across the road ahead of the player.
  spawnRoadblock() {
    const g = this.game;
    const p = g.player.inCar || g.player;
    const speed = Math.max(1, Math.hypot(g.player.inCar ? g.player.inCar.vx : 0, g.player.inCar ? g.player.inCar.vy : 0));
    const vx = g.player.inCar ? g.player.inCar.vx / speed : Math.cos(p.angle);
    const vy = g.player.inCar ? g.player.inCar.vy / speed : Math.sin(p.angle);
    const ax = p.x + vx * 88, ay = p.y + vy * 88;
    // Snap to nearest road line.
    const rx = Math.round(ax / TILE) * TILE;
    const ry = Math.round(ay / TILE) * TILE;
    let bx = null, by = null, vertical = false;
    if (Math.abs(ax - rx) < Math.abs(ay - ry) && Math.abs(ax - rx) < 14) { bx = rx; by = ay; vertical = true; }
    else if (Math.abs(ay - ry) < 14) { by = ry; bx = ax; vertical = false; }
    else return;
    if (bx < -8 || bx > CITY_W + 8 || by < -8 || by > CITY_H + 8) return;

    const perp = vertical ? [0, 1] : [1, 0];
    const cars = [];
    const n = this.stars() >= 4 ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const off = (k - (n - 1) / 2) * 5.4;
      const cx = bx + perp[0] * off, cy = by + perp[1] * off;
      if (g.world.blockedAt(cx, cy)) continue;
      const face = Math.atan2(p.y - cy, p.x - cx);
      const car = this.spawnCruiser(cx, cy, face, true);
      car.ai = { mode: 'roadblock' };
      car.throttle = 0; car.brake = 1;
      cars.push(car);
      // Cops step out at 4+.
      if (this.stars() >= 4) {
        const f = new FootCop(g, cx + perp[0] * 2.4, cy + perp[1] * 2.4);
        this.foot.push(f);
      }
    }
    if (cars.length) this.roadblocks.push({ x: bx, y: by, cars, life: 30 });
    g.audio.sirenBlip();
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const stars = this.stars();
    const pSpeed = p.inCar ? p.inCar.speed() : 0;

    // --- spawning ---------------------------------------------------------
    const target = WANTED.CRUISE_TARGET[stars];
    const alive = this.cruisers.filter(c => !c.remove && !c.wrecked).length;
    this.spawnCd -= dt;
    if (stars > 0 && alive < target && this.spawnCd <= 0) {
      this.spawnCd = WANTED.SPAWN_CD;
      this.trySpawnCruiser();
    }

    // Roadblocks.
    this.blockCd -= dt;
    if (stars >= WANTED.ROADBLOCK_STARS && this.blockCd <= 0 && pSpeed > 8) {
      this.blockCd = WANTED.ROADBLOCK_CD;
      this.spawnRoadblock();
    }

    // --- cruiser AI ---------------------------------------------------------
    this.strobeT += dt;
    for (const c of this.cruisers) {
      if (c.remove || c.wrecked || !c.ai || c.ai.mode !== 'pursuit') continue;
      const d = dist(c.x, c.y, p.x, p.y);
      if (d > WANTED.ACTIVE_DIST * 1.6) { c.remove = true; continue; }
      c.sirenOn = true;
      const lead = p.inCar ? 0.5 : 0.1;
      const tx = p.x + (p.inCar ? p.inCar.vx : 0) * lead;
      const ty = p.y + (p.inCar ? p.inCar.vy : 0) * lead;
      const desired = Math.atan2(ty - c.y, tx - c.x);
      const diff = angleDiff_(c.angle, desired);
      c.steer = clamp(diff * 2.6, -1, 1);
      const vf = c.forwardSpeed();
      if (stars >= WANTED.RAM_BRAKE) {
        // Ram profile: never brake for the player.
        c.throttle = Math.abs(diff) < 1.2 ? 1 : 0.4;
        c.brake = 0;
      } else {
        if (d < 8 && !p.inCar) {
          // Don't run the player over at 1 star: pull up and deploy cops.
          c.throttle = 0; c.brake = 1;
        } else {
          c.throttle = clamp((28 - vf) * 0.3, 0, 1);
          c.brake = 0;
        }
      }
      // Deploy foot cops once near a player on foot.
      if (!p.inCar && d < WANTED.FOOT_CHASE && c.speed() < 6 && !c.ai.deployed) {
        c.ai.deployed = true;
        for (let k = 0; k < Math.min(stars, 3); k++) {
          const f = new FootCop(g, c.x + (Math.random() - 0.5) * 3, c.y + (Math.random() - 0.5) * 3);
          this.foot.push(f);
        }
      }
    }

    // --- foot cops -----------------------------------------------------------
    for (const f of this.foot) f.update(dt);

    // --- sight & decay --------------------------------------------------------
    if (stars > 0) {
      if (this.anySeen()) this.seenTimer = 0;
      else this.seenTimer += dt;
      if (this.seenTimer > WANTED.DECAY_SEEN) {
        this.heat = Math.max(0, this.heat - WANTED.DECAY_RATE * dt);
        if (this.stars() === 0) this.clear();
      }
      this.game.audio.setSiren(true);
      // Dispatch chatter, throttled.
      this.chatCd -= dt;
      if (this.chatCd <= 0) {
        this.chatCd = 11;
        const streets = this.game.world.streetAt(this.game.player.x, this.game.player.y);
        const lines = [
          'DISPATCH: all units, suspect mobile near ' + streets + '.',
          'DISPATCH: keep eyes on that vehicle, ' + streets + '.',
          'DISPATCH: suspect sighted ' + streets + '. Converge.',
        ];
        this.game.missions.sub(lines[Math.floor(Math.random() * lines.length)], 2.6, '');
      }
    } else {
      this.game.audio.setSiren(false);
    }

    // --- air support ------------------------------------------------------------
    this.updateHeli(dt, stars);

    // Clean arrays.
    this.cruisers = this.cruisers.filter(c => !c.remove);
    this.foot = this.foot.filter(f => !f.remove);
    for (const rb of this.roadblocks) rb.life -= dt;
    this.roadblocks = this.roadblocks.filter(rb => rb.life > 0 && rb.cars.some(c => !c.remove && !c.wrecked));
  }

  updateHeli(dt, stars) {
    const g = this.game;
    const h = this.heli;
    const p = g.player;
    if (stars >= HELI.STARS && !h.active) {
      h.active = true;
      h.x = p.x - 90; h.y = p.y - 60;
      g.hud.toast('AIR SUPPORT INBOUND');
      g.audio.rotor(true);
    } else if (stars < HELI.STARS && h.active) {
      h.active = false;
      g.audio.rotor(false);
    }
    if (!h.active) return;
    // Orbit lazily above the player, bobbing.
    const t = g.realT;
    const ox = Math.cos(t * 0.7) * 16;
    const oy = Math.sin(t * 0.5) * 12;
    h.x = damp(h.x, p.x + ox, 1.6, dt);
    h.y = damp(h.y, p.y + oy, 1.6, dt);
    // Searchlight wanders near the player; snaps close when on foot.
    h.sx = damp(h.sx, p.x + Math.sin(t * 1.3) * HELI.OFFSET_WOBBLE, 3, dt);
    h.sy = damp(h.sy, p.y + Math.cos(t * 1.1) * HELI.OFFSET_WOBBLE, 3, dt);
  }

  drawFoot(ctx, t) {
    for (const f of this.foot) f.draw(ctx, t);
  }
}

function angleDiff_(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
