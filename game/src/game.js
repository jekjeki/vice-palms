// The game itself: world state, the update loop for every system, entity-vs-entity events
// (bullets, explosions, carjacking, run-overs), camera control and the wasted/busted flows.

import { BLOCKS, PITCH, BEACH_W, VEHICLES, STEP } from './config.js';
import { blockCenter, generateCity, collideCircle, solidsNear } from './world/city.js';
import { Player } from './player.js';
import { Vehicle, setVehicleCollision } from './entities/vehicle.js';
import { Ped } from './entities/pedestrian.js';
import { BulletPool, Particles } from './entities/fx.js';
import { Traffic } from './systems/traffic.js';
import { Police } from './systems/police.js';
import { Wanted } from './systems/wanted.js';
import { Missions } from './systems/missions.js';
import { Audio } from './audio.js';
import { writeSave } from './systems/save.js';
import { dist2, clamp } from './util.js';
import { createRandom, derive } from './random.js';

export const HOSPITAL = blockCenter(17, 24);
export const STATION = blockCenter(9, 12);

export class Game {
  constructor(seed, opts = {}) {
    this.seed = seed;
    this.city = generateCity(seed);
    this.time = 0;
    this.state = 'play';           // play | wasted | busted | over
    this.stateT = 0;
    this.vehicles = [];
    this.peds = [];
    this.bullets = new BulletPool();
    this.fx = new Particles();
    this.audio = new Audio();
    this.police = new Police(this);
    this.traffic = new Traffic(this);
    this.wanted = new Wanted(this);
    this.missions = new Missions(this);
    this.pickups = [];
    this.shotMode = opts.shotMode ?? false;

    const start = blockCenter(12, 23);
    this.player = new Player(this, opts.playerX ?? start.x, opts.playerY ?? start.y);
    this.player.money = opts.money ?? 250;
    if (opts.missionIndex) this.missions.index = opts.missionIndex;
    this.camera = { x: this.player.x, y: this.player.y, zoom: 0.9 };

    setVehicleCollision((v) => this.vehicleCollide(v));
    this.spawnInitialPeds();
    this.spawnPickups(opts.seedPickups ?? derive(seed, 0x7a2e));
  }

  // ---------------------------------------------------------------- population

  spawnVehicle(defIndex, x, y, ang) {
    const v = new Vehicle(defIndex, x, y, ang);
    this.vehicles.push(v);
    return v;
  }

  spawnInitialPeds() {
    // A crowd around the player's start block; traffic.js and police.js manage their own.
    for (let n = 0; n < 26; n++) {
      const i = 11 + (n % 4), j = 22 + ((n * 3) % 4);
      const x = i * PITCH + 60 + ((n * 97) % (PITCH - 120));
      const y = j * PITCH + 60 + ((n * 53) % (PITCH - 120));
      const p = new Ped(x, y, n * 13 + 1);
      this.peds.push(p);
    }
  }

  spawnPickups(seed) {
    const rand = createRandom(derive(seed, 0x3c1f));
    const kinds = ['pistol', 'health', 'armor', 'cash', 'cash', 'health', 'pistol', 'armor', 'cash', 'health', 'cash', 'armor'];
    for (let n = 0; n < kinds.length; n++) {
      const i = 2 + Math.floor(rand() * (BLOCKS - 4));
      const j = 2 + Math.floor(rand() * (BLOCKS - 4));
      const corner = (rand() * 4) | 0;
      const bx = i * PITCH + 60, by = j * PITCH + 60;
      this.pickups.push({
        x: bx + (corner % 2) * (PITCH - 120),
        y: by + (corner > 1 ? 1 : 0) * (PITCH - 120),
        kind: kinds[n], amount: 80 + Math.floor(rand() * 160),
        phase: rand() * 6.28,
      });
    }
  }

  // ---------------------------------------------------------------- update

  update(dt, input) {
    if (this.state !== 'play') {
      this.stateT -= dt;
      if (this.stateT <= 0) this.respawn();
      this.fx.update(dt);
      return;
    }
    this.time += dt;
    const p = this.player;
    p.update(dt, input);
    this.traffic.update(dt, p);
    this.wanted.update(dt, p);
    this.police.update(dt, this.wanted.stars, p);
    this.missions.update(dt, p);

    for (const v of this.vehicles) v.update(dt, this);
    for (const ped of this.peds) ped.update(dt, this);
    this.bullets.update(dt, this);
    this.fx.update(dt);
    this.vehicleCollisions(dt, p);
    this.runOverCheck(p);
    this.pickupCheck(p);
    if (this.police.bustedCheck(dt, p, this.wanted.stars)) {
      this.state = 'busted';
      this.stateT = 2.6;
      this.audio.blip(120);
    }
    this.updateCamera(dt);
    this.audio.update(dt, this);
  }

  updateCamera(dt) {
    const p = this.player;
    const car = p.inCar;
    const vx = car ? car.vx : p.vx;
    const vy = car ? car.vy : p.vy;
    const speed = Math.hypot(vx, vy);
    const look = car ? 0.55 : 0.25;
    const tx = p.x + vx * look;
    const ty = p.y + vy * look;
    this.camera.x += (tx - this.camera.x) * Math.min(1, dt * 4);
    this.camera.y += (ty - this.camera.y) * Math.min(1, dt * 4);
    const zoomTarget = car && speed > 200 ? 0.78 : car ? 0.84 : 0.95;
    this.camera.zoom += (zoomTarget - this.camera.zoom) * Math.min(1, dt * 2);
  }

  // ---------------------------------------------------------------- events

  proximity(x, y) {
    return clamp(1 - Math.hypot(x - this.player.x, y - this.player.y) / 1100, 0.05, 1);
  }

  onBullet(b) {
    // Buildings stop bullets.
    if (this.pointInBuilding(b.x, b.y)) { b.active = false; this.fx.sparks(b.x, b.y, 2); return; }
    if (b.fromPlayer) {
      for (const ped of this.peds) {
        if (ped.state === 'down' || ped.dead) continue;
        if (dist2(ped.x, ped.y, b.x, b.y) < 14 * 14) {
          b.active = false;
          const wasCop = ped.isCop === true;
          const down = ped.hurt(this, b.damage, b.x, b.y);
          if (wasCop && down) this.wanted.add('copKill');
          else if (!wasCop) this.wanted.add(down ? 'pedKill' : 'pedHit');
          this.alertNearbyPeds(ped.x, ped.y, 420);
          return;
        }
      }
      for (const v of this.vehicles) {
        if (v.exploded || v === this.player.inCar) continue;
        if (dist2(v.x, v.y, b.x, b.y) < v.radius * v.radius) {
          b.active = false;
          v.damage(b.damage * 0.7, this);
          this.fx.sparks(b.x, b.y, 3);
          if (v.role === 'cop' && v.dead) this.wanted.add('copKill');
          return;
        }
      }
    } else {
      const p = this.player;
      if (!p.inCar && !p.dead && dist2(p.x, p.y, b.x, b.y) < 12 * 12) {
        b.active = false;
        p.hit(b.damage, b.x, b.y);
        return;
      }
      const car = p.inCar;
      if (car && !car.dead && dist2(car.x, car.y, b.x, b.y) < (car.radius + 6) ** 2) {
        b.active = false;
        car.damage(b.damage * 0.6, this);
        this.fx.sparks(b.x, b.y, 3);
      }
    }
  }

  pointInBuilding(x, y) {
    const solids = solidsNear(this.city, x, y, []);
    for (let i = 0; i < solids.length; i++) {
      const s = solids[i];
      if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return true;
    }
    return false;
  }

  onExplosion(v) {
    // Blast damages everything nearby, including the player's own ride and bystanders.
    const R = 190;
    for (const other of this.vehicles) {
      if (other === v || other.exploded) continue;
      const d = Math.hypot(other.x - v.x, other.y - v.y);
      if (d < R) other.damage((1 - d / R) * 120, this);
    }
    for (const ped of this.peds) {
      if (ped.state === 'down' || ped.dead) continue;
      const d = Math.hypot(ped.x - v.x, ped.y - v.y);
      if (d < R) {
        const wasCop = ped.isCop === true;
        const down = ped.hurt(this, (1 - d / R) * 90, v.x, v.y);
        if (!wasCop && down) this.wanted.add('pedKill');
        if (wasCop && down) this.wanted.add('copKill');
      }
    }
    if (!this.player.inCar) {
      const d = Math.hypot(this.player.x - v.x, this.player.y - v.y);
      if (d < R) this.player.hit((1 - d / R) * 80, v.x, v.y);
    }
    this.alertNearbyPeds(v.x, v.y, 700);
    this.missions.notifyVehicleDestroyed(v);
    if (v.role === 'cop') this.wanted.add('copKill');
  }

  onPedKilled(ped) {
    this.alertNearbyPeds(ped.x, ped.y, 500);
  }

  onWantedStart() { /* hook for police surge */ }
  onWantedClear() { this.police.spawnT = 0; }

  onPlayerVehicleBurning(car) {
    // Bail out of a burning car automatically; the player gets two seconds of grace.
    if (this.player.inCar === car) this.exitVehicle(true);
  }

  onPlayerWasted() {
    this.state = 'wasted';
    this.stateT = 3.0;
    this.audio.explosion(0.4);
  }

  respawn() {
    const p = this.player;
    const busted = this.state === 'busted';
    const fee = Math.max(50, Math.floor(p.money * (busted ? 0.2 : 0.15)));
    p.money = Math.max(0, p.money - fee);
    const spot = busted ? STATION : HOSPITAL;
    p.x = spot.x; p.y = spot.y - 80;
    p.vx = 0; p.vy = 0;
    p.health = 100;
    p.armor = 0;
    p.dead = false;
    p.inCar = null;
    p.ammo = Math.floor(p.ammo / 2);
    this.wanted.clear();
    this.state = 'play';
    this.camera.x = p.x; this.camera.y = p.y;
    this.save();
  }

  // ---------------------------------------------------------------- interactions

  tryEnterVehicle() {
    const p = this.player;
    if (p.inCar) return;
    let best = null, bestD = 80 * 80;
    for (const v of this.vehicles) {
      if (v.dead || v.exploded) continue;
      const d = dist2(v.x, v.y, p.x, p.y);
      if (d < bestD) { best = v; bestD = d; }
    }
    if (!best) return;
    if (best.role === 'traffic' || best.role === 'cop') {
      // Carjack: the driver bails and runs.
      const ped = new Ped(best.x + 30, best.y + 20, (Math.random() * 999) | 0);
      ped.flee(p.x, p.y);
      this.peds.push(ped);
      this.wanted.add(best.role === 'cop' ? 'copKill' : 'carjack');
      if (best.role === 'cop') this.wanted.stars = Math.max(this.wanted.stars, 2);
      this.alertNearbyPeds(best.x, best.y, 380);
    }
    best.role = 'player';
    best.siren = false;
    p.inCar = best;
    this.audio.ensure();
    this.audio.blip(330);
  }

  exitVehicle(force = false) {
    const p = this.player;
    const car = p.inCar;
    if (!car) return;
    if (!force && Math.abs(car.speed) > 140) return; // too fast to jump out
    car.role = force ? 'parked' : 'parked';
    car.throttle = 0; car.brake = 0; car.steer = 0; car.handbrake = false;
    const side = car.def.wid / 2 + 16;
    p.x = car.x - Math.sin(car.ang) * side;
    p.y = car.y + Math.cos(car.ang) * side;
    p.inCar = null;
  }

  honk(car) {
    this.alertNearbyPeds(car.x + Math.cos(car.ang) * 60, car.y + Math.sin(car.ang) * 60, 260);
  }

  alertNearbyPeds(x, y, r) {
    for (const ped of this.peds) {
      if (ped.state === 'down' || ped.isCop) continue;
      if (dist2(ped.x, ped.y, x, y) < r * r) ped.flee(x, y);
    }
  }

  // ---------------------------------------------------------------- collisions

  vehicleCollide(v) {
    const res = collideCircle(this.city, v.x, v.y, v.radius);
    if (!res.hit) return null;
    // Approximate the wall normal from the push direction.
    const dx = res.x - v.x, dy = res.y - v.y;
    const len = Math.hypot(dx, dy) || 1;
    return { nx: -dx / len, ny: -dy / len };
  }

  vehicleCollisions(dt, p) {
    // The player's car against every other vehicle nearby.
    const car = p.inCar;
    if (!car || car.dead) return;
    for (const other of this.vehicles) {
      if (other === car || other.exploded) continue;
      const d = Math.hypot(other.x - car.x, other.y - car.y);
      const min = other.radius + car.radius;
      if (d >= min || d < 0.001) continue;
      const nx = (other.x - car.x) / d, ny = (other.y - car.y) / d;
      const impact = Math.abs(car.vx * nx + car.vy * ny);
      const push = (min - d) * 0.6;
      other.x += nx * push; other.y += ny * push;
      car.x -= nx * push * 0.5; car.y -= ny * push * 0.5;
      if (impact > 100) {
        car.damage((impact - 100) * 0.06, this);
        if (other.role === 'traffic') this.traffic.ram(other, car.x, car.y, impact, this);
        else other.damage((impact - 100) * 0.08, this);
        this.fx.sparks((car.x + other.x) / 2, (car.y + other.y) / 2, 5);
        this.audio.crash(Math.min(1, impact / 420));
      }
    }
  }

  runOverCheck(p) {
    const car = p.inCar;
    if (!car || car.dead) return;
    const speed = Math.hypot(car.vx, car.vy);
    if (speed < 60) return;
    for (const ped of this.peds) {
      if (ped.state === 'down' || ped.dead) continue;
      if (dist2(ped.x, ped.y, car.x, car.y) < (car.radius + 8) ** 2) {
        const wasCop = ped.isCop === true;
        const down = ped.hurt(this, speed * 0.4, car.x, car.y);
        this.wanted.add(down ? 'pedKill' : 'pedHit');
        this.fx.blood(ped.x, ped.y, 5);
        if (wasCop && down) this.wanted.add('copKill');
      }
    }
  }

  pickupCheck(p) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      if (dist2(pk.x, pk.y, p.x, p.y) < 34 * 34) {
        p.pickup(pk.kind, pk.amount);
        this.pickups.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------- save

  save() {
    if (this.shotMode) return;
    const p = this.player;
    writeSave({
      money: p.money,
      missionIndex: this.missions.index,
      x: p.x, y: p.y,
      health: p.health, armor: p.armor, ammo: p.ammo, weapon: p.weapon,
      sound: this.audio.enabled,
    });
  }
}
