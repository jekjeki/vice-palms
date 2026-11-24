// Vice Palms — police: wanted stars, cruiser pursuit, roadblocks, foot cops,
// and an air-support helicopter at 4+ stars.

import { POLICE, ROADS, ROAD_W, PLAYER, HELI } from './config.js';
import { makeCar, carCircles } from './cars.js';
import { lightFor, randRoadPoint, circleResolve } from './world.js';
import { makePed } from './peds.js';
import { dist, clamp, angDiff } from './util.js';

export function makePolice() {
  return {
    wanted: 0,
    heat: 0,
    coolT: 0,          // seconds since last crime
    unseenT: 0,        // seconds no cop has seen the player
    spawnT: 0,
    blockT: 0,
    bustT: 0,
    blocks: [],        // parked roadblock cruisers
    blipT: 0,
    heli: null,        // air support at 4+ stars
    heliT: 0,
    burstT: 0,
  };
}

/** Register a crime; raises heat and the wanted level. */
export function addCrime(game, n) {
  const pol = game.police;
  pol.heat = clamp(pol.heat + n, 0, POLICE.heatMax);
  pol.coolT = 0;
  let w = 0;
  for (let i = 1; i <= 5; i++) if (pol.heat >= POLICE.thresholds[i]) w = i;
  if (w > pol.wanted) {
    pol.wanted = w;
    game.subtitle('WANTED LEVEL ' + w, 1.6);
    game.audio.blip(880, 0.12, 'square', 0.14);
  }
}

export function clearWanted(game) {
  const pol = game.police;
  pol.wanted = 0;
  pol.heat = 0;
  pol.bustT = 0;
  // cruisers give up: become traffic
  for (const c of game.cars) {
    if (c.role === 'police' && !c.dead) {
      if (c.ai && c.ai.mode === 'block') { c.despawn = true; }
      else { c.role = 'traffic'; c.ai = null; }
    }
  }
  game.police.blocks.length = 0;
  for (let i = game.peds.length - 1; i >= 0; i--) {
    if (game.peds[i].kind === 'cop' && game.peds[i].state !== 'down') game.peds.splice(i, 1);
  }
}

function spawnCruiser(game, mode) {
  const p = game.player;
  const pt = randRoadPoint(game.world, Math.random, p.x, p.y, 640, 1000);
  const h = pt.axis === 0 ? (pt.dir > 0 ? 0 : Math.PI) : (pt.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  const c = makeCar('cruiser', pt.x, pt.y, h, 'police');
  c.ai = { mode, stuckT: 0, revT: 0 };
  c.color = '#e8e8ee';
  game.cars.push(c);
  return c;
}

/** A pursuit cruiser's brain. */
function updateCruiser(game, c, dt) {
  const p = game.player;
  const ai = c.ai;
  if (!ai || c.dead) return;

  const tx = p.x, ty = p.y;
  const dh = angDiff(Math.atan2(ty - c.y, tx - c.x) - c.h);
  const d = dist(c.x, c.y, tx, ty);

  c.steer = clamp(dh * 2.6, -1, 1);
  c.throttle = 1;
  c.handbrake = false;

  // reverse out of stuck situations (walls, pile-ups)
  if (Math.abs(c.speed) < 26) ai.stuckT += dt;
  else ai.stuckT = Math.max(0, ai.stuckT - dt * 2);
  if (ai.stuckT > 1.4) { ai.revT = 1.0; ai.stuckT = 0; }
  if (ai.revT > 0) {
    ai.revT -= dt;
    c.throttle = -1;
    c.steer = -Math.sign(dh || 1);
  }

  // back off when aiming a ram at point blank so hits have punch
  if (d < 120) c.handbrake = false;
}

/** Foot cop brain: close in, then shoot. */
function updateCop(game, q, dt) {
  const p = game.player;
  if (q.state === 'down') return;
  const d = dist(q.x, q.y, p.x, p.y);
  const see = d < POLICE.copRange && (game.police.wanted > 0);
  if (see) {
    q.h = Math.atan2(p.y - q.y, p.x - q.x);
    if (d > 170) {
      q.speed = 96;
    } else {
      q.speed = 0;
      q.shootT -= dt;
      if (q.shootT <= 0) {
        q.shootT = POLICE.copShootRate + Math.random() * 0.4;
        const a = q.h + (Math.random() - 0.5) * 0.14;
        game.addBullet(q.x + Math.cos(a) * 10, q.y + Math.sin(a) * 10, a, 'cop');
        game.audio.gunshot();
      }
    }
  } else {
    q.speed = 0;
  }
  // busted check: cop on top of a vulnerable player
  if (game.police.wanted > 0 && !p.inCar && d < POLICE.bustDist && !p.dead) {
    game.police.bustT += dt;
    if (game.police.bustT > POLICE.bustTime) game.gameOver('busted');
  }
}

export function updatePolice(game, dt) {
  const pol = game.police;
  const p = game.player;
  pol.coolT += dt;
  pol.unseenT += dt;
  pol.blipT += dt;

  // sight pins the decay timer
  let seen = false;
  for (const c of game.cars) {
    if (c.role === 'police' && !c.dead && dist(c.x, c.y, p.x, p.y) < POLICE.sightRange) { seen = true; break; }
  }
  if (!seen) for (const q of game.peds) {
    if (q.kind === 'cop' && q.state !== 'down' && dist(q.x, q.y, p.x, p.y) < POLICE.sightRange * 0.7) { seen = true; break; }
  }
  if (seen) pol.unseenT = 0;
  else if (pol.wanted > 0 && pol.unseenT > 2.5) {
    pol.heat = Math.max(0, pol.heat - POLICE.decayRate * dt);
    let w = 0;
    for (let i = 1; i <= 5; i++) if (pol.heat >= POLICE.thresholds[i]) w = i;
    if (w < pol.wanted) {
      pol.wanted = w;
      if (w === 0) {
        game.subtitle('You lost the heat', 2);
        clearWanted(game);
      }
    }
  }
  if (pol.heat <= 0 && pol.wanted === 0) pol.unseenT = 0;

  if (pol.wanted === 0) {
    // no pursuit: clean up leftovers and send the heli home
    for (let i = game.cars.length - 1; i >= 0; i--) {
      const c = game.cars[i];
      if (c.despawn || (c.role === 'police' && c.dead && c.deadT > 8)) game.cars.splice(i, 1);
    }
    pol.bustT = 0;
    if (pol.heli) {
      pol.heli.leave = true;
    }
    return;
  }

  // ---- pursuit spawning
  pol.spawnT -= dt;
  const cruisers = game.cars.filter((c) => c.role === 'police' && !c.dead && (!c.ai || c.ai.mode !== 'block')).length;
  const want = Math.min(pol.wanted + 1, 6);
  if (pol.spawnT <= 0 && cruisers < want) {
    pol.spawnT = POLICE.cruiserRate;
    spawnCruiser(game, 'chase');
  }

  // ---- roadblocks at 3+ stars
  if (pol.wanted >= POLICE.roadblockAt) {
    pol.blockT -= dt;
    if (pol.blockT <= 0) {
      pol.blockT = POLICE.roadblockRate;
      placeRoadblock(game);
    }
  }

  // ---- run the pursuit
  for (const c of game.cars) {
    if (c.role === 'police' && !c.dead) {
      if (c.ai && c.ai.mode === 'block') {
        c.throttle = 0;
        c.steer = 0;
      } else {
        updateCruiser(game, c, dt);
      }
    }
  }

  // ---- foot cops: bail out of stopped cruisers near the player
  if (game.frame % 12 === 0) {
    for (const c of game.cars) {
      if (c.role !== 'police' || c.dead || (c.ai && c.ai.mode === 'block')) continue;
      const d = dist(c.x, c.y, p.x, p.y);
      if (d < 300 && Math.abs(c.speed) < 40 && !c.bailed) {
        c.bailed = true;
        const cop = makePed(c.x + 24, c.y + 12, 'cop');
        game.peds.push(cop);
        if (pol.wanted >= 2 && Math.random() < 0.6) {
          const cop2 = makePed(c.x - 20, c.y - 16, 'cop');
          game.peds.push(cop2);
        }
      }
    }
  }
  for (const q of game.peds) {
    if (q.kind === 'cop') updateCop(game, q, dt);
  }

  // ---- air support
  updateHeli(game, dt);
}

/** The police helicopter: hovers a searchlight over the player at 4+ stars. */
function updateHeli(game, dt) {
  const pol = game.police;
  const p = game.player;

  if (!pol.heli && pol.wanted >= 4 && pol.heliT <= 0) {
    pol.heli = {
      x: p.x + 900,
      y: p.y - 900,
      h: 0,
      hp: HELI.hp,
      t: 0,
      leave: false,
      smokeT: 0,
    };
    game.subtitle('Air support inbound!', 2.4);
    game.audio.blip(180, 0.5, 'sawtooth', 0.1, 90);
  }

  const heli = pol.heli;
  if (!heli) {
    pol.heliT -= dt;
    return;
  }

  heli.t += dt;
  if (heli.leave) {
    // fly off toward the map edge and despawn
    heli.x += Math.cos(-Math.PI / 4) * HELI.speed * 1.4 * dt;
    heli.y += Math.sin(-Math.PI / 4) * HELI.speed * 1.4 * dt;
    if (dist(heli.x, heli.y, p.x, p.y) > 1600) {
      pol.heli = null;
      pol.heliT = 8;
    }
    return;
  }

  // orbit the player with a slow wander offset
  const a = heli.t * 0.5;
  const tx = p.x + Math.cos(a) * 60;
  const ty = p.y + Math.sin(a * 1.3) * 60;
  const d = dist(heli.x, heli.y, tx, ty);
  if (d > 4) {
    const sp = Math.min(HELI.speed, d * 1.6);
    heli.x += ((tx - heli.x) / d) * sp * dt;
    heli.y += ((ty - heli.y) / d) * sp * dt;
    heli.h = Math.atan2(ty - heli.y, tx - heli.x);
  }

  // the searchlight pins the heat slowly
  const inLight = dist(heli.x, heli.y, p.x, p.y) < HELI.lightR;
  if (inLight) {
    pol.heat = Math.min(POLICE.heatMax, pol.heat + HELI.heatRate * dt);
    pol.unseenT = 0;
  }

  // door gunner at 5 stars
  if (pol.wanted >= 5) {
    pol.burstT -= dt;
    if (pol.burstT <= 0 && inLight) {
      pol.burstT = HELI.burstRate;
      for (let k = 0; k < 4; k++) {
        const ba = Math.atan2(p.y - heli.y, p.x - heli.x) + (Math.random() - 0.5) * 0.24;
        game.addBullet(heli.x + Math.cos(ba) * 26, heli.y + Math.sin(ba) * 26, ba, 'cop', 0.4);
      }
      game.audio.gunshot();
    }
  }

  // damaged heli smokes
  if (heli.hp < HELI.hp * 0.5) {
    heli.smokeT -= dt;
    if (heli.smokeT <= 0) {
      heli.smokeT = 0.1;
      game.addPart(heli.x, heli.y, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 0.8, 6, 'smoke');
    }
  }
}

/** A bullet check against the helicopter; returns true when absorbed. */
export function heliHit(game, b) {
  const heli = game.police.heli;
  if (!heli || heli.leave) return false;
  if (dist(b.x, b.y, heli.x, heli.y) < 34) {
    heli.hp -= PLAYER.pistolDmg;
    game.spark(heli.x, heli.y, 4, null);
    if (heli.hp <= 0) {
      game.explode(heli.x, heli.y, 1.4);
      game.police.heli = null;
      game.police.heliT = HELI.respawnDelay;
      game.addCrime(4);
      game.subtitle('Chopper down!', 3);
    }
    return true;
  }
  return false;
}

/** Park two cruisers across the road ahead of the player. */
function placeRoadblock(game) {
  const p = game.player;
  if (!p.inCar || Math.abs(p.inCar.speed) < 120) return;
  const c = p.inCar;
  // find the road crossing ~500-800 px ahead
  const ahead = 600;
  const tx = c.x + Math.cos(c.h) * ahead;
  const ty = c.y + Math.sin(c.h) * ahead;
  const snap = Math.abs(tx - nearestRoad(tx)) < Math.abs(ty - nearestRoad(ty))
    ? { x: nearestRoad(tx), y: ty, axis: 1 }
    : { x: tx, y: nearestRoad(ty), axis: 0 };
  for (const off of [-26, 26]) {
    const bc = makeCar('cruiser',
      snap.axis === 1 ? snap.x + off : snap.x,
      snap.axis === 1 ? snap.y : snap.y + off,
      snap.axis === 1 ? Math.PI / 2 : 0, 'police');
    bc.ai = { mode: 'block' };
    game.cars.push(bc);
    game.police.blocks.push(bc);
  }
  game.subtitle('Roadblock ahead!', 2);
}

function nearestRoad(v) {
  let best = ROADS[0], bd = Infinity;
  for (const r of ROADS) {
    const d = Math.abs(v - r);
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}

/** Siren audio flag: any active cruiser near the player. */
export function sirenNear(game) {
  const p = game.player;
  for (const c of game.cars) {
    if (c.role === 'police' && !c.dead && dist(c.x, c.y, p.x, p.y) < 560) return true;
  }
  return false;
}
