// Vice Palms — traffic AI: lane-following civilians, traffic lights, queueing.

import { ROADS, ROAD_W, LANE, CROWD } from './config.js';
import { lightFor, randRoadPoint } from './world.js';
import { makeCar, VEH } from './cars.js';
import { RNG } from './rng.js';
import { clamp, dist, angDiff } from './util.js';

const trafficRng = new RNG(9021);

function newAI(axis, dir, roadI) {
  return {
    axis,                // 0 = driving along x on a horizontal road, 1 = along y
    dir,                 // +1 or -1
    roadI,               // index of the road it is on
    cruise: 130 + trafficRng.next() * 90,
    panic: 0,
    cool: 0,
    decided: false,      // turn decided for the upcoming intersection
    willTurn: false,
    targetSpeed: 150,
  };
}

/** Spawn the initial population around the player. */
export function spawnTraffic(game) {
  const p = game.player;
  for (let k = 0; k < CROWD.trafficMax; k++) {
    trySpawn(game, p.x, p.y, true);
  }
}

function trySpawn(game, px, py, anywhere) {
  if (game.cars.filter((c) => c.role === 'traffic').length >= CROWD.trafficMax) return null;
  const pt = randRoadPoint(game.world, trafficRng, px, py, anywhere ? 0 : 620, CROWD.spawnDist);
  if (!anywhere) {
    // keep spawns off-screen-ish and never right on top of the player
    const d = dist(pt.x, pt.y, px, py);
    if (d < 520) return null;
  }
  const type = trafficRng.pick(['sedan', 'sedan', 'sedan', 'taxi', 'sports', 'van', 'truck', 'bus', 'limo']);
  const h = pt.axis === 0 ? (pt.dir > 0 ? 0 : Math.PI) : (pt.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  const c = makeCar(type, pt.x, pt.y, h, 'traffic');
  c.ai = newAI(pt.axis, pt.dir, pt.i);
  c.speed = c.ai.cruise;
  game.cars.push(c);
  return c;
}

/** Lane coordinate across the road for a given travel direction. */
function laneCoord(ai) {
  const r = ROADS[ai.roadI];
  if (ai.axis === 0) return r + (ai.dir > 0 ? LANE : -LANE);
  return r + (ai.dir > 0 ? -LANE : LANE);
}

function desiredHeading(ai) {
  if (ai.axis === 0) return ai.dir > 0 ? 0 : Math.PI;
  return ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
}

/** Nearest road line coordinate strictly ahead along the travel axis. */
function nextCross(ai, c) {
  const along = ai.axis === 0 ? c.x : c.y;
  if (ai.dir > 0) {
    for (const r of ROADS) if (r > along + 6) return r;
  } else {
    for (let k = ROADS.length - 1; k >= 0; k--) if (ROADS[k] < along - 6) return ROADS[k];
  }
  return null;
}

/** Pick the intersection index of a crossing coordinate. */
function crossIndex(coord) {
  for (let i = 0; i < ROADS.length; i++) if (ROADS[i] === coord) return i;
  return -1;
}

export function updateTraffic(game, dt) {
  const p = game.player;
  let count = 0;

  for (const c of game.cars) {
    if (c.role === 'traffic') count++;
  }

  // population maintenance
  if (count < CROWD.trafficMax && game.frame % 20 === 0) trySpawn(game, p.x, p.y, false);
  for (let i = game.cars.length - 1; i >= 0; i--) {
    const c = game.cars[i];
    if (c.role !== 'traffic') continue;
    const d = dist(c.x, c.y, p.x, p.y);
    if (d > CROWD.despawnDist || (c.dead && c.deadT > 8)) {
      game.cars.splice(i, 1);
      count--;
    }
  }

  for (const c of game.cars) {
    if (c.role !== 'traffic' || c.dead) continue;
    const ai = c.ai;
    if (!ai) continue;
    ai.cool -= dt;
    if (ai.panic > 0) ai.panic -= dt;

    // --- steering: aim at a look-ahead point on the lane
    const lane = laneCoord(ai);
    const look = 55 + Math.abs(c.speed) * 0.35;
    let tx, ty;
    if (ai.axis === 0) { tx = c.x + ai.dir * look; ty = lane; }
    else { tx = lane; ty = c.y + ai.dir * look; }
    const dh = angDiff(Math.atan2(ty - c.y, tx - c.x) - c.h);
    c.steer = clamp(dh * 2.6, -1, 1);

    // --- target speed: cruise, slowed by lights and queued cars
    let target = ai.panic > 0 ? ai.cruise * 1.7 : ai.cruise;

    const cross = nextCross(ai, c);
    if (cross !== null) {
      const along = ai.axis === 0 ? c.x : c.y;
      const distTo = (cross - along) * ai.dir;
      const ci = crossIndex(cross);
      const state = lightFor(ci, ai.roadI, ai.axis, game.time);
      const stopAt = distTo - (ROAD_W / 2 + 22);
      if (!ai.decided && distTo < 170 && ai.cool <= 0) {
        ai.decided = true;
        ai.willTurn = !ai.panic && trafficRng.chance(0.3);
      }
      const green = state === 'green' || (state === 'yellow' && stopAt < -10);
      if (!green && !ai.panic && stopAt > -26 && stopAt < 110) {
        target = Math.min(target, Math.max(0, stopAt * 1.4));
      }
      // commit a turn when we reach the middle of the crossing
      if (ai.decided && ai.willTurn && distTo < ROAD_W / 2 - 8 && ai.cool <= 0) {
        const newAxis = 1 - ai.axis;
        const newDir = trafficRng.chance(0.5) ? 1 : -1;
        ai.axis = newAxis;
        ai.dir = newDir;
        // the road we were travelling along becomes the crossing road
        ai.roadI = ai.axis === 0 ? nearestRoadIndex(c.y) : nearestRoadIndex(c.x);
        ai.cool = 1.1;
        ai.decided = false;
        ai.willTurn = false;
        continue;
      }
      if (distTo < -(ROAD_W + 30)) ai.decided = false;
    }

    // --- queueing: brake for cars ahead in the same lane
    for (const o of game.cars) {
      if (o === c || o.dead) continue;
      const dx = o.x - c.x, dy = o.y - c.y;
      const ahead = ai.axis === 0 ? dx * ai.dir : dy * ai.dir;
      const side = ai.axis === 0 ? Math.abs(dy) : Math.abs(dx);
      if (ahead > 0 && ahead < 74 && side < 26) {
        target = Math.min(target, Math.max(0, (ahead - 30) * 3));
        if (ahead < 34) target = 0;
      }
    }

    // brake for the player on foot (don't be a monster)
    if (!p.inCar) {
      const dx = p.x - c.x, dy = p.y - c.y;
      const ahead = ai.axis === 0 ? dx * ai.dir : dy * ai.dir;
      const side = ai.axis === 0 ? Math.abs(dy) : Math.abs(dx);
      if (ahead > 0 && ahead < 90 && side < 30) target = Math.min(target, Math.max(0, (ahead - 36) * 2));
    }

    // stuck behind something? honk about it
    if (target < 5 && c.speed < 12) {
      ai.honk = (ai.honk || 0) + dt;
      if (ai.honk > 1.6 && !(game.hornT > 0)) {
        game.audio.horn(dist(c.x, c.y, p.x, p.y) > 300);
        game.hornT = 0.5 + Math.random() * 0.8;
        ai.honk = 0;
      }
    } else {
      ai.honk = 0;
    }

    ai.targetSpeed = target;
    c.throttle = clamp((target - c.speed) * 0.03, -1, 1);
    if (target < 5 && c.speed > 2) c.handbrake = false;

    // panic swerve: horns and chaos
    if (ai.panic > 0) c.steer = clamp(c.steer + Math.sin(game.time * 9 + c.id) * 0.3, -1, 1);
  }
}

function nearestRoadIndex(v) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < ROADS.length; i++) {
    const d = Math.abs(v - ROADS[i]);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** Scare every civilian driver near (x, y). */
export function panicTraffic(game, x, y, r) {
  for (const c of game.cars) {
    if (c.role !== 'traffic' || !c.ai) continue;
    const d = dist(c.x, c.y, x, y);
    if (d < r) c.ai.panic = 5 + Math.random() * 3;
  }
}

/** Mission cars: flee (runners) — simple waypointless flight along roads. */
export function updateMissionCars(game, dt) {
  for (const c of game.cars) {
    if (c.role !== 'mission' || c.dead || !c.ai) continue;
    const ai = c.ai;
    if (ai.mode === 'flee') {
      // drive flat out away from the player, snapping to roads
      const away = Math.atan2(c.y - game.player.y, c.x - game.player.x);
      ai.turnT = (ai.turnT || 0) - dt;
      if (ai.turnT <= 0) {
        ai.turnT = 1.6;
        // pick a road heading roughly away
        let best = null, bestScore = -Infinity;
        for (const cand of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
          const score = -Math.abs(angDiff(cand - away)) + (cand === ai.lastHead ? -0.4 : 0);
          if (score > bestScore) { bestScore = score; best = cand; }
        }
        ai.lastHead = best;
      }
      const lane = ai.axis === 0 ? ROADS[ai.roadI] + (ai.dir > 0 ? LANE : -LANE) : ROADS[ai.roadI] + (ai.dir > 0 ? -LANE : LANE);
      const look = 90;
      const tx = ai.axis === 0 ? c.x + ai.dir * look : lane;
      const ty = ai.axis === 0 ? lane : c.y + ai.dir * look;
      const dh = angDiff(Math.atan2(ty - c.y, tx - c.x) - c.h);
      c.steer = clamp(dh * 2.4, -1, 1);
      c.throttle = 1;
      // swap to a crossing road when one is reached
      const along = ai.axis === 0 ? c.x : c.y;
      for (const r of ROADS) {
        if (Math.abs(along - r) < 10 && ai.cool <= 0) {
          const ci = ROADS.indexOf(r);
          const newAxis = 1 - ai.axis;
          const newDir = Math.cos(away - (newAxis === 0 ? 0 : Math.PI / 2)) > 0 ? 1 : -1;
          // keep the heading that points away from the player
          ai.axis = newAxis;
          ai.dir = newDir;
          ai.roadI = nearestRoadIndex(newAxis === 0 ? c.y : c.x);
          ai.cool = 1.2;
          break;
        }
      }
      ai.cool = (ai.cool || 0) - dt;
    } else if (ai.mode === 'chase') {
      const t = game.player.inCar || game.player;
      const dh = angDiff(Math.atan2(t.y - c.y, t.x - c.x) - c.h);
      c.steer = clamp(dh * 2.8, -1, 1);
      c.throttle = Math.abs(dh) > 2.3 && Math.abs(c.speed) < 60 ? -1 : 1;
    }
  }
}

/** Spawn a mission runner car near a spawn key. */
export function spawnMissionCar(game, x, y, type, mode) {
  const pt = randRoadPoint(game.world, trafficRng, x, y, 60, 420);
  const h = pt.axis === 0 ? (pt.dir > 0 ? 0 : Math.PI) : (pt.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  const c = makeCar(type, pt.x, pt.y, h, 'mission');
  c.ai = { ...newAI(pt.axis, pt.dir, pt.i), mode };
  c.tag = 'mission';
  game.cars.push(c);
  return c;
}
