// peds.js — pedestrians: wander the sidewalks, soak up the neon, and run
// screaming from gunfire, explosions and curb-hopping maniacs.

import { CFG } from './config.js';
import { G, RNG, clamp, dist, angNorm } from './util.js';
import { addStat } from './stats.js';

const SKINS = ['#c99b76', '#8a5a3b', '#e8b98f', '#6b4226', '#d9a06b'];
const SHIRTS = ['#ff6f9c', '#6fd8ff', '#ffd76f', '#9cff6f', '#c46fff', '#ff8f5c', '#e8e6e3', '#5c6fff'];
const PANTS = ['#2a2a3a', '#3a2a2a', '#22343a', '#3a3a2a'];
const SWIM = ['#ff6f9c', '#ffd76f', '#6fd8ff', '#18e0b4'];

export class Ped {
  constructor(x, y, rng) {
    this.x = x; this.y = y;
    this.h = rng ? rng.range(0, Math.PI * 2) : Math.random() * Math.PI * 2;
    // street casting: joggers, beach walkers, drunks, and everyone else
    const roll = rng ? rng.f() : Math.random();
    this.role = roll < 0.14 ? 'jogger' : roll < 0.24 ? 'drunk' : roll < 0.36 ? 'beach' : 'walker';
    this.skin = rng ? rng.pick(SKINS) : SKINS[(Math.random() * SKINS.length) | 0];
    this.shirt = this.role === 'beach'
      ? (rng ? rng.pick(SWIM) : SWIRL())
      : (rng ? rng.pick(SHIRTS) : SHIRTS[(Math.random() * SHIRTS.length) | 0]);
    this.pants = this.role === 'jogger' ? '#e8e6e3' : (rng ? rng.pick(PANTS) : PANTS[(Math.random() * PANTS.length) | 0]);
    const base = this.role === 'jogger' ? 96 : this.role === 'drunk' ? 26 : 34;
    this.speed = base + (rng ? rng.f() : Math.random()) * (this.role === 'jogger' ? 40 : 16);
    this.state = 'walk';
    this.stateT = 0;
    this.walkT = Math.random() * 6;
    this.deadT = 0;
    this.panicT = 0;
    this.emote = 0;      // "!" bubble timer
    this.threat = null;  // {x,y} to flee from
    this.tx = x; this.ty = y;
    this.pickTarget();
  }

  pickTarget() {
    // pick a nearby sidewalk-ish point to stroll toward
    const rng = Math.random;
    this.tx = this.x + (rng() - 0.5) * 260;
    this.ty = this.y + (rng() - 0.5) * 260;
  }

  panic(t = 4, threat = null) {
    this.panicT = Math.max(this.panicT, t);
    if (this.state === 'walk') {
      this.emote = 1.2;
      this.state = 'flee';
    }
    if (threat) this.threat = { x: threat.x, y: threat.y };
  }

  kill() {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.deadT = 0;
    addStat('pedsBumped', 1);
  }

  update(dt) {
    if (this.state === 'dead') {
      this.deadT += dt;
      return;
    }
    this.walkT += dt;
    this.panicT -= dt;
    this.emote -= dt;
    if (this.panicT <= 0 && this.state === 'flee') {
      this.state = 'walk';
      this.threat = null;
      this.pickTarget();
    }

    let spd = this.speed;
    let dirx, diry;
    let wobble = 0;
    if (this.role === 'drunk') wobble = Math.sin(this.walkT * 2.2) * 0.5;

    if (this.state === 'flee' && this.threat) {
      // run directly away from the threat, screaming (silently — we're muted)
      const dx = this.x - this.threat.x, dy = this.y - this.threat.y;
      const d = Math.max(0.001, Math.hypot(dx, dy));
      dirx = dx / d; diry = dy / d;
      spd = this.speed * (this.role === 'jogger' ? 2.6 : 3.4);
    } else {
      const dx = this.tx - this.x, dy = this.ty - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 12) { this.pickTarget(); return; }
      dirx = dx / d; diry = dy / d;
      if (this.role === 'drunk') {
        // drunks consult an inner compass
        const a = Math.atan2(diry, dirx) + wobble;
        dirx = Math.cos(a); diry = Math.sin(a);
      }
    }

    this.h = angNorm(Math.atan2(diry, dirx));
    this.x += dirx * spd * dt;
    this.y += diry * spd * dt;

    // collide with the world (buildings, palms, containers)
    const hit = G.world.collide(this.x, this.y, 6);
    if (hit.power > 0.01) {
      this.x = hit.x; this.y = hit.y;
      if (this.state === 'walk') this.pickTarget();
      else { // slide along the wall
        this.x += -diry * spd * dt;
        this.y += dirx * spd * dt;
      }
    }
    // stay in the map
    this.x = clamp(this.x, 20, CFG.W - 20);
    this.y = clamp(this.y, 20, CFG.H - 20);
  }
}

export class Peds {
  constructor(seed) {
    this.rng = new RNG(seed ^ 0x9ed0);
  }

  update(dt) {
    const cam = G.cam;
    let n = 0;
    for (const p of G.peds) if (p.state !== 'dead') n++;
    if (n < CFG.PEDS_N) {
      for (let k = 0; k < 2 && n < CFG.PEDS_N; k++) {
        const pt = G.world.randomSidewalkPoint(this.rng);
        const d = dist(pt.x, pt.y, cam.x, cam.y);
        if (d < 260 || d > 1100) continue;
        G.peds.push(new Ped(pt.x, pt.y, this.rng));
        n++;
      }
    }
    for (let i = G.peds.length - 1; i >= 0; i--) {
      const p = G.peds[i];
      p.update(dt);
      const d = dist(p.x, p.y, cam.x, cam.y);
      if ((p.state === 'dead' && p.deadT > 22) || d > CFG.DESPAWN_R + 200) {
        G.peds.splice(i, 1);
      }
    }
  }

  // everyone within r of (x,y) freaks out
  panicAt(x, y, r = 320) {
    for (const p of G.peds) {
      if (p.state === 'dead') continue;
      const d = dist(p.x, p.y, x, y);
      if (d < r) p.panic(4.5, { x, y });
    }
  }
}

export function drawPed(c, p) {
  c.save();
  c.translate(p.x, p.y);
  if (p.state === 'dead') {
    c.rotate(p.h);
    c.fillStyle = 'rgba(90,10,20,0.5)';
    c.beginPath(); c.ellipse(4, 0, 12, 7, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = p.shirt;
    c.beginPath(); c.ellipse(0, 0, 9, 5, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = p.skin;
    c.beginPath(); c.arc(9, 0, 3.4, 0, Math.PI * 2); c.fill();
    c.restore();
    return;
  }
  c.rotate(p.h);
  // shadow
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.beginPath(); c.ellipse(1, 2, 7, 5, 0, 0, Math.PI * 2); c.fill();
  // legs
  const step = Math.sin(p.walkT * 11) * 3.4;
  c.fillStyle = p.pants;
  c.fillRect(-2, -4 + step * 0.4, 5, 3);
  c.fillRect(-2, 1 - step * 0.4, 5, 3);
  // body
  c.fillStyle = p.shirt;
  c.beginPath(); c.ellipse(0, 0, 5.4, 4.2, 0, 0, Math.PI * 2); c.fill();
  if (p.role === 'jogger') {
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.fillRect(-2, -1, 5, 2);
  }
  if (p.role === 'beach') {
    c.fillStyle = 'rgba(0,0,0,0.25)';                 // swimwear stripe
    c.fillRect(-1.5, -4.2, 2, 8.4);
  }
  // arms
  c.fillStyle = p.skin;
  const swing = p.state === 'flee' ? step : step * 0.5;
  c.fillRect(2, -5 - swing * 0.3, 3.4, 2.4);
  c.fillRect(2, 2.6 + swing * 0.3, 3.4, 2.4);
  // head
  c.beginPath(); c.arc(1.5, 0, 3.2, 0, Math.PI * 2); c.fill();
  // hair / cap
  c.fillStyle = p.role === 'jogger' ? '#e8e6e3' : '#1c1410';
  c.beginPath(); c.arc(0.6, 0, 2.6, Math.PI * 0.4, Math.PI * 1.6); c.fill();
  c.restore();
  // rain gear: beach walkers and drunks carry umbrellas when it pours
  if (G.weather && G.weather.rain > 0.35 && (p.role === 'walker' || p.role === 'drunk')) {
    c.save();
    c.translate(-3, -10);
    c.fillStyle = p.role === 'drunk' ? '#8b5cf6' : '#ff8f5c';
    c.beginPath(); c.ellipse(0, 0, 8, 3, 0, 0, Math.PI * 2); c.fill();
    c.fillRect(0, 0, 1.4, 6);
    c.restore();
  }
  // panic emote
  if (p.emote > 0 && p.state === 'flee') {
    c.font = 'bold 13px sans-serif';
    c.textAlign = 'center';
    c.fillStyle = `rgba(255,220,80,${Math.min(1, p.emote)})`;
    c.fillText('!', p.x, p.y - 12);
    c.textAlign = 'left';
  }
}

function SWIRL() { return SWIM[(Math.random() * SWIM.length) | 0]; }
