// Traffic: kinematic cars that own a lane on the right-hand side of every street. They cruise,
// keep a speed-proportions gap behind whatever is ahead, brake smoothly for red lights,
// overtake stalled cars through the oncoming lane with a blinker, turn at intersections and
// spawn/despawn in a ring around the player.

import { GRID, PITCH, ROAD, LANE, STOP_GAP, BLINKER_SECS } from '../config.js';
import { Car } from '../entities/car.js';
import { clamp, turnDelta, dist2 } from '../util.js';
import { chance, rand, randInt } from '../rng.js';

const KEEP = 34;            // target live traffic count around the player
const CULL = 3400;          // despawn beyond this range
const BIRTH = 1600;         // spawn ring inner edge
const BIRTH_FAR = 2500;

/** Lane centreline coordinate: right-hand side going `dir` along `axis` on road at `center`. */
export function laneAt(axis, center, dir) {
  return axis === 'x' ? center + dir * LANE : center - dir * LANE;
}

export class Traffic {
  constructor(game) {
    this.game = game;
    this.fleet = [];
    this.scratch = [];
  }

  update(dt, player) {
    const game = this.game;
    for (let i = this.fleet.length - 1; i >= 0; i--) {
      const c = this.fleet[i];
      if (c.role !== 'traffic') { this.fleet.splice(i, 1); continue; }
      if (c.wasted) c.wreckAge = (c.wreckAge ?? 0) - dt;
      if (dist2(c.x, c.y, player.x, player.y) > CULL * CULL || (c.wasted && c.wreckAge < -14)) {
        const at = game.cars.indexOf(c);
        if (at >= 0) game.cars.splice(at, 1);
        this.fleet.splice(i, 1);
        continue;
      }
      if (c.wreck) { c.update(dt, game); continue; }
      this.kinematic(c, dt, player);
      c.update(dt, game);
    }
    while (this.fleet.length < KEEP) {
      const c = this.birth(player);
      if (!c) break;
      this.fleet.push(c);
      game.cars.push(c);
    }
  }

  birth(player) {
    const game = this.game;
    for (let tries = 0; tries < 8; tries++) {
      const vertical = rand() < 0.5;
      const line = randInt(GRID + 1);
      const center = line * PITCH;
      const dir = rand() < 0.5 ? 1 : -1;
      const band = BIRTH + rand() * (BIRTH_FAR - BIRTH);
      const along = (vertical ? player.y : player.x) + band * (rand() < 0.5 ? 1 : -1);
      if (along < 220 || along > GRID * PITCH - 220) continue;
      const x = vertical ? laneAt('y', center, dir) : along;
      const y = vertical ? along : laneAt('x', center, dir);
      if (dist2(x, y, player.x, player.y) < BIRTH * BIRTH) continue;
      const c = new Car(randInt(10), x, y, vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI));
      c.role = 'traffic';
      c.axis = vertical ? 'y' : 'x';
      c.dir = dir;
      c.lane = laneAt(c.axis, center, dir);
      // Cruise speed leans on the model: the Vanta flows faster than the Tramline van.
      c.cruise = 120 + rand() * 80 + c.spec.top * 0.15;
      c.line = line;
      return c;
    }
    return null;
  }

  /** Position, speed and heading all follow the lane model rather than full physics. */
  kinematic(c, dt, player) {
    const game = this.game;
    const alongNow = c.axis === 'y' ? c.y : c.x;
    const laneNow = c.axis === 'y' ? c.x : c.y;

    // Desired speed: cruise minus the gap-keeping limit for whatever is ahead.
    let want = c.cruise;
    // Poor weather makes the whole fleet drive like it is raining (it is).
    if (this.brakeFactor && this.brakeFactor > 1) want /= this.brakeFactor;
    const ahead = this.thingAhead(c, alongNow, laneNow);
    if (ahead !== null) want = Math.min(want, ahead);
    // Red light: ease to the stop line unless we already crossed it.
    const cross = this.nextCross(c.axis, alongNow, c.dir);
    const green = this.lightGreen(c, cross);
    const stopLine = cross - c.dir * (ROAD / 2 + STOP_GAP);
    const before = c.dir > 0 ? alongNow < stopLine : alongNow > stopLine;
    if (!green && before) {
      const gap = Math.abs(stopLine - alongNow);
      want = Math.min(want, Math.max(0, gap * 2.0 - 16));
      c.stopped = true;
    } else {
      c.stopped = false;
    }

    // Overtake: stuck behind something for a while and the oncoming side is clear → slide out.
    c.gearT += dt;
    if (want < 40 && c.gearT > 2.6 && Math.abs(c.laneShift ?? 0) < 1) {
      const open = this.oncomingClear(c, alongNow, laneNow);
      if (open) { c.laneShift = -c.dir * (c.axis === 'x' ? 1 : -1) * LANE * 2; c.blinker = BLINKER_SECS; c.gearT = 0; }
      else c.gearT = 1.2;
    }
    if (c.laneShift && c.blinker <= 0) { c.laneShift *= Math.max(0, 1 - dt * 2.5); if (Math.abs(c.laneShift) < 2) c.laneShift = 0; }
    c.blinker -= dt;

    c.fwd += clamp(want - c.fwd, -420 * dt, 205 * dt);
    if (c.fwd < 0) c.fwd = 0;

    const alongNext = alongNow + c.fwd * dt;
    if (!c.turning && this.crossedCenter(c, alongNow, alongNext, cross)) this.pickTurn(c, cross);
    // Road ends: U-turn back onto the boundary street instead of driving into the sea.
    const edge = c.dir > 0 ? GRID * PITCH : 0;
    if (!c.turning && Math.abs(edge - alongNext) < 70 && Math.abs(edge - alongNow) >= 70) this.pickTurn(c, edge);
    if (c.turning) {
      c.turnT -= dt;
      if (c.turnT <= 0) { c.turning = false; c.ang = c.aimAng; }
    }

    const effLane = c.lane + (c.laneShift ?? 0);
    if (c.axis === 'y') {
      c.y = alongNext;
      c.x += (effLane - c.x) * Math.min(1, dt * 6);
    } else {
      c.x = alongNext;
      c.y += (effLane - c.y) * Math.min(1, dt * 6);
    }
    const laneAng = c.axis === 'y' ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (c.dir > 0 ? 0 : Math.PI);
    if (!c.turning) c.ang += turnDelta(c.ang, laneAng) * Math.min(1, dt * 8);
    else c.ang += turnDelta(c.ang, c.aimAng) * Math.min(1, dt * 10);
    c.vx = Math.cos(c.ang) * c.fwd;
    c.vy = Math.sin(c.ang) * c.fwd;

    // A long wait in a jam earns an indignant horn — city noise the streets should have.
    if (c.stopped && c.fwd < 20 && c.gearT > 4 && chance(dt * 0.06)) {
      c.gearT = 2;
      game.audio.horn?.();
    }
  }

  crossedCenter(c, a0, a1, center) {
    return c.dir > 0 ? (a0 < center && a1 >= center) : (a0 > center && a1 <= center);
  }

  nextCross(axis, along, dir) {
    const line = dir > 0 ? Math.ceil(along / PITCH) : Math.floor(along / PITCH);
    return clamp(line, 0, GRID) * PITCH;
  }

  lightGreen(c, cross) {
    const ix = c.axis === 'x' ? Math.round(cross / PITCH) : Math.round(c.lane / PITCH);
    const iy = c.axis === 'y' ? Math.round(cross / PITCH) : Math.round(c.lane / PITCH);
    const phase = (ix + iy + Math.floor(this.game.time / 9)) % 2;
    return c.axis === 'y' ? phase === 0 : phase === 1;
  }

  /** Speed limit implied by the nearest vehicle/person ahead in the same corridor. */
  thingAhead(c, along, lane) {
    const game = this.game;
    const list = game.grid.near(c.x, c.y, 200, this.scratch);
    let limit = null;
    for (const other of list) {
      if (other === c || other.wasted || !(other instanceof Car || other.speed)) continue;
      if (other.mode === 'down') continue;
      const oAlong = c.axis === 'y' ? other.y : other.x;
      const oLane = c.axis === 'y' ? other.x : other.y;
      const gap = (oAlong - along) * c.dir;
      if (gap <= 10 || gap > 210) continue;
      if (Math.abs(oLane - lane) > 30) continue;
      const closing = Math.max(0, other.fwd ?? 0);
      limit = Math.min(limit ?? 1e9, Math.max(0, closing * 0.92 + (gap - 58) * 1.7));
    }
    // A person crossing the street is an obstacle; the player on foot too.
    const p = game.player;
    if (!p.car) {
      const oAlong = c.axis === 'y' ? p.y : p.x;
      const oLane = c.axis === 'y' ? p.x : p.y;
      const gap = (oAlong - along) * c.dir;
      if (gap > 10 && gap < 150 && Math.abs(oLane - lane) < 30) limit = Math.min(limit ?? 1e9, Math.max(0, (gap - 52) * 2.1));
    }
    return limit === null ? null : Math.min(limit, c.cruise);
  }

  /** Is the oncoming lane free long enough to overtake through? */
  oncomingClear(c, along, lane) {
    const game = this.game;
    const opposite = lane + (c.axis === 'x' ? -1 : 1) * c.dir * LANE * 2;
    const list = game.grid.near(c.x, c.y, 260, this.scratch);
    for (const other of list) {
      if (other === c || other.wasted || !(other instanceof Car)) continue;
      const oAlong = c.axis === 'y' ? other.y : other.x;
      const oLane = c.axis === 'y' ? other.x : other.y;
      if (Math.abs(oLane - opposite) > 26) continue;
      const gap = (oAlong - along) * c.dir;
      if (gap > -120 && gap < 200) return false;
    }
    return true;
  }

  pickTurn(c, cross) {
    // Three intersections in ten become turns; the rest run straight through.
    if (!chance(0.3)) return;
    const perpLine = clamp(Math.round((c.axis === 'y' ? c.x : c.y) / PITCH) + (rand() < 0.5 ? -1 : 1), 0, GRID);
    const newCenter = perpLine * PITCH;
    const newDir = rand() < 0.5 ? 1 : -1;
    const newAxis = c.axis === 'y' ? 'x' : 'y';
    c.lane = laneAt(newAxis, newCenter, newDir);
    c.laneShift = 0;
    // Snap through the intersection centre, then swap onto the crossing street.
    if (c.axis === 'y') { c.x = laneAt('y', cross, c.dir); c.y = cross; }
    else { c.y = laneAt('x', cross, c.dir); c.x = cross; }
    c.axis = newAxis; c.dir = newDir; c.line = perpLine;
    c.turning = true; c.turnT = 0.45;
    c.aimAng = newAxis === 'y' ? (newDir > 0 ? Math.PI / 2 : -Math.PI / 2) : (newDir > 0 ? 0 : Math.PI);
  }

  /** The player rammed a traffic car: shove it, hurt it, cut its speed. */
  ram(victim, hitX, hitY, force, game) {
    victim.damage(Math.max(0, (force - 120) * 0.06), game);
    const push = clamp(force * 0.02, 0, 8);
    const d = Math.hypot(victim.x - hitX, victim.y - hitY) || 1;
    victim.x += ((victim.x - hitX) / d) * push;
    victim.y += ((victim.y - hitY) / d) * push;
    victim.fwd *= 0.4;
  }
}
