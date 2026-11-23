// game.js — the state machine: title / play / pause / wasted / busted, the
// fixed-timestep simulation, camera, bullets, effects, decals, pickups, and
// the glue between every subsystem.

import { CFG } from './config.js';
import { World, G } from './world.js';
import { Car, CAR_SPECS, POLICE_SPEC } from './cars.js';
import { Peds } from './peds.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { Player } from './player.js';
import { Missions } from './missions.js';
import { seedBoats } from './boats.js';
import { Renderer } from './render.js';
import { Hud } from './hud.js';
import { AudioEngine } from './audio.js';
import { Weather } from './weather.js';
import { Radio } from './radio.js';
import { Helicopter } from './helicopter.js';
import { Tokens } from './tokens.js';
import { MapScreen } from './mapscreen.js';
import { Barks } from './barks.js';
import { Stats } from './stats.js';
import { Pigeons } from './pigeons.js';
import { Gunshops } from './gunshops.js';
import { Delivery } from './delivery.js';
import {
  drawTitle, drawPause, drawWasted, drawBusted,
  updateMenu, activateMenuItem, pauseAction, PAUSE_ITEMS,
  writeSave, hasSave,
} from './screens.js';
import { clamp, dist, damp, TAU } from './util.js';
import { RNG, mixSeeds } from './rng.js';

const STEP = 1 / 60;
const PAUSE_LEN = 5; // resume / save / sound / delete / title

// cheat phrases, decoded from the letter buffer
const CHEATS = [
  { code: 'VICEPALMS', run(g) { g.player.money += 5000; g.stats.addMoney(5000); g.hud.subtitle('Cheat: a fat stack of Benjamins. +$5,000', 3); } },
  { code: 'HEATOFF', run(g) { g.police.clear(); g.hud.subtitle('Cheat: the heat is off.', 3); } },
  { code: 'ARMORUP', run(g) { g.player.giveArmor(100); g.hud.subtitle('Cheat: full body armor.', 3); } },
  { code: 'MEDICMAN', run(g) { g.player.giveHealth(100); g.hud.subtitle('Cheat: patched right up.', 3); } },
];

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = 'boot';      // boot | title | play | pause | wasted | busted | over
    this.time = 0;
    this.frame = 0;
    this.seed = 19870614;

    this.cam = { x: 0, y: 0, shake: 0, zoom: 1 };
    this.viewW = 1280;
    this.viewH = 720;
    this.viewScale = 1;

    this.input = null;        // wired by main.js
    this.audio = new AudioEngine();
    this.renderer = new Renderer(this);
    this.hud = new Hud(this);
    this.stats = new Stats();
    this.radio = new Radio(this);
    this.mapscreen = new MapScreen(this);
    this.weather = null;      // built per session (needs the world)
    this.tokens = null;
    this.barks = null;
    this.heli = null;
    this.attractMode = false;
    this.cheatBuf = '';
    this.sprayT = 0;

    this.missions = new Missions(this);
    this.police = new Police(this);
    this.player = new Player(0, 0);
    this.peds = new Peds(this);
    this.traffic = new Traffic(this);

    this.world = null;
    this.cars = [];
    this.boats = [];
    this.bullets = [];
    this.effects = [];
    this.decals = [];
    this.flash = 0;
    this.wastedT = 0;
    this.wastedMode = 'wasted';
    this.menuIndex = 0;
    this.showControls = false;
    this.howToOpen = false;
    this.shotMode = null;
    this.pendingSteps = 0;
    this.pickups = [];
    this.pickupT = 0;

    this.rngTraffic = new RNG(mixSeeds(this.seed, 0xCA55));
    this.rngPolice = new RNG(mixSeeds(this.seed, 0xC0FE));
    this.rngFx = new RNG(mixSeeds(this.seed, 0xF00D));

    this.acc = 0;
    this.gameOverT = 0;
  }

  // -------------------------------------------------------------- helpers

  viewX() { return this.player.car ? this.player.car.x : this.player.x; }
  viewY() { return this.player.car ? this.player.car.y : this.player.y; }
  CarClass() { return Car; }

  /** Explosion entry point: damage everything nearby and dress the scene. */
  boom(x, y, sourceCar) {
    this.effects.push({ type: 'boom', x, y, t: 0, dur: 0.9 });
    this.flash = Math.min(1, this.flash + 0.5);
    this.cam.shake = Math.min(14, this.cam.shake + 9);
    this.audio.explosion();
    this.decals.push({ type: 'scorch', x, y, r: 34, alpha: 1 });
    if (this.decals.length > 60) this.decals.shift();
    // damage cars
    for (const c of this.cars) {
      if (c === sourceCar || c.dead) continue;
      const d = dist(c.x, c.y, x, y);
      if (d < CFG.BOOM_RADIUS) {
        c.damageSilent(CFG.BOOM_DMG * (1 - d / CFG.BOOM_RADIUS), 'explosion', sourceCar);
      }
    }
    // peds
    this.peds.explosionAt(x, y);
    // foot cops
    for (const cop of this.police.cops) {
      if (cop.state === 'dead') continue;
      if (dist(cop.x, cop.y, x, y) < CFG.BOOM_RADIUS) {
        this.police.damageCop(cop, 200, this);
      }
    }
    // player
    const p = this.player;
    if (!p.inCar) {
      const d = dist(p.x, p.y, x, y);
      if (d < CFG.BOOM_RADIUS) p.damage(CFG.BOOM_DMG * (1 - d / CFG.BOOM_RADIUS) * 0.8, this, 'explosion');
    }
    // heat for chaos in the street
    if (sourceCar && sourceCar.lastHitBy === 'player') {
      this.police.crime(CFG.HEAT_BOOM, x, y);
    }
  }

  /** A civilian bails out of a jacked or exploding car. */
  spawnBailPed(x, y, isCop) {
    // reuse a nearby hidden ped or spawn one
    const ped = this.peds.near(x, y, 400);
    if (ped) {
      ped.x = x;
      ped.y = y;
      ped.panic(x + 10, y + 10);
      return ped;
    }
    void isCop;
    return null;
  }

  /** Fired by cars.js when a car explodes to trigger driver bail-outs. */
  onCarExploded(car) {
    if (car.missionTag === 'gang' || car.missionTag === 'vigilante' || car.missionTag === 'escape') {
      // mission target cars pop a big payout flash when destroyed
      if (this.missions.current) {
        this.hud.big('TARGET DOWN', 1.4, '#7dff8a');
      }
      return;
    }
    if (car.driver === 'cop') {
      this.police.crime(CFG.HEAT_COP, car.x, car.y);
    }
  }

  onPlayerDead(cause) {
    this.state = 'wasted';
    this.wastedT = 0;
    this.wastedMode = 'wasted';
    this.audio.wasted();
    this.audio.silenceAll();
    this.missions.failActive();
    void cause;
  }

  onPlayerBusted() {
    if (this.state !== 'play') return;
    this.state = 'busted';
    this.wastedT = 0;
    this.wastedMode = 'busted';
    this.audio.fail();
    this.audio.silenceAll();
    this.missions.failActive();
  }

  // ------------------------------------------------------------ lifecycle

  startNewGame(seed) {
    this.seed = seed === undefined ? 19870614 + (Math.floor(Math.random() * 1000)) : seed;
    this.rngTraffic.reseed(mixSeeds(this.seed, 0xCA55));
    this.rngPolice.reseed(mixSeeds(this.seed, 0xC0FE));
    this.rngFx.reseed(mixSeeds(this.seed, 0xF00D));
    this.buildSession();
    const start = this.world.spawns.start;
    this.player = new Player(start.x, start.y);
    this.player.money = 0;
    this.player.ammo = CFG.AMMO_START;
    this.stats.reset();
    this.attractMode = false;
    this.state = 'play';
    this.time = 0;
    this.cam.x = start.x;
    this.cam.y = start.y;
    this.hud.subtitle('Welcome back to Vice Palms. Find the yellow marker.', 4);
  }

  continueGame() {
    const save = JSON.parse(localStorage.getItem('vicepalms_save_v1') || 'null');
    if (!save) return this.startNewGame();
    this.seed = save.seed || 19870614;
    this.buildSession();
    this.player = new Player(save.x, save.y);
    this.player.money = save.money || 0;
    this.player.health = save.health ?? CFG.PLAYER_HP;
    this.player.armor = save.armor || 0;
    this.player.ammo = save.ammo || 0;
    this.player.weapon = save.weapon || 0;
    this.missions.storyIndex = save.storyIndex || 0;
    this.missions.sideDone = save.sideDone || {};
    this.police.heat = save.heat || 0;
    this.police.updateStars();
    if (this.tokens && save.tokens) this.tokens.restore(save.tokens);
    this.stats.reset();
    this.attractMode = false;
    this.state = 'play';
    this.time = 0;
    this.cam.x = save.x;
    this.cam.y = save.y;
    this.hud.subtitle(`Save loaded — ${save.place || 'Vice Palms'}.`, 3);
  }

  buildSession() {
    this.world = new World(this.seed).build();
    this.cars = [];
    this.boats = [];
    this.bullets = [];
    this.effects = [];
    this.decals = [];
    this.pickups = [];
    this.spikes = [];
    this.flash = 0;
    this.cam.shake = 0;
    this.police = new Police(this);
    this.peds = new Peds(this);
    this.traffic = new Traffic(this);
    this.weather = new Weather(this, this.seed);
    this.tokens = new Tokens(this);
    this.barks = new Barks(this);
    this.pigeons = new Pigeons(this);
    this.gunshops = new Gunshops(this);
    this.delivery = new Delivery(this);
    this.heli = null;
    this.missions.settleMarkers();
    this.delivery.settle();
    const start = this.world.spawns.start;
    this.traffic.populate(start.x, start.y);
    this.peds.populate(start.x, start.y);
    this.seedStreetParked();
    seedBoats(this);
  }

  /** A handful of parked cars near the start so the streets feel lived in. */
  seedStreetParked() {
    const T = CFG.T;
    const spots = [];
    const nearRoad = (x, y) =>
      this.world.isRoadPx(x + T / 2, y) || this.world.isRoadPx(x - T / 2, y) ||
      this.world.isRoadPx(x, y + T / 2) || this.world.isRoadPx(x, y - T / 2);
    for (let i = 0; i < 140 && spots.length < 16; i++) {
      const ang = this.rngFx.angle();
      const d = this.rngFx.range(110, 950);
      const x = clamp(this.world.spawns.start.x + Math.cos(ang) * d, 60, CFG.W - 60);
      const y = clamp(this.world.spawns.start.y + Math.sin(ang) * d, 60, CFG.H - 60);
      const code = this.world.codeAt(x, y);
      if (code !== G.PLAZA && code !== G.SAND) continue;
      if (!nearRoad(x, y)) continue;
      spots.push({ x, y });
    }
    for (const s of spots) {
      const spec = CAR_SPECS[this.rngFx.int(0, CAR_SPECS.length - 1)];
      const car = new Car(spec, s.x, s.y, this.rngFx.angle(), {
        color: spec.colors[this.rngFx.int(0, spec.colors.length - 1)],
        driver: null, parked: true, headlights: false,
      });
      this.cars.push(car);
    }
  }

  autosave() {
    writeSave(this);
  }

  toTitle() {
    this.state = 'title';
    this.menuIndex = 0;
    this.audio.silenceAll();
  }

  respawn(kind) {
    const p = this.player;
    const fee = kind === 'busted' ? CFG.FEE_BUSTED : CFG.FEE_WASTED;
    p.money = Math.max(0, p.money - fee);
    this.stats.addMoney(-fee);
    this.stats.bump(kind === 'busted' ? 'busted' : 'wasted');
    p.health = CFG.PLAYER_HP;
    p.armor = 0;
    p.dead = false;
    p.car = null;
    p.invulT = 2;
    const at = kind === 'busted' ? this.world.spawns.policeStation : this.world.spawns.hospital;
    p.x = at.x;
    p.y = at.y;
    p.ang = 0;
    this.police.clear();
    this.police.cops.length = 0;
    this.bullets.length = 0;
    this.cam.x = p.x;
    this.cam.y = p.y;
    this.state = 'play';
    this.hud.subtitle(kind === 'busted'
      ? `Released from the VCPD. Bail cost ${fee} bucks.`
      : `Patched up at Mercy General. That cost ${fee} bucks.`, 4);
  }

  // ---------------------------------------------------------------- input

  handleScreens() {
    const input = this.input;
    if (this.state === 'title') {
      const items = updateMenu(this);
      if (input.pressed('KeyH')) this.howToOpen = !this.howToOpen;
      if (input.pressed('Escape') && this.howToOpen) this.howToOpen = false;
      if (this.howToOpen) return true;
      if (input.pressed('ArrowUp') || input.pressed('KeyW')) {
        this.menuIndex = (this.menuIndex + items.length - 1) % items.length;
      }
      if (input.pressed('ArrowDown') || input.pressed('KeyS')) {
        this.menuIndex = (this.menuIndex + 1) % items.length;
      }
      if (input.pressed('Enter') || input.pressed('Space') || input.mouse.clicked) {
        activateMenuItem(this);
      }
      return true;
    }
    if (this.state === 'pause') {
      if (input.pressed('Escape')) {
        this.state = 'play';
        return true;
      }
      if (input.pressed('ArrowUp') || input.pressed('KeyW')) this.menuIndex = (this.menuIndex + PAUSE_LEN - 1) % PAUSE_LEN;
      if (input.pressed('ArrowDown') || input.pressed('KeyS')) this.menuIndex = (this.menuIndex + 1) % PAUSE_LEN;
      if (input.pressed('Enter')) {
        pauseAction(this, PAUSE_ITEMS[this.menuIndex]);
      }
      return true;
    }
    if (this.state === 'play') {
      if (input.pressed('Escape')) {
        this.state = 'pause';
        this.menuIndex = 0;
        return true;
      }
      if (input.pressed('KeyM')) this.mapscreen.toggle();
      // camera zoom presets and photo mode
      if (input.pressed('KeyV')) {
        this.cam.zoom = this.cam.zoom > 0.9 ? 0.78 : this.cam.zoom > 0.7 ? 1.22 : 1.0;
        this.hud.subtitle(`Camera: ${this.cam.zoom > 1 ? 'close' : this.cam.zoom < 0.9 ? 'wide' : 'normal'}`, 1.5);
      }
      if (input.pressed('KeyP')) {
        this.photoMode = !this.photoMode;
        this.hud.subtitle(this.photoMode ? 'Photo mode — HUD hidden (P to restore)' : 'HUD restored.', 1.8);
      }
      if (input.pressed('KeyF')) this.showFps = !this.showFps;
      // radio
      if (input.pressed('KeyR')) {
        if (input.key('ShiftLeft') || input.key('ShiftRight')) this.radio.prev();
        else this.radio.next();
      }
      // cheat phrase buffer (letters only, rolling window)
      const m = /^Key([A-Z])$/.exec('');
      void m;
      for (const code of input.pressedSet) {
        const km = /^Key([A-Z])$/.exec(code);
        if (km) {
          this.cheatBuf = (this.cheatBuf + km[1]).slice(-10);
          for (const cheat of CHEATS) {
            if (this.cheatBuf.endsWith(cheat.code)) {
              cheat.run(this);
              this.cheatBuf = '';
              this.audio.starUp();
            }
          }
        }
      }
    }
    if (this.state === 'wasted' || this.state === 'busted') {
      this.wastedT += STEP;
      if (this.wastedT > 2.4) {
        this.respawn(this.wastedMode);
      }
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- update

  update(dt) {
    this.frame++;
    const consumed = this.handleScreens();
    if (consumed && this.state !== 'play') {
      // keep decorative clocks (title pulse, water) alive while not playing
      this.time += dt;
      this.hud.update(dt);
      // attract mode: the live city drifts by behind the title
      if (this.state === 'title' && this.world && this.attractMode) {
        const W = CFG.W, H = CFG.H;
        this.cam.x = W / 2 + Math.cos(this.time * 0.05) * W * 0.26;
        this.cam.y = H * 0.44 + Math.sin(this.time * 0.037) * H * 0.22;
        this.cam.x = clamp(this.cam.x, 640, W - 640);
        this.cam.y = clamp(this.cam.y, 360, H - 360);
        if (this.traffic) this.traffic.update(dt);
        if (this.peds) this.peds.update(dt);
        if (this.weather) this.weather.update(dt);
      }
      this.input.endFrame();
      return;
    }
    if (this.state !== 'play') {
      this.input.endFrame();
      return;
    }

    // fixed-step accumulator (clamped so background tabs don't explode)
    this.acc += Math.min(dt, 0.25);
    let steps = 0;
    while (this.acc >= STEP && steps < 6) {
      this.acc -= STEP;
      this.simulate(STEP);
      steps++;
    }
    this.updateCamera(dt);
    this.hud.update(dt);
    this.audio.updateMusic(dt);
    this.input.endFrame();
  }

  simulate(dt) {
    this.time += dt;
    const p = this.player;

    // region entry toast: the city announces its neighborhoods
    const region = this.world.regionName(this.cam.x, this.cam.y);
    if (region !== this.lastRegion) {
      if (this.lastRegion) this.hud.subtitle(`— ${region} —`, 2);
      this.lastRegion = region;
    }

    p.update(dt, this);
    this.traffic.update(dt);
    this.police.update(dt);
    this.peds.update(dt);
    this.missions.update(dt);
    this.weather.update(dt);
    this.tokens.update(dt);
    this.barks.update(dt);
    this.radio.update(dt);
    this.gunshops.update(dt);
    this.pigeons.update(dt);
    this.delivery.update(dt);
    this.stats.timePlayed += dt;
    if (p.car) this.stats.addDistance(p.car.speed, dt);

    // Pay 'n' Spray: sit in the bay to repair and cool down
    this.updateSpray(dt);

    // cars
    for (const c of this.cars) {
      if (c.driver === 'player') {
        // driven in player.update via control(); still step physics
        c.step(dt, this);
      } else if (c.driver === 'cop') {
        // driven in police.update; step physics here
        c.step(dt, this);
      } else if (c.driver === 'ai') {
        // traffic AI set throttle/steer already; step physics
        c.step(dt, this);
      } else {
        // parked: just integrate (they can be nudged by collisions)
        c.step(dt, this);
      }
    }
    // mission escape cars drive themselves
    // (handled in missions.doEscape each frame)

    // boats: moored until you take one
    for (const b of this.boats) b.step(dt, this);

    // bullets
    this.updateBullets(dt);

    // effects (debris gets simple physics)
    for (const e of this.effects) {
      e.t += dt;
      if (e.type === 'debris') {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.vx *= 0.94;
        e.vy *= 0.94;
        if (e.spin) e.spinT = (e.spinT || 0) + e.spin * dt;
      }
    }
    this.effects = this.effects.filter((e) => e.t < e.dur);
    this.flash = Math.max(0, this.flash - dt * 1.8);
    this.cam.shake = Math.max(0, this.cam.shake - CFG.CAM_SHAKE_DECAY * dt * this.cam.shake * 0.4 - dt * 2);

    // rain pools: puddles bloom on the roads during a shower
    const weather = this.weather;
    if (weather && weather.rain > 0.35 && this.frame % 24 === 0) {
      const ang = this.rngFx.angle();
      const d = this.rngFx.range(120, 520);
      const px2 = clamp(p.x + Math.cos(ang) * d, 60, CFG.W - 60);
      const py2 = clamp(p.y + Math.sin(ang) * d, 60, CFG.H - 60);
      if (this.world.isRoadPx(px2, py2)) {
        this.decals.push({ type: 'puddle', x: px2, y: py2, r: 10 + this.rngFx.range(0, 14), alpha: 1, ang: this.rngFx.angle() });
      }
    }

    // tire / skid decals + the screech that goes with them
    for (const c of this.cars) {
      if (c.tireT > 0.06 && !c.dead) {
        c.tireT = 0;
        this.decals.push({ type: 'skid', x: c.x, y: c.y, ang: c.ang, len: 8, alpha: 1 });
        if (c.driver === 'player') {
          this.audio.playNoise(0.18, 900, 0.16, 'bandpass');
          this.effects.push({ type: 'smoke', x: c.x, y: c.y, t: 0, dur: 0.5 });
        }
      }
    }
    if (this.decals.length > 220) this.decals.splice(0, this.decals.length - 220);
    for (const d of this.decals) d.alpha = Math.max(0, d.alpha - dt * 0.01);

    // cash pickups scattered in the world
    this.pickupT -= dt;
    if (this.pickupT <= 0) {
      this.pickupT = 6;
      if (this.pickups.length < 5) this.spawnCashPickup();
    }
    for (const pk of this.pickups) {
      if (!pk.taken && dist(p.x, p.y, pk.x, pk.y) < 24 && !p.car) {
        pk.taken = true;
        p.money += pk.amount;
        this.audio.cash();
        this.effects.push({ type: 'cash', x: pk.x, y: pk.y, t: 0, dur: 0.8 });
        this.hud.subtitle(`Picked up ${pk.amount} bucks.`, 1.6);
      }
    }
    this.pickups = this.pickups.filter((k) => !k.taken && dist(k.x, k.y, p.x, p.y) < 2000);

    // audio
    this.audio.updateEngines(this.cars, dt, this.boats);
  }

  updateBullets(dt) {
    const p = this.player;
    for (const b of this.bullets) {
      b.t += dt;
      const nx = b.x + b.dx * dt;
      const ny = b.y + b.dy * dt;
      // world block
      const code = this.world.codeAt(nx, ny);
      if (code === G.BUILDING || code === G.WATER) {
        b.t = b.dur;
        this.effects.push({ type: 'spark', x: nx, y: ny, t: 0, dur: 0.25, n: 3 });
        continue;
      }
      b.x = nx;
      b.y = ny;
      if (b.from === 'player') {
        // peds
        const ped = this.peds.near(b.x, b.y, 9);
        if (ped) {
          ped.damage(CFG.GUN_DMG * 2, this, 'gun');
          this.effects.push({ type: 'blood', x: b.x, y: b.y, t: 0, dur: 0.4 });
          b.t = b.dur;
          continue;
        }
        // foot cops
        if (this.police.bulletHitCops(b, this)) {
          this.effects.push({ type: 'blood', x: b.x, y: b.y, t: 0, dur: 0.4 });
          b.t = b.dur;
          continue;
        }
      }
      // cars (any shooter)
      for (const c of this.cars) {
        if (c.dead) continue;
        if (b.from === 'player' && c === p.car) continue;
        if (b.from === 'cop' && c.driver === 'cop') continue;
        if (dist(b.x, b.y, c.x, c.y) < CFG.CAR_RADIUS + 4) {
          c.damageSilent(CFG.GUN_DMG_CAR, 'bullet', b.from === 'player' ? 'player' : 'cop');
          this.effects.push({ type: 'spark', x: b.x, y: b.y, t: 0, dur: 0.25, n: 3 });
          if (b.from === 'player' && c.wrecked) {
            this.police.crime(CFG.HEAT_BOOM, c.x, c.y);
          }
          b.t = b.dur;
          break;
        }
      }
      // player hit by cop bullets
      if (b.from === 'cop' && !p.dead) {
        const px = p.car ? p.car.x : p.x;
        const py = p.car ? p.car.y : p.y;
        if (dist(b.x, b.y, px, py) < (p.car ? 18 : 9)) {
          if (p.car) {
            p.car.damageSilent(CFG.GUN_DMG_CAR, 'bullet');
          } else {
            p.damage(7, this, 'gunshot');
          }
          b.t = b.dur;
        }
      }
    }
    this.bullets = this.bullets.filter((b) => b.t < b.dur);
  }

  spawnCashPickup() {
    const p = this.player;
    const ang = this.rngFx.angle();
    const d = this.rngFx.range(200, 700);
    const x = clamp(p.x + Math.cos(ang) * d, 60, CFG.W - 60);
    const y = clamp(p.y + Math.sin(ang) * d, 60, CFG.H - 60);
    const code = this.world.codeAt(x, y);
    if (code !== G.PLAZA && code !== G.SAND && code !== G.DOCKPAD && code !== G.PIER) return;
    this.pickups.push({ x, y, amount: CFG.PICKUP_CASH, taken: false });
  }

  /** Pay 'n' Spray garages: hold still in the bay for a full refresh. */
  updateSpray(dt) {
    const p = this.player;
    const at = p.car && !p.car.exploded && (this.nearSpray(p.car.x, p.car.y));
    if (!at) {
      this.sprayT = 0;
      return;
    }
    const needsFix = p.car.hp < p.car.spec.hp || this.police.wanted > 0;
    if (!needsFix) {
      this.sprayT = 0;
      return;
    }
    const cost = 300;
    if (p.money < cost) {
      if (this.sprayT === 0) this.hud.subtitle(`Pay \u2019n\u2019 Spray: $300 and a quiet second.`, 2);
      return;
    }
    this.sprayT += dt;
    if (this.sprayT === dt) this.hud.subtitle('Hold it right here — respray in progress…', 2.5);
    p.car.speed *= 0.9;
    if (this.sprayT > 1.6) {
      this.sprayT = 0;
      p.money -= cost;
      this.stats.addMoney(-cost);
      p.car.hp = p.car.spec.hp;
      p.car.onFire = false;
      this.police.clear();
      this.hud.subtitle('Good as new — and the cops lost your plate.', 3);
      this.effects.push({ type: 'cash', x: p.car.x, y: p.car.y, t: 0, dur: 0.8 });
    }
  }

  nearSpray(x, y) {
    for (const key of ['spray1', 'spray2']) {
      const s = this.world.spawns[key];
      if (s && dist(x, y, s.x, s.y) < 44) return s;
    }
    return null;
  }

  updateCamera(dt) {
    const p = this.player;
    let tx = p.x, ty = p.y;
    if (p.car) {
      // lead the camera in the direction of travel
      tx = p.car.x + p.car.vx * 0.32;
      ty = p.car.y + p.car.vy * 0.32;
    }
    const k = damp(CFG.CAM_LERP, dt);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    // keep the view inside the world
    const halfW = this.viewW / 2 / this.cam.zoom;
    const halfH = this.viewH / 2 / this.cam.zoom;
    this.cam.x = clamp(this.cam.x, halfW, CFG.W - halfW);
    this.cam.y = clamp(this.cam.y, halfH, CFG.H - halfH);
  }

  // ----------------------------------------------------------------- draw

  draw() {
    const ctx = this.ctx;
    if (this.state === 'title') {
      drawTitle(ctx, this);
      return;
    }
    if (this.state === 'boot') {
      ctx.fillStyle = '#07080f';
      ctx.fillRect(0, 0, this.viewW, this.viewH);
      ctx.fillStyle = '#37f5ff';
      ctx.font = 'bold 18px monospace';
      ctx.fillText('Loading Vice Palms…', 40, 60);
      return;
    }
    this.renderer.draw(ctx);
    this.hud.draw(ctx);
    if (this.mapscreen && this.mapscreen.open && this.world) this.mapscreen.draw(ctx);
    if (this.state === 'pause') drawPause(ctx, this);
    if (this.state === 'wasted') drawWasted(ctx, this);
    if (this.state === 'busted') drawBusted(ctx, this);
  }

  /** Save data fingerprint for the pause menu. */
  saveExists() {
    return hasSave();
  }
}
