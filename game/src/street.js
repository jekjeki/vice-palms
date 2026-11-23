// street.js — ambient traffic (lane AI, traffic lights, queueing) and pedestrians
// (sidewalk strolls, panic fleeing). Population is kept near the player.
import { S, hooks, clamp, dist, angDiff, angTurn, Rng, ROAD_W, LANE } from './core.js';
import { VX, HY, nodePos, neighbors, laneOffset, roadSpawn, isOnRoad, isWater, circleSolids } from './world.js';
import { carPhysics, carDamage, carSpeed, makeCar, CIV_TYPES } from './cars.js';

const TRAFFIC_CAP = 13, PED_CAP = 18;
const CRUISE = [150, 200];
const PED_R = 7;

let aiRng = new Rng(777);

// ---------------------------------------------------------------- lights
export function lightState() {
  const t = S.time % 18;
  // 0-8 NS green, 8-9 NS yellow, 9-17 EW green, 17-18 EW yellow
  if (t < 9) return { v: t < 8 ? 'green' : 'yellow', h: 'red' };
  return { v: 'red', h: t < 17 ? 'green' : 'yellow' };
}

// ---------------------------------------------------------------- traffic cars
export function updateTraffic(dt) {
  const p = S.player;
  let count = 0;
  for (const car of S.cars) if (car.ai === 'traffic') {
    count++;
    car.lifeT += dt;
    const d = dist(car.x, car.y, p.x, p.y);
    if (d > 2100 || (car.dead && d > 900)) { car.despawn = true; continue; }
    trafficAI(car, dt);
  }
  // spawn new traffic around the player, off-screen
  if (count < TRAFFIC_CAP && S.frame % 20 === 0) {
    const sp = roadSpawn(aiRng, p.x, p.y, 750, 1500, { x: p.x, y: p.y });
    if (sp) spawnTrafficAt(sp);
  }
}

function spawnTrafficAt(sp) {
  const type = aiRng.pick(CIV_TYPES);
  return makeCar(type, sp.x, sp.y, sp.ang, { ai: 'traffic', rng: aiRng, ni: sp.ni, nj: sp.nj, pi: sp.pi, pj: sp.pj });
}

function trafficAI(car, dt) {
  // Target node = the node we are heading to (pi,pj); after arrival pick a new neighbor.
  const tp = nodePos(car.pi, car.pj);
  const dirx = tp.x - nodePos(car.ni, car.nj).x, diry = tp.y - nodePos(car.ni, car.nj).y;
  const dlen = Math.hypot(dirx, diry) || 1;
  const ux = dirx / dlen, uy = diry / dlen;
  let lo = laneOffset(ux, uy);
  // overtake: after 6s boxed in, pull into the oncoming lane for a stretch
  if (car.overtakeT > 0) { car.overtakeT -= dt; lo = { x: -lo.x, y: -lo.y }; }
  else if (car.waitT > 6 && (S.rain ?? 0) < 0.5) {
    let clearAhead = true;
    for (const o of S.cars) {
      if (o === car) continue;
      const rel = (o.x - car.x) * ux + (o.y - car.y) * uy;
      if (rel > 30 && rel < 190 && Math.abs((o.x - car.x) * uy - (o.y - car.y) * ux) < 34) { clearAhead = false; break; }
    }
    if (clearAhead) car.overtakeT = 5;
  }
  // Stop line before the node for lights
  const stopX = tp.x - ux * 58 + lo.x, stopY = tp.y - uy * 58 + lo.y;
  const dNode = dist(car.x, car.y, tp.x, tp.y);
  const lights = lightState();
  const axis = Math.abs(ux) > Math.abs(uy) ? 'h' : 'v';
  const lightOk = lights[axis] === 'green' || dNode < 40 || dNode > 190;

  // Desired point: 42 units ahead along the lane
  const tx = car.x + ux * 46 + lo.x, ty = car.y + uy * 46 + lo.y;
  let want = Math.atan2(ty - car.y, tx - car.x);
  let throttle = 0.8, steer = clamp(angDiff(car.ang, want) * 2.2, -1, 1);
  const speed = carSpeed(car);
  const cruise = car.cruise || (car.cruise = CRUISE[0] + aiRng.r() * (CRUISE[1] - CRUISE[0]));

  // Obstacle scan: cars, peds, player ahead within a cone
  let blocked = 0;
  const lookX = car.x + Math.cos(car.ang) * 66, lookY = car.y + Math.sin(car.ang) * 66;
  for (const o of S.cars) {
    if (o === car) continue;
    const d = dist(lookX, lookY, o.x, o.y);
    if (d < 58 + o.radius) blocked = Math.max(blocked, 1 - d / 80);
  }
  if (!S.player.inCar) {
    const d = dist(lookX, lookY, S.player.x, S.player.y);
    if (d < 56) blocked = Math.max(blocked, 1 - d / 80);
  }
  for (const pd of S.peds) {
    const d = dist(lookX, lookY, pd.x, pd.y);
    if (d < 46) blocked = Math.max(blocked, 1 - d / 70);
  }
  // Red light: stop at the line
  if (!lightOk) {
    const dStop = (stopX - car.x) * ux + (stopY - car.y) * uy; // signed distance along dir
    if (dStop > -8 && dStop < 52) blocked = Math.max(blocked, 1);
  }
  throttle = blocked > 0.15 ? -0.9 : clamp((cruise - speed) / 90, 0, 1);
  car.waitT = blocked > 0.3 ? car.waitT + dt : 0;
  // honk when boxed in, budge-along when queued too long
  if (car.waitT > 3) throttle = 0.25;
  if (blocked > 0.3 && car.waitT > 1 && car.horn <= 0) { car.horn = 2.5 + aiRng.r() * 3; if (dist(car.x, car.y, S.player.x, S.player.y) < 700) S.sfx.push({ name: 'horn', x: car.x, y: car.y }); }

  carPhysics(car, dt, { throttle, steer, hand: false });

  // Arrived at node → pick next edge (no U-turn unless forced)
  if (dNode < 34) {
    const nbs = neighbors(car.pi, car.pj).filter(([i, j]) => !(i === car.ni && j === car.nj));
    const pick = nbs.length ? nbs[(aiRng.r() * nbs.length) | 0] : [car.ni, car.nj];
    car.ni = car.pi; car.nj = car.pj; car.pi = pick[0]; car.pj = pick[1];
    // occasional lane change handled implicitly by new lane offset
  }
  // Stuck recovery
  if (speed < 12 && !blocked) { car.stuckT += dt; if (car.stuckT > 2.6) { throttle = 1; steer = 1; if (car.stuckT > 5) { car.stuckT = 0; respawnTraffic(car); } } }
  else car.stuckT = 0;
}

function respawnTraffic(car) {
  const sp = roadSpawn(aiRng, S.player.x, S.player.y, 800, 1600, { x: S.player.x, y: S.player.y });
  if (sp) { car.x = sp.x; car.y = sp.y; car.ang = sp.ang; car.vx = car.vy = car.fwd = car.lat = 0; car.ni = sp.ni; car.nj = sp.nj; car.pi = sp.pi; car.pj = sp.pj; car.stuckT = 0; }
}

// ---------------------------------------------------------------- pedestrians
export function spawnPed(rng, x, y) {
  const roll = rng.r();
  const kind = roll < 0.12 ? 'jogger' : roll < 0.2 ? 'drunk' : roll < 0.28 ? 'walker' : 'civ';
  const ped = {
    x, y, ang: rng.r() * Math.PI * 2, spd: 34 + rng.r() * 22, hp: 30, dead: false,
    kind,
    shirt: kind === 'jogger' ? rng.pick(['#ff7a5a', '#7ad0ff', '#ffe14d']) : rng.pick(['#e8e0d0', '#d0a0a8', '#a8c8e0', '#e0d0a0', '#b0e0b8', '#e0b890', '#c8b0e0', '#90d0c8']),
    pants: rng.pick(['#3a4a6a', '#5a4a3a', '#2a3a4a', '#4a4a5a']),
    skin: rng.pick(['#e8b890', '#c89070', '#8a6048', '#f0c8a8']),
    state: 'walk', panicT: 0, walkT: rng.r() * 9, lifeT: 0, dir: rng.chance(0.5) ? 1 : -1,
    axis: rng.chance(0.5) ? 'h' : 'v', arms: 0, vx: 0, vy: 0,
    wobble: kind === 'drunk' ? rng.r() * 6 : 0,
    dog: null,
  };
  // dog walkers bring company
  if (kind === 'walker' && rng.chance(0.55)) {
    ped.dog = { ph: rng.r() * 6, c: rng.pick(['#8a6a4a', '#3a3a40', '#c8a86a', '#d8d8dc']) };
    S.dogs.push(ped);
  }
  S.peds.push(ped);
  return ped;
}

export function updatePeds(dt) {
  const p = S.player;
  let count = 0;
  for (const ped of S.peds) {
    count++;
    ped.lifeT += dt;
    const d = dist(ped.x, ped.y, p.x, p.y);
    if (ped.dead || d > 1300) { ped.despawn = true; continue; }

    // Panic from recent gunshots/explosions
    for (const pz of S.panics) {
      if (dist(ped.x, ped.y, pz.x, pz.y) < pz.r) { ped.state = 'flee'; ped.panicT = 6; ped.fleeAng = Math.atan2(ped.y - pz.y, ped.x - pz.x) + (aiRng.r() - 0.5) * 0.8; }
    }
    if (ped.state === 'flee') {
      ped.panicT -= dt;
      ped.arms = 1;
      const sp = ped.spd * 2.9;
      ped.ang = angTurn(ped.ang, ped.fleeAng, 6 * dt);
      movePed(ped, Math.cos(ped.ang) * sp, Math.sin(ped.ang) * sp, dt);
      if (ped.panicT <= 0) { ped.state = 'walk'; ped.arms = 0; }
      continue;
    }

    // Sidewalk stroll: walk parallel to nearest road edge, turn at random
    ped.walkT -= dt;
    if (ped.walkT <= 0) {
      ped.walkT = 2 + aiRng.r() * 5;
      if (aiRng.chance(0.3)) ped.dir *= -1;
      if (aiRng.chance(0.3)) ped.axis = ped.axis === 'h' ? 'v' : 'h';
    }
    const kindBoost = ped.kind === 'jogger' ? 2.4 : ped.kind === 'drunk' ? 0.55 : 1;
    const sp = ped.spd * kindBoost;
    let mx = ped.axis === 'h' ? ped.dir * sp : 0;
    let my = ped.axis === 'v' ? ped.dir * sp : 0;
    // drunks weave
    if (ped.kind === 'drunk') {
      ped.wobble += dt * 2;
      mx += Math.cos(ped.wobble) * 26;
      my += Math.sin(ped.wobble * 0.8) * 26;
    }
    // Steer away from roads: sidewalk bands are just outside the road edge
    const onRoad = isOnRoad(ped.x, ped.y);
    if (onRoad) { // step to the side, away from the road
      if (ped.axis === 'h') { my = 44; mx = 0; } else { mx = 44; my = 0; }
    }
    if (isWater(ped.x, ped.y)) { ped.dir *= -1; mx = -mx * 2; my = -my * 2; }
    ped.ang = Math.atan2(my, mx) || ped.ang;
    movePed(ped, mx, my, dt);
    // dog trails behind its walker
    if (ped.dog) {
      ped.dog.x = ped.x - Math.cos(ped.ang) * 22 + Math.cos(S.time * 3 + ped.dog.ph) * 6;
      ped.dog.y = ped.y - Math.sin(ped.ang) * 22 + Math.sin(S.time * 2.4 + ped.dog.ph) * 4;
      ped.dog.ang = ped.ang + Math.PI;
    }
  }
  // spawn new peds on sidewalks near the player
  if (count < PED_CAP && S.frame % 14 === 0) {
    const rng = aiRng;
    for (let t = 0; t < 8; t++) {
      const a = rng.r() * Math.PI * 2, r = 380 + rng.r() * 500;
      const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
      if (!isOnRoad(x, y) && !isWater(x, y) && inCity(x, y)) { spawnPed(rng, x, y); break; }
    }
  }
  // prune panic events
  for (const pz of S.panics) pz.t += dt;
  S.panics = S.panics.filter((pz) => pz.t < 0.5);
  S.dogs = S.dogs.filter((p) => !p.despawn && !p.dead && p.dog);
}

function inCity(x, y) { return x > 260 && x < 6140 && y > 260 && y < 4380; }

function movePed(ped, mx, my, dt) {
  const nx = ped.x + mx * dt, ny = ped.y + my * dt;
  const res = circleSolids(nx, ny, PED_R);
  ped.x = res.x; ped.y = res.y;
  if (res.hit) { ped.dir *= -1; ped.walkT = 1 + aiRng.r() * 2; }
  ped.vx = mx; ped.vy = my;
}

// Eject a traffic driver when the player carjacks: returns a fleeing ped.
export function ejectDriver(car) {
  const ped = spawnPed(aiRng, car.x - Math.sin(car.ang) * 26, car.y + Math.cos(car.ang) * 26);
  ped.state = 'flee'; ped.panicT = 8; ped.fleeAng = car.ang + Math.PI;
  ped.shirt = '#d8b060'; // cab driver yellow
  return ped;
}
