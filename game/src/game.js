// game.js — Game class: state machine, entity management, collisions, save/load
import { CFG } from './config.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Ped } from './peds.js';
import { Car, makeCar } from './cars.js';
import { spawnTraffic as spawnTrafficCar } from './traffic.js';
import { Police, ChaseAI } from './police.js';
import { Shops } from './shops.js';
import { Weather } from './weather.js';
import { Radio } from './radio.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { Audio } from './audio.js';
import { updateScreens, drawScreens } from './screens.js';
import { updateMap, drawMap } from './mapscreen.js';
import { render } from './render.js';
import { applyShot, parseShot } from './shots.js';
import { Dialogue } from './dialogue.js';
import { Jumps } from './jumps.js';
import { Transit } from './transit.js';
import { Events } from './events.js';
import { clamp, dist, rand, angleTo, carCircle, carContains, TAU } from './util.js';

export class Game {
  constructor(canvas, input) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = input;
    this.state = 'title';
    this.t = 0;
    this.shotMode = null;
    this.startMuted = false;
    this.screenT = 0;
    this.menuIndex = 0;
    this.flash = 0;
    this.lastShotAt = -9;

    this.world = new World(this.seedFromShot());
    this.player = new Player(this.world.pois.safehouse.x + 120, this.world.pois.safehouse.y + 40);
    this.cars = [];
    this.peds = [];
    this.bullets = [];
    this.particles = [];
    this.pickups = [];
    this.skids = [];
    this.skidT = 0;

    this.cam = { x: this.player.x, y: this.player.y, zoom: CFG.ZOOM, shake: 0 };
    this.police = new Police(this);
    this.missions = new Missions(this);
    this.hud = new HUD();
    this.audio = new Audio();
    this.shops = new Shops(this);
    this.weather = new Weather(this, (this.seedFromShot() % 13) + 3);
    this.radio = new Radio(this);
    this.dialogue = new Dialogue(this);
    this.jumps = new Jumps(this);
    this.transit = new Transit(this);
    this.events = new Events(this);
    this.achievements = {};
    this.stats = { time: 0, dist: 0, pedsWasted: 0, carsJacked: 0, maxWanted: 0, packages: 0, jumps: 0, earned: 0 };

    const shot = parseShot();
    this.startMuted = shot ? true : new URLSearchParams(location.search).get('mute') === '1';
    if (shot) {
      applyShot(this, shot);
    } else {
      this.spawnInitial();
      this.load() && this.hud.toast('Save loaded');
      this.missions.refreshSideMarkers();
    }
  }

  seedFromShot() {
    const q = new URLSearchParams(location.search);
    return (parseInt(q.get('seed') || '0', 10) || 20260601) >>> 0;
  }

  // ---------- entity factories ----------
  addCar(type, x, y, h = 0, color = null) {
    const car = makeCar(type, x, y, h, color);
    this.cars.push(car);
    return car;
  }

  spawnTraffic(type, x, y) { return spawnTrafficCar(this, x, y, type); }

  // free world spot near a target for test/debug placement
  freeSpotNear(x, y) {
    for (let i = 0; i < 24; i++) {
      const ang = i * 2.399;
      const d = 40 + i * 12;
      const tx = clamp(x + Math.cos(ang) * d, 60, CFG.W - 60);
      const ty = clamp(y + Math.sin(ang) * d, 60, CFG.H - 60);
      let blocked = false;
      for (const r of this.world.nearSolids(tx, ty)) {
        if (tx >= r.x0 - 40 && tx <= r.x1 + 40 && ty >= r.y0 - 30 && ty <= r.y1 + 30) { blocked = true; break; }
      }
      if (blocked) continue;
      for (const p of this.world.palmSolids) {
        if (Math.hypot(p.x - tx, p.y - ty) < p.r + 60) { blocked = true; break; }
      }
      if (blocked) continue;
      for (const o of this.cars) if (Math.abs(o.x - tx) < 100 && Math.abs(o.y - ty) < 70) { blocked = true; break; }
      if (!blocked) return { x: tx, y: ty };
    }
    return { x, y };
  }

  addChaser(car) {
    car.driver = 'ai';
    car.ai = new ChaseAI();
    car.siren = true;
  }

  spawnPed(x, y, opts = {}) {
    const ped = new Ped(x, y, opts);
    if (opts.flee) { ped.state = 'flee'; ped.fleeT = 6; }
    this.peds.push(ped);
    return ped;
  }

  addPickup(x, y, kind) { this.pickups.push({ x, y, kind, id: Math.random().toString(36).slice(2) }); }

  spawnBullet(x, y, a, from) {
    this.bullets.push({ x, y, a, vx: Math.cos(a) * CFG.BULLET_SPEED, vy: Math.sin(a) * CFG.BULLET_SPEED, ttl: CFG.BULLET_TTL, from });
  }

  spawnInitial() {
    // parked cars from the spawn tables (driverless)
    for (const s of this.world.spawns.cars) {
      if (!s.parked) continue;
      this.addCar(s.type, s.x, s.y, s.h);
    }
    // make sure the player never starts buried inside geometry
    const fs = this.freeSpotNear(this.player.x, this.player.y);
    this.player.x = fs.x; this.player.y = fs.y;
    // hidden packages
    for (const [x, y] of this.world.hidden) this.addPickup(x, y, 'hidden');
    // the Palm Line bus
    this.transit.spawnBus();
    // a few ambient cars and peds around the safehouse at boot
    for (let i = 0; i < 8; i++) {
      const x = 400 + rand(0, 1400), y = this.world.roadH[6] + (i % 2 ? CFG.LANE_OFF : -CFG.LANE_OFF);
      this.spawnTraffic(['sedan', 'taxi', 'coupe', 'van'][i % 4], x, y);
    }
    for (let i = 0; i < 12; i++) {
      this.spawnPed(500 + rand(0, 1800), this.world.roadH[6] + (i % 2 ? 1 : -1) * (CFG.ROAD_W / 2 + 12));
    }
    this.addPickup(900, this.world.roadH[6] - 46, 'ammo');
    this.addPickup(1400, this.world.roadH[6] - 46, 'health');
    this.addPickup(2600, this.world.roadH[6] - 46, 'armor');
  }

  // ---------- state flow ----------
  startPlay() {
    this.state = 'play';
    if (!this.shotMode) {
      this.missions.refreshSideMarkers();
      const m = this.missions.storyMarker();
      if (m) this.hud.subtitle('Follow the pink marker to start ' + m.label + '.', 4);
      if (this.missions.storyIndex === 0 && this.stats.time < 1) this.dialogue.play('intro', true);
    }
  }

  resetToTitle() {
    this.state = 'title';
    this.cars.length = 0;
    this.peds.length = 0;
    this.bullets.length = 0;
    this.particles.length = 0;
    this.police.clear();
    this.spawnInitial();
  }

  onPlayerDead(src) {
    if (this.state !== 'play') return;
    this.state = 'wasted';
    this.screenT = 0;
    this.audio?.explosion();
    this.dialogue?.onWasted();
    if (this.player.inCar) { this.player.inCar.driver = null; this.player.inCar = null; }
  }

  onBusted() {
    if (this.state !== 'play') return;
    this.state = 'busted';
    this.screenT = 0;
    this.audio?.star(5);
    this.dialogue?.onBusted();
  }

  // one-time milestone toasts
  checkAchievements() {
    const a = (id, cond, text) => {
      if (this.achievements[id] || !cond) return;
      this.achievements[id] = true;
      this.hud.toast('★ ' + text);
      this.audio?.missionTick?.();
    };
    a('jack', this.stats.carsJacked >= 1, 'First carjacked');
    a('jack10', this.stats.carsJacked >= 10, 'Ten cars, zero remorse');
    a('star3', this.police.wanted >= 3, 'Three stars of fame');
    a('rich', this.player.money >= 10000, 'Five figures in the bank');
    a('jump', this.stats.jumps >= 1, 'First stunt jump landed');
    a('wreck', this.stats.pedsWasted >= 5, 'The sidewalk belongs to you');
  }

  respawn() {
    const fee = this.state === 'wasted' ? CFG.WASTED_FEE : CFG.BUST_FEE * Math.max(1, this.police.wanted);
    this.player.money = Math.max(0, this.player.money - fee);
    this.player.hp = CFG.P_HP;
    this.player.armor = 0;
    this.player.alive = true;
    this.player.inCar = null;
    const poi = this.state === 'wasted' ? this.world.pois.hospital : this.world.pois.police;
    this.player.x = poi.x; this.player.y = poi.y - 40;
    this.cam.x = this.player.x; this.cam.y = this.player.y;
    this.police.clear();
    // clear cops and chasers
    for (const c of this.cars) if (c.type === 'police' && c.ai) c.despawn = true;
    for (const p of this.peds) if (p.kind === 'cop') p.despawn = true;
    this.state = 'play';
    this.hud.toast('Charged ' + '$' + fee);
  }

  onGameFinished() {
    if (this.state !== 'play' || this.state === 'end') return;
    if (this.missions.storyIndex >= 6) { this.state = 'end'; this.screenT = 0; }
  }

  // ---------- gameplay hooks ----------
  addWanted(n, reason) {
    this.police.addWanted(n, reason);
    this.stats.maxWanted = Math.max(this.stats.maxWanted, this.police.wanted);
  }

  onCarImpact(car, dmg) {
    this.audio?.crash?.(Math.min(1, dmg / 8));
    if (dmg > 2) this.fxSparks(car.x, car.y, 8);
  }

  onCarExplode(car) {
    this.flash = Math.min(1, this.flash + 0.55);
    this.cam.shake = Math.min(CFG.SHAKE_MAX, this.cam.shake + 14);
    this.audio?.explosion();
    // fire + smoke + debris burst
    for (let i = 0; i < 30; i++) {
      const a = rand(0, TAU), sp = rand(20, 160);
      this.particles.push({ x: car.x, y: car.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: rand(0.4, 1.4), life0: 1.4, kind: i % 3 ? 'fire' : 'debris', size: rand(4, 12) });
    }
    for (let i = 0; i < 16; i++) {
      this.particles.push({ x: car.x + rand(-30, 30), y: car.y + rand(-30, 30), vx: rand(-10, 10), vy: rand(-40, -10), life: rand(1.5, 3), life0: 3, kind: 'smoke', size: rand(10, 20) });
    }
    // radius damage
    for (const o of this.cars) {
      if (o === car) continue;
      const d = dist(o.x, o.y, car.x, car.y);
      if (d < 130 && o.state === 'drive') o.damage((130 - d) * 0.5, this);
    }
    for (const p of this.peds) {
      const d = dist(p.x, p.y, car.x, car.y);
      if (d < 110 && p.state !== 'dead') p.knock(this, (p.x - car.x) / d, (p.y - car.y) / d, (110 - d) * 1.1);
    }
    const pd = dist(this.player.x, this.player.y, car.x, car.y);
    if (pd < 110 && !this.player.inCar) this.player.damage(this, (110 - pd) * 0.7, 'explosion');
    if (this.player.inCar === car) this.player.damage(this, 45, 'explosion');
    if (car.type === 'police') this.addWanted(2, 'cop-car-destroyed');
    this.missions.onCarExploded(this, car);
  }

  onCarWater(car) {
    for (let i = 0; i < 14; i++) {
      this.particles.push({ x: car.x + rand(-20, 20), y: car.y + rand(-10, 10), vx: rand(-30, 30), vy: rand(-60, -10), life: rand(0.3, 0.8), life0: 0.8, kind: 'splash', size: 3 });
    }
    this.audio?.splash?.();
    if (this.player.inCar === car) {
      this.hud.subtitle('The Palm current wins. Nobody swims at night.', 3);
      this.player.damage(this, 200, 'water');
    }
  }

  onPedKilled(ped) {
    if (ped.kind === 'cop') this.addWanted(2, 'cop-down');
    else this.addWanted(1, 'murder');
    this.stats.pedsWasted++;
  }

  onPedHit(ped) {
    this.audio?.hurt?.();
    if (ped && ped.kind === 'cop') this.addWanted(1, 'assault-cop');
  }

  onPlayerShot() { this.lastShotAt = this.t; }

  onCarjack(car, forced) {
    if (forced) this.lastShotAt = this.t;
    this.stats.carsJacked++;
    this.radio.onEnterCar();
  }

  tryPickup(p) {
    for (let i = 0; i < this.pickups.length; i++) {
      const pk = this.pickups[i];
      if (dist(p.x, p.y, pk.x, pk.y) > 26) continue;
      if (pk.kind === 'ammo') { p.ammo += CFG.AMMO_PICKUP; this.hud.toast('+' + CFG.AMMO_PICKUP + ' rounds'); }
      else if (pk.kind === 'health') { p.heal(50); this.hud.toast('+50 HP'); }
      else if (pk.kind === 'armor') { p.armor = Math.min(CFG.P_ARMOR_MAX, p.armor + 50); this.hud.toast('+50 Armor'); }
      else if (pk.kind === 'package') { this.hud.toast('Package secured'); }
      else if (pk.kind === 'hidden') {
        this.stats.packages++;
        const left = this.world.hidden.length - this.stats.packages;
        if (left <= 0) {
          this.player.money += 5000;
          this.hud.banner('ALL PACKAGES FOUND', 'Respect+  $5,000');
          this.audio?.missionDone?.();
        } else {
          this.hud.toast(`Hidden package ${this.stats.packages}/${this.world.hidden.length}`);
        }
        this.audio?.missionTick?.();
      }
      this.pickups.splice(i, 1);
      this.audio?.missionTick?.();
      this.missions.onPickupTouched(this, pk);
      return;
    }
  }

  // ---------- fx helpers ----------
  fxSparks(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(60, 240);
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.15, 0.4), life0: 0.4, kind: 'spark', size: 2 });
    }
  }

  fxBurst(x, y, kind, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(20, 90);
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, life: rand(0.5, 1.2), life0: 1.2, kind, size: rand(3, 6) });
    }
  }

  fxHit(x, y) {
    this.fxSparks(x, y, 3);
    for (let i = 0; i < 4; i++) {
      this.particles.push({ x, y, vx: rand(-40, 40), vy: rand(-60, -10), life: 0.3, life0: 0.3, kind: 'spark', size: 2 });
    }
  }

  // ---------- save / load ----------
  save() {
    try {
      const p = this.player;
      const data = {
        v: 2, money: p.money, ammo: p.ammo, hp: p.hp, armor: p.armor,
        x: p.inCar ? p.inCar.x : p.x, y: p.inCar ? p.inCar.y : p.y,
        missions: this.missions.serialize(),
        stats: this.stats,
        radio: this.radio.serialize(),
        jumps: this.jumps.serialize(),
        transit: this.transit.serialize(),
        events: this.events.serialize(),
      };
      localStorage.setItem(CFG.SAVE_KEY, JSON.stringify(data));
      return true;
    } catch { return false; }
  }

  load() {
    try {
      const raw = localStorage.getItem(CFG.SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (!d || d.v !== 2) return false;
      const p = this.player;
      p.money = d.money ?? p.money;
      p.ammo = d.ammo ?? p.ammo;
      p.hp = d.hp ?? p.hp;
      p.armor = d.armor ?? p.armor;
      p.x = clamp(d.x ?? p.x, 20, CFG.W - 20);
      p.y = clamp(d.y ?? p.y, 20, CFG.H - 20);
      this.missions.deserialize(d.missions);
      if (d.stats) Object.assign(this.stats, d.stats);
      this.radio.deserialize(d.radio);
      this.jumps?.deserialize(d.jumps);
      this.transit?.deserialize(d.transit);
      this.events?.deserialize(d.events);
      // hidden packages already found stay gone
      if (d.stats && d.stats.packages) {
        const keep = Math.max(0, this.world.hidden.length - d.stats.packages);
        let seen = 0;
        this.pickups = this.pickups.filter((pk) => {
          if (pk.kind !== 'hidden') return true;
          return seen++ < keep;
        });
      }
      return true;
    } catch { return false; }
  }

  deleteSave() {
    try { localStorage.removeItem(CFG.SAVE_KEY); } catch { /* ignore */ }
  }

  // ---------- main update ----------
  update(dt) {
    // TAB toggles the city map from play/pause
    if ((this.state === 'play' || this.state === 'map') && this.input.pressed('TAB')) {
      this.state = this.state === 'map' ? 'play' : 'map';
      this.audio?.missionTick?.();
    }
    if (this.state === 'map') updateMap(this, dt);
    updateScreens(this, dt);
    if (this.state === 'play' || this.state === 'end') {
      this.t += dt;
      window.__vpTime = this.t;
      this.stepWorld(dt);
    } else if (this.state === 'title') {
      this.t += dt * 0.5;
      window.__vpTime = this.t;
      this.cam.x += dt * 24; // slow drift over the skyline-less world behind
    }
    this.flash = Math.max(0, this.flash - dt * CFG.FLASH_DECAY);
    this.cam.shake = Math.max(0, this.cam.shake - dt * 30);
    for (const pt of this.particles) {
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += (pt.kind === 'smoke' ? -14 : 120) * dt;
      pt.vx *= Math.pow(0.7, dt);
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);
    if (this.particles.length > 500) this.particles.splice(0, this.particles.length - 500);
  }

  stepWorld(dt) {
    const p = this.player;
    this.stats.time += dt;
    const ox = p.x, oy = p.y;
    // entities
    p.update(this, dt, this.input);
    this.stats.dist += dist(ox, oy, p.x, p.y);
    this.police.update(dt);
    this.missions.update(dt);
    this.shops.update(dt);
    this.weather.update(dt);
    this.radio.update(dt, !!p.inCar);
    this.jumps.update(dt);
    this.dialogue.update(dt);
    this.transit.update(dt);
    this.events.update(dt);
    this.checkAchievements();
    for (const c of this.cars) c.update(this, dt, this.input);
    for (const ped of this.peds) ped.update(this, dt);
    this.updateBullets(dt);
    this.updateCarCollisions(dt);
    this.updatePedCarCollisions(dt);
    this.updateSkids(dt);
    this.updateStream(dt);
    this.updateAudio(dt);
    this.updateCamera(dt);
  }

  updateBullets(dt) {
    for (const b of this.bullets) {
      b.ttl -= dt;
      const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
      // solids
      const solids = this.world.nearSolids(nx, ny);
      let dead = b.ttl <= 0;
      for (const r of solids) {
        if (nx >= r.x0 && nx <= r.x1 && ny >= r.y0 && ny <= r.y1) { dead = true; this.fxSparks(nx, ny, 3); break; }
      }
      // peds
      if (!dead) for (const ped of this.peds) {
        if (ped.state === 'dead' || ped.state === 'down') continue;
        if (dist(ped.x, ped.y, nx, ny) < ped.r + 3) {
          ped.knock(this, Math.cos(b.a), Math.sin(b.a), b.from === 'player' ? CFG.PISTOL_DMG : 12);
          if (b.from === 'player') this.onPlayerShot();
          dead = true;
          break;
        }
      }
      // player (cop bullets)
      if (!dead && b.from === 'cop' && this.player.alive && !this.player.inCar) {
        if (dist(this.player.x, this.player.y, nx, ny) < this.player.r + 4) {
          this.player.damage(this, 8, 'shot');
          dead = true;
        }
      }
      // player's car (cop bullets)
      if (!dead && b.from === 'cop' && this.player.inCar) {
        const c = this.player.inCar;
        if (carContains(c, nx, ny, 2)) { c.damage(5, this); dead = true; }
      }
      // cars
      if (!dead) for (const c of this.cars) {
        if (c.state === 'wreck') continue;
        if (Math.abs(c.x - nx) > 100 || Math.abs(c.y - ny) > 100) continue;
        if (carContains(c, nx, ny, 1)) {
          c.damage(b.from === 'player' ? CFG.PISTOL_DMG * 0.9 : 3, this);
          if (b.from === 'player') { this.fxSparks(nx, ny, 2); this.onPlayerShot(); }
          dead = true;
          break;
        }
      }
      if (!dead) { b.x = nx; b.y = ny; }
      else b.ttl = 0;
    }
    this.bullets = this.bullets.filter((b) => b.ttl > 0);
  }

  updateCarCollisions(dt) {
    const cars = this.cars;
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i];
      if (a.state === 'wreck') continue;
      for (let j = i + 1; j < cars.length; j++) {
        const b = cars[j];
        if (b.state === 'wreck') continue;
        if (Math.abs(a.x - b.x) > 160 || Math.abs(a.y - b.y) > 160) continue;
        // test corners of each against the other box
        const hit = carVsCar(a, b);
        if (!hit) continue;
        const impact = Math.abs(a.speed - b.speed) + Math.abs(a.speedLat) + Math.abs(b.speedLat);
        const nx = hit.x, ny = hit.y;
        a.x += nx * 0.5; a.y += ny * 0.5;
        b.x -= nx * 0.5; b.y -= ny * 0.5;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel < 0) {
          a.vx -= rel * nx * 0.9; a.vy -= rel * ny * 0.9;
          b.vx += rel * nx * 0.9; b.vy += rel * ny * 0.9;
        }
        if (impact > 90) {
          const dmg = impact / 22;
          a.impact(dmg, this);
          b.impact(dmg, this);
          this.fxSparks((a.x + b.x) / 2, (a.y + b.y) / 2, 6);
          this.audio?.crash?.(Math.min(1, impact / 400));
          // player hits AI car while wanted-worthy
          const p = this.player;
          if (p.inCar === a && b.type === 'police' && b.driver === 'ai') this.addWanted(1, 'cop-ram');
          if (p.inCar === b && a.type === 'police' && a.driver === 'ai') this.addWanted(1, 'cop-ram');
        }
      }
    }
  }

  updatePedCarCollisions(dt) {
    for (const c of this.cars) {
      if (c.speed < 30 || c.state === 'wreck') continue;
      for (const ped of this.peds) {
        if (ped.state === 'down' || ped.state === 'dead') continue;
        if (Math.abs(ped.x - c.x) > 100 || Math.abs(ped.y - c.y) > 100) continue;
        if (carCircle(c, ped.x, ped.y, ped.r)) {
          ped.knock(this, c.vx * 0.02, c.vy * 0.02, c.speed / 3);
          this.fxHit(ped.x, ped.y);
          const p = this.player;
          if (p.inCar === c) this.addWanted(ped.kind === 'cop' ? 2 : 1, 'hit-and-run');
        }
      }
      // player on foot vs moving car handled in player.moveCollide
    }
  }

  updateSkids(dt) {
    this.skidT -= dt;
    let screeching = false;
    if (this.skidT > 0) return;
    this.skidT = 0.06;
    for (const c of this.cars) {
      if (c.skidT <= 0 || c.state === 'wreck') continue;
      screeching = true;
      const s = Math.sin(c.h), co = Math.cos(c.h);
      const back = -c.len / 3;
      const ax = c.x + back * co - (c.wid / 2 - 4) * -s;
      const ay = c.y + back * s - (c.wid / 2 - 4) * co;
      const bx = c.x + back * co + (c.wid / 2 - 4) * -s;
      const by = c.y + back * s + (c.wid / 2 - 4) * co;
      this.skids.push({ x0: ax, y0: ay, x1: ax + c.vx * 0.06, y1: ay + c.vy * 0.06 });
      this.skids.push({ x0: bx, y0: by, x1: bx + c.vx * 0.06, y1: by + c.vy * 0.06 });
    }
    if (this.skids.length > 400) this.skids.splice(0, this.skids.length - 400);
    if (screeching) {
      this.screechT = (this.screechT || 0) - 0.06;
      if (this.screechT <= 0) { this.screechT = 0.34; this.audio?.screech?.(); }
    }
  }

  // stream entities in/out around the player
  updateStream(dt) {
    const p = this.player;
    const px = p.inCar ? p.inCar.x : p.x, py = p.inCar ? p.inCar.y : p.y;
    // despawn
    this.cars = this.cars.filter((c) => {
      if (c.despawn) return false;
      if (c === p.inCar || c.driver === 'player') return true;
      if (c.marker || c === this.missions.active?.data?.car) return true;
      const d = dist(c.x, c.y, px, py);
      if (d > 1900) return false;
      if (c.type === 'police' && c.ai && this.police.wanted > 0) return true;
      return true;
    });
    this.peds = this.peds.filter((pd) => {
      if (pd.despawn) return false;
      return dist(pd.x, pd.y, px, py) < 1400;
    });
    // respawn ambient traffic ahead
    this.streamT = (this.streamT || 0) - dt;
    if (this.streamT <= 0) {
      this.streamT = 0.7;
      const ambient = this.cars.filter((c) => c.driver === 'ai' && c.ai && !c.type.includes('police')).length;
      if (ambient < 9) {
        const ang = rand(0, TAU);
        const x = clamp(px + Math.cos(ang) * 900, 200, CFG.W - 200);
        const y = clamp(py + Math.sin(ang) * 900, 400, CFG.SAND_S - 80);
        const t = ['sedan', 'taxi', 'van', 'pickup', 'coupe'][(Math.random() * 5) | 0];
        const car = this.spawnTraffic(t, x, y);
      }
      const peds = this.peds.filter((pd) => pd.kind !== 'cop').length;
      if (peds < 14) {
        const ang = rand(0, TAU);
        this.spawnPed(clamp(px + Math.cos(ang) * 700, 200, CFG.W - 200), clamp(py + Math.sin(ang) * 700, 400, CFG.SAND_S - 40));
      }
    }
  }

  updateAudio(dt) {
    const p = this.player;
    if (p.inCar && p.inCar.state !== 'wreck') this.audio?.engine(p.inCar.engineLevel, true);
    else this.audio?.engine(0, false);
    // siren proximity
    let prox = 0;
    for (const c of this.cars) {
      if (c.type === 'police' && c.siren && c.driver === 'ai') {
        const d = dist(c.x, c.y, p.x, p.y);
        prox = Math.max(prox, clamp(1 - d / 700, 0, 1));
      }
    }
    this.audio?.siren(prox);
    this.audio?.setRain(this.weather ? this.weather.intensity : 0);
  }

  updateCamera(dt) {
    const p = this.player;
    let tx = p.x, ty = p.y;
    if (p.inCar) {
      // lead the camera into the direction of travel
      tx = p.inCar.x + p.inCar.vx * 0.55;
      ty = p.inCar.y + p.inCar.vy * 0.55;
    }
    const k = Math.min(1, dt * CFG.CAM_LERP);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
  }

  // ---------- draw ----------
  draw(ctx, dt) {
    render(this, ctx);
    if (this.state !== 'title') this.hud.update(this, dt, ctx);
    drawScreens(this, ctx);
    if (this.state === 'map') drawMap(this, ctx);
  }
}

// oriented-box vs oriented-box separation via corner sampling
function carVsCar(a, b) {
  const corners = (c) => {
    const cs = Math.cos(c.h), sn = Math.sin(c.h);
    const hl = c.len / 2, hw = c.wid / 2;
    return [[hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw], [0, 0]].map(([lx, ly]) => [c.x + lx * cs - ly * sn, c.y + lx * sn + ly * cs]);
  };
  for (const [ax, ay] of corners(a)) {
    if (carContains(b, ax, ay, 1)) {
      // push along the line between centers
      const dx = a.x - b.x, dy = a.y - b.y;
      const d = Math.hypot(dx, dy) || 1;
      return { x: dx / d * 2.2, y: dy / d * 2.2 };
    }
  }
  for (const [bx, by] of corners(b)) {
    if (carContains(a, bx, by, 1)) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      return { x: -dx / d * 2.2, y: -dy / d * 2.2 };
    }
  }
  return null;
}

// ChaseAI (defined in police.js) is used by addChaser via the static import above.
