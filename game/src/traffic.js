// traffic.js — ambient lane AI: follows lanes, obeys lights, queues, turns at intersections
import { CFG } from './config.js';
import { clamp, angDiff, dist } from './util.js';

const DIRS = { E: 0, S: Math.PI / 2, W: Math.PI, N: -Math.PI / 2 };

export class TrafficAI {
  constructor(car, dirKey) {
    this.car = car;
    this.dir = DIRS[dirKey] ?? 0;
    this.laneOff = CFG.LANE_OFF;
    this.wait = 0;
    this.stun = 0;
    this.turnedRecently = 0;
    this.panic = 0;
    this.honked = 0;
    this.cruise = 0.62 + Math.random() * 0.3; // fraction of max speed
  }

  stun(t) { this.stun = Math.max(this.stun, t); }

  // true when travelling horizontally
  axisH() { return Math.abs(Math.cos(this.dir)) > 0.5; }

  drive(car, game, dt) {
    if (car.state !== 'drive') return { t: 0, s: 0 };
    this.stun = Math.max(0, this.stun - dt);
    this.turnedRecently = Math.max(0, this.turnedRecently - dt);
    this.panic = Math.max(0, this.panic - dt);
    if (game.wanted >= 3) this.panic = 1.5;

    const R = CFG.ROAD_SPACING;
    const horiz = this.axisH();
    const fwd = car.speedFwd;

    // --- target lane center ------------------------------------------------
    let laneY, laneX;
    if (horiz) {
      const ry = Math.round(car.y / R) * R;
      laneY = this.dir === 0 ? ry + this.laneOff : ry - this.laneOff;
      laneX = car.x + Math.cos(this.dir) * 200;
    } else {
      const rx = Math.round(car.x / R) * R;
      laneX = this.dir === Math.PI / 2 ? rx - this.laneOff : rx + this.laneOff;
      laneY = car.y + Math.sin(this.dir) * 200;
    }

    // steer toward lane heading (correct lateral drift + heading)
    let s = 0;
    const headErr = angDiff(car.h, this.dir);
    if (horiz) {
      const latErr = (laneY - car.y) * (this.dir === 0 ? 1 : -1);
      s = clamp(latErr * 0.03 + headErr * 1.6, -1, 1);
    } else {
      const latErr = (laneX - car.x) * (this.dir === Math.PI / 2 ? -1 : 1);
      s = clamp(latErr * 0.03 + headErr * 1.6, -1, 1);
    }

    // --- intersection handling ---------------------------------------------
    let t = this.cruise * (this.panic > 0 ? 1 : 0.85);
    const along = horiz ? car.x : car.y;
    const moving = horiz ? Math.cos(this.dir) : Math.sin(this.dir);
    const nextCross = moving > 0
      ? Math.ceil((along + 10) / R) * R
      : Math.floor((along - 10) / R) * R;
    const dToCross = Math.abs(nextCross - along);

    // traffic light: stop line 46 before center (only when light controls this axis)
    const ix = Math.round((horiz ? nextCross : car.x) / R);
    const iy = Math.round((horiz ? car.y : nextCross) / R);
    const isLight = this.isControlled(ix, iy);
    if (isLight && dToCross < 90 && dToCross > 8) {
      const phase = world_phase(game, ix, iy);
      const myAxis = horiz ? 'ew' : 'ns';
      if (phase !== myAxis && fwd < 90) t = 0; // stop for red
    }

    // turn decision at intersection center (not every one, keep straight bias)
    if (dToCross < 26 && this.turnedRecently <= 0 && fwd > 10) {
      const r = Math.random();
      const onEdge = nextCross < R || nextCross > (horiz ? CFG.AIR_W - 40 : CFG.SAND_S - 60);
      if (!onEdge && r < 0.28) {
        this.turn(game);
        this.turnedRecently = 1.2;
        return { t: 0.4, s: 0 };
      }
    }

    // --- queueing: car ahead blocks -----------------------------------------
    const ahead = this.carAhead(car, game);
    if (ahead) {
      const d = ahead.d;
      if (d < 34) t = -0.4;           // hard stop / slight reverse creep
      else if (d < 76) t = -0.15;     // brake
      if (d < 60 && Math.random() < dt * 0.4 && this.honked <= 0) {
        this.honked = 2.5; car.horn = 0.4;
        game.audio?.carHorn?.();
      }
    }

    // panic acceleration for fleeing traffic
    if (this.panic > 0) t = Math.max(t, 0.9);
    if (this.stun > 0) t = 0;

    return { t, s };
  }

  isControlled(ix, iy) {
    return (ix % 2 === 1) && (iy % 2 === 1);
  }

  // nearest car within a front cone
  carAhead(car, game) {
    let best = null;
    const c = Math.cos(car.h), s = Math.sin(car.h);
    for (const o of game.cars) {
      if (o === car) continue;
      const dx = o.x - car.x, dy = o.y - car.y;
      const fd = dx * c + dy * s;
      if (fd < 8 || fd > 110) continue;
      const ld = Math.abs(-dx * s + dy * c);
      if (ld > (car.wid + o.wid) / 2 + 4) continue;
      if (!best || fd < best.d) best = { car: o, d: fd };
    }
    // also brake for the player on foot (jaywalker mercy)
    const p = game.player;
    if (p && p.alive && !p.inCar) {
      const dx = p.x - car.x, dy = p.y - car.y;
      const fd = dx * c + dy * s;
      if (fd > 4 && fd < 90 && Math.abs(-dx * s + dy * c) < 26) {
        if (!best || fd < best.d) best = { car: p, d: fd, player: true };
      }
    }
    return best;
  }

  turn(game) {
    // rotate 90°, then snap onto the new lane
    const horiz = this.axisH();
    const dirKeys = Object.keys(DIRS);
    const idx = dirKeys.findIndex((k) => DIRS[k] === this.dir);
    const right = Math.random() < 0.5;
    const nIdx = (idx + (right ? 1 : 3)) % 4;
    this.dir = DIRS[dirKeys[nIdx]];
    this.car.blinkT = 1.4;
    const R = CFG.ROAD_SPACING;
    const car = this.car;
    if (horiz) {
      // was horizontal -> now vertical
      const rx = Math.round(car.x / R) * R;
      car.x = this.dir === Math.PI / 2 ? rx - this.laneOff : rx + this.laneOff;
    } else {
      const ry = Math.round(car.y / R) * R;
      car.y = this.dir === 0 ? ry + this.laneOff : ry - this.laneOff;
    }
    car.h = this.dir;
  }
}

function world_phase(game, ix, iy) {
  return game.world.lightPhase(ix, iy, game.t);
}

// spawn an ambient traffic car on the nearest lane to (x, y); returns null if blocked
export function spawnTraffic(game, x, y, type) {
  const R = CFG.ROAD_SPACING;
  const ry = Math.round(y / R) * R;
  const rx = Math.round(x / R) * R;
  const nearH = Math.abs(y - ry) <= Math.abs(x - rx);
  const dirKey = nearH ? (Math.random() < 0.5 ? 'E' : 'W') : (Math.random() < 0.5 ? 'S' : 'N');
  const h = DIRS[dirKey];
  const dir = DIRS[dirKey];
  const horiz = Math.abs(Math.cos(dir)) > 0.5;
  const off = CFG.LANE_OFF;
  const px = horiz ? x : (dir === Math.PI / 2 ? rx - off : rx + off);
  const py = horiz ? (dir === 0 ? ry + off : ry - off) : y;
  // never spawn overlapping another car or a solid
  for (const o of game.cars) {
    if (Math.abs(o.x - px) < 110 && Math.abs(o.y - py) < 70) return null;
  }
  for (const r of game.world.nearSolids(px, py)) {
    if (px >= r.x0 - 40 && px <= r.x1 + 40 && py >= r.y0 - 30 && py <= r.y1 + 30) return null;
  }
  const car = game.addCar(type, px, py, h);
  car.driver = 'ai';
  car.ai = new TrafficAI(car, dirKey);
  return car;
}
