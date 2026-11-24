// Vice Palms — weather: a clear / drizzle / storm / drizzle cycle that dulls
// grip, darkens the sheen, throws rain over the lens and cracks thunder.

import { WEATHER } from './config.js';
import { RNG } from './rng.js';

const rng = new RNG(777007);

export function makeWeather() {
  return {
    idx: 0,                // phase index into WEATHER.phases
    t: WEATHER.durations[0] * rng.range(0.7, 1.1),
    intensity: 0,          // smoothed 0..1 rain amount
    target: 0,
    wind: 0,
    thunder: 0,            // flash timer
    drops: [],             // screen-space rain streaks
    inited: false,
  };
}

/** Grip multiplier the car and foot physics read every frame. */
export function gripMult(weather) {
  return 1 - weather.intensity * WEATHER.gripLoss;
}

export function updateWeather(game, dt) {
  const w = game.weather;

  // --- phase machine
  w.t -= dt;
  if (w.t <= 0) {
    w.idx = (w.idx + 1) % WEATHER.phases.length;
    w.t = WEATHER.durations[w.idx] * rng.range(0.8, 1.25);
    const name = WEATHER.phases[w.idx];
    if (name === 'clear') game.subtitle('The rain is clearing up.', 2.5);
    if (name === 'storm') {
      game.subtitle('A storm rolls in off the water.', 3);
      game.audio.thunder();
      w.thunder = 0.9;
    }
  }
  const name = WEATHER.phases[w.idx];
  w.target = name === 'clear' ? 0 : name === 'drizzle' ? 0.42 : 1;
  // drift intensity toward the target
  const rate = w.target > w.intensity ? 0.14 : 0.07;
  w.intensity += clampTo(w.target - w.intensity, -rate * dt, rate * dt);
  w.wind = Math.sin(game.time * 0.25) * 60 * (0.4 + w.intensity);

  // --- thunder
  if (name === 'storm' && rng.next() < WEATHER.thunderRate * dt) {
    w.thunder = 0.8 + rng.next() * 0.4;
    game.cam.flash = Math.min(1.0, game.cam.flash + w.thunder * 0.55);
    // the boom arrives a beat after the flash
    setTimeout(() => game.audio.thunder(), 300 + rng.next() * 500);
  }
  w.thunder = Math.max(0, w.thunder - dt);

  // --- rain streak pool (screen space, around the camera)
  const want = Math.round(w.intensity * 210);
  const drops = w.drops;
  while (drops.length < want) {
    drops.push({
      x: Math.random() * 1400 - 60,
      y: Math.random() * 840 - 60,
      s: 520 + Math.random() * 260,
    });
  }
  if (drops.length > want) drops.length = want;
  for (const d of drops) {
    d.y += d.s * dt;
    d.x += w.wind * dt;
    if (d.y > 780) {
      d.y = -50;
      d.x = Math.random() * 1400 - 60;
    }
    if (d.x > 1340) d.x -= 1400;
    if (d.x < -60) d.x += 1400;
  }
}

function clampTo(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
