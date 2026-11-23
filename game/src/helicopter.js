// helicopter.js — the VCPD chopper. From four stars it lifts off and hunts
// the player: a rotor-thud heartbeat, a wandering searchlight, and its beam
// counts as "seen" for wanted decay. It cannot land, but it can be shooed
// away by staying under cover for long enough.

import { CFG } from './config.js';
import { clamp, dist, damp, TAU } from './util.js';

export class Helicopter {
  constructor(game) {
    this.game = game;
    this.x = game.player.x + 300;
    this.y = game.player.y - 300;
    this.hx = this.x; // hover target
    this.hy = this.y;
    this.ang = 0;
    this.alt = 190;                 // fake altitude for the shadow offset
    this.rotor = 0;
    this.thudT = 0;
    this.searchAng = 0;
    this.beamX = game.player.x;
    this.beamY = game.player.y;
    this.bob = 0;
  }

  get spotlightRange() { return 120; }

  /** True while the player is caught in the beam. */
  playerLit() {
    const p = this.game.player;
    const px = p.car ? p.car.x : p.x;
    const py = p.car ? p.car.y : p.y;
    return dist(this.beamX, this.beamY, px, py) < this.spotlightRange;
  }

  update(dt) {
    const game = this.game;
    const p = game.player;
    const px = p.car ? p.car.x : p.x;
    const py = p.car ? p.car.y : p.y;

    this.rotor += dt * 28;
    this.bob += dt * 2;

    // hover above the player with lag, keeping a respectful standoff
    this.hx = px + Math.cos(this.searchAng * 0.31) * 150;
    this.hy = py + Math.sin(this.searchAng * 0.31) * 150 - 40;
    const k = damp(1.1, dt);
    this.x += (this.hx - this.x) * k;
    this.y += (this.hy - this.y) * k;
    this.searchAng += dt;

    // face travel direction
    this.ang = Math.atan2(this.hy - this.y, this.hx - this.x) + Math.PI / 2;

    // the beam swings toward the player but overshoots like a real searchlight
    const wantAng = Math.atan2(py - this.beamY, px - this.beamX);
    const beamLag = 2.6;
    const cur = Math.atan2(Math.sin(wantAng), Math.cos(wantAng));
    void cur;
    const k2 = damp(beamLag, dt);
    this.beamX += (px - this.beamX) * k2 + Math.sin(this.searchAng * 2.1) * 30 * dt;
    this.beamY += (py - this.beamY) * k2 + Math.cos(this.searchAng * 1.7) * 30 * dt;

    // rotor thud
    this.thudT -= dt;
    if (this.thudT <= 0) {
      this.thudT = 0.62;
      const d = dist(this.x, this.y, px, py);
      const vol = clamp(1 - d / 1400, 0, 1) * 0.22;
      if (vol > 0.02) game.audio.playNoise(0.1, 120, vol, 'lowpass');
    }
  }

  /** Drawn in world space above everything. */
  draw(ctx) {
    const game = this.game;
    const bobY = Math.sin(this.bob) * 3;

    // searchlight pool on the ground
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(this.beamX, this.beamY, 4, this.beamX, this.beamY, this.spotlightRange);
    g.addColorStop(0, 'rgba(255, 250, 220, 0.30)');
    g.addColorStop(0.8, 'rgba(255, 250, 220, 0.10)');
    g.addColorStop(1, 'rgba(255,250,220,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.beamX, this.beamY, this.spotlightRange, 0, TAU);
    ctx.fill();
    ctx.restore();

    // light cone from the belly to the pool
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cg = ctx.createLinearGradient(this.x, this.y, this.beamX, this.beamY);
    cg.addColorStop(0, 'rgba(255,250,220,0.16)');
    cg.addColorStop(1, 'rgba(255,250,220,0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.beamX - 110, this.beamY);
    ctx.lineTo(this.beamX + 110, this.beamY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // shadow far below
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(this.x + 30, this.y + 150, 34, 12, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // fuselage
    ctx.save();
    ctx.translate(this.x, this.y + bobY);
    ctx.rotate(this.ang);
    // tail
    ctx.fillStyle = '#26324a';
    ctx.fillRect(-8, -34, 8, 30);
    ctx.fillRect(-10, -36, 12, 6);
    // body
    ctx.fillStyle = '#26324a';
    roundRectPath(ctx, -10, -12, 26, 22, 9);
    ctx.fill();
    // glass
    ctx.fillStyle = 'rgba(140, 200, 255, 0.5)';
    ctx.beginPath();
    ctx.ellipse(8, 0, 7, 6, 0, 0, TAU);
    ctx.fill();
    // skids
    ctx.fillStyle = '#12161e';
    ctx.fillRect(-8, 8, 22, 2);
    ctx.fillRect(-4, -12, 2, 2);
    ctx.fillRect(-4, 8, 2, 2);
    // rotor
    ctx.strokeStyle = 'rgba(200, 210, 230, 0.65)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const a = this.rotor + (i / 3) * TAU;
      ctx.beginPath();
      ctx.moveTo(-Math.cos(a) * 34, -Math.sin(a) * 34);
      ctx.lineTo(Math.cos(a) * 34, Math.sin(a) * 34);
      ctx.stroke();
    }
    // nav lights
    const blink = Math.sin(this.rotor * 1.7) > 0.3;
    ctx.fillStyle = blink ? '#ff5c5c' : '#401010';
    ctx.beginPath();
    ctx.arc(-6, -30, 2.4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
