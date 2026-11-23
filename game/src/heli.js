// ---------------------------------------------------------------------------
// heli.js — the Vice Palms PD air unit. Above 4 stars a helicopter joins the
// hunt: it orbits the player's last position, sweeps a searchlight, and any
// player caught in the beam counts as SEEN (no decay while lit). Drawn above
// the rooftops with a rotor shadow and a ground light pool.
// ---------------------------------------------------------------------------

import { CFG, HELI_CFG } from './config.js';
import { clamp, dist2, angleDamp, wrapAngle } from './util.js';

export class Heli {
  constructor(x, y, rng) {
    this.x = x;
    this.y = y;
    this.orbitA = rng.range(0, Math.PI * 2);
    this.rotor = 0;
    this.spot = { x, y };         // searchlight ground target
    this.sweepDir = rng.chance(0.5) ? 1 : -1;
    this.lit = false;             // player currently in the beam
    this.engineT = 0;             // spin-up
  }

  /**
   * Fly the pattern. Returns true when the player is caught in the beam.
   */
  update(dt, game) {
    const p = game.player;
    this.engineT = Math.min(1, this.engineT + dt * 0.4);
    this.rotor += dt * (22 + this.engineT * 30);

    // orbit around the player (or last known position once unseen)
    const tx = p.x + Math.cos(this.orbitA) * HELI_CFG.ORBIT_R;
    const ty = p.y + Math.sin(this.orbitA) * HELI_CFG.ORBIT_R;
    this.orbitA += HELI_CFG.ORBIT_W * dt;
    const k = 1 - Math.exp(-1.6 * dt);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;

    // searchlight sweeps local ground, biased toward the player
    const dx = p.x - this.spot.x, dy = p.y - this.spot.y;
    const d = Math.hypot(dx, dy) || 1;
    this.spot.x += (dx / d) * HELI_CFG.SPOT_SPEED * dt + this.sweepDir * 60 * dt;
    this.spot.y += (dy / d) * HELI_CFG.SPOT_SPEED * dt;
    if (Math.random() < dt * 0.25) this.sweepDir *= -1;
    // floodlight flicker (generator strain, pure atmosphere)
    this.flicker = Math.random() < dt * 8 ? 1 : (this.flicker || 1) * 0.96;

    // caught in the beam?
    this.lit = !p.inCar
      ? dist2(p.x, p.y, this.spot.x, this.spot.y) < HELI_CFG.BEAM_R ** 2
      : dist2(p.x, p.y, this.spot.x, this.spot.y) < (HELI_CFG.BEAM_R * 1.2) ** 2;
    return this.lit;
  }
}

/** manager hanging off the police force */
export class Helis {
  constructor(rng) {
    this.rng = rng;
    this.list = [];
    this.spawnCd = 0;
  }

  update(dt, game) {
    const wanted = game.police.wanted;
    // spawn
    this.spawnCd -= dt;
    if (wanted >= HELI_CFG.MIN_STARS && this.list.length < 1 && this.spawnCd <= 0) {
      this.spawnCd = 20;
      const a = this.rng.range(0, Math.PI * 2);
      this.list.push(new Heli(game.player.x + Math.cos(a) * 900, game.player.y + Math.sin(a) * 900, this.rng));
      game.toast('Air unit inbound!');
    }
    // despawn when things calm down
    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i];
      const playerLit = h.update(dt, game);
      if (playerLit) game.police.spotted();      // beam counts as seen
      if (wanted < HELI_CFG.MIN_STARS) this.list.splice(i, 1);
      game.audio.rotor(true, game.player.x - h.x, game.player.y - h.y);
      return;                                    // single air unit for now
    }
    if (this.list.length === 0) game.audio.rotor(false, 0, 0);
  }

  drawWorld(g, time) {
    for (const h of this.list) {
      // ground searchlight
      g.save();
      g.globalCompositeOperation = 'lighter';
      const fl = h.flicker || 1;
      const gr = g.createRadialGradient(h.spot.x, h.spot.y, 6, h.spot.x, h.spot.y, HELI_CFG.BEAM_R);
      gr.addColorStop(0, `rgba(255,250,220,${0.34 * fl})`);
      gr.addColorStop(1, 'rgba(255,250,220,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(h.spot.x, h.spot.y, HELI_CFG.BEAM_R, 0, 7);
      g.fill();
      // beam column
      g.strokeStyle = 'rgba(255,250,220,0.12)';
      g.lineWidth = 26;
      g.beginPath();
      g.moveTo(h.x, h.y);
      g.lineTo(h.spot.x, h.spot.y);
      g.stroke();
      g.restore();

      // shadow far below
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.beginPath();
      g.ellipse(h.x + 30, h.y + HELI_CFG.HEIGHT, 26, 12, 0, 0, 7);
      g.fill();

      // fuselage at "altitude"
      g.save();
      g.translate(h.x, h.y);
      const tilt = Math.sin(time * 2.1) * 0.05;
      g.rotate(tilt);
      g.fillStyle = '#20263a';
      g.beginPath();
      g.ellipse(0, 0, 26, 13, 0, 0, 7);
      g.fill();
      g.fillStyle = '#10141f';
      g.fillRect(24, -4, 22, 8);
      g.fillRect(42, -10, 6, 20);
      g.fillStyle = 'rgba(150,200,240,0.8)';
      g.beginPath();
      g.ellipse(-12, -2, 8, 6, 0, 0, 7);
      g.fill();
      // nav lights
      const blink = Math.floor(time * 3) % 2 === 0;
      g.fillStyle = blink ? '#ff4b4b' : '#5a1414';
      g.beginPath(); g.arc(-26, -3, 2.4, 0, 7); g.fill();
      g.fillStyle = blink ? '#3ddc6a' : '#145a2a';
      g.beginPath(); g.arc(26, -3, 2.4, 0, 7); g.fill();
      // rotor
      g.strokeStyle = 'rgba(210,220,240,0.8)';
      g.lineWidth = 3;
      for (let b = 0; b < 4; b++) {
        const a = h.rotor + b * Math.PI / 2;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(Math.cos(a) * HELI_CFG.ROTOR_R, Math.sin(a) * HELI_CFG.ROTOR_R * 0.36);
        g.stroke();
      }
      g.restore();
    }
  }
}
