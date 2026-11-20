// The staged screenshot scenes behind ?shot=start|play|end&seed=N. Each scene builds the real
// game from the seed, arranges actors, simulates a short deterministic stretch with scripted
// input, and leaves a single frame for the renderer. Math.random is swapped for a seeded
// generator so the same URL always renders the same frame.

import { PITCH, BLOCKS } from './config.js';
import { createRandom } from './random.js';
import { Vehicle } from './entities/vehicle.js';
import { MISSIONS, GIVERS } from './systems/missions.js';

const SCRIPT = { axis: () => ({ x: 0, y: -1 }), held: () => false, hit: () => false, endFrame() {} };

export function stageShot(name, game, ui, seed) {
  const rand = createRandom(seed);
  const realRandom = Math.random;
  Math.random = rand; // deterministic traffic spawning during staging

  if (name === 'chaos') {
    stageChaos(game, ui, rand);
    Math.random = realRandom;
    return;
  }

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

  // end: the finale beat — Rico races the police up the oceanfront road toward the marina gate.
  ui.uiState = 'play';
  game.missions.index = MISSIONS.length - 1;
  const giver = GIVERS[game.missions.index];
  game.player.inCar = null;
  game.player.x = giver.x;
  game.player.y = giver.y;
  for (let n = 0; n < 30; n++) game.update(1 / 60, SCRIPT); // the Last Ride brief plays, 3 stars on
  game.player.inCar = null;
  const ride = game.spawnVehicle(1, 40 * PITCH - 24, 9.2 * PITCH, -Math.PI / 2);
  ride.role = 'player';
  ride.speed = 260;
  game.player.inCar = ride;
  game.player.x = ride.x; game.player.y = ride.y;
  for (let k = 0; k < 3; k++) {
    const cop = game.spawnVehicle(-1, 40 * PITCH + (k % 2 ? 24 : -24), 9.2 * PITCH + 650 + k * 170, -Math.PI / 2);
    cop.role = 'cop';
    cop.siren = true;
    game.police.cars.push(cop);
  }
  game.wanted.stars = 4;
  for (let n = 0; n < 100; n++) game.update(1 / 60, SCRIPT);
  ui.freeze = true;
  Math.random = realRandom;
}

/** chaos: a wreck burning in an intersection, a roadblock up the street, five stars.
 *  Runs as the real Smoke Break mission (index 4) so the HUD objective stays honest. */
function stageChaos(game, ui, rand) {
  ui.uiState = 'play';
  game.missions.index = 4;
  const giver = GIVERS[4];
  game.player.inCar = null;
  game.player.x = giver.x;
  game.player.y = giver.y;
  for (let n = 0; n < 30; n++) game.update(1 / 60, SCRIPT); // the mission starts; vans spawn at the depot
  const vans = game.vehicles.filter((v) => v.tag === 'target');
  const cx = 14 * PITCH, cy = 18 * PITCH;
  if (vans[0]) { vans[0].x = cx - 40; vans[0].y = cy - 30; vans[0].ang = 0.4; vans[0].hp = 0; vans[0].dead = true; vans[0].burnT = 1.4; }
  if (vans[1]) { vans[1].x = cx + 30; vans[1].y = cy + 90; vans[1].ang = Math.PI / 2; vans[1].hp = vans[1].def.hp * 0.2; }
  if (game.missions.active) game.missions.active.destroyed = 2;
  game.player.x = cx + 180;
  game.player.y = cy + 60;
  game.player.heading = Math.PI;
  const parked = game.spawnVehicle(6, cx - 150, cy + 100, -Math.PI / 2);
  parked.role = 'parked';
  for (let k = 0; k < 2; k++) {
    const cop = game.spawnVehicle(-1, cx + 60 + k * 50, cy - 260 - k * 60, Math.PI / 2);
    cop.role = 'cop';
    cop.siren = true;
    game.police.cars.push(cop);
  }
  game.police.spawnFootCop(cx + 80, cy - 200);
  game.police.spawnFootCop(cx + 120, cy - 210);
  game.wanted.stars = 5;
  game.player.ammo = 18;
  game.player.weapon = 'pistol';
  for (let n = 0; n < 50; n++) game.update(1 / 60, SCRIPT);
  for (let n = 0; n < 5; n++) game.fx.fire(vans[0].x + (rand() - 0.5) * 30, vans[0].y + (rand() - 0.5) * 30, 3);
  game.fx.explosion(cx - 90, cy - 110);
  ui.freeze = true;
}
