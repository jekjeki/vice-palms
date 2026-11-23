// traffic.js — lane AI for civilian cars: keep to the right lane, obey the
// lights, queue behind the car ahead, and pick a turn at each intersection.

import { CFG } from './config.js';
import { CAR_SPECS, makeTrafficCar, DIR_ANG } from './cars.js';
import { clamp, dist, angMove, vecNorm } from './util.js';

const CIV_WEIGHTS = CAR_SPECS.map((s) => ({
  item: s,
  w: s.kind === 'sport' ? 2 : s.kind === 'taxi' ? 3 : s.kind === 'bus' ? 1 : s.kind === 'truck' ? 2 : 4,
}));

// cardinal vectors: E S W N
const DVX = [1, 0, -1, 0];
const DVY = [0, 1, 0, -1];

export class Traffic {
  constructor(game) {
    this.game = game;
    this.cars = [];           // subset of game.cars that are civilian AI
    this.spawnTimer = 0;
    this.rng = game.rngTraffic;
  }

  /** Seed the streets around a point. */
  populate(cx, cy) {
    for (let i = 0; i < CFG.TRAFFIC_COUNT; i++) {
      this.trySpawn(cx, cy, 200, 1100, true);
    }
  }

  trySpawn(cx, cy, rMin, rMax, initial) {
    const game = this.game;
    if (this.cars.length >= CFG.TRAFFIC_COUNT) return null;
    const spot = game.world.randomLaneSpawn(this.rng, cx, cy, rMax);
    if (!spot) return null;
    const d = dist(spot.x, spot.y, cx, cy);
    if (!initial && d < rMin) return null;
    // don't spawn on top of an existing car
    for (const c of game.cars) {
      if (dist(c.x, c.y, spot.x, spot.y) < 70) return null;
    }
    const spec = this.rng.weighted(CIV_WEIGHTS);
    const car = makeTrafficCar(spec, spot.x, spot.y, spot.dir);
    car.speed = CFG.TRAFFIC_SPEED * this.rng.range(0.55, 0.95);
    game.cars.push(car);
    this.cars.push(car);
    return car;
  }

  update(dt) {
    const game = this.game;
    const px = game.viewX(), py = game.viewY();

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.7;
      // despawn cars that fell far behind or wrecked out
      this.cars = this.cars.filter((c) => {
        if (c.exploded || c.dead) return false;
        if (dist(c.x, c.y, px, py) > 1500) return false;
        return true;
      });
      // prune the game's master list too
      game.cars = game.cars.filter((c) => {
        if (c === game.player.car) return true;
        if (c.driver === 'player') return true;
        if (c.driver === 'cop') return true;
        if (c.missionTag) return true;
        if (c.parked) return dist(c.x, c.y, px, py) < 1400;
        return true; // traffic list handles its own
      });
      this.trySpawn(px, py, 520, 1100, false);
    }

    for (const car of this.cars) {
      if (car.dead || car.exploded) continue;
      if (car.driver === 'player') continue;
      this.driveAI(car, dt);
      car.control(car.throttle ?? 0.4, car.steer ?? 0, false, dt, game.weather ? game.weather.gripMult() : 1);
    }
  }

  /** Lane-following brain for one civilian car. */
  driveAI(car, dt) {
    const game = this.game;
    const world = game.world;
    const dir = car.dir;
    const hx = DVX[dir], hy = DVY[dir];

    // --- stuck detection: too slow for too long -> respawn elsewhere
    if (Math.abs(car.speed) < 8) {
      car.blockedTimer += dt;
      if (car.blockedTimer > 9) {
        car.exploded = true;
        car.dead = true;
        car.hp = 0;
        return;
      }
    } else car.blockedTimer = 0;

    // --- find the next intersection ahead
    let targetIx = null;
    let bestD = 1e9;
    for (const ix of world.intersections) {
      const along = (ix.x - car.x) * hx + (ix.y - car.y) * hy;
      const across = Math.abs((ix.x - car.x) * -hy + (ix.y - car.y) * hx);
      if (along > 8 && along < 340 && across < 40) {
        if (along < bestD) { bestD = along; targetIx = ix; }
      }
    }

    // --- desired speed
    let want = CFG.TRAFFIC_SPEED * (car.spec.kind === 'bus' || car.spec.kind === 'truck' ? 0.72 : 1);
    let stopLine = false;

    if (targetIx) {
      // light check: stop before the box on red for our axis
      const nsGreen = world.lightNS(targetIx.x, targetIx.y, game.time);
      const weGo = (dir === 0 || dir === 2) ? !nsGreen : nsGreen;
      const inBox = bestD < 44;
      if (!weGo && !inBox) {
        if (bestD < 74) { want = 0; stopLine = true; }
        else if (bestD < 120) want *= bestD / 120;
      }
      // pick a turn when we get close to the center
      if (bestD < 52 && !car.turnTarget) {
        const r = this.rng.next();
        let nd;
        if (r < 0.62) nd = dir;
        else if (r < 0.81) nd = (dir + 3) % 4;  // left
        else nd = (dir + 1) % 4;                // right
        car.turnTarget = nd;
      }
    }

    // --- queue behind the car ahead
    const probeLen = 26 + Math.abs(car.speed) * 0.55;
    const ahead = this.probeAhead(car, hx, hy, probeLen);
    if (ahead) {
      const gap = ahead.d - 30;
      want = Math.min(want, Math.max(0, gap * 2.2));
      if (gap < 6) want = 0;
    }

    // --- player blocking the lane: honk-stop
    const p = game.player;
    if (p.car !== car) {
      const pd = (p.x - car.x) * hx + (p.y - car.y) * hy;
      const pc = Math.abs((p.x - car.x) * -hy + (p.y - car.y) * hx);
      const pr = p.car ? 46 : 30;
      if (pd > 0 && pd < probeLen + 30 && pc < pr) {
        want = Math.min(want, Math.max(0, (pd - 34) * 2));
        // leaning on the horn
        car.honkT = (car.honkT || 0) - dt;
        if (want < 20 && car.honkT <= 0) {
          car.honkT = 1.6 + this.rng.next();
          game.audio.playTone(335, 0.32, 0.09, 'square');
          game.audio.playTone(270, 0.32, 0.07, 'square');
        }
      }
    }

    // --- steer: track lane center, then swing through the intersection
    const lane = world.lanePos(car.x, car.y, car.turnTarget !== null && bestD < 46 ? car.turnTarget : dir);
    const desiredAng = Math.atan2(lane.y - car.y, lane.x - car.x);
    let steer = 0;
    const angErr = Math.atan2(Math.sin(desiredAng - car.ang), Math.cos(desiredAng - car.ang));
    if (Math.abs(angErr) > 0.02) steer = clamp(angErr * 2.4, -1, 1);

    // commit through the turn
    if (car.turnTarget !== null && bestD < 46) {
      const tAng = DIR_ANG[car.turnTarget];
      const err = Math.atan2(Math.sin(tAng - car.ang), Math.cos(tAng - car.ang));
      steer = clamp(err * 2.8, -1, 1);
    }
    if (bestD < 24 && car.turnTarget !== null) {
      car.dir = car.turnTarget;
      car.turnTarget = null;
      // snap back onto the new lane cleanly
      const lp = world.lanePos(car.x, car.y, car.dir);
      car.x = car.x + (lp.x - car.x) * 0.35;
      car.y = car.y + (lp.y - car.y) * 0.35;
    }

    // --- throttle toward want
    const cur = car.speed;
    let throttle = 0;
    if (cur < want - 6) throttle = clamp((want - cur) / 60, 0.2, 1);
    else if (cur > want + 10) throttle = -clamp((cur - want) / 80, 0.2, 1);
    else throttle = 0.12;
    car.throttle = throttle;
    car.steer = steer;
  }

  /** Nearest car/obstacle ahead of `car` along its heading. */
  probeAhead(car, hx, hy, len) {
    const game = this.game;
    let best = null, bestD = 1e9;
    const ox = -hy, oy = hx; // lateral axis
    for (const o of game.cars) {
      if (o === car || o.dead) continue;
      const dx = o.x - car.x, dy = o.y - car.y;
      const along = dx * hx + dy * hy;
      if (along <= 12 || along > len) continue;
      const across = Math.abs(dx * ox + dy * oy);
      if (across > 26) continue;
      if (along < bestD) { bestD = along; best = { car: o, d: along }; }
    }
    return best;
  }
}
