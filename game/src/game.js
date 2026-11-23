// game.js — glue: init/new game, per-frame update orchestration, bullet & collision
// resolution, explosions with area damage, carjacking, WASTED/BUSTED respawn, camera.
import { S, hooks, clamp, dist, angDiff, TAU, Rng, VW, VH } from './core.js';
import { buildWorld, world, isWater, circleSolids, solidsNear, VX, HY, isOnRoad, roadSpawn, lightGreen, zoneAt } from './world.js';
import { makeCar, carPhysics, carFx, carDamage, impactDamage, pointInCar, carSpeed, carCorners, CAR_TYPES, CIV_TYPES } from './cars.js';
import { updateTraffic, updatePeds, spawnPed, ejectDriver, lightState } from './street.js';
import { makePlayer, playerUpdate, damagePlayer, nearestCar, givePickup, WALK, SPRINT } from './player.js';
import * as police from './police.js';
import * as missions from './missions.js';
import { updateHud, resetHelp } from './hud.js';
import { say, toast, addMoney } from './core.js';
import { Audio } from './audio.js';

// ---------------------------------------------------------------- init
export function newGame(seed = 1337, forShot = false) {
  S.seed = seed;
  S.rng = S.rng || new Rng(seed);
  buildWorld(seed);
  world.timeRef = 0;
  S.world = world;
  S.cars = []; S.peds = []; S.cops = []; S.bullets = []; S.particles = [];
  S.explosions = []; S.bodies = []; S.skids = []; S.toasts = []; S.subs = []; S.panics = [];
  S.wanted = 0; S.seenT = 0; S.bustT = 0; S.money = forShot ? 0 : 250; S.moneyShow = S.money;
  S.flash = 0; S.shake = 0; S.time = 0; S.frame = 0; S.finale = false;
  S.heli = null; S.horn = 0; S.bigMap = false; S.stamina = 100; S.zone = ''; S.zoneT = 0;
  missions.initMissions();
  const sp = world.spawns.player;
  S.player = makePlayer(sp.x, sp.y);
  S.cam.x = sp.x; S.cam.y = sp.y; S.cam.zoom = 0.9;
  S.mode = forShot ? S.mode : 'playing';
  resetHelp();
  seedCity();
  registerHooks();
  if (!forShot) {
    say('Vice Palms. Find Rico at the Palms Hotel — purple marker on your map.', 6);
  }
}

// Parked cars + initial ambient population, all seeded.
function seedCity() {
  const rng = new Rng(S.seed ^ 0x51ce);
  // curb-parked cars along random road edges
  for (let k = 0; k < 42; k++) {
    const sp = roadSpawn(rng, rng.pick(VX), rng.pick(HY), 0, 1, null);
    if (!sp) continue;
    const off = rng.chance(0.5) ? 24 : -24;
    const perp = sp.ang + Math.PI / 2;
    const x = sp.x + Math.cos(perp) * off, y = sp.y + Math.sin(perp) * off;
    if (isWater(x, y)) continue;
    makeCar(rng.pick(CIV_TYPES), x, y, sp.ang + (rng.chance(0.5) ? Math.PI : 0), { ai: 'parked', rng });
  }
  // docks & airfield workers' cars
  makeCar('pickup', 700, 1100, 0, { ai: 'parked', rng });
  makeCar('van', 1100, 640, Math.PI / 2, { ai: 'parked', rng });
  makeCar('compact', 4900, 1150, Math.PI / 2, { ai: 'parked', rng });
  makeCar('sports', 5700, 1300, 0, { ai: 'parked', rng, color: '#20c8e8' });
  // a generous starter car by the hotel
  makeCar('muscle', 2200, 4110, 0, { ai: 'parked', rng, color: '#282830' });
  // initial traffic near the player
  for (let k = 0; k < 8; k++) {
    const sp = roadSpawn(rng, S.player.x, S.player.y, 500, 1400);
    if (sp) makeCar(rng.pick(CIV_TYPES), sp.x, sp.y, sp.ang, { ai: 'traffic', rng, ni: sp.ni, nj: sp.nj, pi: sp.pi, pj: sp.pj });
  }
  // initial peds
  for (let k = 0; k < 14; k++) {
    const a = rng.r() * TAU, r = 300 + rng.r() * 700;
    const x = S.player.x + Math.cos(a) * r, y = S.player.y + Math.sin(a) * r;
    if (!isWater(x, y)) spawnPed(rng, x, y);
  }
}

function registerHooks() {
  hooks.damagePlayer = damagePlayer;
  hooks.damageCar = carDamage;
  hooks.addWanted = police.addWanted;
  hooks.tryCarjack = tryCarjack;
  hooks.hurtPed = hurtPed;
  hooks.hurtCop = police.hurtCop;
  hooks.crime = police.crime;
  hooks.explodeCar = explodeCarNow;
  hooks.carIgnite = (car) => { S.sfx.push({ name: 'crash', x: car.x, y: car.y }); };
  hooks.playerWasted = () => beginDeath('wasted');
  hooks.busted = () => beginDeath('busted');
  window.VP = window.VP || {};
  window.VP.hurt = (n) => damagePlayer(n, 'cop');
  window.VP.wastedNow = () => beginDeath('wasted');
  window.VP.pickup = (k) => givePickup(k);
}

// ---------------------------------------------------------------- carjack
export function tryCarjack() {
  const p = S.player;
  if (p.inCar) return; // handled by player.js exit path
  const car = nearestCar();
  if (!car) { S.sfx.push({ name: 'punch', x: p.x, y: p.y }); return; }
  if (car.ai === 'traffic' || car.ai === 'police') {
    if (car.ai === 'traffic') { ejectDriver(car); police.addWanted(1, car.x, car.y); }
    else { police.addWanted(2, car.x, car.y); }
  }
  car.ai = null;
  car.siren = false;
  p.inCar = car;
  car.driver = 'player';
  p.x = car.x; p.y = car.y;
  S.sfx.push({ name: 'door', x: p.x, y: p.y });
  toast('Vehicle acquired', 1.6);
}

// ---------------------------------------------------------------- bullets
function updateBullets(dt) {
  for (const b of S.bullets) {
    const steps = 3;
    for (let s = 0; s < steps && b.life > 0; s++) {
      const sd = (b.spd * dt) / steps;
      b.x += b.dx * sd; b.y += b.dy * sd;
      // solids
      for (const solid of solidsNear(b.x, b.y, 6)) {
        if (b.x > solid.x && b.x < solid.x + solid.w && b.y > solid.y && b.y < solid.y + solid.h) {
          b.life = 0; spark(b.x, b.y, 4); break;
        }
      }
      if (b.life <= 0) break;
      if (b.owner !== 'player') {
        // cops shoot the player or the player's car
        const p = S.player;
        if (p.inCar) {
          if (pointInCar(b.x, b.y, p.inCar)) { carDamage(p.inCar, b.dmg * 0.6, 'cop'); b.life = 0; spark(b.x, b.y, 3); break; }
        } else if (dist(b.x, b.y, p.x, p.y) < 10) {
          damagePlayer(b.dmg, 'cop'); b.life = 0; break;
        }
      } else {
        // player bullets hit peds, cops, cars
        for (const ped of S.peds) {
          if (ped.dead) continue;
          if (dist(b.x, b.y, ped.x, ped.y) < 10) { hurtPed(ped, b.dmg, Math.atan2(b.dy, b.dx)); b.life = 0; break; }
        }
        if (b.life <= 0) break;
        for (const cop of S.cops) {
          if (cop.dead) continue;
          if (dist(b.x, b.y, cop.x, cop.y) < 10) { police.hurtCop(cop, b.dmg, Math.atan2(b.dy, b.dx)); b.life = 0; spark(b.x, b.y, 3); break; }
        }
        if (b.life <= 0) break;
        for (const car of S.cars) {
          if (car.dead || S.player.inCar === car) continue;
          if (pointInCar(b.x, b.y, car)) {
            carDamage(car, b.dmg * 0.8, 'player');
            b.life = 0; spark(b.x, b.y, 4);
            police.crime(car.x, car.y, 1);
            break;
          }
        }
      }
    }
    b.life -= dt;
  }
  S.bullets = S.bullets.filter((b) => b.life > 0);
}

function spark(x, y, n) {
  for (let k = 0; k < n; k++) {
    S.particles.push({ k: 'spark', x, y, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160, life: 0, max: 0.3, r: 2 });
  }
}

// ---------------------------------------------------------------- peds
function hurtPed(ped, dmg, ang) {
  if (ped.dead) return;
  ped.hp -= dmg;
  ped.x += Math.cos(ang) * 5; ped.y += Math.sin(ang) * 5;
  for (let k = 0; k < 3; k++) {
    S.particles.push({ k: 'blood', x: ped.x, y: ped.y, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, life: 0, max: 0.5, r: 3 });
  }
  ped.state = 'flee'; ped.panicT = 8; ped.fleeAng = ang + (Math.random() - 0.5) * 1.2;
  if (ped.hp <= 0) {
    ped.dead = true;
    S.bodies.push({ x: ped.x, y: ped.y, ang: ped.ang, t: 0, kind: 'ped' });
    S.totalKills++;
    police.addWanted(1, ped.x, ped.y);
    S.sfx.push({ name: 'hurt', x: ped.x, y: ped.y });
  } else {
    police.addWanted(1, ped.x, ped.y);
  }
}

// ---------------------------------------------------------------- explosions
export function explodeCarNow(car) {
  if (car.exploded) return;
  car.exploded = true;
  S.explosions.push({ x: car.x, y: car.y, t: 0, max: 0.9, power: 1 });
  S.flash = 0.4; S.flashCol = '255,220,150';
  S.shake = Math.min(22, S.shake + 14);
  S.sfx.push({ name: 'explosion', x: car.x, y: car.y });
  for (let k = 0; k < 16; k++) {
    S.particles.push({ k: 'fire', x: car.x + (Math.random() - 0.5) * 40, y: car.y + (Math.random() - 0.5) * 24, vx: (Math.random() - 0.5) * 140, vy: (Math.random() - 0.5) * 140, life: 0, max: 0.6 + Math.random() * 0.4, r: 6 + Math.random() * 8 });
  }
  for (let k = 0; k < 10; k++) {
    S.particles.push({ k: 'smoke', x: car.x, y: car.y, vx: (Math.random() - 0.5) * 60, vy: -30 - Math.random() * 40, life: 0, max: 1.6 + Math.random(), r: 10 + Math.random() * 10, dark: true });
  }
  // area damage
  for (const other of S.cars) {
    if (other === car) continue;
    const d = dist(other.x, other.y, car.x, car.y);
    if (d < 130 && !other.dead) carDamage(other, Math.max(0, 90 - d * 0.7), 'explosion');
  }
  for (const ped of S.peds) {
    if (ped.dead) continue;
    const d = dist(ped.x, ped.y, car.x, car.y);
    if (d < 110) hurtPed(ped, 60 - d * 0.4, Math.atan2(ped.y - car.y, ped.x - car.x));
  }
  for (const cop of S.cops) {
    if (cop.dead) continue;
    const d = dist(cop.x, cop.y, car.x, car.y);
    if (d < 110) police.hurtCop(cop, 70 - d * 0.5, Math.atan2(cop.y - car.y, cop.x - car.x));
  }
  const p = S.player;
  const dp = dist(p.x, p.y, car.x, car.y);
  if (p.inCar === car) { damagePlayer(150, 'explosion'); }
  else if (dp < 120) damagePlayer(Math.max(0, 70 - dp * 0.5), 'explosion');
  missions.onCarDestroyed(car);
  police.addWanted(1, car.x, car.y);
  police.crime(car.x, car.y, 2);
}

// ---------------------------------------------------------------- weather
// Deterministic rain cycle: dry stretches broken by storms with lightning.
export function updateWeather(dt) {
  const cycle = S.time % 260;
  const level = Math.max(0, Math.min(1, (cycle - 180) / 40)) * Math.max(0, Math.min(1, (260 - cycle) / 30));
  const prev = S.rain;
  S.rain += (level - S.rain) * Math.min(1, 0.6 * dt);
  if (prev < 0.2 && S.rain >= 0.2) S.toasts.push({ text: 'Storm rolling in off the Gulf.', t: 0, dur: 3 });
  // lightning during heavy rain
  if (S.rain > 0.6 && S.lightning <= 0) {
    S.lightning = 3 + Math.random() * 9;
  }
  S.lightning -= dt;
  if (S.rain > 0.6 && S.lightning <= 0) {
    S.flash = 0.5; S.flashCol = '200,220,255';
    S.shake = Math.min(S.shake + 5, 10);
    S.sfx.push({ name: 'thunder', x: S.cam.x + (Math.random() - 0.5) * 800, y: S.cam.y + (Math.random() - 0.5) * 800 });
    S.lightning = 4 + Math.random() * 10;
  }
}

// ---------------------------------------------------------------- pickups
function updatePickups(dt) {
  const p = S.player;
  for (const pk of world.pickups) {
    if (!pk.live) { pk.cd -= dt; if (pk.cd <= 0) { pk.live = true; pk.t = 0; } continue; }
    pk.t += dt;
    if (dist(p.x, p.y, pk.x, pk.y) < 26 && !p.dead) {
      pk.live = false; pk.cd = 45;
      givePickup(pk.kind);
      S.particles.push({ k: 'ring', x: pk.x, y: pk.y, life: 0, max: 0.5, r: 16 });
      if (pk.kind === 'cash') toast('Found stashed cash', 1.8);
    }
  }
}

// ---------------------------------------------------------------- pay'n'spray
// Drive into the garage with heat on the wheels: $400 buys a respray and a clean sheet.
const SPRAY = { x: 4020, y: 2010, r: 56 };
export function updateSpray(dt) {
  S.sprayCd = Math.max(0, S.sprayCd - dt);
  const p = S.player;
  if (!p.inCar || S.wanted === 0 || S.money < 400 || S.sprayCd > 0) return;
  if (dist(p.x, p.y, SPRAY.x, SPRAY.y) < SPRAY.r && carSpeed(p.inCar) < 40) {
    addMoney(-400);
    S.wanted = 0; S.seenT = 0;
    for (const car of S.cars) if (car.ai === 'police' && dist(car.x, car.y, p.x, p.y) > 500) car.despawn = true;
    for (const cop of S.cops) cop.despawn = true;
    S.heli = null;
    p.inCar.color = ['#c85a7a', '#5a9ac8', '#7ac85a', '#c88a5a', '#9a5ac8', '#d0d0d8'][Math.floor(Math.random() * 6)];
    S.sprayCd = 12;
    toast("Pay 'n' Spray: resprayed. Heat's gone. -$400", 3);
    S.sfx.push({ name: 'pickup', x: p.x, y: p.y });
    S.particles.push({ k: 'ring', x: p.x, y: p.y, life: 0, max: 0.6, r: 20 });
  }
}

// ---------------------------------------------------------------- zone names
function updateZone() {
  const z = zoneAt(S.player.x, S.player.y);
  if (z !== S.zone) {
    S.zone = z;
    S.zoneT = 3.2;
    S.sfx.push({ name: 'zone', x: S.player.x, y: S.player.y });
  }
}

// ---------------------------------------------------------------- car collisions
function carVsSolids(car) {
  if (car.dead) return;
  const corners = carCorners(car);
  let hitAny = false, worst = null;
  for (const corner of corners) {
    const res = circleSolids(corner.x, corner.y, 1.5);
    if (res.hit) {
      hitAny = true;
      worst = res;
      // push the car center away from the surface
      car.x += res.nx !== 0 || res.ny !== 0 ? (res.x - corner.x) * 0.8 : 0;
      car.y += (res.y - corner.y) * 0.8;
    }
  }
  if (hitAny && worst) {
    const closing = carSpeed(car);
    if (closing > 60) {
      carDamage(car, impactDamage(car, closing), 'wall');
      spark(car.x + Math.cos(car.ang) * car.spec.l * 0.4, car.y + Math.sin(car.ang) * car.spec.l * 0.4, 3);
      if (S.player.inCar === car && S.frame % 6 === 0) S.sfx.push({ name: 'crash', x: car.x, y: car.y });
    }
    // kill velocity into the surface
    const dot = car.vx * worst.nx + car.vy * worst.ny;
    if (dot < 0) { car.vx -= worst.nx * dot * 1.4; car.vy -= worst.ny * dot * 1.4; }
    car.fwd *= 0.55;
  }
  // world bounds
  car.x = clamp(car.x, 20, 6380); car.y = clamp(car.y, 20, 4780);
}

function carVsCars(dt) {
  for (let i = 0; i < S.cars.length; i++) {
    const a = S.cars[i];
    for (let j = i + 1; j < S.cars.length; j++) {
      const b = S.cars[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const rr = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 < 0.01) continue;
      const d = Math.sqrt(d2), overlap = rr - d;
      const nx = dx / d, ny = dy / d;
      const ma = a.dead ? 0 : 1, mb = b.dead ? 0 : 1;
      a.x -= nx * overlap * 0.5 * ma; a.y -= ny * overlap * 0.5 * ma;
      b.x += nx * overlap * 0.5 * mb; b.y += ny * overlap * 0.5 * mb;
      const closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (closing < -70) {
        const dmg = impactDamage(a, -closing);
        carDamage(a, dmg * 0.7, 'car'); carDamage(b, dmg * 0.7, 'car');
        spark((a.x + b.x) / 2, (a.y + b.y) / 2, 4);
        const p = S.player;
        if ((p.inCar === a || p.inCar === b) && S.frame % 8 === 0) S.sfx.push({ name: 'crash', x: a.x, y: a.y });
        // shove
        const imp = -closing * 0.4;
        a.vx -= nx * imp; a.vy -= ny * imp;
        b.vx += nx * imp; b.vy += ny * imp;
      }
    }
  }
}

// Run physics for every car that isn't player-controlled or scripted.
function carsPhysics(dt) {
  const p = S.player;
  for (const car of S.cars) {
    car.lifeT += dt;
    if (p.inCar === car) continue; // driven in player.js
    if (car.dead) { carPhysics(car, dt, { throttle: 0, steer: 0, hand: false }); continue; }
    if (car.ai === 'traffic') continue;        // AI drove it this frame
    if (car.ai === 'police') continue;         // police.js drove it
    if (car.ai === 'roadblock') continue;
    // parked & mission cars: idle physics (they can be bumped)
    carPhysics(car, dt, { throttle: 0, steer: 0, hand: true });
    // rolling to a stop when the driver fled
    if (car.driver === null) { /* friction handled in carPhysics */ }
  }
}

// ---------------------------------------------------------------- update
export function update(dt) {
  S.frame++;
  world.timeRef = S.time;
  S.modeT += dt;

  if (S.mode === 'wasted' || S.mode === 'busted') {
    updateAmbient(dt, true);
    if (S.modeT > 2.6) respawn();
    postUpdate(dt);
    return;
  }
  if (S.mode !== 'playing') return;

  playerUpdate(dt, S.input, world);
  carsPhysics(dt);
  updateTraffic(dt);
  updatePeds(dt);
  police.update(dt);
  police.updateRoadblocks(dt);
  missions.update(dt);
  updateBullets(dt);
  updatePickups(dt);
  updateZone();
  updateWeather(dt);
  updateSpray(dt);
  updateAmbient(dt, false);
  carVsCars(dt);
  for (const car of S.cars) if (!car.dead && car.ai !== 'traffic' && car.ai !== 'police') carVsSolids(car);
  for (const car of S.cars) if (car.ai === 'traffic' || car.ai === 'police') carVsSolids(car);
  for (const car of S.cars) carFx(car, dt);
  updateCamera(dt);
  postUpdate(dt);
}

function updateAmbient(dt, frozen) {
  // particles
  for (const p of S.particles) {
    p.life += dt;
    p.x += (p.vx ?? 0) * dt; p.y += (p.vy ?? 0) * dt;
    if (p.k === 'smoke') { p.vx *= 1 - dt; p.vy *= 1 - dt * 0.5; }
  }
  S.particles = S.particles.filter((p) => p.life < p.max);
  for (const e of S.explosions) e.t += dt;
  S.explosions = S.explosions.filter((e) => e.t < e.max);
  for (const b of S.bodies) b.t += dt;
  S.bodies = S.bodies.filter((b) => b.t < 30);
  for (const sk of S.skids) sk.t += dt;
  S.skids = S.skids.filter((s) => s.t < 25);
  // despawn flagged entities
  S.cars = S.cars.filter((c) => !c.despawn);
  S.cops = S.cops.filter((c) => !c.despawn && !c.dead);
  // flash & shake decay
  S.flash = Math.max(0, S.flash - dt * 1.4);
  S.shake *= 1 - Math.min(1, 5 * dt);
  if (S.shake < 0.3) S.shake = 0;
  S.cam.sx = (Math.random() - 0.5) * S.shake * 2;
  S.cam.sy = (Math.random() - 0.5) * S.shake * 2;
  updateHud(dt);
}

function postUpdate(dt) {
  // prune despawned cars and dead peds from arrays (keep recent bodies via S.bodies)
  S.cars = S.cars.filter((c) => !c.despawn);
  S.peds = S.peds.filter((p) => !p.despawn && !p.dead);
}

function updateCamera(dt) {
  const p = S.player;
  const target = p.inCar ? p.inCar : p;
  const vx = p.inCar ? p.inCar.vx : p.vx;
  const vy = p.inCar ? p.inCar.vy : p.vy;
  const speed = Math.hypot(vx, vy);
  const zoomT = p.inCar ? clamp(0.92 - speed / 2600, 0.72, 0.92) : 1.05;
  S.cam.zoom += (zoomT - S.cam.zoom) * Math.min(1, 2 * dt);
  const lead = p.inCar ? 0.42 : 0.18;
  const tx = target.x + vx * lead, ty = target.y + vy * lead;
  S.cam.x += (tx - S.cam.x) * Math.min(1, 5 * dt);
  S.cam.y += (ty - S.cam.y) * Math.min(1, 5 * dt);
  S.cam.x = clamp(S.cam.x, VW / 2 / S.cam.zoom - 100, 6400 - VW / 2 / S.cam.zoom + 100);
  S.cam.y = clamp(S.cam.y, VH / 2 / S.cam.zoom - 100, 4800 - VH / 2 / S.cam.zoom + 100);
}

// ---------------------------------------------------------------- death & respawn
function beginDeath(kind) {
  if (S.mode === 'wasted' || S.mode === 'busted') return;
  S.mode = kind;
  S.modeT = 0;
  S.flash = 0.5;
  S.flashCol = kind === 'wasted' ? '255,40,40' : '60,120,255';
  const mission = S.mission.active || S.mission.side;
  if (mission) missions.fail(mission, kind === 'wasted' ? 'You got wasted.' : 'You got busted.');
  S.sfx.push({ name: 'fail', x: S.player.x, y: S.player.y });
}

function respawn() {
  const p = S.player;
  const kind = S.mode;
  const fee = kind === 'wasted' ? 100 : 150;
  addMoney(-fee);
  const sp = kind === 'wasted' ? world.spawns.hospital : world.spawns.police;
  p.x = sp.x; p.y = sp.y; p.vx = p.vy = 0;
  p.hp = p.maxHp; p.dead = false; p.inCar = null;
  p.armor = 0;
  p.ammo = Math.max(p.ammo, 24);
  S.wanted = 0; S.seenT = 0; S.bustT = 0;
  // clear nearby heat
  for (const car of S.cars) if (car.ai === 'police' || car.ai === 'roadblock') car.despawn = true;
  for (const cop of S.cops) cop.despawn = true;
  S.mode = 'playing';
  S.modeT = 0;
  toast(kind === 'wasted' ? 'Patched up at Palm General.' : 'Released from VCPD custody.', 3);
}
