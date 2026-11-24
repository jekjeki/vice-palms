// Vice Palms — 8 car types, arcade physics, damage + explosions
import { S, crime, addParticles, addDecal, wasted } from './game.js';

export const CAR_TYPES = {
  compact: { name: 'Blista',   w: 40, h: 22, acc: 260, max: 300, turn: 2.6, hp: 85,  colors: ['#c94f7c', '#5fa8d3', '#d3b35f'] },
  sedan:   { name: 'Kultur',   w: 46, h: 23, acc: 240, max: 330, turn: 2.3, hp: 100, colors: ['#3e4a5f', '#7a3e3e', '#3e6b52'] },
  coupe:   { name: 'Stallion', w: 44, h: 22, acc: 290, max: 370, turn: 2.5, hp: 90,  colors: ['#e0e0e0', '#b3402f', '#2f4fb3'] },
  taxi:    { name: 'Cabbie',   w: 46, h: 24, acc: 230, max: 310, turn: 2.2, hp: 105, colors: ['#e8b820'] },
  sport:   { name: 'Infernus', w: 48, h: 21, acc: 360, max: 440, turn: 2.8, hp: 80,  colors: ['#ff3b3b', '#22e6ff', '#ffd23e'] },
  pickup:  { name: 'Rancher',  w: 50, h: 26, acc: 220, max: 300, turn: 2.0, hp: 120, colors: ['#5b4a33', '#44503f', '#6e3b2c'] },
  van:     { name: 'Moonbeam', w: 52, h: 26, acc: 190, max: 270, turn: 1.8, hp: 130, colors: ['#9a8f7a', '#6f7f95'] },
  bus:     { name: 'Coach',    w: 72, h: 27, acc: 150, max: 240, turn: 1.4, hp: 170, colors: ['#c7c2b4'] },
};
export const TYPE_KEYS = Object.keys(CAR_TYPES);

export class Car {
  constructor(x, y, a, typeKey, color) {
    const t = CAR_TYPES[typeKey] || CAR_TYPES.sedan;
    this.type = typeKey; this.t = t;
    this.x = x; this.y = y; this.a = a || 0;
    this.spd = 0; this.vx = 0; this.vy = 0;
    this.color = color || t.colors[(Math.random() * t.colors.length) | 0];
    this.hp = t.hp; this.maxHp = t.hp;
    this.driver = 'none';       // none | player | traffic | cop
    this.dead = false; this.burnT = 0; this.smokeT = 0;
    this.th = 0; this.st = 0; this.br = 0;
    this.w = t.w; this.h = t.h;
  }
  get maxSpd() { return this.t.max; }

  update(dt) {
    if (this.dead) return;
    const t = this.t;
    // arcade longitudinal
    this.spd += this.th * t.acc * dt;
    if (this.br > 0) {
      const dec = 520 * dt * this.br;
      if (this.spd > 0) this.spd = Math.max(0, this.spd - dec);
      else this.spd = Math.min(0, this.spd + dec);
    }
    // drag + rolling friction
    this.spd -= this.spd * 0.6 * dt;
    if (Math.abs(this.th) < 0.05) this.spd -= Math.sign(this.spd) * 60 * dt;
    this.spd = Math.max(-t.max * 0.4, Math.min(t.max, this.spd));
    // steering scales with speed (and reverses in reverse)
    const sf = Math.min(1, Math.abs(this.spd) / 120);
    this.a += this.st * t.turn * dt * sf * Math.sign(this.spd || 1);
    // velocity blends toward heading (grip)
    const hx = Math.cos(this.a) * this.spd, hy = Math.sin(this.a) * this.spd;
    const grip = 1 - Math.exp(-dt * 8);
    this.vx += (hx - this.vx) * grip;
    this.vy += (hy - this.vy) * grip;
    this.x += this.vx * dt; this.y += this.vy * dt;

    // world collision — bounce + damage
    const hits = S.world.resolveCircle(this, (this.w + this.h) / 4);
    if (hits.length) {
      const impact = Math.abs(this.spd);
      if (impact > 200) this.damage(impact * 0.05, 'wall');
      this.spd *= 0.55; this.vx *= 0.5; this.vy *= 0.5;
    }
    // fire/smoke state
    if (this.hp < this.maxHp * 0.3) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.08;
        addParticles(this.x, this.y, 1, { c: '#555a66', r: 7, life: 0.9, spd: 30 });
      }
    }
    if (this.hp <= 0 && !this.dead) this.explode();
  }

  damage(amt, from) {
    if (this.dead) return;
    this.hp -= amt;
    if (this.hp <= 0) this.explode();
  }

  explode() {
    if (this.dead) return;
    this.dead = true; this.hp = 0; this.burnT = 4;
    explodeAt(S, this.x, this.y, 1);
  }

  // local-frame point test
  contains(px, py) {
    const c = Math.cos(-this.a), s2 = Math.sin(-this.a);
    const dx = px - this.x, dy = py - this.y;
    const lx = dx * c - dy * s2, ly = dx * s2 + dy * c;
    return Math.abs(lx) < this.w / 2 + 3 && Math.abs(ly) < this.h / 2 + 3;
  }
}

// ---- shared explosion -------------------------------------------------------
export function explodeAt(s, x, y, power) {
  s.flash = Math.min(1, s.flash + 0.55 * power);
  s.shake = Math.min(18, s.shake + 9 * power);
  addParticles(x, y, 26, { c: '#ff9a2e', r: 12, life: 0.8, spd: 260, fire: true });
  addParticles(x, y, 14, { c: '#ffd23e', r: 8, life: 0.5, spd: 180, fire: true });
  addParticles(x, y, 16, { c: '#3a3a42', r: 14, life: 1.6, spd: 90 });
  addDecal(x, y, 64 * power, 'rgba(12,10,10,0.5)');
  s.audio.explosion();
  const R = 150 * power;
  // player
  const p = s.player;
  const pd = Math.hypot(p.cx() - x, p.cy() - y);
  if (pd < R && p.alive()) {
    const dmg = 80 * (1 - pd / R);
    if (p.inCar) damageCar(p.inCar, dmg, 'blast');
    p.hurt(dmg);
  }
  // peds
  for (const q of s.peds.list) {
    if (!q.dead && Math.hypot(q.x - x, q.y - y) < R * 0.8) q.kill();
  }
  // chain reaction
  const all = [...s.traffic.cars, ...s.police.cops];
  if (p.inCar) all.push(p.inCar);
  for (const c of all) {
    if (c.dead) continue;
    const d = Math.hypot(c.x - x, c.y - y);
    if (d > 8 && d < R) damageCar(c, 55 * (1 - d / R) * power, 'blast');
  }
}

export function damageCar(c, amt, from) {
  if (c.dead) return;
  c.hp -= amt;
  if (c.driver === 'traffic' && from === 'player') crime(0.2);
  if (c.driver === 'cop' && from === 'player') crime(0.6);
  if (c.hp <= 0) c.explode();
  if (from === 'player' && c.driver === 'player') {
    // player's own ride took the hit
    if (c.hp < -20) wasted();
  }
}
