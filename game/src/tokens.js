// tokens.js — ten hidden palm tokens scattered across the city. Collect them
// all for a fat cash bonus, some armor and bragging rights. Placement is
// seeded, so every run of a given save has the same ten hiding spots.

import { CFG, PLACES } from './config.js';
import { RNG, mixSeeds } from './rng.js';
import { clamp, dist, TAU } from './util.js';

const TOKEN_COUNT = 10;

export class Tokens {
  constructor(game) {
    this.game = game;
    this.rng = new RNG(mixSeeds(game.seed, 0x7034));
    this.spots = [];
    this.taken = new Set();
    this.bonusGiven = false;
    this.place();
  }

  place() {
    const rng = this.rng;
    const anchors = [
      PLACES.start, PLACES.hospital, PLACES.policeStation, PLACES.garage,
      PLACES.docksMeet, PLACES.dockYard, PLACES.beachPickup, PLACES.penthouse,
      PLACES.airfieldTower, PLACES.parkCore,
    ];
    for (let i = 0; i < TOKEN_COUNT; i++) {
      const a = anchors[i % anchors.length];
      let spot = null;
      for (let tries = 0; tries < 60 && !spot; tries++) {
        const ang = rng.angle();
        const d = rng.range(60, 420);
        const x = clamp(a.x + Math.cos(ang) * d, 60, CFG.W - 60);
        const y = clamp(a.y + Math.sin(ang) * d, 60, CFG.H - 60);
        const code = this.game.world ? this.game.world.codeAt(x, y) : 0;
        if (code === 0 || code === 4 || code === 5 || code === 6 || code === 7 || code === 8) {
          spot = { x, y, name: this.nameFor(i) };
        }
      }
      this.spots.push(spot || { x: a.x, y: a.y - 40, name: this.nameFor(i) });
    }
  }

  nameFor(i) {
    const names = [
      'Palm of Fortune', 'The Night Bloom', 'Sailor\u2019s Coin', 'Flamingo Secret',
      'Crane\u2019s Prize', 'Runway Relic', 'Neon Pearl', 'The Quiet Frond',
      'Beachcomber\u2019s Luck', 'Coral Crown',
    ];
    return names[i % names.length];
  }

  /** Restore from a save file: array of collected indices. */
  restore(list) {
    if (!Array.isArray(list)) return;
    for (const i of list) this.taken.add(i);
    if (this.taken.size >= TOKEN_COUNT) this.bonusGiven = true;
  }

  serialize() {
    return [...this.taken].sort((a, b) => a - b);
  }

  get collected() {
    return this.taken.size;
  }

  get total() {
    return TOKEN_COUNT;
  }

  update(dt) {
    const game = this.game;
    const p = game.player;
    for (let i = 0; i < this.spots.length; i++) {
      if (this.taken.has(i)) continue;
      const s = this.spots[i];
      if (dist(p.x, p.y, s.x, s.y) < 26) {
        this.taken.add(i);
        game.audio.cash();
        game.effects.push({ type: 'cash', x: s.x, y: s.y, t: 0, dur: 1.0 });
        game.hud.subtitle(`Token ${this.taken.size}/${TOKEN_COUNT} — ${s.name}.`, 2.6);
        if (this.taken.size >= TOKEN_COUNT && !this.bonusGiven) {
          this.bonusGiven = true;
          p.money += 1000;
          p.giveArmor(100);
          game.hud.big('ALL 10 PALM TOKENS!  $1,000', 4, '#7dff8a');
          game.audio.pass();
        }
      }
    }
  }

  /** Neon palm marker on the ground; drawn before cars so it sits underfoot. */
  draw(ctx) {
    const game = this.game;
    for (let i = 0; i < this.spots.length; i++) {
      if (this.taken.has(i)) continue;
      const s = this.spots[i];
      const pulse = 0.5 + 0.5 * Math.sin(game.time * 3 + i);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
      g.addColorStop(0, `rgba(95, 255, 138, ${0.25 + pulse * 0.2})`);
      g.addColorStop(1, 'rgba(95,255,138,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      // tiny palm glyph
      ctx.strokeStyle = '#5cff8a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 7);
      ctx.lineTo(0, -2);
      ctx.stroke();
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k / 4 - 0.5) * 2.2;
        ctx.beginPath();
        ctx.moveTo(0, -2);
        ctx.quadraticCurveTo(Math.cos(a) * 5, -6 + Math.sin(a) * 3, Math.cos(a) * 8, -2 + Math.sin(a) * 4);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}
