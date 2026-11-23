// cars.js — 8 vehicle types, arcade drift physics, damage smoke/fire/explode
import { CFG } from './config.js';
import { clamp, angDiff, TAU, carContains, circleRect } from './util.js';
import { mulberry32 } from './rng.js';

// type definitions: len/wid in units, speeds in units/s
export const CAR_DEFS = {
  sedan:  { name: 'Esperanto', len: 74, wid: 34, max: 330, rev: -110, acc: 270, grip: 6.0, turn: 2.6, hp: 100, colors: ['#8a8f98', '#5d6b7a', '#7a5d68', '#4a6b5d', '#96836a'] },
  sport:  { name: 'Infernus V', len: 76, wid: 32, max: 460, rev: -120, acc: 400, grip: 7.4, turn: 2.9, hp: 88, colors: ['#c22f4a', '#e0c040', '#33b0a0', '#2f49c2', '#d8d8dc'] },
  taxi:   { name: 'Palm Cab', len: 74, wid: 34, max: 320, rev: -110, acc: 260, grip: 6.0, turn: 2.6, hp: 100, colors: ['#e8b400'] },
  van:    { name: 'Boxville', len: 86, wid: 40, max: 260, rev: -90, acc: 200, grip: 5.0, turn: 2.1, hp: 130, colors: ['#7d8896', '#6a7d6a', '#96606a'] },
  pickup: { name: 'Rancher', len: 82, wid: 36, max: 290, rev: -100, acc: 240, grip: 5.6, turn: 2.3, hp: 120, colors: ['#7a6a4f', '#5a6a7a', '#8a4f4f'] },
  coupe:  { name: 'Banshee', len: 70, wid: 32, max: 400, rev: -115, acc: 340, grip: 6.8, turn: 2.8, hp: 92, colors: ['#b8bcc4', '#2f7ac2', '#c26a2f', '#4fae62'] },
  truck:  { name: 'Linerunner', len: 112, wid: 44, max: 230, rev: -80, acc: 170, grip: 4.4, turn: 1.7, hp: 200, colors: ['#8a4f3d', '#4f6a8a', '#5a5f6a'] },
  bus:    { name: 'Coach', len: 128, wid: 42, max: 210, rev: -75, acc: 160, grip: 4.2, turn: 1.5, hp: 220, colors: ['#d8a020', '#3d8a8a'] },
  police: { name: 'VPD Cruiser', len: 78, wid: 34, max: 420, rev: -120, acc: 360, grip: 6.6, turn: 2.8, hp: 120, colors: ['#20242e'] },
};

let CAR_ID = 1;

export class Car {
  constructor(type, x, y, h = 0, color = null) {
    const def = CAR_DEFS[type] ?? CAR_DEFS.sedan;
    this.id = CAR_ID++;
    this.type = type;
    this.def = def;
    this.len = def.len; this.wid = def.wid;
    this.x = x; this.y = y; this.h = h;
    this.vx = 0; this.vy = 0;       // velocity vector (units/s)
    this.steerVis = 0;
    this.hp = def.hp;
    this.maxHp = def.hp;
    this.state = 'drive';           // drive | fire | wreck
    this.fireT = 0;
    this.smokeT = 0;
    this.color = color ?? def.colors[(mulberry32(this.id * 97 + 13)() * def.colors.length) | 0];
    this.driver = null;             // 'player' | 'ai' | 'ped' | null
    this.ai = null;                 // traffic or police AI object
    this.siren = false;
    this.sirenT = 0;
    this.exploded = false;
    this.explodeT = 0;
    this.lastImpact = 0;            // seconds since last hard impact (for AI stun)
    this.brakeLight = 0;
    this.reverse = false;
    this.horn = 0;
    this.engineLevel = 0;           // for audio
    this.sunk = false;
    this.marker = null;             // mission marker above car ('target' etc.)
    this.skidT = 0;                 // drifting flag for tire marks
    this.nitro = false;
    this.nitroGlow = 0;
    this.spikeT = 0;
  }

  get speedFwd() {
    const c = Math.cos(this.h), s = Math.sin(this.h);
    return this.vx * c + this.vy * s;
  }
  get speedLat() {
    const c = Math.cos(this.h), s = Math.sin(this.h);
    return -(this.vx * s) + this.vy * c;
  }
  get speed() { return Math.hypot(this.vx, this.vy); }

  // arcade physics: engine force along heading, grip kills lateral velocity, handbrake drifts
  update(game, dt, input = null) {
    if (this.state === 'wreck') {
      this.vx *= 0.9; this.vy *= 0.9;
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.explodeT += dt;
      this.collideWorld(game, dt, true);
      return;
    }
    if (this.state === 'fire') {
      this.fireT += dt;
      if (this.fireT > 2.4) { this.state = 'wreck'; this.explode(game); return; }
    }
    this.lastImpact = Math.max(0, this.lastImpact - dt);
    this.brakeLight = Math.max(0, this.brakeLight - dt * 4);
    this.horn = Math.max(0, this.horn - dt);
    this.blinkT = Math.max(0, (this.blinkT || 0) - dt);
    this.sirenT += dt;

    const def = this.def;
    let throttle = 0, steer = 0, hand = false;
    if (this.driver === 'player' && input) {
      throttle = (input.anyDown('W', 'UP') ? 1 : 0) + (input.anyDown('S', 'DOWN') ? -1 : 0);
      steer = (input.anyDown('D', 'RIGHT') ? 1 : 0) - (input.anyDown('A', 'LEFT') ? 1 : 0);
      hand = input.down('SPACE');
      this.nitro = input.down('SHIFT') && throttle > 0;
    } else if (this.ai && this.driver === 'ai') {
      this.nitro = false;
      const cmd = this.ai.drive(this, game, dt);
      throttle = cmd.t; steer = cmd.s; hand = !!cmd.h;
    } else {
      // driverless: roll to a stop
      this.nitro = false;
      this.vx *= Math.pow(0.2, dt); this.vy *= Math.pow(0.2, dt);
    }

    // decompose velocity
    const c = Math.cos(this.h), s = Math.sin(this.h);
    let fwd = this.vx * c + this.vy * s;
    let lat = -this.vx * s + this.vy * c;

    // engine / brake
    if (throttle > 0) fwd += def.acc * dt * (fwd < 0 ? 2.2 : 1);       // brake harder than gas
    else if (throttle < 0) {
      if (fwd > 30) { fwd -= def.acc * 1.6 * dt; this.brakeLight = 1; } // braking
      else fwd = Math.max(fwd - def.acc * 0.8 * dt, def.rev);
    } else if (hand) { fwd *= Math.pow(0.35, dt); this.brakeLight = 1; }
    else fwd *= Math.pow(0.62, dt); // engine drag
    // nitro boost: SHIFT while gassing, capped above the redline
    if (this.nitro && fwd > 20) {
      const cap = def.max * 1.18;
      if (fwd < cap) {
        fwd += def.acc * 1.15 * dt;
        this.nitroGlow = 1;
        if (Math.random() < dt * 40) game.fxBurst(this.x - Math.cos(this.h) * this.len / 2, this.y - Math.sin(this.h) * this.len / 2, 'fire', 1);
        game.audio?.nitro?.();
      }
    }
    this.nitroGlow = Math.max(0, (this.nitroGlow || 0) - dt * 3);
    fwd = clamp(fwd, def.rev, def.max * (this.nitro ? 1.18 : 1));
    // blown tires from spike strips: hard speed cap while spikeT ticks down
    if (this.spikeT > 0) {
      this.spikeT -= dt;
      if (fwd > 95) { fwd = 95; this.skidT = 0.3; }
    }

    // steering scales with speed (slow: less turn, fast: capped), reverses when reversing
    const sp = Math.abs(fwd);
    const steerPow = def.turn * clamp(sp / 140, 0, 1) * (1 + (hand ? 0.55 : 0));
    this.steerVis += ((steer * 0.5) - this.steerVis) * Math.min(1, dt * 10);
    this.h += steer * steerPow * dt * (fwd < -5 ? -1 : 1);

    // grip: lateral velocity decay; handbrake lowers grip -> drift; rain lowers grip
    const wetGrip = game.weather ? game.weather.grip() : 1;
    const grip = (hand ? def.grip * 0.22 : def.grip * wetGrip);
    lat *= Math.pow(Math.E, -grip * dt);
    if (hand && sp > 120) lat += (this.vx * -s + this.vy * c) * 0;
    // sliding scrape
    if (Math.abs(lat) > 90) this.skidT = 0.3; else this.skidT = Math.max(0, this.skidT - dt);

    // recompose
    this.vx = c * fwd - s * lat;
    this.vy = s * fwd + c * lat;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.collideWorld(game, dt, false);
    this.engineLevel = sp / def.max;
    // NaN guard: never let a car poison the whole render pass
    if (!Number.isFinite(this.x) || !Number.isFinite(this.y) || !Number.isFinite(this.h)) {
      console.warn('NaN car reset', this.id, this.type, this.driver, this.state, this.vx, this.vy, this.hp);
      this.x = isFinite(this.x) ? this.x : 2000;
      this.y = isFinite(this.y) ? this.y : 2400;
      this.h = isFinite(this.h) ? this.h : 0;
      this.vx = 0; this.vy = 0;
    }
  }

  collideWorld(game, dt, wreck) {
    const world = game.world;
    // world bounds
    const m = 30;
    if (this.x < m) { this.x = m; this.vx = Math.abs(this.vx) * 0.3; this.impact(4, game); }
    if (this.x > CFG.W - m) { this.x = CFG.W - m; this.vx = -Math.abs(this.vx) * 0.3; this.impact(4, game); }
    if (this.y < m) { this.y = m; this.vy = Math.abs(this.vy) * 0.3; this.impact(4, game); }
    if (this.y > CFG.H - m) { this.y = CFG.H - m; this.vy = -Math.abs(this.vy) * 0.3; this.impact(4, game); }

    // water: cars sink (instant stop, driver ejects as WASTED risk)
    if (!this.sunk && world.isWater(this.x, this.y)) {
      const speed = this.speed;
      if (speed > 60) this.impact(speed / 12, game);
      this.vx *= 0.4; this.vy *= 0.4;
      game.onCarWater(this);
      this.sunk = true;
    }

    // solids via 4 corners
    const hl = this.len / 2, hw = this.wid / 2;
    const corners = [[hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw]];
    const c = Math.cos(this.h), s = Math.sin(this.h);
    for (const [lx, ly] of corners) {
      const px = this.x + lx * c - ly * s;
      const py = this.y + lx * s + ly * c;
      const solids = world.nearSolids(px, py);
      for (const r of solids) {
        const hit = circleRect(px, py, 3, r);
        if (!hit) continue;
        this.x += hit.x; this.y += hit.y;
        // kill velocity into the wall, bounce a little
        const impact = this.speed;
        if (impact > 90 && !wreck) {
          this.impact(impact / 16, game);
          this.lastImpact = 0.5;
          game.fxSparks(px, py, 6);
          if (this.driver === 'ai') this.ai && this.ai.stun && this.ai.stun(0.4);
        }
        const nvx = hit.x, nvy = hit.y;
        const dot = this.vx * nvx + this.vy * nvy;
        if (dot < 0) { this.vx -= 1.35 * dot * nvx; this.vy -= 1.35 * dot * nvy; }
        else { this.vx *= 0.5; this.vy *= 0.5; }
      }
    }
    // palms
    for (const p of world.palmSolids) {
      if (Math.abs(p.x - this.x) > 200 || Math.abs(p.y - this.y) > 200) continue;
      if (!carContains(this, p.x, p.y, p.r)) continue;
      const dx = this.x - p.x, dy = this.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const impact = this.speed;
      if (impact > 80 && !wreck) { this.impact(impact / 18, game); game.fxSparks(p.x, p.y, 4); game.fxBurst(p.x, p.y, 'leaf', 8); }
      this.x = p.x + (dx / d) * (this.len / 2 + p.r);
      this.y = p.y + (dy / d) * (this.len / 2 + p.r);
      const dot = (this.vx * dx + this.vy * dy) / (d * d);
      this.vx -= 1.4 * dot * dx; this.vy -= 1.4 * dot * dy;
    }
  }

  impact(dmg, game) {
    if (this.state !== 'drive') return;
    this.hp -= dmg;
    if (this.hp < this.maxHp * 0.45) this.smokeT = 1; // smoke flag
    if (this.hp <= 0) { this.hp = 0; this.state = 'fire'; this.fireT = 0; }
    game.onCarImpact?.(this, dmg);
  }

  damage(amount, game, src) {
    if (this.state === 'wreck') return;
    this.hp -= amount;
    if (this.hp < this.maxHp * 0.45) this.smokeT = 1;
    if (this.hp <= 0 && this.state === 'drive') { this.hp = 0; this.state = 'fire'; this.fireT = 0; }
  }

  explode(game) {
    if (this.exploded) return;
    this.exploded = true;
    this.driver = null;
    this.ai = null;
    game.onCarExplode?.(this);
  }

  // eject driver as a ped-like entity (carjack target)
  stop() { this.vx *= 0.2; this.vy *= 0.2; }

  centerOffset(dir) {
    // door position for enter/exit: left side
    const s = Math.sin(this.h), c = Math.cos(this.h);
    const off = this.wid / 2 + 10;
    return dir === 'left'
      ? { x: this.x - off * c, y: this.y - off * s }
      : { x: this.x + off * c, y: this.y + off * s };
  }
}

export function makeCar(type, x, y, h = 0, color = null) {
  return new Car(type, x, y, h, color);
}

// helper: check if a world point is inside any car (oriented box)
export function carAt(game, x, y, pad = 0, exclude = null) {
  for (const c of game.cars) {
    if (c === exclude || c.state === 'wreck') continue;
    if (Math.abs(c.x - x) > 90 || Math.abs(c.y - y) > 90) continue;
    if (carContains(c, x, y, pad)) return c;
  }
  return null;
}
