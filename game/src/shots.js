// shots.js — deterministic staged scenes for the 4 entry screenshots (?shot=start|play|end|chaos&seed=N)
import { CFG } from './config.js';
import { mulberry32 } from './rng.js';

export function parseShot() {
  const q = new URLSearchParams(location.search);
  const shot = q.get('shot') || '';
  const seed = parseInt(q.get('seed') || '7', 10) || 7;
  const mute = q.get('mute') === '1' || true; // staged shots are always muted
  if (!CFG.SHOT_PARAMS.includes(shot)) return null;
  return { shot, seed, mute };
}

// called by game.js right after boot, before the first frame
export function applyShot(game, shotInfo) {
  if (!shotInfo) return false;
  game.shotMode = shotInfo.shot;
  game.startMuted = true;
  const rng = mulberry32(shotInfo.seed * 7919 + 13);
  const world = game.world;
  const p = game.player;

  // deterministic world time (drives lights, neon flicker, waves)
  game.t = 12 + (shotInfo.seed % 5) * 1.7;

  if (shotInfo.shot === 'start') {
    game.state = 'title';
    return true;
  }

  // ---- shared staged setup for in-game shots ----
  game.state = 'play';
  // staged traffic: a mix of idling cars on the street (they hold position for the shot)
  const baseRoad = world.roadH[7]; // y = 2720
  const idleAI = { drive: () => ({ t: 0, s: 0 }) };
  const staged = [
    [980, 15, 'sedan', 0], [1240, -15, 'taxi', 0], [1520, 15, 'bus', 0],
    [1820, -15, 'van', Math.PI], [2100, 15, 'coupe', Math.PI], [2380, -15, 'pickup', 0],
  ];
  for (const [x, off, type, h] of staged) {
    const car = game.addCar(type, x, baseRoad + off, h);
    car.driver = 'ai';
    car.ai = idleAI;
  }
  for (let i = 0; i < 10; i++) {
    const x = 700 + rng() * 2200;
    game.spawnPed(x, baseRoad + (rng() < 0.5 ? -CFG.ROAD_W / 2 - 12 : CFG.ROAD_W / 2 + 12));
  }
  // ammo + health pickups visible on the sidewalk
  game.addPickup(1180, baseRoad - 46, 'ammo');
  game.addPickup(1420, baseRoad - 46, 'health');

  if (shotInfo.shot === 'play') {
    // player behind the wheel of a sport coupe, mid-cruise
    const car = game.addCar('sport', 1330, baseRoad + CFG.LANE_OFF, 0, '#c22f4a');
    p.inCar = car;
    car.driver = 'player';
    p.x = car.x; p.y = car.y;
    p.ammo = 24;
    p.money = 12480;
    car.vx = 140; // gentle roll so the scene reads "in motion"
    car.skidT = 0;
    game.police.wanted = 0;
    game.cam.x = car.x + 140; game.cam.y = car.y + 70;
    game.hud.subtitle('RICO: "Cruise the strip, baby. The city sells itself."', 4);
    // fresh tire marks behind the car
    for (let i = 0; i < 6; i++) {
      game.skids.push({ x0: car.x - 60 - i * 18, y0: car.y - 12, x1: car.x - 42 - i * 18, y1: car.y - 12 });
      game.skids.push({ x0: car.x - 60 - i * 18, y0: car.y + 12, x1: car.x - 42 - i * 18, y1: car.y + 12 });
    }
    return true;
  }

  if (shotInfo.shot === 'end') {
    const car = game.addCar('coupe', 1500, baseRoad + CFG.LANE_OFF, 0, '#2f7ac2');
    p.inCar = car;
    car.driver = 'player';
    p.x = car.x; p.y = car.y;
    p.money = 15200;
    p.ammo = 24;
    game.cam.x = car.x; game.cam.y = car.y;
    game.hud.banner('MISSION PASSED', 'Respect+  $450');
    game.flash = 0.15;
    return true;
  }

  if (shotInfo.shot === 'chaos') {
    // five stars: cruisers converging, wrecks burning, peds fleeing
    game.police.wanted = 5;
    game.police.heat = 5;
    p.money = 20300;
    p.ammo = 12;
    const car = game.addCar('sedan', 1600, baseRoad + CFG.LANE_OFF, 0, '#5d6b7a');
    p.inCar = car;
    car.driver = 'player';
    p.x = car.x; p.y = car.y;
    // two freshly exploded wrecks with fire particles
    for (const [x, y] of [[1240, baseRoad - CFG.LANE_OFF], [2050, baseRoad + CFG.LANE_OFF]]) {
      const wreck = game.addCar('van', x, y, rng() * 3);
      wreck.state = 'wreck';
      wreck.exploded = true;
      wreck.explodeT = 1.2;
      for (let i = 0; i < 26; i++) {
        game.particles.push({ x: x + (rng() - 0.5) * 60, y: y + (rng() - 0.5) * 30, vx: (rng() - 0.5) * 30, vy: -30 - rng() * 60, life: 1 + rng(), life0: 2, kind: 'fire', size: 8 + rng() * 8 });
        game.particles.push({ x: x + (rng() - 0.5) * 80, y: y - 20 - rng() * 40, vx: (rng() - 0.5) * 20, vy: -20 - rng() * 30, life: 2 + rng(), life0: 3, kind: 'smoke', size: 10 + rng() * 14 });
      }
    }
    // pursuing cruisers (kept back so the staged player survives the shot)
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2;
      const cx = p.x + Math.cos(ang) * 760, cy = p.y + Math.sin(ang) * 760;
      const cop = game.addCar('police', cx, cy, Math.atan2(p.y - cy, p.x - cx));
      cop.driver = 'ai';
      cop.siren = true;
      game.addChaser(cop);
    }
    // foot cops (they hold fire for the staged shot)
    for (let i = 0; i < 4; i++) {
      const cop = game.spawnPed(p.x + 200 + i * 60, p.y + 160, { kind: 'cop' });
      cop.shootT = 99;
    }
    // staged survivability: full armor so the five-star scene photographs alive
    p.armor = 100;
    p.hp = 100;
    // panicking peds
    for (let i = 0; i < 12; i++) {
      const ped = game.spawnPed(p.x - 300 + rng() * 700, p.y + (rng() < 0.5 ? -140 : 150));
      if (ped) ped.state = 'flee';
    }
    game.cam.shake = 10;
    game.flash = 0.4;
    game.hud.toast('WANTED ★★★★★');
    return true;
  }
  return true;
}
