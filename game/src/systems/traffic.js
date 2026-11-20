// Traffic AI: kinematic lane-following cars. Each car owns an axis (x|y), a direction and a
// lane coordinate (right-hand traffic), cruises, queues behind cars ahead, stops at red
// lights, turns at intersections and despawns/spawns around the player. Collisions with the
// player shove them and deal damage; carjacking turns one into a free car.

import { BLOCKS, PITCH, ROAD_W, LANE } from '../config.js';
import { Vehicle } from '../entities/vehicle.js';
import { clamp, angDiff, dist2 } from '../util.js';

const KEEP = 34;          // target traffic count around the player
const DESPAWN = 3200;     // despawn radius
const SPAWN_MIN = 1500;   // spawn band
const SPAWN_MAX = 2400;

export class Traffic {
  constructor(game) {
    this.game = game;
    this.cars = [];
  }

  /** Right-hand lane coordinate for a road at `center` travelling with `dir` along the axis. */
  static laneCoord(axis, center, dir) {
    return axis === 'x' ? center - dir * LANE : center + dir * LANE;
  }

  update(dt, player) {
    const game = this.game;
    // Cull far cars and drop any car the player has taken over (it drives itself now).
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      if (c.role !== 'traffic') { this.cars.splice(i, 1); continue; }
      if (dist2(c.x, c.y, player.x, player.y) > DESPAWN * DESPAWN || (c.dead && c.exploded && c.wreckT < -14)) {
        game.vehicles.splice(game.vehicles.indexOf(c), 1);
        this.cars.splice(i, 1);
        continue;
      }
      if (c.dead) { c.wreckT = (c.wreckT ?? 0) - dt; continue; }
      this.driveKinematic(c, dt);
    }
    // Top up the population just off-screen.
    while (this.cars.length < KEEP) {
      const c = this.spawnOne(player);
      if (!c) break;
      this.cars.push(c);
      game.vehicles.push(c);
    }
  }

  spawnOne(player) {
    const game = this.game;
    for (let attempt = 0; attempt < 8; attempt++) {
      const vertical = Math.random() < 0.5;
      const line = Math.floor(Math.random() * (BLOCKS + 1));
      const center = line * PITCH;
      const dir = Math.random() < 0.5 ? 1 : -1;
      const along = vertical
        ? player.y + (SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN)) * (Math.random() < 0.5 ? 1 : -1)
        : player.x + (SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN)) * (Math.random() < 0.5 ? 1 : -1);
      if (along < 200 || along > BLOCKS * PITCH - 200) continue;
      const x = vertical ? Traffic.laneCoord('y', center, dir) : along;
      const y = vertical ? along : Traffic.laneCoord('x', center, dir);
      if (dist2(x, y, player.x, player.y) < SPAWN_MIN * SPAWN_MIN) continue;
      const v = new Vehicle(Math.floor(Math.random() * 8), x, y, vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI));
      v.role = 'traffic';
      v.axis = vertical ? 'y' : 'x';
      v.dir = dir;
      v.lane = vertical ? Traffic.laneCoord('y', center, dir) : Traffic.laneCoord('x', center, dir);
      v.cruise = 140 + Math.random() * 90;
      v.line = line;
      return v;
    }
    return null;
  }

  /** Kinematic lane driving: position follows the lane, angle eases toward the axis heading. */
  driveKinematic(c, dt) {
    const game = this.game;
    const px = c.axis === 'y' ? c.lane : c.y; // perpendicular coordinate as position
    const alongNow = c.axis === 'y' ? c.y : c.x;
    const laneNow = c.axis === 'x' ? c.y : c.x;

    // Desired speed: cruise, minus whatever is ahead of us in this lane.
    let want = c.cruise;
    const ahead = this.obstacleAhead(c, alongNow, laneNow);
    if (ahead !== null) want = Math.min(want, ahead);
    // Red light: stop before the next intersection unless we already crossed its line.
    const nextCross = this.nextIntersection(c.axis, alongNow, c.dir);
    const lightGreen = this.lightGreenFor(c, nextCross);
    const stopLine = nextCross - c.dir * (ROAD_W / 2 + 26);
    const beforeLine = c.dir > 0 ? alongNow < stopLine : alongNow > stopLine;
    if (!lightGreen && beforeLine) {
      const gap = Math.abs(stopLine - alongNow);
      want = Math.min(want, Math.max(0, gap * 2.2 - 20));
      c.stopReason = true;
    } else {
      c.stopReason = false;
    }

    c.speed += clamp(want - c.speed, -420 * dt, 180 * dt);
    if (c.speed < 0) c.speed = 0;

    // Move along the axis; pull the perpendicular coordinate onto the lane centre.
    const alongNext = alongNow + c.speed * dt;
    // Turn decision at intersection centre.
    if (!c.turning && this.passedCenter(c, alongNow, alongNext, nextCross)) {
      this.decideTurn(c, nextCross);
    }
    // Map edge: turn around onto the boundary road instead of driving into the sea.
    const edge = c.dir > 0 ? BLOCKS * PITCH : 0;
    if (!c.turning && Math.abs(edge - alongNext) < 60 && Math.abs(edge - alongNow) >= 60) {
      this.decideTurn(c, edge);
    }
    if (c.turning) {
      c.turnT -= dt;
      if (c.turnT <= 0) { c.turning = false; c.ang = c.targetAng; }
    }

    if (c.axis === 'y') {
      c.y = alongNext;
      c.x += (c.lane - c.x) * Math.min(1, dt * 6);
    } else {
      c.x = alongNext;
      c.y += (c.lane - c.y) * Math.min(1, dt * 6);
    }
    const axisAng = c.axis === 'y' ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (c.dir > 0 ? 0 : Math.PI);
    if (!c.turning) c.ang += angDiff(c.ang, axisAng) * Math.min(1, dt * 8);
    else c.ang += angDiff(c.ang, c.targetAng) * Math.min(1, dt * 10);
    c.vx = Math.cos(c.ang) * c.speed;
    c.vy = Math.sin(c.ang) * c.speed;
  }

  passedCenter(c, a0, a1, center) {
    return c.dir > 0 ? (a0 < center && a1 >= center) : (a0 > center && a1 <= center);
  }

  nextIntersection(axis, along, dir) {
    const line = dir > 0 ? Math.ceil(along / PITCH) : Math.floor(along / PITCH);
    return clamp(line, 0, BLOCKS) * PITCH;
  }

  lightGreenFor(c, cross) {
    const ix = c.axis === 'x' ? Math.round(cross / PITCH) : Math.round(c.lane / PITCH);
    const iy = c.axis === 'y' ? Math.round(cross / PITCH) : Math.round(c.lane / PITCH);
    // phase 0 = north-south green (vertical roads), phase 1 = east-west green.
    const phase = (ix + iy + Math.floor(this.game.time / 9)) % 2;
    return c.axis === 'y' ? phase === 0 : phase === 1;
  }

  obstacleAhead(c, along, lane) {
    const game = this.game;
    let limit = null;
    const scanDir = c.dir;
    for (const other of game.vehicles) {
      if (other === c || other.exploded) continue;
      const oAlong = c.axis === 'y' ? other.y : other.x;
      const oLane = c.axis === 'y' ? other.x : other.y;
      const gap = (oAlong - along) * scanDir;
      if (gap <= 8 || gap > 190) continue;
      if (Math.abs(oLane - lane) > 30) continue;
      const closing = Math.max(0, other.speed ?? 0);
      limit = Math.min(limit ?? 1e9, Math.max(0, closing * 0.9 + (gap - 60) * 1.6));
    }
    // The player on foot in the road is an obstacle too; so is a fleeing ped.
    const p = game.player;
    if (!p.inCar) {
      const oAlong = c.axis === 'y' ? p.y : p.x;
      const oLane = c.axis === 'y' ? p.x : p.y;
      const gap = (oAlong - along) * scanDir;
      if (gap > 8 && gap < 150 && Math.abs(oLane - lane) < 30) limit = Math.min(limit ?? 1e9, Math.max(0, (gap - 55) * 2));
    }
    return limit === null ? null : Math.min(limit, c.cruise);
  }

  decideTurn(c, cross) {
    if (Math.random() > 0.28) return;
    const game = this.game;
    // Choose a perpendicular road line near the current one (0..BLOCKS).
    const perpLine = clamp(Math.round((c.axis === 'y' ? c.x : c.y) / PITCH) + (Math.random() < 0.5 ? -1 : 1), 0, BLOCKS);
    const newCenter = perpLine * PITCH;
    const newDir = Math.random() < 0.5 ? 1 : -1;
    const newAxis = c.axis === 'y' ? 'x' : 'y';
    const newLane = Traffic.laneCoord(newAxis, newCenter, newDir);
    // Snap onto the crossing road through the intersection, then swap axes.
    if (c.axis === 'y') { c.x = Traffic.laneCoord('y', cross, c.dir); c.y = cross; }
    else { c.y = Traffic.laneCoord('x', cross, c.dir); c.x = cross; }
    c.axis = newAxis; c.dir = newDir; c.lane = newLane; c.line = perpLine;
    c.turning = true; c.turnT = 0.45;
    c.targetAng = newAxis === 'y' ? (newDir > 0 ? Math.PI / 2 : -Math.PI / 2) : (newDir > 0 ? 0 : Math.PI);
  }

  /** Player bumped a traffic car: shove and damage it. */
  ram(victim, impactX, impactY, force, game) {
    victim.damage(Math.max(0, (force - 120) * 0.06), game);
    const push = clamp(force * 0.25, 0, 160);
    const d = Math.hypot(victim.x - impactX, victim.y - impactY) || 1;
    victim.x += ((victim.x - impactX) / d) * push * 0.02;
    victim.y += ((victim.y - impactY) / d) * push * 0.02;
    victim.speed *= 0.4;
  }
}
