// player.js — the protagonist: walk/sprint, carjack + enter/exit (F),
// pistol & fists with mouse aiming, health/armor, knockdowns.

import { CFG } from './config.js';
import { clamp, dist, resolveCircleSolids, circleRectResolve, angDiff, TAU } from './util.js';
import { isWater } from './world.js';
import { carSpeed, sparkBurst, mkPart, damageCar } from './cars.js';
import { makePed, hurtPed, panicNear } from './peds.js';

export function makePlayer(g, x, y) {
  const p = {
    x, y,
    ang: 0,
    car: null,
    hp: CFG.PLAYER_HP,
    armor: CFG.PLAYER_ARMOR,
    money: CFG.START_MONEY,
    ammo: CFG.START_AMMO,
    walkPhase: 0,
    sprintT: 0,
    shootCd: 0,
    exitCd: 0,
    enterCd: 0,
    dead: false,
    hurtT: 0,
    inCarT: 0,
    wantedByJack: 0,
  };
  g.player = p;
  return p;
}

export function updatePlayer(g, dt) {
  const p = g.player;
  if (!p || p.dead) return;
  const input = g.input;
  p.shootCd -= dt;
  p.exitCd -= dt;
  p.enterCd -= dt;
  p.hurtT = Math.max(0, p.hurtT - dt);

  // world-space mouse
  const cam = g.cam;
  const zoom = g.cam.zoom;
  p.mx = cam.x + (input.mouse.x - CFG.VIEW_W / 2) / zoom;
  p.my = cam.y + (input.mouse.y - CFG.VIEW_H / 2) / zoom;

  if (p.car) {
    updateDriving(g, p, dt);
  } else {
    updateOnFoot(g, p, dt);
  }
}

// ------------------------------------------------------------------ driving

function updateDriving(g, p, dt) {
  const c = p.car;
  if (c.dead || c.exploded) {
    // the car died under us
    p.car = null;
    c.driver = null;
    return;
  }
  const ctl = g.input.carControls();
  c.throttle = ctl.throttle;
  c.brake = ctl.brake;
  c.steer = clamp(ctl.steer, -1, 1);
  c.handbrake = ctl.handbrake;
  c.parked = false;
  p.x = c.x;
  p.y = c.y;
  p.ang = c.ang;
  p.inCarT += dt;

  // engine audio
  const sp = carSpeed(c);
  const rpm = clamp(Math.abs((c.vx * Math.cos(c.ang) + c.vy * Math.sin(c.ang)) / c.type.max), 0.08, 1);
  g.audio.engineOn(true, rpm * (0.4 + 0.6 * (ctl.throttle ? 1 : 0.5)));
  if (ctl.horn && !c.hornLatch) {
    g.audio.horn();
    c.hornLatch = true;
  }
  if (!ctl.horn) c.hornLatch = false;
  if (ctl.horn) panicNear(g, c.x, c.y, 140);

  // skid marks on handbrake
  if (ctl.handbrake && sp > 120) {
    if (Math.random() < dt * 30) {
      g.decals.push({ x: c.x - Math.cos(c.ang) * c.l * 0.3, y: c.y - Math.sin(c.ang) * c.l * 0.3, r: 3, col: 'rgba(10,10,12,0.55)', life: 10 });
    }
  }

  // exit
  if (g.input.took('f') && p.exitCd <= 0 && sp < 140) {
    exitCar(g, p, c);
  }
}

export function exitCar(g, p, c) {
  c.driver = null;
  c.throttle = 0;
  c.brake = 0;
  c.steer = 0;
  c.handbrake = false;
  if (c.kind === 'mission' && c.exitKeep !== true) {
    // mission cars stay where dropped
  }
  const sideAng = c.ang - Math.PI / 2;
  let ex = c.x + Math.cos(sideAng) * (c.w * 0.5 + 16);
  let ey = c.y + Math.sin(sideAng) * (c.w * 0.5 + 16);
  const res = resolveCircleSolids(ex, ey, CFG.PLAYER_R, g.world.solids);
  p.x = res.x;
  p.y = res.y;
  if (isWater(res.x, res.y)) {
    p.x = c.x;
    p.y = c.y;
  }
  p.car = null;
  p.exitCd = 0.35;
  p.inCarT = 0;
  g.audio.engineOn(false, 0);
}

// ------------------------------------------------------------------ on foot

function updateOnFoot(g, p, dt) {
  const ax = g.input.axis();
  const sprint = g.input.held('Shift') ? CFG.SPRINT_SPEED : CFG.WALK_SPEED;
  let dx = 0, dy = 0;
  const len = Math.hypot(ax.x, ax.y);
  if (len > 0) {
    dx = (ax.x / len) * sprint * dt;
    dy = (ax.y / len) * sprint * dt;
    p.walkPhase += dt * (sprint > CFG.WALK_SPEED ? 11 : 7);
  }
  if (dx || dy) {
    // solids
    let nx = p.x + dx, ny = p.y + dy;
    const res = resolveCircleSolids(nx, ny, CFG.PLAYER_R, g.world.solids);
    nx = res.x;
    ny = res.y;
    if (!isWater(nx, ny)) {
      p.x = clamp(nx, 20, CFG.WORLD_W - 20);
      p.y = clamp(ny, 20, CFG.WORLD_H - 20);
    } else {
      // slide along shore
      if (!isWater(p.x + dx, p.y)) p.x = clamp(nx, 20, CFG.WORLD_W - 20);
      if (!isWater(p.x, p.y + dy)) p.y = clamp(ny, 20, CFG.WORLD_H - 20);
    }
    // cars block (and moving cars hurt)
    for (const c of g.cars) {
      if (c.dead) continue;
      const box = { x: c.x - c.l * 0.45, y: c.y - c.l * 0.45, w: c.l * 0.9, h: c.l * 0.9 };
      const r = circleRectResolve(p.x, p.y, CFG.PLAYER_R, box);
      if (r) {
        p.x = r.x;
        p.y = r.y;
        const sp = carSpeed(c);
        if (sp > 90) {
          hurtPlayer(g, sp * 0.14, 'car');
          p.x += c.vx * 0.05;
          p.y += c.vy * 0.05;
        }
      }
    }
  }

  // aim at cursor
  const wantAng = Math.atan2(p.my - p.y, p.mx - p.x);
  p.ang += angDiff(p.ang, wantAng) * clamp(dt * 14, 0, 1);

  // enter / jack
  if (g.input.took('f') && p.enterCd <= 0) {
    const c = nearestCar(g, p, CFG.ENTER_RANGE);
    if (c && !c.dead) {
      if (c.driver === 'npc') jackCar(g, p, c);
      else if (c.driver === null) {
        c.driver = 'player';
        c.parked = false;
        p.car = c;
        p.enterCd = 0.35;
        g.audio.pickup();
      }
    }
  }

  // shoot / punch (LMB or Ctrl)
  if ((g.input.mouse.down || g.input.held('Control')) && p.shootCd <= 0) {
    attack(g, p);
  }
}

function nearestCar(g, p, range) {
  let best = null, bd = range;
  for (const c of g.cars) {
    if (c.dead) continue;
    const d = dist(p.x, p.y, c.x, c.y) - c.l * 0.25;
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

function jackCar(g, p, c) {
  // the driver bails and legs it
  const sideAng = c.ang - Math.PI / 2;
  const ped = makePed(g, c.x + Math.cos(sideAng) * 24, c.y + Math.sin(sideAng) * 24);
  ped.fleeT = 5;
  ped.fleeAng = sideAng;
  ped.panicT = 6;
  panicNear(g, c.x, c.y, 200);
  c.driver = 'player';
  c.parked = false;
  p.car = c;
  p.enterCd = 0.4;
  g.audio.punch();
  if (c.kind === 'police') {
    g.hooks.addWanted(2, 'grand theft: cruiser');
  } else if (g.rng.chance(0.35)) {
    g.hooks.addWanted(1, 'grand theft auto');
  }
}

// ------------------------------------------------------------------ combat

function attack(g, p) {
  if (p.ammo > 0) {
    p.ammo--;
    p.shootCd = CFG.PISTOL_CD;
    const a = p.ang + g.rng.range(-0.03, 0.03);
    g.bullets.push({
      x: p.x + Math.cos(a) * 16,
      y: p.y + Math.sin(a) * 16,
      vx: Math.cos(a) * CFG.BULLET_SPEED,
      vy: Math.sin(a) * CFG.BULLET_SPEED,
      ttl: CFG.BULLET_TTL,
      src: 'player',
      dmg: CFG.PISTOL_DMG,
    });
    g.parts.push(mkPart(p.x + Math.cos(a) * 18, p.y + Math.sin(a) * 18, Math.cos(a) * 60, Math.sin(a) * 60, 0.08, 'muzzle'));
    g.audio.gunshot();
    panicNear(g, p.x, p.y, 480);
    // shots fired in public: heat creeps toward a star
    g.hooks.raiseHeat(0.18);
  } else {
    // fists
    p.shootCd = CFG.FIST_CD;
    let hit = false;
    for (const ped of g.peds) {
      if (ped.dead) continue;
      const d = dist(p.x, p.y, ped.x, ped.y);
      if (d < CFG.FIST_RANGE) {
        const to = Math.atan2(ped.y - p.y, ped.x - p.x);
        if (Math.abs(angDiff(p.ang, to)) < 1.2) {
          hurtPed(g, ped, CFG.FIST_DMG, 'fist');
          g.audio.punch();
          ped.x += Math.cos(to) * 6;
          ped.y += Math.sin(to) * 6;
          hit = true;
          break;
        }
      }
    }
    for (const c of g.cars) {
      if (c.dead) continue;
      if (dist(p.x, p.y, c.x, c.y) < CFG.FIST_RANGE + c.w * 0.5) {
        damageCar(g, c, 3, 'fist');
        g.audio.punch();
        hit = true;
        break;
      }
    }
    if (!hit) g.audio.punch();
  }
}

// ------------------------------------------------------------------ damage

export function hurtPlayer(g, dmg, cause) {
  const p = g.player;
  if (!p || p.dead) return;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, dmg * 0.65);
    p.armor -= absorbed;
    dmg -= absorbed;
  }
  p.hp -= dmg;
  p.hurtT = 0.35;
  g.audio && g.audio.punch();
  if (p.hp <= 0) {
    p.hp = 0;
    p.dead = true;
    if (g.hooks.playerDied) g.hooks.playerDied(cause);
  }
}

export function giveMoney(g, amount) {
  g.player.money = Math.max(0, g.player.money + amount);
}

export function giveAmmo(g, n) {
  g.player.ammo = Math.min(CFG.AMMO_MAX, g.player.ammo + n);
}
