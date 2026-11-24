// Vice Palms — pedestrians: sidewalk wanderers that panic and flee.

import { CROWD, ROADS, ROAD_W, SIDEWALK } from './config.js';
import { RNG } from './rng.js';
import { footFree, circleResolve } from './world.js';
import { dist, clamp } from './util.js';

const pedRng = new RNG(55501);

const SKINS = ['#c9a186', '#a87d5f', '#8a6248', '#6f4d36', '#e0b89a'];
const SHIRTS = ['#c94f6d', '#4fa8c9', '#c9a24f', '#7fc94f', '#9a6fc9', '#c9c9c9', '#5f5f6f', '#ff9f2d'];
const WALK = 42, FLEE = 158;

export function makePed(x, y, kind) {
  return {
    x, y,
    h: pedRng.angle(),
    kind: kind || 'civ',              // civ | cop | gang
    state: kind === 'cop' ? 'chase' : 'walk',
    speed: WALK * pedRng.range(0.7, 1.3),
    t: pedRng.range(0, 3),            // wander timer
    downT: 0,
    skin: pedRng.pick(SKINS),
    shirt: kind === 'cop' ? '#2b4a8f' : kind === 'gang' ? '#c9304f' : pedRng.pick(SHIRTS),
    shootT: 1,
    vx: 0, vy: 0,
    hp: kind === 'cop' ? 40 : kind === 'gang' ? 30 : 20,
  };
}

/** Spawn the initial crowd on sidewalks near the player. */
export function spawnPeds(game) {
  for (let k = 0; k < CROWD.pedMax; k++) trySpawnPed(game, game.player.x, game.player.y, true);
}

function trySpawnPed(game, px, py, anywhere) {
  const p = game.player;
  const civs = game.peds.filter((q) => q.kind === 'civ').length;
  if (civs >= CROWD.pedMax) return;
  for (let tries = 0; tries < 16; tries++) {
    const a = pedRng.angle();
    const d = anywhere ? pedRng.range(120, CROWD.spawnDist * 0.8) : pedRng.range(560, CROWD.spawnDist);
    const x = px + Math.cos(a) * d;
    const y = py + Math.sin(a) * d;
    if (x < 150 || y < 150 || x > game.world.size - 150 || y > game.world.size - 150) continue;
    if (footFree(game.world, x, y)) {
      game.peds.push(makePed(x, y, 'civ'));
      return;
    }
  }
}

/** Scatter into 'flee' from a point. */
export function fleePeds(game, x, y, r) {
  for (const p of game.peds) {
    if (p.kind !== 'civ' || p.state === 'down') continue;
    if (dist(p.x, p.y, x, y) < r) {
      p.state = 'flee';
      p.t = 4 + Math.random() * 3;
    }
  }
}

/** Knock a ped down (car hit, bullet, boom). */
export function knockPed(game, p, vx, vy, src) {
  if (p.state === 'down') return;
  p.state = 'down';
  p.downT = 0;
  p.vx = (vx || 0) * 0.4;
  p.vy = (vy || 0) * 0.4;
  game.spark(p.x, p.y, 4, '#c9304f');
  if (p.kind === 'cop') {
    game.addCrime(3);
  } else if (p.kind === 'gang') {
    game.stats && game.stats.kills++;
    if (game.missions && game.missions.rampage) game.missions.rampage.kills++;
  } else if (src !== 'boom') {
    game.stats && game.stats.kills++;
    game.addCrime(2);
  }
  game.peds.flee(p.x, p.y, 320);
}

export function updatePeds(game, dt) {
  const p = game.player;
  let civs = 0;
  for (const q of game.peds) if (q.kind === 'civ') civs++;

  for (let i = game.peds.length - 1; i >= 0; i--) {
    const q = game.peds[i];
    const d = dist(q.x, q.y, p.x, p.y);

    // despawn far civilians
    if (q.kind === 'civ' && (d > CROWD.despawnDist || (q.state === 'down' && q.downT > 7))) {
      game.peds.splice(i, 1);
      civs--;
      continue;
    }
    // gang members exist only while a rampage is live
    if (q.kind === 'gang' && !(game.missions && game.missions.rampage)) {
      game.peds.splice(i, 1);
      continue;
    }
    if (q.kind === 'cop' && q.state === 'down' && q.downT > 7) {
      game.peds.splice(i, 1);
      continue;
    }

    if (q.state === 'down') {
      q.downT += dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vx *= 1 - 3 * dt;
      q.vy *= 1 - 3 * dt;
      continue;
    }

    if (q.kind === 'cop') {
      // foot cop AI lives in police.js; here only movement resolution
      movePed(game, q, dt);
      continue;
    }

    // civilians wander along sidewalks, flee from danger; gangs press in
    if (q.kind === 'gang') {
      const dp = dist(q.x, q.y, p.x, p.y);
      if (dp < 260 && dp > 24) {
        q.h = Math.atan2(p.y - q.y, p.x - q.x);
        q.speed = WALK * 1.6;
      } else {
        q.speed = 0;
      }
    } else if (q.state === 'flee') {
      q.t -= dt;
      if (q.t <= 0) q.state = 'walk';
      const away = Math.atan2(q.y - p.y, q.x - p.x) + Math.sin(game.time * 7 + q.x) * 0.4;
      q.h = away;
      q.speed = FLEE;
    } else {
      q.t -= dt;
      if (q.t <= 0) {
        q.t = pedRng.range(1.5, 5);
        // pick a new heading, biased along sidewalks
        if (pedRng.chance(0.6)) {
          q.h = pedRng.chance(0.5) ? 0 : Math.PI / 2;
          if (pedRng.chance(0.5)) q.h += Math.PI;
        } else {
          q.h = pedRng.angle();
        }
      }
      q.speed = WALK * 0.9;
    }
    movePed(game, q, dt);

    // run over!
    if (p.inCar && Math.abs(p.inCar.speed) > 90) {
      const c = p.inCar;
      if (dist(q.x, q.y, c.x, c.y) < c.spec.w * 0.55 + 6) {
        knockPed(game, q, c.vx, c.vy, 'car');
        game.cam.shake = Math.min(6, game.cam.shake + 2);
      }
    }
  }

  if (civs < CROWD.pedMax && game.frame % 30 === 0) trySpawnPed(game, p.x, p.y, false);
}

/** Move + collide a foot actor. */
function movePed(game, q, dt) {
  const nx = q.x + Math.cos(q.h) * q.speed * dt;
  const ny = q.y + Math.sin(q.h) * q.speed * dt;
  const res = circleResolve(game.world, nx, ny, 8);
  if (res.hit) {
    // slide along the wall: try each axis alone
    const rx = circleResolve(game.world, q.x + Math.cos(q.h) * q.speed * dt, q.y, 8);
    const ry = circleResolve(game.world, q.x, q.y + Math.sin(q.h) * q.speed * dt, 8);
    if (!rx.hit) { q.x = rx.x; }
    else if (!ry.hit) { q.y = ry.y; }
    else { q.h += Math.PI / 2 + Math.random() * 0.6; }
    if (rx.hit && ry.hit) { q.x = res.x; q.y = res.y; }
  } else {
    q.x = res.x;
    q.y = res.y;
  }
  q.x = clamp(q.x, 80, game.world.size - 80);
  q.y = clamp(q.y, 80, game.world.size - 80);
}

/** Sidewalk proximity used by spawn logic and cop pathing (helper). */
export function nearSidewalk(x, y) {
  for (const r of ROADS) {
    const dx = Math.abs(x - r);
    const dy = Math.abs(y - r);
    if (dx > ROAD_W / 2 && dx < ROAD_W / 2 + SIDEWALK + 6) return true;
    if (dy > ROAD_W / 2 && dy < ROAD_W / 2 + SIDEWALK + 6) return true;
  }
  return false;
}
