// ============================================================================
// VICE PALMS — fx.js
// Transient effects: particles (smoke/fire/sparks/blood/debris/water), skid
// marks, blood pools, floating score texts, screen flash/shake requests.
// Kept tiny and pooled by simple array compaction — cheap at 60 fps.
// ============================================================================

import { TAU } from './util.js';

const MAX_PARTICLES = 900;
const MAX_SKIDS = 260;
const MAX_BLOOD = 90;

export class FX {
  constructor(game) {
    this.game = game;
    this.particles = [];   // {x,y,vx,vy,life,max,size,grow,color,kind}
    this.skids = [];       // {x0,y0,x1,y1,life,max,alpha}
    this.blood = [];       // {x,y,r,life,max}
    this.texts = [];       // {x,y,vy,life,max,text,color,size}
    this.flashAlpha = 0;   // explosion flash overlay
    this.shake = 0;        // camera shake magnitude (world units)
  }

  requestShake(n) {
    this.shake = Math.min(26, this.shake + n);
  }

  requestFlash(a) {
    this.flashAlpha = Math.min(1, Math.max(this.flashAlpha, a));
  }

  particle(x, y, vx, vy, life, size, color, kind = 'smoke', grow = 0) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({ x, y, vx, vy, life, max: life, size, color, kind, grow });
  }

  smoke(x, y, big = false) {
    const s = big ? 1.6 : 0.9;
    this.particle(
      x + (Math.random() - 0.5) * 0.8, y + (Math.random() - 0.5) * 0.8,
      (Math.random() - 0.5) * 1.2, -1.4 - Math.random() * 1.6,
      1.1 + Math.random() * 0.9, 0.7 * s, '#3a3f4d', 'smoke', 2.6 * s,
    );
  }

  fire(x, y) {
    this.particle(
      x + (Math.random() - 0.5) * 0.9, y + (Math.random() - 0.5) * 0.9,
      (Math.random() - 0.5) * 1.6, -2.2 - Math.random() * 2.4,
      0.5 + Math.random() * 0.35, 0.62, Math.random() < 0.5 ? '#ff9b2e' : '#ff5a26', 'fire', 1.2,
    );
  }

  spark(x, y, n = 5) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = 4 + Math.random() * 9;
      this.particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        0.22 + Math.random() * 0.25, 0.16, '#ffd75e', 'spark', 0);
    }
  }

  bloodBurst(x, y, n = 7) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = 1.5 + Math.random() * 5;
      this.particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        0.3 + Math.random() * 0.3, 0.22, '#b3122e', 'blood', 0);
    }
    this.addBlood(x, y, 0.55 + Math.random() * 0.5);
  }

  addBlood(x, y, r) {
    if (this.blood.length >= MAX_BLOOD) this.blood.shift();
    this.blood.push({ x, y, r, life: 40, max: 40 });
  }

  debris(x, y, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = 3 + Math.random() * 11;
      this.particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        0.7 + Math.random() * 0.8, 0.28, '#565b6b', 'debris', 0.4);
    }
  }

  waterSpray(x, y) {
    this.particle(x, y, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3,
      0.4, 0.3, '#8fd9ff', 'water', 0.6);
  }

  muzzle(x, y) {
    this.particle(x, y, 0, 0, 0.06, 0.85, '#fff3b0', 'muzzle', 0.5);
  }

  explosion(x, y) {
    // Fireball core + smoke ring + debris + sparks.
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * TAU;
      const sp = 2 + Math.random() * 8;
      this.particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        0.5 + Math.random() * 0.6, 1.6 + Math.random() * 1.4,
        Math.random() < 0.55 ? '#ff8b2e' : '#ffd23c', 'fire', 2.4);
    }
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * TAU;
      const sp = 1 + Math.random() * 5;
      this.particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp,
        1.6 + Math.random() * 1.6, 1.8, '#2c2f3a', 'smoke', 3.2);
    }
    this.debris(x, y, 16);
    this.spark(x, y, 22);
    this.requestShake(16);
    this.requestFlash(0.8);
    if (this.game.audio) this.game.audio.explosion();
  }

  skid(x0, y0, x1, y1, alpha = 0.5) {
    if (this.skids.length >= MAX_SKIDS) this.skids.shift();
    this.skids.push({ x0, y0, x1, y1, life: 9, max: 9, alpha });
  }

  text(x, y, str, color = '#7dffa8', size = 15) {
    this.texts.push({ x, y, vy: -3.2, life: 1.4, max: 1.4, text: str, color, size });
  }

  update(dt) {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'smoke') { p.vx *= 1 - 1.2 * dt; p.vy *= 1 - 0.6 * dt; }
      else if (p.kind === 'fire') { p.vx *= 1 - 2.4 * dt; p.vy *= 1 - 2.0 * dt; }
      else if (p.kind === 'spark' || p.kind === 'debris' || p.kind === 'blood') { p.vy += 14 * dt; p.vx *= 1 - 1.8 * dt; }
      if (p.grow) p.size += p.grow * dt;
    }
    const sk = this.skids;
    for (let i = sk.length - 1; i >= 0; i--) {
      sk[i].life -= dt;
      if (sk[i].life <= 0) { sk[i] = sk[sk.length - 1]; sk.pop(); }
    }
    const bl = this.blood;
    for (let i = bl.length - 1; i >= 0; i--) {
      bl[i].life -= dt;
      if (bl[i].life <= 0) { bl[i] = bl[bl.length - 1]; bl.pop(); }
    }
    const tx = this.texts;
    for (let i = tx.length - 1; i >= 0; i--) {
      const t = tx[i];
      t.life -= dt;
      t.y += t.vy * dt;
      if (t.life <= 0) { tx[i] = tx[tx.length - 1]; tx.pop(); }
    }
    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.2);
    this.shake = Math.max(0, this.shake - this.shake * dt * 5.5 - dt * 2);
  }

  // Flat decals under everything else.
  drawDecals(ctx, cam) {
    // Skid marks
    ctx.lineCap = 'round';
    for (const s of this.skids) {
      const a = (s.life / s.max) * s.alpha;
      ctx.strokeStyle = `rgba(10,10,14,${a})`;
      ctx.lineWidth = 0.28;
      ctx.beginPath();
      ctx.moveTo(s.x0, s.y0);
      ctx.lineTo(s.x1, s.y1);
      ctx.stroke();
    }
    // Blood pools
    for (const b of this.blood) {
      const a = Math.min(0.75, (b.life / b.max) * 1.6);
      ctx.fillStyle = `rgba(96,8,20,${a})`;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, b.r, b.r * 0.7, 0, 0, TAU);
      ctx.fill();
    }
  }

  // World-space particles above entities.
  drawParticles(ctx, cam) {
    for (const p of this.particles) {
      const t = p.life / p.max;
      let alpha = t;
      if (p.kind === 'smoke') alpha = t * 0.4;
      else if (p.kind === 'fire') alpha = t * 0.95;
      else if (p.kind === 'muzzle') alpha = t;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (p.kind === 'spark' ? t + 0.3 : 1), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const t of this.texts) {
      const a = Math.min(1, t.life / t.max * 1.8);
      ctx.globalAlpha = a;
      ctx.font = `700 ${t.size}px "Consolas", monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = t.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.lineWidth = 3;
      const sx = 640 + (t.x - cam.x) * cam.z * 7.2;
      const sy = 360 + (t.y - cam.y) * cam.z * 7.2;
      ctx.strokeText(t.text, sx, sy);
      ctx.fillText(t.text, sx, sy);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }
}
