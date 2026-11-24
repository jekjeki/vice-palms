// shots.js — deterministic staged scenes for the four cover screenshots:
// ?shot=start | play | end | chaos &seed=N (audio muted via &mute=1).

import { CFG, roadX, roadY } from './config.js';
import { G, clamp } from './util.js';
import { Car, dirAng } from './cars.js';
import { Cop } from './police.js';
import { Ped } from './peds.js';
import { missionText } from './util.js';

export function setupShot(name, seed, game) {
  G.shot = name;
  const s = seed || 7;
  if (name === 'start') return shotStart(s, game);
  if (name === 'play') return shotPlay(s, game);
  if (name === 'end') return shotEnd(s, game);
  if (name === 'chaos') return shotChaos(s, game);
  return false;
}

// 1-start: title cover — camera parked on the neon beachfront
function shotStart(seed, game) {
  game.newGame(seed, { silent: true });
  G.state = 'title';
  const cam = G.cam;
  cam.x = roadX(9) + 43;
  cam.y = CFG.BEACH_Y - 30;
  cam.z = 1.0;
  // marquee cars along the beachfront
  const colors = ['#ff2f7d', '#00d9ff', '#ffb200'];
  for (let k = 0; k < 3; k++) {
    const car = new Car(k === 2 ? 'banshee' : 'stallion', roadX(8) + 60 + k * 90, roadY(12) - 30, dirAng(0), { color: colors[k] });
    G.cars.push(car);
  }
  return true;
}

// 2-play: mid-game — player speeding through downtown with one star
function shotPlay(seed, game) {
  game.newGame(seed, { silent: true });
  const car = new Car('stallion', roadX(9) + CFG.RW / 4, roadY(7) - 200, dirAng(1), { color: '#ff2f7d' });
  G.cars.push(car);
  car.driver = 'player';
  car.vx = 0; car.vy = 160;
  G.player.car = car;
  G.player.onFoot = false;
  G.police.setStars(1);
  G.police.spawnCruiser();
  G.cam.x = car.x;
  G.cam.y = car.y;
  G.cam.z = CFG.ZOOM_CAR;
  G.hud.sub = 'RICO: Take the coastal loop, cousin. The VCPD is already fond of you.';
  G.hud.subT = 6;
  G.t = 8;
  return true;
}

// 3-end: story complete — mission-passed banner over the safehouse block
function shotEnd(seed, game) {
  game.newGame(seed, { silent: true });
  G.missions.storyIdx = 6;
  G.money += 3000;
  G.hud.passed = 3.4;
  G.hud.passedName = 'THE LAST RIDE  ·  $3,000';
  G.state = 'playing';
  const cam = G.cam;
  const safe = G.world.spawns.safe;
  cam.x = safe.x;
  cam.y = safe.y;
  cam.z = 0.92;
  G.t = 20;
  // a car parked out front, engine still ticking
  const car = new Car('stallion', safe.x + 70, safe.y + 40, dirAng(2), { color: '#00d9ff' });
  G.cars.push(car);
  return true;
}

// 4-chaos: five-alarm scene — burning car, booms, cruisers, four stars
function shotChaos(seed, game) {
  game.newGame(seed, { silent: true });
  const px = roadX(10) + CFG.RW / 4;
  const py = roadY(6);
  const P = G.player;
  P.x = px - 60;
  P.y = py + 40;
  P.h = dirAng(0);
  // victim car mid-explosion
  const victim = new Car('voodoo', px + 60, py, dirAng(2), { color: '#8c1f28' });
  G.cars.push(victim);
  victim.hp = 1;
  victim.burnT = 3.0;
  for (let k = 0; k < 10; k++) {
    G.parts.push({
      x: victim.x + (Math.random() - 0.5) * 60, y: victim.y + (Math.random() - 0.5) * 40,
      vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120 - 30,
      life: 0.9, max: 0.9, type: 'fire', r: 10,
    });
  }
  G.booms.push({ x: victim.x, y: victim.y, t: 0.05, r: 150 });
  // a second wreck already cooling off
  const older = new Car('wagon', px - 160, py - 90, dirAng(1), { color: '#88a550' });
  G.cars.push(older);
  older.dead = true;
  older.wreckT = 8;
  // bystanders who picked the wrong street
  for (let k = 0; k < 5; k++) {
    const ped = new Ped(px - 120 + Math.random() * 200, py + 60 + Math.random() * 60, null);
    ped.panic(6, { x: victim.x, y: victim.y });
    G.peds.push(ped);
  }
  // the cavalry
  G.police.setStars(4);
  for (let k = 0; k < 3; k++) {
    const c = G.police.spawnCruiser();
    if (c) { c.x = px + (k - 1) * 180; c.y = py - 260; c.h = dirAng(1); }
  }
  G.cops.push(new Cop(px + 150, py - 160));
  G.cops.push(new Cop(px - 190, py - 140));
  // roadblock hardware down the block
  G.spikes.push({ x: px + 140, y: py - 120, w: CFG.SPIKE.w, h: CFG.SPIKE.h, life: 999 });
  G.cam.x = px + 30;
  G.cam.y = py - 40;
  G.cam.z = 0.95;
  G.cam.shake = 8;
  G.hud.sub = 'DISPATCH: All units — suspect on foot, 10th and Ocean. Fire crews ignored.';
  G.hud.subT = 6;
  G.t = 30;
  return true;
}
