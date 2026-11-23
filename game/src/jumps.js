// jumps.js — stunt ramps scattered around Vice Palms: hit one fast, catch air, get paid.
import { CFG } from './config.js';
import { dist } from './util.js';

// ramp positions (deterministic, on straights or lots)
export const RAMP_SPOTS = [
  { x: 2560, y: 2395, h: 0 },          // eastbound on 8th
  { x: 1020, y: 2025, h: Math.PI },    // westbound on 6th
  { x: 2395, y: 1450, h: Math.PI / 2 },// southbound on 7th ave
  { x: 340, y: 2750, h: 0 },
  { x: 3740, y: 3050, h: Math.PI },
  { x: 2260, y: 1660, h: Math.PI / 2 },// parking lot jump
  { x: 3380, y: 2480, h: -Math.PI / 2 },
  { x: 1700, y: 3355, h: Math.PI },
];

export class Jumps {
  constructor(game) {
    this.game = game;
    this.airT = 0;
    this.airborne = false;
    this.best = 0;
    this.totalPaid = 0;
    this.cool = 0;
    this.lastRamp = null;
  }

  update(dt) {
    const g = this.game, p = g.player;
    this.cool = Math.max(0, this.cool - dt);
    if (!p.inCar) { this.airborne = false; this.airT = 0; return; }
    const car = p.inCar;
    if (car.state === 'wreck') return;

    // launch off a ramp: fast + within the ramp trigger box
    if (!this.airborne && this.cool <= 0 && car.speed > 170) {
      for (const r of RAMP_SPOTS) {
        if (dist(car.x, car.y, r.x, r.y) < 34 && Math.abs(car.speedFwd) > 150) {
          this.airborne = true;
          this.airT = 0;
          this.lastRamp = r;
          this.cool = 2.5;
          g.audio?.nitro?.();
          g.hud.toast('AIRBORNE!');
          // visual: launch burst
          g.fxBurst(car.x, car.y, 'spark', 10);
          break;
        }
      }
    }

    if (this.airborne) {
      this.airT += dt;
      if (car.speed < 60 || this.airT > 2.2) this.land();
    }
  }

  land() {
    const g = this.game;
    this.airborne = false;
    const t = this.airT;
    this.airT = 0;
    if (t < 0.45) return;
    const pay = Math.round(t * 160);
    g.player.money += pay;
    this.totalPaid += pay;
    this.best = Math.max(this.best, t);
    g.stats.jumps = (g.stats.jumps || 0) + 1;
    g.hud.banner('STUNT JUMP', '+' + '$' + pay + '  ·  ' + t.toFixed(1) + 's of air');
    g.audio?.missionDone?.();
    g.cam.shake = Math.min(CFG.SHAKE_MAX, g.cam.shake + 5);
  }

  serialize() { return { best: this.best, totalPaid: this.totalPaid, jumps: g_jumps(this) }; }
  deserialize(d) { if (d) { this.best = d.best ?? 0; this.totalPaid = d.totalPaid ?? 0; if (this.game.stats) this.game.stats.jumps = Math.max(this.game.stats.jumps || 0, d.jumps ?? 0); } }
}

function g_jumps(self) { return self.game.stats.jumps || 0; }
