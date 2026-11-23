// ---------------------------------------------------------------------------
// weather.js — Vice Palms rain. A deterministic clear → drizzle → storm cycle:
// slanted drops, sidewalk splashes, wet-screen streaks, and lightning with a
// delayed thunder roll. Rain also softly flattens grip via WEATHER_CFG.
// ---------------------------------------------------------------------------

import { WEATHER_CFG } from './config.js';
import { RNG } from './rng.js';

export class Weather {
  constructor(seed = 20260) {
    this.rng = new RNG(seed);
    this.intensity = 0;          // 0 clear, 1 drizzle, 2 storm
    this.timer = 0;              // time left in current phase
    this.cycleIdx = 0;
    this.drops = [];             // live raindrops {x, y, v}
    this.splashes = [];          // {x, y, t}
    this.boltT = 0;              // lightning flash brightness
    this.boltX = 0;
    this.thunderDelay = 0;
    this.nextBolt = WEATHER_CFG.LIGHTNING_MIN_GAP;
    this.wet = 0;                // 0..1 ground wetness for sheen
  }

  /** current handling multiplier for vehicles */
  gripMult() {
    return this.intensity > 0 ? WEATHER_CFG.WET_GRIP_MULT : 1;
  }

  update(dt, game) {
    // phase machine
    this.timer -= dt;
    if (this.timer <= 0) {
      this.intensity = (this.cycleIdx % 2 === 0) ? (this.cycleIdx === 0 ? 0 : 1) : 2;
      // sequence: clear → drizzle → storm → clear → drizzle → storm …
      this.timer = WEATHER_CFG.CYCLE[this.cycleIdx % WEATHER_CFG.CYCLE.length];
      this.cycleIdx++;
      this._retargetDrops();
    }

    // wetness eases toward the intensity target
    const wetTarget = this.intensity === 0 ? 0 : this.intensity === 1 ? 0.45 : 1;
    this.wet += (wetTarget - this.wet) * Math.min(1, dt * 0.25);

    // drops fall in screen space (cheap, looks right)
    const counts = WEATHER_CFG.DROP_COUNT;
    const want = counts[this.intensity];
    while (this.drops.length < want) {
      this.drops.push({
        x: this.rng.range(-80, 1360),
        y: this.rng.range(-720, 720),
        v: WEATHER_CFG.DROP_SPEED * this.rng.range(0.8, 1.2),
      });
    }
    if (this.drops.length > want) this.drops.length = want;
    for (const d of this.drops) {
      d.y += d.v * dt;
      d.x += d.v * dt * Math.tan(-WEATHER_CFG.DROP_ANGLE);
      if (d.y > 740) {
        if (this.rng.chance(WEATHER_CFG.SPLASH_CHANCE)) {
          this.splashes.push({ x: d.x, y: 700 + this.rng.range(-30, 40), t: 0.18 });
        }
        d.y = -40;
        d.x = this.rng.range(-80, 1360);
      }
      if (d.x > 1300) d.x -= 1400;
    }
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      this.splashes[i].t -= dt;
      if (this.splashes[i].t <= 0) this.splashes.splice(i, 1);
    }

    // lightning only in storms
    if (this.intensity === 2) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = WEATHER_CFG.LIGHTNING_STORM_GAP + this.rng.range(0, 6);
        this.boltT = 1;
        this.boltX = this.rng.range(100, 1180);
        this.thunderDelay = this.rng.range(0.4, 1.6);
      }
    }
    if (this.boltT > 0) {
      this.boltT = Math.max(0, this.boltT - dt * 2.4);
      if (this.thunderDelay > 0) {
        this.thunderDelay -= dt;
        if (this.thunderDelay <= 0 && game) game.audio.thunder();
      }
    }
  }

  _retargetDrops() {
    // existing drops keep falling; the count diff fills/drains naturally
  }

  /** lightning + rain overlay, drawn in SCREEN space after the world */
  drawScreen(g) {
    // rain streaks
    if (this.drops.length) {
      g.save();
      g.strokeStyle = 'rgba(170,190,220,0.30)';
      g.lineWidth = 1;
      g.beginPath();
      for (const d of this.drops) {
        const dx = Math.tan(-WEATHER_CFG.DROP_ANGLE) * 14;
        g.moveTo(d.x, d.y);
        g.lineTo(d.x + dx, d.y + 14);
      }
      g.stroke();
      g.restore();
      // sidewalk splashes
      g.fillStyle = 'rgba(190,205,230,0.5)';
      for (const s of this.splashes) {
        g.beginPath();
        g.ellipse(s.x, s.y, 5 * (1 - s.t / 0.18), 2 * (1 - s.t / 0.18), 0, 0, 7);
        g.fill();
      }
    }
    // lightning wash
    if (this.boltT > 0.01) {
      g.fillStyle = `rgba(225,235,255,${this.boltT * 0.42})`;
      g.fillRect(0, 0, 1280, 720);
      // the bolt itself
      if (this.boltT > 0.7) {
        g.strokeStyle = `rgba(250,252,255,${this.boltT})`;
        g.lineWidth = 3;
        g.beginPath();
        let x = this.boltX, y = 0;
        g.moveTo(x, y);
        while (y < 300) {
          x += (Math.random() - 0.5) * 60;
          y += 40 + Math.random() * 50;
          g.lineTo(x, y);
        }
        g.stroke();
      }
    }
  }
}
