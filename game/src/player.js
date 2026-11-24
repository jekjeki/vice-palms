// VICE PALMS — the player: walk/sprint, fists + pistol, carjacking, enter/exit
// vehicles, health & armor, all input-driven.

import { CFG } from './config.js';
import { G, addStars, toast, say, addMoney, damagePlayer } from './state.js';
import { clamp, dist, dist2, angTo, burst, smokePuff } from './util.js';
import { runRNG } from './rng.js';
import { isDown, wasPressed } from './input.js';
import { resolveCircleSolids, isWater, onPiers } from './world.js';
import { driveCar, damageCar } from './cars.js';
import { damagePed, panicArea, makePed } from './peds.js';
import { damageCopFoot, killCop } from './police.js';
import { play } from './audio.js';

export function updatePlayer(dt) {
  const p = G.player;
  if (p.dead) return;
  p.cd -= dt;
  p.hurtT = Math.max(0, p.hurtT - dt);
  p.punchT = Math.max(0, p.punchT - dt);

  if (p.car) updateDriving(dt);
  else updateOnFoot(dt);

  if (wasPressed('switch') && !p.car) {
    if (p.weapon === 'fist' && p.ammo > 0) { p.weapon = 'pistol'; toast('Pistol equipped — ' + p.ammo + ' rounds'); }
    else { p.weapon = 'fist'; toast('Fists up'); }
  }
}

function updateDriving(dt) {
  const p = G.player, car = p.car;
  p.x = car.x; p.y = car.y;

  car.throttle = (isDown('up') ? 1 : 0) + (isDown('down') ? -1 : 0);
  car.steer = (isDown('right') ? 1 : 0) - (isDown('left') ? 1 : 0);
  car.hand = isDown('hand');
  driveCar(car, dt);

  if (isDown('horn') && Math.random() < dt * 4) play('blip');

  // exit
  if (wasPressed('enter')) {
    const spd = Math.hypot(car.vx, car.vy);
    if (spd < 240) {
      p.car = null;
      if (car.ai && car.ai.kind) { car.ai.paused = true; }
      car.driver = 'none';
      car.throttle = 0; car.steer = 0; car.hand = false;
      const side = car.ang + Math.PI / 2;
      p.x = car.x + Math.cos(side) * 26;
      p.y = car.y + Math.sin(side) * 26;
      p.vx = car.vx * 0.3; p.vy = car.vy * 0.3;
      p.ang = car.ang;
      p.walkT = 0;
    }
  }
}

function updateOnFoot(dt) {
  const p = G.player;

  let mx = (isDown('right') ? 1 : 0) - (isDown('left') ? 1 : 0);
  let my = (isDown('down') ? 1 : 0) - (isDown('up') ? 1 : 0);
  const moving = mx !== 0 || my !== 0;
  const sprint = isDown('sprint');
  const speed = sprint ? CFG.P_RUN : CFG.P_WALK;

  if (moving) {
    const a = Math.atan2(my, mx);
    p.vx += (Math.cos(a) * speed - p.vx) * Math.min(1, dt * 10);
    p.vy += (Math.sin(a) * speed - p.vy) * Math.min(1, dt * 10);
    p.ang = a;
    p.walkT += dt * (sprint ? 13 : 8);
  } else {
    p.vx *= Math.max(0, 1 - dt * 12);
    p.vy *= Math.max(0, 1 - dt * 12);
  }

  p.x += p.vx * dt; p.y += p.vy * dt;
  const hit = resolveCircleSolids(p, CFG.P_RADIUS);
  if (hit) { p.vx *= 0.4; p.vy *= 0.4; }
  if (isWater(p.x, p.y) && !onPiers(p.x, p.y)) {
    // shove back out of the ocean
    p.x -= p.vx * dt * 2.4; p.y -= p.vy * dt * 2.4;
    p.vx *= -0.4; p.vy *= -0.4;
  }

  // attack
  if (wasPressed('attack') && p.cd <= 0) {
    if (p.weapon === 'fist') doPunch();
    else if (p.ammo > 0) doShoot();
    else { toast('Out of ammo'); p.weapon = 'fist'; }
  }

  // enter / carjack
  if (wasPressed('enter')) tryEnterCar();
}

function doPunch() {
  const p = G.player;
  p.cd = 0.34;
  p.punchT = 0.22;
  play('punch');
  const reach = CFG.PUNCH_RANGE + 10;
  const hx = p.x + Math.cos(p.ang) * reach * 0.7;
  const hy = p.y + Math.sin(p.ang) * reach * 0.7;

  // peds & cops in front
  for (const pd of G.peds) {
    if (pd.dead) continue;
    if (dist2(hx, hy, pd.x, pd.y) < 20 * 20) {
      damagePed(pd, CFG.PUNCH_DMG, 'player');
      if (pd.gang) addStars(1);
      else if (p.stars === 0 && Math.random() < 0.6) addStars(1);
      burst(pd.x, pd.y, 3, { spMin: 10, spMax: 60, lifeMin: 0.2, lifeMax: 0.4, col: '#a11a2a', kind: 'blood' });
      return;
    }
  }
  for (const cop of G.cops) {
    if (cop.dead) continue;
    if (dist2(hx, hy, cop.x, cop.y) < 20 * 20) {
      damageCopFoot(cop, CFG.PUNCH_DMG, 'player');
      return;
    }
  }
  // cars
  for (const c of G.cars) {
    if (c.dead) continue;
    if (dist2(hx, hy, c.x, c.y) < (c.type.w * 0.5) ** 2) {
      damageCar(c, 6, 'player');
      burst(hx, hy, 3, { spMin: 10, spMax: 50, lifeMin: 0.15, lifeMax: 0.3, col: '#dfe6ee' });
      return;
    }
  }
}

function doShoot() {
  const p = G.player;
  p.cd = CFG.PISTOL_CD;
  p.ammo--;
  G.gunfireT = 3;
  play('shot');
  G.shake = Math.min(6, G.shake + 1.6);

  // soft auto-aim onto the nearest hostile in the facing cone (with lead)
  let bestA = p.ang, bestD = 1e9, bestT = null;
  const candidates = [];
  for (const pd of G.peds) if (!pd.dead) candidates.push(pd);
  for (const cop of G.cops) if (!cop.dead) candidates.push(cop);
  for (const c of G.cars) if (!c.dead && c !== p.car) candidates.push(c);
  for (const t of candidates) {
    const d = dist(p.x, p.y, t.x, t.y);
    if (d > CFG.PISTOL_RANGE) continue;
    const a = angTo(p.x, p.y, t.x, t.y);
    const off = Math.abs(Math.atan2(Math.sin(a - p.ang), Math.cos(a - p.ang)));
    if (off < 1.0 && d < bestD) { bestD = d; bestA = a; bestT = t; }
  }
  if (bestT && bestT.vx !== undefined) {
    const tFly = bestD / CFG.PISTOL_SPEED;
    bestA = angTo(p.x, p.y, bestT.x + (bestT.vx || 0) * tFly * 0.9, bestT.y + (bestT.vy || 0) * tFly * 0.9);
  }

  const a = bestA + runRNG.range(-0.035, 0.035);
  G.bullets.push({
    x: p.x + Math.cos(a) * 14, y: p.y + Math.sin(a) * 14,
    vx: Math.cos(a) * CFG.PISTOL_SPEED, vy: Math.sin(a) * CFG.PISTOL_SPEED,
    life: CFG.BULLET_LIFE, from: 'player', dmg: CFG.PISTOL_DMG,
  });  burst(p.x + Math.cos(a) * 18, p.y + Math.sin(a) * 18, 2, { spMin: 30, spMax: 90, lifeMin: 0.08, lifeMax: 0.2, col: '#ffe36e' });

  // firing in public draws a star
  const witness = G.peds.some(pd => !pd.dead && dist2(pd.x, pd.y, p.x, p.y) < 260 * 260)
    || G.cops.some(c => !c.dead && dist2(c.x, c.y, p.x, p.y) < 260 * 260);
  if (witness && p.stars < 1) addStars(1);
  panicArea(p.x, p.y, 300);
}

function tryEnterCar() {
  const p = G.player;
  let best = null, bd = 52 * 52;
  for (const c of G.cars) {
    if (c.dead) continue;
    const d = dist2(p.x, p.y, c.x, c.y);
    if (d < bd) { bd = d; best = c; }
  }
  if (!best) return;

  // occupied: jack it
  if (best.driver === 'ai') {
    const driver = makePed(best.x, best.y, {});
    driver.state = 'flee';
    driver.fear = 8;
    driver.ang = angTo(best.x, best.y, p.x, p.y) + Math.PI / 2;
    driver.home = { x: best.x, y: best.y };
    G.peds.push(driver);
    panicArea(best.x, best.y, 200);
    addStars(1);
    G.stats.carjacks++;
    play('jack');
    toast('Carjacked a ' + best.type.name + ' — the city noticed');
  } else {
    play('blip');
  }

  best.driver = 'player';
  best.ai = null;
  best.locked = false;
  p.car = best;
  p.x = best.x; p.y = best.y;
}

// bullets update (player, cops, gang share the pool)
export function updateBullets(dt) {
  const p = G.player;
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const b = G.bullets[i];
    b.life -= dt;
    const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;

    let consumed = false;

    // walls
    const probe = { x: nx, y: ny };
    const hit = resolveCircleSolids(probe, 2);
    if (hit) {
      burst(nx, ny, 3, { spMin: 10, spMax: 60, lifeMin: 0.1, lifeMax: 0.25, col: '#cfd8e3' });
      consumed = true;
    }

    if (!consumed && b.from === 'player') {
      for (const pd of G.peds) {
        if (pd.dead) continue;
        if (dist2(nx, ny, pd.x, pd.y) < 16 * 16) {
          damagePed(pd, b.dmg, 'player');
          G.gunfireT = 3;
          consumed = true; break;
        }
      }
      if (!consumed) for (const cop of G.cops) {
        if (cop.dead) continue;
        if (dist2(nx, ny, cop.x, cop.y) < 16 * 16) {
          damageCopFoot(cop, b.dmg, 'player');
          consumed = true; break;
        }
      }
      if (!consumed) for (const c of G.cars) {
        if (c.dead || c === p.car) continue;
        if (dist2(nx, ny, c.x, c.y) < (c.type.w * 0.48) ** 2) {
          damageCar(c, b.dmg * 0.7, 'player');
          burst(nx, ny, 3, { spMin: 10, spMax: 70, lifeMin: 0.1, lifeMax: 0.3, col: '#ffe36e' });
          if (c.ai && c.ai.kind === 'cop') addStars(p.stars < 1 ? 1 : 0);
          consumed = true; break;
        }
      }
    } else if (!consumed && (b.from === 'cop' || b.from === 'gang')) {
      const tx = p.car ? p.car.x : p.x, ty = p.car ? p.car.y : p.y;
      if (!p.dead && dist2(nx, ny, tx, ty) < (p.car ? p.car.type.w * 0.5 : 12) ** 2) {
        if (p.car) { damageCar(p.car, b.dmg * 0.6, 'shot'); G.shake = Math.min(8, G.shake + 2); }
        else damagePlayer(b.dmg, 'shot');
        consumed = true;
      }
      if (!consumed && b.from === 'gang') {
        for (const cop of G.cops) {
          if (cop.dead) continue;
          if (dist2(nx, ny, cop.x, cop.y) < 13 * 13) { damageCopFoot(cop, b.dmg, 'gang'); consumed = true; break; }
        }
      }
    }

    if (consumed || b.life <= 0) {
      G.bullets.splice(i, 1);
      continue;
    }
    b.x = nx; b.y = ny;
  }
}
