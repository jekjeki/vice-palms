// The staged screenshot scenes behind ?shot=start|play|end&seed=N. Each scene builds the real
// game from the seed, arranges actors, simulates a short deterministic stretch with scripted
// input, and leaves a single frame for the renderer. Math.random is swapped for a seeded
// generator so the same URL always renders the same frame.

import { PITCH, BLOCKS } from './config.js';
import { createRandom } from './random.js';
import { Vehicle } from './entities/vehicle.js';

const SCRIPT = { axis: () => ({ x: 0, y: -1 }), held: () => false, hit: () => false, endFrame() {} };

export function stageShot(name, game, ui, seed) {
  const rand = createRandom(seed);
  const realRandom = Math.random;
  Math.random = rand; // deterministic traffic spawning during staging

  if (name === 'start') {
    ui.uiState = 'title';
    // Vista on the neon strip: find the stretch of oceanfront hotels with the most neon
    // (deterministic per seed), then frame the beach road, palms and water around it.
    let bestJ = 10, bestScore = -1;
    for (let j = 2; j < BLOCKS - 2; j++) {
      let score = 0;
      for (let dj = -1; dj <= 1; dj++) {
        const block = game.city.blocks[(BLOCKS - 1) * BLOCKS + (j + dj)];
        score += block.signs.length * 2 + block.buildings.length;
      }
      if (score > bestScore) { bestScore = score; bestJ = j; }
    }
    const y = (bestJ + 0.5) * PITCH;
    ui.cameraOverride = { x: 40 * PITCH - 240, y: y - 60, zoom: 0.85 };
    game.player.x = 40 * PITCH - 100;
    game.player.y = y + 120;
    // A few parked cars along the oceanfront road.
    for (let k = 0; k < 4; k++) {
      const v = game.spawnVehicle(Math.floor(rand() * 8), 40 * PITCH - (rand() < 0.5 ? 24 : -24), y - 400 + k * 220, rand() < 0.5 ? 0 : Math.PI);
      v.role = 'parked';
    }
    // A little traffic driving the strip.
    for (let k = 0; k < 3; k++) {
      const v = game.spawnVehicle(Math.floor(rand() * 8), 40 * PITCH - 68, y + 300 + k * 260, -Math.PI / 2);
      v.role = 'traffic';
      v.axis = 'y'; v.dir = -1; v.lane = 40 * PITCH - 68;
      v.speed = 120;
    }
    for (let n = 0; n < 40; n++) game.update(1 / 60, SCRIPT);
    ui.freeze = true;
    Math.random = realRandom;
    return;
  }

  if (name === 'play') {
    ui.uiState = 'play';
    // Mid-street action: the player races a Tempest down an avenue, traffic ahead,
    // two cruisers with their sirens on closing from behind, two stars on the board.
    const roadX = 20 * PITCH + 24;
    const y0 = 16 * PITCH;
    const car = game.spawnVehicle(2, roadX, y0, -Math.PI / 2);
    car.role = 'player';
    car.speed = 300;
    game.player.x = roadX;
    game.player.y = y0;
    game.player.inCar = car;
    for (let k = 0; k < 4; k++) {
      const v = game.spawnVehicle(Math.floor(rand() * 8), roadX + (k % 2 ? 40 : -44), y0 - 230 - k * 190, -Math.PI / 2);
      v.role = 'traffic';
      v.axis = 'y'; v.dir = -1; v.lane = roadX + (k % 2 ? 40 : -44);
      v.speed = 140;
    }
    for (let k = 0; k < 2; k++) {
      const cop = game.spawnVehicle(-1, roadX + (k ? 46 : -46), y0 + 240 + k * 120, -Math.PI / 2);
      cop.role = 'cop';
      cop.siren = true;
      game.police.cars.push(cop);
    }
    game.wanted.stars = 2;
    game.missions.banner('MISSION: THE NIGHT RUN', 'Deliver to the buyer at the plaza — 84s', 30, '#ffd977');
    for (let n = 0; n < 120; n++) game.update(1 / 60, SCRIPT);
    ui.freeze = true;
    Math.random = realRandom;
    return;
  }

  // end: mission-complete beat at the plaza.
  ui.uiState = 'play';
  const plaza = { x: 19.5 * PITCH, y: 20.5 * PITCH };
  game.player.x = plaza.x;
  game.player.y = plaza.y + 30;
  const car = game.spawnVehicle(1, plaza.x + 120, plaza.y - 40, 0);
  car.role = 'parked';
  const cab = game.spawnVehicle(5, plaza.x - 160, plaza.y + 80, Math.PI);
  cab.role = 'traffic';
  cab.axis = 'x'; cab.dir = -1; cab.lane = plaza.y + 80; cab.speed = 100;
  game.missions.banner('MISSION COMPLETE', 'Marisol: “Clean work, Rico.”  +$700', 30, '#7dffa4');
  for (let n = 0; n < 8; n++) game.fx.cash(plaza.x, plaza.y);
  for (let n = 0; n < 60; n++) game.update(1 / 60, SCRIPT);
  ui.freeze = true;
  Math.random = realRandom;
}
