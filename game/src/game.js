// game.js — the Game object: state machine, wiring, systems tick, collisions,
// pickups, WASTED/BUSTED flows, save/load.

import { CFG, ctx, VERSION } from './config.js';
import { clamp, dist, TAU } from './util.js';
import { Input, KEYMAP } from './input.js';
import { buildWorld } from './world.js';
import { Car, TYPES, makeCar, collideCars } from './cars.js';
import { Traffic } from './traffic.js';
import { Ped, Peds } from './peds.js';
import { Player } from './player.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { Renderer } from './render.js';
import { Hud } from './hud.js';
import { Screens, loadSave, writeSave, deleteSave } from './screens.js';
import { AudioSys } from './audio.js';
import { Weapons } from './weapons.js';
import { Weather } from './weather.js';
import { Events } from './events.js';
import { currentShot, setupShot } from './shots.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.input = new Input(canvas);

    // world first (renderer's minimap snapshot needs it)
    ctx.world = buildWorld(1337);

    // state
    this.S = {
      mode: 'title',            // title | play | pause | wasted | busted
      time: 0,                  // game clock (s)
      playTime: 0,
      money: CFG.startMoney,
      flash: 0,
      fx: [],
      skidmarks: [],
      stats: {
        pedsDown: 0, copsDown: 0, jacked: 0, missions: 0,
        busted: 0, wasted: 0, earned: 0, distance: 0,
      },
    };
    ctx.S = this.S;
    ctx.game = this;
    // managers
    this.player = new Player(ctx.world.spawns.start.x, ctx.world.spawns.start.y);
    ctx.player = this.player;
    this.cars = [];
    ctx.cars = this.cars;
    this.pedsList = [];
    ctx.pedsList = this.pedsList;
    this.policeFootList = [];
    ctx.policeFootList = this.policeFootList;

    this.peds = new Peds();
    ctx.peds = this.peds;
    this.traffic = new Traffic();
    ctx.traffic = this.traffic;
    this.police = new Police();
    ctx.police = this.police;
    this.missions = new Missions();
    ctx.missions = this.missions;

    this.renderer = new Renderer(canvas);
    ctx.renderer = this.renderer;
    this.hud = new Hud();
    this.screens = new Screens();
    this.audio = new AudioSys();
    ctx.audio = this.audio;
    this.weapons = new Weapons();
    ctx.weapons = this.weapons;
    this.weather = new Weather();
    ctx.weather = this.weather;
    this.events = new Events();
    ctx.events = this.events;
    this.S.skidmarks = [];

    // keep player/missions reachable through the state object too
    this.S.player = this.player;
    this.S.missions = this.missions;

    // function hooks used by subsystems
    ctx.explodeAt = (x, y, power = 1) => this.explodeAt(x, y, power);
    ctx.subtitle = (text, dur = 2.5) => this.hud.pushSubtitle(text, dur);
    ctx.sfx = (name, x, y) => this.audio.play(name, x, y);

    // audio unlock on first gesture; M toggles mute
    this.input.onGesture = () => {
      this.audio.init();
      if (this.S.mode === 'play' && !this.audio.initedFlag) this.audio.initedFlag = true;
    };

    // parked cars + mission vehicles around the map
    this.spawnParkedCars();

    // staged screenshot scenario (if any)
    this.shotInfo = currentShot();
    setupShot(this, this.shotInfo);
    if (this.shotInfo && this.shotInfo.shot === 'start') {
      this.screens.buildMenu(this.S);
      this.screens.menuIdx = this.screens.menuItems.findIndex(i => i.act === 'new');
      if (this.screens.menuIdx < 0) this.screens.menuIdx = 0;
    }
  }

  // ------------------------------------------------------------ lifecycle --
  startNewGame() {
    const sp = ctx.world.spawns.start;
    this.player = new Player(sp.x, sp.y);
    ctx.player = this.player;
    this.S.player = this.player;
    this.S.mode = 'play';
    this.S.money = CFG.startMoney;
    this.S.playTime = 0;
    this.player.ammo = CFG.startAmmo;
    this.weapons = new Weapons();
    ctx.weapons = this.weapons;
    this.missions = new Missions();
    ctx.missions = this.missions;
    this.S.missions = this.missions;
    this.police.clear();
    this.hud.subtitle = null;
    this.hud.subtitle2 = null;
    ctx.subtitle('Vice Palms. Home of bad decisions.', 3.5);
    ctx.subtitle('Follow the yellow marker — Rico is waiting at the diner.', 5);
  }

  continueGame() {
    const save = loadSave();
    if (!save) { this.startNewGame(); return; }
    this.startNewGame();
    this.S.money = save.money || CFG.startMoney;
    this.player.x = save.x || ctx.world.spawns.start.x;
    this.player.y = save.y || ctx.world.spawns.start.y;
    this.player.health = save.health ?? CFG.playerMaxHealth;
    this.player.armor = save.armor || 0;
    this.player.ammo = save.ammo ?? CFG.startAmmo;
    this.missions.loadData(save.missions);
    if (save.weapons && ctx.weapons) ctx.weapons.loadData(save.weapons);
    this.S.playTime = save.playTime || 0;
    ctx.subtitle('Welcome back to the Palms.', 3);
  }

  saveGame() {
    const ok = writeSave(this.S);
    ctx.subtitle(ok ? 'Game saved.' : 'Save failed.', 2);
  }

  // -------------------------------------------------------------- respawn --
  onPlayerDeath(src) {
    if (this.S.mode !== 'play') return;
    this.missions.abort(this.S);
    const fee = Math.min(this.S.money, CFG.wastedFee);
    this.S.money -= fee;
    this.pendingFee = fee;
    this.S.mode = 'wasted';
    this.S.stats.wasted++;
    this.screens.startOverlay('wasted', fee);
    this.audio.play('explode', this.player.x, this.player.y);
    this.addBlood(this.player.x, this.player.y, 8);
  }

  onBusted() {
    if (this.S.mode !== 'play') return;
    this.missions.abort(this.S);
    const fee = Math.min(this.S.money, CFG.bustedFee);
    this.S.money -= fee;
    this.S.mode = 'busted';
    this.S.stats.busted++;
    this.screens.startOverlay('busted', fee);
  }

  respawn(mode) {
    const sp = mode === 'wasted' ? ctx.world.spawns.hospital : ctx.world.spawns.policeStation;
    this.player = new Player(sp.x, sp.y);
    ctx.player = this.player;
    this.S.player = this.player;
    this.player.ammo = Math.max(this.player.ammo, CFG.startAmmo);
    this.police.clear();
    this.S.mode = 'play';
    this.S.flash = 0;
    // pop the player out of any car
    ctx.subtitle(mode === 'wasted' ? 'Patched up at Vice General.' : 'Released from the 29th Precinct.', 3);
  }

  // ---------------------------------------------------------- world seeds --
  spawnParkedCars() {
    const w = ctx.world;
    const rng = (i) => {
      let h = Math.imul(i * 2654435761, 1013904223) | 0;
      return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
    };
    const types = ['sedan', 'sedan', 'taxi', 'van', 'pickup', 'sports', 'bus', 'limo'];
    // parked along curbs: a few per land block
    for (let bi = 0; bi < 8; bi++) {
      for (let bj = 0; bj < 7; bj++) {
        const z = this.zoneCenter(bi, bj);
        if (z === 'water' || z === 'park') continue;
        const n = (rng(bi * 31 + bj) * 2.2) | 0;
        for (let k = 0; k < n; k++) {
          const r1 = rng(bi * 131 + bj * 7 + k * 3);
          const r2 = rng(bi * 17 + bj * 211 + k);
          const r3 = rng(bi * 5 + bj * 91 + k * 17);
          // park on a horizontal or vertical road edge
          if (r1 < 0.5) {
            const j = bj + (r2 < 0.5 ? 0 : 1);
            const y = j * CFG.roadEvery + (r2 < 0.5 ? -32 : 32);
            const x = bi * CFG.roadEvery + 120 + r3 * 560;
            const car = makeCar(types[(r3 * types.length) | 0], x, y, r2 < 0.5 ? Math.PI : 0);
            this.cars.push(car);
          } else {
            const i = bi + (r2 < 0.5 ? 0 : 1);
            const x = i * CFG.roadEvery + (r2 < 0.5 ? -32 : 32);
            const y = bj * CFG.roadEvery + 120 + r3 * 560;
            const car = makeCar(types[(r3 * types.length) | 0], x, y, r2 < 0.5 ? -Math.PI / 2 : Math.PI / 2);
            this.cars.push(car);
          }
        }
      }
    }
    // a beached limo and a dockside bus for flavor
    const limo = makeCar('limo', 3450, 5560, 0);
    this.cars.push(limo);
    const bus = makeCar('bus', 5000, 1690, 0);
    this.cars.push(bus);
  }

  zoneCenter(bi, bj) {
    const x = bi * CFG.roadEvery + 400, y = bj * CFG.roadEvery + 400;
    if (y < CFG.waterTop || y > CFG.waterBottom) return 'water';
    if (y > CFG.beachTop) return 'beach';
    const p = CFG.park;
    if (x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1) return 'park';
    return 'land';
  }

  // ------------------------------------------------------------------ fx --
  addSparks(x, y, n = 4) {
    for (let i = 0; i < n; i++) {
      if (this.S.fx.length > CFG.fxMax) this.S.fx.shift();
      const a = Math.random() * TAU;
      const s = 60 + Math.random() * 160;
      this.S.fx.push({ type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + Math.random() * 0.3, life0: 0.6, size: 2 });
    }
  }

  addBlood(x, y, n = 5) {
    for (let i = 0; i < n; i++) {
      if (this.S.fx.length > CFG.fxMax) this.S.fx.shift();
      const a = Math.random() * TAU;
      const s = 20 + Math.random() * 60;
      this.S.fx.push({ type: 'blood', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.4, life0: 0.9, size: 3 + Math.random() * 3 });
    }
  }

  muzzle(x, y, ang) {
    this.S.fx.push({ type: 'muzzle', x, y, vx: 0, vy: 0, life: 0.09, life0: 0.09, size: 6 });
  }

  explodeAt(x, y, power = 1) {
    // visuals
    for (let i = 0; i < 10 * power; i++) {
      if (this.S.fx.length > CFG.fxMax) this.S.fx.shift();
      const a = Math.random() * TAU;
      const s = 40 + Math.random() * 220 * power;
      this.S.fx.push({
        type: 'boom', x: x + Math.cos(a) * 14 * Math.random(), y: y + Math.sin(a) * 14 * Math.random(),
        vx: Math.cos(a) * s * 0.4, vy: Math.sin(a) * s * 0.4,
        life: 0.5 + Math.random() * 0.4, life0: 0.9, size: 26 * power,
      });
    }
    this.S.fx.push({ type: 'ring', x, y, vx: 0, vy: 0, life: 0.6, life0: 0.6, size: 60 * power });
    this.S.flash = Math.min(1, 0.55 * power);
    this.renderer.shakeCam(0.9 * power);
    this.audio.play('explode', x, y);

    // area damage
    const R = 150 * power;
    for (const car of this.cars) {
      if (car.dead) continue;
      const d = dist(car.x, car.y, x, y);
      if (d < R) car.impact((1 - d / R) * 90 * power);
    }
    for (const p of this.pedsList) {
      if (p.dead) continue;
      const d = dist(p.x, p.y, x, y);
      if (d < R) {
        const killed = p.hurt((1 - d / R) * 120);
        if (killed) this.onPedKilled(p, 'explosion');
      }
    }
    for (const f of this.policeFootList) {
      if (f.dead) continue;
      const d = dist(f.x, f.y, x, y);
      if (d < R && f.hurt((1 - d / R) * 120)) this.onCopKilled(f);
    }
    const pd = dist(this.player.x, this.player.y, x, y);
    if (pd < R) this.player.damage((1 - pd / R) * 80 * power, 'explosion');
    this.peds.panic(x, y, 500);
  }

  // ------------------------------------------------------------- events ---
  spawnFleeingPed(x, y) {
    const p = new Ped(x, y);
    p.fleeFrom(x + 1, y + 1);
    this.pedsList.push(p);
    return p;
  }

  onPedKilled(ped, src) {
    this.police.crime(2.0, ped.x, ped.y);
    this.S.stats.pedsDown++;
    ctx.subtitle(src === 'car' ? 'Hit and run!' : 'You killed a civilian!', 2);
  }

  onCopKilled(cop) {
    this.police.crime(3.5, cop.x, cop.y);
    this.S.stats.copsDown++;
  }

  // ---------------------------------------------------------------- tick --
  update(dt) {
    const S = this.S;
    this.input.pollGamepad();
    this.input.updateWorldMouse(this.renderer.cam);

    // global keys
    if (this.input.hit('KeyM')) this.audio.toggleMute();
    if (S.mode === 'play' && this.input.hit('Escape')) { S.mode = 'pause'; this.screens.menuIdx = 0; }
    else if (S.mode === 'pause' && this.input.hit('Escape')) S.mode = 'play';

    switch (S.mode) {
      case 'title':
      case 'pause':
        this.screens.update(dt, S, this.input);
        // world keeps breathing underneath
        this.simWorld(dt, 0.5);
        break;
      case 'play': {
        S.playTime += dt;
        // going down with the ship: exploding car kills the driver
        if (this.player.inCar && this.player.inCar.dead) {
          const wasIn = this.player.inCar;
          this.player.inCar = null;
          this.player.x = wasIn.x; this.player.y = wasIn.y;
          this.player.damage(150, 'explosion');
        }
        this.player.update(dt, S, this.input);
        this.weapons.update(dt, S, this.input);
        this.weather.update(dt, S);
        this.events.update(dt, S);
        this.simWorld(dt, 1);
        // pickups
        this.updatePickups(dt);
        // missions
        this.missions.update(dt, S);
        this.missions.tryGarage(S);        // police
        this.police.update(dt, S);
        // car-vs-car
        this.carPairs();
        break;
      }
      case 'wasted':
      case 'busted':
        this.screens.update(dt, S, this.input);
        this.simWorld(dt, 0.35);
        break;
    }

    // fx always
    this.updateFx(dt);
    S.flash = Math.max(0, S.flash - dt * 2.2);
    this.hud.update(dt);
    this.audio.update(dt, S);

    this.input.endFrame();
  }

  simWorld(dt, scale) {
    const S = this.S;
    S.time += dt * scale;
    // traffic + peds spawn/update
    this.peds.update(dt, S);
    // traffic AI
    ctx.traffic.update(dt, S);
    // npc cars physics for police/parked handled by their drivers:
    for (const car of this.cars) {
      if (car.dead) {
        car.updateDamage(dt);
        continue;
      }
      if (car.driver === 'player') continue;          // player drives in player.update
      if (car.ai === 'traffic') continue;             // driven by traffic system
      if (car.ai === 'police') continue;              // driven by police system
      // parked: no physics but still decays damage/fire
      car.updateDamage(dt);
      if (car.burning > 0) {
        // burning parked cars pop
        if (Math.random() < dt * 8) {
          this.S.fx.push({ type: 'fire', x: car.x + (Math.random() - 0.5) * 20, y: car.y + (Math.random() - 0.5) * 12, vx: 0, vy: -30, life: 0.4, life0: 0.4, size: 5 });
        }
      }
      if (car.smoke && Math.random() < dt * 4) {
        this.S.fx.push({ type: 'smoke', x: car.x, y: car.y, vx: (Math.random() - 0.5) * 16, vy: -14 - Math.random() * 16, life: 1.4, life0: 1.4, size: 5 });
      }
    }
    // ped-vs-car: run over check
    this.pedVsCars();
  }

  pedVsCars() {
    for (const p of this.pedsList) {
      if (p.dead) continue;
      for (const car of this.cars) {
        if (car.dead || car.wreckT > 0) continue;
        const sp = car.speed;
        if (sp < 60) continue;
        const d = dist(p.x, p.y, car.x, car.y);
        if (d < car.spec.l * 0.45) {
          const killed = p.hurt(sp);
          this.addBlood(p.x, p.y, 6);
          if (killed) {
            const byPlayer = car.driver === 'player';
            if (byPlayer) this.onPedKilled(p, 'car');
            this.peds.panic(p.x, p.y, 260);
          } else {
            p.fleeFrom(car.x, car.y);
            if (car.driver === 'player') this.police.crime(0.8, p.x, p.y);
          }
          if (car.driver === 'player' && ctx.sfx) ctx.sfx('crash', p.x, p.y);
          break;
        }
      }
    }
    // foot cops vs cars
    for (const f of this.policeFootList) {
      if (f.dead) continue;
      for (const car of this.cars) {
        if (car.dead || car.wreckT > 0 || car.speed < 60) continue;
        if (dist(f.x, f.y, car.x, car.y) < car.spec.l * 0.45) {
          if (f.hurt(car.speed)) {
            if (car.driver === 'player') this.onCopKilled(f);
          }
          this.addBlood(f.x, f.y, 6);
          break;
        }
      }
    }
  }

  carPairs() {
    const cars = this.cars;
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i];
      if (a.dead && a.wreckT <= 0) continue;
      for (let j = i + 1; j < cars.length; j++) {
        const b = cars[j];
        if (b.dead && b.wreckT <= 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const rr = (a.spec.l + b.spec.l) * 0.3;
        if (dx * dx + dy * dy < rr * rr) {
          const wasCopA = a.ai === 'police', wasCopB = b.ai === 'police';
          collideCars(a, b);
          // police cruiser destroyed by the player?
          if (wasCopA && a.dead && a.wreckT > 0 && b.driver === 'player') this.police.copCarDestroyed(a);
          if (wasCopB && b.dead && b.wreckT > 0 && a.driver === 'player') this.police.copCarDestroyed(b);
        }
      }
    }
    // player's car vs peds handled in pedVsCars; remove exploded husks
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      if (c.dead && c.wreckT <= 0) this.cars.splice(i, 1);
    }
  }

  updatePickups(dt) {
    const p = this.player;
    for (const pk of ctx.world.pickups) {
      if (pk.taken > 0) {
        pk.taken -= dt;
        continue;
      }
      if (dist(p.x, p.y, pk.x, pk.y) < 30) {
        pk.taken = 30;      // respawn in 30 s
        this.audio.play('pickup', pk.x, pk.y);
        switch (pk.type) {
          case 'health': p.health = CFG.playerMaxHealth; ctx.subtitle('Health restored.', 1.4); break;
          case 'armor': p.armor = CFG.playerMaxArmor; ctx.subtitle('Body armor!', 1.4); break;
          case 'ammo': p.ammo += 24; ctx.weapons.give('pistol', 0); ctx.weapons.ammo.pistol += 24; ctx.subtitle('+24 rounds', 1.4); break;
          case 'shotgun': ctx.weapons.give('shotgun', 12); ctx.subtitle('Shotgun + 12 shells', 2); break;
          case 'smg': ctx.weapons.give('smg', 60); ctx.subtitle('SMG + 60 rounds', 2); break;
          case 'cash': {
            const amt = 120 + ((Math.random() * 260) | 0);
            this.S.money += amt;
            ctx.subtitle('Picked up ' + '$' + amt, 1.4);
            break;
          }
        }
      }
    }
  }

  updateFx(dt) {
    const fx = this.S.fx;
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.life -= dt;
      if (f.life <= 0) { fx.splice(i, 1); continue; }
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.type === 'smoke') { f.vy -= 10 * dt; f.vx *= 1 - dt; }
      if (f.type === 'spark' || f.type === 'blood' || f.type === 'boom') { f.vx *= 1 - 3 * dt; f.vy *= 1 - 3 * dt; }
    }
    // skidmarks fade
    const sk = this.S.skidmarks;
    for (let i = sk.length - 1; i >= 0; i--) {
      sk[i].life -= dt;
      if (sk[i].life <= 0) sk.splice(i, 1);
    }
    // distance travelled stat
    const st = this.S.stats;
    const p2 = this.player;
    if (p2.inCar) st.distance += p2.inCar.speed * dt;
  }

  // --------------------------------------------------------------- frame --
  frame(dt) {
    this.update(dt);
    const S = this.S;
    this.renderer.updateCamera(dt, S);
    this.renderer.draw(S);
    if (S.mode === 'play') {
      this.hud.draw(this.renderer.g, S);
    }
    this.screens.draw(this.renderer.g, S);
  }
}
