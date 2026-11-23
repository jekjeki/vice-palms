// stats.js — the tab of things a night in Vice Palms leaves behind: distance
// driven, cars jacked, stars earned, missions passed, money made and lost.
// Shown on the pause screen.

import { fmtMoney, fmtTime } from './util.js';

export class Stats {
  constructor() {
    this.reset();
  }

  reset() {
    this.startedAt = Date.now();
    this.distance = 0;        // metres-ish (px/8)
    this.jacked = 0;
    this.wrecked = 0;
    this.pedsBumped = 0;
    this.copsDown = 0;
    this.stars = 0;           // total stars ever earned
    this.busted = 0;
    this.wasted = 0;
    this.missions = 0;
    this.sides = 0;
    this.earned = 0;
    this.fees = 0;
    this.tokens = 0;
    this.timePlayed = 0;
  }

  bump(key, n) {
    this[key] = (this[key] || 0) + (n === undefined ? 1 : n);
  }

  /** Called with the car speed each frame while driving. */
  addDistance(speed, dt) {
    this.distance += Math.abs(speed) * dt / 8;
  }

  addMoney(n) {
    if (n >= 0) this.earned += n;
    else this.fees += -n;
  }

  /** Rows for the pause panel: [label, value]. */
  rows() {
    return [
      ['TIME PLAYED', fmtTime(this.timePlayed)],
      ['DISTANCE DRIVEN', `${(this.distance / 100).toFixed(1)} km`],
      ['CARS JACKED', String(this.jacked)],
      ['CARS WRECKED', String(this.wrecked)],
      ['PEDESTRIANS BUMPED', String(this.pedsBumped)],
      ['COPS DOWN', String(this.copsDown)],
      ['STARS EARNED', String(this.stars)],
      ['BUSTED / WASTED', `${this.busted} / ${this.wasted}`],
      ['MISSIONS PASSED', String(this.missions)],
      ['SIDE JOBS DONE', String(this.sides)],
      ['TOKENS FOUND', String(this.tokens)],
      ['EARNED', fmtMoney(this.earned)],
      ['FEES PAID', fmtMoney(this.fees)],
    ];
  }
}
