// delivery.js — the Courier Hustle. A green bike-box marker by the taxi
// stand: take a package, run it across town before the timer dies, get paid
// with an escalating bonus for distance. Repeatable forever; the pulse of
// every good open world.

import { CFG } from './config.js';
import { RNG, mixSeeds } from './rng.js';
import { dist, clamp, fmtMoney, fmtTime, circleRectHit, TAU } from './util.js';

export class Delivery {
  constructor(game) {
    this.game = game;
    this.rng = new RNG(mixSeeds(game.seed, 0xD341));
    this.stand = { x: 22 * CFG.T, y: 71 * CFG.T };   // dispatcher marker
    this.active = null;                              // {drop, timer, pay}
    this.streak = 0;
    this.done = 0;
    this.nudgeT = 0;
  }

  /** Dispatcher post sits on the plaza; nudge it out of buildings. */
  settle() {
    for (let tries = 0; tries < 40; tries++) {
      const near = [];
      this.game.world.solidsNear(this.stand.x, this.stand.y, 40, near);
      if (!near.some((r) => circleRectHit(this.stand.x, this.stand.y, 12, r))) break;
      this.stand.y += 24;
    }
  }

  update(dt) {
    const game = this.game;
    const p = game.player;

    // take a job: stand on the marker on foot or in any car
    if (!this.active) {
      if (dist(p.x, p.y, this.stand.x, this.stand.y) < 30 && !p.dead) {
        this.take();
      }
      return;
    }

    // active run: timer, drop marker, payout
    this.active.timer -= dt;
    if (this.active.timer <= 0) {
      game.hud.subtitle(`Package spoiled. The dispatcher is not amused.`, 3);
      game.audio.fail();
      this.streak = 0;
      this.active = null;
      return;
    }
    const d = dist(p.x, p.y, this.active.drop.x, this.active.drop.y);
    if (d < 40) {
      const pay = this.active.pay;
      p.money += pay;
      game.stats.addMoney(pay);
      game.audio.cash();
      game.effects.push({ type: 'cash', x: p.x, y: p.y - 14, t: 0, dur: 0.9 });
      game.hud.subtitle(`Delivered! ${fmtMoney(pay)} — streak x${this.streak}.`, 2.6);
      this.done++;
      this.active = null;
    }
  }

  take() {
    const game = this.game;
    const p = game.player;
    // pick a drop 900-2600 px away on walkable ground
    let drop = null;
    for (let tries = 0; tries < 80 && !drop; tries++) {
      const a = this.rng.angle();
      const d = this.rng.range(900, 2600);
      const x = clamp(p.x + Math.cos(a) * d, 80, CFG.W - 80);
      const y = clamp(p.y + Math.sin(a) * d, 80, CFG.H - 80);
      const code = game.world.codeAt(x, y);
      if (code === 0 || code === 4 || code === 5 || code === 7) drop = { x, y };
    }
    if (!drop) drop = { x: CFG.W / 2, y: CFG.H / 2 };
    const d = dist(p.x, p.y, drop.x, drop.y);
    // pay scales with distance and streak; timer is tight but fair
    const base = Math.round(90 + d / 18);
    const pay = base + this.streak * 40;
    const timer = clamp(d / 130 + 14, 22, 55);
    this.active = { drop, timer, pay };
    this.streak++;
    game.audio.cash();
    game.hud.subtitle(`Package up! Drop it ${Math.round(d / 32)} blocks away in ${Math.round(timer)}s for ${fmtMoney(pay)}.`, 4);
    game.hud.big('COURIER RUN', 1.6, '#5cff8a');
  }

  /** Timer + drop marker for the HUD and renderer. */
  timeLeft() {
    return this.active ? Math.max(0, this.active.timer) : null;
  }

  drop() {
    return this.active ? this.active.drop : null;
  }

  /** Dispatcher post + pulsing drop marker. */
  draw(ctx) {
    const game = this.game;
    const pulse = 0.5 + 0.5 * Math.sin(game.time * 4);
    // dispatcher
    ctx.save();
    ctx.translate(this.stand.x, this.stand.y);
    ctx.globalAlpha = 0.2 + 0.2 * pulse;
    ctx.fillStyle = '#5cff8a';
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.95;
    // the box
    ctx.fillStyle = '#5cff8a';
    ctx.fillRect(-6, -5, 12, 10);
    ctx.strokeStyle = '#0a1a10';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-6, -5, 12, 10);
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(6, 0);
    ctx.stroke();
    ctx.restore();
    // active drop
    if (this.active) {
      const d = this.active.drop;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.globalAlpha = 0.25 + 0.2 * pulse;
      ctx.fillStyle = '#5cff8a';
      ctx.beginPath();
      ctx.arc(0, 0, 40, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#5cff8a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 22 + 5 * pulse, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }
}
