// The staged screenshot scenes behind ?shot=start|play|end|chaos&seed=N. Each scene builds the
// real game from the seed, arranges its actors, runs a short scripted stretch of simulation and
// freezes one frame. The global runtime RNG is pointed at a seeded stream first, so the same
// URL always produces the same picture.

import { GRID, PITCH, SAND } from './config.js';
import { seedRun, freeRun, rand } from './rng.js';
import { Person } from './entities/person.js';
import { JOBS, GIVERS } from './systems/missions.js';

const SCRIPT = { axis: () => ({ x: 0, y: -1 }), held: () => false, tap: () => false, endFrame() {} };

export function stageShot(name, game, ui, seed) {
  seedRun(seed);
  if (name === 'chaos') {
    chaosScene(game, ui);
    freeRun();
    return;
  }
  if (name === 'docks') {
    docksScene(game, ui);
    freeRun();
    return;
  }
  if (name === 'start') {
    ui.uiState = 'title';
    // Frame the neon stretch with the most signs, beach road and water behind it.
    let bestJ = 10, best = -1;
    for (let j = 2; j < GRID - 2; j++) {
      let score = 0;
      for (let dj = -1; dj <= 1; dj++) {
        const block = game.city.blocks[(GRID - 1) * GRID + (j + dj)];
        score += block.signs.length * 2 + block.buildings.length;
      }
      if (score > best) { best = score; bestJ = j; }
    }
    const y = (bestJ + 0.5) * PITCH;
    // The camera hangs just off the beach kerb: the lit hotel strip fills the middle of the
    // frame, headlights run the full height, and the wet sand closes the right edge.
    ui.cameraOverride = { x: GRID * PITCH - 70, y: y - 30, zoom: 0.8 };
    game.player.x = GRID * PITCH - 96;
    game.player.y = y + 96;
    game.player.heading = Math.PI * 0.75;
    // Parked shoulder cars along the oceanfront road — a fuller, more varied kerbside,
    // mostly hugging the beach kerb where the camera reads them best.
    for (let k = 0; k < 8; k++) {
      const v = game.spawnCar(Math.floor(rand() * 10), GRID * PITCH - (rand() < 0.72 ? 24 : -24), y - 480 + k * 172, rand() < 0.5 ? 0 : Math.PI);
      v.role = 'parked';
    }
    // Proper lanes: two-way traffic rolling the strip, headlights burning.
    for (let k = 0; k < 5; k++) {
      const v = game.spawnCar(Math.floor(rand() * 10), GRID * PITCH + 22, y - 1000 + k * 460, Math.PI / 2);
      v.role = 'traffic';
      v.axis = 'y'; v.dir = 1; v.lane = GRID * PITCH + 22;
      v.fwd = 130;
    }
    for (let k = 0; k < 4; k++) {
      const v = game.spawnCar(Math.floor(rand() * 10), GRID * PITCH - 22, y + 240 + k * 480, -Math.PI / 2);
      v.role = 'traffic';
      v.axis = 'y'; v.dir = -1; v.lane = GRID * PITCH - 22;
      v.fwd = 130;
    }
    // A patrol cruiser rolls the strip far from the camera, sirens quiet.
    const cop = game.spawnCar(-1, GRID * PITCH + 22, y - 1460, Math.PI / 2);
    cop.role = 'traffic';
    cop.axis = 'y'; cop.dir = 1; cop.lane = GRID * PITCH + 22; cop.cruise = 150; cop.fwd = 150;
    // A few strollers share the sidewalk with the hero — the strip feels walked-on.
    for (let n = 0; n < 10; n++) {
      game.people.push(new Person(GRID * PITCH - 90 + (n % 2) * 40, y + 10 + n * 74, n * 31 + 5));
    }
    for (let n = 0; n < 40; n++) game.update(1 / 60, SCRIPT);
    ui.freeze = true;
    freeRun();
    return;
  }

  if (name === 'play') {
    ui.uiState = 'play';
    // A street race gone hot: the player outruns traffic with two cruisers on the tail.
    const roadX = 20 * PITCH + 24;
    const y0 = 16 * PITCH;
    const car = game.spawnCar(1, roadX, y0, -Math.PI / 2);
    car.role = 'player';
    car.fwd = 300;
    game.player.x = roadX;
    game.player.y = y0;
    game.player.car = car;
    for (let k = 0; k < 4; k++) {
      const v = game.spawnCar(Math.floor(rand() * 10), roadX + (k % 2 ? 40 : -44), y0 - 230 - k * 190, -Math.PI / 2);
      v.role = 'traffic';
      v.axis = 'y'; v.dir = -1; v.lane = roadX + (k % 2 ? 40 : -44);
      v.fwd = 140;
    }
    for (let k = 0; k < 2; k++) {
      const cop = game.spawnCar(-1, roadX + (k ? 46 : -46), y0 + 240 + k * 120, -Math.PI / 2);
      cop.role = 'cop';
      cop.siren = true;
      game.cops.cruisers.push(cop);
    }
    game.wanted.stars = 2;
    // The HUD objective stays honest: the Night Run is live, mid-delivery.
    game.missions.begin(2);
    game.missions.enterStage(1);
    game.missions.banner('MISSION: THE NIGHT RUN', 'Deliver the case to the buyer at the plaza', 30, '#ffd977');
    for (let n = 0; n < 120; n++) game.update(1 / 60, SCRIPT);
    ui.freeze = true;
    freeRun();
    return;
  }

  // end: the finale — Rico rides the oceanfront road for the marina gate with 4 stars hot.
  ui.uiState = 'play';
  game.missions.cursor = JOBS.length - 1;
  const giver = GIVERS[game.missions.cursor];
  game.player.car = null;
  game.player.x = giver.x;
  game.player.y = giver.y;
  for (let n = 0; n < 30; n++) game.update(1 / 60, SCRIPT); // the Last Ride brief plays
  const ride = game.spawnCar(1, GRID * PITCH - 24, 9.2 * PITCH, -Math.PI / 2);
  ride.role = 'player';
  ride.fwd = 260;
  game.player.car = ride;
  game.player.x = ride.x; game.player.y = ride.y;
  for (let k = 0; k < 3; k++) {
    const cop = game.spawnCar(-1, GRID * PITCH + (k % 2 ? 24 : -24), 9.2 * PITCH + 650 + k * 170, -Math.PI / 2);
    cop.role = 'cop';
    cop.siren = true;
    game.cops.cruisers.push(cop);
  }
  game.wanted.stars = 4;
  for (let n = 0; n < 100; n++) game.update(1 / 60, SCRIPT);
  ui.freeze = true;
  freeRun();
}

/** docks: the North Docks at night — rain rolling in off the bay, the Coral
 *  Crown at anchor, a turf standoff brewing on Pier B and the fish market. */
function docksScene(game, ui) {
  ui.uiState = 'play';
  // Night rain reads best on wet concrete with sodium lamps burning.
  game.weather.setWeather('rain', 9999);
  const pierB = 10 * 420 + 65;          // centre of Pier B
  const shoreY = -1400;
  // Rico walks the promenade between Pier B and the market, the anchored
  // ship looming off his shoulder.
  game.player.car = null;
  game.player.x = pierB - 700;
  game.player.y = shoreY + 190;
  game.player.heading = -Math.PI / 2;
  game.player.money = 18750;
  game.player.weapon = 'pistol';
  game.player.ammo = 12;
  // A couple of parked trucks along the shore road.
  for (let k = 0; k < 3; k++) {
    const v = game.spawnCar(6, pierB - 620 + k * 300, -1430, 0);
    v.role = 'parked';
  }
  // The Tides and the Cinders square off on Pier B by the market stalls.
  for (let k = 0; k < 4; k++) {
    game.gangs.spawnMember('tides', pierB - 55 + k * 22, shoreY - 260 - k * 26);
  }
  for (let k = 0; k < 4; k++) {
    game.gangs.spawnMember('cinders', pierB - 55 + k * 22, shoreY - 380 - k * 22);
  }
  game.wanted.stars = 0;
  game.missions.banner('NORTH DOCKS', 'Five piers, two gangs, one boat that should not be there.', 30, '#7bffd4');
  // Let the cranes swing, the gulls settle and the rain build.
  for (let n = 0; n < 150; n++) game.update(1 / 60, SCRIPT);
  ui.cameraOverride = { x: 3560, y: -1180, zoom: 0.55 };
  ui.freeze = true;
}

/** chaos: a torched van burning in an intersection, roadblock up the street, five stars. */
function chaosScene(game, ui) {
  ui.uiState = 'play';
  game.missions.cursor = 4;
  const giver = GIVERS[4];
  game.player.car = null;
  game.player.x = giver.x;
  game.player.y = giver.y;
  for (let n = 0; n < 30; n++) game.update(1 / 60, SCRIPT); // the mission begins; vans appear
  const vans = game.cars.filter((c) => c.tag === 'van');
  const cx = 14 * PITCH, cy = 18 * PITCH;
  if (vans[0]) { vans[0].x = cx - 40; vans[0].y = cy - 30; vans[0].ang = 0.4; vans[0].hp = 0; vans[0].wreck = true; vans[0].burn = 1.4; }
  if (vans[1]) { vans[1].x = cx + 30; vans[1].y = cy + 90; vans[1].ang = Math.PI / 2; vans[1].hp = vans[1].spec.hp * 0.2; }
  if (game.missions.active) game.missions.active.torched = 2;
  game.player.x = cx + 180;
  game.player.y = cy + 60;
  game.player.heading = Math.PI;
  const parked = game.spawnCar(6, cx - 150, cy + 100, -Math.PI / 2);
  parked.role = 'parked';
  for (let k = 0; k < 2; k++) {
    const cop = game.spawnCar(-1, cx + 60 + k * 50, cy - 260 - k * 60, Math.PI / 2);
    cop.role = 'cop';
    cop.siren = true;
    game.cops.cruisers.push(cop);
  }
  game.cops.birthFoot(cx + 80, cy - 200);
  game.cops.birthFoot(cx + 120, cy - 210);
  game.wanted.stars = 5;
  game.player.ammo = 18;
  game.player.weapon = 'pistol';
  for (let n = 0; n < 50; n++) game.update(1 / 60, SCRIPT);
  // The wreck throws fire even if the mission staging ever came up short on vans.
  if (vans[0]) {
    for (let n = 0; n < 5; n++) game.fx.fire(vans[0].x + (rand() - 0.5) * 30, vans[0].y + (rand() - 0.5) * 30, 3);
    game.fx.blast(cx - 90, cy - 110);
  }
  // Rico just fired on the van: a hot muzzle beat and a blast wash that the frozen
  // frame keeps at full strength, since no further update runs to decay them.
  game.fx.muzzle(game.player.x + Math.cos(game.player.heading) * 16, game.player.y + Math.sin(game.player.heading) * 16, game.player.heading);
  game.fx.sparks(game.player.x + Math.cos(game.player.heading) * 60, game.player.y + Math.sin(game.player.heading) * 60, 6);
  game.flash = 0.4;
  ui.freeze = true;
}
