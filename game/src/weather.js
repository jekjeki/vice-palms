// weather.js — drifting rain storms with screen-space drops + lightning.
// Rain intensity oscillates slowly; storms bring thunder and wet streets.

import { CFG, ctx } from './config.js';
import { clamp } from './util.js';

export class Weather {
  constructor(seed = 2026) {
    this.rain = 0.12;              // current intensity 0..1
    this.target = 0.12;
    this.timer = 24;               // seconds until next target change
    this.drops = [];               // screen-space drops
    this.lightning = 0;            // flash strength
    this.thunderT = 8 + (seed % 17);
    this.rng = null;               // set via setRng for determinism
    this.splash = 0;
  }

  setRng(rng) { this.rng = rng; }

  update(dt, S) {
    this.timer -= dt;
    if (this.timer <= 0) {
      // drift the storm target: dry spells and downpours
      this.timer = 34 + Math.random() * 46;
      const r = Math.random();
      this.target = r < 0.42 ? (0.05 + Math.random() * 0.2) : (0.45 + Math.random() * 0.5);
    }
    this.rain = clamp(this.rain + (this.target - this.rain) * dt * 0.08, 0, 1);

    // lightning during heavy rain
    this.lightning = Math.max(0, this.lightning - dt * 2.6);
    if (this.rain > 0.55) {
      this.thunderT -= dt;
      if (this.thunderT <= 0) {
        this.thunderT = 9 + Math.random() * 22;
        this.lightning = 0.75 + Math.random() * 0.25;
        if (ctx.audio && ctx.audio.play) ctx.audio.play('thunder', S.player.x, S.player.y);
      }
    }

    // maintain the drop pool (screen-space)
    const want = Math.round(150 * this.rain);
    while (this.drops.length < want) {
      this.drops.push({
        x: Math.random() * (CFG.viewW + 240) - 120,
        y: Math.random() * (CFG.viewH + 140) - 70,
        spd: 700 + Math.random() * 500,
        len: 11 + Math.random() * 13,
      });
    }
    if (this.drops.length > want) this.drops.length = want;

    const windX = 0.36;   // slant
    for (const d of this.drops) {
      d.y += d.spd * dt;
      d.x += d.spd * windX * dt;
      if (d.y > CFG.viewH + 60) { d.y = -40 - Math.random() * 60; d.x = Math.random() * (CFG.viewW + 240) - 200; }
      if (d.x > CFG.viewW + 140) d.x -= CFG.viewW + 260;
    }
    this.splash += dt;
  }

  // intensity helpers for other systems
  wetness() { return clamp(this.rain * 1.3, 0, 1); }
}
