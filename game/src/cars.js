// Vice Palms — vehicles: 8 types, arcade physics, drift, damage, explosions.

import { PHYS, LANE, ROADS, ROAD_W, PLAYER, COLORS } from './config.js';
import { circleResolve } from './world.js';
import { clamp, lerp, angDiff, dist, len } from './util.js';

let NEXT_ID = 1;

export const VEH = {
  sedan:   { name: 'Sedan',   l: 44, w: 21, max: 340, accel: 260, rev: 120, turn: 2.6, hp: 100, kind: 'car',  cols: ['#8f2d3a', '#2d5f8f', '#7a7a82', '#3a6f4a', '#b08f2d', '#5a4a6f'] },
  sports:  { name: 'Cheetah', l: 46, w: 20, max: 432, accel: 345, rev: 130, turn: 3.0, hp: 90,  kind: 'car',  cols: ['#ff2d78', '#23e6ff', '#ffd12d', '#c9c9d4'] },
  taxi:    { name: 'Cabbie',  l: 44, w: 21, max: 352, accel: 272, rev: 120, turn: 2.6, hp: 100, kind: 'car',  cols: ['#e8b524'] },
  van:     { name: 'Pony',    l: 52, w: 24, max: 300, accel: 205, rev: 110, turn: 2.2, hp: 130, kind: 'van',  cols: ['#9a9aa4', '#5f7f9f', '#8f5f4a'] },
  truck:   { name: 'Barracks',l: 68, w: 26, max: 272, accel: 170, rev: 100, turn: 1.7, hp: 180, kind: 'truck',cols: ['#4a5a3f', '#5a5a62'] },
  bus:     { name: 'Coach',   l: 76, w: 27, max: 250, accel: 150, rev: 90,  turn: 1.5, hp: 220, kind: 'bus',  cols: ['#2d7f8f'] },
  cruiser: { name: 'Cruiser', l: 46, w: 21, max: 402, accel: 320, rev: 130, turn: 2.9, hp: 120, kind: 'car',  cols: ['#e8e8ee'] },
  limo:    { name: 'Stretch', l: 62, w: 22, max: 362, accel: 240, rev: 110, turn: 2.0, hp: 140, kind: 'limo', cols: ['#15151b', '#e8e8ee'] },
};

export const CAR_TYPES = Object.keys(VEH);

export function makeCar(type, x, y, h, role, color) {
  const spec = VEH[type] || VEH.sedan;
  const c = {
    id: NEXT_ID++,
    type,
    spec,
    role: role || 'parked',          // parked | traffic | police | player | mission
    x, y, h,
    speed: 0,                        // signed forward speed
    vx: 0, vy: 0,                    // actual velocity (drift slides this off-forward)
    steer: 0, throttle: 0, handbrake: false,
    hp: spec.hp, maxHp: spec.hp,
    onFire: false, burnT: 0, dead: false, deadT: 0,
    color: color || spec.cols[0],
    lightsOn: true,
    sirenPhase: 0,
    smokeT: 0,
    ai: null,
    tag: null,                       // mission tag
    wreckCol: null,
  };
  return c;
}

/** The two collision circles of a car (front / back). */
export function carCircles(c) {
  const off = c.spec.l * 0.28;
  const r = c.spec.w * PHYS.carRadiusK;
  const cos = Math.cos(c.h), sin = Math.sin(c.h);
  return [
    { x: c.x + cos * off, y: c.y + sin * off, r },
    { x: c.x - cos * off, y: c.y - sin * off, r },
  ];
}

/**
 * One physics step for a car. Reads throttle/steer/handbrake, integrates the
 * drift model, resolves collisions against world solids (with impact damage),
 * and clamps to the map. gripK is the weather grip multiplier (0.8..1).
 */
export function updateCarPhysics(game, c, dt, gripK) {
  const spec = c.spec;
  gripK = gripK === undefined ? 1 : gripK;

  // --- longitudinal
  c.speed += c.throttle * spec.accel * dt;
  if (c.handbrake) c.speed *= 1 - 2.4 * dt;
  c.speed *= 1 - PHYS.drag * dt;
  c.speed = clamp(c.speed, -spec.rev, spec.max * (c.hp < spec.maxHp * 0.4 ? 0.75 : 1));

  // --- steering scales in with speed
  const spdK = clamp(Math.abs(c.speed) / 130, 0, 1);
  const dir = c.speed < 0 ? -1 : 1;
  c.h += c.steer * spec.turn * spdK * dir * dt;

  // --- velocity: mostly forward; handbrake (and rain/damage) cuts grip -> drift
  const fx = Math.cos(c.h), fy = Math.sin(c.h);
  const grip = (c.handbrake ? 1.6 : PHYS.grip * (c.hp < spec.maxHp * 0.5 ? 0.8 : 1)) * gripK;
  const k = 1 - Math.exp(-grip * dt);
  c.vx = lerp(c.vx, fx * c.speed, k);
  c.vy = lerp(c.vy, fy * c.speed, k);

  // --- integrate + collide (two circles)
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  const circles = carCircles(c);
  for (const cc of circles) {
    const res = circleResolve(game.world, cc.x, cc.y, cc.r);
    if (res.hit) {
      const dx = res.x - cc.x, dy = res.y - cc.y;
      c.x += dx;
      c.y += dy;
      const impact = len(c.vx, c.vy);
      if (impact > PHYS.impactMin) {
        const dmg = (impact - PHYS.impactMin) * PHYS.impactK;
        damageCar(game, c, dmg, 'wall');
        if (c.role === 'player' || dist(c.x, c.y, px(game), py(game)) < 400) {
          game.audio.crash(impact);
          game.spark(cc.x, cc.y, 5, '#ffd12d');
        }
        if (c.role === 'player') game.cam.shake = Math.min(10, game.cam.shake + impact * 0.012);
      }
      // kill the velocity component into the wall, bounce a little
      const nlen = len(res.nx, res.ny) || 1;
      const nx = res.nx / nlen, ny = res.ny / nlen;
      const dot = c.vx * nx + c.vy * ny;
      if (dot < 0) {
        c.vx -= nx * dot * 1.4;
        c.vy -= ny * dot * 1.4;
      }
      c.vx *= 0.72;
      c.vy *= 0.72;
      c.speed *= 0.5;
    }
  }
  c.x = clamp(c.x, 80, game.world.size - 80);
  c.y = clamp(c.y, 80, game.world.size - 80);

  // --- damage state
  if (c.dead) {
    c.deadT += dt;
    c.vx *= 1 - 3 * dt;
    c.vy *= 1 - 3 * dt;
    c.speed = 0;
    return;
  }
  if (c.hp <= PHYS.fireHp && !c.onFire) {
    c.onFire = true;
    c.burnT = 0;
  }
  if (c.onFire) {
    c.burnT += dt;
    c.hp -= 14 * dt;
    if (c.burnT > PHYS.burnTime) explodeCar(game, c);
  }
  if (c.hp < PHYS.smokeHp) {
    c.smokeT -= dt;
    if (c.smokeT <= 0) {
      c.smokeT = c.hp < 10 ? 0.05 : 0.14;
      const bx = c.x + Math.cos(c.h) * spec.l * 0.32;
      const by = c.y + Math.sin(c.h) * spec.l * 0.32;
      game.addPart(bx, by, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14 - 8,
        c.hp < PHYS.fireHp * 1.4 ? 0.5 : 0.9, c.hp < 25 ? 7 : 5, c.hp < 25 ? 'fire' : 'smoke');
    }
  }
}

function px(game) { return game.player.x; }
function py(game) { return game.player.y; }

/** Pairwise car-car push + impact damage. n is small (~25) so O(n^2) is fine. */
export function carCarCollide(game) {
  const cars = game.cars;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (a.dead && a.deadT > 1) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (b.dead && b.deadT > 1) continue;
      const minD = (a.spec.l + b.spec.l) * PHYS.carPairK;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > minD * minD || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d;
      const push = (minD - d) / 2;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
      const rel = Math.abs((a.vx - b.vx) * nx + (a.vy - b.vy) * ny) + Math.abs(a.speed - b.speed) * 0.3;
      if (rel > PHYS.impactMin) {
        const dmg = (rel - PHYS.impactMin) * PHYS.impactK * 1.6;
        damageCar(game, a, dmg, b);
        damageCar(game, b, dmg, a);
        const near = dist(a.x, a.y, game.player.x, game.player.y) < 420;
        if (near) {
          game.audio.crash(rel);
          game.spark((a.x + b.x) / 2, (a.y + b.y) / 2, 6, '#ffd12d');
        }
        if (a.role === 'player' || b.role === 'player') {
          game.cam.shake = Math.min(9, game.cam.shake + rel * 0.01);
          // rams hurt the player's car and can injure the player at speed
          const other = a.role === 'player' ? b : a;
          if (other.role === 'police' && rel > 190) game.player.hurt(6, 'ram');
          if (other.role === 'traffic') other.ai && (other.ai.panic = 6);
        }
      } else if (rel > 40) {
        // gentle nudge still scares traffic
        if (a.role === 'traffic' && a.ai) a.ai.panic = Math.max(a.ai.panic, 1.2);
        if (b.role === 'traffic' && b.ai) b.ai.panic = Math.max(b.ai.panic, 1.2);
      }
      // transfer a bit of momentum
      const avx = a.vx, avy = a.vy;
      a.vx = lerp(a.vx, b.vx, 0.18); a.vy = lerp(a.vy, b.vy, 0.18);
      b.vx = lerp(b.vx, avx, 0.18); b.vy = lerp(b.vy, avy, 0.18);
    }
  }
}

/** Apply damage to a car; tracks who to blame for wanted level. */
export function damageCar(game, c, n, src) {
  if (c.dead) return;
  c.hp -= n;
  if (c.hp <= 0 && !c.onFire) {
    c.onFire = true;
    c.burnT = Math.min(c.burnT, PHYS.burnTime - 0.9); // burning from a hit burns fast
    if (c.burnT < 0) c.burnT = 0;
  }
  if (src === 'player' && c.role === 'police') game.police && game.addCrime(1.4);
}

/** Car explodes: area damage, flash, shake, wreck. */
export function explodeCar(game, c) {
  if (c.dead) return;
  c.dead = true;
  c.deadT = 0;
  c.onFire = false;
  c.hp = 0;
  c.wreckCol = c.color;
  c.lightsOn = false;
  if (game.stats) game.stats.carsWrecked++;
  game.explode(c.x, c.y, 1);
  if (c.role === 'police') game.addCrime(3);
  if (c.tag === 'mission') game.missions.onTargetDown && game.missions.onTargetDown(game, c);
}

/** Damage everything near a boom; game.explode() owns particles + flash. */
export function boomDamage(game, x, y) {
  for (const c of game.cars) {
    if (c.dead) continue;
    const d = dist(x, y, c.x, c.y);
    if (d < PHYS.boomRadius + c.spec.l * 0.4) {
      damageCar(game, c, PHYS.boomDmg * (1 - d / (PHYS.boomRadius + c.spec.l * 0.4)) + 20, 'boom');
      const k = 240 * (1 - d / (PHYS.boomRadius + 120));
      const dd = Math.max(d, 8);
      c.vx += ((c.x - x) / dd) * k;
      c.vy += ((c.y - y) / dd) * k;
      c.speed *= 0.4;
    }
  }
  for (const p of game.peds) {
    if (p.state === 'down') continue;
    const d = dist(x, y, p.x, p.y);
    if (d < PHYS.boomRadius) game.peds.knock(p, (p.x - x) * 3, (p.y - y) * 3, 'boom');
    else if (d < PHYS.boomRadius * 2.4) game.peds.flee(x, y, PHYS.boomRadius * 2.4);
  }
  const pd = dist(x, y, game.player.x, game.player.y);
  if (!game.player.inCar && pd < PHYS.boomRadius * 0.8) {
    game.player.hurt(70 * (1 - pd / (PHYS.boomRadius * 0.8)), 'boom');
  } else if (game.player.inCar && pd < PHYS.boomRadius + 60) {
    game.player.hurt(10, 'boom');
  }
}

/** Nearest enterable car within reach of a point. */
export function nearestCar(game, x, y, maxD) {
  let best = null, bestD = maxD * maxD;
  for (const c of game.cars) {
    if (c.dead) continue;
    const d2 = (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y);
    if (d2 < bestD) { bestD = d2; best = c; }
  }
  return best;
}

/** Spawn a car parked at a world spot. */
export function spawnParked(game, spot) {
  const c = makeCar(spot.type, spot.x, spot.y, spot.h, 'parked', undefined);
  game.cars.push(c);
  return c;
}
