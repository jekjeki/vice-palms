// VICE PALMS — deterministic staged scenes for the four cover screenshots,
// selected with ?shot=start|play|end|chaos&seed=N.

import { G, bigMsg } from './state.js';
import { injectHold } from './input.js';
import { reseedRun, runRNG } from './rng.js';
import { makeCar, damageCar, explodeCar } from './cars.js';
import { makePed, spawnPedRandom, spawnGang } from './peds.js';
import { makeCruiser, makeFootCop } from './police.js';
import { startMission } from './missions.js';
import { STORY } from './missions.js';

export function stageShot(name, seed) {
  reseedRun(seed);
  G.shotMode = name;
  const poi = G.world.poi;

  if (name === 'start') {
    // title over a live night boulevard: player on Ocean Drive among palms
    const p = G.player;
    p.x = 1560; p.y = 3000;
    p.car = null;
    G.cam.x = p.x; G.cam.y = p.y;
    G.screen = 'title';
    for (let i = 0; i < 10; i++) {
      const pd = spawnPedRandom(runRNG, { x: p.x, y: p.y }, 100, 500);
      if (pd) G.peds.push(pd);
    }
    G.cars.push(makeCar('banshee', 1700, 3040, 0, { driver: 'ai', color: '#e02d2d' }));
    G.cars[G.cars.length - 1].ai = { kind: 'traffic', speed: 100, waitT: 0 };
    G.cars.push(makeCar('cursor', 1450, 3064, Math.PI, { driver: 'ai' }));
    G.cars[G.cars.length - 1].ai = { kind: 'traffic', speed: 90, waitT: 0 };
    bigMsg('VICE PALMS', '', '#3ae7ff', 3);
    return;
  }

  if (name === 'play') {
    // mid-mission: driving the beach with the marker up
    G.screen = 'play';
    const p = G.player;
    const car = makeCar('banshee', 1560, 3016, 0, { driver: 'player', color: '#e02d2d' });
    G.cars.push(car);
    p.car = car;
    p.x = car.x; p.y = car.y;
    car.vx = 150; car.vy = 0;
    G.shotCruise = car;
    injectHold('up', true);
    G.mission = {
      def: STORY[0],
      step: 0,
      data: {},
      timer: 0,
      hint: 'Get wheels and drive to the North Docks gate',
      targets: [], pickups: [], checkpoints: [],
      timerActive: false,
    };
    G.missionIdx = 0;
    p.money = 1420;
    p.ammo = 34;
    p.weapon = 'pistol';
    for (let i = 0; i < 12; i++) {
      const pd = spawnPedRandom(runRNG, { x: p.x, y: p.y }, 80, 420);
      if (pd) G.peds.push(pd);
    }
    G.cars.push(makeCar('cursor', 2450, 3064, Math.PI, { driver: 'ai' }));
    G.cars[G.cars.length - 1].ai = { kind: 'traffic', speed: 95, waitT: 0 };
    return;
  }

  if (name === 'end') {
    // epilogue on the sand: MISSION PASSED over a quiet beach
    G.screen = 'end';
    const p = G.player;
    p.x = poi.rico.x - 120; p.y = 3010;
    p.car = null;
    G.cam.x = p.x + 90; G.cam.y = p.y;
    p.money = 9840;
    G.missionIdx = STORY.length;
    G.done = true;
    G.stats.missionsDone = 6;
    G.stats.earned = 12400;
    G.stats.carjacks = 7;
    G.stats.kills = 12;
    for (let i = 0; i < 8; i++) {
      const pd = spawnPedRandom(runRNG, { x: p.x, y: p.y }, 100, 400, { state: 'sunbathe' });
      if (pd) G.peds.push(pd);
    }
    return;
  }

  if (name === 'chaos') {
    // five stars: burning car, cruiser pile-in, flash — player makes a run in a car
    G.screen = 'play';
    const p = G.player;
    const run = makeCar('banshee', 2340, 2080, 2.6, { driver: 'player', color: '#e02d2d' });
    G.cars.push(run);
    p.car = run;
    p.x = run.x; p.y = run.y;
    run.vx = -90; run.vy = 30;
    p.stars = 5;
    p.weapon = 'pistol';
    p.ammo = 60;
    G.cam.x = p.x; G.cam.y = p.y;
    G.losTimer = 0;

    const burn = makeCar('stallion', 2240, 2040, 0.4, { driver: 'none' });
    burn.hp = 8;
    G.cars.push(burn);
    const burn2 = makeCar('vigor', 2180, 2160, 2.2, { driver: 'none' });
    burn2.hp = 14;
    G.cars.push(burn2);
    const cop1 = makeCruiser(2480, 2060, Math.PI);
    const cop2 = makeCruiser(2200, 2200, -Math.PI / 3);
    const cop3 = makeCruiser(2350, 1930, Math.PI / 2);
    cop1.vx = -120; cop2.vx = 90; cop3.vy = 80;
    G.cars.push(cop1, cop2, cop3);
    G.cops.push(makeFootCop(2280, 2160));
    G.cops.push(makeFootCop(2400, 2110));
    spawnGang(2240, 2160, 'chaos');
    spawnGang(2420, 2030, 'chaos');
    for (let i = 0; i < 8; i++) {
      const pd = spawnPedRandom(runRNG, { x: p.x, y: p.y }, 80, 380);
      if (pd) G.peds.push(pd);
      if (pd) pd.state = 'flee', pd.fear = 6;
    }
    // staged explosion right around screenshot time
    G.shotBoom = { t: 1.1, x: 2240, y: 2040, car: burn };
    return;
  }
}

// called every frame from main.js while a shot is staged
export function updateShot(dt) {
  if (!G.shotMode) return;
  if (G.shotMode === 'play' && G.shotCruise && !G.shotCruise.dead) {
    injectHold('up', true);
  }
  if (G.shotMode === 'chaos' && G.shotBoom) {
    G.shotBoom.t -= dt;
    if (G.shotBoom.t <= 0) {
      const b = G.shotBoom;
      if (!b.car.dead) explodeCar(b.car);
      G.shotBoom = null;
      G.shotBoom2 = { t: 1.6, x: 2480, y: 2060 };
    }
  }
  if (G.shotMode === 'chaos' && G.shotBoom2) {
    G.shotBoom2.t -= dt;
    if (G.shotBoom2.t <= 0) {
      const c = G.cars.find(c => !c.dead && c !== G.player.car && Math.hypot(c.vx, c.vy) < 200);
      if (c) damageCar(c, 999, 'blast');
      G.shotBoom2 = null;
    }
  }
}
