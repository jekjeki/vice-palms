// weather.js — the Vice Palms marine layer: rolling rain fronts, lightning
// over the water, and a road-wetness value the renderer and the tire physics
// both read. Deterministic from the world seed.

import { CFG } from './config.js';
import { G, RNG, clamp } from './util.js';
import { sfxThunder } from './audio.js';

export class Weather {
  constructor(seed) {
    this.rng = new RNG(seed ^ 0x0fade);
    // phase into a rain cycle so games start at different moods
    this.cycle = this.rng.range(0, 120);
    this.period = 140;            // seconds per full wet/dry cycle
    this.rain = 0;                // 0..1 current intensity
    this.wet = 0.25;              // 0..1 road wetness (lags the rain)
    this.drops = [];              // screen-space rain streaks
    this.boltT = 0;               // lightning cooldown
    this.bolt = null;             // {x,y,t} world-space strike
    this.dropBudget = 0;
  }

  update(dt) {
    this.cycle += dt;
    const phase = (this.cycle % this.period) / this.period;
    // two wet fronts per cycle, shaped like a marine squall
    const front = Math.max(
      Math.exp(-Math.pow((phase - 0.25) * 9, 2)),
      Math.exp(-Math.pow((phase - 0.75) * 7, 2)) * 0.8
    );
    this.rain = clamp(front, 0, 1);
    // wetness rises fast in rain, dries slowly out of it
    if (this.rain > 0.05) this.wet = clamp(this.wet + dt * 0.18, 0, 1);
    else this.wet = clamp(this.wet - dt * 0.012, 0, 1);

    // spawn rain streaks (screen space, drawn by drawRain)
    if (this.rain > 0.03) {
      this.dropBudget += this.rain * 620 * dt;
      while (this.dropBudget >= 1 && this.drops.length < 260) {
        this.dropBudget -= 1;
        this.drops.push({
          x: Math.random() * (G.w + 120) - 60,
          y: -20,
          spd: 820 + Math.random() * 380,
          len: 14 + Math.random() * 14,
        });
      }
    }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.y += d.spd * dt;
      d.x -= d.spd * 0.16 * dt;      // slanted by the sea breeze
      if (d.y > G.h + 24) this.drops.splice(i, 1);
    }

    // lightning only in heavy rain, over the ocean side
    if (this.rain > 0.55) {
      this.boltT -= dt;
      if (this.boltT <= 0) {
        this.boltT = 14 + this.rng.range(0, 22);
        this.strike();
      }
    } else {
      this.boltT = Math.max(this.boltT, 4);
    }
    if (this.bolt) {
      this.bolt.t -= dt;
      if (this.bolt.t <= 0) this.bolt = null;
    }
  }

  strike() {
    const cam = G.cam;
    const x = cam.x + this.rng.range(-600, 600);
    const y = cam.y + this.rng.range(-420, 420);
    this.bolt = { x, y, t: 0.32, branches: this.makeBranches(x, y) };
    G.cam.flash = Math.max(G.cam.flash || 0, 0.9);
    sfxThunder();
  }

  makeBranches(x, y) {
    const branches = [];
    for (let b = 0; b < 3; b++) {
      const pts = [{ x, y }];
      let bx = x, by = y;
      for (let k = 0; k < 7; k++) {
        bx += this.rng.range(-46, 46);
        by += this.rng.range(28, 74);
        pts.push({ x: bx, y: by });
      }
      branches.push(pts);
    }
    return branches;
  }

  // tire grip multiplier — wet asphalt is slippery asphalt
  gripMul() {
    return 1 - this.wet * 0.32;
  }

  // ------------------------------------------------------------- drawing
  drawRain(c) {
    if (this.drops.length === 0) return;
    c.save();
    c.strokeStyle = 'rgba(170,200,255,0.30)';
    c.lineWidth = 1.4;
    c.beginPath();
    for (const d of this.drops) {
      c.moveTo(d.x, d.y);
      c.lineTo(d.x + d.len * 0.16, d.y - d.len);
    }
    c.stroke();
    c.restore();
  }

  drawBolt(c) {
    if (!this.bolt) return;
    const a = clamp(this.bolt.t / 0.32, 0, 1);
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const pts of this.bolt.branches) {
      c.strokeStyle = `rgba(210,225,255,${a * 0.95})`;
      c.lineWidth = 3.4;
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length; k++) c.lineTo(pts[k].x, pts[k].y);
      c.stroke();
      c.strokeStyle = `rgba(140,170,255,${a * 0.4})`;
      c.lineWidth = 9;
      c.stroke();
    }
    // sea-level splash glow
    const g = c.createRadialGradient(this.bolt.x, this.bolt.y, 2, this.bolt.x, this.bolt.y, 90);
    g.addColorStop(0, `rgba(200,220,255,${a * 0.5})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(this.bolt.x, this.bolt.y, 90, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  // extra road sheen from wetness — drawn over the roads in world space
  drawWetSheen(c, view) {
    if (this.wet < 0.08) return;
    const a = this.wet * 0.06;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = `rgba(110,150,220,${a})`;
    for (let i = 0; i <= CFG.COLS; i++) {
      const x = roadLineX(i);
      if (x + CFG.RW / 2 < view.x0 || x - CFG.RW / 2 > view.x1) continue;
      c.fillRect(x - CFG.RW / 2, view.y0, CFG.RW, view.y1 - view.y0);
    }
    for (let j = 0; j <= CFG.ROWS; j++) {
      const y = roadLineY(j);
      if (y + CFG.RW / 2 < view.y0 || y - CFG.RW / 2 > view.y1) continue;
      c.fillRect(view.x0, y - CFG.RW / 2, view.x1 - view.x0, CFG.RW);
    }
    c.restore();
  }
}

import { roadX, roadY } from './config.js';
function roadLineX(i) { return roadX(i); }
function roadLineY(j) { return roadY(j); }
