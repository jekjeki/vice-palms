// police.js — the VP Metro PD: wanted stars 1-5, pursuit cruisers that ram,
// roadblocks at 3+, foot cops that open fire, out-of-sight decay, BUSTED.

import { CFG } from './config.js';
import { clamp, dist, angDiff, resolveCircleSolids } from './util.js';
import { makeCar, carSpeed, damageCar, mkPart } from './cars.js';
import { randomLanePoint, dirVec, isWater, ROAD_V, ROAD_H, ROAD_HALF } from './world.js';
import { makePed, hurtPed } from './peds.js';

export function initPolice(g) {
  g.wanted = 0;
  g.wantedHeat = 0;
  g.heatT = 0;
  g.cruiserSpawnCd = 0;
  g.roadblockCd = 8;
  g.copSpawnCd = 0;
  g.lastWantedReason = '';
}

export function addWanted(g, n, reason) {
  if (n <= 0) return;
  const before = g.wanted;
  g.wanted = Math.min(CFG.WANTED_MAX, g.wanted + n);
  g.wantedHeat = 0;
  g.heatT = 0;
  if (reason) g.lastWantedReason = reason;
  if (g.wanted > before) {
    g.audio.star();
    g.toasts.push({ text: reason ? `WANTED ${g.wanted}★ — ${reason}` : `WANTED ${g.wanted}★`, t: 2.6, col: '#ffd24a' });
  }
}

export function raiseHeat(g, amount) {
  if (g.wanted >= CFG.WANTED_MAX) return;
  g.wantedHeat += amount;
  if (g.wantedHeat >= 1) {
    addWanted(g, 1, 'public gunfire');
  }
}

// ------------------------------------------------------------------ update

export function updatePolice(g, dt) {
  const p = g.player;
  if (!p) return;

  // ---- wanted 0: stand down
  if (g.wanted === 0) {
    g.siren = false;
    g.audio.sirenOn(false);
    for (let i = g.cars.length - 1; i >= 0; i--) {
      const c = g.cars[i];
      if (c.kind === 'police' && c.copMode !== 'parked' && dist(c.x, c.y, p.x, p.y) > 1500) {
        g.cars.splice(i, 1);
      }
    }
    for (let i = g.peds.length - 1; i >= 0; i--) {
      const pd = g.peds[i];
      if (pd.kind === 'cop' && !pd.dead && dist(pd.x, pd.y, p.x, p.y) > 900) g.peds.splice(i, 1);
    }
    return;
  }

  // ---- contact & decay
  let contact = false;
  for (const c of g.cars) {
    if (c.kind === 'police' && !c.dead && dist(c.x, c.y, p.x, p.y) < 640) { contact = true; break; }
  }
  if (!contact) {
    for (const pd of g.peds) {
      if (pd.kind === 'cop' && !pd.dead && dist(pd.x, pd.y, p.x, p.y) < 500) { contact = true; break; }
    }
  }
  if (contact) g.heatT = 0;
  else {
    g.heatT += dt;
    if (g.heatT > CFG.OUT_OF_SIGHT_T) {
      g.heatT = 0;
      g.wanted = Math.max(0, g.wanted - 1);
      g.wantedHeat = 0;
      if (g.wanted === 0) {
        g.toasts.push({ text: 'You lost the heat.', t: 2.5, col: '#8fdc8f' });
        g.audio.sirenOn(false);
        return;
      } else {
        g.toasts.push({ text: `Heat dropping… ${g.wanted}★`, t: 2, col: '#8fdc8f' });
      }
    }
  }

  // ---- cruisers
  let cruisers = 0;
  for (const c of g.cars) if (c.kind === 'police' && !c.dead && c.copMode === 'pursuit') cruisers++;
  const wantCruisers = Math.min(1 + g.wanted, 7);
  g.cruiserSpawnCd -= dt;
  if (cruisers < wantCruisers && g.cruiserSpawnCd <= 0) {
    g.cruiserSpawnCd = 2.2;
    const spot = randomLanePoint(g.rng, p, 1500);
    const d = dist(spot.x, spot.y, p.x, p.y);
    if (d > 500) {
      makeCar(g, spot.x, spot.y, dirAngle(spot.dir), 'police', {
        kind: 'police', driver: 'npc', dir: spot.dir, siren: true, copMode: 'pursuit',
      });
    }
  }

  // ---- roadblocks at 3+
  if (g.wanted >= CFG.ROADBLOCK_STARS) {
    g.roadblockCd -= dt;
    if (g.roadblockCd <= 0) {
      g.roadblockCd = 9;
      spawnRoadblock(g, p);
    }
  } else {
    g.roadblockCd = Math.min(g.roadblockCd, 6);
  }

  // ---- per-cruiser AI
  let anySirenNear = false;
  for (const c of g.cars) {
    if (c.kind !== 'police' || c.dead) continue;
    const d = dist(c.x, c.y, p.x, p.y);
    if (d < 1300) anySirenNear = true;
    if (c.driver !== 'npc' && c.driver !== null) continue; // stolen cruiser
    if (c.driver === 'player') continue;
    if (c.copMode === 'block') {
      blockerAI(g, c, dt);
    } else {
      pursuitAI(g, c, p, dt);
      maybeDeployCops(g, c, p, dt);
    }
  }
  g.siren = anySirenNear;
  g.audio.sirenOn(anySirenNear);

  // ---- foot cop AI
  for (const pd of g.peds) {
    if (pd.kind !== 'cop' || pd.dead) continue;
    copFootAI(g, pd, p, dt);
  }

  // ---- BUSTED check
  if (!p.car && !p.dead) {
    for (const pd of g.peds) {
      if (pd.kind === 'cop' && !pd.dead && dist(pd.x, pd.y, p.x, p.y) < 44) {
        g.hooks.busted();
        return;
      }
    }
  }
}

function dirAngle(dir) {
  return [0, Math.PI / 2, Math.PI, -Math.PI / 2][dir & 3];
}

// ------------------------------------------------------------------ cruisers

function pursuitAI(g, c, p, dt) {
  const tx = p.x, ty = p.y;
  const want = Math.atan2(ty - c.y, tx - c.x);
  const diff = angDiff(c.ang, want);
  c.steer = clamp(diff * 2.2, -1, 1);
  const sp = carSpeed(c);
  const d = dist(c.x, c.y, p.x, p.y);
  if (d < 90 && Math.abs(diff) < 0.7) {
    // ram
    c.throttle = 1;
    c.brake = 0;
  } else if (Math.abs(diff) > 2.0 && sp > 120) {
    c.throttle = 0;
    c.brake = 1; // turn around using reverse-ish braking
  } else {
    c.throttle = 1;
    c.brake = 0;
  }
  c.handbrake = Math.abs(diff) > 1.4 && sp > 200;

  // stuck wobble
  if (sp < 18) c.stuckT += dt;
  else c.stuckT = 0;
  if (c.stuckT > 1.6) {
    c.stuckT = 0;
    c.brake = 1;
    c.throttle = 0;
    c.reverseT = 0.7;
  }
  if (c.reverseT > 0) {
    c.reverseT -= dt;
    c.throttle = 0;
    c.brake = 1;
    c.steer = -c.steer;
  }
  c.siren = true;
  c.lightbar = true;
}

function blockerAI(g, c, dt) {
  // parked sideways across the road until the player is close, then pursue
  const p = g.player;
  c.throttle = 0;
  c.brake = 0;
  c.steer = 0;
  c.siren = true;
  if (dist(c.x, c.y, p.x, p.y) < 200) {
    c.copMode = 'pursuit';
  }
}

function maybeDeployCops(g, c, p, dt) {
  const d = dist(c.x, c.y, p.x, p.y);
  const playerOnFoot = !p.car;
  if (d < 300 && (playerOnFoot || carSpeed(c) < 60)) {
    let cops = 0;
    for (const pd of g.peds) if (pd.kind === 'cop' && !pd.dead) cops++;
    const maxCops = Math.min(g.wanted + 1, 6);
    if (cops < maxCops && c.copDeployCd <= 0) {
      c.copDeployCd = 2.5;
      const n = Math.min(2, maxCops - cops);
      for (let i = 0; i < n; i++) {
        const sideAng = c.ang - Math.PI / 2 + i * Math.PI;
        const cop = makePed(g, c.x + Math.cos(sideAng) * 26, c.y + Math.sin(sideAng) * 26, 'cop');
        cop.shotgun = g.wanted >= CFG.COP_SHOTGUN_STARS;
      }
      c.driver = null; // the officer left the cruiser
      c.copMode = 'pursuit';
    }
  }
  c.copDeployCd = (c.copDeployCd || 0) - dt;
}

function spawnRoadblock(g, p) {
  // find a road point ~600-800 ahead of the player's velocity
  const v = p.car ? { x: p.car.vx, y: p.car.vy } : { x: Math.cos(p.ang) * 100, y: Math.sin(p.ang) * 100 };
  const vl = Math.hypot(v.x, v.y) || 1;
  const ax = p.x + (v.x / vl) * 700;
  const ay = p.y + (v.y / vl) * 700;
  // snap to the nearest road line
  let bestV = ROAD_V[0], bdV = Math.abs(ax - bestV);
  for (const vx of ROAD_V) { const d = Math.abs(ax - vx); if (d < bdV) { bdV = d; bestV = vx; } }
  let bestH = ROAD_H[0], bdH = Math.abs(ay - bestH);
  for (const hy of ROAD_H) { const d = Math.abs(ay - hy); if (d < bdH) { bdH = d; bestH = hy; } }
  let bx, by, cross;
  if (bdV < bdH) { bx = bestV; by = clamp(ay, 480, 3340); cross = 'v'; }
  else { bx = clamp(ax, 460, 4340); by = bestH; cross = 'h'; }
  if (Math.hypot(bx - p.x, by - p.y) < 320) return; // too close, don't spawn on top of the player
  const n = 2 + (g.wanted >= 4 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * 44;
    const x = cross === 'v' ? bx + off : bx;
    const y = cross === 'v' ? by : by + off;
    makeCar(g, x, y, cross === 'v' ? Math.PI / 2 : 0, 'police', {
      kind: 'police', driver: 'npc', siren: true, copMode: 'block', spawnT: 0,
    });
    const cop = makePed(g, x + 30, y + 30, 'cop');
    cop.shotgun = g.wanted >= CFG.COP_SHOTGUN_STARS;
  }
  g.toasts.push({ text: 'Roadblock ahead!', t: 2, col: '#ff6a6a' });
}

// ------------------------------------------------------------------ foot cops

function copFootAI(g, cop, p, dt) {
  const d = dist(cop.x, cop.y, p.x, p.y);
  const want = Math.atan2(p.y - cop.y, p.x - cop.x);

  if (d > 240) {
    // chase
    const sp = 205;
    moveCop(g, cop, Math.cos(want) * sp * dt, Math.sin(want) * sp * dt);
    cop.ang = want;
    cop.shootCd -= dt;
  } else if (d < 60) {
    // back off a bit and shoot
    moveCop(g, cop, -Math.cos(want) * 80 * dt, -Math.sin(want) * 80 * dt);
    cop.ang = want;
    copShoot(g, cop, p, dt);
  } else {
    // hold and shoot
    cop.ang += angDiff(cop.ang, want) * clamp(dt * 8, 0, 1);
    copShoot(g, cop, p, dt);
  }

  // keep cops out of walls/water
  if (isWater(cop.x, cop.y)) {
    cop.fleeAng = Math.PI;
    moveCop(g, cop, -120 * dt, 0);
  }
}

function copShoot(g, cop, p, dt) {
  cop.shootCd -= dt;
  if (cop.shootCd > 0) return;
  cop.shootCd = CFG.COP_SHOOT_CD * (cop.shotgun ? 1.5 : 1);
  const pellets = cop.shotgun ? 3 : 1;
  const spread = cop.shotgun ? 0.16 : 0.07;
  for (let i = 0; i < pellets; i++) {
    const a = Math.atan2(p.y - cop.y, p.x - cop.x) + g.rng.range(-spread, spread);
    g.bullets.push({
      x: cop.x + Math.cos(a) * 14,
      y: cop.y + Math.sin(a) * 14,
      vx: Math.cos(a) * CFG.BULLET_SPEED * 0.8,
      vy: Math.sin(a) * CFG.BULLET_SPEED * 0.8,
      ttl: CFG.BULLET_TTL,
      src: 'cop',
      dmg: cop.shotgun ? 11 : CFG.COP_BULLET_DMG,
    });
  }
  g.parts.push(mkPart(cop.x + Math.cos(cop.ang) * 15, cop.y + Math.sin(cop.ang) * 15, 0, 0, 0.07, 'muzzle'));
  if (dist(cop.x, cop.y, g.player.x, g.player.y) < 900) g.audio.gunshot();
}

function moveCop(g, cop, dx, dy) {
  let nx = cop.x + dx, ny = cop.y + dy;
  const res = resolveCircleSolids(nx, ny, 7, g.world.solids);
  if (!isWater(res.x, res.y)) {
    cop.x = res.x;
    cop.y = res.y;
  } else {
    cop.x = clamp(res.x, 60, CFG.WORLD_W - 60);
    cop.y = clamp(res.y, 230, CFG.WORLD_H - 40);
  }
}
