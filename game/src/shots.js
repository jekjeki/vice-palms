// shots.js — deterministic staged scenes for the 4 required screenshots.
// URL: ?shot=start|play|end|chaos&seed=N (audio handled by ?mute=1 → audio.js)

import { CFG, ctx } from './config.js';
import { clamp, dist, mulberry32, TAU } from './util.js';
import { makeCar } from './cars.js';
import { Ped } from './peds.js';
import { nearestRoadPoint } from './world.js';

export function currentShot() {
  try {
    const p = new URLSearchParams(location.search);
    const s = p.get('shot');
    if (!s) return null;
    const seed = parseInt(p.get('seed') || '7', 10) || 7;
    return { shot: s, seed };
  } catch { return null; }
}

// Called by Game after wiring ctx. Returns true if a shot scenario was set.
export function setupShot(game, info) {
  if (!info) return false;
  const S = game.S;
  const rng = mulberry32(info.seed * 7919 + 11);
  const w = ctx.world;

  switch (info.shot) {
    case 'start':
      // stay on the title screen; the world simulates underneath as ambience
      S.mode = 'title';
      S.money = 1250;
      // gentle pre-baked traffic for the backdrop
      for (let i = 0; i < 8; i++) {
        const pt = nearestRoadPoint(w, 3200 + (rng() - 0.5) * 2400, 2400 + (rng() - 0.5) * 2400);
        const car = makeCar(['sedan', 'taxi', 'sports', 'van'][(rng() * 4) | 0], pt.x, pt.y, 0);
        car.angle = [0, Math.PI / 2, Math.PI, -Math.PI / 2][pt.dir];
        car.driver = 'traffic';
        car.ai = 'traffic';
        car.aiState = { dir: pt.dir, node: null, stuck: 0 };
        const d = [0, 1, 2, 3][pt.dir];
        const dd = [[1, 0], [0, 1], [-1, 0], [0, -1]][pt.dir];
        const ni = { i: clamp(Math.round((pt.x + dd[0] * 800) / CFG.roadEvery), 0, 8), j: clamp(Math.round((pt.y + dd[1] * 800) / CFG.roadEvery), 1, 7) };
        car.aiState.node = ni;
        ctx.cars.push(car);
      }
      for (let i = 0; i < 10; i++) {
        ctx.pedsList.push(new Ped(2200 + rng() * 2200, 3000 + rng() * 1800));
      }
      return true;

    case 'play': {
      S.mode = 'play';
      S.money = 2450;
      S.player.ammo = 24;
      ctx.weapons.give('pistol', 24);
      // player sports car cruising downtown
      const car = makeCar('sports', 2640, 2400 + CFG.laneOff, 0);
      car.color = '#d8308a';
      car.driver = 'player';
      ctx.cars.push(car);
      S.player.inCar = car;
      car.vx = 150; car.vy = 0;
      // nearby traffic + peds
      for (let i = 0; i < 9; i++) {
        const pt = nearestRoadPoint(w, car.x + (rng() - 0.5) * 1800, car.y + (rng() - 0.5) * 1200);
        const t2 = makeCar(['sedan', 'taxi', 'bus', 'van'][(rng() * 4) | 0], pt.x, pt.y, 0);
        t2.angle = [0, Math.PI / 2, Math.PI, -Math.PI / 2][pt.dir];
        t2.driver = 'traffic';
        t2.ai = 'traffic';
        const dd = [[1, 0], [0, 1], [-1, 0], [0, -1]][pt.dir];
        t2.aiState = { dir: pt.dir, node: { i: clamp(Math.round((pt.x + dd[0] * 800) / CFG.roadEvery), 0, 8), j: clamp(Math.round((pt.y + dd[1] * 800) / CFG.roadEvery), 1, 7) }, stuck: 0 };
        ctx.cars.push(t2);
      }
      for (let i = 0; i < 14; i++) {
        ctx.pedsList.push(new Ped(1900 + rng() * 2000, 1800 + rng() * 1400));
      }
      ctx.subtitle('Ocean Drive, midnight — the Palms at their best.', 6);
      return true;
    }

    case 'end': {
      S.mode = 'play';
      S.money = 4180;
      // completed-mission banner over a beach scene
      S.player.x = 4150; S.player.y = 5960;
      S.player.ammo = 30;
      ctx.weapons.give('pistol', 30);
      ctx.weapons.give('shotgun', 16);
      S.missions.banner = { title: 'MISSION PASSED!', sub: "Rico's Ride  —  $800", t: 60, dur: 60 };
      S.missions.rewardFx = 60;
      for (let i = 0; i < 10; i++) {
        ctx.pedsList.push(new Ped(3600 + rng() * 900, 5700 + rng() * 320));
      }
      // parked cars along the beach road
      for (let i = 0; i < 4; i++) {
        const car = makeCar(['sedan', 'pickup'][(rng() * 2) | 0], 3700 + i * 220, 5600 + CFG.laneOff, 0);
        ctx.cars.push(car);
      }
      // celebratory sparks
      for (let i = 0; i < 30; i++) {
        S.fx.push({ type: 'spark', x: 3800 + rng() * 500, y: 5700 + rng() * 200, vx: (rng() - 0.5) * 60, vy: -rng() * 90, life: 0.8 + rng(), life0: 1.6, size: 2 });
      }
      return true;
    }

    case 'chaos': {
      S.mode = 'play';
      S.money = 990;
      // burning getaway sedan, 4 stars, cruisers swarming
      const car = makeCar('sedan', 3200, 2400 + CFG.laneOff, 0);
      car.color = '#8a2f3b';
      car.driver = 'player';
      ctx.cars.push(car);
      S.player.inCar = car;
      car.impact(car.maxHp * 0.72);      // heavy smoke + close to fire
      S.player.ammo = 40;
      ctx.weapons.give('pistol', 40);
      ctx.weapons.give('smg', 90);
      ctx.police.forceLevel(4);
      // cruisers inbound
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        const c2 = makeCar('police', car.x + Math.cos(a) * 420, car.y + Math.sin(a) * 420, a + Math.PI);
        c2.driver = 'police';
        c2.ai = 'police';
        c2.aiState = { mode: 'pursuit' };
        c2.siren = true;
        ctx.cars.push(c2);
      }
      // an explosion going off nearby
      ctx.explodeAt(3420, 2560, 1.1);
      ctx.subtitle('HEAT 4 — lose them or kiss the pavement.', 5);
      return true;
    }
  }
  return false;
}
