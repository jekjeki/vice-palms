// game.js — the state machine and simulation hub. Owns `g`, the hooks,
// the update order, camera, bullets, explosions, particles and respawns.

import { CFG } from './config.js';
import { RNG, hashSeed } from './rng.js';
import { clamp, dist, lerp, angLerp } from './util.js';
import { buildWorld, buildSpawns } from './world.js';
import { makeCar, updateCarPhysics, collideFleet, updateCarDamage, explodeCar } from './cars.js';
import { spawnTraffic, updateTraffic } from './traffic.js';
import { makePed, spawnPeds, updatePeds, hurtPed, panicNear } from './peds.js';
import { makePlayer, updatePlayer, hurtPlayer, exitCar } from './player.js';
import { initPolice, updatePolice, addWanted, raiseHeat } from './police.js';
import { initMissions, updateMissions, currentMarkers, onPlayerDied, onBusted } from './missions.js';
import { updateTitle, updatePause, updateControls } from './screens.js';
import { saveGame, loadGame } from './save.js';

export function createGame(audio, input, seedStr) {
  const seed = hashSeed(seedStr || 'vice-palms');
  const g = {
    time: 0,
    state: 'title',
    prevState: 'title',
    rng: new RNG(seed),
    seed,
    cam: { x: CFG.WORLD_W / 2, y: CFG.WORLD_H / 2, zoom: 1, shake: 0, flash: 0 },
    world: null,
    player: null,
    cars: [],
    peds: [],
    bullets: [],
    parts: [],
    decals: [],
    explosions: [],
    subs: [],
    toasts: [],
    markers: [],
    panicT: 0,
    panicOrigin: null,
    trafficSpawnT: 0,
    menuIdx: 0,
    pauseIdx: 0,
    deathT: 0,
    deathCause: '',
    passedOverlay: null,
    finalePending: false,
    finaleShown: false,
    audio,
    input,
    hooks: {},
  };

  g.hooks = {
    addWanted: (n, reason) => addWanted(g, n, reason),
    raiseHeat: (a) => raiseHeat(g, a),
    hurtPlayer: (dmg, cause) => hurtPlayer(g, dmg, cause),
    hurtPed: (ped, dmg, cause) => hurtPed(g, ped, dmg, cause),
    pedKilled: (ped, cause) => pedKilled(g, ped, cause),
    playerDied: (cause) => playerDied(g, cause),
    busted: () => busted(g),
    giveMoney: (n) => { g.player.money = Math.max(0, g.player.money + n); },
    newGame: () => newGame(g, false),
    continueGame: () => newGame(g, true),
    toTitle: () => toTitle(g),
  };
  return g;
}

// ------------------------------------------------------------------ lifecycle

export function newGame(g, load) {
  g.cars.length = 0;
  g.peds.length = 0;
  g.bullets.length = 0;
  g.parts.length = 0;
  g.decals.length = 0;
  g.explosions.length = 0;
  g.subs.length = 0;
  g.toasts.length = 0;
  g.time = 0;
  g.panicT = 0;
  g.panicOrigin = null;
  g.passedOverlay = null;
  g.finalePending = false;
  g.finaleShown = false;
  g.cam.shake = 0;
  g.cam.flash = 0;

  g.world = buildWorld(g.seed);
  const sp = buildSpawns(g.world);
  makePlayer(g, sp.playerStart.x, sp.playerStart.y);
  initPolice(g);
  initMissions(g);

  // parked cars from the world layout
  for (const ps of g.world.parkedSpawns) {
    makeCar(g, ps.x, ps.y, ps.ang, ps.type, { kind: 'parked', driver: null, color: ps.color });
  }
  spawnTraffic(g);
  spawnPeds(g);

  const p = g.player;
  g.cam.x = p.x;
  g.cam.y = p.y;
  g.cam.zoom = CFG.CAM_ZOOM_FOOT;

  if (load) {
    loadGame(g);
    g.toasts.push({ text: 'Save loaded.', t: 2.2, col: '#8fdc8f' });
  } else {
    g.subs.push({ text: 'VICE PALMS — somewhere off Ocean Drive, 2 a.m.', t: 4, dur: 4 });
    g.subs.push({ text: 'RICO (phone): Kid! The diner. We have catching up to do.', t: 4.4, dur: 4.4 });
  }
  g.state = 'play';
  g.audio.musicOn(true);
}

export function toTitle(g) {
  g.state = 'title';
  g.audio.engineOn(false, 0);
  g.audio.sirenOn(false);
  g.audio.musicOn(false);
}

function playerDied(g, cause) {
  if (g.state !== 'play') return;
  g.state = 'wasted';
  g.deathT = 2.8;
  g.deathCause = cause || '';
  g.audio.wasted();
  g.audio.engineOn(false, 0);
  onPlayerDied(g);
}

function busted(g) {
  if (g.state !== 'play') return;
  g.state = 'busted';
  g.deathT = 2.6;
  g.audio.fail();
  g.audio.engineOn(false, 0);
  g.audio.sirenOn(false);
  onBusted(g);
}

function respawn(g, kind) {
  const p = g.player;
  const fee = kind === 'wasted' ? CFG.RESPAWN_HOSPITAL_FEE : CFG.RESPAWN_BUSTED_FEE;
  p.money = Math.max(0, p.money - fee);
  p.hp = CFG.PLAYER_HP;
  p.dead = false;
  p.car = null;
  p.hurtT = 0;
  const sp = kind === 'wasted' ? g.world.landmarks.hospital : g.world.landmarks.police;
  p.x = sp.x + 60;
  p.y = sp.y + 120;
  // clear the heat
  g.wanted = 0;
  g.wantedHeat = 0;
  for (let i = g.cars.length - 1; i >= 0; i--) {
    if (g.cars[i].kind === 'police') g.cars.splice(i, 1);
  }
  for (let i = g.peds.length - 1; i >= 0; i--) {
    if (g.peds[i].kind === 'cop') g.peds.splice(i, 1);
  }
  g.audio.sirenOn(false);
  g.toasts.push({ text: kind === 'wasted' ? 'Patched up at Palm General.' : 'Released from VP Metro.', t: 2.6, col: '#8fdc8f' });
  g.state = 'play';
}

function pedKilled(g, ped, cause) {
  const S = g.missions.stats;
  S.kills++;
  if (ped.kind === 'cop') {
    addWanted(g, g.wanted < 2 ? 2 - g.wanted : 1, 'officer down');
  } else if (cause === 'shot' || cause === 'fist' || cause === 'blast') {
    addWanted(g, 1, cause === 'blast' ? 'destruction' : 'murder');
  } else if (cause === 'car') {
    // only the player's own driving raises heat
    const mine = g.cars.some((c) => c.driver === 'player' && Math.hypot(c.x - ped.x, c.y - ped.y) < 320);
    if (mine) raiseHeat(g, 0.7);
  }
}

// ------------------------------------------------------------------ update

export function update(g, dt) {
  g.time += dt;

  // mute toggle everywhere
  if (g.input.took('m')) {
    const m = g.audio.toggle();
    g.toasts.push({ text: m ? 'Audio muted.' : 'Audio on.', t: 1.4, col: '#9aa4c8' });
  }

  switch (g.state) {
    case 'title':
      updateTitle(g);
      break;
    case 'controls':
      updateControls(g);
      break;
    case 'pause':
      updatePause(g);
      break;
    case 'wasted':
    case 'busted':
      g.deathT -= dt;
      if (g.deathT <= 0) respawn(g, g.state);
      break;
    case 'play':
      simulate(g, dt);
      break;
    case 'end':
      // finale screen handles its own input
      break;
  }

  // timers that run in every state
  tickText(g, dt);
  if (g.passedOverlay) {
    g.passedOverlay.t -= dt;
    if (g.passedOverlay.t <= 0) {
      g.passedOverlay = null;
      if (g.finalePending && !g.finaleShown) {
        g.finalePending = false;
        g.finaleShown = true;
        g.state = 'end';
        g.audio.musicOn(false);
      }
    }
  }
  g.input.endFrame();
}

function tickText(g, dt) {
  for (let i = g.subs.length - 1; i >= 0; i--) {
    g.subs[i].t -= dt;
    if (g.subs[i].t <= 0) g.subs.splice(i, 1);
  }
  for (let i = g.toasts.length - 1; i >= 0; i--) {
    g.toasts[i].t -= dt;
    if (g.toasts[i].t <= 0) g.toasts.splice(i, 1);
  }
  for (let i = g.decals.length - 1; i >= 0; i--) {
    g.decals[i].life -= dt;
    if (g.decals[i].life <= 0) g.decals.splice(i, 1);
  }
}

function simulate(g, dt) {
  const p = g.player;
  if (!p) return;

  // panic memory
  g.panicT -= dt;
  if (g.panicT <= 0) g.panicOrigin = null;

  updatePlayer(g, dt);
  if (!p.car) g.audio.engineOn(false, 0);

  updateTraffic(g, dt);
  updatePeds(g, dt);
  updatePolice(g, dt);
  updateMissions(g, dt);

  // fleet physics
  for (const c of g.cars) {
    updateCarPhysics(g, c, dt);
  }
  collideFleet(g);

  // damage smoke/fire/cull
  for (let i = g.cars.length - 1; i >= 0; i--) {
    const c = g.cars[i];
    if (updateCarDamage(g, c, dt)) g.cars.splice(i, 1);
    else if (c.kind === 'traffic' && c.dead && c.decal > 26) g.cars.splice(i, 1);
  }

  updateBullets(g, dt);
  updateExplosions(g, dt);
  updateParts(g, dt);
  updateCamera(g, dt);

  // markers for hud/minimap
  g.markers = currentMarkers(g);

  // finale hand-off
  const M = g.missions;
  if (M && M.storyIdx >= M.defs.story.length && !g.finalePending && !g.finaleShown) {
    g.finalePending = true;
  }

  // pause
  if (g.input.took('Escape')) {
    g.state = 'pause';
    g.pauseIdx = 0;
    g.audio.engineOn(false, 0);
  }
}

// ------------------------------------------------------------------ subsystems

function updateBullets(g, dt) {
  const p = g.player;
  for (let i = g.bullets.length - 1; i >= 0; i--) {
    const b = g.bullets[i];
    b.ttl -= dt;
    if (b.ttl <= 0) { g.bullets.splice(i, 1); continue; }
    const nx = b.x + b.vx * dt;
    const ny = b.y + b.vy * dt;
    let dead = false;

    // walls stop bullets
    for (const s of g.world.solids) {
      if (nx > s.x && nx < s.x + s.w && ny > s.y && ny < s.y + s.h) { dead = true; break; }
    }
    if (dead) {
      g.parts.push({ x: nx, y: ny, vx: 0, vy: 0, life: 0.2, maxLife: 0.2, kind: 'spark' });
      g.bullets.splice(i, 1);
      continue;
    }
    b.x = nx;
    b.y = ny;

    if (b.src === 'player') {
      // peds
      for (const ped of g.peds) {
        if (ped.dead) continue;
        if (dist(b.x, b.y, ped.x, ped.y) < 10) {
          hurtPed(g, ped, b.dmg, 'shot');
          g.parts.push({ x: ped.x, y: ped.y, vx: 0, vy: 0, life: 0.25, maxLife: 0.25, kind: 'blood' });
          dead = true;
          break;
        }
      }
      // cars
      if (!dead) {
        for (const c of g.cars) {
          if (c.dead) continue;
          if (c.driver === 'player') continue;
          const rr = Math.max(c.w, c.l) * 0.42;
          if (dist(b.x, b.y, c.x, c.y) < rr) {
            import0(g, c, b.dmg);
            g.parts.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.2, maxLife: 0.2, kind: 'spark' });
            dead = true;
            break;
          }
        }
      }
    } else {
      // cop bullets hit the player (on foot or in a car)
      if (p && !p.dead) {
        if (p.car) {
          const c = p.car;
          const rr = Math.max(c.w, c.l) * 0.42;
          if (dist(b.x, b.y, c.x, c.y) < rr) {
            // armor plates: the car soaks it, the driver feels a pinch
            import0(g, c, b.dmg * 0.7);
            hurtPlayer(g, b.dmg * 0.3, 'shot');
            dead = true;
          }
        } else if (dist(b.x, b.y, p.x, p.y) < 11) {
          hurtPlayer(g, b.dmg, 'shot');
          g.parts.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.25, maxLife: 0.25, kind: 'blood' });
          dead = true;
        }
      }
    }
    if (dead) g.bullets.splice(i, 1);
  }
}

// local import shim so this module does not need a cycle back into cars
function import0(g, car, dmg) {
  // bullets damage cars through the shared damage path
  car.hp -= dmg;
  if (car.hp <= CFG.FIRE_HP && car.burning === 0 && !car.exploded) car.burning = CFG.CAR_BURN_TIME;
  if (car.hp <= 0 && !car.exploded) explodeCar(g, car);
}

function updateExplosions(g, dt) {
  for (let i = g.explosions.length - 1; i >= 0; i--) {
    const e = g.explosions[i];
    if (e.t < dt * 1.5) {
      g.cam.flash = Math.max(g.cam.flash, 0.7 * (e.power || 1));
    }
    e.t += dt;
    if (e.t > 1.3) g.explosions.splice(i, 1);
  }
}

function updateParts(g, dt) {
  for (let i = g.parts.length - 1; i >= 0; i--) {
    const pt = g.parts[i];
    pt.life -= dt;
    if (pt.life <= 0) { g.parts.splice(i, 1); continue; }
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    if (pt.kind === 'spark') { pt.vx *= 0.92; pt.vy *= 0.92; }
    if (pt.kind === 'smoke' || pt.kind === 'fire') { pt.vx *= 0.96; pt.vy *= 0.96; }
  }
}

function updateCamera(g, dt) {
  const p = g.player;
  let tx = p.x, ty = p.y;
  let zoomT = CFG.CAM_ZOOM_FOOT;
  if (p.car) {
    tx += p.car.vx * CFG.CAM_LOOK;
    ty += p.car.vy * CFG.CAM_LOOK;
    zoomT = CFG.CAM_ZOOM_CAR;
  } else {
    tx += Math.cos(p.ang) * 60;
    ty += Math.sin(p.ang) * 60;
  }
  const k = clamp(dt * 4.2, 0, 1);
  g.cam.x = lerp(g.cam.x, tx, k);
  g.cam.y = lerp(g.cam.y, ty, k);
  g.cam.zoom = lerp(g.cam.zoom, zoomT, clamp(dt * 2.5, 0, 1));
  const hw = CFG.VIEW_W / (2 * g.cam.zoom);
  const hh = CFG.VIEW_H / (2 * g.cam.zoom);
  g.cam.x = clamp(g.cam.x, hw - 120, CFG.WORLD_W - hw + 120);
  g.cam.y = clamp(g.cam.y, hh - 120, CFG.WORLD_H - hh + 120);
  g.cam.shake = Math.max(0, g.cam.shake - CFG.SHAKE_DECAY * g.cam.shake * dt - 2 * dt);
  g.cam.flash = Math.max(0, g.cam.flash - dt * 1.8);
}
