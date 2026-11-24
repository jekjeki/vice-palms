// Vice Palms — pedestrians: stroll the sidewalks, flee gunfire, get wasted
import { S, crime, addDecal } from './game.js';

const SHIRTS = ['#e0567a', '#56b3e0', '#e0c956', '#8fe056', '#b98fe0', '#e08a56', '#d8d8d8', '#7a8be0'];
const SKINS = ['#e8b48a', '#c98d5f', '#8a5f3f', '#f0d0b0'];

export class Peds {
  constructor() { this.list = []; }

  spawnAt(x, y) {
    const q = {
      x, y, a: S.rng() * Math.PI * 2, spd: 55 + S.rng() * 35,
      mode: 'walk', t: 1 + S.rng() * 3, dead: false, deadT: 0,
      shirt: SHIRTS[(S.rng() * SHIRTS.length) | 0], skin: SKINS[(S.rng() * SKINS.length) | 0],
      gang: S.rng() < 0.12,
      kill() {
        if (this.dead) return;
        this.dead = true; this.deadT = 0;
        addDecal(this.x, this.y, 14, 'rgba(120,10,16,0.7)');
        S.stats.kills++;
        crime(this.gang ? 0.6 : 1);
        S.peds.panic(this.x, this.y, 380);
        S.audio.blip(140, 0.12, 'sawtooth', 0.06);
      },
    };
    this.list.push(q);
    return q;
  }

  update(dt) {
    const p = S.player, focus = p.inCar || p;
    // population control
    for (let i = this.list.length - 1; i >= 0; i--) {
      const q = this.list[i];
      if (q.dead) { q.deadT += dt; if (q.deadT > 14) this.list.splice(i, 1); continue; }
      if (Math.abs(q.x - focus.x) > 2000 || Math.abs(q.y - focus.y) > 2000) this.list.splice(i, 1);
    }
    let live = 0;
    for (const q of this.list) if (!q.dead) live++;
    if (live < 16 && S.frame % 14 === 0) {
      const pt = S.world.sidewalkPoint(S.rng);
      const d = Math.hypot(pt.x - focus.x, pt.y - focus.y);
      if (d > 500 && d < 1700) this.spawnAt(pt.x, pt.y);
    }

    // run-over check (player car + traffic + cops)
    const cars = S.traffic.cars.concat(S.police.cops);
    if (p.inCar) cars.push(p.inCar);

    for (const q of this.list) {
      if (q.dead) continue;
      if (q.mode === 'flee') {
        q.t -= dt;
        if (q.t <= 0) q.mode = 'walk';
        q.spd = 190;
      }
      q.x += Math.cos(q.a) * q.spd * dt;
      q.y += Math.sin(q.a) * q.spd * dt;
      const hits = S.world.resolveCircle(q, 9);
      if (hits.length || S.rng() < 0.005) q.a += Math.PI / 2 + S.rng() * Math.PI;

      for (const c of cars) {
        if (c.dead || Math.abs(c.spd) < 70) continue;
        if (c.contains(q.x, q.y)) {
          q.kill();
          c.damage(Math.abs(c.spd) * 0.02, 'wall');
          if (c === p.inCar) crime(1);
          S.shake = Math.min(10, S.shake + 3);
        }
      }
    }
  }

  panic(x, y, r) {
    for (const q of this.list) {
      if (q.dead) continue;
      const d = Math.hypot(q.x - x, q.y - y);
      if (d < r) {
        q.mode = 'flee'; q.t = 3 + S.rng() * 3;
        q.a = Math.atan2(q.y - y, q.x - x) + (S.rng() - 0.5);
      }
    }
  }

  hitPed(x, y) {
    for (const q of this.list) {
      if (!q.dead && Math.hypot(q.x - x, q.y - y) < 11) return q;
    }
    return null;
  }
}
