// ============================================================================
// VICE PALMS — cars.js
// Eight vehicle types, arcade night-driving physics (accel, drag, lateral
// grip/drift, handbrake), progressive damage (smoke -> fire -> explode with
// radius damage), skid marks, headlights/brakelights and per-type rendering.
// ============================================================================

import { CAR_PHYS, ROAD, LANE, TILE, COLS, ROWS, CITY_W, CITY_H, WATER_SOUTH } from './config.js';
import { TAU, clamp, damp, angleTowards, resolveCircleRect, shadowBlob, roundRect } from './util.js';
import { nextId } from './rng.js';

export const VEHICLES = {
  sport: {
    name: 'BANSHEE GT', w: 2.1, l: 4.5, top: 34, accel: 13.5, turn: 2.7, mass: 1.0,
    colors: ['#ff2f7d', '#25e8ff', '#e8e6df', '#b0483f'], kind: 'sport',
  },
  muscle: {
    name: 'PHOENIX V8', w: 2.3, l: 4.9, top: 31, accel: 12.0, turn: 2.35, mass: 1.25,
    colors: ['#f2a33c', '#8b1e1e', '#23232b', '#3d5fc2'], kind: 'muscle',
  },
  sedan: {
    name: 'PERENNIAL', w: 2.2, l: 4.6, top: 26, accel: 8.5, turn: 2.2, mass: 1.15,
    colors: ['#d8d4ca', '#5a6c8c', '#4a4e58', '#7a4f3f', '#2c2c38'], kind: 'sedan',
  },
  taxi: {
    name: 'CABBIE', w: 2.2, l: 4.6, top: 27, accel: 9.0, turn: 2.25, mass: 1.15,
    colors: ['#e8b23c'], kind: 'taxi',
  },
  van: {
    name: 'MOONBEAM', w: 2.4, l: 5.2, top: 23, accel: 7.0, turn: 1.9, mass: 1.5,
    colors: ['#c9c4b8', '#5e8c5a', '#a0843f'], kind: 'van',
  },
  pickup: {
    name: 'RANCHER', w: 2.35, l: 5.0, top: 25, accel: 8.2, turn: 2.0, mass: 1.4,
    colors: ['#7dc95e', '#b0483f', '#3f6ab0'], kind: 'pickup',
  },
  bus: {
    name: 'COACH', w: 2.6, l: 9.6, top: 21, accel: 5.0, turn: 1.45, mass: 2.6,
    colors: ['#d5c74e'], kind: 'bus',
  },
  police: {
    name: 'INTERCEPTOR', w: 2.25, l: 4.8, top: 33, accel: 12.5, turn: 2.6, mass: 1.2,
    colors: ['#e8e6df'], kind: 'police',
  },
};

export const CAR_TYPES = Object.keys(VEHICLES);

export function makeCar(game, type, x, y, angle, color) {
  return new Car(game, type, x, y, angle, color);
}

export class Car {
  constructor(game, type, x, y, angle, color) {
    const spec = VEHICLES[type] || VEHICLES.sedan;
    this.game = game;
    this.id = nextId();
    this.type = type;
    this.spec = spec;
    this.w = spec.w;
    this.l = spec.l;
    this.radius = (spec.w + spec.l) / 4;
    this.x = x; this.y = y;
    this.angle = angle;
    this.vx = 0; this.vy = 0;
    this.steer = 0;
    this.throttle = 0;        // -1..1 (reverse..forward)
    this.brake = 0;           // 0..1
    this.handbrake = false;
    this.color = color || game.rngCar.pick(spec.colors);
    this.driver = null;       // 'player' | 'ai' | 'cop' | null
    this.cop = spec.kind === 'police';
    this.sirenOn = false;
    this.sirenPhase = Math.random() * TAU;
    this.health = 100;
    this.dead = false;        // exploded / wrecked
    this.burning = false;
    this.burnT = 0;
    this.wrecked = false;
    this.smokeT = 0;
    this.inWater = false;
    this.sinkT = 0;
    this.lightsOn = true;
    this.brakeLight = false;
    this.skidT = 0;
    this.lastSkidL = null; this.lastSkidR = null;
    this.dents = [];
    this.honk = 0;
    this.hitFlash = 0;
    this.blinker = 0;         // 0 off, -1 left, 1 right (AI turn signals)
    // AI bookkeeping (traffic/police write here)
    this.ai = null;
    this.stopReason = null;
  }

  speed() {
    return Math.hypot(this.vx, this.vy);
  }

  forwardSpeed() {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    return this.vx * c + this.vy * s;
  }

  lateralSpeed() {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    return -this.vx * s + this.vy * c;
  }

  // Center of the front axle in world coords.
  nose() {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    return { x: this.x + c * this.l * 0.32, y: this.y + s * this.l * 0.32 };
  }

  tail() {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    return { x: this.x - c * this.l * 0.32, y: this.y - s * this.l * 0.32 };
  }

  headlightCones() {
    if (this.dead || this.wrecked) return [];
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    const hw = this.w / 2 - 0.25;
    return [
      { x: this.x + c * this.l * 0.46 - s * hw, y: this.y + s * this.l * 0.46 + c * hw, angle: this.angle },
      { x: this.x + c * this.l * 0.46 + s * hw, y: this.y + s * this.l * 0.46 - c * hw, angle: this.angle },
    ];
  }

  update(dt, world) {
    if (this.wrecked) {
      // Wrecks are static obstacles; keep smoking a while.
      if (this.smokeT > 0) {
        this.smokeT -= dt;
        if (Math.random() < 0.3) this.game.fx.smoke(this.x, this.y, true);
      }
      return;
    }

    // --- Water ------------------------------------------------------------
    if (!this.inWater && world.isWater(this.x, this.y)) {
      this.inWater = true;
      for (let k = 0; k < 10; k++) this.game.fx.waterSpray(this.x + (Math.random() - 0.5) * 3, this.y + (Math.random() - 0.5) * 2);
    }
    if (this.inWater) {
      this.sinkT += dt;
      this.vx *= 1 - 3 * dt; this.vy *= 1 - 3 * dt;
      if (Math.random() < 0.4) this.game.fx.waterSpray(this.x, this.y);
      this.health = Math.min(this.health, 30 - this.sinkT * 30);
      if (this.sinkT > 1.4) { this.explode(true); return; }
    }

    // --- Longitudinal -----------------------------------------------------
    const spec = this.spec;
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    let vf = this.vx * c + this.vy * s;
    let vl = -this.vx * s + this.vy * c;

    if (this.driver) {
      const dmgFactor = this.health < 60 ? 0.55 + 0.45 * (this.health / 60) : 1; // sick engine, sick speed
      const top = spec.top * dmgFactor;
      if (this.throttle > 0 && vf < top) {
        vf += spec.accel * this.throttle * dt * (1 - Math.max(0, vf) / top * 0.6);
      } else if (this.throttle < 0) {
        if (vf > 1) vf += spec.accel * this.throttle * dt * 1.6;   // engine braking
        else if (vf > -top * 0.35) vf += spec.accel * this.throttle * dt * 0.6; // reverse
      }
    }
    if (this.brake > 0) {
      const b = CAR_PHYS.BRAKE * this.brake * dt;
      vf = vf > 0 ? Math.max(0, vf - b) : Math.min(0, vf + b);
    }
    if (!this.driver || this.throttle === 0) {
      const r = CAR_PHYS.ROLL * dt;
      vf = vf > 0 ? Math.max(0, vf - r) : Math.min(0, vf + r);
    }
    vf -= vf * CAR_PHYS.DRAG * dt;

    // --- Lateral grip / drift ---------------------------------------------
    const grip = this.handbrake ? CAR_PHYS.GRIP_HB : CAR_PHYS.GRIP;
    vl *= Math.exp(-grip * dt);

    // --- Steering -----------------------------------------------------------
    if (this.driver && Math.abs(this.steer) > 0.01) {
      const dir = vf >= 0 ? 1 : -1;
      const authority = clamp(Math.abs(vf) / 7, 0, 1) * (1 - Math.min(0.6, Math.abs(vf) / spec.top * 0.55));
      this.angle += this.steer * spec.turn * authority * dir * dt;
      // Drift: handbrake swings the tail
      if (this.handbrake && Math.abs(vf) > 9) {
        this.angle += this.steer * spec.turn * 0.55 * dir * dt;
      }
    }

    this.vx = c * vf - s * vl;
    this.vy = s * vf + c * vl;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Skid marks
    if (Math.abs(vl) > CAR_PHYS.SKID_MIN || (this.handbrake && Math.abs(vf) > 8)) {
      this.laySkids(c, s);
    } else {
      this.lastSkidL = null; this.lastSkidR = null;
    }

    this.collideWorld(world);
    this.updateDamage(dt);
    if (this.honk > 0) this.honk -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    this.brakeLight = this.brake > 0.1 || (this.throttle < 0 && vf > 1);

    // Muscle revs spit flame at standstill; skids hiss while drifting.
    if (this.spec.kind === 'muscle' && this.throttle > 0.9 && Math.abs(vf) < 6 && Math.random() < 0.3) {
      const t2 = this.tail();
      this.game.fx.fire(t2.x - c * 0.6, t2.y - s * 0.6);
    }
    const drifting = Math.abs(vl) > CAR_PHYS.SKID_MIN;
    if (this.driver === 'player') this.game.audio.setSkid(drifting);
  }

  laySkids(c, s) {
    const hw = this.w / 2 - 0.3, hl = this.l * 0.32;
    const rl = { x: this.x - c * hl - s * hw, y: this.y - s * hl + c * hw };
    const rr = { x: this.x - c * hl + s * hw, y: this.y - s * hl - c * hw };
    if (this.lastSkidL) {
      this.game.fx.skid(this.lastSkidL.x, this.lastSkidL.y, rl.x, rl.y);
      this.game.fx.skid(this.lastSkidR.x, this.lastSkidR.y, rr.x, rr.y);
    }
    this.lastSkidL = rl; this.lastSkidR = rr;
  }

  collideWorld(world) {
    const pts = [this.nose(), this.tail(), { x: this.x, y: this.y }];
    const r = this.w / 2 + 0.25;
    for (const p of pts) {
      const near = world.solidsNear(p.x, p.y, r + 4);
      for (const rect of near) {
        const res = resolveCircleRect(p.x, p.y, r, rect);
        if (!res) continue;
        // Push the whole car out along the contact normal.
        this.x += res.nx * res.depth;
        this.y += res.ny * res.depth;
        // Kill velocity into the wall, with a lively bounce.
        const vn = this.vx * res.nx + this.vy * res.ny;
        if (vn < 0) {
          const impact = -vn;
          this.vx -= res.nx * vn * 1.35;
          this.vy -= res.ny * vn * 1.35;
          // scrape friction along the wall
          this.vx *= 0.92; this.vy *= 0.92;
          if (impact > CAR_PHYS.IMPACT_MIN) {
            this.damage((impact - CAR_PHYS.IMPACT_MIN) * CAR_PHYS.IMPACT_DMG, 'wall');
            this.game.fx.spark(p.x, p.y, 4);
            if (this.driver === 'player') this.game.fx.requestShake(Math.min(9, impact * 0.35));
          }
        }
      }
    }
    // World bounds (sea walls handled as water; keep inside the map on foot edges)
    const x0 = -ROAD / 2 - 2, x1 = CITY_W + ROAD / 2 + 2;
    const y0 = -WATER_LIMIT + 8, y1 = CITY_H + ROAD / 2 + WATER_SOUTH - 4;
    if (this.x < x0) { this.x = x0; this.vx = Math.abs(this.vx) * 0.4; }
    if (this.x > x1) { this.x = x1; this.vx = -Math.abs(this.vx) * 0.4; }
    if (this.y < y0) { this.y = y0; this.vy = Math.abs(this.vy) * 0.4; }
    if (this.y > y1) { this.y = y1; this.vy = -Math.abs(this.vy) * 0.4; }
  }

  damage(n, kind) {
    if (this.wrecked || this.dead) return;
    this.health -= n;
    if (n > 6) this.hitFlash = 0.12;
    if (this.health <= 0 && !this.burning) {
      this.health = 0;
      this.burning = true;
      this.burnT = CAR_PHYS.BURN_TIME;
      if (this.driver === 'player') this.game.fx.requestShake(6);
    }
  }

  updateDamage(dt) {
    // Smoke from a sick engine.
    if (this.health < CAR_PHYS.SMOKE_HP && !this.wrecked) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = this.health < CAR_PHYS.FIRE_HP ? 0.05 : 0.14;
        const n = this.nose();
        this.game.fx.smoke(n.x, n.y, this.health < CAR_PHYS.FIRE_HP);
      }
    }
    // Fire wraps things up.
    if (this.burning) {
      this.burnT -= dt;
      const n = this.nose();
      if (Math.random() < 0.75) this.game.fx.fire(n.x + (Math.random() - 0.5) * 1.6, this.y + (Math.random() - 0.5) * 1.2);
      if (this.burnT <= 0) this.explode(false);
    }
  }

  // sink=true: drowned quietly instead of a fireball.
  explode(sink) {
    if (this.wrecked) return;
    this.wrecked = true;
    this.burning = false;
    this.dead = true;
    this.driver = null;
    this.sirenOn = false;
    this.lightsOn = false;
    this.smokeT = 6;
    this.vx = 0; this.vy = 0;
    if (!sink) {
      this.game.fx.explosion(this.x, this.y);
      this.game.onExplosion(this.x, this.y, this);
    } else {
      this.game.fx.smoke(this.x, this.y, true);
    }
  }

  applyBullet(x, y, dmg) {
    if (this.wrecked) return;
    this.damage(dmg, 'bullet');
    this.game.fx.spark(x, y, 3);
  }

  // ---------------------------------------------------------------- drawing
  draw(ctx, t) {
    const z = 1;
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    const L = this.l, W = this.w;

    // Sink animation
    let alpha = 1, dy = 0;
    if (this.sinkT > 0) { alpha = clamp(1 - this.sinkT / 1.4, 0.1, 1); dy = this.sinkT * 0.8; }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.x, this.y + dy);
    ctx.rotate(this.angle);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    roundRect(ctx, -L / 2 + 0.35, -W / 2 + 0.5, L, W, 0.6);
    ctx.fill();

    // Wheels
    ctx.fillStyle = '#101014';
    const steerVis = this.steer * 0.5;
    for (const [wx, wy, front] of [[L * 0.30, -W / 2 - 0.08, 1], [L * 0.30, W / 2 + 0.08, 1], [-L * 0.30, -W / 2 - 0.08, 0], [-L * 0.30, W / 2 + 0.08, 0]]) {
      ctx.save();
      ctx.translate(wx, wy);
      if (front) ctx.rotate(steerVis);
      ctx.fillRect(-0.55, -0.28, 1.1, 0.56);
      ctx.restore();
    }

    // Body
    const bodyColor = this.wrecked ? '#26262a' : this.color;
    ctx.fillStyle = bodyColor;
    roundRect(ctx, -L / 2, -W / 2, L, W, 0.55);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 0.14;
    ctx.stroke();

    if (!this.wrecked) {
      // Type-specific tops
      this.drawTop(ctx, L, W);

      // Windshield + rear glass
      ctx.fillStyle = 'rgba(140,200,235,0.85)';
      roundRect(ctx, L * 0.06, -W / 2 + 0.32, L * 0.16, W - 0.64, 0.3);
      ctx.fill();
      ctx.fillStyle = 'rgba(100,160,200,0.7)';
      roundRect(ctx, -L * 0.26, -W / 2 + 0.38, L * 0.1, W - 0.76, 0.25);
      ctx.fill();

      // Lights
      if (this.lightsOn) {
        ctx.fillStyle = '#fff2c0';
        ctx.fillRect(L / 2 - 0.35, -W / 2 + 0.18, 0.3, 0.5);
        ctx.fillRect(L / 2 - 0.35, W / 2 - 0.68, 0.3, 0.5);
      }
      ctx.fillStyle = this.brakeLight ? '#ff2a2a' : '#7a1414';
      ctx.fillRect(-L / 2 + 0.08, -W / 2 + 0.18, 0.26, 0.5);
      ctx.fillRect(-L / 2 + 0.08, W / 2 - 0.68, 0.26, 0.5);

      // Turn-signal corners (blinking amber)
      if (this.blinker !== 0 && Math.floor(t * 2.5) % 2 === 0) {
        ctx.fillStyle = '#ffb02e';
        const bx = this.blinker < 0 ? -L / 2 : L / 2 - 0.3;
        ctx.fillRect(bx, -W / 2 + 0.1, 0.26, 0.4);
        ctx.fillRect(bx, W / 2 - 0.5, 0.26, 0.4);
      }

      if (this.spec.kind === 'taxi') {
        ctx.fillStyle = '#222';
        ctx.fillRect(-L * 0.08, -0.5, 1.1, 1.0);
        ctx.fillStyle = '#ffd23c';
        ctx.fillRect(-L * 0.08 + 0.15, -0.35, 0.8, 0.7);
      }
      if (this.cop) {
        // Lightbar
        const on = this.sirenOn;
        const ph = Math.floor(t * 8 + this.id) % 2;
        ctx.fillStyle = '#14161c';
        ctx.fillRect(-L * 0.06, -W / 2 + 0.25, 0.8, W - 0.5);
        if (on) {
          ctx.fillStyle = ph === 0 ? '#ff3050' : '#3050ff';
          ctx.fillRect(-L * 0.06, -W / 2 + 0.28, 0.74, W / 2 - 0.35);
          ctx.fillStyle = ph === 0 ? '#3050ff' : '#ff3050';
          ctx.fillRect(-L * 0.06, 0.05, 0.74, W / 2 - 0.35);
        } else {
          ctx.fillStyle = '#40465a';
          ctx.fillRect(-L * 0.06, -W / 2 + 0.28, 0.74, W - 0.56);
        }
        // doors
        ctx.fillStyle = '#17181d';
        ctx.fillRect(-L * 0.05, -W / 2, L * 0.36, W * 0.16);
        ctx.fillRect(-L * 0.05, W / 2 - W * 0.16, L * 0.36, W * 0.16);
      }

      // Damage: dents + hit flash
      if (this.health < 70) {
        ctx.fillStyle = 'rgba(10,10,14,0.5)';
        const d = this.dents.length ? this.dents : this.growDents();
        for (const dd of d) {
          ctx.save();
          ctx.rotate(dd.a);
          ctx.fillRect(dd.x, dd.y, dd.w, dd.h);
          ctx.restore();
        }
      }
      if (this.hitFlash > 0) {
        ctx.globalAlpha = this.hitFlash * 4;
        ctx.fillStyle = '#fff';
        roundRect(ctx, -L / 2, -W / 2, L, W, 0.55);
        ctx.fill();
        ctx.globalAlpha = alpha;
      }
    } else {
      // Wreck: charred shell, broken glass, bare rims
      ctx.fillStyle = '#111116';
      roundRect(ctx, L * 0.02, -W / 2 + 0.3, L * 0.2, W - 0.6, 0.3);
      ctx.fill();
      ctx.fillStyle = '#3a3a40';
      for (const [wx, wy] of [[L * 0.30, -W / 2 - 0.08], [L * 0.30, W / 2 + 0.08], [-L * 0.30, -W / 2 - 0.08], [-L * 0.30, W / 2 + 0.08]]) {
        ctx.beginPath(); ctx.arc(wx, wy, 0.34, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,120,40,0.25)';
      ctx.lineWidth = 0.2;
      ctx.beginPath();
      ctx.moveTo(-L * 0.3, -W * 0.2); ctx.lineTo(L * 0.1, W * 0.3);
      ctx.stroke();
    }

    ctx.restore();
  }

  growDents() {
    const d = [];
    for (let k = 0; k < 5; k++) {
      d.push({
        x: -this.l / 2 + Math.random() * this.l * 0.8,
        y: -this.w / 2 + Math.random() * this.w * 0.7,
        w: 0.6 + Math.random() * 1.2,
        h: 0.4 + Math.random() * 0.8,
        a: Math.random() * TAU,
      });
    }
    this.dents = d;
    return d;
  }

  drawTop(ctx, L, W) {
    const k = this.spec.kind;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    if (k === 'sport') {
      ctx.fillRect(-L * 0.42, -W / 2 + 0.14, L * 0.84, 0.22); // racing stripe
      // Rear wing
      ctx.fillStyle = '#15161c';
      ctx.fillRect(-L / 2 - 0.25, -W / 2 + 0.2, 0.4, W - 0.4);
    } else if (k === 'muscle') {
      ctx.fillRect(-L * 0.42, -W * 0.32, L * 0.84, 0.16);
      ctx.fillRect(-L * 0.42, W * 0.16, L * 0.84, 0.16);
      // Hood scoop
      ctx.fillStyle = '#101014';
      ctx.fillRect(L * 0.18, -0.3, 0.7, 0.6);
    } else if (k === 'van') {
      ctx.fillStyle = 'rgba(140,200,235,0.5)';
      ctx.fillRect(L * 0.1, -W / 2 + 0.3, 0.5, W - 0.6);
      // Roof rack ladder
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-L * 0.35, -W / 2 + 0.25, L * 0.5, 0.14);
      for (let x = -L * 0.35; x < L * 0.15; x += 0.7) ctx.fillRect(x, -W / 2 + 0.25, 0.1, W - 0.5);
    } else if (k === 'pickup') {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(-L * 0.44, -W / 2 + 0.28, L * 0.4, W - 0.56); // bed
      // Roll bar
      ctx.fillStyle = '#15161c';
      ctx.fillRect(-L * 0.05, -W / 2 + 0.15, 0.25, W - 0.3);
    } else if (k === 'bus') {
      ctx.fillStyle = 'rgba(140,200,235,0.7)';
      for (let wx = -L * 0.38; wx < L * 0.3; wx += 1.4) {
        ctx.fillRect(wx, -W / 2 + 0.2, 0.9, 0.55);
        ctx.fillRect(wx, W / 2 - 0.75, 0.9, 0.55);
      }
      ctx.fillStyle = 'rgba(140,200,235,0.85)';
      ctx.fillRect(L * 0.05, -W / 2 + 0.3, 0.5, W - 0.6);
      // Destination sign
      ctx.fillStyle = '#ffb02e';
      ctx.fillRect(L * 0.34, -W / 2 + 0.25, 0.55, W - 0.5);
      ctx.fillStyle = '#14161c';
      ctx.font = '700 0.8px "Consolas", monospace';
      ctx.textAlign = 'center';
      ctx.save();
      ctx.rotate(Math.PI / 2);
      ctx.fillText('NEON', W / 2 - 0.1, -L * 0.35);
      ctx.restore();
      ctx.textAlign = 'left';
    } else if (k === 'police') {
      ctx.fillStyle = 'rgba(230,232,240,0.9)';
      ctx.fillRect(-L * 0.2, -W / 2 + 0.2, L * 0.5, W - 0.4);
      // Bullbar
      ctx.fillStyle = '#2b2e38';
      ctx.fillRect(L / 2 - 0.12, -W / 2 - 0.06, 0.24, W + 0.12);
      // Door decal
      ctx.fillStyle = '#1a2a5e';
      ctx.fillRect(L * 0.02, -W / 2 + 0.55, L * 0.2, 0.3);
      ctx.fillStyle = '#e8e6df';
      ctx.font = '700 0.7px "Consolas", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('VCPD', L * 0.12, W / 2 - 0.55);
      ctx.textAlign = 'left';
    } else if (k === 'taxi') {
      // Roof checker strip
      ctx.fillStyle = '#14161c';
      for (let x = -L * 0.1; x < L * 0.2; x += 0.45) ctx.fillRect(x, -W / 2 + 0.2, 0.22, W - 0.4);
    }
  }
}

// Limit for cars driving north past the harbor wall (world bound guard).
const WATER_LIMIT = 96;

// Pairwise car collisions (traffic + cops + player car + mission cars).
export function collideCars(cars, fx) {
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (a.sinkT > 0) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (b.sinkT > 0) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const rr = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 > rr * rr || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d;
      const overlap = rr - d;
      const ma = a.spec.mass, mb = b.spec.mass;
      const total = ma + mb;
      // positional correction
      a.x -= nx * overlap * (mb / total);
      a.y -= ny * overlap * (mb / total);
      b.x += nx * overlap * (ma / total);
      b.y += ny * overlap * (ma / total);
      // impulse
      const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
      const vn = rvx * nx + rvy * ny;
      if (vn < 0) {
        const imp = (-vn * 1.35) / total;
        a.vx -= nx * imp * mb; a.vy -= ny * imp * mb;
        b.vx += nx * imp * ma; b.vy += ny * imp * ma;
        const impact = -vn;
        if (impact > CAR_PHYS.IMPACT_MIN) {
          const dmg = (impact - CAR_PHYS.IMPACT_MIN) * CAR_PHYS.IMPACT_DMG;
          a.damage(dmg * (mb / total), 'car');
          b.damage(dmg * (ma / total), 'car');
          fx.spark((a.x + b.x) / 2, (a.y + b.y) / 2, 5);
          const g = a.game;
          if (a.driver === 'player' || b.driver === 'player') {
            fx.requestShake(Math.min(10, impact * 0.4));
            const other = a.driver === 'player' ? b : a;
            g.onPlayerBump(other, impact);
          }
        }
      }
    }
  }
}
