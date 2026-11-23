// weather.js — coastal night weather: drifting rain showers, gusts that make
// the roads slick, and the occasional thunderstorm flash. Rain lowers grip a
// touch and doubles down on the wet-street look.

import { CFG } from './config.js';
import { RNG, mixSeeds } from './rng.js';
import { clamp, TAU } from './util.js';

export class Weather {
  constructor(game, seed) {
    this.game = game;
    this.rng = new RNG(mixSeeds(seed === undefined ? 77 : seed, 0x5A17));
    this.rain = 0;            // 0..1 current intensity
    this.target = 0;          // what the sky is aiming for
    this.timer = this.rng.range(20, 60);
    this.drops = [];          // screen-space raindrops
    this.windX = 0.3;
    this.windT = 0;
    this.lightning = 0;       // flash strength
    this.lightningT = this.rng.range(40, 120);
    this.thunderGap = 0.25;
    this.dripT = 0;
    this.windT2 = 0;
  }

  /** Handling multiplier: rain makes the asphalt greasy. */
  gripMult() {
    return 1 - 0.18 * this.rain;
  }

  update(dt) {
    const game = this.game;
    // shower cycle
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.rng.range(25, 70);
      this.target = this.rng.chance(0.45) ? this.rng.range(0.5, 1) : 0;
    }
    this.rain += clamp(this.target - this.rain, -dt * 0.08, dt * 0.06);

    // wind drift
    this.windT += dt;
    this.windX = 0.25 + Math.sin(this.windT * 0.2) * 0.3 + this.rain * 0.15;

    // raindrop pool: hold enough drops for the current intensity
    const want = Math.floor(Math.min(170, this.rain * 180));
    while (this.drops.length < want) {
      this.drops.push({
        x: this.rng.next() * (game.viewW + 160) - 80,
        y: this.rng.next() * game.viewH,
        v: 620 + this.rng.next() * 260,
        l: 9 + this.rng.next() * 9,
      });
    }
    if (this.drops.length > want) this.drops.length = want;

    // move drops (screen space, they streak past)
    for (const d of this.drops) {
      d.y += d.v * dt;
      d.x += this.windX * d.v * dt * 0.35;
      if (d.y > game.viewH + 20) {
        d.y = -20;
        d.x = this.rng.next() * (game.viewW + 160) - 80;
      }
      if (d.x > game.viewW + 90) d.x -= game.viewW + 180;
      if (d.x < -90) d.x += game.viewW + 180;
    }

    // rain hiss: a soft looped noise tied to intensity
    this.dripT -= dt;
    if (this.dripT <= 0 && this.rain > 0.15) {
      this.dripT = 0.55;
      game.audio.playNoise(0.6, 5200, 0.02 * this.rain, 'highpass');
    }
    // coastal wind: stronger near the water, always a little present
    this.windT2 = (this.windT2 || 0) - dt;
    if (this.windT2 <= 0) {
      this.windT2 = 1.1;
      const south = game.cam ? clamp(game.cam.y / CFG.H, 0, 1) : 0.5;
      const nearWater = south > 0.85 ? 0.05 : 0.018;
      game.audio.playNoise(1.0, 300, nearWater + this.rain * 0.02, 'lowpass');
    }

    // lightning: only during heavy rain
    this.lightning = Math.max(0, this.lightning - dt * 2.2);
    this.thunderGap -= dt;
    if (this.rain > 0.6) {
      this.lightningT -= dt;
      if (this.lightningT <= 0) {
        this.lightningT = this.rng.range(18, 55);
        this.lightning = this.rng.range(0.5, 1);
        if (this.thunderGap <= 0) {
          this.thunderGap = 1.2;
          game.audio.playNoise(1.4, 70, 0.5, 'lowpass');
          game.audio.playTone(48, 1.1, 0.35, 'sine', 30);
        }
      }
    }
  }

  /** Screen-space rain streaks, drawn last so they fall in front. */
  drawRain(ctx) {
    if (this.rain < 0.03) return;
    const a = Math.min(0.5, this.rain * 0.55);
    ctx.strokeStyle = `rgba(170, 200, 255, ${0.32 * a})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const d of this.drops) {
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - this.windX * d.l * 0.35, d.y - d.l);
    }
    ctx.stroke();
    // haze of a real downpour
    if (this.rain > 0.75) {
      ctx.fillStyle = `rgba(40, 60, 90, ${(this.rain - 0.75) * 0.3})`;
      ctx.fillRect(0, 0, this.game.viewW, this.game.viewH);
    }
  }

  /** Lightning joins the explosion flash pipeline. */
  flashBonus() {
    return this.lightning * 0.35;
  }
}
