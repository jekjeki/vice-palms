// ---------------------------------------------------------------------------
// game.js — the conductor. Owns world/sim/entities, the game state machine
// (title → playing → paused / wasted / busted), bullets, explosions, mission
// hooks, save/load and the fixed-step simulation used by both the live loop
// and the staged screenshot scenes.
// ---------------------------------------------------------------------------

import { CFG } from './config.js';
import { RNG } from './rng.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { world } from './world.js';
import { Car, collideCars, CAR_BLURBS } from './cars.js';
import { Traffic } from './traffic.js';
import { Peds } from './peds.js';
import { Player } from './player.js';
import { Police, Cop } from './police.js';
import { Missions } from './missions.js';
import { Renderer } from './render.js';
import { HUD } from './hud.js';
import { FX } from './fx.js';
import { Pickups } from './pickups.js';
import { Weather } from './weather.js';
import { Garage } from './garage.js';
import { CityMap } from './map.js';
import { Screens, saveGameState, loadSaveState } from './screens.js';
import { dist2, clamp, fmtMoney } from './util.js';

// the stranded-driver vignette lives inside Game as static flavour text
const STRANDED_LINES = [
  'Stranded driver: my spark plugs walked. Pay me no mind.',
  'Stranded driver: tell Rico the yard owes him one.',
  'Stranded driver: batteries hate me. Nice car though.',
];

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.rng = new RNG(1337);
    this.world = world.build(1337);
    this.input = new Input(canvas);
    this.audio = new AudioSys();
    this.renderer = new Renderer(canvas, this.world);
    this.fx = new FX();
    this.hud = new HUD();
    this.screens = new Screens(this);
    this.screens.titleChoice = 0;

    this.player = new Player(this.world.spawn.x, this.world.spawn.y, this.world.spawn.angle);
    this.traffic = new Traffic(this.world, this.rng);
    this.peds = new Peds(this.world, this.rng);
    this.police = new Police(this.world, this.rng);
    this.missions = new Missions(this.world, this.rng);
    this.missions.game = this;
    this.pickups = new Pickups();
    this.weather = new Weather(20260);
    this.garage = new Garage(this.world, this.rng, { x: 2840, y: 1720 });
    this.map = new CityMap(this);
    this.helpOpen = false;
    this.helpPage = 1;
    this.stats = { wrecks: 0, kills: 0, missions: 0, jacks: 0, distance: 0, earned: 0, playTime: 0 };
    this._pid = 0;
    // wasted/busted flash the tab title (you died, the browser knows)
    this._baseTitle = document.title;
    document.addEventListener('visibilitychange', () => {
      // tab hidden mid-chase → auto-pause so nothing unfair happens
      if (document.hidden && this.state === 'playing' && !this.pendingShot) {
        this.state = 'paused';
        this.screens.pauseChoice = 0;
      }
    });
    this.lastArea = '';
    this.areaToast = '';
    this.areaToastT = 0;
    this.lastCar = null;
    this.carToast = '';
    this.carToastT = 0;
    this.lastStreet = '';
    this.streetToastT = 0;
    this.radioBanner = '';
    this.radioBannerT = 0;
    // ?debug=car — dump live sim stats to the console once a second
    try {
      this.debugCars = new URLSearchParams(location.search).has('debug');
    } catch (e) { this.debugCars = false; }

    this.parkedCars = [];
    this.bullets = [];
    this.state = 'title';          // title | playing | paused | wasted | busted
    this.time = 0;
    this.frozen = false;
    this.muted = false;
    this.deathT = 0;
    this.explosionCount = 0;
    this.money = 0;                // runtime mirror; the player's wallet is authoritative
    this.titleDrift = { a: 0 };
    this.pendingShot = null;

    // pre-seed some ambient life so the city is never dead
    for (let i = 0; i < 8; i++) this.traffic.trySpawn(this);
    for (let i = 0; i < 8; i++) this.peds.trySpawn(this);
    this.spawnParkedCars();

    // restore mute preference (tests force their own flag)
    try {
      const q = new URLSearchParams(location.search);
      if (q.has('mute') || q.has('shot')) this.muted = true;
      else this.muted = localStorage.getItem(CFG.MUTE_KEY) === '1';
    } catch (e) { /* ignore */ }
    this.audio.setMuted(this.muted);
  }

  // ------------------------------------------------------------- utilities
  allCars() {
    return [...this.traffic.cars, ...this.police.cruisers, ...this.parkedCars];
  }

  findCarByTag(tag) {
    for (const c of this.allCars()) if (c.missionTag === tag) return c;
    return null;
  }

  spawnMissionCar(type, x, y, angle, tag) {
    const car = new Car(type, x, y, angle);
    car.missionTag = tag;
    car.parked = true;
    car.lightsOn = false;
    this.parkedCars.push(car);
    return car;
  }

  spawnTempCar(type, x, y, angle) {
    const car = new Car(type, x, y, angle);
    car.parked = true;
    car.lightsOn = true;
    this.parkedCars.push(car);
    return car;
  }

  spawnParkedCars() {
    const rng = this.rng;
    // [x, y, heading] — headings align with the road each spot sits on
    const spots = [
      [880, 3350, -Math.PI / 2], [1640, 3960, 0], [2840, 3480, Math.PI / 2], [1240, 1580, -Math.PI / 2],
      [2040, 2280, 0], [3240, 2280, 0], [640, 805, 0], [1500, 805, Math.PI],
      [2840, 805, 0], [1240, 900, Math.PI / 2], [2040, 900, Math.PI / 2], [3640, 900, Math.PI / 2],
    ];
    const types = ['compact', 'sedan', 'taxi', 'pickup', 'van', 'sports'];
    for (const [x, y, a] of spots) {
      if (this.world.solidHit(x, y, 30)) continue;
      const car = new Car(rng.pick(types), x, y, a + rng.range(-0.05, 0.05));
      car.parked = true;
      car.lightsOn = false;
      this.parkedCars.push(car);
    }
    // and fill ~40% of the municipal lot stalls
    for (const lot of this.world.parkingLots) {
      for (const s of lot.stalls) {
        if (!rng.chance(0.4)) continue;
        const car = new Car(rng.pick(types), s.x, s.y, s.angle);
        car.parked = true;
        car.lightsOn = false;
        this.parkedCars.push(car);
      }
    }
  }

  /** stranded-karma system: helping a stranded driver pays pocket change */
  static STRANDED_LINES = [
    'Stranded driver: my spark plugs walked. Pay me no mind.',
    'Stranded driver: tell Rico the yard owes him one.',
    'Stranded driver: batteries hate me. Nice car though.',
  ];

  /** maybe spawn a stranded-driver vignette near the player (rare) */
  maybeStranded(game) {
    if (this.strandedCd > 0 || !game.player.inCar) return;
    if (game.rng.chance(0.004)) {
      this.strandedCd = 45;
      const p = game.player;
      const pt = game.world.nearestRoadPoint(p.x + game.rng.range(-500, 500), p.y + game.rng.range(-500, 500));
      if (!pt || game.world.isWater(pt.x, pt.y)) return;
      const car = new Car('compact', pt.x, pt.y, game.rng.range(-Math.PI, Math.PI));
      car.parked = true;
      car.hp = car.maxHp * 0.4;
      car.smokeBad = true;
      this.parkedCars.push(car);
      game.fx.text(pt.x, pt.y - 20, game.rng.pick(STRANDED_LINES), 'rgba(225,225,215,0.9)');
      // small goodwill payment for stopping by (drive within 40px)
      car.stranded = true;
    }
  }

  /** check stranded cars for the good-Samaritan bonus */
  tickStranded(game) {
    for (const c of this.parkedCars) {
      if (!c.stranded) continue;
      if (game.player.inCar && dist2(game.player.inCar.x, game.player.inCar.y, c.x, c.y) < 40 * 40) {
        c.stranded = false;
        game.player.addMoney(25);
        game.recordGain(25);
        game.fx.text(c.x, c.y - 18, '+$25 — karma', '#7ce8a0');
        game.audio.pickup();
      }
    }
  }

  shake(mag) { this.renderer.shake(mag); }

  toast(text) { this.hud.showToast(text); }

  sub(text, dur) { this.missions.say(text, dur); }

  // district / vehicle name plates — small arrival toasts
  tickAreaToasts(dt) {
    const p = this.player;
    const area = this.world.districtAt(p.x, p.y);
    if (area !== this.lastArea) {
      this.lastArea = area;
      this.areaToastT = 3;
      this.areaToast = area;
    }
    if (this.areaToastT > 0) this.areaToastT -= dt;
    const car = p.inCar;
    if (car && car !== this.lastCar) {
      this.lastCar = car;
      this.carToastT = 2.6;
      this.carToast = CAR_BLURBS[car.type] || car.spec.name;
    }
    // street you're on / crossing (small, under the district toast)
    const near = this.world.nearestRoadPoint(p.x, p.y);
    if (near && near.seg && near.seg.road) {
      const nm = this.world.streetNames.get(near.seg.road);
      if (nm && nm !== this.lastStreet) {
        this.lastStreet = nm;
        this.streetToastT = 2;
      }
    }
    if (this.streetToastT > 0) this.streetToastT -= dt;
    if (this.carToastT > 0) this.carToastT -= dt;
  }

  /** earnings ticker feed (HUD shows the last few) */
  recordGain(v) {
    if (!this.recentGains) this.recentGains = [];
    this.recentGains.unshift({ v, t: 1 });
    this.recentGains.length = Math.min(this.recentGains.length, 3);
  }

  tickGains(dt) {
    if (!this.recentGains) return;
    for (let i = this.recentGains.length - 1; i >= 0; i--) {
      this.recentGains[i].t -= dt / 2.4;
      if (this.recentGains[i].t <= 0) this.recentGains.splice(i, 1);
    }
  }

  // ---------------------------------------------------------------- bullets
  bullet(x, y, angle, opts) {
    const range = opts.range || 500;
    const speed = 1500;
    const b = {
      x, y, angle, speed, range, travelled: 0,
      from: opts.from, dmgPed: opts.dmgPed || 0, dmgCar: opts.dmgCar || 0, dmgPlayer: opts.dmgPlayer || 0,
      dead: false,
    };
    this.bullets.push(b);
    this.fx.tracer(x, y, x + Math.cos(angle) * 46, y + Math.sin(angle) * 46);
  }

  updateBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const stepLen = b.speed * dt;
      const nx = b.x + Math.cos(b.angle) * stepLen;
      const ny = b.y + Math.sin(b.angle) * stepLen;
      b.travelled += stepLen;
      let hit = false;

      // walls
      if (this.world.solidHit(nx, ny, 1)) {
        this.fx.impactSparks(nx, ny, 90);
        hit = true;
      }
      // peds
      if (!hit && b.dmgPed > 0) {
        for (const p of this.peds.list) {
          if (p.state === 'dead') continue;
          if (dist2(nx, ny, p.x, p.y) < 14 * 14) {
            const wasAlive = p.state !== 'dead';
            p.hurt(b.dmgPed, b.x, b.y, this);
            if (wasAlive && p.state === 'dead') this.stats.kills++;
            this.fx.text(p.x, p.y - 14, 'HIT', '#ff8a8a');
            hit = true;
            break;
          }
        }
      }
      if (this.debugCars) {
        b.debugPath = (b.debugPath || 0) + 1;
      }
      // cops
      if (!hit && b.from === 'player') {
        for (const c of this.police.cops) {
          if (dist2(nx, ny, c.x, c.y) < 14 * 14) {
            c.hp -= b.dmgPed;
            this.fx.blood(c.x, c.y, 5);
            this.police.crime(c.x, c.y, 25, 'shotcop');
            hit = true;
            break;
          }
        }
      }
      // cars
      if (!hit && b.dmgCar > 0) {
        for (const c of this.allCars()) {
          if (c.wrecked) continue;
          if (b.from === 'player' && c.driver === 'player') continue;
          if (b.from === 'cop' && c.type === 'police') continue;
          if (c.containsPoint(nx, ny)) {
            c.damage(b.dmgCar);
            this.fx.impactSparks(nx, ny, 70);
            hit = true;
            break;
          }
        }
      }
      // player
      if (!hit && b.dmgPlayer > 0 && !this.player.dead && !this.player.inCar) {
        if (dist2(nx, ny, this.player.x, this.player.y) < 14 * 14) {
          this.player.damage(b.dmgPlayer, this, 'shot');
          hit = true;
        }
      }
      if (b.travelled >= b.range) hit = true;
      b.x = nx; b.y = ny;
      if (hit) this.bullets.splice(i, 1);
    }
  }

  // -------------------------------------------------------------- explosions
  explodeCar(car) {
    if (!car.explode()) return;
    this.explosionCount++;
    this.stats.wrecks++;
    this.fx.explosion(car.x, car.y, this);
    this.audio.explosion();
    // area damage
    const R = CFG.EXPLODE_R;
    for (const other of this.allCars()) {
      if (other === car || other.wrecked) continue;
      const d = Math.hypot(other.x - car.x, other.y - car.y);
      if (d < R) other.damage(CFG.EXPLODE_DMG * (1 - d / R) * other.spec.hp / other.maxHp);
    }
    if (!this.player.inCar) {
      const d = Math.hypot(this.player.x - car.x, this.player.y - car.y);
      if (d < R) this.player.damage(CFG.EXPLODE_DMG * (1 - d / R), this, 'explosion');
    } else if (this.player.inCar === car) {
      this.player.damage(999, this, 'explosion');
    }
    for (const p of this.peds.list) {
      if (p.state === 'dead') continue;
      const d = Math.hypot(p.x - car.x, p.y - car.y);
      if (d < R) { p.hurt(CFG.EXPLODE_DMG * (1 - d / R) * 2, car.x, car.y, this); }
      else if (d < R * 2.4) p.panic(car.x, car.y, this);
    }
    for (const cop of [...this.police.cops]) {
      const d = Math.hypot(cop.x - car.x, cop.y - car.y);
      if (d < R) cop.hp -= CFG.EXPLODE_DMG * (1 - d / R);
    }
    this.police.onCarDestroyed(car, this);
    if (this.player.inCar === car) {
      // bail out of the wreck
      this.player.exitCar(this);
    }
    if (this.missions.state === 'active') this.missions.update(0, this); // tick observers
  }

  // ------------------------------------------------------------------ states
  startPlaythrough(mode, opts = {}) {
    this.stats.playTime = this.stats.playTime || 0;
    this.state = 'playing';
    this.frozen = false;
    if (mode === 'continue') {
      const s = loadSaveState();
      if (s) {
        this.player.money = s.money || 250;
        this.player.health = s.health || 100;
        this.player.armor = s.armor || 0;
        this.player.ammo = s.ammo !== undefined ? s.ammo : 34;
        this.player.x = s.x; this.player.y = s.y;
        this.missions.storyIndex = s.mission || 0;
        if (s.sides) this.missions.sidesDone = s.sides;
        this.renderer.cam.x = s.x; this.renderer.cam.y = s.y;
      }
    } else {
      this.player.x = this.world.spawn.x;
      this.player.y = this.world.spawn.y;
      this.renderer.cam.x = this.player.x;
      this.renderer.cam.y = this.player.y;
      if (!opts.silent) this.missions.say('RICO is waiting at the north docks. Find him.', 5);
    }
    if (!opts.silent) this.toast('Welcome to Vice Palms');
  }

  saveGame() {
    saveGameState(this);
    this.toast('Game saved');
  }

  refreshTitleChoices() {
    this.screens.titleChoice = 0;
  }

  onPlayerDeath(cause) {
    if (this.state !== 'playing') return;
    this.state = 'wasted';
    this.deathT = 0;
    this.deathCause = cause || 'hurt';
    this.audio.engineStop();
    this.audio.siren(false);
    this.police.sirens(this, false);
    if (this.missions.state === 'active') {
      this.missions.fail('You got wasted');
    }
  }

  onBusted() {
    if (this.state !== 'playing') return;
    this.state = 'busted';
    this.deathT = 0;
    this.audio.engineStop();
    this.police.sirens(this, false);
    if (this.missions.state === 'active') {
      this.missions.fail('You got busted');
    }
  }

  respawn(kind) {
    const fee = CFG.RESPAWN_FEE * Math.max(1, this.police.wanted);
    const actual = -this.player.addMoney(-fee);
    if (actual > 0) this.recordGain(-actual);
    document.title = this._baseTitle;
    this.player.dead = false;
    this.player.health = CFG.HEALTH_MAX;
    this.player.inCar = null;
    if (kind === 'busted') {
      this.player.ammo = Math.max(0, this.player.ammo - Math.ceil(this.player.ammo * 0.5));
      this.player.x = this.world.policeHQ.x;
      this.player.y = this.world.policeHQ.y + 60;
    } else {
      this.player.x = this.world.hospital.x;
      this.player.y = this.world.hospital.y + 60;
    }
    this.player.armor = 0;
    this.police.reset();
    this.bullets.length = 0;
    this.state = 'playing';
    this.renderer.cam.x = this.player.x;
    this.renderer.cam.y = this.player.y;
    this.toast(kind === 'busted' ? 'Released. They kept your piece.' : 'Patched up at Mercy General.');
  }

  // ------------------------------------------------------------------- step
  /** fixed-step simulation; the live loop and the shot stager share this */
  step(dt) {
    this.time += dt;
    const p = this.player;

    // district arrival toasts + vehicle name plates
    this.tickAreaToasts(dt);

    if (this.state === 'playing' && !this.frozen) {
      this.weather.update(dt, this);
      p.update(dt, this);
      this.traffic.update(dt, this);
      this.peds.update(dt, this);
      this.police.update(dt, this);
      this.missions.update(dt, this);
      this.pickups.update(dt, this);
      this.garage.update(dt, this);
      this.strandedCd = Math.max(0, (this.strandedCd || 0) - dt);
      this.maybeStranded(this);
      this.tickStranded(this);

      // all cars tick physics + damage states
      for (const c of this.allCars()) {
        if (c.driver === 'player' || c.wrecked) {
          if (c.wrecked) {
            c.speed *= 0.9;
            c._integrate(dt);
          }
          if (c.driver === 'player') {
            // player controls applied here (single place, keeps order stable)
            const ctl = this.playerControls();
            c.step(dt, ctl, this.world);
            c.collideWorld(this.world);
            // idle exhaust
            if (Math.random() < dt * 2.5) c.idlePuff(this);
            // skid decals
            if (c.handbraking && Math.abs(c.speed) > 90) {
              this.fx.skidMark(c.x - Math.cos(c.angle) * 10, c.y - Math.sin(c.angle) * 10);
              if (Math.random() < dt * 6) this.audio.skid();
            }
          }
        }
        // fire progression
        if (!c.wrecked && c.burn > 0) {
          if (c.updateBurn(dt)) this.explodeCar(c);
          this.fx.fireFlame(c.x + (Math.random() - 0.5) * 20, c.y + (Math.random() - 0.5) * 14);
        } else if (!c.wrecked && c.hp < c.maxHp * 0.55) {
          if (Math.random() < dt * 8) {
            this.fx.smokePuff(c.x + (Math.random() - 0.5) * 16, c.y + (Math.random() - 0.5) * 10, c.hp < c.maxHp * 0.3 ? '#151517' : '#3a3d44');
          }
          if (c.hp < c.maxHp * 0.28 && Math.random() < dt * 14) {
            this.fx.fireFlame(c.x + (Math.random() - 0.5) * 14, c.y + (Math.random() - 0.5) * 10);
          }
        }
        if (c.wrecked && Math.random() < dt * 3) {
          this.fx.smokePuff(c.x + (Math.random() - 0.5) * 24, c.y + (Math.random() - 0.5) * 14, '#222326', 7);
        }
      }
      collideCars(this.allCars(), this);
      this.updateBullets(dt);

      // odometer
      if (p.inCar) this.stats.distance += Math.abs(p.inCar.speed) * dt / 1600; // km
      this.stats.playTime = (this.stats.playTime || 0) + dt;

      // ambient day cycle is permanent night; ambience is the synth bed
      this.audio.setMusic(this.state === 'playing' && !this.muted);
      this.audio.updateMusic();
      if (!p.inCar) this.audio.engineStop();
      // cycle radio with R
      if (this.input.wasPressed('KeyR')) {
        this.audio.nextStation();
        this.audio.jingle();
        this.radioBanner = this.audio.stationName();
        this.radioBannerT = 2.5;
        this.toast('Radio: ' + this.audio.stationName());
      }
    }

    this.fx.update(dt);
    this.hud.update(dt);
    this.tickGains(dt);
    if (this.radioBannerT > 0) this.radioBannerT -= dt;
  }

  playerControls() {
    const input = this.input;
    let throttle = 0, steer = 0, handbrake = false;
    if (input.isDown('KeyW', 'ArrowUp')) throttle += 1;
    if (input.isDown('KeyS', 'ArrowDown')) throttle -= 1;
    if (input.isDown('KeyA', 'ArrowLeft')) steer -= 1;
    if (input.isDown('KeyD', 'ArrowRight')) steer += 1;
    handbrake = input.isDown('Space');
    return { throttle, steer, handbrake, grip: this.weather.gripMult() };
  }

  // ------------------------------------------------------------------ frame
  /** called once per animation frame by main.js */
  frame(dtReal) {
    const input = this.input;
    input.pollPad();

    // global toggles
    if (input.wasPressed('KeyM')) {
      this.muted = !this.muted;
      this.audio.setMuted(this.muted);
      this.toast(this.muted ? 'Audio muted' : 'Audio on');
    }

    if (this.pendingShot) {
      // staged screenshot scene already froze the sim; just render
      this.renderer.shakeMag = 0;
      this.renderer.updateCamera(this, 0);
      this.renderer.render(this, 0);
      if (this.state === 'title') this.screens.drawTitle(this.renderer.ctx, this);
      else this.hud.render(this.renderer.ctx, this);
      input.endFrame();
      return;
    }

    switch (this.state) {
      case 'title': {
        this.titleDrift.a += dtReal * 0.05;
        // slow drift over downtown for the backdrop
        this.renderer.cam.x = 2040 + Math.sin(this.titleDrift.a) * 420;
        this.renderer.cam.y = 2680 + Math.cos(this.titleDrift.a * 0.7) * 300;
        this.renderer.cam.zoom = 0.82;
        const action = this.screens.updateTitle(input);
        if (action) {
          this.audio.unlock();
          this.startPlaythrough(action);
        }
        this.step(Math.min(dtReal, 0.05)); // keep the city alive behind the menu
        this.renderer.render(this, dtReal);
        this.screens.drawTitle(this.renderer.ctx, this);
        break;
      }
      case 'playing': {
        this.step(Math.min(dtReal, 0.05));
        this.map.update(input);
        this.renderer.updateCamera(this, Math.min(dtReal, 0.05));
        this.renderer.render(this, dtReal);
        this.hud.render(this.renderer.ctx, this);
        this.weather.drawScreen(this.renderer.ctx);
        if (this.map.open) this.map.draw(this.renderer.ctx);
        if (this.helpOpen) this.screens.drawHelpOverlay(this.renderer.ctx);
        if (this.helpOpen && this.helpPage === 2) this.screens.drawTipsOverlay(this.renderer.ctx);
        if (input.wasPressed('F1')) {
          this.helpOpen = !this.helpOpen;
          this.helpPage = 1;
        } else if (this.helpOpen && input.wasPressed('KeyT')) {
          this.helpPage = this.helpPage === 1 ? 2 : 1;
        }
        if (input.wasPressed('Tab')) {
          if (!this.map.open) this.map.openMap();
          else this.map.closeMap();
        }
        if (input.wasPressed('Escape') && !this.map.open) {
          this.state = 'paused';
          this.screens.pauseChoice = 0;
        } else if (input.wasPressed('Escape') && this.map.open) {
          this.map.closeMap();
        }
        break;
      }
      case 'paused': {
        this.renderer.render(this, 0);
        this.hud.render(this.renderer.ctx, this);
        this.screens.drawPause(this.renderer.ctx, this);
        const act = this.screens.updatePause(input);
        if (act === 'resume') this.state = 'playing';
        else if (act === 'save') { saveGameState(this); this.toast('Game saved'); this.state = 'playing'; }
        else if (act === 'delete') { import('./screens.js').then((m) => { m.deleteSave(); this.toast('Save deleted'); }); this.state = 'playing'; }
        else if (act === 'quit') { this.state = 'title'; this.screens.titleChoice = 0; }
        break;
      }
      case 'wasted':
      case 'busted': {
        this.deathT += dtReal;
        document.title = Math.floor(this.deathT * 2) % 2 === 0 ? '⚠ ' + this._baseTitle : this._baseTitle;
        this.renderer.render(this, 0);
        this.hud.render(this.renderer.ctx, this);
        this.screens.drawDeath(this.renderer.ctx, this, this.state === 'wasted' ? 'WASTED' : 'BUSTED');
        if (this.deathT > 1.2 && input.wasPressed('Enter', 'Space')) {
          this.respawn(this.state);
        }
        break;
      }
    }
    this.input.endFrame();
  }
}
