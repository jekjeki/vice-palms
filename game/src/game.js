// Vice Palms — game state machine: owns the world, entities, FX, save data.

import { buildWorld, circleResolve } from './world.js';
import { makeCar, spawnParked, updateCarPhysics, carCarCollide, boomDamage, damageCar, explodeCar } from './cars.js';
import { spawnTraffic, updateTraffic, updateMissionCars, panicTraffic } from './traffic.js';
import { spawnPeds, updatePeds, fleePeds, knockPed } from './peds.js';
import { makePlayer, attachPlayerGame, updatePlayer } from './player.js';
import { makePolice, updatePolice, addCrime, clearWanted, sirenNear } from './police.js';
import { makeMissions, updateMissions, activeMarkers } from './missions.js';
import { makeScreens, updateScreens, drawScreens } from './screens.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { makeWeather, updateWeather, gripMult } from './weather.js';
import { makeTrain, updateTrain } from './train.js';
import { heliHit } from './police.js';
import { SAVE_KEY, PLAYER, POLICE, FX, PHYS, KEYS, WEATHER, SHOPS } from './config.js';
import { dist } from './util.js';

export class Game {
  constructor(canvas, opts = {}) {
    this.opts = opts;
    this.seed = opts.seed || 7;
    this.input = new Input(canvas);
    this.audio = new AudioSys();
    this.screens = makeScreens();
    this.cam = { x: 3000, y: 3000, shake: 0, flash: 0 };
    this.time = 0;
    this.frame = 0;
    this.fx = { parts: [], bullets: [] };
    this.pickups = [];
    this.markers = [];
    this.sub = null;
    this.police = makePolice();
    this.missions = makeMissions();
    this.weather = makeWeather();
    this.train = makeTrain();
    this.gripK = 1;
    this.render = null;
    this.shot = opts.shot || null;
    this.stats = { kills: 0, carsWrecked: 0, moneyEarned: 0, distance: 0, missionsDone: 0 };

    // living title-screen city
    this.world = buildWorld(this.seed);
    this.cars = [];
    this.peds = [];
    this.player = makePlayer(3000, 3022);
    attachPlayerGame(this);
    this.player.game = this;
    this.populateWorld();

    // array helpers so modules can call game.peds.flee(...) / game.peds.knock(...)
    this.peds.flee = (x, y, r) => fleePeds(this, x, y, r);
    this.peds.knock = (p, vx, vy, src) => knockPed(this, p, vx, vy, src);
  }

  setRender(r) {
    this.render = r;
  }

  populateWorld() {
    for (const spot of this.world.parkedSpots) spawnParked(this, spot);
    spawnTraffic(this);
    spawnPeds(this);
    // static pickups
    const sp = this.world.spawns;
    this.pickups.push(
      { x: sp.hospital.x + 30, y: sp.hospital.y - 10, kind: 'health', t: 0, taken: 0 },
      { x: sp.police.x + 30, y: sp.police.y - 10, kind: 'armor', t: 0, taken: 0 },
      { x: sp.safehouse.x - 30, y: sp.safehouse.y + 40, kind: 'ammo', t: 0, taken: 0 },
      { x: sp.parkstage.x + 60, y: sp.parkstage.y - 30, kind: 'cash', val: 60, t: 0, taken: 0 },
      { x: sp.airfieldtower.x - 40, y: sp.airfieldtower.y + 50, kind: 'cash', val: 80, t: 0, taken: 0 },
    );
  }

  // ------------------------------------------------------------- lifecycle

  newGame() {
    this.world = buildWorld(this.seed);
    this.cars = [];
    this.peds = [];
    this.pickups = [];
    this.fx.parts.length = 0;
    this.fx.bullets.length = 0;
    this.police = makePolice();
    this.missions = makeMissions();
    this.train = makeTrain();
    this.stats = { kills: 0, carsWrecked: 0, moneyEarned: 0, distance: 0, missionsDone: 0 };
    const sp = this.world.spawns.intro;
    this.player = makePlayer(sp.x, sp.y);
    attachPlayerGame(this);
    this.player.game = this;
    this.peds.flee = (x, y, r) => fleePeds(this, x, y, r);
    this.peds.knock = (p, vx, vy, src) => knockPed(this, p, vx, vy, src);
    this.cam.x = sp.x;
    this.cam.y = sp.y;
    this.cam.shake = 0;
    this.cam.flash = 0;
    this.populateWorld();
    this.sub = null;
  }

  // ------------------------------------------------------------- save data

  loadRaw() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  continueGame() {
    const raw = this.loadRaw();
    if (!raw) return false;
    this.newGame();
    this.missions.storyIdx = clampInt(raw.storyIdx || 0, 0, 6);
    this.player.money = raw.money !== undefined ? raw.money : 500;
    this.player.armor = raw.armor || 0;
    if (raw.ammo && typeof raw.ammo === 'object') this.player.ammo = raw.ammo;
    this.player.weapon = raw.weapon || 1;
    if (Array.isArray(raw.owned) && raw.owned.length) this.player.owned = raw.owned;
    const sp = this.world.spawns.safehouse;
    this.player.x = sp.x;
    this.player.y = sp.y;
    this.cam.x = sp.x;
    this.cam.y = sp.y;
    return true;
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        seed: this.seed,
        storyIdx: this.missions.storyIdx,
        money: Math.round(this.player.money),
        armor: Math.round(this.player.armor),
        ammo: this.player.ammo,
        weapon: this.player.weapon,
        owned: this.player.owned,
      }));
    } catch { /* storage full or blocked */ }
  }

  deleteSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    this.subtitle('Save deleted.', 2);
  }

  // ------------------------------------------------------------- update

  update(dt) {
    this.time += dt;
    this.frame++;
    this.input.pollPad(dt);

    updateScreens(this, dt);
    if (this.input.pressed(KEYS.mute)) {
      const m = this.audio.toggleMute();
      try { localStorage.setItem('vicepalms.mute', m ? '1' : '0'); } catch { /* ignore */ }
      this.subtitle(m ? 'Audio muted' : 'Audio on', 1.2);
    }
    if (this.input.pressed(KEYS.radio)) {
      const name = this.audio.nextStation();
      this.subtitle('Radio: ' + name, 2);
    }

    // weather + train run in every live mode
    if (this.screens.mode === 'playing' || this.screens.mode === 'title') {
      updateWeather(this, dt);
      updateTrain(this, dt);
      this.gripK = gripMult(this.weather);
    }

    const mode = this.screens.mode;
    if (mode === 'playing' || mode === 'title') {
      this.updateCity(dt, mode === 'title');
    }
    if (mode === 'playing') {
      updatePlayer(this, dt);
      updatePolice(this, dt);
      updateMissions(this, dt);
      this.markers = activeMarkers(this);
    } else if (mode === 'title') {
      this.markers = [];
      // gentle attract-mode drift of the dummy player keeps traffic alive
      this.player.x = 3000 + Math.cos(this.time * 0.05) * 400;
      this.player.y = 3022;
    }

    this.updateFX(dt);
    this.updatePickups(dt);

    // audio state
    const p = this.player;
    if (mode === 'playing' && p.inCar && !p.inCar.dead) {
      this.audio.engine(true, Math.min(1, Math.abs(p.inCar.speed) / p.inCar.spec.max));
    } else {
      this.audio.engine(false, 0);
    }
    this.audio.siren(mode === 'playing' && sirenNear(this));
    this.audio.tickMusic(dt, this.time);

    this.input.endFrame();
  }

  /** World simulation shared by play and title-attract modes. */
  updateCity(dt, attract) {
    updateTraffic(this, dt);
    updateMissionCars(this, dt);
    for (const c of this.cars) {
      if (c.role === 'player' && !attract) continue;
      if (c.dead) { c.throttle = 0; c.steer = 0; }
      updateCarPhysics(this, c, dt);
    }
    carCarCollide(this);
    updatePeds(this, dt);
    // clean up burnt-out wrecks
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      if (c.dead && c.deadT > 9) this.cars.splice(i, 1);
      else if (c.despawn) this.cars.splice(i, 1);
    }
  }

  // ------------------------------------------------------------- FX API

  addPart(x, y, vx, vy, life, size, type) {
    if (this.fx.parts.length > 420) this.fx.parts.shift();
    this.fx.parts.push({ x, y, vx, vy, life, max: life, size, type });
  }

  spark(x, y, n, col) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 130;
      this.addPart(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.3 + Math.random() * 0.25, 2.5, 'spark');
    }
  }

  explode(x, y, power) {
    this.cam.flash = Math.min(1.2, this.cam.flash + 0.9 * power);
    this.cam.shake = Math.min(22, this.cam.shake + 14 * power);
    this.audio.explosion();
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 30 + Math.random() * 190;
      this.addPart(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.5 + Math.random() * 0.5, 6 + Math.random() * 6, 'fire');
    }
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 20 + Math.random() * 70;
      this.addPart(x, y, Math.cos(a) * s, Math.sin(a) * s - 30, 0.9 + Math.random() * 0.7, 7, 'smoke');
    }
    this.addPart(x, y, 0, 0, 0.42, 12, 'flash');
    boomDamage(this, x, y);
    // chain reactions: burning cars close to the blast go up almost at once
    for (const c of this.cars) {
      if (!c.dead && c.onFire && dist(c.x, c.y, x, y) < FX.boomRadius * 0.7) {
        c.burnT = Math.max(c.burnT, PHYS.burnTime - 0.5);
      }
    }
  }

  addBullet(x, y, angle, from, range) {
    this.fx.bullets.push({
      x, y,
      vx: Math.cos(angle) * PLAYER.bulletSpeed,
      vy: Math.sin(angle) * PLAYER.bulletSpeed,
      life: range || PLAYER.bulletLife,
      from,
    });
  }

  subtitle(txt, dur) {
    this.sub = { txt, t: dur || 3 };
  }

  banner(txt, sub, col, dur) {
    this.missions.banner = { txt, sub, col: col || COLORS_gold, t: dur || 4.4 };
  }

  addCrime(n) {
    addCrime(this, n);
  }

  /** Ammu-Nation auto-buy (walk into the G marker). */
  playerShop() {
    const p = this.player;
    const S = SHOPS;
    if (!p.owned.includes(2) && p.money >= S.smgPrice) {
      p.money -= S.smgPrice;
      p.owned.push(2);
      p.ammo[2] = (p.ammo[2] || 0) + 60;
      p.weapon = 2;
      this.subtitle('Bought the SMG — hold fire to empty it.', 3);
    } else if (!p.owned.includes(3) && p.money >= S.shotgunPrice) {
      p.money -= S.shotgunPrice;
      p.owned.push(3);
      p.ammo[3] = (p.ammo[3] || 0) + 16;
      p.weapon = 3;
      this.subtitle('Bought the shotgun. Doors not included.', 3);
    } else if (p.weapon === 2 && p.money >= S.smgAmmoPrice && p.ammo[2] < 240) {
      p.money -= S.smgAmmoPrice;
      p.ammo[2] = Math.min(240, p.ammo[2] + 60);
      this.subtitle('+60 SMG rounds.', 2);
    } else if (p.armor < 100 && p.money >= S.armorPrice) {
      p.money -= S.armorPrice;
      p.armor = 100;
      this.subtitle('Body armor equipped.', 2);
    } else if (p.hp < PLAYER.hp && p.money >= S.healthPrice) {
      p.money -= S.healthPrice;
      p.hp = PLAYER.hp;
      this.subtitle('Patched up at Ammu-Nation.', 2);
    } else {
      this.subtitle("Ammu-Nation: nothing you can afford right now.", 2.4);
      return;
    }
    this.audio.pickup();
    this.stats.moneyEarned -= 0; // purchases tracked in money
  }

  /** Pay 'n' Spray (drive into the S marker): repaint + repair + cool the heat. */
  playerSpray() {
    const p = this.player;
    const c = p.inCar;
    if (this.police.wanted === 0 && c && c.hp >= c.maxHp) {
      this.subtitle('Pay \'n\' Spray: she looks fine to me.', 2);
      return;
    }
    if (p.money < SHOPS.sprayPrice) {
      this.subtitle("Pay 'n' Spray: costs $" + SHOPS.sprayPrice + ". Come back with cash.", 2);
      return;
    }
    p.money -= SHOPS.sprayPrice;
    if (c) {
      c.hp = c.maxHp;
      c.onFire = false;
      c.burnT = 0;
      c.color = c.spec.cols[(Math.random() * c.spec.cols.length) | 0];
    }
    clearWanted(this);
    this.police.heat = 0;
    this.subtitle("Resprayed and cooled down. That's -$" + SHOPS.sprayPrice + ".", 3);
    this.audio.pickup();
  }

  trafficPanic(x, y, r) {
    panicTraffic(this, x, y, r);
  }

  gameOver(kind) {
    if (this.shot) return; // staged scenes stay put for the camera
    this.screens.mode = kind;
    this.screens.t = 0;
    this.audio.engine(false, 0);
    this.audio.jingle(false);
  }

  respawn(kind) {
    const p = this.player;
    const fee = kind === 'wasted' ? POLICE.wastedFee : POLICE.bustedFee;
    p.money = Math.max(0, p.money - fee);
    p.hp = PLAYER.hp;
    p.dead = false;
    p.inCar = null;
    p.hurtT = 0;
    const sp = kind === 'wasted' ? this.world.hospitalPos : this.world.policePos;
    p.x = sp.x;
    p.y = sp.y;
    this.cam.x = sp.x;
    this.cam.y = sp.y;
    clearWanted(this);
    this.subtitle(kind === 'wasted' ? 'Patched up. That cost ' + '$' + fee + '.' : 'Busted and bailed out for $' + fee + '.', 3.2);
  }

  // ------------------------------------------------------------- fx + pickups

  updateFX(dt) {
    if (this.hornT > 0) this.hornT -= dt;
    const parts = this.fx.parts;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.type === 'smoke') { p.vx *= 1 - 0.6 * dt; p.vy -= 12 * dt; }
      else if (p.type === 'fire') { p.vx *= 1 - 1.8 * dt; p.vy *= 1 - 1.8 * dt; }
      else if (p.type === 'spark') { p.vx *= 1 - 3 * dt; p.vy *= 1 - 3 * dt; }
    }
    for (let i = this.fx.bullets.length - 1; i >= 0; i--) {
      const b = this.fx.bullets[i];
      b.life -= dt;
      if (b.life <= 0) { this.fx.bullets.splice(i, 1); continue; }
      const steps = 2;
      let hit = false;
      for (let s = 0; s < steps && !hit; s++) {
        b.x += (b.vx * dt) / steps;
        b.y += (b.vy * dt) / steps;
        hit = this.bulletHit(b);
      }
      if (hit) this.fx.bullets.splice(i, 1);
    }
  }

  bulletHit(b) {
    // the helicopter, if up
    if (b.from === 'player' && heliHit(this, b)) return true;
    // solids
    const res = circleResolve(this.world, b.x, b.y, 2);
    if (res.hit) {
      this.spark(b.x, b.y, 3, null);
      return true;
    }
    // cars
    for (const c of this.cars) {
      if (c.dead) continue;
      const d = dist(b.x, b.y, c.x, c.y);
      if (d < c.spec.l * 0.44) {
        damageCar(this, c, PLAYER.pistolDmg * 0.8, b.from === 'player' ? 'player' : 'cop');
        this.spark(b.x, b.y, 3, null);
        if (c.role === 'traffic' && c.ai) c.ai.panic = 6;
        return true;
      }
    }
    // peds
    for (const q of this.peds) {
      if (q.state === 'down') continue;
      if (dist(b.x, b.y, q.x, q.y) < 10) {
        if (q.kind === 'cop' && q.hp <= PLAYER.pistolDmg) this.peds.knock(q, b.vx * 0.2, b.vy * 0.2, 'bullet');
        else if (q.kind === 'cop') { q.hp -= PLAYER.pistolDmg; this.spark(b.x, b.y, 2, null); this.addCrime(0.8); }
        else this.peds.knock(q, b.vx * 0.2, b.vy * 0.2, 'bullet');
        return true;
      }
    }
    // player
    const p = this.player;
    if (b.from === 'cop') {
      if (p.inCar) {
        if (dist(b.x, b.y, p.inCar.x, p.inCar.y) < p.inCar.spec.l * 0.44) {
          damageCar(this, p.inCar, 8, 'cop');
          this.spark(b.x, b.y, 2, null);
          p.hurt(4, 'cop');
          return true;
        }
      } else if (dist(b.x, b.y, p.x, p.y) < 12) {
        p.hurt(11, 'cop');
        this.spark(b.x, b.y, 3, null);
        return true;
      }
    }
    return false;
  }

  updatePickups(dt) {
    const p = this.player;
    for (const pk of this.pickups) {
      if (pk.taken > 0) {
        pk.taken -= dt;
        continue;
      }
      if (this.screens.mode !== 'playing') continue;
      if (dist(p.x, p.y, pk.x, pk.y) < 22) {
        let used = true;
        if (pk.tag === 'mission') {
          used = true;
        } else if (pk.kind === 'cash') {
          p.money += pk.val || 40;
          this.subtitle('+' + '$' + (pk.val || 40), 1.2);
        } else if (pk.kind === 'health') {
          if (p.hp >= PLAYER.hp) used = false;
          else p.hp = Math.min(PLAYER.hp, p.hp + 30);
        } else if (pk.kind === 'armor') {
          if (p.armor >= 100) used = false;
          else p.armor = Math.min(100, p.armor + 50);
        } else if (pk.kind === 'ammo') {
          if (p.ammo >= 90) used = false;
          else {
            p.ammo = Math.min(90, p.ammo + 12);
            this.subtitle('+12 rounds', 1.2);
          }
        }
        if (used) {
          this.audio.pickup();
          if (pk.tag === 'mission') this.spark(pk.x, pk.y, 6, null);
          pk.taken = 30;
        }
      }
    }
  }
}

function clampInt(v, a, b) {
  v = Math.round(v);
  return v < a ? a : v > b ? b : v;
}

const COLORS_gold = '#ffd12d';
