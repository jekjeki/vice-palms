// shots.js — deterministic staged scenes for the four dossier screenshots.
// `?shot=start|play|end|chaos&seed=N` places the city, actors and camera,
// advances the sim a fixed number of steps, and mutes the audio.

import { CFG, PLACES } from './config.js';
import { CAR_SPECS, placeCar, makeParkedCar, DIR_ANG, POLICE_SPEC } from './cars.js';
import { writeSave } from './screens.js';
import { dist } from './util.js';

export const SHOT_NAMES = ['start', 'play', 'end', 'chaos'];

/**
 * Prepare the game for a staged screenshot. Returns the number of fixed-step
 * sim ticks to run before the shot is taken (0 for static titles).
 */
export function stageShot(game, shot, seed) {
  game.audio.setMuted(true);
  game.shotMode = shot;
  const T = CFG.T;

  if (shot === 'start') {
    game.toTitle();
    game.menuIndex = 0;
    return 0;
  }

  if (shot === 'play') {
    game.startNewGame(seed);
    // player cruising a Banshee down a downtown avenue
    const p = game.player;
    p.money = 1240;
    const car = placeCar(CAR_SPECS[0], 23.5 * T, 84 * T, DIR_ANG[3], {
      color: '#3ec6b8', driver: 'player', headlights: true,
    });
    game.cars.push(car);
    p.car = car;
    p.x = car.x;
    p.y = car.y;
    p.ang = car.ang;
    car.speed = 120;
    // keep the staged block busy: respawn traffic around the camera
    game.traffic.cars = [];
    game.cars = game.cars.filter((c) => c.driver !== 'ai');
    game.traffic.populate(car.x, car.y);
    dressStreet(game, seed);
    // clear wanted level for a clean shot
    game.police.clear();
    game.cam.x = car.x;
    game.cam.y = car.y;
    game.hud.subtitle('Vice Palms at night — the city is yours.', 5);
    return 150; // ~2.5 s of sim to settle traffic and lights
  }

  if (shot === 'end') {
    // mission-passed banner over a beachfront scene
    game.startNewGame(seed);
    const p = game.player;
    p.money = 3740;
    game.missions.storyIndex = 2;
    const car = placeCar(CAR_SPECS[2], 24.5 * T, 143.4 * T, DIR_ANG[0], {
      color: '#c22f4a', driver: 'player',
    });
    game.cars.push(car);
    p.car = car;
    p.x = car.x;
    p.y = car.y;
    game.cam.x = car.x;
    game.cam.y = car.y;
    game.hud.missionPassed('Container Run', 800);
    writeSave(game);
    return 60;
  }

  if (shot === 'chaos') {
    // five stars, an exploding car, a cruiser bearing down
    game.startNewGame(seed);
    const p = game.player;
    p.money = 820;
    p.x = 30 * T;
    p.y = 86 * T;
    p.ang = 0.6;
    p.weapon = 1;
    p.ammo = 40;
    // burning wreck next to the player
    const wreck = makeParkedCar(CAR_SPECS[4], 31.4 * T, 86.8 * T, DIR_ANG[2], '#8a3c42');
    wreck.hp = 10;
    wreck.onFire = true;
    game.cars.push(wreck);
    // cruiser closing in
    const cruiser = placeCar(POLICE_SPEC, 35 * T, 84.5 * T, DIR_ANG[2], {
      color: '#20242e', driver: 'cop', headlights: true,
    });
    cruiser.siren = true;
    game.cars.push(cruiser);
    // another traffic car fleeing
    const civ = placeCar(CAR_SPECS[6], 27 * T, 89 * T, DIR_ANG[0], {
      color: '#e0e4ea', driver: 'ai', dir: 0,
    });
    game.cars.push(civ);
    // staged explosion going off
    game.effects.push({ type: 'boom', x: 31.4 * T, y: 86.8 * T, t: 0, dur: 0.9 });
    game.flash = 0.8;
    game.cam.shake = 9;
    game.police.heat = CFG.STAR_TABLE[4] + 10;
    game.police.updateStars();
    game.police.flashT = 1;
    game.hud.big('WANTED LEVEL 5', 4, '#ff5c5c');
    game.cam.x = p.x;
    game.cam.y = p.y;
    return 40;
  }

  return 0;
}

/** Park a few cars along the road for the play shot. */
function dressStreet(game, seed) {
  const T = CFG.T;
  const spots = [
    [21.9, 80, 3, 2], [21.9, 88, 3, 4], [25.2, 76, 1, 5],
    [25.2, 92, 1, 3], [21.9, 96, 3, 6],
  ];
  spots.forEach((s, i) => {
    const spec = CAR_SPECS[(i + seed) % CAR_SPECS.length];
    const car = makeParkedCar(spec, s[0] * T, s[1] * T, DIR_ANG[s[2]], spec.colors[i % spec.colors.length]);
    game.cars.push(car);
  });
  // a few peds on the sidewalks near the camera
  game.peds.list.length = 0;
  game.peds.populate(game.player.x, game.player.y);
}
