// Vice Palms — lane-following ambient traffic
import { S, addParticles } from './game.js';
import { Car } from './cars.js';
import { CITY_W, CITY_H, PITCH } from './world.js';

const AMBIENT = 13;

export class Traffic {
  constructor() { this.cars = []; }
  spawnAt(x, y, a, type) {
    const c = new Car(x, y, a, type || ['compact', 'sedan', 'coupe', 'taxi', 'pickup', 'van', 'sport'][(Math.random() * 7) | 0]);
    c.driver = 'traffic';
    c.lane = { axis: Math.abs(Math.sin(a)) < 0.7 ? 'h' : 'v', dir: Math.cos(a) >= 0 ? 1 : -1, cruise: 150 + Math.random() * 80 };
    if (c.lane.axis === 'h') c.lane.road = Math.round(y / PITCH) * PITCH;
    else c.lane.road = Math.round(x / PITCH) * PITCH;
    this.cars.push(c);
    return c;
  }

  update(dt) {
    const p = S.player, focus = p.inCar || p;
    // population control
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      if (c.dead && c.burnT <= 0) { this.cars.splice(i, 1); continue; }
      if (c !== p.inCar && (Math.abs(c.x - focus.x) > 2300 || Math.abs(c.y - focus.y) > 2300)) {
        this.cars.splice(i, 1); continue;
      }
    }
    let live = 0;
    for (const c of this.cars) if (!c.dead) live++;
    if (live < AMBIENT && S.frame % 20 === 0) {
      const pt = S.world.randomRoadPoint(S.rng);
      const d = Math.hypot(pt.x - focus.x, pt.y - focus.y);
      if (d > 750 && d < 2100) this.spawnAt(pt.x, pt.y, 0);
    }

    for (const c of this.cars) {
      if (c === p.inCar) continue;         // player's car is driven by player.js
      if (c.dead) { c.burnT -= dt; continue; }
      if (!c.lane) this.relane(c);         // car was player-driven; give it a lane back
      this.drive(c, dt);
    }
    this.collisions();
  }

  // assign a lane on the nearest road (used after a car leaves player control)
  relane(c) {
    const w = S.world;
    let bv = 1e9, rv = 0, bh = 1e9, rh = 0;
    for (const v of w.roadsV) { const d = Math.abs(c.x - v); if (d < bv) { bv = d; rv = v; } }
    for (const h of w.roadsH) { const d = Math.abs(c.y - h); if (d < bh) { bh = d; rh = h; } }
    if (bv <= bh) c.lane = { axis: 'v', road: rv, dir: S.rng() < 0.5 ? 1 : -1, cruise: 150 + S.rng() * 80 };
    else c.lane = { axis: 'h', road: rh, dir: S.rng() < 0.5 ? 1 : -1, cruise: 150 + S.rng() * 80 };
  }

  drive(c, dt) {
    const L = c.lane, p = S.player, focus = p.inCar || p;
    const fleeing = c.fleeT > 0;
    if (fleeing) c.fleeT -= dt;
    const target = (fleeing ? L.cruise * 1.7 : L.cruise) * (c.stuckT > 1.2 ? 0 : 1);

    // lane position (right-hand traffic)
    if (L.axis === 'h') {
      c.y += (L.road + 24 * L.dir - c.y) * Math.min(1, dt * 4);
      c.a = L.dir > 0 ? 0 : Math.PI;
    } else {
      c.x += (L.road - 24 * L.dir - c.x) * Math.min(1, dt * 4);
      c.a = L.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    // accelerate toward target, brake for obstacles
    const hx = Math.cos(c.a), hy = Math.sin(c.a);
    const px = c.x + hx * 95, py = c.y + hy * 95;
    let blocked = false;
    const all = [...this.cars, ...S.police.cops];
    for (const o of all) {
      if (o === c || o.dead) continue;
      if (Math.hypot(o.x - px, o.y - py) < 62) { blocked = true; break; }
    }
    if (!blocked && !p.inCar && Math.hypot(p.x - px, p.y - py) < 64) blocked = true;
    if (!blocked) {
      for (const q of S.peds.list) {
        if (!q.dead && Math.hypot(q.x - px, q.y - py) < 46) { blocked = true; break; }
      }
    }
    c.spd += ((blocked ? 0 : target) - c.spd) * Math.min(1, dt * (blocked ? 6 : 1.6));
    if (blocked) { c.stuckT = (c.stuckT || 0) + dt; } else c.stuckT = 0;

    c.x += hx * c.spd * dt; c.y += hy * c.spd * dt;

    // intersections: maybe turn
    if (!fleeing && S.frame % 6 === 0) {
      const along = L.axis === 'h' ? c.x : c.y;
      const nearest = Math.round(along / PITCH) * PITCH;
      if (nearest > 0 && nearest < (L.axis === 'h' ? CITY_W : CITY_H) && Math.abs(along - nearest) < 26) {
        if (S.rng() < 0.22) {
          const oldAxis = L.axis;
          L.axis = oldAxis === 'h' ? 'v' : 'h';
          L.road = nearest;
          L.dir = S.rng() < 0.5 ? 1 : -1;
          c.x = oldAxis === 'h' ? nearest : c.x;
          c.y = oldAxis === 'h' ? c.y : nearest;
        }
      }
    }
    // bounds
    if (c.x < 40 || c.x > CITY_W - 40 || c.y < 40 || c.y > CITY_H + 260) {
      L.dir *= -1;
      c.x = Math.max(40, Math.min(CITY_W - 40, c.x));
      c.y = Math.max(40, Math.min(CITY_H + 260, c.y));
    }
  }

  // car↔car separation + ram damage
  collisions() {
    const p = S.player;
    const all = [...this.cars, ...S.police.cops];
    if (p.inCar && !p.inCar.dead) all.push(p.inCar);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const A = all[i], B = all[j];
        if (A.dead || B.dead) continue;
        const dx = B.x - A.x, dy = B.y - A.y;
        const rr = (A.w + B.w) * 0.33;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 0.01) {
          const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = (rr - d) / 2;
          A.x -= nx * push; A.y -= ny * push;
          B.x += nx * push; B.y += ny * push;
          const rel = Math.hypot(A.vx - B.vx, A.vy - B.vy);
          if (rel > 170) {
            const dmg = rel * 0.09;
            const fromPlayer = A === p.inCar || B === p.inCar;
            A.damage(dmg, fromPlayer ? 'player' : 'wall');
            B.damage(dmg, fromPlayer ? 'player' : 'wall');
            S.shake = Math.min(14, S.shake + rel * 0.02);
            addParticles((A.x + B.x) / 2, (A.y + B.y) / 2, 6, { c: '#ffd77a', r: 5, life: 0.4, spd: 150 });
          }
        }
      }
    }
  }

  hitCar(x, y) {
    for (const c of this.cars) if (!c.dead && c.contains(x, y)) return c;
    return null;
  }
  scare(x, y, r) {
    for (const c of this.cars) {
      if (!c.dead && Math.hypot(c.x - x, c.y - y) < r) c.fleeT = 5;
    }
  }
}
