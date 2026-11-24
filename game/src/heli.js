// heli.js — the VCPD air unit. Shows up at four stars, hunts with a
// searchlight, and can be shot down if you are feeling ambitious. Two at
// five stars. Drawn with a ground shadow and a lit body above the streets.

import { CFG } from './config.js';
import { G, RNG, clamp, dist, say } from './util.js';
import { rotorOn, rotorUpdate, rotorOff, sfxBoom } from './audio.js';
import { addStat } from './stats.js';

export class Heli {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.alt = 420;              // visual altitude (px above ground)
    this.hp = 140;
    this.dead = false;
    this.fallT = 0;
    this.orbA = Math.random() * Math.PI * 2;
    this.rotorT = Math.random() * 10;
    this.spot = { x, y };
    this.leave = false;
    this.gunT = 2;
  }

  hurt(n, from) {
    if (this.dead || this.leave) return;
    this.hp -= n;
    if (this.hp <= 0) {
      this.dead = true;
      this.fallT = 0;
    }
  }

  update(dt) {
    const P = G.player;
    this.rotorT += dt * 26;
    if (this.dead) {
      // death spiral
      this.fallT += dt;
      this.alt -= (this.alt * 0.9 + 60) * dt;
      this.x += Math.sin(this.fallT * 6) * 120 * dt;
      this.y += Math.cos(this.fallT * 5) * 90 * dt + 60 * dt;
      if (this.alt <= 26) {
        // impact
        G.booms.push({ x: this.x, y: this.y, t: 0, r: 190 });
        sfxBoom(1.4);
        for (let i = 0; i < 18; i++) {
          const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 180;
          G.parts.push({ x: this.x, y: this.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.8, max: 0.8, type: 'fire', r: 10 });
        }
        for (const c of G.cars) {
          if (!c.dead && dist(c.x, c.y, this.x, this.y) < 160) c.damage(70, 'other');
        }
        if (P && dist(P.x, P.y, this.x, this.y) < 140 && !P.car) P.hurt(55, 'boom');
        if (this.lastHit === 'player') addStat('copsDowned');
        this.gone = true;
      }
      return;
    }

    if (this.leave) {
      this.alt += 220 * dt;
      this.x += 140 * dt;
      if (this.alt > 640) this.gone = true;
      return;
    }

    if (!P) return;
    // orbit the target with an offset that drifts, like a real air unit
    this.orbA += dt * 0.5;
    const tx = P.x + Math.cos(this.orbA) * 170;
    const ty = P.y + Math.sin(this.orbA) * 170;
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy) || 1;
    const spd = clamp(d * 1.4, 0, 240);
    this.x += (dx / d) * spd * dt;
    this.y += (dy / d) * spd * dt;
    const altTarget = 260 + Math.sin(this.orbA * 2.3) * 30;
    this.alt += clamp(altTarget - this.alt, -120 * dt, 120 * dt);

    // searchlight lags the target, swaying
    this.spot.x += (P.x + Math.sin(this.orbA * 1.7) * 34 - this.spot.x) * clamp(dt * 2.2, 0, 1);
    this.spot.y += (P.y + Math.cos(this.orbA * 1.3) * 34 - this.spot.y) * clamp(dt * 2.2, 0, 1);

    // door gunner at five stars — suppressive bursts, generous spread
    if ((G.police ? G.police.stars : 0) >= 5) {
      this.gunT -= dt;
      if (this.gunT <= 0 && P && !P.car) {
        this.gunT = 2.6 + Math.random();
        for (let k = 0; k < 4; k++) {
          const a = Math.atan2(P.y - this.spot.y, P.x - this.spot.x) + (Math.random() - 0.5) * 0.3;
          G.bullets.push({
            x: this.spot.x, y: this.spot.y,
            vx: Math.cos(a) * 640, vy: Math.sin(a) * 640,
            life: 0.4, from: 'cop',
          });
        }
      }
    }
  }

  shadowPos() { return { x: this.x, y: this.y }; }
  bodyPos() { return { x: this.x, y: this.y - this.alt * 0.22 }; }
}

export class Helis {
  constructor(seed) {
    this.rng = new RNG(seed ^ 0x3e11);
    this.list = [];
    this.spawnCd = 4;
  }

  update(dt) {
    const stars = G.police ? G.police.stars : 0;
    const want = stars >= 5 ? 2 : stars >= 4 ? 1 : 0;
    this.spawnCd -= dt;
    const active = this.list.filter((h) => !h.gone && !h.leave);
    if (active.length < want && this.spawnCd <= 0) {
      this.spawnCd = 10;
      // arrives from over the ocean
      const cam = G.cam;
      this.list.push(new Heli(cam.x - 700, cam.y - 520));
      say('AIR ONE: Suspect spotlighted. Do not make this weird.', 3.2);
    }
    if (want === 0) {
      for (const h of this.list) if (!h.dead && !h.gone) h.leave = true;
    }
    let anyLive = false;
    for (const h of this.list) {
      h.update(dt);
      if (!h.gone) anyLive = true;
    }
    // rotor audio follows the nearest live heli
    let nearest = 1e9;
    for (const h of this.list) {
      if (h.gone || h.dead) continue;
      nearest = Math.min(nearest, dist(h.x, h.y, G.cam.x, G.cam.y));
    }
    if (anyLive && nearest < 1e8) {
      rotorOn();
      rotorUpdate(clamp(1 - nearest / 900, 0.05, 1));
    } else {
      rotorOff();
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (this.list[i].gone) this.list.splice(i, 1);
    }
  }

  clear() {
    this.list.length = 0;
    rotorOff();
  }
}
