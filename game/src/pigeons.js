// pigeons.js — the city birds. Flocks perch on plazas, peck around, and
// scatter in a clatter of wings whenever anything big and fast comes close.
// Pure atmosphere, zero collision, and a surprising amount of life.

import { CFG } from './config.js';
import { RNG, mixSeeds } from './rng.js';
import { clamp, dist, TAU } from './util.js';

export class Pigeons {
  constructor(game) {
    this.game = game;
    this.rng = new RNG(mixSeeds(game.seed, 0xB1A2));
    this.birds = [];
    this.spawnT = 0;
  }

  spawnFlock(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = this.rng.angle();
      const d = this.rng.range(10, 70);
      this.birds.push({
        x: clamp(x + Math.cos(a) * d, 20, CFG.W - 20),
        y: clamp(y + Math.sin(a) * d, 20, CFG.H - 20),
        vx: 0, vy: 0,
        state: 'ground',      // ground | fly
        flyT: 0,
        peck: this.rng.range(0, 6),
        wing: this.rng.range(0, TAU),
        home: { x: clamp(x + Math.cos(a) * d, 20, CFG.W - 20), y: clamp(y + Math.sin(a) * d, 20, CFG.H - 20) },
      });
    }
  }

  update(dt) {
    const game = this.game;
    const p = game.player;
    const px = p.car ? p.car.x : p.x;
    const py = p.car ? p.car.y : p.y;

    // keep a few flocks around the player
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 4;
      // cull far flocks
      this.birds = this.birds.filter((b) => dist(b.x, b.y, px, py) < 1300);
      if (this.birds.length < 46) {
        // find a plaza spot near the player to colonise
        for (let tries = 0; tries < 20; tries++) {
          const a = this.rng.angle();
          const d = this.rng.range(260, 620);
          const x = clamp(px + Math.cos(a) * d, 40, CFG.W - 40);
          const y = clamp(py + Math.sin(a) * d, 40, CFG.H - 40);
          const code = game.world.codeAt(x, y);
          if (code === 0 || code === 5) {
            this.spawnFlock(x, y, this.rng.int(5, 9));
            break;
          }
        }
      }
    }

    for (const b of this.birds) {
      if (b.state === 'fly') {
        // flap away, then drift back down at the old home
        b.flyT -= dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.vx *= 0.985;
        b.vy *= 0.985;
        b.wing += dt * 34;
        if (b.flyT <= 0) {
          b.state = 'ground';
          b.vx = 0;
          b.vy = 0;
          b.x = b.home.x;
          b.y = b.home.y;
        }
        continue;
      }
      // ground: wander a couple px, peck
      b.peck += dt * 2;
      if (b.peck > 6.3) b.peck = 0;

      // scare check: player, any fast car, or an explosion nearby
      let scare = false;
      const d = dist(b.x, b.y, px, py);
      if (d < 46 && !p.car) scare = true;
      if (!scare) {
        for (const c of game.cars) {
          if (c.dead) continue;
          if (dist(b.x, b.y, c.x, c.y) < 74 && Math.abs(c.speed) > 40) {
            scare = true;
            break;
          }
        }
      }
      if (!scare && game.heli && dist(b.x, b.y, game.heli.beamX, game.heli.beamY) < 120) scare = true;
      if (scare) {
        b.state = 'fly';
        b.flyT = 1.1 + this.rng.next() * 0.8;
        const away = Math.atan2(b.y - py, b.x - px) + (this.rng.next() - 0.5);
        const v = 150 + this.rng.next() * 90;
        b.vx = Math.cos(away) * v;
        b.vy = Math.sin(away) * v - 30;
        b.wing = 0;
      }
    }
  }

  /** Ground birds are little pecking dots; flyers are flapping V shapes. */
  draw(ctx, view) {
    const game = this.game;
    for (const b of this.birds) {
      if (b.x < view.x0 - 20 || b.x > view.x1 + 20 || b.y < view.y0 - 20 || b.y > view.y1 + 20) continue;
      if (b.state === 'fly') {
        const flap = Math.sin(b.wing) * 3;
        ctx.strokeStyle = 'rgba(160, 168, 180, 0.85)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(b.x - 4, b.y - flap);
        ctx.lineTo(b.x, b.y + 1);
        ctx.lineTo(b.x + 4, b.y - flap);
        ctx.stroke();
      } else {
        // pecking bob
        const peck = Math.sin(b.peck * TAU) > 0.7 ? 1.5 : 0;
        ctx.fillStyle = '#8d94a2';
        ctx.beginPath();
        ctx.ellipse(b.x, b.y + peck, 2.6, 2, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#565b66';
        ctx.beginPath();
        ctx.arc(b.x + 2.2, b.y - 1.6 + peck, 1.2, 0, TAU);
        ctx.fill();
      }
    }
  }
}
