// cars.js — 8 vehicle types, arcade drift physics, damage (smoke/fire/explosion),
// skid marks, headlight anchors. Pure state + math; collisions resolved in game.js.
import { S, hooks, clamp, Rng, dist } from './core.js';
import { isWater } from './world.js';

export const SPECS = {
  compact: { name: 'Compact', w: 20, l: 38, max: 300, acc: 280, turn: 2.7, grip: 6.2, hp: 70, cols: ['#c85a7a', '#5a9ac8', '#c8b45a', '#7ac85a', '#9a5ac8', '#c88a5a', '#d0d0d8'] },
  sedan: { name: 'Sedan', w: 22, l: 46, max: 340, acc: 300, turn: 2.5, grip: 6.4, hp: 90, cols: ['#4a6ac8', '#8a4ac8', '#c84a5a', '#4ac8a8', '#c8c84a', '#8a8a96', '#d8d8e0', '#5a7a4a'] },
  sports: { name: 'Cheetah GT', w: 20, l: 44, max: 480, acc: 460, turn: 3.0, grip: 8.2, hp: 80, cols: ['#e02a5a', '#20c8e8', '#e8e820', '#20e858', '#f0f0f8'] },
  muscle: { name: 'Phoenix V8', w: 23, l: 50, max: 450, acc: 400, turn: 2.35, grip: 4.6, hp: 100, cols: ['#c83020', '#282830', '#205ac8', '#c87820'] },
  taxi: { name: 'Taxi', w: 22, l: 46, max: 330, acc: 300, turn: 2.5, grip: 6.4, hp: 90, cols: ['#f0c020'] },
  van: { name: 'Panel Van', w: 25, l: 54, max: 270, acc: 210, turn: 2.0, grip: 5.6, hp: 130, cols: ['#d8d8dc', '#5a8ac8', '#c88a4a', '#7a9a5a'] },
  pickup: { name: 'Pickup', w: 23, l: 50, max: 320, acc: 260, turn: 2.2, grip: 5.8, hp: 115, cols: ['#8a4a2a', '#3a5a8a', '#4a6a3a', '#a8a8a8'] },
  police: { name: 'Cruiser', w: 22, l: 47, max: 445, acc: 430, turn: 2.9, grip: 7.6, hp: 115, cols: ['#e8e8f0'] },
};

export const CAR_TYPES = Object.keys(SPECS);
export const CIV_TYPES = CAR_TYPES.filter((t) => t !== 'police');

let nextId = 1;
export function makeCar(type, x, y, ang, opts = {}) {
  const spec = SPECS[type] || SPECS.sedan;
  const rng = opts.rng || S.rng;
  const car = {
    id: nextId++, type, spec, x, y, ang,
    vx: 0, vy: 0, fwd: 0, lat: 0,
    hp: opts.hp ?? spec.hp, maxHp: spec.hp,
    color: opts.color || rng.pick(spec.cols),
    ai: opts.ai ?? null,          // null | 'traffic' | 'police' | 'parked' | 'mission' | 'rival'
    driver: null,                 // ped object reference for traffic driver
    dead: false, fireT: 0, smokeT: 0, explodeT: -1,
    steerVis: 0, braking: false, reverse: false,
    // traffic AI fields
    ni: opts.ni ?? -1, nj: opts.nj ?? -1, pi: opts.pi ?? -1, pj: opts.pj ?? -1,
    waitT: 0, stuckT: 0, spawnT: 0, lifeT: 0,
    // police AI fields
    mode: opts.mode || 'patrol', deployT: 0, ramT: 0, siren: !!opts.siren,
    missionTag: opts.missionTag || null,
    radius: Math.max(spec.w, spec.l) * 0.42,
  };
  S.cars.push(car);
  return car;
}

export function carForward(car) { return { x: Math.cos(car.ang), y: Math.sin(car.ang) }; }
export function carRight(car) { return { x: -Math.sin(car.ang), y: Math.cos(car.ang) }; }
export function carSpeed(car) { return Math.hypot(car.vx, car.vy); }

export function carCorners(car) {
  const c = Math.cos(car.ang), s = Math.sin(car.ang);
  const hl = car.spec.l / 2, hw = car.spec.w / 2;
  return [
    { x: car.x + c * hl - s * hw, y: car.y + s * hl + c * hw },
    { x: car.x + c * hl + s * hw, y: car.y + s * hl - c * hw },
    { x: car.x - c * hl - s * hw, y: car.y - s * hl + c * hw },
    { x: car.x - c * hl + s * hw, y: car.y - s * hl - c * hw },
  ];
}

// Point-in-oriented-rect test for bullets.
export function pointInCar(px, py, car) {
  const c = Math.cos(car.ang), s = Math.sin(car.ang);
  const dx = px - car.x, dy = py - car.y;
  const fl = dx * c + dy * s, fl2 = -dx * s + dy * c;
  return Math.abs(fl) <= car.spec.l / 2 && Math.abs(fl2) <= car.spec.w / 2;
}

// ---------------------------------------------------------------------------
// Physics. ctl = { throttle: -1..1, steer: -1..1, hand: bool }
export function carPhysics(car, dt, ctl) {
  if (car.dead) { // burnt husk slides to a stop
    car.vx *= 1 - 3 * dt; car.vy *= 1 - 3 * dt;
    car.x += car.vx * dt; car.y += car.vy * dt;
    car.fwd = 0; car.lat = 0; return;
  }
  const spec = car.spec;
  const water = isWater(car.x, car.y);
  const cosA = Math.cos(car.ang), sinA = Math.sin(car.ang);

  // Steering — rate scales with speed, sign follows travel direction.
  const sf = clamp(Math.abs(car.fwd) / 130, 0, 1);
  const dir = car.fwd >= 0 ? 1 : -1;
  car.ang += ctl.steer * spec.turn * sf * dir * (ctl.hand ? 1.3 : 1) * dt;
  car.steerVis += (ctl.steer - car.steerVis) * Math.min(1, 10 * dt);

  const nc = Math.cos(car.ang), ns = Math.sin(car.ang);
  // Longitudinal
  const th = water ? 0 : ctl.throttle;
  if (th > 0) car.fwd += spec.acc * th * dt;
  else if (th < 0) {
    if (car.fwd > 12) car.fwd -= spec.acc * 1.7 * dt;   // brake
    else car.fwd = Math.max(car.fwd - spec.acc * 0.55 * dt, -spec.max * 0.38); // reverse
  }
  car.braking = th < 0 && car.fwd > 12;
  car.reverse = car.fwd < -5;
  // drag
  car.fwd *= 1 - (water ? 2.2 : 0.32) * dt;
  if (ctl.hand) car.fwd *= 1 - 1.15 * dt;
  car.fwd = clamp(car.fwd, -spec.max * 0.38, spec.max);

  // Lateral grip (rain-slicked roads bite)
  const wet = (S.rain ?? 0) * 0.35;
  const grip = (water ? 2.2 : ctl.hand ? 1.7 : spec.grip) * (1 - wet);
  car.lat *= Math.exp(-grip * dt);
  // centripetal transfer: turning creates lateral slip proportional to steer*speed
  car.lat += ctl.steer * car.fwd * sf * (ctl.hand ? 0.9 : 0.28) * dt * -1;

  const rx = -ns, ry = nc; // right vector
  car.vx = nc * car.fwd + rx * car.lat;
  car.vy = ns * car.fwd + ry * car.lat;
  car.x += car.vx * dt; car.y += car.vy * dt;
  if (car.horn > 0) car.horn -= dt;

  // Water stalls the engine and floods the motor.
  if (water) {
    car.hp -= 7 * dt;
    if (car.hp <= 0 && car.explodeT < 0) hooksExplode(car);
  }

  // Skid marks when drifting or handbraking fast
  if ((ctl.hand && Math.abs(car.fwd) > 140) || Math.abs(car.lat) > 60) {
    if (S.frame % 3 === 0) {
      S.skids.push({ x: car.x - nc * spec.l * 0.3, y: car.y - ns * spec.l * 0.3, a: car.ang, t: 0 });
      S.skids.push({ x: car.x - nc * spec.l * 0.3 + rx * spec.w * 0.4, y: car.y - ns * spec.l * 0.3 + ry * spec.w * 0.4, a: car.ang, t: 0 });
      if (S.skids.length > 420) S.skids.splice(0, S.skids.length - 420);
    }
  }
}

function hooksExplode(car) {
  if (car.explodeT >= 0) return;
  car.explodeT = 1.6; // burning countdown before the bang
  car.fireT = car.explodeT;
  hooks.carIgnite?.(car);
}

// Damage entry point (called by game.js hooks).
export function carDamage(car, amt, src = null) {
  if (car.dead) return;
  car.hp -= amt;
  if (car.hp <= 0) hooksExplode(car);
}

// Per-frame visual state: smoke, fire, burnt husk.
export function carFx(car, dt) {
  if (car.explodeT >= 0) {
    car.explodeT -= dt;
    car.fireT = Math.max(car.explodeT, 0);
    if (car.explodeT <= 0 && !car.dead) {
      car.dead = true;
      car.explodeT = -1;
      hooks.explodeCar?.(car);
    }
  } else if (car.hp < car.maxHp * 0.4 && !car.dead) {
    car.smokeT -= dt;
    if (car.smokeT <= 0) {
      car.smokeT = car.hp < car.maxHp * 0.18 ? 0.05 : 0.14;
      const f = carForward(car);
      S.particles.push({ k: 'smoke', x: car.x - f.x * car.spec.l * 0.35, y: car.y - f.y * car.spec.l * 0.35, vx: (Math.random() - 0.5) * 18, vy: -14 - Math.random() * 12, life: 0, max: car.hp < car.maxHp * 0.18 ? 0.9 : 1.4, r: 5 + Math.random() * 4, dark: car.hp < car.maxHp * 0.18 });
    }
  }
}

// Impact damage helper used on collisions: converts closing speed into damage.
export function impactDamage(car, closing) {
  if (closing < 60) return 0;
  return Math.min(45, (closing - 50) * 0.09);
}
