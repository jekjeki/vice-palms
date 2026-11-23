// ============================================================================
// VICE PALMS — game.js
// The Game object: owns the world and every subsystem, runs the fixed-tick
// simulation inside a requestAnimationFrame loop, routes state (title / play
// / pause / wasted / busted / end), the camera, events (gunshots, explosions,
// crimes) and the heat consequences, plus save/load and respawn flows.
// ============================================================================

import {
  DT, MAX_FRAME, DEFAULT_SEED, VIEW_W, VIEW_H, WORLD_X0, WORLD_Y0, WORLD_X1, WORLD_Y1,
  ZOOM_BASE, ZOOM_MIN, ZOOM_MAX, CAM_LOOKAHEAD, CAM_LERP, PLAYER, WANTED, ECON, PEDS,
  GARAGE, ACHIEVEMENTS, RADIO,
} from './config.js';
import { RNG, resetIds } from './rng.js';
import { clamp, damp, dist, money } from './util.js';
import { Input } from './input.js';
import { FX } from './fx.js';
import { World } from './world.js';
import { Player } from './player.js';
import { collideCars, Car } from './cars.js';
import { Traffic } from './traffic.js';
import { Peds } from './peds.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { Render } from './render.js';
import { HUD } from './hud.js';
import { Screens } from './screens.js';
import { AudioSys } from './audio.js';

const SEED_SALTS = { world: 0x1, peds: 0x9e37, cops: 0x51ed, car: 0x270b, mission: 0x1194 };

export class Game {
  constructor(canvas, params) {
    params = params || {};
    this.canvas = canvas;
    this.params = params;
    this.fpsMode = !!params.fps;
    this._fpsEma = 60;

    this.seed = params.seed != null ? params.seed : DEFAULT_SEED;
    this.state = 'title';
    this.time = 0;             // game clock (s)
    this.realT = 0;            // animation clock (s)
    this.wastedT = 0;
    this.lastFee = 0;
    this.godMode = false;
    this.bustImmune = false;
    this.radio = 0;
    this.garageCd = 0;
    this.mapOpen = false;
    this.hintQueue = [];
    this.stats = {
      distance: 0, pedsHarmed: 0, carsWrecked: 0, maxStars: 0,
      jacked: 0, missionsPassed: 0, earned: 0,
    };
    this.achievements = new Set();

    this.input = new Input(canvas);
    this.audio = new AudioSys(this, !!params.mute);
    this.fx = new FX(this);

    // subsystems built per-world (setupWorld)
    this.world = null;
    this.player = null;
    this.cars = [];
    this.bullets = [];
    this.pickups = [];
    this.traffic = null;
    this.peds = null;
    this.police = null;
    this.missions = null;

    this.hud = new HUD(this);
    this.screens = new Screens(this);
    this.render = new Render(this, canvas);

    this.cam = { x: 500, y: 500, z: 1 };
    this.events = { gunshots: [], explosions: [] };
    this.shot = null; // attached by main.js when ?shot= is present

    // Title backdrop world so the menu is alive from frame one.
    this.setupWorld(this.seed, true);
  }

  // ------------------------------------------------------------------ setup
  setupWorld(seed, titleMode) {
    resetIds(seed);
    this.seed = seed;
    this.world = new World(seed);
    this.rngWorld = new RNG((seed ^ SEED_SALTS.world) >>> 0);
    this.rngPeds = new RNG((seed ^ SEED_SALTS.peds) >>> 0);
    this.rngCops = new RNG((seed ^ SEED_SALTS.cops) >>> 0);
    this.rngCar = new RNG((seed ^ SEED_SALTS.car) >>> 0);
    this.rngMission = new RNG((seed ^ SEED_SALTS.mission) >>> 0);

    const spawn = titleMode ? { x: 528, y: 492 } : { x: 528, y: 492 };
    this.player = new Player(this, spawn.x, spawn.y);
    this.cars = [];
    this.bullets = [];
    this.pickups = [];
    this.traffic = new Traffic(this);
    this.peds = new Peds(this);
    this.police = new Police(this);
    this.missions = new Missions(this);
    this.fx = new FX(this);
    this.time = titleMode ? 0 : 0;

    this.placePickups();
    this.spawnParkedCars();
    this.traffic.spawnInitial(14);
    this.peds.spawnInitial(26);

    // Debug/QA hooks: ?weather=storm&spawn=club
    const dp = this.params || {};
    if (dp.weather) {
      if (dp.weather === 'storm') this.world.weather = { id: 'storm', fog: 0.12, wet: 1.7 };
      else if (dp.weather === 'clear') this.world.weather = { id: 'clear', fog: 0, wet: 1 };
      else if (dp.weather === 'humid') this.world.weather = { id: 'humid', fog: 0.16, wet: 1.15 };
      else if (dp.weather === 'sea-fog') this.world.weather = { id: 'sea-fog', fog: 0.3, wet: 0.8 };
    }
    if (dp.spawn && this.world.locations[dp.spawn]) {
      const sp = this.world.locations[dp.spawn];
      this.player.x = sp.x;
      this.player.y = sp.y + 4;
      this.cam.x = sp.x; this.cam.y = sp.y;
    }

    // Camera snap.
    this.cam.x = spawn.x;
    this.cam.y = spawn.y;
    this.cam.z = 1;
  }

  placePickups() {
    const L = this.world.locations;
    const put = (name, kind, dx = 0, dy = 0) => {
      const loc = L[name];
      this.pickups.push({ x: loc.x + dx, y: loc.y + dy, kind });
    };
    put('hospital', 'health', 3, 3);
    put('beachShack', 'health', -4, 2);
    put('policeSt', 'armor', 4, 3);
    put('docksGate', 'armor', -5, 2);
    put('club', 'ammo', 4, 2);
    put('market', 'ammo', -4, 3);
    put('plaza', 'cash', 5, -3);
    put('pier1', 'cash', 3, 2);
    put('hangar', 'cash', 5, 3);
    put('mansion', 'cash', -5, 2);
    put('taxiDepot', 'health', 3, -3);
    put('hotel', 'cash', 4, -3);
    put('garage', 'ammo', 3, -3);
    put('crane', 'armor', 2, 3);
    // A scatter of wild pickups on sidewalks.
    for (let k = 0; k < 8; k++) {
      const pt = this.world.randomSidewalkPoint(this.rngMission, 600, 500, 0, 700);
      if (!pt) continue;
      const kinds = ['health', 'armor', 'cash', 'ammo'];
      this.pickups.push({ x: pt.x, y: pt.y, kind: this.rngMission.pick(kinds) });
    }
  }

  // ------------------------------------------------------------------- loop
  start() {
    let last = performance.now();
    const tick = (ts) => {
      const dt = Math.min(MAX_FRAME, (ts - last) / 1000);
      last = ts;
      this.tickOnce(dt, ts);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // Watchdog: headless capture windows throttle requestAnimationFrame to
    // zero when the page is idle; keep the night alive with manual pumps.
    this._watchdog = setInterval(() => {
      if (performance.now() - last > 200) {
        last = performance.now();
        this.tickOnce(DT * 4, last);
      }
    }, 120);
  }

  stop() {
    if (this._watchdog) clearInterval(this._watchdog);
  }

  // One frame: fixed-step simulation + render + overlays + input flush.
  tickOnce(dt, ts) {
    this.realT += dt;
    if (dt > 0.0001) this._fpsEma = this._fpsEma * 0.95 + (1 / dt) * 0.05;
    let acc = this._acc || 0;
    acc += dt;
    let ticks = 0;
    while (acc >= DT && ticks < 5) {
      this.update(DT);
      acc -= DT;
      ticks++;
    }
    if (ticks >= 5) acc = 0;
    this._acc = acc;
    if (this.shot) this.shot.frameUpdate(dt);
    this.handleFrameInput();
    this.render.render(this.realT, dt);
    this.drawOverlays();
    this.input.endFrame();
    if (this._first === undefined) {
      this._first = false;
      const boot = document.getElementById('boot');
      if (boot) boot.classList.add('gone');
      if (this.onFirstFrame) this.onFirstFrame();
    }
  }

  handleFrameInput() {
    const inp = this.input;
    if (this.state === 'playing') {
      if (inp.wasPressed('Escape')) this.togglePause();
      if (inp.wasPressed('KeyM')) { this.audio.setMuted(!this.audio.muted); this.hud.toast(this.audio.muted ? 'AUDIO OFF' : 'AUDIO ON'); }
      if (inp.wasPressed('Tab')) this.mapOpen = !this.mapOpen;
    } else if (this.state === 'paused') {
      if (inp.wasPressed('Escape')) this.togglePause();
    }
    this.screens.update(1 / 60);
    // Audio unlock on first gesture (never when muted by URL).
    if (!this.audio.muted && this.input.gesture) this.audio.ensure();
  }

  update(dt) {
    const st = this.state;
    if (st === 'title') {
      this.updateTitle(dt);
    } else if (st === 'playing') {
      this.updatePlaying(dt);
    } else if (st === 'paused') {
      this.audio.update(dt);
    } else if (st === 'wasted' || st === 'busted') {
      this.wastedT += dt;
      this.fx.update(dt);
      this.audio.update(dt);
    } else if (st === 'end') {
      this.time += dt * 0.2;
      this.updateEndPan(dt);
      this.fx.update(dt);
      this.audio.update(dt);
    }
  }

  // Title: a slow pan across the neon city with live traffic underneath.
  updateTitle(dt) {
    this.time += dt * 0.2;
    const t = this.realT * 0.05;
    const ax = 624 + Math.cos(t * 0.7) * 330;
    const ay = 480 + Math.sin(t * 0.5) * 260;
    // Keep spawns near the drifting camera anchor.
    this.player.x = ax; this.player.y = ay;
    this.cam.x = damp(this.cam.x, ax, 2, dt);
    this.cam.y = damp(this.cam.y, ay, 2, dt);
    this.cam.z = damp(this.cam.z, 0.9, 2, dt);

    for (const c of this.cars) if (!c.remove && c.driver === 'ai') this.civDrive(c, dt);
    for (const c of this.cars) c.update(dt, this.world);
    collideCars(this.cars, this.fx);
    this.traffic.update(dt);
    this.peds.update(dt);
    this.fx.update(dt);
    this.audio.update(dt);
    this.pruneCars();
  }

  updateEndPan(dt) {
    const t = this.realT * 0.03;
    const ax = 1100 + Math.cos(t) * 120;
    const ay = 140 + Math.sin(t * 0.8) * 80;
    this.player.x = ax; this.player.y = ay;
    this.cam.x = damp(this.cam.x, ax, 2, dt);
    this.cam.y = damp(this.cam.y, ay, 2, dt);
    this.cam.z = damp(this.cam.z, 0.95, 2, dt);
    for (const c of this.cars) if (!c.remove && c.driver === 'ai') this.civDrive(c, dt);
    for (const c of this.cars) c.update(dt, this.world);
    this.traffic.update(dt);
    this.peds.update(dt);
  }

  // Civilian input for cars during title/end pans (no player target).
  civDrive(car, dt) {
    if (!car.ai) { car.throttle = 0; car.brake = 1; return; }
    const ai = car.ai;
    const dvx = [1, 0, -1, 0][ai.dir], dvy = [0, 1, 0, -1][ai.dir];
    const vertical = ai.dir === 1 || ai.dir === 3;
    const tx = vertical ? ai.laneCoord : car.x + dvx * 11;
    const ty = vertical ? car.y + dvy * 11 : ai.laneCoord;
    const desired = Math.atan2(ty - car.y, tx - car.x);
    let diff = (desired - car.angle) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    car.steer = clamp(diff * 2.4, -1, 1);
    const vf = car.forwardSpeed();
    const cruise = ai.cruise;
    if (vf > cruise + 2) { car.throttle = 0; car.brake = 1; }
    else { car.throttle = clamp((cruise - vf) * 0.55, 0, 1); car.brake = 0; }
  }

  updatePlaying(dt) {
    const g = this;
    g.time += dt;

    // 1. Mission AI inputs.
    g.missions.updateMissionCars(dt);

    // 2. Player.
    g.player.update(dt);

    // 3. Gunshot panic ripples out.
    for (const gs of g.events.gunshots) {
      g.peds.panic(gs.x, gs.y, PEDS.PANIC_RADIUS);
      g.traffic.panic(gs.x, gs.y, 26);
    }

    // 4. Police + traffic AI.
    g.police.update(dt);
    g.traffic.update(dt);

    // 5. Vehicle physics (all cars) + pairwise collisions.
    for (const c of g.cars) if (!c.remove) c.update(dt, g.world);
    collideCars(g.cars, g.fx);
    if (g.player.inCar) g.stats.distance += g.player.inCar.speed() * dt;
    g.garageService(dt);
    if (g.player.inCar && g.player.inCar.speed() * 3.6 >= 120) this.achieve('speed-120');

    // 6. Bullets.
    this.updateBullets(dt);

    // 7. Peds.
    g.peds.update(dt);

    // 8. Missions.
    g.missions.update(dt);

    // 9. Hints.
    while (this.hintQueue.length && g.time >= this.hintQueue[0].at) {
      const h = this.hintQueue.shift();
      g.hud.toast(h.msg);
    }

    // 9. Effects, pickups respawn, camera, audio.
    g.fx.update(dt);
    this.updateCamera(dt);
    g.hud.update(dt);
    g.audio.update(dt);

    // 10. Frame events are consumed.
    g.events.gunshots.length = 0;

    this.pruneCars();
  }

  // Parked cars from the world's curb spots & lots — free carjack fodder.
  spawnParkedCars() {
    for (const spot of this.world.parkingSpots) {
      if (!this.rngCar.chance(0.55)) continue;
      const type = this.rngCar.pick(['sedan', 'muscle', 'pickup', 'van', 'sport', 'taxi', 'sedan']);
      const car = new Car(this, type, spot.x, spot.y, spot.angle);
      car.driver = null;
      this.cars.push(car);
    }
  }

  // The garage on the west side: repair + respray + cool the heat, for a fee.
  garageService(dt) {
    if (this.garageCd > 0) this.garageCd -= dt;
    const car = this.player.inCar;
    if (!car || car.wrecked) return;
    const loc = this.world.locations.garage;
    if (dist(car.x, car.y, loc.x, loc.y) > GARAGE.RADIUS) return;
    const needsHelp = car.health < 99 || this.police.stars() > 0;
    if (!needsHelp || this.garageCd > 0) return;
    if (this.player.money < GARAGE.FEE) {
      if (!this._garageBroke || this.garageCd <= 0) {
        this._garageBroke = true;
        this.hud.toast('GARAGE: REPAIR IS ' + money(GARAGE.FEE) + ' — COME BACK RICHER');
        this.garageCd = 4;
      }
      return;
    }
    this._garageBroke = false;
    this.player.money -= GARAGE.FEE;
    this.fx.text(car.x, car.y - 3, '-' + money(GARAGE.FEE).slice(1), '#ff7d7d');
    car.health = 100;
    car.burning = false;
    car.dents = [];
    this.police.clear();
    this.garageCd = GARAGE.COOLDOWN;
    this.hud.toast('RESPRAYED & REPAIRED — HEAT GONE');
    this.audio.pickup();
  }

  achieve(id) {
    if (this.achievements.has(id)) return;
    for (const a of ACHIEVEMENTS) {
      if (a.id === id) {
        this.achievements.add(id);
        this.hud.toast(a.text);
        this.audio.pickup();
      }
    }
  }

  pruneCars() {
    for (let i = this.cars.length - 1; i >= 0; i--) {
      if (this.cars[i].remove) this.cars.splice(i, 1);
    }
  }

  updateBullets(dt) {
    const g = this;
    for (let bi = g.bullets.length - 1; bi >= 0; bi--) {
      const b = g.bullets[bi];
      b.life -= dt;
      if (b.life <= 0) { g.bullets.splice(bi, 1); continue; }
      const steps = 2;
      let dead = false;
      for (let s = 0; s < steps && !dead; s++) {
        b.x += b.vx * dt / steps;
        b.y += b.vy * dt / steps;
        // World solids stop bullets.
        if (g.world.blockedAt(b.x, b.y)) {
          g.fx.spark(b.x, b.y, 3);
          dead = true;
          break;
        }
        // Peds
        if (b.fromPlayer) {
          for (const p of g.peds.list) {
            if (p.dead) continue;
            if (dist(b.x, b.y, p.x, p.y) < 0.65) {
              p.hurt(PLAYER.PISTOL_DMG_PED, 'shot');
              g.fx.bloodBurst(b.x, b.y, 4);
              dead = true;
              break;
            }
          }
          if (!dead) {
            for (const cop of g.police.foot) {
              if (cop.dead) continue;
              if (dist(b.x, b.y, cop.x, cop.y) < 0.7) {
                cop.hurt(26, 'shot');
                g.fx.bloodBurst(b.x, b.y, 4);
                dead = true;
                break;
              }
            }
          }
        } else {
          const p = g.player;
          if (!p.inCar && dist(b.x, b.y, p.x, p.y) < 0.7) {
            p.damage(b.dmg, 'shot');
            dead = true;
            break;
          }
          if (p.inCar && dist(b.x, b.y, p.inCar.x, p.inCar.y) < p.inCar.radius) {
            p.inCar.damage(b.dmg * 0.7, 'bullet');
            g.fx.spark(b.x, b.y, 2);
            dead = true;
            break;
          }
        }
        // Cars
        if (!dead) {
          for (const car of g.cars) {
            if (car.remove) continue;
            if (b.fromPlayer && car === g.player.inCar) continue;
            if (dist(b.x, b.y, car.x, car.y) < car.radius * 0.95) {
              if (b.fromPlayer) {
                car.lastHitByPlayerT = g.time;
                car.applyBullet(b.x, b.y, PLAYER.PISTOL_DMG_CAR);
              } else {
                car.damage(b.dmg * 0.5, 'bullet');
                g.fx.spark(b.x, b.y, 2);
              }
              dead = true;
              break;
            }
          }
        }
      }
      if (dead) g.bullets.splice(bi, 1);
    }
  }

  updateCamera(dt) {
    const p = this.player;
    const car = p.inCar;
    let tx, ty, tz;
    if (car) {
      tx = car.x + car.vx * CAM_LOOKAHEAD;
      ty = car.y + car.vy * CAM_LOOKAHEAD;
      const sp = car.speed();
      tz = ZOOM_MIN + (1 - clamp(sp / (car.spec.top * 1.1), 0, 1)) * (ZOOM_MAX - ZOOM_MIN);
    } else {
      tx = p.x + (p.aim.x - p.x) * 0.06;
      ty = p.y + (p.aim.y - p.y) * 0.06;
      tz = ZOOM_MAX;
    }
    this.cam.x = damp(this.cam.x, tx, CAM_LERP, dt);
    this.cam.y = damp(this.cam.y, ty, CAM_LERP, dt);
    this.cam.z = damp(this.cam.z, tz, 2.4, dt);
    // Soft clamp inside the world.
    const halfW = VIEW_W / 2 / (this.cam.z * 7.2);
    const halfH = VIEW_H / 2 / (this.cam.z * 7.2);
    this.cam.x = clamp(this.cam.x, WORLD_X0 + halfW * 0.5, WORLD_X1 - halfW * 0.5);
    this.cam.y = clamp(this.cam.y, WORLD_Y0 + halfH * 0.5, WORLD_Y1 - halfH * 0.5);
  }

  // -------------------------------------------------------------- overlays
  drawOverlays() {
    const ctx = this.render.ctx;
    const st = this.state;
    if (st === 'playing' || st === 'paused') {
      this.hud.draw(ctx);
      this.hud.drawVehicleBanner(ctx);
      this.screens.drawPassedBanner(ctx);
    }
    if (st === 'playing' && this.mapOpen) this.screens.drawCityMap(ctx);
    if (st === 'title') this.screens.drawTitle(ctx, this.realT);
    else if (st === 'paused') this.screens.drawPaused(ctx);
    else if (st === 'wasted') this.screens.drawWasted(ctx);
    else if (st === 'busted') this.screens.drawBusted(ctx);
    else if (st === 'end') this.screens.drawEnd(ctx, this.realT);
  }

  // ----------------------------------------------------------- state changes
  startNewGame() {
    const seed = (Date.now() % 1000000000) >>> 0;
    this.setupWorld(seed, false);
    this.state = 'playing';
    this.mapOpen = false;
    this.audio.ensure();
    this.audio.startMusic();
    this.hud.toast('WELCOME TO VICE PALMS');
    this.missions.sub('Rico is back in Vice Palms. The blue marker has work for you.', 5);
    this.hintQueue = [
      { at: this.time + 3, msg: 'WASD / STICK — MOVE · SHIFT — SPRINT' },
      { at: this.time + 9, msg: 'F — ENTER / JACK A CAR · SPACE — HANDBRAKE' },
      { at: this.time + 15, msg: 'CLICK — FIRE · 1/2 — WEAPONS · TAB — CITY MAP' },
      { at: this.time + 21, msg: 'THE GARAGE FIXES CARS AND COOLS HEAT — FOR A PRICE' },
    ];
  }

  continueGame() {
    const save = this.screens.readSave();
    if (!save) { this.hud.toast('NO SAVE FOUND'); return; }
    this.setupWorld(save.seed, false);
    const p = this.player;
    p.money = save.money;
    p.hp = save.hp;
    p.armor = save.armor;
    p.pistolAmmo = save.ammo;
    p.x = save.x; p.y = save.y;
    this.time = save.time || 0;
    this.missions.storyIdx = save.storyIdx || 0;
    this.radio = save.radio || 0;
    if (save.stats) Object.assign(this.stats, save.stats);
    if (Array.isArray(save.achievements)) this.achievements = new Set(save.achievements);
    this.hintQueue = [];
    this.state = 'playing';
    this.audio.ensure();
    this.audio.startMusic();
    this.hud.toast('SAVE LOADED');
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.screens.menuIdx = 0;
    } else if (this.state === 'paused') {
      this.state = 'playing';
    }
  }

  quitToTitle() {
    this.state = 'title';
    this.screens.menuIdx = 0;
    this.screens.confirmDelete = false;
    this.police.clear();
  }

  saveGame(auto) {
    this.screens.saveCurrent();
  }

  // ------------------------------------------------------------- consequences
  onViolence(x, y, heatN) {
    // Shots fired near the VCPD are heat; near civilians they are panic.
    for (const c of this.police.cruisers) {
      if (!c.remove && dist(c.x, c.y, x, y) < 55) { this.police.addHeat(heatN); return; }
    }
    for (const f of this.police.foot) {
      if (!f.remove && !f.dead && dist(f.x, f.y, x, y) < 40) { this.police.addHeat(heatN); return; }
    }
  }

  onPedKilled(ped, cause) {
    if (this.state !== 'playing') return;
    this.police.addHeat(1.0);
    this.stats.pedsHarmed++;
    this.hud.toast('WANTED — A CIVILIAN IS DOWN');
    if (this.rngWorld.chance(0.3)) {
      this.pickups.push({ x: ped.x, y: ped.y, kind: 'cash' });
    }
  }

  onCopKilled(cop) {
    this.police.addHeat(1.5);
    this.stats.carsWrecked += 0; // counting below in explosions; cop kills raise heat only
    this.hud.toast('WANTED — OFFICER DOWN');
    if (this.rngCops.chance(0.45)) {
      this.pickups.push({ x: cop.x, y: cop.y, kind: 'ammo' });
    }
    if (this.rngCops.chance(0.3)) {
      this.pickups.push({ x: cop.x + 1.2, y: cop.y, kind: 'cash' });
    }
  }

  onCarjack(car, hadDriver, wasCop) {
    if (this.state !== 'playing') return;
    this.hud.vehicleBanner(car.spec.name);
    if (hadDriver) {
      this.stats.jacked++;
      this.achieve('first-car');
    }
    if (wasCop) {
      this.hud.toast('YOU STOLE A POLICE CAR');
      return; // heat already added by copEjected
    }
    if (!hadDriver) return; // empty car, no crime
    // Witnessed?
    let seen = false;
    for (const p of this.peds.list) {
      if (!p.dead && dist(p.x, p.y, car.x, car.y) < 28) { seen = true; break; }
    }
    if (!seen) {
      for (const c of this.police.cruisers) {
        if (!c.remove && dist(c.x, c.y, car.x, car.y) < 60) { seen = true; break; }
      }
    }
    if (seen) {
      this.police.addHeat(1.0);
      this.hud.toast('GRAND THEFT AUTO — WITNESSED');
    }
  }

  onPlayerBump(other, impact) {
    if (other.cop && impact > 10) this.police.addHeat(0.35);
  }

  onStarUp(stars) {
    if (stars === 1) this.hud.toast('WANTED — THE VCPD IS COMING');
    else this.hud.toast('WANTED LEVEL ' + stars);
    this.audio.sirenBlip();
    this.stats.maxStars = Math.max(this.stats.maxStars, stars);
    this.achieve('first-star');
  }

  onExplosion(x, y, car) {
    // Radius damage to everything near.
    const R = 10;
    this.achieve('first-boom');
    const playerHurt = (d) => 80 * (1 - d / R);
    for (const c of this.cars) {
      if (c.remove || c.wrecked || c === car) continue;
      const d = dist(c.x, c.y, x, y);
      if (d < R) c.damage(120 * (1 - d / R), 'explosion');
    }
    for (const p of this.peds.list) {
      if (p.dead) continue;
      const d = dist(p.x, p.y, x, y);
      if (d < R) p.die('explosion');
    }
    for (const f of this.police.foot) {
      if (f.dead) continue;
      const d = dist(f.x, f.y, x, y);
      if (d < R) f.hurt(90, 'explosion');
    }
    const p = this.player;
    const pd = dist(p.x, p.y, x, y);
    if (pd < R && !p.dead) p.damage(playerHurt(pd), 'explosion');
    this.peds.panic(x, y, 55);
    this.traffic.panic(x, y, 45);
    // Blame the player when their bullets lit the fuse.
    if (car && car.lastHitByPlayerT && this.time - car.lastHitByPlayerT < 6) {
      this.stats.carsWrecked++;
      this.police.addHeat(1.5);
    }
  }

  // -------------------------------------------------------------- wasted etc.
  wasted() {
    if (this.state !== 'playing') return;
    this.state = 'wasted';
    this.wastedT = 0;
    this.mapOpen = false;
    this.lastFee = WANTED.FEE_WASTED + this.police.stars() * 80 + ECON.HOSPITAL_FEE;
    this.missions.fail('WASTED');
    this.missions.sub('You wake up lighter in the wallet. Rico hates funerals.', 3.4, '');
    this.audio.fail();
  }

  busted() {
    if (this.state !== 'playing') return;
    this.state = 'busted';
    this.wastedT = 0;
    this.mapOpen = false;
    this.lastFee = WANTED.FEE_BUSTED + this.police.stars() * 60;
    this.missions.fail('BUSTED');
    this.missions.sub('Unit 12: suspect secured. Book him — and tow the car.', 3.4, '');
    this.audio.fail();
  }

  respawnNow() {
    const p = this.player;
    p.money = Math.max(0, p.money - this.lastFee);
    this.hud.toast('FEE PAID — ' + money(this.lastFee));
    p.hp = PLAYER.HP_MAX;
    p.armor = 0;
    p.dead = false;
    p.hurtT = 1.2;
    if (p.inCar) p.exitCar(false);
    const loc = this.state === 'busted'
      ? this.world.locations.policeSt
      : this.world.locations.hospital;
    p.x = loc.x; p.y = loc.y + 4;
    this.police.clear();
    this.bullets.length = 0;
    this.state = 'playing';
    this.cam.x = p.x; this.cam.y = p.y;
  }

  finishGame() {
    this.state = 'end';
  }
}
