// ---------------------------------------------------------------------------
// garage.js — the safehouse garage on the downtown edge. Walk/drive onto the
// pad: (1) quick-save your game, (2) pay a respray to cool the paint and (if
// nobody can see you) wipe a modest amount of heat, (3) the roller door does
// its thing. The classic Vice City spa day, in one file.
// ---------------------------------------------------------------------------

import { CFG } from './config.js';
import { dist2 } from './util.js';

const RESPRAY_COST = 200;
const HEAT_WIPED = 45;          // heat points removed by a respray
const COOLDOWN = 4;             // seconds between services

export class Garage {
  /**
   * pad: where the marker sits (world), snapped near a road at build time.
   */
  constructor(worldRef, rng, pad = { x: 2840, y: 1720 }) {
    this.world = worldRef;
    this.rng = rng;
    const snapped = worldRef.nearestRoadPoint(pad.x, pad.y);
    this.x = snapped ? snapped.x : pad.x;
    this.y = snapped ? snapped.y : pad.y;
    this.door = 0;              // 0 shut … 1 open (animated)
    this.cool = 0;
    this.label = 'SAFEHOUSE';
    this.msg = null;
    this.msgT = 0;
  }

  say(text, t = 2.6) {
    this.msg = text;
    this.msgT = t;
  }

  update(dt, game) {
    if (this.msgT > 0) this.msgT -= dt;
    this.cool = Math.max(0, this.cool - dt);
    const p = game.player;

    // roller door eases open while the player is close, shuts when away
    const near = dist2(p.x, p.y, this.x, this.y) < 150 * 150;
    const target = near ? 1 : 0;
    const before = this.door;
    this.door += (target - this.door) * Math.min(1, dt * 2.2);
    if (before < 0.05 && this.door >= 0.05) game.audio.door();

    if (!near || this.cool > 0) return;

    // parked on the pad? (in a car) — full service
    if (p.inCar && dist2(p.x, p.y, this.x, this.y) < 60 * 60) {
      this.service(game);
      return;
    }
    // on foot — save only
    if (dist2(p.x, p.y, this.x, this.y) < 44 * 44) {
      this.cool = COOLDOWN;
      game.saveGame();
      this.say('Saved./rest up, hotshot', 2.4);
    }
  }

  service(game) {
    const p = game.player;
    this.cool = COOLDOWN;
    // the mechanic talks while he works
    const lines = [
      'She\'s beautiful. What happened?',
      'I can fix dents. Dignity costs extra.',
      'You bring her back in ONE piece. Impressive.',
      'Same time next week, hotshot?',
    ];
    this.say(lines[Math.floor(this.rng.next() * lines.length)], 2.6);

    // free repair of the ride — the garage crew earned their tip
    const car = p.inCar;
    if (car && !car.wrecked && car.hp < car.maxHp) {
      car.hp = car.maxHp;
      car.burn = 0;
    }

    // respray clears heat if you can afford it
    if (game.police.wanted > 0 && p.money >= RESPRAY_COST) {
      p.addMoney(-RESPRAY_COST);
      game.police.heat = Math.max(0, game.police.heat - HEAT_WIPED);
      game.police.updateWanted();
      game.police.unseenT = 0;
      this.say(`Resprayed — ${RESPRAY_COST}. Heat cooled.`, 2.6);
      game.toast('Respray: the paint is innocent, and so are you (mostly)');
      // fresh coat
      if (car) car.variant = (car.variant + 1) % car.spec.hue.length;
    } else if (game.police.wanted > 0) {
      this.say(`Respray is $${RESPRAY_COST}. Come back with cash.`, 2.6);
    } else {
      this.say('Wheels fixed. Save from the pause menu or the pad.', 2.6);
    }
    game.saveGame();
  }

  /** rendered by render.js: pad, roller door, neon sign */
  drawWorld(g, time) {
    // glowing pad
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.2);
    g.save();
    g.globalCompositeOperation = 'lighter';
    const gr = g.createRadialGradient(this.x, this.y, 4, this.x, this.y, 60);
    gr.addColorStop(0, `rgba(124,232,160,${0.22 + pulse * 0.1})`);
    gr.addColorStop(1, 'rgba(124,232,160,0)');
    g.fillStyle = gr;
    g.fillRect(this.x - 60, this.y - 60, 120, 120);
    g.restore();
    g.strokeStyle = '#7ce8a0';
    g.lineWidth = 3;
    g.strokeRect(this.x - 44, this.y - 30, 88, 60);

    // roller door above (fake elevation like a building face)
    const lift = this.door * 34;
    g.fillStyle = '#39424f';
    g.fillRect(this.x - 44, this.y - 30 - 52 + lift, 88, 52);
    g.fillStyle = '#2e3742';
    for (let i = 0; i < 4; i++) {
      g.fillRect(this.x - 44, this.y - 30 - 52 + lift + 6 + i * 12, 88, 6);
    }
    // neon sign
    g.font = 'bold 13px "Segoe UI", Arial, sans-serif';
    g.textAlign = 'center';
    g.save();
    g.shadowColor = '#7ce8a0';
    g.shadowBlur = 12;
    g.fillStyle = '#7ce8a0';
    g.fillText('SAFEHOUSE', this.x, this.y - 90);
    g.restore();
    g.textAlign = 'left';

    // floating service message
    if (this.msgT > 0 && this.msg) {
      g.font = 'bold 14px "Segoe UI", Arial, sans-serif';
      g.textAlign = 'center';
      g.fillStyle = `rgba(240,244,250,${Math.min(1, this.msgT)})`;
      g.fillText(this.msg, this.x, this.y - 60);
      g.textAlign = 'left';
    }
  }
}
