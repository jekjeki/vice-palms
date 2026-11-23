// ============================================================================
// VICE PALMS — traffic.js
// Civilian traffic: cars follow the right-hand lane grid, obey traffic lights,
// queue behind each other, brake for pedestrians, panic at gunfire, pick
// turns at intersections and despawn far from the player.
// ============================================================================

import { TRAFFIC, TILE, LANE, COLS, ROWS, CITY_W, CITY_H } from './config.js';
import { clamp, angleDiff } from './util.js';
import { Car, VEHICLES } from './cars.js';

// dir index: 0=E(+x) 1=S(+y) 2=W(-x) 3=N(-y)
const DV = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const CIVILIAN_WEIGHTS = [
  ['sedan', 30], ['pickup', 16], ['van', 14], ['muscle', 12], ['taxi', 12],
  ['sport', 10], ['bus', 6],
];

export function dirVec(d) {
  return DV[d & 3];
}

export class Traffic {
  constructor(game) {
    this.game = game;
    this.spawnT = 0;
    this.initialized = false;
  }

  count() {
    let n = 0;
    for (const c of this.game.cars) if (c.aiKind === 'civ' && !c.remove) n++;
    return n;
  }

  spawnInitial(n) {
    if (this.initialized) return;
    this.initialized = true;
    for (let k = 0; k < n; k++) this.trySpawn(true);
  }

  pickType() {
    const roll = this.game.rngWorld.next() * 100;
    let acc = 0;
    for (const [t, w] of CIVILIAN_WEIGHTS) {
      acc += w;
      if (roll < acc) return t;
    }
    return 'sedan';
  }

  trySpawn(anywhere = false) {
    const g = this.game;
    const p = g.player.inCar || g.player;
    const px = p.x, py = p.y;
    const pt = g.world.randomLanePoint(g.rngWorld, px, py,
      anywhere ? 20 : TRAFFIC.SPAWN_DIST_MIN,
      anywhere ? 260 : TRAFFIC.SPAWN_DIST_MAX);
    if (!pt) return null;
    // Keep offscreen spawns only (unless seeding the world at boot).
    if (!anywhere) {
      const halfW = 640 / (g.cam.z * 7.2) + 8;
      const halfH = 360 / (g.cam.z * 7.2) + 8;
      if (Math.abs(pt.x - g.cam.x) < halfW && Math.abs(pt.y - g.cam.y) < halfH) return null;
    }
    const type = this.pickType();
    const angle = pt.dir * (Math.PI / 2); // 0=E,1=S,2=W,3=N
    const car = new Car(g, type, pt.x, pt.y, angle);
    car.driver = 'ai';
    car.aiKind = 'civ';
    car.ai = {
      dir: pt.dir,
      laneCoord: this.laneCoordFor(pt),
      turn: 0,
      decidedKey: null,
      fleeT: 0,
      stuckT: 0,
      cruise: car.spec.top * TRAFFIC.CIVILIAN_TOP,
      laneJitter: g.rngWorld.range(-0.5, 0.5),
    };
    // A few cars drive a touch faster than others — texture, not chaos.
    car.ai.cruise *= 0.85 + g.rngWorld.next() * 0.35;
    g.cars.push(car);
    return car;
  }

  laneCoordFor(pt) {
    // For vertical movement the lane is a fixed x; for horizontal a fixed y.
    const vertical = pt.dir === 1 || pt.dir === 3;
    return vertical ? pt.x : pt.y;
  }

  panic(x, y, r) {
    for (const c of this.game.cars) {
      if (c.aiKind !== 'civ' || !c.ai) continue;
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < r) c.ai.fleeT = 2.5 + Math.random() * 3;
    }
  }

  update(dt) {
    const g = this.game;
    if (!this.initialized) this.spawnInitial(Math.floor(TRAFFIC.MAX_CARS * 0.7));

    // Top-up spawns.
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.count() < TRAFFIC.MAX_CARS) {
      this.spawnT = 0.55;
      this.trySpawn(false);
    }

    const t = g.time;
    for (const car of g.cars) {
      if (car.aiKind !== 'civ' || car.remove) continue;
      if (car.wrecked) continue;
      if (!car.ai) { car.aiKind = null; continue; }

      const p = g.player.inCar || g.player;
      const dPlayer = Math.hypot(car.x - p.x, car.y - p.y);
      if (dPlayer > TRAFFIC.DESPAWN_DIST) { car.remove = true; continue; }

      if (car.ai.fleeT > 0) car.ai.fleeT -= dt;
      this.drive(car, dt, t);

      // Stuck cleanup: immobile, offscreen, long enough -> gone.
      if (car.speed() < 0.5 && dPlayer > 70) {
        car.ai.stuckT += dt;
        if (car.ai.stuckT > 6) car.remove = true;
      } else {
        car.ai.stuckT = 0;
      }
    }
  }

  drive(car, dt, t) {
    const g = this.game;
    const ai = car.ai;
    const dv = DV[ai.dir];
    const vertical = ai.dir === 1 || ai.dir === 3;

    // --- next node ahead -------------------------------------------------
    let nodeIdx, nodeDist;
    if (vertical) {
      const along = car.y;
      if (ai.dir === 1) { nodeIdx = Math.ceil((along + 0.01) / TILE); nodeDist = nodeIdx * TILE - along; }
      else { nodeIdx = Math.floor((along - 0.01) / TILE); nodeDist = along - nodeIdx * TILE; }
    } else {
      const along = car.x;
      if (ai.dir === 0) { nodeIdx = Math.ceil((along + 0.01) / TILE); nodeDist = nodeIdx * TILE - along; }
      else { nodeIdx = Math.floor((along - 0.01) / TILE); nodeDist = along - nodeIdx * TILE; }
    }
    const lineIdx = Math.round((vertical ? car.x : car.y) / TILE);
    const ni = vertical ? lineIdx : nodeIdx;
    const nj = vertical ? nodeIdx : lineIdx;

    // --- decide the turn at this node --------------------------------------
    const key = ni + ',' + nj;
    if (nodeDist < 14 && ai.decidedKey !== key) {
      ai.decidedKey = key;
      ai.turn = this.chooseTurn(ai.dir, ni, nj, g.rngWorld);
      car.blinker = ai.turn; // signal while the turn is pending
    }
    // Apply the turn once the node is (roughly) under the car.
    if (nodeDist < 1.5 && ai.turn !== 0) {
      const ndir = ai.turn === 1 ? (ai.dir + 1) & 3 : (ai.dir + 3) & 3;
      const ndv = DV[ndir];
      // New lane coordinate: right-hand side of the new heading.
      const newVertical = ndir === 1 || ndir === 3;
      if (newVertical) {
        const nxLine = (ndir === 3) ? LANE : -LANE; // northbound: +x side
        ai.laneCoord = ni * TILE + (ndir === 3 ? LANE : -LANE);
        ai.dir = ndir;
      } else {
        ai.laneCoord = nj * TILE + (ndir === 0 ? LANE : -LANE);
        ai.dir = ndir;
      }
      ai.turn = 0;
      car.blinker = 0;
      ai.decidedKey = null; // free to decide at the next node
    }

    // --- steering target ----------------------------------------------------
    let tx, ty;
    const dv2 = DV[ai.dir];
    const vertical2 = ai.dir === 1 || ai.dir === 3;
    if (vertical2) {
      ty = car.y + dv2[1] * 11;
      tx = ai.laneCoord + (ai.laneJitter || 0);
    } else {
      tx = car.x + dv2[0] * 11;
      ty = ai.laneCoord + (ai.laneJitter || 0);
    }
    // While inside an intersection with an active turn, cut the corner.
    if (nodeDist < 9 && nodeDist > 1.5 && ai.turn !== 0) {
      const ndir = ai.turn === 1 ? (ai.dir + 1) & 3 : (ai.dir + 3) & 3;
      const ndv2 = DV[ndir];
      const nv = ndir === 1 || ndir === 3;
      if (nv) tx = ni * TILE + (ndir === 3 ? LANE : -LANE) + ndv2[0] * 6;
      else ty = nj * TILE + (ndir === 0 ? LANE : -LANE) + ndv2[1] * 6;
    }

    const desired = Math.atan2(ty - car.y, tx - car.x);
    const diff = angleDiff(car.angle, desired);
    car.steer = clamp(diff * 2.4, -1, 1);

    // --- speed control -------------------------------------------------------
    const turning = Math.abs(diff) > 0.45;
    let cruise = ai.fleeT > 0 ? car.spec.top * 0.9 : ai.cruise;
    if (turning) cruise = Math.min(cruise, 9);

    // Red light: stop short of the node unless fleeing or already committed.
    car.stopReason = null;
    const axis = (ai.dir % 2 === 0) ? 'ew' : 'ns';
    const gd = g.world.greenDir(ni, nj, t);
    const yellow = g.world.isYellow(ni, nj, t);
    const speed = car.speed();
    const canRun = ai.fleeT > 0 || speed < 3.5 || nodeDist < 4.6;
    if (!canRun && gd !== axis && !yellow && nodeDist < 12 && nodeDist > 4.6) {
      cruise = 0;
      car.stopReason = 'light';
    }
    // Left-turn yield: hold before crossing oncoming traffic.
    if (ai.turn === -1 && !canRun && nodeDist < 11 && nodeDist > 3) {
      for (const other of g.cars) {
        if (other === car || other.remove || !other.ai) continue;
        if (other.ai.dir !== ((ai.dir + 2) & 3)) continue;
        const approaching = vertical
          ? Math.abs(other.x - car.x) < 4.5 && Math.abs(other.y - nj * TILE) < 22 && Math.sign(other.y - car.y) === dv2[1] * -1
          : Math.abs(other.y - car.y) < 4.5 && Math.abs(other.x - ni * TILE) < 22 && Math.sign(other.x - car.x) === dv2[0] * -1;
        if (approaching && other.speed() > 3) {
          cruise = 0;
          car.stopReason = 'yield';
          break;
        }
      }
    }

    // Queue / obstacle probe: sample points ahead of the nose.
    const nose = car.nose();
    for (const pd of [2.4, 4.6, 7]) {
      const px = nose.x + dv2[0] * pd;
      const py = nose.y + dv2[1] * pd;
      let blockedBy = null;
      for (const other of g.cars) {
        if (other === car || other.remove) continue;
        if (Math.abs(other.x - px) < 2.3 && Math.abs(other.y - py) < 2.3) { blockedBy = other; break; }
      }
      if (!blockedBy) {
        const pl = g.player;
        if (!pl.inCar && Math.abs(pl.x - px) < 2.2 && Math.abs(pl.y - py) < 2.2) blockedBy = pl;
      }
      if (!blockedBy) {
        for (const ped of g.peds.list) {
          if (ped.dead) continue;
          if (Math.abs(ped.x - px) < 2.0 && Math.abs(ped.y - py) < 2.0) { blockedBy = ped; break; }
        }
      }
      if (blockedBy) {
        cruise = Math.min(cruise, pd < 4 ? 0 : speed * 0.5);
        car.stopReason = car.stopReason || 'queue';
        if (pd < 4 && Math.random() < 0.01) { car.honk = 0.4; g.audio.horn(); }
        break;
      }
    }

    // P-controller to cruise speed.
    const vf = car.forwardSpeed();
    if (vf > cruise + 2.5) {
      car.throttle = 0;
      car.brake = clamp((vf - cruise) / 8, 0.2, 1);
    } else {
      car.brake = 0;
      car.throttle = clamp((cruise - vf) * 0.55, 0, 1);
    }
    if (cruise === 0 && vf < 1) { car.throttle = 0; car.brake = 1; }
  }

  chooseTurn(dir, i, j, rng) {
    if (rng.next() > TRAFFIC.TURN_CHANCE) {
      // Straight only if the road continues.
      const dv = DV[dir];
      const ni = i + dv[0], nj = j + dv[1];
      if (ni >= 0 && ni <= COLS && nj >= 0 && nj <= ROWS) return 0;
    }
    const right = (dir + 1) & 3, left = (dir + 3) & 3;
    const options = [];
    const rdv = DV[right], ldv = DV[left];
    if (i + rdv[0] >= 0 && i + rdv[0] <= COLS && j + rdv[1] >= 0 && j + rdv[1] <= ROWS) options.push(1, 1); // prefer right
    if (i + ldv[0] >= 0 && i + ldv[0] <= COLS && j + ldv[1] >= 0 && j + ldv[1] <= ROWS) options.push(-1);
    if (!options.length) return 1;
    return rng.pick(options);
  }
}
