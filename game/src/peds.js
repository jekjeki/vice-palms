// peds.js — pedestrians: sidewalk wandering, panic fleeing, run-overs, deaths.
// Cop foot-peds live in the same array (kind 'cop') but their AI lives in police.js.

import { CFG } from './config.js';
import { RNG } from './rng.js';
import { clamp, resolveCircleSolids, TAU } from './util.js';
import { randomSidewalkPoint, isWater } from './world.js';
import { carSpeed } from './cars.js';

let nextPedId = 1;

const SKINS = ['#c8a284', '#8a6a4f', '#6a4a34', '#e0b89a', '#9a7a5f'];
const SHIRTS = ['#c84a5a', '#4a8ac8', '#4ac88a', '#c8b44a', '#8a4ac8', '#c88a4a', '#e0e0e0', '#5a5a6a', '#3a8a6a'];
const PANTS = ['#2a2a3a', '#3a3a4a', '#4a4258', '#2a3a2a', '#3a2a2a'];

export function makePed(g, x, y, kind = 'civ') {
  const p = {
    id: nextPedId++,
    kind,
    x, y,
    ang: g.rng.range(0, TAU),
    hp: kind === 'cop' ? 70 : CFG.PED_HP,
    dead: false,
    deadT: 0,
    fleeT: 0,
    fleeAng: 0,
    walkT: g.rng.range(1, 4),
    dir: g.rng.int(0, 3),
    skin: g.rng.pick(SKINS),
    shirt: kind === 'cop' ? '#1c2a52' : g.rng.pick(SHIRTS),
    pants: kind === 'cop' ? '#151d38' : g.rng.pick(PANTS),
    panicT: 0,
    screamT: 0,
    // cop fields (used by police.js)
    copState: null,
    shootCd: g.rng.range(0.5, 1.4),
    garrison: false,
  };
  g.peds.push(p);
  return p;
}

export function spawnPeds(g) {
  let n = 0;
  for (const p of g.peds) if (!p.dead && p.kind === 'civ') n++;
  while (n < CFG.PED_N) {
    const s = randomSidewalkPoint(g.rng, g.world.solids);
    if (g.player && Math.hypot(s.x - g.player.x, s.y - g.player.y) > 1900) continue;
    makePed(g, s.x, s.y);
    n++;
  }
}

export function hurtPed(g, p, dmg, cause) {
  if (p.dead) return;
  p.hp -= dmg;
  if (p.hp <= 0) {
    p.dead = true;
    p.deadT = 0;
    g.decals.push({ x: p.x, y: p.y, r: 10 + g.rng.range(0, 6), col: 'rgba(120,16,24,0.7)', life: 30 });
    panicNear(g, p.x, p.y, 340);
    if (g.hooks.pedKilled) g.hooks.pedKilled(p, cause);
  } else {
    // wounded: flee from the shooter
    p.fleeT = Math.max(p.fleeT, 4);
    p.panicT = 6;
    panicNear(g, p.x, p.y, 260);
  }
}

export function panicNear(g, x, y, r) {
  g.panicOrigin = { x, y };
  g.panicT = Math.max(g.panicT, 2.2);
  for (const p of g.peds) {
    if (p.dead || p.kind === 'cop') continue;
    if (Math.hypot(p.x - x, p.y - y) < r) {
      p.panicT = Math.max(p.panicT, 3 + g.rng.range(0, 2));
      p.fleeAng = Math.atan2(p.y - y, p.x - x) + g.rng.range(-0.5, 0.5);
      p.screamT = 1.2;
    }
  }
}

export function updatePeds(g, dt) {
  // population maintenance
  let alive = 0;
  for (const p of g.peds) if (!p.dead && p.kind === 'civ') alive++;
  if (alive < CFG.PED_N) {
    const s = randomSidewalkPoint(g.rng, g.world.solids);
    if (!g.player || Math.hypot(s.x - g.player.x, s.y - g.player.y) < 1700) makePed(g, s.x, s.y);
  }

  for (let i = g.peds.length - 1; i >= 0; i--) {
    const p = g.peds[i];
    if (p.dead) {
      p.deadT += dt;
      if (p.deadT > 22 || Math.hypot(p.x - g.player.x, p.y - g.player.y) > 2300) {
        g.peds.splice(i, 1);
      }
      continue;
    }
    // cull the far ones (civs only; cops managed by police.js)
    if (p.kind === 'civ' && g.player && Math.hypot(p.x - g.player.x, p.y - g.player.y) > 2200) {
      g.peds.splice(i, 1);
      continue;
    }
    if (p.kind === 'cop') continue; // police.js drives cops

    // ---- civ AI
    if (p.panicT > 0) {
      p.panicT -= dt;
      p.screamT = Math.max(0, p.screamT - dt);
      p.fleeT = Math.max(p.fleeT, 0.8);
    }
    if (p.fleeT > 0) {
      p.fleeT -= dt;
      // run away, jitter the heading a little
      p.fleeAng += g.rng.range(-1.6, 1.6) * dt;
      const sp = CFG.PED_RUN;
      movePed(g, p, Math.cos(p.fleeAng) * sp * dt, Math.sin(p.fleeAng) * sp * dt, sp);
      p.ang = p.fleeAng;
    } else {
      // sidewalk wander on the 4 axes
      p.walkT -= dt;
      if (p.walkT <= 0) {
        p.walkT = g.rng.range(2, 6);
        p.dir = (p.dir + (g.rng.chance(0.5) ? 1 : 3)) & 3;
        if (g.rng.chance(0.2)) p.dir = (p.dir + 2) & 3;
      }
      const ax = [[1, 0], [0, 1], [-1, 0], [0, -1]][p.dir];
      const nx = p.x + ax[0] * CFG.PED_WALK * dt;
      const ny = p.y + ax[1] * CFG.PED_WALK * dt;
      const res = tryMove(g, p, nx, ny);
      if (res.blocked) p.walkT = 0; // pick a new direction next frame
      p.ang = Math.atan2(ax[1], ax[0]);
    }

    // keep off water
    if (isWater(p.x, p.y)) {
      p.x = clamp(p.x, 60, CFG.WORLD_W - 60);
      p.y = clamp(p.y, 220, CFG.WORLD_H - 60);
      p.fleeAng = Math.PI; // run back west
      p.fleeT = 1;
    }
  }

  // run-overs: cars (moving fast) vs every living ped
  for (const c of g.cars) {
    const sp = carSpeed(c);
    if (sp < 55 || c.dead) continue;
    for (const p of g.peds) {
      if (p.dead) continue;
      const dx = p.x - c.x, dy = p.y - c.y;
      if (dx * dx + dy * dy < 26 * 26) {
        hurtPed(g, p, sp * 1.4, 'car');
        // fling the body
        if (p.dead) {
          p.x += c.vx * 0.09;
          p.y += c.vy * 0.09;
        }
        c.vx *= 0.96;
        c.vy *= 0.96;
        if (c.driver === 'player' && sp > 90) {
          g.audio && g.audio.punch();
        }
      }
    }
  }
}

/** axis move with solid/water blocking; returns whether it was blocked */
function tryMove(g, p, nx, ny) {
  const r = 7;
  const res = resolveCircleSolids(nx, ny, r, g.world.solids);
  let blocked = res.hit;
  if (isWater(res.x, res.y)) blocked = true;
  if (!blocked) {
    p.x = clamp(res.x, 24, CFG.WORLD_W - 24);
    p.y = clamp(res.y, 24, CFG.WORLD_H - 24);
  }
  return { blocked };
}

function movePed(g, p, dx, dy, sp) {
  const res = tryMove(g, p, p.x + dx, p.y + dy);
  if (res.blocked) {
    // slide along whichever axis still works
    const r1 = tryMove(g, p, p.x + dx, p.y);
    const r2 = tryMove(g, p, p.x, p.y + dy);
    if (!r1.blocked) p.x += dx;
    else if (!r2.blocked) p.y += dy;
    else p.fleeAng += Math.PI / 2;
  }
}
