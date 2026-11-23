// player.js — on-foot movement (walk/sprint/swim), carjack & vehicle entry/exit,
// fists + pistol with ammo, aiming, taking damage.
import { S, hooks, clamp, dist, angDiff, VW, VH, WEAPONS, STAMINA_MAX } from './core.js';
import { addMoney, toast } from './core.js';
import { isWater, circleSolids, world } from './world.js';
import { carPhysics, carSpeed, pointInCar } from './cars.js';

export const WALK = 152, SPRINT = 252, SWIM = 74;
export const P_R = 8.5;

export function makePlayer(x, y) {
  return {
    x, y, ang: 0, aimAng: 0, vx: 0, vy: 0,
    hp: 100, maxHp: 100, armor: 0, maxArmor: 100,
    weapon: 'fist', ammo: 60, smgAmmo: 0, shootCd: 0, punchCd: 0,
    inCar: null, jackCd: 0, walkPhase: 0, moving: 0, sprint: false,
    stamina: STAMINA_MAX, hurtT: 0, dead: false, muzzleT: 0, recoil: 0,
  };
}

export function givePickup(kind) {
  const p = S.player;
  switch (kind) {
    case 'health': p.hp = Math.min(p.maxHp, p.hp + 50); S.sfx.push({ name: 'pickup', x: p.x, y: p.y }); toast('Health restored', 2); break;
    case 'armor': p.armor = Math.min(p.maxArmor, p.armor + 50); S.sfx.push({ name: 'pickup', x: p.x, y: p.y }); toast('Body armor', 2); break;
    case 'ammo': p.ammo += 40; S.sfx.push({ name: 'pickup', x: p.x, y: p.y }); toast('+40 pistol ammo', 2); break;
    case 'cash': addMoney(80 + Math.floor(Math.random() * 120)); S.sfx.push({ name: 'pickup', x: p.x, y: p.y }); break;
    case 'smg': p.smgAmmo += 90; S.sfx.push({ name: 'pickup', x: p.x, y: p.y }); toast('Micro SMG unlocked — key 3', 3); break;
  }
}

export function playerUpdate(dt, input, world) {
  const p = S.player;
  p.shootCd -= dt; p.punchCd -= dt; p.jackCd -= dt; p.hurtT -= dt; p.muzzleT -= dt;
  p.recoil *= 1 - Math.min(1, 8 * dt);

  if (p.inCar) {
    driveCar(dt, input);
  } else {
    walk(dt, input);
  }

  // aim toward mouse (screen → world)
  const c = S.cam;
  const wx = c.x + (input.mx - VW / 2) / c.zoom;
  const wy = c.y + (input.my - VH / 2) / c.zoom;
  p.aimAng = Math.atan2(wy - p.y, wx - p.x);
  p.aimX = wx; p.aimY = wy;

  // weapon switching
  if (input.hit('Digit1')) p.weapon = 'fist';
  if (input.hit('Digit2')) { if (p.ammo > 0) p.weapon = 'pistol'; else S.toasts.push({ text: 'Out of pistol ammo', t: 0, dur: 2 }); }
  if (input.hit('Digit3')) { if (p.smgAmmo > 0) p.weapon = 'smg'; else S.toasts.push({ text: 'No SMG ammo — find a gun crate', t: 0, dur: 2 }); }
  // horn from cars nearby is ambient only; player horn on foot is a taunt
  if (input.hit('KeyH') && !p.inCar) S.sfx.push({ name: 'horn', x: p.x, y: p.y });

  // shooting
  if (input.mdown && !p.inCar && S.mode === 'playing') shoot(dt, input);
}

function walk(dt, input) {
  const p = S.player;
  let mx = 0, my = 0;
  if (input.down('KeyW', 'ArrowUp')) my -= 1;
  if (input.down('KeyS', 'ArrowDown')) my += 1;
  if (input.down('KeyA', 'ArrowLeft')) mx -= 1;
  if (input.down('KeyD', 'ArrowRight')) mx += 1;
  const l = Math.hypot(mx, my);
  const wantSprint = input.down('ShiftLeft', 'ShiftRight') && l > 0;
  if (wantSprint && p.stamina > 0) { p.stamina = Math.max(0, p.stamina - 24 * dt); p.sprint = true; }
  else { p.stamina = Math.min(STAMINA_MAX, p.stamina + 15 * dt); p.sprint = false; }
  if (p.stamina <= 0) p.sprint = false;
  const water = isWater(p.x, p.y);
  let sp = water ? SWIM : p.sprint ? SPRINT : WALK;
  if (l > 0) {
    mx /= l; my /= l;
    p.vx = mx * sp; p.vy = my * sp;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.ang = Math.atan2(my, mx);
    p.walkPhase += dt * (p.sprint ? 13 : 8);
    p.moving = 1;
  } else { p.vx = p.vy = 0; p.moving = 0; }
  // collisions
  const res = circleSolids(p.x, p.y, P_R);
  p.x = clamp(res.x, 12, 6388); p.y = clamp(res.y, 12, 4788);
  // bump into cars
  for (const car of S.cars) {
    if (car.dead) continue;
    const d = dist(p.x, p.y, car.x, car.y);
    if (d < car.radius + P_R && d > 0.01) {
      const push = (car.radius + P_R - d);
      const nx = (p.x - car.x) / d, ny = (p.y - car.y) / d;
      p.x += nx * push; p.y += ny * push;
      if (carSpeed(car) > 130) { damagePlayer(14, 'car'); p.vx += car.vx * 0.6; p.vy += car.vy * 0.6; }
    }
  }
  // carjack / enter / exit
  if (input.hit('KeyF') && p.jackCd <= 0) {
    p.jackCd = 0.4;
    hooks.tryCarjack?.();
  }
}

function driveCar(dt, input) {
  const p = S.player, car = p.inCar;
  const throttle = (input.down('KeyW', 'ArrowUp') ? 1 : 0) + (input.down('KeyS', 'ArrowDown') ? -1 : 0);
  const steer = (input.down('KeyD', 'ArrowRight') ? 1 : 0) + (input.down('KeyA', 'ArrowLeft') ? -1 : 0);
  carPhysics(car, dt, { throttle, steer, hand: input.down('Space') });
  car.driver = 'player';
  p.x = car.x; p.y = car.y; p.ang = car.ang;
  if (input.hit('KeyF') && p.jackCd <= 0) {
    p.jackCd = 0.4;
    const r = carRight(car);
    p.x = car.x - r.x * (car.spec.w * 0.5 + 12);
    p.y = car.y - r.y * (car.spec.w * 0.5 + 12);
    const res = circleSolids(p.x, p.y, P_R);
    p.x = res.x; p.y = res.y;
    car.driver = null;
    car.handT = 0;
    p.inCar = null;
    S.sfx.push({ name: 'door', x: p.x, y: p.y });
  }
}

function carRight(car) { return { x: -Math.sin(car.ang), y: Math.cos(car.ang) }; }

export function damagePlayer(amt, src) {
  const p = S.player;
  if (p.dead || S.mode !== 'playing') return;
  let left = amt;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, left * 0.65);
    p.armor -= absorbed; left -= absorbed;
  }
  p.hp -= left;
  p.hurtT = 0.35;
  S.damage.dir = src === 'cop' ? 1 : 0;
  S.damage.t = 0.4;
  S.sfx.push({ name: 'hurt', x: p.x, y: p.y });
  if (p.hp <= 0) { p.hp = 0; p.dead = true; hooks.playerWasted?.(); }
}

// Punch or fire the pistol toward the mouse.
function shoot(dt, input) {
  const p = S.player;
  if (p.weapon === 'fist') {
    if (p.punchCd > 0) return;
    p.punchCd = 0.38;
    const rx = p.x + Math.cos(p.aimAng) * 20, ry = p.y + Math.sin(p.aimAng) * 20;
    let hitSomething = false;
    for (const ped of S.peds) {
      if (ped.dead) continue;
      if (dist(rx, ry, ped.x, ped.y) < 20) { hooks.hurtPed?.(ped, 22, p.aimAng); hitSomething = true; }
    }
    for (const cop of S.cops) {
      if (cop.dead) continue;
      if (dist(rx, ry, cop.x, cop.y) < 20) { hooks.hurtCop?.(cop, 24, p.aimAng); hitSomething = true; }
    }
    S.sfx.push({ name: 'punch', x: p.x, y: p.y });
    if (hitSomething) hooks.crime?.(p.x, p.y, 1);
  } else {
    const spec = WEAPONS[p.weapon];
    if (p.shootCd > 0) return;
    if (p.weapon === 'pistol' && p.ammo <= 0) { p.weapon = 'fist'; return; }
    if (p.weapon === 'smg' && p.smgAmmo <= 0) { p.weapon = 'fist'; return; }
    p.shootCd = spec.cd;
    const jitter = (Math.random() - 0.5) * spec.spread * 2;
    const aim = p.aimAng + jitter;
    if (p.weapon === 'pistol') p.ammo--; else p.smgAmmo--;
    p.muzzleT = 0.06;
    p.recoil = p.weapon === 'smg' ? 2.4 : 4;
    const mx = p.x + Math.cos(aim) * 16, my = p.y + Math.sin(aim) * 16;
    S.bullets.push({ x: mx, y: my, dx: Math.cos(aim), dy: Math.sin(aim), spd: spec.spd, life: 0.55, owner: 'player', dmg: spec.dmg });
    S.panics.push({ x: p.x, y: p.y, r: 480, t: 0 });
    hooks.crime?.(p.x, p.y, 1);
    S.sfx.push({ name: p.weapon === 'smg' ? 'smg' : 'shot', x: p.x, y: p.y });
  }
}

// Try to enter / jack the nearest car (called via hooks.tryCarjack).
export function nearestCar() {
  const p = S.player;
  let best = null, bd = 64;
  for (const car of S.cars) {
    if (car.dead) continue;
    const d = dist(p.x, p.y, car.x, car.y);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}
