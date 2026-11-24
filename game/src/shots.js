// Vice Palms — deterministic staged scenes for the four bounty screenshots.
// Loaded via ?shot=start|play|end|chaos&seed=N; main.js disables input and
// flips window.__shotReady once the scene has settled.

import { makeCar } from './cars.js';
import { ROADS, LANE } from './config.js';
import { spawnTraffic, spawnMissionCar } from './traffic.js';
import { makePed } from './peds.js';

export const SHOT_FRAMES = { start: 50, play: 85, end: 60, chaos: 95 };

/** Simulated seconds each scene needs before it looks right. */
export const SHOT_SIM = { start: 0.35, play: 1.1, end: 0.7, chaos: 1.18 };

export function setupShot(game, name) {
  switch (name) {
    case 'start':
      // title screen over the living city (already the default state)
      game.screens.mode = 'title';
      break;

    case 'play': {
      game.screens.mode = 'playing';
      game.newGame();
      // the player hurls a pink Cheetah down a downtown boulevard
      const car = makeCar('sports', 2620, ROADS[7] + LANE, 0, 'player', '#ff2d78');
      car.speed = 240;
      game.cars.push(car);
      game.player.inCar = car;
      game.player.x = car.x;
      game.player.y = car.y;
      game.cam.x = car.x;
      game.cam.y = car.y;
      game.subtitle('Rico: Cruise down Ocean Ave — I hate waiting.', 5);
      break;
    }

    case 'end': {
      game.screens.mode = 'playing';
      game.newGame();
      const sp = game.world.spawns.safehouse;
      game.player.x = sp.x + 14;
      game.player.y = sp.y + 26;
      game.cam.x = sp.x;
      game.cam.y = sp.y;
      game.player.money = 4250;
      game.missions.storyIdx = 3;
      game.missions.banner = { txt: 'MISSION PASSED!', sub: 'AIRFIELD RUN — $1,600', col: '#7dffa8', t: 9 };
      break;
    }

    case 'chaos': {
      game.screens.mode = 'playing';
      game.newGame();
      // a cruiser already burning on Ocean Ave, two more on the way
      const py = ROADS[7] + LANE;
      const burn = makeCar('cruiser', 2900, py, 0.3, 'police');
      burn.color = '#e8e8ee';
      burn.onFire = true;
      burn.burnT = 1.6;
      burn.hp = 12;
      game.cars.push(burn);
      const c1 = makeCar('cruiser', 2760, py - LANE * 2, 0, 'police');
      c1.ai = { mode: 'chase', stuckT: 0, revT: 0 };
      const c2 = makeCar('cruiser', 3120, py + LANE * 2, Math.PI, 'police');
      c2.ai = { mode: 'chase', stuckT: 0, revT: 0 };
      game.cars.push(c1, c2);
      // a couple of fleeing bystanders
      for (let k = 0; k < 4; k++) {
        const p = makePed(2900 + (Math.random() - 0.5) * 260, py + 60 + Math.random() * 60, 'civ');
        p.state = 'flee';
        p.t = 6;
        game.peds.push(p);
      }
      game.player.x = 2900;
      game.player.y = py - 64;
      game.player.weapon = 1;
      game.player.ammo = { 1: 40, 2: 0, 3: 0 };
      game.cam.x = 2900;
      game.cam.y = py - 40;
      game.addCrime(24); // four stars
      game.subtitle('They just keep coming…', 4);
      break;
    }

    default:
      game.screens.mode = 'title';
  }
}
