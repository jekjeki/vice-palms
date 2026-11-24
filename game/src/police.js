// VICE PALMS — the Vice Palms PD: wanted stars 1-5, cruiser pursuit with
// ramming, roadblocks at 3+ stars, foot cops that shoot, LOS decay and the
// BUSTED arrest flow.

import { CFG } from './config.js';
import { G, addStars, toast, say, addMoney, damagePlayer, resetPlayer } from './state.js';
import { dist, dist2, angTo, clamp, burst, normAng } from './util.js';
import { runRNG } from './rng.js';
import { roadAhead, nearestRoadPoint, isWater, onPiers, resolveCircleSolids } from './world.js';
import { makeCar, driveCar, damageCar } from './cars.js';
import { failMission, failSideMission } from './missions.js';
import { makePed } from './peds.js';
import { play } from './audio.js';

const COP_COLS = '#1e3a5c';

export function makeCruiser(x, y, ang) {
  const car = makeCar('interceptor', x, y, ang, { driver: 'ai' });
  car.ai = { kind: 'cop', state: 'pursuit', shootT: 0, ramT: 0 };
  car.siren = true;
  return car;
}

export function makeFootCop(x, y) {
  const cop = makePed(x, y, { shirt: '#2f5f9e', col: COP_COLS, state: 'walk' });
  cop.cop = true;
  cop.hp = 55;
  cop.state = 'cop';
  cop.shootCd = 0.8;
  cop.aimT = 0;
  return cop;
}

export function updatePolice(dt) {
  const p = G.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  const stars = p.stars;

  // ---- LOS decay: hide from the PD long enough to shed a star -------------
  let seen = false;
  for (const c of G.cars) {
    if (c.ai && c.ai.kind === 'cop' && !c.dead && dist2(c.x, c.y, px, py) < 560 * 560) { seen = true; break; }
  }
  if (!seen) {
    for (const cop of G.cops) {
      if (!cop.dead && dist2(cop.x, cop.y, px, py) < 440 * 440) { seen = true; break; }
    }
  }
  if (!seen) {
    // no roadblocks/cruisers nearby at all also count as hidden
    G.losTimer += dt;
    if (G.losTimer > CFG.STAR_DECAY_S) {
      G.losTimer = 0;
      if (p.stars > 0) {
        p.stars--;
        toast(p.stars === 0 ? 'You lost the cops' : 'Heat cooling down…');
      }
    }
  } else {
    G.losTimer = Math.max(0, G.losTimer - dt * 2);
  }

  if (stars === 0) {
    // stand down: cop cars drive off / disappear when far
    for (let i = G.cars.length - 1; i >= 0; i--) {
      const c = G.cars[i];
      if (c.ai && c.ai.kind === 'cop' && !c.dead && dist(c.x, c.y, px, py) > 900) G.cars.splice(i, 1);
    }
    for (let i = G.cops.length - 1; i >= 0; i--) {
      if (dist(G.cops[i].x, G.cops[i].y, px, py) > 800) G.cops.splice(i, 1);
    }
    G.bustT = 0;
    return;
  }

  // ---- cruiser spawns -----------------------------------------------------
  G.copTimer -= dt;
  const activeCops = G.cars.filter(c => c.ai && c.ai.kind === 'cop' && !c.dead).length;
  if (G.copTimer <= 0 && activeCops < Math.min(CFG.COP_MAX, stars * 2)) {
    G.copTimer = 3.2 - stars * 0.4;
    const a = runRNG.next() * Math.PI * 2;
    const sx = px + Math.cos(a) * CFG.COP_SPAWN_R;
    const sy = py + Math.sin(a) * CFG.COP_SPAWN_R;
    const snapped = nearestRoadPoint(G.world, sx, sy);
    if (!isWater(snapped.x, snapped.y)) {
      G.cars.push(makeCruiser(snapped.x, snapped.y, angTo(snapped.x, snapped.y, px, py)));
      play('siren2');
    }
  }

  // ---- roadblocks at 3+ stars --------------------------------------------
  if (stars >= CFG.ROADBLOCK_AT) {
    G.roadblockTimer -= dt;
    if (G.roadblockTimer <= 0) {
      G.roadblockTimer = 14 - stars;
      placeRoadblock(px, py);
    }
  }

  // ---- drive cop cars, deploy foot cops ----------------------------------
  for (const c of G.cars) {
    if (!c.ai || c.ai.kind !== 'cop') continue;
    if (c.dead) continue;
    copBrain(c, dt, px, py);
  }

  // foot cops
  for (let i = G.cops.length - 1; i >= 0; i--) {
    const cop = G.cops[i];
    if (cop.dead) { cop.deadT += dt; if (cop.deadT > 14) G.cops.splice(i, 1); continue; }
    copBrainFoot(cop, dt, px, py, i);
  }

  // ---- busted check -------------------------------------------------------
  if (!p.car && !p.dead) {
    let holding = false;
    for (const cop of G.cops) {
      if (cop.dead) continue;
      if (dist2(cop.x, cop.y, p.x, p.y) < 30 * 30) { holding = true; break; }
    }
    if (!holding) {
      for (const c of G.cars) {
        if (c.ai && c.ai.kind === 'cop' && !c.dead && Math.hypot(c.vx, c.vy) < 30 && dist2(c.x, c.y, p.x, p.y) < 55 * 55) { holding = true; break; }
      }
    }
    if (holding) {
      G.bustT += dt;
      if (G.bustT > CFG.BUST_HOLD && p.stars > 0) busted();
    } else {
      G.bustT = Math.max(0, G.bustT - dt * 2);
    }
  } else {
    G.bustT = 0;
  }
}

function copBrain(car, dt, px, py) {
  const ai = car.ai;
  const d = dist(car.x, car.y, px, py);

  // stopped cruiser near a player on foot: bail out an officer
  if (!G.player.car && d < 220 && Math.hypot(car.vx, car.vy) < 40 && ai.deployT === undefined) {
    ai.deployT = 0.4;
  }
  if (ai.deployT !== undefined) {
    ai.deployT -= dt;
    if (ai.deployT <= 0 && G.cops.length < 6) {
      ai.deployT = 2.2;
      const cop = makeFootCop(car.x, car.y);
      G.cops.push(cop);
      burst(car.x, car.y, 3, { spMin: 5, spMax: 30, lifeMin: 0.2, lifeMax: 0.4, col: '#8fa8c8' });
    }
  }

  // pursuit: steer toward an intercept point, full throttle, ram
  const p = G.player;
  const tx = px + (p.car ? p.car.vx * 0.5 : 0);
  const ty = py + (p.car ? p.car.vy * 0.5 : 0);
  const targetAng = angTo(car.x, car.y, tx, ty);
  let diff = normAng(targetAng - car.ang);
  car.steer = clamp(diff * 2.4, -1, 1);
  car.throttle = d > 130 ? 1 : (Math.abs(diff) < 1.2 ? 0.85 : 0.35);
  if (d < 60) car.throttle = 1;        // ram through
  car.hand = Math.abs(diff) > 2.2 && d < 260;

  // stuck detection: back up
  if (Math.hypot(car.vx, car.vy) < 12) {
    ai.stuckT = (ai.stuckT || 0) + dt;
    if (ai.stuckT > 1.2) { car.throttle = -0.9; car.steer = -car.steer; if (ai.stuckT > 2.2) ai.stuckT = 0; }
  } else ai.stuckT = 0;

  // shoot from the cruiser at 4+ stars
  if (p.stars >= 4 && d < 320) {
    ai.shootT = (ai.shootT || 0) - dt;
    if (ai.shootT <= 0) {
      ai.shootT = 1.6 - p.stars * 0.15;
      const a = angTo(car.x, car.y, px, py) + runRNG.range(-0.12, 0.12);
      G.bullets.push({ x: car.x + Math.cos(a) * 20, y: car.y + Math.sin(a) * 20, vx: Math.cos(a) * 560, vy: Math.sin(a) * 560, life: 0.9, from: 'cop', dmg: 8 });
      G.gunfireT = 3;
      play('shot');
    }
  }
}

function copBrainFoot(cop, dt, px, py, idx) {
  const p = G.player;
  const d = dist(cop.x, cop.y, px, py);
  cop.aimT = angTo(cop.x, cop.y, px, py);

  if (!p.car) {
    // close in and arrest / shoot
    if (d > 26) {
      const s = d < 90 ? 120 : 150;
      cop.vx += (Math.cos(cop.aimT) * s - cop.vx) * Math.min(1, dt * 5);
      cop.vy += (Math.sin(cop.aimT) * s - cop.vy) * Math.min(1, dt * 5);
    } else { cop.vx *= 0.7; cop.vy *= 0.7; }
  } else {
    // player in a car: shoot at it
    if (d < 260) {
      cop.vx *= 0.8; cop.vy *= 0.8;
    } else {
      cop.vx += (Math.cos(cop.aimT) * 100 - cop.vx) * Math.min(1, dt * 4);
      cop.vy += (Math.sin(cop.aimT) * 100 - cop.vy) * Math.min(1, dt * 4);
    }
  }

  cop.x += cop.vx * dt; cop.y += cop.vy * dt;
  const hit = resolveCircleSolids(cop, 9);
  if (hit) { cop.vx *= -0.3; cop.vy *= -0.3; }
  if (isWater(cop.x, cop.y) && !onPiers(cop.x, cop.y)) {
    cop.x -= cop.vx * dt * 1.4; cop.y -= cop.vy * dt * 1.4;
  }

  cop.shootCd -= dt;
  if (cop.shootCd <= 0 && d < 300) {
    cop.shootCd = 1.25 - p.stars * 0.08;
    const a = cop.aimT + runRNG.range(-0.1, 0.1);
    G.bullets.push({ x: cop.x + Math.cos(a) * 12, y: cop.y + Math.sin(a) * 12, vx: Math.cos(a) * 560, vy: Math.sin(a) * 560, life: 0.8, from: 'cop', dmg: p.car ? 6 : 10 });
    G.gunfireT = 3;
    play('shot');
  }

  // run over by the player's car
  const pc = p.car;
  if (pc && dist2(pc.x, pc.y, cop.x, cop.y) < (pc.type.w * 0.45) ** 2 && Math.hypot(pc.vx, pc.vy) > 60) {
    killCop(cop, 'car');
    addStars(2);
  }
}

export function damageCopFoot(cop, n, src) {
  if (cop.dead) return;
  cop.hp -= n;
  burst(cop.x, cop.y, 3, { spMin: 10, spMax: 60, lifeMin: 0.2, lifeMax: 0.5, col: '#a11a2a', kind: 'blood' });
  if (cop.hp <= 0) killCop(cop, src);
}

export function killCop(cop, src) {
  if (cop.dead) return;
  cop.dead = true;
  cop.deadT = 0;
  burst(cop.x, cop.y, 8, { spMin: 20, spMax: 110, lifeMin: 0.3, lifeMax: 0.7, col: '#a11a2a', kind: 'blood' });
  G.stats.copKills++;
  if (src === 'player') { addStars(2); toast('Officer down — heavy heat incoming'); }
}

function placeRoadblock(px, py) {
  const p = G.player;
  const car = p.car;
  if (!car) return;                       // roadblocks only chase drivers
  const spot = roadAhead(G.world, car.x, car.y, car.ang, 520);
  if (isWater(spot.x, spot.y)) return;
  const vertical = spot.axis === 'v';
  const off = 40;
  for (const s of [-1, 1]) {
    const x = vertical ? spot.x + s * off : spot.x;
    const y = vertical ? spot.y : spot.y + s * off;
    if (isWater(x, y)) continue;
    const c = makeCar('interceptor', x, y, vertical ? Math.PI / 2 * -Math.sign(s) : 0, { driver: 'ai' });
    c.ai = { kind: 'cop', state: 'roadblock', shootT: 1.2 };
    G.cars.push(c);
    if (runRNG.chance(0.7)) G.cops.push(makeFootCop(vertical ? x : x + s * 46, vertical ? y + s * 46 : y));
  }
  toast('Roadblock ahead!');
}

// ---- busted / wasted flows -------------------------------------------------

export function busted() {
  const p = G.player;
  G.screen = 'busted';
  G.screenT = 0;
  play('fail');
  addMoney(-CFG.BUSTED_FEE);
  toast('Busted! Bail and processing: ' + CFG.BUSTED_FEE + '$');
}

export function wasted() {
  // screen switch handled by damagePlayer
}

export function respawn(kind) {
  const p = G.player;
  const at = kind === 'busted' ? G.world.poi.policeStation : G.world.poi.hospital;
  resetPlayer(at.x, at.y);
  p.armor = 0;
  if (kind === 'wasted') { addMoney(-CFG.WASTED_FEE); toast('Hospital bill: $' + CFG.WASTED_FEE); }
  G.cops.length = 0;
  for (let i = G.cars.length - 1; i >= 0; i--) {
    const c = G.cars[i];
    if (c.ai && c.ai.kind === 'cop' && !c.dead) G.cars.splice(i, 1);
  }
  // fail any active mission
  if (G.mission) { failMission('You got ' + (kind === 'busted' ? 'busted' : 'wasted') + '.'); }
  if (G.sideMission) { failSideMission(); }
  G.screen = 'play';
  G.screenT = 0;
  G.cam.x = p.x; G.cam.y = p.y;
}

// bullets vs cop cars helper used in game.js
export function bulletHitsCopCar(b, c) {
  return c.type && dist2(b.x, b.y, c.x, c.y) < (c.type.w * 0.5) ** 2;
}
