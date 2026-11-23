// shots.js — deterministic staged scenes for the four entry screenshots:
// ?shot=start|play|end|chaos&seed=N (audio always muted in shots).
import { S, VW, VH, clamp, dist, Rng } from './core.js';
import { world } from './world.js';
import { makeCar, carSpeed } from './cars.js';
import { makePlayer } from './player.js';
import { initMissions } from './missions.js';
import { setWanted, spawnFootCop } from './police.js';
import { newGame } from './game.js';

export const SHOTS = ['start', 'play', 'end', 'chaos'];

// Called by main.js once, before the first frame. Returns hold time (s of live sim before freeze).
export function setupShot(name, seed) {
  S.shot = name;
  S.muted = true;
  S.freeze = false;
  const rng = new Rng(seed);
  S.rng = rng;
  if (name === 'start') return setupStart(seed);
  // all gameplay shots start from a fresh deterministic game
  newGame(seed, true);
  if (name === 'play') return setupPlay(seed);
  if (name === 'end') return setupEnd(seed);
  if (name === 'chaos') return setupChaos(seed);
  return 1;
}

// 1-start: the cover shot — title screen over a live night city pan.
function setupStart(seed) {
  newGame(seed, true); // build the deterministic world; keeps mode untouched
  S.mode = 'title';
  S.demo = 1.2;
  S.cam.zoom = 0.85;
  return 0; // no hold; title screen renders immediately
}

// 2-play: cruising Ocean Drive in a Cheetah GT, traffic and peds around.
function setupPlay(seed) {
  const rng = new Rng(seed ^ 0xabc);
  S.mode = 'playing';
  const car = makeCar('sports', 2560, 4166, 0, { color: '#e02a5a', ai: null, rng });
  S.player.inCar = car;
  car.driver = 'player';
  car.fwd = 150;
  // a couple of neighbours on the road
  const t1 = makeCar('taxi', 2980, 4166, 0, { ai: 'traffic', rng, ni: 7, nj: 10, pi: 8, pj: 10 });
  t1.fwd = 170; t1.cruise = 170;
  const t2 = makeCar('van', 2300, 4134, Math.PI, { ai: 'traffic', rng, ni: 5, nj: 10, pi: 4, pj: 10 });
  t2.fwd = -150; t2.cruise = 150;
  makeCar('police', 2960, 3500, Math.PI / 2, { ai: 'parked', rng });
  S.cam.x = car.x; S.cam.y = car.y;
  S.toasts.push({ text: 'Ocean Drive, 2 AM. The night is young.', t: 0, dur: 5 });
  return 1.6;
}

// 3-end: mission passed — payout banner over a beach-house delivery.
function setupEnd(seed) {
  const rng = new Rng(seed ^ 0x777);
  S.mode = 'playing';
  S.player.x = 5340; S.player.y = 4072;
  S.player.ang = Math.PI;
  S.money = 4750; S.moneyShow = 4750;
  S.mission.banner = { text: 'MISSION PASSED!', pay: 1000, name: 'Neon Run — every checkpoint, flat out' };
  S.mission.bannerT = 3.4;
  S.mission.index = 3;
  S.mission.done = ['m1', 'm2', 'm3'];
  const car = makeCar('muscle', 5300, 4110, Math.PI / 2, { color: '#c83020', ai: 'parked', rng });
  S.player.inCar = car; car.driver = 'player';
  S.cam.x = S.player.x; S.cam.y = S.player.y;
  sayLater('RICO: Fastest thing on Ocean Drive, little brother!');
  return 0.6;
}

// 4-chaos: 5 stars — cruisers closing in, a burning car, flash mid-bang.
function setupChaos(seed) {
  const rng = new Rng(seed ^ 0x3311);
  S.mode = 'playing';
  S.wanted = 5;
  S.player.weapon = 'pistol';
  S.player.ammo = 999;
  S.player.x = 3360; S.player.y = 2340;
  S.player.ang = Math.PI * 0.75;
  // converging cruisers
  const positions = [[3060, 2340, 0], [3700, 2340, Math.PI], [3360, 1900, Math.PI / 2], [3360, 2760, -Math.PI / 2]];
  let i = 0;
  for (const [x, y, a] of positions) {
    const cop = makeCar('police', x, y, a, { ai: 'police', siren: true, rng });
    cop.fwd = 120; i++;
  }
  // a burning sedan next to the player + parked victims
  const burn = makeCar('sedan', 3240, 2420, 0.7, { color: '#8a8a96', ai: 'parked', rng });
  burn.hp = 5; burn.explodeT = 1.6; burn.fireT = 1.6;
  makeCar('taxi', 3520, 2400, 2.2, { ai: 'parked', rng });
  makeCar('pickup', 3200, 2200, 1.0, { ai: 'parked', rng });
  // cops on foot deploying
  spawnFootCop(3300, 2280);
  spawnFootCop(3440, 2440);
  // muzzle & flash peak at the frozen frame
  S.player.muzzleT = 0.2;
  S.flash = 0.22; S.flashCol = '255,220,160';
  S.shake = 9;
  S.cam.x = S.player.x; S.cam.y = S.player.y;
  S.cam.zoom = 0.92;
  sayLater('WANTED — 5 STARS. The whole VCPD is out.');
  return 1.45;
}

let subs = [];
function sayLater(text) { subs.push({ text, t: 0, dur: 6 }); S.subs.push(...subs.splice(0)); }

// Short scripted walk: shots run the sim briefly, then freeze for a crisp frame.
export function tick(dt) {
  for (const sub of S.subs) sub.t += dt;
}
