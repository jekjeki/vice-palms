// ============================================================================
// VICE PALMS — shots.js
// Deterministic staged scenes for screenshot capture:
//   ?shot=start&seed=N  — the neon title screen (cover)
//   ?shot=play&seed=N   — mid-game: player cruising a neon avenue, HUD up
//   ?shot=end&seed=N    — the MISSION PASSED banner over live streets
//   ?shot=chaos&seed=N  — 4 stars: cruisers, a burning car, an explosion
// Every scene runs muted and settles to window.__shotReady = true. Same seed
// => same scene.
// ============================================================================

import { TILE, LANE, CITY_W, CITY_H, VIEW_W, VIEW_H } from './config.js';
import { Car } from './cars.js';
import { Ped } from './peds.js';

const DEFAULT_SEEDS = { start: 1337, play: 4242, end: 4242, chaos: 777 };
const READY_AT = { start: 1.2, play: 2.0, end: 2.2, chaos: 1.45 };

export function parseShotParams(search) {
  const qs = new URLSearchParams(search);
  const shot = qs.get('shot') || null;
  const seedRaw = qs.get('seed');
  const seed = seedRaw != null ? (parseInt(seedRaw, 10) >>> 0) : null;
  const mute = qs.get('mute') === '1' || qs.get('mute') === 'true' || !!shot;
  return { shot, seed, mute };
}

export class ShotDirector {
  constructor(game, mode) {
    this.game = game;
    this.mode = mode;
    this.seed = DEFAULT_SEEDS[mode] != null ? DEFAULT_SEEDS[mode] : 4242;
    this.t = 0;
    this.ready = false;
    this.explosionArmed = false;
    this.game.bustImmune = true;
    this.game.godMode = true;
  }

  setup() {
    const g = this.game;
    g.audio.setMuted(true);
    switch (this.mode) {
      case 'start': this.setupStart(); break;
      case 'play': this.setupPlay(); break;
      case 'end': this.setupPlay(true); break;
      case 'chaos': this.setupChaos(); break;
      default: this.mode = null; break;
    }
  }

  setupStart() {
    const g = this.game;
    g.state = 'title';
    g.screens.menuIdx = 0;
    // Anchor the title pan on the hotel neon block.
    g.player.x = 624; g.player.y = 430;
    g.cam.x = 624; g.cam.y = 430; g.cam.z = 0.94;
  }

  setupPlay(forEnd) {
    const g = this.game;
    g.setupWorld(this.seed, false);
    g.state = 'playing';
    g.missions.storyIdx = forEnd ? 5 : 1;
    g.missions.buildMarkers();
    g.time = 180; // city clock 01:00 — deep night
    // Player pinned in the Banshee on Ocean Avenue heading east.
    const car = new Car(g, 'sport', 6 * TILE + 10, 5 * TILE + LANE, 0, '#ff2f7d');
    car.driver = 'player';
    g.cars.push(car);
    g.player.inCar = car;
    g.player.pistolAmmo = 36;
    g.player.money = 12450;
    g.cam.x = car.x; g.cam.y = car.y; g.cam.z = 0.92;
    g.traffic.spawnInitial(16);
    g.peds.spawnInitial(30);
    g.audio.startMusic();
    if (forEnd) {
      // Staged banner over the live scene.
      g.missions.passedBanner = { name: 'Last Flight', payout: 2500, t: 0 };
    }
  }

  setupChaos() {
    const g = this.game;
    g.setupWorld(this.seed, false);
    g.state = 'playing';
    g.time = 90; // city clock 23:30
    const p = g.player;
    p.x = 480; p.y = 516; // on the plaza crossroads
    p.pistolAmmo = 48;
    p.armor = 100;
    p.money = 31200;
    p.inCar = null;
    p.angle = -Math.PI / 3;
    g.cam.x = p.x; g.cam.y = p.y; g.cam.z = 0.9;
    // Heat: 4 stars, cruisers already breathing down the neck.
    g.police.heat = 4.2;
    g.police.spawnCruiser(480, 566, -Math.PI / 2);
    g.police.spawnCruiser(480, 446, Math.PI / 2);
    g.police.spawnCruiser(424, 480, 0);
    // The doomed beater that lights the scene up.
    const bomb = new Car(g, 'sedan', 532, 484, 0, '#5a6c8c');
    bomb.driver = null;
    g.cars.push(bomb);
    bomb.health = 0;
    bomb.burning = true;
    bomb.burnT = 1.1;
    this.explosionArmed = true;
    // Pedestrians scattering.
    for (let k = 0; k < 12; k++) {
      const pt = g.world.randomSidewalkPoint(g.rngPeds, p.x, p.y, 4, 40);
      if (!pt) continue;
      const ped = new Ped(g, pt.x, pt.y);
      ped.state = 'flee';
      ped.fleeT = 8;
      ped.threat = { x: p.x + 20, y: p.y };
      g.peds.list.push(ped);
    }
    g.traffic.spawnInitial(10);
    g.audio.startMusic();
  }

  // Called once per rendered frame (after the sim tick).
  frameUpdate(dt) {
    if (!this.mode) return;
    const g = this.game;
    this.t += dt;

    // Keep the framing locked.
    if (this.mode === 'start') {
      g.player.x = 624; g.player.y = 430;
      g.cam.x = 624; g.cam.y = 430; g.cam.z = 0.94;
    } else {
      const anchor = g.player.inCar || g.player;
      g.cam.x = anchor.x; g.cam.y = anchor.y;
      if (this.mode === 'chaos') g.cam.z = 0.9;
      else g.cam.z = 0.92;
      // Hold the player's car steady on the avenue in play/end scenes.
      if (g.player.inCar && (this.mode === 'play' || this.mode === 'end')) {
        const car = g.player.inCar;
        car.vx = 14; car.vy = 0;
        car.throttle = 0.2;
      }
    }

    if (!this.ready && this.t >= (READY_AT[this.mode] || 2)) {
      this.ready = true;
      try { window.__shotReady = true; } catch (e) { /* non-DOM */ }
    }
  }
}
