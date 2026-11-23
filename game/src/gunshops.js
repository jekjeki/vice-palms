// gunshops.js — Ammu-Nation. Two storefronts; walk into the blue marker and
// the clerk auto-sells: first clips of pistol ammo, then body armor when you
// are topped up. No menu, no mouse — you are in and out in a second.

import { CFG, PLACES } from './config.js';
import { dist, clamp, circleRectHit, TAU } from './util.js';

export const GUNSHOPS = [
  { key: 'gunshop1', x: PLACES.policeStation.x + 150, y: PLACES.policeStation.y - 60 },
  { key: 'gunshop2', x: 44 * CFG.T, y: 91 * CFG.T },
];

export const AMMO_CLIP = 24;
export const CLIP_COST = 60;
export const ARMOR_COST = 250;

export class Gunshops {
  constructor(game) {
    this.game = game;
    this.buyT = 0;
    this.hint = false;
    // nudge storefronts out of any building that generation dropped there
    for (const g of GUNSHOPS) {
      for (let tries = 0; tries < 40; tries++) {
        const near = [];
        game.world.solidsNear(g.x, g.y, 40, near);
        if (!near.some((r) => circleRectHit(g.x, g.y, 12, r))) break;
        g.y += 24;
      }
    }
  }

  nearShop(x, y) {
    for (const g of GUNSHOPS) {
      if (dist(x, y, g.x, g.y) < 34) return g;
    }
    return null;
  }

  update(dt) {
    const game = this.game;
    const p = game.player;
    this.buyT -= dt;
    const shop = this.nearShop(p.x, p.y);
    if (!shop || p.car || p.dead) {
      this.hint = false;
      return;
    }
    this.hint = true;
    if (this.buyT > 0) return;

    // buy priority: ammo until comfortable, then armor
    if (p.ammo < CFG.AMMO_MAX - AMMO_CLIP / 2 && p.money >= CLIP_COST) {
      p.money -= CLIP_COST;
      game.stats.addMoney(-CLIP_COST);
      p.giveAmmo(AMMO_CLIP);
      this.buyT = 1.1;
      game.audio.cash();
      game.hud.subtitle(`Ammu-Nation: +${AMMO_CLIP} rounds (-${CLIP_COST} bucks).`, 2);
      game.effects.push({ type: 'cash', x: p.x, y: p.y - 14, t: 0, dur: 0.8 });
      return;
    }
    if (p.armor < CFG.PLAYER_ARMOR_MAX && p.money >= ARMOR_COST) {
      p.money -= ARMOR_COST;
      game.stats.addMoney(-ARMOR_COST);
      p.giveArmor(100);
      this.buyT = 1.4;
      game.audio.cash();
      game.hud.subtitle(`Ammu-Nation: body armor (-${ARMOR_COST} bucks).`, 2);
      game.effects.push({ type: 'cash', x: p.x, y: p.y - 14, t: 0, dur: 0.8 });
      return;
    }
    // nothing affordable: gentle nudge, slowly repeated
    if (p.money < CLIP_COST) {
      this.buyT = 3;
      game.hud.subtitle('The clerk eyes your empty pockets. Come back with cash.', 2);
    } else {
      this.buyT = 3;
      game.hud.subtitle('Fully stocked. The city waits.', 1.6);
    }
  }

  /** Blue storefront markers, drawn with the mission markers. */
  draw(ctx) {
    const game = this.game;
    const pulse = 0.6 + 0.4 * Math.sin(game.time * 4);
    for (const g of GUNSHOPS) {
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.globalAlpha = 0.2 + 0.2 * pulse;
      ctx.fillStyle = '#37f5ff';
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = '#37f5ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 15 + 3 * pulse, 0, TAU);
      ctx.stroke();
      // bullet glyph
      ctx.fillStyle = '#37f5ff';
      ctx.fillRect(-1.5, -7, 3, 10);
      ctx.beginPath();
      ctx.arc(0, -7, 2.4, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(-3, 3, 6, 1.6);
      ctx.restore();
    }
    // storefront sign
    ctx.save();
    for (const g of GUNSHOPS) {
      ctx.font = 'bold 10px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#37f5ff';
      ctx.fillText('AMMU-NATION', g.x, g.y - 30);
    }
    ctx.restore();
  }
}
