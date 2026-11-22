// The wanted meter: five stars fed by heat events, held by line of sight, bled off one star
// every DECAY_SECS while no officer can see the player.

import { DECAY_SECS } from '../config.js';
import { dist2 } from '../util.js';

const HEAT = { carjack: 1, pedHit: 1, pedKill: 1, gunfire: 2, copKill: 3 };
const CAR_SEES = 780;   // a cruiser spots you this far out
const FOOT_SEES = 640;  // a foot officer's eyes are a little shorter

export class Wanted {
  constructor(game) {
    this.game = game;
    this.stars = 0;
    this.unseen = 0;
  }

  add(event) {
    const before = this.stars;
    this.stars = Math.min(5, this.stars + (HEAT[event] ?? 1));
    this.unseen = 0;
    if (this.stars > before) {
      this.game.audio.blip(215 + this.stars * 60);
      if (before === 0) this.game.onWantedBegin();
    }
  }

  /** A shot fired in the open — two stars of heat on its own. */
  gunshot() { this.add('gunfire'); }

  update(dt, player) {
    if (this.stars === 0) return;
    const game = this.game;
    let seen = false;
    for (const c of game.cops.cruisers) {
      if (!c.wreck && dist2(c.x, c.y, player.x, player.y) < CAR_SEES * CAR_SEES) { seen = true; break; }
    }
    if (!seen) for (const f of game.cops.foot) {
      // A downed officer spots nothing: the street can forget you again.
      if (!f.wreck && f.mode !== 'down' && dist2(f.x, f.y, player.x, player.y) < FOOT_SEES * FOOT_SEES) { seen = true; break; }
    }
    if (seen) this.unseen = 0;
    else {
      this.unseen += dt;
      if (this.unseen > DECAY_SECS) {
        this.unseen = 0;
        this.stars -= 1;
        game.audio.blip(155);
        if (this.stars === 0) game.onWantedClear();
      }
    }
  }

  clear() { this.stars = 0; this.unseen = 0; }
}
