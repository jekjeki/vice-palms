// The wanted system: 1-5 stars with heat events, line-of-sight decay, and the star HUD value.

import { STAR_DECAY_TIME } from '../config.js';
import { dist2 } from '../util.js';

const STAR_EVENTS = { carjack: 1, pedHit: 1, pedKill: 1, shooting: 2, copKill: 3 };

export class Wanted {
  constructor(game) {
    this.game = game;
    this.stars = 0;
    this.decayT = 0;
  }

  add(event) {
    const before = this.stars;
    const add = STAR_EVENTS[event] ?? 1;
    this.stars = Math.min(5, this.stars + add);
    this.decayT = 0;
    if (this.stars > before) {
      this.game.audio.blip(220 + this.stars * 60);
      if (before === 0) this.game.onWantedStart();
    }
  }

  /** Shooting an unconcealed shot adds two stars; a hit ped keeps its own event. */
  gunshot() { this.add('shooting'); }

  update(dt, player) {
    if (this.stars === 0) return;
    const game = this.game;
    // Out of sight: no cop within sight radius and the player not in a cop's forward cone.
    let seen = false;
    for (const c of game.police.cars) {
      if (!c.dead && dist2(c.x, c.y, player.x, player.y) < 760 * 760) { seen = true; break; }
    }
    if (!seen) for (const f of game.police.footCops) {
      if (!f.dead && dist2(f.x, f.y, player.x, player.y) < 620 * 620) { seen = true; break; }
    }
    if (seen) this.decayT = 0;
    else {
      this.decayT += dt;
      if (this.decayT > STAR_DECAY_TIME) {
        this.decayT = 0;
        this.stars -= 1;
        game.audio.blip(160);
        if (this.stars === 0) game.onWantedClear();
      }
    }
  }

  clear() { this.stars = 0; this.decayT = 0; }
}
