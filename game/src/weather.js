// weather.js — coastal night rain: drifting intensity, screen-space streaks, thunder,
// wet-road feedback and reduced tire grip while pouring.
import { CFG } from './config.js';
import { rand, clamp } from './util.js';

export class Weather {
  constructor(game, seed = 7) {
    this.game = game;
    this.t = 0;
    this.intensity = 0;        // 0..1 current rain strength
    this.target = 0;
    this.drops = [];
    this.thunderT = rand(6, 14);
    this.flashT = 0;
    this.cycle = 47;           // seconds between rain waves
    this.phase = seed % this.cycle;
  }

  // target intensity follows a slow deterministic cycle
  desired() {
    const ph = ((this.game.t + this.phase) % this.cycle) / this.cycle;
    // two rain waves per cycle, dry spells between
    const wave = Math.sin(ph * Math.PI * 2) * 0.5 + Math.sin(ph * Math.PI * 6) * 0.2;
    return clamp(wave * 1.35, 0, 1);
  }

  update(dt) {
    this.t += dt;
    this.target = this.desired();
    // ramp intensity toward target
    const rate = this.target > this.intensity ? 0.08 : 0.05;
    this.intensity += clamp(this.target - this.intensity, -rate * dt, rate * dt);

    // maintain drop pool in screen space
    const want = Math.floor(this.intensity * 220);
    while (this.drops.length < want) {
      this.drops.push({ x: rand(-40, CFG.VIEW_W + 40), y: rand(-40, CFG.VIEW_H), sp: rand(700, 1100), len: rand(10, 22), drift: rand(-60, 30) });
    }
    if (this.drops.length > want) this.drops.length = want;
    for (const d of this.drops) {
      d.y += d.sp * dt;
      d.x += d.drift * dt;
      if (d.y > CFG.VIEW_H + 30) { d.y = -20 - rand(0, 60); d.x = rand(-40, CFG.VIEW_W + 40); }
    }

    // thunder during heavy rain
    if (this.intensity > 0.55) {
      this.thunderT -= dt;
      if (this.thunderT <= 0) {
        this.thunderT = rand(8, 18);
        this.flashT = 0.35;
        // a bolt actually strikes somewhere near the camera
        const g = this.game;
        this.bolt = {
          x: g.cam.x + rand(-500, 500),
          y: g.cam.y + rand(-360, 360),
          life: 0.28,
          seed: Math.random(),
        };
        this.game.audio?.thunder?.();
        this.game.cam.shake = Math.min(CFG.SHAKE_MAX, this.game.cam.shake + 3);
      }
    }
    this.flashT = Math.max(0, this.flashT - dt);
    if (this.bolt) {
      this.bolt.life -= dt;
      if (this.bolt.life <= 0) this.bolt = null;
    }
  }

  // tire grip multiplier (applied inside cars.js physics)
  grip() { return 1 - this.intensity * 0.14; }

  // screen-space overlays called by render after the world pass
  draw(ctx) {
    if (this.bolt) this.drawBolt(ctx);
    if (this.intensity > 0.02) {
      ctx.save();
      ctx.strokeStyle = 'rgba(170,200,240,' + (0.10 + this.intensity * 0.18) + ')';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (const d of this.drops) {
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.drift * 0.02, d.y + d.len * (0.6 + this.intensity * 0.6));
      }
      ctx.stroke();
      // haze
      ctx.fillStyle = 'rgba(120,150,200,' + this.intensity * 0.07 + ')';
      ctx.fillRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);
      ctx.restore();
    }
    if (this.flashT > 0) {
      const a = this.flashT * 0.5 * Math.random();
      ctx.fillStyle = 'rgba(210,225,255,' + a + ')';
      ctx.fillRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);
    }
  }

  // jagged bolt anchored above the strike point, drawn in world space
  drawBolt(ctx) {
    const b = this.bolt;
    const a = clamp(b.life / 0.28, 0, 1);
    const g = this.game;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(220,230,255,' + 0.85 * a + ')';
    ctx.shadowColor = 'rgba(160,190,255,' + 0.9 * a + ')';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    let x = b.x, y = b.y - 520;
    ctx.moveTo(x, y);
    // 6 jagged segments down to the strike point
    for (let i = 0; i < 6; i++) {
      x += Math.sin((i + 1) * 3.7 + b.seed * 10) * 34;
      y += 520 / 6;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    // ground scorch glow
    const grd = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, 60);
    grd.addColorStop(0, 'rgba(200,220,255,' + 0.5 * a + ')');
    grd.addColorStop(1, 'rgba(200,220,255,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(b.x, b.y, 60, 0, TAU); ctx.fill();
    ctx.restore();
  }

  serialize() { return { t: this.t, phase: this.phase }; }
  deserialize(d) { if (d) { this.t = d.t ?? 0; this.phase = d.phase ?? this.phase; } }
}
