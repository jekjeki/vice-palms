// ---------------------------------------------------------------------------
// shots.js — deterministic staged scenes for the four required screenshots.
// URL contract: ?shot=start|play|end|chaos&seed=N
// Each scene seeds the world, places entities, runs a fixed number of sim
// steps, then freezes the simulation and frames the camera. Audio is muted.
// ---------------------------------------------------------------------------

import { Car } from './cars.js';
import { Ped } from './peds.js';
import { Heli } from './heli.js';
import { RNG } from './rng.js';
import { CFG } from './config.js';
import { clamp, dist2 } from './util.js';

const STEPS = { start: 12, play: 90, end: 30, chaos: 240 };

export function readShotParams() {
  const q = new URLSearchParams(location.search);
  const shot = q.get('shot');
  if (!shot || !STEPS[shot]) return null;
  const seedRaw = q.get('seed') || '7';
  return { shot, seed: Number(seedRaw) || 7, steps: STEPS[shot] };
}

export function applyShot(game, params) {
  game.muted = true;
  game.audio.setMuted(true);
  const shot = params.shot;
  const stage = new RNG((params.seed * 2654435761) >>> 0);

  if (shot === 'start') {
    // title screen: frozen neon downtown under the logo + menu
    game.state = 'title';
    game.renderer.cam.x = 2040;
    game.renderer.cam.y = 2680;
    game.renderer.cam.zoom = 0.9;
    runSteps(game, 12);
    game.state = 'title';
    game.pendingShot = true;
    return;
  }

  if (shot === 'play') {
    game.startPlaythrough('new', { silent: true });
    // light drizzle for atmosphere
    game.weather.cycleIdx = 1;
    game.weather.intensity = 1;
    game.weather.timer = 999;
    game.weather.wet = 0.5;
    game.weather._retargetDrops();
    // player in a sports car, mid-drive downtown
    const car = game.spawnTempCar('sports', 2040, 2905, -Math.PI / 2);
    game.player.enterCar(car, game);
    car.speed = 260;
    game.police.crime(0, 0, 0, 'none'); // clean
    game.missions.say('RICO: smooth streets tonight, primo. Keep it that way.', 6);
    runSteps(game, params.steps);
    framePlayer(game);
    game.pendingShot = true;
    return;
  }

  if (shot === 'end') {
    game.startPlaythrough('new', { silent: true });
    // mission-passed tableau at the marina, cash on screen
    const car = game.spawnTempCar('sedan', 3400, 3960, 0);
    game.player.enterCar(car, game);
    game.missions.state = 'idle';
    game.missions.storyIndex = 2;
    game.player.addMoney(750);
    game.hud.showToast('MISSION PASSED — Container Run — $750', 999);
    runSteps(game, params.steps);
    game.renderer.cam.zoom = 1.0;
    framePlayer(game);
    game.pendingShot = true;
    return;
  }
  if (shot === 'chaos') {
    game.startPlaythrough('new', { silent: true });
    const car = game.spawnTempCar('super', 1640, 2680, -Math.PI / 2);
    game.player.enterCar(car, game);
    // heat + wrecks + fire, staged tight around the camera
    game.police.crime(car.x, car.y, 150, 'staged');
    game.police.spawnCd = 0.2;
    const a = game.spawnTempCar('sedan', 1780, 2560, 0.3);
    a.hp = 0; a.catchFire();
    const b = game.spawnTempCar('van', 1500, 2800, Math.PI);
    b.hp = 0; b.catchFire();
    for (let i = 0; i < 6; i++) {
      const ped = new Ped(1600 + stage.range(-200, 200), 2500 + stage.range(-200, 200), stage);
      ped.state = 'flee';
      ped.panicT = 8;
      ped.panicFrom = { x: 1700, y: 2600 };
      game.peds.list.push(ped);
    }
    runSteps(game, params.steps);
    // frozen fireball next to the player for the cover
    game.fx.explosion(car.x + 90, car.y - 60, game);
    game.fx.flash = 0.09;
    // make sure the air unit is overhead in the frame
    if (!game.police.helis.list.length) {
      game.police.helis.list.push(new Heli(car.x + 240, car.y - 200, stage));
    }
    framePlayer(game);
    game.pendingShot = true;
    return;
  }
}

/** exported for the test harness: staged invariants per scene */
export function verifyShot(game, shot) {
  switch (shot) {
    case 'start': return game.state === 'title';
    case 'play': return !!game.player.inCar && !game.player.inCar.wrecked;
    case 'end': return game.hud.toastT > 0;
    case 'chaos': return game.police.wanted >= 4;
    default: return true;
  }
}

/** run a quick self-check that all staged scenes respond — dev/CI helper */
export async function verifyAll(baseUrl = location.origin) {
  const out = [];
  for (const scene of ['start', 'play', 'end', 'chaos']) {
    try {
      const res = await fetch(`${baseUrl}/?shot=${scene}&seed=7`);
      out.push(`${scene}: ${res.ok ? 'ok' : 'HTTP ' + res.status}`);
    } catch (e) {
      out.push(`${scene}: ${e.message}`);
    }
  }
  return out;
}

export const SHOT_NAMES = ['start', 'play', 'end', 'chaos'];

function runSteps(game, n) {
  game.state = 'playing';
  for (let i = 0; i < n; i++) {
    game.step(1 / 60);
  }
  game.frozen = true; // render-only after this point
}

/** snap the camera onto the player (with driving lookahead) for a staged shot */
function framePlayer(game) {
  const p = game.player;
  const c = p.inCar;
  const lx = c ? Math.cos(c.angle) * c.speed * 0.32 : 0;
  const ly = c ? Math.sin(c.angle) * c.speed * 0.32 : 0;
  game.renderer.cam.x = p.x + lx;
  game.renderer.cam.y = p.y + ly;
}
