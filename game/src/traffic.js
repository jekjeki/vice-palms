// traffic.js — lane-following AI, traffic lights, queueing, panic fleeing,
// population maintenance around the player.

import { CFG } from './config.js';
import { RNG } from './rng.js';
import { clamp, angDiff } from './util.js';
import { makeCar, carSpeed, mkPart } from './cars.js';
import {
  ROAD_V, ROAD_H, V_SPAN, H_SPAN, ROAD_HALF,
  nextIntersection, dirVec, laneShift, randomLanePoint, lightRed,
} from './world.js';

const AXIS_ANG = [0, Math.PI / 2, Math.PI, -Math.PI / 2]; // E,S,W,N

export function spawnTraffic(g) {
  while (g.cars.filter((c) => c.kind === 'traffic' && !c.dead).length < CFG.TRAFFIC_N) {
    const p = randomLanePoint(g.rng, g.player, 2200);
    makeCar(g, p.x, p.y, AXIS_ANG[p.dir], g.rng.pick(['sedan', 'sedan', 'taxi', 'van', 'sports', 'truck', 'buggy', 'limo']), {
      kind: 'traffic', driver: 'npc', dir: p.dir, color: g.rng.pick(CFG.CAR_COLORS),
    });
  }
}

export function updateTraffic(g, dt) {
  const cars = g.cars;
  for (const c of cars) {
    if (c.kind !== 'traffic' || c.dead || c.driver === 'player') continue;
    if (c.driver !== 'npc') continue;
    trafficAI(g, c, dt);
  }
  // panic contagion
  for (const c of cars) {
    if (c.kind === 'traffic' && !c.dead && g.panicOrigin) {
      const d = Math.hypot(c.x - g.panicOrigin.x, c.y - g.panicOrigin.y);
      if (d < 620) c.panicT = Math.max(c.panicT, 2.4);
    }
  }
  // cull far cars, top-up population
  for (let i = cars.length - 1; i >= 0; i--) {
    const c = cars[i];
    if (c.kind !== 'traffic') continue;
    if (g.player && Math.hypot(c.x - g.player.x, c.y - g.player.y) > 2500) {
      cars.splice(i, 1);
    }
  }
  g.trafficSpawnT -= dt;
  if (g.trafficSpawnT <= 0) {
    g.trafficSpawnT = 0.7;
    spawnTraffic(g);
  }
}

function trafficAI(g, c, dt) {
  const v = dirVec(c.dir);
  const rail = laneShift(c.dir);

  // pick a target intersection
  if (!c.target) {
    c.target = chooseTarget(g, c);
    if (!c.target) { // dead end (shouldn't happen on a loop grid) — reverse
      c.dir = (c.dir + 2) & 3;
      c.target = nextIntersection(c.x, c.y, c.dir);
    }
  }

  // along-axis distance to the intersection center
  const alongAxis = c.dir === 0 || c.dir === 2 ? 'x' : 'y';
  const sign = c.dir === 0 || c.dir === 1 ? 1 : -1;
  const toNode = (c.target[alongAxis] - c[alongAxis]) * sign;

  // desired speed
  let want = CFG.TRAFFIC_SPEED * (c.panicT > 0 ? 1.65 : 1);
  c.panicT -= dt;

  // red light: stop before the intersection box
  const stopLine = toNode - ROAD_HALF - 14;
  const approaching = toNode > 0 && stopLine < 90;
  if (approaching && lightRed(g.world, c.target.x, c.target.y, c.dir, g.time) && c.panicT <= 0) {
    if (toNode > ROAD_HALF) {
      // before the box: brake to the stop line
      if (stopLine > 8) want = Math.min(want, stopLine * 2.4);
      else want = 0;
    }
    // inside the box: crawl through, never block the crossing
  }

  // queueing: car ahead in the same lane
  const ahead = findCarAhead(g, c);
  if (ahead) {
    const gap = ahead.d;
    if (gap < 110) want = Math.min(want, Math.max(0, (gap - 46) * 2.2));
    if (gap < 46) want = 0;
    if (want === 0 && gap < 90 && c.waitT > 2.5 && Math.random() < dt * 0.5) {
      c.honkT = 0.35;
      g.audio && g.audio.horn();
    }
  }

  // stuck detection
  const sp = carSpeed(c);
  if (sp < 6 && want > 0) c.stuckT += dt;
  else c.stuckT = Math.max(0, c.stuckT - dt * 2);
  if (c.stuckT > 5) {
    c.stuckT = 0;
    c.dir = (c.dir + (g.rng.chance(0.5) ? 1 : 3)) & 3;
    c.target = null;
  }

  // drive
  const vf = c.vx * v.x + c.vy * v.y;
  if (vf < want - 6) {
    c.throttle = 1;
    c.brake = 0;
  } else if (vf > want + 22) {
    c.throttle = 0;
    c.brake = want === 0 ? 1 : 0.4;
  } else {
    c.throttle = 0;
    c.brake = 0;
  }
  c.steer = 0;
  c.handbrake = false;
  c.waitT = want === 0 ? c.waitT + dt : 0;

  // rail alignment: face along the axis, drift laterally to lane center
  const targetAng = AXIS_ANG[c.dir];
  const dAng = angDiff(c.ang, targetAng);
  c.ang += dAng * clamp(dt * 6, 0, 1);
  const lateralAxis = alongAxis === 'x' ? 'y' : 'x';
  const railCoord = c.target[lateralAxis] + (lateralAxis === 'y' ? rail.y : rail.x);
  const lc = c[lateralAxis];
  c[lateralAxis] = lc + (railCoord - lc) * clamp(dt * (alongAxis === 'x' ? 3 : 3), 0, 1);

  // arrive at node: pick the next leg
  if (toNode < 6 && Math.abs(vf) < 400) {
    const reached = c.target;
    c.x = reached.x + rail.x;
    c.y = reached.y + rail.y;
    c.target = chooseTarget(g, c);
  }
}

function chooseTarget(g, c) {
  const opts = [];
  // straight first (from the node we'd arrive at, in current dir)
  const cur = nextIntersection(c.x, c.y, c.dir);
  if (cur) opts.push({ dir: c.dir, node: cur, w: 0.62 });
  const left = (c.dir + 3) & 3, right = (c.dir + 1) & 3;
  // lateral probe: is there an intersecting road to the left/right?
  const probeL = probeTurn(c, left);
  if (probeL) opts.push({ dir: left, node: probeL, w: 0.19 });
  const probeR = probeTurn(c, right);
  if (probeR) opts.push({ dir: right, node: probeR, w: 0.19 });
  if (!opts.length) return null;
  let r = g.rng.next() * opts.reduce((s, o) => s + o.w, 0);
  for (const o of opts) {
    r -= o.w;
    if (r <= 0) {
      c.dir = o.dir;
      return o.node;
    }
  }
  return opts[0].node;
}

/** from current position, the next node if we turned to `dir` right here */
function probeTurn(c, dir) {
  const node = nextIntersection(c.x, c.y, dir);
  if (!node) return null;
  // must be a real crossing (a road we can join), not just the end of this road
  const v = dirVec(dir);
  if (v.x !== 0) {
    // moving horizontally: the target y must be a road H
    if (!ROAD_H.includes(node.y)) return null;
  } else {
    if (!ROAD_V.includes(node.x)) return null;
  }
  return node;
}

/** nearest car (or player car) ahead in the same lane */
function findCarAhead(g, c) {
  const v = dirVec(c.dir);
  let best = null;
  const check = (ox, oy, ovx, ovy) => {
    const dx = ox - c.x, dy = oy - c.y;
    const fwd = dx * v.x + dy * v.y;
    const side = Math.abs(dx * v.y - dy * v.x); // lateral distance to my lane line
    if (fwd > 10 && fwd < 130 && side < 22) {
      if (!best || fwd < best.d) best = { d: fwd };
    }
  };
  for (const o of g.cars) {
    if (o === c || o.dead) continue;
    if (o.kind !== 'traffic' && o.kind !== 'police' && o.driver !== 'player' && o.kind !== 'mission') continue;
    check(o.x, o.y);
  }
  return best;
}
