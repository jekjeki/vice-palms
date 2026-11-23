// ============================================================================
// VICE PALMS — peds.js
// Night-time pedestrians: sidewalk wandering, panic flight from gunfire,
// explosions and wrong-way cars; they can be run over or shot, and the
// consequences (blood, witnesses, heat) ripple through the game.
// ============================================================================

import { PEDS, SKINS, SHIRTS, BEACH_ROW, CITY_W, CITY_H, TILE } from './config.js';
import { TAU, clamp, angleTowards, resolveCircleRect, shadowBlob } from './util.js';
import { RNG } from './rng.js';

const BARKS = [
  '"Hey, watch it!"', '"I am walking here!"', '"Whoa!"', '"Nice driving, pal."',
  '"Watch the shoes!"', '"It is midnide already?"', '"Tourists…"', '"Neon everywhere."',
];

export class Ped {
  constructor(game, x, y) {
    this.game = game;
    this.x = x; this.y = y;
    this.angle = game.rngPeds.angle();
    this.state = 'walk';        // walk | idle | flee | sun | dead
    this.idleT = 0;
    this.fleeT = 0;
    this.tx = x; this.ty = y;   // current walk target
    this.hasTarget = false;
    this.speed = PEDS.WALK * game.rngPeds.range(0.8, 1.2);
    this.skin = game.rngPeds.pick(SKINS);
    this.shirt = game.rngPeds.pick(SHIRTS);
    this.hp = PEDS.HP;
    this.dead = false;
    this.deadT = 0;
    this.bob = game.rngPeds.range(0, TAU);
    this.step = 0;
    this.remove = false;
    this.kind = 'civ';
    this.barkCd = 0;
    // Variants: joggers book it, drunks wobble, sunbathers bake.
    const roll = game.rngPeds.next();
    this.variant = roll < 0.12 ? 'jogger' : roll < 0.2 ? 'drunk' : roll < 0.26 ? 'phone' : 'normal';
    if (this.variant === 'jogger') { this.speed = PEDS.WALK * 2.1; this.shirt = game.rngPeds.pick(['#ff6a3c', '#8dff4a', '#25e8ff']); }
    if (this.variant === 'drunk') this.speed = PEDS.WALK * 0.55;
    this.wobble = game.rngPeds.range(0, TAU);
  }

  bark() {
    if (this.barkCd > 0 || this.dead || this.state === 'flee') return;
    this.barkCd = 6;
    this.game.fx.text(this.x, this.y - 1.6, this.game.rngPeds.pick(BARKS), '#f2f0e8', 12);
  }

  hurt(n, cause) {
    if (this.dead) return;
    this.hp -= n;
    if (this.hp <= 0) this.die(cause);
    else if (!this.dead && this.state !== 'flee') {
      this.state = 'flee';
      this.fleeT = PEDS.FLEE_TIME;
    }
  }

  die(cause) {
    if (this.dead) return;
    this.dead = true;
    this.deadT = 22;
    this.state = 'dead';
    this.game.fx.bloodBurst(this.x, this.y, cause === 'runover' ? 12 : 8);
    this.game.onPedKilled(this, cause);
  }

  update(dt) {
    const g = this.game;
    if (this.barkCd > 0) this.barkCd -= dt;
    if (this.dead) {
      this.deadT -= dt;
      if (this.deadT <= 0) this.remove = true;
      return;
    }
    // Run over by any fast car.
    for (const car of g.cars) {
      if (car.remove) continue;
      const sp = car.speed();
      if (sp < 4) continue;
      const d = Math.hypot(car.x - this.x, car.y - this.y);
      if (d < car.radius * 0.85) {
        this.die('runover');
        car.vx *= 0.96; car.vy *= 0.96;
        return;
      }
      // Near miss: dodge away.
      if (d < car.radius + 2.4 && this.state !== 'flee') {
        this.state = 'flee';
        this.fleeT = 2.2;
        this.threat = { x: car.x, y: car.y };
      }
    }

    if (this.state === 'sun') {
      // Baking on the sand; panic wakes them up.
      return;
    }
    if (this.state === 'flee') {
      this.fleeT -= dt;
      if (this.fleeT <= 0) {
        this.state = 'walk';
        this.hasTarget = false;
        // Sunbathers go back to their towel.
        if (this.variant === 'sunbather' && g.world.regionAt(this.x, this.y) === 'beach') this.state = 'sun';
      }
      const th = this.threat || { x: this.x + 1, y: this.y };
      const away = Math.atan2(this.y - th.y, this.x - th.x);
      this.angle = angleTowards(this.angle, away, 6 * dt);
      this.step += dt * 14;
      this.walk(dt, PEDS.RUN * (this.variant === 'jogger' ? 1.1 : 1));
    } else if (this.state === 'idle') {
      this.idleT -= dt;
      if (this.idleT <= 0) this.state = 'walk';
    } else {
      // walk toward target
      if (!this.hasTarget) {
        const pt = g.world.randomSidewalkPoint(g.rngPeds, this.x, this.y, 8, 60);
        if (pt) { this.tx = pt.x; this.ty = pt.y; this.hasTarget = true; }
      }
      if (this.hasTarget) {
        const d = Math.hypot(this.tx - this.x, this.ty - this.y);
        if (d < 1.2) {
          this.hasTarget = false;
          if (g.rngPeds.chance(0.35)) { this.state = 'idle'; this.idleT = g.rngPeds.range(1, 4); }
        } else {
          const want = Math.atan2(this.ty - this.y, this.tx - this.x);
          this.angle = angleTowards(this.angle, want, (this.variant === 'drunk' ? 2.2 : 5) * dt);
          if (this.variant === 'drunk') this.angle += Math.sin(g.realT * 2.2 + this.wobble) * 0.04;
          this.step += dt * 8;
          this.walk(dt, this.speed);
        }
      }
    }

    // Push out of solids.
    const res = g.world.solidsNear(this.x, this.y, 1.2);
    for (const rect of res) {
      const r = resolveCircleRect(this.x, this.y, 0.5, rect);
      if (r) { this.x += r.nx * r.depth; this.y += r.ny * r.depth; }
    }
  }

  walk(dt, speed) {
    this.x += Math.cos(this.angle) * speed * dt;
    this.y += Math.sin(this.angle) * speed * dt;
    // Water is fatal eventually; step back out.
    if (this.game.world.isWater(this.x, this.y)) {
      this.hasTarget = false;
      this.angle += Math.PI;
      this.x += Math.cos(this.angle) * 1.5;
      this.y += Math.sin(this.angle) * 1.5;
    }
  }

  draw(ctx, t) {
    if (this.dead) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      ctx.globalAlpha = clamp(this.deadT / 4, 0, 1);
      ctx.fillStyle = this.shirt;
      ctx.fillRect(-0.9, -0.42, 1.8, 0.84);
      ctx.fillStyle = this.skin;
      ctx.beginPath();
      ctx.arc(1.0, 0, 0.3, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }
    if (this.state === 'sun') {
      // Towel + sunbather
      ctx.fillStyle = '#3fa0a0';
      ctx.fillRect(this.x - 0.9, this.y - 1.6, 1.8, 3.2);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(this.x - 0.9, this.y - 0.2, 1.8, 0.3);
      ctx.save();
      ctx.translate(this.x, this.y + 0.6);
      ctx.rotate(Math.PI / 2 + this.angle);
      ctx.fillStyle = this.skin;
      ctx.fillRect(-0.7, -0.25, 1.3, 0.5);
      ctx.beginPath(); ctx.arc(0.75, 0, 0.24, 0, TAU); ctx.fill();
      ctx.restore();
      return;
    }
    const bob = Math.sin(this.step) * 0.06;
    shadowBlob(ctx, this.x + 0.25, this.y + 0.3, 0.55, 0.3);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    // Legs
    ctx.fillStyle = '#23242e';
    const ls = Math.sin(this.step) * 0.22;
    ctx.fillRect(-0.15, -0.34 + ls, 0.5, 0.22);
    ctx.fillRect(-0.15, 0.12 - ls, 0.5, 0.22);
    // Body
    ctx.fillStyle = this.shirt;
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.42, 0.34 + bob, 0, 0, TAU);
    ctx.fill();
    // Head
    ctx.fillStyle = this.skin;
    ctx.beginPath();
    ctx.arc(0.06, 0, 0.26, 0, TAU);
    ctx.fill();
    // Phone glow beside the head
    if (this.variant === 'phone') {
      ctx.fillStyle = 'rgba(160,230,255,0.9)';
      ctx.fillRect(0.2, 0.3, 0.2, 0.3);
    }
    ctx.restore();
    // Umbrellas come out in a storm.
    if (this.game.world.weather && this.game.world.weather.id === 'storm') {
      ctx.fillStyle = '#1a1c26';
      ctx.beginPath(); ctx.arc(this.x, this.y - 1.15, 0.85, 0, TAU); ctx.fill();
      ctx.fillStyle = this.shirt;
      ctx.beginPath(); ctx.arc(this.x, this.y - 1.2, 0.72, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#3a3f4d';
      ctx.lineWidth = 0.12;
      ctx.beginPath(); ctx.moveTo(this.x, this.y - 0.5); ctx.lineTo(this.x, this.y - 1.1); ctx.stroke();
    }
  }
}

export class Peds {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.spawnT = 0;
  }

  spawnInitial(n) {
    for (let k = 0; k < n; k++) this.trySpawn(true);
  }

  count() {
    let n = 0;
    for (const p of this.list) if (!p.remove && !p.dead) n++;
    return n;
  }

  trySpawn(anywhere = false) {
    const g = this.game;
    const anchor = g.player.inCar || g.player;
    // Sunbathers on the sand when the player is near the beach.
    if (anchor.y > BEACH_ROW * TILE && g.rngPeds.chance(0.3)) {
      for (let t = 0; t < 12; t++) {
        const x = g.rngPeds.range(12, CITY_W - 12);
        const y = g.rngPeds.range(BEACH_ROW * TILE + 12, CITY_H - 4);
        if (g.world.blockedAt(x, y)) continue;
        const d = Math.hypot(x - anchor.x, y - anchor.y);
        if (d < 20 || d > 130) continue;
        const ped = new Ped(g, x, y);
        if (g.rngPeds.chance(0.55)) {
          ped.variant = 'sunbather';
          ped.state = 'sun';
        }
        this.list.push(ped);
        return ped;
      }
    }
    const pt = g.world.randomSidewalkPoint(g.rngPeds, anchor.x, anchor.y,
      anywhere ? 20 : 45, anywhere ? 240 : PEDS.DESPAWN_DIST * 0.8);
    if (!pt) return null;
    if (!anywhere) {
      const halfW = 640 / (g.cam.z * 7.2) + 6;
      const halfH = 360 / (g.cam.z * 7.2) + 6;
      if (Math.abs(pt.x - g.cam.x) < halfW && Math.abs(pt.y - g.cam.y) < halfH) return null;
    }
    const ped = new Ped(g, pt.x, pt.y);
    this.list.push(ped);
    return ped;
  }

  panic(x, y, r) {
    for (const p of this.list) {
      if (p.dead) continue;
      if (Math.hypot(p.x - x, p.y - y) < r) {
        p.state = 'flee';
        p.fleeT = PEDS.FLEE_TIME * (0.7 + Math.random() * 0.6);
        p.threat = { x, y };
        p.hasTarget = false;
      }
    }
  }

  update(dt) {
    const g = this.game;
    if (this.count() < PEDS.MAX) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = 0.4;
        this.trySpawn(false);
      }
    }
    const anchor = g.player.inCar || g.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      const d = Math.hypot(p.x - anchor.x, p.y - anchor.y);
      if (d > PEDS.DESPAWN_DIST + 40 || (p.remove && p.deadT <= 0)) {
        this.list.splice(i, 1);
        continue;
      }
      if (d < 130) p.update(dt);
    }
  }

  draw(ctx, t) {
    for (const p of this.list) {
      if (Math.abs(p.x - this.game.cam.x) > 120 || Math.abs(p.y - this.game.cam.y) > 80) continue;
      p.draw(ctx, t);
    }
  }
}
