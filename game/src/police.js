// police.js — 5-star wanted system: cruiser pursuit + ramming, foot cops that shoot,
// roadblocks at 3★+, line-of-sight decay, busted detection.
import { S, hooks, clamp, dist, angDiff, angTurn, Rng, ROAD_W } from './core.js';
import { VX, HY, roadSpawn, roadAxisAt, isOnRoad, nodePos, nearestNode, circleSolids } from './world.js';
import { carPhysics, carSpeed, makeCar, carDamage } from './cars.js';

const COP_CAP = [0, 1, 2, 3, 4, 6];       // cop cars by wanted level
const FOOT_CAP = [0, 0, 2, 4, 6, 8];      // foot cops by wanted level
const DECAY_SECS = [0, 9, 12, 15, 18, 22];
let prng = new Rng(4242);

export function setWanted(n) {
  const was = S.wanted;
  S.wanted = clamp(n, 0, 5);
  if (S.wanted > was) S.seenT = 0;
  if (S.wanted === 0) { S.seenT = 0; S.bustT = 0; }
}
export function addWanted(n, x, y) {
  if (S.wanted === 0 && n > 0) S.seenT = 0;
  setWanted(S.wanted + n);
}

// Crime witnessed by nearby cops/peds raises heat. severity 1 = minor.
export function crime(x, y, sev) {
  if (S.mode !== 'playing') return;
  if (S.wanted === 5) return;
  let witnesses = 0;
  for (const ped of S.peds) if (!ped.dead && dist(ped.x, ped.y, x, y) < 380) witnesses++;
  for (const car of S.cars) if (car.ai === 'traffic' && !car.dead && dist(car.x, car.y, x, y) < 380) witnesses++;
  if (witnesses > 0 && S.frame % 3 === 0) addWanted(1);
}

export function update(dt) {
  updateHeli(dt);
  if (S.wanted <= 0) { clearCops(dt); return; }

  // --- spawn cop cars
  let cars = 0;
  for (const c of S.cars) if (c.ai === 'police' && !c.dead) cars++;
  if (cars < COP_CAP[S.wanted] && S.frame % 30 === 0) {
    const p = S.player;
    const sp = roadSpawn(prng, p.x, p.y, 900, 1700);
    if (sp) {
      const cop = makeCar('police', sp.x, sp.y, sp.ang, { ai: 'police', siren: true, rng: prng });
      cop.ni = sp.ni; cop.nj = sp.nj; cop.pi = sp.pi; cop.pj = sp.pj;
    }
  }

  // --- update cop cars & foot cops
  let foots = 0;
  for (const c of S.cops) if (!c.dead) foots++;
  for (const car of S.cars) if (car.ai === 'police' && !car.dead) copCarAI(car, dt);
  for (const cop of S.cops) if (!cop.dead) footCopAI(cop, dt);

  // --- deploy foot cops from stopped cruisers when player is on foot
  const p = S.player;
  if (!p.inCar && foots < FOOT_CAP[S.wanted]) {
    for (const car of S.cars) {
      if (car.ai !== 'police' || car.dead || carSpeed(car) > 55) continue;
      if (dist(car.x, car.y, p.x, p.y) < 340 && car.deployT <= 0) {
        car.deployT = 4;
        for (let k = 0; k < 2 && foots < FOOT_CAP[S.wanted]; k++, foots++) spawnFootCop(car.x + (k ? 20 : -20), car.y);
      }
    }
  }

  // --- roadblocks at 3★+
  if (S.wanted >= 3 && p.inCar && carSpeed(p.inCar) > 180 && S.frame % 10 === 0 && prng.chance(0.02)) spawnRoadblock();

  // --- sight & decay
  let seen = false;
  for (const car of S.cars) if (car.ai === 'police' && !car.dead && dist(car.x, car.y, p.x, p.y) < 560) seen = true;
  for (const cop of S.cops) if (!cop.dead && dist(cop.x, cop.y, p.x, p.y) < 520) seen = true;
  let anyCop = false;
  for (const car of S.cars) if (car.ai === 'police' && !car.dead) { anyCop = true; break; }
  if (!anyCop) for (const cop of S.cops) if (!cop.dead) { anyCop = true; break; }
  if (seen) S.seenT = 0;
  else {
    S.seenT += dt * (anyCop ? 1 : 2.5);
    if (S.seenT > DECAY_SECS[S.wanted]) { setWanted(S.wanted - 1); S.seenT = 0; if (S.wanted === 0) toastClear(); }
  }

  // --- busted check: cop adjacent while player is slow
  if (!p.inCar || carSpeed(p.inCar) < 26) {
    let close = false;
    for (const cop of S.cops) if (!cop.dead && dist(cop.x, cop.y, p.x, p.y) < 58) close = true;
    for (const car of S.cars) if (car.ai === 'police' && !car.dead && carSpeed(car) < 30 && dist(car.x, car.y, p.x, p.y) < 74) close = true;
    S.bustT = close ? S.bustT + dt : Math.max(0, S.bustT - dt * 2);
    if (S.bustT > 1.5) hooks.busted?.();
  } else S.bustT = 0;
}

function toastClear() { S.toasts.push({ text: 'You lost the cops.', t: 0, dur: 2.5 }); }

function clearCops(dt) {
  for (const cop of S.cops) if (dist(cop.x, cop.y, S.player.x, S.player.y) > 800) cop.despawn = true;
  for (const car of S.cars) if (car.ai === 'police' && dist(car.x, car.y, S.player.x, S.player.y) > 900) car.despawn = true;
}

// ---------------------------------------------------------------- cruiser AI
function copCarAI(car, dt) {
  const p = S.player;
  car.deployT -= dt;
  const d = dist(car.x, car.y, p.x, p.y);
  if (d > 2400) { car.despawn = true; return; }

  // target: lead the player
  const lead = p.inCar ? 0.55 : 0.25;
  const tx = p.x + p.vx * lead, ty = p.y + p.vy * lead;
  const want = Math.atan2(ty - car.y, tx - car.x);
  const diff = angDiff(car.ang, want);
  const steer = clamp(diff * 2.4, -1, 1);
  const speed = carSpeed(car);

  let throttle = 1;
  if (Math.abs(diff) > 2.1 && speed > 120) throttle = -0.4; // turn around
  // ram: full send; brake only if overshooting the player at speed
  if (d < 90 && speed > car.spec.max * 0.75 && p.inCar) throttle = 0.15;
  if (!p.inCar && d < 130) {
    // on-foot player: pull over
    throttle = speed > 60 ? -0.8 : 0;
    car.mode = 'deploy';
  } else car.mode = 'pursuit';

  carPhysics(car, dt, { throttle, steer, hand: false });
  car.siren = true;

  // hitting the player's car handled by generic car-car collision in game.js
}

// ---------------------------------------------------------------- helicopter
// Air unit at 4-5 stars: hovers over the player with a searchlight, takes pot shots.
function updateHeli(dt) {
  const want = S.wanted >= 4;
  if (want && !S.heli) {
    const p = S.player;
    S.heli = { x: p.x - 600, y: p.y - 600, ang: 0, rot: 0, shootCd: 3, t: 0, thump: 0 };
    S.toasts.push({ text: 'Air unit inbound!', t: 0, dur: 3 });
    S.sfx.push({ name: 'rotor', x: p.x, y: p.y });
  }
  if (!want && S.heli) { S.heli = null; return; }
  const h = S.heli;
  if (!h) return;
  const p = S.player;
  h.t += dt;
  // circle the player
  const orbit = h.t * 0.55;
  const tx = p.x + Math.cos(orbit) * 190;
  const ty = p.y + Math.sin(orbit) * 190;
  h.x += (tx - h.x) * Math.min(1, 1.6 * dt);
  h.y += (ty - h.y) * Math.min(1, 1.6 * dt);
  h.ang = Math.atan2(p.y - h.y, p.x - h.x);
  h.rot += dt * 26;
  h.thump -= dt;
  if (h.thump <= 0) { h.thump = 0.55; S.sfx.push({ name: 'rotor', x: h.x, y: h.y }); }
  // spotlight tag → cops see you even when hiding
  if (dist(h.x, h.y, p.x, p.y) < 240) S.seenT = 0;
  // pot shots at 5 stars
  h.shootCd -= dt;
  if (S.wanted >= 5 && h.shootCd <= 0 && dist(h.x, h.y, p.x, p.y) < 420) {
    h.shootCd = 1.1 + Math.random() * 0.8;
    const aim = Math.atan2(p.y - h.y, p.x - h.x) + (Math.random() - 0.5) * 0.22;
    S.bullets.push({ x: h.x, y: h.y, dx: Math.cos(aim), dy: Math.sin(aim), spd: 900, life: 0.5, owner: 'cop', dmg: 6 });
    S.sfx.push({ name: 'shot', x: h.x, y: h.y });
  }
}

export function clearHeli() { S.heli = null; }

// ---------------------------------------------------------------- foot cops
export function spawnFootCop(x, y) {
  const cop = {
    x: x + (prng.r() - 0.5) * 30, y: y + (prng.r() - 0.5) * 30,
    ang: 0, hp: 45, dead: false, despawn: false,
    shootCd: 0.8 + prng.r() * 0.8, walkT: 0, lifeT: 0, strafe: prng.chance(0.5) ? 1 : -1,
  };
  S.cops.push(cop);
  return cop;
}

function footCopAI(cop, dt) {
  const p = S.player;
  cop.lifeT += dt;
  const d = dist(cop.x, cop.y, p.x, p.y);
  if (d > 1500) { cop.despawn = true; return; }
  const want = Math.atan2(p.y - cop.y, p.x - cop.x);
  cop.ang = angTurn(cop.ang, want, 7 * dt);
  let mx = 0, my = 0;
  if (d > 170) { mx = Math.cos(want) * 118; my = Math.sin(want) * 118; }
  else if (d < 120) { // strafe a little
    mx = Math.cos(want + Math.PI / 2) * 46 * cop.strafe;
    my = Math.sin(want + Math.PI / 2) * 46 * cop.strafe;
    if (S.frame % 120 === 0) cop.strafe *= -1;
  }
  const nx = cop.x + mx * dt, ny = cop.y + my * dt;
  const res = circleSolids(nx, ny, 8);
  cop.x = res.x; cop.y = res.y;

  // shoot at the player
  cop.shootCd -= dt;
  if (d < 420 && cop.shootCd <= 0 && !p.dead) {
    cop.shootCd = 1.5 - Math.min(0.7, S.wanted * 0.12) + prng.r() * 0.6;
    const aim = Math.atan2(p.y - cop.y, p.x - cop.x) + (prng.r() - 0.5) * 0.12;
    S.bullets.push({ x: cop.x + Math.cos(aim) * 14, y: cop.y + Math.sin(aim) * 14, dx: Math.cos(aim), dy: Math.sin(aim), spd: 980, life: 0.6, owner: 'cop', dmg: 7 });
    S.sfx.push({ name: 'shot', x: cop.x, y: cop.y });
  }
}

// ---------------------------------------------------------------- roadblocks
function spawnRoadblock() {
  const p = S.player;
  if (!p.inCar) return;
  const dir = Math.atan2(p.vy, p.vx);
  // point ~640 ahead, snapped to the nearest road
  const ax = p.x + Math.cos(dir) * 640, ay = p.y + Math.sin(dir) * 640;
  if (!isOnRoad(ax, ay)) return;
  const axis = roadAxisAt(ax, ay);
  const ang = axis.ax === 'v' ? Math.PI / 2 : 0; // cruisers sit across the road
  const off = axis.ax === 'v' ? { x: ROAD_W * 0.25, y: 0 } : { x: 0, y: ROAD_W * 0.25 };
  for (const s of [-1, 1]) {
    const car = makeCar('police', ax + off.x * s, ay + off.y * s, ang + (s > 0 ? 0 : Math.PI), { ai: 'roadblock', siren: true, rng: prng });
    car.blockT = 45;
  }
  for (let k = 0; k < 2; k++) spawnFootCop(ax + (k ? 26 : -26) * (axis.ax === 'v' ? 0 : 1), ay + (k ? 26 : -26) * (axis.ax === 'v' ? 1 : 0));
  S.toasts.push({ text: 'Roadblock ahead!', t: 0, dur: 2.5 });
}

export function updateRoadblocks(dt) {
  for (const car of S.cars) if (car.ai === 'roadblock') {
    car.blockT = (car.blockT ?? 45) - dt;
    if (car.blockT <= 0 || S.wanted === 0) car.despawn = true;
  }
}

// Cop wounded/killed by the player.
export function hurtCop(cop, dmg, ang) {
  cop.hp -= dmg;
  cop.x += Math.cos(ang) * 6; cop.y += Math.sin(ang) * 6;
  if (cop.hp <= 0 && !cop.dead) {
    cop.dead = true;
    S.bodies.push({ x: cop.x, y: cop.y, ang: cop.ang, t: 0, kind: 'cop' });
    S.totalKills++;
    addWanted(2, cop.x, cop.y);
  } else if (S.frame % 2 === 0) addWanted(1, cop.x, cop.y);
}

export function copsAlive() {
  let n = 0;
  for (const c of S.cops) if (!c.dead) n++;
  for (const c of S.cars) if (c.ai === 'police' && !c.dead) n++;
  return n;
}
