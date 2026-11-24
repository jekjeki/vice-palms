// VICE PALMS — 8 vehicle types, arcade physics with drift + handbrake,
// progressive damage (smoke → fire → explosion), headlights state.

import { CFG } from './config.js';
import { G, damagePlayer } from './state.js';
import { clamp, dist, dist2, spawnPart, burst, smokePuff, explosionAt } from './util.js';
import { killPed } from './peds.js';
import { killCop } from './police.js';
import { runRNG } from './rng.js';
import { resolveCircleSolids, isWater, onPiers, terrainAt } from './world.js';
import { play } from './audio.js';

export const CAR_TYPES = [
  { id: 'stallion', name: 'Stallion', w: 42, h: 20, max: 250, acc: 190, mass: 1.0, cop: false,
    cols: ['#c0392b', '#2c5aa8', '#d8c93a', '#3a9a6e', '#8e44ad', '#b8b8c0'] },
  { id: 'banshee', name: 'Banshee', w: 44, h: 18, max: 330, acc: 260, mass: 0.9, cop: false,
    cols: ['#e8e8ee', '#d8342e', '#f0b429', '#111318'] },
  { id: 'vigor', name: 'Vigor', w: 36, h: 18, max: 210, acc: 170, mass: 0.8, cop: false,
    cols: ['#7fb3d5', '#d5a27f', '#9ad57f', '#d57f9a'] },
  { id: 'panzer', name: 'Panzer', w: 52, h: 24, max: 190, acc: 120, mass: 1.6, cop: false,
    cols: ['#8a8f98', '#6e7a8a', '#9a8f6e'] },
  { id: 'cursor', name: 'Cursor', w: 44, h: 20, max: 230, acc: 170, mass: 1.1, cop: false, taxi: true,
    cols: ['#f0c419'] },
  { id: 'interceptor', name: 'Interceptor', w: 46, h: 20, max: 300, acc: 240, mass: 1.2, cop: true,
    cols: ['#101418'] },
  { id: 'cheetah', name: 'Cheetah GT', w: 46, h: 18, max: 370, acc: 300, mass: 0.85, cop: false,
    cols: ['#e02d2d', '#ffe36e', '#19d3c5'] },
  { id: 'bobcat', name: 'Bobcat', w: 46, h: 22, max: 220, acc: 150, mass: 1.3, cop: false,
    cols: ['#7a5230', '#4a4a52', '#98290f'] },
];

export function carType(id) { return CAR_TYPES.find(t => t.id === id) || CAR_TYPES[0]; }

export function makeCar(typeId, x, y, ang, opts = {}) {
  const t = carType(typeId);
  const car = {
    type: t, id: t.id,
    x, y, ang,
    vx: 0, vy: 0,
    hp: CFG.CAR_HP,
    throttle: 0, steer: 0, hand: false,
    driver: opts.driver || 'none',       // 'none' | 'player' | 'ai'
    ai: opts.ai || null,                 // traffic/cop behaviour state
    siren: !!t.cop,
    dead: false,
    burnT: 0,
    deadT: 0,
    sink: 0,
    color: opts.color || t.cols[Math.floor(runRNG.next() * t.cols.length)],
    locked: !!opts.locked,               // mission cars the player must steal
    missionTag: opts.missionTag || null,
    headlights: true,
    skid: 0,                             // skid mark intensity (fades)
    slipT: 0,
  };
  return car;
}

export function spawnTrafficCar(rng, near, minD, maxD) {
  // pick a random road position within range; returns car or null
  for (let tries = 0; tries < 20; tries++) {
    const vertical = rng.chance(0.5);
    let x, y, ang;
    if (vertical) {
      const rx = rng.pick(G.world.roadsX);
      const dir = rng.sign();
      x = rx + dir * CFG.LANE_OFF;
      y = rng.range(220, CFG.BEACH_Y - 40);
      ang = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      const ry = rng.pick(G.world.roadsY.filter(r => r < CFG.BEACH_Y - 40));
      const dir = rng.sign();
      y = ry + dir * CFG.LANE_OFF;
      x = rng.range(220, 4040);
      ang = dir > 0 ? 0 : Math.PI;
    }
    if (terrainAt(x, y) === 'water') continue;
    const d = dist(x, y, near.x, near.y);
    if (d < minD || d > maxD) continue;
    const typeId = rng.pick(['stallion', 'stallion', 'vigor', 'vigor', 'panzer', 'bobcat', 'banshee', 'cheetah', 'cursor']);
    const car = makeCar(typeId, x, y, ang, { driver: 'ai' });
    car.ai = { kind: 'traffic', speed: CFG.TRAFFIC_SPEED * rng.range(0.85, 1.15), waitT: 0 };
    return car;
  }
  return null;
}

// ---------------------------------------------------------------------------
// physics

export function driveCar(car, dt) {
  if (car.dead) { updateHusk(car, dt); return; }

  const t = car.type;
  const fx = Math.cos(car.ang), fy = Math.sin(car.ang);
  const lx = -fy, ly = fx;
  let fs = car.vx * fx + car.vy * fy;        // forward speed
  let lat = car.vx * lx + car.vy * ly;       // lateral speed

  // throttle & braking
  if (car.throttle > 0) fs += car.throttle * t.acc * dt * (fs < 0 ? 2.2 : 1);
  else if (car.throttle < 0) fs += car.throttle * t.acc * 0.8 * dt * (fs > 0 ? 2.2 : 1);
  else fs *= Math.max(0, 1 - CFG.CAR_FRICTION * dt * (car.hand ? 2.4 : 1));

  const maxR = t.max * (isWaterish(car) ? 0.25 : 1);
  fs = clamp(fs, -maxR * 0.45, maxR);

  // handbrake slide
  const grip = car.hand ? CFG.CAR_DRIFT_GRIP : CFG.CAR_GRIP;
  lat *= Math.max(0, 1 - grip * dt);

  // steering authority scales with speed, inverts in reverse
  const spd = Math.abs(fs);
  const authority = clamp(spd / 150, 0, 1) * (fs < 0 ? -1 : 1);
  car.ang += car.steer * CFG.CAR_STEER * authority * dt;

  // recompose velocity
  const fx2 = Math.cos(car.ang), fy2 = Math.sin(car.ang);
  const lx2 = -fy2, ly2 = fx2;
  car.vx = fx2 * fs + lx2 * lat;
  car.vy = fy2 * fs + ly2 * lat;

  car.x += car.vx * dt;
  car.y += car.vy * dt;

  // skid marks when drifting hard
  const slip = Math.abs(lat);
  if (slip > 70 || (car.hand && spd > 60)) car.skid = Math.min(1, car.skid + dt * 4);
  else car.skid = Math.max(0, car.skid - dt * 2);

  // world collision
  collideCarWorld(car, dt);
  waterCheck(car, dt);
  updateCarFx(car, dt);
}

function isWaterish(car) {
  return isWater(car.x, car.y) && !onPiers(car.x, car.y);
}

function collideCarWorld(car, dt) {
  const r = car.type.h * 0.55;
  const pts = [
    { x: car.x + Math.cos(car.ang) * car.type.w * 0.32, y: car.y + Math.sin(car.ang) * car.type.w * 0.32 },
    { x: car.x - Math.cos(car.ang) * car.type.w * 0.32, y: car.y - Math.sin(car.ang) * car.type.w * 0.32 },
  ];
  let hitSpeed = 0;
  for (const p of pts) {
    const probe = { x: p.x, y: p.y };
    const hit = resolveCircleSolids(probe, r);
    if (hit) {
      const dx = probe.x - p.x, dy = probe.y - p.y;
      car.x += dx; car.y += dy;
      const vn = car.vx * hit.nx + car.vy * hit.ny;
      if (vn < 0) {
        hitSpeed = Math.max(hitSpeed, -vn);
        car.vx -= vn * hit.nx * 1.4;
        car.vy -= vn * hit.ny * 1.4;
      }
    }
  }
  if (hitSpeed > 120) {
    damageCar(car, (hitSpeed - 100) * 0.09, 'wall');
    burst(car.x, car.y, 6, { spMin: 20, spMax: 90, lifeMin: 0.15, lifeMax: 0.4, col: '#ffe36e' });
    if (car.driver === 'player') G.shake = Math.min(14, G.shake + hitSpeed * 0.02);
  }
}

function waterCheck(car, dt) {
  if (!isWater(car.x, car.y) || onPiers(car.x, car.y)) { car.sink = 0; return; }
  car.sink += dt;
  car.vx *= Math.max(0, 1 - 3 * dt);
  car.vy *= Math.max(0, 1 - 3 * dt);
  if (Math.random() < dt * 20) smokePuff(car.x, car.y, 0, -14, 'rgba(160,200,230,0.5)');
  if (car.sink > 1.6 && !car.dead) {
    if (car.driver === 'player') { G.player.car = null; }
    damageCar(car, 999, 'water');
  }
}

function updateHusk(car, dt) {
  car.deadT += dt;
  car.vx *= Math.max(0, 1 - 4 * dt); car.vy *= Math.max(0, 1 - 4 * dt);
  car.x += car.vx * dt; car.y += car.vy * dt;
  collideCarWorld(car, dt);
  if (car.deadT < 4 && Math.random() < dt * 26) {
    smokePuff(car.x + runRNG.range(-8, 8), car.y + runRNG.range(-8, 8), 0, -22, 'rgba(50,50,55,0.5)');
  }
}

export function updateCarFx(car, dt) {
  if (car.hp < 45 && Math.random() < dt * 14) {
    smokePuff(car.x - Math.cos(car.ang) * 14, car.y - Math.sin(car.ang) * 14, runRNG.range(-8, 8), runRNG.range(-20, -8));
  }
  if (car.hp < 20) {
    car.burnT += dt;
    if (Math.random() < dt * 22) {
      burst(car.x - Math.cos(car.ang) * 14, car.y - Math.sin(car.ang) * 14, 2, { spMin: 10, spMax: 50, lifeMin: 0.2, lifeMax: 0.5, rMin: 2, rMax: 5, col: '#ff9540', kind: 'fire' });
    }
    car.hp -= dt * 4.5; // fires finish the job
    if (car.hp <= 0) explodeCar(car);
  }
}

export function damageCar(car, n, src) {
  if (car.dead) return;
  car.hp -= n;
  if (car.hp <= 0) explodeCar(car);
}

export function explodeCar(car) {
  if (car.dead) return;
  car.dead = true;
  car.deadT = 0;
  car.driver = 'none';
  car.hp = 0;
  explosionAt(car.x, car.y, true);
  play('boom');

  // splash damage
  for (const c of G.cars) {
    if (c === car || c.dead) continue;
    const d = dist(car.x, car.y, c.x, c.y);
    if (d < CFG.CAR_EXPLODE_R) damageCar(c, CFG.CAR_EXPLODE_DMG * (1 - d / CFG.CAR_EXPLODE_R), 'blast');
  }
  for (const pd of G.peds) {
    const d = dist(car.x, car.y, pd.x, pd.y);
    if (d < CFG.CAR_EXPLODE_R && !pd.dead) killPed(pd, 'blast');
  }
  for (const cp of G.cops) {
    const d = dist(car.x, car.y, cp.x, cp.y);
    if (d < CFG.CAR_EXPLODE_R && !cp.dead) killCop(cp, 'blast');
  }
  const pd = dist(car.x, car.y, G.player.x, G.player.y);
  if (pd < CFG.CAR_EXPLODE_R && !G.player.dead) {
    if (G.player.car === car) {
      G.player.car = null;
      damagePlayer(CFG.CAR_EXPLODE_DMG * 0.6, 'blast');
    } else if (!G.player.car) {
      damagePlayer(CFG.CAR_EXPLODE_DMG * (1 - pd / CFG.CAR_EXPLODE_R), 'blast');
    }
  }
  if (G.player.car === car) G.player.car = null;
}

// car ↔ car collision (called once per frame from game.js)
export function collideCarPairs(dt) {
  const cars = G.cars;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      const ra = (a.type.w + a.type.h) * 0.3;
      const rb = (b.type.w + b.type.h) * 0.3;
      const dx = b.x - a.x, dy = b.y - a.y;
      const rr = ra + rb;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 < 0.0001) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d;
      const overlap = rr - d;
      const ma = a.dead ? 3 : a.type.mass, mb = b.dead ? 3 : b.type.mass;
      const tot = ma + mb;
      a.x -= nx * overlap * (mb / tot); a.y -= ny * overlap * (mb / tot);
      b.x += nx * overlap * (ma / tot); b.y += ny * overlap * (ma / tot);
      const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
      const rel = rvx * nx + rvy * ny;
      if (rel < 0) {
        const imp = rel * 0.8;
        a.vx += nx * imp * (mb / tot) * 1.2; a.vy += ny * imp * (mb / tot) * 1.2;
        b.vx -= nx * imp * (ma / tot) * 1.2; b.vy -= ny * imp * (ma / tot) * 1.2;
        const force = -rel;
        if (force > 110) {
          damageCar(a, force * 0.05 * (mb / tot) * 1.4, 'car');
          damageCar(b, force * 0.05 * (ma / tot) * 1.4, 'car');
          burst((a.x + b.x) / 2, (a.y + b.y) / 2, 5, { spMin: 20, spMax: 100, lifeMin: 0.15, lifeMax: 0.35, col: '#ffe36e' });
          if (a.driver === 'player' || b.driver === 'player') G.shake = Math.min(12, G.shake + force * 0.015);
        }
      }
    }
  }
}

// car runs over pedestrians / cops — called from peds.js & police.js updates
export function carHitsPed(car, ped) {
  const spd = Math.hypot(car.vx, car.vy);
  if (spd < 60) return false;
  if (dist2(car.x, car.y, ped.x, ped.y) < (car.type.w * 0.45) ** 2) return true;
  return false;
}

// used by traffic AI to detect the car ahead
export function carAhead(car, range) {
  const fx = Math.cos(car.ang), fy = Math.sin(car.ang);
  let best = null, bestD = range;
  for (const c of G.cars) {
    if (c === car || c.dead) continue;
    const dx = c.x - car.x, dy = c.y - car.y;
    const fwd = dx * fx + dy * fy;
    if (fwd <= 8) continue;
    const side = Math.abs(dx * -fy + dy * fx);
    if (side > 26) continue;
    if (fwd < bestD) { bestD = fwd; best = c; }
  }
  return best;
}
