// VICE PALMS — pedestrians: wander the sidewalks, sunbathe on the sand, and
// flee screaming when the shooting starts. Getting hit by a car is fatal.

import { CFG } from './config.js';
import { G, addStars, toast } from './state.js';
import { clamp, dist, dist2, angTo, burst } from './util.js';
import { runRNG } from './rng.js';
import { resolveCircleSolids, isWater, onPiers, terrainAt } from './world.js';
import { carHitsPed } from './cars.js';
import { play } from './audio.js';

const PED_COLS = ['#e8b88a', '#c98a5e', '#8a5e3c', '#f0d0b0'];
const SHIRT_COLS = ['#ff6e9e', '#5ad0ff', '#ffe36e', '#7dff9e', '#c084ff', '#ff8a5c', '#e8e8ee'];

export function makePed(x, y, opts = {}) {
  return {
    x, y, ang: runRNG.next() * Math.PI * 2,
    vx: 0, vy: 0,
    col: opts.col || PED_COLS[Math.floor(runRNG.next() * PED_COLS.length)],
    shirt: opts.shirt || SHIRT_COLS[Math.floor(runRNG.next() * SHIRT_COLS.length)],
    state: opts.state || 'walk',   // walk | sunbathe | flee | dead | gang | mission
    speed: CFG.PED_SPEED,
    fear: 0,
    walkT: runRNG.next() * 10,
    dead: false,
    deadT: 0,
    hp: 30,
    gang: !!opts.gang,
    target: null,       // gang attacker focus
    shootCd: 0,
    missionTag: opts.missionTag || null,
    home: { x, y },
  };
}

export function spawnPedRandom(rng, near, minD, maxD, opts = {}) {
  for (let tries = 0; tries < 16; tries++) {
    let x, y;
    const t = rng.next();
    if (t < 0.35) {
      // sidewalk of a random road
      const vertical = rng.chance(0.5);
      if (vertical) {
        const rx = rng.pick(G.world.roadsX);
        x = rx + rng.sign() * (CFG.ROAD_HALF + 12);
        y = rng.range(230, CFG.BEACH_Y - 40);
      } else {
        const ry = rng.pick(G.world.roadsY);
        y = ry + rng.sign() * (CFG.ROAD_HALF + 12);
        x = rng.range(230, 4040);
      }
    } else if (t < 0.6) {
      x = rng.range(300, CFG.WORLD_W - 300);
      y = rng.range(CFG.BEACH_Y + 20, 3080);       // beach
    } else {
      x = rng.range(300, 4000); y = rng.range(240, 2900);
      if (terrainAt(x, y) !== 'city') continue;
    }
    if (isWater(x, y) && !onPiers(x, y)) continue;
    const d = dist(x, y, near.x, near.y);
    if (d < minD || d > maxD) continue;
    return makePed(x, y, opts);
  }
  return null;
}

export function updatePeds(dt) {
  const p = G.player;
  const px = p.car ? p.car.x : p.x, py = p.car ? p.car.y : p.y;

  for (let i = G.peds.length - 1; i >= 0; i--) {
    const pd = G.peds[i];
    if (pd.dead) {
      pd.deadT += dt;
      if (pd.deadT > 16) G.peds.splice(i, 1);
      continue;
    }
    const dPlayer = dist(pd.x, pd.y, px, py);
    if (dPlayer > CFG.PED_DESPAWN_R) { G.peds.splice(i, 1); continue; }

    // panic from recent gunfire anywhere nearby
    if (pd.state !== 'gang' && pd.fear <= 0 && G.gunfireT > 0 && dPlayer < 420) panic(pd);

    pd.shootCd -= dt;
    pd.fear -= dt;

    if (pd.state === 'gang') updateGangPed(pd, dt, px, py);
    else if (pd.state === 'flee') {
      const a = angTo(px, py, pd.x, pd.y);
      steer(pd, a, CFG.PED_FLEE_SPEED, dt);
      if (pd.fear <= 0 && dPlayer > 380) pd.state = 'walk';
    } else if (pd.state === 'sunbathe') {
      pd.vx = 0; pd.vy = 0;
      if (pd.fear > 0) pd.state = 'flee';
    } else {
      // stroll: random wander, hug sidewalks occasionally
      pd.walkT += dt;
      if (Math.random() < dt * 0.6) pd.ang += runRNG.range(-1.2, 1.2);
      steer(pd, pd.ang, pd.speed, dt);
      if (Math.random() < dt * 0.05) pd.state = 'sunbathe';
    }

    movePed(pd, dt);

    // run over by any car
    for (const c of G.cars) {
      if (c.dead) continue;
      if (carHitsPed(c, pd)) {
        killPed(pd, 'car');
        if (c.driver === 'player') {
          addStars(pd.gang ? 1 : 2);
          toast(pd.gang ? 'Gang member down' : 'Pedestrian down — the PD saw that');
        }
        break;
      }
    }
    if (pd.dead) continue;

    // gang peds and mission peds shoot
    if ((pd.state === 'gang') && pd.shootCd <= 0 && dPlayer < 300) {
      gangShoot(pd);
    }
  }
}

function steer(pd, ang, speed, dt) {
  pd.vx += (Math.cos(ang) * speed - pd.vx) * Math.min(1, dt * 6);
  pd.vy += (Math.sin(ang) * speed - pd.vy) * Math.min(1, dt * 6);
  pd.ang = ang;
  pd.walkT += dt * 6;
}

function movePed(pd, dt) {
  pd.x += pd.vx * dt; pd.y += pd.vy * dt;
  const hit = resolveCircleSolids(pd, 9);
  if (hit) { pd.ang += 2.4; pd.vx *= -0.3; pd.vy *= -0.3; }
  if (isWater(pd.x, pd.y) && !onPiers(pd.x, pd.y)) {
    // don't drown; turn back to the nearest land
    pd.ang = angTo(pd.x, pd.y, pd.home.x, pd.home.y);
    pd.x -= pd.vx * dt * 1.2; pd.y -= pd.vy * dt * 1.2;
  }
}

export function panic(pd) {
  if (pd.state === 'gang' || pd.dead) return;
  pd.state = 'flee';
  pd.fear = 6;
}

export function panicArea(x, y, r) {
  for (const pd of G.peds) {
    if (!pd.dead && dist2(x, y, pd.x, pd.y) < r * r) panic(pd);
  }
}

export function damagePed(pd, n, src) {
  if (pd.dead) return;
  pd.hp -= n;
  burst(pd.x, pd.y, 4, { spMin: 10, spMax: 60, lifeMin: 0.2, lifeMax: 0.5, rMin: 1, rMax: 3, col: '#a11a2a', kind: 'blood' });
  if (pd.hp <= 0) killPed(pd, src);
  else if (pd.state !== 'gang') panic(pd);
}

export function killPed(pd, src) {
  if (pd.dead) return;
  pd.dead = true;
  pd.deadT = 0;
  pd.vx = 0; pd.vy = 0;
  burst(pd.x, pd.y, 10, { spMin: 20, spMax: 120, lifeMin: 0.3, lifeMax: 0.8, rMin: 1.5, rMax: 3.5, col: '#a11a2a', kind: 'blood' });
  play('punch');
  panicArea(pd.x, pd.y, 320);
  G.stats.kills++;
  if (src === 'player') addStars(pd.gang ? 1 : 2);
}

function updateGangPed(pd, dt, px, py) {
  const d = dist(pd.x, pd.y, px, py);
  if (d > 240) {
    steer(pd, angTo(pd.x, pd.y, px, py), CFG.PED_FLEE_SPEED * 0.8, dt);
  } else if (d < 120) {
    steer(pd, angTo(px, py, pd.x, pd.y), CFG.PED_FLEE_SPEED * 0.6, dt); // keep distance
  } else {
    pd.vx *= 0.8; pd.vy *= 0.8;
    pd.ang = angTo(pd.x, pd.y, px, py);
  }
  if (pd.shootCd <= 0 && d < 320) gangShoot(pd);
}

function gangShoot(pd) {
  pd.shootCd = 1.4 + runRNG.next() * 0.9;
  const p = G.player;
  const px = p.car ? p.car.x : p.x, py = p.car ? p.car.y : p.y;
  const a = angTo(pd.x, pd.y, px, py) + runRNG.range(-0.14, 0.14);
  G.bullets.push({ x: pd.x + Math.cos(a) * 12, y: pd.y + Math.sin(a) * 12, vx: Math.cos(a) * 500, vy: Math.sin(a) * 500, life: 1.0, from: 'gang', dmg: 7 });
  G.gunfireT = 3;
  play('shot');
}

export function spawnGang(x, y, tag) {
  const pd = makePed(x, y, { state: 'gang', gang: true, shirt: '#3aa14a' });
  pd.missionTag = tag || null;
  pd.home = { x, y };
  G.peds.push(pd);
  return pd;
}
