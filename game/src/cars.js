// cars.js — vehicle class: arcade physics with drift + handbrake, damage
// (smoke → fire → explosion), collisions against the world and each other,
// plus the car-drawing routines used by the renderer.

import { CFG, DIRS } from './config.js';
import { G, clamp, angNorm, len2 } from './util.js';
import { sfxCrash, sfxBoom, sfxHorn, skidUpdate } from './audio.js';
import { addStat } from './stats.js';

export const dirAng = (d) => [0, Math.PI / 2, Math.PI, -Math.PI / 2][d];

const spdOf = (c) => len2(c.vx, c.vy);

let carId = 1;

export class Car {
  constructor(type, x, y, heading, opts = {}) {
    const spec = CFG.CARS[type] || CFG.CARS.voodoo;
    this.id = carId++;
    this.type = type;
    this.spec = spec;
    this.x = x; this.y = y;
    this.h = heading || 0;
    this.vx = 0; this.vy = 0;
    this.w = spec.w; this.hh = spec.h / 2; this.hw = spec.w / 2;
    this.r = Math.max(spec.w, spec.h) * CFG.CAR_R_MULT;
    this.hp = spec.hp; this.maxHp = spec.hp;
    this.dead = false;
    this.burnT = 0;          // time on fire
    this.smokeT = 0;
    this.color = opts.color || spec.colors[(Math.random() * spec.colors.length) | 0];
    this.driver = opts.driver || null;   // 'traffic' | 'police' | 'player' | null
    this.ctrl = { throttle: 0, steer: 0, hand: false };
    this.ai = opts.ai || null;
    this.mission = opts.mission || false; // mission cars never despawn
    this.lastHit = null;                  // 'player' | 'cop' | 'other'
    this.stopT = 0;                       // stopped-near-cop timer (busted)
    this.sirenFlash = 0;
    this.skidT = 0;
    this.wreckT = 0;
    this.nitro = 0.4;                     // drift to refill, Shift to burn
    this.nitroOn = false;
    this.alarmT = 0;                      // jacked a car with an alarm
    this.hornT = 0;
  }

  get speed() { return len2(this.vx, this.vy); }

  forward() { return { x: Math.cos(this.h), y: Math.sin(this.h) }; }

  update(dt) {
    if (this.dead) { this.wreckT += dt; return; }
    const spec = this.spec;
    const fx = Math.cos(this.h), fy = Math.sin(this.h);
    let vf = this.vx * fx + this.vy * fy;                 // forward speed
    let lx = this.vx - fx * vf, ly = this.vy - fy * vf;   // lateral vector

    // surface the car is standing on
    const surface = G.world.surfaceAt(this.x, this.y);
    let surfMax = 1, surfAcc = 1, surfGrip = 1;
    if (surface === 'sand') { surfMax = 0.55; surfAcc = 0.6; surfGrip = 0.8; }
    else if (surface === 'grass') { surfMax = 0.62; surfAcc = 0.65; surfGrip = 0.85; }
    else if (surface === 'water') { surfMax = 0.2; surfAcc = 0.4; surfGrip = 0.6; }

    // engine / brake / reverse
    const th = this.ctrl.throttle;
    // nitro: only the player burns it; drifting refills it
    this.nitroOn = this.driver === 'player' && this.ctrl.nitro && this.nitro > 0.02 && th > 0 && surface === 'road';
    if (this.nitroOn) {
      this.nitro = Math.max(0, this.nitro - dt * 0.5);
      if (Math.random() < 0.85) {
        const bx = this.x - fx * (this.hw + 2);
        const by = this.y - fy * (this.hw + 2);
        G.parts.push({ x: bx, y: by, vx: -fx * 120 + (Math.random() - 0.5) * 40, vy: -fy * 120 + (Math.random() - 0.5) * 40, life: 0.22, max: 0.22, type: 'fire', r: 5 });
      }
    } else if (Math.abs(this.ctrl.steer) > 0.4 && spdOf(this) > 120) {
      this.nitro = Math.min(1, this.nitro + dt * 0.22);   // drifting pays
    }
    if (th > 0) {
      const boost = this.nitroOn ? 1.9 : 1;
      const cap = spec.max * surfMax * (this.nitroOn ? 1.15 : 1);
      if (vf < cap) vf += spec.acc * surfAcc * boost * th * dt;
    } else if (th < 0) {
      if (vf > 8) vf += CFG.BRAKE * th * dt;
      else if (vf > -spec.max * 0.35) vf += spec.acc * 0.55 * th * dt;
    }
    // drag + rolling resistance
    vf -= vf * CFG.ENG_DRAG * dt;
    if (Math.abs(vf) < 3 && th === 0) vf = 0;

    // lateral grip (handbrake breaks it loose; rain makes it worse)
    const wet = G.weather ? G.weather.gripMul() : 1;
    const grip = (this.ctrl.hand ? CFG.HANDBRAKE_GRIP : CFG.SLIP_GRIP) * wet * surfGrip;
    const g = Math.exp(-grip * dt);
    lx *= g; ly *= g;

    // steering scales with speed; handbrake tightens it
    const spd = Math.abs(vf);
    const steerAuth = clamp(spd / 130, 0, 1) * (this.ctrl.hand ? 1.5 : 1) * (vf < 0 ? -1 : 1);
    this.h = angNorm(this.h + this.ctrl.steer * spec.turn * steerAuth * dt);

    // recompose velocity along (possibly rotated) forward axis
    const nfx = Math.cos(this.h), nfy = Math.sin(this.h);
    this.vx = nfx * vf + lx;
    this.vy = nfy * vf + ly;

    // integrate
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // the ocean does not care about your paint job
    if (G.world.onWater(this.x, this.y) && !G.world.onPier(this.x, this.y) && !this.dead) {
      this.vx *= 1 - dt * 2.6; this.vy *= 1 - dt * 2.6;
      this.hp -= 34 * dt;
      this.lastHit = this.lastHit || 'other';
      if (Math.random() < 0.4) {
        G.parts.push({ x: this.x, y: this.y, vx: 0, vy: 0, life: 0.6, max: 0.6, type: 'ripple', r: 8 });
      }
      if (this.hp <= 0) this.explode();
    }

    // shredded tires from a spike strip: heavy speed cap + drama
    if (this.spikeT > 0) {
      this.spikeT -= dt;
      const cap = 95;
      if (Math.abs(vf) > cap) { this.vx *= 0.9; this.vy *= 0.9; }
      if (Math.random() < 0.5) {
        G.parts.push({ x: this.x, y: this.y, vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 80, life: 0.25, max: 0.25, type: 'spark', r: 2.5 });
      }
    }

    // world collision
    const w = G.world;
    if (w) {
      const hit = w.collide(this.x, this.y, this.r);
      if (hit.power > 0.5) {
        this.x = hit.x; this.y = hit.y;
        // kill velocity into the wall
        const vn = this.vx * hit.nx + this.vy * hit.ny;
        if (vn < 0) {
          this.vx -= hit.nx * vn; this.vy -= hit.ny * vn;
          const impact = -vn;
          if (impact > 90) {
            this.damage(impact * 0.055, 'other');
            if (this.driver === 'player' || distToCam(this) < 900) sfxCrash(impact);
            if (this.driver === 'player') G.cam.shake = Math.min(14, G.cam.shake + impact * 0.02);
          }
        }
        // scrub speed on scrape
        this.vx *= 0.86; this.vy *= 0.86;
      }
    }

    // skid marks + squeal condition
    const latSpeed = Math.abs(lx * -nfy + ly * nfx);
    if ((this.ctrl.hand && spd > 60) || latSpeed > 70) {
      this.skidT -= dt;
      if (this.skidT <= 0 && G.skids.length < CFG.SKID_MAX) {
        this.skidT = 0.02;
        pushSkids(this);
      }
      // sand kicks up dust instead of rubber
      if (surface === 'sand' && Math.random() < 0.6) {
        G.parts.push({ x: this.x - nfx * this.hw, y: this.y - nfy * this.hw, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, life: 0.5, max: 0.5, type: 'smoke', r: 5 });
      }
      if (this.driver === 'player') skidUpdate(clamp(latSpeed / 160, 0.1, 1));
    } else if (this.driver === 'player') {
      skidUpdate(0);
    }

    // car alarm: flashing lights + the city notices
    if (this.alarmT > 0) {
      this.alarmT -= dt;
      this.sirenFlash += dt * 4;
      if (Math.random() < 0.02) sfxHorn();
      if (G.police) G.police.crime(1, this.x, this.y);
    }

    // rain splash from fast tires
    if (G.weather && G.weather.rain > 0.35 && spd > 100 && Math.random() < 0.5) {
      G.parts.push({ x: this.x - nfx * this.hw, y: this.y - nfy * this.hw, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, life: 0.3, max: 0.3, type: 'ripple', r: 4 });
    }

    // damage state effects
    if (this.hp < this.maxHp * 0.4 && this.hp > 0) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.09;
        G.parts.push({ x: this.x + nfx * 10, y: this.y + nfy * 10, vx: (Math.random() - 0.5) * 12, vy: -14 - Math.random() * 10, life: 1.4, max: 1.4, type: 'smoke', r: 7 });
      }
    }
    if (this.hp < this.maxHp * 0.16 && this.hp > 0) {
      this.burnT += dt;
      if (this.burnT > 3.2) { this.explode(); return; }
      if (Math.random() < 0.5) {
        G.parts.push({ x: this.x, y: this.y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20 - 8, life: 0.4, max: 0.4, type: 'fire', r: 6 });
      }
    }
    if (this.type === 'police') this.sirenFlash += dt;
  }

  damage(n, from) {
    if (this.dead) return;
    this.hp -= n;
    if (from) this.lastHit = from;
    if (this.hp <= 0) this.explode();
  }

  explode() {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    this.burnT = 0;
    this.driver = null;
    this.ai = null;
    if (this.lastHit === 'player') addStat('wrecks', 1);
    G.booms.push({ x: this.x, y: this.y, t: 0, r: 150 });
    G.parts.push({ x: this.x, y: this.y, vx: 0, vy: 0, life: 2.6, max: 2.6, type: 'smoke', r: 20 });
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 160;
      G.parts.push({ x: this.x, y: this.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.7, max: 0.7, type: 'fire', r: 9 });
    }
    sfxBoom(1);
    G.cam.shake = Math.min(22, G.cam.shake + 14);
    // splash damage
    for (const c of G.cars) {
      if (c === this || c.dead) continue;
      const dx = c.x - this.x, dy = c.y - this.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 150 * 150) {
        c.damage(85, this.lastHit);
        c.vx += (dx / (Math.sqrt(d2) + 1)) * 120;
        c.vy += (dy / (Math.sqrt(d2) + 1)) * 120;
      }
    }
    for (const p of G.peds) {
      const dx = p.x - this.x, dy = p.y - this.y;
      if (dx * dx + dy * dy < 110 * 110) p.kill();
    }
    for (const cop of G.cops) {
      const dx = cop.x - this.x, dy = cop.y - this.y;
      if (dx * dx + dy * dy < 110 * 110) cop.hp = -1;
    }
    if (G.player && !G.player.car) {
      const dx = G.player.x - this.x, dy = G.player.y - this.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 130 * 130) G.player.hurt(70 * (1 - Math.sqrt(d2) / 130), 'boom');
    }
    if (this.lastHit === 'player' && G.police) G.police.crime(3, this.x, this.y);
  }
}

function distToCam(c) {
  const dx = c.x - G.cam.x, dy = c.y - G.cam.y;
  return dx * dx + dy * dy;
}

function pushSkids(car) {
  const fx = Math.cos(car.h), fy = Math.sin(car.h);
  const bx = car.x - fx * car.hw * 0.6, by = car.y - fy * car.hw * 0.6;
  const px = -fy, py = fx;
  const off = car.hh * 0.75;
  G.skids.push({ x: bx + px * off, y: by + py * off, a: car.h });
  G.skids.push({ x: bx - px * off, y: by - py * off, a: car.h });
}

// pairwise car collision: push apart, exchange momentum, damage on hard hits
export function resolveCarPairs(cars, dt) {
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const rr = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d;
      const pen = rr - d;
      const ma = a.spec.mass, mb = b.spec.mass;
      const tot = ma + mb;
      a.x -= nx * pen * (mb / tot); a.y -= ny * pen * (mb / tot);
      b.x += nx * pen * (ma / tot); b.y += ny * pen * (ma / tot);
      // relative velocity along normal
      const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
      const vn = rvx * nx + rvy * ny;
      if (vn < 0) {
        const imp = -vn;
        const jImp = imp * 0.9;
        a.vx -= nx * jImp * (mb / tot); a.vy -= ny * jImp * (mb / tot);
        b.vx += nx * jImp * (ma / tot); b.vy += ny * jImp * (ma / tot);
        if (imp > 110) {
          const dmg = imp * 0.05;
          const from = (a.driver === 'player' || b.driver === 'player') ? 'player' : 'other';
          a.damage(dmg, from === 'player' && a.driver !== 'player' ? 'player' : 'other');
          b.damage(dmg, from === 'player' && b.driver !== 'player' ? 'player' : 'other');
          if (distToCam(a) < 900 * 900) sfxCrash(imp);
          if (a.driver === 'player' || b.driver === 'player') {
            G.cam.shake = Math.min(12, G.cam.shake + imp * 0.015);
            if (G.police && (a.type === 'police' || b.type === 'police')) G.police.crime(1, a.x, a.y);
          }
        }
      }
    }
  }
}

// run-over check: fast cars kill peds they touch
export function carVsPeds(car, peds, dt) {
  if (car.dead) return;
  const spd = car.speed;
  for (const p of peds) {
    if (p.state === 'dead') continue;
    const dx = p.x - car.x, dy = p.y - car.y;
    const rr = car.r + 5;
    if (dx * dx + dy * dy < rr * rr) {
      if (spd > 90) {
        p.kill();
        car.damage(4, 'other');
        if (car.driver === 'player' && G.police) G.police.crime(2, p.x, p.y);
        G.parts.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.5, max: 0.5, type: 'blood', r: 5 });
      } else if (spd > 30) {
        p.x += dx * 0.4; p.y += dy * 0.4;
        p.panic(4);
      }
    }
  }
}

// ---------------------------------------------------------------- drawing
export function drawCar(c, car) {
  const w = car.w, h = car.hh * 2;
  c.save();
  c.translate(car.x, car.y);
  c.rotate(car.h);

  // shadow
  c.fillStyle = 'rgba(0,0,0,0.4)';
  rrect(c, -w / 2 + 3, -h / 2 + 4, w, h, 6);
  c.fill();

  const dead = car.dead;
  const body = dead ? '#1c1a18' : car.color;
  // wheels
  c.fillStyle = '#0a0a0c';
  const steerW = car.ctrl.steer * 0.45;
  c.save(); c.translate(w * 0.28, -h / 2 - 1); c.rotate(steerW); c.fillRect(-6, -2.6, 12, 5.2); c.restore();
  c.save(); c.translate(w * 0.28, h / 2 + 1); c.rotate(steerW); c.fillRect(-6, -2.6, 12, 5.2); c.restore();
  c.fillRect(-w * 0.30, -h / 2 - 1, 12, 5.2);
  c.fillRect(-w * 0.30, h / 2 + 1, 12, 5.2);

  // body
  c.fillStyle = body;
  rrect(c, -w / 2, -h / 2, w, h, 5);
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.5)';
  c.lineWidth = 1;
  rrect(c, -w / 2, -h / 2, w, h, 5);
  c.stroke();

  // hood shading
  c.fillStyle = 'rgba(255,255,255,0.10)';
  rrect(c, -w / 2 + 2, -h / 2 + 2, w - 4, 4, 2);
  c.fill();

  if (!dead) {
    // cabin / windows
    c.fillStyle = 'rgba(10,14,24,0.92)';
    if (car.type === 'bus') {
      c.fillRect(-w / 2 + 6, -h / 2 + 4, w - 16, h - 8);
      c.fillStyle = 'rgba(140,180,220,0.25)';
      for (let k = 0; k < 4; k++) c.fillRect(-w / 2 + 10 + k * 14, -h / 2 + 6, 9, h - 12);
    } else {
      c.fillRect(w * 0.02, -h / 2 + 3.5, w * 0.24, h - 7);
      c.fillStyle = 'rgba(120,160,200,0.30)';
      c.fillRect(w * 0.05, -h / 2 + 4.5, w * 0.17, h - 9);
    }

    // type details
    if (car.type === 'cabbie') {
      c.fillStyle = '#111';
      for (let k = 0; k < 5; k++) {
        c.fillRect(-w * 0.4 + k * 7, -h / 2 + 1, 4, 3);
        c.fillRect(-w * 0.4 + k * 7 + 3, h / 2 - 4, 4, 3);
      }
      c.fillStyle = '#f4c21c';
      c.fillRect(w / 2 - 8, -4, 6, 8);
    }
    if (car.type === 'police') {
      c.fillStyle = '#10131c';
      c.fillRect(-w * 0.1, -h / 2, w * 0.28, h);       // black doors
      const fl = Math.floor(car.sirenFlash * 6) % 2 === 0;
      c.fillStyle = fl ? '#ff3040' : '#3a0a12';
      c.fillRect(-w * 0.06, -h / 2 - 3, 7, 5);
      c.fillStyle = fl ? '#2a3cff' : '#0a1440';
      c.fillRect(-w * 0.06, h / 2 - 2, 7, 5);
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.font = 'bold 5px sans-serif';
      c.save(); c.rotate(Math.PI / 2); c.fillText('VCPD', -10, -w * 0.06); c.restore();
    }
    // turn signals from the traffic AI
    if (car.ai && car.ai.blink && !dead) {
      const on = Math.floor(performance.now() / 220) % 2 === 0;
      if (on) {
        c.fillStyle = '#ffb200';
        const side = car.ai.blink;
        c.fillRect(w / 2 - 5, side * (h / 2 - 2) - 1.5, 4, 3);
        c.fillRect(-w / 2 + 1, side * (h / 2 - 2) - 1.5, 4, 3);
      }
    }
    if (car.type === 'phantom') {
      // truck: cab + long bed
      c.fillStyle = 'rgba(10,12,18,0.9)';
      c.fillRect(w * 0.06, -h / 2 + 4, w * 0.16, h - 8);        // cab glass
      c.fillStyle = 'rgba(0,0,0,0.4)';
      c.fillRect(-w * 0.46, -h / 2 + 3.5, w * 0.5, h - 7);      // bed
      c.strokeStyle = 'rgba(255,255,255,0.14)';
      c.strokeRect(-w * 0.46, -h / 2 + 3.5, w * 0.5, h - 7);
    }
    if (car.type === 'blade') {
      // lowrider: racing stripe + gold trim
      c.fillStyle = '#ffd24a';
      c.fillRect(-w / 2, -1.4, w, 2.8);
      c.fillStyle = 'rgba(255,255,255,0.22)';
      c.fillRect(w * 0.1, -h / 2 + 4, 8, h - 8);
    }
    if (car.type === 'van') {
      c.fillStyle = 'rgba(255,255,255,0.2)';
      c.fillRect(-w * 0.42, -h / 2 + 3, w * 0.16, h - 6);
    }

    // lights
    c.fillStyle = '#ffe9a8';
    c.fillRect(w / 2 - 3, -h / 2 + 2, 3, 4);
    c.fillRect(w / 2 - 3, h / 2 - 6, 3, 4);
    c.fillStyle = car.ctrl.throttle < 0 ? '#ff5040' : '#7a1410';
    c.fillRect(-w / 2, -h / 2 + 2, 2.5, 4);
    c.fillRect(-w / 2, h / 2 - 6, 2.5, 4);
  } else {
    // charred wreck
    c.fillStyle = 'rgba(0,0,0,0.55)';
    rrect(c, -w / 2 + 2, -h / 2 + 2, w - 4, h - 4, 4);
    c.fill();
    c.strokeStyle = '#332e28';
    rrect(c, -w / 2 + 1, -h / 2 + 1, w - 2, h - 2, 4);
    c.stroke();
  }

  // damage scratches
  if (!dead && car.hp < car.maxHp * 0.65) {
    c.fillStyle = 'rgba(20,16,12,0.5)';
    c.fillRect(-w * 0.2, -h / 2 + 1, 8, 3);
    if (car.hp < car.maxHp * 0.35) c.fillRect(w * 0.1, h / 2 - 4, 10, 3);
  }
  c.restore();
}

function rrect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
