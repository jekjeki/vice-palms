// The game itself: world state, the fixed-step update order, bullet and blast resolution,
// carjacking, run-overs, pickups, the camera with its shake, and the WASTED/BUSTED flows.

import { GRID, PITCH, SAND, STEP } from './config.js';
import { blockCenter, generateCity, collideCity, buildingsNear } from './world/city.js';
import { Hero } from './player.js';
import { Car, setWorldCollide } from './entities/car.js';
import { Person } from './entities/person.js';
import { Bullets, Particles } from './entities/particles.js';
import { Traffic, laneAt } from './systems/traffic.js';
import { Cops } from './systems/cops.js';
import { Wanted } from './systems/wanted.js';
import { Missions } from './systems/missions.js';
import { Audio } from './audio.js';
import { writeSave } from './systems/save.js';
import { dist2, clamp, lerp } from './util.js';
import { remix, mulberry, rand, randInt, seedRun } from './rng.js';
import { Grid } from './spatial.js';

export const HOSPITAL = { x: 15 * PITCH, y: 22 * PITCH };
export const STATION = { x: 8 * PITCH, y: 11 * PITCH };

const PED_KEEP = 42;        // people kept alive around the player
const PED_CULL = 2800;      // cull radius
const PED_BAND = 500;       // spawn ring depth

export class Game {
  constructor(seed, opts = {}) {
    this.seed = seed;
    this.city = generateCity(seed);
    this.time = 0;
    this.state = 'play';           // play | wasted | busted
    this.stateT = 0;
    this.cars = [];
    this.people = [];
    this.bullets = new Bullets();
    this.fx = new Particles();
    this.audio = new Audio();
    this.grid = null;              // broad-phase, built each step in update()
    this.traffic = new Traffic(this);
    this.cops = new Cops(this);
    this.wanted = new Wanted(this);
    this.missions = new Missions(this);
    this.pickups = [];
    this.shotMode = opts.shotMode ?? false;
    this.shake = 0;                // explosion camera shake, decays every step
    this.flash = 0;                // blast screen flash, decays every step

    const start = blockCenter(12, 23);
    this.player = new Hero(this, opts.playerX ?? start.x, opts.playerY ?? start.y);
    this.player.money = opts.money ?? 250;
    if (opts.missionIndex) this.missions.cursor = opts.missionIndex;
    this.camera = { x: this.player.x, y: this.player.y, zoom: 0.9 };

    setWorldCollide((c) => this.carWall(c));
    this.seedWorld();
    this.spawnLotCars();
    this.spawnStarterPeople();
    this.spawnPickups(opts.seedPickups ?? remix(seed, 0x7a2e));
  }

  // ---------------------------------------------------------------- population

  spawnCar(specIndex, x, y, ang) {
    const c = new Car(specIndex, x, y, ang);
    this.cars.push(c);
    return c;
  }

  seedWorld() {
    // Point the runtime stream at this seed so spawns are deterministic per URL.
    seedRun(remix(this.seed, 0x11c7));
  }

  spawnLotCars() {
    for (const spot of this.city.lotCars) {
      const c = this.spawnCar(spot.def, spot.x, spot.y, spot.ang);
      c.role = 'parked';
    }
  }

  spawnStarterPeople() {
    for (let n = 0; n < 30; n++) {
      const i = 10 + randInt(6), j = 20 + randInt(6);
      const x = i * PITCH + 60 + randInt(PITCH - 120);
      const y = j * PITCH + 60 + randInt(PITCH - 120);
      this.people.push(new Person(x, y, n * 13 + 1));
    }
  }

  /** Keep the sidewalks peopled: spawn into a ring, cull the far and the long-fallen. */
  peoplePatrol(dt) {
    const p = this.player;
    for (let i = this.people.length - 1; i >= 0; i--) {
      const person = this.people[i];
      if (person.isCop) continue;
      // The downed stay as evidence a while, then the street forgets them.
      if (person.mode === 'down' && person.downT <= 0) { this.people.splice(i, 1); continue; }
      if (dist2(person.x, person.y, p.x, p.y) > PED_CULL * PED_CULL) {
        this.people.splice(i, 1);
      }
    }
    let count = 0;
    for (const person of this.people) if (!person.isCop) count++;
    while (count < PED_KEEP) {
      const ang = rand() * Math.PI * 2;
      const r = 900 + rand() * PED_BAND * 2;
      const x = p.x + Math.cos(ang) * r;
      const y = p.y + Math.sin(ang) * r;
      if (x < 60 || y < 60 || x > GRID * PITCH - 60 || y > GRID * PITCH - 60) break;
      this.people.push(new Person(x, y, (rand() * 1000) | 0));
      count++;
    }
  }

  spawnPickups(seed) {
    const gen = mulberry(remix(seed, 0x3c1f));
    const kinds = ['pistol', 'health', 'armor', 'cash', 'cash', 'health', 'pistol', 'armor', 'cash', 'health', 'cash', 'armor'];
    for (let n = 0; n < kinds.length; n++) {
      const i = 2 + Math.floor(gen() * (GRID - 4));
      const j = 2 + Math.floor(gen() * (GRID - 4));
      const corner = (gen() * 4) | 0;
      const bx = i * PITCH + 60, by = j * PITCH + 60;
      this.pickups.push({
        x: bx + (corner % 2) * (PITCH - 120),
        y: by + (corner > 1 ? 1 : 0) * (PITCH - 120),
        kind: kinds[n], amount: 80 + Math.floor(gen() * 160),
        phase: gen() * 6.28,
      });
    }
  }

  // ---------------------------------------------------------------- update

  update(dt, input) {
    if (this.state !== 'play') {
      this.stateT -= dt;
      if (this.stateT <= 0) this.respawn();
      this.fx.update(dt);
      this.decayShake(dt);
      return;
    }
    this.time += dt;
    const p = this.player;
    p.update(dt, input);
    if (p.car) p.car.drive(dt, this);   // the player's ride runs the full physics step
    this.traffic.update(dt, p);
    this.wanted.update(dt, p);
    this.cops.update(dt, this.wanted.stars, p);
    this.missions.update(dt, p);
    this.peoplePatrol(dt);

    // Broad-phase build: cars and people register into the grid each step.
    if (!this.grid) this.grid = new Grid();
    this.grid.clear();
    for (const c of this.cars) if (!c.wasted) this.grid.add(c, c.x, c.y, c.radius);
    for (const person of this.people) if (person.mode !== 'down') this.grid.add(person, person.x, person.y, 10);

    for (const c of this.cars) c.update(dt, this);
    for (const person of this.people) person.update(dt, this);
    this.bullets.update(dt, this);
    this.fx.update(dt);
    this.carContacts(dt, p);
    this.runOverCheck(p);
    this.grabPickups(p);
    this.decayShake(dt);
    if (this.cops.cornered(dt, p, this.wanted.stars)) {
      this.state = 'busted';
      this.stateT = 2.6;
      this.audio.blip(120);
    }
    this.followCamera(dt);
    this.audio.update(dt, this);
  }

  decayShake(dt) {
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt * 2.6);
  }

  followCamera(dt) {
    const p = this.player;
    const car = p.car;
    const speed = Math.hypot(car ? car.vx : p.vx, car ? car.vy : p.vy);
    const look = car ? 0.55 : 0.25;
    const tx = p.x + (car ? car.vx : p.vx) * look;
    const ty = p.y + (car ? car.vy : p.vy) * look;
    const k = Math.min(1, dt * 4);
    this.camera.x = lerp(this.camera.x, tx, k);
    this.camera.y = lerp(this.camera.y, ty, k);
    const zoomTarget = car && speed > 200 ? 0.78 : car ? 0.84 : 0.95;
    this.camera.zoom = lerp(this.camera.zoom, zoomTarget, Math.min(1, dt * 2));
  }

  // ---------------------------------------------------------------- events

  proximity(x, y) {
    return clamp(1 - Math.hypot(x - this.player.x, y - this.player.y) / 1100, 0.05, 1);
  }

  onBullet(b) {
    // Buildings stop every bullet.
    const walls = buildingsNear(this.city, b.x, b.y, this._wallScratch ??= []);
    for (const s of walls) {
      if (b.x >= s.x && b.x <= s.x + s.w && b.y >= s.y && b.y <= s.y + s.h) {
        b.live = false;
        this.fx.sparks(b.x, b.y, 2);
        return;
      }
    }
    if (b.fromPlayer) {
      for (const person of this.people) {
        if (person.mode === 'down') continue;
        if (dist2(person.x, person.y, b.x, b.y) < 14 * 14) {
          b.live = false;
          const cop = person.isCop === true;
          const down = person.hurt(this, b.dmg, b.x, b.y);
          if (cop && down) this.wanted.add('copKill');
          else if (!cop) this.wanted.add(down ? 'pedKill' : 'pedHit');
          this.scarePeople(person.x, person.y, 430);
          return;
        }
      }
      for (const c of this.cars) {
        if (c.wasted || c === this.player.car) continue;
        if (dist2(c.x, c.y, b.x, b.y) < c.radius * c.radius) {
          b.live = false;
          c.damage(b.dmg * 0.7, this);
          this.fx.sparks(b.x, b.y, 3);
          if (c.role === 'cop' && c.wreck) this.wanted.add('copKill');
          return;
        }
      }
    } else {
      const p = this.player;
      if (!p.car && !p.dead && dist2(p.x, p.y, b.x, b.y) < 12 * 12) {
        b.live = false;
        p.hit(b.dmg, b.x, b.y);
        return;
      }
      const car = p.car;
      if (car && !car.wreck && dist2(car.x, car.y, b.x, b.y) < (car.radius + 6) ** 2) {
        b.live = false;
        car.damage(b.dmg * 0.6, this);
        this.fx.sparks(b.x, b.y, 3);
      }
    }
  }

  onBlast(v) {
    // The blast tears into everything nearby — other cars, people, the player's own ride.
    const R = 195;
    for (const other of this.cars) {
      if (other === v || other.wasted) continue;
      const d = Math.hypot(other.x - v.x, other.y - v.y);
      if (d < R) other.damage((1 - d / R) * 120, this);
    }
    for (const person of this.people) {
      if (person.mode === 'down') continue;
      const d = Math.hypot(person.x - v.x, person.y - v.y);
      if (d < R) {
        const cop = person.isCop === true;
        const down = person.hurt(this, (1 - d / R) * 90, v.x, v.y);
        if (!cop && down) this.wanted.add('pedKill');
        if (cop && down) this.wanted.add('copKill');
      }
    }
    if (!this.player.car) {
      const d = Math.hypot(this.player.x - v.x, this.player.y - v.y);
      if (d < R) this.player.hit((1 - d / R) * 80, v.x, v.y);
    }
    this.scarePeople(v.x, v.y, 720);
    this.missions.vehicleGone(v);
    if (v.role === 'cop') this.wanted.add('copKill');
    // Camera shake scaled by how close the blast was; the flash washes the frame.
    this.shake = Math.min(18, this.shake + 16 * this.proximity(v.x, v.y) + 3);
    this.flash = Math.min(0.9, this.flash + 0.45 + 0.45 * this.proximity(v.x, v.y));
  }

  onPersonDown(person) {
    this.scarePeople(person.x, person.y, 520);
  }

  onWantedBegin() { /* hook for the police surge */ }
  onWantedClear() { this.cops.spawnT = 0; }

  onPlayerCarBurning(car) {
    // Bail out of a burning ride automatically; the walk away is the grace period.
    if (this.player.car === car) this.leaveCar(true);
  }

  onHeroDown() {
    this.state = 'wasted';
    this.stateT = 3.0;
    this.audio.boom(0.4);
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
    p.car = null;
    p.ammo = Math.floor(p.ammo / 2);
    this.wanted.clear();
    this.shake = 0; this.flash = 0;   // the blast wash dies with the failure screen
    this.state = 'play';
    this.camera.x = p.x; this.camera.y = p.y;
    this.save();
  }

  // ---------------------------------------------------------------- interactions

  tryCar() {
    const p = this.player;
    if (p.car) return;
    let best = null, bestD = 82 * 82;
    for (const c of this.cars) {
      if (c.wreck || c.wasted) continue;
      const d = dist2(c.x, c.y, p.x, p.y);
      if (d < bestD) { best = c; bestD = d; }
    }
    if (!best) return;
    if (best.role === 'traffic' || best.role === 'cop') {
      // Carjack: the driver bails out the side and runs.
      const driver = new Person(best.x - Math.sin(best.ang) * 34, best.y + Math.cos(best.ang) * 34, (rand() * 999) | 0);
      driver.graceT = 1.5;
      driver.bolt(p.x, p.y);
      this.people.push(driver);
      // Stealing a cruiser is the heaviest single crime on the meter (copKill heat).
      this.wanted.add(best.role === 'cop' ? 'copKill' : 'carjack');
      this.scarePeople(best.x, best.y, 380);
    }
    best.role = 'player';
    best.siren = false;
    p.car = best;
    this.audio.ensure();
    this.audio.blip(330);
  }

  leaveCar(force = false) {
    const p = this.player;
    const car = p.car;
    if (!car) return;
    if (!force && Math.abs(car.fwd) > 140) return; // too fast to jump
    car.role = 'parked';
    car.gas = 0; car.brake = 0; car.steer = 0; car.slide = false;
    const side = car.spec.wid / 2 + 16;
    p.x = car.x - Math.sin(car.ang) * side;
    p.y = car.y + Math.cos(car.ang) * side;
    p.car = null;
  }

  honk(car) {
    this.scarePeople(car.x + Math.cos(car.ang) * 60, car.y + Math.sin(car.ang) * 60, 260);
  }

  scarePeople(x, y, r) {
    for (const person of this.people) {
      if (person.mode === 'down' || person.isCop) continue;
      if (dist2(person.x, person.y, x, y) < r * r) person.bolt(x, y);
    }
  }

  // ---------------------------------------------------------------- collisions

  carWall(c) {
    const res = collideCity(this.city, c.x, c.y, c.radius);
    if (!res.bumped) return null;
    const dx = res.x - c.x, dy = res.y - c.y;
    const len = Math.hypot(dx, dy) || 1;
    return { nx: -dx / len, ny: -dy / len };
  }

  carContacts(dt, p) {
    // The player's car against everything else nearby; both sides take damage.
    const car = p.car;
    if (!car || car.wreck) return;
    const near = this.grid ? this.grid.near(car.x, car.y, 200, []) : [];
    for (const other of near) {
      if (!(other instanceof Car) || other === car || other.wasted) continue;
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
        this.audio.crash(Math.min(1, impact / 430));
        // A hard hit shoves the camera: shake with the crunch.
        if (impact > 260) this.shake = Math.min(10, this.shake + (impact - 260) / 44);
      }
    }
  }

  runOverCheck(p) {
    const car = p.car;
    if (!car || car.wreck) return;
    if (Math.hypot(car.vx, car.vy) < 60) return;
    const near = this.grid ? this.grid.near(car.x, car.y, 120, []) : [];
    for (const person of near) {
      if (person instanceof Car || person.mode === 'down' || person.graceT > 0) continue;
      if (dist2(person.x, person.y, car.x, car.y) < (car.radius + 8) ** 2) {
        const cop = person.isCop === true;
        const down = person.hurt(this, Math.hypot(car.vx, car.vy) * 0.4, car.x, car.y);
        this.wanted.add(down ? 'pedKill' : 'pedHit');
        this.fx.blood(person.x, person.y, 5);
        if (cop && down) this.wanted.add('copKill');
      }
    }
  }

  grabPickups(p) {
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
      seed: this.seed,
      money: p.money,
      missionIndex: this.missions.cursor,
      x: p.x, y: p.y,
      health: p.health, armor: p.armor, ammo: p.ammo, weapon: p.weapon,
      sound: this.audio.enabled,
    });
  }
}
