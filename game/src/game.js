// VICE PALMS — game state machine and per-frame update coordination.

import { CFG } from './config.js';
import { G, toast, say, bigMsg, addMoney, addStars, saveGame, checkSave } from './state.js';
import { clamp, dist, dist2, lerp, updateParticles } from './util.js';
import { RNG, runRNG, reseedRun } from './rng.js';
import { consumeAll, wasPressed } from './input.js';
import { buildWorld, setWorld, isWater, onPiers, terrainAt } from './world.js';
import { prerenderWorld, draw } from './render.js';
import { drawHUD } from './hud.js';
import { updateScreens, drawScreens } from './screens.js';
import { updateAudio } from './audio.js';
import { makeCar, driveCar, collideCarPairs, spawnTrafficCar } from './cars.js';
import { manageTraffic, trafficBrain } from './traffic.js';
import { updatePeds, makePed, spawnPedRandom } from './peds.js';
import { updatePolice, respawn } from './police.js';
import { updatePlayer, updateBullets } from './player.js';
import { STORY, SIDES, startMission, startSide, updateMissions, failMission, failSideMission, markerStory, markerSide } from './missions.js';
import { play } from './audio.js';

export function initGame(seed) {
  reseedRun(seed);
  G.seed = seed;
  G.world = buildWorld(seed);
  setWorld(G.world);
  prerenderWorld(G.world);
  checkSave();
  G._respawn = respawn;

  // starting set piece: a few parked cars near the player start
  const p0 = G.world.poi.playerStart;
  for (const [dx, dy, type] of [[-90, 30, 'stallion'], [-130, 34, 'vigor'], [60, 26, 'banshee'], [-50, -34, 'bobcat']]) {
    G.cars.push(makeCar(type, p0.x + dx, p0.y + dy, Math.PI / 2, { driver: 'none' }));
  }
  // a parked taxi at the rank and a cop car at the station for flavor
  G.cars.push(makeCar('cursor', G.world.poi.taxiRank.x + 20, G.world.poi.taxiRank.y, 0, { driver: 'none' }));
  G.cars.push(makeCar('interceptor', G.world.poi.policeStation.x + 30, G.world.poi.policeStation.y, Math.PI, { driver: 'none' }));
  G.cars.push(makeCar('panzer', G.world.poi.garage.x - 40, G.world.poi.garage.y - 30, 0.3, { driver: 'none' }));

  // initial ambient peds
  for (let i = 0; i < 18; i++) {
    const pd = spawnPedRandom(runRNG, p0, 120, 800);
    if (pd) G.peds.push(pd);
  }

  G.cam.x = p0.x; G.cam.y = p0.y;
  G.screen = 'title';
  G.screenT = 0;
}

export function update(dt) {
  G.time += dt;
  G.dt = dt;
  G.frame++;
  G.lightT += dt;
  G.gunfireT = Math.max(0, G.gunfireT - dt);

  // ui timers
  for (let i = G.toasts.length - 1; i >= 0; i--) {
    G.toasts[i].t -= dt;
    if (G.toasts[i].t <= 0) G.toasts.splice(i, 1);
  }
  if (G.bigMsg) {
    G.bigMsg.t -= dt;
    if (G.bigMsg.t <= 0) G.bigMsg = null;
  }
  if (G.subNow) {
    G.subNow.t -= dt;
    if (G.subNow.t <= 0) G.subNow = null;
  }
  if (!G.subNow && G.subs.length) {
    G.subNow = G.subs.shift();
  }

  updateScreens(dt);

  if (G.screen === 'play' || G.screen === 'pause') {
    if (G.screen === 'play') {
      simulate(dt);
    }
    // mission entry markers (works while walking around in play)
  } else if (G.screen === 'wasted' || G.screen === 'busted') {
    // world freezes during the overlay
  }

  updateAudio(dt);
  consumeAll();
}

function simulate(dt) {
  updatePlayer(dt);
  updatePolice(dt);
  manageTraffic(dt);

  // car brains + physics
  for (const c of G.cars) {
    if (c.dead) { driveCar(c, dt); continue; }
    if (c.driver === 'player') continue;      // physics handled in updatePlayer
    if (c.ai && c.ai.kind === 'traffic' && !c.ai.paused) trafficBrain(c, dt);
    if (c.driver === 'none' && (!c.ai || !c.ai.kind)) { c.throttle = 0; c.steer = 0; }
    driveCar(c, dt);
  }
  collideCarPairs(dt);

  updatePeds(dt);
  updateBullets(dt);
  updateMissions(dt);
  updatePickups(dt);
  checkMissionEntry();
  updateParticles(dt);
  updateCamera(dt);
}

function updatePickups(dt) {
  const p = G.player;
  const px = p.car ? p.car.x : p.x, py = p.car ? p.car.y : p.y;
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const pk = G.pickups[i];
    if (dist2(px, py, pk.x, pk.y) < (CFG.PICKUP_R + 10) ** 2) {
      G.pickups.splice(i, 1);
      if (pk.tag === 'story' && G.mission && G.mission.data.got !== undefined) {
        G.mission.data.got++;
        play('cash');
        bigMsg('CASE ' + G.mission.data.got + '/' + G.mission.data.need, '', '#ffe36e', 1.2);
      }
    }
  }
}

function checkMissionEntry() {
  const p = G.player;
  const px = p.car ? p.car.x : p.x, py = p.car ? p.car.y : p.y;

  if (!G.mission && G.missionIdx < STORY.length) {
    const mk = markerStory();
    if (mk && dist2(px, py, mk.x, mk.y) < (CFG.MARKER_R + 6) ** 2) {
      startMission(STORY[G.missionIdx]);
      return;
    }
  }
  if (!G.mission && !G.sideMission && G.missionIdx >= 1) {
    const sm = markerSide();
    if (sm && sm.side && dist2(px, py, sm.x, sm.y) < (CFG.MARKER_R + 6) ** 2) {
      startSide(sm.side);
      return;
    }
  }
  // story complete: chill
  if (!G.mission && G.done && !G.epilogueToastDone) {
    G.epilogueToastDone = true;
    toast('Free roam — the strip is yours');
  }
}

function updateCamera(dt) {
  const p = G.player;
  let tx, ty, look = 0;
  if (p.car) {
    tx = p.car.x + p.car.vx * 0.32;
    ty = p.car.y + p.car.vy * 0.32;
    look = 1;
  } else {
    tx = p.x + p.vx * 0.25;
    ty = p.y + p.vy * 0.25;
  }
  const k = p.car ? 5.5 : 7.5;
  G.cam.x = lerp(G.cam.x, tx, Math.min(1, dt * k));
  G.cam.y = lerp(G.cam.y, ty, Math.min(1, dt * k));
  // clamp inside world
  G.cam.x = clamp(G.cam.x, CFG.VIEW_W / 2, CFG.WORLD_W - CFG.VIEW_W / 2);
  G.cam.y = clamp(G.cam.y, CFG.VIEW_H / 2, CFG.WORLD_H - CFG.VIEW_H / 2);
}

// ---------------------------------------------------------------------------
// draw

export function renderGame() {
  draw(G.dt);
  if (G.screen !== 'title') drawHUD(G.ctx);
  drawScreens(G.ctx);
  if (G.bigMsg) {
    const ctx = G.ctx;
    const b = G.bigMsg;
    const a = clamp(b.t / 0.5, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.font = 'bold 54px monospace';
    ctx.shadowColor = b.col;
    ctx.shadowBlur = 24;
    ctx.fillStyle = b.col;
    ctx.fillText(b.text, G.W / 2, G.H * 0.34);
    if (b.sub) {
      ctx.font = '20px monospace';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#dfe6ee';
      ctx.fillText(b.sub, G.W / 2, G.H * 0.34 + 36);
    }
    ctx.restore();
  }
}
